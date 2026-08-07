// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Industrial Waste, LCA & Circular Economy
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Academic References:
// - USEPA (2023). Identification and Listing of Hazardous Waste.
//   40 CFR Part 261 Subpart C. US Code of Federal Regulations.
// - ABNT NBR 10004:2004. Resíduos sólidos - Classificação.
//   Associação Brasileira de Normas Técnicas.
// - ISO 14044:2006. Environmental management - Life cycle assessment —
//   Requirements and guidelines. International Organization for Standardization.
// - IPCC (2006). 2006 IPCC Guidelines for National Greenhouse Gas Inventories,
//   Volume 5: Waste, Chapter 3 (Solid Waste Disposal). IPCC/IGES, Hayama.
// - Ellen MacArthur Foundation (2015). Towards a Circular Economy: Measuring
//   the Circular Economy. Isle/Granta Design, Cambridge.
// - Chertow, M.R. (2000). Industrial symbiosis: literature and taxonomy.
//   Annual Review of Energy and the Environment 25:313-337.
//   DOI: 10.1146/annurev.energy.25.1.313
// - Hewitt, G.F., Shires, G.L. & Bott, T.R. (1994). Process Heat Transfer.
//   CRC Press, Boca Raton, FL.
// - Eurostat (2018). Economy-wide Material Flow Accounts: Handbook 2018 edition.
//   European Union, Luxembourg. DOI: 10.2785/54337
// - WHO (2005). Toxic Equivalency Factors (TEFs) for Dioxin-like Compounds.
//   WHO/EHC/220. World Health Organization, Geneva.
// - OECD (2014). The State of Play on Extended Producer Responsibility (EPR):
//   Opportunities and Challenges. OECD Publishing, Paris.
//   DOI: 10.1787/9789264243521-en

// ---------------------------------------------------------------------------
// Named constants - no magic numbers
// ---------------------------------------------------------------------------

/**
 * USEPA RCRA characteristic waste thresholds (40 CFR 261 Subpart C).
 */
export const RCRA_THRESHOLDS = Object.freeze({
    IGNITABILITY_FLASH_POINT_C: 60, // D001: flash point < 60°C (140°F)
    REACTIVITY_H2S_PPM: 500, // D003: H2S vapour >500 ppm
    REACTIVITY_HCN_PPM: 250, // D003: HCN vapour >250 ppm
    CORROSIVITY_PH_LOWER: 2.0, // D002: pH ≤ 2.0
    CORROSIVITY_PH_UPPER: 12.5, // D002: pH ≥ 12.5
    // TCLP regulatory limits mg/L (Table 1, 40 CFR 261.24)
    TCLP_LIMITS_MG_L: Object.freeze(
        ({
            arsenic: 5.0,
            barium: 100.0,
            benzene: 0.5,
            cadmium: 1.0,
            carbon_tetrachloride: 0.5,
            chlordane: 0.03,
            chlorobenzene: 100.0,
            chloroform: 6.0,
            chromium: 5.0,
            cresol: 200.0,
            '24_D': 10.0,
            '245_TP': 1.0,
            DDT: 0.1,
            '12_dichloroethylene': 0.7,
            endrin: 0.02,
            heptachlor: 0.008,
            hexachlorobenzene: 0.13,
            hexachlorobutadiene: 0.5,
            hexachloroethane: 3.0,
            lead: 5.0,
            lindane: 0.4,
            mercury: 0.2,
            methoxychlor: 10.0,
            methyl_ethyl_ketone: 200.0,
            nitrobenzene: 2.0,
            pentachlorophenol: 100.0,
            pyridine: 5.0,
            selenium: 1.0,
            silver: 5.0,
            tetrachloroethylene: 0.7,
            toxaphene: 0.5,
            trichloroethylene: 0.5,
            '245_trichlorophenol': 400.0,
            '246_trichlorophenol': 2.0,
            vinyl_chloride: 0.2,
        } as Record<string, number>),
    ),
});

/**
 * ABNT NBR 10004:2004 - maximum allowable concentrations for Class IIB (inert) solubilization.
 * Values in mg/L (Anexo G).
 */
export const ABNT_10004_INERT_LIMITS_MG_L = Object.freeze(
    ({
        aluminum: 0.2,
        ammonia: 1.5,
        barium: 0.7,
        cadmium: 0.005,
        chloride: 250,
        chromium_total: 0.05,
        color: 15, // uH
        copper: 1.0,
        cyanide: 0.07,
        fluoride: 1.5,
        iron: 0.3,
        lead: 0.01,
        manganese: 0.1,
        mercury: 0.001,
        nitrate: 10,
        pH_min: 6.0,
        pH_max: 9.5,
        sodium: 200,
        sulfate: 250,
        surfactants: 0.5,
        total_dissolved_solids: 500,
        turbidity_NTU: 5,
        zinc: 5.0,
    } as Record<string, number>),
);

/**
 * IPCC 2006 landfill gas constants (Vol. 5, Ch. 3).
 */
export const IPCC_LFG_CONSTANTS = Object.freeze({
    GWP_CH4_100YR: 28, // CH4 GWP (AR5, 100-yr)
    DENSITY_CH4_KG_NM3: 0.716, // kg/Nm3 at 0°C, 1 atm
    LHV_CH4_MJ_NM3: 35.8, // Lower heating value MJ/Nm3
    ELECTRICITY_EFFICIENCY: 0.33, // typical gas-engine efficiency
    DOC_FRACTION_DECOMPOSABLE: 1.0, // fraction of DOC that decomposes (Fcf, conservative = 1)
});

/**
 * Fuel CO2 emission factors (kg CO2/kg fuel) - IPCC 2006 Vol. 2.
 */
export const FUEL_EMISSION_FACTORS = Object.freeze(
    ({
        natural_gas: 2.75,
        diesel: 3.15,
        heavy_fuel_oil: 3.11,
        coal: 2.42,
        biomass: 0.0, // biogenic carbon (short-cycle)
        lpg: 3.02,
    } as Record<string, number>),
);

/**
 * WHO 2005 Toxic Equivalency Factors for dioxin-like compounds (I-TEF scheme).
 */
export const WHO_TEF_2005 = Object.freeze(
    ({
        // Dioxins (PCDD)
        '2378_TCDD': 1.0,
        '12378_PeCDD': 1.0,
        '123478_HxCDD': 0.1,
        '123678_HxCDD': 0.1,
        '123789_HxCDD': 0.1,
        '1234678_HpCDD': 0.01,
        OCDD: 0.0003,
        // Furans (PCDF)
        '2378_TCDF': 0.1,
        '12378_PeCDF': 0.03,
        '23478_PeCDF': 0.3,
        '123478_HxCDF': 0.1,
        '123678_HxCDF': 0.1,
        '234678_HxCDF': 0.1,
        '123789_HxCDF': 0.1,
        '1234678_HpCDF': 0.01,
        '1234789_HpCDF': 0.01,
        OCDF: 0.0003,
        // Dioxin-like PCBs
        PCB_77: 0.0001,
        PCB_81: 0.0003,
        PCB_105: 0.00003,
        PCB_114: 0.00003,
        PCB_118: 0.00003,
        PCB_123: 0.00003,
        PCB_126: 0.1,
        PCB_156: 0.00003,
        PCB_157: 0.00003,
        PCB_167: 0.00003,
        PCB_169: 0.03,
        PCB_189: 0.00003,
    } as Record<string, number>),
);

