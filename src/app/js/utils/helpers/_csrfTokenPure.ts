// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   CSRF TOKEN (utils/helpers — cross-spec pure-logic)
   ================================================================

   Cross-Site Request Forgery prevention via double-submit cookie
   pattern (OWASP recommended para state-changing endpoints).

   Workflow:
     1. Server gera token derivado de {userId, sessionId, salt, ts_bucket}
        e seta cookie 'csrf_token=<token>; SameSite=Strict; Secure; HttpOnly=false'
     2. Client JS lê cookie e injeta header 'X-CSRF-Token: <token>'
     3. Server compara cookie value vs header value (constant-time)
     4. Match → request legítima. Mismatch → CSRF attack.

   Por que double-submit (vs synchronizer token):
     - Stateless (não requer session store)
     - Cookie SameSite=Strict já bloqueia 99% (defesa redundante)
     - Header X-CSRF-Token só pode ser setado por same-origin JS
       (cross-origin AJAX preflight bloqueia)

   Cross-spec consumers:
     - supabase/functions/* state-changing endpoints (POST/PUT/DELETE)
     - utils/api/* mutation calls
     - utils/auth/session (cookie management)
     - utils/handlers/* (form submission gate)

   Pure-logic: caller injeta randomSeed (Date.now() ou nonce) e
   salt secreto. Verify usa constantTimeEqual de _hmacVerifyPure
   pattern (re-implementado standalone para evitar circular dep).
   ================================================================ */

import { fnv1aHashHex } from './hashFnv1a.js';

export const TOKEN_TTL_SEC = 3600;
export const MIN_TTL_SEC = 60;
export const MAX_TTL_SEC = 86400;
export const TOKEN_PREFIX = 'csrf';
export const DEFAULT_COOKIE_NAME = 'csrf_token';
export const DEFAULT_HEADER_NAME = 'x-csrf-token';
const TOKEN_HASH_LEN = 16;

export interface TokenInput {
    // `| undefined` explícito: callers repassam input.userId/sessionId opcionais
    // (exactOptionalPropertyTypes exige a união na prop opcional).
    readonly userId?: string | null | undefined;
    readonly sessionId?: string | null | undefined;
    readonly salt: string;
    readonly nowSec: number;
    readonly ttlSec?: number;
}

export interface TokenResult {
    readonly token: string;
    readonly issuedAtSec: number;
    readonly expiresAtSec: number;
    readonly cookieDirective: string;
}

export interface VerifyInput {
    readonly cookieToken: string | null | undefined;
    readonly headerToken: string | null | undefined;
    readonly userId?: string | null;
    readonly sessionId?: string | null;
    readonly salt: string;
    readonly nowSec: number;
    readonly ttlSec?: number;
}

export interface VerifyVerdict {
    readonly valid: boolean;
    readonly reason:
        | 'match'
        | 'cookie_missing'
        | 'header_missing'
        | 'mismatch'
        | 'expired'
        | 'invalid_format'
        | 'derivation_mismatch';
    readonly timingSafe: true;
}

export type CsrfAction = 'accept' | 'reject' | 'log_anomaly';

export interface ActionPlan {
    readonly action: CsrfAction;
    readonly reason: string;
}

function clampTtl(ttl: unknown): number {
    if (typeof ttl !== 'number' || !isFinite(ttl) || ttl <= 0) return TOKEN_TTL_SEC;
    if (ttl < MIN_TTL_SEC) return MIN_TTL_SEC;
    if (ttl > MAX_TTL_SEC) return MAX_TTL_SEC;
    return Math.floor(ttl);
}

function clampNowSec(value: unknown): number {
    if (typeof value !== 'number' || !isFinite(value) || value < 0) return 0;
    return Math.floor(value);
}

function safeString(v: unknown, fallback: string = ''): string {
    return typeof v === 'string' ? v : fallback;
}

function constantTimeEqual(a: string, b: string): boolean {
    const maxLen = Math.max(a.length, b.length);
    let diff = a.length ^ b.length;
    for (let i = 0; i < maxLen; i++) {
        const ca = i < a.length ? a.charCodeAt(i) : 0;
        const cb = i < b.length ? b.charCodeAt(i) : 0;
        diff |= ca ^ cb;
    }
    return diff === 0;
}

function bucketFromTime(nowSec: number, ttlSec: number): number {
    return Math.floor(nowSec / ttlSec);
}

function deriveTokenHash(input: TokenInput, ttlSec: number, bucket: number): string {
    const uid = safeString(input.userId, 'anon');
    const sid = safeString(input.sessionId, 'no_session');
    const seed = `${input.salt}|${uid}|${sid}|${bucket}|${ttlSec}`;
    return fnv1aHashHex(seed, TOKEN_HASH_LEN);
}

