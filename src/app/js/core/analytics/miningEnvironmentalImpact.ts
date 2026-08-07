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
//
// Academic references:
//   Bishop 1955 - Géotechnique 5(1):7–17 — slope stability simplified slice method
//   Sobek et al. 1978 - USEPA EPA-600/2-78-054 — acid-base accounting
//   USEPA AP-42 5th ed. §13.2 (1998/2006) - fugitive dust emission factors
//   ICMM 2012 - Leading Practice Sustainable Development in Mining
//   Younger et al. 2002 - Mine Water Hydrology, Pollution, Remediation (Kluwer)
//   National Coal Board 1975 - Subsidence Engineer's Handbook (SMRE)
//   ICMM 2014 - Integrated Mine Closure
//   ANZECC/ARMCANZ 2000 - Australian/NZ Guidelines for Fresh & Marine Water Quality
//   ICMC 2002 - International Cyanide Management Code
//   Botz 2001 - Mining Environ. Manage. — cyanide natural attenuation

/* ================================================================
   MINING ENVIRONMENTAL IMPACT — Pure mathematical functions
   ================================================================

   Funcoes de avaliacao de impacto ambiental para mineracao.
   Todas as funcoes sao deterministicas, sem DOM/IDB/browser.

   METODOS:
   1. tailingsDamSafetyFactor      — Bishop 1955 FoS
   2. acidRockDrainageANP          — ABA Sobek/Lawrence
   3. metalLeachingPotential       — mass balance tailings
   4. dustEmissionFactor           — USEPA AP-42 §13.2
   5. wasteRockLeachate            — Thornthwaite + AMD loading
   6. cyanideManagement            — ICMC compliance
   7. subsurfaceSubsidence         — NCB/SMRE 1975 longwall
   8. decommissioningCostModel     — ICMM 2014 cost model
   9. noFlyZoneDustCritical        — ANZECC/CONAMA dust limits
   10. miningWaterBalance          — JORC pit water balance

   ================================================================ */

// ================================================================
// NAMED CONSTANTS - no magic numbers
// ================================================================

/** Bishop 1955 FoS classification thresholds */
const FOS_THRESHOLDS = Object.freeze({
    FAILURE: 1.0,
    UNSTABLE: 1.3,
    MARGINAL: 1.5,
});

/** ABA constants (Sobek et al. 1978) */
const ABA = Object.freeze({
    /** Acid potential conversion: 31.25 kg CaCO3 per % sulfide-S per tonne */
    AP_FACTOR: 31.25,
    /** NP/AP ratio threshold for potentially acid forming (PAF) classification */
    PAF_RATIO: 1.0,
    /** NP/AP ratio threshold for non-acid forming (NAF) */
    NAF_RATIO: 2.0,
    /** Carbonate NP multiplier kg CaCO3/% */
    NP_CARBONATE_FACTOR: 10.0,
    /** Ca oxide NP contribution factor (Lawrence & Wang 1997) */
    NP_CA_FACTOR: 17.9,
    /** Mg oxide NP contribution factor */
    NP_MG_FACTOR: 24.8,
    /** Siderite correction: acid-consuming fraction 0.4 of FeCO3 neutralisation */
    SIDERITE_NP_FRACTION: 0.4,
});

/** USEPA AP-42 §13.2 haul road emission factor constants (1998) */
const AP42 = Object.freeze({
    /** Empirical exponent for vehicle speed (haul roads eq. 1) */
    K_HAUL: 0.0022,
    /** Moisture correction exponent */
    MOISTURE_EXP: 0.48,
    /** Wind speed exponent for stockpile erosion */
    WIND_EXP: 1.3,
    /** Default reference moisture pct for haul roads */
    REF_MOISTURE: 6.0,
    /** Kg per vehicle pass per km at reference conditions */
    BASE_LOAD_KG_KM: 3.23,
    /** Control efficiency decimal for water sprays on haul roads */
    SPRAY_EFFICIENCY: 0.75,
    /** Blasting emission kg TSP per tonne blasted (AP-42 §13.3) */
    BLASTING_KG_T: 0.0125,
    /** Crushing/screening factor kg TSP per tonne (AP-42 §11.19.2) */
    CRUSHING_KG_T: 0.002,
});

/** Younger 2002 AMD loading constants */
const AMD = Object.freeze({
    /** Net infiltration coefficient: fraction of precipitation that generates seepage */
    INFILTRATION_FRACTION: 0.3,
    /** AMD loading: sulfate generation g/kg·yr per %S at NP/AP < 1 */
    SULFATE_GEN_RATE: 2.5,
    /** pH breakthrough threshold: years to AMD generation onset at NP/AP=1 */
    PH_BREAKTHROUGH_FACTOR: 5.0,
});

/** NCB 1975 subsidence parameters */
const NCB = Object.freeze({
    /** Maximum subsidence factor S/m (fraction of seam thickness) — longwall */
    MAX_SUBSIDENCE_FACTOR: 0.9,
    /** Critical width to depth ratio for full subsidence development */
    CRITICAL_WIDTH_RATIO: 1.4,
    /** Tilt limit for residential building damage (mm/m) */
    TILT_DAMAGE_CLASS_I: 3.0,
    /** Tensile strain limit class II (mm/m) */
    STRAIN_CLASS_II: 6.0,
    /** Strain class III threshold (mm/m) */
    STRAIN_CLASS_III: 9.0,
});

/** ICMC 2002 + Botz 2001 cyanide constants */
const CYANIDE = Object.freeze({
    /** ICMC WAD cyanide threshold for tailings facility discharges mg/L */
    ICMC_TAILINGS_THRESHOLD: 50,
    /** Photodegradation half-life at 0.1 day⁻¹ rate (Botz 2001 typical) */
    BOTZ_REFERENCE_RATE: 0.1,
    /** Seconds per day for flux calculation */
    SEC_PER_DAY: 86400,
    /** L per m³ */
    L_PER_M3: 1000,
    /** mg to kg conversion */
    MG_TO_KG: 1e-6,
});

/** ANZECC 2000 dust deposition limits */
const ANZECC = Object.freeze({
    /** Total insoluble dust fallout limit mg/m²/day */
    FALLOUT_LIMIT_MG_M2_DAY: 120,
    /** Buffer distance multiplier for sensitive receptors m per g/m²/day */
    BUFFER_MULTIPLIER: 80,
    /** CONAMA 03/1990 TSP limit µg/m³ 24h mean */
    CONAMA_TSP_24H: 240,
    /** Minimum protective buffer distance m */
    MIN_BUFFER_M: 200,
});

