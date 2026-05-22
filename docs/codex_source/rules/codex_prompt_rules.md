# Codex Prompt Rules — AI Court Game

STATUS: INITIAL_ADAPTED_FROM_PUBLIC_RULES

Prompt contract:

- every prompt must name the exact docs Codex should read when docs are needed;
- every prompt must name exact directories if several files are involved;
- every prompt must include the active task card when a task card exists and is relevant;
- every prompt must include the minimal source set, not "read everything";
- for append-only files, Codex reads manifest + tail only;
- `DOCS_TO_READ` is mandatory for AI Court Game technical tasks unless the prompt explicitly says docs are not needed and explains why;
- each `DOCS_TO_READ` entry must include path, why, and required yes/no;
- `RUN_MODE` is mandatory for every technical prompt;
- allowed `RUN_MODE` values are `docs_only`, `proof_only`, `design_only`, `combined_proof_design_fix`, `fix_after_approved_design`, and `repeat_proof`;
- when `RUN_MODE: combined_proof_design_fix`, the prompt must include `COMBINED_RUN_GUARD`;
- combined runs must include a `COMBINED_RUN` report block.

Stop rules:

- if a required doc is `stub`, `needs_import`, or missing, stop with `STOP_DOCS_MISSING`;
- if the prompt does not provide exact paths, ask for clarification or STOP instead of guessing;
- if a task requires vendor/API docs, do not substitute project docs;
- if a task requires project docs, do not substitute roadmap/context history;
- do not infer missing task facts from memory alone;
- if docs contradict each other and the prompt does not name the winning source, STOP;
- if `RUN_MODE: combined_proof_design_fix` is requested without `COMBINED_RUN_GUARD`, STOP;
- if a combined run cannot satisfy the guard, STOP before editing;
- if a task card contains a real safety contradiction with source-of-truth docs, STOP.

Repository docs rule:

- the docs are available under `docs/codex_source/**`;
- Codex does not need the entire repo tree;
- Codex should be given only the files relevant to the task.

Baseline modes:

Mode A — assistant-provided baseline plus exact docs.

Mode B — exact repo-docs baseline extracted from listed files.

High-risk tasks should prefer Mode A plus exact docs, or a proof-only baseline extraction run before any fix.

Prompt template rule:

Every technical prompt should include:

- `ТЗ проверено.`
- `DOCS_TO_READ`
- `RUN_MODE`
- `DOCUMENTATION_GATE`
- `DOCUMENTATION_BASELINE` or instruction to extract exact baseline from listed docs
- `RUNTIME_BASELINE`
- `UNIVERSALITY_CHECK`
- `ALLOWED_SCOPE`
- `FORBIDDEN_SCOPE`
- `CHECKS`
- `ACCEPTANCE`
- `REPORT`

If combined mode is used, also include:

- `COMBINED_RUN_GUARD`
- `COMBINED_RUN`
- `TASK_CARD_STATUS`

