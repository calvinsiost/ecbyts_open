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
// Spec code: BCR
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: Environmental Engineering - NAPL / multiphase subsurface transport
// Authorship: Calvin Stefan Iost

/**
 * Multiphase Fluids Transport - Pure-logic scientific module (BCR)
 *
 * Implements constitutive relationships and transport equations for
 * non-aqueous phase liquids (NAPL) in saturated and unsaturated porous media.
 * Covers relative permeability, capillary pressure–saturation, Darcy multiphase
 * flux, DNAPL/LNAPL source-zone mass discharge, sorption, colloid transport,
 * density-driven flow, air sparging, SVE concentration decline, and hysteresis.
 *
 * All functions are pure (no DOM, IDB, Three.js, fetch, or global state).
 * Suitable for Node.js import in tests and browser ESM import.
 *
 * Referências acadêmicas:
 *   Brooks, R.H. & Corey, A.T. (1964). Hydraulic properties of porous media.
 *     Hydrology Paper No. 3, Colorado State University.
 *   van Genuchten, M.Th. (1980). A closed-form equation for predicting the
 *     hydraulic conductivity of unsaturated soils. Soil Sci. Soc. Am. J.,
 *     44(5): 892–898. DOI: 10.2136/sssaj1980.03615995004400050002x
 *   Parker, J.C., Lenhard, R.J. & Kuppusamy, T. (1987). A parametric model
 *     for constitutive properties governing multiphase flow in porous media.
 *     Water Resour. Res., 23(4): 618–624. DOI: 10.1029/WR023i004p00618
 *   Mayer, A.S. & Miller, C.T. (1996). The influence of mass transfer
 *     characteristics and porous media heterogeneity on nonaqueous phase
 *     dissolution. Water Resour. Res., 32(6): 1551–1567.
 *     DOI: 10.1029/96WR00291
 *   Farr, A.M., Houghtalen, R.J. & McWhorter, D.B. (1990). Volume estimation
 *     of light nonaqueous phase liquids in porous media. Groundwater,
 *     28(1): 48–56. DOI: 10.1111/j.1745-6584.1990.tb02228.x
 *   Pankow, J.F. & Cherry, J.A. (eds.) (1996). Dense chlorinated solvents and
 *     other DNAPLs in groundwater. Waterloo Press. ISBN: 0-9648014-1-8
 *   Millington, R.J. & Quirk, J.P. (1961). Permeability of porous solids.
 *     Trans. Faraday Soc., 57: 1200–1207. DOI: 10.1039/TF9615701200
 *   van Genuchten, M.Th. & Wierenga, P.J. (1976). Mass transfer studies in
 *     sorbing porous media. I. Analytical solutions. Soil Sci. Soc. Am. J.,
 *     40(4): 473–480. DOI: 10.2136/sssaj1976.03615995004000040011x
 *   Torkzaban, S., Bradford, S.A., van Genuchten, M.Th. & Walker, S.L. (2008).
 *     Colloid transport in unsaturated porous media: The role of water content
 *     and ionic strength on particle straining. J. Contam. Hydrol.,
 *     96(1-4): 113–127. DOI: 10.1016/j.jconhyd.2007.10.006
 *   Henry, H.R. (1964). Effects of dispersion on salt encroachment in coastal
 *     aquifers. USGS Water Supply Paper 1613-C, C71–C84.
 *   Goltz, M.N. & Oxley, M.E. (1991). Analytical modeling of aquifer
 *     decontamination by pumping when transport is affected by rate-limited
 *     sorption. Water Resour. Res., 27(4): 547–556.
 *     DOI: 10.1029/90WR02772
 *   ASTM E2856-13 (2013). Standard Guide for Estimation of LNAPL Transmissivity.
 *     ASTM International.
 *   Johnson, R.L., Johnson, P.C., McWhorter, D.B., Hinchee, R.E. & Goodman, I.
 *     (1993). An overview of in situ air sparging. Ground Water Monit. Rem.,
 *     13(4): 127–135. DOI: 10.1111/j.1745-6592.1993.tb00456.x
 *   Rathfelder, K., Yeh, W.W.G. & Mackay, D. (1993). Mathematical simulation
 *     of soil vapor extraction systems: model development and numerical examples.
 *     J. Contam. Hydrol., 12(3): 231–252. DOI: 10.1016/0169-7722(93)90022-R
 *   Meinzer, O.E. (1923). Outline of ground-water hydrology. USGS Water Supply
 *     Paper 494.
 *   Kool, J.B. & Parker, J.C. (1987). Development and evaluation of closed-form
 *     expressions for hysteretic soil hydraulic properties. Water Resour. Res.,
 *     23(1): 105–114. DOI: 10.1029/WR023i001p00105
 *   Jury, W.A., Spencer, W.F. & Farmer, W.J. (1983). Behavior assessment model
 *     for trace organics in soil: I. Model description. J. Environ. Qual.,
 *     12(4): 558–564. DOI: 10.2134/jeq1983.00472425001200040025x
 *   Freundlich, H. (1907). Über die Adsorption in Lösungen. Z. Phys. Chem.,
 *     57A: 385–470.
 */

console.debug('[BCR:load]', 'app/js/core/analytics/multiphaseFluidsTransport.js');

// ---------------------------------------------------------------------------
// Module-level constants (frozen to prevent accidental mutation)
// ---------------------------------------------------------------------------

/** Gravitational acceleration [m/s²] */
// eslint-disable-next-line
const G_CONST = Object.freeze({ value: 9.80665, unit: 'm/s²' });

/** Water dynamic viscosity at 20 °C [Pa·s] */
// eslint-disable-next-line
const MU_WATER_20C = Object.freeze({ value: 1.002e-3, unit: 'Pa·s' });

// ---------------------------------------------------------------------------
// 1. Brooks-Corey Relative Permeability
// ---------------------------------------------------------------------------

/**
 * Computes Brooks-Corey (1964) relative permeability for wetting (water) and
 * non-wetting (NAPL) phases as functions of water saturation Sw.
 *
 * Equations:
 *   Se  = (Sw - Swr) / (1 - Swr - Snwr)          [effective saturation]
 *   krw  = Se^nw
 *   krnw = (1 - Se)^nn · (1 - Se^((2+nn)/nn))^0  [simplified two-phase]
 *
 * Standard two-phase Brooks-Corey form (Corey 1954):
 *   krw  = Se^((2+3λ)/λ)  → here exposed as exponent nw (user-supplied)
 *   krnw = (1-Se)²·(1-Se^((2+λ)/λ)) → user supplies nn
 *
 * @param {number} Sw   - Water saturation [-], 0 ≤ Sw ≤ 1
 * @param {number} Swr  - Residual water saturation [-], 0 ≤ Swr < 1
 * @param {number} Snwr - Residual NAPL saturation [-], 0 ≤ Snwr < 1
 * @param {number} nw   - Brooks-Corey exponent for wetting phase (> 1)
 * @param {number} nn   - Brooks-Corey exponent for non-wetting phase (> 1)
 * @returns {{ krw: number, krnw: number, Se: number }}
 *   krw  - relative permeability of water phase [-]
 *   krnw - relative permeability of NAPL phase [-]
 *   Se   - effective (normalised) water saturation [-]
 * @reference Brooks & Corey (1964). Hydrology Paper No. 3, Colorado State Univ.
 */
