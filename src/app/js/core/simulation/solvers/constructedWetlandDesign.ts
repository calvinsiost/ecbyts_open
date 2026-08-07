'use strict';
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constructed Wetland Design - pure-math solver module.
 *
 * Implements design and performance models for Free Water Surface (FWS) and
 * Subsurface Flow (SSF) constructed wetlands following established references:
 *   Reed, Crites & Tchobanoglous (1995) - first-order plug-flow BOD/TSS removal
 *   Kadlec & Knight (1996) - k-C* coliform and nitrogen models
 *   Kadlec & Wallace (2009) - HLR limits, phosphorus, TSS constants
 *   Blazejewski & Murat-Blazejewska (1997) - SSF clogging index
 *   FAO-56 Penman-Monteith - reference evapotranspiration
 *   USEPA (2000) - constructed wetland cost manual
 *
 * No browser, DOM, Three.js, IDB, or fetch dependencies.
 *
 * @module constructedWetlandDesign
 */

// ---------------------------------------------------------------------------
// Internal constants (frozen)
// ---------------------------------------------------------------------------

type WetlandType = 'fws' | 'ssf';
type ClimateZone = 'tropical' | 'temperate' | 'arid';

interface InfluentParams {
    BOD5: number;
    TSS: number;
    TN: number;
    TP: number;
    fecalColiform_CFU100mL: number;
}

/** Default depths (m) */
const DEPTHS = Object.freeze({ fws: 0.3, ssf: 0.6 } as const);

/** BOD5 first-order rate constants at 20°C (d⁻¹) */
const K20_BOD = Object.freeze({ fws: 0.678, ssf: 1.104 } as const);

/** BOD temperature correction factor (theta) */
const THETA_BOD = 1.06;

/** TN area-based rate constants at 20°C (m/d) — Kadlec & Knight (1996) */
const K20_TN = Object.freeze({ fws: 0.0675, ssf: 0.098 } as const);

/** TN background concentration C* (mg/L) */
const CSTAR_TN = Object.freeze({ fws: 1.5, ssf: 2.0 } as const);

/** TN temperature correction factor */
const THETA_TN = 1.05;

/** TP area-based rate constant at 20°C (m/d) — Kadlec & Wallace (2009) */
const K20_TP = 0.0274;

/** TP background concentration C* (mg/L) */
const CSTAR_TP = 0.02;

/** TP temperature correction factor */
const THETA_TP = 1.03;

/** TSS area-based rate constants at 20°C (m/d) */
const K20_TSS = Object.freeze({ fws: 0.1139, ssf: 0.3199 } as const);

/** TSS background concentrations C* (mg/L) */
const CSTAR_TSS = Object.freeze({ fws: 5.1, ssf: 2.0 } as const);

/** TSS temperature correction factor */
const THETA_TSS = 1.065;

/** Coliform first-order rate constants at 20°C (d⁻¹) */
const K20_COLIFORM = Object.freeze({ fws: 0.274, ssf: 0.835 } as const);

/** Coliform temperature correction factor — Kadlec & Knight (1996) */
const THETA_COLIFORM = 1.19;

/** SSF gravel media porosity */
const SSF_POROSITY = 0.35;

/** Recommended max hydraulic loading rates (m/d) */
const MAX_HLR = Object.freeze({ fws: 0.07, ssf: 0.25 } as const);

/** Max N loading (kg/ha/yr) for FWS */
const MAX_N_LOADING_FWS = 350;

/** Unit cost base (USD/m²) */
const UNIT_COST = Object.freeze({ fws: 28, ssf: 55 } as const);

/** Climate zone cost multipliers */
const CLIMATE_MULT = Object.freeze({ tropical: 0.9, temperate: 1.0, arid: 1.15 } as const);

/** Long-term P accumulation rate (Kadlec & Wallace 2009 Table 9-5) */
const P_ACCUM_G_M2_YR = 1.0;

/** CW crop factor for emergent macrophytes */
const KC_CW = 1.2;

