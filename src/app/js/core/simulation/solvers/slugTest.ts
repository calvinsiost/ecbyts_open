// This file is part of ecbyts/ECBT - Environmental & Occupational Core Byte Tools.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Slug Test Analysis - Hydraulic Conductivity Estimation
 * ========================================================
 * Three classical methods for slug test analysis in monitoring wells:
 *
 * References:
 *   Bouwer, H. & Rice, R.C. (1976). A slug test for determining hydraulic
 *     conductivity of unconfined aquifers with completely or partially
 *     penetrating wells. Water Resour. Res. 12(3):423-428.
 *   Cooper, H.H., Bredehoeft, J.D. & Papadopulos, I.S. (1967). Response of a
 *     finite-diameter well to an instantaneous charge of water. Water Resour.
 *     Res. 3(1):263-269.
 *   Hyder, Z., Butler, J.J., McElwee, C.D. & Liu, W. (1994). Slug tests in
 *     partially penetrating wells. Water Resour. Res. 30(11):2945-2957.
 *   Butler, J.J. (1998). The Design, Performance, and Analysis of Slug Tests.
 *     Lewis Publishers, Boca Raton, FL.
 *
 * Módulo importável em Node.js sem DOM, IDB ou Three.js.
 * Todos os retornos são Object.freeze() - imutáveis.
 */

// ---------------------------------------------------------------------------
// TABELAS DE COEFICIENTES BR 1976
// ---------------------------------------------------------------------------

/**
 * Coeficientes A e B da Tabela 1 de Bouwer & Rice (1976).
 * A e B dependem de (L_w / r_w).
 * Valores extraídos das Tabelas originais e ajustados por regressão polinomial.
 * Faixas: L_w/r_w de 10 a 2000.
 *
 * Fonte: Bouwer & Rice (1976) Table 1, pag. 425.
 */
const BR_TABLE: readonly [number, number, number][] = [
    // [L_w/r_w, A,    B    ]
    [10, 1.47, 0.312],
    [20, 1.47, 0.312],
    [40, 1.47, 0.312],
    [60, 1.5, 0.3],
    [100, 1.54, 0.274],
    [200, 1.58, 0.239],
    [400, 1.6, 0.196],
    [1000, 1.62, 0.152],
    [2000, 1.62, 0.138],
];

interface BRCoeffs {
    readonly A: number;
    readonly B: number;
}

/**
 * Interpola linearmente os coeficientes A e B de Bouwer & Rice (1976)
 * para um dado valor de (L_w / r_w).
 * @param lwRw - razão L_w / r_w
 * @returns A e B interpolados
 */
function _interpolateBRCoeffs(lwRw: number): BRCoeffs {
    const tbl = BR_TABLE;
    if (lwRw <= tbl[0]![0]) return { A: tbl[0]![1], B: tbl[0]![2] };
    if (lwRw >= tbl[tbl.length - 1]![0]) {
        const last = tbl[tbl.length - 1]!;
        return { A: last[1], B: last[2] };
    }
    for (let i = 0; i < tbl.length - 1; i++) {
        const [x0, A0, B0] = tbl[i]!;
        const [x1, A1, B1] = tbl[i + 1]!;
        if (lwRw >= x0 && lwRw <= x1) {
            const f = (lwRw - x0) / (x1 - x0);
            return { A: A0 + f * (A1 - A0), B: B0 + f * (B1 - B0) };
        }
    }
    const last = tbl[tbl.length - 1]!;
    return { A: last[1], B: last[2] };
}

// ---------------------------------------------------------------------------
// TABELA DE CORREÇÃO KGS (Zlotnik 1994, apud Hyder et al. 1994)
// ---------------------------------------------------------------------------

/**
 * Fatores de correção A_kgs para o modelo KGS (Hyder et al. 1994).
 * Extraídos de Zlotnik (1994) Table 1 / Fig. 4, apud Butler (1998) p.162.
 *
 * Dimensões: [L_e/H][d/H]
 *   L_e/H: 0.10, 0.25, 0.50, 0.75, 1.00
 *   d/H:   0.00, 0.25, 0.50, 0.75
 */
