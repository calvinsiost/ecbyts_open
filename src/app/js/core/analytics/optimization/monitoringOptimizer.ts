// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * monitoringOptimizer.js
 * Monitoring Network Optimization - Kriging Variance Reduction + D-Optimality
 *
 * Implements greedy sequential design for environmental monitoring networks.
 * Criteria: variance reduction (kriging-based), D-optimality (information matrix),
 * and cost-weighted selection.
 *
 * Academic reference:
 *   Müller, W.G. (2007). Collecting Spatial Data. Springer.
 *   ISBN 978-3-540-31180-6
 *   Chapters 4 (variance reduction) and 6 (D-optimal design).
 *
 * @module core/analytics/optimization/monitoringOptimizer
 */

// ---------------------------------------------------------------------------
// Criteria constants
// ---------------------------------------------------------------------------

/**
 * Supported optimization criteria for monitoring network design.
 * @type {Readonly<{VARIANCE_REDUCTION: string, D_OPTIMALITY: string, COST_WEIGHTED: string}>}
 */
export const OPTIMIZATION_CRITERIA = Object.freeze({
    VARIANCE_REDUCTION: 'variance_reduction',
    D_OPTIMALITY: 'd_optimality',
    COST_WEIGHTED: 'cost_weighted',
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Euclidean distance between two 2-D or 3-D points.
 * @param {number[]} a - [x, y] or [x, y, z]
 * @param {number[]} b - [x, y] or [x, y, z]
 * @returns {number}
 */
function euclidean(a: number[], b: number[]): number {
    let sum = 0;
    const n = Math.min(a.length, b.length, 3);
    for (let i = 0; i < n; i++) {
        const d = (a[i] ?? 0) - (b[i] ?? 0);
        sum += d * d;
    }
    return Math.sqrt(sum);
}

/**
 * Minimum Euclidean distance from a point to a set of points.
 * @param {number[][]} points
 * @param {number[]} candidate
 * @returns {number} Infinity when points is empty.
 */
function minDistanceTo(points: number[][], candidate: number[]): number {
    if (!points || points.length === 0) return Infinity;
    let min = Infinity;
    for (const p of points) {
        const d = euclidean(p, candidate);
        if (d < min) min = d;
    }
    return min;
}

/**
 * Determinant of a square matrix via cofactor expansion (supports 1×1, 2×2, 3×3).
 * Returns 0 for unsupported sizes.
 * @param {number[][]} M - Square matrix (rows of arrays)
 * @returns {number}
 */
function det(M: number[][]): number {
    const n = M.length;
    if (n === 1) return M[0]![0]!;
    if (n === 2) {
        return M[0]![0]! * M[1]![1]! - M[0]![1]! * M[1]![0]!;
    }
    if (n === 3) {
        return (
            M[0]![0]! * (M[1]![1]! * M[2]![2]! - M[1]![2]! * M[2]![1]!) -
            M[0]![1]! * (M[1]![0]! * M[2]![2]! - M[1]![2]! * M[2]![0]!) +
            M[0]![2]! * (M[1]![0]! * M[2]![1]! - M[1]![1]! * M[2]![0]!)
        );
    }
    // Generic Laplace expansion along first row for n > 3
    let result = 0;
    for (let col = 0; col < n; col++) {
        const minor = M.slice(1).map((row) => row.filter((_, j) => j !== col));
        result += (col % 2 === 0 ? 1 : -1) * M[0]![col]! * det(minor);
    }
    return result;
}

/**
 * Matrix transpose.
 * @param {number[][]} M
 * @returns {number[][]}
 */
function transpose(M: number[][]): number[][] {
    if (!M.length) return [];
    return M[0]!.map((_, col) => M.map((row) => row[col]!));
}

/**
 * Matrix multiplication A × B.
 * @param {number[][]} A
 * @param {number[][]} B
 * @returns {number[][]}
 */
function matMul(A: number[][], B: number[][]): number[][] {
    const rows = A.length;
    const cols = B[0]!.length;
    const inner = B.length;
    const C = Array.from({ length: rows }, () => new Array(cols).fill(0));
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            for (let k = 0; k < inner; k++) {
                C[i]![j] += A[i]![k]! * B[k]![j]!;
            }
        }
    }
    return C;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute kriging-based variance reduction when adding a candidate point.
 *
 * Uses simplified formula derived from Müller (2007) §4.2:
 *   variance_reduction = 1 - exp(-d_min / variogramRange)
 * where d_min is the minimum Euclidean distance from candidatePoint to any
 * existing monitoring point. Returns 0 when existingPoints is empty or invalid.
 *
 * @param {number[][]} existingPoints - Array of [x, y] or [x, y, z] coordinates.
 * @param {number[]} candidatePoint   - [x, y] or [x, y, z] coordinates.
 * @param {number} variogramRange     - Variogram range (same units as coordinates).
 * @returns {number} Scalar in [0, 1].
 */
export function computeKrigingVarianceReduction(existingPoints: number[][], candidatePoint: number[], variogramRange: number): number {
    // Sem pontos existentes: nova amostra não reduz variância relativa
    if (!existingPoints || existingPoints.length === 0) return 0;
    if (!candidatePoint || candidatePoint.length === 0) return 0;
    if (!variogramRange || variogramRange <= 0) return 0;

    const dMin = minDistanceTo(existingPoints, candidatePoint);
    if (!isFinite(dMin)) return 0;

    return 1 - Math.exp(-dMin / variogramRange);
}

/**
 * Compute D-optimality criterion: log(det(X'X)).
 *
 * A higher value indicates more informative design (Müller 2007 §6.1).
 * Returns -Infinity when the information matrix is singular (det ≈ 0).
 *
 * @param {number[][]} designMatrix - m × p matrix where m = observations, p = parameters.
 * @returns {number} log(det(X'X)) or -Infinity.
 */
export function computeDOptimality(designMatrix: number[][]): number {
    if (!designMatrix || designMatrix.length === 0) return -Infinity;
    if (!designMatrix[0] || designMatrix[0].length === 0) return -Infinity;

    const Xt = transpose(designMatrix);
    const XtX = matMul(Xt, designMatrix);
    const d = det(XtX);

    if (Math.abs(d) < 1e-12) return -Infinity;
    return Math.log(d);
}

function scoreCandidate(
    criterion: string,
    current: number[][],
    candidate: number[],
    costs: number[] | null,
    candidateIdx: number,
    variogramRange: number,
): number {
    if (criterion === OPTIMIZATION_CRITERIA.VARIANCE_REDUCTION) {
        return computeKrigingVarianceReduction(current, candidate, variogramRange);
    }

    if (criterion === OPTIMIZATION_CRITERIA.D_OPTIMALITY) {
        // Avaliar ganho de D-optimalidade ao adicionar este ponto
        const augmented = [...current, candidate];
        // Design matrix: [1, x, y] para cada ponto
        const X = augmented.map((p) => [1, p[0] ?? 0, p[1] ?? 0]);
        return computeDOptimality(X);
    }

    // COST_WEIGHTED: variância reduzida por unidade de custo
    const vr = computeKrigingVarianceReduction(current, candidate, variogramRange);
    const cost = costs && costs[candidateIdx]! > 0 ? costs[candidateIdx]! : 1;
    const maxCost = costs ? Math.max(...costs.filter((c) => c > 0), 1) : 1;
    const normCost = cost / maxCost;
    return vr / normCost;
}

function findBestCandidate(
    remaining: number[][],
    current: number[][],
    criterion: string,
    costs: number[] | null,
    variogramRange: number,
): { bestIdx: number; bestScore: number } {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i]!;
        const score = scoreCandidate(criterion, current, candidate, costs, i, variogramRange);

        if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
        }
    }

    return { bestIdx, bestScore };
}

