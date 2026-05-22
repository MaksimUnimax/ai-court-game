import base64
import io
import json
import unittest
from copy import deepcopy
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
        self.assertGreaterEqual(result["package_summary"]["image_count"], 1)
        self.assertTrue(result["warnings"])

    def test_zip_case_package_rejects_path_traversal(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("scenario.json", json.dumps(server.load_demo_scenario(), ensure_ascii=False))
            archive.writestr("../evil.png", b"evil")
        with self.assertRaises(ValueError):
            server.import_case_package_from_zip_bytes(buffer.getvalue(), archive_name="evil.zip")


if __name__ == "__main__":
    unittest.main()
