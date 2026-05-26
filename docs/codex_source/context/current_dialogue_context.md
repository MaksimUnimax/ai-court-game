# Current Dialogue Context

This file will be appended later.

## CTX-2026-05-22-001 — Переход draft MVP к ручному тестированию сценариев

Источник: утверждённая пользователем проектная direction в чате.

Направление проекта изменилось для первой грубой версии.

Первый draft MVP не должен напрямую использовать GPT/OpenAI API.

Вместо этого ChatGPT будет вручную генерировать сценарные документы в чате. Пользователь будет загружать сценарный документ на страницу. Backend/script будет разбирать документ и распределять контент по ролям, доказательствам, вопросам, ответам, unlocks и verdict flow.

Первый draft MVP не должен включать иллюстрации.

Первый draft MVP — text-only.

Первый draft MVP не должен включать auth, roles, currency, database или monetization.

Первый draft MVP — это gameplay/scenario scaffold для тестирования структуры дел и качества prompt'ов.

Игрок не должен печатать free text. Все взаимодействия происходят мышью.

Проект должен включать документ, в котором правила и условия для будущих GPT/API scenario prompts будут собираться и уточняться со временем.

ТЗ и roadmap для этого draft MVP сейчас являются текущим приоритетом.

## CTX-2026-05-22-002 — Требование к data-driven scenario graph engine

Источник: утверждённая пользователем project direction в чате.

Пользователь уточнил, что сценарии нельзя реализовывать как hardcoded dialogue frames.

Пользователь уточнил, что проект не должен требовать новый code для каждого нового дела.

Игра должна использовать универсальный data-driven scenario engine.

Participants должны быть детализированными сущностями, а не простыми метками.

Данные participants должны поддерживать имена, роли, jobs or positions, relation to the case и relationships/dependencies между участниками.

Scenario data должна задавать dialogue order, question availability, response dependencies, evidence dependencies, unlock logic, action effects и verdict flow.

Script не должен просто распределять текст по ролям.

Script должен интерпретировать полный scenario graph и строить логику дела из сценарного документа.

Это архитектурное решение должно быть отражено до реализации.

## CTX-2026-05-22-003 — Начата реализация первого каркаса

Источник: run реализации на основе утверждённых документов.

Первый application scaffold использует небольшой сервер на стандартной библиотеке Python и статическую браузерную страницу.

Каркас загружает JSON сценария из textarea или встроенного демо-сценария, валидирует его, запускает сценарий и ведёт игру только кликами на основе графа сценария.

Первый каркас включает participants, relationships, evidence, dialogue actions, deterministic conditions, deterministic effects, verdict selection и final explanation.

OpenAI API, image generation, auth, database и monetization не включены.

## CTX-2026-05-22-004 — Russian language project rule

Source: user-approved project direction in chat.

Пользователь явно потребовал, чтобы весь проект AI Court Game был на русском языке.

С этого момента интерфейс для пользователя, демо-сценарии, тексты сценариев, ошибки, подсказки, проектная документация, roadmap, technical spec, prompt rules и новые проектные документы должны писаться на русском языке.

Technical identifiers нельзя переводить, если перевод ломает code или contracts. Нужно сохранять file paths, JSON keys, API endpoints, function names, variable names, git metadata и report status values там, где это требуется.

## CTX-2026-05-22-004 — Реальные факты и необычность дел как правила сценарного prompt

Источник: уточнение пользователя в чате.

Пользователь уточнил, что детективный элемент с реальными фактами не должен быть отдельной видимой UI-механикой.

Не нужно прямо писать в интерфейсе "внешняя проверка" или делать отдельный видимый режим для этого.

Это должно быть заложено в правила создания сценарного prompt для будущей LLM/API-генерации.

LLM должна учитывать, что игрок-судья сидит в браузере и может самостоятельно проверить реальные факты в интернете.

Игра сама не подключает Google, web search или внешний API в черновом MVP.

Игровой мир пересекается с реальным миром: любой факт, который был или есть в нашем мире, считается истинным и в мире игры.

При этом игровой мир может быть шире и включать вымышленные, комичные, магические, sci-fi или абсурдные элементы.

Сценарии могут включать проверяемые утверждения: алиби на концерте реальной группы, даты событий, расписания, географию, публичные биографии, исторические факты или другие реальные сведения.

Игрок сам решает, проверять ли такое утверждение во внешнем интернете.

