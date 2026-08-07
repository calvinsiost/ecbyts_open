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
 * Water Quality Trends - análise de tendências temporais para parâmetros de qualidade de água.
 *
 * Referências acadêmicas:
 * - Mann, H.B. (1945). Nonparametric tests against trend. Econometrica, 13(3), 245-259.
 *   DOI:10.1002/9780471667179.wbs.0060
 * - Sen, P.K. (1968). Estimates of the regression coefficient based on Kendall's tau.
 *   Journal of the American Statistical Association, 63(324), 1379-1389.
 *   DOI:10.1080/01621459.1968.10480934
 */

/**
 * Computes ordinary least squares (OLS) linear regression for a water quality time series.
 * Regressão linear simples para detectar tendência temporal em qualidade de água.
 *
 * @param {number[]} values - Medições do parâmetro (ex: concentração em mg/L)
 * @param {number[]} times  - Instantes de tempo correspondentes (anos decimais ou índices)
 * @returns {{ slope: number, intercept: number, r2: number }}
 *   slope = variação por unidade de tempo; r2 = coeficiente de determinação [0,1]
 * @throws {TypeError} Se os argumentos não forem arrays numéricos
 * @throws {RangeError} Se os arrays tiverem comprimentos diferentes ou < 2 elementos
 */
export function computeLinearTrend(values: any, times: any) {
    if (!Array.isArray(values) || !Array.isArray(times)) {
        throw new TypeError('computeLinearTrend: values and times must be arrays');
    }
    if (values.length !== times.length) {
        throw new RangeError('computeLinearTrend: values and times must have the same length');
    }
    if (values.length < 2) {
        throw new RangeError('computeLinearTrend: at least 2 data points required');
    }
    const n = values.length;
    let sumX = 0,
        sumY = 0,
        sumXY = 0,
        sumX2 = 0,
        sumY2 = 0;
    for (let i = 0; i < n; i++) {
        const x = times[i];
        const y = values[i];
        if (typeof x !== 'number' || !isFinite(x))
            throw new TypeError(`computeLinearTrend: times[${i}] is not a finite number`);
        if (typeof y !== 'number' || !isFinite(y))
            throw new TypeError(`computeLinearTrend: values[${i}] is not a finite number`);
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
        // eslint-disable-next-line
        sumY2 += y * y;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-15) {
        // Todos os tempos iguais - slope indefinida, retorna zero com r2=0
        return { slope: 0, intercept: sumY / n, r2: 0 };
    }
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    // r2 = correlação ao quadrado
    const meanY = sumY / n;
    let ssTot = 0,
        ssRes = 0;
    for (let i = 0; i < n; i++) {
        const predicted = slope * times[i] + intercept;
        ssTot += (values[i] - meanY) ** 2;
        ssRes += (values[i] - predicted) ** 2;
    }
    const r2 = ssTot < 1e-15 ? 1 : Math.max(0, 1 - ssRes / ssTot);
    return { slope, intercept, r2 };
}

/**
 * Decomposes a monthly time series into seasonal indices and trend component
 * using the ratio-to-moving-average method (12-month centered moving average).
 * Decomposição sazonal clássica - separa efeito de sazonalidade da tendência de longo prazo.
 *
 * @param {number[]} monthly_values - Array com múltiplos de 12 valores mensais (≥24)
 * @returns {{ seasonal_indices: number[], trend_component: number[] }}
 *   seasonal_indices: 12 índices sazonais (média = 1.0); trend_component: tendência suavizada
 * @throws {TypeError} Se monthly_values não for array numérico
 * @throws {RangeError} Se o array tiver menos de 24 elementos ou comprimento não múltiplo de 12
 */
