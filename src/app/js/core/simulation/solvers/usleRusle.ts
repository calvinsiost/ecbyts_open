// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { sampleVoxelField, minMax } from './common.js';

export function runUsleRusle(params: any, volume: any, context: any = {}) {
    const R = Math.max(0, Number(params.R ?? 200));
    const K = Math.max(0, Number(params.K ?? 0.03));
    const LS = Math.max(0, Number(params.LS ?? 1.2));
    const C = Math.max(0, Number(params.C ?? 0.5));
    const P = Math.max(0, Number(params.P ?? 1));
    const { nx, ny, _nz } = volume.dims;

    const data = sampleVoxelField(
        volume.dims,
        volume.bounds,
        volume.yRange,
        volume.resolution,
        (_x: any, y: any, _z: any, ix: any, iy: any, iz: any) => {
            const idx = iz * ny * nx + iy * nx + ix;
            const Kv = context.spatialFields?.K?.[idx] ?? K;
            const Cv = context.spatialFields?.C?.[idx] ?? C;
            const relTop = (volume.yRange.top - y) / Math.max(1e-6, volume.yRange.top - volume.yRange.bottom);
            return Math.max(0, R * Kv * LS * Cv * P * relTop);
        },
    );

    const mm = minMax(data);
    return { data, min: mm.min, max: mm.max, unit: 't/ha/yr', label: 'Erosao', ramp: 'terrain' };
}
