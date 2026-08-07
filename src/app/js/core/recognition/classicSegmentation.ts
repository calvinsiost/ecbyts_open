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
   CLASSIC SEGMENTATION — SLIC Superpixel Engine
   ================================================================

   Motor de segmentacao classica baseado no algoritmo SLIC (Simple
   Linear Iterative Clustering). Agrupa pixels em superpixels
   compactos por proximidade espacial e de cor no espaco CIELAB.

   Diferente do colorAnalysis.js que classifica pixels individualmente
   por faixas HSL, o SLIC agrupa vizinhancas coerentes antes de
   classificar. Isso produz regioes mais homogeneas e menos ruidosas,
   especialmente para biomas grandes (florestas, corpos d'agua).

   Pipeline:
   1. Converter imagem para CIELAB (perceptualmente uniforme)
   2. Inicializar K centros em grid regular
   3. 10 iteracoes: atribuir pixels → atualizar centros
   4. Pos-processamento: BFS conectividade
   5. Classificar superpixels por cor media HSL/ExG
   6. Gerar category grid compativel com blob pipeline

   Parametros expostos:
   - numSuperpixels (default 200): quantidade alvo de clusters
   - compactness (default 10, range 1-40): peso espacial vs cor

   Performance: ~300ms em 512x512 com K=200.

   ================================================================ */

import { findBlobs, blobToFeature, morphClose, stampAnnotations } from './colorAnalysis.js';

// ----------------------------------------------------------------
// CIELAB CONVERSION - RGB → XYZ → Lab
// Espaco de cor perceptualmente uniforme para distancia de cor
// ----------------------------------------------------------------

/**
 * Convert sRGB to CIELAB via XYZ intermediate.
 * Usa iluminante D65 (luz do dia padrao).
 * Retorna [L, a, b] onde L=[0,100], a,b=[-128,127].
 *
 * @param {number} r - Red [0, 255]
 * @param {number} g - Green [0, 255]
 * @param {number} b - Blue [0, 255]
 * @returns {[number, number, number]} - [L, a, b]
 */
/** @param {number} r @param {number} g @param {number} b */
function rgbToLab(r: any, g: any, b: any) {
    // sRGB → linear RGB
    let rl = r / 255;
    let gl = g / 255;
    let bl = b / 255;
    rl = rl > 0.04045 ? Math.pow((rl + 0.055) / 1.055, 2.4) : rl / 12.92;
    gl = gl > 0.04045 ? Math.pow((gl + 0.055) / 1.055, 2.4) : gl / 12.92;
    bl = bl > 0.04045 ? Math.pow((bl + 0.055) / 1.055, 2.4) : bl / 12.92;

    // Linear RGB → XYZ (D65 illuminant)
    let x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
    let y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
    let z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) / 1.08883;

    // XYZ → Lab
    const epsilon = 0.008856;
    const kappa = 903.3;
    x = x > epsilon ? Math.cbrt(x) : (kappa * x + 16) / 116;
    y = y > epsilon ? Math.cbrt(y) : (kappa * y + 16) / 116;
    z = z > epsilon ? Math.cbrt(z) : (kappa * z + 16) / 116;

    return [
        116 * y - 16, // L: [0, 100]
        500 * (x - y), // a: [-128, 127]
        200 * (y - z), // b: [-128, 127]
    ];
}

// ----------------------------------------------------------------
// RGB → HSL - Para classificacao pos-SLIC
// ----------------------------------------------------------------

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 */
function rgbToHsl(r: any, g: any, b: any) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;
    if (d < 1e-6) return [0, 0, l * 100];
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [h * 360, s * 100, l * 100];
}

// ----------------------------------------------------------------
// SLIC CORE - Simple Linear Iterative Clustering
// ----------------------------------------------------------------

