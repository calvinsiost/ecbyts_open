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
   STRATEGIES — Class-aware CV strategies (Strategy Pattern)
   ================================================================

   Cada estrategia e um objeto com process(cv, binaryMask, rgbMat,
   pixelScale) que aplica operacoes de CV especificas por familia:

   - vegetation: Watershed + low-epsilon RDP → curvas organicas
   - building:   Canny/morph + minAreaRect/approxPolyDP → 90° retos
   - roads:      Skeletonizacao + centerline → LineString
   - water:      Morph suave + aspect ratio → lake/river

   REGRA CRITICA DE MEMORIA: JavaScript GC NAO limpa WASM.
   Todo cv.Mat, cv.MatVector, kernel alocado DEVE ser deletado
   com .delete() dentro de try/finally. Zero leaks permitidos.

   ================================================================ */

import {
    adaptiveEpsilon,
    minAreaPx,
    regularizePolygon,
    smoothPolygon,
    morphologicalSkeleton,
    contourRectFillRatio,
    rotatedRectPoints,
} from './simplify.js';

type CvRuntime = any;
type CvMat = any;
interface PixelPoint {
    x: number;
    y: number;
}
interface StrategyResult {
    features: any[];
    hierarchyData: Int32Array | null;
    contourCount: number;
}

// ----------------------------------------------------------------
// CATEGORY → STRATEGY MAPPING
// Mapeia indice de categoria (do SegFormer/colorAnalysis grid)
// para a chave de estrategia CV correspondente
// ----------------------------------------------------------------

export const CATEGORY_STRATEGY: { [key: number]: string } = {
    1: 'water', // cat water → waterStrategy
    2: 'vegetation', // cat vegetation → vegetationStrategy
    4: 'building', // cat building_dark → buildingStrategy
    5: 'roads', // cat infrastructure → roadsStrategy
    6: 'vegetation', // cat soil → vegetationStrategy (formas organicas)
};

// ----------------------------------------------------------------
// STRATEGY CONFIGURATION
// Parametros de CV por familia - centralizados para ajuste fino
// ----------------------------------------------------------------

const WATERSHED_PEAK_RATIO = 0.4; // Fraction of max distance for crown peaks
const WATERSHED_MIN_BLOB_PX = 2000; // Only watershed blobs larger than this
const BUILDING_RECT_THRESHOLD = 0.85; // contourArea/rectArea above this → use minAreaRect
const ROAD_MIN_PATH_PX = 30; // Minimum skeleton path length in pixels

// ----------------------------------------------------------------
// PRIVATE HELPERS
// ----------------------------------------------------------------

/**
 * Convert OpenCV contour Mat (CV_32SC2) to array of {x, y} points.
 * @param contourMat - cv.Mat from contours.get(i)
 */
function _matToPoints(contourMat: CvMat): PixelPoint[] {
    const pts: PixelPoint[] = [];
    const data = contourMat.data32S;
    for (let i = 0; i < data.length; i += 2) {
        pts.push({ x: data[i], y: data[i + 1] });
    }
    return pts;
}

/**
 * Compute confidence score from pixel area and fill ratio.
 * Feicoes maiores e mais compactas recebem maior confianca.
 *
 * @param areaPx - Contour area in pixels
 * @param fillRatio - contourArea / boundingRectArea
 * @returns Confidence 0.0–0.95
 */
function _computeConfidence(areaPx: number, fillRatio: number = 0.7): number {
    const base = 0.5;
    const areaBonus = Math.min(0.25, (areaPx / 5000) * 0.25);
    const fillBonus = Math.min(0.15, fillRatio * 0.2);
    return Math.min(0.95, base + areaBonus + fillBonus);
}

/**
 * Apply morphological operations to a binary mask.
 * Retorna Mat processado - caller DEVE deletar.
 *
 * @param cv - OpenCV instance
 * @param mask - CV_8UC1 binary mask (not modified)
 * @param ops - ['close'], ['close', 'open'], etc.
 * @param kernelSize - Structuring element size
 * @param shape - 'RECT' | 'ELLIPSE' | 'CROSS'
 * @returns Processed cv.Mat (CALLER MUST .delete())
 */
function _morphProcess(cv: CvRuntime, mask: CvMat, ops: string[], kernelSize: number, shape: string): CvMat {
    const shapeEnum = shape === 'RECT' ? cv.MORPH_RECT : shape === 'CROSS' ? cv.MORPH_CROSS : cv.MORPH_ELLIPSE;
    const kernel = cv.getStructuringElement(shapeEnum, new cv.Size(kernelSize, kernelSize));
    const current = mask.clone();
    const temp = new cv.Mat();

    try {
        for (const op of ops) {
            const morphOp = op === 'close' ? cv.MORPH_CLOSE : cv.MORPH_OPEN;
            cv.morphologyEx(current, temp, morphOp, kernel);
            temp.copyTo(current);
        }
    } finally {
        temp.delete();
        kernel.delete();
    }

    return current; // Caller must .delete()
}

