// @ts-check
// Generated from src/app/js/utils/scene/compass.ts by TS-MIGRATION-001. Do not edit manually.
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
   COMPASS & GLOBE — HUD de georreferência no viewport 3D
   ================================================================

   Dois indicadores sobrepostos no canto superior direito do canvas:

   1. ROSA DOS VENTOS (compass): Canvas 2D que mostra N/S/E/W
      rotacionando conforme a câmera orbita a cena.

   2. MINI GLOBO (globe): Canvas 2D interativo com esfera ortográfica.
      - Drag para rotacionar (pointer events: mouse + touch)
      - Double-click re-centraliza no projeto com animação
      - Click abre menu de configuração (nível de detalhe + view mode)
      - Ponto vermelho mostra localização do projeto
      - Indicador na borda quando projeto está na face oculta

   INTEGRAÇÃO:
   - initCompass() e initGlobe() devem ser chamados após initScene()
   - Compass se atualiza no OrbitControls 'change' event
   - Globe se atualiza quando a origem UTM muda

   ================================================================ */
import { getCamera, getControls } from './setup.js';
import { hasOrigin, relativeToWGS84 } from '../../core/io/geo/coordinates.js';
import { getViewMode, setViewMode } from './controls.js';
import { t } from '../i18n/translations.js';
// Coastline data is loaded lazily from JSON (was 21,348 lines of inline JS).
// See ARCH-MONO-001 Phase 0 quick win + docs/LESSONS.md `data-as-json`.
// Empty arrays until loaded; compass renders without coastlines until then.
let COASTLINES_CONTINENTAL: any = [];
let BOUNDARIES_COUNTRIES: any = [];
let BOUNDARIES_STATES: any = [];
/** @type {Promise<void>|null} */
let _coastlineLoadPromise: any = null;
async function _fetchCoastlineDataJSON() {
    if (_coastlineLoadPromise) return _coastlineLoadPromise;
    _coastlineLoadPromise = (async () => {
        try {
            const resp = await fetch('/assets/data/coastlines.json');
            if (!resp.ok) throw new Error(`coastlines.json HTTP ${resp.status}`);
            const data = await resp.json();
            COASTLINES_CONTINENTAL = Array.isArray(data?.coastlines) ? data.coastlines : [];
            BOUNDARIES_COUNTRIES = Array.isArray(data?.countries) ? data.countries : [];
            BOUNDARIES_STATES = Array.isArray(data?.states) ? data.states : [];
            // Re-bind currentCoastlines/Boundaries/States to the freshly loaded
            // arrays - _loadCoastlineData(level) below uses the captured COASTLINES_*
            // references which are now populated. Without this rebind, callers
            // that ran BEFORE the fetch resolved hold empty references.
            _loadCoastlineData(globeDetailLevel);
            // Trigger redraw if compass already initialized
            if (compassCtx) updateCompass();
        } catch (err: any) {
            console.warn('[compass] Failed to load coastlines.json:', err instanceof Error ? err.message : err);
            // Graceful degradation: arrays stay empty, compass renders without coastlines
        }
    })();
    return _coastlineLoadPromise;
}
// ----------------------------------------------------------------
// COMPASS ROSE - Rosa dos Ventos
// ----------------------------------------------------------------
let compassCanvas: any = null;
let compassCtx: any = null;
/**
 * Inicializa a rosa dos ventos no canvas #compass-canvas.
 * Conecta ao OrbitControls para atualizar a cada mudança de câmera.
 */
export function initCompass() {
    compassCanvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('compass-canvas'));
    if (!compassCanvas) return;
    compassCtx = compassCanvas.getContext('2d');
    // Desenho inicial
    drawCompass(0);
    // Atualiza quando câmera muda
    const controls = getControls();
    if (controls) {
        controls.addEventListener('change', updateCompass);
    }
    // Click na bússola abre o map picker
    compassCanvas.style.cursor = 'pointer';
    compassCanvas.addEventListener('click', _onCompassClick);
}
/**
 * Handler de click na bússola - abre o map picker para seleção de localização.
 * Atualiza a imagem aérea do boundary se existir.
 */
