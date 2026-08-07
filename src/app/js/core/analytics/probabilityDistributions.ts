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
 * Probability Distributions - ajuste e testes de aderência para dados ambientais
 *
 * Distribui��ões suportadas: Normal, LogNormal, Gamma, Weibull, LogPearson III.
 * Estimação por MLE e método dos momentos.
 * Testes de aderência: Kolmogorov-Smirnov e Anderson-Darling.
 *
 * Referências acadêmicas:
 * - Haan, C.T. (2002). Statistical Methods in Hydrology (2nd ed.). Iowa State Press.
 *   ISBN 978-0-8138-1461-4.
 * - Interagency Committee on Water Data (1982). Guidelines for Determining Flood Flow
 *   Frequency. Bulletin 17B. USGS.
 * - Stedinger, J.R. (1980). Fitting log normal distributions to hydrologic data.
 *   Water Resour. Res. 16(3):481-490. DOI:10.1029/WR016i003p00481
 * - Anderson, T.W. & Darling, D.A. (1954). A test of goodness of fit.
 *   J. Am. Stat. Assoc. 49(268):765-769. DOI:10.2307/2281537
 * - Kolmogorov, A.N. (1933). Sulla determinazione empirica di una legge di distribuzione.
 *   Giorn. Ist. Ital. Attuari 4:83-91.
 * - Abramowitz, M. & Stegun, I.A. (1964). Handbook of Mathematical Functions.
 *   NBS Applied Mathematics Series 55. §26.2.17 (normalCDF), §26.7.1 (gamma).
 * - Beasley, J.D. & Springer, S.G. (1977). The percentage points of the normal
 *   distribution. Appl. Statist. 26:118-121. (Moro 1995 extension)
 * - Marsaglia, G. & Marsaglia, J. (2004). Evaluating the Anderson-Darling distribution.
 *   J. Stat. Software 9(2):1-5. DOI:10.18637/jss.v009.i02
 *
 * @module probabilityDistributions
 */

// ---------------------------------------------------------------------------
// Funções auxiliares matemáticas (não exportadas)
// ---------------------------------------------------------------------------

/**
 * Calcula a média aritmética de um array.
 * @param {number[]} arr
 * @returns {number}
 */
function mean(arr: number[]): number {
    return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Calcula o desvio padrão amostral (ddof=1).
 * @param {number[]} arr
 * @param {number} mu - média pré-calculada (opcional)
 * @returns {number}
 */
function std(arr: number[], mu: number): number {
    const m = mu !== undefined ? mu : mean(arr);
    const n = arr.length;
    if (n < 2) return 0;
    const ssq = arr.reduce((s, v) => s + (v - m) ** 2, 0);
    return Math.sqrt(ssq / (n - 1));
}

/**
 * Calcula o terceiro momento central padronizado (skewness amostral, ddof=1).
 * Fórmula: g = (n / ((n-1)(n-2))) × Σ((x-μ)/s)³
 * @param {number[]} arr
 * @returns {number}
 */
function skewness(arr: number[]): number {
    const n = arr.length;
    if (n < 3) return 0;
    const m = mean(arr);
    const s = std(arr, m);
    if (s === 0) return 0;
    const cube = arr.reduce((acc, v) => acc + ((v - m) / s) ** 3, 0);
    return (n / ((n - 1) * (n - 2))) * cube;
}

/**
 * CDF da distribuição Normal padrão.
 * Abramowitz & Stegun (1964) §26.2.17 - erro máximo 7.5e-8.
 * @param {number} x
 * @returns {number} P(Z ≤ x)
 */
function normalCDF(x: number): number {
    // Usando aproximação racional de A&S 26.2.17
    if (x < -8) return 0;
    if (x > 8) return 1;
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const phi = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    const p = 1 - phi * poly;
    return x >= 0 ? p : 1 - p;
}

/**
 * Quantil da distribuição Normal padrão (inversa da CDF).
 * Beasley-Springer-Moro approximation (Moro 1995 extension).
 * Erro máximo < 3e-9 para p ∈ (1e-5, 1-1e-5).
 * @param {number} p - probabilidade (0 < p < 1)
 * @returns {number} z tal que P(Z ≤ z) = p
 */
function normalQuantile(p: number): number {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;

    // Coeficientes Moro (1995) - extensão do Beasley-Springer
    const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637] as const;
    const b = [-8.4735109309, 23.08336743743, -21.06224101826, 3.13082909833] as const;
    const c = [
        0.3374754822726147, 0.9761690190917186, 0.1607979714918209, 0.0276438810333863, 0.0038405729373609,
        0.0003951896511349, 0.0000321767881768, 0.0000002888167364, 0.0000003960315187,
    ] as const;

    const q = p - 0.5;
    if (Math.abs(q) <= 0.42) {
        const r = q * q;
        return (
            (q * (((a[3] * r + a[2]) * r + a[1]) * r + a[0])) / ((((b[3] * r + b[2]) * r + b[1]) * r + b[0]) * r + 1)
        );
    }

    const r = q < 0 ? Math.log(-Math.log(p)) : Math.log(-Math.log(1 - p));
    const result =
        c[0] + r * (c[1] + r * (c[2] + r * (c[3] + r * (c[4] + r * (c[5] + r * (c[6] + r * (c[7] + r * c[8])))))));
    return q < 0 ? -result : result;
}

