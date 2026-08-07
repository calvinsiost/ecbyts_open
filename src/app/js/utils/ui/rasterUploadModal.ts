// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   RASTER UPLOAD MODAL — Upload + Georeference + Extract Contours
   ================================================================

   Modal para upload de imagem raster (mapa topografico, isopleta,
   ortofoto), georeferenciamento via pontos de controle (GCPs) e
   extracao de isolinhas.

   Pipeline: Upload → Preview → GCPs (min 4) → Afim → RMS → Extrair
   ================================================================ */
import { showToast } from './toast.js';
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { createLogger } from '../helpers/logger.js';
import { idbSet } from '../storage/idbStore.js';
import { validateControlPoints, solveAffineMatrix, calculateRMSError, } from '../../core/recognition/rasterGeoref.js';
import { extractContours } from '../../core/recognition/contourExtractor.js';
import { assignContourLevels, georeferenceContours, simplifyContours, exportContoursAsGeoJSON, } from '../../core/recognition/contourGeoreferencer.js';
import { addElement } from '../../core/elements/manager.js';
import { hasOrigin, getOrigin } from '../../core/io/geo/coordinates.js';
const log = createLogger('RasterUpload');
const MODAL_ID = 'raster-upload-modal';
const IDB_KEY = 'ecbyts-raster-georef';
const MAX_CONTROL_POINTS = 20;
const MIN_CONTROL_POINTS = 4;
const _state: any = {
    imageData: null as any,
    imageWidth: 0,
    imageHeight: 0,
    imageName: '',
    previewUrl: null as any,
    controlPoints: [] as any[],
    affineMatrix: null as any,
    rmsError: Infinity,
    contours: null as any,
    georefPolylines: null as any,
    contourInterval: 5,
};
/**
 * Open the raster upload and georeferencing modal.
 */
export function openRasterUploadModal() {
    _resetState();
    let modal = /** @type {any} */ (document.getElementById(MODAL_ID));
    if (!modal) {
        modal = _buildModal();
        document.body.appendChild(modal);
    }
    _renderControlPointRows();
    _updateUI();
    modal.style.display = 'flex';
    (modal as any)._keyHandler = (e: any) => {
        if (e.key === 'Escape')
            closeRasterUploadModal();
    };
    document.addEventListener("keydown", (modal as any)._keyHandler);
    log.info('Raster upload modal opened');
}
/**
 * Close the raster upload modal.
 */
export function closeRasterUploadModal() {
    const modal = (document.getElementById(MODAL_ID)) as any;
    if (!modal)
        return;
    if (modal._keyHandler) {
        document.removeEventListener('keydown', modal._keyHandler);
        modal._keyHandler = null;
    }
    // Persist-toggle lifecycle: modal mantém-se no DOM (re-open reusa estrutura).
    // O AbortController dos action listeners segue vivo entre opens — não abortar aqui.
    modal.style.display = 'none';
    _revokePreview();
    log.info('Raster upload modal closed');
}
/**
 * Build the modal DOM structure.
 * @returns {HTMLElement}
 */
