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
   DATA ENTRY MATRIX — Formulário de entrada de dados em campo/escritório
   Entrada de dados em massa no estilo planilha transposta.

   Matriz transposta: linhas = parâmetros, colunas = pontos de amostragem.
   Mostra valores históricos para comparação lado a lado.
   Dois modos: "office" (tabela completa) e "field" (um elemento por vez).

   Arquitetura:
   - Estado em _state (closure do módulo)
   - renderSetup() → passo 1 (seleção de campanha, parâmetros, elementos)
   - renderEntry() → passo 2 (tabela/field mode)
   - buildHistoricalCache() → busca últimos 2 valores por par (param × elem)
   ================================================================ */
import { CONFIG } from '../../config.js';
import { getAllElements, getElementById, updateElement } from '../../core/elements/manager.js';
import { getAllCampaigns, addCampaign, getCampaignById } from '../../core/campaigns/manager.js';
import { getThresholds } from '../../core/validation/rules.js';
import { escapeHtml } from '../helpers/html.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import { hydrateIcons } from './icons.js';
import { openModal, closeModal } from './modals.js';
import { activateTabById } from './tabs.js';
import { showToast } from './toast.js';
import { t } from '../i18n/translations.js';
import { canEditElement, isAccessControlActive } from '../auth/permissions.js';
import { asyncConfirm } from './asyncDialogs.js';
import * as _authNs from '../auth/session.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
import {
    parseCellInput,
    deriveObservationHistory,
    summarizeCells,
    compatibleUnitsFor,
    filterParamsBySearch,
    deriveCellView,
    formatHistoryHtml,
    formatHistoryText,
    groupParamsByCategory,
    buildCampaignNameMap,
    resolveObservationDate,
    resolveUnitId,
    findExistingObservationIndex,
    buildNewObservationRecord,
    derivePlannedSelection,
    findViEntry,
} from './_dataEntryMatrixPure.js';
const getCurrentUser = _authNs.getCurrentUser;
type AnyRecord = Record<string, any>;
// ----------------------------------------------------------------
// MODULE STATE - Estado local do formulário
// ----------------------------------------------------------------
let _state: any = null;
let _requestUIRefresh: any = null;
/**
 * Inject UI refresh dependency.
 * @param {Function} fn
 */
export function setDataEntryUpdateAllUI(fn: any) {
    _requestUIRefresh = fn;
}
function requestDataEntryUIRefresh(reason = 'data-entry.changed') {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains) {
        _requestUIRefresh(domain, reason);
    }
}
/**
 * Get container element.
 * @returns {HTMLElement|null}
 */
function getContainer() {
    return document.getElementById('data-entry-content');
}
// ----------------------------------------------------------------
// PUBLIC API - Called by handlers
// ----------------------------------------------------------------
/**
 * Open the data entry matrix modal.
 * Abre o modal e inicializa estado.
 * @param {string} [preselectedCampaignId?] - Campanha pré-selecionada
 */
export function openDataEntryMatrix(preselectedCampaignId?: string) {
    _state = {
        step: 'setup',
        mode: 'office',
        campaignId: preselectedCampaignId || null,
        campaignDate: new Date().toISOString().slice(0, 10),
        newCampaignName: '',
        noCampaignMode: false,
        selectedParameterIds: [],
        selectedElementIds: [],
        fieldModeIndex: 0,
        cells: {},
        history: {},
        elementDates: {},
        paramUnits: {},
        paramSearch: '',
        elementFamilyFilter: '',
    };
    // Auto-seleciona elementos e parâmetros do plano se campanha tem plannedReadings
    if (preselectedCampaignId) {
        const campaign = getCampaignById(preselectedCampaignId);
        if (campaign) {
            _state.campaignDate = campaign.startDate || _state.campaignDate;
            if (campaign.plannedReadings?.length) {
                const selection = derivePlannedSelection(campaign.plannedReadings);
                _state.selectedParameterIds = selection.parameterIds;
                _state.selectedElementIds = selection.elementIds;
            }
        }
    }
    openModal('data-entry-modal');
    render();
    // Sprint 3 Tier-B wire (Calvin 2026-06-03)
    syncDeepLinkUrl('data-entry');
}
/**
 * Close the modal (with unsaved check).
 */
export async function closeDataEntryMatrix() {
    if (_state?.step === 'entry' && hasDirtyCells()) {
        if (!(await asyncConfirm(t('unsavedChanges') || 'You have unsaved data. Close anyway?'))) {
            return;
        }
    }
    _state = null;
    closeModal('data-entry-modal');
    clearDeepLinkUrl();
}
/**
 * Move to step 2 (entry).
 */
export function goToEntry() {
    if (!_state) return;
    // Validações
    if (!_state.noCampaignMode && !_state.campaignId && !_state.newCampaignName.trim()) {
        showToast(t('noCampaignSelected') || 'Select or create a campaign', 'warning');
        return;
    }
    if (!_state.selectedParameterIds.length) {
        showToast(t('noParametersSelected') || 'Select at least one parameter', 'warning');
        return;
    }
    if (!_state.selectedElementIds.length) {
        showToast(t('noElementsSelected') || 'Select at least one sampling point', 'warning');
        return;
    }
    // Cria campanha inline se necessário (skip em noCampaignMode)
    if (!_state.noCampaignMode && !_state.campaignId && _state.newCampaignName.trim()) {
        const campaign = addCampaign({
            name: _state.newCampaignName.trim(),
            startDate: _state.campaignDate,
        });
        _state.campaignId = campaign.id;
    }
    // Inicializa células e cache histórico
    initCells();
    _state.history = buildHistoricalCache(_state.selectedParameterIds, _state.selectedElementIds);
    _state.step = 'entry';
    _state.fieldModeIndex = 0;
    render();
}
/**
 * Go back to setup step.
 */
