// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Union - Phase 56 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S56
 *
 * Phase 56 (2026-05-02) - pure-logic operações de set sobre arrays:
 * union, intersect, difference, symmetricDifference, partition.
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const UNION_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 56,
    deliveredAt: '2026-05-02',
});

/**
 * @param {any} item
 * @returns {string}
 */
function defaultKey(item: any): string {
    if (item === null || item === undefined) return '__NULL__';
    if (typeof item === 'object') {
        if (typeof item.id === 'string') return `id::${item.id}`;
        try {
            return `obj::${JSON.stringify(item)}`;
        } catch {
            return '__UNSER__';
        }
    }
    return `prim::${String(item)}`;
}

/**
 * Union: A ∪ B (sem duplicates por keyFn).
 * @template T
 * @param {ReadonlyArray<T> | undefined | null} a
 * @param {ReadonlyArray<T> | undefined | null} b
 * @param {(item: T) => string} [result]
 * @returns {ReadonlyArray<T>}
 */
export function union<T>(
    a: ReadonlyArray<T> | undefined | null,
    b: ReadonlyArray<T> | undefined | null,
    keyFn: (item: T) => string = defaultKey,
): ReadonlyArray<T> {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    const seen: Set<string> = new Set();
    const out: T[] = [];
    for (const item of [...arrA, ...arrB]) {
        const k = keyFn(item);
        if (!seen.has(k)) {
            seen.add(k);
            out.push(item);
        }
    }
    return Object.freeze(out);
}

/**
 * Intersect: A ∩ B.
 * @template T
 * @param {ReadonlyArray<T> | undefined | null} a
 * @param {ReadonlyArray<T> | undefined | null} b
 * @param {(item: T) => string} [result]
 * @returns {ReadonlyArray<T>}
 */
export function intersect<T>(
    a: ReadonlyArray<T> | undefined | null,
    b: ReadonlyArray<T> | undefined | null,
    keyFn: (item: T) => string = defaultKey,
): ReadonlyArray<T> {
    if (!Array.isArray(a) || !Array.isArray(b)) return Object.freeze([]);
    const setB = new Set(b.map(keyFn));
    const seen: Set<string> = new Set();
    const out: T[] = [];
    for (const item of a) {
        const k = keyFn(item);
        if (setB.has(k) && !seen.has(k)) {
            seen.add(k);
            out.push(item);
        }
    }
    return Object.freeze(out);
}

/**
 * Difference: A \ B.
 * @template T
 * @param {ReadonlyArray<T> | undefined | null} a
 * @param {ReadonlyArray<T> | undefined | null} b
 * @param {(item: T) => string} [result]
 * @returns {ReadonlyArray<T>}
 */
export function difference<T>(
    a: ReadonlyArray<T> | undefined | null,
    b: ReadonlyArray<T> | undefined | null,
    keyFn: (item: T) => string = defaultKey,
): ReadonlyArray<T> {
    if (!Array.isArray(a)) return Object.freeze([]);
    const arrB = Array.isArray(b) ? b : [];
    const setB = new Set(arrB.map(keyFn));
    const seen: Set<string> = new Set();
    const out: T[] = [];
    for (const item of a) {
        const k = keyFn(item);
        if (!setB.has(k) && !seen.has(k)) {
            seen.add(k);
            out.push(item);
        }
    }
    return Object.freeze(out);
}

/**
 * Symmetric difference: (A \ B) ∪ (B \ A).
 * @template T
 * @param {ReadonlyArray<T> | undefined | null} a
 * @param {ReadonlyArray<T> | undefined | null} b
 * @param {(item: T) => string} [result]
 * @returns {ReadonlyArray<T>}
 */
export function symmetricDifference<T>(
    a: ReadonlyArray<T> | undefined | null,
    b: ReadonlyArray<T> | undefined | null,
    keyFn: (item: T) => string = defaultKey,
): ReadonlyArray<T> {
    return union(difference(a, b, keyFn), difference(b, a, keyFn), keyFn);
}

/**
 * Partition: split items into [matching, notMatching] by predicate.
 * @template T
 * @param {ReadonlyArray<T>} items
 * @param {(item: T) => boolean} predicate
 * @returns {ReadonlyArray<ReadonlyArray<T>>}
 */
export function partition<T>(
    items: ReadonlyArray<T>,
    predicate: (item: T) => boolean,
): ReadonlyArray<ReadonlyArray<T>> {
    if (!Array.isArray(items) || typeof predicate !== 'function') {
        return Object.freeze([Object.freeze([]), Object.freeze([])]);
    }
    const yes: T[] = [];
    const no: T[] = [];
    for (const it of items) {
        try {
            (predicate(it) ? yes : no).push(it);
        } catch {
            no.push(it);
        }
    }
    return Object.freeze([Object.freeze(yes), Object.freeze(no)]);
}

/**
 * Sumariza set operation.
 * @param {ReadonlyArray<any>} a
 * @param {ReadonlyArray<any>} b
 * @param {ReadonlyArray<any>} result
 */
export function summarizeSetOp(a: ReadonlyArray<any>, b: ReadonlyArray<any>, result: ReadonlyArray<any>) {
    const empty = { aSize: 0, bSize: 0, resultSize: 0 };
    if (!Array.isArray(a) || !Array.isArray(b) || !Array.isArray(result)) return empty;
    return Object.freeze({
        aSize: a.length,
        bSize: b.length,
        resultSize: result.length,
    });
}

/**
 * Module identity export.
 */
export const pipelineUnionMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 56,
    deliveredAt: '2026-05-02',
    exports: ['UNION_META', 'union', 'intersect', 'difference', 'symmetricDifference', 'partition', 'summarizeSetOp'],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
