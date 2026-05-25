const IMAGE_VIEWER_MIN_SCALE = 0.5;
const IMAGE_VIEWER_MAX_SCALE = 4;
const IMAGE_VIEWER_STEP = 0.2;
const ACTIVE_CASE_DB_NAME = "ai-court-game";
const ACTIVE_CASE_DB_VERSION = 1;
const ACTIVE_CASE_STORE_NAME = "active_cases";
const ACTIVE_CASE_STORAGE_KEY = "current";
const VOICE_SETTING_STORAGE_KEY = "ai-court-game-voice-enabled";
const VOICE_VOLUME_STORAGE_KEY = "ai-court-game-voice-volume";
const DEFAULT_TTS_VOLUME = 80;

const state = {
  scenario: null,
  engine: null,
  loadedScenario: null,
  loadedScenarioMeta: null,
  loadedImageRegistry: null,
  activeCaseRecord: null,
  activeCaseNotice: "",
  activeCaseError: "",
  selectedParticipantId: null,
  selectedEvidenceId: null,
  dialogueHistoryByParticipant: new Map(),
  tts: {
    enabled: readVoiceSetting(),
    volume: readVoiceVolumeSetting(),
    statusMessage: "",
    statusTone: "muted",
    currentAudio: null,
    currentObjectUrl: "",
    abortController: null,
    requestToken: 0,
    isBusy: false,
  },
  scenarioLibrary: {
    items: [],
    statusMessage: "",
    statusTone: "muted",
    isLoading: false,
  },
  imageViewer: {
    open: false,
    assetId: null,
    title: "",
    alt: "",
    url: "",
    scale: 1,
    fitWidth: 0,
    fitHeight: 0,
    baseMeasurementFrame: null,
    drag: {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      startScrollLeft: 0,
      startScrollTop: 0,
    },
  },
};

const dom = {
  casePackageInput: document.querySelector("#case-package-input"),
  loadDemoBtn: document.querySelector("#load-demo-btn"),
  startScenarioBtn: document.querySelector("#start-scenario-btn"),
  restartScenarioBtn: document.querySelector("#restart-scenario-btn"),
  deleteActiveCaseBtn: document.querySelector("#delete-active-case-btn"),
  saveScenarioLibraryBtn: document.querySelector("#save-scenario-library-btn"),
  refreshScenarioLibraryBtn: document.querySelector("#refresh-scenario-library-btn"),
  importScenarioLibraryBtn: document.querySelector("#import-scenario-library-btn"),
  scenarioLibraryImportInput: document.querySelector("#scenario-library-import-input"),
  scenarioLibraryStatusPanel: document.querySelector("#scenario-library-status-panel"),
  scenarioLibraryList: document.querySelector("#scenario-library-list"),
  voiceToggleBtn: document.querySelector("#voice-toggle-btn"),
  stopVoiceBtn: document.querySelector("#stop-voice-btn"),
  voiceVolumeSlider: document.querySelector("#voice-volume-slider"),
  voiceVolumeValue: document.querySelector("#voice-volume-value"),
  ttsStatusPanel: document.querySelector("#tts-status-panel"),
  validationPanel: document.querySelector("#validation-panel"),
  activeCasePanel: document.querySelector("#active-case-status-panel"),
  caseIntroPanel: document.querySelector("#case-intro-panel"),
  visualAssetsPanel: document.querySelector("#visual-assets-panel"),
  participantsPanel: document.querySelector("#participants-panel"),
  relationshipsPanel: document.querySelector("#relationships-panel"),
  evidencePanel: document.querySelector("#evidence-panel"),
  evidenceDetailPanel: document.querySelector("#evidence-detail-panel"),
  eventLogPanel: document.querySelector("#event-log-panel"),
  verdictPanel: document.querySelector("#verdict-panel"),
  finalExplanationPanel: document.querySelector("#final-explanation-panel"),
  imageViewerModal: document.querySelector("#image-viewer-modal"),
  imageViewerCloseBtn: document.querySelector("#image-viewer-close-btn"),
  imageViewerZoomOutBtn: document.querySelector("#image-viewer-zoom-out-btn"),
  imageViewerResetBtn: document.querySelector("#image-viewer-reset-btn"),
  imageViewerZoomInBtn: document.querySelector("#image-viewer-zoom-in-btn"),
  imageViewerTitle: document.querySelector("#image-viewer-title"),
  imageViewerAlt: document.querySelector("#image-viewer-alt"),
  imageViewerScale: document.querySelector("#image-viewer-scale"),
  imageViewerImage: document.querySelector("#image-viewer-image"),
  imageViewerViewport: document.querySelector("#image-viewer-viewport"),
};

dom.startScenarioBtn.disabled = true;
if (dom.deleteActiveCaseBtn) {
  dom.deleteActiveCaseBtn.disabled = true;
}
if (dom.restartScenarioBtn) {
  dom.restartScenarioBtn.hidden = true;
  dom.restartScenarioBtn.disabled = true;
}
let activeCaseAsyncToken = 0;

function readVoiceSetting() {
  try {
    const savedValue = window.localStorage.getItem(VOICE_SETTING_STORAGE_KEY);
    return savedValue === null ? false : savedValue === "true";
  } catch (_error) {
    return false;
  }
}

function writeVoiceSetting(value) {
  try {
    window.localStorage.setItem(VOICE_SETTING_STORAGE_KEY, String(Boolean(value)));
  } catch (_error) {
    return;
  }
}

function clampVolumePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_TTS_VOLUME;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function readVoiceVolumeSetting() {
  try {
    const savedValue = window.localStorage.getItem(VOICE_VOLUME_STORAGE_KEY);
    return savedValue === null ? DEFAULT_TTS_VOLUME : clampVolumePercent(savedValue);
  } catch (_error) {
    return DEFAULT_TTS_VOLUME;
  }
}

function writeVoiceVolumeSetting(value) {
  try {
    window.localStorage.setItem(VOICE_VOLUME_STORAGE_KEY, String(clampVolumePercent(value)));
  } catch (_error) {
    return;
  }
}

function beginActiveCaseAsyncOperation() {
  activeCaseAsyncToken += 1;
  return activeCaseAsyncToken;
}

function isActiveCaseAsyncOperationCurrent(token) {
  return token === activeCaseAsyncToken;
}

function normalizeTtsText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function setTtsStatus(message, tone = "muted") {
  state.tts.statusMessage = message;
  state.tts.statusTone = tone;
  renderTtsControls();
}

function revokeCurrentTtsObjectUrl() {
  if (!state.tts.currentObjectUrl) {
    return;
  }
  URL.revokeObjectURL(state.tts.currentObjectUrl);
  state.tts.currentObjectUrl = "";
}

function stopCurrentTts(options = {}) {
  const { invalidatePending = true, nextStatusMessage = null, nextStatusTone = null } = options;
  if (invalidatePending) {
    state.tts.requestToken += 1;
  }
  if (state.tts.abortController) {
    state.tts.abortController.abort();
    state.tts.abortController = null;
  }
  if (state.tts.currentAudio) {
    state.tts.currentAudio.pause();
    state.tts.currentAudio.removeAttribute("src");
    state.tts.currentAudio.load();
    state.tts.currentAudio = null;
  }
  revokeCurrentTtsObjectUrl();
  state.tts.isBusy = false;
  if (nextStatusMessage !== null) {
    state.tts.statusMessage = nextStatusMessage;
  }
  if (nextStatusTone !== null) {
    state.tts.statusTone = nextStatusTone;
  }
  renderTtsControls();
}

function renderTtsControls() {
  if (dom.voiceToggleBtn) {
    dom.voiceToggleBtn.textContent = state.tts.enabled ? "Голос: включён" : "Голос: выключен";
  }
  if (dom.stopVoiceBtn) {
    dom.stopVoiceBtn.disabled = !state.tts.isBusy && !state.tts.currentAudio;
  }
  if (dom.voiceVolumeSlider) {
    dom.voiceVolumeSlider.value = String(state.tts.volume);
  }
  if (dom.voiceVolumeValue) {
    dom.voiceVolumeValue.textContent = `${state.tts.volume}%`;
  }
  if (state.tts.currentAudio) {
    state.tts.currentAudio.volume = state.tts.volume / 100;
  }
  const hasCurrentAudio = Boolean(state.tts.currentAudio);
  const pauseButtonLabel = hasCurrentAudio && state.tts.currentAudio.paused ? "Продолжить" : "Пауза";
  document.querySelectorAll("[data-tts-pause]").forEach((button) => {
    button.textContent = pauseButtonLabel;
    button.disabled = !hasCurrentAudio;
  });
  if (dom.ttsStatusPanel) {
    const toneClass =
      state.tts.statusTone === "error"
        ? "status-error"
        : state.tts.statusTone === "ok"
          ? "status-ok"
          : state.tts.statusTone === "pending"
            ? "status-pending"
            : "";
    dom.ttsStatusPanel.className = `status-panel tts-status-panel ${toneClass}`.trim();
    dom.ttsStatusPanel.textContent =
      state.tts.statusMessage || (state.tts.enabled ? "Озвучка готова" : "Голос выключен");
  }
}

function renderTtsActionRow(listenButtonHtml) {
  return `
    <div class="tts-action-row">
      ${listenButtonHtml}
      <button type="button" class="tts-action-button tts-pause-button" data-tts-pause>Пауза</button>
    </div>
  `;
}

function toggleVoiceSetting() {
  state.tts.enabled = !state.tts.enabled;
  writeVoiceSetting(state.tts.enabled);
  if (!state.tts.enabled) {
    stopCurrentTts({ nextStatusMessage: "Голос выключен", nextStatusTone: "muted" });
    return;
  }
  setTtsStatus("Озвучка готова", "ok");
}

async function toggleCurrentTtsPause() {
  if (!state.tts.currentAudio) {
    return;
  }
  if (state.tts.currentAudio.paused) {
    try {
      state.tts.isBusy = true;
      state.tts.statusMessage = "Озвучка воспроизводится";
      state.tts.statusTone = "ok";
      await state.tts.currentAudio.play();
      renderTtsControls();
    } catch (error) {
      setTtsStatus(error.message || "Не удалось возобновить озвучку", "error");
    }
    return;
  }

  state.tts.currentAudio.pause();
  state.tts.isBusy = false;
  setTtsStatus("Озвучка приостановлена", "muted");
}

function updateVoiceVolume(value) {
  state.tts.volume = clampVolumePercent(value);
  writeVoiceVolumeSetting(state.tts.volume);
  if (state.tts.currentAudio) {
    state.tts.currentAudio.volume = state.tts.volume / 100;
  }
  renderTtsControls();
}

