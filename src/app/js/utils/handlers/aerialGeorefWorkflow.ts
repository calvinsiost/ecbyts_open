// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
import { readFileAsDataUrl } from '../../core/recognition/analyzer.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { hasApiKey, sendMessage } from '../../core/llm/client.js';
import { buildModalShell } from '../ui/modals.js';
import { hydrateIcons } from '../ui/icons.js';
import { buildTransform, pixelToWorld } from '../../core/ingestion/documents/mapGeoreferencer.js';
import { importCDN, loadScriptCDN } from '../helpers/cdnLoader.js';
import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { CONFIG } from '../../config.js';
import { createLogger } from '../helpers/logger.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
import { wgs84ToUTM, utmToWGS84, getOrigin, setOrigin, hasOrigin } from '../../core/io/geo/coordinates.js';
import { generateId } from '../helpers/id.js';
import { addElement } from '../../core/elements/manager.js';
import {
    AI_GEOREF_SYSTEM_PROMPT,
    AI_GEOREF_USER_PROMPT,
    buildBoundsFlyTo,
    landmarksToGcpRecords,
    parseAiGeorefResponse,
} from './aerialMethodControlsUi.js';
const log = createLogger('AerialGeoref');
type GeorefGcp = { id: number; imgX: number; imgY: number; lat: number | null; lon: number | null; label: string };
type CompleteGeorefGcp = GeorefGcp & { lat: number; lon: number };
/** @param {unknown} err @returns {string} */
function _errorMessage(err: any) {
    return err && typeof err === 'object' && 'message' in err
        ? String(/** @type {{ message?: unknown }} */ (err).message)
        : String(err);
}
/** @param {string} id @returns {any} */
function _el(id: string) {
    return document.getElementById(id);
}
/** @param {GeorefGcp} gcp @returns {gcp is CompleteGeorefGcp} */
function _hasGcpCoords(gcp: GeorefGcp): gcp is CompleteGeorefGcp {
    return gcp.lat !== null && gcp.lon !== null;
}
// ----------------------------------------------------------------
// GEOREFERENCE - Interactive GCP-based image registration
// ----------------------------------------------------------------
// Permite ao usuario colocar pontos de controle (GCPs) livremente
// na imagem aerea e depois associar cada ponto a coordenadas WGS84
// clicando no mapa. Usa transformada affine (mapGeoreferencer.js)
// para converter pixel → UTM → vertices do boundary 3D.
// ----------------------------------------------------------------
let requestUIRefresh: any = null;
let _georefImage: string | null = null; // Data URL of uploaded image
let _georefImageW = 0; // Natural width of uploaded image
let _georefImageH = 0; // Natural height of uploaded image
let _georefGCPs: GeorefGcp[] = []; // Array<{ id, imgX, imgY, lat, lon, label }>
let _georefActiveIdx = -1; // GCP index awaiting map click (-1 = none)
let _georefDragIdx = -1; // GCP index being dragged on image
let _georefMap: any = null; // MapLibre instance
let _georefMarkers: Record<number, any> = {}; // Map markers keyed by GCP id
let _georefSatVisible = false; // Satellite layer toggle state
let _georefNextId = 1; // Auto-increment for GCP IDs
let _georefCanvas: HTMLCanvasElement | null = null; // Reference to image canvas for redraws
let _georefSearchTimer: ReturnType<typeof setTimeout> | null = null; // Nominatim debounce timer
const MAPLIBRE_CSS_URL = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const MAPLIBRE_JS_URL = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js';
const TURF_CDN = 'https://esm.sh/@turf/turf@7.1.0';
const GEOREF_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const GEOREF_SAT_TILES =
    'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg';
const GEOREF_GCP_RADIUS = 10; // Pixel radius for GCP markers on canvas
const GEOREF_HIT_RADIUS = 18; // Click hit test radius
const GEOREF_INPUT_STYLE =
    'width:90px;padding:3px 6px;background:var(--bg-secondary,#222);border:1px solid var(--border-color,#444);border-radius:3px;color:var(--text-primary,#e0e0e0);font-size:11px;';
let _turf: any = null;
/**
 * Open the georeferencing modal (split-pane: image + map).
 * Construi modal de duas colunas com canvas de imagem a esquerda
 * e mapa interativo (MapLibre) a direita. GCPs interativos.
 */
