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
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Temporal Trend Detection - Pure-logic, no DOM, no IDB, no Three.js
 *
 * Detecta tendências em séries temporais ambientais usando métodos não-paramétricos
 * rigorosos com proveniência acadêmica documentada.
 *
 * Referências acadêmicas:
 *   - Mann, H.B. (1945) "Nonparametric tests against trend", Econometrica, 13(3),
 *     pp. 245–259. DOI: 10.2307/1907187
 *   - Kendall, M.G. (1975) "Rank Correlation Methods" 4th ed., Charles Griffin,
 *     London. ISBN 978-0-85264-199-6
 *   - Hirsch, R.M. & Slack, J.R. (1984) "A nonparametric trend test for seasonal
 *     data with serial dependence", Water Resources Research, 20(6), pp. 727–732.
 *     DOI: 10.1029/WR020i006p00727
 *   - Sen, P.K. (1968) "Estimates of the regression coefficient based on Kendall's
 *     tau", Journal of the American Statistical Association, 63(324), pp. 1379–1389.
 *     DOI: 10.2307/2285891
 *   - Pettitt, A.N. (1979) "A Non-Parametric Approach to the Change-Point Problem",
 *     Applied Statistics, 28(2), pp. 126–135. DOI: 10.2307/2346729
 *   - Abramowitz, M. & Stegun, I.A. (1964) Handbook of Mathematical Functions,
 *     §26.2.17 - polynomial approximation for normal CDF used in pValueApprox.
 *   - Holt, C.C. (1957/2004) "Forecasting seasonals and trends by exponentially
 *     weighted moving averages", International Journal of Forecasting, 20(1),
 *     pp. 5–10. DOI: 10.1016/j.ijforecast.2003.09.015 (reprint do ONR memo 1957).
 *   - Hyndman, R.J. & Athanasopoulos, G. (2021) "Forecasting: Principles and
 *     Practice" 3rd ed., OTexts, §8.2 (Holt's linear trend method). ISBN
 *     978-0-9875071-3-6. URL: https://otexts.com/fpp3/holt.html
 */

// ---------------------------------------------------------------------------
// INTERNAL HELPERS
// ---------------------------------------------------------------------------

/**
 * Retorna o sinal de x: -1, 0 ou 1.
 * @param {number} x
 * @returns {-1|0|1}
 */
function sign(x: number): -1|0|1 {
    if (x > 0) return 1;
    if (x < 0) return -1;
    return 0;
}

/**
 * Mediana de um array numérico (não modifica o original).
 * @param {number[]} arr
 * @returns {number}
 */
function median(arr: number[]): number {
    if (arr.length === 0) return NaN;
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Aproximação polinomial da CDF normal padrão (Abramowitz & Stegun §26.2.17).
 * Calcula P(Z ≤ z) para z >= 0; usa simetria para z < 0.
 * @param {number} z
 * @returns {number} p-value de cauda única [0, 1]
 */
function normalCDF(z: number): number {
    const absZ = Math.abs(z);
    // Abramowitz & Stegun §26.2.17 - máx erro ≤ 7.5e-8
    const t = 1 / (1 + 0.2316419 * absZ);
    const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const cdf = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * absZ * absZ) * poly;
    return z >= 0 ? cdf : 1 - cdf;
}

/**
 * p-value bicaudal a partir de z-score (distribuição normal padrão).
 * @param {number} z
 * @returns {number} p in (0, 1]
 */
function normalCDFTwoTailed(z: number): number {
    return 2 * (1 - normalCDF(Math.abs(z)));
}

/**
 * Retorna uma string de intervalo de p-value para comunicação legível.
 * Brackets padronizados para relatórios ambientais.
 * @param {number} p
 * @returns {string}
 */
