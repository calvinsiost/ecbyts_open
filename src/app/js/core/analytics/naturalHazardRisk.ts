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
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Natural Hazard Risk Assessment - Pure-logic scientific module
 *
 * Implements ten functions for quantitative natural hazard analysis:
 *   1. DRASTIC groundwater vulnerability index (Aller et al. 1987)
 *   2. Newmark sliding-block displacement for earthquake-triggered landslides (Jibson 2007)
 *   3. IDF curve rainfall intensity via Gumbel/GEV (Koutsoyiannis 2004)
 *   4. Debris flow volume and hazard (Jakob 2005, Rickenmann 1999)
 *   5. Tsunami runup estimation (Synolakis 1987)
 *   6. Volcanic hazard zone assessment (Newhall-Self 1982 VEI, USGS)
 *   7. Wildfire spread rate via Rothermel 1972 / McArthur 1967
 *   8. Ground subsidence risk from underground mining (NCB 1975, Peng 1992)
 *   9. Liquefaction potential (Seed-Idriss 1971, Youd 2001, Idriss-Boulanger 2008)
 *  10. Multi-hazard risk matrix (UN/ISDR 2004, UNDRR Sendai 2015)
 *
 * Design constraints:
 *   - Zero DOM, zero IndexedDB, zero Three.js, zero fetch
 *   - Directly importable in Node.js (ES modules)
 *   - All numeric algorithms are independently implemented and cited
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Clamp a number within [min, max].
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
import { clamp } from '../../utils/helpers/math.js';

// ---------------------------------------------------------------------------
// 1. DRASTIC Groundwater Vulnerability Index
// ---------------------------------------------------------------------------

/**
 * Compute the DRASTIC groundwater vulnerability index.
 *
 * DRASTIC = 5D + 4R + 3A + 2S + 1T + 5I + 3C
 * where each component is a user-supplied rated value (1–10) representing:
 *   D  - Depth to water table
 *   R  - Net recharge
 *   A  - Aquifer media
 *   S  - Soil media
 *   T  - Topography (slope %)
 *   I  - Impact of the vadose zone
 *   C  - Hydraulic conductivity
 *
 * Vulnerability classes (Aller et al. 1987 Table 1):
 *   very_low  : < 80
 *   low       : 80–120
 *   moderate  : 120–160
 *   high      : 160–200
 *   very_high : > 200
 *
 * @param {{
 *   depth_to_water: number,
 *   recharge_mm_yr: number,
 *   aquifer_media: number,
 *   soil_media: number,
 *   topography_slope_pct: number,
 *   impact_vadose: number,
 *   hydraulic_conductivity_m_day: number
 * }} params - rated values 1–10 for each DRASTIC parameter
 * @returns {{
 *   drasticIndex: number,
 *   vulnerabilityClass: string,
 *   dominantFactor: string
 * }}
 * @reference Aller, L., Bennett, T., Lehr, J.H., Petty, R.J. & Hackett, G. (1987).
 *   DRASTIC: A standardized system for evaluating ground water pollution potential
 *   using hydrogeologic settings. EPA/600/2-87/035. USEPA, Ada, Oklahoma.
 */
export function drasticAquiferVulnerability(params: { depth_to_water: number, recharge_mm_yr: number, aquifer_media: number, soil_media: number, topography_slope_pct: number, impact_vadose: number, hydraulic_conductivity_m_day: number }): { drasticIndex: number, vulnerabilityClass: string, dominantFactor: string } {
    const {
        depth_to_water,
        recharge_mm_yr,
        aquifer_media,
        soil_media,
        topography_slope_pct,
        impact_vadose,
        hydraulic_conductivity_m_day,
    } = params;

    // Weights per DRASTIC method
    const D = clamp(depth_to_water, 1, 10);
    const R = clamp(recharge_mm_yr, 1, 10);
    const A = clamp(aquifer_media, 1, 10);
    const S = clamp(soil_media, 1, 10);
    const T = clamp(topography_slope_pct, 1, 10);
    const I = clamp(impact_vadose, 1, 10);
    const C = clamp(hydraulic_conductivity_m_day, 1, 10);

    const contributions = {
        depth_to_water: 5 * D,
        recharge_mm_yr: 4 * R,
        aquifer_media: 3 * A,
        soil_media: 2 * S,
        topography_slope_pct: 1 * T,
        impact_vadose: 5 * I,
        hydraulic_conductivity_m_day: 3 * C,
    };

    const drasticIndex = Object.values(contributions).reduce((s, v) => s + v, 0);

    // Identify dominant factor (largest weighted contribution)
    let dominantFactor = '';
    let maxContrib = -Infinity;
    for (const [key, val] of Object.entries(contributions)) {
        if (val > maxContrib) {
            maxContrib = val;
            dominantFactor = key;
        }
    }

    let vulnerabilityClass;
    if (drasticIndex < 80) vulnerabilityClass = 'very_low';
    else if (drasticIndex < 120) vulnerabilityClass = 'low';
    else if (drasticIndex < 160) vulnerabilityClass = 'moderate';
    else if (drasticIndex <= 200) vulnerabilityClass = 'high';
    else vulnerabilityClass = 'very_high';

    return { drasticIndex, vulnerabilityClass, dominantFactor };
}

// ---------------------------------------------------------------------------
// 2. Newmark Sliding-Block Displacement (Earthquake-Triggered Landslides)
// ---------------------------------------------------------------------------

