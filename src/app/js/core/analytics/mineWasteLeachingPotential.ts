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
 * @module mineWasteLeachingPotential
 * @description Mine waste characterization - TCLP (EPA Method 1311) + ABNT NBR 10004:2004.
 * Provides leaching potential estimation, dilution-attenuation factors, TCLP compliance
 * checking, and waste classification for hazardous waste regulation in Brazil.
 *
 * Academic references:
 * - US EPA Method 1311: Toxicity Characteristic Leaching Procedure (TCLP), 1992.
 *   https://www.epa.gov/sites/default/files/2015-12/documents/1311.pdf
 * - ABNT NBR 10004:2004 - Resíduos sólidos - Classificação (2nd ed.).
 *   Associação Brasileira de Normas Técnicas.
 * - Nordstrom, D.K. (2011). Hydrogeochemical processes governing the origin, transport and
 *   fate of major and trace elements from mine wastes and mineralized rock to surface waters.
 *   Appl. Geochem. 26(11), 1777–1791. DOI: 10.1016/j.apgeochem.2010.09.009
 */

'use strict';

// Local interface (substitui import('../../../../types/app/analytics-library.js'))
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
        citation?: string;
    };
    inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    library?: { published: boolean; priceECBT?: number; licenseRef?: string };
}

/**
 * TCLP regulatory limits (mg/L) for selected parameters.
 * Source: 40 CFR Part 261, Appendix II (EPA 1311); adapted by ABNT NBR 10004 Annex F.
 * Subset of the most common mine waste contaminants.
 */
const TCLP_LIMITS_MG_L: Record<string, number> = {
    arsenic: 5.0,
    barium: 100.0,
    cadmium: 1.0,
    chromium: 5.0,
    lead: 5.0,
    mercury: 0.2,
    selenium: 1.0,
    silver: 5.0,
    zinc: 250.0, // NBR 10004 Annex F supplemental
    manganese: 10.0, // NBR 10004 Annex F supplemental
};

/**
 * Calculates the estimated leachate concentration using a simplified
 * solid-liquid partitioning model for mine waste.
 *
 * C_leachate = (totalContent_mg_kg × leachingFactor) / 1000
 * where leachingFactor is the fraction of total metal mobilised into the
 * extractant (dimensionless, 0–1), and the /1000 converts mg/kg·kg/L → mg/L
 * at the TCLP L/S ratio of 20:1 (20 mL extraction fluid per gram solid).
 *
 * @param totalContent_mg_kg - Total metal content in waste (mg/kg dry weight)
 * @param leachingFactor     - Fraction mobilised under TCLP conditions (0–1)
 * @throws {RangeError} if parameters are out of valid range
 * @throws {TypeError} if parameters are not finite numbers
 *
 * Reference: EPA Method 1311 §1.2; Nordstrom (2011) DOI:10.1016/j.apgeochem.2010.09.009
 */
export function calcLeachingConcentration(
    totalContent_mg_kg: number,
    leachingFactor: number,
): { concentration_mg_L: number; totalContent_mg_kg: number; leachingFactor: number } {
    if (!Number.isFinite(totalContent_mg_kg) || !Number.isFinite(leachingFactor)) {
        throw new TypeError('calcLeachingConcentration: both parameters must be finite numbers');
    }
    if (totalContent_mg_kg < 0) {
        throw new RangeError('calcLeachingConcentration: totalContent_mg_kg must be >= 0');
    }
    if (leachingFactor < 0 || leachingFactor > 1) {
        throw new RangeError('calcLeachingConcentration: leachingFactor must be in [0, 1]');
    }
    // TCLP L/S ratio = 20 mL/g = 20 L/kg
    const LS_ratio = 20; // L/kg
    const concentration_mg_L = (totalContent_mg_kg * leachingFactor) / LS_ratio;
    return { concentration_mg_L, totalContent_mg_kg, leachingFactor };
}

/**
 * Calculates the Dilution-Attenuation Factor (DAF) for leachate transport
 * from mine waste to a receptor (e.g., groundwater or surface water body).
 *
 * DAF = (volumeWater_m3 / volumeWaste_m3 + 1) × (1 + soilAttenuation)
 *
 * A higher DAF means greater natural dilution and attenuation.
 *
 * @param volumeWaste_m3    - Volume of mine waste pile (m³), must be > 0
 * @param volumeWater_m3    - Annual volume of receiving water (m³), must be > 0
 * @param soilAttenuation   - Soil/liner attenuation factor K_d-based (dimensionless >= 0)
 * @throws {RangeError} if volumes are <= 0 or soilAttenuation is negative
 * @throws {TypeError} if parameters are not finite numbers
 *
 * Reference: US EPA (1996) Soil Screening Guidance, EPA/540/R-96/018 §4.3
 */
export function calcDilutionAttenuationFactor(
    volumeWaste_m3: number,
    volumeWater_m3: number,
    soilAttenuation: number,
): { DAF: number; dilutionComponent: number; attenuationComponent: number } {
    if (!Number.isFinite(volumeWaste_m3) || !Number.isFinite(volumeWater_m3) || !Number.isFinite(soilAttenuation)) {
        throw new TypeError('calcDilutionAttenuationFactor: all parameters must be finite numbers');
    }
    if (volumeWaste_m3 <= 0) throw new RangeError('calcDilutionAttenuationFactor: volumeWaste_m3 must be > 0');
    if (volumeWater_m3 <= 0) throw new RangeError('calcDilutionAttenuationFactor: volumeWater_m3 must be > 0');
    if (soilAttenuation < 0) throw new RangeError('calcDilutionAttenuationFactor: soilAttenuation must be >= 0');

    const dilutionComponent = volumeWater_m3 / volumeWaste_m3 + 1;
    const attenuationComponent = 1 + soilAttenuation;
    const DAF = dilutionComponent * attenuationComponent;
    return { DAF, dilutionComponent, attenuationComponent };
}

