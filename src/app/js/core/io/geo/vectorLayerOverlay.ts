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
   VECTOR LAYER OVERLAY — Renderização de camadas vetoriais GeoJSON
   ================================================================

   Sistema para carregar e renderizar dados vetoriais (GeoJSON)
   como overlays na cena 3D. Usado para bacias hidrográficas,
   divisões administrativas, e outros dados de referência.

   Features:
   - Lazy loading de GeoJSON
   - Clip por bbox (mostra apenas layers que intersectam o projeto)
   - Renderização Three.js (LineSegments para contornos)
   - Spatial query (identificar em qual polígono um ponto está)

   ================================================================ */
import { createTHREEProxy } from '../../three-lazy.js';
const THREE: any = createTHREEProxy();
import { wgs84ToRelative, relativeToWGS84, utmToWGS84, getOrigin, hasOrigin } from './coordinates.js';
import { safeSetItem } from '../../../utils/storage/storageMonitor.js';
const VL_VISIBILITY_KEY = 'ecbyts-vector-layer-visibility';
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
/** @type {Map<string, any>} id -> { definition, geojson, threeObjects, visible } */
const _layerCache = new Map();
/** @type {any} Grupo na cena para os layers */
let _vectorLayerGroup: any = null;
/** @type {Function|null} Callback para atualizar UI */
let _updateUICallback: any = null;
// ----------------------------------------------------------------
// CONFIGURATION
// ----------------------------------------------------------------
const DEFAULT_STYLE = {
    stroke: '#0066cc',
    strokeWidth: 2,
    fill: null,
    fillOpacity: 0.1,
};
// ----------------------------------------------------------------
// IP-DATA EDGE FALLBACK (IP-DATA-CONSOL-001 consumer)
// Asset local ausente (datasets geo grandes são gitignored e não
// chegam à produção) → catálogo remoto via edge ip-data-fetch
// (JWT + tier gate + signed URL). 100% defensivo: qualquer falha
// retorna null e o fluxo segue para o erro normal da camada.
// ----------------------------------------------------------------
/**
 * Fetch GeoJSON via IP-DATA edge function (signed URL).
 * Deriva dataset_key do path local: assets/geo/<source>/<name>.geojson
 * → `<source>/<name>` (mesma convenção do catálogo ip_geo_datasets).
 * @param {string} layerId - para logging
 * @param {string} geojsonUrl - URL local que falhou
 * @returns {Promise<any|null>} GeoJSON ou null
 */
async function _fetchViaIpDataEdge(layerId: any, geojsonUrl: any) {
    try {
        const { CONFIG } = await import('../../../config.js');
        if (!(CONFIG as any)?.FEATURES?.IP_DATA_REMOTE) return null;
        const m = String(geojsonUrl).match(/assets\/geo\/([^/]+)\/([^/]+)\.geojson(?:$|\?)/i);
        if (!m) return null;
        const datasetKey = `${m[1]}/${m[2]}`;
        const { getAccessToken } = await import('../../../utils/auth/session.js');
        const token = getAccessToken();
        if (!token) return null; // anônimo: mediação IP exige sessão (design)
        const { SUPABASE_URL, SUPABASE_KEY } = await import('../../../supabase-config.js' as string);
        const r = await fetch(`${SUPABASE_URL}/functions/v1/ip-data-fetch`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ dataset_key: datasetKey, category: 'geo' }),
        });
        if (!r.ok) {
            console.debug(`[VectorLayer] ${layerId}: ip-data-edge ${r.status} (${datasetKey})`);
            return null;
        }
        const j = await r.json();
        const signedUrl = j?.payload?.signed_url;
        if (!signedUrl) return null;
        const g = await fetch(signedUrl);
        if (!g.ok) return null;
        const geojson = await g.json();
        console.debug(`[VectorLayer] ${layerId}: loaded via ip-data-edge (${datasetKey})`);
        return geojson;
    } catch (e: any) {
        console.debug(`[VectorLayer] ${layerId}: ip-data-edge fallback failed:`, e?.message || e);
        return null;
    }
}

