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
   USER CLASSIFIER — Interactive neural network for aerial images
   ================================================================

   Wrapper sobre SimpleNN especializado em classificacao de pixels
   de imagens aereas. O usuario pinta regioes na imagem, a rede
   aprende os padroes de cor, e classifica a imagem inteira.

   Arquitetura: 6 inputs (R,G,B,H,S,L) → 16 hidden (ReLU) → 7 output (softmax)
   Delega toda a matematica para SimpleNN (nn/network.js)
   Registra-se no NN Manager (nn/manager.js) como 'aerial-classifier'

   ================================================================ */
import { ensureNN, getNetwork, registerNetwork, persistNetwork } from '../nn/manager.js';
import { findBlobs, extractContour, blobToFeature, morphClose } from './colorAnalysis.js';
import {
    AERIAL_CLASSIFIER_FAMILIES,
    AERIAL_CLASSIFIER_NN_ID,
    exportAerialClassifierState,
    getAerialClassifierStrokes,
    setAerialClassifierStrokes,
} from '../classifier/aerialClassifierState.js';
import { isEphemeral } from '../../utils/storage/storageMonitor.js';
import { idbSet, idbGetWithLegacy } from '../../utils/storage/idbStore.js';
import { showToast } from '../../utils/ui/toast.js';
// ----------------------------------------------------------------
// FAMILY INDEX MAPPING
// Indice numerico para cada familia na camada de saida da rede
// ----------------------------------------------------------------
const FAMILIES = [...AERIAL_CLASSIFIER_FAMILIES];
/** @type {Record<string, number>} Map family name → output index */
const FAMILY_TO_IDX: Record<string, any> = {};
FAMILIES.forEach((f: any, i: any) => {
    FAMILY_TO_IDX[f] = i;
});
/** Map output index → grid category (for blob pipeline compatibility) */
const IDX_TO_GRID: Record<number, number> = {
    0: 4, // building → building_dark
    1: 4, // tank → building_dark (reclassified via shape)
    2: 1, // lake → water
    3: 1, // river → water (reclassified via aspect)
    4: 2, // habitat → vegetation
    5: 4, // well → building_dark
    6: 5, // marker → infrastructure
};
// ----------------------------------------------------------------
// SIMPLENN INSTANCE - Delegated to generic NN via manager
// Instancia da rede neural registrada no gerenciador central
// ----------------------------------------------------------------
const NN_ID = AERIAL_CLASSIFIER_NN_ID;
const NN_CONFIG = {
    inputSize: 6,
    hiddenSize: 16,
    outputSize: FAMILIES.length,
    classNames: FAMILIES,
};
/**
 * Get or create the aerial classifier network instance.
 * Obtem ou cria a instancia da rede neural do classificador aereo.
 * @returns {any}
 */
function _getNN() {
    let nn = getNetwork(NN_ID);
    if (!nn) {
        nn = registerNetwork(NN_ID, NN_CONFIG, {
            description: 'Aerial image pixel classifier',
        });
    }
    return nn;
}
// ----------------------------------------------------------------
// RGB ↔ HSL CONVERSION (local copy to avoid circular deps)
// ----------------------------------------------------------------
/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {[number, number, number]}
 */
function rgbToHsl(r: any, g: any, b: any): [number, number, number] {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min)
        return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r)
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g)
        h = ((b - r) / d + 2) / 6;
    else
        h = ((r - g) / d + 4) / 6;
    return [h, s, l];
}
/**
 * Extract 6 normalized features from RGB pixel.
 * R, G, B normalizados (0-1) + H, S, L normalizados (0-1).
 * @param {number} r - 0-255
 * @param {number} g - 0-255
 * @param {number} b - 0-255
 * @returns {Float32Array} [r, g, b, h, s, l]
 */
function pixelFeatures(r: any, g: any, b: any) {
    const [h, s, l] = rgbToHsl(r, g, b);
    return new Float32Array([r / 255, g / 255, b / 255, h, s, l]);
}
// ----------------------------------------------------------------
// PUBLIC API - Delegates to SimpleNN instance
// API publica mantida identica para compatibilidade com aerial.js
// ----------------------------------------------------------------
/**
 * Initialize or reset network weights.
 * Xavier initialization para convergencia rapida.
 */
