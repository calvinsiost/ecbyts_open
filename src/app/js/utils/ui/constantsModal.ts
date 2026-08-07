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
   CONSTANTS MODAL — Tabela de constantes definidas pelo usuario
   Permite criar, editar, remover e filtrar constantes reutilizaveis
   nos calculos (fatores de emissao, incertezas, conversoes, etc.)
   ================================================================ */

import { t } from '../i18n/translations.js';
import { CONFIG } from '../../config.js';
import { hydrateIcons } from './icons.js';
import { formatUncertainty } from '../helpers/html.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import { getUserConstants, forceRemoveUserConstant } from '../../core/constants/manager.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';

// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------

let _searchQuery = '';
let _filterCategory = '';
let _sortColumn = 'name';
let _sortDirection = 'asc';
/** @type {any} */ let _editingId: any = null; // ID da linha em edição inline
/** @type {any} */ let _requestUIRefresh: any = null;

/**
 * @param {any} fn
 */
export function setConstantsModalUpdateAllUI(fn: any) {
    _requestUIRefresh = fn;
}

function requestConstantsModalUIRefresh(reason = 'constants-modal.changed') {
    if (typeof _requestUIRefresh !== 'function')
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.CONSTANTS,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains) {
        _requestUIRefresh(domain, reason);
    }
}

// ----------------------------------------------------------------
// OPEN / CLOSE
// ----------------------------------------------------------------

/**
 * Open the constants management modal.
 * Abre o modal de gerenciamento de constantes do usuario.
 */
export function openConstantsModal() {
    const overlay = (document.getElementById('constants-modal-overlay') as any);
    const modal = (document.getElementById('constants-modal') as any);
    if (!overlay || !modal) return;
    _searchQuery = '';
    _filterCategory = '';
    _sortColumn = 'name';
    _sortDirection = 'asc';
    _editingId = null;
    renderConstantsModal();
    overlay.classList.add('active');
    // Sprint 3 Tier-B wire (Calvin 2026-06-03)
    syncDeepLinkUrl('constants');
    // Focus trap: foca no primeiro elemento focavel
    requestAnimationFrame(() => {
        const first = (modal.querySelector('input, button, select') as any);
        if (first) first.focus();
    });
}

/**
 * Close the constants management modal.
 * Fecha o modal de gerenciamento de constantes.
 */
export function closeConstantsModal() {
    const overlay = (document.getElementById('constants-modal-overlay') as any);
    if (!overlay) return;
    overlay.classList.remove('active');
    clearDeepLinkUrl();
    _editingId = null;
}

// ----------------------------------------------------------------
// RENDER
// ----------------------------------------------------------------

/**
 * Render the constants modal content.
 * Renderiza o conteudo completo do modal de constantes.
 */
