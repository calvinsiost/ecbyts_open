// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   WORKFLOW HANDLERS — UI para workflow picker e wizard modal
   Renderiza o picker de workflows e o wizard multi-step.

   Padrao seguido: handlers/spatial.js (mutable state, render fns)
   ================================================================ */
import { showToast as _showToastImpl } from '../ui/toast.js';
const showToast = _showToastImpl;
import { t } from '../i18n/translations.js';
import { getAllWorkflows, checkPrerequisites, getWorkflow, createWorkflow, advanceWorkflow, goBackWorkflow, setStepResult, failWorkflow, getWorkflowStep, getWorkflowProgress, isWorkflowComplete, getCurrentStep, isExecutionStep, validateCurrentStep, } from '../../core/workflows/index.js';
import { getAllElements, getMeshByElementId } from '../../core/elements/manager.js';
import { getAllCampaigns } from '../../core/campaigns/manager.js';
import { CONFIG } from '../../config.js';
import { eventBus, Events } from '../../core/analytics/eventBus.js';
import { computeElementCompliance, updateMeshOverlay, clearAllOverlays, updatePulseAnimations, hasPulsingOverlays, } from '../../core/elements/complianceOverlay.js';
import { addRenderHook, requestRender } from '../scene/setup.js';
import { createLogger } from '../helpers/logger.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
const log = createLogger('Workflows');
// ================================================================
// STATE
// ================================================================
/** @type {any} */
let _requestUIRefresh: any = null;
/** @type {any} */
let _workflowState: any = null;
let _complianceOverlayEnabled = false;
let _pulseHookRegistered = false;
let _lastPulseUpdateTs = 0;
export function setWorkflowsUpdateAllUI(fn: any) {
    _requestUIRefresh = fn;
}
function requestWorkflowsUIRefresh(reason = 'workflows.changed') {
    if (typeof _requestUIRefresh !== 'function')
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.VALIDATION,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains) {
        _requestUIRefresh(domain, reason);
    }
}
/** @type {Record<string, number>} */
const _SEVERITY_RANK = { intervention: 4, prevention: 3, reference: 2, info: 1 };
function _ensureCompliancePulseHook() {
    if (_pulseHookRegistered)
        return;
    _pulseHookRegistered = true;
    addRenderHook(() => {
        if (!_complianceOverlayEnabled || !hasPulsingOverlays())
            return;
        const now = performance.now();
        if (_lastPulseUpdateTs && now - _lastPulseUpdateTs < 120)
            return; // throttle ~8fps
        const dt = _lastPulseUpdateTs ? Math.max(0.016, (now - _lastPulseUpdateTs) / 1000) : 0.12;
        _lastPulseUpdateTs = now;
        updatePulseAnimations(dt);
        requestRender();
    });
}
function _rankSeverity(severity: any) {
    return (_SEVERITY_RANK as Record<string, any>)[severity] || 0;
}
function _applyComplianceOverlayFromValidation(validation: any) {
    if (!_complianceOverlayEnabled)
        return;
    const severityByElement = new Map();
    for (const exc of validation?.exceedances || []) {
        const prev = severityByElement.get(exc.elementId);
        if (!prev || _rankSeverity(exc.severity) > _rankSeverity(prev)) {
            severityByElement.set(exc.elementId, exc.severity || 'intervention');
        }
    }
    const elements = getAllElements();
    for (const el of elements) {
        const mesh = getMeshByElementId(el.id);
        if (!mesh)
            continue;
        const severity = severityByElement.get(el.id) || computeElementCompliance(el);
        updateMeshOverlay(el.id, mesh, severity || null);
    }
    requestRender();
}
// ================================================================
// PICKER - Selecao de workflow
// ================================================================
function handleOpenWorkflowPicker() {
    const modal = document.getElementById('workflow-picker-modal');
    if (!modal)
        return;
    modal.classList.add('active');
    renderWorkflowPicker();
}
function handleCloseWorkflowPicker() {
    const modal = document.getElementById('workflow-picker-modal');
    if (modal)
        modal.classList.remove('active');
}
/**
 * Build the prerequisite HTML for a single workflow card.
 * @param {any} wf
 * @param {{ elements: any[], campaigns: any[] }} appState
 * @returns {string}
 */
