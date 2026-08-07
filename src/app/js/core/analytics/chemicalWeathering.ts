// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Chemical Weathering & Mineral Dissolution
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/**
 * Chemical Weathering & Mineral Dissolution
 *
 * Módulo puro implementando cinética de intemperismo químico mineral baseada
 * na equação de Lasaga et al. (1994), consumo de CO2 por carbonatação,
 * índice de saturação de Langelier e classificação de intensidade de
 * intemperismo (CIA/CDF) por Nesbitt & Young (1982).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * References:
 *   Lasaga, A.C. et al. (1994) Chemical weathering rate laws and global geochemical cycles.
 *     Geochimica et Cosmochimica Acta 58(10): 2361–2386.
 *   Nesbitt, H.W. & Young, G.M. (1982) Early Proterozoic climates and plate motions inferred
 *     from major element chemistry of lutites. Nature 299: 715–717.
 *   White, A.F. & Brantley, S.L. (2003) The effect of time on the weathering of silicate minerals.
 *     Chemical Geology 202: 479–506.
 *
 * @module chemicalWeathering
 */
'use strict';
/** Universal gas constant (J/mol/K) */
const R_GAS = 8.314;
/**
 * Compute mineral dissolution rate via Lasaga transition-state kinetics.
 * Taxa de dissolução: k = k0 × exp(−Ea / (R × T)) × aH^n
 * onde aH é a atividade do íon H+ calculada a partir do pH.
 *
 * @param {{ k0: number, Ea_J_mol: number, n_H: number }} mineral
 *   k0 - pre-exponential rate constant (mol/m²/s)
 *   Ea_J_mol - activation energy (J/mol)
 *   n_H - reaction order with respect to H+ activity
 * @param {number} mineral - temperature in Celsius
 * @param {number} temperature_C - solution pH (0–14)
 * @param {number} ph - mean annual rainfall (mm/yr) - used for unit conversion annotation
 * @returns {{ rate_mol_m2_yr: number }} weathering rate in mol/m²/yr
 *
 * @throws {TypeError} if mineral object is missing required fields
 * @throws {RangeError} if temperature or pH are out of valid range
 */
export function computeWeatheringRate(mineral: any, temperature_C: any, ph: any, rainfall_mm_yr: any) {
    if (!mineral || typeof mineral !== 'object')
        throw new TypeError('mineral must be an object');
    const { k0, Ea_J_mol, n_H } = mineral;
    if (typeof k0 !== 'number' || typeof Ea_J_mol !== 'number' || typeof n_H !== 'number') {
        throw new TypeError('mineral must have numeric fields k0, Ea_J_mol, n_H');
    }
    if (typeof temperature_C !== 'number' || temperature_C < -50 || temperature_C > 150) {
        throw new RangeError('temperature_C must be a number between -50 and 150');
    }
    if (typeof ph !== 'number' || ph < 0 || ph > 14) {
        throw new RangeError('ph must be a number between 0 and 14');
    }
    if (typeof rainfall_mm_yr !== 'number' || rainfall_mm_yr < 0) {
        throw new RangeError('rainfall_mm_yr must be a non-negative number');
    }
    const T_K = temperature_C + 273.15;
    // Atividade do H+ a partir do pH: aH = 10^(-pH)
    const aH = Math.pow(10, -ph);
    // Taxa de Lasaga (mol/m²/s)
    const rate_mol_m2_s = k0 * Math.exp(-Ea_J_mol / (R_GAS * T_K)) * Math.pow(aH, n_H);
    // Converter para mol/m²/yr (1 yr ≈ 31,536,000 s)
    const rate_mol_m2_yr = rate_mol_m2_s * 3.1536e7;
    return { rate_mol_m2_yr };
}
/**
 * Compute CO2 consumption by silicate weathering carbonation reaction.
 * Consumo de CO2 (mol/yr) = taxa × área × carga_cátions / 2
 * Reação estequiométrica: 2CO2 + H2O + CaSiO3 → Ca2+ + 2HCO3- + SiO2
 *
 * @param {number} silicateArea_m2 - reactive silicate surface area (m²)
 * @param {number} weatheringRate_mol_m2_yr - dissolution rate (mol/m²/yr)
 * @param {number} cationCharge - effective cation charge (e.g. 2 for Ca²⁺, Mg²⁺)
 * @returns {{ co2Consumption_mol_yr: number }}
 *
 * @throws {RangeError} if any argument is negative or cationCharge is zero
 */
