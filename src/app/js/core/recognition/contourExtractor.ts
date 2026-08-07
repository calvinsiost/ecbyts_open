// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   CONTOUR EXTRACTOR — Isoline extraction from raster imagery
   ================================================================

   Pipeline: RGBA image → grayscale → Sobel edge detection →
   marching squares (reusing core/interpolation/contours.js) →
   vectorized polylines.

   Projetado para extrair isolinhas de mapas raster escaneados
   (topograficos, isopletas, etc.) antes da georeferenciacao.
   ================================================================ */

import { buildContoursFromGrid } from '../interpolation/contours.js';

/**
 * Convert RGBA pixel data to grayscale Float32Array.
 * Uses BT.601 luminance: 0.299*R + 0.587*G + 0.114*B.
 * @param {Uint8ClampedArray|number[]} rgba - RGBA pixel data (length = 4 * width * height)
 * @param {number} width
 * @param {number} height
 * @returns {Float32Array} grayscale values 0-255
 */
export function toGrayscale(rgba: Uint8ClampedArray | number[], width: number, height: number): Float32Array {
    if (!rgba || !width || !height) return new Float32Array(0);
    const n = width * height;
    const gray = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const off = i * 4;
        gray[i] = 0.299 * rgba[off]! + 0.587 * rgba[off + 1]! + 0.114 * rgba[off + 2]!;
    }
    return gray;
}

/**
 * Apply Sobel edge detection to a grayscale grid.
 * Returns gradient magnitude as Float32Array.
 * @param {Float32Array} gray - grayscale grid (row-major)
 * @param {number} width
 * @param {number} height
 * @param {number} [threshold=30] - magnitude below this → 0
 * @returns {Float32Array} edge magnitude grid
 */
export function sobelEdgeDetect(
    gray: Float32Array,
    width: number,
    height: number,
    threshold: number = 30,
): Float32Array {
    if (!gray || width < 3 || height < 3) return new Float32Array(0);
    const out = new Float32Array(width * height);
    const thr = Number(threshold) || 30;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const gx = _sobelGx(gray, width, x, y);
            const gy = _sobelGy(gray, width, x, y);
            const mag = Math.sqrt(gx * gx + gy * gy);
            out[y * width + x] = mag >= thr ? mag : 0;
        }
    }
    return out;
}

/**
 * Sobel Gx kernel at (x, y).
 * @param {Float32Array} g
 * @param {number} w
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function _sobelGx(g: Float32Array, w: number, x: number, y: number): number {
    return (
        -g[(y - 1) * w + (x - 1)]! +
        g[(y - 1) * w + (x + 1)]! +
        -2 * g[y * w + (x - 1)]! +
        2 * g[y * w + (x + 1)]! +
        -g[(y + 1) * w + (x - 1)]! +
        g[(y + 1) * w + (x + 1)]!
    );
}

/**
 * Sobel Gy kernel at (x, y).
 * @param {Float32Array} g
 * @param {number} w
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function _sobelGy(g: Float32Array, w: number, x: number, y: number): number {
    return (
        -g[(y - 1) * w + (x - 1)]! -
        2 * g[(y - 1) * w + x]! -
        g[(y - 1) * w + (x + 1)]! +
        g[(y + 1) * w + (x - 1)]! +
        2 * g[(y + 1) * w + x]! +
        g[(y + 1) * w + (x + 1)]!
    );
}

/**
 * Trace connected contour segments from an edge map.
 * Groups non-zero pixels into connected chains using 8-connectivity.
 * @param {Float32Array} edges - edge magnitude grid
 * @param {number} width
 * @param {number} height
 * @param {number} [minLength=10] - discard chains shorter than this
 * @returns {Array<Array<{x:number, y:number}>>} array of pixel chains
 */
