// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   OPTIMIZATION HANDLERS — Window-level functions for GA optimization
   Handlers para otimizacao prescritiva de rede de monitoramento
   ================================================================ */
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
import { escapeHtml } from '../helpers/html.js';
import { hydrateIcons } from '../ui/icons.js';
import { getElementCostDefaults, getCostCatalog } from '../../core/ingestion/documents/costCatalog.js';
import { createLogger } from '../helpers/logger.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
const log = createLogger('Optimization');
/** @type {any} */
let requestOptimizationUIRefreshRef: any = null;
/** @type {any} */
let _runHandle: any = null;
/**
 * Inject full-refresh callback reference.
 * @param {Function} fn
 */
export function setOptimizationRequestUIRefresh(fn: any) {
    requestOptimizationUIRefreshRef = fn;
}
function requestOptimizationUIRefresh(reason = 'optimization.changed') {
    if (!requestOptimizationUIRefreshRef)
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
        requestOptimizationUIRefreshRef(domain, reason);
    }
}
// ----------------------------------------------------------------
// OPEN / CLOSE MODAL
// ----------------------------------------------------------------
/**
 * Abre o modal de otimizacao GA.
 */
function handleOpenOptimizationModal() {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('optimization')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    let modal = document.getElementById('optimization-modal');
    if (!modal) {
        modal = _createModal();
        document.body.appendChild(modal);
    }
    _populateDefaults();
    modal.style.display = 'flex';
    hydrateIcons(modal);
}
/**
 * Fecha o modal de otimizacao.
 */
function handleCloseOptimizationModal() {
    const modal = document.getElementById('optimization-modal');
    if (modal)
        modal.style.display = 'none';
    // Reseta resultado
    const resultsDiv = document.getElementById('opt-results');
    if (resultsDiv)
        resultsDiv.innerHTML = '';
    const progressDiv = document.getElementById('opt-progress');
    if (progressDiv) {
        progressDiv.style.display = 'none';
        progressDiv.innerHTML = '';
    }
}
// ----------------------------------------------------------------
// RUN OPTIMIZATION
// ----------------------------------------------------------------
/**
 * Coleta params do modal e executa otimizacao.
 */