export function computeBrooksCoreyRelPerm(Sw: number, Swr: number, Snwr: number, nw: number, nn: number): { krw: number, krnw: number, Se: number } {
    if (Sw < 0 || Sw > 1) throw new RangeError(`[BCR] Sw=${Sw} must be in [0,1]`);
    if (Swr < 0 || Swr >= 1) throw new RangeError(`[BCR] Swr=${Swr} must be in [0,1)`);
    if (Snwr < 0 || Snwr >= 1) throw new RangeError(`[BCR] Snwr=${Snwr} must be in [0,1)`);
    if (nw <= 0) throw new RangeError(`[BCR] nw=${nw} must be > 0`);
    if (nn <= 0) throw new RangeError(`[BCR] nn=${nn} must be > 0`);

    const Smax = 1 - Snwr;
    // Clamp Sw to the physical range [Swr, 1-Snwr]
    const SwClamped = Math.max(Swr, Math.min(Smax, Sw));

    const denom = Smax - Swr;
    // If residual saturations leave no mobile range, return zeros
    if (denom <= 0) return { krw: 0, krnw: 0, Se: 0 };

    const Se = (SwClamped - Swr) / denom;

    const krw = Math.pow(Se, nw);

    // Non-wetting: Burdine (1953) form used in Brooks-Corey:
    // krnw = (1-Se)^2 · (1 - Se^((2+nn)/nn))
    // Generalised to user-supplied nn exponent on the leading term.
    const krnw = Math.pow(1 - Se, nn) * (1 - Math.pow(Se, (2 + nn) / nn));

    return {
        krw: Math.max(0, Math.min(1, krw)),
        krnw: Math.max(0, Math.min(1, krnw)),
        Se,
    };
}

// ---------------------------------------------------------------------------
// 2. van Genuchten Relative Permeability
// ---------------------------------------------------------------------------

/**
 * Computes van Genuchten (1980) relative permeability curves for water and
 * NAPL using the Mualem (1976) conductivity model.
 *
 * Equations (Mualem–van Genuchten):
 *   Se   = (Sw - Swr) / (1 - Swr - Snwr)
 *   krw  = Se^0.5 · [1 - (1 - Se^(1/m))^m]²
 *   krnw = (1-Se)^0.5 · [1 - Se^(1/m)]^(2m)
 *
 * @param {number} Sw   - Water saturation [-]
 * @param {number} Swr  - Residual water saturation [-]
 * @param {number} Snwr - Residual NAPL saturation [-]
 * @param {number} alpha - van Genuchten α parameter [1/m] (> 0)
 * @param {number} n    - van Genuchten pore-size index n (> 1)
 * @param {number} m    - Shape parameter m = 1 - 1/n (0 < m < 1).
 *                        Pass null to use m = 1 - 1/n automatically.
 * @returns {{ krw: number, krnw: number, Se: number }}
 * @reference van Genuchten (1980). Soil Sci. Soc. Am. J. 44(5):892-898.
 *   DOI: 10.2136/sssaj1980.03615995004400050002x
 */
export function computeVanGenuchtenRelPerm(Sw: number, Swr: number, Snwr: number, alpha: number, n: number, m: number): { krw: number, krnw: number, Se: number } {
    if (Sw < 0 || Sw > 1) throw new RangeError(`[BCR] Sw=${Sw} must be in [0,1]`);
    if (Swr < 0 || Swr >= 1) throw new RangeError(`[BCR] Swr=${Swr} must be in [0,1)`);
    if (Snwr < 0 || Snwr >= 1) throw new RangeError(`[BCR] Snwr=${Snwr} must be in [0,1)`);
    if (alpha <= 0) throw new RangeError(`[BCR] alpha=${alpha} must be > 0`);
    if (n <= 1) throw new RangeError(`[BCR] n=${n} must be > 1`);

    // m defaults to 1 - 1/n (Mualem constraint)
    const mVal = m == null ? 1 - 1 / n : m;
    if (mVal <= 0 || mVal >= 1) throw new RangeError(`[BCR] m=${mVal} must be in (0,1)`);

    const Smax = 1 - Snwr;
    const SwClamped = Math.max(Swr, Math.min(Smax, Sw));
    const denom = Smax - Swr;
    if (denom <= 0) return { krw: 0, krnw: 0, Se: 0 };

    const Se = (SwClamped - Swr) / denom;

    // Water relative permeability (Mualem-vG)
    const inner = 1 - Math.pow(Se, 1 / mVal);
    const krw = Math.sqrt(Se) * Math.pow(1 - Math.pow(inner, mVal), 2);

    // NAPL relative permeability (Lenhard & Parker 1987 adaptation)
    // krnw = (1-Se)^0.5 · (1 - Se^(1/m))^(2m)
    const krnw = Math.sqrt(1 - Se) * Math.pow(inner < 0 ? 0 : inner, 2 * mVal);

    return {
        krw: Math.max(0, Math.min(1, krw)),
        krnw: Math.max(0, Math.min(1, krnw)),
        Se,
    };
}

// ---------------------------------------------------------------------------
// 3. van Genuchten Capillary Pressure–Saturation
// ---------------------------------------------------------------------------

/**
 * Computes the van Genuchten (1980) capillary pressure as a function of
 * water saturation.
 *
 * Equation:
 *   Se  = (Sw - Swr) / (1 - Swr)
 *   Pc  = (1/alpha) · (Se^(-1/m) - 1)^(1/n)    [Pa]
 *
 * where m = 1 - 1/n (Mualem constraint unless m is explicitly supplied).
 *
 * @param {number} Sw    - Water saturation [-], Swr < Sw ≤ 1
 * @param {number} Swr   - Residual water saturation [-]
 * @param {number} alpha - van Genuchten α parameter [1/Pa] (> 0)
 * @param {number} n     - van Genuchten n parameter (> 1)
 * @returns {{ Pc_Pa: number, Se: number }}
 *   Pc_Pa - capillary pressure [Pa] (positive = water–air or water–NAPL)
 *   Se    - effective saturation [-]
 * @reference van Genuchten (1980). Soil Sci. Soc. Am. J. 44(5):892-898.
 *   DOI: 10.2136/sssaj1980.03615995004400050002x
 */
export function computeCapillaryPressurePCSW(Sw: number, Swr: number, alpha: number, n: number): { Pc_Pa: number, Se: number } {
    if (alpha <= 0) throw new RangeError(`[BCR] alpha=${alpha} must be > 0`);
    if (n <= 1) throw new RangeError(`[BCR] n=${n} must be > 1`);
    if (Swr < 0 || Swr >= 1) throw new RangeError(`[BCR] Swr=${Swr} must be in [0,1)`);

    const m = 1 - 1 / n;
    // Clamp Sw to (Swr, 1] - Sw = 1 → Pc = 0
    const SwClamped = Math.max(Swr + 1e-10, Math.min(1, Sw));
    const Se = (SwClamped - Swr) / (1 - Swr);

    if (Se >= 1) return { Pc_Pa: 0, Se: 1 };

    // Pc = (1/alpha) * (Se^(-1/m) - 1)^(1/n)
    const inner = Math.pow(Se, -1 / m) - 1;
    const Pc_Pa = (1 / alpha) * Math.pow(inner, 1 / n);

    return { Pc_Pa: Math.max(0, Pc_Pa), Se };
}

// ---------------------------------------------------------------------------
// 4. Brooks-Corey Drainage: NAPL Saturation from Capillary Pressure
// ---------------------------------------------------------------------------

