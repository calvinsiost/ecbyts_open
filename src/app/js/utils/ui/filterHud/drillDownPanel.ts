// @ts-check
// Generated from src/app/js/utils/ui/filterHud/drillDownPanel.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   FILTER RADAR DRILL-DOWN PANEL — FEAT-FILTER-RADAR-001 Phase 4

   Lazy-loaded panel that shows the parameter list for a selected
   radar group when the user clicks an axis label on the canvas.

   Receives group data from filterRadarHud.js and renders a
   sortable list of parameters with their values and element counts.
   ================================================================ */
import { t } from '../../i18n/translations.js';
const PANEL_ID = 'filter-radar-drilldown';
/** @type {any} */
let _panel: any = null;
/** @type {any} */
let _currentGroupId: any = null;
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Show the drill-down panel for a radar group.
 * @param {Object} elements - Group object from buildGroupIndex
 * @param {Object} group.id
 * @param {string} group.labelKey
 * @param {string} group.color
 * @param {Object} group.valuesByParam - {paramId: number[]}
 * @param {number} group.observationCount
 * @param {Array<Object>} elements - All elements for name resolution
 */
export function showDrillDown(group: any, elements: any) {
    _ensureDom();
    _currentGroupId = group.id;
    _populate(group, elements || []);
    _panel.style.display = 'block';
    _panel.setAttribute('aria-hidden', 'false');
}
/**
 * Hide the drill-down panel.
 */
export function hideDrillDown() {
    if (_panel) {
        _panel.style.display = 'none';
        _panel.setAttribute('aria-hidden', 'true');
    }
    _currentGroupId = null;
}
/**
 * Returns the currently open group id, or null.
 * @returns {string|null}
 */
export function getDrillDownGroupId() {
    return _currentGroupId;
}
// ----------------------------------------------------------------
// INTERNALS
// ----------------------------------------------------------------
function _ensureDom() {
    if (_panel) return;
    _panel = document.createElement('div');
    _panel.id = PANEL_ID;
    _panel.className = 'filter-radar-drilldown';
    _panel.style.display = 'none';
    _panel.setAttribute('role', 'dialog');
    _panel.setAttribute('aria-modal', 'false');
    _panel.setAttribute('aria-hidden', 'true');
    _panel.setAttribute('aria-label', t('filter.drilldown.title') || 'Parameter Detail');
    _panel.innerHTML = `
        <div class="frd-header">
            <span class="frd-group-dot" aria-hidden="true">&#9679;</span>
            <span class="frd-title"></span>
            <button type="button" class="frd-close" aria-label="${t('close') || 'Close'}">&#215;</button>
        </div>
        <div class="frd-summary"></div>
        <ul class="frd-param-list" role="list" aria-label="${t('filter.drilldown.paramList') || 'Parameters'}"></ul>
        <div class="frd-empty" style="display:none">${t('filter.drilldown.noParams') || 'No parameters'}</div>
    `;
    _panel.querySelector('.frd-close')?.addEventListener('click', hideDrillDown);
    document.body.appendChild(_panel);
}
/**
 * Populate the panel with group data.
 * @param {Object} group
 * @param {Array<Object>} elements
 */
function _populate(group: any, elements: any) {
    if (!_panel) return;
    const label = t(group.labelKey) || group.id;
    const dot = _panel.querySelector('.frd-group-dot');
    const title = _panel.querySelector('.frd-title');
    const summary = _panel.querySelector('.frd-summary');
    const list = _panel.querySelector('.frd-param-list');
    const empty = _panel.querySelector('.frd-empty');
    if (dot) dot.style.color = group.color || '#4A90D9';
    if (title) title.textContent = label;
    const paramEntries = _buildParamEntries(group, elements);
    if (summary) {
        summary.textContent =
            `${paramEntries.length} ${t('filter.drilldown.parameters') || 'parameters'} · ` +
            `${group.observationCount || 0} ${t('filter.drilldown.observations') || 'observations'}`;
    }
    if (!list) return;
    list.innerHTML = '';
    if (paramEntries.length === 0) {
        list.style.display = 'none';
        if (empty) empty.style.display = 'block';
        return;
    }
    list.style.display = '';
    if (empty) empty.style.display = 'none';
    for (const entry of paramEntries) {
        const li = document.createElement('li');
        li.className = 'frd-param-item';
        li.setAttribute('role', 'listitem');
        const nameSpan = document.createElement('span');
        nameSpan.className = 'frd-param-name';
        nameSpan.textContent = _formatParamName(entry.paramId);
        const statsSpan = document.createElement('span');
        statsSpan.className = 'frd-param-stats';
        statsSpan.textContent = _formatStats(entry);
        const countSpan = document.createElement('span');
        countSpan.className = 'frd-param-count';
        countSpan.textContent = `n=${entry.count}`;
        li.appendChild(nameSpan);
        li.appendChild(statsSpan);
        li.appendChild(countSpan);
        list.appendChild(li);
    }
}
/**
 * Build sorted parameter entries from group data.
 * @param {Object} group
 * @param {Array<Object>} _elements - Reserved for future name resolution via element manager
 * @returns {Array<{paramId:string,values:number[],count:number,mean:number,min:number,max:number}>}
 */
function _buildParamEntries(group: any, _elements: any) {
    const byParam = group.valuesByParam || {};
    /** @type {Array<{paramId:string,values:number[],count:number,mean:number,min:number,max:number}>} */
    const entries = [];
    for (const [paramId, values] of Object.entries(byParam)) {
        if (!Array.isArray(values) || values.length === 0) continue;
        const nums = values.filter((v: any) => typeof v === 'number' && Number.isFinite(v));
        if (nums.length === 0) continue;
        const mean = nums.reduce((/** @type {number} */ a, b: number) => a + b, 0) / nums.length;
        const min = Math.min(...nums);
        const max = Math.max(...nums);
        entries.push({ paramId, values: nums, count: nums.length, mean, min, max });
    }
    // Sort by count descending, then alphabetically
    entries.sort((a: any, b: any) => b.count - a.count || a.paramId.localeCompare(b.paramId));
    return entries;
}
/**
 * Format a parameter ID for display.
 * @param {string} paramId
 * @returns {string}
 */
function _formatParamName( paramId: any) {
    const key = `parameter.${paramId}`;
    const translated = t(key);
    if (translated && translated !== key) return translated;
    // Fallback: convert snake_case to Title Case
    return paramId
        .split('_')
        .map((w: any) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}
/**
 * Format stats for display.
 * @param {{mean: number, min: number, max: number}} entry
 * @returns {string}
 */
function _formatStats(entry: any) {
    const fmt = (v: any) =>
        Math.abs(v) >= 1000 ? v.toExponential(2) : v.toFixed(3).replace(/\.?0+$/, '');
    if (entry.count === 1) return fmt(entry.mean);
    return `${fmt(entry.mean)} [${fmt(entry.min)}–${fmt(entry.max)}]`;
}
