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
   CROSS-TABULATION TABLE (Compliance Matrix)
   ================================================================

   Matriz de conformidade: linhas = elementos, colunas = parametros.
   Cada celula mostra o valor mais recente e cor de conformidade.
   Inclui aba Timeline com grafico de violacoes ao longo do tempo.

   ================================================================ */
import { CONFIG } from '../../config.js';
import { validateObservationFull, getThresholds } from '../validation/rules.js';
import { resolveRegulatoryContext } from '../calculator/contextResolver.js';
import { escapeHtml } from '../../utils/helpers/html.js';
import { getIcon } from '../../utils/ui/icons.js';
import { t } from '../../utils/i18n/translations.js';
import { getAllElements } from '../elements/manager.js';
// ----------------------------------------------------------------
// CROSSTAB TABLE CLASS
// ----------------------------------------------------------------
export class CrossTabTable {
    activeTab: string;
    container: any;
    elementIds: string[];
    hideEmpty: boolean;
    matrix: any;
    onlyRegulated: boolean;
    parameterIds: string[];
    searchQuery: string;
    selectedCampaign: any;
    tensor: any;
    /** @param {any} container */
    constructor(container: any) {
        this.container = container;
        /** @type {any} */
        this.tensor = null;
        // Data: Map<elementId, Map<parameterId, {value, unit, timestamp, campaign, validation}>>
        /** @type {Map<any,any>|null} */
        this.matrix = null;
        // Ordered lists for rows/cols
        /** @type {string[]} */
        this.elementIds = [];
        /** @type {string[]} */
        this.parameterIds = [];
        // State
        this.activeTab = 'matrix'; // 'matrix' | 'timeline'
        this.selectedCampaign = null; // null = latest
        this.onlyRegulated = true; // show only regulated params by default
        this.hideEmpty = true; // hide elements with no data by default
        this.searchQuery = ''; // filter params by name
        this._render();
    }
    /**
     * Receive data tensor from ViewportManager.
     * Recebe tensor de dados do gerenciador de viewports.
     */
    /** @param {any} tensor */
    setTensor(tensor: any) {
        this.tensor = tensor;
        this._buildMatrix();
        this._render();
    }
    // ----------------------------------------------------------------
    // MATRIX BUILDING
    // ----------------------------------------------------------------
    _buildMatrix() {
        if (!this.tensor) {
            this.matrix = null;
            return;
        }
        const data = this.tensor.getAll();
        if (!data.length) {
            this.matrix = null;
            return;
        }
        const matrix = new Map();
        const paramSet = new Set();
        const elements = getAllElements();
        const elementNames = new Map();
        elements.forEach((/** @type {any} */ el) => elementNames.set(el.id, el.name || el.id));
        data.forEach((point: any) => {
            if (point.value == null || isNaN(point.value))
                return;
            if (!point.parameterId)
                return;
            // Campaign filter
            if (this.selectedCampaign && point.campaign !== this.selectedCampaign)
                return;
            if (!matrix.has(point.elementId)) {
                matrix.set(point.elementId, new Map());
            }
            const elemMap = matrix.get(point.elementId);
            paramSet.add(point.parameterId);
            // Keep latest by timestamp (or specific campaign)
            const existing = elemMap.get(point.parameterId);
            if (!existing || point.timestamp > existing.timestamp) {
                const regContext = resolveRegulatoryContext(point.variables, point.family);
                const results = validateObservationFull({ value: point.value, unitId: point.unit }, point.parameterId, regContext);
                const thresholds = getThresholds(point.parameterId, regContext);
                elemMap.set(point.parameterId, {
                    value: point.value,
                    unit: point.unit,
                    timestamp: point.timestamp,
                    campaign: point.campaign,
                    validation: results.length > 0 ? results[0] : null,
                    hasLimit: thresholds.length > 0,
                });
            }
        });
        this.matrix = matrix;
        this.elementIds = /** @type {string[]} */ (Array.from(matrix.keys())).sort((a: any, b: any) => (elementNames.get(a) || a).localeCompare(elementNames.get(b) || b));
        this.parameterIds = (Array.from(paramSet) as string[]).sort((a: string, b: string) => a.localeCompare(b));
    }
    // ----------------------------------------------------------------
    // RENDERING
    // ----------------------------------------------------------------
    _render() {
        if (!this.matrix || this.matrix.size === 0) {
            this.container.innerHTML = `<div class="crosstab-empty">${t('noData') || 'No data to display'}</div>`;
            return;
        }
        const elements = getAllElements();
        const elementNames = new Map();
        elements.forEach((/** @type {any} */ el) => elementNames.set(el.id, el.name || el.id));
        // Build unique campaigns for selector
        const campaigns = new Set();
        this.tensor.getAll().forEach((p: any) => {
            if (p.campaign)
                campaigns.add(p.campaign);
        });
        let html = '<div class="crosstab-wrapper">';
        // Tab bar
        html += `<div class="crosstab-tab-bar">
            <button class="crosstab-tab${this.activeTab === 'matrix' ? ' active' : ''}"
                    data-tab="matrix">${getIcon('grid', { size: '12px' })} Matrix</button>
            <button class="crosstab-tab${this.activeTab === 'timeline' ? ' active' : ''}"
                    data-tab="timeline">${getIcon('bar-chart', { size: '12px' })} Timeline</button>
        </div>`;
        // Toolbar (campaign selector + filters + export)
        html += `<div class="crosstab-toolbar">
            <label style="font-size:10px;color:var(--neutral-500);">Campaign:</label>
            <select data-field-meta="true" data-field-meta-key="auto-pos:crossTab:select:L163" class="form-input" style="max-width:140px;font-size:10px;" data-action="campaign-select">
                <option value="">Latest</option>
                ${
        /** @type {string[]} */ (Array.from(campaigns))
            .sort()
            .map((c) => `<option value="${escapeHtml(c)}" ${c === this.selectedCampaign ? 'selected' : ''}>${escapeHtml(c)}</option>`)
            .join('')}
            </select>
            <span class="crosstab-toolbar-sep"></span>
            <label class="crosstab-toggle-label" title="Show only parameters with regulatory limits">
                <input data-field-meta="true" data-field-meta-key="auto-pos:crossTab:input:L175" type="checkbox" data-action="only-regulated" ${this.onlyRegulated ? 'checked' : ''}>
                <span>${getIcon('shield', { size: '11px' })} Regulated</span>
            </label>
            <label class="crosstab-toggle-label" title="Hide elements with no observations">
                <input data-field-meta="true" data-field-meta-key="auto-pos:crossTab:input:L179" type="checkbox" data-action="hide-empty" ${this.hideEmpty ? 'checked' : ''}>
                <span>${getIcon('eye-off', { size: '11px' })} Hide empty</span>
            </label>
            <span class="crosstab-toolbar-sep"></span>
            <input type="text" class="crosstab-search" data-action="search-params"
                   placeholder="${t('search') || 'Search'}..." value="${escapeHtml(this.searchQuery)}"
                   style="max-width:120px;">
            <div style="flex:1"></div>
            <button class="btn btn-sm" data-action="export-csv">${getIcon('download', { size: '12px' })} CSV</button>
        </div>`;
        // Tab content
        html += '<div class="crosstab-tab-content">';
        if (this.activeTab === 'matrix') {
            html += this._renderMatrixTable(elementNames);
        }
        else {
            html += '<canvas class="crosstab-timeline-canvas" style="width:100%;height:100%;"></canvas>';
        }
        html += '</div>';
        // Footer stats
        const stats = this._computeStats();
        html += `<div class="crosstab-footer">
            <div class="crosstab-stats">
                <span class="crosstab-stat"><span class="crosstab-stat-dot ok"></span> ${stats.ok} ok</span>
                <span class="crosstab-stat"><span class="crosstab-stat-dot ref"></span> ${stats.reference} ${t('tierReference') || 'VR'}</span>
                <span class="crosstab-stat"><span class="crosstab-stat-dot prev"></span> ${stats.prevention} ${t('tierPrevention') || 'VP'}</span>
                <span class="crosstab-stat"><span class="crosstab-stat-dot interv"></span> ${stats.intervention} ${t('tierIntervention') || 'VI'}</span>
                <span style="color:var(--neutral-400);">${stats.noLimit} no limit</span>
            </div>
            <span style="color:var(--neutral-400);">${this.elementIds.length} × ${this.parameterIds.length}</span>
        </div>`;
        html += '</div>';
        this.container.innerHTML = html;
        this._attachEvents();
        // Draw timeline if active
        if (this.activeTab === 'timeline') {
            requestAnimationFrame(() => this._drawTimeline());
        }
    }
    /**
     * Get filtered parameter list based on user settings.
     * Retorna lista de parametros filtrada pelos toggles.
     */
    _getFilteredParams() {
        const paramDefs = CONFIG.PARAMETERS || [];
        const paramNameMap = new Map();
        paramDefs.forEach((/** @type {any} */ p) => paramNameMap.set(p.id, p.name || p.id));
        return this.parameterIds.filter((pid) => {
            // Must have at least 1 element with data
            let count = 0;
            this.elementIds.forEach((eid) => {
                if (this.matrix?.get(eid)?.has(pid))
                    count++;
            });
            if (count < 1)
                return false;
            // Only regulated filter
            if (this.onlyRegulated) {
                const thresholds = getThresholds(pid);
                if (thresholds.length === 0)
                    return false;
            }
            // Search filter
            if (this.searchQuery) {
                const name = (paramNameMap.get(pid) || pid).toLowerCase();
                const q = this.searchQuery.toLowerCase();
                if (!name.includes(q) && !pid.toLowerCase().includes(q))
                    return false;
            }
            return true;
        });
    }
    /**
     * Get filtered element list based on user settings.
     * Retorna lista de elementos filtrada (esconde vazios).
     */
    /** @param {string[]} filteredParams */
    _getFilteredElements(filteredParams: string[]) {
        if (!this.hideEmpty)
            return this.elementIds;
        return this.elementIds.filter((eid) => {
            const elemMap = this.matrix?.get(eid);
            return filteredParams.some((pid: string) => elemMap?.has(pid));
        });
    }
    _buildColumnStats(filteredParams: string[], filteredElements: string[]) {
        const colStats = new Map();
        filteredParams.forEach((pid: string) => {
            const counts = { interv: 0, prev: 0, ref: 0, ok: 0, total: 0 };
            filteredElements.forEach((eid) => {
                const cell = this.matrix?.get(eid)?.get(pid);
                if (!cell) return;
                counts.total++;
                this._accumulateSeverity(cell, counts);
            });
            colStats.set(pid, counts);
        });
        return colStats;
    }

