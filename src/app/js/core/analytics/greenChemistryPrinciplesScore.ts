// @ts-check
// Generated from src/app/js/core/analytics/greenChemistryPrinciplesScore.ts by TS-MIGRATION-001. Do not edit manually.
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
 * @module greenChemistryPrinciplesScore
 * Green Chemistry Principles Score - ACS 12 Principles (Anastas & Warner 1998) + ECHA SVHC.
 *
 * Academic references:
 *   Anastas, P.T. & Warner, J.C. (1998). Green Chemistry: Theory and Practice.
 *     Oxford University Press, New York. ISBN: 0-19-850234-6.
 *   ECHA (2023). Guidance on the Application of the CLP Criteria for SVHC Identification.
 *     European Chemicals Agency, Helsinki. ECHA-23-G-10-EN.
 *   Pena, J. et al. (2021). Green Metrics for Solvent Substitution. ACS Sustain. Chem. Eng.
 *     DOI:10.1021/acssuschemeng.0c07950.
 */
'use strict';
/**
 * GHS hazard categories and their associated danger weight (0–1).
 * Based on GHS Rev. 9 (UN 2021) severity scaling.
 * Higher weight = greater hazard contribution.
 */
const GHS_HAZARD_WEIGHTS: any = {
    acute_toxicity_oral: 0.15, // Cat 1-4; weight applied at cat 1
    acute_toxicity_inhalation: 0.15,
    skin_corrosion: 0.1,
    skin_sensitization: 0.08,
    eye_damage: 0.08,
    carcinogenicity: 0.2, // Category 1A/1B
    reproductive_toxicity: 0.15, // Category 1
    STOT_repeated: 0.12, // Specific Target Organ Toxicity - repeated exposure
    environmental_aquatic: 0.1, // Chronic Cat 1
    // Total if all categories active: 1.13 (capped at 100 after scaling)
};
const GHS_CATEGORY_NAMES = Object.keys(GHS_HAZARD_WEIGHTS);
const TOTAL_MAX_GHS = Object.values(GHS_HAZARD_WEIGHTS).reduce((a: any, b: any) => a + b, 0);
/**
 * Calculates a substance hazard score (0–100) based on active GHS hazard categories.
 * Score 0 = no hazard; 100 = maximum hazard (all categories active at worst severity).
 *
 * GHS categories may be weighted by severity level (1.0 = Cat 1, 0.5 = Cat 2, 0.25 = Cat 3).
 * If no severity provided, Cat 1 is assumed (full weight).
 *
 * @param {Record<string, number>} GHS_categories - Map of GHS category name -> severity weight (0-1).
 *   Valid keys: 'acute_toxicity_oral', 'acute_toxicity_inhalation', 'skin_corrosion',
 *   'skin_sensitization', 'eye_damage', 'carcinogenicity', 'reproductive_toxicity',
 *   'STOT_repeated', 'environmental_aquatic'.
 *   Example: { carcinogenicity: 1.0, skin_sensitization: 0.5 }
 * @returns {number} Hazard score in [0, 100].
 */
export function calcSubstanceHazardScore( GHS_categories: any) {
    if (!GHS_categories || typeof GHS_categories !== 'object') {
        throw new TypeError('GHS_categories must be an object');
    }
    let rawScore = 0;
    for (const [cat, severity] of Object.entries(GHS_categories) as [string, any][]) {
        if (!(GHS_HAZARD_WEIGHTS as any)[cat]) {
            throw new RangeError(`Unknown GHS category: '${cat}'. Valid: ${GHS_CATEGORY_NAMES.join(', ')}`);
        }
        if (!Number.isFinite(severity) || severity < 0 || severity > 1) {
            throw new RangeError(`GHS_categories.${cat} severity must be in [0, 1]`);
        }
        rawScore += (GHS_HAZARD_WEIGHTS as any)[cat] * severity;
    }
    return Math.min(100, (rawScore / (TOTAL_MAX_GHS as any)) * 100);
}
/**
 * Green Chemistry score criteria weights (Anastas & Warner 12 Principles condensed to 5).
 * Each criterion scored 0-1 by the caller; combined into 0-100 score.
 * @type {Record<string, number>}
 */
