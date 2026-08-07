// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * Occupational Toxicology and Advanced Industrial Hygiene
 *
 * Pure-logic ES module - zero DOM/IDB/Three.js/fetch/browser dependencies.
 * Runs in Node.js with `node --test`.
 *
 * Implements:
 *  1. Dermal absorption flux from water (USEPA RAGS Part E)
 *  2. Mixture joint toxicity - additive/synergistic/antagonistic (ACGIH)
 *  3. Beryllium sensitization probability (OSHA 1910.1024 + Kreiss 2007)
 *  4. Silica dust lung burden (NIOSH 2002 quartz model)
 *  5. Biological monitoring equivalents - metals panel (DFG 2019 + ACGIH BEI 2024)
 *  6. Enclosed space atmosphere assessment (OSHA 29 CFR 1910.146)
 *  7. Nanoparticle exposure risk / control banding (NIOSH CIB 65 + CB Nanotool)
 *  8. Ergonomic lifting index - Revised NIOSH Lifting Equation (Waters et al. 1994)
 *  9. Heat stress work capacity (ISO 7933 + ACGIH TLV)
 * 10. Hand-arm vibration daily exposure A(8) (ISO 5349-1 + EU 2002/44/EC)
 *
 * Academic references:
 *  - USEPA (2004) "Risk Assessment Guidance for Superfund (RAGS) Part E"
 *    EPA/540/R/99/005. DOI:https://doi.org/10.5281/zenodo.7565032 (mirror)
 *  - McKone T.E. (1987) "Human exposure to volatile organic compounds in
 *    household tap water: the indoor inhalation pathway" Environ. Sci. Technol.
 *    21(12):1194–1201. DOI:10.1021/es00165a009
 *  - ACGIH (2021/2024) TLVs and BEIs Documentation.
 *    ISBN 978-1-607260-97-2
 *  - Kreiss K. et al. (2007) "Epidemiology of beryllium sensitization and disease
 *    in nuclear workers" Am. J. Ind. Med. 50(10):718–728.
 *    DOI:10.1002/ajim.20521
 *  - NIOSH (2002) "Health Effects of Occupational Exposure to Respirable Crystalline
 *    Silica" NIOSH Hazard Review. DHHS (NIOSH) Publication No. 2002-129.
 *  - DFG (2019) "List of MAK and BAT Values 2019" Wiley-VCH.
 *    DOI:10.1002/9783527826124
 *  - OSHA (2017) 29 CFR 1910.146 Permit-Required Confined Spaces.
 *    OSHA 3138-01R
 *  - NIOSH (2011) "Occupational Exposure to Titanium Dioxide" CIB No. 65.
 *    DHHS (NIOSH) Publication No. 2011-160.
 *  - Paik S.Y. et al. (2008) "Control Banding Tool for Engineered Nanoparticles"
 *    Ann. Occup. Hyg. 52(5):419–428. DOI:10.1093/annhyg/men029
 *  - Waters T.R. et al. (1994) "Revised NIOSH equation for the design and
 *    evaluation of manual lifting tasks" Ergonomics 37(4):749–776.
 *    DOI:10.1080/00140139408963710
 *  - ISO 7933:2004 "Ergonomics of the thermal environment - Analytical determination
 *    and interpretation of heat stress using calculation of the predicted heat strain"
 *  - ISO 5349-1:2001 "Mechanical vibration - Measurement and evaluation of
 *    human exposure to hand-transmitted vibration - Part 1: General requirements"
 *  - Griffin M.J. (1997) "Measurement, evaluation, and assessment of occupational
 *    exposures to hand-transmitted vibration" Scand. J. Work Environ. Health
 *    23(4):287–298. DOI:10.5271/sjweh.222
 *  - EU Directive 2002/44/EC on minimum health and safety requirements regarding
 *    the exposure of workers to the risks arising from physical agents (vibration).
 */

// ---------------------------------------------------------------------------
// Named constants - no magic numbers in function bodies
// ---------------------------------------------------------------------------

/** USEPA RAGS Part E — reference body weight (kg) used when BW argument <= 0 */
const RAGS_DEFAULT_BW_KG = 70;

/**
 * ACGIH BEI 2024 and DFG 2019 BAT reference values for the metals panel.
 * Units as annotated.
 */
const BIOLOGICAL_EXPOSURE_INDICES = Object.freeze({
    blood_Pb_ug_dL: 10, // ACGIH BEI 2024 — lead in blood (deterministic)
    urine_As_ug_L: 35, // ACGIH BEI 2024 — inorganic As + methylated species
    urine_Cr_ug_g_creat: 25, // ACGIH BEI 2024 — Cr (VI) urine, end of shift
    blood_Hg_ug_L: 15, // ACGIH BEI 2024 — total Hg in blood
    urine_Cd_ug_g_creat: 5, // ACGIH BEI 2024 — cadmium
});

/**
 * OSHA 29 CFR 1910.146 permit-required confined space atmospheric thresholds.
 */
const CONFINED_SPACE_THRESHOLDS = Object.freeze({
    O2_min_pct: 19.5,
    O2_max_pct: 23.5,
    LEL_action_pct: 10, // Action level — ventilate / reassess
    LEL_prohibit_pct: 25, // Prohibition threshold
    H2S_TLV_ppm: 1, // ACGIH STEL 5 ppm; OSHA action 1 ppm
    H2S_IDLH_ppm: 50,
    CO_PEL_ppm: 50, // OSHA PEL TWA
    CO_IDLH_ppm: 1200,
    benzene_PEL_ppm: 1, // OSHA 29 CFR 1910.1028 PEL TWA
    benzene_IDLH_ppm: 500,
});

/**
 * NIOSH Revised Lifting Equation (Waters 1994) constants.
 */
const NIOSH_RLE = Object.freeze({
    LC_kg: 23, // Load constant (kg)
    H_opt_cm: 25, // Optimal horizontal distance
    V_opt_cm: 75, // Optimal vertical location
    D_ref_cm: 25, // Reference distance
    A_opt_deg: 0, // Optimal asymmetry
    F_max_lifts_hr: 15, // Max frequency for FM = 1
});

/**
 * ISO 7933:2004 physiological constants for heat stress.
 */
const ISO7933 = Object.freeze({
    Sw_max_g_hr: 650, // Maximum sustainable sweat rate (g/hr)
    Sw_max_accl_g_hr: 1000, // Acclimatized maximum sweat rate (g/hr)
    body_heat_capacity_J_kgK: 3480,
    evaporation_latent_J_g: 2430,
});

/**
 * ISO 5349-1:2001 frequency weighting bands (Hz) and weighting factors (Wh).
 * Simplified octave-band values per ISO 5349-1 Table A.1.
 */
const ISO5349_WEIGHTS = Object.freeze([
    Object.freeze({ f_Hz: 8, Wh: 1.0 }),
    Object.freeze({ f_Hz: 16, Wh: 1.0 }),
    Object.freeze({ f_Hz: 31.5, Wh: 0.794 }),
    Object.freeze({ f_Hz: 63, Wh: 0.397 }),
    Object.freeze({ f_Hz: 125, Wh: 0.199 }),
    Object.freeze({ f_Hz: 250, Wh: 0.0997 }),
    Object.freeze({ f_Hz: 500, Wh: 0.05 }),
    Object.freeze({ f_Hz: 1000, Wh: 0.025 }),
]);

/**
 * EU Directive 2002/44/EC hand-arm vibration thresholds.
 */
const EU_HAV = Object.freeze({
    EAV_m_s2: 2.5, // Exposure Action Value
    ELV_m_s2: 5.0, // Exposure Limit Value
});

