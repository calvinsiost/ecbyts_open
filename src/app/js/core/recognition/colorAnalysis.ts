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
   COLOR ANALYSIS — Canvas-based aerial image recognition
   ================================================================

   Algoritmo de analise de cores para detectar feicoes ambientais
   em imagens aereas/satelite sem necessidade de API/LLM.

   METODO:
   1. Desenha imagem em canvas offscreen (512x512)
   2. Pre-processamento: grayscale + Sobel edge map
   3. Classifica cada pixel: shadow → ExG vegetation → HSL categories
   4. Agrupa pixels adjacentes (flood-fill) em blobs
   5. Pos-processamento: edge density filter em building blobs
   6. Estima rotacao via momentos de segunda ordem (PCA)

   ================================================================ */
import { isShadow, excessGreen, shadowIndex, toGrayscale, computeEdgeMap, blobEdgeDensity } from './indices.js';
import { mapToThresholds } from './calibration.js';
import { runtimeRandom } from '../random/runtime.js';
// ----------------------------------------------------------------
// HSL CATEGORY DEFINITIONS
// Faixas de cor HSL para classificacao de feicoes aereas
// ----------------------------------------------------------------
/** @type {Record<string, {family: string, match: (h:number, s:number, l:number) => boolean}>} */
const CATEGORIES = {
    water: {
        family: 'lake',
        match: (h: any, s: any, l: any) => h >= 170 && h <= 260 && s > 10 && l >= 5 && l <= 75,
    },
    vegetation: {
        family: 'habitat',
        match: (h: any, s: any, l: any) => h >= 50 && h <= 170 && s > 7 && l >= 3 && l <= 75,
    },
    building_bright: {
        family: 'building',
        match: (h: any, s: any, l: any) => s < 18 && l > 70,
    },
    building_dark: {
        family: 'building',
        match: (h: any, s: any, l: any) => s < 18 && l >= 12 && l <= 55,
    },
    infrastructure: {
        family: 'marker',
        match: (h: any, s: any, l: any) => s < 15 && l > 48 && l <= 72,
    },
    soil: {
        family: 'marker',
        match: (h: any, s: any, l: any) => h >= 15 && h <= 55 && s >= 10 && s <= 55 && l >= 15 && l <= 68,
    },
};
const CATEGORY_KEYS = Object.keys(CATEGORIES);
// ----------------------------------------------------------------
// RGB TO HSL CONVERSION
// ----------------------------------------------------------------
/**
 * Convert RGB to HSL values.
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {{ h: number, s: number, l: number }} - H(0-360), S(0-100), L(0-100)
 */
function rgbToHsl(r: any, g: any, b: any) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: l * 100 };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return { h: h * 360, s: s * 100, l: l * 100 };
}
// ----------------------------------------------------------------
// PIXEL CLASSIFICATION
// ----------------------------------------------------------------
/**
 * Classify a single pixel into a category.
 * Prioridade: sombra → vegetacao (ExG) → categorias HSL existentes.
 * Shadow detection evita falsos positivos em building_dark.
 * ExG e mais robusto que HSL hue para vegetacao em imagens satelite.
 *
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string|null} - Category key or null if unclassified
 */
function classifyPixel(r: any, g: any, b: any) {
    // 1. Shadow filter - sombras tem desvio azul + baixa luminancia
    // Evita que sombras sejam classificadas como building_dark
    if (isShadow(r, g, b)) return null;
    // 2. Vegetation via Excess Green Index - mais robusto que HSL hue
    // ExG positivo = vegetacao; negativo = nao-vegetacao
    const exg = excessGreen(r, g, b);
    if (exg > 0.08) return 'vegetation';
    // 3. HSL categories (water, building, infrastructure, soil)
    const { h, s, l } = rgbToHsl(r, g, b);
    for (const key of CATEGORY_KEYS) {
        // Skip vegetation - already handled by ExG above
        if (key === 'vegetation') continue;
        if (CATEGORIES[key as keyof typeof CATEGORIES].match(h, s, l)) return key;
    }
    return null;
}

/**
 * Determine whether a calibrated pixel should be discarded as shadow.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @param {{c3:number,lum:number}} shadowThresholds
 * @returns {boolean}
 */
function _isCalibratedShadow(r: any, g: any, b: any, shadowThresholds: any) {
    const c3 = shadowIndex(r, g, b);
    const lum = ((0.299 * r + 0.587 * g + 0.114 * b) / 255) * 100;
    return c3 > shadowThresholds.c3 && lum < shadowThresholds.lum;
}

/**
 * Match an (h,s,l) triple against the calibrated thresholds.
 * @param {number} h
 * @param {number} s
 * @param {number} l
 * @param {{satFloor:number,satCap:number,brightLumFloor:number,darkLumFloor:number,darkLumCeil:number,infraSatCap:number,infraLumFloor:number,infraLumCeil:number}} thresholds
 * @returns {string|null}
 */
function _matchCalibratedCategory(h: any, s: any, l: any, thresholds: any) {
    if (h >= 170 && h <= 260 && s > thresholds.wtr.satFloor && l >= 5 && l <= 75) return 'water';
    if (s < thresholds.bld.satCap && l > thresholds.bld.brightLumFloor) return 'building_bright';
    if (s < thresholds.bld.satCap && l >= thresholds.bld.darkLumFloor && l <= thresholds.bld.darkLumCeil) return 'building_dark';
    if (s < thresholds.bld.infraSatCap && l > thresholds.bld.infraLumFloor && l <= thresholds.bld.infraLumCeil) return 'infrastructure';
    if (h >= 15 && h <= 55 && s >= 10 && s <= 55 && l >= 15 && l <= 68) return 'soil';
    return null;
}

