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
   EVA CHART — Earned Value Analysis visualization
   Visualizacao de Analise de Valor Agregado

   GRAFICOS:
   - Curvas PV/EV/AC ao longo do tempo (Chart.js line)
   - Indicadores SPI/CPI (barras simples)
   - Tabela de desvios criticos
   ================================================================ */
import { escapeHtml } from '../helpers/html.js';
import { formatCurrency } from '../ui/governancePanel.js';
// Track Chart.js instances for proper cleanup
/** @type {Map<string, any>} */
const _chartInstances = new Map();
/**
 * Destroy previous chart on same container before creating new one
 * @param {string} key
 */
function _destroyChart( key: any) {
    const existing = _chartInstances.get(key);
    if (existing) {
        existing.destroy();
        _chartInstances.delete(key);
    }
}
/** @type {any} */
const _Chart: any = typeof (globalThis as any).Chart !== 'undefined' ? ((globalThis as any).Chart) : null;
// ----------------------------------------------------------------
// EVA LINE CHART
// ----------------------------------------------------------------
/**
 * Render EVA chart showing PV, EV, AC curves.
 * Renderiza grafico de linhas PV, EV, AC.
 *
 * @param {HTMLElement} container - Container element
 * @param {Object} evaData - Project-level EVA from calculateProjectEVA()
 * @param {Array<Object>} itemEvas - Per-item EVA data for timeline
 */
export function renderEVAChart( container: any, evaData: any, itemEvas: any = []) {
    if (!container)
        return;
    const eva = (evaData);
    _destroyChart('eva-bar');
    container.innerHTML = '';
    // If no data, show placeholder
    if (!eva || eva.BAC === 0) {
        container.innerHTML =
            '<div style="text-align:center;padding:2rem;color:var(--text-secondary)">No EVA data — add WBS items with baseline costs</div>';
        return;
    }
    // Summary cards
    const summaryHtml = `
        <div class="eva-summary">
            <div class="eva-metric">
                <span class="eva-metric-label">BAC</span>
                <span class="eva-metric-value">${formatCurrency(eva.BAC)}</span>
            </div>
            <div class="eva-metric">
                <span class="eva-metric-label">EAC</span>
                <span class="eva-metric-value ${eva.EAC > eva.BAC ? 'eva-negative' : 'eva-positive'}">${formatCurrency(eva.EAC)}</span>
            </div>
            <div class="eva-metric">
                <span class="eva-metric-label">VAC</span>
                <span class="eva-metric-value ${eva.VAC < 0 ? 'eva-negative' : 'eva-positive'}">${formatCurrency(eva.VAC)}</span>
            </div>
            <div class="eva-metric">
                <span class="eva-metric-label">ETC</span>
                <span class="eva-metric-value">${formatCurrency(eva.ETC)}</span>
            </div>
        </div>
    `;
    // Canvas for Chart.js
    const chartId = `eva-chart-${Date.now()}`;
    container.innerHTML =
        summaryHtml + `<div style="position:relative;height:200px"><canvas id="${chartId}"></canvas></div>`;
    // Build chart data from per-item EVAs
    if (itemEvas.length > 0 && _Chart) {
        const labels = itemEvas.map((e: any) => e.itemName || e.itemId);
        const pvData = itemEvas.map((e: any) => e.PV);
        const evData = itemEvas.map((e: any) => e.EV);
        const acData = itemEvas.map((e: any) => e.AC);
        const canvas = document.getElementById(chartId);
        if (canvas) {
            canvas.setAttribute('role', 'img');
            canvas.setAttribute('aria-label', 'Earned Value Analysis: PV, EV, AC by period');
            _chartInstances.set('eva-bar', new _Chart(canvas, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'PV (Planned Value)',
                            data: pvData,
                            backgroundColor: 'rgba(59,107,255,0.6)',
                            borderColor: '#3b6bff',
                            borderWidth: 1,
                        },
                        {
                            label: 'EV (Earned Value)',
                            data: evData,
                            backgroundColor: 'rgba(76,175,80,0.6)',
                            borderColor: '#4caf50',
                            borderWidth: 1,
                        },
                        {
                            label: 'AC (Actual Cost)',
                            data: acData,
                            backgroundColor: 'rgba(255,152,0,0.6)',
                            borderColor: '#ff9800',
                            borderWidth: 1,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    resizeDelay: 100,
                    onResize: (chart: any, size: any) => {
                        if (size.width === 0 || size.height === 0)
                            return;
                    },
                    plugins: { legend: { position: 'bottom' } },
                    scales: { y: { beginAtZero: true } },
                },
            }));
        }
    }
}
// ----------------------------------------------------------------
// S-CURVE CHART
// ----------------------------------------------------------------
/**
 * Render S-Curve: cumulative PV/EV/AC over time as line chart.
 * Renderiza Curva S: PV/EV/AC acumulados ao longo do tempo.
 *
 * @param {HTMLElement} container
 * @param {{ labels: string[], pvCumulative: number[], evCumulative: number[], acCumulative: number[], bacTotal: number }} data
 */
