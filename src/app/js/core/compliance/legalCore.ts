// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   COMPLIANCE LEGAL CORE — SPEC_COMPLIANCE_LEGAL (LEGAL-001)

   Pure helpers para LGPD/ToS/Privacy:
   - Cookie taxonomy + essential vs optional §LEGAL-M3
   - Consent state machine (accepted/optional_rejected/pending)
   - LGPD data subject rights (Art. 18 LGPD)
   - Retention policy lookup por tipo de dado
   - Version comparator para reconsent

   UI banner + pages ficam em handler.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §LEGAL-M3
// ──────────────────────────────────────────────────────────────────────

interface CookieCatalogEntry {
    prefix: string;
    category: string;
    essential: boolean;
    desc: string;
}

// Catálogo de cookies + categorização §M3 tabela
export const COOKIE_CATALOG: ReadonlyArray<CookieCatalogEntry> = Object.freeze([
    Object.freeze({ prefix: 'sb-', category: 'auth', essential: true, desc: 'Sessão Supabase' }),
    Object.freeze({ prefix: 'ecbyts-language', category: 'preference', essential: true, desc: 'Idioma selecionado' }),
    Object.freeze({ prefix: 'ecbyts-theme', category: 'preference', essential: false, desc: 'Tema dark/light' }),
    Object.freeze({ prefix: 'ecbyts-constellation-', category: 'layout', essential: false, desc: 'Estado do HUD' }),
    Object.freeze({ prefix: 'ecbyts-panel-layout', category: 'layout', essential: false, desc: 'Layout de painéis' }),
    Object.freeze({
        prefix: 'ecbyts-cookie-consent',
        category: 'consent',
        essential: true,
        desc: 'Estado do consentimento',
    }),
]);

export const COOKIE_CATEGORIES = Object.freeze(['auth', 'preference', 'layout', 'consent', 'analytics']);

export const CONSENT_STATES = Object.freeze(['pending', 'accepted', 'optional_rejected']);

// Art. 18 LGPD - direitos do titular
export const LGPD_SUBJECT_RIGHTS = Object.freeze([
    'confirmation', // confirmação de tratamento (inciso I)
    'access', // acesso aos dados (inciso II)
    'correction', // correção (inciso III)
    'anonymization', // anonimização/bloqueio/eliminação (inciso IV)
    'portability', // portabilidade (inciso V)
    'deletion', // eliminação (inciso VI)
    'information', // informação sobre compartilhamento (inciso VII)
    'revocation', // revogação de consentimento (inciso IX)
]);

// Retention por tipo de dado (dias)
export const DATA_RETENTION = Object.freeze({
    profile: 365, // enquanto ativo + 365d pós-deleção
    telemetry: 30, // debug
    metering: 90, // billing
    audit_trail: 1825, // 5 anos CETESB
    environmental_models: -1, // IP do usuário
    error_reports: 90,
    payment_records: 1825, // receita federal 5y
});

// Versão atual dos documentos legais (para reconsent detection)
export const LEGAL_VERSIONS = Object.freeze({
    terms: '1.0.0',
    privacy: '1.0.0',
});

// Base legal LGPD Art. 7
export const LEGAL_BASES = Object.freeze([
    'consent', // Art. 7, I
    'contract_execution', // Art. 7, V
    'legitimate_interest', // Art. 7, IX
    'legal_obligation', // Art. 7, II
]);

// ──────────────────────────────────────────────────────────────────────
// Cookie classification
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} cookieName
 * @returns {any|null} entry do catálogo
 */
export function classifyCookie(cookieName: string): CookieCatalogEntry | null {
    if (typeof cookieName !== 'string') return null;
    for (const entry of COOKIE_CATALOG) {
        if (cookieName === entry.prefix || cookieName.startsWith(entry.prefix)) {
            return entry;
        }
    }
    return null;
}

/**
 * @param {string} cookieName
 * @returns {boolean}
 */
export function isEssentialCookie(cookieName: string): boolean {
    const entry = classifyCookie(cookieName);
    return entry ? entry.essential === true : false;
}

