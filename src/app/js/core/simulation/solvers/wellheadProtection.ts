// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Wellhead Protection Zone delineation - pure-math, no DOM/IDB/network.
 *
 * References:
 *   USEPA (1987) Guidelines for Delineation of Wellhead Protection Areas. EPA/440/6-87-010.
 *   Javandel & Tsang (1986) Water Resources Research, 22(8):1149-1159.
 *   Bear & Jacobs (1965) J. Hydrol., 3(1):37-57.
 *   Aller et al. (1987) DRASTIC. USEPA/600/2-87-035.
 *   Cooper & Jacob (1946) Trans. AGU 27(4):526-534.
 *   Stigter et al. (2006) Hydrogeology Journal, 14(6):1120-1133.
 *   Sophocleous (2002) Hydrogeology Journal, 10(1):52-67.
 */

// ---------------------------------------------------------------------------
// 1. Fixed-radius wellhead protection zone
// ---------------------------------------------------------------------------

/**
 * Fixed-radius WHPA based on volumetric flow (USEPA 1987).
 * R = sqrt(Q * t / (pi * n * b))
 *
 * @param {number} Q_m3_per_day - Pumping rate (m³/day)
 * @param {number} n            - Effective porosity (dimensionless, 0–1)
 * @param {number} b            - Saturated thickness (m)
 * @param {number} t_days       - Travel time (days)
 * @returns {number} Radius in metres
 */
export function fixedRadiusZone(Q_m3_per_day: number, n: number, b: number, t_days: number): number {
    if (Q_m3_per_day <= 0) throw new Error('Q_m3_per_day must be positive');
    if (n <= 0 || n > 1) throw new Error('n must be in (0, 1]');
    if (b <= 0) throw new Error('b must be positive');
    if (t_days <= 0) throw new Error('t_days must be positive');
    return Math.sqrt((Q_m3_per_day * t_days) / (Math.PI * n * b));
}

// ---------------------------------------------------------------------------
// 2. Time-related capture zone (Javandel & Tsang 1986)
// ---------------------------------------------------------------------------

/**
 * Time-related capture zone boundary using Javandel & Tsang (1986) streamlines.
 * y_max = Q / (2 * K * b * i)
 * For each y in [-y_max, y_max]: x = y / tan(2*pi*K*b*i*y / Q)  (y ≠ 0)
 * Time-related offset: x_t = x - v_pore * t  where v_pore = K*i/n
 *
 * @param {number} Q_m3_per_s - Pumping rate (m³/s)
 * @param {number} K          - Hydraulic conductivity (m/s)
 * @param {number} b          - Saturated thickness (m)
 * @param {number} i          - Hydraulic gradient (dimensionless)
 * @param {number} t_years    - Travel time (years)
 * @param {number} n_points   - Number of boundary points (default 200)
 * @returns {Array<{x:number,y:number}>} Capture zone boundary points
 */
export function timeRelatedCaptureZone(
    Q_m3_per_s: number,
    K: number,
    b: number,
    i: number,
    t_years: number,
    n_points = 200,
): Array<{ x: number; y: number }> {
    if (Q_m3_per_s <= 0) throw new Error('Q_m3_per_s must be positive');
    if (K <= 0) throw new Error('K must be positive');
    if (b <= 0) throw new Error('b must be positive');
    if (i <= 0) throw new Error('i must be positive');
    if (t_years < 0) throw new Error('t_years must be non-negative');

    const y_max = Q_m3_per_s / (2 * K * b * i);
    const t_s = t_years * 365.25 * 86400;
    const v_pore = (K * i) / Math.max(1e-9, 0.25); // default porosity 0.25 for offset
    const x_offset = v_pore * t_s;

    const pts: Array<{ x: number; y: number }> = [];
    const N = Math.max(4, Math.floor(n_points / 2)) * 2; // ensure even

    for (let j = 0; j <= N; j++) {
        // Map j to y in (-y_max, y_max), excluding exact ±y_max (asymptote)
        const frac = (j / N) * 2 - 1; // -1..+1
        const y = frac * y_max * 0.9999;

        let x_steady;
        if (Math.abs(y) < 1e-12) {
            x_steady = 0;
        } else {
            const arg = (2 * Math.PI * K * b * i * y) / Q_m3_per_s;
            const tanVal = Math.tan(arg);
            if (Math.abs(tanVal) < 1e-12) {
                x_steady = 1e9 * Math.sign(y); // near asymptote → very far upstream
            } else {
                x_steady = y / tanVal;
            }
        }

        pts.push({ x: x_steady - x_offset, y });
    }

    return pts;
}

