// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Water Reuse & Treatment - Pure analytical module
// Tratamento e reúso de água - módulo analítico puro sem dependências de DOM/IDB/fetch
//
// References / Referências:
//   WHO (2006) Guidelines for Safe Use of Wastewater, Excreta and Greywater, Vol. 2
//   CONAMA Resolução 54/2005 - Reúso de água não-potável
//   AWWA (2017) Water Reuse: Potential for Expanding the Nation's Water Supply
//   Mulder M. (1991) Basic Principles of Membrane Technology, Kluwer Academic Publishers

'use strict';

/**
 * Compute removal efficiency of a treatment process.
 * Calcula eficiência de remoção de um parâmetro de qualidade de água.
 *
 * @param {number} influent_mg_L  - Inlet concentration (mg/L), must be > 0
 * @param {number} effluent_mg_L  - Outlet concentration (mg/L), must be ≥ 0 and < influent
 * @returns {{ efficiency_pct: number, log_removal: number }}
 *   efficiency_pct - η = (Cin - Ceff) / Cin × 100
 *   log_removal    - log10(Cin / Ceff); Infinity when effluent = 0
 */
export function computeRemovalEfficiency(influent_mg_L: any, effluent_mg_L: any) {
    if (typeof influent_mg_L !== 'number' || typeof effluent_mg_L !== 'number') {
        throw new TypeError('influent_mg_L and effluent_mg_L must be numbers');
    }
    if (influent_mg_L <= 0) {
        throw new RangeError('influent_mg_L must be > 0');
    }
    if (effluent_mg_L < 0) {
        throw new RangeError('effluent_mg_L must be >= 0');
    }
    if (effluent_mg_L >= influent_mg_L) {
        throw new RangeError('effluent_mg_L must be < influent_mg_L (treatment must reduce concentration)');
    }

    // Eficiência percentual de remoção
    const efficiency_pct = ((influent_mg_L - effluent_mg_L) / influent_mg_L) * 100;

    // Remoção logarítmica - log10(Cin/Ceff); Infinity quando efluente = 0 (remoção total)
    const log_removal = effluent_mg_L === 0 ? Infinity : Math.log10(influent_mg_L / effluent_mg_L);

    return { efficiency_pct, log_removal };
}

/**
 * Compute Levelized Cost of Energy (LCOE) for a water treatment plant.
 * Calcula custo unitário de tratamento (LCOE) via CRF (Capital Recovery Factor).
 *
 * @param {number} flow_m3_day       - Design flow (m³/day), must be > 0
 * @param {number} capex_USD         - Total capital expenditure (USD), must be ≥ 0
 * @param {number} opex_USD_m3       - Operating cost per m³ (USD/m³), must be ≥ 0
 * @param {number} lifetime_years    - Asset lifetime (years), must be > 0
 * @param {number} discount_rate     - Annual discount rate ∈ (0, 1) exclusive
 * @returns {{ lcoe_USD_m3: number, capex_annualized: number }}
 *   lcoe_USD_m3      - Levelized cost per m³ treated
 *   capex_annualized - Annual capital charge (USD/year)
 */
