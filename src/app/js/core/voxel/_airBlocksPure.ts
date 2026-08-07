// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   VOXEL AIR BLOCKS — RF-5 da SPEC_VOXEL_PIPELINE.

   Air blocks e base do modelo: células ACIMA da superfície do terreno
   (ABOVE_SURFACE) e ABAIXO do estrato mais profundo (BELOW_MODEL) são
   fora do modelo conceitual — por default NÃO entram em
   countByZone / massa / estatísticas. Flag explícita `includeOutOfModel`
   inclui-as quando o usuário quiser (transparência, nunca silêncio).

   Convenção dos carimbos (canal paralelo Uint8Array, mesmo layout do
   grid `idx = iz·(ny·nx) + iy·nx + ix`):
     0 = IN_MODEL       — célula dentro do modelo (participa de tudo)
     1 = ABOVE_SURFACE  — centro do voxel acima do terreno
     2 = BELOW_MODEL    — centro do voxel abaixo da base do modelo

   Os valores 1/2 são o CONTRATO compartilhado com _voxelMassPure.ts
   (default de `excludedStamps`) — módulos irmãos, ambos puros e sem
   imports cruzados (mantém os testes build-free via strip-types).
   Mapeiam 1:1 para PROVENANCE_CLASS.ABOVE_SURFACE / BELOW_MODEL do
   carimbo RF-1 (provenance.ts): 5 e 6 lá, 1 e 2 aqui (canal denso de
   superfície, não o enum esparso de estimativa).

   PUREZA: recebe TypedArrays/escalares + sampler injetável; sem DOM,
   Three.js ou I/O. Determinístico: mesma entrada → mesma saída.

   PROVENANCE / referência canônica:
     - MiningMath (air blocks must be removed prior to importation):
       acima da topografia = fora do modelo, não "zona EMPTY que
       participa de contagens".
     - Leapfrog/Vulcan block models: células fora do sólido
       topográfico/basal não entram em tonelagem nem estatística.
   ================================================================ */

/** Carimbos do canal de superfície (contrato com _voxelMassPure.excludedStamps). */
export const SURFACE_STAMP = Object.freeze({
    IN_MODEL: 0,
    ABOVE_SURFACE: 1,
    BELOW_MODEL: 2,
} as const);

export type SurfaceStamp = (typeof SURFACE_STAMP)[keyof typeof SURFACE_STAMP];

export interface AirBlockDims {
    readonly nx: number;
    readonly ny: number;
    readonly nz: number;
}

/** Sampler da elevação do terreno por coluna (worldX/worldZ do centro do voxel). */
export type SurfaceSampler = (worldX: number, worldZ: number) => number;

/** Base do modelo: escalar único ou sampler por coluna (ex.: fundo do estrato). */
export type ModelBottom = number | SurfaceSampler;

export interface AirBlockOptions {
    /** Elevação Y da base do grid (worldY do iy=0 é bottom + resolution/2). */
    readonly yRangeBottom: number;
    /** Aresta do voxel cúbico. */
    readonly resolution: number;
    /** Terreno: elevação da superfície por coluna (obrigatório). */
    readonly sampleSurfaceY: SurfaceSampler;
    /**
     * Base do modelo (estrato mais profundo). Escalar ou sampler por coluna.
     * Omitido/NaN → sem carimbo BELOW_MODEL (grid já começa na base).
     */
    readonly modelBottom?: ModelBottom | null;
    /** Origem X do grid (worldX do ix=0 é minX + resolution/2). Default 0. */
    readonly minX?: number;
    /** Origem Z do grid (worldZ do iz=0 é minZ + resolution/2). Default 0. */
    readonly minZ?: number;
}