// ----------------------------------------------------------------
// PERSISTENCE - visibilidade salva em localStorage
// ----------------------------------------------------------------
function _readSavedVisibility() {
    try {
        return /** @type {Record<string, boolean>} */ (JSON.parse(localStorage.getItem(VL_VISIBILITY_KEY) || '{}'));
    }
    catch {
        return {};
    }
}
function _persistVisibility() {
    /** @type {Record<string, boolean>} */
    const map: any = {};
    for (const [id, layer] of _layerCache.entries()) {
        map[id] = layer.visible;
    }
    safeSetItem(VL_VISIBILITY_KEY, JSON.stringify(map));
}
// ----------------------------------------------------------------
// PUBLIC API - Registration
// ----------------------------------------------------------------
/**
 * Register a vector layer definition (called by loader.js)
 * @param {any} definition - Vector layer definition from manifest
 * @param {string} libraryId - Source library ID
 * @returns {boolean} Success
 */
export function registerVectorLayer(definition: any, libraryId: any) {
    if (!definition?.id) {
        console.warn('[VectorLayer] Cannot register layer without id');
        return false;
    }
    // Recupera visibilidade salva ou usa default do manifest
    const saved = _readSavedVisibility();
    const visible = definition.id in saved ? saved[definition.id] : definition.visibleByDefault !== false;
    _layerCache.set(definition.id, {
        definition: { ...definition, libraryId },
        geojson: null,
        threeObjects: [],
        visible,
        loaded: false,
        loading: false,
    });
    // Trigger load if should be visible
    if (isLayerInViewport(definition.id)) {
        loadVectorLayer(definition.id);
    }
    return true;
}
/**
 * Unregister a vector layer (called by loader.js on uninstall)
 * @param {string} layerId - Layer ID
 */
export function unregisterVectorLayer(layerId: any) {
    const layer = _layerCache.get(layerId);
    if (!layer)
        return;
    // Remove from scene
    _removeLayerFromScene(layerId);
    // Remove from cache
    _layerCache.delete(layerId);
}
/**
 * Set visibility of a vector layer
 * @param {string} layerId - Layer ID
 * @param {boolean} visible - Should be visible
 */
export function setVectorLayerVisible(layerId: any, visible: any) {
    const layer = _layerCache.get(layerId);
    if (!layer)
        return;
    layer.visible = visible;
    _persistVisibility();
    if (visible) {
        if (!layer.loaded && !layer.loading) {
            loadVectorLayer(layerId);
        }
        else if (layer.loaded) {
            _addLayerToScene(layerId);
        }
    }
    else {
        _removeLayerFromScene(layerId);
    }
}
/**
 * Check if a layer is visible
 * @param {string} layerId - Layer ID
 * @returns {boolean}
 */
export function isVectorLayerVisible(layerId: any) {
    const layer = _layerCache.get(layerId);
    return layer?.visible || false;
}
// ----------------------------------------------------------------
// PUBLIC API - Loading
// ----------------------------------------------------------------
/**
 * Load GeoJSON data for a layer.
 * Suporta duas fontes:
 *   - `geojsonUrl` - arquivo GeoJSON local ou remoto (fetch simples)
 *   - `apiUrl`     - ArcGIS REST MapServer query endpoint (paginacao automatica)
 * Se ambos existirem, `apiUrl` tem prioridade (dados mais atualizados).
 * Se `apiUrl` falhar, cai para `geojsonUrl` como fallback.
 *
 * @param {string} layerId - Layer ID
 * @returns {Promise<boolean>}
 */
