// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave BBBB1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P1+P2).
//
// Strategy: extract DOM-free formatters + label resolvers from utils/ui/governancePanel.js
// (1619 LOC, no TS twin, safe target).
// Pure: zero document/window/state refs. Deterministic given inputs.

/**
 * Format value as Brazilian Real currency (locale pt-BR).
 *
 * @param {number|null|undefined} value
 * @returns {string}
 */
export function formatCurrencyBRL(value: any) {
    const n = Number.isFinite(Number(value)) ? Number(value) : 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Resolve contract type to human label. Caller injects translator `t`.
 *
 * @param {string} type
 * @param {(key:string)=>string} t
 * @returns {string}
 */
export function resolveContractTypeLabel(type: any, t: any) {
    const labels = {
        remediation: 'Remediation',
        monitoring: 'Monitoring',
        investigation: 'Investigation',
        insurance: (t && t('insuranceContracts')) || 'Insurance',
        custom: 'Custom',
    };
    return (labels as any)[type] || type || '';
}

/**
 * Compute distinct resource count for given project from allocations array.
 * Pure: zero state access. Caller provides allocations + projectId.
 *
 * @param {Array<{projectId:string, resourceId:string}>} allocations
 * @param {string} allocations
 * @returns {number}
 */
export function countProjectResources(allocations: any, projectId: any) {
    if (!Array.isArray(allocations)) return 0;
    const resourceIds = new Set();
    for (const a of allocations) {
        if (a?.projectId === projectId && a?.resourceId != null) {
            resourceIds.add(a.resourceId);
        }
    }
    return resourceIds.size;
}

/**
 * Filter WBS leaf items (no children in the tree).
 * Pure: deterministic from input items array.
 *
 * @param {Array<{id:string, parentId?:string|null}>} items
 * @returns {Array<{id:string, parentId?:string|null}>}
 */
export function filterWbsLeaves(items: any) {
    if (!Array.isArray(items)) return [];
    const parentIds = new Set(
        items.filter((i: any) => i?.parentId != null).map((i: any) => i.parentId)
    );
    return items.filter((i: any) => i?.id != null && !parentIds.has(i.id));
}

/**
 * Default fallback translator for tests/standalone.
 *
 * @param {string} _key
 * @returns {string}
 */
export function fallbackTranslator(_key: any) {
    return '';
}
