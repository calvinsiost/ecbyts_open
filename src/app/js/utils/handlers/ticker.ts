// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// @ts-check
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
   TICKER HANDLERS — UI handlers for the metrics ticker bar
   Controla a barra de metricas e o modal de configuracao

   O ticker e uma barra rolante estilo painel financeiro que
   exibe metricas ambientais configuradas pelo usuario.
   Cada item tem filtros dinamicos + calculo + texto livre.
   ================================================================ */
import {
    getTickerConfig,
    getTickerItems,
    getTickerItemById,
    addTickerItem,
    updateTickerItem,
    removeTickerItem,
    duplicateTickerItem,
    reorderTickerItem,
    setTickerVisible,
    setTickerSpeed,
    setTickerSeparator,
    addTickerFilter,
    removeTickerFilter,
    updateTickerFilter,
    computeAll,
    computeItem,
    getDimensionOptions,
} from '../ticker/manager.js';
import { setTickerBarVisible, renderTicker, renderTickerPreview, updateTickerAnimation } from '../ticker/renderer.js';
import { openModal } from '../ui/modals.js';
import { showToast as _showToastImpl } from '../ui/toast.js';
const showToast = _showToastImpl;
import { t } from '../i18n/translations.js';
import { getIcon } from '../ui/icons.js';
import { getAllCampaigns } from '../../core/campaigns/manager.js';
import { CONFIG } from '../../config.js';
import { getLockedBadges } from '../libraries/locks.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
/** @typedef {{dimension: string, operator: string, value: string|string[]}} TickerFilter */
/** @typedef {{id: string, label: string, suffix: string, filters: TickerFilter[], calculation: string, unitId?: string|null, precision: number, color?: string, enabled: boolean, campaignA?: string|null, campaignB?: string|null}} TickerItem */
/** @typedef {{visible: boolean, speed: string, separator: string, items: TickerItem[]}} TickerConfig */
/** @typedef {{id: string, label: string, icon?: string, color?: string}} LockedBadge */
/** @typedef {{id: string, label: string}} SelectOption */
let _requestUIRefresh: any = null;
/** @param {null | (() => void)} fn */
export function setUpdateAllUI( fn: any) {
    _requestUIRefresh = fn;
}
function triggerTickerUIRefresh(reason = 'ticker.changed') {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.TICKER,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
    ];
    for (const domain of domains) {
        _requestUIRefresh(domain, reason);
    }
}
// ================================================================
// TICKER VISIBILITY
// ================================================================
/**
 * Toggle ticker bar on/off from View ribbon.
 * Liga/desliga a barra de metricas pelo ribbon View.
 */
export function handleToggleTicker() {
    const config = getTickerConfig();
    const visible = !config.visible;
    setTickerVisible(visible);
    setTickerBarVisible(visible);
    if (visible) {
        const items = computeAll();
        renderTicker(items);
    }
    triggerTickerUIRefresh('ticker.visibility-toggled');
}
// ================================================================
// CONFIG MODAL
// ================================================================
/**
 * Open the ticker configuration modal.
 * Abre o modal de configuracao da barra de metricas.
 */
export function handleOpenTickerConfig() {
    renderConfigModal();
    openModal('ticker-modal');
}
/**
 * Render the full config modal content.
 * Renderiza o conteudo completo do modal de configuracao.
 */
function renderConfigModal() {
    const config = getTickerConfig();
    // Global settings
    const speedSelect = document.getElementById('ticker-speed-select');
    if (speedSelect) speedSelect.value = config.speed;
    const sepInput = document.getElementById('ticker-separator');
    if (sepInput) sepInput.value = config.separator;
    // Items list
    renderItemsList();
    // Preview
    refreshPreview();
}
/**
 * Render the items list inside the config modal.
 * Renderiza a lista de itens configuráveis.
 */
