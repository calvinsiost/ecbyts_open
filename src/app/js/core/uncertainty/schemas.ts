// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/*
 * Uncertainty - unified schemas v3 (UNC-001 Phase 2 slice 1)
 *
 * Motivação (Gemini review 2026-04-17 12:50):
 * - SPEC_UNCERTAINTY_PROPAGATION define evidence v1
 * - SPEC_UNCERTAINTY_HUB_002_TIER2_MC estende para v2 (Monte Carlo)
 * - SPEC_QUALITATIVE_TO_QUANTITATIVE_UNCERTAINTY adiciona Q2Q
 * - Sem contrato unificado → risco drift v1 vs v2 + policy sem validador central
 *
 * v3 consolida: Q2Q qualitative overrides + Tier-1 GUM/TypeB + Tier-2 Monte Carlo
 * nativos, sem precisar migração entre variantes.
 */

export const UNCERTAINTY_EVIDENCE_SCHEMA_V3 = Object.freeze({
    version: 'v3',
    required: [
        'schema_version',
        'evidence_id',
        'method',
        'method_tier',
        'policy_id',
        'policy_version',
        'inputs_hash',
        'outputs',
        'generated_at',
    ],
    optional: [
        'mapping_version',
        'q2q_inputs',
        'mc_config',
        'nd_method',
        'matrix',
        'references',
        'supabase_policy_source',
    ],
    fields: {
        schema_version: { type: 'string', enum: ['v3'] },
        evidence_id: { type: 'string', pattern: /^unc-ev-/ },
        method: { type: 'string', enum: ['GUM+TypeB', 'Q2Q', 'MonteCarlo', 'LHS', 'Composite'] },
        method_tier: { type: 'string', enum: ['tier-1', 'tier-2', 'tier-q2q'] },
        policy_id: { type: 'string' },
        policy_version: { type: 'string' },
        mapping_version: { type: 'string' },
        inputs_hash: { type: 'string', pattern: /^fnv1a:[0-9a-f]+$/ },
        outputs: { type: 'object' },
        q2q_inputs: { type: 'object' },
        mc_config: { type: 'object' },
        nd_method: { type: 'string' },
        matrix: { type: 'string', enum: ['groundwater', 'soil', 'surface_water', 'sediment', 'air', 'tissue'] },
        references: { type: 'array' },
        supabase_policy_source: { type: 'object' },
        generated_at: { type: 'string', format: 'iso-8601' },
    },
} as const);

export const UNCERTAINTY_POLICY_SCHEMA_V3 = Object.freeze({
    version: 'v3',
    required: ['schema_version', 'policy_id', 'policy_version', 'mapping_version', 'matrix', 'tier', 'variables'],
    optional: ['q2q_overrides', 'mc_variables', 'nd_method', 'source', 'generated_at', 'supabase_source'],
    fields: {
        schema_version: { type: 'string', enum: ['v3'] },
        policy_id: { type: 'string' },
        policy_version: { type: 'string' },
        mapping_version: { type: 'string' },
        matrix: { type: 'string', enum: ['groundwater', 'soil', 'surface_water', 'sediment', 'air', 'tissue'] },
        tier: { type: 'string', enum: ['tier-1', 'tier-2', 'tier-q2q'] },
        variables: { type: 'object' },
        q2q_overrides: { type: 'object' },
        mc_variables: { type: 'array' },
        nd_method: { type: 'string', enum: ['substitute_0.5LOD', 'substitute_LOD', 'kaplan-meier', 'ros', 'auto'] },
        source: { type: 'string' },
        supabase_source: { type: 'object' },
        generated_at: { type: 'string', format: 'iso-8601' },
    },
} as const);

export interface SchemaFieldRule {
    type?: string;
    enum?: readonly unknown[];
    pattern?: RegExp;
    format?: string;
}

export interface CanonicalSchema {
    version: string;
    required: readonly string[];
    optional: readonly string[];
    fields: Record<string, SchemaFieldRule>;
}

export interface ValidationResult {
    ok: boolean;
    reason?: string;
}

function _matchesType(value: unknown, expected: string): boolean {
    if (expected === 'string') return typeof value === 'string';
    if (expected === 'array') return Array.isArray(value);
    if (expected === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
    if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
    return false;
}

function _validateAgainstSchema(obj: unknown, schema: CanonicalSchema): ValidationResult {
    if (!obj || typeof obj !== 'object') return { ok: false, reason: 'invalid_payload' };
    const record = obj as Record<string, unknown>;
    for (const key of schema.required) {
        if (!(key in record)) return { ok: false, reason: `missing_${key}` };
    }
    for (const [key, rule] of Object.entries(schema.fields)) {
        if (!(key in record)) continue;
        const value = record[key];
        if (rule.type && !_matchesType(value, rule.type)) {
            return { ok: false, reason: `invalid_type_${key}_expected_${rule.type}` };
        }
        if (rule.enum && !rule.enum.includes(value)) {
            return { ok: false, reason: `invalid_enum_${key}_value_${String(value)}` };
        }
        if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
            return { ok: false, reason: `invalid_pattern_${key}` };
        }
    }
    return { ok: true };
}

export function validateEvidenceV3(evidence: unknown): ValidationResult {
    return _validateAgainstSchema(evidence, UNCERTAINTY_EVIDENCE_SCHEMA_V3 as unknown as CanonicalSchema);
}

export function validatePolicyV3(policy: unknown): ValidationResult {
    return _validateAgainstSchema(policy, UNCERTAINTY_POLICY_SCHEMA_V3 as unknown as CanonicalSchema);
}

export function migrateEvidenceToV3(evidence: unknown): unknown {
    if (!evidence || typeof evidence !== 'object') return evidence;
    const ev = evidence as Record<string, unknown>;
    if (ev.schema_version === 'v3') return evidence;

    const method = ev.method || 'GUM+TypeB';
    let method_tier = 'tier-1';
    if (method === 'MonteCarlo' || method === 'LHS') method_tier = 'tier-2';
    if (method === 'Q2Q') method_tier = 'tier-q2q';

    return {
        ...ev,
        schema_version: 'v3',
        method_tier,
        matrix: ev.matrix || 'groundwater',
    };
}

export function migratePolicyToV3(policy: unknown): unknown {
    if (!policy || typeof policy !== 'object') return policy;
    const pol = policy as Record<string, unknown>;
    if (pol.schema_version === 'v3') return policy;

    const hasMC = Array.isArray(pol.mc_variables) && pol.mc_variables.length > 0;
    const hasQ2Q = pol.q2q_overrides && typeof pol.q2q_overrides === 'object';
    let tier = 'tier-1';
    if (hasMC) tier = 'tier-2';
    else if (hasQ2Q) tier = 'tier-q2q';

    return {
        ...pol,
        schema_version: 'v3',
        mapping_version: pol.mapping_version || pol.policy_version || '1.0.0',
        matrix: pol.matrix || 'groundwater',
        tier,
        variables: pol.variables || {},
    };
}