/**
 * Watershed segmentation to split large merged blobs.
 * Usa distance transform → peak detection → watershed para separar
 * copas de arvores sobrepostas.
 *
 * REGRA 5: rgbMat DEVE ser CV_8UC3. Markers DEVE ser CV_32S.
 *
 * @param cv - CV_8UC1 binary mask
 * @param mask - CV_8UC3 original image (required)
 * @returns Split mask CV_8UC1 (CALLER MUST .delete()) or null
 */
function _watershedSplit(cv: CvRuntime, mask: CvMat, rgbMat: CvMat): CvMat | null {
    const dist = new cv.Mat();
    const distNorm = new cv.Mat();
    const sureFg = new cv.Mat();
    const sureBg = new cv.Mat();
    const unknown = new cv.Mat();
    const markers = new cv.Mat();
    const dilateKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));

    try {
        // Step 1: Distance transform - distance to nearest zero pixel
        cv.distanceTransform(mask, dist, cv.DIST_L2, 5);

        // Step 2: Normalize to 0-255 and threshold for sure foreground (crown peaks)
        cv.normalize(dist, distNorm, 0, 255, cv.NORM_MINMAX);
        distNorm.convertTo(sureFg, cv.CV_8UC1);
        cv.threshold(sureFg, sureFg, WATERSHED_PEAK_RATIO * 255, 255, cv.THRESH_BINARY);

        // If no peaks found, watershed won't help - return null
        if (cv.countNonZero(sureFg) === 0) return null;

        // Step 3: Sure background via dilation (expand mask outward)
        cv.dilate(mask, sureBg, dilateKernel, new cv.Point(-1, -1), 3);

        // Step 4: Unknown region = sureBg - sureFg
        cv.subtract(sureBg, sureFg, unknown);

        // Step 5: Label connected components of sure foreground → markers CV_32S
        cv.connectedComponents(sureFg, markers);

        // Step 6: Shift labels +1 (background=1, not 0). Unknown regions → 0
        const mData = markers.data32S;
        const uData = unknown.data;
        for (let i = 0; i < mData.length; i++) {
            mData[i] += 1;
            if (uData[i] === 255) mData[i] = 0;
        }

        // Step 7: Watershed - modifies markers in-place
        // RULE 5: rgbMat MUST be CV_8UC3, markers MUST be CV_32S
        cv.watershed(rgbMat, markers);

        // Step 8: Build output mask - labeled regions (>1) → 255, boundaries (-1) → 0
        const splitMask = cv.Mat.zeros(mask.rows, mask.cols, cv.CV_8UC1);
        const splitData = splitMask.data;
        const finalData = markers.data32S;
        for (let i = 0; i < finalData.length; i++) {
            if (finalData[i] > 1) splitData[i] = 255;
        }

        return splitMask; // Caller must .delete()
    } finally {
        dist.delete();
        distNorm.delete();
        sureFg.delete();
        sureBg.delete();
        unknown.delete();
        markers.delete();
        dilateKernel.delete();
    }
}

/**
 * Trace skeleton pixels into ordered polyline paths.
 * Varredura greedy com 8-vizinhos para extrair centerlines de estradas.
 *
 * @param skelData - Skeleton image pixel data (0 or 255)
 * @param width - Minimum path length in pixels
 * @returns Array of polyline paths
 */
function _traceSkeleton(
    skelData: Uint8Array,
    width: number,
    height: number,
    minLength: number,
): Array<Array<{ x: number; y: number }>> {
    const paths: Array<Array<{ x: number; y: number }>> = [];
    const visited = new Uint8Array(width * height);

    // 8-connected neighbor offsets
    const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
    const dy = [-1, -1, -1, 0, 0, 1, 1, 1];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            if (skelData[idx] === 0 || visited[idx]) continue;

            // Walk from this pixel collecting the path
            const path: Array<{ x: number; y: number }> = [];
            let cx = x,
                cy = y;

            while (true) {
                const cidx = cy * width + cx;
                if (visited[cidx]) break;
                visited[cidx] = 1;
                path.push({ x: cx, y: cy });

                // Find first unvisited 8-neighbor
                let found = false;
                for (let d = 0; d < 8; d++) {
                    const nx = cx + dx[d]!;
                    const ny = cy + dy[d]!;
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                    const nidx = ny * width + nx;
                    if (skelData[nidx]! > 0 && !visited[nidx]) {
                        cx = nx;
                        cy = ny;
                        found = true;
                        break;
                    }
                }
                if (!found) break;
            }

            if (path.length >= minLength) {
                paths.push(path);
            }
        }
    }

    return paths;
}

