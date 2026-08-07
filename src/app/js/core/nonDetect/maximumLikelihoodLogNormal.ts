// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   Maximum Likelihood Estimation (MLE) of a LOG-NORMAL distribution
   for LEFT-CENSORED (non-detect) environmental data.
   ----------------------------------------------------------------
   Pure-logic core module: zero DOM, zero network, zero browser deps.

   Provenance (academic):
   - Helsel, D.R. (2012). "Statistics for Censored Environmental Data
     Using Minitab and R", 2nd ed., Wiley. Chapter 10 ("Estimating
     Means, Variances and Percentiles" — maximum likelihood for
     censored data). ISBN: 978-0-470-47988-9.
   - Cohen, A.C. (1959). "Simplified estimators for the normal
     distribution when samples are singly censored or truncated",
     Technometrics 1(3):217-237. DOI: 10.1080/00401706.1959.10489859.
   - Cohen, A.C. (1991). "Truncated and Censored Samples: Theory and
     Applications", Marcel Dekker. ISBN: 978-0-8247-8447-0.
   - Aitchison, J. & Brown, J.A.C. (1957). "The Lognormal
     Distribution", Cambridge University Press. (Log-space transform
     of the lognormal to the normal for ML fitting.)

   Why a dedicated MLE estimator (vs. Kaplan-Meier and ROS):
   The non-detect toolkit already ships KM (distribution-free EDF) and
   ROS (semi-parametric regression substitution). MLE is the third
   pillar in Helsel's framework: it is the most efficient estimator
   when the parametric (lognormal) assumption holds, and unlike ROS it
   uses every censored observation through the exact survival term of
   the likelihood rather than an imputed plotting position. Helsel
   (2012, §10.2) recommends MLE for moderate-to-large samples that are
   plausibly lognormal; ROS for smaller samples; KM when distributional
   form is doubtful.

   Model (log-space y = ln x ~ Normal(mu, sigma)):
     - A DETECTED value x_i contributes the density:   f(y_i) = phi((y_i - mu)/sigma) / sigma
     - A LEFT-CENSORED value (x < DL_j, "<DL") contributes the probability
       mass below its detection limit: P(X < DL_j) = Phi((ln DL_j - mu)/sigma)
   so the log-likelihood is
     L(mu, sigma) = sum_det [ -ln(sigma) - 0.5*ln(2*pi) - 0.5*((y_i - mu)/sigma)^2 ]
                  + sum_cens [ ln Phi((ln DL_j - mu)/sigma) ]
   maximized numerically (Nelder-Mead simplex) over (mu, sigma>0).

   Reported moments are on the ORIGINAL (arithmetic) scale via the exact
   lognormal back-transform (Aitchison & Brown 1957):
     mean = exp(mu + sigma^2/2)
     var  = (exp(sigma^2) - 1) * exp(2*mu + sigma^2)
     p    = exp(mu + sigma * z_p)
   ================================================================ */

import { normQuantile } from './_math.js';

/**
 * Standard normal CDF Phi(x) via the Abramowitz & Stegun 7.1.26 erf
 * approximation. Max abs error ~1.5e-7 — adequate for the censored
 * survival term of the likelihood.
 * @internal
 */
function _normalCdf(x: number): number {
    const t = 1 / (1 + 0.3275911 * Math.abs(x));
    const y =
        1 -
        ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
            t *
            Math.exp(-x * x);
    const cdfAbs = 0.5 * (1 + y);
    return x >= 0 ? cdfAbs : 1 - cdfAbs;
}

interface MLEObservation {
    /** Reported concentration. For a censored row this is the detection limit (DL). */
    value: number;
    /** True if the value is a non-detect ("< value"). */
    censored: boolean;
}

interface MLEResult {
    readonly ok: boolean;
    readonly reason: string;
    /** ML estimate of the log-space mean (mu of ln X). */
    readonly mu: number;
    /** ML estimate of the log-space standard deviation (sigma of ln X). */
    readonly sigma: number;
    /** Arithmetic (original-scale) mean = exp(mu + sigma^2/2). */
    readonly mean: number;
    /** Arithmetic (original-scale) standard deviation. */
    readonly sd: number;
    /** Coefficient of variation (sd / mean) on the original scale. */
    readonly cv: number;
    /** Median = exp(mu). */
    readonly p50: number;
    /** 75th percentile = exp(mu + sigma*z_0.75). */
    readonly p75: number;
    /** 95th percentile = exp(mu + sigma*z_0.95). */
    readonly p95: number;
    /** Maximized log-likelihood at (mu, sigma). */
    readonly logLik: number;
    readonly n: number;
    readonly nCensored: number;
    readonly detectRate: number;
    /** Number of simplex iterations actually performed. */
    readonly iterations: number;
    /** True if the optimizer met the convergence tolerance before maxIter. */
    readonly converged: boolean;
}

