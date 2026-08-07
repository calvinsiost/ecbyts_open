// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Join - Phase 54 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S54
 *
 * Phase 54 (2026-05-02) - pure-logic SQL-like joins sobre arrays:
 *   - innerJoin (match em ambos)
 *   - leftJoin (todos left + null right unmatched)
 *   - rightJoin (todos right + null left unmatched)
 *   - fullJoin (união)
 *   - antiJoin (left sem match em right)
 *   - summarizeJoin
 *
 * NÃO depende de browser. Sem Promise, sem setTimeout.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const JOIN_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 54,
    deliveredAt: '2026-05-02',
});

function isArr(x: any) {
    return Array.isArray(x);
}

function buildIndex(rows: any, key: any) {
    const idx = new Map();
    for (const r of rows) {
        if (!r || typeof r !== 'object') continue;
        const k = r[key];
        if (k === undefined) continue;
        const bucket = idx.get(k);
        if (bucket) bucket.push(r);
        else idx.set(k, [r]);
    }
    return idx;
}

function mergeRow(left: any, right: any) {
    return Object.freeze({ ...(left || {}), ...(right || {}) });
}

function nullify(row: any) {
    if (!row || typeof row !== 'object') return {};
    const out: Record<string, any> = {};
    for (const k of Object.keys(row)) out[k] = null;
    return out;
}

function validateJoinInputs(left: any, right: any, leftKey: any, rightKey: any): boolean {
    return isArr(left) && isArr(right) && typeof leftKey === 'string' && typeof rightKey === 'string';
}

function collectLeftMatches(
    left: Array<any>,
    leftKey: string,
    rIdx: Map<any, Array<any>>,
    rightNullShape: Record<string, any>,
): Array<any> {
    const out: Array<any> = [];
    for (const lr of left) {
        if (!lr || typeof lr !== 'object') continue;
        const matches = rIdx.get(lr[leftKey]);
        if (matches && matches.length > 0) {
            for (const rr of matches) out.push(mergeRow(lr, rr));
        } else {
            out.push(mergeRow(lr, rightNullShape));
        }
    }
    return out;
}

function collectRightUnmatched(
    right: Array<any>,
    rightKey: string,
    lIdx: Map<any, Array<any>>,
    leftNullShape: Record<string, any>,
): Array<any> {
    const out: Array<any> = [];
    for (const rr of right) {
        if (!rr || typeof rr !== 'object') continue;
        const matches = lIdx.get(rr[rightKey]);
        if (!matches || matches.length === 0) {
            out.push(mergeRow(leftNullShape, rr));
        }
    }
    return out;
}

/**
 * Inner join - apenas rows com match em ambos os lados.
 */
export function innerJoin(
    left: any,
    right: any,
    leftKey: any,
    rightKey: any,
) {
    if (!isArr(left) || !isArr(right)) return Object.freeze([]);
    if (typeof leftKey !== 'string' || typeof rightKey !== 'string') return Object.freeze([]);
    const rIdx = buildIndex(right, rightKey);
    const out = [];
    for (const lr of left) {
        if (!lr || typeof lr !== 'object') continue;
        const matches = rIdx.get(lr[leftKey]);
        if (!matches) continue;
        for (const rr of matches) out.push(mergeRow(lr, rr));
    }
    return Object.freeze(out);
}

/**
 * Left join - todos rows do left; right nulls quando sem match.
 */
export function leftJoin(
    left: any,
    right: any,
    leftKey: any,
    rightKey: any,
) {
    if (!isArr(left) || !isArr(right)) return Object.freeze([]);
    if (typeof leftKey !== 'string' || typeof rightKey !== 'string') return Object.freeze([]);
    const rIdx = buildIndex(right, rightKey);
    const rightNullShape = right.length > 0 ? nullify(right[0]) : {};
    const out = [];
    for (const lr of left) {
        if (!lr || typeof lr !== 'object') continue;
        const matches = rIdx.get(lr[leftKey]);
        if (matches && matches.length > 0) {
            for (const rr of matches) out.push(mergeRow(lr, rr));
        } else {
            out.push(mergeRow(lr, rightNullShape));
        }
    }
    return Object.freeze(out);
}

/**
 * Right join - todos rows do right; left nulls quando sem match.
 */
export function rightJoin(
    left: any,
    right: any,
    leftKey: any,
    rightKey: any,
) {
    if (!isArr(left) || !isArr(right)) return Object.freeze([]);
    if (typeof leftKey !== 'string' || typeof rightKey !== 'string') return Object.freeze([]);
    const lIdx = buildIndex(left, leftKey);
    const leftNullShape = left.length > 0 ? nullify(left[0]) : {};
    const out = [];
    for (const rr of right) {
        if (!rr || typeof rr !== 'object') continue;
        const matches = lIdx.get(rr[rightKey]);
        if (matches && matches.length > 0) {
            for (const lr of matches) out.push(mergeRow(lr, rr));
        } else {
            out.push(mergeRow(leftNullShape, rr));
        }
    }
    return Object.freeze(out);
}

/**
 * Full outer join - união de left + right; nulls em lado faltante.
 */
export function fullJoin(
    left: any,
    right: any,
    leftKey: any,
    rightKey: any,
) {
    if (!validateJoinInputs(left, right, leftKey, rightKey)) return Object.freeze([]);
    const lIdx = buildIndex(left, leftKey);
    const rIdx = buildIndex(right, rightKey);
    const leftNullShape = left.length > 0 ? nullify(left[0]) : {};
    const rightNullShape = right.length > 0 ? nullify(right[0]) : {};
    const out: Array<any> = [
        ...collectLeftMatches(left, leftKey, rIdx, rightNullShape),
        ...collectRightUnmatched(right, rightKey, lIdx, leftNullShape),
    ];
    return Object.freeze(out);
}

/**
 * Anti join - rows do left SEM match em right.
 */
export function antiJoin(
    left: any,
    right: any,
    leftKey: any,
    rightKey: any,
) {
    if (!isArr(left) || !isArr(right)) return Object.freeze([]);
    if (typeof leftKey !== 'string' || typeof rightKey !== 'string') return Object.freeze([]);
    const rIdx = buildIndex(right, rightKey);
    const out = [];
    for (const lr of left) {
        if (!lr || typeof lr !== 'object') continue;
        const matches = rIdx.get(lr[leftKey]);
        if (!matches || matches.length === 0) {
            out.push(Object.freeze({ ...lr }));
        }
    }
    return Object.freeze(out);
}

/**
 * Summarize join: counts.
 */
export function summarizeJoin(
    left: any,
    right: any,
    joined: any,
    unmatched: any,
) {
    return Object.freeze({
        leftCount: isArr(left) ? left.length : 0,
        rightCount: isArr(right) ? right.length : 0,
        joined: isArr(joined) ? joined.length : 0,
        unmatched: isArr(unmatched) ? unmatched.length : 0,
    });
}

/**
 * Module identity export.
 */
export const pipelineJoinMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 54,
    deliveredAt: '2026-05-02',
    exports: ['JOIN_META', 'innerJoin', 'leftJoin', 'rightJoin', 'fullJoin', 'antiJoin', 'summarizeJoin'],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
