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
   CLIP CLASSIFIER — Zero-Shot Text-Prompted Segmentation
   ================================================================

   Segmentacao por descricao textual usando CLIP + SAM auto-mask.
   Inspirado pelo LangSAM do segment-geospatial (samgeo).

   Pipeline: auto-mask (F1) → recorta regiao → CLIP classifica
   cada mascara contra labels textuais do usuario → filtra matches.

   Proveniencia academica:
   - Radford et al. 2021 "Learning Transferable Visual Models
     From Natural Language Supervision" (OpenAI CLIP)
   - Modelo: Xenova/clip-vit-base-patch32 (~85 MB quantizado)
   - Licenca: Apache-2.0 (modelo original), MIT (Xenova port)

   ================================================================ */

import { importCDN } from '../../utils/helpers/cdnLoader.js';
import { generateAutoMasks, autoMasksToFeatures } from './samAutoMask.js';
import { antiAmebaSingle } from './postprocess/index.js';

// ----------------------------------------------------------------
// CDN & MODEL CONFIGURATION
// ----------------------------------------------------------------

const TRANSFORMERS_V3_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
const CLIP_MODEL_ID = 'Xenova/clip-vit-base-patch32';

// ----------------------------------------------------------------
// MODEL STATE - Singleton
// ----------------------------------------------------------------

/** @type {*} */
let _transformers: any = null;
/** @type {*} */
let _clipPipeline: any = null; // pipeline('zero-shot-image-classification')
/** @type {*} */
let _clipModel: any = null; // Fallback: raw CLIPModel
/** @type {*} */
let _clipProcessor: any = null; // Fallback: raw AutoProcessor
/** @type {*} */
let _clipTokenizer: any = null; // Fallback: raw AutoTokenizer
let _loading = false;
let _usePipeline = true; // Try pipeline API first, fall back to raw model

// ----------------------------------------------------------------
// LABEL → FAMILY MAPPING
// ----------------------------------------------------------------

const LABEL_FAMILY_MAP: Record<string, string> = {
    'storage tank': 'tank',
    tank: 'tank',
    silo: 'tank',
    container: 'tank',
    'monitoring well': 'well',
    well: 'well',
    borehole: 'well',
    building: 'building',
    house: 'building',
    structure: 'building',
    roof: 'building',
    warehouse: 'building',
    factory: 'building',
    water: 'lake',
    lake: 'lake',
    pond: 'lake',
    reservoir: 'lake',
    river: 'river',
    stream: 'river',
    canal: 'river',
    creek: 'river',
    vegetation: 'habitat',
    tree: 'habitat',
    forest: 'habitat',
    grass: 'habitat',
    plant: 'habitat',
    garden: 'habitat',
    road: 'infrastructure',
    parking: 'infrastructure',
    pavement: 'infrastructure',
    path: 'infrastructure',
    highway: 'infrastructure',
    contamination: 'plume',
    plume: 'plume',
    pollution: 'plume',
    waste: 'waste',
    landfill: 'waste',
    dump: 'waste',
    soil: 'marker',
    ground: 'marker',
    sand: 'marker',
    dirt: 'marker',
};

// ----------------------------------------------------------------
// PUBLIC API - Load CLIP
// ----------------------------------------------------------------

/**
 * Load CLIP model for zero-shot image classification.
 * Primeiro load faz download de ~85 MB (cacheado pelo Cache API).
 *
 * @param {Function} [onProgress] - { message, progress }
 * @returns {Promise<void>}
 */