// ---------------------------------------------------------------------------
// 3. Analytical capture zone area (Bear & Jacobs 1965)
// ---------------------------------------------------------------------------

/**
 * Steady-state capture zone area and equivalent radius (Bear & Jacobs 1965).
 * A = Q / (K * b * i)
 *
 * @param {number} Q_m3_per_s - Pumping rate (m³/s)
 * @param {number} K          - Hydraulic conductivity (m/s)
 * @param {number} b          - Saturated thickness (m)
 * @param {number} i          - Hydraulic gradient
 * @returns {{area_m2:number, R_equiv_m:number, method:string}}
 */
export function analyticalCaptureZoneArea(
    Q_m3_per_s: number,
    K: number,
    b: number,
    i: number,
): { area_m2: number; R_equiv_m: number; method: string } {
    if (Q_m3_per_s <= 0) throw new Error('Q_m3_per_s must be positive');
    if (K <= 0) throw new Error('K must be positive');
    if (b <= 0) throw new Error('b must be positive');
    if (i <= 0) throw new Error('i must be positive');

    const area_m2 = Q_m3_per_s / (K * b * i);
    const R_equiv_m = Math.sqrt(area_m2 / Math.PI);
    return Object.freeze({ area_m2, R_equiv_m, method: 'bear-jacobs-1965' });
}

// ---------------------------------------------------------------------------
// 4. Travel time - advective (USEPA 1987)
// ---------------------------------------------------------------------------

/**
 * Advective travel time through porous media (USEPA 1987).
 * t = L * n / (K * i)
 *
 * @param {number} L_m  - Path length (m)
 * @param {number} n    - Effective porosity
 * @param {number} K    - Hydraulic conductivity (m/day)
 * @param {number} i    - Hydraulic gradient
 * @returns {{t_days:number, t_years:number, method:string}}
 */
export function travelTimePorousMedia(
    L_m: number,
    n: number,
    K: number,
    i: number,
): { t_days: number; t_years: number; method: string } {
    if (L_m <= 0) throw new Error('L_m must be positive');
    if (n <= 0 || n > 1) throw new Error('n must be in (0, 1]');
    if (K <= 0) throw new Error('K must be positive');
    if (i <= 0) throw new Error('i must be positive');

    const t_days = (L_m * n) / (K * i);
    const t_years = t_days / 365.25;
    return Object.freeze({ t_days, t_years, method: 'usepa-1987-advective' });
}

// ---------------------------------------------------------------------------
// 5. Zone I - 200-day WHPA (ASCE 1987)
// ---------------------------------------------------------------------------

/**
 * Zone I - immediate 200-day travel time protection radius (ASCE 1987 / USEPA 1987).
 * Uses fixed-radius equation with 200-day travel time.
 *
 * @param {number} Q_m3_per_day - Pumping rate (m³/day)
 * @param {number} T_m2_per_day - Transmissivity (m²/day) [kept for future Theis extension]
 * @param {number} S            - Storage coefficient (dimensionless)
 * @param {number} K            - Hydraulic conductivity (m/day)
 * @param {number} b            - Saturated thickness (m)
 * @param {number} _i            - Hydraulic gradient
 * @returns {{R_200_m:number, area_m2:number, method:string}}
 */
export function whpaZone1(
    Q_m3_per_day: number,
    T_m2_per_day: number,
    S: number,
    K: number,
    b: number,
    _i: number,
): { R_200_m: number; area_m2: number; method: string } {
    // Derive effective porosity estimate from T, b, K for volumetric balance
    // n_eff estimated from storage: S ≈ n * b_factor (simplified for unconsolidated)
    // Use default porosity 0.25 when S is not meaningful
    const n_eff = Math.min(0.5, Math.max(0.05, S > 0 ? S / (b * 0.0001 + 1e-9) : 0.25));
    const R_200_m = fixedRadiusZone(Q_m3_per_day, n_eff, b, 200);
    const area_m2 = Math.PI * R_200_m * R_200_m;
    return Object.freeze({ R_200_m, area_m2, method: 'whpa-zone1-200day' });
}

