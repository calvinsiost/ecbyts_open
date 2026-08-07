// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * pipelineObservability — ECBT Transformation Libraries Phase 60
 * Pure-logic observability: spans, traces, stats, bottleneck detection.
 *
 * Zero browser/DOM/Three.js/Supabase/Promise/setTimeout dependencies.
 * All returned objects are frozen (immutable).
 */

export type SpanStatus = 'ok' | 'error' | 'timeout';

export interface SpanSpec {
    readonly id: string;
    readonly stepId: string;
    readonly startedAt: number;
    readonly duration: number;
    readonly status: SpanStatus | string;
    readonly meta?: Record<string, unknown>;
}

export interface Span {
    readonly id: string;
    readonly stepId: string;
    readonly startedAt: number;
    readonly duration: number;
    readonly status: SpanStatus;
    readonly meta: Readonly<Record<string, unknown>>;
}

export interface Trace {
    readonly runId: string;
    readonly spans: ReadonlyArray<Span>;
}

export interface TraceStats {
    readonly totalSpans: number;
    readonly okCount: number;
    readonly errorCount: number;
    readonly timeoutCount: number;
    readonly totalDuration: number;
    readonly avgDuration: number;
    readonly maxDuration: number;
    readonly minDuration: number;
}

export interface DetectBottlenecksOptions {
    readonly threshold?: number;
    readonly multiplier?: number;
}

export interface TraceSummary {
    readonly runId: string;
    readonly spans: number;
    readonly errors: number;
    readonly duration: string;
    readonly bottlenecks: number;
}

export const OBSERVABILITY_META: Readonly<{
    spec: string;
    phase: number;
    deliveredAt: string;
}> = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 60,
    deliveredAt: '2026-05-02',
});

export const SPAN_STATUS: ReadonlyArray<SpanStatus> = Object.freeze(['ok', 'error', 'timeout'] as const);

/**
 * Cria um span de execução imutável.
 */
export function createSpan(spec: SpanSpec): Span {
    if (spec === null || spec === undefined) {
        throw new Error('createSpan: spec is required');
    }
    if (!spec.id) throw new Error('createSpan: id is required');
    if (!spec.stepId) throw new Error('createSpan: stepId is required');
    if (spec.startedAt === undefined || spec.startedAt === null) {
        throw new Error('createSpan: startedAt is required');
    }
    if (spec.duration === undefined || spec.duration === null) {
        throw new Error('createSpan: duration is required');
    }
    if (!spec.status) throw new Error('createSpan: status is required');
    if (!(SPAN_STATUS as ReadonlyArray<string>).includes(spec.status)) {
        throw new Error(
            `createSpan: invalid status "${spec.status}". Must be one of: ${SPAN_STATUS.join(', ')}`,
        );
    }

    return Object.freeze({
        id: spec.id,
        stepId: spec.stepId,
        startedAt: spec.startedAt,
        duration: spec.duration,
        status: spec.status as SpanStatus,
        meta: spec.meta ? Object.freeze({ ...spec.meta }) : Object.freeze({}),
    });
}

/**
 * Cria um trace imutável — coleção de spans para um pipeline run.
 */
export function createTrace(runId: string, spans: ReadonlyArray<Span> = []): Trace {
    if (runId === null || runId === undefined || runId === '') {
        throw new Error('createTrace: runId is required');
    }
    return Object.freeze({
        runId,
        spans: Object.freeze([...spans]),
    });
}

/**
 * Adiciona um span a um trace, retornando novo trace frozen.
 */
export function addSpanToTrace(trace: Trace | null | undefined, span: Span): Trace | null {
    if (!trace) return null;
    return Object.freeze({
        runId: trace.runId,
        spans: Object.freeze([...trace.spans, span]),
    });
}

/**
 * Filtra spans do trace por status.
 */
export function filterSpans(
    trace: Trace | null | undefined,
    status: string,
): ReadonlyArray<Span> {
    if (!trace || !trace.spans || trace.spans.length === 0) return [];
    return trace.spans.filter((s) => s.status === status);
}

/**
 * Computa estatísticas do trace.
 */
export function computeTraceStats(trace: Trace | null | undefined): TraceStats {
    const zero: TraceStats = Object.freeze({
        totalSpans: 0,
        okCount: 0,
        errorCount: 0,
        timeoutCount: 0,
        totalDuration: 0,
        avgDuration: 0,
        maxDuration: 0,
        minDuration: 0,
    });

    if (!trace || !trace.spans || trace.spans.length === 0) return zero;

    const spans = trace.spans;
    let okCount = 0;
    let errorCount = 0;
    let timeoutCount = 0;
    let totalDuration = 0;
    let maxDuration = -Infinity;
    let minDuration = Infinity;

    for (const s of spans) {
        if (s.status === 'ok') okCount++;
        else if (s.status === 'error') errorCount++;
        else if (s.status === 'timeout') timeoutCount++;
        totalDuration += s.duration;
        if (s.duration > maxDuration) maxDuration = s.duration;
        if (s.duration < minDuration) minDuration = s.duration;
    }

    const totalSpans = spans.length;
    const avgDuration = totalDuration / totalSpans;

    return Object.freeze({
        totalSpans,
        okCount,
        errorCount,
        timeoutCount,
        totalDuration,
        avgDuration,
        maxDuration,
        minDuration,
    });
}

/**
 * Detecta gargalos: spans com duration > threshold.
 */
export function detectBottlenecks(
    trace: Trace | null | undefined,
    options: DetectBottlenecksOptions = {},
): ReadonlyArray<Span> {
    if (!trace || !trace.spans || trace.spans.length === 0) return [];

    const stats = computeTraceStats(trace);
    const multiplier = options.multiplier !== undefined ? options.multiplier : 2;
    const threshold =
        options.threshold !== undefined ? options.threshold : stats.avgDuration * multiplier;

    return trace.spans.filter((s) => s.duration > threshold);
}

/**
 * Sumariza trace para log.
 */
export function summarizeTrace(trace: Trace | null | undefined): TraceSummary {
    if (!trace) {
        return Object.freeze({ runId: '', spans: 0, errors: 0, duration: '0ms', bottlenecks: 0 });
    }

    const stats = computeTraceStats(trace);
    const bottlenecks = detectBottlenecks(trace);

    return Object.freeze({
        runId: trace.runId,
        spans: stats.totalSpans,
        errors: stats.errorCount,
        duration: `${stats.totalDuration}ms`,
        bottlenecks: bottlenecks.length,
    });
}

export const pipelineObservabilityMeta: Readonly<{
    module: string;
    spec: string;
    phase: number;
    exports: ReadonlyArray<string>;
    provenance: Readonly<{ generatedBy: string; disclaimerAcknowledged: boolean }>;
}> = Object.freeze({
    module: 'pipelineObservability',
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 60,
    exports: Object.freeze([
        'OBSERVABILITY_META',
        'SPAN_STATUS',
        'createSpan',
        'createTrace',
        'addSpanToTrace',
        'filterSpans',
        'computeTraceStats',
        'detectBottlenecks',
        'summarizeTrace',
        'pipelineObservabilityMeta',
    ] as const),
    provenance: Object.freeze({
        generatedBy: 'AI',
        disclaimerAcknowledged: true,
    }),
});