function pValueBracket(p: number): string {
    if (p < 0.001) return 'p < 0.001';
    if (p < 0.01) return 'p < 0.010';
    if (p < 0.05) return 'p < 0.050';
    if (p < 0.1) return 'p < 0.100';
    return 'p > 0.10';
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Calcula o teste de Mann-Kendall para tendência monotônica não-paramétrica.
 *
 * Mann (1945) + Kendall (1975): detecta se uma série temporal exibe tendência
 * crescente ou decrescente de forma estatisticamente significativa.
 *
 * Equações:
 *   S = Σ_{i<j} sgn(x_j - x_i)
 *   varS = [n(n-1)(2n+5) - Σ_t t_k(t_k-1)(2t_k+5)] / 18
 *   zScore = (S - sgn(S)) / sqrt(varS)  [correção de continuidade]
 *   tau = S / [n(n-1)/2]
 *
 * @param {number[]} series - Série temporal em ordem cronológica
 * @returns {Readonly<{S: number, varS: number, zScore: number, pValueApprox: string,
 *           trend: string, tau: number, n: number}>}
 * @throws {RangeError} se n < 4
 */
export function computeMannKendallTrend(series: number[]): Readonly<{S: number, varS: number, zScore: number, pValueApprox: string, trend: string, tau: number, n: number}> {
    const n = series.length;
    if (n < 4) {
        throw new RangeError(`computeMannKendallTrend: n=${n} insuficiente — mínimo 4 observações necessárias`);
    }

    // Calcula S = soma de comparações sgn
    let S = 0;
    for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
            S += sign((series[j] as number) - (series[i] as number));
        }
    }

    // Identifica grupos de empates para correção de variância
    // Agrupa valores idênticos (tie groups)
    const valueCounts = new Map();
    for (const v of series) {
        valueCounts.set(v, (valueCounts.get(v) ?? 0) + 1);
    }

    // Correção de variância por empates (Kendall 1975, eq. para varS)
    // tieCorrection = Σ_k t_k(t_k-1)(2t_k+5) / 18  onde t_k = tamanho do grupo k
    let tieCorrection = 0;
    for (const [, tk] of valueCounts) {
        if (tk > 1) {
            tieCorrection += tk * (tk - 1) * (2 * tk + 5);
        }
    }

    const varS = (n * (n - 1) * (2 * n + 5) - tieCorrection) / 18;

    // z-score com correção de continuidade
    let zScore = 0;
    if (varS > 0) {
        zScore = (S - sign(S)) / Math.sqrt(varS);
    }

    const p = normalCDFTwoTailed(zScore);
    const pValueApprox = pValueBracket(p);

    // Classificação de tendência (α = 0.05)
    let trend;
    if (S > 0 && p < 0.05) {
        trend = 'increasing';
    } else if (S < 0 && p < 0.05) {
        trend = 'decreasing';
    } else {
        trend = 'no_trend';
    }

    // Tau de Kendall: normaliza S pelo número total de pares
    const tau = S / ((n * (n - 1)) / 2);

    return Object.freeze({ S, varS, zScore, pValueApprox, trend, tau, n });
}

/**
 * Calcula o teste sazonal de Mann-Kendall (Hirsch & Slack 1984).
 *
 * Extensão do MK para séries com sazonalidade: calcula MK por estação
 * e combina as estatísticas assumindo independência entre estações.
 *
 * Equações:
 *   S_total = Σ_m S_m
 *   varS_total = Σ_m varS_m
 *   zScore = (S_total - sgn(S_total)) / sqrt(varS_total)
 *
 * @param {Array<{value: number, season: number}>} series - Observações com estação (1..seasons)
 * @param {number} seasons - Número de estações por ano (ex: 4 trimestral, 12 mensal)
 * @returns {Readonly<{S_total: number, varS_total: number, zScore: number,
 *           pValueApprox: string, trend: string, n: number, nSeasons: number,
 *           seasonStats: ReadonlyArray<Readonly<{season: number, S: number, varS: number, n: number}>>}>}
 * @throws {RangeError} se n total < 4
 */
