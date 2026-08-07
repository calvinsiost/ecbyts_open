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
   SPECTRAL INDICES & EDGE DETECTION — Funcoes auxiliares para
   classificacao de pixels em imagens aereas/satelite
   ================================================================

   Indices espectrais (ExG, C3 shadow) e deteccao de bordas (Sobel)
   para complementar a classificacao HSL existente. Todas as funcoes
   sao puras e operam em valores RGB 0-255.

   ================================================================ */

// ----------------------------------------------------------------
// VEGETATION INDEX (Excess Green)
// Indice de vegetacao baseado em excesso de verde normalizado
// ----------------------------------------------------------------

/**
 * Compute Excess Green Index for vegetation detection.
 * Mais robusto que matiz HSL para separar vegetacao de sombras.
 * Vegetacao retorna valores positivos; sombras e solo retornam negativos.
 *
 * @param r - Red 0-255
 * @param g - Green 0-255
 * @param b - Blue 0-255
 * @returns ExG value, typically -1 to +1
 */
export function excessGreen(r: number, g: number, b: number): number {
    const sum = r + g + b;
    if (sum < 30) return 0; // Pixels muito escuros — sem informacao de cor
    const rn = r / sum;
    const gn = g / sum;
    const bn = b / sum;
    return 2 * gn - rn - bn;
}

// ----------------------------------------------------------------
// SHADOW DETECTION (C3 Index)
// Deteccao de sombras via desvio azul atmosferico (Rayleigh)
// ----------------------------------------------------------------

/**
 * Compute C3 shadow index.
 * Sombras tem desvio azul por espalhamento Rayleigh na atmosfera.
 * Valores altos indicam dominancia de azul relativo a R e G.
 *
 * @param r - Red 0-255
 * @param g - Green 0-255
 * @param b - Blue 0-255
 * @returns C3 value in radians (0 to pi/2)
 */
export function shadowIndex(r: number, g: number, b: number): number {
    const maxRG = Math.max(r, g);
    if (maxRG === 0 && b === 0) return 0;
    return Math.atan2(b, maxRG);
}

/**
 * Determine if pixel is likely a shadow.
 * Combina indice C3 com limiar de luminancia baixa.
 *
 * @param r - Red 0-255
 * @param g - Green 0-255
 * @param b - Blue 0-255
 * @returns true se provavel sombra
 */
export function isShadow(r: number, g: number, b: number): boolean {
    const c3 = shadowIndex(r, g, b);
    // Luminancia perceptual (BT.601)
    const lum = ((0.299 * r + 0.587 * g + 0.114 * b) / 255) * 100;
    // Sombra: forte desvio azul E luminancia baixa
    return c3 > 0.85 && lum < 40;
}

// ----------------------------------------------------------------
// ADAPTIVE THRESHOLDING (Otsu)
// Limiar otimo automatico por maximizacao de variancia inter-classe
// ----------------------------------------------------------------

/**
 * Find optimal binary threshold using Otsu's method.
 * Maximiza variancia entre as duas classes (foreground/background).
 *
 * @param histogram - 256-bin histogram
 * @param total - Total pixel count
 * @returns Optimal threshold (0-255)
 */
export function otsuThreshold(histogram: Uint32Array | number[], total: number): number {
    if (total === 0) return 128;

    let sumAll = 0;
    for (let i = 0; i < 256; i++) sumAll += i * (histogram[i] ?? 0);

    let sumBg = 0;
    let weightBg = 0;
    let bestThreshold = 0;
    let bestVariance = 0;

    for (let t = 0; t < 256; t++) {
        const ht = histogram[t] ?? 0;
        weightBg += ht;
        if (weightBg === 0) continue;

        const weightFg = total - weightBg;
        if (weightFg === 0) break;

        sumBg += t * ht;
        const meanBg = sumBg / weightBg;
        const meanFg = (sumAll - sumBg) / weightFg;
        const diff = meanBg - meanFg;
        const variance = weightBg * weightFg * diff * diff;

        if (variance > bestVariance) {
            bestVariance = variance;
            bestThreshold = t;
        }
    }

    return bestThreshold;
}

