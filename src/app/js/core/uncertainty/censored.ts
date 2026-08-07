// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CENSORED STATISTICS — SPEC_RECONCILIATION_002_NON_DETECT v0.5

   Pure helpers para dados censurados à esquerda (non-detects em ambientais):
   - kaplanMeierLeftCensored: KM left-censored (flip-trick, Helsel 2012)
   - regressionOnOrderStatistics: ROS Q-Q log-normal (Helsel 2012 §5.4)
   - estimateMoments: mean, sd, cv, percentiles
   - chooseNDMethod: heuristic method selection (Helsel 2012 §3.3)

   Referência: Helsel, D.R. "Statistics for Censored Environmental Data
   Using Minitab and R" Wiley 2012 (2nd ed). ADR-UNCERTAINTY-ND-002.

   Algoritmos EPA-recomendados para non-detect datasets.
   ================================================================ */


// ──────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────

/**
 * Normal quantile (probit) approximation.
 * Usa Abramowitz & Stegun 26.2.17 com extensão para caudas.
 * Precisão suficiente para Q-Q plots ambientais.
 * @param {number} p - probability in (0, 1)
 * @returns {number} z-score
 */
function _normQuantile(p: number): number {
    if (p <= 0 || p >= 1) return NaN;
    const c: [number, number, number] = [2.515517, 0.802853, 0.010328];
    const d: [number, number, number] = [1.432788, 0.189269, 0.001308];
    const sign = p < 0.5 ? 1 : -1;
    const pMapped = p < 0.5 ? p : 1 - p;
    const t = Math.sqrt(-2 * Math.log(pMapped));
    const z = t - (c[0] + c[1] * t + c[2] * t * t) / (1 + d[0] * t + d[1] * t * t + d[2] * t * t * t);
    return sign * z;
}

/**
 * Computa percentil de uma distribuição definida por arrays de x e CDF F(x).
 * Interpolação linear entre pontos da CDF.
 * @param {number[]} xs - valores ordenados ascendentes
 * @param {number[]} cdf - F(x) correspondente, não-decrescente
 * @param {number} p - probabilidade 0..1
 * @returns {number}
 */
function _interpolatePercentile(xs: number[], cdf: number[], p: number): number {
    if (xs.length === 0) return NaN;
    if (p <= cdf[0]!) return xs[0]!;
    if (p >= cdf[cdf.length - 1]!) return xs[xs.length - 1]!;
    for (let i = 1; i < cdf.length; i++) {
        if (cdf[i]! >= p) {
            const t = (p - cdf[i - 1]!) / (cdf[i]! - cdf[i - 1]!);
            return xs[i - 1]! + t * (xs[i]! - xs[i - 1]!);
        }
    }
    return xs[xs.length - 1]!;
}

interface CensoredObservation {
    value: number;
    censored: boolean;
}

// ──────────────────────────────────────────────────────────────────────
// 1. Kaplan-Meier left-censored estimator
// ──────────────────────────────────────────────────────────────────────

/**
 * Estimador Kaplan-Meier para dados censurados à esquerda.
 *
 * Algoritmo (reverse-time trick para left-censoring, Helsel 2012 §4.2):
 * - Ordena observações por valor DESCENDENTE (flip do tempo)
 * - Para cada nível de limite de detecção t_i (maior → menor):
 *     d_i = censored obs exatamente em t_i
 *     n_i = obs com value >= t_i (em risco)
 *     S(t_i) = S(t_{i-1}) × (1 - d_i / n_i)
 * - CDF: F(x) = 1 - S(x)
 * - Momentos: integração numérica da função de sobrevivência
 *
 * @param {Array<{value: number, censored: boolean}>} observations
 * @returns {Readonly<{kmEstimate: Array<{x: number, survival: number, cdf: number}>, mean: number, sd: number, p50: number, p75: number, p95: number, n: number, nCensored: number, detectRate: number}>}
 * @throws {RangeError} se observations.length < 2
 * @throws {RangeError} se todas as obs são censuradas
 */
