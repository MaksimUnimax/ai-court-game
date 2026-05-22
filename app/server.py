import base64
import io
import json
import mimetypes
import posixpath
import zipfile
from email import policy
from email.parser import BytesParser
from copy import deepcopy
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = REPO_ROOT / "static"
SCENARIO_DIR = REPO_ROOT / "scenarios"
DEMO_SCENARIO_PATH = SCENARIO_DIR / "demo_case.json"
HOST = "0.0.0.0"
PORT = 8000
MAX_CASE_PACKAGE_BYTES = 50 * 1024 * 1024
MAX_CASE_PACKAGE_UNCOMPRESSED_BYTES = 120 * 1024 * 1024
MAX_CASE_PACKAGE_FILES = 120

REQUIRED_TOP_LEVEL_KEYS = {
    "metadata",
    "case_intro",
    "participants",
    "relationships",
    "evidence",
    "dialogue_actions",
    "verdicts",
    "solution",
}
SUPPORTED_CONDITION_TYPES = {
    "always",
    "action_done",
    "question_asked",
    "evidence_opened",
    "fact_discovered",
    "contradiction_found",
    "verdict_enabled",
}
SUPPORTED_EFFECT_TYPES = {
    "mark_action_done",
    "unlock_question",
    "unlock_evidence",
    "discover_fact",
    "mark_contradiction",
    "show_note",
    "enable_verdict",
}
SUPPORTED_VISUAL_ASSET_TYPES = {
    "participant_portrait",
    "scene",
    "object",
    "cover",
}
SUPPORTED_VISUAL_TARGET_TYPES = {
    "participant",
    "scene",
    "case",
    "object",
}
SUPPORTED_PACKAGE_IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".svg",
}


def load_demo_scenario():
    return json.loads(DEMO_SCENARIO_PATH.read_text(encoding="utf-8"))


def normalize_package_path(path):
    if not path:
        return None
    normalized = str(path).replace("\\", "/").strip()
    if not normalized or normalized.startswith("/"):
        return None
    parts = []
    for segment in normalized.split("/"):
        if segment in ("", "."):
            continue
        if segment == "..":
            return None
        parts.append(segment)
    if not parts:
        return None
    return "/".join(parts)


def is_supported_package_image(filename):
    return Path(filename.lower()).suffix in SUPPORTED_PACKAGE_IMAGE_EXTENSIONS


def guess_mime_type(filename):
    ext = Path(filename.lower()).suffix
    if ext == ".svg":
        return "image/svg+xml"
    return mimetypes.guess_type(filename)[0] or "application/octet-stream"


def make_data_url(filename, content):
    mime_type = guess_mime_type(filename)
    encoded = base64.b64encode(content).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def normalize_payload(payload):
    if isinstance(payload, dict) and "scenario" in payload:
        return payload["scenario"]
    return payload


def normalize_scenario(scenario):
    normalized = deepcopy(scenario)
    normalized.setdefault("relationships", [])
    normalized.setdefault("visual_assets", [])

    for participant in normalized.get("participants", []):
        participant.setdefault("relationships", [])

    for evidence in normalized.get("evidence", []):
        evidence.setdefault("effects", [])
        evidence.setdefault("available_at_start", False)
        evidence.setdefault("visible_at_start", evidence["available_at_start"])

    for action in normalized.get("dialogue_actions", []):
        action.setdefault("effects", [])
        action.setdefault("available_at_start", False)
        action.setdefault("visible_at_start", action["available_at_start"])

    for verdict in normalized.get("verdicts", []):
        verdict.setdefault("available_at_start", False)
        verdict.setdefault("available_if", {"type": "always"})

    solution = normalized.setdefault("solution", {})
    if "correct_verdict_id" not in solution:
        correct = [item["id"] for item in normalized.get("verdicts", []) if item.get("correct")]
        if len(correct) == 1:
            solution["correct_verdict_id"] = correct[0]
    return normalized


