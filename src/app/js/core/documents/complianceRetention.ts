// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Retention - Phase 10 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S13
 *
 * Phase 10 (2026-05-01) - pure-logic engine de retention policies.
 * Define quanto tempo cada categoria de documento deve ser preservada
 * antes de archiving/disposal, baseado em regulatórios.
 *
 * Estratégia:
 *   - Retention catalog frozen (CONAMA archive 5y, LGPD 5y, ISSB 7y, etc)
 *   - Engine puro: doc + policy → action ('keep' | 'archive' | 'dispose')
 *   - Schedule: nextReviewDate, archiveAfter, disposeAfter
 *   - Categorias: regulatory / contract / operational / personal_data
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Categorias canônicas de retenção. */
export const RETENTION_CATEGORIES = Object.freeze([
    'regulatory',
    'contract',
    'operational',
    'personal_data',
    'financial',
    'audit',
]);

/** Ações de retenção. */
export const RETENTION_ACTIONS = Object.freeze(['keep', 'review', 'archive', 'dispose', 'anonymize']);

/** Built-in policies (anos de retenção por categoria). */
export const BUILTIN_POLICIES = Object.freeze({
    regulatory: Object.freeze({
        category: 'regulatory',
        retentionYears: 5, // CONAMA archive
        archiveAfterYears: 2,
        disposeAfterYears: null, // never dispose without manual review
        legalBasis: 'CONAMA 420/2009',
        description: 'Documentos regulatórios CONAMA/CETESB',
    }),
    contract: Object.freeze({
        category: 'contract',
        retentionYears: 10, // Civil Code BR
        archiveAfterYears: 3,
        disposeAfterYears: 10,
        legalBasis: 'CC art. 205',
        description: 'Contratos civis (10 anos)',
    }),
    operational: Object.freeze({
        category: 'operational',
        retentionYears: 3,
        archiveAfterYears: 1,
        disposeAfterYears: 3,
        legalBasis: 'Best practice',
        description: 'Operação corrente (3 anos)',
    }),
    personal_data: Object.freeze({
        category: 'personal_data',
        retentionYears: 5, // LGPD principle
        archiveAfterYears: 1,
        disposeAfterYears: 5,
        anonymizeAfterYears: 1,
        legalBasis: 'LGPD art. 16',
        description: 'Dados pessoais com finalidade cumprida',
    }),
    financial: Object.freeze({
        category: 'financial',
        retentionYears: 7, // ISSB / IFRS
        archiveAfterYears: 5,
        disposeAfterYears: 7,
        legalBasis: 'ISSB S1/S2',
        description: 'Demonstrações financeiras ESG',
    }),
    audit: Object.freeze({
        category: 'audit',
        retentionYears: 10,
        archiveAfterYears: null, // never archive — always keep accessible
        disposeAfterYears: null, // never dispose
        legalBasis: 'Audit trail integrity',
        description: 'Audit logs (append-only, never disposed)',
    }),
});

/** Identidade do módulo. */
export const RETENTION_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 10,
    deliveredAt: '2026-05-01',
    categories: RETENTION_CATEGORIES,
    actions: RETENTION_ACTIONS,
    policiesCount: Object.keys(BUILTIN_POLICIES).length,
});

/**
 * Verifica se categoria é canônica.
 */
export function isValidCategory(category: any): boolean {
    return typeof category === 'string' && RETENTION_CATEGORIES.includes(category);
}

/**
 * Verifica se ação é canônica.
 */
export function isValidAction(action: any): boolean {
    return typeof action === 'string' && RETENTION_ACTIONS.includes(action);
}

/**
 * Cria policy customizada frozen.
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createPolicy(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createPolicy: spec required');
    }
    if (!isValidCategory(spec.category)) {
        throw new TypeError(`createPolicy: category must be one of ${RETENTION_CATEGORIES.join(',')}`);
    }
    if (!Number.isFinite(spec.retentionYears) || spec.retentionYears < 0) {
        throw new TypeError('createPolicy: retentionYears must be non-negative number');
    }
    return Object.freeze({
        category: spec.category,
        retentionYears: spec.retentionYears,
        archiveAfterYears: Number.isFinite(spec.archiveAfterYears) ? spec.archiveAfterYears : null,
        disposeAfterYears: Number.isFinite(spec.disposeAfterYears) ? spec.disposeAfterYears : null,
        anonymizeAfterYears: Number.isFinite(spec.anonymizeAfterYears) ? spec.anonymizeAfterYears : null,
        legalBasis: spec.legalBasis || '',
        description: spec.description || '',
    });
}

/**
 * Resolve policy para categoria.
 *
 * @param {string} category
 * @returns {Object|null}
 */
export function resolvePolicy(category: string): object | null {
    const policies = BUILTIN_POLICIES as Record<string, any>;
    return (policies[category] || null) as Record<string, any>;
}

/**
 * Computa idade de documento em anos (decimal).
 *
 * @param {string|number} createdAt - ISO date or timestamp
 * @param {number} now
 * @returns {number}
 */
export function computeAgeYears(createdAt: string | number, now: number): number {
    let createdMs;
    if (typeof createdAt === 'string') {
        createdMs = Date.parse(createdAt);
    } else if (Number.isFinite(createdAt)) {
        createdMs = createdAt;
    } else {
        return 0;
    }
    if (!Number.isFinite(createdMs)) return 0;
    const _now = Number.isFinite(now) ? now : Date.now();
    const ms = _now - createdMs;
    if (ms <= 0) return 0;
    return ms / (365.25 * 86400000);
}

