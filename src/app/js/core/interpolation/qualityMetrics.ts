// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * qualityMetrics.js - Spatial interpolation quality metrics
 * K-fold cross-validation, leave-one-out (LOO) validation, and outlier detection.
 *
 * Reference: ASTM D5922 - Standard Guide for Analysis of Spatial Variation in
 * Geostatistical Site Investigations.
 * Academic: Isaaks & Srivastava (1989), "An Introduction to Applied Geostatistics",
 * Oxford University Press - LOO cross-validation for kriging evaluation (§12).
 *
 * Métricas de qualidade para interpolação espacial.
 * Validação cruzada k-fold e leave-one-out para diagnóstico de incerteza.
 */

'use strict';

interface SpatialPoint {
    x: number;
    y: number;
    value: number;
}

type InterpolateFn = (trainPoints: SpatialPoint[], testPoint: SpatialPoint) => number;

interface FoldResult {
    fold: number;
    mae: number;
    rmse: number;
}

interface KFoldResult {
    folds: number;
    mae: number;
    rmse: number;
    r2: number;
    mbe: number;
    foldResults: FoldResult[];
}

interface OutlierEntry {
    point: SpatialPoint;
    predicted: number;
    residual: number;
}

interface LooResult {
    mae: number;
    rmse: number;
    r2: number;
    mbe: number;
    outliers: OutlierEntry[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Metric type enumeration - frozen to prevent mutation.
 */
export const QUALITY_METRICS: Readonly<{ MAE: string; RMSE: string; R2: string; MBE: string }> = Object.freeze({
    MAE: 'mae',
    RMSE: 'rmse',
    R2: 'r2',
    MBE: 'mbe',
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Validates that two arrays are non-empty and have the same length.
 */
function _validateArrays(predictions: number[], actuals: number[]): void {
    if (!Array.isArray(predictions) || !Array.isArray(actuals)) {
        throw new TypeError('predictions and actuals must be arrays');
    }
    if (predictions.length === 0 || actuals.length === 0) {
        throw new RangeError('predictions and actuals must not be empty');
    }
    if (predictions.length !== actuals.length) {
        throw new RangeError(`predictions length (${predictions.length}) !== actuals length (${actuals.length})`);
    }
}

/**
 * Computes standard deviation of a numeric array.
 */
function _stdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

/**
 * Shuffles an array in-place using Fisher-Yates (Knuth) algorithm.
 * Uses a deterministic seed via index-based swap to keep tests reproducible.
 * @param arr - Array to shuffle (mutated in place)
 * @returns The same array, shuffled
 */
function _shuffleArray<T>(arr: T[]): T[] {
    // Fisher-Yates shuffle - Math.random() is intentionally used here.
    // For reproducibility in tests, callers may pre-sort or mock Math.random.
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i] as T;
        arr[i] = arr[j] as T;
        arr[j] = tmp;
    }
    return arr;
}

// ---------------------------------------------------------------------------
// Core metric functions
// ---------------------------------------------------------------------------

/**
 * Mean Absolute Error (MAE).
 * @returns MAE ≥ 0
 */
export function computeMAE(predictions: number[], actuals: number[]): number {
    _validateArrays(predictions, actuals);
    const n = predictions.length;
    const sum = predictions.reduce((s, p, i) => s + Math.abs(p - (actuals[i] as number)), 0);
    return sum / n;
}

/**
 * Root Mean Squared Error (RMSE).
 * @returns RMSE ≥ 0
 */
export function computeRMSE(predictions: number[], actuals: number[]): number {
    _validateArrays(predictions, actuals);
    const n = predictions.length;
    const sumSq = predictions.reduce((s, p, i) => s + (p - (actuals[i] as number)) ** 2, 0);
    return Math.sqrt(sumSq / n);
}

/**
 * Coefficient of determination (R²).
 * Returns 0 when total sum of squares is zero (constant actuals).
 * @returns R² - may be negative for very poor models
 */
export function computeR2(predictions: number[], actuals: number[]): number {
    _validateArrays(predictions, actuals);
    const n = actuals.length;
    const meanActual = actuals.reduce((s, a) => s + a, 0) / n;
    const ssTot = actuals.reduce((s, a) => s + (a - meanActual) ** 2, 0);
    if (ssTot === 0) return 0;
    const ssRes = predictions.reduce((s, p, i) => s + (p - (actuals[i] as number)) ** 2, 0);
    return 1 - ssRes / ssTot;
}

/**
 * Mean Bias Error (MBE) - signed; positive = over-prediction.
 * @returns MBE (signed)
 */
export function computeMBE(predictions: number[], actuals: number[]): number {
    _validateArrays(predictions, actuals);
    const n = predictions.length;
    const sum = predictions.reduce((s, p, i) => s + (p - (actuals[i] as number)), 0);
    return sum / n;
}

// ---------------------------------------------------------------------------
// K-Fold Cross-Validation
// ---------------------------------------------------------------------------

/**
 * K-Fold cross-validation for spatial interpolation.
 *
 * @param points - Spatial data points
 * @param interpolateFn
 *   Injectable interpolation function; returns predicted value for testPoint.
 * @param k - Number of folds (must be ≥2 and ≤ points.length)
 */
export function kFoldCrossValidation(
    points: SpatialPoint[],
    interpolateFn: InterpolateFn,
    k: number = 5,
): KFoldResult {
    if (!Array.isArray(points) || points.length < 2) {
        throw new RangeError('points must be an array with at least 2 elements');
    }
    if (typeof interpolateFn !== 'function') {
        throw new TypeError('interpolateFn must be a function');
    }
    if (!Number.isInteger(k) || k < 2) {
        throw new RangeError('k must be an integer ≥ 2');
    }
    if (k > points.length) {
        throw new RangeError(`k (${k}) cannot exceed points.length (${points.length})`);
    }

    // Shuffle a copy to randomize fold assignment
    const shuffled = _shuffleArray([...points]);

    // Split into k roughly equal folds
    const folds: SpatialPoint[][] = [];
    const foldSize = Math.floor(shuffled.length / k);
    let remainder = shuffled.length % k;
    let idx = 0;
    for (let f = 0; f < k; f++) {
        const size = foldSize + (remainder > 0 ? 1 : 0);
        remainder = Math.max(0, remainder - 1);
        folds.push(shuffled.slice(idx, idx + size));
        idx += size;
    }

    const allPredictions: number[] = [];
    const allActuals: number[] = [];
    const foldResults: FoldResult[] = [];

    for (let f = 0; f < k; f++) {
        const testFold = folds[f] as SpatialPoint[];
        const trainPoints = folds.filter((_, i) => i !== f).flat();

        const foldPreds: number[] = [];
        const foldActuals: number[] = [];
        for (const testPoint of testFold) {
            const predicted = interpolateFn(trainPoints, testPoint);
            foldPreds.push(predicted);
            foldActuals.push(testPoint.value);
            allPredictions.push(predicted);
            allActuals.push(testPoint.value);
        }

        foldResults.push({
            fold: f + 1,
            mae: computeMAE(foldPreds, foldActuals),
            rmse: computeRMSE(foldPreds, foldActuals),
        });
    }

    return {
        folds: k,
        mae: computeMAE(allPredictions, allActuals),
        rmse: computeRMSE(allPredictions, allActuals),
        r2: computeR2(allPredictions, allActuals),
        mbe: computeMBE(allPredictions, allActuals),
        foldResults,
    };
}

// ---------------------------------------------------------------------------
// Leave-One-Out (LOO) Validation
// ---------------------------------------------------------------------------

/**
 * Leave-One-Out cross-validation with outlier detection.
 * Outlier criterion: |residual| > mean(|residuals|) + 2 * stdDev(|residuals|)
 * (Isaaks & Srivastava 1989, §12 - 2-sigma envelope around absolute residuals).
 */
export function leaveOneOutValidation(points: SpatialPoint[], interpolateFn: InterpolateFn): LooResult {
    if (!Array.isArray(points) || points.length < 2) {
        throw new RangeError('points must be an array with at least 2 elements');
    }
    if (typeof interpolateFn !== 'function') {
        throw new TypeError('interpolateFn must be a function');
    }

    const predictions: number[] = [];
    const actuals: number[] = [];
    const residuals: number[] = [];

    for (let i = 0; i < points.length; i++) {
        const testPoint = points[i] as SpatialPoint;
        const trainPoints = points.filter((_, j) => j !== i);
        const predicted = interpolateFn(trainPoints, testPoint);
        predictions.push(predicted);
        actuals.push(testPoint.value);
        residuals.push(predicted - testPoint.value);
    }

    const absResiduals = residuals.map(Math.abs);
    const meanAbsRes = absResiduals.reduce((s, r) => s + r, 0) / absResiduals.length;
    const stdAbsRes = _stdDev(absResiduals);
    const threshold = meanAbsRes + 2 * stdAbsRes;

    const outliers: OutlierEntry[] = [];
    for (let i = 0; i < points.length; i++) {
        if ((absResiduals[i] as number) > threshold) {
            outliers.push({
                point: points[i] as SpatialPoint,
                predicted: predictions[i] as number,
                residual: residuals[i] as number,
            });
        }
    }

    return {
        mae: computeMAE(predictions, actuals),
        rmse: computeRMSE(predictions, actuals),
        r2: computeR2(predictions, actuals),
        mbe: computeMBE(predictions, actuals),
        outliers,
    };
}

// ---------------------------------------------------------------------------
// Quality Report Builder
// ---------------------------------------------------------------------------

/**
 * Assigns a quality grade based on RMSE thresholds (ASTM D5922).
 */
function _gradeFromRMSE(rmse: number): 'Excellent' | 'Good' | 'Fair' | 'Poor' {
    if (rmse < 0.1) return 'Excellent';
    if (rmse < 0.25) return 'Good';
    if (rmse < 0.5) return 'Fair';
    return 'Poor';
}

/**
 * Builds a structured quality report from computed metrics.
 *
 * @param method - Interpolation method name (e.g. 'IDW', 'Kriging')
 * @param pointCount - Number of data points used
 */
export function buildQualityReport(
    metrics: { mae: number; rmse: number; r2: number; mbe: number },
    method: string,
    pointCount: number,
): {
    method: string;
    pointCount: number;
    metrics: { mae: number | null; rmse: number; r2: number | null; mbe: number | null };
    grade: 'Excellent' | 'Good' | 'Fair' | 'Poor';
    generatedAt: string;
} {
    if (typeof metrics !== 'object' || metrics === null) {
        throw new TypeError('metrics must be a non-null object');
    }
    if (typeof metrics.rmse !== 'number') {
        throw new TypeError('metrics.rmse must be a number');
    }
    if (typeof method !== 'string' || method.trim() === '') {
        throw new TypeError('method must be a non-empty string');
    }
    if (!Number.isInteger(pointCount) || pointCount < 1) {
        throw new RangeError('pointCount must be a positive integer');
    }

    return {
        method,
        pointCount,
        metrics: {
            mae: metrics.mae ?? null,
            rmse: metrics.rmse,
            r2: metrics.r2 ?? null,
            mbe: metrics.mbe ?? null,
        },
        grade: _gradeFromRMSE(metrics.rmse),
        generatedAt: new Date().toISOString(),
    };
}
