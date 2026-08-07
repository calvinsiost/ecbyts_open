// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   FREEMIUM QUOTA TIERS — SPEC_FREEMIUM (§3)

   Pure helpers para tiers por volume (agent-first). Unidade de
   monetização = volume, não feature (§1 premissa).

   Tiers: Free (0) / Pro (1) / Enterprise (2) / Custom (3).
   Métricas: observations, eco1_calls, eis_validations, llm_tokens,
   mcp_tool_calls, saved_models, active_elements.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Metric types §2.1
// ──────────────────────────────────────────────────────────────────────

export const METRIC_TYPES = Object.freeze([
    'observations',
    'eco1_calls',
    'eis_validations',
    'llm_tokens',
    'mcp_tool_calls',
    'saved_models',
    'active_elements',
]);

export const TIERS = Object.freeze(['free', 'pro', 'enterprise', 'custom']);

// Tier → quotas mensais §3
export const TIER_QUOTAS = Object.freeze({
    free: {
        observations: 10_000,
        eco1_calls: 200,
        eis_validations: 20,
        llm_tokens: null, // ilimitado via própria key
        mcp_tool_calls: 500,
        saved_models: 3,
        active_elements: 500,
    },
    pro: {
        observations: 500_000,
        eco1_calls: 10_000,
        eis_validations: 1_000,
        llm_tokens: 500_000,
        mcp_tool_calls: 20_000,
        saved_models: Infinity,
        active_elements: 50_000,
    },
    enterprise: {
        observations: Infinity,
        eco1_calls: Infinity,
        eis_validations: Infinity,
        llm_tokens: Infinity,
        mcp_tool_calls: Infinity,
        saved_models: Infinity,
        active_elements: Infinity,
    },
    custom: {
        // Per-contract - deve ser resolvido via resolveCustomQuota()
        observations: null,
        eco1_calls: null,
        eis_validations: null,
        llm_tokens: null,
        mcp_tool_calls: null,
        saved_models: null,
        active_elements: null,
    },
});

// Feature restrictions (§Tier 0 free sem Data Owner, watermark)
export const TIER_FEATURES = Object.freeze({
    free: Object.freeze({
        ecbt_blockchain: false, // ECBT simple only
        data_owner: false,
        api_key: false,
        webhook: false,
        report_watermark: true,
    }),
    pro: Object.freeze({
        ecbt_blockchain: true,
        data_owner: true,
        api_key: true,
        webhook: true,
        report_watermark: false,
    }),
    enterprise: Object.freeze({
        ecbt_blockchain: true,
        data_owner: true,
        api_key: true,
        webhook: true,
        report_watermark: false,
        sla: true,
        white_label: true,
    }),
});

// ──────────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────────

export function isValidTier(tier: string): boolean {
    return typeof tier === 'string' && TIERS.includes(tier);
}

export function isValidMetric(metric: string): boolean {
    return typeof metric === 'string' && METRIC_TYPES.includes(metric);
}

// ──────────────────────────────────────────────────────────────────────
// Quota lookups
// ──────────────────────────────────────────────────────────────────────

/**
 * Retorna quota para um par (tier, metric).
 *
 * @returns number|null - null se custom + não resolvido, Infinity se ilimitado
 */
export function getQuota(tier: string, metric: string): number | null {
    if (!isValidTier(tier) || !isValidMetric(metric)) return null;
    const tierQuotas = TIER_QUOTAS as Record<string, Record<string, any>>;
    const tierMap = tierQuotas[tier];
    if (!tierMap) return null;
    const value = tierMap[metric];
    return value ?? null;
}

/**
 * Retorna features disponíveis para tier.
 */
export function getFeaturesForTier(tier: string): Record<string, any> {
    const tierFeatures = TIER_FEATURES as Record<string, Record<string, any>>;
    return tierFeatures[tier] || (tierFeatures.free as Record<string, any>);
}

/**
 * Verifica se feature está disponível no tier.
 */
export function isFeatureEnabled(tier: string, feature: string): boolean {
    const features = getFeaturesForTier(tier) as Record<string, any>;
    return features[feature] === true;
}

