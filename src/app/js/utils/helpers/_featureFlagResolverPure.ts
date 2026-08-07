// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Feature Flag Resolver — pure logic.
 *
 * Resolves a feature flag's effective value from a precedence chain of
 * sources (query-param override → localStorage user choice → remote
 * admin config → static default). Pure: caller supplies all 4 sources
 * as primitive inputs; module returns a frozen verdict with the
 * `source` tag for telemetry/debugging.
 *
 * Cross-spec utility — consumed by `utils/startup/featureFlags`,
 * complianceBanner, surya gate, BARS_UX_V2, etc.
 *
 * Tests live in `tests/feature-flag-resolver-pure.test.mjs`.
 */

export type FlagSource = 'query_param' | 'local_storage' | 'remote_admin' | 'static_default' | 'fallback';

export interface FlagResolverInput<T> {
    readonly flagName: string;
    readonly queryParamValue?: string | null;
    readonly localStorageValue?: string | null;
    readonly remoteAdminValue?: T | null;
    readonly staticDefault: T;
    /** Parser converts raw string to T; ignored for remoteAdminValue (already typed). */
    readonly parse: (raw: string) => T | null;
    /** Optional validator — value must pass to be considered. */
    readonly validate?: (value: T) => boolean;
}

export interface FlagVerdict<T> {
    readonly flagName: string;
    readonly value: T;
    readonly source: FlagSource;
    readonly trace: ReadonlyArray<{ source: FlagSource; rejected: boolean; reason: string }>;
}

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

/**
 * Standard boolean parser — accepts: true/false, 1/0, yes/no, on/off (case-insensitive).
 */
export function parseBooleanFlag(raw: string): boolean | null {
    if (typeof raw !== 'string') return null;
    const t = raw.trim().toLowerCase();
    if (t === 'true' || t === '1' || t === 'yes' || t === 'on') return true;
    if (t === 'false' || t === '0' || t === 'no' || t === 'off') return false;
    return null;
}

/**
 * Standard enum parser builder — returns a parser that accepts only `allowed` values.
 */
export function buildEnumParser<E extends string>(allowed: ReadonlyArray<E>): (raw: string) => E | null {
    const set = new Set(allowed);
    return (raw: string) => (typeof raw === 'string' && set.has(raw as E) ? (raw as E) : null);
}

/**
 * Resolve flag value with full precedence chain + trace.
 *
 * Precedence (highest → lowest):
 *   1. query_param (override, for dev/debug)
 *   2. local_storage (user choice, persistent)
 *   3. remote_admin (server-side config)
 *   4. static_default (hardcoded baseline)
 *
 * Each candidate must:
 *   - Parse successfully (non-null)
 *   - Pass `validate` (when provided)
 *   Otherwise → fall through to next source.
 */
export function resolveFlag<T>(input: FlagResolverInput<T> | null | undefined): FlagVerdict<T> {
    const trace: Array<{ source: FlagSource; rejected: boolean; reason: string }> = [];
    if (!input || typeof input !== 'object') {
        return Object.freeze({
            flagName: 'unknown',
            value: undefined as unknown as T,
            source: 'fallback' as const,
            trace: Object.freeze([{ source: 'fallback' as const, rejected: false, reason: 'input_invalid' }]),
        });
    }
    if (!isNonEmptyString(input.flagName)) {
        return Object.freeze({
            flagName: 'unknown',
            value: input.staticDefault,
            source: 'static_default' as const,
            trace: Object.freeze([{ source: 'static_default' as const, rejected: false, reason: 'flagName_missing' }]),
        });
    }
    if (typeof input.parse !== 'function') {
        return Object.freeze({
            flagName: input.flagName,
            value: input.staticDefault,
            source: 'static_default' as const,
            trace: Object.freeze([{ source: 'static_default' as const, rejected: false, reason: 'parser_missing' }]),
        });
    }

    const validate = typeof input.validate === 'function' ? input.validate : null;
    // Captura após o guard `typeof input.parse !== 'function'` — o narrowing de
    // `input` não-null não flui para dentro do closure tryStringSource.
    const parseFn = input.parse;

    function tryStringSource(raw: string | null | undefined, sourceTag: FlagSource): T | null {
        if (!isNonEmptyString(raw)) {
            trace.push({ source: sourceTag, rejected: true, reason: 'absent_or_empty' });
            return null;
        }
        let parsed: T | null;
        try {
            parsed = parseFn(raw as string);
        } catch (_err) {
            trace.push({ source: sourceTag, rejected: true, reason: 'parser_threw' });
            return null;
        }
        if (parsed === null || parsed === undefined) {
            trace.push({ source: sourceTag, rejected: true, reason: 'parse_failed' });
            return null;
        }
        if (validate && !validate(parsed)) {
            trace.push({ source: sourceTag, rejected: true, reason: 'validate_failed' });
            return null;
        }
        trace.push({ source: sourceTag, rejected: false, reason: 'accepted' });
        return parsed;
    }

    // Precedence chain
    const fromQuery = tryStringSource(input.queryParamValue, 'query_param');
    if (fromQuery !== null) {
        return Object.freeze({
            flagName: input.flagName,
            value: fromQuery,
            source: 'query_param' as const,
            trace: Object.freeze(trace),
        });
    }
    const fromLocal = tryStringSource(input.localStorageValue, 'local_storage');
    if (fromLocal !== null) {
        return Object.freeze({
            flagName: input.flagName,
            value: fromLocal,
            source: 'local_storage' as const,
            trace: Object.freeze(trace),
        });
    }
    // Remote admin is already typed, no parse needed
    if (input.remoteAdminValue !== undefined && input.remoteAdminValue !== null) {
        const v = input.remoteAdminValue;
        if (!validate || validate(v)) {
            trace.push({ source: 'remote_admin', rejected: false, reason: 'accepted' });
            return Object.freeze({
                flagName: input.flagName,
                value: v,
                source: 'remote_admin' as const,
                trace: Object.freeze(trace),
            });
        }
        trace.push({ source: 'remote_admin', rejected: true, reason: 'validate_failed' });
    } else {
        trace.push({ source: 'remote_admin', rejected: true, reason: 'absent' });
    }

    trace.push({ source: 'static_default', rejected: false, reason: 'fallback' });
    return Object.freeze({
        flagName: input.flagName,
        value: input.staticDefault,
        source: 'static_default' as const,
        trace: Object.freeze(trace),
    });
}