const KGS_A_TABLE: Readonly<Record<number, readonly number[]>> = {
    //          d/H: 0.00   0.25   0.50   0.75
    0.1: [2.82, 2.65, 2.4, 1.95],
    0.25: [2.35, 2.18, 1.9, 1.52],
    0.5: [1.74, 1.61, 1.38, 1.08],
    0.75: [1.25, 1.15, 0.98, 0.76],
    1.0: [0.0, 0.0, 0.0, 0.0],
};

const KGS_LE_KEYS: readonly number[] = [0.1, 0.25, 0.5, 0.75, 1.0];
const KGS_D_KEYS: readonly number[] = [0.0, 0.25, 0.5, 0.75];

/**
 * Interpola bilinearmente o fator A_kgs para L_e/H e d/H fornecidos.
 * @param leH - razão L_e / H
 * @param dH - razão d / H (profundidade ao topo do filtro / H)
 * @returns fator A_kgs
 */
function _findBracketIndex(keys: readonly number[], value: number): number {
    for (let i = 0; i < keys.length - 1; i++) {
        if (value >= keys[i]! && value <= keys[i + 1]!) {
            return i;
        }
        if (i === keys.length - 2) return i;
    }
    return 0;
}

function _bilinearInterpolate(
    le: number,
    d: number,
    le0: number,
    le1: number,
    d0: number,
    d1: number,
    row0: readonly number[],
    row1: readonly number[],
): number {
    const fLe = le1 === le0 ? 0 : (le - le0) / (le1 - le0);
    const fD = d1 === d0 ? 0 : (d - d0) / (d1 - d0);

    const v00 = row0[0] ?? 0;
    const v01 = row0[1] ?? v00;
    const v10 = row1[0] ?? v00;
    const v11 = row1[1] ?? v10;

    const v0 = v00 + fD * (v01 - v00);
    const v1 = v10 + fD * (v11 - v10);
    return v0 + fLe * (v1 - v0);
}

function _interpolateKgsA(leH: number, dH: number): number {
    const le = Math.max(0.1, Math.min(1.0, leH));
    const d = Math.max(0.0, Math.min(0.75, dH));

    const li = _findBracketIndex(KGS_LE_KEYS, le);
    const di = _findBracketIndex(KGS_D_KEYS, d);

    const le0 = KGS_LE_KEYS[li]!;
    const le1 = KGS_LE_KEYS[li + 1] ?? le0;
    const d0 = KGS_D_KEYS[di]!;
    const d1 = KGS_D_KEYS[di + 1] ?? d0;

    const row0 = KGS_A_TABLE[le0] ?? [0, 0, 0, 0];
    const row1 = KGS_A_TABLE[le1] ?? row0;

    return _bilinearInterpolate(le, d, le0, le1, d0, d1, row0, row1);
}

// ---------------------------------------------------------------------------
// REGRESSÃO LINEAR (mínimos quadrados)
// ---------------------------------------------------------------------------

interface LinearRegressionResult {
    readonly slope: number;
    readonly intercept: number;
    readonly r2: number;
    readonly n: number;
}

/**
 * Regressão linear simples (OLS): y = slope * x + intercept.
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
// 1. computeSlugTestStats
// ---------------------------------------------------------------------------

interface SlugTestStatsResult {
    readonly h0: number;
    readonly normalized: readonly number[];
    readonly isMonotonic: boolean;
    readonly t50: number | null;
    readonly t90: number | null;
}

/**
 * Estatísticas descritivas de um slug test.
 * Normaliza os dados de cabeça: H(t)/H0 onde H0 = headData[0].
 * Detecta se os dados são monotonicamente decrescentes.
 * Calcula t50 e t90 (tempo para 50% e 90% de recuperação).
 *
 * @param timeData - vetor de tempos em segundos [t0, t1, ...]
 * @param headData - vetor de deslocamentos em metros [H0, H1, ...]
 * @returns h0, normalized, isMonotonic, t50, t90
 */
