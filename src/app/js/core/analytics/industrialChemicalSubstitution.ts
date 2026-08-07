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
 * Industrial Chemical Substitution Assessment (ICSA)
 *
 * Implements hazard scoring and substitution feasibility for industrial chemicals,
 * following REACH, GreenScreen, and SUBSPORT frameworks.
 *
 * References:
 * - European Parliament & Council (2006). REACH Regulation (EC) No 1907/2006.
 *   Official Journal of the European Union L 396, 1–849.
 *   https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006R1907
 * - Clean Production Action (2018). GreenScreen for Safer Chemicals v1.4.
 *   https://www.greenscreenchemicals.org/static/ee_images/uploads/GreenScreen_v1.4.pdf
 * - SUBSPORT (2012). Substitution Support Portal - Practical Guide.
 *   https://www.subsport.eu/substitution-guide/
 *
 * Zero dependencies on DOM, IndexedDB, Three.js, or fetch.
 *
 * @module industrialChemicalSubstitution
 */

// ---- Hazard category weights (REACH + GreenScreen v1.4) ----

/**
 * Peso relativo de cada categoria de perigo (adimensional, soma ≤ 1)
 * @type {Record<string, number>}
 */
const HAZARD_WEIGHTS = {
    cmr: 0.3, // Carcinogenic, Mutagenic, Reprotoxic (REACH Annex XIV)
    pbt: 0.25, // Persistent, Bioaccumulative, Toxic
    vpvb: 0.2, // Very Persistent, Very Bioaccumulative
    sensitizer: 0.15, // Respiratory/skin sensitizer (REACH Annex XVII)
    acute: 0.1, // Acute aquatic/terrestrial toxicity
};

/**
 * Score máximo de perigo por categoria (GreenScreen v1.4 scale)
 * @type {Record<string, number>}
 */
const HAZARD_SCALE = { low: 0.2, moderate: 0.5, high: 0.8, very_high: 1.0 };

/** Recomendações de substituição por score final */
const SUBSTITUTION_RECOMMENDATIONS = [
    { max: 0.25, recommendation: 'acceptable', note: 'No immediate substitution needed' },
    { max: 0.5, recommendation: 'investigate', note: 'Evaluate alternatives within 2 years' },
    { max: 0.75, recommendation: 'substitute', note: 'Substitution required within 1 year' },
    { max: 1.01, recommendation: 'unacceptable', note: 'Immediate phase-out required (SVHC candidate)' },
];

// ---- Hazard score per category ----

/**
 * Converts a hazard level string to a numeric score.
 * Converte nível de perigo textual em score numérico.
 * @private
 * @param {string} level
 * @returns {number}
 */
function levelToScore(level: string): number {
    const s = (HAZARD_SCALE as Record<string, number>)[level];
    if (s === undefined) {
        throw new RangeError(`Unknown hazard level: "${level}". Valid: ${Object.keys(HAZARD_SCALE).join(', ')}`);
    }
    return s;
}

/**
 * Calculates composite hazard score for a chemical substance.
 * Calcula score composto de perigo para uma substância química.
 *
 * @param {object} hazardLevels
 * @param {'low'|'moderate'|'high'|'very_high'} hazardLevels.cmr        - CMR classification
 * @param {'low'|'moderate'|'high'|'very_high'} hazardLevels.pbt        - PBT classification
 * @param {'low'|'moderate'|'high'|'very_high'} hazardLevels.vpvb       - vPvB classification
 * @param {'low'|'moderate'|'high'|'very_high'} hazardLevels.sensitizer - Sensitizer classification
 * @param {'low'|'moderate'|'high'|'very_high'} hazardLevels.acute      - Acute toxicity
 * @returns {{ totalHazardScore: number, categoryScores: object }}
 */
export function calculateHazardScore(hazardLevels: any): { totalHazardScore: number, categoryScores: object } {
    if (typeof hazardLevels !== 'object' || hazardLevels === null) {
        throw new TypeError('hazardLevels must be a non-null object');
    }

    const levels = /** @type {Record<string, string>} */ (hazardLevels);
    const required = Object.keys(HAZARD_WEIGHTS);
    for (const cat of required) {
        if (typeof levels[cat] !== 'string') {
            throw new TypeError(`hazardLevels.${cat} must be a string`);
        }
    }

    /** @type {Record<string, number>} */
    const categoryScores: Record<string, number> = {};
    let totalHazardScore = 0;

    for (const cat of required) {
        const score = levelToScore(levels[cat]);
        categoryScores[cat] = score;
        totalHazardScore += score * (HAZARD_WEIGHTS as Record<string, number>)[cat]!;
    }

    return { totalHazardScore, categoryScores };
}

// ---- Technical-economic substitution feasibility ----

/**
 * Calculates technical-economic feasibility index for substitution.
 * Índice de viabilidade técnico-econômica da substituição.
 * Score 0 (inviável) a 1 (totalmente viável).
 *
 * @param {object} feasibility
 * @param {number} feasibility.technicalReadiness  - TRL score 0-1 (0=lab only, 1=commercially proven)
 * @param {number} feasibility.costDeltaFraction   - (alternateCost - currentCost) / currentCost; negative = cheaper
 * @param {number} feasibility.availabilityScore   - Market availability 0-1 (0=unavailable, 1=widely available)
 * @param {number} feasibility.performanceParity   - Performance ratio alternative/current (0.5=half as good, 1=equal, >1=better)
 * @returns {{ feasibilityIndex: number, verdict: string }}
 */