/** Psychrometric constant (kPa/°C) at standard pressure */
const GAMMA = 0.067;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Temperature-corrected rate constant: k20 × theta^(T-20)
 * @param k20 - rate constant at 20°C
 * @param theta - temperature correction factor
 * @param T_C - temperature (°C)
 * @returns temperature-corrected rate constant
 */
function tempCorrect(k20: number, theta: number, T_C: number): number {
    return k20 * Math.pow(theta, T_C - 20);
}

/**
 * Validate that a numeric argument is finite and optionally > 0.
 * @param val - value to validate
 * @param name - parameter name for error messages
 * @param mustPositive - whether value must be positive (default true)
 */
function requireFinite(val: number, name: string, mustPositive = true): void {
    if (!Number.isFinite(val)) throw new RangeError(`${name} must be a finite number, got ${val}`);
    if (mustPositive && val <= 0) throw new RangeError(`${name} must be > 0, got ${val}`);
}

/**
 * Validate CW type string.
 * @param type - wetland type
 */
function requireType(type: string): asserts type is WetlandType {
    if (type !== 'fws' && type !== 'ssf') throw new RangeError(`type must be 'fws' or 'ssf', got ${type}`);
}

// ---------------------------------------------------------------------------
// 1. Free Water Surface Design - Reed, Crites & Tchobanoglous (1995)
// ---------------------------------------------------------------------------

/**
 * Design a Free Water Surface (FWS) constructed wetland for BOD5 removal.
 *
 * First-order plug-flow model (Reed et al. 1995):
 *   kT = k20 × 1.06^(T−20)
 *   HRT = ln(Cin/Cout) / kT
 *   As  = Q × HRT / depth
 *
 * @param flowM3d - Influent flow rate (m³/d)
 * @param influentBOD5 - Influent BOD5 concentration (mg/L)
 * @param effluentBOD5 - Target effluent BOD5 concentration (mg/L)
 * @param temperature_C - Water temperature (°C)
 * @returns design parameters
 */
export function freeWaterSurfaceDesign(flowM3d: number, influentBOD5: number, effluentBOD5: number, temperature_C: number): { kT_d: number; HRT_d: number; surfaceAreaM2: number; volumeM3: number; hydraulicLoading_m_d: number } {
    requireFinite(flowM3d, 'flowM3d');
    requireFinite(influentBOD5, 'influentBOD5');
    requireFinite(effluentBOD5, 'effluentBOD5');
    requireFinite(temperature_C, 'temperature_C', false);
    if (effluentBOD5 >= influentBOD5) throw new RangeError('effluentBOD5 must be < influentBOD5');

    const depthM = DEPTHS.fws; // 0.3 m
    const kT = tempCorrect(K20_BOD.fws, THETA_BOD, temperature_C);
    const HRT_d = Math.log(influentBOD5 / effluentBOD5) / kT;
    const surfaceAreaM2 = (flowM3d * HRT_d) / depthM;
    const volumeM3 = surfaceAreaM2 * depthM;
    const hydraulicLoading_m_d = flowM3d / surfaceAreaM2;

    return {
        kT_d: kT,
        HRT_d,
        surfaceAreaM2,
        volumeM3,
        hydraulicLoading_m_d,
    };
}

// ---------------------------------------------------------------------------
// 2. Subsurface Flow Design - Kickuth (1977) / Vymazal (2014)
// ---------------------------------------------------------------------------

/**
 * Design a Subsurface Flow (SSF) constructed wetland for BOD5 removal.
 *
 * Uses higher k20 = 1.104 d⁻¹ (root-zone microbial activity) with porosity correction.
 *
 * @param flowM3d - Influent flow rate (m³/d)
 * @param influentBOD5 - Influent BOD5 concentration (mg/L)
 * @param effluentBOD5 - Target effluent BOD5 concentration (mg/L)
 * @param temperature_C - Water temperature (°C)
 * @returns design parameters
 */