/**
 * Função Gama incompleta regularizada P(a, x) - Γ(a,x)/Γ(a).
 * Usa série para x < a+1, fração contínua para x ≥ a+1.
 * Baseado em Numerical Recipes §6.2.
 * @param {number} a - parâmetro shape (a > 0)
 * @param {number} x - limite superior (x ≥ 0)
 * @returns {number} P(a, x) ∈ [0, 1]
 */
function regularizedGammaP(a: number, x: number): number {
    if (x < 0 || a <= 0) return 0;
    if (x === 0) return 0;

    const ITMAX = 200;
    const EPS = 3e-12;
    const FPMIN = 1e-300;
    const lngamma = logGamma(a);

    if (x < a + 1) {
        // Série
        let ap = a;
        let sum = 1 / a;
        let del = sum;
        for (let i = 0; i < ITMAX; i++) {
            ap++;
            del *= x / ap;
            sum += del;
            if (Math.abs(del) < Math.abs(sum) * EPS) break;
        }
        return sum * Math.exp(-x + a * Math.log(x) - lngamma);
    }

    // Fração contínua (Lentz)
    let b = x + 1 - a;
    let c = 1 / FPMIN;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i <= ITMAX; i++) {
        const an = -i * (i - a);
        b += 2;
        d = an * d + b;
        if (Math.abs(d) < FPMIN) d = FPMIN;
        c = b + an / c;
        if (Math.abs(c) < FPMIN) c = FPMIN;
        d = 1 / d;
        const del = d * c;
        h *= del;
        if (Math.abs(del - 1) < EPS) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - lngamma) * h;
}

/**
 * Logaritmo natural da função Gama (Lanczos approximation).
 * Erro < 2e-10 para z > 0.
 * @param {number} z
 * @returns {number} ln(Γ(z))
 */
function logGamma(z: number): number {
    const g = 7;
    const c = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
        12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ] as const;
    if (z < 0.5) {
        return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
    }
    const zz = z - 1;
    let x: number = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i]! / (zz + i);
    const t = zz + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * CDF da distribuição Gamma(alpha, beta) - parametrização shape/scale.
 * @param {number} x - valor
 * @param {number} alpha - shape (α > 0)
 * @param {number} beta - scale (β > 0)
 * @returns {number} P(X ≤ x)
 */
function gammaCDF(x: number, alpha: number, beta: number): number {
    if (x <= 0) return 0;
    return regularizedGammaP(alpha, x / beta);
}

