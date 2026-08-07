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
 * Landslide Susceptibility Model (LSM)
 *
 * Heuristic-weighted index model for shallow landslide susceptibility assessment.
 *
 * References:
 * - Varnes, D.J. (1984). Landslide Hazard Zonation: A Review of Principles and Practice.
 *   UNESCO Press, Paris. Natural Hazards Series no. 3.
 * - Brabb, E.E. (1984). Innovative approaches to landslide hazard and risk mapping.
 *   USGS Open-File Report 2004-1164.
 * - Hungr, O., Leroueil, S. & Picarelli, L. (2014). The Varnes classification of
 *   landslide types, an update. Landslides, 11(2), 167–194.
 *   https://doi.org/10.1007/s10346-013-0436-y
 *
 * Zero dependencies on DOM, IndexedDB, Three.js, or fetch.
 * All angles in degrees; rainfall in mm/day; density in persons/km².
 *
 * @module landslideSusceptibilityModel
 */

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

// ---- Factor score tables ----

/** Slope angle → score (Varnes 1984, Hungr et al. 2014) */
const SLOPE_SCORES = [
    { max: 5, score: 0.05 },
    { max: 15, score: 0.15 },
    { max: 25, score: 0.35 },
    { max: 35, score: 0.65 },
    { max: 45, score: 0.85 },
    { max: 90, score: 1.0 },
];

/** Lithology susceptibility scores (Brabb 1984; Hungr 2014) */
const LITHOLOGY_SCORES = {
    massive_igneous: 0.1,
    foliated_metamorphic: 0.4,
    sedimentary_hard: 0.3,
    sedimentary_soft: 0.6,
    residual_soil: 0.7,
    colluvial: 0.85,
    unconsolidated: 1.0,
};

/** Land cover → protective factor (0=no protection, 1=full protection) */
const VEGETATION_SCORES = {
    dense_forest: 0.9,
    open_forest: 0.65,
    shrubland: 0.45,
    grassland: 0.3,
    bare_soil: 0.1,
    urban: 0.05,
    agriculture: 0.2,
};

/** Rainfall intensity → triggering score (mm/day) */
const RAINFALL_THRESHOLDS = [
    { max: 20, score: 0.1 },
    { max: 40, score: 0.25 },
    { max: 80, score: 0.55 },
    { max: 120, score: 0.8 },
    { max: 9999, score: 1.0 },
];

/** Susceptibility class boundaries */
const SUSCEPTIBILITY_CLASSES = [
    { label: 'very_low', max: 0.2 },
    { label: 'low', max: 0.4 },
    { label: 'moderate', max: 0.6 },
    { label: 'high', max: 0.8 },
    { label: 'very_high', max: 1.01 },
];

// ---- Helper: score lookup ----

/**
 * Looks up a score from a sorted threshold table.
 * Busca o score em tabela de limiares ordenada.
 * @private
 * @param {number} value
 * @param {Array<{max: number, score: number}>} table
 * @returns {number}
 */
function lookupScore(value: number, table: Array<{ max: number; score: number }>): number {
    for (const entry of table) {
        if (value <= entry.max) return entry.score;
    }
    return table[table.length - 1]!.score;
}

// ---- Individual factor scores ----

/**
 * Returns slope-angle susceptibility score.
 * Score de susceptibilidade por ângulo de inclinação.
 *
 * @param {number} slopeDeg - Slope angle in degrees (0–90)
 * @returns {number} Score in [0, 1]
 */
export function slopeSusceptibilityScore(slopeDeg: number): number {
    if (typeof slopeDeg !== 'number') throw new TypeError('slopeDeg must be a number');
    if (slopeDeg < 0 || slopeDeg > 90) throw new RangeError('slopeDeg must be in [0, 90]');
    return lookupScore(slopeDeg, SLOPE_SCORES);
}

