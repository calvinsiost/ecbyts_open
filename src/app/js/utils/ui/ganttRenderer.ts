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
// @ts-check

/* ================================================================
   GANTT RENDERER — HTML/CSS Gantt chart with SVG dependencies
   Renderizador de Gantt com barras posicionadas, milestones,
   setas SVG de dependencia e caminho critico.

   FEATURES:
   - Barras horizontais posicionadas por data (left% / width%)
   - Milestones renderizados como losango
   - Setas SVG para dependencias finish-to-start
   - Caminho critico destacado em vermelho
   - Secao de vinculados (contratos, WBS, MAC measures)
   - Dark theme via custom properties
   ================================================================ */

import { getProject, calculateCriticalPath } from '../governance/projectManager.js';
import { getContract } from '../governance/contractManager.js';
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';

// ----------------------------------------------------------------
// MAIN RENDER
// ----------------------------------------------------------------

/**
 * Render the Gantt chart for a project.
 * Renderiza o cronograma Gantt no container do modal.
 *
 * @param {string} projectId
 */
export function renderProjectGantt(projectId: any) {
    const container = document.getElementById('project-gantt-content');
    if (!container) return;

    injectGanttStyles();

    const project = getProject(projectId);
    const phases = project?.phases || [];
    if (!project || phases.length === 0) {
        container.innerHTML = `<div class="gantt-empty">${t('ganttNoPhases') || 'No phases to display. Add phases to the project first.'}</div>`;
        return;
    }

    const criticalSet = calculateCriticalPath(projectId);
    const { minDate, maxDate, totalDays } = _getDateRange(project);

    if (totalDays <= 0) {
        container.innerHTML = `<div class="gantt-empty">${t('ganttNoDates') || 'Set start/end dates on phases to display the Gantt chart.'}</div>`;
        return;
    }

    // Gera header de meses
    const months = _generateMonthHeaders(minDate, maxDate);
    const monthHeaders = months
        .map(
            (m: any) =>
                `<div class="gantt-month" style="left:${m.leftPct}%;width:${m.widthPct}%">${m.label}</div>`,
        )
        .join('');

    // Gera barras de fases
    const phaseRows = phases
        .map((phase: any, idx: any) => {
            const isCritical = criticalSet.has(phase.id);
            return _renderPhaseRow(phase, idx, minDate, totalDays, isCritical);
        })
        .join('');

    // SVG de dependencias (dentro do scrollable)
    const svgArrows = _renderDependencyArrows(phases, minDate, totalDays);

    // Vinculados
    const linkedSection = _renderLinkedSection(project);

    container.innerHTML = `
        <div class="gantt-wrapper">
            <div class="gantt-header">
                <div class="gantt-label-col">${t('ganttPhase') || 'Phase'}</div>
                <div class="gantt-timeline-col">
                    <div class="gantt-months">${monthHeaders}</div>
                </div>
            </div>
            <div class="gantt-body">
                <div class="gantt-rows-area">
                    ${phaseRows}
                    <svg class="gantt-svg-overlay" xmlns="http://www.w3.org/2000/svg">
                        ${svgArrows}
                    </svg>
                </div>
            </div>
            <div class="gantt-legend">
                <span class="gantt-legend-item"><span class="gantt-legend-bar gantt-legend-normal"></span> ${t('ganttNormal') || 'Normal'}</span>
                <span class="gantt-legend-item"><span class="gantt-legend-bar gantt-legend-critical"></span> ${t('ganttCritical') || 'Critical'}</span>
                <span class="gantt-legend-item"><span class="gantt-legend-milestone">&#9670;</span> ${t('ganttMilestone') || 'Milestone'}</span>
                <span class="gantt-legend-item"><span class="gantt-legend-arrow">&#8594;</span> ${t('ganttDependency') || 'Dependency'}</span>
            </div>
            ${linkedSection}
        </div>`;
}

// ----------------------------------------------------------------
// PHASE ROW RENDERING
// ----------------------------------------------------------------