В сценарном prompt нужно фиксировать скрытую структуру: проверяемое утверждение, ожидаемый результат проверки, влияние на вердикт и объяснение в финальном разборе.

Пользователь также уточнил, что дела не должны быть скучными повседневными спорами.

Даже бытовой спор должен иметь странный, необычный, гротескный, комичный, магический, sci-fi, абсурдный или иной запоминающийся элемент.

Такой элемент не обязан определять вердикт и не обязан быть детективным ключом.

Он нужен для разнообразия, вкуса и запоминаемости дела.

Детективная загадка должна существовать отдельно и оставаться честно решаемой.

Пример пользователя: арендаторша всё оплатила и мебель целая, но арендодатель удерживает залог из-за того, что она громко пердела ночами, соседи оставили отзыв на сайте аренды, и это якобы ухудшит будущие доходы арендодателя. Правильное решение — вернуть залог, потому что такого условия в договоре нет, имущество не повреждено, а репутационные риски арендодателя не являются основанием удержания залога.

## CTX-2026-05-22-005 — Окна диалога участников вместо общего списка вопросов

Источник: замечание пользователя после ручной проверки live UI.

Пользователь проверил русскую live-версию и подтвердил, что scaffold работает.

Главное замечание: текущая реализация вопрос-ответ плохая, потому что вопросы показаны общей кучей.

Нужно переделать UX так, чтобы у каждого участника было своё отдельное окно или панель диалога.

Судья должен выбирать участника и вести разговор именно с ним.

Вопросы конкретного участника должны показываться внутри его окна диалога.

Ответы должны сохраняться в истории диалога этого участника.

Глобальный список диалоговых действий не должен быть основным пользовательским интерфейсом.

При этом сценарная логика должна остаться data-driven, без hardcode под конкретное дело.

## CTX-2026-05-22-006 — Самостоятельные блоки участников

Источник: замечание пользователя после ручной проверки live UI.

Пользователь проверил интерфейс с окнами диалога и указал, что участники всё ещё собраны неправильно: карточки участников находятся сверху, а подробности выбранного участника выводятся в общий нижний блок.

Это нужно исправить.

У каждого участника должен быть свой отдельный полноценный блок/панель.

Внутри блока участника должны находиться имя, роль, позиция, связь с делом, связи с другими участниками, кнопка/панель диалога и место под будущую иллюстрацию/портрет.

Общего detail-блока выбранного участника быть не должно.

Это важно, потому что позже у каждого участника будет своя иллюстрация, а диалог должен восприниматься как разговор с конкретным человеком.

## CTX-2026-05-22-007 — Загрузка сценария файлом вместо textarea

Источник: уточнение пользователя после проверки live UI.

Пользователь уточнил, что textarea для сценария нужно убрать.

Сценарии могут быть очень большими, вплоть до 100000+ символов и больше.

Пользователь не будет редактировать или просматривать сценарный JSON в интерфейсе.

Основной workflow должен быть простым: загрузить JSON-файл сценария и запустить его.

В UI нужно показывать только имя файла, размер, статус чтения/валидации и понятные ошибки.

Демо-сценарий можно оставить как кнопку для быстрой проверки, но textarea не должна занимать место в интерфейсе.

## CTX-2026-05-22-008 — Скрытая визуальная дедукция и двухэтапная генерация иллюстраций

Источник: уточнение пользователя в чате.

Пользователь уточнил, что нельзя упрощать работу судьи-игрока через явные подсказки на иллюстрациях.

Не нужно делать явные hotspot-зоны, стрелки, подписи или указания, куда смотреть.

Иллюстрация должна быть естественной: участник, место преступления, место спора, предмет или сцена как есть.

Игрок должен сам вглядываться, замечать детали и сопоставлять их с диалогами.

Верное решение не должно находиться только по диалогам.

Верное решение не должно находиться только по иллюстрациям.

Честное решение должно требовать связки: диалоги, иллюстрации, логика дела и иногда внешний реальный факт.

В production-версии генерация должна идти в два этапа: сначала LLM генерирует сценарий и план важных визуальных деталей, затем второй prompt генерирует промпты для иллюстраций на основе сценария.

В текущем MVP ChatGPT по запросу пользователя вручную готовит сценарий и prompts/описания иллюстраций, а скрипт должен в будущем распределять иллюстрации по местам сценария.

## CTX-2026-05-22-009 — Загрузка пакета дела и распределение иллюстраций

Источник: уточнение пользователя в чате.

