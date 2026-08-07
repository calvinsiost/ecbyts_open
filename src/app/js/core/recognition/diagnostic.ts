// @ts-check
// Generated from src/app/js/core/recognition/diagnostic.ts by TS-MIGRATION-001. Do not edit manually.
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
   AERIAL DIAGNOSTIC — Verbose analysis for algorithm tuning
   ================================================================

   Modulo diagnostico que executa a analise aerea com coleta de
   metricas intermediarias: classificacao de pixels, blobs brutos,
   filtros aplicados, e comparacao AI vs algoritmo.

   Usado via API bridge para testes automatizados.

   ================================================================ */
import { analyzeByColor } from './colorAnalysis.js';
import { loadImageAsDataUrl, analyzeWithAI } from './analyzer.js';
import { hasApiKey } from '../llm/client.js';
import { getAllElements } from '../elements/manager.js';
import { isShadow, excessGreen, toGrayscale, computeEdgeMap, blobEdgeDensity } from './indices.js';
// ----------------------------------------------------------------
// HSL CATEGORIES (mirror from colorAnalysis for pixel-level stats)
// ----------------------------------------------------------------
/** @type {Record<string, {family: string, match: (h:number,s:number,l:number)=>boolean}>} */
const CATEGORIES = {
    water: { family: 'lake', match: (h: any, s: any, l: any) => h >= 170 && h <= 260 && s > 10 && l >= 5 && l <= 75 },
    vegetation: { family: 'habitat', match: (h: any, s: any, l: any) => h >= 50 && h <= 170 && s > 7 && l >= 3 && l <= 75 },
    building_bright: { family: 'building', match: (h: any, s: any, l: any) => s < 18 && l > 70 },
    building_dark: { family: 'building', match: (h: any, s: any, l: any) => s < 18 && l >= 12 && l <= 55 },
    infrastructure: { family: 'marker', match: (h: any, s: any, l: any) => s < 15 && l > 48 && l <= 72 },
    soil: { family: 'marker', match: (h: any, s: any, l: any) => h >= 15 && h <= 55 && s >= 10 && s <= 55 && l >= 15 && l <= 68 },
};
const CAT_KEYS = Object.keys(CATEGORIES);
function rgbToHsl(r: number, g: number, b: number) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: l * 100 };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return { h: h * 360, s: s * 100, l: l * 100 };
}
// ----------------------------------------------------------------
// MAIN DIAGNOSTIC
// ----------------------------------------------------------------
/**
 * Run full diagnostic analysis on boundary overlay.
 * Executa analise completa com metricas detalhadas para tuning.
 * @param {any} [options]
 * @returns {Promise<any>}
 */
export async function runDiagnostic(options: any = {}) {
    const { includeAI = false, resolution = 512 } = options;
    const report: any = _createDiagnosticReport(options);
    // 1. Find boundary with overlay
    const boundary = _findDiagnosticBoundary(report);
    if (!boundary) return report;
    report.boundary = _buildBoundaryReport(boundary);
    const extent = report.boundary.extent;
    // 2. Load image
    const dataUrl = await _loadDiagnosticImage(boundary, resolution, report);
    if (!dataUrl) return report;
    // 3. Pixel-level analysis
    const px: any = await _pixelAnalysis(dataUrl, resolution);
    report.imageStats.originalSize = px.originalSize;
    report.imageStats.analysisSize = px.analysisSize;
    report.pixelClassification = px.classification;
    report.blobAnalysis = px.blobs;
    // 4. Standard algorithm
    report.algorithmResults = await _runAlgorithmDiagnostic(dataUrl, extent);
    // 5. AI analysis (optional)
    if (includeAI) report.aiResults = await _runAIDiagnostic(dataUrl, extent, report.algorithmResults);
    // 6. Suggestions
    report.suggestions = _suggest(report);
    return report;
}
/**
 * Build the empty diagnostic report shell.
 * @param {any} options
 * @returns {any}
 */
