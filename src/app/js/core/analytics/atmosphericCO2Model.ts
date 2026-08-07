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
 * @module atmosphericCO2Model
 * Modelos de concentração de CO2 atmosférico, forçamento radiativo e resposta de temperatura.
 *
 * Referências acadêmicas:
 * - Friedlingstein et al. 2022 - Global Carbon Budget 2022
 *   DOI: 10.5194/essd-14-4811-2022
 * - Myhre et al. 1998 - New estimates of radiative forcing due to well mixed greenhouse gases
 *   DOI: 10.1029/98GL01908
 * - IPCC AR6 WGI 2021 - Chapter 4, SSP scenarios
 *   ISBN: 978-92-9169-158-6
 */

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

// Fator de conversão: 1 GtC de emissão ≈ 2.13 ppm de aumento atmosférico
// (baseado na massa molecular do CO2 e massa total da atmosfera)
const GTC_TO_PPM = 2.13;

// Sensibilidade climática de referência IPCC AR6: 3.0 K por duplicação de CO2
// (Equilibrium Climate Sensitivity - ECS mediano)
const DEFAULT_CLIMATE_SENSITIVITY = 3.0;

// Forçamento radiativo por duplicação de CO2 (W/m²) - Myhre 1998
const RF_DOUBLING = 3.7;

/**
 * Calcula a concentração final de CO2 atmosférico usando balanço de carbono.
 * delta_ppm = (emissions - land_sink - ocean_sink) * years / GTC_TO_PPM
 *
 * @param baseline_ppm - Concentração inicial de CO2 (ppm). Ex: 280 (pré-industrial), 420 (atual)
 * @param annual_emissions_GtC - Emissões anuais totais de carbono (GtC/ano)
 * @param land_sink_GtC - Absorção anual pelo sumidouro terrestre (GtC/ano)
 * @param ocean_sink_GtC - Absorção anual pelo sumidouro oceânico (GtC/ano)
 * @param years - Número de anos do período de simulação
 * @returns Concentração final de CO2 em ppm
 * @throws {TypeError} Se algum parâmetro não for número
 * @throws {RangeError} Se baseline < 0, years <= 0, ou sinks negativos
 */
export function computeCO2Concentration(
    baseline_ppm: number,
    annual_emissions_GtC: number,
    land_sink_GtC: number,
    ocean_sink_GtC: number,
    years: number,
): { final_ppm: number } {
    if (
        typeof baseline_ppm !== 'number' ||
        typeof annual_emissions_GtC !== 'number' ||
        typeof land_sink_GtC !== 'number' ||
        typeof ocean_sink_GtC !== 'number' ||
        typeof years !== 'number'
    ) {
        throw new TypeError('computeCO2Concentration: todos os parâmetros devem ser números');
    }
    if (baseline_ppm < 0) {
        throw new RangeError('computeCO2Concentration: baseline_ppm não pode ser negativo');
    }
    if (years <= 0) {
        throw new RangeError('computeCO2Concentration: years deve ser positivo');
    }
    if (land_sink_GtC < 0 || ocean_sink_GtC < 0) {
        throw new RangeError('computeCO2Concentration: sumidouros (sinks) não podem ser negativos');
    }

    // Fluxo líquido de carbono para a atmosfera (GtC/ano)
    const net_flux_GtC = annual_emissions_GtC - land_sink_GtC - ocean_sink_GtC;

    // Conversão de GtC para ppm e acumulação ao longo dos anos
    const delta_ppm = (net_flux_GtC * years) / GTC_TO_PPM;

    const final_ppm = baseline_ppm + delta_ppm;
    return { final_ppm };
}

/**
 * Calcula o forçamento radiativo do CO2 segundo a fórmula simplificada de Myhre (1998).
 * RF = 5.35 × ln(CO2 / CO2_baseline)
 *
 * @param CO2_ppm - Concentração atual de CO2 (ppm)
 * @param CO2_baseline_ppm - Concentração de referência de CO2 (ppm). Padrão: 280 ppm pré-industrial
 * @returns Forçamento radiativo em W/m²
 * @throws {TypeError} Se parâmetros não forem números
 * @throws {RangeError} Se CO2 <= 0 ou baseline <= 0
 */
