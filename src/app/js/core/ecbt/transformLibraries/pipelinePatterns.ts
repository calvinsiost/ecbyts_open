// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Patterns (Phase 21)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S21
 *
 * Phase 21 (2026-05-01) - pure-logic catálogo de padrões canônicos
 * para construção rápida de pipelines comuns: map/filter/reduce/
 * fork/join/retry/fallback/circuitBreaker.
 *
 * Estratégia:
 *   - Patterns frozen (factory functions que retornam steps[])
 *   - Cada pattern documenta intent + structure + caveats
 *   - composeSteps: combinator de múltiplos patterns
 *   - validate: garante invariantes (max depth, etc)
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Pattern names canônicos. */
export const PATTERN_NAMES = Object.freeze([
    'map',
    'filter',
    'reduce',
    'fork',
    'join',
    'retry',
    'fallback',
    'circuitBreaker',
]);

/** Identidade do módulo. */
export const PATTERNS_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 21,
    deliveredAt: '2026-05-01',
    patterns: PATTERN_NAMES,
});

/**
 * Verifica se nome é pattern canônico.
 */
export function isValidPatternName(name: any) {
    return typeof name === 'string' && PATTERN_NAMES.includes(name);
}

/**
 * Map pattern: aplicar transformação a cada item de coleção.
 *
 * @param {string} libraryId - library que faz a transformação
 * @param {Object} [config]
 * @returns {Array<Object>}
 */
export function mapPattern(libraryId: string, config: Object = {}): Array<Object> {
    if (typeof libraryId !== 'string' || !libraryId.trim()) return [];
    return [
        Object.freeze({
            id: `map-${libraryId}-${Date.now()}`,
            libraryId,
            pattern: 'map',
            config: Object.freeze({ ...config, mode: 'iterate' }),
        }),
    ];
}

/**
 * Filter pattern: passa apenas items que satisfazem predicate.
 */
export function filterPattern(libraryId: any, config = {}) {
    if (typeof libraryId !== 'string' || !libraryId.trim()) return [];
    return [
        Object.freeze({
            id: `filter-${libraryId}-${Date.now()}`,
            libraryId,
            pattern: 'filter',
            config: Object.freeze({ ...config, mode: 'predicate' }),
        }),
    ];
}

/**
 * Reduce pattern: agrega itens em acumulador.
 */
export function reducePattern(libraryId: any, config = {}) {
    if (typeof libraryId !== 'string' || !libraryId.trim()) return [];
    return [
        Object.freeze({
            id: `reduce-${libraryId}-${Date.now()}`,
            libraryId,
            pattern: 'reduce',
            config: Object.freeze({ ...config, mode: 'aggregate' }),
        }),
    ];
}

/**
 * Fork pattern: split execution em N branches paralelos.
 *
 * @param {Array<Array<Object>>} branches - cada branch é array de steps
 */
export function forkPattern(branches: Array<Array<Object>>) {
    if (!Array.isArray(branches) || branches.length === 0) return [];
    return [
        Object.freeze({
            id: `fork-${Date.now()}`,
            libraryId: '_fork',
            pattern: 'fork',
            config: Object.freeze({
                branches: Object.freeze(
                    branches.map((branch) => (Array.isArray(branch) ? Object.freeze([...branch]) : Object.freeze([]))),
                ),
                branchCount: branches.length,
            }),
        }),
    ];
}

/**
 * Join pattern: combina N branches em 1 (após fork).
 */
export function joinPattern(strategy = 'merge', config = {}) {
    return [
        Object.freeze({
            id: `join-${Date.now()}`,
            libraryId: '_join',
            pattern: 'join',
            config: Object.freeze({ strategy, ...config }),
        }),
    ];
}

/**
 * Retry pattern: re-executa step até maxAttempts em caso de erro.
 */
export function retryPattern(step: any, options: any = {}) {
    if (!step || typeof step !== 'object') return [];
    const maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts > 0 ? options.maxAttempts : 3;
    const backoffMs = Number.isFinite(options.backoffMs) ? options.backoffMs : 1000;
    return [
        Object.freeze({
            id: `retry-${step.libraryId || 'step'}-${Date.now()}`,
            libraryId: '_retry',
            pattern: 'retry',
            config: Object.freeze({
                wrappedStep: Object.freeze({ ...step }),
                maxAttempts,
                backoffMs,
            }),
        }),
    ];
}

/**
 * Fallback pattern: tenta primary; se falhar, executa secondary.
 */
export function fallbackPattern(primary: any, secondary: any) {
    if (!primary || !secondary) return [];
    return [
        Object.freeze({
            id: `fallback-${Date.now()}`,
            libraryId: '_fallback',
            pattern: 'fallback',
            config: Object.freeze({
                primary: Object.freeze({ ...primary }),
                secondary: Object.freeze({ ...secondary }),
            }),
        }),
    ];
}

