// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   RATE LIMIT TOKEN BUCKET (utils/helpers — cross-spec pure-logic)
   ================================================================

   Token bucket pure-logic com refill contínuo. Fail-closed por
   padrão (estado inválido = deny), oposto ao anti-pattern fail-open
   identificado em SEC-HARDENING-001 🟡 (rate-limiter aceitava
   requests quando seu backing store falhava).

   Algorithm classico:
     - Bucket tem capacity C tokens
     - Refill contínuo a R tokens/sec
     - Cada request consome N tokens (default 1)
     - Se tokens < N → throttle

   Cross-spec consumers:
     - supabase/functions/ecbt-checkout (anti-spam payment)
     - supabase/functions/library-checkout (anti-spam purchase)
     - supabase/functions/mercadopago-webhook (anti-replay flood)
     - core/llm/agentLoop (client-side rate limit antes de chamar LLM API)
     - utils/api/* (any expensive endpoint)
     - core/photolog/* (upload throttle)

   Pure-logic: estado é {tokens, lastRefillAtMs, config}. Caller
   injeta nowMs (Date.now()) e persiste state externamente (Map,
   Supabase row, IDB). Helper só calcula + decide.

   Reference: "The Token Bucket Algorithm" (RFC 2697 informational
   model, well-known queueing theory).
   ================================================================ */

export const DEFAULT_CAPACITY = 60;
export const DEFAULT_REFILL_PER_SEC = 1;
export const DEFAULT_TOKENS_PER_REQUEST = 1;
export const MIN_CAPACITY = 1;
export const MAX_CAPACITY = 10_000;
export const MIN_REFILL_PER_SEC = 0.001;
export const MAX_REFILL_PER_SEC = 10_000;

export interface BucketConfig {
    readonly capacity: number;
    readonly refillPerSec: number;
}

export interface BucketState {
    readonly tokens: number;
    readonly lastRefillAtMs: number;
    readonly config: BucketConfig;
}

export interface ConsumeVerdict {
    readonly allowed: boolean;
    readonly remaining: number;
    readonly requested: number;
    readonly nextAvailableMs: number;
    readonly reason: string;
}

function clampPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return fallback;
    if (value < min) return min;
    if (value > max) return max;
    return Math.floor(value);
}

function clampPositiveFloat(value: unknown, fallback: number, min: number, max: number): number {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return fallback;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function clampNow(nowMs: unknown): number {
    if (typeof nowMs !== 'number' || !isFinite(nowMs)) return 0;
    return Math.floor(nowMs);
}

export function buildConfig(overrides?: Partial<BucketConfig>): BucketConfig {
    return Object.freeze({
        capacity: clampPositiveInt(overrides?.capacity, DEFAULT_CAPACITY, MIN_CAPACITY, MAX_CAPACITY),
        refillPerSec: clampPositiveFloat(
            overrides?.refillPerSec,
            DEFAULT_REFILL_PER_SEC,
            MIN_REFILL_PER_SEC,
            MAX_REFILL_PER_SEC
        ),
    });
}

export function createBucket(config?: Partial<BucketConfig>, nowMs: number = 0): BucketState {
    const cfg = buildConfig(config);
    return Object.freeze({
        tokens: cfg.capacity,
        lastRefillAtMs: clampNow(nowMs),
        config: cfg,
    });
}

export function refillBucket(state: BucketState | null | undefined, nowMs: number): BucketState {
    if (!state || typeof state !== 'object' || !state.config) {
        return createBucket(undefined, nowMs);
    }
    const safeNow = clampNow(nowMs);
    const elapsedMs = safeNow - state.lastRefillAtMs;
    if (elapsedMs <= 0) return state;
    const tokensToAdd = (elapsedMs / 1000) * state.config.refillPerSec;
    const newTokens = Math.min(state.config.capacity, state.tokens + tokensToAdd);
    return Object.freeze({
        tokens: newTokens,
        lastRefillAtMs: safeNow,
        config: state.config,
    });
}

export function peekTokens(state: BucketState | null | undefined, nowMs: number): number {
    if (!state || typeof state !== 'object' || !state.config) return 0;
    const refilled = refillBucket(state, nowMs);
    return refilled.tokens;
}

export function tryConsume(
    state: BucketState | null | undefined,
    requestedTokens: number = DEFAULT_TOKENS_PER_REQUEST,
    nowMs: number = 0
): { readonly state: BucketState; readonly verdict: ConsumeVerdict } {
    const requested = clampPositiveInt(
        requestedTokens,
        DEFAULT_TOKENS_PER_REQUEST,
        1,
        MAX_CAPACITY
    );
    if (!state || typeof state !== 'object' || !state.config) {
        const fresh = createBucket(undefined, nowMs);
        return Object.freeze({
            state: fresh,
            verdict: Object.freeze({
                allowed: false,
                remaining: 0,
                requested,
                nextAvailableMs: 0,
                reason: 'fail_closed_invalid_state',
            }),
        });
    }
    const refilled = refillBucket(state, nowMs);
    if (requested > refilled.config.capacity) {
        return Object.freeze({
            state: refilled,
            verdict: Object.freeze({
                allowed: false,
                remaining: refilled.tokens,
                requested,
                nextAvailableMs: 0,
                reason: 'requested_exceeds_capacity',
            }),
        });
    }
    if (refilled.tokens >= requested) {
        const next: BucketState = Object.freeze({
            tokens: refilled.tokens - requested,
            lastRefillAtMs: refilled.lastRefillAtMs,
            config: refilled.config,
        });
        return Object.freeze({
            state: next,
            verdict: Object.freeze({
                allowed: true,
                remaining: next.tokens,
                requested,
                nextAvailableMs: 0,
                reason: 'tokens_available',
            }),
        });
    }
    const deficit = requested - refilled.tokens;
    const msUntilEnough = Math.ceil((deficit / refilled.config.refillPerSec) * 1000);
    return Object.freeze({
        state: refilled,
        verdict: Object.freeze({
            allowed: false,
            remaining: refilled.tokens,
            requested,
            nextAvailableMs: clampNow(nowMs) + msUntilEnough,
            reason: 'throttled_insufficient_tokens',
        }),
    });
}

export function isThrottled(state: BucketState | null | undefined, nowMs: number, requested: number = 1): boolean {
    const { verdict } = tryConsume(state, requested, nowMs);
    return !verdict.allowed;
}
