// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Environmental Social Governance Score - Score ESG ambiental integrado
 *
 * Implements a weighted composite ESG scoring model for environmental projects,
 * aligned with major international reporting frameworks.
 *
 * Academic references:
 * - GRI (2021). GRI Universal Standards 2021 (GRI 1, 2, 3).
 *   Global Reporting Initiative. https://www.globalreporting.org/standards/
 * - SASB (2018). SASB Standards - Environment sector.
 *   Sustainability Accounting Standards Board. https://www.sasb.org/standards/
 * - TCFD (2017). Recommendations of the Task Force on Climate-related Financial
 *   Disclosures. Financial Stability Board. https://www.tcfdhub.org/
 * - Berg, F., Koelbel, J.F. & Rigobon, R. (2022). Aggregate Confusion: The
 *   Divergence of ESG Ratings. Review of Finance, 26(6), 1315–1344.
 *   DOI: 10.1093/rof/rfac033
 *
 * @module core/analytics/environmentalSocialGovernanceScore
 */

/**
 * ESG rating classification thresholds.
 * Limites de classificacao ESG.
 */
export const ESG_RATING_THRESHOLDS = Object.freeze([
    { min: 90, rating: 'AAA', label: 'Leader' },
    { min: 80, rating: 'AA', label: 'Outperformer' },
    { min: 70, rating: 'A', label: 'Above Average' },
    { min: 60, rating: 'BBB', label: 'Average' },
    { min: 50, rating: 'BB', label: 'Below Average' },
    { min: 40, rating: 'B', label: 'Underperformer' },
    { min: 0, rating: 'CCC', label: 'Laggard' },
]);

/**
 * Default pillar weights aligned with GRI Standards emphasis for environmental projects.
 * Pesos padrao dos pilares alinhados com GRI Standards para projetos ambientais.
 */
export const DEFAULT_PILLAR_WEIGHTS = Object.freeze({
    E: 0.5, // Environmental pillar — maior peso para projetos ambientais
    S: 0.3, // Social pillar
    G: 0.2, // Governance pillar
});

/**
 * Calculate Environmental (E) pillar score.
 * Calcula o score do pilar Ambiental (E).
 *
 * Criteria: GHG emissions (GRI 305), biodiversity (GRI 304),
 * water use (GRI 303), waste management (GRI 306).
 * Each sub-score is 0–100.
 *
 * @param {Record<string, number>} criteria - Environmental criteria scores. Required keys: ghgEmissionsScore, biodiversityScore, waterScore, wasteScore (each 0–100)
 * @param {Record<string, number>} [weights] - Sub-criteria weights (must sum to 1) / Pesos dos sub-criterios
 * @returns {number} E pillar score (0–100) / Score do pilar E
 */
export function calculateEnvironmentalScore(
    criteria: any,
    weights = { ghgEmissionsScore: 0.35, biodiversityScore: 0.25, waterScore: 0.25, wasteScore: 0.15 },
) {
    const fields = ['ghgEmissionsScore', 'biodiversityScore', 'waterScore', 'wasteScore'];
    for (const f of fields) {
        if (typeof criteria[f] !== 'number' || criteria[f] < 0 || criteria[f] > 100) {
            throw new RangeError(`criteria.${f} must be between 0 and 100`);
        }
        if (typeof weights[(f as keyof typeof weights)] !== 'number' || weights[(f as keyof typeof weights)] < 0) {
            throw new RangeError(`weights.${f} must be a non-negative number`);
        }
    }

    const totalWeight = fields.reduce((s, f) => s + weights[(f as keyof typeof weights)], 0);
    if (Math.abs(totalWeight - 1) > 1e-9) {
        throw new RangeError(`weights must sum to 1.0, got ${totalWeight}`);
    }

    return fields.reduce((score, f) => score + criteria[f] * weights[(f as keyof typeof weights)], 0);
}

/**
 * Calculate Social (S) pillar score.
 * Calcula o score do pilar Social (S).
 *
 * Criteria: occupational health & safety (GRI 403), community impact (GRI 413),
 * regulatory compliance (GRI 307), labor practices (GRI 401).
 *
 * @param {Record<string, number>} criteria - Social criteria scores. Required keys: healthSafetyScore, communityScore, complianceScore, laborScore (each 0–100)
 * @param {Record<string, number>} [weights] - Sub-criteria weights (must sum to 1) / Pesos dos sub-criterios
 * @returns {number} S pillar score (0–100) / Score do pilar S
 */