export function renderSCurveChart( container: any, data: any) {
    if (!container || !data)
        return;
    _destroyChart('s-curve-financial');
    container.innerHTML = '';
    const chartId = `s-curve-${Date.now()}`;
    container.innerHTML = `
        <div class="eva-scurve-title">Curva S &#8212; Cumulative EVA</div>
        <div style="position:relative;height:220px"><canvas id="${chartId}"></canvas></div>
    `;
    if (!_Chart) {
        container.innerHTML +=
            '<div style="text-align:center;padding:1rem;color:var(--text-secondary)">Chart.js not loaded</div>';
        return;
    }
    const canvas = document.getElementById(chartId);
    if (!canvas)
        return;
    _chartInstances.set('s-curve-financial', new _Chart(canvas, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'PV (Planned Value)',
                    data: data.pvCumulative,
                    borderColor: '#3b6bff',
                    backgroundColor: 'rgba(59,107,255,0.08)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2,
                    borderWidth: 2,
                },
                {
                    label: 'EV (Earned Value)',
                    data: data.evCumulative,
                    borderColor: '#4caf50',
                    backgroundColor: 'rgba(76,175,80,0.08)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2,
                    borderWidth: 2,
                },
                {
                    label: 'AC (Actual Cost)',
                    data: data.acCumulative,
                    borderColor: '#ff9800',
                    backgroundColor: 'rgba(255,152,0,0.08)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2,
                    borderWidth: 2,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            resizeDelay: 100,
            onResize: (chart: any, size: any) => {
                if (size.width === 0 || size.height === 0)
                    return;
            },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: (ctx: any) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
                    },
                },
            },
            scales: {
                x: { title: { display: true, text: 'Period' } },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Cumulative (R$)' },
                    ticks: { callback: (v: any) => formatCurrency(v) },
                },
            },
        },
    }));
}
// ----------------------------------------------------------------
// PHYSICAL S-CURVE CHART
// ----------------------------------------------------------------
/**
 * Render Physical S-Curve: planned% vs actual% over time.
 * Renderiza Curva S Fisica: % planejado vs % executado.
 *
 * @param {HTMLElement} container
 * @param {{ labels: string[], plannedCumulative: number[], actualCumulative: number[], totalWeight: number, dataSource: 'snapshots'|'current-only' }} data
 */
