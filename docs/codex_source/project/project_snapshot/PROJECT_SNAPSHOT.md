# Project Snapshot — AI Court Game

## SNAPSHOT-2026-05-25-001 — Scenario-generation foundation

AI Court Game is a Russian click-only court detective game. The current product baseline supports loading scenario JSON/ZIP, playing a data-driven court case, using visual assets, saving liked scenarios, and listening to Silero TTS generated from scenario text.

Current source-of-truth docs:
- `docs/codex_source/prompts/scenario_creation_canon.md`
- `docs/codex_source/project/scenario_engine_design.md`
- `docs/codex_source/context/current_dialogue_context.md`
- `docs/codex_source/roadmap/roadmap.md`
- `docs/codex_source/module_map/module_map.md`

Current implementation baseline:
- live URL: http://78.17.68.165:8000/
- JSON/ZIP scenario load;
- IndexedDB active-case persistence;
- active case delete;
- scenario restart;
- portable SQLite scenario library;
- library save/list/load/export/import/delete;
- local Silero TTS;
- case cover;
- participant portraits;
- case illustrations;
- image viewer with zoom, wheel zoom, reset, drag-to-pan;
- visual asset separation;
- no uploaded audio.

Current next step:
Generate one full isolated scenario episode plus illustration prompts, test it in live UI, save a liked version to the scenario library, then update scenario canon with any new rules learned from playtesting.

## SNAPSHOT-2026-05-26-002 — Stable live runtime and scenario playtesting loop

AI Court Game now has a stabilized live runtime path and updated scenario-generation canon.

Runtime snapshot:

- live server runs through host `ai-court-game.service`
- service starts the committed helper `scripts/start_live_server.sh`
- helper runs Python from `.runtime/silero-venv`
- Silero TTS is available through the live process
- previous bare system Python start caused Silero runtime errors and must not be used as the live path

Scenario-generation snapshot:

- project is in anthology-style scenario generation and playtesting
- each scenario is isolated
- each scenario should vary environment, genre, mystery mechanic and visual style
- player-facing text must show facts, not conclusions
- substantial site descriptions and multi-suspect verdict choices are now required where applicable
- every visible participant requires a portrait

Security/admin snapshot:

- server can push to GitHub through an existing SSH key configured in root SSH config
- this was proven without printing secrets
- future access policy is pending explicit user decision
