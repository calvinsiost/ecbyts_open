// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * evidence.ts — Phase 2 TS source for uncertainty evidence payload builder.
 */

export interface UncertaintyLastResults {
    policy?: { source?: string } | null;
    q2q?: unknown;
    decision?: unknown;
    optimization?: unknown;
}

export interface UncertaintyPolicyDraft {
    policy_id?: string;
    [key: string]: unknown;
}

export interface UncertaintyEvidenceState {
    lastResults?: UncertaintyLastResults;
    policyDraft?: UncertaintyPolicyDraft;
    q2qInput?: unknown;
}

export interface UncertaintyEvidenceOptions {
    method?: string;
    nd_method?: string;
    policy_version?: string;
}

export interface UncertaintyEvidencePayload {
    evidence_id?: unknown;
    method?: unknown;
    policy_id?: unknown;
    policy_version?: unknown;
    inputs_hash?: unknown;
    outputs?: unknown;
    generated_at?: unknown;
    [key: string]: unknown;
}

function _cheapHash(input: unknown): string {
    const s = String(input || '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return `fnv1a:${(h >>> 0).toString(16)}`;
}

export function buildUncertaintyEvidence(
    state: UncertaintyEvidenceState = {},
    opts: UncertaintyEvidenceOptions = {},
): UncertaintyEvidencePayload {
    const lastResults = state?.lastResults || {};
    const payload: UncertaintyEvidencePayload = {
        evidence_id: `unc-ev-${Date.now()}`,
        method: opts.method || 'GUM+TypeB',
        nd_method: opts.nd_method || 'auto',
        policy_id: state?.policyDraft?.policy_id || 'draft-policy',
        policy_version: opts.policy_version || '1.0.0',
        inputs_hash: _cheapHash(JSON.stringify({ policyDraft: state?.policyDraft, q2qInput: state?.q2qInput })),
        outputs: {
            policy_source: lastResults?.policy?.source || null,
            q2q: lastResults?.q2q || null,
            decision: lastResults?.decision || null,
            optimization: lastResults?.optimization || null,
        },
        references: ['NIST TN 1297', 'JCGM 100', 'EPA 2009', 'ITRC GSMC'],
        generated_at: new Date().toISOString(),
    };
    return payload;
}

export interface EvidenceValidationResult {
    ok: boolean;
    reason?: string;
}

export function validateUncertaintyEvidence(
    evidence: UncertaintyEvidencePayload | null | undefined,
): EvidenceValidationResult {
    if (!evidence || typeof evidence !== 'object') return { ok: false, reason: 'invalid_payload' };
    const required = ['evidence_id', 'method', 'policy_id', 'policy_version', 'inputs_hash', 'outputs', 'generated_at'];
    for (const k of required) {
        if (!(k in evidence)) return { ok: false, reason: `missing_${k}` };
    }
    return { ok: true };
}
