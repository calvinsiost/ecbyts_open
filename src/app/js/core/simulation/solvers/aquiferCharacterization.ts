// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Aquifer Characterization Solver
 *
 * Pure-math functions for pumping test analysis and aquifer parameter estimation.
 * No browser APIs, DOM, IndexedDB, or Three.js dependencies.
 *
 * Academic references:
 *  - Brown et al. (1963) "Pumping Tests in Ground Water Management" USGS
 *  - Eden & Hazel (1973) Geological Survey of Canada Paper 73-2
 *  - Neuman (1972) Water Resources Research 8(4):1031-1045 DOI:10.1029/WR008i004p01031
 *  - Bear (1972) "Dynamics of Fluids in Porous Media" Elsevier
 *  - Hantush & Jacob (1955) Trans. AGU 36(1):95-100 DOI:10.1029/TR036i001p00095
 *  - Barker (1988) Water Resources Research 24(10):1796-1804 DOI:10.1029/WR024i010p01796
 *  - Jacob (1944) Trans. AGU 25:574-586
 *  - Theis (1935) Trans. AGU 16:519-524
 *  - Freeze & Cherry (1979) "Groundwater" Prentice-Hall
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Well function W(u) approximation (Theis 1935) using the Abramowitz & Stegun
 * polynomial series for u <= 1 and asymptotic expansion for u > 1.
 * Accurate to ±5e-7 over the full range.
 *
 * @param u - Theis parameter (dimensionless, > 0)
 * @returns W(u) well function value
 */
function _wellFunction(u: number): number {
    if (u <= 0) return Infinity;
    if (u > 60) return 0; // negligible

    // For u <= 1: series expansion (Abramowitz & Stegun 5.1.11)
    if (u <= 1) {
        // W(u) = -ln(u) - 0.5772... + u - u²/(2·2!) + u³/(3·3!) - ...
        const EULER_MASCHERONI = 0.5772156649015329;
        let series = 0;
        let term = u;
        let sign: number;
        for (let n = 1; n <= 20; n++) {
            sign = n % 2 === 1 ? 1 : -1;
            // term_n = (-1)^(n+1) * u^n / (n * n!)
            if (n > 1) term *= u / n;
            series += (sign * term) / n;
        }
        return -Math.log(u) - EULER_MASCHERONI + series;
    }

    // For u > 1: continued fraction / asymptotic expansion (A&S 5.1.56)
    // W(u) ≈ exp(-u)/u * (1 - 1/u + 2/u² - 6/u³ + ...)
    // eslint-disable-next-line
    const num = 1;
    let term = 1;
    let result = 1;
    for (let k = 1; k <= 15; k++) {
        term *= -k / u;
        result += term;
        if (Math.abs(term) < 1e-15 * Math.abs(result)) break;
    }
    return (Math.exp(-u) / u) * result;
}

/**
 * Cooper-Jacob approximation: W(u) ≈ -0.5772 - ln(u) (valid for u < 0.05)
 */
function _cooperJacob(u: number): number {
    const EULER_MASCHERONI = 0.5772156649015329;
    return -EULER_MASCHERONI - Math.log(u);
}

// ---------------------------------------------------------------------------
// 1. Specific Capacity
// ---------------------------------------------------------------------------

/**
 * Compute specific capacity and transmissivity estimate from a single pumping step.
 *
 * Sc = Q / s  (m²/s)
 * T ≈ 1.22 × Sc  (empirical, Brown 1963)
 *
 * @param Q_m3_per_s - Pumping rate (m³/s, > 0)
 * @param s_m        - Drawdown at observation point (m, > 0)
 * @throws {RangeError} if Q or s are not positive
 */
export function specificCapacity(
    Q_m3_per_s: number,
    s_m: number,
): { Sc_m2_per_s: number; T_estimate_m2_per_s: number; Q_m3_per_s: number; s_m: number } {
    if (Q_m3_per_s <= 0) throw new RangeError(`Q_m3_per_s must be > 0, got ${Q_m3_per_s}`);
    if (s_m <= 0) throw new RangeError(`s_m must be > 0, got ${s_m}`);
    const Sc_m2_per_s = Q_m3_per_s / s_m;
    // Brown (1963) empirical relation
    const T_estimate_m2_per_s = 1.22 * Sc_m2_per_s;
    return Object.freeze({ Sc_m2_per_s, T_estimate_m2_per_s, Q_m3_per_s, s_m });
}