async function requestTtsPlayback(payload, options = {}) {
  const { manual = false } = options;
  const text = normalizeTtsText(payload?.text);
  if (!text) {
    setTtsStatus("Не удалось сгенерировать озвучку", "error");
    return;
  }
  if (!manual && !state.tts.enabled) {
    setTtsStatus("Голос выключен", "muted");
    return;
  }

  const requestToken = state.tts.requestToken + 1;
  state.tts.requestToken = requestToken;
  stopCurrentTts({ invalidatePending: false });
  state.tts.isBusy = true;
  setTtsStatus("Генерирую озвучку...", "pending");

  const abortController = new AbortController();
  state.tts.abortController = abortController;

  try {
    const response = await fetch("/api/tts/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, text }),
      signal: abortController.signal,
    });
    if (requestToken !== state.tts.requestToken) {
      return;
    }

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error((errorPayload.errors || ["Не удалось сгенерировать озвучку"]).join(". "));
    }

    const audioBlob = await response.blob();
    if (requestToken !== state.tts.requestToken) {
      return;
    }

    const objectUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(objectUrl);
    audio.volume = state.tts.volume / 100;
    state.tts.currentObjectUrl = objectUrl;
    state.tts.currentAudio = audio;
    state.tts.abortController = null;

    const finalizePlayback = () => {
      if (requestToken !== state.tts.requestToken) {
        return;
      }
      state.tts.currentAudio = null;
      state.tts.isBusy = false;
      revokeCurrentTtsObjectUrl();
      state.tts.statusMessage = state.tts.enabled ? "Озвучка готова" : "Голос выключен";
      state.tts.statusTone = state.tts.enabled ? "ok" : "muted";
      renderTtsControls();
    };

    audio.addEventListener("ended", finalizePlayback, { once: true });
    audio.addEventListener(
      "error",
      () => {
        finalizePlayback();
        setTtsStatus("Не удалось сгенерировать озвучку", "error");
      },
      { once: true }
    );

    await audio.play();
    state.tts.isBusy = true;
    setTtsStatus("Озвучка готова", "ok");
  } catch (error) {
    if (requestToken !== state.tts.requestToken) {
      return;
    }
    if (error?.name === "AbortError") {
      state.tts.isBusy = false;
      renderTtsControls();
      return;
    }
    stopCurrentTts({
      invalidatePending: false,
      nextStatusMessage: error.message || "Не удалось сгенерировать озвучку",
      nextStatusTone: "error",
    });
  }
}

function joinNarrationParts(parts) {
  return parts.map(normalizeTtsText).filter(Boolean).join(" ");
}

function buildCaseIntroTtsText() {
  if (!state.scenario) {
    return "";
  }
  const intro = state.scenario.case_intro || {};
  const metadata = state.scenario.metadata || {};
  return joinNarrationParts([
    metadata.title,
    metadata.case_type,
    intro.title,
    intro.summary,
    intro.court_context,
    intro.judge_goal,
    intro.judge_briefing,
  ]);
}

function buildVerdictTtsText(verdictId) {
  if (!state.scenario || !state.engine?.finished) {
    return "";
  }
  const verdict = state.scenario.verdicts.find((item) => item.id === verdictId);
  const solution = state.scenario.solution || {};
  if (!verdict) {
    return "";
  }
  return joinNarrationParts([
    "Вердикт суда.",
    verdict.label,
    solution.explanation,
  ]);
}

function buildFinalExplanationTtsText() {
  if (!state.scenario || !state.engine?.finished) {
    return "";
  }
  const solution = state.scenario.solution || {};
  const expectedVerdictLabel =
    state.scenario.verdicts.find((item) => item.id === solution.correct_verdict_id)?.label || solution.correct_verdict_id;
  return joinNarrationParts([
    state.engine.selectedVerdict === solution.correct_verdict_id ? "Правильный вердикт." : "Неправильный вердикт.",
    expectedVerdictLabel ? `Ожидаемый вердикт: ${expectedVerdictLabel}.` : "",
    solution.explanation,
    ...(Array.isArray(solution.key_points) ? solution.key_points : []),
  ]);
}

function buildEvidenceTtsText(evidenceId) {
  const evidence = state.scenario?.evidence?.find((item) => item.id === evidenceId);
  if (!evidence) {
    return "";
  }
  return joinNarrationParts([
    `Доказательство. ${evidence.title || ""}`,
    evidence.short_description || evidence.short_text,
    evidence.inspection_text || evidence.inspect_text,
  ]);
}

function playCaseIntroNarration(options = {}) {
  return requestTtsPlayback(
    {
      text: buildCaseIntroTtsText(),
      voice_role: "narrator",
      content_id: "case_intro",
    },
    options
  );
}

function playDialogueNarration(actionId, options = {}) {
  const action = state.scenario?.dialogue_actions?.find((item) => item.id === actionId);
  if (!action) {
    return Promise.resolve();
  }
  return requestTtsPlayback(
    {
      text: action.response_text,
      voice_role: "participant",
      participant_id: action.participant_id,
      dialogue_action_id: action.id,
    },
    options
  );
}

function playVerdictNarration(verdictId, options = {}) {
  return requestTtsPlayback(
    {
      text: buildVerdictTtsText(verdictId),
      voice_role: "verdict",
      content_id: `verdict:${verdictId}`,
    },
    options
  );
}

function playFinalExplanationNarration(options = {}) {
  return requestTtsPlayback(
    {
      text: buildFinalExplanationTtsText(),
      voice_role: "verdict",
      content_id: "final_explanation",
    },
    options
  );
}

function playEvidenceNarration(evidenceId, options = {}) {
  return requestTtsPlayback(
    {
      text: buildEvidenceTtsText(evidenceId),
      voice_role: "evidence",
      content_id: `evidence:${evidenceId}`,
    },
    options
  );
}

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

function createEmptyGameState() {
  stopCurrentTts({ nextStatusMessage: state.tts.enabled ? "Озвучка готова" : "Голос выключен", nextStatusTone: state.tts.enabled ? "ok" : "muted" });
  state.scenario = null;
  state.engine = null;
  state.selectedParticipantId = null;
  state.selectedEvidenceId = null;
  state.dialogueHistoryByParticipant = new Map();
}

function getSourceTypeLabel(sourceType) {
  const labels = {
    demo: "демо",
    zip: "ZIP",
    json_images: "JSON + изображения",
    json_files: "JSON + файлы",
    library: "библиотека",
  };
  return labels[sourceType] || sourceType || "неизвестно";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл изображения."));
    reader.readAsDataURL(file);
  });
}

function serializeImageRegistry(registry) {
  return {
    by_path: Object.fromEntries(registry?.byPath || []),
    by_basename: Object.fromEntries(registry?.byBasename || []),
  };
}

function deserializeImageRegistry(images = {}) {
  return createImageRegistryFromPackage(images);
}

function serializeEngineState(engine) {
  if (!engine) {
    return null;
  }
  return {
    completed_actions: Array.from(engine.completedActions),
    asked_questions: Array.from(engine.askedQuestions),
    opened_evidence: Array.from(engine.openedEvidence),
    discovered_facts: Array.from(engine.discoveredFacts),
    found_contradictions: Array.from(engine.foundContradictions),
    unlocked_questions: Array.from(engine.unlockedQuestions),
    unlocked_evidence: Array.from(engine.unlockedEvidence),
    enabled_verdicts: Array.from(engine.enabledVerdicts),
    selected_verdict: engine.selectedVerdict,
    finished: engine.finished,
    event_log: engine.log || [],
    notes: engine.notes || [],
  };
}

function serializeDialogueHistory() {
  const entries = {};
  for (const [participantId, history] of state.dialogueHistoryByParticipant.entries()) {
    entries[participantId] = history;
  }
  return entries;
}

function deserializeDialogueHistory(serialized = {}) {
  return new Map(
    Object.entries(serialized).map(([participantId, history]) => [
      participantId,
      Array.isArray(history) ? history : [],
    ])
  );
}

function serializeLoadedPackageMeta(meta) {
  if (!meta) {
    return null;
  }
  return {
    sourceLabel: meta.sourceLabel || "",
    sourceType: meta.sourceType || "",
    packageType: meta.packageType || "",
    archiveName: meta.archiveName || "",
    archiveSizeBytes: Number.isFinite(meta.archiveSizeBytes) ? meta.archiveSizeBytes : null,
    fileName: meta.fileName || "",
    sizeBytes: Number.isFinite(meta.sizeBytes) ? meta.sizeBytes : null,
    title: meta.title || "Без названия",
    selectedImageCount: meta.selectedImageCount || 0,
    matchedImageCount: meta.matchedImageCount || 0,
    unmatchedImageCount: meta.unmatchedImageCount || 0,
    warnings: Array.isArray(meta.warnings) ? meta.warnings : [],
    validationErrors: Array.isArray(meta.validationErrors) ? meta.validationErrors : [],
    libraryId: meta.libraryId || "",
  };
}

function buildActiveCaseSnapshot() {
  if (!state.loadedScenario || !state.loadedScenarioMeta) {
    return null;
  }
  return {
    key: ACTIVE_CASE_STORAGE_KEY,
    version: ACTIVE_CASE_DB_VERSION,
    saved_at: new Date().toISOString(),
    scenario: state.loadedScenario,
    images: serializeImageRegistry(state.loadedImageRegistry),
    meta: serializeLoadedPackageMeta(state.loadedScenarioMeta),
    engine_state: serializeEngineState(state.engine),
    dialogue_history_by_participant: serializeDialogueHistory(),
    ui_state: {
      selected_participant_id: state.selectedParticipantId,
      selected_evidence_id: state.selectedEvidenceId,
    },
    active_case_record: state.activeCaseRecord || null,
  };
}

function openActiveCaseDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB недоступен в этом браузере."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ACTIVE_CASE_DB_NAME, ACTIVE_CASE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ACTIVE_CASE_STORE_NAME)) {
        db.createObjectStore(ACTIVE_CASE_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onerror = () => reject(request.error || new Error("Не удалось открыть хранилище браузера."));
    request.onsuccess = () => resolve(request.result);
  });
}

async function readActiveCaseSnapshot() {
  const db = await openActiveCaseDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(ACTIVE_CASE_STORE_NAME, "readonly");
      const store = tx.objectStore(ACTIVE_CASE_STORE_NAME);
      const request = store.get(ACTIVE_CASE_STORAGE_KEY);
      request.onerror = () => reject(request.error || new Error("Не удалось прочитать активное дело."));
      request.onsuccess = () => resolve(request.result || null);
    });
  } finally {
    db.close();
  }
}

async function writeActiveCaseSnapshot(snapshot) {
  const db = await openActiveCaseDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(ACTIVE_CASE_STORE_NAME, "readwrite");
      const store = tx.objectStore(ACTIVE_CASE_STORE_NAME);
      const request = store.put(snapshot);
      request.onerror = () => reject(request.error || new Error("Не удалось сохранить активное дело."));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Не удалось сохранить активное дело."));
      tx.onabort = () => reject(tx.error || new Error("Не удалось сохранить активное дело."));
    });
  } finally {
    db.close();
  }
}

async function deleteActiveCaseSnapshot() {
  const db = await openActiveCaseDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(ACTIVE_CASE_STORE_NAME, "readwrite");
      const store = tx.objectStore(ACTIVE_CASE_STORE_NAME);
      const request = store.delete(ACTIVE_CASE_STORAGE_KEY);
      request.onerror = () => reject(request.error || new Error("Не удалось удалить активное дело."));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Не удалось удалить активное дело."));
      tx.onabort = () => reject(tx.error || new Error("Не удалось удалить активное дело."));
    });
  } finally {
    db.close();
  }
}

function buildActiveCaseRecordFromSnapshot(snapshot, meta) {
  const packageStatus = snapshot.engine_state
    ? snapshot.engine_state.finished
      ? "finished"
      : "started"
    : "loaded";
  return {
    title: meta?.title || getScenarioTitle(snapshot.scenario),
    sourceType: meta?.sourceType || meta?.packageType || "",
    sourceLabel: meta?.sourceLabel || "",
    savedAt: snapshot.saved_at || new Date().toISOString(),
    selectedImageCount: meta?.selectedImageCount || 0,
    packageStatus,
    gameplayStarted: Boolean(snapshot.engine_state),
    libraryId: meta?.libraryId || "",
  };
}