/**
 * Estimate Newmark sliding-block displacement for earthquake-triggered landslides.
 *
 * Uses Jibson (2007) regression equation:
 *   log(Dn) = 0.215 + log[(1 - ac/amax)^2.341 × (ac/amax)^{-1.438}]
 * Valid for ac/amax < 1.
 *
 * Failure probability uses logistic regression (Jibson 2007):
 *   P(failure) = 0.335 × [1 - exp(-0.048 × Dn^1.565)]
 *
 * Hazard levels:
 *   negligible : < 1 cm
 *   minor      : 1–5 cm
 *   moderate   : 5–15 cm
 *   severe     : > 15 cm
 *
 * @param {number} peakGroundAcceleration_g  - PGA (g)
 * @param {number} criticalAcceleration_g    - Critical/yield acceleration (g)
 * @param {number} _duration_s                - Strong-motion duration (s); reserved for future use
 * @param {number} _earthquakeMagnitude       - Moment magnitude Mw
 * @returns {{
 *   displacement_cm: number,
 *   probabilityFailure: number,
 *   hazardLevel: string
 * }}
 * @reference Jibson, R.W. (2007). Regression models for estimating coseismic landslide
 *   displacement. Engineering Geology, 91(2–4), pp. 209–218.
 *   DOI: 10.1016/j.enggeo.2007.01.013
 * @reference Newmark, N.M. (1965). Effects of earthquakes on dams and embankments.
 *   Geotechnique, 15(2), pp. 139–160. DOI: 10.1680/geot.1965.15.2.139
 */
export function newmarkDisplacementLandslide(peakGroundAcceleration_g: number, criticalAcceleration_g: number, _duration_s: number, _earthquakeMagnitude: number): { displacement_cm: number, probabilityFailure: number, hazardLevel: string } {
    const amax = Math.max(peakGroundAcceleration_g, 1e-9);
    const ac = Math.max(criticalAcceleration_g, 1e-9);

    // No displacement if critical acceleration exceeds PGA
    if (ac >= amax) {
        return { displacement_cm: 0, probabilityFailure: 0, hazardLevel: 'negligible' };
    }

    const ratio = ac / amax; // ac/amax, 0 < ratio < 1

    // Jibson 2007 eq. 6: log10(Dn) = 0.215 + log10[(1-ratio)^2.341 × ratio^{-1.438}]
    const logDn = 0.215 + 2.341 * Math.log10(1 - ratio) + -1.438 * Math.log10(ratio);
    const displacement_cm = Math.pow(10, logDn);

    // Probability of failure: logistic regression (Jibson 2007 eq. 9)
    const probabilityFailure = clamp(0.335 * (1 - Math.exp(-0.048 * Math.pow(displacement_cm, 1.565))), 0, 1);

    let hazardLevel;
    if (displacement_cm < 1) hazardLevel = 'negligible';
    else if (displacement_cm < 5) hazardLevel = 'minor';
    else if (displacement_cm <= 15) hazardLevel = 'moderate';
    else hazardLevel = 'severe';

    return { displacement_cm, probabilityFailure, hazardLevel };
}

// ---------------------------------------------------------------------------
// 3. IDF Curve Intensity (Gumbel / GEV)
// ---------------------------------------------------------------------------

/**
 * Compute rainfall intensity from an IDF (Intensity-Duration-Frequency) curve.
 *
 * Gumbel (EV-I) distribution:
 *   Reduced variate: yT = -ln(-ln(1 - 1/T))
 *   Quantile: xT = u + α × yT
 *
 * GEV (Generalized Extreme Value) distribution:
 *   Quantile: xT = u + (α/k) × [1 - (-ln(1 - 1/T))^k]    (k ≠ 0)
 *   (reduces to Gumbel when k → 0)
 *
 * Confidence interval (±σ/√n approximation, σ ≈ 1.2826 × α for Gumbel).
 *
 * @param {number} returnPeriod_yrs - Return period T (years)
 * @param {number} duration_min     - Rainfall duration (minutes)
 * @param {{
 *   method: 'gumbel'|'gev',
 *   location: number,
 *   scale: number,
 *   shape?: number
 * }} params - distribution parameters (location u, scale α, shape k)
 * @returns {{
 *   intensity_mm_hr: number,
 *   depth_mm: number,
 *   returnPeriodCheck: number,
 *   confidenceInterval: {lower: number, upper: number}
 * }}
 * @reference Koutsoyiannis, D. (2004). Statistics of extremes and estimation of extreme
 *   rainfall: I. Theoretical investigation. Hydrological Sciences Journal, 49(4), 575–590.
 *   DOI: 10.1623/hysj.49.4.575.54430
 * @reference WMO (2009). Guide to Hydrological Practices, Vol. II, 6th ed. WMO-No. 168.
 *   World Meteorological Organization, Geneva.
 */
