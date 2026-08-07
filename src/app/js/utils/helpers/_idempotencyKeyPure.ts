// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   IDEMPOTENCY KEY (utils/helpers — cross-spec pure-logic)
   ================================================================

   Generates stable idempotency keys for safe HTTP retries against
   non-idempotent endpoints (POST checkout, payment intent, file upload,
   row create). Same logical request → same key, so server can dedup.

   Cross-spec consumers:
     - core/billing/* (ECBT-checkout, library checkout, payment intent)
     - core/ingestion/documents/surya/_edgeRequestBuilderPure (RF4)
     - core/photolog/* (upload sync deduplication)
     - core/forum/* (thread/post creation)
     - utils/api/* (any retried mutation)

   Pure-logic: caller injects nowMs (Date.now()) and TTL. No fetch,
   no Date access, no crypto.randomUUID — deterministic from inputs.
   ================================================================ */

import { fnv1aHashHex } from './hashFnv1a.js';

export const KEY_PREFIX = 'idem';
export const EPHEMERAL_PREFIX = 'ekey';
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
export const MIN_TTL_MS = 1000;
export const MAX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CYCLE_SENTINEL = '<cycle>';
const NAN_SENTINEL = '<NaN>';
const INF_SENTINEL = '<Infinity>';
const NEG_INF_SENTINEL = '<-Infinity>';

export interface IdempotencyKeyInput {
    endpoint: string;
    body?: unknown;
    userId?: string | null;
    salt?: string;
}

export interface IdempotencyKeyResult {
    readonly key: string;
    readonly fingerprint: string;
    readonly createdAtMs: number;
    readonly expiresAtMs: number;
}

export type ReuseAction = 'reuse' | 'rotate' | 'create';

export interface KeyReuseDecision {
    readonly action: ReuseAction;
    readonly reason: string;
}

function clampTtl(ttlMs: number | undefined): number {
    if (typeof ttlMs !== 'number' || !isFinite(ttlMs) || ttlMs <= 0) {
        return DEFAULT_TTL_MS;
    }
    if (ttlMs < MIN_TTL_MS) return MIN_TTL_MS;
    if (ttlMs > MAX_TTL_MS) return MAX_TTL_MS;
    return Math.floor(ttlMs);
}

function normalizeNumber(n: number): string {
    if (Number.isNaN(n)) return NAN_SENTINEL;
    if (n === Infinity) return INF_SENTINEL;
    if (n === -Infinity) return NEG_INF_SENTINEL;
    return JSON.stringify(n);
}

export function canonicalizeBody(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
    if (value === null) return 'null';
    if (value === undefined) return 'null';
    const t = typeof value;
    if (t === 'number') return normalizeNumber(value as number);
    if (t === 'boolean') return (value as boolean) ? 'true' : 'false';
    if (t === 'string') return JSON.stringify(value);
    if (t === 'bigint') return `"${(value as bigint).toString()}n"`;
    if (t === 'function' || t === 'symbol') return 'null';
    if (Array.isArray(value)) {
        if (seen.has(value)) return CYCLE_SENTINEL;
        seen.add(value);
        const items = value.map(v => canonicalizeBody(v, seen));
        seen.delete(value);
        return `[${items.join(',')}]`;
    }
    if (t === 'object') {
        const obj = value as Record<string, unknown>;
        if (seen.has(obj)) return CYCLE_SENTINEL;
        seen.add(obj);
        const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
        const parts = keys.map(k => `${JSON.stringify(k)}:${canonicalizeBody(obj[k], seen)}`);
        seen.delete(obj);
        return `{${parts.join(',')}}`;
    }
    return 'null';
}

function safeEndpoint(endpoint: unknown): string {
    if (typeof endpoint !== 'string' || endpoint.length === 0) {
        return 'unknown_endpoint';
    }
    return endpoint.trim();
}

function safeUserId(userId: unknown): string {
    if (typeof userId !== 'string' || userId.length === 0) return 'anon';
    return userId;
}

function safeSalt(salt: unknown): string {
    if (typeof salt !== 'string') return '';
    return salt;
}

export function buildIdempotencyKey(
    input: IdempotencyKeyInput,
    nowMs: number,
    ttlMs?: number
): IdempotencyKeyResult {
    const ep = safeEndpoint(input?.endpoint);
    const uid = safeUserId(input?.userId);
    const slt = safeSalt(input?.salt);
    const bodyCanon = canonicalizeBody(input?.body);
    const fingerprintSeed = `${ep}|${bodyCanon}`;
    const fingerprint = fnv1aHashHex(fingerprintSeed, 8);
    const keySeed = `${slt}|${uid}|${fingerprintSeed}`;
    const keyHash = fnv1aHashHex(keySeed, 8);
    const safeNow = typeof nowMs === 'number' && isFinite(nowMs) ? Math.floor(nowMs) : 0;
    const ttl = clampTtl(ttlMs);
    const result: IdempotencyKeyResult = {
        key: `${KEY_PREFIX}-${keyHash}`,
        fingerprint,
        createdAtMs: safeNow,
        expiresAtMs: safeNow + ttl,
    };
    return Object.freeze(result);
}

export function decideKeyReuse(
    prevExpiresAtMs: number | null | undefined,
    nowMs: number
): KeyReuseDecision {
    if (prevExpiresAtMs === null || prevExpiresAtMs === undefined) {
        return Object.freeze({ action: 'create' as ReuseAction, reason: 'no_prior_key' });
    }
    if (typeof prevExpiresAtMs !== 'number' || !isFinite(prevExpiresAtMs)) {
        return Object.freeze({ action: 'create' as ReuseAction, reason: 'invalid_prior_expiry' });
    }
    const safeNow = typeof nowMs === 'number' && isFinite(nowMs) ? nowMs : 0;
    if (safeNow > prevExpiresAtMs) {
        return Object.freeze({ action: 'rotate' as ReuseAction, reason: 'expired' });
    }
    return Object.freeze({ action: 'reuse' as ReuseAction, reason: 'within_ttl' });
}

export function buildEphemeralKey(seed: unknown, nowMs: number): string {
    const seedStr = typeof seed === 'string' ? seed : String(seed ?? '');
    const safeNow = typeof nowMs === 'number' && isFinite(nowMs) ? Math.floor(nowMs) : 0;
    const hash = fnv1aHashHex(`${seedStr}|${safeNow}`, 8);
    return `${EPHEMERAL_PREFIX}-${hash}`;
}

export function isExpired(expiresAtMs: number | null | undefined, nowMs: number): boolean {
    if (typeof expiresAtMs !== 'number' || !isFinite(expiresAtMs)) return true;
    const safeNow = typeof nowMs === 'number' && isFinite(nowMs) ? nowMs : 0;
    return safeNow > expiresAtMs;
}
