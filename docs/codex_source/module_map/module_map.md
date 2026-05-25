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
