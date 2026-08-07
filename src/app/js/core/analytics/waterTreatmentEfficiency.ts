// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Water and Wastewater Treatment Efficiency
 *
 * Models pollutant removal efficiency for common treatment technologies using
 * Chick-Watson kinetics (first-order removal) and empirical technology-specific
 * parameters. Evaluates compliance with CONAMA 430/2011 and calculates
 * specific energy consumption.
 *
 * Academic references:
 * - von Sperling, M. (2005). Introdução à Qualidade das Águas e ao Tratamento
 *   de Esgotos, 3rd ed. UFMG. ISBN:978-85-7041-449-1
 * - Chick, H. (1908). An investigation of the laws of disinfection.
 *   J. Hygiene 8(1):92–158. DOI:10.1017/S0022172400006987
 * - Watson, H.E. (1908). A note on the variation of the rate of disinfection
 *   with change in the concentration of the disinfectant.
 *   J. Hygiene 8(4):536–542. DOI:10.1017/S0022172400007021
 * - CONAMA Resolução 430/2011 - Condições e padrões de lançamento de efluentes.
 * - Metcalf & Eddy (2014). Wastewater Engineering, 5th ed. McGraw-Hill.
 *   ISBN:978-0-07-340118-8
 *
 * @module waterTreatmentEfficiency
 */

/**
 * Technology-specific first-order removal rate constants (k, day⁻¹) and
 * typical HRT (hours) per von Sperling (2005) Table 9.2 and Metcalf & Eddy (2014).
 *
 * Constantes de remoção de primeira ordem e tempo de detenção hidráulica (TDH)
 * típicos por tecnologia de tratamento.
 */
const TECHNOLOGY_PARAMS = {
    facultative_pond: {
        label: 'Facultative Pond',
        k_BOD: 0.15, // day⁻¹ — typical for tropical climate (von Sperling 2005)
        k_TSS: 0.08,
        k_TN: 0.05,
        k_TP: 0.02,
        hrt_days: 20,
        energy_kWh_m3: 0.01, // consumo energético específico (kWh/m³)
    },
    activated_sludge: {
        label: 'Activated Sludge (CAS)',
        k_BOD: 5.0,
        k_TSS: 4.0,
        k_TN: 0.8,
        k_TP: 0.3,
        hrt_days: 0.25, // 6 h
        energy_kWh_m3: 0.35,
    },
    uasb: {
        label: 'UASB Reactor',
        k_BOD: 1.8,
        k_TSS: 1.5,
        k_TN: 0.1,
        k_TP: 0.05,
        hrt_days: 0.33, // 8 h
        energy_kWh_m3: 0.05,
    },
    trickling_filter: {
        label: 'Trickling Filter',
        k_BOD: 1.2,
        k_TSS: 1.0,
        k_TN: 0.2,
        k_TP: 0.04,
        hrt_days: 0.17, // 4 h
        energy_kWh_m3: 0.2,
    },
};

// CONAMA 430/2011 efluent discharge limits (mg/L)
// Padrões de lançamento de efluentes em corpos d'água - Art. 16
const CONAMA430_LIMITS = {
    BOD: 120, // mg/L or minimum 60% removal
    TSS: 150, // mg/L suspended solids
    TN: null, // sem limite numérico direto em CONAMA 430 (exige EIA específico)
    TP: null,
    BOD_removal_pct: 60, // % mínimo de remoção de DBO (Art. 21a)
};

/**
 * Chick-Watson first-order pollutant removal.
 * E = 1 - exp(-k × t) where t is hydraulic retention time (days).
 *
 * Eficiência de remoção de primeira ordem (Chick-Watson):
 * E = 1 − e^(−k×t), onde k é constante cinética e t é o TDH em dias.
 *
 * @param {number} k_day - First-order rate constant (day⁻¹, > 0)
 * @param {number} hrt_days - Hydraulic retention time (days, > 0)
 * @returns {number} Removal efficiency (0–1)
 * @throws {RangeError|TypeError}
 */
function chickWatsonRemoval(k_day: any, hrt_days: any) {
    if (typeof k_day !== 'number' || typeof hrt_days !== 'number')
        throw new TypeError('k_day and hrt_days must be numbers');
    if (k_day <= 0) throw new RangeError('k_day must be > 0');
    if (hrt_days <= 0) throw new RangeError('hrt_days must be > 0');

    return 1 - Math.exp(-k_day * hrt_days);
}

/**
 * Compute treatment efficiencies and effluent concentrations for a given technology.
 *
 * Calcula eficiências de remoção e concentrações no efluente tratado
 * para uma tecnologia de tratamento selecionada.
 *
 * @param {string} technology - Technology key (see TECHNOLOGY_PARAMS)
 * @param {object} influent   - Influent concentrations (mg/L), keys: BOD, TSS, TN, TP
 * @param {number} [hrtOverride] - Override HRT in days (optional, > 0)
 * @returns {{
 *   technology: string,
 *   efficiencies: {BOD: number, TSS: number, TN: number, TP: number},
 *   effluent: {BOD: number, TSS: number, TN: number, TP: number},
 *   energyKwhM3: number,
 *   hrt_days: number
 * }}
 * @throws {TypeError|RangeError}
 */