export function renderConstantsModal() {
    const content = (document.getElementById('constants-modal-content') as any);
    if (!content) return;

    const constants = _getFilteredSorted();
    const categories = (CONFIG as any).CONSTANT_CATEGORIES || [];

    content.innerHTML = `
        <div class="constants-modal-header">
            <h2 id="constants-modal-title" class="constants-modal-title">
                ${t('constantsTitle')}
            </h2>
            <button class="modal-close-btn" data-cc-action="cc-f720aeec"
                    aria-label="Fechar" title="Fechar (Esc)">&times;</button>
        </div>

        <div class="constants-toolbar">
            <input type="text" class="constants-search-input"
                   id="constants-search"
                   placeholder="${t('searchConstants')}"
                   value="${_escHtml(_searchQuery)}"
                   data-cc-input="cc-c981e43a"
                   aria-label="${t('searchConstants')}">

            <select class="constants-category-filter" id="constants-cat-filter"
                    data-cc-change="cc-a8301e74"
                    aria-label="${t('filterByCategory')}">
                <option value="">${t('filterByCategory')}</option>
                ${categories
                    .map(
                        (cat: any) => `
                    <option value="${cat.id}" ${_filterCategory === cat.id ? 'selected' : ''}>
                        ${t(cat.labelKey) || cat.id}
                    </option>
                `,
                    )
                    .join('')}
            </select>

            <button class="toolbar-btn constants-add-btn"
                    data-cc-action="cc-fb9151a4"
                    title="${t('addConstant')}">
                <span class="icon" data-icon="plus"></span>
                ${t('addConstant')}
            </button>

            <button class="toolbar-btn constants-demo-btn"
                    data-cc-action="cc-0c6b4d9f"
                    title="${t('generateDemoConstants')}">
                <span class="icon" data-icon="shuffle"></span>
                ${t('generateDemoConstants')}
            </button>

            <button class="toolbar-btn constants-clear-demo-btn"
                    data-cc-action="cc-29643e1f"
                    title="${t('clearDemoConstants')}">
                ${t('clearDemoConstants')}
            </button>

            <button class="toolbar-btn constants-export-ecbt-btn"
                    data-cc-action="cc-628a5fd9"
                    title="${t('constantsSet.exportTitle') || 'Salvar todas as constantes como .ecbt (Library ecbyts ou arquivo local)'}">
                <span class="icon" data-icon="download"></span>
                ${t('constantsSet.exportLabel') || 'Salvar .ecbt'}
            </button>

            <button class="toolbar-btn constants-import-ecbt-btn"
                    data-cc-action="cc-5b95b2c6"
                    title="${t('constantsSet.importTitle') || 'Importar conjunto de constantes de .ecbt (Library ecbyts ou arquivo local)'}">
                <span class="icon" data-icon="upload"></span>
                ${t('constantsSet.importLabel') || 'Importar .ecbt'}
            </button>
        </div>

        <div class="constants-table-wrapper">
            ${_renderTable(constants, categories)}
        </div>

        <div class="constants-footer">
            <span class="constants-count">${constants.length} ${t('userConstants').toLowerCase()}</span>
        </div>
    `;

    // Aplica ícones dinamicamente
    hydrateIcons(content);

    // Registra Escape para fechar
    content.onkeydown = (e: any) => {
        if (e.key === 'Escape') closeConstantsModal();
    };
}

/**
 * Render the constants table.
 * @param {any[]} constants
 * @param {any[]} categories
 * @returns {string} HTML
 */
function _renderTable(constants: any, categories: any): string {
    const cols = ['name', 'symbol', 'value', 'unit', 'category', 'source', 'actions'];

    const headerCells = cols.map((col: any) => {
        if (col === 'actions') return `<th class="constants-col-actions">${t('actions') || 'Ações'}</th>`;
        const _dir = _sortColumn === col && _sortDirection === 'asc' ? 'desc' : 'asc';
        const arrow = _sortColumn === col ? (_sortDirection === 'asc' ? ' &#9650;' : ' &#9660;') : '';
        return `<th class="constants-col-${col} sortable"
                    data-cc-call-click="handleConstantsSortBy|s:${encodeURIComponent(`${col}`)}"
                    aria-sort="${_sortColumn === col ? _sortDirection : 'none'}"
                    tabindex="0"
                    data-cc-call-keydown="handleConstantsSortBy|s:${encodeURIComponent(`${col}`)}" data-cc-key="Enter">
                    ${t('constant' + col.charAt(0).toUpperCase() + col.slice(1)) || col}${arrow}
                </th>`;
    });

    if (constants.length === 0) {
        return `
            <table class="constants-table" role="grid" aria-rowcount="0">
                <thead><tr>${headerCells.join('')}</tr></thead>
                <tbody>
                    <tr><td colspan="${cols.length}" class="constants-empty">
                        ${t('noConstants')}
                    </td></tr>
                </tbody>
            </table>`;
    }

    const rows = constants.map((c: any, idx: any) => _renderRow(c, idx + 2, categories));

    return `
        <table class="constants-table" role="grid" aria-rowcount="${constants.length + 1}">
            <thead><tr>${headerCells.join('')}</tr></thead>
            <tbody>${rows.join('')}</tbody>
        </table>`;
}

/**
 * Render a single constant row (or editing row).
 * @param {any} c - Constant object
 * @param {number} rowIndex - ARIA row index
 * @param {any[]} categories
 * @returns {string} HTML
 */
