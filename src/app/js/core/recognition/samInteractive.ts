// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// @ts-check
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
   SAM INTERACTIVE — Segment Anything Model (click-to-segment)
   ================================================================

   Motor de segmentacao interativa Zero-Shot usando SlimSAM via
   Transformers.js v3. O usuario clica em um objeto no mapa aereo
   e a IA devolve a mascara exata daquele elemento.

   Modelo: Xenova/slimsam-77-uniform (~50 MB quantizado)
   CDN: Transformers.js v3 (@huggingface/transformers@3)

   API correta do Transformers.js para SAM:
     const inputs = await processor(raw_image, { input_points: [[[x, y]]] });
     const outputs = await model(inputs);
     const masks = await processor.post_process_masks(
         outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes
     );

   Two-phase optimization:
     1. setImage(): processor(image) + model.get_image_embeddings(inputs)
     2. segmentAtPoint(): processor(image, {input_points}) → inject embeddings → model()

   ================================================================ */

import { largestContour } from './postprocess/marchingSquares.js';
import { antiAmebaSingle } from './postprocess/index.js';

// ----------------------------------------------------------------
// CDN & MODEL CONFIGURATION
// ----------------------------------------------------------------

import { importCDN } from '../../utils/helpers/cdnLoader.js';

const TRANSFORMERS_V3_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

// Dual-model registry - usuario pode escolher entre SlimSAM (rapido) e SAM 2 (preciso)
/** @type {Record<string, { id: string, size: string, label: string }>} */
const SAM_MODELS = {
    slim: { id: 'Xenova/slimsam-77-uniform', size: '~50 MB', label: 'SlimSAM (fast)' },
    // SAM 2.1 ONNX - disponivel quando Xenova publicar port quantizado
    // sam2: { id: 'Xenova/sam2-hiera-tiny', size: '~150 MB', label: 'SAM 2.1 (precise)' },
};
let _selectedModelKey = 'slim';

// ----------------------------------------------------------------
// MODEL STATE - Singleton with two-phase lifecycle
// ----------------------------------------------------------------

/** @type {any} */
let _transformers: any = null;
/** @type {any} */
let _model: any = null;
/** @type {any} */
let _processor: any = null;
let _loading = false;

// Image state (reused across clicks)
/** @type {any} */
let _imageEmbeddings: any = null;
/** @type {any} */
let _rawImage: any = null;
/** @type {string|null} */
let _currentImageUrl: any = null;
let _imageWidth = 0;
let _imageHeight = 0;

// ----------------------------------------------------------------
// PUBLIC API - Load Model
// ----------------------------------------------------------------

/**
 * Select which SAM model to use. Forces reload on next loadSAM() if different.
 * @param {string} key - 'slim' or 'sam2' (when available)
 */
export function selectSAMModel(key: any) {
    if (!SAM_MODELS[key as keyof typeof SAM_MODELS]) {
        console.warn(`[ecbyts] Unknown SAM model key: ${key}. Available:`, Object.keys(SAM_MODELS));
        return;
    }
    if (_selectedModelKey !== key) {
        // Force reload on next call
        _model = null;
        _processor = null;
        _imageEmbeddings = null;
        _rawImage = null;
        _currentImageUrl = null;
        _selectedModelKey = key;
    }
}

/**
 * Get available SAM models for UI rendering.
 * @returns {Array<{key: string, id: string, size: string, label: string, selected: boolean}>}
 */
export function getSAMModels() {
    return Object.entries(SAM_MODELS).map(([key, m]) => ({
        key,
        ...m,
        selected: key === _selectedModelKey,
    }));
}

/**
 * Load SAM model from CDN.
 * Primeiro load faz download (cacheado pelo Cache API).
 * Chamadas subsequentes reutilizam o modelo em memoria.
 *
 * @param {((status: { message: string, progress: number }) => void)} [onProgress] - Callback: { message, progress }
 * @returns {Promise<void>}
 */
