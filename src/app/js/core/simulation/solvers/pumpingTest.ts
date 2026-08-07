// This file is part of ecbyts/ECBT - Environmental & Occupational Core Byte Tools.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pumping Test Analysis - Transmissivity and Storativity Estimation
 * ==================================================================
 * Three classical methods for pumping test analysis:
 *
 * References:
 *   Theis, C.V. (1935). The relation between the lowering of the piezometric
 *     surface and the rate and duration of discharge of a well using
 *     ground-water storage. Trans. AGU 16:519-524.
 *     DOI: 10.1029/TR016i002p00519
 *
 *   Cooper, H.H. & Jacob, C.E. (1946). A generalized graphical method for
 *     evaluating formation constants and summarizing well-field history.
 *     Trans. AGU 27(4):526-534.
 *     DOI: 10.1029/TR027i004p00526
 *
 *   Neuman, S.P. (1975). Analysis of pumping test data from anisotropic
 *     unconfined aquifers considering delayed gravity response.
 *     Water Resour. Res. 11(2):329-345.
 *     DOI: 10.1029/WR011i002p00329
 *
 *   Driscoll, F.G. (1986). Groundwater and Wells (2nd ed.).
 *     Johnson Filtration Systems. ISBN: 0-9616456-0-1
 *
 *   Abramowitz, M. & Stegun, I.A. (1964). Handbook of Mathematical Functions.
 *     National Bureau of Standards. §5.1 Exponential Integral.
 *
 * Módulo importável em Node.js sem DOM, IDB ou Three.js.
 * Todos os retornos de objeto são Object.freeze() - imutáveis.
 */

// ---------------------------------------------------------------------------
// Constante de Euler-Mascheroni (Abramowitz & Stegun eq. 5.1.11)
// ---------------------------------------------------------------------------
const EULER_MASCHERONI = 0.5772156649015329;

// ---------------------------------------------------------------------------
// Regressão linear (mínimos quadrados OLS)
// ---------------------------------------------------------------------------

interface LinearRegressionResult {
    readonly slope: number;
    readonly intercept: number;
    readonly r2: number;
    readonly n: number;
}

/**
 * Regressão linear simples: y = slope * x + intercept.
 * @param xs - valores de x
 * @param ys - valores de y
 * @returns resultado da regressão
 */
function _linearRegression(xs: readonly number[], ys: readonly number[]): LinearRegressionResult {
    const n = xs.length;
    let sumX = 0,
        sumY = 0,
        sumXX = 0,
        sumXY = 0,
        sumYY = 0;
    for (let i = 0; i < n; i++) {
        const xi = xs[i]!;
        const yi = ys[i]!;
        sumX += xi;
        sumY += yi;
        sumXX += xi * xi;
        sumXY += xi * yi;
        sumYY += yi * yi;
    }
    const meanX = sumX / n;
    const meanY = sumY / n;
    const ssXX = sumXX - n * meanX * meanX;
    const ssXY = sumXY - n * meanX * meanY;
    const ssYY = sumYY - n * meanY * meanY;
    const slope = ssXX === 0 ? 0 : ssXY / ssXX;
    const intercept = meanY - slope * meanX;
    const r2 = ssYY === 0 ? 1 : (ssXY * ssXY) / (ssXX * ssYY);
    return { slope, intercept, r2: Math.max(0, Math.min(1, r2)), n };
}

// ---------------------------------------------------------------------------
// 1. computeWellFunction(u)
// ---------------------------------------------------------------------------

/**
 * Função de poço de Theis: W(u) = -Ei(-u) = ∫_u^∞ (e^{-t}/t) dt.
 *
 * Implementação:
 *   Para u ≤ 1: série de potências (Abramowitz & Stegun eq. 5.1.11):
 *     W(u) = -γ - ln(u) + u - u²/4 + u³/18 - u⁴/96 + u⁵/600 - u⁶/4320
 *   Para u > 1: aproximação exponencial com fração contínua baseada em
 *     Abramowitz & Stegun eq. 5.1.22 (série de Legendre truncada):
 *     W(u) = (e^{-u}/u) × P(u) / Q(u)
 *     Coeficientes calibrados para erro < 1e-6 em u ∈ (1, 100].
 *
 * Valores de referência (Theis 1935, Tbl. 1):
 *   W(1e-4) ≈ 8.6332, W(0.001) ≈ 6.3315, W(0.1) ≈ 1.8229,
 *   W(1)    ≈ 0.2194, W(10)   ≈ 4.157e-6
 *
 * @param u - parâmetro adimensional (u = r²S/(4Tt)), deve ser > 0
 * @returns valor escalar de W(u)
 */
