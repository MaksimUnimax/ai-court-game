import base64
import io
import json
import wave
import unittest
from copy import deepcopy
import zipfile

from app import server


class ScenarioValidationTests(unittest.TestCase):
    def make_wav_bytes(self):
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(8000)
            wav_file.writeframes(b"\x00\x00" * 8)
        return buffer.getvalue()

    def test_demo_scenario_is_valid(self):
        scenario = server.load_demo_scenario()
        self.assertEqual(server.validate_scenario(scenario), [])

    def test_voice_profile_without_audio_is_valid(self):
        scenario = deepcopy(server.load_demo_scenario())
        scenario["participants"][0]["voice_profile"] = {
            "provider_hint": "piper",
            "voice_id": "older_male_calm",
            "gender": "male",
            "age": "older",
            "style": "тихий, уставший, немного хриплый",
            "pace": "slow",
            "emotion": "сдержанная тревога",
        }
        self.assertEqual(server.validate_scenario(scenario), [])

    def test_voice_metadata_and_audio_assets_are_valid(self):
        scenario = deepcopy(server.load_demo_scenario())
        participant_id = scenario["participants"][0]["id"]
        action_id = scenario["dialogue_actions"][0]["id"]
        scenario["participants"][0]["voice_profile"] = {
            "provider_hint": "piper",
            "voice_id": "older_male_calm",
            "gender": "male",
            "age": "older",
            "style": "тихий, уставший, немного хриплый",
            "pace": "slow",
            "emotion": "сдержанная тревога",
        }
        scenario["dialogue_actions"][0]["voice_direction"] = {
            "tone": "тихо, устало, без агрессии",
            "pace": "slow",
            "emotion": "тревога",
            "pause_style": "короткие паузы перед важными словами",
        }
        scenario["audio_assets"] = [
            {
                "id": "audio_q_accused_night_route",
                "type": "dialogue_response",
                "target_type": "dialogue_action",
                "target_id": action_id,
                "participant_id": participant_id,
                "file": "audio/accused/q_accused_night_route.wav",
                "title": "Ответ Семёна о ночном обходе",
                "transcript_source": "response_text",
            }
        ]
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
        participant_id = scenario["participants"][0]["id"]
        action_id = scenario["dialogue_actions"][0]["id"]
        scenario["audio_assets"] = [
            {
                "id": "audio_q_accused_night_route",
                "type": "dialogue_response",
                "target_type": "dialogue_action",
                "target_id": action_id,
                "participant_id": participant_id,
                "file": "audio/accused/q_accused_night_route.wav",
                "title": "Ответ Семёна о ночном обходе",
                "transcript_source": "response_text",
            }
        ]
        png_bytes = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+iXwAAAABJRU5ErkJggg=="
        )
        wav_bytes = self.make_wav_bytes()
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("package/scenario.json", json.dumps(scenario, ensure_ascii=False))
            archive.writestr("package/images/alina_morozova.png", png_bytes)
            archive.writestr("package/images/unused.png", png_bytes)
            archive.writestr("package/audio/accused/q_accused_night_route.wav", wav_bytes)
            archive.writestr("package/audio/prosecutor/unused.wav", wav_bytes)
        result = server.import_case_package_from_zip_bytes(buffer.getvalue(), archive_name="package.zip")
        self.assertTrue(result["validation"]["ok"])
        self.assertIn("images/alina_morozova.png", result["images"]["by_path"])
        self.assertIn("alina_morozova.png", result["images"]["by_basename"])
        self.assertIn("audio/accused/q_accused_night_route.wav", result["audio"]["by_path"])
        self.assertIn("q_accused_night_route.wav", result["audio"]["by_basename"])
        self.assertGreaterEqual(result["package_summary"]["image_count"], 1)
        self.assertGreaterEqual(result["package_summary"]["audio_asset_count"], 1)
        self.assertGreaterEqual(result["package_summary"]["audio_count"], 1)
        self.assertTrue(result["warnings"])

    def test_zip_case_package_reports_audio_diagnostics(self):
        scenario = deepcopy(server.load_demo_scenario())
        first_action_id = scenario["dialogue_actions"][0]["id"]
        second_action_id = scenario["dialogue_actions"][1]["id"]
        scenario["audio_assets"] = [
            {
                "id": "audio_matched_basename",
                "type": "dialogue_response",
                "target_type": "dialogue_action",
                "target_id": first_action_id,
                "participant_id": scenario["dialogue_actions"][0]["participant_id"],
                "file": "audio/accused/q_matched_basename.wav",
                "title": "Совпадение по basename",
                "transcript_source": "response_text",
            },
            {
                "id": "audio_missing",
                "type": "dialogue_response",
                "target_type": "dialogue_action",
                "target_id": second_action_id,
                "participant_id": scenario["dialogue_actions"][1]["participant_id"],
                "file": "audio/prosecutor/missing_audio.wav",
                "title": "Отсутствующий файл",
                "transcript_source": "response_text",
            },
        ]
        wav_bytes = self.make_wav_bytes()
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("package/scenario.json", json.dumps(scenario, ensure_ascii=False))
            archive.writestr("package/sounds/q_matched_basename.wav", wav_bytes)
        result = server.import_case_package_from_zip_bytes(buffer.getvalue(), archive_name="package.zip")
        self.assertTrue(result["validation"]["ok"])
        self.assertEqual(result["package_summary"]["audio_asset_count"], 2)
        self.assertEqual(result["package_summary"]["audio_count"], 1)
        self.assertEqual(result["package_summary"]["matched_audio_count"], 1)
        self.assertEqual(result["package_summary"]["missing_audio_count"], 1)
        self.assertIn("Для audio_assets не найдены аудиофайлы: audio_missing", result["warnings"])
        self.assertIn("sounds/q_matched_basename.wav", result["audio"]["by_path"])
        self.assertIn("q_matched_basename.wav", result["audio"]["by_basename"])

    def test_zip_case_package_reports_generic_missing_audio_warning(self):
        scenario = deepcopy(server.load_demo_scenario())
        first_action_id = scenario["dialogue_actions"][0]["id"]
        scenario["audio_assets"] = [
            {
                "id": "audio_missing_only",
                "type": "dialogue_response",
                "target_type": "dialogue_action",
                "target_id": first_action_id,
                "participant_id": scenario["dialogue_actions"][0]["participant_id"],
                "file": "audio/accused/missing_only.wav",
                "title": "Только отсутствующий файл",
                "transcript_source": "response_text",
            }
        ]
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("package/scenario.json", json.dumps(scenario, ensure_ascii=False))
        result = server.import_case_package_from_zip_bytes(buffer.getvalue(), archive_name="package.zip")
        self.assertTrue(result["validation"]["ok"])
        self.assertEqual(result["package_summary"]["audio_asset_count"], 1)
        self.assertEqual(result["package_summary"]["audio_count"], 0)
        self.assertEqual(result["package_summary"]["matched_audio_count"], 0)
        self.assertEqual(result["package_summary"]["missing_audio_count"], 1)
        self.assertIn("В сценарии есть audio_assets, но соответствующие аудиофайлы не найдены.", result["warnings"])

    def test_zip_case_package_reports_orphan_audio_warning(self):
        scenario = deepcopy(server.load_demo_scenario())
        wav_bytes = self.make_wav_bytes()
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("package/scenario.json", json.dumps(scenario, ensure_ascii=False))
            archive.writestr("package/audio/unused.wav", wav_bytes)
        result = server.import_case_package_from_zip_bytes(buffer.getvalue(), archive_name="package.zip")
        self.assertTrue(result["validation"]["ok"])
        self.assertEqual(result["package_summary"]["audio_asset_count"], 0)
        self.assertEqual(result["package_summary"]["audio_count"], 1)
        self.assertEqual(result["package_summary"]["matched_audio_count"], 0)
        self.assertEqual(result["package_summary"]["unmatched_audio_count"], 1)
        self.assertIn("Загружены аудиофайлы, но в сценарии нет привязок audio_assets.", result["warnings"])

    def test_zip_case_package_rejects_path_traversal(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("scenario.json", json.dumps(server.load_demo_scenario(), ensure_ascii=False))
            archive.writestr("../evil.png", b"evil")
        with self.assertRaises(ValueError):
            server.import_case_package_from_zip_bytes(buffer.getvalue(), archive_name="evil.zip")


if __name__ == "__main__":
    unittest.main()
