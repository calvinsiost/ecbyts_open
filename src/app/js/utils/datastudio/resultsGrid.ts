// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   DATA STUDIO RESULTS GRID — Query result table
   Tabela de resultados de queries SQL

   Renderiza colunas + linhas, sorting por click no header,
   export CSV/JSON.
   ================================================================ */

import { CONFIG } from '../../config.js';
import { buildChartDataFromResultSet, detectChartType, renderNativeChart } from './nativeChart.js';
import { buildCsv, formatSetLabel, rowsToObjects, sortRows } from './_resultsGridPure.js';

/**
 * @typedef {{columns: string[], values: any[][]}} ResultSet
 * @typedef {'preview'|'tabs'|'stack'|'master'|'sheets'|'chart'} MultiViewMode
 */

/** @type {any} */
let _container: any = null;
/** @type {string[]} */
let _columns: any = [];
/** @type {any[][]} */
let _values: any = [];
let _sortCol = -1;
let _sortAsc = true;

// Multi-result view modes.
// User-selectable via UI; persisted in localStorage.
export const MULTI_VIEW_MODES = Object.freeze({
    PREVIEW: 'preview', // legacy: previews + last set as primary
    TABS: 'tabs', // tabs at top — one set visible at a time
    STACK: 'stack', // all sets stacked as full grids
    MASTER: 'master', // sidebar list + selected set in detail
    SHEETS: 'sheets', // Excel-style tabs at the bottom
    CHART: 'chart', // auto-detect chart per set + grid below
});

const MULTI_VIEW_LABELS = Object.freeze({
    preview: 'Preview',
    tabs: 'Tabs',
    stack: 'Stack',
    master: 'Master-detail',
    sheets: 'Sheet tabs',
    chart: 'Chart',
});

const STORAGE_KEY = 'ecbyts-ds-multi-view';
/** @type {MultiViewMode} */
let _viewMode: string = MULTI_VIEW_MODES.TABS;
let _activeSetIndex = 0;
/** @type {ResultSet[]} */
let _lastSets: any = [];

/**
 * @param {unknown} error
 * @returns {string}
 */
function _errorMessage(error: any) {
    return error && typeof error === 'object' && 'message' in error
        ? String(/** @type {{ message?: unknown }} */ (error).message)
        : String(error);
}

try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved && ((Object.values(MULTI_VIEW_MODES)) as string[]).includes(saved)) {
        _viewMode = ((saved) as any);
    }
} catch (e) {
    console.debug('[resultsGrid] init-viewMode:', _errorMessage(e));
    /* localStorage unavailable */
}

export function getMultiViewMode() {
    return _viewMode;
}

export function getMultiViewModeOptions() {
    return Object.entries(MULTI_VIEW_LABELS).map(([id, label]) => ({ id, label }));
}

/** @param {string} mode */
export function setMultiViewMode(mode: any) {
    if (!(((Object.values(MULTI_VIEW_MODES)) as string[]).includes(mode))) return false;
    _viewMode = ((mode) as any);
    try {
        localStorage.setItem(STORAGE_KEY, mode);
    } catch (e) {
        console.debug('[resultsGrid] setViewMode:', _errorMessage(e));
        /* noop */
    }
    if (_lastSets.length > 0) {
        renderMultipleResults(_lastSets);
    }
    return true;
}

/**
 * Initialize the results grid in the given container.
 * @param {HTMLElement} container
 */
export function initResultsGrid(container: any) {
    // Auto-discovery if not provided
    _container = container || document.querySelector('.ds-results');
}

/**
 * Render query results into the grid.
 * @param {string[]} columns
 * @param {any[][]} values
 * @param {{ preserveLastSets?: boolean }} [options]
 */
export function renderResults(columns: any, values: any, options: { preserveLastSets?: boolean } = {}) {
    _columns = columns || [];
    _values = values || [];
    if (!options.preserveLastSets) {
        _lastSets = [{ columns: _columns, values: _values }];
        _activeSetIndex = 0;
    }
    _sortCol = -1;
    _sortAsc = true;

    if (!_container) _container = document.querySelector('.ds-results');
    if (!_container) return;

    if (!_columns.length) {
        _container.innerHTML = '<div class="ds-results-empty">No results</div>';
        return;
    }

    _renderTable();
}

