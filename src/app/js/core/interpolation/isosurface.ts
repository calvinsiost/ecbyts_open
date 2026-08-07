// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   ISOSURFACE — Marching Cubes for 3D plume volumes
   ================================================================

   Extrai isosuperficie de um grid 3D (Float32Array) usando Marching Cubes.
   Retorna THREE.BufferGeometry com vertices e normais.

   YELLOW-C1: Limite de 50,000 celulas. Se excedido, resolucao e reduzida
   automaticamente antes do processamento.

   ================================================================ */

import { createTHREEProxy } from '../three-lazy.js';
const THREE: any = createTHREEProxy();

const MAX_CELLS = 50_000;

// Marching Cubes edge table (standard 256-entry lookup)
// For brevity, using a simplified approach: sample grid at threshold and
// build triangulated surface from threshold crossings.

/**
 * Extract an isosurface from a 3D grid at a given value.
 *
 * @param grid3D - Row-major [layers * rows * cols]
 * @param isoValue - Threshold value for the isosurface
 * @returns THREE.BufferGeometry — typed `any`: THREE is loaded at runtime via
 *          the three-lazy.js proxy and no 'three' type declarations are bundled.
 */
export function extractIsosurface(
    grid3D: Float32Array,
    dimensions: { cols: number; rows: number; layers: number },
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number },
    isoValue: number,
): any {
    let { cols, rows, layers } = dimensions;
    const totalCells = cols * rows * layers;

    // YELLOW-C1: Auto-reduce resolution if exceeds cap
    let effectiveGrid = grid3D;
    if (totalCells > MAX_CELLS) {
        const scale = Math.cbrt(MAX_CELLS / totalCells);
        const newCols = Math.max(4, Math.round(cols * scale));
        const newRows = Math.max(4, Math.round(rows * scale));
        const newLayers = Math.max(2, Math.round(layers * scale));
        console.warn(
            `[ecbyts] Isosurface: reduced ${cols}x${rows}x${layers} -> ${newCols}x${newRows}x${newLayers} (cap: ${MAX_CELLS})`,
        );
        effectiveGrid = _downsampleGrid(grid3D, cols, rows, layers, newCols, newRows, newLayers);
        cols = newCols;
        rows = newRows;
        layers = newLayers;
    }

    // Simple threshold surface: collect triangles at cells where value crosses isoValue
    const vertices: number[] = [];
    const dx = (bounds.maxX - bounds.minX) / (cols - 1);
    const dz = (bounds.maxZ - bounds.minZ) / (rows - 1);
    const dy = (bounds.maxY - bounds.minY) / Math.max(1, layers - 1);

    for (let l = 0; l < layers - 1; l++) {
        for (let r = 0; r < rows - 1; r++) {
            for (let c = 0; c < cols - 1; c++) {
                // Sample 8 corners of the voxel cell
                const v000 = effectiveGrid[l * rows * cols + r * cols + c] as number;
                const v100 = effectiveGrid[l * rows * cols + r * cols + c + 1] as number;
                const v010 = effectiveGrid[l * rows * cols + (r + 1) * cols + c] as number;
                const v001 = effectiveGrid[(l + 1) * rows * cols + r * cols + c] as number;

                // Simple check: does the threshold cross any edge of this cell?
                const above = v000 >= isoValue;
                const anyDifferent =
                    (v100 >= isoValue) !== above || (v010 >= isoValue) !== above || (v001 >= isoValue) !== above;

                if (!anyDifferent) continue;

                // Generate a quad at this cell (simplified - not full Marching Cubes)
                const x = bounds.minX + c * dx;
                const z = bounds.minZ + r * dz;
                const y = bounds.minY + l * dy;

                // Two triangles forming a horizontal quad at this cell
                vertices.push(
                    x,
                    y,
                    z,
                    x + dx,
                    y,
                    z,
                    x,
                    y,
                    z + dz,

                    x + dx,
                    y,
                    z,
                    x + dx,
                    y,
                    z + dz,
                    x,
                    y,
                    z + dz,
                );
            }
        }
    }

    const geometry = new THREE.BufferGeometry();
    const posArray = new Float32Array(vertices);
    geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geometry.computeVertexNormals();

    return geometry;
}

/**
 * Downsample a 3D grid using trilinear interpolation.
 */
function _downsampleGrid(
    src: Float32Array,
    srcC: number,
    srcR: number,
    srcL: number,
    dstC: number,
    dstR: number,
    dstL: number,
): Float32Array {
    const dst = new Float32Array(dstL * dstR * dstC);

    for (let l = 0; l < dstL; l++) {
        const sl = (l / Math.max(1, dstL - 1)) * (srcL - 1);
        const l0 = Math.floor(sl);
        const l1 = Math.min(l0 + 1, srcL - 1);
        const fl = sl - l0;

        for (let r = 0; r < dstR; r++) {
            const sr = (r / Math.max(1, dstR - 1)) * (srcR - 1);
            const r0 = Math.floor(sr);
            const r1 = Math.min(r0 + 1, srcR - 1);
            const fr = sr - r0;

            for (let c = 0; c < dstC; c++) {
                const sc = (c / Math.max(1, dstC - 1)) * (srcC - 1);
                const c0 = Math.floor(sc);
                const c1 = Math.min(c0 + 1, srcC - 1);
                const fc = sc - c0;

                // Trilinear interpolation
                const v000 = src[l0 * srcR * srcC + r0 * srcC + c0] as number;
                const v100 = src[l0 * srcR * srcC + r0 * srcC + c1] as number;
                const v010 = src[l0 * srcR * srcC + r1 * srcC + c0] as number;
                const v110 = src[l0 * srcR * srcC + r1 * srcC + c1] as number;
                const v001 = src[l1 * srcR * srcC + r0 * srcC + c0] as number;
                const v101 = src[l1 * srcR * srcC + r0 * srcC + c1] as number;
                const v011 = src[l1 * srcR * srcC + r1 * srcC + c0] as number;
                const v111 = src[l1 * srcR * srcC + r1 * srcC + c1] as number;

                const val =
                    v000 * (1 - fc) * (1 - fr) * (1 - fl) +
                    v100 * fc * (1 - fr) * (1 - fl) +
                    v010 * (1 - fc) * fr * (1 - fl) +
                    v110 * fc * fr * (1 - fl) +
                    v001 * (1 - fc) * (1 - fr) * fl +
                    v101 * fc * (1 - fr) * fl +
                    v011 * (1 - fc) * fr * fl +
                    v111 * fc * fr * fl;

                dst[l * dstR * dstC + r * dstC + c] = val;
            }
        }
    }
    return dst;
}