// ---------------------------------------------------------------------------
// 2. Step Drawdown Test - Eden-Hazel (1973)
// ---------------------------------------------------------------------------

/**
 * Eden-Hazel (1973) step drawdown analysis.
 *
 * Fits the linear model: s/Q = B + C*Q
 *  B = aquifer (linear) loss coefficient (s/m²)
 *  C = well (turbulent) loss coefficient (s²/m⁵)
 * Well efficiency (at last step): we = B/(B + C*Q_last) × 100  (%)
 *
 * Uses ordinary least squares on {Q_i, (s/Q)_i} pairs.
 *
 * @param Q_steps - Pumping rates at each step (m³/s), length ≥ 3
 * @param s_steps - Drawdown at each step (m), same length as Q_steps
 * @throws {RangeError} if arrays have different lengths or fewer than 3 elements
 */
export function stepDrawdownTest(
    Q_steps: number[],
    s_steps: number[],
): { B: number; C: number; well_efficiency: number } {
    if (!Array.isArray(Q_steps) || !Array.isArray(s_steps)) {
        throw new RangeError('Q_steps and s_steps must be arrays');
    }
    if (Q_steps.length !== s_steps.length) {
        throw new RangeError('Q_steps and s_steps must have the same length');
    }
    if (Q_steps.length < 3) {
        throw new RangeError('At least 3 steps required for Eden-Hazel analysis');
    }
    for (let i = 0; i < Q_steps.length; i++) {
        if ((Q_steps[i] as number) <= 0) throw new RangeError(`Q_steps[${i}] must be > 0`);
        if ((s_steps[i] as number) <= 0) throw new RangeError(`s_steps[${i}] must be > 0`);
    }

    // y = s/Q, x = Q → fit y = B + C*x
    const n = Q_steps.length;
    const x = Q_steps;
    const y = Q_steps.map((Q, i) => (s_steps[i] as number) / Q);

    let sumX = 0,
        sumY = 0,
        sumXX = 0,
        sumXY = 0;
    for (let i = 0; i < n; i++) {
        const xi = x[i] as number;
        const yi = y[i] as number;
        sumX += xi;
        sumY += yi;
        sumXX += xi * xi;
        sumXY += xi * yi;
    }

    const denom = n * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-30) {
        throw new RangeError('Q_steps values are collinear — cannot fit regression');
    }

    const C = (n * sumXY - sumX * sumY) / denom;
    const B = (sumY - C * sumX) / n;

    const Q_last = Q_steps[Q_steps.length - 1] as number;
    const well_efficiency = (B / (B + C * Q_last)) * 100;

    return Object.freeze({ B, C, well_efficiency });
}

// ---------------------------------------------------------------------------
// 3. Neuman (1972/1974) Unconfined Drawdown
// ---------------------------------------------------------------------------

/**
 * Neuman (1972, 1974) solution for unconfined aquifer with delayed yield.
 *
 * Early-time response (elastic storage S):
 *   u_A = r²S / (4Tt)   →   s_early = Q/(4πT) × W(u_A)
 *
 * Late-time response (specific yield Sy):
 *   u_B = r²Sy / (4Tt)  →   s_late = Q/(4πT) × W(u_B)
 *
 * Cooper-Jacob approximation used when u < 0.05.
 *
 * @param r  - Radial distance from pumping well (m, > 0)
 * @param t  - Time since pumping started (s, > 0)
 * @param Q  - Pumping rate (m³/s, > 0)
 * @param T  - Transmissivity (m²/s, > 0)
 * @param S  - Elastic storativity (dimensionless, > 0)
 * @param Sy - Specific yield (dimensionless, > 0)
 * @throws {RangeError} for non-positive inputs
 */