export async function loadCLIP(onProgress: any) {
    if (_clipPipeline || _clipModel) return;
    if (_loading) throw new Error('CLIP is already loading');

    _loading = true;

    try {
        // Load Transformers.js v3
        if (!_transformers) {
            _notify(onProgress, 'Loading ML engine...', 0);
            _transformers = await importCDN(TRANSFORMERS_V3_CDN, { name: 'Transformers.js v3' });
            if (_transformers.env) _transformers.env.allowLocalModels = false;
        }

        // Try pipeline API first
        if (_usePipeline) {
            try {
                _notify(onProgress, 'Loading CLIP model (~85 MB)...', 10);
                _clipPipeline = await _transformers.pipeline('zero-shot-image-classification', CLIP_MODEL_ID, {
                    quantized: true,
                    progress_callback: (/** @type {*} */ data: any) => {
                        if (data.status === 'progress' && typeof data.progress === 'number') {
                            _notify(
                                onProgress,
                                `Downloading CLIP... ${Math.round(data.progress)}%`,
                                10 + data.progress * 0.8,
                            );
                        }
                    },
                });
                _notify(onProgress, 'CLIP ready', 100);
                return;
            } catch (err) {
                console.warn('[CLIP] Pipeline API failed, falling back to raw model:', (err as any).message);
                _usePipeline = false;
            }
        }

        // Fallback: raw model API
        _notify(onProgress, 'Loading CLIP model (raw API)...', 10);
        const progressCb = (/** @type {*} */ data: any) => {
            if (data.status === 'progress' && typeof data.progress === 'number') {
                _notify(onProgress, `Downloading CLIP... ${Math.round(data.progress)}%`, 10 + data.progress * 0.8);
            }
        };

        const [model, processor, tokenizer] = await Promise.all([
            _transformers.CLIPModel.from_pretrained(CLIP_MODEL_ID, {
                quantized: true,
                progress_callback: progressCb,
            }),
            _transformers.AutoProcessor.from_pretrained(CLIP_MODEL_ID),
            _transformers.AutoTokenizer.from_pretrained(CLIP_MODEL_ID),
        ]);

        _clipModel = model;
        _clipProcessor = processor;
        _clipTokenizer = tokenizer;

        _notify(onProgress, 'CLIP ready', 100);
    } catch (err) {
        _clipPipeline = null;
        _clipModel = null;
        _clipProcessor = null;
        _clipTokenizer = null;
        throw new Error(`Failed to load CLIP model: ${(err as any).message}`, { cause: err });
    } finally {
        _loading = false;
    }
}

// ----------------------------------------------------------------
// PUBLIC API - Segment by Text
// ----------------------------------------------------------------

/**
 * Text-prompted segmentation: auto-mask + CLIP classification.
 * Pipeline: gera mascaras automaticas, classifica cada uma por texto,
 * filtra pelas que matcham os labels pedidos.
 *
 * @param {string} imageDataUrl - Base64 data URL
 * @param {string} textPrompt - Comma-separated labels
 * @param {*} extent - { minX, maxX, minZ, maxZ }
 * @param {Object} [options={}]
 * @param {number} [options.scoreThreshold=0.15] - Min CLIP score
 * @param {AbortSignal} [options.signal] - Cancellation
 * @param {Function} [options.onProgress] - { message, progress }
 * @returns {Promise<Array<*>>} Array of DetectedFeature
 */