export function computeCO2Consumption(silicateArea_m2: any, weatheringRate_mol_m2_yr: any, cationCharge: any) {
    if (typeof silicateArea_m2 !== 'number' || silicateArea_m2 < 0) {
        throw new RangeError('silicateArea_m2 must be a non-negative number');
    }
    if (typeof weatheringRate_mol_m2_yr !== 'number' || weatheringRate_mol_m2_yr < 0) {
        throw new RangeError('weatheringRate_mol_m2_yr must be a non-negative number');
    }
    if (typeof cationCharge !== 'number' || cationCharge === 0) {
        throw new RangeError('cationCharge must be a non-zero number');
    }
    // CO2 consumido = taxa × área × carga / 2 (estequiometria de carbonatação)
    const co2Consumption_mol_yr = (weatheringRate_mol_m2_yr * silicateArea_m2 * cationCharge) / 2;
    return { co2Consumption_mol_yr };
}
/**
 * Compute Saturation Index (SI) for a mineral.
 * SI = log10(IAP / Ksp)
 * SI > 0 → supersaturado (precipitação favorecida)
 * SI < 0 → insaturado (dissolução favorecida)
 * SI ≈ 0 (±0.1) → equilíbrio
 *
 * @param {number} ion_activity_product - measured ion activity product (IAP)
 * @param {number} ksp - solubility product constant (Ksp)
 * @returns {{ si: number, state: 'supersaturated'|'equilibrium'|'undersaturated' }}
 *
 * @throws {RangeError} if IAP or Ksp are non-positive
 */
export function computeSaturationIndex(ion_activity_product: any, ksp: any) {
    if (typeof ion_activity_product !== 'number' || ion_activity_product <= 0) {
        throw new RangeError('ion_activity_product must be a positive number');
    }
    if (typeof ksp !== 'number' || ksp <= 0) {
        throw new RangeError('ksp must be a positive number');
    }
    const si = Math.log10(ion_activity_product / ksp);
    /** @type {'supersaturated'|'equilibrium'|'undersaturated'} */
    let state;
    if (si > 0.1)
        state = 'supersaturated';
    else if (si < -0.1)
        state = 'undersaturated';
    else
        state = 'equilibrium';
    return { si, state };
}
/**
 * Classify weathering intensity using Chemical Index of Alteration (CIA)
 * and Chemical Depletion Fraction (CDF).
 *
 * CIA = Al2O3 / (Al2O3 + CaO + Na2O + K2O) × 100 (Nesbitt & Young 1982)
 * CDF = 1 − (Zr_rock / Zr_soil) - depleção relativa de elementos móveis
 *
 * @param {number} cia - Chemical Index of Alteration (0–100)
 * @param {number} cdf - Chemical Depletion Fraction (0–1)
 * @returns {{ weatheringStage: 'initial'|'moderate'|'advanced'|'extreme', cia: number, cdf: number }}
 *
 * @throws {RangeError} if CIA or CDF are out of valid range
 */
export function classifyWeatheringIntensity(cia: any, cdf: any) {
    if (typeof cia !== 'number' || cia < 0 || cia > 100) {
        throw new RangeError('cia must be a number between 0 and 100');
    }
    if (typeof cdf !== 'number' || cdf < 0 || cdf > 1) {
        throw new RangeError('cdf must be a number between 0 and 1');
    }
    // Classificação baseada em CIA (Nesbitt & Young 1982):
    // initial: CIA < 50 (feldspatos frescos dominantes)
    // moderate: 50–70 (alteração incipiente)
    // advanced: 70–90 (argilização intensa)
    // extreme: ≥ 90 (lateritização / bauxitização)
    /** @type {'initial'|'moderate'|'advanced'|'extreme'} */
    let weatheringStage;
    if (cia < 50)
        weatheringStage = 'initial';
    else if (cia < 70)
        weatheringStage = 'moderate';
    else if (cia < 90)
        weatheringStage = 'advanced';
    else
        weatheringStage = 'extreme';
    return { weatheringStage, cia, cdf };
}
/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const chemicalWeatheringMeta = {
    name: 'chemicalWeathering',
    description: 'Chemical Weathering & Mineral Dissolution',
    category: 'analytics',
    familyTags: ['chemical'],
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
//# sourceMappingURL=chemicalWeathering.js.map