def build_initial_state(scenario):
    return {
        "completed_actions": [],
        "asked_questions": [],
        "opened_evidence": [],
        "discovered_facts": [],
        "found_contradictions": [],
        "unlocked_questions": [
            item["id"] for item in scenario.get("dialogue_actions", []) if item.get("visible_at_start")
        ],
        "unlocked_evidence": [
            item["id"] for item in scenario.get("evidence", []) if item.get("visible_at_start")
        ],
        "enabled_verdicts": [
            item["id"] for item in scenario.get("verdicts", []) if item.get("available_at_start")
        ],
        "selected_verdict": None,
        "finished": False,
        "event_log": [],
        "notes": [],
    }


def validate_required_fields(name, item, fields, errors):
    for field in fields:
        if field not in item or item[field] in ("", None):
            errors.append(f"{name}: missing required field '{field}'")


def collect_unique_ids(items, label, errors):
    seen = set()
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"{label}[{index}] must be an object")
            continue
        item_id = item.get("id")
        if not item_id:
            errors.append(f"{label}[{index}] is missing 'id'")
            continue
        if item_id in seen:
            errors.append(f"{label} contains duplicate id '{item_id}'")
            continue
        seen.add(item_id)
    return seen


def validate_condition(condition, refs, errors, path):
    if not condition:
        return
    if not isinstance(condition, dict):
        errors.append(f"{path} must be an object")
        return
    if "all" in condition:
        if not isinstance(condition["all"], list) or not condition["all"]:
            errors.append(f"{path}.all must be a non-empty list")
            return
        for index, child in enumerate(condition["all"]):
            validate_condition(child, refs, errors, f"{path}.all[{index}]")
        return
    if "any" in condition:
        if not isinstance(condition["any"], list) or not condition["any"]:
            errors.append(f"{path}.any must be a non-empty list")
            return
        for index, child in enumerate(condition["any"]):
            validate_condition(child, refs, errors, f"{path}.any[{index}]")
        return
    if "not" in condition:
        validate_condition(condition["not"], refs, errors, f"{path}.not")
        return

    condition_type = condition.get("type")
    if condition_type not in SUPPORTED_CONDITION_TYPES:
        errors.append(f"{path} uses unsupported condition type '{condition_type}'")
        return
    if condition_type == "always":
        return

    key_by_type = {
        "action_done": ("action_id", refs["actions"]),
        "question_asked": ("question_id", refs["actions"]),
        "evidence_opened": ("evidence_id", refs["evidence"]),
        "fact_discovered": ("fact_id", None),
        "contradiction_found": ("contradiction_id", None),
        "verdict_enabled": ("verdict_id", refs["verdicts"]),
    }
    key, valid_ids = key_by_type[condition_type]
    value = condition.get(key)
    if not value:
        errors.append(f"{path} missing '{key}'")
        return
    if valid_ids is not None and value not in valid_ids:
        errors.append(f"{path} references unknown {key} '{value}'")


def validate_effect(effect, refs, errors, path):
    if not isinstance(effect, dict):
        errors.append(f"{path} must be an object")
        return
    effect_type = effect.get("type")
    if effect_type not in SUPPORTED_EFFECT_TYPES:
        errors.append(f"{path} uses unsupported effect type '{effect_type}'")
        return

    key_by_type = {
        "unlock_question": ("question_id", refs["actions"]),
        "unlock_evidence": ("evidence_id", refs["evidence"]),
        "enable_verdict": ("verdict_id", refs["verdicts"]),
        "discover_fact": ("fact_id", None),
        "mark_contradiction": ("contradiction_id", None),
        "show_note": ("note", None),
        "mark_action_done": ("action_id", refs["actions"]),
    }
    key, valid_ids = key_by_type[effect_type]
    if effect_type == "mark_action_done" and key not in effect:
        return
    value = effect.get(key)
    if not value:
        errors.append(f"{path} missing '{key}'")
        return
    if valid_ids is not None and value not in valid_ids:
        errors.append(f"{path} references unknown {key} '{value}'")


