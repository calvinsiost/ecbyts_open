// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Cost Estimation (Phase 14)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S14
 *
 * Phase 14 (2026-05-01) - pure-logic engine de estimação de custo de
 * execução de pipelines ANTES de rodar. Permite projetar tempo, memória
 * e tokens (LLM) por pipeline para budgeting/quotas.
 *
 * Estratégia:
 *   - Catálogo de cost profiles por libraryId (frozen)
 *   - Métricas: timeMs, memoryMB, tokensIn, tokensOut, ioOps
 *   - Modelo: cost(step) = baseCost + sizeMultiplier × inputSize
 *   - Aggregação: soma sequencial (pipelines linear) com overhead 5%
 *   - Helpers: estimateStep, estimatePipeline, formatCost, gateBudget
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Métricas canônicas. */
export const COST_METRICS = Object.freeze(['timeMs', 'memoryMB', 'tokensIn', 'tokensOut', 'ioOps']);

/** Default profile (used when libraryId not in catalog). */
export const DEFAULT_PROFILE = Object.freeze({
    timeMs: { base: 10, perItem: 0.05 },
    memoryMB: { base: 1, perItem: 0.001 },
    tokensIn: { base: 0, perItem: 0 },
    tokensOut: { base: 0, perItem: 0 },
    ioOps: { base: 1, perItem: 0 },
});

/** Catálogo de cost profiles canônicos por libraryId. */
export const COST_PROFILES = Object.freeze({
    validate: Object.freeze({
        timeMs: { base: 5, perItem: 0.02 },
        memoryMB: { base: 0.5, perItem: 0.0005 },
        tokensIn: { base: 0, perItem: 0 },
        tokensOut: { base: 0, perItem: 0 },
        ioOps: { base: 0, perItem: 0 },
    }),
    transform: Object.freeze({
        timeMs: { base: 20, perItem: 0.1 },
        memoryMB: { base: 2, perItem: 0.002 },
        tokensIn: { base: 0, perItem: 0 },
        tokensOut: { base: 0, perItem: 0 },
        ioOps: { base: 0, perItem: 0 },
    }),
    aggregate: Object.freeze({
        timeMs: { base: 50, perItem: 0.2 },
        memoryMB: { base: 5, perItem: 0.005 },
        tokensIn: { base: 0, perItem: 0 },
        tokensOut: { base: 0, perItem: 0 },
        ioOps: { base: 0, perItem: 0 },
    }),
    'llm-summarize': Object.freeze({
        timeMs: { base: 2000, perItem: 50 },
        memoryMB: { base: 50, perItem: 0 },
        tokensIn: { base: 100, perItem: 4 },
        tokensOut: { base: 50, perItem: 0.5 },
        ioOps: { base: 1, perItem: 0 },
    }),
    'llm-extract': Object.freeze({
        timeMs: { base: 1500, perItem: 30 },
        memoryMB: { base: 50, perItem: 0 },
        tokensIn: { base: 80, perItem: 3 },
        tokensOut: { base: 30, perItem: 0.3 },
        ioOps: { base: 1, perItem: 0 },
    }),
    export: Object.freeze({
        timeMs: { base: 100, perItem: 0.5 },
        memoryMB: { base: 10, perItem: 0.01 },
        tokensIn: { base: 0, perItem: 0 },
        tokensOut: { base: 0, perItem: 0 },
        ioOps: { base: 5, perItem: 1 },
    }),
    'compliance-check': Object.freeze({
        timeMs: { base: 30, perItem: 0.5 },
        memoryMB: { base: 2, perItem: 0.002 },
        tokensIn: { base: 0, perItem: 0 },
        tokensOut: { base: 0, perItem: 0 },
        ioOps: { base: 1, perItem: 0 },
    }),
});

/** Overhead de orquestração entre steps (5%). */
const PIPELINE_OVERHEAD_RATIO = 0.05;

/** Identidade do módulo. */
export const PIPELINE_COST_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 14,
    deliveredAt: '2026-05-01',
    metrics: COST_METRICS,
    overheadRatio: PIPELINE_OVERHEAD_RATIO,
    profilesCount: Object.keys(COST_PROFILES).length,
});

/**
 * Resolve profile para libraryId (com fallback).
 *
 * @param {string} libraryId
 * @returns {Object} profile frozen
 */
export function resolveProfile(libraryId: string): object {
    if (typeof libraryId !== 'string' || !libraryId) return DEFAULT_PROFILE;
    const profiles = COST_PROFILES as Record<string, any>;
    return profiles[libraryId] || DEFAULT_PROFILE;
}