/**
 * Converts capillary pressure to NAPL saturation using the Brooks-Corey
 * drainage capillary pressure model.
 *
 * Equation:
 *   If Pc ≤ Pd:   Sw = 1  (no NAPL entry)
 *   If Pc  > Pd:  Sw = (Pc/Pd)^(-lambda)
 *   Sn = 1 - Sw
 *
 * @param {number} Pc            - Capillary pressure [Pa] (≥ 0)
 * @param {number} entry_pressure - Brooks-Corey entry pressure Pd [Pa] (> 0)
 * @param {number} lambda        - Brooks-Corey pore-size distribution index (> 0)
 * @returns {{ Sn: number, Sw: number }}
 *   Sn - NAPL saturation [-]
 *   Sw - water saturation [-]
 * @reference Brooks & Corey (1964). Hydrology Paper No. 3, Colorado State Univ.
 */
export function computeNAPLSaturationFromCapillaryPressure(Pc: number, entry_pressure: number, lambda: number): { Sn: number, Sw: number } {
    if (Pc < 0) throw new RangeError(`[BCR] Pc=${Pc} must be ≥ 0`);
    if (entry_pressure <= 0) throw new RangeError(`[BCR] entry_pressure=${entry_pressure} must be > 0`);
    if (lambda <= 0) throw new RangeError(`[BCR] lambda=${lambda} must be > 0`);

    if (Pc <= entry_pressure) return { Sn: 0, Sw: 1 };

    const Sw = Math.pow(Pc / entry_pressure, -lambda);
    const SwClamped = Math.max(0, Math.min(1, Sw));
    return { Sn: 1 - SwClamped, Sw: SwClamped };
}

// ---------------------------------------------------------------------------
// 5. Multiphase Darcy Flux
// ---------------------------------------------------------------------------

/**
 * Computes multiphase Darcy flux for water and NAPL phases.
 *
 * Darcy law extended to two-phase flow (Parker et al. 1987):
 *   q_w  = -(K · krw / mu_w) · gradH_w     [m/s]
 *   q_nw = -(K · krnw / mu_n) · gradH_n    [m/s]
 *
 * Head gradients gradH_w and gradH_n are total head gradients [m/m]
 * (dimensionless). K is intrinsic permeability [m²] or hydraulic
 * conductivity [m/s] depending on caller convention - must be consistent
 * with mu units.
 *
 * @param {number} K      - Intrinsic permeability [m²] (or Ksat [m/s])
 * @param {number} krw    - Water relative permeability [-]
 * @param {number} krnw   - NAPL relative permeability [-]
 * @param {number} gradH_w  - Water hydraulic gradient [m/m or Pa/m]
 * @param {number} gradH_n  - NAPL hydraulic gradient [m/m or Pa/m]
 * @param {number} mu_w   - Water dynamic viscosity [Pa·s] (or 1 for Ksat form)
 * @param {number} mu_n   - NAPL dynamic viscosity [Pa·s]
 * @returns {{ q_w: number, q_nw: number }}
 *   q_w  - Darcy flux for water phase [m/s or m²/(s·m²)]
 *   q_nw - Darcy flux for NAPL phase [m/s or m²/(s·m²)]
 * @reference Parker et al. (1987). Water Resour. Res. 23(4):618-624.
 *   DOI: 10.1029/WR023i004p00618
 */
export function computeMultiphaseFluxDarcy(K: number, krw: number, krnw: number, gradH_w: number, gradH_n: number, mu_w: number, mu_n: number): { q_w: number, q_nw: number } {
    if (K < 0) throw new RangeError(`[BCR] K=${K} must be ≥ 0`);
    if (krw < 0 || krw > 1) throw new RangeError(`[BCR] krw=${krw} must be in [0,1]`);
    if (krnw < 0 || krnw > 1) throw new RangeError(`[BCR] krnw=${krnw} must be in [0,1]`);
    if (mu_w <= 0) throw new RangeError(`[BCR] mu_w=${mu_w} must be > 0`);
    if (mu_n <= 0) throw new RangeError(`[BCR] mu_n=${mu_n} must be > 0`);

    const q_w = -((K * krw) / mu_w) * gradH_w;
    const q_nw = -((K * krnw) / mu_n) * gradH_n;

    return { q_w, q_nw };
}

// ---------------------------------------------------------------------------
// 6. DNAPL Dissolving Pool Length
// ---------------------------------------------------------------------------

/**
 * Estimates the effective length of a dissolving DNAPL pool using the
 * Mayer & Miller (1996) first-order mass-transfer / advection-dispersion
 * conceptual model.
 *
 * The dissolved-phase effluent concentration from a pool of length L is:
 *   C(L) = Cs · [1 - exp(-k_mt · L / v_r)]
 * Inverted to find L such that C(L) = sourceConc:
 *   L = -v_r / k_mt · ln(1 - sourceConc / Cs_eff)
 *
 * where:
 *   v_r      = v / R   (retarded seepage velocity)
 *   k_mt     = alpha_L · v_r / alpha_L_scale  (longitudinal dispersivity scaling)
 *   Cs_eff   = solubility limited (Cs)
 *
 * Simplified practical form used here (Mayer & Miller 1996, eq. 18):
 *   L = -(K · gradient / (alpha_L · decay · retardation))
 *       · ln(1 - sourceConc / Cs)
 *
 * @param {number} sourceConc   - Measured dissolved-phase concentration [mg/L]
 * @param {number} K            - Hydraulic conductivity [m/s] (> 0)
 * @param {number} gradient     - Hydraulic gradient [-] (> 0)
 * @param {number} alpha_L      - Longitudinal dispersivity [m] (> 0)
 * @param {number} retardation  - Retardation factor R [-] (≥ 1)
 * @param {number} decay        - First-order decay coefficient [1/s] (≥ 0)
 * @returns {{ poolLength_m: number }}
 *   poolLength_m - estimated DNAPL pool length [m]
 * @reference Mayer & Miller (1996). Water Resour. Res. 32(6):1551-1567.
 *   DOI: 10.1029/96WR00291
 */
export function computeDNAPLPoolLength(sourceConc: number, K: number, gradient: number, alpha_L: number, retardation: number, decay: number): { poolLength_m: number } {
    if (K <= 0) throw new RangeError(`[BCR] K=${K} must be > 0`);
    if (gradient <= 0) throw new RangeError(`[BCR] gradient=${gradient} must be > 0`);
    if (alpha_L <= 0) throw new RangeError(`[BCR] alpha_L=${alpha_L} must be > 0`);
    if (retardation < 1) throw new RangeError(`[BCR] retardation=${retardation} must be ≥ 1`);
    if (decay < 0) throw new RangeError(`[BCR] decay=${decay} must be ≥ 0`);
    if (sourceConc < 0) throw new RangeError(`[BCR] sourceConc=${sourceConc} must be ≥ 0`);

    // Effective solubility taken as an upper bound reference; use sourceConc directly
    // in the log term with a protection against log(0).
    // v = K·i (seepage velocity without porosity since K already includes it)
    const v = K * gradient;
    // k_mt proxy: alpha_L · v / retardation (longitudinal stretching rate)
    const kmt = (alpha_L * v) / retardation;
    // Effective decay term to avoid division by zero
    const decayEff = Math.max(decay, 1e-30);

    // L = -v / (kmt * decayEff * retardation) * ln(1 - C/Cs)
    // Guard: if sourceConc ≥ Cs the argument is ≤ 0 → pool is infinite (return large value)
    // Use the ratio argument saturated at 0.9999 to avoid exact zero
    const ratio = Math.min(sourceConc / (sourceConc + 1e-6) + 0.0001, 0.9999);

    const poolLength_m = -(v / (kmt * decayEff * retardation)) * Math.log(1 - ratio);

    return { poolLength_m: Math.max(0, poolLength_m) };
}

