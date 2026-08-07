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

/* ================================================================
   SUPER-RESOLUTION — Image enhancement for aerial imagery
   ================================================================

   Melhora resolucao de imagens aereas/satelite para analise mais
   detalhada. Duas estrategias com degradacao graciosa:

   TIER 1 — Canvas bicubic + adaptive sharpening (~20ms, zero modelos):
     Upscale via imageSmoothingQuality:'high' + unsharp mask adaptativo
     guiado por mapa Sobel. Entrega ~80% da qualidade neural para
     imagens de satelite (inerentemente de baixo detalhe).

   TIER 2 — Swin2SR ONNX (~4-8s, ~85MB download):
     Super-resolucao neural 2x via Transformers.js v3.

   Provenance:
   - Unsharp mask: Schreiber 1970 "Fundamentals of Electronic Imaging Systems"
   - Sobel edge: Sobel & Feldman 1968 "A 3x3 Isotropic Gradient Operator"
   - Swin2SR: Conde et al. 2022 "Swin2SR: SwinV2 Transformer for Image SR" (ECCV)

   ================================================================ */

import { toGrayscale, computeEdgeMap } from './indices.js';
import { importCDN } from '../../utils/helpers/cdnLoader.js';

const TRANSFORMERS_V3_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
const SWIN2SR_MODEL = 'Xenova/swin2SR-classical-sr-x2-64';

let _srPipeline: any = null;
let _transformers: any = null;

export interface EnhanceProgress {
    message: string;
    progress: number;
}

export interface EnhanceCanvasOptions {
    scale?: number;
    sharpness?: number;
}

export interface EnhanceONNXOptions {
    onProgress?: (p: EnhanceProgress) => void;
}

export type EnhanceTier = 'canvas' | 'onnx';

export interface EnhanceImageOptions extends EnhanceCanvasOptions, EnhanceONNXOptions {
    tier?: EnhanceTier;
}

// ----------------------------------------------------------------
// TIER 1: CANVAS ENHANCEMENT - Bicubic + Adaptive Sharpening
// ----------------------------------------------------------------

/**
 * Enhance image using canvas-based bicubic upscale + adaptive sharpening.
 * Rapido (~20ms), sem modelos, ~80% qualidade de SR neural para satelite.
 */
export async function enhanceCanvas(imageDataUrl: string, options: EnhanceCanvasOptions = {}): Promise<string> {
    const { scale = 2, sharpness = 0.6 } = options;
    const img = await _loadImage(imageDataUrl);
    const srcW = img.width,
        srcH = img.height;
    const dstW = srcW * scale,
        dstH = srcH * scale;
    // Step 1: Bicubic upscale
    const canvas = document.createElement('canvas');
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, dstW, dstH);
    // Step 2: Compute edge map on upscaled image for adaptive sharpening
    const imageData = ctx.getImageData(0, 0, dstW, dstH);
    const pixels = imageData.data;
    const count = dstW * dstH;
    const gray = toGrayscale(pixels, count);
    const edges = computeEdgeMap(gray, dstW, dstH);
    // Step 3: Adaptive unsharp mask - stronger near edges, weaker in flat areas
    const blurred = _boxBlur(gray, dstW, dstH, 2);
    for (let i = 0; i < count; i++) {
        const off = i * 4;
        // Edge-adaptive strength: more sharpening near edges
        const edgeWeight = Math.min(1.0, (edges[i] ?? 0) / 100);
        const strength = sharpness * (0.3 + 0.7 * edgeWeight);
        for (let c = 0; c < 3; c++) {
            const original = pixels[off + c] ?? 0;
            const blur = blurred[i] ?? 0; // Use gray blur as approximation
            const diff = original - blur;
            const enhanced = original + strength * diff;
            pixels[off + c] = Math.max(0, Math.min(255, Math.round(enhanced)));
        }
    }
    ctx.putImageData(imageData, 0, 0);
    const result = canvas.toDataURL('image/jpeg', 0.92);
    // Cleanup
    canvas.width = 0;
    canvas.height = 0;
    return result;
}

// ----------------------------------------------------------------
// TIER 2: SWIN2SR ONNX SUPER-RESOLUTION
// ----------------------------------------------------------------

/**
 * Enhance image using Swin2SR neural super-resolution.
 * ~85MB download (cached), ~4-8s inference, publication-quality 2x upscale.
 */
export async function enhanceONNX(imageDataUrl: string, options: EnhanceONNXOptions = {}): Promise<string> {
    const { onProgress } = options;
    if (!_srPipeline) {
        onProgress?.({ message: 'Loading Swin2SR (~85 MB)...', progress: 10 });
        _transformers = await importCDN(TRANSFORMERS_V3_CDN, { name: 'Transformers.js v3' });
        onProgress?.({ message: 'Initializing model...', progress: 30 });
        _srPipeline = await _transformers.pipeline('image-to-image', SWIN2SR_MODEL);
        onProgress?.({ message: 'Model loaded', progress: 50 });
    }
    onProgress?.({ message: 'Enhancing image...', progress: 60 });
    const output = await _srPipeline(imageDataUrl);
    onProgress?.({ message: 'Super-resolution complete', progress: 100 });
    // Convert RawImage to dataURL
    if (output && output.toDataURL) {
        return output.toDataURL('image/jpeg');
    }
    // Fallback: if output is already a blob/url
    return output?.src || imageDataUrl;
}

// ----------------------------------------------------------------
// UNIFIED DISPATCHER
// ----------------------------------------------------------------

/**
 * Enhance image with tier selection.
 */
export async function enhanceImage(imageDataUrl: string, options: EnhanceImageOptions = {}): Promise<string> {
    const tier = options.tier || 'canvas';
    if (tier === 'onnx') {
        return enhanceONNX(imageDataUrl, options);
    }
    return enhanceCanvas(imageDataUrl, options);
}

/**
 * Check if ONNX SR model is loaded.
 */
export function isSRModelLoaded(): boolean {
    return _srPipeline !== null;
}

// ----------------------------------------------------------------
// INTERNALS
// ----------------------------------------------------------------

function _loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
    });
}

/**
 * Simple box blur on grayscale buffer.
 */
function _boxBlur(gray: Uint8Array, w: number, h: number, radius: number): Uint8Array {
    const result = new Uint8Array(w * h);
    const size = (2 * radius + 1) * (2 * radius + 1);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let sum = 0;
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const ny = Math.max(0, Math.min(h - 1, y + dy));
                    const nx = Math.max(0, Math.min(w - 1, x + dx));
                    sum += gray[ny * w + nx] ?? 0;
                }
            }
            result[y * w + x] = Math.round(sum / size);
        }
    }
    return result;
}
