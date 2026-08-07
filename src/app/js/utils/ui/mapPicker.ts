// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   MAP PICKER — Interactive map for selecting UTM origin
   ================================================================

   Modal fullscreen com mapa interativo para seleção de ponto.
   Usa MapLibre GL JS (vector tiles, sem API key) como engine primário.
   Fallback para Leaflet se MapLibre falhar (rede, WebGL indisponível).

   STACK:
   - MapLibre GL JS 4.x (CDN, lazy loaded)
   - OpenFreeMap vector tiles (sem API key, open-source)
   - Sentinel-2 Cloudless by EOX satellite layer (sem API key, raster)
   - Nominatim geocoding (OpenStreetMap, sem API key)

   COMPONENTES:
   - Overlay fullscreen com mapa
   - Crosshair CSS no centro (ponto é o centro do mapa)
   - Barra de busca (Nominatim) com flyTo
   - Barra de info com lat/lon em tempo real
   - Toggle street/satellite
   - Botões Confirmar / Cancelar

   ================================================================ */

// @ts-check

import { t } from '../i18n/translations.js';
import { getOrigin, hasOrigin, utmToWGS84 } from '../../core/io/geo/coordinates.js';
import { loadScriptCDN } from '../helpers/cdnLoader.js';
// TRUST-009 G3: consolidação — usa validatePolygonRing canônico em vez de fork local.
import { validatePolygonRing as _canonicalValidatePolygonRing } from '../../core/boundary/polygonGeometry.js';

/** @typedef {'maplibre'|'leaflet'} MapPickerEngine */
/** @typedef {'point'|'bounds'|'polygon'} MapPickerMode */
/** @typedef {{latitude:number,longitude:number}} LatLon */
/** @typedef {{sw:LatLon,ne:LatLon}} LatLonBounds */
/** @typedef {{type:string,coordinates:number[][][]}} GeoJSONPolygon */
/** @typedef {{mode?:MapPickerMode,initialCenter?:LatLon|null,initialZoom?:number,maxVertices?:number}} MapPickerOptions */

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

// MapLibre GL JS (primary)
const MAPLIBRE_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const MAPLIBRE_JS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js';
const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const SATELLITE_TILES =
    'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg';

// Leaflet (fallback)
const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css';
const LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js';
// NOTE: tile.openstreetmap.org prohibits heavy use in distributed apps.
// Using OpenFreeMap raster tiles (OSM data, free for commercial use).
const OSM_TILES = 'https://tile.openfreemap.org/styles/liberty/{z}/{x}/{y}.png';
const OSM_ATTR =
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const SATELLITE_ATTR =
    'Sentinel-2 cloudless &mdash; <a href="https://s2maps.eu" target="_blank" rel="noopener">s2maps.eu</a> by EOX (Copernicus Sentinel data 2021)';

// Defaults
const DEFAULT_LAT = -15.0;
const DEFAULT_LON = -47.0;
const DEFAULT_ZOOM = 4;

// ----------------------------------------------------------------
// ENGINE DETECTION
// ----------------------------------------------------------------

/** @type {MapPickerEngine|null} */
let _engine: any = null;
let _satelliteAvailable = true;

/**
 * @param {unknown} error
 * @returns {string}
 */
function _errorMessage(error: any): string {
    if (error && typeof error === 'object' && 'message' in error) {
        return String((error as { message?: unknown }).message);
    }
    return String(error);
}

/**
 * Try to load MapLibre GL JS. Falls back to Leaflet if it fails.
 * @returns {Promise<'maplibre'|'leaflet'>}
 */
async function _ensureEngine(): Promise<'maplibre' | 'leaflet'> {
    if (_engine) return _engine;

    // Try MapLibre first
    try {
        // CSS
        if (!document.querySelector(`link[href*="maplibre-gl"]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = MAPLIBRE_CSS;
            document.head.appendChild(link);
        }

        // JS
        if (!(window as any).maplibregl) {
            await loadScriptCDN(MAPLIBRE_JS, {
                name: 'MapLibre GL JS',
                globalVar: 'maplibregl',
                timeout: 12000,
            });
        }

        // Verify WebGL support
        const testCanvas = document.createElement('canvas');
        const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
        if (!gl) throw new Error('WebGL not available');

        await _preflightMapEndpoints();
        _engine = 'maplibre';
        console.debug('[MapPicker] Using MapLibre GL JS');
        return _engine;
    } catch (err: any) {
        console.warn('[MapPicker] MapLibre failed, falling back to Leaflet:', _errorMessage(err));
    }

    // Fallback: Leaflet
    try {
        if (!document.querySelector(`link[href*="leaflet"]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = LEAFLET_CSS;
            document.head.appendChild(link);
        }
        if (!(window as any).L) {
            await loadScriptCDN(LEAFLET_JS, {
                name: 'Leaflet',
                globalVar: 'L',
                timeout: 12000,
            });
        }
        _engine = 'leaflet';
        console.debug('[MapPicker] Using Leaflet (fallback)');
        return _engine;
    } catch (err2: any) {
        throw new Error('Failed to load any map engine: ' + _errorMessage(err2), { cause: err2 });
    }
}

async function _preflightMapEndpoints() {
    _satelliteAvailable = true;

    // Style endpoint is mandatory for MapLibre.
    await _fetchWithTimeout(OPENFREEMAP_STYLE, 7000, 'OpenFreeMap style');

    // Satellite endpoint is optional (street mode still works).
    const satProbe = SATELLITE_TILES.replace('{z}', '2').replace('{y}', '1').replace('{x}', '1');

    try {
        await _fetchWithTimeout(satProbe, 7000, 'EOX satellite');
    } catch (err: any) {
        _satelliteAvailable = false;
        console.warn('[MapPicker] Satellite tiles unavailable, using street as default:', _errorMessage(err));
    }
}

/**
 * @param {string} url
 * @param {number} timeoutMs
 * @param {string} label
 * @returns {Promise<boolean>}
 */
async function _fetchWithTimeout(url: any, timeoutMs: any, label: any): Promise<boolean> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { method: 'GET', mode: 'cors', signal: ctrl.signal });
        if (!res.ok) {
            throw new Error(`${label} returned HTTP ${res.status}`);
        }
        return true;
    } catch (err: any) {
        throw new Error(`${label} preflight failed (${_errorMessage(err) || 'network/CSP'})`, { cause: err });
    } finally {
        clearTimeout(timeout);
    }
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Open the map picker modal.
 * @param {MapPickerOptions} [options={}]
 * @returns {Promise<LatLon|LatLonBounds|GeoJSONPolygon|null>}
 */
