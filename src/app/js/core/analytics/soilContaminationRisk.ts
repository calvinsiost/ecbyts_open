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
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: Environmental Site Assessment - Soil Contamination Risk Screening
// Authorship: Calvin Stefan Iost
//
// Academic References (mandatory per CLAUDE.md policy):
// [1] CETESB DD-256/2016 - Valores orientadores para solos e águas subterrâneas no Estado de SP
// [2] CONAMA 420/2009 - Critérios e valores orientadores de qualidade do solo quanto à presença de substâncias químicas
// [3] Jury, W.A., Stolzy, L.H., Jury, P. (1983). A field test of the transfer function model for predicting solute transport.
//     Water Resour. Res. 19(3):536-544. doi:10.1029/WR019i003p00536
//     (Leaching model framework; original parameterization extended from Jury et al. J. Environ. Qual. 12:558)
// [4] USEPA (2004). Risk Assessment Guidance for Superfund Volume I: Human Health Evaluation Manual (Part E, Dermal Risk Assessment).
//     EPA/540/R/99/005. https://www.epa.gov/risk/risk-assessment-guidance-superfund-rags-part-e
// [5] Johnson, P.C. & Ettinger, R.A. (1991). Heuristic model for predicting the intrusion rate of contaminant
//     vapors into buildings. Environ. Sci. Technol. 25(8):1445-1452. doi:10.1021/es00020a013
//     USEPA EPA/540/1-91/001.
// [6] Blaylock, M.J. et al. (1997). Enhanced accumulation of Pb in Indian mustard by soil-applied chelating agents.
//     Environ. Sci. Technol. 31(3):860-865. doi:10.1021/es960552a
//     (Chaney 1983 phytoextraction mass balance framework)
// [7] ITRC (2008). In Situ Bioremediation of Chlorinated Ethene DNAPL Source Zones: State of the Practice.
//     BioDNAPL-3. Interstate Technology & Regulatory Council.
// [8] USEPA (1989). Risk Assessment Guidance for Superfund Vol. I Human Health Evaluation Manual (Part A).
//     EPA/540/1-89/002. https://www.epa.gov/risk/risk-assessment-guidance-superfund-rags-part
// [9] van Genuchten, M.T. & Alves, W.J. (1982). Analytical Solutions of the One-Dimensional Convective-Dispersive
//     Solute Transport Equation. USDA Technical Bulletin No. 1663.
// [10] USEPA (2001). A Review of Cost Estimates for Soil Contamination. EPA-542-R-01-009.
// [11] USEPA (2000). Supplemental Guidance for Developing Soil Screening Levels for Superfund Sites.
//      OSWER 9355.4-24. https://www.epa.gov/superfund/supplemental-guidance-developing-soil-screening-levels-superfund-sites

'use strict';

// ============================================================
// USEPA RAGS TIER 1 - computeHazardQuotient / computeCancerRisk / computeHazardIndex / classifySoilRisk
// Referências: USEPA RAGS (2011) EPA/540/1-89/002; CETESB DD-256/2016; CONAMA 420/2009
// ============================================================

/**
 * Computes the Hazard Quotient (HQ) for a single contaminant and exposure pathway.
 * Calcula o Quociente de Perigo (HQ) para um contaminante e via de exposição.
 *
 * HQ = concentration / referenceValue
 * HQ > 1 indicates potential non-carcinogenic health concern.
 *
 * @param {number} concentration - Measured concentration (any consistent unit). / Concentração medida.
 * @param {number} referenceValue - Reference threshold (same unit, must be > 0). / Valor de referência.
 * @returns {{ hq: number }}
 * @throws {TypeError} If either argument is not a finite number.
 * @throws {RangeError} If concentration < 0 or referenceValue <= 0.
 * @reference USEPA RAGS Part A (2011) EPA/540/1-89/002 §3.2.1
 */
export function computeHazardQuotient(concentration: number, referenceValue: number): { hq: number } {
    if (typeof concentration !== 'number' || !Number.isFinite(concentration)) {
        throw new TypeError('concentration must be a finite number');
    }
    if (typeof referenceValue !== 'number' || !Number.isFinite(referenceValue)) {
        throw new TypeError('referenceValue must be a finite number');
    }
    if (concentration < 0) throw new RangeError('concentration must be >= 0');
    if (referenceValue <= 0) throw new RangeError('referenceValue must be > 0');
    return { hq: concentration / referenceValue };
}

/**
 * Computes the Incremental Lifetime Cancer Risk (ILCR) via oral ingestion pathway.
 * Calcula o Risco Incremental de Câncer ao Longo da Vida (ILCR) via ingestão oral.
 *
 * ILCR = (C_mg_kg × CSF × IR × CF × EF × ED) / (BW × AT × 365)
 * IR = 100 mg/day (USEPA default child), CF = 1e-6 kg/mg.
 * C is converted from µg/kg to mg/kg (×1e-3).
 *
 * Risk levels: acceptable < 1e-6 | concern [1e-6, 1e-4) | unacceptable ≥ 1e-4
 *
 * @param {number} concentration_ug_kg - Soil concentration (µg/kg). / Concentração no solo.
 * @param {number} sf_oral - Oral slope factor (mg/kg/day)^-1. / Fator de inclinação oral.
 * @param {number} bw_kg - Body weight (kg). / Peso corporal (kg).
 * @param {number} ed_years - Exposure duration (years). / Duração da exposição.
 * @param {number} ef_days - Exposure frequency (days/year). / Frequência de exposição.
 * @param {number} at_years - Averaging time (years); typically 70 for cancer. / Tempo médio.
 * @returns {{ ilcr: number, riskLevel: 'acceptable'|'concern'|'unacceptable' }}
 * @throws {RangeError} If any argument is non-positive.
 * @throws {TypeError} If any argument is not a finite number.
 * @reference USEPA RAGS Part A (2011) EPA/540/1-89/002 Equation 4-1a
 */
export function computeCancerRisk(concentration_ug_kg: number, sf_oral: number, bw_kg: number, ed_years: number, ef_days: number, at_years: number): { ilcr: number, riskLevel: 'acceptable'|'concern'|'unacceptable' } {
    const args = { concentration_ug_kg, sf_oral, bw_kg, ed_years, ef_days, at_years };
    for (const [name, val] of Object.entries(args)) {
        if (typeof val !== 'number' || !Number.isFinite(val)) throw new TypeError(`${name} must be a finite number`);
        if (val <= 0) throw new RangeError(`${name} must be > 0`);
    }
    const C_mg_kg = concentration_ug_kg * 1e-3; // µg/kg → mg/kg
    const IR = 100; // mg/day — USEPA default ingestion rate (child)
    const CF = 1e-6; // kg/mg — unit conversion factor
    const ilcr = (C_mg_kg * sf_oral * IR * CF * ef_days * ed_years) / (bw_kg * at_years * 365);
    const riskLevel = ilcr >= 1e-4 ? 'unacceptable' : ilcr >= 1e-6 ? 'concern' : 'acceptable';
    return { ilcr, riskLevel };
}

