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
 * @module atmosphericDepositAcidification
 * @description Atmospheric acid deposition - dry/wet deposition fluxes and
 * critical load exceedance classification using the Steady-State Mass Balance
 * (SSMB) method.
 *
 * References:
 * - Fowler, D. et al. (2009). Atmospheric composition change: Ecosystems-Atmosphere
 *   interactions. Atmos. Environ. 43(33):5193-5267.
 *   DOI: 10.1016/j.atmosenv.2009.07.068
 * - UNECE (1996). Manual on Methodologies and Criteria for Mapping Critical Levels
 *   and Critical Loads. Federal Environment Agency (UBA), Berlin.
 * - De Vries, W. (1991). Methodologies for the assessment and mapping of critical
 *   loads and of the impact of abatement strategies on forest soils.
 *   Wageningen, DLO Winand Staring Centre. Report 46.
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
 * Calculate dry deposition flux of a pollutant.
 *
 * F_dry = C × v_d    (Fowler et al. 2009, eq. 1)
 *
 * @param concentration_ug_m3    - Ambient concentration (µg/m³), ≥0
 * @param depositionVelocity_m_s - Deposition velocity v_d (m/s), ≥0
 */
export function calcDryDeposition(
    concentration_ug_m3: number,
    depositionVelocity_m_s: number,
): { flux_mg_m2_s: number } {
    if (concentration_ug_m3 < 0) {
        throw new RangeError('Concentration must be non-negative (µg/m³).');
    }
    if (depositionVelocity_m_s < 0) {
        throw new RangeError('Deposition velocity must be non-negative (m/s).');
    }
    // µg/m³ × m/s = µg/m²/s → convert to mg/m²/s
    const flux_mg_m2_s = (concentration_ug_m3 * depositionVelocity_m_s) / 1000;
    return { flux_mg_m2_s };
}

/**
 * Calculate wet deposition flux (bulk precipitation scavenging).
 *
 * F_wet = P × C_rain   (annual bulk deposition)
 *
 * @param precipRate_mm_yr    - Annual precipitation (mm/yr), ≥0
 * @param concentration_mg_L  - Mean pollutant concentration in rain (mg/L), ≥0
 */
export function calcWetDeposition(
    precipRate_mm_yr: number,
    concentration_mg_L: number,
): { flux_kg_ha_yr: number } {
    if (precipRate_mm_yr < 0) {
        throw new RangeError('Precipitation rate must be non-negative (mm/yr).');
    }
    if (concentration_mg_L < 0) {
        throw new RangeError('Rain concentration must be non-negative (mg/L).');
    }
    // P (mm/yr) = P (L/m²/yr)
    // F = P (L/m²/yr) × C (mg/L) = mg/m²/yr
    // 1 mg/m²/yr × 10 = 0.01 kg/ha/yr → conversion factor: 1e-2
    const flux_kg_ha_yr = precipRate_mm_yr * concentration_mg_L * 1e-2;
    return { flux_kg_ha_yr };
}

/**
 * Calculate critical acid load using the Steady-State Mass Balance (SSMB) method.
 *
 * CL(A) = BC_w − BC_u − BC_l + ANC_le(crit)
 * Simplified form (UNECE 1996): CL = weathering − uptake − leaching
 *
 * All inputs in meq/m²/yr (milliequivalents per m² per year).
 *
 * @param baseWeathering - Base cation weathering rate (meq/m²/yr), ≥0
 * @param uptake         - Net base cation uptake by biomass (meq/m²/yr), ≥0
 * @param leaching       - Critical leaching flux ANC_le(crit) (meq/m²/yr), ≥0
 */
export function calcCriticalLoad(
    baseWeathering: number,
    uptake: number,
    leaching: number,
): { criticalLoad_meq_m2_yr: number } {
    if (baseWeathering < 0 || uptake < 0 || leaching < 0) {
        throw new RangeError('Weathering, uptake and leaching must be non-negative (meq/m²/yr).');
    }
    const criticalLoad_meq_m2_yr = baseWeathering - uptake - leaching;
    return { criticalLoad_meq_m2_yr };
}

/**
 * Classify acidification risk from exceedance of critical acid load.
 *
 * Exceedance = actual acid deposition − critical load.
 * Negative exceedance = no exceedance (deposition below critical load).
 *
 * Thresholds adapted from: Hettelingh et al. (1991) critical loads database.
 *
 * @param exceedance_meq_m2_yr - Acid load exceedance (meq/m²/yr)
 */
export function classifyAcidificationRisk(exceedance_meq_m2_yr: number): {
    riskClass: 'no_exceedance' | 'low' | 'moderate' | 'high';
} {
    if (typeof exceedance_meq_m2_yr !== 'number' || Number.isNaN(exceedance_meq_m2_yr)) {
        throw new TypeError('Exceedance must be a number (meq/m²/yr).');
    }
    let riskClass: 'no_exceedance' | 'low' | 'moderate' | 'high';
    if (exceedance_meq_m2_yr <= 0) {
        riskClass = 'no_exceedance';
    } else if (exceedance_meq_m2_yr <= 200) {
        riskClass = 'low';
    } else if (exceedance_meq_m2_yr <= 1000) {
        riskClass = 'moderate';
    } else {
        riskClass = 'high';
    }
    return { riskClass };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const atmosphericDepositAcidificationMeta: AnalyticsModuleMeta = {
    name: 'atmosphericDepositAcidification',
    description: 'atmosphericDepositAcidification',
    category: 'analytics',
    familyTags: ['atmosphere'],
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