// EU Directive 2010/75/EU emission limit for dioxins (ng I-TEQ/m3)
const EU_DIRECTIVE_DIOXIN_LIMIT_NG_TEQ_M3 = 0.1;

// Circular economy performance classes (MCI thresholds)
const MCI_CLASS_THRESHOLDS = Object.freeze({
    A: 0.9,
    B: 0.7,
    C: 0.5,
    D: 0.3,
});

// Industrial symbiosis: average CO2 savings from landfill diversion (tCO2e/tonne waste)
const SYMBIOSIS_CO2_SAVINGS_PER_TONNE = 0.5;

// ---------------------------------------------------------------------------
// 1. hazardousWasteClassification
// ---------------------------------------------------------------------------

/**
 * USEPA RCRA characteristic hazardous waste classification (40 CFR 261 Subpart C).
 * Evaluates four characteristics: toxicity (TCLP), ignitability, reactivity,
 * and corrosivity. Returns applicable EPA hazard codes D001-D043.
 *
 * Classificação de resíduos perigosos conforme regulamentação federal dos EUA.
 * Avalia as quatro características de periculosidade e retorna os códigos aplicáveis.
 *
 * @param {Array<{name: string, TCLP_mg_L: number}>} constituents_array - Array de { name: string, TCLP_mg_L: number }
 * @param {Record<string, number>} TCLP_results - { constituentName: measured_mg_L, ... }
 * @param {number} ignitability_C - Flash point in °C (Celsius); NaN = not flammable
 * @param {number} reactivity_H2S_ppm - H2S vapour concentration in ppm
 * @param {number} corrosivity_pH - Aqueous pH of the waste
 * @returns {{ hazardous: boolean, codes: string[], reasons: string[], constituentExceedances: Object[] }}
 * @reference USEPA 40 CFR Part 261 Subpart C (2023)
 */
export function hazardousWasteClassification(constituents_array: Array<{name: string, TCLP_mg_L: number}>, TCLP_results: Record<string, number>, ignitability_C: number, reactivity_H2S_ppm: number, corrosivity_pH: number): { hazardous: boolean, codes: string[], reasons: string[], constituentExceedances: Object[] } {
    if (!Array.isArray(constituents_array)) {
        throw new RangeError('constituents_array must be an array');
    }
    if (typeof TCLP_results !== 'object' || TCLP_results === null) {
        throw new RangeError('TCLP_results must be a non-null object');
    }
    if (typeof corrosivity_pH !== 'number') {
        throw new RangeError('corrosivity_pH must be a number');
    }
    if (corrosivity_pH < 0 || corrosivity_pH > 14) {
        throw new RangeError(`corrosivity_pH must be 0–14, got ${corrosivity_pH}`);
    }

    const codes = [];
    const reasons = [];
    const constituentExceedances = [];

    // D001 - Ignitability
    if (!Number.isNaN(ignitability_C) && ignitability_C < RCRA_THRESHOLDS.IGNITABILITY_FLASH_POINT_C) {
        codes.push('D001');
        reasons.push(`Flash point ${ignitability_C}°C < ${RCRA_THRESHOLDS.IGNITABILITY_FLASH_POINT_C}°C threshold`);
    }

    // D002 - Corrosivity
    if (
        corrosivity_pH <= RCRA_THRESHOLDS.CORROSIVITY_PH_LOWER ||
        corrosivity_pH >= RCRA_THRESHOLDS.CORROSIVITY_PH_UPPER
    ) {
        codes.push('D002');
        reasons.push(
            `pH=${corrosivity_pH} outside [${RCRA_THRESHOLDS.CORROSIVITY_PH_LOWER}, ${RCRA_THRESHOLDS.CORROSIVITY_PH_UPPER})`,
        );
    }

    // D003 - Reactivity
    if (typeof reactivity_H2S_ppm === 'number' && reactivity_H2S_ppm > RCRA_THRESHOLDS.REACTIVITY_H2S_PPM) {
        codes.push('D003');
        reasons.push(`H2S=${reactivity_H2S_ppm} ppm > ${RCRA_THRESHOLDS.REACTIVITY_H2S_PPM} ppm`);
    }

    // D004–D043 - Toxicity (TCLP)
    const tclpLimits = RCRA_THRESHOLDS.TCLP_LIMITS_MG_L;
    for (const [constituent, measured] of Object.entries(TCLP_results)) {
        const limit = tclpLimits[constituent];
        if (limit !== undefined && typeof measured === 'number' && measured > limit) {
            constituentExceedances.push({ constituent, measured, limit, ratio: measured / limit });
            // Map key constituents to specific codes; others map to D039 (toxicity-general)
                        const codeMap: Record<string, string>= {
                arsenic: 'D004',
                barium: 'D005',
                benzene: 'D018',
                cadmium: 'D006',
                carbon_tetrachloride: 'D019',
                chlordane: 'D020',
                chromium: 'D007',
                cresol: 'D026',
                lead: 'D008',
                mercury: 'D009',
                selenium: 'D010',
                silver: 'D011',
                vinyl_chloride: 'D043',
            };
            const code = codeMap[constituent] || 'D039';
            if (!codes.includes(code)) codes.push(code);
            reasons.push(`TCLP ${constituent}=${measured} mg/L > limit ${limit} mg/L`);
        }
    }

    return {
        hazardous: codes.length > 0,
        codes,
        reasons,
        constituentExceedances,
    };
}

// ---------------------------------------------------------------------------
// 2. abnt10004WasteClass
// ---------------------------------------------------------------------------

/**
 * ABNT NBR 10004:2004 Brazilian waste classification.
 * Classifies solid waste as Class I (hazardous), Class IIA (non-inert),
 * or Class IIB (inert) based on leaching, solubilization, and physical criteria.
 *
 * Classificação de resíduos sólidos conforme norma brasileira.
 *
 * @param {Record<string, number>} leaching_results - { parameter: mg_L_value, ... } (Anexo F limits)
 * @param {Record<string, number>} number> - { parameter: mg_L_value, ... } (Anexo G limits)
 * @param {Record<string, boolean>} solubilization_results - { flammable: boolean, corrosive: boolean, reactive: boolean, infectious: boolean, toxic: boolean }
 * @returns {{ class: 'I'|'IIA'|'IIB', limiting_parameter: string|null, exceedances: Object[] }}
 * @reference ABNT NBR 10004:2004 - Resíduos Sólidos - Classificação
 */