function _buildWorkflowCardPrereqs(wf: any, appState: any) {
    const prereqs = checkPrerequisites(wf.id, appState);
    if (prereqs.met) {
        return `<span class="prereq-met">&#10003; ${t('workflow.prereqsMet') || 'Prerequisites met'}</span>`;
    }
    let html = '';
    for (const miss of prereqs.missing) {
        html += `<span class="prereq-missing">&#10007; ${t(miss) || miss}</span><br>`;
    }
    return html;
}
/**
 * Build the HTML for a single workflow card.
 * @param {any} wf
 * @param {{ elements: any[], campaigns: any[] }} appState
 * @returns {string}
 */
function _buildWorkflowCard(wf: any, appState: any) {
    const prereqs = checkPrerequisites(wf.id, appState);
    const disabledClass = prereqs.met ? '' : ' disabled';
    let html = `<div class="workflow-card${disabledClass}" data-workflow-id="${wf.id}" ${prereqs.met ? `onclick="handleStartWorkflow('${wf.id}')"` : ''}>`;
    html += '<div class="workflow-card-header">';
    html += `<span class="workflow-card-icon icon" data-icon="${wf.icon}"></span>`;
    html += `<span class="workflow-card-title">${t(wf.nameKey || wf.id) || wf.id}</span>`;
    if (wf.regulation) {
        html += `<span class="workflow-card-regulation">${wf.regulation}</span>`;
    }
    html += '</div>';
    html += `<div class="workflow-card-desc">${wf.descKey ? t(wf.descKey) : ''}</div>`;
    html += '<div class="workflow-card-prereqs">';
    html += _buildWorkflowCardPrereqs(wf, appState);
    html += '</div>';
    html += '</div>';
    return html;
}
function renderWorkflowPicker() {
    const container = document.getElementById('workflow-picker-content');
    if (!container)
        return;
    const workflows = getAllWorkflows();
    const appState = {
        elements: getAllElements(),
        campaigns: getAllCampaigns(),
    };
    if (workflows.length === 0) {
        container.innerHTML = `<p style="color:var(--text-secondary);padding:20px;">${t('workflow.noWorkflows') || 'No workflows available.'}</p>`;
        return;
    }
    let html = '<div class="workflow-picker-grid">';
    for (const wf of workflows) {
        html += _buildWorkflowCard(wf, appState);
    }
    html += '</div>';
    container.innerHTML = html;
    // Atualiza icones Lucide
    const _w = window;
    if (typeof _w.lucide !== 'undefined') {
        _w.lucide.createIcons();
    }
}
// ================================================================
// WIZARD - Execucao multi-step
// ================================================================
function handleStartWorkflow(workflowId: any, prefill: any) {
    const definition = getWorkflow(workflowId);
    if (!definition) {
        showToast('Workflow not found', 'error');
        return;
    }
    const appState = {
        elements: getAllElements(),
        campaigns: getAllCampaigns(),
    };
    // Verifica pre-requisitos
    const prereqs = checkPrerequisites(workflowId, appState);
    if (!prereqs.met) {
        showToast(t('workflow.prereqsNotMet') || 'Prerequisites not met', 'warning');
        return;
    }
    // Cria estado do workflow
    _workflowState = createWorkflow(definition as any, {
        ...appState,
        prefill: prefill || {},
    });
    // Emite evento de workflow iniciado
    eventBus.emit(Events.WORKFLOW_STARTED, {
        workflowId: definition.id,
        regulation: definition.regulation,
    });
    // Fecha picker e abre wizard
    handleCloseWorkflowPicker();
    const modal = document.getElementById('workflow-wizard-modal');
    if (modal)
        modal.classList.add('active');
    // Atualiza titulo
    const titleEl = document.getElementById('workflow-wizard-title');
    if (titleEl) {
        titleEl.innerHTML = `<span class="icon" data-icon="${definition.icon}"></span> <span>${t(definition.nameKey || definition.id) || definition.id}</span>`;
    }
    renderWizardStep();
}
function handleCloseWorkflowWizard() {
    const modal = document.getElementById('workflow-wizard-modal');
    if (modal)
        modal.classList.remove('active');
    _workflowState = null;
}
function handleWorkflowNext() {
    if (!_workflowState)
        return;
    // Valida step atual
    const validation = validateCurrentStep(_workflowState);
    if (!validation.valid) {
        showToast(validation.errors.map((/** @type {any} */ e) => t(e) || e).join('; '), 'warning');
        return;
    }
    // Coleta decisoes da UI
    const decisions = collectDecisions();
    // Avanca
    _workflowState = advanceWorkflow(_workflowState, decisions);
    eventBus.emit(Events.WORKFLOW_STEP_CHANGED, {
        workflowId: _workflowState.definitionId,
        stepIndex: _workflowState.stepIndex,
        progress: getWorkflowProgress(_workflowState),
    });
    if (isWorkflowComplete(_workflowState)) {
        onWorkflowComplete();
        return;
    }
    // Se o proximo step e execution, executa automaticamente
    if (isExecutionStep(_workflowState)) {
        renderWizardStep();
        executeCurrentStep();
    }
    else {
        renderWizardStep();
    }
}
function handleWorkflowBack() {
    if (!_workflowState)
        return;
    _workflowState = goBackWorkflow(_workflowState);
    eventBus.emit(Events.WORKFLOW_STEP_CHANGED, {
        workflowId: _workflowState.definitionId,
        stepIndex: _workflowState.stepIndex,
        progress: getWorkflowProgress(_workflowState),
    });
    renderWizardStep();
}
// ================================================================
// RENDERING - Renderiza o step atual
// ================================================================
/**
 * Build the progress bar HTML for the current step.
 * @param {any} stepInfo
 * @param {number} progress
 * @returns {string}
 */