function restoreSnapshotIntoState(snapshot) {
  if (!snapshot || !snapshot.scenario) {
    throw new Error("Сохранённое активное дело повреждено.");
  }
  const meta = snapshot.meta || {};
  state.loadedScenario = snapshot.scenario;
  state.loadedImageRegistry = deserializeImageRegistry(snapshot.images || {});
  state.loadedScenarioMeta = {
    sourceLabel: meta.sourceLabel || "Память браузера",
    sourceType: meta.sourceType || meta.packageType || "",
    packageType: meta.packageType || meta.sourceType || "",
    archiveName: meta.archiveName || "",
    archiveSizeBytes: meta.archiveSizeBytes || null,
    fileName: meta.fileName || "",
    sizeBytes: meta.sizeBytes || null,
    title: meta.title || getScenarioTitle(snapshot.scenario),
    selectedImageCount: meta.selectedImageCount || 0,
    matchedImageCount: meta.matchedImageCount || 0,
    unmatchedImageCount: meta.unmatchedImageCount || 0,
    warnings: Array.isArray(meta.warnings) ? meta.warnings : [],
    validationErrors: Array.isArray(meta.validationErrors) ? meta.validationErrors : [],
    libraryId: meta.libraryId || "",
  };
  state.activeCaseRecord = snapshot.active_case_record || buildActiveCaseRecordFromSnapshot(snapshot, state.loadedScenarioMeta);
  state.activeCaseNotice = "Активное дело восстановлено из памяти браузера.";
  state.activeCaseError = "";
  updateLoadedPackageButtons();

  if (snapshot.engine_state) {
    state.scenario = snapshot.scenario;
    state.engine = createEngine(snapshot.engine_state);
    state.selectedParticipantId = snapshot.ui_state?.selected_participant_id || null;
    state.selectedEvidenceId = snapshot.ui_state?.selected_evidence_id || null;
    state.dialogueHistoryByParticipant = deserializeDialogueHistory(snapshot.dialogue_history_by_participant || {});
    renderLoadedPackageStatus("Активное дело восстановлено из памяти браузера.");
    renderAll();
  } else {
    clearCurrentRuntimeState();
    resetGamePanelsToEmptyState();
    renderLoadedPackageStatus("Активное дело восстановлено из памяти браузера.");
  }

  renderActiveCaseStatus();
}

let persistQueue = Promise.resolve();

function queueActiveCasePersistence() {
  const snapshot = buildActiveCaseSnapshot();
  if (!snapshot) {
    return Promise.resolve();
  }
  if (state.activeCaseRecord) {
    state.activeCaseRecord = {
      ...state.activeCaseRecord,
      packageStatus: state.engine ? (state.engine.finished ? "finished" : "started") : state.activeCaseRecord.packageStatus || "loaded",
      gameplayStarted: Boolean(state.engine),
      savedAt: snapshot.saved_at,
    };
  }
  state.activeCaseNotice = "Активное дело сохранено в памяти браузера.";
  state.activeCaseError = "";
  renderActiveCaseStatus();
  persistQueue = persistQueue
    .catch(() => {})
    .then(() => writeActiveCaseSnapshot(snapshot));
  persistQueue.catch((error) => {
    state.activeCaseError = `Не удалось сохранить активное дело: ${error.message}`;
    renderActiveCaseStatus();
  });
  return persistQueue;
}

function resetGamePanelsToEmptyState() {
  if (dom.caseIntroPanel) {
    dom.caseIntroPanel.className = "empty-state";
    dom.caseIntroPanel.textContent = "Запустите сценарий, чтобы увидеть брифинг дела.";
  }
  if (dom.visualAssetsPanel) {
    dom.visualAssetsPanel.className = "visual-assets-grid empty-state";
    dom.visualAssetsPanel.textContent = "Иллюстрации появятся после загрузки пакета дела.";
  }
  if (dom.participantsPanel) {
    dom.participantsPanel.className = "participant-grid";
    dom.participantsPanel.innerHTML = "";
  }
  if (dom.relationshipsPanel) {
    dom.relationshipsPanel.className = "relationship-list empty-state";
    dom.relationshipsPanel.textContent = "Отношения появятся здесь после запуска сценария.";
  }
  if (dom.evidencePanel) {
    dom.evidencePanel.className = "card-list empty-state";
    dom.evidencePanel.textContent = "Пока нет видимых доказательств.";
  }
  if (dom.evidenceDetailPanel) {
    dom.evidenceDetailPanel.className = "detail-panel empty-state";
    dom.evidenceDetailPanel.textContent = "Нажмите на доказательство, чтобы изучить его.";
  }
  if (dom.eventLogPanel) {
    dom.eventLogPanel.className = "log-list empty-state";
    dom.eventLogPanel.textContent = "События пока не записаны.";
  }
  if (dom.verdictPanel) {
    dom.verdictPanel.className = "card-list empty-state";
    dom.verdictPanel.textContent = "Варианты вердикта пока не доступны.";
  }
  if (dom.finalExplanationPanel) {
    dom.finalExplanationPanel.className = "empty-state";
    dom.finalExplanationPanel.textContent = "Финальное объяснение появится после выбора вердикта.";
  }
}

function updateLoadedPackageButtons() {
  dom.startScenarioBtn.disabled = !state.loadedScenario || Boolean(state.engine);
  if (dom.restartScenarioBtn) {
    const shouldShowRestartButton = Boolean(state.loadedScenario || state.loadedScenarioMeta || state.activeCaseRecord);
    dom.restartScenarioBtn.hidden = !shouldShowRestartButton;
    dom.restartScenarioBtn.disabled = !shouldShowRestartButton;
  }
}

function resetCurrentScenarioState() {
  stopCurrentTts({ nextStatusMessage: state.tts.enabled ? "Озвучка готова" : "Голос выключен", nextStatusTone: state.tts.enabled ? "ok" : "muted" });
  closeImageViewer();
  state.selectedParticipantId = null;
  state.selectedEvidenceId = null;
  state.dialogueHistoryByParticipant = new Map();
}

function renderActiveCaseStatus() {
  if (!dom.activeCasePanel) {
    return;
  }

  const record = state.activeCaseRecord;
  const sourceType = record?.sourceType || state.loadedScenarioMeta?.sourceType || "";
  const hasCase = Boolean(record || state.loadedScenario || state.loadedScenarioMeta);
  const coverSource = getCaseCoverSource();
  const gameplayStatus = state.engine
    ? state.engine.finished
      ? "Сценарий завершён"
      : "Сценарий запущен"
    : hasCase
      ? "Пакет сохранён, сценарий можно запустить"
      : "Активное дело не сохранено";

  const statusText = state.activeCaseError
    ? state.activeCaseError
    : state.activeCaseNotice || gameplayStatus;

  if (!hasCase && !state.activeCaseError) {
    dom.activeCasePanel.className = "case-cover-panel empty-state";
    dom.activeCasePanel.innerHTML = `
      ${renderCaseCoverMarkup(coverSource)}
      <div class="case-cover-meta">
        <p><strong>Статус:</strong> ${escapeHtml(statusText)}</p>
      </div>
    `;
    if (dom.deleteActiveCaseBtn) {
      dom.deleteActiveCaseBtn.disabled = true;
    }
    return;
  }

  const savedAt = record?.savedAt ? new Date(record.savedAt).toLocaleString("ru-RU") : "неизвестно";
  const imageCount = Number.isFinite(record?.selectedImageCount) ? record.selectedImageCount : state.loadedScenarioMeta?.selectedImageCount || 0;
  const packageStatus = state.engine
    ? state.engine.finished
      ? "сохранён с завершённым сценарием"
      : "сохранён с текущим прохождением"
    : record?.packageStatus === "finished"
      ? "сохранён с завершённым сценарием"
      : record?.packageStatus === "started"
        ? "сохранён с текущим прохождением"
        : "сохранён без запущенного сценария";

  dom.activeCasePanel.className = state.activeCaseError ? "case-cover-panel status-error" : "case-cover-panel";
  dom.activeCasePanel.innerHTML = `
    ${renderCaseCoverMarkup(coverSource)}
    <div class="case-cover-meta">
      <p><strong>Активное дело:</strong> ${escapeHtml(record?.title || state.loadedScenarioMeta?.title || "Без названия")}</p>
      <p><strong>Источник:</strong> ${escapeHtml(getSourceTypeLabel(sourceType))}</p>
      <p><strong>Иллюстраций:</strong> ${escapeHtml(String(imageCount))}</p>
      <p><strong>Сохранено:</strong> ${escapeHtml(savedAt)}</p>
      <p><strong>Статус:</strong> ${escapeHtml(statusText)}</p>
    </div>
  `;
  if (dom.deleteActiveCaseBtn) {
    dom.deleteActiveCaseBtn.disabled = !hasCase;
  }
}

function formatLibraryDate(value) {
  if (!value) {
    return "неизвестно";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "неизвестно";
  }
  return date.toLocaleString("ru-RU");
}

function setScenarioLibraryStatus(message, tone = "muted") {
  state.scenarioLibrary.statusMessage = message || "";
  state.scenarioLibrary.statusTone = tone;
  renderScenarioLibraryStatus();
}

function renderScenarioLibraryStatus() {
  if (!dom.scenarioLibraryStatusPanel) {
    return;
  }
  const toneClass =
    state.scenarioLibrary.statusTone === "error"
      ? "status-error"
      : state.scenarioLibrary.statusTone === "ok"
        ? "status-ok"
        : state.scenarioLibrary.statusTone === "pending"
          ? "status-pending"
          : "";
  dom.scenarioLibraryStatusPanel.className = `status-panel ${toneClass}`.trim();
  dom.scenarioLibraryStatusPanel.textContent =
    state.scenarioLibrary.statusMessage || "Сохраните текущее дело в библиотеку или импортируйте сохранённый ZIP.";
}