/**
 * Quantil da distribuição Gamma por Newton-Raphson na CDF.
 * @param {number} p - probabilidade (0 < p < 1)
 * @param {number} alpha - shape
 * @param {number} beta - scale
 * @returns {number} x tal que Gamma_CDF(x, alpha, beta) = p
 */
function gammaQuantile(p: number, alpha: number, beta: number): number {
    if (p <= 0) return 0;
    if (p >= 1) return Infinity;

    // Estimativa inicial via Chi-squared (Wilson-Hilferty)
    const z = normalQuantile(p);
    const A = 2 / (9 * alpha);
    let x = alpha * beta * Math.max(1e-10, (1 - A + z * Math.sqrt(A)) ** 3);

    // Newton-Raphson (máx 100 iterações)
    for (let i = 0; i < 100; i++) {
        const fx = gammaCDF(x, alpha, beta) - p;
        const fpx = Math.exp(-x / beta + (alpha - 1) * Math.log(x) - alpha * Math.log(beta) - logGamma(alpha));
        const dx = fx / fpx;
        x -= dx;
        if (x <= 0) x = 1e-10;
        if (Math.abs(dx) < 1e-9 * x) break;
    }
    return x;
}

/**
 * Regressão linear simples: y = a + b*x.
 * @param {number[]} x
 * @param {number[]} y
 * @returns {{ slope: number, intercept: number, r2: number }}
 */
function linearRegression(x: number[], y: number[]): { slope: number, intercept: number, r2: number } {
    const n = x.length;
    const mx = mean(x);
    const my = mean(y);
    let sxy = 0,
        sxx = 0,
        syy = 0;
    for (let i = 0; i < n; i++) {
        sxy += (x[i]! - mx) * (y[i]! - my);
        sxx += (x[i]! - mx) ** 2;
        syy += (y[i]! - my) ** 2;
    }
    const slope = sxx !== 0 ? sxy / sxx : 0;
    const intercept = my - slope * mx;
    const r2 = syy !== 0 ? sxy ** 2 / (sxx * syy) : 0;
    return { slope, intercept, r2 };
}

/**
 * Gera aviso para amostras pequenas (n < 10).
 * @param {number} n
 */
function warnSmallSample(n: number) {
    if (n < 10) {
        console.warn(`[probabilityDistributions] amostra pequena (n=${n} < 10) — resultados instáveis`);
    }
}

// ---------------------------------------------------------------------------
// 1. fitNormal
// ---------------------------------------------------------------------------

/**
 * Ajuste da distribuição Normal por MLE (μ = média amostral, σ = desvio padrão amostral).
 * MLE equivale à média/desvio padrão para distribuição normal (Haan 2002, §4.2).
 *
 * @param {number[]} data - array de valores reais
 * @returns {{ mu: number, sigma: number, method: string, distribution: string, n: number }}
 */
export function fitNormal(data: number[]): { mu: number, sigma: number, method: string, distribution: string, n: number } {
    if (!Array.isArray(data) || data.length === 0) throw new Error('fitNormal: data deve ser array não-vazio');
    const n = data.length;
    warnSmallSample(n);
    const mu = mean(data);
    const sigma = std(data, mu);
    if (sigma === 0) console.warn('[probabilityDistributions] fitNormal: todos os valores são iguais (σ=0)');
    return Object.freeze({ mu, sigma, method: 'mle', distribution: 'normal', n });
}

// ---------------------------------------------------------------------------
// 2. fitLogNormal
// ---------------------------------------------------------------------------

/**
 * Ajuste da distribuição LogNormal por MLE no espaço log.
 * Stedinger (1980) demonstra que MLE de (μ_ln, σ_ln) é equivalente à
 * média/desvio padrão de ln(data).
 *
 * @param {number[]} data - array de valores positivos (> 0)
 * @returns {{ muLn: number, sigmaLn: number, muX: number, sigmaX: number,
 *             method: string, distribution: string, n: number }}
 */