    _buildRowStats(filteredElements: string[], filteredParams: string[]) {
        const rowStats = new Map();
        filteredElements.forEach((eid) => {
            const counts = { interv: 0, prev: 0, ref: 0, ok: 0, total: 0 };
            const elemMap = this.matrix?.get(eid);
            filteredParams.forEach((pid) => {
                const cell = elemMap?.get(pid);
                if (!cell) return;
                counts.total++;
                this._accumulateSeverity(cell, counts);
            });
            rowStats.set(eid, counts);
        });
        return rowStats;
    }

    _accumulateSeverity(cell: any, counts: { interv: number; prev: number; ref: number; ok: number }) {
        if (cell.validation?.severity === 'intervention') counts.interv++;
        else if (cell.validation?.severity === 'prevention') counts.prev++;
        else if (cell.validation?.severity === 'reference') counts.ref++;
        else if (cell.hasLimit) counts.ok++;
    }

    _renderParamHeader(pid: string, paramNameMap: Map<string, string>, colStats: Map<string, any>) {
        const name = paramNameMap.get(pid) || pid;
        const thresholds = getThresholds(pid);
        const vi = thresholds.find((t: any) => t.type === 'vi' || t.type === 'cma');
        const vp = thresholds.find((t: any) => t.type === 'vp');
        const limitParts: string[] = [];
        if (vi) limitParts.push(`VI: ${vi.value} ${vi.unit}`);
        if (vp) limitParts.push(`VP: ${vp.value} ${vp.unit}`);
        const limitTitle = limitParts.length > 0 ? `\n${limitParts.join(' | ')} (${(vi || vp).source})` : '';
        const shortName = name.length > 12 ? pid : name;
        const regulated = thresholds.length > 0;
        const cs = colStats.get(pid);
        const colClass = this._severityClass(cs);
        const limitBadge = vi
            ? `<span class="crosstab-param-limit">VI:${vi.value}</span>`
            : vp
                ? `<span class="crosstab-param-limit">VP:${vp.value}</span>`
                : '';
        return `<th class="${colClass}" title="${escapeHtml(name)}${escapeHtml(limitTitle)}">
            <span class="crosstab-param-name${regulated ? ' regulated' : ''}">${escapeHtml(shortName)}</span>
            ${limitBadge}
        </th>`;
    }

