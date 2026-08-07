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
   SAM AUTO-MASK — Automatic Mask Generation via Grid-Point Prompting
   ================================================================

   Geracao automatica de mascaras usando SAM sem cliques do usuario.
   Inspirado pelo segment-geospatial (samgeo) de Qiusheng Wu (MIT).

   Estrategia: gera grade NxN de pontos uniformes sobre a imagem,
   roda SAM em cada ponto, filtra/deduplicata por NMS (IoU).

   Proveniencia academica:
   - Kirillov et al. 2023 "Segment Anything" (arXiv:2304.02643)
   - Grid-point strategy from segment-geospatial (Wu 2023)

   Reutiliza o singleton SlimSAM de samInteractive.js via
   getModelState() — sem download adicional (~50 MB ja cacheado).

   ================================================================ */

import { loadSAM, setImage, getModelState } from './samInteractive.js';
import { antiAmebaSingle } from './postprocess/index.js';
import { excessGreen } from './indices.js';
import { yieldToMain } from '../../utils/performance/yielding.js';

/**
 * @typedef {any} AutoMaskResult
 * @typedef {any} DetectedFeature
 */

// ----------------------------------------------------------------
// DEFAULTS
// ----------------------------------------------------------------

const DEFAULT_POINTS_PER_SIDE = 16;
const DEFAULT_IOU_THRESHOLD = 0.7;
const DEFAULT_MIN_MASK_AREA = 100;
const DEFAULT_MAX_MASKS = 100;
const DEFAULT_MASK_THRESHOLD = 0.0;
const YIELD_EVERY_N_POINTS = 4;

// ----------------------------------------------------------------
// PUBLIC API - Generate All Masks
// ----------------------------------------------------------------

/**
 * Generate all masks in an image automatically via grid-point prompting.
 * Gera grade NxN de pontos, roda SAM em cada um, aplica NMS.
 * Auto-carrega SAM se nao estiver carregado.
 *
 * @param {string} imageDataUrl - Base64 data URL
 * @param {Object} extent - { minX, maxX, minZ, maxZ }
 * @param {Object} [options={}]
 * @param {number} [options.pointsPerSide=16] - Grid density per axis (8-64)
 * @param {number} [options.iouThreshold=0.7] - NMS IoU threshold
 * @param {number} [options.minMaskArea=100] - Min foreground pixels
 * @param {number} [options.maxMasks=100] - Max masks returned
 * @param {number} [options.maskThreshold=0.0] - Logit→binary threshold
 * @param {AbortSignal} [options.signal] - Cancellation
 * @param {((...args: unknown[]) => unknown)} [options.onProgress] - { message, progress }
 * @returns {Promise<Array<AutoMaskResult>>}
 */
