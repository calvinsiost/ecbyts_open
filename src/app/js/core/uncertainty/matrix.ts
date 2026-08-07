// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * matrix.ts — Phase 2 TS source for environmental matrix uncertainty policies.
 * Promotes @typedef MatrixPolicy to exported interface.
 */

export interface MatrixPolicy {
    ndPreferred: string;
    rosMinDetectRate: number;
    kmMinDetectRate: number;
}

const MATRIX_POLICIES: Record<string, MatrixPolicy> = {
    default: {
        ndPreferred: 'half-dl',
        rosMinDetectRate: 0.5,
        kmMinDetectRate: 0.3,
    },
    groundwater: {
        ndPreferred: 'ros',
        rosMinDetectRate: 0.5,
        kmMinDetectRate: 0.3,
    },
    soil: {
        ndPreferred: 'km',
        rosMinDetectRate: 0.6,
        kmMinDetectRate: 0.35,
    },
    air: {
        ndPreferred: 'ros',
        rosMinDetectRate: 0.45,
        kmMinDetectRate: 0.3,
    },
    surface_water: {
        ndPreferred: 'km',
        rosMinDetectRate: 0.55,
        kmMinDetectRate: 0.3,
    },
    biota: {
        ndPreferred: 'half-dl',
        rosMinDetectRate: 0.6,
        kmMinDetectRate: 0.35,
    },
    ghg: {
        ndPreferred: 'half-dl',
        rosMinDetectRate: 0.6,
        kmMinDetectRate: 0.35,
    },
};

export function normalizeMatrix(matrix: unknown): string {
    if (!matrix) return 'default';
    const normalized = String(matrix)
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    if (normalized === 'subterranea' || normalized === 'subterranea_agua') return 'groundwater';
    if (normalized === 'agua_superficial') return 'surface_water';
    return normalized;
}

export function getMatrixPolicy(matrix: unknown, overrides: Partial<MatrixPolicy> | null = null): MatrixPolicy {
    const key = normalizeMatrix(matrix);
    const base = MATRIX_POLICIES.default;
    const policy = MATRIX_POLICIES[key] || base || MATRIX_POLICIES.default;
    const resolved: MatrixPolicy = { ...(policy as MatrixPolicy) };
    if (!overrides || typeof overrides !== 'object') return resolved;
    if (overrides.ndPreferred !== undefined) resolved.ndPreferred = overrides.ndPreferred;
    if (overrides.rosMinDetectRate !== undefined) resolved.rosMinDetectRate = overrides.rosMinDetectRate;
    if (overrides.kmMinDetectRate !== undefined) resolved.kmMinDetectRate = overrides.kmMinDetectRate;
    return resolved;
}

export interface ChooseNDMethodOpts {
    matrix?: unknown;
    detectRate?: number;
    preferredMethod?: string;
}

export function chooseNDMethod({ matrix, detectRate, preferredMethod }: ChooseNDMethodOpts = {}): string {
    const policy = getMatrixPolicy(matrix);
    const explicit = String(preferredMethod || '').toLowerCase();
    if (explicit && explicit !== 'auto') return explicit;

    const rate = typeof detectRate === 'number' && Number.isFinite(detectRate) ? detectRate : 0;
    if (policy.ndPreferred === 'ros' && rate >= policy.rosMinDetectRate) return 'ros';
    if (rate >= policy.kmMinDetectRate) return 'km';
    return 'half-dl';
}
