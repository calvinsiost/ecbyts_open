// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.1.5

/* ================================================================
   SHAPEFILE FORMAT — Import de Shapefiles ESRI via shpjs
   ================================================================

   Aceita .zip (contendo .shp+.dbf+.prj) ou .shp individual.
   Converte para GeoJSON via shpjs (MIT, CDN lazy-loaded) e depois
   reutiliza importGeoJSON() existente para criar elementos ecbyts.

   Dependencia: shpjs v4+ (MIT license, ~200KB via CDN)
   CDN: https://unpkg.com/shpjs@latest/dist/shp.min.js

   ================================================================ */

import { registerFormat } from './registry.js';
import { importGeoJSON, importGeoJSONObject } from './geojson.js';

// ----------------------------------------------------------------
// REGISTRO
// ----------------------------------------------------------------

registerFormat({
    id: 'shapefile',
    name: 'ESRI Shapefile',
    extensions: ['.shp', '.zip'],
    mimeType: 'application/octet-stream',
    canExport: false,
    canImport: true,
    needsOrigin: true,
    exportScopes: [],
});

// ----------------------------------------------------------------
// CDN CONFIG
// ----------------------------------------------------------------

// shpjs v4 - MIT license, pinned version
const SHPJS_CDN = 'https://unpkg.com/shpjs@4.0.4/dist/shp.min.js';

/**
 * Cache de FeatureCollection parseado por File (evita re-parse entre preview e import).
 * @type {WeakMap<File, any>}
 */
const _previewCache = new WeakMap();

/**
 * Parsea ArrayBuffer dentro de um Web Worker (shpjs via importScripts CDN).
 *
 * Beneficio: main thread permanece responsivo durante parsing de ZIPs grandes
 * (ex.: BR_Municipios_2025 226MB → ~40s de parsing). Buffer e transferido
 * zero-copy (transferable) → main thread perde acesso ao buffer original
 * apos postMessage.
 *
 * Falha gracioso: rejeita Promise se Worker indisponivel (CSP, file://,
 * browser legado, falha CDN importScripts cross-origin). Caller deve
 * implementar fallback para parsing no main thread.
 *
 * @param {ArrayBuffer} buffer
 * @returns {Promise<any>} GeoJSON FeatureCollection (ou array de FCs multi-layer)
 */
async function _parseInWorker(buffer: any) {
    return new Promise((resolve, reject) => {
        /** @type {Worker|null} */
        let worker: any = null;
        try {
            worker = new Worker(new URL('./shapefileWorker.js', import.meta.url), { type: 'classic' });
        } catch (err) {
            return reject(err);
        }
        const requestId = Math.random().toString(36).slice(2);
        const timeout = setTimeout(() => {
            try {
                worker?.terminate();
            } catch (e) {
                console.debug('[shapefile:worker-timeout-terminate]', e);
            }
            reject(new Error('Worker timeout (120s)'));
        }, 120000);

        worker.addEventListener('message', (e: any) => {
            const msg = /** @type {any} */ (e.data) || {};
            if (msg.requestId !== requestId) return;
            clearTimeout(timeout);
            try {
                worker?.terminate();
            } catch (err) {
                console.debug('[shapefile:worker-msg-terminate]', err);
            }
            if (msg.ok) resolve(msg.result);
            else reject(new Error(msg.error || 'Worker error'));
        });

        worker.addEventListener('error', (err: any) => {
            clearTimeout(timeout);
            try {
                worker?.terminate();
            } catch (e) {
                console.debug('[shapefile:worker-err-terminate]', e);
            }
            reject(new Error(/** @type {any} */ (err as any).message || 'Worker runtime error'));
        });

        // Transferable zero-copy: clone buffer (slice(0)) e transfere o clone.
        // Isso preserva o buffer original no main thread (necessario para
        // fallback caso o Worker falhe no postMessage ou retorno).
        const bufferCopy = buffer.slice(0);
        worker.postMessage({ buffer: bufferCopy, requestId }, [bufferCopy]);
    });
}

/**
 * Carrega shpjs via CDN e parsea o ZIP/SHP retornando FeatureCollection(s).
 * Cacheado por File para reuso entre previewShapefile() e importShapefile().
 *
 * Estrategia:
 *   1. Tenta Worker primeiro (main thread livre durante parsing).
 *   2. Fallback main thread se Worker falhar (CSP, file://, etc).
 *
 * @param {File} file
 * @returns {Promise<any[]>} array de FeatureCollections (shpjs pode retornar multi-layer)
 */