/**
 * Estima custo de UM step.
 *
 * @param {{libraryId: string, config?: Object}} step
 * @param {{inputSize?: number, applyOverhead?: boolean}} [context]
 * @returns {Readonly<{timeMs: number, memoryMB: number, tokensIn: number, tokensOut: number, ioOps: number, libraryId: string|null}>}
 */
export function estimateStep(
    step: { libraryId: string; config?: object },
    context: { inputSize?: number; applyOverhead?: boolean } = {},
): Readonly<{
    timeMs: number;
    memoryMB: number;
    tokensIn: number;
    tokensOut: number;
    ioOps: number;
    libraryId: string | null;
}> {
    if (!step || typeof step !== 'object') {
        return Object.freeze({
            timeMs: 0,
            memoryMB: 0,
            tokensIn: 0,
            tokensOut: 0,
            ioOps: 0,
            libraryId: null as string | null,
        });
    }
    const libraryId = String(step.libraryId || '').trim();
    const profile = resolveProfile(libraryId) as Record<string, { base: number; perItem: number }>;
    const ctxSize = Number(context.inputSize);
    const inputSize = Number.isFinite(ctxSize) && ctxSize >= 0 ? ctxSize : 100;

    const result: Record<string, any> = { libraryId };
    for (const metric of COST_METRICS) {
        const m = profile[metric] || { base: 0, perItem: 0 };
        result[metric] = m.base + m.perItem * inputSize;
    }
    return Object.freeze(result as any);
}

/**
 * Estima custo total de um pipeline.
 *
 * @param {Array<{libraryId: string, config?: Object}>} pipeline
 * @param {{inputSize?: number, applyOverhead?: boolean}} [context]
 * @returns {Readonly<{stepCount: number, byStep: any[], totals: {timeMs: number, memoryMB: number, tokensIn: number, tokensOut: number, ioOps: number}, overhead: {timeMs: number, memoryMB: number}}>}
 */
export function estimatePipeline(
    pipeline: Array<{ libraryId: string; config?: object }>,
    context: { inputSize?: number; applyOverhead?: boolean } = {},
): Readonly<{
    stepCount: number;
    byStep: any[];
    totals: { timeMs: number; memoryMB: number; tokensIn: number; tokensOut: number; ioOps: number };
    overhead: { timeMs: number; memoryMB: number };
}> {
    const empty = {
        stepCount: 0,
        byStep: [],
        totals: { timeMs: 0, memoryMB: 0, tokensIn: 0, tokensOut: 0, ioOps: 0 },
        overhead: { timeMs: 0, memoryMB: 0 },
    };
    if (!Array.isArray(pipeline) || pipeline.length === 0) {
        return Object.freeze(empty as any);
    }

    const applyOverhead = context.applyOverhead !== false;
    const byStep = pipeline.map((step) => estimateStep(step, context));
    const totals = {
        timeMs: 0,
        memoryMB: 0,
        tokensIn: 0,
        tokensOut: 0,
        ioOps: 0,
    };
    for (const s of byStep) {
        totals.timeMs += s.timeMs;
        // Memória é o pico, não soma - usar max
        totals.memoryMB = Math.max(totals.memoryMB, s.memoryMB);
        totals.tokensIn += s.tokensIn;
        totals.tokensOut += s.tokensOut;
        totals.ioOps += s.ioOps;
    }
    const overhead = {
        timeMs: applyOverhead ? totals.timeMs * PIPELINE_OVERHEAD_RATIO : 0,
        memoryMB: applyOverhead ? totals.memoryMB * 0.1 : 0,
    };
    if (applyOverhead) {
        totals.timeMs += overhead.timeMs;
        totals.memoryMB += overhead.memoryMB;
    }

    return Object.freeze({
        stepCount: pipeline.length,
        byStep,
        totals,
        overhead,
    } as any);
}

/**
 * Formata custo em string human-friendly.
 *
 * @param {{timeMs?: number, memoryMB?: number, tokensIn?: number, tokensOut?: number, ioOps?: number}} cost
 * @returns {string}
 */
