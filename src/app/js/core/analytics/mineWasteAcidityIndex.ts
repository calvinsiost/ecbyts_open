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
 * @fileoverview Mine Waste Acidity Index - Acid-Base Accounting (ABA) + ARD Potential
 *
 * Implements the standardized Acid-Base Accounting (ABA) procedure for predicting
 * Acid Rock Drainage (ARD) / Acid Mine Drainage (AMD) potential from mine waste.
 * Based on MEND 1.16.1b (Price 2009) and ASTM D5744 methodology.
 *
 * Key metrics:
 *   AP  - Acid Potential (kg CaCO3 equivalent / tonne)
 *   NP  - Neutralization Potential (kg CaCO3 equivalent / tonne)
 *   NNP - Net Neutralization Potential = NP - AP (kg CaCO3/t)
 *   NPR - Neutralization Potential Ratio = NP / AP (dimensionless)
 *
 * Classification thresholds (MEND 1.16.1b Table 2-1):
 *   PAF (Potentially Acid Forming):    NNP < -20 and NPR < 1
 *   NAF (Non-Acid Forming):            NNP > +20 and NPR > 2
 *   UC  (Uncertain / Possibly ARD):    all other combinations
 *
 * References:
 *   Price, W. A. (2009). MEND Prediction Manual, MEND 1.16.1b. ISBN 978-0-662-67440-5.
 *   ASTM D5744-18. (2018). Standard Test Method for Accelerated Weathering of Solid
 *     Materials Using a Modified Humidity Cell. ASTM International.
 *   Sobek, A. A. et al. (1978). Field and Laboratory Methods Applicable to Overburdens
 *     and Minesoils. EPA-600/2-78-054.
 *   Pasternak, M. (1994). Sulfate drainage risk scoring (internal CANMET method).
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
 * Sulfide content conversion factor.
 * AP (kg CaCO3/t) = %S × 31.25
 * Derived from: S (mol) → SO4²⁻ → 2H⁺ → CaCO3 stoichiometry
 * Ref: Sobek et al. (1978) Eq. 2-3.
 */
const AP_FACTOR = 31.25;

/**
 * Calculates Net Neutralization Potential and ARD classification.
 *
 * @param {number} AP - Acid Potential (kg CaCO3 / tonne)
 * @param {number} NP - Neutralization Potential (kg CaCO3 / tonne)
 * @returns {{ NNP: number, NPR: number, classification: 'PAF'|'NAF'|'UC' }}
 */
export function calcNetNeutralizationPotential(
    AP: number,
    NP: number,
): { NNP: number; NPR: number; classification: 'PAF' | 'NAF' | 'UC' } {
    if (typeof AP !== 'number' || AP < 0) {
        throw new RangeError('AP must be a non-negative number (kg CaCO3/t)');
    }
    if (typeof NP !== 'number' || NP < 0) {
        throw new RangeError('NP must be a non-negative number (kg CaCO3/t)');
    }

    const NNP = NP - AP;
    const NPR = AP === 0 ? Infinity : NP / AP;

    let classification: 'PAF' | 'NAF' | 'UC';
    if (NNP < -20 && NPR < 1) {
        classification = 'PAF'; // Potentially Acid Forming
    } else if (NNP > 20 && NPR > 2) {
        classification = 'NAF'; // Non-Acid Forming
    } else {
        classification = 'UC'; // Uncertain
    }

    return { NNP, NPR, classification };
}

/**
 * Performs full Acid-Base Accounting (ABA) from raw analytical inputs.
 *
 * AP = sulfur_pct × 31.25   [Sobek et al. 1978]
 * NP from Fizz-NP titration (provided directly as NP_kg_CaCO3_t)
 *
 * @param {number} sulfur_pct         - Total sulfur content (%, by mass); typ. 0.01–5%
 * @param {number} NP_kg_CaCO3_t     - Measured neutralization potential (kg CaCO3 / tonne)
 * @returns {{
 *   AP: number,
 *   NP: number,
 *   NNP: number,
 *   NPR: number,
 *   PAF: boolean,
 *   classification: 'PAF'|'NAF'|'UC'
 * }}
 */
export function calcAcidBasicAccounting(
    sulfur_pct: number,
    NP_kg_CaCO3_t: number,
): { AP: number; NP: number; NNP: number; NPR: number; PAF: boolean; classification: 'PAF' | 'NAF' | 'UC' } {
    if (typeof sulfur_pct !== 'number' || sulfur_pct < 0 || sulfur_pct > 100) {
        throw new RangeError('sulfur_pct must be between 0 and 100');
    }
    if (typeof NP_kg_CaCO3_t !== 'number' || NP_kg_CaCO3_t < 0) {
        throw new RangeError('NP_kg_CaCO3_t must be >= 0');
    }

    const AP = sulfur_pct * AP_FACTOR;
    const NP = NP_kg_CaCO3_t;
    const { NNP, NPR, classification } = calcNetNeutralizationPotential(AP, NP);

    return {
        AP,
        NP,
        NNP,
        NPR,
        PAF: classification === 'PAF',
        classification,
    };
}

