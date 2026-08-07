// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RETENTION POLICY — Pure logic for SPEC_READINGS_METADATA_RETENTION (F2 partial)

   Front-first development (AGENTS.md § UX-First Development):
   - F5 (UI badge + modal) lands FIRST com mock backend (este helper)
   - F1 (schema migration) + F3 (pg_cron) seguem em waves separadas

   Pure: zero state, zero DOM, zero rede. Defensive: nunca throw.
   ================================================================ */

export type RetentionCategory =
    | 'phase1_desk_review'
    | 'phase2_confirmatory'
    | 'phase3_monitoring'
    | 'occupational_health'
    | 'one_off_qa_qc'
    | 'other';

export interface RetentionPolicy {
    category: RetentionCategory;
    ttl_days: number;
    expires_at: string;
    locked: boolean;
    lock_reason?: string;
    set_by?: string;
    set_at?: string;
}

/**
 * TTL defaults por categoria (dias). Baseado em:
 * - phase2/phase3: RCRA TEGD + CERCLA post-closure (~30 anos)
 * - occupational_health: US-OSHA 29 CFR 1910.1020 (30 anos medical records)
 * - phase1: 10 anos (desk review sem ligação confirmada a contaminação)
 * - one_off_qa_qc: 5 anos (operacional, não probatório)
 * - other: 10 anos (default conservador, sem ligação)
 */
export const TTL_DEFAULTS_DAYS: Readonly<Record<RetentionCategory, number>> = Object.freeze({
    phase1_desk_review: 3650,
    phase2_confirmatory: 10950,
    phase3_monitoring: 10950,
    occupational_health: 10950,
    one_off_qa_qc: 1825,
    other: 3650,
});

/**
 * Compute ISO timestamp de quando o registro expira.
 *
 * @param category - categoria de retenção
 * @param setAtIso - ISO string do momento do set
 * @param ttlOverrideDays? - opcional, sobrescreve TTL_DEFAULTS_DAYS
 * @returns ISO string (ou null se inputs inválidos)
 */
export function computeExpiresAt(
    category: RetentionCategory,
    setAtIso: string,
    ttlOverrideDays?: number
): string | null {
    const ttlDays = typeof ttlOverrideDays === 'number' && ttlOverrideDays > 0
        ? ttlOverrideDays
        : TTL_DEFAULTS_DAYS[category];
    if (typeof ttlDays !== 'number') return null;
    const setAt = new Date(setAtIso);
    if (Number.isNaN(setAt.getTime())) return null;
    const expires = new Date(setAt.getTime() + ttlDays * 24 * 60 * 60 * 1000);
    return expires.toISOString();
}

/**
 * Check se o registro está near-expiry (default <30 dias).
 *
 * @param policy - retention_policy do registro
 * @param nowIso - ISO atual (injetável para teste)
 * @param thresholdDays - dias de threshold (default 30)
 * @returns true se expirado ou faltam <thresholdDays
 */
export function isNearExpiry(
    policy: RetentionPolicy | null | undefined,
    nowIso: string,
    thresholdDays: number = 30
): boolean {
    if (!policy || !policy.expires_at) return false;
    if (policy.locked) return false;
    const expires = new Date(policy.expires_at);
    const now = new Date(nowIso);
    if (Number.isNaN(expires.getTime()) || Number.isNaN(now.getTime())) return false;
    const diffMs = expires.getTime() - now.getTime();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    return diffDays <= thresholdDays;
}

/**
 * Days remaining until expiry (negative if already expired).
 */
export function daysUntilExpiry(
    policy: RetentionPolicy | null | undefined,
    nowIso: string
): number | null {
    if (!policy || !policy.expires_at) return null;
    const expires = new Date(policy.expires_at);
    const now = new Date(nowIso);
    if (Number.isNaN(expires.getTime()) || Number.isNaN(now.getTime())) return null;
    const diffMs = expires.getTime() - now.getTime();
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

/**
 * Validate retention policy schema (defensive).
 *
 * @returns {valid, errors[]} — never throws
 */
export function validateRetentionPolicy(policy: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!policy || typeof policy !== 'object') {
        return { valid: false, errors: ['policy must be object'] };
    }
    const p = policy as Record<string, any>;
    if (!(p.category in TTL_DEFAULTS_DAYS)) {
        errors.push(`category must be one of: ${Object.keys(TTL_DEFAULTS_DAYS).join(', ')}`);
    }
    if (typeof p.ttl_days !== 'number' || p.ttl_days <= 0 || p.ttl_days > 36500) {
        errors.push('ttl_days must be positive number ≤ 36500 (100 years)');
    }
    if (typeof p.expires_at !== 'string' || Number.isNaN(new Date(p.expires_at).getTime())) {
        errors.push('expires_at must be valid ISO string');
    }
    if (typeof p.locked !== 'boolean') {
        errors.push('locked must be boolean');
    }
    return { valid: errors.length === 0, errors };
}

/**
 * Create default policy for a new observation (uses category default TTL).
 */
export function createDefaultPolicy(
    category: RetentionCategory,
    setAtIso: string,
    setBy: string = 'system'
): RetentionPolicy {
    const ttl = TTL_DEFAULTS_DAYS[category];
    const expires = computeExpiresAt(category, setAtIso, ttl);
    return {
        category,
        ttl_days: ttl,
        expires_at: expires || setAtIso,
        locked: false,
        set_by: setBy,
        set_at: setAtIso,
    };
}

/**
 * Demo/mock fixture: produce a sample policy for UI testing without backend.
 * Used by retentionExtendModal handleShowRetentionDemo during front-first phase.
 */
export function createDemoPolicy(daysUntilExpiry: number): RetentionPolicy {
    const now = new Date();
    const expires = new Date(now.getTime() + daysUntilExpiry * 24 * 60 * 60 * 1000);
    return {
        category: 'phase2_confirmatory',
        ttl_days: 10950,
        expires_at: expires.toISOString(),
        locked: false,
        set_by: 'demo-fixture',
        set_at: now.toISOString(),
    };
}