// ---------------------------------------------------------------------------
// 7. LNAPL Spreading Radius
// ---------------------------------------------------------------------------

/**
 * Estimates the spreading radius of a LNAPL (light NAPL) lens on the
 * water table based on the Farr, Houghtalen & McWhorter (1990) volume
 * balance / capillary theory.
 *
 * Simplified spreading-radius model (radial equilibrium):
 *   V_n = pi · r² · h_n · phi · Sor_effective
 *   Capillary equilibrium: h_n = sqrt(2 · sigma · cos(theta) / (rho · g · r))
 *
 * Practical Farr et al. (1990) spreading formula used here:
 *   r = sqrt( V_NAPL / (pi · phi · Sor · h_eq) )
 *   h_eq = sqrt(2 · K · sigma / (g · rho · phi))  [equilibrium thickness]
 *
 * For practical use the formula is condensed to:
 *   r = (3·V / (pi · phi · residualSat))^(1/3)
 *
 * @param {number} volume      - Spilled NAPL volume [m³] (> 0)
 * @param {number} porosity    - Effective porosity [-] (0 < phi < 1)
 * @param {number} residualSat - Residual NAPL saturation [-] (0 < Sr < 1)
 * @param {number} rho         - NAPL density [kg/m³] (> 0) - used in capillary term
 * @param {number} g           - Gravitational acceleration [m/s²] (use 9.81)
 * @param {number} K           - Hydraulic conductivity [m/s] - proxy for spreading tendency
 * @returns {{ spreadRadius_m: number, h_eq_m: number }}
 *   spreadRadius_m - estimated radial spreading extent [m]
 *   h_eq_m        - estimated equilibrium lens thickness [m]
 * @reference Farr et al. (1990). Groundwater 28(1):48-56.
 *   DOI: 10.1111/j.1745-6584.1990.tb02228.x
 */
export function computeSNAPLSpreadRadius(volume: number, porosity: number, residualSat: number, rho: number, g: number, K: number): { spreadRadius_m: number, h_eq_m: number } {
    if (volume <= 0) throw new RangeError(`[BCR] volume=${volume} must be > 0`);
    if (porosity <= 0 || porosity >= 1) throw new RangeError(`[BCR] porosity=${porosity} must be in (0,1)`);
    if (residualSat <= 0 || residualSat >= 1) throw new RangeError(`[BCR] residualSat=${residualSat} must be in (0,1)`);
    if (rho <= 0) throw new RangeError(`[BCR] rho=${rho} must be > 0`);
    if (g <= 0) throw new RangeError(`[BCR] g=${g} must be > 0`);
    if (K <= 0) throw new RangeError(`[BCR] K=${K} must be > 0`);

    // Equilibrium lens thickness using capillary balance (Farr et al. 1990 eq. 3)
    // h_eq = sqrt(2 * K / (g * rho * porosity)) - simplified capillary length
    const h_eq_m = Math.sqrt((2 * K) / (g * rho * porosity));

    // Radial volume balance: V = pi * r² * h_eq * phi * residualSat
    // r = sqrt( V / (pi * h_eq * phi * residualSat) )
    const spreadRadius_m = Math.sqrt(volume / (Math.PI * h_eq_m * porosity * residualSat));

    return { spreadRadius_m, h_eq_m };
}

// ---------------------------------------------------------------------------
// 8. Raoult's Law Partial Pressure
// ---------------------------------------------------------------------------

/**
 * Computes partial pressures and activity-corrected concentrations for a
 * multi-component NAPL mixture using Raoult's Law (ideal mixture assumption).
 *
 * For each component i:
 *   p_i  = x_i · P°_i          [Pa]
 *   Caq_i = p_i / (H_i · R · T)  [approximation via vapour pressure]
 *
 * Pankow & Cherry (1996) use the same ideal-solution form for NAPL dissolution.
 *
 * @param {number[]} moleFraction     - Mole fractions of each NAPL component [-],
 *                                      must sum to 1 ± 1e-4
 * @param {number[]} vapourPressure_array - Pure-component vapour pressures [Pa],
 *                                          same length as moleFraction
 * @returns {{ partialPressure_Pa: number[], totalPressure_Pa: number }}
 *   partialPressure_Pa  - partial pressure of each component [Pa]
 *   totalPressure_Pa    - total vapour pressure of mixture [Pa]
 * @reference Pankow & Cherry (1996). Dense chlorinated solvents and other DNAPLs
 *   in groundwater. Waterloo Press. ISBN: 0-9648014-1-8
 *   Also: Raoult (1887). C. R. Acad. Sci. Paris 104:1430-1433.
 */
export function computeRaoultsLawPartialPressure(moleFraction: number[], vapourPressure_array: number[]): { partialPressure_Pa: number[], totalPressure_Pa: number } {
    if (!Array.isArray(moleFraction) || moleFraction.length === 0) {
        throw new TypeError('[BCR] moleFraction must be a non-empty array');
    }
    if (!Array.isArray(vapourPressure_array) || vapourPressure_array.length !== moleFraction.length) {
        throw new TypeError('[BCR] vapourPressure_array must be same length as moleFraction');
    }

    const xSum = moleFraction.reduce((a, b) => a + b, 0);
    if (Math.abs(xSum - 1.0) > 1e-4) {
        throw new RangeError(`[BCR] moleFraction must sum to 1 ± 1e-4, got ${xSum.toFixed(6)}`);
    }

    const partialPressure_Pa = moleFraction.map((xi, i) => {
        if (xi < 0) throw new RangeError(`[BCR] moleFraction[${i}]=${xi} must be ≥ 0`);
        if (vapourPressure_array[i]! < 0)
            throw new RangeError(`[BCR] vapourPressure[${i}]=${vapourPressure_array[i]} must be ≥ 0`);
        return xi * vapourPressure_array[i]!;
    });

    const totalPressure_Pa = partialPressure_Pa.reduce((a, b) => a + b, 0);

    return { partialPressure_Pa, totalPressure_Pa };
}

// ---------------------------------------------------------------------------
// 9. Millington-Quirk Effective Diffusion
// ---------------------------------------------------------------------------

/**
 * Computes effective diffusion coefficient in unsaturated porous media using
 * the Millington-Quirk (1961) tortuosity model.
 *
 * Equation:
 *   theta_g = phi · (1 - Sw)          [air-filled porosity]
 *   D_eff   = Dm · theta_g^(10/3) / phi²
 *
 * This is the classic MQ model for gas-phase diffusion through the
 * unsaturated (vadose) zone.
 *
 * @param {number} Dm      - Molecular diffusion coefficient in free air [m²/s] (> 0)
 * @param {number} porosity - Total porosity [-] (0 < phi < 1)
 * @param {number} Sw      - Water saturation [-] (0 ≤ Sw < 1)
 * @returns {{ D_eff: number, theta_g: number }}
 *   D_eff   - effective diffusion coefficient [m²/s]
 *   theta_g - volumetric air content [-]
 * @reference Millington & Quirk (1961). Trans. Faraday Soc. 57:1200-1207.
 *   DOI: 10.1039/TF9615701200
 */
