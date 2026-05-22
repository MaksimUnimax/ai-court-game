# Technical Spec Draft — AI Court Game Draft MVP

STATUS: draft_1

## Purpose

This document describes the first rough technical direction.

This is not the production architecture.

This is a temporary scaffold for testing scenario structure and gameplay logic.

## Core idea

The first implementation should load a prepared scenario document, parse it, and render a click-only court-case game.

The scenario is created manually outside the app.

The app does not call GPT.

The app does not generate images.

The app does not use authorization.

The app does not use database persistence.

## High-level components

Draft MVP components:

1. Scenario document.
2. Scenario parser.
3. Simple backend or local script.
4. Browser page.
5. Game state in memory.
6. Verdict/result screen.

## Scenario document

The scenario document must contain structured data.

The exact format can be JSON first.

JSON is preferred for the first implementation because:

- it is easy to parse;
- it avoids ambiguity;
- it is close to future GPT API response format;
- it can be validated;
- it can be edited manually while testing.

The scenario document must include:

- scenario id;
- title;
- case type;
- difficulty;
- short intro;
- judge briefing;
- participants;
- evidence;
- questions;
- unlock rules;
- verdict options;
- correct verdict;
- solution explanation;
- prompt-development notes.

## Parser responsibility

The parser must:

- accept uploaded scenario data;
- validate required fields;
- reject broken scenario structure;
- normalize scenario data into internal game state;
- map participants to UI cards;
- map questions to participants;
- map evidence to evidence cards;
- apply unlock conditions;
- expose verdict options.

The parser must not invent missing scenario content.

If a required field is missing, the parser should show a clear error.

## UI responsibility

The page must:

- show case title and intro;
- show participants;
- show evidence list;
- show available questions;
- show clicked answers;
- show newly unlocked content;
- show verdict buttons;
- show final explanation after verdict.

The UI must not provide free text input.

All interaction is by buttons and clickable cards.

## Game state

The draft MVP may keep game state in memory.

State should track:

- loaded scenario;
- opened participant cards;
- asked questions;
- revealed evidence;
- unlocked questions;
- selected verdict;
- finished/not finished.

No database is required in this version.

## Unlock logic

Scenarios may include content that is initially hidden.

Unlockable content may include:

- new evidence;
- new questions;
- extra participant statements;
- final verdict availability.

Unlock conditions should be simple and deterministic.

Examples:

- question Q1 asked;
- evidence E2 opened;
- both Q3 and E1 discovered.

No random unlocks in the first draft MVP.

## Verdict logic

The scenario contains the correct verdict.

The page compares the player's selected verdict with the correct verdict.

After verdict, the page shows:

- whether the player was correct;
- what really happened;
- key evidence;
- key contradictions;
- why the wrong verdict is wrong.

## Future production direction

Later versions may add:

- OpenAI API generation;
- image generation;
- database;
- authorization;
- roles;
- game currency;
- admin tools;
- generated scenario pool;
- anti-repeat tags;
- scenario history;
- illustrations;
- production deployment.

These are not part of the draft MVP.

## Addendum — Data-driven scenario graph engine

The draft MVP must not use hardcoded dialogue frames.

The draft MVP must use a universal data-driven scenario graph engine.

The scenario document controls:

- participants;
- participant details;
- relationships between participants;
- dialogue actions;
- evidence actions;
- availability conditions;
- effects after clicks;
- unlock rules;
- facts;
- contradictions;
- verdict options;
- final explanation.

The code must implement universal mechanics only.

The code must not contain case-specific logic.

A new case must be added by changing scenario data, not by writing new application code.

The first implementation should support simple deterministic conditions and effects.

Initial condition groups:

- always;
- all;
- any;
- not.

Initial condition types:

- question_asked;
- evidence_opened;
- fact_discovered;
- contradiction_found;
- action_done;
- verdict_enabled.

Initial effect types:

- mark_action_done;
- unlock_question;
- unlock_evidence;
- discover_fact;
- mark_contradiction;
- show_note;
- enable_verdict.
