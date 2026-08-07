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
 * Groundwater Quality Index - módulo de cálculo de IQA para águas subterrâneas.
 *
 * Referências acadêmicas:
 * - Brown, R.M. et al. (1972). A water quality index - do we dare?
 *   Water and Sewage Works, 119, 339–343.
 *   DOI: 10.2134/jeq1972.00472425000100030008x
 * - Chen, Y. et al. (2010). The use of entropy weight method to construct
 *   a comprehensive evaluation model for water quality assessment.
 *   Expert Systems with Applications, 37(3), 2013–2022.
 *   DOI: 10.1016/j.eswa.2009.06.005
 */

/**
 * Calcula o WQI ponderado (método Brown 1972).
 * WQI = Σ(wi × qi) / Σ(wi)
 * qi = ((Vi - Vid) / (Si - Vid)) × 100
 *
 * @param {Array<{weight: number, measured: number, ideal: number, standard: number, name?: string}>} parameters
 *   Lista de parâmetros com peso, valor medido, ideal e padrão regulatório.
 * @returns {{ WQI: number }} Índice de Qualidade da Água ponderado (0–100+).
 */
export function computeWeightedAverageWQI(parameters: any) {
    if (!Array.isArray(parameters) || parameters.length === 0) {
        throw new TypeError('parameters deve ser um array não vazio');
    }
    let sumWQ = 0;
    let sumW = 0;
    for (const p of parameters) {
        const { weight, measured, ideal, standard } = p;
        if (
            typeof weight !== 'number' ||
            typeof measured !== 'number' ||
            typeof ideal !== 'number' ||
            typeof standard !== 'number'
        ) {
            throw new TypeError('Cada parâmetro deve ter weight, measured, ideal e standard numéricos');
        }
        if (weight < 0) {
            throw new RangeError('Peso (weight) não pode ser negativo');
        }
        const denom = standard - ideal;
        // Denominador zero indica padrão igual ao ideal - parâmetro ignorado
        if (Math.abs(denom) < 1e-15) continue;
        const qi = ((measured - ideal) / denom) * 100;
        sumWQ += weight * qi;
        sumW += weight;
    }
    if (Math.abs(sumW) < 1e-15) {
        throw new RangeError('Soma dos pesos é zero — impossível calcular WQI');
    }
    return { WQI: sumWQ / sumW };
}

/**
 * Calcula pesos por entropia de Shannon para os parâmetros de qualidade.
 * ej = -k × Σ(pij × ln(pij)); wj = (1 - ej) / Σ(1 - ei)
 * onde k = 1/ln(n), n = número de amostras.
 *
 * @param {number[][]} measurements_matrix Matriz [n_samples × n_params] de valores medidos.
 * @returns {{ weights: number[] }} Vetor de pesos normalizados por entropia (soma = 1).
 */
export function computeEntropyWeight(measurements_matrix: any) {
    if (!Array.isArray(measurements_matrix) || measurements_matrix.length < 2) {
        throw new TypeError('measurements_matrix deve ter pelo menos 2 linhas (amostras)');
    }
    const n = measurements_matrix.length; // número de amostras
    const m = measurements_matrix[0].length; // número de parâmetros
    if (m === 0) throw new RangeError('measurements_matrix não pode ter zero colunas');

    for (const row of measurements_matrix) {
        if (!Array.isArray(row) || row.length !== m) {
            throw new TypeError('Todas as linhas da matriz devem ter o mesmo comprimento');
        }
        for (const v of row) {
            if (typeof v !== 'number' || v < 0) {
                throw new RangeError('Todos os valores da matriz devem ser números não-negativos');
            }
        }
    }

    const k = 1 / Math.log(n);
    const entropy = [];

    for (let j = 0; j < m; j++) {
        // Normaliza coluna pelo total (evita divisão por zero com shift)
        const col = measurements_matrix.map((row) => row[j]);
        const total = col.reduce((s, v) => s + v, 0);
        if (Math.abs(total) < 1e-15) {
            // Coluna toda zero → entropia máxima (peso zero)
            entropy.push(1);
            continue;
        }
        const pij = col.map((v) => v / total);
        // Σ(pij × ln(pij)) - termos com pij=0 contribuem zero (limite correto)
        const ej = -k * pij.reduce((s, p) => (p > 0 ? s + p * Math.log(p) : s), 0);
        entropy.push(Math.min(1, Math.max(0, ej)));
    }

    const divergence = entropy.map((e) => 1 - e);
    const sumDiv = divergence.reduce((s, d) => s + d, 0);
    if (Math.abs(sumDiv) < 1e-15) {
        // Todos os parâmetros com entropia máxima → pesos iguais
        return { weights: Array(m).fill(1 / m) };
    }
    return { weights: divergence.map((d) => d / sumDiv) };
}