Пользователь уточнил, что textarea сценария нужно убрать.

Сценарии могут быть очень большими, включая 100000+ символов, и пользователь не будет читать или редактировать JSON в интерфейсе.

Основной workflow должен быть: одна форма загрузки пакета дела.

Пользователь выбирает JSON-сценарий и связанные изображения дела.

Скрипт должен читать файлы в браузере и автоматически распределять иллюстрации по местам на основе данных сценария.

В черновом MVP не нужно серверное хранение файлов.

Иллюстрации должны раскладываться по участникам, сценам и объектам.

Скрытые цели визуальных деталей не должны показываться игроку.

Не добавлять hotspot-зоны, стрелки, подписи улик или явные подсказки.

## CTX-2026-05-22-010 — Крупный просмотр и масштабирование иллюстраций

Источник: замечание пользователя после проверки live UI.

Пользователь указал, что у всех иллюстраций должен быть механизм увеличения и изменения размера.

Это необходимо, потому что игроку нужно внимательно разглядывать изображения и самому замечать детали.

Требование относится к иллюстрациям дела, сцен, объектов, обложки и будущих портретов участников.

Нужно добавить нейтральный крупный просмотр изображения с управлением масштабом.

Это не должно становиться подсказкой: нельзя добавлять hotspot-зоны, стрелки, круги, подписи улик или раскрытие hidden_purpose.

## CTX-2026-05-22-012 — ZIP-архив как основной пакет дела

Источник: уточнение пользователя после создания первого архива дела.

Пользователь не хочет вручную распаковывать архив и выбирать scenario.json вместе с изображениями отдельно.

Нужен основной workflow: загрузить один ZIP-архив пакета дела.

Приложение должно само распаковать архив, найти scenario.json, прочитать изображения и распределить их по местам через visual_assets.

В черновом MVP допустима распаковка ZIP на сервере в памяти без сохранения файлов на диск.

Текущую загрузку JSON + изображений можно оставить как fallback, но ZIP должен стать удобным основным вариантом.

## CTX-2026-05-25-009 — Текущий baseline перед генерацией полноценных сценариев

Источник: текущий рабочий диалог и подтверждённые Codex reports 2026-05-25.

Проект перешёл к этапу генерации первых полноценных сценариев как изолированных серий детективного судебного сериала. Каждая серия должна быть самостоятельной: без общего сюжета между сериями, со своим стилем рисовки, повествованием, антуражем и контекстом.

Сценарии должны генерироваться по `docs/codex_source/prompts/scenario_creation_canon.md`. Для каждого сценария нужны:
- полный JSON-сценарий;
- отдельный prompt для `case_cover`;
- отдельные prompts для `participant_portrait`;
- отдельные prompts для `case_illustration` assets.

Визуальные asset-ы теперь являются строгими UI-категориями:
- `case_cover` отображается только в блоке обложки дела;
- `participant_portrait` отображается только в карточке участника;
- `case_illustration` отображается только в секции “Иллюстрации дела”.

Обложка дела обязательна для будущих полноценных сценариев и должна использовать canonical ratio `695 / 616`. Портреты участников не должны попадать в “Иллюстрации дела”. Обложка не должна попадать в “Иллюстрации дела”. “Иллюстрации дела” должны содержать только сцены, места, предметы, доказательства и визуальные дедуктивные изображения.

Понравившиеся сценарии теперь можно сохранять в portable scenario library. Future generated scenarios must be save/load/export/import friendly.

Текущий TTS boundary:
- не использовать `audio_assets`;
- не использовать uploaded audio;
- Silero TTS читает текст сценария;
- сценарные тексты должны быть пригодны для озвучки.

Следующий рабочий шаг после этого docs update: сгенерировать первый полноценный сценарий по канону и отдельно prompts для иллюстраций.

## CTX-2026-05-25-010 — Доказанные product foundation runs

Источник: Codex reports в текущем диалоге.

Ключевые подтверждённые runs:
- `AI_COURT_GAME_CREATE_SCENARIO_CREATION_CANON_20260525_02`: создан `docs/codex_source/prompts/scenario_creation_canon.md`.
- `AI_COURT_GAME_PORTABLE_SCENARIO_LIBRARY_SQLITE_20260525_01`: добавлена portable SQLite scenario library.
- `AI_COURT_GAME_CASE_COVER_REPLACE_INFO_BLOCK_20260525_01`: добавлена обложка дела, измерен ratio `695 / 616`.
- `AI_COURT_GAME_FILTER_CASE_ILLUSTRATIONS_ASSETS_20260525_01`: разделены cover/portraits/case illustrations.
- `AI_COURT_GAME_IMAGE_VIEWER_DRAG_PAN_20260525_01`: добавлен drag-to-pan в image viewer.
- `AI_COURT_GAME_IMAGE_VIEWER_WHEEL_ZOOM_FIXED_BASE_20260525_01`: исправлен wheel zoom direction reversal через invariant base dimensions.