// ---------------------------------------------------------------------------
// 6. DRASTIC vulnerability index (Aller et al. 1987)
// ---------------------------------------------------------------------------

/** DRASTIC parameter weights (standard, Aller et al. 1987). */
const DRASTIC_WEIGHTS = Object.freeze({ D: 5, R: 4, A: 3, S: 2, T: 1, I: 5, C: 3 });

/**
 * DRASTIC aquifer vulnerability index.
 * Index range: 23–230 (min rating 1×sum_w = 23; max rating 10×sum_w = 230).
 * Vulnerability classes: >140 'very high', 100–140 'high', 65–100 'moderate', <65 'low'.
 *
 * @param {number} depth       - D: Depth to water table rating (1–10)
 * @param {number} recharge    - R: Net recharge rating (1–10)
 * @param {number} aquifer_media - A: Aquifer media rating (1–10)
 * @param {number} soil_media  - S: Soil media rating (1–10)
 * @param {number} topography  - T: Topography (slope) rating (1–10)
 * @param {number} vadose      - I: Impact of vadose zone rating (1–10)
 * @param {number} conductivity - C: Hydraulic conductivity rating (1–10)
 * @returns {{index:number, vulnerability:string, components:Object, method:string}}
 */
export function vulnerabilityDRASTIC(
    depth: number,
    recharge: number,
    aquifer_media: number,
    soil_media: number,
    topography: number,
    vadose: number,
    conductivity: number,
): { index: number; vulnerability: string; components: Record<string, any>; method: string } {
    const ratings = {
        D: depth,
        R: recharge,
        A: aquifer_media,
        S: soil_media,
        T: topography,
        I: vadose,
        C: conductivity,
    };

    for (const [k, v] of Object.entries(ratings)) {
        if (!Number.isFinite(v) || v < 1 || v > 10) {
            throw new Error(`DRASTIC rating ${k}=${v} must be integer 1–10`);
        }
    }

    let index = 0;
    const components: Record<string, any> = {};
    const weights = DRASTIC_WEIGHTS as Record<string, number>;
    const r = ratings as Record<string, any>;
    for (const [k, w] of Object.entries(weights)) {
        const contribution = w * r[k];
        components[k] = { rating: r[k], weight: w, contribution };
        index += contribution;
    }

    let vulnerability;
    if (index > 140) vulnerability = 'very high';
    else if (index >= 100) vulnerability = 'high';
    else if (index >= 65) vulnerability = 'moderate';
    else vulnerability = 'low';

    return Object.freeze({ index, vulnerability, components: Object.freeze(components), method: 'drastic-aller-1987' });
}

// ---------------------------------------------------------------------------
// 7. Unified SWPA radius calculator (USEPA 1987)
// ---------------------------------------------------------------------------

/**
 * Source Water Protection Area radius - three methods (USEPA 1987).
 *
 * @param {number} Q     - Pumping rate (m³/day)
 * @param {number} K     - Hydraulic conductivity (m/day)
 * @param {number} i     - Hydraulic gradient
 * @param {number} n     - Porosity
 * @param {number} b     - Saturated thickness (m)
 * @param {number} t_days - Travel time (days)
 * @param {'fixed_radius'|'calculated_fixed'|'analytical'} method
 * @returns {{radius_m:number, method:string, input:Object}}
 */