export function computeSeasonalMannKendall(series: Array<{value: number, season: number}>, seasons: number): Readonly<{S_total: number, varS_total: number, zScore: number, pValueApprox: string, trend: string, n: number, nSeasons: number, seasonStats: ReadonlyArray<Readonly<{season: number, S: number, varS: number, n: number}>>}> {
    const n = series.length;
    if (n < 4) {
        throw new RangeError(`computeSeasonalMannKendall: n=${n} insuficiente — mínimo 4 observações necessárias`);
    }

    // Agrupa observações por estação
        const bySeasonMap: Map<number, number[]>= new Map();
    for (let m = 1; m <= seasons; m++) {
        bySeasonMap.set(m, []);
    }
    for (const obs of series) {
        const s = obs.season;
        if (!bySeasonMap.has(s)) {
            bySeasonMap.set(s, []);
        }
        const bucket = bySeasonMap.get(s);
        if (bucket) bucket.push(obs.value);
    }

    let S_total = 0;
    let varS_total = 0;
        const seasonStats: Array<Readonly<{ season: number, S: number, varS: number, n: number }>>= [];

    for (let m = 1; m <= seasons; m++) {
        const vals = bySeasonMap.get(m) ?? [];
        const nm = vals.length;

        if (nm < 3) {
            if (nm > 0) {
                console.warn(
                    `computeSeasonalMannKendall: estação ${m} tem apenas ${nm} observações` +
                        ` (mínimo recomendado: 3) — estatísticas menos confiáveis`,
                );
            }
        }

        if (nm < 2) {
            seasonStats.push(Object.freeze({ season: m, S: 0, varS: 0, n: nm }));
            continue;
        }

        // MK para esta estação
        let Sm = 0;
        for (let i = 0; i < nm - 1; i++) {
            for (let j = i + 1; j < nm; j++) {
                Sm += sign((vals[j] as number) - (vals[i] as number));
            }
        }

        // Correção de variância por empates
        const valueCounts = new Map();
        for (const v of vals) {
            valueCounts.set(v, (valueCounts.get(v) ?? 0) + 1);
        }
        let tieCorrection = 0;
        for (const [, tk] of valueCounts) {
            if (tk > 1) {
                tieCorrection += tk * (tk - 1) * (2 * tk + 5);
            }
        }

        const varSm = (nm * (nm - 1) * (2 * nm + 5) - tieCorrection) / 18;

        S_total += Sm;
        varS_total += varSm;
        seasonStats.push(Object.freeze({ season: m, S: Sm, varS: varSm, n: nm }));
    }

    // Estações não presentes nos dados retornam {S:0, varS:0, n:0} - já cobertas acima

    let zScore = 0;
    if (varS_total > 0) {
        zScore = (S_total - sign(S_total)) / Math.sqrt(varS_total);
    }

    const p = normalCDFTwoTailed(zScore);
    const pValueApprox = pValueBracket(p);

    let trend;
    if (S_total > 0 && p < 0.05) {
        trend = 'increasing';
    } else if (S_total < 0 && p < 0.05) {
        trend = 'decreasing';
    } else {
        trend = 'no_trend';
    }

    return Object.freeze({
        S_total,
        varS_total,
        zScore,
        pValueApprox,
        trend,
        n,
        nSeasons: seasons,
        seasonStats: Object.freeze(seasonStats),
    });
}

/**
 * Calcula a inclinação não-paramétrica de Theil-Sen (Sen 1968).
 *
 * Estimador robusto de inclinação baseado na mediana de todos os declives
 * pareados - resistente a outliers.
 *
 * Equações:
 *   slope = median({(x_j - x_i) / (j - i) : j > i})
 *   intercept = median(x_i) - slope × median(i)    [Conover 1999]
 *
 * @param {number[]} series - Série temporal em ordem cronológica
 * @returns {Readonly<{slope: number, intercept: number, n: number, unit: string}>}
 */
export function computeTheilSenSlope(series: number[]): Readonly<{slope: number, intercept: number, n: number, unit: string}> {
    const n = series.length;
    if (n < 2) {
        return Object.freeze({ slope: NaN, intercept: NaN, n, unit: 'change_per_time_unit' });
    }

    // Coleta todos os declives pareados
    const slopes = [];
    for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
            const dt = j - i; // diferença de índice temporal
            // dt nunca é 0 aqui pois j > i
            slopes.push(((series[j] as number) - (series[i] as number)) / dt);
        }
    }

    if (slopes.length === 0) {
        return Object.freeze({ slope: NaN, intercept: NaN, n, unit: 'change_per_time_unit' });
    }

    const slope = median(slopes);

    // intercept = median(x_i) - slope × median(i)
    const indices = Array.from({ length: n }, (_, i) => i);
    const intercept = median(series) - slope * median(indices);

    return Object.freeze({ slope, intercept, n, unit: 'change_per_time_unit' });
}