export function resetNetwork() {
    _getNN().reset();
}
/** Check if network has been trained */
export function isNetworkTrained() {
    return _getNN().trained;
}
/**
 * Train the neural network on labeled pixel data.
 * SGD com mini-batch, cross-entropy loss, learning rate decay.
 *
 * @param {Array<{input: Float32Array, target: number}>} data - Training samples
 * @param {Object} [options]
 * @param {number} [options.epochs=80] - Number of training epochs
 * @param {number} [options.lr=0.02] - Initial learning rate
 * @param {number} [options.batchSize=32] - Mini-batch size
 * @param {Function} [options.onProgress] - Callback: { epoch, loss, accuracy }
 * @returns {{ finalLoss: number, accuracy: number }}
 */
export function trainNetwork(data: any, options: any = {}) {
    return _getNN().train(data, options);
}
// ----------------------------------------------------------------
// CLASSIFICATION - Classify image using trained network
// Classifica imagem inteira pixel a pixel com a rede treinada
// ----------------------------------------------------------------
/**
 * Classify aerial image using the trained neural network.
 * Gera grid de categorias e usa pipeline de blobs para produzir features.
 *
 * @param {string} imageDataUrl - Base64 data URL
 * @param {Object} extent - { minX, maxX, minZ, maxZ }
 * @param {Function} [onProgress?] - Progress callback
 * @returns {Promise<any[]>} DetectedFeature[]
 */
export async function classifyWithUserNN(imageDataUrl: any, extent: any, onProgress?: any) {
    // LOADING-PERF GAP-2: NN é lazy. Garante o registry restaurado antes de obter a
    // rede (senão _getNN criaria uma fresh untrained, perdendo o treino salvo no IDB).
    await ensureNN();
    const nn = _getNN();
    if (!nn.trained) {
        throw new Error('Network not trained. Paint regions and click Train first.');
    }
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            try {
                const SIZE = 512;
                const canvas = document.createElement('canvas');
                canvas.width = SIZE;
                canvas.height = SIZE;
                const ctx = canvas.getContext("2d")!;
                ctx.drawImage(img, 0, 0, SIZE, SIZE);
                const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
                const pixels = imageData.data;
                const total = SIZE * SIZE;
                if (onProgress)
                    onProgress({ message: 'Classifying pixels...', progress: -1 });
                // Classify every pixel
                const grid = new Uint8Array(total);
                for (let i = 0; i < total; i++) {
                    const off = i * 4;
                    const feat = pixelFeatures(pixels[off], pixels[off + 1], pixels[off + 2]);
                    const { output } = nn.forward(feat);
                    // Find winning class
                    let maxIdx = 0, maxVal = output[0];
                    for (let k = 1; k < FAMILIES.length; k++) {
                        if (output[k] > maxVal) {
                            maxVal = output[k];
                            maxIdx = k;
                        }
                    }
                    // Only classify if confidence above threshold
                    if (maxVal > 0.4) {
                        grid[i] = IDX_TO_GRID[maxIdx] || 0;
                    }
                }
                if (onProgress)
                    onProgress({ message: 'Finding features...', progress: 50 });
                // Morphological close on buildings
                const buildingSet = new Set([4]); // building_dark
                const closedGrid = morphClose(grid, SIZE, SIZE, buildingSet);
                // Find blobs + extract contours
                const { blobs, blobGrid } = findBlobs(closedGrid, SIZE, SIZE);
                blobs.forEach((blob, i: number) => {
                    blob.contour = extractContour(blobGrid, i + 1, blob, SIZE, SIZE);
                });
                // Convert to features
                const features = blobs
                    .map((b: any) => {
                    const f = blobToFeature(b, SIZE, SIZE, extent, total);
                    // blobToFeature (colorAnalysis.ts) infers a return union where one
                    // branch lacks sourceMethod; widen locally to allow the assignment.
                    if (f)
                        (f as typeof f & { sourceMethod?: string }).sourceMethod = 'usernn';
                    return f;
                })
                    .filter((f: any) => f !== null);
                features.sort((a: any, b: any) => b.confidence - a.confidence);
                resolve(features.slice(0, 30));
            }
            catch (err: any) {
                reject(err);
            }
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = imageDataUrl;
    });
}
// ----------------------------------------------------------------
// TRAINING DATA EXTRACTION - Build samples from labeled grid
// Extrai amostras de treino da imagem usando o grid de labels
// ----------------------------------------------------------------
/**
 * Extract training samples from image pixels at labeled positions.
 * Para cada pixel rotulado, extrai features RGB+HSL e indice da familia.
 *
 * @param {string} imageDataUrl - Base64 data URL
 * @param {Uint8Array} labelGrid - 512x512 grid with family indices (0=unlabeled, 1-7=family)
 * @returns {Promise<Array<{input: Float32Array, target: number}>>}
 */