async function _onCompassClick() {
    try {
        const { openMapPickerModal } = await import('../../utils/ui/mapPicker.js' as string);
        const result = await openMapPickerModal();
        if (!result) return;
        const { wgs84ToUTM, setOrigin } = await import('../../core/io/geo/coordinates.js' as string);
        const utm = wgs84ToUTM({ latitude: result.latitude, longitude: result.longitude });
        // setOrigin dispara 'originChanged' → main.js._refreshGeoLayers()
        // que re-fetcha terrain (AWS tiles) e recarrega overlay aéreo do boundary
        setOrigin({
            easting: utm.easting,
            northing: utm.northing,
            elevation: 0,
            zone: utm.zone,
            hemisphere: utm.hemisphere,
        });
        // Atualiza campos de origem na UI (aba Project)
        const fields = {
            'utm-origin-easting': utm.easting.toFixed(2),
            'utm-origin-northing': utm.northing.toFixed(2),
            'utm-zone': String(utm.zone),
            'utm-hemisphere': utm.hemisphere,
            'origin-latitude': result.latitude.toFixed(6),
            'origin-longitude': result.longitude.toFixed(6),
        };
        for (const [id, val] of Object.entries(fields)) {
            const el = (document.getElementById(id)) as HTMLInputElement|null;
            if (el) el.value = val;
        }
    } catch (err: any) {
        console.error('[Compass] Failed to open map picker:', err);
    }
}
/**
 * Recalcula o heading da câmera e redesenha a rosa dos ventos.
 */
function updateCompass() {
    const camera = getCamera();
    const controls = getControls();
    if (!camera || !controls || !compassCtx) return;
    const dx = camera.position.x - controls.target.x;
    const dz = camera.position.z - controls.target.z;
    const heading = Math.atan2(dx, dz);
    drawCompass(heading);
}
/**
 * Desenha a rosa dos ventos no canvas.
 *
 * @param {number} heading - Ângulo em radianos (0 = câmera ao sul)
 */
function drawCompass( heading: any) {
    if (!compassCtx || !compassCanvas) return;
    const ctx = compassCtx;
    const size = compassCanvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 8;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-heading);
    // Círculo externo
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Setas
    drawArrow(ctx, 0, -r + 4, 0, -6, '#ff4444', 2.5);
    drawArrow(ctx, 0, r - 4, 0, 6, 'rgba(255,255,255,0.3)', 1.5);
    drawArrow(ctx, r - 4, 0, 6, 0, 'rgba(255,255,255,0.3)', 1.5);
    drawArrow(ctx, -(r - 4), 0, -6, 0, 'rgba(255,255,255,0.3)', 1.5);
    // Letras (escala com tamanho do canvas)
    const fontSize = Math.max(8, Math.round(size * 0.14));
    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff4444';
    ctx.fillText('N', 0, -r + 14);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('S', 0, r - 14);
    ctx.fillText('E', r - 14, 0);
    ctx.fillText('W', -(r - 14), 0);
    // Ponto central
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();
    ctx.restore();
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x1
 * @param {number} y1
 * @param {number} dx
 * @param {number} dy
 * @param {string} color
 * @param {number} width
 */
function drawArrow( ctx: any, x1: any, y1: any, dx: any, dy: any, color: any, width: any) {
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
}
// ----------------------------------------------------------------
// MINI GLOBE - Globo terrestre interativo
// ----------------------------------------------------------------
let globeCanvas: any = null;
let globeCtx: any = null;
/** Tamanho lógico do canvas CSS (px) — atualizável via setGlobeCSSSize() */
let GLOBE_CSS_SIZE = 100;
// Nível de detalhe
let globeDetailLevel: any = 'continental'; // 'off' | 'continental' | 'countries' | 'states'
// Coastline arrays are bound lazily after _fetchCoastlineDataJSON() resolves.
// They start empty and are reassigned by detail-level switches below.
let currentCoastlines: any = COASTLINES_CONTINENTAL;
let currentBoundaries: any = [];
let currentStates: any = [];
// Kick off coastline data load on module init (non-blocking).
// Compass will render without coastlines until data arrives, then auto-redraw.
_fetchCoastlineDataJSON();
let globeContextMenuEl: any = null;
// Viewpoint do globo (pode ser alterado via drag)
let viewLat = 0; // Latitude central da vista (graus)
let viewLon = 0; // Longitude central da vista (graus)
// Latitude/longitude real do projeto
let projectLat = 0;
let projectLon = 0;
// Drag state
let _isDragging = false;
let _dragStartX = 0;
let _dragStartY = 0;
let _dragStartLat = 0;
let _dragStartLon = 0;
let _dragMoved = false;
const DRAG_THRESHOLD = 4; // px
// Zoom state
let zoomLevel = 1.0;
const ZOOM_MIN = 1.0;
const ZOOM_MAX = 15.0;
// eslint-disable-next-line
const ZOOM_STEP = 0.2;
// Bounding-box cache for frustum culling
/** @type {WeakMap<object, {minLat:number,maxLat:number,minLon:number,maxLon:number}>} */
const _bboxCache = new WeakMap();
// Animação de re-centralização
/** @type {number|null} */
let _animFrame: any = null;
let _drawScheduled = false;
/**
 * Inicializa o mini globo no canvas #globe-canvas.
 */