export function fitLogNormal(data: number[]): { muLn: number, sigmaLn: number, muX: number, sigmaX: number, method: string, distribution: string, n: number } {
    if (!Array.isArray(data) || data.length === 0) throw new Error('fitLogNormal: data deve ser array não-vazio');
    if (data.some((v) => v <= 0)) throw new Error('fitLogNormal: todos os valores devem ser positivos (> 0)');
    const n = data.length;
    warnSmallSample(n);
    const y = data.map((v) => Math.log(v));
    const muLn = mean(y);
    const sigmaLn = std(y, muLn);
    // Momentos da distribuição original (Haan 2002, eq. 4.17)
    const muX = Math.exp(muLn + sigmaLn ** 2 / 2);
    const sigmaX = Math.sqrt((Math.exp(sigmaLn ** 2) - 1) * Math.exp(2 * muLn + sigmaLn ** 2));
    return Object.freeze({ muLn, sigmaLn, muX, sigmaX, method: 'mle', distribution: 'lognormal', n });
}

// ---------------------------------------------------------------------------
// 3. fitGamma
// ---------------------------------------------------------------------------

/**
 * Ajuste da distribuição Gamma pelo método dos momentos (shape/scale).
 * α = (μ/σ)², β = σ²/μ. (Haan 2002, §4.3)
 *
 * @param {number[]} data - array de valores não-negativos (≥ 0)
 * @returns {{ alpha: number, beta: number, mean: number, variance: number,
 *             method: string, distribution: string, n: number }}
 */
export function fitGamma(data: number[]): { alpha: number, beta: number, mean: number, variance: number, method: string, distribution: string, n: number } {
    if (!Array.isArray(data) || data.length === 0) throw new Error('fitGamma: data deve ser array não-vazio');
    if (data.some((v) => v < 0)) throw new Error('fitGamma: todos os valores devem ser não-negativos (≥ 0)');
    const n = data.length;
    warnSmallSample(n);
    if (data.some((v) => v === 0)) {
        console.warn('[probabilityDistributions] fitGamma: valores zero presentes — considere shift positivo');
    }
    const mu = mean(data);
    const s = std(data, mu);
    if (mu <= 0) throw new Error('fitGamma: média deve ser positiva');
    if (s === 0) {
        console.warn('[probabilityDistributions] fitGamma: desvio padrão zero — ajuste degenerado');
        return Object.freeze({
            alpha: Infinity,
            beta: 0,
            mean: mu,
            variance: 0,
            method: 'moments',
            distribution: 'gamma',
            n,
        });
    }
    const alpha = (mu / s) ** 2;
    const beta = s ** 2 / mu;
    return Object.freeze({
        alpha,
        beta,
        mean: alpha * beta,
        variance: alpha * beta ** 2,
        method: 'moments',
        distribution: 'gamma',
        n,
    });
}

// ---------------------------------------------------------------------------
// 4. fitWeibull
// ---------------------------------------------------------------------------

/**
 * Ajuste da distribuição Weibull pelo método do gráfico de probabilidade
 * (probability-plot regression). Posição de plotagem de Weibull: p_i = i/(n+1).
 * Linearização: ln(-ln(1-p_i)) = k·ln(x_i) - k·ln(λ). (Haan 2002, §4.4)
 *
 * @param {number[]} data - array de valores positivos
 * @returns {{ k: number, lambda: number, method: string, distribution: string, r2: number, n: number }}
 */