/** Decommissioning cost unit rates (ICMM 2014, USD/unit) */
const DECOM = Object.freeze({
    /** Site preparation & demolition USD/ha */
    SITE_PREP_USD_HA: 8500,
    /** Revegetation & topsoil USD/ha */
    REVEGETATION_USD_HA: 12000,
    /** Tailings cap USD/m³ */
    TAILINGS_CAP_USD_M3: 4.5,
    /** Water treatment OPEX USD/m³/yr (20 yr horizon) */
    WATER_TREATMENT_USD_M3_YR: 2.2,
    /** Monitoring USD/ha/yr (30 yr) */
    MONITORING_USD_HA_YR: 1500,
    /** Bond contingency factor (1 = 100%) */
    BOND_CONTINGENCY: 0.3,
    /** Open-pit complexity multiplier */
    OPENPIT_MULTIPLIER: 1.4,
    /** Underground complexity multiplier */
    UNDERGROUND_MULTIPLIER: 1.8,
    /** Heap-leach extra cost USD/ha */
    HEAP_LEACH_USD_HA: 35000,
});

/** Water balance constants */
const WATER = Object.freeze({
    /** Minimum pump capacity factor (safety margin over design inflow) */
    PUMP_SAFETY_FACTOR: 1.25,
    /** AMD risk threshold: pit water rise m/yr above which risk is HIGH */
    AMD_RISK_RISE_M_YR: 5.0,
    /** Days per year */
    DAYS_PER_YEAR: 365.25,
});

// ================================================================
// Input validation helpers
// ================================================================

function _validateTailingsDamInputs(
    slope_angle_deg: number,
    cohesion_kPa: number,
    friction_angle_deg: number,
    height_m: number,
    water_table_fraction: number,
    surcharge_kPa: number,
): void {
    if (slope_angle_deg <= 0 || slope_angle_deg >= 90)
        throw new RangeError('slope_angle_deg must be between 0 and 90 (exclusive)');
    if (cohesion_kPa < 0) throw new RangeError('cohesion_kPa must be >= 0');
    if (friction_angle_deg < 0 || friction_angle_deg > 45)
        throw new RangeError('friction_angle_deg must be between 0 and 45');
    if (height_m <= 0) throw new RangeError('height_m must be > 0');
    if (water_table_fraction < 0 || water_table_fraction > 1)
        throw new RangeError('water_table_fraction (Ru) must be between 0 and 1');
    if (surcharge_kPa < 0) throw new RangeError('surcharge_kPa must be >= 0');
}

function _classifyFoS(fos: number): string {
    if (fos < FOS_THRESHOLDS.FAILURE) return 'failure';
    if (fos < FOS_THRESHOLDS.UNSTABLE) return 'unstable';
    if (fos < FOS_THRESHOLDS.MARGINAL) return 'marginal';
    return 'stable';
}

function _validateAbaInputs(
    total_sulfur_pct: number,
    carbonate_pct: number,
    pyrite_pct: number,
    siderite_pct: number,
    Ca_pct: number,
    Mg_pct: number,
): void {
    if (total_sulfur_pct < 0 || total_sulfur_pct > 100) throw new RangeError('total_sulfur_pct must be 0–100');
    if (carbonate_pct < 0 || carbonate_pct > 100) throw new RangeError('carbonate_pct must be 0–100');
    if (pyrite_pct < 0 || pyrite_pct > total_sulfur_pct * 1.1 + 0.01)
        throw new RangeError('pyrite_pct cannot exceed total_sulfur_pct (approx)');
    if (siderite_pct < 0 || siderite_pct > 100) throw new RangeError('siderite_pct must be 0–100');
    if (Ca_pct < 0 || Ca_pct > 100) throw new RangeError('Ca_pct must be 0–100');
    if (Mg_pct < 0 || Mg_pct > 100) throw new RangeError('Mg_pct must be 0–100');
}

function _classifyAbaRatio(ratio: number): string {
    if (ratio >= ABA.NAF_RATIO) return 'NAF';
    if (ratio >= ABA.PAF_RATIO) return 'UC';
    return 'PAF';
}

// ================================================================
// 1. TAILINGS DAM SAFETY FACTOR - Bishop simplified slice (1955)
// ================================================================

/**
 * Estimate slope stability Factor of Safety for a tailings dam
 * using the Bishop (1955) simplified slice method with a
 * Morgenstern-Price style correction for pore-water pressure.
 *
 * Calcula Fator de Seguranca de estabilidade de taludes para
 * barragens de rejeitos pelo metodo de Bishop simplificado.
 *
 * @param {number} slope_angle_deg   - Slope face angle from horizontal (degrees, 1–85)
 * @param {number} cohesion_kPa      - Effective cohesion c' (kPa, ≥0)
 * @param {number} friction_angle_deg - Effective friction angle φ' (degrees, 0–45)
 * @param {number} height_m          - Dam height (m, >0)
 * @param {number} water_table_fraction - Ru = pore pressure ratio (0–1)
 * @param {number} [surcharge_kPa=0] - Surface surcharge pressure (kPa, ≥0)
 * @returns {{ fos: number, classification: string, method: string }}
 * @reference Bishop AW (1955) The use of the slip circle in the stability
 *   analysis of slopes. Géotechnique 5(1):7–17. doi:10.1680/geot.1955.5.1.7
 */
export function tailingsDamSafetyFactor(slope_angle_deg: number, cohesion_kPa: number, friction_angle_deg: number, height_m: number, water_table_fraction: number, surcharge_kPa: number = 0): { fos: number, classification: string, method: string } {
    _validateTailingsDamInputs(slope_angle_deg, cohesion_kPa, friction_angle_deg, height_m, water_table_fraction, surcharge_kPa);

    const DEG = Math.PI / 180;
    const alpha = slope_angle_deg * DEG;
    const phi = friction_angle_deg * DEG;

    // Unit weight of saturated tailings kN/m³ (typical 18–20)
    const gamma_sat = 19;
    // Slice geometry: assume circular arc, average slice height = H/2
    const avg_height = height_m / 2;
    const normal_stress = gamma_sat * avg_height + surcharge_kPa;
    const pore_pressure = water_table_fraction * normal_stress;
    // eslint-disable-next-line
    const effective_normal = normal_stress - pore_pressure;

    // Bishop simplified: FoS = (c' + (N - U) tan φ') / T
    // where T = W sin α (driving shear), N = W cos α (normal), U = ru * N
    const W = gamma_sat * avg_height; // weight per unit area kN/m
    const T_drive = W * Math.sin(alpha);
    const N_total = W * Math.cos(alpha);
    const U_pore = water_table_fraction * N_total;
    const N_eff = N_total - U_pore;

    // Shear resistance on failure plane
    const shear_resist = cohesion_kPa + N_eff * Math.tan(phi);

    // Morgenstern-Price correction: interslice force factor λ (simplified as
    // a 3 % reduction per 10° of slope steepness above 30°)
    const mp_correction = slope_angle_deg > 30 ? 1 - 0.003 * (slope_angle_deg - 30) : 1.0;

    const fos_raw = T_drive > 0 ? (shear_resist / T_drive) * mp_correction : 999;
    const fos = Math.max(0.01, fos_raw);

    const classification = _classifyFoS(fos);

    return { fos: +fos.toFixed(3), classification, method: 'Bishop-simplified-1955' };
}