/**
 * Calculates a drainage risk score using the Pasternak (1994) empirical index.
 *
 * The Pasternak index combines effluent pH and sulfate concentration into a
 * dimensionless drainage risk score (0–10) used for prioritizing monitoring.
 *
 * score = w_pH × (7 - pH)  + w_SO4 × log10(1 + sulfate_mg_L / 250)
 * w_pH = 3, w_SO4 = 2  (empirical weights, CANMET 1994)
 * Clamped to [0, 10].
 *
 * @param {number} pH             - Effluent or leachate pH (0–14)
 * @param {number} sulfate_mg_L   - Sulfate concentration in effluent (mg/L)
 * @returns {{ score: number, risk: 'low'|'moderate'|'high' }}
 */
export function calcPasternak(pH: number, sulfate_mg_L: number): { score: number; risk: 'low' | 'moderate' | 'high' } {
    if (typeof pH !== 'number' || pH < 0 || pH > 14) {
        throw new RangeError('pH must be between 0 and 14');
    }
    if (typeof sulfate_mg_L !== 'number' || sulfate_mg_L < 0) {
        throw new RangeError('sulfate_mg_L must be >= 0');
    }

    const W_PH = 3;
    const W_SO4 = 2;
    const raw = W_PH * (7 - pH) + W_SO4 * Math.log10(1 + sulfate_mg_L / 250);
    const score = Math.max(0, Math.min(10, raw));

    let risk: 'low' | 'moderate' | 'high';
    if (score < 3) risk = 'low';
    else if (score < 6) risk = 'moderate';
    else risk = 'high';

    return { score, risk };
}

/**
 * Classifies ARD potential using combined NNP + NPR criteria (MEND 1.16.1b).
 *
 * @param {number} NNP - Net Neutralization Potential (kg CaCO3/t)
 * @param {number} AP  - Acid Potential (kg CaCO3/t)
 * @param {number} NP  - Neutralization Potential (kg CaCO3/t)
 * @returns {'PAF'|'NAF'|'UC'}
 */
export function classifyARDPotential(NNP: number, AP: number, NP: number): 'PAF' | 'NAF' | 'UC' {
    if (typeof NNP !== 'number') throw new TypeError('NNP must be a number');
    if (typeof AP !== 'number' || AP < 0) throw new RangeError('AP must be >= 0');
    if (typeof NP !== 'number' || NP < 0) throw new RangeError('NP must be >= 0');

    const NPR = AP === 0 ? Infinity : NP / AP;

    if (NNP < -20 && NPR < 1) return 'PAF';
    if (NNP > 20 && NPR > 2) return 'NAF';
    return 'UC';
}

/**
 * Estimates the carbonate depletion time before ARD onset (simplified kinetic model).
 * Based on neutralization consumption rate proportional to sulfide oxidation rate.
 *
 * t_depletion = NP / (NP_consumption_rate_yr)
 * where NP_consumption_rate ≈ AP × k_ox   (k_ox typically 0.01–0.05 yr⁻¹)
 *
 * @param {number} NP      - Neutralization Potential (kg CaCO3/t)
 * @param {number} AP      - Acid Potential (kg CaCO3/t)
 * @param {number} k_ox    - Sulfide oxidation rate constant (yr⁻¹); default 0.02
 * @returns {{ t_depletion_yr: number, depletionRisk: 'low'|'moderate'|'high' }}
 */
export function calcCarbonateDepletionTime(
    NP: number,
    AP: number,
    k_ox = 0.02,
): { t_depletion_yr: number; depletionRisk: 'low' | 'moderate' | 'high' } {
    if (typeof NP !== 'number' || NP < 0) throw new RangeError('NP must be >= 0');
    if (typeof AP !== 'number' || AP <= 0) throw new RangeError('AP must be > 0');
    if (typeof k_ox !== 'number' || k_ox <= 0) throw new RangeError('k_ox must be > 0');

    const consumptionRate = AP * k_ox; // kg CaCO3 consumed per tonne per year
    const t_depletion_yr = NP / consumptionRate;

    let depletionRisk: 'low' | 'moderate' | 'high';
    if (t_depletion_yr > 100) depletionRisk = 'low';
    else if (t_depletion_yr > 20) depletionRisk = 'moderate';
    else depletionRisk = 'high';

    return { t_depletion_yr, depletionRisk };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const mineWasteAcidityIndexMeta: AnalyticsModuleMeta = {
    name: 'mineWasteAcidityIndex',
    description: 'mineWasteAcidityIndex',
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
