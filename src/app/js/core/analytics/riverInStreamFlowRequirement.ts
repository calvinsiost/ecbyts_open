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
// Application: EHS & Mining - River In-Stream Flow Requirement
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

interface TennantValue {
    wet: number;
    dry: number;
}

interface TennantTable {
    [key: string]: TennantValue;
}

interface CalcTennantFlowPercentResult {
    ecologicalFlow_m3_s: number;
    percentOfMAF: number;
    habitatCategory: string;
    season: string;
}

interface CalcQ7_10LowFlowResult {
    Q7_10_m3_s: number;
    meanLnQ: number;
    stdLnQ: number;
    sampleSize: number;
}

interface CalcHabitatSuitabilityIndexResult {
    HSI: number;
    flowRatio: number;
    percentOfMinimum: number;
    isAboveMinimum: boolean;
}

interface AdequacyClassResult {
    adequacyClass: 'CRITICAL' | 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT';
    percentOfMAF: number;
    percentOfQ7_10: number;
    tennantCategory: string;
    regulatoryCompliant: boolean;
    description: string;
}

const TENNANT_TABLE: TennantTable = {
    FLUSHING: { wet: 2.0, dry: 2.0 }, // vazão de limpeza (200% MAF = extraordinary)
    OUTSTANDING: { wet: 0.6, dry: 0.4 }, // excepcional
    EXCELLENT: { wet: 0.5, dry: 0.3 }, // excelente
    GOOD: { wet: 0.4, dry: 0.2 }, // bom
    FAIR: { wet: 0.3, dry: 0.1 }, // razoável
    DEGRADED: { wet: 0.2, dry: 0.1 }, // degradado mas utilizável
    SEVERE_DEGRADE: { wet: 0.1, dry: 0.1 }, // severamente degradado
    MINIMUM: { wet: 0.1, dry: 0.1 }, // mínimo absoluto
};

/**
 * Calcula a vazão mínima ecológica pelo método de Tennant (1976).
 *
 * Calculate minimum ecological flow using Tennant (1976) method.
 * Q_eco = MAF × percentual_Tennant(categoria, estação)
 *
 * @param {number} meanAnnualFlow_m3_s  - vazão média anual do rio (m³/s), > 0
 * @param {string} habitatCategory      - categoria de habitat (chave de TENNANT_TABLE)
 * @param {'wet'|'dry'} season          - estação: 'wet' (out-mar) ou 'dry' (abr-set)
 * @returns {CalcTennantFlowPercentResult}
 * @throws {TypeError} se parâmetros tiverem tipo inválido
 * @throws {RangeError} se meanAnnualFlow_m3_s ≤ 0
 * @throws {Error} se habitatCategory ou season forem inválidos
 */
export function calcTennantFlowPercent(meanAnnualFlow_m3_s: number, habitatCategory: string = 'FAIR', season: 'wet' | 'dry' = 'dry'): CalcTennantFlowPercentResult {
    if (typeof meanAnnualFlow_m3_s !== 'number') {
        throw new TypeError('calcTennantFlowPercent: meanAnnualFlow_m3_s deve ser número');
    }
    if (meanAnnualFlow_m3_s <= 0) {
        throw new RangeError('calcTennantFlowPercent: vazão média anual deve ser > 0');
    }
    if (!Object.prototype.hasOwnProperty.call(TENNANT_TABLE, habitatCategory)) {
        throw new Error(
            `calcTennantFlowPercent: habitatCategory inválida. Use: ${Object.keys(TENNANT_TABLE).join(', ')}`,
        );
    }
    if (season !== 'wet' && season !== 'dry') {
        throw new Error("calcTennantFlowPercent: season deve ser 'wet' ou 'dry'");
    }

    // Percentual da vazão média anual para a categoria e estação
    const percentFraction = (TENNANT_TABLE as any)[habitatCategory][season];
    const ecologicalFlow_m3_s = meanAnnualFlow_m3_s * percentFraction;

    return {
        ecologicalFlow_m3_s,
        percentOfMAF: percentFraction * 100,
        habitatCategory,
        season,
    };
}