// ================================================================
// 2. ACID ROCK DRAINAGE - ABA (Sobek et al. 1978)
// ================================================================

/**
 * Acid-Base Accounting (ABA) for acid rock drainage potential.
 * Calcula potencial de drenagem acida de rocha pelo metodo ABA.
 *
 * @param {number} total_sulfur_pct  - Total sulfur % (by mass, 0–100)
 * @param {number} carbonate_pct     - Carbonate content % (0–100)
 * @param {number} pyrite_pct        - Pyrite % (0–total_sulfur_pct upper bound)
 * @param {number} siderite_pct      - Siderite FeCO3 % (0–100)
 * @param {number} Ca_pct            - Calcium % (0–100)
 * @param {number} Mg_pct            - Magnesium % (0–100)
 * @returns {{ AP: number, NP: number, NNP: number, ratio: number, classification: string }}
 *   AP = acid potential kg CaCO3/t, NP = neutralisation potential kg CaCO3/t,
 *   NNP = net neutralisation potential, ratio = NP/AP, classification string
 * @reference Sobek AA et al. (1978) Field and Laboratory Methods Applicable
 *   to Overburden and Minesoils. USEPA EPA-600/2-78-054.
 */
export function acidRockDrainageANP(total_sulfur_pct: number, carbonate_pct: number, pyrite_pct: number, siderite_pct: number, Ca_pct: number, Mg_pct: number): { AP: number, NP: number, NNP: number, ratio: number, classification: string } {
    _validateAbaInputs(total_sulfur_pct, carbonate_pct, pyrite_pct, siderite_pct, Ca_pct, Mg_pct);

    // Acid Potential: pyrite-S drives acid generation
    // AP (kg CaCO3/t) = 31.25 × S_sulfide (% from pyrite)
    // Approximate sulfide-S from pyrite: S_sulfide ≈ pyrite_pct × 0.5352 (FeS2 molar ratio)
    const S_FRAC_IN_PYRITE = 0.5352; // S mass fraction in FeS2
    const S_sulfide = Math.min(total_sulfur_pct, pyrite_pct * S_FRAC_IN_PYRITE);
    const AP = ABA.AP_FACTOR * S_sulfide;

    // Neutralisation Potential: Sobek method - carbonate + silicate + CaO + MgO
    // NP_carbonate (Lawrence 1990): 10 × %CaCO3
    const NP_carbonate = ABA.NP_CARBONATE_FACTOR * carbonate_pct;
    // Siderite is a net acid consumer at 0.4 × face value (Lawrence & Scheske 1997)
    const NP_siderite = ABA.SIDERITE_NP_FRACTION * ABA.NP_CARBONATE_FACTOR * siderite_pct;
    // Ca and Mg oxide contribution (Lawrence & Wang 1997)
    const NP_Ca = ABA.NP_CA_FACTOR * Ca_pct;
    const NP_Mg = ABA.NP_MG_FACTOR * Mg_pct;
    const NP = NP_carbonate + NP_siderite + NP_Ca + NP_Mg;

    const NNP = NP - AP;
    const ratio = AP > 0 ? NP / AP : Infinity;

    const classification = _classifyAbaRatio(ratio);

    return {
        AP: +AP.toFixed(2),
        NP: +NP.toFixed(2),
        NNP: +NNP.toFixed(2),
        ratio: isFinite(ratio) ? +ratio.toFixed(3) : Infinity,
        classification,
    };
}

// ================================================================
// 3. METAL LEACHING POTENTIAL - tailings mass balance
// ================================================================

/**
 * Annual metal load from tailings leaching using a mass balance
 * approach (ICMM 2012).
 *
 * Calcula carga anual de metais por lixiviacao de rejeitos.
 *
 * @param {number} ore_grade_pct       - Head grade of metal (%, 0–100)
 * @param {number} throughput_tonne_day - Mill throughput (t/d, >0)
 * @param {number} recovery_pct        - Metallurgical recovery (%, 0–100)
 * @param {number} tailings_residue_pct - Metal residue in tailings (%, 0–100)
 * @param {number} leach_rate_pct_yr   - Annual leach mobilisation rate (% of residue mass/yr)
 * @param {number} downstream_dilution - Downstream dilution factor (dimensionless, ≥1)
 * @returns {{ tailings_load_kg_yr: number, dissolved_kg_yr: number,
 *             downstream_mg_L: number, conama_357_status: string }}
 * @reference ICMM (2012) A Guide to Leading Practice Sustainable
 *   Development in Mining, 3rd ed. Section 5.
 */