function renderItemsList() {
    const container = document.getElementById('ticker-items-list');
    if (!container) return;
    // Preserve expanded state across re-renders
    const expandedIds = new Set();
    container.querySelectorAll('.ticker-item-card.expanded').forEach((card: any) => {
        const id = card.dataset.tickerId || '';
        if (id) expandedIds.add(id);
    });
    const items = getTickerItems();
    const lockedBadges = getLockedBadges();
    // Locked badges (non-editable, from libraries)
    const badgesHtml = lockedBadges
        .map((badge: any) => {
            const style = badge.color ? `color: ${badge.color}` : '';
            return `
            <div class="ticker-item-card ticker-item-locked">
                <div class="ticker-item-card-header">
                    <span class="ticker-lock-icon">${getIcon('lock', { size: '14px' })}</span>
                    <span class="ticker-item-preview-text" style="${style}">
                        ${getIcon(badge.icon || 'lock', { size: '14px' })} ${escHtml(badge.label)}
                    </span>
                    <span class="ticker-locked-label">${t('lockedByLibrary')}</span>
                </div>
            </div>
        `;
        })
        .join('');
    if (items.length === 0 && lockedBadges.length === 0) {
        container.innerHTML = `
            <div class="ticker-empty-msg">
                <p>${t('noTickerItems')}</p>
            </div>
        `;
        return;
    }
    container.innerHTML = badgesHtml + items.map((item: any, idx: any) => renderItemCard(item, idx)).join('');
    // Restore expanded state
    expandedIds.forEach((id: any) => {
        const card = container.querySelector(`.ticker-item-card[data-ticker-id="${id}"]`);
        if (card) card.classList.add('expanded');
    });
}
/**
 * Render a single item card in the config modal.
 * Renderiza um card de item com todos os campos editaveis.
 *
 * @param {TickerItem} item
 * @param {number} idx
 * @returns {string}
 */
