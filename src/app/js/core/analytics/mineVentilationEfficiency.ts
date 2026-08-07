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
 * Mine Ventilation Efficiency Module
 *
 * Calcula requisitos de ventilação em minas subterrâneas com base
 * em normas NIOSH, MSHA e princípios da lei de ventilação de McElroy.
 *
 * References:
 *  - NIOSH (1988) Preventing Occupational Disease and Injury - ventilation standards
 *  - McElroy, G.E. (1982) Engineering Factors in the Ventilation of Metal Mines, USBM
 *  - MSHA 30 CFR Part 57 - Safety and Health Standards: Underground Metal and Nonmetal Mines
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

/**
 * Computa a vazão de ar mínima necessária para uma galeria de mina.
 * Q = max(workforce × 0.06, diesel_kW × 0.06, contaminant_rate_L_s) [m³/s]
 * Cada critério garante diluição adequada de CO₂, CH₄ e gases diesel.
 *
 * @param {number} workforce              - Número de trabalhadores simultaneamente (≥ 0)
 * @param {number} diesel_kW             - Potência total de equipamentos diesel (kW, ≥ 0)
 * @param {number} contaminant_rate_L_s  - Taxa de geração de contaminante (L/s, ≥ 0)
 * @returns {{ Q_m3_s: number }}
 * @throws {TypeError}   se algum argumento não for número finito
 * @throws {RangeError}  se algum argumento for negativo
 */
export function computeAirflowRequired(
    workforce: number,
    diesel_kW: number,
    contaminant_rate_L_s: number,
): { Q_m3_s: number } {
    for (const [name, val] of [
        ['workforce', workforce],
        ['diesel_kW', diesel_kW],
        ['contaminant_rate_L_s', contaminant_rate_L_s],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || !isFinite(val)) {
            throw new TypeError(`${name} deve ser um número finito`);
        }
        if (val < 0) {
            throw new RangeError(`${name} não pode ser negativo`);
        }
    }

    // Converte L/s → m³/s para uniformidade de unidades
    const contaminant_m3_s = contaminant_rate_L_s / 1000;
    const Q_m3_s = Math.max(workforce * 0.06, diesel_kW * 0.06, contaminant_m3_s);
    return { Q_m3_s };
}

/**
 * Computa a pressão de ventilação necessária usando a lei do ventilador.
 * P = R × Q² [Pa]  - lei quadrática da resistência aerodinâmica da mina.
 *
 * @param {number} Q_m3_s           - Vazão de ar (m³/s, > 0)
 * @param {number} resistance_Ns2_m8 - Resistência da rede (N·s²/m⁸, > 0)
 * @returns {{ pressure_Pa: number }}
 * @throws {TypeError}   se os argumentos não forem números finitos
 * @throws {RangeError}  se Q ou resistência forem ≤ 0
 */
export function computeVentilationPressure(
    Q_m3_s: number,
    resistance_Ns2_m8: number,
): { pressure_Pa: number } {
    if (typeof Q_m3_s !== 'number' || !isFinite(Q_m3_s)) {
        throw new TypeError('Q_m3_s deve ser um número finito');
    }
    if (typeof resistance_Ns2_m8 !== 'number' || !isFinite(resistance_Ns2_m8)) {
        throw new TypeError('resistance_Ns2_m8 deve ser um número finito');
    }
    if (Q_m3_s <= 0) {
        throw new RangeError('Q_m3_s deve ser maior que zero');
    }
    if (resistance_Ns2_m8 <= 0) {
        throw new RangeError('resistance_Ns2_m8 deve ser maior que zero');
    }

    const pressure_Pa = resistance_Ns2_m8 * Q_m3_s * Q_m3_s;
    return { pressure_Pa };
}

/**
 * Computa o consumo de potência do ventilador.
 * W = (Q × P) / (η × 1000)  [kW]
 *
 * @param {number} Q_m3_s        - Vazão (m³/s, > 0)
 * @param {number} pressure_Pa   - Pressão de ventilação (Pa, > 0)
 * @param {number} fan_efficiency - Eficiência do ventilador (0 < η ≤ 1)
 * @returns {{ power_kW: number }}
 * @throws {TypeError}   se os argumentos não forem números finitos
 * @throws {RangeError}  se valores estiverem fora dos limites admissíveis
 */
export function computePowerConsumption(
    Q_m3_s: number,
    pressure_Pa: number,
    fan_efficiency: number,
): { power_kW: number } {
    if (typeof Q_m3_s !== 'number' || !isFinite(Q_m3_s)) {
        throw new TypeError('Q_m3_s deve ser um número finito');
    }
    if (typeof pressure_Pa !== 'number' || !isFinite(pressure_Pa)) {
        throw new TypeError('pressure_Pa deve ser um número finito');
    }
    if (typeof fan_efficiency !== 'number' || !isFinite(fan_efficiency)) {
        throw new TypeError('fan_efficiency deve ser um número finito');
    }
    if (Q_m3_s <= 0) throw new RangeError('Q_m3_s deve ser maior que zero');
    if (pressure_Pa <= 0) throw new RangeError('pressure_Pa deve ser maior que zero');
    if (fan_efficiency <= 0 || fan_efficiency > 1) {
        throw new RangeError('fan_efficiency deve estar no intervalo (0, 1]');
    }

    const power_kW = (Q_m3_s * pressure_Pa) / (fan_efficiency * 1000);
    return { power_kW };
}

/**
 * Classifica a adequação da ventilação com base nos limites de exposição ocupacional.
 * Critérios MSHA 30 CFR Part 57:
 *   CO < 50 ppm  AND  CH₄ < 1%  AND  poeira < 3 mg/m³ → adequate = true
 *
 * @param {number} CO_ppm     - Concentração de monóxido de carbono (ppm, ≥ 0)
 * @param {number} CH4_pct    - Concentração de metano (%, ≥ 0)
 * @param {number} dust_mg_m3 - Concentração de poeira respirável (mg/m³, ≥ 0)
 * @returns {{ adequate: boolean, limiting_factor: string|null }}
 * @throws {TypeError}   se os argumentos não forem números finitos
 * @throws {RangeError}  se algum argumento for negativo
 */
export function classifyVentilationAdequacy(
    CO_ppm: number,
    CH4_pct: number,
    dust_mg_m3: number,
): { adequate: boolean; limiting_factor: string | null } {
    for (const [name, val] of [
        ['CO_ppm', CO_ppm],
        ['CH4_pct', CH4_pct],
        ['dust_mg_m3', dust_mg_m3],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || !isFinite(val)) {
            throw new TypeError(`${name} deve ser um número finito`);
        }
        if (val < 0) {
            throw new RangeError(`${name} não pode ser negativo`);
        }
    }

    // Identifica o fator limitante mais crítico
    let limiting_factor: string | null = null;
    if (CO_ppm >= 50) limiting_factor = 'CO';
    if (CH4_pct >= 1) limiting_factor = limiting_factor ? `${limiting_factor},CH4` : 'CH4';
    if (dust_mg_m3 >= 3) limiting_factor = limiting_factor ? `${limiting_factor},dust` : 'dust';

    const adequate = limiting_factor === null;
    return { adequate, limiting_factor };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const mineVentilationEfficiencyMeta: AnalyticsModuleMeta = {
    name: 'mineVentilationEfficiency',
    description: 'mineVentilationEfficiency',
    category: 'analytics',
    familyTags: ['mining'],
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
