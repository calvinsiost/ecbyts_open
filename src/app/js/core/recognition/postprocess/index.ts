// @ts-check
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
// @ts-check

/* ================================================================
   ANTI-AMEBA — Post-processing pipeline for AI-generated masks
   ================================================================

   Protocolo de pos-processamento que transforma mascaras "organicas"
   (amebas derretidas) geradas por IA em geometria limpa e
   matematica para o WebGL e engenharia.

   Pipeline por familia:
   - building:    marchingSquares → RDP(ε=3.0) → orthogonalize → georeference
   - vegetation:  marchingSquares → RDP(ε=1.0) → smooth(σ=1.5) → georeference
   - water:       marchingSquares → RDP(ε=1.5) → smooth(σ=1.5) → georeference
   - roads:       marchingSquares → RDP(ε=2.0) → georeference
   - soil:        marchingSquares → RDP(ε=1.5) → georeference

   Reutiliza funcoes existentes:
   - simplify.js: adaptiveEpsilon, smoothPolygon, contourRectFillRatio
   - georeference.js: contourToWorld, computeAreaM2, computePerimeterM
   - orthogonalize.js: orthogonalize (novo)
   - marchingSquares.js: marchingSquares, largestContour (novo)

   ================================================================ */

import { marchingSquares } from './marchingSquares.js';
import { orthogonalize } from './orthogonalize.js';
import { smoothPolygon } from '../vectorization/simplify.js';
import { contourToWorld, computeAreaM2, computePerimeterM } from '../vectorization/georeference.js';

// ----------------------------------------------------------------
// FAMILY → STRATEGY MAPPING
// Define qual pos-processamento aplicar por tipo de feicao
// ----------------------------------------------------------------

const STRATEGY = {
    building: { epsilon: 3.0, ortho: true, smooth: false, minArea: 150 },
    building_bright: { epsilon: 3.0, ortho: true, smooth: false, minArea: 150 },
    building_dark: { epsilon: 3.0, ortho: true, smooth: false, minArea: 150 },
    tank: { epsilon: 2.5, ortho: true, smooth: false, minArea: 100 },
    vegetation: { epsilon: 1.0, ortho: false, smooth: true, minArea: 200 },
    habitat: { epsilon: 1.0, ortho: false, smooth: true, minArea: 200 },
    water: { epsilon: 1.5, ortho: false, smooth: true, minArea: 300 },
    lake: { epsilon: 1.5, ortho: false, smooth: true, minArea: 300 },
    river: { epsilon: 1.5, ortho: false, smooth: true, minArea: 200 },
    roads: { epsilon: 2.0, ortho: false, smooth: false, minArea: 100 },
    infrastructure: { epsilon: 2.0, ortho: false, smooth: false, minArea: 100 },
    soil: { epsilon: 1.5, ortho: false, smooth: false, minArea: 200 },
};

// ----------------------------------------------------------------
// DEFAULT HEIGHT MAP - Height per class for 3D extrusion
// Metros para extrudir cada tipo de shape na cena 3D
// ----------------------------------------------------------------

const CLASS_HEIGHT = {
    building: 4.0,
    building_bright: 4.0,
    building_dark: 4.0,
    tank: 3.0,
    vegetation: 2.0,
    habitat: 2.0,
    water: 0.05,
    lake: 0.05,
    river: 0.05,
    roads: 0.1,
    infrastructure: 0.5,
    soil: 0.05,
};

// ----------------------------------------------------------------
// MAIN PIPELINE - Anti-Ameba for a single binary mask
// ----------------------------------------------------------------

/**
 * Anti-Ameba post-processing pipeline for a single class mask.
 * mask → contour extraction → simplification → ortho/smooth → georeference
 *
 * @param {Uint8Array} mask - Binary mask for one class (0 or 255), row-major
 * @param {string} family - 'building' | 'vegetation' | 'water' | etc.
 * @param {Object} extent - { minX, maxX, minZ, maxZ } in Three.js world coords
 * @param {number} [width=512] - Mask width
 * @param {number} [height=512] - Mask height
 * @param {Object} [options={}]
 * @param {number} [options.epsilon] - Override RDP epsilon
 * @param {number} [options.snapThreshold=20] - Ortho angle tolerance (degrees)
 * @param {number} [options.smoothSigma=1.5] - Gaussian smooth sigma
 * @param {number} [options.minContourArea] - Override minimum area filter
 * @returns {Array<AntiAmebaResult>}
 *
 * @typedef {Object} AntiAmebaResult
 * @property {Array<{x: number, y: number}>} pixelContour - Simplified pixel contour
 * @property {Array<{x: number, z: number}>} worldContour - Three.js world coords
 * @property {number} area_m2 - Area in square meters
 * @property {number} perimeter_m - Perimeter in meters
 * @property {number} height - Suggested extrusion height (meters)
 * @property {string} family - Classification family
 */
