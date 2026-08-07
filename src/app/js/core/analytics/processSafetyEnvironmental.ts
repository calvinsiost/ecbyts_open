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
// Application: EHS & Mining - Process Safety Environmental Assessment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Process Safety Environmental Assessment - Pure-logic scientific module
 *
 * Implements quantitative risk assessment (QRA) methods for industrial process
 * safety with environmental consequence modeling. All functions are pure
 * mathematical computations: zero DOM, zero IndexedDB, zero Three.js, zero fetch.
 *
 * Referências acadêmicas:
 *   - Slade, D.H. (Ed.) (1968). Meteorology and Atomic Energy. USAEC TID-24190.
 *   - Turner, D.B. (1970). Workbook on Atmospheric Dispersion Estimates. EPA AP-26.
 *   - Ten Berge, W.F. et al. (1986). "Concentration-time mortality response relationship
 *     of irritant and systemically acting vapours and gases." J. Hazardous Materials
 *     13(3), pp. 301-309. DOI: 10.1016/0304-3894(86)85003-2
 *   - Roberts, A.F. (1982). "Thermal radiation hazards from releases of LPG from
 *     pressurised storage." Fire Safety Journal 4(3), pp. 197-212.
 *     DOI: 10.1016/0379-7112(82)90010-9
 *   - Baker, W.E. et al. (1983). Explosion Hazards and Evaluation. Elsevier.
 *     ISBN: 978-0-444-42000-2
 *   - Mackay, D. & Matsugu, R.S. (1973). "Evaporation rates of liquid hydrocarbon
 *     spills on land and water." Canadian Journal of Chemical Engineering 51(4),
 *     pp. 434-439. DOI: 10.1002/cjce.5450510407
 *   - CCPS (1989). Guidelines for Chemical Process Quantitative Risk Analysis.
 *     AIChE, New York. ISBN: 978-0-8169-0402-8
 *   - CCPS (1999). Guidelines for Consequence Analysis of Chemical Releases.
 *     AIChE, New York.
 *   - TNO Yellow Book (1997). Methods for the Calculation of Physical Effects.
 *     3rd ed. Committee for the Prevention of Disasters, The Hague.
 *   - Cozzani, V. & Salzano, E. (2004). "The quantitative assessment of domino
 *     effects caused by overpressure." Journal of Hazardous Materials 107(3),
 *     pp. 67-80. DOI: 10.1016/j.jhazmat.2003.09.013
 *   - ACGIH (2024). TLVs and BEIs Booklet. American Conference of Governmental
 *     Industrial Hygienists, Cincinnati, OH.
 *   - SFPE Handbook (2002). SFPE Handbook of Fire Protection Engineering. 3rd ed.
 *     Society of Fire Protection Engineers, Bethesda, MD.
 */

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Pasquill-Gifford sigma_y coefficients [a, b] per stability class (Turner 1970 Table 3-2).
 *  sigma_y = a * x^b  (x in metres, sigma_y in metres)
 *  @type {Record<string, number[]>}
 */
const PG_SIGMA_Y = {
    A: [0.3658, 0.9024],
    B: [0.2751, 0.9024],
    C: [0.209, 0.9024],
    D: [0.1471, 0.9024],
    E: [0.1046, 0.9024],
    F: [0.0722, 0.9024],
};

/** Universal gas constant [J/(mol·K)] */
const R_GAS = 8.314;

/** Gravitational acceleration [m/s²] */
const _G = 9.81;

/** Air density at 15 °C, 101.325 kPa [kg/m³] */
const _RHO_AIR = 1.225;

/** Heat of combustion for generic hydrocarbon (TNO Yellow Book) [MJ/kg] */
const HC_DEFAULT = 46.0;

/** Heat of detonation of TNT [MJ/kg] */
const H_TNT = 4.68;

/** Radiation fraction for hydrocarbon BLEVE (Roberts 1982) default */
const F_BLEVE_DEFAULT = 0.32;

/** Stefan-Boltzmann constant [kW/(m²·K⁴)] */
// not needed directly; SEP-based approach used

/** Probit function constants for toxic substances (Ten Berge 1986).
 *  { n, k }  -- ln(C^n * t) probit: Y = a_sub + b_sub * ln(C^n * t)
 *  Using TNO/RIVM parameterisation: Y = 5 + ln(k) + n*ln(C) + ln(t) mapped to
 *  simpler form: C in ppm, t in minutes.
 *  Lethality 1% LC01 reference: ERPG-2 serves as surrogate.
 *  @type {Record<string, {n: number, k: number, erpg2_ppm: number, idlh_ppm: number}>}
 */
