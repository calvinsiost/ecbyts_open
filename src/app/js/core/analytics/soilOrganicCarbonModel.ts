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
// Soil Organic Carbon Model - stock, sequestration, and decomposition dynamics
// Modelo de Carbono Orgânico do Solo - estoque, sequestro e dinâmica de decomposição

'use strict';

/**
 * Computes soil organic carbon stock from field measurements.
 * Calcula o estoque de carbono orgânico do solo a partir de medições de campo.
 *
 * Formula: SOC (t/ha) = BD × (OC/100) × (depth/100) × (1 - stoniness/100) × 10000
 *
 * @param {number} bulk_density_g_cm3 - Bulk density in g/cm³ (0 < BD ≤ 2.5)
 * @param {number} oc_pct - Organic carbon percentage (0 ≤ OC ≤ 60)
 * @param {number} depth_cm - Soil depth in cm (> 0)
 * @param {number} stoniness_pct - Rock fragment content percentage (0 ≤ s < 100)
 * @returns {{ soc_t_ha: number, soc_kg_m2: number }}
 * @throws {RangeError} If any parameter is out of valid range
 * @throws {TypeError} If any parameter is not a number
 * @see Coleman & Jenkinson (1996) Soil Use Manage DOI:10.1111/j.1475-2743.1996.tb00580.x
 * @see IPCC (2006) Guidelines for National Greenhouse Gas Inventories, LULUCF
 */
