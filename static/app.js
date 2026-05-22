const state = {
  scenario: null,
  engine: null,
  selectedParticipantId: null,
  selectedEvidenceId: null,
};

const dom = {
  scenarioInput: document.querySelector("#scenario-input"),
  loadDemoBtn: document.querySelector("#load-demo-btn"),
  startScenarioBtn: document.querySelector("#start-scenario-btn"),
  validationPanel: document.querySelector("#validation-panel"),
  caseIntroPanel: document.querySelector("#case-intro-panel"),
  participantsPanel: document.querySelector("#participants-panel"),
  participantDetailPanel: document.querySelector("#participant-detail-panel"),
  relationshipsPanel: document.querySelector("#relationships-panel"),
  evidencePanel: document.querySelector("#evidence-panel"),
  evidenceDetailPanel: document.querySelector("#evidence-detail-panel"),
  actionsPanel: document.querySelector("#actions-panel"),
  eventLogPanel: document.querySelector("#event-log-panel"),
  verdictPanel: document.querySelector("#verdict-panel"),
  finalExplanationPanel: document.querySelector("#final-explanation-panel"),
};

const CONDITION_HANDLERS = {
  always: () => true,
  action_done: (condition, engine) => engine.completedActions.has(condition.action_id),
  question_asked: (condition, engine) => engine.askedQuestions.has(condition.question_id),
  evidence_opened: (condition, engine) => engine.openedEvidence.has(condition.evidence_id),
  fact_discovered: (condition, engine) => engine.discoveredFacts.has(condition.fact_id),
  contradiction_found: (condition, engine) => engine.foundContradictions.has(condition.contradiction_id),
  verdict_enabled: (condition, engine) => engine.enabledVerdicts.has(condition.verdict_id),
};

const EFFECT_HANDLERS = {
  mark_action_done(effect, engine, context) {
    engine.completedActions.add(effect.action_id || context.id);
  },
  unlock_question(effect, engine) {
    engine.unlockedQuestions.add(effect.question_id);
  },
  unlock_evidence(effect, engine) {
    engine.unlockedEvidence.add(effect.evidence_id);
  },
  discover_fact(effect, engine) {
    engine.discoveredFacts.add(effect.fact_id);
    if (effect.label) {
      engine.log.push({ type: "fact", text: effect.label });
    }
  },
  mark_contradiction(effect, engine) {
    engine.foundContradictions.add(effect.contradiction_id);
    if (effect.label) {
      engine.log.push({ type: "contradiction", text: effect.label });
    }
  },
  show_note(effect, engine) {
    engine.notes.push(effect.note);
    engine.log.push({ type: "note", text: effect.note });
  },
  enable_verdict(effect, engine) {
    engine.enabledVerdicts.add(effect.verdict_id);
  },
};

function createEngine(initialState) {
  return {
    completedActions: new Set(initialState.completed_actions || []),
    askedQuestions: new Set(initialState.asked_questions || []),
    openedEvidence: new Set(initialState.opened_evidence || []),
    discoveredFacts: new Set(initialState.discovered_facts || []),
    foundContradictions: new Set(initialState.found_contradictions || []),
    unlockedQuestions: new Set(initialState.unlocked_questions || []),
    unlockedEvidence: new Set(initialState.unlocked_evidence || []),
    enabledVerdicts: new Set(initialState.enabled_verdicts || []),
    selectedVerdict: initialState.selected_verdict || null,
    finished: Boolean(initialState.finished),
    log: initialState.event_log || [],
    notes: initialState.notes || [],
  };
}

function renderValidation(message, isError = false) {
  dom.validationPanel.className = `status-panel ${isError ? "status-error" : "status-ok"}`;
  dom.validationPanel.innerHTML = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function parseScenarioInput() {
  const raw = dom.scenarioInput.value.trim();
  if (!raw) {
    throw new Error("Scenario JSON is empty.");
  }
  return JSON.parse(raw);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error((data.errors || ["Request failed"]).join("<br>"));
  }
  return data;
}

function isConditionMet(condition, engine) {
  if (!condition) {
    return true;
  }
  if (condition.all) {
    return condition.all.every((child) => isConditionMet(child, engine));
  }
  if (condition.any) {
    return condition.any.some((child) => isConditionMet(child, engine));
  }
  if (condition.not) {
    return !isConditionMet(condition.not, engine);
  }
  const handler = CONDITION_HANDLERS[condition.type];
  return handler ? handler(condition, engine) : false;
}