/**
 * Returns lithology susceptibility score.
 * Score de susceptibilidade por tipo de rocha/solo.
 *
 * @param {string} lithologyType - Key from LITHOLOGY_SCORES
 * @returns {number} Score in [0, 1]
 */
export function lithologySusceptibilityScore(lithologyType: string): number {
    if (typeof lithologyType !== 'string') throw new TypeError('lithologyType must be a string');
    const score = (LITHOLOGY_SCORES as Record<string, number>)[lithologyType];
    if (score === undefined) {
        throw new RangeError(
            `Unknown lithologyType: "${lithologyType}". Valid: ${Object.keys(LITHOLOGY_SCORES).join(', ')}`,
        );
    }
    return score;
}

/**
 * Returns vegetation protection score (higher = more protection = lower susceptibility).
 * Score de proteção vegetal (maior = mais proteção = menor susceptibilidade).
 *
 * @param {string} coverType - Key from VEGETATION_SCORES
 * @returns {number} Protection factor in [0, 1]
 */
export function vegetationProtectionScore(coverType: string): number {
    if (typeof coverType !== 'string') throw new TypeError('coverType must be a string');
    const score = (VEGETATION_SCORES as Record<string, number>)[coverType];
    if (score === undefined) {
        throw new RangeError(`Unknown coverType: "${coverType}". Valid: ${Object.keys(VEGETATION_SCORES).join(', ')}`);
    }
    return score;
}

// ---- Composite Susceptibility Index ----

/**
 * Calculates composite Landslide Susceptibility Index (LSI).
 * Índice composto de susceptibilidade a deslizamento - combinação ponderada de fatores.
 * Pesos baseados em revisão sistemática: Hungr et al. 2014 + Varnes 1984.
 *
 * @param {object} factors
 * @param {number} factors.slopeDeg        - Slope angle (degrees)
 * @param {string} factors.lithologyType   - Lithology key (see LITHOLOGY_SCORES)
 * @param {string} factors.coverType       - Land cover key (see VEGETATION_SCORES)
 * @param {number} factors.rainfallMmDay   - Design/triggering rainfall (mm/day)
 * @param {Record<string, number>} [weights] - Optional weight override (must sum to 1)
 * @returns {{ lsi: number, classification: string, factorScores: object }}
 */
export function calculateLSI(
    factors: {
        slopeDeg: number;
        lithologyType: string;
        coverType: string;
        rainfallMmDay: number;
    },
    weights: Record<string, number> = {},
): { lsi: number; classification: string; factorScores: Record<string, number> } {
    if (typeof factors !== 'object' || factors === null) throw new TypeError('factors must be an object');

    const slopeScore = slopeSusceptibilityScore(factors.slopeDeg);
    const lithoScore = lithologySusceptibilityScore(factors.lithologyType);
    const vegScore = vegetationProtectionScore(factors.coverType);
    const rainScore =
        typeof factors.rainfallMmDay === 'number' && factors.rainfallMmDay >= 0
            ? lookupScore(factors.rainfallMmDay, RAINFALL_THRESHOLDS)
            : (() => {
                  throw new RangeError('rainfallMmDay must be a non-negative number');
              })();

    // Vegetação protege: contribuição = (1 - vegProtection)
    const vegContrib = 1 - vegScore;

    // Pesos padrão (Varnes 1984 adaptado)
    const w = {
        slope: weights.slope ?? 0.4,
        litho: weights.litho ?? 0.25,
        veg: weights.veg ?? 0.15,
        rain: weights.rain ?? 0.2,
    };

    const wSum = w.slope + w.litho + w.veg + w.rain;
    if (Math.abs(wSum - 1) > 0.01) throw new RangeError(`Weights must sum to 1.0 (got ${wSum})`);

    const lsi = slopeScore * w.slope + lithoScore * w.litho + vegContrib * w.veg + rainScore * w.rain;

    const cls =
        SUSCEPTIBILITY_CLASSES.find((c) => lsi < c.max) ?? SUSCEPTIBILITY_CLASSES[SUSCEPTIBILITY_CLASSES.length - 1]!;

    return {
        lsi,
        classification: cls.label,
        factorScores: {
            slope: slopeScore,
            litho: lithoScore,
            vegetation: vegContrib, // as susceptibility contribution
            rainfall: rainScore,
        },
    };
}