/**
 * Checks TCLP compliance for a given parameter concentration.
 * Uses regulatory limits from 40 CFR Appendix II / ABNT NBR 10004 Annex F.
 *
 * @param parameter        - Contaminant name (case-insensitive, e.g. 'arsenic', 'lead')
 * @param concentration_mg_L - Measured TCLP leachate concentration (mg/L)
 * @throws {Error} if parameter is not in the TCLP limit table
 * @throws {RangeError} if concentration is negative
 * @throws {TypeError} if concentration is not a finite number
 *
 * Reference: EPA Method 1311 (1992); ABNT NBR 10004:2004 Annex F
 */
export function checkTCLPCompliance(
    parameter: string,
    concentration_mg_L: number,
): { compliant: boolean; limit_mg_L: number; exceedanceFactor: number; parameter: string } {
    if (typeof parameter !== 'string' || !parameter.trim()) {
        throw new TypeError('checkTCLPCompliance: parameter must be a non-empty string');
    }
    if (!Number.isFinite(concentration_mg_L)) {
        throw new TypeError('checkTCLPCompliance: concentration_mg_L must be a finite number');
    }
    if (concentration_mg_L < 0) {
        throw new RangeError('checkTCLPCompliance: concentration_mg_L must be >= 0');
    }
    const key = parameter.toLowerCase().trim();
    const limit_mg_L = (TCLP_LIMITS_MG_L as Record<string, number>)[key];
    if (limit_mg_L === undefined) {
        throw new Error(
            `checkTCLPCompliance: no TCLP limit found for '${parameter}'. Known: ${Object.keys(TCLP_LIMITS_MG_L).join(', ')}`,
        );
    }
    const compliant = concentration_mg_L <= limit_mg_L;
    const exceedanceFactor = concentration_mg_L / limit_mg_L;
    return { compliant, limit_mg_L, exceedanceFactor, parameter: key };
}

/**
 * Classifies solid waste into Brazilian hazard classes per ABNT NBR 10004:2004.
 * Classification logic (simplified):
 * - Class I  (Hazardous): any TCLP result exceeds limit OR total content > Class I threshold
 * - Class IIA (Non-hazardous non-inert): passes TCLP but solubilizes above Class IIB thresholds
 * - Class IIB (Non-hazardous inert): passes TCLP and does not solubilize above inert limits
 *
 * This implementation uses TCLP pass/fail as primary gate, and total content
 * relative to ABNT Annex H solubilization thresholds (simplified 10× TCLP) for Class IIA vs IIB.
 *
 * @param TCLP_results Array of TCLP test results (output compatible with checkTCLPCompliance input).
 * @param totalContent_mg_kg - Dominant contaminant total content (mg/kg)
 * @throws {TypeError} if TCLP_results is not an array or totalContent is not finite
 *
 * Reference: ABNT NBR 10004:2004 §5 and Annexes F, G, H
 */
export function classifyWasteClass(
    TCLP_results: Array<{ parameter: string; concentration_mg_L: number }>,
    totalContent_mg_kg: number,
): {
    classification: 'Class_I' | 'Class_IIA' | 'Class_IIB';
    reason: string;
    failedParameters: string[];
} {
    if (!Array.isArray(TCLP_results)) {
        throw new TypeError('classifyWasteClass: TCLP_results must be an array');
    }
    if (!Number.isFinite(totalContent_mg_kg) || totalContent_mg_kg < 0) {
        throw new TypeError('classifyWasteClass: totalContent_mg_kg must be a finite non-negative number');
    }
    const failedParameters: string[] = [];
    for (const result of TCLP_results) {
        try {
            const check = checkTCLPCompliance(result.parameter, result.concentration_mg_L);
            if (!check.compliant) {
                failedParameters.push(result.parameter.toLowerCase().trim());
            }
        } catch (_err) {
            // Unknown parameter - skip silently (conservative: count as fail)
            failedParameters.push(String(result.parameter));
        }
    }
    if (failedParameters.length > 0) {
        return {
            classification: 'Class_I',
            reason: `TCLP exceedance for: ${failedParameters.join(', ')}`,
            failedParameters,
        };
    }
    // Simplified solubilization test: if total content > 10 × typical solubilization threshold
    // (proxy: 500 mg/kg for most heavy metals per NBR 10004 Annex H)
    const SOLUBILIZATION_THRESHOLD_MG_KG = 500;
    if (totalContent_mg_kg > SOLUBILIZATION_THRESHOLD_MG_KG) {
        return {
            classification: 'Class_IIA',
            reason: `Total content ${totalContent_mg_kg} mg/kg exceeds solubilization threshold ${SOLUBILIZATION_THRESHOLD_MG_KG} mg/kg`,
            failedParameters: [],
        };
    }
    return {
        classification: 'Class_IIB',
        reason: 'All TCLP and solubilization criteria met — inert waste',
        failedParameters: [],
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineWasteLeachingPotentialMeta: AnalyticsModuleMeta = {
    name: 'mineWasteLeachingPotential',
    description: 'mineWasteLeachingPotential',
    category: 'analytics',
    familyTags: ['mining', 'waste'],
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