export async function loadSAM(onProgress: any) {
    if (_model && _processor) return; // Ja carregado
    if (_loading) throw new Error('SAM is already loading. Please wait.');

    _loading = true;

    try {
        // Load Transformers.js v3
        if (!_transformers) {
            _notify(onProgress, 'Loading ML engine...', 0);
            _transformers = await importCDN(TRANSFORMERS_V3_CDN, { name: 'Transformers.js v3' });
            if (_transformers.env) _transformers.env.allowLocalModels = false;
        }

        // Load SAM model (selected variant)
        const modelConfig = SAM_MODELS[_selectedModelKey as keyof typeof SAM_MODELS];
        const modelId = modelConfig.id;
        _notify(onProgress, `Downloading ${modelConfig.label} (${modelConfig.size})...`, 5);

        const progressCb = (/** @type {any} */ data: any) => {
            if (data.status === 'progress' && typeof data.progress === 'number') {
                const pct = Math.round(data.progress);
                _notify(onProgress, `Downloading SAM... ${pct}%`, 5 + pct * 0.85);
            }
        };

        // Load model and processor in parallel
        const [model, processor] = await Promise.all([
            _transformers.SamModel.from_pretrained(modelId, {
                quantized: true,
                progress_callback: progressCb,
            }),
            _transformers.AutoProcessor.from_pretrained(modelId),
        ]);

        _model = model;
        _processor = processor;

        _notify(onProgress, 'SAM ready', 100);
    } catch (err) {
        _model = null;
        _processor = null;
        throw new Error(`Failed to load SAM model: ${(err as any).message}`, { cause: err });
    } finally {
        _loading = false;
    }
}

// ----------------------------------------------------------------
// PUBLIC API - Set Image (encode embeddings)
// ----------------------------------------------------------------

/**
 * Set the image for SAM processing.
 * Deve ser chamado antes de segmentAtPoint. Encode image embeddings
 * (~2-3s na primeira vez). Se a mesma imagem for passada novamente,
 * reutiliza embeddings existentes.
 *
 * @param {string} imageDataUrl - Base64 data URL
 * @param {((status: { message: string, progress: number }) => void)} [onProgress] - Callback
 * @returns {Promise<void>}
 */
export async function setImage(imageDataUrl: any, onProgress: any) {
    if (!_model || !_processor) {
        throw new Error('SAM model not loaded. Call loadSAM() first.');
    }

    // Skip re-encoding se imagem e a mesma
    if (_currentImageUrl === imageDataUrl && _imageEmbeddings) {
        _notify(onProgress, 'Image already encoded', 100);
        return;
    }

    _notify(onProgress, 'Encoding image...', 10);

    // Load image via Transformers.js RawImage
    _rawImage = await _transformers.RawImage.read(imageDataUrl);
    _imageWidth = _rawImage.width;
    _imageHeight = _rawImage.height;

    // Process image (resize + normalize) sem pontos
    _notify(onProgress, 'Processing image...', 30);
    const inputs = await _processor(_rawImage);

    // Encode image embeddings (heavy step, ~2-3s)
    _notify(onProgress, 'Computing embeddings...', 50);
    _imageEmbeddings = await _model.get_image_embeddings(inputs);
    _currentImageUrl = imageDataUrl;

    _notify(onProgress, 'Image encoded — click to segment', 100);
}

// ----------------------------------------------------------------
// PUBLIC API - Segment at Point (per-click)
// ----------------------------------------------------------------

/**
 * Segment object at click point.
 * Retorna mascara binaria + contorno para o objeto sob o pixel clicado.
 * Rapido (~200ms) porque reutiliza embeddings pre-computados.
 *
 * API Transformers.js:
 *   const inputs = await processor(raw_image, { input_points: [[[x, y]]] });
 *   const outputs = await model({ ...image_embeddings, ...inputs });
 *
 * @param {number} x - Click X in pixel space (0 to width-1)
 * @param {number} y - Click Y in pixel space (0 to height-1)
 * @param {any} extent - { minX, maxX, minZ, maxZ }
 * @param {{ family?: string, maskThreshold?: number }} [options={}]
 * @returns {Promise<SAMResult|null>}
 *
 * @typedef {Object} SAMResult
 * @property {Uint8Array} mask - Binary mask (0 or 255), width x height
 * @property {Array<{x: number, y: number}>} contour - Pixel contour
 * @property {Object|null} processed - Anti-Ameba result (worldContour, area_m2, etc.)
 * @property {number} maskWidth
 * @property {number} maskHeight
 */