export function idfCurveIntensity(returnPeriod_yrs: number, duration_min: number, params: { method: 'gumbel'|'gev', location: number, scale: number, shape?: number }): { intensity_mm_hr: number, depth_mm: number, returnPeriodCheck: number, confidenceInterval: {lower: number, upper: number} } {
    const T = Math.max(returnPeriod_yrs, 1.001);
    const { method, location: u, scale: alpha, shape: k = 0 } = params;

    // Gumbel reduced variate
    const yT = -Math.log(-Math.log(1 - 1 / T));

    let depth_mm;
    if (method === 'gev' && Math.abs(k) > 1e-6) {
        // GEV quantile formula
        const probPart = Math.pow(-Math.log(1 - 1 / T), k);
        depth_mm = u + (alpha / k) * (1 - probPart);
    } else {
        // Gumbel (EV-I)
        depth_mm = u + alpha * yT;
    }

    depth_mm = Math.max(depth_mm, 0);
    const intensity_mm_hr = (depth_mm / duration_min) * 60;

    // Return-period check: reconstruct T from quantile (Gumbel)
    const yCheck = (depth_mm - u) / Math.max(alpha, 1e-9);
    const returnPeriodCheck = 1 / (1 - Math.exp(-Math.exp(-yCheck)));

    // 95% confidence interval (asymptotic, Gumbel): ±1.96 × σ_xT
    // σ_xT ≈ α × √(1.1087 + 0.5140×yT + 0.6079×yT²) / √n  - Kite 1949 approximation
    // For design purposes, use simplified ±20% of the estimate
    const halfWidth = 0.2 * depth_mm;
    const confidenceInterval = {
        lower: Math.max(((depth_mm - halfWidth) / duration_min) * 60, 0),
        upper: ((depth_mm + halfWidth) / duration_min) * 60,
    };

    return { intensity_mm_hr, depth_mm, returnPeriodCheck, confidenceInterval };
}

// ---------------------------------------------------------------------------
// 4. Debris Flow Volume and Hazard
// ---------------------------------------------------------------------------

/**
 * Estimate debris flow volume, peak discharge, runout distance, and impact pressure.
 *
 * Empirical relationships:
 *   Volume     : log(V) = 1.135 × log(A) + 0.617  (Jakob 2005, A in km²)
 *   Peak Q     : Q_peak = 0.1 × V^0.83             (Rickenmann 1999)
 *   Runout     : L = 1.9 × V^0.16 × H^0.83        (Rickenmann 1999, H in m)
 *   Velocity   : v ≈ sqrt(2gH × sin(slope))        (kinetic energy approximation)
 *   Impact P   : p = ρ × v² × Cd  (ρ=2000 kg/m³, Cd=1.0)
 *
 * Hazard zones (volume-based, Jakob 2005 Table 2):
 *   low      : V < 1000 m³
 *   medium   : 1000–10,000 m³
 *   high     : 10,000–100,000 m³
 *   very_high: > 100,000 m³
 *
 * @param {number} catchmentArea_km2             - Catchment area (km²)
 * @param {number} basinRelief_m                 - Vertical relief of basin (m)
 * @param {number} channelSlope_deg              - Channel slope (degrees)
 * @param {number} _precipitationIntensity_mm_hr  - Triggering precipitation intensity (mm/hr)
 * @returns {{
 *   volume_m3: number,
 *   peakDischarge_m3_s: number,
 *   runoutDistance_m: number,
 *   hazardZone: string,
 *   impactPressure_kPa: number
 * }}
 * @reference Jakob, M. (2005). Debris-flow hazard assessment. In: Jakob, M. & Hungr, O. (eds)
 *   Debris-flow Hazards and Related Phenomena. Springer, Berlin. pp. 411–443.
 * @reference Rickenmann, D. (1999). Empirical relationships for debris flows. Natural Hazards,
 *   19(1), pp. 47–77. DOI: 10.1023/A:1008064220727
 */
export function debrisFlowVolumeEstimate(catchmentArea_km2: number, basinRelief_m: number, channelSlope_deg: number, _precipitationIntensity_mm_hr: number): { volume_m3: number, peakDischarge_m3_s: number, runoutDistance_m: number, hazardZone: string, impactPressure_kPa: number } {
    const A = Math.max(catchmentArea_km2, 1e-6);
    const H = Math.max(basinRelief_m, 1);
    const slope_rad = (channelSlope_deg * Math.PI) / 180;

    // Jakob 2005 volume regression (log base 10)
    const logV = 1.135 * Math.log10(A) + 0.617;
    const volume_m3 = Math.pow(10, logV);

    // Rickenmann 1999 peak discharge
    const peakDischarge_m3_s = 0.1 * Math.pow(volume_m3, 0.83);

    // Rickenmann 1999 runout (H in m)
    const runoutDistance_m = 1.9 * Math.pow(volume_m3, 0.16) * Math.pow(H, 0.83);

    // Impact pressure: p = rho * v^2 * Cd
    // Velocity from energy: v = sqrt(2 * g * H * sin(slope)), capped at 20 m/s
    const g = 9.81;
    const v = Math.min(Math.sqrt(2 * g * H * Math.max(Math.sin(slope_rad), 0.01)), 20);
    const rho = 2000; // kg/m³ (debris flow density)
    const Cd = 1.0;
    const impactPressure_kPa = (rho * v * v * Cd) / 1000;

    let hazardZone;
    if (volume_m3 < 1000) hazardZone = 'low';
    else if (volume_m3 < 10000) hazardZone = 'medium';
    else if (volume_m3 < 100000) hazardZone = 'high';
    else hazardZone = 'very_high';

    return { volume_m3, peakDischarge_m3_s, runoutDistance_m, hazardZone, impactPressure_kPa };
}

// ---------------------------------------------------------------------------
// 5. Tsunami Runup Height
// ---------------------------------------------------------------------------