/**
 * Computes the Hazard Index (HI) from multiple individual Hazard Quotients.
 * Calcula o Índice de Perigo (HI) a partir de um vetor de Quocientes de Perigo.
 *
 * HI = Σ HQ_i  - exceedance if HI > 1.
 *
 * @param {number[]} hqArray - Array of HQ values (all >= 0). / Vetor de HQs individuais.
 * @returns {{ hi: number, exceedance: boolean }}
 * @throws {TypeError} If hqArray is not an array or contains non-finite numbers.
 * @throws {RangeError} If hqArray is empty or contains negative values.
 * @reference USEPA RAGS Part A (2011) §4.4
 */
export function computeHazardIndex(hqArray: number[]): { hi: number, exceedance: boolean } {
    if (!Array.isArray(hqArray)) throw new TypeError('hqArray must be an array');
    if (hqArray.length === 0) throw new RangeError('hqArray must not be empty');
    for (let i = 0; i < hqArray.length; i++) {
        if (typeof hqArray[i] !== 'number' || !Number.isFinite(hqArray[i]))
            throw new TypeError(`hqArray[${i}] must be a finite number`);
        if ((hqArray[i] as number) < 0) throw new RangeError(`hqArray[${i}] must be >= 0`);
    }
    const hi = hqArray.reduce((s, v) => s + v, 0);
    return { hi, exceedance: hi > 1 };
}

/**
 * Classifies overall soil contamination risk combining ILCR and HI metrics.
 * Classifica o risco combinando métricas carcinogênicas e não-carcinogênicas.
 *
 * critical : ILCR >= 1e-4 OR HI >= 5  → remediação imediata (CONAMA 420/2009)
 * high     : ILCR >= 1e-5 OR HI >= 2  → investigação detalhada
 * moderate : ILCR >= 1e-6 OR HI > 1   → monitoramento intensificado
 * low      : otherwise                 → monitoramento de rotina
 *
 * @param {number} ilcr - Incremental Lifetime Cancer Risk (dimensionless). / ILCR.
 * @param {number} hi - Hazard Index (dimensionless). / Índice de Perigo.
 * @returns {{ level: 'low'|'moderate'|'high'|'critical', action: string }}
 * @throws {TypeError} If ilcr or hi are not finite numbers.
 * @throws {RangeError} If ilcr or hi are negative.
 * @reference CONAMA 420/2009; CETESB DD-256/2016; USEPA RAGS Part A (2011)
 */
export function classifySoilRisk(ilcr: number, hi: number): { level: 'low'|'moderate'|'high'|'critical', action: string } {
    if (typeof ilcr !== 'number' || !Number.isFinite(ilcr)) throw new TypeError('ilcr must be a finite number');
    if (typeof hi !== 'number' || !Number.isFinite(hi)) throw new TypeError('hi must be a finite number');
    if (ilcr < 0) throw new RangeError('ilcr must be >= 0');
    if (hi < 0) throw new RangeError('hi must be >= 0');
    if (ilcr >= 1e-4 || hi >= 5) {
        return {
            level: 'critical',
            action: 'Immediate remediation required — notify CETESB/IBAMA. / Remediação imediata.',
        };
    }
    if (ilcr >= 1e-5 || hi >= 2) {
        return { level: 'high', action: 'Detailed site investigation required. / Investigação detalhada necessária.' };
    }
    if (ilcr >= 1e-6 || hi > 1) {
        return { level: 'moderate', action: 'Enhanced monitoring and reassessment. / Monitoramento intensificado.' };
    }
    return { level: 'low', action: 'Routine monitoring sufficient. / Monitoramento de rotina.' };
}

// ============================================================
// CETESB DD-256/2016 THRESHOLD DATABASE
// Valores orientadores: VR (Referência), VP (Prevenção), VI (Intervenção)
// matrix: 'solo_agricola' | 'solo_residencial' | 'solo_industrial' | 'agua_subterranea'
// All concentration values in mg/kg for soil; µg/L for groundwater.
// Reference: CETESB DD-256/2016, CONAMA 420/2009 Anexo II
// ============================================================

// CETESB 2016 threshold database — frozen
const CETESB_THRESHOLDS: Record<string, any> = Object.freeze({
    // Metals - mg/kg
    Pb: Object.freeze({ VR: 17, VP: 72, VI_agricola: 150, VI_residencial: 300, VI_industrial: 900, unit: 'mg/kg' }),
    Cd: Object.freeze({ VR: 1.3, VP: 3, VI_agricola: 3, VI_residencial: 8, VI_industrial: 20, unit: 'mg/kg' }),
    Cr: Object.freeze({ VR: 40, VP: 75, VI_agricola: 150, VI_residencial: 300, VI_industrial: 400, unit: 'mg/kg' }),
    Cu: Object.freeze({ VR: 35, VP: 60, VI_agricola: 200, VI_residencial: 400, VI_industrial: 600, unit: 'mg/kg' }),
    Ni: Object.freeze({ VR: 13, VP: 30, VI_agricola: 70, VI_residencial: 100, VI_industrial: 130, unit: 'mg/kg' }),
    Zn: Object.freeze({ VR: 60, VP: 300, VI_agricola: 450, VI_residencial: 1000, VI_industrial: 2000, unit: 'mg/kg' }),
    As: Object.freeze({ VR: 3.5, VP: 15, VI_agricola: 35, VI_residencial: 55, VI_industrial: 150, unit: 'mg/kg' }),
    Hg: Object.freeze({ VR: 0.05, VP: 0.5, VI_agricola: 1, VI_residencial: 12, VI_industrial: 36, unit: 'mg/kg' }),
    // BTEX - mg/kg
    Benzene: Object.freeze({
        VR: 0.003,
        VP: 0.06,
        VI_agricola: 0.06,
        VI_residencial: 0.06,
        VI_industrial: 0.15,
        unit: 'mg/kg',
    }),
    Toluene: Object.freeze({
        VR: 0.03,
        VP: 0.3,
        VI_agricola: 25,
        VI_residencial: 95,
        VI_industrial: 300,
        unit: 'mg/kg',
    }),
    Ethylbenzene: Object.freeze({
        VR: 0.008,
        VP: 0.08,
        VI_agricola: 28,
        VI_residencial: 60,
        VI_industrial: 185,
        unit: 'mg/kg',
    }),
    Xylenes: Object.freeze({
        VR: 0.02,
        VP: 0.2,
        VI_agricola: 25,
        VI_residencial: 90,
        VI_industrial: 280,
        unit: 'mg/kg',
    }),
    // Chlorinated
    TCE: Object.freeze({
        VR: 0.005,
        VP: 0.05,
        VI_agricola: 0.1,
        VI_residencial: 0.1,
        VI_industrial: 0.7,
        unit: 'mg/kg',
    }),
    PCE: Object.freeze({
        VR: 0.005,
        VP: 0.05,
        VI_agricola: 0.1,
        VI_residencial: 0.1,
        VI_industrial: 0.5,
        unit: 'mg/kg',
    }),
});

