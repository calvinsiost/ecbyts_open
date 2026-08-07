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
 * Soil Phosphorus Adsorption - Langmuir + Freundlich isotherms
 *
 * References:
 *   Langmuir I (1918) The adsorption of gases on plane surfaces of glass, mica and platinum.
 *     JACS 40(9):1361-1403. DOI:10.1021/ja02242a004
 *   Freundlich H (1906) Über die adsorption in Lösungen. Zeitschr. Phys. Chem. 57:385-470.
 *   Sposito G (1989) The Chemistry of Soils. Oxford University Press. ISBN:978-0195070119
 *   Breeuwsma A, Silva S (1992) Phosphorus fertilisation and environmental effects in
 *     the Netherlands and the Po region (Italy). DLO Report 57, Wageningen.
 */

'use strict';

/**
 * Calculates phosphorus adsorption using the Langmuir isotherm.
 *
 * Equação: q = (b × KL × Ce) / (1 + KL × Ce)
 *
 * @param {number} Ce_mg_L - Equilibrium concentration in solution (mg P / L). Must be ≥ 0.
 * @param {number} b_mg_kg - Maximum adsorption capacity (mg P / kg soil). Must be > 0.
 * @param {number} KL_L_mg - Langmuir binding coefficient (L / mg). Must be > 0.
 * @returns {number} Adsorbed phosphorus q (mg P / kg soil).
 */
export function calcLangmuirAdsorption(Ce_mg_L: any, b_mg_kg: any, KL_L_mg: any) {
    if (typeof Ce_mg_L !== 'number' || typeof b_mg_kg !== 'number' || typeof KL_L_mg !== 'number') {
        throw new TypeError('calcLangmuirAdsorption: all parameters must be numbers');
    }
    if (Ce_mg_L < 0) throw new RangeError('calcLangmuirAdsorption: Ce_mg_L must be >= 0');
    if (b_mg_kg <= 0) throw new RangeError('calcLangmuirAdsorption: b_mg_kg must be > 0');
    if (KL_L_mg <= 0) throw new RangeError('calcLangmuirAdsorption: KL_L_mg must be > 0');

    return (b_mg_kg * KL_L_mg * Ce_mg_L) / (1 + KL_L_mg * Ce_mg_L);
}

/**
 * Calculates phosphorus adsorption using the Freundlich isotherm.
 *
 * Equação: q = Kf × Ce^(1/n)
 *
 * @param {number} Ce_mg_L - Equilibrium concentration in solution (mg P / L). Must be ≥ 0.
 * @param {number} Kf - Freundlich adsorption coefficient ((mg/kg)·(L/mg)^(1/n)). Must be > 0.
 * @param {number} n - Freundlich linearity parameter (dimensionless). Must be > 0.
 * @returns {number} Adsorbed phosphorus q (mg P / kg soil).
 */
export function calcFreundlichAdsorption(Ce_mg_L: any, Kf: any, n: any) {
    if (typeof Ce_mg_L !== 'number' || typeof Kf !== 'number' || typeof n !== 'number') {
        throw new TypeError('calcFreundlichAdsorption: all parameters must be numbers');
    }
    if (Ce_mg_L < 0) throw new RangeError('calcFreundlichAdsorption: Ce_mg_L must be >= 0');
    if (Kf <= 0) throw new RangeError('calcFreundlichAdsorption: Kf must be > 0');
    if (n <= 0) throw new RangeError('calcFreundlichAdsorption: n must be > 0');

    return Kf * Math.pow(Ce_mg_L, 1 / n);
}

/**
 * Calculates the Degree of Phosphorus Saturation (DPS).
 * Used as indicator for P leaching risk to surface waters.
 *
 * DPS (%) = (P_adsorbed / P_max) × 100
 *
 * @param {number} P_adsorbed - Current P adsorbed (mg P / kg soil). Must be ≥ 0.
 * @param {number} P_max - Maximum P adsorption capacity (mg P / kg soil). Must be > 0.
 * @returns {number} DPS in percent (0–100+).
 */
export function calcPhosphorusSaturationDegree(P_adsorbed: any, P_max: any) {
    if (typeof P_adsorbed !== 'number' || typeof P_max !== 'number') {
        throw new TypeError('calcPhosphorusSaturationDegree: parameters must be numbers');
    }
    if (P_adsorbed < 0) throw new RangeError('calcPhosphorusSaturationDegree: P_adsorbed must be >= 0');
    if (P_max <= 0) throw new RangeError('calcPhosphorusSaturationDegree: P_max must be > 0');

    return (P_adsorbed / P_max) * 100;
}

/**
 * Classifies phosphorus leaching risk based on DPS.
 * Thresholds adapted from Breeuwsma & Silva (1992) and EMBRAPA/CETESB guidance.
 *
 * DPS < 25%    → 'low'
 * DPS 25–50%   → 'medium'
 * DPS 50–75%   → 'high'
 * DPS > 75%    → 'very_high'
 *
 * @param {number} DPS_pct - Degree of Phosphorus Saturation (%). Must be ≥ 0.
 * @returns {'low'|'medium'|'high'|'very_high'} Risk classification.
 */
export function classifyPhosphorusRisk(DPS_pct: any) {
    if (typeof DPS_pct !== 'number') throw new TypeError('classifyPhosphorusRisk: DPS_pct must be a number');
    if (DPS_pct < 0) throw new RangeError('classifyPhosphorusRisk: DPS_pct must be >= 0');

    if (DPS_pct < 25) return 'low';
    if (DPS_pct < 50) return 'medium';
    if (DPS_pct < 75) return 'high';
    return 'very_high';
}

/**
 * Fits a linearised Langmuir isotherm from a set of (Ce, q) data points
 * using ordinary least squares on the linear form: Ce/q = 1/(b·KL) + Ce/b
 *
 * @param {Array<{Ce: number, q: number}>} data - Array of adsorption data points.
 * @returns {{b_mg_kg: number, KL_L_mg: number, R2: number}} Fitted parameters + R².
 */
export function fitLangmuirLinear(data: any) {
    if (!Array.isArray(data) || data.length < 2) {
        throw new RangeError('fitLangmuirLinear: at least 2 data points required');
    }

    // Linearised form: x = Ce, y = Ce/q → slope = 1/b, intercept = 1/(b·KL)
    const xs = data.map((d) => d.Ce);
    const ys = data.map((d) => d.Ce / d.q);
    const n = xs.length;
    const sumX = xs.reduce((a, v) => a + v, 0);
    const sumY = ys.reduce((a, v) => a + v, 0);
const sumXY = xs.reduce((a, v, i) => a + v * (ys[i] ?? 0), 0);
    const sumX2 = xs.reduce((a, v) => a + v * v, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const b_mg_kg = 1 / slope;
    const KL_L_mg = slope / intercept;

    const yMean = sumY / n;
    const ssTot = ys.reduce((a, v) => a + (v - yMean) ** 2, 0);
    const ssRes = ys.reduce((a, v, i) => a + (v - (slope * xs[i] + intercept)) ** 2, 0);
    const R2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

    return { b_mg_kg, KL_L_mg, R2 };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilPhosphorusAdsorptionMeta = {
    name: 'soilPhosphorusAdsorption',
    description: 'soilPhosphorusAdsorption',
    category: 'analytics',
    familyTags: ['soil', 'hydrocarbon'],
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