/**
 * SLIC superpixel segmentation.
 * Agrupa pixels em superpixels compactos por proximidade espacial + cor CIELAB.
 *
 * @param {ImageData} imageData - Canvas image data (RGBA)
 * @param {number} [numSuperpixels=200] - Target superpixel count
 * @param {number} [compactness=10] - Spatial vs color weight (1-40)
 * @returns {{ labels: Int32Array, count: number }}
 */
/**
 * @param {ImageData} imageData
 * @param {number} [numSuperpixels=200]
 * @param {number} [compactness=10]
 */
export function slicSegmentation(imageData: any, numSuperpixels = 200, compactness = 10) {
    const { width: W, height: H, data } = imageData;
    const N = W * H;

    // Converter imagem para CIELAB (3 canais em arrays separados)
    const labL = new Float32Array(N);
    const labA = new Float32Array(N);
    const labB = new Float32Array(N);

    for (let i = 0; i < N; i++) {
        const base = i * 4;
        const [l, a, b] = rgbToLab(data[base]!, data[base + 1]!, data[base + 2]!);
        labL[i] = l!;
        labA[i] = a!;
        labB[i] = b!;
    }

    // Grid spacing
    const S = Math.round(Math.sqrt(N / numSuperpixels));
    const _K = Math.max(1, Math.round((W / S) * (H / S)));

    // Inicializar centros em grid regular
    const centers = []; // { x, y, l, a, b }
    for (let yc = Math.round(S / 2); yc < H; yc += S) {
        for (let xc = Math.round(S / 2); xc < W; xc += S) {
            // Mover para posicao de menor gradiente em 3x3
            const bestPos = _lowestGradient(labL, W, H, xc, yc);
            const idx = bestPos.y * W + bestPos.x;
            centers.push({
                x: bestPos.x,
                y: bestPos.y,
                l: labL[idx],
                a: labA[idx],
                b: labB[idx],
            });
        }
    }

    const numCenters = centers.length;
    const labels = new Int32Array(N).fill(-1);
    const distances = new Float32Array(N).fill(Infinity);

    // Fator de escala: m^2 / S^2 para balancear cor e espaco
    const invSpatialFactor = (compactness * compactness) / (S * S);

    // Iteracoes SLIC (tipicamente 10 bastam para convergencia)
    const MAX_ITER = 10;
    for (let iter = 0; iter < MAX_ITER; iter++) {
        // Reset distances
        distances.fill(Infinity);

        // Para cada centro, buscar em janela 2S x 2S
        for (let k = 0; k < numCenters; k++) {
            const c = centers[k]!;
            const x0 = Math.max(0, Math.round(c.x!) - S);
            const x1 = Math.min(W - 1, Math.round(c.x!) + S);
            const y0 = Math.max(0, Math.round(c.y!) - S);
            const y1 = Math.min(H - 1, Math.round(c.y!) + S);

            for (let py = y0; py <= y1; py++) {
                for (let px = x0; px <= x1; px++) {
                    const idx = py * W + px;

                    // Distancia de cor (CIELAB euclidiana)
                    const dl = labL[idx]! - c.l!;
                    const da = labA[idx]! - c.a!;
                    const db = labB[idx]! - c.b!;
                    const dc2 = dl * dl + da * da + db * db;

                    // Distancia espacial
                    const dsx = px - c.x!;
                    const dsy = py - c.y!;
                    const ds2 = dsx * dsx + dsy * dsy;

                    // Distancia combinada: D = sqrt(dc^2 + (ds/S)^2 * m^2)
                    const D = dc2 + ds2 * invSpatialFactor;

                    if (D < distances[idx]!) {
                        distances[idx] = D;
                        labels[idx] = k;
                    }
                }
            }
        }

        // Atualizar centros como media dos pixels atribuidos
        const sums = new Float64Array(numCenters * 5); // x, y, l, a, b
        const counts = new Uint32Array(numCenters);

        for (let i = 0; i < N; i++) {
            const k = labels[i];
            if (k! < 0) continue;
            const base = k! * 5;
            sums[base]! += i % W; // x
            sums[base + 1]! += Math.floor(i / W); // y
            sums[base + 2]! += labL[i]!;
            sums[base + 3]! += labA[i]!;
            sums[base + 4]! += labB[i]!;
            counts[k!]!++;
        }

        let maxShift = 0;
        for (let k = 0; k < numCenters; k++) {
            if (counts[k] === 0) continue;
            const base = k * 5;
            const nx = sums[base]! / counts[k]!;
            const ny = sums[base + 1]! / counts[k]!;
            const shift = (nx - centers[k]!.x) ** 2 + (ny - centers[k]!.y) ** 2;
            if (shift > maxShift) maxShift = shift;

            centers[k]!.x = nx;
            centers[k]!.y = ny;
            centers[k]!.l = sums[base + 2]! / counts[k]!;
            centers[k]!.a = sums[base + 3]! / counts[k]!;
            centers[k]!.b = sums[base + 4]! / counts[k]!;
        }

        // Convergencia: centros se moveram menos de 1 pixel
        if (maxShift < 1) break;
    }

    // Pos-processamento: BFS para enforce conectividade
    _enforceConnectivity(labels, W, H, numCenters, Math.round(N / numCenters / 4));

    return { labels, count: numCenters };
}