export async function openMapPickerModal(options: any = {}): Promise<any> {
    const { mode = 'point' } = options;
    const engine = await _ensureEngine();
    _injectStyles();

    return new Promise((resolve) => {
        const overlay = _buildOverlay(mode);
        document.body.appendChild(overlay);

        // Bounds mode: hide crosshair, show viewport border, change button text
        if (mode === 'bounds') {
            const crosshair = overlay.querySelector('.map-picker-crosshair');
            if (crosshair) crosshair.style.display = 'none';

            const confirmBtn = overlay.querySelector('.map-picker-btn-confirm');
            if (confirmBtn) confirmBtn.textContent = t('selectVisibleArea') || 'Select Visible Area';

            // Add viewport border indicator
            const wrapper = overlay.querySelector('.map-picker-map-wrapper');
            if (wrapper) {
                const border = document.createElement('div');
                border.className = 'map-picker-bounds-indicator';
                border.style.cssText =
                    'position:absolute;inset:12px;border:3px dashed rgba(59,130,246,0.7);border-radius:4px;pointer-events:none;z-index:5;';
                wrapper.style.position = 'relative';
                wrapper.appendChild(border);
            }
        }

        // Polygon mode: hide crosshair, setup drawing
        if (mode === 'polygon') {
            const crosshair = overlay.querySelector('.map-picker-crosshair');
            if (crosshair) crosshair.style.display = 'none';

            const confirmBtn = overlay.querySelector('.map-picker-btn-confirm');
            if (confirmBtn) {
                confirmBtn.textContent = t('mapPickerConfirmPolygon') || 'Confirm Polygon';
                confirmBtn.disabled = true;
            }
        }

        // Animate in
        requestAnimationFrame(() => {
            requestAnimationFrame(() => overlay.classList.add('active'));
        });

        const mapContainer = overlay.querySelector('.map-picker-map');
        const infoBar = overlay.querySelector('.map-picker-info');

        // Init map based on engine
        /** @type {any} */
        let mapInstance;
        if (engine === 'maplibre') {
            mapInstance = _initMapLibre(mapContainer, infoBar, overlay, options);
        } else {
            mapInstance = _initLeaflet(mapContainer, infoBar, options);
            _syncInitialLayerButtons(overlay);
            _setupLayerToggle(overlay, mapInstance, 'leaflet');
        }

        // Search
        _setupSearch(overlay, mapInstance, engine);

        // Polygon drawing (MapLibre only - Leaflet fallback uses point mode)
        /** @type {any} */
        let polygonState = null;
        if (mode === 'polygon' && engine === 'maplibre') {
            polygonState = _initPolygonDrawing(mapInstance, overlay, options);
        } else if (mode === 'polygon' && engine === 'leaflet') {
            console.warn('[MapPicker] Polygon mode requires MapLibre (WebGL). Falling back to point mode.');
        }

        // Buttons
        _setupButtons(overlay, mapInstance, resolve, mode, polygonState);
    });
}

// ----------------------------------------------------------------
// BUILD OVERLAY
// ----------------------------------------------------------------

/**
 * @param {MapPickerMode} [mode]
 * @returns {any}
 */
function _buildOverlay(mode = 'point'): any {
    const overlay = document.createElement('div');
    overlay.className = 'map-picker-overlay';

    const polygonToolbar =
        mode === 'polygon'
            ? `
            <div class="map-picker-polygon-toolbar">
                <span class="map-picker-polygon-hint">${t('mapPickerPolygonHint') || 'Click to add vertices. Click first vertex or "Close" to finish.'}</span>
                <div class="map-picker-polygon-actions">
                    <button class="map-picker-polygon-undo" title="${t('mapPickerUndo') || 'Undo last vertex'}" disabled>&#8630;</button>
                    <button class="map-picker-polygon-close" title="${t('mapPickerClosePolygon') || 'Close polygon'}" disabled>${t('mapPickerClosePolygonBtn') || 'Close'}</button>
                    <button class="map-picker-polygon-clear" title="${t('mapPickerClearPolygon') || 'Clear all'}" disabled>${t('mapPickerClearBtn') || 'Clear'}</button>
                </div>
            </div>`
            : '';

    overlay.innerHTML = `
        <div class="map-picker-container">
            <button class="map-picker-close" title="Close">&times;</button>

            <div class="map-picker-header">
                <div class="map-picker-search">
                    <input type="text" class="map-picker-search-input"
                           placeholder="${t('initMapSearchPlaceholder')}">
                    <button class="map-picker-search-btn">&#9906;</button>
                </div>
                <div class="map-picker-layer-toggle">
                    <button class="map-picker-layer-btn" data-layer="street" title="Street">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7l6-3 6 3 6-3v14l-6 3-6-3-6 3V7z"/></svg>
                    </button>
                    <button class="map-picker-layer-btn active" data-layer="satellite" title="Satellite">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    </button>
                </div>
            </div>
            ${polygonToolbar}
            <div class="map-picker-map-wrapper">
                <div class="map-picker-map"></div>
                <div class="map-picker-crosshair">
                    <div class="map-picker-crosshair-h"></div>
                    <div class="map-picker-crosshair-v"></div>
                    <div class="map-picker-crosshair-dot"></div>
                </div>
            </div>

            <div class="map-picker-footer">
                <div class="map-picker-info">
                    <span class="map-picker-info-coords">Lat: -- | Lon: --</span>
                </div>
                <div class="map-picker-actions">
                    <button class="map-picker-btn-cancel">${t('initMapCancel')}</button>
                    <button class="map-picker-btn-confirm">${t('initMapConfirm')}</button>
                </div>
            </div>
        </div>
    `;
    return overlay;
}

