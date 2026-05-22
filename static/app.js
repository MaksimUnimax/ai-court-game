const state = {
  scenario: null,
  engine: null,
  selectedParticipantId: null,
  selectedEvidenceId: null,
  dialogueHistoryByParticipant: new Map(),
};

const dom = {
  scenarioInput: document.querySelector("#scenario-input"),
  loadDemoBtn: document.querySelector("#load-demo-btn"),
  startScenarioBtn: document.querySelector("#start-scenario-btn"),
  validationPanel: document.querySelector("#validation-panel"),
  caseIntroPanel: document.querySelector("#case-intro-panel"),
  participantsPanel: document.querySelector("#participants-panel"),
  relationshipsPanel: document.querySelector("#relationships-panel"),
  evidencePanel: document.querySelector("#evidence-panel"),
  evidenceDetailPanel: document.querySelector("#evidence-detail-panel"),
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
    throw new Error("JSON сценария пуст.");
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
    throw new Error((data.errors || ["Запрос не выполнен"]).join("<br>"));
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

function getDialogueHistory(participantId) {
  return state.dialogueHistoryByParticipant.get(participantId) || [];
}

function appendDialogueHistory(participantId, entry) {
  const history = getDialogueHistory(participantId);
  history.push(entry);
  state.dialogueHistoryByParticipant.set(participantId, history);
}

function summarizeDialogueEffects(effects) {
  return (effects || [])
    .map((effect) => {
      if (effect.type === "show_note") {
        return effect.note || null;
      }
      if (effect.type === "discover_fact") {
        return effect.label || null;
      }
      if (effect.type === "mark_contradiction") {
        return effect.label || null;
      }
      return null;
    })
    .filter(Boolean);
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
    <p><strong>Брифинг судьи:</strong> ${escapeHtml(intro.judge_briefing)}</p>
  `;
}

function renderParticipantDialogue(participant, isActive) {
  const actions = state.scenario.dialogue_actions.filter((action) => action.participant_id === participant.id);
  const visibleActions = actions.filter(isDialogueVisible);
  const availableActions = visibleActions.filter(isDialogueAvailable);
  const history = getDialogueHistory(participant.id);

  const historyHtml = history.length
    ? history
        .map(
          (item) => `
            <article class="dialogue-history-entry">
              <p class="dialogue-label">Вопрос</p>
              <p class="dialogue-question">${escapeHtml(item.question)}</p>
              <p class="dialogue-label">Ответ</p>
              <p class="dialogue-answer">${escapeHtml(item.answer)}</p>
              ${
                item.notes && item.notes.length
                  ? `
                    <div class="dialogue-history-notes">
                      <p class="dialogue-label">Сопутствующие эффекты</p>
                      <ul>
                        ${item.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
                      </ul>
                    </div>
                  `
                  : ""
              }
            </article>
          `
        )
        .join("")
    : `<div class="dialogue-window-hint">Пока в истории этого участника нет реплик.</div>`;

  const questionHtml = visibleActions.length
    ? visibleActions
        .map((action) => {
          const asked = state.engine.askedQuestions.has(action.id);
          const enabled = isDialogueAvailable(action);
          return `
            <button type="button" class="dialogue-question-button ${asked ? "is-asked" : ""}" data-action-id="${escapeHtml(
              action.id
            )}" ${enabled ? "" : "disabled"}>
              ${escapeHtml(asked ? `${action.label} (уже задан)` : action.label)}
            </button>
          `;
        })
        .join("")
    : `<div class="dialogue-window-hint">Пока для этого участника нет доступных вопросов.</div>`;

  if (!isActive) {
    return `
      <section class="participant-dialogue participant-dialogue-preview">
        <div class="participant-dialogue-header">
          <div>
            <h4>Диалог</h4>
            <p class="muted">Выберите участника, чтобы открыть разговор.</p>
          </div>
          <div class="pill">${history.length ? `История: ${history.length}` : "Пусто"}</div>
        </div>
        <div class="participant-dialogue-summary">
          <p>${history.length ? `В истории уже ${history.length} реплик.` : "В этой панели появятся вопросы и ответы участника."}</p>
          <p>${availableActions.length ? `Доступно вопросов: ${availableActions.length}` : "Пока нет доступных вопросов."}</p>
        </div>
      </section>
    `;
  }

  return `
    <section class="participant-dialogue participant-dialogue-active">
      <div class="participant-dialogue-header">
        <div>
          <h4>Диалог</h4>
          <p class="muted">Разговор с этим участником открыт.</p>
        </div>
        <div class="pill">${availableActions.length ? `Доступно вопросов: ${availableActions.length}` : "Вопросов нет"}</div>
      </div>
      <div class="participant-dialogue-body">
        ${
          history.length
            ? `
              <div class="dialogue-history">
                ${historyHtml}
              </div>
            `
            : `<div class="dialogue-window-hint">Пока в этом диалоге нет вопросов. Выберите вопрос ниже, чтобы начать разговор.</div>`
        }
        <div class="dialogue-question-list">
          ${questionHtml}
        </div>
      </div>
    </section>
  `;
}

function renderParticipants() {
  dom.participantsPanel.innerHTML = state.scenario.participants
    .map((participant) => {
      const activeClass = participant.id === state.selectedParticipantId ? "active" : "";
      const relationshipItems = Array.isArray(participant.relationships) ? participant.relationships : [];
      const relationships = relationshipItems.length
        ? relationshipItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
        : "<li>Связей пока нет.</li>";
      return `
        <article class="participant-card ${activeClass}">
          <div class="participant-card-portrait" aria-hidden="true">
            <span>Портрет будет здесь</span>
          </div>
          <div class="participant-card-body">
            <div class="participant-card-header">
              <div>
                <h3>${escapeHtml(participant.name)}</h3>
                <p class="muted">${escapeHtml(participant.role)} · ${escapeHtml(participant.position)}</p>
              </div>
              <button type="button" data-participant-id="${escapeHtml(participant.id)}">${
                activeClass ? "Диалог открыт" : "Открыть диалог"
              }</button>
            </div>
            <div class="participant-details-grid">
              <div class="participant-detail-block">
                <p class="participant-detail-label">Связь с делом</p>
                <p>${escapeHtml(participant.relation_to_case)}</p>
              </div>
              <div class="participant-detail-block">
                <p class="participant-detail-label">Публичное описание</p>
                <p>${escapeHtml(participant.public_description)}</p>
              </div>
              <div class="participant-detail-block">
                <p class="participant-detail-label">Связи с другими участниками</p>
                <ul class="participant-relationship-list">${relationships}</ul>
              </div>
            </div>
            ${renderParticipantDialogue(participant, activeClass)}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderRelationships() {
  if (!state.scenario.relationships.length) {
    dom.relationshipsPanel.textContent = "Отношения не заданы.";
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
    dom.evidencePanel.textContent = "Пока нет видимых доказательств.";
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
          <div class="pill">${opened ? "Открыто" : "Доступно"}</div>
          <button type="button" data-evidence-id="${escapeHtml(evidence.id)}">
            ${opened ? "Пересмотреть доказательство" : "Открыть доказательство"}
          </button>
        </div>
      `;
    })
    .join("");

  const selectedEvidence =
    state.scenario.evidence.find((item) => item.id === state.selectedEvidenceId) ||
    visibleEvidence[0];
  if (!selectedEvidence) {
    dom.evidenceDetailPanel.textContent = "Нажмите на доказательство, чтобы изучить его.";
    return;
  }
  state.selectedEvidenceId = selectedEvidence.id;
  dom.evidenceDetailPanel.innerHTML = `
    <h3>${escapeHtml(selectedEvidence.title)}</h3>
    <p>${escapeHtml(selectedEvidence.inspection_text)}</p>
    <p><strong>Что оно доказывает:</strong> ${escapeHtml(selectedEvidence.proves)}</p>
    <p><strong>Ключевое доказательство:</strong> ${selectedEvidence.key_evidence ? "да" : "нет"}</p>
  `;
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
    dom.eventLogPanel.textContent = "События пока не записаны.";
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
    dom.verdictPanel.textContent = "Варианты вердикта пока не доступны.";
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
            ${escapeHtml(chosen ? "Выбран" : "Выбрать вердикт")}
          </button>
        </div>
      `;
    })
    .join("");
}

