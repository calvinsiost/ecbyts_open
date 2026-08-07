// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Scene Perf Monitor — pure logic for WS-8 of SPEC_CODEBASE_WIDE_PERFORMANCE_REFACTOR.
 *
 * Records frame samples + emits per-window aggregate stats (p50, p95,
 * dropped frame count, average FPS). Pure: caller passes frame samples
 * via `recordFrame`; module accumulates internal state and emits frozen
 * snapshots via `getSnapshot`. No DOM, no rAF — caller drives.
 *
 * Design:
 *   - Ring buffer of last N samples (default 120 = 2s @ 60fps)
 *   - Snapshot computed on-demand (O(N log N) sort for p95)
 *   - Reset clears the buffer + counters
 *   - Threshold gates: frame > 33ms → dropped (mobile 30fps); > 50ms → janky
 *
 * Tests live in `tests/scene-perf-monitor-pure.test.mjs`.
 */

export interface FrameSample {
    readonly frameTimeMs: number;
    readonly geometryRebuilds?: number;
    readonly objectCount?: number;
}

export interface PerfSnapshot {
    readonly sampleCount: number;
    readonly meanFrameMs: number;
    readonly p50FrameMs: number;
    readonly p95FrameMs: number;
    readonly p99FrameMs: number;
    readonly maxFrameMs: number;
    readonly droppedFrames: number; // > 33ms
    readonly jankyFrames: number; // > 50ms
    readonly avgFps: number;
    readonly avgObjectCount: number;
    readonly totalGeometryRebuilds: number;
    readonly isHealthy: boolean;
}

export interface MonitorState {
    readonly samples: ReadonlyArray<FrameSample>;
    readonly bufferSize: number;
    readonly droppedFrames: number;
    readonly jankyFrames: number;
    readonly totalGeometryRebuilds: number;
}

const DEFAULT_BUFFER_SIZE = 120;
const DROPPED_THRESHOLD_MS = 33; // 30 FPS
const JANKY_THRESHOLD_MS = 50;

function isFiniteNonNeg(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/**
 * Initialise monitor state with empty buffer.
 */
export function createMonitorState(bufferSize?: number): MonitorState {
    const size = isFiniteNonNeg(bufferSize) && (bufferSize as number) > 0
        ? Math.floor(bufferSize as number)
        : DEFAULT_BUFFER_SIZE;
    return Object.freeze({
        samples: Object.freeze([]),
        bufferSize: size,
        droppedFrames: 0,
        jankyFrames: 0,
        totalGeometryRebuilds: 0,
    });
}

/**
 * Record a single frame sample. Returns NEW frozen state (append-only,
 * input untouched). Ring buffer wraps when full.
 */
export function recordFrame(state: MonitorState | null | undefined, sample: FrameSample): MonitorState {
    const current = state && typeof state === 'object' ? state : createMonitorState();
    if (!sample || !isFiniteNonNeg(sample.frameTimeMs)) return current;

    const cleanSample: FrameSample = Object.freeze({
        frameTimeMs: sample.frameTimeMs,
        geometryRebuilds: isFiniteNonNeg(sample.geometryRebuilds) ? sample.geometryRebuilds : 0,
        objectCount: isFiniteNonNeg(sample.objectCount) ? sample.objectCount : 0,
    });

    const newSamples = [...current.samples, cleanSample];
    while (newSamples.length > current.bufferSize) newSamples.shift();

    let dropped = current.droppedFrames;
    let janky = current.jankyFrames;
    if (sample.frameTimeMs >= DROPPED_THRESHOLD_MS) dropped++;
    if (sample.frameTimeMs >= JANKY_THRESHOLD_MS) janky++;

    return Object.freeze({
        samples: Object.freeze(newSamples),
        bufferSize: current.bufferSize,
        droppedFrames: dropped,
        jankyFrames: janky,
        totalGeometryRebuilds: current.totalGeometryRebuilds + (cleanSample.geometryRebuilds || 0),
    });
}

function percentile(sorted: ReadonlyArray<number>, p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx] as number;
}

/**
 * Compute a frozen perf snapshot from current state. Pure: O(N log N)
 * sort once, derive percentiles, mean, fps. WS-8 gate hooks: `isHealthy`
 * folds the four canonical gates.
 */
export function getSnapshot(state: MonitorState | null | undefined): PerfSnapshot {
    const s = state && typeof state === 'object' ? state : createMonitorState();
    const n = s.samples.length;
    if (n === 0) {
        return Object.freeze({
            sampleCount: 0,
            meanFrameMs: 0,
            p50FrameMs: 0,
            p95FrameMs: 0,
            p99FrameMs: 0,
            maxFrameMs: 0,
            droppedFrames: s.droppedFrames,
            jankyFrames: s.jankyFrames,
            avgFps: 0,
            avgObjectCount: 0,
            totalGeometryRebuilds: s.totalGeometryRebuilds,
            isHealthy: true,
        });
    }
    const frames = s.samples.map((sm) => sm.frameTimeMs);
    const sorted = [...frames].sort((a, b) => a - b);
    const sum = frames.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const avgFps = mean > 0 ? 1000 / mean : 0;
    const avgObj =
        s.samples.reduce((a, sm) => a + (sm.objectCount || 0), 0) / n;
    const p95 = percentile(sorted, 95);
    const isHealthy =
        avgFps >= 30 && // CS: ≥30 FPS mobile gate
        p95 <= JANKY_THRESHOLD_MS && // p95 ≤ 50ms gate
        s.droppedFrames / n < 0.1; // < 10% dropped frames gate

    return Object.freeze({
        sampleCount: n,
        meanFrameMs: mean,
        p50FrameMs: percentile(sorted, 50),
        p95FrameMs: p95,
        p99FrameMs: percentile(sorted, 99),
        maxFrameMs: sorted[sorted.length - 1] as number,
        droppedFrames: s.droppedFrames,
        jankyFrames: s.jankyFrames,
        avgFps,
        avgObjectCount: avgObj,
        totalGeometryRebuilds: s.totalGeometryRebuilds,
        isHealthy,
    });
}

/**
 * Reset all counters + clear buffer. Returns fresh state.
 */
export function resetMonitor(state: MonitorState | null | undefined): MonitorState {
    const size = state && typeof state === 'object' ? state.bufferSize : DEFAULT_BUFFER_SIZE;
    return createMonitorState(size);
}

/**
 * Convenience — `true` when geometry rebuilt more than once within
 * `windowSize` last samples (WS-8 gate: "Geometry rebuild duplicado no
 * mesmo frame = fail").
 */
export function hasDuplicateRebuild(state: MonitorState | null | undefined, windowSize = 2): boolean {
    if (!state || !Array.isArray(state.samples)) return false;
    const window = state.samples.slice(-Math.max(1, Math.floor(windowSize)));
    let total = 0;
    for (const s of window) total += s.geometryRebuilds || 0;
    return total > 1;
}