export async function handleAerialGeoreference({ currentImage, requestUIRefresh: uiRefresh }: any) {
    requestUIRefresh = uiRefresh;
    // Reset state
    _georefGCPs = [];
    _georefActiveIdx = -1;
    _georefDragIdx = -1;
    _georefNextId = 1;
    _georefSatVisible = false;
    _georefImage = currentImage || null;
    _georefImageW = 0;
    _georefImageH = 0;
    _georefImageH = 0;
    const shell = /** @type {any} */ (
        buildModalShell({
            title: t('georeferenceTitle') || 'Georeference Aerial Image',
            width: '960px',
            twoPane: true,
            onClose: _cleanupGeoref,
        })
    );
    const { overlay, body, footer, close: closeModal_ } = shell;
    /** @type {(() => void)|null} */
    let _resizeCleanup: any = null; // Cleanup for responsive listener
    // ---- LEFT PANE: Image canvas + toolbar ----
    const leftPane = document.createElement('div');
    leftPane.className = 'georef-left-pane';
    leftPane.style.cssText =
        'width:50%;min-width:280px;display:flex;flex-direction:column;padding:12px;border-right:1px solid var(--border-color,#333);';
    // Toolbar: Upload + AI Suggest (Phase 3 placeholder)
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;align-items:center;flex-wrap:wrap;';
    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'btn btn-secondary';
    uploadBtn.innerHTML = `<span data-icon="upload" data-icon-size="14px"></span> ${escapeHtml(t('georefUploadImage') || 'Upload Image')}`;
    uploadBtn.style.cssText = 'font-size:12px;';
    uploadBtn.onclick = () => _georefUploadImage();
    toolbar.appendChild(uploadBtn);
    // AI Suggest Location button (Phase 3)
    const suggestBtn = document.createElement('button');
    suggestBtn.className = 'btn btn-secondary';
    suggestBtn.innerHTML = `<span data-icon="globe" data-icon-size="14px"></span> ${escapeHtml(t('georefSuggestLocation') || 'Suggest Location')}`;
    suggestBtn.style.cssText = 'font-size:12px;';
    suggestBtn.id = 'georef-suggest-btn';
    if (!hasApiKey()) {
        suggestBtn.disabled = true;
        suggestBtn.title = t('georefSuggestNoKey') || 'Configure AI key to use this feature';
    }
    suggestBtn.onclick = () => _aiSuggestGeoref(suggestBtn);
    toolbar.appendChild(suggestBtn);
    // Hint
    const hint = document.createElement('span');
    hint.style.cssText = 'font-size:10px;color:var(--text-secondary,#888);margin-left:auto;';
    hint.textContent = t('georefClickImageFirst') || 'Click image to place GCP';
    hint.id = 'georef-hint';
    toolbar.appendChild(hint);
    leftPane.appendChild(toolbar);
    const imageCanvas = document.createElement('canvas');
    imageCanvas.style.cssText = 'flex:1;width:100%;background:#111;border-radius:4px;cursor:crosshair;';
    imageCanvas.id = 'georef-image-canvas';
    _georefCanvas = imageCanvas;
    // Click: cria ou seleciona GCP
    imageCanvas.addEventListener('click', (e: any) => _onGeorefImageClick(e, imageCanvas));
    // Drag: mousedown-scoped pattern (per CLAUDE.md event listener rules)
    imageCanvas.addEventListener('mousedown', (e: any) => {
        const hit = _hitTestGCP(e, imageCanvas);
        if (hit < 0) return;
        _georefDragIdx = hit;
        imageCanvas.style.cursor = 'grabbing';
        /** @param {MouseEvent} canvas */
        const onMove = (me: any) => {
            const rect = imageCanvas.getBoundingClientRect();
            const scaleX = _georefImageW / imageCanvas.width;
            const scaleY = _georefImageH / imageCanvas.height;
            const gcp = _georefGCPs[_georefDragIdx];
            if (!gcp) return;
            gcp.imgX = Math.max(0, Math.min(_georefImageW, (me.clientX - rect.left) * scaleX));
            gcp.imgY = Math.max(0, Math.min(_georefImageH, (me.clientY - rect.top) * scaleY));
            _renderGeorefImageCanvas(imageCanvas);
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            _georefDragIdx = -1;
            imageCanvas.style.cursor = 'crosshair';
            _updateGeorefFooter();
            _updateGeorefPreview();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
    leftPane.appendChild(imageCanvas);
    // ---- RIGHT PANE: Map + search + satellite toggle ----
    const rightPane = document.createElement('div');
    rightPane.className = 'georef-right-pane';
    rightPane.style.cssText = 'width:50%;min-width:280px;display:flex;flex-direction:column;';
    // Map toolbar: search + satellite toggle
    const mapToolbar = document.createElement('div');
    mapToolbar.style.cssText =
        'display:flex;gap:6px;padding:6px 8px;align-items:center;border-bottom:1px solid var(--border-color,#333);';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = t('georefSearchPlace') || 'Search location...';
    searchInput.style.cssText =
        'flex:1;padding:4px 8px;background:var(--bg-secondary,#222);border:1px solid var(--border-color,#444);border-radius:3px;color:var(--text-primary,#e0e0e0);font-size:12px;';
    searchInput.addEventListener('keydown', (e: any) => {
        if (e.key === 'Enter') _georefSearchNominatim(searchInput.value);
    });
    // Debounce em 500ms para rate limiting do Nominatim
    searchInput.addEventListener('input', () => {
        if (_georefSearchTimer) clearTimeout(_georefSearchTimer);
        _georefSearchTimer = setTimeout(() => {
            if (searchInput.value.length >= 3) _georefSearchNominatim(searchInput.value);
        }, 500);
    });
    mapToolbar.appendChild(searchInput);
    const satBtn = document.createElement('button');
    satBtn.className = 'btn btn-secondary';
    satBtn.style.cssText = 'font-size:11px;padding:4px 8px;white-space:nowrap;';
    satBtn.innerHTML = '<span data-icon="satellite" data-icon-size="12px"></span>';
    satBtn.title = t('georefToggleSatellite') || 'Toggle satellite';
    satBtn.onclick = () => _georefToggleSatellite(satBtn);
    mapToolbar.appendChild(satBtn);
    // Preview toggle button â€” show/hide image overlay on map
    const previewBtn = document.createElement('button');
    previewBtn.className = 'georef-preview-toggle active';
    previewBtn.textContent = t('georefPreview') || 'Preview';
    previewBtn.title = t('georefTogglePreview') || 'Toggle image preview on map';
    previewBtn.id = 'georef-preview-toggle';
    let _previewVisible = true;
    previewBtn.onclick = () => {
        _previewVisible = !_previewVisible;
        previewBtn.classList.toggle('active', _previewVisible);
        if (_previewVisible) {
            _updateGeorefPreview();
        } else {
            _removeGeorefPreview();
        }
    };
    mapToolbar.appendChild(previewBtn);
    rightPane.appendChild(mapToolbar);
    const mapContainer = document.createElement('div');
    mapContainer.id = 'georef-map-container';
    mapContainer.style.cssText = 'flex:1;min-height:250px;';
    rightPane.appendChild(mapContainer);
    body.appendChild(leftPane);
    body.appendChild(rightPane);
    // ---- FOOTER: GCP list + metrics + meta + actions ----
    footer.style.cssText =
        'display:flex;flex-direction:column;gap:6px;padding:10px 16px;border-top:1px solid var(--border-color,#333);max-height:220px;overflow-y:auto;';
    footer.innerHTML = '';
    // GCP list container (dynamic)
    const gcpList = document.createElement('div');
    gcpList.id = 'georef-gcp-list';
    gcpList.style.cssText = 'font-size:11px;';
    footer.appendChild(gcpList);
    // Metrics row
    const metricsRow = document.createElement('div');
    metricsRow.id = 'georef-metrics';
    metricsRow.style.cssText =
        'font-size:11px;color:var(--text-secondary,#888);display:flex;gap:12px;align-items:center;flex-wrap:wrap;';
    metricsRow.innerHTML = `<span>${t('georefGCPCount') || 'GCPs'}: 0/3+</span>`;
    footer.appendChild(metricsRow);
    // Meta row: source, date, opacity, buttons
    const metaRow = document.createElement('div');
    metaRow.style.cssText = 'display:flex;gap:8px;align-items:center;font-size:11px;flex-wrap:wrap;';
    const sourceSelect = document.createElement('select');
    sourceSelect.id = 'georef-source';
    sourceSelect.style.cssText = GEOREF_INPUT_STYLE;
    for (const [val, lbl] of [
        ['drone', 'Drone'],
        ['ortho', 'Ortho'],
        ['scan', 'Scan'],
        ['satellite', 'Satellite'],
        ['other', t('other') || 'Other'],
    ]) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = lbl;
        sourceSelect.appendChild(opt);
    }
    metaRow.appendChild(sourceSelect);
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.id = 'georef-date';
    dateInput.style.cssText = GEOREF_INPUT_STYLE;
    dateInput.value = new Date().toISOString().slice(0, 10);
    metaRow.appendChild(dateInput);
    const opacityLabel = document.createElement('span');
    opacityLabel.textContent = t('georefOverlayOpacity') || 'Opacity:';
    metaRow.appendChild(opacityLabel);
    const savedOpacity = localStorage.getItem('ecbyts-georef-opacity') || '70';
    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.min = '10';
    opacitySlider.max = '100';
    opacitySlider.value = savedOpacity;
    opacitySlider.id = 'georef-opacity';
    opacitySlider.style.cssText = 'width:70px;';
    opacitySlider.oninput = () => {
        localStorage.setItem('ecbyts-georef-opacity', opacitySlider.value);
        _updateGeorefPreviewOpacity();
    };
    metaRow.appendChild(opacitySlider);
    // Spacer
    const spacer = document.createElement('span');
    spacer.style.cssText = 'flex:1;';
    metaRow.appendChild(spacer);
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = t('cancel') || 'Cancel';
    cancelBtn.onclick = () => {
        if (_resizeCleanup) _resizeCleanup();
        closeModal_();
    };
    metaRow.appendChild(cancelBtn);
    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn btn-primary';
    applyBtn.textContent = t('applyGeoreference') || 'Apply';
    applyBtn.id = 'georef-apply-btn';
    applyBtn.disabled = true;
    applyBtn.onclick = async () => {
        await _applyGeoreference();
        if (_resizeCleanup) _resizeCleanup();
        closeModal_();
    };
    metaRow.appendChild(applyBtn);
    footer.appendChild(metaRow);
    // ---- Responsive: stacked layout for narrow viewports ----
    const applyResponsive = () => {
        const isNarrow = window.innerWidth < 800;
        leftPane.style.width = isNarrow ? '100%' : '50%';
        rightPane.style.width = isNarrow ? '100%' : '50%';
        body.style.flexDirection = isNarrow ? 'column' : 'row';
        leftPane.style.borderRight = isNarrow ? 'none' : '1px solid var(--border-color,#333)';
        leftPane.style.borderBottom = isNarrow ? '1px solid var(--border-color,#333)' : 'none';
        if (isNarrow) {
            leftPane.style.maxHeight = '45vh';
            rightPane.style.minHeight = '250px';
        } else {
            leftPane.style.maxHeight = '';
        }
    };
    applyResponsive();
    window.addEventListener('resize', applyResponsive);
    _resizeCleanup = () => window.removeEventListener('resize', applyResponsive);
    document.body.appendChild(overlay);
    hydrateIcons(overlay);
    // Init map + render image after DOM is in place
    requestAnimationFrame(async () => {
        if (_georefImage) _renderGeorefImageCanvas(imageCanvas);
        await _initGeorefMap(mapContainer);
    });
}
// ---- Upload handler with size warning + GeoTIFF detection ----
function _georefUploadImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/tiff,.tif,.tiff';
    input.onchange = async (e: any) => {
        const file = (e.target as HTMLInputElement | null)?.files?.[0];
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) {
            showToast(t('georefImageTooLarge') || 'Image too large (max 50 MB)', 'error');
            return;
        }
        // Warning de tamanho para ECO1
        if (file.size > 5 * 1024 * 1024) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            const eco1MB = ((file.size * 1.8) / (1024 * 1024)).toFixed(0);
            showToast(
                t('georefLargeImageWarning') ||
                    `Large image (${sizeMB} MB) â€” export will be ~${eco1MB} MB. Consider resizing.`,
                'warning',
            );
        }
        // GeoTIFF detection
        if (file.name.match(/\.tiff?$/i)) {
            showToast(
                t('georefGeoTiffNote') ||
                    'GeoTIFF detected â€” embedded coordinates not extracted. Place control points manually.',
                'info',
            );
        }
        _georefImage = await readFileAsDataUrl(file);
        // Reset stale calibration from previous image.
        for (const marker of Object.values(_georefMarkers)) marker?.remove?.();
        _georefMarkers = {};
        _georefGCPs = [];
        _georefActiveIdx = -1;
        _removeGeorefPreview();
        _updateGeorefPolygon();
        _updateGeorefFooter();
        // Resolve natural dimensions before EXIF-driven GCP placement.
        try {
            const dims: any = await new Promise((resolve: any, reject: any) => {
                const tmpImg = new Image();
                tmpImg.onload = () => resolve({ width: tmpImg.naturalWidth, height: tmpImg.naturalHeight });
                tmpImg.onerror = () => reject(new Error('Invalid image'));
                tmpImg.src = _georefImage || '';
            });
            _georefImageW = dims.width;
            _georefImageH = dims.height;
        } catch (e: any) {
            console.debug('[aerial] imageLoad:', _errorMessage(e));
            showToast(t('georefImageLoadFailed') || 'Failed to load image', 'error');
            _georefImage = null;
            return;
        }
        const canvas = _el('georef-image-canvas');
        if (canvas) _renderGeorefImageCanvas(canvas);
        // Try EXIF GPS extraction (Phase 2 â€” importado dinamicamente)
        try {
            const { extractExifGPS } = await import('../helpers/exifGps.js');
            const gps = await extractExifGPS(file);
            if (gps) {
                showToast(t('georefExifFound') || 'GPS coordinates found in image metadata', 'info');
                if (_georefMap) {
                    _georefMap.flyTo({ center: [gps.lon, gps.lat], zoom: 16 });
                }
                // Auto-criar GCP no centro da imagem com coords EXIF
                _georefGCPs.push({
                    id: _georefNextId++,
                    imgX: _georefImageW / 2,
                    imgY: _georefImageH / 2,
                    lat: gps.lat,
                    lon: gps.lon,
                    label: 'EXIF GPS',
                });
                _georefActiveIdx = -1;
                _updateGeorefFooter();
                _addGCPMapMarker(_georefGCPs.length - 1);
            }
        } catch (e: any) {
            console.debug('[aerial] parseEXIF:', _errorMessage(e));
            /* Phase 2 not yet available or no GPS â€” silencioso */
        }
    };
    input.click();
}
function _cleanupGeoref() {
    if (_georefMap) {
        if (_georefMap.remove) _georefMap.remove();
        _georefMap = null;
    }
    _georefGCPs = [];
    _georefMarkers = {};
    _georefActiveIdx = -1;
    _georefDragIdx = -1;
    _georefCanvas = null;
    _georefSatVisible = false;
    if (_georefSearchTimer) clearTimeout(_georefSearchTimer);
    _georefSearchTimer = null;
}
// ---- Image canvas rendering with GCP markers ----
/** @param {HTMLCanvasElement} canvas */
function _renderGeorefImageCanvas(canvas: any) {
    if (!_georefImage) return;
    const img = new Image();
    img.onload = () => {
        if (!_georefImageW) {
            _georefImageW = img.naturalWidth;
            _georefImageH = img.naturalHeight;
        }
        const ratio = img.width / img.height;
        canvas.width = canvas.clientWidth || 400;
        canvas.height = Math.round(canvas.width / ratio);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        _drawGeorefGCPs(ctx, canvas.width, canvas.height);
    };
    img.src = _georefImage;
}
/**
 * Draw all GCP markers on the image canvas.
 * Marcadores numerados: vermelho = sem coords, azul = ativo, verde = completo.
 */
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasW
 * @param {number} canvasH
 */