function _createDiagnosticReport(options: any) {
    return {
        timestamp: new Date().toISOString(),
        resolution: options.resolution ?? 512,
        boundary: null,
        imageStats: null,
        pixelClassification: null,
        blobAnalysis: null,
        algorithmResults: null,
        aiResults: null,
        comparison: null,
        suggestions: [],
    };
}
/**
 * Locate a boundary element that has an overlay URL.
 * @param {any} report
 * @returns {any|null}
 */
function _findDiagnosticBoundary(report: any) {
    const boundary = (getAllElements().find((e: any) => e.family === 'boundary' && e.data?.overlayUrl)) as any;
    if (!boundary) {
        report.error = 'No boundary with overlay URL';
        return null;
    }
    return boundary;
}
/**
 * Build the boundary metadata block for the report.
 * @param {any} boundary
 * @returns {any}
 */
function _buildBoundaryReport(boundary: any) {
    const extent = _computeVertexExtent(boundary.data.vertices || []);
    return {
        id: boundary.id,
        name: boundary.name,
        overlayUrl: boundary.data.overlayUrl,
        extent,
        worldSize: { w: Math.round(extent.maxX - extent.minX), h: Math.round(extent.maxZ - extent.minZ) },
    };
}
/**
 * Compute axis-aligned extent from boundary vertices.
 * @param {Array<{x:number,z:number}>} verts
 * @returns {{minX:number,maxX:number,minZ:number,maxZ:number}}
 */
function _computeVertexExtent(verts: any[]) {
    let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
    for (const v of verts) {
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.z < minZ) minZ = v.z;
        if (v.z > maxZ) maxZ = v.z;
    }
    return { minX, maxX, minZ, maxZ };
}
/**
 * Load the overlay image for the diagnostic.
 * @param {any} boundary
 * @param {number} resolution
 * @param {any} report
 * @returns {Promise<string|null>}
 */
async function _loadDiagnosticImage(boundary: any, resolution: number, report: any) {
    try {
        const dataUrl = await loadImageAsDataUrl(boundary.data.overlayUrl, resolution);
        report.imageStats = { loaded: true };
        return dataUrl;
    } catch (err: any) {
        report.error = `Image load: ${(err as any).message}`;
        return null;
    }
}
/**
 * Run the standard color analysis and format its diagnostic output.
 * @param {string} dataUrl
 * @param {any} extent
 * @returns {Promise<any>}
 */
async function _runAlgorithmDiagnostic(dataUrl: any, extent: any) {
    const t0 = performance.now();
    try {
        const features: any = await analyzeByColor(dataUrl, extent);
        return {
            durationMs: Math.round(performance.now() - t0),
            count: features.length,
            features: features.map(_simplifyFeature),
            byFamily: _countBy(features, 'family'),
            confidence: _stats(features.map((f: any) => f.confidence)),
        };
    } catch (err: any) {
        return { error: (err as any).message };
    }
}
/**
 * Run AI analysis and compare against algorithm results.
 * @param {string} dataUrl
 * @param {any} extent
 * @param {any} algorithmResults
 * @returns {Promise<any>}
 */