export function computeRadiativeForcing(CO2_ppm: number, CO2_baseline_ppm: number): { RF_W_m2: number } {
    if (typeof CO2_ppm !== 'number' || typeof CO2_baseline_ppm !== 'number') {
        throw new TypeError('computeRadiativeForcing: parâmetros devem ser números');
    }
    if (CO2_ppm <= 0) {
        throw new RangeError('computeRadiativeForcing: CO2_ppm deve ser positivo');
    }
    if (CO2_baseline_ppm <= 0) {
        throw new RangeError('computeRadiativeForcing: CO2_baseline_ppm deve ser positivo');
    }

    // Coeficiente 5.35 W/m² conforme Myhre et al. 1998, eq. 1
    const RF_W_m2 = 5.35 * Math.log(CO2_ppm / CO2_baseline_ppm);
    return { RF_W_m2 };
}

/**
 * Calcula a resposta de temperatura a partir do forçamento radiativo.
 * delta_T = lambda × RF, onde lambda = ECS / RF_doubling
 *
 * @param RF_W_m2 - Forçamento radiativo (W/m²)
 * @param climate_sensitivity - Sensibilidade climática de equilíbrio (K por duplicação de CO2)
 * @returns Variação de temperatura em graus Celsius
 * @throws {TypeError} Se parâmetros não forem números
 * @throws {RangeError} Se climate_sensitivity <= 0
 */
export function computeTemperatureResponse(
    RF_W_m2: number,
    climate_sensitivity: number = DEFAULT_CLIMATE_SENSITIVITY,
): { delta_T_C: number } {
    if (typeof RF_W_m2 !== 'number' || typeof climate_sensitivity !== 'number') {
        throw new TypeError('computeTemperatureResponse: parâmetros devem ser números');
    }
    if (climate_sensitivity <= 0) {
        throw new RangeError('computeTemperatureResponse: climate_sensitivity deve ser positivo');
    }

    // Parâmetro de sensibilidade climática lambda = ECS / RF_doubling (K per W/m²)
    const lambda = climate_sensitivity / RF_DOUBLING;
    const delta_T_C = lambda * RF_W_m2;
    return { delta_T_C };
}

/**
 * Classifica o cenário de emissões anual segundo os SSPs do IPCC AR6.
 * SSP1-1.9 < 5 GtC/yr; SSP1-2.6 < 8; SSP2-4.5 < 12; SSP3-7.0 < 16; SSP5-8.5 >= 16
 *
 * @param annual_GtC - Emissões anuais de carbono (GtC/ano)
 * @returns Cenário SSP correspondente
 * @throws {TypeError} Se o parâmetro não for número
 * @throws {RangeError} Se annual_GtC < 0
 */
export function classifyCO2EmissionScenario(annual_GtC: number): { scenario: string } {
    if (typeof annual_GtC !== 'number') {
        throw new TypeError('classifyCO2EmissionScenario: annual_GtC deve ser número');
    }
    if (annual_GtC < 0) {
        throw new RangeError('classifyCO2EmissionScenario: annual_GtC não pode ser negativo');
    }

    let scenario: string;
    if (annual_GtC < 5) {
        scenario = 'SSP1-1.9';
    } else if (annual_GtC < 8) {
        scenario = 'SSP1-2.6';
    } else if (annual_GtC < 12) {
        scenario = 'SSP2-4.5';
    } else if (annual_GtC < 16) {
        scenario = 'SSP3-7.0';
    } else {
        scenario = 'SSP5-8.5';
    }

    return { scenario };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const atmosphericCO2ModelMeta: AnalyticsModuleMeta = {
    name: 'atmosphericCO2Model',
    description: 'atmosphericCO2Model',
    category: 'analytics',
    familyTags: ['atmosphere'],
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
