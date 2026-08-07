// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   Kaplan-Meier estimator for left-censored data
   Helsel 2012, §4.2 — reverse-time (flip) trick
   ================================================================ */

import { interpolatePercentile } from './_math.js';

interface KMObservation {
    value: number;
    censored: boolean;
}

interface KMPoint {
    x: number;
    survival: number;
    cdf: number;
}

interface KMResult {
    kmEstimate: KMPoint[];
    mean: number;
    sd: number;
    p50: number;
    p75: number;
    p95: number;
    n: number;
    nCensored: number;
    detectRate: number;
}

/**
 * Estimador Kaplan-Meier para dados censurados à esquerda.
 *
 * Algoritmo (flip-trick, Helsel 2012 §4.2):
 * 1. Transforma left-censoring em right-censoring via Y = C − X.
 * 2. Aplica KM padrão right-censored em Y.
 * 3. Back-transform: F_X(x) = S_Y(C − x).
 * 4. Momentos por integração exata da função step de sobrevivência.
 * 5. Percentis por interpolação linear na CDF.
 *
 * @param observations
 * @throws {RangeError} se observations.length < 2
 * @throws {RangeError} se todas as observações são censuradas
 * @throws {TypeError} se input inválido
 */
export function kaplanMeierLeftCensored(observations: Array<KMObservation>): Readonly<KMResult> {
    if (!Array.isArray(observations)) {
        throw new TypeError('kaplanMeierLeftCensored: observations must be an array');
    }
    if (observations.length < 2) {
        throw new RangeError('kaplanMeierLeftCensored: requires at least 2 observations');
    }

    const n = observations.length;
    const nCensored = observations.filter((o) => o && o.censored === true).length;
    const nDetected = n - nCensored;
    const detectRate = nDetected / n;

    if (detectRate === 0) {
        throw new RangeError('kaplanMeierLeftCensored: KM requires at least one detected value');
    }

    if (
        !observations.every(
            (o) => o && typeof o === 'object' && Number.isFinite(o.value) && typeof o.censored === 'boolean',
        )
    ) {
        throw new TypeError('kaplanMeierLeftCensored: each observation must have {value: number, censored: boolean}');
    }

    // ── 1. Flip trick ──
    const maxVal = Math.max(...observations.map((o) => o.value));
    const C = maxVal * 1.01 + 1; // shift > max para garantir Y > 0

    const flipped = observations
        .map((o) => ({
            y: C - o.value,
            eventInY: !o.censored, // detected no original = evento (death) no Y reverso
        }))
        .sort((a, b) => a.y - b.y);

    // ── 2. KM right-censored padrão em Y ──
    let S = 1.0;
    let atRisk = n;
    const stepsY: Array<{ y: number; S: number }> = [];

    let i = 0;
    while (i < flipped.length) {
        const t = flipped[i]!.y;
        let events = 0;
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

    // ── 3. Back-transform ──
    // F_X(x) = S_Y(C - x)  e  S_X(x) = 1 - F_X(x)
    const steps = stepsY.map((s) => ({ x: C - s.y, S: 1 - s.S })).sort((a, b) => a.x - b.x);

    const kmEstimate = steps.map((s) => ({
        x: s.x,
        survival: s.S,
        cdf: 1 - s.S,
    }));

    // ── 4. Momentos - integração exata da step function ──
    // E[X]   = ∫_0^max S(x) dx
    // E[X²]  = ∫_0^max 2·x·S(x) dx  →  Var = E[X²] − E[X]²
    const xInt = [0, ...steps.map((s) => s.x)];
    const sInt = [1, ...steps.map((s) => s.S)];

    if (xInt[xInt.length - 1]! < maxVal) {
        xInt.push(maxVal);
        sInt.push(sInt[sInt.length - 1]!);
    }

    let mean = 0;
    let ex2 = 0;
    for (let k = 1; k < xInt.length; k++) {
        const dx = xInt[k]! - xInt[k - 1]!;
        const sLeft = sInt[k - 1]!;
        mean += sLeft * dx;
        ex2 += sLeft * (xInt[k]! ** 2 - xInt[k - 1]! ** 2);
    }

    const variance = ex2 - mean * mean;
    const sd = variance > 0 ? Math.sqrt(variance) : 0;

    // ── 5. Percentis ──
    const cdfXs = kmEstimate.map((e) => e.x);
    const cdfVals = kmEstimate.map((e) => e.cdf);

    const p50 = interpolatePercentile(cdfXs, cdfVals, 0.5);
    const p75 = interpolatePercentile(cdfXs, cdfVals, 0.75);
    const p95 = interpolatePercentile(cdfXs, cdfVals, 0.95);

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
