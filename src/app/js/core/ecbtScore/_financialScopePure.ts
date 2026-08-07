// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT financial scope helpers.
 *
 * Portuguese context: o ECBT Score nao deve consumir CAPEX/OPEX da operacao
 * inteira sem recorte. Cada valor financeiro precisa declarar dominio e etapa
 * canonica para entrar no saldo ambiental/ocupacional.
 */

export const ECBT_FINANCIAL_DOMAINS = Object.freeze({
    ENVIRONMENTAL: 'environmental',
    OCCUPATIONAL_HEALTH: 'occupational_health',
    PROCESS_SAFETY: 'process_safety',
    CLIMATE: 'climate',
    WATER: 'water',
    WASTE: 'waste',
    BIODIVERSITY: 'biodiversity',
    GOVERNANCE_COMPLIANCE: 'governance_compliance',
    DATA_AI_GOVERNANCE: 'data_ai_governance',
    SOCIAL_COMMUNITY: 'social_community',
    HUMAN_RIGHTS: 'human_rights',
    SUPPLY_CHAIN_DUE_DILIGENCE: 'supply_chain_due_diligence',
    GENERAL_OPERATIONS: 'general_operations',
    UNKNOWN: 'unknown',
});

export const ECBT_CANONICAL_STAGES = Object.freeze({
    BASELINE_ASSESSMENT: 'baseline_assessment',
    MONITORING: 'monitoring',
    REMEDIATION: 'remediation',
    RISK_CONTROL: 'risk_control',
    COMPLIANCE_REPORTING: 'compliance_reporting',
    TRAINING_PREVENTION: 'training_prevention',
    INCIDENT_RESPONSE: 'incident_response',
    MAINTENANCE: 'maintenance',
    CLOSURE: 'closure',
    GENERAL_OPERATION: 'general_operation',
    UNKNOWN: 'unknown',
});

export const ECBT_COST_NATURES = Object.freeze({
    CAPEX: 'capex',
    OPEX: 'opex',
    FINE_PENALTY: 'fine_penalty',
    PROVISION_LIABILITY: 'provision_liability',
    AVOIDED_COST: 'avoided_cost',
    ASSET_VALUE: 'asset_value',
    UNKNOWN: 'unknown',
});

export type EcbtFinancialDomain =
    typeof ECBT_FINANCIAL_DOMAINS[keyof typeof ECBT_FINANCIAL_DOMAINS];

export type EcbtCanonicalStage =
    typeof ECBT_CANONICAL_STAGES[keyof typeof ECBT_CANONICAL_STAGES];

export type EcbtCostNature =
    typeof ECBT_COST_NATURES[keyof typeof ECBT_COST_NATURES];

export interface EcbtFinancialScopeTag {
    readonly domain: EcbtFinancialDomain | string;
    readonly canonicalStage: EcbtCanonicalStage | string;
    readonly costNature: EcbtCostNature | string;
    readonly attribution?: 'direct' | 'allocated' | 'shared' | 'general' | 'unknown' | string;
    readonly allocationBasis?: string;
    readonly confidence?: number;
    readonly source?: string;
}

export interface EcbtFinancialScopePolicy {
    readonly domains?: readonly string[];
    readonly canonicalStages?: readonly string[];
    readonly costNatures?: readonly string[];
    readonly includeUnscoped?: boolean;
    readonly includeGeneralOperations?: boolean;
    readonly requireAllocationBasisForShared?: boolean;
}

