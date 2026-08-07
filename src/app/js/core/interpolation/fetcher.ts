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
   ELEVATION FETCHER — Busca dados de elevação de serviços web
   ================================================================

   Dois modos de obtenção:

   1. GRID (AWS Terrain Tiles) — tile PNG Terrarium 256×256
      Para superfície topográfica completa.
      Decode: height = (R*256 + G + B/256) - 32768

   2. PONTOS (Open-Meteo) — API REST com CORS
      Para elevação em coordenadas específicas (poços).
      Até 100 pontos por request, sem API key.

   ================================================================ */

import { relativeToWGS84, getOrigin, hasOrigin } from '../io/geo/coordinates.js';
import { buildOverlayUrlsFromBbox } from '../io/geo/overlayUrls.js';

// ----------------------------------------------------------------
// CONSTANTES
// ----------------------------------------------------------------

const AWS_TERRAIN_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/elevation';

// ----------------------------------------------------------------
// UTILITÁRIOS DE TILE
// ----------------------------------------------------------------

/**
 * Converte lat/lon para coordenadas de tile XYZ (Web Mercator).
 * @param {number} lat - latitude em graus
 * @param {number} lon - longitude em graus
 * @param {number} zoom - nível de zoom
 * @returns {{ x: number, y: number }}
 */
function latLonToTile(lat: any, lon: any, zoom: any) {
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lon + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
    return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

/**
 * Calcula o bbox geográfico de um tile.
 * @param {number} x - tile X
 * @param {number} y - tile Y
 * @param {number} zoom - zoom level
 * @returns {{ north: number, south: number, east: number, west: number }}
 */
function tileBbox(x: any, y: any, zoom: any) {
    const n = Math.pow(2, zoom);
    const west = (x / n) * 360 - 180;
    const east = ((x + 1) / n) * 360 - 180;
    const north = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
    const south = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
    return { north, south, east, west };
}

/**
 * Calcula zoom ideal para um extent em metros.
 * @param {number} extentMeters - tamanho do site em metros
 * @returns {number} zoom level (10-15)
 */
function zoomForExtent(extentMeters: any) {
    // Resolução aprox por pixel: 156543.03 * cos(lat) / 2^zoom metros
    // Para 256px tile cobrindo o extent: tile_size_meters = extentMeters
    // zoom = log2(40075016 / extentMeters) - log2(256) ≈ log2(156543 / (extent/256))
    const z = Math.round(Math.log2(40075016 / extentMeters) - 1);
    return Math.max(10, Math.min(15, z));
}

// ----------------------------------------------------------------
// AWS TERRAIN TILES - Modo Grid
// ----------------------------------------------------------------

/**
 * Busca e decodifica tile de elevação Terrarium da AWS.
 * Retorna grid 256×256 de elevações em metros.
 *
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} sceneBounds
 *   Limites no espaço Three.js
 * @returns {Promise<{ heights: Float32Array, cols: number, rows: number, tileBounds: Object, zoom?: number, tileX?: number, tileY?: number }>}
 */
export async function fetchTerrainGrid(sceneBounds: any) {
    if (!hasOrigin()) {
        throw new Error('Origem geográfica não definida. Configure coordenadas UTM.');
    }

    // Centro do bbox em WGS84
    const centerX = (sceneBounds.minX + sceneBounds.maxX) / 2;
    const centerZ = (sceneBounds.minZ + sceneBounds.maxZ) / 2;
    const center = relativeToWGS84({ x: centerX, y: 0, z: centerZ });

    // Extent em metros (aproximado)
    const extentM = Math.max(sceneBounds.maxX - sceneBounds.minX, sceneBounds.maxZ - sceneBounds.minZ);

    // Zoom ideal
    const zoom = zoomForExtent(extentM);
    const tile = latLonToTile(center.latitude, center.longitude, zoom);
    const bbox = tileBbox(tile.x, tile.y, zoom);

    // Fetch tile PNG
    const url = `${AWS_TERRAIN_URL}/${zoom}/${tile.x}/${tile.y}.png`;
    const heights = await _decodeTerrariumTile(url);

    return {
        heights,
        cols: 256,
        rows: 256,
        tileBounds: bbox,
        zoom,
        tileX: tile.x,
        tileY: tile.y,
    };
}

/**
 * Decodifica PNG Terrarium em Float32Array de elevações.
 * @param {string} url - URL do tile PNG
 * @returns {Promise<Float32Array>}
 */
async function _decodeTerrariumTile(url: any) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            img.src = '';
            reject(new Error(`Timeout (15s) ao carregar tile de elevação: ${url}`));
        }, 15000);

        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);

            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 256;
            const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')) as CanvasRenderingContext2D;
            ctx.drawImage(img, 0, 0);

            const { data } = ctx.getImageData(0, 0, 256, 256);
            const heights = new Float32Array(256 * 256);

            for (let i = 0; i < heights.length; i++) {
                const R = data[i * 4]!;
                const G = data[i * 4 + 1]!;
                const B = data[i * 4 + 2]!;
                heights[i] = R * 256 + G + B / 256 - 32768;
            }
            resolve(heights);
        };

        img.onerror = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(new Error(`Falha ao carregar tile de elevação: ${url}`));
        };
        img.src = url;
    });
}

// ----------------------------------------------------------------
// OPEN-METEO - Modo Pontos
// ----------------------------------------------------------------

