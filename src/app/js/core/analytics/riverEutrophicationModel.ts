// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

'use strict';

/**
 * @module riverEutrophicationModel
 * @description River eutrophication model - Vollenweider (1976) phosphorus retention
 * and Chapra/Reckhow (1979) chlorophyll-a regression, Carlson (1977) TSI classification.
 *
 * References:
 * - Vollenweider, R.A. (1976). Advances in defining critical loading levels for
 *   phosphorus in lake eutrophication. Mem. Ist. Ital. Idrobiol. 33:53-83.
 * - Chapra, S.C. (1997). Surface Water-Quality Modeling. McGraw-Hill. ISBN 0-07-011607-7.
 * - Chapra, S.C. & Reckhow, K.H. (1979). Expressing the phosphorus loading concept
 *   in probabilistic terms. J. Fish. Res. Board Can. 36:225-229.
 * - Carlson, R.E. (1977). A trophic state index for lakes. Limnology & Oceanography
 *   22(2):361-369. DOI: 10.4319/lo.1977.22.2.0361
 */

interface PhosphorusLoadingResult { loadIn_kg_d: number; loadOut_kg_d: number; netLoad_kg_d: number; }
interface VollenweiderResult { qw_m_yr: number; R_P: number; }
interface ChlaResult { chla_ug_L: number; }
interface TrophicStateResult { TSI_TP: number; TSI_Chl: number; TSI_SD: number; TSI_composite: number; trophicClass: 'oligotrophic' | 'mesotrophic' | 'eutrophic' | 'hypereutrophic'; }

/**
 * Calculate net phosphorus loading from inflow/outflow streams.
 *
 * Net load (kg/day) = Q_in × C_in − Q_out × C_out (unit conversion included).
 *
 * @param {number} inputFlow_m3_s  - Inflow discharge (m³/s), ≥0
 * @param {number} Pinflow_mg_L    - Inflow TP concentration (mg/L), ≥0
 * @param {number} outflow_m3_s   - Outflow discharge (m³/s), ≥0
 * @param {number} Poutflow_mg_L  - Outflow TP concentration (mg/L), ≥0
 * @returns {{ loadIn_kg_d: number, loadOut_kg_d: number, netLoad_kg_d: number }}
 */
export function calcPhosphorusLoading(inputFlow_m3_s: number, Pinflow_mg_L: number, outflow_m3_s: number, Poutflow_mg_L: number): PhosphorusLoadingResult {
    if (inputFlow_m3_s < 0 || outflow_m3_s < 0) {
        throw new RangeError('Flow values must be non-negative (m³/s).');
    }
    if (Pinflow_mg_L < 0 || Poutflow_mg_L < 0) {
        throw new RangeError('Phosphorus concentrations must be non-negative (mg/L).');
    }
    // Convert: m³/s × mg/L = g/s → × 86400 s/day × 1e-3 = kg/day
    const SEC_PER_DAY = 86400;
    const G_TO_KG = 1e-3;
    const loadIn_kg_d = inputFlow_m3_s * Pinflow_mg_L * SEC_PER_DAY * G_TO_KG;
    const loadOut_kg_d = outflow_m3_s * Poutflow_mg_L * SEC_PER_DAY * G_TO_KG;
    const netLoad_kg_d = loadIn_kg_d - loadOut_kg_d;
    return { loadIn_kg_d, loadOut_kg_d, netLoad_kg_d };
}

/**
 * Calculate phosphorus retention fraction using Vollenweider (1976) model.
 *
 * R_P = 1 / (1 + v_s / q_s)   where q_s = depth / tau_w  (areal water loading)
 * and v_s is the apparent settling velocity.
 *
 * @param {number} hydraulicResidence_yr - Water residence time τ_w (years), >0
 * @param {number} depth_m              - Mean depth (m), >0
 * @param {number} settling_m_yr        - Apparent settling velocity v_s (m/yr), >0
 * @returns {{ qw_m_yr: number, R_P: number }}
 */