// ----------------------------------------------------------------
// CALIBRATED PIXEL CLASSIFIER FACTORY
// Retorna funcao de classificacao usando limiares calibrados
// ----------------------------------------------------------------
/**
 * Create a pixel classifier function using calibrated thresholds.
 * Se thresholds=null, usa classifyPixel original (hardcoded).
 * Caso contrario, aplica limiares dinamicos de calibracao.
 *
 * @param {Object|null} thresholds - Output of mapToThresholds(), or null for defaults
 * @returns {Function} (r, g, b) => category key string or null
 */
function makeClassifier(thresholds: any) {
    if (!thresholds) return classifyPixel;
    const { shadow: sh, vegetation: veg, building: bld, water: wtr } = thresholds;
    return function classifyCalibrated(r: any, g: any, b: any) {
        // 1. Shadow filter - calibrated C3 + luminance thresholds
        if (_isCalibratedShadow(r, g, b, sh)) return null;
        // 2. Vegetation via ExG - calibrated threshold
        const exg = excessGreen(r, g, b);
        if (exg > veg.exg) return 'vegetation';
        // 3. HSL categories with calibrated thresholds
        const { h, s, l } = rgbToHsl(r, g, b);
        return _matchCalibratedCategory(h, s, l, { bld, wtr });
    };
}
// ----------------------------------------------------------------
// FLOOD-FILL CONNECTED COMPONENTS
// Agrupa pixels adjacentes da mesma categoria em blobs
// Coleta momentos de segunda ordem para estimar rotacao (PCA)
// ----------------------------------------------------------------
/**
 * Update blob bounds and moments with a single pixel.
 * @param {any} blob
 * @param {number} cx
 * @param {number} cy
 */
function _addBlobPixel(blob: any, cx: any, cy: any) {
    blob.pixels++;
    blob.sumX += cx;
    blob.sumY += cy;
    blob.sumXX += cx * cx;
    blob.sumYY += cy * cy;
    blob.sumXY += cx * cy;
    if (cx < blob.minX) blob.minX = cx;
    if (cx > blob.maxX) blob.maxX = cx;
    if (cy < blob.minY) blob.minY = cy;
    if (cy > blob.maxY) blob.maxY = cy;
}

/**
 * Collect 4-directional neighbor indices inside the grid bounds.
 * @param {number} ci
 * @param {number} cx
 * @param {number} cy
 * @param {number} width
 * @param {number} height
 * @returns {number[]}
 */
function _neighborIndices(ci: any, cx: any, cy: any, width: any, height: any) {
    return [
        cy > 0 ? ci - width : -1,
        cy < height - 1 ? ci + width : -1,
        cx > 0 ? ci - 1 : -1,
        cx < width - 1 ? ci + 1 : -1,
    ];
}

/**
 * Flood-fill one connected component starting from (x,y).
 * @param {Uint8Array} grid
 * @param {Uint16Array} blobGrid
 * @param {number} startX
 * @param {number} startY
 * @param {number} width
 * @param {number} height
 * @param {number} cat
 * @param {number} blobId
 * @returns {any} blob descriptor
 */
function _floodFillBlob(
    grid: any,
    blobGrid: any,
    startX: any,
    startY: any,
    width: any,
    height: any,
    cat: any,
    blobId: any,
) {
    const blob = {
        category: cat,
        pixels: 0,
        minX: startX,
        maxX: startX,
        minY: startY,
        maxY: startY,
        sumX: 0,
        sumY: 0,
        sumXX: 0,
        sumYY: 0,
        sumXY: 0,
    };
    const queue: number[] = [startY * width + startX];
    blobGrid[startY * width + startX] = blobId;
    while (queue.length > 0) {
        const ci = queue.pop();
        const cx = ci! % width;
        const cy = (ci! - cx) / width;
        _addBlobPixel(blob, cx, cy);
        for (const ni of _neighborIndices(ci, cx, cy, width, height)) {
            if (ni >= 0 && !blobGrid[ni] && grid[ni] === cat) {
                blobGrid[ni] = blobId;
                queue.push(ni);
            }
        }
    }
    return blob;
}

/**
 * Find connected components via flood-fill.
 * Coleta sumX, sumY, sumXX, sumYY, sumXY para analise de orientacao.
 * @param {Uint8Array} grid - Category index per pixel (0=unclassified, 1..N=category)
 * @param {number} width
 * @param {number} height
 * @returns {{blobs: any[], blobGrid: Uint16Array}} - Blobs com momentos
 */
export function findBlobs(grid: any, width: any, height: any) {
    const blobGrid = new Uint16Array(width * height);
    const blobs: any[] = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (blobGrid[idx] || grid[idx] === 0) continue;
            const blob = _floodFillBlob(grid, blobGrid, x, y, width, height, grid[idx], blobs.length + 1);
            blobs.push(blob);
        }
    }
    return { blobs, blobGrid };
}
// ----------------------------------------------------------------
// CONTOUR EXTRACTION - Row-scan boundary tracing
// Extrai contorno do blob via varredura por linhas (left/right edges)
// Produz poligono fechado para renderizar formas reais dos blobs
// ----------------------------------------------------------------
/**
 * Extract contour polygon from a blob via row scanning.
 * Para cada linha, encontra pixel mais à esquerda e à direita do blob.
 * Resulta em poligono fechado: borda esquerda (cima→baixo) + direita (baixo→cima).
 * Simplificado via Ramer-Douglas-Peucker para reduzir vertices.
 *
 * @param {Uint16Array} blobGrid - Blob ID per pixel (from findBlobs)
 * @param {number} blobId - 1-based blob identifier
 * @param {Object} blob - Blob with minX, maxX, minY, maxY
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @returns {Array<{x: number, y: number}>} Contour in normalized coords (0-1)
 */