function _drawGeorefGCPs(ctx: any, canvasW: any, canvasH: any) {
    if (!_georefImageW) return;
    const scaleX = canvasW / _georefImageW;
    const scaleY = canvasH / _georefImageH;
    for (let i = 0; i < _georefGCPs.length; i++) {
        const gcp = _georefGCPs[i];
        if (!gcp) continue;
        const cx = gcp.imgX * scaleX;
        const cy = gcp.imgY * scaleY;
        const isActive = _georefActiveIdx === i;
        const isComplete = gcp.lat !== null && gcp.lon !== null;
        const r = GEOREF_GCP_RADIUS;
        // Crosshair lines
        ctx.strokeStyle = isComplete ? '#22c55e' : isActive ? '#3b82f6' : '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - r * 1.5, cy);
        ctx.lineTo(cx - r * 0.5, cy);
        ctx.moveTo(cx + r * 0.5, cy);
        ctx.lineTo(cx + r * 1.5, cy);
        ctx.moveTo(cx, cy - r * 1.5);
        ctx.lineTo(cx, cy - r * 0.5);
        ctx.moveTo(cx, cy + r * 0.5);
        ctx.lineTo(cx, cy + r * 1.5);
        ctx.stroke();
        // Circle
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = isComplete ? 'rgba(34,197,94,0.3)' : isActive ? 'rgba(59,130,246,0.3)' : 'rgba(239,68,68,0.3)';
        ctx.fill();
        ctx.strokeStyle = isComplete ? '#22c55e' : isActive ? '#3b82f6' : '#ef4444';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Number label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(gcp.id), cx, cy);
    }
}
/**
 * Hit test: find GCP near canvas click position.
 * @returns {number} Index of hit GCP or -1
 */
