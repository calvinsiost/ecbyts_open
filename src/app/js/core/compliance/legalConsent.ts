// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   LEGAL CONSENT CORE — SPEC_COMPLIANCE_LEGAL (LEGAL-001)

   Pure helpers para gestão de consentimento LGPD:
   - Terms of Service version tracking
   - Privacy Policy version tracking
   - Cookie banner state
   - Signup consent gate
   - Reconsent trigger em bumps de versão

   Persistência localStorage + Supabase audit fica em handler.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Versioning (bumps forçam reconsent §LEGAL-M4)
// ──────────────────────────────────────────────────────────────────────

interface ParsedVersion {
    major: number;
    minor: number;
    patch: number;
}

type ReconsentReason = 'missing' | 'major_bump' | 'minor_bump' | 'same';

interface ReconsentResult {
    required: boolean;
    categories: string[];
    reason: Record<string, ReconsentReason>;
    showBadge: boolean;
}

interface CookieBannerResult {
    show: boolean;
    reason: string;
}

interface SignupConsentResult {
    canSubmit: boolean;
    missing: string[];
}

/**
 * Versões canônicas atuais - semver MAJOR.MINOR.
 * Bump MAJOR = reconsent obrigatório.
 * Bump MINOR = re-prompt opcional (UI badge).
 */
export const CURRENT_VERSIONS = Object.freeze({
    terms: '1.0',
    privacy: '1.0',
    cookies: '1.0',
});

export const CONSENT_CATEGORIES = Object.freeze(['terms', 'privacy', 'cookies']);

// Cookie categories (§LEGAL-M3)
export const COOKIE_CATEGORIES = Object.freeze({
    essential: { required: true, default: true }, // auth, CSRF
    functional: { required: false, default: true }, // preferências
    analytics: { required: false, default: false }, // Google Analytics, Mixpanel
    marketing: { required: false, default: false }, // ads
});

// ──────────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────────

const SEMVER_RE = /^\d+\.\d+(\.\d+)?$/;

/**
 * Valida formato de versão (semver simples).
 * @param v
 */
export function isValidConsentVersion(v: unknown): boolean {
    return typeof v === 'string' && SEMVER_RE.test(v);
}

/**
 * Parse versão em { major, minor, patch }.
 * @param v
 */
export function parseVersion(v: unknown): ParsedVersion | null {
    if (!isValidConsentVersion(v)) return null;
    const parts = (v as string).split('.').map((n) => parseInt(n, 10) || 0);
    return {
        major: parts[0] || 0,
        minor: parts[1] || 0,
        patch: parts[2] || 0,
    };
}

/**
 * Compara semver. Retorna:
 *  -1 se a < b
 *   0 se iguais
 *   1 se a > b
 *  null se inválidos
 */
export function compareVersions(a: unknown, b: unknown): number | null {
    const A = parseVersion(a);
    const B = parseVersion(b);
    if (!A || !B) return null;
    if (A.major !== B.major) return A.major < B.major ? -1 : 1;
    if (A.minor !== B.minor) return A.minor < B.minor ? -1 : 1;
    if (A.patch !== B.patch) return A.patch < B.patch ? -1 : 1;
    return 0;
}

// ──────────────────────────────────────────────────────────────────────
// Reconsent logic (§LEGAL-M4)
// ──────────────────────────────────────────────────────────────────────

/**
 * Verifica se usuário precisa reconsent dado histórico.
 *
 * Regra: MAJOR bump = reconsent obrigatório (forceFull).
 *        MINOR bump = re-prompt opcional (showBadge).
 *        PATCH = silencioso.
 *
 * @param userHistory - { terms_version, privacy_version, cookies_version }
 * @param unknown>
 */
export function requiresReconsent(
    userHistory: Record<string, unknown> | null | undefined,
    current: Record<string, unknown> = CURRENT_VERSIONS,
): ReconsentResult {
    const reason: Record<string, ReconsentReason> = {};
    const categories: string[] = [];
    let forceFull = false;
    let showBadge = false;

    const _hist = userHistory as Record<string, unknown> | null | undefined;
    const _curr = current as Record<string, unknown>;
    for (const cat of CONSENT_CATEGORIES) {
        const userV = _hist?.[`${cat}_version`];
        const currV = _curr[cat];
        if (!userV) {
            reason[cat] = 'missing';
            categories.push(cat);
            forceFull = true;
            continue;
        }
        const u = parseVersion(userV);
        const c = parseVersion(currV);
        if (!u || !c) {
            reason[cat] = 'missing';
            categories.push(cat);
            forceFull = true;
            continue;
        }
        if (c.major > u.major) {
            reason[cat] = 'major_bump';
            categories.push(cat);
            forceFull = true;
        } else if (c.minor > u.minor) {
            reason[cat] = 'minor_bump';
            categories.push(cat);
            showBadge = true;
        } else {
            reason[cat] = 'same';
        }
    }

    return { required: forceFull, categories, reason, showBadge };
}