export function extractContour(
    blobGrid: any,
    blobId: any,
    blob: any,
    width: any,
    height: any,
) {
    /** @type {{x:number, y:number}[]} */
    const leftEdge = [];
    /** @type {{x:number, y:number}[]} */
    const rightEdge = [];
    for (let y = blob.minY; y <= blob.maxY; y++) {
        let leftmost = -1,
            rightmost = -1;
        for (let x = blob.minX; x <= blob.maxX; x++) {
            if (blobGrid[y * width + x] === blobId) {
                if (leftmost === -1) leftmost = x;
                rightmost = x;
            }
        }
        if (leftmost >= 0) {
            leftEdge.push({ x: leftmost, y });
            rightEdge.push({ x: rightmost, y });
        }
    }
    if (leftEdge.length < 2) return [];
    // Build closed polygon: left edge top→bottom, right edge bottom→top
    const raw = [];
    for (const pt of leftEdge) raw.push(pt);
    for (let i = rightEdge.length - 1; i >= 0; i--) raw.push(rightEdge[i]);
    // Simplify with Douglas-Peucker (tolerance ~1.5px for 512 grid)
    const simplified = raw.length > 6 ? _simplifyRDP(raw, 1.5) : raw;
    // Normalize to 0-1
    const wMax = width - 1;
    const hMax = height - 1;
    return simplified.map((pt: any) => ({
        x: pt.x / wMax,
        y: pt.y / hMax
    }));
}
/**
 * Simplify polyline using iterative Ramer-Douglas-Peucker algorithm.
 * Remove vertices que ficam dentro de 'tolerance' pixels da reta
 * entre pontos mantidos. Preserva forma geral, reduz vertices.
 *
 * @param {Array<{x:number, y:number}>} points
 * @param {number} points - Max distance in pixel units
 * @returns {Array<{x:number, y:number}>}
 */
function _simplifyRDP(points: any, tolerance: any) {
    if (points.length <= 3) return points;
    const tolSq = tolerance * tolerance;
    const keep = new Uint8Array(points.length);
    keep[0] = 1;
    keep[points.length - 1] = 1;
        const stack: any = [[0, points.length - 1]];
    while (stack.length > 0) {
        const [start, end] = stack.pop();
        let maxDistSq = 0,
            maxIdx = start;
        const ax = points[start].x,
            ay = points[start].y;
        const bx = points[end].x,
            by = points[end].y;
        const dx = bx - ax,
            dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        for (let i = start + 1; i < end; i++) {
            let distSq;
            if (lenSq === 0) {
                const px = points[i].x - ax,
                    py = points[i].y - ay;
                distSq = px * px + py * py;
            } else {
                const t = Math.max(0, Math.min(1, ((points[i].x - ax) * dx + (points[i].y - ay) * dy) / lenSq));
                const projX = ax + t * dx - points[i].x;
                const projY = ay + t * dy - points[i].y;
                distSq = projX * projX + projY * projY;
            }
            if (distSq > maxDistSq) {
                maxDistSq = distSq;
                maxIdx = i;
            }
        }
        if (maxDistSq > tolSq) {
            keep[maxIdx] = 1;
            if (maxIdx - start > 1) stack.push([start, maxIdx]);
            if (end - maxIdx > 1) stack.push([maxIdx, end]);
        }
    }
    return points.filter((_: any, i: any) => keep[i]);
}
// ----------------------------------------------------------------
// ROTATION ESTIMATION VIA COVARIANCE (PCA)
// Calcula angulo principal do blob usando momentos de segunda ordem
// ----------------------------------------------------------------
/**
 * Estimate rotation angle (radians) of a blob from its covariance matrix.
 * Usa os momentos de segunda ordem para derivar o eixo principal.
 * @param {Object} blob - Blob com sumX, sumY, sumXX, sumYY, sumXY, pixels
 * @returns {number} - Angle in radians (rotation around Y axis in 3D)
 */
export function estimateRotation(blob: any) {
    const n = blob.pixels;
    if (n < 10) return 0;
    const mx = blob.sumX / n;
    const my = blob.sumY / n;
    const cxx = blob.sumXX / n - mx * mx;
    const cyy = blob.sumYY / n - my * my;
    const cxy = blob.sumXY / n - mx * my;
    // Angulo do eixo principal (eigenvector dominante)
    const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    return theta;
}
/**
 * Compute oriented bounding box dimensions.
 * Rotaciona os limites do blob pelo angulo e calcula largura/comprimento
 * ao longo dos eixos principais.
 * @param {Object} blob
 * @param {number} theta - Rotation angle in radians
 * @returns {{ width: number, length: number }} - In pixel units
 */
