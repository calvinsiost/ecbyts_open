// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Metrics & Analytics - Phase 28 (P1-5)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S28
 *
 * Phase 28 (2026-05-01) - pure-logic metrics extraction sobre pipeline
 * runs. Calcula throughput, latency percentiles, error rates, e produz
 * KPIs agregados para dashboards.
 *
 * Estratégia:
 *   - extractRunMetrics: snapshot por run
 *   - aggregateMetrics: roll-up por janela temporal
 *   - computePercentiles: p50/p95/p99 latency
 *   - errorRate / throughput / availability
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

import { toFiniteNumber } from '../../../utils/helpers/toFiniteNumber.js';

/** KPI metric types canônicos. */
export const METRIC_TYPES = Object.freeze([
    'throughput',
    'latency_p50',
    'latency_p95',
    'latency_p99',
    'error_rate',
    'availability',
    'success_count',
    'error_count',
]);

/** Identidade do módulo. */
export const PIPELINE_METRICS_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 28,
    deliveredAt: '2026-05-01',
    types: METRIC_TYPES,
});

/**
 * Verifica se metric type é canônico.
 */
export function isValidMetricType( type: any) {
    return typeof type === 'string' && METRIC_TYPES.includes(type);
}

/**
 * Computa percentil de array sorted asc.
 *
 * @param {Array<number>} sorted
 * @param {number} p (0..1)
 * @returns {number|null}
 */
export function percentile(sorted: Array<number>, p: number): number|null {
    if (!Array.isArray(sorted) || sorted.length === 0) return null;
    if (typeof p !== 'number' || p < 0 || p > 1) return null;
    const idx = Math.floor(p * (sorted.length - 1));
    return sorted[idx] ?? null;
}

/**
 * Extrai métricas de uma única run.
 *
 * @param {Record<string, any>} run {startedAt, finishedAt, status, durationMs, errors[]}
 * @returns {Object|null}
 */
export function extractRunMetrics(run: Record<string, any>): object|null {
    if (!run || typeof run !== 'object') return null;
    const status = run.status || 'unknown';
    const success = status === 'success' || status === 'completed';
    const failed = status === 'failed' || status === 'error';
    return Object.freeze({
        runId: run.id || null,
        startedAt: run.startedAt || null,
        finishedAt: run.finishedAt || null,
        durationMs: toFiniteNumber(run.durationMs, 0),
        success,
        failed,
        errorCount: Array.isArray(run.errors) ? run.errors.length : 0,
        stepCount: Number.isInteger(run.stepCount) ? run.stepCount : 0,
    });
}

/**
 * Agrega métricas de múltiplas runs.
 *
 * @param {Array<Object>} runs
 * @returns {Object}
 */
export function aggregateMetrics(runs: Array<object>): object {
    const empty = {
        total: 0,
        successCount: 0,
        errorCount: 0,
        successRate: 0,
        errorRate: 0,
        availability: 0,
        latencies: { p50: null, p95: null, p99: null, min: null, max: null, avg: null },
        totalErrors: 0,
        totalSteps: 0,
    };
    if (!Array.isArray(runs) || runs.length === 0) return Object.freeze(empty);

    const metrics = runs.map(extractRunMetrics).filter(Boolean);
    if (metrics.length === 0) return Object.freeze(empty);

    const successCount = metrics.filter(( m: any) => m && m.success).length;
    const errorCount = metrics.filter(( m: any) => m && m.failed).length;
    const totalErrors = metrics.reduce((sum, m: any) => sum + (m ? m.errorCount : 0), 0);
    const totalSteps = metrics.reduce((sum, m: any) => sum + (m ? m.stepCount : 0), 0);

    const durations = metrics
        .map(( m: any) => m && m.durationMs)
        .filter((d) => Number.isFinite(d) && d > 0)
        .sort((a, b) => a - b);

    const latencies = {
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        p99: percentile(durations, 0.99),
        min: durations.length > 0 ? durations[0] : null,
        max: durations.length > 0 ? durations[durations.length - 1] : null,
        avg: durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : null,
    };

    return Object.freeze({
        total: metrics.length,
        successCount,
        errorCount,
        successRate: metrics.length > 0 ? successCount / metrics.length : 0,
        errorRate: metrics.length > 0 ? errorCount / metrics.length : 0,
        availability: metrics.length > 0 ? successCount / metrics.length : 0,
        latencies: Object.freeze(latencies),
        totalErrors,
        totalSteps,
    });
}