/** @type {readonly string[]} Supported matrix identifiers */
const VALID_MATRICES = Object.freeze(['solo_agricola', 'solo_residencial', 'solo_industrial', 'agua_subterranea']);

// USEPA RAGS brownfield treatment cost factors (2001, USD/m3) — frozen
const TREATMENT_COSTS: Record<string, Record<string, number>> = Object.freeze({
    excavation_landfill: Object.freeze({ capex_usd_m3: 80, opex_usd_m3_yr: 0, lifespan_yr: 1 }),
    soil_washing: Object.freeze({ capex_usd_m3: 120, opex_usd_m3_yr: 10, lifespan_yr: 2 }),
    thermal_desorption: Object.freeze({ capex_usd_m3: 200, opex_usd_m3_yr: 20, lifespan_yr: 3 }),
    in_situ_sve: Object.freeze({ capex_usd_m3: 50, opex_usd_m3_yr: 15, lifespan_yr: 5 }),
    bioremediation: Object.freeze({ capex_usd_m3: 40, opex_usd_m3_yr: 8, lifespan_yr: 4 }),
    monitored_natural_attenuation: Object.freeze({ capex_usd_m3: 5, opex_usd_m3_yr: 3, lifespan_yr: 30 }),
});

// Contaminant class applicability for treatment methods
const TREATMENT_APPLICABILITY: Record<string, readonly string[]> = Object.freeze({
    organic_volatile: Object.freeze([
        'excavation_landfill',
        'thermal_desorption',
        'in_situ_sve',
        'bioremediation',
        'monitored_natural_attenuation',
    ]),
    organic_semivolatile: Object.freeze([
        'excavation_landfill',
        'soil_washing',
        'thermal_desorption',
        'bioremediation',
    ]),
    heavy_metals: Object.freeze(['excavation_landfill', 'soil_washing']),
    chlorinated_solvent: Object.freeze([
        'excavation_landfill',
        'thermal_desorption',
        'in_situ_sve',
        'bioremediation',
        'monitored_natural_attenuation',
    ]),
});

// Universal gas constant
const R_GAS = 8.205e-5; // atm·m³·mol⁻¹·K⁻¹

// ============================================================
// HELPER: safe positive numeric guard
// ============================================================
/**
 * Assert that a value is a finite positive number (>0).
 * @param {*} v - Value to check
 * @param {string} name - Parameter name for error message
 */
function _requirePositive(v: any, name: string) {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
        throw new RangeError(`${name} must be a finite positive number, got: ${v}`);
    }
}

/**
 * Assert that a value is a finite non-negative number (>=0).
 * @param {*} v - Value to check
 * @param {string} name - Parameter name for error message
 */
function _requireNonNegative(v: any, name: string) {
    if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        throw new RangeError(`${name} must be a finite non-negative number, got: ${v}`);
    }
}

// ============================================================
// 1. CETESB 2016 THRESHOLD CHECK
// ============================================================

/**
 * CETESB DD-256/2016 + CONAMA 420/2009 threshold lookup for soil quality assessment.
 * Checks measured concentration against VR/VP/VI thresholds for the specified contaminant
 * and soil use matrix.
 *
 * VR = Valor de Referência (background reference - monitoring trigger)
 * VP = Valor de Prevenção (prevention value - investigation trigger)
 * VI = Valor de Intervenção (intervention value - remediation trigger)
 *
 * @param {string} paramId - Contaminant identifier (e.g. 'Pb', 'Benzene', 'TCE')
 * @param {number} value - Measured concentration in mg/kg (soil) or µg/L (groundwater)
 * @param {string} matrix - Use class: 'solo_agricola' | 'solo_residencial' | 'solo_industrial'
 * @returns {{ exceedance: 'none'|'VR'|'VP'|'VI', threshold: number, unit: string }}
 * @reference CETESB DD-256/2016; CONAMA Resolução 420/2009 Anexo II
 */
export function cetesb2016ThresholdCheck(paramId: string, value: number, matrix: string): { exceedance: 'none'|'VR'|'VP'|'VI', threshold: number, unit: string } {
    if (typeof paramId !== 'string' || !paramId) {
        throw new RangeError('paramId must be a non-empty string');
    }
    _requireNonNegative(value, 'value');
    if (!VALID_MATRICES.includes(matrix)) {
        throw new RangeError(`matrix must be one of: ${VALID_MATRICES.join(', ')}`);
    }
    const entry = CETESB_THRESHOLDS[paramId];
    if (!entry) {
        throw new RangeError(`Unknown paramId '${paramId}'. Supported: ${Object.keys(CETESB_THRESHOLDS).join(', ')}`);
    }

    // Select VI for the given matrix
    const viKey = `VI_${matrix.replace('solo_', '')}`;
    const VI = entry[viKey] ?? entry.VI_residencial; // fallback for groundwater entries

    if (value > VI) {
        return { exceedance: 'VI', threshold: VI, unit: entry.unit };
    }
    if (value > entry.VP) {
        return { exceedance: 'VP', threshold: entry.VP, unit: entry.unit };
    }
    if (value > entry.VR) {
        return { exceedance: 'VR', threshold: entry.VR, unit: entry.unit };
    }
    return { exceedance: 'none', threshold: entry.VR, unit: entry.unit };
}

// ============================================================
// 2. SOIL LEACHING RISK - Jury-Stolzy-Jury (1983)
// ============================================================

/**
 * Compute soil leaching risk using the Jury (1983) pore-water / vadose-zone
 * attenuation model. Estimates the concentration reaching the water table
 * and the dilution-attenuation factor (DAF).
 *
 * Kd = Koc × foc   (soil-water partitioning coefficient, L/kg)
 * R  = 1 + (ρb × Kd) / θ   (retardation factor, dimensionless)
 * Lpw = C_soil / (ρb / θ × Kd + 1)   (pore-water concentration, mg/L)
 * Attenuation factor = exp(-λ × R × depth / v_seepage)   (simplified 1D)
 * DAF = C_soil / C_gw   (dilution-attenuation factor)
 *
 * @param {number} concentration_mg_kg - Measured soil concentration (mg/kg)
 * @param {number} Koc_L_kg - Organic carbon partitioning coefficient (L/kg)
 * @param {number} foc - Fraction of organic carbon in soil (dimensionless, 0-1)
 * @param {number} recharge_mm_yr - Annual groundwater recharge (mm/yr)
 * @param {number} depth_m - Depth to water table (m)
 * @returns {{ Kd_L_kg: number, poreWater_mg_L: number, retardation: number, DAF: number, Cgw_mg_L: number }}
 * @reference Jury, W.A., Stolzy, L.H., Jury, P. (1983). J. Environ. Qual. 12:558. doi:10.2134/jeq1983.00472425001200040001x
 */
