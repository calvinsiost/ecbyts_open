// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   HMAC VERIFY (utils/helpers — cross-spec pure-logic)
   ================================================================

   Constant-time comparison + decision pipeline para verificação
   HMAC de webhooks. SEC-HARDENING-001 🟡 flagou "HMAC não-constant-
   time" — esta lib substitui `expected === received` (timing leak)
   por XOR byte-by-byte sem short-circuit.

   IMPORTANTE: caller computa o HMAC real via Web Crypto (Node
   crypto.createHmac ou SubtleCrypto.sign), pois esta é pure-logic
   e não faz I/O. Esta lib só compara + decide.

   Pipeline:
     1. Webhook recebe header 'Stripe-Signature: t=123,v1=abc'
        ou 'X-Hub-Signature-256: sha256=def'
     2. parseSignatureHeader(raw) → {scheme, value, ts?}
     3. Caller computa HMAC do body com secret
     4. verifyHmacSignature({expected, received, scheme, ts, nowSec, tolerance})
     5. decideVerifyAction(verdict) → accept | reject | log_anomaly

   Cross-spec consumers (SEC-HARDENING-001 🟡 PRIORITY):
     - supabase/functions/stripe-webhook (verifyHmacSignature)
     - supabase/functions/mercadopago-webhook (verifyHmacSignature)
     - utils/api/* (qualquer endpoint que verifica HMAC)
   ================================================================ */

export type HmacScheme = 'sha256' | 'sha384' | 'sha512';

export const SUPPORTED_SCHEMES: readonly HmacScheme[] = Object.freeze([
    'sha256',
    'sha384',
    'sha512',
]);

export const DEFAULT_TOLERANCE_SEC = 300;
export const MIN_TOLERANCE_SEC = 1;
export const MAX_TOLERANCE_SEC = 60 * 60;
export const MIN_SIGNATURE_HEX_LEN = 32;
export const MAX_SIGNATURE_HEX_LEN = 256;

export interface ParsedSignature {
    readonly scheme: HmacScheme | null;
    readonly value: string;
    readonly ts: number | null;
    readonly valid: boolean;
    readonly reason: string;
}

export interface VerifyInput {
    readonly expected: string;
    readonly received: string;
    readonly scheme?: HmacScheme;
    readonly timestampSec?: number | null;
    readonly nowSec?: number;
    readonly toleranceSec?: number;
}

export interface VerifyVerdict {
    readonly valid: boolean;
    readonly reason: string;
    readonly timingSafe: boolean;
    readonly schemeOk: boolean;
    readonly timestampOk: boolean;
}

export type VerifyAction = 'accept' | 'reject' | 'log_anomaly';

export interface ActionPlan {
    readonly action: VerifyAction;
    readonly reason: string;
}

function isHex(s: string): boolean {
    if (s.length === 0) return false;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        const isDigit = c >= 48 && c <= 57;
        const isLower = c >= 97 && c <= 102;
        const isUpper = c >= 65 && c <= 70;
        if (!isDigit && !isLower && !isUpper) return false;
    }
    return true;
}

function clampTolerance(tol: unknown): number {
    if (typeof tol !== 'number' || !isFinite(tol) || tol <= 0) return DEFAULT_TOLERANCE_SEC;
    if (tol < MIN_TOLERANCE_SEC) return MIN_TOLERANCE_SEC;
    if (tol > MAX_TOLERANCE_SEC) return MAX_TOLERANCE_SEC;
    return Math.floor(tol);
}

function isSupportedScheme(s: unknown): s is HmacScheme {
    return s === 'sha256' || s === 'sha384' || s === 'sha512';
}

export function constantTimeEqual(a: unknown, b: unknown): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const strA = a;
    const strB = b;
    const maxLen = Math.max(strA.length, strB.length);
    let diff = strA.length ^ strB.length;
    for (let i = 0; i < maxLen; i++) {
        const ca = i < strA.length ? strA.charCodeAt(i) : 0;
        const cb = i < strB.length ? strB.charCodeAt(i) : 0;
        diff |= ca ^ cb;
    }
    return diff === 0;
}

