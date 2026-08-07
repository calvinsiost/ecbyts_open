// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

interface Point2D {
    x: number;
    y: number;
}

interface Site {
    id: string;
    x: number;
    y: number;
}

interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

interface Raster {
    grid: ReadonlyArray<string|null>;
    width: number;
    height: number;
    cellWidth: number;
    cellHeight: number;
}

interface VoronoiOptions {
    resolution?: number;
}

/**
 * Constellation Voronoi - Phase 1.21 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S21
 *
 * Phase 1.21 (2026-05-01) - pure-logic Voronoi assignment para
 * particionar plane em regiões. Implementação: nearest-neighbor
 * grid-based (não Fortune's algorithm) - adequado para visualização
 * de N≤500 nodes.
 *
 * Estratégia:
 *   - assignToCell: dado ponto (x,y) + sites, retorna site mais próximo
 *   - rasterizeVoronoi: produz grid 2D com IDs de site dominante
 *   - cellArea: estima área da célula via grid count
 *   - boundaryPoints: pontos de transição entre células
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const VORONOI_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.21',
    deliveredAt: '2026-05-01',
});

/**
 * Distância euclideana ao quadrado (sem sqrt).
 * @param {Point2D|null|undefined} a
 * @param {Point2D|null|undefined} b
 * @returns {number}
 */
export function distSq(a: Point2D|null|undefined, b: Point2D|null|undefined): number {
    if (!a || !b) return Infinity;
    const dx = (a.x || 0) - (b.x || 0);
    const dy = (a.y || 0) - (b.y || 0);
    return dx * dx + dy * dy;
}

/**
 * Encontra site mais próximo de point (linear scan).
 *
 * @param {Point2D|null|undefined} point
 * @param {Site[]} sites
 * @returns {{id: string, distSq: number}|null}
 */
export function nearestSite(point: Point2D|null|undefined, sites: Site[]): {id: string, distSq: number}|null {
    if (!point || !Array.isArray(sites) || sites.length === 0) return null;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    let best: Site|null = null;
    let bestDistSq = Infinity;
    for (const s of sites) {
        if (!s || !s.id) continue;
        if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
        const d = distSq(point, s);
        if (d < bestDistSq) {
            bestDistSq = d;
            best = s;
        }
    }
    return best ? Object.freeze({ id: best.id, distSq: bestDistSq }) : null;
}

/**
 * Atribui cada ponto ao site mais próximo.
 *
 * @param {Point2D[]} points
 * @param {Site[]} sites
 * @returns {ReadonlyArray<{point: Point2D, siteId: string}>}
 */
export function assignPoints(points: Point2D[], sites: Site[]): ReadonlyArray<{point: Point2D, siteId: string}> {
    if (!Array.isArray(points) || !Array.isArray(sites)) return Object.freeze([]);
    const out: Array<{point: Point2D, siteId: string}> = [];
    for (const p of points) {
        const nearest = nearestSite(p, sites);
        if (nearest) {
            out.push(Object.freeze({ point: p, siteId: nearest.id }));
        }
    }
    return Object.freeze(out);
}

/**
 * Rasteriza Voronoi em grid 2D NxM. Cada célula contém siteId dominante.
 *
 * @param {Site[]} sites
 * @param {Bounds|null|undefined} bounds
 * @param {VoronoiOptions} [options]
 * @returns {Raster}
 */
export function rasterizeVoronoi(sites: Site[], bounds: Bounds|null|undefined, options: VoronoiOptions = {}): Raster {
    if (!Array.isArray(sites) || !bounds) {
        return Object.freeze({
            grid: Object.freeze(([] as Array<string|null>)),
            width: 0,
            height: 0,
            cellWidth: 0,
            cellHeight: 0,
        });
    }
    const resolution =
        Number.isInteger(options.resolution) && (options.resolution as number) > 0
            ? (options.resolution as number)
            : 50;
    const width = resolution;
    const height = resolution;
    const dx = bounds.maxX - bounds.minX;
    const dy = bounds.maxY - bounds.minY;
    if (dx <= 0 || dy <= 0) {
        return Object.freeze({
            grid: Object.freeze(([] as Array<string|null>)),
            width,
            height,
            cellWidth: 0,
            cellHeight: 0,
        });
    }
    const cellWidth = dx / width;
    const cellHeight = dy / height;
    const grid: Array<string|null> = new Array(width * height).fill(null);

    for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
            const x = bounds.minX + (i + 0.5) * cellWidth;
            const y = bounds.minY + (j + 0.5) * cellHeight;
            const nearest = nearestSite({ x, y }, sites);
            grid[j * width + i] = nearest ? nearest.id : null;
        }
    }
    return Object.freeze({
        grid: Object.freeze(grid),
        width,
        height,
        cellWidth,
        cellHeight,
    });
}