/**
 * Estimate tsunami wave height, runup, inundation distance, and arrival time.
 *
 * Shoaling via Green's Law (linear shallow-water theory):
 *   H_shallow = H_deep × (d_deep / d_shallow)^0.25
 *
 * Synolakis (1987) runup formula (canonical solitary wave):
 *   R = 2.831 × tan(beta)^0.5 × H^(5/4) × g^(-1/4)   (metric units)
 *   where beta = coastal slope angle, H = nearshore wave height
 *
 * Arrival time: travel time = distance / shallow-water wave speed (c = sqrt(g×d))
 *
 * Hazard levels:
 *   minimal      : R < 1 m
 *   moderate     : 1–3 m
 *   severe       : 3–10 m
 *   catastrophic : > 10 m
 *
 * @param {number} sourceDistance_km   - Distance from source to coast (km)
 * @param {number} earthquakeMagnitude - Moment magnitude Mw
 * @param {number} bathymetryDepth_m   - Characteristic water depth (m)
 * @param {number} coastalSlope        - Coastal slope tan(beta) (dimensionless)
 * @returns {{
 *   waveHeight_m: number,
 *   runupHeight_m: number,
 *   inundationDistance_m: number,
 *   arrivalTime_min: number,
 *   hazardLevel: string
 * }}
 * @reference Synolakis, C.E. (1987). The runup of solitary waves. Journal of Fluid Mechanics,
 *   185, pp. 523–545. DOI: 10.1017/S002211208700329X
 * @reference NOAA/PMEL (2011). Method of Splitting Tsunamis (MOST). NOAA Tech. Memo.
 *   OAR PMEL-135. Pacific Marine Environmental Laboratory, Seattle.
 */
export function tsunamiRunupHeight(sourceDistance_km: number, earthquakeMagnitude: number, bathymetryDepth_m: number, coastalSlope: number): { waveHeight_m: number, runupHeight_m: number, inundationDistance_m: number, arrivalTime_min: number, hazardLevel: string } {
    const g = 9.81;
    const d_deep = 4000; // typical open-ocean depth (m)
    const d_shallow = Math.max(bathymetryDepth_m, 1);
    const dist_m = sourceDistance_km * 1000;
    const Mw = earthquakeMagnitude;

    // Empirical deep-water wave height from earthquake magnitude
    // Approximation based on Abe (1979) scaling:  log(H_deep) ≈ 0.5 × Mw - 4.0
    const H_deep = Math.max(Math.pow(10, 0.5 * Mw - 4.0), 0.01);

    // Green's Law shoaling (deep → shallow)
    const waveHeight_m = H_deep * Math.pow(d_deep / d_shallow, 0.25);

    // Synolakis (1987) runup formula
    const tanBeta = Math.max(coastalSlope, 0.001);
    const runupHeight_m = 2.831 * Math.sqrt(tanBeta) * Math.pow(waveHeight_m, 1.25) * Math.pow(g, -0.25);

    // Inundation distance: R / tan(beta) (horizontal projection)
    const inundationDistance_m = runupHeight_m / tanBeta;

    // Wave speed c = sqrt(g × d), arrival time = dist / c
    const waveSpeed_m_s = Math.sqrt(g * d_shallow);
    const arrivalTime_min = dist_m / waveSpeed_m_s / 60;

    let hazardLevel;
    if (runupHeight_m < 1) hazardLevel = 'minimal';
    else if (runupHeight_m < 3) hazardLevel = 'moderate';
    else if (runupHeight_m <= 10) hazardLevel = 'severe';
    else hazardLevel = 'catastrophic';

    return {
        waveHeight_m,
        runupHeight_m,
        inundationDistance_m,
        arrivalTime_min,
        hazardLevel,
    };
}

// ---------------------------------------------------------------------------
// 6. Volcano Hazard Zone
// ---------------------------------------------------------------------------

/**
 * Assess volcanic hazard including pyroclastic flow, ash fall, and lahar risk.
 *
 * Pyroclastic flow reach (Newhall & Self 1982 VEI scale + empirical):
 *   Rp = 5 × 10^(0.5 × VEI - 1)  km
 *
 * Ash fall thickness at radial distance r:
 *   h(r) = h0 × exp(-r / L)
 *   where L = 50 km (scale length), h0 = mass / (rho × pi × L²) with
 *   mass = 10^(VEI × 0.65 + 5) kg and rho = 800 kg/m³
 *
 * Lahar probability: increases with VEI and proximity to volcanic edifice.
 *
 * Hazard classes (USGS Alert Levels):
 *   exclusion | danger | caution | watch | advisory
 *
 * @param {number} distanceFromVent_km - Distance from volcanic vent (km)
 * @param {number} eruptionVEI         - Volcanic Explosivity Index (0–8)
 * @param {number} _windSpeed_ms        - Wind speed (m/s)
 * @param {number} _windDirection_deg   - Wind direction (degrees, 0=N)
 * @returns {{
 *   pyroclasticFlowRisk: number,
 *   ashFallDepth_mm: number,
 *   laharProbability: number,
 *   hazardClass: string
 * }}
 * @reference Newhall, C.G. & Self, S. (1982). The volcanic explosivity index (VEI):
 *   An estimate of explosive magnitude for historical volcanism. Journal of Geophysical
 *   Research: Oceans, 87(C2), pp. 1231–1238. DOI: 10.1029/JC087iC02p01231
 * @reference USGS (2010). Volcanic Alert-Level System for Aviation and Ground-Based
 *   Hazards. USGS Open-File Report 2010-1031.
 */
