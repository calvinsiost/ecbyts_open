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
/* ================================================================
   CHANGE DETECTION — Temporal comparison of aerial images
   ================================================================

   Detecta mudancas entre duas imagens aereas do mesmo local em
   diferentes momentos. Tres estrategias com degradacao graciosa:

   TIER 1 — Canvas spectral multi-scale (~100ms, zero modelos):
     Computa indices espectrais (ExG, C3, Sobel, luminancia) para
     cada imagem. Distancia Euclidiana 4D + Otsu threshold + morphClose.

   TIER 2 — SegFormer semantic diff (~500ms, modelo cacheado 5MB):
     Segmentacao semantica em ambas imagens, compara categorias.

   TIER 3 — LLM Vision (~2s, requer API key):
     Envia ambas imagens a modelo de visao para analise estruturada.

   Provenance:
   - Spectral indices: ExG (Woebbecke et al. 1995), C3 (Chen et al. 2009)
   - Otsu threshold: Otsu 1979 "A Threshold Selection Method"
   - Morphological operations: Serra 1982 "Image Analysis and Mathematical Morphology"

   ================================================================ */
import { excessGreen, shadowIndex, toGrayscale, computeEdgeMap, otsuThreshold } from './indices.js';
import { morphClose, findBlobs } from './colorAnalysis.js';
// Change type constants
const CHANGE_TYPES = {
    VEGETATION_GAIN: 'vegetation_gain',
    VEGETATION_LOSS: 'vegetation_loss',
    CONSTRUCTION: 'construction',
    DEMOLITION: 'demolition',
    WATER_CHANGE: 'water_change',
    UNKNOWN: 'unknown',
};
const CHANGE_COLORS: Record<string, number[]> = {
    vegetation_gain: [0, 200, 0, 160],
    vegetation_loss: [200, 0, 0, 160],
    construction: [255, 165, 0, 160],
    demolition: [128, 128, 128, 160],
    water_change: [0, 100, 255, 160],
    unknown: [255, 255, 0, 120],
};
const ANALYSIS_SIZE = 512;
// ----------------------------------------------------------------
// IMAGE INDICES - Compute spectral indices for a single image
// ----------------------------------------------------------------
/**
 * Compute spectral index grids for an image.
 * Retorna grids de ExG, C3, edges e luminancia para uso em change detection.
 *
 * @param {string} imageDataUrl - Base64 image
 * @returns {Promise<{exgGrid: Float32Array, c3Grid: Float32Array, edgeGrid: Uint8Array, grayGrid: Uint8Array, w: number, h: number}>}
 */
export async function computeImageIndices(imageDataUrl: any) {
    const { pixels, w, h } = await _loadImagePixels(imageDataUrl);
    const count = w * h;
    const exgGrid = new Float32Array(count);
    const c3Grid = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        const off = i * 4;
        const r = pixels[off]!, g = pixels[off + 1]!, b = pixels[off + 2]!;
        exgGrid[i] = excessGreen(r, g, b);
        c3Grid[i] = shadowIndex(r, g, b);
    }
    const grayGrid = toGrayscale(pixels, count);
    const edgeGrid = computeEdgeMap(grayGrid, w, h);
    return { exgGrid, c3Grid, edgeGrid, grayGrid, w, h };
}
// ----------------------------------------------------------------
// SPECTRAL DISTANCE - Pixel-wise distance in 4D index space
// ----------------------------------------------------------------
/**
 * Compute pixel-wise Euclidean distance between two index sets.
 * Distancia em espaco 4D normalizado: ExG, C3, edge, luminancia.
 *
 * @param {any} indicesA - Indices from image A
 * @param {any} indicesB - Indices from image B
 * @returns {Float32Array} Distance map (0-1 normalized)
 */
export function spectralDistance(indicesA: any, indicesB: any) {
    const count = indicesA.w * indicesA.h;
    const dist = new Float32Array(count);
    let maxDist = 0;
    for (let i = 0; i < count; i++) {
        const dExG = indicesA.exgGrid[i] - indicesB.exgGrid[i];
        const dC3 = (indicesA.c3Grid[i] - indicesB.c3Grid[i]) / (Math.PI / 2); // normalize C3 to ~0-1
        const dEdge = (indicesA.edgeGrid[i] - indicesB.edgeGrid[i]) / 255;
        const dLum = (indicesA.grayGrid[i] - indicesB.grayGrid[i]) / 255;
        const d = Math.sqrt(dExG * dExG + dC3 * dC3 + dEdge * dEdge + dLum * dLum);
        dist[i] = d;
        if (d > maxDist)
            maxDist = d;
    }
    // Normalize to 0-1
    if (maxDist > 0) {
        for (let i = 0; i < count; i++)
            dist[i] = dist[i]! / maxDist;
    }
    return dist;
}
// ----------------------------------------------------------------
// CHANGE MASK - Binary mask from distance map via Otsu
// ----------------------------------------------------------------
/**
 * Generate binary change mask from distance map.
 * Usa Otsu threshold + morphClose para limpar ruido.
 *
 * @param {Float32Array} distanceMap - Normalized distance (0-1)
 * @param {number} w - Width
 * @param {number} h - Height
 * @returns {{mask: Uint8Array, threshold: number}}
 */
