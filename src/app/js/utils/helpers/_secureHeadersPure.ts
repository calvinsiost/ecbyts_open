// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   SECURE HTTP HEADERS (utils/helpers — cross-spec pure-logic)
   ================================================================

   Composer + auditor de HTTP security headers. Endereça SEC-HARDENING
   001 🟡:
     - HSTS ausente (Bluehost+Vercel)
     - CSP com unsafe-inline (XSS surface)

   Pure-logic: produz strings de header e dicionário de bundle.
   Caller aplica no Response/Edge Function/.htaccess.

   Headers cobertos (OWASP Secure Headers Project):
     - Strict-Transport-Security (HSTS)
     - Content-Security-Policy (CSP, no unsafe-inline)
     - X-Frame-Options
     - X-Content-Type-Options
     - Referrer-Policy
     - Permissions-Policy
     - Cross-Origin-Opener-Policy
     - Cross-Origin-Embedder-Policy

   Reference: https://owasp.org/www-project-secure-headers/ + MDN.
   ================================================================ */

export const DEFAULT_HSTS_MAX_AGE_SEC = 63072000;
export const MIN_HSTS_MAX_AGE_SEC = 86400;
export const MAX_HSTS_MAX_AGE_SEC = 63072000;

export interface HstsOptions {
    readonly maxAgeSec?: number;
    readonly includeSubDomains?: boolean;
    readonly preload?: boolean;
}

export interface CspOptions {
    readonly nonce?: string;
    readonly scriptHashes?: readonly string[];
    readonly styleHashes?: readonly string[];
    readonly reportUri?: string;
    readonly allowFrames?: readonly string[];
    readonly allowConnect?: readonly string[];
    readonly allowImg?: readonly string[];
    readonly reportOnly?: boolean;
}

export type FrameOption = 'DENY' | 'SAMEORIGIN';

export type ReferrerPolicyOption =
    | 'no-referrer'
    | 'no-referrer-when-downgrade'
    | 'origin'
    | 'origin-when-cross-origin'
    | 'same-origin'
    | 'strict-origin'
    | 'strict-origin-when-cross-origin'
    | 'unsafe-url';

export type CrossOriginOpenerPolicy = 'unsafe-none' | 'same-origin' | 'same-origin-allow-popups';

export type CrossOriginEmbedderPolicy = 'unsafe-none' | 'require-corp' | 'credentialless';

export interface SecureHeadersOptions {
    readonly hsts?: HstsOptions | false;
    readonly csp?: CspOptions | false;
    readonly frameOptions?: FrameOption | false;
    readonly referrerPolicy?: ReferrerPolicyOption | false;
    readonly permissionsPolicy?: string | false;
    readonly coop?: CrossOriginOpenerPolicy | false;
    readonly coep?: CrossOriginEmbedderPolicy | false;
}

export type HeaderName =
    | 'Strict-Transport-Security'
    | 'Content-Security-Policy'
    | 'Content-Security-Policy-Report-Only'
    | 'X-Frame-Options'
    | 'X-Content-Type-Options'
    | 'Referrer-Policy'
    | 'Permissions-Policy'
    | 'Cross-Origin-Opener-Policy'
    | 'Cross-Origin-Embedder-Policy';

export type HeadersBundle = Readonly<Partial<Record<HeaderName, string>>>;

function clampMaxAge(value: unknown): number {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return DEFAULT_HSTS_MAX_AGE_SEC;
    if (value < MIN_HSTS_MAX_AGE_SEC) return MIN_HSTS_MAX_AGE_SEC;
    if (value > MAX_HSTS_MAX_AGE_SEC) return MAX_HSTS_MAX_AGE_SEC;
    return Math.floor(value);
}

function isValidNonce(s: unknown): s is string {
    return typeof s === 'string' && /^[A-Za-z0-9+/=_-]{8,}$/.test(s);
}

function isValidHash(s: unknown): s is string {
    return typeof s === 'string' && /^sha(256|384|512)-[A-Za-z0-9+/=]+$/.test(s);
}

function dedupeStrings(list: readonly string[] | undefined): string[] {
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of list) {
        if (typeof v !== 'string' || v.length === 0) continue;
        if (!seen.has(v)) {
            seen.add(v);
            out.push(v);
        }
    }
    return out;
}

export function buildHstsHeader(opts?: HstsOptions): string {
    const maxAge = clampMaxAge(opts?.maxAgeSec);
    const parts = [`max-age=${maxAge}`];
    if (opts?.includeSubDomains !== false) parts.push('includeSubDomains');
    if (opts?.preload === true && maxAge >= 31536000) parts.push('preload');
    return parts.join('; ');
}

