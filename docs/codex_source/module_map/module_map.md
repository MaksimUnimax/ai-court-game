# Module Map

This file will be appended later.

## MM-2026-05-25-001 — Current module ownership after scenario library, TTS and image viewer foundation

Status: current_baseline

### app/server.py

Owns HTTP endpoint wiring:
- scenario validation/start/import;
- demo scenario;
- Silero TTS endpoint wiring;
- scenario library API wiring;
- static file serving.

It should not become a scenario-specific logic file. New case behavior must come from scenario data.

### app/scenario_library.py

Owns the portable SQLite scenario library:
- schema initialization;
- save/list/load/delete;
- export/import portable ZIP;
- full scenario JSON storage;
- image BLOB storage with metadata;
- path/data URL safety;
- no generated audio storage.

Runtime DB path:
- `.runtime/scenario-library/scenario_library.sqlite3`

The DB is runtime data and must not be committed.

### static/app.js

Owns browser-side gameplay and UI state:
- scenario loading;
- active-case IndexedDB persistence;
- delete active case;
- restart scenario;
- scenario library UI;
- visual asset classification;
- case cover selection;
- participant portraits;
- case illustration gallery;
- image viewer controls;
- Silero TTS playback UI;
- TTS volume/pause/playback state.

Important boundary:
- no uploaded-audio/audio_assets workflow;
- no scenario-specific hardcode.

### static/styles.css

Owns visual layout and viewer behavior:
- case cover layout;
- participant card layout;
- gallery layout;
- image viewer viewport;
- zoom/drag-pan styling.

### docs/codex_source/prompts/scenario_creation_canon.md

Canonical source for future scenario generation rules.

Future scenario generation must follow this document and update it when playtesting reveals missing or weak rules.

### Runtime-only paths

These are not git-tracked source:
- `.runtime/scenario-library/scenario_library.sqlite3`
- `.runtime/silero-venv`
- `.runtime/tts-cache`

### Out of scope for current project block

Telegram/Hermes/OpenAI/provider code is not part of this AI Court Game block.

## MODULE-MAP-2026-05-26-001 — Current runtime, scenario, and docs ownership

### Runtime/server

- `app/server.py`
  - Owns HTTP serving, scenario validation/start/import routes, TTS endpoint wiring, and scenario library API wiring.
  - Must run through `.runtime/silero-venv/bin/python` for Silero TTS availability.
  - Must not be started in live mode with bare system `python3 app/server.py`.

- `scripts/start_live_server.sh`
  - Canonical committed helper for starting the live server from the repo root.
  - Execs `/opt/ai-court-game/.runtime/silero-venv/bin/python app/server.py`.

- host `/etc/systemd/system/ai-court-game.service`
  - Host-level service unit, not git-tracked.
  - Owns persistent live process start.
  - Uses `/opt/ai-court-game/scripts/start_live_server.sh`.
  - Keeps live process systemd-owned.

### Scenario library

- `app/scenario_library.py`
  - Owns portable SQLite scenario library logic:
    save/list/load/export/import/delete.
  - Owns image BLOB storage and ZIP portability.

- `.runtime/scenario-library/scenario_library.sqlite3`
  - Runtime SQLite DB.
  - Not git-tracked.

### Frontend/player UI

- `static/app.js`
  - Owns frontend state, scenario loading, staged file/package loading flow, active-case persistence, scenario library UI, visual asset classification, image viewer controls and Silero TTS playback UI.
  - TTS must be manual on user click, not automatic after scenario start.

- `static/index.html`
  - Owns static player page structure and load controls.

- `static/styles.css`
  - Owns visual layout including cover, gallery, image viewer viewport/zoom/drag-pan styling and load status/progress display.

### Scenario rules and docs memory

- `docs/codex_source/prompts/scenario_creation_canon.md`
  - Canonical source for future scenario generation rules.
  - Must be updated through docs-only runs after playtesting reveals reusable scenario quality rules.

- `docs/codex_source/prompts/scenario_prompt_rules.md`
  - Appendable supporting prompt-rule document.
  - Must stay aligned with the main scenario canon where applicable.

- `docs/codex_source/context/current_dialogue_context.md`
  - Append-only dialogue/project memory.

- `docs/codex_source/roadmap/roadmap.md`
  - Append-only roadmap memory.

- `docs/codex_source/module_map/module_map.md`
  - Append-only module responsibility map.

### GitHub access

- repo remote currently uses SSH alias `github.com-ai-court-game`.
- server push access is via configured SSH key path `/root/.ssh/github_openscript_ed25519`.
- This is an operational or security access path, not application code.
- Do not change or remove credentials without explicit user approval.