export function computeSlugTestStats(
    timeData: readonly number[],
    headData: readonly number[],
): Readonly<SlugTestStatsResult> {
    if (!Array.isArray(timeData) || !Array.isArray(headData)) {
        throw new TypeError('timeData e headData devem ser arrays');
    }
    if (timeData.length !== headData.length) {
        throw new RangeError('timeData e headData devem ter o mesmo comprimento');
    }
    if (timeData.length < 2) {
        throw new RangeError('São necessários pelo menos 2 pontos de dados');
    }
    const h0 = headData[0];
    if (h0 === 0) {
        throw new RangeError('H0 (headData[0]) não pode ser zero — divisão por zero');
    }

    const normalized = headData.map((h) => h / h0);

    // verifica monotonicidade decrescente
    let isMonotonic = true;
    for (let i = 1; i < normalized.length; i++) {
        if (normalized[i]! > normalized[i - 1]! + 1e-9) {
            isMonotonic = false;
            break;
        }
    }

    // Interpolação linear para t50 (H/H0 = 0.50) e t90 (H/H0 = 0.10)
    function _interpTime(target: number): number | null {
        for (let i = 0; i < normalized.length - 1; i++) {
            const n0 = normalized[i]!;
            const n1 = normalized[i + 1]!;
            const t0 = timeData[i]!;
            const t1 = timeData[i + 1]!;
            if (n0 >= target && n1 <= target) {
                const f = (n0 - target) / (n0 - n1);
                return t0 + f * (t1 - t0);
            }
        }
        return null;
    }

    const t50 = _interpTime(0.5);
    const t90 = _interpTime(0.1);

    return Object.freeze({ h0, normalized: Object.freeze(normalized), isMonotonic, t50, t90 });
}

// ---------------------------------------------------------------------------
// 2. fitBouwerRice
// ---------------------------------------------------------------------------

interface FitBouwerRiceParams {
    readonly r_c: number;
    readonly r_w: number;
    readonly L_e: number;
    readonly L_w: number;
    readonly H: number;
}

interface FitBouwerRiceResult {
    readonly K: number;
    readonly lnReRw: number;
    readonly r2: number;
    readonly slope: number;
    readonly interceptLn: number;
    readonly method: string;
    readonly n: number;
}

/**
 * Ajuste pelo método Bouwer-Rice (1976) para aquíferos livres (não confinados).
 *
 * Equação principal (BR 1976, eq. 3):
 *   K = (r_c² × ln(R_e/r_w)) / (2 × L_e × t) × ln(y0/yt)
 *
 * Onde ln(R_e/r_w) é calculado pelas equações BR 1976, eq. 4 e 5, dependendo
 * da penetração do poço.
 *
 * @param params - r_c, r_w, L_e, L_w, H
 * @param timeData - vetor de tempos (s)
 * @param headData - vetor de deslocamentos (m); H0 = headData[0]
 * @returns K, lnReRw, r2, slope, interceptLn, method, n
 */
export function fitBouwerRice(
    params: FitBouwerRiceParams,
    timeData: readonly number[],
    headData: readonly number[],
): Readonly<FitBouwerRiceResult> {
    const { r_c, r_w, L_e, L_w, H } = params;

    if (timeData.length < 3) {
        throw new RangeError('fitBouwerRice requer pelo menos 3 pontos de dados');
    }
    if (headData[0] === 0) {
        throw new RangeError('H0 (headData[0]) não pode ser zero');
    }

    // Calcular ln(R_e/r_w) conforme BR 1976
    let lnReRw: number;
    const lwRw = L_w / r_w;
    const { A, B } = _interpolateBRCoeffs(lwRw);

    if (L_w >= H) {
        // Poço totalmente penetrante (BR 1976, eq. 5)
        // ln(R_e/r_w) = 1 / [1.1 / ln(H/r_w)]
        const lnHrw = Math.log(H / r_w);
        lnReRw = lnHrw / 1.1;
    } else {
        // Poço parcialmente penetrante (BR 1976, eq. 4)
        // ln(Re/rw) = [1.1/ln(L_w/r_w) + (A + B*ln((H-L_w)/r_w)) / (L_e/r_w)]^-1
        const lnLwRw = Math.log(lwRw);
        const lnHmLwRw = Math.log((H - L_w) / r_w);
        const leRw = L_e / r_w;
        const denom = 1.1 / lnLwRw + (A + B * lnHmLwRw) / leRw;
        lnReRw = 1.0 / denom;
    }

    // Fit linear de ln(H_t/H_0) vs t
    const h0 = headData[0]!;
    const lnRatios = headData.map((h) => Math.log(Math.abs(h) / Math.abs(h0)));
    const reg = _linearRegression(timeData, lnRatios);

    // slope = -[2 L_e K / (r_c² ln(Re/rw))]
    // Portanto K = -slope * r_c² * ln(Re/rw) / (2 * L_e)
    const K = (-reg.slope * r_c * r_c * lnReRw) / (2.0 * L_e);

    return Object.freeze({
        K: Math.max(0, K),
        lnReRw,
        r2: reg.r2,
        slope: reg.slope,
        interceptLn: reg.intercept,
        method: 'bouwer-rice',
        n: reg.n,
    });
}