/**
 * Negative log-likelihood of a left-censored lognormal sample in log-space.
 * Detected logs `yDet`; censored detection-limit logs `yCens`.
 * @internal
 */
function _negLogLik(mu: number, sigma: number, yDet: number[], yCens: number[]): number {
    if (!(sigma > 0)) return Number.POSITIVE_INFINITY;
    const LN_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);
    let nll = 0;
    for (let i = 0; i < yDet.length; i++) {
        const z = ((yDet[i] as number) - mu) / sigma;
        // -ln f = ln(sigma) + 0.5 ln(2pi) + 0.5 z^2
        nll += Math.log(sigma) + LN_SQRT_2PI + 0.5 * z * z;
    }
    for (let j = 0; j < yCens.length; j++) {
        const z = ((yCens[j] as number) - mu) / sigma;
        const p = _normalCdf(z);
        // Floor the survival probability to avoid -Infinity for deep censoring.
        nll += -Math.log(Math.max(p, 1e-300));
    }
    return nll;
}

/**
 * Maximum-likelihood fit of a lognormal distribution to left-censored data.
 *
 * Algorithm (Helsel 2012 §10.2; Cohen 1959):
 * 1. Transform to log-space: y = ln(value). Split into detected y's and
 *    censored detection-limit y's.
 * 2. Seed (mu, sigma) from the detected logs (sample mean / sd), or from
 *    a robust fallback when fewer than 2 detects.
 * 3. Minimize the negative censored log-likelihood with a Nelder-Mead
 *    simplex over (mu, sigma), enforcing sigma > 0.
 * 4. Back-transform to arithmetic-scale moments and percentiles.
 *
 * @param {Array<{value:number, censored:boolean}>} observations
 * @param {{maxIter?:number, tol?:number}} [opts]
 * @returns {MLEResult} `ok:false` (with `reason`) when the sample is
 *   unsuitable (too small, no detects, or all-detected). Never throws on
 *   data shape — returns a frozen result so callers can branch on `ok`.
 */