export function kaplanMeierLeftCensored(
    observations: CensoredObservation[],
): Readonly<{
    kmEstimate: Array<{ x: number; survival: number; cdf: number }>;
    mean: number;
    sd: number;
    p50: number;
    p75: number;
    p95: number;
    n: number;
    nCensored: number;
    detectRate: number;
}> {
    if (!Array.isArray(observations) || observations.length < 2) {
        throw new RangeError('kaplanMeierLeftCensored: requires at least 2 observations');
    }

    const n = observations.length;
    const nCensored = observations.filter((o) => o.censored === true).length;
    const nDetected = n - nCensored;
    const detectRate = nDetected / n;

    if (detectRate === 0) {
        throw new RangeError('kaplanMeierLeftCensored: KM requires at least one detected value');
    }

    // ── Reverse-time (flip) KM trick para left-censoring (Helsel 2012 §4.2) ──
    // 1. Criar dados "flipped": Y_i = C - X_i onde C > max(X)
    //    Obs left-censored → right-censored no tempo Y (censored=true → tipo RIGHT em Y)
    //    Obs detected (not censored) → eventos no tempo Y (censored=false → "death" em Y)
    // 2. Aplicar KM padrão right-censored a Y (S decresce em "events" = detectados)
    // 3. Back-transform: S_left(x) = S_right(C - x)
    const maxVal = Math.max(...observations.map((o) => o.value));
    const C = maxVal * 1.01 + 1; // shift > max para garantir Y > 0

    const flipped = observations
        .map((o) => ({
            y: C - o.value,
            eventInY: !o.censored, // detected no original = evento (death) no Y reverso
        }))
        .sort((a, b) => a.y - b.y); // ordena por Y ascendente

    // KM right-censored padrão em Y
    // Eventos (death) nos detectados originais → degrau da survival
    let S = 1.0;
    let atRisk = n;
    const stepsY: Array<{ y: number; S: number }> = []; // { y, S }

    let i = 0;
    while (i < flipped.length) {
        const t = flipped[i]!.y;
        let events = 0; // detected no original (= deaths em Y)
        let countTied = 0;
        let j = i;
        while (j < flipped.length && flipped[j]!.y === t) {
            if (flipped[j]!.eventInY) events++;
            countTied++;
            j++;
        }
        if (events > 0) {
            S = S * (1 - events / atRisk);
            stepsY.push({ y: t, S });
        }
        atRisk -= countTied;
        i = j;
    }

    // Back-transform: x = C - y
    // Em Y-space: S_Y(y) = P(Y > y)
    // Na escala original: S_left(x) = P(X > x) = P(C-Y > x) = P(Y < C-x) = F_Y(C-x) = 1 - S_Y(C-x)
    // Portanto: survival_left(x) = 1 - S_Y(at y=C-x)
    // Monta: para cada step em Y_space com y e S_Y(y), o x original é (C - y),
    // e a survival na escala original é 1 - S_Y(y).
    const steps = stepsY.map((s) => ({ x: C - s.y, S: 1 - s.S })).sort((a, b) => a.x - b.x);

    // Monta a função de CDF: F(x) = 1 - S(x)
    const kmEstimate = steps.map((s) => ({ x: s.x, survival: s.S, cdf: 1 - s.S }));

    // ── Integração numérica para momentos ──
    // E[X] = integral de S(x) dx de 0 a maxX
    // Precisa de pontos: x=0 (S=1), cada passo, e x=maxX (S=S_final)
    const xForInteg = [0, ...steps.map((s) => s.x)];
    const sForInteg = [1, ...steps.map((s) => s.S)];

    // Além do último passo, S permanece constante até maxX
    if (xForInteg[xForInteg.length - 1]! < maxVal) {
        xForInteg.push(maxVal);
        sForInteg.push(sForInteg[sForInteg.length - 1]!);
    }

    let mean = 0;
    let ex2 = 0;
    for (let k = 1; k < xForInteg.length; k++) {
        const dx = xForInteg[k]! - xForInteg[k - 1]!;
        const sLeft = sForInteg[k - 1]!; // S é constante no intervalo [x_{k-1}, x_k)
        mean += sLeft * dx;
        const xMid = (xForInteg[k - 1]! + xForInteg[k]!) / 2;
        ex2 += 2 * xMid * sLeft * dx;
    }

    const variance = ex2 - mean * mean;
    const sd = variance > 0 ? Math.sqrt(variance) : 0;

    // ── Percentis por interpolação linear na CDF ──
    const cdfXs = kmEstimate.map((e) => e.x);
    const cdfVals = kmEstimate.map((e) => e.cdf);

    const p50 = _interpolatePercentile(cdfXs, cdfVals, 0.5);
    const p75 = _interpolatePercentile(cdfXs, cdfVals, 0.75);
    const p95 = _interpolatePercentile(cdfXs, cdfVals, 0.95);

    return Object.freeze({
        kmEstimate,
        mean,
        sd,
        p50,
        p75,
        p95,
        n,
        nCensored,
        detectRate,
    });
}