// ----------------------------------------------------------------
// MAPLIBRE GL JS INIT
// ----------------------------------------------------------------

/**
 * @param {any} container
 * @param {any} infoBar
 * @param {any} overlay
 * @param {MapPickerOptions} [options]
 * @returns {any}
 */
function _initMapLibre(container: any, infoBar: any, overlay: any, options: any = {}): any {
    const { startLat, startLon, startZoom } = _getStartPosition(options);

    const map = new (window as any).maplibregl.Map({
        container,
        style: OPENFREEMAP_STYLE,
        center: [startLon, startLat],
        zoom: startZoom,
        attributionControl: true,
        maxZoom: 19,
    });
    map._ecbtActiveLayer = _satelliteAvailable ? 'satellite' : 'street';
    map._ecbtPendingLayer = map._ecbtActiveLayer;
    overlay.dataset.activeLayer = map._ecbtActiveLayer;

    // Add satellite raster source (initially visible)
    map.on('load', () => {
        if (_satelliteAvailable) {
            map.addSource('satellite', {
                type: 'raster',
                tiles: [SATELLITE_TILES],
                tileSize: 256,
                attribution: SATELLITE_ATTR,
            });
            map.addLayer(
                {
                    id: 'satellite-layer',
                    type: 'raster',
                    source: 'satellite',
                    layout: { visibility: 'visible' },
                },
                map.getStyle().layers[0]?.id,
            ); // Insert below all vector layers

            // Move satellite to bottom so vector labels are on top
            const layers = map.getStyle().layers;
            if (layers.length > 1) {
                map.moveLayer('satellite-layer', layers[0].id);
            }
        }

        _applyMapLibreLayer(map, map._ecbtPendingLayer || map._ecbtActiveLayer || 'street');
    });

    // Navigation controls
    map.addControl(new (window as any).maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    // Info bar updates
    const coordsEl = infoBar.querySelector('.map-picker-info-coords');
    const updateCoords = () => {
        const center = map.getCenter();
        coordsEl.textContent = `Lat: ${center.lat.toFixed(6)}  |  Lon: ${center.lng.toFixed(6)}`;
    };
    map.on('move', updateCoords);
    updateCoords();

    // Layer toggle buttons
    _syncInitialLayerButtons(overlay);
    _setupLayerToggle(overlay, map, 'maplibre');

    return map;
}

// ----------------------------------------------------------------
// LEAFLET INIT (fallback)
// ----------------------------------------------------------------

/**
 * @param {any} container
 * @param {any} infoBar
 * @param {MapPickerOptions} [options]
 * @returns {any}
 */
function _initLeaflet(container: any, infoBar: any, options: any = {}): any {
    const { startLat, startLon, startZoom } = _getStartPosition(options);

    // R7: Loading indicator while tiles load
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'map-loading-indicator';
    loadingOverlay.style.cssText =
        'position:absolute;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:var(--neutral-200,#d4dce1);color:var(--text-secondary,#414f59);font-size:12px;pointer-events:none;transition:opacity 0.3s;';
    loadingOverlay.textContent = 'Loading map...';
    container.style.position = 'relative';
    container.appendChild(loadingOverlay);

    const map = (window as any).L.map(container, {
        center: [startLat, startLon],
        zoom: startZoom,
        zoomControl: true,
        attributionControl: true,
    });

    // Satellite layer (default)
    const satelliteLayer = (window as any).L.tileLayer(SATELLITE_TILES.replace('{z}', '{z}'), {
        attribution: SATELLITE_ATTR,
        maxZoom: 19,
    });
    const streetLayer = (window as any).L.tileLayer(OSM_TILES, {
        attribution: OSM_ATTR,
        maxZoom: 19,
    });
    if (_satelliteAvailable) {
        satelliteLayer.addTo(map);
    } else {
        streetLayer.addTo(map);
    }

    // R7: Hide loading indicator when first tile loads
    const activeForLoad = _satelliteAvailable ? satelliteLayer : streetLayer;
    activeForLoad.once('load', () => {
        loadingOverlay.addEventListener('transitionend', () => loadingOverlay.remove(), { once: true });
        loadingOverlay.style.opacity = '0';
    });

    // Store layers for toggle
    map._ecbtLayers = { street: streetLayer, satellite: satelliteLayer };
    map._ecbtActiveLayer = _satelliteAvailable ? 'satellite' : 'street';

    // Info bar updates
    const coordsEl = infoBar.querySelector('.map-picker-info-coords');
    const update = () => {
        const center = map.getCenter();
        coordsEl.textContent = `Lat: ${center.lat.toFixed(6)}  |  Lon: ${center.lng.toFixed(6)}`;
    };
    map.on('moveend', update);
    map.on('zoomend', update);
    update();

    requestAnimationFrame(() => requestAnimationFrame(() => map.invalidateSize()));

    return map;
}

// ----------------------------------------------------------------
// LAYER TOGGLE
// ----------------------------------------------------------------

/**
 * @param {any} overlay
 * @param {any} map
 * @param {MapPickerEngine} engine
 */
function _setupLayerToggle(overlay: any, map: any, engine: any) {
    /** @type {any} */
    const buttons = overlay.querySelectorAll('.map-picker-layer-btn');

    buttons.forEach(
        /** @param {any} map */ (btn: any) => {
            btn.addEventListener('click', () => {
                const layer = btn.dataset.layer || '';
                if (layer === 'satellite' && !_satelliteAvailable) return;

                // Update active state
                buttons.forEach(/** @param {any} layer */ (b: any) => b.classList.remove('active'));
                btn.classList.add('active');
                overlay.dataset.activeLayer = layer;

                if (engine === 'maplibre') {
                    _applyMapLibreLayer(map, layer);
                } else {
                    // Leaflet
                    const layers = map._ecbtLayers;
                    if (layer === 'satellite') {
                        map.removeLayer(layers.street);
                        layers.satellite.addTo(map);
                    } else {
                        map.removeLayer(layers.satellite);
                        layers.street.addTo(map);
                    }
                    map._ecbtActiveLayer = layer;
                }
            });
        },
    );
}

/**
 * @param {any} map
 * @param {string} layer
 */
function _applyMapLibreLayer(map: any, layer: any) {
    if (!map) return;
    map._ecbtActiveLayer = layer;
    map._ecbtPendingLayer = layer;

    const hasSatelliteLayer = typeof map.getLayer === 'function' && !!map.getLayer('satellite-layer');
    if (!hasSatelliteLayer) return;

    const visibility = layer === 'satellite' ? 'visible' : 'none';
    try {
        map.setLayoutProperty('satellite-layer', 'visibility', visibility);
        map._ecbtPendingLayer = null;
    } catch (e: any) {
        console.debug('[mapPicker] setLayer:', _errorMessage(e));
        /* style still settling; keep pending layer */
    }
}

/**
 * @param {any} overlay
 */
function _syncInitialLayerButtons(overlay: any) {
    if (!overlay) return;
    const streetBtn = overlay.querySelector('.map-picker-layer-btn[data-layer="street"]');
    const satBtn = overlay.querySelector('.map-picker-layer-btn[data-layer="satellite"]');
    if (!streetBtn || !satBtn) return;

    if (_satelliteAvailable) {
        satBtn.classList.add('active');
        streetBtn.classList.remove('active');
        satBtn.disabled = false;
        satBtn.removeAttribute('aria-disabled');
    } else {
        streetBtn.classList.add('active');
        satBtn.classList.remove('active');
        satBtn.disabled = true;
        satBtn.setAttribute('aria-disabled', 'true');
        satBtn.title = 'Satellite unavailable';
    }
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

/**
 * @param {MapPickerOptions} [options]
 * @returns {{startLat:number,startLon:number,startZoom:number}}
 */
function _getStartPosition(options: any = {}): { startLat: number; startLon: number; startZoom: number } {
    let startLat = DEFAULT_LAT;
    let startLon = DEFAULT_LON;
    let startZoom = DEFAULT_ZOOM;

    if (
        options?.initialCenter &&
        Number.isFinite(options.initialCenter.latitude) &&
        Number.isFinite(options.initialCenter.longitude)
    ) {
        startLat = Number(options.initialCenter.latitude);
        startLon = Number(options.initialCenter.longitude);
        startZoom = Number.isFinite(options.initialZoom) ? Number(options.initialZoom) : 14;
        return { startLat, startLon, startZoom };
    }

    if (hasOrigin()) {
        const origin = getOrigin();
        const wgs = utmToWGS84({
            easting: origin.easting,
            northing: origin.northing,
            zone: origin.zone,
            hemisphere: origin.hemisphere,
        });
        startLat = wgs.latitude;
        startLon = wgs.longitude;
        startZoom = 14;
    }

    if (Number.isFinite(options?.initialZoom)) {
        startZoom = Number(options.initialZoom);
    }

    return { startLat, startLon, startZoom };
}

// ----------------------------------------------------------------
// SEARCH (Nominatim)
// ----------------------------------------------------------------

/**
 * @param {any} overlay
 * @param {any} map
 * @param {MapPickerEngine} engine
 */
function _setupSearch(overlay: any, map: any, engine: any) {
    const input = overlay.querySelector('.map-picker-search-input');
    const btn = overlay.querySelector('.map-picker-search-btn');
    let searching = false;

    async function doSearch() {
        const query = input.value.trim();
        if (!query || searching) return;

        searching = true;
        btn.disabled = true;
        btn.textContent = '...';

        try {
            const { geocodeAddress } = await import('../../core/llm/siteResearch.js');
            const result = await geocodeAddress(query);

            if (result) {
                if (engine === 'maplibre') {
                    map.flyTo({ center: [result.lon, result.lat], zoom: 15, duration: 1500 });
                } else {
                    map.flyTo([result.lat, result.lon], 15, { duration: 1.5 });
                }
            } else {
                input.classList.remove('map-picker-search-input--error');
                input.addEventListener('animationend', () => input.classList.remove('map-picker-search-input--error'), {
                    once: true,
                });
                requestAnimationFrame(() => input.classList.add('map-picker-search-input--error'));
            }
        } catch (e: any) {
            console.error('[MapPicker] Search error:', _errorMessage(e));
        } finally {
            searching = false;
            btn.disabled = false;
            btn.textContent = '\u26C2';
        }
    }

    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', (/** @type {KeyboardEvent} */ e: any) => {
        if (e.key === 'Enter') doSearch();
    });
}