function _renderRow(c: any, rowIndex: any, categories: any): string {
    const isEditing = _editingId === c.id;
    const demoTag = c.isDemo ? `<span class="constants-demo-badge">${t('demoConstant')}</span>` : '';

    const unitLabel = _getUnitLabel(c.unitId);
    const categoryLabel = _getCategoryLabel(c.category, categories);
    const hasPostProcessing = _hasPostProcessing(c.id);

    if (isEditing) {
        return _renderEditRow(c, rowIndex, categories);
    }

    return `
        <tr role="row" aria-rowindex="${rowIndex}"
            class="constants-row${c.isDemo ? ' constants-row-demo' : ''}">
            <td class="constants-col-name">
                ${_escHtml(c.name)}${demoTag}
                ${c.description ? `<div class="constants-desc">${_escHtml(c.description)}</div>` : ''}
            </td>
            <td class="constants-col-symbol">
                <code>${_escHtml(c.symbol)}</code>
                ${hasPostProcessing ? `<span class="constants-used-badge" title="${t('usedInMetrics')}">&#10010;</span>` : ''}
            </td>
            <td class="constants-col-value">
                ${c.value}${c.uncertainty != null ? `<div class="constants-unc-display">${formatUncertainty(c.uncertainty, c.uncertaintyType, c.coverageFactor)}</div>` : ''}
            </td>
            <td class="constants-col-unit">${_escHtml(unitLabel)}</td>
            <td class="constants-col-category">${_escHtml(categoryLabel)}</td>
            <td class="constants-col-source">
                ${_escHtml(c.source || '—')}
                ${c.validFrom || c.validTo ? `<div class="constants-validity">${_formatValidity(c.validFrom, c.validTo)}</div>` : ''}
            </td>
            <td class="constants-col-actions">
                <button class="constants-btn-edit"
                        data-cc-call-click="handleEditConstantRow|s:${encodeURIComponent(`${c.id}`)}"
                        title="${t('editConstant')}">
                    <span class="icon" data-icon="edit"></span>
                </button>
                <button class="constants-btn-remove"
                        data-cc-call-click="handleRemoveUserConstant|s:${encodeURIComponent(`${c.id}`)}"
                        title="${t('removeConstant')}">
                    <span class="icon" data-icon="trash"></span>
                </button>
            </td>
        </tr>`;
}

/**
 * Render an inline editing row for a constant.
 * @param {any} c
 * @param {number} rowIndex
 * @param {any[]} categories
 * @returns {string} HTML
 */
function _renderEditRow(c: any, rowIndex: any, categories: any): string {
    const unitOptions = (CONFIG.UNITS || [])
        .map(
            (u: any) => `<option value="${u.id}" ${c.unitId === u.id ? 'selected' : ''}>${u.symbol} — ${u.name}</option>`,
        )
        .join('');

    const catOptions = categories
        .map(
            (cat: any) => `<option value="${cat.id}" ${c.category === cat.id ? 'selected' : ''}>${t(cat.labelKey) || cat.id}</option>`,
        )
        .join('');

    return `
        <tr role="row" aria-rowindex="${rowIndex}" class="constants-row constants-row-editing"
            id="constants-edit-row-${c.id}">
            <td class="constants-col-name">
                <input data-field-meta="true" data-field-meta-key="auto-tpl:constantsModal:input:L292" type="text" class="constants-input"
                       id="edit-name-${c.id}"
                       value="${_escHtml(c.name)}" maxlength="120"
                       placeholder="${t('constantName')}"
                       aria-label="${t('constantName')}">
                <input data-field-meta="true" data-field-meta-key="auto-tpl:constantsModal:input:L297" type="text" class="constants-input constants-input-desc"
                       id="edit-desc-${c.id}"
                       value="${_escHtml(c.description || '')}" maxlength="500"
                       placeholder="${t('constantDescription')}"
                       aria-label="${t('constantDescription')}">
            </td>
            <td class="constants-col-symbol">
                <input data-field-meta="true" data-field-meta-key="auto-tpl:constantsModal:input:L304" type="text" class="constants-input constants-input-mono"
                       id="edit-symbol-${c.id}"
                       value="${_escHtml(c.symbol)}" maxlength="32"
                       placeholder="EF_CO2"
                       aria-label="${t('constantSymbol')}">
            </td>
            <td class="constants-col-value">
                <input data-field-meta="true" data-field-meta-key="auto-tpl:constantsModal:input:L311" type="number" class="constants-input constants-input-value"
                       id="edit-value-${c.id}"
                       value="${c.value}" step="any"
                       aria-label="${t('constantValue')}">
                ${
                    c.uncertainty != null
                        ? `
                <div class="constants-uncertainty-group">
                    <div class="constants-unc-row">
                        <input data-field-meta="true" data-field-meta-key="auto-tpl:constantsModal:input:L320" type="number" class="constants-input" id="edit-uncertainty-${c.id}"
                               value="${c.uncertainty ?? ''}" step="any" min="0" placeholder="&#177;"
                               title="${t('uncertaintyTooltip')}" aria-label="${t('constantUncertainty')}">
                        <select data-field-meta="true" data-field-meta-key="auto-tpl:constantsModal:select:L323" class="constants-input constants-input-unc-type" id="edit-unctype-${c.id}"
                                aria-label="${t('constantUncertaintyType')}">
                            <option value="" disabled ${!c.uncertaintyType ? 'selected' : ''}>${t('selectUncertaintyType')}</option>
                            <option value="absolute" ${c.uncertaintyType === 'absolute' ? 'selected' : ''}>${t('uncertaintyAbsoluteLabel')}</option>
                            <option value="relative" ${c.uncertaintyType === 'relative' ? 'selected' : ''}>${t('uncertaintyRelativeLabel')}</option>
                        </select>
                        <a href="#" class="constants-k-toggle" data-cc-action="cc-c9289714"
                           title="${t('coverageFactorTooltip')}">k=${c.coverageFactor || 2}</a>
                        <input data-field-meta="true" data-field-meta-key="auto-tpl:constantsModal:input:L331" type="number" class="constants-input constants-input-k" id="edit-coveragefactor-${c.id}"
                               value="${c.coverageFactor ?? ''}" step="any" min="0.1" placeholder="k"
                               title="${t('coverageFactorTooltip')}" aria-label="${t('coverageFactor')}"
                               style="display:${c.coverageFactor != null && c.coverageFactor !== 2 ? 'inline' : 'none'}">
                    </div>
                </div>
                `
                        : `
                <button type="button" class="btn btn-link btn-sm uncertainty-toggle-btn"
                        data-cc-action="cc-de98e371"
                        style="margin-top:4px">+ &#177; ${t('constantUncertainty') || 'Uncertainty'}</button>
                <div class="constants-uncertainty-group" style="display:none">
                    <div class="constants-unc-row">
                        <input data-field-meta="true" data-field-meta-key="auto-tpl:constantsModal:input:L344" type="number" class="constants-input" id="edit-uncertainty-${c.id}"
                               value="" step="any" min="0" placeholder="&#177;"
                               title="${t('uncertaintyTooltip')}" aria-label="${t('constantUncertainty')}">
                        <select data-field-meta="true" data-field-meta-key="auto-tpl:constantsModal:select:L347" class="constants-input constants-input-unc-type" id="edit-unctype-${c.id}"
                                aria-label="${t('constantUncertaintyType')}">
                            <option value="" disabled selected>${t('selectUncertaintyType')}</option>
                            <option value="absolute">${t('uncertaintyAbsoluteLabel')}</option>
                            <option value="relative">${t('uncertaintyRelativeLabel')}</option>
                        </select>
                        <a href="#" class="constants-k-toggle" data-cc-action="cc-c9289714"
                           title="${t('coverageFactorTooltip')}">k=2</a>
                        <input data-field-meta="true" data-field-meta-key="auto-tpl:constantsModal:input:L355" type="number" class="constants-input constants-input-k" id="edit-coveragefactor-${c.id}"
                               value="" step="any" min="0.1" placeholder="k"
                               title="${t('coverageFactorTooltip')}" aria-label="${t('coverageFactor')}"
                               style="display:none">
                    </div>
                </div>
                `
                }
            </td>
            <td class="constants-col-unit">
                <select data-field-meta="true" data-field-meta-key="auto-tpl:constantsModal:select:L365" class="constants-input" id="edit-unit-${c.id}"
                        aria-label="${t('constantUnit')}">
                    <option value="">—</option>
                    ${unitOptions}
                </select>
            </td>
            <td class="constants-col-category">
                <select data-field-meta="true" data-field-meta-key="auto-tpl:constantsModal:select:L372" class="constants-input" id="edit-cat-${c.id}"
                        aria-label="${t('constantCategory')}">
                    ${catOptions}
                </select>
            </td>
            <td class="constants-col-source">
                <input data-field-meta="true" data-field-meta-key="auto-tpl:constantsModal:input:L378" type="text" class="constants-input"
                       id="edit-source-${c.id}"
                       value="${_escHtml(c.source || '')}" maxlength="200"
                       placeholder="${t('constantSource')}"
                       aria-label="${t('constantSource')}">
                <div class="constants-validity-inputs">
                    <input data-field-meta="true" data-field-meta-key="auto-tpl:constantsModal:input:L384" type="date" class="constants-input constants-input-date"
                           id="edit-validfrom-${c.id}"
                           value="${c.validFrom || ''}"
                           title="${t('constantValidFrom') || 'Válido a partir de'}"
                           aria-label="${t('constantValidFrom') || 'Válido a partir de'}">
                    <span class="constants-date-sep">&#8594;</span>
                    <input data-field-meta="true" data-field-meta-key="auto-tpl:constantsModal:input:L390" type="date" class="constants-input constants-input-date"
                           id="edit-validto-${c.id}"
                           value="${c.validTo || ''}"
                           title="${t('constantValidTo') || 'Válido até'}"
                           aria-label="${t('constantValidTo') || 'Válido até'}">
                </div>
            </td>
            <td class="constants-col-actions">
                <div id="edit-errors-${c.id}" class="constants-errors" role="alert"></div>
                <button class="constants-btn-save"
                        data-cc-call-click="handleSaveConstantRow|s:${encodeURIComponent(`${c.id}`)}"
                        title="${t('save') || 'Salvar'}">
                    <span class="icon" data-icon="check"></span>
                </button>
                <button class="constants-btn-cancel"
                        data-cc-action="cc-e83d282c"
                        title="${t('cancel') || 'Cancelar'}">
                    <span class="icon" data-icon="x"></span>
                </button>
            </td>
        </tr>`;
}

// ----------------------------------------------------------------
// RENDER NEW ROW (for add)
// ----------------------------------------------------------------

/**
 * Render an empty row for adding a new constant.
 * Renderiza uma linha vazia no topo da tabela para adicionar nova constante.
 */
export function renderNewConstantRow() {
    const categories = (CONFIG as any).CONSTANT_CATEGORIES || [];
    const unitOptions = (CONFIG.UNITS || [])
        .map((u: any) => `<option value="${u.id}">${u.symbol} — ${u.name}</option>`)
        .join('');

    const catOptions = categories
        .map((cat: any) => `<option value="${cat.id}">${t(cat.labelKey) || cat.id}</option>`)
        .join('');

    const tbody = (document.querySelector('#constants-modal .constants-table tbody') as any);
    if (!tbody) return;

    // Remove linha de "novo" existente, se houver
    const existing = (document.getElementById('constants-new-row') as any);
    if (existing) existing.remove();

    const tr = document.createElement('tr');
    tr.id = 'constants-new-row';
    tr.className = 'constants-row constants-row-editing';
    tr.setAttribute('role', 'row');
    tr.innerHTML = `
        <td class="constants-col-name">
            <input data-field-meta="true" data-field-meta-key="constant:draft:name" type="text" class="constants-input"
                   id="new-name" maxlength="120"
                   placeholder="${t('constantName')}"
                   aria-label="${t('constantName')}">
            <input data-field-meta="true" data-field-meta-key="constant:draft:desc" type="text" class="constants-input constants-input-desc"
                   id="new-desc" maxlength="500"
                   placeholder="${t('constantDescription')}"
                   aria-label="${t('constantDescription')}">
        </td>
        <td class="constants-col-symbol">
            <input data-field-meta="true" data-field-meta-key="constant:draft:symbol" type="text" class="constants-input constants-input-mono"
                   id="new-symbol" maxlength="32"
                   placeholder="EF_CO2"
                   aria-label="${t('constantSymbol')}">
        </td>
        <td class="constants-col-value">
            <input data-field-meta="true" data-field-meta-key="constant:draft:value" type="number" class="constants-input constants-input-value"
                   id="new-value" step="any"
                   placeholder="0"
                   aria-label="${t('constantValue')}">
            <button type="button" class="btn btn-link btn-sm uncertainty-toggle-btn"
                    data-cc-action="cc-de98e371"
                    style="margin-top:4px">+ &#177; ${t('constantUncertainty') || 'Uncertainty'}</button>
            <div class="constants-uncertainty-group" style="display:none">
                <div class="constants-unc-row">
                    <input data-field-meta="true" data-field-meta-key="constant:draft:uncertainty" type="number" class="constants-input" id="new-uncertainty"
                           step="any" min="0" placeholder="&#177;"
                           title="${t('uncertaintyTooltip')}" aria-label="${t('constantUncertainty')}">
                    <select data-field-meta="true" data-field-meta-key="constant:draft:unctype" class="constants-input constants-input-unc-type" id="new-unctype"
                            aria-label="${t('constantUncertaintyType')}">
                        <option value="" disabled selected>${t('selectUncertaintyType')}</option>
                        <option value="absolute">${t('uncertaintyAbsoluteLabel')}</option>
                        <option value="relative">${t('uncertaintyRelativeLabel')}</option>
                    </select>
                    <a href="#" class="constants-k-toggle" data-cc-action="cc-c9289714"
                       title="${t('coverageFactorTooltip')}">k=2</a>
                    <input data-field-meta="true" data-field-meta-key="constant:draft:coveragefactor" type="number" class="constants-input constants-input-k" id="new-coveragefactor"
                           step="any" min="0.1" placeholder="k"
                           title="${t('coverageFactorTooltip')}" aria-label="${t('coverageFactor')}"
                           style="display:none">
                </div>
            </div>
        </td>
        <td class="constants-col-unit">
            <select data-field-meta="true" data-field-meta-key="constant:draft:unit" class="constants-input" id="new-unit"
                    aria-label="${t('constantUnit')}">
                <option value="">—</option>
                ${unitOptions}
            </select>
        </td>
        <td class="constants-col-category">
            <select data-field-meta="true" data-field-meta-key="constant:draft:cat" class="constants-input" id="new-cat"
                    aria-label="${t('constantCategory')}">
                ${catOptions}
            </select>
        </td>
        <td class="constants-col-source">
            <input data-field-meta="true" data-field-meta-key="constant:draft:source" type="text" class="constants-input"
                   id="new-source" maxlength="200"
                   placeholder="${t('constantSource')}"
                   aria-label="${t('constantSource')}">
            <div class="constants-validity-inputs">
                <input data-field-meta="true" data-field-meta-key="constant:draft:validfrom" type="date" class="constants-input constants-input-date"
                       id="new-validfrom"
                       title="${t('constantValidFrom') || 'Válido a partir de'}"
                       aria-label="${t('constantValidFrom') || 'Válido a partir de'}">
                <span class="constants-date-sep">&#8594;</span>
                <input data-field-meta="true" data-field-meta-key="constant:draft:validto" type="date" class="constants-input constants-input-date"
                       id="new-validto"
                       title="${t('constantValidTo') || 'Válido até'}"
                       aria-label="${t('constantValidTo') || 'Válido até'}">
            </div>
        </td>
        <td class="constants-col-actions">
            <div id="new-errors" class="constants-errors" role="alert"></div>
            <button class="constants-btn-save"
                    data-cc-action="cc-8232df9b"
                    title="${t('save') || 'Salvar'}">
                <span class="icon" data-icon="check"></span>
            </button>
            <button class="constants-btn-cancel"
                    data-cc-action="cc-20c1904c"
                    title="${t('cancel') || 'Cancelar'}">
                <span class="icon" data-icon="x"></span>
            </button>
        </td>
    `;

    tbody.prepend(tr);
    hydrateIcons(tr);
    document.getElementById('new-name')?.focus();
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

/**
 * Format validFrom / validTo for display.
 * Formata o intervalo de validade para exibicao na tabela.
 * @param {string|null} from
 * @param {string|null} to
 * @returns {string}
 */
function _formatValidity(from: any, to: any): string {
    const f = from || '…';
    const t_ = to || '…';
    return `${f} &#8594; ${t_}`;
}