export const DEFAULT_ECBT_FINANCIAL_SCOPE: Required<EcbtFinancialScopePolicy> = Object.freeze({
    domains: Object.freeze([
        ECBT_FINANCIAL_DOMAINS.ENVIRONMENTAL,
        ECBT_FINANCIAL_DOMAINS.OCCUPATIONAL_HEALTH,
        ECBT_FINANCIAL_DOMAINS.PROCESS_SAFETY,
        ECBT_FINANCIAL_DOMAINS.CLIMATE,
        ECBT_FINANCIAL_DOMAINS.WATER,
        ECBT_FINANCIAL_DOMAINS.WASTE,
        ECBT_FINANCIAL_DOMAINS.BIODIVERSITY,
        ECBT_FINANCIAL_DOMAINS.GOVERNANCE_COMPLIANCE,
        ECBT_FINANCIAL_DOMAINS.DATA_AI_GOVERNANCE,
        ECBT_FINANCIAL_DOMAINS.SOCIAL_COMMUNITY,
        ECBT_FINANCIAL_DOMAINS.HUMAN_RIGHTS,
        ECBT_FINANCIAL_DOMAINS.SUPPLY_CHAIN_DUE_DILIGENCE,
    ]),
    canonicalStages: Object.freeze([
        ECBT_CANONICAL_STAGES.BASELINE_ASSESSMENT,
        ECBT_CANONICAL_STAGES.MONITORING,
        ECBT_CANONICAL_STAGES.REMEDIATION,
        ECBT_CANONICAL_STAGES.RISK_CONTROL,
        ECBT_CANONICAL_STAGES.COMPLIANCE_REPORTING,
        ECBT_CANONICAL_STAGES.TRAINING_PREVENTION,
        ECBT_CANONICAL_STAGES.INCIDENT_RESPONSE,
        ECBT_CANONICAL_STAGES.MAINTENANCE,
        ECBT_CANONICAL_STAGES.CLOSURE,
    ]),
    costNatures: Object.freeze([
        ECBT_COST_NATURES.CAPEX,
        ECBT_COST_NATURES.OPEX,
        ECBT_COST_NATURES.FINE_PENALTY,
        ECBT_COST_NATURES.PROVISION_LIABILITY,
        ECBT_COST_NATURES.AVOIDED_COST,
        ECBT_COST_NATURES.ASSET_VALUE,
    ]),
    includeUnscoped: false,
    includeGeneralOperations: false,
    requireAllocationBasisForShared: true,
});

function hasString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function asSet(values: readonly string[] | undefined, fallback: readonly string[]): Set<string> {
    return new Set(values && values.length > 0 ? values : fallback);
}

function policyWithDefaults(policy: EcbtFinancialScopePolicy = {}): Required<EcbtFinancialScopePolicy> {
    return {
        domains: policy.domains ?? DEFAULT_ECBT_FINANCIAL_SCOPE.domains,
        canonicalStages: policy.canonicalStages ?? DEFAULT_ECBT_FINANCIAL_SCOPE.canonicalStages,
        costNatures: policy.costNatures ?? DEFAULT_ECBT_FINANCIAL_SCOPE.costNatures,
        includeUnscoped: policy.includeUnscoped ?? DEFAULT_ECBT_FINANCIAL_SCOPE.includeUnscoped,
        includeGeneralOperations: policy.includeGeneralOperations ?? DEFAULT_ECBT_FINANCIAL_SCOPE.includeGeneralOperations,
        requireAllocationBasisForShared:
            policy.requireAllocationBasisForShared
            ?? DEFAULT_ECBT_FINANCIAL_SCOPE.requireAllocationBasisForShared,
    };
}

export function normalizeEcbtScopeTag(raw: unknown): EcbtFinancialScopeTag | null {
    if (!raw || typeof raw !== 'object') return null;
    const tag = raw as Partial<EcbtFinancialScopeTag>;
    if (!hasString(tag.domain) || !hasString(tag.canonicalStage) || !hasString(tag.costNature)) {
        return null;
    }
    return Object.freeze({
        domain: tag.domain.trim(),
        canonicalStage: tag.canonicalStage.trim(),
        costNature: tag.costNature.trim(),
        ...(hasString(tag.attribution) ? { attribution: tag.attribution.trim() } : {}),
        ...(hasString(tag.allocationBasis) ? { allocationBasis: tag.allocationBasis.trim() } : {}),
        ...(typeof tag.confidence === 'number' && Number.isFinite(tag.confidence)
            ? { confidence: Math.min(1, Math.max(0, tag.confidence)) }
            : {}),
        ...(hasString(tag.source) ? { source: tag.source.trim() } : {}),
    });
}