// ----------------------------------------------------------------
// POLYGON GEOMETRY UTILITIES (exported for testing)
// ----------------------------------------------------------------

/**
 * Validate a GeoJSON polygon ring (closed, min 3 unique vertices, no self-intersect).
 *
 * TRUST-009 G3 consolidação 2026-05-30: shim para o validador canônico em
 * `core/boundary/polygonGeometry.ts`. Mantém a API legada `{valid, reason?}`
 * para não quebrar callers (mapPicker:800), mas a lógica de detecção
 * (self-intersect, vertex count, degenerate) usa o canônico.
 *
 * Conversão de input: GeoJSON ring `[lon, lat][]` → canônico `{x, y}[]`.
 * Conversão de output: canônico `{valid, errors[], normalizedRing}` →
 * legacy `{valid, reason?}` (primeiro erro vira reason; ring closure adicional
 * pois canônico não exige closure explícita, mas GeoJSON sim).
 *
 * @param {number[][]} ring - Array of [lon, lat] pairs (GeoJSON ring, fechado)
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validatePolygonRing(ring: any): { valid: boolean; reason?: string } {
    if (!Array.isArray(ring) || ring.length < 4) {
        return { valid: false, reason: 'Ring must have at least 4 positions (3 vertices + closing)' };
    }
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
        return { valid: false, reason: 'Ring is not closed (first and last position must match)' };
    }
    // Converter [lon, lat] → {x, y} (descartando último vértice = closure)
    const canonicalRing = ring.slice(0, -1).map((p: any) => ({ x: p[0], y: p[1] }));
    const result = _canonicalValidatePolygonRing(canonicalRing);
    if (result.valid) return { valid: true };
    // Traduzir primeiro erro do canônico para reason legado
    const firstErr = result.errors[0] || { code: 'invalid', message: 'Polygon invalid' };
    const reasonMap: Record<string, string> = {
        too_few_vertices: 'Polygon must have at least 3 unique vertices',
        self_intersection: 'Polygon ring is self-intersecting',
        degenerate: 'Polygon is degenerate (zero area)',
        too_many_vertices: firstErr.message,
    };
    return { valid: false, reason: reasonMap[firstErr.code] || firstErr.message };
}

// _cross + _isSelfIntersecting removidos 2026-05-30 (TRUST-009 G3 consolidação)
// — única caller era validatePolygonRing, agora shim ao canônico.

/**
 * Calculate the area of a polygon using the Shoelace formula.
 * Returns area in square degrees (for geodetic coordinates).
 * @param {number[][]} ring - Closed ring of [lon, lat] pairs
 * @returns {number} - Unsigned area
 */
