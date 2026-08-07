// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   TIME KEEPER PANEL — Cross-project time tracking section
   Painel de rastreio de horas — visao consolidada cross-projeto

   SECOES:
   1. Resumo: horas na semana, no mes e total historico
   2. Timer ao vivo: clock-in/clock-out com selects em cascata
   3. Lancamento rapido: entrada de horas sem abrir modal de projeto
   4. Tabela cross-projeto: todos os lancamentos com filtros

   ESTADO:
   - Timer persiste em localStorage 'ecbyts-timer-state' (Category A)
   - _elapsedInterval: referencia do setInterval (nao reiniciar a cada render)
   - _tkDraft / _tkTimerDraft: rascunhos dos formularios
   ================================================================ */
import { getProjects, getResources, getTimesheetByProject } from '../governance/projectManager.js';
import { t } from '../i18n/translations.js';
import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { attachModalA11y } from './modalA11y.js';
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
/** Rascunho do formulario de lancamento rapido */
let _tkDraft = /** @type {Record<string, string>} */ ({ projectId: '', phaseId: '', resourceId: '', date: '', hours: '', notes: '' });
/** Filtros da tabela cross-projeto */
let _tkFilters = /** @type {Record<string, string>} */ ({ projectId: '', resourceId: '', startDate: '', endDate: '' });
/** Referencia do setInterval do elapsed display — nao reiniciar se ja ativo */
/** @type {any} */
let _elapsedInterval: any = null;
/** Rascunho dos campos do timer (projeto/fase/recurso/notas) */
const _tkTimerDraft = ({ projectId: '', phaseId: '', resourceId: '', notes: '' }) as Record<string, string>;
// ----------------------------------------------------------------
// TIMER STATE (localStorage)
// ----------------------------------------------------------------
const TIMER_STORAGE_KEY = 'ecbyts-timer-state';
/**
 * Get current timer state from localStorage.
 * Obtem estado atual do timer do localStorage.
 * @returns {{running:boolean, startedAt:number, projectId:string, phaseId:string, resourceId:string, notes:string}}
 */
export function getTimerState() {
    try {
        const raw = localStorage.getItem(TIMER_STORAGE_KEY) || '';
        return raw ? JSON.parse(raw) : /** @type {any} */ ({ running: false });
    }
    catch (e: any) {
        console.debug('[timekeeperPanel] getState:', /** @type {any} */ (e)?.message || e);
        return /** @type {any} */ ({ running: false });
    }
}
/**
 * Save timer state to localStorage.
 * @param {any} state
 */
export function saveTimerState(state: any) {
    try {
        localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state));
    }
    catch (e: any) {
        console.debug('[timekeeperPanel] saveState:', /** @type {any} */ (e)?.message || e);
        /* quota — silently ignore */
    }
}
/**
 * Clear timer state from localStorage.
 */
export function clearTimerState() {
    localStorage.removeItem(TIMER_STORAGE_KEY);
}
// ----------------------------------------------------------------
// ELAPSED INTERVAL
// ----------------------------------------------------------------
/**
 * Start the 1-second interval that updates only #tk-elapsed-display.
 * Inicia tick de 1s que atualiza apenas o display de tempo decorrido.
 * Guarda-se a referencia em _elapsedInterval para evitar multiplos intervals.
 */
export function initTimekeeperInterval() {
    if (_elapsedInterval)
        return;
    const state = getTimerState();
    if (!state.running)
        return;
    _elapsedInterval = setInterval(() => {
        const el = (document.getElementById('tk-elapsed-display')) as any;
        if (!el) {
            clearTimekeeperInterval();
            return;
        }
        const s = getTimerState();
        if (!s.running) {
            clearTimekeeperInterval();
            el.textContent = '00:00:00';
            return;
        }
        el.textContent = _formatElapsed(Date.now() - s.startedAt);
    }, 1000);
}
/**
 * Stop the elapsed interval.
 * Para o tick de elapsed.
 */