export function parseSignatureHeader(raw: unknown): ParsedSignature {
    if (typeof raw !== 'string' || raw.length === 0) {
        return Object.freeze({
            scheme: null,
            value: '',
            ts: null,
            valid: false,
            reason: 'empty_header',
        });
    }
    const trimmed = raw.trim();
    if (trimmed.includes(',') && trimmed.includes('=')) {
        const parts = trimmed.split(',').map(p => p.trim());
        let ts: number | null = null;
        let v1: string | null = null;
        for (const part of parts) {
            const eq = part.indexOf('=');
            if (eq < 0) continue;
            const k = part.slice(0, eq).trim();
            const v = part.slice(eq + 1).trim();
            if (k === 't') {
                const n = parseInt(v, 10);
                if (isFinite(n) && n > 0) ts = n;
            } else if (k === 'v1' || k === 'sig') {
                v1 = v;
            }
        }
        if (v1 && isHex(v1) && v1.length >= MIN_SIGNATURE_HEX_LEN && v1.length <= MAX_SIGNATURE_HEX_LEN) {
            return Object.freeze({
                scheme: 'sha256' as HmacScheme,
                value: v1.toLowerCase(),
                ts,
                valid: true,
                reason: 'comma_separated_ok',
            });
        }
        return Object.freeze({
            scheme: null,
            value: '',
            ts,
            valid: false,
            reason: 'invalid_v1_or_signature',
        });
    }
    const eq = trimmed.indexOf('=');
    if (eq < 0) {
        return Object.freeze({
            scheme: null,
            value: '',
            ts: null,
            valid: false,
            reason: 'no_scheme_separator',
        });
    }
    const schemeRaw = trimmed.slice(0, eq).trim().toLowerCase();
    const value = trimmed.slice(eq + 1).trim().toLowerCase();
    if (!isSupportedScheme(schemeRaw)) {
        return Object.freeze({
            scheme: null,
            value: '',
            ts: null,
            valid: false,
            reason: 'unsupported_scheme',
        });
    }
    if (!isHex(value) || value.length < MIN_SIGNATURE_HEX_LEN || value.length > MAX_SIGNATURE_HEX_LEN) {
        return Object.freeze({
            scheme: schemeRaw,
            value: '',
            ts: null,
            valid: false,
            reason: 'invalid_hex_signature',
        });
    }
    return Object.freeze({
        scheme: schemeRaw,
        value,
        ts: null,
        valid: true,
        reason: 'scheme_eq_ok',
    });
}

export function verifyHmacSignature(input: VerifyInput | null | undefined): VerifyVerdict {
    if (!input || typeof input !== 'object') {
        return Object.freeze({
            valid: false,
            reason: 'null_input',
            timingSafe: true,
            schemeOk: false,
            timestampOk: false,
        });
    }
    const scheme = input.scheme ?? 'sha256';
    const schemeOk = isSupportedScheme(scheme);
    if (!schemeOk) {
        return Object.freeze({
            valid: false,
            reason: 'unsupported_scheme',
            timingSafe: true,
            schemeOk: false,
            timestampOk: false,
        });
    }
    let timestampOk = true;
    if (typeof input.timestampSec === 'number' && isFinite(input.timestampSec)) {
        const now = typeof input.nowSec === 'number' && isFinite(input.nowSec)
            ? Math.floor(input.nowSec)
            : 0;
        const tol = clampTolerance(input.toleranceSec);
        const drift = Math.abs(now - Math.floor(input.timestampSec));
        timestampOk = drift <= tol;
        if (!timestampOk) {
            const equalForTiming = constantTimeEqual(input.expected, input.received);
            return Object.freeze({
                valid: false,
                reason: 'timestamp_drift_exceeds_tolerance',
                timingSafe: true,
                schemeOk,
                timestampOk: false,
                ...(equalForTiming ? {} : {}),
            });
        }
    }
    const equal = constantTimeEqual(input.expected, input.received);
    return Object.freeze({
        valid: equal,
        reason: equal ? 'signature_match' : 'signature_mismatch',
        timingSafe: true,
        schemeOk,
        timestampOk,
    });
}

export function decideVerifyAction(verdict: VerifyVerdict | null | undefined): ActionPlan {
    if (!verdict || typeof verdict !== 'object') {
        return Object.freeze({ action: 'reject' as VerifyAction, reason: 'null_verdict' });
    }
    if (verdict.valid) {
        return Object.freeze({ action: 'accept' as VerifyAction, reason: verdict.reason });
    }
    if (verdict.reason === 'timestamp_drift_exceeds_tolerance') {
        return Object.freeze({
            action: 'log_anomaly' as VerifyAction,
            reason: 'possible_replay_attack',
        });
    }
    if (verdict.reason === 'unsupported_scheme') {
        return Object.freeze({
            action: 'log_anomaly' as VerifyAction,
            reason: 'misconfigured_or_attack',
        });
    }
    return Object.freeze({ action: 'reject' as VerifyAction, reason: verdict.reason });
}