export function fitWeibull(data: number[]): { k: number, lambda: number, method: string, distribution: string, r2: number, n: number } {
    if (!Array.isArray(data) || data.length === 0) throw new Error('fitWeibull: data deve ser array não-vazio');
    if (data.some((v) => v <= 0)) throw new Error('fitWeibull: todos os valores devem ser positivos');
    const n = data.length;
    warnSmallSample(n);
    const sorted = [...data].sort((a, b) => a - b);
    const xArr = sorted.map((v) => Math.log(v));
    const yArr = sorted.map((_, i) => {
        const p = (i + 1) / (n + 1);
        return Math.log(-Math.log(1 - p));
    });
    const { slope: k, intercept, r2 } = linearRegression(xArr, yArr);
    // intercept = -k·ln(λ) → λ = exp(-intercept/k)
    const lambda = k !== 0 ? Math.exp(-intercept / k) : 1;
    return Object.freeze({ k, lambda, method: 'probability-plot', distribution: 'weibull', r2, n });
}

// ---------------------------------------------------------------------------
// 5. fitLogPearsonIII
// ---------------------------------------------------------------------------

/**
 * Ajuste da distribuição Log-Pearson Tipo III pelo método dos momentos.
 * Usa log base 10 conforme Bulletin 17B (IACWD 1982).
 * Correção de skewness de Bulletin 17B Apêndice 12.
 *
 * @param {number[]} data - array de valores positivos
 * @returns {{ mean_y: number, std_y: number, skewness_y: number,
 *             skewness_corrected: number, n: number, method: string, distribution: string }}
 */
export function fitLogPearsonIII(data: number[]): { mean_y: number, std_y: number, skewness_y: number, skewness_corrected: number, n: number, method: string, distribution: string } {
    if (!Array.isArray(data) || data.length === 0) throw new Error('fitLogPearsonIII: data deve ser array não-vazio');
    if (data.some((v) => v <= 0)) throw new Error('fitLogPearsonIII: todos os valores devem ser positivos');
    const n = data.length;
    warnSmallSample(n);
    const y = data.map((v) => Math.log10(v));
    const mean_y = mean(y);
    const std_y = std(y, mean_y);
    const skewness_y = skewness(y);
    // Correção de viés de Bulletin 17B (Apêndice 12, eq. B-6)
    const skewness_corrected = skewness_y + 6 / n;
    return Object.freeze({
        mean_y,
        std_y,
        skewness_y,
        skewness_corrected,
        n,
        method: 'moments',
        distribution: 'log-pearson-iii',
    });
}

// ---------------------------------------------------------------------------
// 6. quantile
// ---------------------------------------------------------------------------

/**
 * Fator de frequência K de Wilson-Hilferty para distribuição Log-Pearson III.
 * K = (1/g) × { [(z - g/6) × (g/6) + 1]³ - 1 }
 * onde z é o quantil Normal padrão e g é o skewness.
 * (Haan 2002, eq. 7.45; Bulletin 17B, eq. 12-1)
 *
 * @param {number} z - quantil Normal padrão
 * @param {number} g - coeficiente de skewness
 * @returns {number} K
 */
function wilsonHilfertyK(z: number, g: number): number {
    if (Math.abs(g) < 1e-6) {
        // Limite g→0: distribuição LogNormal (Haan 2002, §7.5.2)
        return z;
    }
    const k6 = g / 6;
    const inner = (z - k6) * k6 + 1;
    if (inner <= 0) return -1 / k6 + (k6 * k6) / 3;
    return (1 / g) * (inner ** 3 - 1);
}

/**
 * Calcula quantil(is) para qualquer distribuição ajustada por fitNormal,
 * fitLogNormal, fitGamma, fitWeibull ou fitLogPearsonIII.
 *
 * @param {Record<string, any>} params - objeto retornado por uma das funções fit*
 * @param {number|number[]} probability - probabilidade não-excedência (0 < p < 1)
 * @returns {Object|Object[]} { quantile, probability, distribution, returnPeriod }
 */