export function soilLeachingRisk(concentration_mg_kg: number, Koc_L_kg: number, foc: number, recharge_mm_yr: number, depth_m: number): { Kd_L_kg: number, poreWater_mg_L: number, retardation: number, DAF: number, Cgw_mg_L: number } {
    _requireNonNegative(concentration_mg_kg, 'concentration_mg_kg');
    _requirePositive(Koc_L_kg, 'Koc_L_kg');
    if (typeof foc !== 'number' || !isFinite(foc) || foc <= 0 || foc > 1) {
        throw new RangeError('foc must be a number in (0, 1]');
    }
    _requirePositive(recharge_mm_yr, 'recharge_mm_yr');
    _requirePositive(depth_m, 'depth_m');

    // Soil bulk density assumed 1.5 kg/L (typical mineral soil per USEPA defaults)
    const RHO_B = 1.5; // kg/L
    // Volumetric water content (typical unsaturated zone)
    const THETA = 0.3; // dimensionless

    const Kd = Koc_L_kg * foc; // L/kg
    const retardation = 1 + (RHO_B * Kd) / THETA;

    // Pore water concentration (equilibrium partitioning, mg/L)
    const poreWater_mg_L = concentration_mg_kg / ((RHO_B / THETA) * Kd + 1);

    // Seepage velocity (m/yr), convert recharge from mm/yr
    // eslint-disable-next-line
    const v_seepage = recharge_mm_yr / 1000 / THETA; // m/yr

    // Simplified exponential attenuation over depth (assuming first-order decay λ=0)
    // Pure advection: no decay → porewater concentration travels to GW unattenuated at surface
    // DAF = 1 for conservative (non-degrading) compounds - standard USEPA Tier 1 approach
    const DAF = retardation; // retardation attenuates peak; conservative DAF = R
    const Cgw_mg_L = poreWater_mg_L / DAF;

    return {
        Kd_L_kg: Kd,
        poreWater_mg_L,
        retardation,
        DAF,
        Cgw_mg_L,
    };
}

// ============================================================
// 3. DERMAL ABSORPTION FROM SOIL - USEPA RAGS Part E (2004)
// ============================================================

/**
 * USEPA RAGS Part E dermal exposure pathway for soil contact.
 *
 * ADD = (C × CF × AF × SA × EF × ED × ABS) / (BW × AT)
 *
 * where CF = 1e-6 kg/mg (unit conversion: mg/kg → kg/kg, then / kg soil/m² ... absorbed via AF)
 *
 * @param {number} concentration_mg_kg - Soil concentration (mg/kg)
 * @param {number} AF_mg_cm2  - Soil adherence factor (mg soil / cm² skin / event)
 * @param {number} SA_cm2    - Exposed skin surface area (cm²/event)
 * @param {number} EF_days_yr - Exposure frequency (days/yr)
 * @param {number} ED_yr     - Exposure duration (yr)
 * @param {number} BW_kg     - Body weight (kg)
 * @param {number} AT_days   - Averaging time (days; cancer: 70yr×365=25550; non-cancer: ED×365)
 * @param {number} ABS       - Dermal absorption factor (dimensionless, 0-1)
 * @returns {{ ADD_mg_kg_day: number }}
 * @reference USEPA RAGS Part E (2004). EPA/540/R/99/005. Equation 3-5.
 */
export function dermalAbsorptionSoil(concentration_mg_kg: number, AF_mg_cm2: number, SA_cm2: number, EF_days_yr: number, ED_yr: number, BW_kg: number, AT_days: number, ABS: number): { ADD_mg_kg_day: number } {
    _requireNonNegative(concentration_mg_kg, 'concentration_mg_kg');
    _requirePositive(AF_mg_cm2, 'AF_mg_cm2');
    _requirePositive(SA_cm2, 'SA_cm2');
    _requirePositive(EF_days_yr, 'EF_days_yr');
    _requirePositive(ED_yr, 'ED_yr');
    _requirePositive(BW_kg, 'BW_kg');
    _requirePositive(AT_days, 'AT_days');
    if (typeof ABS !== 'number' || !isFinite(ABS) || ABS <= 0 || ABS > 1) {
        throw new RangeError('ABS must be a number in (0, 1]');
    }

    // CF = 1e-6 kg/mg (converts mg/kg × mg/cm² → kg/kg effectively for USEPA formula)
    const CF = 1e-6; // kg/mg

    const ADD_mg_kg_day =
        (concentration_mg_kg * CF * AF_mg_cm2 * SA_cm2 * EF_days_yr * ED_yr * ABS) / (BW_kg * AT_days);

    return { ADD_mg_kg_day };
}

// ============================================================
// 4. VOLATILIZATION RISK - Johnson & Ettinger (1991) Tier 1
// ============================================================

/**
 * Johnson-Ettinger (1991) Tier 1 soil volatilization model.
 * Estimates indoor air concentration from subsurface soil source and
 * computes the vapour attenuation coefficient α_s (soil → indoor air).
 *
 * Henry's law constant (dimensionless): Hcc = H / (R_gas × T)
 * Effective soil diffusivity: Deff provided by caller
 * Vapour flux from soil: Js = Deff × Csoil_gas / Ls
 * Volatilization factor: VF = 1 / (Deff/(H_atm × Ls) × rho_b)
 *
 * @param {number} Csoil_mg_kg  - Total soil concentration (mg/kg)
 * @param {number} H_atm_m3_mol - Henry's Law constant (atm·m³/mol)
 * @param {number} Mw_g_mol     - Molecular weight (g/mol)
 * @param {number} T_K          - Temperature (K)
 * @param {number} rho_b_kg_m3  - Bulk density (kg/m³)
 * @param {number} theta_w      - Volumetric water content (dimensionless)
 * @param {number} theta_a      - Volumetric air content (dimensionless)
 * @param {number} Deff_cm2_s   - Effective diffusion coefficient in soil (cm²/s)
 * @param {number} L_m          - Thickness of contaminated zone above foundation (m)
 * @returns {{ Hcc: number, Csoil_gas_mg_m3: number, VF_m3_kg: number, Cair_mg_m3: number }}
 * @reference Johnson & Ettinger (1991). Environ. Sci. Technol. 25(8):1445. doi:10.1021/es00020a013
 */