function _renderWizardProgressBar(stepInfo: any, progress: number) {
    let html = '<div class="workflow-progress">';
    html += `<span class="workflow-progress-label">${stepInfo.stepNumber} / ${stepInfo.totalSteps}</span>`;
    html += '<div class="workflow-progress-bar">';
    html += `<div class="workflow-progress-fill" style="width:${Math.round(progress * 100)}%"></div>`;
    html += '</div>';
    html += '</div>';
    return html;
}
/**
 * Build the step content HTML based on step type.
 * @param {any} stepInfo
 * @returns {string}
 */
function _renderWizardStepContent(stepInfo: any) {
    switch (stepInfo.type) {
        case 'info':
            return renderInfoStep(stepInfo);
        case 'decision':
            return renderDecisionStep(stepInfo);
        case 'execution':
            return renderExecutionStep(stepInfo);
        case 'review':
            return renderReviewStep(stepInfo);
        default:
            return '';
    }
}
/**
 * Build the wizard footer HTML with navigation buttons.
 * @param {any} stepInfo
 * @returns {string}
 */
function _renderWizardFooter(stepInfo: any) {
    let html = '<div class="workflow-footer">';
    html += '<div class="workflow-footer-left">';
    html += `<button class="workflow-btn${_complianceOverlayEnabled ? ' active' : ''}" data-cc-action="cc-833bea77">`;
    html += `${t('workflow.complianceOverlay') || 'Compliance Overlay'}`;
    html += '</button>';
    if (stepInfo.canGoBack) {
        html += `<button class="workflow-btn" data-cc-action="cc-81d18bce">${t('back') || 'Back'}</button>`;
    }
    html += '</div>';
    html += '<div class="workflow-footer-right">';
    html += `<button class="workflow-btn" data-cc-action="cc-f34af638">${t('cancel') || 'Cancel'}</button>`;
    if (stepInfo.type !== 'execution') {
        const btnLabel = stepInfo.isLastStep
            ? t('workflow.finish') || 'Finish'
            : t('next') || 'Next';
        html += `<button class="workflow-btn primary" data-cc-action="cc-b46d95cc">${btnLabel}</button>`;
    }
    html += '</div>';
    html += '</div>';
    return html;
}
function renderWizardStep() {
    const container = document.getElementById('workflow-wizard-content');
    if (!container || !_workflowState)
        return;
    const stepInfo = getWorkflowStep(_workflowState);
    if (!stepInfo)
        return;
    const progress = getWorkflowProgress(_workflowState);
    let html = '';
    html += _renderWizardProgressBar(stepInfo, progress);
    html += '<div class="workflow-step">';
    html += `<div class="workflow-step-title">${t(stepInfo.titleKey || stepInfo.stepId) || stepInfo.stepId}</div>`;
    if (stepInfo.descKey) {
        html += `<div class="workflow-step-desc">${t(stepInfo.descKey) || ''}</div>`;
    }
    html += _renderWizardStepContent(stepInfo);
    html += '</div>';
    html += _renderWizardFooter(stepInfo);
    container.innerHTML = html;
    const _w = window;
    if (typeof _w.lucide !== 'undefined') {
        _w.lucide.createIcons();
    }
}
// ── Info step ─────────────────────────────────────────────────────
function renderInfoStep(_stepInfo: any) {
    let html = '';
    // Mostra pre-requisitos se disponivel
    if (_workflowState?.definition?.prerequisites) {
        const appState = {
            elements: getAllElements(),
            campaigns: getAllCampaigns(),
        };
        const prereqs = _workflowState.definition.prerequisites(appState);
        html += '<div style="margin-top:12px;">';
        if (prereqs.met) {
            html += `<p class="prereq-met" style="color:var(--success);">&#10003; ${t('workflow.prereqsMet') || 'All prerequisites met'}</p>`;
        }
        else {
            for (const miss of prereqs.missing) {
                html += `<p class="prereq-missing" style="color:var(--error);">&#10007; ${t(miss) || miss}</p>`;
            }
        }
        html += '</div>';
    }
    return html;
}
// ── Decision step ─────────────────────────────────────────────────
/**
 * Build radio option HTML for a decision step.
 * @param {any} opts
 * @param {any} stepInfo
 * @returns {string}
 */
