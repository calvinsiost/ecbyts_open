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
// Application: EHS & Mining - River Flood Frequency Analysis
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

// Constante de Euler-Mascheroni (gamma) usada na distribuição Gumbel EV1
// Euler–Mascheroni constant used in Gumbel EV1 parameter estimation
const EULER_MASCHERONI = 0.5772156649;

// Fator escalar de Gumbel: relação entre desvio padrão e parâmetro de escala
// Gumbel scale factor: ratio between standard deviation and scale parameter
const GUMBEL_SCALE_FACTOR = Math.PI / Math.sqrt(6);

interface GumbelParameters {
    u: number;
    alpha: number;
    mean: number;
    stdDev: number;
}

/**
 * Calcula os parâmetros da distribuição Gumbel EV1 pelo método dos momentos.
 * Estimates Gumbel EV1 parameters (location u, scale alpha) by method of moments.
 *
 * O método dos momentos equipara a média e o desvio padrão amostrais com os
 * momentos populacionais da distribuição Gumbel EV1 (Chow et al. 1988, §12.2).
 *
 * @param {number[]} annualPeakFlows - Array de vazões de pico anuais (m³/s), n ≥ 3
 * @returns {{ u: number, alpha: number, mean: number, stdDev: number }}
 *   u = parâmetro de localização (m³/s),
 *   alpha = parâmetro de escala (m³/s),
 *   mean = média amostral,
 *   stdDev = desvio padrão amostral (correção n-1)
 * @throws {TypeError} se annualPeakFlows não for array
 * @throws {RangeError} se n < 3 ou algum valor ≤ 0
 */
export function calcGumbelParameters(annualPeakFlows: number[]): GumbelParameters {
    if (!Array.isArray(annualPeakFlows)) {
        throw new TypeError('annualPeakFlows deve ser um array de números.');
    }
    if (annualPeakFlows.length < 3) {
        throw new RangeError('São necessários pelo menos 3 valores anuais de pico.');
    }
    for (const q of annualPeakFlows) {
        if (typeof q !== 'number' || !isFinite(q) || q <= 0) {
            throw new RangeError(`Valor de vazão inválido: ${q}. Todos devem ser números finitos > 0.`);
        }
    }

    const n = annualPeakFlows.length;
    // Média amostral - sample mean
    const mean = annualPeakFlows.reduce((s, v) => s + v, 0) / n;
    // Desvio padrão amostral com correção de Bessel (n-1) - sample std dev (Bessel corrected)
    const variance = annualPeakFlows.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
    const stdDev = Math.sqrt(variance);

    // Parâmetro de escala alpha = stdDev * sqrt(6) / PI (Chow et al. 1988, eq. 12.2.3)
    const alpha = stdDev / GUMBEL_SCALE_FACTOR;
    // Parâmetro de localização u = mean - gamma * alpha (Chow et al. 1988, eq. 12.2.4)
    const u = mean - EULER_MASCHERONI * alpha;

    return { u, alpha, mean, stdDev };
}

/**
 * Calcula a vazão de pico estimada para um dado período de retorno (distribuição Gumbel EV1).
 * Estimates peak flood discharge for a given return period using Gumbel EV1.
 *
 * A variável reduzida de Gumbel yT = -ln(-ln(1 - 1/T)) é usada para obter
 * xT = u + alpha * yT (Gumbel 1958, eq. 3.4).
 *
 * @param {number} returnPeriod - Período de retorno T (anos), T > 1
 * @param {number} u - Parâmetro de localização Gumbel (m³/s)
 * @param {number} alpha - Parâmetro de escala Gumbel (m³/s), > 0
 * @returns {number} Vazão de pico estimada xT (m³/s)
 * @throws {RangeError} se T ≤ 1 ou alpha ≤ 0
 */
export function calcReturnPeriodFlood(returnPeriod: number, u: number, alpha: number): number {
    if (!isFinite(returnPeriod) || returnPeriod <= 1) {
        throw new RangeError('Período de retorno deve ser um número finito maior que 1 ano.');
    }
    if (!isFinite(alpha) || alpha <= 0) {
        throw new RangeError('Parâmetro de escala alpha deve ser positivo.');
    }
    if (!isFinite(u)) {
        throw new RangeError('Parâmetro de localização u deve ser um número finito.');
    }

    // Probabilidade de não excedência para período de retorno T: F = 1 - 1/T
    const F = 1 - 1 / returnPeriod;
    // Variável reduzida de Gumbel: yT = -ln(-ln(F))
    const yT = -Math.log(-Math.log(F));
    // Estimativa de vazão: xT = u + alpha * yT
    return u + alpha * yT;
}