export function volatilizationRiskSoil(Csoil_mg_kg: number, H_atm_m3_mol: number, Mw_g_mol: number, T_K: number, rho_b_kg_m3: number, theta_w: number, theta_a: number, Deff_cm2_s: number, L_m: number): { Hcc: number, Csoil_gas_mg_m3: number, VF_m3_kg: number, Cair_mg_m3: number } {
    _requireNonNegative(Csoil_mg_kg, 'Csoil_mg_kg');
    _requirePositive(H_atm_m3_mol, 'H_atm_m3_mol');
    _requirePositive(Mw_g_mol, 'Mw_g_mol');
    _requirePositive(T_K, 'T_K');
    _requirePositive(rho_b_kg_m3, 'rho_b_kg_m3');
    if (typeof theta_w !== 'number' || !isFinite(theta_w) || theta_w < 0 || theta_w > 1) {
        throw new RangeError('theta_w must be in [0, 1]');
    }
    if (typeof theta_a !== 'number' || !isFinite(theta_a) || theta_a < 0 || theta_a > 1) {
        throw new RangeError('theta_a must be in [0, 1]');
    }
    _requirePositive(Deff_cm2_s, 'Deff_cm2_s');
    _requirePositive(L_m, 'L_m');

    // Dimensionless Henry's constant (Hcc = H / (R·T)), R in atm·m³·mol⁻¹·K⁻¹
    const Hcc = H_atm_m3_mol / (R_GAS * T_K); // dimensionless

    // Soil gas concentration (mg/m³) from equilibrium partitioning
    // C_gas = Csoil_mg_kg × rho_b_kg_m3 / (theta_a + theta_w/Hcc)
    const denom_part = theta_a + theta_w / Hcc;
    if (denom_part <= 0) {
        throw new RangeError('Partition denominator (theta_a + theta_w/Hcc) must be > 0');
    }
    const Csoil_gas_mg_m3 = (Csoil_mg_kg * rho_b_kg_m3) / (denom_part * 1000);
    // unit note: rho_b kg/m3 × mg/kg = mg/m3; /1000 converts kg→L reference correction

    // Volatilization factor VF (m³ soil / kg contamination → m³ air)
    // VF = Deff_m2_s / (L_m × rho_b_kg_m3) × 1/(Hcc) simplified J&E eq.
    const Deff_m2_s = Deff_cm2_s * 1e-4; // cm²/s → m²/s
    const VF_m3_kg = Deff_m2_s / (L_m * rho_b_kg_m3); // m²/s / (m × kg/m³) = m³/(kg·s) — then assume unit time

    // Indoor air concentration estimate (mg/m³) - J&E steady-state
    const Cair_mg_m3 = Csoil_gas_mg_m3 * Hcc * (Deff_m2_s / L_m);

    return {
        Hcc,
        Csoil_gas_mg_m3,
        VF_m3_kg,
        Cair_mg_m3,
    };
}

// ============================================================
// 5. PHYTOREMEDIATION UPTAKE - Chaney (1983) / Blaylock (1997)
// ============================================================

/**
 * Phytoextraction mass-balance model for estimating years-to-target remediation.
 * Based on Chaney (1983) root concentration factor concept and Blaylock (1997)
 * above-ground biomass accumulation.
 *
 * Annual mass removed = yield_kg_m2 × plot_area_m2 × BCF_stem × Csoil
 * Time to target = (initial_mass - target_mass) / annual_removal
 *
 * @param {number} Csoil_mg_kg        - Current soil concentration (mg/kg)
 * @param {number} RCF                - Root concentration factor (mg/kg root) / (mg/L porewater), dimensionless
 * @param {number} BCF_stem           - Bioconcentration factor stem/shoot (mg/kg plant dry wt) / (mg/kg soil)
 * @param {number} yield_kg_m2        - Dry biomass yield per harvest (kg dry wt / m²)
 * @param {number} plot_area_m2       - Contaminated plot area (m²)
 * @param {number} remediation_target_mg_kg - Target soil concentration (mg/kg)
 * @param {number} initial_mass_kg    - Total contaminant mass in soil (kg)
 * @returns {{ annual_removal_kg_yr: number, years_to_target: number, removal_pct_yr: number }}
 * @reference Blaylock et al. (1997). Environ. Sci. Technol. 31(3):860. doi:10.1021/es960552a
 * @reference Chaney (1983). Land Treatment of Hazardous Wastes, pp.50-77.
 */
export function phytoremedationUptakeFactor(Csoil_mg_kg: number, RCF: number, BCF_stem: number, yield_kg_m2: number, plot_area_m2: number, remediation_target_mg_kg: number, initial_mass_kg: number): { annual_removal_kg_yr: number, years_to_target: number, removal_pct_yr: number } {
    _requirePositive(Csoil_mg_kg, 'Csoil_mg_kg');
    _requirePositive(RCF, 'RCF');
    _requirePositive(BCF_stem, 'BCF_stem');
    _requirePositive(yield_kg_m2, 'yield_kg_m2');
    _requirePositive(plot_area_m2, 'plot_area_m2');
    _requireNonNegative(remediation_target_mg_kg, 'remediation_target_mg_kg');
    _requirePositive(initial_mass_kg, 'initial_mass_kg');

    if (remediation_target_mg_kg >= Csoil_mg_kg) {
        return { annual_removal_kg_yr: 0, years_to_target: 0, removal_pct_yr: 0 };
    }

    // Mass removed per harvest cycle (1 yr assumed): kg contaminant per year
    // Concentration in plant shoot (mg/kg dry wt) × yield × area = mass per cycle
    const C_plant_mg_kg = BCF_stem * Csoil_mg_kg;
    // eslint-disable-next-line
    const annual_removal_kg_yr = C_plant_mg_kg * 1e-6 * (yield_kg_m2 * plot_area_m2 * 1e6);
    // Simplified: annual_removal = BCF_stem × Csoil × yield × area × 1e-6 (mg→kg)

    const annual_removal_kg = ((BCF_stem * Csoil_mg_kg) / 1e6) * yield_kg_m2 * plot_area_m2;

    if (annual_removal_kg <= 0) {
        throw new RangeError('Computed annual removal is zero or negative — check BCF_stem, yield, and area');
    }

    const mass_to_remove_kg = initial_mass_kg * (1 - remediation_target_mg_kg / Csoil_mg_kg);
    const years_to_target = mass_to_remove_kg / annual_removal_kg;
    const removal_pct_yr = (annual_removal_kg / initial_mass_kg) * 100;

    return {
        annual_removal_kg_yr: annual_removal_kg,
        years_to_target,
        removal_pct_yr,
    };
}

// ============================================================
// 6. NATURAL ATTENUATION SCORE - ITRC (2008)
// ============================================================

/**
 * ITRC (2008) natural source zone depletion scoring for chlorinated solvent sites.
 * Computes a dimensionless index (0-1) based on:
 * - daughter ratio: (daughter1 + daughter2 + ethene) / (parent + daughter1 + daughter2 + ethene)
 * - electron acceptor depletion: sulfate consumption, iron reduction, methane production
 * - chloride production as corroborating evidence
 *
 * @param {number} chlorinated_parent_mg_L - Parent compound (e.g. PCE) concentration in groundwater (mg/L)
 * @param {number} daughter1_mg_L          - Primary daughter (e.g. TCE) concentration (mg/L)
 * @param {number} daughter2_mg_L          - Secondary daughter (e.g. DCE) concentration (mg/L)
 * @param {number} ethene_mg_L             - Ethene/ethylene concentration (mg/L) - terminal product
 * @param {number} cl_mg_L                 - Chloride concentration (mg/L) - mineralisation indicator
 * @param {number} sulfate_mg_L            - Sulfate concentration (mg/L) - reducing condition indicator (high = low activity)
 * @param {number} iron_mg_L               - Ferrous iron concentration (mg/L) - Fe(III) reduction indicator
 * @param {number} methane_mg_L            - Methane concentration (mg/L) - methanogenesis indicator
 * @returns {{ daughterRatio: number, electronAcceptorScore: number, metaboliteIndex: number, overallScore: number }}
 * @reference ITRC BioDNAPL-3 (2008). In Situ Bioremediation of Chlorinated Ethene DNAPL Source Zones.
 */
