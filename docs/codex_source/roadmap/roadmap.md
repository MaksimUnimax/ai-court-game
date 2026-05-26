# Roadmap — AI Court Game

STATUS: draft_1

## Roadmap block R001 — Draft MVP scenario scaffold

Цель:

Собрать грубый playable-каркас сценария до добавления GPT API, изображений, авторизации и базы данных.

Почему:

Главный риск продукта — не backend complexity. Главный риск — могут ли сгенерированные судебные дела быть честными, решаемыми, кликабельными головоломками.

Объём:

- import сценарного документа;
- parser;
- текстовая страница;
- кликабельные участники;
- кликабельные вопросы;
- кликабельные доказательства;
- выбор вердикта;
- финальное объяснение;
- ручная генерация сценариев ChatGPT;
- документ с правилами prompt'ов для будущей GPT/API generation.

Не входит:

- OpenAI API;
- image generation;
- auth;
- roles;
- currency;
- database;
- production deployment.

Ожидаемый результат:

Пользователь может загрузить вручную созданный сценарный документ, пройти его кликами, дойти до вердикта и изучить финальное объяснение.

## Roadmap block R002 — Итерация формата сценария

Цель:

Итеративно улучшать структуру сценария JSON/document на основе реальных ручных сценариев.

Работа:

- создать первый тестовый сценарий вручную с ChatGPT;
- загрузить его на draft-страницу;
- найти отсутствующие поля;
- найти непонятное размещение UI;
- улучшить схему сценария;
- улучшить prompt rules;
- повторять, пока сценарии не станут playable.

Ожидаемый результат:

Стабильная draft-структура сценария, которая позднее сможет стать GPT API response schema.

## Roadmap block R003 — Первая реализация

Цель:

Реализовать грубую страницу и parser.

Работа:

- создать минимальный backend или локальный script;
- создать flow загрузки/import сценария;
- разбирать scenario JSON;
- отображать заголовок дела и intro;
- отображать участников;
- отображать вопросы;
- отображать доказательства;
- реализовать unlock conditions;
- реализовать выбор вердикта;
- отображать финальное объяснение.

Ожидаемый результат:

Рабочий draft game loop без API, изображений, авторизации и базы данных.

## Roadmap block R004 — Правила качества сценариев

Цель:

Собрать первый надёжный набор правил для создания сценариев.

Работа:

- собирать failures из playtesting;
- обновлять scenario_prompt_rules.md;
- определять обязательные поля;
- определять запрещённые паттерны сценариев;
- определять solvability checklist;
- определять правила сложности.

Ожидаемый результат:

Сильная ручная prompt-база для будущей GPT/API generation.

## Roadmap block R005 — Будущая production-архитектура

Цель:

После того как ручной сценарный flow работает, спроектировать реальную архитектуру продукта.

Будущие темы:

- OpenAI API generation;
- strict JSON response validation;
- generated case persistence;
- database;
- auth;
- guest/user/admin roles;
- game currency;
- admin generation;
- anti-repeat tags;
- illustrations;
- image generation;
- deployment.

Этот блок — future work, и его нельзя реализовывать в draft MVP.

## Roadmap block R006 — Дизайн data-driven scenario graph engine

Цель:

Определить и реализовать универсальный сценарный engine до построения первой playable-версии.

Почему:

Игра не должна использовать hardcoded dialogue frames или custom code per case. Каждый кейс должен описываться данными, а engine должен выполнять эти данные.

Работа:

- документировать scenario graph engine;
- определить участников как детализированные сущности;
- определить отношения между участниками;
- определить dialogue actions;
- определить evidence actions;
- определить условия;
- определить эффекты;
- определить состояние игры;
- определить правила валидации;
- обновить scenario prompt rules.

Ожидаемый результат:

Реализация может строить разные flow дел из scenario data вместо hardcoded dialogue order.

## Roadmap block R007 — Scenario generation and scenario-quality iteration

Status: active_next

Goal:
Generate and test the first full isolated AI Court Game detective-case episodes using the current scenario canon and live product baseline.

Current foundation:
- data-driven scenario engine exists;
- JSON/ZIP scenario loading exists;
- visual assets exist;
- case cover exists with ratio `695 / 616`;
- visual assets are separated into `case_cover`, `participant_portrait`, and `case_illustration`;
- portable SQLite scenario library exists;
- Silero text TTS exists;
- image viewer supports zoom, drag-to-pan and fixed wheel zoom.

Next scenario-generation block:
1. Generate one full isolated detective-case episode.
2. Produce scenario JSON.
3. Produce illustration prompts:
   - `case_cover` prompt with ratio `695 / 616`;
   - participant portrait prompts;
   - case illustration prompts only for scenes, places, objects, evidence and visual deduction.
4. Load/test the scenario in live UI.
5. Save a liked version to scenario library.
6. Convert user feedback into updates to `scenario_creation_canon.md`.
7. Repeat until scenario quality is strong.

Not next:
- not uploaded audio;
- not `audio_assets`;
- not another TTS provider;
- not large UI refactor;
- not database redesign unless the existing SQLite library fails;
- not hardcoded scenario-specific application code;
- not OpenAI/API generation.

Success criteria:
- a scenario can be loaded, played, heard, examined visually, saved to library, exported, imported and replayed;
- player can reach the correct verdict through dialogue, evidence, visual deduction and final explanation;
- weaknesses discovered during playtesting become explicit canon updates.

## Roadmap block R008 — Runtime persistence, GitHub access audit, and continued scenario-quality iteration

Status: runtime_stabilized_git_access_decision_pending_scenario_iteration_active

### Completed / proven

- The live server upload `Failed to fetch` failure was diagnosed as a dead or unavailable live service, not a scenario package schema problem.
- The Silero runtime failure was diagnosed as the server running under bare system Python.
- `scripts/start_live_server.sh` was added to start the app with `.runtime/silero-venv/bin/python`.
- A host systemd service `ai-court-game.service` was created to run the helper persistently.
- Live root, scenario library API and TTS synthesize endpoint were proven working after the service fix.
- GitHub push credential audit proved that Codex or server push capability comes from an SSH key configured on the server, not from credentials pasted in chat.

### Current active block

Continue scenario-generation and scenario-quality iteration under the updated canon.

Next scenario-generation runs must:

- generate one isolated episode at a time;
- first provide a short approval description in chat;
- after approval generate full scenario package;
- include a substantial site description;
- include candidate verdicts appropriate for the number of suspects;
- include one portrait per visible participant;
- include role-separated visual assets;
- use a distinct genre, environment, mystery mechanic and visual style from recent episodes;
- avoid player-facing proof hints and participant-card conclusions;
- test in live UI;
- convert playtesting failures into docs-only canon updates.

### Pending security/admin decision

Decide what to do with GitHub write access from the server:

- keep current SSH write access;
- reduce server access to read-only;
- protect `main`;
- require PR-only workflow;
- or define another controlled workflow.

No credential removal or GitHub access change should be performed without explicit user approval.

### Not next

- not uploaded audio;
- not `audio_assets`;
- not a new TTS provider;
- not hardcoded case-specific logic;
- not a broad UI redesign unless a fresh UI proof identifies a blocker;
- not a GitHub credential change without explicit user approval.