function renderItemCard( item: any, idx: any) {
    const campaigns = getAllCampaigns();
    const _params = CONFIG.PARAMETERS || [];
    const units = Array.isArray(CONFIG.UNITS) ? CONFIG.UNITS : [];
    const isChangePct = item.calculation === 'change_pct';
    // Calculation options
    const calcOptions = [
        { id: 'sum', label: t('sum') },
        { id: 'average', label: t('average') },
        { id: 'min', label: t('min') },
        { id: 'max', label: t('max') },
        { id: 'count', label: t('count') },
        { id: 'latest', label: t('latest') },
        { id: 'change_pct', label: t('changePct') },
        { id: 'trend', label: t('trend') },
    ];
    // Render filter rows
    const filtersHtml = item.filters.map((filter: any, fi: any) => renderFilterRow(item.id, filter, fi)).join('');
    return `
        <div class="ticker-item-card" data-ticker-id="${item.id}">
            <div class="ticker-item-card-header" data-cc-call-click="handleExpandTickerItem|s:${encodeURIComponent(`${item.id}`)}|e">
                <span class="ticker-item-expand-icon">${getIcon('chevron-right', { size: '12px' })}</span>
                <label class="ticker-item-toggle" data-cc-call-click="__noop" data-cc-stop="1">
                    <input data-field-meta="true" data-field-meta-key="auto-pos:ticker:input:L199" type="checkbox" ${item.enabled ? 'checked' : ''}
                        data-cc-call-change="handleToggleTickerItem|s:${encodeURIComponent(`${item.id}`)}" />
                </label>
                <span class="ticker-item-preview-text">${previewItemText(item)}</span>
                <div class="ticker-item-card-actions" data-cc-call-click="__noop" data-cc-stop="1">
                    <button type="button" class="btn-icon" title="${t('duplicateItem')}"
                        data-cc-call-click="handleDuplicateTickerItem|s:${encodeURIComponent(`${item.id}`)}">
                        ${getIcon('copy', { size: '12px' })}
                    </button>
                    ${
                        idx > 0
                            ? `<button type="button" class="btn-icon" title="Move up"
                        data-cc-call-click="handleReorderTickerItem|s:${encodeURIComponent(`${item.id}`)}|s:up">
                        ${getIcon('chevron-up', { size: '12px' })}
                    </button>`
                            : ''
                    }
                    ${
                        idx < getTickerItems().length - 1
                            ? `<button type="button" class="btn-icon" title="Move down"
                        data-cc-call-click="handleReorderTickerItem|s:${encodeURIComponent(`${item.id}`)}|s:down">
                        ${getIcon('chevron-down', { size: '12px' })}
                    </button>`
                            : ''
                    }
                    <button type="button" class="btn-icon btn-danger" title="${t('removeItem')}"
                        data-cc-call-click="handleRemoveTickerItem|s:${encodeURIComponent(`${item.id}`)}">
                        ${getIcon('trash-2', { size: '12px' })}
                    </button>
                </div>
            </div>
            <div class="ticker-item-card-body">
                <!-- Row 1: Label + Suffix -->
                <div class="ticker-form-row">
                    <div class="ticker-form-group">
                        <label class="form-label">${t('tickerLabel')}</label>
                        <input data-field-meta="true" data-field-meta-key="auto-pos:ticker:input:L235" type="text" class="form-input" value="${escAttr(item.label)}"
                            placeholder="Ex: GHG Emissions: "
                            data-cc-call-change="handleUpdateTickerItem|s:${encodeURIComponent(`${item.id}`)}|s:label|v" />
                    </div>
                    <div class="ticker-form-group">
                        <label class="form-label">${t('tickerSuffix')}</label>
                        <input data-field-meta="true" data-field-meta-key="auto-pos:ticker:input:L241" type="text" class="form-input" value="${escAttr(item.suffix)}"
                            placeholder="Ex:  mg/L"
                            data-cc-call-change="handleUpdateTickerItem|s:${encodeURIComponent(`${item.id}`)}|s:suffix|v" />
                    </div>
                </div>

                <!-- Row 2: Calculation + Unit + Precision + Color -->
                <div class="ticker-form-row">
                    <div class="ticker-form-group">
                        <label class="form-label">${t('tickerCalculation')}</label>
                        <select data-field-meta="true" data-field-meta-key="auto-pos:ticker:select:L251" class="form-input"
                            data-cc-call-change="handleUpdateTickerItem|s:${encodeURIComponent(`${item.id}`)}|s:calculation|v">
                            ${calcOptions
                                .map((c: any) =>
                                        `<option value="${c.id}" ${item.calculation === c.id ? 'selected' : ''}>${c.label}</option>`,
                                )
                                .join('')}
                        </select>
                    </div>
                    <div class="ticker-form-group">
                        <label class="form-label">${t('tickerUnit')}</label>
                        <select data-field-meta="true" data-field-meta-key="auto-pos:ticker:select:L263" class="form-input"
                            data-cc-call-change="handleUpdateTickerItem|s:${encodeURIComponent(`${item.id}`)}|s:unitId|vn">
                            <option value="">—</option>
                            ${units
                                .map((u: any) =>
                                        `<option value="${u.id}" ${item.unitId === u.id ? 'selected' : ''}>${u.symbol} (${u.name || u.id})</option>`,
                                )
                                .join('')}
                        </select>
                    </div>
                    <div class="ticker-form-group ticker-form-sm">
                        <label class="form-label">${t('tickerPrecision')}</label>
                        <input data-field-meta="true" data-field-meta-key="auto-pos:ticker:input:L276" type="number" class="form-input" min="0" max="6" value="${item.precision}"
                            data-cc-call-change="handleUpdateTickerItem|s:${encodeURIComponent(`${item.id}`)}|s:precision|pid:2" />
                    </div>
                    <div class="ticker-form-group ticker-form-sm">
                        <label class="form-label">${t('tickerColor')}</label>
                        <input type="color" class="form-input" value="${item.color || '#c5cdd5'}"
                            data-cc-call-change="handleUpdateTickerItem|s:${encodeURIComponent(`${item.id}`)}|s:color|v" />
                    </div>
                </div>

                <!-- Row 3: Campaign A/B (for change_pct) -->
                ${
                    isChangePct
                        ? `
                <div class="ticker-form-row">
                    <div class="ticker-form-group">
                        <label class="form-label">${t('campaignA')}</label>
                        <select data-field-meta="true" data-field-meta-key="auto-pos:ticker:select:L293" class="form-input"
                            data-cc-call-change="handleUpdateTickerItem|s:${encodeURIComponent(`${item.id}`)}|s:campaignA|vn">
                            <option value="">—</option>
                            ${campaigns
                                .map((c: any) =>
                                        `<option value="${c.id}" ${item.campaignA === c.id ? 'selected' : ''}>${c.name}</option>`,
                                )
                                .join('')}
                        </select>
                    </div>
                    <div class="ticker-form-group">
                        <label class="form-label">${t('campaignB')}</label>
                        <select data-field-meta="true" data-field-meta-key="auto-pos:ticker:select:L306" class="form-input"
                            data-cc-call-change="handleUpdateTickerItem|s:${encodeURIComponent(`${item.id}`)}|s:campaignB|vn">
                            <option value="">—</option>
                            ${campaigns
                                .map((c: any) =>
                                        `<option value="${c.id}" ${item.campaignB === c.id ? 'selected' : ''}>${c.name}</option>`,
                                )
                                .join('')}
                        </select>
                    </div>
                </div>
                `
                        : ''
                }

                <!-- Dynamic Filters -->
                <div class="ticker-filters-section">
                    <div class="ticker-filters-header">
                        <label class="form-label">${t('filters')}</label>
                        <button type="button" class="btn btn-xs btn-secondary"
                            data-cc-call-click="handleAddTickerFilter|s:${encodeURIComponent(`${item.id}`)}">
                            ${getIcon('plus', { size: '10px' })} ${t('addFilter')}
                        </button>
                    </div>
                    <div class="ticker-filters-list" id="ticker-filters-${item.id}">
                        ${filtersHtml}
                    </div>
                </div>
            </div>
        </div>
    `;
}
/**
 * Render a single dynamic filter row.
 * Renderiza uma linha de filtro com 3 dropdowns (dimensao, operador, valor).
 *
 * @param {string} itemId
 * @param {TickerFilter} filter
 * @param {number} filterIndex
 * @returns {string}
 */
