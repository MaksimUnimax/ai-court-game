import base64
import http.client
import io
import json
import threading
import unittest
from copy import deepcopy
from unittest import mock
import zipfile

from app import server


class ScenarioValidationTests(unittest.TestCase):
    def test_demo_scenario_is_valid(self):
        scenario = server.load_demo_scenario()
        self.assertEqual(server.validate_scenario(scenario), [])

    def test_start_state_contains_expected_keys(self):
        scenario = server.normalize_scenario(server.load_demo_scenario())
        state = server.build_initial_state(scenario)
        self.assertIn("completed_actions", state)
        self.assertIn("unlocked_questions", state)
        self.assertIn("unlocked_evidence", state)
        self.assertFalse(state["finished"])

    def test_invalid_reference_is_reported(self):
        scenario = deepcopy(server.load_demo_scenario())
        scenario["dialogue_actions"][0]["participant_id"] = "missing_participant"
        errors = server.validate_scenario(scenario)
        self.assertTrue(any("unknown participant_id" in error for error in errors))

    def test_invalid_visual_asset_reference_is_reported(self):
        scenario = deepcopy(server.load_demo_scenario())
        scenario["visual_assets"][0]["target_id"] = "missing_participant"
        errors = server.validate_scenario(scenario)
        self.assertTrue(any("unknown target_id" in error for error in errors))

    def test_zip_case_package_import_is_valid(self):
        scenario = deepcopy(server.load_demo_scenario())
        scenario["visual_assets"] = [
            {
                "id": "va_alina_portrait",
                "type": "participant_portrait",
                "target_type": "participant",
                "target_id": "p_alina",
                "file": "images/alina_morozova.png",
                "title": "Портрет Алины",
                "alt": "Портрет участницы Алины",
                "placement": "participant_card",
                "hidden_purpose": "Внутреннее описание, не показывать игроку",
            }
        ]
        png_bytes = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+iXwAAAABJRU5ErkJggg=="
        )
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("package/scenario.json", json.dumps(scenario, ensure_ascii=False))
            archive.writestr("package/images/alina_morozova.png", png_bytes)
            archive.writestr("package/images/unused.png", png_bytes)
        result = server.import_case_package_from_zip_bytes(buffer.getvalue(), archive_name="package.zip")
        self.assertTrue(result["validation"]["ok"])
        self.assertIn("images/alina_morozova.png", result["images"]["by_path"])
        self.assertIn("alina_morozova.png", result["images"]["by_basename"])
        self.assertEqual(result["package_summary"]["image_count"], 2)
        self.assertGreaterEqual(result["package_summary"]["matched_image_count"], 1)
        self.assertNotIn("audio", result)

    def test_zip_case_package_rejects_path_traversal(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("scenario.json", json.dumps(server.load_demo_scenario(), ensure_ascii=False))
            archive.writestr("../evil.png", b"evil")
        with self.assertRaises(ValueError):
            server.import_case_package_from_zip_bytes(buffer.getvalue(), archive_name="evil.zip")


class TtsValidationTests(unittest.TestCase):
    def test_tts_rejects_empty_text(self):
        with self.assertRaises(server.TTSRequestError):
            server.validate_tts_payload({"text": "   "})

    def test_tts_rejects_too_long_text(self):
        with self.assertRaises(server.TTSRequestError):
            server.validate_tts_payload({"text": "а" * (server.MAX_TTS_TEXT_LENGTH + 1)})

    def test_tts_accepts_supported_voice_roles(self):
        for voice_role in ("narrator", "participant", "verdict", "evidence"):
            payload = server.validate_tts_payload({"text": "Тестовая реплика", "voice_role": voice_role})
            self.assertEqual(payload["voice_role"], voice_role)

    def test_tts_normalizes_numbers_percentages_and_time(self):
        normalized = server.normalize_tts_text_ru("В деле есть 4 доказательства. Сигнал прозвучал в 22:40. Вероятность 15%.")
        self.assertIn("четыре", normalized)
        self.assertIn("пятнадцать процентов", normalized)
        self.assertNotIn("22:40", normalized)

    def test_tts_normalizes_money_and_years(self):
        normalized = server.normalize_tts_text_ru("В 2026 году спорили о 500 руб.")
        self.assertIn("две тысячи двадцать шесть", normalized)
        self.assertIn("пятьсот рублей", normalized)


class TtsSpeakerSelectionTests(unittest.TestCase):
    def setUp(self):
        server._tts_participant_speaker_map.clear()

    def test_same_participant_keeps_same_speaker(self):
        available = ("aidar", "baya", "kseniya", "eugene", "xenia")
        payload = {"voice_role": "participant", "participant_id": "accused"}
        speaker_a = server.select_tts_speaker(payload, available)
        speaker_b = server.select_tts_speaker(payload, available)
        self.assertEqual(speaker_a, speaker_b)

    def test_different_participants_get_different_speakers_when_possible(self):
        available = ("aidar", "baya", "kseniya", "eugene", "xenia")
        speaker_a = server.select_tts_speaker({"voice_role": "participant", "participant_id": "accused"}, available)
        speaker_b = server.select_tts_speaker({"voice_role": "participant", "participant_id": "prosecutor"}, available)
        speaker_c = server.select_tts_speaker({"voice_role": "participant", "participant_id": "defense"}, available)
        self.assertEqual(len({speaker_a, speaker_b, speaker_c}), 3)


class TtsEndpointTests(unittest.TestCase):
    def setUp(self):
        self.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.AppHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)

    def post_json(self, path, payload):
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_address[1], timeout=5)
        try:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            connection.request("POST", path, body=body, headers={"Content-Type": "application/json"})
            response = connection.getresponse()
            data = response.read()
            return response.status, response.getheaders(), json.loads(data.decode("utf-8"))
        finally:
            connection.close()

    def test_tts_endpoint_fails_gracefully_when_runtime_unavailable(self):
        with mock.patch.object(server, "is_tts_runtime_installed", return_value=False):
            status, _headers, payload = self.post_json(
                "/api/tts/synthesize",
                {"text": "Суд заслушал описание дела.", "voice_role": "narrator"},
            )
        self.assertEqual(status, 503)
        self.assertFalse(payload["ok"])
        self.assertTrue(payload["errors"])


if __name__ == "__main__":
    unittest.main()