export function isEcbtScopeIncluded(
    raw: unknown,
    policy: EcbtFinancialScopePolicy = DEFAULT_ECBT_FINANCIAL_SCOPE,
): boolean {
    const p = policyWithDefaults(policy);
    const tag = normalizeEcbtScopeTag(raw);
    if (!tag) return p.includeUnscoped;
    if (!p.includeGeneralOperations && tag.domain === ECBT_FINANCIAL_DOMAINS.GENERAL_OPERATIONS) {
        return false;
    }
    if (!asSet(p.domains, DEFAULT_ECBT_FINANCIAL_SCOPE.domains).has(tag.domain)) return false;
    if (!asSet(p.canonicalStages, DEFAULT_ECBT_FINANCIAL_SCOPE.canonicalStages).has(tag.canonicalStage)) {
        return false;
    }
    if (!asSet(p.costNatures, DEFAULT_ECBT_FINANCIAL_SCOPE.costNatures).has(tag.costNature)) return false;
    if (p.requireAllocationBasisForShared && tag.attribution === 'shared' && !tag.allocationBasis) {
        return false;
    }
    return true;
}

export function filterEcbtScopedItems<T extends { readonly ecbtScope?: unknown }>(
    items: readonly T[],
    policy: EcbtFinancialScopePolicy = DEFAULT_ECBT_FINANCIAL_SCOPE,
): readonly T[] {
    const scoped = (Array.isArray(items) ? items : []).filter((item) =>
        isEcbtScopeIncluded(item?.ecbtScope, policy),
    );
    return Object.freeze(scoped);
}

export function filterEcbtScopedJournalEntries<T extends { readonly ecbtScope?: unknown }>(
    entries: readonly T[],
    policy: EcbtFinancialScopePolicy = DEFAULT_ECBT_FINANCIAL_SCOPE,
): readonly T[] {
    return filterEcbtScopedItems(entries, policy);
}

function stageForCost(costNature: string, itemId?: string): string {
    if (costNature === ECBT_COST_NATURES.CAPEX) {
        if (itemId === 'decommission') return ECBT_CANONICAL_STAGES.CLOSURE;
        return ECBT_CANONICAL_STAGES.BASELINE_ASSESSMENT;
    }
    if (itemId === 'maintenance') return ECBT_CANONICAL_STAGES.MAINTENANCE;
    if (itemId === 'reporting') return ECBT_CANONICAL_STAGES.COMPLIANCE_REPORTING;
    return ECBT_CANONICAL_STAGES.MONITORING;
}

function domainForCost(itemId?: string): string {
    const occupational = new Set([
        'noise_exposure',
        'frequency_rate',
        'severity_rate',
        'ltir',
        'near_miss',
    ]);
    return occupational.has(itemId ?? '')
        ? ECBT_FINANCIAL_DOMAINS.OCCUPATIONAL_HEALTH
        : ECBT_FINANCIAL_DOMAINS.ENVIRONMENTAL;
}

export function inferCostRollupScope(input: {
    readonly costNature: 'capex' | 'opex';
    readonly itemId?: string;
    readonly source?: string;
}): EcbtFinancialScopeTag {
    const tag = {
        domain: domainForCost(input.itemId),
        canonicalStage: stageForCost(input.costNature, input.itemId),
        costNature: input.costNature,
        attribution: 'direct',
        confidence: 1,
        source: input.source ?? 'cost_rollup',
    } satisfies EcbtFinancialScopeTag;
    return Object.freeze(tag);
}