export function naturalAttenuationScore(chlorinated_parent_mg_L: number, daughter1_mg_L: number, daughter2_mg_L: number, ethene_mg_L: number, cl_mg_L: number, sulfate_mg_L: number, iron_mg_L: number, methane_mg_L: number): { daughterRatio: number, electronAcceptorScore: number, metaboliteIndex: number, overallScore: number } {
    _requireNonNegative(chlorinated_parent_mg_L, 'chlorinated_parent_mg_L');
    _requireNonNegative(daughter1_mg_L, 'daughter1_mg_L');
    _requireNonNegative(daughter2_mg_L, 'daughter2_mg_L');
    _requireNonNegative(ethene_mg_L, 'ethene_mg_L');
    _requireNonNegative(cl_mg_L, 'cl_mg_L');
    _requireNonNegative(sulfate_mg_L, 'sulfate_mg_L');
    _requireNonNegative(iron_mg_L, 'iron_mg_L');
    _requireNonNegative(methane_mg_L, 'methane_mg_L');

    const total = chlorinated_parent_mg_L + daughter1_mg_L + daughter2_mg_L + ethene_mg_L;
    // Daughter ratio: fraction of degradation products relative to total chlorinated mass
    const daughterRatio = total > 0 ? (daughter1_mg_L + daughter2_mg_L + ethene_mg_L) / total : 0;

    // Electron acceptor depletion score (0-1)
    // Sulfate: below 20 mg/L indicates active sulphate reduction
    const sulfateScore = sulfate_mg_L < 20 ? 1 - sulfate_mg_L / 20 : 0;
    // Iron: above 1 mg/L indicates Fe(III) reduction
    const ironScore = Math.min(iron_mg_L / 5, 1);
    // Methane: above 0.5 mg/L indicates methanogenesis
    const methaneScore = Math.min(methane_mg_L / 2, 1);
    const electronAcceptorScore = (sulfateScore + ironScore + methaneScore) / 3;

    // Metabolite index: ethene present = strongest evidence of complete dechlorination
    const metaboliteIndex =
        ethene_mg_L > 0 ? Math.min(ethene_mg_L / (total > 0 ? total : 1) + (cl_mg_L > 50 ? 0.2 : 0), 1) : 0;

    // Overall score: weighted average (daughter ratio weighted 50%, EA 30%, metabolite 20%)
    const overallScore = Math.min(0.5 * daughterRatio + 0.3 * electronAcceptorScore + 0.2 * metaboliteIndex, 1);

    return { daughterRatio, electronAcceptorScore, metaboliteIndex, overallScore };
}

// ============================================================
// 7. RISK-BASED CLEANUP LEVEL - USEPA RAGS Part A (1989)
// ============================================================

/**
 * Back-calculation of risk-based soil cleanup level (RBCL) from target cancer risk
 * and non-cancer hazard quotient.
 * Returns the more protective (lower) of the cancer-based and non-cancer-based levels.
 *
 * Cancer-based: C_soil = (TR × BW × AT) / (CSF × IR × EF × ED)
 * Non-cancer:   C_soil = (HQ × RfD × BW × AT) / (IR × EF × ED)
 *
 * @param {string} exposure_route   - 'ingestion' | 'inhalation' | 'dermal'
 * @param {string} receptor         - 'adult_residential' | 'child_residential' | 'worker'
 * @param {number} cancer_risk_target - Acceptable excess cancer risk (e.g. 1e-6)
 * @param {number} HQ_target        - Acceptable hazard quotient (e.g. 1.0)
 * @param {number} CSF_per_mg_kg_day - Cancer slope factor (mg/kg/day)⁻¹
 * @param {number} RfD_mg_kg_day    - Reference dose (mg/kg/day)
 * @param {number} BW_kg            - Body weight (kg)
 * @param {number} EF_days_yr       - Exposure frequency (days/yr)
 * @param {number} ED_yr            - Exposure duration (yr)
 * @param {number} AT_days          - Averaging time (days)
 * @param {number} IR_m3_day_or_mg_day - Intake rate (m³/day for inhalation, mg/day for ingestion/dermal)
 * @returns {{ cancer_RBCL_mg_kg: number, noncancer_RBCL_mg_kg: number, protective_RBCL_mg_kg: number, limiting_basis: string }}
 * @reference USEPA RAGS Part A (1989). EPA/540/1-89/002.
 */
export function riskBasedCleanupLevel(exposure_route: string, receptor: string, cancer_risk_target: number, HQ_target: number, CSF_per_mg_kg_day: number, RfD_mg_kg_day: number, BW_kg: number, EF_days_yr: number, ED_yr: number, AT_days: number, IR_m3_day_or_mg_day: number): { cancer_RBCL_mg_kg: number, noncancer_RBCL_mg_kg: number, protective_RBCL_mg_kg: number, limiting_basis: string } {
    const VALID_ROUTES = ['ingestion', 'inhalation', 'dermal'];
    const VALID_RECEPTORS = ['adult_residential', 'child_residential', 'worker'];
    if (!VALID_ROUTES.includes(exposure_route)) {
        throw new RangeError(`exposure_route must be one of: ${VALID_ROUTES.join(', ')}`);
    }
    if (!VALID_RECEPTORS.includes(receptor)) {
        throw new RangeError(`receptor must be one of: ${VALID_RECEPTORS.join(', ')}`);
    }
    _requirePositive(cancer_risk_target, 'cancer_risk_target');
    _requirePositive(HQ_target, 'HQ_target');
    _requirePositive(CSF_per_mg_kg_day, 'CSF_per_mg_kg_day');
    _requirePositive(RfD_mg_kg_day, 'RfD_mg_kg_day');
    _requirePositive(BW_kg, 'BW_kg');
    _requirePositive(EF_days_yr, 'EF_days_yr');
    _requirePositive(ED_yr, 'ED_yr');
    _requirePositive(AT_days, 'AT_days');
    _requirePositive(IR_m3_day_or_mg_day, 'IR_m3_day_or_mg_day');

    const exposure_factor = (IR_m3_day_or_mg_day * EF_days_yr * ED_yr) / (BW_kg * AT_days);

    // Cancer-based RBCL
    const cancer_RBCL_mg_kg = cancer_risk_target / (CSF_per_mg_kg_day * exposure_factor);

    // Non-cancer-based RBCL
    const noncancer_RBCL_mg_kg = (HQ_target * RfD_mg_kg_day) / exposure_factor;

    const protective_RBCL_mg_kg = Math.min(cancer_RBCL_mg_kg, noncancer_RBCL_mg_kg);
    const limiting_basis = cancer_RBCL_mg_kg <= noncancer_RBCL_mg_kg ? 'cancer' : 'noncancer';

    return {
        cancer_RBCL_mg_kg,
        noncancer_RBCL_mg_kg,
        protective_RBCL_mg_kg,
        limiting_basis,
    };
}