export function polygonArea(ring: any): number {
    if (!ring || ring.length < 4) return 0;
    let area = 0;
    const n = ring.length - 1;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += ring[i][0] * ring[j][1];
        area -= ring[j][0] * ring[i][1];
    }
    return Math.abs(area) / 2;
}

/**
 * Test if a point is inside a polygon (ray casting algorithm).
 * @param {number[]} point - [lon, lat]
 * @param {number[][]} ring - Closed ring of [lon, lat] pairs
 * @returns {boolean}
 */
export function pointInPolygon(point: any, ring: any): boolean {
    if (!ring || ring.length < 4) return false;
    const x = point[0];
    const y = point[1];
    let inside = false;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = ring[i][0],
            yi = ring[i][1];
        const xj = ring[j][0],
            yj = ring[j][1];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Build a valid GeoJSON Polygon from an array of [lon, lat] vertices.
 * Automatically closes the ring.
 * @param {number[][]} vertices - Open array of [lon, lat] pairs (min 3)
 * @returns {{ type: string, coordinates: number[][][] } | null}
 */
export function buildGeoJSONPolygon(vertices: any): { type: string; coordinates: number[][][] } | null {
    if (!vertices || vertices.length < 3) return null;
    const ring = [...vertices, [vertices[0][0], vertices[0][1]]];
    const validation = validatePolygonRing(ring);
    if (!validation.valid) return null;
    return {
        type: 'Polygon',
        coordinates: [ring],
    };
}

// ----------------------------------------------------------------
// POLYGON DRAWING (MapLibre only)
// ----------------------------------------------------------------

const POLYGON_SOURCE = 'ecbt-polygon-draw';
const POLYGON_LINE_LAYER = 'ecbt-polygon-line';
const POLYGON_FILL_LAYER = 'ecbt-polygon-fill';
const _POLYGON_VERTEX_LAYER = 'ecbt-polygon-vertices';
const POLYGON_PREVIEW_SOURCE = 'ecbt-polygon-preview';
const POLYGON_PREVIEW_LAYER = 'ecbt-polygon-preview-line';

/**
 * Initialize polygon drawing interaction on a MapLibre map.
 * @param {any} map - MapLibre GL map instance
 * @param {any} overlay - Modal overlay element
 * @param {MapPickerOptions} [options] - Drawing options
 * @returns {any} - State object with vertices and methods
 */
function _initPolygonDrawing(map: any, overlay: any, options: any = {}): any {
    const maxVertices = options.maxVertices || 50;
    const state: any = {
        vertices: [],
        closed: false,
        markers: [],
        midMarkers: [],
        dragging: null,
    };

    const confirmBtn = overlay.querySelector('.map-picker-btn-confirm');
    const infoCoords = overlay.querySelector('.map-picker-info-coords');
    const undoBtn = overlay.querySelector('.map-picker-polygon-undo');
    const closeBtn = overlay.querySelector('.map-picker-polygon-close');
    const clearBtn = overlay.querySelector('.map-picker-polygon-clear');

    // Wait for map load, then add sources/layers
    map.on('load', () => _onMapLoad());
    if (map.loaded()) _onMapLoad();

    /** @private Add GeoJSON sources and layers for polygon rendering */
    function _onMapLoad() {
        // Main polygon source
        map.addSource(POLYGON_SOURCE, {
            type: 'geojson',
            data: _emptyFC(),
        });

        // Fill layer (semi-transparent blue)
        map.addLayer({
            id: POLYGON_FILL_LAYER,
            type: 'fill',
            source: POLYGON_SOURCE,
            paint: {
                'fill-color': '#3b82f6',
                'fill-opacity': 0.2,
            },
            filter: ['==', '$type', 'Polygon'],
        });

        // Line layer (solid blue)
        map.addLayer({
            id: POLYGON_LINE_LAYER,
            type: 'line',
            source: POLYGON_SOURCE,
            paint: {
                'line-color': '#3b82f6',
                'line-width': 2.5,
            },
        });

        // Preview line source (cursor tracking)
        map.addSource(POLYGON_PREVIEW_SOURCE, {
            type: 'geojson',
            data: _emptyFC(),
        });
        map.addLayer({
            id: POLYGON_PREVIEW_LAYER,
            type: 'line',
            source: POLYGON_PREVIEW_SOURCE,
            paint: {
                'line-color': '#60a5fa',
                'line-width': 1.5,
                'line-dasharray': [4, 3],
            },
        });

        // Map cursor
        map.getCanvas().style.cursor = 'crosshair';
    }

    // Click to add vertex
    map.on(
        'click',
        /** @param {any} e */ (e: any) => {
            if (state.closed || state.dragging) return;
            if (state.vertices.length >= maxVertices) return;

            const lngLat = [e.lngLat.lng, e.lngLat.lat];

            // Check if clicking near first vertex to close
            if (state.vertices.length >= 3) {
                const first = state.vertices[0];
                const pixel0 = map.project(first);
                const pixelClick = map.project(e.lngLat);
                const dist = Math.hypot(pixel0.x - pixelClick.x, pixel0.y - pixelClick.y);
                if (dist < 12) {
                    _closePolygon();
                    return;
                }
            }

            state.vertices.push(lngLat);
            _addVertexMarker(lngLat, state.vertices.length - 1);
            _updatePolygonSource();
            _updateToolbar();
        },
    );

    // Mouse move for preview line
    map.on(
        'mousemove',
        /** @param {any} e */ (e: any) => {
            if (state.closed || state.vertices.length === 0) return;
            const last = state.vertices[state.vertices.length - 1];
            const cursor = [e.lngLat.lng, e.lngLat.lat];
            const previewData = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: [last, cursor] },
                        properties: {},
                    },
                ],
            };
            const src = map.getSource(POLYGON_PREVIEW_SOURCE);
            if (src) src.setData(previewData);

            // Update info bar with vertex count
            if (infoCoords) {
                const vCount = state.vertices.length;
                const label = t('mapPickerVertexCount') || 'Vertices';
                infoCoords.textContent = `${label}: ${vCount}/${maxVertices}  |  Lat: ${e.lngLat.lat.toFixed(6)}  |  Lon: ${e.lngLat.lng.toFixed(6)}`;
            }
        },
    );

    // Toolbar buttons
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            if (state.closed || state.vertices.length === 0) return;
            state.vertices.pop();
            const marker = state.markers.pop();
            if (marker) marker.remove();
            _updatePolygonSource();
            _updateToolbar();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (state.vertices.length >= 3 && !state.closed) {
                _closePolygon();
            }
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            _clearPolygon();
        });
    }

    /** @private Close the polygon and enable editing */
    function _closePolygon() {
        state.closed = true;
        _updatePolygonSource();
        _clearPreview();
        map.getCanvas().style.cursor = '';

        // Enable confirm button
        if (confirmBtn) confirmBtn.disabled = false;

        // Add midpoint markers for edge insertion
        _addMidpointMarkers();
        _updateToolbar();
    }

    /** @private Clear all polygon state */
    function _clearPolygon() {
        state.vertices = [];
        state.closed = false;
        state.markers.forEach((m: any) => m.remove());
        state.markers = [];
        state.midMarkers.forEach((m: any) => m.remove());
        state.midMarkers = [];
        _updatePolygonSource();
        _clearPreview();
        map.getCanvas().style.cursor = 'crosshair';
        if (confirmBtn) confirmBtn.disabled = true;
        _updateToolbar();
    }

    /** @private Clear preview line */
    function _clearPreview() {
        const src = map.getSource(POLYGON_PREVIEW_SOURCE);
        if (src) src.setData(_emptyFC());
    }

    /** @private Update polygon GeoJSON source */
    function _updatePolygonSource() {
        const src = map.getSource(POLYGON_SOURCE);
        if (!src) return;

        const features = [];
        if (state.vertices.length >= 2) {
            const coords = state.closed ? [...state.vertices, state.vertices[0]] : [...state.vertices];

            if (state.closed && state.vertices.length >= 3) {
                features.push({
                    type: 'Feature',
                    geometry: { type: 'Polygon', coordinates: [coords] },
                    properties: {},
                });
            }
            features.push({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: coords },
                properties: {},
            });
        }
        src.setData({ type: 'FeatureCollection', features });
    }

    /**
     * @private
     * @param {number[]} lngLat
     * @param {number} index
     */
    function _addVertexMarker(lngLat: any, index: any) {
        const el = document.createElement('div');
        el.className = 'map-picker-vertex-marker';
        if (index === 0) el.classList.add('map-picker-vertex-first');

        const marker = new (window as any).maplibregl.Marker({
            element: el,
            draggable: true,
        })
            .setLngLat(lngLat)
            .addTo(map);

        // Drag updates vertex position
        marker.on('drag', () => {
            const pos = marker.getLngLat();
            state.vertices[index] = [pos.lng, pos.lat];
            _updatePolygonSource();
            _refreshMidpointMarkers();
        });

        // Double-click to remove vertex (min 3 when closed)
        el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (!state.closed) return;
            if (state.vertices.length <= 3) return;
            state.vertices.splice(index, 1);
            marker.remove();
            state.markers.splice(index, 1);
            // Re-index remaining markers
            state.markers.forEach(
                /**
                 * @param {any} m
                 * @param {number} i
                 */
                (m: any, i: any) => {
                    m._ecbtIndex = i;
                },
            );
            _updatePolygonSource();
            _refreshMidpointMarkers();
        });

        marker._ecbtIndex = index;
        state.markers.push(marker);
    }

    /** @private Add midpoint markers for inserting new vertices */
    function _addMidpointMarkers() {
        _clearMidpointMarkers();
        if (!state.closed || state.vertices.length < 3) return;

        for (let i = 0; i < state.vertices.length; i++) {
            const a = state.vertices[i];
            const b = state.vertices[(i + 1) % state.vertices.length];
            const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

            const el = document.createElement('div');
            el.className = 'map-picker-midpoint-marker';

            const marker = new (window as any).maplibregl.Marker({ element: el }).setLngLat(mid).addTo(map);

            const insertIdx = i + 1;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                if (state.vertices.length >= maxVertices) return;
                state.vertices.splice(insertIdx, 0, mid);
                // Rebuild all markers
                _rebuildVertexMarkers();
                _updatePolygonSource();
                _refreshMidpointMarkers();
            });

            state.midMarkers.push(marker);
        }
    }

    /** @private Clear midpoint markers */
    function _clearMidpointMarkers() {
        state.midMarkers.forEach((m: any) => m.remove());
        state.midMarkers = [];
    }

    /** @private Refresh midpoint markers after edit */
    function _refreshMidpointMarkers() {
        _clearMidpointMarkers();
        if (state.closed) _addMidpointMarkers();
    }

    /** @private Rebuild all vertex markers from state.vertices */
    function _rebuildVertexMarkers() {
        state.markers.forEach((m: any) => m.remove());
        state.markers = [];
        state.vertices.forEach(
            /**
             * @param {number[]} v
             * @param {number} i
             */
            (v: any, i: any) => _addVertexMarker(v, i),
        );
    }

    /** @private Update toolbar button states */
    function _updateToolbar() {
        if (undoBtn) undoBtn.disabled = state.closed || state.vertices.length === 0;
        if (closeBtn) closeBtn.disabled = state.closed || state.vertices.length < 3;
        if (clearBtn) clearBtn.disabled = state.vertices.length === 0;
    }

    /** @returns GeoJSON Polygon or null */
    state.getGeoJSON = () => {
        if (!state.closed || state.vertices.length < 3) return null;
        return buildGeoJSONPolygon(state.vertices);
    };

    return state;
}