async function handleRunOptimization() {
    const { getAllElements } = await import('../../core/elements/manager.js' as string);
    const optMod = (await import('../../core/analytics/optimization/index.js' as string)) as any;
    const { runOptimizationAsync, isOptimizationRunning } = optMod;
    if (isOptimizationRunning()) {
        showToast(t('optimization.alreadyRunning') || 'Optimization already running', 'warning');
        return;
    }
    // Coleta elementos existentes para coordenadas
    const elements = getAllElements();
    const existingPoints = elements
        .filter((e: any) => e.family !== 'boundary' && e.family !== 'blueprint' && e.data)
        .map((e: any) => ({
        x: e.data.x ?? e.data.position?.x ?? 0,
        z: e.data.z ?? e.data.position?.z ?? 0,
    }));
    // Bounds: usa boundary se existir, senao usa extent dos elementos
    const bounds = _getBounds(elements);
    if (!bounds) {
        showToast(t('optimization.noBounds') || 'No area defined. Add elements or a boundary first.', 'error');
        return;
    }
    // Leitura dos inputs do modal
    /** @param {string} id @returns {string} */
    const _val = (id: any) => (document.getElementById(id) as any)?.value ?? '';
    const numCandidates = parseInt(_val('opt-num-candidates')) || 3;
    const maxBudget = parseFloat(_val('opt-max-budget')) || 100000;
    const horizonYears = parseInt(_val('opt-horizon')) || 5;
    const generations = parseInt(_val('opt-generations')) || 500;
    const populationSize = parseInt(_val('opt-population')) || 100;
    const depthMin = parseInt(_val('opt-depth-min')) || 15;
    const depthMax = parseInt(_val('opt-depth-max')) || 80;
    const wUncertainty = parseFloat(_val('opt-w-uncertainty')) || 0.7;
    const wCost = parseFloat(_val('opt-w-cost')) || 0.3;
    // Cost defaults do catalogo
    const wellCosts = getElementCostDefaults('well') || { drilling: 350, installation: 2500, decommission: 1500 };
    const catalog = getCostCatalog();
    // APP zones (futuro: extrair de blueprints/compliance)
    /** @type {any[]} */
    const appZones: any[] = [];
    const config = {
        existingPoints,
        bounds,
        numCandidates,
        maxBudget,
        costDefaults: wellCosts,
        avgAnalyticalCost: catalog.defaultAnalyticalCost || 200,
        numReadingsPerYear: 4,
        horizonYears,
        escalationRate: catalog.escalationRate || 0.05,
        appZones,
        weights: { uncertainty: wUncertainty, cost: wCost },
        populationSize,
        generations,
        depthRange: [depthMin, depthMax],
        seed: Date.now() % 100000,
    };
    // UI: Mostra progresso
    const btnRun = (document.getElementById('opt-btn-run')) as any;
    const btnCancel = (document.getElementById('opt-btn-cancel')) as any;
    const progressDiv = document.getElementById('opt-progress');
    const resultsDiv = document.getElementById('opt-results');
    if (btnRun)
        btnRun.disabled = true;
    if (btnCancel)
        btnCancel.style.display = 'inline-block';
    if (progressDiv) {
        progressDiv.style.display = 'block';
        progressDiv.innerHTML = '<span class="opt-spinner"></span> Running GA...';
    }
    if (resultsDiv)
        resultsDiv.innerHTML = '';
    try {
        const handle = await runOptimizationAsync(config, (gen: any, bestFit: any, avgFit: any) => {
            if (progressDiv) {
                const pct = Math.round((gen / generations) * 100);
                progressDiv.innerHTML = `<span class="opt-spinner"></span> Gen ${gen}/${generations} (${pct}%) &#183; Best: ${bestFit.toFixed(4)} &#183; Avg: ${avgFit.toFixed(4)}`;
            }
        });
        _runHandle = null;
        _showResults(handle.result, numCandidates, maxBudget);
        if (progressDiv)
            progressDiv.style.display = 'none';
        showToast(t('optimization.complete') || 'Optimization complete', 'success');
    }
    catch (err: any) {
        const e = (err) as any;
        log.error('Optimization run failed', e?.message);
        showToast(e?.message, 'error');
        if (progressDiv) {
            progressDiv.innerHTML = `<span style="color:var(--danger)">Error: ${escapeHtml(e?.message)}</span>`;
        }
    }
    finally {
        if (btnRun)
            btnRun.disabled = false;
        if (btnCancel)
            btnCancel.style.display = 'none';
    }
}
/**
 * Cancela otimizacao em andamento.
 */
async function handleCancelOptimization() {
    const optMod = (await import('../../core/analytics/optimization/index.js' as string)) as any;
    const { cancelOptimization } = optMod;
    if (_runHandle) {
        cancelOptimization(_runHandle);
        _runHandle = null;
    }
    const btnRun = (document.getElementById('opt-btn-run')) as any;
    const btnCancel = (document.getElementById('opt-btn-cancel')) as any;
    const progressDiv = document.getElementById('opt-progress');
    if (btnRun)
        btnRun.disabled = false;
    if (btnCancel)
        btnCancel.style.display = 'none';
    if (progressDiv) {
        progressDiv.innerHTML = 'Cancelled.';
        setTimeout(() => {
            if (progressDiv)
                progressDiv.style.display = 'none';
        }, 2000);
    }
    showToast(t('optimization.cancelled') || 'Optimization cancelled', 'info');
}
/**
 * Aplica resultado: cria elementos well nas posicoes sugeridas.
 */
