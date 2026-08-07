// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Thermal Transport in Aquifers - Pure-Math Solver
 *
 * Implements:
 *  - Thermal retardation factor (Freeze & Cherry 1979)
 *  - Effective thermal conductivity geometric mean (Woodside & Messmer 1961)
 *  - Thermal dispersion tensor (de Marsily 1986)
 *  - Domenico 1D thermal front solution with erfc approximation (Domenico & Palciauskas 1973)
 *  - Conductive + advective heat flux (groundwater)
 *  - Geothermal gradient and linear temperature profile
 *  - Ground Source Heat Pump COP accounting (ASHRAE 2015)
 *  - Aquifer Thermal Energy Storage (ATES) (Banks 2012)
 *  - Thermal plume radius (steady state) (Stauffer et al. 2014)
 *  - Clausius-Clapeyron boiling point correction (Kaye & Laby)
 *
 * Academic references:
 *  - Freeze, R.A. & Cherry, J.A. (1979) "Groundwater". Prentice-Hall. ISBN 0-13-365312-9
 *  - Woodside, W. & Messmer, J.H. (1961) J.App.Phys. 32(9):1688. DOI:10.1063/1.1728419
 *  - de Marsily, G. (1986) "Quantitative Hydrogeology". Academic Press. ISBN 0-12-208450-1
 *  - Domenico, P.A. & Palciauskas, V.V. (1973) J.Hydrol. 20(3-4):281. DOI:10.1016/0022-1694(73)90066-5
 *  - ASHRAE (2015) "Handbook - HVAC Applications". Ch. 34 Geothermal Energy.
 *  - Banks, D. (2012) "An Introduction to Thermogeology". Wiley-Blackwell. ISBN 978-0-470-67034-7
 *  - Stauffer, F., Bayer, P., Blum, P., Molina-Giraldo, N. & Kinzelbach, W. (2014)
 *    "Thermal Use of Shallow Groundwater". CRC Press. DOI:10.1201/b16239
 *  - Kaye, G.W.C. & Laby, T.H. "Tables of Physical & Chemical Constants". 16th ed.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Complementary error function approximation (Abramowitz & Stegun 7.1.26).
 * Max error |eps| < 1.5e-7 over all x ≥ 0.
 * For x < 0: erfc(x) = 2 - erfc(-x).
 *
 * @param {number} x
 * @returns {number} erfc(x)
 */
function erfc(x: number): number {
    if (x < 0) return 2 - erfc(-x);
    // Horner polynomial (A&S 7.1.26, p. 299)
    const t = 1 / (1 + 0.3275911 * x);
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    return poly * Math.exp(-(x * x));
}

// ---------------------------------------------------------------------------
// 1. Thermal Retardation Factor
// ---------------------------------------------------------------------------

/**
 * Compute thermal retardation factor R_T (dimensionless).
 *
 * R_T = 1 + ((1 - n) × rho_s × c_s) / (n × rho_w × c_w)
 *
 * Represents how much the thermal front is slowed relative to groundwater flow.
 * Typical range: 2–6 for saturated sandy aquifer.
 *
 * Reference: Freeze & Cherry (1979) "Groundwater", eq. 2.80
 *
 * @param {number} rho_s - Soil (grain) density (kg/m³), typically 2600–2700
 * @param {number} c_s   - Specific heat capacity of soil grains (J/kg·K), typically 800–1000
 * @param {number} n     - Effective porosity (dimensionless, 0 < n < 1)
 * @param {number} rho_w - Water density (kg/m³), typically ~1000
 * @param {number} c_w   - Specific heat capacity of water (J/kg·K), typically ~4182
 * @returns {number} R_T ≥ 1
 * @throws {RangeError} if porosity not in (0,1) or any density/heat capacity ≤ 0
 */
function thermalRetardationFactor(rho_s: number, c_s: number, n: number, rho_w: number, c_w: number): number {
    if (n <= 0 || n >= 1) throw new RangeError(`porosity n must be in (0,1), got ${n}`);
    if (rho_s <= 0) throw new RangeError(`rho_s must be > 0, got ${rho_s}`);
    if (c_s <= 0) throw new RangeError(`c_s must be > 0, got ${c_s}`);
    if (rho_w <= 0) throw new RangeError(`rho_w must be > 0, got ${rho_w}`);
    if (c_w <= 0) throw new RangeError(`c_w must be > 0, got ${c_w}`);
    return 1 + ((1 - n) * rho_s * c_s) / (n * rho_w * c_w);
}

