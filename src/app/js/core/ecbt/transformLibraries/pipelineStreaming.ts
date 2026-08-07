// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pure streaming/chunking helpers for ECBT transformation pipelines.
 */

export interface StreamState {
    totalItems: number;
    chunkSize: number;
    processed: number;
    chunksProcessed: number;
    errors: Array<unknown>;
    startedAt: number;
    lastUpdateAt: number;
    results: Array<unknown>;
}

export interface ChunkResult {
    processed?: number;
    results?: Array<unknown>;
    errors?: Array<unknown>;
    at?: number;
}

export const DEFAULT_CONFIG = {
    chunkSize: 50,
} as const;

export const STREAMING_META = {
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 39,
    module: 'pipelineStreaming',
} as const;

export function createStreamState(
    totalItems: number,
    chunkSize: number = DEFAULT_CONFIG.chunkSize,
    startedAt: number = 0,
): StreamState {
    if (!Number.isFinite(totalItems) || totalItems < 0) {
        throw new TypeError('totalItems must be a non-negative finite number');
    }
    if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
        throw new TypeError('chunkSize must be a positive finite number');
    }
    const start = Number(startedAt) || 0;
    return {
        totalItems: Math.floor(totalItems),
        chunkSize: Math.floor(chunkSize),
        processed: 0,
        chunksProcessed: 0,
        errors: [],
        startedAt: start,
        lastUpdateAt: start,
        results: [],
    };
}

export function chunkBatch(
    items: Array<unknown>,
    chunkSize: number = DEFAULT_CONFIG.chunkSize,
): Array<Array<unknown>> {
    if (!Array.isArray(items)) {
        throw new TypeError('items must be an array');
    }
    if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
        throw new TypeError('chunkSize must be a positive finite number');
    }
    const size = Math.floor(chunkSize);
    const out: Array<Array<unknown>> = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size));
    }
    return out;
}

export function accumulateChunks(
    state: StreamState | null | undefined,
    chunkResult: ChunkResult | null | undefined,
): StreamState {
    if (!state || typeof state !== 'object') {
        throw new TypeError('state must be an object');
    }
    if (!chunkResult || typeof chunkResult !== 'object') {
        throw new TypeError('chunkResult must be an object');
    }

    const processedDelta =
        typeof chunkResult.processed === 'number' && Number.isFinite(chunkResult.processed)
            ? Math.max(0, Math.floor(chunkResult.processed))
            : 0;
    const newResults = Array.isArray(chunkResult.results) ? chunkResult.results : [];
    const newErrors = Array.isArray(chunkResult.errors) ? chunkResult.errors : [];
    const at =
        typeof chunkResult.at === 'number' && Number.isFinite(chunkResult.at) ? chunkResult.at : state.lastUpdateAt;
    const nextProcessed = Math.min(state.totalItems, state.processed + processedDelta);

    return {
        ...state,
        processed: nextProcessed,
        chunksProcessed: state.chunksProcessed + 1,
        errors: state.errors.concat(newErrors),
        results: state.results.concat(newResults),
        lastUpdateAt: at,
    };
}

export function isStreamComplete(state: StreamState | null | undefined): boolean {
    if (!state || typeof state !== 'object') return false;
    if (!Number.isFinite(state.totalItems) || !Number.isFinite(state.processed)) return false;
    return state.processed >= state.totalItems;
}

export function progressRatio(state: StreamState | null | undefined): number {
    if (!state || state.totalItems <= 0) return 1;
    return Math.max(0, Math.min(1, state.processed / state.totalItems));
}

export function summarizeStream(
    state: StreamState | null | undefined,
): Readonly<{
    total: number;
    processed: number;
    chunks: number;
    errors: number;
    complete: boolean;
    progress: number;
    durationMs: number;
    throughput: number;
}> {
    if (!state || typeof state !== 'object') {
        throw new TypeError('state must be an object');
    }
    const durationMs = Math.max(0, state.lastUpdateAt - state.startedAt);
    const throughput = durationMs > 0 ? state.processed / (durationMs / 1000) : 0;
    return Object.freeze({
        total: state.totalItems,
        processed: state.processed,
        chunks: state.chunksProcessed,
        errors: state.errors.length,
        complete: isStreamComplete(state),
        progress: progressRatio(state),
        durationMs,
        throughput,
    });
}