def validate_visual_asset(asset, participant_ids, errors, path):
    if not isinstance(asset, dict):
        errors.append(f"{path} must be an object")
        return

    validate_required_fields(path, asset, ["id", "type", "file"], errors)

    asset_type = asset.get("type")
    if asset_type not in SUPPORTED_VISUAL_ASSET_TYPES:
        errors.append(f"{path} uses unsupported visual asset type '{asset_type}'")

    target_type = asset.get("target_type")
    placement = asset.get("placement")
    if not target_type and not placement:
        errors.append(f"{path} must define either target_type or placement")
    if target_type and target_type not in SUPPORTED_VISUAL_TARGET_TYPES:
        errors.append(f"{path} uses unsupported target_type '{target_type}'")
    if target_type == "participant":
        target_id = asset.get("target_id")
        if not target_id:
            errors.append(f"{path} missing 'target_id'")
        elif target_id not in participant_ids:
            errors.append(f"{path} references unknown target_id '{target_id}'")


def parse_multipart_form_data(headers, raw_body):
    content_type = headers.get("Content-Type")
    if not content_type or "multipart/form-data" not in content_type:
        raise ValueError("Expected multipart/form-data request")

    parser = BytesParser(policy=policy.default)
    message = parser.parsebytes(
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8") + raw_body
    )

    files = []
    for part in message.iter_parts():
        disposition = part.get_content_disposition()
        if disposition != "form-data":
            continue
        filename = part.get_filename()
        name = part.get_param("name", header="content-disposition")
        content = part.get_payload(decode=True) or b""
        files.append({"name": name, "filename": filename, "content": content, "content_type": part.get_content_type()})
    return files


def build_images_lookup_from_entries(entries):
    by_path = {}
    by_basename = {}
    duplicate_basenames = set()
    for entry in entries:
        path_key = entry["path"].lower()
        basename_key = Path(entry["path"]).name.lower()
        by_path[path_key] = entry["data_url"]
        if basename_key in by_basename and by_basename[basename_key] != entry["data_url"]:
            duplicate_basenames.add(basename_key)
        else:
            by_basename[basename_key] = entry["data_url"]
    return by_path, by_basename, sorted(duplicate_basenames)


