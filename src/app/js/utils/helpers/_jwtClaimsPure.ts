// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   JWT CLAIMS (utils/helpers — cross-spec pure-logic)
   ================================================================

   Decode + validation de claims JWT (RFC 7519). Pure-logic — NÃO
   verifica signature (isso requer crypto + secret/key, fora deste
   módulo). Caller verifica antes via:
     - Supabase: já valida via gotrue (anon/service_role)
     - Edge function: jose lib OR Deno.crypto.subtle.verify
     - Node: jsonwebtoken / @noble/hashes

   Este módulo:
     1. Decode base64url header + payload (sem verify)
     2. Validate canonical claims (exp/nbf/iat/aud/iss/sub)
     3. Extract subject (auth.uid())
     4. Decide validity verdict

   IMPORTANTE: decodeJwtPayload NÃO confia em signature. Use APENAS
   para inspeção pós-verify-by-trusted-layer (Supabase gotrue,
   edge function jwt verify, etc.). Nunca trust claims direto do
   client sem verify cryptográfico antes.

   Cross-spec consumers:
     - supabase/functions/* (extract auth.uid após Supabase verify)
     - utils/auth/session (peek user.id from session)
     - utils/api/* (audit log com user context)
     - tests/fixtures/auth (test JWT inspection)
   ================================================================ */

export const JWT_MAX_LEN = 4096;
export const DEFAULT_CLOCK_SKEW_SEC = 60;
export const MAX_CLOCK_SKEW_SEC = 300;

export interface DecodedJwt {
    readonly header: Readonly<Record<string, unknown>>;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly signaturePresent: boolean;
    readonly valid: boolean;
    readonly reason: string;
}

export interface ClaimsValidationOptions {
    readonly nowSec?: number;
    readonly clockSkewSec?: number;
    readonly expectedAud?: string | readonly string[];
    readonly expectedIss?: string | readonly string[];
    readonly requireSub?: boolean;
    readonly requireExp?: boolean;
}

export interface ClaimsVerdict {
    readonly valid: boolean;
    readonly expired: boolean;
    readonly notBefore: boolean;
    readonly audOk: boolean;
    readonly issOk: boolean;
    readonly subOk: boolean;
    readonly reasons: readonly string[];
}

function base64urlToBase64(input: string): string {
    return input.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((input.length + 3) % 4);
}

function safeBase64UrlDecode(input: string): string | null {
    if (typeof input !== 'string' || input.length === 0) return null;
    if (!/^[A-Za-z0-9_-]+={0,2}$/.test(input)) return null;
    try {
        if (typeof globalThis.atob === 'function') {
            return globalThis.atob(base64urlToBase64(input));
        }
        const buf = (globalThis as { Buffer?: { from: (s: string, enc: string) => { toString: (enc: string) => string } } })
            .Buffer?.from?.(input, 'base64url');
        return buf?.toString('utf8') ?? null;
    } catch {
        return null;
    }
}

function safeJsonParse(s: string | null): Record<string, unknown> | null {
    if (s === null || s.length === 0) return null;
    try {
        const v = JSON.parse(s);
        if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
        return null;
    } catch {
        return null;
    }
}

function clampClockSkew(value: unknown): number {
    if (typeof value !== 'number' || !isFinite(value) || value < 0) return DEFAULT_CLOCK_SKEW_SEC;
    if (value > MAX_CLOCK_SKEW_SEC) return MAX_CLOCK_SKEW_SEC;
    return Math.floor(value);
}

function clampNow(value: unknown): number {
    if (typeof value !== 'number' || !isFinite(value) || value < 0) return 0;
    return Math.floor(value);
}