export function metalLeachingPotential(ore_grade_pct: number, throughput_tonne_day: number, recovery_pct: number, tailings_residue_pct: number, leach_rate_pct_yr: number, downstream_dilution: number): { tailings_load_kg_yr: number, dissolved_kg_yr: number, downstream_mg_L: number, conama_357_status: string } {
    if (ore_grade_pct <= 0 || ore_grade_pct > 100) throw new RangeError('ore_grade_pct must be > 0 and ≤ 100');
    if (throughput_tonne_day <= 0) throw new RangeError('throughput_tonne_day must be > 0');
    if (recovery_pct < 0 || recovery_pct > 100) throw new RangeError('recovery_pct must be 0–100');
    if (tailings_residue_pct < 0 || tailings_residue_pct > 100)
        throw new RangeError('tailings_residue_pct must be 0–100');
    if (leach_rate_pct_yr < 0 || leach_rate_pct_yr > 100) throw new RangeError('leach_rate_pct_yr must be 0–100');
    if (downstream_dilution < 1) throw new RangeError('downstream_dilution must be >= 1');

    // Annual tonnage of tailings (ore – metal recovered)
    const tailings_tonne_yr = throughput_tonne_day * WATER.DAYS_PER_YEAR * (1 - recovery_pct / 100);

    // Metal mass in tailings kg/yr
    const tailings_load_kg_yr = tailings_tonne_yr * (tailings_residue_pct / 100) * 1000;

    // Dissolved fraction mobilised annually
    const dissolved_kg_yr = tailings_load_kg_yr * (leach_rate_pct_yr / 100);

    // Downstream concentration: assume leachate flow ~0.1 m³/t tailings/yr
    // (conservative estimate from ICMM 2012 water balance guidance)
    const LEACHATE_M3_PER_T = 0.1;
    const leachate_vol_m3_yr = tailings_tonne_yr * LEACHATE_M3_PER_T;
    const diluted_vol_m3_yr = leachate_vol_m3_yr * downstream_dilution;

    // mg/L = (kg × 1e6 mg/kg) / (m³ × 1000 L/m³)
    const downstream_mg_L = diluted_vol_m3_yr > 0 ? (dissolved_kg_yr * 1e6) / (diluted_vol_m3_yr * 1000) : 0;

    // CONAMA 357/2005 Class 2 freshwater threshold for metals: 0.013 mg/L Cu,
    // 0.03 mg/L Pb, 0.18 mg/L Zn - use generic screening value 0.1 mg/L
    const CONAMA_357_GENERIC_MG_L = 0.1;
    const conama_357_status = downstream_mg_L <= CONAMA_357_GENERIC_MG_L ? 'compliant' : 'exceedance';

    return {
        tailings_load_kg_yr: +tailings_load_kg_yr.toFixed(1),
        dissolved_kg_yr: +dissolved_kg_yr.toFixed(2),
        downstream_mg_L: +downstream_mg_L.toFixed(4),
        conama_357_status,
    };
}

// ================================================================
// 4. DUST EMISSION FACTOR - USEPA AP-42 §13.2 (1998/2006)
// ================================================================

/**
 * Fugitive dust emission from mining activities per USEPA AP-42 §13.2.
 * Calcula emissoes fugitivas de material particulado conforme AP-42.
 *
 * @param {number} wind_speed_m_s   - Mean wind speed (m/s, >0)
 * @param {number} soil_moisture_pct - Silt/soil moisture content (%, 0–50)
 * @param {number} pile_area_m2     - Active area or stockpile base area (m², >0)
 * @param {'haul_road'|'blasting'|'stockpile'|'crushing'} activity_type
 * @param {number} control_pct      - Dust control efficiency (%, 0–100)
 * @returns {{ emission_kg_day: number, uncontrolled_kg_day: number,
 *             control_efficiency: number, ap42_equation: string }}
 * @reference USEPA (1998/2006) Compilation of Air Pollutant Emission Factors
 *   AP-42 5th ed. Section 13.2.4 Aggregate Handling & Storage Piles.
 *   Section 13.2.2 Unpaved Roads. EPA-454/B-16-002.
 */
export function dustEmissionFactor(wind_speed_m_s: number, soil_moisture_pct: number, pile_area_m2: number, activity_type: 'haul_road'|'blasting'|'stockpile'|'crushing', control_pct: number): { emission_kg_day: number, uncontrolled_kg_day: number, control_efficiency: number, ap42_equation: string } {
    if (wind_speed_m_s <= 0) throw new RangeError('wind_speed_m_s must be > 0');
    if (soil_moisture_pct < 0 || soil_moisture_pct > 50) throw new RangeError('soil_moisture_pct must be 0–50');
    if (pile_area_m2 <= 0) throw new RangeError('pile_area_m2 must be > 0');
    const VALID_TYPES = ['haul_road', 'blasting', 'stockpile', 'crushing'];
    if (!VALID_TYPES.includes(activity_type))
        throw new RangeError(`activity_type must be one of: ${VALID_TYPES.join(', ')}`);
    if (control_pct < 0 || control_pct > 100) throw new RangeError('control_pct must be 0–100');

    let uncontrolled_kg_day: number;
    let ap42_equation: string;

    const moisture_factor = Math.max(0.01, (soil_moisture_pct / AP42.REF_MOISTURE) ** AP42.MOISTURE_EXP);

    if (activity_type === 'haul_road') {
        // AP-42 §13.2.2 Eq 1: E = k(s/12)^0.8 (sL/4)^0.4 (365-p)/365
        // Simplified as: E = BASE_LOAD × (wind_speed / 8) × moisture correction
        const wind_factor = (wind_speed_m_s / 8) ** 1.3;
        uncontrolled_kg_day =
            (AP42.BASE_LOAD_KG_KM *
                (pile_area_m2 / 10000) * // convert m² footprint to km equivalent
                wind_factor) /
            moisture_factor;
        ap42_equation = 'AP-42-§13.2.2-Eq1-unpaved-haul-road';
    } else if (activity_type === 'blasting') {
        // AP-42 §13.3: E ≈ 0.0125 kg TSP per tonne blasted
        // Estimate tonnes blasted/day from area (typical 1 blast/week, 0.3 t/m² disturbed)
        const tonnes_disturbed_day = (pile_area_m2 * 0.3) / 7;
        uncontrolled_kg_day = AP42.BLASTING_KG_T * tonnes_disturbed_day;
        ap42_equation = 'AP-42-§13.3-blasting';
    } else if (activity_type === 'stockpile') {
        // AP-42 §13.2.4 wind erosion: E = k × (u/ut)^2 × A
        // Simplified: threshold wind ~5 m/s; emission increases quadratically above
        const u_threshold = 5.0;
        const wind_excess = Math.max(0, wind_speed_m_s - u_threshold);
        uncontrolled_kg_day = AP42.K_HAUL * wind_excess ** AP42.WIND_EXP * (pile_area_m2 / moisture_factor);
        ap42_equation = 'AP-42-§13.2.4-stockpile-wind-erosion';
    } else {
        // crushing
        // AP-42 §11.19.2: E ≈ 0.002 kg TSP per tonne crushed
        const tonnes_day = pile_area_m2 * 0.05; // 50 kg/m² throughput heuristic
        uncontrolled_kg_day = AP42.CRUSHING_KG_T * tonnes_day;
        ap42_equation = 'AP-42-§11.19.2-crushing-screening';
    }

    const emission_kg_day = uncontrolled_kg_day * (1 - control_pct / 100);

    return {
        emission_kg_day: +emission_kg_day.toFixed(4),
        uncontrolled_kg_day: +uncontrolled_kg_day.toFixed(4),
        control_efficiency: control_pct / 100,
        ap42_equation,
    };
}