export function calcVollenweiderPRetention(hydraulicResidence_yr: number, depth_m: number, settling_m_yr: number): VollenweiderResult {
    if (hydraulicResidence_yr <= 0) {
        throw new RangeError('Hydraulic residence time must be positive (years).');
    }
    if (depth_m <= 0) {
        throw new RangeError('Mean depth must be positive (m).');
    }
    if (settling_m_yr <= 0) {
        throw new RangeError('Settling velocity must be positive (m/yr).');
    }
    // Areal water loading: q_s = depth / tau_w  (m/yr)
    const qw_m_yr = depth_m / hydraulicResidence_yr;
    const R_P = 1 / (1 + settling_m_yr / qw_m_yr);
    return { qw_m_yr, R_P };
}

/**
 * Estimate chlorophyll-a from total phosphorus using Chapra/Reckhow (1979) regression.
 *
 * ln(Chl-a) = 1.449 × ln(TP) − 1.136   (TP and Chl-a in µg/L)
 *
 * @param {number} TP_ug_L - Total phosphorus concentration (µg/L), >0
 * @returns {{ chla_ug_L: number }}
 */
export function calcChlorophyllA(TP_ug_L: number): ChlaResult {
    if (TP_ug_L <= 0) {
        throw new RangeError('Total phosphorus must be positive (µg/L).');
    }
    // Log-log regression: Chapra & Reckhow (1979)
    const chla_ug_L = Math.exp(1.449 * Math.log(TP_ug_L) - 1.136);
    return { chla_ug_L };
}

/**
 * Classify trophic state using Carlson (1977) TSI for TP, Chl-a and Secchi depth.
 *
 * TSI(TP)   = 14.42 × ln(TP_µg/L) + 4.15
 * TSI(Chl)  = 9.81 × ln(Chl_µg/L) + 30.6
 * TSI(SD)   = 60 − 14.41 × ln(SD_m)
 * Composite = mean of available indices.
 *
 * Classification: <40 oligotrophic | 40-50 mesotrophic | 50-70 eutrophic | >70 hypereutrophic
 *
 * @param {number} TP_ug_L   - Total phosphorus (µg/L), >0
 * @param {number} chla_ug_L - Chlorophyll-a (µg/L), >0
 * @param {number} secchi_m  - Secchi depth (m), >0
 * @returns {{ TSI_TP: number, TSI_Chl: number, TSI_SD: number, TSI_composite: number,
 *             trophicClass: string }}
 */
export function classifyTrophicState(TP_ug_L: number, chla_ug_L: number, secchi_m: number): TrophicStateResult {
    if (TP_ug_L <= 0 || chla_ug_L <= 0 || secchi_m <= 0) {
        throw new RangeError('TP, Chl-a and Secchi depth must be positive.');
    }
    const TSI_TP = 14.42 * Math.log(TP_ug_L) + 4.15;
    const TSI_Chl = 9.81 * Math.log(chla_ug_L) + 30.6;
    const TSI_SD = 60 - 14.41 * Math.log(secchi_m);
    const TSI_composite = (TSI_TP + TSI_Chl + TSI_SD) / 3;

    let trophicClass: 'oligotrophic' | 'mesotrophic' | 'eutrophic' | 'hypereutrophic';
    if (TSI_composite < 40) {
        trophicClass = 'oligotrophic';
    } else if (TSI_composite < 50) {
        trophicClass = 'mesotrophic';
    } else if (TSI_composite <= 70) {
        trophicClass = 'eutrophic';
    } else {
        trophicClass = 'hypereutrophic';
    }

    return { TSI_TP, TSI_Chl, TSI_SD, TSI_composite, trophicClass };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const riverEutrophicationModelMeta = {
    name: 'riverEutrophicationModel',
    description: 'riverEutrophicationModel',
    category: 'analytics',
    familyTags: ['river', 'eutrophication', 'ecological_network'],
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