export function computeTreatmentCost(flow_m3_day: any, capex_USD: any, opex_USD_m3: any, lifetime_years: any, discount_rate: any) {
    if ([flow_m3_day, capex_USD, opex_USD_m3, lifetime_years, discount_rate].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (flow_m3_day <= 0) throw new RangeError('flow_m3_day must be > 0');
    if (capex_USD < 0) throw new RangeError('capex_USD must be >= 0');
    if (opex_USD_m3 < 0) throw new RangeError('opex_USD_m3 must be >= 0');
    if (lifetime_years <= 0) throw new RangeError('lifetime_years must be > 0');
    if (discount_rate <= 0 || discount_rate >= 1) {
        throw new RangeError('discount_rate must be in (0, 1) exclusive');
    }

    const r = discount_rate;
    const n = lifetime_years;

    // Capital Recovery Factor - fator de recuperação de capital (anuidade)
    const crf = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

    const annual_volume_m3 = flow_m3_day * 365;
    const capex_annualized = capex_USD * crf;

    // LCOE = (CAPEX_anualizado + OPEX_total_anual) / volume_anual
    const lcoe_USD_m3 = (capex_annualized + opex_USD_m3 * annual_volume_m3) / annual_volume_m3;

    return { lcoe_USD_m3, capex_annualized };
}

// Limites de qualidade para reúso - CONAMA 54/2005 + WHO 2006
// Quality thresholds for water reuse per Brazilian regulation and WHO guidelines
const REUSE_LIMITS = {
    unrestricted_irrigation: { tss: 10, turbidity: 5, ecoli: 200, chlorine_min: 0.5 },
    restricted_irrigation: { tss: 60, turbidity: 40, ecoli: 100000, chlorine_min: 0.2 },
    industrial: { tss: 30, turbidity: 20, ecoli: 1000, chlorine_min: 0.2 },
    toilet_flush: { tss: 20, turbidity: 10, ecoli: 500, chlorine_min: 0.5 },
};

/**
 * Assess if reclaimed water meets quality criteria for intended reuse.
 * Avalia conformidade de água de reúso com critérios regulatórios.
 *
 * @param {number} tss_mg_L              - Total suspended solids (mg/L)
 * @param {number} turbidity_NTU         - Turbidity (NTU)
 * @param {number} ecoli_CFU_100mL       - E. coli count (CFU/100mL)
 * @param {number} residual_chlorine_mg_L - Residual chlorine (mg/L)
 * @param {'unrestricted_irrigation'|'restricted_irrigation'|'industrial'|'toilet_flush'} intended_use
 * @returns {{ compliant: boolean, issues: string[], quality_class: 'A'|'B'|'C'|'D' }}
 */
export function assessReuseQuality(tss_mg_L: any, turbidity_NTU: any, ecoli_CFU_100mL: any, residual_chlorine_mg_L: any, intended_use: any) {
    const validUses = Object.keys(REUSE_LIMITS);
    if (!validUses.includes(intended_use)) {
        throw new TypeError(`intended_use must be one of: ${validUses.join(', ')}`);
    }
    for (const [name, val] of [
        ['tss_mg_L', tss_mg_L],
        ['turbidity_NTU', turbidity_NTU],
        ['ecoli_CFU_100mL', ecoli_CFU_100mL],
        ['residual_chlorine_mg_L', residual_chlorine_mg_L],
    ]) {
        if (typeof val !== 'number') throw new TypeError(`${name} must be a number`);
        if (val < 0) throw new RangeError(`${name} must be >= 0`);
    }

const limits = (REUSE_LIMITS as any)[intended_use];
    const issues = [];

    if (tss_mg_L > limits.tss) issues.push(`TSS ${tss_mg_L} mg/L exceeds limit ${limits.tss} mg/L`);
    if (turbidity_NTU > limits.turbidity)
        issues.push(`Turbidity ${turbidity_NTU} NTU exceeds limit ${limits.turbidity} NTU`);
    if (ecoli_CFU_100mL > limits.ecoli)
        issues.push(`E.coli ${ecoli_CFU_100mL} CFU/100mL exceeds limit ${limits.ecoli} CFU/100mL`);
    if (residual_chlorine_mg_L < limits.chlorine_min)
        issues.push(`Residual Cl2 ${residual_chlorine_mg_L} mg/L below minimum ${limits.chlorine_min} mg/L`);

    const compliant = issues.length === 0;

    // Classe A-D baseada em conformidade e E.coli - WHO 2006 Annex 2
    // Quality class A-D based on E.coli and overall compliance
    /** @type {'A'|'B'|'C'|'D'} */
    let quality_class;
    if (ecoli_CFU_100mL <= 10 && compliant) quality_class = 'A';
    else if (ecoli_CFU_100mL <= 1000 && tss_mg_L <= 30) quality_class = 'B';
    else if (ecoli_CFU_100mL <= 100000) quality_class = 'C';
    else quality_class = 'D';

    return { compliant, issues, quality_class };
}

/**
 * Compute transmembrane flux through a membrane filter.
 * Calcula fluxo transmembranar via equação de Darcy para filtração por membranas.
 *
 * J = TMP / (μ × Rm × FF)
 *
 * @param {number} transmembrane_pressure_kPa - TMP in kPa, must be > 0
 * @param {number} membrane_resistance_m      - Membrane resistance (m⁻¹), must be > 0
 * @param {number} viscosity_Pa_s             - Dynamic viscosity (Pa·s), must be > 0
 * @param {number} fouling_factor             - Dimensionless fouling correction ≥ 1
 * @returns {{ flux_L_m2_h: number, normalized_flux: number }}
 *   flux_L_m2_h    - Permeate flux in L/(m²·h) [LMH]
 *   normalized_flux - flux / (TMP/100) - normalized per 100 kPa TMP
 */
export function computeMembraneFlux(transmembrane_pressure_kPa: any, membrane_resistance_m: any, viscosity_Pa_s: any, fouling_factor: any) {
    if (
        [transmembrane_pressure_kPa, membrane_resistance_m, viscosity_Pa_s, fouling_factor].some(
            (v) => typeof v !== 'number',
        )
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (transmembrane_pressure_kPa <= 0) throw new RangeError('transmembrane_pressure_kPa must be > 0');
    if (membrane_resistance_m <= 0) throw new RangeError('membrane_resistance_m must be > 0');
    if (viscosity_Pa_s <= 0) throw new RangeError('viscosity_Pa_s must be > 0');
    if (fouling_factor < 1) throw new RangeError('fouling_factor must be >= 1 (no flux enhancement expected)');

    // Converter kPa → Pa
    const tmp_Pa = transmembrane_pressure_kPa * 1000;

    // Fluxo em m/s via lei de Darcy para membranas (Mulder 1991)
    const flux_m_s = tmp_Pa / (viscosity_Pa_s * membrane_resistance_m * fouling_factor);

    // Converter m/s → L/(m²·h): ×1000 (m³→L) × 3600 (s→h)
    const flux_L_m2_h = flux_m_s * 1000 * 3600;

    // Fluxo normalizado por 100 kPa de TMP - indicador de desempenho
    const normalized_flux = flux_L_m2_h / (transmembrane_pressure_kPa / 100);

    return { flux_L_m2_h, normalized_flux };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const waterReuseTreatmentMeta = {
    name: 'waterReuseTreatment',
    description: 'waterReuseTreatment',
    category: 'analytics',
    familyTags: ['water'],
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