/** @private Create an empty GeoJSON FeatureCollection
 * @returns {any}
 */
function _emptyFC(): any {
    return { type: 'FeatureCollection', features: [] };
}

// ----------------------------------------------------------------
// BUTTONS
// ----------------------------------------------------------------

/**
 * @param {any} overlay
 * @param {any} map
 * @param {(value: LatLon|LatLonBounds|GeoJSONPolygon|null) => void} resolve
 * @param {MapPickerMode} [mode]
 * @param {any} [polygonState]
 */
function _setupButtons(overlay: any, map: any, resolve: any, mode = 'point', polygonState: any = null) {
    // Escape - registrado antes de close() para referencia na closure
    const escHandler = (/** @type {KeyboardEvent} */ e: any) => {
        if (e.key === 'Escape') close(null);
    };
    document.addEventListener('keydown', escHandler);

    /**
     * @param {LatLon|LatLonBounds|GeoJSONPolygon|null} result
     */
    function close(result: any) {
        document.removeEventListener('keydown', escHandler);
        overlay.classList.remove('active');
        setTimeout(() => {
            map.remove();
            overlay.remove();
            resolve(result);
        }, 350);
    }

    // Confirm - return center, bounds, or polygon based on mode
    overlay.querySelector('.map-picker-btn-confirm').addEventListener('click', () => {
        if (mode === 'polygon' && polygonState) {
            const geojson = polygonState.getGeoJSON();
            close(geojson);
        } else if (mode === 'bounds') {
            // Return viewport bounds for tile segmentation
            const bounds = map.getBounds();
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            close({
                sw: { latitude: sw.lat, longitude: sw.lng },
                ne: { latitude: ne.lat, longitude: ne.lng },
            });
        } else {
            const center = map.getCenter();
            close({ latitude: center.lat, longitude: center.lng });
        }
    });

    // Cancel
    overlay.querySelector('.map-picker-btn-cancel').addEventListener('click', () => close(null));

    // Close X
    overlay.querySelector('.map-picker-close').addEventListener('click', () => close(null));
}