/**
 * Render multiple result sets (one per SQL statement in a batch).
 * Shows the last set in the sortable grid (export CSV/JSON still works on it)
 * and lists the preceding sets as compact read-only previews above it.
 *
 * Data Studio batch executions (multiple statements separated by `;`) call
 * this when more than one set is produced. The caller (datastudio/index.js)
 * already falls back to `renderResults` when only 1 set exists.
 *
 * @param {Array<{columns: string[], values: any[][]}>} sets
 */
export function renderMultipleResults(sets: any) {
    if (!Array.isArray(sets) || sets.length === 0) {
        renderResults([], []);
        return;
    }

    if (!_container) _container = document.querySelector('.ds-results');
    if (!_container) return;

    _lastSets = sets;
    if (_activeSetIndex >= sets.length) _activeSetIndex = sets.length - 1;
    if (_activeSetIndex < 0) _activeSetIndex = 0;

    if (sets.length === 1) {
        renderResults(sets[0].columns, sets[0].values);
        return;
    }

    switch (_viewMode) {
        case MULTI_VIEW_MODES.TABS:
            _renderTabs(sets);
            break;
        case MULTI_VIEW_MODES.STACK:
            _renderStack(sets);
            break;
        case MULTI_VIEW_MODES.MASTER:
            _renderMaster(sets);
            break;
        case MULTI_VIEW_MODES.SHEETS:
            _renderSheets(sets);
            break;
        case MULTI_VIEW_MODES.CHART:
            _renderChart(sets);
            break;
        case MULTI_VIEW_MODES.PREVIEW:
        default:
            _renderPreviewMode(sets);
            break;
    }
}

export function getLatestResultSet() {
    if (_lastSets.length > 0) {
        return _lastSets[_lastSets.length - 1];
    }
    return { columns: _columns, values: _values };
}

// ----------------------------------------------------------------
// View mode renderers
// ----------------------------------------------------------------

/**
 * @param {ResultSet} set
 * @param {number} idx
 */
function _setLabel(set: any, idx: any) {
    return formatSetLabel(set, idx);
}

/**
 * @param {ResultSet[]} sets
 * @param {number} idx
 */
function _activatePane(sets: any, idx: any) {
    _activeSetIndex = idx;
    const pane = _container.querySelector('.ds-mv-active-pane');
    if (!pane) return;
    pane.innerHTML = '';
    const savedContainer = _container;
    _container = pane;
    renderResults(sets[idx].columns, sets[idx].values, { preserveLastSets: true });
    _container = savedContainer;
}

/** @param {ResultSet[]} sets */
function _renderPreviewMode(sets: any) {
    const primary = sets[sets.length - 1];
    const preceding = sets.slice(0, -1);
    const previewsHtml = preceding.map((set: any, i: any) => _renderPreview(set, i + 1)).join('');
    _container.innerHTML = `
        <div class="ds-results-previews">
            <div class="ds-results-previews-header">
                ${preceding.length} previous result set${preceding.length === 1 ? '' : 's'}
            </div>
            ${previewsHtml}
        </div>
        <div class="ds-results-primary-header">Last result set</div>
        <div class="ds-results-primary ds-mv-active-pane"></div>
    `;
    _activeSetIndex = sets.length - 1;
    const pane = _container.querySelector('.ds-mv-active-pane');
    const savedContainer = _container;
    _container = pane;
    renderResults(primary.columns, primary.values, { preserveLastSets: true });
    _container = savedContainer;
}

/** @param {ResultSet[]} sets */
function _renderTabs(sets: any) {
    const tabs = sets
        .map((set: any, i: any) => {
            const cls = i === _activeSetIndex ? 'ds-mv-tab active' : 'ds-mv-tab';
            return `<button class="${cls}" data-mv-tab="${i}">${_escapeHtml(_setLabel(set, i))}</button>`;
        })
        .join('');
    _container.innerHTML = `
        <div class="ds-mv-tabs ds-mv-tabs-top">${tabs}</div>
        <div class="ds-mv-active-pane"></div>
    `;
    _container.querySelectorAll('[data-mv-tab]').forEach(
        /** @param {any} sets */ (btn: any) => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.mvTab, 10);
                _container
                    .querySelectorAll('.ds-mv-tab')
                    .forEach(/** @param {any} b */ (b: any) => b.classList.remove('active'));
                btn.classList.add('active');
                _activatePane(sets, idx);
            });
        },
    );
    _activatePane(sets, _activeSetIndex);
}