    _severityClass(cs: { interv: number; prev: number; ref: number } | undefined) {
        if (!cs || cs.interv === 0 && cs.prev === 0 && cs.ref === 0) return '';
        if (cs.interv > 0) return ' crosstab-col-interv';
        if (cs.prev > 0) return ' crosstab-col-prev';
        return ' crosstab-col-ref';
    }

    _rowSeverityClass(rs: { interv: number; prev: number; ref: number } | undefined) {
        if (!rs || rs.interv === 0 && rs.prev === 0 && rs.ref === 0) return '';
        if (rs.interv > 0) return ' crosstab-row-interv';
        if (rs.prev > 0) return ' crosstab-row-prev';
        return ' crosstab-row-ref';
    }

    _renderSummaryBadges(rs: { interv: number; prev: number; ref: number; ok: number; total: number }) {
        let html = '';
        if (rs.interv > 0) html += `<span class="crosstab-badge interv">${rs.interv}</span>`;
        if (rs.prev > 0) html += `<span class="crosstab-badge prev">${rs.prev}</span>`;
        if (rs.ref > 0) html += `<span class="crosstab-badge ref">${rs.ref}</span>`;
        if (rs.interv === 0 && rs.prev === 0 && rs.ref === 0 && rs.ok > 0) {
            html += `<span class="crosstab-badge ok">${getIcon('check', { size: '10px' })}</span>`;
        }
        if (rs.total === 0) html += '<span style="color:var(--neutral-400);">&mdash;</span>';
        return html;
    }

