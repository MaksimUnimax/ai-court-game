# Current Status — AI Court Game

## STATUS-2026-05-25-001 — Scenario-generation baseline after UI/TTS/library foundation

AI Court Game is now ready to begin generating and testing full isolated detective-case scenarios according to `docs/codex_source/prompts/scenario_creation_canon.md`.

Current live baseline:
- live URL: http://78.17.68.165:8000/
- scenarios load through JSON/ZIP;
- active case persists in browser IndexedDB;
- active case can be deleted;
- active scenario can be restarted;
- portable server-side scenario library exists on SQLite;
- scenario library stores full scenario JSON and illustrations;
- scenario library supports save/list/load/export/import/delete;
- SQLite DB path is `.runtime/scenario-library/scenario_library.sqlite3` and is not git-tracked;
- exported saved scenario ZIP contains `manifest.json`, `scenario.json`, `images/**`, and `library_record.json`;
- generated Silero audio is not stored in the library;
- uploaded-audio/audio_assets workflow is removed and forbidden;
- Silero TTS is installed locally under `.runtime/silero-venv`;
- TTS endpoint is `POST /api/tts/synthesize`;
- TTS reads scenario text for case intro, participant replies, evidence detail, verdict and final explanation;
- TTS includes volume control, pause/resume/stop, participant speaker mapping and Russian number normalization;
- visual assets are separated:
  - `case_cover` only in the cover block;
  - `participant_portrait` only in participant cards;
  - `case_illustration` only in “Иллюстрации дела”;
- case cover replaces the old large technical active-case info block;
- canonical cover ratio is `695 / 616 = 1.1282467532467533`;
- technical package details are collapsed/reduced;
- image viewer supports large view, zoom buttons, wheel zoom, reset zoom, drag-to-pan with left mouse button, scrollbars fallback, and immediate wheel zoom reversal.

Current stop-point:
- product foundation is ready for the first full scenario-generation iteration;
- next work should generate one isolated detective episode: scenario JSON plus illustration prompts;
- after testing, scenario weaknesses must be converted into updates to `scenario_creation_canon.md`.

Do not restart old work unless fresh proof says it is broken:
- do not reintroduce uploaded audio or `audio_assets`;
- do not implement another TTS provider;
- do not redesign the SQLite scenario library unless the existing portable library fails;
- do not hardcode scenario-specific logic.
