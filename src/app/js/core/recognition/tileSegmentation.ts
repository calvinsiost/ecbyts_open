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
   TILE SEGMENTATION — Map Tile-Based Segmentation Pipeline
   ================================================================

   Segmentacao de imagens de satelite a partir de tiles de mapa.
   Inspirado pelo tms_to_geotiff do segment-geospatial (samgeo).

   Pipeline: bbox WGS84 → stitchTiles() → SAM auto-mask → features.
   Integra infraestrutura existente: tileStitcher + mapPicker + samAutoMask.

   ================================================================ */

import { stitchTiles } from '../io/geo/tileStitcher.js';
import { generateAutoMasks, autoMasksToFeatures } from './samAutoMask.js';
import { segmentByText } from './clipClassifier.js';

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Segment features from satellite tiles for a geographic region.
 * Pipeline: tiles → stitched image → SAM auto-mask → features.
 *
 * @param {{ latitude: number, longitude: number }} sw - Southwest WGS84
 * @param {{ latitude: number, longitude: number }} ne - Northeast WGS84
 * @param {Object} [options={}]
 * @param {number} [options.outputSize=512] - Stitched image size px
 * @param {string} [options.method='autoMask'] - 'autoMask' | 'textPrompt'
 * @param {string} [options.textPrompt] - Required if method='textPrompt'
 * @param {AbortSignal} [options.signal] - Cancellation
 * @param {Function} [options.onProgress] - { message, progress }
 * @returns {Promise<any>}
 */
export async function segmentFromTiles(sw: any, ne: any, options: any = {}) {
    const { outputSize = 512, method = 'autoMask', textPrompt, signal, onProgress } = options;

    // Validate coordinates
    _validateCoords(sw, ne);

    // Warn if bbox is very large (>5km diagonal)
    const diagKm = _bboxDiagonalKm(sw, ne);
    if (diagKm > 5) {
        console.warn(
            `[TileSegmentation] Large bbox (${diagKm.toFixed(1)} km) — satellite resolution may be insufficient for detailed segmentation`,
        );
    }

    // Fetch satellite tiles
    _notify(onProgress, 'Fetching satellite tiles...', 10);
    const imageDataUrl = await stitchTiles(sw, ne, outputSize);

    if (!imageDataUrl) {
        throw new Error('Failed to fetch satellite imagery for this region');
    }

    if (signal?.aborted) return { features: [], imageDataUrl, extent: _bboxToExtent(sw, ne), bbox: { sw, ne } };

    // Convert WGS84 bbox to Three.js extent (meters)
    const extent = _bboxToExtent(sw, ne);

    // Segment
    _notify(onProgress, 'Segmenting satellite imagery...', 30);
    let features;

    if (method === 'textPrompt' && textPrompt) {
        features = await segmentByText(imageDataUrl, textPrompt, extent, {
            ...options,
            onProgress: (/** @type {any} */ info: any) => _notify(onProgress, info.message, 30 + info.progress * 0.7),
        });
    } else {
        const masks = await generateAutoMasks(imageDataUrl, extent, {
            ...options,
            onProgress: (/** @type {any} */ info: any) => _notify(onProgress, info.message, 30 + info.progress * 0.6),
        });
        features = autoMasksToFeatures(masks, extent, imageDataUrl);
    }

    _notify(onProgress, `${features.length} features detected`, 100);

    return {
        features,
        imageDataUrl,
        extent,
        bbox: { sw, ne },
    };
}

// ----------------------------------------------------------------
// INTERNAL - Coordinate Conversion
// ----------------------------------------------------------------

/**
 * Convert WGS84 bbox to Three.js world extent (meters).
 * Aproximacao haversine - aceitavel para areas < 10km e lat < 60°.
 */
function _bboxToExtent(/** @type {any} */ sw: any, /** @type {any} */ ne: any) {
    const midLat = (sw.latitude + ne.latitude) / 2;
    const cosLat = Math.cos((midLat * Math.PI) / 180);

    const widthM = (ne.longitude - sw.longitude) * cosLat * 111320;
    const heightM = (ne.latitude - sw.latitude) * 110540;

    // Center at origin
    return {
        minX: -widthM / 2,
        maxX: widthM / 2,
        minZ: -heightM / 2,
        maxZ: heightM / 2,
    };
}

/**
 * Compute bbox diagonal in kilometers.
 */
function _bboxDiagonalKm(/** @type {any} */ sw: any, /** @type {any} */ ne: any) {
    const dLat = (ne.latitude - sw.latitude) * 110.54;
    const midLat = (sw.latitude + ne.latitude) / 2;
    const dLng = (ne.longitude - sw.longitude) * 111.32 * Math.cos((midLat * Math.PI) / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng);
}

// ----------------------------------------------------------------
// INTERNAL - Validation
// ----------------------------------------------------------------

function _validateCoords(/** @type {any} */ sw: any, /** @type {any} */ ne: any) {
    if (!sw || !ne) throw new Error('Southwest and northeast coordinates are required');

    if (sw.latitude < -90 || sw.latitude > 90 || ne.latitude < -90 || ne.latitude > 90) {
        throw new Error('Invalid coordinates: latitude must be between -90 and 90');
    }
    if (sw.longitude < -180 || sw.longitude > 180 || ne.longitude < -180 || ne.longitude > 180) {
        throw new Error('Invalid coordinates: longitude must be between -180 and 180');
    }
    if (sw.latitude >= ne.latitude) {
        throw new Error('Southwest latitude must be less than northeast latitude');
    }
    if (sw.longitude >= ne.longitude) {
        throw new Error('Bounding box crossing the antimeridian is not supported');
    }
}

// ----------------------------------------------------------------
// INTERNAL HELPER
// ----------------------------------------------------------------

function _notify(/** @type {any} */ onProgress: any, /** @type {any} */ message: any, /** @type {any} */ progress: any) {
    onProgress?.({ message, progress });
}
