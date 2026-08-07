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
 * @module mineralProcessingEfficiency
 * Indicadores de eficiência de processamento mineral: recuperação metalúrgica,
 * razão de enriquecimento, índice de seletividade e classificação de desempenho.
 *
 * Referências acadêmicas:
 * - Wills, B.A. & Finch, J.A. 2015 - Wills' Mineral Processing Technology (8th ed.)
 *   ISBN: 978-0-08-097092-9
 * - Gaudin, A.M. 1939 - Principles of Mineral Dressing
 *   Publisher: McGraw-Hill, New York
 * - Napier-Munn, T.J. et al. 1996 - Mineral Comminution Circuits
 *   ISBN: 978-0-646-28861-0
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
 * Calcula a recuperação metalúrgica de um circuito de beneficiamento.
 * R = (massa_concentrado × teor_concentrado) / (massa_alimentação × teor_alimentação) × 100
 * Representa a fração do metal-alvo que foi recuperada no concentrado.
 *
 * @param concentrate_mass_t - Massa do concentrado produzido (toneladas)
 * @param concentrate_grade_pct - Teor do metal no concentrado (%)
 * @param feed_mass_t - Massa da alimentação (toneladas)
 * @param feed_grade_pct - Teor do metal na alimentação (%)
 * @returns Recuperação metalúrgica em percentual
 * @throws {TypeError} Se parâmetros não forem números
 * @throws {RangeError} Se massas <= 0, teores <= 0 ou teores > 100
 */
export function computeRecovery(
    concentrate_mass_t: number,
    concentrate_grade_pct: number,
    feed_mass_t: number,
    feed_grade_pct: number,
): { recovery_pct: number } {
    if (
        typeof concentrate_mass_t !== 'number' ||
        typeof concentrate_grade_pct !== 'number' ||
        typeof feed_mass_t !== 'number' ||
        typeof feed_grade_pct !== 'number'
    ) {
        throw new TypeError('computeRecovery: todos os parâmetros devem ser números');
    }
    if (concentrate_mass_t <= 0 || feed_mass_t <= 0) {
        throw new RangeError('computeRecovery: massas devem ser positivas');
    }
    if (concentrate_grade_pct <= 0 || feed_grade_pct <= 0) {
        throw new RangeError('computeRecovery: teores devem ser positivos');
    }
    if (concentrate_grade_pct > 100 || feed_grade_pct > 100) {
        throw new RangeError('computeRecovery: teores não podem exceder 100%');
    }

    // Balanço metalúrgico: metal no concentrado / metal na alimentação
    const metal_in_concentrate = concentrate_mass_t * (concentrate_grade_pct / 100);
    const metal_in_feed = feed_mass_t * (feed_grade_pct / 100);
    const recovery_pct = (metal_in_concentrate / metal_in_feed) * 100;

    return { recovery_pct };
}

/**
 * Calcula a razão de enriquecimento (Enrichment Ratio) do circuito de beneficiamento.
 * ER = teor_concentrado / teor_alimentação
 * Deve ser > 1; quanto maior, mais eficiente a concentração.
 *
 * @param concentrate_grade_pct - Teor do metal no concentrado (%)
 * @param feed_grade_pct - Teor do metal na alimentação (%)
 * @returns Razão de enriquecimento (adimensional)
 * @throws {TypeError} Se parâmetros não forem números
 * @throws {RangeError} Se teores <= 0 ou > 100
 */
export function computeEnrichmentRatio(
    concentrate_grade_pct: number,
    feed_grade_pct: number,
): { ER: number } {
    if (typeof concentrate_grade_pct !== 'number' || typeof feed_grade_pct !== 'number') {
        throw new TypeError('computeEnrichmentRatio: parâmetros devem ser números');
    }
    if (concentrate_grade_pct <= 0 || feed_grade_pct <= 0) {
        throw new RangeError('computeEnrichmentRatio: teores devem ser positivos');
    }
    if (concentrate_grade_pct > 100 || feed_grade_pct > 100) {
        throw new RangeError('computeEnrichmentRatio: teores não podem exceder 100%');
    }

    const ER = concentrate_grade_pct / feed_grade_pct;
    return { ER };
}