// ---------------------------------------------------------------------------
// 2. Effective Thermal Conductivity
// ---------------------------------------------------------------------------

/**
 * Compute bulk effective thermal conductivity using geometric mean mixing rule.
 *
 * lambda_eff = lambda_s^(1-n) × lambda_w^n
 *
 * Reference: Woodside & Messmer (1961) J.App.Phys. 32(9):1688
 *
 * @param {number} lambda_s - Solid (soil) thermal conductivity (W/m·K), typically 1–5
 * @param {number} lambda_w - Water thermal conductivity (W/m·K), typically ~0.6
 * @param {number} n        - Porosity (dimensionless, 0 < n < 1)
 * @returns {number} lambda_eff in W/m·K
 * @throws {RangeError} on invalid inputs
 */
function effectiveThermalConductivity(lambda_s: number, lambda_w: number, n: number): number {
    if (lambda_s <= 0) throw new RangeError(`lambda_s must be > 0, got ${lambda_s}`);
    if (lambda_w <= 0) throw new RangeError(`lambda_w must be > 0, got ${lambda_w}`);
    if (n <= 0 || n >= 1) throw new RangeError(`porosity n must be in (0,1), got ${n}`);
    return Math.pow(lambda_s, 1 - n) * Math.pow(lambda_w, n);
}

// ---------------------------------------------------------------------------
// 3. Thermal Dispersion Tensor
// ---------------------------------------------------------------------------

/**
 * Compute longitudinal and transverse thermal dispersion coefficients.
 *
 * D_T_longitudinal = lambda_eff / (n × rho_w × c_w) + alpha_L × v
 * D_T_transverse   = lambda_eff / (n × rho_w × c_w) + alpha_T × v
 *
 * The first term is the effective thermal diffusivity (conductive); the second
 * is the mechanical/hydrodynamic thermal dispersion.
 *
 * Reference: de Marsily (1986) "Quantitative Hydrogeology", eq. 9.3
 *
 * @param {number} v          - Seepage (pore) velocity (m/s), v = q/n
 * @param {number} alpha_L    - Longitudinal thermal dispersivity (m)
 * @param {number} alpha_T    - Transverse thermal dispersivity (m)
 * @param {number} lambda_eff - Effective thermal conductivity (W/m·K)
 * @param {number} rho_w      - Water density (kg/m³)
 * @param {number} c_w        - Water specific heat (J/kg·K)
 * @param {number} n          - Porosity (dimensionless)
 * @returns {{D_T_longitudinal: number, D_T_transverse: number, D_molecular: number}} in m²/s
 * @throws {RangeError} on non-positive lambda_eff, rho_w, c_w, or n out of (0,1)
 */
function thermalDispersion(
    v: number,
    alpha_L: number,
    alpha_T: number,
    lambda_eff: number,
    rho_w: number,
    c_w: number,
    n: number,
): Readonly<{ D_T_longitudinal: number; D_T_transverse: number; D_molecular: number }> {
    if (lambda_eff <= 0) throw new RangeError(`lambda_eff must be > 0, got ${lambda_eff}`);
    if (rho_w <= 0) throw new RangeError(`rho_w must be > 0, got ${rho_w}`);
    if (c_w <= 0) throw new RangeError(`c_w must be > 0, got ${c_w}`);
    if (n <= 0 || n >= 1) throw new RangeError(`porosity n must be in (0,1), got ${n}`);
    if (v < 0) throw new RangeError(`seepage velocity v must be >= 0, got ${v}`);
    const D_molecular = lambda_eff / (n * rho_w * c_w);
    return Object.freeze({
        D_T_longitudinal: D_molecular + alpha_L * v,
        D_T_transverse: D_molecular + alpha_T * v,
        D_molecular,
    });
}

// ---------------------------------------------------------------------------
// 4. Domenico Thermal Front (1D, continuous source, erfc solution)
// ---------------------------------------------------------------------------