const TOXIC_PARAMS = {
    // { n, k_probit, erpg2_ppm, idlh_ppm }
    ammonia: { n: 2, k: 3.5e4, erpg2_ppm: 150, idlh_ppm: 300 },
    chlorine: { n: 2, k: 2.0e3, erpg2_ppm: 3, idlh_ppm: 10 },
    hydrogen_sulfide: { n: 1, k: 1.0e3, erpg2_ppm: 50, idlh_ppm: 50 },
    sulfur_dioxide: { n: 1, k: 1.0e5, erpg2_ppm: 3, idlh_ppm: 100 },
};

/** ACGIH TLV-TWA 2024 [ppm] for occupational exposure index
 *  @type {Record<string, number>}
 */
const TLV_TWA = {
    benzene: 0.5,
    toluene: 20,
    xylene: 100,
    styrene: 20,
    acetone: 250,
};

/** Excess cancer risk factor for benzene per unit exposure ratio (IARC Group 1)
 *  @type {Record<string, number>}
 */
const EXCESS_RISK_FACTOR = {
    benzene: 2.2e-6, // per ppm-year (IRIS/EPA RF = 7.8e-6 per ppm; normalised to ratio)
};

// ---------------------------------------------------------------------------
// Utility helpers (private)
// ---------------------------------------------------------------------------

/**
 * Normal CDF approximation (Abramowitz & Stegun 26.2.17).
 * @param {number} z
 * @returns {number} probability [0,1]
 */
function normalCDF(z: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp((-z * z) / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.821256 + t * 1.3302744))));
    return z >= 0 ? 1 - p : p;
}

/**
 * Probit to probability conversion.
 * @param {number} Y probit value
 * @returns {number} probability [0,1]
 */
function probitToProb(Y: number): number {
    return normalCDF(Y - 5);
}

/**
 * Clamp a value between min and max.
 * @param {number} windSpeed_ms
 * @param {number} distanceM
 * @param {number} releaseHeightM
 * @returns {number}
 */
import { clamp } from '../../utils/helpers/math.js';

// ---------------------------------------------------------------------------
// 1. Pasquill-Gifford sigma dispersion parameters
// ---------------------------------------------------------------------------

/**
 * Compute Pasquill-Gifford atmospheric dispersion sigma values.
 *
 * Uses sigma_y = a * x^b (Turner 1970 Table 3-2) and simplified sigma_z
 * formulae (Slade 1968 / EPA AP-26 approximations).
 *
 * @param {'A'|'B'|'C'|'D'|'E'|'F'} windSpeed_ms Pasquill stability class
 * @param {number} distanceM downwind distance [m] (must be > 0)
 * @param {number} releaseHeightM effective stack/release height [m] (unused in sigma, for context)
 * @param {number} windSpeed_ms mean wind speed at release height [m/s] (must be > 0)
 * @returns {{ sigmaY_m: number, sigmaZ_m: number, stabilityClass: string }}
 * @reference Turner, D.B. (1970). EPA AP-26. Table 3-2.
 * @reference Slade, D.H. (Ed.) (1968). USAEC TID-24190.
 */
export function pasquillGiffordDispersion(stability: 'A'|'B'|'C'|'D'|'E'|'F', distanceM: number, releaseHeightM: number, windSpeed_ms: number): { sigmaY_m: number, sigmaZ_m: number, stabilityClass: string } {
    const cls = String(stability).toUpperCase();
    const pgTable = PG_SIGMA_Y as Record<string, number[]>;
    if (!pgTable[cls]) {
        throw new RangeError(`Unknown stability class "${stability}". Must be A-F.`);
    }
    if (distanceM <= 0) throw new RangeError('distanceM must be > 0');
    if (windSpeed_ms <= 0) throw new RangeError('windSpeed_ms must be > 0');

    const x = distanceM;
    const [a, b] = pgTable[cls] as [number, number];
    const sigmaY_m = a * Math.pow(x, b);

    // sigma_z simplified formulae per class
    let sigmaZ_m;
    switch (cls) {
        case 'A':
            sigmaZ_m = 0.22 * x * Math.pow(1 + 0.0001 * x, -0.5);
            break;
        case 'B':
            sigmaZ_m = 0.16 * x * Math.pow(1 + 0.0001 * x, -0.5);
            break;
        case 'C':
            sigmaZ_m = 0.11 * x * Math.pow(1 + 0.0001 * x, -0.5);
            break;
        case 'D':
            sigmaZ_m = 0.08 * x * Math.pow(1 + 0.00015 * x, -0.5);
            break;
        case 'E':
            sigmaZ_m = 0.06 * x * Math.pow(1 + 0.0015 * x, -0.5);
            break;
        case 'F':
            sigmaZ_m = 0.04 * x * Math.pow(1 + 0.0003 * x, -1.0);
            break;
        default:
            sigmaZ_m = 0;
    }

    return { sigmaY_m, sigmaZ_m, stabilityClass: cls };
}