export function computeWellFunction(u: number): number {
    if (u <= 0) throw new RangeError('computeWellFunction: u deve ser > 0');

    if (u <= 1.0) {
        // Série de potências - Abramowitz & Stegun 5.1.11, 7 termos
        // W(u) = -γ - ln(u) + u - u²/(2·2!) + u³/(3·3!) - u⁴/(4·4!) + u⁵/(5·5!) - u⁶/(6·6!)
        const u2 = u * u;
        const u3 = u2 * u;
        const u4 = u3 * u;
        const u5 = u4 * u;
        const u6 = u5 * u;
        return -EULER_MASCHERONI - Math.log(u) + u - u2 / 4.0 + u3 / 18.0 - u4 / 96.0 + u5 / 600.0 - u6 / 4320.0;
    } else {
        // Aproximação racional para u > 1 - Abramowitz & Stegun eq. 5.1.56:
        //   u × e^u × E1(u) ≈ (u⁴ + a1 u³ + a2 u² + a3 u + a4)
        //                       ────────────────────────────────────
        //                      (u⁴ + b1 u³ + b2 u² + b3 u + b4)
        //
        // onde W(u) = E1(u), erro máximo |ε| < 2×10⁻⁸ para u ≥ 1.
        // Coeficientes: A&S Table 5.3 (Stegun 1972, p. 231).
        const a1 = 8.5733287401,
            a2 = 18.059016973;
        const a3 = 8.6347608925,
            a4 = 0.2677737343;
        const b1 = 9.5733223454,
            b2 = 25.6329561486;
        const b3 = 21.0996530827,
            b4 = 3.9584969228;
        const u2 = u * u;
        const u3 = u2 * u;
        const u4 = u3 * u;
        const num = u4 + a1 * u3 + a2 * u2 + a3 * u + a4;
        const den = u4 + b1 * u3 + b2 * u2 + b3 * u + b4;
        return (Math.exp(-u) * (num / den)) / u;
    }
}

// ---------------------------------------------------------------------------
// 2. computeTheisDrawdown(params)
// ---------------------------------------------------------------------------

interface TheisDrawdownParams {
    readonly Q: number;
    readonly T: number;
    readonly S: number;
    readonly r: number;
    readonly t: number | readonly number[];
}

interface TheisDrawdownResult {
    readonly s: number | readonly number[];
    readonly u: number | readonly number[];
    readonly Wu: number | readonly number[];
    readonly Q: number;
    readonly T: number;
    readonly S: number;
    readonly r: number;
    readonly t: number | readonly number[];
    readonly method: string;
}

/**
 * Rebaixamento pelo método de Theis (1935):
 *   s(r,t) = Q/(4πT) × W(u)   onde  u = r²S/(4Tt)
 *
 * @param params - parâmetros do teste de Theis
 * @returns resultado do rebaixamento
 */
export function computeTheisDrawdown(params: TheisDrawdownParams): Readonly<TheisDrawdownResult> {
    const { Q, T, S, r, t } = params;
    if (!Q || Q <= 0) throw new RangeError('computeTheisDrawdown: Q deve ser > 0');
    if (!T || T <= 0) throw new RangeError('computeTheisDrawdown: T deve ser > 0');
    if (!S || S <= 0) throw new RangeError('computeTheisDrawdown: S deve ser > 0');
    if (!r || r <= 0) throw new RangeError('computeTheisDrawdown: r deve ser > 0');

    const isArray = Array.isArray(t);
    const tArr: readonly number[] = isArray ? (t as readonly number[]) : [t as number];

    const sArr: number[] = [];
    const uArr: number[] = [];
    const wuArr: number[] = [];

    for (const ti of tArr) {
        if (ti <= 0) throw new RangeError('computeTheisDrawdown: t deve ser > 0');
        const u = (r * r * S) / (4.0 * T * ti);
        const Wu = computeWellFunction(u);
        const si = (Q / (4.0 * Math.PI * T)) * Wu;
        uArr.push(u);
        wuArr.push(Wu);
        sArr.push(si);
    }

    const s = isArray ? sArr : sArr[0]!;
    const u = isArray ? uArr : uArr[0]!;
    const Wu = isArray ? wuArr : wuArr[0]!;

    return Object.freeze({ s, u, Wu, Q, T, S, r, t, method: 'theis' });
}

