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
 * Chemical Reactor Safety - análise de segurança térmica de reatores químicos industriais
 *
 * Referências acadêmicas:
 * - Stoessel, F. (2008) Thermal Safety of Chemical Processes.
 *   ISBN:9783527317127 (Wiley-VCH)
 * - Baerns, M. et al. (2006) Technische Chemie. ISBN:9783527310500
 * - Barkelew, C.H. (1959) Stability of chemical reactors. Chem. Eng. Prog. Symp. Ser. 55(25):37-46
 * - Semenov, N.N. (1959) Some Problems of Chemical Kinetics and Reactivity. Vol. 2, Pergamon Press
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

/** Constante universal dos gases ideais (J/mol·K) */
const R_GAS = 8.314;

/**
 * Calcula a elevação de temperatura adiabática (ATRD - Adiabatic Temperature Rise of Decomposition).
 * Temperatura máxima teórica se toda a energia da reação for absorvida pelo sistema sem dissipação.
 * (Stoessel 2008, ISBN:9783527317127, Capítulo 2)
 *
 * @param delta_H_kJ_mol - Entalpia de reação (kJ/mol, valor positivo = exotérmico)
 * @param Cp_kJ_kg_C - Capacidade calorífica específica (kJ/kg·°C), deve ser > 0
 * @param concentration_mol_L - Concentração do reagente limitante (mol/L), deve ser > 0
 * @param MW_kg_mol - Massa molar do reagente (kg/mol), deve ser > 0
 * @returns Elevação adiabática de temperatura (°C)
 * @throws {TypeError} Se qualquer parâmetro não for número finito
 * @throws {RangeError} Se Cp, concentração ou MW não forem > 0
 */
export function computeAdiabaticTemperatureRise(
    delta_H_kJ_mol: number,
    Cp_kJ_kg_C: number,
    concentration_mol_L: number,
    MW_kg_mol: number,
): { delta_T_adiabatic_C: number } {
    if (
        typeof delta_H_kJ_mol !== 'number' ||
        !isFinite(delta_H_kJ_mol) ||
        typeof Cp_kJ_kg_C !== 'number' ||
        !isFinite(Cp_kJ_kg_C) ||
        typeof concentration_mol_L !== 'number' ||
        !isFinite(concentration_mol_L) ||
        typeof MW_kg_mol !== 'number' ||
        !isFinite(MW_kg_mol)
    ) {
        throw new TypeError('computeAdiabaticTemperatureRise: todos os parâmetros devem ser números finitos');
    }
    if (Cp_kJ_kg_C <= 0) throw new RangeError('Cp_kJ_kg_C deve ser > 0');
    if (concentration_mol_L <= 0) throw new RangeError('concentration_mol_L deve ser > 0');
    if (MW_kg_mol <= 0) throw new RangeError('MW_kg_mol deve ser > 0');

    // ATRD = delta_H (kJ/mol) × c (mol/L) × MW (kg/mol) / Cp (kJ/kg·°C)
    // Unidades: [kJ/mol × mol/L × kg/mol] / [kJ/kg·°C] = [kg·kJ/(mol·L)] / [kJ/(kg·°C)]
    // Nota: 1 mol/L × 1 kg/mol = 1 kg/L; Cp [kJ/kg·°C] → resultado em °C·L/kg ≈ °C (densidade ~1 kg/L)
    const delta_T_adiabatic_C = (delta_H_kJ_mol * concentration_mol_L * MW_kg_mol) / Cp_kJ_kg_C;

    return { delta_T_adiabatic_C };
}

/**
 * Calcula o número de Damköhler (Da) para avaliação do controle cinético vs. transporte em reatores.
 * Da >> 1: reação completa (limitada por transferência de massa); Da << 1: cinética controla.
 *
 * @param reaction_rate_per_s - Taxa de reação (s⁻¹, constante de velocidade de pseudo-1ª ordem)
 * @param residence_time_s - Tempo de residência no reator (s), deve ser > 0
 * @returns Número de Damköhler (adimensional)
 * @throws {TypeError} Se qualquer parâmetro não for número finito
 * @throws {RangeError} Se taxa de reação < 0 ou tempo de residência ≤ 0
 */
export function computeDamkoehlerNumber(
    reaction_rate_per_s: number,
    residence_time_s: number,
): { Da: number } {
    if (
        typeof reaction_rate_per_s !== 'number' ||
        !isFinite(reaction_rate_per_s) ||
        typeof residence_time_s !== 'number' ||
        !isFinite(residence_time_s)
    ) {
        throw new TypeError('computeDamkoehlerNumber: todos os parâmetros devem ser números finitos');
    }
    if (reaction_rate_per_s < 0) throw new RangeError('reaction_rate_per_s deve ser ≥ 0');
    if (residence_time_s <= 0) throw new RangeError('residence_time_s deve ser > 0');

    const Da = reaction_rate_per_s * residence_time_s;

    return { Da };
}