export function initGlobe() {
    globeCanvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('globe-canvas'));
    if (!globeCanvas) return;
    // HiDPI: escala o canvas pelo devicePixelRatio
    _setupHiDPI();
    globeCtx = globeCanvas.getContext('2d');
    // Restaurar nível salvo
    const saved = localStorage.getItem('ecbyts-globe-detail') || '';
    if (saved && ['off', 'continental', 'countries', 'states'].includes(saved)) {
        globeDetailLevel = /** @type {'off'|'continental'|'countries'|'states'} */ (saved);
        _loadCoastlineData(globeDetailLevel);
    }
    _updateProjectLatLon();
    _centerOnProject();
    drawGlobe();
    _initGlobeInteraction();
    _initGlobeContextMenu();
}
/**
 * Redesenha o globo e re-centraliza no projeto (chamar quando origem UTM mudar).
 */
export function updateGlobe() {
    if (!globeCtx) return;
    _updateProjectLatLon();
    _animateCenterOnProject();
}
/**
 * Altera o nível de detalhe do globo.
 * @param {'off'|'continental'|'countries'|'states'} level
 */
export function setGlobeDetailLevel( level: any) {
    if (!['off', 'continental', 'countries', 'states'].includes(level)) return;
    globeDetailLevel = level;
    _loadCoastlineData(level);
    _scheduleDraw();
    try {
        localStorage.setItem('ecbyts-globe-detail', level);
    } catch (e: any) {
        console.debug('[scene/compass] saveDetail:', e instanceof Error ? e.message : e);
        /* quota */
    }
}
/**
 * Retorna o nível de detalhe atual do globo.
 * @returns {'off'|'continental'|'countries'|'states'}
 */
export function getGlobeDetailLevel() {
    return globeDetailLevel;
}
/**
 * Redesenha a rosa dos ventos (wrapper público).
 */
export function redrawCompass() {
    if (!compassCtx || !compassCanvas) return;
    updateCompass();
}
/**
 * Redesenha o mini globo (wrapper público).
 */
export function redrawGlobe() {
    if (!globeCtx) return;
    drawGlobe();
}
/**
 * Atualiza o tamanho CSS do globo e re-executa HiDPI + draw.
 * @param {number} px - Novo tamanho em pixels CSS
 */