// ──────────────────────────────────────────────────────────────────────
// Cookie banner visibility
// ──────────────────────────────────────────────────────────────────────

/**
 * Determina se banner de cookies deve ser exibido (§LEGAL-M3).
 *
 * @param state - { cookie_consent_timestamp, cookie_consent_version }
 */
export function shouldShowCookieBanner(state: Record<string, any> | null | undefined): CookieBannerResult {
    if (!state || typeof state !== 'object') return { show: true, reason: 'no_state' };
    if (!state.cookie_consent_timestamp) return { show: true, reason: 'never_consented' };
    const cmp = compareVersions(state.cookie_consent_version, CURRENT_VERSIONS.cookies);
    if (cmp == null) return { show: true, reason: 'invalid_version' };
    if (cmp < 0) {
        const userV = parseVersion(state.cookie_consent_version);
        const currV = parseVersion(CURRENT_VERSIONS.cookies);
        if (userV && currV && userV.major < currV.major) return { show: true, reason: 'major_bump' };
        return { show: false, reason: 'minor_bump_ok' }; // só badge, não banner modal
    }
    return { show: false, reason: 'up_to_date' };
}

// ──────────────────────────────────────────────────────────────────────
// Signup gate (§LEGAL-M2)
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida se signup tem os aceites obrigatórios antes de submit.
 *
 * @param signupForm - { accepted_terms, accepted_privacy }
 */
export function validateSignupConsent(
    signupForm: Record<string, any> | null | undefined,
): SignupConsentResult {
    const missing: string[] = [];
    if (!signupForm?.accepted_terms) missing.push('terms');
    if (!signupForm?.accepted_privacy) missing.push('privacy');
    return { canSubmit: missing.length === 0, missing };
}

// ──────────────────────────────────────────────────────────────────────
// Consent record generation (LGPD audit trail)
// ──────────────────────────────────────────────────────────────────────

interface ConsentRecordParams {
    userId: string;
    versions?: Record<string, any>;
    cookiePreferences?: Record<string, any>;
    source?: string;
    userAgent?: string;
    ipHash?: string;
}

function resolveVersionField(version: unknown, fallback: string): string {
    return (version || fallback) as string;
}

function resolveCookiePreferences(prefs: Record<string, any> | undefined): Record<string, boolean> {
    const _prefs = prefs || {};
    const _cat = COOKIE_CATEGORIES as Record<string, any>;
    return {
        essential: true, // sempre
        functional: typeof _prefs.functional === 'boolean' ? _prefs.functional : _cat.functional.default,
        analytics: typeof _prefs.analytics === 'boolean' ? _prefs.analytics : _cat.analytics.default,
        marketing: typeof _prefs.marketing === 'boolean' ? _prefs.marketing : _cat.marketing.default,
    };
}

/**
 * Gera consent record auditável (imutável).
 *
 * @param params
 */
export function generateConsentRecord(params: ConsentRecordParams | null | undefined): object {
    if (!params || !params.userId) throw new Error('generateConsentRecord: userId required');
    const now = new Date().toISOString();
    const versions = params.versions || {};
    return Object.freeze({
        userId: params.userId,
        consented_at: now,
        terms_version: resolveVersionField(versions.terms, CURRENT_VERSIONS.terms),
        privacy_version: resolveVersionField(versions.privacy, CURRENT_VERSIONS.privacy),
        cookies_version: resolveVersionField(versions.cookies, CURRENT_VERSIONS.cookies),
        cookie_preferences: Object.freeze(resolveCookiePreferences(params.cookiePreferences)),
        source: params.source || 'unknown',
        user_agent: params.userAgent || null,
        ip_hash: params.ipHash || null, // PII → hashed upstream
    });
}

/**
 * Valida shape de consent record (para leitura de DB).
 */
export function isValidConsentRecord(record: any): boolean {
    return !!(
        record &&
        typeof record === 'object' &&
        typeof record.userId === 'string' &&
        record.consented_at &&
        isValidConsentVersion(record.terms_version) &&
        isValidConsentVersion(record.privacy_version) &&
        isValidConsentVersion(record.cookies_version)
    );
}

// ──────────────────────────────────────────────────────────────────────
// Cookie preference merge (opt-in vs opt-out)
// ──────────────────────────────────────────────────────────────────────

/**
 * Sanitiza preferências de cookies - essential sempre true, resto respeita default.
 *
 * @param prefs
 */
export function sanitizeCookiePreferences(prefs: Record<string, any> = {}): Record<string, boolean> {
    const out: Record<string, boolean> = { essential: true };
    const _prefs = prefs as Record<string, any>;
    const _cat = COOKIE_CATEGORIES as Record<string, any>;
    for (const cat of Object.keys(COOKIE_CATEGORIES)) {
        if (cat === 'essential') continue;
        out[cat] = typeof _prefs[cat] === 'boolean' ? _prefs[cat] : _cat[cat].default;
    }
    return out;
}
