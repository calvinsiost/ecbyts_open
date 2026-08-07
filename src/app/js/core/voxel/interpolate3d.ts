// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   INTERPOLATE 3D — Native 3D interpolation for voxel channels.

   RF-2 da SPEC_VOXEL_PIPELINE: interpolação 3D real nos canais do
   voxel (não extrusão 2D). Três métodos:

   1. Trilinear — interpolação trilinear nos 8 vértices da célula que
      contém o ponto. Exato nos nós do grid; C⁰ entre células.
   2. IDW-3D — inverse distance weighting com expoente configurável
      sobre nuvem de pontos 3D arbitrários (observações com elevação).
   3. Nearest-neighbor — valor do voxel mais próximo (fallback rápido,
      sem suavização).

   PUREZA: recebe TypedArrays/escalares; sem DOM, Three.js ou I/O.
   Determinístico: mesma entrada → mesma saída.

   INDEXAÇÃO: row-major XYZ (mesmo layout de engine.ts/channels.ts)
     idx = iz * (ny * nx) + iy * nx + ix

   PROVENANCE / referência canônica:
     - Trilinear: Press et al., "Numerical Recipes", 3rd ed., §3.6
       (multilinear interpolation on a regular grid).
     - IDW: Shepard (1968) "A two-dimensional interpolation function
       for irregularly-spaced data"; extensão 3D direta (distância
       euclidiana em ℝ³). Padrão em contaminação ambiental (EVS/C-Tech).
     - Anisotropia vertical: razão h:v default 10:1 (padrão em
       hidrogeologia — contaminação se espalha mais horizontalmente).
   ================================================================ */

export interface VoxelGridDims {
    readonly nx: number;
    readonly ny: number;
    readonly nz: number;
}

export interface VoxelGridSpacing {
    readonly dx: number;
    readonly dy: number;
    readonly dz: number;
}

export interface VoxelGrid {
    readonly dims: VoxelGridDims;
    readonly spacing: VoxelGridSpacing;
    readonly data: Float32Array;
}

export interface Point3D {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface Observation3D extends Point3D {
    readonly value: number;
}

function gridIndex(dims: VoxelGridDims, ix: number, iy: number, iz: number): number {
    return iz * (dims.ny * dims.nx) + iy * dims.nx + ix;
}

/**
 * Trilinear interpolation on a regular voxel grid.
 *
 * `point` is in grid-index coordinates (continuous): e.g. (0.5, 1.2, 2.7)
 * means between cells. Values at integer coordinates correspond to voxel
 * centers. Returns NaN when the point falls outside [0, n-1] on any axis.
 */
export function trilinearInterpolate(grid: VoxelGrid, point: Point3D): number {
    const { nx, ny, nz } = grid.dims;
    const { x, y, z } = point;

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return NaN;
    if (x < 0 || x > nx - 1 || y < 0 || y > ny - 1 || z < 0 || z > nz - 1) return NaN;

    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);

    const x1 = Math.min(x0 + 1, nx - 1);
    const y1 = Math.min(y0 + 1, ny - 1);
    const z1 = Math.min(z0 + 1, nz - 1);

    const xd = x - x0;
    const yd = y - y0;
    const zd = z - z0;

    const d = grid.data;
    const c000 = d[gridIndex(grid.dims, x0, y0, z0)] ?? 0;
    const c100 = d[gridIndex(grid.dims, x1, y0, z0)] ?? 0;
    const c010 = d[gridIndex(grid.dims, x0, y1, z0)] ?? 0;
    const c110 = d[gridIndex(grid.dims, x1, y1, z0)] ?? 0;
    const c001 = d[gridIndex(grid.dims, x0, y0, z1)] ?? 0;
    const c101 = d[gridIndex(grid.dims, x1, y0, z1)] ?? 0;
    const c011 = d[gridIndex(grid.dims, x0, y1, z1)] ?? 0;
    const c111 = d[gridIndex(grid.dims, x1, y1, z1)] ?? 0;

    const c00 = c000 * (1 - xd) + c100 * xd;
    const c10 = c010 * (1 - xd) + c110 * xd;
    const c01 = c001 * (1 - xd) + c101 * xd;
    const c11 = c011 * (1 - xd) + c111 * xd;

    const c0 = c00 * (1 - yd) + c10 * yd;
    const c1 = c01 * (1 - yd) + c11 * yd;

    return c0 * (1 - zd) + c1 * zd;
}

/**
 * Inverse Distance Weighting in 3D.
 *
 * Weights: w_i = 1 / d_i^power (Shepard 1968). If the target coincides
 * with an observation (d < 1e-10), returns that observation's value
 * directly (exact interpolation). Returns NaN for empty input.
 *
 * `anisotropy` (optional) scales the vertical (y) distance before
 * computing the euclidean distance — default {h:1, v:1} (isotropic).
 * For environmental plumes use {h:1, v:10} (horizontal spread >> vertical).
 */
export function inverseDistanceWeight(
    points: ReadonlyArray<Observation3D>,
    target: Point3D,
    power: number = 2,
    anisotropy: { h: number; v: number } = { h: 1, v: 1 },
): number {
    if (!points || points.length === 0) return NaN;
    const p = Number.isFinite(power) && power > 0 ? power : 2;

    let numerator = 0;
    let denominator = 0;

    for (const pt of points) {
        if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !Number.isFinite(pt.z)) continue;
        if (!Number.isFinite(pt.value)) continue;

        const dx = (pt.x - target.x) * anisotropy.h;
        const dy = (pt.y - target.y) * anisotropy.v;
        const dz = (pt.z - target.z) * anisotropy.h;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (d < 1e-10) return pt.value;

        const w = 1 / Math.pow(d, p);
        numerator += w * pt.value;
        denominator += w;
    }

    return denominator === 0 ? NaN : numerator / denominator;
}

/**
 * Nearest-neighbor lookup on a regular voxel grid.
 *
 * Rounds the continuous grid-index point to the nearest integer cell
 * and returns its stored value. Returns NaN when the point is outside
 * the grid bounds.
 */
export function nearestNeighbor(grid: VoxelGrid, point: Point3D): number {
    const { nx, ny, nz } = grid.dims;
    const { x, y, z } = point;

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return NaN;

    const ix = Math.round(x);
    const iy = Math.round(y);
    const iz = Math.round(z);

    if (ix < 0 || ix >= nx || iy < 0 || iy >= ny || iz < 0 || iz >= nz) return NaN;

    return grid.data[gridIndex(grid.dims, ix, iy, iz)] ?? NaN;
}
