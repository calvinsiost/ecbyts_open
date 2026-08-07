// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Node Attribute Aggregator - Phase 1.43 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S43
 *
 * Phase 1.43 (2026-05-02) - pure-logic agregação de atributos numéricos
 * por grupo de nodes. Suporta sum, mean, min, max, count, stddev.
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Operações canônicas. */
export const AGG_OPS = Object.freeze(['sum', 'mean', 'min', 'max', 'count', 'stddev']);

/** Identidade do módulo. */
export const AGGREGATOR_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.43',
    deliveredAt: '2026-05-02',
});

/**
 * Verifica op canônica.
 * @param {*} op
 * @returns {boolean}
 */
export function isValidOp(op: any): boolean {
    return typeof op === 'string' && AGG_OPS.includes(op);
}

/**
 * Aplica op em array de números (filtra non-finite).
 * @param {Array<any>} values
 * @param {string} op
 * @returns {number|null}
 */
export function applyOp(values: Array<any>, op: string): number|null {
    if (!Array.isArray(values) || !isValidOp(op)) return null;
    const nums = values.filter((v) => Number.isFinite(v));
    if (nums.length === 0 && op !== 'count') return null;
    switch (op) {
        case 'count': return nums.length;
        case 'sum': return nums.reduce((a, b) => a + b, 0);
        case 'mean': return nums.reduce((a, b) => a + b, 0) / nums.length;
        case 'min': return Math.min(...nums);
        case 'max': return Math.max(...nums);
        case 'stddev': {
            const m = nums.reduce((a, b) => a + b, 0) / nums.length;
            const v = nums.reduce((a, b) => a + (b - m) * (b - m), 0) / nums.length;
            return Math.sqrt(v);
        }
        default: return null;
    }
}

/**
 * Agrupa nodes por groupKey (string field).
 * @param {Array<any>} nodes
 * @param {string} groupKey
 * @returns {Map<string, Array<any>>}
 */
export function groupBy(nodes: Array<any>, groupKey: string): Map<string, Array<any>> {
    if (!Array.isArray(nodes) || typeof groupKey !== 'string') return new Map();
    const m = new Map();
    for (const n of nodes) {
        if (!n) continue;
        const k = n[groupKey];
        if (k === undefined || k === null) continue;
        const key = String(k);
        if (!m.has(key)) m.set(key, []);
        const arr = m.get(key);
        if (arr) arr.push(n);
    }
    return m;
}

/**
 * Agrega field por grupo. Retorna {[groupKey]: aggregatedValue}.
 * @param {Array<any>} nodes
 * @param {string} groupKey
 * @param {string} valueField
 * @param {string} op
 * @returns {Readonly<Record<string, number|null>>}
 */
export function aggregateByGroup(nodes: Array<any>, groupKey: string, valueField: string, op: string): Readonly<Record<string, number|null>> {
    const grouped = groupBy(nodes, groupKey);
        const out: Record<string, number|null>= {};
    for (const [k, list] of grouped.entries()) {
        const values = list.map((n) => n[valueField]);
        out[k] = applyOp(values, op);
    }
    return Object.freeze(out);
}

/**
 * Múltiplas agregações: ops {[outName]: {field, op}}.
 * @param {Array<any>} nodes
 * @param {string} groupKey
 * @param {Record<string, {field: string, op: string}>} ops
 * @returns {Readonly<Record<string, Readonly<Record<string, number|null>>>>}
 */
export function aggregateMulti(nodes: Array<any>, groupKey: string, ops: Record<string, {field: string, op: string}>): Readonly<Record<string, Readonly<Record<string, number|null>>>> {
    if (!ops || typeof ops !== 'object') return Object.freeze({});
    const grouped = groupBy(nodes, groupKey);
        const out: Record<string, Readonly<Record<string, number|null>>>= {};
    for (const [k, list] of grouped.entries()) {
                const result: Record<string, number|null>= {};
        for (const [name, spec] of Object.entries(ops)) {
            if (!spec || typeof spec !== 'object') continue;
            if (typeof spec.field !== 'string' || !isValidOp(spec.op)) continue;
            const values = list.map((n) => n[spec.field]);
            result[name] = applyOp(values, spec.op);
        }
        out[k] = Object.freeze(result);
    }
    return Object.freeze(out);
}

/**
 * Aggregator global (sem grupo).
 * @param {Array<any>} nodes
 * @param {string} valueField
 * @param {string} op
 * @returns {number|null}
 */
export function aggregateAll(nodes: Array<any>, valueField: string, op: string): number|null {
    if (!Array.isArray(nodes) || typeof valueField !== 'string') return null;
    return applyOp(nodes.map((n) => n && n[valueField]), op);
}

/**
 * Sumariza grupos.
 * @param {Array<any>} nodes
 * @param {string} groupKey
 * @returns {{groupCount: number, total: number, avgPerGroup: number, largest: number, smallest: number}}
 */
export function summarizeGroups(nodes: Array<any>, groupKey: string): {groupCount: number, total: number, avgPerGroup: number, largest: number, smallest: number} {
    const empty = { groupCount: 0, total: 0, avgPerGroup: 0, largest: 0, smallest: 0 };
    const grouped = groupBy(nodes, groupKey);
    if (grouped.size === 0) return empty;
    const sizes = Array.from(grouped.values()).map((list) => list.length);
    return Object.freeze({
        groupCount: grouped.size,
        total: sizes.reduce((a, b) => a + b, 0),
        avgPerGroup: sizes.reduce((a, b) => a + b, 0) / grouped.size,
        largest: Math.max(...sizes),
        smallest: Math.min(...sizes),
    });
}

/**
 * Module identity export.
 */
export const nodeAttributeAggregatorMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.43',
    deliveredAt: '2026-05-02',
    exports: [
        'AGG_OPS',
        'AGGREGATOR_META',
        'isValidOp',
        'applyOp',
        'groupBy',
        'aggregateByGroup',
        'aggregateMulti',
        'aggregateAll',
        'summarizeGroups',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