/**
 * Simplify a pixel-space polyline using cv.approxPolyDP.
 * Converte [{x,y}] → cv.Mat → approxPolyDP → [{x,y}].
 */
function _simplifyPoints(cv: CvRuntime, points: PixelPoint[], epsilon: number, closed: boolean): PixelPoint[] {
    const flat: number[] = [];
    for (const p of points) {
        flat.push(p.x, p.y);
    }
    const src = cv.matFromArray(points.length, 1, cv.CV_32SC2, flat);
    const dst = new cv.Mat();

    try {
        cv.approxPolyDP(src, dst, epsilon, closed);
        return _matToPoints(dst);
    } finally {
        src.delete();
        dst.delete();
    }
}

// ================================================================
//  VEGETATION STRATEGY
//  Watershed → RETR_TREE → low-epsilon RDP → smoothPolygon
// ================================================================

const vegetationStrategy = {
    /**
     * @param cv - CV_8UC3 (for watershed) or null
     * @param binaryMask - { metersPerPixelX, metersPerPixelZ }
     */
    process(cv: CvRuntime, binaryMask: CvMat, rgbMat: CvMat | null, _pixelScale: any): StrategyResult {
        const features: any[] = [];
        let processed: any = null;
        let splitMask: any = null;
        let contours: any = null;
        let hierarchy: any = null;
        let hierarchyDataCopy: Int32Array | null = null;

        try {
            // Step 1: Morphological close (5×5 ellipse) - close canopy gaps
            processed = _morphProcess(cv, binaryMask, ['close'], 5, 'ELLIPSE');

            // Step 2: Watershed for large merged canopies (if rgbMat available)
            if (rgbMat) {
                // Check if mask has large connected regions worth splitting
                const totalNonZero = cv.countNonZero(processed);
                if (totalNonZero > WATERSHED_MIN_BLOB_PX) {
                    splitMask = _watershedSplit(cv, processed, rgbMat);
                    if (splitMask) {
                        // Use the split mask for contour extraction
                        processed.delete();
                        processed = splitMask;
                        splitMask = null; // Ownership transferred to processed
                    }
                }
            }

            // Step 3: Find contours with hierarchy
            contours = new cv.MatVector();
            hierarchy = new cv.Mat();
            cv.findContours(processed, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_TC89_L1);

            // Copy hierarchy data before cleanup
            const count = contours.size();
            if (hierarchy.data32S && hierarchy.data32S.length > 0) {
                hierarchyDataCopy = new Int32Array(hierarchy.data32S);
            }

            // Step 4: Process each contour
            const epsilon = adaptiveEpsilon('vegetation');
            const minArea = minAreaPx('vegetation');

            for (let i = 0; i < count; i++) {
                const cnt = contours.get(i);
                const area = cv.contourArea(cnt);
                if (area < minArea) continue;

                // Simplify with low epsilon → smooth organic curves
                const simplified = _simplifyPoints(cv, _matToPoints(cnt), epsilon, true);

                // Gaussian smoothing for organic shapes
                const smoothed = smoothPolygon(simplified, 1.5, 3);

                const rect = cv.boundingRect(cnt);
                const fillRatio = area / (rect.width * rect.height || 1);

                features.push({
                    _contourIdx: i,
                    contour: smoothed,
                    family: 'habitat',
                    geometryType: 'Polygon',
                    confidence: _computeConfidence(area, fillRatio),
                    area_px: area,
                    strategy: 'vegetation',
                    regularized: false,
                });
            }
        } finally {
            if (splitMask) splitMask.delete();
            if (processed) processed.delete();
            if (contours) contours.delete();
            if (hierarchy) hierarchy.delete();
        }

        return { features, hierarchyData: hierarchyDataCopy, contourCount: features.length };
    },
};

// ================================================================
//  BUILDING STRATEGY
//  Morph close+open → RETR_TREE → L-shape check → minAreaRect/approxPolyDP
// ================================================================