export function abnt10004WasteClass(leaching_results: Record<string, number>, solubilization_results: Record<string, number>, physical_properties: Record<string, boolean>): { class: 'I'|'IIA'|'IIB', limiting_parameter: string|null, exceedances: Object[] } {
    if (typeof leaching_results !== 'object' || leaching_results === null) {
        throw new RangeError('leaching_results must be a non-null object');
    }
    if (typeof solubilization_results !== 'object' || solubilization_results === null) {
        throw new RangeError('solubilization_results must be a non-null object');
    }
    if (typeof physical_properties !== 'object' || physical_properties === null) {
        throw new RangeError('physical_properties must be a non-null object');
    }

    // Class I - hazardous physical properties
    const hazardPhysical = ['flammable', 'corrosive', 'reactive', 'infectious', 'toxic'];
    for (const prop of hazardPhysical) {
        if (physical_properties[prop] === true) {
            return { class: 'I', limiting_parameter: prop, exceedances: [] };
        }
    }

    // ABNT NBR 10004 Anexo F: leaching limits for Class I (these are conservative limits)
    // Exceeding leaching limits → Class I
    const LEACHING_CLASS_I_MG_L = Object.freeze(
        ({
            arsenic: 1.0,
            barium: 70.0,
            cadmium: 0.5,
            chromium_hexavalent: 2.5,
            lead: 1.0,
            mercury: 0.1,
            selenium: 1.0,
            silver: 5.0,
            fluoride: 150.0,
        } as Record<string, number>),
    );

    const exceedances = [];
    let limitingParameter = null;

    for (const [param, measured] of Object.entries(leaching_results)) {
        if (typeof measured !== 'number') continue;
        const limit = LEACHING_CLASS_I_MG_L[param];
        if (limit !== undefined && measured > limit) {
            exceedances.push({ param, measured, limit, test: 'leaching' });
            if (!limitingParameter) limitingParameter = param;
        }
    }

    if (exceedances.length > 0) {
        return { class: 'I', limiting_parameter: limitingParameter, exceedances };
    }

    // Solubilization test: exceeding inert limits → Class IIA (non-inert)
    const inertLimits = ABNT_10004_INERT_LIMITS_MG_L;
    const solExceedances = [];

    for (const [param, measured] of Object.entries(solubilization_results)) {
        if (typeof measured !== 'number') continue;
        const limit = inertLimits[param];
        if (limit !== undefined && measured > limit) {
            solExceedances.push({ param, measured, limit, test: 'solubilization' });
            if (!limitingParameter) limitingParameter = param;
        }
    }

    if (solExceedances.length > 0) {
        return { class: 'IIA', limiting_parameter: limitingParameter, exceedances: solExceedances };
    }

    return { class: 'IIB', limiting_parameter: null, exceedances: [] };
}

// ---------------------------------------------------------------------------
// 3. lifeCycleInventory
// ---------------------------------------------------------------------------

/**
 * ISO 14040/14044 (2006) Life Cycle Inventory (LCI) calculation.
 * Computes mass balance, energy intensity, transport emissions, and functional
 * unit normalization for a unit process.
 *
 * Inventário do Ciclo de Vida conforme ISO 14044:2006.
 *
 * @param {number} inputs_energy_MJ - Total energy input to process (MJ)
 * @param {number} inputs_materials_kg - Total mass of material inputs (kg)
 * @param {number} outputs_products_kg - Total mass of products/co-products (kg)
 * @param {number} waste_kg - Mass of solid waste generated (kg)
 * @param {number} transport_tkm - Transport in tonne-kilometres (t·km)
 * @param {string} process_type - 'manufacturing'|'treatment'|'recycling'|'disposal'
 * @returns {{ mass_balance_ok: boolean, mass_discrepancy_pct: number, energy_intensity_MJ_kg: number, transport_tCO2e: number, waste_fraction: number, functional_unit_ratio: number, process_type: string }}
 * @reference ISO 14044:2006 Environmental management - Life cycle assessment
 */
export function lifeCycleInventory(inputs_energy_MJ: number, inputs_materials_kg: number, outputs_products_kg: number, waste_kg: number, transport_tkm: number, process_type: string): { mass_balance_ok: boolean, mass_discrepancy_pct: number, energy_intensity_MJ_kg: number, transport_tCO2e: number, waste_fraction: number, functional_unit_ratio: number, process_type: string } {
    if (typeof inputs_energy_MJ !== 'number' || inputs_energy_MJ < 0) {
        throw new RangeError(`inputs_energy_MJ must be >= 0, got ${inputs_energy_MJ}`);
    }
    if (typeof inputs_materials_kg !== 'number' || inputs_materials_kg <= 0) {
        throw new RangeError(`inputs_materials_kg must be > 0, got ${inputs_materials_kg}`);
    }
    if (typeof outputs_products_kg !== 'number' || outputs_products_kg < 0) {
        throw new RangeError(`outputs_products_kg must be >= 0, got ${outputs_products_kg}`);
    }
    if (typeof waste_kg !== 'number' || waste_kg < 0) {
        throw new RangeError(`waste_kg must be >= 0, got ${waste_kg}`);
    }
    if (typeof transport_tkm !== 'number' || transport_tkm < 0) {
        throw new RangeError(`transport_tkm must be >= 0, got ${transport_tkm}`);
    }
    const validTypes = ['manufacturing', 'treatment', 'recycling', 'disposal'];
    if (!validTypes.includes(process_type)) {
        throw new RangeError(`process_type must be one of ${validTypes.join(', ')}`);
    }

    const MASS_BALANCE_TOLERANCE_PCT = 5.0; // ISO 14044 §4.3.3 — ±5% acceptable
    // Average freight transport emission factor: 0.062 kgCO2e/t·km (road, Ecoinvent 3.9)
    const TRANSPORT_EMISSION_FACTOR_KG_CO2E_TKM = 0.062;

    const total_outputs_kg = outputs_products_kg + waste_kg;
    const mass_discrepancy_pct = (Math.abs(inputs_materials_kg - total_outputs_kg) / inputs_materials_kg) * 100;
    const mass_balance_ok = mass_discrepancy_pct <= MASS_BALANCE_TOLERANCE_PCT;

    const energy_intensity_MJ_kg =
        outputs_products_kg > 0 ? inputs_energy_MJ / outputs_products_kg : inputs_energy_MJ / inputs_materials_kg;

    const transport_tCO2e = (transport_tkm * TRANSPORT_EMISSION_FACTOR_KG_CO2E_TKM) / 1000;

    const waste_fraction = waste_kg / inputs_materials_kg;

    // Functional unit ratio: outputs / inputs (process yield)
    const functional_unit_ratio = outputs_products_kg / inputs_materials_kg;

    return {
        mass_balance_ok,
        mass_discrepancy_pct: +mass_discrepancy_pct.toFixed(4),
        energy_intensity_MJ_kg: +energy_intensity_MJ_kg.toFixed(4),
        transport_tCO2e: +transport_tCO2e.toFixed(6),
        waste_fraction: +waste_fraction.toFixed(4),
        functional_unit_ratio: +functional_unit_ratio.toFixed(4),
        process_type,
    };
}

// ---------------------------------------------------------------------------
// 4. landfillGasGeneration
// ---------------------------------------------------------------------------

