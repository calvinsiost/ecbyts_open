// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Water Footprint Model - WFN / ISO 14046
// Pegada hídrica: água azul, verde e cinza segundo metodologia WFN e ISO 14046:2014.
//
// References:
//   Hoekstra et al. (2011) The Water Footprint Assessment Manual - earthscan.co.uk
//   ISO 14046:2014 - Environmental management: Water footprint principles
//   Mekonnen & Hoekstra (2016) Science Advances DOI:10.1126/sciadv.1500323
//   ANA (2019) Relatório Conjuntura dos Recursos Hídricos no Brasil

'use strict';

interface BlueWaterFootprintResult { blue_wf_m3: number; consumptive_m3: number; }
interface GreenWaterFootprintResult { green_wf_m3: number; efficiency: number; }
interface GreyWaterFootprintResult { grey_wf_m3: number; }
interface WaterStressImpactResult { impact: string; wsi: number; recommendation: string; }

/**
 * Computes the blue water footprint (surface + groundwater consumptive use).
 * Calcula a pegada de água azul (água superficial e subterrânea consumida).
 *
 * @param {number} irrigation_m3       - Water volume used for irrigation (m³)
 * @param {number} industrial_m3       - Water volume used in industrial processes (m³)
 * @param {number} municipal_m3        - Water volume for municipal use (m³)
 * @param {number} return_flow_fraction - Fraction of water returned to source [0–1]
 * @returns {{ blue_wf_m3: number, consumptive_m3: number }}
 */
