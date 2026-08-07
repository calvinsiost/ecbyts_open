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
 * Theis-Thiem analytical solution for steady-state drawdown around a pumping well.
 */
export function runTheisThiem(
    params: Record<string, unknown>,
    volume: SolverVolume,
    context: SolverContext = {},
): { data: Float32Array; min: number; max: number; unit: string; label: string; ramp: string } {
    const pumpingRate = Math.max(0.1, Number(params.pumpingRate ?? 200));
    const transmissivity = Math.max(0.1, Number(params.transmissivity ?? 120));
    const src = context.sourcePosition;
    const centerX = src?.x ?? (volume.bounds.minX + volume.bounds.maxX) / 2;
    const centerZ = src?.z ?? (volume.bounds.minZ + volume.bounds.maxZ) / 2;

    const data = sampleVoxelField(volume.dims, volume.bounds, volume.yRange, volume.resolution, (x: number, _y: number, z: number) => {
        const r = Math.max(1, Math.hypot(x - centerX, z - centerZ));
        return (pumpingRate / (2 * Math.PI * transmissivity)) * Math.log(1 + r);
    });

    const mm = minMax(data);
    return { data, min: mm.min, max: mm.max, unit: 'm', label: 'Drawdown', ramp: 'potentiometric' };
}
