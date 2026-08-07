// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Profiler - Phase 36 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S36
 *
 * Phase 36 (2026-05-02) - pure-logic profiler para pipeline runs.
 * Captura timing per-step, identifica hot paths, computa percentage
 * breakdown, e detecta gargalos.
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Hot path classification thresholds. */
export const HOT_PATH_THRESHOLDS = Object.freeze({
    cold: 0.05,
    warm: 0.15,
    hot: 0.4,
    critical: 1.0,
});

/** Identidade do módulo. */
export const PROFILER_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 36,
    deliveredAt: '2026-05-02',
});

/**
 * Cria timing record frozen.
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createTiming(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createTiming: spec required');
    }
    if (!Number.isInteger(spec.stepIndex) || spec.stepIndex < 0) {
        throw new TypeError('createTiming: stepIndex required (non-negative integer)');
    }
    if (!Number.isFinite(spec.durationMs) || spec.durationMs < 0) {
        throw new TypeError('createTiming: durationMs required (non-negative number)');
    }
    return Object.freeze({
        stepIndex: spec.stepIndex,
        libraryId: spec.libraryId || null,
        durationMs: spec.durationMs,
        startedAt: spec.startedAt || null,
        finishedAt: spec.finishedAt || null,
        success: spec.success !== false,
    });
}

/**
 * Computa total duration (sum).
 */
export function totalDuration( timings: any) {
    if (!Array.isArray(timings)) return 0;
    return timings.reduce((acc, t) => acc + (Number.isFinite(t?.durationMs) ? t.durationMs : 0), 0);
}

/**
 * Computa percentage breakdown por step.
 *
 * @param {Array<any>} timings
 * @returns {ReadonlyArray<any>}
 */
export function percentBreakdown(timings: Array<any>): ReadonlyArray<any> {
    if (!Array.isArray(timings) || timings.length === 0) return [];
    const total = totalDuration(timings);
    if (total === 0) {
        return (
            Object.freeze(timings.map((t) => Object.freeze({ ...t, percent: 0 }))) as ReadonlyArray<any>
        );
    }
    return (
        Object.freeze(
            timings.map((t) =>
                Object.freeze({
                    stepIndex: t.stepIndex,
                    libraryId: t.libraryId,
                    durationMs: t.durationMs,
                    percent: t.durationMs / total,
                }),
            ),
        ) as ReadonlyArray<any>
    );
}

/**
 * Classifica step como hot path baseado em percent.
 *
 * @param {number} percent (0..1)
 * @returns {string} cold|warm|hot|critical
 */
export function classifyHotPath(percent: number): string {
    if (!Number.isFinite(percent) || percent < 0) return 'cold';
    if (percent < HOT_PATH_THRESHOLDS.cold) return 'cold';
    if (percent < HOT_PATH_THRESHOLDS.warm) return 'warm';
    if (percent < HOT_PATH_THRESHOLDS.hot) return 'hot';
    return 'critical';
}

/**
 * Identifica hot paths (steps com percent acima do threshold).
 *
 * @param {Array<any>} timings
 * @param {number} [threshold=0.15]
 * @returns {ReadonlyArray<any>}
 */
export function identifyHotPaths(timings: Array<any>, threshold: number = HOT_PATH_THRESHOLDS.warm): ReadonlyArray<any> {
    if (!Array.isArray(timings) || timings.length === 0) return [];
    const breakdown = percentBreakdown(timings);
    return (
        Object.freeze(
            breakdown
                .filter((t) => t.percent >= threshold)
                .map((t) => Object.freeze({ ...t, classification: classifyHotPath(t.percent) })),
        ) as ReadonlyArray<any>
    );
}

/**
 * Detecta gargalo (single step > N% do total).
 *
 * @param {Array<any>} timings
 * @returns {any}
 */
export function detectBottleneck(timings: Array<any>): any {
    if (!Array.isArray(timings) || timings.length === 0) return null;
    const breakdown = percentBreakdown(timings);
    let max: any = null;
    for (const t of breakdown) {
        if (!max || t.percent > max.percent) max = t;
    }
    if (!max || max.percent < HOT_PATH_THRESHOLDS.hot) return null;
    return Object.freeze({ ...max, classification: classifyHotPath(max.percent) });
}

/**
 * Sort timings por durationMs desc.
 */
export function sortByDuration( timings: any) {
    if (!Array.isArray(timings)) return [];
    return Object.freeze([...timings].sort((a, b) => (b?.durationMs || 0) - (a?.durationMs || 0)));
}

/**
 * Top-N steps por duration.
 */
export function topNByDuration( timings: any, n = 5) {
    if (!Array.isArray(timings) || !Number.isInteger(n) || n <= 0) return [];
    return Object.freeze(sortByDuration(timings).slice(0, n));
}

/**
 * Computa estatísticas de timing (mean, median, stddev).
 */
export function computeStats( timings: any) {
    const empty = { count: 0, mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };
    if (!Array.isArray(timings) || timings.length === 0) return empty;
    const durations = timings
        .map((t) => t?.durationMs)
        .filter((d) => Number.isFinite(d) && d >= 0)
        .sort((a, b) => a - b);
    if (durations.length === 0) return empty;
    const sum = durations.reduce((a, b) => a + b, 0);
    const mean = sum / durations.length;
    const variance = durations.reduce((acc, d) => acc + (d - mean) ** 2, 0) / durations.length;
    const median =
        durations.length % 2 === 0
            ? (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2
            : durations[Math.floor(durations.length / 2)];
    return Object.freeze({
        count: durations.length,
        mean,
        median,
        stdDev: Math.sqrt(variance),
        min: durations[0],
        max: durations[durations.length - 1],
    });
}

/**
 * Computa speedup factor entre 2 runs (baseline / current).
 */
export function computeSpeedup( baselineTimings: any,  currentTimings: any) {
    const baseline = totalDuration(baselineTimings);
    const current = totalDuration(currentTimings);
    if (current === 0) return null;
    return Object.freeze({
        baselineMs: baseline,
        currentMs: current,
        speedupFactor: baseline / current,
        improvementPercent: baseline > 0 ? (baseline - current) / baseline : 0,
    });
}

/**
 * Sumariza profiler report.
 */
export function summarizeProfile( timings: any) {
    const empty = {
        stepCount: 0,
        totalMs: 0,
        hotPathCount: 0,
        bottleneck: null,
        stats: { count: 0, mean: 0, median: 0, stdDev: 0, min: 0, max: 0 },
    };
    if (!Array.isArray(timings) || timings.length === 0) return empty;
    const hotPaths = identifyHotPaths(timings);
    const bottleneck = detectBottleneck(timings);
    return Object.freeze({
        stepCount: timings.length,
        totalMs: totalDuration(timings),
        hotPathCount: hotPaths.length,
        bottleneck,
        stats: computeStats(timings),
    });
}

/**
 * Module identity export.
 */
export const pipelineProfilerMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 36,
    deliveredAt: '2026-05-02',
    exports: [
        'HOT_PATH_THRESHOLDS',
        'PROFILER_META',
        'createTiming',
        'totalDuration',
        'percentBreakdown',
        'classifyHotPath',
        'identifyHotPaths',
        'detectBottleneck',
        'sortByDuration',
        'topNByDuration',
        'computeStats',
        'computeSpeedup',
        'summarizeProfile',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