export function goToSetup() {
    if (!_state) return;
    _state.step = 'setup';
    render();
}
/**
 * Toggle between office and field mode.
 * @param {string} mode - 'office' | 'field'
 */
export function setMode(mode: string) {
    if (!_state) return;
    _state.mode = mode;
    render();
}
/**
 * Update a cell value.
 * @param {string} paramId
 * @param {string} elemId
 * @param {string} rawValue
 */
export function setCellValue(paramId: string, elemId: string, rawValue: string) {
    if (!_state?.cells[paramId]?.[elemId]) return;
    const cell = _state.cells[paramId][elemId];
    const parsed = parseCellInput(rawValue);
    cell.value = parsed.value;
    cell.error = parsed.error;
    cell.dirty = parsed.dirty;
}
/**
 * Internal save - persists observations, returns counts.
 * Usa elementDates quando noCampaignMode, paramUnits para unitId.
 * @returns {{ saved: number, skipped: number }}
 */
function doSaveAll() {
    const user = getCurrentUser();
    let saved = 0;
    let skipped = 0;
    for (const elemId of _state.selectedElementIds) {
        if (isAccessControlActive() && !canEditElement(elemId)) {
            skipped++;
            continue;
        }
        const element = getElementById(elemId);
        if (!element) continue;
        const observations = Array.isArray(element.data?.observations) ? [...element.data.observations] : [];
        let elementChanged = false;
        const obsDate = resolveObservationDate(_state.noCampaignMode, _state.elementDates[elemId], _state.campaignDate);
        for (const paramId of _state.selectedParameterIds) {
            const cell = _state.cells[paramId]?.[elemId];
            if (!cell || cell.value == null || !cell.dirty) continue;
            const existingIdx = findExistingObservationIndex(observations, {
                noCampaignMode: _state.noCampaignMode,
                paramId,
                obsDate,
                campaignId: _state.campaignId,
            });
            const paramDef = CONFIG.PARAMETERS.find((p) => p.id === paramId);
            const unitId = resolveUnitId(_state.paramUnits[paramId], paramDef?.defaultUnitId);
            if (existingIdx >= 0) {
                observations[existingIdx].value = cell.value;
                observations[existingIdx].date = obsDate;
                observations[existingIdx].unitId = unitId;
            } else {
                observations.push(
                    buildNewObservationRecord({
                        position: element.position,
                        obsDate,
                        campaignId: _state.campaignId,
                        parameterId: paramId,
                        cellValue: cell.value,
                        unitId,
                        casNumber: paramDef?.casNumber,
                        user,
                    }),
                );
            }
            saved++;
            cell.dirty = false;
            elementChanged = true;
        }
        if (elementChanged) {
            updateElement(elemId, { data: { ...element.data, observations } });
        }
    }
    requestDataEntryUIRefresh('data-entry.saved');
    return { saved, skipped };
}
/**
 * Save all dirty cells as observations.
 */
export function saveAll() {
    if (!_state) return;
    const errors = countErrors();
    if (errors > 0) {
        showToast(t('validationErrors') || 'Some cells have validation errors', 'error');
        return;
    }
    const { saved, skipped } = doSaveAll();
    const msg = `${saved} ${t('observationsSaved') || 'observations saved'}`;
    if (skipped > 0) {
        showToast(`${msg} (${skipped} ${t('elementsSkipped') || 'elements skipped — no permission'})`, 'warning');
    } else {
        showToast(msg, 'success');
    }
    closeModal('data-entry-modal');
    _state = null;
}
/**
 * Copy values from the last campaign.
 */
export function copyLastCampaign() {
    if (!_state) return;
    let filled = 0;
    for (const paramId of _state.selectedParameterIds) {
        for (const elemId of _state.selectedElementIds) {
            const hist = _state.history[paramId]?.[elemId];
            if (hist?.length && _state.cells[paramId]?.[elemId]) {
                const cell = _state.cells[paramId][elemId];
                if (cell.value == null) {
                    cell.value = hist[0].value;
                    cell.dirty = true;
                    filled++;
                }
            }
        }
    }
    showToast(`${filled} ${t('cellsFilled') || 'cells filled'}`, 'info');
    render();
}
/**
 * Clear all cell values.
 */
export async function clearAllCells() {
    if (!_state) return;
    if (!(await asyncConfirm(t('clearConfirm') || 'Clear all entered values?'))) return;
    for (const paramId of _state.selectedParameterIds) {
        for (const elemId of _state.selectedElementIds) {
            if (_state.cells[paramId]?.[elemId]) {
                _state.cells[paramId][elemId] = { value: null, dirty: false, error: null };
            }
        }
    }
    render();
}
/**
 * Navigate to next element in field mode.
 */
export function fieldNext() {
    if (!_state) return;
    _state.fieldModeIndex = (_state.fieldModeIndex + 1) % _state.selectedElementIds.length;
    render();
}
/**
 * Navigate to previous element in field mode.
 */