export async function generateAutoMasks(imageDataUrl: any, extent: any, options: Record<string, any> = {}) {
    if (!imageDataUrl) throw new Error('Image data URL is required');

    const {
        pointsPerSide = DEFAULT_POINTS_PER_SIDE,
        iouThreshold = DEFAULT_IOU_THRESHOLD,
        minMaskArea = DEFAULT_MIN_MASK_AREA,
        maxMasks = DEFAULT_MAX_MASKS,
        maskThreshold = DEFAULT_MASK_THRESHOLD,
        signal,
        onProgress,
    } = options;

    // Auto-load SAM if needed
    let state = getModelState();
    if (!state) {
        _notify(onProgress, 'Loading SAM model (~50 MB)...', 0);
        await loadSAM(onProgress);
        state = getModelState();
    }
    if (!state) throw new Error('Failed to load SAM model');

    // Encode image if not cached
    _notify(onProgress, 'Encoding image...', 5);
    await setImage(imageDataUrl, onProgress);
    state = getModelState(); // refresh after setImage

    const { model, processor, imageEmbeddings, rawImage, imageWidth, imageHeight } = state as any;

    // Generate grid points
    const gridPoints = _generateGridPoints(imageWidth, imageHeight, pointsPerSide);
    const totalPoints = gridPoints.length;
    const candidates = [];
    const acceptedBboxes = []; // para skip de pontos ja cobertos

    _notify(onProgress, `Auto-segmenting... 0/${totalPoints}`, 10);

    // Process each grid point
    for (let i = 0; i < totalPoints; i++) {
        // Check abort
        if (signal?.aborted) break;

        const [px, py] = gridPoints[i] as [number, number];

        // Skip if inside an accepted mask bbox
        if (_pointInsideAnyBbox(px, py, acceptedBboxes)) continue;

        let inputs, outputs, masks;
        try {
            // Run SAM inference at this point
            inputs = await processor(rawImage, {
                input_points: [[[px, py]]],
            });

            outputs = await model({
                ...inputs,
                ...imageEmbeddings,
            });

            masks = await processor.post_process_masks(
                outputs.pred_masks,
                inputs.original_sizes,
                inputs.reshaped_input_sizes,
            );

            const maskData = masks[0];
            if (!maskData || maskData.length === 0) continue;

            // Select best mask by IoU score
            let bestMaskIdx = 0;
            let bestIou = 0;
            if (outputs.iou_scores) {
                const iouData = outputs.iou_scores.data;
                for (let j = 0; j < iouData.length; j++) {
                    if (iouData[j] > bestIou) {
                        bestIou = iouData[j];
                        bestMaskIdx = j;
                    }
                }
            }

            // Convert tensor to binary Uint8Array
            const maskTensor = maskData[bestMaskIdx];
            const binaryMask = new Uint8Array(imageWidth * imageHeight);
            const rawData = maskTensor.data;
            for (let k = 0; k < rawData.length && k < binaryMask.length; k++) {
                binaryMask[k] = rawData[k] > maskThreshold ? 255 : 0;
            }

            // Compute bbox and area
            const { bbox, area } = _computeMaskStats(binaryMask, imageWidth, imageHeight);

            // Filter by minimum area
            if (area < minMaskArea) continue;

            candidates.push({
                mask: binaryMask,
                bbox,
                area,
                iouScore: bestIou,
                pointX: px,
                pointY: py,
            });

            acceptedBboxes.push(bbox);
        } finally {
            // Dispose tensors - critical for WASM memory
            _disposeTensors(outputs, masks, inputs);
        }

        // Yield UI thread periodically
        if (i % YIELD_EVERY_N_POINTS === 0) {
            await yieldToMain({ timeoutMs: 0 });
            const progress = 10 + (i / totalPoints) * 80;
            _notify(onProgress, `Auto-segmenting... ${i + 1}/${totalPoints}`, progress);
        }
    }

    _notify(onProgress, 'Filtering overlapping masks...', 92);

    // NMS with bbox pre-filter
    const filtered = _nonMaxSuppression(candidates, iouThreshold);

    // Cap at maxMasks
    const result = filtered.slice(0, maxMasks);

    _notify(onProgress, `${result.length} masks generated`, 100);

    return result;
}

// ----------------------------------------------------------------
// PUBLIC API - Convert Masks to DetectedFeature[]
// ----------------------------------------------------------------

/**
 * Convert auto-mask results to DetectedFeature[] for the standard pipeline.
 * Classifica cada mascara por heuristica de forma/cor e aplica Anti-Ameba.
 *
 * @param {Array<any>} masks - From generateAutoMasks()
 * @param {any} extent - { minX, maxX, minZ, maxZ }
 * @param {string} imageDataUrl - Original image for color sampling
 * @returns {Array<DetectedFeature>}
 */
export function autoMasksToFeatures(masks: any, extent: any, imageDataUrl: any) {
    if (!masks || masks.length === 0) return [];

    // Load image pixels for color sampling
    const imagePixels = _loadImagePixels(imageDataUrl);
    const features = [];

    for (const maskResult of masks) {
        const { mask, bbox, area, iouScore } = maskResult;

        // Sample average color within mask
        const avgColor = imagePixels ? _sampleAverageColor(imagePixels, mask, bbox) : { r: 128, g: 128, b: 128 };

        // Classify by shape + color heuristics
        const family = _classifyMask(bbox, area, avgColor, imagePixels?.width || 512, imagePixels?.height || 512);

        // Anti-Ameba post-processing
        const processed = antiAmebaSingle(mask, family, extent, imagePixels?.width || 512, imagePixels?.height || 512);

        if (!processed) continue;

        // Compute center position in world coords
        const centerPx = bbox.x + bbox.w / 2;
        const centerPy = bbox.y + bbox.h / 2;
        const w = imagePixels?.width || 512;
        const h = imagePixels?.height || 512;
        const nx = centerPx / w;
        const ny = centerPy / h;
        const worldX = extent.minX + nx * (extent.maxX - extent.minX);
        const worldZ = extent.maxZ - ny * (extent.maxZ - extent.minZ);

        features.push({
            family,
            confidence: 0.5, // Heuristic indicator
            position: { x: worldX, z: worldZ },
            dimensions: {
                width: processed.area_m2 > 0 ? Math.sqrt(processed.area_m2) : 5,
                depth: processed.area_m2 > 0 ? Math.sqrt(processed.area_m2) : 5,
                height: processed.height,
            },
            rotation: 0,
            contours: processed.worldContour ? [processed.worldContour] : [],
            sourceMethod: 'samAuto',
            iouScore,
        });
    }

    return features;
}