export function quantile(params: Record<string, any>, probability: number|number[]): Object|Object[] {
    const isArray = Array.isArray(probability);
    const probs = isArray ? probability : [probability];
    const dist = params.distribution;

    const results = probs.map((p) => {
        if (p <= 0 || p >= 1) throw new RangeError(`quantile: probabilidade ${p} fora de (0,1)`);
        let q;
        switch (dist) {
            case 'normal':
                q = params.mu + params.sigma * normalQuantile(p);
                break;
            case 'lognormal':
                q = Math.exp(params.muLn + params.sigmaLn * normalQuantile(p));
                break;
            case 'gamma':
                q = gammaQuantile(p, params.alpha, params.beta);
                break;
            case 'weibull':
                // Inversa analítica: x = λ × (-ln(1-p))^(1/k)
                q = params.lambda * Math.pow(-Math.log(1 - p), 1 / params.k);
                break;
            case 'log-pearson-iii': {
                const z = normalQuantile(p);
                const K = wilsonHilfertyK(z, params.skewness_corrected);
                q = 10 ** (params.mean_y + K * params.std_y);
                break;
            }
            default:
                throw new Error(`quantile: distribuição '${dist}' não reconhecida`);
        }
        return Object.freeze({
            quantile: q,
            probability: p,
            distribution: dist,
            returnPeriod: 1 / (1 - p),
        });
    });

    return isArray ? Object.freeze(results) : results[0]!;
}

// ---------------------------------------------------------------------------
// Funções auxiliares para CDF teórica (usadas em KS e AD)
// ---------------------------------------------------------------------------

/**
 * Retorna a CDF teórica para um valor x dado params.
 * @param {number} x
 * @param {Record<string, any>} params
 * @returns {number}
 */
function theoreticalCDF(x: number, params: Record<string, any>): number {
    const dist = params.distribution;
    switch (dist) {
        case 'normal': {
            return normalCDF((x - params.mu) / params.sigma);
        }
        case 'lognormal': {
            if (x <= 0) return 0;
            return normalCDF((Math.log(x) - params.muLn) / params.sigmaLn);
        }
        case 'gamma': {
            return gammaCDF(x, params.alpha, params.beta);
        }
        case 'weibull': {
            if (x <= 0) return 0;
            return 1 - Math.exp(-Math.pow(x / params.lambda, params.k));
        }
        case 'log-pearson-iii': {
            // Usar Newton-Raphson invertendo quantile (não há fórmula fechada)
            // Aproximação via Wilson-Hilferty: normalizar y=log10(x) e usar Normal
            if (x <= 0) return 0;
            const y = Math.log10(x);
            const z = (y - params.mean_y) / params.std_y;
            // CDF normal padrão como primeira aproximação (válida para |g|<1)
            return normalCDF(z);
        }
        default:
            throw new Error(`theoreticalCDF: distribuição '${dist}' não reconhecida`);
    }
}

// ---------------------------------------------------------------------------
// 7. kolmogorovSmirnovTest
// ---------------------------------------------------------------------------

/**
 * Teste de Kolmogorov-Smirnov para aderência de ajuste.
 * Dn = max|F_emp(x_i) - F_teórico(x_i)|.
 * p-value via fórmula de Massey (1951): Dn × (√n + 0.12 + 0.11/√n).
 *
 * Referência: Kolmogorov (1933); Massey, F.J. (1951). The Kolmogorov-Smirnov test
 * for goodness of fit. J. Am. Stat. Assoc. 46(253):68-78.
 *
 * @param {number[]} data - dados observados
 * @param {Record<string, any>} params - parâmetros do ajuste
 * @returns {{ Dn: number, pValue: number, reject: boolean, n: number, distribution: string }}
 */
