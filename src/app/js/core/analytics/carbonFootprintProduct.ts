// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// carbonFootprintProduct.js - Carbon Footprint for Products (Simplified LCA)
// Pegada de carbono de produtos: ACV simplificada, escopos 1/2/3 e intensidade de carbono.
// Refs: GHG Protocol (2015) Product Life Cycle Standard; ISO 14064-1:2018;
//       MCTI (2023) Fatores de Emissão SIN; IPCC (2006) AFOLU Guidelines Tier 1

'use strict';

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

/**
 * Emission factors for common fuels in kgCO2eq per unit (L or kg or m³).
 * Fatores de emissão de combustíveis comuns conforme IPCC/GHG Protocol.
 * @type {Object.<string, number>}
 */
const FUEL_EMISSION_FACTORS: Record<string, number> = {
    diesel: 2.68, // kgCO2eq/L
    gasoline: 2.31, // kgCO2eq/L
    lpg: 1.51, // kgCO2eq/L
    natural_gas_m3: 1.89, // kgCO2eq/m³
    coal_kg: 2.42, // kgCO2eq/kg
};

/**
 * Benchmark carbon intensity by product category in kgCO2/unit.
 * Intensidade de carbono referencial por categoria de produto.
 * @type {Object.<string, number>}
 */
const PRODUCT_BENCHMARKS: Record<string, number> = {
    steel_t: 1800,
    cement_t: 900,
    plastic_t: 2500,
    electricity_MWh: 50,
    food_kg: 5,
};

/**
 * Compute Scope 1 direct emissions from fuel combustion.
 * Calcula emissões diretas Escopo 1 pela queima de combustíveis.
 *
 * @param {Array<{type: string, volume_L: number}>} fuel_volumes - Array of fuel records.
 * @returns {{ total_tCO2eq: number, by_fuel: Object.<string, number> }}
 * @throws {TypeError} If fuel_volumes is not an array.
 * @throws {RangeError} If any volume is negative or fuel type is unknown.
 */
export function computeScope1Emissions(
    fuel_volumes: Array<{ type: string; volume_L: number }>,
): { total_tCO2eq: number; by_fuel: Record<string, number> } {
    if (!Array.isArray(fuel_volumes)) throw new TypeError('fuel_volumes must be an array');
    /** @type {Record<string, number>} */
    const by_fuel: Record<string, number> = {};
    let total_kgCO2eq = 0;
    for (const entry of fuel_volumes) {
        if (typeof entry.type !== 'string') throw new TypeError('Each fuel entry must have a string type');
        if (typeof entry.volume_L !== 'number' || entry.volume_L < 0) {
            throw new RangeError(`Volume must be a non-negative number; got ${entry.volume_L} for ${entry.type}`);
        }
        const ef = FUEL_EMISSION_FACTORS[entry.type];
        if (ef === undefined) throw new RangeError(`Unknown fuel type: ${entry.type}`);
        const kg = entry.volume_L * ef;
        by_fuel[entry.type] = (by_fuel[entry.type] || 0) + kg;
        total_kgCO2eq += kg;
    }
    return { total_tCO2eq: total_kgCO2eq / 1000, by_fuel };
}

/**
 * Compute Scope 2 indirect emissions from purchased electricity.
 * Calcula emissões indiretas Escopo 2 do consumo de eletricidade.
 *
 * @param {number} electricity_kWh - Electricity consumed in kWh.
 * @param {number} grid_factor_kgCO2_kWh - Grid emission factor in kgCO2/kWh (BR SIN 2023 ~0.1).
 * @returns {{ tCO2eq: number }}
 * @throws {RangeError} If inputs are negative.
 */
export function computeScope2Emissions(
    electricity_kWh: number,
    grid_factor_kgCO2_kWh: number,
): { tCO2eq: number } {
    if (typeof electricity_kWh !== 'number' || electricity_kWh < 0) {
        throw new RangeError(`electricity_kWh must be non-negative; got ${electricity_kWh}`);
    }
    if (typeof grid_factor_kgCO2_kWh !== 'number' || grid_factor_kgCO2_kWh < 0) {
        throw new RangeError(`grid_factor_kgCO2_kWh must be non-negative; got ${grid_factor_kgCO2_kWh}`);
    }
    const tCO2eq = (electricity_kWh * grid_factor_kgCO2_kWh) / 1000;
    return { tCO2eq };
}