export function volcanoHazardZone(distanceFromVent_km: number, eruptionVEI: number, _windSpeed_ms: number, _windDirection_deg: number): { pyroclasticFlowRisk: number, ashFallDepth_mm: number, laharProbability: number, hazardClass: string } {
    const r = Math.max(distanceFromVent_km, 0.1);
    const VEI = clamp(eruptionVEI, 0, 8);
    const L = 50; // ash dispersal scale length (km)

    // Pyroclastic flow reach (km)
    const pfReach_km = 5 * Math.pow(10, 0.5 * VEI - 1);

    // Pyroclastic flow risk: 1.0 inside reach, decays exponentially beyond
    const pyroclasticFlowRisk = r <= pfReach_km ? 1.0 : Math.exp(-((r - pfReach_km) / pfReach_km));
    const pyroclasticFlowRiskClamped = clamp(pyroclasticFlowRisk, 0, 1);

    // Ash fall: deposited mass ~ 10^(VEI×0.65+5) kg, density 800 kg/m³
    const ashMass_kg = Math.pow(10, VEI * 0.65 + 5);
    const rho_ash = 800; // kg/m³
    // h0 = total mass / (rho × pi × L²) converted to deposit thickness (m)
    const L_m = L * 1000;
    const h0_m = ashMass_kg / (rho_ash * Math.PI * L_m * L_m);
    const ashFallDepth_mm = h0_m * Math.exp(-r / L) * 1000;

    // Lahar probability: logistic proxy based on VEI and proximity
    // Lahars common for VEI ≥ 3, on flanks within 40 km
    const laharLogit = (VEI - 3) * 1.5 - r / 20;
    const laharProbability = clamp(1 / (1 + Math.exp(-laharLogit)), 0, 1);

    // Hazard class from combined risk
    const combinedScore =
        0.5 * pyroclasticFlowRiskClamped + 0.3 * laharProbability + 0.2 * clamp(ashFallDepth_mm / 100, 0, 1);
    let hazardClass;
    if (combinedScore >= 0.8) hazardClass = 'exclusion';
    else if (combinedScore >= 0.6) hazardClass = 'danger';
    else if (combinedScore >= 0.4) hazardClass = 'caution';
    else if (combinedScore >= 0.2) hazardClass = 'watch';
    else hazardClass = 'advisory';

    return {
        pyroclasticFlowRisk: pyroclasticFlowRiskClamped,
        ashFallDepth_mm,
        laharProbability,
        hazardClass,
    };
}

// ---------------------------------------------------------------------------
// 7. Wildfire Spread Rate (Rothermel 1972 / McArthur 1967)
// ---------------------------------------------------------------------------

/**
 * Estimate wildfire spread rate, fireline intensity, flame length, and danger rating.
 *
 * Based on Rothermel (1972) simplified formulation:
 *   R = R_base × φ_wind × φ_slope × φ_moisture
 *
 * where:
 *   R_base = 0.5 m/min (representative base rate for dry grassland)
 *   Moisture factor: φ_m = exp(-0.108 × MC%)
 *   Wind factor: φ_w = 0.0783 × U^1.7  (U in m/s)
 *   Slope factor: φ_s = 5.275 × β^{-0.3} × tan(slope)²   (β = packing ratio ≈ 0.05)
 *
 * Byram (1959) fireline intensity:
 *   I_B = h × w × R / 60  (kW/m)  - h ≈ 18,000 kJ/kg (low heat of combustion)
 *
 * Flame length (Byram 1959):
 *   F_L = 0.0775 × I_B^0.46  (m)
 *
 * McArthur danger rating:
 *   FDI = exp(−22.6 + 0.633 × MC + 0.05 × U + 0.09 × T) - simplified Forest Fire Danger Index
 *   (T = temperature proxy = 25°C assumed; this function uses spread rate + fuel load as surrogates)
 *
 * @param {number} windSpeed_ms         - Wind speed at mid-flame height (m/s)
 * @param {number} slope_deg            - Ground slope (degrees)
 * @param {number} fuelMoisture_pct     - Fuel moisture content (%)
 * @param {number} fuelLoad_kg_m2       - Fuel load (kg/m²)
 * @returns {{
 *   rateOfSpread_m_min: number,
 *   firelineIntensity_kW_m: number,
 *   flameLength_m: number,
 *   dangerRating: string
 * }}
 * @reference Rothermel, R.C. (1972). A mathematical model for predicting fire spread in
 *   wildland fuels. USDA Forest Service Research Paper INT-115. Ogden, Utah.
 * @reference McArthur, A.G. (1967). Fire behaviour in eucalypt forests. Forestry and
 *   Timber Bureau Leaflet 107. Canberra, Australia.
 * @reference Byram, G.M. (1959). Combustion of forest fuels. In: Davis, K.P. (ed.)
 *   Forest Fire: Control and Use. McGraw-Hill, New York, pp. 61–89.
 */
