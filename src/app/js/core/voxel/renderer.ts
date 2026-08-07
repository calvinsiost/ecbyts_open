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
   VOXEL RENDERER â€” InstancedMesh-based 3D voxel visualization
   Renderizador de voxels usando InstancedMesh do Three.js

   Primeira utilizacao de InstancedMesh no projeto.
   Renderiza milhares de cubos com apenas 1 draw call por zona,
   em vez de um Mesh separado para cada cubo.

   DOIS MODOS:
   - solid: Um unico BoxGeometry semi-transparente (bloco massivo)
   - voxels: InstancedMesh por zona (cubinhos individuais com gaps)
   ================================================================ */

import { createTHREEProxy } from '../three-lazy.js';
const THREE: any = createTHREEProxy();
import { ZONE_COLORS, ZONE_OPACITY, getZoneConfig } from './colorSchemes.js';
import { EMPTY } from './engine.js';

// Scale factor for voxel cubes (< 1.0 creates visual gaps)
const VOXEL_SCALE = 0.92;

// ----------------------------------------------------------------
// SOLID MODE - One big bounding box
// ----------------------------------------------------------------

/**
 * Build a single semi-transparent box representing the full volume.
 * Cria um unico box cobrindo todo o volume geologico.
 *
 * @param {any} volume - VoxelVolume object
 * @returns {any}
 */