export function sourceWaterProtectionRadius(
    Q: number,
    K: number,
    i: number,
    n: number,
    b: number,
    t_days: number,
    method: 'fixed_radius' | 'calculated_fixed' | 'analytical' = 'fixed_radius',
): { radius_m: number; method: string; input: any } {
    if (Q <= 0) throw new Error('Q must be positive');
    if (K <= 0) throw new Error('K must be positive');
    if (i <= 0) throw new Error('i must be positive');
    if (n <= 0 || n > 1) throw new Error('n must be in (0, 1]');
    if (b <= 0) throw new Error('b must be positive');
    if (t_days <= 0) throw new Error('t_days must be positive');

    let radius_m;
    if (method === 'fixed_radius') {
        radius_m = Math.sqrt((Q * t_days) / (Math.PI * n * b));
    } else if (method === 'calculated_fixed') {
        radius_m = (K * i * t_days) / n;
    } else if (method === 'analytical') {
        // Javandel y_max half-width (convert Q to m³/s for consistency, then back)
        const Q_m3_s = Q / 86400;
        const K_m_s = K / 86400;
        radius_m = Q_m3_s / (2 * K_m_s * b * i);
    } else {
        throw new Error(`Unknown method '${method}'. Use fixed_radius, calculated_fixed, or analytical.`);
    }

    return Object.freeze({ radius_m, method: `swpa-${method}`, input: Object.freeze({ Q, K, i, n, b, t_days }) });
}

// ---------------------------------------------------------------------------
// 8. Aquifer susceptibility (Stigter et al. 2006)
// ---------------------------------------------------------------------------

/**
 * Aquifer susceptibility score (0–100) - Stigter et al. (2006).
 * S = max(0, min(100, 100 - clay_thickness*5 - depth_to_water*0.5 + K_vadose*10 + recharge*0.05))
 *
 * @param {number} clay_thickness_m       - Clay layer thickness above aquifer (m)
 * @param {number} depth_to_water_m       - Depth to water table (m)
 * @param {number} K_vadose               - Vadose zone K (m/day); higher = more vulnerable
 * @param {number} recharge_mm_per_year   - Annual recharge (mm/year)
 * @returns {{score:number, susceptibility:string, method:string}}
 */
export function aquiferSusceptibility(
    clay_thickness_m: number,
    depth_to_water_m: number,
    K_vadose: number,
    recharge_mm_per_year: number,
): { score: number; susceptibility: string; method: string } {
    if (clay_thickness_m < 0) throw new Error('clay_thickness_m must be non-negative');
    if (depth_to_water_m < 0) throw new Error('depth_to_water_m must be non-negative');
    if (K_vadose < 0) throw new Error('K_vadose must be non-negative');
    if (recharge_mm_per_year < 0) throw new Error('recharge_mm_per_year must be non-negative');

    const raw = 100 - clay_thickness_m * 5 - depth_to_water_m * 0.5 + K_vadose * 10 + recharge_mm_per_year * 0.05;
    const score = Math.max(0, Math.min(100, raw));

    let susceptibility;
    if (score > 75) susceptibility = 'high';
    else if (score >= 50) susceptibility = 'moderate';
    else susceptibility = 'low';

    return Object.freeze({ score, susceptibility, method: 'stigter-2006' });
}

// ---------------------------------------------------------------------------
// 9. Recharge area delineation (Sophocleous 2002)
// ---------------------------------------------------------------------------

/**
 * Minimum recharge area to sustain pumping (Sophocleous 2002).
 * R_eff = (precipitation - ET) * n_recharge / 1000  [m/year]
 * A = Q_annual / R_eff
 *
 * @param {number} Q_m3_per_day              - Pumping rate (m³/day)
 * @param {number} precipitation_mm_per_year - Annual precipitation (mm/year)
 * @param {number} n_recharge                - Recharge coefficient (0–1)
 * @param {number} evapotranspiration_mm_per_year - Annual ET (mm/year)
 * @returns {{area_m2:number, area_km2:number, R_eff_m_per_year:number, method:string}}
 */
