// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * VOXEL CHANNELS — Scalar data overlays for voxel volumes.
 *
 * Pure-logic helpers that store continuous scalar fields (Float32Array)
 * aligned to the voxel grid layout `idx = iz * (ny * nx) + iy * nx + ix`.
 * No DOM, no I/O.
 *
 * Reference: docs/specs/features/SPEC_VOXEL_PIPELINE.md §Channels.
 */

export interface VoxelDims {
    readonly nx: number;
    readonly ny: number;
    readonly nz: number;
}

export interface VoxelBoundsXZ {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
}

export interface VoxelYRange {
    readonly top: number;
    readonly bottom: number;
}

export interface VoxelChannel {
    name: string;
    label: string;
    unit: string;
    ramp: string;
    data: Float32Array;
    min: number;
    max: number;
    timestamp: number;
}

export interface ChannelStats {
    readonly mean: number;
    readonly min: number;
    readonly max: number;
}

export type VoxelSampler = (
    worldX: number,
    worldY: number,
    worldZ: number,
    ix: number,
    iy: number,
    iz: number,
) => number;

/**
 * Allocate an empty scalar channel sized to the voxel volume.
 */
export function createChannel(
    dims: Partial<VoxelDims> | null | undefined,
    name: string,
    unit: string = '',
    ramp: string = 'generic',
    label: string = '',
): VoxelChannel {
    const nx = dims?.nx ?? 1;
    const ny = dims?.ny ?? 1;
    const nz = dims?.nz ?? 1;
    const total = Math.max(1, nx * ny * nz);
    return {
        name,
        label: label || name,
        unit,
        ramp,
        data: new Float32Array(total),
        min: 0,
        max: 0,
        timestamp: Date.now(),
    };
}

/**
 * Recompute and persist `min`/`max` on the channel. Returns the new range.
 * Empty or non-finite data is normalized to {0, 0}.
 */
export function normalizeChannel(
    channel: Pick<VoxelChannel, 'data' | 'min' | 'max'>,
): { min: number; max: number } {
    const arr = channel?.data;
    if (!arr || arr.length === 0) {
        channel.min = 0;
        channel.max = 0;
        return { min: 0, max: 0 };
    }

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < arr.length; i++) {
        const v = arr[i] as number;
        if (v < min) min = v;
        if (v > max) max = v;
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        min = 0;
        max = 0;
    }

    channel.min = min;
    channel.max = max;
    return { min, max };
}

/**
 * Basic descriptive stats for a channel: mean / min / max.
 */
export function channelStats(channel: Pick<VoxelChannel, 'data'> | null | undefined): ChannelStats {
    const arr = channel?.data;
    if (!arr || arr.length === 0) {
        return { mean: 0, min: 0, max: 0 };
    }

    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < arr.length; i++) {
        const v = arr[i] as number;
        sum += v;
        if (v < min) min = v;
        if (v > max) max = v;
    }

    return { mean: sum / arr.length, min, max };
}

/**
 * Sample a channel at a world-space (x, y, z) point. Returns 0 if the
 * point falls outside the voxel grid or the channel is empty.
 */
export function sampleChannel(
    channel: Pick<VoxelChannel, 'data'> | null | undefined,
    dims: VoxelDims,
    bounds: VoxelBoundsXZ,
    yRange: VoxelYRange,
    resolution: number,
    x: number,
    y: number,
    z: number,
): number {
    if (!channel?.data) return 0;

    const ix = Math.floor((x - bounds.minX) / resolution);
    const iy = Math.floor((y - yRange.bottom) / resolution);
    const iz = Math.floor((z - bounds.minZ) / resolution);

    if (ix < 0 || ix >= dims.nx) return 0;
    if (iy < 0 || iy >= dims.ny) return 0;
    if (iz < 0 || iz >= dims.nz) return 0;

    const idx = iz * (dims.ny * dims.nx) + iy * dims.nx + ix;
    return channel.data[idx] ?? 0;
}

/**
 * Fill a channel by invoking `sampler` at every voxel center.
 * Updates `timestamp` and recomputes the min/max range.
 */
export function populateChannel(
    channel: VoxelChannel,
    dims: VoxelDims,
    bounds: VoxelBoundsXZ,
    yRange: VoxelYRange,
    resolution: number,
    sampler: VoxelSampler,
): void {
    const { nx, ny, nz } = dims;
    const half = resolution / 2;
    const out = channel.data;

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

    channel.timestamp = Date.now();
    normalizeChannel(channel);
}