export function computeSeasonalDecomposition(monthly_values: any) {
    if (!Array.isArray(monthly_values)) {
        throw new TypeError('computeSeasonalDecomposition: monthly_values must be an array');
    }
    if (monthly_values.length < 24) {
        throw new RangeError('computeSeasonalDecomposition: at least 24 monthly values required (2 full years)');
    }
    for (let i = 0; i < monthly_values.length; i++) {
        if (typeof monthly_values[i] !== 'number' || !isFinite(monthly_values[i])) {
            throw new TypeError(`computeSeasonalDecomposition: monthly_values[${i}] is not a finite number`);
        }
    }
    const n = monthly_values.length;
    // Calcula média móvel centrada de 12 meses (CMA-12)
    const trend_component = new Array(n).fill(null);
    for (let i = 6; i < n - 6; i++) {
        // CMA-12: média de 13 pontos com pesos 0.5 nas extremidades
        let sum = 0.5 * monthly_values[i - 6] + 0.5 * monthly_values[i + 6];
        for (let j = i - 5; j <= i + 5; j++) sum += monthly_values[j];
        trend_component[i] = sum / 12;
    }
    // Calcula razoes mes/tendencia para cada mes do ano
    /** @type {number[][]} */
    const ratios = Array.from({ length: 12 }, () => /** @type {number[]} */ ([]));
    for (let i = 6; i < n - 6; i++) {
        const t = trend_component[i];
        if (t && Math.abs(t) > 1e-15) {
(ratios[i % 12] as number[]).push(monthly_values[i] / t);
        }
    }
    // Indice sazonal = mediana das razoes para cada mes (robusto a outliers)
    const seasonal_indices = ratios.map((arr) => {
        if (arr.length === 0) return 1;
        /** @type {number[]} */
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
// eslint-disable-next-line
const mid_val = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
    });
    // Normaliza para média = 1.0
    const mean_idx = seasonal_indices.reduce((s, v) => s + (v ?? 0), 0) / 12;
    const normalized = seasonal_indices.map((v) => (mean_idx > 1e-15 ? (v as number) / mean_idx : 1));
    return {
        seasonal_indices: normalized,
        trend_component: trend_component.map((v) => (v === null ? NaN : v)),
    };
}

/**
 * Student's t-test for significance of a linear trend slope.
 * Teste t para avaliar se a tendência temporal é estatisticamente significativa (α=0.05, bicaudal).
 * Referência: Mann (1945) DOI:10.1002/9780471667179.wbs.0060
 *
 * @param {number} df      - Inclinação da regressão
 * @param {number} std_error  - Erro padrão do slope (> 0)
 * @param {number} n          - Número de observações (inteiro ≥ 3)
 * @returns {{ t_stat: number, significant: boolean }}
 *   t_stat = slope/std_error; significant se |t_stat| > t_critical (df = n-2)
 * @throws {TypeError} Se argumentos não forem números
 * @throws {RangeError} Se std_error ≤ 0 ou n < 3
 */
function _tCriticalForDf(df: number): number {
    if (df >= 120) return 1.98;
    if (df >= 60) return 2.0;
    if (df >= 40) return 2.021;
    if (df >= 30) return 2.042;
    if (df >= 25) return 2.06;
    if (df >= 20) return 2.086;
    if (df >= 15) return 2.131;
    if (df >= 10) return 2.228;
    if (df >= 5) return 2.571;
    if (df >= 3) return 3.182;
    return 12.706; // df=1
}

export function computeTrendSignificance(slope: any, std_error: any, n: any) {
    if (typeof slope !== 'number' || typeof std_error !== 'number' || typeof n !== 'number') {
        throw new TypeError('computeTrendSignificance: all arguments must be numbers');
    }
    if (std_error <= 0) {
        throw new RangeError('computeTrendSignificance: std_error must be > 0');
    }
    if (!Number.isInteger(n) || n < 3) {
        throw new RangeError('computeTrendSignificance: n must be an integer >= 3');
    }
    const t_stat = slope / std_error;
    const df = n - 2;
    const t_critical = _tCriticalForDf(df);
    const significant = Math.abs(t_stat) > t_critical;
    return { t_stat, significant };
}

/**
 * Classifies the direction and severity of a water quality trend.
 * Classifica a tendência de qualidade de água com base no slope normalizado pelo baseline.
 *
 * @param {number} slope    - Inclinação da tendência (unidade/ano)
 * @param {number} baseline - Valor de referência (baseline > 0)
 * @returns {{ trend: 'improving'|'stable'|'degrading'|'critical' }}
 * @throws {TypeError} Se argumentos não forem números
 * @throws {RangeError} Se baseline ≤ 0
 */
export function classifyWaterQualityTrend(slope: any, baseline: any) {
    if (typeof slope !== 'number' || typeof baseline !== 'number') {
        throw new TypeError('classifyWaterQualityTrend: slope and baseline must be numbers');
    }
    if (baseline <= 0) {
        throw new RangeError('classifyWaterQualityTrend: baseline must be > 0');
    }
    const relative = slope / baseline;
    // Limites definidos por critério de gestão ambiental (variação relativa anual)
    if (relative < -0.05) return { trend: 'improving' };
    if (relative < 0.02) return { trend: 'stable' };
    if (relative < 0.1) return { trend: 'degrading' };
    return { trend: 'critical' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const waterQualityTrendsMeta = {
    name: 'waterQualityTrends',
    description: 'waterQualityTrends',
    category: 'analytics',
    familyTags: ['water'],
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
