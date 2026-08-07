// @ts-check
// Generated from src/app/js/utils/ui/chartUncertainty.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   UNC-STRUCTURAL-001 gap #13 — error bars for Chart.js

   Drop-in helper that adds error-bar overlays to any Chart.js chart
   when the global "Mostrar incertezas" toggle is ON. Does not require
   the chartjs-chart-error-bars plugin — renders error-bar datasets
   as thin additional series using Chart.js native lines with
   pointStyle 'line'.

   Usage (inside a chart-building module):
     import { attachErrorBars } from '../ui/chartUncertainty.js';
     const chart = new Chart(ctx, config);
     attachErrorBars(chart, { values, uncertainties });

   When toggle is OFF, attach is a no-op.
   ================================================================ */
/**
 * True when user enabled "Mostrar incertezas em todas as telas".
 */
export function isShowUncertaintyEnabled() {
    try {
        return document?.documentElement?.dataset?.ecbytsShowU === '1';
    } catch {
        return false;
    }
}
/**
 * Attach error bars to an existing Chart.js chart.
 * Renders 3 thin additional datasets: upper bound, lower bound, whiskers.
 *
 * @param {Record<string, any>} chart - Chart.js instance
 * @param {object} params
 * @param {number[]} params.values             same length as chart data
 * @param {number[]|number[][]} params.uncertainties  U_expanded per point
 *                                              (scalar → ±U; pair → [lo, hi])
 * @param {number} [params.k]                coverage factor if scalar
 * @param {string} [params.color]    error bar color
 * @returns {() => void} detach function
 */
export function attachErrorBars(
    chart: any,
    { values, uncertainties, k = 2, color = '#f59e0b' }: any = {},
) {
    if (!isShowUncertaintyEnabled()) return () => {};
    if (!chart || !chart.data || !Array.isArray(chart.data.datasets)) return () => {};
    if (!Array.isArray(values) || !Array.isArray(uncertainties)) return () => {};
    const upper = values.map((v: any, i: any) => _upperOf(v, uncertainties[i], k));
    const lower = values.map((v: any, i: any) => _lowerOf(v, uncertainties[i], k));
    const errorUpper = {
        type: 'line',
        label: 'U superior (IC 95%)',
        data: upper,
        borderColor: color,
        borderWidth: 1,
        borderDash: [4, 2],
        pointRadius: 0,
        fill: false,
        _isUncertaintyBand: true,
    };
    const errorLower = {
        type: 'line',
        label: 'U inferior (IC 95%)',
        data: lower,
        borderColor: color,
        borderWidth: 1,
        borderDash: [4, 2],
        pointRadius: 0,
        fill: '-1',
        backgroundColor: _withAlpha(color, 0.08),
        _isUncertaintyBand: true,
    };
    chart.data.datasets.push(errorUpper, errorLower);
    try {
        chart.update();
    } catch (err: any) {
        console.debug('[chart-uncertainty] update failed:', /** @type {Error} */ (err)?.message);
    }
    return function detach() {
        chart.data.datasets = chart.data.datasets.filter((ds: any) => !ds._isUncertaintyBand);
        try {
            chart.update();
        } catch (e: any) {
            console.debug('[chartUncertainty] chartUpdate:', /** @type {Error} */ (e)?.message || e);
        }
    };
}
function _upperOf(v: any, u: any, k: any) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (Array.isArray(u)) return n + (Number(u[1]) || 0);
    const un = Number(u);
    return Number.isFinite(un) ? n + un * k : n;
}
function _lowerOf(v: any, u: any, k: any) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (Array.isArray(u)) return n - (Number(u[0]) || 0);
    const un = Number(u);
    return Number.isFinite(un) ? n - un * k : n;
}
function _withAlpha(hex: any, a: any) {
    if (!hex?.startsWith('#') || hex.length !== 7) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}
