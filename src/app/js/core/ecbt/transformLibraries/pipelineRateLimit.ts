// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Rate Limit - Phase 45 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S45
 *
 * Phase 45 (2026-05-02) - pure-logic token bucket rate limiter para
 * pipeline steps. Aceita "now" injetável (sem Date.now interno).
 *
 *   - createBucket({capacity, refillPerSec})
 *   - tryConsume(bucket, n, now) → {bucket, allowed}
 *   - tokensAt(bucket, now) → tokens disponíveis nesse instante
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase/setTimeout.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Default config canônica. */
export const DEFAULT_CONFIG = Object.freeze({
    capacity: 10,
    refillPerSec: 1,
});

/** Identidade do módulo. */
export const RATE_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 45,
    deliveredAt: '2026-05-02',
});

/**
 * @typedef {{ allowed: number, denied: number }} BucketStats
 * @typedef {{ capacity: number, refillPerSec: number, tokens: number, lastRefillAt: number, stats: BucketStats }} Bucket
 * @typedef {{ capacity?: number, refillPerSec?: number }} BucketConfig
 */
type BucketStats = { allowed: number; denied: number };
type Bucket = {
    capacity: number;
    refillPerSec: number;
    tokens: number;
    lastRefillAt: number;
    stats: BucketStats;
};
type BucketConfig = { capacity?: number; refillPerSec?: number };

/**
 * Cria bucket frozen.
 * @param {BucketConfig} [config]
 * @param {number} [now]
 * @returns {Bucket}
 */
export function createBucket(config: BucketConfig = {}, now?: number): Bucket {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const cap = Number.isFinite(cfg.capacity) && cfg.capacity > 0 ? cfg.capacity : DEFAULT_CONFIG.capacity;
    const refill = Number.isFinite(cfg.refillPerSec) && cfg.refillPerSec >= 0
        ? cfg.refillPerSec : DEFAULT_CONFIG.refillPerSec;
    if (!Number.isFinite(now)) now = 0;
    return Object.freeze({
        capacity: cap,
        refillPerSec: refill,
        tokens: cap,
        lastRefillAt: (now as number),
        stats: Object.freeze({ allowed: 0, denied: 0 }),
    });
}

/**
 * Computa tokens disponíveis agora (sem mutar).
 * @param {Bucket|null|undefined} bucket
 * @param {number} [now?]
 * @returns {number}
 */
export function tokensAt(bucket: Bucket|null|undefined, now?: number): number {
    if (!bucket) return 0;
    if (!Number.isFinite(now)) now = bucket.lastRefillAt;
    const elapsedMs = Math.max(0, (now as number) - bucket.lastRefillAt);
    const refilled = (elapsedMs / 1000) * bucket.refillPerSec;
    return Math.min(bucket.capacity, bucket.tokens + refilled);
}

/**
 * Atualiza tokens via refill (não consome).
 * @param {Bucket} bucket
 * @param {number} [now?]
 * @returns {Bucket}
 */
function refill(bucket: Bucket, now?: number): Bucket {
    if (!Number.isFinite(now)) now = bucket.lastRefillAt;
    if ((now as number) <= bucket.lastRefillAt) return bucket;
    const tokens = tokensAt(bucket, now);
    return Object.freeze({
        ...bucket,
        tokens,
        lastRefillAt: (now as number),
    });
}

/**
 * Tenta consumir n tokens.
 * @param {Bucket|null|undefined} bucket
 * @param {number} n
 * @param {number} [now?]
 * @returns {{ bucket: Bucket|null|undefined, allowed: boolean }}
 */
export function tryConsume(bucket: Bucket|null|undefined, n: number, now?: number): { bucket: Bucket|null|undefined, allowed: boolean } {
    if (!bucket) return { bucket, allowed: false };
    if (!Number.isInteger(n) || n <= 0) return { bucket, allowed: false };
    const refilled = refill(bucket, now);
    if (refilled.tokens < n) {
        return Object.freeze({
            bucket: Object.freeze({
                ...refilled,
                stats: Object.freeze({ ...refilled.stats, denied: refilled.stats.denied + 1 }),
            }),
            allowed: false,
        });
    }
    return Object.freeze({
        bucket: Object.freeze({
            ...refilled,
            tokens: refilled.tokens - n,
            stats: Object.freeze({ ...refilled.stats, allowed: refilled.stats.allowed + 1 }),
        }),
        allowed: true,
    });
}

/**
 * Tempo (ms) até bucket ter n tokens disponíveis. -1 se impossível.
 * @param {Bucket|null|undefined} bucket
 * @param {number} n
 * @param {number} [now?]
 * @returns {number}
 */
export function timeUntilAvailable(bucket: Bucket|null|undefined, n: number, now?: number): number {
    if (!bucket || !Number.isInteger(n) || n <= 0) return -1;
    if (n > bucket.capacity) return -1;
    const cur = tokensAt(bucket, now);
    if (cur >= n) return 0;
    if (bucket.refillPerSec <= 0) return -1;
    return Math.ceil(((n - cur) / bucket.refillPerSec) * 1000);
}

/**
 * Reset bucket (full tokens).
 * @param {Bucket|null|undefined} bucket
 * @param {number} [now?]
 * @returns {Bucket|null|undefined}
 */
export function resetBucket(bucket: Bucket|null|undefined, now?: number): Bucket|null|undefined {
    if (!bucket) return bucket;
    if (!Number.isFinite(now)) now = bucket.lastRefillAt;
    return Object.freeze({
        ...bucket,
        tokens: bucket.capacity,
        lastRefillAt: (now as number),
    });
}

/**
 * Sumariza state.
 * @param {Bucket|null|undefined} bucket
 * @param {number} [now?]
 */
export function summarizeBucket(bucket: Bucket|null|undefined, now?: number) {
    const empty = { capacity: 0, tokens: 0, refillPerSec: 0, allowed: 0, denied: 0 };
    if (!bucket) return empty;
    return Object.freeze({
        capacity: bucket.capacity,
        tokens: tokensAt(bucket, now),
        refillPerSec: bucket.refillPerSec,
        allowed: bucket.stats?.allowed || 0,
        denied: bucket.stats?.denied || 0,
    });
}

/**
 * Module identity export.
 */
export const pipelineRateLimitMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 45,
    deliveredAt: '2026-05-02',
    exports: [
        'DEFAULT_CONFIG',
        'RATE_META',
        'createBucket',
        'tokensAt',
        'tryConsume',
        'timeUntilAvailable',
        'resetBucket',
        'summarizeBucket',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
