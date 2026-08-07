// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Edge Filtering - Phase 1.41 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S41
 *
 * Phase 1.41 (2026-05-02) - pure-logic filtros declarativos para edges.
 * Suporta:
 *   - filterByPredicate (function)
 *   - filterByField (eq/range/in)
 *   - composição AND/OR de filtros
 *   - inversion (NOT)
 *   - summarize {input, output, dropped, ratio}
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const FILTER_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.41',
    deliveredAt: '2026-05-02',
});

/**
 * Filtra edges via predicate function.
 * @param {Array<any>} edges
 * @param {(edge: any) => boolean} fn
 * @returns {ReadonlyArray<any>}
 */
export function filterByPredicate(edges: any[], fn: (edge: any) => boolean): ReadonlyArray<any> {
    if (!Array.isArray(edges)) return Object.freeze([]);
    if (typeof fn !== 'function') return Object.freeze(edges.slice());
    return Object.freeze(edges.filter((e) => {
        try {
            return !!fn(e);
        } catch {
            return false;
        }
    }));
}

/**
 * Filtra por field eq value.
 * @param {Array<any>} edges
 * @param {string} field
 * @param {*} value
 * @returns {ReadonlyArray<any>}
 */
export function filterByField(edges: any[], field: string, value: any): ReadonlyArray<any> {
    if (!Array.isArray(edges) || typeof field !== 'string') return Object.freeze([]);
    return Object.freeze(edges.filter((e) => e && e[field] === value));
}

/**
 * Filtra por field em range [min, max].
 * @param {Array<any>} edges
 * @param {string} field
 * @param {number} min
 * @param {number} max
 * @returns {ReadonlyArray<any>}
 */
export function filterByRange(edges: any[], field: string, min: number, max: number): ReadonlyArray<any> {
    if (!Array.isArray(edges) || typeof field !== 'string') return Object.freeze([]);
    const lo = Number.isFinite(min) ? min : -Infinity;
    const hi = Number.isFinite(max) ? max : Infinity;
    return Object.freeze(edges.filter((e) => {
        if (!e) return false;
        const v = e[field];
        return Number.isFinite(v) && v >= lo && v <= hi;
    }));
}

/**
 * Filtra por field IN values[].
 * @param {Array<any>} edges
 * @param {string} field
 * @param {Array<any>} values
 * @returns {ReadonlyArray<any>}
 */
export function filterByIn(edges: any[], field: string, values: any[]): ReadonlyArray<any> {
    if (!Array.isArray(edges) || typeof field !== 'string') return Object.freeze([]);
    if (!Array.isArray(values)) return Object.freeze([]);
    const set = new Set(values);
    return Object.freeze(edges.filter((e) => e && set.has(e[field])));
}

/**
 * AND: todos os predicates devem passar.
 * @param {...((edge: any) => boolean)} fns
 * @returns {(edge: any) => boolean}
 */
export function and(...fns: Array<(edge: any) => boolean>): (edge: any) => boolean {
    return (edge) => fns.every((fn) => {
        if (typeof fn !== 'function') return true;
        try {
            return !!fn(edge);
        } catch {
            return false;
        }
    });
}

/**
 * OR: pelo menos um predicate deve passar.
 * @param {...((edge: any) => boolean)} fns
 * @returns {(edge: any) => boolean}
 */
export function or(...fns: Array<(edge: any) => boolean>): (edge: any) => boolean {
    return (edge) => fns.some((fn) => {
        if (typeof fn !== 'function') return false;
        try {
            return !!fn(edge);
        } catch {
            return false;
        }
    });
}

/**
 * NOT: inverte o predicate.
 * @param {(edge: any) => boolean} fn
 * @returns {(edge: any) => boolean}
 */
export function not(fn: (edge: any) => boolean): (edge: any) => boolean {
    return (edge) => {
        if (typeof fn !== 'function') return false;
        try {
            return !fn(edge);
        } catch {
            return true; // erro = excluído pelo original
        }
    };
}

/**
 * Sumariza filter result.
 * @param {Array<any>} input
 * @param {Array<any>} output
 * @returns {{input: number, output: number, dropped: number, ratio: number}}
 */
export function summarizeFilter(
    input: any[],
    output: any[],
): { input: number; output: number; dropped: number; ratio: number } {
    const empty = { input: 0, output: 0, dropped: 0, ratio: 0 };
    if (!Array.isArray(input) || !Array.isArray(output)) return empty;
    return Object.freeze({
        input: input.length,
        output: output.length,
        dropped: input.length - output.length,
        ratio: input.length > 0 ? output.length / input.length : 0,
    });
}

/**
 * Module identity export.
 */
export const edgeFilteringMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.41',
    deliveredAt: '2026-05-02',
    exports: [
        'FILTER_META',
        'filterByPredicate',
        'filterByField',
        'filterByRange',
        'filterByIn',
        'and',
        'or',
        'not',
        'summarizeFilter',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
