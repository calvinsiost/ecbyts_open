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
   MERGE HANDLERS — User actions for diff/merge workflow
   Acoes do usuario para fluxo de diff/merge

   FUNCIONALIDADES:
   - Abrir modal de merge
   - Carregar modelos A e B (chave ECO ou estado atual)
   - Executar diff
   - Aceitar/rejeitar conflitos
   - Aplicar merge final
   - Exportar delta log
   ================================================================ */
import { diffModels, mergeModels, buildDelta } from '../../core/diff/engine.js';
import { renderConflictList, updateMergeSummary, updateCardState, injectMergeStyles } from '../ui/mergePanel.js';
import { buildModel } from '../../core/io/export.js';
import { applyModel } from '../../core/io/import.js';
import { parseInputAsync, detectKeyVersion, decodeKeyV3 } from '../../core/io/decoder.js';
import { showToast } from '../ui/toast.js';
import { openModal, closeModal } from '../ui/modals.js';
import { t } from '../i18n/translations.js';
import { getIcon } from '../ui/icons.js';
import { escapeHtml } from '../helpers/html.js';
import { getUserRole } from '../auth/permissions.js';
import * as _session from '../auth/session.js';
const getUserEmail = (/** @type {any} */(_session).getUserEmail) as () => string;
import { requireOwnershipPermission } from '../../core/ownership/index.js';
import { createLogger } from '../helpers/logger.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
const log = createLogger('Merge');
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
let modelA: any = null;
let modelB: any = null;
let currentDiff: any = null;
let decisions: any = {};
let requestMergeUIRefreshRef: any = null;
/** @type {boolean} Indica se o merge foi aberto pelo wizard de ingestao */
let _mergeFromWizard = false;
function _appendMergeAudit(entry: any) {
    if (!window._mergeSecurityAudit)
        window._mergeSecurityAudit = [];
    window._mergeSecurityAudit.push({ ts: new Date().toISOString(), ...entry });
}
function _getStrictMergeMode() {
    const role = getUserRole();
    const actor = getUserEmail() || 'anonymous';
    const override = window.__ecbyts_mergeStrictOverride;
    if (override === false && role !== 'owner' && role !== 'admin') {
        _appendMergeAudit({
            actor,
            role,
            strict: true,
            deniedOverride: true,
            reason: 'strict_override_denied',
        });
        showToast(t('auth.actionDenied') || "You don't have permission to perform this action.", 'error');
        return true;
    }
    return override !== false;
}
async function _parseMergeInput(inputRaw: any) {
    const input = String(inputRaw || '').trim();
    if (!input)
        throw new Error('Empty input');
    const version = input.startsWith('ECBT') || input.startsWith('ECO') ? detectKeyVersion(input) : null;
    const strict = _getStrictMergeMode();
    const role = getUserRole();
    const actor = getUserEmail() || 'anonymous';
    if (version === 3) {
        if (strict) {
            const model = (await decodeKeyV3(input, { verifySignature: true, verifyMerkle: true })) as any;
            if (!model?._verification?.verified) {
                _appendMergeAudit({
                    actor,
                    role,
                    strict: true,
                    version,
                    status: model?._verification?.status || 'invalid',
                    blocked: true,
                });
                throw new Error('Blockchain verification failed for ECO3 key (strict mode).');
            }
            _appendMergeAudit({ actor, role, strict: true, version, status: 'verified', blocked: false });
            return model;
        }
        _appendMergeAudit({
            actor,
            role,
            strict: false,
            version,
            status: 'bypassed',
            blocked: false,
        });
    }
    return parseInputAsync(input);
}
// ----------------------------------------------------------------
// INIT
// ----------------------------------------------------------------
/**
 * Inject full-refresh callback reference.
 * @param {Function} fn
 */
export function setMergeRequestUIRefresh( fn: any) {
    requestMergeUIRefreshRef = fn;
}
function requestMergeUIRefresh(reason = 'merge.changed') {
    if (!requestMergeUIRefreshRef)
        return;
    for (const domain of [
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.HOME,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
    ]) {
        requestMergeUIRefreshRef(domain, reason);
    }
}
// ----------------------------------------------------------------
// HANDLERS
// ----------------------------------------------------------------
/**
 * Open the merge modal.
 * Abre o modal de diff/merge.
 */