    _renderElementRow(
        eid: string,
        elementNames: Map<string, string>,
        filteredParams: string[],
        rowStats: Map<string, any>,
    ) {
        const displayName = elementNames.get(eid) || eid;
        const rs = rowStats.get(eid);
        const rowClass = this._rowSeverityClass(rs);
        let html = `<tr class="${rowClass}"><td class="crosstab-row-header" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</td>`;
        const elemMap = this.matrix?.get(eid);
        filteredParams.forEach((pid) => {
            const cell = elemMap?.get(pid);
            if (!cell) {
                html += '<td class="crosstab-cell-empty">&mdash;</td>';
            } else {
                const cls = this._cellClass(cell);
                const tooltip = cell.validation ? escapeHtml(cell.validation.message) : cell.hasLimit ? 'OK' : '';
                const formatted = this._formatValue(cell.value);
                html += `<td class="crosstab-cell ${cls}" title="${tooltip}">${formatted}</td>`;
            }
        });
        html += '<td class="crosstab-summary-cell">';
        html += this._renderSummaryBadges(rs);
        html += '</td>';
        html += '</tr>';
        return html;
    }

    /**
     * Render HTML table for matrix tab.
     * Tabela com summary row/col, heatmap, filtros aplicados.
     */
    /** @param {Map<string,string>} elementNames */
    _renderMatrixTable(elementNames: Map<string, string>) {
        const paramDefs = CONFIG.PARAMETERS || [];
        const paramNameMap = new Map();
        paramDefs.forEach((/** @type {any} */ p) => paramNameMap.set(p.id, p.name || p.id));
        const filteredParams = this._getFilteredParams();
        const filteredElements = this._getFilteredElements(filteredParams);
        if (filteredParams.length === 0 || filteredElements.length === 0) {
            return `<div class="crosstab-empty">${t('noData') || 'No matching data'}</div>`;
        }
        const colStats = this._buildColumnStats(filteredParams, filteredElements);
        const rowStats = this._buildRowStats(filteredElements, filteredParams);
        let html = '<div class="crosstab-container"><table class="crosstab-table">';
        // ---- HEADER ROW ----
        html += '<thead><tr><th class="crosstab-corner"></th>';
        filteredParams.forEach((pid) => {
            html += this._renderParamHeader(pid, paramNameMap, colStats);
        });
        // Summary column header
        html += '<th class="crosstab-summary-col-header" title="Violations per element">Status</th>';
        html += '</tr></thead>';
        // ---- BODY ROWS ----
        html += '<tbody>';
        filteredElements.forEach((eid) => {
            html += this._renderElementRow(eid, elementNames, filteredParams, rowStats);
        });
        // ---- SUMMARY ROW (violations per parameter) ----
        html +=
            '<tr class="crosstab-summary-row"><td class="crosstab-row-header crosstab-summary-row-header">Summary</td>';
        filteredParams.forEach((pid) => {
            const cs = colStats.get(pid);
            html += '<td class="crosstab-summary-cell">';
            html += this._renderSummaryBadges(cs);
            html += '</td>';
        });
        html += '<td class="crosstab-summary-cell"></td>';
        html += '</tr>';
        html += '</tbody></table></div>';
        return html;
    }
    /** @param {any} cell */
    _cellClass(cell: any) {
        if (cell.validation) {
            if (cell.validation.severity === 'intervention')
                return 'crosstab-intervention';
            if (cell.validation.severity === 'prevention')
                return 'crosstab-prevention';
            if (cell.validation.severity === 'reference')
                return 'crosstab-reference';
            return 'crosstab-ok';
        }
        if (cell.hasLimit)
            return 'crosstab-ok';
        return 'crosstab-no-limit';
    }
    /** @param {number|null|undefined} value */
    _formatValue(value: any) {
        if (value == null)
            return '&mdash;';
        if (Math.abs(value) < 0.01)
            return value.toExponential(2);
        if (Math.abs(value) < 1)
            return value.toFixed(3);
        if (Math.abs(value) < 100)
            return value.toFixed(2);
        return value.toFixed(1);
    }
    _computeStats() {
        let ok = 0, reference = 0, prevention = 0, intervention = 0, noLimit = 0;
        this.elementIds.forEach((eid) => {
            const elemMap = this.matrix?.get(eid);
            this.parameterIds.forEach((pid) => {
                const cell = elemMap?.get(pid);
                if (!cell)
                    return;
                if (cell.validation) {
                    if (cell.validation.severity === 'intervention')
                        intervention++;
                    else if (cell.validation.severity === 'prevention')
                        prevention++;
                    else if (cell.validation.severity === 'reference')
                        reference++;
                    else
                        ok++;
                }
                else if (cell.hasLimit) {
                    ok++;
                }
                else {
                    noLimit++;
                }
            });
        });
        return { ok, reference, prevention, intervention, noLimit };
    }
    // ----------------------------------------------------------------
    // TIMELINE CHART (embedded in cross-tab)
    // ----------------------------------------------------------------
    _drawTimeline() {
        const canvas = this.container.querySelector('.crosstab-timeline-canvas');
        if (!canvas)
            return;
        const rect = canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        const ctx = (canvas.getContext('2d'));
        ctx.scale(dpr, dpr);
        const W = rect.width, H = rect.height;
        // Compute violations by month
        const violations = this._computeViolationsByMonth();
        if (violations.length === 0) {
            ctx.fillStyle = '#888';
            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(t('noViolations') || 'No violations detected', W / 2, H / 2);
            return;
        }
        const margin = { top: 30, right: 16, bottom: 40, left: 44 };
        const plotW = W - margin.left - margin.right;
        const plotH = H - margin.top - margin.bottom;
        const maxCount = Math.max(...violations.map((v: any) => v.intervention + v.prevention + v.reference), 1);
        const barWidth = Math.min(40, plotW / violations.length - 2);
        // Title
        ctx.fillStyle = '#888';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('violationsTimeline') || 'Violations Timeline', W / 2, 16);
        // Y axis
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 4; i++) {
            const y = margin.top + plotH - (i / 4) * plotH;
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(W - margin.right, y);
            ctx.stroke();
            ctx.fillStyle = '#999';
            ctx.font = '9px JetBrains Mono, monospace';
            ctx.textAlign = 'right';
            ctx.fillText(Math.round((maxCount * i) / 4).toString(), margin.left - 4, y + 3);
        }
        // Bars - stacked: reference (base), prevention (middle), intervention (top)
        const step = plotW / violations.length;
        violations.forEach((v: any, i: number) => {
            const x = margin.left + i * step + (step - barWidth) / 2;
            const refH = (v.reference / maxCount) * plotH;
            const prevH = (v.prevention / maxCount) * plotH;
            const intervH = (v.intervention / maxCount) * plotH;
            const baseY = margin.top + plotH;
            let y = baseY;
            // Reference bar (base - azul)
            if (refH > 0) {
                y -= refH;
                ctx.fillStyle = '#60a5fa';
                ctx.fillRect(x, y, barWidth, refH);
            }
            // Prevention bar (middle - amarelo)
            if (prevH > 0) {
                y -= prevH;
                ctx.fillStyle = '#fbbf24';
                ctx.fillRect(x, y, barWidth, prevH);
            }
            // Intervention bar (top - vermelho)
            if (intervH > 0) {
                y -= intervH;
                ctx.fillStyle = '#ef4444';
                ctx.fillRect(x, y, barWidth, intervH);
            }
            // X label
            ctx.fillStyle = '#999';
            ctx.font = '8px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.save();
            ctx.translate(x + barWidth / 2, baseY + 10);
            ctx.rotate(-Math.PI / 6);
            ctx.fillText(v.label, 0, 0);
            ctx.restore();
        });
    }
    _computeViolationsByMonth() {
        if (!this.tensor)
            return [];
        const data = this.tensor.getAll();
        const byMonth = new Map();
        data.forEach((point: any) => {
            if (point.value == null || isNaN(point.value))
                return;
            const regContext = resolveRegulatoryContext(point.variables, point.family);
            const results = validateObservationFull({ value: point.value, unitId: point.unit }, point.parameterId, regContext);
            if (results.length === 0)
                return;
            const d = new Date(point.timestamp);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!byMonth.has(key))
                byMonth.set(key, { label: key, intervention: 0, prevention: 0, reference: 0 });
            const m = byMonth.get(key);
            const sev = results[0].severity;
            if (sev === 'intervention')
                m.intervention++;
            else if (sev === 'prevention')
                m.prevention++;
            else if (sev === 'reference')
                m.reference++;
            else
                m.intervention++; // fallback
        });
        return Array.from(byMonth.values()).sort((a: any, b: any) => a.label.localeCompare(b.label));
    }
    // ----------------------------------------------------------------
    // CSV EXPORT
    // ----------------------------------------------------------------
    exportCSV() {
        if (!this.matrix)
            return '';
        const elements = getAllElements();
        const elementNames = new Map();
        elements.forEach((/** @type {any} */ el) => elementNames.set(el.id, el.name || el.id));
        const rows = [];
        // Header
        rows.push(['Element', ...this.parameterIds].join(','));
        this.elementIds.forEach((eid) => {
            const elemMap = this.matrix?.get(eid);
            const displayName = elementNames.get(eid) || eid;
            const cells = this.parameterIds.map((pid) => {
                const cell = elemMap?.get(pid);
                return cell ? cell.value : '';
            });
            rows.push([`"${displayName}"`, ...cells].join(','));
        });
        return rows.join('\n');
    }
    // ----------------------------------------------------------------
    // EVENT HANDLERS
    // ----------------------------------------------------------------
    _attachEvents() {
        // Tab switching
        this.container.querySelectorAll('.crosstab-tab').forEach((tab: any) => {
            tab.addEventListener('click', () => {
                this.activeTab = tab.dataset.tab;
                this._render();
            });
        });
        // Campaign selector
        const campaignSelect = this.container.querySelector('[data-action="campaign-select"]');
        if (campaignSelect) {
            campaignSelect.addEventListener('change', () => {
                this.selectedCampaign = campaignSelect.value || null;
                this._buildMatrix();
                this._render();
            });
        }
        // Only regulated toggle
        const regToggle = this.container.querySelector('[data-action="only-regulated"]');
        if (regToggle) {
            regToggle.addEventListener('change', () => {
                this.onlyRegulated = regToggle.checked;
                this._render();
            });
        }
        // Hide empty toggle
        const emptyToggle = this.container.querySelector('[data-action="hide-empty"]');
        if (emptyToggle) {
            emptyToggle.addEventListener('change', () => {
                this.hideEmpty = emptyToggle.checked;
                this._render();
            });
        }
        // Search filter
        const searchInput = this.container.querySelector('[data-action="search-params"]');
        if (searchInput) {
            /** @type {ReturnType<typeof setTimeout>|undefined} */
            let debounce: ReturnType<typeof setTimeout> | undefined;
            searchInput.addEventListener('input', () => {
                if (debounce)
                    clearTimeout(debounce);
                debounce = setTimeout(() => {
                    this.searchQuery = searchInput.value;
                    this._render();
                    // Restore focus
                    const next = this.container.querySelector('[data-action="search-params"]');
                    if (next) {
                        next.focus();
                        next.selectionStart = next.selectionEnd = next.value.length;
                    }
                }, 250);
            });
        }
        // Export CSV
        const exportBtn = this.container.querySelector('[data-action="export-csv"]');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const csv = this.exportCSV();
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `compliance-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
                link.click();
                URL.revokeObjectURL(link.href);
            });
        }
    }
    // ----------------------------------------------------------------
    // LIFECYCLE
    // ----------------------------------------------------------------
    destroy() {
        this.container.innerHTML = '';
        this.tensor = null;
        this.matrix = null;
    }
}
//# sourceMappingURL=crossTab.js.map
