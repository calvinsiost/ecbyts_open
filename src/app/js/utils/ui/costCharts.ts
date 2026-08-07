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
   COST CHARTS — Chart.js renderers for Cost Analysis Panel
   Gráficos de custo para o painel de Análise de Custos

   GRÁFICOS:
   - Stacked bar: CAPEX vs OPEX por ano fiscal
   - Doughnut: custo por família de elementos
   - Horizontal bar: custo por campanha
   - Line: custo acumulado ao longo do tempo
   ================================================================ */
import { formatCurrency } from './governancePanel.js';
import { t } from '../i18n/translations.js';
import { DATA_VIZ_PALETTE_EXTENDED, CHART_SEMANTIC, applyChartAccessibility } from './chartTheme.js';
import { attachErrorBars, isShowUncertaintyEnabled } from './chartUncertainty.js';
// Chart.js global alias (loaded via CDN)
const Chart: any = (globalThis as any).Chart;
// Track Chart instances to avoid memory leaks
const _chartInstances = new Map();
// Y9: Use shared colorblind-safe palette instead of duplicated FAMILY_PALETTE
const FAMILY_PALETTE = DATA_VIZ_PALETTE_EXTENDED;
// Y9: Color palette from shared chartTheme (colorblind-safe)
const COLORS = {
    capex: CHART_SEMANTIC.capex,
    capexBorder: CHART_SEMANTIC.capexBorder,
    opex: CHART_SEMANTIC.opex,
    opexBorder: CHART_SEMANTIC.opexBorder,
    total: CHART_SEMANTIC.total,
    totalBorder: CHART_SEMANTIC.totalBorder,
    cumulative: CHART_SEMANTIC.cumulative,
    cumulativeBorder: CHART_SEMANTIC.cumulativeBorder,
};
// ----------------------------------------------------------------
// MAIN DISPATCHER
// ----------------------------------------------------------------
/**
 * Render all cost charts for the active view.
 * Renderiza todos os gráficos de custo para a visão ativa.
 *
 * @param {any} rollup - CostRollup from buildCostRollup()
 * @param {string} view - 'synthetic' or 'detailed'
 */
export function renderCostCharts( rollup: any, view: any) {
    if (!Chart) {
        console.warn('[CostCharts] Chart.js not loaded');
        return;
    }
    if (view === 'synthetic') {
        renderCapexOpexByYearChart('cost-chart-by-year', rollup.timeline);
        renderCostByFamilyChart('cost-chart-by-family', rollup.byFamily);
        renderCampaignCostChart('cost-chart-campaigns', rollup.byCampaign);
        renderCostByCostCenterChart('cost-chart-by-cc', rollup.byCostCenter);
    } else {
        renderCumulativeCostChart('cost-chart-cumulative', rollup.timeline);
    }
}
/**
 * Destroy all tracked chart instances.
 * Destroi todas as instâncias de gráfico rastreadas.
 */