function applyEffects(effects, context) {
  for (const effect of effects || []) {
    const handler = EFFECT_HANDLERS[effect.type];
    if (handler) {
      handler(effect, state.engine, context);
    }
  }
}

function isDialogueVisible(action) {
  return (
    state.engine.unlockedQuestions.has(action.id) ||
    state.engine.askedQuestions.has(action.id) ||
    action.visible_at_start
  );
}

function isDialogueAvailable(action) {
  return (
    !state.engine.finished &&
    isDialogueVisible(action) &&
    !state.engine.askedQuestions.has(action.id) &&
    isConditionMet(action.available_if, state.engine)
  );
}

function isEvidenceVisible(evidence) {
  return (
    state.engine.unlockedEvidence.has(evidence.id) ||
    state.engine.openedEvidence.has(evidence.id) ||
    evidence.visible_at_start
  );
}

function isEvidenceAvailable(evidence) {
  return !state.engine.finished && isEvidenceVisible(evidence) && isConditionMet(evidence.available_if, state.engine);
}

function isVerdictVisible(verdict) {
  return (
    state.engine.enabledVerdicts.has(verdict.id) ||
    state.engine.selectedVerdict === verdict.id ||
    verdict.available_at_start
  );
}

function isVerdictAvailable(verdict) {
  return (
    !state.engine.finished &&
    isVerdictVisible(verdict) &&
    isConditionMet(verdict.available_if, state.engine)
  );
}

function renderCaseIntro() {
  const { metadata, case_intro: intro } = state.scenario;
  dom.caseIntroPanel.innerHTML = `
    <h3>${escapeHtml(metadata.title)}</h3>
    <p class="muted">${escapeHtml(metadata.case_type)} · ${escapeHtml(metadata.difficulty)}</p>
    <p>${escapeHtml(intro.summary)}</p>
    <p><strong>Judge briefing:</strong> ${escapeHtml(intro.judge_briefing)}</p>
  `;
}

function renderParticipants() {
  dom.participantsPanel.innerHTML = state.scenario.participants
    .map((participant) => {
      const activeClass = participant.id === state.selectedParticipantId ? "active" : "";
      return `
        <div class="participant-card ${activeClass}">
          <h3>${escapeHtml(participant.name)}</h3>
          <div class="pill">${escapeHtml(participant.role)}</div>
          <p class="muted">${escapeHtml(participant.position)}</p>
          <button type="button" data-participant-id="${escapeHtml(participant.id)}">Inspect participant</button>
        </div>
      `;
    })
    .join("");

  if (!state.selectedParticipantId && state.scenario.participants.length) {
    state.selectedParticipantId = state.scenario.participants[0].id;
  }

  const participant = state.scenario.participants.find((item) => item.id === state.selectedParticipantId);
  if (!participant) {
    dom.participantDetailPanel.textContent = "Select a participant card to inspect details.";
    return;
  }
  dom.participantDetailPanel.innerHTML = `
    <h3>${escapeHtml(participant.name)}</h3>
    <p><strong>Role:</strong> ${escapeHtml(participant.role)}</p>
    <p><strong>Position:</strong> ${escapeHtml(participant.position)}</p>
    <p><strong>Relation to case:</strong> ${escapeHtml(participant.relation_to_case)}</p>
    <p>${escapeHtml(participant.public_description)}</p>
    <p><strong>Participant links:</strong> ${escapeHtml(participant.relationships.join("; "))}</p>
  `;
}

function renderRelationships() {
  if (!state.scenario.relationships.length) {
    dom.relationshipsPanel.textContent = "No relationships defined.";
    return;
  }
  const participantMap = new Map(state.scenario.participants.map((item) => [item.id, item]));
  dom.relationshipsPanel.innerHTML = state.scenario.relationships
    .map((relation) => {
      const from = participantMap.get(relation.from_participant_id);
      const to = participantMap.get(relation.to_participant_id);
      return `
        <div class="relationship-card">
          <h3>${escapeHtml(relation.label)}</h3>
          <p><strong>${escapeHtml(from?.name || relation.from_participant_id)}</strong> ↔ <strong>${escapeHtml(
            to?.name || relation.to_participant_id
          )}</strong></p>
          <p>${escapeHtml(relation.description)}</p>
        </div>
      `;
    })
    .join("");
}