function _renderPhaseRow(
    phase: any,
    index: any,
    minDate: any,
    totalDays: any,
    isCritical: any,
) {
    if (phase.isMilestone) {
        return _renderMilestoneRow(phase, index, minDate, totalDays, isCritical);
    }

    const leftPct = _dateToPct(phase.startDate, minDate, totalDays);
    const widthPct = _dateRangeToPct(phase.startDate, phase.endDate, minDate, totalDays);
    const pct = phase.percentComplete || 0;
    const criticalClass = isCritical ? ' gantt-bar-critical' : '';

    return `
        <div class="gantt-row" data-phase-id="${phase.id}" data-row-index="${index}">
            <div class="gantt-label-col gantt-phase-name" title="${escapeHtml(phase.name)}">
                ${escapeHtml(phase.name)}
            </div>
            <div class="gantt-timeline-col">
                <div class="gantt-bar${criticalClass}" style="left:${leftPct}%;width:${widthPct}%;background:${phase.color || '#3b6bff'}">
                    <div class="gantt-bar-progress" style="width:${pct}%"></div>
                    <span class="gantt-bar-label">${pct}%</span>
                </div>
            </div>
        </div>`;
}

function _renderMilestoneRow(
    phase: any,
    index: any,
    minDate: any,
    totalDays: any,
    isCritical: any,
) {
    const leftPct = _dateToPct(phase.startDate, minDate, totalDays);
    const criticalClass = isCritical ? ' gantt-milestone-critical' : '';

    return `
        <div class="gantt-row" data-phase-id="${phase.id}" data-row-index="${index}">
            <div class="gantt-label-col gantt-phase-name" title="${escapeHtml(phase.name)}">
                &#9670; ${escapeHtml(phase.name)}
            </div>
            <div class="gantt-timeline-col">
                <div class="gantt-milestone${criticalClass}" style="left:${leftPct}%">
                    &#9670;
                </div>
            </div>
        </div>`;
}

// ----------------------------------------------------------------
// DEPENDENCY ARROWS (SVG)
// ----------------------------------------------------------------

function _renderDependencyArrows(phases: any, minDate: any, totalDays: any) {
    const ROW_HEIGHT = 32;
    let arrows = '';

    for (let i = 0; i < phases.length; i++) {
        const phase = phases[i];
        for (const depId of phase.dependencies) {
            const depIdx = phases.findIndex((p: any) => p.id === depId);
            if (depIdx === -1) continue;

            const depPhase = phases[depIdx];
            // Fim da predecessora (end date)
            const fromPct = _dateToPct(depPhase.endDate || depPhase.startDate, minDate, totalDays);
            // Inicio da fase dependente
            const toPct = _dateToPct(phase.startDate, minDate, totalDays);

            const fromY = depIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
            const toY = i * ROW_HEIGHT + ROW_HEIGHT / 2;

            // Coordenadas como % do container; usamos viewBox percentual
            arrows += `
                <line
                    x1="${fromPct}%" y1="${fromY}"
                    x2="${toPct}%" y2="${toY}"
                    class="gantt-dep-arrow"
                    marker-end="url(#gantt-arrowhead)"
                />`;
        }
    }

    if (!arrows) return '';

    const _totalHeight = phases.length * ROW_HEIGHT;

    return `
        <defs>
            <marker id="gantt-arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--text-secondary, #888)" />
            </marker>
        </defs>
        ${arrows}`;
}

// ----------------------------------------------------------------
// LINKED SECTION
// ----------------------------------------------------------------