export function fieldPrev() {
    if (!_state) return;
    const len = _state.selectedElementIds.length;
    _state.fieldModeIndex = (_state.fieldModeIndex - 1 + len) % len;
    render();
}
/**
 * Update parameter search filter.
 * @param {string} query
 */
export function setParamSearch(query: string) {
    if (!_state) return;
    _state.paramSearch = query;
    renderSetupCheckboxes();
}
/**
 * Filter elements by family.
 * @param {string} familyId - '' for all
 */
export function setElementFilter(familyId: string) {
    if (!_state) return;
    _state.elementFamilyFilter = familyId;
    renderSetupCheckboxes();
}
/**
 * Toggle parameter selection.
 * @param {string} paramId
 * @param {boolean} checked
 */
export function toggleParam(paramId: string, checked: boolean) {
    if (!_state) return;
    if (checked && !_state.selectedParameterIds.includes(paramId)) {
        _state.selectedParameterIds.push(paramId);
    } else if (!checked) {
        _state.selectedParameterIds = _state.selectedParameterIds.filter((id: any) => id !== paramId);
    }
}
/**
 * Toggle element selection.
 * @param {string} elemId
 * @param {boolean} checked
 */
export function toggleElement(elemId: string, checked: boolean) {
    if (!_state) return;
    if (checked && !_state.selectedElementIds.includes(elemId)) {
        _state.selectedElementIds.push(elemId);
    } else if (!checked) {
        _state.selectedElementIds = _state.selectedElementIds.filter((id: any) => id !== elemId);
    }
}
/**
 * Select/deselect all parameters.
 * @param {boolean} all
 */
export function selectAllParams(all: boolean) {
    if (!_state) return;
    _state.selectedParameterIds = all ? CONFIG.PARAMETERS.map((p) => p.id) : [];
    renderSetupCheckboxes();
}
/**
 * Select/deselect all elements.
 * @param {boolean} all
 */
export function selectAllElements(all: boolean) {
    if (!_state) return;
    _state.selectedElementIds = all ? getAllElements().map((e: any) => e.id) : [];
    renderSetupCheckboxes();
}
/**
 * Set campaign selection.
 * @param {string} campaignId
 */
export function setCampaign(campaignId: string) {
    if (!_state) return;
    // "__none__" = modo sem campanha (datas individuais por ponto)
    if (campaignId === '__none__') {
        _state.campaignId = null;
        _state.noCampaignMode = true;
        render();
        return;
    }
    _state.campaignId = campaignId || null;
    _state.noCampaignMode = false;
    // Auto-preenche data da campanha
    if (campaignId) {
        const campaign = getCampaignById(campaignId);
        if (campaign?.startDate) {
            _state.campaignDate = campaign.startDate;
        }
    }
    render();
}
/**
 * Set campaign date.
 * @param {string} date
 */
export function setCampaignDate(date: string) {
    if (!_state) return;
    _state.campaignDate = date;
}
/**
 * Set new campaign name (inline creation).
 * @param {string} name
 */
export function setNewCampaignName(name: string) {
    if (!_state) return;
    _state.newCampaignName = name;
}
/**
 * Quick from Plan - auto-select from campaign's plannedReadings.
 */
export function quickFromPlan() {
    if (!_state?.campaignId) return;
    const campaign = getCampaignById(_state.campaignId);
    if (!campaign?.plannedReadings?.length) {
        showToast(t('noPlanData') || 'No planned readings in this campaign', 'info');
        return;
    }
    const { parameterIds, elementIds } = derivePlannedSelection(campaign.plannedReadings);
    _state.selectedParameterIds = parameterIds;
    _state.selectedElementIds = elementIds;
    renderSetupCheckboxes();
    const paramsLabel = t('selectParameters') || 'parameters';
    const pointsLabel = t('selectElements') || 'points';
    showToast(`${parameterIds.length} ${paramsLabel}, ${elementIds.length} ${pointsLabel}`, 'info');
}
/**
 * Set date for a specific element (noCampaignMode).
 * @param {string} elemId
 * @param {string} date - YYYY-MM-DD
 */
export function setElementDate(elemId: string, date: string) {
    if (!_state) return;
    _state.elementDates[elemId] = date;
}
/**
 * Set unit override for a parameter row.
 * @param {string} paramId
 * @param {string} unitId
 */
export function setParamUnit(paramId: string, unitId: string) {
    if (!_state) return;
    _state.paramUnits[paramId] = unitId;
    render();
}
/**
 * Open Insights - save dirty data, close modal, navigate to analytics.
 */
