// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt


/**
 * Sediment Transport - pure-math solver module.
 *
 * Implements classical sediment transport equations:
 *   - Shields (1936) dimensionless bed shear stress
 *   - Van Rijn (1984) critical Shields curve
 *   - Meyer-Peter & Müller (1948) bedload formula
 *   - Einstein (1950) bedload intensity
 *   - Rouse (1937) suspension number + concentration profile
 *   - Stokes (1851) / Schiller-Naumann (1933) settling velocity
 *   - USLE sediment yield (Wischmeier & Smith 1978)
 *
 * All functions are pure (no side effects, no DOM, no IDB, no Three.js).
 */

// ---------------------------------------------------------------------------
// 1. Shields parameter
// ---------------------------------------------------------------------------

/**
 * Calculates the dimensionless Shields stress (bed shear stress parameter).
 * theta = tau / ((rho_s - rho_w) * g * d50)
 *
 * @param tau_Pa - Bed shear stress (Pa)
 * @param rho_s - Sediment density (kg/m³, typically 2650)
 * @param rho_w - Water density (kg/m³, typically 1000)
 * @param g - Gravitational acceleration (m/s², typically 9.81)
 * @param d50_m - Median grain diameter (m)
 * @returns Dimensionless Shields stress theta (-)
 *
 * Reference: Shields (1936) "Anwendung der Ähnlichkeitsmechanik und der
 *            Turbulenzforschung auf die Geschiebebewegung"
 */
function shieldsParameter(tau_Pa: number, rho_s: number, rho_w: number, g: number, d50_m: number): number {
    const submerged_weight = (rho_s - rho_w) * g * d50_m;
    if (submerged_weight <= 0) return 0;
    return tau_Pa / submerged_weight;
}

// ---------------------------------------------------------------------------
// 2. Critical Shields parameter (Van Rijn 1984 approximation)
// ---------------------------------------------------------------------------

/**
 * Critical Shields parameter as a function of particle Reynolds number.
 * Piecewise approximation of the Shields curve (Van Rijn 1984).
 *
 * @param Re_star - Particle Reynolds number (-)
 * @returns Critical Shields parameter theta_c (-)
 *
 * Reference: Van Rijn (1984) "Sediment transport, Part I: Bed load transport"
 *            Journal of Hydraulic Engineering, ASCE
 */
function criticalShieldsParameter(Re_star: number): number {
    if (Re_star <= 0) return 0.055;
    if (Re_star < 4) return 0.24 / Re_star;
    if (Re_star < 10) return 0.14 * Math.pow(Re_star, -0.64);
    if (Re_star < 20) return 0.04 * Math.pow(Re_star, -0.1);
    if (Re_star < 150) return 0.013 * Math.pow(Re_star, 0.29);
    return 0.055;
}

// ---------------------------------------------------------------------------
// 3. Particle Reynolds number
// ---------------------------------------------------------------------------

/**
 * Particle Reynolds number for sediment threshold calculations.
 * Re_star = sqrt((rho_s/rho_w - 1) * g * d50) * d50 / nu
 *
 * @param d50_m - Median grain diameter (m)
 * @param rho_s - Sediment density (kg/m³)
 * @param rho_w - Water density (kg/m³)
 * @param nu - Kinematic viscosity of water (m²/s, ~1e-6 at 20°C)
 * @param g - Gravitational acceleration (m/s²)
 * @returns Particle Reynolds number Re_star (-)
 *
 * Reference: Van Rijn (1984) JHE ASCE
 */
function particleReynoldsNumber(d50_m: number, rho_s: number, rho_w: number, nu: number, g: number): number {
    const s = rho_s / rho_w;
    const u_star_d = Math.sqrt((s - 1) * g * d50_m);
    return (u_star_d * d50_m) / nu;
}

// ---------------------------------------------------------------------------
// 4. Meyer-Peter & Müller bedload formula
// ---------------------------------------------------------------------------

interface MeyerPeterMullerResult {
    q_b_star: number;
    q_b_m2_per_s: number;
}

/**
 * Meyer-Peter & Müller (1948) bedload transport formula.
 * q_b* = 8 * (theta - theta_c)^1.5  when theta > theta_c, else 0
 * Dimensional: q_b = q_b* * sqrt((s-1) * g * d50^3)
 *
 * @param theta - Dimensionless Shields stress (-)
 * @param theta_c - Critical Shields stress (-)
 * @param rho_s - Sediment density (kg/m³)
 * @param rho_w - Water density (kg/m³)
 * @param g - Gravitational acceleration (m/s²)
 * @param d50_m - Median grain diameter (m)
 * @returns q_b_star = dimensionless bedload intensity
 *   q_b_m2_per_s = volumetric bedload per unit width (m²/s)
 *
 * Reference: Meyer-Peter & Müller (1948) "Formulas for Bed-Load Transport"
 *            IAHR 2nd Meeting, Stockholm
 */
