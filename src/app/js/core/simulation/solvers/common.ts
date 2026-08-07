// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Shared helpers for simulation builtin solvers.

import { toFiniteNumber } from '../../../utils/helpers/toFiniteNumber.js';

export interface VoxelDims {
    nx: number;
    ny: number;
    nz: number;
}

export interface VoxelBounds {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

export interface YRange {
    top: number;
    bottom: number;
}

export interface MinMaxResult {
    min: number;
    max: number;
}

/**
 * Iterate all voxel centers and write result values.
 */
export function sampleVoxelField(
    dims: VoxelDims,
    bounds: VoxelBounds,
    yRange: YRange,
    resolution: number,
    sampler: (x: number, y: number, z: number, ix: number, iy: number, iz: number) => number,
): Float32Array {
    const { nx, ny, nz } = dims;
    const out = new Float32Array(nx * ny * nz);
    const half = resolution / 2;

    for (let iz = 0; iz < nz; iz++) {
        const worldZ = bounds.minZ + iz * resolution + half;
        for (let iy = 0; iy < ny; iy++) {
            const worldY = yRange.bottom + iy * resolution + half;
            for (let ix = 0; ix < nx; ix++) {
                const worldX = bounds.minX + ix * resolution + half;
                const idx = iz * (ny * nx) + iy * nx + ix;
                out[idx] = Number(sampler(worldX, worldY, worldZ, ix, iy, iz)) || 0;
            }
        }
    }

    return out;
}

/**
 * Compute flat voxel index from 3D grid coordinates.
 */
export function getVoxelIndex(
    dims: VoxelDims,
    ix: number,
    iy: number,
    iz: number,
): number {
    return iz * (dims.ny * dims.nx) + iy * dims.nx + ix;
}

/**
 * Min/max from typed array.
 */
export function minMax(arr: Float32Array): MinMaxResult {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (v === undefined) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    return {
        min: toFiniteNumber(min, 0),
        max: toFiniteNumber(max, 0),
    };
}