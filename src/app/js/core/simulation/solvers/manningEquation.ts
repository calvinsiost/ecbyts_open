// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { sampleVoxelField, minMax } from './common.js';

interface SolverVolume {
    dims: { nx: number; ny: number; nz: number };
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    yRange: { top: number; bottom: number };
    resolution: number;
    grid: ArrayLike<number>;
}

interface SolverContext {
    sourcePosition?: { x: number; y: number; z: number } | null;
    spatialFields?: Record<string, ArrayLike<number>>;
    activeZones?: Set<number> | null;
}

/**
 * Manning's equation for open-channel velocity.
 */
export function runManningEquation(
    params: Record<string, unknown>,
    volume: SolverVolume,
    context: SolverContext = {},
): { data: Float32Array; min: number; max: number; unit: string; label: string; ramp: string } {
    const n = Math.max(0.01, Number(params.roughnessN ?? 0.03));
    const hydraulicRadius = Math.max(0.05, Number(params.hydraulicRadius ?? 1));
    const slope = Math.max(0.0001, Number(params.slope ?? 0.01));
    const { nx, ny } = volume.dims;

    const data = sampleVoxelField(
        volume.dims,
        volume.bounds,
        volume.yRange,
        volume.resolution,
        (_x: number, y: number, _z: number, ix: number, iy: number, iz: number) => {
            const idx = iz * ny * nx + iy * nx + ix;
            const nv = context.spatialFields?.roughnessN?.[idx] ?? n;
            const velocity = (1 / nv) * Math.pow(hydraulicRadius, 2 / 3) * Math.sqrt(slope);
            const relDepth = (y - volume.yRange.bottom) / Math.max(1e-6, volume.yRange.top - volume.yRange.bottom);
            return Math.max(0, velocity * relDepth);
        },
    );

    const mm = minMax(data);
    return { data, min: mm.min, max: mm.max, unit: 'm/s', label: 'Velocidade', ramp: 'water_table' };
}
