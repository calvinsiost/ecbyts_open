// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// @ts-check
/* ================================================================
   Uncertainty Hub — Analyses tab panel
   Progressive disclosure: Ver (resumo) -> Explorar (drivers/diff)
   -> Ajustar (policy editor + timeline). Handlers reused from
   utils/handlers/governance.js (handleGetUncertaintyHubState,
   handleRunUncertaintyHubEvaluation, handleSaveUncertaintyPolicyRevision,
   handleRollbackUncertaintyPolicyRevision, handleListUncertaintyPolicyHistory,
   handleExportUncertaintyEvidence, handleImportUncertaintyEvidence,
   handleSyncUncertaintyHubEcbtKey, handleCanManageUncertaintyPolicies).
   ================================================================ */
import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { showToast } from './toast.js';
import { asyncConfirm, asyncPrompt } from './asyncDialogs.js';
import { t } from '../i18n/translations.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
const MODE_KEY = 'ecbyts-unc-hub-mode';
const RAW_VISIBLE_KEY = 'ecbyts-unc-hub-raw-visible';
const CHART_TOGGLE_KEY = 'ecbyts-unc-hub-chart-visible';
const MODAL_ID = 'uncertainty-hub-modal';
let _tornadoChart: any = null;
let _containerRef: any = null;
// ----------------------------------------------------------------
// Modal lifecycle - center-screen overlay (2026-04-12)
// ----------------------------------------------------------------
/**
 * Open the Uncertainty Hub as a center-screen modal overlay.
 * Creates the modal on first call, re-uses and re-hydrates afterwards.
 */