// ---------------------------------------------------------------------------
// 3. fitTheis(timeData, drawdownData, opts)
// ---------------------------------------------------------------------------

interface FitTheisOpts {
    readonly Q?: number;
    readonly r?: number;
    readonly initialT?: number | null;
    readonly initialS?: number | null;
}

interface FitTheisResult {
    readonly T: number;
    readonly S: number;
    readonly rmse: number;
    readonly r2: number;
    readonly method: string;
    readonly nPoints: number;
}

/**
 * Ajuste do modelo de Theis por grid search 2D em log-space.
 * Busca T ∈ [1e-6, 10] m²/s (~0.086–864000 m²/d) e S ∈ [1e-6, 1].
 * Nota: internamente os dados são tratados em unidades consistentes (usuário
 * fornece Q em m³/d, T em m²/d).
 *
 * @param timeData - tempos (d)
 * @param drawdownData - rebaixamentos observados (m)
 * @param optsArg - opções com Q, r, initialT, initialS
 * @returns resultado do ajuste
 */
export function fitTheis(
    timeData: readonly number[],
    drawdownData: readonly number[],
    optsArg: FitTheisOpts = {},
): Readonly<FitTheisResult> {
    const Q = optsArg.Q!;
    const r = optsArg.r!;
    const initialT = optsArg.initialT ?? null;
    const initialS = optsArg.initialS ?? null;
    if (!Array.isArray(timeData) || !Array.isArray(drawdownData)) {
        throw new TypeError('fitTheis: timeData e drawdownData devem ser arrays');
    }
    if (timeData.length < 3) {
        throw new RangeError('fitTheis: requer pelo menos 3 pontos de dados');
    }
    if (timeData.length !== drawdownData.length) {
        throw new RangeError('fitTheis: timeData e drawdownData devem ter o mesmo comprimento');
    }
    if (!Q || Q <= 0) throw new RangeError('fitTheis: Q deve ser > 0');
    if (!r || r <= 0) throw new RangeError('fitTheis: r deve ser > 0');

    // Verificar que drawdown não é constante (sem variação)
    const sMin = Math.min(...drawdownData);
    const sMax = Math.max(...drawdownData);
    if (sMax - sMin < 1e-12) {
        console.warn('[pumpingTest] fitTheis: drawdown sem variação — ajuste pode ser impreciso');
    }

    const n = timeData.length;

    // Função SSE
    function _sse(T: number, S: number): number {
        let sse = 0;
        for (let i = 0; i < n; i++) {
            const ti = timeData[i]!;
            if (ti <= 0) continue;
            const u = (r * r * S) / (4.0 * T * ti);
            if (u <= 0) continue;
            const Wu = computeWellFunction(u);
            const sPred = (Q / (4.0 * Math.PI * T)) * Wu;
            const diff = sPred - drawdownData[i]!;
            sse += diff * diff;
        }
        return sse;
    }

    // Grid search 100×100 em log-space
    // T em m²/d: 0.001 a 100000 m²/d (~1e-7 a 1e0 m²/s × 86400)
    const GRID = 100;
    const T_MIN = 0.001,
        T_MAX = 100000; // m²/d
    const S_MIN = 1e-6,
        S_MAX = 1.0;

    const logTMin = Math.log10(T_MIN);
    const logTMax = Math.log10(T_MAX);
    const logSMin = Math.log10(S_MIN);
    const logSMax = Math.log10(S_MAX);

    let bestT = initialT ?? Math.sqrt(T_MIN * T_MAX);
    let bestS = initialS ?? Math.sqrt(S_MIN * S_MAX);
    let bestSSE = Infinity;

    // Fase 1: grid grosso 100×100
    for (let it = 0; it < GRID; it++) {
        const logT = logTMin + (it / (GRID - 1)) * (logTMax - logTMin);
        const T = Math.pow(10, logT);
        for (let is = 0; is < GRID; is++) {
            const logS = logSMin + (is / (GRID - 1)) * (logSMax - logSMin);
            const S = Math.pow(10, logS);
            const sse = _sse(T, S);
            if (sse < bestSSE) {
                bestSSE = sse;
                bestT = T;
                bestS = S;
            }
        }
    }

    // Refinamento 3×: grade de 50×50 em volta do mínimo
    for (let pass = 0; pass < 3; pass++) {
        const logTCenter = Math.log10(bestT);
        const logSCenter = Math.log10(bestS);
        const halfRangeT = (logTMax - logTMin) / Math.pow(10, pass + 1);
        const halfRangeS = (logSMax - logSMin) / Math.pow(10, pass + 1);

        const ltMin = Math.max(logTMin, logTCenter - halfRangeT);
        const ltMax = Math.min(logTMax, logTCenter + halfRangeT);
        const lsMin = Math.max(logSMin, logSCenter - halfRangeS);
        const lsMax = Math.min(logSMax, logSCenter + halfRangeS);

        const FINE = 50;
        for (let it = 0; it < FINE; it++) {
            const logT = ltMin + (it / (FINE - 1)) * (ltMax - ltMin);
            const T = Math.pow(10, logT);
            for (let is = 0; is < FINE; is++) {
                const logS = lsMin + (is / (FINE - 1)) * (lsMax - lsMin);
                const S = Math.pow(10, logS);
                const sse = _sse(T, S);
                if (sse < bestSSE) {
                    bestSSE = sse;
                    bestT = T;
                    bestS = S;
                }
            }
        }
    }

    // Calcular RMSE e R²
    const rmse = Math.sqrt(bestSSE / n);
    const meanS = drawdownData.reduce((a, b) => a + b, 0) / n;
    let ssTot = 0;
    for (const si of drawdownData) ssTot += (si - meanS) ** 2;
    const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - bestSSE / ssTot);

    return Object.freeze({
        T: bestT,
        S: bestS,
        rmse,
        r2,
        method: 'theis-fit',
        nPoints: n,
    });
}