Эти блоки считаются текущим baseline. Их не нужно повторять или переоткрывать без свежего proof о поломке.

## CTX-2026-05-26-001 — Feedback from live playtesting on scenario rules

Источник: live playtesting feedback in the current ChatGPT/user workflow.

Проверка сценариев показала, что в документации ещё не были жёстко зафиксированы несколько правил, которые уже проявились в игре:

- player-facing текст на сайте всё ещё был слишком коротким;
- binary verdicts слишком легко решают multi-suspect cases;
- evidence proof hints должны оставаться internal и не показываться игроку;
- каждый visible participant должен иметь portrait;
- будущие episodes должны варьировать genre, environment, mystery type и visual style.

Этот блок нужен как append-only reference для следующей итерации canon/prompt rules.

## CTX-2026-05-26-002 — Runtime persistence and GitHub push credential audit after scenario-rule update

After `CTX-2026-05-26-001`, the project continued through operational stabilization and access audit work.

### Proven runtime facts

A live upload failure that appeared as browser `Failed to fetch` was diagnosed as a dead or unavailable live service rather than a scenario JSON or ZIP schema problem. The server was then restarted.

A later Silero TTS failure showed that the server had been restarted with bare `python3 app/server.py`, which made Silero unavailable in the current Python process. The correct runtime is the local Silero virtual environment:

- `/opt/ai-court-game/.runtime/silero-venv/bin/python app/server.py`

Commit `41cb68abc25638b30d0eff9b3e2adf5ed2d032db` added:

- `scripts/start_live_server.sh`

The helper runs the AI Court Game server from the repo root through the Silero venv Python.

A host-level systemd service was then created:

- service name: `ai-court-game.service`
- host unit path: `/etc/systemd/system/ai-court-game.service`
- working directory: `/opt/ai-court-game`
- execution path: `/opt/ai-court-game/scripts/start_live_server.sh`

After this, the live server was systemd-owned, listened on `0.0.0.0:8000`, and Silero TTS returned `200 OK` with `Content-Type: audio/wav`.

### Runtime rule

Do not start the live server with bare:

- `python3 app/server.py`

Use the committed helper and the host service path. Bare system Python can make Silero unavailable even if the web UI still loads.

### GitHub push credential audit

A proof-only GitHub credential audit showed that Codex or server push access does not come from a key or token pasted in ChatGPT. It comes from server-side SSH configuration.

Proven safe facts:

- repo remote: `git@github.com-ai-court-game:MaksimUnimax/ai-court-game.git`
- remote type: SSH
- SSH alias: `github.com-ai-court-game`
- key path used by the alias: `/root/.ssh/github_openscript_ed25519`
- GitHub accepted the key and authenticated as `MaksimUnimax`
- no Git credential helper was found
- no GitHub token credential files were found
- no `GITHUB`, `GH_`, `TOKEN`, or `PAT` environment variables were present
- GitHub CLI was not installed
- no secrets were printed

### Security/admin stop-point

Codex can push to GitHub because the server already has a configured SSH key with write-capable GitHub access. This is an operational or security decision point, not a code bug.

The next security/admin decision should be explicit:

- keep the server SSH key with write access;
- replace it with read-only access;
- protect `main` with GitHub rulesets or branch protection;
- move to a PR-only workflow;
- or use another controlled deployment flow.

Do not remove keys or change GitHub access without explicit user approval.

### Current scenario-generation stop-point

Scenario-generation remains the active product block. Future scenarios must follow the latest canon:

- substantial site `case_intro`, not only a tiny chat teaser;
- no player-facing proof hints;
- no visible participant-card deductions;
- one portrait for every visible participant;
- multi-suspect cases must let the player choose the responsible person or side rather than only binary guilty or not guilty;
- each episode must vary genre, social world, mystery mechanic, environment and visual style;
- all packages must remain JSON, ZIP, and library friendly;
- Silero TTS reads scenario text and uploaded or generated audio assets remain forbidden.
