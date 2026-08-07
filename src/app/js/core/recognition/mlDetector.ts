// @ts-check
// Generated from src/app/js/core/recognition/mlDetector.ts by TS-MIGRATION-001. Do not edit manually.
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
   ML DETECTOR — Zero-shot object detection via OWL-ViT
   ================================================================

   Deteccao de objetos em imagens aereas usando modelo de visao
   zero-shot (OWL-ViT via Transformers.js). Define labels proprios
   (building, water, tank, road, vegetation) sem depender de classes
   pre-definidas como COCO.

   Modelo carregado sob demanda do CDN, cachado apos primeiro uso.
   Primeira execucao baixa ~80-150 MB (modelo quantizado).
   Execucoes subsequentes usam cache do browser (instantaneo).

   ================================================================ */
// ----------------------------------------------------------------
// CDN & MODEL CONFIGURATION
// ----------------------------------------------------------------
import { importCDN } from '../../utils/helpers/cdnLoader.js';
const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
/**
 * Candidate labels for zero-shot detection on aerial imagery.
 * Cada label e testado contra regioes da imagem pelo CLIP encoder.
 * Labels curtos e visuais funcionam melhor.
 */
const CANDIDATE_LABELS = [
    'building',
    'industrial building',
    'water body',
    'river',
    'storage tank',
    'road',
    'parking lot',
    'trees',
    'forest',
    'bare soil',
    'swimming pool',
    'bridge',
    'vehicle',
];
/**
 * Mapping: detected label → environmental element family.
 * De-para entre labels do modelo e familias do ecbyts.
 */
const LABEL_TO_FAMILY = {
    building: 'building',
    'industrial building': 'building',
    'water body': 'lake',
    river: 'river',
    'storage tank': 'tank',
    road: 'marker',
    'parking lot': 'marker',
    trees: 'habitat',
    forest: 'habitat',
    'bare soil': 'marker',
    'swimming pool': 'lake',
    bridge: 'marker',
    vehicle: 'marker',
};
/**
 * Mapping: detected label → marker subtype.
 * Usado para definir markerType quando a familia e 'marker'.
 */
const LABEL_TO_MARKER_TYPE = {
    road: 'road',
    'parking lot': 'parking',
    'bare soil': 'soil',
    bridge: 'other',
    vehicle: 'other',
};
// ----------------------------------------------------------------
// DETECTOR SINGLETON
// Carregado uma unica vez; reutilizado entre chamadas
// ----------------------------------------------------------------
/** @type {any} */
let _detector: any = null;
let _loading = false;
/** @type {any} */
let _transformers: any = null;
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Detect features in aerial image using ML model.
 * Usa OWL-ViT (zero-shot) para encontrar objetos relevantes.
 *
 * @param {string} imageDataUrl - Base64 data URL da imagem
 * @param {any} extent - { minX, maxX, minZ, maxZ }
 * @param {Function} [onProgress] - Callback para progresso: { status, message, progress }
 * @returns {Promise<any[]>} - DetectedFeature[]
 */