/**
 * Detecta pontos de mudança em séries temporais (Pettitt 1979).
 *
 * Teste não-paramétrico de Pettitt: identifica o instante t* em que
 * a série mais provavelmente sofreu uma mudança de nível.
 *
 * Estatística:
 *   U_t = Σ_{i=1}^{t} Σ_{j=t+1}^{n} sgn(x_j - x_i)
 *   K = max_t |U_t|         (t* = argmax)
 *   p ≈ 2 exp(-6K²/(n³+n²))  (aproximação assintótica Pettitt 1979 eq. 6)
 *
 * @param {number[]} series - Série temporal em ordem cronológica
 * @param {'pettitt'} [method='pettitt'] - Método de detecção
 * @returns {Readonly<{changePoints: ReadonlyArray<Readonly<{t: number, K: number, pValueApprox: string}>>,
 *           n: number, method: string}>}
 */
export function computeChangePointDetection(series: number[], method: 'pettitt' = 'pettitt'): Readonly<{changePoints: ReadonlyArray<Readonly<{t: number, K: number, pValueApprox: string}>>, n: number, method: string}> {
    const n = series.length;
        const changePoints: Array<Readonly<{ t: number, K: number, pValueApprox: string }>>= [];

    if (n < 4) {
        return Object.freeze({
            changePoints: Object.freeze(changePoints),
            n,
            method,
        });
    }

    // Calcula U_t para cada possível ponto de mudança t (1..n-1)
    // U_t = Σ_{i=1}^{t} Σ_{j=t+1}^{n} sgn(x_j - x_i)
    // Complexidade O(n²) com cálculo incremental O(n) usando a relação de recorrência:
    // U_{t+1} = U_t + Σ_{i=1}^{t} sgn(x_{t+1} - x_i) - Σ_{j=t+2}^{n} sgn(x_j - x_{t+1})
    // Forma mais clara: calcular diretamente para cada t

    let maxK = 0;
    let maxT = 1;

    // Construção explícita de U_t para cada t (O(n²) no total)
    const U = new Array(n + 1).fill(0); // U[1..n-1] são os pontos de mudança candidatos
    for (let t = 1; t < n; t++) {
        // U[t] = Σ_{i=1}^{t} Σ_{j=t+1}^{n} sgn(x_j - x_i)
        // Relação de recorrência: U[t] = U[t-1] + Σ_{j=t+1}^{n} sgn(x_j - x_t) - Σ_{i=1}^{t-1} sgn(x_t - x_i)
        // Mais simples: acumulação direta usando U[t] = U[t-1] + delta_t
        // delta_t = Σ_{j=t+1}^{n} sgn(x_j - x_t)  [novas comparações à direita]
        //         - Σ_{i=1}^{t-1} sgn(x_t - x_i)   [comparações anteriores mudando de lado]
        // Nota: sgn(x_t - x_i) = -sgn(x_i - x_t), logo:
        // delta_t = Σ_{j=t+1}^{n} sgn(x_j - x_t) + Σ_{i=1}^{t-1} sgn(x_t - x_i) - wait, let me recalculate

        // Usando a fórmula direta - construção O(n²) total:
        // U_t = Σ_{i=1}^{t} Σ_{j=t+1}^{n} sgn(x_j - x_i)
        // U_{t+1} - U_t = Σ_{i=1}^{t+1} Σ_{j=t+2}^{n} sgn(x_j-x_i) - Σ_{i=1}^{t} Σ_{j=t+1}^{n} sgn(x_j-x_i)
        //   = [Σ_{i=1}^{t} Σ_{j=t+2}^{n} + Σ_{j=t+2}^{n} sgn(x_j-x_{t+1})]
        //     - [Σ_{i=1}^{t} Σ_{j=t+2}^{n} + Σ_{i=1}^{t} sgn(x_{t+1}-x_i)]
        //   = Σ_{j=t+2}^{n} sgn(x_j-x_{t+1}) - Σ_{i=1}^{t} sgn(x_{t+1}-x_i)

        // Δ_t = U[t+1] - U[t]
        let delta = 0;
        for (let j = t + 1; j < n; j++) {
            delta += sign((series[j] as number) - (series[t] as number));
        }
        for (let i = 0; i < t; i++) {
            delta -= sign((series[t] as number) - (series[i] as number));
        }
        U[t] = U[t - 1] + delta;

        const absU = Math.abs(U[t]);
        if (absU > maxK) {
            maxK = absU;
            maxT = t;
        }
    }

    // Aproximação assintótica de Pettitt (1979), equação 6:
    // p ≈ 2 exp(-6K²/(n³+n²))
    if (maxK > 0) {
        const K = maxK;
        const pApprox = 2 * Math.exp((-6 * K * K) / (n * n * n + n * n));
        if (pApprox < 0.1) {
            changePoints.push(
                Object.freeze({
                    t: maxT,
                    K,
                    pValueApprox: pValueBracket(pApprox),
                }),
            );
        }
    }

    return Object.freeze({
        changePoints: Object.freeze(changePoints),
        n,
        method,
    });
}

