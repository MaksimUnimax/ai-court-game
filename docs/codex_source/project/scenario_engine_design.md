# Scenario Engine Design — AI Court Game

STATUS: draft_1

## Core decision

AI Court Game must use a Universal data-driven scenario graph engine.

The game must not hardcode dialogue frames for each case.

The game must not require new application code for each new case.

Each case must be described by scenario data.

The engine must read the scenario document, build the available actions from that document, track player state, apply conditions and effects, and display the case flow through clickable UI.

## Why this matters

The main product risk is not whether a page can show text.

The main product risk is whether many different court cases can be represented as fair, solvable, click-only puzzles without writing custom code for each case.

A hardcoded approach would fail quickly because every case may need different:

- participant relationships;
- question order;
- evidence dependencies;
- unlock rules;
- contradictions;
- dialogue branches;
- verdict reasoning;
- final explanation.

Therefore the scenario must define the case logic, and the code must only execute universal mechanics.

## Engine responsibility

The engine is responsible for universal mechanics only.

The engine may:

- load a scenario document;
- validate the scenario structure;
- create initial game state;
- show available participants;
- show available evidence;
- show available dialogue actions;
- check action availability;
- apply action effects;
- reveal new questions;
- reveal new evidence;
- mark facts as discovered;
- mark contradictions as found;
- enable verdict options;
- compare selected verdict with the correct verdict;
- show final explanation.

The engine must not:

- know the plot in advance;
- contain case-specific if/else logic;
- hardcode a dialogue order;
- hardcode evidence order;
- hardcode role behavior;
- invent missing scenario content;
- write new code for each case.

## Scenario as graph

A scenario should be treated as a graph.

Graph nodes may include:

- participant cards;
- dialogue actions;
- evidence items;
- facts;
- contradictions;
- notes;
- verdict options;
- final explanation blocks.

Graph edges are represented through conditions and effects.

Examples:

- asking one question unlocks another question;
- opening evidence unlocks a new question;
- discovering a fact reveals a contradiction;
- finding a contradiction enables a verdict;
- opening two pieces of evidence unlocks a final challenge question.

The player does not need to see the graph.

The player only sees available clickable actions.

## Participants

Participants must be detailed.

A participant is not just a name or a role.

Each participant should support fields such as:

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

Relationships between participants are part of the scenario.

Examples of relationships:

- former business partners;
- employer and employee;
- family members;
- debtor and creditor;
- prosecutor and accused;
- defense lawyer and accused;
- two sides of a civil dispute.

These relationships should be available to the UI and to the scenario logic.

## Dialogue actions

Dialogue must be represented as scenario actions, not as a fixed script.

A dialogue action should contain:

- id;
- participant id;
- button label;
- response text;
- availability condition;
- effects after click;
- optional tags;
- optional relation to evidence;
- optional relation to facts or contradictions.

A dialogue action may be available at the start or unlocked later.

The scenario controls this.

The code does not hardcode the order.

## Evidence actions

Evidence must be represented as scenario objects/actions.

An evidence item should contain:

- id;
- title;
- short visible description;
- detailed inspection text;
- availability condition;
- effects after opening;
- what it proves;
- whether it is key evidence;
- relation to facts or contradictions.

In the draft MVP, evidence is text-only.

Images are future work.

## Conditions

Conditions define whether an action is available.

The first draft engine should use a simple safe condition format.

Allowed condition groups:

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

Examples:

- available after a question is asked;
- available after evidence is opened;
- available after both a question and evidence are completed;
- unavailable after verdict is selected.

Conditions must be data, not executable code.

The first implementation should not use arbitrary JavaScript expressions in scenario files.

## Effects

Effects define what happens after a player clicks an action.

Initial effect types:

- mark_action_done;
- unlock_question;
- unlock_evidence;
- discover_fact;
- mark_contradiction;
- show_note;
- enable_verdict.

Effects must be deterministic.

Effects must not require free text input.

Effects must not depend on random chance in the draft MVP.

## Game state

The draft MVP game state may be in memory.

State should track:

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

The state is recalculated after each click.

## Validation

The engine must validate scenario data before play.

Validation should check:

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

The parser must not invent missing content.

If the scenario is broken, it should show a clear error.

## Solvability

A scenario must be solvable by available clicks.

The player must be able to discover enough information to choose the correct verdict.

The final explanation must not introduce new facts that were unavailable during play.

Future validators should check that key evidence and key contradictions are reachable.

## First implementation boundary

The first implementation should support the smallest useful version of this engine.

It should support:

- participants;
- evidence;
- dialogue actions;
- conditions;
- effects;
- verdicts;
- final explanation.

It should not support yet:

- OpenAI API;
- images;
- auth;
- database;
- currency;
- random events;
- free text input;
- custom code in scenario files.

## Future expansion

Later versions may add:

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