export function setGlobeCSSSize( px: any) {
    GLOBE_CSS_SIZE = px;
    if (!globeCanvas) return;
    _setupHiDPI();
    globeCtx = globeCanvas.getContext('2d');
    drawGlobe();
}
// ----------------------------------------------------------------
// HiDPI SETUP
// ----------------------------------------------------------------
function _setupHiDPI() {
    if (!globeCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    globeCanvas.width = GLOBE_CSS_SIZE * dpr;
    globeCanvas.height = GLOBE_CSS_SIZE * dpr;
    globeCanvas.style.width = GLOBE_CSS_SIZE + 'px';
    globeCanvas.style.height = GLOBE_CSS_SIZE + 'px';
}
// ----------------------------------------------------------------
// COASTLINE DATA LOADING
// ----------------------------------------------------------------
/** @param {'off'|'continental'|'countries'|'states'} level */
function _loadCoastlineData( level: any) {
    switch (level) {
        case 'off':
            currentCoastlines = [];
            currentBoundaries = [];
            currentStates = [];
            break;
        case 'continental':
            currentCoastlines = COASTLINES_CONTINENTAL;
            currentBoundaries = [];
            currentStates = [];
            break;
        case 'countries':
            currentCoastlines = COASTLINES_CONTINENTAL;
            currentBoundaries = BOUNDARIES_COUNTRIES;
            currentStates = [];
            break;
        case 'states':
            currentCoastlines = COASTLINES_CONTINENTAL;
            currentBoundaries = BOUNDARIES_COUNTRIES;
            currentStates = BOUNDARIES_STATES;
            break;
    }
}
// ----------------------------------------------------------------
// PROJECT LOCATION
// ----------------------------------------------------------------
function _updateProjectLatLon() {
    if (hasOrigin()) {
        const wgs = relativeToWGS84({ x: 0, y: 0, z: 0 });
        projectLat = wgs.latitude;
        projectLon = wgs.longitude;
    } else {
        projectLat = 0;
        projectLon = 0;
    }
}
function _centerOnProject() {
    viewLat = projectLat;
    viewLon = projectLon;
}
// ----------------------------------------------------------------
// ANIMATION - Re-centralização suave
// ----------------------------------------------------------------
function _animateCenterOnProject() {
    if (_animFrame) cancelAnimationFrame(_animFrame);
    const targetLat = projectLat;
    const targetLon = projectLon;
    const startLat = viewLat;
    const startLon = viewLon;
    const duration = 300; // ms
    const t0 = performance.now();
    /** @param {number} now */
    function step( now: any) {
        const elapsed = now - t0;
        const t = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const ease = 1 - Math.pow(1 - t, 3);
        viewLat = startLat + (targetLat - startLat) * ease;
        viewLon = startLon + (targetLon - startLon) * ease;
        drawGlobe();
        if (t < 1) {
            _animFrame = requestAnimationFrame(step);
        } else {
            _animFrame = null;
        }
    }
    _animFrame = requestAnimationFrame(step);
}
// ----------------------------------------------------------------
// DRAW SCHEDULING (RAF throttle)
// ----------------------------------------------------------------
function _scheduleDraw() {
    if (_drawScheduled) return;
    _drawScheduled = true;
    requestAnimationFrame(() => {
        _drawScheduled = false;
        drawGlobe();
    });
}
// ----------------------------------------------------------------
// GLOBE DRAWING
// ----------------------------------------------------------------
/**
 * Desenha o globo terrestre com projeção ortográfica.
 * Centro da vista em (viewLat, viewLon). Ponto do projeto projetado na posição real.
 */
function drawGlobe() {
    if (!globeCtx || !globeCanvas) return;
    const ctx = globeCtx;
    const dpr = window.devicePixelRatio || 1;
    const size = GLOBE_CSS_SIZE * dpr;
    const cx = size / 2;
    const cy = size / 2;
    const baseR = size / 2 - 6 * dpr;
    const R = baseR * zoomLevel; // Zoom multiplies the sphere radius
    const centerLatRad = (viewLat * Math.PI) / 180;
    const centerLonRad = (viewLon * Math.PI) / 180;
    ctx.clearRect(0, 0, size, size);
    // ---- Clipping circle (viewport boundary) ----
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
    ctx.clip();
    // ---- Oceano (fundo) ----
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12, 35, 68, 0.75)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(80, 140, 200, 0.25)';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();
    // ---- Meridianos ----
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5 * dpr;
    for (let m = -180; m < 180; m += 30) {
        const mRad = (m * Math.PI) / 180 - centerLonRad;
        if (Math.cos(mRad) < -0.1) continue;
        _drawMeridian(ctx, cx, cy, R, mRad, centerLatRad);
    }
    // ---- Paralelos ----
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let p = -60; p <= 60; p += 30) {
        const pRad = (p * Math.PI) / 180 - centerLatRad;
        _drawParallel(ctx, cx, cy, R, pRad, centerLonRad);
    }
    // ---- Equador (destaque sutil) ----
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.8 * dpr;
    _drawParallel(ctx, cx, cy, R, -centerLatRad, centerLonRad);
    // ---- Adaptive styles based on zoom level ----
    const zs = Math.sqrt(zoomLevel); // sqrt for sub-linear scaling
    // ---- Contornos continentais (costas) ----
    if (currentCoastlines.length > 0) {
        const coastAlpha = Math.min(0.85, 0.5 + zoomLevel * 0.03);
        _drawPolylines(ctx, cx, cy, R, centerLatRad, centerLonRad, currentCoastlines, {
            color: `rgba(160, 210, 170, ${coastAlpha})`,
            width: Math.min(2.5, 0.8 + zs * 0.3) * dpr,
            dash: null,
        });
    }
    // ---- Fronteiras de países ----
    if (currentBoundaries.length > 0) {
        // Fade out countries when zoomed in past state level
        const countryAlpha = zoomLevel > 6 ? Math.max(0.1, 0.4 - (zoomLevel - 6) * 0.03) : 0.35;
        _drawPolylines(ctx, cx, cy, R, centerLatRad, centerLonRad, currentBoundaries, {
            color: `rgba(180, 180, 180, ${countryAlpha})`,
            width: Math.min(1.5, 0.4 + zs * 0.15) * dpr,
            dash: [2 * dpr, 2 * dpr],
        });
    }
    // ---- Fronteiras de estados/províncias ----
    if (currentStates.length > 0) {
        // Fade in states as zoom increases
        const stateAlpha = zoomLevel < 2 ? 0.15 : Math.min(0.6, 0.15 + (zoomLevel - 2) * 0.05);
        _drawPolylines(ctx, cx, cy, R, centerLatRad, centerLonRad, currentStates, {
            color: `rgba(200, 180, 100, ${stateAlpha})`,
            width: Math.min(1.5, 0.3 + zs * 0.15) * dpr,
            dash: [1.5 * dpr, 1.5 * dpr],
        });
    }
    // ---- Ponto do projeto ----
    _drawProjectPoint(ctx, cx, cy, R, centerLatRad, centerLonRad, dpr);
    // ---- Scale bar (inside clip so it's clipped to globe) ----
    // Visible diameter in km: corrected for latitude (1°lon = 111km × cos(lat))
    const cosLat = Math.cos((viewLat * Math.PI) / 180);
    const visibleKm = (180 / zoomLevel) * 111 * cosLat;
    const barWidthKm: any = _niceScaleStep(visibleKm / 3);
    const barPx = (barWidthKm / visibleKm) * (baseR * 2);
    const barX = cx - baseR + 6 * dpr;
    const barY = cy + baseR - 10 * dpr;
    // Bar line
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.lineTo(barX + barPx, barY);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
    // Ticks
    ctx.beginPath();
    ctx.moveTo(barX, barY - 2.5 * dpr);
    ctx.lineTo(barX, barY + 2.5 * dpr);
    ctx.moveTo(barX + barPx, barY - 2.5 * dpr);
    ctx.lineTo(barX + barPx, barY + 2.5 * dpr);
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();
    // Label
    ctx.font = `${6.5 * dpr}px JetBrains Mono, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(_formatKm(barWidthKm), barX + barPx / 2, barY - 3 * dpr);
    // ---- Restore clipping ----
    ctx.restore();
    // ---- Globe border (always crisp, outside clip) ----
    ctx.beginPath();
    ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(80, 140, 200, 0.25)';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();
    // ---- Label de coordenadas (outside clip, below globe) ----
    ctx.font = `${8 * dpr}px JetBrains Mono, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const latStr = Math.abs(projectLat).toFixed(1) + '°' + (projectLat >= 0 ? 'N' : 'S');
    const lonStr = Math.abs(projectLon).toFixed(1) + '°' + (projectLon >= 0 ? 'E' : 'W');
    ctx.fillText(`${latStr} ${lonStr}`, cx, size - 12 * dpr);
}
// ----------------------------------------------------------------
// SCALE HELPERS
// ----------------------------------------------------------------
/**
 * Formata a escala visível como texto legível.
 * @param {number} km - Diâmetro visível em km
 * @returns {string}
 */
