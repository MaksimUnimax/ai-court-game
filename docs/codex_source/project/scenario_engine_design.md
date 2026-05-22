# Scenario Engine Design — AI Court Game

STATUS: draft_1

## Ключевое решение

AI Court Game должен использовать universal data-driven scenario graph engine.

Игра не должна hardcode-ить dialogue frames для каждого дела.

Игра не должна требовать новый application code для каждого нового дела.

Каждое дело должно описываться scenario data.

Engine должен читать сценарный документ, строить доступные действия на основе этого документа, отслеживать состояние игрока, применять условия и эффекты и отображать ход дела через кликабельный UI.

## Почему это важно

Главный риск продукта — не в том, может ли страница показывать текст.

Главный риск — в том, смогут ли многие разные судебные дела быть представлены как честные, решаемые, кликабельные головоломки без написания custom code для каждого случая.

Hardcoded-подход быстро сломается, потому что каждому делу могут понадобиться разные:

- отношения между участниками;
- порядок вопросов;
- зависимости доказательств;
- правила разблокировки;
- противоречия;
- ветвления диалогов;
- рассуждение для вердикта;
- финальное объяснение.

Поэтому сценарий должен определять логику дела, а код должен выполнять только универсальную механику.

## Ответственность engine

Engine отвечает только за универсальную механику.

Engine может:

- загружать сценарный документ;
- валидировать структуру сценария;
- создавать начальное состояние игры;
- показывать доступных участников;
- показывать доступные доказательства;
- показывать доступные dialogue actions;
- проверять доступность действий;
- применять эффекты действий;
- открывать новые вопросы;
- открывать новые доказательства;
- отмечать факты как обнаруженные;
- отмечать противоречия как найденные;
- включать доступность вердиктов;
- сравнивать выбранный вердикт с правильным;
- показывать финальное объяснение.

Engine не должен:

- знать сюжет заранее;
- содержать case-specific if/else logic;
- hardcode-ить порядок диалогов;
- hardcode-ить порядок доказательств;
- hardcode-ить поведение ролей;
- придумывать отсутствующий контент сценария;
- писать новый code для каждого дела.

## Сценарий как graph

Сценарий следует рассматривать как graph.

Graph nodes могут включать:

- карточки участников;
- dialogue actions;
- элементы доказательств;
- факты;
- противоречия;
- заметки;
- варианты вердикта;
- блоки финального объяснения.

Graph edges выражаются через условия и эффекты.

Примеры:

- один вопрос открывает следующий вопрос;
- открытие доказательства открывает новый вопрос;
- обнаружение факта раскрывает противоречие;
- нахождение противоречия делает вердикт доступным;
- открытие двух доказательств открывает финальный challenge-вопрос.

Игроку не нужно видеть graph.

Игрок видит только доступные кликабельные действия.

## Участники

Участники должны быть детализированными.

Участник — это не просто имя или роль.

Для каждого участника должны поддерживаться поля вроде:

- id;
- name;
- public role;
- case role;
- job or position;
- short description;
- relation to the case;
- public motive or conflict;
- known facts;
- hidden facts;
- relationship to other participants;
- dependency on other participants;
- contradiction potential.

Отношения между участниками — часть сценария.

Примеры отношений:

- бывшие бизнес-партнёры;
- работодатель и сотрудник;
- члены семьи;
- должник и кредитор;
- прокурор и обвиняемый;
- адвокат защиты и обвиняемый;
- две стороны гражданского спора.

Эти отношения должны быть доступны UI и логике сценария.

## Dialogue actions

Диалоги должны быть представлены как scenario actions, а не как fixed script.

Dialogue action должен содержать:

- id;
- participant id;
- button label;
- response text;
- availability condition;
- effects after click;
- optional tags;
- optional relation to evidence;
- optional relation to facts or contradictions.

Dialogue action может быть доступен в начале или разблокирован позже.

Это управляется сценарием.

Код не hardcode-ит порядок.

## Evidence actions

Доказательства должны быть представлены как scenario objects/actions.

Evidence item должен содержать:

- id;
- title;
- short visible description;
- detailed inspection text;
- availability condition;
- effects after opening;
- what it proves;
- whether it is key evidence;
- relation to facts or contradictions.

В draft MVP доказательства текстовые.

Изображения — future work.

## Условия

Условия определяют, доступно ли действие.

Первая версия engine должна использовать простой безопасный формат условий.

Разрешённые группы условий:

- always;
- all;
- any;
- not.

Начальные типы условий:

- question_asked;
- evidence_opened;
- fact_discovered;
- contradiction_found;
- action_done;
- verdict_enabled.

Примеры:

- доступно после того, как задан вопрос;
- доступно после открытия доказательства;
- доступно после выполнения и вопроса, и доказательства;
- недоступно после выбора вердикта.

Условия должны быть данными, а не исполняемым кодом.

Первая реализация не должна использовать arbitrary JavaScript expressions в scenario files.

## Эффекты

Эффекты определяют, что происходит после клика по действию.

Начальные типы эффектов:

- mark_action_done;
- unlock_question;
- unlock_evidence;
- discover_fact;
- mark_contradiction;
- show_note;
- enable_verdict.

Эффекты должны быть детерминированными.

Эффекты не должны требовать свободного ввода текста.

Эффекты не должны зависеть от случайности в draft MVP.

## Состояние игры

Game state в draft MVP может храниться в памяти.

Состояние должно отслеживать:

- loaded scenario id;
- opened participants;
- asked questions;
- opened evidence;
- completed actions;
- discovered facts;
- found contradictions;
- visible questions;
- visible evidence;
- enabled verdicts;
- selected verdict;
- game finished flag.

Состояние пересчитывается после каждого клика.

## Валидация

Engine должен валидировать данные сценария до начала игры.

Проверка должна включать:

- required top-level sections exist;
- every referenced id exists;
- every participant id used in dialogue exists;
- every evidence id referenced by conditions/effects exists;
- every question/action id referenced by conditions/effects exists;
- there is at least one verdict option;
- there is exactly one correct verdict unless future rules allow multiple;
- final explanation exists;
- no required path depends on impossible conditions;
- all condition/effect types are supported;
- no arbitrary code is present in conditions.

Парсер не должен придумывать отсутствующий контент.

Если сценарий сломан, он должен показать понятную ошибку.

## Решаемость

Сценарий должен решаться доступными кликами.

Игрок должен иметь возможность узнать достаточно информации, чтобы выбрать правильный вердикт.

Финальное объяснение не должно добавлять новых фактов, которых не было во время игры.

Будущие валидаторы должны проверять, что ключевые доказательства и ключевые противоречия достижимы.

## Граница первой реализации

Первая реализация должна поддерживать минимально полезную версию этого engine.

Она должна поддерживать:

- participants;
- evidence;
- dialogue actions;
- conditions;
- effects;
- verdicts;
- final explanation.

Пока не нужно поддерживать:

- OpenAI API;
- images;
- auth;
- database;
- currency;
- random events;
- free text input;
- custom code in scenario files.

## Будущее расширение

Позднее версии могут добавить:

- difficulty rules;
- anti-repeat tags;
- scenario database;
- admin scenario review;
- GPT/API generation;
- image generation;
- richer condition language;
- multiple solution paths;
- optional misleading paths;
- analytics for scenario quality.
