// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Error Normalizer — pure logic.
 *
 * Converts heterogeneous error inputs (Error instances, strings, plain
 * objects, Supabase PostgrestError, fetch responses, AbortError, etc.)
 * into a canonical frozen `NormalizedError` ready for toast/log/audit.
 *
 * Cross-spec utility — consumed by ErrorReporting, toast manager,
 * agentic flows, edge function callers. Pure: no DOM, no logging.
 *
 * Tests live in `tests/error-normalizer-pure.test.mjs`.
 */

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';
export type ErrorKind =
    | 'network'
    | 'timeout'
    | 'abort'
    | 'auth'
    | 'permission'
    | 'validation'
    | 'rate_limit'
    | 'not_found'
    | 'server'
    | 'parse'
    | 'unknown';

export interface NormalizedError {
    readonly code: string;
    readonly message: string;
    readonly userMessage: string;
    readonly kind: ErrorKind;
    readonly severity: ErrorSeverity;
    readonly retryable: boolean;
    // `| undefined` explícito: o normalizer propaga input.stack (string|undefined)
    // direto (exactOptionalPropertyTypes exige a união em prop opcional).
    readonly stack?: string | undefined;
    readonly causeChain: ReadonlyArray<string>;
}

const UNKNOWN_MESSAGE = 'Unknown error';

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

function classifyByMessage(msg: string): { kind: ErrorKind; severity: ErrorSeverity; retryable: boolean } {
    const m = msg.toLowerCase();
    if (m.includes('aborted') || m.includes('abortcontroller')) {
        return { kind: 'abort', severity: 'info', retryable: false };
    }
    if (m.includes('timeout') || m.includes('timed out')) {
        return { kind: 'timeout', severity: 'warning', retryable: true };
    }
    if (m.includes('network') || m.includes('failed to fetch') || m.includes('econnrefused') || m.includes('econnreset')) {
        return { kind: 'network', severity: 'warning', retryable: true };
    }
    if (m.includes('unauthorized') || m.includes('401') || m.includes('jwt') || m.includes('not authenticated')) {
        return { kind: 'auth', severity: 'error', retryable: false };
    }
    if (m.includes('forbidden') || m.includes('permission') || m.includes('403') || m.includes('rls')) {
        return { kind: 'permission', severity: 'error', retryable: false };
    }
    if (m.includes('not found') || m.includes('404')) {
        return { kind: 'not_found', severity: 'warning', retryable: false };
    }
    if (m.includes('rate limit') || m.includes('429') || m.includes('too many')) {
        return { kind: 'rate_limit', severity: 'warning', retryable: true };
    }
    if (m.includes('validation') || m.includes('invalid') || m.includes('400')) {
        return { kind: 'validation', severity: 'warning', retryable: false };
    }
    if (m.includes('parse') || m.includes('syntax') || m.includes('unexpected token')) {
        return { kind: 'parse', severity: 'error', retryable: false };
    }
    if (m.includes('500') || m.includes('502') || m.includes('503') || m.includes('504') || m.includes('server error')) {
        return { kind: 'server', severity: 'error', retryable: true };
    }
    return { kind: 'unknown', severity: 'error', retryable: false };
}

function classifyByStatus(status: number): { kind: ErrorKind; severity: ErrorSeverity; retryable: boolean } {
    if (status === 401) return { kind: 'auth', severity: 'error', retryable: false };
    if (status === 403) return { kind: 'permission', severity: 'error', retryable: false };
    if (status === 404) return { kind: 'not_found', severity: 'warning', retryable: false };
    if (status === 429) return { kind: 'rate_limit', severity: 'warning', retryable: true };
    if (status >= 400 && status < 500) return { kind: 'validation', severity: 'warning', retryable: false };
    if (status === 408 || status === 504) return { kind: 'timeout', severity: 'warning', retryable: true };
    if (status >= 500) return { kind: 'server', severity: 'error', retryable: true };
    return { kind: 'unknown', severity: 'error', retryable: false };
}

function extractCauseChain(err: unknown, depth = 0, seen = new Set<unknown>()): string[] {
    if (depth > 5 || !err || seen.has(err)) return [];
    seen.add(err);
    const out: string[] = [];
    if (err instanceof Error) {
        if (err.message) out.push(err.message);
        const cause = (err as Error & { cause?: unknown }).cause;
        if (cause) out.push(...extractCauseChain(cause, depth + 1, seen));
    } else if (typeof err === 'string') {
        out.push(err);
    }
    return out;
}