def import_case_package_from_zip_bytes(zip_bytes, archive_name="case-package.zip"):
    warnings = []
    if len(zip_bytes) > MAX_CASE_PACKAGE_BYTES:
        raise ValueError("ZIP-архив слишком большой для чернового MVP.")

    try:
        archive = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile as error:
        raise ValueError("Файл не является корректным ZIP-архивом.") from error

    entries = []
    total_uncompressed_bytes = 0
    unsupported_files = []
    scenario_candidates = []

    for info in archive.infolist():
        if info.is_dir():
            continue
        normalized_path = normalize_package_path(info.filename)
        if not normalized_path:
            raise ValueError(f"Небезопасный путь в ZIP-архиве: {info.filename}")
        total_uncompressed_bytes += info.file_size
        if total_uncompressed_bytes > MAX_CASE_PACKAGE_UNCOMPRESSED_BYTES:
            raise ValueError("ZIP-архив слишком большой после распаковки для чернового MVP.")
        if len(entries) >= MAX_CASE_PACKAGE_FILES:
            raise ValueError("В ZIP-архиве слишком много файлов для чернового MVP.")

        record = {
            "path": normalized_path,
            "basename": Path(normalized_path).name,
            "size_bytes": info.file_size,
        }
        entries.append(record)
        if Path(normalized_path).name.lower() == "scenario.json":
            scenario_candidates.append(record)
        elif not is_supported_package_image(normalized_path):
            unsupported_files.append(normalized_path)

    if not scenario_candidates:
        raise ValueError("В ZIP-архиве не найден scenario.json.")
    if len(scenario_candidates) > 1:
        raise ValueError("В ZIP-архиве найдено несколько scenario.json. Оставьте только один сценарий.")

    scenario_entry = scenario_candidates[0]
    scenario_root = scenario_entry["path"].rsplit("/", 1)[0] if "/" in scenario_entry["path"] else ""
    scenario_content = archive.read(scenario_entry["path"])
    scenario_text = scenario_content.decode("utf-8")
    if not scenario_text.strip():
        raise ValueError("scenario.json в ZIP-архиве пуст.")

    try:
        scenario = json.loads(scenario_text)
    except json.JSONDecodeError as error:
        raise ValueError("Не удалось разобрать scenario.json из ZIP-архива.") from error

    validation_errors = validate_scenario(scenario)
    normalized_scenario = normalize_scenario(normalize_payload(scenario))

    image_entries = []
    for record in entries:
        if not is_supported_package_image(record["path"]):
            continue
        if scenario_root and not (
            record["path"] == scenario_root or record["path"].startswith(f"{scenario_root}/")
        ):
            continue
        relative_path = record["path"][len(scenario_root) + 1 :] if scenario_root and record["path"].startswith(f"{scenario_root}/") else record["path"]
        data = archive.read(record["path"])
        image_entries.append(
            {
                "path": relative_path,
                "archive_path": record["path"],
                "basename": record["basename"],
                "size_bytes": record["size_bytes"],
                "content_type": guess_mime_type(record["path"]),
                "data_url": make_data_url(record["path"], data),
            }
        )

    images_by_path, images_by_basename, duplicate_basenames = build_images_lookup_from_entries(image_entries)

    matched_asset_count = 0
    used_lookup_keys = set()
    missing_visual_assets = []
    for asset in normalized_scenario.get("visual_assets", []):
        file_name = asset.get("file")
        if not file_name:
            continue
        lookup_path = normalize_package_path(file_name)
        lookup_basename = Path(file_name).name.lower()
        matched_url = None
        if lookup_path and lookup_path.lower() in images_by_path:
            matched_url = images_by_path[lookup_path.lower()]
            used_lookup_keys.add(lookup_path.lower())
        elif lookup_basename in images_by_basename:
            matched_url = images_by_basename[lookup_basename]
            used_lookup_keys.add(lookup_basename)
        if not matched_url:
            missing_visual_assets.append(asset.get("id") or file_name)
        else:
            matched_asset_count += 1

    extra_images = []
    for entry in image_entries:
        path_key = entry["path"].lower()
        basename_key = entry["basename"].lower()
        if path_key not in used_lookup_keys and basename_key not in used_lookup_keys:
            extra_images.append(entry["path"])

    if duplicate_basenames:
        warnings.append(
            "В ZIP-архиве обнаружены повторяющиеся имена файлов изображений; для совпадения по basename будет использовано первое найденное изображение."
        )
    if unsupported_files:
        warnings.append(
            "В ZIP-архиве есть неподдерживаемые файлы: " + ", ".join(unsupported_files[:8]) + ("…" if len(unsupported_files) > 8 else "")
        )
    if extra_images:
        warnings.append(
            "В ZIP-архиве есть изображения, не связанные с visual_assets: "
            + ", ".join(extra_images[:8])
            + ("…" if len(extra_images) > 8 else "")
        )
    if missing_visual_assets:
        warnings.append(
            "Для visual_assets не найдены изображения: "
            + ", ".join(missing_visual_assets[:8])
            + ("…" if len(missing_visual_assets) > 8 else "")
        )

    package_summary = {
        "archive_name": archive_name,
        "archive_size_bytes": len(zip_bytes),
        "scenario_file_name": scenario_entry["path"].split("/")[-1],
        "scenario_path": scenario_entry["path"],
        "scenario_title": normalized_scenario.get("metadata", {}).get("title", "Без названия"),
        "image_count": len(image_entries),
        "matched_image_count": matched_asset_count,
        "unmatched_image_count": max(0, len(image_entries) - len(used_lookup_keys)),
        "warnings": warnings,
    }

    return {
        "ok": not validation_errors,
        "errors": validation_errors,
        "warnings": warnings,
        "scenario": normalized_scenario,
        "images": {"by_path": images_by_path, "by_basename": images_by_basename},
        "package_summary": package_summary,
        "validation": {"ok": not validation_errors, "errors": validation_errors},
    }