export function destroyAllCostCharts() {
    for (const [, chart] of _chartInstances) {
        chart.destroy();
    }
    _chartInstances.clear();
}
// ----------------------------------------------------------------
// STACKED BAR: CAPEX vs OPEX BY FISCAL YEAR
// ----------------------------------------------------------------
/** @param {string} containerId @param {any[]} timeline */
function renderCapexOpexByYearChart( containerId: any, timeline: any) {
    const canvas = document.getElementById(containerId);
    if (!canvas || timeline.length === 0) return;
    _destroyExisting(containerId);
    applyChartAccessibility(canvas as any, 'Cost timeline: CAPEX and OPEX by fiscal year');
    const labels = timeline.map((t: any) => String(t.fiscalYear));
    const capexData = timeline.map((t: any) => t.capex);
    const opexData = timeline.map((t: any) => t.opex);
    _chartInstances.set(
        containerId,
        new Chart(canvas as HTMLCanvasElement, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'CAPEX',
                        data: capexData,
                        backgroundColor: COLORS.capex,
                        borderColor: COLORS.capexBorder,
                        borderWidth: 1,
                    },
                    {
                        label: 'OPEX',
                        data: opexData,
                        backgroundColor: COLORS.opex,
                        borderColor: COLORS.opexBorder,
                        borderWidth: 1,
                    },
                ],
            },
            options: _barOptions(true),
        }),
    );
    // UNC-STRUCTURAL-001 gap #13 - attach error bars if toggle ON
    if (isShowUncertaintyEnabled()) {
        try {
            const chart = _chartInstances.get(containerId);
            const totals = timeline.map((t: any) => (Number(t.capex) || 0) + (Number(t.opex) || 0));
            // Conservative ±15% U relativa quando custos carecem de incerteza declarada
            const us = totals.map((v: any) => v * 0.15);
            attachErrorBars(chart, { values: totals, uncertainties: us, k: 1 });
        } catch (err: any) {
            console.debug('[cost-chart] error bars skipped:', err?.message);
        }
    }
}
// ----------------------------------------------------------------
// DOUGHNUT: COST BY FAMILY
// ----------------------------------------------------------------
/** @param {string} containerId @param {Record<string,any>} byFamily */
function renderCostByFamilyChart( containerId: any, byFamily: any) {
    const canvas = document.getElementById(containerId);
    if (!canvas) return;
    const families = Object.keys(byFamily).filter((f: any) => byFamily[f].total > 0);
    if (families.length === 0) return;
    _destroyExisting(containerId);
    applyChartAccessibility(canvas as any, 'Cost by family (doughnut chart)');
    const labels = families.map((f: any) => f.charAt(0).toUpperCase() + f.slice(1));
    const data = families.map((f: any) => byFamily[f].total);
    const bgColors = families.map((_: any, i: any) => FAMILY_PALETTE[i % FAMILY_PALETTE.length]);
    _chartInstances.set(
        containerId,
        new Chart(canvas as HTMLCanvasElement, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [
                    {
                        data,
                        backgroundColor: bgColors,
                        borderWidth: 1,
                        borderColor: 'var(--bg-primary, #fff)',
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx: any) => `${ctx.label}: ${formatCurrency(ctx.raw)}`,
                        },
                    },
                },
            },
        }),
    );
}
// ----------------------------------------------------------------
// HORIZONTAL BAR: CAMPAIGN COSTS
// ----------------------------------------------------------------
/** @param {string} containerId @param {Record<string,any>} byCampaign */
function renderCampaignCostChart( containerId: any, byCampaign: any) {
    const canvas = document.getElementById(containerId);
    if (!canvas) return;
    const entries = Object.values(byCampaign).filter((c: any) => c.total > 0);
    if (entries.length === 0) return;
    _destroyExisting(containerId);
    applyChartAccessibility(canvas as any, 'Campaign costs (horizontal bar chart)');
    // Sort by total descending
    entries.sort((a: any, b: any) => b.total - a.total);
    const labels = entries.map((c: any) => c.name);
    const data = entries.map((c: any) => c.total);
    _chartInstances.set(
        containerId,
        new Chart(canvas as HTMLCanvasElement, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: t('campaignCosts') || 'Campaign Costs',
                        data,
                        backgroundColor: COLORS.total,
                        borderColor: COLORS.totalBorder,
                        borderWidth: 1,
                    },
                ],
            },
            options: _barOptions(false, true),
        }),
    );
}
// ----------------------------------------------------------------
// LINE: CUMULATIVE COST OVER TIME
// ----------------------------------------------------------------
/** @param {string} containerId @param {any[]} timeline */
function renderCumulativeCostChart( containerId: any, timeline: any) {
    const canvas = document.getElementById(containerId);
    if (!canvas || timeline.length === 0) return;
    _destroyExisting(containerId);
    applyChartAccessibility(canvas as any, 'Cumulative costs over time (line chart)');
    const labels = timeline.map((t: any) => String(t.fiscalYear));
    const cumulativeData = timeline.map((t: any) => t.cumulative);
    const totalData = timeline.map((t: any) => t.total);
    _chartInstances.set(
        containerId,
        new Chart(canvas as HTMLCanvasElement, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: t('cumulative') || 'Cumulative',
                        data: cumulativeData,
                        borderColor: COLORS.cumulativeBorder,
                        backgroundColor: COLORS.cumulative,
                        fill: true,
                        tension: 0.3,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                    },
                    {
                        label: t('grandTotal') || 'Total / Year',
                        data: totalData,
                        borderColor: COLORS.totalBorder,
                        backgroundColor: 'transparent',
                        borderDash: [5, 3],
                        tension: 0.3,
                        pointRadius: 3,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx: any) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`,
                        },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { font: { size: 10 }, callback: (v: any) => _shortCurrency(v) },
                    },
                    x: { ticks: { font: { size: 10 } } },
                },
            },
        }),
    );
}
// ----------------------------------------------------------------
// PIE: COST BY COST CENTER
// ----------------------------------------------------------------
/** @param {string} containerId @param {Record<string,any>} byCostCenter */
function renderCostByCostCenterChart( containerId: any, byCostCenter: any) {
    const canvas = document.getElementById(containerId);
    if (!canvas) return;
    if (!byCostCenter || Object.keys(byCostCenter).length === 0) return;
    const entries = (Object.entries(byCostCenter) as [string, any][]).filter(([, d]) => d.total > 0);
    if (entries.length === 0) return;
    _destroyExisting(containerId);
    applyChartAccessibility(canvas as any, 'Cost by cost center (pie chart)');
    const labels = entries.map(([, d]: [string, any]) => d.name);
    const data = entries.map(([, d]: [string, any]) => d.total);
    const bgColors = entries.map((_: any, i: any) => FAMILY_PALETTE[i % FAMILY_PALETTE.length]);
    _chartInstances.set(
        containerId,
        new Chart(canvas as HTMLCanvasElement, {
            type: 'pie',
            data: {
                labels,
                datasets: [
                    {
                        data,
                        backgroundColor: bgColors,
                        borderWidth: 1,
                        borderColor: 'var(--bg-primary, #fff)',
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx: any) => `${ctx.label}: ${formatCurrency(ctx.raw)}`,
                        },
                    },
                },
            },
        }),
    );
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/** @param {string} containerId */
function _destroyExisting( containerId: any) {
    if (_chartInstances.has(containerId)) {
        _chartInstances.get(containerId).destroy();
        _chartInstances.delete(containerId);
    }
}
function _barOptions( stacked: any = false, horizontal: any = false) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? 'y' : 'x',
        plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
            tooltip: {
                callbacks: {
                    label: (ctx: any) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`,
                },
            },
        },
        scales: {
            x: {
                stacked,
                ticks: {
                    font: { size: 10 },
                    callback: horizontal ? (v: any) => _shortCurrency(v) : undefined,
                },
            },
            y: {
                stacked,
                beginAtZero: true,
                ticks: {
                    font: { size: 10 },
                    callback: horizontal ? undefined : (v: any) => _shortCurrency(v),
                },
            },
        },
    };
}
/** @param {number} value */
function _shortCurrency( value: any) {
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
    return String(value);
}
