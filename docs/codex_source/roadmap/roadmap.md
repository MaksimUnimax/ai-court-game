# Roadmap — AI Court Game

STATUS: draft_1

## Roadmap block R001 — Draft MVP scenario scaffold

Goal:

Create a rough playable scenario scaffold before adding GPT API, images, auth or database.

Why:

The core product risk is not backend complexity. The core product risk is whether generated court cases can be structured as fair, solvable, click-only puzzles.

Scope:

- scenario document import;
- parser;
- text-only page;
- clickable participants;
- clickable questions;
- clickable evidence;
- verdict selection;
- final explanation;
- manual scenario generation by ChatGPT;
- prompt-rule document for future GPT/API generation.

Non-scope:

- OpenAI API;
- image generation;
- auth;
- roles;
- currency;
- database;
- production deployment.

Expected result:

The user can upload a manually generated scenario document, play through it by clicking, reach a verdict and inspect the final explanation.

## Roadmap block R002 — Scenario format iteration

Goal:

Iterate on scenario JSON/document structure using real manual scenarios.

Work:

- create first test scenario manually with ChatGPT;
- upload it to the draft page;
- identify missing fields;
- identify confusing UI placement;
- refine scenario schema;
- refine prompt rules;
- repeat until cases are playable.

Expected result:

A stable draft scenario structure that can later become the GPT API response schema.

## Roadmap block R003 — First implementation

Goal:

Implement the rough page and parser.

Work:

- create minimal backend or local script;
- create scenario upload/import flow;
- parse scenario JSON;
- render case title and intro;
- render participants;
- render questions;
- render evidence;
- implement unlock conditions;
- implement verdict selection;
- render final explanation.

Expected result:

A working draft game loop without API, images, auth or database.

## Roadmap block R004 — Scenario quality rules

Goal:

Build the first reliable ruleset for scenario creation.

Work:

- collect failures from playtesting;
- update scenario_prompt_rules.md;
- define required fields;
- define forbidden scenario patterns;
- define solvability checklist;
- define difficulty rules.

Expected result:

A strong manual prompt foundation for later GPT/API generation.

## Roadmap block R005 — Future production architecture

Goal:

After manual scenario flow works, design the real product architecture.

Future topics:

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

This block is future work and must not be implemented in the draft MVP.