export async function loadVectorLayer(layerId: any) {
    const layer = _layerCache.get(layerId);
    if (!layer || layer.loading || layer.loaded)
        return false;
    const { geojsonUrl, apiUrl, apiFields, supabaseStoragePath } = layer.definition;
    if (!geojsonUrl && !apiUrl && !supabaseStoragePath) {
        console.warn(`[VectorLayer] Layer ${layerId} has no data source`);
        return false;
    }
    layer.loading = true;
    const bbox = getProjectBBox();
    try {
        let geojson;
        // Fonte 1: ArcGIS REST API com filtro espacial nativo
        if (apiUrl) {
            try {
                geojson = await _fetchArcGISLayer(apiUrl, apiFields, bbox);
                layer._sourceUsed = 'api';
                const bboxNote = bbox ? ' (bbox filtered)' : '';
                console.debug(`[VectorLayer] ${layerId}: loaded ${geojson.features.length} features from API${bboxNote}`);
            }
            catch (apiErr: any) {
                console.warn(`[VectorLayer] ${layerId}: API failed (${ /** @type {any} */apiErr.message}), trying fallback`);
                geojson = null;
            }
        }
        // Fonte 2: Supabase Storage CDN
        if (!geojson && supabaseStoragePath) {
            try {
                const { SUPABASE_URL } = await import('../../../supabase-config.js' as string);
                const url = SUPABASE_URL + '/storage/v1/object/public/vector-layers/' + supabaseStoragePath;
                const resp = await fetch(url);
                if (resp.ok) {
                    geojson = await resp.json();
                    layer._sourceUsed = 'supabase';
                }
            }
            catch {
                console.warn(`[VectorLayer] ${layerId}: Supabase Storage failed, trying local`);
            }
        }
        // Fonte 3: GeoJSON local
        if (!geojson && geojsonUrl) {
            try {
                const response = await fetch(geojsonUrl);
                if (!response.ok)
                    throw new Error(`HTTP ${response.status}`);
                geojson = await response.json();
                layer._sourceUsed = 'local';
            }
            catch (localErr: any) {
                console.warn(`[VectorLayer] ${layerId}: local failed (${localErr?.message}), trying IP-DATA edge`);
                geojson = null;
            }
        }
        // Fonte 4 (IP-DATA-CONSOL-001 consumer): asset local ausente em
        // produção (datasets geo grandes são gitignored) → catálogo remoto
        // via edge ip-data-fetch (JWT + tier gate + signed URL). Flag
        // CONFIG.FEATURES.IP_DATA_REMOTE; anônimo sem sessão = sem fallback
        // (mediação IP por auth é design, não limitação).
        if (!geojson && geojsonUrl) {
            geojson = await _fetchViaIpDataEdge(layerId, geojsonUrl);
            if (geojson) layer._sourceUsed = 'ip-data-edge';
        }
        if (!geojson)
            throw new Error('No data source available');
        // Clip client-side (para fontes que nao fazem recorte server-side)
        if (bbox && !apiUrl && geojson.features) {
            const before = geojson.features.length;
            geojson = _clipGeoJSONToBbox(geojson, bbox);
            if (before !== geojson.features.length) {
                console.debug(`[VectorLayer] ${layerId}: clipped ${before} → ${geojson.features.length} features`);
            }
        }
        layer.geojson = geojson;
        layer.loaded = true;
        layer.loading = false;
        if (layer.visible) {
            _renderLayer(layerId);
            _addLayerToScene(layerId);
        }
        return true;
    }
    catch (err: any) {
        console.error(`[VectorLayer] Failed to load ${layerId}:`, /** @type {any} */ (err).message);
        layer.loading = false;
        return false;
    }
}
/**
 * Fetch features from an ArcGIS REST MapServer query endpoint.
 * Paginacao automatica + filtro espacial nativo (envelope bbox).
 *
 * @param {string} baseUrl - URL base (ex: .../MapServer/1/query)
 * @param {string} [outFields='*'] - Campos a retornar
 * @param {number[]|null} [bbox=null] - [minLon, minLat, maxLon, maxLat] para recorte espacial
 * @returns {Promise<{type: string, features: any[]}>}
 */
async function _fetchArcGISLayer(baseUrl: any, outFields: any = '*', bbox: any = null) {
    const PAGE_SIZE = 1000;
    const MAX_RETRIES = 3;
    const allFeatures = [];
    let offset = 0;
    while (true) {
        const sep = baseUrl.includes('?') ? '&' : '?';
        let url = baseUrl +
            sep +
            'where=1%3D1' +
            '&outFields=' +
            encodeURIComponent(outFields) +
            '&f=geojson' +
            '&resultOffset=' +
            offset +
            '&resultRecordCount=' +
            PAGE_SIZE;
        // Filtro espacial nativo do ArcGIS REST (envelope bbox em WGS84)
        if (bbox) {
            url +=
                '&geometry=' +
                    bbox.join(',') +
                    '&geometryType=esriGeometryEnvelope' +
                    '&inSR=4326' +
                    '&spatialRel=esriSpatialRelIntersects';
        }
        // Retry com backoff exponencial para resiliencia em datasets grandes
        let features;
        let lastErr;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
                    await new Promise((/** @type {any} */ r) => setTimeout(r, delay));
                    console.debug(`[VectorLayer] Retry ${attempt}/${MAX_RETRIES} at offset ${offset}`);
                }
                const resp = await fetch(url);
                if (!resp.ok)
                    throw new Error(`ArcGIS API HTTP ${resp.status}`);
                const data = await resp.json();
                features = data.features || [];
                lastErr = null;
                break;
            }
            catch (err: any) {
                lastErr = err;
                features = null;
            }
        }
        if (lastErr) {
            // Retorna dados parciais se ja temos features, senao propaga erro
            if (allFeatures.length > 0) {
                console.warn(`[VectorLayer] Pagination stopped at offset ${offset} after ${MAX_RETRIES} retries. Returning ${allFeatures.length} partial features.`);
                break;
            }
            throw lastErr;
        }
        allFeatures.push(...features);
        if (features.length < PAGE_SIZE)
            break;
        offset += PAGE_SIZE;
    }
    return { type: 'FeatureCollection', features: allFeatures };
}
/**
 * Unload a layer to free memory
 * @param {string} layerId - Layer ID
 */
