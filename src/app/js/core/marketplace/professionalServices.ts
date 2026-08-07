// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PROFESSIONAL SERVICES MARKETPLACE — SPEC_PROFESSIONAL_SERVICES_MARKETPLACE

   Pure helpers para contratação de profissionais:
   - Seniority tiers (junior/pleno/senior) §Q2
   - Payment models (hourly/fixed scope) §Q3
   - Time tracking validation
   - Rate calculations + platform fee

   UI + payments (Stripe/MP) em handler.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Seniority tiers §Q2
// ──────────────────────────────────────────────────────────────────────

export const SENIORITY_TIERS = Object.freeze({
    JUNIOR: {
        id: 'junior',
        label: 'Junior',
        minYearsExperience: 0,
        typicalRateBRL: 75,
        minRateBRL: 40,
        maxRateBRL: 120,
    },
    PLENO: {
        id: 'pleno',
        label: 'Pleno',
        minYearsExperience: 3,
        typicalRateBRL: 150,
        minRateBRL: 100,
        maxRateBRL: 220,
    },
    SENIOR: {
        id: 'senior',
        label: 'Senior',
        minYearsExperience: 7,
        typicalRateBRL: 300,
        minRateBRL: 200,
        maxRateBRL: 500,
    },
});

export const TIER_IDS = Object.freeze(Object.values(SENIORITY_TIERS).map((t) => t.id));

// Payment models §Q3
export const PAYMENT_MODELS = Object.freeze(['hourly', 'fixed_scope']);

// Contract statuses
export const CONTRACT_STATUSES = Object.freeze([
    'draft',
    'proposed',
    'accepted',
    'in_progress',
    'delivered',
    'approved',
    'completed',
    'cancelled',
    'disputed',
]);

export const PLATFORM_FEE_PCT = 0.1; // 10% §marketplace convention

// ──────────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────────

export function isValidTier(tierId: string): boolean {
    return typeof tierId === 'string' && TIER_IDS.includes(tierId);
}

/**
 * Retorna config do tier.
 */
export function getTier(tierId: string): Record<string, any> | null {
    for (const tier of Object.values(SENIORITY_TIERS)) {
        if (tier.id === tierId) return tier;
    }
    return null;
}

/**
 * Valida hourly rate para um tier.
 * @param tierId - BRL/hora
 */
export function validateHourlyRate(tierId: string, rate: number): Record<string, any> {
    const tier = getTier(tierId) as any;
    if (!tier) return { valid: false, reason: 'invalid_tier' } as any;
    if (!Number.isFinite(rate)) return { valid: false, reason: 'rate_not_number' } as any;
    if (rate < tier.minRateBRL) return { valid: false, reason: 'below_min' } as any;
    if (rate > tier.maxRateBRL) return { valid: false, reason: 'above_max' } as any;
    return { valid: true, reason: 'ok' } as any;
}

/**
 * Valida profissional perfil.
 */
export function validateProfessional(professional: Record<string, any>): Record<string, any> {
    const errors: string[] = [];
    if (!professional || typeof professional !== 'object') {
        return { valid: false, errors: ['not object'] } as any;
    }
    if (!professional.userId) errors.push('userId required');
    if (!isValidTier(professional.tier)) errors.push(`tier must be one of: ${TIER_IDS.join(', ')}`);
    if (!Number.isFinite(professional.hourlyRateBRL) || professional.hourlyRateBRL <= 0) {
        errors.push('hourlyRateBRL required, positive');
    }
    if (!Array.isArray(professional.skills)) errors.push('skills must be array');
    if (!Number.isFinite(professional.yearsExperience) || professional.yearsExperience < 0) {
        errors.push('yearsExperience required, ≥0');
    }
    // Cross-validation: tier deve match yearsExperience
    const tier = getTier(professional.tier) as any;
    if (tier && professional.yearsExperience < tier.minYearsExperience) {
        errors.push(`tier ${professional.tier} requires >= ${tier.minYearsExperience} years`);
    }
    return { valid: errors.length === 0, errors } as any;
}

// ──────────────────────────────────────────────────────────────────────
// Contract validation
// ──────────────────────────────────────────────────────────────────────