const buildingStrategy = {
    process(cv: CvRuntime, binaryMask: CvMat, _rgbMat: CvMat | null, _pixelScale: any): StrategyResult {
        const features: any[] = [];
        let processed: any = null;
        let contours: any = null;
        let hierarchy: any = null;
        let hierarchyDataCopy: Int32Array | null = null;

        try {
            // Step 1: Morphological close + open (3×3 rect) - close gaps, remove noise
            processed = _morphProcess(cv, binaryMask, ['close', 'open'], 3, 'RECT');

            // Step 2: Find contours with hierarchy
            contours = new cv.MatVector();
            hierarchy = new cv.Mat();
            cv.findContours(processed, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

            const count = contours.size();
            if (hierarchy.data32S && hierarchy.data32S.length > 0) {
                hierarchyDataCopy = new Int32Array(hierarchy.data32S);
            }

            // Step 3: Process each contour
            const epsilon = adaptiveEpsilon('building');
            const minArea = minAreaPx('building');

            for (let i = 0; i < count; i++) {
                const cnt = contours.get(i);
                const area = cv.contourArea(cnt);
                if (area < minArea) continue;

                let polygon;
                let regularized = false;

                // RULE 6: L-Shaped Building Trap
                // Check if minAreaRect is appropriate (fill ratio > 0.85)
                const rotRect = cv.minAreaRect(cnt);
                const fillRatio = contourRectFillRatio(area, rotRect);

                if (fillRatio > BUILDING_RECT_THRESHOLD) {
                    // Compact rectangular shape → use minAreaRect for clean geometry
                    polygon = rotatedRectPoints(rotRect);
                    regularized = true;
                } else {
                    // Complex shape (L, T, U) → aggressive approxPolyDP + regularize
                    const simplified = _simplifyPoints(cv, _matToPoints(cnt), epsilon, true);
                    polygon = regularizePolygon(simplified, 15);
                    regularized = true;
                }

                features.push({
                    _contourIdx: i,
                    contour: polygon,
                    family: 'building',
                    geometryType: 'Polygon',
                    confidence: _computeConfidence(area, fillRatio) + (fillRatio > 0.85 ? 0.1 : 0),
                    area_px: area,
                    strategy: 'building',
                    regularized,
                });
            }
        } finally {
            if (processed) processed.delete();
            if (contours) contours.delete();
            if (hierarchy) hierarchy.delete();
        }

        return { features, hierarchyData: hierarchyDataCopy, contourCount: features.length };
    },
};

// ================================================================
//  ROADS STRATEGY
//  Morph close → skeletonize → trace centerline → also extract footprint
// ================================================================

const roadsStrategy = {
    process(cv: CvRuntime, binaryMask: CvMat, _rgbMat: CvMat | null, _pixelScale: any): StrategyResult {
        const features: any[] = [];
        let processed: any = null;
        let skel: CvMat | null = null;
        let contours: any = null;
        let hierarchy: any = null;
        let hierarchyDataCopy: Int32Array | null = null;

        try {
            // Step 1: Morphological close (3×3 rect)
            processed = _morphProcess(cv, binaryMask, ['close'], 3, 'RECT');

            // Step 2: Skeletonization → centerline (RULE 7: custom fallback)
            skel = morphologicalSkeleton(cv, processed) as CvMat;

            // Step 3: Trace skeleton into ordered polyline paths
            const paths = _traceSkeleton(skel.data, skel.cols, skel.rows, ROAD_MIN_PATH_PX);
            const epsilon = adaptiveEpsilon('roads');

            for (const path of paths) {
                // Simplify centerline with RDP
                const simplified = _simplifyPoints(cv, path, epsilon, false);
                if (simplified.length < 2) continue;

                features.push({
                    _contourIdx: -1, // No hierarchy for skeleton traces
                    contour: simplified,
                    family: 'marker',
                    markerType: 'road',
                    geometryType: 'LineString',
                    confidence: _computeConfidence(path.length * 2, 0.5),
                    area_px: path.length, // Length proxy
                    strategy: 'roads',
                    regularized: false,
                });
            }

            // Step 4: Also extract road footprint polygons (for area)
            contours = new cv.MatVector();
            hierarchy = new cv.Mat();
            cv.findContours(processed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            const count = contours.size();
            if (hierarchy.data32S && hierarchy.data32S.length > 0) {
                hierarchyDataCopy = new Int32Array(hierarchy.data32S);
            }

            const minArea = minAreaPx('roads');

            for (let i = 0; i < count; i++) {
                const cnt = contours.get(i);
                const area = cv.contourArea(cnt);
                if (area < minArea) continue;

                const simplified = _simplifyPoints(cv, _matToPoints(cnt), epsilon, true);

                features.push({
                    _contourIdx: i,
                    contour: simplified,
                    family: 'marker',
                    markerType: 'road_footprint',
                    geometryType: 'Polygon',
                    confidence: _computeConfidence(area, 0.6),
                    area_px: area,
                    strategy: 'roads',
                    regularized: false,
                });
            }
        } finally {
            if (skel) skel.delete();
            if (processed) processed.delete();
            if (contours) contours.delete();
            if (hierarchy) hierarchy.delete();
        }

        return { features, hierarchyData: hierarchyDataCopy, contourCount: features.length };
    },
};

// ================================================================
//  WATER STRATEGY
//  Morph close(7×7) + open(5×5) → RETR_TREE → aspect ratio → lake/river
// ================================================================

const waterStrategy = {
    process(cv: CvRuntime, binaryMask: CvMat, _rgbMat: CvMat | null, _pixelScale: any): StrategyResult {
        const features: any[] = [];
        let processed: any = null;
        let smoothed: any = null;
        let contours: any = null;
        let hierarchy: any = null;
        let hierarchyDataCopy: Int32Array | null = null;

        try {
            // Step 1: Morphological close (7×7 ellipse) - smooth shoreline
            processed = _morphProcess(cv, binaryMask, ['close'], 7, 'ELLIPSE');

            // Step 2: Additional open (5×5 ellipse) - remove small protrusions
            const kernelOpen = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
            smoothed = new cv.Mat();
            try {
                cv.morphologyEx(processed, smoothed, cv.MORPH_OPEN, kernelOpen);
            } finally {
                kernelOpen.delete();
            }

            // Step 3: Find contours with hierarchy
            contours = new cv.MatVector();
            hierarchy = new cv.Mat();
            cv.findContours(smoothed, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_TC89_L1);

            const count = contours.size();
            if (hierarchy.data32S && hierarchy.data32S.length > 0) {
                hierarchyDataCopy = new Int32Array(hierarchy.data32S);
            }

            // Step 4: Process each contour - classify by aspect ratio
            const epsilon = adaptiveEpsilon('water');
            const minArea = minAreaPx('water');

            for (let i = 0; i < count; i++) {
                const cnt = contours.get(i);
                const area = cv.contourArea(cnt);
                if (area < minArea) continue;

                const rect = cv.boundingRect(cnt);
                const aspectRatio = Math.max(rect.width, rect.height) / (Math.min(rect.width, rect.height) || 1);

                // Simplify contour
                const simplified = _simplifyPoints(cv, _matToPoints(cnt), epsilon, true);
                const fillRatio = area / (rect.width * rect.height || 1);

                if (aspectRatio > 3) {
                    // Elongated → river (LineString centerline)
                    // Use skeleton of this specific contour for centerline
                    const contourMask = cv.Mat.zeros(binaryMask.rows, binaryMask.cols, cv.CV_8UC1);
                    try {
                        cv.drawContours(contourMask, contours, i, new cv.Scalar(255), cv.FILLED);
                        const riverSkel = morphologicalSkeleton(cv, contourMask) as CvMat;
                        try {
                            const paths = _traceSkeleton(riverSkel.data, riverSkel.cols, riverSkel.rows, 10);
                            if (paths.length > 0) {
                                // Use longest path as the river centerline
                                const longest = paths.reduce((a, b) => (a.length > b.length ? a : b));
                                features.push({
                                    _contourIdx: i,
                                    contour: smoothPolygon(_simplifyPoints(cv, longest, epsilon, false), 1.5, 3),
                                    family: 'river',
                                    geometryType: 'LineString',
                                    confidence: _computeConfidence(area, fillRatio),
                                    area_px: area,
                                    strategy: 'water',
                                    regularized: false,
                                });
                            }
                        } finally {
                            riverSkel.delete();
                        }
                    } finally {
                        contourMask.delete();
                    }
                } else {
                    // Compact → lake (Polygon)
                    features.push({
                        _contourIdx: i,
                        contour: smoothPolygon(simplified, 1.5, 3),
                        family: 'lake',
                        geometryType: 'Polygon',
                        confidence: _computeConfidence(area, fillRatio),
                        area_px: area,
                        strategy: 'water',
                        regularized: false,
                    });
                }
            }
        } finally {
            if (smoothed) smoothed.delete();
            if (processed) processed.delete();
            if (contours) contours.delete();
            if (hierarchy) hierarchy.delete();
        }

        return { features, hierarchyData: hierarchyDataCopy, contourCount: features.length };
    },
};

// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------

export const STRATEGIES: { [key: string]: { process: Function } } = {
    vegetation: vegetationStrategy,
    building: buildingStrategy,
    roads: roadsStrategy,
    water: waterStrategy,
};