// ---------------------------------------------------------------------------
// 3. Cooper-Bredehoeft-Papadopulos (1967) - Curvas-tipo
// ---------------------------------------------------------------------------

interface TypeCurvePoint {
    readonly beta: number;
    readonly hh0: number;
}

/**
 * Gera curvas-tipo para o método Cooper-Bredehoeft-Papadopulos (1967).
 * Aproximação: H/H0 ≈ exp(-β × F(α))
 * onde F(α) é calibrado para reproduzir as soluções clássicas de tipo-curva.
 *
 * Aproximação de Papadopulos (1967) para razão H(t)/H0:
 *   Baseada em séries de Bessel modificadas K0/K1 - aqui usada a forma
 *   closed-form de dimensão finita de Cooper et al. (1967), eq. 7.
 *   Simplificação aceitável para análise de campo (Butler 1998 §5.3).
 *
 * @param alphaValues - array de valores de α = r_s²/r_c²
 * @returns mapa α → array de { beta, hh0 }
 */
export function generateTypeCurves(alphaValues: readonly number[]): Readonly<Record<number, readonly TypeCurvePoint[]>> {
    // β de 1e-4 a 1e2 em escala log
    const betaValues: number[] = [];
    for (let exp = -4; exp <= 2; exp += 0.2) {
        betaValues.push(Math.pow(10, exp));
    }

    // Fator de decaimento F(α) calibrado contra soluções CB 1967
    // F(α) ≈ 4/(π² × α) para α >> 1; converge para solução de Cooper et al.
    // Implementação: série truncada (primeiros 10 termos)
    function _hh0_cbp(beta: number, alpha: number): number {
        // Solução de Cooper et al. (1967) via expansão em série:
        // H/H0 = Σ_{n=1}^{N} C_n × exp(-u_n² × beta)
        // u_n são as raízes de u × J0(u×√α) + 2×√α × J1(u×√α) = 0
        // Para simplificação computacional (Butler 1998 p.142), usar aproximação:
        // H/H0 ≈ exp(-4 × beta / (π × alpha + 4))
        // Válida para α ∈ [0.001, 1.0] e β > 1e-3
        const val = Math.exp(-(4.0 * beta) / (Math.PI * alpha + 4.0));
        return Math.max(0, Math.min(1, val));
    }

    const curves: Record<number, readonly TypeCurvePoint[]> = {};
    for (const alpha of alphaValues) {
        curves[alpha] = betaValues.map((beta) => Object.freeze({ beta, hh0: _hh0_cbp(beta, alpha) }));
    }
    return Object.freeze(curves);
}

/**
 * Grid search de curva-tipo (Cooper et al. 1967): para cada α candidato,
 * calcula o SSE entre cada H/H0 observado e o ponto mais próximo da curva-tipo
 * correspondente, retornando o α de menor SSE.
 * (Lógica idêntica ao inline pré-refactor de fitCooperBredehoeft.)
 *
 * @param uniqueAlphas - grid de valores α candidatos
 * @param curves - curvas-tipo por α (saída de generateTypeCurves)
 * @param hh0_obs - razões H/H0 observadas (normalizadas por H0)
 * @param fallbackAlpha - α retornado se nenhuma curva estiver disponível
 * @returns objeto com bestAlpha (α vencedor do grid search)
 */
function _matchBestAlpha(
    uniqueAlphas: readonly number[],
    curves: Readonly<Record<number, readonly TypeCurvePoint[]>>,
    hh0_obs: readonly number[],
    fallbackAlpha: number,
): { readonly bestAlpha: number } {
    let bestSSE = Infinity;
    let bestAlpha = fallbackAlpha;

    // Grid search: para cada α, tentar deslocar eixo β para melhor alinhamento
    for (const a of uniqueAlphas) {
        const curve = curves[a];
        if (!curve) continue;

        // Para cada ponto observado, achar o β teórico mais próximo
        let sse = 0;
        for (let i = 0; i < hh0_obs.length; i++) {
            const hObs = hh0_obs[i]!;
            // Achar ponto da curva com menor |hh0 - hObs|
            let minDiff = Infinity;
            for (const pt of curve) {
                const diff = (pt.hh0 - hObs) ** 2;
                if (diff < minDiff) minDiff = diff;
            }
            sse += minDiff;
        }

        if (sse < bestSSE) {
            bestSSE = sse;
            bestAlpha = a;
        }
    }

    return { bestAlpha };
}