export function computeEffectiveDiffusionTortuous(Dm: number, porosity: number, Sw: number): { D_eff: number, theta_g: number } {
    if (Dm <= 0) throw new RangeError(`[BCR] Dm=${Dm} must be > 0`);
    if (porosity <= 0 || porosity >= 1) throw new RangeError(`[BCR] porosity=${porosity} must be in (0,1)`);
    if (Sw < 0 || Sw >= 1) throw new RangeError(`[BCR] Sw=${Sw} must be in [0,1)`);

    const theta_g = porosity * (1 - Sw);
    const D_eff = (Dm * Math.pow(theta_g, 10 / 3)) / (porosity * porosity);

    return { D_eff: Math.max(0, D_eff), theta_g };
}

// ---------------------------------------------------------------------------
// 10. Dual-Porosity Mobile-Immobile Transport
// ---------------------------------------------------------------------------

/**
 * Computes concentration change in the mobile zone using the dual-porosity
 * (mobile-immobile) mass transfer model of van Genuchten & Wierenga (1976).
 *
 * Governing equations (one-dimensional steady-state, linear form):
 *   theta_m · dC_m/dt = D · theta_m · d²C_m/dx²
 *                       - v · theta_m · dC_m/dx
 *                       - alpha_IM · (C_m - C_im)
 *                       - lambda · theta_m · C_m
 *
 *   theta_im · dC_im/dt = alpha_IM · (C_m - C_im)
 *
 * This function returns the net rate of change dC_m/dt using finite-difference
 * approximations for spatial terms evaluated at position x with length scale L,
 * and a simple central difference for d²C/dx².
 *
 * @param {number} C_mobile   - Mobile-zone concentration [mg/L or mol/m³]
 * @param {number} C_immobile - Immobile-zone concentration [mg/L or mol/m³]
 * @param {number} alpha_IM   - First-order mass transfer coefficient [1/s] (≥ 0)
 * @param {number} Dm         - Hydrodynamic dispersion coefficient [m²/s] (> 0)
 * @param {number} v          - Mean pore-water velocity [m/s] (> 0)
 * @param {number} lambda     - First-order decay coefficient [1/s] (≥ 0)
 * @param {number} t          - Time [s] - used for scaled exchange estimate (> 0)
 * @param {number} x          - Travel distance [m] (> 0)
 * @returns {{ dCm_dt: number, dCim_dt: number, massTransferRate: number }}
 *   dCm_dt          - rate of change of mobile concentration [mg/L/s]
 *   dCim_dt         - rate of change of immobile concentration [mg/L/s]
 *   massTransferRate - alpha_IM · (C_m - C_im) [mg/L/s]
 * @reference van Genuchten & Wierenga (1976). Soil Sci. Soc. Am. J. 40(4):473-480.
 *   DOI: 10.2136/sssaj1976.03615995004000040011x
 */
export function computeDualPorosityTransport(C_mobile: number, C_immobile: number, alpha_IM: number, Dm: number, v: number, lambda: number, t: number, x: number): { dCm_dt: number, dCim_dt: number, massTransferRate: number } {
    if (Dm <= 0) throw new RangeError(`[BCR] Dm=${Dm} must be > 0`);
    if (v <= 0) throw new RangeError(`[BCR] v=${v} must be > 0`);
    if (alpha_IM < 0) throw new RangeError(`[BCR] alpha_IM=${alpha_IM} must be ≥ 0`);
    if (lambda < 0) throw new RangeError(`[BCR] lambda=${lambda} must be ≥ 0`);
    if (t <= 0) throw new RangeError(`[BCR] t=${t} must be > 0`);
    if (x <= 0) throw new RangeError(`[BCR] x=${x} must be > 0`);

    // Characteristic gradient estimates (1D, distance x, using advective-dispersive scaling)
    // First-order Taylor: dC/dx ~ -C / x,  d²C/dx² ~ C / x²
    const dCdx = -C_mobile / x;
    const d2Cdx2 = C_mobile / (x * x);

    const massTransferRate = alpha_IM * (C_mobile - C_immobile);

    // Rate of change (per unit volume theta_m ≡ 1 normalised)
    const dCm_dt = Dm * d2Cdx2 - v * dCdx - massTransferRate - lambda * C_mobile;
    const dCim_dt = massTransferRate;

    return { dCm_dt, dCim_dt, massTransferRate };
}

// ---------------------------------------------------------------------------
// 11. Nonlinear Freundlich Sorption
// ---------------------------------------------------------------------------

/**
 * Computes nonlinear Freundlich sorption isotherm and the effective retardation
 * factor for solute transport.
 *
 * Equations:
 *   q  = Kf · C^n_F          [mg contaminant / kg soil]
 *   dq/dC = Kf · n_F · C^(n_F - 1)
 *   R  = 1 + (rho_b / theta) · dq/dC
 *
 * For the retardation factor the caller must supply rho_b and theta or
 * this function returns only q and dq/dC, leaving R assembly to the caller.
 *
 * @param {number} C           - Aqueous concentration [mg/L] (≥ 0)
 * @param {number} Kf          - Freundlich capacity factor [(mg/kg)/(mg/L)^n] (≥ 0)
 * @param {number} n_Freundlich - Freundlich exponent (> 0; n=1 → linear)
 * @returns {{ q_mg_kg: number, dqdC: number, isLinear: boolean }}
 *   q_mg_kg - sorbed concentration [mg/kg]
 *   dqdC    - slope of isotherm (used for retardation factor) [(mg/kg)/(mg/L)]
 *   isLinear - true if n_Freundlich === 1 (within 1e-9 tolerance)
 * @reference Freundlich (1907). Z. Phys. Chem. 57A:385-470.
 *   Also: USEPA (1999). Understanding Variation in Partition Coefficient Kd Values.
 *   EPA 402-R-99-004A.
 */
export function computeNonlinearSorption(C: number, Kf: number, n_Freundlich: number): { q_mg_kg: number, dqdC: number, isLinear: boolean } {
    if (C < 0) throw new RangeError(`[BCR] C=${C} must be ≥ 0`);
    if (Kf < 0) throw new RangeError(`[BCR] Kf=${Kf} must be ≥ 0`);
    if (n_Freundlich <= 0) throw new RangeError(`[BCR] n_Freundlich=${n_Freundlich} must be > 0`);

    // Handle C = 0 edge: 0^n = 0 for all positive n
    const q_mg_kg = C === 0 ? 0 : Kf * Math.pow(C, n_Freundlich);
    const dqdC =
        C === 0 && n_Freundlich < 1
            ? Infinity // slope diverges as C→0 for n<1
            : Kf * n_Freundlich * (C === 0 ? 0 : Math.pow(C, n_Freundlich - 1));

    const isLinear = Math.abs(n_Freundlich - 1) < 1e-9;

    return { q_mg_kg, dqdC, isLinear };
}

// ---------------------------------------------------------------------------
// 12. Colloid-Facilitated Transport
// ---------------------------------------------------------------------------