// ---- Historical frequency analysis ----

/**
 * Analyses historical landslide event frequency and estimates return period.
 * Analisa frequência histórica de deslizamentos e estima período de retorno.
 *
 * @param {number[]} yearlyEventCounts - Array with number of events per year (>=1 year)
 * @returns {{ meanEventsPerYear: number, returnPeriod_years: number, exceedanceProbability_10yr: number }}
 */
export function analyseHistoricalFrequency(yearlyEventCounts: number[]): {
    meanEventsPerYear: number;
    returnPeriod_years: number;
    exceedanceProbability_10yr: number;
} {
    if (!Array.isArray(yearlyEventCounts) || yearlyEventCounts.length === 0) {
        throw new TypeError('yearlyEventCounts must be a non-empty array');
    }
    for (const v of yearlyEventCounts) {
        if (typeof v !== 'number' || v < 0) throw new RangeError('All event counts must be non-negative numbers');
    }

    const n = yearlyEventCounts.length;
    const total = yearlyEventCounts.reduce((s, v) => s + v, 0);
    const meanEventsPerYear = total / n;

    // Período de retorno (anos) de pelo menos 1 evento: T = 1 / P(X>=1)
    // P(X>=1) ~ lambda por ano se Poisson (aproximação)
    const lambda = meanEventsPerYear;
    const probAtLeastOne = lambda > 0 ? 1 - Math.exp(-lambda) : 0;
    const returnPeriod_years = probAtLeastOne > 0 ? 1 / probAtLeastOne : Infinity;

    // Probabilidade de ≥1 evento em 10 anos (fórmula Poisson)
    const exceedanceProbability_10yr = lambda > 0 ? 1 - Math.exp(-lambda * 10) : 0;

    return { meanEventsPerYear, returnPeriod_years, exceedanceProbability_10yr };
}

// ---- Life risk per landslide ----

/**
 * Estimates number of lives at risk from a landslide event.
 * Estima número de pessoas em risco em evento de deslizamento.
 *
 * @param {number} area_km2          - Exposed area (km²)
 * @param {number} populationDensity - Population density (persons/km²)
 * @param {number} lsi               - Landslide Susceptibility Index (0–1)
 * @param {number} [temporalFactor]  - Fraction of population present (0–1, default 0.7 = daytime)
 * @returns {{ exposedPopulation: number, livesAtRisk: number }}
 */
export function estimateLivesAtRisk(
    area_km2: number,
    populationDensity: number,
    lsi: number,
    temporalFactor: number = 0.7,
): { exposedPopulation: number; livesAtRisk: number } {
    if (typeof area_km2 !== 'number' || typeof populationDensity !== 'number' || typeof lsi !== 'number') {
        throw new TypeError('area_km2, populationDensity, and lsi must be numbers');
    }
    if (area_km2 <= 0) throw new RangeError('area_km2 must be > 0');
    if (populationDensity < 0) throw new RangeError('populationDensity must be >= 0');
    if (lsi < 0 || lsi > 1) throw new RangeError('lsi must be in [0, 1]');
    if (temporalFactor < 0 || temporalFactor > 1) throw new RangeError('temporalFactor must be in [0, 1]');

    const exposedPopulation = area_km2 * populationDensity * temporalFactor;
    // Risco de vida = população exposta × LSI (como probabilidade aproximada de alcance)
    const livesAtRisk = exposedPopulation * lsi;

    return { exposedPopulation, livesAtRisk };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const landslideSusceptibilityModelMeta: AnalyticsModuleMeta = {
    name: 'landslideSusceptibilityModel',
    description: 'landslideSusceptibilityModel',
    category: 'analytics',
    familyTags: ['landslide'],
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
