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
   CALCULATOR HANDLERS — Modal UI + filter builder
   Handlers para o modulo de calculadora: metricas, regras, ratios

   Padrao: exporta calculatorHandlers + setCalculatorUpdateAllUI
   ================================================================ */
import { getCalculatorItems, getCalculatorItemById, addCalculatorItem, updateCalculatorItem, removeCalculatorItem, duplicateCalculatorItem, reorderCalculatorItem, addCalculatorFilter, removeCalculatorFilter, updateCalculatorFilter, computeAllCalculator, clearCalculator, setCalculatorUncertaintyContext, } from '../../core/calculator/manager.js';
import { getUserConstants } from '../../core/constants/manager.js';
import { CONFIG } from '../../config.js';
import { getAllElements } from '../../core/elements/manager.js';
import { getAllFamilies } from '../../core/elements/families.js';
import { getAllCampaigns } from '../../core/campaigns/manager.js';
import { escapeHtml } from '../helpers/html.js';
import { getIcon as getUiIcon } from '../ui/icons.js';
import { toFiniteNumber } from '../helpers/toFiniteNumber.js';
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { asyncConfirm } from '../ui/asyncDialogs.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
import { loadUncertaintyHubState } from '../../core/uncertainty/hubStore.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
/** @typedef {Record<string, any>} CalculatorItem */
/** @typedef {Record<string, any>} CalculatorResult */
/** @typedef {{ id: string, label: string }} SelectOption */
/**
 * Compatibility wrapper for legacy call sites that pass numeric icon sizes.
 * @param {string} name
 * @param {number|string|{size?: string, class?: string}} [opts]
 * @returns {string}
 */
function getIcon(name: any, opts: any = {}) {
    if (typeof opts === 'number')
        return getUiIcon(name, { size: `${opts}px` });
    if (typeof opts === 'string')
        return getUiIcon(name, { size: opts });
    return getUiIcon(name, opts);
}
/** @param {any} id @returns {CalculatorItem|null} */
function getCalculatorItem(id: any) {
    return /** @type {CalculatorItem|null} */ (getCalculatorItemById(id));
}
/** @returns {CalculatorItem[]} */
function getCalculatorItemList() {
    return /** @type {CalculatorItem[]} */ (getCalculatorItems());
}
/** @returns {CalculatorResult[]} */
function computeCalculatorResults() {
    return /** @type {CalculatorResult[]} */ (computeAllCalculator());
}
/** @type {null | (() => void)} */
let _requestUIRefresh: any = null;
/** @type {{ q2qLabel: string, runType: string }} */
let _calculatorUncertaintyProfile = { q2qLabel: 'medium', runType: 'exploratory' };
/** @param {null | (() => void)} fn */
export function setCalculatorUpdateAllUI(fn: any) {
    _requestUIRefresh = fn;
}
function requestCalculatorUIRefresh(reason = 'calculator.changed') {
    if (typeof _requestUIRefresh !== 'function')
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
    ];
    for (const domain of domains) {
        _requestUIRefresh(domain, reason);
    }
}
// ----------------------------------------------------------------
// MODAL OPEN/CLOSE
// ----------------------------------------------------------------
function handleOpenCalculator() {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('calculator')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    const modal = document.getElementById('calculator-modal');
    if (!modal)
        return;
    modal.classList.add('visible');
    _hydrateCalculatorUncertaintyContext().finally(() => _renderCalculatorModal());
}
/**
 * Open Calculator from another module context (EIS, Readings, etc).
 * Keeps navigation friction low when user needs formulas quickly.
 * @param {string} source
 */