// ----------------------------------------------------------------
// GRAYSCALE CONVERSION
// Converte buffer RGBA para buffer de luminancia 8-bit
// ----------------------------------------------------------------

/**
 * Convert RGBA pixel buffer to grayscale Uint8Array.
 * Usa pesos de luminancia perceptual (BT.601).
 *
 * @param pixels - RGBA pixel data (4 bytes per pixel)
 * @param count - Number of pixels
 * @returns Grayscale buffer
 */
export function toGrayscale(pixels: Uint8ClampedArray, count: number): Uint8Array {
    const gray = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
        const off = i * 4;
        const r = pixels[off] ?? 0;
        const g = pixels[off + 1] ?? 0;
        const b = pixels[off + 2] ?? 0;
        gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    return gray;
}

// ----------------------------------------------------------------
// SOBEL EDGE DETECTION
// Deteccao de bordas via operador Sobel 3x3
// ----------------------------------------------------------------

/**
 * Compute edge magnitude map using 3x3 Sobel operator.
 * Calcula magnitude do gradiente em cada pixel para detectar bordas.
 * Bordas fortes indicam estruturas (edificios); areas lisas indicam
 * sombras, agua ou vegetacao homogenea.
 *
 * @param gray - Grayscale image buffer
 * @param w - Image width
 * @param h - Image height
 * @returns Edge magnitude map (0-255)
 */
export function computeEdgeMap(gray: Uint8Array, w: number, h: number): Uint8Array {
    const edges = new Uint8Array(w * h);

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const tl = gray[(y - 1) * w + (x - 1)] ?? 0;
            const tc = gray[(y - 1) * w + x] ?? 0;
            const tr = gray[(y - 1) * w + (x + 1)] ?? 0;
            const ml = gray[y * w + (x - 1)] ?? 0;
            const mr = gray[y * w + (x + 1)] ?? 0;
            const bl = gray[(y + 1) * w + (x - 1)] ?? 0;
            const bc = gray[(y + 1) * w + x] ?? 0;
            const br = gray[(y + 1) * w + (x + 1)] ?? 0;

            // Sobel Gx kernel: [-1 0 1; -2 0 2; -1 0 1]
            const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
            // Sobel Gy kernel: [-1 -2 -1; 0 0 0; 1 2 1]
            const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;

            // Magnitude approximation (fast: |gx| + |gy| instead of sqrt)
            const mag = Math.abs(gx) + Math.abs(gy);
            edges[y * w + x] = Math.min(255, mag >> 2); // Scale down to 0-255
        }
    }

    return edges;
}

interface Blob {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    category: number;
    pixels: number;
}

/**
 * Compute edge density within a blob's bounding box.
 * Conta pixels de borda fortes dentro do blob para distinguir
 * estruturas (bordas densas) de sombras (bordas esparsas).
 *
 * @param edgeMap - Edge magnitude per pixel
 * @param grid - Category grid (same dimensions)
 * @param blob - Blob with minX, maxX, minY, maxY, category, pixels
 * @param w - Image width
 * @param edgeThreshold - Magnitude threshold (default 30)
 * @returns Edge density ratio (0-1)
 */
export function blobEdgeDensity(
    edgeMap: Uint8Array,
    grid: Uint8Array,
    blob: Blob,
    w: number,
    edgeThreshold: number = 30,
): number {
    if (blob.pixels === 0) return 0;

    let edgeCount = 0;
    for (let y = blob.minY; y <= blob.maxY; y++) {
        for (let x = blob.minX; x <= blob.maxX; x++) {
            const idx = y * w + x;
            // Conta apenas pixels que pertencem ao blob (mesma categoria)
            if (grid[idx] === blob.category && (edgeMap[idx] ?? 0) > edgeThreshold) {
                edgeCount++;
            }
        }
    }

    return edgeCount / blob.pixels;
}