/**
 * Compute Scope 3 indirect emissions from upstream/downstream activities.
 * Calcula emissões indiretas Escopo 3 (cadeia de valor).
 *
 * @param {number} purchased_goods_kg - Mass of purchased goods in kg.
 * @param {number} transport_tkm - Freight transport in tonne-km.
 * @param {number} waste_kg - Waste generated in kg.
 * @param {number} employee_commute_km - Total employee commuting distance in km.
 * @returns {{ tCO2eq: number, breakdown: Object.<string, number> }}
 * @throws {RangeError} If any input is negative.
 */
export function computeScope3Emissions(
    purchased_goods_kg: number,
    transport_tkm: number,
    waste_kg: number,
    employee_commute_km: number,
): { tCO2eq: number; breakdown: Record<string, number> } {
    const args = { purchased_goods_kg, transport_tkm, waste_kg, employee_commute_km };
    for (const [k, v] of Object.entries(args)) {
        if (typeof v !== 'number' || v < 0) throw new RangeError(`${k} must be a non-negative number; got ${v}`);
    }
    // Fatores médios conforme GHG Protocol Scope 3 Technical Guidance
    const goods_kg = purchased_goods_kg * 2.5; // kgCO2/kg médio
    const transp_kg = transport_tkm * 0.062; // kgCO2/tkm rodoviário
    const waste_kg_ = waste_kg * 0.5; // kgCO2/kg resíduo
    const commute_kg = employee_commute_km * 0.14; // kgCO2/km passageiro
    const total_kg = goods_kg + transp_kg + waste_kg_ + commute_kg;
    return {
        tCO2eq: total_kg / 1000,
        breakdown: {
            purchased_goods_tCO2eq: goods_kg / 1000,
            transport_tCO2eq: transp_kg / 1000,
            waste_tCO2eq: waste_kg_ / 1000,
            commute_tCO2eq: commute_kg / 1000,
        },
    };
}

/**
 * Classify the carbon intensity of a product against sector benchmarks.
 * Classifica a intensidade de carbono do produto em relação ao benchmark setorial.
 *
 * @param {number} total_tCO2eq - Total emissions in tCO2eq.
 * @param {number} production_units - Number of production units.
 * @param {string} product_category - Category key (e.g., 'steel_t', 'cement_t').
 * @returns {{ intensity_kgCO2_unit: number, benchmark_comparison: string, label: string }}
 * @throws {RangeError} If production_units <= 0 or total_tCO2eq < 0.
 * @throws {TypeError} If product_category is unknown.
 */
export function classifyProductCarbonIntensity(
    total_tCO2eq: number,
    production_units: number,
    product_category: string,
): { intensity_kgCO2_unit: number; benchmark_comparison: string; label: string } {
    if (typeof total_tCO2eq !== 'number' || total_tCO2eq < 0) {
        throw new RangeError(`total_tCO2eq must be non-negative; got ${total_tCO2eq}`);
    }
    if (typeof production_units !== 'number' || production_units <= 0) {
        throw new RangeError(`production_units must be positive; got ${production_units}`);
    }
    const benchmark = PRODUCT_BENCHMARKS[product_category];
    if (benchmark === undefined) throw new TypeError(`Unknown product_category: ${product_category}`);

    const intensity_kgCO2_unit = (total_tCO2eq * 1000) / production_units;
    const ratio = intensity_kgCO2_unit / benchmark;

    let benchmark_comparison, label;
    if (ratio <= 0.8) {
        benchmark_comparison = 'best_in_class';
        label = 'Best in class (<80% benchmark)';
    } else if (ratio <= 1.0) {
        benchmark_comparison = 'average';
        label = 'Average (80–100% benchmark)';
    } else if (ratio <= 1.3) {
        benchmark_comparison = 'above_average';
        label = 'Above average (100–130% benchmark)';
    } else {
        benchmark_comparison = 'poor';
        label = 'Poor (>130% benchmark)';
    }
    return { intensity_kgCO2_unit, benchmark_comparison, label };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const carbonFootprintProductMeta: AnalyticsModuleMeta = {
    name: 'carbonFootprintProduct',
    description: 'carbonFootprintProduct',
    category: 'analytics',
    familyTags: ['climate', 'footprint'],
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