export function orientedDimensions(blob: any, theta: any) {
    const n = blob.pixels;
    const cx = blob.sumX / n;
    const cy = blob.sumY / n;
    const cos = Math.cos(-theta);
    const sin = Math.sin(-theta);
    // Project bounding box corners into rotated frame
    const corners = [
        { x: blob.minX - cx, y: blob.minY - cy },
        { x: blob.maxX - cx, y: blob.minY - cy },
        { x: blob.maxX - cx, y: blob.maxY - cy },
        { x: blob.minX - cx, y: blob.maxY - cy },
    ];
    let minU = Infinity,
        maxU = -Infinity,
        minV = Infinity,
        maxV = -Infinity;
    for (const c of corners) {
        const u = c.x * cos - c.y * sin;
        const v = c.x * sin + c.y * cos;
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
    }
    return {
        width: maxU - minU,
        length: maxV - minV,
    };
}

/**
 * Compute the common metrics shared by all feature conversions.
 * @param {any} blob
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @param {any} extent
 * @param {number} totalPixels
 * @returns {any}
 */
function _computeFeatureMetrics(blob: any, imageWidth: any, imageHeight: any, extent: any, totalPixels: any) {
    const cx = blob.sumX / blob.pixels;
    const cy = blob.sumY / blob.pixels;
    const worldWidth = extent.maxX - extent.minX;
    const worldHeight = extent.maxZ - extent.minZ;
    const worldX = extent.minX + (cx / imageWidth) * worldWidth;
    const worldZ = extent.maxZ - (cy / imageHeight) * worldHeight;
    const blobW = ((blob.maxX - blob.minX + 1) / imageWidth) * worldWidth;
    const blobH = ((blob.maxY - blob.minY + 1) / imageHeight) * worldHeight;
    const bboxArea = (blob.maxX - blob.minX + 1) * (blob.maxY - blob.minY + 1);
    const fillRatio = blob.pixels / bboxArea;
    const pixW = blob.maxX - blob.minX + 1;
    const pixH = blob.maxY - blob.minY + 1;
    const aspectRatio = pixH > 0 ? pixW / pixH : 1;
    return { worldX, worldZ, blobW, blobH, fillRatio, aspectRatio, worldWidth, worldHeight };
}

/**
 * Compute base confidence plus fill/size/shape bonuses.
 * @param {string} family
 * @param {number} fillRatio
 * @param {number} areaRatio
 * @param {number} aspectRatio
 * @returns {number}
 */
function _computeConfidence(family: any, fillRatio: any, areaRatio: any, aspectRatio: any) {
    const baseConf =
        family === 'building' ? 0.5 : family === 'lake' ? 0.45 : family === 'habitat' ? 0.4 : 0.35;
    const fillBonus = Math.min(0.2, fillRatio * 0.25);
    const sizeBonus = Math.min(0.15, areaRatio * 3);
    const shapeBonus =
        family === 'building' && fillRatio > 0.5 && aspectRatio > 0.4 && aspectRatio < 2.5 ? 0.1 : 0;
    return Math.min(0.95, baseConf + fillBonus + sizeBonus + shapeBonus);
}

/**
 * Decide the final family and dimensions for a building-shaped blob.
 * @param {any} blob
 * @param {any} metrics
 * @param {any} oriented
 * @param {number} theta
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @param {any} extent
 * @param {number} confidence
 * @returns {{family:string, dimensions:any, rotation:number, confidence:number}|null}
 */
function _classifyBuildingFamily(
    blob: any,
    metrics: any,
    oriented: any,
    theta: any,
    imageWidth: any,
    imageHeight: any,
    extent: any,
    confidence: any,
) {
    const { aspectRatio, fillRatio, blobW, blobH, worldX, worldZ, worldWidth } = metrics;
    if (aspectRatio > 6 || aspectRatio < 0.17) {
        return _markerFeature(worldX, worldZ, blob.contour, Math.min(0.7, confidence * 0.8));
    }
    if (fillRatio < 0.3 && (aspectRatio > 4 || aspectRatio < 0.25)) {
        return _markerFeature(worldX, worldZ, blob.contour, Math.min(0.65, confidence * 0.7));
    }
    const w = Math.max(
        (oriented.width / imageWidth) * (extent.maxX - extent.minX),
        (oriented.length / imageHeight) * (extent.maxZ - extent.minZ),
    );
    const l = Math.min(
        (oriented.width / imageWidth) * (extent.maxX - extent.minX),
        (oriented.length / imageHeight) * (extent.maxZ - extent.minZ),
    );
    const dimensions: any = {};
    let rotation = 0;
    if (fillRatio > 0.65 && aspectRatio > 0.65 && aspectRatio < 1.55 && blobW < worldWidth * 0.1) {
        const diameter = Math.min(blobW, blobH);
        dimensions.dimensions = {
            diameter: Math.round(diameter * 10) / 10,
            length: Math.round(diameter * 10) / 10,
        };
        dimensions.type = 'aboveground';
        return { family: 'tank', dimensions, rotation, confidence };
    }
    dimensions.footprint = {
        width: Math.round(w * 10) / 10,
        length: Math.round(l * 10) / 10,
    };
    dimensions.height = Math.round(4 + runtimeRandom('vision') * 8);
    dimensions.type = w * l > 300 ? 'industrial' : 'commercial';
    rotation = theta;
    return { family: 'building', dimensions, rotation, confidence };
}

/**
 * Build a marker feature result with given confidence.
 * @param {number} worldX
 * @param {number} worldZ
 * @param {any} contour
 * @param {number} confidence
 * @returns {any}
 */
function _markerFeature(worldX: any, worldZ: any, contour: any, confidence: any) {
    return {
        family: 'marker',
        confidence: Math.round(confidence * 100) / 100,
        label: 'marker',
        position: { x: Math.round(worldX * 10) / 10, z: Math.round(worldZ * 10) / 10 },
        dimensions: {},
        rotation: 0,
        contours: contour ? [contour] : [],
        sourceMethod: 'algorithm',
    };
}