async function handleApplyOptimizationResult() {
    const { addNewElement } = await import('../../core/elements/manager.js' as string);
    const container = (document.getElementById('opt-results')) as any;
    if (!container || !container._lastResult) {
        showToast('No results to apply', 'warning');
        return;
    }
    const result = container._lastResult;
    let count = 0;
    for (const gene of result.best.genes) {
        const el = addNewElement('well');
        if (el) {
            el.data.x = gene.x;
            el.data.z = gene.z;
            el.data.depth = gene.depth;
            el.name = `Opt-Well-${count + 1}`;
            el.label = `Opt-Well-${count + 1}`;
            el.data.position = { x: gene.x, y: 0, z: gene.z };
            count++;
        }
    }
    requestOptimizationUIRefresh('optimization.result-applied');
    handleCloseOptimizationModal();
    showToast(`${count} ${t('optimization.wellsCreated') || 'optimized wells created'}`, 'success');
}
// ----------------------------------------------------------------
// PRIVATE - UI helpers
// ----------------------------------------------------------------
/**
 * Calcula bounds a partir dos elementos (boundary > extent dos pontos).
 */
/**
 * @param {any[]} elements
 */
function _getBounds(elements: any) {
    // Tenta boundary primeiro
    const boundary = elements.find((e: any) => e.family === 'boundary');
    if (boundary?.data?.vertices?.length >= 3) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const v of boundary.data.vertices) {
            if (v.x < minX)
                minX = v.x;
            if (v.x > maxX)
                maxX = v.x;
            if (v.z !== undefined ? v.z : v.y) {
                const z = v.z !== undefined ? v.z : v.y;
                if (z < minZ)
                    minZ = z;
                if (z > maxZ)
                    maxZ = z;
            }
        }
        if (isFinite(minX))
            return { minX, maxX, minZ, maxZ };
    }
    // Fallback: extent dos elementos
    const pts = elements.filter((e: any) => e.data && (e.data.x !== undefined || e.data.position));
    if (pts.length < 2)
        return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const e of pts) {
        const x = e.data.x ?? e.data.position?.x ?? 0;
        const z = e.data.z ?? e.data.position?.z ?? 0;
        if (x < minX)
            minX = x;
        if (x > maxX)
            maxX = x;
        if (z < minZ)
            minZ = z;
        if (z > maxZ)
            maxZ = z;
    }
    // Expande 20% para evitar candidatos na borda
    const pad = Math.max(maxX - minX, maxZ - minZ) * 0.2;
    return {
        minX: minX - pad,
        maxX: maxX + pad,
        minZ: minZ - pad,
        maxZ: maxZ + pad,
    };
}
/**
 * Preenche valores default no modal.
 */
function _populateDefaults() {
    const catalog = getCostCatalog();
    const wellCosts = (getElementCostDefaults('well') || {}) as any;
    _setVal('opt-num-candidates', 3);
    _setVal('opt-max-budget', 100000);
    _setVal('opt-horizon', 5);
    _setVal('opt-generations', 500);
    _setVal('opt-population', 100);
    _setVal('opt-depth-min', 15);
    _setVal('opt-depth-max', 80);
    _setVal('opt-w-uncertainty', 0.7);
    _setVal('opt-w-cost', 0.3);
    _setVal('opt-drilling-cost', wellCosts.drilling || 350);
    _setVal('opt-install-cost', wellCosts.installation || 2500);
    _setVal('opt-analytical-cost', catalog.defaultAnalyticalCost || 200);
}
/**
 * @param {string} id
 * @param {any} val
 */
function _setVal(id: any, val: any) {
    const el = (document.getElementById(id)) as any;
    if (el)
        el.value = val;
}
/**
 * Mostra resultados da otimizacao no modal.
 */
/**
 * @param {any} result
 * @param {number} numCandidates
 * @param {number} maxBudget
 */