/**
 * Greedy sequential optimization of monitoring network.
 *
 * Iteratively selects the candidate point that maximises the chosen criterion:
 *   - VARIANCE_REDUCTION: maximize kriging variance reduction
 *   - D_OPTIMALITY: maximize gain in log(det(X'X))
 *   - COST_WEIGHTED: variance_reduction / normalized_cost
 *
 * @param {number[][]} existingPoints   - Already-sampled locations [x, y] or [x, y, z].
 * @param {number[][]} candidatePoints  - Pool of candidate locations.
 * @param {number}     nToAdd           - Number of points to select.
 * @param {string}     criterion        - One of OPTIMIZATION_CRITERIA values.
 * @param {object}     [options]
 * @param {number}     [options.variogramRange=1]  - For VARIANCE_REDUCTION / COST_WEIGHTED.
 * @param {number[]}   [options.costs]             - Per-candidate cost vector (COST_WEIGHTED).
 * @returns {{selectedPoints: number[][], optimizationPath: {step:number, point:number[], score:number}[], totalScore: number}}
 */
export function greedyOptimize(existingPoints: number[][], candidatePoints: number[][], nToAdd: number, criterion: string, options: { variogramRange?: number; costs?: number[] } = {}): {selectedPoints: number[][], optimizationPath: {step:number, point:number[], score:number}[], totalScore: number} {
    if (!candidatePoints || candidatePoints.length === 0) {
        return { selectedPoints: [], optimizationPath: [], totalScore: 0 };
    }

    const validCriteria = Object.values(OPTIMIZATION_CRITERIA) as string[];
    if (!validCriteria.includes(criterion)) {
        throw new Error(`Unknown criterion "${criterion}". Valid: ${validCriteria.join(', ')}`);
    }

    const variogramRange = options.variogramRange ?? 1;
    const costs = options.costs ?? null;

    const current = (existingPoints ?? []).map((p) => [...p]);
    const remaining = candidatePoints.map((p) => [...p]);
    const selectedPoints: number[][] = [];
    const optimizationPath: { step: number; point: number[]; score: number }[] = [];
    let totalScore = 0;

    const nSelect = Math.min(nToAdd, remaining.length);

    for (let step = 0; step < nSelect; step++) {
        const { bestIdx, bestScore } = findBestCandidate(remaining, current, criterion, costs, variogramRange);

        if (bestIdx === -1) break;

        const chosen = remaining.splice(bestIdx, 1)[0]!;
        if (costs) costs.splice(bestIdx, 1);
        current.push(chosen);
        selectedPoints.push(chosen);
        optimizationPath.push({ step: step + 1, point: chosen, score: bestScore });
        totalScore += bestScore;
    }

    return { selectedPoints, optimizationPath, totalScore };
}

