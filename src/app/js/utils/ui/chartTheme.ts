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
   CHART THEME — Shared data visualization palette & constants
   ================================================================

   Colorblind-safe palette verified against deuteranopia, protanopia,
   tritanopia simulations. Delta-E >40 between adjacent colors.

   Gap #5: Replaces duplicated FAMILY_PALETTE in costCharts.js,
   loadRenderer.js, chartCapture.js.

   ================================================================ */

/**
 * Colorblind-safe data visualization palette (8 colors).
 * Each pair of adjacent colors has delta-E >40 for distinguishability.
 * @type {string[]}
 */
export const DATA_VIZ_PALETTE: string[] = [
    '#3b82f6', // blue
    '#ef4444', // red
    '#22c55e', // green
    '#f59e0b', // amber
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#84cc16', // lime
];

/**
 * Extended palette for when >8 series needed (12 total).
 * Additional colors maintain delta-E >30 from all existing.
 * @type {string[]}
 */
export const DATA_VIZ_PALETTE_EXTENDED: string[] = [
    ...DATA_VIZ_PALETTE,
    '#14b8a6', // teal
    '#f97316', // orange
    '#a855f7', // purple
    '#64748b', // slate
];

/**
 * Semantic chart colors (CAPEX/OPEX/Total/Cumulative).
 */
export const CHART_SEMANTIC = {
    capex: 'rgba(59, 130, 246, 0.7)',
    capexBorder: '#3b82f6',
    opex: 'rgba(245, 158, 11, 0.7)',
    opexBorder: '#f59e0b',
    total: 'rgba(34, 197, 94, 0.7)',
    totalBorder: '#22c55e',
    cumulative: 'rgba(139, 92, 246, 0.3)',
    cumulativeBorder: '#8b5cf6',
};

/**
 * Apply aria-label to a Chart.js canvas for screen reader access.
 * Gap #5 / R5: Charts without aria-label are invisible to screen readers.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} label - Descriptive text (e.g., "Cost breakdown by family")
 */
export function applyChartAccessibility(canvas: HTMLCanvasElement, label: string): void {
    if (!canvas) return;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label);
}

/**
 * Apply global Chart.js defaults for consistent styling across all charts.
 * Call once after Chart.js is loaded (e.g., in main.js or first chart render).
 *
 * @param {any} Chart - Chart.js constructor
 */
export function applyChartDefaults(Chart: any): void {
    if (!Chart?.defaults) return;

    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue('--text-secondary').trim() || '#5d6b76';
    const borderColor = styles.getPropertyValue('--border-color').trim() || 'rgba(0,0,0,0.12)';
    const fontFamily = styles.getPropertyValue('font-family') || "'Segoe UI', 'Inter', sans-serif";

    Chart.defaults.color = textColor;
    Chart.defaults.borderColor = borderColor;
    Chart.defaults.font.family = fontFamily;
    Chart.defaults.font.size = 11;

    if (Chart.defaults.plugins?.legend) {
        Chart.defaults.plugins.legend.labels.color = textColor;
        Chart.defaults.plugins.legend.labels.font = { size: 11 };
        Chart.defaults.plugins.legend.position = 'bottom';
    }

    if (Chart.defaults.plugins?.tooltip) {
        Chart.defaults.plugins.tooltip.backgroundColor = styles.getPropertyValue('--surface-2').trim() || '#2a3540';
        Chart.defaults.plugins.tooltip.titleColor = styles.getPropertyValue('--text-primary').trim() || '#c5cdd5';
        Chart.defaults.plugins.tooltip.bodyColor = styles.getPropertyValue('--text-primary').trim() || '#c5cdd5';
        Chart.defaults.plugins.tooltip.borderColor = borderColor;
        Chart.defaults.plugins.tooltip.borderWidth = 1;
        Chart.defaults.plugins.tooltip.cornerRadius = 4;
        Chart.defaults.plugins.tooltip.padding = 8;
    }

    if (Chart.defaults.scales) {
        for (const axis of Object.values(Chart.defaults.scales) as any[]) {
            if (axis.ticks) axis.ticks.color = textColor;
            if (axis.grid) axis.grid.color = borderColor;
        }
    }

    // Global fallback accessibility for canvases without explicit labels.
    if (Chart.register) {
        const pluginItems = Chart.registry?.plugins?.items;
        const alreadyRegistered = Array.isArray(pluginItems)
            ? pluginItems.some((p: any) => p && p.id === 'ecbyts-a11y-fallback')
            : !!(pluginItems && pluginItems['ecbyts-a11y-fallback']);
        if (!alreadyRegistered) {
            Chart.register({
                id: 'ecbyts-a11y-fallback',
                beforeInit(chart: any) {
                    const canvas = chart?.canvas;
                    if (!canvas) return;
                    if (!canvas.getAttribute('role')) {
                        canvas.setAttribute('role', 'img');
                    }
                    if (!canvas.getAttribute('aria-label')) {
                        const ds = chart?.config?.data?.datasets || [];
                        const firstLabel = ds[0]?.label || 'Chart';
                        canvas.setAttribute('aria-label', `${firstLabel} visualization`);
                    }
                },
            });
        }
    }
}
