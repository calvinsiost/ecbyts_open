// @ts-check
// Generated from src/app/js/utils/handlers/projects.ts by TS-MIGRATION-001. Do not edit manually.
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
   PROJECT REGISTRY HANDLERS — User actions for projects, resources, allocations
   Acoes do usuario para registro de projetos, equipe e alocacao

   FUNCIONALIDADES:
   - CRUD de projetos e fases (com milestones e dependencias)
   - Abertura de Gantt chart (modal)
   - CRUD de recursos com LGPD compliance
   - Alocacao de recursos a fases
   - Load view com granularidade configuravel
   ================================================================ */
import * as projectManagerModule from '../governance/projectManager.js';
const {
    addProject,
    updateProject,
    removeProject,
    getProject,
    addPhase,
    updatePhase,
    removePhase,
    addPhaseDependency,
    removePhaseDependency,
    linkContract,
    unlinkContract,
    linkWbsRoot,
    linkMacMeasure,
    linkCampaign,
    unlinkCampaign,
    addResource,
    updateResource,
    removeResource,
    getResources,
    getResource,
    anonymizeResource,
    withdrawConsent,
    addAllocation,
    updateAllocation,
    removeAllocation,
    addTimesheetEntry,
    updateTimesheetEntry,
    removeTimesheetEntry,
    getTimesheetByProject,
    getTimesheetSummary,
} = /** @type {any} */ (projectManagerModule);
import { renderProjectGantt } from '../ui/ganttRenderer.js';
import { renderLoadGrid, renderAllocationForecast, destroyForecastChart } from '../ui/loadRenderer.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { openModal, closeModal } from '../ui/modals.js';
import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { asyncConfirm } from '../ui/asyncDialogs.js';
import { getContracts } from '../governance/contractManager.js';
import { getWbsItems } from '../governance/wbsManager.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
import {
    clearTrainingReturnBanner,
    normalizeTrainingReturnContext,
    renderTrainingReturnBanner,
    type TrainingReturnContext,
} from '../ui/trainingReturnContext.js';
/** @typedef {Record<string, any>} any */
/** @typedef {Record<string, any>} any */
/** @typedef {Record<string, any>} any */
/** @typedef {Record<string, any>} any */
/** @typedef {'day'|'week'|'month'|'year'|'hour'} LoadGranularity */
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
let requestProjectRegistryUIRefreshRef: any = null;
let editingProjectId: any = null;
let editingResourceId: any = null;
let _currentLoadGranularity: any = 'week';
/** @type {string|null} */
let _currentLoadProjectId: any = null;
/** @type {string|null} */
let _currentTimesheetProjectId: any = null;
let _timesheetFilters: any = {};
/** @type {string|null} */
let _editingTimesheetEntryId: any = null;
let _editingTimesheetDraft: any = {};
let _timesheetFormDraft: any = {};
let _timesheetCalendarMonth = '';
let _lastProjectGanttTrainingReturnContext: TrainingReturnContext | null = null;

function _isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function _firstText(...values: readonly unknown[]): string {
    for (const value of values) {
        const text = String(value ?? '').trim();
        if (text) return text;
    }
    return '';
}

function _projectIdFromGanttInput(input: unknown): string {
    const candidate = _isRecord(input)
        ? _firstText(input.projectId, input.templateId, input.id, input.target, input.presetId)
        : _firstText(input);
    if (candidate === 'm01.agile.gantt') return 'template:intro-module01-aula';
    return candidate;
}

function _ensureIntroModule01GanttProject(): void {
    const projectId = 'template:intro-module01-aula';
    const phases = [
        {
            id: 'class-sprint-demo',
            name: 'Sprint 1 - GAC e dados ambientais',
            startDate: '2026-06-01',
            endDate: '2026-06-05',
            percentComplete: 100,
            color: '#38bdf8',
            dependencies: [],
        },
        {
            id: 'class-sprint-integration',
            name: 'Sprint 2 - Files, Data Studio e indicadores',
            startDate: '2026-06-08',
            endDate: '2026-06-12',
            percentComplete: 85,
            color: '#22c55e',
            dependencies: ['class-sprint-demo'],
        },
        {
            id: 'class-sprint-validation',
            name: 'Sprint 3 - Validacao, Mann-Kendall e narrativa da aula',
            startDate: '2026-06-15',
            endDate: '2026-06-19',
            percentComplete: 70,
            color: '#f59e0b',
            dependencies: ['class-sprint-integration'],
        },
        {
            id: 'class-package-ready',
            name: 'Pacote ECBT pronto para apresentar',
            startDate: '2026-06-20',
            endDate: '2026-06-20',
            percentComplete: 0,
            isMilestone: true,
            color: '#a78bfa',
            dependencies: ['class-sprint-validation'],
        },
    ];
    const baseProject = {
        id: projectId,
        name: 'Cronograma da aula - Modulo 01 Dados Ambientais',
        type: 'training',
        status: 'active',
        description: 'Cronograma demonstrativo usado no slide de metodologia agil da aula.',
        dates: { startDate: '2026-06-01', endDate: '2026-06-20' },
        phases,
        linkedContractIds: [],
        linkedWbsRootIds: [],
        linkedMacMeasureIds: [],
        linkedCampaignIds: [],
        linkedElementIds: [],
        timesheetDailyTargetHours: 4,
        notes: 'Template local instalado automaticamente pelo Clique-go do Modulo 01.',
    };
    const existing = getProject(projectId);
    if (existing) {
        if (Array.isArray((existing as any).phases) && (existing as any).phases.length > 0) return;
        updateProject(projectId, baseProject);
        return;
    }
    addProject(baseProject);
}

function _renderProjectGanttTrainingReturnContext(context: TrainingReturnContext | null): void {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('project-gantt-content');
    if (!host) return;
    if (context?.hasContext) {
        renderTrainingReturnBanner({ host, context, source: 'gantt' });
    } else {
        clearTrainingReturnBanner(host);
    }
}
/** @param {string} id @returns {string} */
function _fieldValue( id: any) {
    return (
        /** @type {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|null} */ (document.getElementById(id))
            ?.value || ''
    );
}
/** @param {string} id @returns {boolean} */
function _fieldChecked( id: any) {
    return /** @type {HTMLInputElement|null} */ (document.getElementById(id))?.checked || false;
}
/**
 * Inject full-refresh callback reference.
 * @param {null | (() => void)} fn
 */