export function openInsights() {
    if (!_state) return;
    if (hasDirtyCells()) {
        const errors = countErrors();
        if (errors > 0) {
            showToast(t('validationErrors') || 'Fix errors before viewing insights', 'error');
            return;
        }
        doSaveAll();
    }
    _state = null;
    closeModal('data-entry-modal');
    // Navega para o painel Analytics
    setTimeout(() => {
        activateTabById('analytics');
        if (typeof window.toggleAnalyticsFullscreen === 'function') {
            const tabEl = document.getElementById('tab-analytics');
            if (tabEl && !tabEl.classList.contains('analytics-fullscreen')) {
                window.toggleAnalyticsFullscreen();
            }
        }
    }, 200);
}
// ----------------------------------------------------------------
// INTERNAL - Cell initialization & history cache
// ----------------------------------------------------------------
function initCells() {
    _state.cells = {};
    // Inicializa datas por elemento (noCampaignMode)
    for (const elemId of _state.selectedElementIds) {
        if (!_state.elementDates[elemId]) {
            _state.elementDates[elemId] = _state.campaignDate;
        }
    }
    // Inicializa unidades por parâmetro
    for (const paramId of _state.selectedParameterIds) {
        if (!_state.paramUnits[paramId]) {
            const paramDef = CONFIG.PARAMETERS.find((p) => p.id === paramId);
            _state.paramUnits[paramId] = paramDef?.defaultUnitId || null;
        }
        _state.cells[paramId] = {};
        for (const elemId of _state.selectedElementIds) {
            const element = getElementById(elemId);
            const existing = (element?.data?.observations || []).find(
                (o: any) => o.campaignId === _state.campaignId && o.parameterId === paramId,
            );
            _state.cells[paramId][elemId] = {
                value: existing?.value ?? null,
                dirty: false,
                error: null,
            };
        }
    }
}
/**
 * @param {string[]} paramIds
 * @param {string[]} elemIds
 * @returns {Record<string, Record<string, any[]>>}
 */
function buildHistoricalCache(paramIds: string[], elemIds: string[]) {
    const history: AnyRecord = {};
    const campaignNames = buildCampaignNameMap(getAllCampaigns());
    for (const paramId of paramIds) {
        history[paramId] = {};
        for (const elemId of elemIds) {
            const element = getElementById(elemId);
            history[paramId][elemId] = deriveObservationHistory(
                element?.data?.observations || [],
                paramId,
                _state.campaignId,
                (campaignId: string) => campaignNames.get(campaignId),
            );
        }
    }
    return history;
}
// ----------------------------------------------------------------
// INTERNAL - Helpers
// ----------------------------------------------------------------
// Aggregate cell stats in a single pure pass (see _dataEntryMatrixPure).
// The thin wrappers below preserve the original call sites and semantics.
function summarizeStateCells() {
    return summarizeCells(_state?.cells, getThresholds);
}
function hasDirtyCells() {
    return summarizeStateCells().hasDirty;
}
function countErrors() {
    return summarizeStateCells().errors;
}
function countFilled() {
    return summarizeStateCells().filled;
}
function countExceeds() {
    return summarizeStateCells().exceeds;
}
/** @param {string} paramId */
function getParamName(paramId: string) {
    const p = CONFIG.PARAMETERS.find((x) => x.id === paramId);
    if (!p) return paramId;
    const lang = document.documentElement.lang || 'en';
    return ((p.names || {}) as AnyRecord)[lang] || p.name || paramId;
}
/** @param {string} paramId */
function getUnitLabel(paramId: string) {
    const unitId = _state?.paramUnits?.[paramId];
    const p = CONFIG.PARAMETERS.find((x) => x.id === paramId);
    const effectiveId = unitId || p?.defaultUnitId;
    if (!effectiveId) return '';
    const u = CONFIG.UNITS.find((x) => x.id === effectiveId);
    return u?.symbol || u?.name || effectiveId;
}
/**
 * @param {string} paramId
 * @returns {any[]}
 */