export function decodeJwtPayload(jwt: unknown): DecodedJwt {
    const emptyResult: DecodedJwt = Object.freeze({
        header: Object.freeze({}),
        payload: Object.freeze({}),
        signaturePresent: false,
        valid: false,
        reason: 'empty_or_invalid_input',
    });
    if (typeof jwt !== 'string' || jwt.length === 0 || jwt.length > JWT_MAX_LEN) {
        return emptyResult;
    }
    const parts = jwt.split('.');
    if (parts.length !== 3) {
        return Object.freeze({
            ...emptyResult,
            reason: 'malformed_not_three_segments',
        });
    }
    const [h, p, s] = parts;
    const headerJson = safeBase64UrlDecode(h!);
    const payloadJson = safeBase64UrlDecode(p!);
    const header = safeJsonParse(headerJson);
    const payload = safeJsonParse(payloadJson);
    if (!header) {
        return Object.freeze({
            ...emptyResult,
            reason: 'invalid_header_encoding',
        });
    }
    if (!payload) {
        return Object.freeze({
            ...emptyResult,
            reason: 'invalid_payload_encoding',
        });
    }
    return Object.freeze({
        header: Object.freeze(header),
        payload: Object.freeze(payload),
        signaturePresent: typeof s === 'string' && s.length > 0,
        valid: true,
        reason: 'decoded_ok',
    });
}

function matchesExpected(actual: unknown, expected: string | readonly string[] | undefined): boolean {
    if (expected === undefined) return true;
    if (typeof actual !== 'string') return false;
    if (typeof expected === 'string') return actual === expected;
    if (Array.isArray(expected)) return expected.includes(actual);
    return false;
}

export function validateClaims(
    payload: Readonly<Record<string, unknown>> | null | undefined,
    options?: ClaimsValidationOptions
): ClaimsVerdict {
    const reasons: string[] = [];
    if (!payload || typeof payload !== 'object') {
        return Object.freeze({
            valid: false,
            expired: true,
            notBefore: false,
            audOk: false,
            issOk: false,
            subOk: false,
            reasons: Object.freeze(['null_payload']),
        });
    }
    const nowSec = clampNow(options?.nowSec);
    const skew = clampClockSkew(options?.clockSkewSec);
    const exp = typeof payload.exp === 'number' && isFinite(payload.exp) ? payload.exp : null;
    const nbf = typeof payload.nbf === 'number' && isFinite(payload.nbf) ? payload.nbf : null;
    const sub = typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
    let expired = false;
    if (exp !== null) {
        expired = nowSec > exp + skew;
        if (expired) reasons.push('exp_in_past');
    } else if (options?.requireExp === true) {
        expired = true;
        reasons.push('exp_missing_but_required');
    }
    let notBefore = false;
    if (nbf !== null) {
        notBefore = nowSec + skew < nbf;
        if (notBefore) reasons.push('nbf_in_future');
    }
    const audOk = matchesExpected(payload.aud, options?.expectedAud);
    if (!audOk) reasons.push('aud_mismatch');
    const issOk = matchesExpected(payload.iss, options?.expectedIss);
    if (!issOk) reasons.push('iss_mismatch');
    const subOk = options?.requireSub === true ? sub !== null : true;
    if (!subOk) reasons.push('sub_missing_but_required');
    const valid = !expired && !notBefore && audOk && issOk && subOk;
    return Object.freeze({
        valid,
        expired,
        notBefore,
        audOk,
        issOk,
        subOk,
        reasons: Object.freeze(reasons),
    });
}

export function extractSubject(payload: Readonly<Record<string, unknown>> | null | undefined): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const sub = payload.sub;
    if (typeof sub !== 'string' || sub.length === 0) return null;
    return sub;
}

export function isExpired(exp: number | null | undefined, nowSec: number, clockSkewSec?: number): boolean {
    if (typeof exp !== 'number' || !isFinite(exp)) return true;
    const skew = clampClockSkew(clockSkewSec);
    const now = clampNow(nowSec);
    return now > exp + skew;
}

export function extractRoles(payload: Readonly<Record<string, unknown>> | null | undefined): readonly string[] {
    if (!payload || typeof payload !== 'object') return Object.freeze([]);
    const candidates: string[] = [];
    const role = payload.role;
    if (typeof role === 'string' && role.length > 0) candidates.push(role);
    const roles = payload.roles;
    if (Array.isArray(roles)) {
        for (const r of roles) {
            if (typeof r === 'string' && r.length > 0 && !candidates.includes(r)) candidates.push(r);
        }
    }
    const aal = payload.aal;
    if (typeof aal === 'string' && aal.length > 0) candidates.push(`aal:${aal}`);
    return Object.freeze(candidates);
}
