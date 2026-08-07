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
   LOAD RENDERER — Resource load grid + allocation forecast chart
   Renderizador de carga de trabalho e previsao de alocacao.

   FEATURES:
   - Grid de recursos x periodos com load %
   - Toggle de granularidade (hora/dia/semana/mes/ano)
   - Barra TOTAL do time no rodape
   - Chart.js stacked bar de previsao de alocacao futura
   - Cores: verde (<=80%), amarelo (80-100%), vermelho (>100%)
   ================================================================ */

import {
    getProject,
    getResource,
    getAllocationsForResource,
    getAllocations,
    getResourceLoad,
    getTeamLoad,
} from '../governance/projectManager.js';
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { DATA_VIZ_PALETTE_EXTENDED } from './chartTheme.js';

declare const Chart: any;

// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------

/** @type {any} */
let _forecastChartInstance: any = null;

/** @type {string[]} Y9: Shared colorblind-safe palette */
const RESOURCE_COLORS = DATA_VIZ_PALETTE_EXTENDED;

/** @type {Object} Mapa de niveis para ordenacao (desc) */
const LEVEL_ORDER = {
    manager: 0,
    coordinator: 1,
    specialist: 2,
    senior: 3,
    mid: 4,
    junior: 5,
    trainee: 6,
    intern: 7,
};

// ----------------------------------------------------------------
// LOAD GRID
// ----------------------------------------------------------------

/**
 * Render the load grid for a project.
 * Renderiza grid de recursos x periodos com indicadores de carga.
 *
 * @param {string} projectId
 * @param {'hour'|'day'|'week'|'month'|'year'} granularity
 */
export function renderLoadGrid(projectId: any, granularity = 'week') {
    const container = document.getElementById('project-load-content');
    if (!container) return;

    injectLoadStyles();

    const project = getProject(projectId);
    if (!project) {
        container.innerHTML = `<div class="load-empty">${t('loadNoProject') || 'Project not found.'}</div>`;
        return;
    }

    // Coleta recursos do projeto (via alocacoes)
    const allAllocs = getAllocations();
    const projectAllocs = allAllocs.filter((/** @type {any} */ a: any) => a.projectId === projectId);
    const resourceIds = [...new Set(projectAllocs.map((/** @type {any} */ a: any) => a.resourceId))];

    if (resourceIds.length === 0) {
        container.innerHTML = `<div class="load-empty">${t('loadNoResources') || 'No resources allocated to this project.'}</div>`;
        return;
    }

    // Ordena recursos por nivel (gerente primeiro)
    const sortedResources = resourceIds
        .map((/** @type {any} */ id) => getResource(id))
        .filter(Boolean)
        .sort((/** @type {any} */ a, /** @type {any} */ b) => ((LEVEL_ORDER as Record<string, number>)[a.level] || 4) - ((LEVEL_ORDER as Record<string, number>)[b.level] || 4));

    // Range de datas do projeto
    const startDate = project.dates?.startDate || _getEarliestPhaseDate(project);
    const endDate = project.dates?.endDate || _getLatestPhaseDate(project);

    if (!startDate || !endDate) {
        container.innerHTML = `<div class="load-empty">${t('loadNoDates') || 'Set project dates to view load.'}</div>`;
        return;
    }

    // Calcula loads
    const resourceLoads = sortedResources.map((/** @type {any} */ res) => ({
        resource: res,
        load: getResourceLoad(res.id, startDate, endDate, granularity),
    }));

    // Periodos do header
    const periods = resourceLoads[0]?.load || [];
    if (periods.length === 0) {
        container.innerHTML = `<div class="load-empty">${t('loadNoPeriods') || 'No periods to display.'}</div>`;
        return;
    }

    // Team total
    const teamLoad = getTeamLoad(projectId, startDate, endDate, granularity);

    // Render
    let html = `<div class="load-grid-wrapper"><table class="load-grid-table">`;

    // Header
    html += `<thead><tr><th class="load-grid-resource">${t('loadResource') || 'Resource'}</th>`;
    for (const period of periods) {
        html += `<th class="load-grid-period">${escapeHtml(period.period)}</th>`;
    }
    html += `</tr></thead>`;

    // Body
    html += `<tbody>`;
    for (const { resource, load } of resourceLoads) {
        const levelLabel = t(`resourceLevel_${resource.level}`) || resource.level;
        html += `<tr><td class="load-grid-resource">
            <div class="load-res-name">${escapeHtml(resource.name)}</div>
            <div class="load-res-level">${levelLabel}</div>
        </td>`;

        for (const period of load) {
            const statusClass = _loadStatusClass(period.loadPct);
            // Encontra fases alocadas neste periodo
            const phaseNames = _getPhasesInPeriod(resource.id, projectId, period.start, period.end, project);
            html += `<td class="load-grid-cell ${statusClass}" title="${phaseNames || '-'}">
                <div class="load-cell-bar" style="width:${Math.min(period.loadPct, 100)}%"></div>
                <span class="load-cell-pct">${period.loadPct}%</span>
            </td>`;
        }
        html += `</tr>`;
    }

    // Total row
    html += `<tr class="load-grid-total"><td class="load-grid-resource"><strong>${t('loadTeamTotal') || 'TOTAL TEAM'}</strong></td>`;
    for (const period of teamLoad) {
        const statusClass = _loadStatusClass(period.loadPct);
        html += `<td class="load-grid-cell ${statusClass}">
            <div class="load-cell-bar" style="width:${Math.min(period.loadPct, 100)}%"></div>
            <span class="load-cell-pct">${period.allocated}/${period.capacity}h ${period.loadPct}%</span>
        </td>`;
    }
    html += `</tr>`;

    html += `</tbody></table></div>`;

    // Legenda de cores
    html += `<div class="load-legend">
        <span class="load-legend-item"><span class="load-legend-dot" style="background:#27ae60"></span> &#8804;80%</span>
        <span class="load-legend-item"><span class="load-legend-dot" style="background:#f39c12"></span> 80-100%</span>
        <span class="load-legend-item"><span class="load-legend-dot" style="background:#e74c3c"></span> &gt;100%</span>
    </div>`;

    container.innerHTML = html;
}