export async function segmentByText(imageDataUrl: any, textPrompt: any, extent: any, options: any = {}) {
    const { scoreThreshold = 0.15, signal, onProgress } = options;

    // Parse text prompt
    const labels = _parseTextPrompt(textPrompt);
    if (labels.length === 0) throw new Error('Text prompt cannot be empty');

    // Generate auto-masks (F1)
    _notify(onProgress, 'Generating masks...', 5);
    const masks = await generateAutoMasks(imageDataUrl, extent, {
        ...options,
        onProgress: (/** @type {*} */ info: any) => _notify(onProgress, info.message, info.progress * 0.6),
    });

    if (masks.length === 0) return [];

    // Try loading CLIP; on failure, fall back to heuristics
    let clipAvailable = _clipPipeline || _clipModel;
    if (!clipAvailable) {
        try {
            await loadCLIP((/** @type {*} */ info: any) => _notify(onProgress, info.message, 60 + info.progress * 0.2));
            clipAvailable = true;
        } catch (err) {
            console.warn('[CLIP] Load failed, using heuristic fallback:', (err as any).message);
            // Fallback: use heuristic classification
            return autoMasksToFeatures(masks, extent, imageDataUrl);
        }
    }

    // Classify each mask region with CLIP
    _notify(onProgress, 'Classifying regions...', 80);
        const features: any[] = [];
    const imagePixels: any = await _loadImageToCanvas(imageDataUrl);

    for (let i = 0; i < masks.length; i++) {
        if (signal?.aborted) break;

        const maskResult = ((masks[i]) as any);
        const { mask, bbox } = maskResult;

        try {
            // Crop + mask the region
            const croppedDataUrl = _cropAndMaskRegion(imagePixels, mask, bbox);
            if (!croppedDataUrl) continue;

            // Classify with CLIP
            const scores = await _classifyImage(croppedDataUrl, labels);
            if (!scores || scores.length === 0) continue;

            // Best match
            const best = scores[0];
            if (best.score < scoreThreshold) continue;

            // Map label to family
            const family = _labelToFamily(best.label);

            // Anti-Ameba
            const processed = antiAmebaSingle(mask, family, extent, imagePixels.width!, imagePixels.height!);
            if (!processed) continue;

            // World position
            const centerPx = bbox.x + bbox.w / 2;
            const centerPy = bbox.y + bbox.h / 2;
            const nx = centerPx / imagePixels.width!;
            const ny = centerPy / imagePixels.height!;
            const worldX = extent.minX + nx * (extent.maxX - extent.minX);
            const worldZ = extent.maxZ - ny * (extent.maxZ - extent.minZ);

            features.push({
                family,
                confidence: best.score,
                position: { x: worldX, z: worldZ },
                dimensions: {
                    width: processed.area_m2 > 0 ? Math.sqrt(processed.area_m2) : 5,
                    depth: processed.area_m2 > 0 ? Math.sqrt(processed.area_m2) : 5,
                    height: processed.height,
                },
                rotation: 0,
                contours: processed.worldContour ? [processed.worldContour] : [],
                sourceMethod: 'textPrompt',
                clipLabel: best.label,
                clipScore: best.score,
            });
        } catch (err) {
            console.warn(`[CLIP] Failed to classify mask ${i}:`, (err as any).message);
        }

        if (i % 5 === 0) {
            const progress = 80 + (i / masks.length) * 20;
            _notify(onProgress, `Classifying... ${i + 1}/${masks.length}`, progress);
        }
    }

    _notify(onProgress, `${features.length} features matched`, 100);
    return features;
}

// ----------------------------------------------------------------
// PUBLIC API - Status
// ----------------------------------------------------------------

/**
 * Get CLIP model status.
 * @returns {{ loaded: boolean, loading: boolean, modelSize: string }}
 */
export function getCLIPStatus() {
    return {
        loaded: _clipPipeline !== null || _clipModel !== null,
        loading: _loading,
        modelSize: '~85 MB',
    };
}

// ----------------------------------------------------------------
// INTERNAL - CLIP Classification
// ----------------------------------------------------------------

/**
 * Classify an image against text labels using CLIP.
 * @param {*} imageDataUrl
 * @param {*} labels
 * @returns {Promise<Array<{ label: string, score: number }>>} Sorted by score desc
 */
