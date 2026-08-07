// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

type ContourPoint = { x: number; z: number };
type Segment = [ContourPoint, ContourPoint];

/* ================================================================
   CONTOURS - Generic isoline extraction from regular grids
   ================================================================

   Generic utility for contour extraction via Marching Squares.
   Domain-agnostic: receives only grid/bounds/levels and returns
   polylines that can be rendered by any layer type.
   ================================================================ */

const KEY_PRECISION = 6;

/**
 * Generate contour levels across grid stats.
 */
export function generateContourLevels(grid: Float32Array | number[], levelCount = 10): number[] {
    if (!grid || grid.length === 0) return [];
    const n = Math.max(2, Number(levelCount) || 10);

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < grid.length; i++) {
        const v = Number(grid[i]);
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [];

    const levels: number[] = [];
    const step = (max - min) / (n + 1);
    for (let i = 1; i <= n; i++) {
        levels.push(min + step * i);
    }
    return levels;
}

/**
 * Build contour polylines from a regular grid.
 */
export function buildContoursFromGrid(opts: {
    grid: Float32Array | number[];
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    gridSize: { cols: number; rows: number };
    levels?: number[];
    levelCount?: number;
}): Array<{ level: number; points: Array<{ x: number; z: number }> }> {
    const { grid, bounds, gridSize, levels, levelCount = 10 } = opts || ({} as any);
    if (!grid || !bounds || !gridSize) return [];

    const cols = Number(gridSize.cols);
    const rows = Number(gridSize.rows);
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2) return [];
    if (grid.length !== cols * rows) return [];

    const useLevels =
        Array.isArray(levels) && levels.length > 0
            ? levels.filter(Number.isFinite)
            : generateContourLevels(grid, levelCount);
    if (useLevels.length === 0) return [];

    const dx = (bounds.maxX - bounds.minX) / (cols - 1);
    const dz = (bounds.maxZ - bounds.minZ) / (rows - 1);

    const all: Array<{ level: number; points: ContourPoint[] }> = [];
    for (const level of useLevels) {
        const segments: Segment[] = [];
        for (let r = 0; r < rows - 1; r++) {
            for (let c = 0; c < cols - 1; c++) {
                _extractCellSegments({
                    grid,
                    rows,
                    cols,
                    r,
                    c,
                    level,
                    minX: bounds.minX,
                    minZ: bounds.minZ,
                    dx,
                    dz,
                    segments,
                });
            }
        }
        const polylines = _stitchSegments(segments);
        for (const points of polylines) {
            if (points.length >= 2) all.push({ level, points });
        }
    }

    return all;
}

function _extractCellSegments(ctx: {
    grid: Float32Array | number[];
    rows: number;
    cols: number;
    r: number;
    c: number;
    level: number;
    minX: number;
    minZ: number;
    dx: number;
    dz: number;
    segments: Segment[];
}): void {
    const { grid, cols, r, c, level, minX, minZ, dx, dz, segments } = ctx;
    const idx = r * cols + c;

    const v00 = grid[idx] as number;
    const v10 = grid[idx + 1] as number;
    const v01 = grid[idx + cols] as number;
    const v11 = grid[idx + cols + 1] as number;

    if (![v00, v10, v01, v11].every(Number.isFinite)) return;

    const x0 = minX + c * dx;
    const x1 = x0 + dx;
    const z0 = minZ + r * dz;
    const z1 = z0 + dz;

    const crossings: ContourPoint[] = [];
    _pushCrossing(crossings, v00, v10, level, { x: x0, z: z0 }, { x: x1, z: z0 }); // top
    _pushCrossing(crossings, v10, v11, level, { x: x1, z: z0 }, { x: x1, z: z1 }); // right
    _pushCrossing(crossings, v11, v01, level, { x: x1, z: z1 }, { x: x0, z: z1 }); // bottom
    _pushCrossing(crossings, v01, v00, level, { x: x0, z: z1 }, { x: x0, z: z0 }); // left

    if (crossings.length === 2) {
        const c0 = crossings[0];
        const c1 = crossings[1];
        if (c0 && c1) segments.push([c0, c1]);
        return;
    }

    // Ambiguous case (4 crossings): asymptotic-style pairing with center value.
    if (crossings.length === 4) {
        const c0 = crossings[0];
        const c1 = crossings[1];
        const c2 = crossings[2];
        const c3 = crossings[3];
        if (!c0 || !c1 || !c2 || !c3) return;
        const center = (v00 + v10 + v01 + v11) / 4;
        if (center >= level) {
            segments.push([c0, c1]);
            segments.push([c2, c3]);
        } else {
            segments.push([c0, c3]);
            segments.push([c1, c2]);
        }
    }
}

function _pushCrossing(
    out: ContourPoint[],
    a: number,
    b: number,
    level: number,
    p0: ContourPoint,
    p1: ContourPoint,
): void {
    const crosses = (a < level && b >= level) || (a >= level && b < level);
    if (!crosses) return;
    const t = (level - a) / (b - a);
    out.push({
        x: p0.x + (p1.x - p0.x) * t,
        z: p0.z + (p1.z - p0.z) * t,
    });
}

function _stitchSegments(segments: Segment[]): ContourPoint[][] {
    const unused = segments.slice();
    const lines: ContourPoint[][] = [];

    while (unused.length > 0) {
        const popped = unused.pop();
        if (!popped) break;
        const [a, b] = popped;
        const line: ContourPoint[] = [a, b];

        let changed = true;
        while (changed) {
            changed = false;
            for (let i = unused.length - 1; i >= 0; i--) {
                const seg = unused[i];
                if (!seg) continue;
                const [p0, p1] = seg;
                const head = line[0];
                const tail = line[line.length - 1];
                if (!head || !tail) break;
                const sKey = _ptKey(head);
                const eKey = _ptKey(tail);
                const p0Key = _ptKey(p0);
                const p1Key = _ptKey(p1);

                if (eKey === p0Key) {
                    line.push(p1);
                    unused.splice(i, 1);
                    changed = true;
                    continue;
                }
                if (eKey === p1Key) {
                    line.push(p0);
                    unused.splice(i, 1);
                    changed = true;
                    continue;
                }
                if (sKey === p1Key) {
                    line.unshift(p0);
                    unused.splice(i, 1);
                    changed = true;
                    continue;
                }
                if (sKey === p0Key) {
                    line.unshift(p1);
                    unused.splice(i, 1);
                    changed = true;
                }
            }
        }

        lines.push(line);
    }

    return lines;
}

function _ptKey(p: ContourPoint): string {
    return `${p.x.toFixed(KEY_PRECISION)},${p.z.toFixed(KEY_PRECISION)}`;
}