function treatmentEfficiency(technology: any, influent: any, hrtOverride: any) {
    if (typeof technology !== 'string') throw new TypeError('technology must be a string');

    const techParams =
        /** @type {Record<string, { label: string, k_BOD: number, k_TSS: number, k_TN: number, k_TP: number, hrt_days: number, energy_kWh_m3: number }>} */ (
            TECHNOLOGY_PARAMS
        );
const tech = techParams[technology as keyof typeof TECHNOLOGY_PARAMS];
    if (!tech)
        throw new RangeError(`Unknown technology: ${technology}. Valid: ${Object.keys(TECHNOLOGY_PARAMS).join(', ')}`);

    const inf = /** @type {Record<string, number>} */ (influent);
    const requiredKeys = ['BOD', 'TSS', 'TN', 'TP'];
    for (const k of requiredKeys) {
        if (inf[k] === undefined || inf[k] === null) throw new TypeError(`influent.${k} is required`);
        if (typeof inf[k] !== 'number' || inf[k] < 0)
            throw new RangeError(`influent.${k} must be a non-negative number`);
    }

    const hrt = hrtOverride !== undefined ? hrtOverride : tech.hrt_days;
    if (typeof hrt !== 'number' || hrt <= 0) throw new RangeError('hrtOverride must be > 0');

    // Calcula eficiência por parâmetro e concentração no efluente
    const pollutants = { BOD: tech.k_BOD, TSS: tech.k_TSS, TN: tech.k_TN, TP: tech.k_TP };
    /** @type {Record<string, number>} */
    const efficiencies = {};
    /** @type {Record<string, number>} */
    const effluent = {};

    for (const [param, k] of Object.entries(pollutants)) {
        const eff = chickWatsonRemoval(k, hrt);
(efficiencies as Record<string, number>)[param] = +eff.toFixed(4);
(effluent as Record<string, number>)[param] = +(inf[param] * (1 - eff)).toFixed(2);
    }

    return {
        technology: tech.label,
        efficiencies: /** @type {{BOD: number, TSS: number, TN: number, TP: number}} */ (efficiencies),
        effluent: /** @type {{BOD: number, TSS: number, TN: number, TP: number}} */ (effluent),
        energyKwhM3: tech.energy_kWh_m3,
        hrt_days: hrt,
    };
}

/**
 * Logarithmic removal efficiency (log10 units) - used for pathogens.
 * Eficiência de remoção logarítmica para patógenos.
 *
 * @param {number} influentConc  - Concentração no afluente (unidades/L, > 0)
 * @param {number} effluentConc  - Concentração no efluente (unidades/L, >= 0)
 * @returns {number} Log10 remoção (ex: 2.0 = remoção de 2 logs)
 * @throws {RangeError|TypeError}
 */
function logRemoval(influentConc: any, effluentConc: any) {
    if (typeof influentConc !== 'number' || typeof effluentConc !== 'number')
        throw new TypeError('influentConc and effluentConc must be numbers');
    if (influentConc <= 0) throw new RangeError('influentConc must be > 0');
    if (effluentConc < 0) throw new RangeError('effluentConc must be >= 0');
    if (effluentConc === 0) return Infinity; // remoção total
    if (effluentConc >= influentConc) return 0;

    return +Math.log10(influentConc / effluentConc).toFixed(3);
}

/**
 * CONAMA 430/2011 compliance check for effluent discharge.
 *
 * Verifica conformidade do efluente com CONAMA 430/2011 para lançamento
 * em corpos d'água receptores.
 *
 * @param {{BOD: number, TSS: number}} effluent   - Concentrações no efluente tratado (mg/L): BOD, TSS
 * @param {number} effluent - Concentração de DBO no afluente para calcular % remoção
 * @returns {{compliant: boolean, checks: object, violations: string[]}}
 * @throws {TypeError|RangeError}
 */
function conama430Compliance(effluent: any, bodInfluent: any) {
    if (typeof effluent.BOD !== 'number' || typeof effluent.TSS !== 'number')
        throw new TypeError('effluent.BOD and effluent.TSS must be numbers');
    if (typeof bodInfluent !== 'number' || bodInfluent <= 0)
        throw new RangeError('bodInfluent must be a positive number');
    if (effluent.BOD < 0 || effluent.TSS < 0) throw new RangeError('effluent concentrations must be >= 0');

    const bodRemovalPct = ((bodInfluent - effluent.BOD) / bodInfluent) * 100;

    const checks = {
        BOD_limit: { value: effluent.BOD, limit: CONAMA430_LIMITS.BOD, pass: effluent.BOD <= CONAMA430_LIMITS.BOD },
        BOD_removal: {
            value: +bodRemovalPct.toFixed(1),
            limit: CONAMA430_LIMITS.BOD_removal_pct,
            pass: bodRemovalPct >= CONAMA430_LIMITS.BOD_removal_pct,
        },
        TSS_limit: { value: effluent.TSS, limit: CONAMA430_LIMITS.TSS, pass: effluent.TSS <= CONAMA430_LIMITS.TSS },
    };

    // Conformidade: DBO ≤ 120 mg/L OU remoção ≥ 60% (Art. 21 - critério alternativo)
    const bodOk = checks.BOD_limit.pass || checks.BOD_removal.pass;
    const tssOk = checks.TSS_limit.pass;

    const violations = [];
    if (!bodOk) violations.push('BOD exceeds 120 mg/L and removal < 60% (CONAMA 430/2011 Art. 21)');
    if (!tssOk) violations.push(`TSS ${effluent.TSS} mg/L exceeds limit of ${CONAMA430_LIMITS.TSS} mg/L`);

    return { compliant: violations.length === 0, checks, violations };
}

export {
    chickWatsonRemoval,
    treatmentEfficiency,
    logRemoval,
    conama430Compliance,
    TECHNOLOGY_PARAMS,
    CONAMA430_LIMITS,
};

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const waterTreatmentEfficiencyMeta = {
    name: 'waterTreatmentEfficiency',
    description: 'waterTreatmentEfficiency',
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