export function maximumLikelihoodLogNormal(
    observations: Array<MLEObservation>,
    opts: { maxIter?: number; tol?: number } = {},
): Readonly<MLEResult> {
    const fail = (reason: string): Readonly<MLEResult> =>
        Object.freeze({
            ok: false,
            reason,
            mu: NaN,
            sigma: NaN,
            mean: NaN,
            sd: NaN,
            cv: NaN,
            p50: NaN,
            p75: NaN,
            p95: NaN,
            logLik: NaN,
            n: Array.isArray(observations) ? observations.length : 0,
            nCensored: 0,
            detectRate: 0,
            iterations: 0,
            converged: false,
        });

    if (!Array.isArray(observations)) return fail('observations must be an array');
    if (observations.length < 3) return fail('requires at least 3 observations');

    const wellFormed = observations.every(
        (o) => o && typeof o === 'object' && Number.isFinite(o.value) && o.value > 0 && typeof o.censored === 'boolean',
    );
    if (!wellFormed) return fail('each observation must be {value:number>0, censored:boolean}');

    const n = observations.length;
    const yDet: number[] = [];
    const yCens: number[] = [];
    for (const o of observations) {
        if (o.censored) yCens.push(Math.log(o.value));
        else yDet.push(Math.log(o.value));
    }
    const nCensored = yCens.length;
    const nDetected = yDet.length;
    const detectRate = nDetected / n;

    if (nDetected < 2) return fail('at least 2 detected values required for MLE');
    if (nCensored === 0) return fail('all values are detected — use standard lognormal MLE instead');

    // ── Seed from detected logs ──
    const seedMu = yDet.reduce((s, v) => s + v, 0) / nDetected;
    const seedVar = yDet.reduce((s, v) => s + (v - seedMu) ** 2, 0) / Math.max(1, nDetected - 1);
    const seedSigma = seedVar > 0 ? Math.sqrt(seedVar) : 1;

    const maxIter = Number.isFinite(opts.maxIter) && (opts.maxIter as number) > 0 ? (opts.maxIter as number) : 2000;
    const tol = Number.isFinite(opts.tol) && (opts.tol as number) > 0 ? (opts.tol as number) : 1e-9;

    // We optimize over (mu, w) with sigma = exp(w) to keep sigma strictly positive.
    const f = (p: [number, number]): number => _negLogLik(p[0], Math.exp(p[1]), yDet, yCens);

    // ── Nelder-Mead simplex (Nelder & Mead 1965) on 2 parameters ──
    const alpha = 1; // reflection
    const gamma = 2; // expansion
    const rho = 0.5; // contraction
    const sigmaShrink = 0.5; // shrink

    type Vertex = { p: [number, number]; fx: number };
    const w0 = Math.log(seedSigma);
    let simplex: Vertex[] = [
        { p: [seedMu, w0], fx: 0 },
        { p: [seedMu + (Math.abs(seedMu) > 1e-6 ? 0.05 * seedMu : 0.05), w0], fx: 0 },
        { p: [seedMu, w0 + 0.05], fx: 0 },
    ];
    for (const v of simplex) v.fx = f(v.p);

    const centroid = (verts: Vertex[]): [number, number] => {
        // centroid of all but the worst (last after sort)
        let cx = 0;
        let cy = 0;
        for (let i = 0; i < verts.length - 1; i++) {
            cx += verts[i]!.p[0];
            cy += verts[i]!.p[1];
        }
        const k = verts.length - 1;
        return [cx / k, cy / k];
    };

    let iterations = 0;
    let converged = false;
    for (; iterations < maxIter; iterations++) {
        simplex.sort((a, b) => a.fx - b.fx);
        const best = simplex[0]!;
        const worst = simplex[simplex.length - 1]!;
        const secondWorst = simplex[simplex.length - 2]!;

        // Convergence: spread of function values is tiny.
        if (Math.abs(worst.fx - best.fx) <= tol * (Math.abs(best.fx) + tol)) {
            converged = true;
            break;
        }

        const c = centroid(simplex);
        // Reflection
        const xr: [number, number] = [c[0] + alpha * (c[0] - worst.p[0]), c[1] + alpha * (c[1] - worst.p[1])];
        const fr = f(xr);

        if (fr < best.fx) {
            // Expansion
            const xe: [number, number] = [c[0] + gamma * (xr[0] - c[0]), c[1] + gamma * (xr[1] - c[1])];
            const fe = f(xe);
            simplex[simplex.length - 1] = fe < fr ? { p: xe, fx: fe } : { p: xr, fx: fr };
        } else if (fr < secondWorst.fx) {
            simplex[simplex.length - 1] = { p: xr, fx: fr };
        } else {
            // Contraction
            const xc: [number, number] = [c[0] + rho * (worst.p[0] - c[0]), c[1] + rho * (worst.p[1] - c[1])];
            const fc = f(xc);
            if (fc < worst.fx) {
                simplex[simplex.length - 1] = { p: xc, fx: fc };
            } else {
                // Shrink toward best
                const b = best.p;
                simplex = simplex.map((v, i) => {
                    if (i === 0) return v;
                    const np: [number, number] = [
                        b[0] + sigmaShrink * (v.p[0] - b[0]),
                        b[1] + sigmaShrink * (v.p[1] - b[1]),
                    ];
                    return { p: np, fx: f(np) };
                });
            }
        }
    }

    simplex.sort((a, b) => a.fx - b.fx);
    const winner = simplex[0]!;
    const mu = winner.p[0];
    const sigma = Math.exp(winner.p[1]);
    const logLik = -winner.fx;

    if (!Number.isFinite(mu) || !Number.isFinite(sigma) || !(sigma > 0)) {
        return fail('optimizer failed to converge to a finite (mu, sigma)');
    }

    // ── Back-transform to arithmetic scale (Aitchison & Brown 1957) ──
    const s2 = sigma * sigma;
    const mean = Math.exp(mu + s2 / 2);
    const variance = (Math.exp(s2) - 1) * Math.exp(2 * mu + s2);
    const sd = variance > 0 ? Math.sqrt(variance) : 0;
    const cv = mean !== 0 ? sd / mean : NaN;

    const p50 = Math.exp(mu);
    const p75 = Math.exp(mu + sigma * normQuantile(0.75));
    const p95 = Math.exp(mu + sigma * normQuantile(0.95));

    return Object.freeze({
        ok: true,
        reason: 'mle_lognormal',
        mu,
        sigma,
        mean,
        sd,
        cv,
        p50,
        p75,
        p95,
        logLik,
        n,
        nCensored,
        detectRate,
        iterations,
        converged,
    });
}
