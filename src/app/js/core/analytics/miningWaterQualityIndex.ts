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
 * @module miningWaterQualityIndex
 * Water Quality Index for mining operations - ANZECC (2000) + CONAMA 357/2005.
 *
 * Academic references:
 *   ANZECC/ARMCANZ (2000). Australian and New Zealand Guidelines for Fresh and
 *     Marine Water Quality. National Water Quality Management Strategy Paper No. 4.
 *   CONAMA 357/2005. Classificação e Diretrizes Ambientais para o Enquadramento
 *     dos Corpos de Água Superficiais e Efluentes Líquidos.
 *   NSF-WQI: Brown, R.M. et al. (1970). A Water Quality Index - Do We Dare?
 *     Water & Sewage Works, 117(10), 339–343.
 */

'use strict';

// ---- Parameter weights (sum = 1.00) ----
// Adapted from NSF-WQI weights adjusted for mining context.
/** @type {Record<string, number>} */
const PARAM_WEIGHTS = {
    pH: 0.11,
    TSS: 0.08, // Total Suspended Solids (mg/L)
    turbidity: 0.08, // NTU
    DO: 0.17, // Dissolved Oxygen (mg/L)
    BOD: 0.11, // Biochemical Oxygen Demand (mg/L)
    total_metals: 0.12, // sum of heavy metals (µg/L converted factor below)
    sulfate: 0.1, // SO4²⁻ (mg/L)
    TDS: 0.08, // Total Dissolved Solids (mg/L)
    acidity: 0.15, // titratable acidity (mg/L CaCO3) — critical for ARD
};

/**
 * Sub-index (qi) scoring functions for each parameter.
 * Returns 0-100 score; higher = better water quality.
 * @type {Record<string, (v: number) => number>}
 */
const _subIndex = {
    pH(v: any) {
        // Optimal 6.5–8.5 (Class II CONAMA 357)
        if (v >= 6.5 && v <= 8.5) return 100;
        if (v >= 6.0 && v < 6.5) return 80 - (6.5 - v) * 60;
        if (v > 8.5 && v <= 9.0) return 80 - (v - 8.5) * 60;
        if (v >= 5.0 && v < 6.0) return 20;
        if (v > 9.0 && v <= 10.0) return 20;
        return 2; // extreme
    },
    TSS(v: any) {
        // CONAMA 357 Class II: ≤ 100 mg/L inorganic
        if (v <= 10) return 100;
        if (v <= 50) return 100 - (v - 10) * 1.25;
        if (v <= 100) return 50 - (v - 50) * 0.8;
        if (v <= 500) return 10 - (v - 100) * 0.02;
        return 2;
    },
    turbidity(v: any) {
        // CONAMA 357 Class II: ≤ 100 NTU
        if (v <= 5) return 100;
        if (v <= 40) return 100 - (v - 5) * 1.71;
        if (v <= 100) return 40 - (v - 40) * 0.56;
        if (v <= 400) return 6 - (v - 100) * 0.013;
        return 2;
    },
    DO(v: any) {
        // CONAMA 357 Class II: ≥ 5 mg/L; saturation ~9 mg/L at 25°C
        if (v >= 9) return 100;
        if (v >= 5) return 40 + (v - 5) * 15;
        if (v >= 2) return 10 + (v - 2) * 10;
        return 2;
    },
    BOD(v: any) {
        // CONAMA 357 Class II: ≤ 5 mg/L
        if (v <= 1) return 100;
        if (v <= 5) return 100 - (v - 1) * 15;
        if (v <= 20) return 40 - (v - 5) * 2;
        return 2;
    },
    total_metals(v: any) {
        // v in µg/L total dissolved metals; threshold 100 µg/L indicative
        if (v <= 10) return 100;
        if (v <= 50) return 100 - (v - 10) * 1.5;
        if (v <= 100) return 40 - (v - 50) * 0.6;
        if (v <= 500) return 10 - (v - 100) * 0.02;
        return 2;
    },
    sulfate(v: any) {
        // CONAMA 357 Class II: ≤ 250 mg/L
        if (v <= 50) return 100;
        if (v <= 250) return 100 - (v - 50) * 0.45;
        if (v <= 500) return 10 - (v - 250) * 0.032;
        return 2;
    },
    TDS(v: any) {
        // CONAMA 357: ≤ 500 mg/L Class I
        if (v <= 100) return 100;
        if (v <= 500) return 100 - (v - 100) * 0.2;
        if (v <= 1000) return 20 - (v - 500) * 0.036;
        return 2;
    },
    acidity(v: any) {
        // Acid Rock Drainage indicator; v in mg/L CaCO3
        if (v <= 5) return 100;
        if (v <= 30) return 100 - (v - 5) * 2.8;
        if (v <= 100) return 30 - (v - 30) * 0.4;
        return 2;
    },
};

