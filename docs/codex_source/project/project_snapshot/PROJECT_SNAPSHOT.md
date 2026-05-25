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
