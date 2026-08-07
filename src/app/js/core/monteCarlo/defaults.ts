// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

export interface MonteCarloDefaults {
    readonly N_ITERATIONS: number;
    readonly SE_WARN_THRESHOLD: number;
    readonly ADAPTIVE_ENABLED: boolean;
    readonly ADAPTIVE_MIN_N: number;
    readonly ADAPTIVE_MAX_N: number;
    readonly METHOD_INDEPENDENT: string;
    readonly METHOD_CORRELATED: string;
}

export interface ResolveIterationsOptions {
    readonly n?: number;
    readonly adaptive?: boolean;
}

export const MONTE_CARLO_DEFAULTS: MonteCarloDefaults = Object.freeze({
    N_ITERATIONS: 10_000,
    SE_WARN_THRESHOLD: 0.05,
    ADAPTIVE_ENABLED: false,
    ADAPTIVE_MIN_N: 1_000,
    ADAPTIVE_MAX_N: 100_000,
    METHOD_INDEPENDENT: 'LHS-independent',
    METHOD_CORRELATED: 'LHS-correlated',
});

export function resolveIterations(opts?: ResolveIterationsOptions | null): number {
    const n = opts?.n;
    const explicit = typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    if (explicit !== null) return explicit;
    if (opts?.adaptive) return MONTE_CARLO_DEFAULTS.N_ITERATIONS;
    return MONTE_CARLO_DEFAULTS.N_ITERATIONS;
}