export function setProjectRegistryRequestUIRefresh( fn: any) {
    requestProjectRegistryUIRefreshRef = fn;
}
function requestProjectRegistryUIRefresh(reason = 'projects.changed') {
    if (!requestProjectRegistryUIRefreshRef) return;
    for (const domain of [
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.HOME,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
    ]) {
        requestProjectRegistryUIRefreshRef(domain, reason);
    }
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('timesheets-changed', (event: any) => {
        if (!_currentTimesheetProjectId) return;
        const detail = (event)?.detail || {};
        if (detail.reason === 'project_removed' && detail.projectId === _currentTimesheetProjectId) {
            handleCloseProjectTimesheet();
            showToast(t('timesheetConflict') || 'Entry was removed by another operation', 'warning');
            return;
        }
        _renderProjectTimesheetModal(_currentTimesheetProjectId);
    });
}
// ----------------------------------------------------------------
// PROJECT HANDLERS
// ----------------------------------------------------------------
function handleAddProject() {
    const project = addProject({
        name: t('newProject') || 'New Project',
        type: 'custom',
        status: 'planning',
    });
    requestProjectRegistryUIRefresh();
    showToast(`${t('projectAdded') || 'Project added'}: ${project.name}`, 'success');
}
/** @param {string} id */
function handleEditProject( id: any) {
    editingProjectId = id;
    _renderProjectForm(id);
    openModal('project-edit-modal');
}
/** @param {string} id */
function handleRemoveProject( id: any) {
    const project = getProject(id);
    if (!project) return;
    removeProject(id);
    requestProjectRegistryUIRefresh();
    showToast(t('projectRemoved') || 'Project removed', 'info');
}
function handleSaveProject() {
    if (!editingProjectId) return;
    const name = _fieldValue('project-name');
    const type = _fieldValue('project-type') || 'custom';
    const status = _fieldValue('project-status') || 'planning';
    const description = _fieldValue('project-description');
    const startDate = _fieldValue('project-start-date');
    const endDate = _fieldValue('project-end-date');
    const notes = _fieldValue('project-notes');
    const dailyTargetRaw = parseFloat(_fieldValue('project-timesheet-daily-target') || '');
    const timesheetDailyTargetHours = Number.isFinite(dailyTargetRaw) && dailyTargetRaw > 0 ? dailyTargetRaw : 8;
    updateProject(editingProjectId, {
        name,
        type,
        status,
        description,
        notes,
        dates: { startDate, endDate },
        timesheetDailyTargetHours,
    });
    closeModal('project-edit-modal');
    requestProjectRegistryUIRefresh();
    showToast(t('projectSaved') || 'Project saved', 'success');
}
// ----------------------------------------------------------------
// PHASE HANDLERS
// ----------------------------------------------------------------
/** @param {string} projectId */
function handleAddProjectPhase( projectId: any) {
    const phase = addPhase(projectId, {
        name: t('newPhase') || 'New Phase',
    });
    if (phase) {
        if (editingProjectId === projectId) _renderProjectForm(projectId);
        showToast(t('phaseAdded') || 'Phase added', 'success');
    }
}
/** @param {string} projectId */
function handleAddProjectMilestone( projectId: any) {
    const project = getProject(projectId);
    if (!project) return;
    const today = new Date().toISOString().slice(0, 10);
    const phase = addPhase(projectId, {
        name: t('newMilestone') || 'Milestone',
        isMilestone: true,
        startDate: today,
        endDate: today,
    });
    if (phase && editingProjectId === projectId) {
        _renderProjectForm(projectId);
    }
}
/** @param {string} projectId @param {string} phaseId @param {string} field @param {any} value */
function handleUpdateProjectPhase( projectId: any, phaseId: any, field: any, value: any) {
    const parsed = field === 'percentComplete' ? parseFloat(value) || 0 : value;
    updatePhase(projectId, phaseId, { [field]: parsed });
    requestProjectRegistryUIRefresh();
}
/** @param {string} projectId @param {string} phaseId */
function handleRemoveProjectPhase( projectId: any, phaseId: any) {
    removePhase(projectId, phaseId);
    if (editingProjectId === projectId) _renderProjectForm(projectId);
    showToast(t('phaseRemoved') || 'Phase removed', 'info');
}
// ----------------------------------------------------------------
// DEPENDENCY HANDLERS
// ----------------------------------------------------------------
/** @param {string} projectId @param {string} phaseId @param {string} depPhaseId */
function handleAddPhaseDependency( projectId: any, phaseId: any, depPhaseId: any) {
    const result: any = addPhaseDependency(projectId, phaseId, depPhaseId);
    if (!result.ok) {
        const msgs = ({
            cycle_detected: t('depCycleError') || 'Cannot add: creates a cycle',
            self_dependency: t('depSelfError') || 'Cannot depend on itself',
            duplicate: t('depDuplicate') || 'Dependency already exists',
            phase_not_found: t('depPhaseNotFound') || 'Phase not found',
            project_not_found: t('depProjectNotFound') || 'Project not found',
        }) as Record<string, string>;
        showToast(msgs[String(result.error)] || result.error, 'error');
        return;
    }
    if (editingProjectId === projectId) _renderProjectForm(projectId);
}
/** @param {string} projectId @param {string} phaseId @param {string} depPhaseId */
function handleRemovePhaseDependency( projectId: any, phaseId: any, depPhaseId: any) {
    removePhaseDependency(projectId, phaseId, depPhaseId);
    if (editingProjectId === projectId) _renderProjectForm(projectId);
}
// ----------------------------------------------------------------
// GANTT HANDLERS
// ----------------------------------------------------------------
/** @param {string | Record<string, unknown>} projectId */
function handleOpenProjectGantt( projectId: any) {
    const trainingContext = normalizeTrainingReturnContext(projectId, {
        label: 'Gantt da aula',
        returnLabel: 'Voltar ao slide',
    });
    _lastProjectGanttTrainingReturnContext = trainingContext.hasContext ? trainingContext : null;
    const targetProjectId = _projectIdFromGanttInput(projectId);
    if (targetProjectId === 'template:intro-module01-aula') _ensureIntroModule01GanttProject();
    openModal('project-gantt-modal');
    requestAnimationFrame(() => {
        renderProjectGantt(targetProjectId);
        _renderProjectGanttTrainingReturnContext(_lastProjectGanttTrainingReturnContext);
    });
}
function handleCloseProjectGantt() {
    closeModal('project-gantt-modal');
}
// ----------------------------------------------------------------
// LINK HANDLERS
// ----------------------------------------------------------------
/** @param {string} projectId @param {string} contractId */
function handleLinkContractToProject( projectId: any, contractId: any) {
    linkContract(projectId, contractId);
    requestProjectRegistryUIRefresh();
}
/** @param {string} projectId @param {string} contractId */
function handleUnlinkContractFromProject( projectId: any, contractId: any) {
    unlinkContract(projectId, contractId);
    requestProjectRegistryUIRefresh();
}
/** @param {string} projectId @param {string} wbsId */
function handleLinkWbsToProject( projectId: any, wbsId: any) {
    linkWbsRoot(projectId, wbsId);
    requestProjectRegistryUIRefresh();
}
/** @param {string} projectId @param {string} measureId */
function handleLinkMacToProject( projectId: any, measureId: any) {
    linkMacMeasure(projectId, measureId);
    requestProjectRegistryUIRefresh();
}
/** @param {string} projectId @param {string} campaignId */
function handleLinkCampaignToProject( projectId: any, campaignId: any) {
    linkCampaign(projectId, campaignId);
    requestProjectRegistryUIRefresh();
}
/** @param {string} projectId @param {string} campaignId */
function handleUnlinkCampaignFromProject( projectId: any, campaignId: any) {
    unlinkCampaign(projectId, campaignId);
    requestProjectRegistryUIRefresh();
}
// ----------------------------------------------------------------
// RESOURCE HANDLERS (LGPD)
// ----------------------------------------------------------------
function handleAddResource() {
    editingResourceId = null;
    _renderResourceForm(null);
    openModal('resource-edit-modal');
}
/** @param {string} id */
function handleEditResource( id: any) {
    editingResourceId = id;
    _renderResourceForm(id);
    openModal('resource-edit-modal');
}
/** @param {string} id */
function handleRemoveResource( id: any) {
    removeResource(id);
    requestProjectRegistryUIRefresh();
    showToast(t('resourceRemoved') || 'Resource removed', 'info');
}
function handleSaveResource() {
    const name = _fieldValue('resource-name');
    const role = _fieldValue('resource-role');
    const level = _fieldValue('resource-level') || 'mid';
    const email = _fieldValue('resource-email');
    const hoursPerWeek = parseFloat(_fieldValue('resource-hours')) || 40;
    const costPerHour = parseFloat(_fieldValue('resource-cost')) || 0;
    const consentGiven = _fieldChecked('resource-consent');
    if (!consentGiven) {
        showToast(t('lgpdConsentRequired') || 'LGPD: Consent is required to store personal data', 'error');
        return;
    }
    if (editingResourceId) {
        updateResource(editingResourceId, { name, role, level, email, hoursPerWeek, costPerHour, consentGiven });
    } else {
        addResource({ name, role, level, email, hoursPerWeek, costPerHour, consentGiven });
    }
    closeModal('resource-edit-modal');
    requestProjectRegistryUIRefresh();
    showToast(t('resourceSaved') || 'Resource saved', 'success');
}
/** @param {string} id */
function handleAnonymizeResource( id: any) {
    anonymizeResource(id);
    requestProjectRegistryUIRefresh();
    showToast(t('resourceAnonymized') || 'Resource data anonymized (LGPD)', 'info');
}
/** @param {string} id */
function handleWithdrawResourceConsent( id: any) {
    withdrawConsent(id);
    requestProjectRegistryUIRefresh();
    showToast(t('consentWithdrawn') || 'Consent withdrawn — data anonymized', 'info');
}
// ----------------------------------------------------------------
// ALLOCATION HANDLERS
// ----------------------------------------------------------------
/** @param {string} projectId @param {string} phaseId */
function handleAddAllocation( projectId: any, phaseId: any) {
    const resources = (getResources()).filter((r: any) => r.active && r.consentGiven) as any[];
    if (resources.length === 0) {
        showToast(t('noActiveResources') || 'No active resources available. Add resources first.', 'error');
        return;
    }
    // Aloca o primeiro recurso disponivel por padrao
    addAllocation({
        resourceId: resources[0].id,
        projectId,
        phaseId,
    });
    if (editingProjectId === projectId) _renderProjectForm(projectId);
    showToast(t('allocationAdded') || 'Allocation added', 'success');
}
/** @param {string} allocId @param {string} field @param {any} value */
function handleUpdateAllocation( allocId: any, field: any, value: any) {
    const parsed = field === 'hoursPerDay' ? parseFloat(value) || 0 : value;
    updateAllocation(allocId, { [field]: parsed });
    requestProjectRegistryUIRefresh();
}
/** @param {string} allocId */
function handleRemoveAllocation( allocId: any) {
    removeAllocation(allocId);
    requestProjectRegistryUIRefresh();
}
// ----------------------------------------------------------------
// LOAD VIEW HANDLERS
// ----------------------------------------------------------------
/** @param {string} projectId */
function handleOpenProjectLoad( projectId: any) {
    _currentLoadProjectId = projectId;
    openModal('project-load-modal');
    requestAnimationFrame(() => {
        renderLoadGrid(projectId, _currentLoadGranularity);
        renderAllocationForecast(projectId);
    });
}
function handleCloseProjectLoad() {
    destroyForecastChart();
    closeModal('project-load-modal');
    _currentLoadProjectId = null;
}
/** @param {LoadGranularity} granularity */
function handleSetLoadGranularity( granularity: any) {
    _currentLoadGranularity = granularity;
    if (_currentLoadProjectId) {
        renderLoadGrid(_currentLoadProjectId, granularity);
    }
    // Atualiza botoes ativos
    document.querySelectorAll('.load-gran-btn').forEach((btn: any) => {
        const button = (btn) as HTMLElement;
        button.classList.toggle('active', button.dataset.gran === granularity);
    });
}
// ----------------------------------------------------------------
// TIMESHEET HANDLERS
// ----------------------------------------------------------------
/** @param {string} projectId */
function handleOpenProjectTimesheet( projectId: any) {
    _currentTimesheetProjectId = projectId;
    _timesheetFilters = _getDefaultTimesheetFilters();
    _editingTimesheetEntryId = null;
    _editingTimesheetDraft = {};
    const today = _getTodayDateString();
    _timesheetFormDraft = { resourceId: '', phaseId: '', date: today, hours: '', notes: '' };
    _timesheetCalendarMonth = today.slice(0, 7);
    openModal('project-timesheet-modal');
    _renderProjectTimesheetModal(projectId);
}
function handleCloseProjectTimesheet() {
    closeModal('project-timesheet-modal');
    _currentTimesheetProjectId = null;
    _editingTimesheetEntryId = null;
    _editingTimesheetDraft = {};
    _timesheetFormDraft = {};
    _timesheetCalendarMonth = '';
}
/** @param {string} projectId */
function handleAddTimesheetEntry( projectId: any) {
    const resourceId = _timesheetFormDraft.resourceId || _fieldValue('timesheet-input-resource');
    const phaseId = _timesheetFormDraft.phaseId || _fieldValue('timesheet-input-phase');
    const date = _timesheetFormDraft.date || _fieldValue('timesheet-input-date');
    const hours = parseFloat(_fieldValue('timesheet-input-hours') || '');
    const notes = _fieldValue('timesheet-input-notes');
    const result: any = addTimesheetEntry({ projectId, resourceId, phaseId, date, hours, notes });
    if (!result.ok) {
        showToast(_translateTimesheetError(result.code), 'error');
        return;
    }
    const hoursInput = (document.getElementById('timesheet-input-hours')) as HTMLInputElement|null;
    const notesInput = (document.getElementById('timesheet-input-notes')) as HTMLInputElement|null;
    if (hoursInput) hoursInput.value = '';
    if (notesInput) notesInput.value = '';
    _timesheetFormDraft = { ..._timesheetFormDraft, resourceId, phaseId, date, hours: '', notes: '' };
    if (date) _timesheetCalendarMonth = date.slice(0, 7);
    showToast(t('timesheetAddSuccess') || 'Entry added', 'success');
    _renderProjectTimesheetModal(projectId);
}
/** @param {string} entryId @param {string} field @param {any} value */
function handleUpdateTimesheetEntry( entryId: any, field: any, value: any) {
    if (_editingTimesheetEntryId !== entryId) {
        _editingTimesheetEntryId = entryId;
        _editingTimesheetDraft = {};
    }
    _editingTimesheetDraft[field] = value;
}
/** @param {string} entryId */
function handleEditTimesheetEntry( entryId: any) {
    _editingTimesheetEntryId = entryId;
    _editingTimesheetDraft = {};
    if (_currentTimesheetProjectId) _renderProjectTimesheetModal(_currentTimesheetProjectId);
}
function handleCancelTimesheetEdit() {
    _editingTimesheetEntryId = null;
    _editingTimesheetDraft = {};
    if (_currentTimesheetProjectId) _renderProjectTimesheetModal(_currentTimesheetProjectId);
}
/** @param {string} entryId */
function handleSaveTimesheetEntry( entryId: any) {
    if (!_currentTimesheetProjectId) return;
    const payload = { ..._editingTimesheetDraft };
    if (Object.prototype.hasOwnProperty.call(payload, 'hours')) {
        payload.hours = parseFloat(payload.hours);
    }
    const result: any = updateTimesheetEntry(entryId, payload);
    if (!result.ok) {
        showToast(_translateTimesheetError(result.code), 'error');
        if (result.code === 'ENTRY_NOT_FOUND') {
            _editingTimesheetEntryId = null;
            _editingTimesheetDraft = {};
        }
        _renderProjectTimesheetModal(_currentTimesheetProjectId);
        return;
    }
    _editingTimesheetEntryId = null;
    _editingTimesheetDraft = {};
    showToast(t('timesheetUpdateSuccess') || 'Entry updated', 'success');
    _renderProjectTimesheetModal(_currentTimesheetProjectId);
}
/** @param {string} entryId */
async function handleRemoveTimesheetEntry( entryId: any) {
    const confirmed = await asyncConfirm(t('timesheetRemoveConfirm') || 'Remove this entry?');
    if (!confirmed) return;
    const result = removeTimesheetEntry(entryId);
    if (!result.ok) {
        showToast(_translateTimesheetError(result.code), 'error');
        if (_currentTimesheetProjectId) _renderProjectTimesheetModal(_currentTimesheetProjectId);
        return;
    }
    showToast(t('timesheetRemoveSuccess') || 'Entry removed', 'info');
    if (_currentTimesheetProjectId) _renderProjectTimesheetModal(_currentTimesheetProjectId);
}
/** @param {string} field @param {any} value */
function handleSetTimesheetFilter( field: any, value: any) {
    _timesheetFilters[field] = value || '';
    if (_currentTimesheetProjectId) _renderProjectTimesheetModal(_currentTimesheetProjectId);
}
function handleClearTimesheetFilters() {
    _timesheetFilters = _getDefaultTimesheetFilters();
    if (_currentTimesheetProjectId) _renderProjectTimesheetModal(_currentTimesheetProjectId);
}
/** @param {string} field @param {any} value */
function handleSetTimesheetInput( field: any, value: any) {
    _timesheetFormDraft[field] = value ?? '';
    if (field === 'date' && value) {
        _timesheetCalendarMonth = String(value).slice(0, 7);
    }
}
/** @param {number|string} offsetMonths */
function handleShiftTimesheetCalendar( offsetMonths: any) {
    const source = (_timesheetCalendarMonth || _getTodayDateString().slice(0, 7)) + '-01';
    const ref = new Date(`${source}T00:00:00`);
    ref.setMonth(ref.getMonth() + Number(offsetMonths || 0));
    const year = ref.getFullYear();
    const month = String(ref.getMonth() + 1).padStart(2, '0');
    _timesheetCalendarMonth = `${year}-${month}`;
    if (_currentTimesheetProjectId) _renderProjectTimesheetModal(_currentTimesheetProjectId);
}
/** @param {string} date */
function handleSelectTimesheetCalendarDate( date: any) {
    _timesheetFormDraft.date = date;
    _timesheetCalendarMonth = String(date).slice(0, 7);
    if (_currentTimesheetProjectId) _renderProjectTimesheetModal(_currentTimesheetProjectId);
}
// ----------------------------------------------------------------
// FORM RENDERING - Project
// ----------------------------------------------------------------
/** @param {string} projectId */
function _renderProjectForm( projectId: any) {
    const container = document.getElementById('project-form-content');
    if (!container) return;
    const project = (getProject(projectId)) as any|null;
    if (!project) return;
    const contracts = getContracts();
    const _wbsItems = getWbsItems().filter((w: any) => !w.parentId); // Raizes
    container.innerHTML = `
        <div class="form-group">
            <label class="form-label">${t('projectName') || 'Name'}</label>
            <input data-field-meta="true" data-field-meta-key="auto:project-name" type="text" id="project-name" class="form-input" value="${escapeAttr(project.name)}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">${t('projectType') || 'Type'}</label>
                <select data-field-meta="true" data-field-meta-key="auto:project-type" id="project-type" class="form-input">
                    <option value="remediation" ${project.type === 'remediation' ? 'selected' : ''}>${t('projectTypeRemediation') || 'Remediation'}</option>
                    <option value="monitoring" ${project.type === 'monitoring' ? 'selected' : ''}>${t('projectTypeMonitoring') || 'Monitoring'}</option>
                    <option value="investigation" ${project.type === 'investigation' ? 'selected' : ''}>${t('projectTypeInvestigation') || 'Investigation'}</option>
                    <option value="decommissioning" ${project.type === 'decommissioning' ? 'selected' : ''}>${t('projectTypeDecommissioning') || 'Decommissioning'}</option>
                    <option value="custom" ${project.type === 'custom' ? 'selected' : ''}>${t('projectTypeCustom') || 'Custom'}</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">${t('projectStatus') || 'Status'}</label>
                <select data-field-meta="true" data-field-meta-key="auto:project-status" id="project-status" class="form-input">
                    <option value="planning" ${project.status === 'planning' ? 'selected' : ''}>${t('statusPlanning') || 'Planning'}</option>
                    <option value="active" ${project.status === 'active' ? 'selected' : ''}>${t('statusActive') || 'Active'}</option>
                    <option value="on_hold" ${project.status === 'on_hold' ? 'selected' : ''}>${t('statusOnHold') || 'On Hold'}</option>
                    <option value="completed" ${project.status === 'completed' ? 'selected' : ''}>${t('statusCompleted') || 'Completed'}</option>
                    <option value="cancelled" ${project.status === 'cancelled' ? 'selected' : ''}>${t('statusCancelled') || 'Cancelled'}</option>
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">${t('startDate') || 'Start Date'}</label>
                    <input data-field-meta="true" data-field-meta-key="auto:project-start-date" type="date" id="project-start-date" class="form-input" value="${project.dates?.startDate || ''}">
            </div>
            <div class="form-group">
                <label class="form-label">${t('endDate') || 'End Date'}</label>
                    <input data-field-meta="true" data-field-meta-key="auto:project-end-date" type="date" id="project-end-date" class="form-input" value="${project.dates?.endDate || ''}">
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">${t('timesheetDailyTargetProject') || 'Daily target hours (Timesheet)'}</label>
            <input data-field-meta="true" data-field-meta-key="auto:project-timesheet-daily-target" type="number" id="project-timesheet-daily-target" class="form-input" min="0.25" step="0.25" value="${Number.isFinite(Number(project.timesheetDailyTargetHours)) && Number(project.timesheetDailyTargetHours) > 0 ? Number(project.timesheetDailyTargetHours) : 8}">
        </div>
        <div class="form-group">
            <label class="form-label">${t('description') || 'Description'}</label>
            <textarea data-field-meta="true" data-field-meta-key="auto:project-description" id="project-description" class="form-input" rows="2">${escapeHtml(project.description)}</textarea>
        </div>

        <!-- Phases -->
        <div class="gov-subsection">
            <div class="gov-subsection-header">
            <span>${t('phases') || 'Phases'} (${(project.phases || []).length})</span>
                <div style="display:flex;gap:4px">
                    <button class="btn btn-sm btn-primary" data-cc-call-click="handleAddProjectPhase|s:${encodeURIComponent(`${projectId}`)}">+ ${t('phase') || 'Phase'}</button>
                    <button class="btn btn-sm btn-secondary" data-cc-call-click="handleAddProjectMilestone|s:${encodeURIComponent(`${projectId}`)}">&#9670; ${t('milestone') || 'Milestone'}</button>
                </div>
            </div>
            ${(project.phases || []).map((phase: any) => _renderPhaseRow(projectId, phase, project.phases || [])).join('')}
        </div>

        <!-- Link contracts -->
        ${
            contracts.length > 0
                ? `
        <div class="gov-subsection">
            <div class="gov-subsection-header">
                <span>${t('linkContract') || 'Link Contract'}</span>
                <select data-field-meta="true" data-field-meta-key="auto-pos:projects:select:L629" class="form-input gov-template-select" data-cc-call-change="handleLinkContractToProject|s:${encodeURIComponent(`${projectId}`)}|v" data-cc-vreset="1">
                    <option value="">${t('selectContract') || 'Select...'}</option>
                    ${contracts
                        .filter((c: any) => !project.linkedContractIds.includes(c.id))
                        .map((c: any) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
                        .join('')}
                </select>
            </div>
            ${project.linkedContractIds
                .map((cid: any) => {
                    const c = contracts.find((x: any) => x.id === cid);
                    return c
                        ? `<div class="gov-party-row"><span>${escapeHtml(c.name)}</span>
                    <button class="btn btn-sm btn-danger" data-cc-call-click="handleUnlinkContractFromProject|s:${encodeURIComponent(`${projectId}`)}|s:${encodeURIComponent(`${cid}`)}" aria-label="Remove"><span data-icon="x" data-icon-size="12px"></span></button></div>`
                        : '';
                })
                .join('')}
        </div>`
                : ''
        }

        <div class="form-group">
            <label class="form-label">${t('notes') || 'Notes'}</label>
            <textarea data-field-meta="true" data-field-meta-key="auto:project-notes" id="project-notes" class="form-input" rows="2">${escapeHtml(project.notes)}</textarea>
        </div>
    `;
}
/** @param {string} projectId @param {any} phase @param {any[]} allPhases */
function _renderPhaseRow( projectId: any, phase: any, allPhases: any) {
    const otherPhases = allPhases.filter((p: any) => p.id !== phase.id);
    const deps = phase.dependencies || [];
    return `
        <div class="wbs-node" style="border-left: 3px solid ${phase.color || '#3b6bff'}">
            <div class="wbs-node-header">
                <span class="wbs-name">${phase.isMilestone ? '&#9670; ' : ''}
                    <input data-field-meta="true" data-field-meta-key="auto-pos:projects:input:L665" type="text" value="${escapeAttr(phase.name)}" class="form-input" style="width:140px;display:inline;font-size:0.8rem"
                        data-cc-call-change="handleUpdateProjectPhase|s:${encodeURIComponent(`${projectId}`)}|s:${encodeURIComponent(`${phase.id}`)}|s:name|v">
                </span>
                <button class="btn btn-sm btn-danger wbs-delete-btn" data-cc-call-click="handleRemoveProjectPhase|s:${encodeURIComponent(`${projectId}`)}|s:${encodeURIComponent(`${phase.id}`)}" title="Remove" aria-label="Remove"><span data-icon="x" data-icon-size="12px"></span></button>
            </div>
            <div class="wbs-node-fields">
                <label>${t('start') || 'Start'}:
                    <input data-field-meta="true" data-field-meta-key="auto-pos:projects:input:L672" type="date" value="${phase.startDate}" class="form-input wbs-field-input" style="width:120px"
                        data-cc-call-change="handleUpdateProjectPhase|s:${encodeURIComponent(`${projectId}`)}|s:${encodeURIComponent(`${phase.id}`)}|s:startDate|v">
                </label>
                <label>${t('end') || 'End'}:
                    <input data-field-meta="true" data-field-meta-key="auto-pos:projects:input:L676" type="date" value="${phase.endDate}" class="form-input wbs-field-input" style="width:120px"
                        data-cc-call-change="handleUpdateProjectPhase|s:${encodeURIComponent(`${projectId}`)}|s:${encodeURIComponent(`${phase.id}`)}|s:endDate|v">
                </label>
                ${
                    !phase.isMilestone
                        ? `
                <label>%:
                    <input data-field-meta="true" data-field-meta-key="auto-pos:projects:input:L683" type="number" min="0" max="100" value="${phase.percentComplete || 0}" class="form-input wbs-field-input" style="width:55px"
                        data-cc-call-change="handleUpdateProjectPhase|s:${encodeURIComponent(`${projectId}`)}|s:${encodeURIComponent(`${phase.id}`)}|s:percentComplete|v">
                </label>`
                        : ''
                }
                <label>${t('color') || 'Color'}:
                    <input type="color" value="${phase.color || '#3b6bff'}" style="width:28px;height:22px;padding:0;border:none;cursor:pointer"
                        data-cc-call-change="handleUpdateProjectPhase|s:${encodeURIComponent(`${projectId}`)}|s:${encodeURIComponent(`${phase.id}`)}|s:color|v">
                </label>
            </div>
            ${
                otherPhases.length > 0
                    ? `
            <div class="wbs-node-fields" style="margin-top:2px">
                <label>${t('dependsOn') || 'Depends on'}:
                    <select data-field-meta="true" data-field-meta-key="auto-pos:projects:select:L698" class="form-input" style="font-size:0.75rem;max-width:140px"
                        data-cc-call-change="handleAddPhaseDependency|s:${encodeURIComponent(`${projectId}`)}|s:${encodeURIComponent(`${phase.id}`)}|v" data-cc-vreset="1">
                        <option value="">+</option>
                        ${otherPhases
                            .filter((p: any) => !deps.includes(p.id))
                            .map((p: any) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
                            .join('')}
                    </select>
                </label>
                ${deps
                    .map((depId: any) => {
                        const dep = allPhases.find((p: any) => p.id === depId);
                        return dep
                            ? `<span class="gov-badge gov-status-active" style="cursor:pointer" title="${t('removeDep') || 'Click to remove'}"
                        data-cc-call-click="handleRemovePhaseDependency|s:${encodeURIComponent(`${projectId}`)}|s:${encodeURIComponent(`${phase.id}`)}|s:${encodeURIComponent(`${depId}`)}">
                        ${escapeHtml(dep.name)} &#215;
                    </span>`
                            : '';
                    })
                    .join('')}
            </div>`
                    : ''
            }
        </div>`;
}
// ----------------------------------------------------------------
// FORM RENDERING - Resource
// ----------------------------------------------------------------
/** @param {string|null} resourceId */
function _renderResourceForm( resourceId: any) {
    const container = document.getElementById('resource-form-content');
    if (!container) return;
    const resource = (resourceId ? getResource(resourceId) : null) as any|null;
    const levels = [
        { key: 'intern', label: t('resourceLevel_intern') || 'Intern' },
        { key: 'trainee', label: t('resourceLevel_trainee') || 'Trainee' },
        { key: 'junior', label: t('resourceLevel_junior') || 'Junior' },
        { key: 'mid', label: t('resourceLevel_mid') || 'Mid-level' },
        { key: 'senior', label: t('resourceLevel_senior') || 'Senior' },
        { key: 'specialist', label: t('resourceLevel_specialist') || 'Specialist' },
        { key: 'coordinator', label: t('resourceLevel_coordinator') || 'Coordinator' },
        { key: 'manager', label: t('resourceLevel_manager') || 'Manager' },
    ];
    container.innerHTML = `
        <div class="form-group">
            <label class="form-label">${t('resourceName') || 'Name'}</label>
            <input data-field-meta="true" data-field-meta-key="auto:resource-name" type="text" id="resource-name" class="form-input" value="${escapeAttr(resource?.name || '')}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">${t('resourceRole') || 'Role'}</label>
                <input data-field-meta="true" data-field-meta-key="auto:resource-role" type="text" id="resource-role" class="form-input" value="${escapeAttr(resource?.role || '')}" placeholder="${t('resourceRolePlaceholder') || 'e.g. Geologist'}">
            </div>
            <div class="form-group">
                <label class="form-label">${t('resourceLevel') || 'Level'}</label>
                <select data-field-meta="true" data-field-meta-key="auto:resource-level" id="resource-level" class="form-input">
                    ${levels.map((l: any) => `<option value="${l.key}" ${(resource?.level || 'mid') === l.key ? 'selected' : ''}>${l.label}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">${t('email') || 'Email'}</label>
            <input data-field-meta="true" data-field-meta-key="auto-pos:projects:input:L764" type="email" id="resource-email" class="form-input" value="${escapeAttr(resource?.email || '')}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">${t('hoursPerWeek') || 'Hours/Week'}</label>
                <input data-field-meta="true" data-field-meta-key="auto:resource-hours" type="number" id="resource-hours" class="form-input" value="${resource?.hoursPerWeek || 40}" min="1" max="80">
            </div>
            <div class="form-group">
                <label class="form-label">${t('costPerHour') || 'Cost/Hour'}</label>
                <input data-field-meta="true" data-field-meta-key="auto:resource-cost" type="number" id="resource-cost" class="form-input" value="${resource?.costPerHour || 0}" min="0" step="10">
            </div>
        </div>

        <!-- LGPD Consent -->
        <div class="gov-subsection" style="background:var(--bg-tertiary,#f8f9fa);padding:8px;border-radius:4px;margin-top:8px">
            <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px">
                <strong>LGPD — ${t('lgpdDisclaimer') || 'Lei Geral de Protecao de Dados'}</strong><br>
                ${t('lgpdPurpose') || 'Personal data (name, email) will be stored solely for the purpose of managing resource allocation in environmental projects. You have the right to withdraw consent at any time.'}
            </div>
            <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;cursor:pointer">
                <input data-field-meta="true" data-field-meta-key="auto:resource-consent" type="checkbox" id="resource-consent" ${resource?.consentGiven ? 'checked' : ''}>
                ${t('lgpdConsentLabel') || 'I consent to the storage of my personal data for this purpose'}
            </label>
        </div>
    `;
}
/**
 * Render timesheet modal content for a project.
 * @param {string} projectId
 */
function _renderProjectTimesheetModal( projectId: any) {
    const container = document.getElementById('project-timesheet-content');
    if (!container) return;
    _injectTimesheetStyles();
    const project = (getProject(projectId)) as any|null;
    if (!project) {
        container.innerHTML = `<div class="gov-empty">${t('loadNoProject') || 'Project not found.'}</div>`;
        return;
    }
    const title = document.getElementById('project-timesheet-title');
    if (title) {
        title.textContent = `${t('projectTimesheetTitle') || 'Timesheet'} — ${project.name || ''}`;
    }
    const resources = (getResources()).filter((r: any) => r.active && r.consentGiven) as any[];
    const phases = (project.phases || []).filter((p: any) => !p.isMilestone) as any[];
    const entries = (getTimesheetByProject(projectId, _timesheetFilters)) as any[];
    const summary = (getTimesheetSummary(projectId, _timesheetFilters)) as any;
    const overloads = _computeDailyOverloads(entries);
    const allProjectEntries = (getTimesheetByProject(projectId, {})) as any[];
    const createDisabled = resources.length === 0 || phases.length === 0;
    const today = _getTodayDateString();
    if (!_timesheetFormDraft.date) _timesheetFormDraft.date = today;
    if (!_timesheetFormDraft.resourceId && resources[0]) _timesheetFormDraft.resourceId = resources[0].id;
    if (!_timesheetFormDraft.phaseId && phases[0]) _timesheetFormDraft.phaseId = phases[0].id;
    if (!_timesheetCalendarMonth) _timesheetCalendarMonth = String(_timesheetFormDraft.date || today).slice(0, 7);
    const selectedDate = _timesheetFormDraft.date || today;
    const selectedResource = resources.find((r: any) => r.id === _timesheetFormDraft.resourceId) || null;
    const dayLoggedHours = allProjectEntries
        .filter((e: any) =>
                e.date === selectedDate &&
                (!_timesheetFormDraft.resourceId || e.resourceId === _timesheetFormDraft.resourceId),
        )
        .reduce((sum: any, e: any) => sum + (e.hours || 0), 0);
    const dailyTargetHours = _getProjectDailyTargetHours(project);
    const dailyRemainingHours = Math.max(0, _round2(dailyTargetHours - dayLoggedHours));
    const dailyProgressPercent =
        dailyTargetHours > 0 ? Math.min(100, Math.round((dayLoggedHours / dailyTargetHours) * 100)) : 0;
    const calendar = _buildTimesheetCalendar(projectId, _timesheetCalendarMonth, selectedDate, {
        resourceId: _timesheetFilters.resourceId,
        phaseId: _timesheetFilters.phaseId,
    });
    const warningEntries =
        entries.length > 500
            ? `<div class="gov-badge gov-status-terminated" style="display:inline-block;margin-bottom:8px">${t('timesheetEntryLimitWarning') || 'Project has many entries. Consider exporting.'}</div>`
            : '';
    const overloadWarning =
        overloads.length > 0
            ? `<div class="gov-badge gov-status-terminated" style="display:inline-block;margin-left:8px">${t('timesheetDailyOverloadWarning') || 'Resource with daily sum above 24h detected.'}</div>`
            : '';
    container.innerHTML = `
        ${warningEntries}${overloadWarning}
        <div class="gov-subsection">
            <div class="gov-subsection-header"><span>${t('timesheetCalendar') || 'Calendar'}</span></div>
            <div class="timesheet-calendar-topbar">
                <button class="btn btn-sm btn-secondary" data-cc-action="cc-0d448064" aria-label="${t('previous') || 'Previous'}">&larr;</button>
                <strong>${escapeHtml(calendar.label)}</strong>
                <button class="btn btn-sm btn-secondary" data-cc-action="cc-9b7a6f99" aria-label="${t('next') || 'Next'}">&rarr;</button>
            </div>
            <div class="timesheet-calendar-weekdays">
                <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
            </div>
            <div class="timesheet-calendar-grid">
                ${calendar.days
                    .map((day: any) => `
                    <button class="timesheet-calendar-day ${day.isCurrentMonth ? '' : 'is-outside'} ${day.isToday ? 'is-today' : ''} ${day.isSelected ? 'is-selected' : ''}"
                        data-cc-call-click="handleSelectTimesheetCalendarDate|s:${encodeURIComponent(`${day.date}`)}">
                        <span class="day-num">${day.day}</span>
                        <span class="day-hours">${day.totalHours > 0 ? `${day.totalHours}h` : ''}</span>
                    </button>
                `,
                    )
                    .join('')}
            </div>
            <div class="gov-card-info">
                <span><strong>${t('timesheetDate') || 'Date'}:</strong> ${escapeHtml(selectedDate)} | <strong>${t('timesheetResource') || 'Resource'}:</strong> ${escapeHtml(selectedResource?.name || t('all') || 'All')}</span>
            </div>
            <div class="gov-card-info">
                <span><strong>${t('timesheetDailyTarget') || 'Daily target'}:</strong> ${dailyTargetHours}h | <strong>${t('timesheetDayLogged') || 'Logged'}:</strong> ${_round2(dayLoggedHours)}h (${dailyProgressPercent}%) | <strong>${t('timesheetDayRemaining') || 'Remaining'}:</strong> ${dailyRemainingHours}h</span>
            </div>
        </div>
        <div class="gov-subsection">
            <div class="gov-subsection-header"><span>${t('timesheetFilterApply') || 'Apply'} / ${t('timesheetFilterClear') || 'Clear filters'}</span></div>
            <div class="gov-party-row" style="flex-wrap:wrap">
                <input data-field-meta="true" data-field-meta-key="auto-pos:projects:input:L888" type="date" class="form-input" value="${escapeAttr(_timesheetFilters.startDate || '')}"
                    data-cc-change="cc-da93e0a9" title="${t('timesheetFilterStartDate') || 'Start date'}">
                <input data-field-meta="true" data-field-meta-key="auto-pos:projects:input:L890" type="date" class="form-input" value="${escapeAttr(_timesheetFilters.endDate || '')}"
                    data-cc-change="cc-9e6d214c" title="${t('timesheetFilterEndDate') || 'End date'}">
                <select data-field-meta="true" data-field-meta-key="auto-pos:projects:select:L892" class="form-input" data-cc-change="cc-e626aa7c">
                    <option value="">${t('timesheetResource') || 'Resource'}: *</option>
                    ${resources.map((r: any) => `<option value="${r.id}" ${_timesheetFilters.resourceId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                </select>
                <select data-field-meta="true" data-field-meta-key="auto-pos:projects:select:L896" class="form-input" data-cc-change="cc-a30b639b">
                    <option value="">${t('timesheetPhase') || 'Phase'}: *</option>
                    ${phases.map((p: any) => `<option value="${p.id}" ${_timesheetFilters.phaseId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
                </select>
                <button class="btn btn-sm btn-secondary" data-cc-action="cc-fbc6d694">${t('timesheetFilterClear') || 'Clear filters'}</button>
            </div>
        </div>

        <div class="gov-subsection">
            <div class="gov-subsection-header"><span>${t('timesheetAdd') || 'Add'}</span></div>
            ${
                createDisabled
                    ? `<div class="gov-empty">${t('timesheetNoEligibleResources') || 'No active eligible resources available'}</div>`
                    : `
                <div class="gov-party-row" style="flex-wrap:wrap">
                    <select data-field-meta="true" data-field-meta-key="auto:timesheet-input-resource" class="form-input" id="timesheet-input-resource" data-cc-change="cc-a5cdf200">
                        ${resources.map((r: any) => `<option value="${r.id}" ${_timesheetFormDraft.resourceId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                    </select>
                    <select data-field-meta="true" data-field-meta-key="auto:timesheet-input-phase" class="form-input" id="timesheet-input-phase" data-cc-change="cc-dbc569ff">
                        ${phases.map((p: any) => `<option value="${p.id}" ${_timesheetFormDraft.phaseId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
                    </select>
                    <input data-field-meta="true" data-field-meta-key="auto:timesheet-input-date" type="date" class="form-input" id="timesheet-input-date" value="${escapeAttr(selectedDate)}" data-cc-change="cc-4fdde8b1">
                    <input data-field-meta="true" data-field-meta-key="auto:timesheet-input-hours" type="number" class="form-input" id="timesheet-input-hours" min="0.25" max="24" step="0.25" placeholder="${t('timesheetHours') || 'Hours'}" value="${escapeAttr(String(_timesheetFormDraft.hours || ''))}" data-cc-change="cc-eaef80f6">
                    <input data-field-meta="true" data-field-meta-key="auto:timesheet-input-notes" type="text" class="form-input" id="timesheet-input-notes" maxlength="500" placeholder="${t('timesheetNotes') || 'Notes'}" value="${escapeAttr(_timesheetFormDraft.notes || '')}" data-cc-change="cc-eddc14a4">
                    <button class="btn btn-sm btn-primary" data-cc-call-click="handleAddTimesheetEntry|s:${encodeURIComponent(`${projectId}`)}">${t('timesheetAdd') || 'Add'}</button>
                </div>
            `
            }
        </div>

        <div class="gov-subsection">
            <div class="gov-subsection-header"><span>${t('timesheetTotalHours') || 'Total hours'}: ${summary.totalHours}h | ${t('timesheetEntryCount') || 'Entries'}: ${summary.entryCount}</span></div>
            <div class="gov-card-info">
                <span><strong>${t('timesheetByResource') || 'By resource'}:</strong> ${summary.byResource.map((r: any) => `${escapeHtml(r.name)} (${r.hours}h)`).join(', ') || '-'}</span>
            </div>
            <div class="gov-card-info">
                <span><strong>${t('timesheetByPhase') || 'By phase'}:</strong> ${summary.byPhase.map((p: any) => `${escapeHtml(p.name)} (${p.hours}h)`).join(', ') || '-'}</span>
            </div>
        </div>

        <div class="gov-subsection">
            <div class="gov-subsection-header"><span>${t('timesheetEntryCount') || 'Entries'} (${entries.length})</span></div>
            <div class="timesheet-table-wrap">
                <table class="timesheet-table">
                    <thead>
                        <tr>
                            <th>${t('timesheetDate') || 'Date'}</th>
                            <th>${t('timesheetResource') || 'Resource'}</th>
                            <th>${t('timesheetPhase') || 'Phase'}</th>
                            <th>${t('timesheetHours') || 'Hours'}</th>
                            <th>${t('timesheetNotes') || 'Notes'}</th>
                            <th>${t('actions') || 'Actions'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${entries.map((entry: any) => _renderTimesheetRow(entry, resources, phases)).join('') || `<tr><td colspan="6" class="gov-empty">-</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}
/** @param {any} entry @param {any[]} resources @param {any[]} phases */
function _renderTimesheetRow( entry: any, resources: any, phases: any) {
    const isEditing = _editingTimesheetEntryId === entry.id;
    const draft = isEditing ? { ...entry, ..._editingTimesheetDraft } : entry;
    const resourceName = resources.find((r: any) => r.id === entry.resourceId)?.name || entry.resourceId;
    const phaseName = phases.find((p: any) => p.id === entry.phaseId)?.name || entry.phaseId;
    if (!isEditing) {
        return `
            <tr>
                <td>${escapeHtml(entry.date)}</td>
                <td>${escapeHtml(resourceName)}</td>
                <td>${escapeHtml(phaseName)}</td>
                <td>${entry.hours}</td>
                <td>${escapeHtml(entry.notes || '')}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" data-cc-call-click="handleEditTimesheetEntry|s:${encodeURIComponent(`${entry.id}`)}">${t('timesheetEdit') || 'Edit'}</button>
                    <button class="btn btn-sm btn-danger" data-cc-call-click="handleRemoveTimesheetEntry|s:${encodeURIComponent(`${entry.id}`)}">${t('timesheetRemove') || 'Remove'}</button>
                </td>
            </tr>`;
    }
    return `
        <tr>
            <td><input data-field-meta="true" data-field-meta-key="auto-pos:projects:input:L982" type="date" class="form-input" value="${escapeAttr(draft.date || '')}" data-cc-call-change="handleUpdateTimesheetEntry|s:${encodeURIComponent(`${entry.id}`)}|s:date|v"></td>
            <td>
                <select data-field-meta="true" data-field-meta-key="auto-pos:projects:select:L984" class="form-input" data-cc-call-change="handleUpdateTimesheetEntry|s:${encodeURIComponent(`${entry.id}`)}|s:resourceId|v">
                    ${resources.map((r: any) => `<option value="${r.id}" ${draft.resourceId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                </select>
            </td>
            <td>
                <select data-field-meta="true" data-field-meta-key="auto-pos:projects:select:L989" class="form-input" data-cc-call-change="handleUpdateTimesheetEntry|s:${encodeURIComponent(`${entry.id}`)}|s:phaseId|v">
                    ${phases.map((p: any) => `<option value="${p.id}" ${draft.phaseId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
                </select>
            </td>
            <td><input data-field-meta="true" data-field-meta-key="auto-pos:projects:input:L993" type="number" class="form-input" min="0.25" max="24" step="0.25" value="${draft.hours}" data-cc-call-change="handleUpdateTimesheetEntry|s:${encodeURIComponent(`${entry.id}`)}|s:hours|v"></td>
            <td><input data-field-meta="true" data-field-meta-key="auto-pos:projects:input:L994" type="text" class="form-input" maxlength="500" value="${escapeAttr(draft.notes || '')}" data-cc-call-change="handleUpdateTimesheetEntry|s:${encodeURIComponent(`${entry.id}`)}|s:notes|v"></td>
            <td>
                <button class="btn btn-sm btn-primary" data-cc-call-click="handleSaveTimesheetEntry|s:${encodeURIComponent(`${entry.id}`)}">${t('timesheetSave') || 'Save'}</button>
                <button class="btn btn-sm btn-secondary" data-cc-action="cc-3773d53c">${t('timesheetCancel') || 'Cancel'}</button>
            </td>
        </tr>`;
}
/** @param {any[]} entries */
function _computeDailyOverloads( entries: any) {
    const map = (new Map()) as Map<string, number>;
    for (const e of entries) {
        const key = `${e.resourceId}|${e.date}`;
        map.set(key, (map.get(key) || 0) + e.hours);
    }
    return [...map.entries()].filter(([, hours]) => hours > 24);
}
function _getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
/** @param {number} value */
function _round2( value: any) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
/** @param {any} project */
function _getProjectDailyTargetHours( project: any) {
    const parsed = Number(project?.timesheetDailyTargetHours);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
}
/** @param {string} projectId @param {string} monthIso @param {string} selectedDate @param {Record<string, any>} [filters] */
function _buildTimesheetCalendar( projectId: any, monthIso: any, selectedDate: any, filters: any = {}) {
    const safeMonth = /^\d{4}-\d{2}$/.test(monthIso || '') ? monthIso : _getTodayDateString().slice(0, 7);
    const year = Number(safeMonth.slice(0, 4));
    const monthIndex = Number(safeMonth.slice(5, 7)) - 1;
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const monthStart = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    const filtered = (getTimesheetByProject(projectId, {
            startDate: monthStart,
            endDate: monthEnd,
            resourceId: filters.resourceId || '',
            phaseId: filters.phaseId || '',
        })) as any[];
    const totalsByDate = (new Map()) as Map<string, number>;
    for (const entry of filtered) {
        totalsByDate.set(entry.date, _round2((totalsByDate.get(entry.date) || 0) + entry.hours));
    }
    const mondayIndex = (firstDay.getDay() + 6) % 7;
    const daysInMonth = lastDay.getDate();
    const days = ([]) as any[];
    const today = _getTodayDateString();
    for (let i = 0; i < 42; i += 1) {
        const relativeDay = i - mondayIndex + 1;
        const date = new Date(year, monthIndex, relativeDay);
        const dateIso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const isCurrentMonth = relativeDay >= 1 && relativeDay <= daysInMonth;
        days.push({
            date: dateIso,
            day: date.getDate(),
            isCurrentMonth,
            isToday: dateIso === today,
            isSelected: dateIso === selectedDate,
            totalHours: totalsByDate.get(dateIso) || 0,
        });
    }
    const label = firstDay.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return { label, days };
}
function _getDefaultTimesheetFilters() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
        startDate: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
        endDate: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
        resourceId: '',
        phaseId: '',
    };
}
/** @param {string} code */
function _translateTimesheetError( code: any) {
    const map = ({
        INVALID_PROJECT: t('timesheetErrorInvalidProject') || 'Invalid project',
        INVALID_PHASE: t('timesheetErrorInvalidPhase') || 'Invalid phase',
        PHASE_PROJECT_MISMATCH: t('timesheetErrorPhaseProjectMismatch') || 'Phase does not belong to project',
        INVALID_RESOURCE: t('timesheetErrorInvalidResource') || 'Invalid resource',
        MILESTONE_NOT_ALLOWED: t('timesheetErrorMilestoneNotAllowed') || 'Cannot log hours on milestone',
        INVALID_DATE_FORMAT: t('timesheetErrorInvalidDateFormat') || 'Invalid date format',
        INVALID_DATE: t('timesheetErrorInvalidDate') || 'Invalid date',
        DATE_OUT_OF_RANGE: t('timesheetErrorDateOutOfRange') || 'Date outside phase/project range',
        INVALID_HOURS: t('timesheetErrorInvalidHours') || 'Invalid hours',
        HOURS_NOT_POSITIVE: t('timesheetErrorHoursNotPositive') || 'Hours must be greater than zero',
        HOURS_EXCEEDS_MAX: t('timesheetErrorHoursExceedsMax') || 'Maximum 24 hours per entry',
        HOURS_NOT_QUARTER: t('timesheetErrorHoursNotQuarter') || 'Hours must be a multiple of 0.25',
        ENTRY_NOT_FOUND: t('timesheetConflict') || 'Entry was removed by another operation',
    }) as Record<string, string>;
    return map[code] || code || t('timesheetErrorInvalidHours') || 'Invalid entry';
}
function _injectTimesheetStyles() {
    if (document.getElementById('timesheet-styles')) return;
    const style = document.createElement('style');
    style.id = 'timesheet-styles';
    style.textContent = `
        .timesheet-calendar-topbar { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
        .timesheet-calendar-weekdays { display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); gap:4px; margin-bottom:4px; font-size:0.7rem; color:var(--text-secondary,#666); text-align:center; }
        .timesheet-calendar-grid { display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); gap:4px; margin-bottom:8px; }
        .timesheet-calendar-day { border:1px solid var(--border-color,#e6e6e6); border-radius:6px; background:var(--bg-primary,#fff); padding:6px 4px; min-height:56px; display:flex; flex-direction:column; align-items:flex-start; gap:4px; cursor:pointer; }
        .timesheet-calendar-day .day-num { font-size:0.75rem; font-weight:600; }
        .timesheet-calendar-day .day-hours { font-size:0.7rem; color:var(--text-secondary,#666); }
        .timesheet-calendar-day.is-outside { opacity:0.45; }
        .timesheet-calendar-day.is-today { border-color:var(--warning-color,#d48806); }
        .timesheet-calendar-day.is-selected { outline:2px solid var(--primary-color,#3b6bff); }
        .timesheet-table-wrap { overflow: auto; max-height: 360px; border: 1px solid var(--border-color, #e6e6e6); border-radius: 4px; }
        .timesheet-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .timesheet-table th, .timesheet-table td { border-bottom: 1px solid var(--border-color, #eee); padding: 6px; vertical-align: middle; }
        .timesheet-table thead th { position: sticky; top: 0; background: var(--bg-primary, #fff); z-index: 1; }
        .timesheet-table td input, .timesheet-table td select { min-width: 100px; }
    `;
    document.head.appendChild(style);
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export const projectRegistryHandlers = {
    handleAddProject,
    handleEditProject,
    handleRemoveProject,
    handleSaveProject,
    handleAddProjectPhase,
    handleAddProjectMilestone,
    handleUpdateProjectPhase,
    handleRemoveProjectPhase,
    handleAddPhaseDependency,
    handleRemovePhaseDependency,
    handleOpenProjectGantt,
    handleCloseProjectGantt,
    handleLinkContractToProject,
    handleUnlinkContractFromProject,
    handleLinkWbsToProject,
    handleLinkMacToProject,
    handleLinkCampaignToProject,
    handleUnlinkCampaignFromProject,
    handleAddResource,
    handleEditResource,
    handleRemoveResource,
    handleSaveResource,
    handleAnonymizeResource,
    handleWithdrawResourceConsent,
    handleAddAllocation,
    handleUpdateAllocation,
    handleRemoveAllocation,
    handleOpenProjectLoad,
    handleCloseProjectLoad,
    handleSetLoadGranularity,
    handleOpenProjectTimesheet,
    handleCloseProjectTimesheet,
    handleAddTimesheetEntry,
    handleUpdateTimesheetEntry,
    handleEditTimesheetEntry,
    handleSaveTimesheetEntry,
    handleCancelTimesheetEdit,
    handleRemoveTimesheetEntry,
    handleSetTimesheetFilter,
    handleClearTimesheetFilters,
    handleSetTimesheetInput,
    handleShiftTimesheetCalendar,
    handleSelectTimesheetCalendarDate,
};