function renderFilterRow( itemId: any, filter: any, filterIndex: any) {
    const dimensions = [
        { id: 'parameter', label: t('tickerParameter') },
        { id: 'family', label: t('tickerFamily') },
        { id: 'element', label: t('element') },
        { id: 'area', label: t('tickerArea') },
        { id: 'campaign', label: t('tickerCampaigns') },
        { id: 'category', label: t('category') },
    ];
    const operators = [
        { id: 'is', label: t('filterIs') },
        { id: 'is_not', label: t('filterIsNot') },
        { id: 'in', label: t('filterIn') },
        { id: 'not_in', label: t('filterNotIn') },
    ];
    // Opcoes de valor baseadas na dimensao selecionada
    const valueOptions = getDimensionOptions(filter.dimension);
    const currentValue = Array.isArray(filter.value) ? filter.value : [filter.value].filter(Boolean);
    const isMulti = filter.operator === 'in' || filter.operator === 'not_in';
    return `
        <div class="ticker-filter-row">
            <select class="form-input ticker-filter-dim"
                data-cc-call-change="handleUpdateTickerFilter|s:${encodeURIComponent(`${itemId}`)}|j:${encodeURIComponent(String(filterIndex))}|s:dimension|v">
                ${dimensions
                    .map((d: any) =>
                            `<option value="${d.id}" ${filter.dimension === d.id ? 'selected' : ''}>${d.label}</option>`,
                    )
                    .join('')}
            </select>
            <select class="form-input ticker-filter-op"
                data-cc-call-change="handleUpdateTickerFilter|s:${encodeURIComponent(`${itemId}`)}|j:${encodeURIComponent(String(filterIndex))}|s:operator|v">
                ${operators
                    .map((o: any) =>
                            `<option value="${o.id}" ${filter.operator === o.id ? 'selected' : ''}>${o.label}</option>`,
                    )
                    .join('')}
            </select>
            <select class="form-input ticker-filter-val" ${isMulti ? 'multiple' : ''}
                data-cc-call-change="handleTickerFilterValueChange|s:${encodeURIComponent(`${itemId}`)}|j:${encodeURIComponent(String(filterIndex))}|t">
                ${!isMulti ? '<option value="">—</option>' : ''}
                ${valueOptions
                    .map((v: any) =>
                            `<option value="${v.id}" ${currentValue.includes(v.id) ? 'selected' : ''}>${v.label}</option>`,
                    )
                    .join('')}
            </select>
            <button type="button" class="btn-icon btn-danger"
                data-cc-call-click="handleRemoveTickerFilter|s:${encodeURIComponent(`${itemId}`)}|j:${encodeURIComponent(String(filterIndex))}">
                ${getIcon('x', { size: '12px' })}
            </button>
        </div>
    `;
}
/**
 * Generate a short preview text for the item header.
 * Texto curto do resultado do calculo para mostrar no header do card.
 *
 * @param {TickerItem} item
 * @returns {string}
 */
