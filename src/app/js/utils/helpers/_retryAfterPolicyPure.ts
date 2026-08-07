// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * HTTP Retry-After Policy — pure logic.
 *
 * Generic helper used by edge function callers, library marketplace,
 * Supabase ingestion, etc. Parses the `Retry-After` header from a 429/503
 * response and decides whether/when to retry.
 *
 * `Retry-After` per RFC 9110 can be:
 *   - Delay seconds: `Retry-After: 120`
 *   - HTTP-date: `Retry-After: Wed, 21 Oct 2026 07:28:00 GMT`
 *
 * Pure: caller passes header value + nowIso; module returns frozen verdict.
 *
 * Tests live in `tests/retry-after-policy-pure.test.mjs`.
 */

export interface RetryDecisionInput {
    readonly status: number;
    readonly retryAfterHeader?: string | null;
    readonly attempt: number;
    readonly nowIso: string;
    readonly maxAttempts?: number;
    readonly maxDelayMs?: number;
}

export interface RetryDecision {
    readonly shouldRetry: boolean;
    readonly delayMs: number;
    readonly reason: 'success_no_retry' | 'rate_limited' | 'service_unavailable' | 'transient_5xx' | 'exhausted' | 'permanent_failure';
    readonly source: 'header_seconds' | 'header_date' | 'header_invalid_default' | 'exponential_backoff' | 'none';
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_MAX_DELAY_MS = 60_000;
const DEFAULT_BACKOFF_BASE_MS = 500;
const HEADER_INVALID_DEFAULT_MS = 2_000;

function isFinitePos(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function isValidIso(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0 && Number.isFinite(Date.parse(v));
}

/**
 * Parse `Retry-After` header value.
 *   - Plain integer → seconds (multiply by 1000)
 *   - HTTP-date → diff vs nowIso (clamp to 0)
 *   - Invalid → returns -1
 */
export function parseRetryAfter(headerValue: string | null | undefined, nowIso: string): number {
    if (typeof headerValue !== 'string' || headerValue.length === 0) return -1;
    const trimmed = headerValue.trim();
    if (/^\d+$/.test(trimmed)) {
        const seconds = Math.floor(Number(trimmed));
        if (seconds < 0) return -1;
        return seconds * 1000;
    }
    // Reject leading-minus or other non-date-shaped inputs early so they
    // don't get parsed as exotic dates (e.g. "-5" → year -5 in some VMs).
    if (trimmed.startsWith('-') || trimmed.startsWith('+')) return -1;
    if (!/[a-zA-Z:]/.test(trimmed)) return -1; // HTTP-date must have separators
    if (!isValidIso(nowIso)) return -1;
    const target = Date.parse(trimmed);
    if (!Number.isFinite(target)) return -1;
    return Math.max(0, target - Date.parse(nowIso));
}

/**
 * Decide retry given HTTP response status + header + attempt count.
 * Pure: returns frozen verdict.
 *
 * Rules:
 *   - 2xx/3xx → success_no_retry
 *   - 429 → rate_limited; honor Retry-After (cap maxDelayMs)
 *   - 503 → service_unavailable; honor Retry-After
 *   - 502/504 → transient_5xx; exponential backoff
 *   - 5xx other → transient_5xx; exponential backoff
 *   - 4xx other (400/401/403/404) → permanent_failure (no retry)
 *   - attempt ≥ maxAttempts → exhausted
 */
export function decideRetryAfter(input: RetryDecisionInput | null | undefined): RetryDecision {
    if (!input || typeof input !== 'object' || typeof input.status !== 'number') {
        return Object.freeze({
            shouldRetry: false,
            delayMs: 0,
            reason: 'permanent_failure' as const,
            source: 'none' as const,
        });
    }
    const maxAttempts =
        isFinitePos(input.maxAttempts) ? Math.floor(input.maxAttempts as number) : DEFAULT_MAX_ATTEMPTS;
    const maxDelayMs =
        isFinitePos(input.maxDelayMs) ? (input.maxDelayMs as number) : DEFAULT_MAX_DELAY_MS;
    const attempt = isFinitePos(input.attempt) ? Math.floor(input.attempt as number) : 1;

    const s = input.status;

    // Success
    if (s >= 200 && s < 400) {
        return Object.freeze({
            shouldRetry: false,
            delayMs: 0,
            reason: 'success_no_retry' as const,
            source: 'none' as const,
        });
    }

    // Permanent 4xx (except 429)
    if (s >= 400 && s < 500 && s !== 429) {
        return Object.freeze({
            shouldRetry: false,
            delayMs: 0,
            reason: 'permanent_failure' as const,
            source: 'none' as const,
        });
    }

    if (attempt >= maxAttempts) {
        return Object.freeze({
            shouldRetry: false,
            delayMs: 0,
            reason: 'exhausted' as const,
            source: 'none' as const,
        });
    }

    // 429 or 503: honor Retry-After
    if (s === 429 || s === 503) {
        const headerMs = parseRetryAfter(input.retryAfterHeader, input.nowIso);
        let delay = headerMs;
        let source: RetryDecision['source'];
        if (delay < 0) {
            delay = HEADER_INVALID_DEFAULT_MS;
            source = 'header_invalid_default';
        } else if (typeof input.retryAfterHeader === 'string' && /^\d+$/.test(input.retryAfterHeader.trim())) {
            source = 'header_seconds';
        } else {
            source = 'header_date';
        }
        if (delay > maxDelayMs) delay = maxDelayMs;
        return Object.freeze({
            shouldRetry: true,
            delayMs: delay,
            reason: s === 429 ? ('rate_limited' as const) : ('service_unavailable' as const),
            source,
        });
    }

    // Other 5xx: exponential backoff
    if (s >= 500 && s < 600) {
        const backoff = Math.min(maxDelayMs, DEFAULT_BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
        return Object.freeze({
            shouldRetry: true,
            delayMs: backoff,
            reason: 'transient_5xx' as const,
            source: 'exponential_backoff' as const,
        });
    }

    // Anything else (1xx etc.) → permanent_failure (unknown)
    return Object.freeze({
        shouldRetry: false,
        delayMs: 0,
        reason: 'permanent_failure' as const,
        source: 'none' as const,
    });
}

export const RETRY_AFTER_DEFAULT_MAX_ATTEMPTS = DEFAULT_MAX_ATTEMPTS;
export const RETRY_AFTER_DEFAULT_MAX_DELAY_MS = DEFAULT_MAX_DELAY_MS;
export const RETRY_AFTER_HEADER_INVALID_DEFAULT_MS = HEADER_INVALID_DEFAULT_MS;