export function subsurfaceFlowDesign(flowM3d: number, influentBOD5: number, effluentBOD5: number, temperature_C: number): { kT_d: number; HRT_d: number; surfaceAreaM2: number; mediaVolumeM3: number; porosityAssumed: number } {
    requireFinite(flowM3d, 'flowM3d');
    requireFinite(influentBOD5, 'influentBOD5');
    requireFinite(effluentBOD5, 'effluentBOD5');
    requireFinite(temperature_C, 'temperature_C', false);
    if (effluentBOD5 >= influentBOD5) throw new RangeError('effluentBOD5 must be < influentBOD5');

    const depthM = DEPTHS.ssf; // 0.6 m
    const n = SSF_POROSITY; // 0.35
    const kT = tempCorrect(K20_BOD.ssf, THETA_BOD, temperature_C);
    const HRT_d = Math.log(influentBOD5 / effluentBOD5) / kT;
    const surfaceAreaM2 = (flowM3d * HRT_d) / (n * depthM);
    const mediaVolumeM3 = surfaceAreaM2 * depthM;

    return {
        kT_d: kT,
        HRT_d,
        surfaceAreaM2,
        mediaVolumeM3,
        porosityAssumed: n,
    };
}

// ---------------------------------------------------------------------------
// 3. Nitrogen Removal - Kadlec & Knight (1996) k-C* model
// ---------------------------------------------------------------------------

/**
 * Size a constructed wetland for total nitrogen (TN) removal using the k-C* model.
 *
 * k-C* (Kadlec & Knight 1996):
 *   As = Q / kT × ln((Cin − C*) / (Cout − C*))
 *
 * @param influentTN_mgL - Influent TN (mg/L)
 * @param effluentTarget_mgL - Target effluent TN (mg/L)
 * @param flowM3d - Flow rate (m³/d)
 * @param temperature_C - Temperature (°C)
 * @param type - Wetland type
 * @returns sizing parameters
 */
export function nitrogenRemoval(influentTN_mgL: number, effluentTarget_mgL: number, flowM3d: number, temperature_C: number, type: WetlandType): { surfaceAreaM2: number; kT_mPerDay: number; backgroundConc_mgL: number; HLR: number } {
    requireFinite(influentTN_mgL, 'influentTN_mgL');
    requireFinite(effluentTarget_mgL, 'effluentTarget_mgL');
    requireFinite(flowM3d, 'flowM3d');
    requireFinite(temperature_C, 'temperature_C', false);
    requireType(type);

    const cstar = CSTAR_TN[type];
    if (effluentTarget_mgL <= cstar) {
        throw new RangeError(
            `Target effluent TN (${effluentTarget_mgL} mg/L) is at or below background C* (${cstar} mg/L) — impossible with k-C* model`,
        );
    }
    if (influentTN_mgL <= cstar) {
        throw new RangeError(`Influent TN must be > background C* (${cstar} mg/L)`);
    }
    if (effluentTarget_mgL >= influentTN_mgL) throw new RangeError('effluentTarget must be < influentTN_mgL');

    const kT = tempCorrect(K20_TN[type], THETA_TN, temperature_C);
    const surfaceAreaM2 = (flowM3d / kT) * Math.log((influentTN_mgL - cstar) / (effluentTarget_mgL - cstar));
    const HLR = flowM3d / surfaceAreaM2;

    return {
        surfaceAreaM2,
        kT_mPerDay: kT,
        backgroundConc_mgL: cstar,
        HLR,
    };
}

// ---------------------------------------------------------------------------
// 4. Phosphorus Removal - Kadlec & Wallace (2009)
// ---------------------------------------------------------------------------

/**
 * Size a constructed wetland for total phosphorus (TP) removal.
 *
 * Uses conservative k-C* model with low temperature sensitivity.
 * Also estimates long-term lifespan based on P accumulation.
 *
 * @param influentTP_mgL - Influent TP (mg/L)
 * @param effluentTarget_mgL - Target effluent TP (mg/L)
 * @param flowM3d - Flow rate (m³/d)
 * @param temperature_C - Temperature (°C)
 * @returns sizing parameters
 */
