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
 * Soil Carbon Sequestration analytics module.
 * Calcula estoque e variação de carbono orgânico do solo para fins de monitoramento ambiental.
 *
 * Referências acadêmicas:
 * - IPCC (2006). "2006 IPCC Guidelines for National Greenhouse Gas Inventories".
 *   Volume 4: Agriculture, Forestry and Other Land Use. ISBN:9789291691654
 * - Batjes, N.H. (1996). "Total carbon and nitrogen in the soils of the world".
 *   European Journal of Soil Science 47(2):151-163. DOI:10.1111/j.1365-2389.1996.tb01386.x
 */

/**
 * Calcula o estoque de Carbono Orgânico do Solo (SOC stock) para uma camada.
 * SOC_stock (Mg/ha) = SOC (g/kg) × bulk_density (g/cm³) × depth (cm) × 0.01
 * O fator 0.01 converte unidades para Mg C/ha.
 *
 * @param {number} SOC_g_kg - Teor de carbono orgânico do solo (g/kg, > 0)
 * @param {number} bulk_density_g_cm3 - Densidade do solo (g/cm³, 0.1–2.0)
 * @param {number} depth_cm - Profundidade da camada (cm, > 0)
 * @returns {{ SOC_stock_Mg_ha: number }}
 */
export function computeSoilOrganicCarbonStock(SOC_g_kg: any, bulk_density_g_cm3: any, depth_cm: any) {
    if (typeof SOC_g_kg !== 'number' || typeof bulk_density_g_cm3 !== 'number' || typeof depth_cm !== 'number') {
        throw new TypeError('Todos os parâmetros devem ser números');
    }
    if (!Number.isFinite(SOC_g_kg) || SOC_g_kg <= 0) {
        throw new RangeError('SOC_g_kg deve ser um número finito positivo');
    }
    if (!Number.isFinite(bulk_density_g_cm3) || bulk_density_g_cm3 < 0.1 || bulk_density_g_cm3 > 2.0) {
        throw new RangeError('bulk_density_g_cm3 deve estar entre 0.1 e 2.0 g/cm³');
    }
    if (!Number.isFinite(depth_cm) || depth_cm <= 0) {
        throw new RangeError('depth_cm deve ser um número finito positivo');
    }
    const SOC_stock_Mg_ha = SOC_g_kg * bulk_density_g_cm3 * depth_cm * 0.01;
    return { SOC_stock_Mg_ha };
}

/**
 * Calcula a variação anual de carbono orgânico do solo entre dois períodos.
 * delta = (SOC_final - SOC_inicial) / anos
 *
 * @param {number} SOC_stock_initial - Estoque inicial (Mg C/ha, ≥ 0)
 * @param {number} SOC_stock_final - Estoque final (Mg C/ha, ≥ 0)
 * @param {number} years - Número de anos no período (> 0, inteiro)
 * @returns {{ delta_Mg_ha_yr: number }}
 */
export function computeAnnualCarbonChange(SOC_stock_initial: any, SOC_stock_final: any, years: any) {
    if (typeof SOC_stock_initial !== 'number' || typeof SOC_stock_final !== 'number' || typeof years !== 'number') {
        throw new TypeError('Todos os parâmetros devem ser números');
    }
    if (!Number.isFinite(SOC_stock_initial) || SOC_stock_initial < 0) {
        throw new RangeError('SOC_stock_initial deve ser um número finito não-negativo');
    }
    if (!Number.isFinite(SOC_stock_final) || SOC_stock_final < 0) {
        throw new RangeError('SOC_stock_final deve ser um número finito não-negativo');
    }
    if (!Number.isFinite(years) || years <= 0) {
        throw new RangeError('years deve ser um número finito positivo');
    }
    const delta_Mg_ha_yr = (SOC_stock_final - SOC_stock_initial) / years;
    return { delta_Mg_ha_yr };
}

/**
 * Converte variação de carbono do solo para CO₂ equivalente total.
 * CO2eq = delta_C × 3.667 × area_ha
 * Fator 3.667 = razão molar CO₂/C (44/12).
 *
 * @param {number} delta_C_Mg_ha_yr - Variação anual de carbono (Mg C/ha/ano)
 * @param {number} area_ha - Área total (ha, > 0)
 * @returns {{ CO2eq_t_yr: number }}
 */
export function computeCO2Equivalent(delta_C_Mg_ha_yr: any, area_ha: any) {
    if (typeof delta_C_Mg_ha_yr !== 'number' || typeof area_ha !== 'number') {
        throw new TypeError('Ambos os parâmetros devem ser números');
    }
    if (!Number.isFinite(delta_C_Mg_ha_yr)) {
        throw new RangeError('delta_C_Mg_ha_yr deve ser um número finito');
    }
    if (!Number.isFinite(area_ha) || area_ha <= 0) {
        throw new RangeError('area_ha deve ser um número finito positivo');
    }
    // 1 Mg C/ha = 1 t C/ha; CO2eq em t CO2/ano
    const CO2eq_t_yr = delta_C_Mg_ha_yr * 3.667 * area_ha;
    return { CO2eq_t_yr };
}

/**
 * Classifica o potencial de sequestro de carbono do solo com base na variação anual.
 *
 * @param {number} delta_Mg_ha_yr - Variação anual de carbono (Mg C/ha/ano)
 * @returns {{ potential: 'source'|'negligible'|'low'|'moderate'|'high' }}
 */
export function classifySequestrationPotential(delta_Mg_ha_yr: any) {
    if (typeof delta_Mg_ha_yr !== 'number' || !Number.isFinite(delta_Mg_ha_yr)) {
        throw new TypeError('delta_Mg_ha_yr deve ser um número finito');
    }
    /** @type {'source'|'negligible'|'low'|'moderate'|'high'} */
    let potential;
    if (delta_Mg_ha_yr < 0) potential = 'source';
    else if (delta_Mg_ha_yr < 0.1) potential = 'negligible';
    else if (delta_Mg_ha_yr < 0.5) potential = 'low';
    else if (delta_Mg_ha_yr < 1.5) potential = 'moderate';
    else potential = 'high';
    return { potential };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilCarbonSequestrationMeta = {
    name: 'soilCarbonSequestration',
    description: 'soilCarbonSequestration',
    category: 'analytics',
    familyTags: ['soil', 'climate', 'hydrocarbon', 'lca'],
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
