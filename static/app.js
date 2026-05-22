const state = {
  scenario: null,
  engine: null,
  loadedScenario: null,
  loadedScenarioMeta: null,
  loadedImageRegistry: null,
  selectedParticipantId: null,
  selectedEvidenceId: null,
  dialogueHistoryByParticipant: new Map(),
  imageViewer: {
    open: false,
    assetId: null,
    title: "",
    alt: "",
    url: "",
    scale: 1,
  },
};

const dom = {
  casePackageInput: document.querySelector("#case-package-input"),
  loadDemoBtn: document.querySelector("#load-demo-btn"),
  startScenarioBtn: document.querySelector("#start-scenario-btn"),
  validationPanel: document.querySelector("#validation-panel"),
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

const IMAGE_VIEWER_MIN_SCALE = 0.5;
const IMAGE_VIEWER_MAX_SCALE = 4;
const IMAGE_VIEWER_STEP = 0.2;

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
  dom.validationPanel.innerHTML = escapeStatusHtml(message);
}

function clearLoadedPackage() {
  closeImageViewer();
  if (state.loadedImageRegistry && Array.isArray(state.loadedImageRegistry.revokeUrls)) {
    for (const url of state.loadedImageRegistry.revokeUrls) {
      URL.revokeObjectURL(url);
    }
  }
  state.loadedScenario = null;
  state.loadedScenarioMeta = null;
  state.loadedImageRegistry = null;
  dom.startScenarioBtn.disabled = true;
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

function createImageRegistry(imageFiles) {
  const registry = createEmptyImageRegistry();
  for (const file of imageFiles) {
    const url = URL.createObjectURL(file);
    const pathKey = normalizeLookupPath(file.name);
    const basenameKey = basenameFromPath(file.name);
    registry.revokeUrls.push(url);
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

function getVisualAssetImageUrl(asset) {
  const registry = state.loadedImageRegistry;
  if (!registry || !asset || !asset.file) {
    return null;
  }
  const pathKey = normalizeLookupPath(asset.file);
  const basenameKey = basenameFromPath(asset.file);
  return registry.byPath.get(pathKey) || registry.byBasename.get(basenameKey) || null;
}

function getVisualAssetForParticipant(participant) {
  const assets = getVisualAssets();
  const byVisualAssetId =
    participant.visual_asset_id || participant.image_id
      ? assets.find((asset) => asset.id === participant.visual_asset_id || asset.id === participant.image_id)
      : null;
  const byTarget = assets.find(
    (asset) => asset.target_type === "participant" && asset.target_id === participant.id
  );
  const byPlacement = assets.find(
    (asset) =>
      asset.placement === "participant_card" &&
      asset.target_type === "participant" &&
      asset.target_id === participant.id
  );
  return byTarget || byPlacement || byVisualAssetId || null;
}

function getVisualAssetsForDisplay() {
  return getVisualAssets().filter((asset) =>
    ["participant_portrait", "scene", "object", "cover"].includes(asset.type)
  );
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
  dom.imageViewerImage.style.transform = `scale(${state.imageViewer.scale})`;
  dom.imageViewerScale.textContent = `${Math.round(state.imageViewer.scale * 100)}%`;
  updateBodyScrollLock();
}

function closeImageViewer() {
  state.imageViewer.open = false;
  state.imageViewer.assetId = null;
  state.imageViewer.title = "";
  state.imageViewer.alt = "";
  state.imageViewer.url = "";
  state.imageViewer.scale = 1;
  if (dom.imageViewerImage) {
    dom.imageViewerImage.removeAttribute("src");
    dom.imageViewerImage.alt = "";
    dom.imageViewerImage.style.transform = "scale(1)";
  }
  renderImageViewer();
}

function openImageViewer(assetId) {
  const asset = getVisualAssetById(assetId);
  const url = asset ? getVisualAssetImageUrl(asset) : null;
  if (!asset || !url) {
    return;
  }
  state.imageViewer.open = true;
  state.imageViewer.assetId = asset.id;
  state.imageViewer.title = asset.title || asset.alt || "Иллюстрация";
  state.imageViewer.alt = asset.alt || asset.title || "Иллюстрация";
  state.imageViewer.url = url;
  state.imageViewer.scale = 1;
  renderImageViewer();
  window.requestAnimationFrame(() => {
    if (dom.imageViewerCloseBtn) {
      dom.imageViewerCloseBtn.focus({ preventScroll: true });
    }
  });
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
    dom.validationPanel.className = `status-panel ${isError ? "status-error" : "status-ok"}`;
    dom.validationPanel.textContent = statusText || "Сценарий пока не загружен.";
    return;
  }

  const parts = [
    `<p><strong>Источник:</strong> ${escapeHtml(source.sourceLabel)}</p>`,
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

  dom.validationPanel.className = `status-panel ${isError ? "status-error" : "status-ok"}`;
  dom.validationPanel.innerHTML = parts.join("");
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

async function loadCasePackageFromZip(zipFile, sourceLabel) {
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
    state.loadedScenarioMeta = {
      sourceLabel,
      packageType: "zip",
      archiveName: packageSummary.archive_name || zipFile.name,
      archiveSizeBytes: packageSummary.archive_size_bytes || zipFile.size,
      title: packageSummary.scenario_title || "Без названия",
      selectedImageCount: packageSummary.image_count || 0,
      matchedImageCount: packageSummary.matched_image_count || 0,
      unmatchedImageCount: packageSummary.unmatched_image_count || 0,
      warnings,
      validationErrors: validation.errors || [],
    };
    state.loadedScenario = null;
    state.loadedImageRegistry = createEmptyImageRegistry();
    dom.startScenarioBtn.disabled = true;
    renderLoadedPackageStatus("ZIP-пакет не прошёл проверку сценария.", true);
    return;
  }

  if (state.loadedImageRegistry) {
    closeImageViewer();
    revokeImageRegistry(state.loadedImageRegistry);
  }
  state.loadedScenario = data.scenario;
  state.loadedImageRegistry = createImageRegistryFromPackage(data.images);
  state.loadedScenarioMeta = {
    sourceLabel,
    packageType: "zip",
    archiveName: packageSummary.archive_name || zipFile.name,
    archiveSizeBytes: packageSummary.archive_size_bytes || zipFile.size,
    title: packageSummary.scenario_title || getScenarioTitle(data.scenario),
    selectedImageCount: packageSummary.image_count || 0,
    matchedImageCount: packageSummary.matched_image_count || 0,
    unmatchedImageCount: packageSummary.unmatched_image_count || 0,
    warnings,
  };
  dom.startScenarioBtn.disabled = false;
  renderLoadedPackageStatus("ZIP-пакет дела прочитан и проверен.");
}

async function loadCasePackageFromFiles(files, sourceLabel) {
  clearLoadedPackage();
  const fileList = Array.from(files || []);
  const zipFiles = fileList.filter(isZipFile);
  const jsonFiles = fileList.filter(isJsonFile);
  const imageFiles = fileList.filter(isSupportedImageFile);
  const unsupportedFiles = fileList.filter(
    (file) => !isZipFile(file) && !isJsonFile(file) && !isSupportedImageFile(file)
  );

  if (zipFiles.length) {
    if (zipFiles.length > 1 || jsonFiles.length || imageFiles.length || unsupportedFiles.length) {
      throw new Error("Выберите либо один ZIP-архив, либо JSON-сценарий с изображениями, но не оба варианта одновременно.");
    }
    await loadCasePackageFromZip(zipFiles[0], "ZIP-пакет дела");
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
  const imageRegistry = createImageRegistry(imageFiles);

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

    if (state.loadedImageRegistry) {
      closeImageViewer();
      revokeImageRegistry(state.loadedImageRegistry);
    }
    state.loadedScenario = scenario;
    state.loadedImageRegistry = imageRegistry;
    const matchedImageCount = getVisualAssetMatchCount(scenario, imageRegistry);
    state.loadedScenarioMeta = {
      sourceLabel,
      packageType: "files",
      fileName: scenarioFile.name,
      sizeBytes: scenarioFile.size,
      title: getScenarioTitle(scenario),
      selectedImageCount: imageFiles.length,
      matchedImageCount,
      unmatchedImageCount: Math.max(0, imageFiles.length - matchedImageCount),
      warnings: [],
    };
    dom.startScenarioBtn.disabled = false;
    renderLoadedPackageStatus("Пакет дела прочитан и проверен.");
  } catch (error) {
    revokeImageRegistry(imageRegistry);
    renderValidation(`Ошибка загрузки пакета дела: ${error.message}`, true);
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
  `;
}

function renderVisualAssets() {
  const assets = getVisualAssetsForDisplay().filter((asset) => ["scene", "object", "cover"].includes(asset.type));
  if (!assets.length) {
    dom.visualAssetsPanel.className = "visual-assets-grid empty-state";
    dom.visualAssetsPanel.textContent = "Иллюстрации дела появятся после загрузки пакета дела.";
    return;
  }

  dom.visualAssetsPanel.className = "visual-assets-grid";
  dom.visualAssetsPanel.innerHTML = assets
    .map((asset) => {
      const title = escapeHtml(asset.title || asset.alt || "Иллюстрация дела");
      const placementLabel =
        asset.type === "scene"
          ? "Сцена"
          : asset.type === "object"
            ? "Объект"
            : "Обложка дела";
      return `
        <article class="visual-asset-card">
          ${renderAssetMedia(asset)}
          <div>
            <p class="participant-detail-label">${placementLabel}</p>
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
  state.selectedParticipantId = null;
  state.selectedEvidenceId = null;
  state.dialogueHistoryByParticipant = new Map();
  renderLoadedPackageStatus("Сценарий запущен. Кликайте по участникам, доказательствам и вердиктам, чтобы протестировать граф.");
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
    const validation = await postJson("/api/validate-scenario", data);
    if (!validation.ok) {
      throw new Error(validation.errors?.join("<br>") || "Демо-сценарий не прошёл проверку.");
    }
    clearLoadedPackage();
    state.loadedScenario = data;
    state.loadedImageRegistry = createEmptyImageRegistry();
    state.loadedScenarioMeta = {
      sourceLabel: "Встроенный демо-пакет",
      packageType: "demo",
      fileName: "demo_case.json",
      sizeBytes: new Blob([JSON.stringify(data)]).size,
      title: getScenarioTitle(data),
      selectedImageCount: 0,
      matchedImageCount: 0,
      unmatchedImageCount: 0,
      warnings: [],
    };
    dom.startScenarioBtn.disabled = false;
    dom.casePackageInput.value = "";
    renderLoadedPackageStatus("Демо-пакет проверен и готов к запуску.");
  } catch (error) {
    renderValidation(`Не удалось загрузить демо-сценарий: ${error.message}`, true);
    clearLoadedPackage();
  }
});

dom.casePackageInput.addEventListener("change", async () => {
  try {
    if (!dom.casePackageInput.files || !dom.casePackageInput.files.length) {
      throw new Error("Пакет дела не выбран.");
    }
    await loadCasePackageFromFiles(dom.casePackageInput.files, "Пакет дела");
  } catch (error) {
    renderValidation(`Ошибка загрузки пакета дела: ${error.message}`, true);
  }
});

dom.startScenarioBtn.addEventListener("click", async () => {
  try {
    if (!state.loadedScenario) {
      throw new Error("Сначала загрузите JSON-файл сценария или демо-сценарий.");
    }
    const data = await postJson("/api/start-scenario", state.loadedScenario);
    startScenarioFromResponse(data);
  } catch (error) {
    if (state.loadedScenarioMeta) {
      renderLoadedPackageStatus(error.message, true);
    } else {
      renderValidation(error.message, true);
    }
  }
});

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
  const visualAssetTrigger = targetElement?.closest("[data-visual-asset-id]");
  if (visualAssetTrigger && state.loadedScenario) {
    openImageViewer(visualAssetTrigger.getAttribute("data-visual-asset-id"));
  }

  const participantId = targetElement?.getAttribute("data-participant-id");
  if (participantId) {
    state.selectedParticipantId = participantId;
    renderAll();
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
