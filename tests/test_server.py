import unittest
from copy import deepcopy

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


if __name__ == "__main__":
    unittest.main()