/** @param {ResultSet[]} sets */
function _renderStack(sets: any) {
    const headers = sets
        .map(
            (set: any, i: any) =>
                `<div class="ds-mv-stack-pane">
                    <div class="ds-mv-stack-header">${_escapeHtml(_setLabel(set, i))}</div>
                    <div class="ds-mv-stack-body" data-mv-stack-pane="${i}"></div>
                </div>`,
        )
        .join('');
    _container.innerHTML = `<div class="ds-mv-stack">${headers}</div>`;
    sets.forEach((set: any, i: any) => {
        const pane = _container.querySelector(`[data-mv-stack-pane="${i}"]`);
        if (!pane) return;
        const savedContainer = _container;
        _container = pane;
        renderResults(set.columns, set.values, { preserveLastSets: true });
        _container = savedContainer;
    });
    // Active set for export = first
    _activeSetIndex = 0;
    _columns = sets[0].columns || [];
    _values = sets[0].values || [];
}

/** @param {ResultSet[]} sets */
function _renderMaster(sets: any) {
    const list = sets
        .map((set: any, i: any) => {
            const cls = i === _activeSetIndex ? 'ds-mv-master-item active' : 'ds-mv-master-item';
            return `<button class="${cls}" data-mv-master="${i}">
                <div class="ds-mv-master-label">${_escapeHtml(_setLabel(set, i))}</div>
                <div class="ds-mv-master-cols">${_escapeHtml((set.columns || []).slice(0, 3).join(', '))}${(set.columns || []).length > 3 ? '…' : ''}</div>
            </button>`;
        })
        .join('');
    _container.innerHTML = `
        <div class="ds-mv-master">
            <aside class="ds-mv-master-list">${list}</aside>
            <div class="ds-mv-master-detail ds-mv-active-pane"></div>
        </div>
    `;
    _container.querySelectorAll('[data-mv-master]').forEach(
        /** @param {any} sets */ (btn: any) => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.mvMaster, 10);
                _container
                    .querySelectorAll('.ds-mv-master-item')
                    .forEach(/** @param {any} b */ (b: any) => b.classList.remove('active'));
                btn.classList.add('active');
                _activatePane(sets, idx);
            });
        },
    );
    _activatePane(sets, _activeSetIndex);
}

/** @param {ResultSet[]} sets */
function _renderSheets(sets: any) {
    const tabs = sets
        .map((set: any, i: any) => {
            const cls = i === _activeSetIndex ? 'ds-mv-sheet active' : 'ds-mv-sheet';
            return `<button class="${cls}" data-mv-sheet="${i}">${_escapeHtml(_setLabel(set, i))}</button>`;
        })
        .join('');
    _container.innerHTML = `
        <div class="ds-mv-active-pane ds-mv-sheets-pane"></div>
        <div class="ds-mv-tabs ds-mv-sheets-bar">${tabs}</div>
    `;
    _container.querySelectorAll('[data-mv-sheet]').forEach(
        /** @param {any} sets */ (btn: any) => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.mvSheet, 10);
                _container
                    .querySelectorAll('.ds-mv-sheet')
                    .forEach(/** @param {any} b */ (b: any) => b.classList.remove('active'));
                btn.classList.add('active');
                _activatePane(sets, idx);
            });
        },
    );
    _activatePane(sets, _activeSetIndex);
}