// ----------------------------------------------------------------
// CLASSIFY SUPERPIXELS - Assign environmental category per cluster
// Classifica cada superpixel pela cor media HSL/ExG
// ----------------------------------------------------------------

/**
 * Classify each superpixel into environmental categories.
 * Computa cor media RGB de cada superpixel, converte para HSL, e
 * classifica usando as mesmas faixas de colorAnalysis.js.
 *
 * @param {ImageData} imageData
 * @param {Int32Array} labels - SLIC label map
 * @param {number} numSuperpixels - Number of clusters
 * @returns {Uint8Array} - Category grid (width x height), values 0-6
 */
/**
 * @param {ImageData} imageData
 * @param {Int32Array|number[]} labels
 * @param {number} numSuperpixels
 */
export function classifySuperpixels(imageData: any, labels: any, numSuperpixels: any) {
    const { width: W, height: H, data } = imageData;
    const N = W * H;

    // Acumular cor media por superpixel
    const sums = new Float64Array(numSuperpixels * 3); // R, G, B
    const counts = new Uint32Array(numSuperpixels);

    for (let i = 0; i < N; i++) {
        const k = labels[i];
        if (k < 0) continue;
        const pxBase = i * 4;
        const cBase = k * 3;
        sums[cBase] += data[pxBase];
        sums[cBase + 1] += data[pxBase + 1];
        sums[cBase + 2] += data[pxBase + 2];
        counts[k]!++;
    }

    // Classificar cada superpixel
    const spCategory = new Uint8Array(numSuperpixels); // 0=unclassified, 1-6

    for (let k = 0; k < numSuperpixels; k++) {
        if (counts[k] === 0) continue;
        const cBase = k * 3;
        const avgR = sums[cBase]! / counts[k]!;
        const avgG = sums[cBase + 1]! / counts[k]!;
        const avgB = sums[cBase + 2]! / counts[k]!;

        // Excess Green Index (vegetacao)
        const rn = avgR / 255;
        const gn = avgG / 255;
        const bn = avgB / 255;
        const exg = 2 * gn - rn - bn;

        // C3 Shadow Index
        const c3 = Math.atan2(avgB, Math.max(avgR, avgG));
        const lum = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;

        const [h, s, l] = rgbToHsl(Math.round(avgR), Math.round(avgG), Math.round(avgB));

        // Pipeline de classificacao (mesma ordem de colorAnalysis.js)
        // 1. Sombra
        if (c3 > 1.1 && lum < 40) {
            spCategory[k] = 0; // Sombra → sem categoria
            continue;
        }

        // 2. Vegetacao (ExG > 0.08)
        if (exg > 0.08) {
            spCategory[k] = 2; // vegetation
            continue;
        }

        // 3. Agua
        if (h! >= 170 && h! <= 260 && s! > 10 && l! >= 5 && l! <= 75) {
            spCategory[k] = 1; // water
            continue;
        }

        // 4. Building bright
        if (s! < 18 && l! > 70) {
            spCategory[k] = 4; // building_dark (merge bright→dark)
            continue;
        }

        // 5. Building dark
        if (s! < 18 && l! >= 12 && l! <= 55) {
            spCategory[k] = 4; // building_dark
            continue;
        }

        // 6. Infrastructure
        if (s! < 15 && l! > 48 && l! <= 72) {
            spCategory[k] = 5; // infrastructure
            continue;
        }

        // 7. Soil
        if (h! >= 15 && h! <= 55 && s! >= 10 && s! <= 55 && l! >= 15 && l! <= 68) {
            spCategory[k] = 6; // soil
            continue;
        }

        // Default: unclassified
        spCategory[k] = 0;
    }

    // Projetar categorias de volta no grid de pixels
    const grid = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
        const k = labels[i];
        if (k >= 0) grid[i] = spCategory[k]!;
    }

    return grid;
}