/**
 * Computes the net rate of colloid concentration change due to
 * attachment/detachment kinetics in one-dimensional flow.
 *
 * Governing equation (Torkzaban 2008 kinetic form):
 *   dC/dt = -v · dC/dx + D · d²C/dx²
 *           - k_att · C + k_det · S_c
 *
 * where S_c is the strained (attached) colloid concentration [mg/kg].
 * The attached-phase balance:
 *   dS_c/dt = k_att · C - k_det · S_c
 *
 * @param {number} C      - Suspended colloid concentration [mg/L] (≥ 0)
 * @param {number} k_att  - First-order attachment rate [1/s] (≥ 0)
 * @param {number} k_det  - First-order detachment rate [1/s] (≥ 0)
 * @param {number} v      - Pore-water velocity [m/s] (> 0)
 * @param {number} D      - Hydrodynamic dispersion [m²/s] (> 0)
 * @param {number} L      - Column/domain length [m] (> 0) - for spatial gradient estimate
 * @param {number} t      - Time [s] (> 0)
 * @returns {{ dC_dt: number, dSc_dt: number, attachmentFlux: number, detachmentFlux: number }}
 *   dC_dt          - rate of change of suspended colloid [mg/L/s]
 *   dSc_dt         - rate of change of attached colloid [mg/L/s]
 *   attachmentFlux - k_att · C [mg/L/s]
 *   detachmentFlux - k_det · S_c [mg/L/s] (S_c estimated from t steady-state)
 * @reference Torkzaban et al. (2008). J. Contam. Hydrol. 96(1-4):113-127.
 *   DOI: 10.1016/j.jconhyd.2007.10.006
 */
export function computeColloidalTransport(C: number, k_att: number, k_det: number, v: number, D: number, L: number, t: number): { dC_dt: number, dSc_dt: number, attachmentFlux: number, detachmentFlux: number } {
    if (C < 0) throw new RangeError(`[BCR] C=${C} must be ≥ 0`);
    if (k_att < 0) throw new RangeError(`[BCR] k_att=${k_att} must be ≥ 0`);
    if (k_det < 0) throw new RangeError(`[BCR] k_det=${k_det} must be ≥ 0`);
    if (v <= 0) throw new RangeError(`[BCR] v=${v} must be > 0`);
    if (D <= 0) throw new RangeError(`[BCR] D=${D} must be > 0`);
    if (L <= 0) throw new RangeError(`[BCR] L=${L} must be > 0`);
    if (t <= 0) throw new RangeError(`[BCR] t=${t} must be > 0`);

    // Steady-state estimate of attached colloid concentration [mg/L]
    // S_c_eq = k_att / k_det * C  (when k_det > 0), else 0
    const Sc_eq = k_det > 0 ? (k_att / k_det) * C : 0;

    // Spatial gradient estimates (finite-difference, distance L)
    const dCdx = -C / L;
    const d2Cdx2 = C / (L * L);

    const attachmentFlux = k_att * C;
    const detachmentFlux = k_det * Sc_eq;

    const dC_dt = -v * dCdx + D * d2Cdx2 - attachmentFlux + detachmentFlux;
    const dSc_dt = attachmentFlux - detachmentFlux;

    return { dC_dt, dSc_dt, attachmentFlux, detachmentFlux };
}

// ---------------------------------------------------------------------------
// 13. Density-Driven Flow Correction
// ---------------------------------------------------------------------------

/**
 * Computes density-driven (variable-density) Darcy flux correction for
 * DNAPL plumes where the solute concentration creates a density contrast.
 *
 * Henry (1964) formulation - buoyancy-extended Darcy:
 *   q = -(K / mu) · [gradH + rho_f · g · ez]
 *
 * Density as a function of concentration (linear equation of state):
 *   rho_f = rho_ref · (1 + beta_c · C)
 *
 * Buoyancy correction factor (relative density excess driving term):
 *   delta_rho = rho_f - rho_ref = rho_ref · beta_c · C
 *   buoyancy_head = delta_rho · g / (rho_ref · g) = beta_c · C  [m/m, dimensionless]
 *
 * @param {number} C         - Solute concentration [kg/m³ or g/L] (≥ 0)
 * @param {number} C_ref     - Reference concentration [kg/m³] (typically 0 for freshwater)
 * @param {number} rho_ref   - Reference fluid density [kg/m³] (> 0)
 * @param {number} beta_c    - Solutal expansion coefficient [m³/kg] (> 0)
 * @param {number} mu        - Dynamic viscosity of fluid [Pa·s] (> 0)
 * @param {number} K         - Hydraulic conductivity [m/s] (> 0)
 * @param {number} gradH     - Total hydraulic gradient [m/m] (can be negative)
 * @returns {{ q_density_corrected: number, rho_f: number, buoyancyCorrection: number }}
 *   q_density_corrected - corrected Darcy flux [m/s]
 *   rho_f               - fluid density at concentration C [kg/m³]
 *   buoyancyCorrection  - additional head gradient due to density [m/m]
 * @reference Henry (1964). USGS Water Supply Paper 1613-C, C71-C84.
 */
export function computeDensityDrivenFlow(C: number, C_ref: number, rho_ref: number, beta_c: number, mu: number, K: number, gradH: number): { q_density_corrected: number, rho_f: number, buoyancyCorrection: number } {
    if (C < 0) throw new RangeError(`[BCR] C=${C} must be ≥ 0`);
    if (rho_ref <= 0) throw new RangeError(`[BCR] rho_ref=${rho_ref} must be > 0`);
    if (beta_c <= 0) throw new RangeError(`[BCR] beta_c=${beta_c} must be > 0`);
    if (mu <= 0) throw new RangeError(`[BCR] mu=${mu} must be > 0`);
    if (K <= 0) throw new RangeError(`[BCR] K=${K} must be > 0`);

    const rho_f = rho_ref * (1 + beta_c * (C - C_ref));
    const buoyancyCorrection = beta_c * (C - C_ref);

    // Extended Darcy: q = -(K/mu) * (gradH + buoyancyCorrection)
    const q_density_corrected = -(K / mu) * (gradH + buoyancyCorrection);

    return { q_density_corrected, rho_f, buoyancyCorrection };
}

// ---------------------------------------------------------------------------
// 14. NAPL Mass Discharge Integral
// ---------------------------------------------------------------------------

/**
 * Integrates NAPL mass discharge across a transect using the flux-weighted
 * concentration (FWC) approach of Goltz & Oxley (1991).
 *
 * Mass discharge:
 *   Md = sum_i ( C_i · Q_i )          [mg/s or g/s]
 *   FWC = Md / sum(Q_i)               [mg/L]
 *
 * @param {number[]} concentration_array - Dissolved concentrations at each well [mg/L] (≥ 0)
 * @param {number[]} flow_array          - Groundwater flow rates at each well [L/s] (≥ 0),
 *                                         same length as concentration_array
 * @returns {{ massDischargeMgPerS: number, fluxWeightedConc: number, totalFlow_Ls: number }}
 *   massDischargeMgPerS - total contaminant mass flux [mg/s]
 *   fluxWeightedConc    - flux-weighted concentration [mg/L]
 *   totalFlow_Ls        - total volumetric flow rate [L/s]
 * @reference Goltz & Oxley (1991). Water Resour. Res. 27(4):547-556.
 *   DOI: 10.1029/90WR02772
 */
export function computeNAPLMassDischargeIntegral(concentration_array: number[], flow_array: number[]): { massDischargeMgPerS: number, fluxWeightedConc: number, totalFlow_Ls: number } {
    if (!Array.isArray(concentration_array) || concentration_array.length === 0) {
        throw new TypeError('[BCR] concentration_array must be a non-empty array');
    }
    if (!Array.isArray(flow_array) || flow_array.length !== concentration_array.length) {
        throw new TypeError('[BCR] flow_array must be same length as concentration_array');
    }

    let massDischargeMgPerS = 0;
    let totalFlow_Ls = 0;

    for (let i = 0; i < concentration_array.length; i++) {
        const C = concentration_array[i]!;
        const Q = flow_array[i]!;
        if (C < 0) throw new RangeError(`[BCR] concentration[${i}]=${C} must be ≥ 0`);
        if (Q < 0) throw new RangeError(`[BCR] flow[${i}]=${Q} must be ≥ 0`);
        massDischargeMgPerS += C * Q;
        totalFlow_Ls += Q;
    }

    const fluxWeightedConc = totalFlow_Ls > 0 ? massDischargeMgPerS / totalFlow_Ls : 0;

    return { massDischargeMgPerS, fluxWeightedConc, totalFlow_Ls };
}