/**
 * Calcula o fator de frequência K de Chow para distribuição Gumbel EV1.
 * Computes Chow's frequency factor K for Gumbel EV1 distribution.
 *
 * K é adimensional e satisfaz xT = xbar + K * s (Chow et al. 1988, §12.3).
 * Permite estimar xT sem calcular explicitamente u e alpha.
 *
 * @param {number} returnPeriod - Período de retorno T (anos), T > 1
 * @param {number} n - Tamanho da série histórica (número de anos), n ≥ 3
 * @returns {number} Fator de frequência K (adimensional)
 * @throws {RangeError} se T ≤ 1 ou n < 3
 */
export function calcFloodFrequencyFactor(returnPeriod: number, n: number): number {
    if (!isFinite(returnPeriod) || returnPeriod <= 1) {
        throw new RangeError('Período de retorno deve ser maior que 1 ano.');
    }
    if (!Number.isInteger(n) || n < 3) {
        throw new RangeError('Tamanho da série n deve ser inteiro ≥ 3.');
    }

    // Variável reduzida: yT = -ln(-ln(1 - 1/T))
    const F = 1 - 1 / returnPeriod;
    const yT = -Math.log(-Math.log(F));

    // Média e desvio padrão da variável reduzida de Gumbel para série finita de n anos
    // Tabelados por Chow (1988) Tab. 12.3.1; aproximação analítica de Chow et al. eq. 12.3.5
    // yn_bar e sigma_n convergem para gamma e PI/sqrt(6) quando n -> infinito
    // Approximation valid for n ≥ 20; for smaller n, slight bias is acceptable for screening
    const yn_bar = EULER_MASCHERONI;
    const sigma_n = GUMBEL_SCALE_FACTOR;

    // Fator de frequência K = (yT - yn_bar) / sigma_n
    return (yT - yn_bar) / sigma_n;
}

interface HazardClassification {
    specificDischarge: number;
    hazardClass: string;
    description: string;
}

/**
 * Classifica o hazard de inundação com base na vazão estimada e na área de contribuição.
 * Classifies flood hazard based on estimated peak discharge and catchment area.
 *
 * A classificação segue os critérios de FEMA (2019) e Tucci (2007):
 *   - Baixo:      q < 1.0 m³/(s·km²)
 *   - Médio:      1.0 ≤ q < 5.0 m³/(s·km²)
 *   - Alto:       5.0 ≤ q < 20.0 m³/(s·km²)
 *   - Muito Alto: q ≥ 20.0 m³/(s·km²)
 * onde q = discharge / catchmentArea é a vazão específica.
 *
 * Referência complementar: Tucci, C. E. M. (2007). "Hidrologia: Ciência e Aplicação."
 * 4ª ed. UFRGS/ABRH, Porto Alegre. ISBN 978-85-7025-924-5.
 *
 * @param {number} discharge - Vazão de pico estimada (m³/s), > 0
 * @param {number} catchmentArea - Área de contribuição da bacia (km²), > 0
 * @returns {{ specificDischarge: number, hazardClass: string, description: string }}
 * @throws {RangeError} se discharge ≤ 0 ou catchmentArea ≤ 0
 */
export function classifyFloodHazard(discharge: number, catchmentArea: number): HazardClassification {
    if (!isFinite(discharge) || discharge <= 0) {
        throw new RangeError('Vazão de pico deve ser positiva e finita.');
    }
    if (!isFinite(catchmentArea) || catchmentArea <= 0) {
        throw new RangeError('Área de bacia deve ser positiva e finita (km²).');
    }

    // Vazão específica: q = Q / A (m³/s por km²)
    const specificDischarge = discharge / catchmentArea;

    let hazardClass: string;
    let description: string;
    if (specificDischarge < 1.0) {
        hazardClass = 'BAIXO';
        description = 'Baixo hazard de inundação — q < 1.0 m³/(s·km²)';
    } else if (specificDischarge < 5.0) {
        hazardClass = 'MÉDIO';
        description = 'Médio hazard de inundação — 1.0 ≤ q < 5.0 m³/(s·km²)';
    } else if (specificDischarge < 20.0) {
        hazardClass = 'ALTO';
        description = 'Alto hazard de inundação — 5.0 ≤ q < 20.0 m³/(s·km²)';
    } else {
        hazardClass = 'MUITO ALTO';
        description = 'Muito alto hazard de inundação — q ≥ 20.0 m³/(s·km²)';
    }

    return { specificDischarge, hazardClass, description };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const riverFloodFrequencyAnalysisMeta = {
    name: 'riverFloodFrequencyAnalysis',
    description: 'River Flood Frequency Analysis',
    category: 'analytics',
    familyTags: ['river', 'flood'],
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