export async function openUncertaintyHubModal() {
    let modal = /** @type {any} */ (document.getElementById(MODAL_ID));
    if (!modal) {
        modal = _buildModal();
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    syncDeepLinkUrl('uncertainty-hub');
    try {
        await hydrateUncertaintyHubPanel();
    }
    catch (err: any) {
        console.error('[unc-hub-modal] hydrate on open failed:', err);
    }
}
/**
 * Close the modal without destroying it - state persists in IDB.
 */
export function closeUncertaintyHubModal() {
    const modal = (document.getElementById(MODAL_ID)) as any;
    if (modal)
        modal.style.display = 'none';
    clearDeepLinkUrl();
}
function _buildModal() {
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'unc-hub-modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Uncertainty Hub');
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="unc-hub-modal-dialog">
            <button type="button" class="unc-hub-modal-close" aria-label="${t('uncertaintyHub.close')}">&#x2715;</button>
            <div id="uncertainty-hub-container"></div>
        </div>
    `;
    // Close interactions
    modal.querySelector('.unc-hub-modal-close')?.addEventListener('click', closeUncertaintyHubModal);
    modal.addEventListener('click', (ev: any) => {
        if (ev.target === modal)
            closeUncertaintyHubModal();
    });
    document.addEventListener('keydown', (ev: any) => {
        if (ev.key === 'Escape' && modal.style.display === 'flex') {
            closeUncertaintyHubModal();
        }
    });
    // Render the panel into its container inside the modal
    const host = (modal.querySelector('#uncertainty-hub-container')) as any;
    if (host)
        renderUncertaintyHubPanel(host);
    return modal;
}
/**
 * Render skeleton of the Uncertainty Hub into the given container.
 * Call once on panel init; data hydrates via hydrateUncertaintyHub().
 * @param {HTMLElement} container
 */
export function renderUncertaintyHubPanel(container: any) {
    if (!container)
        return;
    _containerRef = container;
    const activeMode = _getPersistedMode();
    container.innerHTML = `
        <section class="unc-hub" aria-label="Uncertainty Hub">
            <header class="unc-hub-header">
                <h4 class="unc-hub-title">
                    ${t('uncertaintyHub.title')}
                    <button type="button" class="unc-hub-help-btn" id="unc-hub-help-btn"
                        aria-label="${t('uncertaintyHub.openGlossary')}" title="${t('uncertaintyHub.glossaryTooltip')}" >?</button>
                    <span class="unc-hub-scope" id="unc-hub-scope-label">${t('uncertaintyHub.scopeLoading')}</span>
                </h4>
                <label class="unc-hub-toggle" title="${t('uncertaintyHub.showUncertaintyTooltip')}">
                    <input data-field-meta="true" data-field-meta-key="auto-pos:uncertaintyHubPanel:input:L112" type="checkbox" id="unc-hub-show-uncertainty-toggle" />
                    <span>${t('uncertaintyHub.showUncertaintyOnAllScreens')}</span>
                </label>
                <div class="unc-hub-modes" role="tablist" aria-label="${t('uncertaintyHub.modeOfUse')}">
                    <button class="unc-hub-mode" role="tab" data-mode="view"
                        aria-pressed="${activeMode === 'view'}"
                        title="${t('uncertaintyHub.viewTooltip')}">${t('uncertaintyHub.view')}</button>
                    <button class="unc-hub-mode" role="tab" data-mode="explore"
                        aria-pressed="${activeMode === 'explore'}"
                        title="${t('uncertaintyHub.exploreTooltip')}">${t('uncertaintyHub.explore')}</button>
                    <button class="unc-hub-mode" role="tab" data-mode="adjust"
                        aria-pressed="${activeMode === 'adjust'}"
                        title="${t('uncertaintyHub.adjustTooltip')}">${t('uncertaintyHub.adjust')}</button>
                </div>
            </header>
            <!-- Legacy banner: shown if observations inherit uncertainty (yellow badge) -->
            <div class="unc-hub-legacy-banner" id="unc-hub-legacy-banner" hidden>
                <span class="unc-hub-legacy-banner-icon" aria-hidden="true">⚠</span>
                <span class="unc-hub-legacy-banner-text">
                    <strong id="unc-hub-legacy-count">0</strong>
                    ${t('uncertaintyHub.legacyObservations')}
                </span>
                <button type="button" class="unc-hub-legacy-banner-dismiss"
                    id="unc-hub-legacy-banner-dismiss" aria-label="${t('uncertaintyHub.dismiss')}">&#x2715;</button>
            </div>
            <!-- MODO: VER -->
            <div class="unc-hub-mode-content" data-mode="view" data-active="${activeMode === 'view'}">
                <p class="unc-hub-intro unc-hub-intro-compact" id="unc-hub-intro-ver">
                    ${t('uncertaintyHub.introView')}
                </p>
                <!-- Empty state: prominent CTA before any run -->
                <div class="unc-hub-empty-cta" id="unc-hub-empty-cta">
                    <div class="unc-hub-empty-cta-icon" aria-hidden="true">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                            <circle cx="12" cy="12" r="9"></circle>
                            <path d="M12 7v5l3 2"></path>
                        </svg>
                    </div>
                    <div class="unc-hub-empty-cta-body">
                        <h5>${t('uncertaintyHub.readyToCalculate')}</h5>
                        <p>${t('uncertaintyHub.runFirstAnalysisDescription')}</p>
                        <button type="button" class="unc-hub-empty-cta-btn"
                            id="unc-hub-empty-cta-btn">${t('uncertaintyHub.runFirstAnalysis')}</button>
                    </div>
                </div>
                <!-- Cards executivos (gap #6 — R$ passivo/ativo ± + EIS ±) -->
                <div class="unc-hub-exec-cards" id="unc-hub-exec-cards">
                    <div class="unc-hub-exec-card" data-kind="liability">
                        <span class="unc-hub-exec-label">${t('uncertaintyHub.environmentalLiability')}</span>
                        <span class="unc-hub-exec-value" id="unc-hub-exec-liability">R$ —</span>
                        <span class="unc-hub-exec-pm" id="unc-hub-exec-liability-pm">± —</span>
                        <span class="unc-hub-exec-hint">${t('uncertaintyHub.ci95Gum')}</span>
                    </div>
                    <div class="unc-hub-exec-card" data-kind="asset">
                        <span class="unc-hub-exec-label">${t('uncertaintyHub.assetValue')}</span>
                        <span class="unc-hub-exec-value" id="unc-hub-exec-asset">R$ —</span>
                        <span class="unc-hub-exec-pm" id="unc-hub-exec-asset-pm">± —</span>
                        <span class="unc-hub-exec-hint">${t('uncertaintyHub.ci95Corporate')}</span>
                    </div>
                    <div class="unc-hub-exec-card" data-kind="eis">
                        <span class="unc-hub-exec-label">${t('uncertaintyHub.eisScore')}</span>
                        <span class="unc-hub-exec-value" id="unc-hub-exec-eis">—</span>
                        <span class="unc-hub-exec-pm" id="unc-hub-exec-eis-pm">± —</span>
                        <span class="unc-hub-exec-hint">${t('uncertaintyHub.ci95Tccca')}</span>
                    </div>
                </div>
                <div class="unc-hub-summary" id="unc-hub-summary" hidden>
                    <div class="unc-hub-class" data-class="unknown" id="unc-hub-class-card">
                        <span class="unc-hub-class-dot" id="unc-hub-class-dot" aria-hidden="true">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <circle cx="12" cy="12" r="7"/>
                            </svg>
                        </span>
                        <span class="unc-hub-class-label" id="unc-hub-class-label">${t('uncertaintyHub.noData')}</span>
                        <span class="unc-hub-class-action" id="unc-hub-class-action">${t('uncertaintyHub.clickRecalculate')}</span>
                    </div>
                    <div class="unc-hub-kpis">
                        <div class="unc-hub-kpi">
                            <span class="unc-hub-kpi-label">${t('uncertaintyHub.exceedanceProbability')}</span>
                            <span class="unc-hub-kpi-value" id="unc-hub-kpi-exceedance">—</span>
                            <span class="unc-hub-kpi-delta" id="unc-hub-kpi-exceedance-delta"></span>
                        </div>
                        <div class="unc-hub-kpi">
                            <span class="unc-hub-kpi-label">${t('uncertaintyHub.monitoredPoints')}</span>
                            <span class="unc-hub-kpi-value" id="unc-hub-kpi-selected">—</span>
                            <span class="unc-hub-kpi-delta" id="unc-hub-kpi-selected-delta"></span>
                        </div>
                        <div class="unc-hub-kpi">
                            <span class="unc-hub-kpi-label">${t('uncertaintyHub.relativeUQ2Q')}</span>
                            <span class="unc-hub-kpi-value" id="unc-hub-kpi-urel">—</span>
                            <span class="unc-hub-kpi-delta" id="unc-hub-kpi-urel-delta"></span>
                        </div>
                    </div>
                    <div class="unc-hub-mc-promo" id="unc-hub-mc-promo" aria-live="polite">
                        <span class="unc-hub-mc-promo-dot" id="unc-hub-mc-promo-dot" aria-hidden="true">&#9679;</span>
                        <span class="unc-hub-mc-promo-label">${t('uncertaintyHub.mcPromotionLabel')}</span>
                        <span class="unc-hub-mc-promo-text" id="unc-hub-mc-promo-text">${t('uncertaintyHub.mcTier1Ok')}</span>
                    </div>
                </div>
                <div class="unc-hub-sparkline-wrap" id="unc-hub-sparkline-wrap" style="display:none;">
                    <div class="unc-hub-sparkline-head">
                        <span class="unc-hub-sparkline-title">${t('uncertaintyHub.executionHistory')}</span>
                        <span class="unc-hub-sparkline-meta" id="unc-hub-sparkline-meta">—</span>
                    </div>
                    <svg class="unc-hub-sparkline" id="unc-hub-sparkline"
                        viewBox="0 0 200 40" preserveAspectRatio="none"
                        aria-label="${t('uncertaintyHub.exceedanceProbHistory')}"></svg>
                </div>
            </div>

            <!-- MODO: EXPLORAR -->
            <div class="unc-hub-mode-content" data-mode="explore" data-active="${activeMode === 'explore'}">
                <p class="unc-hub-intro">
                    ${t('uncertaintyHub.introExplore')}
                </p>
                <div class="unc-hub-section">
                    <h5 class="unc-hub-section-title">
                        ${t('uncertaintyHub.propagation')}
                        <span class="unc-hub-section-title-help">
                            ${t('uncertaintyHub.propagationHelp')}
                        </span>
                    </h5>
                    <p class="unc-hub-section-desc">${t('uncertaintyHub.propagationDesc')}</p>
                    <div class="unc-hub-tree" id="unc-hub-propagation-tree">
                        <div class="unc-hub-empty">${t('uncertaintyHub.noExecutionYet')}</div>
                    </div>
                </div>

                <div class="unc-hub-section">
                    <h5 class="unc-hub-section-title">
                        ${t('uncertaintyHub.drivers')}
                                <span class="unc-hub-section-title-help">${t('uncertaintyHub.driversHelp')}</span>
                        <button class="unc-hub-chart-toggle" id="unc-hub-chart-toggle"
                            aria-pressed="false" title="${t('uncertaintyHub.toggleTornadoChart')}">${t('uncertaintyHub.chart')}</button>
                    </h5>
                    <p class="unc-hub-section-desc">${t('uncertaintyHub.driversDesc')}</p>
                    <table class="unc-hub-drivers-table" id="unc-hub-drivers-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>${t('uncertaintyHub.candidate')}</th>
                                <th>${t('uncertaintyHub.score')}</th>
                                <th style="width:40%">${t('uncertaintyHub.impact')}</th>
                            </tr>
                        </thead>
                        <tbody id="unc-hub-drivers-tbody">
                            <tr><td colspan="4" class="unc-hub-empty">${t('uncertaintyHub.noDriversYet')}</td></tr>
                        </tbody>
                    </table>
                    <div class="unc-hub-tornado" id="unc-hub-tornado-wrapper">
                        <canvas id="unc-hub-tornado-canvas"></canvas>
                    </div>
                </div>

                <div class="unc-hub-section">
                    <h5 class="unc-hub-section-title">
                        ${t('uncertaintyHub.beforeAfter')}
                        <span class="unc-hub-section-title-help">${t('uncertaintyHub.beforeAfterHelp')}</span>
                    </h5>
                    <p class="unc-hub-section-desc">${t('uncertaintyHub.beforeAfterDesc')}</p>
                    <div class="unc-hub-diff" id="unc-hub-diff">
                        <div class="unc-hub-diff-side" data-changed="false">
                            <span class="unc-hub-diff-side-label">${t('uncertaintyHub.before')}</span>
                            <span class="unc-hub-diff-side-value" id="unc-hub-diff-before">—</span>
                        </div>
                        <div class="unc-hub-diff-arrow" aria-hidden="true">&rarr;</div>
                        <div class="unc-hub-diff-side" data-changed="false">
                            <span class="unc-hub-diff-side-label">${t('uncertaintyHub.after')}</span>
                            <span class="unc-hub-diff-side-value" id="unc-hub-diff-after">—</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- MODO: AJUSTAR -->
            <div class="unc-hub-mode-content" data-mode="adjust" data-active="${activeMode === 'adjust'}">
                <p class="unc-hub-intro">
                    ${t('uncertaintyHub.introAdjust')}
                </p>
                <div class="unc-hub-perm-warning" id="unc-hub-perm-warning" style="display:none;">
                    ${t('uncertaintyHub.readOnlyMode')}
                </div>
                <form class="unc-hub-policy-form" id="unc-hub-policy-form" data-cc-submit="cc-0eba2421">
                    <div class="unc-hub-field">
                        <label class="unc-hub-field-label" for="unc-hub-f-matrix">${t('uncertaintyHub.matrix')}</label>
                        <select data-field-meta="true" data-field-meta-key="auto:unc-hub-f-matrix" id="unc-hub-f-matrix">
                            <option value="groundwater">${t('uncertaintyHub.groundwater')}</option>
                            <option value="soil">${t('uncertaintyHub.soil')}</option>
                            <option value="air">${t('uncertaintyHub.air')}</option>
                            <option value="surface_water">${t('uncertaintyHub.surfaceWater')}</option>
                            <option value="sediment">${t('uncertaintyHub.sediment')}</option>
                        </select>
                        <span class="unc-hub-field-hint">${t('uncertaintyHub.matrixHint')}</span>
                    </div>
                    <div class="unc-hub-field">
                        <label class="unc-hub-field-label" for="unc-hub-f-q2q">${t('uncertaintyHub.qualitativeClassQ2Q')}</label>
                        <select data-field-meta="true" data-field-meta-key="auto:unc-hub-f-q2q" id="unc-hub-f-q2q">
                            <option value="very_low">${t('uncertaintyHub.veryLow')}</option>
                            <option value="low">${t('uncertaintyHub.low')}</option>
                            <option value="medium">${t('uncertaintyHub.medium')}</option>
                            <option value="high">${t('uncertaintyHub.high')}</option>
                            <option value="very_high">${t('uncertaintyHub.veryHigh')}</option>
                        </select>
                        <span class="unc-hub-field-hint">${t('uncertaintyHub.q2qHint')}</span>
                    </div>
                    <div class="unc-hub-field">
                        <label class="unc-hub-field-label" for="unc-hub-f-coverage">${t('uncertaintyHub.coverage')}</label>
                        <input data-field-meta="true" data-field-meta-key="auto:unc-hub-f-coverage" id="unc-hub-f-coverage" type="number" step="0.01" min="0" max="1" />
                        <span class="unc-hub-field-hint">${t('uncertaintyHub.coverageHint')}</span>
                    </div>
                    <div class="unc-hub-field">
                        <label class="unc-hub-field-label" for="unc-hub-f-exceedance">${t('uncertaintyHub.exceedanceProbabilityShort')}</label>
                        <input data-field-meta="true" data-field-meta-key="auto:unc-hub-f-exceedance" id="unc-hub-f-exceedance" type="number" step="0.01" min="0" max="1" />
                        <span class="unc-hub-field-hint">${t('uncertaintyHub.exceedanceHint')}</span>
                    </div>

                    <details class="unc-hub-advanced">
                        <summary>${t('uncertaintyHub.advancedParameters')}</summary>
                        <div class="unc-hub-advanced-body">
                            <div class="unc-hub-field">
                                <label class="unc-hub-field-label" for="unc-hub-f-k">${t('uncertaintyHub.kFactor')}</label>
                                <input data-field-meta="true" data-field-meta-key="auto:unc-hub-f-k" id="unc-hub-f-k" type="number" step="0.1" min="0" />
                                <span class="unc-hub-field-hint">${t('uncertaintyHub.kHint')}</span>
                            </div>
                            <div class="unc-hub-field">
                                <label class="unc-hub-field-label" for="unc-hub-f-mc">${t('uncertaintyHub.monteCarloSamples')}</label>
                                <input data-field-meta="true" data-field-meta-key="auto:unc-hub-f-mc" id="unc-hub-f-mc" type="number" step="1" min="1" />
                                <span class="unc-hub-field-hint">${t('uncertaintyHub.mcHint')}</span>
                            </div>
                            <div class="unc-hub-field">
                                <label class="unc-hub-field-label" for="unc-hub-f-seed">${t('uncertaintyHub.seedOptimization')}</label>
                                <input data-field-meta="true" data-field-meta-key="auto:unc-hub-f-seed" id="unc-hub-f-seed" type="number" step="1" />
                                <span class="unc-hub-field-hint">${t('uncertaintyHub.seedHint')}</span>
                            </div>
                            <div class="unc-hub-field">
                                <label class="unc-hub-field-label" for="unc-hub-f-budget">${t('uncertaintyHub.budget')}</label>
                                <input data-field-meta="true" data-field-meta-key="auto:unc-hub-f-budget" id="unc-hub-f-budget" type="number" step="1" min="0" />
                                <span class="unc-hub-field-hint">${t('uncertaintyHub.budgetHint')}</span>
                            </div>
                            <div class="unc-hub-field" style="grid-column: 1 / -1;">
                                <label class="unc-hub-field-label" for="unc-hub-f-candidates">
                                    ${t('uncertaintyHub.candidatesCsv')}
                                </label>
                                <textarea data-field-meta="true" data-field-meta-key="auto:unc-hub-f-candidates" id="unc-hub-f-candidates" rows="3"
                                    style="font-family: var(--font-mono, monospace); font-size: 11px;"></textarea>
                                <span class="unc-hub-field-hint">
                                    ${t('uncertaintyHub.candidatesFormat')}
                                    <strong>${t('uncertaintyHub.infoGain')}</strong> ${t('uncertaintyHub.infoGainDesc')}
                                    <strong>${t('uncertaintyHub.normalizedCost')}</strong> ${t('uncertaintyHub.normalizedCostDesc')}
                                    <strong>${t('uncertaintyHub.residualRisk')}</strong> ${t('uncertaintyHub.residualRiskDesc')}
                                    <strong>${t('uncertaintyHub.cost')}</strong> ${t('uncertaintyHub.costDesc')}
                                </span>
                            </div>
                            <div class="unc-hub-field">
                                <label class="unc-hub-field-label" for="unc-hub-f-project">${t('uncertaintyHub.projectIdOverride')}</label>
                                <input data-field-meta="true" data-field-meta-key="auto:unc-hub-f-project" id="unc-hub-f-project" type="text" placeholder="${t('common.optional')}" />
                                <span class="unc-hub-field-hint">${t('uncertaintyHub.projectHint')}</span>
                            </div>
                        </div>
                    </details>

                    <div class="unc-hub-policy-footer">
                        <span class="unc-hub-policy-footer-note">
                            ${t('uncertaintyHub.precedence')}
                        </span>
                        <button type="button" class="btn btn-sm btn-primary"
                            id="unc-hub-save-revision-btn">
                            ${t('uncertaintyHub.saveRevision')}
                        </button>
                    </div>
                </form>

                <div class="unc-hub-section" style="margin-top: 10px;">
                    <h5 class="unc-hub-section-title">
                        ${t('uncertaintyHub.policyTimeline')}
                        <span class="unc-hub-section-title-help">${t('uncertaintyHub.auditRollback')}</span>
                    </h5>
                    <div class="unc-hub-timeline" id="unc-hub-timeline">
                        <div class="unc-hub-timeline-empty">${t('uncertaintyHub.noRevisionsYetShort')}</div>
                    </div>
                </div>
            </div>

            <!-- Action bar fixa -->
            <footer class="unc-hub-footer-bar">
                <span class="unc-hub-footer-status" id="unc-hub-status" data-state="idle">${t('uncertaintyHub.ready')}</span>
                <div class="unc-hub-actions">
                    <button class="btn btn-sm btn-primary" id="unc-hub-recalc-btn">${t('uncertaintyHub.recalculate')}</button>
                    <button class="btn btn-sm btn-secondary" id="unc-hub-export-btn">${t('uncertaintyHub.exportEvidence')}</button>
                    <button class="btn btn-sm btn-secondary" id="unc-hub-import-btn">${t('uncertaintyHub.import')}</button>
                    <button class="btn btn-sm btn-secondary" id="unc-hub-sync-btn" title="${t('uncertaintyHub.syncEcbt')}">&#128273; ${t('uncertaintyHub.syncEcbt')}</button>
                    <button class="unc-hub-raw-toggle" id="unc-hub-raw-toggle">${t('uncertaintyHub.viewRawJson')}</button>
                </div>
            </footer>
            <pre class="unc-hub-raw" id="unc-hub-raw" data-visible="false">{}</pre>
            <input id="unc-hub-evidence-file-input" type="file" accept="application/json,.json" hidden />

            <!-- Glossário — aberto via botão "?" no header -->
            <div class="unc-hub-glossary" id="unc-hub-glossary" hidden>
                <div class="unc-hub-glossary-head">
                    <h5>${t('uncertaintyHub.glossaryTitle')}</h5>
                    <button type="button" class="unc-hub-glossary-close"
                        id="unc-hub-glossary-close" aria-label="${t('uncertaintyHub.closeAria')}">&#x2715;</button>
                </div>
                <dl class="unc-hub-glossary-body">
                    <dt>EIS</dt>
                    <dd>Environmental Integrity Score — índice 3CTA+ de integridade
                        ambiental (0..5). Calculado com 6 eixos não-compensatórios via
                        média geométrica ponderada.</dd>
                    <dt>GUM</dt>
                    <dd>Guide to the Expression of Uncertainty in Measurement (JCGM 100).
                        Padrão ISO para quantificar incerteza combinada em medições.</dd>
                    <dt>MC / Monte Carlo</dt>
                    <dd>Propagação de incerteza por amostragem repetida (JCGM 101). Gera
                        N realizações dos inputs e computa a distribuição do output.</dd>
                    <dt>LHS</dt>
                    <dd>Latin Hypercube Sampling — amostragem estratificada que garante
                        cobertura uniforme do espaço amostral em menos iterações que
                        Monte Carlo puro (Helton &amp; Davis 2003).</dd>
                    <dt>Q2Q</dt>
                    <dd>Qualitative-to-Quantitative mapping — converte classes textuais
                        (baixa, média, alta) em incerteza relativa numérica. Usado quando
                        medição direta é indisponível. Ver JCGM 101 Anexo B.</dd>
                    <dt>U / U relativa</dt>
                    <dd><em>U</em> = incerteza expandida (U = k·u<sub>c</sub>).
                        <em>U relativa</em> = U / |y| (adimensional, comparável entre
                        parâmetros).</dd>
                    <dt>Fator k</dt>
                    <dd>Fator de abrangência. Multiplica a incerteza combinada
                        u<sub>c</sub> para gerar U no IC desejado. k=2 ≈ 95%; k=3 ≈ 99%.
                        Distribuições não-normais podem requerer k ajustado.</dd>
                    <dt>IC 95%</dt>
                    <dd>Intervalo de confiança 95% — range [2.5%, 97.5%] da distribuição
                        do output. Valor padrão regulatório (CETESB, CONAMA, EPA).</dd>
                    <dt>Prob. excedência</dt>
                    <dd>P(medida &gt; limite regulatório). Se alta (≥0.6), regra emite
                        <em>warn</em>; se muito alta (≥0.8), <em>block</em> (bloqueia
                        publicação). Thresholds configuráveis na policy.</dd>
                    <dt>Policy</dt>
                    <dd>Conjunto versionado de parâmetros (matriz, coverage, k,
                        thresholds, candidatos) que governa um cálculo de incerteza.
                        Sujeita a precedência: project_override &gt; matrix &gt; workspace_default.</dd>
                    <dt>Sobol S1 / ST</dt>
                    <dd>Índices de sensibilidade (Saltelli 2010). <em>S1</em> = fração da
                        variância do output explicada por uma variável <em>sozinha</em>;
                        <em>ST</em> = fração total (inclui interações). ST−S1 &gt; 0.1
                        sinaliza interação não-linear importante.</dd>
                    <dt>ALCOA++</dt>
                    <dd>Attributable, Legible, Contemporaneous, Original, Accurate
                        (+ Complete, Consistent, Enduring, Available). Padrão FDA/ANVISA
                        para registros de dados auditáveis — base do timeline de revisões.</dd>
                    <dt>CONAMA 420 / CETESB DD-256</dt>
                    <dd>Resoluções brasileiras definindo Valores de Referência (VR), de
                        Prevenção (VP) e de Intervenção (VI) para solo e água subterrânea.</dd>
                    <dt>ECBT Key</dt>
                    <dd>Formato de export/import criptografado da ecbyts. Sync ECBT
                        salva a evidência como artefato verificável em Supabase + IDB.</dd>
                </dl>
            </div>
        </section>
    `;
    _wireModeSwitcher(container);
    _wireActions(container);
}
/**
 * Hydrate panel with current state. Safe to call multiple times.
 */
export async function hydrateUncertaintyHubPanel() {
    if (!_containerRef)
        return;
    const getState = window.handleGetUncertaintyHubState;
    if (typeof getState !== 'function') {
        _setStatus('Handlers indisponíveis', 'stale');
        return;
    }
    try {
        const state = await getState();
        const canManage = typeof window.handleCanManageUncertaintyPolicies === 'function'
            ? !!window.handleCanManageUncertaintyPolicies()
            : false;
        _renderState(state, canManage);
        await _renderTimeline(canManage);
        await _refreshExecCards();
        // UNC-001 P2 - registra hash canônico do SQL para drift detection.
        // Fire-and-forget: nunca bloqueia hydrate se offline/sem auth.
        import('../../core/uncertainty/hubStore.js' as string)
            .then((/** @type {any} */ mod) => mod.fetchAndRegisterSqlPolicies?.())
            .catch((/** @type {any} */ err) => console.debug('[unc-hub] sql policies fetch skipped:', err?.message));
    }
    catch (err: any) {
        console.error('[unc-hub] hydrate error:', err);
        _setStatus(`Erro: ${ /** @type {any} */(err)?.message || err}`, 'stale');
    }
}
// ----------------------------------------------------------------
// Internal: wire interactions
// ----------------------------------------------------------------
/**
 * @param {any} container
 */
function _wireModeSwitcher(container: any) {
    /** @type {any} */ (container.querySelectorAll('.unc-hub-mode')).forEach((btn: any) => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode || '';
            _switchMode(mode);
        });
    });
}
/**
 * @param {any} mode
 */
function _switchMode(mode: any) {
    if (!_containerRef)
        return;
    /** @type {any} */ (_containerRef.querySelectorAll('.unc-hub-mode')).forEach((b: any) => {
        b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    });
    /** @type {any} */ (_containerRef.querySelectorAll('.unc-hub-mode-content')).forEach((c: any) => {
        c.dataset.active = String(c.dataset.mode === mode);
    });
    try {
        localStorage.setItem(MODE_KEY, mode);
    }
    catch (e: any) {
        console.debug('[uncertaintyHub] persistMode:', /** @type {any} */ (e)?.message || e);
        /* no-op */
    }
    if (mode === 'explore') {
        _maybeRenderTornado();
    }
}
function _getPersistedMode() {
    try {
        const v = localStorage.getItem(MODE_KEY) || '';
        if (v === 'view' || v === 'explore' || v === 'adjust')
            return v;
    }
    catch (e: any) {
        console.debug('[uncertaintyHub] readPersistedMode:', /** @type {any} */ (e)?.message || e);
        /* no-op */
    }
    return 'view';
}
/**
 * @param {any} container
 */
function _wireActions(container: any) {
    container.querySelector('#unc-hub-recalc-btn')?.addEventListener('click', _onRecalc);
    container.querySelector('#unc-hub-export-btn')?.addEventListener('click', _onExport);
    container.querySelector('#unc-hub-import-btn')?.addEventListener('click', () => {
        container.querySelector('#unc-hub-evidence-file-input')?.click();
    });
    container.querySelector('#unc-hub-evidence-file-input')?.addEventListener('change', _onImportFile);
    container.querySelector('#unc-hub-sync-btn')?.addEventListener('click', _onSyncEcbt);
    container.querySelector('#unc-hub-save-revision-btn')?.addEventListener('click', _onSaveRevision);
    container.querySelector('#unc-hub-raw-toggle')?.addEventListener('click', _onToggleRaw);
    container.querySelector('#unc-hub-chart-toggle')?.addEventListener('click', _onToggleChart);
    // Glossary toggle
    container.querySelector('#unc-hub-help-btn')?.addEventListener('click', _onToggleGlossary);
    container.querySelector('#unc-hub-glossary-close')?.addEventListener('click', _onToggleGlossary);
    container.querySelector('#unc-hub-empty-cta-btn')?.addEventListener('click', _onRecalc);
    // Phase 1c - global "show uncertainty everywhere" toggle
    const showUToggle = (container.querySelector('#unc-hub-show-uncertainty-toggle')) as any;
    if (showUToggle) {
        showUToggle.checked = _readShowUncertainty();
        showUToggle.addEventListener('change', (ev: any) => {
            _writeShowUncertainty(!!ev.target.checked);
            document.documentElement.dataset.ecbytsShowU = ev.target.checked ? '1' : '0';
        });
        // Reflect initial state on <html> so other modules can react
        document.documentElement.dataset.ecbytsShowU = showUToggle.checked ? '1' : '0';
    }
    // Legacy banner dismiss
    container.querySelector('#unc-hub-legacy-banner-dismiss')?.addEventListener('click', () => {
        const b = _q('#unc-hub-legacy-banner');
        if (b)
            b.hidden = true;
    });
}
const SHOW_U_KEY = 'ecbyts-show-uncertainty';
function _readShowUncertainty() {
    try {
        return localStorage.getItem(SHOW_U_KEY) === '1';
    }
    catch (e: any) {
        console.debug('[uncertaintyHub] readShowUncertainty:', /** @type {any} */ (e)?.message || e);
        return false;
    }
}
/**
 * @param {any} v
 */
function _writeShowUncertainty(v: any) {
    try {
        localStorage.setItem(SHOW_U_KEY, v ? '1' : '0');
    }
    catch (e: any) {
        console.debug('[uncertaintyHub] writeShowUncertainty:', /** @type {any} */ (e)?.message || e);
        /* no-op */
    }
}
function _onToggleGlossary() {
    const gl = _q('#unc-hub-glossary');
    if (!gl)
        return;
    gl.hidden = !gl.hidden;
}
// ----------------------------------------------------------------
// Internal: render state
// ----------------------------------------------------------------
/**
 * @param {any} state
 * @param {any} canManage
 */
function _renderState(state: any, canManage: any) {
    if (!_containerRef || !state)
        return;
    const last = state?.lastResults || null;
    // Empty-state CTA vs populated summary toggle
    const emptyCta = _q('#unc-hub-empty-cta');
    const summary = _q('#unc-hub-summary');
    if (emptyCta && summary) {
        const hasData = !!last;
        emptyCta.hidden = hasData;
        summary.hidden = !hasData;
    }
    // Legacy banner - count observations with inherited+null uncertainty
    _renderLegacyBanner().catch((/** @type {any} */ e) => console.debug('[unc-hub:banner]', e?.message));
    // Scope label
    const matrix = state?.policyDraft?.matrix || 'n/a';
    const project = state?.policyDraft?.project_id || '(workspace default)';
    const scopeEl = _q('#unc-hub-scope-label');
    if (scopeEl)
        scopeEl.textContent = t('uncertaintyHub.matrixProject', { matrix, project });
    // VIEW: class card
    const classInfo = _deriveClass(last);
    const card = _q('#unc-hub-class-card');
    const label = _q('#unc-hub-class-label');
    const action = _q('#unc-hub-class-action');
    if (card)
        card.dataset.class = classInfo.cls;
    if (card) /** @type {any} */
        (card.querySelector('.unc-hub-class-dot')).innerHTML = classInfo.dot;
    if (label)
        label.textContent = classInfo.label;
    if (action)
        action.textContent = classInfo.action;
    // VIEW: KPIs
    const exceedance = Number(last?.propagation?.exceedance_input);
    _setText('#unc-hub-kpi-exceedance', Number.isFinite(exceedance) ? exceedance.toFixed(2) : '—');
    const selected = Array.isArray(last?.optimization?.selected) ? last.optimization.selected.length : 0;
    _setText('#unc-hub-kpi-selected', last ? String(selected) : '—');
    const urel = last?.propagation?.q2q_u_rel;
    _setText('#unc-hub-kpi-urel', Number.isFinite(urel) ? Number(urel).toFixed(3) : '—');
    // Diff deltas (selected count)
    const delta = last?.diff?.selectedCountDelta;
    const deltaEl = _q('#unc-hub-kpi-selected-delta');
    if (deltaEl) {
        if (Number.isFinite(delta) && delta !== 0) {
            deltaEl.textContent = t('uncertaintyHub.vsPrevious', { sign: delta > 0 ? '+' : '', delta });
            deltaEl.className = 'unc-hub-kpi-delta ' + (delta > 0 ? 'up' : 'down');
        }
        else {
            deltaEl.textContent = '';
            deltaEl.className = 'unc-hub-kpi-delta';
        }
    }
    // VIEW: Phase-3 matrix-aware MC promotion recommendation (UNC-001)
    _renderMcPromotion(last, state?.policyDraft?.matrix).catch((/** @type {any} */ e) => console.debug('[unc-hub:mc-promo]', e?.message));
    // VIEW: sparkline history
    _renderSparkline(state?.resultsHistory || []);
    // EXPLORE: propagation tree
    _renderPropagationTree(last?.propagation || {});
    // EXPLORE: drivers table
    _renderDrivers(last?.sensitivity?.topDrivers || []);
    // EXPLORE: diff
    const diffBefore = last?.diff?.decision?.before ?? '—';
    const diffAfter = last?.diff?.decision?.after ?? '—';
    _setText('#unc-hub-diff-before', diffBefore);
    _setText('#unc-hub-diff-after', diffAfter);
    const sides = (_containerRef.querySelectorAll('.unc-hub-diff-side')) as any;
    const changed = !!last?.diff?.decisionActionChanged;
    sides.forEach((s: any) => {
        s.dataset.changed = String(changed);
    });
    // ADJUST: form fields
    const draft = state?.policyDraft || {};
    _setVal('#unc-hub-f-matrix', draft.matrix || 'groundwater');
    _setVal('#unc-hub-f-q2q', state?.q2qInput?.label || 'medium');
    _setVal('#unc-hub-f-coverage', draft.coverage ?? 0.95);
    _setVal('#unc-hub-f-exceedance', state?.decisionInput?.exceedanceProb ?? 0.5);
    _setVal('#unc-hub-f-k', draft.k_default ?? 2);
    _setVal('#unc-hub-f-mc', draft.monte_carlo_samples ?? 2000);
    _setVal('#unc-hub-f-seed', state?.optimizationInput?.seed ?? 123);
    _setVal('#unc-hub-f-budget', state?.optimizationInput?.budget ?? 100);
    _setVal('#unc-hub-f-candidates', state?.optimizationInput?.candidatesRaw || '');
    _setVal('#unc-hub-f-project', draft.project_id || '');
    // Permissions UI
    const warn = _q('#unc-hub-perm-warning');
    const saveBtn = _q('#unc-hub-save-revision-btn');
    if (warn)
        warn.style.display = canManage ? 'none' : 'block';
    if (saveBtn) {
        saveBtn.disabled = !canManage;
        saveBtn.title = canManage ? '' : t('uncertaintyHub.permissionRequired') || 'Permissão necessária';
    }
    // Raw JSON
    const raw = _q('#unc-hub-raw');
    if (raw)
        raw.textContent = JSON.stringify(last || { status: t('uncertaintyHub.noExecution') }, null, 2);
    // Status
    if (last?.executedAt) {
        const age = _humanAge(new Date(last.executedAt));
        _setStatus(`Última execução: ${age}`, 'ok');
    }
    else {
        _setStatus('Pronto — sem execução', 'idle');
    }
    // Restore chart toggle state
    try {
        const chartOn = (localStorage.getItem(CHART_TOGGLE_KEY) || '') === '1';
        const toggle = _q('#unc-hub-chart-toggle');
        const wrap = _q('#unc-hub-tornado-wrapper');
        if (toggle)
            toggle.setAttribute('aria-pressed', String(chartOn));
        if (wrap)
            wrap.dataset.visible = String(chartOn);
        if (chartOn)
            _maybeRenderTornado();
    }
    catch (e: any) {
        console.debug('[uncertaintyHub] restoreChartToggle:', /** @type {any} */ (e)?.message || e);
        /* no-op */
    }
    // Restore raw toggle
    try {
        const rawOn = (localStorage.getItem(RAW_VISIBLE_KEY) || '') === '1';
        if (raw)
            raw.dataset.visible = String(rawOn);
    }
    catch (e: any) {
        console.debug('[uncertaintyHub] restoreRawToggle:', /** @type {any} */ (e)?.message || e);
        /* no-op */
    }
}
/**
 * @param {any} last
 */
function _deriveClass(last: any) {
    // SVG kept constant; CSS [data-class] drives color via `fill: currentColor`.
    const svg = '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="7"/></svg>';
    if (!last) {
        return { cls: 'unknown', dot: svg, label: 'SEM DADOS', action: 'Clique em Recalcular' };
    }
    const action = last?.decision?.action || last?.propagation?.rule_action || 'allow';
    if (action === 'block') {
        return { cls: 'red', dot: svg, label: 'CRÍTICO', action: 'Ação: publicação bloqueada' };
    }
    if (action === 'warn') {
        return { cls: 'yellow', dot: svg, label: 'ATENÇÃO', action: 'Ação: revisar drivers top' };
    }
    return { cls: 'green', dot: svg, label: 'ACEITÁVEL', action: 'Ação: seguir com decisão' };
}
/**
 * @param {any} propagation
 */
function _renderPropagationTree(propagation: any) {
    const el = _q('#unc-hub-propagation-tree');
    if (!el)
        return;
    const entries = Object.entries(propagation || {});
    if (entries.length === 0) {
        el.innerHTML = `<div class="unc-hub-empty">${t('uncertaintyHub.noExecutionYet')}</div>`;
        return;
    }
    el.innerHTML = entries
        .map(([k, v]) => `
            <span class="unc-hub-tree-node">
                <span class="unc-hub-tree-key">${escapeHtml(_humanKey(k))}:</span>
                <span class="unc-hub-tree-val">${escapeHtml(_formatVal(v))}</span>
            </span>
        `)
        .join('');
}
/**
 * @param {any} k
 */
function _humanKey(k: any) {
    /** @type {Record<string, string>} */
    const map = {
        policy_source: 'origem da policy',
        q2q_label: 'classe Q2Q',
        q2q_u_rel: 'U relativa',
        exceedance_input: 'prob. excedência',
        rule_action: 'ação da regra',
    };
    return (map as Record<string, any>)[k] || k;
}
/**
 * @param {any} v
 */
function _formatVal(v: any) {
    if (v === null || v === undefined)
        return '—';
    if (typeof v === 'number')
        return Number.isInteger(v) ? String(v) : v.toFixed(3);
    return String(v);
}
/**
 * UNC-001 Phase-3: render the matrix-aware MC promotion recommendation.
 * Pure decision (no MC run) — green dot = Tier 1 GUM adequate,
 * amber dot = Monte Carlo recommended with the firing trigger.
 * @param {any} last - last hub results (carries propagation chain/u_rel)
 * @param {any} matrix - environmental matrix from the policy draft
 * @returns {Promise<void>}
 */
async function _renderMcPromotion(last: any, matrix: any) {
    const row = _q('#unc-hub-mc-promo');
    const dot = _q('#unc-hub-mc-promo-dot');
    const txt = _q('#unc-hub-mc-promo-text');
    if (!row || !dot || !txt)
        return;
    const { evaluateMcPromotion } = await import('../../core/uncertainty/phase3MatrixAware.js' as string);
    const chain = Array.isArray(last?.propagation?.chain) ? last.propagation.chain : [];
    const inputs = Array.isArray(last?.propagation?.inputs) ? last.propagation.inputs : [];
    const ctx = {
        value: Number(last?.propagation?.value),
        u: Number(last?.propagation?.u),
        threshold: last?.propagation?.threshold ?? null,
    };
    const r = evaluateMcPromotion(chain, inputs, matrix, ctx);
    if (r && r.promote) {
        row.dataset.promote = 'true';
        dot.style.color = '#d97706';
        txt.textContent = t('uncertaintyHub.mcRecommended', { reason: r.reason });
    }
    else {
        row.dataset.promote = 'false';
        dot.style.color = 'var(--success)';
        txt.textContent = t('uncertaintyHub.mcTier1Ok');
    }
}
/**
 * @param {any} history
 */
function _renderSparkline(history: any) {
    const wrap = _q('#unc-hub-sparkline-wrap');
    const svg = _q('#unc-hub-sparkline');
    const meta = _q('#unc-hub-sparkline-meta');
    if (!wrap || !svg)
        return;
    const len = Array.isArray(history) ? history.length : 0;
    wrap.style.display = 'block';
    if (len < 2) {
        svg.innerHTML = '';
        if (meta) {
            meta.textContent =
                len === 0
                    ? 'Execute Recalcular — tendência aparece após 2ª análise'
                    : '1 execução registrada · tendência aparece na próxima';
        }
        wrap.setAttribute('data-empty', 'true');
        return;
    }
    wrap.removeAttribute('data-empty');
    const W = 200, H = 40, PAD = 2;
    const vals = history.map((h: any) => Number(h.exceedance) || 0);
    const min = Math.min(...vals, 0);
    const max = Math.max(...vals, 1);
    const range = Math.max(1e-6, max - min);
    const step = (W - 2 * PAD) / Math.max(1, history.length - 1);
    const pts = history.map((h: any, i: any) => {
        const x = PAD + i * step;
        const y = H - PAD - (((Number(h.exceedance) || 0) - min) / range) * (H - 2 * PAD);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const lastAction = history[history.length - 1]?.action || 'allow';
    const color = lastAction === 'block' ? '#ef4444' : lastAction === 'warn' ? '#f59e0b' : '#22c55e';
    const fillPts = `${PAD},${H - PAD} ${pts.join(' ')} ${W - PAD},${H - PAD}`;
    svg.innerHTML = `
        <polygon points="${fillPts}" fill="${color}" fill-opacity="0.15" stroke="none"/>
        <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5"/>
        ${history
        .map((h: any, i: any) => {
        const x = PAD + i * step;
        const y = H - PAD - (((Number(h.exceedance) || 0) - min) / range) * (H - 2 * PAD);
        const c = h.action === 'block' ? '#ef4444' : h.action === 'warn' ? '#f59e0b' : '#22c55e';
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.8" fill="${c}"/>`;
    })
        .join('')}
    `;
    if (meta) {
        meta.textContent =
            history.length === 1
                ? t('uncertaintyHub.executionHistory', { count: history.length })
                : t('uncertaintyHub.executionHistoryPlural', { count: history.length });
    }
}
/**
 * @param {any} drivers
 */
function _renderDrivers(drivers: any) {
    const tbody = _q('#unc-hub-drivers-tbody');
    if (!tbody)
        return;
    if (!Array.isArray(drivers) || drivers.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="4" class="unc-hub-empty">Sem drivers — rode um Recalcular com candidatos.</td></tr>';
        return;
    }
    const maxAbs = Math.max(1e-6, ...drivers.map((/** @type {any} */ d) => Math.abs(Number(d.score) || 0)));
    tbody.innerHTML = drivers
        .map((/** @type {any} */ d, i: any) => {
        const score = Number(d.score) || 0;
        const pct = Math.min(100, (Math.abs(score) / maxAbs) * 100);
        return `<tr>
                <td>${i + 1}</td>
                <td>${escapeHtml(String(d.id || 'unknown'))}</td>
                <td>${score.toFixed(3)}</td>
                <td><span class="unc-hub-driver-bar" style="width:${pct.toFixed(1)}%;"></span></td>
            </tr>`;
    })
        .join('');
}
/**
 * @param {any} canManage
 */
async function _renderTimeline(canManage: any) {
    const list = _q('#unc-hub-timeline');
    if (!list)
        return;
    const getHistory = window.handleListUncertaintyPolicyHistory;
    if (typeof getHistory !== 'function') {
        list.innerHTML = `<div class="unc-hub-timeline-empty">${t('uncertaintyHub.handlerUnavailable')}</div>`;
        return;
    }
    const rows = await getHistory();
    if (!Array.isArray(rows) || rows.length === 0) {
        list.innerHTML = `<div class="unc-hub-timeline-empty">${t('uncertaintyHub.noRevisionsYet')}</div>`;
        return;
    }
    list.innerHTML = rows
        .map((/** @type {any} */ r) => `
            <div class="unc-hub-timeline-item">
                <div class="unc-hub-timeline-meta">
                    <span class="unc-hub-timeline-id">${escapeHtml(r.revisionId || '')}</span>
                    <span class="unc-hub-timeline-date">${escapeHtml(_humanDate(r.savedAt))}</span>
                </div>
                <button class="btn btn-sm btn-secondary" data-action="rollback"
                    data-revision="${escapeAttr(r.revisionId || '')}"
                    ${canManage ? '' : `disabled title="${t('uncertaintyHub.permissionRequired')}"`}>Rollback</button>
            </div>
        `)
        .join('');
    /** @type {any} */ (list.querySelectorAll('button[data-action="rollback"]')).forEach((btn: any) => {
        btn.addEventListener('click', async () => {
            const ok = await asyncConfirm(`Reverter para a revisão ${btn.dataset.revision}? A policy atual será substituída.`, { confirmLabel: 'Rollback', cancelLabel: 'Cancelar', danger: true });
            if (!ok)
                return;
            const res = await window.handleRollbackUncertaintyPolicyRevision(btn.dataset.revision);
            if (res?.ok) {
                showToast(t('uncertaintyHub.policyReverted'), 'success');
                await hydrateUncertaintyHubPanel();
            }
            else {
                showToast(t('uncertaintyHub.rollbackFailed', { reason: res?.reason || 'error' }), 'error');
            }
        });
    });
}
// ----------------------------------------------------------------
// Internal: action handlers
// ----------------------------------------------------------------
async function _onRecalc() {
    if (typeof window.handleRunUncertaintyHubEvaluation !== 'function') {
        showToast(t('uncertaintyHub.recalcHandlerUnavailable'), 'error');
        return;
    }
    _setStatus('Calculando…', 'idle');
    try {
        const payload = _collectFormPayload();
        await window.handleRunUncertaintyHubEvaluation(payload);
        await hydrateUncertaintyHubPanel();
        showToast(t('uncertaintyHub.analysisRecalculated'), 'success');
    }
    catch (err: any) {
        console.error('[unc-hub] recalc error:', err);
        _setStatus(`Erro: ${ /** @type {any} */(err)?.message || err}`, 'stale');
        showToast(t('uncertaintyHub.recalcError', { message: /** @type {any} */ (err)?.message || err }), 'error');
    }
}
function _collectFormPayload() {
    /**
     * @param {any} event
     */
    const val = (id: any) => _q('#' + id)?.value;
    /**
     * @param {any} event
     * @param {any} def
     */
    const num = (id: any, def: any) => {
        const v = Number(val(id));
        return Number.isFinite(v) ? v : def;
    };
    return {
        policyDraft: {
            matrix: val('unc-hub-f-matrix') || 'groundwater',
            project_id: val('unc-hub-f-project') || null,
            coverage: num('unc-hub-f-coverage', 0.95),
            k_default: num('unc-hub-f-k', 2),
            monte_carlo_samples: num('unc-hub-f-mc', 2000),
        },
        q2qInput: {
            label: val('unc-hub-f-q2q') || 'medium',
            runType: 'exploratory',
        },
        decisionInput: {
            exceedanceProb: num('unc-hub-f-exceedance', 0.5),
            runType: 'exploratory',
        },
        optimizationInput: {
            seed: num('unc-hub-f-seed', 123),
            budget: num('unc-hub-f-budget', 100),
            candidatesRaw: val('unc-hub-f-candidates') || '',
        },
    };
}
async function _onExport() {
    if (typeof window.handleExportUncertaintyEvidence !== 'function')
        return;
    try {
        await window.handleExportUncertaintyEvidence();
    }
    catch (err: any) {
        showToast(t('uncertaintyHub.exportFailed', { message: /** @type {any} */ (err)?.message || err }), 'error');
    }
}
/**
 * @param {any} event
 */
async function _onImportFile(event: any) {
    const file = event?.target?.files?.[0];
    if (!file)
        return;
    try {
        const text = await file.text();
        const res = await window.handleImportUncertaintyEvidence(text);
        if (res?.ok) {
            showToast(t('uncertaintyHub.evidenceImported'), 'success');
            await hydrateUncertaintyHubPanel();
        }
        else {
            showToast(t('uncertaintyHub.importFailed', { reason: res?.reason || 'error' }), 'error');
        }
    }
    catch (err: any) {
        showToast(t('uncertaintyHub.importError', { message: /** @type {any} */ (err)?.message || err }), 'error');
    }
    finally {
        event.target.value = '';
    }
}
async function _onSyncEcbt() {
    if (typeof window.handleSyncUncertaintyHubEcbtKey !== 'function')
        return;
    try {
        await window.handleSyncUncertaintyHubEcbtKey();
        await hydrateUncertaintyHubPanel();
    }
    catch (err: any) {
        showToast(t('uncertaintyHub.syncError', { message: /** @type {any} */ (err)?.message || err }), 'error');
    }
}
async function _onSaveRevision() {
    if (typeof window.handleSaveUncertaintyPolicyRevision !== 'function')
        return;
    const note = await asyncPrompt(t('uncertaintyHub.revisionNotePrompt'), '', {
        placeholder: t('uncertaintyHub.adjustmentPlaceholder'),
        confirmLabel: 'Salvar',
    });
    if (note === null)
        return; // cancelled
    try {
        // Capture current form values into state before saving the revision
        await window.handleRunUncertaintyHubEvaluation(_collectFormPayload());
        const res = await window.handleSaveUncertaintyPolicyRevision({
            savedBy: 'ui-user',
            note: String(note || ''),
        });
        if (res?.ok) {
            showToast(t('uncertaintyHub.policyRevisionSaved'), 'success');
            await hydrateUncertaintyHubPanel();
        }
        else {
            showToast(t('uncertaintyHub.saveFailed', { reason: res?.reason || 'error' }), 'error');
        }
    }
    catch (err: any) {
        showToast(t('uncertaintyHub.errorWithMessage', { message: /** @type {any} */ (err)?.message || err }), 'error');
    }
}
function _onToggleRaw() {
    const raw = _q('#unc-hub-raw');
    if (!raw)
        return;
    const next = raw.dataset.visible !== 'true';
    raw.dataset.visible = String(next);
    try {
        localStorage.setItem(RAW_VISIBLE_KEY, next ? '1' : '0');
    }
    catch (e: any) {
        console.debug('[uncertaintyHub] persistRawToggle:', /** @type {any} */ (e)?.message || e);
        /* no-op */
    }
}
function _onToggleChart() {
    const toggle = _q('#unc-hub-chart-toggle');
    const wrap = _q('#unc-hub-tornado-wrapper');
    if (!toggle || !wrap)
        return;
    const next = toggle.getAttribute('aria-pressed') !== 'true';
    toggle.setAttribute('aria-pressed', String(next));
    wrap.dataset.visible = String(next);
    try {
        localStorage.setItem(CHART_TOGGLE_KEY, next ? '1' : '0');
    }
    catch (e: any) {
        console.debug('[uncertaintyHub] persistChartToggle:', /** @type {any} */ (e)?.message || e);
        /* no-op */
    }
    if (next)
        _maybeRenderTornado();
}
function _maybeRenderTornado() {
    const canvas = _q('#unc-hub-tornado-canvas');
    if (!canvas)
        return;
    if (typeof window.Chart !== 'function') {
        // Chart.js not loaded; fail gracefully - table still works
        return;
    }
    const tbodyRows = _containerRef?.querySelectorAll('#unc-hub-drivers-tbody tr') || [];
    const labels: any[] = [];
    const scores: any[] = [];
    tbodyRows.forEach((tr: any) => {
        const cells = (tr.querySelectorAll('td')) as any;
        if (cells.length >= 3) {
            labels.push(cells[1].textContent.trim());
            scores.push(Number(cells[2].textContent) || 0);
        }
    });
    if (labels.length === 0)
        return;
    if (_tornadoChart) {
        try {
            _tornadoChart.destroy();
        }
        catch (e: any) {
            console.debug('[uncertaintyHub] destroyTornadoChart:', /** @type {any} */ (e)?.message || e);
            /* no-op */
        }
        _tornadoChart = null;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    _tornadoChart = new window.Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Score',
                    data: scores,
                    backgroundColor: scores.map((s: any) => s >= 0 ? 'rgba(37, 99, 235, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
                    borderWidth: 0,
                },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { grid: { display: false } },
            },
        },
    });
}
// ----------------------------------------------------------------
// Internal: tiny DOM helpers
// ----------------------------------------------------------------
/**
 * @param {any} sel
 */
function _q(sel: any) {
    return _containerRef ? _containerRef.querySelector(sel) : null;
}
/**
 * @param {any} sel
 * @param {any} text
 */
function _setText(sel: any, text: any) {
    const el = _q(sel);
    if (el)
        el.textContent = String(text ?? '—');
}
/**
 * @param {any} sel
 * @param {any} value
 */
function _setVal(sel: any, value: any) {
    const el = _q(sel);
    if (el)
        el.value = value ?? '';
}
/**
 * @param {any} text
 * @param {any} state
 */
function _setStatus(text: any, state: any) {
    const el = _q('#unc-hub-status');
    if (!el)
        return;
    el.textContent = text;
    el.dataset.state = state || 'idle';
}
/**
 * @param {any} date
 */
function _humanAge(date: any) {
    const diffMs = Date.now() - date.getTime();
    if (!Number.isFinite(diffMs) || diffMs < 0)
        return date.toISOString();
    const s = Math.floor(diffMs / 1000);
    if (s < 60)
        return `há ${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60)
        return `há ${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24)
        return `há ${h}h`;
    return date.toLocaleString();
}
/**
 * @param {any} iso
 */
function _humanDate(iso: any) {
    if (!iso)
        return '';
    try {
        return new Date(iso).toLocaleString();
    }
    catch (e: any) {
        console.debug('[uncertaintyHub] formatHumanDate:', /** @type {any} */ (e)?.message || e);
        return String(iso);
    }
}
async function _renderLegacyBanner() {
    const banner = _q('#unc-hub-legacy-banner');
    const countEl = _q('#unc-hub-legacy-count');
    if (!banner || !countEl)
        return;
    try {
        const [{ getAllElements }, schemaMod] = await Promise.all([
            import('../../core/elements/manager.js' as string),
            import('../../core/uncertainty/observationSchema.js' as string),
        ]);
        const { isUncertaintyDeclared, migrateLegacyObservation } = schemaMod;
        const elements = typeof getAllElements === 'function' ? getAllElements() : [];
        let count = 0;
        for (const el of /** @type {any[]} */ (elements || [])) {
            const obs = Array.isArray(el?.observations) ? el.observations : [];
            for (const o of obs) {
                const migrated = migrateLegacyObservation(o);
                if (!isUncertaintyDeclared(migrated))
                    count++;
            }
        }
        countEl.textContent = String(count);
        banner.hidden = count === 0;
    }
    catch (_err: any) {
        banner.hidden = true;
    }
}
// ----------------------------------------------------------------
// Gap #6 - Executive cards data wiring (Passivo / Ativo / EIS)
// Pulls real values from costRollup + corporateIO + last EIS run.
// ----------------------------------------------------------------
async function _refreshExecCards() {
    if (!_containerRef)
        return;
    /**
     * @param {any} id
     * @param {any} text
     */
    const setText = (id: any, text: any) => {
        const el = (_containerRef.querySelector(`#${id}`)) as any;
        if (el)
            el.textContent = text;
    };
    /**
     * @param {any} n
     */
    const fmtBRL = (n: any) => Number.isFinite(n)
        ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
        : 'R$ —';
    // Passivo ambiental - custo total do rollup (GUM U expandida quando houver)
    try {
        const { buildCostRollupWithUncertainty } = await import('../../core/analytics/economics/costRollup.js' as string);
        const rollup = buildCostRollupWithUncertainty();
        const total = Number(rollup?.grandTotal) || 0;
        setText('unc-hub-exec-liability', fmtBRL(total));
        const uRel = Number(rollup?.uncertainty?.metrics?.uRelative);
        if (Number.isFinite(uRel) && total > 0) {
            const uAbs = uRel * total;
            setText('unc-hub-exec-liability-pm', `± ${fmtBRL(uAbs)}`);
        }
        else {
            setText('unc-hub-exec-liability-pm', total > 0 ? '± (sem U declarada)' : '± —');
        }
    }
    catch (err: any) {
        console.debug('[unc-hub] liability card skipped:', /** @type {any} */ (err)?.message);
    }
    // Valor do ativo - corporateIO outputs (soma declarada)
    try {
        const { exportCorporateIO } = await import('../../core/io/modelLink.js' as string);
        const io = exportCorporateIO();
        const outputs = Array.isArray(io?.outputs) ? io.outputs : [];
        const sum = outputs.reduce((s: any, o: any) => s + (Number(o?.declaredValue ?? o?.value) || 0), 0);
        setText('unc-hub-exec-asset', sum > 0 ? fmtBRL(sum) : 'R$ —');
        setText('unc-hub-exec-asset-pm', sum > 0 ? '± (declarado)' : '± —');
    }
    catch (err: any) {
        console.debug('[unc-hub] asset card skipped:', /** @type {any} */ (err)?.message);
    }
    // EIS Score - último valor canônico do cache (se disponível)
    try {
        const cached = window.__ecbytsLastEIS;
        if (cached && Number.isFinite(cached.score)) {
            setText('unc-hub-exec-eis', cached.score.toFixed(2));
            const u = Number(cached.uExpanded);
            setText('unc-hub-exec-eis-pm', Number.isFinite(u) ? `± ${u.toFixed(2)}` : '± —');
        }
    }
    catch (e: any) {
        console.debug('[uncertaintyHub] eisCardCache:', /** @type {any} */ (e)?.message || e);
        /* no-op */
    }
}