/** @param {ResultSet[]} sets */
function _renderChart(sets: any) {
    const chartEnabled = CONFIG.FEATURES?.ENABLE_DATASTUDIO_ANALYTICS === true;
    const sections = sets
        .map((set: any, i: any) => {
            const type = chartEnabled ? detectChartType(set) : null;
            return `<div class="ds-mv-chart-pane">
                <div class="ds-mv-chart-header">${_escapeHtml(_setLabel(set, i))} ${type ? `· chart: ${type}` : '· grid only'}</div>
                ${type ? `<div class="ds-mv-chart-canvas"><canvas data-mv-chart="${i}" data-mv-chart-type="${type}"></canvas></div>` : ''}
                <div class="ds-mv-chart-grid" data-mv-chart-grid="${i}"></div>
            </div>`;
        })
        .join('');
    _container.innerHTML = `<div class="ds-mv-charts">${sections}</div>`;

    sets.forEach((set: any, i: any) => {
        const grid = _container.querySelector(`[data-mv-chart-grid="${i}"]`);
        if (grid) {
            const savedContainer = _container;
            _container = grid;
            renderResults(set.columns, set.values, { preserveLastSets: true });
            _container = savedContainer;
        }
        const canvas = _container.querySelector(`[data-mv-chart="${i}"]`);
        if (canvas && chartEnabled) {
            const type = ((canvas.dataset.mvChartType || 'line') as 'bar'|'scatter'|'line');
            try {
                renderNativeChart(canvas, buildChartDataFromResultSet(set, type), type);
            } catch (e) {
                console.debug('[ds:chart] render failed for set', i, _errorMessage(e));
            }
        }
    });
    _activeSetIndex = 0;
    _columns = sets[0].columns || [];
    _values = sets[0].values || [];
}

/**
 * Render a compact read-only preview of a result set.
 * Used by renderMultipleResults to show preceding sets in a batch.
 * @param {{columns: string[], values: any[][]}} set
 * @param {number} set 1-based index for display
 * @returns {string} HTML string
 */
function _renderPreview(set: any, idx: any) {
    const cols = set.columns || [];
    const vals = set.values || [];
    const rowCount = vals.length;
    const MAX_PREVIEW_ROWS = 5;
    const shown = vals.slice(0, MAX_PREVIEW_ROWS);
    /** @param {unknown} v */
    const escape = (v: any) => v == null ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const header = cols.map((c: any) => `<th>${escape(c)}</th>`).join('');
    const rows = shown.map((row: any) => `<tr>${row.map((v: any) => `<td>${escape(v)}</td>`).join('')}</tr>`).join('');
    const more =
        rowCount > MAX_PREVIEW_ROWS
            ? `<div class="ds-results-preview-more">… and ${rowCount - MAX_PREVIEW_ROWS} more rows</div>`
            : '';
    return `
        <details class="ds-results-preview" ${idx === 1 ? 'open' : ''}>
            <summary>Set ${idx} — ${rowCount} row${rowCount === 1 ? '' : 's'}</summary>
            <table class="ds-results-preview-table">
                <thead><tr>${header}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
            ${more}
        </details>
    `;
}

/**
 * Export current results as CSV download.
 */
export function exportResultsCSV() {
    if (!_columns.length) return;
    const csv = buildCsv(_columns, _values);
    _downloadFile(csv, `datastudio-${_timestamp()}.csv`, 'text/csv');
}

/**
 * Export current results as JSON download.
 */
export function exportResultsJSON() {
    if (!_columns.length) return;
    const data = rowsToObjects(_columns, _values);
    const json = JSON.stringify(data, null, 2);
    _downloadFile(json, `datastudio-${_timestamp()}.json`, 'application/json');
}

// --- Internal ---

function _renderTable() {
    const sorted = sortRows(_values, _sortCol, _sortAsc);

    const headerCells = _columns
        .map((col: any, i: any) => {
            const arrow = _sortCol === i ? (_sortAsc ? ' &#9650;' : ' &#9660;') : '';
            return `<th data-col="${i}">${_escapeHtml(col)}${arrow}</th>`;
        })
        .join('');

    const bodyRows = sorted
        .map((row: any, ri: any) => {
            const cls = ri % 2 === 0 ? 'ds-row-even' : 'ds-row-odd';
            const cells = row.map((v: any) => `<td>${_escapeHtml(v == null ? 'NULL' : String(v))}</td>`).join('');
            return `<tr class="${cls}">${cells}</tr>`;
        })
        .join('');

    _container.innerHTML = `
        <table class="ds-table">
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
        </table>
    `;

    // Sort on header click
    _container.querySelectorAll('th').forEach(
        /** @param {any} str */ (th: any) => {
            th.addEventListener('click', () => {
                const col = parseInt(th.dataset.col, 10);
                if (_sortCol === col) {
                    _sortAsc = !_sortAsc;
                } else {
                    _sortCol = col;
                    _sortAsc = true;
                }
                _renderTable();
            });
        },
    );
}

/** @param {string} str */
function _escapeHtml(str: any) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function _timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * @param {string} content
 * @param {string} filename
 * @param {string} type
 */
function _downloadFile(content: any, filename: any, type: any) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