// ──────────────────────────────────────────────────────────────────────
// 2. Regression on Order Statistics (ROS) - Helsel 2012 §5.4
// ──────────────────────────────────────────────────────────────────────

/**
 * ROS log-normal para dados censurados à esquerda.
 *
 * Algoritmo (Helsel 2012 §5.4):
 * 1. Blom plotting positions: z_i = normQuantile((i - 0.375) / (n + 0.25))
 * 2. OLS em valores detectados: log(x) = mu + sigma * z
 * 3. Imputação dos censurados: log_imputed = mu + sigma * z_j
 * 4. Momentos log-normais combinando detectados + imputados
 *
 * @param {Array<{value: number, censored: boolean}>} observations
 * @param {object} [opts={}] - opções (reservado para extensões futuras)
 * @returns {Readonly<{rosEstimate: number[], mean: number, sd: number, p50: number, p75: number, p95: number, n: number, nCensored: number, detectRate: number, rSquared: number}>}
 * @throws {RangeError} se < 3 observações, ou < 1 detectado, ou todos detectados
 */
export function regressionOnOrderStatistics(
    observations: CensoredObservation[],
    opts: Record<string, any> = {},
): Readonly<{
    rosEstimate: number[];
    mean: number;
    sd: number;
    p50: number;
    p75: number;
    p95: number;
    n: number;
    nCensored: number;
    detectRate: number;
    rSquared: number;
}> {
    void opts; // reservado para extensões futuras
    if (!Array.isArray(observations) || observations.length < 3) {
        throw new RangeError('regressionOnOrderStatistics: requires at least 3 observations');
    }

    const n = observations.length;
    const nCensored = observations.filter((o) => o.censored === true).length;
    const nDetected = n - nCensored;
    const detectRate = nDetected / n;

    if (nDetected < 1) {
        throw new RangeError('regressionOnOrderStatistics: at least one detected value required for OLS fit');
    }
    if (nCensored === 0) {
        throw new RangeError('regressionOnOrderStatistics: all values are detected — use standard statistics instead');
    }

    // Ordena todas as observações por valor ASCENDENTE para atribuição de ranks
    const sorted = [...observations].map((o, origIdx) => ({ ...o, origIdx })).sort((a, b) => a.value - b.value);

    // Atribui rank 1..n e calcula Blom plotting positions
    // z_i = normQuantile((i - 0.375) / (n + 0.25))  (Blom 1958)
    const withZ = sorted.map((o, idx) => {
        const rank = idx + 1;
        const p = (rank - 0.375) / (n + 0.25);
        const z = _normQuantile(p);
        return { ...o, rank, p, z };
    });

    // OLS nos valores DETECTADOS: log(x_detected) ~ z
    const detected = withZ.filter((o) => !o.censored);
    if (detected.length < 2) {
        throw new RangeError('regressionOnOrderStatistics: at least 2 detected values required for OLS fit');
    }

    const logY = detected.map((o) => Math.log(o.value));
    const zDet = detected.map((o) => o.z);

    const mZ = zDet.reduce((s, v) => s + v, 0) / zDet.length;
    const mY = logY.reduce((s, v) => s + v, 0) / logY.length;
    let ssxy = 0;
    let ssxx = 0;
    for (let i = 0; i < zDet.length; i++) {
        ssxy += (zDet[i]! - mZ) * (logY[i]! - mY);
        ssxx += (zDet[i]! - mZ) ** 2;
    }

    if (ssxx === 0) {
        throw new RangeError('regressionOnOrderStatistics: degenerate OLS (all z values equal)');
    }

    const sigma = ssxy / ssxx; // slope = log-normal sigma
    const mu = mY - sigma * mZ; // intercept = log-normal mu

    // R² do fit nos detectados
    const ssTotal = logY.reduce((s, v) => s + (v - mY) ** 2, 0);
    const ssRes = logY.reduce((s, v, i) => s + (v - (mu + sigma * zDet[i]!)) ** 2, 0);
    const rSquared = ssTotal > 0 ? 1 - ssRes / ssTotal : 1;

    // Imputa os censurados: log_imputed = mu + sigma * z_censored
    const censored = withZ.filter((o) => o.censored);
    const imputedLog = censored.map((o) => mu + sigma * o.z);
    const imputedValues = imputedLog.map((lv) => Math.exp(lv));

    // Dataset combinado: valores detectados + valores imputados dos censurados
    const allValues = [...detected.map((o) => o.value), ...imputedValues].sort((a, b) => a - b);
    const rosEstimate = allValues;

    // Momentos log-normais (usando mu e sigma ajustados - parâmetros do fit)
    const mean = Math.exp(mu + (sigma * sigma) / 2);
    const variance = (Math.exp(sigma * sigma) - 1) * Math.exp(2 * mu + sigma * sigma);
    const sd = Math.sqrt(variance);

    // Percentis analíticos (log-normal)
    const p50 = Math.exp(mu + sigma * _normQuantile(0.5));
    const p75 = Math.exp(mu + sigma * _normQuantile(0.75));
    const p95 = Math.exp(mu + sigma * _normQuantile(0.95));

    return Object.freeze({
        rosEstimate,
        mean,
        sd,
        p50,
        p75,
        p95,
        n,
        nCensored,
        detectRate,
        rSquared,
    });
}