export function clearTimekeeperInterval() {
    if (_elapsedInterval) {
        clearInterval(_elapsedInterval);
        _elapsedInterval = null;
    }
}
// ----------------------------------------------------------------
// DRAFT MUTATIONS (called by handlers, triggers partial re-render)
// ----------------------------------------------------------------
/**
 * Update a field of the quick-add draft and re-render the form.
 * @param {string} field
 * @param {string} value
 */
export function updateTimekeeperDraft(field: any, value: any) {
    ((_tkDraft as Record<string,any>))[field] = value;
    // If project changed, reset phase (cascade)
    if (field === 'projectId')
        _tkDraft.phaseId = '';
    _rerenderQuickAddForm();
}
/**
 * Update a field of the timer draft and re-render the timer card.
 * @param {string} field
 * @param {string} value
 */
export function updateTimerDraft(field: any, value: any) {
    _tkTimerDraft[field] = value;
    if (field === 'projectId')
        _tkTimerDraft.phaseId = '';
    _rerenderTimerCard();
}
/**
 * Update cross-project table filters and re-render the table.
 * @param {string} field
 * @param {string} value
 */
export function updateTimekeeperFilters(field: any, value: any) {
    ((_tkFilters as Record<string,any>))[field] = value;
    _rerenderEntriesTable();
}
/**
 * Clear all filters.
 */
export function clearTimekeeperFilters() {
    _tkFilters = { projectId: '', resourceId: '', startDate: '', endDate: '' };
    _rerenderEntriesTable();
}
/**
 * Get a copy of the current quick-add draft.
 * Retorna copia do rascunho do formulario de lancamento rapido.
 * @returns {any}
 */
export function getTimekeeperDraft() {
    const today = new Date().toISOString().slice(0, 10);
    return {
        ..._tkDraft,
        date: _tkDraft.date || today,
    };
}
/**
 * Clear the quick-add draft (after successful submission).
 * Limpa o rascunho apos lancamento bem-sucedido.
 */
export function clearTimekeeperDraft() {
    _tkDraft = { projectId: '', phaseId: '', resourceId: '', date: '', hours: '', notes: '' };
    _rerenderQuickAddForm();
}
// ----------------------------------------------------------------
// MAIN RENDER
// ----------------------------------------------------------------
/**
 * Render the full Time Keeper section HTML.
 * Renderiza a secao Time Keeper completa para insercao no governance panel.
 * @returns {string} HTML string
 */
export function renderTimekeeperSection() {
    // Sync timer draft from running state so selects reflect saved values
    const timerState = getTimerState();
    if (timerState.running) {
        _tkTimerDraft.projectId = timerState.projectId || '';
        _tkTimerDraft.phaseId = timerState.phaseId || '';
        _tkTimerDraft.resourceId = timerState.resourceId || '';
        _tkTimerDraft.notes = timerState.notes || '';
    }
    injectTimekeeperStyles();
    return `
        <div class="section collapsed" data-section-id="gov-timekeeper">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span>${t('timekeeperSection') || 'Time Keeper'}</span>
                <span class="section-chevron">&#9660;</span>
            </div>
            <div class="section-content">
                ${_renderSummaryCards()}
                <div id="tk-timer-card-wrapper">
                    ${_renderTimerCard()}
                </div>
                <div id="tk-quick-form-wrapper">
                    ${_renderQuickAddForm()}
                </div>
                <div id="tk-entries-wrapper">
                    ${_renderEntriesTable()}
                </div>
            </div>
        </div>
    `;
}
// ----------------------------------------------------------------
// SUMMARY CARDS
// ----------------------------------------------------------------
/**
 * Render 3 KPI summary cards: this week / this month / all-time.
 * Renderiza 3 cards de resumo: semana, mes e historico total.
 * @returns {string}
 */