function _renderLinkedSection(project: any) {
    const parts = [];

    if (project.linkedContractIds.length > 0) {
        const names = project.linkedContractIds
            .map((cid: any) => {
                const c = (getContract(cid) as any);
                return c ? escapeHtml(c.name) : cid;
            })
            .join(', ');
        parts.push(`<div><strong>${t('contracts') || 'Contracts'}:</strong> ${names}</div>`);
    }

    if (project.linkedWbsRootIds.length > 0) {
        parts.push(
            `<div><strong>${t('wbs') || 'WBS'}:</strong> ${project.linkedWbsRootIds.length} ${t('items') || 'items'}</div>`,
        );
    }

    if (project.linkedMacMeasureIds.length > 0) {
        parts.push(
            `<div><strong>${t('macMeasures') || 'MAC Measures'}:</strong> ${project.linkedMacMeasureIds.length} ${t('measures') || 'measures'}</div>`,
        );
    }

    if (project.linkedCampaignIds.length > 0) {
        parts.push(`<div><strong>${t('campaigns') || 'Campaigns'}:</strong> ${project.linkedCampaignIds.length}</div>`);
    }

    if (parts.length === 0) return '';

    return `
        <div class="gantt-linked">
            <div class="gantt-linked-title">${t('ganttLinked') || 'Linked'}</div>
            ${parts.join('')}
        </div>`;
}

// ----------------------------------------------------------------
// DATE HELPERS
// ----------------------------------------------------------------

function _getDateRange(project: any) {
    /** @type {Date | null} */
    let min = null;
    /** @type {Date | null} */
    let max = null;

    for (const phase of project.phases) {
        if (phase.startDate) {
            const d = new Date(phase.startDate);
            if (!min || d < min) min = d;
        }
        if (phase.endDate) {
            const d = new Date(phase.endDate);
            if (!max || d > max) max = d;
        }
        if (phase.isMilestone && phase.startDate) {
            const d = new Date(phase.startDate);
            if (!max || d > max) max = d;
        }
    }

    if (!min || !max) return { minDate: new Date(), maxDate: new Date(), totalDays: 0 };

    // Adiciona margem de 5% em cada lado
    const range = max.getTime() - min.getTime();
    const margin = Math.max(range * 0.05, 86400000 * 7);
    min = new Date(min.getTime() - margin);
    max = new Date(max.getTime() + margin);

    const totalDays = Math.ceil((max.getTime() - min.getTime()) / 86400000);
    return { minDate: min, maxDate: max, totalDays };
}

function _dateToPct(dateStr: any, minDate: any, totalDays: any) {
    if (!dateStr || totalDays <= 0) return 0;
    const d = new Date(dateStr);
    const days = (d.getTime() - new Date(minDate).getTime()) / 86400000;
    return Math.max(0, Math.min(100, (days / totalDays) * 100));
}

function _dateRangeToPct(
    startStr: any,
    endStr: any,
    minDate: any,
    totalDays: any,
) {
    if (!startStr || !endStr || totalDays <= 0) return 2; // min 2% para visibilidade
    const start = new Date(startStr);
    const end = new Date(endStr);
    const days = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
    return Math.max(2, (days / totalDays) * 100);
}

function _generateMonthHeaders(minDate: any, maxDate: any) {
    /** @type {Array<any>} */
    const months: any = [];
    const totalMs = new Date(maxDate).getTime() - new Date(minDate).getTime();
    if (totalMs <= 0) return months;

    let current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);

    while (current <= maxDate) {
        const monthStart = current < minDate ? minDate : current;
        const nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        const monthEnd = nextMonth > maxDate ? maxDate : nextMonth;

        const leftPct = ((monthStart - minDate) / totalMs) * 100;
        const widthPct = ((monthEnd - monthStart) / totalMs) * 100;

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const label = `${monthNames[current.getMonth()]} ${current.getFullYear()}`;

        if (widthPct > 0.5) {
            months.push({ leftPct, widthPct, label });
        }

        current = nextMonth;
    }

    return months;
}

// ----------------------------------------------------------------
// STYLES
// ----------------------------------------------------------------

/**
 * Inject Gantt CSS styles.
 * Injeta estilos CSS do Gantt com dark theme.
 */
