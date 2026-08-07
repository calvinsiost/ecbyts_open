// @ts-check
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
 * Soil Salinity Risk Index
 * Soil salinization assessment using SAR, ESP, and USDA classification.
 *
 * References:
 *   Richards, L.A. (Ed.) (1954). Diagnosis and Improvement of Saline and Alkali Soils.
 *     USDA Agriculture Handbook No. 60. U.S. Salinity Laboratory, Riverside, CA.
 *   Sposito, G. (1989). The Chemistry of Soils. Oxford University Press, New York.
 */

'use strict';

/**
 * Calculates the Sodium Adsorption Ratio (SAR).
 * SAR = Na / sqrt((Ca + Mg) / 2)
 * All concentrations in mmol/L (= mmol_c/L for monovalent Na).
 *
 * @param {number} Na  - Sodium concentration (mmol/L)
 * @param {number} Ca  - Calcium concentration (mmol/L)
 * @param {number} Mg  - Magnesium concentration (mmol/L)
 * @returns {number} SAR value (mmol/L)^0.5
 *
 * Reference: Richards (1954) USDA Handbook 60, p. 18, eq. 3.
 */
export function calcSAR(Na: any, Ca: any, Mg: any) {
    if (typeof Na !== 'number' || typeof Ca !== 'number' || typeof Mg !== 'number') {
        throw new TypeError('calcSAR: Na, Ca, Mg must be numbers');
    }
    if (Na < 0 || Ca < 0 || Mg < 0) {
        throw new RangeError('calcSAR: concentrations must be non-negative');
    }
    const denom = (Ca + Mg) / 2;
    if (denom <= 0) {
        throw new RangeError('calcSAR: sum of Ca + Mg must be > 0');
    }
    return Na / Math.sqrt(denom);
}

/**
 * Calculates the Exchangeable Sodium Percentage (ESP) from SAR.
 * ESP = (100 × (0.0126 + 0.01475 × SAR)) / (1 + (0.0126 + 0.01475 × SAR))
 *
 * This is the empirical relationship derived by Sposito (1989) from US Salinity Lab data,
 * equivalent to the original Richards (1954) regression.
 *
 * @param {number} SAR - Sodium Adsorption Ratio (mmol/L)^0.5
 * @returns {number} ESP (%)
 *
 * Reference: Sposito (1989) The Chemistry of Soils, p. 164.
 */
export function calcESP(SAR: any) {
    if (typeof SAR !== 'number') {
        throw new TypeError('calcESP: SAR must be a number');
    }
    if (SAR < 0) {
        throw new RangeError('calcESP: SAR must be non-negative');
    }
    const intermediate = 0.0126 + 0.01475 * SAR;
    return (100 * intermediate) / (1 + intermediate);
}

/**
 * Classifies soil salinity based on electrical conductivity (EC).
 * USDA four-class system extended to five classes per Richards (1954).
 *
 * Class boundaries (EC in dS/m at 25°C):
 *   < 2      non-saline       (negligible salinity effects)
 *   2 – 4    slightly saline  (yields of sensitive crops may be restricted)
 *   4 – 8    moderately saline (yields of many crops restricted)
 *   8 – 16   strongly saline  (only tolerant crops yield satisfactorily)
 *   > 16     extremely saline (only very tolerant crops survive)
 *
 * @param {number} EC_dS_m - Electrical conductivity of saturation extract (dS/m)
 * @returns {'non-saline'|'slightly'|'moderately'|'strongly'|'extremely'} salinity class
 *
 * Reference: Richards (1954) USDA Handbook 60, Table 1, p. 4.
 */
export function classifySoilSalinity(EC_dS_m: any) {
    if (typeof EC_dS_m !== 'number') {
        throw new TypeError('classifySoilSalinity: EC_dS_m must be a number');
    }
    if (EC_dS_m < 0) {
        throw new RangeError('classifySoilSalinity: EC_dS_m must be non-negative');
    }
    if (EC_dS_m < 2) return 'non-saline';
    if (EC_dS_m < 4) return 'slightly';
    if (EC_dS_m < 8) return 'moderately';
    if (EC_dS_m < 16) return 'strongly';
    return 'extremely';
}

/**
 * Calculates the Leaching Requirement (LR) for salinity control.
 * LR = EC_iw / (5 × EC_dw - EC_iw)
 *
 * LR is the minimum fraction of infiltrated water that must pass through
 * the root zone to prevent salt accumulation beyond the threshold EC_dw.
 *
 * @param {number} EC_iw - EC of irrigation water (dS/m)
 * @param {number} EC_dw - EC of drainage water threshold (dS/m); typically 2× crop tolerance
 * @returns {number} Leaching Requirement (dimensionless fraction, 0–1)
 *
 * Reference: Richards (1954) USDA Handbook 60, p. 60, eq. 10.
 */
export function calcLeachingRequirement(EC_iw: any, EC_dw: any) {
    if (typeof EC_iw !== 'number' || typeof EC_dw !== 'number') {
        throw new TypeError('calcLeachingRequirement: EC_iw and EC_dw must be numbers');
    }
    if (EC_iw <= 0) {
        throw new RangeError('calcLeachingRequirement: EC_iw must be > 0');
    }
    if (EC_dw <= 0) {
        throw new RangeError('calcLeachingRequirement: EC_dw must be > 0');
    }
    const denom = 5 * EC_dw - EC_iw;
    if (denom <= 0) {
        // Irrigation water already exceeds threshold - full leaching (LR = 1)
        return 1;
    }
    return Math.min(1, EC_iw / denom);
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilSalinityRiskIndexMeta = {
    name: 'soilSalinityRiskIndex',
    description: 'soilSalinityRiskIndex',
    category: 'analytics',
    familyTags: ['soil', 'risk', 'hydrocarbon'],
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