/**
 * Busca elevação para um array de coordenadas lat/lon.
 * API Open-Meteo: CORS nativo, sem API key, até 100 pontos/request.
 *
 * @param {Array<{latitude: number, longitude: number}>} coords
 * @returns {Promise<number[]>} elevações em metros
 */
export async function fetchPointElevations(coords: any) {
    if (!coords || coords.length === 0) return [];

    // Batch em blocos de 100
    const results = [];
    for (let i = 0; i < coords.length; i += 100) {
        const batch = coords.slice(i, i + 100);
        const lats = batch.map((c: any) => c.latitude.toFixed(6)).join(',');
        const lons = batch.map((c: any) => c.longitude.toFixed(6)).join(',');

        const url = `${OPEN_METEO_URL}?latitude=${lats}&longitude=${lons}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Open-Meteo API: ${resp.status} ${resp.statusText}`);

        const data = await resp.json();
        if (data.elevation) {
            results.push(...data.elevation);
        }
    }
    return results;
}

// ----------------------------------------------------------------
// UTILITÁRIOS EXPORTADOS
// ----------------------------------------------------------------

/**
 * Converte elevações absolutas (WGS84 / geoidal) para relativas ao modelo.
 * Subtrai a elevação de origem.
 *
 * @param {Float32Array|number[]} heights - elevações absolutas em metros
 * @returns {Float32Array} elevações relativas
 */
export function toRelativeElevation(heights: any) {
    const origin = /** @type {{ elevation?: number } | null | undefined} */ (getOrigin());
    const offset = origin?.elevation || 0;
    const result = new Float32Array(heights.length);
    for (let i = 0; i < heights.length; i++) {
        result[i] = heights[i] - offset;
    }
    return result;
}

/**
 * Recorta e reamostra um grid 256×256 para um bbox menor.
 * Retorna grid na resolução solicitada dentro dos bounds do cenário.
 *
 * @param {Float32Array} tileHeights - grid 256×256 do tile completo
 * @param {{ north: number, south: number, east: number, west: number }} tileBounds - bounds do tile
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} sceneBounds
 * @param {{ cols: number, rows: number }} gridSize - resolução desejada
 * @returns {Float32Array} grid recortado e reamostrado
 */
export function resampleGrid(tileHeights: any, tileBounds: any, sceneBounds: any, gridSize: any) {
    const { cols, rows } = gridSize;
    const grid = new Float32Array(rows * cols);

    // Converte bounds da cena para lat/lon
    const sw = relativeToWGS84({ x: sceneBounds.minX, y: 0, z: sceneBounds.maxZ }); // Z max = sul
    const ne = relativeToWGS84({ x: sceneBounds.maxX, y: 0, z: sceneBounds.minZ }); // Z min = norte

    const tileLatRange = tileBounds.north - tileBounds.south;
    const tileLonRange = tileBounds.east - tileBounds.west;

    for (let r = 0; r < rows; r++) {
        // Latitude: row 0 = norte (minZ), row last = sul (maxZ)
        const frac = r / (rows - 1);
        const lat = ne.latitude + frac * (sw.latitude - ne.latitude);

        for (let c = 0; c < cols; c++) {
            const lonFrac = c / (cols - 1);
            const lon = sw.longitude + lonFrac * (ne.longitude - sw.longitude);

            // Mapeia para pixel no tile 256×256
            const px = Math.min(255, Math.max(0, Math.floor(((lon - tileBounds.west) / tileLonRange) * 256)));
            const py = Math.min(255, Math.max(0, Math.floor(((tileBounds.north - lat) / tileLatRange) * 256)));

            grid[r * cols + c] = tileHeights[py * 256 + px];
        }
    }
    return grid;
}

// ----------------------------------------------------------------
// SATELLITE IMAGERY - URLs para textura aérea
// ----------------------------------------------------------------

/**
 * Constrói imagem de satélite via tile stitching (Sentinel-2 Cloudless).
 * Substituiu cadeia ESRI/Google/Bing por composição client-side.
 *
 * @param {number} zoom - zoom level (não usado diretamente - stitcher calcula)
 * @param {number} tileX - tile X (não usado - mantido por compatibilidade)
 * @param {number} tileY - tile Y (não usado - mantido por compatibilidade)
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} sceneBounds - bounds da cena
 * @returns {Promise<string[]>} Array com data URL da imagem stitched
 */
export async function buildSatelliteUrls(zoom: any, tileX: any, tileY: any, sceneBounds: any) {
    const sw = relativeToWGS84({ x: sceneBounds.minX, y: 0, z: sceneBounds.maxZ });
    const ne = relativeToWGS84({ x: sceneBounds.maxX, y: 0, z: sceneBounds.minZ });

    try {
        const storedProvider =
            typeof localStorage !== 'undefined' ? localStorage.getItem('ecbyts-tile-provider') : null;
        const parsedProvider = storedProvider != null ? parseInt(storedProvider, 10) : NaN;
        const { overlayUrl, overlayFallbackUrls } = await buildOverlayUrlsFromBbox(
            sw,
            ne,
            1024,
            Number.isFinite(parsedProvider) ? parsedProvider : undefined,
        );
        return [overlayUrl, ...overlayFallbackUrls].filter(Boolean);
    } catch (/** @type {any} */ e) {
        console.warn('[Fetcher] Satellite tile stitching failed:', (e as any)?.message || e);
        return [];
    }
}