/**
 * Previsão por suavização exponencial dupla — método linear de Holt (Holt 1957/2004).
 *
 * Implementa o método EXPONENTIAL_SMOOTHING canônico referenciado em
 * environmentalDeterministicForecastSchema.ts (seasonality === NONE), preenchendo
 * a lacuna entre a persistência EWMA de passo único (airQualityForecast.ts, sem
 * componente de tendência) e a necessidade de uma previsão multi-passo com nível
 * e tendência separados.
 *
 * Recursões (Hyndman & Athanasopoulos 2021, §8.2):
 *   Nível:     ℓ_t = α·y_t + (1 − α)·(ℓ_{t−1} + b_{t−1})
 *   Tendência: b_t = β·(ℓ_t − ℓ_{t−1}) + (1 − β)·b_{t−1}
 *   Previsão:  ŷ_{t+h|t} = ℓ_t + h·b_t          (h = 1..horizon)
 *
 * Inicialização (forma padrão FPP3): ℓ_1 = y_1, b_1 = y_2 − y_1.
 *
 * Intervalos de previsão: aproximação Gaussiana baseada no desvio-padrão dos
 * resíduos de um-passo-à-frente (in-sample). A variância do erro h-passos cresce
 * de forma sub-linear; usa-se a aproximação conservadora σ_h ≈ σ̂·√h (Hyndman &
 * Athanasopoulos 2021, eq. de propagação de incerteza para ETS(A,A,N) simplificada),
 * com z = 1.95996 para 95 % (normal padrão). Por ser aproximação, o intervalo é
 * rotulado como `approx`.
 *
 * NOTA: previsão pura sem DOM/IDB/fetch. Para β = 0 reduz-se a suavização
 * exponencial simples com deriva (drift) constante; para tendência nula a previsão
 * é plana, equivalente a SES.
 *
 * @param series - Série temporal em ordem cronológica (n ≥ 3)
 * @param options - { alpha ∈ (0,1], beta ∈ [0,1], horizon ≥ 1, z = 1.95996 }
 * @returns Objeto congelado com forecast[], intervalos, nível/tendência finais e RMSE in-sample
 * @throws {RangeError} se n < 3, horizon < 1, ou alpha/beta fora de faixa
 *
 * Referência: Holt (1957/2004) DOI 10.1016/j.ijforecast.2003.09.015;
 *             Hyndman & Athanasopoulos (2021) §8.2.
 */
