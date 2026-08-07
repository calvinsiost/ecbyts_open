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
 * Wetland Carbon Model - Carbon sequestration, methane emission and GHG balance
 * Modelo de Carbono em Zonas Úmidas - sequestro de carbono, emissão de metano e balanço de GEE
 *
 * References / Referências:
 * - IPCC (2014) Wetlands Supplement to the 2006 IPCC Guidelines
 * - Mitsch & Gosselink (2015) Wetlands, 5th ed.
 * - Bridgham et al. (2013) Global Biogeochem Cycles DOI:10.1002/gbc.20103
 * - IPCC AR6 WG1 (2021) Chapter 7 - GWP100 CH4 = 28
 *
 * @module wetlandCarbonModel
 */

'use strict';

// GWP100 for methane from IPCC AR6 (2021) - potencial de aquecimento global do metano (100 anos)
const GWP_CH4 = 28;

// Molecular weight ratio CO2/C - razão de pesos moleculares para conversão C→CO2eq
const C_TO_CO2EQ = 44 / 12;

// Base methane emission for saturated wetland (g CH4/m²/yr) - Mitsch & Gosselink (2015) Table 6-3
const CH4_BASE_G_M2_YR = 50;

/**
 * Compute net carbon sequestration in a wetland area.
 * Calcula o sequestro líquido de carbono em uma zona úmida.
 *
 * Net storage = (NPP - decomposition) × area
 * Conversão C → CO2eq: multiplicar por 44/12
 *
 * @param {number} npp_g_m2_yr - Net Primary Production (g C / m² / yr)
 * @param {number} decomposition_rate - Decomposition rate (g C / m² / yr)
 * @param {number} area_m2 - Wetland area (m²)
 * @returns {{ sequestration_kg_yr: number, sequestration_tCO2eq_yr: number }}
 */
export function computeCarbonSequestration(npp_g_m2_yr: any, decomposition_rate: any, area_m2: any) {
    if (typeof npp_g_m2_yr !== 'number' || typeof decomposition_rate !== 'number' || typeof area_m2 !== 'number') {
        throw new TypeError('All arguments must be numbers');
    }
    if (npp_g_m2_yr < 0) throw new RangeError('npp_g_m2_yr must be >= 0');
    if (decomposition_rate < 0) throw new RangeError('decomposition_rate must be >= 0');
    if (area_m2 <= 0) throw new RangeError('area_m2 must be > 0');

    // Armazenamento líquido de carbono por unidade de área (g C/m²/yr)
    const net_g_m2_yr = npp_g_m2_yr - decomposition_rate;

    // Converte para kg/yr considerando a área total
    const sequestration_kg_yr = (net_g_m2_yr * area_m2) / 1000;

    // Converte carbono para CO2 equivalente e para toneladas
    const sequestration_tCO2eq_yr = (sequestration_kg_yr * C_TO_CO2EQ) / 1000;

    return { sequestration_kg_yr, sequestration_tCO2eq_yr };
}

/**
 * Compute methane emission from a wetland.
 * Calcula a emissão de metano de uma zona úmida.
 *
 * CH4 = base × exp(0.1 × T) × (1 − depth_factor)
 * depth_factor = min(1, water_table_depth / 0.5)
 * CO2eq = CH4 × GWP_CH4 (AR6)
 *
 * @param {number} water_table_depth_m - Water table depth (m); 0 = at surface
 * @param {number} temperature_c - Mean annual temperature (°C)
 * @param {number} organic_content_pct - Soil organic content (%)
 * @returns {{ ch4_g_m2_yr: number, co2eq_g_m2_yr: number }}
 */
