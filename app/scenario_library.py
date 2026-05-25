import base64
import hashlib
import io
import json
import re
import sqlite3
import threading
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
RUNTIME_DIR = REPO_ROOT / ".runtime"
SCENARIO_LIBRARY_DIR = RUNTIME_DIR / "scenario-library"
SCENARIO_LIBRARY_DB_PATH = SCENARIO_LIBRARY_DIR / "scenario_library.sqlite3"

SCHEMA_VERSION = 1
MAX_SCENARIO_JSON_BYTES = 2 * 1024 * 1024
MAX_IMAGES_COUNT = 30
MAX_TOTAL_IMAGE_BYTES = 30 * 1024 * 1024
MAX_IMPORT_ZIP_BYTES = 40 * 1024 * 1024
ALLOWED_IMAGE_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
}

_SCHEMA_LOCK = threading.Lock()


def utc_now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def open_connection():
    SCENARIO_LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(SCENARIO_LIBRARY_DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 5000")
    try:
        connection.execute("PRAGMA journal_mode = WAL")
    except sqlite3.DatabaseError:
        pass
    return connection


def ensure_schema():
    with _SCHEMA_LOCK:
        with open_connection() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_version (
                    version INTEGER NOT NULL,
                    applied_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS saved_scenarios (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    scenario_type TEXT,
                    scenario_json TEXT NOT NULL,
                    scenario_hash TEXT NOT NULL,
                    source_type TEXT,
                    image_count INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS saved_scenario_images (
                    id TEXT PRIMARY KEY,
                    scenario_id TEXT NOT NULL,
                    asset_id TEXT,
                    virtual_path TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    sha256 TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    data BLOB NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (scenario_id) REFERENCES saved_scenarios(id) ON DELETE CASCADE
                )
                """
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_saved_scenarios_updated_at ON saved_scenarios(updated_at DESC)"
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_saved_scenario_images_scenario_id ON saved_scenario_images(scenario_id)"
            )
            connection.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_scenario_images_scenario_path "
                "ON saved_scenario_images(scenario_id, virtual_path)"
            )

            current_version = connection.execute("SELECT MAX(version) AS version FROM schema_version").fetchone()
            current_version_value = int(current_version["version"] or 0) if current_version else 0
            if current_version_value < SCHEMA_VERSION:
                connection.execute(
                    "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)",
                    (SCHEMA_VERSION, utc_now_iso()),
                )


def normalize_scenario_json(scenario):
    return json.loads(json.dumps(scenario, ensure_ascii=False, sort_keys=True, separators=(",", ":")))


def canonical_scenario_text(scenario):
    return json.dumps(normalize_scenario_json(scenario), ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def scenario_hash(scenario):
    return hashlib.sha256(canonical_scenario_text(scenario).encode("utf-8")).hexdigest()


def extract_title(scenario):
    metadata = scenario.get("metadata") if isinstance(scenario, dict) else {}
    case_intro = scenario.get("case_intro") if isinstance(scenario, dict) else {}
    for candidate in (
        metadata.get("title") if isinstance(metadata, dict) else None,
        case_intro.get("title") if isinstance(case_intro, dict) else None,
    ):
        if candidate:
            return str(candidate)
    return "Без названия"


def extract_scenario_type(scenario):
    metadata = scenario.get("metadata") if isinstance(scenario, dict) else {}
    case_intro = scenario.get("case_intro") if isinstance(scenario, dict) else {}
    for candidate in (
        metadata.get("case_type") if isinstance(metadata, dict) else None,
        metadata.get("type") if isinstance(metadata, dict) else None,
        case_intro.get("case_type") if isinstance(case_intro, dict) else None,
        case_intro.get("type") if isinstance(case_intro, dict) else None,
    ):
        if candidate:
            return str(candidate)
    return None


def normalize_virtual_path(value):
    normalized = str(value or "").replace("\\", "/").strip()
    if not normalized or normalized.startswith("/") or "\x00" in normalized:
        return None
    if re.match(r"^[a-zA-Z]:", normalized):
        return None

    segments = []
    for segment in normalized.split("/"):
        if segment in ("", "."):
            continue
        if segment == "..":
            return None
        segments.append(segment)

    if not segments:
        return None
    return "/".join(segments)


def safe_export_image_path(virtual_path):
    normalized = normalize_virtual_path(virtual_path)
    if not normalized:
        return None
    if normalized.startswith("images/"):
        normalized = normalized[len("images/") :]
    return normalized


def safe_export_filename(title, saved_id):
    slug = re.sub(r"[^0-9A-Za-zА-Яа-я]+", "-", str(title or "").strip()).strip("-")
    if not slug:
        slug = "scenario"
    return f"{slug[:48]}-{saved_id}.zip"


def infer_image_mime(file_name):
    lower_name = str(file_name or "").lower()
    if lower_name.endswith(".png"):
        return "image/png"
    if lower_name.endswith(".jpg") or lower_name.endswith(".jpeg"):
        return "image/jpeg"
    if lower_name.endswith(".webp"):
        return "image/webp"
    if lower_name.endswith(".svg"):
        return "image/svg+xml"
    return None


def parse_data_url(data_url):
    text = str(data_url or "")
    if not text.startswith("data:") or ";base64," not in text:
        raise ValueError("Неверный формат data URL для изображения.")
    header, encoded = text.split(",", 1)
    mime_type = header[5:].split(";", 1)[0].strip().lower()
    if not mime_type:
        raise ValueError("Не удалось определить MIME-тип изображения.")
    try:
        binary = base64.b64decode(encoded.encode("ascii"), validate=True)
    except Exception as error:
        raise ValueError("Не удалось декодировать изображение из data URL.") from error
    return mime_type, binary


def encode_data_url(mime_type, data):
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def normalize_images_mapping(images):
    if not isinstance(images, dict):
      raise ValueError("images должен быть JSON-объектом.")
    if any(key in images for key in ("by_path", "byPath", "by_basename", "byBasename")):
        candidate = images.get("by_path") or images.get("byPath") or images.get("images") or {}
        if not isinstance(candidate, dict):
            raise ValueError("images.by_path должен быть JSON-объектом.")
        return candidate
    return images


def build_asset_id_lookup(scenario):
    assets = scenario.get("visual_assets") if isinstance(scenario, dict) else []
    lookup = {}
    if not isinstance(assets, list):
        return lookup
    for asset in assets:
        if not isinstance(asset, dict):
            continue
        file_name = asset.get("file")
        normalized_path = normalize_virtual_path(file_name)
        if normalized_path and normalized_path not in lookup:
            lookup[normalized_path] = asset.get("id")
    return lookup


def build_image_rows(saved_id, scenario, images, created_at):
    normalized_images = normalize_images_mapping(images)
    if len(normalized_images) > MAX_IMAGES_COUNT:
        raise ValueError("Слишком много изображений для библиотеки сценариев.")

    asset_lookup = build_asset_id_lookup(scenario)
    rows = []
    total_image_bytes = 0
    seen_paths = set()

    for raw_path, data_url in normalized_images.items():
        virtual_path = normalize_virtual_path(raw_path)
        if not virtual_path:
            raise ValueError(f"Небезопасный путь изображения: {raw_path}")
        if virtual_path in seen_paths:
            raise ValueError(f"Повторяющийся путь изображения: {virtual_path}")
        seen_paths.add(virtual_path)

        mime_type, binary = parse_data_url(data_url)
        if mime_type not in ALLOWED_IMAGE_MIME_TYPES:
            raise ValueError(f"Неподдерживаемый MIME-тип изображения: {mime_type}")
        size_bytes = len(binary)
        total_image_bytes += size_bytes
        if total_image_bytes > MAX_TOTAL_IMAGE_BYTES:
            raise ValueError("Слишком большой объём изображений для библиотеки сценариев.")

        file_name = Path(virtual_path).name
        rows.append(
            {
                "id": str(uuid.uuid4()),
                "scenario_id": saved_id,
                "asset_id": asset_lookup.get(virtual_path),
                "virtual_path": virtual_path,
                "file_name": file_name,
                "mime_type": mime_type,
                "sha256": hashlib.sha256(binary).hexdigest(),
                "size_bytes": size_bytes,
                "data": binary,
                "created_at": created_at,
            }
        )

    return rows


def _ensure_scenario_size_limits(scenario_text):
    encoded = scenario_text.encode("utf-8")
    if len(encoded) > MAX_SCENARIO_JSON_BYTES:
        raise ValueError("scenario.json слишком большой для библиотеки сценариев.")


def _require_saved_scenario_row(connection, saved_id):
    row = connection.execute(
        "SELECT id, title, scenario_type, scenario_json, scenario_hash, source_type, image_count, created_at, updated_at "
        "FROM saved_scenarios WHERE id = ?",
        (saved_id,),
    ).fetchone()
    if not row:
        raise ValueError("Сохранённый сценарий не найден.")
    return row


def _scenario_exists(connection, saved_id):
    row = connection.execute("SELECT 1 FROM saved_scenarios WHERE id = ?", (saved_id,)).fetchone()
    return bool(row)


def save_saved_scenario(scenario, images, source_type="unknown", replace_id=None):
    ensure_schema()
    scenario = normalize_scenario_json(scenario)
    scenario_text = canonical_scenario_text(scenario)
    _ensure_scenario_size_limits(scenario_text)

    requested_id = str(replace_id).strip() if replace_id and str(replace_id).strip() else None
    now = utc_now_iso()

    with _SCHEMA_LOCK:
        with open_connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            saved_id = requested_id if requested_id and _scenario_exists(connection, requested_id) else str(uuid.uuid4())
            existing = connection.execute(
                "SELECT created_at FROM saved_scenarios WHERE id = ?",
                (saved_id,),
            ).fetchone()
            created_at = existing["created_at"] if existing else now
            rows = build_image_rows(saved_id, scenario, images or {}, now)
            if existing:
                connection.execute(
                    """
                    UPDATE saved_scenarios
                    SET title = ?, scenario_type = ?, scenario_json = ?, scenario_hash = ?, source_type = ?, image_count = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        extract_title(scenario),
                        extract_scenario_type(scenario),
                        scenario_text,
                        scenario_hash(scenario),
                        str(source_type or "unknown"),
                        len(rows),
                        now,
                        saved_id,
                    ),
                )
                connection.execute("DELETE FROM saved_scenario_images WHERE scenario_id = ?", (saved_id,))
            else:
                connection.execute(
                    """
                    INSERT INTO saved_scenarios (
                        id, title, scenario_type, scenario_json, scenario_hash, source_type, image_count, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        saved_id,
                        extract_title(scenario),
                        extract_scenario_type(scenario),
                        scenario_text,
                        scenario_hash(scenario),
                        str(source_type or "unknown"),
                        len(rows),
                        created_at,
                        now,
                    ),
                )

            for row in rows:
                connection.execute(
                    """
                    INSERT INTO saved_scenario_images (
                        id, scenario_id, asset_id, virtual_path, file_name, mime_type, sha256, size_bytes, data, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        row["id"],
                        row["scenario_id"],
                        row["asset_id"],
                        row["virtual_path"],
                        row["file_name"],
                        row["mime_type"],
                        row["sha256"],
                        row["size_bytes"],
                        row["data"],
                        row["created_at"],
                    ),
                )
            connection.commit()

    return {
        "saved_id": saved_id,
        "title": extract_title(scenario),
        "scenario_type": extract_scenario_type(scenario),
        "scenario_hash": scenario_hash(scenario),
        "image_count": len(rows),
        "created_at": created_at,
        "updated_at": now,
    }


def list_saved_scenarios():
    ensure_schema()
    with open_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, title, scenario_type, scenario_hash, source_type, image_count, created_at, updated_at
            FROM saved_scenarios
            ORDER BY updated_at DESC, created_at DESC, title COLLATE NOCASE ASC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def load_saved_scenario(saved_id):
    ensure_schema()
    with open_connection() as connection:
        record = _require_saved_scenario_row(connection, saved_id)
        image_rows = connection.execute(
            """
            SELECT asset_id, virtual_path, file_name, mime_type, data
            FROM saved_scenario_images
            WHERE scenario_id = ?
            ORDER BY virtual_path COLLATE NOCASE ASC
            """,
            (saved_id,),
        ).fetchall()

    scenario = json.loads(record["scenario_json"])
    images = {
        row["virtual_path"]: encode_data_url(row["mime_type"], row["data"])
        for row in image_rows
    }
    metadata = {
        "id": record["id"],
        "title": record["title"],
        "scenario_type": record["scenario_type"],
        "scenario_hash": record["scenario_hash"],
        "source_type": record["source_type"],
        "image_count": record["image_count"],
        "created_at": record["created_at"],
        "updated_at": record["updated_at"],
    }
    return {"scenario": scenario, "images": images, "metadata": metadata}


def delete_saved_scenario(saved_id):
    ensure_schema()
    with _SCHEMA_LOCK:
        with open_connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("DELETE FROM saved_scenarios WHERE id = ?", (saved_id,))
            connection.commit()


def export_saved_scenario_zip(saved_id):
    ensure_schema()
    loaded = load_saved_scenario(saved_id)
    scenario = loaded["scenario"]
    metadata = loaded["metadata"]
    images = loaded["images"]
    record = {
        "id": metadata["id"],
        "title": metadata["title"],
        "scenario_type": metadata["scenario_type"],
        "scenario_hash": metadata["scenario_hash"],
        "source_type": metadata["source_type"],
        "image_count": metadata["image_count"],
        "created_at": metadata["created_at"],
        "updated_at": metadata["updated_at"],
    }
    manifest = {
        "format": "ai_court_game_saved_scenario",
        "format_version": 1,
        "exported_at": utc_now_iso(),
        "id": metadata["id"],
        "title": metadata["title"],
        "scenario_hash": metadata["scenario_hash"],
        "image_count": metadata["image_count"],
        "scenario_type": metadata["scenario_type"],
        "source_type": metadata["source_type"],
    }

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2))
        archive.writestr("scenario.json", json.dumps(scenario, ensure_ascii=False, sort_keys=True, indent=2))
        archive.writestr("library_record.json", json.dumps(record, ensure_ascii=False, sort_keys=True, indent=2))
        for virtual_path, data_url in sorted(images.items(), key=lambda item: item[0].lower()):
            export_path = safe_export_image_path(virtual_path)
            if not export_path:
                continue
            _mime_type, binary = parse_data_url(data_url)
            archive.writestr(f"images/{export_path}", binary)

    return buffer.getvalue(), safe_export_filename(metadata["title"], metadata["id"])


