// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Telemetry (Phase 17)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S17
 *
 * Phase 17 (2026-05-01) - pure-logic engine de telemetria para
 * pipelines. Coleta métricas de execução (timing, error rate,
 * throughput) sem dependência de browser/Supabase. Caller fornece
 * clock; sink é responsabilidade de upstream.
 *
 * Estratégia:
 *   - TelemetryRecorder: collector in-memory com flush API
 *   - Métricas canônicas: duration, status, errorMessage, attemptN
 *   - Aggregator: por pipelineId + janela temporal
 *   - Stats helpers: p50/p90/p99 latency, error rate, success rate
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

import { toFiniteNumber } from '../../../utils/helpers/toFiniteNumber.js';

interface TelemetryRecord {
    id: string;
    pipelineId: string;
    runId: string | null;
    status: string;
    startedAt: number;
    endedAt: number | null;
    durationMs: number;
    errorMessage: string | null;
    stepCount: number;
    attemptN: number;
    tokensIn: number;
    tokensOut: number;
    actorId: string | null;
}

interface TelemetryRecorder {
    add: (record: any) => boolean;
    flush: () => any[];
    snapshot: () => any[];
    size: () => number;
    clear: () => void;
    capacity: number;
}

interface LatencyStats {
    count: number;
    min: number;
    max: number;
    mean: number;
    p50: number;
    p90: number;
    p99: number;
}

interface StatusStats {
    total: number;
    success: number;
    failed: number;
    timeout: number;
    cancelled: number;
    partial: number;
    errorRate: number;
    successRate: number;
}

interface ThroughputWindow {
    fromMs: number;
    toMs: number;
}

/** Status canônicos de execução. */
export const EXECUTION_STATUS = Object.freeze(['success', 'failed', 'timeout', 'cancelled', 'partial']);

/** Identidade do módulo. */
export const TELEMETRY_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 17,
    deliveredAt: '2026-05-01',
    statuses: EXECUTION_STATUS,
});

/** Default capacity (records antes de flush forçado). */
const DEFAULT_CAPACITY = 1000;

function _validateRecordSpec(spec: unknown): asserts spec is Record<string, any> {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createRecord: spec required');
    }
    const s = spec as Record<string, any>;
    if (typeof s.pipelineId !== 'string' || !s.pipelineId.trim()) {
        throw new TypeError('createRecord: pipelineId required');
    }
    if (!EXECUTION_STATUS.includes(s.status)) {
        throw new TypeError(`createRecord: status must be one of ${EXECUTION_STATUS.join(',')}`);
    }
}

function _buildRecordId(spec: Record<string, any>): string {
    return spec.id || `${spec.pipelineId}:${spec.startedAt || Date.now()}`;
}

function _normalizeRecordTimestamps(spec: Record<string, any>): { startedAt: number; endedAt: number | null } {
    return {
        startedAt: toFiniteNumber(spec.startedAt, Date.now()),
        endedAt: Number.isFinite(spec.endedAt) ? spec.endedAt : null,
    };
}

function _computeRecordDurationMs(spec: Record<string, any>): number {
    if (Number.isFinite(spec.durationMs)) return spec.durationMs as number;
    if (Number.isFinite(spec.startedAt) && Number.isFinite(spec.endedAt)) {
        return (spec.endedAt as number) - (spec.startedAt as number);
    }
    return 0;
}

function _normalizeRecordCounts(spec: Record<string, any>): { stepCount: number; attemptN: number } {
    return {
        stepCount: Number.isInteger(spec.stepCount) ? (spec.stepCount as number) : 0,
        attemptN: Number.isInteger(spec.attemptN) ? (spec.attemptN as number) : 1,
    };
}

function _normalizeRecordTokens(spec: Record<string, any>): { tokensIn: number; tokensOut: number } {
    return {
        tokensIn: toFiniteNumber(spec.tokensIn, 0),
        tokensOut: toFiniteNumber(spec.tokensOut, 0),
    };
}