async function _runAIDiagnostic(dataUrl: any, extent: any, algorithmResults: any) {
    if (!hasApiKey()) return { error: 'No API key' };
    const t1 = performance.now();
    try {
        const aiF = await analyzeWithAI(dataUrl, extent);
        const aiResults: any = {
            durationMs: Math.round(performance.now() - t1),
            count: aiF.length,
            features: aiF.map(_simplifyFeature),
            byFamily: _countBy(aiF, 'family'),
            confidence: _stats(aiF.map((f: any) => f.confidence)),
        };
        if (algorithmResults?.features) {
            aiResults.comparison = _compare(algorithmResults.features, aiResults.features, extent);
        }
        return aiResults;
    } catch (err: any) {
        return { error: (err as any).message };
    }
}
// ----------------------------------------------------------------
// PIXEL ANALYSIS (canvas-based, runs in browser)
// ----------------------------------------------------------------
function _pixelAnalysis(dataUrl: any, targetSize: any) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            try {
                const S = targetSize;
                const canvas = document.createElement('canvas');
                canvas.width = S;
                canvas.height = S;
                const ctx = (canvas.getContext('2d')) as any;
                ctx.drawImage(img, 0, 0, S, S);
                const data = ctx.getImageData(0, 0, S, S).data;
                const total = S * S;
                const state = _createPixelClassificationState();
                const gray = toGrayscale(data, total);
                const edgeMap = computeEdgeMap(gray, S, S);
                const grid = new Uint8Array(total);
                const darkIdx = CAT_KEYS.indexOf('building_dark') + 1;
                const brightIdx = CAT_KEYS.indexOf('building_bright') + 1;
                for (let i = 0; i < total; i++) {
                    _classifyPixel(i, data, state, grid, darkIdx);
                }
                _mergeBuildingIndices(grid, total, brightIdx, darkIdx);
                const closed = _morphClose(grid, S, S);
                const postCount = _countPostMorph(closed, total);
                const blobs = _findBlobs(closed, S, S);
                resolve({
                    originalSize: { w: img.width, h: img.height },
                    analysisSize: { w: S, h: S },
                    classification: {
                        totalPixels: total,
                        preMorph: { counts: state.catCount, pct: _toPct(state.catCount, total) },
                        postMorph: { counts: postCount, pct: _toPct(postCount, total) },
                        hslHistogram: _buildHslHistograms(state.hHist, state.sHist, state.lHist, total),
                        samples: state.samples,
                    },
                    blobs: _buildBlobReport(blobs, total, edgeMap, closed, S),
                });
            } catch (e: any) {
                reject(e);
            }
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = dataUrl;
    });
}
/**
 * Initialize counters, histograms and sample buckets for pixel classification.
 * @returns {any}
 */
function _createPixelClassificationState() {
    const catCount: any = {};
    for (const k of CAT_KEYS) (catCount as any)[k] = 0;
    catCount.unclassified = 0;
    catCount.shadow = 0;
    catCount.exg_vegetation = 0;
    const samples: any = {};
    for (const k of CAT_KEYS) (samples as any)[k] = [];
    return {
        catCount,
        hHist: new Array(36).fill(0),
        sHist: new Array(20).fill(0),
        lHist: new Array(20).fill(0),
        samples,
    };
}
/**
 * Classify a single pixel and update histograms / grid / samples.
 * @param {number} i
 * @param {Uint8ClampedArray} data
 * @param {any} state
 * @param {Uint8Array} grid
 * @param {number} darkIdx
 */
function _classifyPixel(i: number, data: any, state: any, grid: Uint8Array, darkIdx: number) {
    const o = i * 4;
    const r = data[o],
        g = data[o + 1],
        b = data[o + 2];
    const hsl = rgbToHsl(r, g, b);
    state.hHist[Math.min(35, Math.floor(hsl.h / 10))]++;
    state.sHist[Math.min(19, Math.floor(hsl.s / 5))]++;
    state.lHist[Math.min(19, Math.floor(hsl.l / 5))]++;
    if (isShadow(r, g, b)) {
        state.catCount.shadow++;
        return;
    }
    const exg = excessGreen(r, g, b);
    if (exg > 0.08) {
        state.catCount.exg_vegetation++;
        state.catCount.vegetation++;
        grid[i] = CAT_KEYS.indexOf('vegetation') + 1;
        return;
    }
    const matched = _matchHslCategory(hsl.h, hsl.s, hsl.l, r, g, b, state.samples, grid, i);
    if (!matched) state.catCount.unclassified++;
}
/**
 * Try to match an HSL category (other than vegetation) and record a sample.
 * @returns {boolean}
 */
