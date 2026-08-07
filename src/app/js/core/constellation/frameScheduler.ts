// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Frame Scheduler - Phase 1.11 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S11
 *
 * Phase 1.11 (2026-05-01) - pure-logic helpers para animation frame
 * budgeting, FPS estimation e frame skipping. NÃO cria RAF real
 * (módulo testável em Node sem requestAnimationFrame).
 *
 * Estratégia:
 *   - Injectable clock via dependency injection (clock.now())
 *   - FrameBudget: contabiliza tempo gasto vs budget alvo (16.67ms = 60fps)
 *   - FpsEstimator: rolling window de N timestamps para FPS suavizado
 *   - FrameSkipper: decide se deve pular frame baseado em backlog
 *   - createFrameLoop: factory de loop pure-logic (caller fornece RAF)
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Targets canônicos de FPS. */
export const FPS_TARGETS = Object.freeze({
    LOW: 30,
    STANDARD: 60,
    HIGH: 120,
});

/** Budget por frame em ms. */
export const FRAME_BUDGETS_MS = Object.freeze({
    30: 33.33,
    60: 16.67,
    120: 8.33,
});

/** Estado de saúde do FPS. */
export const FPS_HEALTH = Object.freeze(['healthy', 'degraded', 'critical']);

/** Identidade do módulo. */
export const FRAME_SCHEDULER_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.11',
    deliveredAt: '2026-05-01',
    fpsTargets: FPS_TARGETS,
    healths: FPS_HEALTH,
});

/**
 * Calcula budget de frame em ms para um target FPS.
 *
 * @param {number} fps - target frames per second
 * @returns {number} budget em ms
 */
export function frameBudgetMs(fps: number): number {
    if (!Number.isFinite(fps) || fps <= 0) return Infinity;
    return 1000 / fps;
}

/**
 * Cria um budget tracker para 1 frame.
 *
 * @param {number} targetFps
 * @param {{now: () => number}} [clock]
 * @returns {{start: () => void, elapsed: () => number, remaining: () => number, exceeded: () => boolean, ratio: () => number}}
 */
export function createFrameBudget(targetFps: number = FPS_TARGETS.STANDARD, clock?: {now: () => number}): {start: () => void, elapsed: () => number, remaining: () => number, exceeded: () => boolean, ratio: () => number} {
    const _clock = clock && typeof clock.now === 'function' ? clock : { now: () => Date.now() };
    const budget = frameBudgetMs(targetFps);
    let startTime = _clock.now();

    return Object.freeze({
        start() {
            startTime = _clock.now();
        },
        elapsed() {
            return _clock.now() - startTime;
        },
        remaining() {
            return Math.max(0, budget - (_clock.now() - startTime));
        },
        exceeded() {
            return _clock.now() - startTime > budget;
        },
        ratio() {
            const e = _clock.now() - startTime;
            return budget > 0 ? e / budget : 0;
        },
        budget,
    });
}

/**
 * FpsEstimator com rolling window.
 *
 * @param {number} [windowSize=30] - número de samples
 * @param {{now: () => number}} [clock]
 * @returns {{tick: () => number, fps: () => number, reset: () => void, samples: () => number}}
 */
export function createFpsEstimator(windowSize: number = 30, clock?: {now: () => number}): {tick: () => number, fps: () => number, reset: () => void, samples: () => number} {
    const _clock = clock && typeof clock.now === 'function' ? clock : { now: () => Date.now() };
    const _window = Math.max(2, Number.isInteger(windowSize) ? windowSize : 30);
        let timestamps: any[]= [];

    return Object.freeze({
        tick() {
            const now = _clock.now();
            timestamps.push(now);
            if (timestamps.length > _window) {
                timestamps = timestamps.slice(-_window);
            }
            return timestamps.length;
        },
        fps() {
            if (timestamps.length < 2) return 0;
            const first = timestamps[0];
            const last = timestamps[timestamps.length - 1];
            const span = last - first;
            if (span <= 0) return 0;
            return ((timestamps.length - 1) * 1000) / span;
        },
        reset() {
            timestamps = [];
        },
        samples() {
            return timestamps.length;
        },
        windowSize: _window,
    });
}

/**
 * Classifica saúde do FPS dado target e atual.
 *
 * @param {number} currentFps
 * @param {number} targetFps
 * @returns {'healthy'|'degraded'|'critical'}
 */
export function classifyFpsHealth(currentFps: number, targetFps: number = FPS_TARGETS.STANDARD): 'healthy'|'degraded'|'critical' {
    if (!Number.isFinite(currentFps) || currentFps <= 0) return 'critical';
    if (!Number.isFinite(targetFps) || targetFps <= 0) return 'critical';
    const ratio = currentFps / targetFps;
    if (ratio >= 0.9) return 'healthy';
    if (ratio >= 0.5) return 'degraded';
    return 'critical';
}