/**
 * IPCC Tier 2 First Order Decay (FOD) model for landfill gas generation.
 * Calculates annual CH4 generation, recoverable volume, electricity potential,
 * and CO2 equivalent emissions.
 *
 * Modelo FOD IPCC Tier 2 para geração de biogás em aterros sanitários.
 *
 * @param {number} waste_mass_tonne - Mass of waste deposited (tonnes)
 * @param {number} DOC_pct - Degradable organic carbon content (% of wet weight, 0–100)
 * @param {number} k_decay_yr - First-order decay rate constant (yr⁻¹, typical 0.02–0.4)
 * @param {number} MCF - Methane correction factor (0–1; 1 for managed anaerobic)
 * @param {number} F_methane - Fraction of CH4 in landfill gas (volumetric, 0–1)
 * @param {number} collection_efficiency_pct - Gas collection efficiency (0–100)
 * @param {number} elapsed_yr - Years since waste deposition (>0)
 * @returns {{ CH4_generation_tonne_yr: number, CH4_collected_Nm3_yr: number, electricity_potential_kWh_yr: number, CO2e_yr: number, uncollected_CH4_tCO2e: number }}
 * @reference IPCC 2006 NHGI Guidelines Vol. 5, Chapter 3 (First Order Decay)
 */
export function landfillGasGeneration(waste_mass_tonne: number, DOC_pct: number, k_decay_yr: number, MCF: number, F_methane: number, collection_efficiency_pct: number, elapsed_yr: number): { CH4_generation_tonne_yr: number, CH4_collected_Nm3_yr: number, electricity_potential_kWh_yr: number, CO2e_yr: number, uncollected_CH4_tCO2e: number } {
    if (typeof waste_mass_tonne !== 'number' || waste_mass_tonne <= 0) {
        throw new RangeError(`waste_mass_tonne must be > 0, got ${waste_mass_tonne}`);
    }
    if (typeof DOC_pct !== 'number' || DOC_pct < 0 || DOC_pct > 100) {
        throw new RangeError(`DOC_pct must be 0–100, got ${DOC_pct}`);
    }
    if (typeof k_decay_yr !== 'number' || k_decay_yr <= 0) {
        throw new RangeError(`k_decay_yr must be > 0, got ${k_decay_yr}`);
    }
    if (typeof MCF !== 'number' || MCF < 0 || MCF > 1) {
        throw new RangeError(`MCF must be 0–1, got ${MCF}`);
    }
    if (typeof F_methane !== 'number' || F_methane <= 0 || F_methane > 1) {
        throw new RangeError(`F_methane must be (0,1], got ${F_methane}`);
    }
    if (
        typeof collection_efficiency_pct !== 'number' ||
        collection_efficiency_pct < 0 ||
        collection_efficiency_pct > 100
    ) {
        throw new RangeError(`collection_efficiency_pct must be 0–100, got ${collection_efficiency_pct}`);
    }
    if (typeof elapsed_yr !== 'number' || elapsed_yr <= 0) {
        throw new RangeError(`elapsed_yr must be > 0, got ${elapsed_yr}`);
    }

    const DOC_fraction = DOC_pct / 100;
    // IPCC Eq. 3.1: Q_CH4(t) = MCF × DOC_fraction × DOCf × F × 16/12 × W × k × e^(-k×t)
    // DOCf = fraction of DOC that can decompose = IPCC_LFG_CONSTANTS.DOC_FRACTION_DECOMPOSABLE
    const DOCf = IPCC_LFG_CONSTANTS.DOC_FRACTION_DECOMPOSABLE;
    const MOLAR_RATIO_CH4_C = 16 / 12; // CH4 molecular mass ratio

    const CH4_generation_tonne_yr =
        MCF *
        DOC_fraction *
        DOCf *
        F_methane *
        MOLAR_RATIO_CH4_C *
        waste_mass_tonne *
        k_decay_yr *
        Math.exp(-k_decay_yr * elapsed_yr);

    // Convert to Nm3/yr using CH4 density
    const CH4_generation_Nm3_yr = (CH4_generation_tonne_yr * 1000) / IPCC_LFG_CONSTANTS.DENSITY_CH4_KG_NM3;

    const collection_fraction = collection_efficiency_pct / 100;
    const CH4_collected_Nm3_yr = CH4_generation_Nm3_yr * collection_fraction;

    // Electricity potential from collected gas (kWh/yr)
    const electricity_potential_kWh_yr =
        (CH4_collected_Nm3_yr * IPCC_LFG_CONSTANTS.LHV_CH4_MJ_NM3 * IPCC_LFG_CONSTANTS.ELECTRICITY_EFFICIENCY) / 3.6; // MJ to kWh

    // Total CO2e emissions: uncollected CH4 × GWP_CH4
    const uncollected_CH4_tonne_yr = CH4_generation_tonne_yr * (1 - collection_fraction);
    const uncollected_CH4_tCO2e = uncollected_CH4_tonne_yr * IPCC_LFG_CONSTANTS.GWP_CH4_100YR;

    // Collected + combusted CH4 → CO2 (GWP = 1), net CO2e from site
    const CO2e_yr = uncollected_CH4_tCO2e + CH4_generation_tonne_yr * collection_fraction; // combusted → CO2

    return {
        CH4_generation_tonne_yr: +CH4_generation_tonne_yr.toFixed(4),
        CH4_collected_Nm3_yr: +CH4_collected_Nm3_yr.toFixed(1),
        electricity_potential_kWh_yr: +electricity_potential_kWh_yr.toFixed(1),
        CO2e_yr: +CO2e_yr.toFixed(4),
        uncollected_CH4_tCO2e: +uncollected_CH4_tCO2e.toFixed(4),
    };
}

// ---------------------------------------------------------------------------
// 5. ecodesignMaterialIndex
// ---------------------------------------------------------------------------

/**
 * Ellen MacArthur Foundation (2015) Material Circularity Indicator (MCI).
 * Calculates linear flow index (LFI), utility factor, and MCI score.
 * MCI = 1 means fully circular; MCI = 0 means fully linear.
 *
 * Indicador de Circularidade de Material (MCI) conforme Ellen MacArthur Foundation.
 *
 * @param {number} virgin_content_pct - Virgin (primary) material content (0–100 %)
 * @param {number} recycled_content_pct - Recycled/secondary material input (0–100 %)
 * @param {number} recyclability_pct - Fraction of product mass recoverable at end of life (0–100 %)
 * @param {number} hazardous_content_pct - Hazardous material content reducing recyclability (0–100 %)
 * @param {number} lifespan_yr - Average product lifespan (years, > 0)
 * @param {number} mass_kg - Product mass (kg, > 0)
 * @returns {{ LFI: number, utility_factor: number, MCI: number, CE_class: 'A'|'B'|'C'|'D'|'E', virgin_fraction: number, unrecoverable_fraction: number }}
 * @reference Ellen MacArthur Foundation (2015) Measuring the Circular Economy
 */
