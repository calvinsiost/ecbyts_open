// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Soil Gas Transport Solver
 *
 * Implements pure-math gas transport through unsaturated soil:
 *  - Millington-Quirk (1961) effective tortuosity and diffusivity
 *  - Henry's Law gas-liquid partitioning
 *  - Steady-state Fickian diffusion flux
 *  - Johnson & Ettinger (1991) vapor intrusion model + attenuation factor
 *  - Equilibrium vapor concentration from total soil concentration (USEPA 2002)
 *  - Temperature/pressure correction for soil vapor samples (ideal gas)
 *  - Knudsen diffusion in small pores (Knudsen 1909)
 *  - Building pressurization ACH estimate (Sherman & Grimsrud 1980)
 *
 * Academic references:
 *  - Millington & Quirk (1961) Trans. Faraday Soc. 57:1200–1207
 *    DOI:10.1039/TF9615701200
 *  - Sander (2015) Atm. Chem. Phys. 15:4399–4981. DOI:10.5194/acp-15-4399-2015
 *  - Fick (1855) Ann. Phys. 170(1):59–86
 *  - Johnson & Ettinger (1991) Environ. Sci. Technol. 25(8):1445–1452
 *    DOI:10.1021/es00020a013
 *  - USEPA (2002) Soil Screening Guidance. EPA/540/R-02/028
 *  - Knudsen (1909) Ann. Phys. 333(1):75–130. DOI:10.1002/andp.19093330106
 *  - Sherman & Grimsrud (1980) LBL-10023 Lawrence Berkeley Lab.
 */

// ---------------------------------------------------------------------------
// Physical constants
// ---------------------------------------------------------------------------

/** Universal gas constant (J/mol·K) */
const R_J_MOL_K = 8.314;

/** Pi */
const PI = Math.PI;

/** Gravitational acceleration (m/s²) */
// eslint-disable-next-line
const G_M_S2 = 9.81;

/** Air density at standard conditions (kg/m³) */
const RHO_AIR_KG_M3 = 1.2;

// ---------------------------------------------------------------------------
// 1. Millington-Quirk Tortuosity
// ---------------------------------------------------------------------------

/**
 * Compute Millington-Quirk effective tortuosity factor for gas-phase diffusion.
 *
 * tau = n_air^(10/3) / n_total^2
 *
 * Both porosities refer to volumetric fractions (dimensionless).
 * n_air = air-filled porosity = n_total − n_water.
 *
 * @param n_total - Total porosity (0 < n_total < 1)
 * @param n_air   - Air-filled porosity (0 ≤ n_air ≤ n_total)
 * @returns tau - effective tortuosity (dimensionless, 0–1)
 * @throws {RangeError} if inputs are out of valid range
 *
 * Reference: Millington & Quirk (1961) Trans. Faraday Soc. 57:1200–1207
 */
export function millingtonQuirkTortuosity(n_total: number, n_air: number): number {
    if (n_total <= 0 || n_total >= 1) {
        throw new RangeError(`n_total must be strictly between 0 and 1, got ${n_total}`);
    }
    if (n_air < 0 || n_air > n_total) {
        throw new RangeError(`n_air must be in [0, n_total], got ${n_air}`);
    }
    // tau = n_air^(10/3) / n_total^2
    const tau = Math.pow(n_air, 10 / 3) / Math.pow(n_total, 2);
    return tau;
}

// ---------------------------------------------------------------------------
// 2. Effective Gas Diffusivity
// ---------------------------------------------------------------------------

/**
 * Compute effective gas diffusivity in soil using Millington-Quirk tortuosity.
 *
 * D_eff = D_free × tau
 *
 * @param D_free_m2_per_s - Free-air molecular diffusion coefficient (m²/s)
 * @param n_total         - Total porosity (dimensionless)
 * @param n_air           - Air-filled porosity (dimensionless)
 * @returns {{D_eff_m2_per_s: number, tau: number}}
 * @throws {RangeError} if D_free ≤ 0 or porosity inputs invalid
 *
 * Reference: Millington & Quirk (1961)
 */
export function effectiveGasDiffusivity(
    D_free_m2_per_s: number,
    n_total: number,
    n_air: number,
): Readonly<{ D_eff_m2_per_s: number; tau: number }> {
    if (D_free_m2_per_s <= 0) {
        throw new RangeError(`D_free_m2_per_s must be > 0, got ${D_free_m2_per_s}`);
    }
    const tau = millingtonQuirkTortuosity(n_total, n_air);
    const D_eff_m2_per_s = D_free_m2_per_s * tau;
    return Object.freeze({ D_eff_m2_per_s, tau });
}