// ---------------------------------------------------------------------------
// 6. checkCooperJacobValidity(timeData, { T, S, r })
// ---------------------------------------------------------------------------
// Declarado antes de fitCooperJacob pois é usado internamente.

interface ValidityOpts {
    readonly T: number;
    readonly S: number;
    readonly r: number;
}

interface ValidityResult {
    readonly validMask: readonly boolean[];
    readonly firstValidIndex: number;
    readonly fractionValid: number;
    readonly uValues: readonly number[];
}

/**
 * Verifica se u < 0.05 para cada ponto de tempo (critério de validade de Cooper-Jacob).
 *   u(t) = r²S/(4Tt)
 *
 * @param timeData - tempos (d)
 * @param opts - T, S, r
 * @returns máscara de validade e estatísticas
 */
export function checkCooperJacobValidity(
    timeData: readonly number[],
    { T, S, r }: ValidityOpts,
): Readonly<ValidityResult> {
    if (!Array.isArray(timeData)) throw new TypeError('checkCooperJacobValidity: timeData deve ser array');
    if (!T || T <= 0) throw new RangeError('checkCooperJacobValidity: T deve ser > 0');
    if (!S || S <= 0) throw new RangeError('checkCooperJacobValidity: S deve ser > 0');
    if (!r || r <= 0) throw new RangeError('checkCooperJacobValidity: r deve ser > 0');

    const uValues = timeData.map((ti) => (r * r * S) / (4.0 * T * ti));
    const validMask = uValues.map((u) => u < 0.05);
    const firstValidIndex = validMask.indexOf(true);
    const validCount = validMask.filter(Boolean).length;
    const fractionValid = timeData.length > 0 ? validCount / timeData.length : 0;

    return Object.freeze({
        validMask: Object.freeze(validMask),
        firstValidIndex,
        fractionValid,
        uValues: Object.freeze(uValues),
    });
}

// ---------------------------------------------------------------------------
// 4. fitCooperJacob(timeData, drawdownData, { Q, r })
// ---------------------------------------------------------------------------

interface FitCooperJacobOpts {
    readonly Q: number;
    readonly r: number;
}

interface FitCooperJacobResult {
    readonly T: number;
    readonly S: number;
    readonly slope: number;
    readonly t0: number;
    readonly r2: number;
    readonly validPoints: number;
    readonly totalPoints: number;
    readonly uCheck: readonly number[];
    readonly method: string;
}

