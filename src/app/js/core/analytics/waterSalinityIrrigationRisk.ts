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
 * @fileoverview Water Salinity Irrigation Risk - Pure scientific analytics module.
 *
 * Implements FAO Irrigation and Drainage Paper No. 29 (Ayers & Westcot, 1985),
 * Richards (1954) USSL Handbook, and Wilcox (1955) salinity classification
 * for evaluating suitability of water for irrigation.
 *
 * Academic references:
 * - Ayers, R.S. & Westcot, D.W. (1985). Water Quality for Agriculture. FAO Irrigation
 *   and Drainage Paper 29 (Rev. 1). ISBN 92-5-102263-1.
 * - Richards, L.A. (Ed.) (1954). Diagnosis and Improvement of Saline and Alkali Soils.
 *   USDA Agriculture Handbook No. 60. US Salinity Laboratory, Riverside, CA.
 * - Wilcox, L.V. (1955). Classification and Use of Irrigation Waters. USDA Circular 969.
 * - Rhoades, J.D. & Loveday, J. (1990). Salinity in irrigated agriculture. In: Irrigation
 *   of Agricultural Crops. ASA-CSSA-SSSA, Madison, WI.
 *
 * Zero DOM/IDB/Three.js/fetch dependencies.
 * @module waterSalinityIrrigationRisk
 */

// ---------------------------------------------------------------------------
// Sodium Adsorption Ratio (SAR)
// Razao de adsorcao de sodio (Richards 1954, USSL Handbook)
// ---------------------------------------------------------------------------

/**
 * Calculate Sodium Adsorption Ratio (SAR) for irrigation water.
 * Calcula a Razao de Adsorcao de Sodio (RAS ou SAR) da agua de irrigacao.
 *
 * SAR = [Na⁺] / sqrt(([Ca²⁺] + [Mg²⁺]) / 2)
 *
 * Where ion concentrations are in meq/L (milliequivalents per litre).
 * Conversion: meq/L = (mg/L) / (atomic_weight / valence)
 *   Na⁺: divide mg/L by 23   (AW=23, z=1)
 *   Ca²⁺: divide mg/L by 20  (AW=40, z=2 → AW/z=20)
 *   Mg²⁺: divide mg/L by 12.15 (AW=24.3, z=2 → AW/z=12.15)
 *
 * Reference: Richards (1954) pp. 85-88; Ayers & Westcot (1985) §3.3
 *
 * @param {number} Na_meqL - Sodium concentration (meq/L), >= 0
 * @param {number} Ca_meqL - Calcium concentration (meq/L), >= 0
 * @param {number} Mg_meqL - Magnesium concentration (meq/L), >= 0
 * @returns {{ SAR: number, sodiumHazardClass: string }}
 * @throws {RangeError} if any concentration is negative
 * @throws {TypeError} if inputs are not finite numbers
 * @throws {RangeError} if Ca + Mg denominator is zero (cannot compute SAR)
 */
export function calculateSAR(Na_meqL: any, Ca_meqL: any, Mg_meqL: any) {
    for (const [k, v] of [
        ['Na_meqL', Na_meqL],
        ['Ca_meqL', Ca_meqL],
        ['Mg_meqL', Mg_meqL],
    ]) {
        if (typeof v !== 'number' || !isFinite(v)) {
            throw new TypeError(`calculateSAR: '${k}' must be a finite number`);
        }
        if (v < 0) {
            throw new RangeError(`calculateSAR: '${k}' must be >= 0`);
        }
    }

    const denominator = (Ca_meqL + Mg_meqL) / 2;
    if (denominator <= 0) {
        throw new RangeError('calculateSAR: Ca²⁺ + Mg²⁺ must be > 0 (cannot compute SAR)');
    }

    // Formula SAR - Richards 1954 eq. (26)
    const SAR = Na_meqL / Math.sqrt(denominator);

    // Classificacao de risco de sodio (USSL 1954 Figura 1):
    // S1 < 10, S2 10-18, S3 18-26, S4 > 26
    let sodiumHazardClass;
    if (SAR < 10) sodiumHazardClass = 'S1-Low';
    else if (SAR < 18) sodiumHazardClass = 'S2-Medium';
    else if (SAR < 26) sodiumHazardClass = 'S3-High';
    else sodiumHazardClass = 'S4-Very_High';

    return { SAR, sodiumHazardClass };
}

// ---------------------------------------------------------------------------
// Wilcox Classification
// Indice e classificacao de Wilcox (Wilcox 1955)
// ---------------------------------------------------------------------------