async function _parseShapefile(file: any) {
    if (_previewCache.has(file)) return _previewCache.get(file);

    const buffer = await file.arrayBuffer();
    let geojson;

    try {
        // Tenta Worker primeiro — nao bloqueia main thread durante parsing
        geojson = await _parseInWorker(buffer);
    } catch (workerErr) {
        console.debug('[shapefile:worker-fallback]', /** @type {any} */ (workerErr as any)?.message || workerErr);

        // Fallback main thread (CSP, file://, browser legado, falha CDN)
        if (!(/** @type {any} */ ((window as any).shp))) {
            const { loadScriptCDN } = await import('../../../utils/helpers/cdnLoader.js');
            await loadScriptCDN(SHPJS_CDN, { name: 'shpjs', globalVar: 'shp' });
        }
        if (!(/** @type {any} */ ((window as any).shp))) {
            throw new Error(
                'shpjs nao carregou (nem no Worker nem no main thread). Verifique sua conexao.',
                { cause: workerErr },
            );
        }
        try {
            geojson = await /** @type {any} */ ((window as any).shp)(buffer);
        } catch (err) {
            throw new Error(`Erro ao parsear shapefile: ${/** @type {any} */ (err as any).message}`, { cause: err });
        }
    }

    const collections = Array.isArray(geojson) ? geojson : [geojson];
    _previewCache.set(file, collections);
    return collections;
}

/**
 * Parsea shapefile SOMENTE para extrair metadata — sem addElement.
 *
 * Usado pelo wizard de import para preview QGIS-style antes do commit.
 *
 * @param {File} file
 * @returns {Promise<{
 *   layerName: string,
 *   featureCount: number,
 *   geometryTypes: Record<string, number>,
 *   attributeKeys: string[],
 *   sampleFeature: { properties: any, geometryType: string|null }|null,
 *   bounds: { minLat: number, maxLat: number, minLon: number, maxLon: number }|null,
 *   collectionCount: number
 * }>}
 */
export async function previewShapefile(file: any) {
    const collections = await _parseShapefile(file);

    let featureCount = 0;
    /** @type {Record<string, number>} */
    const geometryTypes = {};
    const attributeKeySet = new Set();
    let sampleFeature = null;
    let layerName = file.name;
    let minLat = Infinity,
        maxLat = -Infinity,
        minLon = Infinity,
        maxLon = -Infinity;

    for (const fc of collections) {
        if (!fc || fc.type !== 'FeatureCollection') continue;
        if (fc.fileName && layerName === file.name) layerName = fc.fileName;
        for (const feature of fc.features || []) {
            featureCount++;
            const gtype = feature.geometry?.type || 'null';
            (geometryTypes as any)[gtype] = ((geometryTypes as any)[gtype] || 0) + 1;
            if (feature.properties) {
                for (const k of Object.keys(feature.properties)) attributeKeySet.add(k);
            }
            if (!sampleFeature && feature.properties) {
                sampleFeature = {
                    properties: feature.properties,
                    geometryType: feature.geometry?.type || null,
                };
            }
            // Bounds (sample primeiro ponto de cada geometria)
            const coords = feature.geometry?.coordinates;
            if (coords) {
                const flat = _flattenCoords(coords);
                for (const [lon, lat] of flat) {
                    if (typeof lat === 'number' && typeof lon === 'number') {
                        if (lat < minLat) minLat = lat;
                        if (lat > maxLat) maxLat = lat;
                        if (lon < minLon) minLon = lon;
                        if (lon > maxLon) maxLon = lon;
                    }
                }
            }
        }
    }

    const bounds = minLat !== Infinity ? { minLat, maxLat, minLon, maxLon } : null;

    return {
        layerName,
        featureCount,
        geometryTypes,
        attributeKeys: [...attributeKeySet].sort(),
        sampleFeature,
        bounds,
        collectionCount: collections.length,
    };
}

/**
 * @param {any} coords - coordenadas GeoJSON aninhadas (Point, LineString, Polygon, MultiPolygon)
 * @returns {Array<[number, number]>}
 */
function _flattenCoords(coords: any): any[] {
    if (!Array.isArray(coords)) return [];
    if (typeof coords[0] === 'number') return [/** @type {[number, number]} */ (coords)];
    const out = [];
    for (const c of coords) out.push(..._flattenCoords(c));
    return out;
}

/**
 * Sugere family target baseado nas geometrias predominantes.
 *
 * @param {Record<string, number>} geometryTypes
 * @returns {string}
 */
