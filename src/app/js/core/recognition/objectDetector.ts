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
   OBJECT DETECTOR — YOLOS-tiny bounding box detection
   ================================================================

   Motor de deteccao de objetos discretos usando YOLOS-tiny (~25 MB)
   via Transformers.js v3. Detecta objetos isolados como carros,
   caminhoes, conteineres, barcos — elementos que SegFormer/SLIC
   segmentam pobremente por serem muito pequenos.

   COCO 80 classes: NAO inclui "building". Este motor complementa
   SegFormer (segmentacao semantica) e SLIC (superpixels) para
   objetos discretos que aqueles metodos nao capturam bem.

   Pipeline:
   1. Carregar Transformers.js v3 via CDN
   2. Carregar YOLOS-tiny quantizado (~25 MB, cacheado)
   3. Rodar object-detection pipeline
   4. Filtrar por threshold de confianca
   5. Converter bounding boxes → poligonos de 4 vertices
   6. Mapear labels COCO → familias ecbyts

   ================================================================ */

import { importCDN } from '../../utils/helpers/cdnLoader.js';

// CDN: Transformers.js v3 para novos motores
const TRANSFORMERS_V3_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
const MODEL_NAME = 'Xenova/yolos-tiny';

// ----------------------------------------------------------------
// COCO → ECBYTS FAMILY MAPPING
// Mapeamento das 80 classes COCO para familias ambientais
// ----------------------------------------------------------------

const COCO_TO_FAMILY = {
    // Veiculos → marker
    car: 'marker',
    truck: 'marker',
    bus: 'marker',
    motorcycle: 'marker',
    bicycle: 'marker',
    // Maritimo → marker
    boat: 'marker',
    // Infraestrutura → marker
    'fire hydrant': 'marker',
    'stop sign': 'marker',
    'traffic light': 'marker',
    bench: 'marker',
    // Containers/tanques → tank
    suitcase: 'tank',
    // Pessoas → ignorar (privacidade)
    person: null,
    // Animais → marker
    bird: 'marker',
    cat: null,
    dog: null,
    horse: 'marker',
    cow: 'marker',
    sheep: 'marker',
    // Outdoor
    'potted plant': 'habitat',
    umbrella: 'marker',
    // Aeronaves
    airplane: 'marker',
    train: 'marker',
};

// Dimensoes default (metros) para familias de objetos detectados
const FAMILY_DIMENSIONS = {
    marker: { width: 2, length: 4, height: 1.5 },
    tank: { width: 2, length: 3, height: 2 },
    habitat: { width: 1, length: 1, height: 1 },
};

// ----------------------------------------------------------------
// DETECTOR SINGLETON
// ----------------------------------------------------------------

/** @type {any} */
let _detector: any = null;
let _loading = false;
/** @type {any} */
let _transformers: any = null;

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

async function _loadTransformers(onProgress: any) {
    if (_transformers) return _transformers;
    _notify(onProgress, 'Loading ML engine (v3)...', 0);
    _transformers = await importCDN(TRANSFORMERS_V3_CDN, { name: 'Transformers.js v3' });
    if (_transformers.env) _transformers.env.allowLocalModels = false;
    return _transformers;
}

async function _loadDetector(onProgress: any) {
    if (_detector) return _detector;
    if (_loading) throw new Error('YOLOS model is already loading. Please wait.');
    _loading = true;
    _notify(onProgress, 'Downloading YOLOS-tiny (~25 MB)...', 0);

    try {
        _detector = await _transformers.pipeline('object-detection', MODEL_NAME, {
            quantized: true,
            progress_callback: (/** @type {any} */ data: any) => {
                if (data.status === 'progress' && typeof data.progress === 'number') {
                    const pct = Math.round(data.progress);
                    _notify(onProgress, `Downloading model... ${pct}%`, pct);
                } else if (data.status === 'done') {
                    _notify(onProgress, 'Model ready', 100);
                }
            },
        });
        return _detector;
    } catch (err) {
        _detector = null;
        throw new Error(`Failed to load YOLOS model: ${(err as any)?.message}`, { cause: err });
    } finally {
        _loading = false;
    }
}