function renderEvidence() {
  const visibleEvidence = state.scenario.evidence.filter(isEvidenceVisible);
  if (!visibleEvidence.length) {
    dom.evidencePanel.textContent = "No visible evidence yet.";
    dom.evidencePanel.className = "card-list empty-state";
    return;
  }
  dom.evidencePanel.className = "card-list";
  dom.evidencePanel.innerHTML = visibleEvidence
    .map((evidence) => {
      const opened = state.engine.openedEvidence.has(evidence.id);
      return `
        <div class="list-card">
          <h3>${escapeHtml(evidence.title)}</h3>
          <p>${escapeHtml(evidence.short_description)}</p>
          <div class="pill">${opened ? "Opened" : "Available"}</div>
          <button type="button" data-evidence-id="${escapeHtml(evidence.id)}">
            ${opened ? "Review evidence" : "Open evidence"}
          </button>
        </div>
      `;
    })
    .join("");

  const selectedEvidence =
    state.scenario.evidence.find((item) => item.id === state.selectedEvidenceId) ||
    visibleEvidence[0];
  if (!selectedEvidence) {
    dom.evidenceDetailPanel.textContent = "Click evidence to inspect it.";
    return;
  }
  state.selectedEvidenceId = selectedEvidence.id;
  dom.evidenceDetailPanel.innerHTML = `
    <h3>${escapeHtml(selectedEvidence.title)}</h3>
    <p>${escapeHtml(selectedEvidence.inspection_text)}</p>
    <p><strong>What it proves:</strong> ${escapeHtml(selectedEvidence.proves)}</p>
    <p><strong>Key evidence:</strong> ${selectedEvidence.key_evidence ? "yes" : "no"}</p>
  `;
}