function _formatScale( km: any) {
    if (km >= 10000) return `~${Math.round(km / 1000)}k km`;
    if (km >= 1000) return `~${(km / 1000).toFixed(1)}k km`;
    if (km >= 100) return `~${Math.round(km)} km`;
    if (km >= 10) return `~${Math.round(km)} km`;
    return `~${km.toFixed(1)} km`;
}
/**
 * Formata km para label da barra de escala.
 * @param {number} km
 * @returns {string}
 */
function _formatKm( km: any) {
    if (km >= 1000) return `${Math.round(km / 1000)}k km`;
    if (km >= 1) return `${Math.round(km)} km`;
    return `${Math.round(km * 1000)} m`;
}
/**
 * Arredonda para um valor "bonito" para barra de escala.
 * Ex: 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000
 * @param {number} km
 * @returns {number}
 */
function _niceScaleStep( km: any) {
    const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    for (const n of nice) {
        if (n >= km * 0.5) return n;
    }
    return nice[nice.length - 1];
}
// ----------------------------------------------------------------
// PROJECTION HELPERS
// ----------------------------------------------------------------
/**
 * Projeta lat/lon para coordenadas de canvas (projeção ortográfica).
 * Retorna null se o ponto está na face oculta.
 *
 * @returns {{ x: number, y: number, depth: number }|null}
 */
/**
 * @param {number} lat
 * @param {number} lon
 * @param {number} cx
 * @param {number} cy
 * @param {number} R
 * @param {number} centerLatRad
 * @param {number} centerLonRad
 * @returns {{ x: number, y: number, depth: number }|null}
 */
function _project( lat: any, lon: any, cx: any, cy: any, R: any, centerLatRad: any, centerLonRad: any) {
    const latR = (lat * Math.PI) / 180 - centerLatRad;
    const lonR = (lon * Math.PI) / 180 - centerLonRad;
    const cosLat = Math.cos(latR);
    const depth = Math.cos(lonR) * cosLat;
    const x = cx + R * Math.sin(lonR) * cosLat;
    const y = cy - R * Math.sin(latR);
    return { x, y, depth };
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} R
 * @param {number} mRad
 * @param {number} centerLatRad
 */
function _drawMeridian( ctx: any, cx: any, cy: any, R: any, mRad: any, centerLatRad: any) {
    ctx.beginPath();
    let first = true;
    for (let lat = -90; lat <= 90; lat += 5) {
        const latR = (lat * Math.PI) / 180 - centerLatRad;
        const depth = Math.cos(mRad) * Math.cos(latR);
        if (depth < 0) {
            first = true;
            continue;
        }
        const x = cx + R * Math.sin(mRad) * Math.cos(latR);
        const y = cy - R * Math.sin(latR);
        if (first) {
            ctx.moveTo(x, y);
            first = false;
        } else ctx.lineTo(x, y);
    }
    ctx.stroke();
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} R
 * @param {number} pRad
 * @param {number} centerLonRad
 */