/**
 * Build dimensions for a lake/river feature.
 * @param {any} blob
 * @param {any} metrics
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @param {any} extent
 * @returns {any}
 */
function _buildLakeDimensions(blob: any, metrics: any, imageWidth: any, imageHeight: any, extent: any) {
    const { aspectRatio, blobW, blobH } = metrics;
    const dimensions: any = {};
    if (aspectRatio > 3.5 || aspectRatio < 0.28) {
        const nPts = 4;
        const path = [];
        const worldWidth = extent.maxX - extent.minX;
        const worldHeight = extent.maxZ - extent.minZ;
        for (let i = 0; i < nPts; i++) {
            const t = i / (nPts - 1);
            const px = blob.minX + t * (blob.maxX - blob.minX);
            const py = blob.minY + t * (blob.maxY - blob.minY);
            path.push({
                x: Math.round((extent.minX + (px / imageWidth) * worldWidth) * 10) / 10,
                y: 0,
                z: Math.round((extent.maxZ - (py / imageHeight) * worldHeight) * 10) / 10,
            });
        }
        dimensions.path = path;
        dimensions.width = Math.max(2, Math.round(Math.min(blobW, blobH) * 10) / 10);
    } else {
        dimensions.shape = {
            radiusX: Math.round((blobW / 2) * 10) / 10,
            radiusY: Math.round((blobH / 2) * 10) / 10,
            depth: 3,
        };
    }
    return dimensions;
}

/**
 * Build dimensions for a habitat feature.
 * @param {any} blob
 * @param {any} metrics
 * @param {number} totalPixels
 * @returns {any}
 */
function _buildHabitatDimensions(blob: any, metrics: any, totalPixels: any) {
    const { worldWidth, worldHeight, blobW, blobH } = metrics;
    const habitatTypes = ['forest', 'grassland', 'wetland', 'riparian'];
    return {
        habitatType: habitatTypes[Math.floor(runtimeRandom('vision') * habitatTypes.length)],
        protectionStatus: 'none',
        area: Math.min(Math.round((blob.pixels / totalPixels) * worldWidth * worldHeight), 500),
        footprint: {
            width: Math.round(Math.max(blobW, 3) * 10) / 10,
            length: Math.round(Math.max(blobH, 3) * 10) / 10,
        },
    };
}

/**
 * Build the final feature result object.
 * @param {string} family
 * @param {number} confidence
 * @param {number} worldX
 * @param {number} worldZ
 * @param {any} dimensions
 * @param {number} rotation
 * @param {any} contour
 * @returns {any}
 */
function _buildFeatureResult(family: any, confidence: any, worldX: any, worldZ: any, dimensions: any, rotation: any, contour: any) {
    return {
        family,
        confidence: Math.round(confidence * 100) / 100,
        label: family,
        position: { x: Math.round(worldX * 10) / 10, z: Math.round(worldZ * 10) / 10 },
        dimensions,
        rotation,
        contours: contour ? [contour] : [],
        sourceMethod: 'algorithm',
    };
}

// ----------------------------------------------------------------
// BLOB TO FEATURE CONVERSION
// Converte blobs classificados em DetectedFeature[]
// ----------------------------------------------------------------
/**
 * Convert a blob to a DetectedFeature.
 * Calcula posicao, dimensoes, rotacao e confianca para cada blob.
 * @param {Object} blob - Blob from findBlobs
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @param {Object} extent - { minX, maxX, minZ, maxZ } in world coords
 * @param {number} totalPixels
 * @returns {Object|null} - DetectedFeature or null if too small/invalid
 */
export function blobToFeature(
    blob: any,
    imageWidth: any,
    imageHeight: any,
    extent: any,
    totalPixels: any,
    thresholds: any = null,
) {
    const catKey = CATEGORY_KEYS[blob.category - 1];
    if (!catKey) return null;
    const catDef = CATEGORIES[catKey as keyof typeof CATEGORIES];
    const areaRatio = blob.pixels / totalPixels;
    const mult = thresholds?.minAreaMultiplier ?? 1.0;
    const MIN_AREA = { building: 0.0025 * mult, lake: 0.004 * mult, habitat: 0.004 * mult, marker: 0.003 * mult };
    const minThreshold = (MIN_AREA as any)[catDef.family] || 0.005 * mult;
    if (areaRatio < minThreshold) return null;

    const metrics = _computeFeatureMetrics(blob, imageWidth, imageHeight, extent, totalPixels);
    const theta = estimateRotation(blob);
    const oriented = orientedDimensions(blob, theta);
    const confidence = _computeConfidence(catDef.family, metrics.fillRatio, areaRatio, metrics.aspectRatio);

    let family = catDef.family;
    let dimensions: any = {};
    let rotation = 0;

    if (family === 'building') {
        const building = _classifyBuildingFamily(blob, metrics, oriented, theta, imageWidth, imageHeight, extent, confidence);
        if (!building) return null;
        if (building.family === 'marker') return building;
        family = building.family;
        dimensions = building.dimensions;
        rotation = building.rotation;
    } else if (family === 'lake') {
        dimensions = _buildLakeDimensions(blob, metrics, imageWidth, imageHeight, extent);
    } else if (family === 'habitat') {
        dimensions = _buildHabitatDimensions(blob, metrics, totalPixels);
    }

    return _buildFeatureResult(family, confidence, metrics.worldX, metrics.worldZ, dimensions, rotation, blob.contour);
}
// ----------------------------------------------------------------
// MORPHOLOGICAL CLOSE (dilate + erode)
// Fecha pequenas lacunas entre pixels da mesma categoria
// Melhora a deteccao de telhados com bordas irregulares
// ----------------------------------------------------------------
/**
 * Count same-category neighbors for a single pixel during dilation.
 * @param {any} grid
 * @param {number} idx
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {{best:number, bestCat:number}}
 */