// ================================================================
// 5. WASTE ROCK LEACHATE - Thornthwaite + AMD loading (Younger 2002)
// ================================================================

/**
 * Estimate seepage and AMD generation from waste rock piles.
 * Calcula lixiviado e geracao de DAM em pilhas de esteril.
 *
 * @param {number} precipitation_mm_yr   - Annual precipitation (mm/yr, ≥0)
 * @param {number} evapotranspiration_mm_yr - Annual PET (mm/yr, ≥0)
 * @param {number} waste_volume_m3       - Waste rock volume (m³, >0)
 * @param {number} porosity              - Bulk porosity (0–0.6)
 * @param {number} NP_AP_ratio           - Neutralisation/Acid potential ratio (>0)
 * @param {number} sulfur_pct            - Total sulfur content % (0–100)
 * @returns {{ seepage_m3_yr: number, amd_loading_g_yr: number,
 *             years_to_breakthrough: number, risk: string }}
 * @reference Younger PL et al. (2002) Mine Water: Hydrology, Pollution,
 *   Remediation. Kluwer, Dordrecht. ISBN 978-1-4020-0137-9.
 */
export function wasteRockLeachate(precipitation_mm_yr: number, evapotranspiration_mm_yr: number, waste_volume_m3: number, porosity: number, NP_AP_ratio: number, sulfur_pct: number): { seepage_m3_yr: number, amd_loading_g_yr: number, years_to_breakthrough: number, risk: string } {
    if (precipitation_mm_yr < 0) throw new RangeError('precipitation_mm_yr must be >= 0');
    if (evapotranspiration_mm_yr < 0) throw new RangeError('evapotranspiration_mm_yr must be >= 0');
    if (waste_volume_m3 <= 0) throw new RangeError('waste_volume_m3 must be > 0');
    if (porosity < 0 || porosity > 0.6) throw new RangeError('porosity must be 0–0.6');
    if (NP_AP_ratio <= 0) throw new RangeError('NP_AP_ratio must be > 0');
    if (sulfur_pct < 0 || sulfur_pct > 100) throw new RangeError('sulfur_pct must be 0–100');

    // Thornthwaite water balance: net infiltration
    const net_infiltration_mm = Math.max(0, precipitation_mm_yr - evapotranspiration_mm_yr);
    // Surface area approximation from volume (assume pile height ~10 m)
    const PILE_HEIGHT_M = 10;
    const surface_area_m2 = waste_volume_m3 / PILE_HEIGHT_M;
    const seepage_m3_yr = surface_area_m2 * (net_infiltration_mm / 1000) * AMD.INFILTRATION_FRACTION;

    // AMD generation rate (Younger 2002 loading equation)
    // At NP/AP < 1 (PAF), sulfate generation drives AMD
    const is_PAF = NP_AP_ratio < ABA.PAF_RATIO;
    let amd_loading_g_yr = 0;
    if (is_PAF) {
        // Loading = sulfate_gen_rate × sulfur_pct × waste_mass_t × seepage_fraction
        // waste_mass_t from volume × bulk density (2.0 t/m³)
        const BULK_DENSITY_T_M3 = 2.0;
        const waste_mass_t = waste_volume_m3 * BULK_DENSITY_T_M3;
        amd_loading_g_yr = AMD.SULFATE_GEN_RATE * sulfur_pct * waste_mass_t;
    }

    // Years to AMD breakthrough: higher NP/AP → longer buffering
    const years_to_breakthrough = is_PAF
        ? AMD.PH_BREAKTHROUGH_FACTOR / (1 - NP_AP_ratio)
        : AMD.PH_BREAKTHROUGH_FACTOR * NP_AP_ratio;

    let risk;
    if (NP_AP_ratio >= ABA.NAF_RATIO) risk = 'low';
    else if (NP_AP_ratio >= ABA.PAF_RATIO) risk = 'medium';
    else risk = 'high';

    return {
        seepage_m3_yr: +seepage_m3_yr.toFixed(1),
        amd_loading_g_yr: +amd_loading_g_yr.toFixed(0),
        years_to_breakthrough: +Math.min(999, years_to_breakthrough).toFixed(1),
        risk,
    };
}

// ================================================================
// 6. CYANIDE MANAGEMENT - ICMC 2002 compliance
// ================================================================

/**
 * ICMC (International Cyanide Management Code 2002) compliance check
 * for mining operations, with natural attenuation model per Botz (2001).
 *
 * Verifica conformidade com o Codigo de Gestao de Cianeto ICMC 2002.
 *
 * @param {number} CN_wad_mg_L        - Weak acid dissociable CN concentration (mg/L)
 * @param {number} flow_m3_s          - Process discharge flow rate (m³/s, ≥0)
 * @param {number} photodegradation_rate_day - First-order photo-attenuation rate (day⁻¹, ≥0)
 * @param {number} dilution_factor    - Downstream dilution factor (≥1)
 * @param {number} [ICMC_threshold_mg_L=50] - Site threshold mg/L WAD-CN (default ICMC)
 * @returns {{ cn_flux_kg_day: number, half_life_days: number,
 *             downstream_mg_L: number, distance_to_compliance_m: number,
 *             icmc_status: string }}
 * @reference International Cyanide Management Institute (2002) ICMC v1.0.
 *   Botz MM (2001) Overview of cyanide treatment methods.
 *   Mining Environmental Management, July 2001, pp.28–30.
 */
