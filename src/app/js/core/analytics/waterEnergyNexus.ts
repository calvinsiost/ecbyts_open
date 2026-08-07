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
 * Water-Energy Nexus analytics module.
 * Calcula a interdependência entre consumo de água e produção/tratamento de energia.
 *
 * Referências acadêmicas:
 * - EPRI (2013). "Water Use for Electricity Generation". DOI:10.2172/1072600
 * - Meldrum et al. (2013). "Life cycle water use for electricity generation".
 *   Environ. Res. Lett. 8(1). DOI:10.1088/1748-9326/8/1/015031
 */

/**
 * Consumo energético por m³ tratado (kWh/m³) por tipo de tratamento
 * @type {Record<string, number>}
 */
const TREATMENT_ENERGY_FACTORS = {
    conventional: 0.25,
    advanced: 0.5,
    desalination: 3.5,
    ultrafiltration: 0.15,
};

/**
 * Pegada hídrica por MWh gerado (m³/MWh) por tipo de combustível
 * @type {Record<string, number>}
 */
const FUEL_WATER_FACTORS = {
    coal_once_through: 95,
    nuclear_tower: 2.8,
    solar_pv: 0.01,
    wind: 0.001,
};

/**
 * Calcula o consumo energético necessário para tratar um volume de água.
 * Energy = volume_m3 × fator_kWh_por_m3
 *
 * @param {number} volume_m3 - Volume de água a tratar (m³, > 0)
 * @param {string} treatment_type - Tipo de tratamento: 'conventional'|'advanced'|'desalination'|'ultrafiltration'
 * @returns {{ energy_kWh: number }}
 */
export function computeEnergyForWaterTreatment(volume_m3: any, treatment_type: any) {
    if (typeof volume_m3 !== 'number' || typeof treatment_type !== 'string') {
        throw new TypeError('volume_m3 deve ser número e treatment_type deve ser string');
    }
    if (!Number.isFinite(volume_m3) || volume_m3 <= 0) {
        throw new RangeError('volume_m3 deve ser um número finito positivo');
    }
    if (!(treatment_type in TREATMENT_ENERGY_FACTORS)) {
        throw new RangeError(
            `treatment_type inválido: "${treatment_type}". Use: ${Object.keys(TREATMENT_ENERGY_FACTORS).join(', ')}`,
        );
    }
const energy_kWh = volume_m3 * (TREATMENT_ENERGY_FACTORS as any)[treatment_type];
    return { energy_kWh };
}

/**
 * Calcula a pegada hídrica associada à produção de energia.
 * water_m3 = energy_MWh × fator_m3_por_MWh
 *
 * @param {number} energy_MWh - Energia produzida (MWh, > 0)
 * @param {string} fuel_type - Tipo de combustível/tecnologia: 'coal_once_through'|'nuclear_tower'|'solar_pv'|'wind'
 * @returns {{ water_m3: number }}
 */
export function computeWaterForEnergyProduction(energy_MWh: any, fuel_type: any) {
    if (typeof energy_MWh !== 'number' || typeof fuel_type !== 'string') {
        throw new TypeError('energy_MWh deve ser número e fuel_type deve ser string');
    }
    if (!Number.isFinite(energy_MWh) || energy_MWh <= 0) {
        throw new RangeError('energy_MWh deve ser um número finito positivo');
    }
    if (!(fuel_type in FUEL_WATER_FACTORS)) {
        throw new RangeError(`fuel_type inválido: "${fuel_type}". Use: ${Object.keys(FUEL_WATER_FACTORS).join(', ')}`);
    }
const water_m3 = energy_MWh * (FUEL_WATER_FACTORS as any)[fuel_type];
    return { water_m3 };
}

/**
 * Calcula o Índice de Estresse do Nexo Água-Energia (NSI).
 * NSI = (WSI × 0.5) + (EI_normalized × 0.5)
 * Onde EI_normalized é normalizado para [0,1] assumindo que energy_intensity está em kWh/m³
 * com escala máxima de referência de 4.0 kWh/m³ (dessalinização como teto).
 *
 * @param {number} water_scarcity_index - Índice de escassez hídrica (0-1)
 * @param {number} energy_intensity - Intensidade energética do tratamento (kWh/m³, ≥ 0)
 * @returns {{ NSI: number }}
 */
export function computeNexusStressIndex(water_scarcity_index: any, energy_intensity: any) {
    if (typeof water_scarcity_index !== 'number' || typeof energy_intensity !== 'number') {
        throw new TypeError('Ambos os parâmetros devem ser números');
    }
    if (!Number.isFinite(water_scarcity_index) || water_scarcity_index < 0 || water_scarcity_index > 1) {
        throw new RangeError('water_scarcity_index deve estar entre 0 e 1');
    }
    if (!Number.isFinite(energy_intensity) || energy_intensity < 0) {
        throw new RangeError('energy_intensity deve ser um número finito não-negativo');
    }
    // Normaliza energia com teto de 4.0 kWh/m³ (valor de referência: dessalinização)
    const EI_MAX = 4.0;
    const EI_normalized = Math.min(energy_intensity / EI_MAX, 1);
    const NSI = water_scarcity_index * 0.5 + EI_normalized * 0.5;
    return { NSI: Math.min(NSI, 1) };
}

/**
 * Classifica o risco do nexo água-energia com base no NSI.
 *
 * @param {number} NSI - Índice de Estresse do Nexo (0-1)
 * @returns {{ risk: 'low'|'moderate'|'high'|'critical' }}
 */
export function classifyNexusRisk(NSI: any) {
    if (typeof NSI !== 'number' || !Number.isFinite(NSI)) {
        throw new TypeError('NSI deve ser um número finito');
    }
    if (NSI < 0 || NSI > 1) {
        throw new RangeError('NSI deve estar entre 0 e 1');
    }
    /** @type {'low'|'moderate'|'high'|'critical'} */
    let risk;
    if (NSI < 0.25) risk = 'low';
    else if (NSI < 0.5) risk = 'moderate';
    else if (NSI < 0.75) risk = 'high';
    else risk = 'critical';
    return { risk };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const waterEnergyNexusMeta = {
    name: 'waterEnergyNexus',
    description: 'waterEnergyNexus',
    category: 'analytics',
    familyTags: ['water', 'energy'],
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