function _buildModal() {
    // B2 migração 2026-05-29: .modal-overlay → .ecbt-overlay + .ecbt-dialog--lg canônicos.
    // Persist-toggle lifecycle preservado (style.display none/flex); inline display:none
    // garante boot fechado mesmo com .ecbt-overlay default = flex. Drena #3:
    // width:720px/max-width:95vw/max-height:90vh inline → clamp() via --ecbt-modal-lg.
    // XSS inline-onclick substituídos por addEventListener pós-build (data-attrs).
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'ecbt-overlay';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--lg raster-upload-dialog">
            <div class="ecbt-dialog-header">
                <h3 class="ecbt-dialog-title">${escapeHtml(t('rasterUpload.title'))}</h3>
                <button class="ecbt-dialog-close" data-raster-close
                    aria-label="${t('common.close')}" title="${t('common.close')}">&times;</button>
            </div>
            <div class="ecbt-dialog-body">
            <div id="raster-drop-zone" style="border:2px dashed var(--border-color,#585b70);
                border-radius:8px;padding:32px;text-align:center;cursor:pointer;margin-bottom:16px;
                color:var(--text-secondary,#a6adc8);">
                <p>${escapeHtml(t('rasterUpload.dropHere'))}</p>
                <input type="file" id="raster-file-input" accept="image/*"
                    style="display:none;" aria-label="Upload raster image" />
            </div>
            <div id="raster-preview" style="display:none;margin-bottom:16px;text-align:center;">
                <img id="raster-preview-img" style="max-width:100%;max-height:300px;border-radius:4px;" alt="Raster preview" />
                <p id="raster-file-info" style="margin:8px 0 0;font-size:12px;color:var(--text-secondary,#a6adc8);"></p>
            </div>
            <div id="raster-gcp-section" style="display:none;">
                <h4 style="color:var(--text-primary,#cdd6f4);margin:0 0 8px;">
                    ${escapeHtml(t('rasterUpload.controlPoints'))}
                </h4>
                <div id="raster-gcp-header" style="display:grid;grid-template-columns:30px 1fr 1fr 1fr 1fr 40px;
                    gap:4px;font-size:11px;color:var(--text-secondary,#a6adc8);margin-bottom:4px;padding:0 2px;">
                    <span>#</span><span>Pixel X</span><span>Pixel Y</span>
                    <span>Easting</span><span>Northing</span><span></span>
                </div>
                <div id="raster-gcp-rows"></div>
                <button class="btn btn-sm" data-raster-add-gcp
                    style="margin-top:8px;">+ ${escapeHtml(t('rasterUpload.addPoint'))}</button>
                <div id="raster-rms-display" style="margin-top:12px;padding:8px;
                    background:var(--bg-secondary,#313244);border-radius:4px;font-size:13px;
                    color:var(--text-primary,#cdd6f4);display:none;">
                    ${escapeHtml(t('rasterUpload.rmsError'))}: <span id="raster-rms-value">--</span>
                </div>
            </div>
            </div>
            <div class="ecbt-dialog-footer" style="display:flex;gap:8px;justify-content:flex-end;">
                <div style="display:flex;align-items:center;gap:6px;font-size:12px;
                    color:var(--text-secondary,#a6adc8);">
                    <label for="raster-interval-input">${escapeHtml(t('rasterUpload.contourInterval'))}:</label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:rasterUploadModal:interval"
                        type="number" id="raster-interval-input" value="5" min="0.1" step="0.1"
                        style="width:60px;height:26px;font-size:12px;"
                        aria-label="${t('rasterUpload.contourInterval')}"
                        data-raster-interval />
                    <span>m</span>
                </div>
                <button class="btn btn-secondary" data-raster-georef
                    id="raster-georef-btn" disabled>
                    ${escapeHtml(t('rasterUpload.georeference'))}
                </button>
                <button class="btn btn-primary" data-raster-extract
                    id="raster-extract-btn" disabled>
                    ${escapeHtml(t('rasterUpload.extract'))}
                </button>
                <button class="btn btn-outline" data-raster-export
                    id="raster-export-btn" disabled>
                    ${escapeHtml(t('rasterUpload.exportGeoJSON'))}
                </button>
            </div>
        </div>`;
    _attachDropEvents(modal);
    _attachActionEvents(modal);
    return modal;
}
/**
 * Substitui inline onclick/onchange (XSS) por addEventListener + AbortController.
 * Listener cleanup automático via signal quando o modal é descartado.
 */
function _attachActionEvents(modal: any) {
    const controller = new AbortController();
    const { signal } = controller;
    (modal as any)._actionAbort = controller;
    const w = window as any;
    const wire = (sel: string, ev: string, fn: (target: any) => void) => {
        modal.querySelectorAll(sel).forEach((el: any) =>
            el.addEventListener(ev, () => fn(el), { signal }),
        );
    };
    wire('[data-raster-close]', 'click', () => w.handleCloseRasterUpload?.());
    wire('[data-raster-add-gcp]', 'click', () => w.handleRasterAddGCP?.());
    wire('[data-raster-georef]', 'click', () => w.handleGeoreferenceRaster?.());
    wire('[data-raster-extract]', 'click', () => w.handleExtractContours?.());
    wire('[data-raster-export]', 'click', () => w.handleExportContoursGeoJSON?.());
    wire('[data-raster-interval]', 'change', (el) => {
        const n = parseFloat(el.value);
        if (Number.isFinite(n) && n > 0) _state.contourInterval = n;
    });
}
/**
 * Attach drag-drop and file input events.
 * @param {HTMLElement} modal
 */
function _attachDropEvents(modal: any) {
    const zone = (modal.querySelector('#raster-drop-zone')) as any;
    const input = (modal.querySelector('#raster-file-input')) as any;
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e: any) => {
        e.preventDefault();
        zone.style.borderColor = 'var(--accent-color,#89b4fa)';
    });
    zone.addEventListener('dragleave', () => {
        zone.style.borderColor = 'var(--border-color,#585b70)';
    });
    zone.addEventListener('drop', (e: any) => {
        e.preventDefault();
        zone.style.borderColor = 'var(--border-color,#585b70)';
        const file = e.dataTransfer?.files?.[0];
        if (file)
            _handleFile(file);
    });
    input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (file)
            _handleFile(file);
    });
}
/**
 * Handle uploaded image file.
 * @param {File} file
 */
function _handleFile(file: any) {
    if (!file.type.startsWith('image/')) {
        showToast(t('rasterUpload.invalidFile'), 'error');
        return;
    }
    _revokePreview();
    _state.imageName = file.name;
    _state.previewUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        _state.imageWidth = img.naturalWidth;
        _state.imageHeight = img.naturalHeight;
        _loadImageData(img);
        _updateUI();
        log.info('Raster loaded', { name: file.name, w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
        showToast(t('rasterUpload.loadError'), 'error');
        log.error('Failed to load raster image');
    };
    img.src = _state.previewUrl;
}
/**
 * Extract RGBA pixel data from an Image element.
 * @param {HTMLImageElement} img
 */
function _loadImageData(img: any) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = (canvas.getContext('2d')) as CanvasRenderingContext2D;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    _state.imageData = data.data;
}
/**
 * Add an empty control point row.
 */
export function addControlPoint() {
    if (_state.controlPoints.length >= MAX_CONTROL_POINTS) {
        showToast(t('rasterUpload.maxPoints'), 'warn');
        return;
    }
    _state.controlPoints.push({
        pixel: { x: 0, y: 0 },
        geo: { easting: 0, northing: 0 },
    });
    _renderControlPointRows();
    _updateButtons();
}
/**
 * Remove a control point by index.
 * @param {number} idx
 */
export function removeControlPoint(idx: any) {
    _state.controlPoints.splice(idx, 1);
    _state.affineMatrix = null;
    _renderControlPointRows();
    _updateButtons();
}
/**
 * Run affine georeferencing from current control points.
 * @returns {boolean}
 */
export function georeference() {
    _readControlPointInputs();
    const check = validateControlPoints(_state.controlPoints);
    if (!check.valid) {
        showToast(check.error || '', 'error');
        return false;
    }
    const matrix = solveAffineMatrix(_state.controlPoints);
    if (!matrix) {
        showToast(t('rasterUpload.solveFailed'), 'error');
        return false;
    }
    _state.affineMatrix = matrix;
    _state.rmsError = calculateRMSError(matrix, _state.controlPoints);
    const rmsEl = (document.getElementById('raster-rms-value')) as any;
    const rmsBox = (document.getElementById('raster-rms-display')) as any;
    if (rmsEl)
        rmsEl.textContent = _state.rmsError.toFixed(4);
    if (rmsBox)
        rmsBox.style.display = 'block';
    _updateButtons();
    _saveState();
    showToast(t('rasterUpload.georeferenced'), 'success');
    log.info('Georeferencing complete', { rms: _state.rmsError });
    return true;
}
/**
 * Extract contours from the loaded raster and create isoline elements
 * in the 3D scene (G3 Phase 1 - RANDOM-001 follow-up, Sprint C C2).
 *
 * Each extracted edge chain becomes a generic element with type='isoline'
 * containing the polyline geometry transformed via the affine matrix.
 *
 * @returns {any}
 */
export function extractContoursFromRaster() {
    if (!_state.imageData || !_state.affineMatrix) {
        showToast(t('rasterUpload.needGeoref'), 'error');
        return null;
    }
    const result = extractContours(_state.imageData, _state.imageWidth, _state.imageHeight, {
        edgeThreshold: 30,
        minChainLength: 10,
        levelCount: 10,
    });
    _state.contours = result;
    // Assign elevation levels by chain order using contour interval
    const interval = _state.contourInterval > 0 ? _state.contourInterval : 5;
    const chainsWithLevels = assignContourLevels(result.edges, {
        levelFn: (_chain: any, idx: any) => idx * interval,
    });
    // Georeference chains to 3D polylines (x=easting, y=elevation, z=northing)
    const raw3D = georeferenceContours(chainsWithLevels, _state.affineMatrix);
    _state.georefPolylines = simplifyContours(raw3D, 0.5);
    _saveState();
    const created = _createIsolineElements3D(_state.georefPolylines);
    // Enable GeoJSON export
    const exportBtn = (document.getElementById('raster-export-btn')) as any;
    if (exportBtn)
        exportBtn.disabled = false;
    showToast(`${t('rasterUpload.extracted')}: ${result.edges.length} ${t('rasterUpload.edgeChains')}, ${created} ${t('rasterUpload.elementsCreated')}`, 'success');
    log.info('Contours extracted + georeferenced', {
        edgeChains: result.edges.length,
        polylines: _state.georefPolylines.length,
        elementsCreated: created,
    });
    return result;
}
/**
 * Create isoline elements from pre-built 3D polylines (output of georeferenceContours).
 * Points already in { x: easting, y: elevation, z: northing } form - origin-relative only.
 *
 * @param {Array<{points:Array<{x:number,y:number,z:number}>, elevation:number, id?:string}>} polylines
 * @returns {number} Number of elements created
 * @private
 */
function _createIsolineElements3D(polylines: any) {
    if (!hasOrigin()) {
        log.warn('Cannot create isoline elements: no origin set');
        return 0;
    }
    const origin = /** @type {{ easting: number, northing: number }} */ (getOrigin());
    let count = 0;
    const ts = Date.now();
    for (let i = 0; i < polylines.length && i < 50; i++) {
        const poly = polylines[i];
        if (!poly || !Array.isArray(poly.points) || poly.points.length < 3)
            continue;
        // Shift to scene origin; y = elevation (preserved from georef)
        const points = poly.points.map((p: any) => ({
            x: p.x - origin.easting,
            y: p.y,
            z: -(p.z - origin.northing)
        }));
        const id = `isoline-raster-${ts}-${i}`;
        try {
            addElement('generic', id, `Isoline ${i + 1}`, {
                subtype: 'isoline',
                source: 'rasterUpload',
                pointCount: points.length,
                polyline: points,
                elevation: poly.elevation,
                style: { color: '#4a9eff', lineWidth: 2 },
            });
            count++;
        }
        catch (err: any) {
            log.warn(`Failed to create isoline element ${i}:`, /** @type {any} */ (err).message);
        }
    }
    return count;
}
/**
 * Export georeferenced contours as GeoJSON and trigger download.
 */
export function exportContoursGeoJSON() {
    if (!_state.georefPolylines || _state.georefPolylines.length === 0) {
        showToast(t('rasterUpload.noContoursToExport'), 'warn');
        return;
    }
    const geojson = exportContoursAsGeoJSON(_state.georefPolylines, { crs: 'EPSG:UTM' });
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contours-${_state.imageName || 'raster'}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(t('rasterUpload.exportedGeoJSON'), 'success');
    log.info('Contours exported as GeoJSON', { features: (geojson as any).features.length });
}
/**
 * Render control point input rows in the modal.
 */
function _renderControlPointRows() {
    const container = (document.getElementById('raster-gcp-rows')) as any;
    if (!container)
        return;
    container.innerHTML = '';
    for (let i = 0; i < _state.controlPoints.length; i++) {
        const p = _state.controlPoints[i] as any;
        const row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:30px 1fr 1fr 1fr 1fr 40px;gap:4px;margin-bottom:4px;';
        row.innerHTML = `
            <span style="line-height:28px;color:var(--text-secondary,#a6adc8);font-size:12px;">${i + 1}</span>
            <input data-field-meta="true" data-field-meta-key="auto-pos:rasterUploadModal:input:L385" type="number" class="raster-gcp-px" data-idx="${i}" value="${p.pixel.x}"
                step="1" style="height:28px;font-size:12px;" aria-label="${t('rasterUpload.pixelX', { index: i + 1 })}" />
            <input data-field-meta="true" data-field-meta-key="auto-pos:rasterUploadModal:input:L387" type="number" class="raster-gcp-py" data-idx="${i}" value="${p.pixel.y}"
                step="1" style="height:28px;font-size:12px;" aria-label="${t('rasterUpload.pixelY', { index: i + 1 })}" />
            <input data-field-meta="true" data-field-meta-key="auto-pos:rasterUploadModal:input:L389" type="number" class="raster-gcp-e" data-idx="${i}" value="${p.geo.easting}"
                step="0.01" style="height:28px;font-size:12px;" aria-label="${t('rasterUpload.easting', { index: i + 1 })}" />
            <input data-field-meta="true" data-field-meta-key="auto-pos:rasterUploadModal:input:L391" type="number" class="raster-gcp-n" data-idx="${i}" value="${p.geo.northing}"
                step="0.01" style="height:28px;font-size:12px;" aria-label="${t('rasterUpload.northing', { index: i + 1 })}" />
            <button class="btn-icon" data-raster-remove-gcp="${i}"
                aria-label="${t('rasterUpload.removePoint', { index: i + 1 })}" title="${t('common.remove')}">&times;</button>`;
        container.appendChild(row);
    }
    // Event delegation: 1 listener no container cobre todas as rows (incl. dinamicamente adicionadas).
    if (!(container as any)._delegatedRemove) {
        container.addEventListener('click', (ev: any) => {
            const btn = ev.target?.closest?.('[data-raster-remove-gcp]');
            if (!btn) return;
            const idx = parseInt(btn.getAttribute('data-raster-remove-gcp'), 10);
            const fn = (window as any).handleRasterRemoveGCP;
            if (typeof fn === 'function' && Number.isFinite(idx)) fn(idx);
        });
        (container as any)._delegatedRemove = true;
    }
}
/**
 * Read current input values into the state.
 */
function _readControlPointInputs() {
    const modal = (document.getElementById(MODAL_ID)) as any;
    if (!modal)
        return;
    const pxInputs = (modal.querySelectorAll('.raster-gcp-px')) as any;
    const pyInputs = (modal.querySelectorAll('.raster-gcp-py')) as any;
    const eInputs = (modal.querySelectorAll('.raster-gcp-e')) as any;
    const nInputs = (modal.querySelectorAll('.raster-gcp-n')) as any;
    for (let i = 0; i < _state.controlPoints.length; i++) {
        const controlPoint = _state.controlPoints[i] as any;
        if (!controlPoint)
            continue;
        if (pxInputs[i])
            controlPoint.pixel.x = Number(pxInputs[i].value) || 0;
        if (pyInputs[i])
            controlPoint.pixel.y = Number(pyInputs[i].value) || 0;
        if (eInputs[i])
            controlPoint.geo.easting = Number(eInputs[i].value) || 0;
        if (nInputs[i])
            controlPoint.geo.northing = Number(nInputs[i].value) || 0;
    }
}
/**
 * Update modal UI visibility based on state.
 */
function _updateUI() {
    const preview = (document.getElementById('raster-preview')) as any;
    const img = (document.getElementById('raster-preview-img')) as any;
    const info = (document.getElementById('raster-file-info')) as any;
    const gcpSection = (document.getElementById('raster-gcp-section')) as any;
    const dropZone = (document.getElementById('raster-drop-zone')) as any;
    if (_state.previewUrl && preview && img) {
        preview.style.display = 'block';
        img.src = _state.previewUrl;
        if (info) {
            info.textContent = `${escapeHtml(_state.imageName)} (${_state.imageWidth} x ${_state.imageHeight})`;
        }
        if (dropZone)
            dropZone.style.display = 'none';
        if (gcpSection)
            gcpSection.style.display = 'block';
    }
    else {
        if (preview)
            preview.style.display = 'none';
        if (dropZone)
            dropZone.style.display = 'block';
        if (gcpSection)
            gcpSection.style.display = 'none';
    }
    _updateButtons();
}
/**
 * Update button enabled/disabled state.
 */
function _updateButtons() {
    const georefBtn = (document.getElementById('raster-georef-btn')) as any;
    const extractBtn = (document.getElementById('raster-extract-btn')) as any;
    const exportBtn = (document.getElementById('raster-export-btn')) as any;
    const hasImage = !!_state.imageData;
    const hasEnoughPts = _state.controlPoints.length >= MIN_CONTROL_POINTS;
    if (georefBtn)
        georefBtn.disabled = !(hasImage && hasEnoughPts);
    if (extractBtn)
        extractBtn.disabled = !_state.affineMatrix;
    if (exportBtn)
        exportBtn.disabled = !_state.georefPolylines;
}
/**
 * Save georef state to IndexedDB for persistence.
 */
async function _saveState() {
    try {
        await idbSet(IDB_KEY, {
            controlPoints: _state.controlPoints,
            affineMatrix: _state.affineMatrix,
            rmsError: _state.rmsError,
            imageName: _state.imageName,
        });
    }
    catch (err: any) {
        log.warn('Failed to save raster georef state', /** @type {any} */ (err).message);
    }
}
/**
 * Revoke object URL to free memory.
 */
function _revokePreview() {
    if (_state.previewUrl) {
        URL.revokeObjectURL(_state.previewUrl);
        _state.previewUrl = null;
    }
}
/**
 * Reset state to initial values.
 */
function _resetState() {
    _revokePreview();
    _state.imageData = null;
    _state.imageWidth = 0;
    _state.imageHeight = 0;
    _state.imageName = '';
    _state.controlPoints = [];
    _state.affineMatrix = null;
    _state.rmsError = Infinity;
    _state.contours = null;
    _state.georefPolylines = null;
    _state.contourInterval = 5;
}
// Exposed as window._rasterSetInterval (called from modal HTML inline onchange)
if (typeof window !== 'undefined') {
    window._rasterSetInterval = (val: any) => {
        const n = parseFloat(val);
        if (Number.isFinite(n) && n > 0)
            _state.contourInterval = n;
    };
}
