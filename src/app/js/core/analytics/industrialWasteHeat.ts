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
 * Industrial Waste Heat Recovery - Potential, Effectiveness, CO2 Avoided, Priority
 *
 * Módulo puro para análise de recuperação de calor residual industrial:
 * potencial de recuperação, eficiência de trocador de calor, emissões de CO2
 * evitadas e priorização de projetos.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - IEA (2008). Worldwide Trends in Energy Use and Efficiency.
 *     Paris: International Energy Agency.
 *     DOI:10.1787/9789264042940-en
 *   - Jouhara, H., et al. (2018). Waste heat recovery technologies and applications.
 *     Thermal Science and Engineering Progress, 6, 268–289.
 *     DOI:10.1016/j.tsep.2018.04.017
 *   - Thekdi, A., & Nimbalkar, S. U. (2015). Industrial Waste Heat Recovery.
 *     Oak Ridge National Laboratory, ORNL/TM-2014/622.
 *     DOI:10.2172/1185778
 *
 * @module industrialWasteHeat
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

// Temperatura mínima de exaustão para evitar condensação de ácidos (°C)
// Recomendação IEA 2008: margem de 30°C acima do ponto de orvalho típico
const MIN_EXHAUST_DELTA_C = 30;

/**
 * Compute waste heat recovery potential from exhaust gas stream.
 * Calcula o potencial de recuperação de calor residual de corrente de gases de exaustão.
 *
 * Q_recuperável = m_dot × Cp × (T_exaustão − T_mínima)
 * T_mínima = T_ambiente + 30°C (margem anticondensação - IEA 2008)
 *
 * @param {number} exhaust_temp_C - Temperatura dos gases de exaustão (°C)
 * @param {number} ambient_temp_C - Temperatura ambiente de referência (°C)
 * @param {number} flow_kg_s - Vazão mássica dos gases de exaustão (kg/s)
 * @param {number} Cp_kJ_kg_C - Calor específico do gás de exaustão (kJ/(kg·°C))
 * @returns {{ recoverable_kW: number }}
 * @throws {RangeError} Se exhaust_temp ≤ ambient_temp + 30°C (sem potencial de recuperação)
 * @throws {RangeError} Se flow_kg_s ou Cp for negativo ou zero
 *
 * Referência: IEA (2008) DOI:10.1787/9789264042940-en; Thekdi & Nimbalkar (2015) DOI:10.2172/1185778
 */
export function computeWasteHeatRecoveryPotential(
    exhaust_temp_C: number,
    ambient_temp_C: number,
    flow_kg_s: number,
    Cp_kJ_kg_C: number,
): { recoverable_kW: number } {
    if (flow_kg_s <= 0) {
        throw new RangeError('computeWasteHeatRecoveryPotential: flow_kg_s deve ser > 0');
    }
    if (Cp_kJ_kg_C <= 0) {
        throw new RangeError('computeWasteHeatRecoveryPotential: Cp_kJ_kg_C deve ser > 0');
    }

    const T_min = ambient_temp_C + MIN_EXHAUST_DELTA_C;
    if (exhaust_temp_C <= T_min) {
        throw new RangeError(
            `computeWasteHeatRecoveryPotential: exhaust_temp_C (${exhaust_temp_C}°C) deve exceder ` +
                `ambient + 30°C (${T_min}°C) para recuperação viável`,
        );
    }

    // Q [kW] = m_dot [kg/s] × Cp [kJ/(kg·°C)] × ΔT [°C]
    const recoverable_kW = flow_kg_s * Cp_kJ_kg_C * (exhaust_temp_C - T_min);

    return { recoverable_kW };
}

/**
 * Compute heat exchanger effectiveness using NTU method (epsilon definition).
 * Calcula a efetividade de um trocador de calor pelo método da efetividade.
 *
 * ε = (T_hot_in − T_hot_out) / (T_hot_in − T_cold_in)
 *
 * @param {number} T_hot_in - Temperatura de entrada do fluido quente (°C)
 * @param {number} T_hot_out - Temperatura de saída do fluido quente (°C)
 * @param {number} T_cold_in - Temperatura de entrada do fluido frio (°C)
 * @returns {{ effectiveness: number }} Efetividade em [0, 1]
 * @throws {RangeError} Se T_hot_in ≤ T_cold_in (sem gradiente termodinâmico)
 * @throws {RangeError} Se T_hot_out < T_cold_in ou T_hot_out > T_hot_in
 *
 * Referência: Jouhara et al. (2018) DOI:10.1016/j.tsep.2018.04.017
 */