function _matchHslCategory(h: number, s: number, l: number, r: number, g: number, b: number, samples: any, grid: Uint8Array, i: number) {
    for (let k = 0; k < CAT_KEYS.length; k++) {
        const key = CAT_KEYS[k];
        if (key === undefined) continue;
        if ((key as any) === 'vegetation') continue;
        if ((CATEGORIES as any)[(key as any)].match(h, s, l)) {
            (samples as any)[key]++;
            grid[i] = k + 1;
            if ((samples as any)[key].length < 3) {
                (samples as any)[key].push({
                    rgb: [r, g, b],
                    hsl: { h: Math.round(h), s: Math.round(s), l: Math.round(l) },
                });
            }
            return true;
        }
    }
    return false;
}
/**
 * Merge bright-building index into dark-building index across the grid.
 * @param {Uint8Array} grid
 * @param {number} total
 * @param {number} brightIdx
 * @param {number} darkIdx
 */
function _mergeBuildingIndices(grid: Uint8Array, total: number, brightIdx: number, darkIdx: number) {
    for (let i = 0; i < total; i++) {
        if (grid[i] === brightIdx) grid[i] = darkIdx;
    }
}
/**
 * Count pixels per category after morphological close.
 * @param {Uint8Array} closed
 * @param {number} total
 * @returns {any}
 */
function _countPostMorph(closed: Uint8Array, total: number) {
    const postCount: any = {};
    for (const k of CAT_KEYS) (postCount as any)[k] = 0;
    postCount.unclassified = 0;
    for (let i = 0; i < total; i++) {
        const c = closed[i];
        if (c === 0) postCount.unclassified++;
        else (postCount as any)[(CAT_KEYS as any)[(c as any) - 1]]++;
    }
    return postCount;
}
/**
 * Build human-readable HSL histogram buckets.
 * @returns {any}
 */
function _buildHslHistograms(hHist: any, sHist: any, lHist: any, total: number) {
    return {
        hue: hHist
            .map((v: any, i: any) => ({ deg: `${i * 10}-${i * 10 + 9}`, pct: _p(v, total) }))
            .filter((h: any) => h.pct > 0.5),
        saturation: sHist
            .map((v: any, i: any) => ({ range: `${i * 5}-${i * 5 + 4}%`, pct: _p(v, total) }))
            .filter((h: any) => h.pct > 1),
        lightness: lHist
            .map((v: any, i: any) => ({ range: `${i * 5}-${i * 5 + 4}%`, pct: _p(v, total) }))
            .filter((h: any) => h.pct > 1),
    };
}
/**
 * Build the blob report with details and filtering flags.
 * @returns {any}
 */
function _buildBlobReport(blobs: any[], total: number, edgeMap: any, closed: Uint8Array, S: number) {
    const significant = blobs.filter((b: any) => b.pixels / total >= 0.005);
    return {
        total: blobs.length,
        aboveThreshold: blobs.filter((b: any) => b.pixels / total >= 0.01).length,
        belowThreshold: blobs.filter((b: any) => b.pixels / total < 0.01).length,
        details: significant
            .sort((a: any, b: any) => b.pixels - a.pixels)
            .slice(0, 30)
            .map((b: any) => _buildBlobDetail(b, total, edgeMap, closed, S)),
    };
}
/**
 * Build a single blob detail record.
 * @returns {any}
 */
function _buildBlobDetail(b: any, total: number, edgeMap: any, closed: Uint8Array, S: number) {
    const bboxW = b.maxX - b.minX + 1;
    const bboxH = b.maxY - b.minY + 1;
    const fill = b.pixels / (bboxW * bboxH);
    const aspect = bboxH > 0 ? bboxW / bboxH : 1;
    const cat: any = (CAT_KEYS as any)[b.category - 1];
    const edgeDens = _computeBlobEdgeDensity(cat, edgeMap, closed, b, S);
    return {
        cat,
        family: (CATEGORIES as any)[cat]?.family,
        pixels: b.pixels,
        areaPct: _p(b.pixels, total),
        bbox: { x: b.minX, y: b.minY, w: bboxW, h: bboxH },
        fill: Math.round(fill * 100) / 100,
        aspect: Math.round(aspect * 100) / 100,
        edgeDensity: edgeDens,
        filtered: _wouldFilter(cat, fill, aspect, b.pixels / total, edgeDens),
    };
}
/**
 * Compute edge density for building blobs.
 * @returns {number|null}
 */
