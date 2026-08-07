// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (interpolation/manager).
//
// Aplicação recomendação refactor-opportunities.mjs #4:
// core/interpolation/manager.ts (1930L) tem fan-in 26 no maior SCC.
// Identificou DUPLICAÇÃO de bilinear interpolation entre sampleTerrainElevation
// (linha 1249) e sampleLayerGrid (linha 1295). Extração resolve dupe + reduz
// fan-in interno ao ciclo (callers podem importar helpers diretamente).
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. Primeira extração desse monolito.
//
// Spec NOT:
// - NÃO ler module state (_layers Map — caller passa layer/grid)
// - NÃO ler THREE.js / mesh state
// - NÃO emoji
//
// Extracted helpers:
//   - GridBounds / GridSize / LayerLike   (types canonical)
//   - SURFACE_MESH_OFFSETS                (frozen by-family offsets)
//   - isInsideBounds                      (boundary check)
//   - gridPosToContinuous                 (x/z → (colF, rowF))
//   - bilinearInterpolate                 (grid value at fractional position)
//   - sampleGridAt                        (high-level: bounds check + bilinear)
//   - getSurfaceMeshOffset                (family → mesh offset value)

export interface GridBounds {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

export interface GridSize {
    cols: number;
    rows: number;
}

export interface LayerLike {
    type?: string;
    grid?: ReadonlyArray<number> | Float32Array | null;
    bounds?: GridBounds | null;
    gridSize?: GridSize | null;
}

export interface ElementOffsetLike {
    family?: string;
    data?: {
        dimensions?: { height?: number };
        height?: number;
        individualType?: string;
    };
}

/**
 * Frozen by-family mesh offsets used by interpolation surface placement.
 * Centraliza valores hardcoded de _getSurfaceMeshOffset.
 *
 * Matches _getSurfaceMeshOffset @ manager.ts:1322 (15 family cases + default).
 * 'building' e 'emission_source' são dinâmicos (height-based) e ficam no
 * caller (getSurfaceMeshOffset abaixo).
 */
export const SURFACE_MESH_STATIC_OFFSETS: Readonly<Record<string, number>> = Object.freeze({
    marker: 1.5,
    spring: 0.75,
    sample: 0.5,
    waste_stream: 0.6,
    effluent_point: 0.35,
    incident: 0.6,
    habitat: 0.02,
    area: 0.05,
    lake: 0.25,
    generic: 0.4,
    intangible: 0.6,
});

/**
 * Check if (x, z) is inside grid bounds.
 * Used by sampleTerrainElevation + sampleLayerGrid (caller previously duplicated).
 */
export function isInsideBounds(bounds: GridBounds | null | undefined, x: number, z: number): boolean {
    if (!bounds) return false;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

/**
 * Convert scene (x, z) coordinates to continuous grid coordinates.
 *   Row 0 = minZ (norte), row last = maxZ (sul)
 *
 * Returns { colF, rowF } as floats. Use Math.floor for integer index.
 */
export function gridPosToContinuous(
    x: number,
    z: number,
    bounds: GridBounds,
    gridSize: GridSize,
): { colF: number; rowF: number } {
    const { minX, maxX, minZ, maxZ } = bounds;
    const { cols, rows } = gridSize;
    const colF = ((x - minX) / (maxX - minX)) * (cols - 1);
    const rowF = ((z - minZ) / (maxZ - minZ)) * (rows - 1);
    return { colF, rowF };
}

/**
 * Bilinear interpolation of grid value at continuous (colF, rowF).
 * Grid é row-major: grid[r * cols + c].
 *
 * Matches body shared by sampleTerrainElevation (manager.ts:1264-1277)
 * and sampleLayerGrid (manager.ts:1306-1316). Dedupe wins.
 */
export function bilinearInterpolate(
    grid: ReadonlyArray<number> | Float32Array,
    cols: number,
    rows: number,
    colF: number,
    rowF: number,
): number {
    const c0 = Math.floor(colF);
    const r0 = Math.floor(rowF);
    const c1 = Math.min(c0 + 1, cols - 1);
    const r1 = Math.min(r0 + 1, rows - 1);
    const fc = colF - c0;
    const fr = rowF - r0;
    const v00 = grid[r0 * cols + c0] ?? 0;
    const v10 = grid[r0 * cols + c1] ?? 0;
    const v01 = grid[r1 * cols + c0] ?? 0;
    const v11 = grid[r1 * cols + c1] ?? 0;
    return (1 - fc) * (1 - fr) * v00 + fc * (1 - fr) * v10 + (1 - fc) * fr * v01 + fc * fr * v11;
}

/**
 * High-level grid sample: bounds check + bilinear at (x, z).
 *   Out of bounds → 0
 *   Missing grid/bounds/gridSize → 0
 *
 * Caller substitution:
 *   ANTES:
 *     export function sampleTerrainElevation(x, z) { ...32L bilinear duplicado... }
 *     export function sampleLayerGrid(layerType, x, z) { ...32L bilinear duplicado... }
 *   DEPOIS:
 *     export function sampleTerrainElevation(x, z) {
 *       const t = findTerrainLayer();
 *       return sampleGridAt(t, x, z);
 *     }
 */
export function sampleGridAt(layer: LayerLike | null | undefined, x: number, z: number): number {
    if (!layer || !layer.grid || !layer.bounds || !layer.gridSize) return 0;
    if (!isInsideBounds(layer.bounds, x, z)) return 0;
    const { colF, rowF } = gridPosToContinuous(x, z, layer.bounds, layer.gridSize);
    return bilinearInterpolate(layer.grid, layer.gridSize.cols, layer.gridSize.rows, colF, rowF);
}

/**
 * Resolve surface mesh offset by element family.
 *   Static families → SURFACE_MESH_STATIC_OFFSETS lookup
 *   Dynamic (building, emission_source) → height-based formula
 *   individual → tree vs default
 *
 * Matches _getSurfaceMeshOffset @ manager.ts:1322 (15 cases + default).
 */
export function getSurfaceMeshOffset(el: ElementOffsetLike | null | undefined): number {
    if (!el || typeof el !== 'object') return 0;
    const data = el.data || {};
    const family = el.family;
    if (typeof family !== 'string') return 0;
    if (family === 'building') {
        return (data.dimensions?.height ?? data.height ?? 5) / 2;
    }
    if (family === 'emission_source') {
        return (data.height ?? 8) / 2;
    }
    if (family === 'individual') {
        return data.individualType === 'tree' ? 1.25 : 0.6;
    }
    const staticOffset = SURFACE_MESH_STATIC_OFFSETS[family];
    return typeof staticOffset === 'number' ? staticOffset : 0;
}