export function kolmogorovSmirnovTest(data: number[], params: Record<string, any>): { Dn: number, pValue: number, reject: boolean, n: number, distribution: string } {
    if (!Array.isArray(data) || data.length === 0) throw new Error('kolmogorovSmirnovTest: data inválido');
    const n = data.length;
    const sorted = [...data].sort((a, b) => a - b);
    let Dn = 0;
    for (let i = 0; i < n; i++) {
        const Femp = (i + 1) / n; // F_emp = i/n (Weibull plotting position, com i+1)
        const Ftheo = theoreticalCDF(sorted[i]!, params);
        const d = Math.abs(Femp - Ftheo);
        if (d > Dn) Dn = d;
    }
    // Aproximação de Massey (1951) para p-value
    const T = Dn * (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n));
    // p-value via série de Kolmogorov (Haan 2002, §11.3)
    const pValue = _ksDistribution(T);

    return Object.freeze({
        Dn,
        pValue,
        reject: pValue < 0.05,
        n,
        distribution: params.distribution,
    });
}

/**
 * CDF da distribuição de Kolmogorov para estatística T = Dn × ajuste.
 * P(T > t) = 2 × Σ_k=1^∞ (-1)^(k-1) × exp(-2k²t²)
 * p-value = 1 - P(T > t) para uma série truncada.
 * @param {number} T
 * @returns {number} p-value
 */
function _ksDistribution(T: number): number {
    // Série alternada convergente
    let sum = 0;
    for (let k = 1; k <= 100; k++) {
        const term = Math.exp(-2 * k * k * T * T);
        sum += (k % 2 === 1 ? 1 : -1) * term;
        if (Math.abs(term) < 1e-12) break;
    }
    const pExceedance = 2 * sum;
    return Math.max(0, Math.min(1, pExceedance));
}

// ---------------------------------------------------------------------------
// 8. andersonDarlingTest
// ---------------------------------------------------------------------------

/**
 * Teste de Anderson-Darling para aderência de ajuste.
 * A² = -n - (1/n) × Σ[(2i-1)×(ln(F_i) + ln(1-F_{n+1-i}))]
 * A²* = A²×(1 + 0.75/n + 2.25/n²) — correção para amostras finitas.
 *
 * p-value via Marsaglia & Marsaglia (2004).
 * Anderson & Darling (1954). DOI:10.2307/2281537.
 *
 * @param {number[]} data - dados observados
 * @param {Record<string, any>} params - parâmetros do ajuste
 * @returns {{ A2: number, A2star: number, pValue: number, reject: boolean, n: number, distribution: string }}
 */
export function andersonDarlingTest(data: number[], params: Record<string, any>): { A2: number, A2star: number, pValue: number, reject: boolean, n: number, distribution: string } {
    if (!Array.isArray(data) || data.length === 0) throw new Error('andersonDarlingTest: data inválido');
    const n = data.length;
    const sorted = [...data].sort((a, b) => a - b);
    const F = sorted.map((x) => {
        const f = theoreticalCDF(x, params);
        // Clampar para evitar log(0) ou log(1)
        return Math.max(1e-15, Math.min(1 - 1e-15, f));
    });

    let S = 0;
    for (let i = 0; i < n; i++) {
        S += (2 * (i + 1) - 1) * (Math.log(F[i]!) + Math.log(1 - F[n - 1 - i]!));
    }
    const A2 = -n - S / n;
    // Correção para amostras finitas (Marsaglia & Marsaglia 2004, eq. 3)
    const A2star = A2 * (1 + 0.75 / n + 2.25 / (n * n));
    const pValue = _adPValue(A2star);

    return Object.freeze({
        A2,
        A2star,
        pValue,
        reject: pValue < 0.05,
        n,
        distribution: params.distribution,
    });
}

/**
 * p-value para o teste Anderson-Darling via Marsaglia & Marsaglia (2004).
 * Cobre A²* ∈ (0, ∞).
 * @param {number} z - A²* estatística
 * @returns {number} p-value (probabilidade de excedência)
 */