export function unloadVectorLayer(layerId: any) {
    const layer = _layerCache.get(layerId);
    if (!layer)
        return;
    _removeLayerFromScene(layerId);
    layer.geojson = null;
    layer.loaded = false;
    layer.threeObjects = [];
}
// ----------------------------------------------------------------
// PUBLIC API - Viewport & Spatial
// ----------------------------------------------------------------
/**
 * Check if a layer intersects the current project viewport
 * @param {string} layerId - Layer ID
 * @returns {boolean}
 */
export function isLayerInViewport(layerId: any) {
    const layer = _layerCache.get(layerId);
    if (!layer)
        return false;
    const projectBbox = getProjectBBox();
    if (!projectBbox)
        return false;
    return _bboxesIntersect(projectBbox, layer.definition.bbox);
}
/**
 * Refresh visibility of all layers based on current viewport
 * Called when origin changes or boundary changes
 */
export function refreshVectorLayersForViewport() {
    for (const [layerId, layer] of _layerCache.entries()) {
        const shouldShow = layer.visible && isLayerInViewport(layerId);
        if (shouldShow) {
            if (!layer.loaded && !layer.loading) {
                loadVectorLayer(layerId);
            }
            else if (layer.loaded && layer.threeObjects.length === 0) {
                _addLayerToScene(layerId);
            }
        }
        else {
            if (layer.loaded) {
                _removeLayerFromScene(layerId);
            }
        }
    }
}
/**
 * Get all layer IDs that intersect a bbox
 * @param {number[]} bbox - [minLon, minLat, maxLon, maxLat]
 * @returns {string[]}
 */
export function getVectorLayersInBBox(bbox: any) {
    const result = [];
    for (const [layerId, layer] of _layerCache.entries()) {
        if (_bboxesIntersect(bbox, layer.definition.bbox)) {
            result.push(layerId);
        }
    }
    return result;
}
/**
 * Find which features contain a point
 * @param {{x: number, y: number, z: number}} point - Point in local coordinates
 * @returns {Array<{layerId: string, feature: Object, properties: Object}>}
 */
export function queryVectorLayersAtPoint(point: any) {
    /** @type {Array<any>} */
    const results: any[] = [];
    // Convert to WGS84
    const origin = getOrigin();
    if (!origin)
        return results;
    // Simple conversion - assumes UTM zone of origin
    const wgs84 = _localToWGS84(point, origin);
    if (!wgs84)
        return results;
    for (const [layerId, layer] of _layerCache.entries()) {
        if (!layer.loaded || !layer.geojson)
            continue;
        const features = layer.geojson.features || [];
        for (const feature of features) {
            if (_pointInFeature(wgs84, feature)) {
                results.push({
                    layerId,
                    feature,
                    properties: feature.properties || {},
                });
            }
        }
    }
    return results;
}
/**
 * Get all registered layers metadata (for UI)
 * @returns {Array<{id: string, name: string, visible: boolean, inViewport: boolean}>}
 */