export function generateChangeMask(distanceMap: any, w: any, h: any) {
    const count = w * h;
    // Build histogram (256 bins) from float distance map
    const histogram = new Uint32Array(256);
    for (let i = 0; i < count; i++) {
        const bin = Math.min(255, Math.round(distanceMap[i] * 255));
        histogram[bin] = (histogram[bin] ?? 0) + 1;
    }
    const threshold = otsuThreshold(histogram, count);
    const normThreshold = threshold / 255;
    // Binary mask: 1 = changed, 0 = unchanged
    const mask = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
        mask[i] = distanceMap[i] >= normThreshold ? 1 : 0;
    }
    // Morphological close to fill holes (reuse category 1 for changed)
    const cleanMask = morphClose(mask, w, h, new Set([1]));
    return { mask: cleanMask, threshold: normThreshold };
}
// ----------------------------------------------------------------
// CLASSIFY CHANGES - Determine change type per region
// ----------------------------------------------------------------
/**
 * Classify change blobs by type using index differences.
 * Analisa direcao da mudanca em cada blob para determinar tipo.
 *
 * @param {Uint8Array} changeMask - Binary change mask
 * @param {any} indicesA - Indices from image A (reference)
 * @param {any} indicesB - Indices from image B (comparison)
 * @returns {Array<{type: string, bbox: any, area_px: number, confidence: number, meanDelta: any}>}
 */
export function classifyChanges(changeMask: any, indicesA: any, indicesB: any) {
    const w = indicesA.w;
    const h = indicesA.h;
    // Find connected change blobs
    const blobsResult = findBlobs(changeMask, w, h);
    const changes: any[] = [];
    for (const blob of blobsResult.blobs) {
        const b = blob;
        if (b.pixels < 25)
            continue; // Ignore tiny changes (<25px)
        // Compute mean delta for each index within blob
        let sumDExG = 0, sumDEdge = 0, sumDC3 = 0, count = 0;
        for (let y = b.minY; y <= b.maxY; y++) {
            for (let x = b.minX; x <= b.maxX; x++) {
                const idx = y * w + x;
                if (changeMask[idx] !== b.category)
                    continue;
                sumDExG += indicesB.exgGrid[idx] - indicesA.exgGrid[idx];
                sumDEdge += indicesB.edgeGrid[idx] - indicesA.edgeGrid[idx];
                sumDC3 += indicesB.c3Grid[idx] - indicesA.c3Grid[idx];
                count++;
            }
        }
        if (count === 0)
            continue;
        const meanDExG = sumDExG / count;
        const meanDEdge = sumDEdge / count;
        const meanDC3 = sumDC3 / count;
        // Classify based on direction of change
        let type = CHANGE_TYPES.UNKNOWN;
        if (meanDExG > 0.05)
            type = CHANGE_TYPES.VEGETATION_GAIN;
        else if (meanDExG < -0.05)
            type = CHANGE_TYPES.VEGETATION_LOSS;
        else if (meanDEdge > 10)
            type = CHANGE_TYPES.CONSTRUCTION;
        else if (meanDEdge < -10)
            type = CHANGE_TYPES.DEMOLITION;
        else if (Math.abs(meanDC3) > 0.2)
            type = CHANGE_TYPES.WATER_CHANGE;
        changes.push({
            type,
            bbox: { minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY },
            area_px: b.pixels,
            confidence: Math.min(0.95, 0.5 + Math.abs(meanDExG) + Math.abs(meanDEdge) / 50),
            meanDelta: { exg: meanDExG, edge: meanDEdge, c3: meanDC3 },
        });
    }
    return changes;
}
// ----------------------------------------------------------------
// TIER 1: CANVAS CHANGE DETECTION - Full pipeline
// ----------------------------------------------------------------
/**
 * Detect changes between two images using canvas-based spectral analysis.
 * Pipeline completa Tier 1: indices → distancia → Otsu → morphClose → classificacao.
 *
 * @param {string} imageA - Reference image (dataURL)
 * @param {string} imageB - Comparison image (dataURL)
 * @param {any} [extent] - { minX, maxX, minZ, maxZ } for area calculation
 * @param {any} [options] - { onProgress }
 * @returns {Promise<{changes: any[], changeMask: Uint8Array, overlay: string, stats: any}>}
 */