export interface FilterOptions {
    /**
     * true → inclui células ABOVE_SURFACE/BELOW_MODEL (transparência
     * explícita do usuário). Default false (exclui — padrão da indústria).
     */
    readonly includeOutOfModel?: boolean;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/** True quando o carimbo marca a célula como fora do modelo. */
export function isOutOfModelStamp(stamp: number): boolean {
    return stamp === SURFACE_STAMP.ABOVE_SURFACE || stamp === SURFACE_STAMP.BELOW_MODEL;
}

/**
 * Carimba cada voxel como IN_MODEL / ABOVE_SURFACE / BELOW_MODEL.
 *
 * Regra (centro do voxel, eixo Y vertical — convenção de engine.ts):
 *   worldY > terrainY(coluna)      → ABOVE_SURFACE
 *   worldY < modelBottom(coluna)   → BELOW_MODEL
 *   senão                          → IN_MODEL
 *
 * @param dims  dimensões do grid
 * @param opts  yRangeBottom, resolution, sampleSurfaceY, modelBottom opcional
 * @returns Uint8Array alinhado ao grid (idx = iz·(ny·nx) + iy·nx + ix)
 */
export function stampAirBlocks(dims: AirBlockDims, opts: AirBlockOptions): Uint8Array {
    const nx = Math.max(0, Math.floor(dims?.nx ?? 0));
    const ny = Math.max(0, Math.floor(dims?.ny ?? 0));
    const nz = Math.max(0, Math.floor(dims?.nz ?? 0));
    const total = nx * ny * nz;
    const out = new Uint8Array(total);
    if (total === 0) return out;

    const res = isFiniteNumber(opts.resolution) && opts.resolution > 0 ? opts.resolution : 1;
    const bottom = isFiniteNumber(opts.yRangeBottom) ? opts.yRangeBottom : 0;
    const minX = isFiniteNumber(opts.minX) ? opts.minX : 0;
    const minZ = isFiniteNumber(opts.minZ) ? opts.minZ : 0;
    const half = res / 2;
    const sample = typeof opts.sampleSurfaceY === 'function' ? opts.sampleSurfaceY : () => NaN;
    const bottomSpec = opts.modelBottom;

    for (let iz = 0; iz < nz; iz++) {
        const worldZ = minZ + iz * res + half;
        for (let ix = 0; ix < nx; ix++) {
            const worldX = minX + ix * res + half;
            const terrainY = Number(sample(worldX, worldZ));
            const modelBottomY =
                typeof bottomSpec === 'function'
                    ? Number(bottomSpec(worldX, worldZ))
                    : isFiniteNumber(bottomSpec)
                      ? bottomSpec
                      : NaN;
            for (let iy = 0; iy < ny; iy++) {
                const worldY = bottom + iy * res + half;
                const idx = iz * (ny * nx) + iy * nx + ix;
                if (Number.isFinite(terrainY) && worldY > terrainY) {
                    out[idx] = SURFACE_STAMP.ABOVE_SURFACE;
                } else if (Number.isFinite(modelBottomY) && worldY < modelBottomY) {
                    out[idx] = SURFACE_STAMP.BELOW_MODEL;
                } else {
                    out[idx] = SURFACE_STAMP.IN_MODEL;
                }
            }
        }
    }
    return out;
}

/**
 * Conta voxels de uma zona EXCLUINDO por default as células fora do modelo
 * (ABOVE_SURFACE/BELOW_MODEL). Sem `stamps` comporta-se como countByZone
 * clássico (conta tudo — backward compatible).
 *
 * Forma fechada de validação: grid todo zona Z com K células fora do
 * modelo → default retorna N−K; includeOutOfModel → N.
 */
export function countByZoneFiltered(
    grid: ArrayLike<number> | null | undefined,
    zoneId: number,
    stamps?: Uint8Array | null,
    opts: FilterOptions = {},
): number {
    if (!grid) return 0;
    const include = opts.includeOutOfModel === true;
    let count = 0;
    for (let i = 0; i < grid.length; i++) {
        if (grid[i] !== zoneId) continue;
        if (!include && stamps && isOutOfModelStamp(stamps[i] ?? 0)) continue;
        count++;
    }
    return count;
}

export interface FilteredStats {
    readonly mean: number;
    readonly min: number;
    readonly max: number;
    /** Nº de células que entraram na estatística (após exclusão). */
    readonly n: number;
}

/**
 * Estatísticas (mean/min/max/n) de um canal escalar EXCLUINDO por default
 * as células fora do modelo. Valores não-finitos nunca entram.
 * Sem células elegíveis → { mean: 0, min: 0, max: 0, n: 0 }.
 */
export function statsFiltered(
    data: ArrayLike<number> | null | undefined,
    stamps?: Uint8Array | null,
    opts: FilterOptions = {},
): FilteredStats {
    if (!data || data.length === 0) {
        return Object.freeze({ mean: 0, min: 0, max: 0, n: 0 });
    }
    const include = opts.includeOutOfModel === true;
    let sum = 0;
    let n = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < data.length; i++) {
        if (!include && stamps && isOutOfModelStamp(stamps[i] ?? 0)) continue;
        const v = Number(data[i]);
        if (!Number.isFinite(v)) continue;
        sum += v;
        n++;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (n === 0) return Object.freeze({ mean: 0, min: 0, max: 0, n: 0 });
    return Object.freeze({ mean: sum / n, min, max, n });
}