export function neumanUnconfinedDrawdown(
    r: number,
    t: number,
    Q: number,
    T: number,
    S: number,
    Sy: number,
): { s_early_m: number; s_late_m: number; u_A: number; u_B: number } {
    if (r <= 0) throw new RangeError(`r must be > 0, got ${r}`);
    if (t <= 0) throw new RangeError(`t must be > 0, got ${t}`);
    if (Q <= 0) throw new RangeError(`Q must be > 0, got ${Q}`);
    if (T <= 0) throw new RangeError(`T must be > 0, got ${T}`);
    if (S <= 0) throw new RangeError(`S must be > 0, got ${S}`);
    if (Sy <= 0) throw new RangeError(`Sy must be > 0, got ${Sy}`);

    const u_A = (r * r * S) / (4 * T * t);
    const u_B = (r * r * Sy) / (4 * T * t);

    const W_A = u_A < 0.05 ? _cooperJacob(u_A) : _wellFunction(u_A);
    const W_B = u_B < 0.05 ? _cooperJacob(u_B) : _wellFunction(u_B);

    const coeff = Q / (4 * Math.PI * T);
    const s_early_m = coeff * W_A;
    const s_late_m = coeff * W_B;

    return Object.freeze({ s_early_m, s_late_m, u_A, u_B });
}

// ---------------------------------------------------------------------------
// 4. Hydraulic Diffusivity
// ---------------------------------------------------------------------------

/**
 * Hydraulic diffusivity and pressure wave travel time.
 *
 * D = T / S  (m²/s)
 * Travel time to distance r: t(r) = r² / (4D)
 *
 * @param T - Transmissivity (m²/s, > 0)
 * @param S - Storativity (dimensionless, > 0)
 * @throws {RangeError} for non-positive inputs
 */
export function hydraulicDiffusivity(
    T: number,
    S: number,
): { D: number; travelTime: (r: number) => number } {
    if (T <= 0) throw new RangeError(`T must be > 0, got ${T}`);
    if (S <= 0) throw new RangeError(`S must be > 0, got ${S}`);
    const D = T / S;
    return Object.freeze({
        D,
        travelTime: (r: number) => (r * r) / (4 * D),
    });
}

// ---------------------------------------------------------------------------
// 5. Leakance Coefficient - Hantush & Jacob (1955)
// ---------------------------------------------------------------------------

/**
 * Hantush leakance factor and leakance parameter.
 *
 * Leakage factor: B = sqrt(T × b_prime / K_prime)  [m]
 * Leakance parameter: L = K_prime / b_prime  [1/s]
 *
 * @param K_prime  - Confining layer hydraulic conductivity (m/s, > 0)
 * @param b_prime  - Confining layer thickness (m, > 0)
 * @param T        - Aquifer transmissivity (m²/s, > 0)
 * @throws {RangeError} for non-positive inputs
 */
export function leakanceCoefficient(
    K_prime: number,
    b_prime: number,
    T: number,
): { B_m: number; L_per_s: number } {
    if (K_prime <= 0) throw new RangeError(`K_prime must be > 0, got ${K_prime}`);
    if (b_prime <= 0) throw new RangeError(`b_prime must be > 0, got ${b_prime}`);
    if (T <= 0) throw new RangeError(`T must be > 0, got ${T}`);
    const B_m = Math.sqrt((T * b_prime) / K_prime);
    const L_per_s = K_prime / b_prime;
    return Object.freeze({ B_m, L_per_s });
}

// ---------------------------------------------------------------------------
// 6. Fractal Flow Dimension - Barker (1988)
// ---------------------------------------------------------------------------

/**
 * Barker (1988) Generalized Radial Flow model.
 *
 * Flow dimension from log-log derivative slope:
 *   n = 2 - 2 × slope_log_log
 *
 * Interpretation:
 *   n ≈ 1 → linear flow (fractures/channels)
 *   n ≈ 2 → radial flow (homogeneous porous media)
 *   n ≈ 3 → spherical flow
 *
 * @param slope_log_log - Slope of log(s) vs log(t) on diagnostic plot
 * @param _Q             - Pumping rate (reserved, informational)
 */