function _renderRadioOptions(opts: any, stepInfo: any) {
    const choices = opts.choices || [];
    const currentValue = stepInfo.decisions[opts.field] || opts.defaults?.[opts.field] || '';
    let html = '<div class="workflow-radio-group">';
    for (const choice of choices) {
        const selected = choice.value === currentValue ? ' selected' : '';
        const checked = choice.value === currentValue ? ' checked' : '';
        html += `<label class="workflow-radio-option${selected}">`;
        html += `<input data-field-meta="true" data-field-meta-key="auto-pos:workflows:input:L397" type="radio" name="${opts.field}" value="${choice.value}"${checked} data-cc-call-change="handleWorkflowDecision|s:${encodeURIComponent(`${opts.field}`)}|s:${encodeURIComponent(`${choice.value}`)}">`;
        html += `<span>${t(choice.labelKey) || choice.value}</span>`;
        html += '</label>';
    }
    html += '</div>';
    return html;
}
/**
 * Build parameter picker HTML for a decision step.
 * @param {any} opts
 * @param {any} stepInfo
 * @returns {string}
 */
function _renderParameterPicker(opts: any, stepInfo: any) {
    const filter = opts.filter || [];
    const params = CONFIG.PARAMETERS.filter((/** @type {any} */ p) => filter.length === 0 || filter.includes(p.id));
    const currentValue = stepInfo.decisions[opts.field] || '';
    let html = `<select data-field-meta="true" data-field-meta-key="auto-pos:workflows:select:L409" class="workflow-select" data-cc-call-change="handleWorkflowDecision|s:${encodeURIComponent(`${opts.field}`)}|v">`;
    html += `<option value="">${t('workflow.selectParameter') || '-- Select parameter --'}</option>`;
    for (const p of params) {
        const unit = CONFIG.UNITS.find((/** @type {any} */ u) => u.id === p.defaultUnitId);
        const sel = p.id === currentValue ? ' selected' : '';
        html += `<option value="${p.id}"${sel}>${p.name} (${unit?.symbol || p.defaultUnitId})</option>`;
    }
    html += '</select>';
    return html;
}
/**
 * Build campaign picker HTML for a decision step.
 * @param {any} opts
 * @param {any} stepInfo
 * @returns {string}
 */
