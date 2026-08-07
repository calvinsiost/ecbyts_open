// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   Regression on Order Statistics (ROS) — Helsel 2012 §5.4
   Robust ROS: imputação individual + momentos no dataset combinado
   ================================================================ */

import { normQuantile, samplePercentile } from './_math.js';

/**
 * ROS log-normal para dados censurados à esquerda (single DL).
 *
 * Algoritmo (Helsel 2012 §5.4, forma robusta):
 * 1. Ordena observações por valor ascendente.
 * 2. Blom plotting positions: p_i = (i − 0.375) / (n + 0.25).
 * 3. Scores normais: z_i = Φ⁻¹(p_i).
 * 4. OLS nos detectados: log(x_det) = μ + σ·z.
 * 5. Imputa censurados: loĝ(x_cens) = μ + σ·z_cens, back-transform exp().
 * 6. Momentos e percentis do dataset combinado (detectados + imputados).
 *
 * @param {Array<{value: number, censored: boolean}>} observations
 * @param {object} [opts={}] - reservado para extensões futuras (ex: transform)
 * @returns {Readonly<{rosEstimate: number[], mean: number, sd: number, p50: number, p75: number, p95: number, n: number, nCensored: number, detectRate: number, rSquared: number, mu: number, sigma: number}>}
 * @throws {RangeError} se < 3 observações, ou < 1 detectado, ou todos detectados
 * @throws {TypeError} se input inválido
 */
export function regressionOnOrderStatistics(
    observations: Array<{ value: number; censored: boolean }>,
    opts: object = {},
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
    mu: number;
    sigma: number;
}> {
    void opts;
    if (!Array.isArray(observations)) {
        throw new TypeError('regressionOnOrderStatistics: observations must be an array');
    }
    if (observations.length < 3) {
        throw new RangeError('regressionOnOrderStatistics: requires at least 3 observations');
    }

    if (
        !observations.every(
            (o) => o && typeof o === 'object' && Number.isFinite(o.value) && typeof o.censored === 'boolean',
        )
    ) {
        throw new TypeError(
            'regressionOnOrderStatistics: each observation must have {value: number, censored: boolean}',
        );
    }

    const n = observations.length;
    const nCensored = observations.filter((o) => o.censored === true).length;
    const nDetected = n - nCensored;
    const detectRate = nDetected / n;

    if (nDetected < 1) {
        throw new RangeError('regressionOnOrderStatistics: at least one detected value required');
    }
    if (nCensored === 0) {
        throw new RangeError('regressionOnOrderStatistics: all values are detected — use standard statistics instead');
    }

    // ── 1. Ordenação combinada + ranks ──
    const sorted = [...observations].map((o, origIdx) => ({ ...o, origIdx })).sort((a, b) => a.value - b.value);

    // ── 2. Blom plotting positions + normal scores ──
    const withZ = sorted.map((o, idx) => {
        const rank = idx + 1;
        const p = (rank - 0.375) / (n + 0.25);
        const z = normQuantile(p);
        return { ...o, rank, p, z };
    });

    // ── 3. OLS nos detectados: log(y) ~ z ──
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
        ssxy += ((zDet[i] as number) - mZ) * ((logY[i] as number) - mY);
        ssxx += ((zDet[i] as number) - mZ) ** 2;
    }

    if (ssxx === 0) {
        throw new RangeError('regressionOnOrderStatistics: degenerate OLS (all z values equal)');
    }

    const sigma = ssxy / ssxx;
    const mu = mY - sigma * mZ;

    // R² do fit nos detectados
    const ssTotal = logY.reduce((s, v) => s + (v - mY) ** 2, 0);
    const ssRes = logY.reduce((s, v, i) => s + (v - (mu + sigma * (zDet[i] as number))) ** 2, 0);
    const rSquared = ssTotal > 0 ? 1 - ssRes / ssTotal : 1;

    // ── 4. Imputação dos censurados ──
    const censored = withZ.filter((o) => o.censored);
    const imputedLog = censored.map((o) => mu + sigma * o.z);
    const imputedValues = imputedLog.map((lv) => Math.exp(lv));

    // ── 5. Dataset combinado + momentos robustos ──
    const allValues = [...detected.map((o) => o.value), ...imputedValues].sort((a, b) => a - b);
    const rosEstimate = allValues;

    const mean = allValues.reduce((s, v) => s + v, 0) / allValues.length;
    const variance = allValues.reduce((s, v) => s + (v - mean) ** 2, 0) / (allValues.length - 1);
    const sd = variance > 0 ? Math.sqrt(variance) : 0;

    const p50 = samplePercentile(allValues, 0.5);
    const p75 = samplePercentile(allValues, 0.75);
    const p95 = samplePercentile(allValues, 0.95);

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
        mu,
        sigma,
    });
}