export function traceContours(
    edges: Float32Array,
    width: number,
    height: number,
    minLength: number = 10,
): Array<Array<{ x: number; y: number }>> {
    if (!edges || width < 2 || height < 2) return [];
    const visited = new Uint8Array(width * height);
    const chains: Array<Array<{ x: number; y: number }>> = [];
    const min = Number(minLength) || 10;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            if (edges[idx] === 0 || visited[idx]) continue;
            const chain = _followChain(edges, visited, width, height, x, y);
            if (chain.length >= min) chains.push(chain);
        }
    }
    return chains;
}

/**
 * Follow a connected chain of edge pixels using 8-connectivity.
 * @param {Float32Array} edges
 * @param {Uint8Array} visited
 * @param {number} w
 * @param {number} h
 * @param {number} sx - start x
 * @param {number} sy - start y
 * @returns {Array<{x:number, y:number}>}
 */
function _followChain(
    edges: Float32Array,
    visited: Uint8Array,
    w: number,
    h: number,
    sx: number,
    sy: number,
): Array<{ x: number; y: number }> {
    const chain: Array<{ x: number; y: number }> = [];
    const stack: Array<{ x: number; y: number }> = [{ x: sx, y: sy }];
    const DX = [-1, 0, 1, -1, 1, -1, 0, 1];
    const DY = [-1, -1, -1, 0, 0, 1, 1, 1];

    while (stack.length > 0) {
        const { x, y } = stack.pop() as { x: number; y: number };
        const idx = y * w + x;
        if (visited[idx]) continue;
        visited[idx] = 1;
        chain.push({ x, y });

        for (let d = 0; d < 8; d++) {
            const nx = x + DX[d]!;
            const ny = y + DY[d]!;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const ni = ny * w + nx;
            if (edges[ni]! > 0 && !visited[ni]) {
                stack.push({ x: nx, y: ny });
            }
        }
    }
    return chain;
}

/**
 * Full contour extraction pipeline from RGBA image data.
 * Grayscale → Sobel edges → marching squares → vectorized polylines.
 * @param {Uint8ClampedArray|number[]} imageData - RGBA pixel data
 * @param {number} width
 * @param {number} height
 * @param {Object} [options]
 * @param {number} [options.edgeThreshold=30] - Sobel threshold
 * @param {number} [options.minChainLength=10] - min contour pixels
 * @param {number} [options.levelCount=10] - number of contour levels
 * @param {number[]} [options.levels] - explicit contour levels
 * @param {boolean} [options.useMarching=true] - use marching squares on grayscale
 * @returns {{contours:Array<any>, edges:Array<any>, grayscale:Float32Array}}
 */
export function extractContours(
    imageData: Uint8ClampedArray | number[],
    width: number,
    height: number,
    options: {
        edgeThreshold?: number;
        minChainLength?: number;
        levelCount?: number;
        levels?: number[];
        useMarching?: boolean;
    } = {},
): { contours: Array<any>; edges: Array<any>; grayscale: Float32Array } {
    const { edgeThreshold = 30, minChainLength = 10, levelCount = 10, levels, useMarching = true } = options;

    if (!imageData || !width || !height) {
        return { contours: [], edges: [], grayscale: new Float32Array(0) };
    }

    const gray = toGrayscale(imageData, width, height);

    // Edge-based contour tracing
    const edgeMag = sobelEdgeDetect(gray, width, height, edgeThreshold);
    const edgeChains = traceContours(edgeMag, width, height, minChainLength);

    // Marching squares on grayscale field (reuses interpolation/contours.js)
    let marchingContours: any[] = [];
    if (useMarching) {
        marchingContours = buildContoursFromGrid({
            grid: gray,
            bounds: { minX: 0, maxX: width - 1, minZ: 0, maxZ: height - 1 },
            gridSize: { cols: width, rows: height },
            levels,
            levelCount,
        } as any);
    }

    return {
        contours: marchingContours,
        edges: edgeChains,
        grayscale: gray,
    };
}