/**
 * Calcula a temperatura crítica de Semenov onde a geração de calor iguala a remoção,
 * usando o critério de Semenov para ignição térmica (Semenov 1959).
 * Implementa Newton-Raphson com 5 iterações a partir de 200°C (473.15 K).
 *
 * Equação de equilíbrio: A × exp(-Ea/R/T) × Ea/R = U × (T - Tc_cooling)
 * Aqui simplificado: T_critical onde f(T) = A × exp(-Ea/(R×T)) - heat_removal_coef × T = 0
 *
 * @param E_activation_kJ_mol - Energia de ativação (kJ/mol), deve ser > 0
 * @param pre_exponential - Fator pré-exponencial de Arrhenius (s⁻¹), deve ser > 0
 * @param heat_removal_coef - Coeficiente de remoção de calor (W/K ou kJ/s/K), deve ser > 0
 * @returns Temperatura crítica de Semenov (°C)
 * @throws {TypeError} Se qualquer parâmetro não for número finito
 * @throws {RangeError} Se energia de ativação, fator pré-exponencial ou coef de remoção ≤ 0
 */
export function computeCriticalTemperature(
    E_activation_kJ_mol: number,
    pre_exponential: number,
    heat_removal_coef: number,
): { T_critical_C: number } {
    if (
        typeof E_activation_kJ_mol !== 'number' ||
        !isFinite(E_activation_kJ_mol) ||
        typeof pre_exponential !== 'number' ||
        !isFinite(pre_exponential) ||
        typeof heat_removal_coef !== 'number' ||
        !isFinite(heat_removal_coef)
    ) {
        throw new TypeError('computeCriticalTemperature: todos os parâmetros devem ser números finitos');
    }
    if (E_activation_kJ_mol <= 0) throw new RangeError('E_activation_kJ_mol deve ser > 0');
    if (pre_exponential <= 0) throw new RangeError('pre_exponential deve ser > 0');
    if (heat_removal_coef <= 0) throw new RangeError('heat_removal_coef deve ser > 0');

    const Ea_J = E_activation_kJ_mol * 1000; // kJ/mol → J/mol

    // f(T) = A×exp(-Ea/RT) - U×T = 0  (geração = remoção)
    // f'(T) = A×exp(-Ea/RT)×(Ea/RT²) - U
    let T = 473.15; // ponto inicial: 200°C em K
    for (let i = 0; i < 5; i++) {
        const expTerm = pre_exponential * Math.exp(-Ea_J / (R_GAS * T));
        const f = expTerm - heat_removal_coef * T;
        const df = expTerm * (Ea_J / (R_GAS * T * T)) - heat_removal_coef;
        if (Math.abs(df) < 1e-30) break; // evita divisão por zero
        T = T - f / df;
        if (T <= 0) T = 273.15; // protege temperatura negativa em K
    }

    return { T_critical_C: T - 273.15 };
}

/**
 * Classifica o risco térmico de um reator químico com base na elevação adiabática de temperatura
 * e no número de Damköhler.
 *
 * @param delta_T_adiabatic_C - Elevação adiabática de temperatura (°C)
 * @param Da - Número de Damköhler (adimensional), deve ser ≥ 0
 * @returns Classificação de risco
 * @throws {TypeError} Se qualquer parâmetro não for número finito
 * @throws {RangeError} Se Da < 0
 */
export function classifyReactorThermalRisk(
    delta_T_adiabatic_C: number,
    Da: number,
): { risk: 'low' | 'moderate' | 'high' | 'runaway' } {
    if (
        typeof delta_T_adiabatic_C !== 'number' ||
        !isFinite(delta_T_adiabatic_C) ||
        typeof Da !== 'number' ||
        !isFinite(Da)
    ) {
        throw new TypeError('classifyReactorThermalRisk: todos os parâmetros devem ser números finitos');
    }
    if (Da < 0) throw new RangeError('Da deve ser ≥ 0');

    // Runaway: elevação extrema OU reação muito rápida/completa
    if (delta_T_adiabatic_C >= 200 || Da > 10) return { risk: 'runaway' };
    if (delta_T_adiabatic_C >= 100) return { risk: 'high' };
    if (delta_T_adiabatic_C >= 50) return { risk: 'moderate' };
    return { risk: 'low' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const chemicalReactorSafetyMeta: AnalyticsModuleMeta = {
    name: 'chemicalReactorSafety',
    description: 'chemicalReactorSafety',
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
