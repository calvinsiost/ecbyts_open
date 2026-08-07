// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   BACKOFF + JITTER (utils/helpers — cross-spec pure-logic)
   ================================================================

   Exponential backoff com jitter para retries. Padrões canônicos AWS:
     - "full jitter":  random(0, exp(attempt)*base)
     - "equal jitter": exp/2 + random(0, exp/2)
     - "decorrelated": random(base, prev*3) — anti-thundering-herd

   Sem jitter (puro exponential) é EVITADO — sincroniza clientes em
   surge re-request após outage.

   Cross-spec consumers:
     - utils/api/* (retry de fetch após 5xx/network)
     - core/llm/agentLoop (retry de provider failure)
     - core/photolog/* (upload sync retry após queue stall)
     - core/sensor/* (poll backoff quando endpoint Down)
     - utils/recovery/syncQueue (offline→online flush)

   Pure-logic: caller injeta randomSeed [0..1) e attempt count. No
   Math.random, no Date — deterministic from inputs.

   Reference: AWS Architecture Blog — "Exponential Backoff And Jitter"
   (Marc Brooker, 2015).
   ================================================================ */

export const DEFAULT_BASE_MS = 100;
export const DEFAULT_CAP_MS = 30_000;
export const DEFAULT_MAX_ATTEMPTS = 8;
export const MIN_BASE_MS = 1;
export const MAX_CAP_MS = 5 * 60 * 1000;

export type JitterStrategy = 'none' | 'full' | 'equal' | 'decorrelated';

export interface BackoffConfig {
    readonly baseMs: number;
    readonly capMs: number;
    readonly maxAttempts: number;
    readonly strategy: JitterStrategy;
}

export interface BackoffPlan {
    readonly nextDelayMs: number;
    readonly attempt: number;
    readonly exhausted: boolean;
    readonly strategy: JitterStrategy;
    readonly reason: string;
}

function clampPositive(value: unknown, fallback: number, min: number, max: number): number {
    if (typeof value !== 'number' || !isFinite(value)) return fallback;
    if (value < min) return min;
    if (value > max) return max;
    return Math.floor(value);
}

function clampSeed(seed: unknown): number {
    if (typeof seed !== 'number' || !isFinite(seed)) return 0;
    if (seed < 0) return 0;
    if (seed >= 1) return 0.999_999_999;
    return seed;
}

export function buildConfig(overrides?: Partial<BackoffConfig>): BackoffConfig {
    const baseMs = clampPositive(overrides?.baseMs, DEFAULT_BASE_MS, MIN_BASE_MS, MAX_CAP_MS);
    const capMs = clampPositive(overrides?.capMs, DEFAULT_CAP_MS, baseMs, MAX_CAP_MS);
    const maxAttempts = clampPositive(overrides?.maxAttempts, DEFAULT_MAX_ATTEMPTS, 1, 32);
    const strategyRaw = overrides?.strategy;
    const strategy: JitterStrategy =
        strategyRaw === 'none' ||
        strategyRaw === 'full' ||
        strategyRaw === 'equal' ||
        strategyRaw === 'decorrelated'
            ? strategyRaw
            : 'full';
    return Object.freeze({ baseMs, capMs, maxAttempts, strategy });
}

function exponentialMs(attempt: number, baseMs: number, capMs: number): number {
    const exp = Math.min(capMs, Math.floor(baseMs * Math.pow(2, attempt)));
    return exp > capMs ? capMs : exp;
}

export function computeBackoffMs(
    attempt: number,
    randomSeed: number,
    config?: Partial<BackoffConfig>
): number {
    const cfg = buildConfig(config);
    const safeAttempt = typeof attempt === 'number' && isFinite(attempt) && attempt >= 0
        ? Math.floor(attempt)
        : 0;
    const seed = clampSeed(randomSeed);
    const expMs = exponentialMs(safeAttempt, cfg.baseMs, cfg.capMs);
    switch (cfg.strategy) {
        case 'none':
            return expMs;
        case 'full':
            return Math.floor(seed * expMs);
        case 'equal': {
            const half = Math.floor(expMs / 2);
            return half + Math.floor(seed * half);
        }
        case 'decorrelated': {
            const minMs = cfg.baseMs;
            const maxMs = Math.min(cfg.capMs, expMs * 3);
            return minMs + Math.floor(seed * Math.max(0, maxMs - minMs));
        }
        default:
            return expMs;
    }
}

export function computeDecorrelatedJitter(
    prevDelayMs: number,
    randomSeed: number,
    config?: Partial<BackoffConfig>
): number {
    const cfg = buildConfig(config);
    const seed = clampSeed(randomSeed);
    const safePrev = typeof prevDelayMs === 'number' && isFinite(prevDelayMs) && prevDelayMs > 0
        ? Math.floor(prevDelayMs)
        : cfg.baseMs;
    const minMs = cfg.baseMs;
    const maxMs = Math.min(cfg.capMs, safePrev * 3);
    if (maxMs <= minMs) return minMs;
    return minMs + Math.floor(seed * (maxMs - minMs));
}

export function decideBackoffStrategy(input: {
    readonly attempt: number;
    readonly randomSeed: number;
    readonly serverRetryAfterMs?: number | null;
    readonly config?: Partial<BackoffConfig>;
}): BackoffPlan {
    const cfg = buildConfig(input?.config);
    const safeAttempt = typeof input?.attempt === 'number' && isFinite(input.attempt) && input.attempt >= 0
        ? Math.floor(input.attempt)
        : 0;
    if (safeAttempt >= cfg.maxAttempts) {
        return Object.freeze({
            nextDelayMs: 0,
            attempt: safeAttempt,
            exhausted: true,
            strategy: cfg.strategy,
            reason: 'max_attempts_reached',
        });
    }
    const server = input?.serverRetryAfterMs;
    if (typeof server === 'number' && isFinite(server) && server > 0) {
        return Object.freeze({
            nextDelayMs: Math.min(cfg.capMs, Math.floor(server)),
            attempt: safeAttempt,
            exhausted: false,
            strategy: 'none' as JitterStrategy,
            reason: 'server_retry_after',
        });
    }
    const delay = computeBackoffMs(safeAttempt, input.randomSeed, cfg);
    return Object.freeze({
        nextDelayMs: delay,
        attempt: safeAttempt,
        exhausted: false,
        strategy: cfg.strategy,
        reason: 'computed_jitter',
    });
}

export function clampAttempt(attempt: unknown, max: number = DEFAULT_MAX_ATTEMPTS): number {
    if (typeof attempt !== 'number' || !isFinite(attempt) || attempt < 0) return 0;
    if (typeof max !== 'number' || !isFinite(max) || max < 1) return 0;
    const maxFloor = Math.floor(max);
    const attemptFloor = Math.floor(attempt);
    return attemptFloor > maxFloor ? maxFloor : attemptFloor;
}