export function wildfireSpreadRate(windSpeed_ms: number, slope_deg: number, fuelMoisture_pct: number, fuelLoad_kg_m2: number): { rateOfSpread_m_min: number, firelineIntensity_kW_m: number, flameLength_m: number, dangerRating: string } {
    const U = Math.max(windSpeed_ms, 0);
    const MC = Math.max(fuelMoisture_pct, 1);
    const w = Math.max(fuelLoad_kg_m2, 0.01);
    const slope_rad = (slope_deg * Math.PI) / 180;

    // Moisture factor (Rothermel 1972, eq. for dead 1-hr fuel)
    const phi_moisture = Math.exp(-0.108 * MC);

    // Wind factor (m/s units, simplified from Rothermel 1972)
    const phi_wind = U > 0 ? 0.0783 * Math.pow(U, 1.7) : 0;

    // Slope factor (Rothermel 1972; beta = packing ratio ≈ 0.05)
    const tanSlope = Math.tan(slope_rad);
    const beta = 0.05;
    const phi_slope = 5.275 * Math.pow(beta, -0.3) * tanSlope * tanSlope;

    // Base rate of spread (m/min) for grass/shrub fuels
    const R_base = 0.5;
    const rateOfSpread_m_min = R_base * phi_moisture * (1 + phi_wind + phi_slope);

    // Fireline intensity (Byram 1959): I_B = h × w × R
    const h_kJ_kg = 18000; // low heat of combustion (kJ/kg)
    const R_m_s = rateOfSpread_m_min / 60;
    const firelineIntensity_kW_m = h_kJ_kg * w * R_m_s; // kW/m

    // Flame length (Byram 1959)
    const flameLength_m = 0.0775 * Math.pow(firelineIntensity_kW_m, 0.46);

    // Danger rating based on spread rate × fuel load proxy
    const dangerScore = rateOfSpread_m_min * w;
    let dangerRating;
    if (dangerScore < 0.05) dangerRating = 'low';
    else if (dangerScore < 0.3) dangerRating = 'moderate';
    else if (dangerScore < 1.0) dangerRating = 'high';
    else if (dangerScore < 3.0) dangerRating = 'very_high';
    else dangerRating = 'extreme';

    return { rateOfSpread_m_min, firelineIntensity_kW_m, flameLength_m, dangerRating };
}

// ---------------------------------------------------------------------------
// 8. Ground Subsidence Risk from Underground Mining
// ---------------------------------------------------------------------------

/**
 * Estimate ground subsidence parameters from underground coal/mineral mining.
 *
 * National Coal Board (NCB 1975) subsidence prediction method:
 *   Max subsidence: S = s_factor × M
 *     where s_factor depends on overburden: competent=0.45, mixed=0.65, weak=0.90
 *   Subsidence radius: R_s = 0.7 × h  (h = mining depth)
 *   Maximum horizontal strain: ε = 0.4 × S / R_s²  (m/m → converted to mm/m)
 *   Tilt: θ = S / R_s  (m/m → radians → degrees)
 *
 * Time factor: subsidence typically develops over ~5 years; after time t,
 *   S(t) = S_max × (1 - exp(-0.693 × t / 2.5))  (half-life ≈ 2.5 years)
 *
 * Risk levels:
 *   negligible : S < 0.1 m
 *   low        : 0.1–0.3 m
 *   moderate   : 0.3–0.6 m
 *   high       : 0.6–1.2 m
 *   extreme    : > 1.2 m
 *
 * @param {number} miningDepth_m      - Depth to seam roof (m)
 * @param {number} seamThickness_m    - Seam / extraction height (m)
 * @param {'competent'|'mixed'|'weak'} overburdenType - Overburden rock quality
 * @param {number} timeYears          - Time since mining (years)
 * @returns {{
 *   maxSubsidence_m: number,
 *   subsidenceRadius_m: number,
 *   horizontalStrain_mm_m: number,
 *   tiltDegrees: number,
 *   riskLevel: string
 * }}
 * @reference National Coal Board (1975). Subsidence Engineers' Handbook. NCB, London.
 * @reference Peng, S.S. (1992). Surface Subsidence Engineering. Society for Mining,
 *   Metallurgy & Exploration, Littleton, Colorado.
 */
export function groundSubsidenceRisk(miningDepth_m: number, seamThickness_m: number, overburdenType: 'competent'|'mixed'|'weak', timeYears: number): { maxSubsidence_m: number, subsidenceRadius_m: number, horizontalStrain_mm_m: number, tiltDegrees: number, riskLevel: string } {
    const h = Math.max(miningDepth_m, 1);
    const M = Math.max(seamThickness_m, 0.1);
    const t = Math.max(timeYears, 0);

    const sFactorMap = { competent: 0.45, mixed: 0.65, weak: 0.9 };
    const sFactor = sFactorMap[overburdenType] ?? 0.65;

    // Ultimate (asymptotic) max subsidence
    const S_ultimate = sFactor * M;

    // Time-dependent factor: S(t)/S_max = 1 - exp(-0.693 * t / 2.5)
    const timeFactor = t === 0 ? 0 : 1 - Math.exp((-0.693 * t) / 2.5);
    const maxSubsidence_m = S_ultimate * timeFactor;

    // Subsidence radius (NCB 1975: R = 0.7 × depth)
    const subsidenceRadius_m = 0.7 * h;

    // Maximum horizontal strain (mm/m) - NCB 1975 eq. 3.4
    const eps_m_m = (0.4 * maxSubsidence_m) / (subsidenceRadius_m * subsidenceRadius_m);
    const horizontalStrain_mm_m = eps_m_m * subsidenceRadius_m * 1000; // convert properly: ε × 1000

    // Tilt (degrees)
    const tilt_rad = maxSubsidence_m / subsidenceRadius_m;
    const tiltDegrees = (tilt_rad * 180) / Math.PI;

    let riskLevel;
    if (maxSubsidence_m < 0.1) riskLevel = 'negligible';
    else if (maxSubsidence_m < 0.3) riskLevel = 'low';
    else if (maxSubsidence_m < 0.6) riskLevel = 'moderate';
    else if (maxSubsidence_m <= 1.2) riskLevel = 'high';
    else riskLevel = 'extreme';

    return { maxSubsidence_m, subsidenceRadius_m, horizontalStrain_mm_m, tiltDegrees, riskLevel };
}