function _computeBlobEdgeDensity(cat: any, edgeMap: any, closed: Uint8Array, b: any, S: number) {
    if (cat === 'building_dark' || cat === 'building_bright') {
        return Math.round(blobEdgeDensity(edgeMap, closed, b, S) * 1000) / 1000;
    }
    return null;
}
// ----------------------------------------------------------------
// MORPH CLOSE + BLOB FINDER
// ----------------------------------------------------------------
function _morphClose(grid: any, w: any, h: any) {
    const dil = _dilateGrid(grid, w, h);
    return _erodeGrid(dil, w, h);
}
/**
 * Dilate a category grid using a 4-neighbor majority rule.
 * @param {Uint8Array} grid
 * @param {number} w
 * @param {number} h
 * @returns {Uint8Array}
 */
function _dilateGrid(grid: Uint8Array, w: number, h: number) {
    const n = w * h;
    const dil = new Uint8Array(n);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (grid[i]) {
                dil[i] = grid[i];
                continue;
            }
            const nb = [
                y > 0 ? (grid[i - w] ?? 0) : 0,
                y < h - 1 ? (grid[i + w] ?? 0) : 0,
                x > 0 ? (grid[i - 1] ?? 0) : 0,
                x < w - 1 ? (grid[i + 1] ?? 0) : 0,
            ];
            dil[i] = _majorityNeighbor(nb);
        }
    return dil;
}
/**
 * Return the majority non-zero neighbor category (needs ≥2 votes).
 * @param {number[]} neighbors
 * @returns {number}
 */
function _majorityNeighbor(nb: number[]) {
    const ct: any = {};
    let best = 0,
        bc = 0;
    for (const v of nb) {
        if (!v) continue;
        ct[v] = (ct[v] || 0) + 1;
        if (ct[v] > best) {
            best = ct[v];
            bc = v;
        }
    }
    return best >= 2 ? bc : 0;
}
/**
 * Erode a category grid using 4-neighbor identity checks.
 * @param {Uint8Array} grid
 * @param {number} w
 * @param {number} h
 * @returns {Uint8Array}
 */
function _erodeGrid(grid: Uint8Array, w: number, h: number) {
    const n = w * h;
    const ero = new Uint8Array(n);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const c = grid[i];
            if (!c) continue;
            const ok = _hasSameNeighbors(grid, i, w, h, c);
            ero[i] = ok ? c : 0;
        }
    return ero;
}
/**
 * Check whether all 4 neighbors share the same category.
 * @returns {boolean}
 */
function _hasSameNeighbors(grid: Uint8Array, i: number, w: number, h: number, c: number) {
    return (
        (i < w || grid[i - w] === c) &&
        (i >= w * (h - 1) || grid[i + w] === c) &&
        (i % w === 0 || grid[i - 1] === c) &&
        (i % w === w - 1 || grid[i + 1] === c)
    );
}
function _findBlobs(grid: any, w: any, h: any) {
    const vis = new Uint8Array(w * h);
    const blobs: any[] = [];
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (vis[i] || !grid[i]) continue;
            blobs.push(_floodFillBlob(grid, w, h, vis, i, grid[i]));
        }
    return blobs;
}
/**
 * Flood-fill a connected blob of the same category starting from a seed pixel.
 * @returns {any}
 */
