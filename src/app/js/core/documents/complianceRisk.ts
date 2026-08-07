// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Risk Assessment - Phase 20 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S23
 *
 * Phase 20 (2026-05-01) - pure-logic risk scoring engine para
 * compliance documents. Combina likelihood × impact × controls
 * para gerar risk score canônico ISO 31000.
 *
 * Estratégia:
 *   - Likelihood (1-5): rare/unlikely/possible/likely/almost_certain
 *   - Impact (1-5): negligible/minor/moderate/major/catastrophic
 *   - Risk = likelihood × impact (1-25)
 *   - Controls reduce risk (mitigation factor 0-1)
 *   - Heat map zones: low / medium / high / critical
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Likelihood levels (1-5). */
export const LIKELIHOOD_LEVELS = Object.freeze({
    rare: 1,
    unlikely: 2,
    possible: 3,
    likely: 4,
    almost_certain: 5,
});

/** Impact levels (1-5). */
export const IMPACT_LEVELS = Object.freeze({
    negligible: 1,
    minor: 2,
    moderate: 3,
    major: 4,
    catastrophic: 5,
});

/** Risk zones (low/medium/high/critical). */
export const RISK_ZONES = Object.freeze(['low', 'medium', 'high', 'critical']);

/** Identidade do módulo. */
export const RISK_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 20,
    deliveredAt: '2026-05-01',
    likelihoodLevels: Object.keys(LIKELIHOOD_LEVELS),
    impactLevels: Object.keys(IMPACT_LEVELS),
    zones: RISK_ZONES,
});

/**
 * Resolve likelihood numeric value.
 *
 * @param {string|number} value
 * @returns {number} 1-5 ou 0
 */
export function resolveLikelihood(value: string|number): number {
    if (typeof value === 'number' && value >= 1 && value <= 5) return Math.round(value);
    if (typeof value === 'string' && value in LIKELIHOOD_LEVELS)
        return (LIKELIHOOD_LEVELS as Record<string, number>)[value]!;
    return 0;
}

/**
 * Resolve impact numeric value.
 */
export function resolveImpact(value: any): number {
    if (typeof value === 'number' && value >= 1 && value <= 5) return Math.round(value);
    if (typeof value === 'string' && value in IMPACT_LEVELS)
        return (IMPACT_LEVELS as Record<string, number>)[value]!;
    return 0;
}

/**
 * Computa raw risk score (likelihood × impact).
 *
 * @param {string|number} likelihood
 * @param {string|number} impact
 * @returns {number} 0-25
 */
export function computeRawRisk(likelihood: string|number, impact: string|number): number {
    const l = resolveLikelihood(likelihood);
    const i = resolveImpact(impact);
    return l * i;
}

/**
 * Computa controls factor (multiplica risk).
 *
 * @param {Array<{type: string, effectiveness: number}>} controls
 * @returns {number} 0.0-1.0 (mitigation = 1 - factor)
 */
export function computeControlsFactor(controls: Array<{type: string, effectiveness: number}>): number {
    if (!Array.isArray(controls) || controls.length === 0) return 1; // no controls = full risk
    let combined = 1;
    for (const c of controls) {
        if (!c || typeof c !== 'object') continue;
        const eff = Number.isFinite(c.effectiveness) ? Math.max(0, Math.min(1, c.effectiveness)) : 0;
        // Combine: each control reduces remaining risk
        combined *= 1 - eff;
    }
    return combined;
}

/**
 * Computa residual risk (raw × controls factor).
 *
 * @param {number} rawRisk
 * @param {Array<any>} controls
 * @returns {number}
 */
export function computeResidualRisk(rawRisk: number, controls: Array<any>): number {
    if (!Number.isFinite(rawRisk)) return 0;
    return rawRisk * computeControlsFactor(controls);
}

/**
 * Mapeia risk numeric → zone.
 *
 * @param {number} risk 0-25
 * @returns {string}
 */
export function riskToZone(risk: number): string {
    if (!Number.isFinite(risk)) return 'low';
    if (risk >= 20) return 'critical';
    if (risk >= 10) return 'high';
    if (risk >= 5) return 'medium';
    return 'low';
}

/**
 * Cria assessment frozen.
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createAssessment(spec: Record<string, any>): Object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createAssessment: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createAssessment: id required');
    }
    const likelihood = resolveLikelihood(spec.likelihood);
    const impact = resolveImpact(spec.impact);
    const rawRisk = computeRawRisk(likelihood, impact);
    const controls = Array.isArray(spec.controls)
        ? spec.controls
              .filter((c: any) => c && typeof c === 'object')
              .map((c: any) =>
                  Object.freeze({
                      type: c.type || '',
                      description: c.description || '',
                      effectiveness: Number.isFinite(c.effectiveness) ? Math.max(0, Math.min(1, c.effectiveness)) : 0,
                  }),
              )
        : [];
    const residualRisk = computeResidualRisk(rawRisk, controls);
    return Object.freeze({
        id: spec.id,
        title: spec.title || '',
        description: spec.description || '',
        category: spec.category || '',
        likelihood,
        impact,
        rawRisk,
        controls: Object.freeze(controls),
        residualRisk,
        rawZone: riskToZone(rawRisk),
        residualZone: riskToZone(residualRisk),
        owner: spec.owner || null,
        createdAt: spec.createdAt || new Date().toISOString(),
    });
}

/**
 * Sumariza N assessments por zone.
 */
export function summarizeAssessments(assessments: any) {
    const empty = {
        total: 0,
        byZone: { low: 0, medium: 0, high: 0, critical: 0 },
        avgRawRisk: 0,
        avgResidualRisk: 0,
        mitigationEffectiveness: 0,
    };
    if (!Array.isArray(assessments) || assessments.length === 0) return empty;

    const byZone = { low: 0, medium: 0, high: 0, critical: 0 };
    let sumRaw = 0;
    let sumResidual = 0;
    for (const a of assessments) {
        if (!a) continue;
        if (a.residualZone in byZone) {
            const _bz = byZone as Record<string, number>;
            _bz[a.residualZone] = (_bz[a.residualZone] ?? 0) + 1;
        }
        if (Number.isFinite(a.rawRisk)) sumRaw += a.rawRisk;
        if (Number.isFinite(a.residualRisk)) sumResidual += a.residualRisk;
    }
    const avgRaw = sumRaw / assessments.length;
    const avgRes = sumResidual / assessments.length;
    const mitigation = avgRaw > 0 ? 1 - avgRes / avgRaw : 0;

    return Object.freeze({
        total: assessments.length,
        byZone,
        avgRawRisk: avgRaw,
        avgResidualRisk: avgRes,
        mitigationEffectiveness: mitigation,
    });
}

/**
 * Filtra por zone.
 */
export function filterByZone(assessments: any, zone: any) {
    if (!Array.isArray(assessments) || !RISK_ZONES.includes(zone)) return [];
    return assessments.filter((a) => a && a.residualZone === zone);
}

/**
 * Module identity export.
 */
export const complianceRiskMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 20,
    deliveredAt: '2026-05-01',
    zones: RISK_ZONES,
    exports: [
        'LIKELIHOOD_LEVELS',
        'IMPACT_LEVELS',
        'RISK_ZONES',
        'RISK_META',
        'resolveLikelihood',
        'resolveImpact',
        'computeRawRisk',
        'computeControlsFactor',
        'computeResidualRisk',
        'riskToZone',
        'createAssessment',
        'summarizeAssessments',
        'filterByZone',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