function renderActions() {
  const groups = state.scenario.participants.map((participant) => {
    const actions = state.scenario.dialogue_actions.filter(
      (action) => action.participant_id === participant.id && isDialogueVisible(action)
    );
    return { participant, actions };
  });
  const visibleGroups = groups.filter((group) => group.actions.length);
  if (!visibleGroups.length) {
    dom.actionsPanel.textContent = "No dialogue actions available.";
    dom.actionsPanel.className = "action-groups empty-state";
    return;
  }

  const selectedParticipantId = state.selectedParticipantId;
  const orderedGroups = visibleGroups.sort((a, b) => {
    if (a.participant.id === selectedParticipantId) return -1;
    if (b.participant.id === selectedParticipantId) return 1;
    return 0;
  });

  dom.actionsPanel.className = "action-groups";
  dom.actionsPanel.innerHTML = orderedGroups
    .map(
      (group) => `
        <div class="action-group">
          <h3>${escapeHtml(group.participant.name)}</h3>
          <div class="action-buttons">
            ${group.actions
              .map((action) => {
                const done = state.engine.askedQuestions.has(action.id);
                const enabled = isDialogueAvailable(action);
                return `
                  <button type="button" data-action-id="${escapeHtml(action.id)}" ${
                    enabled ? "" : "disabled"
                  }>
                    ${escapeHtml(done ? `${action.label} (asked)` : action.label)}
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `
    )
    .join("");
}

function renderEventLog() {
  const entries = [];
  for (const fact of state.engine.discoveredFacts) {
    entries.push({ type: "fact", text: fact });
  }
  for (const contradiction of state.engine.foundContradictions) {
    entries.push({ type: "contradiction", text: contradiction });
  }
  for (const note of state.engine.notes) {
    entries.push({ type: "note", text: note });
  }
  for (const entry of state.engine.log) {
    entries.push(entry);
  }

  if (!entries.length) {
    dom.eventLogPanel.textContent = "No events recorded yet.";
    dom.eventLogPanel.className = "log-list empty-state";
    return;
  }
  dom.eventLogPanel.className = "log-list";
  dom.eventLogPanel.innerHTML = entries
    .map(
      (entry) => `
        <div class="log-card">
          <strong>${escapeHtml(entry.type)}</strong>
          <p>${escapeHtml(entry.text)}</p>
        </div>
      `
    )
    .join("");
}

function renderVerdicts() {
  const verdicts = state.scenario.verdicts.filter(isVerdictVisible);
  if (!verdicts.length) {
    dom.verdictPanel.textContent = "Verdict options are not enabled yet.";
    dom.verdictPanel.className = "card-list empty-state";
    return;
  }
  dom.verdictPanel.className = "card-list";
  dom.verdictPanel.innerHTML = verdicts
    .map((verdict) => {
      const enabled = isVerdictAvailable(verdict);
      const chosen = state.engine.selectedVerdict === verdict.id;
      return `
        <div class="verdict-card">
          <h3>${escapeHtml(verdict.label)}</h3>
          <button type="button" data-verdict-id="${escapeHtml(verdict.id)}" ${
            enabled ? "" : "disabled"
          }>
            ${escapeHtml(chosen ? "Selected" : "Choose verdict")}
          </button>
        </div>
      `;
    })
    .join("");
}

function renderFinalExplanation() {
  if (!state.engine.finished) {
    dom.finalExplanationPanel.textContent = "The final explanation appears after a verdict is selected.";
    dom.finalExplanationPanel.className = "empty-state";
    return;
  }
  const solution = state.scenario.solution;
  const correct = state.engine.selectedVerdict === solution.correct_verdict_id;
  dom.finalExplanationPanel.className = correct ? "detail-panel final-good" : "detail-panel final-bad";
  dom.finalExplanationPanel.innerHTML = `
    <h3>${correct ? "Correct verdict" : "Incorrect verdict"}</h3>
    <p><strong>Expected verdict:</strong> ${escapeHtml(
      state.scenario.verdicts.find((item) => item.id === solution.correct_verdict_id)?.label || solution.correct_verdict_id
    )}</p>
    <p>${escapeHtml(solution.explanation)}</p>
    <ul class="inline-list">
      ${solution.key_points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
    </ul>
  `;
}

function renderAll() {
  if (!state.scenario || !state.engine) {
    return;
  }
  renderCaseIntro();
  renderParticipants();
  renderRelationships();
  renderEvidence();
  renderActions();
  renderEventLog();
  renderVerdicts();
  renderFinalExplanation();
}

function startScenarioFromResponse(data) {
  state.scenario = data.scenario;
  state.engine = createEngine(data.initial_state);
  state.selectedParticipantId = data.scenario.participants[0]?.id || null;
  state.selectedEvidenceId = null;
  renderValidation("Scenario valid. Click through participants, evidence, and verdicts to test the graph flow.");
  renderAll();
}

function handleDialogueClick(actionId) {
  const action = state.scenario.dialogue_actions.find((item) => item.id === actionId);
  if (!action || !isDialogueAvailable(action)) {
    return;
  }
  state.engine.askedQuestions.add(action.id);
  state.engine.completedActions.add(action.id);
  state.engine.log.push({
    type: "dialogue",
    text: `${action.label}: ${action.response_text}`,
  });
  applyEffects(action.effects, action);
  renderAll();
}

function handleEvidenceClick(evidenceId) {
  const evidence = state.scenario.evidence.find((item) => item.id === evidenceId);
  if (!evidence || !isEvidenceAvailable(evidence)) {
    return;
  }
  state.selectedEvidenceId = evidence.id;
  if (!state.engine.openedEvidence.has(evidence.id)) {
    state.engine.openedEvidence.add(evidence.id);
    state.engine.completedActions.add(evidence.id);
    state.engine.log.push({
      type: "evidence",
      text: `${evidence.title}: ${evidence.inspection_text}`,
    });
    applyEffects(evidence.effects, evidence);
  }
  renderAll();
}

function handleVerdictClick(verdictId) {
  const verdict = state.scenario.verdicts.find((item) => item.id === verdictId);
  if (!verdict || !isVerdictAvailable(verdict)) {
    return;
  }
  state.engine.selectedVerdict = verdict.id;
  state.engine.finished = true;
  state.engine.log.push({ type: "verdict", text: `Verdict selected: ${verdict.label}` });
  renderAll();
}

dom.loadDemoBtn.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/demo-scenario");
    const data = await response.json();
    dom.scenarioInput.value = JSON.stringify(data, null, 2);
    renderValidation("Demo scenario loaded into the textarea.");
  } catch (error) {
    renderValidation(`Failed to load demo scenario: ${escapeHtml(error.message)}`, true);
  }
});

dom.startScenarioBtn.addEventListener("click", async () => {
  try {
    const scenario = parseScenarioInput();
    const data = await postJson("/api/start-scenario", scenario);
    startScenarioFromResponse(data);
  } catch (error) {
    renderValidation(error.message, true);
  }
});

document.addEventListener("click", (event) => {
  const participantId = event.target.getAttribute("data-participant-id");
  if (participantId) {
    state.selectedParticipantId = participantId;
    renderParticipants();
    renderActions();
  }

  const evidenceId = event.target.getAttribute("data-evidence-id");
  if (evidenceId && state.engine) {
    handleEvidenceClick(evidenceId);
  }

  const actionId = event.target.getAttribute("data-action-id");
  if (actionId && state.engine) {
    handleDialogueClick(actionId);
  }

  const verdictId = event.target.getAttribute("data-verdict-id");
  if (verdictId && state.engine) {
    handleVerdictClick(verdictId);
  }
});