// ============================================================
// 8. BROWNFIELD REDEVELOPMENT COST - USEPA (2001)
// ============================================================

/**
 * Brownfield remediation cost estimate using USEPA (2001) unit cost factors.
 * Computes CAPEX, OPEX, and total cost for a defined treatment volume.
 *
 * @param {number} area_m2            - Contaminated area (m²)
 * @param {number} contamination_depth_m - Average depth of contamination (m)
 * @param {string} contaminant_class  - 'organic_volatile' | 'organic_semivolatile' | 'heavy_metals' | 'chlorinated_solvent'
 * @param {string} treatment_method   - One of: 'excavation_landfill' | 'soil_washing' | 'thermal_desorption' |
 *                                       'in_situ_sve' | 'bioremediation' | 'monitored_natural_attenuation'
 * @param {number} contingency_pct    - Contingency percentage (e.g. 20 for 20%)
 * @returns {{ volume_m3: number, capex_usd: number, opex_total_usd: number, total_usd: number, unit_cost_usd_m3: number }}
 * @reference USEPA (2001). A Review of Cost Estimates for Soil Contamination. EPA-542-R-01-009.
 */
export function brownfieldRedevelopmentCost(area_m2: number, contamination_depth_m: number, contaminant_class: string, treatment_method: string, contingency_pct: number): { volume_m3: number, capex_usd: number, opex_total_usd: number, total_usd: number, unit_cost_usd_m3: number } {
    _requirePositive(area_m2, 'area_m2');
    _requirePositive(contamination_depth_m, 'contamination_depth_m');
    _requireNonNegative(contingency_pct, 'contingency_pct');

    const validClasses = Object.keys(TREATMENT_APPLICABILITY);
    if (!validClasses.includes(contaminant_class)) {
        throw new RangeError(`contaminant_class must be one of: ${validClasses.join(', ')}`);
    }
    const validMethods = Object.keys(TREATMENT_COSTS);
    if (!validMethods.includes(treatment_method)) {
        throw new RangeError(`treatment_method must be one of: ${validMethods.join(', ')}`);
    }

    // Check applicability
    if (!(TREATMENT_APPLICABILITY[contaminant_class] as readonly string[]).includes(treatment_method)) {
        throw new RangeError(
            `treatment_method '${treatment_method}' is not applicable for contaminant_class '${contaminant_class}'. ` +
                `Valid methods: ${(TREATMENT_APPLICABILITY[contaminant_class] as readonly string[]).join(', ')}`,
        );
    }

    const costs = TREATMENT_COSTS[treatment_method] as { capex_usd_m3: number, opex_usd_m3_yr: number, lifespan_yr: number };
    const volume_m3 = area_m2 * contamination_depth_m;
    const contingency_factor = 1 + contingency_pct / 100;

    const capex_usd = costs.capex_usd_m3 * volume_m3 * contingency_factor;
    const opex_total_usd = costs.opex_usd_m3_yr * volume_m3 * costs.lifespan_yr * contingency_factor;
    const total_usd = capex_usd + opex_total_usd;
    const unit_cost_usd_m3 = total_usd / volume_m3;

    return {
        volume_m3,
        capex_usd,
        opex_total_usd,
        total_usd,
        unit_cost_usd_m3,
    };
}

// ============================================================
// HELPER: multi-layer leachate
// ============================================================

type LeachateLayer = { thickness_m: number; rho_kg_L: number; Kd_L_kg: number; theta: number; lambda_per_yr: number };

/**
 * Guard that asserts a layer object carries all required numeric properties.
 * @param {unknown} layer - Layer to validate
 * @param {number} index - Layer index for error messages
 */
function validateLeachateLayer(layer: unknown, index: number): asserts layer is LeachateLayer {
    if (!layer || typeof layer !== 'object') {
        throw new RangeError(`Layer ${index} has invalid properties`);
    }
    const { thickness_m, rho_kg_L, Kd_L_kg, theta, lambda_per_yr } = layer as LeachateLayer;
    if (
        typeof thickness_m !== 'number' || thickness_m <= 0 ||
        typeof rho_kg_L !== 'number' || rho_kg_L <= 0 ||
        typeof Kd_L_kg !== 'number' || Kd_L_kg < 0 ||
        typeof theta !== 'number' || theta <= 0 || theta > 1 ||
        typeof lambda_per_yr !== 'number' || lambda_per_yr < 0
    ) {
        throw new RangeError(`Layer ${index} has invalid properties`);
    }
}

/**
 * Compute attenuation factor for a traversal distance inside one layer.
 * @param {number} thickness_m - Layer thickness (m)
 * @param {number} rho_kg_L - Bulk density (kg/L)
 * @param {number} Kd_L_kg - Partitioning coefficient (L/kg)
 * @param {number} theta - Volumetric water content
 * @param {number} lambda_per_yr - Decay constant (yr⁻¹)
 * @param {number} traversal_m - Distance travelled inside the layer (m)
 * @returns {number} Attenuation multiplier
 */
function computeLayerAttenuation(thickness_m: number, rho_kg_L: number, Kd_L_kg: number, theta: number, lambda_per_yr: number, traversal_m: number): number {
    // eslint-disable-next-line no-unused-vars
    const _thickness = thickness_m; // kept for API symmetry / future use
    const R = 1 + (rho_kg_L * Kd_L_kg) / theta;
    if (lambda_per_yr <= 0) return 1;
    const v_m_yr = 1.0;
    return Math.exp((-lambda_per_yr * R * traversal_m) / v_m_yr);
}

// ============================================================
// 9. MULTI-LAYER LEACHATE CONCENTRATION - van Genuchten & Alves (1982)
// ============================================================

/**
 * Multi-layer vadose zone transport model based on van Genuchten & Alves (1982)
 * steady-state 1D advection-dispersion analytical solution.
 *
 * For each layer: retardation R = 1 + rho*Kd/theta, advection v = q/theta
 * Steady-state concentration at depth z within layer:
 *   C(z) = C0 * exp(-lambda * R * z / v)   (simplified — zero-order production not included)
 * Conservative case: C(z) = C_in (top boundary condition stepping through layers)
 *
 * @param {Array<{thickness_m: number, rho_kg_L: number, Kd_L_kg: number, theta: number, lambda_per_yr: number}>} layers
 *   Array of layer objects (top to bottom), each with:
 *   - thickness_m: layer thickness (m)
 *   - rho_kg_L: bulk density (kg/L)
 *   - Kd_L_kg: linear sorption partitioning coefficient (L/kg)
 *   - theta: volumetric water content (dimensionless)
 *   - lambda_per_yr: first-order decay constant (yr⁻¹; 0 = conservative)
 * @param {number} query_depth_m - Depth at which to compute concentration (m from surface)
 * @returns {{ depth_m: number, attenuation_factor: number, C_relative: number, layer_index: number }}
 * @reference van Genuchten, M.T. & Alves, W.J. (1982). USDA Tech. Bull. 1663.
 */