function _renderSummaryCards() {
    const allEntries = _getAggregatedEntries({});
    const now = new Date();
    // Start of current ISO week (Monday)
    const dayOfWeek = now.getDay(); // 0=Sun
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + diffToMonday);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    // Start of current month
    const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    let weekHours = 0;
    let monthHours = 0;
    let totalHours = 0;
    for (const e of allEntries) {
        totalHours += e.hours;
        if (e.date >= weekStartStr)
            weekHours += e.hours;
        if (e.date >= monthStartStr)
            monthHours += e.hours;
    }
    /**
     * @param {any} h
     */
    const fmt = (h: any) => {
        const rounded = Math.round(h * 100) / 100;
        return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2);
    };
    return `
        <div class="timekeeper-summary">
            <div class="timekeeper-kpi-card">
                <div class="timekeeper-kpi-value">${fmt(weekHours)}</div>
                <div class="timekeeper-kpi-label">${t('timekeeperSummaryWeek') || 'This week'}</div>
            </div>
            <div class="timekeeper-kpi-card">
                <div class="timekeeper-kpi-value">${fmt(monthHours)}</div>
                <div class="timekeeper-kpi-label">${t('timekeeperSummaryMonth') || 'This month'}</div>
            </div>
            <div class="timekeeper-kpi-card">
                <div class="timekeeper-kpi-value">${fmt(totalHours)}</div>
                <div class="timekeeper-kpi-label">${t('timesheetTotalHours') || 'Total hours'}</div>
            </div>
        </div>
    `;
}
// ----------------------------------------------------------------
// TIMER CARD
// ----------------------------------------------------------------
/**
 * Render the live timer card (clock-in / clock-out).
 * Renderiza o card do timer ao vivo com selects em cascata.
 * @returns {string}
 */