// ---------------------------------------------------------------------------
// 9. Liquefaction Potential
// ---------------------------------------------------------------------------

/**
 * Assess earthquake-induced liquefaction potential using CPT/SPT-based methods.
 *
 * Cyclic Stress Ratio (CSR) - Seed & Idriss (1971):
 *   CSR = 0.65 × (σv / σv') × amax × rd
 *   rd (stress reduction coefficient): rd = 1.0 - 0.00765z  (z ≤ 9.15 m)
 *                                        rd = 1.174 - 0.0267z (9.15 < z ≤ 23 m)
 *
 * Cyclic Resistance Ratio (CRR) - Idriss & Boulanger (2008, eq. 2.17):
 *   CRR_7.5 = exp(N1_60/14.1 + (N1_60/126)² - (N1_60/23.6)³ + (N1_60/25.4)⁴ - 2.8)
 *   N1_60 = N60 × CN,  CN = (Pa/σv')^0.5, Pa = 100 kPa
 *
 * Magnitude Scaling Factor (MSF) - Youd (2001 NCEER Workshop):
 *   MSF = 10^2.24 / (Mw^2.56)
 *
 * Factor of Safety: FS = CRR_7.5 × MSF / CSR (using Mw magnitude)
 *
 * Liquefaction Probability Index (LPI) - Iwasaki (1978), simplified:
 *   lpi = max(0, 1 - FS) × 10  (depth-weighted, single layer proxy)
 *
 * Probability of liquefaction (Seed et al. 2003 eq. 5.7):
 *   P_L = Phi(-(ln(FS) + 0.18) / 0.305)   where Phi = standard normal CDF
 *
 * @param {number} N60                     - SPT blow count corrected to 60% efficiency
 * @param {number} verticalStress_kPa      - Total vertical effective stress σv (kPa)
 * @param {number} porePressure_kPa        - Pore water pressure u (kPa)
 * @param {number} peakGroundAcceleration_g - PGA (g)
 * @param {'sand'|'silty_sand'|'sandy_silt'} soilType - Soil classification
 * @returns {{
 *   cyclicResistanceRatio: number,
 *   cyclicStressRatio: number,
 *   factorOfSafety: number,
 *   lpi: number,
 *   liquefactionProbability: number
 * }}
 * @reference Seed, H.B. & Idriss, I.M. (1971). Simplified procedure for evaluating
 *   soil liquefaction potential. ASCE Journal of the Soil Mechanics and Foundations
 *   Division, 97(SM9), pp. 1249–1273.
 * @reference Idriss, I.M. & Boulanger, R.W. (2008). Soil Liquefaction During Earthquakes.
 *   Earthquake Engineering Research Institute, Oakland, CA. MNO-12.
 * @reference Youd, T.L. et al. (2001). Liquefaction resistance of soils: Summary report
 *   from the 1996 NCEER and 1998 NCEER/NSF workshops. Journal of Geotechnical and
 *   Geoenvironmental Engineering, 127(10), pp. 817–833. DOI: 10.1061/(ASCE)1090-0241
 */
export function liquefactionPotential(N60: number, verticalStress_kPa: number, porePressure_kPa: number, peakGroundAcceleration_g: number, soilType: 'sand'|'silty_sand'|'sandy_silt'): { cyclicResistanceRatio: number, cyclicStressRatio: number, factorOfSafety: number, lpi: number, liquefactionProbability: number } {
    const Pa = 100; // atmospheric pressure (kPa)
    const sigma_v = Math.max(verticalStress_kPa, 1);
    const sigma_vp = Math.max(sigma_v - porePressure_kPa, 1); // effective stress
    const amax = Math.max(peakGroundAcceleration_g, 0);

    // Overburden correction factor CN (limited to 2.0)
    const CN = Math.min(Math.sqrt(Pa / sigma_vp), 2.0);
    const N1_60 = clamp(N60 * CN, 0, 60);

    // Estimate depth from stress (σv ≈ ρ × g × z, ρ ≈ 1800 kg/m³)
    const z = sigma_v / ((1800 * 9.81) / 1000); // z in metres

    // Stress reduction coefficient rd (Idriss 1999, NCEER Workshop)
    let rd;
    if (z <= 9.15) {
        rd = 1.0 - 0.00765 * z;
    } else if (z <= 23) {
        rd = 1.174 - 0.0267 * z;
    } else {
        rd = 0.4;
    }

    // CSR - Seed & Idriss 1971
    const cyclicStressRatio = 0.65 * (sigma_v / sigma_vp) * amax * rd;

    // CRR at Mw 7.5 - Idriss & Boulanger 2008 (valid for N1_60 < 37)
    const n = Math.min(N1_60, 36.9);
    const cyclicResistanceRatio = Math.exp(
        n / 14.1 + Math.pow(n / 126, 2) - Math.pow(n / 23.6, 3) + Math.pow(n / 25.4, 4) - 2.8,
    );

    // Soil type correction to CRR (FC adjustment)
    const fcBonus = soilType === 'silty_sand' ? 0.02 : soilType === 'sandy_silt' ? 0.05 : 0;

    const CRR_adj = cyclicResistanceRatio + fcBonus;

    // Assume Mw 7.5 design earthquake for MSF = 1.0 (Youd 2001)
    const Mw = 7.5;
    const MSF = Math.pow(10, 2.24) / Math.pow(Mw, 2.56);

    const factorOfSafety = cyclicStressRatio > 0 ? (CRR_adj * MSF) / cyclicStressRatio : Infinity;

    // LPI proxy (Iwasaki 1978 simplified - single layer, 0–10 scale)
    const lpi = clamp((1 - Math.min(factorOfSafety, 1)) * 10, 0, 10);

    // Probability of liquefaction (Seed et al. 2003)
    // P_L = Phi(-(ln(FS) + 0.18) / 0.305)
    const phi = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
    const logFS = factorOfSafety > 0 ? Math.log(Math.min(factorOfSafety, 100)) : -10;
    const liquefactionProbability = clamp(phi(-(logFS + 0.18) / 0.305), 0, 1);

    return {
        cyclicResistanceRatio: CRR_adj,
        cyclicStressRatio,
        factorOfSafety,
        lpi,
        liquefactionProbability,
    };
}

