// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Composition Helpers - Phase 30 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S30
 *
 * Phase 30 (2026-05-01) - pure-logic functional combinators para
 * compor pipelines higher-order a partir de libraries atômicas.
 * Inclui sequence, parallel, conditional, retry, tap, partition.
 *
 * Estratégia:
 *   - composeSequence: A → B → C
 *   - composeParallel: A | B | C → join
 *   - composeConditional: if/else branch baseado em predicate
 *   - composeRetry: retry com backoff
 *   - composeTap: side-effect sem alterar fluxo
 *   - composePartition: split fluxo por predicate
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Composition strategies canônicas. */
export const COMPOSE_STRATEGIES = Object.freeze(['sequence', 'parallel', 'conditional', 'retry', 'tap', 'partition']);

/** Identidade do módulo. */
export const COMPOSE_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 30,
    deliveredAt: '2026-05-01',
    strategies: COMPOSE_STRATEGIES,
});

/**
 * Verifica se strategy é canônica.
 */
export function isValidStrategy(s: any): boolean {
    return typeof s === 'string' && COMPOSE_STRATEGIES.includes(s);
}

/**
 * Constrói composed step canônico.
 */
export function buildComposedStep(strategy: string, children: Array<object>, config: object = {}): object {
    if (!isValidStrategy(strategy)) {
        throw new TypeError(`buildComposedStep: invalid strategy ${strategy}`);
    }
    if (!Array.isArray(children)) {
        throw new TypeError('buildComposedStep: children must be array');
    }
    return Object.freeze({
        type: 'composed',
        strategy,
        children: Object.freeze(children.map((c) => Object.freeze({ ...c }))),
        config: Object.freeze({ ...config }),
    });
}

/**
 * Compose sequence A → B → C.
 */
export function composeSequence(steps: Array<object>): object {
    return buildComposedStep('sequence', steps || [], {});
}

/**
 * Compose parallel A | B | C com join strategy.
 */
export function composeParallel(steps: Array<object>, joinStrategy = 'merge'): object {
    return buildComposedStep('parallel', steps || [], { joinStrategy });
}

/**
 * Compose conditional if/else.
 */
export function composeConditional(predicateLibraryId: string, thenStep: object, elseStep?: object): object {
    if (typeof predicateLibraryId !== 'string' || !predicateLibraryId.trim()) {
        throw new TypeError('composeConditional: predicateLibraryId required');
    }
    const children = [thenStep];
    if (elseStep) children.push(elseStep);
    return buildComposedStep('conditional', children, {
        predicateLibraryId,
        hasElse: !!elseStep,
    });
}

/**
 * Compose retry com backoff.
 */
export function composeRetry(step: Record<string, any>, options: Record<string, any> = {}): object {
    if (!step) throw new TypeError('composeRetry: step required');
    const maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts > 0 ? options.maxAttempts : 3;
    const backoffMs = Number.isFinite(options.backoffMs) && options.backoffMs >= 0 ? options.backoffMs : 1000;
    const backoffStrategy = options.backoffStrategy === 'exponential' ? 'exponential' : 'linear';
    return buildComposedStep('retry', [step], {
        maxAttempts,
        backoffMs,
        backoffStrategy,
    });
}

/**
 * Compose tap (side-effect, não altera fluxo).
 */
export function composeTap(step: object, sideEffectStep: object): object {
    if (!step) throw new TypeError('composeTap: step required');
    if (!sideEffectStep) throw new TypeError('composeTap: sideEffectStep required');
    return buildComposedStep('tap', [step, sideEffectStep], {
        passthrough: true,
    });
}

/**
 * Compose partition (split fluxo por predicate).
 */
export function composePartition(predicateLibraryId: string, truePath: object, falsePath: object): object {
    if (typeof predicateLibraryId !== 'string' || !predicateLibraryId.trim()) {
        throw new TypeError('composePartition: predicateLibraryId required');
    }
    if (!truePath || !falsePath) {
        throw new TypeError('composePartition: truePath and falsePath required');
    }
    return buildComposedStep('partition', [truePath, falsePath], {
        predicateLibraryId,
    });
}

/**
 * Calcula depth de composed step (recursivo).
 */
export function calculateDepth(step: Record<string, any>): number {
    if (!step || typeof step !== 'object') return 0;
    if (step.type !== 'composed' || !Array.isArray(step.children)) return 1;
    let maxChild = 0;
    for (const c of step.children) {
        const d = calculateDepth(c);
        if (d > maxChild) maxChild = d;
    }
    return 1 + maxChild;
}

/**
 * Conta total de leaf steps (não-composed).
 */
export function countLeaves(step: Record<string, any>): number {
    if (!step || typeof step !== 'object') return 0;
    if (step.type !== 'composed' || !Array.isArray(step.children)) return 1;
    let total = 0;
    for (const c of step.children) {
        total += countLeaves(c);
    }
    return total;
}

/**
 * Achata composed step em sequência linear (best-effort).
 */
export function flatten(step: Record<string, any>): Array<object> {
    if (!step || typeof step !== 'object') return [];
    if (step.type !== 'composed') return [step];
    if (!Array.isArray(step.children)) return [];
    const out: Array<object> = [];
    for (const c of step.children) {
        out.push(...(flatten(c) as Array<object>));
    }
    return Object.freeze(out) as Array<object>;
}

/**
 * Valida composed step recursivamente.
 */
export function validateComposed(
    step: Record<string, any>,
): { valid: boolean; errors: ReadonlyArray<string> } {
    const errors: Array<string> = [];
    if (!step || typeof step !== 'object') {
        errors.push('step must be object');
        return Object.freeze({ valid: false, errors: Object.freeze(errors) });
    }
    if (step.type === 'composed') {
        if (!isValidStrategy(step.strategy)) {
            errors.push(`invalid strategy ${step.strategy}`);
        }
        if (!Array.isArray(step.children)) {
            errors.push('children must be array');
        } else {
            for (let i = 0; i < step.children.length; i++) {
                const r = validateComposed(step.children[i]);
                if (!r.valid) {
                    errors.push(`child[${i}]: ${r.errors.join(', ')}`);
                }
            }
        }
    }
    return Object.freeze({
        valid: errors.length === 0,
        errors: Object.freeze(errors),
    });
}

/**
 * Sumariza composition.
 */
export function summarizeComposition(step: any): any {
    const empty = { depth: 0, leafCount: 0, strategies: {}, valid: false };
    if (!step) return empty;
    const strategies: Record<string, number> = {};
    function visit(s: any) {
        if (!s || typeof s !== 'object') return;
        if (s.type === 'composed' && s.strategy) {
            strategies[s.strategy] = (strategies[s.strategy] || 0) + 1;
            if (Array.isArray(s.children)) s.children.forEach(visit);
        }
    }
    visit(step);
    const validation = validateComposed(step);
    return Object.freeze({
        depth: calculateDepth(step),
        leafCount: countLeaves(step),
        strategies,
        valid: validation.valid,
    });
}

/**
 * Module identity export.
 */
export const pipelineComposeMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 30,
    deliveredAt: '2026-05-01',
    strategies: COMPOSE_STRATEGIES,
    exports: [
        'COMPOSE_STRATEGIES',
        'COMPOSE_META',
        'isValidStrategy',
        'buildComposedStep',
        'composeSequence',
        'composeParallel',
        'composeConditional',
        'composeRetry',
        'composeTap',
        'composePartition',
        'calculateDepth',
        'countLeaves',
        'flatten',
        'validateComposed',
        'summarizeComposition',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