/**
 * NIOSH CIB 65 provisional REL values for selected nanomaterials (mg/m³).
 */
const NIOSH_NANO_REL = Object.freeze({
    TiO2_fine_mg_m3: 2.4,
    TiO2_ultrafine_mg_m3: 0.3,
    carbon_nanotube_mg_m3: 0.001,
    carbon_nanofiber_mg_m3: 0.001,
    silver_mg_m3: 0.9,
    zinc_oxide_mg_m3: 2.0,
    generic_mg_m3: 0.1,
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Clamp a value between min and max.
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function _clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

/**
 * Nearest ISO 5349-1 frequency weighting factor for a given frequency.
 * Uses the entry whose f_Hz is closest (log-distance).
 * @param {number} freq_Hz
 * @returns {number}
 */
function _iso5349Weight(freq_Hz: number): number {
    let best = ISO5349_WEIGHTS[0]!;
    let bestDist = Math.abs(Math.log2(freq_Hz / best.f_Hz));
    for (const entry of ISO5349_WEIGHTS) {
        const d = Math.abs(Math.log2(freq_Hz / entry.f_Hz));
        if (d < bestDist) {
            bestDist = d;
            best = entry;
        }
    }
    return best.Wh;
}

// ---------------------------------------------------------------------------
// 1. Skin Absorption - Dermal Flux from Water (USEPA RAGS Part E 2004)
// ---------------------------------------------------------------------------

/**
 * Calculate dermal absorbed dose (DAD) from water contact using the
 * USEPA RAGS Part E (2004) dermal absorption model.
 *
 * DAD = (Kp × Cw × SA × ET × EF × ED) / (BW × AT)
 *
 * J (flux) = Kp × Cw  [mg/cm²/hr]
 * DAD [mg/kg-day] accounts for exposure frequency, duration, and body weight.
 *
 * @param {number} Cwater_mg_L     - Chemical concentration in water (mg/L)
 * @param {number} Kp_cm_hr        - Dermal permeability coefficient (cm/hr)
 * @param {number} SA_cm2          - Skin surface area in contact (cm²)
 * @param {number} ET_hr           - Exposure time per event (hr)
 * @param {number} event_freq_per_yr - Exposure frequency (events/yr)
 * @param {number} ED_yr           - Exposure duration (yr)
 * @param {number} BW_kg           - Body weight (kg); uses 70 kg default if <= 0
 * @param {number} AT_days         - Averaging time (days); 365×ED for non-carcinogen
 * @returns {Readonly<{J_mg_cm2_hr: number, DAD_mg_kg_day: number, unit: string}>}
 * @reference USEPA 2004 EPA/540/R/99/005 Table 6-1; McKone 1987 DOI:10.1021/es00165a009
 */
export function skinAbsorptionDermalFlux(Cwater_mg_L: number, Kp_cm_hr: number, SA_cm2: number, ET_hr: number, event_freq_per_yr: number, ED_yr: number, BW_kg: number, AT_days: number): Readonly<{J_mg_cm2_hr: number, DAD_mg_kg_day: number, unit: string}> {
    if (Cwater_mg_L < 0) throw new RangeError('Cwater_mg_L must be >= 0');
    if (Kp_cm_hr <= 0) throw new RangeError('Kp_cm_hr must be > 0');
    if (SA_cm2 <= 0) throw new RangeError('SA_cm2 must be > 0');
    if (ET_hr <= 0) throw new RangeError('ET_hr must be > 0');
    if (event_freq_per_yr < 0) throw new RangeError('event_freq_per_yr must be >= 0');
    if (ED_yr <= 0) throw new RangeError('ED_yr must be > 0');
    if (AT_days <= 0) throw new RangeError('AT_days must be > 0');

    const BW = BW_kg > 0 ? BW_kg : RAGS_DEFAULT_BW_KG;

    // Cwater: mg/L → mg/cm³  (1 L = 1000 cm³)
    const Cw_mg_cm3 = Cwater_mg_L / 1000;

    // Dermal flux J [mg/cm²/hr]
    const J_mg_cm2_hr = Kp_cm_hr * Cw_mg_cm3;

    // Dermally absorbed dose [mg/kg-day]
    // DAD = J × SA [cm²] × ET [hr/event] × EF [events/yr] × ED [yr]
    //       / (BW [kg] × AT [days])
    // Unit check: mg/cm²/hr × cm² × hr × events/yr × yr / (kg × days) = mg/kg/day ✓
    const DAD_mg_kg_day = (J_mg_cm2_hr * SA_cm2 * ET_hr * event_freq_per_yr * ED_yr) / (BW * AT_days);

    return Object.freeze({
        J_mg_cm2_hr,
        DAD_mg_kg_day,
        unit: 'mg/kg-day',
    });
}

// ---------------------------------------------------------------------------
// 2. Mixture Joint Toxicity (ACGIH 2021)
// ---------------------------------------------------------------------------

/**
 * Evaluate joint toxicity of a chemical mixture using the ACGIH (2021)
 * mixture formula. Supports additive, synergistic, and antagonistic interactions.
 *
 * Mixture Exposure Ratio:
 *   Em = Σ (Ci / TLVi)   [additive model]
 * Synergistic: multiply Em by synergy_factor (> 1)
 * Antagonistic: multiply Em by antagonism_factor (< 1), min 0
 *
 * @param {string[]}  agents_array       - Chemical names
 * @param {number[]}  exposure_levels    - Measured concentrations (same units as TLVs)
 * @param {number[]}  TLV_or_RfD_array  - TLV or reference dose values (same units)
 * @param {'additive'|'synergistic'|'antagonistic'} interaction_type
 * @param {number}    [synergy_factor=1.5]  - Multiplier for synergistic pairs
 * @param {number}    [antagonism_factor=0.7] - Multiplier for antagonistic pairs
 * @returns {Readonly<{Em: number, compliant: boolean, exceedances: readonly string[], interaction: string, unit: string}>}
 * @reference ACGIH 2021 TLVs and BEIs Documentation; ISBN 978-1-607260-97-2
 */
/**
 * Validate inputs for mixture joint toxicity.
 * @throws {RangeError}
 */
function _validateMixtureInputs(
    agents_array: string[],
    exposure_levels: number[],
    TLV_or_RfD_array: number[],
    interaction_type: string,
) {
    if (!Array.isArray(agents_array) || agents_array.length === 0)
        throw new RangeError('agents_array must be a non-empty array');
    if (!Array.isArray(exposure_levels) || exposure_levels.length !== agents_array.length)
        throw new RangeError('exposure_levels length must match agents_array');
    if (!Array.isArray(TLV_or_RfD_array) || TLV_or_RfD_array.length !== agents_array.length)
        throw new RangeError('TLV_or_RfD_array length must match agents_array');
    if (!['additive', 'synergistic', 'antagonistic'].includes(interaction_type))
        throw new RangeError('interaction_type must be additive, synergistic, or antagonistic');

    for (let i = 0; i < TLV_or_RfD_array.length; i++) {
        if (TLV_or_RfD_array[i]! <= 0) throw new RangeError(`TLV_or_RfD_array[${i}] must be > 0`);
        if (exposure_levels[i]! < 0) throw new RangeError(`exposure_levels[${i}] must be >= 0`);
    }
}

/**
 * Apply interaction multiplier to the mixture exposure ratio.
 * @throws {RangeError}
 */
function _applyInteractionFactor(
    Em: number,
    interaction_type: 'additive'|'synergistic'|'antagonistic',
    synergy_factor: number,
    antagonism_factor: number,
): number {
    if (interaction_type === 'synergistic') {
        if (synergy_factor <= 1) throw new RangeError('synergy_factor must be > 1');
        return Em * synergy_factor;
    }
    if (interaction_type === 'antagonistic') {
        if (antagonism_factor <= 0 || antagonism_factor >= 1)
            throw new RangeError('antagonism_factor must be in (0, 1)');
        return Em * antagonism_factor;
    }
    return Em;
}

/**
 * Compute additive exposure ratios and collect individual exceedances.
 */
function _computeMixtureRatios(
    agents_array: string[],
    exposure_levels: number[],
    TLV_or_RfD_array: number[],
): { Em: number; exceedances: string[] } {
    let Em = 0;
    const exceedances: string[] = [];
    for (let i = 0; i < agents_array.length; i++) {
        const ratio = exposure_levels[i]! / TLV_or_RfD_array[i]!;
        Em += ratio;
        if (ratio > 1) exceedances.push(agents_array[i]!);
    }
    return { Em, exceedances };
}

export function mixtureJointToxicity(
    agents_array: string[],
    exposure_levels: number[],
    TLV_or_RfD_array: number[],
    interaction_type: 'additive'|'synergistic'|'antagonistic',
    synergy_factor: number = 1.5,
    antagonism_factor: number = 0.7,
): Readonly<{Em: number, compliant: boolean, exceedances: readonly string[], interaction: string, unit: string}> {
    _validateMixtureInputs(agents_array, exposure_levels, TLV_or_RfD_array, interaction_type);
    const { Em: baseEm, exceedances } = _computeMixtureRatios(agents_array, exposure_levels, TLV_or_RfD_array);
    const Em = _applyInteractionFactor(baseEm, interaction_type, synergy_factor, antagonism_factor);

    return Object.freeze({
        Em,
        compliant: Em <= 1,
        exceedances: Object.freeze([...exceedances]),
        interaction: interaction_type,
        unit: 'dimensionless (ratio)',
    });
}

// ---------------------------------------------------------------------------
// 3. Beryllium Sensitization (OSHA 1910.1024 + Kreiss 2007)
// ---------------------------------------------------------------------------

/**
 * Estimate beryllium sensitization probability and classify regulatory compliance
 * per OSHA 29 CFR 1910.1024 (2017) and the Kreiss (2007) log-logistic model.
 *
 * OSHA 1910.1024 thresholds:
 *   Action Level (AL) = 0.1 µg/m³  (8-hr TWA)
 *   PEL              = 0.2 µg/m³  (8-hr TWA)
 *
 * Kreiss (2007) log-logistic sensitization probability:
 *   logit(p) = -4.73 + 1.65 × ln(cum_exposure_µg_m3_yr)
 *   where cum_exposure = Be_air_ug_m3 × work_days_yr/250 × years_exposure
 *
 * @param {number} Be_air_ug_m3            - Airborne Be concentration (µg/m³ TWA)
 * @param {number} Be_surface_ug_cm2       - Surface Be loading (µg/cm²)
 * @param {number} work_days_yr            - Work days per year
 * @param {number} years_exposure          - Duration of exposure (yr)
 * @param {number} baseline_sensitization_rate - Background sensitization rate (0–1)
 * @returns {Readonly<{cumulative_exposure_ug_m3_yr: number, sensitization_probability: number,
 *   CBD_risk_pct: number, exceeds_AL: boolean, exceeds_PEL: boolean,
 *   medical_surveillance_required: boolean, unit: string}>}
 * @reference Kreiss et al. 2007 Am. J. Ind. Med. 50(10):718 DOI:10.1002/ajim.20521
 * @reference OSHA 29 CFR 1910.1024 (2017)
 */
export function berylliumSensitization(Be_air_ug_m3: number, Be_surface_ug_cm2: number, work_days_yr: number, years_exposure: number, baseline_sensitization_rate: number): Readonly<{cumulative_exposure_ug_m3_yr: number, sensitization_probability: number, CBD_risk_pct: number, exceeds_AL: boolean, exceeds_PEL: boolean, medical_surveillance_required: boolean, unit: string}> {
    if (Be_air_ug_m3 < 0) throw new RangeError('Be_air_ug_m3 must be >= 0');
    if (Be_surface_ug_cm2 < 0) throw new RangeError('Be_surface_ug_cm2 must be >= 0');
    if (work_days_yr <= 0 || work_days_yr > 365) throw new RangeError('work_days_yr must be in (0, 365]');
    if (years_exposure <= 0) throw new RangeError('years_exposure must be > 0');
    if (baseline_sensitization_rate < 0 || baseline_sensitization_rate > 1)
        throw new RangeError('baseline_sensitization_rate must be in [0, 1]');

    const OSHA_AL_ug_m3 = 0.1;
    const OSHA_PEL_ug_m3 = 0.2;
    const KREISS_INTERCEPT = -4.73;
    const KREISS_SLOPE = 1.65;

    // Cumulative exposure (µg/m³-yr), normalised to standard 250 work-days/yr
    const cum_exposure_ug_m3_yr = Be_air_ug_m3 * (work_days_yr / 250) * years_exposure;

    // Log-logistic sensitization probability (Kreiss 2007 Eq. 1)
    let sensitization_probability = baseline_sensitization_rate;
    if (cum_exposure_ug_m3_yr > 0) {
        const logit = KREISS_INTERCEPT + KREISS_SLOPE * Math.log(cum_exposure_ug_m3_yr);
        const model_p = 1 / (1 + Math.exp(-logit));
        // Combined probability (joint): 1 - (1-baseline)(1-model)
        sensitization_probability = 1 - (1 - baseline_sensitization_rate) * (1 - model_p);
    }
    sensitization_probability = _clamp(sensitization_probability, 0, 1);

    // CBD risk ≈ ~2% of sensitized individuals develop CBD per NIOSH/Kreiss
    const CBD_PROGRESSION_RATE = 0.02;
    const CBD_risk_pct = sensitization_probability * CBD_PROGRESSION_RATE * 100;

    const exceeds_AL = Be_air_ug_m3 > OSHA_AL_ug_m3;
    const exceeds_PEL = Be_air_ug_m3 > OSHA_PEL_ug_m3;
    const medical_surveillance_required = exceeds_AL || Be_surface_ug_cm2 > 0.2;

    return Object.freeze({
        cumulative_exposure_ug_m3_yr: cum_exposure_ug_m3_yr,
        sensitization_probability,
        CBD_risk_pct,
        exceeds_AL,
        exceeds_PEL,
        medical_surveillance_required,
        unit: 'probability [0-1]',
    });
}

// ---------------------------------------------------------------------------
// 4. Silica Dust Lung Burden (NIOSH 2002 quartz model)
// ---------------------------------------------------------------------------

/**
 * Compute cumulative respirable crystalline silica (RCS) lung burden and
 * silicosis risk classification per NIOSH (2002) Hazard Review.
 *
 * Deposited mass per shift:
 *   dm = RCS × BR × ET × deposition_alveolar_pct / 100
 *   (mg deposited/shift from RCS mg/m³ air)
 *
 * Cumulative burden (mg) = Σ_shifts [dm - clearance_per_shift]
 * Macrophage overload threshold: > 20 mg retained RCS/g dry lung (~500 mg total)
 *
 * NIOSH PEL for RCS: 0.05 mg/m³ (as quartz, respirable fraction)
 *
 * @param {number} RCS_mg_m3           - RCS airborne concentration (mg/m³)
 * @param {number} MMAD_um             - Mass median aerodynamic diameter (µm)
 * @param {number} density_g_cm3       - Particle density (g/cm³); SiO₂ ≈ 2.65
 * @param {number} breathing_rate_m3_hr - Breathing rate (m³/hr); typical 1.25
 * @param {number} deposition_alveolar_pct - Alveolar deposition fraction (%)
 * @param {number} clearance_rate_yr   - Mucociliary clearance rate (fraction/yr)
 * @param {number} years_exposure      - Cumulative years of exposure
 * @returns {Readonly<{deposited_mg_yr: number, retained_mg: number,
 *   overload_threshold_mg: number, overload: boolean, risk_class: string,
 *   exceeds_PEL: boolean, unit: string}>}
 * @reference NIOSH 2002 DHHS Pub. No. 2002-129; NIOSH 2013 DOI:10.26616/NIOSHPUB2002129
 */
export function silicaDustLungBurden(RCS_mg_m3: number, MMAD_um: number, density_g_cm3: number, breathing_rate_m3_hr: number, deposition_alveolar_pct: number, clearance_rate_yr: number, years_exposure: number): Readonly<{deposited_mg_yr: number, retained_mg: number, overload_threshold_mg: number, overload: boolean, risk_class: string, exceeds_PEL: boolean, unit: string}> {
    if (RCS_mg_m3 < 0) throw new RangeError('RCS_mg_m3 must be >= 0');
    if (MMAD_um <= 0) throw new RangeError('MMAD_um must be > 0');
    if (density_g_cm3 <= 0) throw new RangeError('density_g_cm3 must be > 0');
    if (breathing_rate_m3_hr <= 0) throw new RangeError('breathing_rate_m3_hr must be > 0');
    if (deposition_alveolar_pct < 0 || deposition_alveolar_pct > 100)
        throw new RangeError('deposition_alveolar_pct must be in [0, 100]');
    if (clearance_rate_yr < 0 || clearance_rate_yr > 1) throw new RangeError('clearance_rate_yr must be in [0, 1]');
    if (years_exposure <= 0) throw new RangeError('years_exposure must be > 0');

    const NIOSH_PEL_mg_m3 = 0.05;
    const WORK_HRS_YR = 2000; // 250 days × 8 hr
    const OVERLOAD_THRESHOLD_mg = 500; // ~20 mg/g × 25 g dry lung weight (NIOSH 2002)

    // Annual deposition rate (mg/yr)
    const deposited_mg_yr = RCS_mg_m3 * breathing_rate_m3_hr * WORK_HRS_YR * (deposition_alveolar_pct / 100);

    // Retained mass using steady-state approximation:
    //   dR/dt = D - k_clear × R  →  R_ss = D / k_clear
    // For finite time: R(t) = (D/k) × (1 - e^(-k×t))  [k in yr⁻¹]
    let retained_mg;
    if (clearance_rate_yr > 0) {
        retained_mg = (deposited_mg_yr / clearance_rate_yr) * (1 - Math.exp(-clearance_rate_yr * years_exposure));
    } else {
        // No clearance - purely additive
        retained_mg = deposited_mg_yr * years_exposure;
    }

    const overload = retained_mg > OVERLOAD_THRESHOLD_mg;

    let risk_class;
    const exceeds_PEL = RCS_mg_m3 > NIOSH_PEL_mg_m3;
    if (retained_mg > OVERLOAD_THRESHOLD_mg) {
        risk_class = 'silicosis_high_risk';
    } else if (retained_mg > OVERLOAD_THRESHOLD_mg * 0.5) {
        risk_class = 'silicosis_moderate_risk';
    } else if (exceeds_PEL) {
        risk_class = 'elevated_exposure';
    } else {
        risk_class = 'acceptable';
    }

    return Object.freeze({
        deposited_mg_yr,
        retained_mg,
        overload_threshold_mg: OVERLOAD_THRESHOLD_mg,
        overload,
        risk_class,
        exceeds_PEL,
        unit: 'mg',
    });
}

// ---------------------------------------------------------------------------
// 5. Biological Monitoring Equivalent (DFG 2019 + ACGIH BEI 2024)
// ---------------------------------------------------------------------------

/**
 * Normalise a 5-metal biological monitoring panel to BEI fractions and
 * compute a composite overexposure index.
 *
 * Individual BEI fractions fi = measured_i / BEI_i.
 * Composite = max(f1..f5).  Each fi > 1 flags individual exceedance.
 *
 * @param {number} blood_Pb_ug_dL        - Lead in blood (µg/dL); BEI = 10
 * @param {number} urine_As_ug_L         - Arsenic in urine (µg/L); BEI = 35
 * @param {number} urine_Cr_ug_g_creat   - Chromium in urine (µg/g creatinine); BEI = 25
 * @param {number} blood_Hg_ug_L         - Mercury in blood (µg/L); BEI = 15
 * @param {number} urine_Cd_ug_g_creat   - Cadmium in urine (µg/g creatinine); BEI = 5
 * @returns {Readonly<{fractions: Readonly<Record<string, number>>, composite_index: number,
 *   exceedances: readonly string[], compliant: boolean, unit: string}>}
 * @reference DFG 2019 List of MAK and BAT Values DOI:10.1002/9783527826124
 * @reference ACGIH 2024 TLVs and BEIs ISBN 978-1-607260-97-2
 */
export function biologicalMonitoringEquivalent(blood_Pb_ug_dL: number, urine_As_ug_L: number, urine_Cr_ug_g_creat: number, blood_Hg_ug_L: number, urine_Cd_ug_g_creat: number): Readonly<{fractions: Readonly<Record<string, number>>, composite_index: number, exceedances: readonly string[], compliant: boolean, unit: string}> {
    const inputs = [blood_Pb_ug_dL, urine_As_ug_L, urine_Cr_ug_g_creat, blood_Hg_ug_L, urine_Cd_ug_g_creat];
    const names = ['blood_Pb', 'urine_As', 'urine_Cr', 'blood_Hg', 'urine_Cd'];
    for (let i = 0; i < inputs.length; i++) {
        if (inputs[i]! < 0) throw new RangeError(`${names[i]} must be >= 0`);
    }

    const BEI = BIOLOGICAL_EXPOSURE_INDICES;
    const fractionMap = {
        blood_Pb: blood_Pb_ug_dL / BEI.blood_Pb_ug_dL,
        urine_As: urine_As_ug_L / BEI.urine_As_ug_L,
        urine_Cr: urine_Cr_ug_g_creat / BEI.urine_Cr_ug_g_creat,
        blood_Hg: blood_Hg_ug_L / BEI.blood_Hg_ug_L,
        urine_Cd: urine_Cd_ug_g_creat / BEI.urine_Cd_ug_g_creat,
    };

    const exceedances = [];
    let composite_index = 0;
    for (const [key, frac] of Object.entries(fractionMap)) {
        if (frac > 1) exceedances.push(key);
        if (frac > composite_index) composite_index = frac;
    }

    return Object.freeze({
        fractions: Object.freeze({ ...fractionMap }),
        composite_index,
        exceedances: Object.freeze([...exceedances]),
        compliant: exceedances.length === 0,
        unit: 'BEI fraction',
    });
}

// ---------------------------------------------------------------------------
// 6. Enclosed Space Atmosphere (OSHA 29 CFR 1910.146)
// ---------------------------------------------------------------------------

/**
 * Assess confined space atmospheric conditions against OSHA 29 CFR 1910.146
 * permit-required confined space thresholds. Computes ventilation purge time
 * and determines permit requirement.
 *
 * Ventilation purge time (simplified):
 *   t_purge = -volume / vent_rate × ln(C_target / C_initial)
 *   (exponential dilution model, well-mixed assumption)
 *
 * @param {number} O2_pct           - Measured O₂ concentration (%)
 * @param {number} LEL_pct          - Measured LEL (% of LEL)
 * @param {number} H2S_ppm          - Measured H₂S (ppm)
 * @param {number} CO_ppm           - Measured CO (ppm)
 * @param {number} benzene_ppm      - Measured benzene (ppm)
 * @param {number} volume_m3        - Space volume (m³)
 * @param {number} ventilation_m3_hr - Ventilation flow rate (m³/hr)
 * @returns {Readonly<{permit_required: boolean, can_enter: boolean,
 *   atmosphere_status: string, hazards: readonly string[],
 *   purge_time_hr: number|null, unit: string}>}
 * @reference OSHA 29 CFR 1910.146 (permit-required confined spaces)
 * @reference NFPA 350 (2021) Guide for Safe Confined Space Entry
 */
/**
 * Validate inputs for enclosed-space atmosphere assessment.
 * @throws {RangeError}
 */
function _validateEnclosedSpaceInputs(
    O2_pct: number,
    LEL_pct: number,
    H2S_ppm: number,
    CO_ppm: number,
    benzene_ppm: number,
    volume_m3: number,
    ventilation_m3_hr: number,
) {
    if (O2_pct < 0 || O2_pct > 100) throw new RangeError('O2_pct must be in [0, 100]');
    if (LEL_pct < 0) throw new RangeError('LEL_pct must be >= 0');
    if (H2S_ppm < 0) throw new RangeError('H2S_ppm must be >= 0');
    if (CO_ppm < 0) throw new RangeError('CO_ppm must be >= 0');
    if (benzene_ppm < 0) throw new RangeError('benzene_ppm must be >= 0');
    if (volume_m3 <= 0) throw new RangeError('volume_m3 must be > 0');
    if (ventilation_m3_hr < 0) throw new RangeError('ventilation_m3_hr must be >= 0');
}

/**
 * Detect atmospheric hazards against OSHA confined-space thresholds.
 */
function _detectConfinedSpaceHazards(
    O2_pct: number,
    LEL_pct: number,
    H2S_ppm: number,
    CO_ppm: number,
    benzene_ppm: number,
    T: typeof CONFINED_SPACE_THRESHOLDS,
): string[] {
    const hazards: string[] = [];
    if (O2_pct < T.O2_min_pct) hazards.push('oxygen_deficient');
    if (O2_pct > T.O2_max_pct) hazards.push('oxygen_enriched');
    if (LEL_pct >= T.LEL_prohibit_pct) hazards.push('explosive_atmosphere');
    else if (LEL_pct >= T.LEL_action_pct) hazards.push('LEL_action_level');
    if (H2S_ppm >= T.H2S_IDLH_ppm) hazards.push('H2S_IDLH');
    else if (H2S_ppm >= T.H2S_TLV_ppm) hazards.push('H2S_elevated');
    if (CO_ppm >= T.CO_IDLH_ppm) hazards.push('CO_IDLH');
    else if (CO_ppm >= T.CO_PEL_ppm) hazards.push('CO_above_PEL');
    if (benzene_ppm >= T.benzene_IDLH_ppm) hazards.push('benzene_IDLH');
    else if (benzene_ppm >= T.benzene_PEL_ppm) hazards.push('benzene_above_PEL');
    return hazards;
}

/**
 * Determine whether the atmosphere is immediately dangerous to life or health.
 */
function _isAtmosphereIDLH(
    O2_pct: number,
    LEL_pct: number,
    H2S_ppm: number,
    CO_ppm: number,
    benzene_ppm: number,
    T: typeof CONFINED_SPACE_THRESHOLDS,
): boolean {
    return (
        O2_pct < 16 ||
        LEL_pct >= T.LEL_prohibit_pct ||
        H2S_ppm >= T.H2S_IDLH_ppm ||
        CO_ppm >= T.CO_IDLH_ppm ||
        benzene_ppm >= T.benzene_IDLH_ppm
    );
}

/**
 * Classify the overall atmosphere status.
 */
function _classifyAtmosphereStatus(is_IDLH: boolean, hasHazards: boolean): string {
    if (is_IDLH) return 'IDLH_immediately_dangerous';
    if (hasHazards) return 'permit_required';
    return 'safe_for_entry';
}

/**
 * Compute ventilation purge time using exponential dilution.
 */
function _computePurgeTime(
    O2_pct: number,
    LEL_pct: number,
    volume_m3: number,
    ventilation_m3_hr: number,
    T: typeof CONFINED_SPACE_THRESHOLDS,
): number | null {
    if (ventilation_m3_hr <= 0 || (O2_pct >= T.O2_min_pct && LEL_pct < T.LEL_action_pct)) {
        return null;
    }
    const tau = volume_m3 / ventilation_m3_hr;
    if (LEL_pct >= T.LEL_action_pct) {
        const target_LEL_pct = 5;
        return LEL_pct > target_LEL_pct ? tau * Math.log(LEL_pct / target_LEL_pct) : 0;
    }
    const dO2 = 21 - O2_pct;
    return dO2 > 0 ? tau * Math.log(dO2 / 0.5) : 0;
}

export function enclosedSpaceAtmosphere(
    O2_pct: number,
    LEL_pct: number,
    H2S_ppm: number,
    CO_ppm: number,
    benzene_ppm: number,
    volume_m3: number,
    ventilation_m3_hr: number,
): Readonly<{permit_required: boolean, can_enter: boolean, atmosphere_status: string, hazards: readonly string[], purge_time_hr: number|null, unit: string}> {
    _validateEnclosedSpaceInputs(O2_pct, LEL_pct, H2S_ppm, CO_ppm, benzene_ppm, volume_m3, ventilation_m3_hr);

    const T = CONFINED_SPACE_THRESHOLDS;
    const hazards = _detectConfinedSpaceHazards(O2_pct, LEL_pct, H2S_ppm, CO_ppm, benzene_ppm, T);
    const is_IDLH = _isAtmosphereIDLH(O2_pct, LEL_pct, H2S_ppm, CO_ppm, benzene_ppm, T);
    const atmosphere_status = _classifyAtmosphereStatus(is_IDLH, hazards.length > 0);
    const purge_time_hr = _computePurgeTime(O2_pct, LEL_pct, volume_m3, ventilation_m3_hr, T);

    return Object.freeze({
        permit_required: hazards.length > 0,
        can_enter: !is_IDLH,
        atmosphere_status,
        hazards: Object.freeze([...hazards]),
        purge_time_hr: purge_time_hr === null ? null : Math.max(0, purge_time_hr),
        unit: 'ppm/% as measured',
    });
}

// ---------------------------------------------------------------------------
// 7. Nanoparticle Exposure Risk (NIOSH CIB 65 + CB Nanotool)
// ---------------------------------------------------------------------------

/**
 * Assess nanoparticle/ultrafine particle exposure risk using NIOSH CIB 65
 * (2011) provisional RELs and the CB Nanotool risk-banding approach
 * (Paik et al. 2008). Returns risk score 0–100 and control band CB1–CB4.
 *
 * CB Nanotool risk score (simplified):
 *   Severity score = f(particle_composition, size_nm)
 *   Probability score = f(concentration, work_hrs, control_type)
 *   Risk = sqrt(severity × probability) × 10  [0–100]
 *
 * @param {number} particle_concentration_N_cm3 - Number concentration (particles/cm³)
 * @param {number} size_nm                - Primary particle size (nm)
 * @param {number} surface_area_ug_cm3    - Surface area metric (µg/cm³ air), 0 if unknown
 * @param {string} control_type            - Material: 'TiO2'|'CNT'|'CNF'|'Ag'|'ZnO'|'generic'
 * @param {number} control_type       - Daily work hours with exposure
 * @param {string} control_type          - 'none'|'LEV'|'enclosure'|'PPE'
 * @returns {Readonly<{risk_score: number, control_band: string, REL_mg_m3: number,
 *   is_ultrafine: boolean, niosh_rel_exceeded: boolean, recommendation: string, unit: string}>}
 * @reference NIOSH 2011 CIB No. 65 DHHS Pub. No. 2011-160
 * @reference Paik et al. 2008 Ann. Occup. Hyg. 52(5):419 DOI:10.1093/annhyg/men029
 */
const VALID_NANO_CONTROLS = ['none', 'LEV', 'enclosure', 'PPE'];
const NANO_COMP_SCORES: Record<string, number> = { tio2: 5, cnt: 9, cnf: 9, ag: 7, zno: 6, generic: 5 };
const NANO_CONTROL_REDUCTION: Record<string, number> = { none: 0, PPE: 0.3, LEV: 0.6, enclosure: 0.85 };
const NANO_RECOMMENDATIONS: Record<string, string> = {
    CB1: 'good_practice_controls',
    CB2: 'LEV_recommended',
    CB3: 'LEV_required_plus_RPE',
    CB4: 'containment_specialist_required',
};

/**
 * Validate nanoparticle exposure risk inputs.
 * @throws {RangeError}
 */
function _validateNanoparticleInputs(
    particle_concentration_N_cm3: number,
    size_nm: number,
    surface_area_ug_cm3: number,
    work_hrs_per_day: number,
    control_type: string,
) {
    if (particle_concentration_N_cm3 < 0) throw new RangeError('particle_concentration_N_cm3 must be >= 0');
    if (size_nm <= 0) throw new RangeError('size_nm must be > 0');
    if (surface_area_ug_cm3 < 0) throw new RangeError('surface_area_ug_cm3 must be >= 0');
    if (work_hrs_per_day <= 0 || work_hrs_per_day > 24) throw new RangeError('work_hrs_per_day must be in (0, 24]');
    if (!VALID_NANO_CONTROLS.includes(control_type))
        throw new RangeError(`control_type must be one of: ${VALID_NANO_CONTROLS.join(', ')}`);
}

/**
 * Select NIOSH REL based on material composition and ultrafine classification.
 */
function _selectNanoREL(comp: string, is_ultrafine: boolean): number {
    if (comp === 'tio2' && is_ultrafine) return NIOSH_NANO_REL.TiO2_ultrafine_mg_m3;
    if (comp === 'tio2') return NIOSH_NANO_REL.TiO2_fine_mg_m3;
    if (comp === 'cnt' || comp === 'carbon nanotube') return NIOSH_NANO_REL.carbon_nanotube_mg_m3;
    if (comp === 'cnf' || comp === 'carbon nanofiber') return NIOSH_NANO_REL.carbon_nanofiber_mg_m3;
    if (comp === 'ag' || comp === 'silver') return NIOSH_NANO_REL.silver_mg_m3;
    if (comp === 'zno' || comp === 'zinc oxide') return NIOSH_NANO_REL.zinc_oxide_mg_m3;
    return NIOSH_NANO_REL.generic_mg_m3;
}

/**
 * Compute severity score (0–10) for nanoparticle risk banding.
 */
function _computeNanoSeverity(comp: string, is_ultrafine: boolean): number {
    const size_score = is_ultrafine ? 8 : 4;
    const comp_score = NANO_COMP_SCORES[comp] || 5;
    return (size_score + comp_score) / 2;
}

/**
 * Compute probability score (0–10) based on exposure concentration, duration and controls.
 */
function _computeNanoProbability(
    particle_concentration_N_cm3: number,
    work_hrs_per_day: number,
    control_type: string,
): number {
    const conc_norm = Math.min(1, particle_concentration_N_cm3 / 1e4);
    const hrs_factor = Math.min(1, work_hrs_per_day / 8);
    const reduction = NANO_CONTROL_REDUCTION[control_type] || 0;
    const prob_raw = conc_norm * hrs_factor * (1 - reduction);
    return _clamp(prob_raw * 10, 0, 10);
}

/**
 * Map risk score to CB Nanotool control band.
 */
function _nanoControlBand(risk_score: number): string {
    if (risk_score < 20) return 'CB1';
    if (risk_score < 50) return 'CB2';
    if (risk_score < 75) return 'CB3';
    return 'CB4';
}

/**
 * Estimate whether NIOSH REL is likely exceeded.
 */
function _isNanoRELExceeded(surface_area_ug_cm3: number, REL_mg_m3: number, risk_score: number): boolean {
    if (surface_area_ug_cm3 <= 0) return risk_score > 50;
    const mass_proxy_mg_m3 = surface_area_ug_cm3 / 1000;
    return mass_proxy_mg_m3 > REL_mg_m3;
}

export function nanoparticleExposureRisk(
    particle_concentration_N_cm3: number,
    size_nm: number,
    surface_area_ug_cm3: number,
    composition: string,
    work_hrs_per_day: number,
    control_type: string,
): Readonly<{risk_score: number, control_band: string, REL_mg_m3: number, is_ultrafine: boolean, niosh_rel_exceeded: boolean, recommendation: string, unit: string}> {
    _validateNanoparticleInputs(particle_concentration_N_cm3, size_nm, surface_area_ug_cm3, work_hrs_per_day, control_type);

    const is_ultrafine = size_nm < 100;
    const comp = (composition || 'generic').toLowerCase();
    const REL_mg_m3 = _selectNanoREL(comp, is_ultrafine);
    const severity = _computeNanoSeverity(comp, is_ultrafine);
    const probability = _computeNanoProbability(particle_concentration_N_cm3, work_hrs_per_day, control_type);
    const risk_score = _clamp(Math.sqrt(severity * probability) * 10, 0, 100);
    const control_band = _nanoControlBand(risk_score);

    return Object.freeze({
        risk_score,
        control_band,
        REL_mg_m3,
        is_ultrafine,
        niosh_rel_exceeded: _isNanoRELExceeded(surface_area_ug_cm3, REL_mg_m3, risk_score),
        recommendation: NANO_RECOMMENDATIONS[control_band] ?? '',
        unit: 'risk score 0-100',
    });
}

// ---------------------------------------------------------------------------
// 8. Ergonomic Lifting Index (NIOSH Revised Lifting Equation, Waters 1994)
// ---------------------------------------------------------------------------

/**
 * Compute the Revised NIOSH Lifting Equation (1994) Recommended Weight Limit
 * (RWL) and Lifting Index (LI).
 *
 * RWL = LC × HM × VM × DM × AM × FM × CM
 *
 * Multipliers:
 *   HM = 25/H  (horizontal; max 1 at H=25cm)
 *   VM = 1 − 0.003×|V−75|  (vertical)
 *   DM = 0.82 + 4.5/D  (distance)
 *   AM = 1 − 0.0032×A  (asymmetry)
 *   FM = frequency multiplier (table lookup simplified)
 *   CM = coupling multiplier: 'good'=1, 'fair'=0.95, 'poor'=0.90
 *
 * LI = actual_load / RWL
 *
 * @param {number} load_kg        - Object weight (kg)
 * @param {number} H_cm           - Horizontal distance from ankles to hands (cm)
 * @param {number} V_cm           - Vertical height of hands at lift origin (cm)
 * @param {number} D_cm           - Vertical travel distance (cm)
 * @param {number} A_deg          - Asymmetry angle (degrees, 0–135)
 * @param {number} F_lifts_hr     - Lift frequency (lifts/hr)
 * @param {'good'|'fair'|'poor'} coupling_type - Handle coupling quality
 * @returns {Readonly<{RWL_kg: number, LI: number, risk_category: string,
 *   multipliers: Readonly<Record<string, number>>, unit: string}>}
 * @reference Waters et al. 1994 Ergonomics 37(4):749 DOI:10.1080/00140139408963710
 */
const NIOSH_COUPLING_MAP = Object.freeze({ good: 1.0, fair: 0.95, poor: 0.9 });
const VALID_LIFTING_COUPLING = ['good', 'fair', 'poor'];

/**
 * Validate NIOSH lifting equation inputs.
 * @throws {RangeError}
 */
function _validateLiftingInputs(
    load_kg: number,
    H_cm: number,
    V_cm: number,
    D_cm: number,
    A_deg: number,
    F_lifts_hr: number,
    coupling_type: string,
) {
    if (load_kg <= 0) throw new RangeError('load_kg must be > 0');
    if (H_cm <= 0) throw new RangeError('H_cm must be > 0');
    if (V_cm < 0 || V_cm > 175) throw new RangeError('V_cm must be in [0, 175]');
    if (D_cm <= 0) throw new RangeError('D_cm must be > 0');
    if (A_deg < 0 || A_deg > 135) throw new RangeError('A_deg must be in [0, 135]');
    if (F_lifts_hr < 0) throw new RangeError('F_lifts_hr must be >= 0');
    if (!VALID_LIFTING_COUPLING.includes(coupling_type))
        throw new RangeError(`coupling_type must be one of: ${VALID_LIFTING_COUPLING.join(', ')}`);
}

/**
 * Frequency multiplier (FM) lookup — simplified piecewise from Waters 1994 Table 5.
 */
function _liftingFrequencyMultiplier(F_lifts_hr: number): number {
    if (F_lifts_hr === 0) return 1.0;
    if (F_lifts_hr <= 0.2) return 0.97;
    if (F_lifts_hr <= 1) return 0.94;
    if (F_lifts_hr <= 2) return 0.91;
    if (F_lifts_hr <= 3) return 0.88;
    if (F_lifts_hr <= 4) return 0.84;
    if (F_lifts_hr <= 5) return 0.8;
    if (F_lifts_hr <= 6) return 0.75;
    if (F_lifts_hr <= 7) return 0.7;
    if (F_lifts_hr <= 9) return 0.6;
    if (F_lifts_hr <= 11) return 0.52;
    if (F_lifts_hr <= 13) return 0.45;
    return 0.35;
}

/**
 * Compute NIOSH Revised Lifting Equation multipliers.
 */
function _computeLiftingMultipliers(
    H_cm: number,
    V_cm: number,
    D_cm: number,
    A_deg: number,
    F_lifts_hr: number,
    coupling_type: 'good'|'fair'|'poor',
): { HM: number; VM: number; DM: number; AM: number; FM: number; CM: number } {
    const { H_opt_cm } = NIOSH_RLE;
    const HM = _clamp(H_opt_cm / H_cm, 0, 1);
    const VM = _clamp(1 - 0.003 * Math.abs(V_cm - 75), 0, 1);
    const DM = _clamp(0.82 + 4.5 / D_cm, 0, 1);
    const AM = _clamp(1 - 0.0032 * A_deg, 0, 1);
    const FM = _liftingFrequencyMultiplier(F_lifts_hr);
    const CM = NIOSH_COUPLING_MAP[coupling_type];
    return { HM, VM, DM, AM, FM, CM };
}

/**
 * Classify lifting index into risk category.
 */
function _liftingRiskCategory(LI: number): string {
    if (LI <= 1) return 'acceptable';
    if (LI <= 2) return 'moderate_risk';
    return 'high_risk';
}

export function ergonomicLiftingIndex(
    load_kg: number,
    H_cm: number,
    V_cm: number,
    D_cm: number,
    A_deg: number,
    F_lifts_hr: number,
    coupling_type: 'good'|'fair'|'poor',
): Readonly<{RWL_kg: number, LI: number, risk_category: string, multipliers: Readonly<Record<string, number>>, unit: string}> {
    _validateLiftingInputs(load_kg, H_cm, V_cm, D_cm, A_deg, F_lifts_hr, coupling_type);

    const { LC_kg } = NIOSH_RLE;
    const { HM, VM, DM, AM, FM, CM } = _computeLiftingMultipliers(H_cm, V_cm, D_cm, A_deg, F_lifts_hr, coupling_type);
    const RWL_kg = LC_kg * HM * VM * DM * AM * FM * CM;
    const LI = load_kg / (RWL_kg > 0 ? RWL_kg : 1e-9);

    return Object.freeze({
        RWL_kg,
        LI,
        risk_category: _liftingRiskCategory(LI),
        multipliers: Object.freeze({ HM, VM, DM, AM, FM, CM }),
        unit: 'kg / dimensionless',
    });
}

// ---------------------------------------------------------------------------
// 9. Heat Stress Work Capacity (ISO 7933:2004 + ACGIH TLV)
// ---------------------------------------------------------------------------

/**
 * Compute required sweat rate (ISO 7933:2004) and determine maximum allowable
 * exposure time for heat stress based on ACGIH TLV criteria.
 *
 * Sweat requirement model (simplified ISO 7933):
 *   Ereq = M - Wk  (required evaporative cooling)
 *   SWreq = Ereq / lambda_evap  [g/hr]
 *
 * Maximum exposure time (simplified ISO 7243 + ACGIH limit comparison):
 *   Water loss threshold: SWmax × 3 hr for unacclimatized
 *   ACGIH WBGT-based work/rest allocation (Table TLV Heat Stress)
 *
 * @param {number} WBGT_C              - Wet Bulb Globe Temperature (°C)
 * @param {number} metabolic_rate_W    - Metabolic rate (W); rest≈80, light≈170, moderate≈300, heavy≈415
 * @param {boolean} acclimatization    - Worker is heat-acclimatized
 * @param {number} clothing_WBGT_adj   - WBGT clothing adjustment factor (°C add); 0 for basic work clothing
 * @returns {Readonly<{SWreq_g_hr: number, max_exposure_hr: number,
 *   work_rest_ratio: string, WBGT_effective: number,
 *   heat_category: string, unit: string}>}
 * @reference ISO 7933:2004 §6-8; ACGIH 2024 Heat Stress TLV documentation
 * @reference ISO 7243:1989 amended by ISO 7243:2017
 */
export function heatStressWorkCapacity(WBGT_C: number, metabolic_rate_W: number, acclimatization: boolean, clothing_WBGT_adj: number): Readonly<{SWreq_g_hr: number, max_exposure_hr: number, work_rest_ratio: string, WBGT_effective: number, heat_category: string, unit: string}> {
    if (WBGT_C < -10 || WBGT_C > 60) throw new RangeError('WBGT_C must be in [-10, 60]');
    if (metabolic_rate_W <= 0) throw new RangeError('metabolic_rate_W must be > 0');
    if (clothing_WBGT_adj < 0) throw new RangeError('clothing_WBGT_adj must be >= 0');

    const { Sw_max_g_hr, Sw_max_accl_g_hr, evaporation_latent_J_g } = ISO7933;

    const WBGT_effective = WBGT_C + clothing_WBGT_adj;

    // Approximate ACGIH TLV table (unacclimatized) WBGT limits by metabolic load
    // (ACGIH 2024 Table TLV Heat Stress - condensed 3 categories)
    // Work category: rest=80W, light=170W, moderate=300W, heavy=415W
    // Each has WBGT limits for 100%/75%/50%/25% work-to-rest ratios
    // We find the highest permissible work fraction
    const ACGIH_TABLE: ReadonlyArray<readonly [number, number, number, number, number]> = Object.freeze([
        // [metabolic_W_max, wbgt_100pct, wbgt_75pct, wbgt_50pct, wbgt_25pct]
        Object.freeze([80, 33, 34, 35, 36]),
        Object.freeze([170, 30, 31, 32, 33]),
        Object.freeze([300, 28, 29, 31, 32]),
        Object.freeze([415, 26, 27, 29, 30]),
    ] as ReadonlyArray<readonly [number, number, number, number, number]>);

    const accl_bonus = acclimatization ? 1 : 0;

    // Find closest metabolic category
    const row = ACGIH_TABLE.reduce((prev, curr) =>
        Math.abs(curr[0] - metabolic_rate_W) < Math.abs(prev[0] - metabolic_rate_W) ? curr : prev,
    );
    const limits = [row[1], row[2], row[3], row[4]].map((v) => v + accl_bonus);
    const work_fractions = [1.0, 0.75, 0.5, 0.25];

    let work_fraction = 0;
    let work_rest_ratio = 'no_work_permitted';
    for (let i = 0; i < limits.length; i++) {
        if (WBGT_effective <= limits[i]!) {
            work_fraction = work_fractions[i]!;
            const rest_fraction = 1 - work_fraction;
            work_rest_ratio =
                rest_fraction === 0
                    ? 'continuous_work'
                    : `${Math.round(work_fraction * 60)}min_work_${Math.round(rest_fraction * 60)}min_rest`;
            break;
        }
    }

    // Required sweat rate from metabolic heat (ISO 7933 simplified)
    // Ereq ≈ metabolic_rate × 0.8 (efficiency factor, no external work)
    const E_req_W = metabolic_rate_W * 0.8;
    // Convert W → g/hr: SWreq = E_req [W] × 3600 [s/hr] / lambda [J/g]
    const SWreq_g_hr = (E_req_W * 3600) / evaporation_latent_J_g;

    const SWmax = acclimatization ? Sw_max_accl_g_hr : Sw_max_g_hr;

    // Maximum exposure time based on water balance:
    // Max total water deficit = 3% BW ≈ 2100 g (70 kg person) → time at which SWreq reached
    const MAX_WATER_DEFICIT_g = 2100;
    const net_sw_rate = SWreq_g_hr - SWmax;
    let max_exposure_hr;
    if (net_sw_rate <= 0) {
        // Sweating can compensate - limited by ACGIH work fraction
        max_exposure_hr = work_fraction > 0 ? work_fraction * 8 : 0;
    } else {
        // Time until deficit accumulates
        max_exposure_hr = Math.min(MAX_WATER_DEFICIT_g / net_sw_rate, work_fraction * 8);
    }

    let heat_category;
    if (WBGT_effective < 27) heat_category = 'low';
    else if (WBGT_effective < 32) heat_category = 'moderate';
    else if (WBGT_effective < 36) heat_category = 'high';
    else heat_category = 'very_high';

    return Object.freeze({
        SWreq_g_hr,
        max_exposure_hr,
        work_rest_ratio,
        WBGT_effective,
        heat_category,
        unit: 'g/hr, hr',
    });
}

// ---------------------------------------------------------------------------
// 10. Hand-Arm Vibration A(8) (ISO 5349-1:2001 + EU 2002/44/EC)
// ---------------------------------------------------------------------------

/**
 * Compute hand-arm vibration daily exposure A(8) per ISO 5349-1:2001 and
 * evaluate against EU Directive 2002/44/EC EAV and ELV thresholds.
 * Also returns NIOSH years-to-VWF prediction (Griffin 1997).
 *
 * A(8) = ahw × sqrt(T / T_ref)   where T_ref = 8 hr
 * Frequency-weighted rms acceleration:
 *   ahw_weighted = ahw × Wh(f)  [m/s²]
 *
 * @param {number} acceleration_rms_m_s2 - Unweighted rms acceleration (m/s²)
 * @param {number} frequency_Hz          - Dominant vibration frequency (Hz)
 * @param {number} exposure_hrs_day      - Daily exposure duration (hr)
 * @param {string} tool_type             - Tool descriptor (informational)
 * @returns {Readonly<{ahw_m_s2: number, A8_m_s2: number,
 *   exceeds_EAV: boolean, exceeds_ELV: boolean,
 *   years_to_VWF_50pct: number, action_required: string, unit: string}>}
 * @reference ISO 5349-1:2001 § 6-7
 * @reference EU Directive 2002/44/EC Annex I
 * @reference Griffin 1997 Scand. J. Work Environ. Health 23(4):287 DOI:10.5271/sjweh.222
 */
export function vibrationHandArmHAV(acceleration_rms_m_s2: number, frequency_Hz: number, exposure_hrs_day: number, tool_type: string): Readonly<{ahw_m_s2: number, A8_m_s2: number, exceeds_EAV: boolean, exceeds_ELV: boolean, years_to_VWF_50pct: number, action_required: string, unit: string}> {
    if (acceleration_rms_m_s2 <= 0) throw new RangeError('acceleration_rms_m_s2 must be > 0');
    if (frequency_Hz <= 0) throw new RangeError('frequency_Hz must be > 0');
    if (exposure_hrs_day <= 0 || exposure_hrs_day > 24) throw new RangeError('exposure_hrs_day must be in (0, 24]');

    const T_ref_hr = 8;
    const { EAV_m_s2, ELV_m_s2 } = EU_HAV;

    // Frequency-weighted acceleration (ISO 5349-1)
    const Wh = _iso5349Weight(frequency_Hz);
    const ahw_m_s2 = acceleration_rms_m_s2 * Wh;

    // Daily exposure A(8) = ahw × sqrt(T / 8)
    const A8_m_s2 = ahw_m_s2 * Math.sqrt(exposure_hrs_day / T_ref_hr);

    const exceeds_EAV = A8_m_s2 > EAV_m_s2;
    const exceeds_ELV = A8_m_s2 > ELV_m_s2;

    // NIOSH/Griffin 1997 years-to-50% VWF prediction:
    //   D_y = 31.8 × A8^(-1.06)  (Griffin 1997 Eq. 5)
    // VWF = vibration-induced white finger
    const GRIFFIN_COEFF = 31.8;
    const GRIFFIN_EXP = -1.06;
    const years_to_VWF_50pct = A8_m_s2 > 0 ? GRIFFIN_COEFF * Math.pow(A8_m_s2, GRIFFIN_EXP) : Infinity;

    let action_required;
    if (exceeds_ELV) {
        action_required = 'immediate_reduction_required';
    } else if (exceeds_EAV) {
        action_required = 'control_program_required';
    } else {
        action_required = 'monitor_and_record';
    }

    return Object.freeze({
        ahw_m_s2,
        A8_m_s2,
        exceeds_EAV,
        exceeds_ELV,
        years_to_VWF_50pct,
        action_required,
        tool_type: tool_type || 'unspecified',
        unit: 'm/s²',
    });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const occupationalToxicologyMeta = {
    name: 'occupationalToxicology',
    description: 'occupationalToxicology',
    category: 'analytics',
    familyTags: ['chemical', 'occupational'],
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
