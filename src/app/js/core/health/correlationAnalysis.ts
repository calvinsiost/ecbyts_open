// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   HEALTH-MON-001 Phase 4 - Environmental x biological correlation (S5)

   Pure Pearson correlation helpers for environmental time series and
   biomarker readings. No DOM, no IDB, no network.
   ================================================================ */

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface TimeSeriesPoint {
    readonly timestamp: number | string;
    readonly value: number;
}

export type CorrelationTrend = 'up' | 'down' | 'stable';
export type CorrelationLabel = 'possible_association' | 'weak_association' | 'no_association' | 'insufficient_data';

export interface CorrelationResult {
    readonly score: number | null;
    readonly trend: CorrelationTrend;
    readonly label: CorrelationLabel;
}

export interface CorrelationWorker {
    readonly id: string;
    readonly [key: string]: unknown;
}

export interface BiologicalReading {
    readonly workerId: string;
    readonly collectedAt?: number | string | null;
    readonly timestamp?: number | string | null;
    readonly value: number | string;
    readonly [key: string]: unknown;
}

export type EnvironmentalSeriesByParameter = Record<string, TimeSeriesPoint[]>;

export interface CorrelationMatrixEntry {
    readonly workerId: string;
    readonly parameter: string;
    readonly score: number | null;
    readonly trend: CorrelationTrend;
    readonly label: CorrelationLabel;
}

interface AlignedPair {
    readonly x: number;
    readonly y: number;
}

// ----------------------------------------------------------------
// Constants
// ----------------------------------------------------------------

const TEMPORAL_WINDOW_MS = 24 * 60 * 60 * 1000;
const MIN_COMMON_POINTS = 3;

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

function sampleNear(series: TimeSeriesPoint[], targetTs: number, windowMs: number): number | null {
    let best: number | null = null;
    let bestDist = Infinity;
    for (const pt of series) {
        const ts = typeof pt.timestamp === 'string' ? new Date(pt.timestamp).getTime() : Number(pt.timestamp);
        const dist = Math.abs(ts - targetTs);
        if (dist <= windowMs && dist < bestDist) {
            bestDist = dist;
            best = pt.value;
        }
    }
    return best;
}

function alignedPairs(envSeries: TimeSeriesPoint[], bioSeries: TimeSeriesPoint[]): AlignedPair[] {
    const pairs: AlignedPair[] = [];
    for (const ep of envSeries) {
        const ts = typeof ep.timestamp === 'string' ? new Date(ep.timestamp).getTime() : Number(ep.timestamp);
        const y = sampleNear(bioSeries, ts, TEMPORAL_WINDOW_MS);
        if (y !== null) {
            pairs.push({ x: ep.value, y });
        }
    }
    return pairs;
}

function pearson(pairs: AlignedPair[]): number | null {
    const n = pairs.length;
    const meanX = pairs.reduce((s, p) => s + p.x, 0) / n;
    const meanY = pairs.reduce((s, p) => s + p.y, 0) / n;

    let num = 0;
    let sumSqX = 0;
    let sumSqY = 0;

    for (const p of pairs) {
        const dx = p.x - meanX;
        const dy = p.y - meanY;
        num += dx * dy;
        sumSqX += dx * dx;
        sumSqY += dy * dy;
    }

    const denom = Math.sqrt(sumSqX * sumSqY);
    if (denom === 0) return null;
    return num / denom;
}

function associationLabel(score: number): CorrelationLabel {
    const abs = Math.abs(score);
    if (abs > 0.7) return 'possible_association';
    if (abs > 0.4) return 'weak_association';
    return 'no_association';
}

function trend(score: number): CorrelationTrend {
    if (score > 0.1) return 'up';
    if (score < -0.1) return 'down';
    return 'stable';
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

export function computeCorrelation(envSeries: unknown, bioSeries: unknown): CorrelationResult {
    if (!Array.isArray(envSeries) || !Array.isArray(bioSeries)) {
        return { score: null, trend: 'stable', label: 'insufficient_data' };
    }

    const pairs = alignedPairs(envSeries as TimeSeriesPoint[], bioSeries as TimeSeriesPoint[]);

    if (pairs.length < MIN_COMMON_POINTS) {
        return { score: null, trend: 'stable', label: 'insufficient_data' };
    }

    const score = pearson(pairs);

    if (score === null) {
        return { score: null, trend: 'stable', label: 'insufficient_data' };
    }

    return {
        score: Math.round(score * 1e6) / 1e6,
        trend: trend(score),
        label: associationLabel(score),
    };
}

export function buildCorrelationMatrix(
    workers: unknown,
    readings: unknown,
    envSeries: unknown,
): CorrelationMatrixEntry[] {
    const result: CorrelationMatrixEntry[] = [];

    if (!Array.isArray(workers) || !Array.isArray(readings) || !envSeries || typeof envSeries !== 'object') {
        return result;
    }

    const seriesByParameter = envSeries as EnvironmentalSeriesByParameter;
    const parameters = Object.keys(seriesByParameter);
    const typedWorkers = workers as CorrelationWorker[];
    const typedReadings = readings as BiologicalReading[];

    for (const worker of typedWorkers) {
        const workerReadings: TimeSeriesPoint[] = typedReadings
            .filter((r) => r.workerId === worker.id)
            .map((r) => ({
                timestamp: r.collectedAt ?? r.timestamp ?? 0,
                value: typeof r.value === 'number' ? r.value : parseFloat(r.value),
            }))
            .filter((r) => !Number.isNaN(r.value));

        for (const parameter of parameters) {
            const correlation = computeCorrelation(seriesByParameter[parameter], workerReadings);
            result.push({
                workerId: worker.id,
                parameter,
                score: correlation.score,
                trend: correlation.trend,
                label: correlation.label,
            });
        }
    }

    return result;
}