export function ecodesignMaterialIndex(virgin_content_pct: number, recycled_content_pct: number, recyclability_pct: number, hazardous_content_pct: number, lifespan_yr: number, mass_kg: number): { LFI: number, utility_factor: number, MCI: number, CE_class: 'A'|'B'|'C'|'D'|'E', virgin_fraction: number, unrecoverable_fraction: number } {
    if (typeof virgin_content_pct !== 'number' || virgin_content_pct < 0 || virgin_content_pct > 100) {
        throw new RangeError(`virgin_content_pct must be 0–100, got ${virgin_content_pct}`);
    }
    if (typeof recycled_content_pct !== 'number' || recycled_content_pct < 0 || recycled_content_pct > 100) {
        throw new RangeError(`recycled_content_pct must be 0–100, got ${recycled_content_pct}`);
    }
    if (virgin_content_pct + recycled_content_pct > 100 + 0.01) {
        throw new RangeError(
            `virgin + recycled content exceeds 100% (got ${virgin_content_pct + recycled_content_pct})`,
        );
    }
    if (typeof recyclability_pct !== 'number' || recyclability_pct < 0 || recyclability_pct > 100) {
        throw new RangeError(`recyclability_pct must be 0–100, got ${recyclability_pct}`);
    }
    if (typeof hazardous_content_pct !== 'number' || hazardous_content_pct < 0 || hazardous_content_pct > 100) {
        throw new RangeError(`hazardous_content_pct must be 0–100, got ${hazardous_content_pct}`);
    }
    if (typeof lifespan_yr !== 'number' || lifespan_yr <= 0) {
        throw new RangeError(`lifespan_yr must be > 0, got ${lifespan_yr}`);
    }
    if (typeof mass_kg !== 'number' || mass_kg <= 0) {
        throw new RangeError(`mass_kg must be > 0, got ${mass_kg}`);
    }

    // Fractions (0–1)
    const virgin_fraction = virgin_content_pct / 100;
    // eslint-disable-next-line
    const recycled_fraction = recycled_content_pct / 100;
    const recyclability_fraction = recyclability_pct / 100;
    const hazardous_fraction = hazardous_content_pct / 100;

    // Effective recyclability reduced by hazardous content
    const effective_recyclability = recyclability_fraction * (1 - hazardous_fraction);

    // Unrecoverable fraction
    const unrecoverable_fraction = 1 - effective_recyclability;

    // Linear flow index: average of virgin input fraction and unrecoverable output fraction
    const LFI = (virgin_fraction + unrecoverable_fraction) / 2;

    // Utility factor U: normalised by average industry lifespan (assumed 5 yr baseline)
    const INDUSTRY_AVG_LIFESPAN_YR = 5;
    const utility_factor = lifespan_yr / INDUSTRY_AVG_LIFESPAN_YR;

    // W_f = weighting factor that adjusts for utility; from EMF 2015 eq: W_f = 0.9 / U (capped at 1)
    const W_f = Math.min(1.0, 0.9 / utility_factor);

    // MCI = max(0, 1 - LFI × W_f)
    const MCI = Math.max(0, 1 - LFI * W_f);

        let CE_class: 'A'|'B'|'C'|'D'|'E';
    if (MCI >= MCI_CLASS_THRESHOLDS.A) CE_class = 'A';
    else if (MCI >= MCI_CLASS_THRESHOLDS.B) CE_class = 'B';
    else if (MCI >= MCI_CLASS_THRESHOLDS.C) CE_class = 'C';
    else if (MCI >= MCI_CLASS_THRESHOLDS.D) CE_class = 'D';
    else CE_class = 'E';

    return {
        LFI: +LFI.toFixed(4),
        utility_factor: +utility_factor.toFixed(4),
        MCI: +MCI.toFixed(4),
        CE_class,
        virgin_fraction: +virgin_fraction.toFixed(4),
        unrecoverable_fraction: +unrecoverable_fraction.toFixed(4),
    };
}

// ---------------------------------------------------------------------------
// 6. industrialSymbiosisOpportunity
// ---------------------------------------------------------------------------

/**
 * Chertow (2000) industrial symbiosis waste-to-resource matching and valuation.
 * Evaluates pairing between facility outputs (wastes) and facility inputs (needs),
 * calculates landfill diversion, CO2 savings, economic value, and payback period.
 *
 * Avaliação de simbiose industrial: pareamento de resíduos e recursos.
 *
 * @param {Array<{material: string, mass_tonne_yr: number, cost_disposal_USD_tonne?: number}>} facility_outputs_array - [{ material: string, mass_tonne_yr: number, cost_disposal_USD_tonne: number }]
 * @param {Array<{material: string, mass_tonne_yr: number, cost_virgin_USD_tonne?: number}>} facility_inputs_array - [{ material: string, mass_tonne_yr: number, cost_virgin_USD_tonne: number }]
 * @param {number} transport_distance_km - Transport distance between facilities (km)
 * @param {number} value_captured_USD_tonne - Net value from exchange USD/tonne (can be 0)
 * @returns {{ pairs: Object[], total_diverted_tonne_yr: number, CO2_savings_tCO2e_yr: number, economic_value_USD_yr: number, payback_yr: number|null }}
 * @reference Chertow (2000) Annual Review of Energy and the Environment 25:313-337
 */
export function industrialSymbiosisOpportunity(facility_outputs_array: Array<{material: string, mass_tonne_yr: number, cost_disposal_USD_tonne?: number}>, facility_inputs_array: Array<{material: string, mass_tonne_yr: number, cost_virgin_USD_tonne?: number}>, transport_distance_km: number, value_captured_USD_tonne: number): { pairs: Object[], total_diverted_tonne_yr: number, CO2_savings_tCO2e_yr: number, economic_value_USD_yr: number, payback_yr: number|null } {
    if (!Array.isArray(facility_outputs_array) || facility_outputs_array.length === 0) {
        throw new RangeError('facility_outputs_array must be a non-empty array');
    }
    if (!Array.isArray(facility_inputs_array) || facility_inputs_array.length === 0) {
        throw new RangeError('facility_inputs_array must be a non-empty array');
    }
    if (typeof transport_distance_km !== 'number' || transport_distance_km < 0) {
        throw new RangeError(`transport_distance_km must be >= 0, got ${transport_distance_km}`);
    }
    if (typeof value_captured_USD_tonne !== 'number') {
        throw new RangeError('value_captured_USD_tonne must be a number');
    }

    // Road freight cost ~0.15 USD/tonne·km (global average)
    const TRANSPORT_COST_USD_TONNE_KM = 0.15;
    const transport_cost_USD_tonne = transport_distance_km * TRANSPORT_COST_USD_TONNE_KM;

    // Build lookup from inputs
    const inputsMap = new Map();
    for (const inp of facility_inputs_array) {
        if (inp.material && typeof inp.mass_tonne_yr === 'number') {
            inputsMap.set(inp.material.toLowerCase(), inp);
        }
    }

    const pairs = [];
    let total_diverted_tonne_yr = 0;
    let economic_value_USD_yr = 0;

    for (const out of facility_outputs_array) {
        if (!out.material || typeof out.mass_tonne_yr !== 'number') continue;
        const match = inputsMap.get(out.material.toLowerCase());
        if (!match) continue;

        const matched_mass = Math.min(out.mass_tonne_yr, match.mass_tonne_yr);
        const disposal_savings = (out.cost_disposal_USD_tonne || 0) * matched_mass;
        const virgin_savings = (match.cost_virgin_USD_tonne || 0) * matched_mass;
        const transport_cost = transport_cost_USD_tonne * matched_mass;
        const net_value = disposal_savings + virgin_savings - transport_cost + value_captured_USD_tonne * matched_mass;

        total_diverted_tonne_yr += matched_mass;
        economic_value_USD_yr += net_value;

        pairs.push({
            material: out.material,
            matched_mass_tonne_yr: +matched_mass.toFixed(2),
            disposal_savings_USD_yr: +disposal_savings.toFixed(2),
            virgin_savings_USD_yr: +virgin_savings.toFixed(2),
            transport_cost_USD_yr: +transport_cost.toFixed(2),
            net_value_USD_yr: +net_value.toFixed(2),
        });
    }

    const CO2_savings_tCO2e_yr = total_diverted_tonne_yr * SYMBIOSIS_CO2_SAVINGS_PER_TONNE;

    // Payback assumes infrastructure investment ~50 USD/tonne·yr capacity
    const INFRA_INVESTMENT_USD_TONNE_YR = 50;
    const infra_investment = total_diverted_tonne_yr * INFRA_INVESTMENT_USD_TONNE_YR;
    const payback_yr = economic_value_USD_yr > 0 ? +(infra_investment / economic_value_USD_yr).toFixed(2) : null;

    return {
        pairs,
        total_diverted_tonne_yr: +total_diverted_tonne_yr.toFixed(2),
        CO2_savings_tCO2e_yr: +CO2_savings_tCO2e_yr.toFixed(4),
        economic_value_USD_yr: +economic_value_USD_yr.toFixed(2),
        payback_yr,
    };
}