function _bestNeighborCategory(grid: any, idx: any, x: any, y: any, width: any, height: any) {
    const neighbors = [
        y > 0 ? grid[idx - width] : 0,
        y < height - 1 ? grid[idx + width] : 0,
        x > 0 ? grid[idx - 1] : 0,
        x < width - 1 ? grid[idx + 1] : 0,
    ];
    const counts: any = {};
    let best = 0,
        bestCat = 0;
    for (const n of neighbors) {
        if (n === 0) continue;
        counts[n] = (counts[n] || 0) + 1;
        if (counts[n] > best) {
            best = counts[n];
            bestCat = n;
        }
    }
    return { best, bestCat };
}

/**
 * Dilate allowed categories: fill unclassified pixels when 2+ same-category neighbors exist.
 * @param {Uint8Array} grid
 * @param {number} width
 * @param {number} height
 * @param {Set<number>} dilateCategories
 * @returns {Uint8Array}
 */
function _dilateGrid(grid: any, width: any, height: any, dilateCategories: any) {
    const total = width * height;
    const dilated = new Uint8Array(total);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (grid[idx] !== 0) {
                dilated[idx] = grid[idx];
                continue;
            }
            const { best, bestCat } = _bestNeighborCategory(grid, idx, x, y, width, height);
            dilated[idx] = best >= 2 && dilateCategories.has(bestCat) ? bestCat : 0;
        }
    }
    return dilated;
}

/**
 * Erode a dilated grid: keep pixel if at least 3 of 4 neighbors match.
 * @param {Uint8Array} dilated
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
function _erodeGrid(dilated: any, width: any, height: any) {
    const eroded = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const cat = dilated[idx];
            if (cat === 0) continue;
            let matchCount = 0;
            if (y === 0 || dilated[idx - width] === cat) matchCount++;
            if (y === height - 1 || dilated[idx + width] === cat) matchCount++;
            if (x === 0 || dilated[idx - 1] === cat) matchCount++;
            if (x === width - 1 || dilated[idx + 1] === cat) matchCount++;
            eroded[idx] = matchCount >= 3 ? (cat as number) : 0;
        }
    }
    return eroded;
}

/**
 * Apply morphological close (dilate then erode) on the grid.
 * Dilata pixels e depois contrai, fechando gaps de 1 pixel.
 * Apenas dilata categorias especificadas (ex: edificios) para evitar
 * que vegetacao/agua formem super-blobs.
 *
 * @param {Uint8Array} grid
 * @param {number} width
 * @param {number} height
 * @param {Set<number>} dilateCategories - Category indices to dilate (others preserved as-is)
 * @returns {Uint8Array} - Processed grid
 */
export function morphClose(grid: any, width: any, height: any, dilateCategories: any) {
    const dilated = _dilateGrid(grid, width, height, dilateCategories);
    return _erodeGrid(dilated, width, height);
}
// ----------------------------------------------------------------
// POST-PROCESSING - Merge nearby same-family features
// Blobs fragmentados da mesma familia sao fundidos quando seus
// centros estao dentro de uma distancia limite (em metros).
// ----------------------------------------------------------------
/**
 * Merge features of the same family that are close together.
 * O feature resultante herda a posicao ponderada por confianca,
 * a maior confianca, e as maiores dimensoes.
 *
 * @param {Array<any>} features - DetectedFeature[]
 * @param {any} extent - { minX, maxX, minZ, maxZ }
 * @returns {Array<any>} Merged features
 */
function _mergeNearbyFeatures(features: any, extent: any) {
    const worldW = extent.maxX - extent.minX;
    // Merge distance: 3% of extent width, capped at 15m
    // Apenas merge blobs muito proximos que sao claramente a mesma feicao
    const mergeDist = Math.min(15, Math.max(5, worldW * 0.03));
    const mergeDistSq = mergeDist * mergeDist;
    // Group by canonical family (building, habitat, marker, lake, river)
    const groups: any = {};
    for (const f of features) {
        const key = f.family;
        if (!groups[key]) groups[key] = [];
        groups[key].push(f);
    }
        const merged: any[] = [];
    for (const [_family, group] of Object.entries(groups) as [string, any[]][]) {
        // Union-Find merge within each family
        const parent = (group as any[]).map((_: any, i: any) => i);
        function find(i: any): any {
            return parent[i] === i ? i : (parent[i] = find(parent[i]));
        }
        function union(a: any, b: any) {
            parent[find(a)] = find(b);
        }
        for (let i = 0; i < group.length!; i++) {
            for (let j = i + 1; j < group.length!; j++) {
                const dx = group[i].position.x! - group[j].position.x!;
                const dz = group[i].position.z! - group[j].position.z!;
                if (dx * dx + dz * dz < mergeDistSq) {
                    union(i, j);
                }
            }
        }
        // Collect clusters
        const clusters: any = {};
        for (let i = 0; i < group.length!; i++) {
            const root = find(i);
            if (!clusters[root]) clusters[root] = [];
            clusters[root].push(group[i]!);
        }
        for (const cluster of Object.values(clusters) as any[][]) {
            if (cluster.length! === 1) {
                merged.push(cluster[0]!);
                continue;
            }
            // Merge: weighted average position, max confidence, largest dimensions
            let totalConf = 0,
                wx = 0,
                wz = 0,
                bestConf = 0;
            for (const f of cluster!) {
                totalConf += f.confidence;
                wx += f.position.x * f.confidence;
                wz += f.position.z * f.confidence;
                if (f.confidence > bestConf) bestConf = f.confidence;
            }
            // Combine contours from all merged features
            const allContours = [];
            for (const f of cluster!) {
                if (f.contours) allContours.push(...f.contours);
            }
            const mergedFeature = {
                ...cluster[0]!,
                position: {
                    x: Math.round((wx / totalConf) * 10) / 10,
                    z: Math.round((wz / totalConf) * 10) / 10,
                },
                // Boost confidence slightly for merged (multi-blob = more evidence)
                confidence: Math.min(0.95, Math.round((bestConf + 0.05) * 100) / 100),
                contours: allContours,
            };
            merged.push(mergedFeature);
        }
    }
    return merged;
}

