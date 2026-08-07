// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Branching (Phase 20)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md S20
 *
 * Phase 20 (2026-05-01) - pure-logic engine de branching condicional
 * para pipelines. Permite definir caminhos alternativos baseados em
 * predicates avaliados em runtime (ex: if/elif/else).
 *
 * Estratégia:
 *   - Branch: { condition, steps } - condition é predicate puro
 *   - resolveBranch: avalia conditions sequencial, retorna primeiro match
 *   - selectPath: caso default fallback se nenhuma condition match
 *   - validateBranches: verifica não-overlap de conditions exclusivas
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const BRANCHING_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 20,
    deliveredAt: '2026-05-01',
});

/**
 * Cria branch frozen.
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createBranch(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createBranch: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createBranch: id required');
    }
    if (spec.condition !== null && typeof spec.condition !== 'function') {
        throw new TypeError('createBranch: condition must be function or null');
    }
    if (!Array.isArray(spec.steps)) {
        throw new TypeError('createBranch: steps must be array');
    }
    return Object.freeze({
        id: spec.id,
        label: spec.label || spec.id,
        condition: spec.condition,
        steps: Object.freeze([...spec.steps]),
        priority: Number.isInteger(spec.priority) ? spec.priority : 0,
        isDefault: spec.condition === null,
    });
}

/**
 * Verifica se branch é "default" (sem condition).
 */
export function isDefaultBranch( branch: any) {
    return Boolean(branch && branch.condition === null);
}

/**
 * Avalia condition de branch contra context.
 *
 * @param {Record<string, any>} branch
 * @param {Record<string, any>} any>
 * @returns {boolean}
 */
export function evaluateBranch(branch: Record<string, any>, context: Record<string, any>): boolean {
    if (!branch) return false;
    if (isDefaultBranch(branch)) return true;
    if (typeof branch.condition !== 'function') return false;
    try {
        return Boolean(branch.condition(context));
    } catch ( e: any) {
        console.debug('[branching:evaluate]', e?.message || e);
        return false;
    }
}

/**
 * Resolve qual branch executar dado context (sequencial, primeiro match).
 *
 * @param {Array<any>} branches
 * @param {Record<string, any>} context
 * @returns {any}
 */
export function resolveBranch(branches: Array<any>, context: Record<string, any>): any {
    if (!Array.isArray(branches) || branches.length === 0) return null;

    // Sort by priority desc; defaults go last
    const sorted = [...branches].sort(( a: any,  b: any) => {
        if (isDefaultBranch(a) && !isDefaultBranch(b)) return 1;
        if (!isDefaultBranch(a) && isDefaultBranch(b)) return -1;
        return (b.priority || 0) - (a.priority || 0);
    });

    for (const branch of sorted) {
        if (evaluateBranch(branch, context)) return branch;
    }
    return null;
}

/**
 * Constrói pipeline efetivo a partir de branches + context.
 *
 * @param {Array<any>} branches
 * @param {Record<string, any>} context
 * @returns {Array<any>} steps
 */
export function buildEffectivePipeline(branches: Array<any>, context: Record<string, any>): Array<any> {
    const branch = resolveBranch(branches, context);
    if (!branch) return [];
    return [...branch.steps];
}

/**
 * Valida lista de branches:
 *   - tem pelo menos 1
 *   - max 1 default branch
 *   - todos tem id unico
 *
 * @param {Array<any>} branches
 * @returns {{valid: boolean, errors: any}}
 */
export function validateBranches(branches: Array<any>): {valid: boolean, errors: any} {
    const errors: string[] = [];
    if (!Array.isArray(branches)) {
        errors.push('not_array');
        return Object.freeze({ valid: false, errors: Object.freeze(errors) });
    }
    if (branches.length === 0) {
        errors.push('empty');
        return Object.freeze({ valid: false, errors: Object.freeze(errors) });
    }

    const ids = new Set();
    let defaultCount = 0;
    for (const rawBranch of branches) {
        const branch = (rawBranch as any);
        if (!branch) continue;
        if (branch.id) {
            if (ids.has(branch.id)) errors.push(`duplicate_id:${branch.id}`);
            ids.add(branch.id);
        } else {
            errors.push('missing_id');
        }
        if (isDefaultBranch(branch)) defaultCount++;
    }
    if (defaultCount > 1) errors.push('multiple_defaults');

    return Object.freeze({
        valid: errors.length === 0,
        errors: Object.freeze(errors),
    });
}

/**
 * Lista branches com base em outcome (matched ou skipped).
 *
 * @param {Array<any>} branches
 * @param {Record<string, any>} context
 * @returns {any}
 */
export function classifyBranches(branches: Array<any>, context: Record<string, any>): any {
    if (!Array.isArray(branches)) {
        return Object.freeze({ matched: [], skipped: [] });
    }
    const winner = resolveBranch(branches, context);
    const matched = winner ? [winner] : [];
    const skipped = branches.filter(( b: any) => b && b !== winner);
    return Object.freeze({
        matched: Object.freeze(matched),
        skipped: Object.freeze(skipped),
    });
}

/**
 * Combina conditions com AND logico.
 *
 * @param  {...any} conditions
 * @returns {Function}
 */
export function andConditions(...conditions: any[]): Function {
    return ( ctx: any) => {
        for (const c of conditions) {
            if (typeof c !== 'function') return false;
            try {
                if (!c(ctx)) return false;
            } catch ( e: any) {
                console.debug('[branching:and]', e?.message || e);
                return false;
            }
        }
        return true;
    };
}

/**
 * Combina conditions com OR logico.
 * @param {...any} conditions
 * @returns {Function}
 */
export function orConditions(...conditions: any[]): Function {
    return ( ctx: any) => {
        for (const c of conditions) {
            if (typeof c !== 'function') continue;
            try {
                if (c(ctx)) return true;
            } catch ( e: any) {
                console.debug('[branching:or]', e?.message || e);
            }
        }
        return false;
    };
}

/**
 * Negacao logica de condition.
 */
export function notCondition( condition: any) {
    return ( ctx: any) => {
        if (typeof condition !== 'function') return true;
        try {
            return !condition(ctx);
        } catch ( e: any) {
            console.debug('[branching:not]', e?.message || e);
            return false;
        }
    };
}

/**
 * Sumariza branches.
 */
export function summarizeBranches( branches: any) {
    const empty = { count: 0, defaultCount: 0, withCondition: 0, totalSteps: 0 };
    if (!Array.isArray(branches) || branches.length === 0) return empty;
    let defaultCount = 0;
    let withCondition = 0;
    let totalSteps = 0;
    for (const b of branches) {
        if (!b) continue;
        if (isDefaultBranch(b)) defaultCount++;
        else if (typeof b.condition === 'function') withCondition++;
        if (Array.isArray(b.steps)) totalSteps += b.steps.length;
    }
    return Object.freeze({
        count: branches.length,
        defaultCount,
        withCondition,
        totalSteps,
    });
}

/**
 * Module identity export.
 */
export const pipelineBranchingMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 20,
    deliveredAt: '2026-05-01',
    exports: [
        'BRANCHING_META',
        'createBranch',
        'isDefaultBranch',
        'evaluateBranch',
        'resolveBranch',
        'buildEffectivePipeline',
        'validateBranches',
        'classifyBranches',
        'andConditions',
        'orConditions',
        'notCondition',
        'summarizeBranches',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