/**
 * Classify irrigation water quality by Wilcox diagram (conductivity × SAR).
 * Classifica a qualidade da agua de irrigacao pelo diagrama de Wilcox.
 *
 * Combined class is formed as "C{salinity}-S{sodium}" (e.g. "C2-S1"):
 *   Salinity class by ECw (dS/m):
 *     C1: ECw < 0.25  (Low)
 *     C2: ECw 0.25-0.75  (Medium)
 *     C3: ECw 0.75-2.25  (High)
 *     C4: ECw >= 2.25 (Very High)
 *   Sodium class by SAR:
 *     S1: SAR < 10    (Low)
 *     S2: SAR 10-18   (Medium)
 *     S3: SAR 18-26   (High)
 *     S4: SAR >= 26   (Very High)
 *
 * @param {number} ECw_dSm - Electrical conductivity of irrigation water (dS/m), >= 0
 * @param {number} SAR - Sodium Adsorption Ratio (dimensionless), >= 0
 * @returns {{ salinityClass: string, sodiumClass: string, combinedClass: string,
 *             salinityRisk: string, sodiumRisk: string, suitability: string }}
 * @throws {RangeError} if ECw or SAR is negative
 * @throws {TypeError} if inputs are not finite numbers
 */
export function classifyWilcox(ECw_dSm: any, SAR: any) {
    for (const [k, v] of [
        ['ECw_dSm', ECw_dSm],
        ['SAR', SAR],
    ]) {
        if (typeof v !== 'number' || !isFinite(v)) {
            throw new TypeError(`classifyWilcox: '${k}' must be a finite number`);
        }
        if (v < 0) throw new RangeError(`classifyWilcox: '${k}' must be >= 0`);
    }

    // Classe de salinidade por condutividade eletrica (Wilcox 1955 Figura 1)
    let salinityNum, salinityRisk;
    if (ECw_dSm < 0.25) {
        salinityNum = 1;
        salinityRisk = 'Low';
    } else if (ECw_dSm < 0.75) {
        salinityNum = 2;
        salinityRisk = 'Medium';
    } else if (ECw_dSm < 2.25) {
        salinityNum = 3;
        salinityRisk = 'High';
    } else {
        salinityNum = 4;
        salinityRisk = 'Very_High';
    }

    // Classe de sodio por SAR
    let sodiumNum, sodiumRisk;
    if (SAR < 10) {
        sodiumNum = 1;
        sodiumRisk = 'Low';
    } else if (SAR < 18) {
        sodiumNum = 2;
        sodiumRisk = 'Medium';
    } else if (SAR < 26) {
        sodiumNum = 3;
        sodiumRisk = 'High';
    } else {
        sodiumNum = 4;
        sodiumRisk = 'Very_High';
    }

    const salinityClass = `C${salinityNum}`;
    const sodiumClass = `S${sodiumNum}`;
    const combinedClass = `${salinityClass}-${sodiumClass}`;

    // Avaliacao de aptidao geral (restricao de uso)
    let suitability;
    const maxClass = Math.max(salinityNum, sodiumNum);
    if (maxClass <= 1) suitability = 'Excellent-Good';
    else if (maxClass === 2) suitability = 'Good-Permissible';
    else if (maxClass === 3) suitability = 'Doubtful';
    else suitability = 'Unsuitable';

    return { salinityClass, sodiumClass, combinedClass, salinityRisk, sodiumRisk, suitability };
}

// ---------------------------------------------------------------------------
// Leaching Requirement (LR)
// Necessidade de lixiviacao (Ayers & Westcot 1985, eq. 2)
// ---------------------------------------------------------------------------

/**
 * Calculate minimum leaching requirement to maintain root zone salinity.
 * Calcula a necessidade minima de lixiviacao para manter a salinidade na zona radicular.
 *
 * LR = ECw / (5 * ECe_max - ECw)
 *
 * Where:
 *   ECw = EC of irrigation water (dS/m)
 *   ECe_max = maximum tolerable EC of soil saturation extract (dS/m) - crop-specific
 *
 * Reference: Ayers & Westcot (1985) §2.3, equation (1)
 * Typical ECe_max values (FAO 29 Table 4):
 *   Maize: 1.7 dS/m, Cotton: 7.7 dS/m, Wheat: 6.0 dS/m, Sugarcane: 1.7 dS/m
 *
 * @param {number} ECw_dSm - EC of irrigation water (dS/m), > 0
 * @param {number} ECeMax_dSm - Maximum tolerable EC of saturation extract (dS/m), > 0
 * @returns {{ leachingRequirementFraction: number, leachingRequirementPercent: number,
 *             irrigationEfficiencyNeeded: number }}
 * @throws {RangeError} if ECw >= 5 * ECe_max (physically impossible to leach)
 * @throws {TypeError} if inputs are not finite numbers
 */
export function calculateLeachingRequirement(ECw_dSm: any, ECeMax_dSm: any) {
    for (const [k, v] of [
        ['ECw_dSm', ECw_dSm],
        ['ECeMax_dSm', ECeMax_dSm],
    ]) {
        if (typeof v !== 'number' || !isFinite(v)) {
            throw new TypeError(`calculateLeachingRequirement: '${k}' must be a finite number`);
        }
        if (v <= 0) throw new RangeError(`calculateLeachingRequirement: '${k}' must be > 0`);
    }

    const denominator = 5 * ECeMax_dSm - ECw_dSm;
    if (denominator <= 0) {
        throw new RangeError(
            'calculateLeachingRequirement: ECw is too high relative to ECe_max — leaching is not feasible',
        );
    }

    // Fracao de lixiviacao minima (Ayers & Westcot eq. 1)
    const LR = ECw_dSm / denominator;

    // Eficiencia de irrigacao necessaria para acomodar a lixiviacao: E = 1 / (1 + LR)
    const irrigationEfficiencyNeeded = 1 / (1 + LR);

    return {
        leachingRequirementFraction: LR,
        leachingRequirementPercent: LR * 100,
        irrigationEfficiencyNeeded,
    };
}