function _convertDetectionToFeature(det: any, imgDims: any, ext: any): any {
    const label = det.label?.toLowerCase() || '';
    const family = (COCO_TO_FAMILY as any)[label];

    // Skip unmapped or ignored classes
    if (family === null || family === undefined) return null;

    const worldW = ext.maxX - ext.minX;
    const worldH = ext.maxZ - ext.minZ;

    // Bounding box: pixel coords → normalize to [0,1]
    const xmin = det.box.xmin / imgDims.width;
    const ymin = det.box.ymin / imgDims.height;
    const xmax = det.box.xmax / imgDims.width;
    const ymax = det.box.ymax / imgDims.height;

    // Center in world coordinates
    // Y axis inverted: pixel Y=0 (top) → maxZ (far)
    const cx = ext.minX + ((xmin + xmax) / 2) * worldW;
    const cz = ext.maxZ - ((ymin + ymax) / 2) * worldH;

    // Box dimensions in world
    const bboxW = (xmax - xmin) * worldW;
    const bboxH = (ymax - ymin) * worldH;

    // 4-vertex polygon from bounding box
    const x0 = ext.minX + xmin * worldW;
    const x1 = ext.minX + xmax * worldW;
    const z0 = ext.maxZ - ymax * worldH;
    const z1 = ext.maxZ - ymin * worldH;

    const contour = [
        { x: x0, z: z0 },
        { x: x1, z: z0 },
        { x: x1, z: z1 },
        { x: x0, z: z1 },
    ];

    const dims = (FAMILY_DIMENSIONS as any)[family] || FAMILY_DIMENSIONS.marker;

    return {
        family,
        confidence: Math.round(det.score * 100) / 100,
        label: `${label} (${Math.round(det.score * 100)}%)`,
        position: {
            x: Math.round(cx * 10) / 10,
            z: Math.round(cz * 10) / 10,
        },
        dimensions: {
            width: Math.max(dims.width, bboxW),
            length: Math.max(dims.length, bboxH),
            height: dims.height,
        },
        rotation: 0,
        contours: [contour],
        sourceMethod: 'yolos',
        cocoLabel: label,
        bbox: { xmin, ymin, xmax, ymax },
    };
}

/**
 * Detect discrete objects in aerial image using YOLOS-tiny.
 * Retorna DetectedFeature[] compativel com o pipeline do aerial handler.
 *
 * @param {string} imageDataUrl - Base64 data URL
 * @param {Object} extent - { minX, maxX, minZ, maxZ }
 * @param {Function} [onProgress] - Callback: { message, progress }
 * @param {Object} [options={}]
 * @param {number} [options.threshold=0.3] - Confidence threshold
 * @param {number} [options.maxDetections=50] - Max results
 * @returns {Promise<Array<any>>} - DetectedFeature[]
 */
export async function analyzeWithYOLOS(imageDataUrl: any, extent: any, onProgress: any, options: any = {}) {
    const _ext = (extent as any);
    const { threshold = 0.3, maxDetections = 50 } = options;

    await _loadTransformers(onProgress);
    await _loadDetector(onProgress);

    // Run object detection
    _notify(onProgress, 'Detecting objects...', -1);

    const results = await _detector(imageDataUrl, { threshold });

    if (!results || results.length === 0) {
        _notify(onProgress, 'No objects detected', 100);
        return [];
    }

    // Convert to DetectedFeature[]
    _notify(onProgress, `Processing ${results.length} detections...`, 80);

    // Load image dimensions - bbox comes in pixels, normalize to [0,1]
    const imgDims: any = await _getImageDims(imageDataUrl);

    const features = [];
    for (const det of results) {
        const feature = _convertDetectionToFeature(det, imgDims, _ext);
        if (feature) features.push(feature);
    }

    // Sort by confidence, limit
    features.sort((a, b) => b.confidence - a.confidence);
    const limited = features.slice(0, maxDetections);

    _notify(onProgress, `${limited.length} objects detected`, 100);
    return limited;
}

/**
 * Check if YOLOS model is loaded.
 * @returns {boolean}
 */
export function isYOLOSLoaded() {
    return _detector !== null;
}

/**
 * Get approximate model size for UI display.
 * @returns {string}
 */
export function getYOLOSModelSize() {
    return '~25 MB';
}

// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------

/**
 * @param {any} onProgress
 * @param {any} message
 * @param {any} progress
 */
function _notify(onProgress: any, message: any, progress: any) {
    onProgress?.({ message, progress });
}

/**
 * Get image dimensions from data URL.
 */
/** @param {any} dataUrl */
function _getImageDims(dataUrl: any) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => resolve({ width: 512, height: 512 });
        img.src = dataUrl;
    });
}