// ---------------------------------------------------------------------------
// 3. Henry's Law Gas-Liquid Partitioning
// ---------------------------------------------------------------------------

/**
 * Dimensionless Henry's law constants (H_cc = C_gas/C_liquid) at 25°C.
 * Source: Sander (2015) Atm. Chem. Phys. 15:4399–4981.
 */
export const HENRY_H_CC: Readonly<Record<string, number>> = Object.freeze({
    benzene: 0.228,
    toluene: 0.272,
    PCE: 0.722,
    TCE: 0.402,
    vinyl_chloride: 1.11,
    ethylbenzene: 0.323,
    xylene_ortho: 0.198,
    naphthalene: 0.018,
});

/**
 * Compute gas-phase concentration from aqueous concentration via Henry's law.
 *
 * C_gas = C_liquid × H_cc
 *
 * H_cc is the dimensionless Henry's constant (concentration basis: Cgas/Cliquid).
 *
 * @param C_liquid_mg_per_L - Dissolved aqueous concentration (mg/L)
 * @param H_cc              - Dimensionless Henry's constant (Cgas/Cliquid)
 * @returns {{C_gas_mg_per_L: number, H_cc: number}}
 * @throws {RangeError} if H_cc ≤ 0 or C_liquid < 0
 *
 * Reference: Sander (2015) Atm. Chem. Phys.
 */
export function henrysLawPartitioning(
    C_liquid_mg_per_L: number,
    H_cc: number,
): Readonly<{ C_gas_mg_per_L: number; H_cc: number }> {
    if (H_cc <= 0) throw new RangeError(`H_cc must be > 0, got ${H_cc}`);
    if (C_liquid_mg_per_L < 0) throw new RangeError(`C_liquid_mg_per_L must be >= 0, got ${C_liquid_mg_per_L}`);
    const C_gas_mg_per_L = C_liquid_mg_per_L * H_cc;
    return Object.freeze({ C_gas_mg_per_L, H_cc });
}

// ---------------------------------------------------------------------------
// 4. Fickian Diffusion Flux
// ---------------------------------------------------------------------------

/**
 * Compute steady-state Fickian diffusion flux through a soil layer.
 *
 * J = D_eff × (C_source − C_surface) / L
 *
 * Units: J in [concentration × D_eff / L]. If concentration in mg/m³
 * and D_eff in m²/s and L in m → flux in mg/m²/s.
 *
 * @param C_source  - Source concentration (mg/m³ or mg/L consistent units)
 * @param C_surface - Surface/ambient concentration (same units as C_source)
 * @param L_m       - Path length through soil (m)
 * @param D_eff     - Effective diffusion coefficient (m²/s)
 * @returns flux J (mg/m²/s)
 * @throws {RangeError} if L_m ≤ 0 or D_eff ≤ 0
 *
 * Reference: Fick (1855) Ann. Phys.
 */
export function soilGasDiffusionFlux(C_source: number, C_surface: number, L_m: number, D_eff: number): number {
    if (L_m <= 0) throw new RangeError(`L_m must be > 0, got ${L_m}`);
    if (D_eff <= 0) throw new RangeError(`D_eff must be > 0, got ${D_eff}`);
    return (D_eff * (C_source - C_surface)) / L_m;
}

// ---------------------------------------------------------------------------
// 5. Johnson & Ettinger Vapor Intrusion
// ---------------------------------------------------------------------------

/**
 * Simplified Johnson & Ettinger (1991) vapor intrusion indoor concentration.
 *
 * Cin = Csoil_mg_per_m3 × alpha × (Qsoil_L_per_hr / Qb_L_per_hr)
 *
 * where Qb = building ventilation rate (L/hr) = VR_L_per_hr.
 *
 * @param Csoil_mg_per_kg    - Total soil contaminant concentration (mg/kg)
 * @param alpha_attenuation  - Dimensionless attenuation factor (0–1)
 * @param VR_L_per_hr        - Building ventilation rate (L/hr)
 * @param Qsoil_L_per_hr     - Soil vapor entry rate (L/hr)
 * @returns Indoor concentration (μg/m³, same order as mg/m³ when Csoil in mg/kg)
 * @throws {RangeError} if any input ≤ 0 or alpha out of range
 *
 * Reference: Johnson & Ettinger (1991) Environ. Sci. Technol. 25(8):1445–1452
 */