export function phosphorusRemoval(influentTP_mgL: number, effluentTarget_mgL: number, flowM3d: number, temperature_C: number): { surfaceAreaM2: number; kT_mPerDay: number; longTermAccumulationGm2yr: number; projectedLifespanYrs: number } {
    requireFinite(influentTP_mgL, 'influentTP_mgL');
    requireFinite(effluentTarget_mgL, 'effluentTarget_mgL');
    requireFinite(flowM3d, 'flowM3d');
    requireFinite(temperature_C, 'temperature_C', false);

    if (effluentTarget_mgL <= CSTAR_TP) {
        throw new RangeError(
            `Target effluent TP (${effluentTarget_mgL} mg/L) is at or below background C* (${CSTAR_TP} mg/L) — impossible`,
        );
    }
    if (influentTP_mgL <= CSTAR_TP) throw new RangeError(`Influent TP must be > background C* (${CSTAR_TP} mg/L)`);
    if (effluentTarget_mgL >= influentTP_mgL) throw new RangeError('effluentTarget must be < influentTP_mgL');

    const kT = tempCorrect(K20_TP, THETA_TP, temperature_C);
    const surfaceAreaM2 = (flowM3d / kT) * Math.log((influentTP_mgL - CSTAR_TP) / (effluentTarget_mgL - CSTAR_TP));

    // Annual P load in grams: Q × Cin × 365 × 1000 (m³/d × mg/L → g/d × 1000 → g/yr)
    // P accumulation rate: 1.0 g/m²/yr
    // Lifespan = total_P_removed_capacity / annual_P_load = (1.0 × As × 1000) / (Q × Cin × 365)
    // Simplified from spec: projectedLifespanYrs = (Cin × Q × 365) / (1.0 × As × 1000)
    const projectedLifespanYrs = (influentTP_mgL * flowM3d * 365) / (P_ACCUM_G_M2_YR * surfaceAreaM2 * 1000);

    return {
        surfaceAreaM2,
        kT_mPerDay: kT,
        longTermAccumulationGm2yr: P_ACCUM_G_M2_YR,
        projectedLifespanYrs,
    };
}

// ---------------------------------------------------------------------------
// 5. Pathogen Removal - Kadlec & Knight (1996) coliform model
// ---------------------------------------------------------------------------

/**
 * Size a constructed wetland for fecal coliform removal.
 *
 * First-order coliform removal (Kadlec & Knight 1996):
 *   kT = k20 × 1.19^(T−20)
 *   HRT = logReduction × ln(10) / kT
 *   As  = Q × HRT / depth
 *
 * @param influentLogCFU - Influent log10 CFU/100mL (e.g. 6 for 10^6 CFU/100mL)
 * @param targetLogReduction - Required log10 reduction (e.g. 4 for 4-log removal)
 * @param flowM3d - Flow rate (m³/d)
 * @param type - Wetland type
 * @param temperature_C - Temperature (°C), default 20
 * @returns sizing parameters
 */
export function pathogenRemoval(influentLogCFU: number, targetLogReduction: number, flowM3d: number, type: WetlandType, temperature_C = 20): { HRT_d: number; surfaceAreaM2: number; kT_d: number; logRemovalAchievable: number } {
    requireFinite(influentLogCFU, 'influentLogCFU');
    requireFinite(targetLogReduction, 'targetLogReduction');
    requireFinite(flowM3d, 'flowM3d');
    requireType(type);
    requireFinite(temperature_C, 'temperature_C', false);

    const depthM = DEPTHS[type];
    const kT = tempCorrect(K20_COLIFORM[type], THETA_COLIFORM, temperature_C);
    const HRT_needed = (targetLogReduction * Math.LN10) / kT;
    const surfaceAreaM2 = (flowM3d * HRT_needed) / depthM;
    // Log removal achievable = kT × HRT / ln(10)
    const logRemovalAchievable = (kT * HRT_needed) / Math.LN10;

    return {
        HRT_d: HRT_needed,
        surfaceAreaM2,
        kT_d: kT,
        logRemovalAchievable,
    };
}

// ---------------------------------------------------------------------------
// 6. Hydraulic Loading Rate - Kadlec & Wallace (2009)
// ---------------------------------------------------------------------------

