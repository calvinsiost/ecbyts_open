// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Retry - Phase 43 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S43
 *
 * Phase 43 (2026-05-02) - pure-logic retry policy state machine para
 * pipeline steps. Calcula delays via exponential backoff + jitter
 * determinístico (seedável). Não dispara timers - apenas computa.
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase/setTimeout.
 *
 * Owner: Claude (orquestrador apropriador)
 */

export interface RetryPolicy {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    factor: number;
    jitter: number;
}

export interface RetryErrorEntry {
    attempt: number;
    error: string;
}

export interface RetryState {
    readonly policy: Readonly<RetryPolicy>;
    attempts: number;
    readonly errors: ReadonlyArray<Readonly<RetryErrorEntry>>;
}

export const DEFAULT_POLICY = {
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 30_000,
    factor: 2,
    jitter: 0.2, // 0..1,
} as const;

export type DefaultPolicy = (typeof DEFAULT_POLICY)[keyof typeof DEFAULT_POLICY];

export const RETRY_META = {
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 43,
    deliveredAt: '2026-05-02',
} as const;

export type RetryMeta = (typeof RETRY_META)[keyof typeof RETRY_META];

export function createPolicy(spec: Partial<RetryPolicy> = {}): Readonly<RetryPolicy> {
    const cfg = { ...DEFAULT_POLICY, ...spec };
    return Object.freeze({
        maxAttempts: Number.isInteger(cfg.maxAttempts) && cfg.maxAttempts > 0
            ? cfg.maxAttempts : DEFAULT_POLICY.maxAttempts,
        baseDelayMs: Number.isFinite(cfg.baseDelayMs) && cfg.baseDelayMs >= 0
            ? cfg.baseDelayMs : DEFAULT_POLICY.baseDelayMs,
        maxDelayMs: Number.isFinite(cfg.maxDelayMs) && cfg.maxDelayMs > 0
            ? cfg.maxDelayMs : DEFAULT_POLICY.maxDelayMs,
        factor: Number.isFinite(cfg.factor) && cfg.factor > 0
            ? cfg.factor : DEFAULT_POLICY.factor,
        jitter: Number.isFinite(cfg.jitter) && cfg.jitter >= 0 && cfg.jitter <= 1
            ? cfg.jitter : DEFAULT_POLICY.jitter,
    });
}

function mulberry32(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function computeDelay(
    policy: RetryPolicy | null | undefined,
    attempt: number,
    seed?: number,
): number {
    if (!policy) return -1;
    if (!Number.isInteger(attempt) || attempt < 1) return -1;
    if (attempt > policy.maxAttempts) return -1;
    if (attempt === policy.maxAttempts) return -1; // último attempt já foi
    const exp = policy.baseDelayMs * Math.pow(policy.factor, attempt - 1);
    const capped = Math.min(exp, policy.maxDelayMs);
    if (policy.jitter <= 0) return capped;
    const jitterSeed = Number.isFinite(seed) ? Number(seed) : 0;
    const rand = mulberry32(jitterSeed)();
    const jitterDelta = capped * policy.jitter * (rand * 2 - 1);
    return Math.max(0, capped + jitterDelta);
}

export function shouldRetry(
    policy: RetryPolicy | null | undefined,
    attempt: number,
    error: unknown,
): boolean {
    if (!policy) return false;
    if (!Number.isInteger(attempt) || attempt < 1) return false;
    if (attempt >= policy.maxAttempts) return false;
    // Default: retry em qualquer erro truthy
    if (error === null || error === undefined) return false;
    return true;
}

export function createRetryState(policy?: RetryPolicy): Readonly<RetryState> {
    return Object.freeze({
        policy: policy || createPolicy(),
        attempts: 0,
        errors: Object.freeze([]),
    });
}

export function recordFailure(
    state: RetryState | null | undefined,
    error: unknown,
    seed?: number,
): Readonly<{ state: Readonly<RetryState> | null | undefined; nextDelayMs: number; retry: boolean }> {
    if (!state) return Object.freeze({ state, nextDelayMs: -1, retry: false });
    const newAttempts = state.attempts + 1;
    const newErrors = Object.freeze([...state.errors, Object.freeze({ attempt: newAttempts, error: String(error || 'unknown') })]);
    const newState = Object.freeze({
        ...state,
        attempts: newAttempts,
        errors: newErrors,
    });
    const retry = shouldRetry(state.policy, newAttempts, error);
    const nextDelayMs = retry ? computeDelay(state.policy, newAttempts, seed) : -1;
    return Object.freeze({ state: newState, nextDelayMs, retry });
}

export function summarizeRetry(
    state: RetryState | null | undefined,
): Readonly<{ attempts: number; errors: number; exhausted: boolean; maxAttempts?: number }> {
    const empty = Object.freeze({ attempts: 0, errors: 0, exhausted: false });
    if (!state) return empty;
    return Object.freeze({
        attempts: state.attempts || 0,
        errors: state.errors?.length || 0,
        maxAttempts: state.policy?.maxAttempts || 0,
        exhausted: (state.attempts || 0) >= (state.policy?.maxAttempts || 0),
    });
}

export const pipelineRetryMeta = {
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 43,
    deliveredAt: '2026-05-02',
    exports: [
        'DEFAULT_POLICY',
        'RETRY_META',
        'createPolicy',
        'computeDelay',
        'shouldRetry',
        'createRetryState',
        'recordFailure',
        'summarizeRetry',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
} as const;

export type PipelineRetryMeta = (typeof pipelineRetryMeta)[keyof typeof pipelineRetryMeta];