export function getVectorLayersList() {
    return Array.from(_layerCache.entries()).map((/** @type {any} */ [id, layer]) => ({
        id,
        name: layer.definition.name,
        style: layer.definition.style || null,
        source: layer.definition.apiUrl ? 'api' : 'local',
        visible: layer.visible,
        inViewport: isLayerInViewport(id),
        loaded: layer.loaded,
        loading: layer.loading,
        featureCount: layer.geojson?.features?.length ?? 0,
        sourceUsed: layer._sourceUsed || null,
    }));
}
// ----------------------------------------------------------------
// SCENE INTEGRATION
// ----------------------------------------------------------------
/**
 * Initialize the vector layer group in a Three.js scene
 * @param {any} scene - Three.js scene
 */
export function initVectorLayerGroup(scene: any) {
    if (_vectorLayerGroup) {
        scene.remove(_vectorLayerGroup);
    }
    _vectorLayerGroup = new THREE.Group();
    _vectorLayerGroup.name = 'vectorLayers';
    scene.add(_vectorLayerGroup);
}
/**
 * Set the Three.js group for vector layers (alternative to init)
 * @param {any} group - Group to use
 */
export function setVectorLayerGroup(group: any) {
    _vectorLayerGroup = group;
}
/**
 * Set callback for UI updates
 * @param {Function} callback - Called when layers change
 */
export function setVectorLayerUICallback(callback: any) {
    _updateUICallback = callback;
}
// ----------------------------------------------------------------
// INTERNAL - Rendering
// ----------------------------------------------------------------
/**
 * Render a layer to Three.js objects (without adding to scene)
 * @param {string} layerId - Layer ID
 */
function _renderLayer(layerId: any) {
    const layer = _layerCache.get(layerId);
    if (!layer || !layer.geojson)
        return;
    // Clear existing
    layer.threeObjects.forEach((obj: any) => {
        if (obj.geometry)
            obj.geometry.dispose();
        if (obj.material)
            obj.material.dispose();
    });
    layer.threeObjects = [];
    const style = { ...DEFAULT_STYLE, ...layer.definition.style };
    const features = layer.geojson.features || [];
    for (const feature of features) {
        const objects = _featureToThreeObjects(feature, style);
        layer.threeObjects.push(...objects);
    }
}
/**
 * Convert a GeoJSON feature to Three.js objects
 * @param {any} feature - GeoJSON feature
 * @param {any} style - Style configuration
 * @returns {any[]}
 */
function _featureToThreeObjects(feature: any, style: any) {
    /** @type {Array<any>} */
    const objects: any[] = [];
    const geom = feature.geometry;
    if (!geom)
        return objects;
    switch (geom.type) {
        case 'Polygon':
            objects.push(..._polygonToThreeObjects(geom.coordinates, style));
            break;
        case 'MultiPolygon':
            for (const polygon of geom.coordinates) {
                objects.push(..._polygonToThreeObjects(polygon, style));
            }
            break;
        case 'LineString':
            objects.push(_lineStringToThreeObject(geom.coordinates, style));
            break;
        case 'MultiLineString':
            for (const line of geom.coordinates) {
                objects.push(_lineStringToThreeObject(line, style));
            }
            break;
        case 'Point': {
            const obj = _pointToThreeObject(geom.coordinates, style);
            if (obj)
                objects.push(obj);
            break;
        }
        case 'MultiPoint':
            for (const pt of geom.coordinates) {
                const obj = _pointToThreeObject(pt, style);
                if (obj)
                    objects.push(obj);
            }
            break;
    }
    return objects;
}
/**
 * Convert polygon coordinates to Three.js objects
 * @param {number[][][]} coordinates - Polygon rings (outer + holes)
 * @param {any} style - Style configuration
 * @returns {any[]}
 */
function _polygonToThreeObjects(coordinates: any, style: any) {
    /** @type {Array<any>} */
    const objects: any[] = [];
    if (!coordinates || coordinates.length === 0)
        return objects;
    const outerRing = coordinates[0];
    if (!outerRing || outerRing.length < 3)
        return objects;
    // Create outline
    const outline = _createLineFromCoords(outerRing, style.stroke, style.strokeWidth);
    if (outline) {
        outline.userData = { isVectorLayer: true };
        objects.push(outline);
    }
    // Create fill if specified
    if (style.fill) {
        const fill = _createPolygonFill(outerRing, style.fill, style.fillOpacity);
        if (fill) {
            fill.userData = { isVectorLayer: true };
            objects.push(fill);
        }
    }
    return objects;
}
/**
 * Convert line coordinates to Three.js object
 * @param {number[][]} coordinates - Line coordinates
 * @param {any} style - Style configuration
 * @returns {any|null}
 */
