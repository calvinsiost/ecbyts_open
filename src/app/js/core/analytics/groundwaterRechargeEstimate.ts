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
 * Groundwater Recharge Estimate
 * Aquifer recharge estimation using the Water Table Fluctuation (WTF) method,
 * Chloride Mass Balance (CMB), and Chapman baseflow separation filter.
 *
 * References:
 *   Healy, R.W. & Cook, P.G. (2002). Using groundwater levels to estimate recharge.
 *     Hydrogeology Journal, 10(1), 91-109. DOI: 10.1007/s10040-001-0178-0
 *   Scanlon, B.R., Healy, R.W. & Cook, P.G. (2002). Choosing appropriate techniques
 *     for quantifying groundwater recharge. Hydrogeology Journal, 10(1), 18-39.
 *     DOI: 10.1007/s10040-001-0176-2
 *   Chapman, T.G. (1999). A comparison of algorithms for stream flow recession and baseflow
 *     separation. Hydrological Processes, 13(5), 701-714. DOI: 10.1002/(SICI)1099-1085(19990415)
 */

'use strict';

/**
 * Calculates groundwater recharge using the Water Table Fluctuation (WTF) method.
 * R = Sy × Δh
 *
 * The WTF method assumes that rises in the water table are due to recharge
 * and uses the specific yield to convert hydraulic head changes to recharge volume.
 *
 * @param {number} deltah_m - Water table rise in response to a recharge event (m), must be > 0
 * @param {number} Sy       - Specific yield (dimensionless, 0 < Sy ≤ 1)
 * @returns {number} Recharge depth R (mm/event)
 *
 * Reference: Healy & Cook (2002) Hydrogeology Journal 10(1):91-109, eq. 1.
 */
export function calcWTFRecharge(deltah_m: any, Sy: any) {
    if (typeof deltah_m !== 'number' || typeof Sy !== 'number') {
        throw new TypeError('calcWTFRecharge: deltah_m and Sy must be numbers');
    }
    if (deltah_m < 0) {
        throw new RangeError('calcWTFRecharge: deltah_m must be non-negative');
    }
    if (Sy <= 0 || Sy > 1) {
        throw new RangeError('calcWTFRecharge: Sy must be in range (0, 1]');
    }
    // Convert m to mm for output consistency
    return Sy * deltah_m * 1000;
}

/**
 * Calculates annual recharge using the Chloride Mass Balance (CMB) method.
 * R = (Cl_precip / Cl_groundwater) × P
 *
 * Assumes steady-state chloride mass balance: all Cl in groundwater originates
 * from precipitation, with no subsurface Cl sources or sinks.
 *
 * @param {number} Cl_precip_mg_L      - Chloride concentration in precipitation (mg/L)
 * @param {number} Cl_groundwater_mg_L - Chloride concentration in groundwater (mg/L)
 * @param {number} precip_mm_yr        - Mean annual precipitation (mm/yr)
 * @returns {number} Annual recharge R (mm/yr)
 *
 * Reference: Scanlon et al. (2002) Hydrogeology Journal 10(1):18-39, eq. 6.
 */
export function calcCMBRecharge(Cl_precip_mg_L: any, Cl_groundwater_mg_L: any, precip_mm_yr: any) {
    if (
        typeof Cl_precip_mg_L !== 'number' ||
        typeof Cl_groundwater_mg_L !== 'number' ||
        typeof precip_mm_yr !== 'number'
    ) {
        throw new TypeError('calcCMBRecharge: all arguments must be numbers');
    }
    if (Cl_precip_mg_L <= 0) {
        throw new RangeError('calcCMBRecharge: Cl_precip_mg_L must be > 0');
    }
    if (Cl_groundwater_mg_L <= 0) {
        throw new RangeError('calcCMBRecharge: Cl_groundwater_mg_L must be > 0');
    }
    if (precip_mm_yr < 0) {
        throw new RangeError('calcCMBRecharge: precip_mm_yr must be non-negative');
    }
    return (Cl_precip_mg_L / Cl_groundwater_mg_L) * precip_mm_yr;
}

