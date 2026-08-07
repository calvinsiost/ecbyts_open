// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Edge Weight Threshold - Phase 1.49 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S49
 *
 * Phase 1.49 (2026-05-02) - pure-logic thresholding de edges por peso.
 * Suporta cutoffs absolutos, percentile-based, e top-K edges. Útil
 * para filtrar visualização em grafos densos.
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const THRESHOLD_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.49',
    deliveredAt: '2026-05-02',
});

/**
 * Filtra edges com weight >= minWeight.
 * @param {Array<any>} edges
 * @param {string} field
 * @param {number} minWeight
 * @returns {ReadonlyArray<any>}
 */
export function thresholdMin(edges: Array<any>, field: string, minWeight: number): ReadonlyArray<any> {
    if (!Array.isArray(edges) || typeof field !== 'string') return Object.freeze([]);
    if (!Number.isFinite(minWeight)) return Object.freeze(edges.slice());
    return Object.freeze(edges.filter((e) => e && Number.isFinite(e[field]) && e[field] >= minWeight));
}

/**
 * Filtra edges com weight <= maxWeight.
 * @param {Array<any>} edges
 * @param {string} field
 * @param {number} maxWeight
 * @returns {ReadonlyArray<any>}
 */
export function thresholdMax(edges: Array<any>, field: string, maxWeight: number): ReadonlyArray<any> {
    if (!Array.isArray(edges) || typeof field !== 'string') return Object.freeze([]);
    if (!Number.isFinite(maxWeight)) return Object.freeze(edges.slice());
    return Object.freeze(edges.filter((e) => e && Number.isFinite(e[field]) && e[field] <= maxWeight));
}

/**
 * Filtra edges com weight em [min, max].
 * @param {Array<any>} edges
 * @param {string} field
 * @param {number} min
 * @param {number} max
 * @returns {ReadonlyArray<any>}
 */
export function thresholdRange(edges: Array<any>, field: string, min: number, max: number): ReadonlyArray<any> {
    if (!Array.isArray(edges) || typeof field !== 'string') return Object.freeze([]);
    const lo = Number.isFinite(min) ? min : -Infinity;
    const hi = Number.isFinite(max) ? max : Infinity;
    return Object.freeze(edges.filter((e) => e && Number.isFinite(e[field]) && e[field] >= lo && e[field] <= hi));
}

/**
 * Computa percentile threshold value.
 * @param {Array<any>} edges
 * @param {string} field
 * @param {number} p
 * @returns {number|null}
 */
export function percentileThreshold(edges: Array<any>, field: string, p: number): number|null {
    if (!Array.isArray(edges) || typeof field !== 'string') return null;
    if (!Number.isFinite(p) || p < 0 || p > 100) return null;
    const values = edges.map((e) => e && e[field]).filter((v) => Number.isFinite(v));
    if (values.length === 0) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Filtra edges com weight >= percentile p.
 * @param {Array<any>} edges
 * @param {string} field
 * @param {number} p
 * @returns {ReadonlyArray<any>}
 */
export function thresholdPercentile(edges: Array<any>, field: string, p: number): ReadonlyArray<any> {
    const t = percentileThreshold(edges, field, p);
    if (t === null) return Object.freeze([]);
    return thresholdMin(edges, field, t);
}

/**
 * Top-K edges por weight (desc, id-asc tiebreak se houver field 'id').
 * @param {Array<any>} edges
 * @param {string} field
 * @param {number} k
 * @returns {ReadonlyArray<any>}
 */
export function topKEdges(edges: Array<any>, field: string, k: number): ReadonlyArray<any> {
    if (!Array.isArray(edges) || typeof field !== 'string') return Object.freeze([]);
    if (!Number.isInteger(k) || k <= 0) return Object.freeze([]);
    const filtered = edges.filter((e) => e && Number.isFinite(e[field]));
    const sorted = filtered.slice().sort((a, b) => {
        if (b[field] !== a[field]) return b[field] - a[field];
        if (typeof a.id === 'string' && typeof b.id === 'string') return a.id.localeCompare(b.id);
        return 0;
    });
    return Object.freeze(sorted.slice(0, k));
}

/**
 * Bottom-K edges por weight (asc).
 * @param {Array<any>} edges
 * @param {string} field
 * @param {number} k
 * @returns {ReadonlyArray<any>}
 */
export function bottomKEdges(edges: Array<any>, field: string, k: number): ReadonlyArray<any> {
    if (!Array.isArray(edges) || typeof field !== 'string') return Object.freeze([]);
    if (!Number.isInteger(k) || k <= 0) return Object.freeze([]);
    const filtered = edges.filter((e) => e && Number.isFinite(e[field]));
    const sorted = filtered.slice().sort((a, b) => {
        if (a[field] !== b[field]) return a[field] - b[field];
        if (typeof a.id === 'string' && typeof b.id === 'string') return a.id.localeCompare(b.id);
        return 0;
    });
    return Object.freeze(sorted.slice(0, k));
}

/**
 * Sumariza threshold result.
 * @param {Array<any>} input
 * @param {Array<any>} output
 * @returns {{input: number, output: number, dropped: number, kept: number, ratio: number}}
 */
export function summarizeThreshold(input: Array<any>, output: Array<any>): {input: number, output: number, dropped: number, kept: number, ratio: number} {
    const empty = { input: 0, output: 0, dropped: 0, kept: 0, ratio: 0 };
    if (!Array.isArray(input) || !Array.isArray(output)) return empty;
    return Object.freeze({
        input: input.length,
        output: output.length,
        dropped: input.length - output.length,
        kept: output.length,
        ratio: input.length > 0 ? output.length / input.length : 0,
    });
}

/**
 * Module identity export.
 */
export const edgeWeightThresholdMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.49',
    deliveredAt: '2026-05-02',
    exports: [
        'THRESHOLD_META',
        'thresholdMin',
        'thresholdMax',
        'thresholdRange',
        'percentileThreshold',
        'thresholdPercentile',
        'topKEdges',
        'bottomKEdges',
        'summarizeThreshold',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
