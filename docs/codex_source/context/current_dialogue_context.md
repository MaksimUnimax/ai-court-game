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