function _lineStringToThreeObject(coordinates: any, style: any) {
    const line = _createLineFromCoords(coordinates, style.stroke, style.strokeWidth);
    if (line) {
        line.userData = { isVectorLayer: true };
    }
    return line;
}
/**
 * Convert a Point coordinate to a small Three.js sphere/circle marker.
 * Renderiza ponto como pequena esfera 3D na cena.
 * @param {number[]} coord - [lon, lat]
 * @param {any} style - Style configuration
 * @returns {any}
 */
function _pointToThreeObject(coord: any, style: any) {
    if (!coord || coord.length < 2)
        return null;
    const local = _wgs84ToLocal({ longitude: coord[0], latitude: coord[1] });
    if (!local)
        return null;
    const radius = style.pointRadius || 3;
    const color = style.fill || style.stroke || '#cc3333';
    // THREE já importado no topo do módulo - guard removido (import garante disponibilidade)
    const geometry = new THREE.SphereGeometry(radius, 6, 4);
    const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: style.fillOpacity != null ? Math.max(style.fillOpacity, 0.6) : 0.8,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(local.x, (local.y || 0) + radius, local.z);
    mesh.userData = { isVectorLayer: true };
    return mesh;
}
/**
 * Create a line from WGS84 coordinates
 * @param {number[][]} coords - Array of [lon, lat] coordinates
 * @param {string} color - Line color
 * @param {number} width - Line width
 * @returns {any}
 */
function _createLineFromCoords(coords: any, color: any, width: any) {
    if (!coords || coords.length < 2)
        return null;
    const points = [];
    for (const coord of coords) {
        const local = _wgs84ToLocal({ longitude: coord[0], latitude: coord[1] });
        if (local) {
            points.push(local.x, local.y, local.z);
        }
    }
    if (points.length < 6)
        return null; // Need at least 2 points (6 values)
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.LineBasicMaterial({
        color: color || '#0066cc',
        linewidth: width || 2,
    });
    return new THREE.Line(geometry, material);
}
/**
 * Create a polygon fill mesh
 * @param {number[][]} coords - Outer ring coordinates
 * @param {string} color - Fill color
 * @param {number} opacity - Fill opacity
 * @returns {any}
 */
