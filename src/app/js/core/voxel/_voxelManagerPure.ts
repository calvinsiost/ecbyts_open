// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   VOXEL MANAGER PURE (Module C extraction)
   ================================================================

   3 helpers pure-logic extraídos de core/voxel/manager.ts:
     - estimateMaxTerrainY: amostra cantos+centro de bounds via sampleFn
       injetada para estimar topo do volume.
     - computeVolumeDims: nx*ny*nz a partir de bounds+yRange+resolution.
     - estimateVoxelMemoryMb: rough bytes/voxel estimate.

   Recebem deps injetáveis — testáveis sem subir terrain/scene.
   ================================================================ */

export interface VoxelBounds {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

export interface VoxelYRange {
    top: number;
    bottom: number;
}

export interface VoxelDims {
    nx: number;
    ny: number;
    nz: number;
    total: number;
}

/**
 * Estima Y máxima do terreno em uma bounds via amostragem de 5 pontos
 * (4 cantos + centro), retornando max + margin (default 5m) para
 * cobrir picos entre samples.
 *
 * @param bounds — limites XZ do volume
 * @param sampleFn — função (x, z) → elevation (injetada; lazy se terrain ausente)
 * @param z — buffer adicional acima do max amostrado (default 5)
 */
export function estimateMaxTerrainY(
    bounds: VoxelBounds,
    sampleFn: (x: number, z: number) => number,
    margin: number = 5,
): number {
    if (!bounds || typeof sampleFn !== 'function') return 0;
    const samplePts: Array<[number, number]> = [
        [bounds.minX, bounds.minZ],
        [bounds.maxX, bounds.minZ],
        [bounds.minX, bounds.maxZ],
        [bounds.maxX, bounds.maxZ],
        [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2],
    ];
    let maxY = 0;
    for (const [x, z] of samplePts) {
        const y = Number(sampleFn(x, z));
        if (Number.isFinite(y) && y > maxY) maxY = y;
    }
    return maxY + margin;
}

/**
 * Calcula dimensões do voxel grid a partir de bounds + yRange + resolution.
 * total = nx * ny * nz (com Math.ceil para cobrir cantos exatos).
 *
 * Use para validar contra MAX_VOXELS antes de alocar grid.
 */
export function computeVolumeDims(
    bounds: VoxelBounds,
    yRange: VoxelYRange,
    resolution: number,
): VoxelDims {
    if (!bounds || !yRange || !Number.isFinite(resolution) || resolution <= 0) {
        return { nx: 0, ny: 0, nz: 0, total: 0 };
    }
    const nx = Math.ceil((bounds.maxX - bounds.minX) / resolution);
    const ny = Math.ceil((yRange.top - yRange.bottom) / resolution);
    const nz = Math.ceil((bounds.maxZ - bounds.minZ) / resolution);
    return { nx, ny, nz, total: nx * ny * nz };
}

/**
 * Estimativa rough de memória (MB) para um grid de N voxels.
 * Assume ~8 bytes/voxel (1 byte zoneId + ~7 bytes overhead típico
 * para JS TypedArray + dependências de channels float32).
 */
export function estimateVoxelMemoryMb(total: number, bytesPerVoxel: number = 8): number {
    if (!Number.isFinite(total) || total <= 0) return 0;
    return (total * bytesPerVoxel) / (1024 * 1024);
}