function handleOpenCalculatorFromContext(source = 'unknown') {
    handleOpenCalculator();
    const body = document.getElementById('calculator-modal-body');
    const sourceKey = String(source || 'unknown').toLowerCase();
    const sourceLabels = ({
        eis: 'EIS Dashboard',
        'eis-dashboard': 'EIS Dashboard',
        'eis-custom-builder': 'EIS Custom Builder',
        'eis-custom-empty': 'EIS Custom Empty',
        'eis-formula': 'EIS Axis Formula',
        readings: 'Readings',
        'readings-qaqc': 'Readings QA/QC',
    });
    const sourceObjectives = ({
        eis: 'reuse pre-defined formulas in score analysis',
        'eis-dashboard': 'reuse pre-defined formulas in score analysis',
        'eis-custom-builder': 'link a formula_ref to each custom axis',
        'eis-custom-empty': 'start from templates before editing custom axes',
        'eis-formula': 'pick formula bounds and validate axis constraints',
        readings: 'analyze reading trends and derived metrics',
        'readings-qaqc': 'validate QA/QC conditions using rule/ratio blocks',
    });
    const sourceLabel = (sourceLabels as Record<string, string>)[sourceKey] || source.toUpperCase();
    const objective = (sourceObjectives as Record<string, string>)[sourceKey] || 'reuse pre-defined formulas in context';
    if (body) {
        body.dataset.openSource = source;
        body.dataset.openSourceLabel = sourceLabel;
        body.dataset.openObjective = objective;
        body.title = `${sourceLabel} - ${objective}`;
    }
    showToast(`${t('calculatorFromContext') || 'Calculator opened from'} ${sourceLabel}: ${objective}.`, 'info', 2400);
    import('../telemetry/tracker.js')
        .then(({trackEvent }: any) => {
        trackEvent('navigation', 'eis_calculator_opened', {
            source: sourceKey,
            objective,
        });
    })
        .catch((_e: any) => console.debug('[utils/handlers/calculator:silent-catch]', _e?.message || _e));
}
function handleCloseCalculator() {
    const modal = document.getElementById('calculator-modal');
    if (modal)
        modal.classList.remove('visible');
}
// ----------------------------------------------------------------
// ITEM CRUD
// ----------------------------------------------------------------
function handleAddCalculatorMetric() {
    addCalculatorItem({ type: 'metric', label: t('calculatorNewMetric') || 'New Metric ' });
    _renderCalculatorModal();
    _fireChanged();
}
function handleAddCalculatorRule() {
    addCalculatorItem({
        type: 'rule',
        label: t('calculatorNewRule') || 'New Rule ',
        conditions: { logic: 'AND', conditions: [] },
    });
    _renderCalculatorModal();
    _fireChanged();
}
function handleAddCalculatorRatio() {
    addCalculatorItem({
        type: 'ratio',
        label: t('calculatorNewRatio') || 'New Ratio ',
        ratio: { numeratorParameterId: '', denominatorParameterId: '', operator: 'gt', threshold: 1 },
    });
    _renderCalculatorModal();
    _fireChanged();
}
/** @param {string} id */
function handleRemoveCalculatorItem(id: any) {
    removeCalculatorItem(id);
    _renderCalculatorModal();
    _fireChanged();
}
/** @param {string} id */
function handleDuplicateCalculatorItem(id: any) {
    duplicateCalculatorItem(id);
    _renderCalculatorModal();
    _fireChanged();
}
/** @param {string} id @param {'up'|'down'} direction */
function handleReorderCalculatorItem(id: any, direction: any) {
    reorderCalculatorItem(id, direction);
    _renderCalculatorModal();
    _fireChanged();
}
/** @param {string} id */
function handleToggleCalculatorItem(id: any) {
    const item = getCalculatorItem(id);
    if (item) {
        updateCalculatorItem(id, { enabled: !item.enabled });
        _renderCalculatorModal();
        _fireChanged();
    }
}
/** @param {string} id @param {string} field @param {any} value */
function handleUpdateCalculatorField(id: any, field: any, value: any) {
    updateCalculatorItem(id, { [field]: value });
    _renderCalculatorModal();
    _fireChanged();
}
// ----------------------------------------------------------------
// FILTER CRUD
// ----------------------------------------------------------------
/** @param {string} itemId */
function handleAddCalculatorFilter(itemId: any) {
    addCalculatorFilter(itemId);
    _renderCalculatorModal();
    _fireChanged();
}
/** @param {string} itemId @param {number} filterIndex */
function handleRemoveCalculatorFilter(itemId: any, filterIndex: any) {
    removeCalculatorFilter(itemId, filterIndex);
    _renderCalculatorModal();
    _fireChanged();
}
/** @param {string} itemId @param {number} filterIndex @param {string} field @param {any} value */
function handleUpdateCalculatorFilter(itemId: any, filterIndex: any, field: any, value: any) {
    updateCalculatorFilter(itemId, filterIndex, field, value);
    _renderCalculatorModal();
    _fireChanged();
}
// ----------------------------------------------------------------
// CONDITION CRUD (for compound rules)
// ----------------------------------------------------------------
/** @param {string} itemId */
function handleAddCalculatorCondition(itemId: any) {
    const item = getCalculatorItem(itemId);
    if (!item || item.type !== 'rule')
        return;
    const conditions = item.conditions || { logic: 'AND', conditions: [] };
    conditions.conditions.push({
        parameterId: '',
        operator: 'gt',
        threshold: 0,
        thresholdUnit: '',
    });
    updateCalculatorItem(itemId, { conditions });
    _renderCalculatorModal();
    _fireChanged();
}
/** @param {string} itemId @param {number} condIndex */
function handleRemoveCalculatorCondition(itemId: any, condIndex: any) {
    const item = getCalculatorItem(itemId);
    if (!item || !item.conditions)
        return;
    item.conditions.conditions.splice(condIndex, 1);
    updateCalculatorItem(itemId, { conditions: item.conditions });
    _renderCalculatorModal();
    _fireChanged();
}
/** @param {string} itemId @param {number} condIndex @param {string} field @param {any} value */
function handleUpdateCalculatorCondition(itemId: any, condIndex: any, field: any, value: any) {
    const item = getCalculatorItem(itemId);
    if (!item || !item.conditions?.conditions?.[condIndex])
        return;
    item.conditions.conditions[condIndex][field] = field === 'threshold' ? parseFloat(value) || 0 : value;
    updateCalculatorItem(itemId, { conditions: item.conditions });
    _renderCalculatorModal();
    _fireChanged();
}
/** @param {string} itemId @param {string} logic */
function handleUpdateCalculatorLogic(itemId: any, logic: any) {
    const item = getCalculatorItem(itemId);
    if (!item || !item.conditions)
        return;
    item.conditions.logic = logic;
    updateCalculatorItem(itemId, { conditions: item.conditions });
    _renderCalculatorModal();
    _fireChanged();
}
// ----------------------------------------------------------------
// RATIO FIELDS
// ----------------------------------------------------------------
/** @param {string} itemId @param {string} field @param {any} value */
function handleUpdateCalculatorRatio(itemId: any, field: any, value: any) {
    const item = getCalculatorItem(itemId);
    if (!item || !item.ratio)
        return;
    item.ratio[field] = field === 'threshold' ? parseFloat(value) || 0 : value;
    updateCalculatorItem(itemId, { ratio: item.ratio });
    _renderCalculatorModal();
    _fireChanged();
}
// ----------------------------------------------------------------
// PUSH TO TICKER
// ----------------------------------------------------------------
/** @param {string} id */
function handlePushCalculatorToTicker(id: any) {
    const item = getCalculatorItem(id);
    if (!item)
        return;
    // Usa ticker manager para criar item equivalente
    import('../ticker/manager.js')
        .then(({addTickerItem }: any) => {
        addTickerItem({
            label: item.label,
            suffix: item.suffix,
            filters: item.filters.map((f: any) => ({ ...f })),
            calculation: item.calculation || 'count',
            unitId: item.unitId,
            precision: item.precision,
            color: item.color,
            enabled: true,
        });
        window.dispatchEvent(new CustomEvent('tickerChanged'));
        showToast(t('calculatorPushedToTicker') || 'Pushed to ticker', 'success');
    })
        .catch((err: any) => console.warn('[handlers/calculator] import ticker/manager failed:', err));
}
// ----------------------------------------------------------------
// MODAL RENDERING
// ----------------------------------------------------------------
function _renderCalculatorModal() {
    const body = document.getElementById('calculator-modal-body');
    if (!body)
        return;
    const items = getCalculatorItemList();
    const results = computeCalculatorResults();
    const uncertaintyProfileHtml = _renderCalculatorUncertaintyProfile(results);
    if (items.length === 0) {
        body.innerHTML = `<div class="calculator-empty">
            ${uncertaintyProfileHtml}
            <p>${t('calculatorEmpty') || 'No metrics configured. Add a metric, rule, or ratio.'}</p>
        </div>`;
        return;
    }
    body.innerHTML =
        uncertaintyProfileHtml +
            items
                .map((item: any, _idx: number) => {
                const result = results.find((r: any) => r.id === item.id);
                const typeIcon = item.type === 'rule' ? 'shield' : item.type === 'ratio' ? 'percent' : 'activity';
                const typeLabel = item.type === 'rule' ? 'Rule' : item.type === 'ratio' ? 'Ratio' : 'Metric';
                const isReadonly = item.readonly === true;
                const readonlyBadge = isReadonly ? '<span class="calculator-template-badge">TEMPLATE</span>' : '';
                const labelInput = isReadonly
                    ? `<span class="calculator-label-readonly">${escapeHtml(item.label || '')}</span>`
                    : `<input data-field-meta="true" data-field-meta-key="auto-pos:calculator:input:L316" type="text" class="calculator-label-input" value="${escapeHtml(item.label || '')}"
                    data-cc-call-change="handleUpdateCalculatorField|s:${encodeURIComponent(`${item.id}`)}|s:label|v"
                    placeholder="${t('calculatorLabelPlaceholder') || 'Label...'}">`;
                return `<div class="calculator-item ${item.enabled ? '' : 'calculator-item-disabled'} ${isReadonly ? 'calculator-item-template' : ''}" data-id="${item.id}">
            <div class="calculator-item-header">
                <span class="calculator-type-badge calculator-type-${item.type}">${getIcon(typeIcon, 12)} ${typeLabel}</span>
                ${readonlyBadge}
                ${labelInput}
                <span class="calculator-result" style="color:${item.color || 'var(--primary-text)'}">
                    ${result ? escapeHtml(result.text) : '—'}
                    ${result?.postProcessingNote ? `<span class="calculator-pp-badge" title="${t('postProcessing') || 'Post-processing'}: ${escapeHtml(result.postProcessingNote)}">${escapeHtml(result.postProcessingNote)}</span>` : ''}
                    ${result?.uncertaintyGate
                    ? `<span class="calculator-pp-badge" title="Uncertainty gate: ${escapeHtml(result.uncertaintyGate.action)} (p=${Number(result.uncertaintyGate.exceedanceProb || 0).toFixed(2)})">UQ:${escapeHtml(result.uncertaintyGate.action)}</span>`
                    : ''}
                </span>
                <div class="calculator-actions">
                    ${isReadonly ? '' : `<button data-cc-call-click="handleToggleCalculatorItem|s:${encodeURIComponent(`${item.id}`)}" title="Toggle">${getIcon(item.enabled ? 'eye' : 'eye-off', 14)}</button>`}
                    <button data-cc-call-click="handleDuplicateCalculatorItem|s:${encodeURIComponent(`${item.id}`)}" title="${isReadonly ? 'Use as template' : 'Duplicate'}">${getIcon('copy', 14)}</button>
                    ${isReadonly ? '' : `<button data-cc-call-click="handlePushCalculatorToTicker|s:${encodeURIComponent(`${item.id}`)}" title="Push to Ticker">${getIcon('bar-chart-2', 14)}</button>`}
                    ${isReadonly ? '' : `<button data-cc-call-click="handleReorderCalculatorItem|s:${encodeURIComponent(`${item.id}`)}|s:up" title="Up">${getIcon('chevron-up', 14)}</button>`}
                    ${isReadonly ? '' : `<button data-cc-call-click="handleReorderCalculatorItem|s:${encodeURIComponent(`${item.id}`)}|s:down" title="Down">${getIcon('chevron-down', 14)}</button>`}
                    <button data-cc-call-click="handleRemoveCalculatorItem|s:${encodeURIComponent(`${item.id}`)}" title="${isReadonly ? 'Remove template' : 'Remove'}" class="btn-danger">${getIcon('trash-2', 14)}</button>
                </div>
            </div>
            <div class="calculator-item-body">
                ${_renderFilters(item)}
                ${item.type === 'metric' ? _renderMetricConfig(item) : ''}
                ${item.type === 'rule' ? _renderRuleConfig(item) : ''}
                ${item.type === 'ratio' ? _renderRatioConfig(item) : ''}
            </div>
        </div>`;
            })
                .join('');
}
/** @param {CalculatorResult[]} results */
function _renderCalculatorUncertaintyProfile(results: any) {
    const actions = (results || []).map((r: any) => r?.uncertaintyGate?.action).filter(Boolean);
    const order = ['hard_block', 'block', 'warn', 'allow'];
    const topAction = actions.sort((a: any, b: any) => order.indexOf(a) - order.indexOf(b))[0] || 'allow';
    const total = actions.length;
    const blocked = actions.filter((a: any) => a === 'hard_block' || a === 'block').length;
    const warned = actions.filter((a: any) => a === 'warn').length;
    return `<div class="calculator-postprocessing" style="margin-bottom:10px;">
        <div class="calculator-pp-header">
            <span class="calculator-section-label">UNCERTAINTY PROFILE</span>
            <button class="calculator-pp-add-btn" data-cc-action="cc-0471746b">
                ${getIcon('save', 12)} Apply
            </button>
        </div>
        <div class="calculator-config-row">
            <label>Q2Q Label</label>
            <select data-field-meta="true" data-field-meta-key="auto:calc-uq-q2q-label" id="calc-uq-q2q-label">
                ${['very_low', 'low', 'medium', 'high', 'very_high']
        .map((opt: any) => `<option value="${opt}" ${_calculatorUncertaintyProfile.q2qLabel === opt ? 'selected' : ''}>${opt}</option>`)
        .join('')}
            </select>
            <label>Run Type</label>
            <select data-field-meta="true" data-field-meta-key="auto:calc-uq-run-type" id="calc-uq-run-type">
                <option value="exploratory" ${_calculatorUncertaintyProfile.runType === 'exploratory' ? 'selected' : ''}>exploratory</option>
                <option value="compliance" ${_calculatorUncertaintyProfile.runType === 'compliance' ? 'selected' : ''}>compliance</option>
            </select>
            <button class="btn-sm" data-cc-action="cc-97c037d4">Reload</button>
        </div>
        <div class="calculator-pp-hint" style="margin-top:6px;">
            Gate summary: <strong>${topAction}</strong> | items=${total} | blocked=${blocked} | warn=${warned}
        </div>
    </div>`;
}
async function _hydrateCalculatorUncertaintyContext() {
    try {
        const state = await loadUncertaintyHubState();
        _calculatorUncertaintyProfile = {
            q2qLabel: state?.q2qInput?.label || 'medium',
            runType: state?.q2qInput?.runType || 'exploratory',
        };
        setCalculatorUncertaintyContext({
            q2qLabel: state?.q2qInput?.label || 'medium',
            runType: state?.q2qInput?.runType || 'exploratory',
            rules: Array.isArray(state?.rules) ? state.rules : [],
        });
    } catch (_err: any) {
        setCalculatorUncertaintyContext({
            q2qLabel: 'medium',
            runType: 'exploratory',
            rules: [],
        });
    }
}
async function handleApplyCalculatorUncertaintyProfile() {
    const q2qLabel = (document.getElementById('calc-uq-q2q-label'))?.value || 'medium';
    const runType = 
    /** @type {HTMLSelectElement|null} */ (document.getElementById('calc-uq-run-type'))?.value || 'exploratory';
    const state = await loadUncertaintyHubState();
    const next = {
        ...state,
        q2qInput: {
            ...(state?.q2qInput || {}),
            label: q2qLabel,
            runType,
        },
    };
    if (typeof window.handleSaveUncertaintyHubState === 'function') {
        await window.handleSaveUncertaintyHubState(next);
    }
    _calculatorUncertaintyProfile = { q2qLabel, runType };
    setCalculatorUncertaintyContext({
        q2qLabel,
        runType,
        rules: Array.isArray(next?.rules) ? next.rules : [],
    });
    _renderCalculatorModal();
    _fireChanged();
    showToast('Uncertainty profile applied to Calculator.', 'success');
}
async function handleReloadCalculatorUncertaintyProfile() {
    await _hydrateCalculatorUncertaintyContext();
    _renderCalculatorModal();
    _fireChanged();
}
// ----------------------------------------------------------------
// FILTER RENDERING
// ----------------------------------------------------------------
/** @param {CalculatorItem} item */
function _renderFilters(item: any) {
    const dims = ([
        { id: 'parameter', label: 'Parameter' },
        { id: 'family', label: 'Family' },
        { id: 'element', label: 'Element' },
        { id: 'area', label: 'Area' },
        { id: 'campaign', label: 'Campaign' },
        { id: 'category', label: 'Category' },
        { id: 'variable', label: 'Variable' },
    ]);
    const operators = ([
        { id: 'is', label: 'is' },
        { id: 'is_not', label: 'is not' },
        { id: 'in', label: 'in' },
        { id: 'not_in', label: 'not in' },
    ]);
    const filtersHtml = (item.filters || [])
        .map((f: any, fi: number) => {
        const dimOpts = dims
            .map((d: any) => `<option value="${d.id}" ${f.dimension === d.id ? 'selected' : ''}>${d.label}</option>`)
            .join('');
        const opOpts = operators
            .map((o: any) => `<option value="${o.id}" ${f.operator === o.id ? 'selected' : ''}>${o.label}</option>`)
            .join('');
        // Variavel sub-selector (se dimensao=variable)
        let variableSelector = '';
        if (f.dimension === 'variable') {
            const obsVars = CONFIG.OBSERVATION_VARIABLES || [];
            const varOpts = obsVars
                .map((v: any) => `<option value="${v.id}" ${f.variableId === v.id ? 'selected' : ''}>${v.name} (${v.group})</option>`)
                .join('');
            variableSelector = `<select class="calculator-filter-variable"
                data-cc-call-change="handleUpdateCalculatorFilter|s:${encodeURIComponent(`${item.id}`)}|j:${encodeURIComponent(String(fi))}|s:variableId|v">
                <option value="">—</option>${varOpts}</select>`;
        }
        // Value dropdown (depende da dimensao)
        const valueHtml = _renderFilterValueInput(item.id, fi, f);
        return `<div class="calculator-filter-row">
            <select data-field-meta="true" data-field-meta-key="auto-pos:calculator:select:L497" data-cc-call-change="handleUpdateCalculatorFilter|s:${encodeURIComponent(`${item.id}`)}|j:${encodeURIComponent(String(fi))}|s:dimension|v">${dimOpts}</select>
            ${variableSelector}
            <select data-field-meta="true" data-field-meta-key="auto-pos:calculator:select:L499" data-cc-call-change="handleUpdateCalculatorFilter|s:${encodeURIComponent(`${item.id}`)}|j:${encodeURIComponent(String(fi))}|s:operator|v">${opOpts}</select>
            ${valueHtml}
            <button data-cc-call-click="handleRemoveCalculatorFilter|s:${encodeURIComponent(`${item.id}`)}|j:${encodeURIComponent(String(fi))}" class="btn-sm">${getIcon('x', 12)}</button>
        </div>`;
    })
        .join('');
    return `<div class="calculator-filters">
        <div class="calculator-filters-label">${t('calculatorFilters') || 'Filters'}
            <button data-cc-call-click="handleAddCalculatorFilter|s:${encodeURIComponent(`${item.id}`)}" class="btn-sm">${getIcon('plus', 12)} Add</button>
        </div>
        ${filtersHtml}
    </div>`;
}
/** @param {string} itemId @param {number} fi @param {CalculatorItem} filter */
function _renderFilterValueInput(itemId: any, fi: any, filter: any) {
    if (filter.dimension === 'variable' && filter.variableId) {
        // Busca tipo da variavel
        const varDef = (CONFIG.OBSERVATION_VARIABLES || []).find((v: any) => v.id === filter.variableId);
        if (varDef?.type === 'boolean') {
            return `<select data-field-meta="true" data-field-meta-key="auto-pos:calculator:select:L519" data-cc-call-change="handleUpdateCalculatorFilter|s:${encodeURIComponent(`${itemId}`)}|j:${encodeURIComponent(String(fi))}|s:value|v">
                <option value="1" ${filter.value === '1' ? 'selected' : ''}>Yes (1)</option>
                <option value="0" ${filter.value === '0' ? 'selected' : ''}>No (0)</option>
            </select>`;
        }
        if (varDef?.type === 'select' && varDef.options) {
            const opts = varDef.options
                .map((o: any) => `<option value="${o}" ${filter.value === o ? 'selected' : ''}>${o}</option>`)
                .join('');
            return `<select data-field-meta="true" data-field-meta-key="auto-pos:calculator:select:L528" data-cc-call-change="handleUpdateCalculatorFilter|s:${encodeURIComponent(`${itemId}`)}|j:${encodeURIComponent(String(fi))}|s:value|v">
                <option value="">—</option>${opts}</select>`;
        }
    }
    // Para dimension standard: usa getDimensionOptions do ticker
    if (['parameter', 'family', 'element', 'area', 'campaign', 'category'].includes(filter.dimension)) {
        const options = _getDimensionOptions(filter.dimension);
        const opts = options
            .map((o: any) => `<option value="${o.id}" ${filter.value === o.id ? 'selected' : ''}>${escapeHtml(o.label)}</option>`)
            .join('');
        return `<select data-field-meta="true" data-field-meta-key="auto-pos:calculator:select:L542" data-cc-call-change="handleUpdateCalculatorFilter|s:${encodeURIComponent(`${itemId}`)}|j:${encodeURIComponent(String(fi))}|s:value|v">
            <option value="">—</option>${opts}</select>`;
    }
    // Fallback: texto livre
    return `<input data-field-meta="true" data-field-meta-key="auto-pos:calculator:input:L547" type="text" value="${escapeHtml(filter.value || '')}"
        data-cc-call-change="handleUpdateCalculatorFilter|s:${encodeURIComponent(`${itemId}`)}|j:${encodeURIComponent(String(fi))}|s:value|v" placeholder="Value">`;
}
/** @param {string} dimension @returns {SelectOption[]} */
function _getDimensionOptions(dimension: any) {
    switch (dimension) {
        case 'parameter':
            return (CONFIG.PARAMETERS || []).map((p: any) => ({ id: p.id, label: p.name }));
        case 'family':
            return Object.values(/** @type {Record<string, any>} */ (getAllFamilies() || {})).map((f: any) => ({
                id: f.id,
                label: f.nameKey || f.name || f.id,
            }));
        case 'element':
            return getAllElements().map((el: any) => ({ id: el.id, label: el.name || el.id }));
        case 'area':
            return getAllElements()
                .filter((e: any) => e.family === 'boundary' || e.family === 'area')
                .map((el: any) => ({ id: el.id, label: el.name || el.id }));
        case 'campaign':
            return getAllCampaigns().map((c: any) => ({ id: c.id, label: c.name || c.id }));
        case 'category': {
            const cats = (new Set());
            (CONFIG.PARAMETERS || []).forEach((p: any) => {
                if (p.category)
                    cats.add(p.category);
            });
            return [...cats].sort().map((c: any) => ({ id: c, label: c }));
        }
        default:
            return [];
    }
}
// ----------------------------------------------------------------
// METRIC CONFIG
// ----------------------------------------------------------------
/** @param {CalculatorItem} item */
function _renderMetricConfig(item: any) {
    const calcs = ['sum', 'average', 'min', 'max', 'count', 'latest', 'change_pct', 'trend'];
    const calcOpts = calcs
        .map((c: any) => `<option value="${c}" ${item.calculation === c ? 'selected' : ''}>${c}</option>`)
        .join('');
    return `<div class="calculator-config-row">
        <label>Calculation</label>
        <select data-field-meta="true" data-field-meta-key="auto-pos:calculator:select:L589" data-cc-call-change="handleUpdateCalculatorField|s:${encodeURIComponent(`${item.id}`)}|s:calculation|v">${calcOpts}</select>
        <label>Unit</label>
        <input data-field-meta="true" data-field-meta-key="auto-pos:calculator:input:L591" type="text" value="${escapeHtml(item.unitId || '')}" placeholder="ug_L"
            data-cc-call-change="handleUpdateCalculatorField|s:${encodeURIComponent(`${item.id}`)}|s:unitId|v">
        <label>Precision</label>
        <input data-field-meta="true" data-field-meta-key="auto-pos:calculator:input:L594" type="number" value="${item.precision}" min="0" max="6" style="width:50px"
            data-cc-call-change="handleUpdateCalculatorField|s:${encodeURIComponent(`${item.id}`)}|s:precision|pi">
        <label>Color</label>
        <input type="color" value="${item.color || '#2d8a7a'}"
            data-cc-call-change="handleUpdateCalculatorField|s:${encodeURIComponent(`${item.id}`)}|s:color|v">
    </div>
    ${_renderPostProcessing(item)}`;
}
// ----------------------------------------------------------------
// POST-PROCESSING RENDERING
// ----------------------------------------------------------------
/**
 * Render the postProcessing chain editor for a metric item.
 * Renderiza o editor de cadeia de pos-processamento por constantes.
 *
 * @param {CalculatorItem} item - CalculatorItem
 * @returns {string} HTML
 */