export function computeHeatExchangerEffectiveness(
    T_hot_in: number,
    T_hot_out: number,
    T_cold_in: number,
): { effectiveness: number } {
    if (T_hot_in <= T_cold_in) {
        throw new RangeError(
            'computeHeatExchangerEffectiveness: T_hot_in deve ser > T_cold_in (2ª lei da termodinâmica)',
        );
    }
    if (T_hot_out < T_cold_in || T_hot_out > T_hot_in) {
        throw new RangeError('computeHeatExchangerEffectiveness: T_hot_out deve estar entre T_cold_in e T_hot_in');
    }

    // Efetividade: razão entre transferência real e máxima possível
    const effectiveness = (T_hot_in - T_hot_out) / (T_hot_in - T_cold_in);

    // Capeamento defensivo no intervalo físico [0, 1]
    return { effectiveness: Math.min(1, Math.max(0, effectiveness)) };
}

/**
 * Compute CO2 emissions avoided by substituting grid electricity with recovered heat.
 * Calcula as emissões de CO2 evitadas ao substituir energia da rede por calor recuperado.
 *
 * CO2_avoided [t/ano] = recoverable_kW × operating_hours × grid_emission_factor / 1000
 *
 * @param {number} recoverable_kW - Potencial de recuperação (kW)
 * @param {number} operating_hours - Horas de operação por ano (h/ano)
 * @param {number} grid_emission_factor_kg_kWh - Fator de emissão da rede elétrica (kg CO2/kWh)
 * @returns {{ CO2_avoided_t_yr: number }}
 * @throws {RangeError} Se qualquer parâmetro for negativo
 *
 * Referência: IEA (2008) DOI:10.1787/9789264042940-en; Thekdi & Nimbalkar (2015) DOI:10.2172/1185778
 */
export function computeCO2AvoidedFromHeatRecovery(
    recoverable_kW: number,
    operating_hours: number,
    grid_emission_factor_kg_kWh: number,
): { CO2_avoided_t_yr: number } {
    if (recoverable_kW < 0 || operating_hours < 0 || grid_emission_factor_kg_kWh < 0) {
        throw new RangeError('computeCO2AvoidedFromHeatRecovery: todos os parâmetros devem ser ≥ 0');
    }

    // kW × h = kWh → × kg/kWh = kg → ÷ 1000 = t
    const CO2_avoided_t_yr = (recoverable_kW * operating_hours * grid_emission_factor_kg_kWh) / 1000;

    return { CO2_avoided_t_yr };
}

/**
 * Classify heat recovery project priority based on potential and payback period.
 * Classifica a prioridade de um projeto de recuperação de calor residual.
 *
 * Matriz de prioridade:
 *   urgent  - kW > 1000 E payback < 2 anos
 *   high    - kW > 500  E payback < 5 anos
 *   medium  - kW > 100
 *   low     - demais casos
 *
 * @param {number} recoverable_kW - Potencial de recuperação (kW)
 * @param {number} payback_years - Período de retorno do investimento (anos)
 * @returns {{ priority: 'low'|'medium'|'high'|'urgent' }}
 * @throws {RangeError} Se recoverable_kW < 0 ou payback_years < 0
 *
 * Referência: Thekdi & Nimbalkar (2015) DOI:10.2172/1185778 - prioritization framework.
 */
export function classifyHeatRecoveryPriority(
    recoverable_kW: number,
    payback_years: number,
): { priority: 'low' | 'medium' | 'high' | 'urgent' } {
    if (recoverable_kW < 0 || payback_years < 0) {
        throw new RangeError('classifyHeatRecoveryPriority: parâmetros devem ser ≥ 0');
    }

    if (recoverable_kW > 1000 && payback_years < 2) {
        return { priority: 'urgent' };
    }
    if (recoverable_kW > 500 && payback_years < 5) {
        return { priority: 'high' };
    }
    if (recoverable_kW > 100) {
        return { priority: 'medium' };
    }
    return { priority: 'low' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialWasteHeatMeta: AnalyticsModuleMeta = {
    name: 'industrialWasteHeat',
    description: 'industrialWasteHeat',
    category: 'analytics',
    familyTags: ['industrial', 'waste'],
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