export function jAndEVaporIntrusion(
    Csoil_mg_per_kg: number,
    alpha_attenuation: number,
    VR_L_per_hr: number,
    Qsoil_L_per_hr: number,
): number {
    if (Csoil_mg_per_kg < 0) throw new RangeError(`Csoil_mg_per_kg must be >= 0, got ${Csoil_mg_per_kg}`);
    if (alpha_attenuation < 0 || alpha_attenuation > 1) {
        throw new RangeError(`alpha_attenuation must be in [0,1], got ${alpha_attenuation}`);
    }
    if (VR_L_per_hr <= 0) throw new RangeError(`VR_L_per_hr must be > 0, got ${VR_L_per_hr}`);
    if (Qsoil_L_per_hr < 0) throw new RangeError(`Qsoil_L_per_hr must be >= 0, got ${Qsoil_L_per_hr}`);
    return Csoil_mg_per_kg * alpha_attenuation * (Qsoil_L_per_hr / VR_L_per_hr);
}

// ---------------------------------------------------------------------------
// 6. J&E Attenuation Factor
// ---------------------------------------------------------------------------

/**
 * Compute Johnson & Ettinger attenuation factor alpha.
 *
 * alpha = exp(−Qsoil × L_crack / (D_crack × A_floor_m2))
 *
 * This is the simplified exponential form capturing the fraction of soil-vapor
 * flux that reaches the indoor environment through foundation cracks.
 *
 * @param D_crack    - Effective diffusivity in foundation crack (m²/s)
 * @param L_crack    - Foundation slab thickness / crack length (m)
 * @param Q_soil     - Soil gas entry volumetric flow rate (m³/s)
 * @param A_floor    - Foundation floor area (m²)
 * @param _H_mixing?   - Indoor mixing height (m), reserved / unused in simplified form
 * @returns alpha - attenuation factor (0 ≤ alpha ≤ 1)
 * @throws {RangeError} if D_crack, L_crack, or A_floor ≤ 0
 *
 * Reference: Johnson & Ettinger (1991)
 */
export function attenuationFactor(
    D_crack: number,
    L_crack: number,
    Q_soil: number,
    A_floor: number,
    _H_mixing?: number,
): number {
    if (D_crack <= 0) throw new RangeError(`D_crack must be > 0, got ${D_crack}`);
    if (L_crack <= 0) throw new RangeError(`L_crack must be > 0, got ${L_crack}`);
    if (A_floor <= 0) throw new RangeError(`A_floor must be > 0, got ${A_floor}`);
    if (Q_soil < 0) throw new RangeError(`Q_soil must be >= 0, got ${Q_soil}`);
    // Se Qsoil = 0, não há advecção → alpha = 1 (apenas difusão, sem atenuação por fluxo)
    if (Q_soil === 0) return 1;
    const exponent = -(Q_soil * L_crack) / (D_crack * A_floor);
    return Math.exp(exponent);
}

// ---------------------------------------------------------------------------
// 7. Vapor Concentration from Total Soil Concentration
// ---------------------------------------------------------------------------

/**
 * Compute equilibrium gas-phase concentration from total soil concentration.
 *
 * Three-phase partitioning (vapor/water/sorbed):
 *   Ctotal = Cv × n_air + Cw × n_water + Cs × rho_b
 *   Cs = Koc × foc × Cw   (linear sorption)
 *   Cv = Cw × H_cc         (Henry's law)
 *
 * Solving for Cw:
 *   Cw = Ctotal / (rho_b × Koc × foc + n_water + n_air × H_cc)
 *
 * @param Ctotal_mg_per_kg - Total soil concentration (mg/kg dry weight)
 * @param rho_b            - Bulk dry density (kg/m³ or g/cm³ consistent with Ctotal)
 * @param n_total          - Total porosity (dimensionless)
 * @param n_air            - Air-filled porosity (dimensionless)
 * @param H_cc             - Dimensionless Henry's law constant
 * @param Koc              - Organic carbon partition coefficient (L/kg)
 * @param foc              - Fraction organic carbon (dimensionless, 0–1)
 * @returns {{Cv_mg_per_m3: number, Cw_mg_per_L: number, Cs_mg_per_kg: number}}
 * @throws {RangeError} on invalid inputs
 *
 * Reference: USEPA (2002) Soil Screening Guidance. EPA/540/R-02/028
 */