/**
 * Conta cells por siteId no grid.
 *
 * @param {ReadonlyArray<string|null>} grid
 * @returns {Record<string, number>}
 */
export function cellCounts(grid: ReadonlyArray<string|null>): Record<string, number> {
    if (!Array.isArray(grid)) return {};
    const counts: Record<string, number> = {};
    for (const id of grid) {
        if (id == null) continue;
        counts[id] = (counts[id] || 0) + 1;
    }
    return counts;
}

/**
 * Estima área de cada célula a partir do grid.
 *
 * @param {Raster|null|undefined} raster - output de rasterizeVoronoi
 * @returns {Record<string, number>}
 */
export function cellAreas(raster: Raster|null|undefined): Record<string, number> {
    if (!raster || !Array.isArray(raster.grid)) return {};
    const counts = cellCounts(raster.grid);
    const cellArea = (raster.cellWidth || 0) * (raster.cellHeight || 0);
    const out: Record<string, number> = {};
    for (const [id, count] of Object.entries(counts)) {
        out[id] = count * cellArea;
    }
    return Object.freeze(out);
}

/**
 * Detecta pontos do grid que são boundary (vizinho com siteId diferente).
 *
 * @param {Raster|null|undefined} raster
 * @returns {ReadonlyArray<{i: number, j: number, siteId: string}>}
 */
export function boundaryPoints(raster: Raster|null|undefined): ReadonlyArray<{i: number, j: number, siteId: string}> {
    if (!raster || !Array.isArray(raster.grid)) return Object.freeze([]);
    const w = raster.width;
    const h = raster.height;
    const grid = raster.grid;
    const out: Array<{i: number, j: number, siteId: string}> = [];
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const id = grid[j * w + i];
            if (id == null) continue;
            // Check 4 neighbors
            const neighbors: Array<string|null> = [
                i > 0 ? (grid[j * w + (i - 1)] ?? null) : null,
                i < w - 1 ? (grid[j * w + (i + 1)] ?? null) : null,
                j > 0 ? (grid[(j - 1) * w + i] ?? null) : null,
                j < h - 1 ? (grid[(j + 1) * w + i] ?? null) : null,
            ];
            if (neighbors.some( (n: string|null) => n != null && n !== id)) {
                out.push({ i, j, siteId: id });
            }
        }
    }
    return Object.freeze(out);
}

/**
 * Lloyd relaxation: move sites para centróide de suas células (1 iteração).
 *
 * @param {Site[]} sites
 * @param {Bounds|null|undefined} bounds
 * @param {VoronoiOptions} [options]
 * @returns {ReadonlyArray<Site>}
 */
export function lloydRelax(sites: Site[], bounds: Bounds|null|undefined, options: VoronoiOptions = {}): ReadonlyArray<Site> {
    if (!Array.isArray(sites) || !bounds) return Object.freeze([]);
    const raster = rasterizeVoronoi(sites, bounds, options);
    const w = raster.width;
    const h = raster.height;
    const grid = raster.grid;
    const sums = new Map<string, {sx: number, sy: number, count: number}>(); // id → {sx, sy, count}

    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const id = grid[j * w + i];
            if (id == null) continue;
            const x = bounds.minX + (i + 0.5) * raster.cellWidth;
            const y = bounds.minY + (j + 0.5) * raster.cellHeight;
            const cur = sums.get(id) || { sx: 0, sy: 0, count: 0 };
            cur.sx += x;
            cur.sy += y;
            cur.count++;
            sums.set(id, cur);
        }
    }

    return Object.freeze(
        sites.map( (s: Site) => {
            if (!s || !s.id) return s;
            const sum = sums.get(s.id);
            if (!sum || sum.count === 0) return s;
            return Object.freeze({
                id: s.id,
                x: sum.sx / sum.count,
                y: sum.sy / sum.count,
            });
        }),
    );
}

/**
 * Module identity export.
 */
export const voronoiMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.21',
    deliveredAt: '2026-05-01',
    exports: [
        'VORONOI_META',
        'distSq',
        'nearestSite',
        'assignPoints',
        'rasterizeVoronoi',
        'cellCounts',
        'cellAreas',
        'boundaryPoints',
        'lloydRelax',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
