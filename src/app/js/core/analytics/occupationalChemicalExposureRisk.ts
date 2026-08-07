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
 * @module occupationalChemicalExposureRisk
 * Occupational Chemical Exposure Risk - AIHA ERIOSH + ACGIH TLV + NR-15 (Brazil).
 *
 * Academic references:
 *   AIHA (2015). A Strategy for Assessing and Managing Occupational Exposures,
 *     4th ed. American Industrial Hygiene Association, Fairfax, VA.
 *   ACGIH (2024). TLVs and BEIs: Threshold Limit Values for Chemical Substances
 *     and Physical Agents & Biological Exposure Indices.
 *   NR-15 (2022). Atividades e Operações Insalubres. MTE, Brasília.
 *   NIOSH (2005). Pocket Guide to Chemical Hazards. DHHS (NIOSH) Pub. No. 2005-149.
 */

'use strict';

/**
 * Calculates the Exposure Ratio (ER) for a single substance.
 * ER = C / OEL
 * ER < 0.1  : very low exposure
 * ER < 0.5  : low
 * ER < 1.0  : at action level (typically AL = 0.5 × OEL, but ER < 1 is pre-exceedance)
 * ER ≥ 1.0  : at or over OEL
 *
 * @param {number} measured_mg_m3 - Measured airborne concentration (mg/m³). ≥ 0.
 * @param {number} OEL_mg_m3      - Occupational Exposure Limit (mg/m³). > 0.
 * @returns {number} Dimensionless exposure ratio.
 */
export function calcExposureRatio(measured_mg_m3: any, OEL_mg_m3: any) {
    if (!Number.isFinite(measured_mg_m3) || measured_mg_m3 < 0) {
        throw new RangeError('measured_mg_m3 must be ≥ 0');
    }
    if (!Number.isFinite(OEL_mg_m3) || OEL_mg_m3 <= 0) {
        throw new RangeError('OEL_mg_m3 must be > 0');
    }
    return measured_mg_m3 / OEL_mg_m3;
}

/**
 * Calculates the mixture exposure ratio using the additive model (ACGIH TLV Book §7).
 * ER_mix = Σ (Ci / OELi)
 * Applicable when substances have similar toxicological endpoints (additive assumption).
 * If ER_mix ≥ 1.0, the mixture OEL is exceeded.
 *
 * @param {Array<{concentration_mg_m3: number, OEL_mg_m3: number, name?: string}>} components
 *   Array of mixture components with measured concentration and OEL.
 * @returns {{ ER_mix: number, components: Array<{name: string, ER: number}> }}
 */
export function calcMixtureExposureRatio(components: any) {
    if (!Array.isArray(components) || components.length === 0) {
        throw new TypeError('components must be a non-empty array');
    }
    let ER_mix = 0;
    const detail = [];
    for (let i = 0; i < components.length; i++) {
        const c = components[i];
        if (!c || typeof c !== 'object') throw new TypeError(`component[${i}] must be an object`);
        const ER = calcExposureRatio(c.concentration_mg_m3, c.OEL_mg_m3);
        ER_mix += ER;
        detail.push({ name: c.name ?? `component_${i}`, ER });
    }
    return { ER_mix, components: detail };
}

/**
 * Calculates the Time-Weighted Average (TWA) concentration over an 8-hour workday
 * (or provided total duration).
 *
 * TWA = Σ (Ci × ti) / Σ ti
 *
 * @param {Array<{concentration_mg_m3: number, duration_min: number}>} samples
 *   Measurement samples - concentration and duration in minutes. Each duration > 0.
 * @returns {number} TWA concentration in mg/m³.
 */
export function calcTimeWeightedAverage(samples: any) {
    if (!Array.isArray(samples) || samples.length === 0) {
        throw new TypeError('samples must be a non-empty array');
    }
    let numerator = 0;
    let totalTime = 0;
    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        if (!s || typeof s !== 'object') throw new TypeError(`samples[${i}] must be an object`);
        if (!Number.isFinite(s.concentration_mg_m3) || s.concentration_mg_m3 < 0) {
            throw new RangeError(`samples[${i}].concentration_mg_m3 must be ≥ 0`);
        }
        if (!Number.isFinite(s.duration_min) || s.duration_min <= 0) {
            throw new RangeError(`samples[${i}].duration_min must be > 0`);
        }
        numerator += s.concentration_mg_m3 * s.duration_min;
        totalTime += s.duration_min;
    }
    return numerator / totalTime;
}

/**
 * Classifies occupational exposure risk based on the Exposure Ratio (ER).
 *
 * Classification per AIHA (2015) Table 8-3 and NIOSH hierarchy:
 *   'acceptable'           : ER < 0.1   - exposure well below OEL
 *   'action_level'         : 0.1 ≤ ER < 0.5 - action level (AL = 0.5 × OEL region)
 *   'over_oEL'             : 0.5 ≤ ER < 10  - OEL exceeded; control measures required
 *   'immediately_dangerous': ER ≥ 10    - IDLH-proximate; immediate evacuation
 *
 * Note: OSHA action level = 0.5 × PEL; ACGIH AL = 0.5 × TLV.
 * This function uses ER = C / OEL directly.
 *
 * @param {number} ER - Dimensionless exposure ratio (C / OEL).
 * @returns {'acceptable'|'action_level'|'over_oEL'|'immediately_dangerous'} Risk class.
 */
export function classifyExposureRisk(ER: any) {
    if (!Number.isFinite(ER) || ER < 0) throw new RangeError('ER must be ≥ 0');
    if (ER < 0.1) return 'acceptable';
    if (ER < 0.5) return 'action_level';
    if (ER < 10) return 'over_oEL';
    return 'immediately_dangerous';
}

/**
 * Calculates the NR-15 (Brazil) unhealthiness index for chemical agents.
 * Returns the insalubrity degree (grau de insalubridade) and tolerance limit.
 *
 * NR-15 Annexe 11 reference methodology:
 *   grau_minimo   : ER < 0.5  (10% of minimum wage)
 *   grau_medio    : 0.5 ≤ ER < 1.0  (20% of minimum wage)
 *   grau_maximo   : ER ≥ 1.0  (40% of minimum wage)
 *   insalubre     : ER ≥ 1.0
 *
 * @param {number} measured_mg_m3 - Measured TWA concentration (mg/m³).
 * @param {number} NR15_limit_mg_m3 - NR-15 tolerance limit for the substance (mg/m³).
 * @returns {{ grau: 'minimo'|'medio'|'maximo', insalubre: boolean, ER: number }}
 */
export function classifyNR15Insalubrity(measured_mg_m3: any, NR15_limit_mg_m3: any) {
    const ER = calcExposureRatio(measured_mg_m3, NR15_limit_mg_m3);
    /** @type {'minimo'|'medio'|'maximo'} */
    let grau;
    if (ER < 0.5) grau = 'minimo';
    else if (ER < 1.0) grau = 'medio';
    else grau = 'maximo';
    return { grau, insalubre: ER >= 1.0, ER };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const occupationalChemicalExposureRiskMeta = {
    name: 'occupationalChemicalExposureRisk',
    description: 'occupationalChemicalExposureRisk',
    category: 'analytics',
    familyTags: ['chemical', 'occupational', 'risk'],
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