/**
 * @param {MouseEvent} e
 * @param {HTMLCanvasElement} canvas
 */
function _hitTestGCP(e: any, canvas: any) {
    if (!_georefImageW || _georefGCPs.length === 0) return -1;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const scaleX = canvas.width / _georefImageW;
    const scaleY = canvas.height / _georefImageH;
    let closest = -1;
    let minDist = GEOREF_HIT_RADIUS;
    for (let i = 0; i < _georefGCPs.length; i++) {
        const gcp = _georefGCPs[i];
        if (!gcp) continue;
        const dx = mx - gcp.imgX * scaleX;
        const dy = my - gcp.imgY * scaleY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDist) {
            minDist = d;
            closest = i;
        }
    }
    return closest;
}
/**
 * Image canvas click handler.
 * Cria novo GCP na posicao ou seleciona existente se perto.
 */
/**
 * @param {MouseEvent} e
 * @param {HTMLCanvasElement} canvas
 */
function _onGeorefImageClick(e: any, canvas: any) {
    if (_georefDragIdx >= 0) return; // Skip during drag
    if (!_georefImage || !_georefImageW) {
        showToast(t('georefUploadFirst') || 'Upload an image first', 'info');
        return;
    }
    const hitIdx = _hitTestGCP(e, canvas);
    if (hitIdx >= 0) {
        // Select existing GCP â€” next map click sets its coords
        _georefActiveIdx = hitIdx;
        _renderGeorefImageCanvas(canvas);
        _updateGeorefFooter();
        const gcp = _georefGCPs[hitIdx];
        if (!gcp) return;
        const hint = _el('georef-hint');
        if (hint) hint.textContent = t('georefClickMapNow') || `Click map to set GCP #${gcp.id} coordinates`;
        showToast(t('georefClickMapNow') || `Click map to set GCP #${gcp.id} coordinates`, 'info');
        return;
    }
    // Create new GCP at click position
    const rect = canvas.getBoundingClientRect();
    const scaleX = _georefImageW / canvas.width;
    const scaleY = _georefImageH / canvas.height;
    const imgX = (e.clientX - rect.left) * scaleX;
    const imgY = (e.clientY - rect.top) * scaleY;
    const newGCP = {
        id: _georefNextId++,
        imgX,
        imgY,
        lat: null,
        lon: null,
        label: `GCP ${_georefGCPs.length + 1}`,
    };
    _georefGCPs.push(newGCP);
    _georefActiveIdx = _georefGCPs.length - 1;
    _renderGeorefImageCanvas(canvas);
    _updateGeorefFooter();
    const hint = _el('georef-hint');
    if (hint) hint.textContent = t('georefClickMapNow') || `Click map to set GCP #${newGCP.id} coordinates`;
    showToast(t('georefClickMapNow') || `Click map to set GCP #${newGCP.id} coordinates`, 'info');
}
// ---- Map initialization with satellite toggle + search ----
/** @param {HTMLElement} container */
async function _initGeorefMap(container: any) {
    try {
        if (!window.maplibregl) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = MAPLIBRE_CSS_URL;
            document.head.appendChild(link);
            await (loadScriptCDN as any)(MAPLIBRE_JS_URL, 'maplibregl', 15000);
        }
        let center = [-47, -15]; // Default Brazil
        let zoom = 4;
        if (hasOrigin()) {
            try {
                const origin = getOrigin();
                const wgs = utmToWGS84(origin);
                center = [wgs.longitude, wgs.latitude];
                zoom = 15;
            } catch (e: any) {
                console.debug('[aerial] originUtmToWgs84:', _errorMessage(e));
                /* use default */
            }
        }
        _georefMap = new window.maplibregl.Map({
            container,
            style: GEOREF_STYLE,
            center,
            zoom,
        });
        // Satellite layer (hidden by default)
        _georefMap.on('load', () => {
            _georefMap.addSource('georef-sat', {
                type: 'raster',
                tiles: [GEOREF_SAT_TILES],
                tileSize: 256,
                attribution: 'Sentinel-2 cloudless by EOX',
            });
            _georefMap.addLayer({
                id: 'georef-sat-layer',
                type: 'raster',
                source: 'georef-sat',
                layout: { visibility: 'none' },
            });
        });
        // Map click â†’ set GCP coordinates
        _georefMap.on(
            'click',
            /** @param {any} btn */ (e: any) => {
                if (_georefActiveIdx < 0 || _georefActiveIdx >= _georefGCPs.length) return;
                const { lat, lng } = e.lngLat;
                _setGCPMapCoord(_georefActiveIdx, lat, lng);
            },
        );
    } catch (err: any) {
        // Fallback sem mapa â€” inputs manuais permanecem funcionais
        log.warn('Georef map initialization failed, falling back to manual input', _errorMessage(err));
        container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:13px;padding:20px;text-align:center;">${escapeHtml(t('georefMapUnavailable') || 'Map unavailable â€” enter coordinates manually below')}</div>`;
        showToast(t('georefMapUnavailable') || 'Map unavailable â€” enter coordinates manually', 'warning');
    }
}
// ---- Satellite layer toggle ----
/** @param {HTMLElement} btn */
function _georefToggleSatellite(btn: any) {
    if (!_georefMap) return;
    _georefSatVisible = !_georefSatVisible;
    try {
        _georefMap.setLayoutProperty('georef-sat-layer', 'visibility', _georefSatVisible ? 'visible' : 'none');
        btn.style.background = _georefSatVisible ? 'var(--accent-color,#3b82f6)' : '';
        btn.style.color = _georefSatVisible ? '#fff' : '';
    } catch (e: any) {
        console.debug('[aerial] toggleSatellite-layerNotLoaded:', _errorMessage(e));
        /* layer not yet loaded */
    }
}
// ---- Nominatim geocoding search ----
/** @param {string} query */
async function _georefSearchNominatim(query: any) {
    if (!query || query.length < 3 || !_georefMap) return;
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        const results = await res.json();
        if (results.length > 0) {
            const { lat, lon, display_name } = results[0];
            _georefMap.flyTo({ center: [parseFloat(lon), parseFloat(lat)], zoom: 16 });
            showToast(display_name.substring(0, 80), 'info');
        } else {
            showToast(t('georefNoResults') || 'No results found', 'warning');
        }
    } catch (e: any) {
        console.debug('[aerial] nominatimSearch:', _errorMessage(e));
        showToast(t('georefSearchError') || 'Search failed', 'error');
    }
}
// ---- Set GCP map coordinates ----
/**
 * @param {number} idx
 * @param {number} lat
 * @param {number} lon
 */