/**
 * Cria record de execução frozen.
 *
 * @param spec
 */
export function createRecord(spec: Record<string, any>): TelemetryRecord {
    _validateRecordSpec(spec);
    const timestamps = _normalizeRecordTimestamps(spec);
    const counts = _normalizeRecordCounts(spec);
    const tokens = _normalizeRecordTokens(spec);
    return Object.freeze({
        id: _buildRecordId(spec),
        pipelineId: spec.pipelineId,
        runId: spec.runId || null,
        status: spec.status,
        startedAt: timestamps.startedAt,
        endedAt: timestamps.endedAt,
        durationMs: _computeRecordDurationMs(spec),
        errorMessage: spec.errorMessage || null,
        stepCount: counts.stepCount,
        attemptN: counts.attemptN,
        tokensIn: tokens.tokensIn,
        tokensOut: tokens.tokensOut,
        actorId: spec.actorId || null,
    });
}

/**
 * Cria recorder in-memory.
 *
 * @param options
 */
export function createTelemetryRecorder(options: { capacity?: number } = {}): TelemetryRecorder {
    const capacity =
        Number.isInteger(options.capacity) && (options.capacity as number) > 0
            ? (options.capacity as number)
            : DEFAULT_CAPACITY;
    let records: any[] = [];

    return Object.freeze({
        add(record: any): boolean {
            if (!record || typeof record !== 'object') return false;
            if (!record.pipelineId || !EXECUTION_STATUS.includes(record.status)) return false;
            records.push(record);
            // Evict oldest if over capacity
            if (records.length > capacity) {
                records = records.slice(-capacity);
            }
            return true;
        },
        flush(): any[] {
            const out = [...records];
            records = [];
            return out;
        },
        snapshot(): any[] {
            return [...records];
        },
        size(): number {
            return records.length;
        },
        clear(): void {
            records = [];
        },
        capacity,
    });
}

/**
 * Agrega records por pipelineId.
 *
 * @param records
 */
export function groupByPipeline(records: Array<any>): Record<string, any[]> {
    if (!Array.isArray(records)) return {};
    const grouped: Record<string, any[]> = {};
    for (const r of records) {
        if (!r || !r.pipelineId) continue;
        if (!grouped[r.pipelineId]) grouped[r.pipelineId] = [];
        grouped[r.pipelineId]!.push(r);
    }
    return grouped;
}

/**
 * Computa percentil de array sorted ascending.
 *
 * @param sorted
 * @param p - 0-1
 */
export function percentile(sorted: Array<number>, p: number): number {
    if (!Array.isArray(sorted) || sorted.length === 0) return 0;
    if (!Number.isFinite(p) || p < 0 || p > 1) return 0;
    const idx = Math.floor(p * (sorted.length - 1));
    return sorted[idx] as number;
}

/**
 * Computa stats de durations.
 *
 * @param durations
 */
export function computeLatencyStats(durations: Array<number>): LatencyStats {
    const empty = { count: 0, min: 0, max: 0, mean: 0, p50: 0, p90: 0, p99: 0 };
    if (!Array.isArray(durations) || durations.length === 0) return empty;
    const valid = durations.filter((d) => Number.isFinite(d) && d >= 0);
    if (valid.length === 0) return empty;

    const sorted = [...valid].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
        count: sorted.length,
        min: sorted[0] as number,
        max: sorted[sorted.length - 1] as number,
        mean: sum / sorted.length,
        p50: percentile(sorted, 0.5),
        p90: percentile(sorted, 0.9),
        p99: percentile(sorted, 0.99),
    };
}

/**
 * Computa error rate, success rate.
 *
 * @param records
 */
