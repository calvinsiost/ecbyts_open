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
   INSTANCE SEGMENTATION — Per-object masks via hybrid pipeline
   ================================================================

   Instance segmentation produz mascaras individuais por objeto,
   diferente da segmentacao semantica (por-pixel, sem separacao
   de instancias adjacentes).

   Duas estrategias disponíveis:

   CAMADA 1 — Hibrido YOLOS+SAM (DEFAULT, zero download extra):
     1. YOLOS-tiny detecta bounding boxes (~300ms)
     2. Para cada bbox, SAM segmenta no centro (~200ms/objeto)
     3. Anti-Ameba post-processing por familia
     Vantagem: precisao de mask 85-95%, reutiliza modelos ja cacheados.

   CAMADA 2 — MaskFormer nativo (on-demand, ~100MB download):
     Pipeline unica de instance segmentation via Transformers.js v3.
     Modelo: facebook/maskformer-swin-tiny-coco-instance
     Vantagem: mais rapido em cenas densas (>10 objetos, single-pass).

   Ambas produzem DetectedFeature[] com instanceId unico por objeto.

   Provenance:
   - YOLOS: Fang et al. 2021 "You Only Look at One Sequence"
   - SAM: Kirillov et al. 2023 "Segment Anything" (arXiv:2304.02643)
   - MaskFormer: Cheng et al. 2021 "Per-Pixel Classification Is Not All
     You Need for Semantic Segmentation" (NeurIPS 2021)

   ================================================================ */

import { importCDN } from '../../utils/helpers/cdnLoader.js';
import { analyzeWithYOLOS } from './objectDetector.js';
import { loadSAM, setImage, segmentAtPoint, getSAMStatus } from './samInteractive.js';

const TRANSFORMERS_V3_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
const MASKFORMER_MODEL = 'facebook/maskformer-swin-tiny-coco-instance';

// COCO label → ecbyts family (subset relevante para sites ambientais)
const COCO_LABEL_TO_FAMILY = {
    car: 'marker',
    truck: 'marker',
    bus: 'marker',
    motorcycle: 'marker',
    bicycle: 'marker',
    boat: 'marker',
    airplane: 'marker',
    train: 'marker',
    'fire hydrant': 'marker',
    'stop sign': 'marker',
    'traffic light': 'marker',
    bench: 'marker',
    bird: 'marker',
    horse: 'marker',
    cow: 'marker',
    sheep: 'marker',
    suitcase: 'tank',
    backpack: 'marker',
    'potted plant': 'habitat',
    umbrella: 'marker',
    building: 'building',
    house: 'building',
    tree: 'habitat',
    grass: 'habitat',
    water: 'lake',
    river: 'river',
    sea: 'lake',
    road: 'marker',
    sidewalk: 'marker',
    fence: 'boundary',
    wall: 'building',
};

// MaskFormer singleton
/** @type {any} */
let _maskformerPipeline: any = null;
let _maskformerLoading = false;

// ----------------------------------------------------------------
// CAMADA 1 - Hibrido YOLOS+SAM (default)
// ----------------------------------------------------------------

/**
 * Instance segmentation via YOLOS detection + SAM per-box segmentation.
 * Zero download extra - reutiliza modelos ja cacheados pelo usuario.
 *
 * @param {string} imageDataUrl - Base64 data URL
 * @param {Object} extent - { minX, maxX, minZ, maxZ }
 * @param {((...args: unknown[]) => unknown)} [onProgress] - Callback: { message, progress }
 * @param {Object} [options={}]
 * @param {number} [options.threshold=0.3] - YOLOS confidence threshold
 * @param {number} [options.maxDetections=30] - Max objects to segment
 * @returns {Promise<Array<any>>} - DetectedFeature[] with instanceId
 */
export async function detectInstances(imageDataUrl: any, /** @type {any} */ extent: any, onProgress: any, options: any = {}) {
    const { threshold = 0.3, maxDetections = 30 } = options;

    // Step 1: YOLOS object detection
    _notify(onProgress, 'Detecting objects (YOLOS)...', 5);
    const detections = await analyzeWithYOLOS(imageDataUrl, extent, onProgress, {
        threshold,
        maxDetections,
    });

    if (!detections || detections.length === 0) {
        _notify(onProgress, 'No objects detected', 100);
        return [];
    }

    // Step 2: Load SAM + encode image (cached if already loaded)
    _notify(onProgress, 'Loading SAM for mask extraction...', 30);
    await loadSAM(onProgress);

    const samStatus: any = getSAMStatus();
    if (samStatus.currentImageUrl !== imageDataUrl) {
        _notify(onProgress, 'Encoding image for SAM...', 40);
        await setImage(imageDataUrl, onProgress);
    }

    // Step 3: SAM per-detection - segment at bbox center
    const instances = [];
    const total = detections.length;

    for (let i = 0; i < total; i++) {
        const det = detections[i]!;
        const pct = 50 + Math.round((i / total) * 45);
        _notify(onProgress, `Segmenting instance ${i + 1}/${total}...`, pct);

        // Convert model coords back to pixel coords for SAM
        const extW = extent.maxX - extent.minX;
        const extH = extent.maxZ - extent.minZ;
        const px = ((det.position.x - extent.minX) / extW) * 512;
        const py = ((extent.maxZ - det.position.z) / extH) * 512; // Y inverted

        try {
            const result: any = (await segmentAtPoint(px, py, extent, {
                family: det.family,
                maskThreshold: 0.0,
            }));

            if (result && result.contour && result.contour.length >= 3) {
                instances.push({
                    ...det,
                    contour: result.processed?.contour || result.contour,
                    mask: result.mask,
                    maskWidth: result.maskWidth,
                    maskHeight: result.maskHeight,
                    instanceId: _uuid(),
                    sourceMethod: 'instance-hybrid',
                    confidence_source: 'instance-hybrid',
                });
            }
        } catch (err) {
            console.warn(
                `[ecbyts] Instance segmentation failed for detection ${i}:`,
                (err as any)?.message,
            );
        }
    }

    _notify(onProgress, `${instances.length} instances segmented`, 100);
    return instances;
}

