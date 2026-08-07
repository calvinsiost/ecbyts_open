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
 * Industrial Air Emission Inventory - Inventário de Emissões Atmosféricas Industriais
 *
 * References / Referências:
 *  - USEPA AP-42 (2023). Compilation of Air Pollutant Emission Factors, Vol. I.
 *    https://www.epa.gov/air-emissions-factors-and-quantification/ap-42-compilation-air-emission-factors
 *  - IPCC (2006). Guidelines for National Greenhouse Gas Inventories, Vol. 2 Energy.
 *    https://www.ipcc-nggip.iges.or.jp/public/2006gl/
 *  - CONAMA Resolucao 382/2006 - Limites de emissao para fontes fixas.
 *  - CONAMA Resolucao 436/2011 - Emissoes de fontes fixas existentes.
 *
 * Zero DOM/IDB/Three.js/fetch dependencies.
 * Comentários: headers em inglês, explicações em português.
 *
 * @module industrialAirEmissionInventory
 */

// Supported pollutants / Poluentes suportados
export const POLLUTANTS = ['SO2', 'NOx', 'PM', 'VOC', 'CO', 'CO2'];

// Default CONAMA 382/2006 emission limits (mg/Nm³) for general combustion sources
// Limites de emissão padrão CONAMA 382/2006 para fontes de combustão geral
/** @type {Record<string, number|null>} */
const CONAMA_LIMITS_MG_NM3 = {
    SO2: 500,
    NOx: 350,
    PM: 100,
    VOC: 150,
    CO: 300,
    CO2: null, // GHG — sem limite de emissão direta CONAMA
};

// AP-42 emission factors (kg/tonne of fuel burned) for natural gas combustion (AP-42 Ch.1.4)
// Fatores de emissão AP-42 para combustão de gás natural (seção 1.4)
/** @type {Record<string, number>} */
const AP42_NATURAL_GAS_KG_PER_TONNE = {
    SO2: 0.6,
    NOx: 2.1,
    PM: 0.3,
    VOC: 0.05,
    CO: 0.6,
    CO2: 2750, // IPCC 2006: factor for natural gas ~55.82 kg CO2/GJ × 49 MJ/kg ≈ 2735 kg/t
};

// AP-42 emission factors (kg/tonne) for diesel oil combustion (AP-42 Ch.3.3)
// Fatores de emissão AP-42 para combustão de óleo diesel
/** @type {Record<string, number>} */
const AP42_DIESEL_KG_PER_TONNE = {
    SO2: 4.0,
    NOx: 6.5,
    PM: 0.8,
    VOC: 0.2,
    CO: 2.1,
    CO2: 3170,
};

// AP-42 emission factors (kg/tonne) for coal combustion (AP-42 Ch.1.1)
// Fatores de emissão AP-42 para combustão de carvão mineral
/** @type {Record<string, number>} */
const AP42_COAL_KG_PER_TONNE = {
    SO2: 17.5,
    NOx: 5.5,
    PM: 10.0,
    VOC: 0.2,
    CO: 0.3,
    CO2: 2530,
};

// Built-in fuel registry
/** @type {Record<string, Record<string, number>>} */
const FUEL_EMISSION_FACTORS = {
    natural_gas: AP42_NATURAL_GAS_KG_PER_TONNE,
    diesel: AP42_DIESEL_KG_PER_TONNE,
    coal: AP42_COAL_KG_PER_TONNE,
};

// Control equipment efficiency (fraction 0–1) for each pollutant
// Eficiência dos equipamentos de controle por poluente (fração 0–1)
/** @type {Record<string, Record<string, number>>} */
const CONTROL_EFFICIENCY = {
    fabric_filter: { PM: 0.99, SO2: 0.0, NOx: 0.0, VOC: 0.1, CO: 0.0, CO2: 0.0 },
    esp: { PM: 0.97, SO2: 0.0, NOx: 0.0, VOC: 0.05, CO: 0.0, CO2: 0.0 }, // Electrostatic precipitator
    wet_scrubber: { PM: 0.85, SO2: 0.75, NOx: 0.15, VOC: 0.3, CO: 0.0, CO2: 0.0 },
    selective_catalytic_reduction: { PM: 0.0, SO2: 0.0, NOx: 0.9, VOC: 0.0, CO: 0.0, CO2: 0.0 },
    thermal_oxidizer: { PM: 0.0, SO2: 0.0, NOx: 0.0, VOC: 0.98, CO: 0.95, CO2: 0.0 },
    none: { PM: 0.0, SO2: 0.0, NOx: 0.0, VOC: 0.0, CO: 0.0, CO2: 0.0 },
};