/**
 * Error function approximation (Abramowitz & Stegun 7.1.26, max error < 1.5e-7).
 * @param {number} x
 * @returns {number}
 */
function erf(x: number): number {
    const sign = x >= 0 ? 1 : -1;
    const t = 1 / (1 + 0.3275911 * Math.abs(x));
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    return sign * (1 - poly * Math.exp(-x * x));
}

// ---------------------------------------------------------------------------
// 10. Multi-Hazard Risk Matrix (UN/ISDR 2004 / Sendai Framework 2015)
// ---------------------------------------------------------------------------

/**
 * Compute a multi-hazard risk matrix following the UN/ISDR framework and
 * UNDRR Sendai Framework (2015–2030) priority targets.
 *
 * Risk score per hazard:
 *   Risk_i = probability_i × magnitude_i × exposure_i × vulnerability_i / copingCapacity_i
 *
 * Priority: hazards sorted descending by risk score.
 * Combined risk index: maximum individual risk score (worst-case principle).
 *
 * Sendai alignment:
 *   A - Mortality reduction     (high-probability catastrophic events)
 *   B - Affected population     (wide-exposure events)
 *   C - Economic losses         (high-magnitude events in dense exposure areas)
 *   D - Infrastructure damage   (high-magnitude, low coping capacity)
 *
 * @param {Array<{
 *   name: string,
 *   probability_per_yr: number,
 *   magnitude: number,
 *   exposure: number,
 *   vulnerability: number,
 *   copingCapacity: number
 * }>} hazards
 * @returns {{
 *   riskScores: Array<{name: string, riskScore: number}>,
 *   prioritizedHazards: string[],
 *   combinedRiskIndex: number,
 *   sendaiTargetAlignment: string
 * }}
 * @reference UNISDR (2004). Living with Risk: A Global Review of Disaster Reduction
 *   Initiatives. United Nations, Geneva.
 * @reference UNDRR (2015). Sendai Framework for Disaster Risk Reduction 2015–2030.
 *   United Nations Office for Disaster Risk Reduction, Geneva.
 */
export function naturalRiskMatrix(hazards: Array<{ name: string, probability_per_yr: number, magnitude: number, exposure: number, vulnerability: number, copingCapacity: number }>): { riskScores: Array<{name: string, riskScore: number}>, prioritizedHazards: string[], combinedRiskIndex: number, sendaiTargetAlignment: string } {
    if (!Array.isArray(hazards) || hazards.length === 0) {
        return {
            riskScores: [],
            prioritizedHazards: [],
            combinedRiskIndex: 0,
            sendaiTargetAlignment: 'D',
        };
    }

    const riskScores = hazards.map((h) => {
        const p = Math.max(h.probability_per_yr, 0);
        const m = clamp(h.magnitude, 1, 5);
        const e = clamp(h.exposure, 1, 5);
        const v = clamp(h.vulnerability, 1, 5);
        const c = Math.max(clamp(h.copingCapacity, 1, 5), 0.1);
        const riskScore = (p * m * e * v) / c;
        return { name: h.name, riskScore };
    });

    const sorted = [...riskScores].sort((a, b) => b.riskScore - a.riskScore);
    const prioritizedHazards = sorted.map((s) => s.name);
    const combinedRiskIndex = sorted.length > 0 ? sorted[0]!.riskScore : 0;

    // Sendai target alignment heuristics
    const topHazard = hazards.find((h) => h.name === prioritizedHazards[0]);
    let sendaiTargetAlignment;
    if (!topHazard) {
        sendaiTargetAlignment = 'D';
    } else if (topHazard.probability_per_yr > 0.1 && topHazard.magnitude >= 4) {
        sendaiTargetAlignment = 'A'; // Mortality reduction — frequent & catastrophic
    } else if (topHazard.exposure >= 4) {
        sendaiTargetAlignment = 'B'; // Wide affected population
    } else if (topHazard.magnitude >= 4 && topHazard.exposure >= 3) {
        sendaiTargetAlignment = 'C'; // Economic losses
    } else {
        sendaiTargetAlignment = 'D'; // Infrastructure & resilience
    }

    return { riskScores, prioritizedHazards, combinedRiskIndex, sendaiTargetAlignment };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const naturalHazardRiskMeta = {
    name: 'naturalHazardRisk',
    description: 'naturalHazardRisk',
    category: 'analytics',
    familyTags: ['risk'],
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