/**
 * Estima a vazão de referência Q7,10 (mínima de 7 dias consecutivos com período
 * de retorno de 10 anos) por análise de frequência simplificada com distribuição
 * log-Pearson III (aproximação via momentos L).
 *
 * Estimate Q7,10 (7-day minimum flow with 10-year return period) using simplified
 * frequency analysis. Log-Pearson III approximation via method of L-moments.
 * Q7,10 = exp(μ_ln - z_0.10 * σ_ln)  [normal-log simplificada para skew≈0]
 * Smakhtin (2001), ANA (2019 - critério outorga CNRH 37/2004).
 *
 * @param {number[]} annualMinFlows_m3_s  - série de mínimos anuais de 7 dias (m³/s), ≥ 2 valores, todos > 0
 * @returns {CalcQ7_10LowFlowResult}
 * @throws {TypeError} se annualMinFlows_m3_s não for array de números
 * @throws {RangeError} se série tiver menos de 2 valores ou valores ≤ 0
 */
export function calcQ7_10LowFlow(annualMinFlows_m3_s: number[]): CalcQ7_10LowFlowResult {
    if (!Array.isArray(annualMinFlows_m3_s)) {
        throw new TypeError('calcQ7_10LowFlow: annualMinFlows_m3_s deve ser um array');
    }
    if (annualMinFlows_m3_s.length < 2) {
        throw new RangeError('calcQ7_10LowFlow: necessário ao menos 2 anos de dados');
    }
    for (const val of annualMinFlows_m3_s) {
        if (typeof val !== 'number' || val <= 0) {
            throw new RangeError('calcQ7_10LowFlow: todos os valores devem ser números > 0');
        }
    }

    const n = annualMinFlows_m3_s.length;

    // Log-transformação da série de mínimos anuais
    // Log-transform the annual minimum flow series
    const lnValues = annualMinFlows_m3_s.map((q) => Math.log(q));

    // Média e desvio padrão dos logaritmos
    const meanLnQ = lnValues.reduce((sum, v) => sum + v, 0) / n;
    const variance = lnValues.reduce((sum, v) => sum + (v - meanLnQ) ** 2, 0) / (n - 1);
    const stdLnQ = Math.sqrt(variance);

    // Para T = 10 anos, probabilidade de excedência = 0.10
    // Fator KT para distribuição log-normal (z_0.10 = -1.2816 para F=0.10 exceedance)
    // KT = -1.2816 é o quantil da normal padrão para probabilidade de não-excedência de 10%
    const KT = -1.2816; // z_{0.10} para T=10 anos (mínimos: exceedance prob = 1/T em fluxo mínimo)
    // Para mínimos: Q7_10 = exp(meanLnQ + KT * stdLnQ) onde KT<0 dá o quantil baixo
    const Q7_10_m3_s = Math.exp(meanLnQ + KT * stdLnQ);

    return {
        Q7_10_m3_s,
        meanLnQ,
        stdLnQ,
        sampleSize: n,
    };
}

/**
 * Calcula o índice de adequação de habitat em função da razão entre a vazão
 * atual e a vazão mínima ecológica requerida (Tennant ou Q7,10).
 *
 * Calculate habitat suitability index (HSI) based on the ratio between actual
 * flow and required minimum ecological flow.
 * HSI = min(1, Q_atual / Q_min_eco) com ajuste por curva sigmoidal.
 * Baseado em Richter et al. (1997) e adaptado para gestão de outorgas.
 *
 * @param {number} actualFlow_m3_s       - vazão atual medida (m³/s), ≥ 0
 * @param {number} minEcologicalFlow_m3_s - vazão mínima ecológica (m³/s), > 0
 * @returns {CalcHabitatSuitabilityIndexResult}
 * @throws {TypeError} se parâmetros não forem números
 * @throws {RangeError} se valores estiverem fora dos limites
 */
export function calcHabitatSuitabilityIndex(actualFlow_m3_s: number, minEcologicalFlow_m3_s: number): CalcHabitatSuitabilityIndexResult {
    if (typeof actualFlow_m3_s !== 'number' || typeof minEcologicalFlow_m3_s !== 'number') {
        throw new TypeError('calcHabitatSuitabilityIndex: parâmetros devem ser números');
    }
    if (actualFlow_m3_s < 0) {
        throw new RangeError('calcHabitatSuitabilityIndex: vazão atual deve ser ≥ 0');
    }
    if (minEcologicalFlow_m3_s <= 0) {
        throw new RangeError('calcHabitatSuitabilityIndex: vazão mínima ecológica deve ser > 0');
    }

    const flowRatio = actualFlow_m3_s / minEcologicalFlow_m3_s;

    // Curva sigmoidal suavizada: HSI = flowRatio² / (1 + flowRatio²) para Q < Q_min
    // Para Q ≥ Q_min: HSI = 1.0 (habitat pleno)
    // Abaixo do mínimo: função crescente que vai a 0 quando Q→0 e a 0.5 quando Q = Q_min
    let HSI: number;
    if (flowRatio >= 1) {
        HSI = 1.0;
    } else {
        // Curva sigmoidal escalada para [0, 0.5) quando ratio < 1
        // garantindo continuidade em ratio = 1 (HSI → 0.5 abaixo, HSI = 1 acima)
        HSI = (flowRatio * flowRatio) / (1 + flowRatio * flowRatio);
        // Re-escala para [0, 1] de forma que ratio=1 produza HSI=1
        HSI = HSI * 2; // = 2r²/(1+r²), máximo de 1 quando r=1
        HSI = Math.min(HSI, 1);
    }

    return {
        HSI,
        flowRatio,
        percentOfMinimum: flowRatio * 100,
        isAboveMinimum: actualFlow_m3_s >= minEcologicalFlow_m3_s,
    };
}

