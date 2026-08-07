// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { sampleVoxelField, minMax } from './common.js';

/**
 * Gaussian plume concentration field (screening-level approximation).
 * @param {Record<string, any>} params
 * @param {Record<string, any>} volume
 * @returns {{data:Float32Array,min:number,max:number,unit:string,label:string,ramp:string}}
 */
export function runGaussianPlume(
    params: Record<string, any>,
    volume: Record<string, any>,
    context: Record<string, any> = {},
): { data: Float32Array; min: number; max: number; unit: string; label: string; ramp: string } {
    const emissionRate = Number(params.emissionRate ?? 10); // g/s
    const windSpeed = Math.max(0.1, Number(params.windSpeed ?? 3)); // m/s
    const stackHeight = Number(params.stackHeight ?? 30); // m
    const sigmaYScale = Math.max(0.1, Number(params.sigmaYScale ?? 0.12));
    const sigmaZScale = Math.max(0.1, Number(params.sigmaZScale ?? 0.08));

    const src = (context as any).sourcePosition;
    const centerX = src?.x ?? (volume.bounds.minX + volume.bounds.maxX) / 2;
    const centerZ = src?.z ?? (volume.bounds.minZ + volume.bounds.maxZ) / 2;

    const data = sampleVoxelField(
        volume.dims,
        volume.bounds,
        volume.yRange,
        volume.resolution,
        (x: number, y: number, z: number) => {
            const dx = x - centerX;
            if (dx <= 0) return 0;

            const cross = z - centerZ;
            const effectiveHeight = y - stackHeight;

            const sigmaY = Math.max(1, sigmaYScale * dx + 1);
            const sigmaZ = Math.max(1, sigmaZScale * dx + 1);

            const crossTerm = Math.exp(-(cross * cross) / (2 * sigmaY * sigmaY));
            const verticalTerm = Math.exp(-(effectiveHeight * effectiveHeight) / (2 * sigmaZ * sigmaZ));

            // Simple screening concentration in ug/m3.
            const c =
                ((emissionRate * 1e6) / (2 * Math.PI * windSpeed * sigmaY * sigmaZ)) * crossTerm * verticalTerm;
            return c;
        },
    );

    const mm = minMax(data);
    return {
        data,
        min: mm.min,
        max: mm.max,
        unit: 'ug/m3',
        label: 'Concentracao',
        ramp: 'contamination',
    };
}