function _adPValue(z: number): number {
    // Marsaglia & Marsaglia (2004), Tab. 1 - piecewise approximation
    if (z < 0.2) {
        return 1 - Math.exp(-13.436 + 101.14 * z - 223.73 * z * z);
    } else if (z < 0.34) {
        return 1 - Math.exp(-8.318 + 42.796 * z - 59.938 * z * z);
    } else if (z < 0.6) {
        return Math.exp(0.9177 - 4.279 * z - 1.38 * z * z);
    } else if (z < 13) {
        return Math.exp(1.2937 - 5.709 * z + 0.0186 * z * z);
    }
    return 0;
}

// ---------------------------------------------------------------------------
// 9. selectBestDistribution
// ---------------------------------------------------------------------------

/**
 * Ajusta múltiplas distribuições e seleciona a de melhor aderência (menor KS Dn).
 *
 * @param {number[]} data - dados observados
 * @param {string[]} distributions - lista de distribuições para testar
 *   ['normal', 'lognormal', 'gamma', 'weibull', 'log-pearson-iii']
 * @returns {Readonly<{ best: Readonly<Record<string, any>>, ranked: ReadonlyArray<Readonly<Record<string, any>>> }>} - Object.freeze em cada entry
 */
export function selectBestDistribution(data: number[], distributions: string[] = ['normal', 'lognormal', 'gamma', 'weibull']): Readonly<{ best: Readonly<Record<string, any>>, ranked: ReadonlyArray<Readonly<Record<string, any>>> }> {
    if (!Array.isArray(data) || data.length === 0) throw new Error('selectBestDistribution: data inválido');

    const results = [];
    for (const distName of distributions) {
        let params;
        try {
            switch (distName) {
                case 'normal':
                    params = fitNormal(data);
                    break;
                case 'lognormal':
                    params = fitLogNormal(data);
                    break;
                case 'gamma':
                    params = fitGamma(data);
                    break;
                case 'weibull':
                    params = fitWeibull(data);
                    break;
                case 'log-pearson-iii':
                    params = fitLogPearsonIII(data);
                    break;
                default:
                    continue;
            }
        } catch (e: any) {
            console.debug('[probDistributions] fit:', e?.message || e);
            // Distribuição inaplicável a estes dados (ex: lognormal com zeros)
            continue;
        }

        try {
            const ks = kolmogorovSmirnovTest(data, params);
            results.push(
                Object.freeze({
                    distribution: distName,
                    params,
                    ksD: ks.Dn,
                    ksPValue: ks.pValue,
                }),
            );
        } catch (e: any) {
            console.debug('[probDistributions] ksTest:', e?.message || e);
            // ignora distribuições que falham no teste
        }
    }

    if (results.length === 0) throw new Error('selectBestDistribution: nenhuma distribuição pôde ser ajustada');

    results.sort((a, b) => a.ksD - b.ksD);
    return Object.freeze({
        best: results[0]!,
        ranked: Object.freeze(results),
    });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const probabilityDistributionsMeta = {
    name: 'probabilityDistributions',
    description: 'probabilityDistributions',
    category: 'analytics',
    familyTags: ['environmental'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // CONNECTOR populated 2026-06-02 — Fit de distribuição (Normal, LogNormal, Gamma, Weibull)
    // Reference: EPA ProUCL §3.1 + Helsel (2005) Nondetects And Data Analysis
    inputSchema: {
        type: 'object',
        properties: {
            data: { type: 'array', items: { type: 'number' }, minItems: 3 },
            distribution: { type: 'string', enum: ['auto', 'normal', 'lognormal', 'gamma', 'weibull'], default: 'auto' },
        },
        required: ['data'],
    },
    outputSchema: {
        type: 'object',
        properties: {
            distribution: { type: 'string' },
            params: { type: 'object', description: 'Parâmetros do fit (mu/sigma/alpha/beta/k/lambda)' },
            goodnessOfFit: { type: 'object', description: 'KS/AD test + r2' },
            n: { type: 'number' },
        },
        required: ['distribution', 'params', 'n'],
    },
};