def parse_saved_scenario_zip(zip_bytes, archive_name="saved-scenario.zip"):
    if len(zip_bytes) > MAX_IMPORT_ZIP_BYTES:
        raise ValueError("ZIP-пакет библиотеки сценариев слишком большой.")

    try:
        archive = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile as error:
        raise ValueError("Файл не является корректным ZIP-пакетом библиотеки сценариев.") from error

    allowed_top_level = {"manifest.json", "scenario.json", "library_record.json"}
    manifest_bytes = None
    scenario_bytes = None
    library_record_bytes = None
    image_entries = []
    total_uncompressed_bytes = 0

    for info in archive.infolist():
        if info.is_dir():
            continue
        total_uncompressed_bytes += info.file_size
        if total_uncompressed_bytes > MAX_IMPORT_ZIP_BYTES:
            raise ValueError("ZIP-пакет библиотеки сценариев слишком большой после распаковки.")
        normalized_path = normalize_virtual_path(info.filename)
        if not normalized_path:
            raise ValueError(f"Небезопасный путь в ZIP-пакете: {info.filename}")

        if normalized_path in allowed_top_level:
            if normalized_path == "manifest.json":
                manifest_bytes = archive.read(info.filename)
            elif normalized_path == "scenario.json":
                scenario_bytes = archive.read(info.filename)
            elif normalized_path == "library_record.json":
                library_record_bytes = archive.read(info.filename)
            continue

        if not normalized_path.startswith("images/"):
            raise ValueError(f"В ZIP-пакете библиотеки сценариев найден неподдерживаемый файл: {normalized_path}")
        image_entries.append((normalized_path, info.filename))

    if manifest_bytes is None:
        raise ValueError("В ZIP-пакете библиотеки сценариев не найден manifest.json.")
    if scenario_bytes is None:
        raise ValueError("В ZIP-пакете библиотеки сценариев не найден scenario.json.")

    try:
        manifest = json.loads(manifest_bytes.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError("Не удалось разобрать manifest.json.") from error

    if manifest.get("format") != "ai_court_game_saved_scenario":
        raise ValueError("ZIP-пакет не является экспортом библиотеки сценариев AI Court Game.")
    if int(manifest.get("format_version") or 0) != 1:
        raise ValueError("Неподдерживаемая версия формата ZIP-пакета библиотеки сценариев.")

    try:
        scenario = json.loads(scenario_bytes.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError("Не удалось разобрать scenario.json из ZIP-пакета библиотеки сценариев.") from error
    _ensure_scenario_size_limits(json.dumps(scenario, ensure_ascii=False, sort_keys=True, separators=(",", ":")))

    library_record = None
    if library_record_bytes is not None:
        try:
            library_record = json.loads(library_record_bytes.decode("utf-8"))
        except json.JSONDecodeError:
            library_record = None

    if library_record and library_record.get("scenario_hash") and library_record.get("scenario_hash") != manifest.get("scenario_hash"):
        raise ValueError("library_record.json не совпадает с manifest.json.")

    images = {}
    total_image_bytes = 0
    seen_paths = set()
    for normalized_path, archive_path in sorted(image_entries, key=lambda item: item[0].lower()):
        virtual_path = normalize_virtual_path(normalized_path)
        if not virtual_path:
            raise ValueError(f"Небезопасный путь изображения в ZIP-пакете: {normalized_path}")
        if virtual_path in seen_paths:
            raise ValueError(f"Повторяющийся путь изображения в ZIP-пакете: {virtual_path}")
        seen_paths.add(virtual_path)
        data = archive.read(archive_path)
        total_image_bytes += len(data)
        if total_image_bytes > MAX_TOTAL_IMAGE_BYTES:
            raise ValueError("Слишком большой объём изображений в ZIP-пакете.")
        mime_type = infer_image_mime(virtual_path)
        if mime_type not in ALLOWED_IMAGE_MIME_TYPES:
            raise ValueError(f"Неподдерживаемое изображение в ZIP-пакете: {virtual_path}")
        images[virtual_path] = encode_data_url(mime_type, data)

    return {
        "archive_name": archive_name,
        "manifest": manifest,
        "scenario": scenario,
        "images": images,
        "library_record": library_record or {},
    }