function renderScenarioLibraryList() {
  if (!dom.scenarioLibraryList) {
    return;
  }
  const items = Array.isArray(state.scenarioLibrary.items) ? state.scenarioLibrary.items : [];
  if (!items.length) {
    dom.scenarioLibraryList.className = "library-list empty-state";
    dom.scenarioLibraryList.textContent = state.scenarioLibrary.isLoading
      ? "Загружаем список сценариев..."
      : "В библиотеке пока нет сохранённых сценариев.";
    return;
  }

  dom.scenarioLibraryList.className = "library-list";
  dom.scenarioLibraryList.innerHTML = items
    .map(
      (item) => `
        <article class="library-item">
          <div class="library-item-header">
            <div class="library-item-meta">
              <h3 class="library-item-title">${escapeHtml(item.title || "Без названия")}</h3>
              <p class="library-item-subtitle">
                ${escapeHtml(String(item.image_count || 0))} иллюстраций · обновлён ${escapeHtml(formatLibraryDate(item.updated_at))}
              </p>
            </div>
            <div class="library-item-actions">
              <button type="button" data-library-action="load" data-library-id="${escapeHtml(item.id)}">Загрузить</button>
              <button type="button" data-library-action="export" data-library-id="${escapeHtml(item.id)}">Экспорт</button>
              <button type="button" data-library-action="delete" data-library-id="${escapeHtml(item.id)}">Удалить</button>
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

function collectLoadedScenarioImagesForLibrary() {
  if (!state.loadedImageRegistry) {
    return {};
  }
  return Object.fromEntries(state.loadedImageRegistry.byPath.entries());
}

function syncLoadedScenarioLibraryId(libraryId) {
  if (state.loadedScenarioMeta) {
    state.loadedScenarioMeta = {
      ...state.loadedScenarioMeta,
      libraryId: libraryId || "",
    };
  }
  if (state.activeCaseRecord) {
    state.activeCaseRecord = {
      ...state.activeCaseRecord,
      libraryId: libraryId || "",
    };
  }
}

function restoreScenarioFromLibraryResponse(data) {
  stopCurrentTts({ nextStatusMessage: state.tts.enabled ? "Озвучка готова" : "Голос выключен", nextStatusTone: state.tts.enabled ? "ok" : "muted" });
  closeImageViewer();
  clearCurrentRuntimeState();
  clearLoadedPackage();
  state.loadedScenario = data.scenario;
  state.loadedImageRegistry = createImageRegistryFromPackage(data.images);
  state.loadedScenarioMeta = {
    sourceLabel: "Сохранённый сценарий из библиотеки",
    sourceType: "library",
    packageType: "library",
    fileName: "",
    sizeBytes: null,
    archiveName: "",
    archiveSizeBytes: null,
    title: data.metadata?.title || getScenarioTitle(data.scenario),
    selectedImageCount: data.metadata?.image_count || Object.keys(data.images || {}).length,
    matchedImageCount: data.metadata?.image_count || Object.keys(data.images || {}).length,
    unmatchedImageCount: 0,
    warnings: [],
    validationErrors: [],
    libraryId: data.metadata?.id || "",
  };
  state.activeCaseRecord = {
    title: state.loadedScenarioMeta.title,
    sourceType: state.loadedScenarioMeta.sourceType,
    sourceLabel: state.loadedScenarioMeta.sourceLabel,
    savedAt: new Date().toISOString(),
    selectedImageCount: state.loadedScenarioMeta.selectedImageCount,
    packageStatus: "loaded",
    gameplayStarted: false,
    libraryId: state.loadedScenarioMeta.libraryId,
  };
  state.activeCaseNotice = "Активное дело сохранено в памяти браузера.";
  state.activeCaseError = "";
  updateLoadedPackageButtons();
  resetGamePanelsToEmptyState();
  renderLoadedPackageStatus("Сохранённый сценарий из библиотеки загружен.");
  renderActiveCaseStatus();
  void queueActiveCasePersistence();
}

async function refreshScenarioLibraryList() {
  state.scenarioLibrary.isLoading = true;
  renderScenarioLibraryStatus();
  renderScenarioLibraryList();
  try {
    const response = await fetch("/api/scenario-library/list", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      throw new Error((data.errors || ["Не удалось получить список сценариев библиотеки."]).join("<br>"));
    }
    state.scenarioLibrary.items = Array.isArray(data.items) ? data.items : [];
    setScenarioLibraryStatus(
      state.scenarioLibrary.items.length
        ? `В библиотеке сохранено сценариев: ${state.scenarioLibrary.items.length}.`
        : "В библиотеке пока нет сохранённых сценариев.",
      "ok"
    );
  } catch (error) {
    state.scenarioLibrary.items = [];
    setScenarioLibraryStatus(error.message || "Не удалось получить список сценариев библиотеки.", "error");
  } finally {
    state.scenarioLibrary.isLoading = false;
    renderScenarioLibraryList();
  }
}

async function saveCurrentScenarioToLibrary() {
  if (!state.loadedScenario) {
    setScenarioLibraryStatus("Нет активного дела для сохранения.", "error");
    return;
  }
  const payload = {
    scenario: state.loadedScenario,
    images: collectLoadedScenarioImagesForLibrary(),
    source_type: state.loadedScenarioMeta?.sourceType || "unknown",
  };
  const replaceId = state.loadedScenarioMeta?.libraryId || state.activeCaseRecord?.libraryId || "";
  if (replaceId) {
    payload.replace_id = replaceId;
  }
  try {
    setScenarioLibraryStatus("Сохраняю сценарий в библиотеку...", "pending");
    const result = await postJson("/api/scenario-library/save", payload);
    syncLoadedScenarioLibraryId(result.saved_id);
    if (state.activeCaseRecord) {
      state.activeCaseRecord = {
        ...state.activeCaseRecord,
        libraryId: result.saved_id,
      };
    }
    state.activeCaseNotice = "Активное дело сохранено в памяти браузера.";
    state.activeCaseError = "";
    renderActiveCaseStatus();
    await refreshScenarioLibraryList();
    await queueActiveCasePersistence();
    setScenarioLibraryStatus(`Сценарий сохранён в библиотеку: ${result.title}.`, "ok");
  } catch (error) {
    setScenarioLibraryStatus(error.message || "Не удалось сохранить сценарий в библиотеку.", "error");
  }
}

async function loadScenarioFromLibrary(libraryId) {
  if (!libraryId) {
    return;
  }
  const shouldConfirm = Boolean(state.loadedScenario || state.activeCaseRecord);
  if (shouldConfirm) {
    const confirmed = window.confirm("Заменить текущее активное дело сохранённым сценарием из библиотеки?");
    if (!confirmed) {
      return;
    }
  }
  try {
    setScenarioLibraryStatus("Загружаю сценарий из библиотеки...", "pending");
    const response = await fetch(`/api/scenario-library/load?id=${encodeURIComponent(libraryId)}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error((data.errors || ["Не удалось загрузить сценарий из библиотеки."]).join("<br>"));
    }
    restoreScenarioFromLibraryResponse(data);
    setScenarioLibraryStatus(`Сценарий "${data.metadata?.title || "Без названия"}" загружен из библиотеки.`, "ok");
  } catch (error) {
    setScenarioLibraryStatus(error.message || "Не удалось загрузить сценарий из библиотеки.", "error");
  }
}

async function exportScenarioFromLibrary(libraryId) {
  if (!libraryId) {
    return;
  }
  const url = `/api/scenario-library/export?id=${encodeURIComponent(libraryId)}`;
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setScenarioLibraryStatus("Экспорт сценария из библиотеки запущен.", "ok");
}

