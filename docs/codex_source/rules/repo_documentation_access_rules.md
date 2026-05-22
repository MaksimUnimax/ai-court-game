# Repo Documentation Access Rules — AI Court Game

STATUS: INITIAL_ADAPTED_FROM_PUBLIC_RULES

## 1. Why this exists

Project documentation is stored in the AI Court Game repo under:

- `docs/codex_source/**`

Codex works inside:

- `/opt/ai-court-game`

ChatGPT can read the public repo:

- `https://github.com/MaksimUnimax/ai-court-game`

Future prompts do not need to inline every large document just because Codex lacks files.

But this does not allow Codex to browse everything.

Core rule:

Codex must read only the exact docs named by ChatGPT in `DOCS_TO_READ` for the current task.

## 2. `DOCS_TO_READ` is mandatory for technical tasks

Each entry must include:

- path;
- why this file is needed;
- whether it is required.

Example:

```yaml
DOCS_TO_READ:
  - path: docs/codex_source/ENTRYPOINT_FOR_CHATGPT.md
    why: repo docs entrypoint and read policy
    required: yes
  - path: docs/codex_source/project/technical_spec.md
    why: project ТЗ for the current feature
    required: when feature ТЗ exists
```