/**
 * Circuit breaker pattern: para após N falhas consecutivas.
 */
export function circuitBreakerPattern(step: any, options: any = {}) {
    if (!step || typeof step !== 'object') return [];
    const failureThreshold =
        Number.isInteger(options.failureThreshold) && options.failureThreshold > 0 ? options.failureThreshold : 5;
    const resetTimeMs = Number.isFinite(options.resetTimeMs) ? options.resetTimeMs : 30000;
    return [
        Object.freeze({
            id: `circuitBreaker-${step.libraryId || 'step'}-${Date.now()}`,
            libraryId: '_circuitBreaker',
            pattern: 'circuitBreaker',
            config: Object.freeze({
                wrappedStep: Object.freeze({ ...step }),
                failureThreshold,
                resetTimeMs,
            }),
        }),
    ];
}

/**
 * Compose: concatena múltiplos arrays de steps em pipeline único.
 *
 * @param  {...Array<Object>} stepArrays
 * @returns {ReadonlyArray<Object>}
 */
export function composeSteps(...stepArrays: Array<Array<Object>>) {
        const out: Object[]= [];
    for (const arr of stepArrays) {
        if (Array.isArray(arr)) {
            for (const step of arr) {
                if (step) out.push(step);
            }
        }
    }
    return Object.freeze(out);
}

/**
 * Valida pipeline contra invariantes:
 *   - não-vazio
 *   - sem pattern aninhado >3 níveis
 *   - todos steps têm libraryId
 *
 * @param {Array<Object>} steps
 * @param {Object} [options]
 * @param {number} [options.maxDepth=3]
 * @returns {{valid: boolean, errors: any}}
 */
export function validatePipeline(steps: any, options: any = {}) {
        const errors: any[]= [];
    if (!Array.isArray(steps)) {
        errors.push('not_array');
        return Object.freeze({ valid: false, errors: Object.freeze(errors) });
    }
    if (steps.length === 0) {
        errors.push('empty');
        return Object.freeze({ valid: false, errors: Object.freeze(errors) });
    }
    const maxDepth = Number.isInteger(options.maxDepth) && options.maxDepth > 0 ? options.maxDepth : 3;

    function checkStep(step: any, depth: any) {
        if (!step || typeof step !== 'object') {
            errors.push('invalid_step');
            return;
        }
        if (!step.libraryId || typeof step.libraryId !== 'string') {
            errors.push('missing_libraryId');
        }
        if (depth > maxDepth) {
            errors.push(`max_depth_exceeded:${depth}`);
            return;
        }
        // Recursive: fork has nested branches
        if (step.config && Array.isArray(step.config.branches)) {
            for (const branch of step.config.branches) {
                if (Array.isArray(branch)) {
                    for (const sub of branch) {
                        checkStep(sub, depth + 1);
                    }
                }
            }
        }
        // wrappedStep (retry, circuitBreaker)
        if (step.config && step.config.wrappedStep) {
            checkStep(step.config.wrappedStep, depth + 1);
        }
    }
    for (const step of steps) {
        checkStep(step, 1);
    }

    return Object.freeze({
        valid: errors.length === 0,
        errors: Object.freeze(errors),
    });
}

/**
 * Sumariza patterns presentes no pipeline.
 *
 * @param {Array<any>} steps
 * @returns {{total: number, byPattern: any, hasFork: boolean, hasRetry: boolean}}
 */
export function summarizePatterns(steps: Array<any>): {total: number, byPattern: any, hasFork: boolean, hasRetry: boolean} {
    const empty = { total: 0, byPattern: {}, hasFork: false, hasRetry: false };
    if (!Array.isArray(steps) || steps.length === 0) return empty;

        const byPattern: Record<string, number>= {};
    let hasFork = false;
    let hasRetry = false;
    for (const step of steps) {
        const s = (step as any);
        if (!s || !s.pattern) continue;
        byPattern[s.pattern] = (byPattern[s.pattern] || 0) + 1;
        if (s.pattern === 'fork') hasFork = true;
        if (s.pattern === 'retry') hasRetry = true;
    }
    return Object.freeze({
        total: steps.length,
        byPattern,
        hasFork,
        hasRetry,
    });
}

/**
 * Module identity export.
 */
export const pipelinePatternsMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 21,
    deliveredAt: '2026-05-01',
    patterns: PATTERN_NAMES,
    exports: [
        'PATTERN_NAMES',
        'PATTERNS_META',
        'isValidPatternName',
        'mapPattern',
        'filterPattern',
        'reducePattern',
        'forkPattern',
        'joinPattern',
        'retryPattern',
        'fallbackPattern',
        'circuitBreakerPattern',
        'composeSteps',
        'validatePipeline',
        'summarizePatterns',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