function _setGCPMapCoord(idx: any, lat: any, lon: any) {
    if (idx < 0 || idx >= _georefGCPs.length) return;
    const gcp = _georefGCPs[idx]!;
    if (!gcp) return;
    if (!gcp) return;
    gcp.lat = lat;
    gcp.lon = lon;
    // Map marker
    _addGCPMapMarker(idx);
    // Auto-advance to next GCP without coords
    const nextIdx = _georefGCPs.findIndex((g: any, i: any) => i !== idx && (g.lat === null || g.lon === null));
    _georefActiveIdx = nextIdx >= 0 ? nextIdx : -1;
    // Update UI
    _updateGeorefFooter();
    _updateGeorefPolygon();
    _updateGeorefPreview();
    if (_georefCanvas) _renderGeorefImageCanvas(_georefCanvas);
    const hint = _el('georef-hint');
    if (_georefActiveIdx >= 0) {
        const next = _georefGCPs[_georefActiveIdx];
        if (!next) return;
        if (hint) hint.textContent = t('georefClickMapNow') || `Click map to set GCP #${next.id} coordinates`;
    } else {
        if (hint) hint.textContent = t('georefClickImageFirst') || 'Click image to place GCP';
    }
}
/** @param {number} idx */
function _addGCPMapMarker(idx: any) {
    if (!_georefMap || !window.maplibregl) return;
    const gcp = _georefGCPs[idx];
    if (!gcp) return;
    if (gcp.lat === null || gcp.lon === null) return;
    // Remove old marker
    if (_georefMarkers[gcp.id]) {
        _georefMarkers[gcp.id].remove();
        delete _georefMarkers[gcp.id];
    }
    const el = document.createElement('div');
    el.style.cssText =
        'width:18px;height:18px;border-radius:50%;background:#22c55e;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:#fff;cursor:pointer;';
    el.textContent = String(gcp.id);
    if (gcp.label) el.title = `#${gcp.id}: ${gcp.label}`;
    _georefMarkers[gcp.id] = new window.maplibregl.Marker({ element: el, draggable: true })
        .setLngLat([gcp.lon, gcp.lat])
        .addTo(_georefMap);
    // Draggable marker: update coords on dragend
    _georefMarkers[gcp.id].on('dragend', () => {
        const lngLat = _georefMarkers[gcp.id].getLngLat();
        gcp.lat = lngLat.lat;
        gcp.lon = lngLat.lng;
        _updateGeorefFooter();
        _updateGeorefPolygon();
        _updateGeorefPreview();
    });
}
// ---- GCP deletion ----
/** @param {number} idx */
function _deleteGCP(idx: number) {
    if (idx < 0 || idx >= _georefGCPs.length) return;
    const gcp = _georefGCPs[idx] as any;
    // Remove marker
    if (_georefMarkers[gcp.id]) {
        _georefMarkers[gcp.id].remove();
        delete _georefMarkers[gcp.id];
    }
    _georefGCPs.splice(idx, 1);
    if (_georefActiveIdx === idx) _georefActiveIdx = -1;
    else if (_georefActiveIdx > idx) _georefActiveIdx--;
    _updateGeorefFooter();
    _updateGeorefPolygon();
    _updateGeorefPreview();
    if (_georefCanvas) _renderGeorefImageCanvas(_georefCanvas);
}
// ---- Manual coordinate input for a GCP ----
/** @param {number} idx */
function _onGeorefManualInput(idx: number) {
    const lat = parseFloat((_el(`georef-lat-${idx}`) as HTMLInputElement | null)?.value || '');
    const lon = parseFloat((_el(`georef-lon-${idx}`) as HTMLInputElement | null)?.value || '');
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        const gcp = _georefGCPs[idx];
        if (!gcp) return;
        gcp.lat = lat;
        gcp.lon = lon;
        _addGCPMapMarker(idx);
        _updateGeorefFooter();
        _updateGeorefPolygon();
        _updateGeorefPreview();
    }
}
// ---- Footer: dynamic GCP list + metrics ----
function _updateGeorefFooter() {
    const list = _el('georef-gcp-list');
    if (!list) return;
    if (_georefGCPs.length === 0) {
        list.innerHTML = `<div style="color:var(--text-secondary,#888);padding:4px 0;">${escapeHtml(t('georefNoGCPs') || 'No control points yet â€” click on the image to add')}</div>`;
    } else {
        let html = '<div style="display:flex;flex-direction:column;gap:3px;">';
        for (let i = 0; i < _georefGCPs.length; i++) {
            const gcp = _georefGCPs[i];
            if (!gcp) continue;
            const isComplete = gcp.lat !== null && gcp.lon !== null;
            const isActive = _georefActiveIdx === i;
            const stateClass = isComplete ? 'gcp-complete' : 'gcp-incomplete';
            const activeClass = isActive ? 'gcp-active' : '';
            html += `<div class="georef-gcp-row ${stateClass} ${activeClass}">`;
            html += `<span class="gcp-id">#${gcp.id}</span>`;
            if (gcp.label && gcp.label !== `GCP ${i + 1}`) {
                html += `<span class="gcp-label" title="${escapeAttr(gcp.label)}">${escapeHtml(gcp.label)}</span>`;
            }
            html += `<span style="color:var(--text-secondary,#888);min-width:70px;font-size:10px;">(${Math.round(gcp.imgX)}, ${Math.round(gcp.imgY)})</span>`;
            html += `<span style="margin:0 2px;font-size:10px;">&#8594;</span>`;
            // Lat/lon inputs
            html += `<input data-field-meta="true" data-field-meta-key="auto-tpl:aerial:input:L3031" type="number" step="0.0001" placeholder="lat" id="georef-lat-${i}" value="${isComplete ? Number(gcp.lat).toFixed(6) : ''}" `;
            html += `onchange="window._georefManualInput(${i})" style="${GEOREF_INPUT_STYLE}">`;
            html += `<input data-field-meta="true" data-field-meta-key="auto-tpl:aerial:input:L3033" type="number" step="0.0001" placeholder="lon" id="georef-lon-${i}" value="${isComplete ? Number(gcp.lon).toFixed(6) : ''}" `;
            html += `onchange="window._georefManualInput(${i})" style="${GEOREF_INPUT_STYLE}">`;
            // Delete button
            html += `<button class="gcp-delete" data-cc-call-click="_georefDeleteGCP|j:${encodeURIComponent(String(i))}" title="${escapeAttr(t('georefDeleteGCP') || 'Delete')}">&#10005;</button>`;
            html += '</div>';
        }
        html += '</div>';
        list.innerHTML = html;
    }
    // Update metrics
    _updateGeorefMetrics();
}
// Register window handlers for inline onclick
window._georefManualInput = _onGeorefManualInput;
window._georefDeleteGCP = _deleteGCP;
// ---- Convex hull polygon on map ----
function _updateGeorefPolygon() {
    if (!_georefMap || !window.maplibregl) return;
    const withCoords = _georefGCPs.filter(_hasGcpCoords);
    const sourceId = 'georef-polygon';
    if (withCoords.length < 3) {
        // Remove polygon if less than 3 points
        if (_georefMap.getSource(sourceId)) {
            _georefMap
                .getSource(sourceId)
                .setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } });
        }
        return;
    }
    // Simple convex hull (Graham scan for small N)
    const pts: any = withCoords.map((g: CompleteGeorefGcp) => [g.lon, g.lat] as [number, number]);
    const hull = _convexHull(pts);
    hull.push(hull[0]!); // Close ring
    if (_georefMap.getSource(sourceId)) {
        _georefMap.getSource(sourceId).setData({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [hull] },
        });
    } else {
        try {
            _georefMap.addSource(sourceId, {
                type: 'geojson',
                data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [hull] } },
            });
            _georefMap.addLayer({
                id: sourceId + '-fill',
                type: 'fill',
                source: sourceId,
                paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.12 },
            });
            _georefMap.addLayer({
                id: sourceId + '-line',
                type: 'line',
                source: sourceId,
                paint: { 'line-color': '#3b82f6', 'line-width': 2, 'line-dasharray': [4, 4] },
            });
        } catch (e: any) {
            console.debug('[aerial] addPolygonLayers-sourceExists:', _errorMessage(e));
            /* source already exists */
        }
    }
}
/**
 * Simple convex hull (Graham scan) for small point sets.
 * @param {Array<[number, number]>} points - [lon, lat] pairs
 * @returns {Array<[number, number]>} Hull points in CCW order
 */
