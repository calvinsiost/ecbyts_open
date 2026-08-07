// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   VOXEL CLIP — Corte de volume por superfície, faixa de valor e plano.

   RF-3 da SPEC_VOXEL_PIPELINE: compõe máscaras booleanas que delimitam
   quais voxels de um grid escalar participam de renderização, integração
   de massa/volume e exportação. Três cortes canônicos:

     - clipBySurface(grid, surfaceFn) → células abaixo/acima de uma
       superfície interpolada por coluna (terreno, lençol freático,
       potenciométrica). surfaceFn(worldX, worldZ) → elevação Y da superfície.
     - clipByBand(grid, zMin, zMax)   → faixa de valor do campo escalar,
       min ≤ v ≤ max ("só acima do VI" = [VI, +Inf]; "faixa dupla" da spec).
     - clipByPlane(grid, normal, off) → semi-espaço dot(normal, p) ≥ off,
       corte planar arbitrário (base p/ sólido/polígono da spec).

   A saída é um "subgrid" ralo: mesma geometria (dims/bounds/yRange/
   resolution) + `mask` (Uint8Array, 1 = mantida, 0 = cortada) alinhada ao
   layout `idx = iz·(ny·nx) + iy·nx + ix` de engine.ts/channels.ts, + `data`
   com NaN nas células cortadas. NaN — nunca zero silencioso — marca "sem
   estimativa" (princípio 1 da spec: ausência ≠ zero). A máscara é o artefato
   canônico: integrateVoxelMass já ignora valores não-finitos, e a mask pode
   virar zoneMask/generalizada do downstream.

   Convenção de eixos (engine.ts): Y é VERTICAL (elevação; yRange.bottom→top),
   X e Z formam o plano horizontal (bounds XZ). Centro da célula:
       worldX = bounds.minX + ix·res + res/2
       worldY = yRange.bottom + iy·res + res/2
       worldZ = bounds.minZ + iz·res + res/2

   PUREZA: recebe TypedArrays/escalares/funções; sem DOM, Three.js ou I/O.
   Determinístico: mesma entrada → mesma saída. Resultado Object.freeze.

   PROVENANCE / referência canônica:
     - MiningMath (air blocks removidos por superfície topográfica) e a
       prática de block models (Leapfrog/Vulcan) de mascarar células fora do
       domínio antes de integrar volume/massa.
     - Corte por semi-espaço plano = forma degenerada de point-in-polyhedron;
       composição de máscaras (AND/OR) permite interseção de cortes.
   ================================================================ */

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

/** Grid escalar alinhado ao volume voxel (mesma geometria de channels.ts). */
export interface VoxelGrid {
    /** Campo escalar (ex.: concentração) no layout idx = iz·(ny·nx)+iy·nx+ix. */
    readonly data: ArrayLike<number>;
    readonly dims: VoxelDims;
    readonly bounds: VoxelBoundsXZ;
    readonly yRange: VoxelYRange;
    /** Aresta do voxel cúbico. */
    readonly resolution: number;
}

/** Resultado de um corte: subgrid ralo com a mesma geometria do grid. */
export interface ClippedGrid {
    /** Campo mascarado: NaN nas células cortadas (nunca zero silencioso). */
    readonly data: Float32Array;
    /** Máscara booleana alinhada: 1 = mantida, 0 = cortada. Artefato canônico. */
    readonly mask: Uint8Array;
    readonly dims: VoxelDims;
    readonly bounds: VoxelBoundsXZ;
    readonly yRange: VoxelYRange;
    readonly resolution: number;
    /** Nº de células mantidas (mask === 1). */
    readonly keptCount: number;
    /** Nº total de células (nx·ny·nz). */
    readonly totalCount: number;
}

/** Função de superfície: elevação Y da superfície numa coluna (worldX, worldZ). */
export type SurfaceFn = (worldX: number, worldZ: number) => number;

/** Lado do corte em relação à superfície. */
export type ClipSide = 'below' | 'above';

/** Vetor 3D (objeto ou tupla). */
export type Vec3 =
    | { readonly x: number; readonly y: number; readonly z: number }
    | readonly [number, number, number];

type CellPredicate = (worldX: number, worldY: number, worldZ: number, value: number) => boolean;