function _showResults(result: any, numCandidates: any, maxBudget: any) {
    const container = (document.getElementById('opt-results')) as any;
    if (!container)
        return;
    container._lastResult = result;
    const costBk = result.costBreakdown;
    const stats = result.stats;
    const uncRed = (result.uncertaintyReduction * 100).toFixed(1);
    const budgetUsed = ((costBk.totalCost / maxBudget) * 100).toFixed(1);
    let html = `
        <div class="opt-result-summary">
            <h4>${t('optimization.results') || 'Optimization Results'}</h4>
            <div class="opt-kpi-grid">
                <div class="opt-kpi">
                    <span class="opt-kpi-value">${numCandidates}</span>
                    <span class="opt-kpi-label">${t('optimization.candidates') || 'Candidates'}</span>
                </div>
                <div class="opt-kpi">
                    <span class="opt-kpi-value">${uncRed}%</span>
                    <span class="opt-kpi-label">${t('optimization.uncReduction') || 'Uncertainty Reduction'}</span>
                </div>
                <div class="opt-kpi">
                    <span class="opt-kpi-value">R$ ${costBk.totalCost.toLocaleString()}</span>
                    <span class="opt-kpi-label">${t('optimization.totalCost') || 'Total Cost'} (${budgetUsed}%)</span>
                </div>
                <div class="opt-kpi">
                    <span class="opt-kpi-value">${stats.convergenceMs}ms</span>
                    <span class="opt-kpi-label">${t('optimization.time') || 'Time'}</span>
                </div>
            </div>

            <table class="opt-result-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>X</th>
                        <th>Z</th>
                        <th>${t('depth') || 'Depth'} (m)</th>
                        <th>CAPEX</th>
                        <th>OPEX</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>`;
    for (let i = 0; i < costBk.perCandidate.length; i++) {
        const c = costBk.perCandidate[i];
        html += `
                    <tr>
                        <td>${i + 1}</td>
                        <td>${c.x.toFixed(1)}</td>
                        <td>${c.z.toFixed(1)}</td>
                        <td>${c.depth}</td>
                        <td>R$ ${c.capex.toLocaleString()}</td>
                        <td>R$ ${c.opexTotal.toLocaleString()}</td>
                        <td>R$ ${c.total.toLocaleString()}</td>
                    </tr>`;
    }
    html += `
                </tbody>
            </table>

            <div class="opt-actions-row">
                <button class="btn btn-primary" data-cc-action="cc-f75c98d2">
                    <span class="icon" data-icon="check"></span>
                    ${t('optimization.apply') || 'Apply — Create Wells'}
                </button>
            </div>
        </div>`;
    container.innerHTML = html;
    hydrateIcons(container);
}
/**
 * Cria o HTML do modal de otimizacao (injeta no DOM).
 */
