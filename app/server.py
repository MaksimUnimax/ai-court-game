import json
import mimetypes
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


def load_demo_scenario():
    return json.loads(DEMO_SCENARIO_PATH.read_text(encoding="utf-8"))


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
        self.send_json(HTTPStatus.NOT_FOUND, {"ok": False, "errors": ["Unknown endpoint"]})

    def log_message(self, format, *args):
        return

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b""
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

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