function _drawParallel( ctx: any, cx: any, cy: any, R: any, pRad: any, centerLonRad: any) {
    ctx.beginPath();
    let first = true;
    for (let lon = -180; lon <= 180; lon += 5) {
        const lonR = (lon * Math.PI) / 180 - centerLonRad;
        const cosP = Math.cos(pRad);
        const depth = Math.cos(lonR) * cosP;
        if (depth < 0) {
            first = true;
            continue;
        }
        const x = cx + R * Math.sin(lonR) * cosP;
        const y = cy - R * Math.sin(pRad);
        if (first) {
            ctx.moveTo(x, y);
            first = false;
        } else ctx.lineTo(x, y);
    }
    ctx.stroke();
}
// ----------------------------------------------------------------
// POLYLINE RENDERING (coastlines + boundaries)
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// FRUSTUM CULLING - Bounding box per polyline
// ----------------------------------------------------------------
/**
 * Computa e cacheia bounding box [minLat, maxLat, minLon, maxLon] de uma polyline.
 */
/** @param {Array<[number, number]>} polyline */
function _getBBox( polyline: any) {
    let cached = _bboxCache.get(polyline);
    if (cached) return cached;
    let minLat = 90,
        maxLat = -90,
        minLon = 180,
        maxLon = -180;
    for (const [lat, lon] of polyline) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
    }
    cached = { minLat, maxLat, minLon, maxLon };
    _bboxCache.set(polyline, cached);
    return cached;
}
/**
 * Verifica se uma polyline pode estar visível na vista atual.
 * Usa angular distance para checar se o bounding box intersecta o hemisfério visível.
 * halfFOV = arco visível do centro ao bordo em graus (90° no zoom 1×, diminui com zoom).
 */
/**
 * @param {{minLat:number,maxLat:number,minLon:number,maxLon:number}} bbox
 * @param {number} bbox
 * @param {number} viewLatDeg
 * @param {number} viewLonDeg
 */
function _isPolylineVisible( bbox: any, viewLatDeg: any, viewLonDeg: any, halfFOV: any) {
    const { minLat, maxLat, minLon, maxLon } = bbox;
    // Check latitude overlap
    if (maxLat < viewLatDeg - halfFOV || minLat > viewLatDeg + halfFOV) return false;
    // Check longitude overlap (handle wrap-around)
    let dLon = minLon - viewLonDeg;
    // Normalize to [-180, 180]
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    let dLon2 = maxLon - viewLonDeg;
    if (dLon2 > 180) dLon2 -= 360;
    if (dLon2 < -180) dLon2 += 360;
    const lonMin = Math.min(dLon, dLon2);
    const lonMax = Math.max(dLon, dLon2);
    if (lonMin > halfFOV || lonMax < -halfFOV) return false;
    return true;
}
/**
 * Desenha polylines com frustum culling e estilo configurável.
 */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} R
 * @param {number} centerLatRad
 * @param {number} centerLonRad
 * @param {Array<Array<[number, number]>>} polylines
 * @param {{color:string,width:number,dash:number[]|null}} style
 */