const GREEN_CRITERIA_WEIGHTS = {
    atom_economy: 0.25, // Principle 2: maximize incorporation of starting materials
    renewability: 0.2, // Principle 7: use renewable feedstocks
    biodegradability: 0.2, // Principle 10: design for degradation
    energy_efficiency: 0.2, // Principle 6: reduce energy demand
    waste_minimization: 0.15, // Principle 1: prevent waste
};
/**
 * Calculates the Green Chemistry score (0–100) for a substitute substance/process.
 * Higher = greener. Each property is a normalized score in [0, 1].
 *
 * @param {Record<string, number>} substituteProperties - Green chemistry property scores.
 *   {
 *     atom_economy?: number,      // 0–1 (1 = 100% atom economy)
 *     renewability?: number,      // 0–1 (1 = fully renewable feedstock)
 *     biodegradability?: number,  // 0–1 (1 = readily biodegradable per OECD 301)
 *     energy_efficiency?: number, // 0–1 (1 = ambient conditions, no auxiliary energy)
 *     waste_minimization?: number // 0–1 (1 = zero waste / E-factor = 0)
 *   }
 * @returns {number} Green score in [0, 100].
 */
export function calcGreenScore( substituteProperties: any) {
    if (!substituteProperties || typeof substituteProperties !== 'object') {
        throw new TypeError('substituteProperties must be an object');
    }
    let weightedSum = 0;
    let totalWeight = 0;
    for (const [crit, weight] of Object.entries(GREEN_CRITERIA_WEIGHTS)) {
        const val = substituteProperties[crit];
        if (val === undefined || val === null) continue;
        if (!Number.isFinite(val) || val < 0 || val > 1) {
            throw new RangeError(`substituteProperties.${crit} must be in [0, 1]`);
        }
        weightedSum += val * weight;
        totalWeight += weight;
    }
    if (totalWeight === 0) throw new RangeError('at least one substituteProperty must be provided');
    return (weightedSum / totalWeight) * 100;
}
/**
 * Ranks alternative substances by combined score = greenScore - hazardScore.
 * Returns alternatives sorted from best (highest net score) to worst.
 *
 * @param {{ name: string, GHS_categories: Record<string, number>, substituteProperties: Record<string, number> }} current
 *   Current substance being evaluated.
 * @param {Array<{ name: string, GHS_categories: Record<string, number>, substituteProperties: Record<string, number> }>} alternatives
 *   Candidate substitute substances.
 * @returns {Array<{ name: string, hazardScore: number, greenScore: number, netScore: number }>}
 *   Ranked alternatives with scores; current substance included as first reference entry.
 */
export function calcAlternativeComparison( current: any, alternatives: any) {
    if (!current || typeof current !== 'object') throw new TypeError('current must be an object');
    if (!Array.isArray(alternatives) || alternatives.length === 0) {
        throw new TypeError('alternatives must be a non-empty array');
    }
    /**
     * @param {{ name?: string, GHS_categories?: Record<string, number>, substituteProperties?: Record<string, number> }} substance
     */
    function _score( substance: any) {
        const hazardScore = calcSubstanceHazardScore(substance.GHS_categories || {});
        const greenScore = calcGreenScore(substance.substituteProperties || { waste_minimization: 0 });
        const netScore = greenScore - hazardScore;
        return { name: substance.name ?? 'unnamed', hazardScore, greenScore, netScore };
    }
    const currentScore = { ..._score(current), isCurrent: true };
    const altScores = alternatives.map(_score).sort((a: any, b: any) => b.netScore - a.netScore);
    return [currentScore, ...altScores];
}
/**
 * Classifies a green chemistry score into qualitative categories.
 *
 * @param {number} score - Green score in [0, 100].
 * @returns {'not_green'|'partially_green'|'green'|'very_green'} Classification.
 */
export function classifyGreenChemistry( score: any) {
    if (!Number.isFinite(score) || score < 0 || score > 100) {
        throw new RangeError('score must be in [0, 100]');
    }
    if (score >= 80) return 'very_green';
    if (score >= 55) return 'green';
    if (score >= 30) return 'partially_green';
    return 'not_green';
}
/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js' as string).AnalyticsModuleMeta}
 */
export const greenChemistryPrinciplesScoreMeta = {
    name: 'greenChemistryPrinciplesScore',
    description: 'greenChemistryPrinciplesScore',
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