/**
 * Returns a copy of the built-in AP-42 emission factors for a fuel type.
 * Retorna cópia dos fatores de emissão AP-42 para o tipo de combustível especificado.
 *
 * @param {string} fuelType - Fuel type identifier ('natural_gas' | 'diesel' | 'coal').
 * @returns {Record<string, number>} Emission factors (kg/tonne of fuel).
 * @throws {TypeError} If fuelType is not recognized.
 */
export function getEmissionFactors(fuelType: any) {
    const factors = FUEL_EMISSION_FACTORS[(fuelType as keyof typeof FUEL_EMISSION_FACTORS)];
    if (!factors) {
        throw new TypeError(
            `Unknown fuel type "${fuelType}". Available: ${Object.keys(FUEL_EMISSION_FACTORS).join(', ')}`,
        );
    }
    return { ...factors };
}

/**
 * Calculates gross emission (before control equipment) for each pollutant.
 * Calcula emissão bruta (antes do controle) para cada poluente dado consumo de combustível.
 *
 * @param {string} fuelType - Fuel type identifier or 'custom'.
 * @param {number} fuelConsumptionTonnes - Fuel consumed (tonnes/period).
 * @param {Object} [customFactors] - Required if fuelType is 'custom'. Map pollutant→kg/tonne.
 * @returns {Object.<string, number>} Gross emissions (kg/period) per pollutant.
 * @throws {RangeError} If fuelConsumptionTonnes is not positive.
 * @throws {TypeError} If fuelType is unknown or custom without customFactors.
 */
export function grossEmissions(fuelType: any, fuelConsumptionTonnes: any, customFactors: any) {
    if (typeof fuelConsumptionTonnes !== 'number' || fuelConsumptionTonnes <= 0) {
        throw new RangeError(`fuelConsumptionTonnes must be a positive number, got: ${fuelConsumptionTonnes}`);
    }
    /** @type {Record<string, number>} */
    let factors;
    if (fuelType === 'custom') {
        if (!customFactors || typeof customFactors !== 'object') {
            throw new TypeError('customFactors must be provided when fuelType is "custom"');
        }
        factors = /** @type {Record<string, number>} */ (customFactors);
    } else {
        factors = getEmissionFactors(fuelType);
    }
    /** @type {Record<string, number>} */
    const result = {};
    for (const pollutant of POLLUTANTS) {
        const ef = factors[pollutant];
        (result as any)[(pollutant as keyof typeof result)] = typeof ef === 'number' && ef >= 0 ? ef * fuelConsumptionTonnes : 0;
    }
    return result;
}

/**
 * Applies control equipment to gross emissions, returning net (stack) emissions.
 * Aplica eficiência do equipamento de controle para obter emissão líquida (chaminé).
 *
 * @param {Object.<string, number>} gross - Gross emissions per pollutant (kg/period).
 * @param {string} controlEquipment - Control equipment identifier.
 * @param {Object} [customEfficiency] - Required if controlEquipment is 'custom'. Map pollutant→fraction (0–1).
 * @returns {Object.<string, number>} Net emissions (kg/period) after control.
 * @throws {TypeError} If controlEquipment is unknown or custom without customEfficiency.
 */
export function applyControlEquipment(gross: any, controlEquipment: any, customEfficiency: any) {
    if (!gross || typeof gross !== 'object') {
        throw new TypeError('gross must be an object mapping pollutant → kg/period');
    }
    /** @type {Record<string, number>} */
    let eff;
    if (controlEquipment === 'custom') {
        if (!customEfficiency || typeof customEfficiency !== 'object') {
            throw new TypeError('customEfficiency must be provided when controlEquipment is "custom"');
        }
        eff = /** @type {Record<string, number>} */ (customEfficiency);
    } else {
        eff = CONTROL_EFFICIENCY[(controlEquipment as keyof typeof CONTROL_EFFICIENCY)];
        if (!eff) {
            throw new TypeError(
                `Unknown control equipment "${controlEquipment}". Available: ${Object.keys(CONTROL_EFFICIENCY).join(', ')}`,
            );
        }
    }
    /** @type {Record<string, number>} */
    const net = {};
    /** @type {Record<string, number>} */
    const grossRec = /** @type {Record<string, number>} */ (gross);
    for (const pollutant of POLLUTANTS) {
        const g = grossRec[pollutant] ?? 0;
        const e = eff[pollutant] ?? 0;
        // Emissão líquida = bruta × (1 − eficiência de remoção)
        (net as any)[(pollutant as keyof typeof net)] = g * (1 - e);
    }
    return net;
}