function _drawPolylines( ctx: any, cx: any, cy: any, R: any, centerLatRad: any, centerLonRad: any, polylines: any, style: any) {
    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (style.dash) ctx.setLineDash(style.dash);
    else ctx.setLineDash([]);
    // Visible half-FOV in degrees (shrinks with zoom)
    const halfFOV = 90 / zoomLevel + 5; // +5° margin for polylines crossing the edge
    for (const polyline of polylines) {
        // Frustum cull: skip polylines entirely outside visible hemisphere
        const bbox = _getBBox(polyline);
        if (!_isPolylineVisible(bbox, viewLat, viewLon, halfFOV)) continue;
        ctx.beginPath();
        let first = true;
        for (const [lat, lon] of polyline) {
            const p = _project(lat, lon, cx, cy, R, centerLatRad, centerLonRad);
            if (!p || p.depth < 0) {
                first = true;
                continue;
            }
            if (first) {
                ctx.moveTo(p.x, p.y);
                first = false;
            } else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
}
// ----------------------------------------------------------------
// PROJECT POINT
// ----------------------------------------------------------------
/**
 * Desenha o ponto do projeto na posição projetada.
 * Se na face oculta, desenha indicador na borda do globo.
 */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} R
 * @param {number} centerLatRad
 * @param {number} centerLonRad
 * @param {number} dpr
 */
function _drawProjectPoint( ctx: any, cx: any, cy: any, R: any, centerLatRad: any, centerLonRad: any, dpr: any) {
    const p = _project(projectLat, projectLon, cx, cy, R, centerLatRad, centerLonRad);
    if (!p) return;
    if (p.depth >= 0) {
        // ---- Ponto visível: glow + ponto sólido ----
        // Glow externo
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 8 * dpr);
        gradient.addColorStop(0, 'rgba(255, 68, 68, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 68, 68, 0)');
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        // Ponto sólido
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = '#ff4444';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,100,100,0.6)';
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
    } else {
        // ---- Ponto na face oculta: indicador na borda ----
        // Calcula direção do projeto relativo ao centro
        const latR = (projectLat * Math.PI) / 180 - centerLatRad;
        const lonR = (projectLon * Math.PI) / 180 - centerLonRad;
        const dx = Math.sin(lonR) * Math.cos(latR);
        const dy = -Math.sin(latR);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        // Ponto na borda do globo
        const bx = cx + nx * (R - 2 * dpr);
        const by = cy + ny * (R - 2 * dpr);
        // Triângulo indicador (seta) apontando para fora
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(Math.atan2(ny, nx));
        ctx.beginPath();
        ctx.moveTo(4 * dpr, 0);
        ctx.lineTo(-2 * dpr, -3 * dpr);
        ctx.lineTo(-2 * dpr, 3 * dpr);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 68, 68, 0.5)';
        ctx.fill();
        ctx.restore();
    }
}
// ----------------------------------------------------------------
// INTERACTION - Drag to rotate + click menu + double-click center
// ----------------------------------------------------------------
function _initGlobeInteraction() {
    if (!globeCanvas) return;
    globeCanvas.style.cursor = 'grab';
    // ---- Pointer events (unifica mouse + touch) ----
    globeCanvas.addEventListener('pointerdown', _onPointerDown);
    globeCanvas.addEventListener('pointermove', _onPointerMove);
    globeCanvas.addEventListener('pointerup', _onPointerUp);
    globeCanvas.addEventListener('pointerleave', _onPointerUp);
    // ---- Scroll wheel: zoom (Ctrl+scroll or just scroll on globe) ----
    globeCanvas.addEventListener('wheel', _onWheel, { passive: false });
    // ---- Double-click: re-centraliza no projeto + reset zoom ----
    globeCanvas.addEventListener('dblclick', (e: any) => {
        e.preventDefault();
        e.stopPropagation();
        zoomLevel = 1.0;
        _animateCenterOnProject();
    });
    // ---- Prevent context menu on right-click ----
    globeCanvas.addEventListener('contextmenu', (e: any) => e.preventDefault());
}
/**
 * Zoom via scroll wheel (exponencial para controle suave em todos os níveis).
 */