/**
 * Classifica a adequação ecológica do fluxo hídrico em uma seção de rio,
 * combinando o método de Tennant e o critério Q7,10.
 *
 * Classify ecological flow adequacy for a river section, combining Tennant
 * method and Q7,10 criterion per Brazilian regulation (CNRH 37/2004).
 *
 * @param {number} actualFlow_m3_s       - vazão atual medida (m³/s), ≥ 0
 * @param {number} meanAnnualFlow_m3_s   - vazão média anual (m³/s), > 0
 * @param {number} Q7_10_m3_s            - vazão Q7,10 de referência (m³/s), > 0
 * @returns {AdequacyClassResult}
 * @throws {TypeError} se parâmetros não forem números
 * @throws {RangeError} se valores estiverem fora dos limites
 */
export function classifyEcologicalFlowAdequacy(actualFlow_m3_s: number, meanAnnualFlow_m3_s: number, Q7_10_m3_s: number): AdequacyClassResult {
    if (
        typeof actualFlow_m3_s !== 'number' ||
        typeof meanAnnualFlow_m3_s !== 'number' ||
        typeof Q7_10_m3_s !== 'number'
    ) {
        throw new TypeError('classifyEcologicalFlowAdequacy: parâmetros devem ser números');
    }
    if (actualFlow_m3_s < 0) {
        throw new RangeError('classifyEcologicalFlowAdequacy: vazão atual deve ser ≥ 0');
    }
    if (meanAnnualFlow_m3_s <= 0 || Q7_10_m3_s <= 0) {
        throw new RangeError('classifyEcologicalFlowAdequacy: MAF e Q7,10 devem ser > 0');
    }

    const percentOfMAF = (actualFlow_m3_s / meanAnnualFlow_m3_s) * 100;
    const percentOfQ7_10 = (actualFlow_m3_s / Q7_10_m3_s) * 100;

    // Conformidade regulatória: Q_atual ≥ Q7,10 (critério CNRH 37/2004 para outorgas)
    const regulatoryCompliant = actualFlow_m3_s >= Q7_10_m3_s;

    // Classificação de adequação ecológica baseada em % do MAF (Tennant 1976)
    let adequacyClass: 'CRITICAL' | 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT';
    let tennantCategory: string;
    let description: string;

    if (percentOfMAF >= 40) {
        adequacyClass = 'EXCELLENT';
        tennantCategory = 'GOOD_OUTSTANDING';
        description = 'Fluxo excelente para habitat aquático. Suporte completo à biota.';
    } else if (percentOfMAF >= 30) {
        adequacyClass = 'GOOD';
        tennantCategory = 'GOOD';
        description = 'Fluxo adequado. Habitat de boa qualidade para peixes e vida silvestre.';
    } else if (percentOfMAF >= 10) {
        adequacyClass = 'FAIR';
        tennantCategory = 'FAIR_DEGRADED';
        description = 'Fluxo razoável. Habitat degradado mas sustentável para uso mínimo.';
    } else if (percentOfMAF >= 5) {
        adequacyClass = 'POOR';
        tennantCategory = 'SEVERE_DEGRADE';
        description = 'Fluxo insuficiente. Habitat severamente comprometido. Intervenção recomendada.';
    } else {
        adequacyClass = 'CRITICAL';
        tennantCategory = 'MINIMUM';
        description = 'Fluxo crítico. Risco de colapso ecológico. Medidas emergenciais necessárias.';
    }

    return {
        adequacyClass,
        percentOfMAF,
        percentOfQ7_10,
        tennantCategory,
        regulatoryCompliant,
        description,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const riverInStreamFlowRequirementMeta = {
    name: 'riverInStreamFlowRequirement',
    description: 'River In-Stream Flow Requirement',
    category: 'analytics',
    familyTags: ['river'],
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