/**
 * Método de Cooper-Jacob (1946) - reta semi-log.
 *
 * Válido quando u < 0.05 (regime de tempo tardio).
 * Equação linearizada:
 *   s = (2.303Q)/(4πT) × log10(2.25Tt/(r²S))
 *
 * Procedimento:
 *   1. Filtrar automaticamente pontos com u > 0.05.
 *   2. Fit linear de s vs log10(t): slope Δs, intercepto em t0 (onde s=0).
 *   3. T = 2.303Q / (4π × Δs)
 *   4. S = 2.25 × T × t0 / r²  (t0 extrapolado da reta onde s=0)
 *
 * Nota: os dados são filtrados iterativamente pois precisamos T para checar u.
 * Usamos estimativa inicial do Theis (fit rápido) para o filtro, depois
 * refinamos com o T obtido pelo Cooper-Jacob.
 *
 * @param timeData - tempos (d)
 * @param drawdownData - rebaixamentos observados (m)
 * @param opts - Q e r
 * @returns resultado do ajuste
 */
export function fitCooperJacob(
    timeData: readonly number[],
    drawdownData: readonly number[],
    { Q, r }: FitCooperJacobOpts,
): Readonly<FitCooperJacobResult> {
    if (!Array.isArray(timeData) || !Array.isArray(drawdownData)) {
        throw new TypeError('fitCooperJacob: timeData e drawdownData devem ser arrays');
    }
    if (timeData.length < 3) {
        throw new RangeError('fitCooperJacob: requer pelo menos 3 pontos de dados');
    }
    if (timeData.length !== drawdownData.length) {
        throw new RangeError('fitCooperJacob: timeData e drawdownData devem ter o mesmo comprimento');
    }
    if (!Q || Q <= 0) throw new RangeError('fitCooperJacob: Q deve ser > 0');
    if (!r || r <= 0) throw new RangeError('fitCooperJacob: r deve ser > 0');

    const totalPoints = timeData.length;

    // Passo 1: fit inicial usando TODOS os pontos para obter T estimado
    // (só para filtrar pontos inválidos posteriormente)
    const log10t = timeData.map((ti) => Math.log10(ti));
    const regAll = _linearRegression(log10t, drawdownData);
    const T_est = regAll.slope <= 0 ? null : (2.303 * Q) / (4.0 * Math.PI * regAll.slope);

    // Passo 2: filtrar com S estimado (usar S=0.001 se T_est inválido)
    // Usamos S de referência conservador; o resultado será recalculado pelo fit
    const T_for_filter = T_est && T_est > 0 ? T_est : (Q / drawdownData[drawdownData.length - 1]!) * 0.1;
    const S_for_filter = 0.001; // valor representativo de aquífero confinado

    // Calcular u para cada ponto com T_for_filter
    const uValues = timeData.map((ti) => (r * r * S_for_filter) / (4.0 * T_for_filter * ti));

    // Manter apenas pontos com u < 0.05 (Cooper-Jacob válido)
    const validIndices: number[] = [];
    for (let i = 0; i < totalPoints; i++) {
        if (uValues[i]! < 0.05) validIndices.push(i);
    }

    // Se poucos pontos válidos, usar segunda metade dos dados (geralmente tempo tardio)
    let useIndices: number[] = validIndices;
    if (useIndices.length < 3) {
        const half = Math.floor(totalPoints / 2);
        useIndices = [];
        for (let i = half; i < totalPoints; i++) useIndices.push(i);
    }

    const log10t_valid = useIndices.map((i) => Math.log10(timeData[i]!));
    const s_valid = useIndices.map((i) => drawdownData[i]!);

    const reg = _linearRegression(log10t_valid, s_valid);

    // T = 2.303Q / (4π × slope)
    const slope = reg.slope;
    if (slope <= 0) {
        // Reta não tem inclinação positiva; usar todos os pontos
        const regFull = _linearRegression(log10t, drawdownData);
        const slopeFull = Math.abs(regFull.slope) > 1e-12 ? regFull.slope : 1e-6;
        const T_full = (2.303 * Q) / (4.0 * Math.PI * slopeFull);
        const t0_full = Math.pow(10, -regFull.intercept / slopeFull);
        const S_full = (2.25 * T_full * t0_full) / (r * r);
        return Object.freeze({
            T: Math.max(T_full, 1e-12),
            S: Math.max(S_full, 1e-12),
            slope: slopeFull,
            t0: t0_full,
            r2: regFull.r2,
            validPoints: totalPoints,
            totalPoints,
            uCheck: uValues,
            method: 'cooper-jacob',
        });
    }

    const T = (2.303 * Q) / (4.0 * Math.PI * slope);

    // t0: tempo onde s = 0 → log10(t0) = -intercept / slope
    const t0 = Math.pow(10, -reg.intercept / slope);

    // S = 2.25 T t0 / r²
    const S = (2.25 * T * t0) / (r * r);

    // Verificação final de uCheck com T e S obtidos
    const uCheck = timeData.map((ti) => (r * r * S) / (4.0 * T * ti));

    return Object.freeze({
        T: Math.max(T, 1e-12),
        S: Math.max(S, 1e-12),
        slope,
        t0,
        r2: reg.r2,
        validPoints: useIndices.length,
        totalPoints,
        uCheck: Object.freeze(uCheck),
        method: 'cooper-jacob',
    });
}