// ----------------------------------------------------------------
// GRID GENERATION
// ----------------------------------------------------------------

/**
 * Generate uniform NxN grid of points.
 * Margem de 0.5 celula para evitar bordas da imagem.
 * @param {number} width
 * @param {number} height
 * @param {number} pointsPerSide
 */
function _generateGridPoints(width: any, height: any, pointsPerSide: any) {
    const n = Math.max(2, Math.min(64, pointsPerSide));
    const stepX = width / n;
    const stepY = height / n;
    const points = [];

    for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
            const px = Math.round(stepX * (col + 0.5));
            const py = Math.round(stepY * (row + 0.5));
            points.push([Math.min(px, width - 1), Math.min(py, height - 1)]);
        }
    }

    return points;
}

// ----------------------------------------------------------------
// NON-MAXIMUM SUPPRESSION (NMS)
// ----------------------------------------------------------------

/**
 * NMS with bbox pre-filter.
 * Ordena por iouScore desc, aceita mascara se IoU com todas aceitas < threshold.
 * @param {any[]} candidates
 * @param {number} iouThreshold
 */
function _nonMaxSuppression(candidates: any, iouThreshold: any) {
    if (candidates.length === 0) return [];

    // Sort by IoU score descending (keep best masks first)
    const sorted = [...candidates].sort((a: any, /** @type {any} */ b) => b.iouScore - a.iouScore);
    const accepted = [];

    for (const candidate of sorted) {
        let dominated = false;

        for (const kept of accepted) {
            // Bbox pre-filter: skip IoU computation if bboxes don't overlap
            if (!_bboxOverlap(candidate.bbox, kept.bbox)) continue;

            // Pixel-level IoU
            const iou = _computeIoU(candidate.mask, kept.mask);
            if (iou > iouThreshold) {
                dominated = true;
                break;
            }
        }

        if (!dominated) {
            accepted.push(candidate);
        }
    }

    return accepted;
}

/**
 * Check if two bounding boxes overlap.
 * @param {any} a
 * @param {any} b
 */
function _bboxOverlap(a: any, b: any) {
    return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

/**
 * Compute IoU (Intersection over Union) between two binary masks.
 * Usa typed arrays para performance.
 * @param {any} maskA
 * @param {any} maskB
 */
function _computeIoU(maskA: any, maskB: any) {
    let intersection = 0;
    let union = 0;
    const len = Math.min(maskA.length, maskB.length);

    for (let i = 0; i < len; i++) {
        const a = maskA[i] > 0;
        const b = maskB[i] > 0;
        if (a && b) intersection++;
        if (a || b) union++;
    }

    return union === 0 ? 0 : intersection / union;
}

// ----------------------------------------------------------------
// MASK STATISTICS
// ----------------------------------------------------------------

/**
 * Compute bounding box and pixel area from binary mask.
 * @param {any} mask
 * @param {number} width
 * @param {number} height
 */
function _computeMaskStats(mask: any, width: any, height: any) {
    let minX = width,
        minY = height,
        maxX = 0,
        maxY = 0;
    let area = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (mask[y * width + x] > 0) {
                area++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    return {
        bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
        area,
    };
}

/**
 * Check if point falls inside any of the accepted bboxes.
 * @param {number} px
 * @param {number} py
 * @param {any[]} bboxes
 */
function _pointInsideAnyBbox(px: any, py: any, bboxes: any) {
    for (const b of bboxes) {
        if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
            return true;
        }
    }
    return false;
}

// ----------------------------------------------------------------
// HEURISTIC FAMILY CLASSIFICATION
// ----------------------------------------------------------------

/**
 * Classify mask by shape (aspect ratio, fill ratio) + color (ExG, HSL).
 * Reutiliza excessGreen() de indices.js para vegetacao.
 *
 * @param {any} bbox
 * @param {number} area
 * @param {{r:number,g:number,b:number}} avgColor
 * @param {number} avgColor
 * @param {number} imageWidth
 * @returns {string} Family ID: building, tank, lake, river, habitat, marker
 */
function _classifyMask(bbox: any, area: any, avgColor: any, imageWidth: any, imageHeight: any) {
    const { r, g, b } = avgColor;
    const aspect = bbox.w / Math.max(bbox.h, 1);
    const bboxArea = bbox.w * bbox.h;
    const fillRatio = bboxArea > 0 ? area / bboxArea : 0;
    const relativeSize = area / (imageWidth * imageHeight);

    // Vegetation: ExG > 0.08
    const exg = excessGreen(r, g, b);
    if (exg > 0.08) return 'habitat';

    // Water: blue-dominant (HSL H:170-260, S>10%)
    const hsl = _rgbToHsl(r, g, b);
    if (hsl.h >= 170 && hsl.h <= 260 && hsl.s > 10) {
        // Elongated water → river
        if (aspect > 3.5 || aspect < 0.28) return 'river';
        return 'lake';
    }

    // Very elongated → infrastructure (road)
    if (aspect > 4 || aspect < 0.25) return 'infrastructure';

    // Compact + small → tank
    if (fillRatio > 0.65 && relativeSize < 0.05 && aspect > 0.6 && aspect < 1.6) return 'tank';

    // Compact + medium/large → building
    if (fillRatio > 0.5 && aspect > 0.3 && aspect < 3) return 'building';

    // Default
    return 'marker';
}

/**
 * Convert RGB to HSL.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {{ h: number, s: number, l: number }} h: 0-360, s: 0-100, l: 0-100
 */
function _rgbToHsl(r: any, g: any, b: any) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0,
        s = 0;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
    }

    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// ----------------------------------------------------------------
