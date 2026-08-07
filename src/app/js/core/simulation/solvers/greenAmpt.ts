// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { sampleVoxelField, minMax } from './common.js';

export interface SolverVolume {
    dims: { nx: number; ny: number; nz: number };
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    yRange: { top: number; bottom: number };
    resolution: number;
    grid: ArrayLike<number>;
}

export interface SolverContext {
    sourcePosition?: { x: number; y: number; z: number } | null;
    spatialFields?: Record<string, ArrayLike<number>>;
    activeZones?: Set<number> | null;
}

/**
 * Green-Ampt infiltration model.
 * @param params
 * @param volume
 * @param context
 */
export function runGreenAmpt(
    params: Record<string, unknown>,
    volume: SolverVolume,
    context: SolverContext = {},
): { data: Float32Array; min: number; max: number; unit: string; label: string; ramp: string } {
    const K = Math.max(0.01, Number(params.hydraulicConductivity ?? 5));
    const suction = Math.max(0.01, Number(params.suctionHead ?? 100));
    const moistureDeficit = Math.max(0.01, Number(params.moistureDeficit ?? 0.2));
    const { nx, ny } = volume.dims;

    const data = sampleVoxelField(
        volume.dims,
        volume.bounds,
        volume.yRange,
        volume.resolution,
        (_x: number, y: number, _z: number, ix: number, iy: number, iz: number) => {
            const idx = iz * ny * nx + iy * nx + ix;
            if (context.activeZones && !context.activeZones.has(volume.grid[idx]!)) return 0;
            const Kv = context.spatialFields?.hydraulicConductivity?.[idx] ?? K;
            const depth = Math.max(0, volume.yRange.top - y);
            return Kv * (1 + (suction * moistureDeficit) / Math.max(1, depth));
        },
    );

    const mm = minMax(data);
    return { data, min: mm.min, max: mm.max, unit: 'mm/h', label: 'Infiltracao', ramp: 'water_table' };
}