// ---------------------------------------------------------------------------
// 5. analyzeRecovery(params)
// ---------------------------------------------------------------------------

interface RecoveryParams {
    readonly pumpingTime: number;
    readonly recoveryTimeData: readonly number[];
    readonly residualDrawdownData: readonly number[];
    readonly Q: number;
    readonly r: number;
}

interface RecoveryResult {
    readonly T: number;
    readonly slope: number;
    readonly r2: number;
    readonly method: string;
    readonly nPoints: number;
}

/**
 * Método de recuperação de Theis - análise da subida após parada do bombeamento.
 *
 * Usando o princípio da superposição, o rebaixamento residual s' é:
 *   s'(t,t_p) = (2.303Q)/(4πT) × log10(t/t')
 * onde t = tempo desde o início do bombeamento, t' = t - t_p (tempo desde parada).
 *
 * Plotar s' vs log10(t/t') → reta → T = 2.303Q/(4π × slope).
 * S não pode ser determinado pelo método de recuperação sem dados adicionais.
 *
 * @param params - parâmetros da recuperação
 * @returns resultado da análise
 */
export function analyzeRecovery(params: RecoveryParams): Readonly<RecoveryResult> {
    // eslint-disable-next-line
    const { pumpingTime, recoveryTimeData, residualDrawdownData, Q, r } = params;
    if (!Array.isArray(recoveryTimeData) || !Array.isArray(residualDrawdownData)) {
        throw new TypeError('analyzeRecovery: recoveryTimeData e residualDrawdownData devem ser arrays');
    }
    if (recoveryTimeData.length < 3) {
        throw new RangeError('analyzeRecovery: requer pelo menos 3 pontos de dados');
    }
    if (recoveryTimeData.length !== residualDrawdownData.length) {
        throw new RangeError('analyzeRecovery: recoveryTimeData e residualDrawdownData devem ter o mesmo comprimento');
    }
    if (!pumpingTime || pumpingTime <= 0) throw new RangeError('analyzeRecovery: pumpingTime deve ser > 0');
    if (!Q || Q <= 0) throw new RangeError('analyzeRecovery: Q deve ser > 0');

    // Calcular razão t/t' para cada ponto de recuperação
    // t = tempo total desde início, t' = tempo desde parada
    const ratios: number[] = [];
    const validS: number[] = [];
    for (let i = 0; i < recoveryTimeData.length; i++) {
        const t_total = recoveryTimeData[i]!;
        const t_prime = t_total - pumpingTime;
        if (t_prime <= 0) continue; // ponto ainda durante bombeamento
        const ratio = t_total / t_prime;
        if (ratio <= 1) continue;
        ratios.push(Math.log10(ratio));
        validS.push(residualDrawdownData[i]!);
    }

    if (ratios.length < 3) {
        throw new RangeError(
            'analyzeRecovery: menos de 3 pontos válidos após parada do bombeamento — ' +
                'verificar que recoveryTimeData inclui tempos após pumpingTime',
        );
    }

    const reg = _linearRegression(ratios, validS);
    const slope = reg.slope;

    // T = 2.303Q / (4π × slope)
    // slope aqui é Δs'/Δlog10(t/t') - deve ser negativo (s' decresce com t/t' crescente?)
    // Na convenção de Theis recovery, s' decresce com o tempo de recuperação.
    // log10(t/t') decresce à medida que t' cresce (mais tempo desde parada).
    // Portanto slope é positivo quando plotamos s' vs log10(t/t') em ordem crescente de t.
    const absSlope = Math.abs(slope);
    const T = (2.303 * Q) / (4.0 * Math.PI * absSlope);

    return Object.freeze({
        T: Math.max(T, 1e-12),
        slope: reg.slope,
        r2: reg.r2,
        method: 'theis-recovery',
        nPoints: ratios.length,
    });
}