/**
 * Apply search query and category filter, then sort.
 * Filtra e ordena as constantes conforme estado atual.
 * @returns {any[]}
 */
function _getFilteredSorted(): any[] {
    let list = getUserConstants();

    if (_searchQuery) {
        const q = _searchQuery.toLowerCase();
        list = list.filter(
            (c: any) => c.name.toLowerCase().includes(q) ||
            c.symbol.toLowerCase().includes(q) ||
            (c.description || '').toLowerCase().includes(q),
        );
    }

    if (_filterCategory) {
        list = list.filter((c: any) => c.category === _filterCategory);
    }

    list.sort((a: any, b: any) => {
        let va = a[_sortColumn] ?? '';
        let vb = b[_sortColumn] ?? '';
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return _sortDirection === 'asc' ? -1 : 1;
        if (va > vb) return _sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    return list;
}

/**
 * @param {any} unitId
 */
function _getUnitLabel(unitId: any) {
    if (!unitId) return '—';
    const u = (CONFIG.UNITS || []).find((u: any) => u.id === unitId);
    return u ? u.symbol : unitId;
}

/**
 * @param {any} catId
 * @param {any} categories
 */
function _getCategoryLabel(catId: any, categories: any) {
    const cat = categories.find((c: any) => c.id === catId);
    return cat ? t(cat.labelKey) || cat.id : catId || '—';
}

/**
 * @param {any} id
 */
function _hasPostProcessing(id: any) {
    try {
        const { getCalculatorItems } = (window as any).__ecbyts_calculator || {};
        if (typeof getCalculatorItems !== 'function') return false;
        return getCalculatorItems().some(
            (item: any) => Array.isArray(item.postProcessing) &&
            item.postProcessing.some((p: any) => p.constantId === id),
        );
    } catch {
        return false;
    }
}

/**
 * @param {any} str
 */
function _escHtml(str: any) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ----------------------------------------------------------------
// SETTER - used by handlers
// ----------------------------------------------------------------

/**
 * @param {any} q
 */
export function setConstantsSearch(q: any) {
    _searchQuery = q;
}
/**
 * @param {any} cat
 */
export function setConstantsFilterCategory(cat: any) {
    _filterCategory = cat;
}
/**
 * @param {any} col
 */
export function setConstantsSortBy(col: any) {
    if (_sortColumn === col) {
        _sortDirection = _sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        _sortColumn = col;
        _sortDirection = 'asc';
    }
}
/**
 * @param {any} id
 */
export function setConstantsEditingId(id: any) {
    _editingId = id;
}
export function getConstantsEditingId() {
    return _editingId;
}

/**
 * Show inline validation errors in the editing row.
 * Exibe erros de validacao na linha de edicao.
 *
 * @param {string} rowId - 'new' or constant id
 * @param {string[]} errors - i18n error keys
 */
export function showConstantErrors(rowId: any, errors: any) {
    const el = (document.getElementById(rowId === 'new' ? 'new-errors' : `edit-errors-${rowId}`) as any);
    if (!el) return;
    el.innerHTML = errors
        .map((e: any) => `<span class="constants-error">${t(e) || e}</span>`)
        .join('<br>');
}

/**
 * Show a delete confirmation dialog listing dependent metrics.
 * Exibe dialogo de confirmacao de remocao com lista de dependentes.
 *
 * @param {string} id - Constant ID
 * @param {Array<{ id?: string, name?: string }>} dependents - [{ id, name }]
 */
export function showRemoveConstantConfirm(id: any, dependents: any) {
    const c = (getUserConstants().find((c: any) => c.id === id) as any);
    const name = c ? c.name : id;
    const depList = dependents.map((d: any) => `<li>${_escHtml(d.name || d.id || '')}</li>`).join('');

    const msg = `${t('confirmRemoveConstant')}: <strong>${_escHtml(name)}</strong><br>
        ${t('constantUsedInMetrics')}:<ul>${depList}</ul>
        ${t('removeConstantAnyway')}?`;

    import('./asyncDialogs.js').then(({ asyncConfirm }) => {
        asyncConfirm(
            msg.replace(/<[^>]*>/g, ''),
            ({
                confirmLabel: 'Remover',
                cancelLabel: 'Cancelar',
                destructive: true,
            } as any),
        ).then((confirmed: any) => {
            if (confirmed) {
                forceRemoveUserConstant(id);
                renderConstantsModal();
                requestConstantsModalUIRefresh('constants-modal.force-remove');
            }
        }).catch((e: any) => console.debug('[constantsModal:asyncConfirm:silent-catch]', e?.message || e));
    }).catch((e: any) => console.debug('[constantsModal:lazy-dialogs:silent-catch]', e?.message || e));
}