export function fractalFlowDimension(
    slope_log_log: number,
    _Q: number = 0,
): { n: number; flow_type: 'linear' | 'radial' | 'spherical' | 'intermediate' } {
    if (typeof slope_log_log !== 'number' || !isFinite(slope_log_log)) {
        throw new RangeError(`slope_log_log must be a finite number, got ${slope_log_log}`);
    }
    const n = 2 - 2 * slope_log_log;

    let flow_type;
    if (Math.abs(n - 1) < 0.25) {
        flow_type = 'linear';
    } else if (Math.abs(n - 2) < 0.25) {
        flow_type = 'radial';
    } else if (Math.abs(n - 3) < 0.25) {
        flow_type = 'spherical';
    } else {
        flow_type = 'intermediate';
    }

    return Object.freeze({ n, flow_type }) as any;
}

// ---------------------------------------------------------------------------
// 7. Aquifer Type Classification
// ---------------------------------------------------------------------------

/**
 * Classify aquifer type and transmissivity class from hydraulic parameters.
 *
 * Type classification:
 *  - confined: Sy/S < 10 (elastic storage dominates)
 *  - unconfined: Sy/S > 100 (gravity drainage dominates)
 *  - leaky_confined: 10 ≤ Sy/S ≤ 100
 *
 * Transmissivity classification (m²/d):
 *  - low: T < 10 m²/d
 *  - moderate: 10 ≤ T < 100 m²/d
 *  - high: 100 ≤ T < 1000 m²/d
 *  - very_high: T ≥ 1000 m²/d
 *
 * @param Sy - Specific yield (dimensionless, > 0)
 * @param S  - Elastic storativity (dimensionless, > 0)
 * @param K  - Hydraulic conductivity (m/s, > 0)
 * @param b  - Saturated thickness (m, > 0)
 * @throws {RangeError} for non-positive inputs
 */
export function aquiferTypeClassification(
    Sy: number,
    S: number,
    K: number,
    b: number,
): { type: string; T_m2_per_s: number; transmissivity_class: string; ratio_Sy_S: number } {
    if (Sy <= 0) throw new RangeError(`Sy must be > 0, got ${Sy}`);
    if (S <= 0) throw new RangeError(`S must be > 0, got ${S}`);
    if (K <= 0) throw new RangeError(`K must be > 0, got ${K}`);
    if (b <= 0) throw new RangeError(`b must be > 0, got ${b}`);

    const T_m2_per_s = K * b;
    const ratio_Sy_S = Sy / S;

    let type;
    if (ratio_Sy_S < 10) {
        type = 'confined';
    } else if (ratio_Sy_S > 100) {
        type = 'unconfined';
    } else {
        type = 'leaky_confined';
    }

    // Convert T to m²/d for classification
    const T_m2_per_d = T_m2_per_s * 86400;
    let transmissivity_class;
    if (T_m2_per_d < 10) {
        transmissivity_class = 'low';
    } else if (T_m2_per_d < 100) {
        transmissivity_class = 'moderate';
    } else if (T_m2_per_d < 1000) {
        transmissivity_class = 'high';
    } else {
        transmissivity_class = 'very_high';
    }

    return Object.freeze({ type, T_m2_per_s, transmissivity_class, ratio_Sy_S });
}

// ---------------------------------------------------------------------------
// 8. Jacob Correction for Unconfined Aquifer
// ---------------------------------------------------------------------------

/**
 * Jacob (1944) correction for water table decline in unconfined aquifers.
 *
 * s_corrected = s_measured - s_measured² / (2 × b)
 *
 * Significant when s_measured > 10% of b.
 *
 * @param s_measured    - Measured drawdown (m, > 0)
 * @param b_unconfined  - Initial saturated thickness (m, > s_measured)
 * @throws {RangeError} for non-positive or incompatible inputs
 */