interface AntiAmebaStrategy {
    epsilon: number;
    ortho: boolean;
    smooth: boolean;
    minArea: number;
}

interface AntiAmebaOptions {
    epsilon?: number;
    snapThreshold?: number;
    smoothSigma?: number;
    minContourArea?: number;
}

function _resolveStrategy(family: string, options: AntiAmebaOptions): AntiAmebaStrategy {
    const base = (STRATEGY as Record<string, AntiAmebaStrategy>)[family] || STRATEGY.soil;
    return {
        epsilon: options.epsilon ?? base.epsilon,
        ortho: base.ortho,
        smooth: base.smooth,
        minArea: options.minContourArea ?? base.minArea,
    };
}

function _processSingleContour(
    rawContour: Array<{ x: number; y: number }>,
    strategy: AntiAmebaStrategy,
    extent: { minX: number; maxX: number; minZ: number; maxZ: number },
    width: number,
    height: number,
    snapThreshold: number,
    smoothSigma: number,
    family: string,
): { pixelContour: Array<{ x: number; y: number }>; worldContour: Array<{ x: number; z: number }>; area_m2: number; perimeter_m: number; height: number; family: string } | null {
    const rawArea = _polyArea(rawContour);
    if (rawArea < strategy.minArea) return null;

    let simplified = _rdpSimplify(rawContour, strategy.epsilon);
    if (simplified.length < 3) return null;

    if (strategy.ortho) {
        simplified = orthogonalize(simplified, {
            angleTolerance: snapThreshold,
            minEdgeLength: 3,
        });
    } else if (strategy.smooth) {
        simplified = smoothPolygon(simplified, smoothSigma);
    }

    if (simplified.length < 3) return null;

    const worldContour = contourToWorld(simplified, extent as any, width, height);
    const area_m2 = computeAreaM2(worldContour);
    const perimeter_m = computePerimeterM(worldContour);

    const minAreaM2 = strategy.ortho ? 1 : 5;
    if (area_m2 < minAreaM2) return null;

    return {
        pixelContour: simplified,
        worldContour,
        area_m2,
        perimeter_m,
        height: (CLASS_HEIGHT as Record<string, number>)[family] ?? 0.1,
        family,
    };
}

export function antiAmeba(mask: any, family: any, extent: any, width = 512, height = 512, options: any = {}) {
    const strategy = _resolveStrategy(family, options);
    const snapThreshold = options.snapThreshold ?? 20;
    const smoothSigma = options.smoothSigma ?? 1.5;

    const contours = marchingSquares(mask, width, height);
    if (contours.length === 0) return [];

    const results = [];
    for (const rawContour of contours) {
        const result = _processSingleContour(
            rawContour,
            strategy,
            extent,
            width,
            height,
            snapThreshold,
            smoothSigma,
            family,
        );
        if (result) results.push(result);
    }

    return results;
}

// ----------------------------------------------------------------
// SINGLE MASK - Process single SAM/click-generated mask
// Conveniencia para SAM onde a mascara contem um unico objeto
// ----------------------------------------------------------------

/**
 * Anti-Ameba for a single-object mask (SAM interactive output).
 * Extrai o maior contorno e aplica pos-processamento.
 *
 * @param {Uint8Array} mask - Binary mask
 * @param {string} family - Detected/assigned family
 * @param {Object} extent
 * @param {number} [width=512]
 * @param {number} [height=512]
 * @param {Object} [options={}]
 * @returns {AntiAmebaResult|null}
 */