export async function analyzeWithML( imageDataUrl: any, extent: any, onProgress: any) {
    // Step 1: Load Transformers.js from CDN (cachado pelo browser)
    if (!_transformers) {
        _notify(onProgress, 'loading', 'Loading ML engine...', 0);
        _transformers = await importCDN(TRANSFORMERS_CDN, { name: 'Transformers.js' });
        if (_transformers.env) _transformers.env.allowLocalModels = false;
    }
    // Step 2: Load model (primeira vez baixa ~80-150 MB, depois cachado)
    if (!_detector) {
        if (_loading) throw new Error('Model is already loading. Please wait.');
        _loading = true;
        _notify(onProgress, 'downloading', 'Downloading detection model...', 0);
        try {
            _detector = await _transformers.pipeline('zero-shot-object-detection', 'Xenova/owlvit-base-patch32', {
                progress_callback: (data: any) => {
                    if (data.status === 'progress' && typeof data.progress === 'number') {
                        const pct = Math.round(data.progress);
                        _notify(onProgress, 'downloading', `Downloading model... ${pct}%`, pct);
                    } else if (data.status === 'done') {
                        _notify(onProgress, 'downloading', 'Model ready', 100);
                    }
                },
            });
        } catch (err: any) {
            _detector = null;
            throw new Error(`Failed to load detection model: ${err?.message}`, { cause: err });
        } finally {
            _loading = false;
        }
    }
    // Step 3: Run zero-shot detection
    _notify(onProgress, 'inference', 'Detecting features...', -1);
    // candidate_labels is a positional arg, NOT inside options object
    const results = await _detector(imageDataUrl, CANDIDATE_LABELS, {
        threshold: 0.05, // Limiar baixo para capturar sinais fracos em satelite
    });
    // Step 4: Convert to DetectedFeature[]
    const imgDims = await _getImageDimensions(imageDataUrl);
    return _resultsToFeatures(results, imgDims, extent);
}
/**
 * Check if ML model is already loaded (cached in memory).
 * @returns {boolean}
 */
export function isMLModelLoaded() {
    return _detector !== null;
}
/**
 * Get current candidate labels (for display/configuration).
 * @returns {string[]}
 */
export function getCandidateLabels() {
    return [...CANDIDATE_LABELS];
}
/**
 * Get label → family mapping (for display/configuration).
 * @returns {Object}
 */
export function getLabelMapping() {
    return { ...LABEL_TO_FAMILY };
}
// ----------------------------------------------------------------
// RESULTS → DETECTED FEATURES
// Converte saida do modelo para schema DetectedFeature
// ----------------------------------------------------------------
/**
 * Convert OWL-ViT results to DetectedFeature array.
 * @param {any[]} results - [{ score, label, box: { xmin, ymin, xmax, ymax } }]
 * @param {any} imgDims - { width, height }
 * @param {any} extent - { minX, maxX, minZ, maxZ }
 * @returns {any[]} DetectedFeature[]
 */
function _resultsToFeatures( results: any, imgDims: any, extent: any) {
    const worldW = extent.maxX - extent.minX;
    const worldH = extent.maxZ - extent.minZ;
    // Deduplicate overlapping detections (same family, IoU > 0.5)
    const filtered = _nonMaxSuppression(results, 0.5);
    return filtered
        .map((det: any) => {
            const family = (LABEL_TO_FAMILY as any)[det.label] || 'marker';
            const box = det.box;
            // Bounding box center → world coordinates
            const cx = (box.xmin + box.xmax) / 2;
            const cy = (box.ymin + box.ymax) / 2;
            const worldX = extent.minX + (cx / imgDims.width) * worldW;
            const worldZ = extent.minZ + (cy / imgDims.height) * worldH;
            // Bounding box size → world dimensions
            const bboxW = ((box.xmax - box.xmin) / imgDims.width) * worldW;
            const bboxH = ((box.ymax - box.ymin) / imgDims.height) * worldH;
            // Minimum size filter (features smaller than ~5m are noise at 2m/px)
            if (bboxW < 3 && bboxH < 3) return null;
            const dimensions = _buildDimensions(family, bboxW, bboxH, det.label) as Record<string, string>;
            return {
                family,
                confidence: Math.round(det.score * 100) / 100,
                label: det.label,
                position: {
                    x: Math.round(worldX * 10) / 10,
                    z: Math.round(worldZ * 10) / 10,
                },
                dimensions,
                rotation: 0,
                sourceMethod: 'ml',
            };
        })
        .filter((f: any) => f !== null)
        .sort((a: any, b: any) => b.confidence - a.confidence)
        .slice(0, 30);
}
// ----------------------------------------------------------------
// NON-MAX SUPPRESSION
// Remove deteccoes duplicadas com alta sobreposicao
// ----------------------------------------------------------------
/**
 * Simple NMS to remove overlapping boxes of same family.
 * @param {any[]} results - Raw detector output
 * @param {number} iouThreshold - IoU above which to suppress
 * @returns {any[]} Filtered results
 */
