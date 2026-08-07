// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Heatmap - Phase 1.23 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S23
 *
 * Phase 1.23 (2026-05-01) - pure-logic 2D heatmap aggregator para
 * visualizar densidade de nodes ou intensidade de métrica em grade.
 *
 * Estratégia:
 *   - Bin: grade 2D NxM, cada cell acumula count/sum
 *   - Aggregations: count, sum, mean, max
 *   - Smoothing: Gaussian kernel opcional
 *   - Normalize: scale 0-1 para color mapping
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Aggregation types canônicos. */
export const AGGREGATIONS = Object.freeze(['count', 'sum', 'mean', 'max', 'min']);

/** Identidade do módulo. */
export const HEATMAP_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.23',
    deliveredAt: '2026-05-01',
    aggregations: AGGREGATIONS,
});

/**
 * Verifica se aggregation é canônica.
 */
export function isValidAggregation(agg: any) {
    return typeof agg === 'string' && AGGREGATIONS.includes(agg);
}

/**
 * Cria heatmap a partir de pontos.
 *
 * @param {Array<{x:any, y:any, value?:any}>} points
 * @param {{minX:any, minY:any, maxX:any, maxY:any}} bounds
 * @param {any} [options]
 * @returns {{grid:any, width:any, height:any, cellWidth:any, cellHeight:any, max:any, min:any}}
 */
export function createHeatmap(points: Array<{x:any, y:any, value?:any}>, bounds: {minX:any, minY:any, maxX:any, maxY:any}, options: any = {}): {grid:any, width:any, height:any, cellWidth:any, cellHeight:any, max:any, min:any} {
    const empty = {
        grid: [],
        width: 0,
        height: 0,
        cellWidth: 0,
        cellHeight: 0,
        max: 0,
        min: 0,
    };
    if (!Array.isArray(points) || !bounds) return Object.freeze(empty);
    const resolution = Number.isInteger(options.resolution) && options.resolution > 0 ? options.resolution : 20;
    const agg = isValidAggregation(options.aggregation) ? options.aggregation : 'count';

    const dx = bounds.maxX - bounds.minX;
    const dy = bounds.maxY - bounds.minY;
    if (dx <= 0 || dy <= 0) return Object.freeze(empty);

    const width = resolution;
    const height = resolution;
    const cellWidth = dx / width;
    const cellHeight = dy / height;

    // Initialize grid
    const sumGrid = new Array(width * height).fill(0);
    const countGrid = new Array(width * height).fill(0);
    const maxGrid = new Array(width * height).fill(-Infinity);
    const minGrid = new Array(width * height).fill(Infinity);

    for (const p of points) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        if (p.x < bounds.minX || p.x > bounds.maxX) continue;
        if (p.y < bounds.minY || p.y > bounds.maxY) continue;
        const i = Math.min(width - 1, Math.floor((p.x - bounds.minX) / cellWidth));
        const j = Math.min(height - 1, Math.floor((p.y - bounds.minY) / cellHeight));
        const idx = j * width + i;
        const value = Number.isFinite(p.value) ? p.value : 1;
        sumGrid[idx] += value;
        countGrid[idx]++;
        if (value > maxGrid[idx]) maxGrid[idx] = value;
        if (value < minGrid[idx]) minGrid[idx] = value;
    }

    // Compute final grid by aggregation
    const grid = new Array(width * height).fill(0);
    for (let k = 0; k < grid.length; k++) {
        if (countGrid[k] === 0) continue;
        switch (agg) {
            case 'count':
                grid[k] = countGrid[k];
                break;
            case 'sum':
                grid[k] = sumGrid[k];
                break;
            case 'mean':
                grid[k] = sumGrid[k] / countGrid[k];
                break;
            case 'max':
                grid[k] = maxGrid[k];
                break;
            case 'min':
                grid[k] = minGrid[k];
                break;
        }
    }

    let max = -Infinity;
    let min = Infinity;
    for (const v of grid) {
        if (Number.isFinite(v)) {
            if (v > max) max = v;
            if (v < min) min = v;
        }
    }
    if (!Number.isFinite(max)) max = 0;
    if (!Number.isFinite(min)) min = 0;

    return Object.freeze({
        grid: Object.freeze(grid),
        width,
        height,
        cellWidth,
        cellHeight,
        max,
        min,
        bounds,
    });
}

/**
 * Aplica Gaussian smoothing kernel 3x3 (sigma=1).
 *
 * @param {Record<string, any>} heatmap
 * @returns {Object}
 */