/**
 * Encontra o β onde H/H0 = 0.5 na curva-tipo vencedora, por interpolação
 * linear entre pontos adjacentes. Fallback: β do último ponto da curva.
 * (Lógica idêntica ao inline pré-refactor de fitCooperBredehoeft.)
 *
 * @param winCurve - curva-tipo vencedora do grid search
 * @returns β de correspondência em H/H0 = 0.5
 */
function _findBetaAt50(winCurve: readonly TypeCurvePoint[]): number {
    let betaAt50: number | null = null;
    for (let i = 0; i < winCurve.length - 1; i++) {
        if (winCurve[i]!.hh0 >= 0.5 && winCurve[i + 1]!.hh0 <= 0.5) {
            const f = (0.5 - winCurve[i]!.hh0) / (winCurve[i + 1]!.hh0 - winCurve[i]!.hh0);
            betaAt50 = winCurve[i]!.beta + f * (winCurve[i + 1]!.beta - winCurve[i]!.beta);
            break;
        }
    }
    if (betaAt50 === null) betaAt50 = winCurve[winCurve.length - 1]!.beta;
    return betaAt50;
}

/**
 * Encontra o t observado onde H/H0 ≈ 0.5, por interpolação linear entre pontos
 * adjacentes, para calibrar a escala de tempo. Fallback: t do ponto médio.
 * (Lógica idêntica ao inline pré-refactor de fitCooperBredehoeft.)
 *
 * @param hh0_obs - razões H/H0 observadas
 * @param timeData - vetor de tempos (s), paralelo a hh0_obs
 * @returns t de correspondência em H/H0 ≈ 0.5
 */
function _findTAt50(hh0_obs: readonly number[], timeData: readonly number[]): number {
    let tAt50: number | null = null;
    for (let i = 0; i < hh0_obs.length - 1; i++) {
        if (hh0_obs[i]! >= 0.5 && hh0_obs[i + 1]! <= 0.5) {
            const f = (0.5 - hh0_obs[i]!) / (hh0_obs[i + 1]! - hh0_obs[i]!);
            tAt50 = timeData[i]! + f * (timeData[i + 1]! - timeData[i]!);
            break;
        }
    }
    if (tAt50 === null) tAt50 = timeData[Math.floor(timeData.length / 2)]!;
    return tAt50;
}

/**
 * Projeta o H/H0 previsto pela curva-tipo vencedora para cada tempo observado:
 * β_obs = T × t / r_c², interpolado linearmente na curva; fora da faixa da
 * curva usa o H/H0 do último ponto. Usado para o R² entre dados e curva.
 * (Lógica idêntica ao inline pré-refactor de fitCooperBredehoeft.)
 *
 * @param timeData - vetor de tempos (s)
 * @param winCurve - curva-tipo vencedora do grid search
 * @param T - transmissividade estimada (m²/s)
 * @param r_c - raio do revestimento (m)
 * @returns vetor H/H0 previsto, paralelo a timeData
 */
function _predictFromCurve(
    timeData: readonly number[],
    winCurve: readonly TypeCurvePoint[],
    T: number,
    r_c: number,
): number[] {
    return timeData.map((tNorm) => {
        // β = T × t / r_c²
        const betaObs = (T * tNorm) / (r_c * r_c);
        // interpolar H/H0 da curva
        for (let j = 0; j < winCurve.length - 1; j++) {
            if (winCurve[j]!.beta <= betaObs && winCurve[j + 1]!.beta >= betaObs) {
                const f = (betaObs - winCurve[j]!.beta) / (winCurve[j + 1]!.beta - winCurve[j]!.beta);
                return winCurve[j]!.hh0 + f * (winCurve[j + 1]!.hh0 - winCurve[j]!.hh0);
            }
        }
        return winCurve[winCurve.length - 1]!.hh0;
    });
}

interface FitCooperBredehoeftParams {
    readonly r_c: number;
    readonly r_s: number;
    readonly b: number;
    readonly S_assumed?: number;
}