/**
 * Calcula o Índice de Seletividade de Gaudin (Selectivity Index - SI).
 * SI = log(1 - recovery_gangue/100) / log(1 - recovery_target/100)
 * SI > 1 indica seletividade positiva (mineral valioso recuperado preferencialmente).
 * SI = 1 indica separação não-seletiva. SI < 1 indica separação reversa.
 *
 * @param recovery_target_pct - Recuperação do mineral alvo no concentrado (%)
 * @param recovery_gangue_pct - Recuperação da ganga (mineral indesejável) no concentrado (%)
 * @returns Índice de seletividade de Gaudin
 * @throws {TypeError} Se parâmetros não forem números
 * @throws {RangeError} Se recuperações fora de [0, 99.99] - 100% implica log(0)
 */
export function computeSelectivity(
    recovery_target_pct: number,
    recovery_gangue_pct: number,
): { selectivity_index: number } {
    if (typeof recovery_target_pct !== 'number' || typeof recovery_gangue_pct !== 'number') {
        throw new TypeError('computeSelectivity: parâmetros devem ser números');
    }
    if (recovery_target_pct < 0 || recovery_target_pct >= 100) {
        throw new RangeError('computeSelectivity: recovery_target_pct deve estar no intervalo [0, 100)');
    }
    if (recovery_gangue_pct < 0 || recovery_gangue_pct >= 100) {
        throw new RangeError('computeSelectivity: recovery_gangue_pct deve estar no intervalo [0, 100)');
    }
    if (recovery_target_pct === 0) {
        throw new RangeError('computeSelectivity: recovery_target_pct = 0 resulta em divisão por zero');
    }

    // Índice de Gaudin (1939): razão logarítmica das perdas de ganga e mineral alvo
    const log_target = Math.log(1 - recovery_target_pct / 100);
    const log_gangue = Math.log(1 - recovery_gangue_pct / 100);

    // Quando ganga = 0 (sem ganga no concentrado), selectivity → +Infinity (perfeita)
    // Tratamento: retornar Infinity como caso limite fisicamente válido
    if (recovery_gangue_pct === 0) {
        return { selectivity_index: Infinity };
    }

    const selectivity_index = log_gangue / log_target;
    return { selectivity_index };
}

/**
 * Classifica o desempenho de um concentrador com base na recuperação e razão de enriquecimento.
 * - excellent: recuperação > 90% E ER > 20
 * - good:      recuperação > 80% E ER > 10
 * - fair:      recuperação > 70% E ER > 5
 * - poor:      demais casos
 *
 * @param recovery_pct - Recuperação metalúrgica (%)
 * @param enrichment_ratio - Razão de enriquecimento (adimensional)
 * @returns Classificação de desempenho do concentrador
 * @throws {TypeError} Se parâmetros não forem números
 * @throws {RangeError} Se recovery_pct fora de [0, 100] ou enrichment_ratio <= 0
 */
export function classifyConcentratorPerformance(
    recovery_pct: number,
    enrichment_ratio: number,
): { performance: string } {
    if (typeof recovery_pct !== 'number' || typeof enrichment_ratio !== 'number') {
        throw new TypeError('classifyConcentratorPerformance: parâmetros devem ser números');
    }
    if (recovery_pct < 0 || recovery_pct > 100) {
        throw new RangeError('classifyConcentratorPerformance: recovery_pct deve estar no intervalo [0, 100]');
    }
    if (enrichment_ratio <= 0) {
        throw new RangeError('classifyConcentratorPerformance: enrichment_ratio deve ser positivo');
    }

    let performance;
    if (recovery_pct > 90 && enrichment_ratio > 20) {
        performance = 'excellent';
    } else if (recovery_pct > 80 && enrichment_ratio > 10) {
        performance = 'good';
    } else if (recovery_pct > 70 && enrichment_ratio > 5) {
        performance = 'fair';
    } else {
        performance = 'poor';
    }

    return { performance };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineralProcessingEfficiencyMeta: AnalyticsModuleMeta = {
    name: 'mineralProcessingEfficiency',
    description: 'mineralProcessingEfficiency',
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