export function injectGanttStyles() {
    if (document.getElementById('gantt-styles')) return;

    const style = document.createElement('style');
    style.id = 'gantt-styles';
    style.textContent = `
        .gantt-wrapper { width: 100%; overflow: hidden; }
        .gantt-empty { text-align: center; padding: 2rem; color: var(--text-secondary); font-size: 0.9rem; }

        .gantt-header {
            display: flex; border-bottom: 2px solid var(--border-color, #ddd);
            font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);
        }
        .gantt-label-col { width: 140px; min-width: 140px; padding: 4px 8px; flex-shrink: 0; }
        .gantt-timeline-col { flex: 1; position: relative; min-height: 24px; overflow: hidden; }
        .gantt-months { position: relative; height: 24px; }
        .gantt-month {
            position: absolute; top: 0; height: 100%; display: flex; align-items: center;
            justify-content: center; border-left: 1px solid var(--border-color, #eee);
            font-size: 0.7rem; color: var(--text-secondary); box-sizing: border-box;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        .gantt-body { overflow-x: auto; overflow-y: visible; }
        .gantt-rows-area { position: relative; min-height: 40px; }

        .gantt-row {
            display: flex; align-items: center; height: 32px;
            border-bottom: 1px solid var(--border-color, #f0f0f0);
        }
        .gantt-phase-name {
            font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        .gantt-bar {
            position: absolute; height: 18px; border-radius: 3px; top: 50%; transform: translateY(-50%);
            display: flex; align-items: center; overflow: hidden; cursor: default;
            box-shadow: 0 1px 2px rgba(0,0,0,0.15); transition: box-shadow 0.2s;
        }
        .gantt-bar:hover { box-shadow: 0 2px 6px rgba(0,0,0,0.25); }
        .gantt-bar-critical { border: 2px solid #e74c3c; box-shadow: 0 0 4px rgba(231,76,60,0.4); }
        .gantt-bar-progress {
            height: 100%; background: rgba(255,255,255,0.35); border-radius: 3px 0 0 3px;
        }
        .gantt-bar-label {
            position: absolute; right: 4px; font-size: 0.65rem; color: #fff;
            text-shadow: 0 1px 1px rgba(0,0,0,0.4);
        }

        .gantt-milestone {
            position: absolute; top: 50%; transform: translate(-50%, -50%);
            font-size: 1.1rem; color: #f39c12; cursor: default;
        }
        .gantt-milestone-critical { color: #e74c3c; }

        .gantt-svg-overlay {
            position: absolute; top: 0; left: 140px; right: 0; height: 100%;
            pointer-events: none; overflow: visible;
        }
        .gantt-dep-arrow {
            stroke: var(--text-secondary, #888); stroke-width: 1.5; fill: none;
        }

        .gantt-legend {
            display: flex; gap: 1rem; padding: 8px; font-size: 0.75rem;
            color: var(--text-secondary); border-top: 1px solid var(--border-color, #eee);
            flex-wrap: wrap;
        }
        .gantt-legend-item { display: flex; align-items: center; gap: 4px; }
        .gantt-legend-bar {
            display: inline-block; width: 20px; height: 8px; border-radius: 2px;
        }
        .gantt-legend-normal { background: #3b6bff; }
        .gantt-legend-critical { background: #e74c3c; border: 1px solid #c0392b; }
        .gantt-legend-milestone { color: #f39c12; font-size: 0.9rem; }
        .gantt-legend-arrow { font-size: 0.9rem; }

        .gantt-linked {
            padding: 8px; font-size: 0.8rem; border-top: 1px solid var(--border-color, #eee);
        }
        .gantt-linked-title { font-weight: 600; margin-bottom: 4px; }
        .gantt-linked div { margin-bottom: 2px; }

        /* Dark theme */
        [data-theme="dark"] .gantt-bar-progress { background: rgba(0,0,0,0.25); }
        [data-theme="dark"] .gantt-bar-label { color: #eee; }
        [data-theme="dark"] .gantt-dep-arrow { stroke: #999; }
    `;
    document.head.appendChild(style);
}