/**
 * 1D thermal front temperature using Domenico-like erfc solution.
 *
 * theta(x,t) = (T0 - T_ambient) / 2 × erfc((x - v*t/R_T) / (2 × sqrt(D_T * t / R_T)))
 * T(x,t) = T_ambient + theta
 *
 * Valid for continuous heated source at x=0, uniform flow in +x direction.
 * Returns T_ambient when t = 0 (initial condition).
 *
 * Reference: Domenico & Palciauskas (1973) J.Hydrol. 20(3-4):281
 *
 * @param {number} x         - Distance from source (m), x > 0
 * @param {number} t         - Elapsed time (s), t ≥ 0
 * @param {number} v         - Seepage velocity (m/s)
 * @param {number} D_T       - Longitudinal thermal dispersion coefficient (m²/s)
 * @param {number} T0        - Source temperature (°C or K)
 * @param {number} T_ambient - Ambient (background) aquifer temperature (°C or K)
 * @param {number} R_T       - Thermal retardation factor (dimensionless, ≥ 1)
 * @returns {number} Temperature T in same units as T0 and T_ambient
 * @throws {RangeError} if t < 0, R_T < 1, D_T ≤ 0, or v < 0
 */
function domenicaThermal(
    x: number,
    t: number,
    v: number,
    D_T: number,
    T0: number,
    T_ambient: number,
    R_T: number,
): number {
    if (t < 0) throw new RangeError(`t must be >= 0, got ${t}`);
    if (R_T < 1) throw new RangeError(`R_T must be >= 1, got ${R_T}`);
    if (D_T <= 0) throw new RangeError(`D_T must be > 0, got ${D_T}`);
    if (v < 0) throw new RangeError(`v must be >= 0, got ${v}`);
    if (t === 0) return T_ambient;
    const numerator = x - (v * t) / R_T;
    const denominator = 2 * Math.sqrt((D_T * t) / R_T);
    const theta = ((T0 - T_ambient) / 2) * erfc(numerator / denominator);
    return T_ambient + theta;
}

// ---------------------------------------------------------------------------
// 5. Heat Flux (conductive + advective)
// ---------------------------------------------------------------------------

/**
 * Total vertical heat flux through saturated porous medium.
 *
 * q_heat = -lambda_eff × dT_dz + rho_w × c_w × q_z × T
 *
 * Sign convention: positive upward. Conductive term carries negative sign
 * (Fourier law: heat flows from hot to cold). Advective term is positive
 * when q_z > 0 (upward flow carries heat upward).
 *
 * @param {number} lambda_eff - Effective thermal conductivity (W/m·K)
 * @param {number} dT_dz      - Vertical temperature gradient (K/m), positive = warmer below
 * @param {number} rho_w      - Water density (kg/m³)
 * @param {number} c_w        - Water specific heat (J/kg·K)
 * @param {number} q_z        - Vertical Darcy flux (m/s), positive upward
 * @param {number} T          - Local temperature (K)
 * @returns {number} Heat flux q_heat in W/m²
 * @throws {RangeError} if lambda_eff, rho_w, c_w ≤ 0
 */
function heatFluxGroundwater(
    lambda_eff: number,
    dT_dz: number,
    rho_w: number,
    c_w: number,
    q_z: number,
    T: number,
): number {
    if (lambda_eff <= 0) throw new RangeError(`lambda_eff must be > 0, got ${lambda_eff}`);
    if (rho_w <= 0) throw new RangeError(`rho_w must be > 0, got ${rho_w}`);
    if (c_w <= 0) throw new RangeError(`c_w must be > 0, got ${c_w}`);
    return -lambda_eff * dT_dz + rho_w * c_w * q_z * T;
}

// ---------------------------------------------------------------------------
// 6. Geothermal Gradient
// ---------------------------------------------------------------------------

/**
 * Compute geothermal gradient and linear temperature profile.
 *
 * gradient = (T_bottom - T_surface) / depth_m  [K/m]
 * T(z) = T_surface + gradient × z
 *
 * Typical continental geothermal gradient: 0.025–0.035 K/m (25–35 °C/km).
 *
 * @param {number} T_surface - Surface temperature (°C or K)
 * @param {number} T_bottom  - Temperature at depth (°C or K)
 * @param {number} depth_m   - Depth of bottom measurement (m), must be > 0
 * @returns {{gradient_K_per_m: number, T_at_depth: function(number): number}}
 * @throws {RangeError} if depth_m ≤ 0
 */