// ----------------------------------------------------------------
// STYLES (injected once)
// ----------------------------------------------------------------

let stylesInjected = false;

function _injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement('style');
    style.textContent = `
        /* --- Map Picker Overlay --- */
        .map-picker-overlay {
            position: fixed;
            inset: 0;
            z-index: 8500;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.7);
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, visibility 0.3s ease;
        }
        .map-picker-overlay.active {
            opacity: 1;
            visibility: visible;
        }

        /* --- Container --- */
        .map-picker-container {
            width: 92%;
            max-width: 1000px;
            height: 85vh;
            max-height: 750px;
            background: #1e1e2e;
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
            transform: translateY(20px);
            transition: transform 0.3s ease;
            position: relative;
        }
        .map-picker-overlay.active .map-picker-container {
            transform: translateY(0);
        }

        /* --- Close button --- */
        .map-picker-close {
            position: absolute;
            top: 8px;
            right: 12px;
            z-index: 10;
            background: rgba(0,0,0,0.4);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 50%;
            color: rgba(255, 255, 255, 0.6);
            font-size: 20px;
            width: 32px;
            height: 32px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s;
        }
        .map-picker-close:hover {
            color: #fff;
            background: rgba(239,68,68,0.3);
            border-color: rgba(239,68,68,0.5);
        }

        /* --- Header (search + layer toggle) --- */
        .map-picker-header {
            display: flex;
            gap: 8px;
            padding: 10px 56px 10px 14px;
            background: #161622;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            align-items: center;
        }
        .map-picker-search {
            display: flex;
            gap: 6px;
            flex: 1;
        }
        .map-picker-search-input {
            flex: 1;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 8px 12px;
            color: #e2e8f0;
            font-size: 13px;
            outline: none;
            transition: border-color 0.2s;
        }
        .map-picker-search-input:focus {
            border-color: rgba(59, 130, 246, 0.5);
        }
        .map-picker-search-input--error {
            animation: map-picker-search-error 2s ease-out;
        }
        @keyframes map-picker-search-error {
            0%,
            85% {
                border-color: #ef4444;
            }
            100% {
                border-color: rgba(255, 255, 255, 0.1);
            }
        }
        .map-picker-search-input::placeholder {
            color: rgba(255, 255, 255, 0.3);
        }
        .map-picker-search-btn {
            background: rgba(59, 130, 246, 0.2);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 8px;
            padding: 8px 14px;
            color: #60a5fa;
            font-size: 15px;
            cursor: pointer;
            transition: background 0.15s;
        }
        .map-picker-search-btn:hover {
            background: rgba(59, 130, 246, 0.35);
        }

        /* --- Layer toggle buttons --- */
        .map-picker-layer-toggle {
            display: flex;
            gap: 2px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
            padding: 2px;
        }
        .map-picker-layer-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            background: transparent;
            border: none;
            border-radius: 6px;
            color: rgba(255,255,255,0.4);
            cursor: pointer;
            transition: all 0.15s;
        }
        .map-picker-layer-btn:hover {
            color: rgba(255,255,255,0.7);
            background: rgba(255,255,255,0.08);
        }
        .map-picker-layer-btn.active {
            color: #60a5fa;
            background: rgba(59,130,246,0.15);
        }

        /* --- Map wrapper (with crosshair) --- */
        .map-picker-map-wrapper {
            flex: 1;
            position: relative;
            min-height: 0;
        }
        .map-picker-map {
            width: 100%;
            height: 100%;
        }

        /* --- Crosshair --- */
        .map-picker-crosshair {
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 1000;
        }
        .map-picker-crosshair-h,
        .map-picker-crosshair-v {
            position: absolute;
            background: rgba(239, 68, 68, 0.6);
        }
        .map-picker-crosshair-h {
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 40px;
            height: 1.5px;
        }
        .map-picker-crosshair-v {
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 1.5px;
            height: 40px;
        }
        .map-picker-crosshair-dot {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: rgba(239, 68, 68, 0.8);
            box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
        }

        /* --- Footer (info + actions) --- */
        .map-picker-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 14px;
            background: #161622;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .map-picker-info {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.5);
            font-family: 'JetBrains Mono', Consolas, monospace;
            letter-spacing: 0.3px;
        }
        .map-picker-actions {
            display: flex;
            gap: 10px;
        }
        .map-picker-btn-cancel {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 8px 20px;
            color: #94a3b8;
            font-size: 13px;
            cursor: pointer;
            transition: background 0.15s;
        }
        .map-picker-btn-cancel:hover {
            background: rgba(255, 255, 255, 0.12);
        }
        .map-picker-btn-confirm {
            background: #3b82f6;
            border: none;
            border-radius: 8px;
            padding: 8px 22px;
            color: #fff;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s;
        }
        .map-picker-btn-confirm:hover {
            background: #2563eb;
        }

        /* --- MapLibre overrides (dark theme) --- */
        .map-picker-map .maplibregl-ctrl-attrib {
            background: rgba(0,0,0,0.5) !important;
            color: rgba(255,255,255,0.5) !important;
            font-size: 10px !important;
        }
        .map-picker-map .maplibregl-ctrl-attrib a {
            color: rgba(100,180,255,0.7) !important;
        }
        .map-picker-map .maplibregl-ctrl button {
            background: rgba(30,30,46,0.9) !important;
            border: 1px solid rgba(255,255,255,0.1) !important;
        }
        .map-picker-map .maplibregl-ctrl button span {
            filter: invert(1) !important;
        }

        /* --- Leaflet overrides (dark theme, fallback) --- */
        .map-picker-map .leaflet-control-layers {
            background: #1e1e2e;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #e2e8f0;
            border-radius: 8px;
            padding: 8px 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        .map-picker-map .leaflet-control-layers label {
            color: #e2e8f0;
        }

        /* --- Polygon toolbar --- */
        .map-picker-polygon-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 14px;
            background: rgba(59, 130, 246, 0.08);
            border-bottom: 1px solid rgba(59, 130, 246, 0.15);
            gap: 8px;
        }
        .map-picker-polygon-hint {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.6);
            flex: 1;
        }
        .map-picker-polygon-actions {
            display: flex;
            gap: 6px;
        }
        .map-picker-polygon-actions button {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 6px;
            padding: 4px 12px;
            color: #94a3b8;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s;
        }
        .map-picker-polygon-actions button:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.12);
            color: #e2e8f0;
        }
        .map-picker-polygon-actions button:disabled {
            opacity: 0.35;
            cursor: not-allowed;
        }

        /* --- Polygon vertex markers --- */
        .map-picker-vertex-marker {
            width: 12px;
            height: 12px;
            background: #3b82f6;
            border: 2px solid #fff;
            border-radius: 50%;
            cursor: grab;
            box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        }
        .map-picker-vertex-marker:hover {
            background: #2563eb;
            transform: scale(1.3);
        }
        .map-picker-vertex-first {
            background: #22c55e;
            width: 14px;
            height: 14px;
            border: 2px solid #fff;
        }
        .map-picker-vertex-first:hover {
            background: #16a34a;
        }
        .map-picker-midpoint-marker {
            width: 8px;
            height: 8px;
            background: rgba(96, 165, 250, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.5);
            border-radius: 50%;
            cursor: pointer;
        }
        .map-picker-midpoint-marker:hover {
            background: #60a5fa;
            transform: scale(1.5);
        }

        /* --- Responsive --- */
        @media (max-width: 600px) {
            .map-picker-container {
                width: 98%;
                height: 92vh;
                border-radius: 10px;
            }
            .map-picker-footer {
                flex-direction: column;
                gap: 8px;
            }
        }
    `;
    document.head.appendChild(style);
}