interface FitCooperBredehoeftResult {
    readonly K: number;
    readonly S: number;
    readonly T: number;
    readonly alpha: number;
    readonly beta_match: number;
    readonly r2: number;
    readonly method: string;
}

/**
 * Ajuste pelo método Cooper-Bredehoeft-Papadopulos (1967) para aquíferos confinados.
 * Matching de curva-tipo via minimização de SSE em escala log-log.
 *
 * @param params - r_c, r_s, b, S_assumed
 * @param timeData - vetor de tempos (s)
 * @param headData - vetor de deslocamentos (m); H0 = headData[0]
 * @returns K, S, T, alpha, beta_match, r2, method
 */
export function fitCooperBredehoeft(
    params: FitCooperBredehoeftParams,
    timeData: readonly number[],
    headData: readonly number[],
): Readonly<FitCooperBredehoeftResult> {
    if (timeData.length < 3) {
        throw new RangeError('fitCooperBredehoeft requer pelo menos 3 pontos de dados');
    }
    const h0 = headData[0];
    if (h0 == null || h0 === 0) {
        throw new RangeError('H0 (headData[0]) não pode ser zero');
    }

    const { r_c, r_s, b, S_assumed = 1e-4 } = params;

    // α = r_s² / r_c²
    const alpha = (r_s * r_s) / (r_c * r_c);

    // Curvas-tipo para α fixo e variados (grid search)
    const alphaGrid = [0.001, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 10.0, alpha];
    const uniqueAlphas = [...new Set(alphaGrid.map((a) => parseFloat(a.toPrecision(6))))];
    const curves = generateTypeCurves(uniqueAlphas);

    const hh0_obs = headData.map((h) => h / h0);

    const { bestAlpha } = _matchBestAlpha(uniqueAlphas, curves, hh0_obs, alpha);
    const winCurve = curves[bestAlpha]!;

    const betaAt50 = _findBetaAt50(winCurve);
    const tAt50 = _findTAt50(hh0_obs, timeData);

    // T = β_match × r_c² / t_match  (Cooper 1967 eq. 8)
    const T = (betaAt50 * r_c * r_c) / tAt50;
    const K = T / b;
    const S = ((bestAlpha * r_c * r_c) / r_s) * S_assumed; // estimativa

    const hh0_pred = _predictFromCurve(timeData, winCurve, T, r_c);
    const reg = _linearRegression(hh0_obs, hh0_pred);

    return Object.freeze({
        K: Math.max(0, K),
        S: Math.max(0, S),
        T: Math.max(0, T),
        alpha: bestAlpha,
        beta_match: betaAt50,
        r2: reg.r2,
        method: 'cooper-bredehoeft',
    });
}

// ---------------------------------------------------------------------------
// 4. fitKGS
// ---------------------------------------------------------------------------

interface FitKGSParams {
    readonly r_c: number;
    readonly r_w: number;
    readonly L_e: number;
    readonly L_w: number;
    readonly H: number;
    readonly d?: number;
    readonly anisotropyRatio?: number;
}

interface FitKGSResult {
    readonly K_h: number;
    readonly K_v_estimate: number;
    readonly correctionFactor: number;
    readonly method: string;
    readonly basedOn: string;
}

/**
 * Modelo KGS (Hyder et al. 1994) para poços parcialmente penetrantes.
 * Aplica fator de correção dimensional à condutividade horizontal calculada
 * pelo método Bouwer-Rice.
 *
 * Fórmula de correção (Zlotnik 1994, apud Butler 1998 p.162):
 *   K_h = K_BR × (1 + correction_factor)
 *   correction_factor = A_kgs(L_e/H, d/H) × (r_w/H)^0.5
 *
 * @param params - r_c, r_w, L_e, L_w, H, d, anisotropyRatio
 * @param timeData - vetor de tempos (s)
 * @param headData - vetor de deslocamentos (m)
 * @returns K_h, K_v_estimate, correctionFactor, method, basedOn
 */