export function validateContract(contract: Record<string, any>): Record<string, any> {
    const errors: string[] = [];
    if (!contract || typeof contract !== 'object') return { valid: false, errors: ['not object'] } as any;
    if (!contract.id) errors.push('id required');
    if (!contract.clientId) errors.push('clientId required');
    if (!contract.professionalId) errors.push('professionalId required');
    if (!CONTRACT_STATUSES.includes(contract.status)) {
        errors.push(`status must be one of: ${CONTRACT_STATUSES.join(', ')}`);
    }
    if (!PAYMENT_MODELS.includes(contract.paymentModel)) {
        errors.push(`paymentModel must be one of: ${PAYMENT_MODELS.join(', ')}`);
    }
    if (contract.paymentModel === 'hourly') {
        if (!Number.isFinite(contract.hourlyRateBRL) || contract.hourlyRateBRL <= 0) {
            errors.push('hourlyRateBRL required for hourly model');
        }
    }
    if (contract.paymentModel === 'fixed_scope') {
        if (!Number.isFinite(contract.fixedAmountBRL) || contract.fixedAmountBRL <= 0) {
            errors.push('fixedAmountBRL required for fixed_scope model');
        }
    }
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Pricing calculations
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa amount total + fee + professional receive.
 *
 * @param workLog - { hoursWorked, completedAt }
 */
export function computeContractAmount(
    contract: Record<string, any>,
    workLog: Record<string, any> = {},
): {
    gross: number;
    platformFee: number;
    professionalReceives: number;
    breakdown: Record<string, any>;
} {
    if (!validateContract(contract).valid) {
        return { gross: 0, platformFee: 0, professionalReceives: 0, breakdown: {} };
    }

    let gross = 0;
    let breakdown: Record<string, any> = {};
    if (contract.paymentModel === 'hourly') {
        const hours = Number(workLog.hoursWorked) || 0;
        const rate = Number(contract.hourlyRateBRL);
        gross = hours * rate;
        breakdown = { hours, rate, type: 'hourly' };
    } else if (contract.paymentModel === 'fixed_scope') {
        gross = Number(contract.fixedAmountBRL) || 0;
        breakdown = { amount: gross, type: 'fixed' };
    }

    const platformFee = gross * PLATFORM_FEE_PCT;
    const professionalReceives = gross - platformFee;
    return { gross, platformFee, professionalReceives, breakdown };
}

// ──────────────────────────────────────────────────────────────────────
// Status transitions
// ──────────────────────────────────────────────────────────────────────

const STATUS_TRANSITIONS = Object.freeze({
    draft: ['proposed', 'cancelled'],
    proposed: ['accepted', 'cancelled'],
    accepted: ['in_progress', 'cancelled'],
    in_progress: ['delivered', 'disputed', 'cancelled'],
    delivered: ['approved', 'disputed'],
    approved: ['completed'],
    completed: [], // terminal
    cancelled: [], // terminal
    disputed: ['in_progress', 'cancelled'], // dispute resolution
});

export function canTransitionStatus(from: string, to: string): { allowed: boolean; reason: string } {
    if (!CONTRACT_STATUSES.includes(from)) return { allowed: false, reason: 'invalid_from' };
    if (!CONTRACT_STATUSES.includes(to)) return { allowed: false, reason: 'invalid_to' };
    if (from === to) return { allowed: false, reason: 'no_op' };
    const allowed = (STATUS_TRANSITIONS as Record<string, string[]>)[from] || [];
    if (!allowed.includes(to)) {
        return { allowed: false, reason: `transition not allowed: ${from} → ${to}` };
    }
    return { allowed: true, reason: 'ok' };
}

// ──────────────────────────────────────────────────────────────────────
// Time tracking (hourly model)
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida entry de time tracking.
 * @param entry - { contractId, startedAt, endedAt, description }
 */
export function isValidTimeEntry(entry: Record<string, any>): boolean {
    if (!entry || typeof entry !== 'object') return false;
    if (!entry.contractId) return false;
    const start = new Date(entry.startedAt).getTime();
    const end = new Date(entry.endedAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    if (end <= start) return false;
    return true;
}

/**
 * Soma horas total de time entries.
 * @returns horas (decimal)
 */
export function sumTimeEntriesHours(entries: Array<Record<string, any>>): number {
    if (!Array.isArray(entries)) return 0;
    let totalMs = 0;
    for (const entry of entries) {
        if (!isValidTimeEntry(entry)) continue;
        const e = entry as any;
        const start = new Date(e.startedAt).getTime();
        const end = new Date(e.endedAt).getTime();
        totalMs += end - start;
    }
    return totalMs / (1000 * 60 * 60);
}
