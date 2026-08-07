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
   TILE STITCHER — Canvas-based satellite tile compositor
   ================================================================

   Compõe tiles XYZ em uma imagem recortada por bbox (bounding box).
   Processo 100% client-side usando tiles de múltiplos provedores.

   STACK:
   - Sentinel-2 Cloudless 2016 by EOX (CC BY 4.0 — uso comercial OK)
   - ESRI World Imagery legacy (Esri ToS — uso educacional/interno)
   - USGS National Map (Public Domain)
   - NASA GIBS Blue Marble (Public Domain)
   - OpenFreeMap / OSM (ODbL)
   - Stadia Maps Alidade Satellite (requer API key)
   - Canvas 2D API (offscreen compositing)
   - Sem dependências externas

   ALGORITMO:
   1. Calcular zoom ideal para o bbox
   2. Calcular quais tiles XYZ cobrem o bbox
   3. Fetch tiles em paralelo com timeout
   4. Compor no canvas na posição correta
   5. Recortar ao bbox exato (sub-tile precision)
   6. Exportar como data URL JPEG

   NOTA DE LICENÇA:
   - Sentinel-2 2016 (CC BY 4.0): uso comercial permitido com atribuição
   - Sentinel-2 2018/2021 (CC BY-NC-SA 4.0): apenas não-comercial — NÃO incluídos
   - ESRI legacy: acesso público sem token mas sujeito a Esri ToS
   - Stadia Maps: requer chave API, free tier disponível

   ================================================================ */

// ----------------------------------------------------------------
// TILE PROVIDERS
// ----------------------------------------------------------------

interface Provider {
    name: string;
    url: string;
    maxZoom?: number;
    attribution?: string;
    license?: string;
    licenseUrl?: string;
    resolution?: string;
    coverage?: string;
    requiresKey?: boolean;
    [k: string]: any;
}

const PROVIDERS: Provider[] = [
    {
        name: 'Sentinel-2 Cloudless 2016',
        // CC BY 4.0 - uso comercial permitido com atribuição. Resolução nativa ~10m/px.
        url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2016_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg',
        maxZoom: 14,
        attribution: 'Sentinel-2 cloudless — s2maps.eu by EOX (Copernicus Sentinel data 2016)',
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        resolution: '~10m/px',
        coverage: 'Global',
        requiresKey: false,
    },
    {
        name: 'ESRI World Imagery',
        // Endpoint legacy sem token - alta resolução (zoom 19), CORS habilitado.
        // Sujeito a Esri ToS: uso educacional e desenvolvimento. Não usar em produção comercial sem licença.
        url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 19,
        attribution: 'Esri, Maxar, Earthstar Geographics',
        license: 'Esri ToS',
        licenseUrl: 'https://www.esri.com/en-us/legal/terms/full-master-agreement',
        resolution: '~0.3m/px',
        coverage: 'Global',
        requiresKey: false,
    },
    {
        name: 'USGS Imagery',
        // NAIP 1m nos EUA, Landsat fallback global - public domain
        url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 16,
        attribution: 'USGS National Map',
        license: 'Public Domain',
        licenseUrl: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
        resolution: '~1m/px (EUA)',
        coverage: 'EUA',
        requiresKey: false,
    },
    {
        name: 'NASA Blue Marble',
        // Imagem composta global (batimetria + relevo) - public domain
        url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
        maxZoom: 8,
        attribution: 'NASA GIBS',
        license: 'Public Domain',
        licenseUrl: 'https://www.nasa.gov/multimedia/guidelines/index.html',
        resolution: '~500m/px',
        coverage: 'Global',
        requiresKey: false,
    },
    {
        name: 'OpenStreetMap',
        // OpenFreeMap liberty style - raster PNG. Pode falhar com CORS em canvas stitching.
        url: 'https://tile.openfreemap.org/styles/liberty/{z}/{x}/{y}.png',
        maxZoom: 18,
        attribution: '© OpenStreetMap contributors',
        license: 'ODbL',
        licenseUrl: 'https://opendatacommons.org/licenses/odbl/',
        resolution: '~1m/px',
        coverage: 'Global',
        requiresKey: false,
    },
    {
        name: 'Stadia Maps Satellite',
        // Alidade Satellite - alta resolução, requer chave API Stadia Maps.
        // Free tier disponível em stadiamaps.com. Domínio deve ser registrado no painel.
        url: 'https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}@2x.jpg?api_key={key}',
        maxZoom: 20,
        attribution: '&copy; Stadia Maps &copy; OpenMapTiles &copy; OpenStreetMap contributors',
        license: 'Stadia Maps ToS',
        licenseUrl: 'https://stadiamaps.com/terms-of-service/',
        resolution: '~0.3m/px',
        coverage: 'Global',
        requiresKey: true,
    },
];