/**
 * Lista cookies permitidos dado um consent state.
 * @param {string} consentState
 * @returns {Array<string>} prefixes permitidos
 */
export function listAllowedCookies(consentState: string): Array<string> {
    if (consentState === 'accepted') {
        return COOKIE_CATALOG.map((c) => c.prefix);
    }
    // pending ou optional_rejected → só essenciais
    return COOKIE_CATALOG.filter((c) => c.essential).map((c) => c.prefix);
}

// ──────────────────────────────────────────────────────────────────────
// Consent state machine
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {Record<string, any>} storedState
 * @returns {'pending'|'accepted'|'optional_rejected'}
 */
export function resolveConsentState(storedState: Record<string, any>): 'pending'|'accepted'|'optional_rejected' {
    if (!storedState || typeof storedState !== 'object') return 'pending';
    if (!storedState.accepted_at) return 'pending';
    // Reconsent: se versão do Privacy mudou
    if (storedState.privacy_version !== LEGAL_VERSIONS.privacy) return 'pending';
    if (storedState.essential === true && storedState.preferences === true) return 'accepted';
    if (storedState.essential === true && !storedState.preferences) return 'optional_rejected';
    return 'pending';
}

/**
 * Constrói payload de consent para localStorage.
 * @param {{ preferences?: boolean }} [options]
 * @returns {Object}
 */
export function buildConsentPayload(options: { preferences?: boolean } = {}): object {
    return {
        essential: true,
        preferences: Boolean(options.preferences),
        accepted_at: new Date().toISOString(),
        privacy_version: LEGAL_VERSIONS.privacy,
        terms_version: LEGAL_VERSIONS.terms,
    };
}

// ──────────────────────────────────────────────────────────────────────
// LGPD rights validator
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} right
 * @returns {boolean}
 */
export function isValidLgpdRight(right: string): boolean {
    return LGPD_SUBJECT_RIGHTS.includes(right);
}

/**
 * Decide se um pedido de right pode ser executado dado state do usuário.
 * @param {string} right
 * @param {{ hasConsent: boolean, accountStatus: string }} user
 * @returns {{ allowed: boolean, reason: string }}
 */
export function evaluateRightRequest(right: string, user: { hasConsent: boolean, accountStatus: string }): { allowed: boolean, reason: string } {
    if (!isValidLgpdRight(right)) {
        return { allowed: false, reason: 'invalid_right' };
    }
    // Confirmation + access: sempre permitido (qualquer user autenticado)
    if (right === 'confirmation' || right === 'access') {
        return { allowed: true, reason: 'ok' };
    }
    // Revocation requer consentimento prévio
    if (right === 'revocation') {
        if (!user || !user.hasConsent) {
            return { allowed: false, reason: 'no_prior_consent' };
        }
        return { allowed: true, reason: 'ok' };
    }
    // Outros: user deve existir
    if (!user || user.accountStatus === 'deleted') {
        return { allowed: false, reason: 'account_not_found' };
    }
    return { allowed: true, reason: 'ok' };
}

// ──────────────────────────────────────────────────────────────────────
// Retention lookup
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} dataType
 * @returns {number} dias (-1 = indefinido)
 */
export function getRetentionDays(dataType: string): number {
    if (typeof dataType !== 'string') return 0;
    return ((DATA_RETENTION as Record<string, any>)[dataType] ?? 0) as number;
}

/**
 * @param {string} basis
 * @returns {boolean}
 */
export function isValidLegalBasis(basis: string): boolean {
    return LEGAL_BASES.includes(basis);
}

// ──────────────────────────────────────────────────────────────────────
// Version comparator
// ──────────────────────────────────────────────────────────────────────

/**
 * Retorna true se o consent armazenado precisa de reconsent.
 * @param {{ privacy_version?: string, terms_version?: string }} stored
 * @returns {boolean}
 */
export function needsReconsent(stored: { privacy_version?: string, terms_version?: string }): boolean {
    if (!stored || typeof stored !== 'object') return true;
    if (stored.privacy_version !== LEGAL_VERSIONS.privacy) return true;
    if (stored.terms_version !== LEGAL_VERSIONS.terms) return true;
    return false;
}