function _renderPostProcessing(item: any) {
    const steps = Array.isArray(item.postProcessing) ? item.postProcessing : [];
    const constants = (getUserConstants());
    // Operadores com símbolo matemático + label curto
    const ops = [
        { id: 'multiply', sym: '×', label: 'Multiplicar' },
        { id: 'divide', sym: '÷', label: 'Dividir' },
        { id: 'add', sym: '+', label: 'Somar' },
        { id: 'subtract', sym: '−', label: 'Subtrair' },
        { id: 'blend', sym: '≈', label: 'Mistura (blend)' },
    ];
    const stepsHtml = steps
        .map((s: any, si: number) => {
        const opOpts = ops
            .map((o: any) => `<option value="${o.id}" ${s.op === o.id ? 'selected' : ''}>${o.sym} ${o.label}</option>`)
            .join('');
        const constOpts = constants
            .map((c: any) => `<option value="${c.id}" ${s.constantId === c.id ? 'selected' : ''}>${escapeHtml(c.symbol)} — ${escapeHtml(c.name.length > 30 ? c.name.slice(0, 30) + '…' : c.name)} (${c.value})</option>`)
            .join('');
        const selectedConst = constants.find((c: any) => c.id === s.constantId);
        const constLabel = selectedConst
            ? `<code class="calculator-pp-const-label">${escapeHtml(selectedConst.symbol)}</code>`
            : '';
        return `
        <div class="calculator-pp-row">
            <select data-field-meta="true" data-field-meta-key="auto-pos:calculator:select:L647" class="calculator-pp-op"
                    title="${t('postProcessing') || 'Operação'}"
                    data-cc-call-change="handleUpdateCalculatorPostProcessing|s:${encodeURIComponent(`${item.id}`)}|j:${encodeURIComponent(String(si))}|s:op|v">
                ${opOpts}
            </select>
            <select data-field-meta="true" data-field-meta-key="auto-pos:calculator:select:L652" class="calculator-pp-const"
                    title="${t('applyConstant') || 'Constante'}"
                    data-cc-call-change="handleUpdateCalculatorPostProcessing|s:${encodeURIComponent(`${item.id}`)}|j:${encodeURIComponent(String(si))}|s:constantId|v">
                <option value="">— ${t('selectConstant') || 'selecionar constante'} —</option>
                ${constOpts}
            </select>
            ${constLabel}
            ${s.op === 'blend'
            ? (() => {
                const constOpts2 = constants
                    .map((c: any) => `<option value="${c.id}" ${s.constantId2 === c.id ? 'selected' : ''}>${escapeHtml(c.symbol)} (${c.value})</option>`)
                    .join('');
                const fA = toFiniteNumber(s.fraction, 0.5);
                const fB = toFiniteNumber(s.fraction2, 0.5);
                return `<input data-field-meta="true" data-field-meta-key="auto-pos:calculator:input:L670" type="number" class="calculator-pp-fraction" step="0.01" min="0" max="1" value="${fA}" placeholder="fA"
                           data-cc-call-change="handleUpdateCalculatorPostProcessing|s:${encodeURIComponent(`${item.id}`)}|j:${encodeURIComponent(String(si))}|s:fraction|pf">
                        <span>+</span>
                        <select data-field-meta="true" data-field-meta-key="auto-pos:calculator:select:L673" class="calculator-pp-const"
                                data-cc-call-change="handleUpdateCalculatorPostProcessing|s:${encodeURIComponent(`${item.id}`)}|j:${encodeURIComponent(String(si))}|s:constantId2|v">
                            <option value="">— 2ª constante —</option>
                            ${constOpts2}
                        </select>
                        <input data-field-meta="true" data-field-meta-key="auto-pos:calculator:input:L678" type="number" class="calculator-pp-fraction" step="0.01" min="0" max="1" value="${fB}" placeholder="fB"
                           data-cc-call-change="handleUpdateCalculatorPostProcessing|s:${encodeURIComponent(`${item.id}`)}|j:${encodeURIComponent(String(si))}|s:fraction2|pf">`;
            })()
            : ''}
            <button class="calculator-pp-remove"
                    data-cc-call-click="handleRemoveCalculatorPostProcessing|s:${encodeURIComponent(`${item.id}`)}|j:${encodeURIComponent(String(si))}"
                    title="${t('removeConstant') || 'Remover'}">
                ${getIcon('x', 12)}
            </button>
        </div>`;
    })
        .join('');
    const noConstantsHint = constants.length === 0
        ? `<div class="calculator-pp-hint">
               ${t('noConstants') || 'Nenhuma constante definida.'}
               <a href="#" data-cc-action="cc-f2794e1f">${t('addConstant') || 'Criar constante'}</a>
           </div>`
        : '';
    const addBtn = `
        <button class="calculator-pp-add-btn"
                data-cc-call-click="handleAddCalculatorPostProcessing|s:${encodeURIComponent(`${item.id}`)}"
                title="${t('applyConstant') || 'Aplicar constante'}">
            ${getIcon('plus', 12)} ${t('applyConstant') || 'Aplicar constante'}
        </button>`;
    return `
    <div class="calculator-postprocessing">
        <div class="calculator-pp-header">
            <span class="calculator-section-label">POST-PROCESSING</span>
            ${addBtn}
        </div>
        ${noConstantsHint}
        ${stepsHtml}
    </div>`;
}
// ----------------------------------------------------------------
// RULE CONFIG (compound conditions)
// ----------------------------------------------------------------
/** @param {CalculatorItem} item */
function _renderRuleConfig(item: any) {
    const conds = item.conditions?.conditions || [];
    const logic = item.conditions?.logic || 'AND';
    const params = CONFIG.PARAMETERS || [];
    const compOps = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'];
    const condsHtml = conds
        .map((c: any, ci: number) => {
        const paramOpts = params
            .map((p: any) => `<option value="${p.id}" ${c.parameterId === p.id ? 'selected' : ''}>${p.name}</option>`)
            .join('');
        const opOpts = compOps
            .map((o: any) => `<option value="${o}" ${c.operator === o ? 'selected' : ''}>${o}</option>`)
            .join('');
        return `<div class="calculator-condition-row">
            <select data-field-meta="true" data-field-meta-key="auto-pos:calculator:select:L738" data-cc-call-change="handleUpdateCalculatorCondition|s:${encodeURIComponent(`${item.id}`)}|j:${encodeURIComponent(String(ci))}|s:parameterId|v">
                <option value="">—</option>${paramOpts}</select>
            <select data-field-meta="true" data-field-meta-key="auto-pos:calculator:select:L740" data-cc-call-change="handleUpdateCalculatorCondition|s:${encodeURIComponent(`${item.id}`)}|j:${encodeURIComponent(String(ci))}|s:operator|v">${opOpts}</select>
            <input data-field-meta="true" data-field-meta-key="auto-pos:calculator:input:L741" type="number" value="${c.threshold}" step="any"
                data-cc-call-change="handleUpdateCalculatorCondition|s:${encodeURIComponent(`${item.id}`)}|j:${encodeURIComponent(String(ci))}|s:threshold|v">
            <input data-field-meta="true" data-field-meta-key="auto-pos:calculator:input:L743" type="text" value="${escapeHtml(c.thresholdUnit || '')}" placeholder="unit" style="width:60px"
                data-cc-call-change="handleUpdateCalculatorCondition|s:${encodeURIComponent(`${item.id}`)}|j:${encodeURIComponent(String(ci))}|s:thresholdUnit|v">
            <button data-cc-call-click="handleRemoveCalculatorCondition|s:${encodeURIComponent(`${item.id}`)}|j:${encodeURIComponent(String(ci))}" class="btn-sm">${getIcon('x', 12)}</button>
        </div>`;
    })
        .join('');
    return `<div class="calculator-rule-config">
        <div class="calculator-rule-header">
            <label>Logic</label>
            <select data-field-meta="true" data-field-meta-key="auto-pos:calculator:select:L753" data-cc-call-change="handleUpdateCalculatorLogic|s:${encodeURIComponent(`${item.id}`)}|v">
                <option value="AND" ${logic === 'AND' ? 'selected' : ''}>AND</option>
                <option value="OR" ${logic === 'OR' ? 'selected' : ''}>OR</option>
            </select>
            <button data-cc-call-click="handleAddCalculatorCondition|s:${encodeURIComponent(`${item.id}`)}" class="btn-sm">${getIcon('plus', 12)} Condition</button>
        </div>
        ${condsHtml}
        <div class="calculator-config-row">
            <label>Color</label>
            <input type="color" value="${item.color || '#e74c3c'}"
                data-cc-call-change="handleUpdateCalculatorField|s:${encodeURIComponent(`${item.id}`)}|s:color|v">
        </div>
    </div>`;
}
// ----------------------------------------------------------------
// RATIO CONFIG
// ----------------------------------------------------------------
/** @param {CalculatorItem} item */
function _renderRatioConfig(item: any) {
    const params = CONFIG.PARAMETERS || [];
    const ratio = item.ratio || {};
    const compOps = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'];
    const numOpts = params
        .map((p: any) => `<option value="${p.id}" ${ratio.numeratorParameterId === p.id ? 'selected' : ''}>${p.name}</option>`)
        .join('');
    const denOpts = params
        .map((p: any) => `<option value="${p.id}" ${ratio.denominatorParameterId === p.id ? 'selected' : ''}>${p.name}</option>`)
        .join('');
    const opOpts = compOps
        .map((o: any) => `<option value="${o}" ${ratio.operator === o ? 'selected' : ''}>${o}</option>`)
        .join('');
    return `<div class="calculator-ratio-config">
        <div class="calculator-config-row">
            <label>Numerator</label>
            <select data-field-meta="true" data-field-meta-key="auto-pos:calculator:select:L796" data-cc-call-change="handleUpdateCalculatorRatio|s:${encodeURIComponent(`${item.id}`)}|s:numeratorParameterId|v">
                <option value="">—</option>${numOpts}</select>
            <label>÷ Denominator</label>
            <select data-field-meta="true" data-field-meta-key="auto-pos:calculator:select:L799" data-cc-call-change="handleUpdateCalculatorRatio|s:${encodeURIComponent(`${item.id}`)}|s:denominatorParameterId|v">
                <option value="">—</option>${denOpts}</select>
        </div>
        <div class="calculator-config-row">
            <label>Threshold</label>
            <select data-field-meta="true" data-field-meta-key="auto-pos:calculator:select:L804" data-cc-call-change="handleUpdateCalculatorRatio|s:${encodeURIComponent(`${item.id}`)}|s:operator|v">${opOpts}</select>
            <input data-field-meta="true" data-field-meta-key="auto-pos:calculator:input:L805" type="number" value="${ratio.threshold || 0}" step="any"
                data-cc-call-change="handleUpdateCalculatorRatio|s:${encodeURIComponent(`${item.id}`)}|s:threshold|v">
            <label>Precision</label>
            <input data-field-meta="true" data-field-meta-key="auto-pos:calculator:input:L808" type="number" value="${item.precision || 2}" min="0" max="6" style="width:50px"
                data-cc-call-change="handleUpdateCalculatorField|s:${encodeURIComponent(`${item.id}`)}|s:precision|pi">
            <label>Color</label>
            <input type="color" value="${item.color || '#3498db'}"
                data-cc-call-change="handleUpdateCalculatorField|s:${encodeURIComponent(`${item.id}`)}|s:color|v">
        </div>
    </div>`;
}
// ----------------------------------------------------------------
// POST-PROCESSING CRUD (constantes do usuario aplicadas ao resultado)
// ----------------------------------------------------------------
/** @param {string} itemId */
function handleAddCalculatorPostProcessing(itemId: any) {
    const item = getCalculatorItem(itemId);
    if (!item)
        return;
    const pp = Array.isArray(item.postProcessing) ? [...item.postProcessing] : [];
    pp.push({ op: 'multiply', constantId: '' });
    updateCalculatorItem(itemId, { postProcessing: pp });
    _renderCalculatorModal();
    _fireChanged();
}
/** @param {string} itemId @param {number} stepIdx */
function handleRemoveCalculatorPostProcessing(itemId: any, stepIdx: any) {
    const item = getCalculatorItem(itemId);
    if (!item || !Array.isArray(item.postProcessing))
        return;
    const pp = [...item.postProcessing];
    pp.splice(stepIdx, 1);
    updateCalculatorItem(itemId, { postProcessing: pp });
    _renderCalculatorModal();
    _fireChanged();
}
/** @param {string} itemId @param {number} stepIdx @param {string} field @param {any} value */
function handleUpdateCalculatorPostProcessing(itemId: any, stepIdx: any, field: any, value: any) {
    const item = getCalculatorItem(itemId);
    if (!item || !Array.isArray(item.postProcessing))
        return;
    const pp = [...item.postProcessing];
    if (!pp[stepIdx])
        return;
    pp[stepIdx] = { ...pp[stepIdx], [field]: value };
    // Auto-init campos blend quando op muda para 'blend'
    if (field === 'op' && value === 'blend') {
        if (!Number.isFinite(pp[stepIdx].fraction))
            pp[stepIdx].fraction = 0.5;
        if (!Number.isFinite(pp[stepIdx].fraction2))
            pp[stepIdx].fraction2 = 0.5;
        if (pp[stepIdx].constantId2 === undefined)
            pp[stepIdx].constantId2 = '';
    }
    updateCalculatorItem(itemId, { postProcessing: pp });
    _renderCalculatorModal();
    _fireChanged();
}
// ----------------------------------------------------------------
// CLEAR ALL
// ----------------------------------------------------------------
async function handleClearCalculator() {
    // Ação destrutiva: confirmar antes de apagar todos os itens da calculadora.
    // asyncConfirm (não confirm nativo — regra "sem dialogs nativos").
    const confirmed = await asyncConfirm('Limpar a calculadora? Esta ação não pode ser desfeita.', {
        confirmLabel: 'Limpar',
        danger: true,
    });
    if (!confirmed)
        return;
    clearCalculator();
    _renderCalculatorModal();
    _fireChanged();
}
// ----------------------------------------------------------------
// INTERNAL
// ----------------------------------------------------------------
function _fireChanged() {
    window.dispatchEvent(new CustomEvent('calculatorChanged'));
    requestCalculatorUIRefresh();
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export const calculatorHandlers = {
    handleOpenCalculator,
    handleOpenCalculatorFromContext,
    handleCloseCalculator,
    handleAddCalculatorMetric,
    handleAddCalculatorRule,
    handleAddCalculatorRatio,
    handleRemoveCalculatorItem,
    handleDuplicateCalculatorItem,
    handleReorderCalculatorItem,
    handleToggleCalculatorItem,
    handleUpdateCalculatorField,
    handleAddCalculatorFilter,
    handleRemoveCalculatorFilter,
    handleUpdateCalculatorFilter,
    handleAddCalculatorCondition,
    handleRemoveCalculatorCondition,
    handleUpdateCalculatorCondition,
    handleUpdateCalculatorLogic,
    handleUpdateCalculatorRatio,
    handlePushCalculatorToTicker,
    handleClearCalculator,
    handleAddCalculatorPostProcessing,
    handleRemoveCalculatorPostProcessing,
    handleUpdateCalculatorPostProcessing,
    handleApplyCalculatorUncertaintyProfile,
    handleReloadCalculatorUncertaintyProfile,
};
//# sourceMappingURL=calculator.js.map