export function antiAmebaSingle(mask: any, family: any, extent: any, width = 512, height = 512, options: any = {}) {
    const results = antiAmeba(mask, family, extent, width, height, options);
    if (results.length === 0) return null;

    // Retornar o maior por area
    let best = results[0]!;
    for (let i = 1; i < results.length; i++) {
        if (results[i]!.area_m2! > best.area_m2!) best = results[i]!;
    }
    return best;
}

// ----------------------------------------------------------------
// BATCH - Process full category grid (all classes at once)
// Para integrar com categoryGrid de colorAnalysis/SegFormer
// ----------------------------------------------------------------

/**
 * Process a full category grid through the Anti-Ameba pipeline.
 * Separa grid em mascaras binarias por classe e processa cada uma.
 *
 * @param {Uint8Array} categoryGrid - Grid 512x512, values 0-6
 * @param {Object} extent
 * @param {number} [width=512]
 * @param {number} [height=512]
 * @param {Object} [options={}]
 * @returns {Array<AntiAmebaResult>}
 */
export function antiAmebaBatch(categoryGrid: any, extent: any, width = 512, height = 512, options: any = {}) {
    // Mapeamento de category index para family string
    // Mesmo mapeamento de colorAnalysis.js CATEGORY_KEYS
    const CATEGORY_MAP = {
        1: 'water',
        2: 'vegetation',
        3: 'building', // building_bright
        4: 'building', // building_dark
        5: 'infrastructure',
        6: 'soil',
    };

    const allResults = [];

    // Processar cada categoria separadamente
    for (const [catIdxStr, family] of Object.entries(CATEGORY_MAP)) {
        const catIdx = Number(catIdxStr);

        // Criar mascara binaria para esta categoria
        const mask = new Uint8Array(width * height);
        for (let i = 0; i < categoryGrid.length; i++) {
            mask[i] = categoryGrid[i] === catIdx ? 255 : 0;
        }

        // Anti-Ameba para esta classe
        const results = antiAmeba(mask, family, extent, width, height, options);
        allResults.push(...results);
    }

    return allResults;
}

// ----------------------------------------------------------------
// RDP SIMPLIFY - Ramer-Douglas-Peucker (pure JS, iterative)
// Re-implementacao sem dependencia do OpenCV
// ----------------------------------------------------------------

/**
 * Ramer-Douglas-Peucker polygon simplification (iterative stack-based).
 * Reduz contagem de vertices preservando forma geral.
 *
 * @param {Array<{x: number, y: number}>} points
 * @param {number} points - Tolerance in pixels
 * @returns {Array<{x: number, y: number}>}
 */
function _rdpSimplify(points: any, epsilon: any) {
    if (points.length <= 3) return points.slice();

    const n = points.length;
    const keep = new Uint8Array(n);
    keep[0] = 1;
    keep[n - 1] = 1;

    // Stack iterativo (evita recursao profunda)
    const stack = [[0, n - 1]];

    while (stack.length > 0) {
        const popped = stack.pop();
        if (!popped) continue;
        const [start, end] = popped;
        if (end! - start! < 2) continue;

        let maxDist = 0;
        let maxIdx = start;

        for (let i = start! + 1; i < end!; i++) {
            const d = _pointLineDistance(points[i], points[start!], points[end!]);
            if (d > maxDist) {
                maxDist = d;
                maxIdx = i;
            }
        }

        if (maxDist > epsilon) {
            keep[maxIdx!] = 1;
            stack.push([start!, maxIdx!]);
            stack.push([maxIdx!, end!]);
        }
    }

    return points.filter((_: any, i: any) => keep[i]);
}

/**
 * Perpendicular distance from point P to line segment AB.
 * @param {{x:number,y:number}} p
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 */
function _pointLineDistance(p: any, a: any, b: any) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq < 1e-10) {
        const ex = p.x - a.x;
        const ey = p.y - a.y;
        return Math.sqrt(ex * ex + ey * ey);
    }

    const cross = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx);
    return cross / Math.sqrt(lenSq);
}

/**
 * Polygon area via Shoelace (absolute value).
 * @param {Array<{x:number,y:number}>} pts
 */
function _polyArea(pts: any) {
    let area = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += pts[i].x * pts[j].y;
        area -= pts[j].x * pts[i].y;
    }
    return Math.abs(area) / 2;
}