function geothermalGradient(
    T_surface: number,
    T_bottom: number,
    depth_m: number,
): Readonly<{ gradient_K_per_m: number; T_at_depth: (z: number) => number }> {
    if (depth_m <= 0) throw new RangeError(`depth_m must be > 0, got ${depth_m}`);
    const gradient_K_per_m = (T_bottom - T_surface) / depth_m;
    return Object.freeze({
        gradient_K_per_m,
        T_at_depth: (z: number): number => T_surface + gradient_K_per_m * z,
    });
}

// ---------------------------------------------------------------------------
// 7. Ground Source Heat Pump
// ---------------------------------------------------------------------------

/**
 * Annual energy accounting for ground source heat pump (GSHP).
 *
 * Heating mode (extracts heat from ground):
 *   Q_extracted = (COP - 1) × P_electrical_kW × hours_per_year  [kWh]
 *
 * Cooling mode (rejects heat to ground):
 *   Q_rejected = (COP + 1) × P_electrical_kW × hours_per_year  [kWh]
 *
 * COP_efficiency = (COP - 1) / COP  (fraction of output that is "free" from ground)
 *
 * Reference: ASHRAE (2015) Handbook - HVAC Applications, Ch. 34
 *
 * @param {number} COP              - Coefficient of Performance (≥ 1, typically 3–5 for heating)
 * @param {number} P_electrical_kW  - Electrical input power (kW), > 0
 * @param {number} hours_per_year   - Annual operating hours, > 0
 * @returns {{Q_extracted_kWh: number, Q_rejected_kWh: number, COP_efficiency: number}}
 * @throws {RangeError} if COP < 1 or P_electrical_kW ≤ 0 or hours_per_year ≤ 0
 */
function groundSourceHeatPump(
    COP: number,
    P_electrical_kW: number,
    hours_per_year: number,
): Readonly<{ Q_extracted_kWh: number; Q_rejected_kWh: number; COP_efficiency: number }> {
    if (COP < 1) throw new RangeError(`COP must be >= 1 (thermodynamic minimum), got ${COP}`);
    if (P_electrical_kW <= 0) throw new RangeError(`P_electrical_kW must be > 0, got ${P_electrical_kW}`);
    if (hours_per_year <= 0) throw new RangeError(`hours_per_year must be > 0, got ${hours_per_year}`);
    const Q_extracted_kWh = (COP - 1) * P_electrical_kW * hours_per_year;
    const Q_rejected_kWh = (COP + 1) * P_electrical_kW * hours_per_year;
    const COP_efficiency = (COP - 1) / COP;
    return Object.freeze({ Q_extracted_kWh, Q_rejected_kWh, COP_efficiency });
}

// ---------------------------------------------------------------------------
// 8. Aquifer Thermal Energy Storage (ATES)
// ---------------------------------------------------------------------------

/**
 * Compute thermal energy stored in an aquifer volume.
 *
 * E = V × [(1-n) × rho_s × c_s + n × rho_w × c_w] × deltaT
 *
 * Returns energy in both MJ and kWh (1 kWh = 3.6 MJ).
 *
 * Reference: Banks (2012) "An Introduction to Thermogeology", eq. 2.13
 *
 * @param {number} V_m3      - Aquifer volume (m³)
 * @param {number} n         - Porosity (dimensionless, 0 < n < 1)
 * @param {number} rho_w     - Water density (kg/m³)
 * @param {number} c_w       - Water specific heat (J/kg·K)
 * @param {number} rho_s     - Soil density (kg/m³)
 * @param {number} c_s       - Soil specific heat (J/kg·K)
 * @param {number} deltaT    - Temperature difference to ambient (K or °C difference)
 * @returns {{energy_MJ: number, energy_kWh: number, volumetricHeatCapacity_J_m3K: number}}
 * @throws {RangeError} on invalid inputs
 */
function aquiferThermalEnergyStorage(
    V_m3: number,
    n: number,
    rho_w: number,
    c_w: number,
    rho_s: number,
    c_s: number,
    deltaT: number,
): Readonly<{ energy_MJ: number; energy_kWh: number; volumetricHeatCapacity_J_m3K: number }> {
    if (V_m3 <= 0) throw new RangeError(`V_m3 must be > 0, got ${V_m3}`);
    if (n <= 0 || n >= 1) throw new RangeError(`porosity n must be in (0,1), got ${n}`);
    if (rho_w <= 0) throw new RangeError(`rho_w must be > 0, got ${rho_w}`);
    if (c_w <= 0) throw new RangeError(`c_w must be > 0, got ${c_w}`);
    if (rho_s <= 0) throw new RangeError(`rho_s must be > 0, got ${rho_s}`);
    if (c_s <= 0) throw new RangeError(`c_s must be > 0, got ${c_s}`);
    // deltaT can be any real value (negative = cooler than ambient is valid)
    const volumetricHeatCapacity_J_m3K = (1 - n) * rho_s * c_s + n * rho_w * c_w;
    const energy_J = V_m3 * volumetricHeatCapacity_J_m3K * deltaT;
    const energy_MJ = energy_J / 1e6;
    const energy_kWh = energy_J / 3.6e6;
    return Object.freeze({ energy_MJ, energy_kWh, volumetricHeatCapacity_J_m3K });
}