function _renderCampaignPicker(opts: any, stepInfo: any) {
    const campaigns = getAllCampaigns();
    const currentValue = stepInfo.decisions[opts.field] || '';
    let html = `<select data-field-meta="true" data-field-meta-key="auto-pos:workflows:select:L423" class="workflow-select" data-cc-call-change="handleWorkflowDecision|s:${encodeURIComponent(`${opts.field}`)}|v">`;
    if (opts.allowLatest) {
        html += `<option value="">${t('workflow.latestData') || 'Latest data (all campaigns)'}</option>`;
    }
    for (const c of campaigns) {
        const sel = c.id === currentValue ? ' selected' : '';
        html += `<option value="${c.id}"${sel}>${c.name} (${c.startDate})</option>`;
    }
    html += '</select>';
    return html;
}
function renderDecisionStep(stepInfo: any) {
    const opts = stepInfo.options;
    if (!opts)
        return '';
    let html = '';
    if (opts.type === 'radio') {
        html += _renderRadioOptions(opts, stepInfo);
    }
    if (opts.type === 'parameter-picker') {
        html += _renderParameterPicker(opts, stepInfo);
    }
    if (opts.type === 'campaign-picker') {
        html += _renderCampaignPicker(opts, stepInfo);
    }
    return html;
}
// ── Execution step ────────────────────────────────────────────────
function renderExecutionStep(_stepInfo: any) {
    return `
        <div class="workflow-exec-progress">
            <div class="workflow-exec-spinner"></div>
            <div class="workflow-exec-label" id="workflow-exec-label">${t('workflow.executing') || 'Processing...'}</div>
            <div class="workflow-exec-bar">
                <div class="workflow-exec-bar-fill" id="workflow-exec-bar-fill" style="width:0%"></div>
            </div>
        </div>
    `;
}
// ── Review step ───────────────────────────────────────────────────
/**
 * Build review cards for validation results.
 * @param {any} validation
 * @returns {string}
 */
function _renderValidationSummary(validation: any) {
    let html = '';
    html += renderReviewCard(t('workflow.review.wellsAnalyzed') || 'Wells Analyzed', validation.totalWells);
    html += renderReviewCard(t('workflow.review.observations') || 'Observations', validation.totalObservations);
    html += renderReviewCard(t("workflow.review.exceedances") as any || 'Exceedances', validation.exceedances.length, validation.exceedances.length > 0 ? 'critical' : 'success');
    html += renderReviewCard(t('workflow.review.compliant') || 'Compliant', validation.compliant.length, 'success');
    return html;
}
/**
 * Build review cards for delineation results.
 * @param {any} delineation
 * @returns {string}
 */