/**
 * Estimate sampling campaign cost for a set of points.
 *
 * @param {number[][]} points          - Selected sampling locations.
 * @param {number}     costPerSample   - Unit cost per sample (same currency unit).
 * @param {number}     mobilizationCost - Fixed campaign mobilization cost.
 * @returns {{totalCost: number, perSampleCost: number, mobilizationCost: number, breakdown: {sampleCount: number, variableCost: number, fixedCost: number}}}
 */
export function estimateSamplingCost(points: number[][], costPerSample: number, mobilizationCost: number): {totalCost: number, perSampleCost: number, mobilizationCost: number, breakdown: {sampleCount: number, variableCost: number, fixedCost: number}} {
    const sampleCount = Array.isArray(points) ? points.length : 0;
    const unitCost = costPerSample >= 0 ? costPerSample : 0;
    const fixedCost = mobilizationCost >= 0 ? mobilizationCost : 0;
    const variableCost = sampleCount * unitCost;
    const totalCost = variableCost + fixedCost;

    return {
        totalCost,
        perSampleCost: unitCost,
        mobilizationCost: fixedCost,
        breakdown: {
            sampleCount,
            variableCost,
            fixedCost,
        },
    };
}

/**
 * Build a summary optimization report.
 *
 * @param {number[][]} existingPoints  - Pre-existing monitoring locations.
 * @param {number[][]} selectedPoints  - Newly selected locations from greedyOptimize.
 * @param {string}     criterion       - Criterion used.
 * @returns {{criterion: string, existingCount: number, addedCount: number, coverageImprovement: number, reportedAt: string}}
 */
export function buildOptimizationReport(existingPoints: number[][], selectedPoints: number[][], criterion: string): {criterion: string, existingCount: number, addedCount: number, coverageImprovement: number, reportedAt: string} {
    const existingCount = Array.isArray(existingPoints) ? existingPoints.length : 0;
    const addedCount = Array.isArray(selectedPoints) ? selectedPoints.length : 0;
    const total = existingCount + addedCount;
    const coverageImprovement = total > 0 ? addedCount / total : 0;

    return {
        criterion,
        existingCount,
        addedCount,
        coverageImprovement,
        reportedAt: new Date().toISOString(),
    };
}
