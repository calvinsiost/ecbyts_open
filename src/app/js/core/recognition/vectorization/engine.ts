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
   ENGINE — Universal Vectorization Engine orchestrator
   ================================================================

   Pipeline principal: recebe imagem aerea + mascara de categorias
   do SegFormer/colorAnalysis e produz GeoJSON georreferenciado
   via OpenCV.js com estrategias CV por familia.

   FLUXO:
   1. Carrega OpenCV.js (lazy ~8MB, cached)
   2. Converte categoryGrid → cv.Mat binario por categoria
   3. Despacha para estrategia CV especifica (vegetation/building/roads/water)
   4. Constroi hierarquia pai-filho (RETR_TREE)
   5. Georreferencia contornos pixel → WGS84
   6. Monta FeatureCollection GeoJSON (RFC 7946)

   REGRAS CRITICAS:
   - RULE 1 (Memory): Todo cv.Mat em try/finally com .delete()
   - RULE 2 (UI Yield): await setTimeout(0) entre categorias
   - RULE 3 (Winding): Outer=CCW, Inner=CW, 6 decimais
   - RULE 4 (Topology): Holes → inner rings, Micro → features separadas

   ================================================================ */
import { STRATEGIES, CATEGORY_STRATEGY } from './strategies.js';
import { buildHierarchyTree, assignHierarchy } from './hierarchy.js';
import { computePixelScale, contourToWorld, contourToWGS84, ensureWinding, ensureClosed, computeAreaM2, computePerimeterM, computeLengthM, } from './georeference.js';
import { getOrigin, getEPSG } from '../../io/geo/coordinates.js';
import { yieldToMain } from '../../../utils/performance/yielding.js';
// Fallback pipeline (existing BFS blob finder)
import { findBlobs, extractContour, morphClose, blobToFeature } from '../colorAnalysis.js';
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const ANALYSIS_SIZE = 512;
const ACTIVE_CATEGORIES = [1, 2, 4, 5, 6]; // water, veg, building, infra, soil
const CATEGORY_NAMES: Record<number, string> = {
    1: 'water',
    2: 'vegetation',
    4: 'building',
    5: 'infrastructure',
    6: 'soil',
};
/**
 * @typedef {{ minX: number, maxX: number, minZ: number, maxZ: number }} VectorExtent
 * @typedef {{ delete(): void, data: Uint8Array | Uint8ClampedArray | number[] }} CvMatLike
 * @typedef {{ features: any[], hierarchyData?: ArrayLike<number>, _contourCount?: number }} StrategyResult
 */
// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------
interface VectorExtent {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

interface CvMatLike {
    delete(): void;
    data: Uint8Array | Uint8ClampedArray | number[];
}

interface StrategyResult {
    features: Array<Record<string, unknown>>;
    hierarchyData?: ArrayLike<number>;
    _contourCount?: number;
}

interface VectorizeParams {
    imageDataUrl: string;
    categoryGrid: Uint8Array;
    extent: VectorExtent;
    onProgress?: (payload: { status: string; message: string; progress: number }) => void;
}

interface FeatureLike {
    _vectorId?: string;
    _contourIdx?: number;
    contour: Array<{ x: number; y: number }>;
    geometryType?: string;
    family?: string;
    hierarchy_level?: string;
    parent_id?: string | number | null;
    confidence?: number;
    strategy?: string;
    regularized?: boolean;
    markerType?: string;
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Vectorize semantic mask into georeferenced GeoJSON FeatureCollection.
 * Pipeline principal do Universal Vectorization Engine.
 *
 * @param {Object} params
 * @param {string} params.imageDataUrl - Base64 data URL da imagem original
 * @param {Uint8Array} params.categoryGrid - 512×512 category grid (0-6)
 * @param {Object} params.extent - { minX, maxX, minZ, maxZ } in Three.js world coords
 * @param {Function} [params.onProgress] - Callback: { status, message, progress }
 * @returns {Promise<Object>} - GeoJSON FeatureCollection (RFC 7946, EPSG:4326)
 */
export async function vectorize({ imageDataUrl, categoryGrid, extent, onProgress }: VectorizeParams) {
    validateVectorizeInput(categoryGrid, extent);

    const cv = await loadOpenCVWithFallback(onProgress);
    if (!cv) {
        return _fallbackVectorize(categoryGrid, extent, onProgress);
    }

    _notify(onProgress, 'processing', 'Preparing image...', 10);

    let baseMat: CvMatLike | null = null;
    let rgbMat: CvMatLike | null = null;
    try {
        baseMat = cv.matFromArray(ANALYSIS_SIZE, ANALYSIS_SIZE, cv.CV_8UC1, categoryGrid);
        rgbMat = await _loadImageAsMat(cv, imageDataUrl);

        const pixelScale = computePixelScale(extent, ANALYSIS_SIZE, ANALYSIS_SIZE);
        const allFeatures = processCategories(cv, baseMat!, rgbMat!, extent, pixelScale, onProgress);

        _notify(onProgress, 'finalizing', 'Building GeoJSON...', 90);
        const fc = _buildFeatureCollection(allFeatures, extent);
        _notify(onProgress, 'done', `Vectorization complete: ${allFeatures.length} features`, 100);
        return fc;
    }
    finally {
        if (baseMat) baseMat.delete();
        if (rgbMat) rgbMat.delete();
    }
}

function validateVectorizeInput(categoryGrid: Uint8Array, extent: VectorExtent): void {
    if (!(categoryGrid instanceof Uint8Array) || categoryGrid.length !== ANALYSIS_SIZE * ANALYSIS_SIZE) {
        throw new Error(`categoryGrid must be Uint8Array(${ANALYSIS_SIZE * ANALYSIS_SIZE})`);
    }
    if (!extent || extent.minX == null || extent.maxX == null || extent.minZ == null || extent.maxZ == null) {
        throw new Error('extent must have minX, maxX, minZ, maxZ');
    }
}

async function loadOpenCVWithFallback(
    onProgress?: VectorizeParams['onProgress'],
): Promise<Record<string, any> | null> {
    try {
        const { isOpenCVLoaded, getCV } = await import('./loader.js' as string);
        if (isOpenCVLoaded()) {
            return getCV();
        }
        _notify(onProgress, 'fallback', 'Using fast vectorization pipeline...', 5);
        return null;
    }
    catch (err: any) {
        console.warn('OpenCV.js not available, using fallback pipeline:', err.message);
        return null;
    }
}

function processCategories(
    cv: Record<string, any>,
    baseMat: CvMatLike,
    rgbMat: CvMatLike,
    extent: VectorExtent,
    pixelScale: ReturnType<typeof computePixelScale>,
    onProgress?: VectorizeParams['onProgress'],
): Array<Record<string, unknown>> {
    const allFeatures: Array<Record<string, unknown>> = [];
    let globalFeatureIdx = 0;

    for (let catIdx = 0; catIdx < ACTIVE_CATEGORIES.length; catIdx++) {
        const cat = ACTIVE_CATEGORIES[catIdx];
        if (cat === undefined) continue;

        const strategyKey = CATEGORY_STRATEGY[cat];
        if (!strategyKey || !STRATEGIES[strategyKey]) continue;

        const catName = CATEGORY_NAMES[cat] || `category_${cat}`;
        const progress = 20 + Math.round((catIdx / ACTIVE_CATEGORIES.length) * 60);
        _notify(onProgress, 'processing', `Vectorizing ${catName}...`, progress);

        // RULE 2: Yield to UI between categories so spinner renders
        yieldToMain({ timeoutMs: 0 }).catch(() => undefined);

        const binaryMask = cv.Mat.zeros(ANALYSIS_SIZE, ANALYSIS_SIZE, cv.CV_8UC1);
        try {
            fillBinaryMask(baseMat.data, binaryMask.data, cat);

            if (cv.countNonZero(binaryMask) === 0) continue;

            const result = STRATEGIES[strategyKey].process(cv, binaryMask, rgbMat, pixelScale) as StrategyResult;
            const categoryFeatures = _processStrategyResult(result, globalFeatureIdx, extent);
            allFeatures.push(...categoryFeatures);
            globalFeatureIdx += categoryFeatures.length;
        }
        finally {
            binaryMask.delete();
        }
    }

    return allFeatures;
}

function fillBinaryMask(
    baseData: Uint8Array | Uint8ClampedArray | number[],
    maskData: Uint8Array | Uint8ClampedArray | number[],
    cat: number,
): void {
    for (let i = 0; i < baseData.length; i++) {
        if (baseData[i] === cat) maskData[i] = 255;
    }
}

// ----------------------------------------------------------------
// INTERNAL - Process strategy results with hierarchy + georeferencing
// ----------------------------------------------------------------
/**
 * Process features from a single strategy: apply hierarchy, georeference, format.
 *
 * @param {StrategyResult} result - { features, hierarchyData, contourCount } from strategy
 * @param {number} startIdx - Global feature index offset
 * @param {VectorExtent} extent
 * @returns {Array<Object>} - Processed features ready for GeoJSON
 */
function _processStrategyResult(result: StrategyResult, startIdx: number, extent: VectorExtent) {
    const { features, hierarchyData, _contourCount } = result;
    if (features.length === 0) return [];

    const typedFeatures = features as unknown as FeatureLike[];
    assignVectorIds(typedFeatures, startIdx);
    const { processedFeatures, holes } = processHierarchy(typedFeatures, hierarchyData, _contourCount);

    const output: Array<Record<string, unknown>> = [];
    for (const f of processedFeatures) {
        output.push(buildFeatureFromProcessed(f, holes, extent));
    }
    return output;
}

function assignVectorIds(features: FeatureLike[], startIdx: number): void {
    for (let i = 0; i < features.length; i++) {
        const feature = features[i];
        if (feature) feature._vectorId = `vec_${String(startIdx + i).padStart(3, '0')}`;
    }
}

function processHierarchy(
    features: FeatureLike[],
    hierarchyData: ArrayLike<number> | undefined,
    _contourCount: number | undefined,
): { processedFeatures: FeatureLike[]; holes: Map<number, unknown[]> } {
    let processedFeatures = features;
    let holes = new Map<number, unknown[]>();

    if (hierarchyData && hierarchyData.length >= 4) {
        const hContourCount = hierarchyData.length / 4;
        const hierarchyArray = Array.from(hierarchyData) as number[];
        const tree = buildHierarchyTree(hierarchyArray, hContourCount);
        const hResult = assignHierarchy(features as unknown as Array<Record<string, unknown>>, tree);
        processedFeatures = hResult.features as unknown as FeatureLike[];
        holes = hResult.holes as Map<number, unknown[]>;
    }
    else {
        for (const f of processedFeatures) {
            if (f) {
                f.hierarchy_level = 'macro';
                f.parent_id = null;
            }
        }
    }

    return { processedFeatures, holes };
}

function buildFeatureFromProcessed(
    f: FeatureLike,
    holes: Map<number, unknown[]>,
    extent: VectorExtent,
): Record<string, unknown> {
    const isLine = f.geometryType === 'LineString';
    const wgs84Ring = buildExteriorRing(f, extent, isLine);
    const worldContour = contourToWorld(f.contour, extent, ANALYSIS_SIZE, ANALYSIS_SIZE);
    const geometry = isLine
        ? { type: 'LineString', coordinates: wgs84Ring }
        : buildPolygonGeometry(f, wgs84Ring, holes, extent);
    const properties = buildFeatureProperties(f, worldContour, isLine);

    return {
        type: 'Feature',
        geometry,
        properties,
    };
}

function buildExteriorRing(
    f: FeatureLike,
    extent: VectorExtent,
    isLine: boolean,
): Array<[number, number]> {
    let ring = contourToWGS84(f.contour, extent, ANALYSIS_SIZE, ANALYSIS_SIZE);
    if (!isLine) {
        ring = ensureWinding(ring, false);
        ring = ensureClosed(ring);
    }
    return ring;
}

function buildPolygonGeometry(
    f: FeatureLike,
    exteriorRing: Array<[number, number]>,
    holes: Map<number, unknown[]>,
    extent: VectorExtent,
): Record<string, unknown> {
    const rings: Array<Array<[number, number]>> = [exteriorRing];
    const contourHoles = holes.get(f._contourIdx ?? -1);
    if (contourHoles) {
        for (const holeContour of contourHoles) {
            const contour = holeContour as Array<{ x: number; y: number }>;
            let holeRing = contourToWGS84(contour, extent, ANALYSIS_SIZE, ANALYSIS_SIZE);
            // RULE 3: Holes must be CW
            holeRing = ensureWinding(holeRing, true);
            holeRing = ensureClosed(holeRing);
            rings.push(holeRing);
        }
    }
    return {
        type: 'Polygon',
        coordinates: rings,
    };
}

function buildFeatureProperties(
    f: FeatureLike,
    worldContour: Array<{ x: number; y: number }>,
    isLine: boolean,
): Record<string, unknown> {
    const area_m2 = isLine ? null : Number(computeAreaM2(worldContour).toFixed(2));
    const perimeter_m = isLine
        ? Number(computeLengthM(worldContour).toFixed(2))
        : Number(computePerimeterM(worldContour).toFixed(2));

    return {
        id: f._vectorId,
        family: f.family,
        hierarchy_level: f.hierarchy_level || 'macro',
        parent_id: f.parent_id || null,
        confidence: Number((f.confidence || 0.5).toFixed(2)),
        area_m2,
        perimeter_m,
        vertex_count: f.contour.length,
        strategy: f.strategy,
        source_method: 'vectorization',
        regularized: f.regularized || false,
        ...(f.markerType ? { marker_type: f.markerType } : {}),
    };
}

// ----------------------------------------------------------------
// INTERNAL - Build GeoJSON FeatureCollection
// ----------------------------------------------------------------
/**
 * @param {Array<Object>} features
 * @param {VectorExtent} unknown>>
 */
function _buildFeatureCollection(features: Array<Record<string, unknown>>, extent: VectorExtent) {
    const origin = getOrigin();
    return {
        type: 'FeatureCollection',
        crs: {
            type: 'name',
            properties: { name: 'urn:ogc:def:crs:EPSG::4326' },
        },
        metadata: {
            exported: new Date().toISOString(),
            source: 'ecbyts Vectorization Engine',
            version: '1.0.0',
            utmOrigin: {
                easting: origin.easting,
                northing: origin.northing,
                elevation: origin.elevation,
                zone: origin.zone,
                hemisphere: origin.hemisphere,
                epsg: getEPSG(Number(origin.zone), String(origin.hemisphere || '')),
            },
            extent,
            imageSize: [ANALYSIS_SIZE, ANALYSIS_SIZE],
            featureCount: features.length,
        },
        features,
    };
}

// ----------------------------------------------------------------
// INTERNAL - Load image as CV_8UC3 Mat (no alpha)
// ----------------------------------------------------------------
/**
 * Load a base64 image into an OpenCV Mat (CV_8UC3).
 * Remove canal alpha - RULE 5: watershed requer exatamente 3 canais.
 *
 * @param {any} cv
 * @param {string} any>
 * @returns {Promise<CvMatLike>} - cv.Mat CV_8UC3 (CALLER MUST .delete())
 */
function _loadImageAsMat(cv: Record<string, any>, dataUrl: string): Promise<CvMatLike> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = ANALYSIS_SIZE;
            canvas.height = ANALYSIS_SIZE;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Failed to create 2D canvas context for vectorization'));
                return;
            }
            ctx.drawImage(img, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
            const imageData = ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
            const rgba = imageData.data; // Uint8ClampedArray RGBA
            // Convert RGBA → RGB (remove alpha channel)
            const rgb = new Uint8Array(ANALYSIS_SIZE * ANALYSIS_SIZE * 3);
            for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
                const r = rgba[i];
                const g = rgba[i + 1];
                const b = rgba[i + 2];
                if (r !== undefined) rgb[j] = r;
                if (g !== undefined) rgb[j + 1] = g;
                if (b !== undefined) rgb[j + 2] = b;
            }
            const mat = cv.matFromArray(ANALYSIS_SIZE, ANALYSIS_SIZE, cv.CV_8UC3, rgb);
            resolve(mat);
        };
        img.onerror = () => reject(new Error('Failed to load image for vectorization'));
        img.src = dataUrl;
    });
}