/**
 * Classify all image pixels into the category grid.
 * @param {Uint8Array} pixels
 * @param {number} totalPixels
 * @param {Function} classify
 * @returns {Uint8Array}
 */
function _buildCategoryGrid(pixels: any, totalPixels: any, classify: any) {
    const grid = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
        const offset = i * 4;
        const cat = classify(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
        grid[i] = cat ? CATEGORY_KEYS.indexOf(cat) + 1 : 0;
    }
    return grid;
}

/**
 * Merge building_bright into building_dark so both share one canonical index.
 * @param {Uint8Array} grid
 * @returns {Uint8Array}
 */
function _mergeBuildingSubcategories(grid: any) {
    const darkIdx = CATEGORY_KEYS.indexOf('building_dark') + 1;
    const brightIdx = CATEGORY_KEYS.indexOf('building_bright') + 1;
    for (let i = 0; i < grid.length; i++) {
        if (grid[i] === brightIdx) grid[i] = darkIdx;
    }
    return grid;
}

/**
 * Discard building blobs with very low edge density (likely shadows).
 * @param {any[]} blobs
 * @param {any} edgeMap
 * @param {Uint8Array} grid
 * @param {number} size
 * @param {any} thresholds
 */
function _applyEdgeDensityFilter(blobs: any, edgeMap: any, grid: any, size: any, thresholds: any) {
    const darkIdx = CATEGORY_KEYS.indexOf('building_dark') + 1;
    const edgeDiscardThr = thresholds?.edgeDensity?.discard ?? 0.04;
    for (const blob of blobs) {
        if (blob.category !== darkIdx) continue;
        const edgeDens = blobEdgeDensity(edgeMap, grid, blob, size);
        blob._edgeDensity = edgeDens;
        if (edgeDens < edgeDiscardThr) {
            blob._discarded = true;
        }
    }
}

/**
 * Convert surviving blobs into DetectedFeature objects.
 * @param {any[]} blobs
 * @param {number} size
 * @param {any} extent
 * @param {number} totalPixels
 * @param {any} thresholds
 * @param {number} edgeBoostThr
 * @returns {any[]}
 */
function _convertBlobsToFeatures(blobs: any, size: any, extent: any, totalPixels: any, thresholds: any, edgeBoostThr: any) {
    return blobs
        .filter((b: any) => !b._discarded)
        .map((b: any) => {
            const f = blobToFeature(b, size, size, extent, totalPixels, thresholds);
            if (f && f.family === 'building' && b._edgeDensity > edgeBoostThr) {
                f.confidence = Math.min(0.95, Math.round((f.confidence + 0.05) * 100) / 100);
            }
            return f;
        })
        .filter((f: any) => f !== null);
}

/**
 * Run the full image analysis pipeline once the image has loaded.
 * @param {HTMLImageElement} img
 * @param {any} extent
 * @param {any} calibration
 * @param {any[]} annotations
 * @param {any} options
 * @returns {any}
 */
function _runImageAnalysis(img: any, extent: any, calibration: any, annotations: any, options: any) {
    const ANALYSIS_SIZE = 512;
    const canvas = document.createElement('canvas');
    canvas.width = ANALYSIS_SIZE;
    canvas.height = ANALYSIS_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
    const imageData = ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
    const pixels = imageData.data;
    const totalPixels = ANALYSIS_SIZE * ANALYSIS_SIZE;

    const thresholds = ((calibration ? mapToThresholds(calibration) : null) as any);
    const classify = makeClassifier(thresholds);
    const gray = toGrayscale(pixels, totalPixels);
    const edgeMap = computeEdgeMap(gray, ANALYSIS_SIZE, ANALYSIS_SIZE);

    let grid = _buildCategoryGrid(pixels, totalPixels, classify);
    grid = _mergeBuildingSubcategories(grid);
    stampAnnotations(grid, ANALYSIS_SIZE, annotations);

    const buildingSet = new Set([CATEGORY_KEYS.indexOf('building_dark') + 1]);
    grid = morphClose(grid, ANALYSIS_SIZE, ANALYSIS_SIZE, buildingSet);

    const { blobs, blobGrid } = findBlobs(grid, ANALYSIS_SIZE, ANALYSIS_SIZE);
    blobs.forEach((blob, i) => {
        blob.contour = extractContour(blobGrid, i + 1, blob, ANALYSIS_SIZE, ANALYSIS_SIZE);
    });

    _applyEdgeDensityFilter(blobs, edgeMap, grid, ANALYSIS_SIZE, thresholds);

    const edgeBoostThr = thresholds?.edgeDensity?.boost ?? 0.15;
    let features = _convertBlobsToFeatures(blobs, ANALYSIS_SIZE, extent, totalPixels, thresholds, edgeBoostThr);
    features = _mergeNearbyFeatures(features, extent);

    const confThreshold = 0.25;
    features = features.filter((f: any) => f.confidence >= confThreshold);
    features.sort((a: any, b: any) => b.confidence - a.confidence);

    const maxFeat = thresholds?.maxFeatures ?? 25;
    const limited = features.slice(0, maxFeat);
    return options.returnGrid ? { features: limited, grid } : limited;
}