// ──────────────────────────────────────────────────────────────────────
// Usage tracking
// ──────────────────────────────────────────────────────────────────────

/**
 * Verifica se operação é permitida dado usage atual.
 */
export function checkQuota(
    params: { tier: string; metric: string; currentUsage: number; increment?: number },
    _opts: Record<string, any> = {},
): {
    allowed: boolean;
    remaining: number | null;
    quota: number | null;
    usagePercent: number | null;
    reason: string;
} {
    const { tier, metric, currentUsage, increment = 1 } = params || ({} as any);
    const quota = getQuota(tier, metric);

    if (quota == null) {
        return { allowed: false, remaining: null, quota: null, usagePercent: null, reason: 'unknown_quota' };
    }
    if (quota === Infinity) {
        return { allowed: true, remaining: Infinity, quota: Infinity, usagePercent: 0, reason: 'unlimited' };
    }

    const current = Number(currentUsage) || 0;
    const inc = Number(increment) || 0;
    const projected = current + inc;
    const remaining = quota - current;
    const usagePercent = quota > 0 ? (current / quota) * 100 : 0;

    if (projected > quota) {
        return { allowed: false, remaining, quota, usagePercent, reason: 'over_quota' };
    }
    return { allowed: true, remaining, quota, usagePercent, reason: 'under_quota' };
}

/**
 * Classifica estado de uso para UI (warn badges).
 */
export function classifyUsageState(usagePercent: number): 'ok' | 'approaching' | 'critical' | 'exceeded' {
    if (!Number.isFinite(usagePercent)) return 'ok';
    if (usagePercent >= 100) return 'exceeded';
    if (usagePercent >= 90) return 'critical';
    if (usagePercent >= 75) return 'approaching';
    return 'ok';
}

/**
 * Dashboard summary - todas métricas para um tier/usage.
 */
export function computeUsageSummary(
    tier: string,
    usage: Record<string, any> = {},
): Record<string, { quota: any; used: any; remaining: any; percent: any; state: any }> {
    const out: Record<string, { quota: any; used: any; remaining: any; percent: any; state: any }> = {};
    const usageMap = usage as Record<string, any>;
    for (const metric of METRIC_TYPES) {
        const quota = getQuota(tier, metric);
        const used = Number(usageMap[metric]) || 0;
        if (quota == null) {
            out[metric] = { quota: null, used, remaining: null, percent: null, state: 'unknown' };
            continue;
        }
        if (quota === Infinity) {
            out[metric] = { quota: Infinity, used, remaining: Infinity, percent: 0, state: 'ok' };
            continue;
        }
        const remaining = Math.max(0, quota - used);
        const percent = quota > 0 ? (used / quota) * 100 : 0;
        out[metric] = {
            quota,
            used,
            remaining,
            percent,
            state: classifyUsageState(percent),
        };
    }
    return out;
}

// ──────────────────────────────────────────────────────────────────────
// Upgrade suggestions
// ──────────────────────────────────────────────────────────────────────

const TIER_ORDER = Object.freeze(['free', 'pro', 'enterprise']);

/**
 * Sugere upgrade se current tier está no limite.
 */
export function suggestUpgrade(
    currentTier: string,
    usage: Record<string, any> = {},
): { shouldUpgrade: boolean; suggestedTier: string | null; reason: string } {
    const currentIdx = TIER_ORDER.indexOf(currentTier);
    if (currentIdx < 0 || currentIdx === TIER_ORDER.length - 1) {
        return { shouldUpgrade: false, suggestedTier: null, reason: 'no_upgrade_available' };
    }
    const summary = computeUsageSummary(currentTier, usage);
    for (const metric of METRIC_TYPES) {
        const entry = summary[metric];
        if (entry?.state === 'critical' || entry?.state === 'exceeded') {
            return {
                shouldUpgrade: true,
                suggestedTier: TIER_ORDER[currentIdx + 1] ?? null,
                reason: `${metric}_${entry.state}`,
            };
        }
    }
    return { shouldUpgrade: false, suggestedTier: null, reason: 'usage_ok' };
}