export function formatCost(cost: {
    timeMs?: number;
    memoryMB?: number;
    tokensIn?: number;
    tokensOut?: number;
    ioOps?: number;
}): string {
    if (!cost || typeof cost !== 'object') return '(invalid cost)';
    const parts = [];
    const timeMs = Number(cost.timeMs);
    if (Number.isFinite(timeMs)) {
        if (timeMs >= 1000) {
            parts.push(`${(timeMs / 1000).toFixed(2)}s`);
        } else {
            parts.push(`${timeMs.toFixed(0)}ms`);
        }
    }
    const memoryMB = Number(cost.memoryMB);
    if (Number.isFinite(memoryMB) && memoryMB > 0) {
        if (memoryMB >= 1024) {
            parts.push(`${(memoryMB / 1024).toFixed(2)}GB`);
        } else {
            parts.push(`${memoryMB.toFixed(1)}MB`);
        }
    }
    const tokensIn = Number(cost.tokensIn);
    if (Number.isFinite(tokensIn) && tokensIn > 0) {
        parts.push(`${tokensIn.toFixed(0)}tk-in`);
    }
    const tokensOut = Number(cost.tokensOut);
    if (Number.isFinite(tokensOut) && tokensOut > 0) {
        parts.push(`${tokensOut.toFixed(0)}tk-out`);
    }
    const ioOps = Number(cost.ioOps);
    if (Number.isFinite(ioOps) && ioOps > 0) {
        parts.push(`${ioOps.toFixed(0)}io`);
    }
    return parts.join(' · ');
}

/**
 * Verifica se custo cabe em budget.
 *
 * @param {Record<string, any>} cost - totals from estimatePipeline
 * @param {Record<string, any>} any> - limits per metric
 * @returns {{passed: boolean, exceeded: Array<{metric: string, value: number|null, limit: number|null}>}}
 */
export function evaluateCostBudget(
    cost: Record<string, any>,
    budget: Record<string, any>,
): { passed: boolean; exceeded: Array<{ metric: string; value: number | null; limit: number | null }> } {
    if (!cost || typeof cost !== 'object') {
        return { passed: false, exceeded: [{ metric: 'cost', value: null, limit: null }] };
    }
    if (!budget || typeof budget !== 'object') {
        return { passed: true, exceeded: [] };
    }
    const exceeded: Array<{ metric: string; value: number | null; limit: number | null }> = [];
    const costRec = cost as Record<string, any>;
    const budgetRec = budget as Record<string, any>;
    for (const metric of COST_METRICS) {
        if (!Number.isFinite(budgetRec[metric])) continue;
        const value = Number.isFinite(costRec[metric]) ? costRec[metric] : 0;
        if (value > budgetRec[metric]) {
            exceeded.push({ metric, value, limit: budgetRec[metric] });
        }
    }
    return { passed: exceeded.length === 0, exceeded };
}

/**
 * Compara custos de DOIS pipelines (a - b).
 *
 * @param {Record<string, any>} costA - totals
 * @param {Record<string, any>} any> - totals
 * @returns {Readonly<{timeMs: number, memoryMB: number, tokensIn: number, tokensOut: number, ioOps: number, ratio: number}>}
 */
export function compareCosts(
    costA: Record<string, any>,
    costB: Record<string, any>,
): Readonly<{
    timeMs: number;
    memoryMB: number;
    tokensIn: number;
    tokensOut: number;
    ioOps: number;
    ratio: number;
}> {
    const empty = { timeMs: 0, memoryMB: 0, tokensIn: 0, tokensOut: 0, ioOps: 0, ratio: 1 };
    if (!costA || !costB || typeof costA !== 'object' || typeof costB !== 'object') {
        return Object.freeze(empty);
    }
    const diff: Record<string, number> = { ratio: 1 };
    for (const metric of COST_METRICS) {
        const a = Number.isFinite(costA[metric]) ? costA[metric] : 0;
        const b = Number.isFinite(costB[metric]) ? costB[metric] : 0;
        diff[metric] = a - b;
    }
    if (Number.isFinite(costB.timeMs) && costB.timeMs > 0) {
        diff.ratio = (costA.timeMs || 0) / costB.timeMs;
    }
    return Object.freeze(diff as any);
}

/**
 * Module identity export.
 */
export const pipelineCostMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 14,
    deliveredAt: '2026-05-01',
    metrics: COST_METRICS,
    overheadRatio: PIPELINE_OVERHEAD_RATIO,
    profilesCount: Object.keys(COST_PROFILES).length,
    exports: [
        'COST_METRICS',
        'DEFAULT_PROFILE',
        'COST_PROFILES',
        'PIPELINE_COST_META',
        'resolveProfile',
        'estimateStep',
        'estimatePipeline',
        'formatCost',
        'evaluateCostBudget',
        'compareCosts',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