function _nonMaxSuppression( results: any, iouThreshold: any) {
    // Sort by score descending
    const sorted = [...results].sort((a: any, b: any) => b.score - a.score);
    const keep: any[] = [];
    for (const det of sorted) {
        const dominated = keep.some((kept: any) => {
            // Only suppress if same family
            if (
                /** @type {Record<string, string>} */ (LABEL_TO_FAMILY as any)[kept.label] !==
                /** @type {Record<string, string>} */ (LABEL_TO_FAMILY as any)[det.label]
            )
                return false;
            return _iou(kept.box, det.box) > iouThreshold;
        });
        if (!dominated) keep.push(det);
    }
    return keep;
}
/**
 * Intersection over Union of two bounding boxes.
 * @param {any} a - { xmin, ymin, xmax, ymax }
 * @param {any} b - { xmin, ymin, xmax, ymax }
 * @returns {number} - IoU [0, 1]
 */
function _iou( a: any, b: any) {
    const x1 = Math.max(a.xmin, b.xmin);
    const y1 = Math.max(a.ymin, b.ymin);
    const x2 = Math.min(a.xmax, b.xmax);
    const y2 = Math.min(a.ymax, b.ymax);
    if (x2 <= x1 || y2 <= y1) return 0;
    const intersection = (x2 - x1) * (y2 - y1);
    const areaA = (a.xmax - a.xmin) * (a.ymax - a.ymin);
    const areaB = (b.xmax - b.xmin) * (b.ymax - b.ymin);
    return intersection / (areaA + areaB - intersection);
}
// ----------------------------------------------------------------
// DIMENSION BUILDERS
// Constroi dados especificos por familia a partir da bounding box
// ----------------------------------------------------------------
/**
 * Build family-specific dimension data from bounding box.
 * @param {string} family
 * @param {number} bboxW - World width in meters
 * @param {number} bboxH - World height in meters
 * @param {string} label - Original detection label
 * @returns {Object}
 */
function _buildDimensions( family: any, bboxW: any, bboxH: any, label: any) {
    const w = Math.max(5, Math.round(bboxW * 10) / 10);
    const h = Math.max(5, Math.round(bboxH * 10) / 10);
    switch (family) {
        case 'building':
            return {
                footprint: { width: w, length: h },
                height: Math.round(4 + Math.random() * 8),
                type: label.includes('industrial') ? 'industrial' : 'commercial',
            };
        case 'tank': {
            const diam = Math.round(Math.min(w, h) * 10) / 10;
            return {
                dimensions: { diameter: diam, length: diam },
                type: 'aboveground',
            };
        }
        case 'lake':
            return {
                shape: {
                    radiusX: Math.round((w / 2) * 10) / 10,
                    radiusY: Math.round((h / 2) * 10) / 10,
                    depth: 3,
                },
            };
        case 'river':
            return {
                width: Math.max(2, Math.round(Math.min(w, h) * 10) / 10),
            };
        case 'habitat':
            return {
                habitatType: label === 'forest' ? 'forest' : 'grassland',
                protectionStatus: 'none',
                area: Math.round(w * h),
            };
        case 'marker':
        default:
            return {
                markerType: (LABEL_TO_MARKER_TYPE as any)[label] || 'other',
            };
    }
}
// ----------------------------------------------------------------
// UTILITIES
// ----------------------------------------------------------------
/**
 * Get image dimensions from data URL.
 * @param {string} dataUrl
 * @returns {Promise<{width: number, height: number}>}
 */
function _getImageDimensions( dataUrl: any) {
    return new Promise((resolve: any) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => resolve({ width: 256, height: 256 });
        img.src = dataUrl;
    });
}
/**
 * Notify progress callback if provided.
 * @param {Function|null|undefined} cb
 * @param {string} status
 * @param {string} message
 * @param {number} progress - 0-100 or -1 for indeterminate
 */
function _notify( cb: any, status: any, message: any, progress: any) {
    if (cb) /** @type {any} */ (cb)({ status, message, progress });
}