// ----------------------------------------------------------------
// INTERNAL - Fallback pipeline (no OpenCV)
// ----------------------------------------------------------------
/**
 * Fallback vectorization using existing BFS blob pipeline.
 * Usado quando OpenCV.js falha ao carregar (CDN down, CORS, etc).
 *
 * @param {Uint8Array} categoryGrid
 * @param {VectorExtent} extent
 * @param {Function | undefined} onProgress
 * @returns {Object} - GeoJSON FeatureCollection (simplified)
 */
function _fallbackVectorize(categoryGrid: Uint8Array, extent: VectorExtent, onProgress?: VectorizeParams['onProgress']) {
    _notify(onProgress, 'fallback', 'Using fallback pipeline (no OpenCV)...', 10);
    const darkIdx = 4;
    const buildingSet = new Set([darkIdx]);
    const closedGrid = morphClose(categoryGrid, ANALYSIS_SIZE, ANALYSIS_SIZE, buildingSet);
    const { blobs, blobGrid } = findBlobs(closedGrid, ANALYSIS_SIZE, ANALYSIS_SIZE);
    const totalPixels = ANALYSIS_SIZE * ANALYSIS_SIZE;
    blobs.forEach((blob, i: number) => {
        blob.contour = extractContour(blobGrid, i + 1, blob, ANALYSIS_SIZE, ANALYSIS_SIZE);
    });
    const features = blobs
        .map((b: any) => blobToFeature(b, ANALYSIS_SIZE, ANALYSIS_SIZE, extent, totalPixels))
        .filter((f: any) => f !== null);
    // Convert to minimal GeoJSON features
    const geoFeatures = features.map((f: any, i: number) => {
        const sourceContour = (f.contours?.[0] || []).map((p: any) => ({
            x: p.x * ANALYSIS_SIZE,
            y: p.y * ANALYSIS_SIZE,
        }));
        const wgs84Ring = contourToWGS84(sourceContour, extent, ANALYSIS_SIZE, ANALYSIS_SIZE);
        return {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [ensureClosed(ensureWinding(wgs84Ring, false))],
            },
            properties: {
                id: `vec_${String(i).padStart(3, '0')}`,
                family: f.family,
                hierarchy_level: 'macro',
                parent_id: null,
                confidence: f.confidence,
                area_m2: null,
                perimeter_m: null,
                strategy: 'fallback',
                source_method: 'vectorization_fallback',
            },
        };
    });
    _notify(onProgress, 'done', `Fallback complete: ${geoFeatures.length} features`, 100);
    return _buildFeatureCollection(geoFeatures, extent);
}

// ----------------------------------------------------------------
// INTERNAL - Progress notification helper
// ----------------------------------------------------------------
/**
 * @param {Function | undefined} cb
 * @param {string} status
 * @param {string} message
 * @param {number} progress
 */
function _notify(
    cb: VectorizeParams['onProgress'],
    status: string,
    message: string,
    progress: number,
): void {
    if (typeof cb === 'function') {
        cb({ status, message, progress });
    }
}