// IMAGE PIXEL SAMPLING
// ----------------------------------------------------------------

/** @type {any} Cache do canvas para evitar recriacao */
let _pixelCache: any = null;
/** @type {any} */
let _pixelCacheUrl: any = null;

/**
 * Load image pixels into an offscreen canvas for color sampling.
 * Cacheado por URL para evitar recriacao em chamadas consecutivas.
 *
 * @param {string} imageDataUrl
 * @returns {{ data: Uint8ClampedArray, width: number, height: number } | null}
 */
function _loadImagePixels(imageDataUrl: any) {
    if (!imageDataUrl) return null;
    if (_pixelCacheUrl === imageDataUrl && _pixelCache) return _pixelCache;

    try {
        const img = new Image();
        img.src = imageDataUrl;
        // Sync load check - image may already be cached
        if (!img.complete || !img.naturalWidth) return null;

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        _pixelCache = { data: imageData.data, width: canvas.width, height: canvas.height };
        _pixelCacheUrl = imageDataUrl;
        return _pixelCache;
    } catch (e: any) {
        console.debug('[samAutoMask] pixelCache:', e?.message || e);
        return null;
    }
}

/**
 * Sample average RGB within mask foreground pixels.
 * @param {any} pixels
 * @param {any} mask
 * @param {any} bbox
 */
function _sampleAverageColor(pixels: any, mask: any, bbox: any) {
    let sumR = 0,
        sumG = 0,
        sumB = 0,
        count = 0;
    const { data, width } = pixels;

    // Sample within bbox to avoid scanning entire image
    const endX = Math.min(bbox.x + bbox.w, width);
    const endY = Math.min(bbox.y + bbox.h, pixels.height);

    for (let y = bbox.y; y < endY; y++) {
        for (let x = bbox.x; x < endX; x++) {
            const maskIdx = y * width + x;
            if (mask[maskIdx] > 0) {
                const pixIdx = maskIdx * 4;
                sumR += data[pixIdx];
                sumG += data[pixIdx + 1];
                sumB += data[pixIdx + 2];
                count++;
            }
        }
    }

    if (count === 0) return { r: 128, g: 128, b: 128 };
    return {
        r: Math.round(sumR / count),
        g: Math.round(sumG / count),
        b: Math.round(sumB / count),
    };
}

// ----------------------------------------------------------------
// TENSOR DISPOSAL
// ----------------------------------------------------------------

/**
 * Dispose Transformers.js tensors to free WASM/WebGL memory.
 * Guard com ?. para backends que nao suportam dispose.
 * @param {any} outputs
 * @param {any} masks
 * @param {any} inputs
 */
function _disposeTensors(outputs: any, masks: any, inputs: any) {
    try {
        outputs?.pred_masks?.dispose?.();
        outputs?.iou_scores?.dispose?.();
        if (masks) {
            for (const maskSet of masks) {
                if (!maskSet) continue;
                for (const m of maskSet) {
                    m?.dispose?.();
                }
            }
        }
        inputs?.pixel_values?.dispose?.();
    } catch (e: any) {
        console.debug('[samAutoMask] dispose:', e?.message || e);
        /* Safe to ignore */
    }
}

// ----------------------------------------------------------------
// INTERNAL HELPER
// ----------------------------------------------------------------

/**
 * @param {any} onProgress
 * @param {string} message
 * @param {number} progress
 */
function _notify(onProgress: any, message: any, progress: any) {
    onProgress?.({ message, progress });
}