/**
 * Calculates the Mining Water Quality Index (WQI) on a 0–100 scale.
 * Uses weighted arithmetic mean of sub-indices.
 *
 * @param {Record<string, number>} parameters - Measured water quality parameters. All optional;
 *   missing parameters are excluded from the weighted sum (weights renormalized).
 *   {
 *     pH?: number,           // standard units
 *     TSS?: number,          // mg/L
 *     turbidity?: number,    // NTU
 *     DO?: number,           // mg/L
 *     BOD?: number,          // mg/L
 *     total_metals?: number, // µg/L dissolved
 *     sulfate?: number,      // mg/L
 *     TDS?: number,          // mg/L
 *     acidity?: number,      // mg/L CaCO3
 *   }
 * @returns {number} WQI in [0, 100]; higher = better quality.
 */
export function calcWQI(parameters: any) {
    if (!parameters || typeof parameters !== 'object') {
        throw new TypeError('parameters must be an object');
    }
    let weightedSum = 0;
    let totalWeight = 0;
    for (const [key, weight] of Object.entries(PARAM_WEIGHTS)) {
        const val = parameters[key];
        if (val === undefined || val === null) continue;
        if (!Number.isFinite(val) || val < 0) {
            throw new RangeError(`parameters.${key} must be a finite non-negative number`);
        }
const qi = Math.min(100, Math.max(2, (_subIndex as any)[key](val)));
        weightedSum += qi * weight;
        totalWeight += weight;
    }
    if (totalWeight === 0) throw new RangeError('at least one parameter must be provided');
    return weightedSum / totalWeight;
}

/**
 * Classifies mine water quality from WQI score.
 *
 * Classification (NSF-WQI adapted):
 *   excellent : WQI ≥ 90
 *   good      : 70 ≤ WQI < 90
 *   medium    : 50 ≤ WQI < 70
 *   bad       : 25 ≤ WQI < 50
 *   very_bad  : WQI < 25
 *
 * @param {number} WQI - Water quality index value in [0, 100].
 * @returns {'excellent'|'good'|'medium'|'bad'|'very_bad'} Quality class.
 */
export function classifyMineWaterQuality(WQI: any) {
    if (!Number.isFinite(WQI) || WQI < 0 || WQI > 100) {
        throw new RangeError('WQI must be in [0, 100]');
    }
    if (WQI >= 90) return 'excellent';
    if (WQI >= 70) return 'good';
    if (WQI >= 50) return 'medium';
    if (WQI >= 25) return 'bad';
    return 'very_bad';
}

/**
 * Calculates the Acid Rock Drainage (ARD) risk score (0–10).
 * Based on pH, sulfate, and iron as primary ARD indicators (INAP 2014).
 *
 * Risk score components:
 *   pH component   : max contribution 4 pts (lower pH = higher risk)
 *   sulfate (SO4²⁻): max contribution 3 pts
 *   iron (Fe)      : max contribution 3 pts
 *
 * @param {number} pH          - Water pH (0–14).
 * @param {number} sulfate_mg_L - Sulfate concentration (mg/L). ≥ 0.
 * @param {number} iron_mg_L   - Total iron concentration (mg/L). ≥ 0.
 * @returns {number} ARD risk score in [0, 10]; higher = greater ARD risk.
 */