function renderFinalExplanation() {
  if (!state.engine.finished) {
    dom.finalExplanationPanel.textContent = "Финальное объяснение появится после выбора вердикта.";
    dom.finalExplanationPanel.className = "empty-state";
    return;
  }
  const solution = state.scenario.solution;
  const correct = state.engine.selectedVerdict === solution.correct_verdict_id;
  dom.finalExplanationPanel.className = correct ? "detail-panel final-good" : "detail-panel final-bad";
  dom.finalExplanationPanel.innerHTML = `
    <h3>${correct ? "Правильный вердикт" : "Неправильный вердикт"}</h3>
    <p><strong>Ожидаемый вердикт:</strong> ${escapeHtml(
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
  renderEventLog();
  renderVerdicts();
  renderFinalExplanation();
}

function startScenarioFromResponse(data) {
  state.scenario = data.scenario;
  state.engine = createEngine(data.initial_state);
  state.selectedParticipantId = null;
  state.selectedEvidenceId = null;
  state.dialogueHistoryByParticipant = new Map();
  renderValidation("Сценарий валиден. Кликайте по участникам, доказательствам и вердиктам, чтобы протестировать граф.");
  renderAll();
}

function handleDialogueClick(actionId) {
  const action = state.scenario.dialogue_actions.find((item) => item.id === actionId);
  if (!action || !isDialogueAvailable(action)) {
    return;
  }
  state.selectedParticipantId = action.participant_id;
  state.engine.askedQuestions.add(action.id);
  state.engine.completedActions.add(action.id);
  const notes = summarizeDialogueEffects(action.effects);
  appendDialogueHistory(action.participant_id, {
    actionId: action.id,
    question: action.label,
    answer: action.response_text,
    notes,
  });
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
  state.engine.log.push({ type: "verdict", text: `Выбран вердикт: ${verdict.label}` });
  renderAll();
}

dom.loadDemoBtn.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/demo-scenario");
    const data = await response.json();
    dom.scenarioInput.value = JSON.stringify(data, null, 2);
    renderValidation("Демо-сценарий загружен в textarea.");
  } catch (error) {
    renderValidation(`Не удалось загрузить демо-сценарий: ${escapeHtml(error.message)}`, true);
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
    renderAll();
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