export function rechargeAreaDelineation(
    Q_m3_per_day: number,
    precipitation_mm_per_year: number,
    n_recharge: number,
    evapotranspiration_mm_per_year: number,
): { area_m2: number; area_km2: number; R_eff_m_per_year: number; method: string } {
    if (Q_m3_per_day <= 0) throw new Error('Q_m3_per_day must be positive');
    if (precipitation_mm_per_year < 0) throw new Error('precipitation must be non-negative');
    if (n_recharge <= 0 || n_recharge > 1) throw new Error('n_recharge must be in (0, 1]');
    if (evapotranspiration_mm_per_year < 0) throw new Error('evapotranspiration must be non-negative');

    const net_mm = Math.max(0, precipitation_mm_per_year - evapotranspiration_mm_per_year);
    const R_eff_m_per_year = (net_mm * n_recharge) / 1000;

    if (R_eff_m_per_year <= 0) {
        return Object.freeze({
            area_m2: Infinity,
            area_km2: Infinity,
            R_eff_m_per_year: 0,
            method: 'sophocleous-2002',
        });
    }

    const Q_annual_m3 = Q_m3_per_day * 365;
    const area_m2 = Q_annual_m3 / R_eff_m_per_year;
    const area_km2 = area_m2 / 1e6;

    return Object.freeze({ area_m2, area_km2, R_eff_m_per_year, method: 'sophocleous-2002' });
}

// ---------------------------------------------------------------------------
// 10. Well interference - Cooper-Jacob (1946)
// ---------------------------------------------------------------------------

/**
 * Cooper-Jacob log approximation of Theis well function.
 * W(u) ≈ -0.5772 - ln(u)  for u < 0.05
 * Uses full Theis series for larger u.
 *
 * @param {number} u - Theis u parameter
 * @returns {number} W(u) well function value
 */
function wellFunction(u: number): number {
    if (u <= 0) return Infinity;
    if (u < 0.05) {
        // Cooper-Jacob approximation (accurate to <1% for u<0.05)
        return -0.5772156649 - Math.log(u);
    }
    // Theis series approximation (5 terms)
    // W(u) = -γ - ln(u) + u - u²/4 + u³/18 - u⁴/96 ...
    return -0.5772156649 - Math.log(u) + u - (u * u) / 4 + (u * u * u) / 18 - (u * u * u * u) / 96;
}

/**
 * Drawdown at well 1 due to two pumping wells (Cooper & Jacob 1946).
 * s_total = (Q1/(4πT)) * W(r11²S/(4Tt)) + (Q2/(4πT)) * W(r12²S/(4Tt))
 * r11 → well radius (typically 0.1–0.3 m); r12 = distance between wells.
 *
 * @param {number} r12_m    - Distance between wells (m)
 * @param {number} Q1       - Pumping rate well 1 (m³/day)
 * @param {number} Q2       - Pumping rate well 2 (m³/day)
 * @param {number} T        - Transmissivity (m²/day)
 * @param {number} S        - Storage coefficient (dimensionless)
 * @param {number} t_days   - Pumping time (days)
 * @returns {{s_well1_m:number, s_self_m:number, s_interference_m:number, method:string}}
 */
export function wellInterference(
    r12_m: number,
    Q1: number,
    Q2: number,
    T: number,
    S: number,
    t_days: number,
): { s_well1_m: number; s_self_m: number; s_interference_m: number; method: string } {
    if (r12_m <= 0) throw new Error('r12_m must be positive');
    if (T <= 0) throw new Error('T must be positive');
    if (S <= 0 || S > 1) throw new Error('S must be in (0, 1]');
    if (t_days <= 0) throw new Error('t_days must be positive');

    const r_well = 0.15; // m — typical well radius

    const u_self = (r_well * r_well * S) / (4 * T * t_days);
    const u_int = (r12_m * r12_m * S) / (4 * T * t_days);

    const W_self = wellFunction(u_self);
    const W_int = wellFunction(u_int);

    const factor = 1 / (4 * Math.PI * T);
    const s_self_m = Q1 * factor * W_self; // self drawdown at well 1 casing
    const s_interference_m = Q2 * factor * W_int; // drawdown at well 1 from well 2
    const s_well1_m = s_self_m + s_interference_m;

    return Object.freeze({ s_well1_m, s_self_m, s_interference_m, method: 'cooper-jacob-1946' });
}

// Named exports: fixedRadiusZone, timeRelatedCaptureZone, analyticalCaptureZoneArea,
// travelTimePorousMedia, whpaZone1, vulnerabilityDRASTIC,
// sourceWaterProtectionRadius, aquiferSusceptibility, rechargeAreaDelineation, wellInterference
// All functions are exported inline above via `export function ...`.