export async function segmentAtPoint(x: any, y: any, extent: any, options: any = {}) {
    if (!_model || !_processor || !_imageEmbeddings || !_rawImage) {
        throw new Error('Image not encoded. Call setImage() first.');
    }

    const { family = 'building', maskThreshold = 0.0 } = options;

    // Clamp coordinates
    const px = _clampCoord(x, _imageWidth - 1);
    const py = _clampCoord(y, _imageHeight - 1);

    // Processar imagem com ponto de entrada (API oficial do Transformers.js)
    // input_points: [[[x, y]]] - batch → image → points
    const inputs = await _processor(_rawImage, {
        input_points: [[[px, py]]],
    });

    // Run model com embeddings pre-computados + inputs processados
    const outputs = await _model({
        ...inputs,
        ..._imageEmbeddings,
    });

    // Post-process: extract masks
    const masks = await _processor.post_process_masks(
        outputs.pred_masks,
        inputs.original_sizes,
        inputs.reshaped_input_sizes,
    );

    // masks[0] = batch 0, contém array de mascaras candidatas
    const maskData = masks[0];
    if (!maskData || maskData.length === 0) {
        _disposeTensors(outputs, masks, inputs);
        return null;
    }

    const binaryMask = _selectAndBinarizeMask(maskData, outputs, maskThreshold, _imageWidth, _imageHeight);

    // Dispose tensors - libera memoria WASM/WebGL imediatamente
    _disposeTensors(outputs, masks, inputs);

    return _buildSegmentResult(binaryMask, family, extent, _imageWidth, _imageHeight);
}

// ----------------------------------------------------------------
// PUBLIC API - Multi-Point (positive + negative prompts)
// ----------------------------------------------------------------

/**
 * Segment with multiple point prompts (positive + negative).
 * Permite refinar a selecao: cliques positivos incluem, negativos excluem.
 *
 * @param {Array<{x: number, y: number, label: number}>} points
 *        label: 1 = include (foreground), 0 = exclude (background)
 * @param {any} extent
 * @param {{ family?: string, maskThreshold?: number }} [options={}]
 * @returns {Promise<SAMResult|null>}
 */
export async function segmentAtPoints(points: any, extent: any, options: any = {}) {
    if (!_model || !_processor || !_imageEmbeddings || !_rawImage) {
        throw new Error('Image not encoded. Call setImage() first.');
    }
    if (!points || points.length === 0) return null;

    const { family = 'building', maskThreshold = 0.0 } = options;

    // Formatar pontos: [[[x1,y1], [x2,y2], ...]]
    // Labels: [[1, 0, 1, ...]]
    const inputPoints = [
        points.map((p: any) => [_clampCoord(p.x, _imageWidth - 1), _clampCoord(p.y, _imageHeight - 1)]),
    ];
    const inputLabels = [points.map((p: any) => p.label)];

    const inputs = await _processor(_rawImage, {
        input_points: inputPoints,
        input_labels: inputLabels,
    });

    const outputs = await _model({
        ...inputs,
        ..._imageEmbeddings,
    });

    const masks = await _processor.post_process_masks(
        outputs.pred_masks,
        inputs.original_sizes,
        inputs.reshaped_input_sizes,
    );

    const maskData = masks[0];
    if (!maskData || maskData.length === 0) {
        _disposeTensors(outputs, masks, inputs);
        return null;
    }

    const binaryMask = _selectAndBinarizeMask(maskData, outputs, maskThreshold, _imageWidth, _imageHeight);

    _disposeTensors(outputs, masks, inputs);

    return _buildSegmentResult(binaryMask, family, extent, _imageWidth, _imageHeight);
}

// ----------------------------------------------------------------
// PUBLIC API - Status
// ----------------------------------------------------------------

/**
 * Check SAM model and image encoding status.
 * @returns {{ modelLoaded: boolean, imageEncoded: boolean, modelSize: string, imageWidth: number, imageHeight: number }}
 */
export function getSAMStatus() {
    return {
        modelLoaded: _model !== null && _processor !== null,
        imageEncoded: _imageEmbeddings !== null,
        modelSize: '~50 MB',
        imageWidth: _imageWidth,
        imageHeight: _imageHeight,
    };
}

/**
 * Get internal model state for shared use by samAutoMask.js.
 * Retorna objeto congelado (read-only) para evitar mutacao acidental.
 * samAutoMask reutiliza o singleton - sem download adicional.
 *
 * @returns {{ model: any, processor: any, transformers: any, imageEmbeddings: any, rawImage: any, imageWidth: number, imageHeight: number } | null}
 */