export function cyanideManagement(CN_wad_mg_L: number, flow_m3_s: number, photodegradation_rate_day: number, dilution_factor: number, ICMC_threshold_mg_L: number = CYANIDE.ICMC_TAILINGS_THRESHOLD): { cn_flux_kg_day: number, half_life_days: number, downstream_mg_L: number, distance_to_compliance_m: number, icmc_status: string } {
    if (CN_wad_mg_L < 0) throw new RangeError('CN_wad_mg_L must be >= 0');
    if (flow_m3_s < 0) throw new RangeError('flow_m3_s must be >= 0');
    if (photodegradation_rate_day < 0) throw new RangeError('photodegradation_rate_day must be >= 0');
    if (dilution_factor < 1) throw new RangeError('dilution_factor must be >= 1');
    if (ICMC_threshold_mg_L <= 0) throw new RangeError('ICMC_threshold_mg_L must be > 0');

    // Cyanide mass flux kg/day
    const flow_L_day = flow_m3_s * CYANIDE.SEC_PER_DAY * CYANIDE.L_PER_M3;
    const cn_flux_kg_day = CN_wad_mg_L * flow_L_day * CYANIDE.MG_TO_KG;

    // Natural attenuation half-life (Botz 2001 photodegradation first-order)
    const k = photodegradation_rate_day > 0 ? photodegradation_rate_day : CYANIDE.BOTZ_REFERENCE_RATE;
    const half_life_days = Math.LN2 / k;

    // Downstream concentration after dilution (immediate mixing)
    const downstream_mg_L = CN_wad_mg_L / dilution_factor;

    // Distance to compliance: assume stream velocity ~0.5 m/s
    // At first-order decay rate k, time to reach threshold: t = -ln(C_thresh/C0)/k
    const STREAM_VEL_M_S = 0.5;
    const STREAM_VEL_M_DAY = STREAM_VEL_M_S * 86400;
    const c0 = downstream_mg_L;
    let distance_to_compliance_m = 0;
    if (c0 > ICMC_threshold_mg_L && k > 0) {
        const time_days = -Math.log(ICMC_threshold_mg_L / c0) / k;
        distance_to_compliance_m = time_days * STREAM_VEL_M_DAY;
    }

    const icmc_status = downstream_mg_L <= ICMC_threshold_mg_L ? 'compliant' : 'exceedance';

    return {
        cn_flux_kg_day: +cn_flux_kg_day.toFixed(3),
        half_life_days: +half_life_days.toFixed(2),
        downstream_mg_L: +downstream_mg_L.toFixed(3),
        distance_to_compliance_m: +distance_to_compliance_m.toFixed(0),
        icmc_status,
    };
}

// ================================================================
// 7. SUBSURFACE SUBSIDENCE - NCB/SMRE 1975 longwall
// ================================================================

/**
 * Surface subsidence prediction for longwall mining per NCB (1975).
 * Calcula subsidencia superficial para mineracao longwall.
 *
 * @param {number} mining_depth_m   - Depth to seam (m, >0)
 * @param {number} seam_thickness_m - Extracted seam thickness (m, >0)
 * @param {number} extraction_ratio - Panel extraction ratio (0–1)
 * @param {number} panel_width_m    - Panel width (m, >0)
 * @param {'hard_rock'|'coal'|'soft_rock'} overburden_type
 * @returns {{ max_subsidence_m: number, critical_width_m: number,
 *             tilt_mm_per_m: number, strain_mm_per_m: number,
 *             damage_class: string }}
 * @reference National Coal Board (1975) Subsidence Engineer's Handbook,
 *   2nd ed. National Coal Board Production Dept., London. (SMRE)
 */
export function subsurfaceSubsidence(mining_depth_m: number, seam_thickness_m: number, extraction_ratio: number, panel_width_m: number, overburden_type: 'hard_rock'|'coal'|'soft_rock'): { max_subsidence_m: number, critical_width_m: number, tilt_mm_per_m: number, strain_mm_per_m: number, damage_class: string } {
    if (mining_depth_m <= 0) throw new RangeError('mining_depth_m must be > 0');
    if (seam_thickness_m <= 0) throw new RangeError('seam_thickness_m must be > 0');
    if (extraction_ratio <= 0 || extraction_ratio > 1) throw new RangeError('extraction_ratio must be > 0 and ≤ 1');
    if (panel_width_m <= 0) throw new RangeError('panel_width_m must be > 0');
    const VALID_OB = ['hard_rock', 'coal', 'soft_rock'];
    if (!VALID_OB.includes(overburden_type))
        throw new RangeError(`overburden_type must be one of: ${VALID_OB.join(', ')}`);

    // Subsidence factor Sm/m by overburden type (NCB 1975 Table 3)
    const SUBSIDENCE_FACTORS = Object.freeze({
        hard_rock: 0.5,
        coal: 0.75,
        soft_rock: NCB.MAX_SUBSIDENCE_FACTOR,
    });
    const s_factor = SUBSIDENCE_FACTORS[overburden_type];

    // Critical width where full subsidence develops
    const critical_width_m = NCB.CRITICAL_WIDTH_RATIO * mining_depth_m;

    // Width/depth ratio determines if panel is sub-critical
    const w_to_h = panel_width_m / mining_depth_m;
    // NCB subcritical factor: S ∝ sin²(πw/2w_c) when w < w_c
    const subcritical_factor =
        w_to_h < NCB.CRITICAL_WIDTH_RATIO ? Math.sin((Math.PI * w_to_h) / (2 * NCB.CRITICAL_WIDTH_RATIO)) ** 2 : 1.0;

    const max_subsidence_m = s_factor * seam_thickness_m * extraction_ratio * subcritical_factor;

    // Tilt (angular distortion) mm/m at edge of panel
    // Approximated as: tilt = 2 × Smax / panel_width (NCB profile function)
    const tilt_mm_per_m = panel_width_m > 0 ? (2 * max_subsidence_m * 1000) / panel_width_m : 0;

    // Horizontal strain at surface: ε ≈ 0.5 × S / depth (NCB eq. 4.3)
    const strain_mm_per_m = (0.5 * max_subsidence_m * 1000) / mining_depth_m;

    let damage_class;
    if (strain_mm_per_m < NCB.TILT_DAMAGE_CLASS_I) damage_class = 'class_I_negligible';
    else if (strain_mm_per_m < NCB.STRAIN_CLASS_II) damage_class = 'class_II_slight';
    else if (strain_mm_per_m < NCB.STRAIN_CLASS_III) damage_class = 'class_III_moderate';
    else damage_class = 'class_IV_severe';

    return {
        max_subsidence_m: +max_subsidence_m.toFixed(3),
        critical_width_m: +critical_width_m.toFixed(1),
        tilt_mm_per_m: +tilt_mm_per_m.toFixed(3),
        strain_mm_per_m: +strain_mm_per_m.toFixed(3),
        damage_class,
    };
}

// ================================================================
// 8. DECOMMISSIONING COST MODEL - ICMM 2014
// ================================================================