function _renderTimerCard() {
    const state = getTimerState();
    const projects = getProjects().filter((p: any) => p.status === 'active' || p.status === 'planning');
    const resources = getResources().filter((r: any) => r.active !== false);
    const projectOptions = projects
        .map((p: any) => `<option value="${escapeAttr(p.id)}" ${_tkTimerDraft.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`)
        .join('');
    const selectedProject = (projects.find((p: any) => p.id === _tkTimerDraft.projectId)) as any;
    const phases = (selectedProject?.phases || []).filter((ph: any) => !ph.isMilestone);
    const phaseOptions = phases
        .map((ph: any) => `<option value="${escapeAttr(ph.id)}" ${_tkTimerDraft.phaseId === ph.id ? 'selected' : ''}>${escapeHtml(ph.name)}</option>`)
        .join('');
    const resourceOptions = resources
        .map((r: any) => `<option value="${escapeAttr(r.id)}" ${_tkTimerDraft.resourceId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`)
        .join('');
    const elapsed = state.running ? _formatElapsed(Date.now() - state.startedAt) : '00:00:00';
    const isRunning = state.running;
    return `
        <div class="timekeeper-timer-card ${isRunning ? 'timekeeper-timer-running' : ''}">
            <div class="timekeeper-timer-header">
                <span class="timekeeper-timer-label">
                    ${isRunning
        ? `&#9679; ${t('timekeeperTimerRunning') || 'Timer running'}`
        : t('timekeeperTimer') || 'Live Timer'}
                </span>
                <span class="timekeeper-elapsed" id="tk-elapsed-display">${elapsed}</span>
            </div>
            <div class="timekeeper-timer-fields">
                <select data-field-meta="true" data-field-meta-key="auto-pos:timekeeperPanel:select:L348" class="form-input form-input-sm"
                    data-cc-change="cc-eb67bcc2"
                    ${isRunning ? 'disabled' : ''}>
                    <option value="">${t('timekeeperAllProjects') || 'All projects'}</option>
                    ${projectOptions}
                </select>
                <select data-field-meta="true" data-field-meta-key="auto-pos:timekeeperPanel:select:L354" class="form-input form-input-sm"
                    data-cc-change="cc-5cb28914"
                    ${isRunning || !_tkTimerDraft.projectId ? 'disabled' : ''}>
                    <option value="">${t('timesheetPhase') || 'Phase'}</option>
                    ${phaseOptions}
                </select>
                <select data-field-meta="true" data-field-meta-key="auto-pos:timekeeperPanel:select:L360" class="form-input form-input-sm"
                    data-cc-change="cc-f9e82bd5"
                    ${isRunning ? 'disabled' : ''}>
                    <option value="">${t('timesheetResource') || 'Resource'}</option>
                    ${resourceOptions}
                </select>
                <input data-field-meta="true" data-field-meta-key="auto-pos:timekeeperPanel:input:L366" type="text" class="form-input form-input-sm"
                    placeholder="${t('timesheetNotes') || 'Notes'}"
                    value="${escapeAttr(_tkTimerDraft.notes)}"
                    data-cc-input="cc-efd2cab7">
            </div>
            <div class="timekeeper-timer-actions">
                ${isRunning
        ? `<button class="btn btn-sm btn-danger" data-cc-action="cc-5d6fe337">
                           &#9632; ${t('timekeeperTimerStop') || 'Stop &amp; Log'}
                       </button>`
        : `<button class="btn btn-sm btn-primary" data-cc-action="cc-6cffd2e3">
                           &#9654; ${t('timekeeperTimerStart') || 'Start'}
                       </button>`}
            </div>
        </div>
    `;
}
// ----------------------------------------------------------------
// QUICK ADD FORM
// ----------------------------------------------------------------
/**
 * Render the quick-add timesheet entry form (cross-project).
 * Renderiza o formulario de lancamento rapido cross-projeto.
 * @returns {string}
 */
function _renderQuickAddForm() {
    const today = new Date().toISOString().slice(0, 10);
    const projects = getProjects().filter((p: any) => p.status === 'active' || p.status === 'planning');
    const resources = getResources().filter((r: any) => r.active !== false);
    const projectOptions = projects
        .map((p: any) => `<option value="${escapeAttr(p.id)}" ${_tkDraft.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`)
        .join('');
    const selectedProject = (projects.find((p: any) => p.id === _tkDraft.projectId)) as any;
    const phases = (selectedProject?.phases || []).filter((ph: any) => !ph.isMilestone);
    const phaseOptions = phases
        .map((ph: any) => `<option value="${escapeAttr(ph.id)}" ${_tkDraft.phaseId === ph.id ? 'selected' : ''}>${escapeHtml(ph.name)}</option>`)
        .join('');
    const resourceOptions = resources
        .map((r: any) => `<option value="${escapeAttr(r.id)}" ${_tkDraft.resourceId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`)
        .join('');
    return `
        <div class="timekeeper-quick-form">
            <div class="timekeeper-quick-form-title">${t('timekeeperQuickAdd') || 'Quick Entry'}</div>
            <div class="timekeeper-quick-form-fields">
                <select data-field-meta="true" data-field-meta-key="auto-pos:timekeeperPanel:select:L427" class="form-input form-input-sm"
                    data-cc-change="cc-0f2987e5">
                    <option value="">${t('timekeeperAllProjects') || 'Select project...'}</option>
                    ${projectOptions}
                </select>
                <select data-field-meta="true" data-field-meta-key="auto-pos:timekeeperPanel:select:L432" class="form-input form-input-sm"
                    data-cc-change="cc-44d14487"
                    ${!_tkDraft.projectId ? 'disabled' : ''}>
                    <option value="">${t('timesheetPhase') || 'Phase'}</option>
                    ${phaseOptions}
                </select>
                <select data-field-meta="true" data-field-meta-key="auto-pos:timekeeperPanel:select:L438" class="form-input form-input-sm"
                    data-cc-change="cc-69291f78">
                    <option value="">${t('timesheetResource') || 'Resource'}</option>
                    ${resourceOptions}
                </select>
                <input data-field-meta="true" data-field-meta-key="auto-pos:timekeeperPanel:input:L443" type="date" class="form-input form-input-sm"
                    value="${escapeAttr(_tkDraft.date || today)}"
                    data-cc-input="cc-51270b49">
                <input data-field-meta="true" data-field-meta-key="auto-pos:timekeeperPanel:input:L446" type="number" class="form-input form-input-sm"
                    placeholder="${t('timesheetHours') || 'Hours'}"
                    min="0.25" max="24" step="0.25"
                    value="${escapeAttr(_tkDraft.hours)}"
                    data-cc-input="cc-9104ba5e">
                <input data-field-meta="true" data-field-meta-key="auto-pos:timekeeperPanel:input:L451" type="text" class="form-input form-input-sm"
                    placeholder="${t('timesheetNotes') || 'Notes'}"
                    value="${escapeAttr(_tkDraft.notes)}"
                    data-cc-input="cc-45954d4c">
                <button class="btn btn-sm btn-primary" data-cc-action="cc-85ebcd4d">
                    + ${t('timesheetAdd') || 'Add'}
                </button>
            </div>
        </div>
    `;
}
// ----------------------------------------------------------------
// ENTRIES TABLE
// ----------------------------------------------------------------
/**
 * Render the cross-project entries table with filters.
 * Renderiza a tabela cross-projeto com filtros de projeto, recurso e periodo.
 * @returns {string}
 */
function _renderEntriesTable() {
    const allProjects = getProjects();
    const allResources = getResources();
    const entries = _getAggregatedEntries(_tkFilters);
    const projectFilterOpts = allProjects
        .map((p: any) => `<option value="${escapeAttr(p.id)}" ${_tkFilters.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`)
        .join('');
    const resourceFilterOpts = allResources
        .map((r: any) => `<option value="${escapeAttr(r.id)}" ${_tkFilters.resourceId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`)
        .join('');
    // Build project name lookup
    /** @type {Record<string, any>} */ const projectNames: any = {};
    for (const p of /** @type {*} */ (allProjects))
        projectNames[p.id] = p.name;
    // Build phase name lookup across all projects
    /** @type {Record<string, any>} */ const phaseNames: any = {};
    for (const p of /** @type {*} */ (allProjects)) {
        for (const ph of p.phases || []) {
            phaseNames[ph.id] = ph.name;
        }
    }
    // Build resource name lookup
    /** @type {Record<string, any>} */ const resourceNames: any = {};
    for (const r of /** @type {*} */ (allResources))
        resourceNames[r.id] = r.name;
    const rows = entries
        .slice(0, 100)
        .map((/** @type {any} */ e) => `
        <tr>
            <td class="tk-cell-date">${escapeHtml(e.date)}</td>
            <td class="tk-cell-project">
                <span class="timekeeper-badge-project">${escapeHtml(projectNames[e.projectId] || e.projectId)}</span>
            </td>
            <td>${escapeHtml(phaseNames[e.phaseId] || e.phaseId)}</td>
            <td>${escapeHtml(resourceNames[e.resourceId] || e.resourceId)}</td>
            <td class="tk-cell-hours">${e.hours}</td>
            <td class="tk-cell-notes">${escapeHtml(e.notes || '')}</td>
        </tr>
    `)
        .join('');
    const totalFiltered = entries.reduce((/** @type {any} */ s, e: any) => s + e.hours, 0);
    const totalRounded = Math.round(totalFiltered * 100) / 100;
    return `
        <div class="timekeeper-entries-section">
            <div class="timekeeper-entries-header">
                <span class="timekeeper-entries-title">${t('timekeeperAllEntries') || 'All Entries'}</span>
                <span class="timekeeper-entries-total">${totalRounded}h</span>
            </div>
            <div class="timekeeper-filters">
                <select data-field-meta="true" data-field-meta-key="auto-pos:timekeeperPanel:select:L535" class="form-input form-input-sm"
                    data-cc-change="cc-acffd7fc">
                    <option value="">${t('timekeeperFilterProject') || 'Filter by project'}</option>
                    ${projectFilterOpts}
                </select>
                <select data-field-meta="true" data-field-meta-key="auto-pos:timekeeperPanel:select:L540" class="form-input form-input-sm"
                    data-cc-change="cc-23817c9f">
                    <option value="">${t('timekeeperFilterResource') || 'Filter by resource'}</option>
                    ${resourceFilterOpts}
                </select>
                <input data-field-meta="true" data-field-meta-key="auto-pos:timekeeperPanel:input:L545" type="date" class="form-input form-input-sm"
                    value="${escapeAttr(_tkFilters.startDate)}"
                    title="${t('timesheetFilterStartDate') || 'Start date'}"
                    data-cc-input="cc-f2a2910c">
                <input data-field-meta="true" data-field-meta-key="auto-pos:timekeeperPanel:input:L549" type="date" class="form-input form-input-sm"
                    value="${escapeAttr(_tkFilters.endDate)}"
                    title="${t('timesheetFilterEndDate') || 'End date'}"
                    data-cc-input="cc-4c20e4e9">
                ${_tkFilters.projectId || _tkFilters.resourceId || _tkFilters.startDate || _tkFilters.endDate
        ? `<button class="btn btn-sm btn-ghost" data-cc-action="cc-cfce028f">
                           ${t('timesheetFilterClear') || 'Clear'}
                       </button>`
        : ''}
            </div>
            ${entries.length === 0
        ? `<div class="gov-empty">${t('timekeeperNoEntries') || 'No time entries yet'}</div>`
        : `<div class="timekeeper-table-wrapper">
                       <table class="timekeeper-table">
                           <thead>
                               <tr>
                                   <th>${t('timesheetDate') || 'Date'}</th>
                                   <th>${t('projectsSection') || 'Project'}</th>
                                   <th>${t('timesheetPhase') || 'Phase'}</th>
                                   <th>${t('timesheetResource') || 'Resource'}</th>
                                   <th>${t('timesheetHours') || 'Hours'}</th>
                                   <th>${t('timesheetNotes') || 'Notes'}</th>
                               </tr>
                           </thead>
                           <tbody>${rows}</tbody>
                       </table>
                       ${entries.length > 100
            ? `<div class="timekeeper-table-overflow">+${entries.length - 100} more — use project timesheet for full view</div>`
            : ''}
                   </div>`}
        </div>
    `;
}
// ----------------------------------------------------------------
// PARTIAL RE-RENDER HELPERS
// ----------------------------------------------------------------
/** Re-render only the timer card (after field change). */
function _rerenderTimerCard() {
    const wrapper = (document.getElementById('tk-timer-card-wrapper')) as any;
    if (wrapper)
        wrapper.innerHTML = _renderTimerCard();
}
/** Re-render only the quick-add form (after draft change). */
function _rerenderQuickAddForm() {
    const wrapper = (document.getElementById('tk-quick-form-wrapper')) as any;
    if (wrapper)
        wrapper.innerHTML = _renderQuickAddForm();
}
/** Re-render only the entries table (after filter change). */
function _rerenderEntriesTable() {
    const wrapper = (document.getElementById('tk-entries-wrapper')) as any;
    if (wrapper)
        wrapper.innerHTML = _renderEntriesTable();
}
// ----------------------------------------------------------------
// DATA HELPERS
// ----------------------------------------------------------------
/**
 * Aggregate timesheet entries from all projects, applying filters.
 * Agrega lancamentos de todos os projetos, aplicando filtros.
 * @param {{projectId?:string, resourceId?:string, startDate?:string, endDate?:string}} filters
 * @returns {any[]}
 */
function _getAggregatedEntries(filters: any) {
    const projects = getProjects();
    const result = [];
    for (const project of /** @type {*} */ (projects)) {
        if (filters.projectId && project.id !== filters.projectId)
            continue;
        const entries = getTimesheetByProject(project.id);
        for (const e of /** @type {*} */ (entries)) {
            if (filters.resourceId && e.resourceId !== filters.resourceId)
                continue;
            if (filters.startDate && e.date < filters.startDate)
                continue;
            if (filters.endDate && e.date > filters.endDate)
                continue;
            result.push(e);
        }
    }
    // Sort descending by date
    return result.sort((/** @type {any} */ a, b: any) => b.date.localeCompare(a.date) || b.createdAt?.localeCompare(a.createdAt || '') || 0);
}
/**
 * Format milliseconds as HH:MM:SS.
 * Formata milissegundos como HH:MM:SS para o display do timer.
 * @param {number} ms
 * @returns {string}
 */
function _formatElapsed(ms: any) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
// ----------------------------------------------------------------
// STYLES
// ----------------------------------------------------------------
let _stylesInjected = false;
/**
 * Inject Time Keeper CSS (idempotent).
 * Injeta estilos CSS do Time Keeper (idempotente - so injeta uma vez).
 */
export function injectTimekeeperStyles() {
    if (_stylesInjected)
        return;
    _stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'timekeeper-styles';
    style.textContent = `
        /* Time Keeper — Summary Cards */
        .timekeeper-summary {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin: 8px 0 12px;
        }
        .timekeeper-kpi-card {
            background: var(--bg-secondary, #f5f5f5);
            border: 1px solid var(--border-color, #ddd);
            border-radius: 6px;
            padding: 10px 12px;
            text-align: center;
        }
        .timekeeper-kpi-value {
            font-size: 1.5rem;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
            color: var(--text-primary, #111);
            line-height: 1.1;
        }
        .timekeeper-kpi-label {
            font-size: 0.72rem;
            color: var(--text-muted, #777);
            margin-top: 3px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        /* Time Keeper — Timer Card */
        .timekeeper-timer-card {
            background: var(--bg-secondary, #f5f5f5);
            border: 1px solid var(--border-color, #ddd);
            border-radius: 6px;
            padding: 10px 12px;
            margin-bottom: 10px;
        }
        .timekeeper-timer-card.timekeeper-timer-running {
            border-color: var(--accent-primary, #2563eb);
            background: color-mix(in srgb, var(--accent-primary, #2563eb) 6%, var(--bg-secondary, #f5f5f5));
        }
        .timekeeper-timer-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .timekeeper-timer-label {
            font-size: 0.78rem;
            font-weight: 600;
            color: var(--text-secondary, #555);
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .timekeeper-timer-running .timekeeper-timer-label {
            color: var(--accent-primary, #2563eb);
        }
        .timekeeper-elapsed {
            font-family: monospace;
            font-size: 1.2rem;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
            color: var(--text-primary, #111);
            letter-spacing: 0.06em;
        }
        .timekeeper-timer-fields {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 8px;
        }
        .timekeeper-timer-fields .form-input-sm {
            flex: 1;
            min-width: 110px;
        }
        .timekeeper-timer-actions {
            display: flex;
            justify-content: flex-end;
        }

        /* Time Keeper — Quick Add Form */
        .timekeeper-quick-form {
            background: var(--bg-secondary, #f5f5f5);
            border: 1px solid var(--border-color, #ddd);
            border-radius: 6px;
            padding: 10px 12px;
            margin-bottom: 10px;
        }
        .timekeeper-quick-form-title {
            font-size: 0.78rem;
            font-weight: 600;
            color: var(--text-secondary, #555);
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-bottom: 8px;
        }
        .timekeeper-quick-form-fields {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
        }
        .timekeeper-quick-form-fields .form-input-sm {
            flex: 1;
            min-width: 100px;
        }

        /* Time Keeper — Entries Section */
        .timekeeper-entries-section {
            margin-top: 4px;
        }
        .timekeeper-entries-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
        }
        .timekeeper-entries-title {
            font-size: 0.78rem;
            font-weight: 600;
            color: var(--text-secondary, #555);
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .timekeeper-entries-total {
            font-size: 0.82rem;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
            color: var(--text-primary, #111);
        }
        .timekeeper-filters {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 8px;
        }
        .timekeeper-filters .form-input-sm {
            flex: 1;
            min-width: 120px;
        }
        .timekeeper-table-wrapper {
            overflow-x: auto;
            border: 1px solid var(--border-color, #ddd);
            border-radius: 4px;
        }
        .timekeeper-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.8rem;
        }
        .timekeeper-table th {
            background: var(--bg-tertiary, #ebebeb);
            padding: 5px 8px;
            text-align: left;
            font-weight: 600;
            color: var(--text-secondary, #555);
            white-space: nowrap;
            position: sticky;
            top: 0;
            z-index: 1;
        }
        .timekeeper-table td {
            padding: 4px 8px;
            border-top: 1px solid var(--border-color, #ddd);
            color: var(--text-primary, #111);
            vertical-align: middle;
        }
        .timekeeper-table tbody tr:hover {
            background: var(--bg-secondary, #f5f5f5);
        }
        .tk-cell-date {
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
        }
        .tk-cell-hours {
            text-align: right;
            font-variant-numeric: tabular-nums;
            font-weight: 600;
            white-space: nowrap;
        }
        .tk-cell-notes {
            color: var(--text-muted, #777);
            max-width: 180px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .timekeeper-badge-project {
            display: inline-block;
            background: color-mix(in srgb, var(--accent-primary, #2563eb) 12%, transparent);
            color: var(--accent-primary, #2563eb);
            border-radius: 3px;
            padding: 1px 5px;
            font-size: 0.75rem;
            font-weight: 500;
            white-space: nowrap;
        }
        .timekeeper-table-overflow {
            font-size: 0.75rem;
            color: var(--text-muted, #777);
            text-align: center;
            padding: 6px 0;
        }

        @media (max-width: 600px) {
            .timekeeper-summary { grid-template-columns: repeat(3, 1fr); gap: 4px; }
            .timekeeper-kpi-value { font-size: 1.1rem; }
            .timekeeper-timer-fields, .timekeeper-quick-form-fields, .timekeeper-filters {
                flex-direction: column;
            }
        }
    `;
    document.head.appendChild(style);
}
// ----------------------------------------------------------------
// OPENER STANDALONE (R-OPEN BUG 4, 2026-08-06)
// ----------------------------------------------------------------
const TK_OVERLAY_ID = 'timekeeper-panel-overlay';
let _tkA11yCleanup: (() => void) | null = null;

/**
 * Fecha o overlay standalone do Timekeeper (idempotente).
 */
export function closeTimekeeperPanel(): void {
    const overlay = document.getElementById(TK_OVERLAY_ID);
    if (overlay) overlay.remove();
    if (_tkA11yCleanup) {
        _tkA11yCleanup();
        _tkA11yCleanup = null;
    }
    clearTimekeeperInterval();
}

/**
 * Abre o Timekeeper num overlay proprio (menu "Mais → Timekeeper").
 *
 * CAUSA RAIZ do bug: o registry de paineis orfaos invocava
 * `renderTimekeeperSection()` como se fosse um opener, mas essa funcao apenas
 * RETORNA uma string HTML (consumida pelo governance panel) — o retorno era
 * descartado e nada montava no DOM (morte silenciosa, §R3-F-a). Este opener
 * monta a mesma secao num overlay .ecbt-overlay, expandida, e liga o interval
 * do timer.
 */
export function openTimekeeperPanel(): void {
    closeTimekeeperPanel();
    const overlay = document.createElement('div');
    overlay.id = TK_OVERLAY_ID;
    overlay.className = 'ecbt-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'timekeeper-panel-title');

    const rawTitle = t('timekeeperSection');
    const title = rawTitle && rawTitle !== 'timekeeperSection' ? rawTitle : 'Time Keeper';
    overlay.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--xl">
            <div class="ecbt-header">
                <h2 class="ecbt-title" id="timekeeper-panel-title">${escapeHtml(title)}</h2>
                <button type="button" class="ecbt-close" data-action="close" aria-label="Fechar">&#10005;</button>
            </div>
            <div class="ecbt-form tk-standalone-body" style="flex:1;overflow-y:auto;">
                ${renderTimekeeperSection()}
            </div>
        </div>`;

    overlay.addEventListener('click', (e: any) => {
        const target = e.target as HTMLElement;
        if (target === overlay || target.closest('[data-action="close"]')) closeTimekeeperPanel();
    });
    overlay.addEventListener('keydown', (e: any) => {
        if (e.key === 'Escape') closeTimekeeperPanel();
    });

    document.body.appendChild(overlay);

    // No overlay standalone a secao abre EXPANDIDA (no governance panel ela
    // nasce colapsada para nao dominar a coluna).
    const section = overlay.querySelector('[data-section-id="gov-timekeeper"]');
    if (section) section.classList.remove('collapsed');

    initTimekeeperInterval();

    try {
        _tkA11yCleanup = attachModalA11y(overlay, closeTimekeeperPanel);
    } catch {
        _tkA11yCleanup = null;
    }
}
