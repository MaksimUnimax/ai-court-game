import re
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
APP_JS = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
INDEX_HTML = (ROOT / "static" / "index.html").read_text(encoding="utf-8")


def extract_block(source, start_marker, end_marker):
    start = source.index(start_marker)
    end = source.index(end_marker, start)
    return source[start:end]


class PlayerUiControlTests(unittest.TestCase):
    def test_demo_button_is_absent_from_normal_ui(self):
        self.assertNotIn("load-demo-btn", INDEX_HTML)
        self.assertNotIn("Загрузить демо-сценарий", INDEX_HTML)
        self.assertNotIn("load-demo-btn", APP_JS)

    def test_change_handler_stages_files_without_loading(self):
        block = extract_block(
            APP_JS,
            'dom.casePackageInput.addEventListener("change"',
            'if (dom.loaderPanel) {',
        )
        self.assertIn('dom.casePackageInput.addEventListener("change"', block)
        self.assertIn("stageCaseFiles(dom.casePackageInput.files", block)
        self.assertNotIn("loadCasePackageFromFiles(dom.casePackageInput.files", block)

    def test_explicit_load_button_triggers_loading(self):
        block = extract_block(
            APP_JS,
            'if (dom.loadCaseBtn) {',
            'dom.startScenarioBtn.addEventListener("click"',
        )
        self.assertIn('dom.loadCaseBtn.addEventListener("click"', block)
        self.assertIn("loadCasePackageFromFiles(stagedFiles", block)
        self.assertNotIn("playCaseIntroNarration({ manual: false })", block)

    def test_scenario_start_does_not_auto_play_tts(self):
        self.assertNotIn("playCaseIntroNarration({ manual: false })", APP_JS)
        self.assertNotIn("playDialogueNarration(action.id, { manual: false })", APP_JS)
        self.assertNotIn("playVerdictNarration(verdict.id, { manual: false })", APP_JS)

    def test_upload_status_block_is_directly_under_load_controls(self):
        load_button_index = INDEX_HTML.index('id="load-case-btn"')
        status_panel_index = INDEX_HTML.index('id="validation-panel"')
        start_button_index = INDEX_HTML.index('id="start-scenario-btn"')
        voice_controls_index = INDEX_HTML.index('class="voice-controls"')
        self.assertLess(load_button_index, status_panel_index)
        self.assertLess(status_panel_index, start_button_index)
        self.assertLess(status_panel_index, voice_controls_index)
        self.assertIn('class="status-panel package-details-panel load-status-panel empty-state"', INDEX_HTML)


if __name__ == "__main__":
    unittest.main()