async function deleteScenarioFromLibrary(libraryId) {
  if (!libraryId) {
    return;
  }
  const confirmed = window.confirm("Удалить сохранённый сценарий из библиотеки?");
  if (!confirmed) {
    return;
  }
  try {
    setScenarioLibraryStatus("Удаляю сценарий из библиотеки...", "pending");
    const response = await fetch(`/api/scenario-library/delete?id=${encodeURIComponent(libraryId)}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error((data.errors || ["Не удалось удалить сценарий из библиотеки."]).join("<br>"));
    }
    await refreshScenarioLibraryList();
    setScenarioLibraryStatus("Сценарий удалён из библиотеки.", "ok");
  } catch (error) {
    setScenarioLibraryStatus(error.message || "Не удалось удалить сценарий из библиотеки.", "error");
  }
}

async function importScenarioLibraryZip(file) {
  if (!file) {
    return;
  }
  try {
    setScenarioLibraryStatus("Импортирую сценарий в библиотеку...", "pending");
    const formData = new FormData();
    formData.append("package", file, file.name);
    const response = await fetch("/api/scenario-library/import", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error((data.errors || ["Не удалось импортировать сценарий в библиотеку."]).join("<br>"));
    }
    await refreshScenarioLibraryList();
    setScenarioLibraryStatus(`Сценарий импортирован в библиотеку: ${data.title}.`, "ok");
  } catch (error) {
    setScenarioLibraryStatus(error.message || "Не удалось импортировать сценарий в библиотеку.", "error");
  } finally {
    if (dom.scenarioLibraryImportInput) {
      dom.scenarioLibraryImportInput.value = "";
    }
  }
}

function renderValidation(message, isError = false) {
  dom.validationPanel.className = `status-panel package-details-panel ${isError ? "status-error" : "status-ok"}`;
  if (typeof dom.validationPanel.open === "boolean") {
    dom.validationPanel.open = false;
  }
  dom.validationPanel.innerHTML = `<summary>${escapeHtml(message)}</summary>`;
}

function clearLoadedPackage() {
  stopCurrentTts({ nextStatusMessage: state.tts.enabled ? "Озвучка готова" : "Голос выключен", nextStatusTone: state.tts.enabled ? "ok" : "muted" });
  closeImageViewer();
  if (state.loadedImageRegistry) {
    revokeImageRegistry(state.loadedImageRegistry);
  }
  state.loadedScenario = null;
  state.loadedScenarioMeta = null;
  state.loadedImageRegistry = null;
  updateLoadedPackageButtons();
}

function clearActiveCaseState() {
  state.activeCaseRecord = null;
  state.activeCaseNotice = "";
  state.activeCaseError = "";
  clearLoadedPackage();
  createEmptyGameState();
  resetGamePanelsToEmptyState();
  renderActiveCaseStatus();
  renderValidation("Сценарий пока не загружен.");
}

function clearCurrentRuntimeState() {
  stopCurrentTts({ nextStatusMessage: state.tts.enabled ? "Озвучка готова" : "Голос выключен", nextStatusTone: state.tts.enabled ? "ok" : "muted" });
  createEmptyGameState();
  state.selectedParticipantId = null;
  state.selectedEvidenceId = null;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return "неизвестно";
  }
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  const units = ["КБ", "МБ", "ГБ"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function getScenarioTitle(scenario) {
  return scenario?.metadata?.title || "Без названия";
}

function escapeStatusHtml(value) {
  return String(value || "")
    .split("<br>")
    .map((part) => escapeHtml(part))
    .join("<br>");
}

function isJsonFile(file) {
  return Boolean(file) && (file.type === "application/json" || file.name.toLowerCase().endsWith(".json"));
}

function isZipFile(file) {
  return Boolean(file) && (file.type === "application/zip" || file.type === "application/x-zip-compressed" || file.name.toLowerCase().endsWith(".zip"));
}

function isSupportedImageFile(file) {
  if (!file) {
    return false;
  }
  const name = file.name.toLowerCase();
  return (
    file.type === "image/png" ||
    file.type === "image/jpeg" ||
    file.type === "image/webp" ||
    file.type === "image/svg+xml" ||
    /\.(png|jpe?g|webp|svg)$/.test(name)
  );
}

function basenameFromPath(value) {
  return String(value || "")
    .split(/[\\/]/)
    .pop()
    .toLowerCase();
}

function normalizeLookupPath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/")
    .split("/")
    .filter(Boolean)
    .join("/")
    .toLowerCase();
}

function createEmptyImageRegistry() {
  return {
    byPath: new Map(),
    byBasename: new Map(),
    revokeUrls: [],
  };
}

async function createImageRegistryFromFiles(imageFiles) {
  const registry = createEmptyImageRegistry();
  const imageEntries = await Promise.all(
    imageFiles.map(async (file) => ({
      file,
      dataUrl: await readFileAsDataUrl(file),
    }))
  );
  for (const entry of imageEntries) {
    const url = entry.dataUrl;
    const file = entry.file;
    const pathKey = normalizeLookupPath(file.name);
    const basenameKey = basenameFromPath(file.name);
    registry.byPath.set(pathKey, url);
    if (!registry.byBasename.has(basenameKey)) {
      registry.byBasename.set(basenameKey, url);
    }
  }
  return registry;
}

function createImageRegistryFromPackage(images = {}) {
  const registry = createEmptyImageRegistry();
  const byPathEntries = images.by_path || images.byPath || {};
  const byBasenameEntries = images.by_basename || images.byBasename || {};
  for (const [path, url] of Object.entries(byPathEntries)) {
    registry.byPath.set(normalizeLookupPath(path), url);
  }
  for (const [basename, url] of Object.entries(byBasenameEntries)) {
    registry.byBasename.set(normalizeLookupPath(basename), url);
  }
  return registry;
}

function getVisualAssets() {
  return Array.isArray(state.loadedScenario?.visual_assets)
    ? state.loadedScenario.visual_assets.filter((item) => item && typeof item === "object")
    : [];
}

function getVisualAssetKeywords(asset) {
  return [asset?.id, asset?.role, asset?.placement, asset?.type]
    .filter(Boolean)
    .flatMap((value) => String(value).toLowerCase().split(/[^a-z0-9а-яё]+/u))
    .filter(Boolean);
}

function isCaseCoverAsset(asset) {
  const keywords = getVisualAssetKeywords(asset);
  return (
    keywords.includes("cover") ||
    (keywords.includes("case") && keywords.includes("cover")) ||
    keywords.includes("обложка") ||
    keywords.includes("облож")
  );
}

function isAssetLinkedToParticipant(asset) {
  if (!asset || !Array.isArray(state.scenario?.participants)) {
    return false;
  }
  return state.scenario.participants.some(
    (participant) =>
      participant &&
      typeof participant === "object" &&
      (participant.visual_asset_id === asset.id ||
        participant.image_id === asset.id ||
        (participant.visual_asset_id && normalizeLookupPath(participant.visual_asset_id) === normalizeLookupPath(asset.file || "")) ||
        (participant.image_id && normalizeLookupPath(participant.image_id) === normalizeLookupPath(asset.file || "")))
  );
}

function isParticipantPortraitAsset(asset) {
  if (!asset || isCaseCoverAsset(asset)) {
    return false;
  }
  const keywords = getVisualAssetKeywords(asset);
  const isPortraitMarker =
    keywords.includes("participant") ||
    keywords.includes("portrait") ||
    keywords.includes("participant_portrait") ||
    keywords.includes("participantcard") ||
    keywords.includes("participant_card");
  return (
    isPortraitMarker ||
    asset.participant_id ||
    asset.target_type === "participant" ||
    Boolean(asset.target_id && asset.target_type === "participant") ||
    isAssetLinkedToParticipant(asset)
  );
}

function isCaseIllustrationAsset(asset) {
  if (!asset || isCaseCoverAsset(asset) || isParticipantPortraitAsset(asset)) {
    return false;
  }
  const url = getVisualAssetImageUrl(asset);
  if (!url) {
    return false;
  }
  const keywords = getVisualAssetKeywords(asset);
  const hasCaseIllustrationMarker = keywords.some((keyword) =>
    [
      "scene",
      "evidence",
      "object",
      "location",
      "case_scene",
      "crime_scene",
      "dispute_object",
      "clue_visual",
      "deduction_visual",
      "illustration",
      "case_illustration",
      "visual",
    ].includes(keyword)
  );
  return hasCaseIllustrationMarker || (!asset.target_type && !asset.participant_id);
}

function getCaseIllustrationLabel(asset) {
  const keywords = getVisualAssetKeywords(asset);
  if (keywords.includes("evidence")) {
    return "Доказательство";
  }
  if (keywords.includes("location")) {
    return "Место";
  }
  if (keywords.includes("object") || keywords.includes("dispute_object")) {
    return "Объект";
  }
  if (
    keywords.includes("scene") ||
    keywords.includes("case_scene") ||
    keywords.includes("crime_scene")
  ) {
    return "Сцена";
  }
  if (keywords.includes("clue_visual") || keywords.includes("deduction_visual")) {
    return "Иллюстрация дела";
  }
  return "Иллюстрация дела";
}

function getVisualAssetImageUrl(asset) {
  const registry = state.loadedImageRegistry;
  if (!registry || !asset || !asset.file) {
    return null;
  }
  const pathKey = normalizeLookupPath(asset.file);
  const basenameKey = basenameFromPath(asset.file);
  return registry.byPath.get(pathKey) || registry.byBasename.get(basenameKey) || null;
}

function getFirstRegistryImageSource() {
  const registry = state.loadedImageRegistry;
  if (!registry) {
    return null;
  }
  for (const [path, url] of registry.byPath.entries()) {
    if (url) {
      return {
        url,
        label: basenameFromPath(path) || path,
      };
    }
  }
  for (const [basename, url] of registry.byBasename.entries()) {
    if (url) {
      return {
        url,
        label: basename,
      };
    }
  }
  return null;
}

function getCaseCoverSource() {
  const title =
    state.loadedScenarioMeta?.title ||
    state.loadedScenario?.metadata?.title ||
    state.activeCaseRecord?.title ||
    "Обложка дела";
  const assets = getVisualAssets();
  const explicitCoverAssets = assets.filter(isCaseCoverAsset);
  const explicitCoverAsset = explicitCoverAssets.find((asset) => Boolean(getVisualAssetImageUrl(asset)));
  if (explicitCoverAsset) {
    return {
      kind: "asset",
      assetId: explicitCoverAsset.id,
      url: getVisualAssetImageUrl(explicitCoverAsset),
      title,
      alt: explicitCoverAsset.alt || explicitCoverAsset.title || title,
      label: "Обложка дела",
      fallback: false,
    };
  }

  const fallbackAsset = assets.find((asset) => Boolean(getVisualAssetImageUrl(asset)));
  if (fallbackAsset) {
    return {
      kind: "asset",
      assetId: fallbackAsset.id,
      url: getVisualAssetImageUrl(fallbackAsset),
      title,
      alt: fallbackAsset.alt || fallbackAsset.title || title,
      label: "Обложка не задана",
      fallback: true,
    };
  }

  const fallbackImage = getFirstRegistryImageSource();
  if (fallbackImage) {
    return {
      kind: "direct",
      url: fallbackImage.url,
      title,
      alt: title,
      label: "Обложка не задана",
      fallback: true,
    };
  }

  return {
    kind: "empty",
    title,
    label: "Обложка не задана",
    message: state.loadedScenario ? "Обложка не задана." : "Загрузите дело, чтобы увидеть обложку.",
  };
}

function getVisualAssetForParticipant(participant) {
  const assets = getVisualAssets();
  const candidates = [];
  if (participant.visual_asset_id || participant.image_id) {
    candidates.push(
      ...assets.filter(
        (asset) => asset.id === participant.visual_asset_id || asset.id === participant.image_id
      )
    );
  }
  candidates.push(
    ...assets.filter(
      (asset) => asset.target_type === "participant" && asset.target_id === participant.id
    )
  );
  candidates.push(
    ...assets.filter(
      (asset) =>
        asset.placement === "participant_card" &&
        asset.target_type === "participant" &&
        asset.target_id === participant.id
    )
  );
  const match = candidates.find((asset) => !isCaseCoverAsset(asset)) || null;
  return match;
}

function getVisualAssetsForDisplay() {
  return getVisualAssets().filter(isCaseIllustrationAsset);
}

function clampScale(value) {
  return Math.min(IMAGE_VIEWER_MAX_SCALE, Math.max(IMAGE_VIEWER_MIN_SCALE, value));
}

function getVisualAssetById(assetId) {
  return getVisualAssets().find((asset) => asset.id === assetId) || null;
}

function updateBodyScrollLock() {
  document.body.classList.toggle("modal-open", state.imageViewer.open);
}

function updateImageViewerDragStateClass() {
  const isDragging = Boolean(state.imageViewer.drag.active);
  document.body.classList.toggle("image-viewer-dragging", isDragging);
  if (dom.imageViewerViewport) {
    dom.imageViewerViewport.classList.toggle("is-dragging", isDragging);
  }
}

function stopImageViewerDrag() {
  const drag = state.imageViewer.drag;
  const viewport = dom.imageViewerViewport;
  if (viewport && drag.active && drag.pointerId !== null && drag.pointerId !== "mouse" && typeof viewport.releasePointerCapture === "function") {
    try {
      if (viewport.hasPointerCapture?.(drag.pointerId)) {
        viewport.releasePointerCapture(drag.pointerId);
      }
    } catch {
      // Ignore release errors when the pointer capture is already gone.
    }
  }
  drag.active = false;
  drag.pointerId = null;
  drag.startX = 0;
  drag.startY = 0;
  drag.startScrollLeft = 0;
  drag.startScrollTop = 0;
  updateImageViewerDragStateClass();
}

function clearImageViewerBaseMeasurement() {
  const { baseMeasurementFrame } = state.imageViewer;
  if (baseMeasurementFrame !== null) {
    window.cancelAnimationFrame(baseMeasurementFrame);
    state.imageViewer.baseMeasurementFrame = null;
  }
}

function getImageViewerInputId(event) {
  if (Number.isFinite(event.pointerId)) {
    return event.pointerId;
  }
  return "mouse";
}

function isImageViewerScrollable() {
  const viewport = dom.imageViewerViewport;
  if (!viewport) {
    return false;
  }
  return (
    state.imageViewer.scale > 1 ||
    viewport.scrollWidth > viewport.clientWidth ||
    viewport.scrollHeight > viewport.clientHeight
  );
}

function beginImageViewerDrag(event) {
  const viewport = dom.imageViewerViewport;
  if (!viewport || !state.imageViewer.open || !state.imageViewer.url) {
    return;
  }
  if (state.imageViewer.drag.active) {
    return;
  }
  if (event.button !== 0 || event.pointerType === "mouse" && event.buttons !== 1) {
    return;
  }
  if (!isImageViewerScrollable()) {
    return;
  }
  event.preventDefault();
  state.imageViewer.drag.active = true;
  state.imageViewer.drag.pointerId = getImageViewerInputId(event);
  state.imageViewer.drag.startX = event.clientX;
  state.imageViewer.drag.startY = event.clientY;
  state.imageViewer.drag.startScrollLeft = viewport.scrollLeft;
  state.imageViewer.drag.startScrollTop = viewport.scrollTop;
  if (state.imageViewer.drag.pointerId !== "mouse" && typeof viewport.setPointerCapture === "function") {
    try {
      viewport.setPointerCapture(event.pointerId);
    } catch {
      // Ignore capture failures and fall back to pointer events on the viewport.
    }
  }
  updateImageViewerDragStateClass();
}

function measureImageViewerBaseSize() {
  if (!dom.imageViewerImage || !dom.imageViewerViewport || !state.imageViewer.open) {
    return false;
  }

  const naturalWidth = dom.imageViewerImage.naturalWidth;
  const naturalHeight = dom.imageViewerImage.naturalHeight;
  if (!naturalWidth || !naturalHeight) {
    return false;
  }

  const viewportStyle = window.getComputedStyle(dom.imageViewerViewport);
  const paddingX = (Number.parseFloat(viewportStyle.paddingLeft) || 0) + (Number.parseFloat(viewportStyle.paddingRight) || 0);
  const paddingY = (Number.parseFloat(viewportStyle.paddingTop) || 0) + (Number.parseFloat(viewportStyle.paddingBottom) || 0);
  const availableWidth = Math.max(1, dom.imageViewerViewport.clientWidth - paddingX);
  const availableHeight = Math.max(1, dom.imageViewerViewport.clientHeight - paddingY);
  const fitScale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight, 1);

  state.imageViewer.fitWidth = Math.max(1, Math.round(naturalWidth * fitScale));
  state.imageViewer.fitHeight = Math.max(1, Math.round(naturalHeight * fitScale));
  return true;
}

function scheduleImageViewerBaseMeasurement() {
  clearImageViewerBaseMeasurement();
  state.imageViewer.baseMeasurementFrame = window.requestAnimationFrame(() => {
    state.imageViewer.baseMeasurementFrame = null;
    if (!measureImageViewerBaseSize()) {
      return;
    }
    updateImageViewerImageSize();
  });
}

function updateImageViewerDrag(event) {
  const viewport = dom.imageViewerViewport;
  const drag = state.imageViewer.drag;
  if (!viewport || !drag.active || drag.pointerId !== getImageViewerInputId(event)) {
    return;
  }
  event.preventDefault();
  const deltaX = event.clientX - drag.startX;
  const deltaY = event.clientY - drag.startY;
  viewport.scrollLeft = drag.startScrollLeft - deltaX;
  viewport.scrollTop = drag.startScrollTop - deltaY;
}

function endImageViewerDrag(event) {
  const drag = state.imageViewer.drag;
  if (!drag.active) {
    return;
  }
  if (event && drag.pointerId !== null && drag.pointerId !== getImageViewerInputId(event)) {
    return;
  }
  stopImageViewerDrag();
}

function renderImageViewer() {
  if (!dom.imageViewerModal) {
    return;
  }
  if (!state.imageViewer.open || !state.imageViewer.url) {
    dom.imageViewerModal.hidden = true;
    dom.imageViewerModal.setAttribute("aria-hidden", "true");
    updateBodyScrollLock();
    return;
  }

  dom.imageViewerModal.hidden = false;
  dom.imageViewerModal.setAttribute("aria-hidden", "false");
  dom.imageViewerTitle.textContent = state.imageViewer.title || "Изображение";
  dom.imageViewerAlt.textContent = state.imageViewer.alt || "Изображение можно увеличить и внимательно рассмотреть.";
  dom.imageViewerImage.src = state.imageViewer.url;
  dom.imageViewerImage.alt = state.imageViewer.alt || state.imageViewer.title || "Иллюстрация";
  dom.imageViewerScale.textContent = `${Math.round(state.imageViewer.scale * 100)}%`;
  updateBodyScrollLock();
  updateImageViewerDragStateClass();
  if (!state.imageViewer.fitWidth || !state.imageViewer.fitHeight) {
    scheduleImageViewerBaseMeasurement();
  } else {
    updateImageViewerImageSize();
  }
}

function updateImageViewerImageSize() {
  if (!dom.imageViewerViewport || !dom.imageViewerImage || !state.imageViewer.open) {
    return;
  }
  const baseWidth = state.imageViewer.fitWidth || 0;
  const baseHeight = state.imageViewer.fitHeight || 0;
  if (!baseWidth || !baseHeight) {
    return;
  }
  const displayScale = clampScale(state.imageViewer.scale);
  const width = Math.max(1, Math.round(baseWidth * displayScale));
  const height = Math.max(1, Math.round(baseHeight * displayScale));

  dom.imageViewerImage.style.transform = "none";
  dom.imageViewerImage.style.maxWidth = "none";
  dom.imageViewerImage.style.maxHeight = "none";
  dom.imageViewerImage.style.width = `${width}px`;
  dom.imageViewerImage.style.height = `${height}px`;
  if (displayScale > 1) {
    dom.imageViewerViewport.scrollLeft = Math.max(0, dom.imageViewerViewport.scrollLeft);
    dom.imageViewerViewport.scrollTop = Math.max(0, dom.imageViewerViewport.scrollTop);
  }
}

function closeImageViewer() {
  stopImageViewerDrag();
  clearImageViewerBaseMeasurement();
  state.imageViewer.open = false;
  state.imageViewer.assetId = null;
  state.imageViewer.title = "";
  state.imageViewer.alt = "";
  state.imageViewer.url = "";
  state.imageViewer.scale = 1;
  state.imageViewer.fitWidth = 0;
  state.imageViewer.fitHeight = 0;
  if (dom.imageViewerImage) {
    dom.imageViewerImage.removeAttribute("src");
    dom.imageViewerImage.alt = "";
    dom.imageViewerImage.style.transform = "none";
    dom.imageViewerImage.style.width = "";
    dom.imageViewerImage.style.height = "";
    dom.imageViewerImage.style.maxWidth = "";
    dom.imageViewerImage.style.maxHeight = "";
  }
  if (dom.imageViewerViewport) {
    dom.imageViewerViewport.scrollLeft = 0;
    dom.imageViewerViewport.scrollTop = 0;
  }
  renderImageViewer();
}

function openImageViewerFromSource(source) {
  if (!source || !source.url) {
    return;
  }
  stopImageViewerDrag();
  clearImageViewerBaseMeasurement();
  state.imageViewer.open = true;
  state.imageViewer.assetId = source.assetId || null;
  state.imageViewer.title = source.title || source.alt || "Иллюстрация";
  state.imageViewer.alt = source.alt || source.title || "Иллюстрация";
  state.imageViewer.url = source.url;
  state.imageViewer.scale = 1;
  state.imageViewer.fitWidth = 0;
  state.imageViewer.fitHeight = 0;
  renderImageViewer();
  window.requestAnimationFrame(() => {
    if (dom.imageViewerViewport) {
      dom.imageViewerViewport.scrollLeft = 0;
      dom.imageViewerViewport.scrollTop = 0;
    }
    updateImageViewerImageSize();
  });
  window.requestAnimationFrame(() => {
    if (dom.imageViewerCloseBtn) {
      dom.imageViewerCloseBtn.focus({ preventScroll: true });
    }
  });
}

function openImageViewer(assetId) {
  const asset = getVisualAssetById(assetId);
  const url = asset ? getVisualAssetImageUrl(asset) : null;
  if (!asset || !url) {
    return;
  }
  openImageViewerFromSource({
    assetId: asset.id,
    title: asset.title || asset.alt || "Иллюстрация",
    alt: asset.alt || asset.title || "Иллюстрация",
    url,
  });
}

function renderCaseCoverMarkup(source) {
  if (!source || !source.url) {
    return `
      <div class="case-cover-frame case-cover-placeholder">
        <div class="case-cover-placeholder-inner">
          <p class="case-cover-placeholder-title">${escapeHtml(source?.title || "Обложка дела")}</p>
          <p>${escapeHtml(source?.message || "Обложка не задана.")}</p>
        </div>
      </div>
    `;
  }

  const openAttrs = source.assetId
    ? `data-case-cover-open data-case-cover-asset-id="${escapeHtml(source.assetId)}"`
    : `data-case-cover-open data-case-cover-url="${escapeHtml(source.url)}"`;

  return `
    <button
      type="button"
      class="case-cover-trigger"
      ${openAttrs}
      aria-label="${escapeHtml(`Открыть крупно: ${source.title || source.alt || "Обложка дела"}`)}"
    >
      <div class="case-cover-frame">
        <img src="${escapeHtml(source.url)}" alt="${escapeHtml(source.alt || source.title || "Обложка дела")}" />
      </div>
      <span class="case-cover-open-label">Открыть обложку крупно</span>
    </button>
  `;
}

function setImageViewerScale(nextScale) {
  if (!state.imageViewer.open) {
    return;
  }
  state.imageViewer.scale = clampScale(nextScale);
  renderImageViewer();
}

function renderLoadedPackageStatus(statusText, isError = false) {
  const source = state.loadedScenarioMeta;
  if (!source) {
    renderValidation(statusText || "Сценарий пока не загружен.", isError);
    return;
  }

  const parts = [
    `<p><strong>Источник:</strong> ${escapeHtml(source.sourceLabel)}</p>`,
    source.sourceType
      ? `<p><strong>Тип источника:</strong> ${escapeHtml(getSourceTypeLabel(source.sourceType))}</p>`
      : "",
    source.packageType === "zip" && source.archiveName
      ? `<p><strong>ZIP-архив:</strong> ${escapeHtml(source.archiveName)}</p>`
      : source.fileName
        ? `<p><strong>JSON-файл:</strong> ${escapeHtml(source.fileName)}</p>`
        : "",
    source.packageType === "zip" && Number.isFinite(source.archiveSizeBytes)
      ? `<p><strong>Размер архива:</strong> ${escapeHtml(formatBytes(source.archiveSizeBytes))}</p>`
      : Number.isFinite(source.sizeBytes)
        ? `<p><strong>Размер:</strong> ${escapeHtml(formatBytes(source.sizeBytes))}</p>`
        : "",
    `<p><strong>Изображений найдено:</strong> ${escapeHtml(String(source.selectedImageCount || 0))}</p>`,
    `<p><strong>Совпадений с visual_assets:</strong> ${escapeHtml(String(source.matchedImageCount || 0))}</p>`,
    source.unmatchedImageCount > 0
      ? `<p><strong>Неиспользовано:</strong> ${escapeHtml(String(source.unmatchedImageCount))}</p>`
      : "",
    `<p><strong>Сценарий:</strong> ${escapeHtml(source.title || "Без названия")}</p>`,
    Array.isArray(source.warnings) && source.warnings.length
      ? `
        <div class="status-warnings">
          <p><strong>Предупреждения:</strong></p>
          <ul>
            ${source.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}
          </ul>
        </div>
      `
      : "",
    Array.isArray(source.validationErrors) && source.validationErrors.length
      ? `
        <div class="status-warnings">
          <p><strong>Ошибки проверки:</strong></p>
          <ul>
            ${source.validationErrors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}
          </ul>
        </div>
      `
      : "",
    statusText ? `<p><strong>Статус:</strong> ${escapeStatusHtml(statusText)}</p>` : "",
  ].filter(Boolean);

  dom.validationPanel.className = `status-panel package-details-panel ${isError ? "status-error" : "status-ok"}`;
  if (typeof dom.validationPanel.open === "boolean") {
    dom.validationPanel.open = false;
  }
  dom.validationPanel.innerHTML = `
    <summary>${escapeHtml(statusText || "Техническая информация о пакете")}</summary>
    <div class="package-details-body">
      ${parts.join("")}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
    reader.readAsText(file);
  });
}