export function computeSOCStock(bulk_density_g_cm3: any, oc_pct: any, depth_cm: any, stoniness_pct: any) {
    // Validação de tipos
    for (const [name, val] of [
        ['bulk_density_g_cm3', bulk_density_g_cm3],
        ['oc_pct', oc_pct],
        ['depth_cm', depth_cm],
        ['stoniness_pct', stoniness_pct],
    ]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} must be a finite number`);
        }
    }
    // Validação de intervalos
    if (bulk_density_g_cm3 <= 0 || bulk_density_g_cm3 > 2.5) {
        throw new RangeError('bulk_density_g_cm3 must be in (0, 2.5]');
    }
    if (oc_pct < 0 || oc_pct > 60) {
        throw new RangeError('oc_pct must be in [0, 60]');
    }
    if (depth_cm <= 0) {
        throw new RangeError('depth_cm must be > 0');
    }
    if (stoniness_pct < 0 || stoniness_pct >= 100) {
        throw new RangeError('stoniness_pct must be in [0, 100)');
    }

    // SOC em t/ha: BD(g/cm³) × OC(fração) × profundidade(m) × área(m²/ha)
    const soc_t_ha = bulk_density_g_cm3 * (oc_pct / 100) * (depth_cm / 100) * (1 - stoniness_pct / 100) * 10000;
    // Conversão para kg/m²: 1 t/ha = 0.1 kg/m²
    const soc_kg_m2 = soc_t_ha * 0.1;

    return { soc_t_ha, soc_kg_m2 };
}

/**
 * Simulates RothC decomposition over 10 years (simplified).
 * Simula a decomposição RothC ao longo de 10 anos (versão simplificada).
 *
 * k_decomp = 0.012 × temp_factor × moisture_factor
 * temp_factor = exp(308.56 × (1/56.02 − 1/(T+46.02)))
 * moisture_factor derived from rainfall and clay content
 *
 * @param {number} soc_initial_t_ha - Initial SOC stock in t/ha (> 0)
 * @param {number} clay_pct - Clay content percentage (0 ≤ c ≤ 100)
 * @param {number} mean_temp_c - Mean annual temperature in °C (−20 ≤ T ≤ 50)
 * @param {number} rainfall_mm_yr - Mean annual rainfall in mm/yr (> 0)
 * @param {number} plant_input_t_ha_yr - Annual plant carbon input in t C/ha/yr (≥ 0)
 * @returns {{ soc_after_10yr_t_ha: number, annual_change_t_ha_yr: number }}
 * @throws {RangeError} If any parameter is out of valid range
 * @see Coleman & Jenkinson (1996) DOI:10.1111/j.1475-2743.1996.tb00580.x
 * @see Minasny et al. (2017) Geoderma DOI:10.1016/j.geoderma.2017.01.002
 */
export function computeRothCDecomposition(
    soc_initial_t_ha: any,
    clay_pct: any,
    mean_temp_c: any,
    rainfall_mm_yr: any,
    plant_input_t_ha_yr: any,
) {
    for (const [name, val] of [
        ['soc_initial_t_ha', soc_initial_t_ha],
        ['clay_pct', clay_pct],
        ['mean_temp_c', mean_temp_c],
        ['rainfall_mm_yr', rainfall_mm_yr],
        ['plant_input_t_ha_yr', plant_input_t_ha_yr],
    ]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} must be a finite number`);
        }
    }
    if (soc_initial_t_ha <= 0) throw new RangeError('soc_initial_t_ha must be > 0');
    if (clay_pct < 0 || clay_pct > 100) throw new RangeError('clay_pct must be in [0, 100]');
    if (mean_temp_c < -20 || mean_temp_c > 50) throw new RangeError('mean_temp_c must be in [-20, 50]');
    if (rainfall_mm_yr <= 0) throw new RangeError('rainfall_mm_yr must be > 0');
    if (plant_input_t_ha_yr < 0) throw new RangeError('plant_input_t_ha_yr must be >= 0');

    // Fator de temperatura RothC (equação de Lloyd & Taylor 1994)
    const temp_factor = Math.exp(308.56 * (1 / 56.02 - 1 / (mean_temp_c + 46.02)));

    // Fator de umidade: baseado em rainfall e retenção hídrica do solo (argila)
    const field_capacity_mm = 100 + clay_pct * 2; // estimativa simples
    const moisture_factor = Math.min(1.0, rainfall_mm_yr / (field_capacity_mm * 12));

    // Taxa de decomposição anual (constante k do RothC simplificado)
    const k_decomp = 0.012 * temp_factor * moisture_factor;

    // Integração numérica anual: dSOC/dt = input - k×SOC
    let soc = soc_initial_t_ha;
    for (let yr = 0; yr < 10; yr++) {
        soc = soc + plant_input_t_ha_yr - k_decomp * soc;
        if (soc < 0) soc = 0; // proteção numérica
    }

    const annual_change_t_ha_yr = (soc - soc_initial_t_ha) / 10;

    return { soc_after_10yr_t_ha: soc, annual_change_t_ha_yr };
}

/**
 * Estimates SOC sequestration potential from land-use change.
 * Estima o potencial de sequestro de COT a partir de mudança de uso do solo.
 *
 * Total CO2eq = sequestration_rate × area × years × 3.67 (C → CO2 conversion)
 *
 * @param {'degraded_to_forest'|'cropland_to_grassland'|'conventional_to_conservation_tillage'|'bare_to_agroforestry'} land_use_change
 * @param {number} area_ha - Area in hectares (> 0)
 * @param {number} years - Project duration in years (> 0)
 * @returns {{ sequestration_t_ha_yr: number, total_tCO2eq: number }}
 * @throws {RangeError} If area or years ≤ 0
 * @throws {TypeError} If land_use_change is invalid
 * @see IPCC (2006) LULUCF Guidelines, Table 5.5
 * @see EMBRAPA (2017) Manual de Análises Químicas de Solos
 */