function handleOpenMergeModal() {
    injectMergeStyles();
    modelA = null;
    modelB = null;
    currentDiff = null;
    decisions = {};
    _mergeFromWizard = false;
    // Cleanup de state de sessoes anteriores
    delete window._postMergeActions;
    delete window._lastVirtualModel;
    delete window._lastCurrentModel;
    // Reset UI
    const inputA = (document.getElementById('merge-input-a')) as any;
    const inputB = (document.getElementById('merge-input-b')) as any;
    const conflictList = document.getElementById('merge-conflict-list');
    const applyBtn = (document.getElementById('merge-apply-btn')) as any;
    const statusA = document.getElementById('merge-status-a');
    const statusB = document.getElementById('merge-status-b');
    if (inputA)
        inputA.value = '';
    if (inputB)
        inputB.value = '';
    if (conflictList)
        conflictList.innerHTML = '';
    if (applyBtn)
        applyBtn.disabled = true;
    if (statusA)
        statusA.textContent = '';
    if (statusB)
        statusB.textContent = '';
    openModal('merge-modal');
}
/**
 * Load current browser state as Model A.
 * Carrega estado atual do navegador como Modelo A.
 */
function handleLoadCurrentAsA() {
    try {
        modelA = buildModel();
        const statusA = document.getElementById('merge-status-a');
        if (statusA) {
            statusA.innerHTML = `${getIcon('check', { size: '12px' })} ${t('currentModel') || 'Current model'} (${ /** @type {any} */(modelA).elements?.length || 0} elements)`;
            statusA.className = 'merge-status merge-status-ok';
        }
        const inputA = (document.getElementById('merge-input-a')) as any;
        if (inputA)
            inputA.value = '[Current Model State]';
        inputA?.setAttribute('readonly', String(true));
    }
    catch (err: any) {
        log.error('Failed to use current model as base', /** @type {any} */ (err)?.message);
        showToast(`Error: ${ /** @type {any} */(err)?.message}`, 'error');
    }
}
/**
 * Parse and load Model A from textarea.
 * Decodifica e carrega Modelo A a partir do textarea.
 */
async function handleLoadModelA() {
    const inputA = (document.getElementById('merge-input-a')) as any;
    if (!inputA?.value?.trim()) {
        showToast(t('emptyInput') || 'Please paste a key or JSON', 'warning');
        return;
    }
    try {
        modelA = await _parseMergeInput(inputA.value.trim());
        const statusA = document.getElementById('merge-status-a');
        if (statusA) {
            statusA.innerHTML = `${getIcon('check', { size: '12px' })} ${t('modelLoaded') || 'Model loaded'} (${ /** @type {any} */(modelA).elements?.length || 0} elements)`;
            statusA.className = 'merge-status merge-status-ok';
        }
    }
    catch (err: any) {
        log.error('Model A load failed', /** @type {any} */ (err)?.message);
        const statusA = document.getElementById('merge-status-a');
        if (statusA) {
            statusA.innerHTML = `${getIcon('x', { size: '12px' })} ${escapeHtml(/** @type {any} */ (err)?.message)}`;
            statusA.className = 'merge-status merge-status-error';
        }
    }
}
/**
 * Parse and load Model B from textarea.
 * Decodifica e carrega Modelo B a partir do textarea.
 */
async function handleLoadModelB() {
    const inputB = (document.getElementById('merge-input-b')) as any;
    if (!inputB?.value?.trim()) {
        showToast(t('emptyInput') || 'Please paste a key or JSON', 'warning');
        return;
    }
    try {
        modelB = await _parseMergeInput(inputB.value.trim());
        const statusB = document.getElementById('merge-status-b');
        if (statusB) {
            statusB.innerHTML = `${getIcon('check', { size: '12px' })} ${t('modelLoaded') || 'Model loaded'} (${ /** @type {any} */(modelB).elements?.length || 0} elements)`;
            statusB.className = 'merge-status merge-status-ok';
        }
    }
    catch (err: any) {
        log.error('Model B load failed', /** @type {any} */ (err)?.message);
        const statusB = document.getElementById('merge-status-b');
        if (statusB) {
            statusB.innerHTML = `${getIcon('x', { size: '12px' })} ${escapeHtml(/** @type {any} */ (err)?.message)}`;
            statusB.className = 'merge-status merge-status-error';
        }
    }
}
/**
 * Execute diff between loaded models.
 * Executa diferenciacao entre modelos carregados.
 */
function handleRunDiff() {
    if (!modelA || !modelB) {
        showToast(t('loadBothModels') || 'Load both models before comparing', 'warning');
        return;
    }
    try {
        decisions = {};
        currentDiff = diffModels(modelA, modelB);
        renderConflictList(currentDiff, decisions, handleDecisionChange);
        const cd = (currentDiff) as any;
        if (cd.stats.total === 0) {
            showToast(t('noConflicts') || 'Models are identical', 'info');
        }
        else {
            showToast(`${cd.stats.total} ${t('differencesFound') || 'differences found'}`, 'info');
        }
        const applyBtn = (document.getElementById('merge-apply-btn')) as any;
        if (applyBtn)
            applyBtn.disabled = false;
    }
    catch (err: any) {
        log.error('Diff execution failed', /** @type {any} */ (err)?.message);
        showToast(`Diff error: ${ /** @type {any} */(err)?.message}`, 'error');
    }
}
/**
 * Accept Input A's value for a specific conflict.
 * Aceita valor do Input A para um conflito especifico.
 *
 * @param {string} key - Conflict key path
 */