function getCompatibleUnits(paramId: string) {
    const paramDef = CONFIG.PARAMETERS.find((p) => p.id === paramId);
    return compatibleUnitsFor(CONFIG.UNITS, paramDef?.defaultUnitId);
}
// ----------------------------------------------------------------
// RENDER - Main dispatch
// ----------------------------------------------------------------
function render() {
    const container = getContainer();
    if (!container || !_state) return;
    if (_state.step === 'setup') {
        renderSetup(container);
    } else {
        renderEntry(container);
    }
    hydrateIcons(container);
}
// ----------------------------------------------------------------
// RENDER - Step 1: Setup
// ----------------------------------------------------------------
/** @param {HTMLElement} container */
function renderSetup(container: HTMLElement) {
    const campaigns = getAllCampaigns();
    const elements = getAllElements();
    const families = [...new Set(elements.map((e: any) => e.family).filter(Boolean))];
    // Agrupa parâmetros por categoria
    const paramsByCategory = groupParamsByCategory(CONFIG.PARAMETERS);
    container.innerHTML = `
        <div class="dem-wrapper">
            <!-- Steps indicator -->
            <div class="dem-steps">
                <div class="dem-step active">
                    <span class="dem-step-number">1</span>
                    <span>${t('matrixSetup') || 'Setup'}</span>
                </div>
                <span class="dem-step-arrow">&rarr;</span>
                <div class="dem-step">
                    <span class="dem-step-number">2</span>
                    <span>${t('matrixEntry') || 'Data Entry'}</span>
                </div>
            </div>

            <!-- Setup content -->
            <div class="dem-setup">
                <!-- Campaign -->
                <div class="dem-section">
                    <div class="dem-section-title">
                        <span data-icon="clipboard" data-icon-size="14px"></span>
                        ${t('selectCampaign') || 'Campaign'}
                    </div>
                    <div class="dem-campaign-row">
                        <div class="dem-form-group">
                            <label class="dem-form-label">${t('selectCampaign') || 'Existing Campaign'}</label>
                            <select data-field-meta="true" data-field-meta-key="matrix:campaign:selector"
                                class="dem-form-input" data-cc-change="cc-c952d0ee">
                                <option value="">${t('createNewCampaign') || '-- New Campaign --'}</option>
                                <option value="__none__" ${_state.noCampaignMode ? 'selected' : ''}>${t('noCampaign') || '-- No Campaign --'}</option>
                                ${campaigns
                                    .map(
                                        (c) => `
                                    <option value="${c.id}" ${c.id === _state.campaignId ? 'selected' : ''}>
                                        ${escapeHtml(c.name || c.id)}
                                    </option>
                                `,
                                    )
                                    .join('')}
                            </select>
                        </div>
                        ${
                            !_state.campaignId && !_state.noCampaignMode
                                ? `
                        <div class="dem-form-group">
                            <label class="dem-form-label">${t('campaignName') || 'Campaign Name'}</label>
                            <input data-field-meta="true" data-field-meta-key="matrix:campaign:name" type="text"
                                   class="dem-form-input" placeholder="${t('campaignName') || 'Campaign name...'}"
                                   value="${escapeHtml(_state.newCampaignName)}"
                                   data-cc-input="cc-9b685617">
                        </div>
                        `
                                : ''
                        }
                        ${
                            _state.noCampaignMode
                                ? `
                        <div class="dem-form-group">
                            <label class="dem-form-label">${t('defaultDate') || 'Default Date'}</label>
                            <input data-field-meta="true" data-field-meta-key="matrix:campaign:defaultDate"
                                   type="date" class="dem-form-input"
                                   value="${_state.campaignDate}"
                                   data-cc-change="cc-9301446a">
                        </div>
                        <div class="dem-hint">${t('datePerPoint') || 'Individual dates per point in Step 2'}</div>
                        `
                                : `
                        <div class="dem-form-group">
                            <label class="dem-form-label">${t('campaignDate') || 'Date'}</label>
                            <input data-field-meta="true" data-field-meta-key="matrix:campaign:date"
                                   type="date" class="dem-form-input"
                                   value="${_state.campaignDate}"
                                   data-cc-change="cc-9301446a">
                        </div>
                        `
                        }
                        ${
                            _state.campaignId
                                ? `
                        <button class="dem-btn-sm" data-cc-action="cc-2601def1" title="${t('quickFromPlan') || 'Auto-select from planned readings'}">
                            <span data-icon="zap" data-icon-size="12px"></span>
                            ${t('quickFromPlan') || 'Quick from Plan'}
                        </button>
                        `
                                : ''
                        }
                    </div>
                </div>

                <!-- Parameters -->
                <div class="dem-section">
                    <div class="dem-section-title">
                        <span data-icon="flask" data-icon-size="14px"></span>
                        ${t('selectParameters') || 'Parameters (rows)'}
                    </div>
                    <div class="dem-section-actions">
                        <input type="text" class="dem-form-input dem-search"
                               placeholder="${t('searchParameters') || 'Search parameters...'}"
                               value="${escapeHtml(_state.paramSearch)}"
                               data-cc-input="cc-a0cf18f9">
                        <button class="dem-btn-sm" data-cc-action="cc-8d1eca40">${t('selectAll') || 'Select All'}</button>
                        <button class="dem-btn-sm" data-cc-action="cc-80670895">${t('selectNone') || 'None'}</button>
                    </div>
                    <div class="dem-check-grid" id="dem-param-grid">
                        ${renderParamCheckboxes(paramsByCategory)}
                    </div>
                </div>

                <!-- Elements -->
                <div class="dem-section">
                    <div class="dem-section-title">
                        <span data-icon="map-pin" data-icon-size="14px"></span>
                        ${t('selectElements') || 'Sampling Points (columns)'}
                    </div>
                    <div class="dem-section-actions">
                        <select data-field-meta="true" data-field-meta-key="matrix:filter:element"
                            class="dem-form-input" style="max-width:160px;" data-cc-change="cc-c1e7fe92">
                            <option value="">${t('selectByFamily') || 'All families'}</option>
                            ${families
                                .map(
                                    (f) => `
                                <option value="${f}" ${f === _state.elementFamilyFilter ? 'selected' : ''}>
                                    ${escapeHtml(f)}
                                </option>
                            `,
                                )
                                .join('')}
                        </select>
                        <button class="dem-btn-sm" data-cc-action="cc-99f685c7">${t('selectAll') || 'Select All'}</button>
                        <button class="dem-btn-sm" data-cc-action="cc-1b2efec2">${t('selectNone') || 'None'}</button>
                    </div>
                    ${
                        elements.length === 0
                            ? `
                        <div class="dem-empty">
                            <div class="dem-empty-icon"><span data-icon="alert-triangle" data-icon-size="24px"></span></div>
                            <div class="dem-empty-text">${t('noElementsToShow') || 'Add sampling points first (Insert tab)'}</div>
                        </div>
                    `
                            : `
                    <div class="dem-check-grid" id="dem-elem-grid">
                        ${renderElementCheckboxes(elements)}
                    </div>
                    `
                    }
                </div>

                <!-- Mode -->
                <div class="dem-section">
                    <div class="dem-section-title">${t('dataEntryMode') || 'Mode'}</div>
                    <div class="dem-mode-toggle">
                        <button class="dem-mode-btn ${_state.mode === 'office' ? 'active' : ''}"
                                data-cc-action="cc-39cfa227">
                            ${t('officeMode') || 'Office'}
                        </button>
                        <button class="dem-mode-btn ${_state.mode === 'field' ? 'active' : ''}"
                                data-cc-action="cc-1888fb19">
                            ${t('fieldMode') || 'Field'}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div class="dem-footer">
                <span class="dem-stats">
                    ${_state.selectedParameterIds.length} ${t('selectParameters') || 'params'}
                    &times;
                    ${_state.selectedElementIds.length} ${t('selectElements') || 'points'}
                    = ${_state.selectedParameterIds.length * _state.selectedElementIds.length} ${t('cellsTotal') || 'cells'}
                </span>
                <span class="dem-footer-spacer"></span>
                <button class="dem-btn" data-cc-action="cc-d3e26f9d">
                    ${t('cancel') || 'Cancel'}
                </button>
                <button class="dem-btn dem-btn-primary" data-cc-action="cc-0687386b"
                        ${elements.length === 0 ? 'disabled' : ''}>
                    ${t('enterData') || 'Enter Data'} &rarr;
                </button>
            </div>
        </div>
    `;
}
/** @param {Record<string, any[]>} paramsByCategory */
function renderParamCheckboxes(paramsByCategory: AnyRecord) {
    const search = (_state.paramSearch || '').toLowerCase();
    let html = '';
    for (const [category, params] of Object.entries(paramsByCategory)) {
        const filtered = filterParamsBySearch(params, search);
        if (!filtered.length) continue;
        html += `<div class="dem-category-label">${escapeHtml(category)}</div>`;
        for (const p of filtered) {
            const checked = _state.selectedParameterIds.includes(p.id) ? 'checked' : '';
            const label = getParamName(p.id);
            html += `
                <label class="dem-check-item">
                    <input data-field-meta="true" data-field-meta-key="matrix:row:select" type="checkbox" ${checked}
                           data-cc-call-change="handleMatrixToggleParam|s:${encodeURIComponent(`${p.id}`)}|c">
                    ${escapeHtml(label)}
                </label>
            `;
        }
    }
    return html || `<div class="dem-empty-text">${t('noResults') || 'No results'}</div>`;
}
/** @param {any[]} allElements */
function renderElementCheckboxes(allElements: any[]) {
    const filter = _state.elementFamilyFilter;
    const elements = filter ? allElements.filter((e: any) => e.family === filter) : allElements;
    return elements
        .map((e: any) => {
            const checked = _state.selectedElementIds.includes(e.id) ? 'checked' : '';
            return `
            <label class="dem-check-item">
                <input data-field-meta="true" data-field-meta-key="matrix:col:select" type="checkbox" ${checked}
                       data-cc-call-change="handleMatrixToggleElement|s:${encodeURIComponent(`${e.id}`)}|c">
                ${escapeHtml(e.name || e.id)}
            </label>
        `;
        })
        .join('');
}
/**
 * Re-render only the checkbox areas (for search/filter without full re-render).
 */