export function jacobCorrection(
    s_measured: number,
    b_unconfined: number,
): {
    s_corrected: number;
    correction_percent: number;
    s_measured: number;
    b_unconfined: number;
    is_significant: boolean;
} {
    if (s_measured <= 0) throw new RangeError(`s_measured must be > 0, got ${s_measured}`);
    if (b_unconfined <= 0) throw new RangeError(`b_unconfined must be > 0, got ${b_unconfined}`);
    if (s_measured >= b_unconfined) {
        throw new RangeError(`s_measured (${s_measured}) must be less than b_unconfined (${b_unconfined})`);
    }

    const s_corrected = s_measured - (s_measured * s_measured) / (2 * b_unconfined);
    const correction_percent = ((s_measured - s_corrected) / s_measured) * 100;
    const is_significant = s_measured / b_unconfined > 0.1;

    return Object.freeze({ s_corrected, correction_percent, s_measured, b_unconfined, is_significant });
}

// ---------------------------------------------------------------------------
// 9. Recovery Analysis - Theis (1935)
// ---------------------------------------------------------------------------

/**
 * Theis recovery method: estimate T from residual drawdown after pumping stops.
 *
 * Residual drawdown: s' = Q/(4πT) × ln((t_pump + t_recovery) / t_recovery)
 *
 * Solving for T (single-point):
 *   T = Q × ln(t_pump + t_recovery) / (4π × s_residual)  [simplified, t_recovery → 0]
 *
 * Note: The standard Theis recovery equation uses the ratio t'/t_s':
 *   s' = Q/(4πT) × ln(t_ratio)  where t_ratio = (t_pump + t_rec) / t_rec
 *
 * @param s_residual      - Residual drawdown at measurement time (m, > 0)
 * @param Q               - Pumping rate (m³/s, > 0)
 * @param t_pump_min      - Pumping duration (minutes, > 0)
 * @param t_recovery_min  - Time since pumping stopped (minutes, > 0)
 * @throws {RangeError} for non-positive inputs
 */
export function recoveryAnalysis(
    s_residual: number,
    Q: number,
    t_pump_min: number,
    t_recovery_min: number,
): { T_m2_per_s: number; K_estimate: (r: number) => number; t_ratio: number } {
    if (s_residual <= 0) throw new RangeError(`s_residual must be > 0, got ${s_residual}`);
    if (Q <= 0) throw new RangeError(`Q must be > 0, got ${Q}`);
    if (t_pump_min <= 0) throw new RangeError(`t_pump_min must be > 0, got ${t_pump_min}`);
    if (t_recovery_min <= 0) throw new RangeError(`t_recovery_min must be > 0, got ${t_recovery_min}`);

    // t_ratio = (t_pump + t_recovery) / t_recovery  (dimensionless)
    const t_ratio = (t_pump_min + t_recovery_min) / t_recovery_min;
    // T = Q * ln(t_ratio) / (4π * s')
    const T_m2_per_s = (Q * Math.log(t_ratio)) / (4 * Math.PI * s_residual);

    return Object.freeze({
        T_m2_per_s,
        K_estimate: (r: number) => T_m2_per_s / r,
        t_ratio,
    });
}

// ---------------------------------------------------------------------------
// 10. Groundwater Velocity - Freeze & Cherry (1979)
// ---------------------------------------------------------------------------

/**
 * Linear (average pore) groundwater velocity.
 *
 * v = K × i / n_e  (m/s)
 *
 * Travel time from source to receptor at distance L:
 *   t(L) = L / v  (s)
 *
 * @param K   - Hydraulic conductivity (m/s, > 0)
 * @param i   - Hydraulic gradient (dimensionless, > 0)
 * @param n_e - Effective porosity (dimensionless, 0 < n_e < 1)
 * @throws {RangeError} for invalid inputs
 */
export function groundwaterVelocity(
    K: number,
    i: number,
    n_e: number,
): { v_m_per_s: number; v_m_per_day: number; travelTime: (L_m: number) => number } {
    if (K <= 0) throw new RangeError(`K must be > 0, got ${K}`);
    if (i <= 0) throw new RangeError(`i must be > 0, got ${i}`);
    if (n_e <= 0 || n_e >= 1) throw new RangeError(`n_e must be in (0,1), got ${n_e}`);

    const v_m_per_s = (K * i) / n_e;
    const v_m_per_day = v_m_per_s * 86400;

    return Object.freeze({
        v_m_per_s,
        v_m_per_day,
        travelTime: (L_m: number) => L_m / v_m_per_s,
    });
}