function meyerpetermuller(theta: number, theta_c: number, rho_s: number, rho_w: number, g: number, d50_m: number): MeyerPeterMullerResult {
    const excess = theta - theta_c;
    if (excess <= 0) return { q_b_star: 0, q_b_m2_per_s: 0 };
    const q_b_star = 8 * Math.pow(excess, 1.5);
    const s = rho_s / rho_w;
    const q_b_m2_per_s = q_b_star * Math.sqrt((s - 1) * g * Math.pow(d50_m, 3));
    return { q_b_star, q_b_m2_per_s };
}

// ---------------------------------------------------------------------------
// 5. Einstein bedload intensity
// ---------------------------------------------------------------------------

interface EinsteinResult {
    phi_b: number;
    q_b_m2_per_s: number;
}

/**
 * Einstein (1950) simplified bedload intensity formula (Einstein-Brown).
 * phi_b = 40 * theta^3
 * q_b = phi_b * sqrt((s-1) * g * d50^3)
 *
 * @param theta - Dimensionless Shields stress (-)
 * @param d50_m - Median grain diameter (m)
 * @param rho_s - Sediment density (kg/m³)
 * @param rho_w - Water density (kg/m³)
 * @param g - Gravitational acceleration (m/s²)
 * @returns phi_b and q_b_m2_per_s
 *
 * Reference: Einstein (1950) "The Bed-Load Function for Sediment Transportation
 *            in Open Channel Flows", USDA Technical Bulletin 1026
 */
function einsteinBedload(theta: number, d50_m: number, rho_s: number, rho_w: number, g: number): EinsteinResult {
    const phi_b = 40 * Math.pow(theta, 3);
    const s = rho_s / rho_w;
    const q_b_m2_per_s = phi_b * Math.sqrt((s - 1) * g * Math.pow(d50_m, 3));
    return { phi_b, q_b_m2_per_s };
}

// ---------------------------------------------------------------------------
// 6. Rouse number and transport regime
// ---------------------------------------------------------------------------

interface RouseResult {
    Z: number;
    transport_regime: string;
}

/**
 * Rouse number classifying the mode of sediment transport.
 * Z = ws / (kappa * u_star)
 *
 * Regimes:
 *   Z < 1.2    → wash load (fully suspended)
 *   1.2 ≤ Z < 2.5 → suspended bedload
 *   2.5 ≤ Z < 7.5 → mixed load
 *   Z ≥ 7.5    → bedload
 *
 * @param ws - Settling velocity (m/s)
 * @param u_star - Friction velocity (m/s)
 * @param kappa - von Kármán constant (typically 0.41)
 * @returns Z and transport regime
 *
 * Reference: Rouse (1937) "Modern conceptions of the mechanics of fluid
 *            turbulence", Trans. ASCE 102
 */
function rouseNumber(ws: number, u_star: number, kappa: number): RouseResult {
    if (u_star <= 0 || kappa <= 0) return { Z: Infinity, transport_regime: 'bedload' };
    const Z = ws / (kappa * u_star);
    let transport_regime: string;
    if (Z < 1.2) transport_regime = 'wash load';
    else if (Z < 2.5) transport_regime = 'suspended';
    else if (Z < 7.5) transport_regime = 'mixed';
    else transport_regime = 'bedload';
    return { Z, transport_regime };
}

// ---------------------------------------------------------------------------
// 7. Stokes / Schiller-Naumann settling velocity
// ---------------------------------------------------------------------------

interface SettlingResult {
    ws_m_per_s: number;
    Re_p: number;
    regime: string;
}

/**
 * Settling velocity using Stokes law for Re_p < 1 and Schiller-Naumann
 * drag correction for transitional regime (Re_p 1–1000). Iterative solution.
 *
 * Stokes: ws = (rho_s - rho_w) * g * d^2 / (18 * rho_w * nu)
 * Drag (S-N): Cd = 24/Re_p * (1 + 0.15 * Re_p^0.687)
 * Equilibrium: ws = sqrt(4/3 * (s-1)*g*d / Cd)
 *
 * @param d_m - Particle diameter (m)
 * @param rho_s - Sediment density (kg/m³)
 * @param rho_w - Water density (kg/m³)
 * @param nu - Kinematic viscosity (m²/s)
 * @param g - Gravitational acceleration (m/s²)
 * @returns ws_m_per_s, Re_p and regime
 *
 * References: Stokes (1851) "On the Effect of the Internal Friction of Fluids
 *             on the Motion of Pendulums"; Schiller & Naumann (1933)
 */