// ----------------------------------------------------------------
// FULL PIPELINE - SLIC → classify → blob → features
// Analise completa com saida compativel com analyzeByColor()
// ----------------------------------------------------------------

/**
 * Full classic segmentation pipeline with SLIC superpixels.
 * SLIC → classify → morphClose → findBlobs → blobToFeature.
 *
 * @param {string} imageDataUrl - Base64 data URL da imagem
 * @param {Object} extent - { minX, maxX, minZ, maxZ }
 * @param {Object} [options={}]
 * @param {number} [options.numSuperpixels=200] - Target superpixel count
 * @param {number} [options.compactness=10] - Spatial vs color weight (1-40)
 * @param {boolean} [options.returnGrid=false] - Return category grid
 * @param {Function} [onProgress] - Progress callback({ message, progress })
 * @param {any[]} [annotations] - User annotations
 * @returns {Promise<any[]|{ features: any[], grid: Uint8Array }>}
 */
export async function analyzeWithSLIC(imageDataUrl: any, extent: any, options: any = {}, onProgress: any, annotations = []) {
    const { numSuperpixels = 200, compactness = 10, returnGrid = false } = options;

    // Carregar imagem no canvas
    onProgress?.({ message: 'Loading image...', progress: 0 });
    const imageData: any = await _loadImageData(imageDataUrl);
    const { width: W, height: H } = imageData;

    // SLIC segmentation
    onProgress?.({ message: `SLIC segmentation (K=${numSuperpixels})...`, progress: 10 });
    const { labels, count } = slicSegmentation(imageData, numSuperpixels, compactness);

    // Classificar superpixels
    onProgress?.({ message: 'Classifying superpixels...', progress: 60 });
    const grid = classifySuperpixels(imageData, labels, count);

    // Stamp user annotations (se houver)
    if (annotations.length > 0) {
        stampAnnotations(grid, W, annotations);
    }

    // Morphological close para buildings (preencher gaps de 1px)
    morphClose(grid, W, H, new Set([3, 4])); // building_bright=3, building_dark=4

    // Merge building subcategories (bright → dark, como colorAnalysis.js)
    for (let i = 0; i < grid.length; i++) {
        if (grid[i] === 3) grid[i] = 4;
    }

    // Encontrar blobs
    onProgress?.({ message: 'Finding regions...', progress: 75 });
    const { blobs } = findBlobs(grid, W, H);

    // Converter blobs para features
    onProgress?.({ message: 'Building features...', progress: 90 });
    const features = [];
    const totalPixels = W * H;

    for (const blob of blobs) {
        const feature = blobToFeature(blob, W, H, extent, totalPixels);
        if (feature) {
            // blobToFeature (colorAnalysis.ts) infers a return union where one
            // branch lacks sourceMethod; widen locally to allow the assignment.
            (feature as typeof feature & { sourceMethod?: string }).sourceMethod = 'slic';
            features.push(feature);
        }
    }

    onProgress?.({ message: 'Done', progress: 100 });

    if (returnGrid) {
        return { features, grid };
    }
    return features;
}

// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------

/**
 * Find lowest gradient position in 3x3 neighborhood.
 * Move centro SLIC para posicao de menor gradiente para evitar
 * inicializar em bordas.
 */
/**
 * @param {Float32Array|number[]} labL
 * @param {number} W @param {number} H @param {number} cx @param {number} cy
 */
function _lowestGradient(labL: any, W: any, H: any, cx: any, cy: any) {
    let bestGrad = Infinity;
    let bestX = cx;
    let bestY = cy;

    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 1 || nx >= W - 1 || ny < 1 || ny >= H - 1) continue;

            const idx = ny * W + nx;
            // Gradiente = diferenca horizontal + vertical em L
            const gx = labL[idx + 1] - labL[idx - 1];
            const gy = labL[idx + W] - labL[idx - W];
            const grad = gx * gx + gy * gy;

            if (grad < bestGrad) {
                bestGrad = grad;
                bestX = nx;
                bestY = ny;
            }
        }
    }

    return { x: bestX, y: bestY };
}

/**
 * Enforce connectivity via BFS.
 * Reatribui pixels orfaos (clusters desconectados menores que
 * minSize) ao cluster vizinho mais proximo.
 */
/**
 * @param {Int32Array|number[]} labels
 * @param {number} W @param {number} H @param {number} K @param {number} minSize
 */
function _enforceConnectivity(labels: any, W: any, H: any, K: any, minSize: any) {
    const N = W * H;
    const visited = new Uint8Array(N);
    const dx4 = [-1, 1, 0, 0];
    const dy4 = [0, 0, -1, 1];
    let newLabel = 0;
    const newLabels = new Int32Array(N).fill(-1);

    for (let i = 0; i < N; i++) {
        if (visited[i]) continue;

        // BFS para encontrar componente conectado
        const queue = [i];
        const component = [i];
        visited[i] = 1;
        const origLabel = labels[i];
        let head = 0;

        while (head < queue.length) {
            const idx = queue[head++];
            const px = idx! % W;
            const py = Math.floor(idx! / W);

            for (let d = 0; d < 4; d++) {
                const nx = px + dx4[d]!;
                const ny = py + dy4[d]!;
                if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
                const nIdx = ny * W + nx;
                if (visited[nIdx] || labels[nIdx] !== origLabel) continue;
                visited[nIdx] = 1;
                queue.push(nIdx);
                component.push(nIdx);
            }
        }

        if (component.length >= minSize) {
            // Componente grande o suficiente: manter
            for (const idx of component) {
                newLabels[idx] = newLabel;
            }
            newLabel++;
        } else {
            // Componente pequeno: atribuir ao vizinho mais proximo
            // Encontrar label vizinho diferente
            let adjLabel = -1;
            for (const idx of component) {
                const px = idx % W;
                const py = Math.floor(idx / W);
                for (let d = 0; d < 4; d++) {
                    const nx = px + dx4[d]!;
                    const ny = py + dy4[d]!;
                    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
                    const nIdx = ny * W + nx;
                    if (newLabels[nIdx]! >= 0) {
                        adjLabel = newLabels[nIdx]!;
                        break;
                    }
                }
                if (adjLabel >= 0) break;
            }

            for (const idx of component) {
                newLabels[idx] = adjLabel >= 0 ? adjLabel : newLabel;
            }
            if (adjLabel < 0) newLabel++;
        }
    }

    // Copiar resultado de volta
    for (let i = 0; i < N; i++) {
        labels[i] = newLabels[i];
    }
}

/**
 * Load image from data URL to ImageData.
 */
/** @param {string} dataUrl */
function _loadImageData(dataUrl: any) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            resolve(ctx.getImageData(0, 0, img.width, img.height));
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUrl;
    });
}
