// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   ELEMENT HANDLERS — User actions on environmental elements
   Acoes do usuario sobre elementos ambientais (pocos, plumas, etc.)

   Cada "elemento" representa um objeto real no terreno:
   um poco de monitoramento, uma pluma de contaminacao, um lago, etc.
   Estes handlers conectam os botoes da interface com a logica de dados.
   ================================================================ */
import {
    addElement,
    addNewElement,
    removeElement,
    removeElementsByFamily,
    toggleElementVisibility,
    setSelectedElement,
    getSelectedElement,
    getElementById,
    updateElement,
    generateRandomModel,
    getAllElements,
    getMeshByElementId,
    rebuildElementMesh,
    clearAllElements,
    countByFamily,
    isEffectivelyVisible,
} from '../../core/elements/manager.js';
import { openFamilySelectModal } from '../ui/familySelectModal.js';
import { updateMesh } from '../../core/elements/meshFactory.js';
import {
    applyBoundaryOverlayUrls,
    rehydrateBoundaryOverlayTextures as rehydrateBoundaryOverlays,
} from '../../core/elements/boundaryOverlayRuntime.js';
import { highlightMesh, clearHighlight } from '../scene/picker.js';
import { setSelectedVolume, clearAllVolumes } from '../../core/voxel/manager.js';
import {
    clearAllLayers,
    getAllLayers as getAllInterpolationLayers,
    setSelectedLayer,
    updateLayer,
} from '../../core/interpolation/manager.js';
import { initEdges, clearEdges } from '../edges/manager.js';
import { clearCampaigns } from '../../core/campaigns/manager.js';
import { addScene, getAllScenes, clearScenes, captureViewStart } from '../scenes/manager.js';
import { generateRandomReport, clearReport } from '../report/manager.js';
import { clearPresets as clearFilterPresets } from '../report/filterPresets.js';
import { clearTicker, generateRandomTicker } from '../ticker/manager.js';
import { clearAllLibraries, installLibrary, isLibraryActive } from '../libraries/manager.js';
import { BUILTIN_EXAMPLES } from '../libraries/marketplace.js';
import { clearGroups, generateRandomGroups } from '../groups/manager.js';
import { clearCalculator, generateRandomCalculator } from '../../core/calculator/manager.js';
import { generateRandomConstants, clearDemoConstants } from '../../core/constants/manager.js';
import { clearModelData, safeSetItem } from '../storage/storageMonitor.js';
import { idbDelete } from '../storage/idbStore.js';
import { clearIssues } from '../../core/issues/manager.js';
import { clearAllLabels } from '../labels/manager.js';
import { clearHistory } from '../history/manager.js';
import { getEnabledFamilies, getAllFamilies } from '../../core/elements/families.js';
import { showToast } from '../ui/toast.js';
import { purposeMicroFeedback } from '../../core/purpose/actionImpact.js';
import { t } from '../i18n/translations.js';
import { updateElementsList, updateElementDetails, highlightSelectedElement } from '../ui/lists.js';
import { updateStampPanel } from '../ui/stampPanel.js';
import { updateEdgePanel } from '../ui/edgeEditor.js';
import { updateConstellation, invalidateConstellationCache } from '../scene/constellation.js';
import { loadElementContext } from './llmChat.js';
import { canEdit, canEditElement, canDo, isAccessControlActive } from '../auth/permissions.js';
import {
    isEditing,
    exitEditMode,
    getEditingElementId,
    getEditMode,
    enterGizmoMode,
    exitGizmoMode,
} from '../editing/editManager.js';
import { getCameraState, setCameraState, setIsometricView, zoomToElement, zoomToFamily } from '../scene/controls.js';
import { showLoading, hideLoading, setLoadingProgress } from '../ui/loadingOverlay.js';
import * as contractManager from '../governance/contractManager.js';
import { addWbsItem, clearWbs } from '../governance/wbsManager.js';
import * as projectManager from '../governance/projectManager.js';
import { clearCostCenters } from '../governance/costCenterManager.js';
import { savePipeline, getPipeline } from '../../core/pipelines/index.js';
import { createLogger } from '../helpers/logger.js';
import { deepClone } from '../helpers/deepClone.js';
import { lazyImport } from '../helpers/lazyImport.js';
import { yieldToMain } from '../performance/yielding.js';
import { runRandomOrchestratorV2 } from '../../core/random/orchestrator.js';
import { runtimeRandom, realNow } from '../../core/random/runtime.js';
import {
    injectDerivationShowcase as _injectDerivationShowcase,
    injectGEEShowcase as _injectGEEShowcase,
    generateRandomCostCenters as _generateRandomCostCenters,
} from './elementsDemoSeeders.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
const log = createLogger('Elements');
const _contractManager = contractManager;
const addContract = _contractManager.addContract;
const clearContracts = _contractManager.clearContracts;
const _projectManager = projectManager;
const addProject = _projectManager.addProject;
const addResource = _projectManager.addResource;
const addAllocation = _projectManager.addAllocation;
const clearProjects = _projectManager.clearProjects;
/** @typedef {Record<string, any>} any */
/** @param {unknown} err @returns {string} */
function _errorMessage(err: any) {
    return err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
}
/** @param {string} id @returns {any} */
function _el(id: any): any {
    return document.getElementById(id);
}
/** @param {string} selectors @returns {any} */
function _qs(selectors: any) {
    return document.querySelector(selectors);
}
/** @param {string} selectors @returns {any} */
function _qsa(selectors: any) {
    return document.querySelectorAll(selectors);
}
// UI refresh sera injetada pelo main.js para evitar dependencia circular
let _requestUIRefresh: any = null;
/**
 * Set the UI refresh callback.
 * Define a funcao que solicita refresh da interface.
 * Chamada pelo main.js durante a inicializacao.
 *
 * @param {Function} fn - The UI refresh function
 */