/**
 * FrameSkipper - decide se pula próximo frame baseado em backlog acumulado.
 *
 * @param {number} [maxBacklog=2] - frames atrasados antes de skipar
 * @returns {{shouldSkip: () => boolean, addBacklog: () => number, decreaseBacklog: () => number, reset: () => void, backlog: () => number}}
 */
export function createFrameSkipper(maxBacklog: number = 2): {shouldSkip: () => boolean, addBacklog: () => number, decreaseBacklog: () => number, reset: () => void, backlog: () => number} {
    const _max = Math.max(1, Number.isInteger(maxBacklog) ? maxBacklog : 2);
    let backlog = 0;

    return Object.freeze({
        shouldSkip() {
            return backlog >= _max;
        },
        addBacklog(n = 1) {
            backlog = Math.min(_max * 4, backlog + (Number.isFinite(n) ? n : 1));
            return backlog;
        },
        decreaseBacklog(n = 1) {
            backlog = Math.max(0, backlog - (Number.isFinite(n) ? n : 1));
            return backlog;
        },
        reset() {
            backlog = 0;
        },
        backlog() {
            return backlog;
        },
        maxBacklog: _max,
    });
}

/**
 * Cria descrição pure-logic de uma loop de animação.
 * Caller é responsável por chamar tick() em cada RAF.
 *
 * @param {Object} options
 * @param {number} [options.targetFps=60]
 * @param {Function} [options.onFrame] - callback(deltaMs, frameIndex)
 * @param {{now: () => number}} [options.clock]
 * @returns {{tick: () => any, frameCount: () => number, isRunning: () => boolean, start: () => void, stop: () => void, reset: () => void}}
 */
export function createFrameLoop(options: { targetFps?: number; onFrame?: Function; clock?: {now: () => number} } = {}): {tick: () => any, frameCount: () => number, isRunning: () => boolean, start: () => void, stop: () => void, reset: () => void} {
    const _clock = options.clock && typeof options.clock.now === 'function' ? options.clock : { now: () => Date.now() };
    const targetFps = options.targetFps || FPS_TARGETS.STANDARD;
    const onFrame = typeof options.onFrame === 'function' ? options.onFrame : () => {};
    const minDelta = frameBudgetMs(targetFps);

    let running = false;
    let frameIndex = 0;
        let lastTickAt: any= null;

    return Object.freeze({
        start() {
            if (running) return false;
            running = true;
            lastTickAt = _clock.now();
            return true;
        },
        stop() {
            if (!running) return false;
            running = false;
            return true;
        },
        tick() {
            if (!running) return null;
            const now = _clock.now();
            const delta = lastTickAt == null ? 0 : now - lastTickAt;
            // Skip se dentro do mesmo budget (evita over-tick)
            if (lastTickAt != null && delta < minDelta * 0.5) return null;
            lastTickAt = now;
            const idx = frameIndex++;
            try {
                onFrame(delta, idx);
            } catch (e: any) {
                console.debug('[frameScheduler:onFrame]', e?.message || e);
            }
            return { delta, frameIndex: idx };
        },
        frameCount() {
            return frameIndex;
        },
        isRunning() {
            return running;
        },
        reset() {
            running = false;
            frameIndex = 0;
            lastTickAt = null;
        },
        targetFps,
        minDelta,
    });
}

/**
 * Computa estatísticas sobre uma série de deltas (ms entre frames).
 *
 * @param {Array<number>} deltas
 * @returns {{count: number, avg: number, min: number, max: number, stdDev: number, fps: number}}
 */
export function summarizeFrameDeltas(deltas: Array<number>): {count: number, avg: number, min: number, max: number, stdDev: number, fps: number} {
    if (!Array.isArray(deltas) || deltas.length === 0) {
        return { count: 0, avg: 0, min: 0, max: 0, stdDev: 0, fps: 0 };
    }
    const valid = deltas.filter((d) => Number.isFinite(d) && d > 0);
    if (valid.length === 0) {
        return { count: 0, avg: 0, min: 0, max: 0, stdDev: 0, fps: 0 };
    }
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const variance = valid.reduce((acc, d) => acc + (d - avg) ** 2, 0) / valid.length;
    const stdDev = Math.sqrt(variance);
    const fps = avg > 0 ? 1000 / avg : 0;
    return { count: valid.length, avg, min, max, stdDev, fps };
}

/**
 * Module identity export.
 */
export const frameSchedulerMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.11',
    deliveredAt: '2026-05-01',
    fpsTargets: FPS_TARGETS,
    exports: [
        'FPS_TARGETS',
        'FRAME_BUDGETS_MS',
        'FPS_HEALTH',
        'FRAME_SCHEDULER_META',
        'frameBudgetMs',
        'createFrameBudget',
        'createFpsEstimator',
        'classifyFpsHealth',
        'createFrameSkipper',
        'createFrameLoop',
        'summarizeFrameDeltas',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