// ----------------------------------------------------------------
// ALLOCATION FORECAST CHART
// ----------------------------------------------------------------

/**
 * Render allocation forecast chart (Chart.js stacked bar).
 * Renderiza previsao de alocacao para os proximos 12 meses.
 *
 * @param {string} projectId
 */
export function renderAllocationForecast(projectId: any) {
    const canvas = document.getElementById('project-forecast-canvas');
    if (!canvas || typeof Chart === 'undefined') return;

    injectLoadStyles();

    // Destroy previous chart
    if (_forecastChartInstance) {
        _forecastChartInstance.destroy();
        _forecastChartInstance = null;
    }

    const allAllocs = getAllocations();
    const projectAllocs = allAllocs.filter((/** @type {any} */ a: any) => a.projectId === projectId);
    const resourceIds = [...new Set(projectAllocs.map((/** @type {any} */ a: any) => a.resourceId))];

    if (resourceIds.length === 0) return;

    // Proximos 12 meses
    const now = new Date();
    const months = [];
    for (let i = 0; i < 12; i++) {
        const m = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const mEnd = new Date(now.getFullYear(), now.getMonth() + i + 1, 0);
        months.push({
            label: `${m.toISOString().slice(0, 7)}`,
            start: m.toISOString().slice(0, 10),
            end: mEnd.toISOString().slice(0, 10),
        });
    }

    // Datasets: uma por recurso
    const datasets = [];
    let totalCapacityPerMonth = 0;

    for (let r = 0; r < resourceIds.length; r++) {
        const resource = getResource(resourceIds[r]);
        if (!resource) continue;

        const hoursPerMonth = (resource.hoursPerWeek || 0) * 4.33;
        totalCapacityPerMonth += hoursPerMonth;

        const data = months.map((/** @type {any} */ month) => {
            const resAllocs = getAllocationsForResource(resource.id, month.start, month.end);
            let hours = 0;
            for (const alloc of resAllocs) {
                if (alloc.projectId !== projectId) continue;
                // Dias uteis no mes sobrepostos com alocacao
                const overlapStart = alloc.startDate > month.start ? alloc.startDate : month.start;
                const overlapEnd = alloc.endDate < month.end ? alloc.endDate : month.end;
                if (overlapStart > overlapEnd) continue;
                const days = _businessDays(overlapStart, overlapEnd);
                hours += alloc.hoursPerDay * days;
            }
            return Math.round(hours);
        });

        datasets.push({
            label: resource.name,
            data,
            backgroundColor: RESOURCE_COLORS[r % RESOURCE_COLORS.length],
            stack: 'stack',
        });
    }

    const ctx = (canvas as HTMLCanvasElement).getContext('2d');
    _forecastChartInstance = new ((Chart as any))(ctx, {
        type: 'bar',
        data: {
            labels: months.map((/** @type {any} */ m) => m.label),
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                annotation:
                    totalCapacityPerMonth > 0
                        ? {
                              annotations: {
                                  capacityLine: {
                                      type: 'line',
                                      yMin: totalCapacityPerMonth,
                                      yMax: totalCapacityPerMonth,
                                      borderColor: '#e74c3c',
                                      borderWidth: 2,
                                      borderDash: [5, 5],
                                      label: {
                                          display: true,
                                          content: `${t('loadCapacity') || 'Capacity'}: ${Math.round(totalCapacityPerMonth)}h`,
                                          position: 'end',
                                          font: { size: 10 },
                                      },
                                  },
                              },
                          }
                        : {},
            },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, beginAtZero: true, title: { display: true, text: t('hours') || 'Hours' } },
            },
        },
    });
}