export function calculateSubstitutionFeasibility(feasibility: any): { feasibilityIndex: number, verdict: string } {
    if (typeof feasibility !== 'object' || feasibility === null) {
        throw new TypeError('feasibility must be an object');
    }

    const { technicalReadiness, costDeltaFraction, availabilityScore, performanceParity } = feasibility;

    for (const [k, v] of Object.entries({ technicalReadiness, availabilityScore, performanceParity })) {
        if (typeof v !== 'number') throw new TypeError(`feasibility.${k} must be a number`);
    }
    if (typeof costDeltaFraction !== 'number') throw new TypeError('feasibility.costDeltaFraction must be a number');

    if (technicalReadiness < 0 || technicalReadiness > 1) throw new RangeError('technicalReadiness must be in [0, 1]');
    if (availabilityScore < 0 || availabilityScore > 1) throw new RangeError('availabilityScore must be in [0, 1]');
    if (performanceParity < 0) throw new RangeError('performanceParity must be >= 0');

    // Score de custo: 0 se muito mais caro (delta > +200%), 1 se mais barato ou igual
    const costScore = Math.max(0, Math.min(1, 1 - costDeltaFraction / 2));

    // Score de desempenho: capeado em 1 (mais não é penalizado)
    const perfScore = Math.min(performanceParity, 1);

    // Índice de viabilidade - pesos SUBSPORT 2012
    const feasibilityIndex = technicalReadiness * 0.35 + costScore * 0.3 + availabilityScore * 0.2 + perfScore * 0.15;

    const verdict =
        feasibilityIndex >= 0.7
            ? 'highly_feasible'
            : feasibilityIndex >= 0.45
              ? 'feasible_with_investment'
              : feasibilityIndex >= 0.25
                ? 'challenging'
                : 'not_feasible';

    return { feasibilityIndex, verdict };
}

// ---- SUBSPORT Alternative Score ----

/**
 * Calculates SUBSPORT-aligned alternative chemical score.
 * Score combinado SUBSPORT para alternativa química candidata.
 *
 * @param {number} hazardScoreAlternative    - Hazard score of the alternative (0-1, from calculateHazardScore)
 * @param {number} feasibilityIndex          - Substitution feasibility index (0-1)
 * @param {number} hazardScoreOriginal       - Hazard score of the original chemical (0-1)
 * @returns {{ subsportScore: number, improvementFactor: number, recommendation: string, note: string }}
 */
export function calculateSubsportScore(hazardScoreAlternative: number, feasibilityIndex: number, hazardScoreOriginal: number): { subsportScore: number, improvementFactor: number, recommendation: string, note: string } {
    if (
        typeof hazardScoreAlternative !== 'number' ||
        typeof feasibilityIndex !== 'number' ||
        typeof hazardScoreOriginal !== 'number'
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (hazardScoreAlternative < 0 || hazardScoreAlternative > 1)
        throw new RangeError('hazardScoreAlternative must be in [0,1]');
    if (feasibilityIndex < 0 || feasibilityIndex > 1) throw new RangeError('feasibilityIndex must be in [0,1]');
    if (hazardScoreOriginal < 0 || hazardScoreOriginal > 1)
        throw new RangeError('hazardScoreOriginal must be in [0,1]');

    // Melhoria de perigo (positivo = melhora, negativo = piora)
    const improvementFactor = hazardScoreOriginal - hazardScoreAlternative;

    // Score SUBSPORT: premia redução de perigo E viabilidade
    // Fórmula: 0.6 × hazardReduction_normalized + 0.4 × feasibilityIndex
    const hazardReductionNorm = (improvementFactor + 1) / 2; // normaliza [-1,1] → [0,1]
    const subsportScore = 0.6 * hazardReductionNorm + 0.4 * feasibilityIndex;

    const cls =
        SUBSTITUTION_RECOMMENDATIONS.find((r) => subsportScore < r.max) ??
        SUBSTITUTION_RECOMMENDATIONS[SUBSTITUTION_RECOMMENDATIONS.length - 1]!;

    return {
        subsportScore,
        improvementFactor,
        recommendation: cls.recommendation,
        note: cls.note,
    };
}

// ---- Full substitution assessment ----

/**
 * Full substitution assessment combining hazard, feasibility, and SUBSPORT score.
 * Avaliação completa de substituição química: perigo + viabilidade + score SUBSPORT.
 *
 * @param {object} current   - Current chemical assessment { hazardLevels }
 * @param {object} alternative - Alternative chemical { hazardLevels, feasibility }
 * @returns {object} Full comparative assessment
 */
export function assessChemicalSubstitution(current: any, alternative: any): any {
    if (typeof current !== 'object' || current === null) throw new TypeError('current must be an object');
    if (typeof alternative !== 'object' || alternative === null) throw new TypeError('alternative must be an object');

    const cur = /** @type {Record<string, any>} */ (current);
    const alt = /** @type {Record<string, any>} */ (alternative);

    const currentHazard = calculateHazardScore(cur.hazardLevels);
    const alternativeHazard = calculateHazardScore(alt.hazardLevels);
    const feasibility = calculateSubstitutionFeasibility(alt.feasibility);
    const subsport = calculateSubsportScore(
        alternativeHazard.totalHazardScore,
        feasibility.feasibilityIndex,
        currentHazard.totalHazardScore,
    );

    return {
        current: currentHazard,
        alternative: {
            ...alternativeHazard,
            feasibility,
        },
        subsport,
        summary: {
            hazardReduced: alternativeHazard.totalHazardScore < currentHazard.totalHazardScore,
            recommendation: subsport.recommendation,
            note: subsport.note,
        },
    };
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

export const industrialChemicalSubstitutionMeta: AnalyticsModuleMeta = {
    name: 'industrialChemicalSubstitution',
    description: 'industrialChemicalSubstitution',
    category: 'analytics',
    familyTags: ['industrial', 'chemical'],
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
