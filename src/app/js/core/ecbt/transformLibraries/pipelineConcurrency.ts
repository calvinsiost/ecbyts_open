// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Concurrency - Phase 40 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S40
 *
 * Phase 40 (2026-05-02) - pure-logic semaphore/limit state machine para
 * controlar quantas tarefas de pipeline rodam simultaneamente. Suporta:
 *   - createLimiter({maxConcurrent})
 *   - acquire/release frozen state transitions
 *   - waitQueue ordering FIFO
 *   - summarize {active, queued, completed, rejected}
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase/Promise/setTimeout.
 *
 * Owner: Claude (orquestrador apropriador)
 */

interface LimiterConfig {
    maxConcurrent?: number;
    maxQueue?: number;
}

interface AcquireResult {
    limiter: any;
    status: 'active' | 'queued' | 'rejected';
}

interface ReleaseResult {
    limiter: any;
    promoted: string | null;
}

/** Default config canônica. */
export const DEFAULT_CONFIG = Object.freeze({
    maxConcurrent: 4,
    maxQueue: 1000,
});

/** Identidade do módulo. */
export const CONCURRENCY_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 40,
    deliveredAt: '2026-05-02',
});

/**
 * Cria limiter state inicial frozen.
 * @param config
 */
export function createLimiter(config: LimiterConfig = {}): Readonly<any> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const max =
        Number.isInteger(cfg.maxConcurrent) && cfg.maxConcurrent > 0 ? cfg.maxConcurrent : DEFAULT_CONFIG.maxConcurrent;
    const maxQ = Number.isInteger(cfg.maxQueue) && cfg.maxQueue > 0 ? cfg.maxQueue : DEFAULT_CONFIG.maxQueue;
    return Object.freeze({
        maxConcurrent: max,
        maxQueue: maxQ,
        active: Object.freeze([]), // [{id, startedAt}]
        queue: Object.freeze([]), // [{id, queuedAt}]
        stats: Object.freeze({ completed: 0, rejected: 0 }),
    });
}

/**
 * Tenta adquirir slot. Se livre, vai para active. Senão, vai para queue.
 * Se queue cheio, rejeita.
 */
export function acquire(limiter: any, id: any, now: any): AcquireResult {
    if (!limiter || typeof id !== 'string') {
        return { limiter, status: 'rejected' };
    }
    if (!Number.isFinite(now)) now = Date.now();
    if (limiter.active.length < limiter.maxConcurrent) {
        return Object.freeze({
            limiter: Object.freeze({
                ...limiter,
                active: Object.freeze([...limiter.active, Object.freeze({ id, startedAt: now })]),
            }),
            status: 'active',
        });
    }
    if (limiter.queue.length >= limiter.maxQueue) {
        return Object.freeze({
            limiter: Object.freeze({
                ...limiter,
                stats: Object.freeze({ ...limiter.stats, rejected: limiter.stats.rejected + 1 }),
            }),
            status: 'rejected',
        });
    }
    return Object.freeze({
        limiter: Object.freeze({
            ...limiter,
            queue: Object.freeze([...limiter.queue, Object.freeze({ id, queuedAt: now })]),
        }),
        status: 'queued',
    });
}

/**
 * Libera slot. Se houver queue, promove o primeiro (FIFO).
 */
export function release(limiter: any, id: any, now: any): ReleaseResult {
    if (!limiter || typeof id !== 'string') {
        return { limiter, promoted: null };
    }
    if (!Number.isFinite(now)) now = Date.now();
    const newActive = limiter.active.filter((a: any) => a.id !== id);
    if (newActive.length === limiter.active.length) {
        return Object.freeze({ limiter, promoted: null });
    }
    let promoted = null;
    let queue = limiter.queue;
    if (queue.length > 0 && newActive.length < limiter.maxConcurrent) {
        const next = queue[0];
        promoted = next.id;
        newActive.push(Object.freeze({ id: next.id, startedAt: now }));
        queue = queue.slice(1);
    }
    return Object.freeze({
        limiter: Object.freeze({
            ...limiter,
            active: Object.freeze(newActive),
            queue: Object.freeze(queue),
            stats: Object.freeze({ ...limiter.stats, completed: limiter.stats.completed + 1 }),
        }),
        promoted,
    });
}

/**
 * Verifica se id está active.
 */
export function isActive(limiter: any, id: any): boolean {
    if (!limiter || typeof id !== 'string') return false;
    return limiter.active.some((a: any) => a.id === id);
}

/**
 * Verifica se id está em queue.
 */
export function isQueued(limiter: any, id: any): boolean {
    if (!limiter || typeof id !== 'string') return false;
    return limiter.queue.some((q: any) => q.id === id);
}

/**
 * Cancela id (remove de queue ou active sem promover).
 */
export function cancel(limiter: any, id: any): any {
    if (!limiter || typeof id !== 'string') return limiter;
    return Object.freeze({
        ...limiter,
        active: Object.freeze(limiter.active.filter((a: any) => a.id !== id)),
        queue: Object.freeze(limiter.queue.filter((q: any) => q.id !== id)),
    });
}

/**
 * Sumariza state.
 */
export function summarizeLimiter(limiter: any): any {
    const empty = { active: 0, queued: 0, maxConcurrent: 0, maxQueue: 0, completed: 0, rejected: 0, utilization: 0 };
    if (!limiter) return empty;
    return Object.freeze({
        active: limiter.active.length,
        queued: limiter.queue.length,
        maxConcurrent: limiter.maxConcurrent,
        maxQueue: limiter.maxQueue,
        completed: limiter.stats?.completed || 0,
        rejected: limiter.stats?.rejected || 0,
        utilization: limiter.maxConcurrent > 0 ? limiter.active.length / limiter.maxConcurrent : 0,
    });
}

/**
 * Module identity export.
 */
export const pipelineConcurrencyMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 40,
    deliveredAt: '2026-05-02',
    exports: [
        'DEFAULT_CONFIG',
        'CONCURRENCY_META',
        'createLimiter',
        'acquire',
        'release',
        'isActive',
        'isQueued',
        'cancel',
        'summarizeLimiter',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
