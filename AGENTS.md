# AGENTS.md для проекта AI Court Game

## Назначение

Этот файл является корневым контрактом выполнения для Codex в проекте AI Court Game.

Рабочий repo проекта:
- `https://github.com/MaksimUnimax/ai-court-game`
- локальный корень проекта: `/opt/ai-court-game`

Codex работает из корня личного проекта `/opt/ai-court-game`.

Если Codex находится не в `/opt/ai-court-game` и получает задачу разработки AI Court Game, нужно STOP. В других repo можно работать только по отдельной задаче, явно относящейся к этим repo.

После bootstrap главным рабочим файлом становится именно `/opt/ai-court-game/AGENTS.md`.

## Главный режим работы Codex

1. Codex работает только по prompt от ChatGPT.
2. Один run = одна задача.
3. Пользователь не проектирует техническую задачу сам.
4. Если задача неясна, нужно STOP.
5. Если prompt противоречит этому файлу, нужно STOP и сообщить конфликт.
6. Перед fix нужен proof/current state.
7. Не гадать, если факт не доказан.
8. Не делать broad refactor, если задача этого не просит.
9. Не писать application code в docs-only задачах.
10. Не переносить правила из других проектов без явного prompt.

## Перед началом каждого run

1. Убедиться, что Codex находится в правильном repo.
2. Для задач AI Court Game корень должен быть `/opt/ai-court-game`.
3. Прочитать `/opt/ai-court-game/AGENTS.md` перед работой.
4. Проверить `git status` и понять, что уже изменено.
5. Проверить нужные документы и scope задачи.
6. Не начинать fix без proof/current state.
7. Если prompt требует работать в другом repo как будто это AI Court Game, нужно STOP.
8. Если нужен public proof, сначала доказать фактический текущий state, потом менять.

## Repo documentation workflow

Документация проекта хранится в repo под:

- `docs/codex_source/**`

Public GitHub repo проекта:

- `https://github.com/MaksimUnimax/ai-court-game`

Главные документы:

- `docs/codex_source/ENTRYPOINT_FOR_CHATGPT.md`
- `docs/codex_source/index.yaml`
- `docs/codex_source/rules/**`
- `docs/codex_source/context/**`
- `docs/codex_source/roadmap/**`
- `docs/codex_source/module_map/**`
- `docs/codex_source/project_snapshot/**`
- `docs/codex_source/task_cards/**`
- `docs/codex_source/templates/**`
- `docs/codex_source/schemas/**`

Codex не должен читать весь `docs/codex_source/**` по умолчанию. Codex читает только exact paths, указанные ChatGPT в текущем prompt.

Если требуемый документ отсутствует, является stub, противоречит другим документам или не указан в prompt, нужно STOP вместо догадок.

## Секреты

Не читать и не печатать:

- `.env`
- `.env.*`
- `auth.json`
- tokens
- API keys
- OpenAI API keys
- image generation API keys
- payment provider keys
- private SSH keys
- runtime secret files
- database passwords
- production credentials

Private key никогда не печатать.

Public deploy key можно печатать только если prompt явно просит создать deploy key.

Токены не просить и не использовать без отдельного разрешения.

## Git и source of truth

Source живёт в git.

Runtime отдельно.

Не считать runtime-only fix финалом.

Не трогать unrelated dirty files.

Commit/push делать только когда prompt требует.

Отчёт должен показывать `git status` before/after.

Stage только файлы в разрешённом scope.

Не коммитить случайные изменения из соседних задач.

Если `git status` содержит неожиданное, не объяснённое изменение, нужно STOP.

Основная ветка: `main`.

Force push запрещён без явного разрешения.

## Source/runtime boundary

Git-tracked source является source of truth.

Runtime, temporary files, generated files, uploads, secrets and local caches are not source of truth.

Permanent fixes must be made in git-tracked source/docs.

Runtime-only edits are not final unless the prompt explicitly says this is a temporary runtime diagnostic.

## AI Court Game project boundary

AI Court Game is a browser game where the user plays as a judge and resolves AI-generated court cases.

Current planned product direction, not implementation yet:

- browser game;
- backend;
- database;
- authorization;
- roles: guest, user, admin;
- guest can play existing cases but cannot generate new cases;
- user can generate cases only with game currency;
- admin can generate without limits;
- OpenAI API planned;
- cases generated once at case creation;
- player uses mouse clicks only;
- mixed case types: criminal case and dispute between two people;
- no witnesses in MVP;
- criminal verdict: guilty / not guilty;
- dispute verdict: side A right / side B right;
- portraits, evidence images and case cover planned;
- evidence images are mini-scenes that matter to the logic;
- anti-repeat tags and generation history planned;
- direct generation for MVP, even if slow.

This section is only project boundary context. Full ТЗ and roadmap will be written later.

## Documentation

Docs-update run only by prompt from ChatGPT.

Update only explicitly named documents.

Do not update docs from memory.

Use proven facts only:

- accepted Codex reports;
- current files;
- `git status`;
- explicit prompt text from ChatGPT;
- user-approved product decisions.

Append-only memory files:

- `docs/codex_source/context/current_dialogue_context.md`
- `docs/codex_source/roadmap/roadmap.md`
- `docs/codex_source/module_map/module_map.md`

For append-only files:

- append new blocks only;
- keep stable block ids;
- keep manifest metadata in sync;
- read manifest + tail only for updates;
- do not destructively rewrite history.

## Run modes

Allowed run modes:

- `docs_only`
- `proof_only`
- `design_only`
- `combined_proof_design_fix`
- `fix_after_approved_design`
- `repeat_proof`

Docs-only tasks must not change application code.

High-risk tasks require separate proof/design before fix.

High-risk tasks include:

- auth;
- secrets;
- provider configuration;
- credential handling;
- payment/monetization paths;
- OpenAI or other paid API behavior;
- image generation paid-resource behavior;
- systemd/nginx/deploy;
- database schema or migrations;
- runtime storage migrations;
- public/private repo publication;
- broad architecture changes;
- tasks touching more than 2-3 modules;
- tasks with unclear module ownership.

## Combined run guard

For `combined_proof_design_fix`, Codex may edit only if:

- required docs are provided and read;
- documentation gate passes;
- exact affected modules/files are found;
- affected scope matches `ALLOWED_SCOPE`;
- the fix is narrow and local;
- no broad refactor is needed;
- no new architecture decision is required;
- no secrets/auth/runtime secret paths are read or touched;
- no dangerous runtime/system/deploy mutation is needed;
- no paid-resource behavior changes without explicit permission;
- tests/checks are available and can be run;
- working tree guard confirms unrelated dirty files will not be staged;
- Codex can explain proof and design summary before edits.

If any condition fails, STOP before editing.

## Format of report

Always print final report between:

`CHATGPT_REPORT_BEGIN`

`CHATGPT_REPORT_END`

Allowed STATUS values:

- `SUCCESS` — task completed and verified;
- `STOP` — missing facts or risk; do not continue changes;
- `FAIL` — attempted but command/check/change failed.

Required report fields:

- `RUN_ID`
- `STATUS`
- `WHAT_CHANGED`
- `FILES_CHANGED`
- `CHECKS`
- `GIT`
- `SAFETY`
- `NEXT`

For docs runs add:

- `DOCS`
- `DOCS_TO_READ`
- `DOCS_CREATED_OR_UPDATED`
- `DOCUMENTATION_GATE`

For combined runs add:

- `COMBINED_RUN`

For database/auth/payment/OpenAI/image-generation tasks add task-specific safety fields.