/**
 * Calcula o índice de corrosividade (simplificado de Langelier).
 * CI = log10(TDS) + log10(Cl + SO4) - pH
 *
 * @param {number} chloride_mg_L   Concentração de cloreto (mg/L ≥ 0).
 * @param {number} sulfate_mg_L    Concentração de sulfato (mg/L ≥ 0).
 * @param {number} TDS_mg_L        Sólidos dissolvidos totais (mg/L > 0).
 * @param {number} pH              pH da água (0–14).
 * @returns {{ CI: number, corrosive: boolean }} Índice de corrosividade e classificação.
 */
export function computeCorrosivityIndex(chloride_mg_L: any, sulfate_mg_L: any, TDS_mg_L: any, pH: any) {
    if (
        typeof chloride_mg_L !== 'number' ||
        typeof sulfate_mg_L !== 'number' ||
        typeof TDS_mg_L !== 'number' ||
        typeof pH !== 'number'
    ) {
        throw new TypeError('Todos os parâmetros devem ser numéricos');
    }
    if (chloride_mg_L < 0) throw new RangeError('chloride_mg_L não pode ser negativo');
    if (sulfate_mg_L < 0) throw new RangeError('sulfate_mg_L não pode ser negativo');
    if (TDS_mg_L <= 0) throw new RangeError('TDS_mg_L deve ser positivo');
    if (pH < 0 || pH > 14) throw new RangeError('pH deve estar entre 0 e 14');

    const ionSum = chloride_mg_L + sulfate_mg_L;
    // Se soma de íons for zero, log10(0) → -Infinity; tratar como não-corrosivo
    const logIon = ionSum > 0 ? Math.log10(ionSum) : -Infinity;
    const CI = Math.log10(TDS_mg_L) + logIon - pH;
    return { CI, corrosive: CI > 0.5 };
}

/**
 * Classifica a adequabilidade da água subterrânea para consumo humano com base no WQI.
 * Faixas: <50 excelente, <100 boa, <150 ruim, <200 muito ruim, ≥200 imprópria.
 *
 * @param {number} WQI Índice de Qualidade da Água (≥ 0).
 * @returns {{ suitability: 'excellent'|'good'|'poor'|'very_poor'|'unsuitable' }}
 */
export function classifyGroundwaterForDrinking(WQI: any) {
    if (typeof WQI !== 'number') throw new TypeError('WQI deve ser um número');
    if (WQI < 0) throw new RangeError('WQI não pode ser negativo');
    if (WQI < 50) return { suitability: 'excellent' };
    if (WQI < 100) return { suitability: 'good' };
    if (WQI < 150) return { suitability: 'poor' };
    if (WQI < 200) return { suitability: 'very_poor' };
    return { suitability: 'unsuitable' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const groundwaterQualityIndexMeta = {
    name: 'groundwaterQualityIndex',
    description: 'groundwaterQualityIndex',
    category: 'analytics',
    familyTags: ['groundwater', 'water'],
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