// Zoom padrão máximo para o fallback automático (providers sem chave)
const _DEFAULT_MAX_ZOOM = 19;
const TILE_SIZE = 256;
const FETCH_TIMEOUT_MS = 5000;

// Cache para evitar re-fetch em edições repetidas do boundary
const _cache = new Map<string, string>();
const MAX_CACHE_SIZE = 10;

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Stitch satellite tiles into a single image covering a bounding box.
 * Compõe tiles de satélite em uma imagem única cobrindo um bbox.
 *
 * @param sw - Southwest corner (WGS84)
 * @param ne - Northeast corner (WGS84)
 * @param outputSize - Desired output size in pixels (square)
 * @returns Data URL (JPEG) or empty string on failure
 */
export async function stitchTiles(
    sw: { latitude: number; longitude: number },
    ne: { latitude: number; longitude: number },
    outputSize: number = 256,
): Promise<string> {
    // Cache key baseada no bbox arredondado (evita re-fetch para micro-edições)
    const cacheKey = [
        sw.latitude.toFixed(5),
        sw.longitude.toFixed(5),
        ne.latitude.toFixed(5),
        ne.longitude.toFixed(5),
        outputSize,
    ].join('|');

    if (_cache.has(cacheKey)) return _cache.get(cacheKey)!;

    // Ordena providers livres por maxZoom decrescente: maior resolução primeiro.
    // Para bbox pequeno (site ambiental), ESRI (zoom 19) é tentado antes de Sentinel (zoom 14).
    const freeProviders = PROVIDERS.filter((p) => !p.requiresKey).sort(
        (a, b) => (b.maxZoom ?? 0) - (a.maxZoom ?? 0),
    );

    for (const provider of freeProviders) {
        try {
            const result = await _stitchFromProvider(provider, sw, ne, outputSize);
            if (result) {
                _cacheResult(cacheKey, result);
                return result;
            }
        } catch (err) {
            console.warn(`[TileStitcher] ${provider.name} failed:`, (err as any)?.message);
        }
    }

    console.error('[TileStitcher] All providers failed');
    return '';
}

/**
 * Stitch tiles using a specific provider (no fallback chain).
 * Compõe tiles usando um provedor específico, sem tentar outros.
 *
 * @param providerIndex - Index in TILE_PROVIDERS array
 * @param sw - Southwest corner (WGS84)
 * @param ne - Northeast corner (WGS84)
 * @param outputSize - Desired output size in pixels (square)
 * @returns Data URL (JPEG) or empty string on failure
 */
export async function stitchTilesWithProvider(
    providerIndex: number,
    sw: { latitude: number; longitude: number },
    ne: { latitude: number; longitude: number },
    outputSize: number = 256,
): Promise<string> {
    const provider = PROVIDERS[providerIndex];
    if (!provider) {
        console.error(`[TileStitcher] Invalid provider index: ${providerIndex}`);
        return '';
    }

    const cacheKey = [
        providerIndex,
        sw.latitude.toFixed(5),
        sw.longitude.toFixed(5),
        ne.latitude.toFixed(5),
        ne.longitude.toFixed(5),
        outputSize,
    ].join('|');

    if (_cache.has(cacheKey)) return _cache.get(cacheKey)!;

    try {
        const result = await _stitchFromProvider(provider, sw, ne, outputSize);
        if (result) {
            _cacheResult(cacheKey, result);
            return result;
        }
    } catch (err) {
        console.warn(`[TileStitcher] ${provider.name} failed:`, (err as any)?.message);
    }

    return '';
}

/**
 * Available tile providers (read-only reference).
 * Provedores de tiles disponíveis para seleção pelo usuário.
 */
export { PROVIDERS as TILE_PROVIDERS };

/**
 * Clear the tile cache (e.g., when switching providers).
 */
export function clearTileCache(): void {
    _cache.clear();
}

/**
 * Stitch tiles using a custom URL template (e.g., Mapbox with API key).
 * Compõe tiles usando URL arbitrária com template {z}/{x}/{y}.
 *
 * @param templateUrl - URL template com {z}, {x}, {y} placeholders
 * @param maxZoom - Maximum zoom level for this provider
 * @param sw - Southwest corner (WGS84)
 * @param ne - Northeast corner (WGS84)
 * @param outputSize - Desired output size in pixels (square)
 * @returns Data URL (JPEG) or empty string on failure
 */