// ---------------------------------------------------------------------------
// 7. wasteHeatRecovery
// ---------------------------------------------------------------------------

/**
 * Rankine-cycle waste heat recovery analysis (Hewitt et al. 1994).
 * Calculates recoverable power, Carnot efficiency, fuel savings, CO2 abatement,
 * and simple payback period.
 *
 * Análise de recuperação de calor residual por ciclo Rankine.
 *
 * @param {number} exhaust_T_C - Exhaust gas temperature (°C)
 * @param {number} ambient_T_C - Ambient / cold-side temperature (°C)
 * @param {number} flow_rate_kg_s - Exhaust mass flow rate (kg/s)
 * @param {number} Cp_kJ_kg_K - Specific heat capacity of exhaust gas (kJ/kg·K)
 * @param {number} recovery_efficiency_pct - Heat exchanger + ORC efficiency (0–100 %)
 * @param {string} fuel_type - Key from FUEL_EMISSION_FACTORS
 * @returns {{ recoverable_heat_kW: number, carnot_efficiency: number, recovered_power_kW: number, fuel_savings_kg_yr: number, CO2_abatement_tCO2e_yr: number }}
 * @reference Hewitt, Shires & Bott (1994) Process Heat Transfer, CRC Press
 */
export function wasteHeatRecovery(exhaust_T_C: number, ambient_T_C: number, flow_rate_kg_s: number, Cp_kJ_kg_K: number, recovery_efficiency_pct: number, fuel_type: string): { recoverable_heat_kW: number, carnot_efficiency: number, recovered_power_kW: number, fuel_savings_kg_yr: number, CO2_abatement_tCO2e_yr: number } {
    if (typeof exhaust_T_C !== 'number') throw new RangeError('exhaust_T_C must be a number');
    if (typeof ambient_T_C !== 'number') throw new RangeError('ambient_T_C must be a number');
    if (exhaust_T_C <= ambient_T_C) {
        throw new RangeError(`exhaust_T_C (${exhaust_T_C}) must be > ambient_T_C (${ambient_T_C})`);
    }
    if (typeof flow_rate_kg_s !== 'number' || flow_rate_kg_s <= 0) {
        throw new RangeError(`flow_rate_kg_s must be > 0, got ${flow_rate_kg_s}`);
    }
    if (typeof Cp_kJ_kg_K !== 'number' || Cp_kJ_kg_K <= 0) {
        throw new RangeError(`Cp_kJ_kg_K must be > 0, got ${Cp_kJ_kg_K}`);
    }
    if (typeof recovery_efficiency_pct !== 'number' || recovery_efficiency_pct < 0 || recovery_efficiency_pct > 100) {
        throw new RangeError(`recovery_efficiency_pct must be 0–100, got ${recovery_efficiency_pct}`);
    }
    if (!(fuel_type in FUEL_EMISSION_FACTORS)) {
        throw new RangeError(`fuel_type '${fuel_type}' not in FUEL_EMISSION_FACTORS`);
    }

    const T_hot_K = exhaust_T_C + 273.15;
    const T_cold_K = ambient_T_C + 273.15;

    // Available heat flux (kW)
    const recoverable_heat_kW = flow_rate_kg_s * Cp_kJ_kg_K * (exhaust_T_C - ambient_T_C);

    // Carnot efficiency (theoretical maximum)
    const carnot_efficiency = 1 - T_cold_K / T_hot_K;

    // Actual recovered power kW
    const recovery_fraction = recovery_efficiency_pct / 100;
    const recovered_power_kW = recoverable_heat_kW * recovery_fraction;

    // Annual energy produced (MJ/yr): seconds per year × kW = kJ/yr / 1000 = MJ/yr
    const SECONDS_PER_YEAR = 365.25 * 24 * 3600;
    const annual_energy_MJ = (recovered_power_kW * SECONDS_PER_YEAR) / 1000;

    // Fuel savings: LHV of natural gas ~44 MJ/kg as baseline (adjust by fuel type)
    const LHV_FUEL_MJ_KG = Object.freeze(
        ({
            natural_gas: 50.0,
            diesel: 43.0,
            heavy_fuel_oil: 40.5,
            coal: 25.0,
            biomass: 15.0,
            lpg: 46.0,
        } as Record<string, number>),
    );
    const lhv = LHV_FUEL_MJ_KG[fuel_type] || 44.0;
    const fuel_savings_kg_yr = annual_energy_MJ / lhv;

    const emission_factor = FUEL_EMISSION_FACTORS[fuel_type]!;
    const CO2_abatement_tCO2e_yr = (fuel_savings_kg_yr * emission_factor) / 1000;

    return {
        recoverable_heat_kW: +recoverable_heat_kW.toFixed(2),
        carnot_efficiency: +carnot_efficiency.toFixed(4),
        recovered_power_kW: +recovered_power_kW.toFixed(2),
        fuel_savings_kg_yr: +fuel_savings_kg_yr.toFixed(1),
        CO2_abatement_tCO2e_yr: +CO2_abatement_tCO2e_yr.toFixed(4),
    };
}

// ---------------------------------------------------------------------------
// 8. materialFlowAnalysis
// ---------------------------------------------------------------------------

