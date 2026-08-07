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
 * Irrigation Water Quality Index
 * Implements FAO (1985) irrigation water quality guidelines and the
 * USDA Riverside classification system.
 *
 * References:
 *   - FAO (1985) Water quality for agriculture. Irrigation and Drainage Paper 29.
 *     Ayers & Westcot. ISBN 92-5-102263-1.
 *   - Richards (1954) Diagnosis and improvement of saline and alkali soils.
 *     USDA Agriculture Handbook 60. USDA Riverside Laboratory.
 *   - Suarez (1981) Relation between pHc and sodium adsorption ratio (SAR) and an
 *     alternative method of estimating SAR of soil or drainage water.
 *     Soil Sci. Soc. Am. J. 45:469-475.
 *
 * @module irrigationWaterQualityIndex
 */

'use strict';

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

/**
 * Calculates the Sodium Adsorption Ratio (SAR) per FAO (1985) standard.
 *
 * SAR = Na / sqrt((Ca + Mg) / 2)
 *
 * All concentrations in meq/L (milliequivalents per litre).
 *
 * @param Na_meq_L  Sodium concentration (meq/L)
 * @param Ca_meq_L  Calcium concentration (meq/L)
 * @param Mg_meq_L  Magnesium concentration (meq/L)
 * @returns SAR (dimensionless, but conventional unit (meq/L)^0.5)
 */
export function calcSAR(Na_meq_L: number, Ca_meq_L: number, Mg_meq_L: number): number {
    if ([Na_meq_L, Ca_meq_L, Mg_meq_L].some((v) => typeof v !== 'number' || isNaN(v))) {
        throw new TypeError('Na, Ca, Mg must be finite numbers');
    }
    if (Na_meq_L < 0) throw new RangeError('Na_meq_L must be >= 0');
    if (Ca_meq_L < 0) throw new RangeError('Ca_meq_L must be >= 0');
    if (Mg_meq_L < 0) throw new RangeError('Mg_meq_L must be >= 0');
    const sum = Ca_meq_L + Mg_meq_L;
    if (sum === 0) throw new RangeError('Ca + Mg must be > 0 to avoid division by zero');
    return Na_meq_L / Math.sqrt(sum / 2);
}

/**
 * Calculates the Adjusted SAR (SARaj) per Suarez (1981) corrected for
 * bicarbonate and calcium equilibrium effects.
 *
 * SARaj = SAR × (1 + (8.4 - pHc))
 * where pHc is estimated from EC, HCO3, and Ca via Suarez (1981) tables.
 *
 * Simplified pHc approximation:
 *   pHc ≈ (pK2 - pKc) + p(Ca + Mg) + p(alkalinity)
 * For practical field use, pHc ≈ 8.0 - 0.025 × EC_dS_m (linear approx.)
 *
 * @param SAR       Sodium Adsorption Ratio from calcSAR
 * @param EC_dS_m   Electrical conductivity (dS/m)
 * @param HCO3      Bicarbonate concentration (meq/L)
 * @param Ca        Calcium concentration (meq/L)
 * @returns Adjusted SAR (SARaj)
 */
export function calcAdjustedSAR(SAR: number, EC_dS_m: number, HCO3: number, Ca: number): number {
    if ([SAR, EC_dS_m, HCO3, Ca].some((v) => typeof v !== 'number' || isNaN(v))) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (SAR < 0) throw new RangeError('SAR must be >= 0');
    if (EC_dS_m <= 0) throw new RangeError('EC_dS_m must be > 0');
    if (HCO3 < 0) throw new RangeError('HCO3 must be >= 0');
    if (Ca <= 0) throw new RangeError('Ca must be > 0');

    // pHc estimate: Suarez (1981) linear approximation for field calculations
    // pHc = 8.0 − 0.025 × EC is a first-order simplification; accurate models
    // require activity coefficients and solubility products for calcite/gypsum.
    const pHc = Math.max(6.5, 8.0 - 0.025 * EC_dS_m);
    // HCO3/Ca ratio adjustment (Suarez correction term)
    const bicarbonateFactor = HCO3 > 0 && Ca > 0 ? Math.log10(HCO3 / Ca) * 0.5 : 0;
    const pHcAdj = pHc - bicarbonateFactor;
    return SAR * (1 + (8.4 - pHcAdj));
}

// ---------------------------------------------------------------------------
// USDA Riverside (Richards 1954) classification thresholds
// Salinity hazard  → EC in dS/m
// Alkalinity hazard → SAR
// ---------------------------------------------------------------------------

const SALINITY_CLASSES = [
    { max: 0.25, label: 'C1', hazard: 'low' },
    { max: 0.75, label: 'C2', hazard: 'medium' },
    { max: 2.25, label: 'C3', hazard: 'high' },
    { max: Infinity, label: 'C4', hazard: 'very_high' },
];

const ALKALINITY_CLASSES = [
    { max: 10, label: 'S1', hazard: 'low' },
    { max: 18, label: 'S2', hazard: 'medium' },
    { max: 26, label: 'S3', hazard: 'high' },
    { max: Infinity, label: 'S4', hazard: 'very_high' },
];

/**
 * Classifies irrigation water quality per the USDA Riverside system
 * (Richards 1954), using EC and SAR.
 *
 * @param EC_dS_m  Electrical conductivity (dS/m)
 * @param SAR      Sodium Adsorption Ratio
 */
export function classifyIrrigationWater(
    EC_dS_m: number,
    SAR: number,
): { salinityClass: string; salinityHazard: string; alkalinityClass: string; alkalinityHazard: string } {
    if (typeof EC_dS_m !== 'number' || isNaN(EC_dS_m) || EC_dS_m < 0) {
        throw new RangeError('EC_dS_m must be a non-negative number');
    }
    if (typeof SAR !== 'number' || isNaN(SAR) || SAR < 0) {
        throw new RangeError('SAR must be a non-negative number');
    }

    const sal = SALINITY_CLASSES.find((c) => EC_dS_m <= c.max) ?? SALINITY_CLASSES[SALINITY_CLASSES.length - 1]!;
    const alk = ALKALINITY_CLASSES.find((c) => SAR <= c.max) ?? ALKALINITY_CLASSES[ALKALINITY_CLASSES.length - 1]!;

    return {
        salinityClass: sal.label,
        salinityHazard: sal.hazard,
        alkalinityClass: alk.label,
        alkalinityHazard: alk.hazard,
    };
}

/**
 * Calculates Sodium Percentage (SP) - a legacy irrigation water quality index
 * relating sodium to total cations, widely used in older Brazilian and FAO references.
 *
 * SP = (Na / (Ca + Mg + Na + K)) × 100
 *
 * All concentrations in meq/L.
 *
 * @param Na  Sodium (meq/L)
 * @param Ca  Calcium (meq/L)
 * @param Mg  Magnesium (meq/L)
 * @param K   Potassium (meq/L)
 * @returns Sodium percentage (%)
 */
export function calcSodiumPercentage(Na: number, Ca: number, Mg: number, K: number): number {
    if ([Na, Ca, Mg, K].some((v) => typeof v !== 'number' || isNaN(v) || v < 0)) {
        throw new RangeError('All ion concentrations must be non-negative numbers');
    }
    const total = Na + Ca + Mg + K;
    if (total === 0) throw new RangeError('Total cation sum must be > 0');
    return (Na / total) * 100;
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const irrigationWaterQualityIndexMeta: AnalyticsModuleMeta = {
    name: 'irrigationWaterQualityIndex',
    description: 'irrigationWaterQualityIndex',
    category: 'analytics',
    familyTags: ['water', 'agriculture'],
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