export async function stitchTilesWithCustomUrl(
    templateUrl: string,
    maxZoom: number,
    sw: { latitude: number; longitude: number },
    ne: { latitude: number; longitude: number },
    outputSize: number = 256,
): Promise<string> {
    const provider = { name: 'Custom', url: templateUrl, maxZoom, attribution: '' };

    const cacheKey = [
        'custom',
        templateUrl.substring(0, 60),
        sw.latitude.toFixed(5),
        sw.longitude.toFixed(5),
        ne.latitude.toFixed(5),
        ne.longitude.toFixed(5),
        outputSize,
    ].join('|');

    if (_cache.has(cacheKey)) return _cache.get(cacheKey)!;

    try {
        const result = await _stitchFromProvider(provider, sw, ne, outputSize);
        if (result) {
            _cacheResult(cacheKey, result);
            return result;
        }
    } catch (err) {
        console.warn(`[TileStitcher] Custom provider failed:`, (err as any)?.message);
    }

    return '';
}

// ----------------------------------------------------------------
// TILE MATH
// ----------------------------------------------------------------

/**
 * Convert latitude to Web Mercator tile Y coordinate.
 * @param lat - Latitude in degrees
 * @param zoom - Zoom level
 * @returns Tile Y index
 */
function _latToTileY(lat: number, zoom: number): number {
    const latRad = (lat * Math.PI) / 180;
    const n = Math.pow(2, zoom);
    return Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
}

/**
 * Convert longitude to Web Mercator tile X coordinate.
 * @param lon - Longitude in degrees
 * @param zoom - Zoom level
 * @returns Tile X index
 */
function _lonToTileX(lon: number, zoom: number): number {
    const n = Math.pow(2, zoom);
    return Math.floor(((lon + 180) / 360) * n);
}

/**
 * Convert tile Y to latitude (north edge of tile).
 * @param y - Tile Y index
 * @param zoom - Zoom level
 * @returns Latitude in degrees
 */
function _tileYToLat(y: number, zoom: number): number {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Convert tile X to longitude (west edge of tile).
 * @param x - Tile X index
 * @param zoom - Zoom level
 * @returns Longitude in degrees
 */
function _tileXToLon(x: number, zoom: number): number {
    return (x / Math.pow(2, zoom)) * 360 - 180;
}

/**
 * Calculate optimal zoom level for a bounding box.
 * Sentinel-2 nativo = 10m/pixel → zoom 14 é o limite útil.
 *
 * @param lonExtent - Longitude extent in degrees
 * @param maxZoom - Provider max zoom
 * @returns Zoom level
 */
function _calculateZoom(lonExtent: number, maxZoom: number): number {
    if (lonExtent <= 0) return maxZoom;
    const zoom = Math.floor(Math.log2(360 / lonExtent)) + 1;
    return Math.max(1, Math.min(maxZoom, zoom));
}

// ----------------------------------------------------------------
// TILE FETCHING
// ----------------------------------------------------------------

/**
 * Fetch a single tile image with timeout.
 * Busca uma tile com timeout via AbortController.
 *
 * @param url - Tile URL
 */
async function _fetchTile(url: string): Promise<HTMLImageElement> {
    // Para providers com API key (ex: Stadia), faz pre-flight fetch para detectar 401
    // antes de tentar carregar via <img>, evitando erro silencioso de chave inválida.
    if (url.includes('api_key=') || url.includes('access_token=')) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
        try {
            const res = await fetch(url, { signal: ctrl.signal });
            clearTimeout(t);
            if (res.status === 401) throw new Error('API key inválida ou domínio não registrado (401)');
            if (res.status === 403) throw new Error('Acesso negado — verifique a chave API (403)');
            if (!res.ok) throw new Error(`HTTP ${res.status} fetching tile`);
        } catch (err) {
            clearTimeout(t);
            throw err;
        }
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        const timer = setTimeout(() => {
            img.src = '';
            reject(new Error(`Timeout fetching tile: ${url}`));
        }, FETCH_TIMEOUT_MS);

        img.onload = () => {
            clearTimeout(timer);
            resolve(img);
        };
        img.onerror = () => {
            clearTimeout(timer);
            reject(new Error(`Failed to load tile: ${url}`));
        };
        img.src = url;
    });
}

/**
 * Build tile URL from template.
 * @param template - URL template with {z}/{x}/{y}
 * @param z - Zoom
 * @param x - Tile X
 * @param y - Tile Y
 */