// ----------------------------------------------------------------
// CAMADA 2 - MaskFormer nativo (on-demand download)
// ----------------------------------------------------------------

/**
 * Instance segmentation via MaskFormer pipeline (Transformers.js v3).
 * Requer download unico de ~100MB. Mais rapido em cenas densas.
 *
 * @param {string} imageDataUrl - Base64 data URL
 * @param {Object} extent - { minX, maxX, minZ, maxZ }
 * @param {Function} [onProgress] - Callback: { message, progress }
 * @param {Object} [options={}]
 * @param {number} [options.threshold=0.5] - Score threshold
 * @param {number} [options.maskThreshold=0.5] - Binary mask threshold
 * @param {number} [options.minConfidence=0.3] - Min confidence to include
 * @returns {Promise<Array<any>>} - DetectedFeature[] with instanceId
 */
export async function detectInstancesNative(imageDataUrl: any, /** @type {any} */ extent: any, onProgress: any, options: any = {}) {
    const { threshold = 0.5, maskThreshold = 0.5, minConfidence = 0.3 } = options;

    // Step 1: Load Transformers.js v3
    _notify(onProgress, 'Loading ML engine...', 5);
    const tf = /** @type {any} */ (await importCDN(TRANSFORMERS_V3_CDN, { name: 'Transformers.js v3' }));
    if (tf.env) tf.env.allowLocalModels = false;

    // Step 2: Load MaskFormer pipeline (~100MB, cached after first download)
    if (!_maskformerPipeline) {
        if (_maskformerLoading) throw new Error('MaskFormer is already loading. Please wait.');
        _maskformerLoading = true;

        _notify(onProgress, 'Downloading MaskFormer (~100 MB)...', 10);
        try {
            _maskformerPipeline = await tf.pipeline('image-segmentation', MASKFORMER_MODEL, {
                quantized: true,
                progress_callback: (/** @type {any} */ data: any) => {
                    if (data.status === 'progress' && typeof data.progress === 'number') {
                        _notify(
                            onProgress,
                            `Downloading model... ${Math.round(data.progress)}%`,
                            Math.round(data.progress * 0.4) + 10,
                        );
                    }
                },
            });
        } finally {
            _maskformerLoading = false;
        }
    }

    // Step 3: Run inference
    _notify(onProgress, 'Running instance segmentation...', 55);
    const image = await tf.RawImage.read(imageDataUrl);
    const results = await _maskformerPipeline(image, {
        threshold,
        mask_threshold: maskThreshold,
    });

    // Step 4: Convert results to DetectedFeature[]
    _notify(onProgress, 'Post-processing masks...', 80);
    const instances = [];
    const extW = extent.maxX - extent.minX;
    const extH = extent.maxZ - extent.minZ;

    for (const seg of results) {
        if (seg.score < minConfidence) continue;

        const family = (COCO_LABEL_TO_FAMILY as any)[seg.label] || null;
        if (!family) continue;

        // Compute centroid from mask
        const maskData = seg.mask.data;
        const maskW = seg.mask.width;
        const maskH = seg.mask.height;
        let sumX = 0,
            sumY = 0,
            count = 0;
        for (let row = 0; row < maskH; row++) {
            for (let col = 0; col < maskW; col++) {
                if (maskData[row * maskW + col] > 0) {
                    sumX += col;
                    sumY += row;
                    count++;
                }
            }
        }

        if (count === 0) continue;

        const cx = sumX / count;
        const cy = sumY / count;

        // Convert pixel centroid to model coords
        const worldX = extent.minX + (cx / maskW) * extW;
        const worldZ = extent.maxZ - (cy / maskH) * extH;

        instances.push({
            family,
            label: seg.label,
            confidence: seg.score,
            position: { x: worldX, z: worldZ },
            dimensions: _defaultDimensions(family),
            rotation: 0,
            instanceId: _uuid(),
            sourceMethod: 'maskformer',
            confidence_source: 'maskformer',
        });
    }

    _notify(onProgress, `${instances.length} instances detected`, 100);
    return instances;
}

/**
 * Check if MaskFormer model is loaded.
 * @returns {boolean}
 */
export function isMaskFormerLoaded() {
    return _maskformerPipeline !== null;
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function _notify(/** @type {any} */ cb: any, /** @type {string} */ message: any, /** @type {number} */ progress: any) {
    if (typeof cb === 'function') cb({ message, progress });
}

function _uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'inst-' + Math.random().toString(36).slice(2, 11) + '-' + Date.now().toString(36);
}

function _defaultDimensions(/** @type {string} */ family: any) {
    switch (family) {
        case 'building':
            return { footprint: { width: 10, length: 12 }, height: 4, type: 'commercial' };
        case 'tank':
            return { diameter: 4, height: 3, type: 'aboveground' };
        case 'lake':
            return { radiusX: 20, radiusY: 15, depth: 2 };
        case 'river':
            return { width: 5 };
        case 'habitat':
            return { habitatType: 'forest', area: 100 };
        case 'marker':
            return { markerType: 'other' };
        case 'boundary':
            return {};
        default:
            return {};
    }
}