export async function extractTrainingData(imageDataUrl: any, labelGrid: any) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            try {
                const SIZE = 512;
                const canvas = document.createElement('canvas');
                canvas.width = SIZE;
                canvas.height = SIZE;
                const ctx = canvas.getContext("2d")!;
                ctx.drawImage(img, 0, 0, SIZE, SIZE);
                const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
                const pixels = imageData.data;
                const total = SIZE * SIZE;
                const samples = [];
                for (let i = 0; i < total; i++) {
                    const label = labelGrid[i];
                    if (label === 0)
                        continue; // Unlabeled
                    const off = i * 4;
                    const input = pixelFeatures(pixels[off], pixels[off + 1], pixels[off + 2]);
                    samples.push({ input, target: label - 1 }); // 0-indexed
                }
                resolve(samples);
            }
            catch (err: any) {
                reject(err);
            }
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = imageDataUrl;
    });
}
// ----------------------------------------------------------------
// PERSISTENCE - Export/import network state for model storage
// Salva pesos da rede + dados de pintura na chave do modelo
// ----------------------------------------------------------------
const STORAGE_KEY = 'ecbyts-classifier';
/**
 * Store paint strokes in the module for export.
 * Chamado pelo handler ao alterar strokes para manter sincronia.
 * @param {any[]} strokes
 */
export function setClassifierStrokes(strokes: any) {
    setAerialClassifierStrokes(strokes);
}
/**
 * Get stored paint strokes.
 * @returns {any[]}
 */
export function getClassifierStrokes() {
    return getAerialClassifierStrokes();
}
/**
 * Export classifier state for model persistence.
 * Inclui pesos da rede e strokes de pintura do usuario.
 * Formato v1.0 legado para compatibilidade com modelos existentes.
 *
 * @param {any[]} [paintStrokes] - Optional override; uses stored strokes if omitted
 * @returns {any} Serializable classifier data
 */
export function exportClassifier(paintStrokes: any) {
    return exportAerialClassifierState({ getNetwork, paintStrokes });
}
/**
 * Import classifier state from model data.
 * Restaura pesos da rede treinada via SimpleNN.fromJSON().
 *
 * @param {any} data - Exported classifier data
 * @returns {any[]} Restored paint strokes
 */
export function importClassifier(data: any) {
    if (!data || data.version !== '1.0')
        return [];
    if (data.weights && data.trained) {
        const nn = _getNN();
        // Restore from v1.0 format - SimpleNN.fromJSON handles conversion
        nn.fromJSON({
            version: '1.0',
            trained: true,
            weights: data.weights,
        });
    }
    return data.strokes || [];
}
/**
 * Persist classifier to localStorage.
 * Salva no formato legado + atualiza NN manager.
 * @param {any[]} paintStrokes
 */
export async function persistClassifier(paintStrokes: any) {
    if (isEphemeral())
        return;
    const data = exportClassifier(paintStrokes);
    if (data) {
        const ok = await idbSet(STORAGE_KEY, data);
        if (!ok)
            showToast('Storage full. Classifier data may not persist.', 'warning');
    }
    // Also persist via NN manager
    persistNetwork(NN_ID);
}
/**
 * Load classifier from localStorage.
 * @returns {Promise<any[]>} Paint strokes
 */
export async function loadClassifier() {
    try {
        // LOADING-PERF GAP-2: garante o NN registry antes de _getNN()/fromJSON.
        await ensureNN();
        const data = await idbGetWithLegacy(STORAGE_KEY);
        if (!data)
            return [];
        return importClassifier(data);
    }
    catch {
        return [];
    }
}
/** Get family names array (for UI) */
export function getClassifierFamilies() {
    return FAMILIES;
}
/**
 * Get family index from name
 * @param {string} family
 */
export function getFamilyIndex(family: any) {
    return FAMILY_TO_IDX[family] ?? -1;
}