function _renderDelineationSummary(delineation: any) {
    let html = '';
    html += renderReviewCard(t('workflow.review.plumeArea') || 'Plume Area', `${delineation.area.toFixed(1)} m\u00B2`, delineation.area > 0 ? 'critical' : 'success');
    html += renderReviewCard(t('workflow.review.maxConc') || 'Max Concentration', delineation.maxConcentration.toFixed(2), 'critical');
    return html;
}
/**
 * Build the exceedance table HTML for review step.
 * @param {any[]} exceedances
 * @returns {string}
 */
function _renderExceedanceTable(exceedances: any[]) {
    let html = `<h4 style="margin:12px 0 8px;color:var(--text-primary);">${t('workflow.review.exceedanceTable') || 'Exceedance Details'}</h4>`;
    html += '<table class="workflow-table">';
    html += '<tr><th>Well</th><th>Value</th><th>Limit</th><th>Exc. %</th><th>Date</th></tr>';
    for (const exc of exceedances.slice(0, 20)) {
        html += '<tr class="exceed">';
        html += `<td>${exc.elementName}</td>`;
        html += `<td>${exc.value} ${exc.unitId || ''}</td>`;
        html += `<td>${exc.limit || '-'}</td>`;
        html += `<td>${exc.exceedance ? (exc.exceedance * 100).toFixed(0) + '%' : '-'}</td>`;
        html += `<td>${exc.date || '-'}</td>`;
        html += '</tr>';
    }
    html += '</table>';
    return html;
}
function renderReviewStep(stepInfo: any) {
    let html = '';
    const results = stepInfo.results || {};
    html += '<div class="workflow-review-summary">';
    const validation = results.VALIDATION;
    if (validation) {
        html += _renderValidationSummary(validation);
    }
    const delineation = results.DELINEATE_PLUME;
    if (delineation) {
        html += _renderDelineationSummary(delineation);
    }
    html += '</div>';
    if (validation?.exceedances?.length > 0) {
        html += _renderExceedanceTable(validation.exceedances);
    }
    return html;
}
function renderReviewCard(label: any, value: any, cssClass: any = undefined) {
    const cls = cssClass ? ` ${cssClass}` : '';
    return `
        <div class="workflow-review-card">
            <div class="workflow-review-card-label">${label}</div>
            <div class="workflow-review-card-value${cls}">${value}</div>
        </div>
    `;
}
// ================================================================
// EXECUTION - Roda step async e avanca automaticamente
// ================================================================
/**
 * Update execution progress UI.
 * @param {HTMLElement|null} barFill
 * @param {HTMLElement|null} label
 * @param {any} step
 */
function _setExecutionProgressUI(barFill: any, label: any, step: any) {
    if (label)
        label.textContent = t(step.titleKey || step.id) || 'Processing...';
}
/**
 * Advance the workflow after a successful execution step.
 */
function _advanceAfterExecution() {
    _workflowState = advanceWorkflow(_workflowState);
    if (isWorkflowComplete(_workflowState)) {
        onWorkflowComplete();
        return;
    }
    if (isExecutionStep(_workflowState)) {
        renderWizardStep();
        executeCurrentStep();
    }
    else {
        renderWizardStep();
    }
}
/**
 * Handle an error during step execution.
 * @param {any} err
 * @param {HTMLElement|null} label
 */
