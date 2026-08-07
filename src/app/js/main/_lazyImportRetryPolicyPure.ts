// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Lazy Import Retry Policy — pure logic for WS-3 of
 * SPEC_CODEBASE_WIDE_PERFORMANCE_REFACTOR.
 *
 * Decides whether a failed `dynamic import()` should be retried, how
 * long to wait, and when to give up with a fallback. Pure: caller
 * passes the current attempt count + last error; module returns a
 * frozen verdict. Caller does the actual setTimeout/dynamic-import.
 *
 * Gate (spec §WS-3): "dynamic import() sempre tem fallback de erro e
 * toast/log apropriado".
 *
 * Tests live in `tests/lazy-import-retry-policy-pure.test.mjs`.
 */

export type RetryReason =
    | 'transient_network'
    | 'chunk_load_error'
    | 'csp_block'
    | 'timeout'
    | 'parse_error'
    | 'unknown';

export interface RetryDecisionInput {
    readonly attempt: number; // 0 = first try not yet attempted, 1 = first try failed
    readonly errorMessage?: string;
    readonly errorName?: string;
    readonly maxAttempts?: number;
}

export interface RetryDecisionVM {
    readonly shouldRetry: boolean;
    readonly nextDelayMs: number;
    readonly reason: RetryReason;
    readonly attempt: number;
    readonly fallbackKind: 'toast' | 'log_only' | 'reload_prompt' | 'none';
    readonly userMessageKey: string;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 200;

/** Exponential backoff with cap. attempt 1 → 200ms, 2 → 400ms, 3 → 800ms, capped at 5s. */
function computeDelay(attempt: number): number {
    const raw = BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1));
    return Math.min(5000, raw);
}

/**
 * Classify the error into one of the canonical reasons. Pure.
 * Uses heuristics on error.name + message; conservative (defaults to unknown).
 */
export function classifyImportError(errorName?: string, errorMessage?: string): RetryReason {
    const name = typeof errorName === 'string' ? errorName.toLowerCase() : '';
    const msg = typeof errorMessage === 'string' ? errorMessage.toLowerCase() : '';
    if (name === 'chunkloaderror' || msg.includes('failed to fetch dynamically imported')) {
        return 'chunk_load_error';
    }
    if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('networkerror')) {
        return 'transient_network';
    }
    if (msg.includes('csp') || msg.includes('content security policy') || msg.includes('blocked by csp')) {
        return 'csp_block';
    }
    if (name === 'timeouterror' || msg.includes('timeout')) {
        return 'timeout';
    }
    if (name === 'syntaxerror' || msg.includes('syntax') || msg.includes('parse')) {
        return 'parse_error';
    }
    return 'unknown';
}

/**
 * Decide whether to retry given current attempt + error. Pure: returns
 * frozen verdict.
 *
 * Rules:
 *   - parse_error → NEVER retry (code is broken; retrying won't fix)
 *   - csp_block → NEVER retry + fallback reload_prompt (admin intervention)
 *   - chunk_load_error → retry up to maxAttempts (deploy mid-load)
 *   - transient_network/timeout → retry with exponential backoff
 *   - unknown → 1 retry only (cautious)
 *   - attempt ≥ maxAttempts → never retry (give up + toast)
 */
export function decideRetry(input: RetryDecisionInput | null | undefined): RetryDecisionVM {
    if (!input || typeof input !== 'object') {
        return Object.freeze({
            shouldRetry: false,
            nextDelayMs: 0,
            reason: 'unknown' as const,
            attempt: 0,
            fallbackKind: 'log_only' as const,
            userMessageKey: 'lazyImport.failed.unknown',
        });
    }
    const attempt = Number.isFinite(input.attempt) && input.attempt > 0 ? Math.floor(input.attempt) : 1;
    const maxAttempts =
        Number.isFinite(input.maxAttempts) && (input.maxAttempts as number) > 0
            ? Math.floor(input.maxAttempts as number)
            : DEFAULT_MAX_ATTEMPTS;
    const reason = classifyImportError(input.errorName, input.errorMessage);

    if (reason === 'parse_error') {
        return Object.freeze({
            shouldRetry: false,
            nextDelayMs: 0,
            reason,
            attempt,
            fallbackKind: 'toast' as const,
            userMessageKey: 'lazyImport.failed.parseError',
        });
    }
    if (reason === 'csp_block') {
        return Object.freeze({
            shouldRetry: false,
            nextDelayMs: 0,
            reason,
            attempt,
            fallbackKind: 'reload_prompt' as const,
            userMessageKey: 'lazyImport.failed.cspBlock',
        });
    }
    if (attempt >= maxAttempts) {
        return Object.freeze({
            shouldRetry: false,
            nextDelayMs: 0,
            reason,
            attempt,
            fallbackKind: 'toast' as const,
            userMessageKey: 'lazyImport.failed.exhausted',
        });
    }
    if (reason === 'unknown' && attempt >= 2) {
        return Object.freeze({
            shouldRetry: false,
            nextDelayMs: 0,
            reason,
            attempt,
            fallbackKind: 'toast' as const,
            userMessageKey: 'lazyImport.failed.unknown',
        });
    }
    return Object.freeze({
        shouldRetry: true,
        nextDelayMs: computeDelay(attempt),
        reason,
        attempt,
        fallbackKind: 'none' as const,
        userMessageKey: 'lazyImport.retrying',
    });
}

/**
 * Convenience — `true` iff retry policy says caller should NOT show a
 * UI toast yet (still attempting silently).
 */
export function shouldSuppressToast(vm: RetryDecisionVM | null | undefined): boolean {
    if (!vm) return true;
    return vm.shouldRetry && vm.fallbackKind === 'none';
}

export const RETRY_BASE_DELAY_MS = BASE_DELAY_MS;
export const RETRY_DEFAULT_MAX_ATTEMPTS = DEFAULT_MAX_ATTEMPTS;