async function _classifyImage(imageDataUrl: any, labels: any) {
    if (_clipPipeline) {
        // Pipeline API
        const results = await _clipPipeline(imageDataUrl, { candidate_labels: labels });
        return results
            .map((/** @type {*} */ r: any) => ({
            label: r.label,
            score: r.score
        }))
            .sort((/** @type {*} */ a: any, /** @type {*} */ b: any) => b.score - a.score);
    }

    if (_clipModel && _clipProcessor && _clipTokenizer) {
        // Raw model API fallback
        const rawImage = await _transformers.RawImage.read(imageDataUrl);
        const imageInputs = await _clipProcessor(rawImage);
        const textInputs = await _clipTokenizer(labels, { padding: true, truncation: true });

        const outputs = await _clipModel({ ...imageInputs, ...textInputs });
        const logits = outputs.logits_per_image.data;

        // Softmax
        const maxLogit = Math.max(...logits);
        const exps = logits.map((/** @type {number} */ l: any) => Math.exp(l - maxLogit));
        const sumExps = exps.reduce((/** @type {number} */ s: any, /** @type {number} */ e: any) => s + e, 0);
        const probs = exps.map((/** @type {number} */ e: any) => e / sumExps);

        return labels
            .map((label: any, i: number) => ({
            label,
            score: probs[i]
        }))
            .sort((/** @type {*} */ a: any, /** @type {*} */ b: any) => b.score - a.score);
    }

    return [];
}

// ----------------------------------------------------------------
// INTERNAL - Image Cropping & Masking
// ----------------------------------------------------------------

/**
 * Crop image to bbox and zero-out pixels outside mask.
 * Retorna data URL do recorte mascarado.
 * @param {*} imagePixels @param {*} mask @param {*} bbox
 */
function _cropAndMaskRegion(imagePixels: any, mask: any, bbox: any) {
    const { canvas: srcCanvas, ctx: _srcCtx, width, height } = imagePixels;

    const cropW = Math.min(bbox.w, width - bbox.x);
    const cropH = Math.min(bbox.h, height - bbox.y);
    if (cropW <= 0 || cropH <= 0) return null;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = ((cropCanvas.getContext('2d')) as any);

    // Draw cropped region
    cropCtx.drawImage(srcCanvas, bbox.x, bbox.y, cropW, cropH, 0, 0, cropW, cropH);

    // Apply mask: zero-out background pixels
    const cropData = cropCtx.getImageData(0, 0, cropW, cropH);
    const pixels = cropData.data;

    for (let dy = 0; dy < cropH; dy++) {
        for (let dx = 0; dx < cropW; dx++) {
            const maskIdx = (bbox.y + dy) * width + (bbox.x + dx);
            if (!mask[maskIdx]) {
                const pixIdx = (dy * cropW + dx) * 4;
                pixels[pixIdx] = 0;
                pixels[pixIdx + 1] = 0;
                pixels[pixIdx + 2] = 0;
                pixels[pixIdx + 3] = 0;
            }
        }
    }

    cropCtx.putImageData(cropData, 0, 0);
    return cropCanvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Load image data URL into a canvas for pixel operations.
 * @param {*} imageDataUrl
 */
async function _loadImageToCanvas(imageDataUrl: any) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = ((canvas.getContext('2d')) as any);
            ctx.drawImage(img, 0, 0);
            resolve({ canvas, ctx, width: canvas.width, height: canvas.height });
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = imageDataUrl;
    });
}

// ----------------------------------------------------------------
// INTERNAL - Label Parsing & Mapping
// ----------------------------------------------------------------

/** @param {*} text */
function _parseTextPrompt(text: any) {
    if (!text) return [];
    return [
        ...new Set(
            text
                .split(',')
                .map((/** @type {string} */ s: any) => s.trim().toLowerCase())
                .filter((/** @type {string} */ s: any) => s.length > 0),
        ),
    ];
}

/** @param {*} label */
function _labelToFamily(label: any) {
    const lower = label.toLowerCase().trim();

    // Direct match
    if (LABEL_FAMILY_MAP[lower]) return LABEL_FAMILY_MAP[lower];

    // Partial match: check if any key is contained in the label
    for (const [key, family] of Object.entries(LABEL_FAMILY_MAP)) {
        if (lower.includes(key) || key.includes(lower)) return family;
    }

    return 'marker';
}

// ----------------------------------------------------------------
// INTERNAL HELPER
// ----------------------------------------------------------------

/** @param {*} onProgress @param {*} message @param {*} progress */
function _notify(onProgress: any, message: any, progress: any) {
    onProgress?.({ message, progress });
}
