# ENTRYPOINT FOR CHATGPT — AI Court Game

STATUS: initial

Purpose:

- This is the first file ChatGPT should read at the start of a new AI Court Game project dialogue.
- It exists so ChatGPT and Codex use repo memory instead of guessing from prior chat state.
- Do not rely only on memory before checking this entrypoint and the current docs index.

Current known repo:

- Public repo: `https://github.com/MaksimUnimax/ai-court-game`
- Local project root: `/opt/ai-court-game`
- Docs root: `docs/codex_source/**`

Current bootstrap state:

- Root `AGENTS.md` should exist.
- Rules should exist under `docs/codex_source/rules/**`.
- Product ТЗ is not written yet.
- Roadmap content is not written yet.
- Application code is not created yet.

Main read path:

1. `AGENTS.md`
2. `docs/codex_source/index.yaml`
3. exact files listed by ChatGPT in the current prompt

Notes:

- Roadmap/context are historical/project memory, not source-of-truth for external API behavior.
- For technical tasks, read exact required docs only.
- For append-only updates, read manifest + tail only, not the entire large context.
- If a required doc is missing/stub/contradictory, future fix-runs must stop with `STOP_DOCS_MISSING`.