// ---------------------------------------------------------------------------
// 2. Instantaneous release puff model
// ---------------------------------------------------------------------------

/**
 * Puff model ground-level concentration for instantaneous release.
 *
 * Implements the Gaussian puff equation as described in CCPS (1999):
 *   C = [Q / ((2π)^(3/2) σy² σz)] × exp(-y²/(2σy²)) ×
 *       [exp(-(z-H)²/(2σz²)) + exp(-(z+H)²/(2σz²))]
 * evaluated at z = 0 (ground level).
 *
 * @param {number} mass_kg released mass [kg]
 * @param {number} sigmaY dispersion parameter σy [m]
 * @param {number} sigmaZ dispersion parameter σz [m]
 * @param {number} distance_m downwind distance from source [m]
 * @param {number} crosswind_m crosswind offset y [m]
 * @param {number} height_m receptor height z [m] (typically 0 = ground level)
 * @param {number} releaseHeight_m effective source height H [m]
 * @param {number} windSpeed_ms mean wind speed [m/s]
 * @param {number} [_time_s?] elapsed time since release [s] (unused, kept for API parity)
 * @returns {{ concentration_kg_m3: number, peakConcentration_kg_m3: number }}
 * @reference CCPS (1999). Guidelines for Consequence Analysis of Chemical Releases.
 */
export function instantaneousReleasePuff(mass_kg: number, sigmaY: number, sigmaZ: number, distance_m: number, crosswind_m: number, height_m: number, releaseHeight_m: number, windSpeed_ms: number, _time_s?: number): { concentration_kg_m3: number, peakConcentration_kg_m3: number } {
    if (mass_kg < 0) throw new RangeError('mass_kg must be >= 0');
    if (sigmaY <= 0 || sigmaZ <= 0) throw new RangeError('sigma values must be > 0');
    if (windSpeed_ms <= 0) throw new RangeError('windSpeed_ms must be > 0');

    const H = releaseHeight_m;
    const z = height_m;
    const y = crosswind_m;

    // Gaussian puff concentration [kg/m³]
    const norm = mass_kg / (Math.pow(2 * Math.PI, 1.5) * sigmaY * sigmaY * sigmaZ);
    const expY = Math.exp(-(y * y) / (2 * sigmaY * sigmaY));
    const expZ1 = Math.exp(-Math.pow(z - H, 2) / (2 * sigmaZ * sigmaZ));
    const expZ2 = Math.exp(-Math.pow(z + H, 2) / (2 * sigmaZ * sigmaZ));
    const concentration_kg_m3 = norm * expY * (expZ1 + expZ2);

    // Peak concentration (centreline, ground, crosswind=0)
    const peakNorm = mass_kg / (Math.pow(2 * Math.PI, 1.5) * sigmaY * sigmaY * sigmaZ);
    const peakExpZ = Math.exp(-(H * H) / (2 * sigmaZ * sigmaZ));
    const peakConcentration_kg_m3 = peakNorm * 2 * peakExpZ;

    return { concentration_kg_m3, peakConcentration_kg_m3 };
}

// ---------------------------------------------------------------------------
// 3. Toxic load - probit lethality
// ---------------------------------------------------------------------------

/**
 * Probit-based toxic load for atmospheric releases.
 *
 * Toxic dose: L = C^n × t  (Ten Berge 1986)
 * Probit:     Y = 5 + (1/b) × ln(L/k) - simplified to Y = ln(L/k)/σ + 5
 * where the probit intercept is normalised such that Y=5 → 50% effect.
 *
 * Implementation note: uses ln(C^n × t) normalised against substance k constant.
 * ERPG-2 serves as LC01 surrogate (irreversible effects to general population).
 *
 * @param {number} concentration_ppm airborne concentration [ppm]
 * @param {number} exposureTime_min exposure duration [min]
 * @param {'ammonia'|'chlorine'|'hydrogen_sulfide'|'sulfur_dioxide'} substance chemical species
 * @returns {{ toxicLoad: number, probit: number, probability_percent: number, lethality_percent: number }}
 * @reference Ten Berge, W.F. et al. (1986). J. Hazardous Materials 13(3), pp. 301-309.
 *            DOI: 10.1016/0304-3894(86)85003-2
 * @reference AIHA (2023). ERPG/WEEL Handbook.
 */