/**
 * Determina ação de retenção para um documento.
 *
 * @param {Record<string, any>} doc - { category, createdAt, ... }
 * @param {{ policy?: Record<string, any>, now?: number }} [options]
 * @returns {{action: string, reason: string, ageYears: number, policy: any}}
 */
export function evaluateRetention(
    doc: Record<string, any>,
    options: { policy?: Record<string, any>; now?: number } = {},
): { action: string; reason: string; ageYears: number; policy: any } {
    if (!doc || typeof doc !== 'object') {
        return Object.freeze({
            action: 'keep',
            reason: 'doc_invalid',
            ageYears: 0,
            policy: null,
        });
    }
    const policy: any = options.policy || resolvePolicy(doc.category);
    if (!policy) {
        return Object.freeze({
            action: 'keep',
            reason: 'no_policy_for_category',
            ageYears: 0,
            policy: null,
        });
    }
    const now = Number.isFinite(options.now) ? (options.now as number) : Date.now();
    const ageYears = computeAgeYears(doc.createdAt, now);

    // Audit category never disposes
    if (policy.category === 'audit') {
        return Object.freeze({
            action: 'keep',
            reason: 'audit_immutable',
            ageYears,
            policy,
        });
    }

    if (Number.isFinite(policy.disposeAfterYears) && ageYears >= policy.disposeAfterYears) {
        return Object.freeze({
            action: 'dispose',
            reason: `over_disposal_threshold_${policy.disposeAfterYears}y`,
            ageYears,
            policy,
        });
    }
    if (
        Number.isFinite(policy.anonymizeAfterYears) &&
        ageYears >= policy.anonymizeAfterYears &&
        ageYears < (policy.disposeAfterYears || Infinity)
    ) {
        return Object.freeze({
            action: 'anonymize',
            reason: `over_anonymize_threshold_${policy.anonymizeAfterYears}y`,
            ageYears,
            policy,
        });
    }
    if (Number.isFinite(policy.archiveAfterYears) && ageYears >= policy.archiveAfterYears) {
        return Object.freeze({
            action: 'archive',
            reason: `over_archive_threshold_${policy.archiveAfterYears}y`,
            ageYears,
            policy,
        });
    }
    return Object.freeze({
        action: 'keep',
        reason: 'within_retention_window',
        ageYears,
        policy,
    });
}

/**
 * Aplica retenção a um lote de documentos.
 *
 * @param {Array<Object>} documents
 * @param {Record<string, any>} [options]
 * @returns {{totalsByAction: Record<string, number>, items: any[]}}
 */
export function batchEvaluateRetention(
    documents: Array<object>,
    options: Record<string, any> = {},
): { totalsByAction: Record<string, number>; items: any[] } {
    const empty = {
        totalsByAction: { keep: 0, review: 0, archive: 0, dispose: 0, anonymize: 0 },
        items: [],
    };
    if (!Array.isArray(documents)) return empty;

    const totals: Record<string, number> = { keep: 0, review: 0, archive: 0, dispose: 0, anonymize: 0 };
    const items = [];
    for (const doc of documents) {
        if (!doc) continue;
        const result = evaluateRetention(doc, options);
        if (result.action in totals) totals[result.action]!++;
        items.push(Object.freeze({ docId: (doc as any).id || null, ...result }));
    }
    return Object.freeze({
        totalsByAction: Object.freeze(totals),
        items: Object.freeze(items),
    }) as any;
}

/**
 * Computa próxima data de revisão de retenção.
 *
 * @param {Record<string, any>} doc
 * @param {Record<string, any>} [options]
 * @returns {string|null} ISO date ou null se sem policy
 */
export function nextReviewDate(doc: Record<string, any>, options: Record<string, any> = {}): string | null {
    if (!doc) return null;
    const policy = options.policy || resolvePolicy(doc.category);
    if (!policy) return null;
    let createdMs;
    if (typeof doc.createdAt === 'string') {
        createdMs = Date.parse(doc.createdAt);
    } else if (Number.isFinite(doc.createdAt)) {
        createdMs = doc.createdAt;
    } else {
        return null;
    }
    if (!Number.isFinite(createdMs)) return null;

    // Próxima review = createdAt + (archiveAfterYears OR retentionYears)
    const yearsToAdd = Number.isFinite(policy.archiveAfterYears) ? policy.archiveAfterYears : policy.retentionYears;
    if (!Number.isFinite(yearsToAdd)) return null;
    const next = createdMs + yearsToAdd * 365.25 * 86400000;
    return new Date(next).toISOString();
}

/**
 * Module identity export.
 */
export const complianceRetentionMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 10,
    deliveredAt: '2026-05-01',
    categories: RETENTION_CATEGORIES,
    actions: RETENTION_ACTIONS,
    builtinPoliciesCount: Object.keys(BUILTIN_POLICIES).length,
    exports: [
        'RETENTION_CATEGORIES',
        'RETENTION_ACTIONS',
        'BUILTIN_POLICIES',
        'RETENTION_META',
        'isValidCategory',
        'isValidAction',
        'createPolicy',
        'resolvePolicy',
        'computeAgeYears',
        'evaluateRetention',
        'batchEvaluateRetention',
        'nextReviewDate',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