// ---------------------------------------------------------------------------
// Irrigation Water Quality Summary
// Resumo de qualidade da agua para irrigacao (FAO 29 Tabela 1)
// ---------------------------------------------------------------------------

/**
 * Evaluate overall irrigation water suitability per FAO 29 guidelines.
 * Avalia a aptidao geral da agua para irrigacao conforme FAO 29 Tabela 1.
 *
 * FAO 29 Table 1 - Degree of restriction on use:
 *   ECw (dS/m): None < 0.7, Slight 0.7-3.0, Moderate 3.0-..., Severe >= ...
 *   SAR (adjusted): None < 3, Slight 3-9, Moderate 9-..., Severe >= 15 (for sprinkler)
 *
 * @param {number} ECw_dSm - EC of irrigation water (dS/m), >= 0
 * @param {number} SAR - Sodium Adsorption Ratio, >= 0
 * @param {number} [chloride_mgL=0] - Chloride concentration (mg/L), used for crop toxicity
 * @param {number} [boron_mgL=0] - Boron concentration (mg/L), >= 0
 * @returns {{ restrictions: Record<string, string>, overallRisk: string, notes: string[] }}
 * @throws {RangeError} if any input is negative
 * @throws {TypeError} if inputs are not finite numbers
 */
export function evaluateIrrigationSuitability(ECw_dSm: any, SAR: any, chloride_mgL = 0, boron_mgL = 0) {
    for (const [k, v] of [
        ['ECw_dSm', ECw_dSm],
        ['SAR', SAR],
        ['chloride_mgL', chloride_mgL],
        ['boron_mgL', boron_mgL],
    ]) {
        if (typeof v !== 'number' || !isFinite(v)) {
            throw new TypeError(`evaluateIrrigationSuitability: '${k}' must be a finite number`);
        }
        if (v < 0) throw new RangeError(`evaluateIrrigationSuitability: '${k}' must be >= 0`);
    }

    const notes = [];

    // --- Restricao por salinidade (FAO 29 Tabela 1, linha ECw) ---
    let salinityRestriction;
    if (ECw_dSm < 0.7) salinityRestriction = 'None';
    else if (ECw_dSm < 3.0) salinityRestriction = 'Slight_to_Moderate';
    else salinityRestriction = 'Severe';

    // --- Restricao por sodio/permeabilidade (FAO 29 Tabela 1, linha SAR) ---
    let sodiumRestriction;
    if (SAR < 3) sodiumRestriction = 'None';
    else if (SAR < 9) sodiumRestriction = 'Slight_to_Moderate';
    else sodiumRestriction = 'Severe';

    // --- Toxicidade especifica de cloreto (FAO 29 Tabela 2) ---
    let chlorideRestriction = 'None';
    if (chloride_mgL > 142) {
        // >4 meq/L
        chlorideRestriction = 'Severe';
        notes.push('Chloride > 4 meq/L: severe toxicity risk for sensitive crops');
    } else if (chloride_mgL > 71) {
        // >2 meq/L
        chlorideRestriction = 'Slight_to_Moderate';
    }

    // --- Toxicidade de boro (FAO 29 Tabela 3) ---
    let boronRestriction = 'None';
    if (boron_mgL > 3.0) {
        boronRestriction = 'Severe';
        notes.push('Boron > 3.0 mg/L: toxic to most crops');
    } else if (boron_mgL > 1.0) {
        boronRestriction = 'Slight_to_Moderate';
        notes.push('Boron 1.0-3.0 mg/L: toxic to sensitive crops');
    }

    // Risco global: pior restricao entre os 4 parametros
    const restrictionLevels = ['None', 'Slight_to_Moderate', 'Severe'];
    const allRestrictions = [salinityRestriction, sodiumRestriction, chlorideRestriction, boronRestriction];
    const overallRisk = allRestrictions.reduce((worst, current) => {
        return restrictionLevels.indexOf(current) > restrictionLevels.indexOf(worst) ? current : worst;
    }, 'None');

    if (overallRisk === 'Severe') {
        notes.unshift('FAO 29: Severe restrictions — specialized management required');
    }

    return {
        restrictions: {
            salinity: salinityRestriction,
            sodium: sodiumRestriction,
            chloride: chlorideRestriction,
            boron: boronRestriction,
        },
        overallRisk,
        notes,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const waterSalinityIrrigationRiskMeta = {
    name: 'waterSalinityIrrigationRisk',
    description: 'waterSalinityIrrigationRisk',
    category: 'analytics',
    familyTags: ['water', 'risk', 'agriculture'],
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