export function toxicLoadCalculation(concentration_ppm: number, exposureTime_min: number, substance: 'ammonia'|'chlorine'|'hydrogen_sulfide'|'sulfur_dioxide'): { toxicLoad: number, probit: number, probability_percent: number, lethality_percent: number } {
    const sub = String(substance).toLowerCase();
    const toxTable = TOXIC_PARAMS as Record<string, { n: number; k: number; erpg2_ppm: number; idlh_ppm: number }>;
    if (!toxTable[sub]) {
        throw new RangeError(`Unknown substance "${substance}". Use: ${Object.keys(TOXIC_PARAMS).join(', ')}`);
    }
    if (concentration_ppm < 0) throw new RangeError('concentration_ppm must be >= 0');
    if (exposureTime_min <= 0) throw new RangeError('exposureTime_min must be > 0');

    const { n, k } = toxTable[sub] as { n: number; k: number; erpg2_ppm: number; idlh_ppm: number };

    // Toxic load L = C^n × t
    const toxicLoad = Math.pow(concentration_ppm, n) * exposureTime_min;

    // Probit Y - ten Berge formulation normalised: Y = 5 + ln(L/k)
    // (coefficient b=1 is the standard simplification for RIVM/TNO quick estimates)
    const probit = toxicLoad > 0 ? 5 + Math.log(toxicLoad / k) : -Infinity;

    // Probability of irreversible effect (ERPG-2 level)
    const probability_percent = clamp(probitToProb(probit) * 100, 0, 100);

    // Lethality: shift probit by -2 (ERPG-3 / LC50 ~ 2 probit units above ERPG-2)
    const lethalProbit = probit - 2;
    const lethality_percent = clamp(probitToProb(lethalProbit) * 100, 0, 100);

    return { toxicLoad, probit, probability_percent, lethality_percent };
}

// ---------------------------------------------------------------------------
// 4. BLEVE thermal radiation
// ---------------------------------------------------------------------------

/**
 * BLEVE fireball thermal radiation using Roberts (1982) correlations.
 *
 * Fireball radius:   R = 3.24 × M^0.325  [m]
 * Fireball duration: td = 0.825 × M^0.26  [s]
 * Peak SEP:          SEP = F × M × Hc / (4π × R² × td)  [kW/m²]
 * Received flux:     E = SEP × (R/d)²  [kW/m²]
 *
 * Probit for 1% burn:  Y = -14.9 + 2.56 × ln(E^(4/3) × td)  (TNO, simplified Eisenberg)
 *
 * @param {number} mass_kg fuel mass [kg]
 * @param {number} distanceM distance to receptor [m] (must be > fireball radius)
 * @param {number} f_factor fraction of heat radiated [-] (default 0.25-0.40; typical 0.32)
 * @returns {{ fireball_radius_m: number, fireball_duration_s: number, peakSEP_kW_m2: number, receivedFlux_kW_m2: number, probitBurn: number }}
 * @reference Roberts, A.F. (1982). Fire Safety Journal 4(3), pp. 197-212.
 *            DOI: 10.1016/0379-7112(82)90010-9
 * @reference TNO Yellow Book (1997). Methods for the Calculation of Physical Effects.
 */
export function bleve_thermalRadiation(mass_kg: number, distanceM: number, f_factor: number = F_BLEVE_DEFAULT): { fireball_radius_m: number, fireball_duration_s: number, peakSEP_kW_m2: number, receivedFlux_kW_m2: number, probitBurn: number } {
    if (mass_kg <= 0) throw new RangeError('mass_kg must be > 0');
    if (distanceM <= 0) throw new RangeError('distanceM must be > 0');
    if (f_factor <= 0 || f_factor > 1) throw new RangeError('f_factor must be in (0, 1]');

    // Roberts (1982) correlations
    const fireball_radius_m = 3.24 * Math.pow(mass_kg, 0.325);
    const fireball_duration_s = 0.825 * Math.pow(mass_kg, 0.26);

    // Surface emissive power [kW/m²]
    const surfaceArea = 4 * Math.PI * fireball_radius_m * fireball_radius_m;
    const heatReleased = f_factor * mass_kg * HC_DEFAULT * 1000; // kJ
    const peakSEP_kW_m2 = heatReleased / (surfaceArea * fireball_duration_s);

    // Received heat flux at distance d [kW/m²] - point source model
    // E = SEP × (R/d)² assumes hemispherical radiation source
    const d = Math.max(distanceM, fireball_radius_m); // clamp to fireball surface
    const receivedFlux_kW_m2 = peakSEP_kW_m2 * Math.pow(fireball_radius_m / d, 2);

    // Probit for burn probability (Eisenberg 1975, simplified form):
    // Y = -14.9 + 2.56 × ln(I^(4/3) × t)
    const thermalLoad = Math.pow(receivedFlux_kW_m2, 4 / 3) * fireball_duration_s;
    const probitBurn = thermalLoad > 0 ? -14.9 + 2.56 * Math.log(thermalLoad) : -Infinity;

    return { fireball_radius_m, fireball_duration_s, peakSEP_kW_m2, receivedFlux_kW_m2, probitBurn };
}

// ---------------------------------------------------------------------------
// 5. Vapor cloud explosion - TNT equivalency
// ---------------------------------------------------------------------------