/** @param {WheelEvent} e */
function _onWheel( e: any) {
    e.preventDefault();
    e.stopPropagation();
    // Exponential zoom: multiply/divide by factor (feels linear at all levels)
    const factor = e.deltaY > 0 ? 0.88 : 1.14;
    zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomLevel * factor));
    _scheduleDraw();
}
/** @param {PointerEvent} e */
function _onPointerDown( e: any) {
    if (e.button === 2) return; // Ignora right-click
    _isDragging = true;
    _dragMoved = false;
    _dragStartX = e.clientX;
    _dragStartY = e.clientY;
    _dragStartLat = viewLat;
    _dragStartLon = viewLon;
    if (!globeCanvas) return;
    globeCanvas.style.cursor = 'grabbing';
    globeCanvas.setPointerCapture(e.pointerId);
    // Cancela animação em andamento
    if (_animFrame) {
        cancelAnimationFrame(_animFrame);
        _animFrame = null;
    }
}
/** @param {PointerEvent} e */
function _onPointerMove( e: any) {
    if (!_isDragging) return;
    const dx = e.clientX - _dragStartX;
    const dy = e.clientY - _dragStartY;
    // Threshold: não conta como drag se moveu menos de 4px
    if (!_dragMoved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    _dragMoved = true;
    // Sensibilidade ajustada pelo zoom: quando zoomed in, drag é mais preciso
    const sensitivity = 2.2 / zoomLevel;
    viewLon = _dragStartLon - dx * sensitivity;
    viewLat = _dragStartLat + dy * sensitivity;
    // Clamp latitude para evitar flip
    viewLat = Math.max(-85, Math.min(85, viewLat));
    // Normaliza longitude
    while (viewLon > 180) viewLon -= 360;
    while (viewLon < -180) viewLon += 360;
    _scheduleDraw();
}
/** @param {PointerEvent} e */
function _onPointerUp( e: any) {
    if (!_isDragging) return;
    _isDragging = false;
    if (!globeCanvas) return;
    globeCanvas.style.cursor = 'grab';
    // Se não moveu significativamente, trata como click → abre menu
    if (!_dragMoved) {
        _showGlobeContextMenu(e.clientX, e.clientY);
    }
}
// ----------------------------------------------------------------
// GLOBE CONTEXT MENU - Seleção de nível de detalhe + view mode
// ----------------------------------------------------------------
function _initGlobeContextMenu() {
    if (!globeCanvas) return;
    globeContextMenuEl = document.createElement('div');
    globeContextMenuEl.id = 'globe-context-menu';
    globeContextMenuEl.style.display = 'none';
    document.body.appendChild(globeContextMenuEl);
    // Fechar ao clicar fora
    document.addEventListener('mousedown', (e: any) => {
        if (!globeContextMenuEl || globeContextMenuEl.style.display === 'none') return;
        if (e.target instanceof Node && globeContextMenuEl.contains(e.target)) return;
        if (e.target === globeCanvas) return;
        globeContextMenuEl.style.display = 'none';
    });
}
/**
 * @param {number} x
 * @param {number} y
 */
function _showGlobeContextMenu( x: any, y: any) {
    if (!globeContextMenuEl) return;
    // Toggle: se já está aberto, fecha
    if (globeContextMenuEl.style.display === 'block') {
        globeContextMenuEl.style.display = 'none';
        return;
    }
    /** @type {Array<{key:'off'|'continental'|'countries'|'states',label:string,i18n:string}>} */
    const detailOptions = [
        { key: 'off', label: 'Grid Only', i18n: 'globeDetailOff' },
        { key: 'continental', label: 'Continental', i18n: 'globeDetailContinental' },
        { key: 'countries', label: 'Countries', i18n: 'globeDetailCountries' },
        { key: 'states', label: 'States', i18n: 'globeDetailStates' },
    ];
    const detailHTML = detailOptions
        .map((opt: any) => {
            const selected = globeDetailLevel === opt.key;
            const indicator = selected ? '&#9679;' : '&#9675;';
            const activeClass = selected ? ' globe-menu-item-active' : '';
            return `<div class="globe-menu-item${activeClass}" data-level="${opt.key}">
            <span class="globe-menu-radio">${indicator}</span>
            <span data-i18n="${opt.i18n}">${opt.label}</span>
        </div>`;
        })
        .join('');
    const viewMode = getViewMode();
    /** @type {Array<{key:string,label:string,i18n:string}>} */
    const viewOptions = [
        { key: '3d', label: '3D Isometric', i18n: 'viewMode3D' },
        { key: '2d', label: '2D Plan View', i18n: 'viewMode2D' },
        { key: '2d-depth', label: '2D + Depth', i18n: 'viewMode2DDepth' },
    ];
    const viewHTML = viewOptions
        .map((opt: any) => {
            const selected = viewMode === opt.key;
            const indicator = selected ? '&#9679;' : '&#9675;';
            const activeClass = selected ? ' globe-menu-item-active' : '';
            return `<div class="globe-menu-item${activeClass}" data-view-mode="${opt.key}">
            <span class="globe-menu-radio">${indicator}</span>
            <span data-i18n="${opt.i18n}">${opt.label}</span>
        </div>`;
        })
        .join('');
    const reportBugLabel = t('reportBug.menuItem') || 'Reportar Bug';
    const reportBugHTML = `<div class="globe-menu-separator"></div><div class="globe-menu-item" data-action="report-bug">${reportBugLabel}</div>`;
    globeContextMenuEl.innerHTML = detailHTML + '<div class="globe-menu-separator"></div>' + viewHTML + reportBugHTML;
    globeContextMenuEl.style.display = 'block';
    globeContextMenuEl.style.left = x + 'px';
    globeContextMenuEl.style.top = y + 'px';
    // Ajustar se sai da tela
    const rect = globeContextMenuEl.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        globeContextMenuEl.style.left = x - rect.width + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        globeContextMenuEl.style.top = y - rect.height + 'px';
    }
    // Handlers
    const menuEl = globeContextMenuEl;
    menuEl.querySelectorAll('[data-level]').forEach((item: any) => {
        const itemEl = (item) as HTMLElement;
        item.addEventListener(
            'click',
            () => {
                const level = (itemEl.dataset.level || 'continental') as 'off'|'continental'|'countries'|'states';
                setGlobeDetailLevel(level);
                menuEl.style.display = 'none';
            },
            { once: true },
        );
    });
    menuEl.querySelectorAll('[data-view-mode]').forEach((item: any) => {
        const itemEl = (item) as HTMLElement;
        item.addEventListener(
            'click',
            () => {
                setViewMode(itemEl.dataset.viewMode || '3d');
                menuEl.style.display = 'none';
            },
            { once: true },
        );
    });
    const reportBugItem = menuEl.querySelector('[data-action="report-bug"]');
    if (reportBugItem) {
        reportBugItem.addEventListener(
            'click',
            () => {
                window.handleReportBug?.();
                menuEl.style.display = 'none';
            },
            { once: true },
        );
    }
}
