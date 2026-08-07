// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * @module industrialRiskMatrixQuantitative
 * @description Quantitative environmental risk matrix - ISO 31000:2018 + CEFIC (2018).
 * Implements a 5×5 likelihood-consequence matrix for environmental hazard assessment.
 *
 * Academic references:
 * - ISO 31000:2018 Risk Management - Guidelines
 * - CEFIC (2018) Chemical Risk Assessment Guidance for the Chemical Industry
 */

'use strict';

/**
 * Risk classification thresholds (ISO 31000:2018 §6.4.3 / CEFIC 2018 Table 3).
 * Score = likelihood × consequence, both on scale 1-5.
 * @type {ReadonlyArray<{max: number, label: 'negligible'|'low'|'medium'|'high'|'critical'}>}
 */
const RISK_THRESHOLDS = [
    { max: 2, label: 'negligible' },
    { max: 5, label: 'low' },
    { max: 12, label: 'medium' },
    { max: 19, label: 'high' },
    { max: 25, label: 'critical' },
] as const;

/**
 * Calculates the raw risk score using the ISO 31000:2018 two-dimensional matrix.
 * Score = Likelihood × Consequence (both integer 1–5).
 *
 * @param {number} likelihood   - Likelihood rating (1 = rare … 5 = almost certain)
 * @param {number} consequence  - Consequence rating (1 = negligible … 5 = catastrophic)
 * @returns {{ score: number, likelihood: number, consequence: number }}
 * @throws {RangeError} if either parameter is outside [1, 5]
 * @throws {TypeError} if either parameter is not a finite number
 *
 * Reference: ISO 31000:2018 §6.4.3.2
 */
export function calcRiskScore(likelihood: number, consequence: number): { score: number, likelihood: number, consequence: number } {
    if (!Number.isFinite(likelihood) || !Number.isFinite(consequence)) {
        throw new TypeError('calcRiskScore: likelihood and consequence must be finite numbers');
    }
    if (likelihood < 1 || likelihood > 5 || consequence < 1 || consequence > 5) {
        throw new RangeError('calcRiskScore: likelihood and consequence must be in [1, 5]');
    }
    const score = likelihood * consequence;
    return { score, likelihood, consequence };
}

/**
 * Classifies a risk score into an ISO 31000:2018 risk tier.
 *
 * @param {number} score - Risk score as returned by calcRiskScore (1–25)
 * @returns {'negligible'|'low'|'medium'|'high'|'critical'}
 * @throws {RangeError} if score is outside [1, 25]
 * @throws {TypeError} if score is not a finite number
 *
 * Reference: CEFIC (2018) Chemical Risk Assessment Guidance Table 3
 */
export function classifyRisk(score: number): 'negligible'|'low'|'medium'|'high'|'critical' {
    if (!Number.isFinite(score)) {
        throw new TypeError('classifyRisk: score must be a finite number');
    }
    if (score < 1 || score > 25) {
        throw new RangeError('classifyRisk: score must be in [1, 25]');
    }
    for (const tier of RISK_THRESHOLDS) {
        if (score <= tier.max) return tier.label;
    }
    return 'critical';
}

/**
 * Builds a full risk matrix from an array of environmental hazards.
 * Each hazard is scored and classified per ISO 31000:2018.
 *
 * @param {Array<{hazard: string, likelihood: number, consequence: number}>} hazards
 * @returns {Array<{hazard: string, likelihood: number, consequence: number, score: number, classification: string}>}
 * @throws {TypeError} if hazards is not an array
 *
 * Reference: ISO 31000:2018 §6.4
 */
export function buildRiskMatrix(hazards: any): Array<{hazard: string, likelihood: number, consequence: number, score: number, classification: string}> {
    if (!Array.isArray(hazards)) {
        throw new TypeError('buildRiskMatrix: hazards must be an array');
    }
    return hazards.map((h, idx) => {
        if (typeof h.hazard !== 'string' || !h.hazard.trim()) {
            throw new TypeError(`buildRiskMatrix: hazards[${idx}].hazard must be a non-empty string`);
        }
        const { score } = calcRiskScore(h.likelihood, h.consequence);
        const classification = classifyRisk(score);
        return {
            hazard: h.hazard,
            likelihood: h.likelihood,
            consequence: h.consequence,
            score,
            classification,
        };
    });
}

/**
 * Calculates residual risk after applying risk controls.
 * Residual score = inherentScore × (1 - controlEffectiveness / 100).
 *
 * @param {number} inherentScore        - Unmitigated risk score (1–25)
 * @param {number} controlEffectiveness - Control effectiveness as percentage (0–100 %)
 * @returns {{ residualScore: number, residualClassification: string, reductionPct: number }}
 * @throws {RangeError} if parameters are out of valid range
 * @throws {TypeError} if parameters are not finite numbers
 *
 * Reference: CEFIC (2018) §5.3 Risk Reduction; ISO 31000:2018 §6.5.3
 */
export function calcResidualRisk(inherentScore: number, controlEffectiveness: number): { residualScore: number, residualClassification: string, reductionPct: number } {
    if (!Number.isFinite(inherentScore) || !Number.isFinite(controlEffectiveness)) {
        throw new TypeError('calcResidualRisk: both parameters must be finite numbers');
    }
    if (inherentScore < 1 || inherentScore > 25) {
        throw new RangeError('calcResidualRisk: inherentScore must be in [1, 25]');
    }
    if (controlEffectiveness < 0 || controlEffectiveness > 100) {
        throw new RangeError('calcResidualRisk: controlEffectiveness must be in [0, 100] %');
    }
    const residualScore = inherentScore * (1 - controlEffectiveness / 100);
    // Clamp to minimum 1 for classification purposes if > 0
    const clampedScore = Math.max(1, Math.min(25, residualScore));
    const residualClassification = classifyRisk(clampedScore);
    const reductionPct = controlEffectiveness;
    return { residualScore, residualClassification, reductionPct };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
interface AnalyticsJsonSchema {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
    description?: string;
}
interface AnalyticsModuleProvenance {
    generatedBy: string;
    version: string;
    validatedByHuman: boolean;
    disclaimerAcknowledged: boolean;
    specRef: string;
    citation?: string;
}
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: AnalyticsModuleProvenance;
    inputSchema: AnalyticsJsonSchema;
    outputSchema: AnalyticsJsonSchema;
}

export const industrialRiskMatrixQuantitativeMeta: AnalyticsModuleMeta = {
    name: 'industrialRiskMatrixQuantitative',
    description: 'industrialRiskMatrixQuantitative',
    category: 'analytics',
    familyTags: ['industrial', 'risk'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