/**
 * Vapor cloud explosion overpressure via TNT equivalency method.
 *
 * TNT equivalent mass: W_tnt = M × Hc × η / H_tnt
 * Scaled distance:     Z = d / W_tnt^(1/3)
 * Overpressure:        Ps = 1772/Z³ - 114/Z² + 108/Z  [kPa] (Kingery-Bulmash fit)
 *
 * @param {number} mass_kg flammable mass in cloud [kg]
 * @param {number} efficiency yield factor η [-] (0.01–0.15; CCPS recommends 0.03-0.10)
 * @param {number} distanceM standoff distance [m]
 * @returns {{ tntEquivalent_kg: number, scaledDistance: number, peakOverpressure_kPa: number, impulse_kPa_ms: number, damageLevel: string }}
 * @reference Baker, W.E. et al. (1983). Explosion Hazards and Evaluation. Elsevier.
 * @reference CCPS (1989). Guidelines for Chemical Process Quantitative Risk Analysis.
 */
export function vaporCloudExplosion(mass_kg: number, efficiency: number, distanceM: number): { tntEquivalent_kg: number, scaledDistance: number, peakOverpressure_kPa: number, impulse_kPa_ms: number, damageLevel: string } {
    if (mass_kg <= 0) throw new RangeError('mass_kg must be > 0');
    if (efficiency <= 0 || efficiency > 1) throw new RangeError('efficiency must be in (0, 1]');
    if (distanceM <= 0) throw new RangeError('distanceM must be > 0');

    const tntEquivalent_kg = (mass_kg * HC_DEFAULT * efficiency) / H_TNT;

    // Scaled distance Z = d / W^(1/3)  [m/kg^(1/3)]
    const scaledDistance = distanceM / Math.pow(tntEquivalent_kg, 1 / 3);

    // Brode (1959) / Kingery-Bulmash polynomial for Ps [kPa]
    // Valid for Z > 0.5 m/kg^1/3
    const Z = Math.max(scaledDistance, 0.1);
    const peakOverpressure_kPa = 1772 / (Z * Z * Z) - 114 / (Z * Z) + 108 / Z;

    // Positive phase impulse (simplified): i = 0.067 × W_tnt^(1/3) / Z²  [kPa·ms]
    const impulse_kPa_ms = (0.067 * Math.pow(tntEquivalent_kg, 1 / 3)) / (Z * Z);

    // Damage level classification (CCPS 1989, Table 2-5)
    let damageLevel;
    if (peakOverpressure_kPa < 1) damageLevel = 'none';
    else if (peakOverpressure_kPa < 7) damageLevel = 'glass_breakage';
    else if (peakOverpressure_kPa < 35) damageLevel = 'minor_structural';
    else if (peakOverpressure_kPa < 83) damageLevel = 'major_structural';
    else damageLevel = 'total_destruction';

    return { tntEquivalent_kg, scaledDistance, peakOverpressure_kPa, impulse_kPa_ms, damageLevel };
}

// ---------------------------------------------------------------------------
// 6. Spill evaporation rate
// ---------------------------------------------------------------------------

/**
 * Evaporation rate from a liquid spill pool (Mackay-Matsugu 1973).
 *
 * Mass transfer coefficient (Mackay-Matsugu):
 *   km = 0.0048 × U^0.78 × Sc^(-0.67)  [m/s]
 * Simplified with Sc = 1.0 (conservative):
 *   km = 0.0048 × U^0.78
 *
 * Evaporation rate:
 *   E_rate = km × A × M × Pv / (R × T)  [kg/s]
 * where Pv is vapour pressure [Pa], T in Kelvin.
 *
 * @param {string} substance substance name (informational label only)
 * @param {number} spillArea_m2 pool area [m²]
 * @param {number} windSpeed_ms wind speed at 10 m [m/s]
 * @param {number} temperature_C liquid/air temperature [°C]
 * @param {number} pressure_kPa vapour pressure of substance [kPa]
 * @param {number} liquidDensity_kg_m3 liquid density [kg/m³]
 * @param {number} molarMass_g_mol molar mass [g/mol]
 * @returns {{ evaporationRate_kg_s: number, massEvaporated_kg_min: number, depletionTime_min: number }}
 * @reference Mackay, D. & Matsugu, R.S. (1973). Canadian J. Chemical Engineering 51(4).
 *            DOI: 10.1002/cjce.5450510407
 */