export function calculateSocialScore(
    criteria: any,
    weights = { healthSafetyScore: 0.35, communityScore: 0.25, complianceScore: 0.25, laborScore: 0.15 },
) {
    const fields = ['healthSafetyScore', 'communityScore', 'complianceScore', 'laborScore'];
    for (const f of fields) {
        if (typeof criteria[f] !== 'number' || criteria[f] < 0 || criteria[f] > 100) {
            throw new RangeError(`criteria.${f} must be between 0 and 100`);
        }
        if (typeof weights[(f as keyof typeof weights)] !== 'number' || weights[(f as keyof typeof weights)] < 0) {
            throw new RangeError(`weights.${f} must be a non-negative number`);
        }
    }

    const totalWeight = fields.reduce((s, f) => s + weights[(f as keyof typeof weights)], 0);
    if (Math.abs(totalWeight - 1) > 1e-9) {
        throw new RangeError(`weights must sum to 1.0, got ${totalWeight}`);
    }

    return fields.reduce((score, f) => score + criteria[f] * weights[(f as keyof typeof weights)], 0);
}

/**
 * Calculate Governance (G) pillar score.
 * Calcula o score do pilar de Governanca (G).
 *
 * Criteria: transparency/disclosure (TCFD), audit quality (GRI 2),
 * risk management (TCFD), anti-corruption (GRI 205).
 *
 * @param {Record<string, number>} criteria - Governance criteria scores. Required keys: transparencyScore, auditScore, riskManagementScore, antiCorruptionScore (each 0–100)
 * @param {Record<string, number>} [weights] - Sub-criteria weights (must sum to 1) / Pesos dos sub-criterios
 * @returns {number} G pillar score (0–100) / Score do pilar G
 */
export function calculateGovernanceScore(
    criteria: any,
    weights = { transparencyScore: 0.3, auditScore: 0.3, riskManagementScore: 0.25, antiCorruptionScore: 0.15 },
) {
    const fields = ['transparencyScore', 'auditScore', 'riskManagementScore', 'antiCorruptionScore'];
    for (const f of fields) {
        if (typeof criteria[f] !== 'number' || criteria[f] < 0 || criteria[f] > 100) {
            throw new RangeError(`criteria.${f} must be between 0 and 100`);
        }
        if (typeof weights[(f as keyof typeof weights)] !== 'number' || weights[(f as keyof typeof weights)] < 0) {
            throw new RangeError(`weights.${f} must be a non-negative number`);
        }
    }

    const totalWeight = fields.reduce((s, f) => s + weights[(f as keyof typeof weights)], 0);
    if (Math.abs(totalWeight - 1) > 1e-9) {
        throw new RangeError(`weights must sum to 1.0, got ${totalWeight}`);
    }

    return fields.reduce((score, f) => score + criteria[f] * weights[(f as keyof typeof weights)], 0);
}

/**
 * Calculate composite ESG score with pillar weighting and rating classification.
 * Calcula o score ESG composto com ponderacao de pilares e classificacao.
 *
 * Composite = wE * E + wS * S + wG * G
 *
 * @param {Record<string, number>} pillarScores - Pillar scores. Required keys: E, S, G (each 0–100)
 * @param {Record<string, number>} [pillarWeights] - Pillar weights (must sum to 1) / Pesos dos pilares
 * @returns {{ compositeScore: number, rating: string, label: string, pillarScores: { E: number, S: number, G: number } }}
 */
export function calculateCompositeESGScore(pillarScores: any, pillarWeights = DEFAULT_PILLAR_WEIGHTS) {
    for (const p of ['E', 'S', 'G']) {
        if (typeof pillarScores[p] !== 'number' || pillarScores[p] < 0 || pillarScores[p] > 100) {
            throw new RangeError(`pillarScores.${p} must be between 0 and 100`);
        }
        if (typeof pillarWeights[(p as keyof typeof pillarWeights)] !== 'number' || pillarWeights[(p as keyof typeof pillarWeights)] < 0) {
            throw new RangeError(`pillarWeights.${p} must be a non-negative number`);
        }
    }

    const totalWeight = pillarWeights.E + pillarWeights.S + pillarWeights.G;
    if (Math.abs(totalWeight - 1) > 1e-9) {
        throw new RangeError(`pillarWeights must sum to 1.0, got ${totalWeight}`);
    }

    const compositeScore =
        pillarScores.E * pillarWeights.E + pillarScores.S * pillarWeights.S + pillarScores.G * pillarWeights.G;

    // Determinar classificacao ESG a partir dos limites
    const threshold = ESG_RATING_THRESHOLDS.find((t) => compositeScore >= t.min);
    const { rating, label } = threshold || { rating: 'CCC', label: 'Laggard' };

    return {
        compositeScore,
        rating,
        label,
        pillarScores: { E: pillarScores.E, S: pillarScores.S, G: pillarScores.G },
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const environmentalSocialGovernanceScoreMeta = {
    name: 'environmentalSocialGovernanceScore',
    description: 'environmentalSocialGovernanceScore',
    category: 'analytics',
    familyTags: ['environmental'],
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