function _buildTileUrl(template: string, z: number, x: number, y: number): string {
    return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

// ----------------------------------------------------------------
// STITCHING
// ----------------------------------------------------------------

/**
 * Attempt to stitch tiles from a single provider.
 * Tenta compor tiles de um único provedor.
 *
 * @param provider - Provider config
 * @param sw
 * @param ne
 * @param outputSize
 * @returns Data URL or null on failure
 */
async function _stitchFromProvider(
    provider: { url: string; maxZoom?: number; [k: string]: any },
    sw: { latitude: number; longitude: number },
    ne: { latitude: number; longitude: number },
    outputSize: number,
): Promise<string | null> {
    const lonExtent = Math.abs(ne.longitude - sw.longitude);
    const zoom = _calculateZoom(lonExtent, provider.maxZoom ?? 18);

    // Tiles que cobrem o bbox
    const minTileX = _lonToTileX(sw.longitude, zoom);
    const maxTileX = _lonToTileX(ne.longitude, zoom);
    const minTileY = _latToTileY(ne.latitude, zoom); // norte = Y menor
    const maxTileY = _latToTileY(sw.latitude, zoom); // sul = Y maior

    const tilesWide = maxTileX - minTileX + 1;
    const tilesHigh = maxTileY - minTileY + 1;

    // Segurança: limitar a 8x8 tiles max (evitar download massivo)
    if (tilesWide > 8 || tilesHigh > 8) {
        console.warn(`[TileStitcher] Too many tiles (${tilesWide}x${tilesHigh}), reducing zoom`);
        return _stitchFromProvider({ ...provider, maxZoom: Math.max(1, zoom - 1) }, sw, ne, outputSize);
    }

    // Fetch todas as tiles em paralelo
    const tilePromises: Array<Promise<{ tx: number; ty: number; img: HTMLImageElement | null }>> = [];
    for (let ty = minTileY; ty <= maxTileY; ty++) {
        for (let tx = minTileX; tx <= maxTileX; tx++) {
            const url = _buildTileUrl(provider.url, zoom, tx, ty);
            tilePromises.push(
                _fetchTile(url)
                    .then((img) => ({ tx, ty, img }))
                    .catch(() => ({ tx, ty, img: null })), // tile individual falha = skip
            );
        }
    }

    const tiles = await Promise.all(tilePromises);
    const loadedTiles = tiles.filter((t) => t.img !== null);

    if (loadedTiles.length === 0) return null; // nenhuma tile carregou

    // Canvas temporário para composição (tamanho total das tiles)
    const compCanvas = document.createElement('canvas');
    compCanvas.width = tilesWide * TILE_SIZE;
    compCanvas.height = tilesHigh * TILE_SIZE;
    const compCtx = compCanvas.getContext('2d');
    if (!compCtx) return null;

    // Desenha cada tile na posição correta
    for (const { tx, ty, img } of loadedTiles) {
        const dx = (tx - minTileX) * TILE_SIZE;
        const dy = (ty - minTileY) * TILE_SIZE;
        compCtx.drawImage(img!, dx, dy, TILE_SIZE, TILE_SIZE);
    }

    // Recortar ao bbox exato (sub-tile precision)
    // Calcula pixel offset do bbox dentro do canvas de tiles
    const totalLonMin = _tileXToLon(minTileX, zoom);
    const totalLonMax = _tileXToLon(maxTileX + 1, zoom);
    const totalLatMax = _tileYToLat(minTileY, zoom); // norte
    const totalLatMin = _tileYToLat(maxTileY + 1, zoom); // sul

    const totalWidth = compCanvas.width;
    const totalHeight = compCanvas.height;

    // Offset do bbox dentro do canvas (fração de pixel)
    const cropX = ((sw.longitude - totalLonMin) / (totalLonMax - totalLonMin)) * totalWidth;
    const cropY = ((totalLatMax - ne.latitude) / (totalLatMax - totalLatMin)) * totalHeight;
    const cropW = ((ne.longitude - sw.longitude) / (totalLonMax - totalLonMin)) * totalWidth;
    const cropH = ((ne.latitude - sw.latitude) / (totalLatMax - totalLatMin)) * totalHeight;

    // Canvas de saída no tamanho solicitado
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outputSize;
    outCanvas.height = outputSize;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return null;

    outCtx.drawImage(
        compCanvas,
        cropX,
        cropY,
        cropW,
        cropH, // source rect (crop do bbox)
        0,
        0,
        outputSize,
        outputSize, // dest rect (output quadrado)
    );

    return outCanvas.toDataURL('image/jpeg', 0.92);
}

// ----------------------------------------------------------------
// CACHE
// ----------------------------------------------------------------

/**
 * Add result to cache with LRU eviction.
 * @param key
 * @param value
 */
function _cacheResult(key: string, value: string): void {
    if (_cache.size >= MAX_CACHE_SIZE) {
        // Evict oldest entry
        const firstKey = _cache.keys().next().value;
        if (firstKey !== undefined) _cache.delete(firstKey);
    }
    _cache.set(key, value);
}