export function computeBlueWaterFootprint(irrigation_m3: number, industrial_m3: number, municipal_m3: number, return_flow_fraction: number): BlueWaterFootprintResult {
    if ([irrigation_m3, industrial_m3, municipal_m3, return_flow_fraction].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (irrigation_m3 < 0) throw new RangeError('irrigation_m3 must be >= 0');
    if (industrial_m3 < 0) throw new RangeError('industrial_m3 must be >= 0');
    if (municipal_m3 < 0) throw new RangeError('municipal_m3 must be >= 0');
    if (return_flow_fraction < 0 || return_flow_fraction > 1) {
        throw new RangeError('return_flow_fraction must be in [0, 1]');
    }

    // Total abstraído do sistema hídrico
    const total_m3 = irrigation_m3 + industrial_m3 + municipal_m3;
    // Volume devolvido ao manancial (efluente tratado, retorno de irrigação, etc.)
    const returned_m3 = total_m3 * return_flow_fraction;
    // Uso consuntivo = total - retorno (Hoekstra et al. 2011, Cap. 2)
    const consumptive_m3 = total_m3 - returned_m3;
    const blue_wf_m3 = consumptive_m3;

    return { blue_wf_m3, consumptive_m3 };
}

/**
 * Computes the green water footprint (rainwater consumed by crops).
 * Calcula a pegada de água verde (evapotranspiração de água pluvial em culturas).
 *
 * @param {number} evapotranspiration_mm - Actual evapotranspiration of the crop (mm)
 * @param {number} precipitation_mm      - Effective precipitation in the crop period (mm)
 * @param {number} crop_area_ha          - Cultivated area (ha)
 * @returns {{ green_wf_m3: number, efficiency: number }}
 */
export function computeGreenWaterFootprint(evapotranspiration_mm: number, precipitation_mm: number, crop_area_ha: number): GreenWaterFootprintResult {
    if ([evapotranspiration_mm, precipitation_mm, crop_area_ha].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (evapotranspiration_mm < 0) throw new RangeError('evapotranspiration_mm must be >= 0');
    if (precipitation_mm < 0) throw new RangeError('precipitation_mm must be >= 0');
    if (crop_area_ha < 0) throw new RangeError('crop_area_ha must be >= 0');

    // ET_green = parte da ET suprida pela chuva efetiva (não pode exceder a precipitação)
    const et_green_mm = Math.min(evapotranspiration_mm, precipitation_mm);
    // Conversão mm × ha → m³: 1 mm × 1 ha = 10 m³
    const green_wf_m3 = et_green_mm * crop_area_ha * 10;
    // Eficiência: razão ET real / ET potencial (aproximado por ET_real = evapotranspiration_mm)
    const efficiency = evapotranspiration_mm > 0 ? et_green_mm / evapotranspiration_mm : 0;

    return { green_wf_m3, efficiency };
}

/**
 * Computes the grey water footprint (freshwater needed to dilute pollutants).
 * Calcula a pegada de água cinza (volume para diluição até o padrão de qualidade).
 *
 * @param {number} pollutant_load_kg      - Mass of pollutant discharged (kg)
 * @param {number} natural_concentration_mg_L - Natural/background concentration (mg/L)
 * @param {number} max_allowable_mg_L     - Maximum allowable concentration (mg/L); must be > natural
 * @returns {{ grey_wf_m3: number }}
 */
export function computeGreyWaterFootprint(pollutant_load_kg: number, natural_concentration_mg_L: number, max_allowable_mg_L: number): GreyWaterFootprintResult {
    if ([pollutant_load_kg, natural_concentration_mg_L, max_allowable_mg_L].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (pollutant_load_kg < 0) throw new RangeError('pollutant_load_kg must be >= 0');
    if (natural_concentration_mg_L < 0) throw new RangeError('natural_concentration_mg_L must be >= 0');
    if (max_allowable_mg_L <= natural_concentration_mg_L) {
        throw new RangeError('max_allowable_mg_L must be > natural_concentration_mg_L');
    }

    // WF_grey = carga / (Cmax - Cnat) × fator de conversão kg/(mg/L) → m³
    // Unidades: kg / (mg/L) = kg / (g/m³) = kg × m³/g = 1000 m³ (conversão 1 kg = 1000 g)
    const grey_wf_m3 = (pollutant_load_kg * 1e6) / (max_allowable_mg_L - natural_concentration_mg_L);

    return { grey_wf_m3 };
}

/**
 * Classifies water stress impact of a water footprint in a given watershed.
 * Classifica o impacto da pegada hídrica sobre o estresse hídrico da bacia.
 *
 * @param {number} total_wf_m3                - Total water footprint (m³/yr)
 * @param {number} watershed_availability_m3_yr - Natural water availability of watershed (m³/yr)
 * @param {number} current_withdrawal_m3_yr   - Current total withdrawal in watershed (m³/yr)
 * @returns {{ impact: string, wsi: number, recommendation: string }}
 */
export function classifyWaterStressImpact(total_wf_m3: number, watershed_availability_m3_yr: number, current_withdrawal_m3_yr: number): WaterStressImpactResult {
    if ([total_wf_m3, watershed_availability_m3_yr, current_withdrawal_m3_yr].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (total_wf_m3 < 0) throw new RangeError('total_wf_m3 must be >= 0');
    if (watershed_availability_m3_yr <= 0) throw new RangeError('watershed_availability_m3_yr must be > 0');
    if (current_withdrawal_m3_yr < 0) throw new RangeError('current_withdrawal_m3_yr must be >= 0');

    // WSI = (retirada atual + pegada adicional) / disponibilidade - Hoekstra et al. (2011)
    const wsi = (current_withdrawal_m3_yr + total_wf_m3) / watershed_availability_m3_yr;

    let impact: string;
    let recommendation: string;

    if (wsi > 1.0) {
        impact = 'severe';
        recommendation = 'Critical overuse. Immediate demand reduction and reuse required. Notify ANA.';
    } else if (wsi > 0.8) {
        impact = 'significant';
        recommendation = 'High stress. Implement water efficiency measures and seek alternative sources.';
    } else if (wsi > 0.4) {
        impact = 'moderate';
        recommendation = 'Moderate stress. Water audits and efficiency programs recommended.';
    } else if (wsi > 0.1) {
        impact = 'low';
        recommendation = 'Low impact. Monitor periodically and maintain usage records.';
    } else {
        impact = 'negligible';
        recommendation = 'Negligible impact. Maintain good practices.';
    }

    return { impact, wsi, recommendation };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const waterFootprintModelMeta = {
    name: 'waterFootprintModel',
    description: 'waterFootprintModel',
    category: 'analytics',
    familyTags: ['water', 'footprint'],
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
