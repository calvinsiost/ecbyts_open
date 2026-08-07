// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// GroupDashboardView - S4 SPEC_GROUP_VIEW_MODES
// KPI cards + distribuição por família (SVG inline) + grid de status.
// Reusa padrão visual dos widgets de analytics existentes.

import { escapeHtml } from '../../helpers/html.js';
import { t } from '../../i18n/translations.js';

const FAMILY_COLORS: Record<string,string> = {
    well: '#3b82f6',
    plume: '#ef4444',
    lake: '#06b6d4',
    river: '#06b6d4',
    spring: '#10b981',
    building: '#f59e0b',
    tank: '#f59e0b',
    waste: '#dc2626',
    boundary: '#10b981',
    remediation: '#8b5cf6',
};

/**
 * Render dashboard view into container.
 * @param {HTMLElement} container
 * @param {string} groupId
 * @param {Array<any>} elements
 */
export function renderGroupDashboardView(container: any, groupId: any, elements: any) {
    if (!container) return;
    container.innerHTML = '';
    container.className = 'group-view-content-host gvc-dashboard';

    const total = elements.length;

    // Count by family
    const byFamily: Record<string, number> = {};
    for (const el of elements) {
        const f = el.family || 'unknown';
        byFamily[f] = (byFamily[f] || 0) + 1;
    }
    const families = Object.entries(byFamily).sort((a, b) => b[1] - a[1]);

    // KPI cards row
    const kpiRow = document.createElement('div');
    kpiRow.className = 'gvc-dash-kpis';
    kpiRow.innerHTML = `
        ${_kpi(total, t('groupView.dashboard.total') || 'Elements', '#60a5fa')}
        ${_kpi(families.length, t('groupView.dashboard.families') || 'Families', '#34d399')}
        ${_kpi(_countObs(elements), t('groupView.dashboard.observations') || 'Observations', '#a78bfa')}
    `;
    container.appendChild(kpiRow);

    if (total === 0) {
        const empty = document.createElement('div');
        empty.className = 'gvc-empty';
        empty.textContent = t('groupView.dashboard.empty') || 'No elements in this group.';
        container.appendChild(empty);
        return;
    }

    if (families.length === 0) return;

    // Bar chart - family distribution
    const chartWrap = document.createElement('div');
    chartWrap.className = 'gvc-dash-chart';
    chartWrap.innerHTML = `<div class="gvc-dash-chart-title">${t('groupView.dashboard.distribution') || 'By Family'}</div>`;

    const bars = document.createElement('div');
    bars.className = 'gvc-dash-bars';

    for (const [fam, count] of families.slice(0, 8)) {
        const pct = Math.max(4, Math.round((count / total) * 100));
        const color = FAMILY_COLORS[fam] || '#94a3b8';
        const bar = document.createElement('div');
        bar.className = 'gvc-dash-bar-row';
        bar.innerHTML = `
            <span class="gvc-dash-bar-label">${escapeHtml(fam)}</span>
            <div class="gvc-dash-bar-track">
                <div class="gvc-dash-bar-fill" style="width:${pct}%;background:${color};"></div>
            </div>
            <span class="gvc-dash-bar-val">${count}</span>
        `;
        bars.appendChild(bar);
    }

    chartWrap.appendChild(bars);
    container.appendChild(chartWrap);
}

/**
 * @param {any} value
 * @param {any} label
 * @param {any} color
 */
function _kpi(value: any, label: any, color: any) {
    return `
        <div class="gvc-dash-kpi" style="border-top:2px solid ${color};">
            <div class="gvc-dash-kpi-val" style="color:${color};">${value}</div>
            <div class="gvc-dash-kpi-label">${escapeHtml(label)}</div>
        </div>
    `;
}

/** @param {any} elements */
function _countObs(elements: any) {
    let n = 0;
    for (const el of elements) {
        n += Array.isArray(el.data?.observations) ? el.data.observations.length : 0;
    }
    return n;
}