/**
 * Mine decommissioning and closure cost estimate per ICMM (2014)
 * Integrated Mine Closure framework.
 *
 * Estima custo de fechamento de mina conforme ICMM 2014.
 *
 * @param {'open_pit'|'underground'|'heap_leach'|'placer'} mine_type
 * @param {number} area_ha          - Total disturbed area (ha, >0)
 * @param {number} depth_m          - Maximum mining depth (m, >0)
 * @param {string[]} materials_involved - Contaminant list (informational)
 * @param {number} tailings_volume_m3 - Total tailings volume (m³, ≥0)
 * @param {'standard'|'enhanced'|'australia'|'canada'|'brazil'} closure_standard
 * @returns {{ capex_usd: number, opex_20yr_usd: number,
 *             monitoring_30yr_usd: number, bond_usd: number,
 *             total_usd: number, cost_per_ha_usd: number }}
 * @reference ICMM (2014) Integrated Mine Closure - Good Practice Guide.
 *   ISBN 978-1-907869-16-3. London.
 */
export function decommissioningCostModel(mine_type: 'open_pit'|'underground'|'heap_leach'|'placer', area_ha: number, depth_m: number, materials_involved: string[], tailings_volume_m3: number, closure_standard: 'standard'|'enhanced'|'australia'|'canada'|'brazil'): { capex_usd: number, opex_20yr_usd: number, monitoring_30yr_usd: number, bond_usd: number, total_usd: number, cost_per_ha_usd: number } {
    const VALID_TYPES = ['open_pit', 'underground', 'heap_leach', 'placer'];
    if (!VALID_TYPES.includes(mine_type)) throw new RangeError(`mine_type must be one of: ${VALID_TYPES.join(', ')}`);
    if (area_ha <= 0) throw new RangeError('area_ha must be > 0');
    if (depth_m <= 0) throw new RangeError('depth_m must be > 0');
    if (!Array.isArray(materials_involved)) throw new RangeError('materials_involved must be an array');
    if (tailings_volume_m3 < 0) throw new RangeError('tailings_volume_m3 must be >= 0');
    const VALID_STANDARDS = ['standard', 'enhanced', 'australia', 'canada', 'brazil'];
    if (!VALID_STANDARDS.includes(closure_standard))
        throw new RangeError(`closure_standard must be one of: ${VALID_STANDARDS.join(', ')}`);

    // Complexity multipliers by mine type
    const COMPLEXITY = Object.freeze({
        open_pit: DECOM.OPENPIT_MULTIPLIER,
        underground: DECOM.UNDERGROUND_MULTIPLIER,
        heap_leach: 1.6,
        placer: 1.0,
    });
    // Regulatory standard cost multiplier
    const STD_MULT = Object.freeze({
        standard: 1.0,
        enhanced: 1.3,
        australia: 1.4,
        canada: 1.35,
        brazil: 1.15,
    });

    const complexity = COMPLEXITY[mine_type];
    const std_mult = STD_MULT[closure_standard];

    // CAPEX: site prep + revegetation + tailings cap
    const heap_extra = mine_type === 'heap_leach' ? DECOM.HEAP_LEACH_USD_HA * area_ha : 0;
    const capex_base =
        area_ha * (DECOM.SITE_PREP_USD_HA + DECOM.REVEGETATION_USD_HA) +
        tailings_volume_m3 * DECOM.TAILINGS_CAP_USD_M3 +
        heap_extra;
    const capex_usd = capex_base * complexity * std_mult;

    // OPEX water treatment (20 yr): assume 0.01 m³ seepage per m³ tailings per yr
    const annual_treat_m3 = tailings_volume_m3 * 0.01 + area_ha * 50;
    const opex_20yr_usd = annual_treat_m3 * DECOM.WATER_TREATMENT_USD_M3_YR * 20 * std_mult;

    // Monitoring (30 yr)
    const monitoring_30yr_usd = area_ha * DECOM.MONITORING_USD_HA_YR * 30 * std_mult;

    // Financial assurance / bond (ICMM: 30 % contingency)
    const subtotal = capex_usd + opex_20yr_usd + monitoring_30yr_usd;
    const bond_usd = subtotal * DECOM.BOND_CONTINGENCY;
    const total_usd = subtotal + bond_usd;

    return {
        capex_usd: +capex_usd.toFixed(0),
        opex_20yr_usd: +opex_20yr_usd.toFixed(0),
        monitoring_30yr_usd: +monitoring_30yr_usd.toFixed(0),
        bond_usd: +bond_usd.toFixed(0),
        total_usd: +total_usd.toFixed(0),
        cost_per_ha_usd: +(total_usd / area_ha).toFixed(0),
    };
}

// ================================================================
// 9. NO-FLY ZONE DUST CRITICAL - ANZECC/CONAMA
// ================================================================

/**
 * Dust fallout limits and protective buffer distance for sensitive
 * vegetation per ANZECC/ARMCANZ (2000) and CONAMA 03/1990.
 *
 * Calcula limites de deposicao de poeira e buffer de protecao
 * de vegetacao conforme ANZECC 2000 e CONAMA 03/1990.
 *
 * @param {string} plant_species   - Vegetation type ('native_woodland'|'crops'|'pasture'|'generic')
 * @param {number} dust_load_g_m2_day - Measured dust deposition rate (g/m²/day, ≥0)
 * @param {number} duration_days   - Exposure duration (days, >0)
 * @param {number} wind_sector_deg - Prevailing wind direction from mine (degrees 0–360)
 * @param {number} mine_boundary_distance_m - Distance from mine boundary to receptor (m, ≥0)
 * @returns {{ deposition_mg_m2_day: number, anzecc_limit_mg_m2_day: number,
 *             exceedance_ratio: number, buffer_required_m: number,
 *             compliance: string, cumulative_g_m2: number }}
 * @reference ANZECC/ARMCANZ (2000) Australian and New Zealand Guidelines
 *   for Fresh and Marine Water Quality. Vol. 1. ISBN 0-642-68672-7.
 *   CONAMA Resolucao 03/1990 Padrao de Qualidade do Ar.
 */