function getVisualAssetMatchCount(scenario, registry) {
  const assets = Array.isArray(scenario?.visual_assets) ? scenario.visual_assets : [];
  if (!registry) {
    return 0;
  }
  return assets.filter((asset) => {
    if (!asset || !asset.file) {
      return false;
    }
    const pathKey = normalizeLookupPath(asset.file);
    const basenameKey = basenameFromPath(asset.file);
    return registry.byPath.has(pathKey) || registry.byBasename.has(basenameKey);
  }).length;
}

async function loadCasePackageFromZip(zipFile, sourceLabel, operationToken) {
  const formData = new FormData();
  formData.append("package", zipFile, zipFile.name);
  const response = await fetch("/api/import-case-package", {
    method: "POST",
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error((data.errors || ["Запрос не выполнен"]).join("<br>"));
  }

  const validation = data.validation || { ok: data.ok, errors: data.errors || [] };
  const packageSummary = data.package_summary || {};
  const warnings = Array.isArray(data.warnings) ? data.warnings : [];

  if (!validation.ok) {
    renderValidation("ZIP-пакет не прошёл проверку сценария.", true);
    return;
  }

  if (operationToken !== undefined && !isActiveCaseAsyncOperationCurrent(operationToken)) {
    return;
  }

  clearLoadedPackage();
  clearCurrentRuntimeState();
  state.loadedScenario = data.scenario;
  state.loadedImageRegistry = createImageRegistryFromPackage(data.images);
  state.loadedScenarioMeta = {
    sourceLabel,
    sourceType: "zip",
    packageType: "zip",
    archiveName: packageSummary.archive_name || zipFile.name,
    archiveSizeBytes: packageSummary.archive_size_bytes || zipFile.size,
    title: packageSummary.scenario_title || getScenarioTitle(data.scenario),
    selectedImageCount: packageSummary.image_count || 0,
    matchedImageCount: packageSummary.matched_image_count || 0,
    unmatchedImageCount: packageSummary.unmatched_image_count || 0,
    warnings,
  };
  state.activeCaseRecord = {
    title: state.loadedScenarioMeta.title,
    sourceType: state.loadedScenarioMeta.sourceType,
    sourceLabel: state.loadedScenarioMeta.sourceLabel,
    savedAt: new Date().toISOString(),
    selectedImageCount: state.loadedScenarioMeta.selectedImageCount,
    packageStatus: "loaded",
    gameplayStarted: false,
  };
  state.activeCaseNotice = "Активное дело сохранено в памяти браузера.";
  state.activeCaseError = "";
  updateLoadedPackageButtons();
  resetGamePanelsToEmptyState();
  renderLoadedPackageStatus("ZIP-пакет дела прочитан и проверен.");
  renderActiveCaseStatus();
  void queueActiveCasePersistence();
}

async function loadCasePackageFromFiles(files, sourceLabel, operationToken) {
  const fileList = Array.from(files || []);
  const zipFiles = fileList.filter(isZipFile);
  const jsonFiles = fileList.filter(isJsonFile);
  const imageFiles = fileList.filter(isSupportedImageFile);
  const unsupportedFiles = fileList.filter((file) => !isZipFile(file) && !isJsonFile(file) && !isSupportedImageFile(file));

  if (zipFiles.length) {
    if (zipFiles.length > 1 || jsonFiles.length || imageFiles.length || unsupportedFiles.length) {
      throw new Error("Выберите либо один ZIP-архив, либо JSON-сценарий с изображениями, но не оба варианта одновременно.");
    }
    await loadCasePackageFromZip(zipFiles[0], "ZIP-пакет дела", operationToken);
    return;
  }

  if (!jsonFiles.length) {
    throw new Error("Выберите один JSON-файл сценария.");
  }
  if (jsonFiles.length > 1) {
    throw new Error("Нужно выбрать только один JSON-файл сценария.");
  }
  if (unsupportedFiles.length) {
    throw new Error(`Найдены неподдерживаемые файлы: ${unsupportedFiles.map((file) => file.name).join(", ")}`);
  }

  const scenarioFile = jsonFiles[0];
  let imageRegistry = createEmptyImageRegistry();

  try {
    const raw = await readFileAsText(scenarioFile);
    if (!raw.trim()) {
      throw new Error("JSON-файл сценария пуст.");
    }

    let scenario;
    try {
      scenario = JSON.parse(raw);
    } catch (error) {
      throw new Error("Не удалось разобрать JSON сценария.");
    }

    const validation = await postJson("/api/validate-scenario", scenario);
    if (!validation.ok) {
      throw new Error(validation.errors?.join("<br>") || "JSON-файл не прошёл проверку сценария.");
    }

    if (operationToken !== undefined && !isActiveCaseAsyncOperationCurrent(operationToken)) {
      return;
    }

    imageRegistry = await createImageRegistryFromFiles(imageFiles);
    const matchedImageCount = getVisualAssetMatchCount(scenario, imageRegistry);
    clearLoadedPackage();
    clearCurrentRuntimeState();
    state.loadedScenario = scenario;
    state.loadedImageRegistry = imageRegistry;
    state.loadedScenarioMeta = {
      sourceLabel,
      sourceType: "json_files",
      packageType: "json_files",
      fileName: scenarioFile.name,
      sizeBytes: scenarioFile.size,
      title: getScenarioTitle(scenario),
      selectedImageCount: imageFiles.length,
      matchedImageCount,
      unmatchedImageCount: Math.max(0, imageFiles.length - matchedImageCount),
      warnings: [],
    };
    state.activeCaseRecord = {
      title: state.loadedScenarioMeta.title,
      sourceType: state.loadedScenarioMeta.sourceType,
      sourceLabel: state.loadedScenarioMeta.sourceLabel,
      savedAt: new Date().toISOString(),
      selectedImageCount: state.loadedScenarioMeta.selectedImageCount,
      packageStatus: "loaded",
      gameplayStarted: false,
    };
    state.activeCaseNotice = "Активное дело сохранено в памяти браузера.";
    state.activeCaseError = "";
    updateLoadedPackageButtons();
    resetGamePanelsToEmptyState();
    renderLoadedPackageStatus("Пакет дела прочитан и проверен.");
    renderActiveCaseStatus();
    void queueActiveCasePersistence();
  } catch (error) {
    revokeImageRegistry(imageRegistry);
    throw error;
  }
}

function revokeImageRegistry(registry) {
  if (!registry || !Array.isArray(registry.revokeUrls)) {
    return;
  }
  for (const url of registry.revokeUrls) {
    URL.revokeObjectURL(url);
  }
}

function renderAssetMedia(asset, className = "visual-asset-media", fallbackText = "Иллюстрация будет здесь") {
  const url = getVisualAssetImageUrl(asset);
  if (url) {
    return `
      <button
        type="button"
        class="image-view-trigger"
        data-visual-asset-id="${escapeHtml(asset.id)}"
        aria-label="${escapeHtml(`Открыть крупно: ${asset.title || asset.alt || "Иллюстрация"}`)}"
      >
        <div class="${className}">
          <img src="${escapeHtml(url)}" alt="${escapeHtml(asset.alt || asset.title || "Иллюстрация")}" />
        </div>
        <span class="image-view-trigger-label">Открыть крупно</span>
      </button>
    `;
  }

  return `
    <div class="${className}">
      <div class="visual-asset-placeholder">${escapeHtml(asset?.title || asset?.alt || fallbackText)}</div>
    </div>
  `;
}

function renderParticipantPortrait(participant) {
  const asset = getVisualAssetForParticipant(participant);
  if (asset) {
    return renderAssetMedia(asset, "participant-card-portrait", "Портрет будет здесь");
  }
  return `
    <div class="participant-card-portrait">
      <div class="participant-card-portrait-placeholder">Портрет будет здесь</div>
    </div>
  `;
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
    ${renderTtsActionRow(`
      <button type="button" class="tts-action-button" data-tts-case-intro>Прослушать описание дела</button>
    `)}
  `;
}

function renderVisualAssets() {
  const assets = getVisualAssetsForDisplay();
  if (!assets.length) {
    dom.visualAssetsPanel.className = "visual-assets-grid empty-state";
    dom.visualAssetsPanel.textContent = "Иллюстрации дела не заданы.";
    return;
  }

  dom.visualAssetsPanel.className = "visual-assets-grid";
  dom.visualAssetsPanel.innerHTML = assets
    .map((asset) => {
      const title = escapeHtml(asset.title || asset.alt || "Иллюстрация дела");
      const placementLabel = getCaseIllustrationLabel(asset);
      return `
        <article class="visual-asset-card">
          ${renderAssetMedia(asset)}
          <div>
            <p class="participant-detail-label">${escapeHtml(placementLabel)}</p>
            <h3>${title}</h3>
          </div>
        </article>
      `;
    })
    .join("");
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
              <div class="tts-action-row dialogue-history-audio">
                <button type="button" class="tts-action-button dialogue-audio-button" data-tts-dialogue-action-id="${escapeHtml(
                  item.actionId
                )}">
                  Прослушать реплику
                </button>
                <button type="button" class="tts-action-button dialogue-audio-button tts-pause-button" data-tts-pause>
                  Пауза
                </button>
              </div>
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
          ${renderParticipantPortrait(participant)}
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
    ${renderTtsActionRow(`
      <button type="button" class="tts-action-button" data-tts-evidence-id="${escapeHtml(selectedEvidence.id)}">
        Прослушать описание доказательства
      </button>
    `)}
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
          ${
            chosen
              ? `
                ${renderTtsActionRow(`
                  <button type="button" class="tts-action-button" data-tts-verdict-id="${escapeHtml(verdict.id)}">
                    Прослушать вердикт
                  </button>
                `)}
              `
              : ""
          }
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
    ${renderTtsActionRow(`
      <button type="button" class="tts-action-button" data-tts-final-explanation>Прослушать объяснение</button>
    `)}
  `;
}

function renderAll() {
  if (!state.scenario || !state.engine) {
    return;
  }
  renderCaseIntro();
  renderVisualAssets();
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
  resetCurrentScenarioState();
  if (state.activeCaseRecord) {
    state.activeCaseRecord = {
      ...state.activeCaseRecord,
      packageStatus: state.engine.finished ? "finished" : "started",
      gameplayStarted: true,
      savedAt: new Date().toISOString(),
    };
  }
  state.activeCaseNotice = "Активное дело сохранено в памяти браузера.";
  state.activeCaseError = "";
  updateLoadedPackageButtons();
  renderLoadedPackageStatus("Сценарий запущен. Кликайте по участникам, доказательствам и вердиктам, чтобы протестировать граф.");
  renderAll();
  renderActiveCaseStatus();
  void queueActiveCasePersistence();
  void playCaseIntroNarration({ manual: false });
}

async function restartScenarioFromLoadedPackage() {
  if (!state.loadedScenario) {
    return;
  }
  const confirmed = window.confirm(
    "Начать это дело заново? Текущий прогресс прохождения будет сброшен, но загруженные файлы останутся."
  );
  if (!confirmed) {
    return;
  }
  stopCurrentTts({ nextStatusMessage: state.tts.enabled ? "Озвучка готова" : "Голос выключен", nextStatusTone: state.tts.enabled ? "ok" : "muted" });
  const operationToken = beginActiveCaseAsyncOperation();
  try {
    const data = await postJson("/api/start-scenario", state.loadedScenario);
    if (!isActiveCaseAsyncOperationCurrent(operationToken)) {
      return;
    }
    startScenarioFromResponse(data);
    renderLoadedPackageStatus("Сценарий запущен заново. Прогресс прохождения сброшен.");
  } catch (error) {
    if (!isActiveCaseAsyncOperationCurrent(operationToken)) {
      return;
    }
    if (state.loadedScenarioMeta) {
      renderLoadedPackageStatus(`Не удалось запустить сценарий заново: ${error.message}`, true);
    } else {
      renderValidation(`Не удалось запустить сценарий заново: ${error.message}`, true);
    }
  }
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
  if (state.activeCaseRecord) {
    state.activeCaseRecord = {
      ...state.activeCaseRecord,
      packageStatus: state.engine.finished ? "finished" : "started",
      gameplayStarted: true,
      savedAt: new Date().toISOString(),
    };
  }
  void queueActiveCasePersistence();
  void playDialogueNarration(action.id, { manual: false });
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
  if (state.activeCaseRecord) {
    state.activeCaseRecord = {
      ...state.activeCaseRecord,
      packageStatus: state.engine.finished ? "finished" : "started",
      gameplayStarted: true,
      savedAt: new Date().toISOString(),
    };
  }
  void queueActiveCasePersistence();
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
  if (state.activeCaseRecord) {
    state.activeCaseRecord = {
      ...state.activeCaseRecord,
      packageStatus: "finished",
      gameplayStarted: true,
      savedAt: new Date().toISOString(),
    };
  }
  void queueActiveCasePersistence();
  void playVerdictNarration(verdict.id, { manual: false });
}

dom.loadDemoBtn.addEventListener("click", async () => {
  const operationToken = beginActiveCaseAsyncOperation();
  try {
    const response = await fetch("/api/demo-scenario");
    const data = await response.json();
    const validation = await postJson("/api/validate-scenario", data);
    if (!validation.ok) {
      throw new Error(validation.errors?.join("<br>") || "Демо-сценарий не прошёл проверку.");
    }
    if (!isActiveCaseAsyncOperationCurrent(operationToken)) {
      return;
    }
    clearLoadedPackage();
    clearCurrentRuntimeState();
    state.loadedScenario = data;
    state.loadedImageRegistry = createEmptyImageRegistry();
    state.loadedScenarioMeta = {
      sourceLabel: "Встроенный демо-пакет",
      sourceType: "demo",
      packageType: "demo",
      fileName: "demo_case.json",
      sizeBytes: new Blob([JSON.stringify(data)]).size,
      title: getScenarioTitle(data),
      selectedImageCount: 0,
      matchedImageCount: 0,
      unmatchedImageCount: 0,
      warnings: [],
    };
    state.activeCaseRecord = {
      title: state.loadedScenarioMeta.title,
      sourceType: state.loadedScenarioMeta.sourceType,
      sourceLabel: state.loadedScenarioMeta.sourceLabel,
      savedAt: new Date().toISOString(),
      selectedImageCount: 0,
      packageStatus: "loaded",
      gameplayStarted: false,
    };
    state.activeCaseNotice = "Активное дело сохранено в памяти браузера.";
    state.activeCaseError = "";
    updateLoadedPackageButtons();
    resetGamePanelsToEmptyState();
    dom.casePackageInput.value = "";
    renderLoadedPackageStatus("Демо-пакет проверен и готов к запуску.");
    renderActiveCaseStatus();
    void queueActiveCasePersistence();
  } catch (error) {
    if (!isActiveCaseAsyncOperationCurrent(operationToken)) {
      return;
    }
    renderValidation(`Не удалось загрузить демо-сценарий: ${error.message}`, true);
  }
});

dom.casePackageInput.addEventListener("change", async () => {
  const operationToken = beginActiveCaseAsyncOperation();
  try {
    if (!dom.casePackageInput.files || !dom.casePackageInput.files.length) {
      throw new Error("Пакет дела не выбран.");
    }
    await loadCasePackageFromFiles(dom.casePackageInput.files, "Пакет дела", operationToken);
  } catch (error) {
    if (!isActiveCaseAsyncOperationCurrent(operationToken)) {
      return;
    }
    renderValidation(`Ошибка загрузки пакета дела: ${error.message}`, true);
  }
});

dom.startScenarioBtn.addEventListener("click", async () => {
  const operationToken = beginActiveCaseAsyncOperation();
  try {
    if (!state.loadedScenario) {
      throw new Error("Сначала загрузите JSON-файл сценария или демо-сценарий.");
    }
    if (state.engine) {
      renderLoadedPackageStatus("Сценарий уже запущен и сохранён в памяти браузера.");
      return;
    }
    const data = await postJson("/api/start-scenario", state.loadedScenario);
    if (!isActiveCaseAsyncOperationCurrent(operationToken)) {
      return;
    }
    startScenarioFromResponse(data);
  } catch (error) {
    if (!isActiveCaseAsyncOperationCurrent(operationToken)) {
      return;
    }
    if (state.loadedScenarioMeta) {
      renderLoadedPackageStatus(error.message, true);
    } else {
      renderValidation(error.message, true);
    }
  }
});

if (dom.saveScenarioLibraryBtn) {
  dom.saveScenarioLibraryBtn.addEventListener("click", () => {
    void saveCurrentScenarioToLibrary();
  });
}

if (dom.refreshScenarioLibraryBtn) {
  dom.refreshScenarioLibraryBtn.addEventListener("click", () => {
    void refreshScenarioLibraryList();
  });
}

if (dom.importScenarioLibraryBtn && dom.scenarioLibraryImportInput) {
  dom.importScenarioLibraryBtn.addEventListener("click", () => {
    dom.scenarioLibraryImportInput.click();
  });
}

if (dom.scenarioLibraryImportInput) {
  dom.scenarioLibraryImportInput.addEventListener("change", () => {
    const file = dom.scenarioLibraryImportInput.files?.[0] || null;
    if (!file) {
      return;
    }
    void importScenarioLibraryZip(file);
  });
}

if (dom.scenarioLibraryList) {
  dom.scenarioLibraryList.addEventListener("click", (event) => {
    const targetElement = event.target instanceof Element ? event.target : null;
    const actionButton = targetElement?.closest("[data-library-action]");
    if (!actionButton) {
      return;
    }
    const action = actionButton.getAttribute("data-library-action");
    const libraryId = actionButton.getAttribute("data-library-id");
    if (!action || !libraryId) {
      return;
    }
    if (action === "load") {
      void loadScenarioFromLibrary(libraryId);
    } else if (action === "export") {
      void exportScenarioFromLibrary(libraryId);
    } else if (action === "delete") {
      void deleteScenarioFromLibrary(libraryId);
    }
  });
}

if (dom.voiceToggleBtn) {
  dom.voiceToggleBtn.addEventListener("click", toggleVoiceSetting);
}

if (dom.stopVoiceBtn) {
  dom.stopVoiceBtn.addEventListener("click", () => {
    stopCurrentTts({
      nextStatusMessage: state.tts.enabled ? "Озвучка готова" : "Голос выключен",
      nextStatusTone: state.tts.enabled ? "ok" : "muted",
    });
  });
}

if (dom.voiceVolumeSlider) {
  dom.voiceVolumeSlider.addEventListener("input", (event) => {
    updateVoiceVolume(event.target.value);
  });
}

if (dom.restartScenarioBtn) {
  dom.restartScenarioBtn.addEventListener("click", restartScenarioFromLoadedPackage);
}

if (dom.deleteActiveCaseBtn) {
  dom.deleteActiveCaseBtn.addEventListener("click", async () => {
    if (!state.loadedScenario && !state.activeCaseRecord && !state.activeCaseError) {
      return;
    }
    const confirmed = window.confirm("Удалить активное дело из памяти браузера и очистить текущий сценарий?");
    if (!confirmed) {
      return;
    }
    beginActiveCaseAsyncOperation();
    if (dom.casePackageInput) {
      dom.casePackageInput.disabled = true;
    }
    if (dom.loadDemoBtn) {
      dom.loadDemoBtn.disabled = true;
    }
    dom.startScenarioBtn.disabled = true;
    dom.deleteActiveCaseBtn.disabled = true;

    try {
      await persistQueue.catch(() => {});
      await deleteActiveCaseSnapshot();
      clearActiveCaseState();
      state.activeCaseNotice = "Активное дело удалено из памяти браузера.";
      state.activeCaseError = "";
      if (dom.casePackageInput) {
        dom.casePackageInput.value = "";
      }
      renderValidation("Активное дело удалено. Теперь можно загрузить новый пакет.");
    } catch (error) {
      state.activeCaseError = `Не удалось удалить активное дело: ${error.message}`;
    } finally {
      if (dom.casePackageInput) {
        dom.casePackageInput.disabled = false;
      }
      if (dom.loadDemoBtn) {
        dom.loadDemoBtn.disabled = false;
      }
      updateLoadedPackageButtons();
      renderActiveCaseStatus();
    }
  });
}

if (dom.imageViewerModal) {
  dom.imageViewerModal.addEventListener("click", (event) => {
    if (event.target === dom.imageViewerModal || event.target.matches("[data-image-viewer-close]")) {
      closeImageViewer();
    }
  });
}

if (dom.imageViewerCloseBtn) {
  dom.imageViewerCloseBtn.addEventListener("click", closeImageViewer);
}

if (dom.imageViewerImage) {
  dom.imageViewerImage.addEventListener("load", scheduleImageViewerBaseMeasurement);
}

if (dom.imageViewerZoomInBtn) {
  dom.imageViewerZoomInBtn.addEventListener("click", () => setImageViewerScale(state.imageViewer.scale + IMAGE_VIEWER_STEP));
}

if (dom.imageViewerZoomOutBtn) {
  dom.imageViewerZoomOutBtn.addEventListener("click", () => setImageViewerScale(state.imageViewer.scale - IMAGE_VIEWER_STEP));
}

if (dom.imageViewerResetBtn) {
  dom.imageViewerResetBtn.addEventListener("click", () => setImageViewerScale(1));
}

if (dom.imageViewerViewport) {
  dom.imageViewerViewport.addEventListener(
    "wheel",
    (event) => {
      if (!state.imageViewer.open) {
        return;
      }
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      setImageViewerScale(state.imageViewer.scale + direction * IMAGE_VIEWER_STEP);
    },
    { passive: false }
  );
  window.addEventListener("resize", () => {
    if (state.imageViewer.open) {
      scheduleImageViewerBaseMeasurement();
    }
  });
  dom.imageViewerViewport.addEventListener("pointerdown", beginImageViewerDrag);
  dom.imageViewerViewport.addEventListener("pointermove", updateImageViewerDrag);
  dom.imageViewerViewport.addEventListener("pointerup", endImageViewerDrag);
  dom.imageViewerViewport.addEventListener("pointercancel", endImageViewerDrag);
  dom.imageViewerViewport.addEventListener("lostpointercapture", endImageViewerDrag);
  dom.imageViewerViewport.addEventListener("mousedown", beginImageViewerDrag);
  dom.imageViewerViewport.addEventListener("mousemove", updateImageViewerDrag);
  dom.imageViewerViewport.addEventListener("mouseup", endImageViewerDrag);
  dom.imageViewerViewport.addEventListener("mouseleave", endImageViewerDrag);
}

document.addEventListener("keydown", (event) => {
  if (!state.imageViewer.open) {
    return;
  }
  if (event.key === "Escape") {
    closeImageViewer();
  }
});

document.addEventListener("click", (event) => {
  const targetElement = event.target instanceof Element ? event.target : null;
  const caseCoverTrigger = targetElement?.closest("[data-case-cover-open]");
  if (caseCoverTrigger && state.loadedScenario) {
    const assetId = caseCoverTrigger.getAttribute("data-case-cover-asset-id");
    const coverUrl = caseCoverTrigger.getAttribute("data-case-cover-url");
    if (assetId) {
      openImageViewer(assetId);
    } else if (coverUrl) {
      openImageViewerFromSource({
        title: state.loadedScenarioMeta?.title || "Обложка дела",
        alt: state.loadedScenarioMeta?.title || "Обложка дела",
        url: coverUrl,
      });
    }
  }

  const visualAssetTrigger = targetElement?.closest("[data-visual-asset-id]");
  if (visualAssetTrigger && state.loadedScenario) {
    openImageViewer(visualAssetTrigger.getAttribute("data-visual-asset-id"));
  }

  if (targetElement?.closest("[data-tts-pause]")) {
    void toggleCurrentTtsPause();
    return;
  }

  if (targetElement?.closest("[data-tts-case-intro]") && state.scenario && state.engine) {
    void playCaseIntroNarration({ manual: true });
  }

  const ttsDialogueActionId = targetElement?.getAttribute("data-tts-dialogue-action-id");
  if (ttsDialogueActionId && state.scenario && state.engine) {
    void playDialogueNarration(ttsDialogueActionId, { manual: true });
  }

  const ttsVerdictId = targetElement?.getAttribute("data-tts-verdict-id");
  if (ttsVerdictId && state.scenario && state.engine?.finished) {
    void playVerdictNarration(ttsVerdictId, { manual: true });
  }

  if (targetElement?.closest("[data-tts-final-explanation]") && state.scenario && state.engine?.finished) {
    void playFinalExplanationNarration({ manual: true });
  }

  const ttsEvidenceId = targetElement?.getAttribute("data-tts-evidence-id");
  if (ttsEvidenceId && state.scenario && state.engine) {
    void playEvidenceNarration(ttsEvidenceId, { manual: true });
  }

  const participantId = targetElement?.getAttribute("data-participant-id");
  if (participantId) {
    state.selectedParticipantId = participantId;
    renderAll();
    void queueActiveCasePersistence();
  }

  const evidenceId = targetElement?.getAttribute("data-evidence-id");
  if (evidenceId && state.engine) {
    handleEvidenceClick(evidenceId);
  }

  const actionId = targetElement?.getAttribute("data-action-id");
  if (actionId && state.engine) {
    handleDialogueClick(actionId);
  }

  const verdictId = targetElement?.getAttribute("data-verdict-id");
  if (verdictId && state.engine) {
    handleVerdictClick(verdictId);
  }
});

async function bootstrapActiveCaseRestore() {
  try {
    const snapshot = await readActiveCaseSnapshot();
    if (snapshot) {
      restoreSnapshotIntoState(snapshot);
      return;
    }
    renderActiveCaseStatus();
    updateLoadedPackageButtons();
  } catch (error) {
    state.activeCaseError = `Не удалось восстановить активное дело из памяти браузера: ${error.message}`;
    state.activeCaseNotice = "";
    state.activeCaseRecord = null;
    renderActiveCaseStatus();
  }
}

renderActiveCaseStatus();
updateLoadedPackageButtons();
renderTtsControls();
renderScenarioLibraryStatus();
renderScenarioLibraryList();
void bootstrapActiveCaseRestore();
void refreshScenarioLibraryList();