function previewItemText( item: any) {
    try {
        const result = computeItem(item);
        return escHtml(result.text || '\u2014');
    } catch {
        return '\u2014';
    }
}
// ================================================================
// EXPAND / COLLAPSE
// ================================================================
/** Toggle expand/collapse of a ticker item card
 * @param {string} id
 * @param {Event} [_event]
 */
export function handleExpandTickerItem( id: any, _event: any) {
    const card = document.querySelector(`.ticker-item-card[data-ticker-id="${id}"]`);
    if (!card) return;
    card.classList.toggle('expanded');
}
// ================================================================
// ITEM CRUD HANDLERS
// ================================================================
/** Add new ticker item with defaults */
export function handleAddTickerItem() {
    const newItem = addTickerItem();
    renderItemsList();
    refreshPreview();
    showToast(t('tickerItemAdded'), 'success');
    // Auto-expand the new item
    if (newItem) {
        const card = document.querySelector(`.ticker-item-card[data-ticker-id="${newItem.id}"]`);
        if (card) card.classList.add('expanded');
    }
}
/** Remove ticker item
 * @param {string} id
 */
export function handleRemoveTickerItem( id: any) {
    removeTickerItem(id);
    renderItemsList();
    refreshPreview();
    triggerTickerUIRefresh('ticker.item-added');
}
/** Update a single field on a ticker item
 * @param {string} id
 * @param {string} field
 * @param {any} value
 */
export function handleUpdateTickerItem( id: any, field: any, value: any) {
    updateTickerItem(id, { [field]: value });
    // Re-render se o calculo mudou (para mostrar/esconder campos de campanha)
    if (field === 'calculation') {
        renderItemsList();
    }
    refreshPreview();
    triggerTickerUIRefresh('ticker.item-removed');
}
/** Toggle item enabled/disabled
 * @param {string} id
 */
export function handleToggleTickerItem( id: any) {
    const item: any = getTickerItemById(id);
    if (!item) return;
    updateTickerItem(id, { enabled: !item.enabled });
    renderItemsList();
    refreshPreview();
    triggerTickerUIRefresh('ticker.item-updated');
}
/** Duplicate a ticker item
 * @param {string} id
 */
