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
 * Industrial Solvent Emission Model
 *
 * Emissões de solventes industriais para a atmosfera - EPA AP-42 Ch.4 (Evaporation Loss),
 * IPCC 2006 Guidelines Vol.3 Ch.3, e equação de Mackay & Matsugu (1973).
 *
 * Aplicações: estimativa de emissões fugitivas em operações de pintura, limpeza,
 * extração por solvente, formulação de produtos e uso de adesivos industriais.
 *
 * References:
 * - Mackay, D. & Matsugu, R.S. (1973). Evaporation rates of liquid hydrocarbon spills
 *   on land and water. Can. J. Chem. Eng. 51(4):434-439. DOI:10.1002/cjce.5450510407
 * - US EPA (2001). AP-42, Compilation of Air Pollutant Emission Factors, Ch.4.2
 *   Solvent Evaporation. Research Triangle Park, NC.
 * - IPCC (2006). 2006 IPCC Guidelines for National Greenhouse Gas Inventories,
 *   Vol.3 Industrial Processes and Product Use, Ch.3. ISBN 92-9169-320-0.
 * - ACGIH (2024). TLVs and BEIs: Threshold Limit Values for Chemical Substances
 *   and Physical Agents. American Conference of Governmental Industrial Hygienists.
 *
 * @module mineExplosiveStorageSafety
 */

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

/** Constante dos gases universais (J/(mol·K)) */
const R = 8.314;

/**
 * Calcula a taxa de evaporação de um solvente derramado ou em tanque aberto.
 * Equação de Mackay & Matsugu (1973), adaptada para superfície de área conhecida:
 * E = 0.0292 × U^0.78 × MW × vp / (R × T) × A
 *
 * onde U = velocidade do vento, vp = pressão de vapor, T = temperatura absoluta.
 *
 * @param {number} vaporPressure_kPa - Pressão de vapor do solvente (kPa), > 0
 * @param {number} MW               - Massa molar do solvente (g/mol), > 0
 * @param {number} area_m2          - Área da superfície exposta (m²), > 0
 * @param {number} T_K              - Temperatura absoluta (K), > 0
 * @param {number} windSpeed_ms     - Velocidade do vento (m/s), ≥ 0
 * @returns {number} Taxa de evaporação (g/s)
 * @throws {RangeError} Se parâmetros forem inválidos
 */
export function calcEvaporationRate(
    vaporPressure_kPa: number,
    MW: number,
    area_m2: number,
    T_K: number,
    windSpeed_ms: number,
): number {
    if (vaporPressure_kPa <= 0) throw new RangeError('vaporPressure_kPa must be > 0');
    if (MW <= 0) throw new RangeError('MW must be > 0');
    if (area_m2 <= 0) throw new RangeError('area_m2 must be > 0');
    if (T_K <= 0) throw new RangeError('T_K must be > 0');
    if (windSpeed_ms < 0) throw new RangeError('windSpeed_ms must be >= 0');

    // Coeficiente de transferência de massa (m/s) - Mackay & Matsugu (1973) eq.3
    // k_m = 0.0292 × U^0.78 / (M^0.11) - simplificado para U mínimo de 0.1 m/s
    const U_eff = Math.max(windSpeed_ms, 0.1);
    const k_m = 0.0292 * Math.pow(U_eff, 0.78) * Math.pow(MW, -0.11);

    // Concentração de vapor na interface líquido-ar (mol/m³) via lei dos gases ideais
    // c_sat = vp / (R × T) com vp em Pa (×1000)
    const c_sat_mol_m3 = (vaporPressure_kPa * 1000) / (R * T_K);

    // Fluxo mássico: E (g/s) = k_m (m/s) × c_sat (mol/m³) × MW (g/mol) × A (m²)
    return k_m * c_sat_mol_m3 * MW * area_m2;
}

/**
 * Calcula a emissão anual de solventes de um processo industrial.
 * Método IPCC 2006 Vol.3 Ch.3 Tier 2 - balanço de massa:
 * E_anual = consumo × (1 - retentionFactor) × (1 - recyclingRate)
 *
 * @param {number} consumptionRate_kg_yr - Consumo de solvente (kg/ano), > 0
 * @param {number} retentionFactor       - Fração retida no produto final (0–1), ex: 0.05
 * @param {number} recyclingRate         - Fração recuperada/reciclada (0–1), ex: 0.30
 * @returns {number} Emissão anual de VOC (kg/ano)
 * @throws {RangeError} Se parâmetros estiverem fora dos limites
 */
export function calcAnnualSolventEmission(
    consumptionRate_kg_yr: number,
    retentionFactor: number,
    recyclingRate: number,
): number {
    if (consumptionRate_kg_yr <= 0) throw new RangeError('consumptionRate_kg_yr must be > 0');
    if (retentionFactor < 0 || retentionFactor > 1) {
        throw new RangeError('retentionFactor must be in [0, 1]');
    }
    if (recyclingRate < 0 || recyclingRate > 1) {
        throw new RangeError('recyclingRate must be in [0, 1]');
    }
    if (retentionFactor + recyclingRate > 1) {
        throw new RangeError('retentionFactor + recyclingRate cannot exceed 1');
    }

    return consumptionRate_kg_yr * (1 - retentionFactor) * (1 - recyclingRate);
}

/**
 * Calcula a concentração de VOC em ambiente fechado com ventilação mecânica.
 * Modelo de mistura perfeita (CSTR) em regime estacionário:
 * C = E / Q_ventilation
 *
 * @param {number} emissionRate_g_s   - Taxa de emissão (g/s), ≥ 0
 * @param {number} ventilationFlow_m3_s - Vazão de ventilação (m³/s), > 0
 * @returns {number} Concentração de VOC (mg/m³)
 * @throws {RangeError} Se parâmetros forem inválidos
 */
export function calcVOCConcentration(emissionRate_g_s: number, ventilationFlow_m3_s: number): number {
    if (emissionRate_g_s < 0) throw new RangeError('emissionRate_g_s must be >= 0');
    if (ventilationFlow_m3_s <= 0) throw new RangeError('ventilationFlow_m3_s must be > 0');

    // C (mg/m³) = E (g/s) × 1000 (mg/g) / Q (m³/s)
    return (emissionRate_g_s * 1000) / ventilationFlow_m3_s;
}

/**
 * Classifica o risco de exposição a VOC comparando com TLV-TWA (ACGIH 2024).
 * Limites de ação: 50% TLV = warning, 100% TLV = danger.
 *
 * @param {number} concentration_mg_m3 - Concentração medida (mg/m³), ≥ 0
 * @param {number} TLV_mg_m3          - Valor Limite de Tolerância TLV-TWA (mg/m³), > 0
 * @returns {'safe'|'warning'|'danger'}
 * @throws {RangeError} Se parâmetros forem inválidos
 */
export function classifyVOCRisk(concentration_mg_m3: number, TLV_mg_m3: number): 'safe' | 'warning' | 'danger' {
    if (concentration_mg_m3 < 0) throw new RangeError('concentration_mg_m3 must be >= 0');
    if (TLV_mg_m3 <= 0) throw new RangeError('TLV_mg_m3 must be > 0');

    const ratio = concentration_mg_m3 / TLV_mg_m3;
    if (ratio >= 1.0) return 'danger';
    if (ratio >= 0.5) return 'warning';
    return 'safe';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const mineExplosiveStorageSafetyMeta: AnalyticsModuleMeta = {
    name: 'mineExplosiveStorageSafety',
    description: 'mineExplosiveStorageSafety',
    category: 'analytics',
    familyTags: ['mining', 'risk', 'blasting'],
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