// ──────────────────────────────────────────────────────────────────────
// 3. estimateMoments - extrai momentos + CV de qualquer resultado KM/ROS
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa momentos estatísticos a partir de resultado KM ou ROS.
 *
 * @param {{ mean: number, sd: number, p50: number, p75: number, p95: number }} estimate
 * @returns {Readonly<{mean: number, sd: number, cv: number, p50: number, p75: number, p95: number}>}
 * @throws {TypeError} se estimate não tem campos mean/sd
 */
export function estimateMoments(estimate: {
    mean: number;
    sd: number;
    p50: number;
    p75: number;
    p95: number;
}): Readonly<{ mean: number; sd: number; cv: number; p50: number; p75: number; p95: number }> {
    if (!estimate || typeof estimate.mean !== 'number' || typeof estimate.sd !== 'number') {
        throw new TypeError('estimateMoments: estimate must have numeric mean and sd fields');
    }
    const { mean, sd, p50, p75, p95 } = estimate;
    const cv = mean !== 0 ? sd / mean : NaN;
    return Object.freeze({ mean, sd, cv, p50, p75, p95 });
}

// ──────────────────────────────────────────────────────────────────────
// 4. chooseNDMethod - seleção heurística (Helsel 2012 §3.3)
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide método de não-detecção automaticamente baseado em detectRate + N.
 * Segue as diretrizes de Helsel 2012 §3.3.
 *
 * Nota: exportado como `chooseNDMethodCensored` no barrel index.js para
 * evitar colisão com `chooseNDMethod` de matrix.js (assinatura diferente).
 *
 * @param {Array<{value: number, censored: boolean}>} observations
 * @param {string} [matrix='groundwater']
 * @returns {Readonly<{method: string, rationale: string, detectRate: number}>}
 */
