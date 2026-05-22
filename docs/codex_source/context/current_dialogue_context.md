# Current Dialogue Context

This file will be appended later.

## CTX-2026-05-22-001 — Draft MVP pivot to manual scenario testing

Source: user-approved project direction in chat.

The project direction changed for the first rough version.

The first draft MVP must not use GPT/OpenAI API directly.

Instead, ChatGPT will manually generate scenario documents in chat. The user will upload a scenario document to the page. The backend/script will parse the document and distribute content into roles, evidence, questions, answers, unlocks and verdict flow.

The first draft MVP must not include illustrations.

The first draft MVP is text-only.

The first draft MVP must not include auth, roles, currency, database or monetization.

The first draft MVP is a gameplay/scenario scaffold for testing case structure and prompt quality.

The player must not type free text. All interactions are mouse clicks.

The project must include a document where rules and conditions for future GPT/API scenario prompts are collected and refined over time.

ТЗ and roadmap for this draft MVP are now the current priority.

## CTX-2026-05-22-002 — Data-driven scenario graph engine requirement

Source: user-approved project direction in chat.

The user clarified that scenarios must not be implemented as hardcoded dialogue frames.

The user clarified that the project must not require new code for every new case.

The game must use a universal data-driven scenario engine.

Participants must be detailed entities, not simple labels.

Participant data must support names, roles, jobs or positions, relation to the case, and relationships/dependencies between participants.

Scenario data must define dialogue order, question availability, response dependencies, evidence dependencies, unlock logic, action effects and verdict flow.

The script must not merely distribute text by roles.

The script must interpret the full scenario graph and build the case logic from the scenario document.

This architecture decision must be reflected before implementation.

## CTX-2026-05-22-003 — First scaffold implementation started

Source: implementation run based on approved docs.

The first application scaffold uses a small Python standard-library server and a static browser page.

The scaffold loads scenario JSON from a textarea or built-in demo scenario, validates it, starts the scenario and runs click-only gameplay from scenario graph data.

The first scaffold includes participants, relationships, evidence, dialogue actions, deterministic conditions, deterministic effects, verdict selection and final explanation.

No OpenAI API, image generation, auth, database or monetization is included.
