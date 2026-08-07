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
/**
 * @module soilNitrogenMineralization
 * @description Mineralizacao de nitrogenio organico no solo - cinetica de primeira ordem.
 * Baseado em Stanford & Smith (1972) e funcao de temperatura Q10.
 *
 * Academic references:
 *   Stanford, G. & Smith, S.J. (1972). Nitrogen mineralization potentials of soils.
 *     Soil Sci. Soc. Am. Proc. 36:465–472. DOI:10.2136/sssaj1972.03615995003600030029x
 *   Richter, J., Nuske, A., Habenicht, W. & Bauer, J. (1982). Optimized N-mineralization
 *     parameters of loess soils from incubation experiments. Plant and Soil 68:379–388.
 *   Campbell, C.A. (1978). Soil organic carbon, nitrogen and fertility. In: Schnitzer, M.
 *     & Khan, S.U. (Eds.) Soil Organic Matter, pp. 173–271. Elsevier.
 */

'use strict';

/**
 * Classes de potencial de mineralizacao baseadas em N0 (mg/kg).
 * Limites adaptados de Richter et al. (1982) e Campbell (1978).
 * @private
 */
/** @type {Array<{max: number, label: 'very_low'|'low'|'medium'|'high'|'very_high'}>} */
const MINERALIZATION_CLASSES = [
    { max: 20, label: 'very_low' },
    { max: 50, label: 'low' },
    { max: 100, label: 'medium' },
    { max: 200, label: 'high' },
    { max: Infinity, label: 'very_high' },
];

/**
 * Calcula o nitrogenio mineralizado acumulado no tempo t usando cinetica de primeira ordem.
 *
 * Formula: N_min = N0 × (1 - exp(-k × t))
 *   N0 = potencial de mineralizacao (mg/kg)
 *   k  = constante de mineralizacao (yr^-1)
 *   t  = tempo (anos)
 *
 * @param {number} N0_mg_kg - Potencial de mineralizacao de N (mg N/kg solo), must be > 0
 * @param {number} k_yr - Constante de mineralizacao (yr^-1), must be > 0
 * @param {number} t_yr - Tempo de incubacao (anos), must be >= 0
 * @returns {{ N_mineralized_mg_kg: number, N0_mg_kg: number, k_yr: number, t_yr: number }}
 */
export function calcMineralizationRate(N0_mg_kg: any, k_yr: any, t_yr: any) {
    if (typeof N0_mg_kg !== 'number' || !isFinite(N0_mg_kg) || N0_mg_kg <= 0) {
        throw new RangeError(`N0_mg_kg must be a positive finite number, got: ${N0_mg_kg}`);
    }
    if (typeof k_yr !== 'number' || !isFinite(k_yr) || k_yr <= 0) {
        throw new RangeError(`k_yr must be a positive finite number, got: ${k_yr}`);
    }
    if (typeof t_yr !== 'number' || !isFinite(t_yr) || t_yr < 0) {
        throw new RangeError(`t_yr must be >= 0, got: ${t_yr}`);
    }
    const N_mineralized_mg_kg = N0_mg_kg * (1 - Math.exp(-k_yr * t_yr));
    return { N_mineralized_mg_kg, N0_mg_kg, k_yr, t_yr };
}

/**
 * Ajusta a constante de mineralizacao pela temperatura usando o fator Q10.
 *
 * Formula: k_adj = k_opt × Q10^((T - T_opt) / 10)
 *   Tipicamente Q10 = 2.0 (Stanford & Smith 1972)
 *
 * @param {number} kOptimal - Constante otima de mineralizacao (yr^-1 ou d^-1), must be > 0
 * @param {number} T - Temperatura atual (°C)
 * @param {number} Toptimal - Temperatura otima de referencia (°C), tipicamente 25–35 °C
 * @param {number} [Q10=2.0] - Fator Q10 (sem unidade), must be > 0
 * @returns {{ k_adjusted: number, kOptimal: number, T: number, Toptimal: number, Q10: number }}
 */
export function calcOptimalCRate(kOptimal: any, T: any, Toptimal: any, Q10 = 2.0) {
    if (typeof kOptimal !== 'number' || !isFinite(kOptimal) || kOptimal <= 0) {
        throw new RangeError(`kOptimal must be > 0, got: ${kOptimal}`);
    }
    if (typeof T !== 'number' || !isFinite(T)) {
        throw new TypeError(`T must be a finite number, got: ${T}`);
    }
    if (typeof Toptimal !== 'number' || !isFinite(Toptimal)) {
        throw new TypeError(`Toptimal must be a finite number, got: ${Toptimal}`);
    }
    if (typeof Q10 !== 'number' || !isFinite(Q10) || Q10 <= 0) {
        throw new RangeError(`Q10 must be > 0, got: ${Q10}`);
    }
    const k_adjusted = kOptimal * Math.pow(Q10, (T - Toptimal) / 10);
    return { k_adjusted, kOptimal, T, Toptimal, Q10 };
}