export function smooth(heatmap: Record<string, any>): Object {
    if (!heatmap || !Array.isArray(heatmap.grid)) return heatmap;
    const w = heatmap.width;
    const h = heatmap.height;
    if (w < 3 || h < 3) return heatmap;
    const src = heatmap.grid;
    const out = new Array(w * h).fill(0);
    const kernel = [
        [1, 2, 1],
        [2, 4, 2],
        [1, 2, 1],
    ];
    const ksum = 16;

    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            let sum = 0;
            let weight = 0;
            for (let dj = -1; dj <= 1; dj++) {
                for (let di = -1; di <= 1; di++) {
                    const ni = i + di;
                    const nj = j + dj;
                    if (ni < 0 || ni >= w || nj < 0 || nj >= h) continue;
                    const k = kernel[dj + 1]![di + 1]!;
                    sum += src[nj * w + ni]! * k;
                    weight += k;
                }
            }
            out[j * w + i] = weight > 0 ? sum / Math.max(ksum, weight) : 0;
        }
    }
    let max = -Infinity;
    let min = Infinity;
    for (const v of out) {
        if (v > max) max = v;
        if (v < min) min = v;
    }
    return Object.freeze({
        ...heatmap,
        grid: Object.freeze(out),
        max: Number.isFinite(max) ? max : 0,
        min: Number.isFinite(min) ? min : 0,
    });
}

/**
 * Normaliza grid para [0, 1].
 *
 * @param {Record<string, any>} heatmap
 * @returns {Object}
 */
export function normalize(heatmap: Record<string, any>): Object {
    if (!heatmap || !Array.isArray(heatmap.grid)) return heatmap;
    const range = heatmap.max - heatmap.min;
    if (range === 0) {
        return Object.freeze({
            ...heatmap,
            grid: Object.freeze(heatmap.grid.map(() => 0)),
            max: 0,
            min: 0,
        });
    }
    const out = heatmap.grid.map((v: any) => (v - heatmap.min as any) / range);
    return Object.freeze({
        ...heatmap,
        grid: Object.freeze(out),
        max: 1,
        min: 0,
    });
}

/**
 * Detecta peaks (cells maiores que vizinhos).
 *
 * @param {Record<string, any>} heatmap
 * @returns {Array<{i:any, j:any, value:any}>}
 */
export function findPeaks(heatmap: Record<string, any>): Array<{i:any, j:any, value:any}> {
    if (!heatmap || !Array.isArray(heatmap.grid)) return [];
    const w = heatmap.width;
    const h = heatmap.height;
    const grid = heatmap.grid;
    const out = [];
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const v = grid[j * w + i];
            if (!Number.isFinite(v) || v <= 0) continue;
            let isPeak = true;
            for (let dj = -1; dj <= 1; dj++) {
                for (let di = -1; di <= 1; di++) {
                    if (di === 0 && dj === 0) continue;
                    const ni = i + di;
                    const nj = j + dj;
                    if (ni < 0 || ni >= w || nj < 0 || nj >= h) continue;
                    if (grid[nj * w + ni] >= v) {
                        isPeak = false;
                        break;
                    }
                }
                if (!isPeak) break;
            }
            if (isPeak) out.push({ i, j, value: v });
        }
    }
    return (Object.freeze(out) as any);
}

/**
 * Sumariza heatmap.
 */
export function summarizeHeatmap(heatmap: any) {
    const empty = { width: 0, height: 0, max: 0, min: 0, mean: 0, nonZero: 0 };
    if (!heatmap || !Array.isArray(heatmap.grid)) return empty;
    let sum = 0;
    let count = 0;
    let nonZero = 0;
    for (const v of heatmap.grid) {
        if (!Number.isFinite(v)) continue;
        sum += v;
        count++;
        if (v > 0) nonZero++;
    }
    return Object.freeze({
        width: heatmap.width,
        height: heatmap.height,
        max: heatmap.max,
        min: heatmap.min,
        mean: count > 0 ? sum / count : 0,
        nonZero,
        coverage: count > 0 ? nonZero / count : 0,
    });
}

/**
 * Module identity export.
 */
export const heatmapMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.23',
    deliveredAt: '2026-05-01',
    aggregations: AGGREGATIONS,
    exports: [
        'AGGREGATIONS',
        'HEATMAP_META',
        'isValidAggregation',
        'createHeatmap',
        'smooth',
        'normalize',
        'findPeaks',
        'summarizeHeatmap',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