export function setUpdateAllUI(fn: any) {
    _requestUIRefresh = fn;
}
function requestElementsUIRefresh(reason = 'elements.changed') {
    if (!_requestUIRefresh) return;
    const domains = [
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.HOME,
        UI_INVALIDATION_DOMAINS.TICKER,
    ];
    for (const domain of domains) _requestUIRefresh(domain, reason);
}
/** @param {unknown} value */
function _escapeSelectorValue(value: any) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(String(value));
    }
    return String(value).replace(/["\\]/g, '\\$&');
}
/** @param {any} element */
function _patchElementCardLiveFields(element: any) {
    if (!element?.id) return;
    const safeId = _escapeSelectorValue(element.id);
    const cards = _qsa(`[data-element-id="${safeId}"]`);
    cards.forEach(
        /** @param {any} field */ (card: any) => {
            const nameEl = card.querySelector('.element-card-name');
            if (nameEl) {
                nameEl.textContent = element.name || element.id;
                nameEl.setAttribute('title', element.name || element.id);
            }
            let descEl = card.querySelector('.element-card-desc');
            const nextDescription = String(element.description || '').trim();
            if (nextDescription) {
                if (!descEl) {
                    descEl = document.createElement('div');
                    descEl.className = 'element-card-desc';
                    const headerEl = card.querySelector('.element-card-header');
                    if (headerEl) headerEl.insertAdjacentElement('afterend', descEl);
                }
                descEl.textContent = nextDescription;
                descEl.setAttribute('title', nextDescription);
            } else if (descEl) {
                descEl.remove();
            }
        },
    );
}
/**
 * @param {any} field
 * @param {string} field
 */
function _patchSelectedElementLiveChrome(element: any, field: any) {
    if (!element?.id || getSelectedElement()?.id !== element.id) return;
    if (field === 'name') {
        const ribbonName = _el('edit-ribbon-element-name');
        if (ribbonName) ribbonName.textContent = element.name || element.id;
    }
    updateStampPanel(element);
    updateEdgePanel(element);
    updateConstellation(element);
}
/** @param {string} field */
function _shouldLivePatchElementField(field: any) {
    return field === 'name' || field === 'label' || field === 'description' || field === 'iconClass';
}
const RANDOM_LAYER_OPACITY_PRESETS = Object.freeze({
    transparent: Object.freeze({
        terrain: 0.36,
        water_table: 0.24,
        potentiometric: 0.32,
        contamination: 0.46,
        geology: 0.34,
        custom: 0.5,
    }),
    solid: Object.freeze({
        terrain: 0.82,
        water_table: 0.58,
        potentiometric: 0.64,
        contamination: 0.74,
        geology: 0.7,
        custom: 0.78,
    }),
});
/** @param {boolean} useTransparentVisuals */
function _applyRandomLayerVisualPreset(useTransparentVisuals: any) {
    const preset = useTransparentVisuals
        ? RANDOM_LAYER_OPACITY_PRESETS.transparent
        : RANDOM_LAYER_OPACITY_PRESETS.solid;
    getAllInterpolationLayers().forEach(
        /** @param {any} familyIdOrParams */ (layer: any) => {
            const opacity = (preset as any)[layer.type];
            if (Number.isFinite(opacity)) updateLayer(layer.id, { opacity });
        },
    );
}
// ----------------------------------------------------------------
// ELEMENT CRUD HANDLERS
// Funcoes para adicionar, remover e editar elementos do modelo.
// ----------------------------------------------------------------
/**
 * Add a new element of a given family to the model.
 * Adiciona um novo elemento ao modelo 3D.
 * Ex: adicionar um poco de monitoramento ou uma pluma de contaminacao.
 *
 * @param {string|any} familyIdOrParams - Element family ID or headless add params
 */
export async function handleAddElement(familyIdOrParams: any) {
    // P2: Headless mode - create element without UI (pipeline automation)
    if (typeof familyIdOrParams === 'object' && familyIdOrParams?._headless) {
        const { familyId, name, x, y } = familyIdOrParams;
        if (!familyId) return { error: 'familyId required' };
        const element = addNewElement(familyId);
        if (element) {
            if (name) element.name = name;
            if (x != null || y != null) {
                element.data = element.data || {};
                element.data.coordinates = element.data.coordinates || {};
                if (x != null) element.data.coordinates.easting = Number(x);
                if (y != null) element.data.coordinates.northing = Number(y);
            }
            return { success: true, elementId: element.id, name: element.name };
        }
        return { error: 'element_creation_failed' };
    }
    // Original UI path
    const familyId = String(typeof familyIdOrParams === 'string' ? familyIdOrParams : familyIdOrParams?.familyId || '');
    if (isAccessControlActive() && !(canEdit as any)()) {
        showToast(t('permissionDenied') || 'Permission denied', 'error');
        return;
    }
    // Guard: when adding a boundary, confirm overwrite only if an existing
    // boundary already has geometry (vertices). Fresh models skip the dialog.
    if (familyId === 'boundary') {
        const existing = getAllElements().find((e: any) => e.family === 'boundary');
        if (existing?.data?.vertices?.length > 0) {
            // REF-SWEEPS RF-2: lazyImport NUNCA rejeita (retorna null) — o import()
            // cru aqui vazava 'Uncaught (in promise)' com o server local morto, pois
            // handleAddElement e chamado fire-and-forget pelos listeners de UI.
            // Guard de CONSENTIMENTO: se o modulo cair, aborta (fail-closed) em vez de
            // sobrescrever/duplicar o boundary existente sem o usuario confirmar.
            const mod = await lazyImport('../ui/boundaryConfirm.js', {
                importer: () => import('../ui/boundaryConfirm.js' as string),
            });
            if (!mod) return;
            const { boundaryOverwriteGuard, BOUNDARY_ACTION } = mod;
            const { action, existingBoundary } = await boundaryOverwriteGuard();
            if (action === BOUNDARY_ACTION.CANCEL) return;
            if (action === BOUNDARY_ACTION.REPLACE && existingBoundary) {
                removeElement(existingBoundary.id);
            }
        }
    }
    const element = addNewElement(familyId);
    if (element) {
        // Auto-assign: vincula ao no selecionado da arvore Org/Op
        if (window.activeAreaNodeId) {
            element.data.areaId = window.activeAreaNodeId;
        }
        showToast(`${t('added')} ${element.name}`, 'success');
        setSelectedElement(element.id);
        invalidateConstellationCache(); // PERF-G2: graph mutated
        requestElementsUIRefresh();
        purposeMicroFeedback('handleAddElement');
    }
}
/**
 * Remove an element from the model.
 * Remove um elemento do modelo e limpa a selecao se necessario.
 *
 * @param {string} elementId - ID of the element to remove
 */
export function handleRemoveElement(elementId: any) {
    if (!canDo('delete')) {
        showToast(t('auth.actionDenied') || "You don't have permission to perform this action.", 'error');
        return;
    }
    if (isAccessControlActive() && !canEditElement(elementId)) {
        showToast(t('permissionDenied') || 'Permission denied', 'error');
        return;
    }
    // Cleanup auto-refresh se sensor ativo
    const elToRemove = getElementById(elementId);
    if (elToRemove?.family === 'sensor' && elToRemove.data?._autoRefreshActive) {
        import('../../core/sensor/autoRefresh.js' as string)
            .then((m: any) => m.stopAutoRefresh(elementId))
            .catch((_e: any) => console.debug('[utils/handlers/elements:silent-catch]', _errorMessage(_e)));
    }
    removeElement(elementId);
    showToast(t('elementRemoved'), 'info');
    if (getSelectedElement()?.id === elementId) {
        setSelectedElement(null);
        clearHighlight();
    }
    invalidateConstellationCache(); // PERF-G2: graph mutated
    requestElementsUIRefresh();
    purposeMicroFeedback('handleRemoveElement');
}
/**
 * Toggle element visibility in the 3D scene.
 * Mostra ou esconde um elemento na visualizacao 3D.
 *
 * @param {string} elementId - ID of the element
 */
export function handleToggleVisibility(elementId: any) {
    toggleElementVisibility(elementId);
    const element = getElementById(elementId);
    const family = element ? getAllFamilies()[element.family] : null;
    // Containers afetam visibilidade de filhos - re-render completo para propagar cascade
    if (family?.isContainer) {
        updateElementsList();
        return;
    }
    // Elemento folha: atualiza apenas o card afetado (troca icone eye/eye-off + opacidade)
    const card = _qs(`[data-element-id="${elementId}"]`);
    if (card && element) {
        card.classList.toggle('opacity-50', !isEffectivelyVisible(elementId));
    } else {
        updateElementsList();
    }
}
/**
 * Select an element for editing.
 * Seleciona um elemento para editar suas propriedades no painel lateral.
 *
 * @param {string} elementId - ID of the element
 */
export function handleSelectElement(elementId: any) {
    // Sai do modo de edição se selecionou outro elemento ou deselecionou
    if (isEditing()) {
        const editingId = getEditingElementId();
        if (!elementId || elementId !== editingId) {
            const wasGizmo = getEditMode() === 'gizmo';
            if (wasGizmo) {
                exitGizmoMode();
            } else {
                exitEditMode();
            }
            // Re-attach gizmo ao novo elemento se estava em gizmo mode
            if (wasGizmo && elementId) {
                // Defer para apos setSelectedElement
                queueMicrotask(() => enterGizmoMode(elementId));
            }
        }
    }
    // Desmonta modulo de familia ativo antes de trocar selecao
    import('../../core/elements/familyModuleRegistry.js' as string)
        .then(({ unmountActiveFamilyModule }: any) => unmountActiveFamilyModule())
        .catch((_e: any) => console.debug('[utils/handlers/elements:silent-catch]', _errorMessage(_e)));
    setSelectedElement(elementId);
    setSelectedLayer(null); // Limpa seleção de layer (mutuamente exclusivo)
    setSelectedVolume(null); // Limpa seleção de volume (mutuamente exclusivo)
    if (elementId) {
        window.dispatchEvent(new CustomEvent('ecbt:elementSelected', { detail: { id: elementId } }));
    }
    // Destacar mesh 3D do elemento selecionado
    if (elementId) {
        const mesh = getMeshByElementId(elementId);
        highlightMesh(mesh);
    } else {
        clearHighlight();
    }
    // Auto-entra em gizmo mode (translate/rotate/scale) para TODOS os elementos.
    // Shape edit (vertices/handles) fica como secondary via botao "Edit Shape" ou tecla G.
    if (elementId && !isEditing()) {
        enterGizmoMode(elementId);
    }
    // Swap .selected class sem reconstruir toda a lista (rapido)
    highlightSelectedElement(elementId);
    updateElementDetails();
    updateStampPanel(getSelectedElement());
    updateEdgePanel(getSelectedElement());
    updateConstellation(getSelectedElement());
    // Contextual chat: carrega contexto do elemento no chat IA
    if (elementId) {
        loadElementContext(elementId);
    }
    // Notifica inspetor para destacar elemento selecionado
    window.dispatchEvent(new CustomEvent('selectionChanged'));
    if (elementId) window.dispatchEvent(new CustomEvent('elementSelected', { detail: { id: elementId } }));
}
/**
 * Update a single field of an element.
 * Atualiza um campo especifico de um elemento (nome, posicao, etc.)
 *
 * @param {string} elementId - ID of the element
 * @param {string} field - Field name to update
 * @param {*} value - New value
 */
export function handleElementFieldChange(elementId: any, field: any, value: any) {
    const before = getElementById(elementId);
    updateElement(elementId, { [field]: value });
    const after = getElementById(elementId);
    // Keep remediation mesh synchronized when data changes via generic field API.
    // This path is used by API automation and bypasses inspector-specific rebuild hooks.
    if (field === 'data' && after?.family === 'remediation') {
        const prevType = before?.data?.systemType;
        const nextType = after?.data?.systemType;
        const prevStatus = before?.data?.systemStatus;
        const nextStatus = after?.data?.systemStatus;
        if (prevType !== nextType || prevStatus !== nextStatus) {
            rebuildElementMesh(elementId);
        }
    }
    if (_shouldLivePatchElementField(field)) {
        _patchElementCardLiveFields(after);
        _patchSelectedElementLiveChrome(after, field);
        return;
    }
    updateElementsList();
    updateElementDetails();
}
// ----------------------------------------------------------------
// RANDOM MODEL GENERATION
// Gera um modelo de demonstracao com dados aleatorios.
// Util para testar o sistema ou fazer apresentacoes.
// ----------------------------------------------------------------
/**
 * Generate a random environmental model for demonstration.
 * Cria um modelo aleatorio com pocos, plumas, campanhas e cenas.
 * Preenche tambem os metadados do projeto (nome, autor, etc.)
 */
export function handleGenerateRandomModel() {
    // Abre modal para selecionar familias antes de gerar
    openFamilySelectModal('random', (selectedFamilies: any, options: any) => {
        _executeRandomModel(selectedFamilies, options);
    });
}
/**
 * Generate random model directly (no modal interaction).
 * Usado por automacoes/E2E e tours programaticos.
 */
/** @param {any} [options] */
export async function handleGenerateRandomModelDirect(options: any = {}) {
    const selectedFamilies = _resolveSelectedFamiliesForRandom(options);
    await _executeRandomModel(selectedFamilies, options);
}
/** @param {any} [options] */
function _resolveSelectedFamiliesForRandom(options: any = {}) {
    const explicit =
        options?.selectedFamilies ||
        options?.familyIds ||
        options?.families ||
        options?.randomRecipe?.selectedFamilies ||
        null;
    if (explicit instanceof Set) {
        const normalized = [...explicit].map(String).filter(Boolean);
        if (normalized.length) return new Set(normalized);
    }
    if (Array.isArray(explicit)) {
        const normalized = explicit.map(String).filter(Boolean);
        if (normalized.length) return new Set(normalized);
    }
    const families = getEnabledFamilies();
    return new Set((families || []).map((f: any) => f.id).filter(Boolean));
}
/**
 * Execute random model generation with selected families.
 * Logica interna extraida para permitir chamada via modal.
 * @param {Set<string>} selectedFamilies - Familias a incluir
 * @param {any} [options={}] - Opcoes de geracao (quantidades, cenario)
 */
async function _executeRandomModel(selectedFamilies: any, options: any = {}) {
    // ── FASE BLOQUEANTE: Loading overlay com progress bar ──
    showLoading(t('generatingModel') || 'Generating model...');
    try {
        // Limpa sessão salva e dados do modelo anterior (start fresh explícito).
        setLoadingProgress(5, t('clearingModel') || 'Clearing previous model...');
        idbDelete('ecbyts-session').catch((_e: any) =>
            console.debug('[utils/handlers/elements:silent-catch]', _errorMessage(_e)),
        );
        // Para todos os auto-refresh de sensores antes de limpar
        import('../../core/sensor/autoRefresh.js' as string)
            .then((m: any) => m.stopAllAutoRefresh())
            .catch((_e: any) => console.debug('[utils/handlers/elements:silent-catch]', _errorMessage(_e)));
        await clearModelData();
        // Limpa dados anteriores (clearCampaigns reseta counter para IDs coincidirem)
        clearCampaigns();
        // BUG-FIX (paridade de cenas pós-clear): iterar getAllScenes() — que retorna
        // o array VIVO — chamando removeScene() (splice no mesmo array) pulava 1 em
        // cada 2 elementos (mutação-durante-iteração) → 2 cenas vazavam, e o
        // regenerar somava 5 → 7 cenas (boot tinha 5). clearScenes() zera atômico.
        clearScenes();
        clearTicker();
        clearAllLibraries();
        clearGroups();
        clearCalculator();
        clearDemoConstants();
        clearReport();
        clearFilterPresets();
        clearAllLayers();
        clearAllVolumes();
        clearContracts();
        clearWbs();
        clearProjects();
        clearCostCenters();
        clearIssues();
        clearAllLabels();
        clearHistory();
        setLoadingProgress(15, t('generatingElements') || 'Generating 25 wells, plumes & infrastructure...');
        await yieldToMain({ timeoutMs: 0 });
        // Gera elementos e popula modelo com todos os seeds via funcao unificada
        await runRandomOrchestratorV2({
            source: 'manual-random',
            selectedFamilies,
            options,
            onProgress: (pct: any, msg: any) => setLoadingProgress(pct, msg),
            generateRandomModelFn: generateRandomModel,
            buildFullRandomModelFn: buildFullRandomModel,
        });
        if (options?.applyHighLodDefaults) {
            setLoadingProgress(88, t('applyingCurated3d') || 'Applying curated high-LOD 3D...');
            try {
                const { applyRandomHighLodDefaults } = await import(
                    '../../core/elements/randomHighLodDefaults.js' as string
                );
                const lodResult = await applyRandomHighLodDefaults({ selectedFamilies });
                if (lodResult?.appliedCount) log.info('Applied random high-LOD defaults', lodResult);
            } catch (err: any) {
                log.warn('Random high-LOD defaults skipped', _errorMessage(err));
            }
        }
        setLoadingProgress(100, t('done') || 'Done!');
    } finally {
        hideLoading();
    }
}
/**
 * Populates the full random model with all seeds, layers, and UI state.
 * Unified function called by both boot (main.js) and post-clear (_executeRandomModel).
 *
 * Preenche o modelo random completo: seeds, camadas de interpolacao, governanca,
 * pipelines, issues, sequencer, validacao, SAO, audit, EIS, NN, e UI final.
 *
 * @param {any} randomResult - Result from generateRandomModel()
 * @param {any} [options={}] - Configuration options
 */
/**
 * NN demo plume predictor — registro + mapping + treino.
 * Extraído do step 27 do buildFullRandomModel para rodar em background
 * pós-boot (logs [randomModel] nn-demo:* permitem auditar no console).
 */
async function _trainDemoNNBackground() {
    const startedAt = realNow();
    const { ensureNN, registerNetwork, getNetwork, updateNetworkMapping, resizeNetwork } = await import(
        '../../core/nn/manager.js' as string
    );
    // LOADING-PERF GAP-2: NN é lazy. Garante o registry restaurado do IDB antes de
    // checar/registrar a rede demo (evita corrida com o warm-up pós-shell).
    await ensureNN();
    const { trainNetworkFromModel } = await import('../../core/nn/whatIfEngine.js');
    const nnId = 'demo-plume-predictor';
    if (!getNetwork(nnId)) {
        registerNetwork(nnId, {
            inputSize: 7,
            hiddenLayerSizes: [16, 8],
            outputSize: 6,
            mode: 'regression',
        });
    }
    const PR = (await import('../../core/elements/randomModel.js' as string)).PARAMETER_RANGES;
    /** @param {string} id */
    const mkInput = (id: any) => ({ variableId: id, min: PR[id]?.min ?? 0, max: PR[id]?.max ?? 1 });
    const geoRange = {
        plume_radiusX: [1, 50],
        plume_radiusY: [1, 50],
        plume_radiusZ: [1, 30],
        plume_centerX: [-100, 100],
        plume_centerY: [-80, 0],
        plume_centerZ: [-100, 100],
    };
    /** @param {string} id */
    const mkOutput = (id: any) => ({
        variableId: id,
        min: (geoRange as any)[id][0],
        max: (geoRange as any)[id][1],
    });
    updateNetworkMapping(nnId, {
        inputs: ['pH', 'conductivity', 'temperature', 'redox', 'benzene', 'toluene', 'tph'].map(mkInput),
        outputs: Object.keys(geoRange).map(mkOutput),
    });
    resizeNetwork(nnId, 7, 6);
    // quiet: treino em background não pode toastar (anti-flood 2026-06-11)
    trainNetworkFromModel(nnId, { quiet: true });
    console.debug('[randomModel] nn-demo:trained (background)', { durationMs: realNow() - startedAt });
}

export async function buildFullRandomModel(randomResult: any, options: any = {}) {
    const _rawProgress = options.onProgress || (() => {});
    // realNow(): este build roda dentro do runtime determinístico do
    // orchestrator (Date global mockado/congelado) — Date.now() aqui dava
    // durationMs=0 sempre. O wrapper de progress loga o delta real de cada
    // step (o tempo pertence ao step ANTERIOR ao label recém-chegado).
    const buildStartedAt = realNow();
    let _stepStartedAt = buildStartedAt;
    let _stepLabel = 'build:start';
    const progress = (pct: any, msg: any) => {
        const now = realNow();
        console.debug('[randomModel] build:step', { pct, step: _stepLabel, durationMs: now - _stepStartedAt });
        _stepStartedAt = now;
        _stepLabel = msg;
        _rawProgress(pct, msg);
    };
    const { campaigns, edges, financial } = randomResult;
    const randomRunId = options.__randomRunId ?? null;
    const randomSource = options.__randomSource || 'legacy';
    const skipCameraFinalize = options.__skipCameraFinalize === true;
    const useAerialOverlay = options.includeAerialOverlay !== false;
    const useDemoData = options.seedDemoData !== false;
    const useTransparentVisuals = options.transparentVisuals !== false;
    // Anti-flood (Calvin 2026-06-11): o build cria ~8 layers de interpolação
    // em lote — sem quiet, cada uma toastava "Interpolating..."/"complete!".
    // Reset no fim do build; TTL fail-safe 90s cobre crash no meio.
    try {
        const { setInterpolationToastsQuiet } = await import('../../core/interpolation/manager.js' as string);
        setInterpolationToastsQuiet(true);
    } catch (e: any) {
        console.debug('[randomModel] interp-quiet:', e?.message || e);
    }
    console.debug('[randomModel] build:start', {
        runId: randomRunId,
        source: randomSource,
        campaigns: Array.isArray(campaigns) ? campaigns.length : 0,
        edges: Array.isArray(edges) ? edges.length : 0,
    });
    try {
        if (options.__enforceNeutralBackground !== false) {
            const { getActiveSettings, changeSetting } = await import('../vizSettings/manager.js' as string);
            const activeBg = String(getActiveSettings?.()?.background || '')
                .trim()
                .toLowerCase();
            const match = activeBg.match(/^#([0-9a-f]{6})$/i);
            if (match) {
                const hex = match[1] as string;
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                const brightness = (r + g + b) / 3;
                if (brightness < 24) {
                    changeSetting('background', '#2d2d2d');
                    console.debug('[randomModel] background normalized to #2d2d2d from near-black value', {
                        runId: randomRunId,
                        source: randomSource,
                        previous: activeBg,
                    });
                }
            }
        }
    } catch (err: any) {
        log.debug('Background normalization skipped', _errorMessage(err));
    }
    // ── Phase 1: Core data setup ──
    // 1. UTM origin restore + overlay recalc
    progress(15, t('restoringOrigin') || 'Restoring UTM origin...');
    const _oeEl = _el('utm-origin-easting');
    const _onEl = _el('utm-origin-northing');
    const _oElev = _el('utm-origin-elevation');
    const _oZone = _el('utm-zone');
    const _oHemi = _el('utm-hemisphere');
    const _savedE = _oeEl ? parseFloat(_oeEl.value) || 0 : 0;
    const _savedN = _onEl ? parseFloat(_onEl.value) || 0 : 0;
    const _savedElev = _oElev ? parseFloat(_oElev.value) || 0 : 0;
    const _savedZone = _oZone ? parseInt(_oZone.value, 10) || 23 : 23;
    const _savedHemi = _oHemi ? _oHemi.value : 'S';
    if (_savedE !== 0 || _savedN !== 0) {
        try {
            const { setOrigin } = await import('../../core/io/geo/coordinates.js' as string);
            setOrigin({
                easting: _savedE,
                northing: _savedN,
                elevation: _savedElev,
                zone: _savedZone,
                hemisphere: _savedHemi,
            });
            if (_oeEl) _oeEl.value = _savedE.toFixed(2);
            if (_onEl) _onEl.value = _savedN.toFixed(2);
            // Recalcula overlay do boundary com o origin do usuario
            const boundary = getAllElements().find((e: any) => e.family === 'boundary');
            if (
                useAerialOverlay &&
                boundary &&
                boundary.data &&
                boundary.data.vertices &&
                !boundary.data.overlayUrl?.startsWith('data:')
            ) {
                const vs = boundary.data.vertices;
                const xs = vs.map((v: any) => v.x);
                const zs = vs.map((v: any) => v.z);
                const halfW = (Math.max(...xs) - Math.min(...xs)) / 2;
                const halfL = (Math.max(...zs) - Math.min(...zs)) / 2;
                const { buildOverlayUrls } = await import('../../core/io/geo/overlayUrls.js' as string);
                // Usa tile-provider do localStorage para consistencia
                const _sp = localStorage.getItem('ecbyts-tile-provider') || '';
                const _piParsed = _sp != null ? parseInt(_sp, 10) : NaN;
                const _pi = Number.isFinite(_piParsed) && _piParsed >= 0 ? _piParsed : undefined;
                const { overlayUrl } = await buildOverlayUrls(halfW, halfL, _pi);
                await applyBoundaryOverlayUrls(boundary, [overlayUrl], { persistData: true });
            }
        } catch (err: any) {
            log.warn('UTM origin restore failed', _errorMessage(err));
        }
    }
    if (useAerialOverlay) {
        const rehydrated = await rehydrateBoundaryOverlays();
        const appliedCount = rehydrated.filter((entry: any) => entry?.applied).length;
        if (appliedCount > 0) {
            log.debug('[randomModel] boundary overlays rehydrated', {
                runId: randomRunId,
                source: randomSource,
                appliedCount,
            });
        }
    }
    // 2. Edges
    initEdges(edges || []);
    // 3. Project areas
    window.projectAreas = randomResult.areas || [];
    // 4. Model ID
    try {
        const { getModelId } = await import('../../core/io/modelLink.js' as string);
        await getModelId();
    } catch (err: any) {
        log.warn('Model ID generation failed', _errorMessage(err));
    }
    // ── Phase 2: Scenes & metadata ──
    progress(25, t('creatingScenes') || 'Creating scenes...');
    // 5. Create 5 scenes with camera presets
    const createdScenes = [];
    try {
        const { isSceneReady } = await import('../scene/viewRouter.js' as string);
        const { setTopView, setFrontView } = await import('../scene/controls.js' as string);
        const sceneReady = isSceneReady();
        const cameraStateBeforeSceneCapture = sceneReady ? getCameraState() : null;
        const sceneConfigs = [
            { name: 'Linha de Base', view: 'isometric' },
            { name: 'Vista Superior', view: 'top' },
            { name: 'Vista Frontal', view: 'front' },
            { name: 'Evolucao', view: 'isometric' },
            { name: 'Estado Atual', view: 'isometric' },
        ];
        const viewFns: any = { isometric: setIsometricView, top: setTopView, front: setFrontView };
        for (const cfg of sceneConfigs) {
            if (sceneReady) viewFns[cfg.view]?.();
            const s = addScene({ name: cfg.name });
            if (sceneReady && s.id) captureViewStart(s.id);
            createdScenes.push(s);
        }
        if (cameraStateBeforeSceneCapture) {
            setCameraState(cameraStateBeforeSceneCapture);
        }
    } catch (err: any) {
        log.warn('Scene creation with presets failed, falling back to basic scenes', _errorMessage(err));
        // Fallback: cria cenas basicas sem presets de camera
        const sceneNames = ['Linha de Base', 'Vista Superior', 'Vista Frontal', 'Evolucao', 'Estado Atual'];
        for (const name of sceneNames) {
            const s = addScene({ name });
            if (s.id) captureViewStart(s.id);
            createdScenes.push(s);
        }
    }
    // 6. Project metadata
    const randomCode = () => String(Math.floor(runtimeRandom('project-meta') * 100)).padStart(2, '0');
    const projectName = `Projeto Random ${runtimeRandom('project-meta').toString(36).substring(2, 6).toUpperCase()}`;
    try {
        _el('project-name').value = projectName;
        _el('project-description').value = 'Modelo gerado automaticamente para demonstracao do sistema';
        _el('project-author').value = `autor${randomCode()}`;
        const techResponsible = _el('project-responsible-tech');
        const legalResponsible = _el('project-responsible-legal');
        const dataManager = _el('project-data-manager');
        if (techResponsible) techResponsible.value = `resptec${randomCode()}`;
        if (legalResponsible) legalResponsible.value = `respleg${randomCode()}`;
        if (dataManager) dataManager.value = `gestdados${randomCode()}`;
    } catch (err: any) {
        log.debug('Project metadata fields not available', _errorMessage(err));
    }
    // 7. Report
    progress(30, t('generatingReport') || 'Generating report...');
    const campaignData = (campaigns || []).map((c: any) => ({
        name: c.name,
        startDate: c.date.toISOString().slice(0, 10),
    }));
    generateRandomReport(createdScenes, getAllElements(), campaignData);
    // ── Phase 3: Demo seeds ──
    progress(35, t('seedingDemoData') || 'Seeding demo data...');
    if (useDemoData) {
        // 8. Ticker
        generateRandomTicker();
        // 9. Calculator
        generateRandomCalculator();
        // 10. Constants
        generateRandomConstants();
        // 10b. Derivation showcase - injeta postProcessing demonstrativo em elementos selecionados
        try {
            _injectDerivationShowcase();
        } catch (err: any) {
            log.debug('Derivation showcase injection skipped', _errorMessage(err));
        }
        // 10c. GEE showcase - injeta observacoes de dados de atividade com derivacao para tCO2e
        try {
            _injectGEEShowcase();
        } catch (err: any) {
            log.debug('GEE showcase injection skipped', _errorMessage(err));
        }
        // 11. Library
        if (!isLibraryActive('synthetic-monitoring-demo')) {
            const demoLib = BUILTIN_EXAMPLES.find((l: any) => l.id === 'synthetic-monitoring-demo');
            if (demoLib) installLibrary(demoLib);
        }
        // 12. Groups (superior: campaign + thematic)
        generateRandomGroups(getAllElements(), getEnabledFamilies(), { campaigns: campaigns || [] });
        // 12b. EIS governance pack (campaign grouped weighted datasets linked to documents)
        if (randomResult?.eisGovernancePack) {
            window.eisGovernancePack = randomResult.eisGovernancePack;
            safeSetItem('ecbyts-eis-governance-pack', JSON.stringify(randomResult.eisGovernancePack));
        }
        // 13. Cost centers
        _generateRandomCostCenters(getAllElements());
    } else {
        try {
            delete window.eisGovernancePack;
            localStorage.removeItem('ecbyts-eis-governance-pack');
        } catch (err: any) {
            log.debug('Demo governance cleanup skipped', _errorMessage(err));
        }
    }
    // ── Phase 4: Geology & interpolation layers ──
    progress(45, t('creatingGeologySurfaces') || 'Creating geology surfaces...');
    // 14. Geology layers
    try {
        const { createGeologyLayer, getAvailableSoilTypes } = await import(
            '../../core/interpolation/manager.js' as string
        );
        const { RANDOM_MODEL_DEFAULTS } = await import('../../core/elements/randomModel.js' as string);
        const { maxAttempts, intervalMs } = RANDOM_MODEL_DEFAULTS.polling;
        // Aguarda dados estarem disponíveis (ver RANDOM_MODEL_DEFAULTS.polling)
        let soilTypes: any[] = [];
        for (let i = 0; i < maxAttempts; i++) {
            soilTypes = getAvailableSoilTypes();
            if (soilTypes.length > 0) break;
            await new Promise((r: any) => setTimeout(r, intervalMs));
        }
        console.debug(
            '[randomModel] geology: available soil types',
            soilTypes.map((s: any) => `${s.soilType}(${s.count})`),
        );
        // Cria geology layers - apenas tipos com 3+ wells
        let created = 0;
        for (const st of soilTypes.slice(0, 6)) {
            if (st.count < 3) {
                console.debug(`[randomModel] geology layer skipped: ${st.soilType} has ${st.count} wells (need 3+)`);
                continue;
            }
            try {
                await createGeologyLayer(st.soilType, {
                    contactType: 'top',
                    method: 'idw',
                    zOffset: 0.3 + created * 0.4,
                });
                created++;
                console.debug(`[randomModel] geology layer ${created}: ${st.soilType}`);
            } catch (err: any) {
                console.debug(`[randomModel] geology layer failed: ${st.soilType}`, _errorMessage(err) || String(err));
            }
        }
        console.debug(`[randomModel] geology: ${created}/${soilTypes.length} layers created`);
    } catch (err: any) {
        log.warn('Geology layers skipped', _errorMessage(err));
    }
    // 15-17. Water table, potentiometric map, contamination layer
    progress(55, t('creatingInterpolationLayers') || 'Creating interpolation layers...');
    try {
        const { createWaterTableLayer, createPotentiometricMap, createContaminationLayer } = await import(
            '../../core/interpolation/manager.js' as string
        );
        await createWaterTableLayer().catch((e: any) =>
            console.debug('[randomModel] water table failed:', _errorMessage(e)),
        );
        console.debug('[randomModel] water table layer created');
        await createPotentiometricMap().catch((e: any) =>
            console.debug('[randomModel] potentiometric failed:', _errorMessage(e)),
        );
        console.debug('[randomModel] potentiometric layer created');
        await createContaminationLayer('benzene').catch(() =>
            createContaminationLayer().catch((e: any) =>
                console.debug('[randomModel] contamination failed:', _errorMessage(e)),
            ),
        );
        console.debug('[randomModel] contamination layer created');
    } catch (err: any) {
        log.warn('Interpolation layers skipped', _errorMessage(err));
    }
    try {
        _applyRandomLayerVisualPreset(useTransparentVisuals);
    } catch (err: any) {
        log.debug('Interpolation layer visual preset skipped', _errorMessage(err));
    }
    // Reduz overlay do boundary para revelar camadas geologicas abaixo
    try {
        const boundary = getAllElements().find((e: any) => e.family === 'boundary');
        if (boundary) {
            const bMesh = getMeshByElementId(boundary.id);
            const overlay = bMesh?.getObjectByName?.('overlay');
            if (overlay?.material) overlay.material.opacity = useTransparentVisuals ? 0.5 : 0.85;
        }
    } catch (err: any) {
        log.debug('Boundary overlay opacity adjustment skipped', _errorMessage(err));
    }
    // VE global 3x - torna camadas finas (Clay 4m, Shale 5m) distinguiveis
    // ao lado de camadas grossas (Sandstone 21m, Limestone 35m).
    // Uniforme para todos os elementos (regra: VE unica no modelo inteiro).
    try {
        const hasStrata = getAllElements().some((e: any) => e.family === 'stratum');
        if (hasStrata) {
            const { changeSetting } = await import('../vizSettings/manager.js' as string);
            changeSetting('verticalExaggeration', 3.0);
        }
    } catch (err: any) {
        log.debug('Vertical exaggeration adjustment skipped', _errorMessage(err));
    }
    // ── Phase 5: Governance ──
    progress(65, t('syncingGovernance') || 'Syncing governance data...');
    if (financial) {
        try {
            const contractIdMap: any = {};
            for (const rc of financial.contracts || []) {
                const c = addContract({
                    name: rc.name,
                    type: rc.type,
                    status: rc.status === 'complete' ? 'completed' : rc.status,
                    parties: [{ name: rc.supplier, role: 'supplier' }],
                    financial: { totalValue: rc.value, currency: rc.currency || 'BRL' },
                    dates: { effectiveDate: rc.startDate, expirationDate: rc.endDate },
                });
                contractIdMap[rc.id] = c.id;
            }
            const phaseItemMap: any = {};
            for (const wbs of financial.wbs || []) {
                if (!phaseItemMap[wbs.phaseCode]) {
                    const parent = addWbsItem({
                        code: wbs.phaseCode,
                        name: wbs.phaseName,
                        status: 'in_progress',
                    });
                    phaseItemMap[wbs.phaseCode] = parent.id;
                }
                addWbsItem({
                    parentId: phaseItemMap[wbs.phaseCode],
                    code: wbs.code,
                    name: wbs.name,
                    baseline: {
                        cost: wbs.budget,
                        startDate: wbs.startDate,
                        endDate: wbs.endDate,
                        weight: wbs.weight || 0,
                    },
                    planned: { cost: wbs.budget, startDate: wbs.startDate, endDate: wbs.endDate },
                    actual: { cost: wbs.eva?.ac || 0, percentComplete: wbs.progress || 0 },
                    status: wbs.status === 'complete' ? 'completed' : wbs.status,
                });
            }
            if (financial.projectRegistry) {
                const reg = financial.projectRegistry;
                reg.project.linkedContractIds = (reg.project.linkedContractIds || []).map(
                    (oldId: any) => contractIdMap[oldId] || oldId,
                );
                const proj = addProject(reg.project);
                for (const res of reg.resources || []) addResource(res);
                for (const alloc of reg.allocations || []) addAllocation({ ...alloc, projectId: proj.id });
            }
        } catch (err: any) {
            log.warn('Governance seed skipped', _errorMessage(err));
        }
    }
    // ── Phase 6: Pipelines ──
    progress(70, t('creatingPipelines') || 'Creating pipelines...');
    generateRandomPipelines();
    _linkRandomRemediationPipelines();
    // ── Phase 7: intermediate UI refresh ──
    progress(75, t('refreshingUI') || 'Refreshing UI...');
    requestElementsUIRefresh();
    // ── Phase 8: Module seeds (each wrapped in try/catch) ──
    progress(78, t('seedingModules') || 'Seeding modules...');
    // 21. Issues / Bounty - cria nao-conformidades a partir de violacoes reais
    try {
        const { createIssue } = await import('../../core/issues/manager.js' as string);
        const wells = getAllElements().filter((el: any) => el.family === 'well');
        const violWells = wells
            .filter((el: any) =>
                (el.data?.observations || []).some(
                    /** @param {any} o */
                    (o: any) =>
                        (o.parameterId === 'benzene' && o.value > 1) || (o.parameterId === 'tph' && o.value > 20),
                ),
            )
            .slice(0, 3);
        violWells.forEach((el: any) => {
            const obs = el.data.observations.find(
                /** @param {any} o */
                (o: any) => (o.parameterId === 'benzene' && o.value > 1) || (o.parameterId === 'tph' && o.value > 20),
            );
            const isBenzene = obs.parameterId === 'benzene';
            const posData =
                el.data.position ||
                (el.data.coordinates
                    ? {
                          x: el.data.coordinates.easting,
                          y: el.data.coordinates.elevation || 0,
                          z: el.data.coordinates.northing,
                      }
                    : { x: 0, y: 0, z: 0 });
            createIssue({
                type: 'nonconformity',
                title: `${isBenzene ? 'Benzene' : 'TPH'} acima do ${isBenzene ? 'VP' : 'VI'} em ${el.name}`,
                severity: obs.value > (isBenzene ? 3 : 50) ? 'critical' : 'high',
                position: posData,
                elementId: el.id,
                measuredValue: obs.value,
                thresholdValue: isBenzene ? 1 : 20,
                unit: isBenzene ? 'ug/L' : 'mg/L',
            });
        });
        if (wells[0]) {
            const wellPos =
                wells[0].data?.position ||
                (wells[0].data?.coordinates
                    ? { x: wells[0].data.coordinates.easting, y: 0, z: wells[0].data.coordinates.northing }
                    : null);
            createIssue({
                type: 'bounty',
                title: 'Instalar poco substituto',
                severity: 'medium',
                position: wellPos,
                flagType: 'infrastructure',
            });
        }
        createIssue({
            type: 'service_request',
            title: 'Topografia complementar',
            severity: 'low',
            serviceType: 'topography',
            estimatedCost: 8500,
            currency: 'BRL',
        });
    } catch (err: any) {
        log.warn('Issues seed skipped', _errorMessage(err));
    }
    // 22. Sequencer keyframes via scenes com viewStart sintetico
    progress(82, t('seedingSequencer') || 'Seeding sequencer...');
    try {
        const seqMgr = await import('../../core/sequencer/manager.js' as string);
        if (seqMgr.initSequencer) await seqMgr.initSequencer();
        const allScenes = getAllScenes();
        const boundary = getAllElements().find((e: any) => e.family === 'boundary');
        if (boundary?.data?.vertices) {
            const vs = boundary.data.vertices;
            const cx = vs.reduce((s: any, v: any) => s + (v.x || 0), 0) / vs.length;
            const cz = vs.reduce((s: any, v: any) => s + (v.z || 0), 0) / vs.length;
            const span = Math.max(...vs.map((v: any) => Math.abs(v.x || 0)), ...vs.map((v: any) => Math.abs(v.z || 0)));
            const camDist = span * 2;
            const presets = [
                { camera: { x: camDist, y: camDist, z: camDist }, target: { x: cx, y: 0, z: cz } },
                { camera: { x: cx, y: camDist * 1.5, z: cz }, target: { x: cx, y: 0, z: cz } },
                { camera: { x: cx, y: camDist * 0.3, z: cz + camDist }, target: { x: cx, y: 0, z: cz } },
            ];
            allScenes.forEach((scene: any, i: any) => {
                if (!scene.viewStart) {
                    scene.viewStart = presets[i % presets.length];
                }
            });
        }
        seqMgr.refreshItems();
        const items = seqMgr.getItems();
        const kfCount = Math.min(items.length, 5);
        for (let i = 0; i < kfCount; i++) {
            seqMgr.addKeyframe(items[i].id, {
                position: i / Math.max(1, kfCount - 1),
                duration: 3000,
                annotation: items[i].name,
            });
        }
    } catch (err: any) {
        log.warn('Sequencer seed skipped', _errorMessage(err));
    }
    // 23. Validation CONAMA - ativar perfil e validar observacoes
    progress(85, t('validatingData') || 'Validating data...');
    try {
        const { setActiveProfileIds, validateBatchWithProfile, getValidationProfile } = await import(
            '../../core/validation/profileEngine.js' as string
        );
        const profile = await getValidationProfile('conama-420');
        if (profile) {
            await setActiveProfileIds(['conama-420']);
            const allObs = getAllElements().flatMap((el: any) =>
                (el.data?.observations || []).map((o: any) => ({
                    parameterId: o.parameterId,
                    value: o.value,
                    unitId: o.unitId,
                    elementId: el.id,
                })),
            );
            await validateBatchWithProfile(allObs, 'conama-420');
        }
    } catch (err: any) {
        log.warn('Validation seed skipped', _errorMessage(err));
    }
    // 24. SAO - ativar cenario oil_spill
    try {
        const sao = await import('../../core/sao/index.js' as string);
        if (sao.initSAO) await sao.initSAO();
        await sao.activateScenario('oil_spill');
        sao.setTier('recommended');
    } catch (err: any) {
        log.warn('SAO seed skipped', _errorMessage(err));
    }
    // 25. Audit Benford - test nos valores de observacao
    progress(88, t('runningAudit') || 'Running audit...');
    try {
        const { benfordTest } = await import('../../core/audit/benford.js' as string);
        const values = getAllElements()
            .flatMap((el: any) => (el.data?.observations || []).map((o: any) => o.value))
            .filter(/** @param {number} v */ (v: any) => v > 0);
        if (values.length >= 10) {
            const result = benfordTest(values);
            safeSetItem('ecbyts-audit-benford', JSON.stringify(result));
        }
    } catch (err: any) {
        log.warn('Audit seed skipped', _errorMessage(err));
    }
    // 26. EIS - calcular score demo
    try {
        const { EisCalculator } = await import('../../core/eis/eisCalculator.js' as string);
        const calc = new EisCalculator();
        const result = calc.calculate({ T: 4, A: 4, Cp: 4, Ty: 3, Cs: 4, Cm: 4 }, 'geometric');
        safeSetItem('ecbyts-eis-demo', JSON.stringify(result));
    } catch (err: any) {
        log.warn('EIS seed skipped', _errorMessage(err));
    }
    // 27. NN demo — treino roda em BACKGROUND pós-boot (PERF boot-loading
    // claude - adm 2026-06-11): o bloco custava 142-256ms (~24-40% do build)
    // BLOQUEANDO o overlay e é puro enrichment demo — consumido on-demand
    // pelo painel What-If (E2E random-model-v2 #9 só loga, não assert).
    // Fora do runtime determinístico não há regressão de seed: a init de
    // pesos já usava Math.random (não-mockado). requestIdleCallback cede
    // prioridade ao first paint; fallback setTimeout 2s.
    {
        const scheduleIdle = (fn: () => void) => {
            const ric = (globalThis as any).requestIdleCallback;
            if (typeof ric === 'function') ric(fn, { timeout: 8000 });
            else setTimeout(fn, 2000);
        };
        scheduleIdle(() => {
            void _trainDemoNNBackground().catch((err: any) =>
                log.warn('NN demo training skipped', _errorMessage(err)),
            );
        });
    }
    // ── Phase 9: UI finalization ──
    progress(96, t('finalizingUI') || 'Finalizing UI...');
    // 28. Fecha ML Studio se aberto (nao deve abrir automaticamente no random)
    try {
        const nnPanel = _el('nn-side-panel');
        if (nnPanel?.classList.contains('visible')) {
            nnPanel.classList.remove('visible');
        }
    } catch (err: any) {
        log.debug('ML Studio panel close ignored', _errorMessage(err));
    }
    // 29. Auto-seleciona primeiro poco para a constelacao ficar visivel
    try {
        const allEls = getAllElements();
        const firstWell = allEls.find((e: any) => e.family === 'well') || allEls[0];
        if (firstWell) setSelectedElement(firstWell.id);
    } catch (err: any) {
        log.debug('setSelectedElement ignored', _errorMessage(err));
    }
    // 30. Vista 3D - deixar a cargo do caller (main.js applySavedView) para
    //     nao sobrescrever o swipe pane state no boot automatico.
    // 31. Vista isometrica - aguardar a cena sinalizar disponibilidade.
    // Avoid fixed readiness delays: if the scene is not ready yet, the existing
    // callback below applies the camera preset when the 3D view becomes ready.
    //
    // Fix #2 (2026-04-11): a cena e LAZY-inicializada via onSceneReady, que
    // so dispara quando o usuario navega para o view 3D. Durante boot random,
    // generateRandomModel roda ANTES do switchView → setIsometricView() chama
    // applyViewPreset() antes de camera/controls existirem, que loga warn e
    // retorna sem aplicar a vista. Fix: defer o setIsometricView se a cena
    // ainda nao esta pronta - sera chamado depois via markSceneReady ou o
    // primeiro switchView para model view.
    if (!skipCameraFinalize) {
        await new Promise((r: any) => {
            requestAnimationFrame(() => requestAnimationFrame(r));
        });
        try {
            const { isSceneReady } = await import('../scene/viewRouter.js' as string);
            if (isSceneReady()) {
                setIsometricView();
            } else {
                // Legacy path only: V2 ownership moves deferred camera apply to orchestrator.js.
                const applyOnce = () => {
                    try {
                        setIsometricView();
                    } catch (err: any) {
                        log.debug('Isometric view deferred apply failed', _errorMessage(err));
                    }
                    window.removeEventListener('ecbyts:sceneReady', applyOnce);
                    window.removeEventListener('groupChanged', applyOnce);
                };
                window.addEventListener('ecbyts:sceneReady', applyOnce, { once: true });
                window.addEventListener('groupChanged', applyOnce, { once: true });
                log.debug('Isometric view deferred until scene is ready');
            }
        } catch (err: any) {
            log.debug('Isometric view set ignored', _errorMessage(err));
        }
    } else {
        log.debug('Camera finalize delegated to random orchestrator', {
            runId: randomRunId,
            source: randomSource,
        });
    }
    // 32. Toast + event
    progress(100, t('done') || 'Done!');
    try {
        const { setInterpolationToastsQuiet } = await import('../../core/interpolation/manager.js' as string);
        setInterpolationToastsQuiet(false);
    } catch (e: any) {
        console.debug('[randomModel] interp-quiet-reset:', e?.message || e);
    }
    showToast(t('randomGenerated'), 'success');
    window.dispatchEvent(new CustomEvent('modelGenerated'));
    console.debug('[randomModel] build:finish', {
        runId: randomRunId,
        source: randomSource,
        durationMs: realNow() - buildStartedAt,
    });
}
// ----------------------------------------------------------------
// RANDOM PIPELINES - Automações BPMN de exemplo
// ----------------------------------------------------------------
/**
 * Gera 3 pipelines BPMN de exemplo relevantes para monitoramento ambiental.
 * Usa IDs fixos para que re-execuções do random apenas atualizem as entradas.
 * Pipelines são conteúdo do usuário (Category B) - persistidos mesmo em modo efêmero.
 * Chamada ao final de _executeRandomModel().
 */
export function generateRandomPipelines() {
    // Idempotente: não re-cria se os demos já existirem (preserva dados de teste/usuário)
    if (
        getPipeline('demo-pipeline-report') &&
        getPipeline('demo-pipeline-interp') &&
        getPipeline('demo-pipeline-conditional') &&
        getPipeline('demo-pipeline-remediation-pump-on')
    )
        return;
    // Pipeline 1 - Relatório automático: gera modelo e abre relatório
    savePipeline({
        id: 'demo-pipeline-report',
        name: 'Relatorio Automatico',
        xml: `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:ecbyts="http://ecbyts.com/bpmn"
                  id="Def_report" targetNamespace="http://ecbyts.com">
  <bpmn:process id="Process_report" isExecutable="true">
    <bpmn:startEvent id="Start_report" name="Inicio">
      <bpmn:extensionElements>
        <ecbyts:config>{"type":"trigger","config":{"triggerType":"manual"}}</ecbyts:config>
      </bpmn:extensionElements>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_r1" sourceRef="Start_report" targetRef="Task_addReport"/>
    <bpmn:serviceTask id="Task_addReport" name="Novo Relatorio">
      <bpmn:extensionElements>
        <ecbyts:config>{"type":"action","config":{"action":"handleAddReport","params":{}}}</ecbyts:config>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="Flow_r2" sourceRef="Task_addReport" targetRef="Task_openReport"/>
    <bpmn:serviceTask id="Task_openReport" name="Abrir Overlay de Relatorio">
      <bpmn:extensionElements>
        <ecbyts:config>{"type":"action","config":{"action":"handleOpenReportOverlay","params":{}}}</ecbyts:config>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="Flow_r3" sourceRef="Task_openReport" targetRef="End_report"/>
    <bpmn:endEvent id="End_report" name="Fim"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_report">
    <bpmndi:BPMNPlane id="Plane_report" bpmnElement="Process_report">
      <bpmndi:BPMNShape id="Start_report_di" bpmnElement="Start_report">
        <dc:Bounds x="152" y="82" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="145" y="125" width="50" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_addReport_di" bpmnElement="Task_addReport">
        <dc:Bounds x="240" y="60" width="100" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_openReport_di" bpmnElement="Task_openReport">
        <dc:Bounds x="400" y="60" width="100" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_report_di" bpmnElement="End_report">
        <dc:Bounds x="562" y="82" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="568" y="125" width="24" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_r1_di" bpmnElement="Flow_r1">
        <di:waypoint x="188" y="100"/><di:waypoint x="240" y="100"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_r2_di" bpmnElement="Flow_r2">
        <di:waypoint x="340" y="100"/><di:waypoint x="400" y="100"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_r3_di" bpmnElement="Flow_r3">
        <di:waypoint x="500" y="100"/><di:waypoint x="562" y="100"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`,
    });
    // Pipeline 2 - Interpolação + Voxel: cadeia de análise espacial
    savePipeline({
        id: 'demo-pipeline-interp',
        name: 'Interpolacao e Voxel 3D',
        xml: `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:ecbyts="http://ecbyts.com/bpmn"
                  id="Def_interp" targetNamespace="http://ecbyts.com">
  <bpmn:process id="Process_interp" isExecutable="true">
    <bpmn:startEvent id="Start_interp" name="Inicio">
      <bpmn:extensionElements>
        <ecbyts:config>{"type":"trigger","config":{"triggerType":"manual"}}</ecbyts:config>
      </bpmn:extensionElements>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_i1" sourceRef="Start_interp" targetRef="Task_openInterp"/>
    <bpmn:serviceTask id="Task_openInterp" name="Abrir Painel Interpolacao">
      <bpmn:extensionElements>
        <ecbyts:config>{"type":"action","config":{"action":"handleOpenInterpolationPanel","params":{}}}</ecbyts:config>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="Flow_i2" sourceRef="Task_openInterp" targetRef="Task_refreshInterp"/>
    <bpmn:serviceTask id="Task_refreshInterp" name="Calcular Interpolacao">
      <bpmn:extensionElements>
        <ecbyts:config>{"type":"action","config":{"action":"handleRefreshInterpolationLayer","params":{}}}</ecbyts:config>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="Flow_i3" sourceRef="Task_refreshInterp" targetRef="Task_voxel"/>
    <bpmn:serviceTask id="Task_voxel" name="Gerar Voxel 3D">
      <bpmn:extensionElements>
        <ecbyts:config>{"type":"action","config":{"action":"handleGenerateVoxel","params":{}}}</ecbyts:config>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="Flow_i4" sourceRef="Task_voxel" targetRef="End_interp"/>
    <bpmn:endEvent id="End_interp" name="Fim"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_interp">
    <bpmndi:BPMNPlane id="Plane_interp" bpmnElement="Process_interp">
      <bpmndi:BPMNShape id="Start_interp_di" bpmnElement="Start_interp">
        <dc:Bounds x="152" y="82" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="145" y="125" width="50" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_openInterp_di" bpmnElement="Task_openInterp">
        <dc:Bounds x="240" y="60" width="100" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_refreshInterp_di" bpmnElement="Task_refreshInterp">
        <dc:Bounds x="400" y="60" width="100" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_voxel_di" bpmnElement="Task_voxel">
        <dc:Bounds x="560" y="60" width="100" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_interp_di" bpmnElement="End_interp">
        <dc:Bounds x="722" y="82" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="728" y="125" width="24" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_i1_di" bpmnElement="Flow_i1">
        <di:waypoint x="188" y="100"/><di:waypoint x="240" y="100"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_i2_di" bpmnElement="Flow_i2">
        <di:waypoint x="340" y="100"/><di:waypoint x="400" y="100"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_i3_di" bpmnElement="Flow_i3">
        <di:waypoint x="500" y="100"/><di:waypoint x="560" y="100"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_i4_di" bpmnElement="Flow_i4">
        <di:waypoint x="660" y="100"/><di:waypoint x="722" y="100"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`,
    });
    // Pipeline 3 - Condicional: verifica se há poços antes de calcular
    savePipeline({
        id: 'demo-pipeline-conditional',
        name: 'Verificar Pocos e Calcular',
        xml: `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:ecbyts="http://ecbyts.com/bpmn"
                  id="Def_cond" targetNamespace="http://ecbyts.com">
  <bpmn:process id="Process_cond" isExecutable="true">
    <bpmn:startEvent id="Start_cond" name="Inicio">
      <bpmn:extensionElements>
        <ecbyts:config>{"type":"trigger","config":{"triggerType":"manual"}}</ecbyts:config>
      </bpmn:extensionElements>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_c1" sourceRef="Start_cond" targetRef="Gate_wells"/>
    <bpmn:exclusiveGateway id="Gate_wells" name="Ha pocos?">
      <bpmn:extensionElements>
        <ecbyts:config>{"type":"condition","config":{"subject":"elements[familyId=well].length","operator":">=","value":1}}</ecbyts:config>
      </bpmn:extensionElements>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_c2" sourceRef="Gate_wells" targetRef="Task_calc">
      <bpmn:conditionExpression>true</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_c3" sourceRef="Gate_wells" targetRef="Task_genModel">
      <bpmn:conditionExpression>false</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:serviceTask id="Task_calc" name="Abrir Calculadora">
      <bpmn:extensionElements>
        <ecbyts:config>{"type":"action","config":{"action":"handleOpenCalculator","params":{}}}</ecbyts:config>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="Task_genModel" name="Gerar Modelo Aleatorio">
      <bpmn:extensionElements>
        <ecbyts:config>{"type":"action","config":{"action":"generateRandomModel","params":{}}}</ecbyts:config>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="Flow_c4" sourceRef="Task_calc" targetRef="End_cond"/>
    <bpmn:sequenceFlow id="Flow_c5" sourceRef="Task_genModel" targetRef="End_cond"/>
    <bpmn:endEvent id="End_cond" name="Fim"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_cond">
    <bpmndi:BPMNPlane id="Plane_cond" bpmnElement="Process_cond">
      <bpmndi:BPMNShape id="Start_cond_di" bpmnElement="Start_cond">
        <dc:Bounds x="152" y="162" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="145" y="205" width="50" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gate_wells_di" bpmnElement="Gate_wells" isMarkerVisible="true">
        <dc:Bounds x="255" y="155" width="50" height="50"/><bpmndi:BPMNLabel><dc:Bounds x="238" y="212" width="85" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_calc_di" bpmnElement="Task_calc">
        <dc:Bounds x="370" y="60" width="100" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_genModel_di" bpmnElement="Task_genModel">
        <dc:Bounds x="370" y="240" width="100" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_cond_di" bpmnElement="End_cond">
        <dc:Bounds x="542" y="162" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="548" y="205" width="24" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_c1_di" bpmnElement="Flow_c1">
        <di:waypoint x="188" y="180"/><di:waypoint x="255" y="180"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_c2_di" bpmnElement="Flow_c2">
        <di:waypoint x="280" y="155"/><di:waypoint x="280" y="100"/><di:waypoint x="370" y="100"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_c3_di" bpmnElement="Flow_c3">
        <di:waypoint x="280" y="205"/><di:waypoint x="280" y="280"/><di:waypoint x="370" y="280"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_c4_di" bpmnElement="Flow_c4">
        <di:waypoint x="470" y="100"/><di:waypoint x="560" y="100"/><di:waypoint x="560" y="162"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_c5_di" bpmnElement="Flow_c5">
        <di:waypoint x="470" y="280"/><di:waypoint x="560" y="280"/><di:waypoint x="560" y="198"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`,
    });
    // Pipeline 4 - Remediation: concentração de poço -> comando pump ON via API mock
    savePipeline({
        id: 'demo-pipeline-remediation-pump-on',
        name: 'Remediation - Pump ON por Concentracao',
        xml: `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:ecbyts="http://ecbyts.com/bpmn"
                  id="Def_remediation_pump" targetNamespace="http://ecbyts.com">
  <bpmn:process id="Process_remediation_pump" isExecutable="true">
    <bpmn:startEvent id="Start_rem_pump" name="Inicio">
      <bpmn:extensionElements>
        <ecbyts:config>{"type":"trigger","config":{"triggerType":"manual"}}</ecbyts:config>
      </bpmn:extensionElements>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_rem_1" sourceRef="Start_rem_pump" targetRef="Task_eval_threshold"/>
    <bpmn:serviceTask id="Task_eval_threshold" name="Avaliar limiar de concentração">
      <bpmn:extensionElements>
        <ecbyts:config>{"type":"action","config":{"action":"handleRemediationConcentrationTrigger","params":{"parameterId":"benzene","operator":">","threshold":5,"endpoint":"/api/mock/remediation/pump","method":"POST","cooldownMs":300000}}}</ecbyts:config>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="Flow_rem_2" sourceRef="Task_eval_threshold" targetRef="End_rem_pump"/>
    <bpmn:endEvent id="End_rem_pump" name="Fim"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_remediation_pump">
    <bpmndi:BPMNPlane id="Plane_remediation_pump" bpmnElement="Process_remediation_pump">
      <bpmndi:BPMNShape id="Start_rem_pump_di" bpmnElement="Start_rem_pump"><dc:Bounds x="152" y="82" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_eval_threshold_di" bpmnElement="Task_eval_threshold"><dc:Bounds x="240" y="60" width="180" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_rem_pump_di" bpmnElement="End_rem_pump"><dc:Bounds x="472" y="82" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_rem_1_di" bpmnElement="Flow_rem_1"><di:waypoint x="188" y="100"/><di:waypoint x="240" y="100"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_rem_2_di" bpmnElement="Flow_rem_2"><di:waypoint x="420" y="100"/><di:waypoint x="472" y="100"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`,
    });
}
function _linkRandomRemediationPipelines() {
    const all = getAllElements();
    const wells = all.filter((e: any) => e.family === 'well');
    const rems = all.filter((e: any) => e.family === 'remediation');
    if (!rems.length) return;
    const targetWell = wells[0]?.id || null;
    rems.forEach((rem: any, idx: any) => {
        updateElement(rem.id, {
            data: {
                ...(rem.data || {}),
                operationalPipelineId: 'demo-pipeline-remediation-pump-on',
                autoTrigger: idx === 0 ? 'on_campaign' : rem.data?.autoTrigger || 'manual',
                linkedElements: targetWell ? [targetWell] : rem.data?.linkedElements || [],
            },
        });
    });
}
// ----------------------------------------------------------------
// CLEAR MODEL
// Limpa todo o modelo sem recarregar a pagina.
// ----------------------------------------------------------------
/**
 * Clear all model data (elements, edges, campaigns, scenes).
 * Limpa todos os dados do modelo atual sem recarregar a pagina.
 * Pede confirmacao antes de executar.
 */
export function handleClearModel() {
    if (!canDo('delete')) {
        showToast(t('auth.actionDenied') || "You don't have permission to perform this action.", 'error');
        return;
    }
    // Abre modal para selecionar familias antes de limpar
    openFamilySelectModal(
        'clear',
        /** @param {any} selectedFamilies */ (selectedFamilies: any) => {
            _executeClearModel(selectedFamilies);
        },
    );
}
/**
 * Execute clear with selected families.
 * Se todas as familias estao selecionadas, faz clear total (campaigns, scenes, etc.).
 * Se parcial, remove apenas elementos das familias selecionadas.
 * @param {Set<string>} selectedFamilies - Familias a remover
 */
function _executeClearModel(selectedFamilies: any) {
    // Compara contra familias COM elementos (nao todas as registradas)
    const counts = countByFamily();
    const populatedIds = Object.keys(counts).filter((id: any) => (counts as any)[id] > 0);
    const isTotal = populatedIds.length > 0 && populatedIds.every((f: any) => selectedFamilies.has(f));
    if (isTotal) {
        // Clear total - comportamento original
        clearAllElements();
        clearEdges();
        clearCampaigns();
        clearScenes();
        clearReport();
        clearFilterPresets();
        clearTicker();
        clearAllLibraries();
        clearGroups();
        clearAllLayers();
        clearAllVolumes();
        clearCalculator();
        clearContracts();
        clearWbs();
        clearProjects();
        // Reset project form fields
        const fields = [
            'project-name',
            'project-description',
            'project-author',
            'project-responsible-tech',
            'project-responsible-legal',
            'project-data-manager',
        ];
        fields.forEach((id: any) => {
            const el = _el(id);
            if (el) el.value = '';
        });
        // Para todos os auto-refresh de sensores
        import('../../core/sensor/autoRefresh.js' as string)
            .then((m: any) => m.stopAllAutoRefresh())
            .catch((_e: any) => console.debug('[utils/handlers/elements:silent-catch]', _errorMessage(_e)));
        clearModelData();
        clearHighlight();
        requestElementsUIRefresh();
        showToast(t('modelCleared'), 'success');
    } else {
        // Clear parcial - remove apenas elementos das familias selecionadas
        let totalRemoved = 0;
        selectedFamilies.forEach((familyId: any) => {
            totalRemoved += removeElementsByFamily(familyId);
        });
        clearHighlight();
        requestElementsUIRefresh();
        showToast(`${t('modelCleared')}: ${totalRemoved} ${t('elements') || 'elements'}`, 'success');
    }
}
// ----------------------------------------------------------------
// COPY / PASTE ELEMENT
// Copia e cola o elemento selecionado no modelo.
// ----------------------------------------------------------------
let _clipboard: any = null;
/**
 * Check if clipboard has content for paste.
 * @returns {boolean}
 */
export function hasClipboard() {
    return _clipboard !== null;
}
/**
 * Copy the currently selected element to internal clipboard.
 * Copia o elemento selecionado para a area de transferencia interna.
 */
export function handleCopyElement() {
    const selected = getSelectedElement();
    if (!selected) {
        showToast(t('noElementSelected'), 'warning');
        return;
    }
    _clipboard = deepClone({
        family: selected.family,
        name: selected.name,
        data: selected.data,
        stamps: selected.stamps || [],
        iconClass: selected.iconClass || '',
        color: selected.color || '',
        label: selected.label || selected.name,
    });
    showToast(`${t('copied')} ${selected.name}`, 'success');
}
/**
 * Paste the copied element with offset position.
 * Cola o elemento copiado com posicao deslocada para nao sobrepor o original.
 */
export function handlePasteElement() {
    if (!_clipboard) {
        showToast(t('nothingToPaste'), 'warning');
        return;
    }
    const clonedData = deepClone(_clipboard.data);
    const OFFSET = 5;
    offsetElementPosition(clonedData, _clipboard.family, OFFSET);
    const newId = `${_clipboard.family}-paste-${Date.now()}`;
    const newName = `${_clipboard.name} (copy)`;
    const element = addElement(_clipboard.family, newId, newName, clonedData, {
        iconClass: _clipboard.iconClass,
        color: _clipboard.color,
        label: newName,
        stamps: deepClone(_clipboard.stamps),
    });
    if (element) {
        setSelectedElement(element.id);
        requestElementsUIRefresh();
        showToast(`${t('pasted')} ${newName}`, 'success');
    }
}
/**
 * Offset element position based on family data structure.
 * Cada familia armazena posicao de forma diferente.
 */
/**
 * @param {any} data
 * @param {string} family
 * @param {number} offset
 */
function offsetElementPosition(data: any, family: any, offset: any) {
    if (family === 'well' && data.coordinates) {
        data.coordinates.easting = (data.coordinates.easting || 0) + offset;
        data.coordinates.northing = (data.coordinates.northing || 0) + offset;
    } else if (family === 'plume' && data.center) {
        data.center.x = (data.center.x || 0) + offset;
        data.center.z = (data.center.z || 0) + offset;
    } else if (data.position) {
        data.position.x = (data.position.x || 0) + offset;
        data.position.z = (data.position.z || 0) + offset;
    } else if (data.vertices && data.vertices.length > 0) {
        data.vertices.forEach(
            /** @param {any} el */ (v: any) => {
                v.x = (v.x || 0) + offset;
                v.z = (v.z || 0) + offset;
            },
        );
    } else if (data.path && data.path.length > 0) {
        data.path.forEach(
            /** @param {any} dflt */ (p: any) => {
                p.x = (p.x || 0) + offset;
                p.z = (p.z || 0) + offset;
            },
        );
    }
}
// ----------------------------------------------------------------
// TRANSFORM HANDLERS
// Controles de posicao, escala, rotacao e cor de elementos.
// ----------------------------------------------------------------
/**
 * Update element transform (position, scale, rotation, color).
 * Atualiza transformacao 3D e cor de um elemento em tempo real.
 *
 * @param {string} el - ID do elemento
 * @param {string} dflt - 'position' | 'scale' | 'rotation' | 'color'
 * @param {any} values - Valores ({x,y,z} ou cor hex)
 */
/**
 * CC-S1 B3 artesanal (CCC-001 Fase 11) — wrapper p/ inputs XYZ do painel
 * transform (lists.ts). Lê os 3 inputs irmãos do parent (ordem x,y,z) e
 * delega a handleElementTransform. Torna o atributo inline um single-call
 * sweepable: data-cc-call-input="handleElementTransformXYZ|s:id|s:kind|t|j:0".
 */
export function handleElementTransformXYZ(elementId: any, property: any, el: any, dflt: any) {
    const inputs = el?.parentElement?.querySelectorAll('input') || [];
    const d = Number(dflt) || 0;
    const v = (i: number) => {
        const n = parseFloat(inputs[i]?.value);
        return Number.isFinite(n) ? n : d;
    };
    handleElementTransform(elementId, property, { x: v(0), y: v(1), z: v(2) });
}

/**
 * CC-S1 B3 artesanal — wrapper p/ input de cor do painel transform: aplica a
 * cor e sincroniza o input gêmeo (text ↔ color picker).
 */
export function handleElementTransformColor(elementId: any, el: any) {
    handleElementTransform(elementId, 'color', el?.value);
    const twin = el?.previousElementSibling;
    if (twin && 'value' in twin) twin.value = el.value;
}

export function handleElementTransform(elementId: any, property: any, values: any) {
    const element = getElementById(elementId);
    if (!element) return;
    const mesh = getMeshByElementId(elementId);
    const objectValues = values;
    switch (property) {
        case 'position': {
            // Atualiza centro no data do elemento
            if (!element.data) element.data = {};
            if (element.data.center) {
                Object.assign(element.data.center, objectValues);
            } else if (element.data.position) {
                Object.assign(element.data.position, objectValues);
            } else {
                element.data.center = { ...objectValues };
            }
            if (mesh) updateMesh(mesh, { position: values });
            break;
        }
        case 'scale': {
            if (!element.data) element.data = {};
            element.data.scale = { ...objectValues };
            if (mesh) updateMesh(mesh, { scale: values });
            break;
        }
        case 'rotation': {
            if (!element.data) element.data = {};
            element.data.rotation = { ...objectValues };
            if (mesh) updateMesh(mesh, { rotation: values });
            break;
        }
        case 'color': {
            element.color = values;
            if (mesh) updateMesh(mesh, { color: values });
            break;
        }
    }
}
/**
 * Handle field changes on area elements (setor/zona).
 * Atualiza data.* do elemento area e sincroniza com Project Areas.
 *
 * @param {string} elementId
 * @param {string} field - 'projectArea', 'areaType', 'headcount', 'workedHours'
 * @param {*} value
 */
export function handleAreaFieldChange(elementId: any, field: any, value: any) {
    const element = getElementById(elementId);
    if (!element) return;
    if (!element.data) element.data = {};
    element.data[field] = value;
}
/**
 * Change the organizational unit assignment for an element.
 * Altera o vinculo do elemento com a arvore organizacional.
 *
 * @param {string} elementId
 * @param {string} nodeId - Tree node ID (or '' to unlink)
 */
export function handleElementOrgUnitChange(elementId: any, nodeId: any) {
    const element = getElementById(elementId);
    if (!element) return;
    if (!element.data) element.data = {};
    element.data.areaId = nodeId || '';
}
// ----------------------------------------------------------------
// CONTEXT MENU HANDLERS
// Acoes adicionais expostas pelo menu de contexto (botao direito).
// ----------------------------------------------------------------
/**
 * Zoom camera to specific element.
 * @param {string} elementId
 */
export function handleZoomToElement(elementId: any) {
    if (!elementId) return;
    zoomToElement(elementId);
}
/**
 * Zoom camera to fit all elements of a family.
 * @param {string} familyId
 */
export function handleZoomToFamily(familyId: any) {
    if (!familyId) return;
    zoomToFamily(familyId);
}
/**
 * Duplicate an element (copy + paste in one step).
 * @param {string} elementId
 */
export function handleDuplicateElement(elementId: any) {
    const element = getElementById(elementId);
    if (!element) return;
    const clonedData = deepClone(element.data);
    offsetElementPosition(clonedData, element.family, 5);
    const newId = `${element.family}-dup-${Date.now()}`;
    const newName = `${element.name} (copy)`;
    const created = addElement(element.family, newId, newName, clonedData, {
        iconClass: element.iconClass || '',
        color: element.color || '',
        label: newName,
        stamps: deepClone(element.stamps || []),
    });
    if (created) {
        setSelectedElement(created.id);
        requestElementsUIRefresh();
        showToast(`${t('duplicated')} ${newName}`, 'success');
    }
}
/**
 * Show all elements of a family.
 * @param {string} familyId
 */
export function handleShowAllFamily(familyId: any) {
    const elements = getAllElements().filter((el: any) => el.family === familyId);
    for (const el of elements) {
        if (!el.visible) toggleElementVisibility(el.id);
    }
    requestElementsUIRefresh();
}
/**
 * Hide all elements of a family.
 * @param {string} familyId
 */
export function handleHideAllFamily(familyId: any) {
    const elements = getAllElements().filter((el: any) => el.family === familyId);
    for (const el of elements) {
        if (el.visible) toggleElementVisibility(el.id);
    }
    requestElementsUIRefresh();
}
/**
 * All element handler functions exposed to the HTML via window.
 * Objeto com todas as funcoes que o HTML chama via onclick.
 */
export const elementHandlers = {
    handleAddElement,
    handleRemoveElement,
    handleToggleVisibility,
    handleSelectElement,
    handleElementFieldChange,
    handleElementTransform,
    handleElementTransformXYZ,
    handleElementTransformColor,
    handleAreaFieldChange,
    handleClearModel,
    handleCopyElement,
    handlePasteElement,
    handleZoomToElement,
    handleZoomToFamily,
    handleDuplicateElement,
    handleShowAllFamily,
    handleHideAllFamily,
    handleElementOrgUnitChange,
    handleGenerateRandomModel,
    generateRandomModel: handleGenerateRandomModelDirect,
};
