// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   VOXEL ENGINE — 3D grid classification from surfaces
   Motor de voxelizacao — classifica celulas 3D a partir de superficies

   Recebe funcoes de amostragem de superficies (terreno, lencol)
   e preenche um grid 3D (Uint8Array) com IDs de zona.
   O engine e puro (sem Three.js) — so faz calculo.

   INDEXACAO: row-major XYZ
     index = iz * (ny * nx) + iy * nx + ix
     worldX = bounds.minX + ix * resolution + resolution/2
     worldY = yRange.bottom + iy * resolution + resolution/2
     worldZ = bounds.minZ + iz * resolution + resolution/2
   ================================================================ */

export interface HBounds {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

export interface YRange {
    top: number;
    bottom: number;
}

export interface VoxelDims {
    nx: number;
    ny: number;
    nz: number;
}

export interface VoxelVolume {
    bounds: HBounds;
    yRange: YRange;
    resolution: number;
    dims: VoxelDims;
    grid: Uint8Array;
}

const ZONES = {
    EMPTY: 0,
    VADOSE: 1,
    SATURATED: 2,
    CONFINING: 3,
    BEDROCK: 4,
    CONTAMINATED: 5,
    REMEDIATION: 6,
    LAKE_EPI: 7,
    LAKE_META: 8,
    LAKE_HYPO: 9,
} as const;

export type ZoneId = (typeof ZONES)[keyof typeof ZONES];

export const EMPTY = ZONES.EMPTY;
export const VADOSE = ZONES.VADOSE;
export const SATURATED = ZONES.SATURATED;
export const CONFINING = ZONES.CONFINING;
export const BEDROCK = ZONES.BEDROCK;
export const CONTAMINATED = ZONES.CONTAMINATED;
export const REMEDIATION = ZONES.REMEDIATION;
export const LAKE_EPI = ZONES.LAKE_EPI;
export const LAKE_META = ZONES.LAKE_META;
export const LAKE_HYPO = ZONES.LAKE_HYPO;

/**
 * Generate a classified 3D voxel grid from surface samplers.
 * Gera grid 3D classificado: cada celula recebe um zone ID
 * baseado na posicao relativa ao terreno e lencol freatico.
 */
export function voxelize(
    bounds: HBounds,
    yRange: YRange,
    resolution: number,
    sampleTop: (x: number, z: number) => number,
    sampleDivider: (x: number, z: number) => number,
): { grid: Uint8Array; dims: VoxelDims } {
    const nx = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / resolution));
    const ny = Math.max(1, Math.ceil((yRange.top - yRange.bottom) / resolution));
    const nz = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / resolution));

    const total = nx * ny * nz;
    const grid = new Uint8Array(total);

    const halfRes = resolution / 2;

    for (let iz = 0; iz < nz; iz++) {
        const worldZ = bounds.minZ + iz * resolution + halfRes;

        for (let ix = 0; ix < nx; ix++) {
            const worldX = bounds.minX + ix * resolution + halfRes;

            // Amosta superficies uma vez por coluna (x,z)
            const terrainY = sampleTop(worldX, worldZ);
            const waterTableY = sampleDivider(worldX, worldZ);

            for (let iy = 0; iy < ny; iy++) {
                const worldY = yRange.bottom + iy * resolution + halfRes;
                const idx = iz * (ny * nx) + iy * nx + ix;

                if (worldY > terrainY) {
                    // Acima do terreno - vazio
                    grid[idx] = EMPTY;
                } else if (worldY > waterTableY) {
                    // Entre terreno e lencol - zona vadosa
                    grid[idx] = VADOSE;
                } else {
                    // Abaixo do lencol - zona saturada
                    grid[idx] = SATURATED;
                }
            }
        }
    }

    return { grid, dims: { nx, ny, nz } };
}

/**
 * Count voxels of a specific zone.
 * Conta quantos voxels pertencem a uma zona.
 *
 * RF-5 (SPEC_VOXEL_PIPELINE): quando `stamps` (canal de carimbos de
 * superfície — ver _airBlocksPure.stampAirBlocks) é provida, células
 * ABOVE_SURFACE/BELOW_MODEL são EXCLUÍDAS por default; passe
 * `{ includeOutOfModel: true }` para incluí-las explicitamente.
 * Sem `stamps` comporta-se como antes (conta tudo — backward compatible).
 */
export function countByZone(
    grid: Uint8Array,
    zoneId: number,
    stamps?: Uint8Array | null,
    opts?: { includeOutOfModel?: boolean },
): number {
    const include = opts?.includeOutOfModel === true;
    let count = 0;
    for (let i = 0; i < grid.length; i++) {
        if (grid[i] !== zoneId) continue;
        if (!include && stamps) {
            const s = stamps[i] ?? 0;
            if (s === 1 || s === 2) continue; // ABOVE_SURFACE / BELOW_MODEL
        }
        count++;
    }
    return count;
}

/**
 * Sample the zone at a world position.
 * Retorna o zone ID no ponto (x, y, z) do mundo.
 */
export function getVoxelAt(volume: VoxelVolume, x: number, y: number, z: number): number {
    const { bounds, yRange, resolution, dims, grid } = volume;
    const ix = Math.floor((x - bounds.minX) / resolution);
    const iy = Math.floor((y - yRange.bottom) / resolution);
    const iz = Math.floor((z - bounds.minZ) / resolution);

    if (ix < 0 || ix >= dims.nx) return EMPTY;
    if (iy < 0 || iy >= dims.ny) return EMPTY;
    if (iz < 0 || iz >= dims.nz) return EMPTY;

    return grid[iz * (dims.ny * dims.nx) + iy * dims.nx + ix] ?? EMPTY;
}

/**
 * Estimate a good default resolution based on model area.
 * Escolhe resolucao para manter voxel count abaixo do limite.
 */
export function suggestResolution(
    bounds: HBounds,
    yRange: YRange,
    maxVoxels: number = 200000,
): number {
    const dx = bounds.maxX - bounds.minX;
    const dy = yRange.top - yRange.bottom;
    const dz = bounds.maxZ - bounds.minZ;

    for (const res of [1, 2, 5, 10]) {
        const count = Math.ceil(dx / res) * Math.ceil(dy / res) * Math.ceil(dz / res);
        if (count <= maxVoxels) return res;
    }
    return 10;
}