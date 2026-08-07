// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

export interface MCStandardErrorStats {
    mean: number;
    sd: number;
    se: number;
    n: number;
}

export const MC_DEFAULTS: Readonly<{
    N_ITERATIONS: number;
    SE_WARN_THRESHOLD: number;
}>;

export const CORRELATION_METHODS: Readonly<{
    PEARSON: string;
    SPEARMAN: string;
}>;

export function computeMCStandardError(samples: number[]): MCStandardErrorStats;

export function mcConvergenceWarning(
    stats: { mean: number; se: number } | MCStandardErrorStats,
    threshold?: number
): boolean;

export function estimateCorrelationFromData(
    matrix: number[][],
    variableNames?: string[]
): Readonly<{
    pearson: number[][];
    spearman: number[][];
    n: number;
    variableNames: string[];
}>;

export function validateCorrelationMatrix(M: number[][]): Readonly<{
    valid: boolean;
    isPositiveDefinite: boolean;
    minEigenvalue: number;
    errors: string[];
}>;

export function patchNearestPD(M: number[][]): number[][];

export function imanConoverRankCorrelation(samples: number[][], targetCorrelation: number[][]): number[][];