function renderSetupCheckboxes() {
    const paramGrid = document.getElementById('dem-param-grid');
    if (paramGrid) {
        const paramsByCategory = groupParamsByCategory(CONFIG.PARAMETERS);
        paramGrid.innerHTML = renderParamCheckboxes(paramsByCategory);
    }
    const elemGrid = document.getElementById('dem-elem-grid');
    if (elemGrid) {
        elemGrid.innerHTML = renderElementCheckboxes(getAllElements());
    }
}
// ----------------------------------------------------------------
// RENDER - Step 2: Entry
// ----------------------------------------------------------------
/** @param {HTMLElement} container */
function renderEntry(container: HTMLElement) {
    const campaign = getCampaignById(_state.campaignId);
    const campaignName = campaign?.name || _state.campaignId || '';
    const filled = countFilled();
    const total = _state.selectedParameterIds.length * _state.selectedElementIds.length;
    const exceeds = countExceeds();
    const isField = _state.mode === 'field';
    container.innerHTML = `
        <div class="dem-wrapper ${isField ? 'dem-mode-field' : ''}">
            <!-- Steps indicator -->
            <div class="dem-steps">
                <div class="dem-step">
                    <span class="dem-step-number">1</span>
                    <span>${t('matrixSetup') || 'Setup'}</span>
                </div>
                <span class="dem-step-arrow">&rarr;</span>
                <div class="dem-step active">
                    <span class="dem-step-number">2</span>
                    <span>${t('matrixEntry') || 'Data Entry'}</span>
                </div>
            </div>

            <!-- Toolbar -->
            <div class="dem-toolbar">
                ${
                    _state.noCampaignMode
                        ? `
                <span class="dem-toolbar-label">${t('noCampaign') || 'No Campaign'}:</span>
                <span class="dem-toolbar-value dem-hint-tag">${t('datePerPoint') || 'Date per point'}</span>
                <div class="dem-toolbar-sep"></div>
                `
                        : `
                <span class="dem-toolbar-label">${t('selectCampaign') || 'Campaign'}:</span>
                <span class="dem-toolbar-value">${escapeHtml(campaignName)}</span>
                <div class="dem-toolbar-sep"></div>
                <span class="dem-toolbar-label">${t('campaignDate') || 'Date'}:</span>
                <span class="dem-toolbar-value">${_state.campaignDate}</span>
                <div class="dem-toolbar-sep"></div>
                `
                }
                <div class="dem-mode-toggle">
                    <button class="dem-mode-btn ${!isField ? 'active' : ''}"
                            data-cc-action="cc-39cfa227">
                        ${t('officeMode') || 'Office'}
                    </button>
                    <button class="dem-mode-btn ${isField ? 'active' : ''}"
                            data-cc-action="cc-1888fb19">
                        ${t('fieldMode') || 'Field'}
                    </button>
                </div>
                <span class="dem-toolbar-spacer"></span>
                <span class="dem-stats">
                    <span class="dem-stats-count">${filled}</span>/${total} ${t('cellsFilled') || 'filled'}
                    ${exceeds > 0 ? `<span class="dem-stats-warn"> | ${exceeds} ${t('exceedsLimit') || 'exceed limits'}</span>` : ''}
                </span>
            </div>

            <!-- Quick-fill bar -->
            <div class="dem-quickfill">
                <button class="dem-btn-sm" data-cc-action="cc-568673d5">
                    &larr; ${t('matrixSetup') || 'Setup'}
                </button>
                <button class="dem-btn-sm" data-cc-action="cc-4da6926a">
                    ${t('copyLastCampaign') || 'Copy Last Campaign'}
                </button>
                <button class="dem-btn-sm" data-cc-action="cc-b9efaf55">
                    ${t('clearAllCells') || 'Clear All'}
                </button>
                <span class="dem-toolbar-spacer"></span>
                <button class="dem-btn-sm dem-btn-insights" data-cc-action="cc-36287e60">
                    <span data-icon="bar-chart-2" data-icon-size="12px"></span>
                    ${t('insights') || 'Insights'}
                </button>
            </div>

            <!-- Office mode: matrix table -->
            <div class="dem-matrix-scroll">
                ${renderMatrixTable()}
            </div>

            <!-- Field mode: single element card -->
            <div class="dem-field-view">
                ${renderFieldMode()}
            </div>

            <!-- Footer -->
            <div class="dem-footer">
                <span class="dem-stats">
                    <span class="dem-stats-count">${filled}</span>/${total} ${t('cellsFilled') || 'filled'}
                </span>
                <span class="dem-footer-spacer"></span>
                <button class="dem-btn" data-cc-action="cc-d3e26f9d">
                    ${t('cancel') || 'Cancel'}
                </button>
                <button class="dem-btn dem-btn-success" data-cc-action="cc-cbf45818" ${filled === 0 ? 'disabled' : ''}>
                    ${t('saveAllObservations') || 'Save All'} (${filled})
                </button>
            </div>
        </div>
    `;
    // Focus first empty input
    setTimeout(() => {
        const firstEmpty = container.querySelector('.dem-input:not(.dirty), .dem-field-input:not(.dirty)');
        if (firstEmpty) (firstEmpty as HTMLElement).focus();
    }, 100);
}
// ----------------------------------------------------------------
// RENDER - Office mode table
// ----------------------------------------------------------------
function renderMatrixTable() {
    const elements = _state.selectedElementIds.map((id: any) => getElementById(id)).filter(Boolean);
    // Header row: param | unit | VO | element1 | element2 | ...
    let html = `<table class="dem-table" role="grid" aria-label="${t('dataEntryMatrix') || 'Data Entry Matrix'}"><thead><tr>`;
    html += `<th>${t('parameter') || 'Parameter'}</th>`;
    html += `<th>${t('unit') || 'Unit'}</th>`;
    html += `<th class="dem-th-vo">${t('referenceValue') || 'VO'}</th>`;
    for (const elem of elements) {
        html += `<th>
            ${escapeHtml(elem.name || elem.id)}
            ${
                _state.noCampaignMode
                    ? `
                <input data-field-meta="true" data-field-meta-key="matrix:row:${elem.id}:date" type="date" class="dem-date-input"
                       value="${_state.elementDates[elem.id] || _state.campaignDate}"
                       data-cc-call-change="handleMatrixElementDate|s:${encodeURIComponent(`${elem.id}`)}|v">
            `
                    : ''
            }
        </th>`;
    }
    html += `</tr></thead><tbody>`;
    // Data rows: one per parameter
    for (const paramId of _state.selectedParameterIds) {
        const thresholds = getThresholds(paramId);
        const viEntry = findViEntry(thresholds);
        const voValue = viEntry?.value != null ? viEntry.value : '';
        const units = getCompatibleUnits(paramId);
        const currentUnitId = _state.paramUnits[paramId];
        html += `<tr>`;
        html += `<td class="dem-row-header">${escapeHtml(getParamName(paramId))}</td>`;
        // Seletor de unidade
        if (units.length > 1) {
            html += `<td class="dem-row-unit">
                <select data-field-meta="true" data-field-meta-key="matrix:col:${paramId}:unit"
                    class="dem-unit-select"
                    data-cc-call-change="handleMatrixUnitChange|s:${encodeURIComponent(`${paramId}`)}|v">
                    ${units
                        .map(
                            (u: any) => `
                        <option value="${u.id}" ${u.id === currentUnitId ? 'selected' : ''}>
                            ${escapeHtml(u.symbol || u.name)}
                        </option>
                    `,
                        )
                        .join('')}
                </select>
            </td>`;
        } else {
            html += `<td class="dem-row-unit">${escapeHtml(getUnitLabel(paramId))}</td>`;
        }
        // Coluna VO (Valor Orientador / regulatory reference)
        html += `<td class="dem-row-vo">${voValue !== '' ? voValue : '-'}</td>`;
        for (const elem of elements) {
            const cell = _state.cells[paramId]?.[elem.id] || { value: null, dirty: false, error: null };
            const hist = _state.history[paramId]?.[elem.id] || [];
            const view = deriveCellView(cell, viEntry);
            const inputClass = 'dem-input' + view.classSuffix;
            const displayValue = view.displayValue;
            const histHtml = formatHistoryHtml(hist);
            const limitBadge = view.exceeds ? `<span class="dem-limit-badge critical">!</span>` : '';
            // FIELD-META-001 Phase 2 - opt-in to field-meta wrapper.
            // Auto-wrap observer will register middle-click/Ctrl+M/ⓘ triggers.
            const fieldMetaKey = `element:${elem.id}:observation:${paramId}:reading`;
            html += `
                <td class="dem-cell">
                    <input type="text" class="${inputClass}" inputmode="decimal"
                           data-field-meta="true"
                           data-field-meta-key="${fieldMetaKey}"
                           value="${displayValue}" ${limitBadge ? 'title="' + (t('exceedsLimit') || 'Exceeds limit') + '"' : ''}
                           aria-label="${getParamName(paramId)} - ${elem.name || elem.id}"
                           data-cc-call-input="handleMatrixCellChange|s:${encodeURIComponent(`${paramId}`)}|s:${encodeURIComponent(`${elem.id}`)}|v"
                           data-cc-call-blur="handleMatrixCellBlur|s:${encodeURIComponent(`${paramId}`)}|s:${encodeURIComponent(`${elem.id}`)}|t"
                           data-cc-keydown="cc-fa6dc98e">
                    ${limitBadge}
                    ${histHtml}
                </td>
            `;
        }
        html += `</tr>`;
    }
    html += `</tbody></table>`;
    return html;
}
// ----------------------------------------------------------------
// RENDER - Field mode (single element card)
// ----------------------------------------------------------------
function renderFieldMode() {
    const elemId = _state.selectedElementIds[_state.fieldModeIndex];
    if (!elemId)
        return `<div class="dem-empty"><div class="dem-empty-text">${t('noElementsSelected') || 'No elements'}</div></div>`;
    const element = getElementById(elemId);
    if (!element) return '';
    const total = _state.selectedElementIds.length;
    const current = _state.fieldModeIndex + 1;
    let html = `
        <div class="dem-field-nav">
            <button class="dem-field-nav-btn" data-cc-action="cc-fb710354" ${total <= 1 ? 'disabled' : ''}>
                &larr;
            </button>
            <div>
                <div class="dem-field-element-name">${escapeHtml(element.name || element.id)}</div>
                <div class="dem-field-progress">${current} ${t('elementOf') || 'of'} ${total}</div>
            </div>
            <button class="dem-field-nav-btn" data-cc-action="cc-b705d20c" ${total <= 1 ? 'disabled' : ''}>
                &rarr;
            </button>
        </div>
        ${
            _state.noCampaignMode
                ? `
        <div class="dem-field-date-row">
            <label class="dem-form-label">${t('collectionDate') || 'Collection Date'}</label>
            <input data-field-meta="true" data-field-meta-key="auto-pos:dataEntryMatrix:input:L1264" type="date" class="dem-field-date"
                   value="${_state.elementDates[elemId] || _state.campaignDate}"
                   data-cc-call-change="handleMatrixElementDate|s:${encodeURIComponent(`${elemId}`)}|v">
        </div>
        `
                : ''
        }
        <div class="dem-field-rows">
    `;
    for (const paramId of _state.selectedParameterIds) {
        const cell = _state.cells[paramId]?.[elemId] || { value: null, dirty: false, error: null };
        const hist = _state.history[paramId]?.[elemId] || [];
        const fieldThresholds = getThresholds(paramId);
        const fieldVi = findViEntry(fieldThresholds);
        const voValue = fieldVi?.value != null ? fieldVi.value : null;
        const view = deriveCellView(cell, fieldVi);
        const inputClass = 'dem-field-input' + view.classSuffix;
        const displayValue = view.displayValue;
        const histText = formatHistoryText(hist);
        html += `
            <div class="dem-field-row">
                <div class="dem-field-row-label">
                    <div class="dem-field-row-param">${escapeHtml(getParamName(paramId))}</div>
                    <div class="dem-field-row-unit">
                        ${escapeHtml(getUnitLabel(paramId))}
                        ${voValue != null ? `<span class="dem-field-vo">${t('referenceValue') || 'VO'}: ${voValue}</span>` : ''}
                    </div>
                    ${histText ? `<div class="dem-field-row-history">${t('previous') || 'Prev'}: ${escapeHtml(histText)}</div>` : ''}
                </div>
                <input type="text" class="${inputClass}" inputmode="decimal"
                       data-field-meta="true"
                       data-field-meta-key="element:${elemId}:observation:${paramId}:reading"
                       value="${displayValue}"
                       data-cc-call-input="handleMatrixCellChange|s:${encodeURIComponent(`${paramId}`)}|s:${encodeURIComponent(`${elemId}`)}|v"
                       data-cc-call-blur="handleMatrixCellBlur|s:${encodeURIComponent(`${paramId}`)}|s:${encodeURIComponent(`${elemId}`)}|t">
            </div>
        `;
    }
    html += `</div>`;
    return html;
}
//# sourceMappingURL=dataEntryMatrix.js.map