export function buildCspDirective(opts?: CspOptions): string {
    const scriptSrc: string[] = ["'self'"];
    const styleSrc: string[] = ["'self'"];
    const validNonce = opts?.nonce && isValidNonce(opts.nonce);
    if (validNonce) {
        scriptSrc.push(`'nonce-${opts!.nonce}'`);
        styleSrc.push(`'nonce-${opts!.nonce}'`);
    }
    const scriptHashes = dedupeStrings(opts?.scriptHashes).filter(isValidHash);
    for (const h of scriptHashes) scriptSrc.push(`'${h}'`);
    const styleHashes = dedupeStrings(opts?.styleHashes).filter(isValidHash);
    for (const h of styleHashes) styleSrc.push(`'${h}'`);
    scriptSrc.push("'strict-dynamic'");
    const imgSrc: string[] = ["'self'", 'data:', 'blob:'];
    for (const v of dedupeStrings(opts?.allowImg)) imgSrc.push(v);
    const connectSrc: string[] = ["'self'"];
    for (const v of dedupeStrings(opts?.allowConnect)) connectSrc.push(v);
    const frameSrc: string[] = ["'self'"];
    for (const v of dedupeStrings(opts?.allowFrames)) frameSrc.push(v);
    const directives: string[] = [
        `default-src 'self'`,
        `script-src ${scriptSrc.join(' ')}`,
        `style-src ${styleSrc.join(' ')}`,
        `img-src ${imgSrc.join(' ')}`,
        `connect-src ${connectSrc.join(' ')}`,
        `frame-src ${frameSrc.join(' ')}`,
        `font-src 'self' data:`,
        `object-src 'none'`,
        `base-uri 'self'`,
        `form-action 'self'`,
        `frame-ancestors 'none'`,
        `upgrade-insecure-requests`,
    ];
    if (typeof opts?.reportUri === 'string' && opts.reportUri.length > 0) {
        directives.push(`report-uri ${opts.reportUri}`);
    }
    return directives.join('; ');
}

export function buildSecureHeaders(opts?: SecureHeadersOptions): HeadersBundle {
    const out: Partial<Record<HeaderName, string>> = {};
    if (opts?.hsts !== false) {
        out['Strict-Transport-Security'] = buildHstsHeader(typeof opts?.hsts === 'object' ? opts.hsts : undefined);
    }
    if (opts?.csp !== false) {
        const cspOpts = typeof opts?.csp === 'object' ? opts.csp : undefined;
        const headerName: HeaderName = cspOpts?.reportOnly === true
            ? 'Content-Security-Policy-Report-Only'
            : 'Content-Security-Policy';
        out[headerName] = buildCspDirective(cspOpts);
    }
    if (opts?.frameOptions !== false) {
        const v = opts?.frameOptions ?? 'DENY';
        out['X-Frame-Options'] = v;
    }
    out['X-Content-Type-Options'] = 'nosniff';
    if (opts?.referrerPolicy !== false) {
        out['Referrer-Policy'] = opts?.referrerPolicy ?? 'strict-origin-when-cross-origin';
    }
    if (opts?.permissionsPolicy !== false) {
        out['Permissions-Policy'] =
            opts?.permissionsPolicy ?? 'camera=(), microphone=(), geolocation=(self), interest-cohort=()';
    }
    if (opts?.coop !== false) {
        out['Cross-Origin-Opener-Policy'] = opts?.coop ?? 'same-origin';
    }
    if (opts?.coep !== false) {
        out['Cross-Origin-Embedder-Policy'] = opts?.coep ?? 'require-corp';
    }
    return Object.freeze(out);
}

export interface AssessmentReport {
    readonly score: number;
    readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
    readonly missing: readonly HeaderName[];
    readonly weak: readonly { readonly header: HeaderName; readonly reason: string }[];
}

const REQUIRED_HEADERS: readonly HeaderName[] = Object.freeze([
    'Strict-Transport-Security',
    'Content-Security-Policy',
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
]);

export function assessHeaders(observed: Readonly<Record<string, string>> | null | undefined): AssessmentReport {
    if (!observed || typeof observed !== 'object') {
        return Object.freeze({
            score: 0,
            grade: 'F' as const,
            missing: Object.freeze([...REQUIRED_HEADERS]),
            weak: Object.freeze([]),
        });
    }
    const normalized: Record<string, string> = {};
    for (const k of Object.keys(observed)) {
        normalized[k.toLowerCase()] = observed[k] ?? '';
    }
    const missing: HeaderName[] = [];
    const weak: { header: HeaderName; reason: string }[] = [];
    let score = 0;
    for (const h of REQUIRED_HEADERS) {
        const v = normalized[h.toLowerCase()];
        if (!v) {
            missing.push(h);
            continue;
        }
        score += 20;
        if (h === 'Content-Security-Policy' && /['"]?unsafe-inline['"]?/i.test(v)) {
            weak.push({ header: h, reason: 'contains_unsafe_inline' });
            score -= 10;
        }
        if (h === 'Strict-Transport-Security') {
            const ageMatch = v.match(/max-age=(\d+)/i);
            const age = ageMatch ? parseInt(ageMatch[1]!, 10) : 0;
            if (age < MIN_HSTS_MAX_AGE_SEC) {
                weak.push({ header: h, reason: 'max_age_too_short' });
                score -= 10;
            }
        }
    }
    if (score < 0) score = 0;
    if (score > 100) score = 100;
    let grade: AssessmentReport['grade'];
    if (score >= 90) grade = 'A';
    else if (score >= 75) grade = 'B';
    else if (score >= 60) grade = 'C';
    else if (score >= 40) grade = 'D';
    else grade = 'F';
    return Object.freeze({
        score,
        grade,
        missing: Object.freeze(missing),
        weak: Object.freeze(weak),
    });
}