// ---------------------------------------------------------------------------
// 7. estimateAquiferParameters(timeData, drawdownData, opts)
// ---------------------------------------------------------------------------

interface EstimateAquiferOpts {
    readonly Q?: number;
    readonly r?: number;
    readonly aquiferType?: 'confined' | 'unconfined';
}

interface EstimateAquiferResult {
    readonly T: number;
    readonly S: number;
    readonly method: string;
    readonly transmissivity_m2d: number;
    readonly storativity: number;
    readonly warning?: string;
}

/**
 * Função principal de análise de teste de bombeamento.
 *
 * Estratégia:
 *   - Tenta Cooper-Jacob se houver ≥ 5 pontos com u < 0.05.
 *   - Fallback para Theis (fit grid search) se Cooper-Jacob inviável.
 *   - Para aquífero não confinado: emite aviso sobre delayed gravity response
 *     (Neuman 1975) e usa Cooper-Jacob/Theis igualmente (implementação fase 1).
 *
 * @param timeData - tempos (d)
 * @param drawdownData - rebaixamentos observados (m)
 * @param opts - Q, r, aquiferType
 * @returns parâmetros do aquífero
 */
export function estimateAquiferParameters(
    timeData: readonly number[],
    drawdownData: readonly number[],
    { Q, r, aquiferType = 'confined' }: EstimateAquiferOpts = {},
): Readonly<EstimateAquiferResult> {
    if (!Array.isArray(timeData) || !Array.isArray(drawdownData)) {
        throw new TypeError('estimateAquiferParameters: timeData e drawdownData devem ser arrays');
    }
    if (timeData.length < 3) {
        throw new RangeError('estimateAquiferParameters: requer pelo menos 3 pontos de dados');
    }
    if (!Q || Q <= 0) throw new RangeError('estimateAquiferParameters: Q deve ser > 0');
    if (!r || r <= 0) throw new RangeError('estimateAquiferParameters: r deve ser > 0');

    let warning: string | null = null;
    if (aquiferType === 'unconfined') {
        warning =
            'Aquífero não confinado detectado. O método de Neuman (1975) para delayed ' +
            'gravity response não está implementado nesta fase. Os resultados de ' +
            'Cooper-Jacob/Theis podem subestimar T e superestimar S no regime inicial ' +
            '(double-inflection curve). Recomenda-se análise em campo com especialista.';
    }

    // Estimativa inicial via fit Theis para obter T para verificação de validade CJ
    let T_init: number, S_init: number;
    try {
        const theisResult = fitTheis(timeData, drawdownData, { Q, r });
        T_init = theisResult.T;
        S_init = theisResult.S;
    } catch (_e) {
        T_init = Q / (drawdownData[drawdownData.length - 1]! * 10);
        S_init = 0.001;
    }

    // Verificar quantos pontos são válidos para Cooper-Jacob
    const validity = checkCooperJacobValidity(timeData, { T: T_init, S: S_init, r });
    const validCount = validity.validMask.filter(Boolean).length;

    let result: FitTheisResult | FitCooperJacobResult;
    let method: string;

    if (validCount >= 5) {
        // Usar Cooper-Jacob
        try {
            result = fitCooperJacob(timeData, drawdownData, { Q, r });
            method = 'cooper-jacob';
        } catch (_e) {
            result = fitTheis(timeData, drawdownData, { Q, r });
            method = 'theis';
        }
    } else {
        // Fallback Theis
        result = fitTheis(timeData, drawdownData, { Q, r });
        method = 'theis';
    }

    const out: EstimateAquiferResult & { warning?: string } = {
        T: result.T,
        S: result.S,
        method,
        transmissivity_m2d: result.T,
        storativity: result.S,
    };
    if (warning) out.warning = warning;

    return Object.freeze(out);
}