// ---------------------------------------------------------------------------
// 9. Thermal Plume Radius
// ---------------------------------------------------------------------------

/**
 * Approximate steady-state thermal plume radius (2D influence zone).
 *
 * r = sqrt(Q_heat_kW × 1000 / (π × lambda_eff × deltaT_max))
 *
 * Derived from steady radial heat conduction Q = 2π × lambda × deltaT × H
 * (simplified for unit thickness H=1 and ignoring advection correction).
 *
 * Reference: Stauffer et al. (2014) "Thermal Use of Shallow Groundwater", §3.2
 *
 * @param {number} Q_heat_kW   - Injected/extracted thermal power (kW), > 0
 * @param {number} lambda_eff  - Effective thermal conductivity (W/m·K)
 * @param {number} deltaT_max  - Maximum allowable temperature difference at plume edge (K), > 0
 * @returns {number} Radius in meters
 * @throws {RangeError} if any argument ≤ 0
 */
function thermalPlumeRadius(Q_heat_kW: number, lambda_eff: number, deltaT_max: number): number {
    if (Q_heat_kW <= 0) throw new RangeError(`Q_heat_kW must be > 0, got ${Q_heat_kW}`);
    if (lambda_eff <= 0) throw new RangeError(`lambda_eff must be > 0, got ${lambda_eff}`);
    if (deltaT_max <= 0) throw new RangeError(`deltaT_max must be > 0, got ${deltaT_max}`);
    return Math.sqrt((Q_heat_kW * 1000) / (Math.PI * lambda_eff * deltaT_max));
}

// ---------------------------------------------------------------------------
// 10. Clausius-Clapeyron Boiling Point Correction
// ---------------------------------------------------------------------------

/**
 * Pressure-corrected boiling point for deep well fluids.
 *
 * Hydrostatic pressure at depth:
 *   P = P_atm + rho_w × g × depth_m  [Pa]
 *
 * Simplified Clausius-Clapeyron boiling point elevation:
 *   T_boil = 100 + 0.037 × (P/101325 - 1) × 100  [°C]
 *
 * Note: This is a first-order linearization valid to ~50 bar (500 m depth in fresh water).
 * Standard atmosphere: P_atm = 101325 Pa, g = 9.81 m/s².
 *
 * Reference: Kaye & Laby "Tables of Physical & Chemical Constants", 16th ed. §3.4
 *
 * @param {number} T_celsius - Fluid temperature at depth (°C)
 * @param {number} depth_m   - Depth below water table (m), ≥ 0
 * @returns {{P_Pa: number, T_boil_celsius: number, is_above_boiling: boolean}}
 */
function clapeyronTemperatureCorrection(
    T_celsius: number,
    depth_m: number,
): Readonly<{ P_Pa: number; T_boil_celsius: number; is_above_boiling: boolean }> {
    if (depth_m < 0) throw new RangeError(`depth_m must be >= 0, got ${depth_m}`);
    const P_atm = 101325; // Pa
    const rho_w = 1000; // kg/m³
    const g = 9.81; // m/s²
    const P_Pa = P_atm + rho_w * g * depth_m;
    const T_boil_celsius = 100 + 0.037 * (P_Pa / P_atm - 1) * 100;
    return Object.freeze({
        P_Pa,
        T_boil_celsius,
        is_above_boiling: T_celsius > T_boil_celsius,
    });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
    thermalRetardationFactor,
    effectiveThermalConductivity,
    thermalDispersion,
    domenicaThermal,
    heatFluxGroundwater,
    geothermalGradient,
    groundSourceHeatPump,
    aquiferThermalEnergyStorage,
    thermalPlumeRadius,
    clapeyronTemperatureCorrection,
};