/**
 * Separates baseflow from a streamflow time series using the Chapman recursive digital filter.
 * Q_b(t) = [alpha / (2 - alpha)] × Q_b(t-1) + [(1 - alpha) / (2 - alpha)] × Q(t)
 *
 * Alpha (filter parameter) is typically 0.925 (Chapman 1999).
 * Baseflow is constrained to never exceed total streamflow.
 *
 * @param {number[]} streamflow_series - Array of streamflow values (any unit: m³/s, mm/d, etc.)
 * @param {number}   alpha             - Filter parameter (0 < alpha < 1), typically 0.925
 * @returns {{ baseflow: number[], directRunoff: number[] }} Separated components
 *
 * Reference: Chapman (1999) Hydrological Processes 13(5):701-714, eq. 3.
 */
export function calcBaseflowSeparation(streamflow_series: any, alpha: any) {
    if (!Array.isArray(streamflow_series)) {
        throw new TypeError('calcBaseflowSeparation: streamflow_series must be an array');
    }
    if (typeof alpha !== 'number' || alpha <= 0 || alpha >= 1) {
        throw new RangeError('calcBaseflowSeparation: alpha must be in range (0, 1)');
    }
    if (streamflow_series.length === 0) {
        return { baseflow: [], directRunoff: [] };
    }

    const n = streamflow_series.length;
    const baseflow = new Array(n);
    const directRunoff = new Array(n);

    // Initialise with first value as baseflow
    baseflow[0] = streamflow_series[0];
    directRunoff[0] = 0;

    const k1 = alpha / (2 - alpha);
    const k2 = (1 - alpha) / (2 - alpha);

    for (let i = 1; i < n; i++) {
        const Q = streamflow_series[i];
        if (typeof Q !== 'number' || Q < 0) {
            throw new RangeError(`calcBaseflowSeparation: streamflow_series[${i}] must be a non-negative number`);
        }
        let Qb = k1 * baseflow[i - 1] + k2 * Q;
        // Baseflow cannot exceed total streamflow
        Qb = Math.min(Qb, Q);
        Qb = Math.max(Qb, 0);
        baseflow[i] = Qb;
        directRunoff[i] = Q - Qb;
    }

    return { baseflow, directRunoff };
}

/**
 * Classifies the groundwater recharge rate relative to mean annual precipitation.
 *
 * Classification thresholds (recharge fraction = R / P):
 *   < 2%      → 'very_low'  (arid/semi-arid, low-permeability)
 *   2–5%      → 'low'       (semi-arid, moderate recharge)
 *   5–15%     → 'moderate'  (temperate, well-connected aquifer)
 *   > 15%     → 'high'      (humid, karst or sandy aquifer)
 *
 * @param {number} R_mm_yr         - Annual recharge (mm/yr)
 * @param {number} annualPrecip_mm - Mean annual precipitation (mm/yr)
 * @returns {'very_low'|'low'|'moderate'|'high'} Recharge rate class
 *
 * Reference: Scanlon et al. (2002) Hydrogeology Journal 10(1):18-39, Table 3.
 */
export function classifyRechargeRate(R_mm_yr: any, annualPrecip_mm: any) {
    if (typeof R_mm_yr !== 'number' || typeof annualPrecip_mm !== 'number') {
        throw new TypeError('classifyRechargeRate: R_mm_yr and annualPrecip_mm must be numbers');
    }
    if (R_mm_yr < 0) {
        throw new RangeError('classifyRechargeRate: R_mm_yr must be non-negative');
    }
    if (annualPrecip_mm <= 0) {
        throw new RangeError('classifyRechargeRate: annualPrecip_mm must be > 0');
    }
    const fraction = R_mm_yr / annualPrecip_mm;
    if (fraction < 0.02) return 'very_low';
    if (fraction < 0.05) return 'low';
    if (fraction < 0.15) return 'moderate';
    return 'high';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const groundwaterRechargeEstimateMeta = {
    name: 'groundwaterRechargeEstimate',
    description: 'groundwaterRechargeEstimate',
    category: 'analytics',
    familyTags: ['groundwater', 'water'],
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
