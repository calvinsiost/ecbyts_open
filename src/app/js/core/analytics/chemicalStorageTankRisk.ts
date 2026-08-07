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
 * @module chemicalStorageTankRisk
 * Modelos de risco para tanques de armazenamento químico.
 * Implementa Torricelli, Antoine, EPA evaporation e NFPA 30 classification.
 *
 * Referências acadêmicas:
 * - CCPS Guidelines for Chemical Process Quantitative Risk Analysis, 2010
 *   DOI:10.1002/9780470925997
 * - Antoine, C. (1888). Tensions des vapeurs. Comptes Rendus, 107, 681-684.
 * - CRC Handbook of Chemistry and Physics (101st ed.)
 * - EPA AP-42 Compilation of Air Emission Factors, §2.4
 * - NFPA 30: Flammable and Combustible Liquids Code, 2021 Edition
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

const G = 9.80665; // aceleração gravitacional (m/s²)
const CD = 0.61; // coeficiente de descarga de Torricelli (adimensional, default)

/**
 * Calcula a taxa de vazamento por orifício usando equação de Torricelli.
 * Q = Cd × A × sqrt(2 × g × h), massa = Q × densidade
 *
 * @param hole_area_m2     - Área do orifício (m²), deve ser > 0
 * @param fluid_height_m   - Altura de fluido acima do orifício (m), deve ser >= 0
 * @param fluid_density_kg_m3 - Densidade do fluido (kg/m³), deve ser > 0
 * @returns Taxa de vazamento mássico (kg/s)
 */
export function computeLeakageRate(
    hole_area_m2: number,
    fluid_height_m: number,
    fluid_density_kg_m3: number,
): { flow_kg_s: number } {
    if (
        typeof hole_area_m2 !== 'number' ||
        typeof fluid_height_m !== 'number' ||
        typeof fluid_density_kg_m3 !== 'number'
    ) {
        throw new TypeError('computeLeakageRate: todos os parâmetros devem ser números');
    }
    if (hole_area_m2 <= 0) {
        throw new RangeError('computeLeakageRate: hole_area_m2 deve ser > 0');
    }
    if (fluid_height_m < 0) {
        throw new RangeError('computeLeakageRate: fluid_height_m deve ser >= 0');
    }
    if (fluid_density_kg_m3 <= 0) {
        throw new RangeError('computeLeakageRate: fluid_density_kg_m3 deve ser > 0');
    }
    // Velocidade de saída pelo orifício (m/s): v = Cd × sqrt(2×g×h)
    const velocity_m_s = CD * Math.sqrt(2 * G * fluid_height_m);
    // Vazão volumétrica (m³/s): Q = A × v
    const flow_m3_s = hole_area_m2 * velocity_m_s;
    // Vazão mássica (kg/s): m = Q × rho
    const flow_kg_s = flow_m3_s * fluid_density_kg_m3;
    return { flow_kg_s };
}

/**
 * Calcula a pressão de vapor a uma dada temperatura usando a equação de Antoine.
 * log10(P) = A - B / (C + T), onde T em °C e P em kPa
 *
 * @param T_C       - Temperatura (°C)
 * @param Antoine_A - Constante A de Antoine (adimensional)
 * @param Antoine_B - Constante B de Antoine (K ou °C·adim)
 * @param Antoine_C - Constante C de Antoine (K ou °C·adim)
 * @returns Pressão de vapor (kPa)
 */
export function computeVaporPressureAtTemperature(
    T_C: number,
    Antoine_A: number,
    Antoine_B: number,
    Antoine_C: number,
): { P_kPa: number } {
    if (
        typeof T_C !== 'number' ||
        typeof Antoine_A !== 'number' ||
        typeof Antoine_B !== 'number' ||
        typeof Antoine_C !== 'number'
    ) {
        throw new TypeError('computeVaporPressureAtTemperature: todos os parâmetros devem ser números');
    }
    const denom = Antoine_C + T_C;
    if (denom === 0) {
        throw new RangeError('computeVaporPressureAtTemperature: (Antoine_C + T_C) não pode ser zero');
    }
    // Equação de Antoine: pressão em kPa
    const log10P = Antoine_A - Antoine_B / denom;
    const P_kPa = Math.pow(10, log10P);
    return { P_kPa };
}

