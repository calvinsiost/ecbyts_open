// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Merge - Phase 33 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S33
 *
 * Phase 33 (2026-05-02) - pure-logic merge entre 2 pipelines.
 * Suporta 4 estratégias: concat (A→B), interleave (A1→B1→A2→B2), branch
 * (A | B paralelo), splice (insert B em posição N de A).
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

interface MergeSummary {
    strategy: string | null;
    sizeA: number;
    sizeB: number;
    sizeMerged: number;
    conflicts: number;
}

/** Merge strategies canônicas. */
export const MERGE_STRATEGIES = Object.freeze(['concat', 'interleave', 'branch', 'splice']);

/** Identidade do módulo. */
export const MERGE_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 33,
    deliveredAt: '2026-05-02',
    strategies: MERGE_STRATEGIES,
});

/**
 * Verifica se strategy é canônica.
 */
export function isValidStrategy(s: any): boolean {
    return typeof s === 'string' && MERGE_STRATEGIES.includes(s);
}

/**
 * Concat: A → B (steps de A seguidos de steps de B).
 */
export function concatPipelines(a: any, b: any): ReadonlyArray<any> {
    const stepsA = Array.isArray(a) ? a : [];
    const stepsB = Array.isArray(b) ? b : [];
    return Object.freeze([
        ...stepsA.map((s) => Object.freeze({ ...s })),
        ...stepsB.map((s) => Object.freeze({ ...s })),
    ]);
}

/**
 * Interleave: A1, B1, A2, B2, ... (alternado). Sobras vão ao fim.
 */
export function interleavePipelines(a: any, b: any): ReadonlyArray<any> {
    const stepsA = Array.isArray(a) ? a : [];
    const stepsB = Array.isArray(b) ? b : [];
    const out = [];
    const max = Math.max(stepsA.length, stepsB.length);
    for (let i = 0; i < max; i++) {
        if (stepsA[i]) out.push(Object.freeze({ ...stepsA[i] }));
        if (stepsB[i]) out.push(Object.freeze({ ...stepsB[i] }));
    }
    return Object.freeze(out);
}

/**
 * Branch: cria composed parallel com A e B como children.
 */
export function branchPipelines(a: any, b: any, joinStrategy = 'merge'): ReadonlyArray<any> {
    const stepsA = Array.isArray(a) ? a : [];
    const stepsB = Array.isArray(b) ? b : [];
    return Object.freeze([
        Object.freeze({
            type: 'composed',
            strategy: 'parallel',
            children: Object.freeze([
                Object.freeze({
                    type: 'composed',
                    strategy: 'sequence',
                    children: Object.freeze(stepsA.map((s) => Object.freeze({ ...s }))),
                    config: Object.freeze({}),
                }),
                Object.freeze({
                    type: 'composed',
                    strategy: 'sequence',
                    children: Object.freeze(stepsB.map((s) => Object.freeze({ ...s }))),
                    config: Object.freeze({}),
                }),
            ]),
            config: Object.freeze({ joinStrategy }),
        }),
    ]);
}

/**
 * Splice: insere B em posição N de A. position fora do range = end.
 */
export function splicePipelines(a: any, b: any, position: any): ReadonlyArray<any> {
    const stepsA = Array.isArray(a) ? a : [];
    const stepsB = Array.isArray(b) ? b : [];
    let pos = Number.isInteger(position) ? position : stepsA.length;
    if (pos < 0) pos = 0;
    if (pos > stepsA.length) pos = stepsA.length;
    return Object.freeze([
        ...stepsA.slice(0, pos).map((s) => Object.freeze({ ...s })),
        ...stepsB.map((s) => Object.freeze({ ...s })),
        ...stepsA.slice(pos).map((s) => Object.freeze({ ...s })),
    ]);
}

/**
 * Merge dispatcher universal.
 *
 * @param strategy
 * @param a
 * @param b
 * @param options
 */
export function mergePipelines(
    strategy: string,
    a: any[],
    b: any[],
    options: Record<string, any> = {},
): any {
    if (!isValidStrategy(strategy)) {
        throw new TypeError(`mergePipelines: invalid strategy ${strategy}`);
    }
    if (strategy === 'concat') return concatPipelines(a, b);
    if (strategy === 'interleave') return interleavePipelines(a, b);
    if (strategy === 'branch') return branchPipelines(a, b, options.joinStrategy);
    if (strategy === 'splice') return splicePipelines(a, b, options.position);
    return Object.freeze([]);
}

/**
 * Detecta conflitos potenciais entre 2 pipelines (mesmo libraryId em ambos).
 *
 * @param a
 * @param b
 */
export function detectConflicts(a: any[], b: any[]): any {
    if (!Array.isArray(a) || !Array.isArray(b)) return [];
    const idsA = new Set(a.filter((s) => s && s.libraryId).map((s) => s.libraryId));
    const conflicts: any[] = [];
    for (const s of b) {
        if (s && s.libraryId && idsA.has(s.libraryId)) {
            if (!conflicts.includes(s.libraryId)) conflicts.push(s.libraryId);
        }
    }
    return Object.freeze(conflicts);
}

/**
 * Sumariza merge result.
 */
export function summarizeMerge(strategy: any, a: any, b: any): MergeSummary {
    const empty: MergeSummary = { strategy: null, sizeA: 0, sizeB: 0, sizeMerged: 0, conflicts: 0 };
    if (!isValidStrategy(strategy)) return empty;
    const sizeA = Array.isArray(a) ? a.length : 0;
    const sizeB = Array.isArray(b) ? b.length : 0;
    let sizeMerged;
    if (strategy === 'concat' || strategy === 'splice' || strategy === 'interleave') {
        sizeMerged = sizeA + sizeB;
    } else if (strategy === 'branch') {
        sizeMerged = 1; // 1 composed wrapper
    } else {
        sizeMerged = 0;
    }
    return Object.freeze({
        strategy,
        sizeA,
        sizeB,
        sizeMerged,
        conflicts: detectConflicts(a, b).length,
    });
}

/**
 * Module identity export.
 */
export const pipelineMergeMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 33,
    deliveredAt: '2026-05-02',
    strategies: MERGE_STRATEGIES,
    exports: [
        'MERGE_STRATEGIES',
        'MERGE_META',
        'isValidStrategy',
        'concatPipelines',
        'interleavePipelines',
        'branchPipelines',
        'splicePipelines',
        'mergePipelines',
        'detectConflicts',
        'summarizeMerge',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