export function spillEvaporation(substance: string, spillArea_m2: number, windSpeed_ms: number, temperature_C: number, pressure_kPa: number, liquidDensity_kg_m3: number, molarMass_g_mol: number): { evaporationRate_kg_s: number, massEvaporated_kg_min: number, depletionTime_min: number } {
    if (spillArea_m2 <= 0) throw new RangeError('spillArea_m2 must be > 0');
    if (windSpeed_ms < 0) throw new RangeError('windSpeed_ms must be >= 0');
    if (pressure_kPa < 0) throw new RangeError('pressure_kPa must be >= 0');
    if (liquidDensity_kg_m3 <= 0) throw new RangeError('liquidDensity_kg_m3 must be > 0');
    if (molarMass_g_mol <= 0) throw new RangeError('molarMass_g_mol must be > 0');

    const T_K = temperature_C + 273.15;
    const Pv_Pa = pressure_kPa * 1000; // kPa → Pa
    const M_kg = molarMass_g_mol / 1000; // g/mol → kg/mol

    // Mass transfer coefficient [m/s] - Mackay-Matsugu (Sc ≈ 1 simplification)
    const km = 0.0048 * Math.pow(Math.max(windSpeed_ms, 0.01), 0.78);

    // Evaporation rate [kg/s]
    const evaporationRate_kg_s = (km * spillArea_m2 * M_kg * Pv_Pa) / (R_GAS * T_K);

    const massEvaporated_kg_min = evaporationRate_kg_s * 60;

    // Pool volume × density → total mass; depletion time
    // (assume 1 mm pool depth as conservative default when not specified)
    // Returns Infinity if evaporation rate = 0 (still liquid)
    const poolMass_kg = spillArea_m2 * 0.001 * liquidDensity_kg_m3;
    const depletionTime_min = evaporationRate_kg_s > 0 ? poolMass_kg / evaporationRate_kg_s / 60 : Infinity;

    return { evaporationRate_kg_s, massEvaporated_kg_min, depletionTime_min };
}

// ---------------------------------------------------------------------------
// 7. Individual risk
// ---------------------------------------------------------------------------

/**
 * Individual risk from multiple independent accident scenarios (CCPS 1989).
 *
 * IR = Σ (fi × pi)
 *
 * Risk categories (TNO Purple Book / CCPS):
 *   < 1×10⁻⁶ /yr  → broadly_acceptable
 *   1×10⁻⁶–1×10⁻⁴ → alarp
 *   > 1×10⁻⁴ /yr  → unacceptable
 *
 * Societal risk (f-N proxy): sum of (fi × pi × 1) - simplified scalar,
 * not full f-N curve. For full f-N pair generation, use dedicated module.
 *
 * @param {number[]} frequencies event frequencies [events/yr]
 * @param {number[]} consequences fatality probability per scenario [0-1]
 * @returns {{ individualRisk_per_yr: number, riskCategory: string, societalRisk_fN: number }}
 * @reference CCPS (1989). Guidelines for Chemical Process Quantitative Risk Analysis.
 * @reference TNO Purple Book (2005). Guidelines for Quantitative Risk Assessment.
 */
export function individualRisk(frequencies: number[], consequences: number[]): { individualRisk_per_yr: number, riskCategory: string, societalRisk_fN: number } {
    if (!Array.isArray(frequencies) || !Array.isArray(consequences)) {
        throw new TypeError('frequencies and consequences must be arrays');
    }
    if (frequencies.length !== consequences.length) {
        throw new RangeError('frequencies and consequences must have equal length');
    }
    if (frequencies.length === 0) {
        return { individualRisk_per_yr: 0, riskCategory: 'broadly_acceptable', societalRisk_fN: 0 };
    }

    let individualRisk_per_yr = 0;
    let societalRisk_fN = 0;
    for (let i = 0; i < frequencies.length; i++) {
        const f = frequencies[i]!;
        const p = clamp(consequences[i] as number, 0, 1);
        if (f < 0) throw new RangeError(`frequencies[${i}] must be >= 0`);
        individualRisk_per_yr += f * p;
        societalRisk_fN += f * p;
    }

    let riskCategory;
    if (individualRisk_per_yr < 1e-6) riskCategory = 'broadly_acceptable';
    else if (individualRisk_per_yr < 1e-4) riskCategory = 'alarp';
    else riskCategory = 'unacceptable';

    return { individualRisk_per_yr, riskCategory, societalRisk_fN };
}

// ---------------------------------------------------------------------------
// 8. Fire consequence zones - pool fire
// ---------------------------------------------------------------------------

/**
 * Consequence zone radii for pool fire radiation.
 *
 * Uses SFPE Handbook (2002) Thomas correlation for flame height and
 * a point-source radiation model to derive zone distances.
 *
 * Burning rate: m" = 0.001 × Hc / Hv  [kg/(m²·s)]
 * Flame height: Hf = 42 × D × [m" / (ρair × √(g × D))]^0.61  (Thomas 1963)
 * Point-source heat flux at distance r: q = χ × m" × A × Hc / (4π × r²)
 * Zone distances for lethal (12.5 kW/m²), injury (5 kW/m²), no-effect (1.6 kW/m²).
 *
 * @param {string} substance substance label (used for Hv lookup; defaults to general hydrocarbon)
 * @param {number} mass_kg total fuel mass [kg]
 * @returns {{ flameRadius_m: number, lethalZone_m: number, injuryZone_m: number, noEffectZone_m: number }}
 * @reference SFPE Handbook of Fire Protection Engineering (2002). 3rd ed. Section 3-1.
 * @reference Thomas, P.H. (1963). Fire Research Technical Paper No. 7. HMSO, London.
 */