/**
 * Destroy forecast chart.
 */
export function destroyForecastChart() {
    if (_forecastChartInstance) {
        _forecastChartInstance.destroy();
        _forecastChartInstance = null;
    }
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

/** @param {number} pct */
function _loadStatusClass(pct: any) {
    if (pct > 100) return 'load-over';
    if (pct > 80) return 'load-warn';
    return 'load-ok';
}

/**
 * @param {string} resourceId
 * @param {string} projectId
 * @param {string} periodStart
 * @param {string} periodEnd
 * @param {any} project
 */
function _getPhasesInPeriod(resourceId: any, projectId: any, periodStart: any, periodEnd: any, project: any) {
    const allAllocs = getAllocations();
    const matching = allAllocs.filter(
        (/** @type {any} */ a: any) => a.resourceId === resourceId &&
        a.projectId === projectId &&
        a.startDate <= periodEnd &&
        a.endDate >= periodStart,
    );

    return matching
        .map((/** @type {any} */ a: any) => {
            const phase = project.phases.find((/** @type {any} */ p: any) => p.id === a.phaseId);
            return phase ? phase.name : '?';
        })
        .join(', ');
}

/** @param {any} project */
function _getEarliestPhaseDate(project: any) {
    let earliest = null;
    for (const phase of project.phases) {
        if (phase.startDate && (!earliest || phase.startDate < earliest)) {
            earliest = phase.startDate;
        }
    }
    return earliest;
}

/** @param {any} project */
function _getLatestPhaseDate(project: any) {
    let latest = null;
    for (const phase of project.phases) {
        if (phase.endDate && (!latest || phase.endDate > latest)) {
            latest = phase.endDate;
        }
    }
    return latest;
}

/** @param {string} start @param {string} end */
function _businessDays(start: any, end: any) {
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    let days = 0;
    const current = new Date(s);
    while (current <= e) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) days++;
        current.setDate(current.getDate() + 1);
    }
    return Math.max(days, 1);
}

// ----------------------------------------------------------------
// STYLES
// ----------------------------------------------------------------

/**
 * Inject load renderer CSS styles.
 */
export function injectLoadStyles() {
    if (document.getElementById('load-styles')) return;

    const style = document.createElement('style');
    style.id = 'load-styles';
    style.textContent = `
        .load-empty { text-align: center; padding: 2rem; color: var(--text-secondary); font-size: 0.9rem; }

        .load-grid-wrapper { overflow-x: auto; overflow-y: auto; max-height: 400px; }
        .load-grid-table {
            width: 100%; border-collapse: collapse; font-size: 0.78rem;
            font-family: var(--font-mono, 'Consolas', monospace);
        }
        .load-grid-table thead th {
            position: sticky; top: 0; background: var(--bg-primary, #fff);
            border-bottom: 2px solid var(--border-color, #ddd); padding: 4px 6px;
            font-weight: 600; font-size: 0.7rem; text-align: center; z-index: 2;
            white-space: nowrap;
        }
        .load-grid-resource {
            position: sticky; left: 0; background: var(--bg-primary, #fff);
            min-width: 120px; max-width: 160px; padding: 4px 8px; z-index: 3;
            border-right: 1px solid var(--border-color, #ddd);
        }
        .load-res-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .load-res-level { font-size: 0.65rem; color: var(--text-secondary); }

        .load-grid-cell {
            position: relative; text-align: center; padding: 2px 4px; min-width: 60px;
            border: 1px solid var(--border-color, #f0f0f0);
        }
        .load-cell-bar {
            position: absolute; top: 0; left: 0; height: 100%; opacity: 0.2;
            transition: width 0.3s;
        }
        .load-cell-pct { position: relative; z-index: 1; font-size: 0.7rem; }

        .load-ok .load-cell-bar { background: #27ae60; }
        .load-warn .load-cell-bar { background: #f39c12; }
        .load-over .load-cell-bar { background: #e74c3c; }
        .load-ok { color: #27ae60; }
        .load-warn { color: #e67e22; }
        .load-over { color: #e74c3c; font-weight: 600; }

        .load-grid-total td {
            border-top: 2px solid var(--border-color, #aaa); font-weight: 600;
        }
        .load-grid-period { white-space: nowrap; }

        .load-legend {
            display: flex; gap: 1rem; padding: 0.4rem 0.5rem; font-size: 0.75rem;
            color: var(--text-secondary); justify-content: center;
        }
        .load-legend-item { display: flex; align-items: center; gap: 0.3rem; }
        .load-legend-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

        /* Dark theme */
        [data-theme="dark"] .load-grid-resource { background: var(--bg-primary, #1a1a2e); }
        [data-theme="dark"] .load-grid-table thead th { background: var(--bg-primary, #1a1a2e); }
    `;
    document.head.appendChild(style);
}
