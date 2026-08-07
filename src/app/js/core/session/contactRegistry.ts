// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CONTACT REGISTRY — SPEC_EMAIL_CENTRALIZATION_ADMIN (ADMIN-EMAIL-CENTRAL-001)

   Pure helpers para centralização de emails admin:
   - Contact types (§2 public slots)
   - Email validation (RFC 5322 subset)
   - Domain whitelist (anti-hardcode de gmail/hotmail pessoal §Q2)
   - Fallback canônico para founder@ecbyts.com

   Edge Function loader + cache em handler (utils/api/contactConfig).
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Canonical slots
// ──────────────────────────────────────────────────────────────────────

export const CONTACT_SLOTS = Object.freeze(['privacy', 'support', 'founder', 'legal', 'security', 'compliance']);

// Fallback canônico §Q2 - se config não carregou ou slot ausente, usa aqui.
export const CANONICAL_FALLBACKS = Object.freeze({
    privacy: 'privacy@ecbyts.com',
    support: 'support@ecbyts.com',
    founder: 'founder@ecbyts.com',
    legal: 'legal@ecbyts.com',
    security: 'security@ecbyts.com',
    compliance: 'compliance@ecbyts.com',
});

// Domains proibidos em valores "hardcoded" (§Q2 anti-gmail/hotmail pessoal)
export const FORBIDDEN_PERSONAL_DOMAINS = Object.freeze([
    'gmail.com',
    'hotmail.com',
    'outlook.com',
    'yahoo.com',
    'live.com',
    'icloud.com',
]);

// Domain canônico do projeto
export const CANONICAL_DOMAIN = 'ecbyts.com';

// Cache config TTL §Q1
export const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

// ──────────────────────────────────────────────────────────────────────
// Email validation (RFC 5322 subset, relaxed)
// ──────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Valida shape de email.
 */
export function isValidEmail(email: string): boolean {
    if (typeof email !== 'string' || email.length === 0 || email.length > 254) return false;
    return EMAIL_RE.test(email);
}

/**
 * Extrai domínio do email.
 */
export function getEmailDomain(email: string): string | null {
    if (!isValidEmail(email)) return null;
    const parts = email.split('@');
    return parts[1] ? parts[1].toLowerCase() : null;
}

/**
 * Detecta se email usa domínio pessoal proibido §Q2.
 */
export function isPersonalDomain(email: string): boolean {
    const domain = getEmailDomain(email);
    if (!domain) return false;
    return FORBIDDEN_PERSONAL_DOMAINS.includes(domain);
}

/**
 * Verifica se email está no domínio canônico ecbyts.com.
 */
export function isCanonicalDomain(email: string): boolean {
    const domain = getEmailDomain(email);
    return domain === CANONICAL_DOMAIN;
}

// ──────────────────────────────────────────────────────────────────────
// Slot lookup
// ──────────────────────────────────────────────────────────────────────

export function isValidSlot(slot: string): boolean {
    return typeof slot === 'string' && CONTACT_SLOTS.includes(slot);
}

/**
 * Resolve email para um slot. config override → canonical fallback.
 */
export function resolveContactEmail(slot: string, config: Record<string, string> = {}): string | null {
    if (!isValidSlot(slot)) return null;
    const raw = config?.[slot];
    if (typeof raw === 'string' && isValidEmail(raw)) return raw;
    const fallback = (CANONICAL_FALLBACKS as Record<string, string>)[slot];
    return fallback || null;
}

// ──────────────────────────────────────────────────────────────────────
// Config validation
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida config global de contacts.
 *
 * @param config - { [slot]: email }
 */
export function validateContactConfig(config: object): {
    valid: boolean;
    errors: string[];
    warnings: string[];
} {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!config || typeof config !== 'object') {
        return { valid: false, errors: ['config not object'], warnings: [] };
    }
    for (const [slot, email] of Object.entries(config)) {
        if (!isValidSlot(slot)) {
            warnings.push(`unknown slot ignored: ${slot}`);
            continue;
        }
        if (!isValidEmail(email)) {
            errors.push(`${slot}: invalid email format`);
            continue;
        }
        if (isPersonalDomain(email)) {
            errors.push(`${slot}: personal domain forbidden (${getEmailDomain(email)})`);
        }
    }
    return { valid: errors.length === 0, errors, warnings };
}

// ──────────────────────────────────────────────────────────────────────
// Cache management (pure - handler persiste timestamp)
// ──────────────────────────────────────────────────────────────────────

/**
 * Verifica se cache está expirado.
 */
export function isCacheExpired(
    fetchedAt: number,
    now: number = Date.now(),
    ttlMs: number = CONFIG_CACHE_TTL_MS,
): boolean {
    if (!Number.isFinite(fetchedAt)) return true;
    return now - fetchedAt > ttlMs;
}

// ──────────────────────────────────────────────────────────────────────
// Hydration slot detection (§Q3 HTML static injection)
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida shape de hydration slot.
 */
export function isValidHydrationSlot(slot: { element?: any; slotName?: string }): boolean {
    if (!slot || typeof slot !== 'object') return false;
    if (!isValidSlot(slot.slotName || '')) return false;
    return true;
}

/**
 * Resolve all hydration slots com emails.
 */
export function resolveHydrationSlots(
    slots: Array<{ element?: any; slotName?: string }>,
    config: Record<string, string> = {},
): Array<{ element: any; slotName: string; email: string | null }> {
    if (!Array.isArray(slots)) return [];
    return slots
        .filter(isValidHydrationSlot)
        .map(
            (s): { element: any; slotName: string; email: string | null } => ({
                element: s.element,
                slotName: s.slotName as string,
                email: resolveContactEmail(s.slotName as string, config),
            }),
        )
        .filter((s) => s.email);
}