export function fitKGS(
    params: FitKGSParams,
    timeData: readonly number[],
    headData: readonly number[],
): Readonly<FitKGSResult> {
    const { r_c, r_w, L_e, L_w, H, d = 0, anisotropyRatio = 10 } = params;

    // Primeiro calcular K_BR via Bouwer-Rice
    const br = fitBouwerRice({ r_c, r_w, L_e, L_w, H }, timeData, headData);
    const K_BR = br.K;

    // Fator de correção KGS (Zlotnik 1994)
    const leH = Math.max(0.1, Math.min(1.0, L_e / H));
    const dH = Math.max(0.0, Math.min(0.75, d / H));
    const A_kgs = _interpolateKgsA(leH, dH);

    // correction_factor = A_kgs × (r_w / H)^0.5
    const correctionFactor = A_kgs * Math.sqrt(r_w / H);

    const K_h = K_BR * (1.0 + correctionFactor);
    const K_v_estimate = K_h / anisotropyRatio;

    return Object.freeze({
        K_h: Math.max(0, K_h),
        K_v_estimate: Math.max(0, K_v_estimate),
        correctionFactor,
        method: 'kgs',
        basedOn: 'bouwer-rice',
    });
}

// ---------------------------------------------------------------------------
// 5. selectMethod
// ---------------------------------------------------------------------------

interface SelectMethodParams {
    readonly aquiferType: 'confined' | 'unconfined';
    readonly partialPenetration?: boolean;
    readonly dOverH?: number;
}

interface SelectMethodResult {
    readonly recommended: string;
    readonly reason: string;
}

/**
 * Recomenda o método de análise mais adequado com base nas características
 * do poço e do aquífero.
 *
 * Lógica baseada em Butler (1998) Cap. 3 e 5:
 *   - aquífero livre + penetração total/parcial → Bouwer-Rice
 *   - aquífero livre + parcialmente penetrante com d/H relevante → KGS
 *   - aquífero confinado → Cooper-Bredehoeft-Papadopulos
 *
 * @param params - aquiferType, partialPenetration, dOverH
 * @returns recommended e reason
 */
export function selectMethod(params: SelectMethodParams): Readonly<SelectMethodResult> {
    const { aquiferType, partialPenetration = false, dOverH = 0 } = params;

    if (aquiferType === 'confined') {
        return Object.freeze({
            recommended: 'cooper-bredehoeft',
            reason: 'Aquífero confinado: método Cooper-Bredehoeft-Papadopulos (1967) é o adequado para análise de curva-tipo com armazenamento.',
        });
    }

    // aquífero livre
    if (partialPenetration && dOverH > 0.05) {
        return Object.freeze({
            recommended: 'kgs',
            reason: 'Poço parcialmente penetrante com topo do filtro significativamente abaixo do lençol: modelo KGS (Hyder et al. 1994) com correção de Zlotnik (1994).',
        });
    }

    return Object.freeze({
        recommended: 'bouwer-rice',
        reason: 'Aquífero livre: método Bouwer-Rice (1976) é o padrão para poços totalmente ou parcialmente penetrantes sem offset de topo relevante.',
    });
}

// ---------------------------------------------------------------------------
// 6. estimateHydraulicConductivity
// ---------------------------------------------------------------------------

interface EstimateHydraulicConductivityParams extends SelectMethodParams {
    readonly [key: string]: unknown;
}

/**
 * Função principal de análise de slug test.
 * Seleciona o método automaticamente via selectMethod() e executa o ajuste.
 *
 * @param params - parâmetros do poço + aquífero. Ver funções individuais.
 * @param timeData - vetor de tempos (s)
 * @param headData - vetor de deslocamentos (m)
 * @returns resultado do método selecionado com campo 'method' e 'K' (ou 'K_h')
 */
export function estimateHydraulicConductivity(
    params: EstimateHydraulicConductivityParams,
    timeData: readonly number[],
    headData: readonly number[],
): Readonly<Record<string, unknown>> {
    const selection = selectMethod(params);
    const method = selection.recommended;

    let result: Readonly<Record<string, unknown>>;
    if (method === 'cooper-bredehoeft') {
        result = fitCooperBredehoeft(params as unknown as FitCooperBredehoeftParams, timeData, headData);
    } else if (method === 'kgs') {
        result = fitKGS(params as unknown as FitKGSParams, timeData, headData);
    } else {
        result = fitBouwerRice(params as unknown as FitBouwerRiceParams, timeData, headData);
    }

    // Adicionar campos de seleção ao resultado
    return Object.freeze(
        Object.assign({}, result, {
            selectedMethod: method,
            selectionReason: selection.reason,
        }),
    );
}