export async function detectChangesCanvas(imageA: any, imageB: any, extent?: any, options: any = {}) {
    const { onProgress } = options;
    onProgress?.({ message: 'Computing reference indices...', progress: 10 });
    const indicesA = await computeImageIndices(imageA);
    onProgress?.({ message: 'Computing comparison indices...', progress: 30 });
    const indicesB = await computeImageIndices(imageB);
    onProgress?.({ message: 'Computing spectral distance...', progress: 50 });
    const distanceMap = spectralDistance(indicesA, indicesB);
    onProgress?.({ message: 'Generating change mask...', progress: 70 });
    const { mask, threshold } = generateChangeMask(distanceMap, indicesA.w, indicesA.h);
    onProgress?.({ message: 'Classifying changes...', progress: 85 });
    const changes = classifyChanges(mask, indicesA, indicesB);
    // Compute area if extent provided
    const w = indicesA.w, h = indicesA.h;
    if (extent) {
        const ext = extent;
        const worldW = ext.maxX - ext.minX;
        const worldH = ext.maxZ - ext.minZ;
        const pixelArea = (worldW * worldH) / (w * h);
        for (const c of changes) {
            c.area_m2 = Math.round(c.area_px * pixelArea * 10) / 10;
        }
    }
    // Render change overlay
    onProgress?.({ message: 'Rendering overlay...', progress: 95 });
    const overlay = _renderChangeOverlay(mask, changes, w, h);
    const stats = {
        changedPixels: mask.reduce((s: any, v: any) => s + (v > 0 ? 1 : 0), 0),
        totalPixels: w * h,
        changePercent: Math.round((mask.reduce((s: any, v: any) => s + (v > 0 ? 1 : 0), 0) / (w * h)) * 1000) / 10,
        threshold,
        changeCount: changes.length,
    };
    onProgress?.({ message: 'Change detection complete', progress: 100 });
    return { changes, changeMask: mask, overlay, stats };
}
// ----------------------------------------------------------------
// UNIFIED DISPATCHER
// ----------------------------------------------------------------
/**
 * Detect changes with automatic tier selection.
 * @param {string} imageA - Reference image
 * @param {string} imageB - Comparison image
 * @param {any} [extent] - Spatial extent
 * @param {any} [options] - { tier: 'canvas'|'segformer'|'llm', onProgress }
 * @returns {Promise<any>}
 */
export async function detectChanges(imageA: any, imageB: any, extent?: any, options: any = {}) {
    const tier = options.tier || 'canvas';
    if (tier === 'canvas') {
        return detectChangesCanvas(imageA, imageB, extent, options);
    }
    // Tiers 2 and 3 can be added later (SegFormer diff, LLM Vision)
    return detectChangesCanvas(imageA, imageB, extent, options);
}
// ----------------------------------------------------------------
// INTERNALS
// ----------------------------------------------------------------
/** @param {any} imageDataUrl */
async function _loadImagePixels(imageDataUrl: any) {
    const img = (await new Promise((resolve: any, reject: any) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = imageDataUrl;
    }));
    const canvas = document.createElement('canvas');
    canvas.width = ANALYSIS_SIZE;
    canvas.height = ANALYSIS_SIZE;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img as any, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
    const imageData = ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
    // Cleanup
    canvas.width = 0;
    canvas.height = 0;
    return { pixels: imageData.data, w: ANALYSIS_SIZE, h: ANALYSIS_SIZE };
}
/** @param {any} mask @param {any} changes @param {any} w @param {any} h */
function _renderChangeOverlay(mask: any, changes: any, w: any, h: any) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    // Build type map from changes (bbox → type)
    const typeMap = new Uint8Array(w * h);
    const typeNames = Object.values(CHANGE_TYPES);
    for (const c of changes) {
        const typeIdx = typeNames.indexOf(c.type);
        for (let y = c.bbox.minY; y <= c.bbox.maxY; y++) {
            for (let x = c.bbox.minX; x <= c.bbox.maxX; x++) {
                const idx = y * w + x;
                if (mask[idx] > 0)
                    typeMap[idx] = typeIdx + 1;
            }
        }
    }
    for (let i = 0; i < w * h; i++) {
        if (typeMap[i] === 0)
            continue;
        const typeName = typeNames[typeMap[i]! - 1]!;
        const color: number[] = CHANGE_COLORS[typeName] ||
            CHANGE_COLORS.unknown || [];
        const off = i * 4;
        data[off] = color[0]!;
        data[off + 1] = color[1]!;
        data[off + 2] = color[2]!;
        data[off + 3] = color[3]!;
    }
    ctx.putImageData(imageData, 0, 0);
    const result = canvas.toDataURL('image/png');
    canvas.width = 0;
    canvas.height = 0;
    return result;
}
export { CHANGE_TYPES, CHANGE_COLORS };