function _validateAnnualInputs(N0: any, k: any, T_monthly: any, precip_monthly: any): void {
    if (typeof N0 !== 'number' || !isFinite(N0) || N0 <= 0) {
        throw new RangeError(`N0 must be > 0, got: ${N0}`);
    }
    if (typeof k !== 'number' || !isFinite(k) || k <= 0) {
        throw new RangeError(`k must be > 0, got: ${k}`);
    }
    if (!Array.isArray(T_monthly) || T_monthly.length !== 12) {
        throw new TypeError('T_monthly must be an array of 12 values');
    }
    if (!Array.isArray(precip_monthly) || precip_monthly.length !== 12) {
        throw new TypeError('precip_monthly must be an array of 12 values');
    }
}

function _computeMonthlyEntry(N0: number, k: number, T: any, P: any, monthIndex: number) {
    if (typeof T !== 'number' || !isFinite(T)) throw new TypeError(`T_monthly[${monthIndex}] is invalid`);
    if (typeof P !== 'number' || !isFinite(P) || P < 0) throw new RangeError(`precip_monthly[${monthIndex}] must be >= 0`);
    const k_m = k * Math.pow(2.0, (T - 25) / 10);
    const fw = Math.min(1, P / 50);
    const N_m = N0 * (1 - Math.exp(-k_m / 12)) * fw;
    return { month: monthIndex + 1, N_mg_kg: N_m, k_m, fw };
}

/**
 * Calcula o nitrogenio total mineralizado no ano integrando sobre meses com
 * ajuste de temperatura mensal e fracao ativa pela precipitacao.
 *
 * Abordagem: soma mensal ponderada. Para cada mes m:
 *   k_m = kBase × Q10^((T_m - 25) / 10)
 *   N_m = N0 × (1 - exp(-k_m/12)) × fw_m
 *   fw_m = min(1, precip_m / 50) - fator de umidade (sem unidade)
 *
 * @param {number} N0 - Potencial de mineralizacao (mg N/kg solo), must be > 0
 * @param {number} k - Constante de mineralizacao base a 25°C (yr^-1), must be > 0
 * @param {number[]} T_monthly - 12 temperaturas mensais (°C), length must be 12
 * @param {number[]} precip_monthly - 12 precipitacoes mensais (mm), length must be 12, all >= 0
 * @returns {{ N_annual_mg_kg: number, monthly: Array<{month:number, N_mg_kg:number, k_m:number, fw:number}> }}
 */
export function calcAnnualNMineral(N0: any, k: any, T_monthly: any, precip_monthly: any) {
    _validateAnnualInputs(N0, k, T_monthly, precip_monthly);
    let N_annual_mg_kg = 0;
    const monthly = [];
    for (let i = 0; i < 12; i++) {
        const entry = _computeMonthlyEntry(N0, k, T_monthly[i], precip_monthly[i], i);
        N_annual_mg_kg += entry.N_mg_kg;
        monthly.push(entry);
    }
    return { N_annual_mg_kg, monthly };
}

/**
 * Classifica o potencial de mineralizacao de N com base em N0 (mg N/kg solo).
 *
 * | Classe    | N0 (mg/kg)    |
 * |-----------|---------------|
 * | very_low  | < 20          |
 * | low       | 20 – 50       |
 * | medium    | 50 – 100      |
 * | high      | 100 – 200     |
 * | very_high | > 200         |
 *
 * @param {number} N0_mg_kg - Potencial de mineralizacao (mg N/kg), must be > 0
 * @returns {'very_low'|'low'|'medium'|'high'|'very_high'}
 */
export function classifyNMineralizationPotential(N0_mg_kg: any) {
    if (typeof N0_mg_kg !== 'number' || !isFinite(N0_mg_kg) || N0_mg_kg <= 0) {
        throw new RangeError(`N0_mg_kg must be > 0, got: ${N0_mg_kg}`);
    }
    for (const cls of MINERALIZATION_CLASSES) {
        if (N0_mg_kg < cls.max) return cls.label;
    }
    return 'very_high';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilNitrogenMineralizationMeta = {
    name: 'soilNitrogenMineralization',
    description: 'soilNitrogenMineralization',
    category: 'analytics',
    familyTags: ['soil', 'mining', 'hydrocarbon'],
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