export function chooseNDMethod(
    observations: CensoredObservation[],
    matrix = 'groundwater',
): Readonly<{ method: string; rationale: string; detectRate: number }> {
    void matrix; // reservado — a heurística v0.5 é independente de matrix
    if (!Array.isArray(observations) || observations.length < 5) {
        return Object.freeze({
            method: 'insufficient_data',
            rationale: 'n < 5 — too few observations for KM or ROS',
            detectRate: observations?.length ? observations.filter((o) => !o.censored).length / observations.length : 0,
        });
    }

    const n = observations.length;
    const nDetected = observations.filter((o) => !o.censored).length;
    const detectRate = nDetected / n;

    if (detectRate < 0.1) {
        return Object.freeze({
            method: 'insufficient_data',
            rationale: '<10% detects — report UCL only',
            detectRate,
        });
    }
    if (detectRate < 0.5) {
        return Object.freeze({
            method: 'kaplan_meier',
            rationale: '<50% detects — KM preferred over ROS',
            detectRate,
        });
    }
    if (detectRate < 0.8) {
        return Object.freeze({
            method: 'kaplan_meier',
            rationale: '50-80% detects — KM is robust',
            detectRate,
        });
    }
    return Object.freeze({
        method: 'ros',
        rationale: '>=80% detects — ROS OLS fit reliable',
        detectRate,
    });
}

// ──────────────────────────────────────────────────────────────────────
// Legacy exports preserved for backward compatibility (v0.4 API)
// ──────────────────────────────────────────────────────────────────────

export const ND_METHODS = Object.freeze([
    'half-dl',
    'half-dl-clamp-median',
    'half-dl-clamp-geomean',
    'kaplan-meier',
    'ros',
]);

export const DETECT_RATE_THRESHOLDS = Object.freeze({
    MIN_FOR_KM: 0.5,
    MIN_FOR_ROS: 0.5,
    MIN_N_FOR_KM: 10,
    MIN_N_FOR_ROS: 8,
    WARN_BELOW: 0.3,
});

/**
 * @param {Array<{value: number, censored: boolean}>} observations
 * @returns {boolean}
 */
export function isValidObservationSet(observations: CensoredObservation[]): boolean {
    if (!Array.isArray(observations) || observations.length === 0) return false;
    return observations.every((o) => {
        if (!o || typeof o !== 'object') return false;
        return Number.isFinite(o.value) && o.value > 0 && typeof o.censored === 'boolean';
    });
}

/**
 * @param {Array<{value: number, censored: boolean}>} observations
 * @returns {number}
 */
export function computeDetectRate(observations: CensoredObservation[]): number {
    if (!Array.isArray(observations) || observations.length === 0) return 0;
    const detected = observations.filter((o) => o && o.censored === false).length;
    return detected / observations.length;
}

/**
 * Decide método ND automaticamente - legado v0.4 API.
 * Para a API v0.5 ver chooseNDMethod.
 *
 * @param {{ observations: Array<any>, matrix?: string, overrideMethod?: string }} input
 * @returns {{ method: string, reason: string, detectRate: number, n: number, warning?: string }}
 */
export function chooseNDMethodAdvanced(input: {
    observations: Array<any>;
    matrix?: string;
    overrideMethod?: string;
}): { method: string; reason: string; detectRate: number; n: number; warning?: string } {
    const obs = Array.isArray(input?.observations) ? input.observations : [];
    const n = obs.length;
    const detectRate = computeDetectRate(obs);

    if (input?.overrideMethod && ND_METHODS.includes(input.overrideMethod)) {
        return { method: input.overrideMethod, reason: 'user_override', detectRate, n };
    }
    if (n < DETECT_RATE_THRESHOLDS.MIN_N_FOR_KM) {
        return {
            method: 'half-dl',
            reason: `n=${n} < ${DETECT_RATE_THRESHOLDS.MIN_N_FOR_KM} (sample too small)`,
            detectRate,
            n,
        };
    }
    if (detectRate < DETECT_RATE_THRESHOLDS.WARN_BELOW) {
        return {
            method: 'half-dl-clamp-median',
            reason: 'detectRate < 30%, KM/ROS unreliable',
            detectRate,
            n,
            warning: 'Considere reportar apenas UCL95',
        };
    }
    if (detectRate >= DETECT_RATE_THRESHOLDS.MIN_FOR_KM && n >= DETECT_RATE_THRESHOLDS.MIN_N_FOR_KM) {
        return {
            method: 'kaplan-meier',
            reason: `auto: detectRate=${(detectRate * 100).toFixed(0)}%, n=${n}`,
            detectRate,
            n,
        };
    }
    return {
        method: 'half-dl-clamp-median',
        reason: `detectRate=${(detectRate * 100).toFixed(0)}% insufficient for KM`,
        detectRate,
        n,
    };
}