// ----------------------------------------------------------------
// MAIN ANALYSIS FUNCTION
// ----------------------------------------------------------------
/**
 * Analyze aerial image by color segmentation.
 * Analisa imagem aerea usando segmentacao por cores no canvas.
 *
 * @param {string} imageDataUrl - Base64 data URL da imagem
 * @param {Object} extent - { minX, maxX, minZ, maxZ } coordenadas do mundo
 * @param {Object|null} [calibration=null] - CalibrationParams (0-100 sliders) ou null para defaults
 * @returns {Promise<Array<any>>} - DetectedFeature[]
 */
export async function analyzeByColor(
    imageDataUrl: any,
    extent: any,
    calibration: any = null,
    annotations: any = [],
    options: any = {},
) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // Timeout de carregamento (claude - adm 2026-06-19): esta função roda na
        // Phase 1 do random no BOOT. O `new Image()` espera onload/onerror — mas
        // se o tile de satélite (tiles.maps.eox.at etc.) fica LENTO em vez de
        // falhar (CDN instável em produção), nem onload nem onerror disparam e o
        // boot TRAVA por dezenas de segundos (console real ecbyts.com: Phase 1
        // context built = 14485ms). 6s é generoso; estourado, degrada gracioso
        // (a Phase 1 já trata reject como 'analyzeByColor skipped' → cor por vértice).
        const LOAD_TIMEOUT_MS = 6000;
        const _timeout = setTimeout(() => {
            img.onload = null;
            img.onerror = null;
            img.src = '';
            reject(new Error('Image load timeout for analysis'));
        }, LOAD_TIMEOUT_MS);
        img.onload = () => {
            clearTimeout(_timeout);
            try {
                const result = _runImageAnalysis(img, extent, calibration, annotations, options);
                resolve(result);
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = () => {
            clearTimeout(_timeout);
            reject(new Error('Failed to load image for analysis'));
        };
        // CORS fix (claude - adm 2026-06-11): tiles remotos (Esri/OSM enviam
        // Access-Control-Allow-Origin:*) sem crossOrigin MANCHAVAM o canvas →
        // getImageData lançava "tainted" DEPOIS de pagar fetch+decode+draw —
        // a detecção de zonas do random NUNCA funcionava em prod (console
        // real Calvin). data:/blob: (consumers de upload/captura) não precisam.
        if (typeof imageDataUrl === 'string' && /^https?:/i.test(imageDataUrl)) {
            img.crossOrigin = 'anonymous';
        }
        img.src = imageDataUrl;
    });
}
// ----------------------------------------------------------------
// ANNOTATION STAMPING - Inject user labels into pixel grid
// Carimba anotacoes do usuario no grid de categorias para guiar
// a deteccao de blobs nos metodos de cor e ML.
// ----------------------------------------------------------------
/** @type {Record<string, number>} Map annotation family → grid category index */
const FAMILY_TO_GRID = {
    building: 4, // building_dark (canonical after merge)
    tank: 4, // building_dark (reclassified via shape in blobToFeature)
    lake: 1, // water
    river: 1, // water (reclassified via aspect ratio in blobToFeature)
    habitat: 2, // vegetation
    well: 4, // building_dark (small structure)
    marker: 5, // infrastructure
};
/** Stamp radius on 512×512 grid (~6% of width) */
const ANNOTATION_STAMP_RADIUS = 15;
/**
 * Stamp user annotations onto the category grid.
 * Preenche um disco circular no grid para cada anotacao do usuario.
 * Chamado APOS classificacao de pixels e merge de subcategorias,
 * mas ANTES do morphClose.
 *
 * @param {Uint8Array} grid - Category grid (modified in place)
 * @param {number} gridSize - Grid dimension (512)
 * @param {Array<any>} annotations - [{ nx, ny, family }] normalized coords
 */
export function stampAnnotations(
    grid: any,
    gridSize: any,
    annotations: any,
) {
    if (!annotations || annotations.length === 0) return;
    const r = ANNOTATION_STAMP_RADIUS;
    const rSq = r * r;
    for (const ann of annotations) {
        const catIdx = (FAMILY_TO_GRID as any)[ann.family];
        if (!catIdx) continue;
        const cx = Math.round(ann.nx * (gridSize - 1));
        const cy = Math.round(ann.ny * (gridSize - 1));
        // Stamp a filled circle
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > rSq) continue;
                const gx = cx + dx;
                const gy = cy + dy;
                if (gx < 0 || gx >= gridSize || gy < 0 || gy >= gridSize) continue;
                grid[gy * gridSize + gx] = catIdx;
            }
        }
    }
}
//# sourceMappingURL=colorAnalysis.js.map
