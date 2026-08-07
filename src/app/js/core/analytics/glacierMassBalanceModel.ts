// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Glacier Mass Balance Model
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Glacier Mass Balance Model
 *
 * Módulo puro para modelagem do balanço de massa de geleiras usando o método
 * grau-dia (degree-day method) de Hock (2003). Calcula acumulação de neve,
 * ablação por temperatura, balanço líquido e classifica o status de saúde
 * da geleira segundo critérios da WGMS/IPCC.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Cogley, J.G. et al. (2011). Glossary of Glacier Mass Balance and Related
 *     Terms. IHP-VII Technical Documents in Hydrology No. 86.
 *     UNESCO-IHP, Paris. (terminologia e definições de balanço de massa)
 *   - Zemp, M. et al. (2019). Global glacier mass changes and their contributions
 *     to sea-level rise from 1961 to 2016. Nature 568:382–386.
 *     DOI: 10.1038/s41586-019-1071-0 (tendências globais de perda de massa)
 *   - Hock, R. (2003). Temperature index melt modelling in mountain areas.
 *     Journal of Hydrology 282(1–4):104–115. DOI: 10.1016/S0022-1694(03)00257-9
 *     (método grau-dia para cálculo de ablação)
 *
 * @module glacierMassBalanceModel
 */

'use strict';

/**
 * Fator grau-dia padrão para neve/gelo (mm w.e. / °C·dia).
 * Hock (2003) Tabela 1 - valor médio para gelo de geleira temperada.
 */
const DDF_ICE_DEFAULT = 6.5; // mm w.e. / (°C·dia)

/**
 * Fator grau-dia padrão para neve (mm w.e. / °C·dia).
 * Hock (2003) Tabela 1 - neve fresca tem fator menor que gelo.
 */
const DDF_SNOW_DEFAULT = 3.5; // mm w.e. / (°C·dia)

/**
 * Calcula a taxa de acumulação anual de neve (mm w.e./ano).
 * Acumulação = precipitação total quando temperatura ≤ limiar de neve.
 * Cogley et al. (2011) §2.1 - balanço de inverno.
 *
 * @param {number[]} monthlyPrecip_mm  - Precipitação mensal (mm), array de 12 valores
 * @param {number[]} monthlyTemp_C     - Temperatura mensal média (°C), array de 12 valores
 * @param {number}   snowTempThresh_C  - Temperatura limiar para precipitação sólida (°C; típico 2.0)
 * @returns {{ accumulation_mm_we: number, snowMonths: number }}
 *   accumulation_mm_we: acumulação anual em mm w.e.; snowMonths: meses com neve
 */
export function calcAccumulationRate(monthlyPrecip_mm: any, monthlyTemp_C: any, snowTempThresh_C = 2.0) {
    if (!Array.isArray(monthlyPrecip_mm) || monthlyPrecip_mm.length !== 12) {
        throw new TypeError('monthlyPrecip_mm deve ser array de 12 valores numéricos');
    }
    if (!Array.isArray(monthlyTemp_C) || monthlyTemp_C.length !== 12) {
        throw new TypeError('monthlyTemp_C deve ser array de 12 valores numéricos');
    }
    if (monthlyPrecip_mm.some((v) => typeof v !== 'number' || v < 0)) {
        throw new RangeError('Todos os valores de precipitação devem ser números >= 0');
    }
    if (monthlyTemp_C.some((v) => typeof v !== 'number')) {
        throw new TypeError('Todos os valores de temperatura devem ser números');
    }

    let accumulation_mm_we = 0;
    let snowMonths = 0;

    for (let i = 0; i < 12; i++) {
        if (monthlyTemp_C[i] <= snowTempThresh_C) {
            // Precipitação sólida - soma como acumulação (1 mm precip ≈ 1 mm w.e. neve)
            accumulation_mm_we += monthlyPrecip_mm[i];
            snowMonths++;
        }
    }

    return { accumulation_mm_we, snowMonths };
}

/**
 * Calcula a taxa de ablação anual pelo método grau-dia (degree-day method).
 * Hock (2003) equação principal: A = DDF × ΣPDD
 * onde PDD = Positive Degree Days = soma dos graus-dia positivos.
 *
 * @param {number[]} monthlyTemp_C  - Temperatura mensal média (°C), array de 12 valores
 * @param {number}   ddfIce         - Fator grau-dia para gelo (mm w.e./°C·dia; padrão 6.5)
 * @param {number}   ddfSnow        - Fator grau-dia para neve (mm w.e./°C·dia; padrão 3.5)
 * @param {number}   snowFraction   - Fração da superfície coberta por neve (0–1; padrão 0.5)
 * @returns {{ ablation_mm_we: number, pdd: number, ddfEffective: number }}
 *   ablation_mm_we: ablação anual em mm w.e.; pdd: graus-dia positivos acumulados;
 *   ddfEffective: DDF efetivo ponderado pela cobertura de neve
 */