/**
 * Computa throughput (runs por segundo) sobre janela.
 *
 * @param {Array<Object>} runs
 * @param {number} windowMs
 * @returns {number}
 */
export function computeThroughput(runs: Array<object>, windowMs: number): number {
    if (!Array.isArray(runs) || runs.length === 0) return 0;
    if (!Number.isFinite(windowMs) || windowMs <= 0) return 0;
    const seconds = windowMs / 1000;
    return runs.length / seconds;
}

/**
 * Bucket runs em janelas temporais.
 *
 * @param {Array<Object>} runs
 * @param {number} bucketMs
 * @returns {ReadonlyArray<{ bucket: string, runs: ReadonlyArray<Object> }>}
 */
export function bucketByTime(runs: Array<object>, bucketMs: number): ReadonlyArray<{ bucket: string, runs: ReadonlyArray<object> }> {
    if (!Array.isArray(runs) || runs.length === 0) return [];
    if (!Number.isFinite(bucketMs) || bucketMs <= 0) return [];
    const buckets: Map<number, object[]> = new Map();
    for (const r of runs) {
        if (!r || !((r as any).startedAt)) continue;
        const ms = Date.parse((r as any).startedAt);
        if (!Number.isFinite(ms)) continue;
        const bucketStart = Math.floor(ms / bucketMs) * bucketMs;
        if (!buckets.has(bucketStart)) buckets.set(bucketStart, []);
        (buckets.get(bucketStart) as object[]).push(r);
    }
    const out: Array<{ bucket: string, runs: ReadonlyArray<object> }> = [];
    const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
    for (const [bucket, list] of sorted) {
        out.push(
            Object.freeze({
                bucket: new Date(bucket).toISOString(),
                runs: Object.freeze([...list]),
            }),
        );
    }
    return Object.freeze(out);
}

/**
 * Calcula timeseries de KPI para cada bucket.
 *
 * @param {Array<Object>} runs
 * @param {number} bucketMs
 * @returns {ReadonlyArray<{ bucket: string, metrics: Object }>}
 */
export function computeTimeseries(runs: Array<object>, bucketMs: number): ReadonlyArray<{ bucket: string, metrics: object }> {
    const buckets = bucketByTime(runs, bucketMs);
    return Object.freeze(
        buckets.map((b) =>
            Object.freeze({
                bucket: b.bucket,
                metrics: aggregateMetrics((b.runs as unknown) as object[]),
            }),
        ),
    );
}

/**
 * Detecta anomalias simples (z-score > threshold).
 *
 * @param {Array<number>} values
 * @param {number} [threshold=2]
 * @returns {ReadonlyArray<{ index: number, value: number, zScore: number }>}
 */
export function detectAnomalies(values: Array<number>, threshold: number = 2): ReadonlyArray<{ index: number, value: number, zScore: number }> {
    if (!Array.isArray(values) || values.length === 0) return [];
    const n = values.length;
    const mean = values.reduce((s, v) => s + v, 0) / n;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return Object.freeze(([] as Array<{ index: number, value: number, zScore: number }>));
    const out: Array<{ index: number, value: number, zScore: number }> = [];
    for (let i = 0; i < n; i++) {
        const z = Math.abs(((values[i] as number) - mean) / stdDev);
        if (z > threshold) {
            out.push(Object.freeze({ index: i, value: values[i] as number, zScore: z }));
        }
    }
    return Object.freeze(out);
}

/**
 * Sumariza pipeline metrics report.
 */
export function summarizeMetrics( runs: any) {
    const agg = (aggregateMetrics(runs) as any);
    return Object.freeze({
        ...agg,
        healthy: agg.errorRate < 0.05 && agg.availability > 0.95,
        degraded: agg.errorRate >= 0.05 && agg.errorRate < 0.2,
        critical: agg.errorRate >= 0.2,
    });
}

/**
 * Module identity export.
 */
export const pipelineMetricsMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 28,
    deliveredAt: '2026-05-01',
    types: METRIC_TYPES,
    exports: [
        'METRIC_TYPES',
        'PIPELINE_METRICS_META',
        'isValidMetricType',
        'percentile',
        'extractRunMetrics',
        'aggregateMetrics',
        'computeThroughput',
        'bucketByTime',
        'computeTimeseries',
        'detectAnomalies',
        'summarizeMetrics',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