function handleMergeAcceptA(key: string) {
    /** @type {any} */ (decisions)[key] = 'A';
    updateCardState(key, 'A');
    if (currentDiff)
        updateMergeSummary(currentDiff, decisions);
}
/**
 * Accept Input B's value for a specific conflict.
 * Aceita valor do Input B para um conflito especifico.
 *
 * @param {string} key - Conflict key path
 */
function handleMergeAcceptB(key: string) {
    /** @type {any} */ (decisions)[key] = 'B';
    updateCardState(key, 'B');
    if (currentDiff)
        updateMergeSummary(currentDiff, decisions);
}
/**
 * Accept all conflicts as A.
 * Aceita todos os conflitos como A.
 */
function handleAcceptAllA() {
    if (!currentDiff)
        return;
    fillAllDecisions('A');
    renderConflictList(currentDiff, decisions, handleDecisionChange);
    showToast(t('allAcceptedA') || 'All conflicts resolved as Input A', 'success');
}
/**
 * Accept all conflicts as B.
 * Aceita todos os conflitos como B.
 */
function handleAcceptAllB() {
    if (!currentDiff)
        return;
    fillAllDecisions('B');
    renderConflictList(currentDiff, decisions, handleDecisionChange);
    showToast(t('allAcceptedB') || 'All conflicts resolved as Input B', 'success');
}
/**
 * Apply the merged model to the current state.
 * Aplica o modelo mesclado ao estado atual.
 */
function handleApplyMerge() {
    if (!modelA || !modelB || !currentDiff) {
        showToast(t('runDiffFirst') || 'Run diff first', 'warning');
        return;
    }
    const ownership = requireOwnershipPermission('merge');
    if (!ownership.ok) {
        _appendMergeAudit({
            actor: ownership.actor || 'anonymous',
            role: ownership.role,
            strict: window.__ecbyts_mergeStrictOverride !== false,
            blocked: true,
            reason: 'ownership_denied',
        });
        showToast(t('auth.actionDenied') || (ownership as any).error, 'error');
        return;
    }
    try {
        const { merged, delta } = mergeModels(modelA, modelB, decisions, currentDiff);
        applyModel(merged);
        requestMergeUIRefresh('merge.applied');
        closeModal('merge-modal');
        showToast(t('mergeComplete') || 'Merge applied successfully', 'success');
        // Store delta for potential export
        window._lastMergeDelta = buildDelta(delta);
        // D18/D19: executar acoes pos-merge (terreno, aerial) se wizard solicitou
        const postActions = window._postMergeActions;
        if (postActions?.generateTerrain) {
            showToast(t('generatingTerrain') || 'Generating terrain surface...', 'info');
            import('../../core/interpolation/manager.js' as string)
                .then((mod: any) => {
                const terrainOpts = postActions.generateAerial === false ? { textureMode: 'colorRamp' } : {};
                /** @type {any} */ (mod).createTerrainLayer(/** @type {any} */ (terrainOpts))
                    .then(() => {
                    mod.applyTerrainElevationToElements?.();
                    window.fitAllElements?.();
                    showToast(t('terrainReady') || 'Terrain surface ready', 'success');
                })
                    .catch((err: any) => {
                    log.warn('Terrain generation failed', err?.message);
                    showToast('Terrain generation failed: ' + err?.message, 'warning');
                });
            })
                .catch((err: any) => {
                log.warn('Terrain module load failed', err?.message);
                showToast(t('terrainModuleError') || 'Terrain module unavailable', 'warning');
            });
        }
        delete window._postMergeActions;
        delete window._lastVirtualModel;
        delete window._lastCurrentModel;
    }
    catch (err: any) {
        log.error('Merge apply failed', /** @type {any} */ (err)?.message);
        showToast(`Merge error: ${ /** @type {any} */(err)?.message}`, 'error');
    }
}
/**
 * Export the last merge delta log as JSON file.
 * Exporta log de transformacoes do ultimo merge.
 */