function _buildSolidMesh(volume: any): any {
    const { bounds, yRange, opacity } = volume;
    const dx = bounds.maxX - bounds.minX;
    const dy = yRange.top - yRange.bottom;
    const dz = bounds.maxZ - bounds.minZ;

    const geo = new THREE.BoxGeometry(dx, dy, dz);

    // Multi-material: top face = vadose color, bottom = saturated, sides = gradient
    const vadoseMat = new THREE.MeshStandardMaterial({
        color: ZONE_COLORS.vadose,
        transparent: true,
        opacity: (opacity ?? 0.5) * 0.8,
        roughness: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const saturatedMat = new THREE.MeshStandardMaterial({
        color: ZONE_COLORS.saturated,
        transparent: true,
        opacity: (opacity ?? 0.5) * 0.8,
        roughness: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
    });

    // BoxGeometry material order: +X, -X, +Y(top), -Y(bottom), +Z, -Z
    const mesh = new THREE.Mesh(geo, [
        vadoseMat,
        vadoseMat, // sides â€” vadose tint
        vadoseMat, // top â€” vadose
        saturatedMat, // bottom â€” saturated
        vadoseMat,
        vadoseMat, // front/back â€” vadose tint
    ]);

    const cx = bounds.minX + dx / 2;
    const cy = yRange.bottom + dy / 2;
    const cz = bounds.minZ + dz / 2;
    mesh.position.set(cx, cy, cz);
    mesh.name = 'voxel-solid';
    mesh.renderOrder = 5;

    return mesh;
}

// ----------------------------------------------------------------
// VOXEL MODE - InstancedMesh per zone
// ----------------------------------------------------------------

/**
 * Build InstancedMesh objects for each non-empty zone.
 * Cria um InstancedMesh para zona vadosa e outro para saturada.
 * Cada instancia e um cubo posicionado na celula correspondente.
 *
 * @param {any} volume - VoxelVolume object
 * @returns {any[]} array of instanced meshes
 */
function _buildInstancedMeshes(volume: any): any[] {
    const { bounds, yRange, resolution, dims, grid, opacity } = volume;
    const { nx, ny, nz } = dims;
    const halfRes = resolution / 2;

    // Count instances per zone (dynamic)
    const zoneCounts = new Map();
    for (let i = 0; i < grid.length; i++) {
        const zoneId = grid[i];
        if (zoneId === EMPTY) continue;
        zoneCounts.set(zoneId, (zoneCounts.get(zoneId) || 0) + 1);
    }

    // Shared geometry - scaled down for visual gaps
    const cubeSize = resolution * VOXEL_SCALE;
    const geo = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);

    const meshes = [];
    const matrix = new THREE.Matrix4();

    // Zone configs: [zoneId, count, color, opacityMul]
    const zoneConfigs = Array.from(zoneCounts.entries()).map(([zoneId, count]) => {
        const zone = getZoneConfig(zoneId);
        const fallbackColor = zoneId === 1 ? ZONE_COLORS.vadose : ZONE_COLORS.saturated;
        const fallbackOpacity = zoneId === 1 ? ZONE_OPACITY.vadose : ZONE_OPACITY.saturated;
        return [zoneId, count, zone?.color || fallbackColor, zone?.opacity ?? fallbackOpacity];
    });

    for (const [zoneId, count, color, opacityMul] of zoneConfigs) {
        if (count === 0) continue;

        const mat = new THREE.MeshStandardMaterial({
            color,
            transparent: true,
            opacity: (opacity ?? 0.7) * opacityMul,
            roughness: 0.85,
            depthWrite: false,
        });

        const instMesh = new THREE.InstancedMesh(geo, mat, count);
        instMesh.name = `voxel-zone-${zoneId}`;
        instMesh.renderOrder = 5;

        // Reverse mapping: instanceIdx â†’ flat grid index (para raycast â†’ coordenadas)
        const instanceToGrid = new Uint32Array(count);

        let instanceIdx = 0;
        for (let iz = 0; iz < nz; iz++) {
            const worldZ = bounds.minZ + iz * resolution + halfRes;
            for (let iy = 0; iy < ny; iy++) {
                const worldY = yRange.bottom + iy * resolution + halfRes;
                for (let ix = 0; ix < nx; ix++) {
                    const idx = iz * (ny * nx) + iy * nx + ix;
                    if (grid[idx] !== zoneId) continue;

                    const worldX = bounds.minX + ix * resolution + halfRes;
                    matrix.setPosition(worldX, worldY, worldZ);
                    instMesh.setMatrixAt(instanceIdx, matrix);
                    instanceToGrid[instanceIdx] = idx;
                    instanceIdx++;
                }
            }
        }
        instMesh.instanceMatrix.needsUpdate = true;
        instMesh.userData.instanceToGrid = instanceToGrid;
        instMesh.userData.zoneId = zoneId;
        instMesh.userData.dims = { nx, ny, nz };
        meshes.push(instMesh);
    }

    return meshes;
}

// ----------------------------------------------------------------
// INDEX CONVERSION HELPERS
// ----------------------------------------------------------------

/**
 * Convert flat grid index to (ix, iy, iz) coordinates.
 * Converte indice linear para coordenadas 3D do grid.
 *
 * @param {number} flatIdx - index in grid Uint8Array
 * @param {{ nx: number, ny: number, nz: number }} dims
 * @returns {{ ix: number, iy: number, iz: number }}
 */
export function flatIndexToCoords(
    flatIdx: number,
    dims: { nx: number; ny: number; nz: number },
): { ix: number; iy: number; iz: number } {
    const { nx, ny } = dims;
    const iz = Math.floor(flatIdx / (ny * nx));
    const rem = flatIdx % (ny * nx);
    const iy = Math.floor(rem / nx);
    const ix = rem % nx;
    return { ix, iy, iz };
}

/**
 * Convert (ix, iy, iz) to flat grid index.
 * Converte coordenadas 3D para indice linear do grid.
 *
 * @param {number} ix
 * @param {number} iy
 * @param {number} iz
 * @param {{ nx: number, ny: number, nz: number }} dims
 * @returns {number}
 */
export function coordsToFlatIndex(
    ix: number,
    iy: number,
    iz: number,
    dims: { nx: number; ny: number; nz: number },
): number {
    return iz * (dims.ny * dims.nx) + iy * dims.nx + ix;
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Build meshes for a volume and add to parent group.
 * Constroi os meshes conforme o modo (solid ou voxels) e adiciona ao grupo.
 *
 * @param {any} volume - VoxelVolume object
 * @param {any} parentGroup - target scene group
 */
export function buildVoxelMeshes(volume: any, parentGroup: any) {
    disposeVoxelMeshes(parentGroup);

    if (volume.mode === 'solid') {
        const solid = _buildSolidMesh(volume);
        solid.userData.volumeId = volume.id;
        parentGroup.add(solid);
    } else {
        const instancedMeshes = _buildInstancedMeshes(volume);
        for (const m of instancedMeshes) {
            m.userData.volumeId = volume.id;
            parentGroup.add(m);
        }
    }
}

/**
 * Switch between solid and voxel display modes.
 * Alterna o modo de visualizacao do volume.
 *
 * @param {any} volume - VoxelVolume object (mode already updated)
 * @param {any} parentGroup - target scene group
 */
export function setVoxelMode(volume: any, parentGroup: any) {
    buildVoxelMeshes(volume, parentGroup);
}

/**
 * Update opacity of all meshes for a volume.
 * Atualiza opacidade dos meshes de um volume.
 *
 * @param {string} volumeId - volume ID
 * @param {number} opacity - 0.0â€“1.0
 * @param {any} parentGroup
 */
export function setVoxelOpacity(volumeId: string, opacity: number, parentGroup: any) {
    for (const child of parentGroup.children) {
        if (child.userData.volumeId !== volumeId) continue;
        if (Array.isArray(child.material)) {
            child.material.forEach((m: any) => {
                m.opacity = opacity * 0.8;
            });
        } else if (child.material) {
            child.material.opacity = opacity * 0.8;
        }
    }
}

/**
 * Toggle visibility of all meshes for a volume.
 * Alterna visibilidade dos meshes de um volume.
 *
 * @param {string} volumeId - volume ID
 * @param {boolean} visible
 * @param {any} parentGroup
 */
export function setVoxelVisible(volumeId: string, visible: boolean, parentGroup: any) {
    for (const child of parentGroup.children) {
        if (child.userData.volumeId === volumeId) {
            child.visible = visible;
        }
    }
}

/**
 * Dispose and remove all meshes from a group.
 * Remove e libera memoria de todos os meshes do grupo.
 *
 * @param {any} parentGroup
 */
export function disposeVoxelMeshes(parentGroup: any) {
    const toRemove = [...parentGroup.children];
    for (const child of toRemove) {
        parentGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (Array.isArray(child.material)) {
            child.material.forEach((m: any) => m.dispose());
        } else if (child.material) {
            child.material.dispose();
        }
    }
}