export function handleDuplicateTickerItem( id: any) {
    duplicateTickerItem(id);
    renderItemsList();
    refreshPreview();
}
/** Reorder ticker item up or down
 * @param {string} id
 * @param {'up'|'down'} direction
 */
export function handleReorderTickerItem( id: any, direction: any) {
    reorderTickerItem(id, direction);
    renderItemsList();
    refreshPreview();
}
// ================================================================
// FILTER HANDLERS
// ================================================================
/** Add a new filter row to an item
 * @param {string} itemId
 */
export function handleAddTickerFilter( itemId: any) {
    addTickerFilter(itemId);
    renderItemsList();
    refreshPreview();
}
/** Remove a filter row from an item
 * @param {string} itemId
 * @param {number} filterIndex
 */
export function handleRemoveTickerFilter( itemId: any, filterIndex: any) {
    removeTickerFilter(itemId, filterIndex);
    renderItemsList();
    refreshPreview();
    triggerTickerUIRefresh('ticker.speed-changed');
}
/** Update filter dimension or operator
 * @param {string} itemId
 * @param {number} filterIndex
 * @param {string} field
 * @param {any} value
 */
export function handleUpdateTickerFilter( itemId: any, filterIndex: any, field: any, value: any) {
    updateTickerFilter(itemId, filterIndex, field, value);
    renderItemsList();
    refreshPreview();
    triggerTickerUIRefresh('ticker.separator-changed');
}
/** Handle filter value change (supports single + multi-select)
 * @param {string} itemId
 * @param {number} filterIndex
 * @param {HTMLSelectElement} selectEl
 */
export function handleTickerFilterValueChange( itemId: any, filterIndex: any, selectEl: any) {
    const item: any = getTickerItemById(itemId);
    if (!item || !item.filters[filterIndex]) return;
    const filter = item.filters[filterIndex];
    const isMulti = filter.operator === 'in' || filter.operator === 'not_in';
    let value;
    if (isMulti) {
        value = Array.from(selectEl.selectedOptions).map((o: any) => o.value);
    } else {
        value = selectEl.value;
    }
    updateTickerFilter(itemId, filterIndex, 'value', value);
    refreshPreview();
    triggerTickerUIRefresh('ticker.item-duplicated');
}
// ================================================================
// GLOBAL SETTINGS HANDLERS
// ================================================================
/** Change scroll speed preset
 * @param {string} speed
 */
export function handleTickerSpeedChange( speed: any) {
    setTickerSpeed(speed);
    updateTickerAnimation();
}
/** Change separator string
 * @param {string} separator
 */
export function handleTickerSeparatorChange( separator: any) {
    setTickerSeparator(separator);
    refreshPreview();
    triggerTickerUIRefresh('ticker.item-reordered');
}
// ================================================================
// PREVIEW
// ================================================================
/** Refresh the preview bar in the config modal */
function refreshPreview() {
    const items = computeAll();
    renderTickerPreview('ticker-preview', items);
}
// ================================================================
// HELPERS
// ================================================================
/**
 * @param {unknown} str
 * @returns {string}
 */
function escAttr( str: any) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/**
 * @param {unknown} str
 * @returns {string}
 */
function escHtml( str: any) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// ================================================================
// EXPORTED HANDLERS OBJECT
// Registrado no window via handlers/index.js
// ================================================================
export const tickerHandlers = {
    handleToggleTicker,
    handleOpenTickerConfig,
    handleExpandTickerItem,
    handleAddTickerItem,
    handleRemoveTickerItem,
    handleUpdateTickerItem,
    handleToggleTickerItem,
    handleDuplicateTickerItem,
    handleReorderTickerItem,
    handleAddTickerFilter,
    handleRemoveTickerFilter,
    handleUpdateTickerFilter,
    handleTickerFilterValueChange,
    handleTickerSpeedChange,
    handleTickerSeparatorChange,
};