export function computeMethaneEmission(water_table_depth_m: any, temperature_c: any, organic_content_pct: any) {
    if (
        typeof water_table_depth_m !== 'number' ||
        typeof temperature_c !== 'number' ||
        typeof organic_content_pct !== 'number'
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (temperature_c < -20 || temperature_c > 50) {
        throw new RangeError('temperature_c must be in [-20, 50]');
    }
    if (water_table_depth_m < 0) throw new RangeError('water_table_depth_m must be >= 0');
    if (organic_content_pct < 0 || organic_content_pct > 100) {
        throw new RangeError('organic_content_pct must be in [0, 100]');
    }

    // Fator de profundidade do lençol freático (suprime emissão quando abaixo de 0.5m)
    const depth_factor = Math.min(1, water_table_depth_m / 0.5);

    // Emissão de CH4: modelo exponencial de temperatura (Q10 simplificado)
    const ch4_g_m2_yr = CH4_BASE_G_M2_YR * Math.exp(0.1 * temperature_c) * (1 - depth_factor);

    // Converte para CO2eq usando GWP100 do IPCC AR6
    const co2eq_g_m2_yr = ch4_g_m2_yr * GWP_CH4;

    return { ch4_g_m2_yr, co2eq_g_m2_yr };
}

/**
 * Compute net GHG balance for a wetland (sequestration minus methane emission).
 * Calcula o balanço líquido de GEE de uma zona úmida.
 *
 * net = sequestration − (ch4_emission × area converted to tCO2eq/yr)
 * sink = true se o wetland remove mais GEE do que emite
 *
 * @param {number} sequestration_tCO2eq_yr - Carbon sequestration (t CO2eq / yr)
 * @param {number} ch4_emission_g_m2_yr - Methane emission (g CH4 / m² / yr)
 * @param {number} area_m2 - Wetland area (m²)
 * @returns {{ net_tCO2eq_yr: number, sink: boolean }}
 */
export function computeNetGHGBalance(sequestration_tCO2eq_yr: any, ch4_emission_g_m2_yr: any, area_m2: any) {
    if (
        typeof sequestration_tCO2eq_yr !== 'number' ||
        typeof ch4_emission_g_m2_yr !== 'number' ||
        typeof area_m2 !== 'number'
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (area_m2 <= 0) throw new RangeError('area_m2 must be > 0');
    if (ch4_emission_g_m2_yr < 0) throw new RangeError('ch4_emission_g_m2_yr must be >= 0');

    // Converte emissão de CH4 (g/m²/yr) para tCO2eq/yr considerando a área e GWP100
    const ch4_tCO2eq_yr = (ch4_emission_g_m2_yr * area_m2 * GWP_CH4) / 1e6;

    // Balanço líquido: positivo = fonte, negativo = sumidouro
    const net_tCO2eq_yr = sequestration_tCO2eq_yr - ch4_tCO2eq_yr;

    return { net_tCO2eq_yr, sink: net_tCO2eq_yr < 0 };
}

/**
 * Classify wetland mitigation potential based on net GHG balance per hectare.
 * Classifica o potencial de mitigação do wetland baseado no balanço líquido por hectare.
 *
 * high_sink < -5 tCO2eq/ha/yr | moderate_sink < -1 | neutral < 1 | source >= 1
 *
 * @param {number} net_tCO2eq_yr_ha - Net GHG balance (t CO2eq / ha / yr); negative = sink
 * @returns {{ category: 'high_sink'|'moderate_sink'|'neutral'|'source', description: string }}
 */
export function classifyWetlandMitigationPotential(net_tCO2eq_yr_ha: any) {
    if (typeof net_tCO2eq_yr_ha !== 'number') {
        throw new TypeError('net_tCO2eq_yr_ha must be a number');
    }

    if (net_tCO2eq_yr_ha < -5) {
        return { category: 'high_sink', description: 'Strong carbon sink (> 5 t CO2eq/ha/yr removed)' };
    }
    if (net_tCO2eq_yr_ha < -1) {
        return { category: 'moderate_sink', description: 'Moderate carbon sink (1–5 t CO2eq/ha/yr removed)' };
    }
    if (net_tCO2eq_yr_ha < 1) {
        return { category: 'neutral', description: 'Near-neutral GHG balance (< 1 t CO2eq/ha/yr net)' };
    }
    return { category: 'source', description: 'Net GHG source (> 1 t CO2eq/ha/yr emitted)' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const wetlandCarbonModelMeta = {
    name: 'wetlandCarbonModel',
    description: 'wetlandCarbonModel',
    category: 'analytics',
    familyTags: ['climate', 'wetland'],
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
