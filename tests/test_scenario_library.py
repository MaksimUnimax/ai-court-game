import base64
import http.client
import io
import json
import sqlite3
import tempfile
import threading
import unittest
import zipfile
from copy import deepcopy
from pathlib import Path
from unittest import mock

from app import scenario_library, server


TINY_PNG_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+iXwAAAABJRU5ErkJggg=="
)


def build_library_scenario():
    scenario = deepcopy(server.load_demo_scenario())
    participant_id = scenario["participants"][0]["id"]
    scenario["visual_assets"] = [
        {
            "id": "asset_library_portrait",
            "type": "participant_portrait",
            "target_type": "participant",
            "target_id": participant_id,
            "file": "images/portrait.png",
            "title": "Портрет участника",
            "alt": "Портрет участника",
            "placement": "participant_card",
        }
    ]
    images = {"images/portrait.png": TINY_PNG_DATA_URL}
    return scenario, images


def build_multipart_form_data(field_name, filename, content, content_type="application/zip"):
    boundary = "----ai-court-library-boundary"
    body = io.BytesIO()
    body.write(f"--{boundary}\r\n".encode("utf-8"))
    body.write(
        (
            f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'
            f"Content-Type: {content_type}\r\n\r\n"
        ).encode("utf-8")
    )
    body.write(content)
    body.write(f"\r\n--{boundary}--\r\n".encode("utf-8"))
    return boundary, body.getvalue()


class ScenarioLibraryModuleTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tempdir.name) / "scenario_library.sqlite3"
        self.dir_path = Path(self.tempdir.name)
        self.patcher_db = mock.patch.object(scenario_library, "SCENARIO_LIBRARY_DB_PATH", self.db_path)
        self.patcher_dir = mock.patch.object(scenario_library, "SCENARIO_LIBRARY_DIR", self.dir_path)
        self.patcher_db.start()
        self.patcher_dir.start()

    def tearDown(self):
        self.patcher_dir.stop()
        self.patcher_db.stop()
        self.tempdir.cleanup()

    def test_db_initializes_with_schema_version(self):
        scenario_library.ensure_schema()
        with sqlite3.connect(self.db_path) as connection:
            versions = [row[0] for row in connection.execute("SELECT version FROM schema_version ORDER BY version")]
        self.assertEqual(versions, [scenario_library.SCHEMA_VERSION])

    def test_save_load_list_delete_roundtrip(self):
        scenario, images = build_library_scenario()
        saved = scenario_library.save_saved_scenario(scenario, images, source_type="demo")
        items = scenario_library.list_saved_scenarios()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], saved["saved_id"])
        self.assertNotIn("scenario_json", items[0])

        loaded = scenario_library.load_saved_scenario(saved["saved_id"])
        self.assertEqual(loaded["metadata"]["title"], saved["title"])
        self.assertIn("images/portrait.png", loaded["images"])
        decoded = base64.b64decode(loaded["images"]["images/portrait.png"].split(",", 1)[1])
        self.assertTrue(decoded.startswith(b"\x89PNG"))

        scenario_library.delete_saved_scenario(saved["saved_id"])
        self.assertEqual(scenario_library.list_saved_scenarios(), [])

    def test_export_and_import_zip_roundtrip(self):
        scenario, images = build_library_scenario()
        saved = scenario_library.save_saved_scenario(scenario, images, source_type="demo")
        archive_bytes, filename = scenario_library.export_saved_scenario_zip(saved["saved_id"])
        self.assertTrue(filename.endswith(".zip"))

        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
            names = set(archive.namelist())
        self.assertIn("manifest.json", names)
        self.assertIn("scenario.json", names)
        self.assertIn("library_record.json", names)
        self.assertIn("images/portrait.png", names)

        parsed = scenario_library.parse_saved_scenario_zip(archive_bytes, archive_name=filename)
        imported = scenario_library.save_saved_scenario(
            parsed["scenario"],
            parsed["images"],
            source_type=parsed["library_record"].get("source_type") or "library",
        )
        self.assertNotEqual(imported["saved_id"], saved["saved_id"])
        self.assertEqual(len(scenario_library.list_saved_scenarios()), 2)

    def test_save_rejects_audio_data_url(self):
        scenario, _images = build_library_scenario()
        with self.assertRaises(ValueError):
            scenario_library.save_saved_scenario(
                scenario,
                {"images/portrait.png": "data:audio/wav;base64,AAAA"},
                source_type="demo",
            )

    def test_save_rejects_path_traversal(self):
        scenario, images = build_library_scenario()
        with self.assertRaises(ValueError):
            scenario_library.save_saved_scenario(
                scenario,
                {"../evil.png": list(images.values())[0]},
                source_type="demo",
            )

    def test_parse_saved_scenario_zip_rejects_non_library_zip(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("scenario.json", json.dumps(server.load_demo_scenario(), ensure_ascii=False))
            archive.writestr("images/portrait.png", base64.b64decode(TINY_PNG_DATA_URL.split(",", 1)[1]))
        with self.assertRaises(ValueError):
            scenario_library.parse_saved_scenario_zip(buffer.getvalue(), archive_name="gameplay.zip")


class ScenarioLibraryEndpointTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tempdir.name) / "scenario_library.sqlite3"
        self.dir_path = Path(self.tempdir.name)
        self.patcher_db = mock.patch.object(scenario_library, "SCENARIO_LIBRARY_DB_PATH", self.db_path)
        self.patcher_dir = mock.patch.object(scenario_library, "SCENARIO_LIBRARY_DIR", self.dir_path)
        self.patcher_db.start()
        self.patcher_dir.start()
        scenario_library.ensure_schema()

        self.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.AppHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)
        self.patcher_dir.stop()
        self.patcher_db.stop()
        self.tempdir.cleanup()

    @property
    def port(self):
        return self.httpd.server_address[1]

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            data = response.read()
            return response, data
        finally:
            connection.close()

    def request_json(self, method, path, payload=None):
        if payload is None and method in {"GET", "DELETE"}:
            response, data = self.request(method, path)
            return response, json.loads(data.decode("utf-8"))
        body = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
        response, data = self.request(method, path, body=body, headers={"Content-Type": "application/json"})
        return response, json.loads(data.decode("utf-8"))

    def test_endpoints_roundtrip_and_limits(self):
        scenario, images = build_library_scenario()

        response, payload = self.request_json("GET", "/api/scenario-library/list")
        self.assertEqual(response.status, 200)
        self.assertEqual(payload["items"], [])

        response, payload = self.request_json(
            "POST",
            "/api/scenario-library/save",
            {"scenario": scenario, "images": images, "source_type": "demo"},
        )
        self.assertEqual(response.status, 200)
        saved_id = payload["saved_id"]
        self.assertTrue(saved_id)

        response, payload = self.request_json("GET", "/api/scenario-library/list")
        self.assertEqual(response.status, 200)
        self.assertEqual(len(payload["items"]), 1)
        self.assertNotIn("scenario_json", payload["items"][0])
        self.assertNotIn("images", payload["items"][0])

        response, payload = self.request_json("GET", f"/api/scenario-library/load?id={saved_id}")
        self.assertEqual(response.status, 200)
        self.assertIn("images/portrait.png", payload["images"])

        response, data = self.request("GET", f"/api/scenario-library/export?id={saved_id}")
        self.assertEqual(response.status, 200)
        self.assertEqual(response.getheader("Content-Type"), "application/zip")
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            self.assertIn("manifest.json", archive.namelist())
            self.assertIn("scenario.json", archive.namelist())
            self.assertIn("images/portrait.png", archive.namelist())

        boundary, multipart_body = build_multipart_form_data("package", "saved.zip", data)
        response, payload = self.request(
            "POST",
            "/api/scenario-library/import",
            body=multipart_body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        self.assertEqual(response.status, 200)
        imported_id = json.loads(payload.decode("utf-8"))["saved_id"]
        self.assertNotEqual(imported_id, saved_id)

        response, payload = self.request_json("POST", "/api/scenario-library/save", {"scenario": {"metadata": {}}, "images": {}})
        self.assertEqual(response.status, 400)

        response, payload = self.request_json(
            "POST",
            "/api/scenario-library/save",
            {"scenario": scenario, "images": {"images/portrait.png": "data:audio/wav;base64,AAAA"}, "source_type": "demo"},
        )
        self.assertEqual(response.status, 400)

        boundary, gameplay_zip = build_multipart_form_data("package", "gameplay.zip", self.build_gameplay_zip())
        response, payload = self.request(
            "POST",
            "/api/scenario-library/import",
            body=gameplay_zip,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        self.assertEqual(response.status, 400)

        response, payload = self.request_json("DELETE", f"/api/scenario-library/delete?id={imported_id}")
        self.assertEqual(response.status, 200)
        response, payload = self.request_json("DELETE", f"/api/scenario-library/delete?id={saved_id}")
        self.assertEqual(response.status, 200)
        response, payload = self.request_json("GET", "/api/scenario-library/list")
        self.assertEqual(payload["items"], [])

    def build_gameplay_zip(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("scenario.json", json.dumps(server.load_demo_scenario(), ensure_ascii=False))
            archive.writestr("images/portrait.png", base64.b64decode(TINY_PNG_DATA_URL.split(",", 1)[1]))
        return buffer.getvalue()


if __name__ == "__main__":
    unittest.main()