/**
 * Evaluate hydraulic and nitrogen loading for an existing or proposed wetland.
 *
 * @param flowM3d - Flow rate (m³/d)
 * @param surfaceAreaM2 - Wetland surface area (m²)
 * @param type - Wetland type
 * @param influentTN_mgL? - Influent TN (mg/L); optional, skips N loading calc if absent
 * @returns loading evaluation
 */
export function hydraulicLoadingRate(flowM3d: number, surfaceAreaM2: number, type: WetlandType, influentTN_mgL?: number): { HLR_mPerDay: number; withinLimit: boolean; maxHLR: number; nitrogenLoading_kgHaYr: number | null; exceedNitrogenLimit: boolean | null } {
    requireFinite(flowM3d, 'flowM3d');
    requireFinite(surfaceAreaM2, 'surfaceAreaM2');
    requireType(type);

    const HLR_mPerDay = flowM3d / surfaceAreaM2;
    const maxHLR = MAX_HLR[type];
    const withinLimit = HLR_mPerDay <= maxHLR;

    let nitrogenLoading_kgHaYr: number | null = null;
    let exceedNitrogenLimit: boolean | null = null;

    if (influentTN_mgL !== undefined && influentTN_mgL !== null) {
        requireFinite(influentTN_mgL, 'influentTN_mgL');
        // HLR [m/d] × Cin [mg/L] = m/d × g/m³ = g/m²/d
        // × 365 d/yr × 10 (m² → ha factor = 10000/1000) → kg/ha/yr
        nitrogenLoading_kgHaYr = (HLR_mPerDay * influentTN_mgL * 365 * 10) / 1000;
        exceedNitrogenLimit = type === 'fws' ? nitrogenLoading_kgHaYr > MAX_N_LOADING_FWS : false;
    }

    return {
        HLR_mPerDay,
        withinLimit,
        maxHLR,
        nitrogenLoading_kgHaYr,
        exceedNitrogenLimit,
    };
}

// ---------------------------------------------------------------------------
// 7. Evapotranspiration - FAO-56 Penman-Monteith (simplified)
// ---------------------------------------------------------------------------

/**
 * Estimate reference and crop evapotranspiration using simplified Penman-Monteith (FAO-56).
 *
 * @param temperature_C - Mean air temperature (°C)
 * @param solarRadiation_MJm2d - Incoming solar radiation (MJ/m²/d)
 * @param humidity_pct - Relative humidity (%)
 * @param windSpeed_ms - Wind speed at 2 m height (m/s)
 * @returns evapotranspiration parameters
 */
export function moundedBedEvapotranspiration(temperature_C: number, solarRadiation_MJm2d: number, humidity_pct: number, windSpeed_ms: number): { ET0_mm_d: number; ETc_mm_d: number; Rn_MJm2d: number; delta: number; es_kPa: number; ea_kPa: number } {
    requireFinite(temperature_C, 'temperature_C', false);
    requireFinite(solarRadiation_MJm2d, 'solarRadiation_MJm2d');
    requireFinite(humidity_pct, 'humidity_pct');
    requireFinite(windSpeed_ms, 'windSpeed_ms');

    const T = temperature_C;
    const Rn = solarRadiation_MJm2d * 0.77; // net radiation (albedo 0.23)
    const u2 = windSpeed_ms;

    // Saturation vapour pressure (kPa)
    const es = 0.6108 * Math.exp((17.27 * T) / (T + 237.3));
    // Actual vapour pressure
    const ea = es * (humidity_pct / 100);
    // Slope of saturation vapour pressure curve (kPa/°C)
    const delta = (4098 * 0.6108 * Math.exp((17.27 * T) / (T + 237.3))) / Math.pow(T + 237.3, 2);

    const gamma = GAMMA;

    // FAO-56 PM reference ET (mm/d)
    const ET0_mm_d = (0.408 * Rn + gamma * (900 / (T + 273)) * u2 * (es - ea)) / (delta + gamma * (1 + 0.34 * u2));

    const ETc_mm_d = ET0_mm_d * KC_CW;

    return {
        ET0_mm_d,
        ETc_mm_d,
        Rn_MJm2d: Rn,
        delta,
        es_kPa: es,
        ea_kPa: ea,
    };
}