function _createPolygonFill(coords: any, color: any, opacity: any) {
    if (!coords || coords.length < 3)
        return null;
    // Convert to local coordinates
    const points2D = [];
    for (const coord of coords) {
        const local = _wgs84ToLocal({ longitude: coord[0], latitude: coord[1] });
        if (local) {
            points2D.push(new THREE.Vector2(local.x, local.z));
        }
    }
    if (points2D.length < 3)
        return null;
    try {
        const shape = new THREE.Shape(points2D);
        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshBasicMaterial({
            color: color || '#0066cc',
            transparent: true,
            opacity: opacity || 0.1,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2; // Lay flat
        mesh.position.y = 0.1; // Slightly above ground
        return mesh;
    }
    catch (err: any) {
        console.warn('[VectorLayer] Failed to create polygon fill:', /** @type {any} */ (err).message);
        return null;
    }
}
// ----------------------------------------------------------------
// INTERNAL - Scene Management
// ----------------------------------------------------------------
function _addLayerToScene(layerId: any) {
    const layer = _layerCache.get(layerId);
    if (!layer || !_vectorLayerGroup)
        return;
    for (const obj of layer.threeObjects) {
        if (obj.parent !== _vectorLayerGroup) {
            _vectorLayerGroup.add(obj);
        }
    }
}
function _removeLayerFromScene(layerId: any) {
    const layer = _layerCache.get(layerId);
    if (!layer || !_vectorLayerGroup)
        return;
    for (const obj of layer.threeObjects) {
        if (obj.parent === _vectorLayerGroup) {
            _vectorLayerGroup.remove(obj);
        }
    }
}
// ----------------------------------------------------------------
// INTERNAL - Coordinate Conversion
// ----------------------------------------------------------------
function _wgs84ToLocal(wgs84: any) {
    try {
        return wgs84ToRelative(wgs84);
    }
    catch (err: any) {
        console.warn('[VectorLayer] Coordinate conversion failed:', /** @type {any} */ (err).message);
        return null;
    }
}
function _localToWGS84(point: any, _origin: any) {
    // Usa pipeline UTM inverso preciso via coordinates.js
    try {
        const wgs = relativeToWGS84({ x: point.x, y: point.y || 0, z: point.z });
        return { latitude: wgs.latitude, longitude: wgs.longitude };
    }
    catch {
        return null;
    }
}
// ----------------------------------------------------------------
// INTERNAL - Spatial Clipping
// Recorte espacial client-side para GeoJSON local/Supabase
// ----------------------------------------------------------------
/**
 * Filtra features de um GeoJSON mantendo apenas os que intersectam o bbox.
 * @param {{type: string, features: any[]}} geojson
 * @param {number[]} geojson - [minLon, minLat, maxLon, maxLat]
 * @returns {{type: string, features: any[]}}
 */
function _clipGeoJSONToBbox(geojson: any, bbox: any) {
    if (!bbox || !geojson?.features)
        return geojson;
    const clipped = geojson.features.filter((f: any) => {
        if (!f.geometry)
            return false;
        const fb = _featureBBox(f.geometry);
        return fb && _bboxesIntersect(fb, bbox);
    });
    return { type: 'FeatureCollection', features: clipped };
}
/**
 * Calcula bbox [minLon, minLat, maxLon, maxLat] de qualquer geometria GeoJSON.
 * Percorre recursivamente as coordenadas.
 */
function _featureBBox(geom: any) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function scan(coords: any) {
        if (typeof coords[0] === 'number') {
            if (coords[0] < minX)
                minX = coords[0];
            if (coords[0] > maxX)
                maxX = coords[0];
            if (coords[1] < minY)
                minY = coords[1];
            if (coords[1] > maxY)
                maxY = coords[1];
        }
        else {
            for (const c of coords)
                scan(c);
        }
    }
    scan(geom.coordinates);
    if (minX === Infinity)
        return null;
    return [minX, minY, maxX, maxY];
}
// ----------------------------------------------------------------
// INTERNAL - Geometry Utils
// ----------------------------------------------------------------
function _bboxesIntersect(a: any, b: any) {
    return (a[0] <= b[2] &&
        a[2] >= b[0] && // x/lon overlap
        a[1] <= b[3] &&
        a[3] >= b[1] // y/lat overlap
    );
}
function getProjectBBox() {
    // Retorna [minLon, minLat, maxLon, maxLat] em WGS84 ou null
    const origin = getOrigin();
    if (!origin || !hasOrigin())
        return null;
    // Converte UTM → WGS84 via pipeline do coordinates.js
    const wgs84 = utmToWGS84(origin);
    const offset = 0.5; // ~55km — cobre área de projeto típica
    return [wgs84.longitude - offset, wgs84.latitude - offset, wgs84.longitude + offset, wgs84.latitude + offset];
}
function _pointInFeature(point: any, feature: any) {
    const geom = feature.geometry;
    if (!geom)
        return false;
    switch (geom.type) {
        case 'Polygon':
            return _pointInPolygon(point, geom.coordinates[0]);
        case 'MultiPolygon':
            return geom.coordinates.some((polygon: any) => _pointInPolygon(point, polygon[0]));
        default:
            return false;
    }
}
function _pointInPolygon(point: any, polygon: any) {
    // Ray casting algorithm
    let inside = false;
    const x = point.longitude;
    const y = point.latitude;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersect)
            inside = !inside;
    }
    return inside;
}
// ----------------------------------------------------------------
// EVENTS
// ----------------------------------------------------------------
// Listen for origin changes - invalida cache e re-carrega com novo bbox
window.addEventListener('originChanged', () => {
    // Invalidar layers carregados para forcar re-fetch/re-clip com novo bbox
    for (const [layerId, layer] of _layerCache.entries()) {
        if (layer.loaded) {
            _removeLayerFromScene(layerId);
            layer.threeObjects.forEach((obj: any) => {
                if (obj.geometry)
                    obj.geometry.dispose();
                if (obj.material)
                    obj.material.dispose();
            });
            layer.threeObjects = [];
            layer.geojson = null;
            layer.loaded = false;
        }
    }
    refreshVectorLayersForViewport();
});
// Listen for library changes
window.addEventListener('librariesChanged', () => {
    refreshVectorLayersForViewport();
});