export function calcAblationRate(
    monthlyTemp_C: any,
    ddfIce = DDF_ICE_DEFAULT,
    ddfSnow = DDF_SNOW_DEFAULT,
    snowFraction = 0.5,
) {
    if (!Array.isArray(monthlyTemp_C) || monthlyTemp_C.length !== 12) {
        throw new TypeError('monthlyTemp_C deve ser array de 12 valores numéricos');
    }
    if (monthlyTemp_C.some((v) => typeof v !== 'number')) {
        throw new TypeError('Todos os valores de temperatura devem ser números');
    }
    if (typeof ddfIce !== 'number' || ddfIce <= 0) {
        throw new RangeError('ddfIce deve ser número positivo (mm w.e./°C·dia)');
    }
    if (typeof ddfSnow !== 'number' || ddfSnow <= 0) {
        throw new RangeError('ddfSnow deve ser número positivo (mm w.e./°C·dia)');
    }
    if (typeof snowFraction !== 'number' || snowFraction < 0 || snowFraction > 1) {
        throw new RangeError('snowFraction deve ser fração entre 0 e 1');
    }

    // Graus-dia positivos (°C·dia) - aproximação mensal: dias_mes × temp_positiva
    const daysPerMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let pdd = 0;
    for (let i = 0; i < 12; i++) {
        if (monthlyTemp_C[i] > 0) {
            pdd += monthlyTemp_C[i] * daysPerMonth[i]!;
        }
    }

    // DDF efetivo ponderado pela cobertura de neve e gelo
    const ddfEffective = snowFraction * ddfSnow + (1 - snowFraction) * ddfIce;

    // Ablação anual (mm w.e.)
    const ablation_mm_we = ddfEffective * pdd;

    return { ablation_mm_we, pdd, ddfEffective };
}

/**
 * Calcula o balanço de massa líquido anual de uma geleira.
 * Cogley et al. (2011) §2.3: B_net = B_acc − B_abl
 * Resultado em mm w.e./ano (milímetros de equivalente em água por ano).
 *
 * @param {number} accumulation_mm_we - Acumulação anual (mm w.e./ano)
 * @param {number} ablation_mm_we     - Ablação anual (mm w.e./ano)
 * @returns {{ netBalance_mm_we: number, balanceRatio: number }}
 *   netBalance_mm_we: balanço líquido (positivo = ganho, negativo = perda);
 *   balanceRatio: ablação / acumulação (> 1 = geleira em retração)
 */
export function calcNetMassBalance(accumulation_mm_we: any, ablation_mm_we: any) {
    if (typeof accumulation_mm_we !== 'number' || accumulation_mm_we < 0) {
        throw new RangeError('accumulation_mm_we deve ser número >= 0');
    }
    if (typeof ablation_mm_we !== 'number' || ablation_mm_we < 0) {
        throw new RangeError('ablation_mm_we deve ser número >= 0');
    }

    const netBalance_mm_we = accumulation_mm_we - ablation_mm_we;
    // Razão de balanço: evita divisão por zero quando acumulação = 0
    const balanceRatio = accumulation_mm_we > 0 ? ablation_mm_we / accumulation_mm_we : Infinity;

    return { netBalance_mm_we, balanceRatio };
}

/**
 * Classifica o status de saúde da geleira com base no balanço de massa líquido.
 * Limiares baseados em Zemp et al. (2019) e critérios WGMS para avaliação
 * de tendências de longo prazo.
 *
 * @param {number} netBalance_mm_we - Balanço líquido anual (mm w.e./ano)
 * @returns {{ status: string, description: string, trend: string }}
 *   status: 'growing' | 'stable' | 'retreating' | 'collapsing'
 *   trend: 'positive' | 'neutral' | 'negative' | 'critical'
 */
export function classifyGlacierHealthStatus(netBalance_mm_we: any) {
    if (typeof netBalance_mm_we !== 'number') {
        throw new TypeError('netBalance_mm_we deve ser número (mm w.e./ano)');
    }

    // Limiares de classificação (mm w.e./ano) - Zemp et al. (2019) e WGMS
    if (netBalance_mm_we > 100) {
        return {
            status: 'growing',
            description: 'Crescendo — balanço positivo expressivo (> +100 mm w.e./ano)',
            trend: 'positive',
        };
    }
    if (netBalance_mm_we >= -100) {
        return {
            status: 'stable',
            description: 'Estável — balanço próximo a zero (−100 a +100 mm w.e./ano)',
            trend: 'neutral',
        };
    }
    if (netBalance_mm_we >= -600) {
        return {
            status: 'retreating',
            description: 'Recuando — perda moderada de massa (−600 a −100 mm w.e./ano)',
            trend: 'negative',
        };
    }
    return {
        status: 'collapsing',
        description: 'Em colapso — perda acelerada de massa (< −600 mm w.e./ano)',
        trend: 'critical',
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const glacierMassBalanceModelMeta = {
    name: 'glacierMassBalanceModel',
    description: 'Glacier Mass Balance Model',
    category: 'analytics',
    familyTags: ['glacier'],
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