// ---------------------------------------------------------------------------
// 8. Clogging Risk - Blazejewski & Murat-Blazejewska (1997)
// ---------------------------------------------------------------------------

/**
 * Estimate SSF clogging risk using the empirical clogging index.
 *
 * CI = organicLoading × TSS_influent / (grainSize × HRT)
 * Risk: CI < 50 → low; < 200 → medium; ≥ 200 → high
 *
 * @param organicLoadingGM2D - Organic (BOD) surface loading (g/m²/d)
 * @param suspendedSolidsInfluent_mgL - Influent TSS (mg/L)
 * @param mediaGrainSize_mm - Media effective grain size (mm)
 * @param HRT_d - Hydraulic retention time (d)
 * @returns clogging risk assessment
 */
export function cloggingRisk(organicLoadingGM2D: number, suspendedSolidsInfluent_mgL: number, mediaGrainSize_mm: number, HRT_d: number): { cloggingIndex: number; riskCategory: string; recommendedPretreatment: boolean } {
    requireFinite(organicLoadingGM2D, 'organicLoadingGM2D');
    requireFinite(suspendedSolidsInfluent_mgL, 'suspendedSolidsInfluent_mgL');
    requireFinite(mediaGrainSize_mm, 'mediaGrainSize_mm');
    requireFinite(HRT_d, 'HRT_d');

    const CI = (organicLoadingGM2D * suspendedSolidsInfluent_mgL) / (mediaGrainSize_mm * HRT_d);

    let riskCategory: string;
    if (CI < 50) riskCategory = 'low';
    else if (CI < 200) riskCategory = 'medium';
    else riskCategory = 'high';

    return {
        cloggingIndex: CI,
        riskCategory,
        recommendedPretreatment: suspendedSolidsInfluent_mgL > 100,
    };
}

// ---------------------------------------------------------------------------
// 9. Construction Cost Estimate - USEPA (2000) CW Cost Manual
// ---------------------------------------------------------------------------

/**
 * Estimate capital and life-cycle costs for a constructed wetland.
 *
 * @param surfaceAreaM2 - Wetland surface area (m²)
 * @param type - Wetland type
 * @param climateZone - Climate zone
 * @param flowM3d? - Optional flow rate for unit cost per m³; defaults to HLR=0.05 m/d
 * @returns cost estimate
 */
export function constructionCostEstimate(surfaceAreaM2: number, type: WetlandType, climateZone: ClimateZone, flowM3d?: number): { capitalCostUSD: number; annualOM_USD: number; twentyYrLCC: number; costPerM3treated: number } {
    requireFinite(surfaceAreaM2, 'surfaceAreaM2');
    requireType(type);
    if (!Object.prototype.hasOwnProperty.call(CLIMATE_MULT, climateZone)) {
        throw new RangeError(`climateZone must be 'tropical', 'temperate', or 'arid', got ${climateZone}`);
    }

    const baseUnitCost = UNIT_COST[type]; // USD/m²
    const mult = CLIMATE_MULT[climateZone];
    const capitalCostUSD = surfaceAreaM2 * baseUnitCost * mult;
    const annualOM_USD = capitalCostUSD * 0.05;
    const twentyYrLCC = capitalCostUSD + 20 * annualOM_USD;

    // Default HLR if flow not provided: 0.05 m/d (midrange FWS)
    const effectiveFlow =
        flowM3d !== undefined && flowM3d !== null && Number.isFinite(flowM3d) && flowM3d > 0
            ? flowM3d
            : surfaceAreaM2 * 0.05;

    const costPerM3treated = capitalCostUSD / (effectiveFlow * 365);

    return {
        capitalCostUSD,
        annualOM_USD,
        twentyYrLCC,
        costPerM3treated,
    };
}

// ---------------------------------------------------------------------------
// 10. Effluent Quality Projection - integrated multi-parameter prediction
// ---------------------------------------------------------------------------