export function calcAcidRockDrainageRisk(pH: any, sulfate_mg_L: any, iron_mg_L: any) {
    if (!Number.isFinite(pH) || pH < 0 || pH > 14) throw new RangeError('pH must be 0–14');
    if (!Number.isFinite(sulfate_mg_L) || sulfate_mg_L < 0) {
        throw new RangeError('sulfate_mg_L must be ≥ 0');
    }
    if (!Number.isFinite(iron_mg_L) || iron_mg_L < 0) {
        throw new RangeError('iron_mg_L must be ≥ 0');
    }

    // pH component: pH < 6 starts accumulating risk; pH < 4 = max
    let pHScore;
    if (pH >= 6) pHScore = 0;
    else if (pH >= 4)
        pHScore = ((6 - pH) / 2) * 4; // 0–4 pts
    else pHScore = 4;

    // Sulfate: > 250 mg/L indicates ARD (CONAMA Class II limit)
    let SO4Score;
    if (sulfate_mg_L <= 50) SO4Score = 0;
    else if (sulfate_mg_L <= 250) SO4Score = ((sulfate_mg_L - 50) / 200) * 1.5;
    else if (sulfate_mg_L <= 1000) SO4Score = 1.5 + ((sulfate_mg_L - 250) / 750) * 1.5;
    else SO4Score = 3;

    // Iron: CONAMA 357 dissolved Fe limit 0.3 mg/L (Class I–III)
    let FeScore;
    if (iron_mg_L <= 0.3) FeScore = 0;
    else if (iron_mg_L <= 5) FeScore = ((iron_mg_L - 0.3) / 4.7) * 1.5;
    else if (iron_mg_L <= 50) FeScore = 1.5 + ((iron_mg_L - 5) / 45) * 1.5;
    else FeScore = 3;

    return Math.min(10, pHScore + SO4Score + FeScore);
}

/**
 * Checks compliance with CONAMA 357/2005 limits for a water quality parameter.
 *
 * @param {string} parameter   - Parameter name (see limits table below).
 * @param {number} value_mg_L  - Measured concentration (mg/L, or pH, or NTU for turbidity).
 * @param {'I'|'II'|'III'|'IV'} waterClass - CONAMA 357 water body class.
 * @returns {{ compliant: boolean, limit: number|null, exceedanceFactor: number }}
 *   exceedanceFactor: value/limit (1.0 = at limit; >1 = exceeded; 0 if no limit defined)
 */
export function checkCONAMA357Compliance(parameter: any, value_mg_L: any, waterClass: any) {
    if (!Number.isFinite(value_mg_L)) throw new TypeError('value_mg_L must be finite');
    if (!['I', 'II', 'III', 'IV'].includes(waterClass)) {
        throw new RangeError("waterClass must be 'I', 'II', 'III', or 'IV'");
    }

    // CONAMA 357/2005 Artigo 15 - freshwater limits
    /** @type {Record<string, any>} */
    const LIMITS = {
        // [Class I, II, III, IV] - null = not specified
        pH: { I: [6, 9], II: [6, 9], III: [6, 9], IV: [6, 9], type: 'range' },
        BOD: { I: 3, II: 5, III: 10, IV: null },
        DO: { I: 6, II: 5, III: 4, IV: 2, type: 'min' },
        turbidity: { I: 40, II: 100, III: 100, IV: null },
        TSS: { I: null, II: 100, III: 100, IV: null },
        sulfate: { I: 250, II: 250, III: 250, IV: 250 },
        TDS: { I: 500, II: 500, III: 500, IV: null },
        ammonia: { I: 3.7, II: 3.7, III: 13.3, IV: null },
    };

const entry = (LIMITS as any)[parameter];
    if (!entry) {
        return { compliant: true, limit: null, exceedanceFactor: 0 };
    }

    const classMap = { I: 0, II: 1, III: 2, IV: 3 };
// eslint-disable-next-line
const idx = (classMap as Record<string, number>)[waterClass];

    // pH range check
    if (entry.type === 'range') {
        const [lo, hi] = entry[waterClass];
        const compliant = value_mg_L >= lo && value_mg_L <= hi;
        return { compliant, limit: hi, exceedanceFactor: value_mg_L / hi };
    }

    // DO: minimum threshold
    if (entry.type === 'min') {
        const limit = entry[waterClass];
        if (limit === null) return { compliant: true, limit: null, exceedanceFactor: 0 };
        return { compliant: value_mg_L >= limit, limit, exceedanceFactor: limit / Math.max(value_mg_L, 1e-9) };
    }

    // Standard max limit
    const limit = entry[waterClass] ?? null;
    if (limit === null) return { compliant: true, limit: null, exceedanceFactor: 0 };
    return {
        compliant: value_mg_L <= limit,
        limit,
        exceedanceFactor: value_mg_L / limit,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const miningWaterQualityIndexMeta = {
    name: 'miningWaterQualityIndex',
    description: 'miningWaterQualityIndex',
    category: 'analytics',
    familyTags: ['water', 'mining'],
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