def validate_scenario(scenario):
    errors = []
    scenario = normalize_payload(scenario)

    if not isinstance(scenario, dict):
        return ["Scenario root must be a JSON object"]

    missing_keys = REQUIRED_TOP_LEVEL_KEYS.difference(scenario.keys())
    for key in sorted(missing_keys):
        errors.append(f"Missing top-level key '{key}'")

    for list_key in ("participants", "relationships", "evidence", "dialogue_actions", "verdicts"):
        if list_key in scenario and not isinstance(scenario[list_key], list):
            errors.append(f"'{list_key}' must be a list")

    participant_ids = collect_unique_ids(scenario.get("participants", []), "participants", errors)
    evidence_ids = collect_unique_ids(scenario.get("evidence", []), "evidence", errors)
    action_ids = collect_unique_ids(scenario.get("dialogue_actions", []), "dialogue_actions", errors)
    verdict_ids = collect_unique_ids(scenario.get("verdicts", []), "verdicts", errors)
    refs = {"participants": participant_ids, "evidence": evidence_ids, "actions": action_ids, "verdicts": verdict_ids}

    if "visual_assets" in scenario:
        if not isinstance(scenario["visual_assets"], list):
            errors.append("'visual_assets' must be a list")
        else:
            collect_unique_ids(scenario["visual_assets"], "visual_assets", errors)
            for index, asset in enumerate(scenario["visual_assets"]):
                validate_visual_asset(asset, participant_ids, errors, f"visual_assets[{index}]")

    for participant in scenario.get("participants", []):
        if isinstance(participant, dict):
            validate_required_fields(
                f"participant '{participant.get('id', '?')}'",
                participant,
                ["id", "name", "role", "position", "relation_to_case", "public_description", "relationships"],
                errors,
            )

    for relationship in scenario.get("relationships", []):
        if not isinstance(relationship, dict):
            errors.append("relationships entries must be objects")
            continue
        validate_required_fields(
            f"relationship '{relationship.get('id', '?')}'",
            relationship,
            ["id", "from_participant_id", "to_participant_id", "label", "description"],
            errors,
        )
        if relationship.get("from_participant_id") not in participant_ids:
            errors.append(
                f"relationship '{relationship.get('id', '?')}' references unknown from_participant_id"
            )
        if relationship.get("to_participant_id") not in participant_ids:
            errors.append(
                f"relationship '{relationship.get('id', '?')}' references unknown to_participant_id"
            )

    for evidence in scenario.get("evidence", []):
        if not isinstance(evidence, dict):
            continue
        validate_required_fields(
            f"evidence '{evidence.get('id', '?')}'",
            evidence,
            ["id", "title", "short_description", "inspection_text", "proves"],
            errors,
        )
        validate_condition(evidence.get("available_if"), refs, errors, f"evidence '{evidence.get('id', '?')}'.available_if")
        for index, effect in enumerate(evidence.get("effects", [])):
            validate_effect(effect, refs, errors, f"evidence '{evidence.get('id', '?')}'.effects[{index}]")

    for action in scenario.get("dialogue_actions", []):
        if not isinstance(action, dict):
            continue
        validate_required_fields(
            f"dialogue action '{action.get('id', '?')}'",
            action,
            ["id", "participant_id", "label", "response_text"],
            errors,
        )
        if action.get("participant_id") not in participant_ids:
            errors.append(f"dialogue action '{action.get('id', '?')}' references unknown participant_id")
        validate_condition(action.get("available_if"), refs, errors, f"dialogue action '{action.get('id', '?')}'.available_if")
        for index, effect in enumerate(action.get("effects", [])):
            validate_effect(effect, refs, errors, f"dialogue action '{action.get('id', '?')}'.effects[{index}]")

    correct_verdicts = []
    for verdict in scenario.get("verdicts", []):
        if not isinstance(verdict, dict):
            continue
        validate_required_fields(
            f"verdict '{verdict.get('id', '?')}'",
            verdict,
            ["id", "label"],
            errors,
        )
        validate_condition(verdict.get("available_if"), refs, errors, f"verdict '{verdict.get('id', '?')}'.available_if")
        if verdict.get("correct"):
            correct_verdicts.append(verdict.get("id"))

    if len(correct_verdicts) != 1:
        errors.append("Scenario must contain exactly one correct verdict")

    solution = scenario.get("solution")
    if not isinstance(solution, dict):
        errors.append("'solution' must be an object")
    else:
        validate_required_fields("solution", solution, ["correct_verdict_id", "explanation"], errors)
        if solution.get("correct_verdict_id") and solution["correct_verdict_id"] not in verdict_ids:
            errors.append("solution.correct_verdict_id references unknown verdict id")

    return errors


class AppHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/demo-scenario":
            self.send_json(HTTPStatus.OK, load_demo_scenario())
            return
        if parsed.path == "/":
            self.serve_static("index.html")
            return
        self.serve_static(parsed.path.lstrip("/"))

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/validate-scenario":
            payload = self.read_json_body()
            errors = validate_scenario(payload)
            self.send_json(HTTPStatus.OK, {"ok": not errors, "errors": errors})
            return
        if parsed.path == "/api/start-scenario":
            payload = self.read_json_body()
            errors = validate_scenario(payload)
            if errors:
                self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "errors": errors})
                return
            scenario = normalize_scenario(normalize_payload(payload))
            self.send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "errors": [],
                    "scenario": scenario,
                    "initial_state": build_initial_state(scenario),
                },
            )
            return
        if parsed.path == "/api/import-case-package":
            try:
                result = self.import_case_package()
            except ValueError as error:
                self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "errors": [str(error)]})
                return
            self.send_json(HTTPStatus.OK, result)
            return
        self.send_json(HTTPStatus.NOT_FOUND, {"ok": False, "errors": ["Unknown endpoint"]})

    def log_message(self, format, *args):
        return

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b""
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def read_raw_body(self, max_bytes=MAX_CASE_PACKAGE_BYTES):
        length = int(self.headers.get("Content-Length", "0"))
        if length > max_bytes:
            raise ValueError("Запрос слишком большой для чернового MVP.")
        return self.rfile.read(length) if length else b""

    def import_case_package(self):
        raw_body = self.read_raw_body()
        parts = parse_multipart_form_data(self.headers, raw_body)
        file_parts = [part for part in parts if part["filename"]]
        if not file_parts:
            raise ValueError("ZIP-архив не был передан.")
        if len(file_parts) > 1:
            raise ValueError("Передайте только один ZIP-архив пакета дела.")

        file_part = file_parts[0]
        filename = file_part["filename"]
        if not filename.lower().endswith(".zip"):
            raise ValueError("Пожалуйста, передайте ZIP-архив пакета дела.")

        result = import_case_package_from_zip_bytes(file_part["content"], archive_name=filename)
        package_summary = result["package_summary"]
        return {
            "ok": result["validation"]["ok"],
            "errors": [],
            "warnings": result["warnings"],
            "scenario": result["scenario"],
            "images": result["images"],
            "package_summary": package_summary,
            "validation": result["validation"],
        }

    def serve_static(self, relative_path):
        target = (STATIC_DIR / relative_path).resolve()
        if not str(target).startswith(str(STATIC_DIR.resolve())) or not target.exists() or not target.is_file():
            self.send_json(HTTPStatus.NOT_FOUND, {"ok": False, "errors": ["Static file not found"]})
            return
        content_type, _ = mimetypes.guess_type(target.name)
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.end_headers()
        self.wfile.write(target.read_bytes())

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run_server(host=HOST, port=PORT):
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"Serving AI Court Game scaffold on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    run_server()
