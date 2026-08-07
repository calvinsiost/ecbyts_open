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
 * Industrial Energy Balance - balanço e eficiência energética industrial.
 *
 * Referências acadêmicas:
 *   - Solomon, B.D. (1980). Energy conservation and technological change.
 *     Energy, 5(11), 1193–1202. DOI:10.1016/0360-5442(80)90077-4
 *   - ISO 50001:2018 - Energy management systems.
 *   - IPCC (2006). Guidelines for National Greenhouse Gas Inventories.
 *     Vol. 2 Energy, Chapter 1. https://www.ipcc-nggip.iges.or.jp/public/2006gl/
 */

/**
 * Calcula o Consumo Específico de Energia (SEC - Specific Energy Consumption).
 * SEC (GJ/t) = energia total (GJ) / produção (t)
 * Indicador fundamental de eficiência energética industrial.
 *
 * @param {number} energy_GJ - Energia total consumida em GJ. Deve ser ≥ 0.
 * @param {number} production_t - Produção total em toneladas. Deve ser > 0.
 * @returns {{ SEC_GJ_t: number }} Consumo específico de energia em GJ/t.
 * @throws {TypeError} Se qualquer argumento não for número finito.
 * @throws {RangeError} Se energy_GJ < 0 ou production_t ≤ 0.
 */
export function computeSpecificEnergyConsumption(energy_GJ: number, production_t: number): { SEC_GJ_t: number } {
    if (typeof energy_GJ !== 'number' || !isFinite(energy_GJ)) {
        throw new TypeError('energy_GJ deve ser um número finito');
    }
    if (typeof production_t !== 'number' || !isFinite(production_t)) {
        throw new TypeError('production_t deve ser um número finito');
    }
    if (energy_GJ < 0) throw new RangeError('energy_GJ não pode ser negativo');
    if (production_t <= 0) throw new RangeError('production_t deve ser positivo');

    const SEC_GJ_t = energy_GJ / production_t;
    return { SEC_GJ_t };
}

/**
 * Calcula o Índice de Intensidade Energética (EII - Energy Intensity Index).
 * EII = (SEC_actual / SEC_baseline) × 100
 * Baseado no framework Solomon (1980) - compara desempenho atual com linha base.
 * EII = 100 significa paridade com o baseline; < 100 indica melhor eficiência.
 *
 * @param {number} SEC_actual - Consumo específico de energia atual em GJ/t. Deve ser > 0.
 * @param {number} SEC_baseline - Consumo específico de energia da linha base em GJ/t. Deve ser > 0.
 * @returns {{ EII: number }} Índice de intensidade energética (adimensional).
 * @throws {TypeError} Se qualquer argumento não for número finito.
 * @throws {RangeError} Se qualquer argumento for ≤ 0.
 */
export function computeEnergyIntensityIndex(SEC_actual: number, SEC_baseline: number): { EII: number } {
    if (typeof SEC_actual !== 'number' || !isFinite(SEC_actual)) {
        throw new TypeError('SEC_actual deve ser um número finito');
    }
    if (typeof SEC_baseline !== 'number' || !isFinite(SEC_baseline)) {
        throw new TypeError('SEC_baseline deve ser um número finito');
    }
    if (SEC_actual <= 0) throw new RangeError('SEC_actual deve ser positivo');
    if (SEC_baseline <= 0) throw new RangeError('SEC_baseline deve ser positivo');

    // Multiplicação por 100 para expressar como percentual do baseline
    const EII = (SEC_actual / SEC_baseline) * 100;
    return { EII };
}

/**
 * Calcula as emissões de CO2 equivalente a partir do consumo energético.
 * CO2 (t) = energia (GJ) × fator de emissão (t CO2/GJ)
 * Metodologia IPCC 2006, Vol. 2, Capítulo 1.
 *
 * @param {number} energy_GJ - Energia consumida em GJ. Deve ser ≥ 0.
 * @param {number} emission_factor_t_CO2_GJ - Fator de emissão em t CO2/GJ. Deve ser > 0.
 * @returns {{ CO2_t: number }} Emissões de CO2 em toneladas.
 * @throws {TypeError} Se qualquer argumento não for número finito.
 * @throws {RangeError} Se energy_GJ < 0 ou emission_factor_t_CO2_GJ ≤ 0.
 */
export function computeCO2FromEnergy(energy_GJ: number, emission_factor_t_CO2_GJ: number): { CO2_t: number } {
    if (typeof energy_GJ !== 'number' || !isFinite(energy_GJ)) {
        throw new TypeError('energy_GJ deve ser um número finito');
    }
    if (typeof emission_factor_t_CO2_GJ !== 'number' || !isFinite(emission_factor_t_CO2_GJ)) {
        throw new TypeError('emission_factor_t_CO2_GJ deve ser um número finito');
    }
    if (energy_GJ < 0) throw new RangeError('energy_GJ não pode ser negativo');
    if (emission_factor_t_CO2_GJ <= 0) {
        throw new RangeError('emission_factor_t_CO2_GJ deve ser positivo');
    }

    const CO2_t = energy_GJ * emission_factor_t_CO2_GJ;
    return { CO2_t };
}

/**
 * Classifica a eficiência energética de uma unidade industrial pelo EII.
 * Escala de grade energética:
 *   EII < 80  → A (excelente - benchmark global)
 *   EII < 90  → B (boa eficiência)
 *   EII < 100 → C (na média do setor)
 *   EII < 110 → D (abaixo da média)
 *   EII ≥ 110 → E (ineficiente - requer intervenção)
 *
 * @param {number} EII - Índice de intensidade energética (adimensional). Deve ser > 0.
 * @returns {{ grade: string }} Grade de eficiência ('A'|'B'|'C'|'D'|'E').
 * @throws {TypeError} Se EII não for número finito.
 * @throws {RangeError} Se EII ≤ 0.
 */
export function classifyEnergyEfficiency(EII: number): { grade: string } {
    if (typeof EII !== 'number' || !isFinite(EII)) {
        throw new TypeError('EII deve ser um número finito');
    }
    if (EII <= 0) throw new RangeError('EII deve ser positivo');

    if (EII < 80) return { grade: 'A' };
    if (EII < 90) return { grade: 'B' };
    if (EII < 100) return { grade: 'C' };
    if (EII < 110) return { grade: 'D' };
    return { grade: 'E' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialEnergyBalanceMeta = {
    name: 'industrialEnergyBalance',
    description: 'industrialEnergyBalance',
    category: 'analytics',
    familyTags: ['industrial', 'energy'],
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
