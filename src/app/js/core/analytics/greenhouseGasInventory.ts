// @ts-check
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
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Greenhouse Gas Inventory
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Greenhouse Gas Inventory - GHG Emissions Accounting
 *
 * Módulo puro implementando inventário de gases de efeito estufa (GEE) conforme
 * GHG Protocol Corporate Standard e diretrizes IPCC 2006. Cobre Escopos 1, 2 e 3.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - IPCC (2006). 2006 IPCC Guidelines for National Greenhouse Gas Inventories.
 *     Volume 2: Energy. Geneva: IPCC. ISBN: 92-9169-320-0.
 *     (Fatores de emissão por combustível - Tabelas 2.2 e 2.3)
 *   - WRI/WBCSD (2004). The Greenhouse Gas Protocol: A Corporate Accounting and
 *     Reporting Standard. Washington DC: World Resources Institute.
 *     ISBN: 1-56973-568-9. (Definição de Escopos 1, 2 e 3)
 *   - NTMCalc (2023). NTM Business Travel Carbon Calculator Methodology.
 *     Version 4.0. Stockholm: NTM - Network for Transport Measures.
 *     (Fatores de emissão por modo de transporte de carga)
 */

'use strict';

// Fatores de emissão de CO2 por unidade de combustível (IPCC 2006 Tab.2.2)
const SCOPE1_EF = {
    diesel_L: 2.68,
    gasoline_L: 2.31,
    lpg_kg: 1.61,
    naturalGas_m3: 1.96,
};

// Fatores de emissão por modo de transporte de carga (NTMCalc v4.0, kg CO2/t·km)
const FREIGHT_EF = {
    road_tkm: 0.062,
    rail_tkm: 0.028,
    air_tkm: 0.602,
};

/**
 * Compute Scope 1 (direct) GHG emissions from fuel combustion.
 * Calcula emissões diretas de GEE pela queima de combustíveis (Escopo 1).
 *
 * @param {{ diesel_L?: number, gasoline_L?: number, lpg_kg?: number, naturalGas_m3?: number }} fuelConsumption
 * @returns {{ scope1_tCO2eq: number, breakdown: Record<string, number> }}
 * @throws {TypeError} Se fuelConsumption não for um objeto
 * @throws {RangeError} Se qualquer valor de consumo for negativo
 */
export function computeScope1Emissions(fuelConsumption: any) {
    if (!fuelConsumption || typeof fuelConsumption !== 'object') {
        throw new TypeError('fuelConsumption must be a plain object');
    }
    /** @type {Record<string, number>} */
    const breakdown = {};
    let totalKgCO2 = 0;
    const fc = /** @type {Record<string, number>} */ (fuelConsumption);
    for (const [key, ef] of Object.entries(SCOPE1_EF)) {
        const consumed = fc[key] ?? 0;
        if (consumed < 0) throw new RangeError(`fuelConsumption.${key} must be >= 0`);
        const kg = consumed * ef;
(breakdown as Record<string, number>)[key] = +(kg / 1000).toFixed(6);
        totalKgCO2 += kg;
    }
    return { scope1_tCO2eq: +(totalKgCO2 / 1000).toFixed(6), breakdown };
}

/**
 * Compute Scope 2 (indirect) GHG emissions from purchased electricity.
 * Calcula emissões indiretas pelo consumo de energia elétrica (Escopo 2).
 *
 * @param {number} electricityConsumption_kWh
 * @param {number} gridEmissionFactor_kgCO2_kWh
 * @returns {{ scope2_tCO2eq: number }}
 * @throws {RangeError} Se consumo ou fator forem negativos
 */
export function computeScope2Emissions(electricityConsumption_kWh: any, gridEmissionFactor_kgCO2_kWh: any) {
    if (electricityConsumption_kWh < 0) throw new RangeError('electricityConsumption_kWh must be >= 0');
    if (gridEmissionFactor_kgCO2_kWh < 0) throw new RangeError('gridEmissionFactor_kgCO2_kWh must be >= 0');
    const scope2_tCO2eq = +((electricityConsumption_kWh * gridEmissionFactor_kgCO2_kWh) / 1000).toFixed(6);
    return { scope2_tCO2eq };
}

/**
 * Compute Scope 3 GHG emissions from freight transport.
 * Calcula emissões de Escopo 3 pelo transporte de carga (cadeia de valor).
 *
 * @param {{ road_tkm?: number, rail_tkm?: number, air_tkm?: number }} freight
 * @returns {{ scope3_tCO2eq: number, breakdown: Record<string, number> }}
 * @throws {TypeError} Se freight não for um objeto
 * @throws {RangeError} Se qualquer valor de tkm for negativo
 */
export function computeScope3Emissions(freight: any) {
    if (!freight || typeof freight !== 'object') {
        throw new TypeError('freight must be a plain object');
    }
    /** @type {Record<string, number>} */
    const breakdown = {};
    let totalKgCO2 = 0;
    const fr = /** @type {Record<string, number>} */ (freight);
    for (const [key, ef] of Object.entries(FREIGHT_EF)) {
        const tkm = fr[key] ?? 0;
        if (tkm < 0) throw new RangeError(`freight.${key} must be >= 0`);
        const kg = tkm * ef;
(breakdown as any)[key] = +(kg / 1000).toFixed(6);
        totalKgCO2 += kg;
    }
    return { scope3_tCO2eq: +(totalKgCO2 / 1000).toFixed(6), breakdown };
}

/**
 * Compute carbon intensity and benchmark relative to sector average.
 * Calcula intensidade de carbono e classifica em relação a benchmark setorial.
 *
 * @param {number} totalEmissions_tCO2eq - Total de emissões GEE (t CO2eq)
 * @param {number} productionUnit        - Unidade de produção (> 0)
 * @returns {{ intensity: number, benchmark: 'above_average'|'average'|'below_average' }}
 * @throws {RangeError} Se totalEmissions < 0 ou productionUnit <= 0
 */
export function computeGHGIntensity(totalEmissions_tCO2eq: any, productionUnit: any) {
    if (totalEmissions_tCO2eq < 0) throw new RangeError('totalEmissions_tCO2eq must be >= 0');
    if (productionUnit <= 0) throw new RangeError('productionUnit must be > 0');
    const intensity = totalEmissions_tCO2eq / productionUnit;
    /** @type {'above_average'|'average'|'below_average'} */
    let benchmark;
    if (intensity < 0.5) benchmark = 'below_average';
    else if (intensity < 2.0) benchmark = 'average';
    else benchmark = 'above_average';
    return { intensity: +intensity.toFixed(6), benchmark };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const greenhouseGasInventoryMeta = {
    name: 'greenhouseGasInventory',
    description: 'Greenhouse Gas Inventory',
    category: 'analytics',
    familyTags: ['climate'],
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