export function suggestFamilyFromGeometries(geometryTypes: any) {
    const entries = Object.entries(geometryTypes);
    if (entries.length === 0) return 'boundary';
    entries.sort((a, b) => (b[1] as number) - (a[1] as number));
    const top = entries[0]![0];
    if (top === 'Point' || top === 'MultiPoint') return 'well';
    if (top === 'LineString' || top === 'MultiLineString') return 'river';
    return 'boundary'; // Polygon, MultiPolygon
}

// ----------------------------------------------------------------
// IMPORT
// ----------------------------------------------------------------

/**
 * Importa shapefile (.zip ou .shp) e converte para elementos ecbyts.
 *
 * Pipeline: File → ArrayBuffer → shpjs → GeoJSON → importGeoJSONObject()
 *
 * @param {File} file - arquivo .zip ou .shp
 * @param {Object} [options]
 * @param {string} [options.targetFamily] - familia default para features sem family property (default: 'well')
 * @param {string} [options.nameField] - campo de attributes para usar como name (default: auto-detect NAME/NM_MUN/NOME/ID)
 * @param {string} [options.familyMode] - 'fixed' (usa targetFamily para tudo) | 'auto' (deriva da geometria: Polygon→boundary, Point→well, Line→river)
 * @param {string} [options.datasetId] - id estavel para auto-color via SPEC_GIS_AUTO_COLOR_DATASET (default: file.name)
 * @returns {Promise<{elements: Array<any>, warnings: string[], crs: string|null, datasetColor: string|null}>}
 */
export async function importShapefile(file: any, options: any = {}) {
    const { targetFamily = 'well', nameField = null, familyMode = 'fixed' } = options;
    // SPEC_GIS_AUTO_COLOR_DATASET: datasetId estavel = nome do arquivo
    // (file.name) por default. Caller pode passar id explicito.
    const datasetId = typeof options.datasetId === 'string' && options.datasetId.length > 0
        ? options.datasetId
        : file?.name || 'shapefile-unknown';

    // Reusa cache do previewShapefile() se ja parseado antes
    const collections = await _parseShapefile(file);

    const allElements = [];
    const allWarnings = [];
    const detectedCrs = null;

    for (const fc of collections) {
        if (!fc || fc.type !== 'FeatureCollection') continue;

        // Extrair CRS do fileName se disponivel
        if (fc.fileName) {
            allWarnings.push(`Layer: ${fc.fileName}`);
        }

        // Injetar familia default + name em features
        for (const feature of fc.features || []) {
            if (!feature.properties) feature.properties = {};
            if (!feature.properties.family) {
                if (familyMode === 'auto') {
                    feature.properties.family = suggestFamilyFromGeometries({
                        [feature.geometry?.type || 'null']: 1,
                    });
                } else {
                    feature.properties.family = targetFamily;
                }
            }
            // Name: nameField explicito tem prioridade, fallback auto-detect
            if (!feature.properties.name) {
                if (nameField && feature.properties[nameField] != null) {
                    feature.properties.name = String(feature.properties[nameField]);
                } else {
                    feature.properties.name =
                        feature.properties.NAME ||
                        feature.properties.Name ||
                        feature.properties.NM_MUN ||
                        feature.properties.NOME ||
                        feature.properties.nome ||
                        feature.properties.ID ||
                        feature.properties.id ||
                        null;
                }
            }
        }

        // Delegar para importGeoJSONObject (FeatureCollection ja parseado).
        // NAO stringify aqui — datasets grandes (IBGE 5573 municipios) estouram
        // V8 string limit (~512MB) no JSON.stringify/parse roundtrip.
        // SPEC_GIS_AUTO_COLOR_DATASET: passa datasetId para auto-color.
        try {
            const result = /** @type {{ elements: any[], warnings: string[], datasetColor?: string|null }} */ (
                importGeoJSONObject(fc, { datasetId })
            );
            allElements.push(...result.elements);
            allWarnings.push(...result.warnings);
        } catch (err) {
            allWarnings.push(`Layer ignorada: ${/** @type {any} */ (err as any).message}`);
        }
    }

    if (allElements.length === 0) {
        throw new Error('Nenhum elemento extraido do shapefile. Verifique se o arquivo contem geometrias validas.');
    }

    /** @type {string|null} */
    let datasetColor = null;
    try {
        // Lazy import para nao acoplar shapefile.js a symbology em testes
        // que mockaram a build pipeline.
        const dsMod = await import('../../symbology/datasetColors.js');
        datasetColor = dsMod.peekDatasetColor(datasetId) ?? null;
    } catch (e) {
        console.debug('[shapefile:datasetColor]', /** @type {any} */ (e as any)?.message || e);
    }

    return {
        elements: allElements,
        warnings: allWarnings,
        crs: detectedCrs,
        datasetColor,
    };
}