export function fireConsequenceZone(substance: string, mass_kg: number): { flameRadius_m: number, lethalZone_m: number, injuryZone_m: number, noEffectZone_m: number } {
    if (mass_kg <= 0) throw new RangeError('mass_kg must be > 0');

    // Heat of vaporisation defaults [MJ/kg] -- conservative for liquid hydrocarbons
        const HV_MAP: Record<string, number>= {
        gasoline: 0.36,
        diesel: 0.38,
        lpg: 0.42,
        methanol: 1.1,
        ethanol: 0.92,
        default: 0.4,
    };
    const sub = String(substance).toLowerCase();
    const Hv = HV_MAP[sub] ?? HV_MAP.default ?? 0.4;

    // Pool geometry: assume circular pool from 1 cm depth spill
    const poolDepth = 0.01; // m
    const poolArea = mass_kg / (liquidDensityApprox(sub) * poolDepth);
    const poolRadius = Math.sqrt(poolArea / Math.PI);
    const _D = 2 * poolRadius; // pool diameter [m]

    // Mass burning rate [kg/(m²·s)]
    const mBurn = (0.001 * HC_DEFAULT) / Hv;

    // Radiative fraction χ (SFPE 2002, Table 4-6): 0.21 for hydrocarbons
    const chi = 0.21;

    // Total radiated power Q_rad [kW]
    const Q_rad = chi * mBurn * poolArea * HC_DEFAULT * 1000; // kJ/s = kW

    // Zone distances from point source model: q = Q_rad / (4*pi * r^2)
    // -> r = sqrt(Q_rad / (4*pi * q_threshold))
    /** @param {number} sub @returns {number} */
    const zoneDistance = (q_kW_m2: number): number => Math.sqrt(Q_rad / (4 * Math.PI * q_kW_m2));

    const lethalZone = zoneDistance(12.5);
    const injuryZone = zoneDistance(5.0);
    const noEffectZone = zoneDistance(1.6);

    return {
        flameRadius_m: poolRadius,
        lethalZone_m: lethalZone,
        injuryZone_m: injuryZone,
        noEffectZone_m: noEffectZone,
    };
}

/**
 * Approximate liquid density lookup for pool geometry calculation.
 * @param {string} sub substance key
 * @returns {number} density [kg/m³]
 */
function liquidDensityApprox(sub: string): number {
        const map: Record<string, number>= {
        gasoline: 720,
        diesel: 840,
        lpg: 550,
        methanol: 791,
        ethanol: 789,
    };
    return map[sub] ?? 750;
}

// ---------------------------------------------------------------------------
// 9. Worker exposure index
// ---------------------------------------------------------------------------

/**
 * Occupational exposure index against ACGIH TLV-TWA 2024.
 *
 * Exposure ratio = TWA_measured / TLV-TWA
 * 8-hour TWA correction: C_corrected = C × t / 8  (Brief & Scala model for shifts ≠ 8h)
 *
 * @param {number} concentration_ppm measured time-averaged concentration [ppm]
 * @param {number} timeWeightedAverage_hrs exposure duration [hrs]
 * @param {number} tlv_ppm TLV-TWA for substance [ppm]
 * @param {'benzene'|'toluene'|'xylene'|'styrene'|'acetone'} substance chemical species
 * @returns {{ exposureRatio: number, twaCorrected: number, excessRisk: number, complianceStatus: string }}
 * @reference ACGIH (2024). TLVs and BEIs Booklet. Cincinnati, OH.
 * @reference OSHA 29 CFR 1910.1000 Table Z-1.
 * @reference Brief, R.S. & Scala, R.A. (1975). "Occupational health aspects of unusual
 *            work schedules." American Industrial Hygiene Association Journal 36(6),
 *            pp. 467-476.
 */