function isPositiveInt(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function gridCellCount(grid: VoxelGrid | null | undefined): number {
    const d = grid?.dims;
    if (!d || !isPositiveInt(d.nx) || !isPositiveInt(d.ny) || !isPositiveInt(d.nz)) return 0;
    return d.nx * d.ny * d.nz;
}

function isValidGrid(grid: VoxelGrid | null | undefined): grid is VoxelGrid {
    if (!grid) return false;
    const total = gridCellCount(grid);
    if (total === 0) return false;
    if (!grid.data || grid.data.length < total) return false;
    if (!grid.bounds || !grid.yRange) return false;
    return typeof grid.resolution === 'number' && Number.isFinite(grid.resolution) && grid.resolution > 0;
}

/** Resultado vazio (tudo cortado), preservando a geometria quando possível. */
function emptyResult(grid: VoxelGrid | null | undefined): ClippedGrid {
    const total = gridCellCount(grid);
    const data = new Float32Array(total);
    data.fill(NaN);
    return Object.freeze({
        data,
        mask: new Uint8Array(total),
        dims: grid?.dims ?? { nx: 0, ny: 0, nz: 0 },
        bounds: grid?.bounds ?? { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
        yRange: grid?.yRange ?? { top: 0, bottom: 0 },
        resolution: typeof grid?.resolution === 'number' ? grid.resolution : 0,
        keptCount: 0,
        totalCount: total,
    });
}

/** Aplica um predicado por centro de célula e materializa o subgrid. */
function clipWith(grid: VoxelGrid, keep: CellPredicate): ClippedGrid {
    const { dims, bounds, yRange, resolution, data } = grid;
    const { nx, ny, nz } = dims;
    const total = nx * ny * nz;
    const mask = new Uint8Array(total);
    const out = new Float32Array(total);
    const half = resolution / 2;
    let keptCount = 0;

    for (let iz = 0; iz < nz; iz++) {
        const worldZ = bounds.minZ + iz * resolution + half;
        for (let iy = 0; iy < ny; iy++) {
            const worldY = yRange.bottom + iy * resolution + half;
            for (let ix = 0; ix < nx; ix++) {
                const worldX = bounds.minX + ix * resolution + half;
                const idx = iz * (ny * nx) + iy * nx + ix;
                const value = Number(data[idx]);
                if (keep(worldX, worldY, worldZ, value)) {
                    mask[idx] = 1;
                    out[idx] = value;
                    keptCount++;
                } else {
                    out[idx] = NaN;
                }
            }
        }
    }

    return Object.freeze({
        data: out,
        mask,
        dims,
        bounds,
        yRange,
        resolution,
        keptCount,
        totalCount: total,
    });
}

/**
 * Corte por superfície interpolada por coluna.
 *
 * `surfaceFn(worldX, worldZ)` devolve a elevação Y da superfície (terreno,
 * lençol freático, potenciométrica — qualquer layer). `side` seleciona o lado:
 *   - 'below' (default): mantém células com worldY ≤ superfície (ex.: "só a
 *     zona saturada abaixo do NA");
 *   - 'above': mantém células com worldY ≥ superfície.
 *
 * Coluna cuja superfície é não-finita (NaN/Inf) é cortada por inteiro — sem
 * superfície não há estimativa honesta. Fronteira é inclusiva (worldY === s
 * entra em ambos os lados).
 */
export function clipBySurface(
    grid: VoxelGrid | null | undefined,
    surfaceFn: SurfaceFn,
    side: ClipSide = 'below',
): ClippedGrid {
    if (!isValidGrid(grid) || typeof surfaceFn !== 'function') return emptyResult(grid);
    return clipWith(grid, (x, y, z) => {
        const s = Number(surfaceFn(x, z));
        if (!Number.isFinite(s)) return false;
        return side === 'above' ? y >= s : y <= s;
    });
}

/**
 * Corte por faixa de valor do campo escalar: mantém células com zMin ≤ v ≤ zMax.
 *
 * É a "faixa dupla (min≤v≤max)" da spec. Casos canônicos:
 *   - "só acima do VI" → clipByBand(grid, vi, +Infinity);
 *   - "só dentro de [VR, VP]" → clipByBand(grid, vr, vp).
 *
 * Limites ±Infinity funcionam como lado único. Limite NaN (ou zMin > zMax)
 * não mantém célula alguma. Célula com valor não-finito (NaN) nunca entra.
 * Fronteira inclusiva.
 */
export function clipByBand(
    grid: VoxelGrid | null | undefined,
    zMin: number,
    zMax: number,
): ClippedGrid {
    if (!isValidGrid(grid)) return emptyResult(grid);
    const lo = Number(zMin);
    const hi = Number(zMax);
    return clipWith(grid, (_x, _y, _z, value) => value >= lo && value <= hi);
}

function readVec3(v: Vec3 | null | undefined): { x: number; y: number; z: number } | null {
    if (!v) return null;
    // 'in' narrows the union (Array.isArray doesn't narrow out a readonly tuple member here).
    if ('x' in v) return { x: Number(v.x), y: Number(v.y), z: Number(v.z) };
    return { x: Number(v[0]), y: Number(v[1]), z: Number(v[2]) };
}

/**
 * Corte por plano (semi-espaço): mantém células com dot(normal, centro) ≥ offset.
 *
 * `normal` (objeto {x,y,z} ou tupla [x,y,z]) aponta para o lado MANTIDO;
 * `offset` é a distância planar na métrica do produto interno (não precisa ser
 * unitário — a desigualdade é homogênea). Corte planar arbitrário é a base para
 * sólido/polígono da spec (composição de semi-espaços via combineMasks).
 *
 * Normal nulo/degenerado (0,0,0) ou componentes não-finitas → resultado vazio.
 */
export function clipByPlane(
    grid: VoxelGrid | null | undefined,
    normal: Vec3,
    offset: number,
): ClippedGrid {
    if (!isValidGrid(grid)) return emptyResult(grid);
    const n = readVec3(normal);
    const off = Number(offset);
    if (!n || !Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(n.z) || !Number.isFinite(off)) {
        return emptyResult(grid);
    }
    if (n.x === 0 && n.y === 0 && n.z === 0) return emptyResult(grid);
    const { x, y, z } = n;
    return clipWith(grid, (wx, wy, wz) => x * wx + y * wy + z * wz >= off);
}

/**
 * Aplica uma máscara pronta a um grid, produzindo o subgrid correspondente.
 * Máscara menor/maior que o grid é tolerada (índices fora = cortados).
 */
export function applyMask(
    grid: VoxelGrid | null | undefined,
    mask: ArrayLike<number> | null | undefined,
): ClippedGrid {
    if (!isValidGrid(grid) || !mask) return emptyResult(grid);
    const total = gridCellCount(grid);
    const outMask = new Uint8Array(total);
    const outData = new Float32Array(total);
    let keptCount = 0;
    for (let i = 0; i < total; i++) {
        if (Number(mask[i]) === 1) {
            outMask[i] = 1;
            outData[i] = Number(grid.data[i]);
            keptCount++;
        } else {
            outData[i] = NaN;
        }
    }
    return Object.freeze({
        data: outData,
        mask: outMask,
        dims: grid.dims,
        bounds: grid.bounds,
        yRange: grid.yRange,
        resolution: grid.resolution,
        keptCount,
        totalCount: total,
    });
}

/**
 * Combina máscaras (mesmo layout) por interseção ('and') ou união ('or').
 * Útil para compor cortes: "abaixo do NA E acima do VI". Máscaras de
 * tamanhos diferentes são toleradas (índice ausente = 0). Lista vazia →
 * máscara vazia.
 */
export function combineMasks(
    masks: ReadonlyArray<ArrayLike<number>> | null | undefined,
    mode: 'and' | 'or' = 'and',
): Uint8Array {
    if (!masks || masks.length === 0) return new Uint8Array(0);
    let total = 0;
    for (const m of masks) total = Math.max(total, m?.length ?? 0);
    const out = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
        if (mode === 'or') {
            let any = 0;
            for (const m of masks) {
                if (Number(m?.[i]) === 1) {
                    any = 1;
                    break;
                }
            }
            out[i] = any;
        } else {
            let all = 1;
            for (const m of masks) {
                if (Number(m?.[i]) !== 1) {
                    all = 0;
                    break;
                }
            }
            out[i] = all;
        }
    }
    return out;
}