export function getModelState() {
    if (!_model || !_processor) return null;
    return Object.freeze({
        model: _model,
        processor: _processor,
        transformers: _transformers,
        imageEmbeddings: _imageEmbeddings,
        rawImage: _rawImage,
        imageWidth: _imageWidth,
        imageHeight: _imageHeight,
    });
}

/**
 * Clear cached image embeddings (free memory).
 * Chamado quando usuario muda de imagem ou fecha o modal.
 */
export function clearImageCache() {
    _imageEmbeddings = null;
    _rawImage = null;
    _currentImageUrl = null;
    _imageWidth = 0;
    _imageHeight = 0;
}

// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------

function _notify(
    /** @type {((status: { message: string, progress: number }) => void) | undefined} */ onProgress: any,
    /** @type {string} */ message: any,
    /** @type {number} */ progress: any,
) {
    onProgress?.({ message, progress });
}

/**
 * Dispose Transformers.js tensors to free WASM/WebGL memory.
 * Chamado apos converter mascaras para Uint8Array - tensores nao sao
 * mais necessarios. Sem dispose, cada segmentAtPoint() vazaria ~1 MB.
 *
 * @param {{ pred_masks?: any, iou_scores?: any }} outputs - model() output (pred_masks, iou_scores)
 * @param {Array<Array<any>>} tensor - post_process_masks output
 * @param {{ pixel_values?: any }} inputs - processor() output (pixel_values)
 */
function _safeDisposeTensor(tensor: any) {
    tensor?.dispose?.();
}

function _disposeMaskSet(maskSet: any) {
    if (!maskSet) return;
    for (const m of maskSet) {
        _safeDisposeTensor(m);
    }
}

function _disposeTensors(outputs: any, masks: any, inputs: any) {
    try {
        _safeDisposeTensor(outputs?.pred_masks);
        _safeDisposeTensor(outputs?.iou_scores);
        if (masks) {
            for (const maskSet of masks) {
                _disposeMaskSet(maskSet);
            }
        }
        _safeDisposeTensor(inputs?.pixel_values);
    } catch (e) {
        console.debug('[samInteractive] dispose:', (e as any)?.message || e);
        /* Some backends may not support dispose — safe to ignore */
    }
}

function _clampCoord(value: number, max: number): number {
    return Math.max(0, Math.min(max, Math.round(value)));
}

function _selectBestMaskIndex(outputs: any): number {
    if (!outputs?.iou_scores) return 0;
    const iouData = outputs.iou_scores.data;
    if (!iouData || !iouData.length) return 0;
    let bestMaskIdx = 0;
    let bestIou = -Infinity;
    for (let i = 0; i < iouData.length; i++) {
        if (iouData[i] > bestIou) {
            bestIou = iouData[i];
            bestMaskIdx = i;
        }
    }
    return bestMaskIdx;
}

function _binarizeMaskTensor(maskTensor: any, threshold: number, size: number): Uint8Array {
    const binaryMask = new Uint8Array(size);
    if (!maskTensor?.data) return binaryMask;
    const rawData = maskTensor.data;
    for (let i = 0; i < rawData.length && i < binaryMask.length; i++) {
        binaryMask[i] = rawData[i] > threshold ? 255 : 0;
    }
    return binaryMask;
}

function _selectAndBinarizeMask(
    maskData: any,
    outputs: any,
    maskThreshold: number,
    W: number,
    H: number,
): Uint8Array {
    const bestMaskIdx = _selectBestMaskIndex(outputs);
    const maskTensor = maskData[bestMaskIdx];
    return _binarizeMaskTensor(maskTensor, maskThreshold, W * H);
}

function _buildSegmentResult(
    binaryMask: Uint8Array,
    family: string,
    extent: any,
    W: number,
    H: number,
): { mask: Uint8Array; contour: any; processed: any; maskWidth: number; maskHeight: number } | null {
    const contour = largestContour(binaryMask, W, H);
    if (!contour || contour.length < 3) return null;
    const processed = antiAmebaSingle(binaryMask, family, extent, W, H);
    return { mask: binaryMask, contour, processed, maskWidth: W, maskHeight: H };
}