function _createModal() {
    // B2 migração 2026-05-29: .modal-overlay → .ecbt-overlay + .ecbt-dialog--md.
    // Drena #3: max-width:680px;max-height:90vh inline → clamp via tokens.
    const modal = document.createElement('div');
    modal.id = 'optimization-modal';
    modal.className = 'ecbt-overlay';
    modal.style.display = 'none';
    modal.onclick = (e) => {
        if (e.target === modal)
            handleCloseOptimizationModal();
    };
    modal.innerHTML = `
    <div class="ecbt-dialog ecbt-dialog--md optimization-dialog">
        <div class="ecbt-dialog-header">
            <h3>
                <span class="icon" data-icon="target"></span>
                ${t('optimization.title') || 'Network Optimization (GA)'}
            </h3>
            <button class="ecbt-dialog-close" data-cc-action="cc-3e525366">&times;</button>
        </div>

        <div class="ecbt-dialog-body" style="padding: 16px;">
            <!-- Scenario -->
            <fieldset class="opt-fieldset">
                <legend>${t('optimization.scenario') || 'Scenario'}</legend>
                <div class="opt-form-grid">
                    <label>${t('optimization.numCandidates') || 'New wells to propose'}
                        <input data-field-meta="true" data-field-meta-key="auto:opt-num-candidates" type="number" id="opt-num-candidates" min="1" max="20" value="3">
                    </label>
                    <label>${t('optimization.budget') || 'Max budget (R$)'}
                        <input data-field-meta="true" data-field-meta-key="auto:opt-max-budget" type="number" id="opt-max-budget" min="1000" step="1000" value="100000">
                    </label>
                    <label>${t('optimization.horizon') || 'Horizon (years)'}
                        <input data-field-meta="true" data-field-meta-key="auto:opt-horizon" type="number" id="opt-horizon" min="1" max="30" value="5">
                    </label>
                </div>
            </fieldset>

            <!-- Depth -->
            <fieldset class="opt-fieldset">
                <legend>${t('optimization.depth') || 'Depth Range (m)'}</legend>
                <div class="opt-form-grid">
                    <label>Min
                        <input data-field-meta="true" data-field-meta-key="auto:opt-depth-min" type="number" id="opt-depth-min" min="1" max="500" value="15">
                    </label>
                    <label>Max
                        <input data-field-meta="true" data-field-meta-key="auto:opt-depth-max" type="number" id="opt-depth-max" min="1" max="500" value="80">
                    </label>
                </div>
            </fieldset>

            <!-- Weights -->
            <fieldset class="opt-fieldset">
                <legend>${t('optimization.weights') || 'Objective Weights'}</legend>
                <div class="opt-form-grid">
                    <label>${t('optimization.wUncertainty') || 'Uncertainty weight'}
                        <input data-field-meta="true" data-field-meta-key="auto:opt-w-uncertainty" type="number" id="opt-w-uncertainty" min="0" max="1" step="0.1" value="0.7">
                    </label>
                    <label>${t('optimization.wCost') || 'Cost weight'}
                        <input data-field-meta="true" data-field-meta-key="auto:opt-w-cost" type="number" id="opt-w-cost" min="0" max="1" step="0.1" value="0.3">
                    </label>
                </div>
            </fieldset>

            <!-- Advanced (collapsible) -->
            <details class="opt-advanced">
                <summary>${t('optimization.advanced') || 'Advanced GA Parameters'}</summary>
                <div class="opt-form-grid" style="margin-top: 8px;">
                    <label>${t('optimization.generations') || 'Generations'}
                        <input data-field-meta="true" data-field-meta-key="auto:opt-generations" type="number" id="opt-generations" min="10" max="5000" value="500">
                    </label>
                    <label>${t('optimization.population') || 'Population size'}
                        <input data-field-meta="true" data-field-meta-key="auto:opt-population" type="number" id="opt-population" min="10" max="1000" value="100">
                    </label>
                    <label>${t('optimization.drillingCost') || 'Drilling (R$/m)'}
                        <input data-field-meta="true" data-field-meta-key="auto:opt-drilling-cost" type="number" id="opt-drilling-cost" min="0" step="10" value="350">
                    </label>
                    <label>${t('optimization.installCost') || 'Install (R$)'}
                        <input data-field-meta="true" data-field-meta-key="auto:opt-install-cost" type="number" id="opt-install-cost" min="0" step="100" value="2500">
                    </label>
                    <label>${t('optimization.analyticalCost') || 'Analytical (R$/sample)'}
                        <input data-field-meta="true" data-field-meta-key="auto:opt-analytical-cost" type="number" id="opt-analytical-cost" min="0" step="10" value="200">
                    </label>
                </div>
            </details>

            <!-- Progress -->
            <div id="opt-progress" style="display: none; padding: 12px 0; font-family: monospace; font-size: 13px;"></div>

            <!-- Results -->
            <div id="opt-results"></div>
        </div>

        <div class="ecbt-dialog-footer" style="padding: 12px 16px; display: flex; gap: 8px; justify-content: flex-end;">
            <button id="opt-btn-cancel" class="btn btn-secondary" data-cc-action="cc-60c96cc7" style="display: none;">
                ${t('cancel') || 'Cancel'}
            </button>
            <button id="opt-btn-run" class="btn btn-primary" data-cc-action="cc-8c62c696">
                <span class="icon" data-icon="play"></span>
                ${t('optimization.run') || 'Run Optimization'}
            </button>
        </div>
    </div>`;
    return modal;
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export const optimizationHandlers = {
    handleOpenOptimizationModal,
    handleCloseOptimizationModal,
    handleRunOptimization,
    handleCancelOptimization,
    handleApplyOptimizationResult,
};
