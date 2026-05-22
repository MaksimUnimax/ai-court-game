# Project Overview — AI Court Game

STATUS: draft_1

AI Court Game is a browser-based court/judge game.

The player acts as a judge and resolves a fictional case by reading a prepared scenario, clicking through participants, questions, evidence and final verdict options.

The long-term product direction includes AI-generated unique cases, OpenAI API, backend, database, authorization, roles, currency, scenario history and generated illustrations.

The first draft version intentionally does not build the long-term product yet.

The first draft version is a scenario-testing scaffold.

Its purpose is to test:

- how cases should be structured;
- how a scenario document should be written;
- how a page should distribute scenario content into roles, evidence, questions and verdict blocks;
- how the player clicks through the case;
- how scenario logic should be checked;
- how future GPT/API prompts should be designed.

In the first draft version, ChatGPT manually creates a scenario document. The user uploads this document into the page. The page/backend script parses the scenario and displays the game.

There is no free text input. Everything is controlled by mouse clicks.

