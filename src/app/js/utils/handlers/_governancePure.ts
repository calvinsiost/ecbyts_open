// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave OOOO1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P1).
//
// Strategy: extract DOM-free WBS parsing + sensitivity + diff from
// handlers/governance.js (#18 monolito 1284 LOC). Pure: zero document/window.

/**
 * Numeric WBS field keys (require parseFloat coercion).
 */
export const NUMERIC_WBS_FIELDS: ReadonlySet<string> = Object.freeze(
    new Set(['cost', 'weight', 'percentComplete']),
);

/**
 * Parse WBS field value based on key type (numeric fields → parseFloat, others → raw).
 * Frozen set of numeric keys garante consistência.
 *
 * @param {string} key
 * @param {any} raw
 * @returns {any}
 */
export function parseWbsField(key: any, raw: any): any {
    if (typeof key !== 'string') return raw;
    if (NUMERIC_WBS_FIELDS.has(key)) {
        const n = parseFloat(raw);
        return Number.isFinite(n) ? n : 0;
    }
    return raw;
}

/**
 * Compute sensitivity ranking from optimization result.
 * score = infoGain - residualRisk - normalizedCost; top 5 ranked desc.
 *
 * @param {{selected?:Array<{id?:string, infoGain?:number, residualRisk?:number, normalizedCost?:number}>}|null|undefined} optimization
 * @returns {{topDrivers:Array<{id:string, score:number}>}}
 */
export function computeOptimizationSensitivity(optimization: any): { topDrivers: Array<{ id: string; score: number }> } {
    if (!optimization || typeof optimization !== 'object') return { topDrivers: [] };
    const selected = Array.isArray(optimization.selected) ? optimization.selected : [];
    const ranked = selected
        .map((c: any) => {
            const info = Number(c?.infoGain);
            const risk = Number(c?.residualRisk);
            const cost = Number(c?.normalizedCost);
            const safeInfo = Number.isFinite(info) ? info : 0;
            const safeRisk = Number.isFinite(risk) ? risk : 0;
            const safeCost = Number.isFinite(cost) ? cost : 0;
            return {
                id: c?.id || 'unknown',
                score: Number((safeInfo - safeRisk - safeCost).toFixed(4)),
            };
        })
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 5);
    return { topDrivers: ranked };
}

/**
 * Compute diff between two governance results (action change + selected count delta).
 *
 * @param {{decision?:{action?:string}, optimization?:{selected?:any[]}}|null|undefined} prev
 * @param {{decision?:{action?:string}, optimization?:{selected?:any[]}}|null|undefined} current
 * @returns {{decisionActionChanged:boolean, decision:{before:string|null, after:string|null}, selectedCountDelta:number}}
 */
export function computeGovernanceResultDiff(
    prev: any,
    current: any,
): {
    decisionActionChanged: boolean;
    decision: { before: string | null; after: string | null };
    selectedCountDelta: number;
} {
    const prevAction = prev?.decision?.action || null;
    const currAction = current?.decision?.action || null;
    const prevSelected = Array.isArray(prev?.optimization?.selected) ? prev.optimization.selected.length : 0;
    const currSelected = Array.isArray(current?.optimization?.selected) ? current.optimization.selected.length : 0;
    return {
        decisionActionChanged: prevAction !== currAction,
        decision: { before: prevAction, after: currAction },
        selectedCountDelta: currSelected - prevSelected,
    };
}

/**
 * Check if key is a numeric WBS field (requires parseFloat).
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isNumericWbsField(key: any): boolean {
    if (typeof key !== 'string') return false;
    return NUMERIC_WBS_FIELDS.has(key);
}