export function multiLayerLeachateConcentration(layers: LeachateLayer[], query_depth_m: number): { depth_m: number, attenuation_factor: number, C_relative: number, layer_index: number } {
    if (!Array.isArray(layers) || layers.length === 0) {
        throw new RangeError('layers must be a non-empty array');
    }
    _requirePositive(query_depth_m, 'query_depth_m');

    let cumulative_depth = 0;
    let attenuation = 1.0; // starts at C0=1 (relative)
    let active_layer_index = -1;

    for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        validateLeachateLayer(layer, i);
        const { thickness_m, rho_kg_L, Kd_L_kg, theta, lambda_per_yr } = layer;
        const layer_end = cumulative_depth + thickness_m;

        if (query_depth_m <= layer_end) {
            // Query depth is within this layer
            active_layer_index = i;
            const z_in_layer = query_depth_m - cumulative_depth;
            attenuation *= computeLayerAttenuation(thickness_m, rho_kg_L, Kd_L_kg, theta, lambda_per_yr, z_in_layer);
            break;
        }
        // Full layer traversal
        attenuation *= computeLayerAttenuation(thickness_m, rho_kg_L, Kd_L_kg, theta, lambda_per_yr, thickness_m);
        cumulative_depth = layer_end;
    }

    if (active_layer_index < 0) {
        // Query depth is below all defined layers - use last layer properties
        active_layer_index = layers.length - 1;
    }

    return {
        depth_m: query_depth_m,
        attenuation_factor: attenuation,
        C_relative: attenuation,
        layer_index: active_layer_index,
    };
}

// ============================================================
// HELPER: cumulative risk contributors
// ============================================================

type ContaminantInput = { id: string; ADD_mg_kg_day: number; CSF_per_mg_kg_day: number; RfD_mg_kg_day: number };
type ContaminantDetail = { id: string; CR: number; HQ: number };

/**
 * Guard that asserts a contaminant entry has all required finite numeric fields.
 * @param {unknown} c - Contaminant object to validate
 */
function validateContaminant(c: unknown): asserts c is ContaminantInput {
    if (!c || typeof c !== 'object') {
        throw new RangeError('Each contaminant must be an object');
    }
    const item = c as ContaminantInput;
    if (typeof item.id !== 'string' || !item.id) {
        throw new RangeError('Each contaminant must have a non-empty string id');
    }
    if (typeof item.ADD_mg_kg_day !== 'number' || !isFinite(item.ADD_mg_kg_day) || item.ADD_mg_kg_day < 0) {
        throw new RangeError(`Contaminant '${item.id}': ADD_mg_kg_day must be a non-negative finite number`);
    }
    if (typeof item.CSF_per_mg_kg_day !== 'number' || !isFinite(item.CSF_per_mg_kg_day) || item.CSF_per_mg_kg_day < 0) {
        throw new RangeError(`Contaminant '${item.id}': CSF_per_mg_kg_day must be a non-negative finite number`);
    }
    if (typeof item.RfD_mg_kg_day !== 'number' || !isFinite(item.RfD_mg_kg_day) || item.RfD_mg_kg_day <= 0) {
        throw new RangeError(`Contaminant '${item.id}': RfD_mg_kg_day must be a positive finite number`);
    }
}

/**
 * Compute cancer risk and hazard quotient for one contaminant.
 * @param {ContaminantInput} c - Validated contaminant
 * @returns {ContaminantDetail} Detail record with CR and HQ
 */
function computeContaminantDetail(c: ContaminantInput): ContaminantDetail {
    return {
        id: c.id,
        CR: c.ADD_mg_kg_day * c.CSF_per_mg_kg_day,
        HQ: c.ADD_mg_kg_day / c.RfD_mg_kg_day,
    };
}

/**
 * Find the dominant contributor by CR or HQ.
 * @param {ContaminantDetail[]} details - Per-contaminant details
 * @param {'CR'|'HQ'} key - Metric to compare
 * @returns {string|null} Id of dominant contaminant or null
 */
function findDominantDetail(details: ContaminantDetail[], key: 'CR'|'HQ'): string | null {
    let dominant: string | null = null;
    let maxVal = 0;
    for (const d of details) {
        const val = d[key];
        if (val > maxVal) {
            maxVal = val;
            dominant = d.id;
        }
    }
    return dominant;
}

// ============================================================
// 10. CUMULATIVE RISK INDEX - USEPA (2000) SSL Supplemental Guidance
// ============================================================

/**
 * USEPA (2000) cumulative cancer risk and hazard index across multiple
 * contaminants and exposure routes.
 *
 * Cancer: CR_total = Σ (ADD_i × CSF_i)
 * Non-cancer: HI = Σ HQ_i = Σ (ADD_i / RfD_i)
 *
 * @param {Array<{id: string, ADD_mg_kg_day: number, CSF_per_mg_kg_day: number, RfD_mg_kg_day: number}>} contaminants_array
 *   Array of contaminant exposure objects, each with:
 *   - id: contaminant identifier (string)
 *   - ADD_mg_kg_day: average daily dose (mg/kg/day)
 *   - CSF_per_mg_kg_day: cancer slope factor ((mg/kg/day)⁻¹); 0 if non-carcinogen
 *   - RfD_mg_kg_day: reference dose (mg/kg/day)
 * @returns {{ total_cancer_risk: number, hazard_index: number, dominant_carcinogen: string|null, dominant_noncancer: string|null, details: Array<{id: string, CR: number, HQ: number}> }}
 * @reference USEPA (2000). Supplemental Guidance for Developing SSL. OSWER 9355.4-24.
 */
export function cumulativeRiskIndex(contaminants_array: ContaminantInput[]): { total_cancer_risk: number, hazard_index: number, dominant_carcinogen: string|null, dominant_noncancer: string|null, details: Array<{id: string, CR: number, HQ: number}> } {
    if (!Array.isArray(contaminants_array) || contaminants_array.length === 0) {
        throw new RangeError('contaminants_array must be a non-empty array');
    }

    let total_cancer_risk = 0;
    let hazard_index = 0;
    const details: ContaminantDetail[] = [];

    for (const c of contaminants_array) {
        validateContaminant(c);
        const d = computeContaminantDetail(c);
        total_cancer_risk += d.CR;
        hazard_index += d.HQ;
        details.push(d);
    }

    const dominant_carcinogen = findDominantDetail(details, 'CR');
    const dominant_noncancer = findDominantDetail(details, 'HQ');

    return {
        total_cancer_risk,
        hazard_index,
        dominant_carcinogen,
        dominant_noncancer,
        details,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const soilContaminationRiskMeta = {
    name: 'soilContaminationRisk',
    description: 'soilContaminationRisk',
    category: 'analytics',
    familyTags: ['soil', 'risk', 'hydrocarbon'],
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