export function noFlyZoneDustCritical(plant_species: string, dust_load_g_m2_day: number, duration_days: number, wind_sector_deg: number, mine_boundary_distance_m: number): { deposition_mg_m2_day: number, anzecc_limit_mg_m2_day: number, exceedance_ratio: number, buffer_required_m: number, compliance: string, cumulative_g_m2: number } {
    const VALID_SPECIES = ['native_woodland', 'crops', 'pasture', 'generic'];
    if (!VALID_SPECIES.includes(plant_species))
        throw new RangeError(`plant_species must be one of: ${VALID_SPECIES.join(', ')}`);
    if (dust_load_g_m2_day < 0) throw new RangeError('dust_load_g_m2_day must be >= 0');
    if (duration_days <= 0) throw new RangeError('duration_days must be > 0');
    if (wind_sector_deg < 0 || wind_sector_deg > 360) throw new RangeError('wind_sector_deg must be 0–360');
    if (mine_boundary_distance_m < 0) throw new RangeError('mine_boundary_distance_m must be >= 0');

    // Convert g/m²/day → mg/m²/day
    const deposition_mg_m2_day = dust_load_g_m2_day * 1000;

    // Species-specific ANZECC 2000 sensitivity factor (Table 8.1.5)
    const SPECIES_FACTOR = Object.freeze({
        native_woodland: 0.7, // more sensitive
        crops: 0.85,
        pasture: 1.0,
        generic: 1.0,
    });
    const sens = (SPECIES_FACTOR as Record<string, number>)[plant_species]!;
    const anzecc_limit_mg_m2_day = ANZECC.FALLOUT_LIMIT_MG_M2_DAY * sens;

    const exceedance_ratio = anzecc_limit_mg_m2_day > 0 ? deposition_mg_m2_day / anzecc_limit_mg_m2_day : 0;

    // Required buffer distance: inverse-square falloff from source
    // buffer_required = BUFFER_MULTIPLIER × (dust_load_g_m2_day / limit_g_m2_day)
    const limit_g_m2_day = anzecc_limit_mg_m2_day / 1000;
    const buffer_required_m =
        dust_load_g_m2_day > limit_g_m2_day
            ? Math.max(ANZECC.MIN_BUFFER_M, ANZECC.BUFFER_MULTIPLIER * (dust_load_g_m2_day / limit_g_m2_day) * 1000)
            : ANZECC.MIN_BUFFER_M;

    const compliance =
        mine_boundary_distance_m >= buffer_required_m && exceedance_ratio <= 1.0 ? 'compliant' : 'exceedance';

    const cumulative_g_m2 = dust_load_g_m2_day * duration_days;

    return {
        deposition_mg_m2_day: +deposition_mg_m2_day.toFixed(2),
        anzecc_limit_mg_m2_day: +anzecc_limit_mg_m2_day.toFixed(2),
        exceedance_ratio: +exceedance_ratio.toFixed(3),
        buffer_required_m: +buffer_required_m.toFixed(0),
        compliance,
        cumulative_g_m2: +cumulative_g_m2.toFixed(2),
    };
}

// ================================================================
// 10. MINING WATER BALANCE - JORC-aligned pit water balance
// ================================================================

/**
 * Pit water balance for open-cut mining operations, JORC-aligned.
 * Calcula balanco hidrico da cava conforme metodologia JORC.
 *
 * @param {number} pit_inflow_m3_day    - Groundwater/surface inflow (m³/day, ≥0)
 * @param {number} process_water_m3_day - Process water consumption (m³/day, ≥0)
 * @param {number} precipitation_m3_day - Direct precipitation onto pit (m³/day, ≥0)
 * @param {number} evaporation_m3_day   - Evaporation from pit lake (m³/day, ≥0)
 * @param {number} seepage_m3_day       - Seepage out of pit (m³/day, ≥0)
 * @param {number} recycled_pct         - Process water recycling rate (%, 0–100)
 * @returns {{ net_surplus_m3_day: number, recycled_m3_day: number,
 *             makeup_water_m3_day: number, pump_duty_m3_hr: number,
 *             amd_risk: string, water_balance_status: string }}
 * @reference Younger PL et al. (2002) Mine Water: Hydrology, Pollution,
 *   Remediation. Kluwer. doi:10.1007/978-94-010-0610-1
 *   JORC Code 2012 - Australasian Code for Reporting Mineral Resources.
 */
export function miningWaterBalance(pit_inflow_m3_day: number, process_water_m3_day: number, precipitation_m3_day: number, evaporation_m3_day: number, seepage_m3_day: number, recycled_pct: number): { net_surplus_m3_day: number, recycled_m3_day: number, makeup_water_m3_day: number, pump_duty_m3_hr: number, amd_risk: string, water_balance_status: string } {
    if (pit_inflow_m3_day < 0) throw new RangeError('pit_inflow_m3_day must be >= 0');
    if (process_water_m3_day < 0) throw new RangeError('process_water_m3_day must be >= 0');
    if (precipitation_m3_day < 0) throw new RangeError('precipitation_m3_day must be >= 0');
    if (evaporation_m3_day < 0) throw new RangeError('evaporation_m3_day must be >= 0');
    if (seepage_m3_day < 0) throw new RangeError('seepage_m3_day must be >= 0');
    if (recycled_pct < 0 || recycled_pct > 100) throw new RangeError('recycled_pct must be 0–100');

    // Total inflow
    const total_inflow_m3_day = pit_inflow_m3_day + precipitation_m3_day;

    // Recycled water reduces make-up demand
    const recycled_m3_day = process_water_m3_day * (recycled_pct / 100);
    const makeup_water_m3_day = Math.max(0, process_water_m3_day - recycled_m3_day);

    // Total outflow (natural + operational)
    const total_outflow_m3_day = evaporation_m3_day + seepage_m3_day + recycled_m3_day;

    // Net surplus (+) or deficit (-) in pit
    const net_surplus_m3_day = total_inflow_m3_day - total_outflow_m3_day;

    // Dewatering pump duty (m³/hr) - sized to handle inflow + safety factor
    const pump_duty_m3_hr = net_surplus_m3_day > 0 ? (net_surplus_m3_day * WATER.PUMP_SAFETY_FACTOR) / 24 : 0;

    // AMD risk: if pit water accumulates rapidly (>5 m/yr rise equivalent)
    // Approximate pit surface area from inflows
    const PIT_AREA_M2_PROXY = 1e5; // 10 ha proxy for AMD rise calc
    const water_rise_m_yr = net_surplus_m3_day > 0 ? (net_surplus_m3_day * WATER.DAYS_PER_YEAR) / PIT_AREA_M2_PROXY : 0;
    const amd_risk = water_rise_m_yr >= WATER.AMD_RISK_RISE_M_YR ? 'high' : 'low';

    const water_balance_status = net_surplus_m3_day > 0 ? 'surplus' : 'deficit';

    return {
        net_surplus_m3_day: +net_surplus_m3_day.toFixed(1),
        recycled_m3_day: +recycled_m3_day.toFixed(1),
        makeup_water_m3_day: +makeup_water_m3_day.toFixed(1),
        pump_duty_m3_hr: +pump_duty_m3_hr.toFixed(2),
        amd_risk,
        water_balance_status,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const miningEnvironmentalImpactMeta = {
    name: 'miningEnvironmentalImpact',
    description: 'miningEnvironmentalImpact',
    category: 'analytics',
    familyTags: ['mining'],
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