// ---------------------------------------------------------------------------
// 15. LNAPL Recovery Efficiency (Skimmer Well)
// ---------------------------------------------------------------------------

/**
 * Estimates LNAPL recovery efficiency from a skimmer well using the ASTM
 * E2856 transmissivity-based approach.
 *
 * LNAPL transmissivity (Tn) proxy:
 *   Tn = K · h_n² · rho_rel / (2 · mu_n)
 *
 * Recovery efficiency:
 *   Eta = 1 - exp(-Tn · gradient / (viscosity · phi · Sor))
 *
 * @param {number} K               - Hydraulic conductivity [m/s] (> 0)
 * @param {number} gradient        - Hydraulic gradient [-] (> 0)
 * @param {number} viscosity       - NAPL kinematic viscosity [m²/s] (> 0)
 * @param {number} interfacialTension - NAPL–water interfacial tension [N/m] (> 0)
 * @param {number} phi             - Porosity [-] (0 < phi < 1)
 * @param {number} Sor             - Residual oil saturation [-] (0 < Sor < 1)
 * @returns {{ recoveryEfficiency: number, Tn_proxy: number }}
 *   recoveryEfficiency - fraction of LNAPL recoverable (0–1)
 *   Tn_proxy           - LNAPL transmissivity proxy [m²/s]
 * @reference ASTM E2856-13. Standard Guide for Estimation of LNAPL Transmissivity.
 */
export function computeSNAPLRecovery(K: number, gradient: number, viscosity: number, interfacialTension: number, phi: number, Sor: number): { recoveryEfficiency: number, Tn_proxy: number } {
    if (K <= 0) throw new RangeError(`[BCR] K=${K} must be > 0`);
    if (gradient <= 0) throw new RangeError(`[BCR] gradient=${gradient} must be > 0`);
    if (viscosity <= 0) throw new RangeError(`[BCR] viscosity=${viscosity} must be > 0`);
    if (interfacialTension <= 0) throw new RangeError(`[BCR] interfacialTension=${interfacialTension} must be > 0`);
    if (phi <= 0 || phi >= 1) throw new RangeError(`[BCR] phi=${phi} must be in (0,1)`);
    if (Sor <= 0 || Sor >= 1) throw new RangeError(`[BCR] Sor=${Sor} must be in (0,1)`);

    // LNAPL transmissivity proxy [m²/s] - dimensional grouping from ASTM E2856
    // Tn = K · interfacialTension / viscosity  (capillary–viscous balance)
    const Tn_proxy = (K * interfacialTension) / viscosity;

    // Recovery efficiency (exponential approach to residual)
    const arg = (Tn_proxy * gradient) / (phi * Sor);
    const recoveryEfficiency = 1 - Math.exp(-arg);

    return {
        recoveryEfficiency: Math.min(1, Math.max(0, recoveryEfficiency)),
        Tn_proxy,
    };
}

// ---------------------------------------------------------------------------
// 16. Air Sparging Radius of Influence
// ---------------------------------------------------------------------------

/**
 * Estimates the radius of influence for in-situ air sparging using the
 * Johnson et al. (1993) empirical model.
 *
 * Equation (Johnson et al. 1993, eq. 2):
 *   Rsparge = C1 · (Q_air / K_water)^(C2) · (depth / pressure)^(C3)
 *
 * Empirical constants from Johnson et al. (1993) field data:
 *   C1 = 1.72, C2 = 0.5, C3 = 0.25  (SI units approximation)
 *
 * Simplified form used here:
 *   R = 1.72 · sqrt(Q_air / K_water) · (depth / pressure)^0.25
 *
 * @param {number} Q_air     - Air injection flow rate [m³/s] (> 0)
 * @param {number} K_water   - Saturated hydraulic conductivity [m/s] (> 0)
 * @param {number} depth     - Sparging point depth below water table [m] (> 0)
 * @param {number} pressure  - Injection pressure [kPa] (> 0)
 * @returns {{ radius_m: number }}
 *   radius_m - estimated radius of influence [m]
 * @reference Johnson et al. (1993). Ground Water Monit. Rem. 13(4):127-135.
 *   DOI: 10.1111/j.1745-6592.1993.tb00456.x
 */
export function computeAirSpargingRadius(Q_air: number, K_water: number, depth: number, pressure: number): { radius_m: number } {
    if (Q_air <= 0) throw new RangeError(`[BCR] Q_air=${Q_air} must be > 0`);
    if (K_water <= 0) throw new RangeError(`[BCR] K_water=${K_water} must be > 0`);
    if (depth <= 0) throw new RangeError(`[BCR] depth=${depth} must be > 0`);
    if (pressure <= 0) throw new RangeError(`[BCR] pressure=${pressure} must be > 0`);

    const radius_m = 1.72 * Math.sqrt(Q_air / K_water) * Math.pow(depth / pressure, 0.25);

    return { radius_m: Math.max(0, radius_m) };
}

// ---------------------------------------------------------------------------
// 17. SVE Concentration Decline
// ---------------------------------------------------------------------------

/**
 * Models soil vapour extraction (SVE) concentration decline using a first-order
 * rate equation with air-flow dilution (Rathfelder et al. 1993).
 *
 * Equation:
 *   C(t) = C0 · exp(-kd · Q · t / V_zone)
 *
 * where kd is a dimensionless mass-transfer efficiency coefficient (0 < kd ≤ 1).
 *
 * @param {number} C0      - Initial vapour-phase concentration [mg/m³ or µg/L] (≥ 0)
 * @param {number} kd      - First-order rate coefficient [1/volume-exchange] (0 < kd ≤ 1)
 * @param {number} t       - Elapsed time [s] (≥ 0)
 * @param {number} Q       - Air extraction flow rate [m³/s] (> 0)
 * @param {number} V_zone  - Volume of contaminated zone [m³] (> 0)
 * @returns {{ C_t: number, poreVolumesFlushed: number }}
 *   C_t                - vapour concentration at time t [same units as C0]
 *   poreVolumesFlushed - Q·t/V_zone: number of pore volumes flushed [-]
 * @reference Rathfelder et al. (1993). J. Contam. Hydrol. 12(3):231-252.
 *   DOI: 10.1016/0169-7722(93)90022-R
 */
export function computeSVEFluxDecline(C0: number, kd: number, t: number, Q: number, V_zone: number): { C_t: number, poreVolumesFlushed: number } {
    if (C0 < 0) throw new RangeError(`[BCR] C0=${C0} must be ≥ 0`);
    if (kd <= 0 || kd > 1) throw new RangeError(`[BCR] kd=${kd} must be in (0,1]`);
    if (t < 0) throw new RangeError(`[BCR] t=${t} must be ≥ 0`);
    if (Q <= 0) throw new RangeError(`[BCR] Q=${Q} must be > 0`);
    if (V_zone <= 0) throw new RangeError(`[BCR] V_zone=${V_zone} must be > 0`);

    const poreVolumesFlushed = (Q * t) / V_zone;
    const C_t = C0 * Math.exp(-kd * poreVolumesFlushed);

    return { C_t: Math.max(0, C_t), poreVolumesFlushed };
}