export function computeHoltLinearForecast(
    series: number[],
    options: { alpha?: number; beta?: number; horizon?: number; z?: number } = {},
): Readonly<{
    forecast: ReadonlyArray<number>;
    lower: ReadonlyArray<number>;
    upper: ReadonlyArray<number>;
    level: number;
    trend: number;
    alpha: number;
    beta: number;
    horizon: number;
    rmse: number;
    intervalMethod: string;
    n: number;
}> {
    const n = series.length;
    if (n < 3) {
        throw new RangeError(`computeHoltLinearForecast: n=${n} insuficiente — mínimo 3 observações necessárias`);
    }

    const alpha = options.alpha ?? 0.5;
    const beta = options.beta ?? 0.1;
    const horizon = options.horizon ?? 1;
    const z = options.z ?? 1.95996; // 95 % normal padrão

    if (!(alpha > 0 && alpha <= 1)) {
        throw new RangeError(`computeHoltLinearForecast: alpha=${alpha} deve estar em (0, 1]`);
    }
    if (!(beta >= 0 && beta <= 1)) {
        throw new RangeError(`computeHoltLinearForecast: beta=${beta} deve estar em [0, 1]`);
    }
    if (!(Number.isInteger(horizon) && horizon >= 1)) {
        throw new RangeError(`computeHoltLinearForecast: horizon=${horizon} deve ser inteiro ≥ 1`);
    }

    // Inicialização padrão (FPP3 §8.2): ℓ_1 = y_1, b_1 = y_2 − y_1
    let level = series[0] as number;
    let trend = (series[1] as number) - (series[0] as number);

    // Recursão a partir de t = 2 (índice 1). Coleta resíduos de um-passo-à-frente
    // (ŷ_{t|t-1} = ℓ_{t-1} + b_{t-1}) para estimar σ̂.
    let sumSqResid = 0;
    let residCount = 0;
    for (let t = 1; t < n; t++) {
        const yt = series[t] as number;
        const prevLevel = level;
        const prevTrend = trend;

        // Previsão um-passo-à-frente ANTES de atualizar com y_t
        const oneStep = prevLevel + prevTrend;
        const resid = yt - oneStep;
        sumSqResid += resid * resid;
        residCount += 1;

        // Atualização de estado
        level = alpha * yt + (1 - alpha) * (prevLevel + prevTrend);
        trend = beta * (level - prevLevel) + (1 - beta) * prevTrend;
    }

    // RMSE in-sample dos resíduos de um-passo-à-frente
    const rmse = residCount > 0 ? Math.sqrt(sumSqResid / residCount) : 0;

    // Previsões h-passos: ŷ_{t+h|t} = ℓ_n + h·b_n
    const forecast: number[] = [];
    const lower: number[] = [];
    const upper: number[] = [];
    for (let h = 1; h <= horizon; h++) {
        const point = level + h * trend;
        // σ_h ≈ σ̂·√h (propagação de incerteza, aproximação Gaussiana)
        const sigmaH = rmse * Math.sqrt(h);
        const margin = z * sigmaH;
        forecast.push(point);
        lower.push(point - margin);
        upper.push(point + margin);
    }

    return Object.freeze({
        forecast: Object.freeze(forecast),
        lower: Object.freeze(lower),
        upper: Object.freeze(upper),
        level,
        trend,
        alpha,
        beta,
        horizon,
        rmse,
        intervalMethod: 'gaussian-approx',
        n,
    });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const temporalTrendsMeta = {
    name: 'temporalTrends',
    description: 'temporalTrends',
    category: 'analytics',
    familyTags: ['environmental'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // CONNECTOR populated 2026-06-02 — Tendência temporal (Mann-Kendall + Theil-Sen + Pettitt)
    // Reference: Hipel & McLeod (1994) Time Series Modelling of Water Resources
    inputSchema: {
        type: 'object',
        properties: {
            series: { type: 'array', items: { type: 'number' }, minItems: 4, description: 'Série temporal monotônica' },
            method: { type: 'string', enum: ['mannKendall', 'theilSen', 'seasonalMK', 'pettitt'], default: 'mannKendall' },
            seasons: { type: 'number', description: 'Para seasonalMK (ex.: 12 para mensal)' },
        },
        required: ['series'],
    },
    outputSchema: {
        type: 'object',
        properties: {
            trend: { type: 'string', enum: ['increasing', 'decreasing', 'no_trend'] },
            zScore: { type: 'number' },
            pValueApprox: { type: 'string' },
            slope: { type: 'number', description: 'Theil-Sen slope (se aplicável)' },
            n: { type: 'number' },
        },
        required: ['trend', 'n'],
    },
};