export function vaporConcentrationSoil(
    Ctotal_mg_per_kg: number,
    rho_b: number,
    n_total: number,
    n_air: number,
    H_cc: number,
    Koc: number,
    foc: number,
): Readonly<{ Cv_mg_per_m3: number; Cw_mg_per_L: number; Cs_mg_per_kg: number }> {
    if (Ctotal_mg_per_kg < 0) throw new RangeError(`Ctotal_mg_per_kg must be >= 0`);
    if (rho_b <= 0) throw new RangeError(`rho_b must be > 0, got ${rho_b}`);
    if (n_total <= 0 || n_total >= 1) throw new RangeError(`n_total must be in (0,1), got ${n_total}`);
    if (n_air < 0 || n_air > n_total) throw new RangeError(`n_air must be in [0, n_total], got ${n_air}`);
    if (H_cc <= 0) throw new RangeError(`H_cc must be > 0, got ${H_cc}`);
    if (Koc < 0) throw new RangeError(`Koc must be >= 0, got ${Koc}`);
    if (foc < 0 || foc > 1) throw new RangeError(`foc must be in [0,1], got ${foc}`);

    const n_water = n_total - n_air;
    // Denominador do balanço de fases
    const denominator = rho_b * Koc * foc + n_water + n_air * H_cc;
    const Cw_mg_per_L = Ctotal_mg_per_kg / denominator;
    const Cv_mg_per_m3 = Cw_mg_per_L * H_cc;
    const Cs_mg_per_kg = Koc * foc * Cw_mg_per_L;
    return Object.freeze({ Cv_mg_per_m3, Cw_mg_per_L, Cs_mg_per_kg });
}

// ---------------------------------------------------------------------------
// 8. Soil Vapor Survey Temperature/Pressure Correction
// ---------------------------------------------------------------------------

/**
 * Apply temperature and pressure correction to field soil vapor measurements.
 *
 * Using ideal gas law:
 *   C_corrected = C_measured × (T_ref / T) × (P / P_ref)
 *
 * Standard reference conditions: T_ref = 293.15 K (20°C), P_ref = 101325 Pa.
 *
 * @param C_measured  - Measured concentration (any consistent unit, e.g. μg/m³)
 * @param T_K         - Sample temperature (K)
 * @param P_Pa        - Sample pressure (Pa)
 * @param T_ref_K  - Reference temperature (K)
 * @param P_ref_Pa - Reference pressure (Pa)
 * @returns Corrected concentration (same units as C_measured)
 * @throws {RangeError} if T_K ≤ 0 or P_Pa ≤ 0
 *
 * Reference: ideal gas law PV = nRT
 */
export function soilVaporSurveyCorrection(
    C_measured: number,
    T_K: number,
    P_Pa: number,
    T_ref_K: number = 293.15,
    P_ref_Pa: number = 101325,
): number {
    if (T_K <= 0) throw new RangeError(`T_K must be > 0 (absolute temperature), got ${T_K}`);
    if (P_Pa <= 0) throw new RangeError(`P_Pa must be > 0, got ${P_Pa}`);
    if (T_ref_K <= 0) throw new RangeError(`T_ref_K must be > 0, got ${T_ref_K}`);
    if (P_ref_Pa <= 0) throw new RangeError(`P_ref_Pa must be > 0, got ${P_ref_Pa}`);
    if (C_measured < 0) throw new RangeError(`C_measured must be >= 0, got ${C_measured}`);
    return C_measured * (T_ref_K / T_K) * (P_Pa / P_ref_Pa);
}

// ---------------------------------------------------------------------------
// 9. Knudsen Diffusion
// ---------------------------------------------------------------------------

/**
 * Compute Knudsen diffusion coefficient for gas in small pores.
 *
 * D_K = (d_pore / 3) × sqrt(8 × R × T / (π × M))
 *
 * For combined diffusion (molecular + Knudsen):
 *   1/D_combined = 1/D_molecular + 1/D_K
 *
 * @param d_pore_m      - Pore diameter (m)
 * @param M_g_per_mol   - Molar mass of gas (g/mol)
 * @param T_K           - Temperature (K)
 * @returns {{D_K_m2_per_s: number, D_combined: (D_mol: number) => number}}
 * @throws {RangeError} if any input ≤ 0
 *
 * Reference: Knudsen (1909) Ann. Phys. 333(1):75–130
 */