function handleExportDelta() {
    const delta = window._lastMergeDelta;
    if (!delta) {
        showToast(t('noDelta') || 'No merge delta available', 'warning');
        return;
    }
    const json = JSON.stringify(delta, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `merge-delta-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(t('deltaExported') || 'Delta log exported', 'success');
}
// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------
function handleDecisionChange(key: any, decision: any) {
    /** @type {any} */ (decisions)[key] = decision;
    if (currentDiff)
        updateMergeSummary(currentDiff, decisions);
}
/**
 * Fill all conflict decisions with a single choice.
 */
function fillAllDecisions(choice: any) {
    if (!currentDiff)
        return;
    const decs = (decisions) as any;
    for (const [, section] of Object.entries(/** @type {any} */ (currentDiff).sections)) {
        const s = (section) as any;
        if (s.changes) {
            for (const change of s.changes) {
                decs[change.path.join('.')] = choice;
            }
        }
        if (s.added) {
            for (const item of s.added) {
                const sectionName = findSectionName(currentDiff, s);
                decs[`${sectionName}.${item.id}._add`] = choice;
            }
        }
        if (s.removed) {
            for (const item of s.removed) {
                const sectionName = findSectionName(currentDiff, s);
                decs[`${sectionName}.${item.id}._remove`] = choice;
            }
        }
        if (s.modified) {
            for (const mod of s.modified) {
                for (const change of mod.changes || []) {
                    decs[change.path.join('.')] = choice;
                }
            }
        }
    }
}
function findSectionName(diff: any, section: any) {
    for (const [name, sec] of Object.entries(/** @type {any} */ (diff).sections)) {
        if (sec === section)
            return name;
    }
    return 'unknown';
}
// ----------------------------------------------------------------
// PROGRAMMATIC PRELOAD - Usado pelo wizard de ingestao para
// alimentar o merge com modelo atual vs modelo importado.
// ----------------------------------------------------------------
function renderMergeStatusBadge(model: any, translationKey: string, fallback: string) {
    const count = model?.elements?.length || 0;
    return `${getIcon('check', { size: '12px' })} ${t(translationKey) || fallback} (${count} elements)`;
}

function updateWizardStatusPanels(a: any, b: any) {
    const statusA = document.getElementById('merge-status-a');
    if (statusA) {
        statusA.innerHTML = renderMergeStatusBadge(a, 'currentModel', 'Current model');
        statusA.className = 'merge-status merge-status-ok';
    }
    const statusB = document.getElementById('merge-status-b');
    if (statusB) {
        const elementsCount = b?.elements?.length || 0;
        const campaignsCount = b?.campaigns?.length || 0;
        const label = `${t('importedData') || 'Imported data'} (${elementsCount} elements, ${campaignsCount} campaigns)`;
        statusB.innerHTML = `${getIcon('check', { size: '12px' })} ${label}`;
        statusB.className = 'merge-status merge-status-ok';
    }
}

function lockMergeTextareas(labelA: string, labelB: string) {
    const inputA = (document.getElementById('merge-input-a')) as HTMLInputElement | null;
    const inputB = (document.getElementById('merge-input-b')) as HTMLInputElement | null;
    if (inputA) {
        inputA.value = labelA;
        inputA.setAttribute('readonly', 'true');
    }
    if (inputB) {
        inputB.value = labelB;
        inputB.setAttribute('readonly', 'true');
    }
}

function updateWizardActionLabels() {
    const btnAllA = document.querySelector('[onclick*="handleAcceptAllA"]');
    const btnAllB = document.querySelector('[onclick*="handleAcceptAllB"]');
    if (btnAllA) {
        btnAllA.textContent = t('keepAllCurrent') || 'Keep All Current';
    }
    if (btnAllB) {
        btnAllB.textContent = t('acceptAllImported') || 'Accept All Imported';
    }
}

/**
 * Pre-carrega dois modelos no estado do merge e executa diff automaticamente.
 * Deve ser chamado APOS handleOpenMergeModal() (que reseta o estado).
 *
 * @param {Object} a - Modelo A (estado atual)
 * @param {Object} b - Modelo B (dados importados)
 */
function preloadMergeModels(a: any, b: any) {
    if (!a || !b) {
        showToast(t('mergeLoadBothModels') || 'Cannot open merge: model data missing', 'error');
        return;
    }
    _mergeFromWizard = true;
    modelA = a;
    modelB = b;
    updateWizardStatusPanels(a, b);
    lockMergeTextareas('[Current Model]', '[Imported Data]');
    updateWizardActionLabels();
    // Auto-trigger diff after modal is painted (avoid layout reads on transitioning modal)
    requestAnimationFrame(() => handleRunDiff());
}
/**
 * Retorna se o merge foi aberto pelo wizard de ingestao.
 * Usado pelo mergePanel para labels contextuais.
 */
export function isMergeFromWizard() {
    return _mergeFromWizard;
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export const mergeHandlers = {
    handleOpenMergeModal,
    handleLoadCurrentAsA,
    handleLoadModelA,
    handleLoadModelB,
    handleRunDiff,
    handleMergeAcceptA,
    handleMergeAcceptB,
    handleAcceptAllA,
    handleAcceptAllB,
    handleApplyMerge,
    handleExportDelta,
    preloadMergeModels,
};