export function computeStatusStats(records: Array<any>): StatusStats {
    const empty: StatusStats = {
        total: 0,
        success: 0,
        failed: 0,
        timeout: 0,
        cancelled: 0,
        partial: 0,
        errorRate: 0,
        successRate: 0,
    };
    if (!Array.isArray(records) || records.length === 0) return empty;

    const counts: Record<string, number> = { success: 0, failed: 0, timeout: 0, cancelled: 0, partial: 0 };
    for (const r of records) {
        if (!r || !r.status) continue;
        if (r.status in counts) counts[r.status]!++;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return empty;
    const errored = (counts.failed as number) + (counts.timeout as number);
    return {
        total,
        success: counts.success as number,
        failed: counts.failed as number,
        timeout: counts.timeout as number,
        cancelled: counts.cancelled as number,
        partial: counts.partial as number,
        errorRate: errored / total,
        successRate: (counts.success as number) / total,
    };
}

/**
 * Sumariza telemetria por pipeline.
 *
 * @param records
 */
export function summarizeByPipeline(records: Array<any>): Record<string, any> {
    if (!Array.isArray(records)) return {};
    const grouped = groupByPipeline(records);
    const out: Record<string, any> = {};
    for (const [pipelineId, rs] of Object.entries(grouped)) {
        const latency = computeLatencyStats(rs.map((r: any) => r.durationMs));
        const status = computeStatusStats(rs);
        const tokensIn = rs.reduce(
            (acc: number, r: any) => acc + (Number.isFinite(r.tokensIn) ? r.tokensIn : 0),
            0,
        );
        const tokensOut = rs.reduce(
            (acc: number, r: any) => acc + (Number.isFinite(r.tokensOut) ? r.tokensOut : 0),
            0,
        );
        out[pipelineId] = Object.freeze({
            pipelineId,
            recordCount: rs.length,
            latency,
            status,
            tokensIn,
            tokensOut,
        });
    }
    return Object.freeze(out);
}

/**
 * Filtra records por janela temporal.
 *
 * @param records
 * @param fromMs - inclusive
 * @param toMs - inclusive
 */
export function filterByWindow(records: Array<any>, fromMs: number, toMs: number): Array<any> {
    if (!Array.isArray(records)) return [];
    const _from = Number.isFinite(fromMs) ? fromMs : -Infinity;
    const _to = Number.isFinite(toMs) ? toMs : Infinity;
    return records.filter((r: any) => {
        if (!r || !Number.isFinite(r.startedAt)) return false;
        return r.startedAt >= _from && r.startedAt <= _to;
    });
}

/**
 * Filtra records por status.
 *
 * @param records
 * @param status
 */
export function filterByStatus(records: Array<any>, status: string): Array<any> {
    if (!Array.isArray(records)) return [];
    if (!EXECUTION_STATUS.includes(status)) return [];
    return records.filter((r: any) => r && r.status === status);
}

/**
 * Calcula throughput (records/sec) em janela.
 *
 * @param records
 * @param window
 */
export function computeThroughput(records: Array<any>, window: ThroughputWindow): number {
    if (!Array.isArray(records) || records.length === 0) return 0;
    if (!window || !Number.isFinite(window.fromMs) || !Number.isFinite(window.toMs)) return 0;
    const filtered = filterByWindow(records, window.fromMs, window.toMs);
    if (filtered.length === 0) return 0;
    const spanSec = (window.toMs - window.fromMs) / 1000;
    if (spanSec <= 0) return 0;
    return filtered.length / spanSec;
}

/**
 * Module identity export.
 */
export const pipelineTelemetryMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 17,
    deliveredAt: '2026-05-01',
    statuses: EXECUTION_STATUS,
    exports: [
        'EXECUTION_STATUS',
        'TELEMETRY_META',
        'createRecord',
        'createTelemetryRecorder',
        'groupByPipeline',
        'percentile',
        'computeLatencyStats',
        'computeStatusStats',
        'summarizeByPipeline',
        'filterByWindow',
        'filterByStatus',
        'computeThroughput',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