function _convexHull(points: Array<[number, number]>) {
    if (points.length <= 3) return [...points];
    const sorted = [...points].sort((a: any, b: any) => a[0] - b[0] || a[1] - b[1]);
    const cross =
        /**
         * @param {[number, number]} o
         * @param {[number, number]} a
         * @param {[number, number]} b
         */
        (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower: any = [];
    for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper: any = [];
    for (const p of sorted.reverse()) {
        while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
        upper.push(p);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}
// ---- Metrics: GCP count, RMS residual, resolution ----
function _updateGeorefMetrics() {
    const metrics = _el('georef-metrics');
    const applyBtn = _el('georef-apply-btn');
    const complete = _georefGCPs.filter(_hasGcpCoords);
    const total = _georefGCPs.length;
    if (metrics) {
        let html = `<span>${t('georefGCPCount') || 'GCPs'}: ${complete.length}/${total} (min 3)</span>`;
        if (complete.length >= 3) {
            const result = _computeGeorefTransform();
            if (result) {
                html += ` <span>&#8226; ${t('georefResidual') || 'RMS'}: ${result.transform.residual.toFixed(2)} m</span>`;
                html += ` <span>&#8226; ${t('georefResolution') || 'Res'}: ${(1 / result.pxPerMeter).toFixed(2)} m/px</span>`;
                const method =
                    result.transform.method === 'affine'
                        ? 'Affine'
                        : result.transform.method === 'similarity'
                          ? 'Similarity'
                          : 'Scale';
                html += ` <span>&#8226; ${method}</span>`;
                if (result.gcpsRejected.length > 0) {
                    html += ` <span style="color:#ef4444;">&#8226; ${result.gcpsRejected.length} outlier(s)</span>`;
                }
            }
        }
        metrics.innerHTML = html;
    }
    if (applyBtn) (applyBtn as HTMLButtonElement).disabled = complete.length < 3 || !_georefImage;
}
/**
 * Compute affine transform from current GCPs.
 * Converte GCPs (pixel + WGS84) para formato do mapGeoreferencer.
 * @returns {any|null}
 */
function _computeGeorefTransform() {
    const complete = _georefGCPs.filter(_hasGcpCoords);
    if (complete.length < 2 || !_georefImageW) return null;
    // Converter WGS84 â†’ UTM para cada GCP
    const gcps = complete.map((g: CompleteGeorefGcp) => {
        const utm = wgs84ToUTM({ latitude: g.lat, longitude: g.lon }, undefined);
        return { pixel: [g.imgX, g.imgY], coord: [utm.easting, utm.northing] };
    });
    return buildTransform(gcps, {
        crs: 'UTM',
        imageWidth: _georefImageW,
        imageHeight: _georefImageH,
    });
}
// ---- Image preview overlay on map (Phase 4) ----
function _updateGeorefPreview() {
    if (!_georefMap || !_georefImage) return;
    // Respect preview toggle state
    const toggleBtn = _el('georef-preview-toggle');
    if (toggleBtn && !toggleBtn.classList.contains('active')) return;
    const result = _computeGeorefTransform();
    if (!result) {
        // Remove preview if transform not available
        _removeGeorefPreview();
        return;
    }
    // Compute image corners in UTM, then WGS84
    const corners = [
        pixelToWorld(result.transform, 0, 0), // NW (top-left)
        pixelToWorld(result.transform, _georefImageW, 0), // NE (top-right)
        pixelToWorld(result.transform, _georefImageW, _georefImageH), // SE (bottom-right)
        pixelToWorld(result.transform, 0, _georefImageH), // SW (bottom-left)
    ];
    // UTM zone from first GCP
    const firstComplete = _georefGCPs.find(_hasGcpCoords);
    if (!firstComplete) return;
    const refUtm = wgs84ToUTM({ latitude: firstComplete.lat, longitude: firstComplete.lon }, undefined);
    const wgs84Corners = corners.map((c: any) => {
        const wgs = utmToWGS84({
            easting: c.easting,
            northing: c.northing,
            zone: refUtm.zone,
            hemisphere: refUtm.hemisphere,
        });
        return [wgs.longitude, wgs.latitude];
    });
    // MapLibre image source requires: [NW, NE, SE, SW]
    const previewSourceId = 'georef-preview';
    const opacity = (parseInt((_el('georef-opacity') as HTMLInputElement | null)?.value || '') || 70) / 100;
    try {
        if (_georefMap.getLayer(previewSourceId + '-layer')) _georefMap.removeLayer(previewSourceId + '-layer');
        if (_georefMap.getSource(previewSourceId)) _georefMap.removeSource(previewSourceId);
        _georefMap.addSource(previewSourceId, {
            type: 'image',
            url: _georefImage,
            coordinates: wgs84Corners, // [NW, NE, SE, SW]
        });
        const layerDef = {
            id: previewSourceId + '-layer',
            type: 'raster',
            source: previewSourceId,
            paint: { 'raster-opacity': opacity },
        };
        const beforeId = _georefMap.getLayer('georef-polygon-fill') ? 'georef-polygon-fill' : undefined;
        if (beforeId)
            _georefMap.addLayer(layerDef, beforeId); // Insert below polygon if available
        else _georefMap.addLayer(layerDef);
    } catch (e: any) {
        console.debug('[aerial] previewLayerSetup:', _errorMessage(e));
        /* preview layer setup failed â€” non-critical */
    }
}
function _removeGeorefPreview() {
    if (!_georefMap) return;
    try {
        if (_georefMap.getLayer('georef-preview-layer')) _georefMap.removeLayer('georef-preview-layer');
        if (_georefMap.getSource('georef-preview')) _georefMap.removeSource('georef-preview');
    } catch (e: any) {
        console.debug('[aerial] removePreview-alreadyRemoved:', _errorMessage(e));
        /* already removed */
    }
}
function _updateGeorefPreviewOpacity() {
    if (!_georefMap) return;
    const opacity = (parseInt((_el('georef-opacity') as HTMLInputElement | null)?.value || '') || 70) / 100;
    try {
        _georefMap.setPaintProperty('georef-preview-layer', 'raster-opacity', opacity);
    } catch (e: any) {
        console.debug('[aerial] setPreviewOpacity-layerNotPresent:', _errorMessage(e));
        /* layer not present */
    }
}
/**
 * Lazy-load turf.js for geometry QA in georeferencing flow.
 * @returns {Promise<any|null>}
 */
async function _loadTurf() {
    if (_turf) return _turf;
    try {
        _turf = await importCDN(TURF_CDN, { name: 'turf.js' });
        return _turf;
    } catch (e: any) {
        console.debug('[aerial] loadTurfCdn:', _errorMessage(e));
        _turf = null;
        return null;
    }
}
/**
 * Validate georeferenced polygon geometry before persistence.
 * Performs best-effort checks; if turf is unavailable, keeps flow unblocked.
 *
 * @param {Array<[number, number]>} ring - Closed ring in [lon, lat]
 * @returns {Promise<{ok:boolean, areaM2:number|null, engine:string, message?:string}>}
 */
async function _validateGeorefGeometry(ring: Array<[number, number]>) {
    if (!Array.isArray(ring) || ring.length < 4) {
        return {
            ok: false,
            areaM2: null,
            engine: 'none',
            message: t('georefInvalidGeometry') || 'Invalid georeferenced geometry',
        };
    }
    const turf = await _loadTurf();
    if (!turf) return { ok: true, areaM2: null, engine: 'fallback-no-turf' };
    try {
        const feature = turf.polygon([ring]);
        if (typeof turf.booleanValid === 'function' && !turf.booleanValid(feature)) {
            return {
                ok: false,
                areaM2: null,
                engine: 'turf',
                message: t('georefInvalidGeometry') || 'Invalid georeferenced geometry',
            };
        }
        if (typeof turf.kinks === 'function') {
            const kinkResult = turf.kinks(feature);
            if ((kinkResult?.features || []).length > 0) {
                return {
                    ok: false,
                    areaM2: null,
                    engine: 'turf',
                    message: t('georefSelfIntersecting') || 'Self-intersecting geometry - adjust control points',
                };
            }
        }
        const areaM2 = typeof turf.area === 'function' ? Number(turf.area(feature)) : null;
        if (areaM2 !== null && Number.isFinite(areaM2) && areaM2 <= 0) {
            return {
                ok: false,
                areaM2,
                engine: 'turf',
                message: t('georefZeroArea') || 'Georeferenced area is zero',
            };
        }
        return { ok: true, areaM2: Number.isFinite(areaM2) ? areaM2 : null, engine: 'turf' };
    } catch (e: any) {
        console.debug('[aerial] validateGeometryTurf:', _errorMessage(e));
        return {
            ok: false,
            areaM2: null,
            engine: 'turf',
            message: t('georefInvalidGeometry') || 'Invalid georeferenced geometry',
        };
    }
}
// ---- AI Suggest Location (Phase 3) ----
/**
 * Send image to LLM vision and auto-populate GCPs from detected landmarks.
 * Envia imagem ao LLM com prompt de georreferenciamento. Parseia resposta
 * JSON e cria GCPs a partir dos landmarks detectados.
 * @param {HTMLButtonElement} btn - Button element (for loading state)
 */
async function _aiSuggestGeoref(btn: HTMLButtonElement) {
    if (!_georefImage) {
        showToast(t('georefUploadFirst') || 'Upload an image first', 'info');
        return;
    }
    if (!hasApiKey()) {
        showToast(t('georefSuggestNoKey') || 'Configure AI key to use this feature', 'warning');
        if (typeof window.openLLMConfig === 'function') window.openLLMConfig();
        return;
    }
    // Loading state
    const origText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="georef-spinner"></span>';
    try {
        const response = await sendMessage(AI_GEOREF_SYSTEM_PROMPT, AI_GEOREF_USER_PROMPT, { image: _georefImage });
        const data = parseAiGeorefResponse(response?.content || '');
        // Validate response shape
        if (!data || !data.bounds || !data.landmarks) {
            showToast(t('georefSuggestFailed') || 'Could not identify location', 'warning');
            return;
        }
        // Confidence check
        if (data.confidence < 0.3) {
            showToast(t('georefSuggestLowConfidence') || 'Low confidence â€” verify manually', 'warning');
        }
        // Fly map to suggested bounds
        const flyTo = buildBoundsFlyTo(data.bounds);
        if (_georefMap && flyTo) _georefMap.flyTo(flyTo);
        // Create GCPs from landmarks
        const newGcps = landmarksToGcpRecords(data.landmarks, _georefImageW, _georefImageH, {
            next: () => _georefNextId++,
        });
        for (const gcp of newGcps) {
            _georefGCPs.push(gcp);
            _addGCPMapMarker(_georefGCPs.length - 1);
        }
        _georefActiveIdx = -1;
        _updateGeorefFooter();
        _updateGeorefPolygon();
        _updateGeorefPreview();
        if (_georefCanvas) _renderGeorefImageCanvas(_georefCanvas);
        const loc = data.location || 'Unknown';
        const conf = data.confidence ? `(${Math.round(data.confidence * 100)}%)` : '';
        showToast(`${loc} ${conf}`, 'success');
        if (data.reasoning) {
            console.debug('[ecbyts] AI georef reasoning:', data.reasoning);
        }
    } catch (err: any) {
        log.error('AI georef suggestion failed', _errorMessage(err));
        showToast(t('georefSuggestFailed') || 'Could not identify location', 'warning');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
    }
}
// ---- Apply: create boundary element with overlay ----
async function _applyGeoreference() {
    const complete = _georefGCPs.filter(_hasGcpCoords);
    if (!_georefImage || complete.length < 3) {
        showToast(t('georefNoCorners') || 'Set at least 3 control points', 'error');
        return;
    }
    // Validate GCPs are not collinear (triangle area must be non-zero)
    if (complete.length >= 3) {
    const [a, b, c] = complete as [CompleteGeorefGcp, CompleteGeorefGcp, CompleteGeorefGcp, ...CompleteGeorefGcp[]];
        const area = Math.abs((b.lon - a.lon) * (c.lat - a.lat) - (c.lon - a.lon) * (b.lat - a.lat));
        if (area < 1e-10) {
            showToast(t('georefCollinear') || 'Control points are collinear â€” cannot compute transform', 'error');
            return;
        }
    }
    const result = _computeGeorefTransform();
    if (!result) {
        showToast(t('georefTransformFailed') || 'Failed to compute transform', 'error');
        return;
    }
    // Auto-set UTM origin if needed
    if (!hasOrigin()) {
        const firstGcp = complete[0]!;
        const utm = wgs84ToUTM({ latitude: firstGcp.lat, longitude: firstGcp.lon }, undefined);
        setOrigin({ easting: utm.easting, northing: utm.northing, zone: utm.zone, hemisphere: utm.hemisphere });
        showToast(t('georefOriginSet') || 'UTM origin set from first GCP', 'info');
    }
    const origin = getOrigin();
    // Compute image corner vertices in Three.js world coords
    const imgCorners = [
        pixelToWorld(result.transform, 0, _georefImageH), // SW (bottom-left)
        pixelToWorld(result.transform, _georefImageW, _georefImageH), // SE (bottom-right)
        pixelToWorld(result.transform, _georefImageW, 0), // NE (top-right)
        pixelToWorld(result.transform, 0, 0), // NW (top-left)
    ];
    // Geometry QA (Turf.js best-effort): validate polygon in WGS84 before persist.
    const firstGcp = complete[0]!;
    const refUtm = wgs84ToUTM({ latitude: firstGcp.lat, longitude: firstGcp.lon }, undefined);
    /** @type {Array<[number, number]>} */
    const ring: Array<[number, number]> = imgCorners.map((c: any) => {
        const wgs = utmToWGS84({
            easting: c.easting,
            northing: c.northing,
            zone: refUtm.zone,
            hemisphere: refUtm.hemisphere,
        });
        return [wgs.longitude, wgs.latitude];
    });
    ring.push([ring[0]![0], ring[0]![1]]);
    const geometryCheck = await _validateGeorefGeometry(ring);
    if (!geometryCheck.ok) {
        showToast(geometryCheck.message || t('georefInvalidGeometry') || 'Invalid georeferenced geometry', 'error');
        return;
    }
    const vertices = imgCorners.map((c: any) => ({
        x: c.easting - origin.easting,
        y: 0,
        z: -(c.northing - origin.northing),
    }));
    const opacity = (parseInt((_el('georef-opacity') as HTMLInputElement | null)?.value || '') || 70) / 100;
    const source = (_el('georef-source') as HTMLInputElement | null)?.value || 'other';
    const captureDate = (_el('georef-date') as HTMLInputElement | null)?.value || '';
    const id = generateId('boundary');
    const name = `Aerial: ${source} ${captureDate || new Date().toISOString().slice(0, 10)}`;
    // Store GCPs for provenance
    const gcpData = complete.map((g: CompleteGeorefGcp) => ({
        imgX: Math.round(g.imgX),
        imgY: Math.round(g.imgY),
        lat: g.lat,
        lon: g.lon,
        label: g.label,
    }));
    addElement('boundary', id, name, {
        vertices,
        overlayUrl: _georefImage,
        overlayOpacity: opacity,
        georef: {
            gcps: gcpData,
            transform: {
                method: result.transform.method,
                residual: result.transform.residual,
                matrix: result.transform.matrix,
            },
            resolution: 1 / result.pxPerMeter,
            source,
            captureDate,
            crs: 'WGS84',
            engine: CONFIG?.FEATURES?.ADVANCED_GEOREF_ENGINE ? 'advanced-georef-engine' : 'builtin-affine',
            imageWidth: _georefImageW,
            imageHeight: _georefImageH,
            validation: {
                geometryValid: geometryCheck.ok,
                geometryAreaM2: geometryCheck.areaM2,
                geometryEngine: geometryCheck.engine,
            },
        },
    });
    showToast(t('georefSuccess') || `Georeferenced image added as "${name}"`, 'success');
    requestAerialGeorefUIRefresh('aerial.georef-created');
}
function requestAerialGeorefUIRefresh(reason = 'aerial.georef-changed') {
    if (typeof requestUIRefresh !== 'function') return;
    const domains = [
        UI_INVALIDATION_DOMAINS.AERIAL,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains) {
        requestUIRefresh(domain, reason);
    }
}
//# sourceMappingURL=aerialGeorefWorkflow.js.map
