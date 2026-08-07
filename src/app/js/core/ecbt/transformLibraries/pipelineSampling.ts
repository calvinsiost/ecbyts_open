// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Sampling - Phase 52 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S52
 *
 * Phase 52 (2026-05-02) - pure-logic amostragem determinística:
 *   - Mulberry32 PRNG seedável
 *   - randomSample (uniform N from M)
 *   - reservoirSample (Algorithm R, streaming)
 *   - stratifiedSample (proporcional por groupKey)
 *   - systematicSample (every k-th)
 *
 * NÃO depende de browser. Sem Math.random direto, sem setTimeout.
 *
 * Owner: Claude (orquestrador apropriador)
 */

interface SampleSummary {
    input: number;
    output: number;
    ratio: number;
}

/** Identidade do módulo. */
export const SAMPLING_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 52,
    deliveredAt: '2026-05-02',
});

/**
 * Mulberry32 PRNG.
 * @param seed
 */
export function mulberry32(seed: number): () => number {
    let s = seed >>> 0 || 1;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Uniform random sample N items from items[].
 * Fisher-Yates partial shuffle.
 * @param input
 * @param output
 * @param seed
 */
export function randomSample<T>(items: ReadonlyArray<T>, n: number, seed = 0): ReadonlyArray<T> {
    if (!Array.isArray(items)) return Object.freeze([]);
    if (!Number.isInteger(n) || n <= 0) return Object.freeze([]);
    if (n >= items.length) return Object.freeze(items.slice());
    const rand = mulberry32(seed);
    const arr = items.slice();
    for (let i = 0; i < n; i++) {
        const j = i + Math.floor(rand() * (arr.length - i));
        [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
    }
    return Object.freeze(arr.slice(0, n));
}

/**
 * Reservoir sampling Algorithm R: amostra N de stream sem conhecer tamanho.
 * @param input
 * @param output
 * @param seed
 */
export function reservoirSample<T>(items: ReadonlyArray<T>, n: number, seed = 0): ReadonlyArray<T> {
    if (!Array.isArray(items)) return Object.freeze([]);
    if (!Number.isInteger(n) || n <= 0) return Object.freeze([]);
    if (items.length <= n) return Object.freeze(items.slice());
    const rand = mulberry32(seed);
    const reservoir = items.slice(0, n);
    for (let i = n; i < items.length; i++) {
        const j = Math.floor(rand() * (i + 1));
        if (j < n) reservoir[j] = items[i] as T;
    }
    return Object.freeze(reservoir);
}

/**
 * Stratified sampling: cada grupo aporta proporcional (n total).
 * @param input
 * @param groupKey
 * @param output
 * @param seed
 */
export function stratifiedSample<T extends Record<string, any>>(
    items: ReadonlyArray<T>,
    groupKey: string,
    n: number,
    seed = 0,
): ReadonlyArray<T> {
    if (!Array.isArray(items) || typeof groupKey !== 'string') return Object.freeze([]);
    if (!Number.isInteger(n) || n <= 0) return Object.freeze([]);
    if (n >= items.length) return Object.freeze(items.slice());
    const groups = new Map<string, T[]>();
    for (const it of items) {
        if (!it) continue;
        const k = String(it[groupKey] ?? '');
        let bucket = groups.get(k);
        if (!bucket) {
            bucket = [];
            groups.set(k, bucket);
        }
        bucket.push(it);
    }
    const out: T[] = [];
    let i = 0;
    for (const [, list] of groups.entries()) {
        const share = Math.max(1, Math.round((list.length / items.length) * n));
        const sub = randomSample(list, share, seed + i);
        out.push(...sub);
        i++;
    }
    // truncate to n if overshot
    return Object.freeze(out.slice(0, n));
}

/**
 * Systematic: pega every k-th item, com offset.
 * @param input
 * @param output
 * @param offset
 */
export function systematicSample<T>(items: ReadonlyArray<T>, n: number, offset = 0): ReadonlyArray<T> {
    if (!Array.isArray(items)) return Object.freeze([]);
    if (!Number.isInteger(n) || n <= 0) return Object.freeze([]);
    if (n >= items.length) return Object.freeze(items.slice());
    const k = Math.floor(items.length / n);
    if (k < 1) return Object.freeze(items.slice(0, n));
    const out: T[] = [];
    let idx = Math.max(0, Math.min(offset, items.length - 1));
    while (out.length < n && idx < items.length) {
        out.push(items[idx] as T);
        idx += k;
    }
    return Object.freeze(out);
}

/**
 * Sumariza sample.
 * @param input
 * @param output
 */
export function summarizeSample(input: ReadonlyArray<any>, output: ReadonlyArray<any>): SampleSummary {
    const empty: SampleSummary = { input: 0, output: 0, ratio: 0 };
    if (!Array.isArray(input) || !Array.isArray(output)) return empty;
    return Object.freeze({
        input: input.length,
        output: output.length,
        ratio: input.length > 0 ? output.length / input.length : 0,
    });
}

/**
 * Module identity export.
 */
export const pipelineSamplingMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 52,
    deliveredAt: '2026-05-02',
    exports: [
        'SAMPLING_META',
        'mulberry32',
        'randomSample',
        'reservoirSample',
        'stratifiedSample',
        'systematicSample',
        'summarizeSample',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