export function computeSOCSequestrationPotential(land_use_change: any, area_ha: any, years: any) {
    const RATES = {
        degraded_to_forest: 1.5,
        cropland_to_grassland: 0.9,
        conventional_to_conservation_tillage: 0.3,
        bare_to_agroforestry: 1.2,
    };

    if (!Object.prototype.hasOwnProperty.call(RATES, land_use_change)) {
        throw new TypeError(`land_use_change must be one of: ${Object.keys(RATES).join(', ')}`);
    }
    if (typeof area_ha !== 'number' || !Number.isFinite(area_ha) || area_ha <= 0) {
        throw new RangeError('area_ha must be a finite number > 0');
    }
    if (typeof years !== 'number' || !Number.isFinite(years) || years <= 0) {
        throw new RangeError('years must be a finite number > 0');
    }

    const sequestration_t_ha_yr = RATES[land_use_change as keyof typeof RATES];
    // Fator 3.67 = conversão C → CO2 (razão molar 44/12)
    const total_tCO2eq = sequestration_t_ha_yr * area_ha * years * 3.67;

    return { sequestration_t_ha_yr, total_tCO2eq };
}

/**
 * Classifies SOC stock status relative to soil type and climate zone.
 * Classifica o status do estoque de COT em relação ao tipo de solo e zona climática.
 *
 * Thresholds based on IPCC Tier 1 reference values (t C/ha):
 *   very_low < 20, low 20-40, medium 40-80, high 80-150, very_high > 150
 * Soil type adjusts thresholds ±20%: tropical (−20%), boreal (+20%)
 *
 * @param {number} soc_t_ha - SOC stock in t/ha (≥ 0)
 * @param {'tropical'|'temperate'|'boreal'} soil_type - Soil/biome type
 * @param {string} _climate_zone - Climate zone (informational, used for sustainability message)
 * @returns {{ status: 'very_low'|'low'|'medium'|'high'|'very_high', sustainability: string }}
 * @throws {RangeError} If soc_t_ha < 0
 * @throws {TypeError} If soil_type is invalid
 * @see IPCC (2006) LULUCF Guidelines, Chapter 2
 */
export function classifySOCStatus(soc_t_ha: any, soil_type: any, _climate_zone: any) {
    if (typeof soc_t_ha !== 'number' || !Number.isFinite(soc_t_ha) || soc_t_ha < 0) {
        throw new RangeError('soc_t_ha must be a finite number >= 0');
    }
    const VALID_SOIL_TYPES = ['tropical', 'temperate', 'boreal'];
    if (!VALID_SOIL_TYPES.includes(soil_type)) {
        throw new TypeError(`soil_type must be one of: ${VALID_SOIL_TYPES.join(', ')}`);
    }

    // Ajuste de thresholds por tipo de solo (fator de escala)
    const SCALE = { tropical: 0.8, temperate: 1.0, boreal: 1.2 };
    const s = SCALE[soil_type as keyof typeof SCALE];

    const thresholds = {
        very_low: 20 * s,
        low: 40 * s,
        medium: 80 * s,
        high: 150 * s,
    };

    /** @type {'very_low'|'low'|'medium'|'high'|'very_high'} */
    let status;
    if (soc_t_ha < thresholds.very_low) status = 'very_low';
    else if (soc_t_ha < thresholds.low) status = 'low';
    else if (soc_t_ha < thresholds.medium) status = 'medium';
    else if (soc_t_ha < thresholds.high) status = 'high';
    else status = 'very_high';

    /** @type {Record<string, string>} */
    const SUSTAINABILITY_MESSAGES = {
        very_low: 'Immediate soil restoration required — carbon depletion critical',
        low: 'Soil carbon below sustainable threshold — management intervention needed',
        medium: 'Soil carbon within acceptable range — monitor and maintain',
        high: 'Healthy soil carbon stock — continue best management practices',
        very_high: 'Exceptional soil carbon — potential C sequestration credit eligibility',
    };

    return {
        status,
        sustainability: SUSTAINABILITY_MESSAGES[status as keyof typeof SUSTAINABILITY_MESSAGES],
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilOrganicCarbonModelMeta = {
    name: 'soilOrganicCarbonModel',
    description: 'soilOrganicCarbonModel',
    category: 'analytics',
    familyTags: ['soil', 'climate', 'hydrocarbon'],
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