/**
 * Eurostat (2018) Economy-wide Material Flow Accounting (EW-MFA).
 * Calculates Direct Material Input (DMI), Domestic Material Consumption (DMC),
 * resource productivity, waste intensity, and circularity rate.
 *
 * Análise de Fluxo de Materiais conforme metodologia Eurostat.
 *
 * @param {number} production_tonne_yr - Domestic material extraction (tonnes/yr)
 * @param {number} import_tonne_yr - Material imports (tonnes/yr)
 * @param {number} export_tonne_yr - Material exports (tonnes/yr)
 * @param {number} waste_tonne_yr - Waste generated (tonnes/yr)
 * @param {number} stock_change_tonne_yr - Net addition to stocks (tonnes/yr, can be negative)
 * @returns {{ DMI: number, DMC: number, waste_intensity: number, circularity_rate: number, physical_trade_balance: number }}
 * @reference Eurostat (2018) Economy-wide Material Flow Accounts Handbook
 *   DOI: 10.2785/54337
 */
export function materialFlowAnalysis(production_tonne_yr: number, import_tonne_yr: number, export_tonne_yr: number, waste_tonne_yr: number, stock_change_tonne_yr: number): { DMI: number, DMC: number, waste_intensity: number, circularity_rate: number, physical_trade_balance: number } {
    if (typeof production_tonne_yr !== 'number' || production_tonne_yr < 0) {
        throw new RangeError(`production_tonne_yr must be >= 0, got ${production_tonne_yr}`);
    }
    if (typeof import_tonne_yr !== 'number' || import_tonne_yr < 0) {
        throw new RangeError(`import_tonne_yr must be >= 0, got ${import_tonne_yr}`);
    }
    if (typeof export_tonne_yr !== 'number' || export_tonne_yr < 0) {
        throw new RangeError(`export_tonne_yr must be >= 0, got ${export_tonne_yr}`);
    }
    if (typeof waste_tonne_yr !== 'number' || waste_tonne_yr < 0) {
        throw new RangeError(`waste_tonne_yr must be >= 0, got ${waste_tonne_yr}`);
    }
    if (typeof stock_change_tonne_yr !== 'number') {
        throw new RangeError('stock_change_tonne_yr must be a number');
    }

    // Eurostat EW-MFA indicators (Handbook 2018, Chapter 3)
    // DMI = domestic extraction + imports
    const DMI = production_tonne_yr + import_tonne_yr;

    if (DMI === 0) {
        throw new RangeError('DMI is zero — production + imports must be > 0');
    }

    // DMC = DMI - exports
    const DMC = DMI - export_tonne_yr;

    // Physical Trade Balance = imports - exports
    const physical_trade_balance = import_tonne_yr - export_tonne_yr;

    // Waste intensity = waste / DMC (kg waste per kg consumed)
    const waste_intensity = DMC > 0 ? waste_tonne_yr / DMC : 0;

    // Circularity rate = recycled input / DMI (proxy: waste diverted from landfill)
    // Approximate recycled input as (DMI - DMC - stock_change) but bounded [0,1]
    const recycled_proxy = Math.max(0, DMI - Math.max(0, DMC) - Math.max(0, stock_change_tonne_yr));
    const circularity_rate = Math.min(1, recycled_proxy / DMI);

    return {
        DMI: +DMI.toFixed(2),
        DMC: +DMC.toFixed(2),
        waste_intensity: +waste_intensity.toFixed(6),
        circularity_rate: +circularity_rate.toFixed(4),
        physical_trade_balance: +physical_trade_balance.toFixed(2),
    };
}

// ---------------------------------------------------------------------------
// 9. toxicEquivalencyPotential
// ---------------------------------------------------------------------------

/**
 * WHO 2005 Toxic Equivalency Factor (TEF) scheme for dioxin-like compounds.
 * Calculates International TEQ (I-TEQ) and WHO-TEQ aggregated toxicity
 * and compares against EU Directive 2010/75/EU emission limit.
 *
 * Cálculo de Equivalência Tóxica (TEQ) para dioxinas e compostos similares.
 *
 * @param {number} dioxins_ng_TEQ_m3 - Pre-calculated dioxin+furan I-TEQ (ng TEQ/m3)
 * @param {number} PCB_ng_m3 - Total dioxin-like PCB concentration (ng/m3)
 * @param {number} PAH_ng_m3 - Total PAH concentration for co-exposure reference (ng/m3)
 * @param {number} heavy_metals_ug_m3 - Total heavy metals concentration (ug/m3)
 * @param {Record<string, number>} [WHO_TEF?] - Object { compound: TEF_value, ... } overriding defaults
 * @returns {{ WHO_TEQ_ng_m3: number, I_TEQ_ng_m3: number, EU_limit_ng_TEQ_m3: number, exceeds_EU_limit: boolean, PCB_TEQ_contribution_ng_m3: number, risk_class: 'acceptable'|'marginal'|'exceeds_limit' }}
 * @reference WHO (2005) Toxic Equivalency Factors, WHO/EHC/220
 * @reference EU Directive 2010/75/EU, Annex VI - dioxin emission limit 0.1 ng I-TEQ/m3
 */
export function toxicEquivalencyPotential(dioxins_ng_TEQ_m3: number, PCB_ng_m3: number, PAH_ng_m3: number, heavy_metals_ug_m3: number, WHO_TEF?: Record<string, number>): { WHO_TEQ_ng_m3: number, I_TEQ_ng_m3: number, EU_limit_ng_TEQ_m3: number, exceeds_EU_limit: boolean, PCB_TEQ_contribution_ng_m3: number, risk_class: 'acceptable'|'marginal'|'exceeds_limit' } {
    if (typeof dioxins_ng_TEQ_m3 !== 'number' || dioxins_ng_TEQ_m3 < 0) {
        throw new RangeError(`dioxins_ng_TEQ_m3 must be >= 0, got ${dioxins_ng_TEQ_m3}`);
    }
    if (typeof PCB_ng_m3 !== 'number' || PCB_ng_m3 < 0) {
        throw new RangeError(`PCB_ng_m3 must be >= 0, got ${PCB_ng_m3}`);
    }
    if (typeof PAH_ng_m3 !== 'number' || PAH_ng_m3 < 0) {
        throw new RangeError(`PAH_ng_m3 must be >= 0, got ${PAH_ng_m3}`);
    }
    if (typeof heavy_metals_ug_m3 !== 'number' || heavy_metals_ug_m3 < 0) {
        throw new RangeError(`heavy_metals_ug_m3 must be >= 0, got ${heavy_metals_ug_m3}`);
    }

    // Merge provided TEF overrides with WHO defaults
    const effectiveTEF = Object.assign({}, WHO_TEF_2005, WHO_TEF || {});

    // PCB TEQ contribution: use average TEF for dioxin-like PCBs
    // Representative dioxin-like PCBs (PCB-126 dominates at TEF=0.1)
    const PCB_TEQ_fraction = effectiveTEF['PCB_126'] || 0.1;
    const PCB_TEQ_contribution_ng_m3 = PCB_ng_m3 * PCB_TEQ_fraction;

    // I-TEQ = dioxins/furans TEQ (as provided, pre-calculated)
    const I_TEQ_ng_m3 = dioxins_ng_TEQ_m3;

    // WHO-TEQ = I-TEQ + PCB contribution (WHO 2005 approach)
    const WHO_TEQ_ng_m3 = I_TEQ_ng_m3 + PCB_TEQ_contribution_ng_m3;

    const exceeds_EU_limit = WHO_TEQ_ng_m3 > EU_DIRECTIVE_DIOXIN_LIMIT_NG_TEQ_M3;

        let risk_class: 'acceptable'|'marginal'|'exceeds_limit';
    if (WHO_TEQ_ng_m3 <= EU_DIRECTIVE_DIOXIN_LIMIT_NG_TEQ_M3 * 0.5) {
        risk_class = 'acceptable';
    } else if (WHO_TEQ_ng_m3 <= EU_DIRECTIVE_DIOXIN_LIMIT_NG_TEQ_M3) {
        risk_class = 'marginal';
    } else {
        risk_class = 'exceeds_limit';
    }

    return {
        WHO_TEQ_ng_m3: +WHO_TEQ_ng_m3.toFixed(6),
        I_TEQ_ng_m3: +I_TEQ_ng_m3.toFixed(6),
        EU_limit_ng_TEQ_m3: EU_DIRECTIVE_DIOXIN_LIMIT_NG_TEQ_M3,
        exceeds_EU_limit,
        PCB_TEQ_contribution_ng_m3: +PCB_TEQ_contribution_ng_m3.toFixed(6),
        risk_class,
    };
}