export function renderPhysicalSCurveChart( container: any, data: any) {
    if (!container || !data)
        return;
    _destroyChart('s-curve-physical');
    container.innerHTML = '';
    const chartId = `s-curve-physical-${Date.now()}`;
    const isCurrentOnly = data.dataSource === 'current-only';
    const subtitle = isCurrentOnly
        ? '<div class="eva-scurve-subtitle">Actual based on current state &#8212; save snapshots for history</div>'
        : '';
    container.innerHTML = `
        <div class="eva-scurve-title">Curva S F&#237;sica &#8212; Project Progress</div>
        ${subtitle}
        <div style="position:relative;height:220px"><canvas id="${chartId}"></canvas></div>
    `;
    if (!_Chart) {
        container.innerHTML +=
            '<div style="text-align:center;padding:1rem;color:var(--text-secondary)">Chart.js not loaded</div>';
        return;
    }
    const canvas = document.getElementById(chartId);
    if (!canvas)
        return;
    _chartInstances.set('s-curve-physical', new _Chart(canvas, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Planned %',
                    data: data.plannedCumulative,
                    borderColor: '#3b6bff',
                    backgroundColor: 'rgba(59,107,255,0.05)',
                    fill: false,
                    tension: 0.3,
                    pointRadius: 2,
                    borderWidth: 2,
                    borderDash: [6, 3],
                },
                {
                    label: 'Actual %',
                    data: data.actualCumulative,
                    borderColor: '#4caf50',
                    backgroundColor: 'rgba(76,175,80,0.08)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2,
                    borderWidth: isCurrentOnly ? 1 : 2,
                    borderDash: isCurrentOnly ? [2, 4] : [],
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            resizeDelay: 100,
            onResize: (chart: any, size: any) => {
                if (size.width === 0 || size.height === 0)
                    return;
            },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`,
                    },
                },
            },
            scales: {
                x: { title: { display: true, text: 'Period' } },
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: { display: true, text: 'Progress (%)' },
                    ticks: { callback: (v: any) => `${v}%` },
                },
            },
        },
    }));
    // SPI Physical badge
    const refMonthIdx = data.actualCumulative.length - 1;
    const plannedPct = data.plannedCumulative[refMonthIdx] || 0;
    const actualPct = data.actualCumulative[refMonthIdx] || 0;
    if (plannedPct > 0) {
        const spiPhys = actualPct / plannedPct;
        const badgeClass = spiPhys >= 0.95 ? 'eva-good' : spiPhys >= 0.85 ? 'eva-warn' : 'eva-bad';
        container.insertAdjacentHTML('beforeend', `
            <div class="eva-spi-badge ${badgeClass}">
                SPI Physical: ${spiPhys.toFixed(2)} (${actualPct.toFixed(1)}% / ${plannedPct.toFixed(1)}%)
            </div>
        `);
    }
}
// ----------------------------------------------------------------
// SPI / CPI GAUGE
// ----------------------------------------------------------------
/**
 * Render SPI and CPI indicators.
 * Renderiza indicadores de SPI e CPI.
 *
 * @param {HTMLElement} container
 * @param {number} spi - Schedule Performance Index
 * @param {number} cpi - Cost Performance Index
 */
export function renderSPICPIGauge( container: any, spi: any, cpi: any) {
    if (!container)
        return;
    container.innerHTML = `
        <div class="eva-gauges">
            <div class="eva-gauge">
                <div class="eva-gauge-label">SPI</div>
                <div class="eva-gauge-bar">
                    <div class="eva-gauge-fill ${getGaugeClass(spi)}" style="width:${Math.min(spi * 100, 200) / 2}%"></div>
                </div>
                <div class="eva-gauge-value ${getGaugeClass(spi)}">${spi.toFixed(2)}</div>
            </div>
            <div class="eva-gauge">
                <div class="eva-gauge-label">CPI</div>
                <div class="eva-gauge-bar">
                    <div class="eva-gauge-fill ${getGaugeClass(cpi)}" style="width:${Math.min(cpi * 100, 200) / 2}%"></div>
                </div>
                <div class="eva-gauge-value ${getGaugeClass(cpi)}">${cpi.toFixed(2)}</div>
            </div>
        </div>
    `;
}
// ----------------------------------------------------------------
// DEVIATION TABLE
// ----------------------------------------------------------------
/**
 * Render deviation table.
 * Renderiza tabela de desvios criticos.
 *
 * @param {HTMLElement} container
 * @param {Array<Object>} deviations - From detectDeviations()
 */
export function renderDeviationTable( container: any, deviations: any) {
    if (!container)
        return;
    if (deviations.length === 0) {
        container.innerHTML =
            '<div style="text-align:center;padding:1rem;color:var(--text-secondary)">No critical deviations detected</div>';
        return;
    }
    let html = `<table class="eva-deviation-table">
        <thead><tr>
            <th>Code</th><th>Task</th><th>Status</th><th>Issues</th>
        </tr></thead><tbody>`;
    for (const _dev of deviations) {
        const dev = (_dev);
        const issueText = dev.issues.map((i: any) => `${i.metric}: ${i.value.toFixed(2)} (< ${i.threshold})`).join(', ');
        html += `<tr class="eva-deviation-row">
            <td>${escapeHtml(dev.code)}</td>
            <td>${escapeHtml(dev.itemName)}</td>
            <td><span class="eva-status-badge eva-status-${dev.status}">${dev.status.replace('_', ' ')}</span></td>
            <td class="eva-negative">${issueText}</td>
        </tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;
}
// ----------------------------------------------------------------
// STYLES
// ----------------------------------------------------------------
/**
 * Inject EVA chart CSS.
 */
export function injectEVAStyles() {
    if (document.getElementById('eva-styles'))
        return;
    const style = document.createElement('style');
    style.id = 'eva-styles';
    style.textContent = `
        .eva-summary {
            display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem;
        }
        .eva-metric {
            flex: 1; min-width: 80px; padding: 0.4rem 0.6rem;
            background: var(--bg-secondary, #f8f8f8); border-radius: 4px; text-align: center;
        }
        .eva-metric-label { display: block; font-size: 0.7rem; font-weight: 600; color: var(--text-secondary); }
        .eva-metric-value { display: block; font-size: 0.95rem; font-weight: 700; }
        .eva-positive { color: #4caf50; }
        .eva-negative { color: #f44336; }
        .eva-gauges { display: flex; gap: 1rem; margin: 0.5rem 0; }
        .eva-gauge { flex: 1; }
        .eva-gauge-label { font-size: 0.75rem; font-weight: 600; margin-bottom: 0.2rem; }
        .eva-gauge-bar {
            height: 8px; background: var(--bg-tertiary, #eee);
            border-radius: 4px; overflow: hidden;
        }
        .eva-gauge-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
        .eva-gauge-fill.eva-good { background: #4caf50; }
        .eva-gauge-fill.eva-warn { background: #ff9800; }
        .eva-gauge-fill.eva-bad { background: #f44336; }
        .eva-gauge-value { font-size: 0.85rem; font-weight: 700; margin-top: 0.2rem; }
        .eva-deviation-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .eva-deviation-table th {
            text-align: left; padding: 0.3rem 0.5rem; font-weight: 600;
            border-bottom: 2px solid var(--border-color, #ddd);
        }
        .eva-deviation-table td { padding: 0.3rem 0.5rem; border-bottom: 1px solid var(--border-color, #eee); }
        .eva-status-badge {
            font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 3px;
            text-transform: capitalize;
        }
        .eva-status-not_started { background: #e0e0e0; }
        .eva-status-in_progress { background: #d9edf7; color: #31708f; }
        .eva-status-completed { background: #dff0d8; color: #3c763d; }
        .eva-status-delayed { background: #f2dede; color: #a94442; }
        .eva-scurve-title {
            font-size: 0.85rem; font-weight: 600;
            margin: 1rem 0 0.5rem 0; color: var(--text-primary);
        }
        .eva-scurve-subtitle {
            font-size: 0.75rem; color: var(--text-secondary);
            margin-bottom: 0.4rem; font-style: italic;
        }
        .eva-spi-badge {
            display: inline-block; font-size: 0.78rem; font-weight: 600;
            padding: 0.2rem 0.6rem; border-radius: 4px; margin-top: 0.4rem;
        }
        .eva-spi-badge.eva-good { background: #dff0d8; color: #3c763d; }
        .eva-spi-badge.eva-warn { background: #fcf8e3; color: #8a6d3b; }
        .eva-spi-badge.eva-bad { background: #f2dede; color: #a94442; }

        /* WBS Data Table Modal — tabela editavel para Curva S */
        .wbs-data-modal-header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 12px 16px; border-bottom: 1px solid var(--border-color, #ddd);
        }
        .wbs-data-modal-header h3 { margin: 0; font-size: 1rem; }
        .wbs-data-modal-body {
            overflow: auto; max-height: calc(80vh - 120px); padding: 8px;
        }
        .wbs-data-modal-footer {
            display: flex; justify-content: flex-end; align-items: center;
            gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border-color, #ddd);
        }
        .wbs-data-dirty {
            color: var(--warning-color, #e6a700); font-size: 0.8rem; margin-right: auto;
        }
        .wbs-data-empty { padding: 16px; color: var(--text-secondary); }
        .wbs-data-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
        .wbs-data-table th {
            position: sticky; top: 0; background: var(--bg-secondary, #f5f5f5);
            padding: 4px 6px; white-space: nowrap; text-align: left;
            border-bottom: 2px solid var(--border-color, #ddd); z-index: 1;
        }
        .wbs-data-table td { padding: 2px 3px; border-bottom: 1px solid var(--border-color, #eee); }
        .wbs-data-table input,
        .wbs-data-table select {
            width: 100%; box-sizing: border-box; background: transparent;
            border: 1px solid transparent; color: inherit;
            padding: 2px 4px; font-size: 0.78rem; font-family: inherit;
        }
        .wbs-data-table input:focus,
        .wbs-data-table select:focus {
            border-color: var(--accent, #3b6bff); outline: none;
            background: var(--bg-tertiary, rgba(255,255,255,0.05));
        }
        .wbs-data-table input[type="number"] { width: 80px; text-align: right; }
        .wbs-data-table input[type="date"]   { width: 130px; }
        .wbs-data-table input[readonly]       { opacity: 0.6; cursor: default; }
        .wbs-data-table select                { width: 110px; }
    `;
    document.head.appendChild(style);
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/** @param {number} value */
function getGaugeClass( value: any) {
    if (value >= 0.95)
        return 'eva-good';
    if (value >= 0.8)
        return 'eva-warn';
    return 'eva-bad';
}