function _handleExecutionError(err: any, label: any) {
    const e = err;
    log.error('Workflow execution failed', e?.message);
    _workflowState = failWorkflow(_workflowState, e?.message);
    eventBus.emit(Events.WORKFLOW_FAILED, {
        workflowId: _workflowState?.definitionId,
        error: e?.message,
    });
    if (label) {
        label.textContent = `Error: ${e?.message}`;
        label.style.color = 'var(--error, #f44336)';
    }
    showToast(e?.message, 'error');
}
async function executeCurrentStep() {
    if (!_workflowState)
        return;
    const step = getCurrentStep(_workflowState);
    if (!step || step.type !== 'execution' || typeof step.execute !== 'function') {
        showToast('Step has no execute function', 'error');
        return;
    }
    const barFill = document.getElementById('workflow-exec-bar-fill');
    const label = document.getElementById('workflow-exec-label');
    const onProgress = (pct: any) => {
        if (barFill)
            barFill.style.width = `${Math.round(pct * 100)}%`;
    };
    try {
        _setExecutionProgressUI(barFill, label, step);
        const result = await step.execute(_workflowState, onProgress);
        _workflowState = setStepResult(_workflowState, step.id, result);
        if (step.id === 'VALIDATION' && _complianceOverlayEnabled) {
            _applyComplianceOverlayFromValidation(result);
        }
        _advanceAfterExecution();
    }
    catch (err: any) {
        _handleExecutionError(err, label);
    }
}
// ================================================================
// COMPLETION - Workflow finalizado
// ================================================================
function onWorkflowComplete() {
    showToast(t('workflow.completed') || 'Workflow completed!', 'success');
    eventBus.emit(Events.WORKFLOW_COMPLETED, {
        workflowId: _workflowState?.definitionId,
        results: _workflowState?.results,
    });
    requestWorkflowsUIRefresh('workflows.completed');
    if (_complianceOverlayEnabled) {
        _ensureCompliancePulseHook();
        _applyComplianceOverlayFromValidation(_workflowState?.results?.VALIDATION);
    }
    // Renderiza step de review se era o ultimo
    renderWizardStep();
}
function handleToggleComplianceOverlay(enabled: any) {
    _ensureCompliancePulseHook();
    if (typeof enabled === 'boolean') {
        _complianceOverlayEnabled = enabled;
    }
    else {
        _complianceOverlayEnabled = !_complianceOverlayEnabled;
    }
    if (!_complianceOverlayEnabled) {
        clearAllOverlays();
        requestRender();
        showToast(t('workflow.complianceOverlayOff') || 'Compliance overlay disabled', 'info');
        return;
    }
    const validation = _workflowState?.results?.VALIDATION;
    if (validation) {
        _applyComplianceOverlayFromValidation(validation);
    }
    else {
        const elements = getAllElements();
        for (const el of elements) {
            const mesh = getMeshByElementId(el.id);
            if (!mesh)
                continue;
            updateMeshOverlay(el.id, mesh, computeElementCompliance(el));
        }
        requestRender();
    }
    showToast(t('workflow.complianceOverlayOn') || 'Compliance overlay enabled', 'success');
}
// ================================================================
// DECISION HELPERS
// ================================================================
function handleWorkflowDecision(field: any, value: any) {
    if (!_workflowState)
        return;
    _workflowState = {
        ..._workflowState,
        decisions: {
            ..._workflowState.decisions,
            [field]: value,
        },
    };
    // Re-renderiza para atualizar seleçao visual
    renderWizardStep();
}
function collectDecisions() {
    // Coleta valores de inputs radio/select no DOM
    /** @type {Record<string, any>} */
    const decisions: any = {};
    const container = document.getElementById('workflow-wizard-content');
    if (!container)
        return decisions;
    // Radios
    const radios = container.querySelectorAll('input[type="radio"]:checked');
    for (const radio of radios) {
        const r: any = radio;
        decisions[r.name] = r.value;
    }
    // Selects
    const selects = container.querySelectorAll('.workflow-select');
    for (const select of selects) {
        const s: any = select;
        const name = s.getAttribute('onchange')?.match(/'([^']+)'/)?.[1];
        if (name && s.value) {
            decisions[name] = s.value;
        }
    }
    return decisions;
}
// ================================================================
// EXPORTS
// ================================================================
export const workflowHandlers = {
    handleOpenWorkflowPicker,
    handleCloseWorkflowPicker,
    handleStartWorkflow,
    handleCloseWorkflowWizard,
    handleWorkflowNext,
    handleWorkflowBack,
    handleWorkflowDecision,
    handleToggleComplianceOverlay,
};