export function buildCsrfToken(input: TokenInput): TokenResult {
    const ttlSec = clampTtl(input?.ttlSec);
    const nowSec = clampNowSec(input?.nowSec);
    const salt = safeString(input?.salt, '');
    if (salt.length === 0) {
        return Object.freeze({
            token: '',
            issuedAtSec: nowSec,
            expiresAtSec: nowSec,
            cookieDirective: '',
        });
    }
    const bucket = bucketFromTime(nowSec, ttlSec);
    const hash = deriveTokenHash({ ...input, salt }, ttlSec, bucket);
    const token = `${TOKEN_PREFIX}-${hash}`;
    const expiresAtSec = (bucket + 1) * ttlSec;
    const cookieDirective = `${DEFAULT_COOKIE_NAME}=${token}; Path=/; Max-Age=${ttlSec}; SameSite=Strict; Secure`;
    return Object.freeze({
        token,
        issuedAtSec: nowSec,
        expiresAtSec,
        cookieDirective,
    });
}

export function verifyCsrfToken(input: VerifyInput): VerifyVerdict {
    const cookie = safeString(input?.cookieToken, '');
    const header = safeString(input?.headerToken, '');
    if (cookie.length === 0) {
        return Object.freeze({ valid: false, reason: 'cookie_missing' as const, timingSafe: true });
    }
    if (header.length === 0) {
        return Object.freeze({ valid: false, reason: 'header_missing' as const, timingSafe: true });
    }
    if (!cookie.startsWith(`${TOKEN_PREFIX}-`) || !header.startsWith(`${TOKEN_PREFIX}-`)) {
        const _equalForTiming = constantTimeEqual(cookie, header);
        void _equalForTiming;
        return Object.freeze({ valid: false, reason: 'invalid_format' as const, timingSafe: true });
    }
    if (!constantTimeEqual(cookie, header)) {
        return Object.freeze({ valid: false, reason: 'mismatch' as const, timingSafe: true });
    }
    const ttlSec = clampTtl(input?.ttlSec);
    const nowSec = clampNowSec(input?.nowSec);
    const salt = safeString(input?.salt, '');
    if (salt.length === 0) {
        return Object.freeze({ valid: false, reason: 'derivation_mismatch' as const, timingSafe: true });
    }
    const currentBucket = bucketFromTime(nowSec, ttlSec);
    const expected = deriveTokenHash(
        { userId: input.userId, sessionId: input.sessionId, salt, nowSec, ttlSec },
        ttlSec,
        currentBucket
    );
    const cookieHash = cookie.slice(TOKEN_PREFIX.length + 1);
    if (constantTimeEqual(expected, cookieHash)) {
        return Object.freeze({ valid: true, reason: 'match' as const, timingSafe: true });
    }
    const prevBucket = currentBucket - 1;
    if (prevBucket >= 0) {
        const expectedPrev = deriveTokenHash(
            { userId: input.userId, sessionId: input.sessionId, salt, nowSec, ttlSec },
            ttlSec,
            prevBucket
        );
        if (constantTimeEqual(expectedPrev, cookieHash)) {
            const tokenAgeSec = nowSec - prevBucket * ttlSec;
            if (tokenAgeSec <= 2 * ttlSec) {
                return Object.freeze({ valid: true, reason: 'match' as const, timingSafe: true });
            }
            return Object.freeze({ valid: false, reason: 'expired' as const, timingSafe: true });
        }
    }
    return Object.freeze({ valid: false, reason: 'derivation_mismatch' as const, timingSafe: true });
}

export function decideCsrfAction(verdict: VerifyVerdict | null | undefined): ActionPlan {
    if (!verdict || typeof verdict !== 'object') {
        return Object.freeze({ action: 'reject' as const, reason: 'null_verdict' });
    }
    if (verdict.valid) {
        return Object.freeze({ action: 'accept' as const, reason: 'match' });
    }
    if (verdict.reason === 'mismatch' || verdict.reason === 'derivation_mismatch') {
        return Object.freeze({ action: 'log_anomaly' as const, reason: 'possible_csrf_attack' });
    }
    if (verdict.reason === 'expired') {
        return Object.freeze({ action: 'reject' as const, reason: 'token_expired_user_should_retry' });
    }
    return Object.freeze({ action: 'reject' as const, reason: verdict.reason });
}

export function extractFromCookie(cookieStr: unknown, name: string = DEFAULT_COOKIE_NAME): string | null {
    if (typeof cookieStr !== 'string' || cookieStr.length === 0) return null;
    if (typeof name !== 'string' || name.length === 0) return null;
    const parts = cookieStr.split(';');
    for (const part of parts) {
        const eq = part.indexOf('=');
        if (eq <= 0) continue;
        const k = part.slice(0, eq).trim();
        if (k === name) {
            const v = part.slice(eq + 1).trim();
            return v.length > 0 ? v : null;
        }
    }
    return null;
}

export function extractFromHeaders(
    headers: Readonly<Record<string, string | undefined>> | null | undefined,
    name: string = DEFAULT_HEADER_NAME
): string | null {
    if (!headers || typeof headers !== 'object') return null;
    if (typeof name !== 'string' || name.length === 0) return null;
    const targetLower = name.toLowerCase();
    for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === targetLower) {
            const v = headers[k];
            return typeof v === 'string' && v.length > 0 ? v : null;
        }
    }
    return null;
}