function stokesSettlingVelocity(d_m: number, rho_s: number, rho_w: number, nu: number, g: number): SettlingResult {
    const s = rho_s / rho_w;
    // Initial estimate from Stokes (valid for Re_p < 1)
    let ws = ((rho_s - rho_w) * g * d_m * d_m) / (18 * rho_w * nu);
    if (ws <= 0) return { ws_m_per_s: 0, Re_p: 0, regime: 'stokes' };

    const MAX_ITER = 50;
    const TOL = 1e-10;
    for (let i = 0; i < MAX_ITER; i++) {
        const Re_p = (ws * d_m) / nu;
        let Cd: number;
        if (Re_p < 1e-10) {
            Cd = 24 / 1e-10;
        } else if (Re_p <= 1000) {
            // Schiller-Naumann
            Cd = (24 / Re_p) * (1 + 0.15 * Math.pow(Re_p, 0.687));
        } else {
            Cd = 0.44; // Newton's law regime
        }
        const ws_new = Math.sqrt(((4 / 3) * (s - 1) * g * d_m) / Cd);
        if (Math.abs(ws_new - ws) < TOL) {
            ws = ws_new;
            break;
        }
        ws = ws_new;
    }

    const Re_p = (ws * d_m) / nu;
    let regime: string;
    if (Re_p < 1) regime = 'stokes';
    else if (Re_p < 1000) regime = 'transitional';
    else regime = 'turbulent';

    return { ws_m_per_s: ws, Re_p, regime };
}

// ---------------------------------------------------------------------------
// 8. Bed shear stress
// ---------------------------------------------------------------------------

/**
 * Bed shear stress from hydraulic parameters (depth-slope product).
 * tau = rho_w * g * R_h * S
 *
 * @param rho_w - Water density (kg/m³)
 * @param g - Gravitational acceleration (m/s²)
 * @param R_h - Hydraulic radius (m)
 * @param S - Energy slope (m/m, dimensionless)
 * @returns Bed shear stress tau (Pa)
 */
function bedShearStress(rho_w: number, g: number, R_h: number, S: number): number {
    return rho_w * g * R_h * S;
}

// ---------------------------------------------------------------------------
// 9. Suspended sediment concentration (Rouse profile)
// ---------------------------------------------------------------------------

/**
 * Rouse (1937) vertical concentration profile for suspended sediment.
 * C(z) = C_a * ((a * (h - z)) / (z * (h - a)))^Z_rouse
 *
 * @param C_a - Reference concentration at height a (any consistent units)
 * @param z - Height above bed where C is evaluated (m)
 * @param a - Reference height above bed (m, typically 2*d50 or 0.05*h)
 * @param h - Total water depth (m)
 * @param Z_rouse - Rouse number (-)
 * @returns Concentration at height z (same units as C_a)
 *
 * Reference: Rouse (1937) Trans. ASCE 102
 */
function suspendedSedimentConcentration(C_a: number, z: number, a: number, h: number, Z_rouse: number): number {
    if (z <= 0 || z >= h || a <= 0 || a >= h) return 0;
    const ratio = (a * (h - z)) / (z * (h - a));
    if (ratio <= 0) return 0;
    return C_a * Math.pow(ratio, Z_rouse);
}

// ---------------------------------------------------------------------------
// 10. USLE sediment yield
// ---------------------------------------------------------------------------

/**
 * Universal Soil Loss Equation (USLE) annual sediment yield.
 * A = R * K * LS * C * P  (tonnes/ha/year)
 *
 * R (rainfall erosivity) estimated from annual precipitation:
 *   R = 0.0483 * P^1.61  (Wischmeier & Smith 1978, P in mm)
 *
 * @param A_km2 - Catchment area (km², not used in per-ha computation - kept for signature symmetry)
 * @param P_mm - Mean annual precipitation (mm)
 * @param K_erodibility - Soil erodibility factor (t·h / MJ·mm)
 * @param LS_factor - Slope length and steepness factor (-)
 * @param C_cover - Cover and management factor (-, 0–1)
 * @param P_support - Support practice factor (-, 0–1)
 * @returns Estimated annual soil loss (tonnes/ha/year)
 *
 * Reference: Wischmeier & Smith (1978) "Predicting Rainfall Erosion Losses -
 *            A Guide to Conservation Planning", USDA Agriculture Handbook 537
 */
function sedimentYield(A_km2: number, P_mm: number, K_erodibility: number, LS_factor: number, C_cover: number, P_support: number): number {
    void A_km2; // Area not needed for per-ha USLE output
    const R = 0.0483 * Math.pow(Math.max(0, P_mm), 1.61);
    return R * K_erodibility * LS_factor * C_cover * P_support;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
    shieldsParameter,
    criticalShieldsParameter,
    particleReynoldsNumber,
    meyerpetermuller,
    einsteinBedload,
    rouseNumber,
    stokesSettlingVelocity,
    bedShearStress,
    suspendedSedimentConcentration,
    sedimentYield,
};