/**
 * Calcula a taxa de evaporação de poça de líquido derramado.
 * Modelo EPA: E = 4.1e-5 × A × MW^(2/3) × P × u^(0.78)
 *
 * @param pool_area_m2       - Área da poça (m²), deve ser > 0
 * @param vapor_pressure_kPa - Pressão de vapor do líquido (kPa), deve ser > 0
 * @param MW                 - Massa molecular do composto (g/mol), deve ser > 0
 * @param wind_speed_m_s     - Velocidade do vento (m/s), deve ser >= 0
 * @returns Taxa de evaporação (kg/s)
 */
export function computeEvaporationRateFromPool(
    pool_area_m2: number,
    vapor_pressure_kPa: number,
    MW: number,
    wind_speed_m_s: number,
): { evap_kg_s: number } {
    if (
        typeof pool_area_m2 !== 'number' ||
        typeof vapor_pressure_kPa !== 'number' ||
        typeof MW !== 'number' ||
        typeof wind_speed_m_s !== 'number'
    ) {
        throw new TypeError('computeEvaporationRateFromPool: todos os parâmetros devem ser números');
    }
    if (pool_area_m2 <= 0) throw new RangeError('computeEvaporationRateFromPool: pool_area_m2 deve ser > 0');
    if (vapor_pressure_kPa <= 0)
        throw new RangeError('computeEvaporationRateFromPool: vapor_pressure_kPa deve ser > 0');
    if (MW <= 0) throw new RangeError('computeEvaporationRateFromPool: MW deve ser > 0');
    if (wind_speed_m_s < 0) throw new RangeError('computeEvaporationRateFromPool: wind_speed_m_s deve ser >= 0');
    // Modelo EPA AP-42 §2.4: E em kg/s
    const evap_kg_s = 4.1e-5 * pool_area_m2 * Math.pow(MW, 2 / 3) * vapor_pressure_kPa * Math.pow(wind_speed_m_s, 0.78);
    return { evap_kg_s };
}

/**
 * Classifica o perigo de tanque de armazenamento conforme NFPA 30.
 * Classe I: ponto de fulgor < 37.8°C
 * Classe II: 37.8 ≤ fp < 60°C
 * Classe III: 60 ≤ fp < 93°C
 * Classe IV: fp ≥ 93°C (ou inflamável mas tóxico acima de IDLH)
 *
 * @param flash_point_C           - Ponto de fulgor (°C)
 * @param boiling_point_C         - Ponto de ebulição (°C)
 * @param toxic_concentration_mg_m3 - Concentração tóxica de referência IDLH (mg/m³), 0 se não aplicável
 * @returns Classe de perigo NFPA 30
 */
export function classifyStorageTankHazard(
    flash_point_C: number,
    boiling_point_C: number,
    toxic_concentration_mg_m3: number,
): { hazard_class: 'I' | 'II' | 'III' | 'IV' } {
    if (
        typeof flash_point_C !== 'number' ||
        typeof boiling_point_C !== 'number' ||
        typeof toxic_concentration_mg_m3 !== 'number'
    ) {
        throw new TypeError('classifyStorageTankHazard: todos os parâmetros devem ser números');
    }
    if (toxic_concentration_mg_m3 < 0) {
        throw new RangeError('classifyStorageTankHazard: toxic_concentration_mg_m3 deve ser >= 0');
    }
    // Override para classe IV se substância não-inflamável mas altamente tóxica (IDLH baixo)
    // Convenção: toxic_concentration_mg_m3 > 0 e substância tem fp acima de 93°C = classe IV por toxicidade
    if (flash_point_C >= 93 && toxic_concentration_mg_m3 > 0) {
        return { hazard_class: 'IV' };
    }
    if (flash_point_C < 37.8) return { hazard_class: 'I' };
    if (flash_point_C < 60) return { hazard_class: 'II' };
    if (flash_point_C < 93) return { hazard_class: 'III' };
    return { hazard_class: 'IV' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const chemicalStorageTankRiskMeta: AnalyticsModuleMeta = {
    name: 'chemicalStorageTankRisk',
    description: 'chemicalStorageTankRisk',
    category: 'analytics',
    familyTags: ['chemical', 'risk'],
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