/**
 * Checks net emission concentration against CONAMA 382/2006 limits.
 * Verifica conformidade das emissões líquidas com os limites da CONAMA 382/2006.
 *
 * @param {Object.<string, number>} netEmissionsKg - Net stack emissions (kg/period).
 * @param {number} stackFlowNm3 - Stack flow rate (Nm³/period) for concentration calculation.
 * @param {Object} [customLimits] - Optional custom limits (mg/Nm³).
 * @returns {Object.<string, {concentration_mg_nm3: number, limit_mg_nm3: number|null, compliant: boolean|null}>}
 * @throws {RangeError} If stackFlowNm3 is not positive.
 */
export function checkConformaLimits(netEmissionsKg: any, stackFlowNm3: any, customLimits: any) {
    if (typeof stackFlowNm3 !== 'number' || stackFlowNm3 <= 0) {
        throw new RangeError(`stackFlowNm3 must be a positive number, got: ${stackFlowNm3}`);
    }
    /** @type {Record<string, number|null>} */
    const limits = /** @type {Record<string, number|null>} */ (customLimits || CONAMA_LIMITS_MG_NM3);
    /** @type {Record<string, {concentration_mg_nm3: number, limit_mg_nm3: number|null, compliant: boolean|null}>} */
    const result = {};
    for (const pollutant of POLLUTANTS) {
        const kg = netEmissionsKg[pollutant] ?? 0;
        // Converte kg → mg: kg × 1e6 mg/kg; divide pelo volume em Nm³
        const conc = (kg * 1e6) / stackFlowNm3;
        const limit = limits[pollutant] ?? null;
        (result as any)[(pollutant as keyof typeof result)] = {
            concentration_mg_nm3: conc,
            limit_mg_nm3: limit,
            compliant: limit !== null ? conc <= limit : null,
        };
    }
    return result;
}

/**
 * Full emission inventory for one source: gross → control → conformity check.
 * Inventário completo para uma fonte: bruto → controle → verificação de conformidade.
 *
 * @param {Object} params
 * @param {string} params.fuelType - Fuel type identifier.
 * @param {number} params.fuelConsumptionTonnes - Fuel consumed (tonnes/period).
 * @param {string} params.controlEquipment - Control equipment identifier.
 * @param {number} params.stackFlowNm3 - Stack flow rate (Nm³/period).
 * @param {Object} [params.customFactors] - Custom emission factors if fuelType='custom'.
 * @param {Object} [params.customEfficiency] - Custom efficiencies if controlEquipment='custom'.
 * @param {Object} [params.customLimits] - Custom CONAMA limits (mg/Nm³).
 * @returns {{gross: Object, net: Object, compliance: Object}} Full inventory result.
 */
export function emissionInventory(params: any) {
    const {
        fuelType,
        fuelConsumptionTonnes,
        controlEquipment,
        stackFlowNm3,
        customFactors,
        customEfficiency,
        customLimits,
    } = params;
    const gross = grossEmissions(fuelType, fuelConsumptionTonnes, customFactors);
    const net = applyControlEquipment(gross, controlEquipment, customEfficiency);
    const compliance = checkConformaLimits(net, stackFlowNm3, customLimits);
    return { gross, net, compliance };
}

/**
 * Returns available fuel types.
 * Retorna lista de tipos de combustível disponíveis.
 *
 * @returns {string[]} Fuel type identifiers.
 */
export function getAvailableFuelTypes() {
    return Object.keys(FUEL_EMISSION_FACTORS);
}

/**
 * Returns available control equipment types.
 * Retorna lista de equipamentos de controle disponíveis.
 *
 * @returns {string[]} Control equipment identifiers.
 */
export function getAvailableControlEquipment() {
    return Object.keys(CONTROL_EFFICIENCY);
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialAirEmissionInventoryMeta = {
    name: 'industrialAirEmissionInventory',
    description: 'industrialAirEmissionInventory',
    category: 'analytics',
    familyTags: ['air', 'industrial'],
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