function _floodFillBlob(grid: Uint8Array, w: number, h: number, vis: Uint8Array, seed: number, cat: number) {
    const b = {
        category: cat,
        pixels: 0,
        minX: seed % w,
        maxX: seed % w,
        minY: Math.floor(seed / w),
        maxY: Math.floor(seed / w),
        sumX: 0,
        sumY: 0,
        sumXX: 0,
        sumYY: 0,
        sumXY: 0,
    };
    const q = [seed];
    vis[seed] = 1;
    while (q.length) {
        const ci: any = q.pop();
        const cx = ci % w;
        const cy = (ci - cx) / w;
        b.pixels++;
        b.sumX += cx;
        b.sumY += cy;
        b.sumXX += cx * cx;
        b.sumYY += cy * cy;
        b.sumXY += cx * cy;
        if (cx < b.minX) b.minX = cx;
        if (cx > b.maxX) b.maxX = cx;
        if (cy < b.minY) b.minY = cy;
        if (cy > b.maxY) b.maxY = cy;
        _enqueueBlobNeighbors(grid, w, h, vis, q, ci, cx, cy, cat);
    }
    return b;
}
/**
 * Add matching 4-neighbors to the flood-fill queue.
 */
function _enqueueBlobNeighbors(
    grid: Uint8Array,
    w: number,
    h: number,
    vis: Uint8Array,
    q: number[],
    ci: number,
    cx: number,
    cy: number,
    cat: number,
) {
    for (const ni of [
        cy > 0 ? ci - w : -1,
        cy < h - 1 ? ci + w : -1,
        cx > 0 ? ci - 1 : -1,
        cx < w - 1 ? ci + 1 : -1,
    ]) {
        if (ni >= 0 && !vis[ni] && grid[ni] === cat) {
            vis[ni] = 1;
            q.push(ni);
        }
    }
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
function _p(v: any, t: any) {
    return Math.round((v / t) * 10000) / 100;
}
function _toPct(obj: any, t: any) {
    const r: any = {};
    for (const [k, v] of Object.entries(obj)) r[k] = _p(v, t);
    return r;
}
function _countBy(arr: any, key: any) {
    const r: any = {};
    for (const item of arr) r[item[key]] = (r[item[key]] || 0) + 1;
    return r;
}
function _stats(vals: any) {
    if (!vals.length) return { min: 0, max: 0, avg: 0 };
    vals.sort((a: any, b: any) => a - b);
    return {
        min: vals[0],
        max: vals[vals.length - 1],
        avg: Math.round((vals.reduce((s: any, v: any) => s + v, 0) / vals.length) * 100) / 100,
        median: vals[Math.floor(vals.length / 2)],
    };
}
function _simplifyFeature(f: any) {
    return {
        family: f.family,
        label: f.label,
        confidence: f.confidence,
        position: f.position,
        dimensions: f.dimensions,
        rotation: f.rotation ? Math.round((f.rotation * 180) / Math.PI) + '°' : null,
        source: f.sourceMethod,
    };
}
function _wouldFilter(
    /** @type {any} */ cat: any,
    fill: any,
    aspect: any,
    areaRatio: any,
    edgeDensity: any,
) {
    const family = (CATEGORIES as any)[cat]?.family;
    const MIN_AREA: any = { building: 0.002, lake: 0.004, habitat: 0.004, marker: 0.003 };
    const minTh = MIN_AREA[family] || 0.005;
    if (areaRatio < minTh) return `noise (<${(minTh * 100).toFixed(1)}%)`;
    return _wouldFilterBuilding(cat, fill, aspect, edgeDensity);
}
/**
 * Building-specific filtering rules.
 * @returns {string|null}
 */
function _wouldFilterBuilding(cat: any, fill: any, aspect: any, edgeDensity: any) {
    if (cat !== 'building_dark' && cat !== 'building_bright') return null;
    if (edgeDensity !== null && edgeDensity < 0.03) return 'shadow (low edge density)';
    if (aspect > 6 || aspect < 0.17) return 'road→marker';
    if (fill < 0.3 && (aspect > 4 || aspect < 0.25)) return 'road→marker';
    return null;
}
function _compare(algoF: any, aiF: any, extent: any) {
    const thresh = Math.max(extent.maxX - extent.minX, extent.maxZ - extent.minZ) * 0.15;
    const matches: any[] = [];
    const algoLeft = [...algoF];
    for (const ai of aiF) {
        const best = _findBestAlgoMatch(ai, algoLeft, thresh);
        if (best && best.index >= 0) {
            matches.push({ family: ai.family, aiLabel: ai.label, dist: Math.round(best.dist * 10) / 10 });
            algoLeft.splice(best.index, 1);
        }
    }
    return {
        matched: matches.length,
        aiOnly: aiF.length - matches.length,
        algoOnly: algoLeft.length,
        matchRate: Math.round((matches.length / Math.max(aiF.length, 1)) * 100) + '%',
        matches,
    };
}
/**
 * Find the closest matching algorithm feature for an AI feature.
 * @returns {{index:number,dist:number}|null}
 */
function _findBestAlgoMatch(ai: any, algoLeft: any[], thresh: number) {
    let bi = -1,
        bd = Infinity;
    for (let i = 0; i < algoLeft.length; i++) {
        if (algoLeft[i].family !== ai.family) continue;
        const dx = algoLeft[i].position.x - ai.position.x;
        const dz = algoLeft[i].position.z - ai.position.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < thresh && d < bd) {
            bd = d;
            bi = i;
        }
    }
    return bi >= 0 ? { index: bi, dist: bd } : null;
}
function _suggest(r: any) {
    const s: any[] = [];
    const pc = r.pixelClassification;
    const algo = r.algorithmResults;
    if (!pc || !algo) return s;
    _pushUnclassifiedSuggestion(s, pc);
    _pushShadowSuggestions(s, pc);
    _pushBlobSuggestions(s, r.blobAnalysis);
    _pushAlgorithmSuggestions(s, algo, r.comparison);
    return s;
}
/**
 * Add suggestion when too many pixels are unclassified.
 */
