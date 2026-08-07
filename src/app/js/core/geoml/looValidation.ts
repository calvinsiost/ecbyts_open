// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   G4_GEOML — Leave-One-Out cross-validation
   Referência: Rasmussen & Williams 2006 §5.4.2 "LOO predictive
   probability", Hastie/Tibshirani/Friedman 2009 §7.10.

   SPEC §Q4: "LOO cross-validation comparando com Kriging" — métrica
   objetiva de ganho sobre baseline.

   Implementação ingênua: refit GP N vezes, uma para cada ponto excluído.
   Sem DOM, sem rede.
   ================================================================ */
import { fitGP, predictGP } from './gpRegression.js';

// ----------------------------------------------------------------
// LOO predictions
// ----------------------------------------------------------------
/**
 * Leave-One-Out predictions: for each training point, fit GP on all other
 * points and predict the excluded one.
 */
export function looPredictions({
    X,
    y,
    kernelFn,
    noise = 1e-4,
    jitter = 1e-8,
}: {
    X: number[][];
    y: number[];
    kernelFn: (...args: any[]) => any;
    noise?: number;
    jitter?: number;
}): { predictions: number[]; variances: number[]; residuals: number[] } {
    if (!Array.isArray(X) || X.length < 2) {
        throw new RangeError('LOO requires at least 2 training points');
    }
    if (!Array.isArray(y) || y.length !== X.length) {
        throw new RangeError('y length mismatch');
    }
    const n = X.length;
    const predictions = new Array(n);
    const variances = new Array(n);
    const residuals = new Array(n);
    for (let i = 0; i < n; i++) {
        const Xi = X.filter((_, idx) => idx !== i);
        const yi = y.filter((_, idx) => idx !== i);
        const gp = fitGP({ X: Xi, y: yi, kernelFn, noise, jitter });
        const { mean, variance } = predictGP(gp, [X[i]!]);
        predictions[i] = mean[0]!;
        variances[i] = variance[0]!;
        residuals[i] = y[i]! - mean[0]!;
    }
    return { predictions, variances, residuals };
}

// ----------------------------------------------------------------
// Metrics
// ----------------------------------------------------------------
/** Mean Absolute Error. */
export function mae(residuals: number[]): number {
    if (!Array.isArray(residuals) || residuals.length === 0) return 0;
    let s = 0;
    for (const r of residuals) s += Math.abs(r);
    return s / residuals.length;
}

/** Root Mean Squared Error. */
export function rmse(residuals: number[]): number {
    if (!Array.isArray(residuals) || residuals.length === 0) return 0;
    let s = 0;
    for (const r of residuals) s += r * r;
    return Math.sqrt(s / residuals.length);
}

/**
 * Coefficient of determination R² = 1 - SS_res / SS_tot.
 * Returns 0 when yTrue is constant (avoid div by zero).
 */
export function r2(residuals: number[], yTrue: number[]): number {
    if (!Array.isArray(residuals) || !Array.isArray(yTrue) || residuals.length !== yTrue.length) {
        throw new RangeError('residuals and yTrue must have same length');
    }
    const n = yTrue.length;
    if (n === 0) return 0;
    let mean = 0;
    for (const v of yTrue) mean += v;
    mean /= n;
    let ssTot = 0;
    for (const v of yTrue) {
        const d = v - mean;
        ssTot += d * d;
    }
    if (ssTot === 0) return 0; // constant yTrue — R² undefined, return 0
    let ssRes = 0;
    for (const r of residuals) ssRes += r * r;
    return 1 - ssRes / ssTot;
}

/** Convenience: compute all three metrics at once. */
export function metrics(
    residuals: number[],
    yTrue: number[],
): { mae: number; rmse: number; r2: number } {
    return {
        mae: mae(residuals),
        rmse: rmse(residuals),
        r2: r2(residuals, yTrue),
    };
}