export function knadsenDiffusion(
    d_pore_m: number,
    M_g_per_mol: number,
    T_K: number,
): Readonly<{ D_K_m2_per_s: number; D_combined: (D_mol: number) => number }> {
    if (d_pore_m <= 0) throw new RangeError(`d_pore_m must be > 0, got ${d_pore_m}`);
    if (M_g_per_mol <= 0) throw new RangeError(`M_g_per_mol must be > 0, got ${M_g_per_mol}`);
    if (T_K <= 0) throw new RangeError(`T_K must be > 0, got ${T_K}`);

    // Converter M de g/mol para kg/mol para usar com R em J/mol·K = kg·m²/(s²·mol·K)
    const M_kg_mol = M_g_per_mol / 1000;
    const D_K_m2_per_s = (d_pore_m / 3) * Math.sqrt((8 * R_J_MOL_K * T_K) / (PI * M_kg_mol));

    /**
     * Compute combined diffusion coefficient via harmonic mean.
     * @param Q_wind_m3_per_s - Molecular (free-air) diffusion coefficient (m²/s)
     * @returns D_combined (m²/s)
     */
    const D_combined = (D_mol: number): number => {
        if (D_mol <= 0) throw new RangeError(`D_mol must be > 0, got ${D_mol}`);
        return 1 / (1 / D_mol + 1 / D_K_m2_per_s);
    };

    return Object.freeze({ D_K_m2_per_s, D_combined });
}

// ---------------------------------------------------------------------------
// 10. Building Pressurization
// ---------------------------------------------------------------------------

/**
 * Estimate building air change rate (ACH) and pressure driving force for
 * vapor intrusion from stack effect and wind.
 *
 * Simplified stack effect pressure:
 *   deltaP_stack = 0.04 × h_m   [Pa/m × m = Pa]  (typ. 0.04 Pa/m)
 *
 * Simplified wind pressure (Cp = 0.8):
 *   deltaP_wind = 0.8 × rho_air × u^2 / 2   [Pa]
 *
 * ACH = (Q_stack + Q_wind) × 3600 / V_building
 *
 * @param Q_wind_m3_per_s - Stack-effect ventilation flow rate (m³/s)
 * @param Q_wind_m3_per_s  - Wind-driven ventilation flow rate (m³/s)
 * @param Q_wind_m3_per_s    - Building volume (m³)
 * @param Q_wind_m3_per_s        - Effective stack height / floor-to-ceiling height (m)
 * @param Q_wind_m3_per_s  - Wind speed (m/s)
 * @returns {{ACH: number, deltaP_stack_Pa: number, deltaP_wind_Pa: number, totalQ_m3_per_s: number}}
 * @throws {RangeError} if V_building_m3 ≤ 0
 *
 * Reference: Sherman & Grimsrud (1980) LBL-10023
 */
export function buildingPressurization(
    Q_stack_m3_per_s: number,
    Q_wind_m3_per_s: number,
    V_building_m3: number,
    h_m: number = 2.5,
    u_m_per_s: number = 3.0,
): Readonly<{ ACH: number; deltaP_stack_Pa: number; deltaP_wind_Pa: number; totalQ_m3_per_s: number }> {
    if (V_building_m3 <= 0) throw new RangeError(`V_building_m3 must be > 0, got ${V_building_m3}`);
    if (Q_stack_m3_per_s < 0) throw new RangeError(`Q_stack_m3_per_s must be >= 0`);
    if (Q_wind_m3_per_s < 0) throw new RangeError(`Q_wind_m3_per_s must be >= 0`);
    if (h_m <= 0) throw new RangeError(`h_m must be > 0, got ${h_m}`);
    if (u_m_per_s < 0) throw new RangeError(`u_m_per_s must be >= 0`);

    // Pressão de tiragem simplificada (deltaP por metro de altura)
    const deltaP_stack_Pa = 0.04 * h_m;
    // Pressão de vento simplificada (Cp = 0.8, rho = 1.2 kg/m³)
    const deltaP_wind_Pa = (0.8 * RHO_AIR_KG_M3 * (u_m_per_s * u_m_per_s)) / 2;
    const totalQ_m3_per_s = Q_stack_m3_per_s + Q_wind_m3_per_s;
    const ACH = (totalQ_m3_per_s * 3600) / V_building_m3;

    return Object.freeze({ ACH, deltaP_stack_Pa, deltaP_wind_Pa, totalQ_m3_per_s });
}
