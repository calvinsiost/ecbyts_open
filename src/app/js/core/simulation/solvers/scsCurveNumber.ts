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
 * SCS Curve Number method for runoff estimation.
 * @param {Record<string, unknown>} params
 * @param {SolverVolume} volume
 * @param {SolverContext} [context]
 * @returns {{data:Float32Array, min:number, max:number, unit:string, label:string, ramp:string}}
 */
export function runScsCurveNumber(
    params: Record<string, unknown>,
    volume: SolverVolume,
    context: SolverContext = {},
): { data: Float32Array; min: number; max: number; unit: string; label: string; ramp: string } {
    const precipitation = Math.max(0, Number(params.precipitation ?? 60)); // mm
    const curveNumber = Math.min(100, Math.max(30, Number(params.curveNumber ?? 75)));
    const slopeFactor = Math.max(0.1, Number(params.slopeFactor ?? 1));
    const { nx, ny } = volume.dims;

    const data = sampleVoxelField(
        volume.dims,
        volume.bounds,
        volume.yRange,
        volume.resolution,
        (_x: number, y: number, _z: number, ix: number, iy: number, iz: number) => {
            const idx = iz * ny * nx + iy * nx + ix;
            const CN = context.spatialFields?.curveNumber?.[idx] ?? curveNumber;
            const S = 25400 / Math.max(30, CN) - 254;
            const runoff = precipitation > 0.2 * S ? (precipitation - 0.2 * S) ** 2 / (precipitation + 0.8 * S) : 0;
            const relDepth = (y - volume.yRange.bottom) / Math.max(1e-6, volume.yRange.top - volume.yRange.bottom);
            return Math.max(0, runoff * slopeFactor * (1 - relDepth));
        },
    );

    const mm = minMax(data);
    return { data, min: mm.min, max: mm.max, unit: 'mm', label: 'Runoff', ramp: 'water_table' };
}
