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
   AERIAL ANALYZER — Orchestrator for image recognition
   ================================================================

   Modulo orquestrador que coordena os dois metodos de reconhecimento
   de imagem aerea: visao por IA (LLM) e analise algoritmica (cores).

   Exporta funcoes para ambos os caminhos e utilitarios de imagem.

   ================================================================ */

import { analyzeByColor } from './colorAnalysis.js';
import { buildVisionPrompt, buildUserMessage, parseVisionResponse } from './visionPrompt.js';
import { sendMessage, hasApiKey } from '../llm/client.js';

// Re-export ML detection - SegFormer-B0 semantic segmentation (~5 MB)
// Replaces OWL-ViT (155 MB, bounding-box only) with per-pixel ADE20K labels
export { analyzeWithSegFormer as analyzeWithML, isSegFormerLoaded as isMLModelLoaded } from './segformerDetector.js';
// Re-export Universal Vectorization Engine - OpenCV.js pipeline
// Converte mascara semantica em GeoJSON georreferenciado com hierarquia
export { vectorize } from './vectorization/engine.js';
// Re-export SLIC Superpixel Engine - Classic segmentation por cor+espacial
export { analyzeWithSLIC } from './classicSegmentation.js';
// Re-export YOLOS Object Detector - Bounding box detection para objetos discretos (~25 MB)
export { analyzeWithYOLOS, isYOLOSLoaded } from './objectDetector.js';
// Re-export SAM Interactive - Click-to-segment via Segment Anything (~50 MB)
export {
    loadSAM,
    setImage as setSAMImage,
    segmentAtPoint,
    segmentAtPoints,
    getSAMStatus,
    clearImageCache as clearSAMCache,
    selectSAMModel,
    getSAMModels,
} from './samInteractive.js';
// Re-export Anti-Ameba Pipeline - Post-processing for AI masks
export { antiAmeba, antiAmebaSingle, antiAmebaBatch } from './postprocess/index.js';
// Re-export SAM Auto-Mask Generator - automatic segmentation inspired by segment-geospatial
export { generateAutoMasks, autoMasksToFeatures } from './samAutoMask.js';
// Re-export CLIP Classifier - text-prompted zero-shot segmentation via CLIP+SAM
export { loadCLIP, segmentByText, getCLIPStatus } from './clipClassifier.js';
// Re-export Tile Segmentation - map tile-based segmentation pipeline
export { segmentFromTiles } from './tileSegmentation.js';
// Re-export Instance Segmentation - YOLOS+SAM hybrid + MaskFormer native
export { detectInstances, detectInstancesNative, isMaskFormerLoaded } from './instanceSegmentation.js';
// Re-export Change Detection - temporal comparison of aerial images
export { detectChanges, computeImageIndices, CHANGE_TYPES } from './changeDetector.js';
// Re-export Scene Classification - image-level land cover classification
export { classifyScene, classifySceneRuleBased, isClassifierLoaded, SCENE_CLASSES } from './sceneClassifier.js';
// Re-export Super-Resolution - image enhancement for aerial imagery
export { enhanceImage, enhanceCanvas, isSRModelLoaded } from './superResolution.js';
// Re-export Spectral Regression - vNDVI, SAVI, biomass estimation
export {
    computeVNDVI,
    computeSAVI,
    computeWaterIndex,
    trainRegressionModel,
    predictWithModel,
    renderIndexOverlay,
} from './spectralRegression.js';
// Re-export Image Embeddings - satellite tile similarity search
export {
    computeHandcraftedEmbedding,
    computeCLIPEmbedding,
    searchByText,
    searchSimilarTiles,
    storeTileEmbedding,
    cosineSimilarity,
    getEmbeddingStats,
} from './imageEmbeddings.js';

// ----------------------------------------------------------------
// AI VISION ANALYSIS
// Envia imagem para LLM com suporte a visao e interpreta resposta
// ----------------------------------------------------------------

/**
 * Analyze aerial image using AI vision (LLM).
 * Requer API key configurada e modelo com suporte a visao.
 */
export async function analyzeWithAI(
    imageDataUrl: string,
    extent: any,
    annotations: any[] = [],
): Promise<any[]> {
    if (!hasApiKey()) {
        throw new Error('API key not configured. Configure in AI > Settings.');
    }
    const systemPrompt = buildVisionPrompt(extent, annotations);
    const userMessage = buildUserMessage(annotations);
    const result: any = await sendMessage(systemPrompt, userMessage, {
        image: imageDataUrl,
        maxTokens: 4000,
        temperature: 0.2,
    });
    return parseVisionResponse(result.content, extent);
}

// ----------------------------------------------------------------
// ALGORITHMIC ANALYSIS
// Analise por segmentacao de cores no canvas (sem API)
// ----------------------------------------------------------------

/**
 * Analyze aerial image using color segmentation algorithm.
 * Nao requer API key - usa processamento local no canvas.
 */
export async function analyzeWithAlgorithm(
    imageDataUrl: string,
    extent: any,
    calibration: any = null,
    annotations: any[] = [],
    options: any = {},
): Promise<any[]> {
    return analyzeByColor(imageDataUrl, extent, calibration, annotations, options) as any;
}

// ----------------------------------------------------------------
// IMAGE UTILITIES
// Utilitarios para carregar e redimensionar imagens
// ----------------------------------------------------------------

/**
 * Load image from URL and convert to base64 data URL.
 * Carrega imagem via fetch (CORS) e converte para dataURL.
 */
export async function loadImageAsDataUrl(url: string, maxSize: number = 1024): Promise<string> {
    // Fetch as blob to handle CORS
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            // Resize if necessary
            let w = img.width,
                h = img.height;
            if (w > maxSize || h > maxSize) {
                const scale = maxSize / Math.max(w, h);
                w = Math.round(w * scale);
                h = Math.round(h * scale);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            // Liberar bitmap do canvas ephemero para evitar memory leak
            canvas.width = 0;
            canvas.height = 0;
            resolve(dataUrl);
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('CORS blocked or invalid image URL. Upload the image manually.'));
        };
        img.src = objectUrl;
    });
}

/**
 * Read a File object as base64 data URL with optional resize.
 * Le arquivo do input file e converte para dataURL.
 */
export async function readFileAsDataUrl(file: File, maxSize: number = 1024): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                let w = img.width,
                    h = img.height;
                if (w > maxSize || h > maxSize) {
                    const scale = maxSize / Math.max(w, h);
                    w = Math.round(w * scale);
                    h = Math.round(h * scale);
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                // Liberar bitmap do canvas ephemero para evitar memory leak
                canvas.width = 0;
                canvas.height = 0;
                resolve(dataUrl);
            };
            img.onerror = () => reject(new Error('Invalid image file'));
            img.src = reader.result as string;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}