// ---------------------------------------------------------------------------
// 10. extendedProducerResponsibility
// ---------------------------------------------------------------------------

/**
 * OECD (2014) Extended Producer Responsibility (EPR) cost-benefit model.
 * Calculates net system cost, subsidy equivalent, compliance cost per unit,
 * break-even recycling rate, and policy comparison.
 *
 * Modelo custo-benefício de Responsabilidade Estendida do Produtor (REP/EPR).
 *
 * @param {number} product_mass_kg - Unit product mass (kg)
 * @param {number} recycling_rate_pct - Current end-of-life recycling rate (0–100 %)
 * @param {number} collection_rate_pct - Collection/take-back rate (0–100 %)
 * @param {number} EPR_fee_USD_tonne - EPR fee paid by producer (USD/tonne product)
 * @param {number} market_value_secondary_USD_tonne - Market value of recovered secondary material (USD/tonne)
 * @param {number} num_products_yr - Annual production volume (units/yr)
 * @returns {{ net_system_cost_USD_yr: number, subsidy_equivalent_USD_unit: number, compliance_cost_USD_unit: number, break_even_recycling_rate_pct: number, revenue_secondary_material_USD_yr: number }}
 * @reference OECD (2014) The State of Play on Extended Producer Responsibility.
 *   DOI: 10.1787/9789264243521-en
 */
export function extendedProducerResponsibility(product_mass_kg: number, recycling_rate_pct: number, collection_rate_pct: number, EPR_fee_USD_tonne: number, market_value_secondary_USD_tonne: number, num_products_yr: number): { net_system_cost_USD_yr: number, subsidy_equivalent_USD_unit: number, compliance_cost_USD_unit: number, break_even_recycling_rate_pct: number, revenue_secondary_material_USD_yr: number } {
    if (typeof product_mass_kg !== 'number' || product_mass_kg <= 0) {
        throw new RangeError(`product_mass_kg must be > 0, got ${product_mass_kg}`);
    }
    if (typeof recycling_rate_pct !== 'number' || recycling_rate_pct < 0 || recycling_rate_pct > 100) {
        throw new RangeError(`recycling_rate_pct must be 0–100, got ${recycling_rate_pct}`);
    }
    if (typeof collection_rate_pct !== 'number' || collection_rate_pct < 0 || collection_rate_pct > 100) {
        throw new RangeError(`collection_rate_pct must be 0–100, got ${collection_rate_pct}`);
    }
    if (typeof EPR_fee_USD_tonne !== 'number' || EPR_fee_USD_tonne < 0) {
        throw new RangeError(`EPR_fee_USD_tonne must be >= 0, got ${EPR_fee_USD_tonne}`);
    }
    if (typeof market_value_secondary_USD_tonne !== 'number') {
        throw new RangeError('market_value_secondary_USD_tonne must be a number');
    }
    if (typeof num_products_yr !== 'number' || num_products_yr <= 0) {
        throw new RangeError(`num_products_yr must be > 0, got ${num_products_yr}`);
    }

    // Total mass stream per year (tonnes)
    const total_mass_tonne_yr = (product_mass_kg * num_products_yr) / 1000;

    // EPR fees collected
    const EPR_fees_total_USD_yr = EPR_fee_USD_tonne * total_mass_tonne_yr;

    // Mass actually recycled
    const recycling_fraction = recycling_rate_pct / 100;
    const collection_fraction = collection_rate_pct / 100;
    const recycled_mass_tonne_yr = total_mass_tonne_yr * collection_fraction * recycling_fraction;

    // Revenue from secondary material
    const revenue_secondary_material_USD_yr = recycled_mass_tonne_yr * market_value_secondary_USD_tonne;

    // System costs: collection + sorting ~150 USD/tonne (OECD 2014 Table 4)
    const COLLECTION_SORTING_COST_USD_TONNE = 150;
    const system_operating_cost_USD_yr = recycled_mass_tonne_yr * COLLECTION_SORTING_COST_USD_TONNE;

    // Net system cost = operating cost - EPR fees - secondary revenue
    const net_system_cost_USD_yr =
        system_operating_cost_USD_yr - EPR_fees_total_USD_yr - revenue_secondary_material_USD_yr;

    // Compliance cost per unit = EPR fee paid per unit
    const compliance_cost_USD_unit = (EPR_fee_USD_tonne * product_mass_kg) / 1000;

    // Subsidy equivalent per unit = net benefit shared across producers
    const subsidy_equivalent_USD_unit =
        net_system_cost_USD_yr > 0 ? 0 : Math.abs(net_system_cost_USD_yr) / num_products_yr;

    // Break-even recycling rate: find r* where system_cost = EPR + secondary revenue
    // COLLECTION_COST × total × collection × r* = EPR_total + total × collection × r* × market
    // r* = EPR_total / (total × collection × (COLLECTION_COST - market))
    const denominator =
        total_mass_tonne_yr *
        collection_fraction *
        (COLLECTION_SORTING_COST_USD_TONNE - market_value_secondary_USD_tonne);
    const break_even_recycling_rate_pct =
        denominator > 0 ? Math.min(100, Math.max(0, (EPR_fees_total_USD_yr / denominator) * 100)) : 100; // if secondary value > collection cost, any recycling breaks even

    return {
        net_system_cost_USD_yr: +net_system_cost_USD_yr.toFixed(2),
        subsidy_equivalent_USD_unit: +subsidy_equivalent_USD_unit.toFixed(4),
        compliance_cost_USD_unit: +compliance_cost_USD_unit.toFixed(4),
        break_even_recycling_rate_pct: +break_even_recycling_rate_pct.toFixed(2),
        revenue_secondary_material_USD_yr: +revenue_secondary_material_USD_yr.toFixed(2),
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const industrialWasteLCAMeta = {
    name: 'industrialWasteLCA',
    description: 'Industrial Waste, LCA & Circular Economy',
    category: 'analytics',
    familyTags: ['industrial', 'waste', 'lca'],
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