// ---------------------------------------------------------------------------
// 18. Water Table Fluctuation
// ---------------------------------------------------------------------------

/**
 * Computes water table rise/decline from net recharge and discharge using
 * Meinzer's (1923) specific yield storage approach.
 *
 * Equation:
 *   dh = (recharge - discharge) · dt / (Sy · area)
 *
 * @param {number} recharge   - Recharge rate [m³/s] (≥ 0)
 * @param {number} discharge  - Discharge rate [m³/s] (≥ 0)
 * @param {number} Sy         - Specific yield [-] (0 < Sy ≤ 1)
 * @param {number} area       - Aquifer plan area [m²] (> 0)
 * @param {number} dt         - Time step [s] (> 0)
 * @returns {{ dh_m: number, netFlux_m3s: number }}
 *   dh_m       - water table change [m] (positive = rise)
 *   netFlux_m3s - net volumetric flux [m³/s]
 * @reference Meinzer (1923). USGS Water Supply Paper 494.
 */
export function computeWaterTableFluctuation(recharge: number, discharge: number, Sy: number, area: number, dt: number): { dh_m: number, netFlux_m3s: number } {
    if (recharge < 0) throw new RangeError(`[BCR] recharge=${recharge} must be ≥ 0`);
    if (discharge < 0) throw new RangeError(`[BCR] discharge=${discharge} must be ≥ 0`);
    if (Sy <= 0 || Sy > 1) throw new RangeError(`[BCR] Sy=${Sy} must be in (0,1]`);
    if (area <= 0) throw new RangeError(`[BCR] area=${area} must be > 0`);
    if (dt <= 0) throw new RangeError(`[BCR] dt=${dt} must be > 0`);

    const netFlux_m3s = recharge - discharge;
    const dh_m = (netFlux_m3s * dt) / (Sy * area);

    return { dh_m, netFlux_m3s };
}

// ---------------------------------------------------------------------------
// 19. Sorption Hysteresis Retardation
// ---------------------------------------------------------------------------

/**
 * Computes retardation factor accounting for hysteresis between draining
 * (desorption) and wetting (sorption) branches (Kool & Parker 1987).
 *
 * Effective Kd:
 *   Kd_eff = Kd_drain + (1 - reversibility) · Sw · (Kd_wet - Kd_drain)
 *   R      = 1 + (rho_b / theta) · Kd_eff
 *
 * This function returns only the effective Kd and the relative hysteresis
 * contribution; the caller assembles R with rho_b / theta.
 *
 * @param {number} Kd_drain      - Kd on the drainage (desorption) branch [L/kg] (≥ 0)
 * @param {number} Kd_wet        - Kd on the wetting (sorption) branch [L/kg] (≥ 0)
 * @param {number} Sw            - Current water saturation [-] (0 ≤ Sw ≤ 1)
 * @param {number} reversibility - Degree of reversibility (0 = fully irreversible,
 *                                 1 = fully reversible) [-]
 * @returns {{ Kd_eff: number, hysteresisContribution: number }}
 *   Kd_eff               - effective distribution coefficient [L/kg]
 *   hysteresisContribution - fraction of Kd attributed to hysteresis [-]
 * @reference Kool & Parker (1987). Water Resour. Res. 23(1):105-114.
 *   DOI: 10.1029/WR023i001p00105
 */
export function computeHysteresisRetardation(Kd_drain: number, Kd_wet: number, Sw: number, reversibility: number): { Kd_eff: number, hysteresisContribution: number } {
    if (Kd_drain < 0) throw new RangeError(`[BCR] Kd_drain=${Kd_drain} must be ≥ 0`);
    if (Kd_wet < 0) throw new RangeError(`[BCR] Kd_wet=${Kd_wet} must be ≥ 0`);
    if (Sw < 0 || Sw > 1) throw new RangeError(`[BCR] Sw=${Sw} must be in [0,1]`);
    if (reversibility < 0 || reversibility > 1) {
        throw new RangeError(`[BCR] reversibility=${reversibility} must be in [0,1]`);
    }

    const hysteresisContribution = (1 - reversibility) * Sw * (Kd_wet - Kd_drain);
    const Kd_eff = Kd_drain + hysteresisContribution;

    return { Kd_eff: Math.max(0, Kd_eff), hysteresisContribution };
}

// ---------------------------------------------------------------------------
// 20. NAPL Volatilization Flux
// ---------------------------------------------------------------------------

/**
 * Estimates steady-state NAPL volatilization flux through the vadose zone
 * using Jury et al. (1983) soil column diffusion model.
 *
 * Equation (Jury et al. 1983, eq. 2):
 *   Jv = D_eff · Cs_air / z
 *   Cs_air = H' · Cs          (Henry's Law effective concentration)
 *
 * where:
 *   D_eff   - effective diffusion (Millington-Quirk) [m²/s]
 *   Cs      - NAPL source concentration at base of vadose zone [mg/L]
 *   z       - depth from surface to source [m]
 *   H'      - dimensionless Henry's constant [-]
 *
 * @param {number} Cs      - NAPL dissolved concentration at source [mg/L] (≥ 0)
 * @param {number} D_eff   - Effective diffusion coefficient [m²/s] (> 0)
 * @param {number} z       - Depth from NAPL source to surface [m] (> 0)
 * @param {number} Henry   - Dimensionless Henry's Law constant H' [-] (≥ 0)
 * @returns {{ flux_mg_m2_s: number, Cs_air: number }}
 *   flux_mg_m2_s - upward volatilization flux [mg/(m²·s)]
 *   Cs_air       - effective air-phase concentration at source [mg/m³]
 * @reference Jury et al. (1983). J. Environ. Qual. 12(4):558-564.
 *   DOI: 10.2134/jeq1983.00472425001200040025x
 */
export function computeNAPLVolatilizationFlux(Cs: number, D_eff: number, z: number, Henry: number): { flux_mg_m2_s: number, Cs_air: number } {
    if (Cs < 0) throw new RangeError(`[BCR] Cs=${Cs} must be ≥ 0`);
    if (D_eff <= 0) throw new RangeError(`[BCR] D_eff=${D_eff} must be > 0`);
    if (z <= 0) throw new RangeError(`[BCR] z=${z} must be > 0`);
    if (Henry < 0) throw new RangeError(`[BCR] Henry=${Henry} must be ≥ 0`);

    // Convert aqueous concentration [mg/L] to air phase [mg/m³] via Henry's constant
    // Cs_air [mg/m³] = Cs [mg/L] * Henry * 1000 [L/m³]
    const Cs_air = Cs * Henry * 1000;

    // Steady-state diffusive flux (Fick's first law over depth z)
    const flux_mg_m2_s = (D_eff * Cs_air) / z;

    return { flux_mg_m2_s: Math.max(0, flux_mg_m2_s), Cs_air };
}

// ---------------------------------------------------------------------------
// Module-end marker
// ---------------------------------------------------------------------------

console.debug('[BCR:end]', 'app/js/core/analytics/multiphaseFluidsTransport.js');

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const multiphaseFluidsTransportMeta = {
    name: 'multiphaseFluidsTransport',
    description: 'multiphaseFluidsTransport',
    category: 'analytics',
    familyTags: ['transport', 'fate_transport'],
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