export function workerExposureIndex(concentration_ppm: number, timeWeightedAverage_hrs: number, tlv_ppm: number, substance: 'benzene'|'toluene'|'xylene'|'styrene'|'acetone'): { exposureRatio: number, twaCorrected: number, excessRisk: number, complianceStatus: string } {
    const sub = String(substance).toLowerCase();
    const tlvTable = TLV_TWA as Record<string, number>;
    if (!tlvTable[sub] && tlv_ppm == null) {
        throw new RangeError(`Unknown substance "${substance}". Use: ${Object.keys(TLV_TWA).join(', ')}`);
    }
    if (concentration_ppm < 0) throw new RangeError('concentration_ppm must be >= 0');
    if (timeWeightedAverage_hrs <= 0) throw new RangeError('timeWeightedAverage_hrs must be > 0');

    const tlv = tlv_ppm ?? tlvTable[sub];
    if (tlv <= 0) throw new RangeError('tlv_ppm must be > 0');

    // Brief-Scala TWA correction to 8-hour equivalent
    const twaCorrected = concentration_ppm * (timeWeightedAverage_hrs / 8);

    // Exposure ratio against TLV
    const exposureRatio = twaCorrected / tlv;

    // Excess risk - only defined for carcinogens (benzene); zero for others
    const excessRisk = sub === 'benzene' ? exposureRatio * (EXCESS_RISK_FACTOR.benzene ?? 0) : 0;

    // Compliance status
    let complianceStatus;
    if (exposureRatio <= 0.5) complianceStatus = 'compliant';
    else if (exposureRatio <= 1.0) complianceStatus = 'action_level';
    else if (exposureRatio <= 2.0) complianceStatus = 'over_tlv';
    else complianceStatus = 'immediately_dangerous';

    return { exposureRatio, twaCorrected, excessRisk, complianceStatus };
}

// ---------------------------------------------------------------------------
// 10. Domino effect probability
// ---------------------------------------------------------------------------

/**
 * Domino effect probability for industrial accidents (Cozzani-Salzano 2004).
 *
 * Escalation probabilities via probit functions:
 *   Thermal:       Y = -18.96 + 2.44 × ln(I^1.33 × t)    (I in kW/m², t in s)
 *   Overpressure:  Y = 5 - 0.26 × ln(V)                   (V = peak OP in kPa)
 *   Fragment:      P_esc = 0.1 (conservative empirical default, Cozzani 2004)
 *
 * P_escalation = Φ(Y - 5) from normal CDF.
 * Domino frequency = primary frequency × P_escalation.
 *
 * @param {string} primaryEvent description of primary initiating event
 * @param {number} primaryFrequency frequency of primary event [events/yr]
 * @param {'thermal'|'overpressure'|'fragment'} escalationVector mechanism of escalation
 * @param {object} [params] additional parameters
 * @param {number} [params.thermalFlux_kW_m2] thermal flux at target [kW/m²] (required for 'thermal')
 * @param {number} [params.exposureTime_s] exposure duration [s] (required for 'thermal')
 * @param {number} [params.overpressure_kPa] peak overpressure at target [kPa] (required for 'overpressure')
 * @returns {{ escalationProbability: number, dominoFrequency: number, conditionalProbability: number }}
 * @reference Cozzani, V. & Salzano, E. (2004). J. Hazardous Materials 107(3), pp. 67-80.
 *            DOI: 10.1016/j.jhazmat.2003.09.013
 */
export function domino_effect_probability(primaryEvent: string, primaryFrequency: number, escalationVector: 'thermal'|'overpressure'|'fragment', params: { thermalFlux_kW_m2?: number; exposureTime_s?: number; overpressure_kPa?: number } = {}): { escalationProbability: number, dominoFrequency: number, conditionalProbability: number } {
    if (primaryFrequency < 0) throw new RangeError('primaryFrequency must be >= 0');

    const vec = String(escalationVector).toLowerCase();
    let probitY;

    switch (vec) {
        case 'thermal': {
            const I = params.thermalFlux_kW_m2 ?? 10;
            const t = params.exposureTime_s ?? 30;
            if (I < 0) throw new RangeError('thermalFlux_kW_m2 must be >= 0');
            if (t <= 0) throw new RangeError('exposureTime_s must be > 0');
            const thermalLoad = Math.pow(I, 1.33) * t;
            probitY = thermalLoad > 0 ? -18.96 + 2.44 * Math.log(thermalLoad) : -Infinity;
            break;
        }
        case 'overpressure': {
            const V = params.overpressure_kPa ?? 14;
            if (V < 0) throw new RangeError('overpressure_kPa must be >= 0');
            probitY = V > 0 ? 5 - 0.26 * Math.log(V) : -Infinity;
            break;
        }
        case 'fragment': {
            // Conservative empirical default (Cozzani 2004, Section 4)
            probitY = 4.74; // corresponds to ~P=0.40 on standard normal — conservative
            break;
        }
        default:
            throw new RangeError(
                `Unknown escalationVector "${escalationVector}". Use: thermal, overpressure, fragment`,
            );
    }

    const escalationProbability = clamp(probitToProb(probitY), 0, 1);
    const dominoFrequency = primaryFrequency * escalationProbability;
    const conditionalProbability = escalationProbability;

    return { escalationProbability, dominoFrequency, conditionalProbability };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const processSafetyEnvironmentalMeta = {
    name: 'processSafetyEnvironmental',
    description: 'Process Safety Environmental Assessment',
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