/**
 * Project effluent quality for multiple parameters using the k-C* first-order model
 * applied across the wetland area.
 *
 * @param influentParams - Influent concentrations
 * @param CWtype - Wetland type
 * @param surfaceAreaM2 - Available wetland surface area (m²)
 * @param flowM3d - Flow rate (m³/d)
 * @param temperature_C - Temperature (°C)
 * @returns effluent projection
 */
export function effluentQualityProjection(influentParams: InfluentParams, CWtype: WetlandType, surfaceAreaM2: number, flowM3d: number, temperature_C: number): { effluent: { BOD5: number; TSS: number; TN: number; TP: number; fecalColiform_CFU100mL: number }; removals: { BOD5_pct: number; TSS_pct: number; TN_pct: number; TP_pct: number; fecalColiform_logUnits: number }; HLR: number } {
    requireType(CWtype);
    requireFinite(surfaceAreaM2, 'surfaceAreaM2');
    requireFinite(flowM3d, 'flowM3d');
    requireFinite(temperature_C, 'temperature_C', false);

    const { BOD5, TSS, TN, TP, fecalColiform_CFU100mL } = influentParams;
    requireFinite(BOD5, 'influentParams.BOD5');
    requireFinite(TSS, 'influentParams.TSS');
    requireFinite(TN, 'influentParams.TN');
    requireFinite(TP, 'influentParams.TP');
    requireFinite(fecalColiform_CFU100mL, 'influentParams.fecalColiform_CFU100mL');

    const HLR = flowM3d / surfaceAreaM2; // m/d

    // Internal helper: k-C* effluent prediction given area-based k
    // Cout = C* + (Cin - C*) × exp(-kT × As / Q)
    function kCstar(Cin: number, cstar: number, k20: number, theta: number): number {
        const kT = tempCorrect(k20, theta, temperature_C);
        const Cout = cstar + (Cin - cstar) * Math.exp((-kT * surfaceAreaM2) / flowM3d);
        return Math.max(cstar, Cout);
    }

    // BOD5 - volumetric k (d⁻¹) × effective pore volume / Q gives plug-flow HRT
    const kBOD_vol = tempCorrect(K20_BOD[CWtype], THETA_BOD, temperature_C);
    const depthBOD = DEPTHS[CWtype];
    const efflBOD5 = BOD5 * Math.exp((-kBOD_vol * (surfaceAreaM2 * depthBOD)) / flowM3d);

    // TSS
    const efflTSS = kCstar(TSS, CSTAR_TSS[CWtype], K20_TSS[CWtype], THETA_TSS);

    // TN
    const cstarTN = CSTAR_TN[CWtype];
    const efflTN = TN > cstarTN ? kCstar(TN, cstarTN, K20_TN[CWtype], THETA_TN) : TN;

    // TP
    const efflTP = TP > CSTAR_TP ? kCstar(TP, CSTAR_TP, K20_TP, THETA_TP) : TP;

    // Fecal coliform - first-order volumetric, no C* background
    const kCol_vol = tempCorrect(K20_COLIFORM[CWtype], THETA_COLIFORM, temperature_C);
    const depthCol = DEPTHS[CWtype];
    const efflColiform = fecalColiform_CFU100mL * Math.exp((-kCol_vol * (surfaceAreaM2 * depthCol)) / flowM3d);

    // Removals
    const BOD5_pct = ((BOD5 - efflBOD5) / BOD5) * 100;
    const TSS_pct = ((TSS - efflTSS) / TSS) * 100;
    const TN_pct = ((TN - efflTN) / TN) * 100;
    const TP_pct = ((TP - efflTP) / TP) * 100;
    const fecalColiform_logUnits = efflColiform > 0 ? Math.log10(fecalColiform_CFU100mL / efflColiform) : Infinity;

    return {
        effluent: {
            BOD5: efflBOD5,
            TSS: efflTSS,
            TN: efflTN,
            TP: efflTP,
            fecalColiform_CFU100mL: efflColiform,
        },
        removals: {
            BOD5_pct,
            TSS_pct,
            TN_pct,
            TP_pct,
            fecalColiform_logUnits,
        },
        HLR,
    };
}
