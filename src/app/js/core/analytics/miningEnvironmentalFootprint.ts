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
 * Mining Environmental Footprint - indicadores ambientais de mineração.
 *
 * Referências acadêmicas:
 * - Northey, S. et al. (2013). Modelling future copper ore grade decline based on a
 *   detailed assessment of copper resources and mining. Resources, Conservation and
 *   Recycling, 83, 190–201. DOI:10.1016/j.resconrec.2013.10.005
 * - Mudd, G.M. (2010). The Environmental sustainability of mining in Australia:
 *   key mega-trends and looming constraints. Resources Policy, 35(2), 98–115.
 *   DOI:10.1016/j.resourpol.2009.12.001
 * - World Bank (2017). The Growing Role of Minerals and Metals for a Low Carbon Future.
 *   ISBN: 978-1-4648-1076-4
 */

/** Benchmarks de referência — baseados em médias globais de mineração metálica (Mudd 2010) */
const BENCHMARK_WI = 1; // m³/t — intensidade hídrica de referência
const BENCHMARK_EI = 10; // GJ/t metal — intensidade energética de referência
const BENCHMARK_LDR = 100; // ha/Mt — razão de perturbação de terra de referência

/**
 * Calcula a intensidade hídrica da operação de mineração.
 * WI = water_consumed_m3 / ore_processed_t  [m³/t]
 *
 * @param {number} water_consumed_m3  Volume de água consumida (m³ ≥ 0).
 * @param {number} ore_processed_t    Minério processado (t > 0).
 * @returns {{ WI_m3_per_t: number }} Intensidade hídrica em m³/t.
 */
export function computeWaterIntensity(water_consumed_m3: any, ore_processed_t: any) {
    if (typeof water_consumed_m3 !== 'number' || typeof ore_processed_t !== 'number') {
        throw new TypeError('water_consumed_m3 e ore_processed_t devem ser numéricos');
    }
    if (water_consumed_m3 < 0) throw new RangeError('water_consumed_m3 não pode ser negativo');
    if (ore_processed_t <= 0) throw new RangeError('ore_processed_t deve ser positivo');
    return { WI_m3_per_t: water_consumed_m3 / ore_processed_t };
}

/**
 * Calcula a intensidade energética por tonelada de metal produzido.
 * EI = energy_GJ / (ore_processed_t × ore_grade_pct / 100)  [GJ/t_metal]
 * Correção por teor: teores menores implicam maior energia por tonelada de metal (Northey 2013).
 *
 * @param {number} energy_GJ        Energia consumida (GJ ≥ 0).
 * @param {number} ore_processed_t  Minério processado (t > 0).
 * @param {number} ore_grade_pct    Teor do minério (% > 0).
 * @returns {{ EI_GJ_per_t_metal: number }} Intensidade energética em GJ/t de metal.
 */
export function computeEnergyIntensityMining(energy_GJ: any, ore_processed_t: any, ore_grade_pct: any) {
    if (typeof energy_GJ !== 'number' || typeof ore_processed_t !== 'number' || typeof ore_grade_pct !== 'number') {
        throw new TypeError('energy_GJ, ore_processed_t e ore_grade_pct devem ser numéricos');
    }
    if (energy_GJ < 0) throw new RangeError('energy_GJ não pode ser negativo');
    if (ore_processed_t <= 0) throw new RangeError('ore_processed_t deve ser positivo');
    if (ore_grade_pct <= 0 || ore_grade_pct > 100) {
        throw new RangeError('ore_grade_pct deve estar entre 0 (exclusive) e 100');
    }
    const metal_t = ore_processed_t * (ore_grade_pct / 100);
    return { EI_GJ_per_t_metal: energy_GJ / metal_t };
}

/**
 * Calcula a razão de perturbação de terra normalizada por tonelada de minério (Mega-tonelada).
 * LDR = disturbed_area_ha / (ore_extracted_t / 1e6)  [ha/Mt]
 *
 * @param {number} disturbed_area_ha  Área perturbada (ha ≥ 0).
 * @param {number} ore_extracted_t    Minério extraído (t > 0).
 * @returns {{ LDR_ha_per_Mt: number }} Razão de perturbação de terra em ha/Mt.
 */
export function computeLandDisturbanceRatio(disturbed_area_ha: any, ore_extracted_t: any) {
    if (typeof disturbed_area_ha !== 'number' || typeof ore_extracted_t !== 'number') {
        throw new TypeError('disturbed_area_ha e ore_extracted_t devem ser numéricos');
    }
    if (disturbed_area_ha < 0) throw new RangeError('disturbed_area_ha não pode ser negativo');
    if (ore_extracted_t <= 0) throw new RangeError('ore_extracted_t deve ser positivo');
    const LDR_ha_per_Mt = disturbed_area_ha / (ore_extracted_t / 1e6);
    return { LDR_ha_per_Mt };
}

/**
 * Classifica o footprint ambiental da mineração com base nos 3 indicadores normalizados.
 * avg_score = (WI/WI_benchmark + EI/EI_benchmark + LDR/LDR_benchmark) / 3
 * Faixas: <0.5 minimal, <1 low, <2 moderate, <5 high, ≥5 intensive.
 *
 * @param {number} WI   Intensidade hídrica (m³/t ≥ 0).
 * @param {number} EI   Intensidade energética (GJ/t_metal ≥ 0).
 * @param {number} LDR  Razão de perturbação de terra (ha/Mt ≥ 0).
 * @returns {{ footprint: 'minimal'|'low'|'moderate'|'high'|'intensive', avg_score: number }}
 */
export function classifyMiningFootprint(WI: any, EI: any, LDR: any) {
    if (typeof WI !== 'number' || typeof EI !== 'number' || typeof LDR !== 'number') {
        throw new TypeError('WI, EI e LDR devem ser numéricos');
    }
    if (WI < 0) throw new RangeError('WI não pode ser negativo');
    if (EI < 0) throw new RangeError('EI não pode ser negativo');
    if (LDR < 0) throw new RangeError('LDR não pode ser negativo');

    const avg_score = (WI / BENCHMARK_WI + EI / BENCHMARK_EI + LDR / BENCHMARK_LDR) / 3;

    /** @type {'minimal'|'low'|'moderate'|'high'|'intensive'} */
    let footprint;
    if (avg_score < 0.5) footprint = 'minimal';
    else if (avg_score < 1) footprint = 'low';
    else if (avg_score < 2) footprint = 'moderate';
    else if (avg_score < 5) footprint = 'high';
    else footprint = 'intensive';

    return { footprint, avg_score };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const miningEnvironmentalFootprintMeta = {
    name: 'miningEnvironmentalFootprint',
    description: 'miningEnvironmentalFootprint',
    category: 'analytics',
    familyTags: ['mining', 'footprint'],
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