function _pushUnclassifiedSuggestion(s: any[], pc: any) {
    const unPct = pc.preMorph?.pct?.unclassified || 0;
    if (unPct > 60) s.push({ severity: 'high', msg: `${unPct}% unclassified — HSL thresholds too narrow` });
}
/**
 * Add shadow-related suggestions.
 */
function _pushShadowSuggestions(s: any[], pc: any) {
    const shadowPct = pc.preMorph?.pct?.shadow || 0;
    if (shadowPct > 30)
        s.push({
            severity: 'medium',
            msg: `${shadowPct}% shadow pixels — high shadow content, time-of-day or sun angle issue`,
        });
    if (shadowPct > 0) s.push({ severity: 'info', msg: `${shadowPct}% pixels filtered as shadow (C3+luminance)` });
}
/**
 * Add blob/noise-related suggestions.
 */
function _pushBlobSuggestions(s: any[], blobs: any) {
    if (!blobs) return;
    if (blobs.belowThreshold > 50 && blobs.aboveThreshold < 5)
        s.push({
            severity: 'medium',
            msg: `${blobs.belowThreshold} tiny blobs, only ${blobs.aboveThreshold} significant — image noisy`,
        });
    const edgeFiltered = (blobs.details || []).filter((b: any) => b.filtered?.includes('edge density')).length;
    if (edgeFiltered > 0)
        s.push({ severity: 'info', msg: `${edgeFiltered} building blobs discarded by edge density filter (shadows)` });
    const roads = (blobs.details || []).filter((b: any) => b.filtered?.includes('road')).length;
    if (roads > 5) s.push({ severity: 'low', msg: `${roads} blobs filtered as roads — detection may be aggressive` });
}
/**
 * Add algorithm result and AI-vs-algo comparison suggestions.
 */
function _pushAlgorithmSuggestions(s: any[], algo: any, comparison: any) {
    if (algo.count < 3)
        s.push({ severity: 'high', msg: `Only ${algo.count} features — lower noise threshold or check image` });
    const avg = algo.confidence?.avg || 0;
    if (avg < 0.45 && algo.count > 0) s.push({ severity: 'medium', msg: `Low avg confidence ${avg}` });
    if (comparison?.matchRate && parseInt(comparison.matchRate) < 40)
        s.push({ severity: 'high', msg: `AI vs Algo match rate ${comparison.matchRate} — significant divergence` });
}