/**
 * Normalize any input into a NormalizedError. Pure: returns frozen VM.
 *
 * Handles:
 *   - `Error` instances (including DOMException AbortError)
 *   - Plain strings
 *   - Plain objects with {code, message, status, error_description}
 *   - Supabase PostgrestError-shaped {code, message, details, hint}
 *   - null/undefined → unknown
 */
export function normalizeError(input: unknown, fallbackUserMessage?: string): NormalizedError {
    const userFallback = isNonEmptyString(fallbackUserMessage) ? fallbackUserMessage : 'Algo deu errado';

    if (input === null || input === undefined) {
        return Object.freeze({
            code: 'unknown',
            message: UNKNOWN_MESSAGE,
            userMessage: userFallback,
            kind: 'unknown' as const,
            severity: 'error' as const,
            retryable: false,
            causeChain: Object.freeze([]),
        });
    }

    // String input
    if (typeof input === 'string') {
        const c = classifyByMessage(input);
        return Object.freeze({
            code: c.kind,
            message: input,
            userMessage: userFallback,
            kind: c.kind,
            severity: c.severity,
            retryable: c.retryable,
            causeChain: Object.freeze([input]),
        });
    }

    // Error instance
    if (input instanceof Error) {
        const name = input.name || 'Error';
        const msg = input.message || UNKNOWN_MESSAGE;
        // AbortError special case
        if (name === 'AbortError' || msg.includes('AbortError')) {
            return Object.freeze({
                code: 'abort',
                message: msg,
                userMessage: 'Operação cancelada',
                kind: 'abort' as const,
                severity: 'info' as const,
                retryable: false,
                stack: input.stack,
                causeChain: Object.freeze(extractCauseChain(input)),
            });
        }
        if (name === 'TimeoutError') {
            return Object.freeze({
                code: 'timeout',
                message: msg,
                userMessage: 'A operação demorou demais',
                kind: 'timeout' as const,
                severity: 'warning' as const,
                retryable: true,
                stack: input.stack,
                causeChain: Object.freeze(extractCauseChain(input)),
            });
        }
        const c = classifyByMessage(msg);
        return Object.freeze({
            code: name.toLowerCase(),
            message: msg,
            userMessage: userFallback,
            kind: c.kind,
            severity: c.severity,
            retryable: c.retryable,
            stack: input.stack,
            causeChain: Object.freeze(extractCauseChain(input)),
        });
    }

    // Plain object
    if (typeof input === 'object') {
        const obj = input as Record<string, unknown>;
        // HTTP status path
        if (typeof obj.status === 'number') {
            const c = classifyByStatus(obj.status);
            return Object.freeze({
                code: isNonEmptyString(obj.code) ? (obj.code as string) : String(obj.status),
                message: isNonEmptyString(obj.message)
                    ? (obj.message as string)
                    : isNonEmptyString(obj.statusText)
                        ? (obj.statusText as string)
                        : `HTTP ${obj.status}`,
                userMessage: userFallback,
                kind: c.kind,
                severity: c.severity,
                retryable: c.retryable,
                causeChain: Object.freeze(
                    [isNonEmptyString(obj.message) ? (obj.message as string) : ''].filter(Boolean) as string[],
                ),
            });
        }
        // Supabase PostgrestError shape
        if (isNonEmptyString(obj.code) && isNonEmptyString(obj.message)) {
            const c = classifyByMessage(obj.message as string);
            return Object.freeze({
                code: obj.code as string,
                message: obj.message as string,
                userMessage: userFallback,
                kind: c.kind,
                severity: c.severity,
                retryable: c.retryable,
                causeChain: Object.freeze([obj.message as string]),
            });
        }
        // Just a message
        if (isNonEmptyString(obj.message)) {
            const c = classifyByMessage(obj.message as string);
            return Object.freeze({
                code: isNonEmptyString(obj.code) ? (obj.code as string) : c.kind,
                message: obj.message as string,
                userMessage: userFallback,
                kind: c.kind,
                severity: c.severity,
                retryable: c.retryable,
                causeChain: Object.freeze([obj.message as string]),
            });
        }
    }

    return Object.freeze({
        code: 'unknown',
        message: UNKNOWN_MESSAGE,
        userMessage: userFallback,
        kind: 'unknown' as const,
        severity: 'error' as const,
        retryable: false,
        causeChain: Object.freeze([]),
    });
}

/**
 * Convenience — `true` when the error is one the user should NOT see in
 * a noisy toast (abort, validation typing errors).
 */
export function shouldSuppressFromUser(err: NormalizedError | null | undefined): boolean {
    if (!err) return false;
    return err.kind === 'abort' || (err.kind === 'validation' && err.severity === 'info');
}
