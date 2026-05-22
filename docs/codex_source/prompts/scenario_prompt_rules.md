# Scenario Prompt Rules — AI Court Game

STATUS: draft_1_appendable

## Purpose

This document collects rules and conditions for creating court-case scenarios.

These rules will later become the base for the GPT/API prompt.

For now, ChatGPT manually creates scenario documents and the user tests them in the draft MVP.

The document should grow as scenario problems are discovered.

## Core rule

A scenario must be a solvable puzzle.

It is not enough for the case to be dramatic, funny or strange.

The player must be able to reach the correct verdict by clicking through participants, questions and evidence.

## Required scenario qualities

Every scenario must have:

- a clear hidden truth;
- a correct verdict;
- enough evidence to support the correct verdict;
- at least one meaningful contradiction or clue;
- no contradiction that makes the case logically impossible;
- no solution that requires information unavailable to the player;
- no reliance on free text input;
- no need for real-world legal knowledge;
- no hidden author-only reasoning.

## Draft MVP limitations

For the first draft MVP:

- no images;
- no OpenAI API;
- no generated portraits;
- no generated evidence illustrations;
- no user authorization;
- no database;
- no witnesses by default;
- no free text input;
- all gameplay through clicks.

## Scenario structure rule

A scenario must be structured so a script can place content into UI blocks.

The scenario must not be a plain story only.

It must include explicit sections for:

- metadata;
- participants;
- evidence;
- questions;
- answers;
- unlock rules;
- verdict options;
- correct verdict;
- final explanation.

## Case type rules

Supported case types for draft MVP:

1. Criminal case.
2. Dispute between two people.

Criminal case must use verdict options:

- guilty;
- not guilty.

Dispute case must use verdict options:

- side A is right;
- side B is right.

## Participant rules

For a criminal case, default participants are:

- accused person;
- prosecutor;
- defense lawyer.

For a dispute case, default participants are:

- side A;
- side B.

No witnesses in the first draft MVP unless explicitly added later.

## Question rules

Questions must be predefined.

The player chooses questions by clicking buttons.

Each question belongs to a participant.

Each answer must be prepared in advance.

Answers may:

- reveal a contradiction;
- confirm an alibi;
- weaken an alibi;
- unlock evidence;
- unlock another question;
- mislead the player fairly.

Answers must not require the player to type.

## Evidence rules

Evidence must be text-only in the first draft MVP.

Each evidence item must include:

- id;
- title;
- visible description;
- detailed inspection text;
- whether it is available at start;
- unlock condition if hidden;
- what it proves;
- whether it is key evidence.

Evidence must matter to the puzzle.

Decorative evidence should be avoided.

## Unlock rules

Unlock rules must be deterministic.

Good unlock conditions:

- after asking a specific question;
- after opening a specific evidence item;
- after asking two specific questions;
- after opening evidence and then asking a related question.

Bad unlock conditions:

- random chance;
- hidden timer;
- author-only trigger;
- free text phrase;
- unclear player action.

## Fairness rules

The scenario is unfair if:

- the correct answer depends on information not shown;
- two verdicts are equally supported;
- the final explanation adds new facts that were not available;
- the evidence contradicts the hidden truth;
- the player must guess the author's intention;
- a participant gives an answer that breaks the established timeline.

## Final explanation rules

After verdict, the scenario must explain:

- correct verdict;
- what really happened;
- key evidence;
- key contradiction;
- why the selected wrong verdict is wrong;
- what the player should have noticed.

## Future API prompt direction

When GPT/API generation is added later, the prompt must require structured output.

The future GPT response should be strict JSON.

The future GPT response should include:

- scenario metadata;
- anti-repeat tags;
- hidden truth;
- participants;
- evidence;
- questions;
- unlock rules;
- verdict options;
- correct verdict;
- solution explanation;
- validation checklist.

The future GPT prompt must explicitly forbid unsolvable cases.

## Open questions to refine later

These rules will be refined after playtesting:

- best scenario JSON format;
- number of evidence items per difficulty;
- number of questions per participant;
- how to mark key contradictions;
- how to validate solvability;
- how to prevent repeated plots;
- how to convert manual scenario documents into GPT API prompts.

## Addendum — Scenario graph rules

A scenario must be generated as data for a universal scenario graph engine.

The scenario must not assume a fixed dialogue order hardcoded in the app.

The scenario must explicitly define:

- detailed participants;
- relationships between participants;
- dialogue actions;
- evidence actions;
- availability conditions;
- effects after actions;
- unlock dependencies;
- discovered facts;
- contradictions;
- verdict options;
- correct verdict;
- final explanation.

Every participant must be more than a role label.

Participant data should include:

- name;
- role;
- job or position;
- relation to the case;
- relation to other participants;
- public motive or conflict;
- what the participant knows;
- what the participant hides or misrepresents if relevant.

Every dialogue action must define when it is available and what it changes.

Every evidence item must define when it is available and what it proves.

The scenario must not require new code for a specific case.

The scenario must be executable by the same engine as every other case.

The future GPT prompt must require the model to output scenario graph data, not a plain story.
