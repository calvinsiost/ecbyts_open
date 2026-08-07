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
   INTERPOLATION HANDLERS — UI e ações do módulo de interpolação
   Handlers para criação/gestão de camadas interpoladas (terreno,
   nível d'água, contaminação, etc.)

   Padrão: exporta interpolationHandlers + setInterpolationHandlerUpdateAllUI
   ================================================================ */
import { getAllLayers, getLayer, removeLayer, updateLayer, createTerrainLayer, createWaterTableLayer, createContaminationLayer, createGeologyLayer, getAvailableSoilTypes, createPotentiometricMap, createPlumeFromCampaign, recomputeLayer, setLayerThreshold, GRID_SIZES, getLayerMesh, getSelectedLayer, setSelectedLayer, applyTerrainElevationToElements, } from '../../core/interpolation/manager.js';
import { INTERPOLATION_METHODS } from '../../core/interpolation/engine.js';
import { getRampNames } from '../../core/interpolation/colorRamps.js';
import { TOPOGRAPHY_INPUT_LIMITS, normalizeTopographyPoints } from '../../core/interpolation/topographyInput.js';
import { getIcon } from '../ui/icons.js';
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { escapeHtml } from '../helpers/html.js';
import { setSelectedElement, getAllElements } from '../../core/elements/manager.js';
import { highlightMesh, clearHighlight } from '../scene/picker.js';
import { highlightSelectedLayer } from '../ui/lists.js';
import { requestRender } from '../scene/setup.js';
import { setSelectedVolume } from '../../core/voxel/manager.js';
import { CONFIG } from '../../config.js';
import { hasOrigin, getOrigin } from '../../core/io/geo/coordinates.js';
import { createLogger } from '../helpers/logger.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
/**
 * @typedef {import('../../core/interpolation/manager.js' as string).InterpolationLayer} InterpolationLayer
 * @typedef {import('../../core/interpolation/manager.js' as string).SoilTypeAvailability} SoilTypeAvailability
 * @typedef {{ validCount: number, ignoredCount: number, truncatedCount: number, rawPoints: unknown[] }} TerrainManualSummary
 * @typedef {{ message?: string, isError?: boolean }} SummaryOptions
 */
const log = createLogger('Interpolation');
let _requestUIRefresh: any = null;
const CONTOUR_UI_TYPES = new Set(['water_table', 'terrain', 'contamination']);
const TERRAIN_MANUAL_SUMMARY_ID = 'interpolation-terrain-manual-summary';
const TERRAIN_MANUAL_UPLOAD_NAME_ID = 'interpolation-terrain-upload-name';
const INTERPOLATION_EXIT_BTN_ID = 'interpolation-exit-btn';
function _isInterpolationModalOpen() {
    const modal = document.getElementById('interpolation-modal');
    return !!modal?.classList.contains('visible');
}
/** @param {boolean} enabled */
function _ensureInterpolationExitButton( enabled: any) {
    const existing = document.getElementById(INTERPOLATION_EXIT_BTN_ID);
    if (!enabled) {
        if (existing)
            existing.remove();
        return;
    }
    if (existing)
        return;
    const btn = document.createElement('button');
    btn.id = INTERPOLATION_EXIT_BTN_ID;
    btn.type = 'button';
    btn.className = 'interpolation-exit-btn';
    btn.textContent = t('interpolation.exitButton');
    btn.title = t('interpolation.exitTooltip');
    btn.addEventListener('click', () => {
        handleCloseInterpolationPanel();
    });
    document.body.appendChild(btn);
}
/** @param {(() => void)|null} fn */
export function setInterpolationHandlerUpdateAllUI( fn: any) {
    _requestUIRefresh = fn;
}
function requestInterpolationUIRefresh(reason = 'interpolation.changed') {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.INTERPOLATION,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains)
        _requestUIRefresh(domain, reason);
}
// ----------------------------------------------------------------
// MODAL OPEN/CLOSE
// ----------------------------------------------------------------
function handleOpenInterpolationPanel() {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled
    // (zero mudança de comportamento); só gateia se desativado explicitamente.
    if (!isCapabilityEnabled('interpolation')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Interpolação está desativada no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    const modal = document.getElementById('interpolation-modal');
    if (!modal)
        return;
    modal.classList.add('visible');
    _ensureInterpolationExitButton(true);
    _refreshContaminationParameterSelect();
    _refreshGeologySoilTypeSelect();
    _renderInterpolationModal();
}
function handleCloseInterpolationPanel() {
    const modal = document.getElementById('interpolation-modal');
    if (modal)
        modal.classList.remove('visible');
    _ensureInterpolationExitButton(false);
}
if (!window.__ecbytsInterpolationEscBound) {
    document.addEventListener('keydown', (e: any) => {
        if (e.key !== 'Escape')
            return;
        if (!_isInterpolationModalOpen())
            return;
        e.preventDefault();
        handleCloseInterpolationPanel();
    }, true);
    window.__ecbytsInterpolationEscBound = true;
}
// ----------------------------------------------------------------
// CREATE LAYERS
// ----------------------------------------------------------------
async function handleAddTerrainLayer() {
    try {
        const gridSize = _getSelectedGridSize();
        await createTerrainLayer({ dataSource: 'auto', gridSize });
        applyTerrainElevationToElements();
        _renderInterpolationModal();
    }
    catch (err: any) {
        log.error('Failed to create terrain layer', _errorMessage(err));
    }
}
function _getSelectedTerrainCoordinateMode() {
    const select = (document.getElementById('interpolation-terrain-coordinate-mode'));
    return select?.value === 'utm' ? 'utm' : 'scene';
}
/**
 * @param {TerrainManualSummary|null} summary
 * @param {SummaryOptions} [opts]
 */
function _setTerrainManualSummary( summary: any, opts: any = {}) {
    const el = document.getElementById(TERRAIN_MANUAL_SUMMARY_ID);
    if (!el)
        return;
    if (!summary && !opts.message) {
        el.textContent = '';
        el.style.color = '';
        return;
    }
    if (!summary) {
        el.textContent = opts.message || '';
        el.style.color = opts.isError ? '#d9534f' : '';
        return;
    }
    const message = opts.message ||
        `Validos: ${summary.validCount} | Ignorados: ${summary.ignoredCount}` +
            (summary.truncatedCount > 0 ? ` | Limite aplicado: ${TOPOGRAPHY_INPUT_LIMITS.maxPoints}` : '');
    el.textContent = message;
    el.style.color = opts.isError ? '#d9534f' : '';
}
/** @param {string} fileName */
function _setTerrainManualUploadName( fileName: any) {
    const el = document.getElementById(TERRAIN_MANUAL_UPLOAD_NAME_ID);
    if (!el)
        return;
    el.textContent = fileName || '';
}
/**
 * @param {unknown} rawInput
 * @param {'utm'|'scene'} coordinateMode
 * @returns {TerrainManualSummary}
 */
function _normalizeManualTopographyInput( rawInput: any, coordinateMode: any) {
    if (coordinateMode === 'utm' && !hasOrigin()) {
        throw new Error('Origem UTM obrigatoria para terreno manual em modo UTM.');
    }
    return normalizeTopographyPoints(rawInput, {
        coordinateMode,
        origin: coordinateMode === 'utm' ? getOrigin() : null,
        maxPoints: TOPOGRAPHY_INPUT_LIMITS.maxPoints,
        tolerance: TOPOGRAPHY_INPUT_LIMITS.dedupeTolerance,
    });
}
/**
 * @param {File} file
 * @param {'utm'|'scene'} coordinateMode
 * @returns {Promise<TerrainManualSummary>}
 */
async function _parseManualTopographyFromFile( file: any, coordinateMode: any) {
    const ext = String(file?.name || '')
        .split('.')
        .pop()
        ?.toLowerCase();
    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
        const text = await file.text();
        return _normalizeManualTopographyInput(text, coordinateMode);
    }
    try {
        const { parseFile } = await import('../../core/ingestion/parser.js' as string);
        const parsed = await parseFile(file);
        const firstSheet = parsed?.sheets?.[0];
        const rows = Array.isArray(firstSheet?.rows) ? firstSheet.rows : [];
        return _normalizeManualTopographyInput(rows, coordinateMode);
    }
    catch (err: any) {
        const message = _errorMessage(err);
        if (/SheetJS|XLSX|cdnjs|CDN/i.test(message)) {
            throw new Error('Falha ao ler XLSX. Converta para CSV e tente novamente.', { cause: err });
        }
        throw err;
    }
}
/**
 * @param {TerrainManualSummary} summary
 * @param {'utm'|'scene'} coordinateMode
 */
function _terrainManualCreateOpts( summary: any, coordinateMode: any) {
    return {
        dataSource: 'manual',
        coordinateMode,
        dataPoints: summary.rawPoints,
        method: _getSelectedMethod(),
        gridSize: _getSelectedGridSize(),
    };
}
async function handleAddTerrainLayerManualFromPaste() {
    const input = (document.getElementById('interpolation-terrain-manual-input'));
    const text = String(input?.value || '').trim();
    if (!text) {
        _setTerrainManualSummary(null, { message: 'Cole os pontos de topografia primeiro.', isError: true });
        showToast(t('interpolation.pasteTopographyFirst'), 'warning');
        return;
    }
    try {
        const coordinateMode = _getSelectedTerrainCoordinateMode();
        const summary = _normalizeManualTopographyInput(text, coordinateMode);
        _setTerrainManualSummary(summary);
        if (summary.validCount < 2) {
            showToast(t('interpolation.minTwoPoints'), 'warning');
            return;
        }
        await createTerrainLayer(_terrainManualCreateOpts(summary, coordinateMode));
        applyTerrainElevationToElements();
        showToast(t('interpolation.manualTerrainCreatedPaste'), 'success');
        _renderInterpolationModal();
    }
    catch (err: any) {
        _setTerrainManualSummary(null, { message: _errorMessage(err), isError: true });
        log.error('Manual terrain paste failed', _errorMessage(err));
        showToast(_errorMessage(err), 'error');
    }
}
async function handleTerrainManualUploadChange() {
    const input = (document.getElementById('interpolation-terrain-upload'));
    const file = input?.files?.[0];
    _setTerrainManualUploadName(file?.name || '');
    _setTerrainManualSummary(null);
    if (!file)
        return;
    try {
        const coordinateMode = _getSelectedTerrainCoordinateMode();
        const summary = await _parseManualTopographyFromFile(file, coordinateMode);
        _setTerrainManualSummary(summary);
    }
    catch (err: any) {
        _setTerrainManualSummary(null, { message: _errorMessage(err), isError: true });
        log.error('Manual terrain upload preview failed', _errorMessage(err));
        showToast(_errorMessage(err), 'error');
    }
}
async function handleAddTerrainLayerManualFromUpload() {
    const input = (document.getElementById('interpolation-terrain-upload'));
    const file = input?.files?.[0];
    if (!file) {
        _setTerrainManualSummary(null, { message: 'Selecione um arquivo de topografia.', isError: true });
        showToast(t('interpolation.selectTopographyFile'), 'warning');
        return;
    }
    try {
        const coordinateMode = _getSelectedTerrainCoordinateMode();
        const summary = await _parseManualTopographyFromFile(file, coordinateMode);
        _setTerrainManualSummary(summary);
        if (summary.validCount < 2) {
            showToast(t('interpolation.minTwoPoints'), 'warning');
            return;
        }
        await createTerrainLayer(_terrainManualCreateOpts(summary, coordinateMode));
        applyTerrainElevationToElements();
        showToast(t('interpolation.manualTerrainCreatedFile', { fileName: file.name }), 'success');
        _renderInterpolationModal();
    }
    catch (err: any) {
        _setTerrainManualSummary(null, { message: _errorMessage(err), isError: true });
        log.error('Manual terrain upload create failed', _errorMessage(err));
        showToast(_errorMessage(err), 'error');
    }
}
async function handleAddWaterTableLayer() {
    try {
        const gridSize = _getSelectedGridSize();
        const method = _getSelectedMethod();
        await createWaterTableLayer({ gridSize, method });
        _renderInterpolationModal();
    }
    catch (err: any) {
        log.error('Failed to create water table layer', _errorMessage(err));
    }
}
/** @param {string} parameterId */
async function handleAddContaminationLayer( parameterId: any) {
    if (!parameterId) {
        showToast(t('interpolation.selectParameter'), 'warning');
        return;
    }
    try {
        const gridSize = _getSelectedGridSize();
        const method = _getSelectedMethod();
        const matrix = _getSelectedMatrix();
        await createContaminationLayer(parameterId, { gridSize, method, matrix });
        _renderInterpolationModal();
    }
    catch (err: any) {
        log.error('Failed to create contamination layer', _errorMessage(err));
    }
}
function handleMatrixFilterChange() {
    _refreshContaminationParameterSelect();
}
// ----------------------------------------------------------------
// LAYER ACTIONS
// ----------------------------------------------------------------
/** @param {string} id */
function handleRemoveInterpolationLayer( id: any) {
    removeLayer(id);
    _renderInterpolationModal();
}
/** @param {string} id */
function handleToggleInterpolationLayer( id: any) {
    const layer = getLayer(id);
    if (!layer)
        return;
    updateLayer(id, { visible: !layer.visible });
    _renderInterpolationModal();
}
/**
 * @param {string} id
 * @param {string} method
 */
function handleChangeInterpolationMethod( id: any, method: any) {
    updateLayer(id, { method });
}
/**
 * CC-S1 B3 artesanal (CCC-001 Fase 11) — wrapper "muda método e recalcula"
 * usado pelo select do card de camada (era multi-call inline).
 */
function handleChangeInterpolationMethodAndRefresh(id: any, method: any) {
    handleChangeInterpolationMethod(id, method);
    void handleRefreshInterpolationLayer(id);
}
/**
 * @param {string} id
 * @param {string} value
 */
function handleChangeInterpolationOpacity( id: any, value: any) {
    const opacity = parseFloat(value);
    if (!isNaN(opacity))
        updateLayer(id, { opacity: Math.max(0, Math.min(1, opacity)) });
}
/**
 * @param {string} id
 * @param {string} rampName
 */
function handleChangeInterpolationColorRamp( id: any, rampName: any) {
    updateLayer(id, { colorRamp: rampName });
    // Recompute necessário para atualizar vertex colors
    recomputeLayer(id);
}
/**
 * @param {string} id
 * @param {string} colsStr
 */
function handleChangeInterpolationGridSize( id: any, colsStr: any) {
    const cols = parseInt(colsStr, 10);
    if (isNaN(cols))
        return;
    updateLayer(id, { gridSize: { cols, rows: cols } });
    recomputeLayer(id);
}
/** @param {string} id */
async function handleRefreshInterpolationLayer( id: any) {
    const layer = getLayer(id);
    if (!layer)
        return;
    await recomputeLayer(id);
    if (layer.type === 'terrain') {
        applyTerrainElevationToElements();
    }
    _renderInterpolationModal();
}
/** @param {string} id */
function handleToggleWireframe( id: any) {
    const layer = getLayer(id);
    if (!layer)
        return;
    updateLayer(id, { wireframe: !layer.wireframe });
    _renderInterpolationModal();
}
/**
 * @param {string} id
 * @param {string} mode
 */
function handleChangeInterpolationTexture( id: any, mode: any) {
    updateLayer(id, { textureMode: mode });
    _renderInterpolationModal();
}
/**
 * D6: Upload de imagem aerea local como overlay no terreno.
 * Cria Blob URL da imagem e aplica como textura no mesh.
 *
 * @param {string} id - layer ID
 * @param {File} file - imagem (JPG, PNG, etc.)
 */
async function handleUploadTerrainOverlay( id: any, file: any) {
    if (!file || !file.type.startsWith('image/')) {
        const { showToast } = await import('../ui/toast.js' as string);
        showToast(t('interpolation.selectImageFile'), 'error');
        return;
    }
    const layer = getLayer(id);
    if (!layer?.mesh)
        return;
    // Cria Blob URL para a imagem local
    const blobUrl = URL.createObjectURL(file);
    // Aplica como textura via surfaceBuilder
    const { applySatelliteTexture } = await import('../../core/interpolation/surfaceBuilder.js' as string);
    applySatelliteTexture(layer.mesh, [blobUrl]);
    // Salva referencia no layer para persistencia
    updateLayer(id, { textureMode: 'custom', customOverlayName: file.name });
    const { showToast } = await import('../ui/toast.js' as string);
    showToast(t('interpolation.imageApplied', { fileName: file.name }), 'success');
    _renderInterpolationModal();
}
/**
 * Atualiza o threshold de isosurface de uma layer de contaminação.
 * Reconstrói o mesh sem reinterpolação.
 * @param {string} id - Layer ID
 * @param {string} valueStr - Valor como string (vindo do input)
 */
function handleSetLayerThreshold( id: any, valueStr: any) {
    const value = valueStr === '' ? null : parseFloat(valueStr);
    setLayerThreshold(id, value != null && isNaN(value) ? null : value);
    _renderInterpolationModal();
}
/** @param {string} id */
function handleToggleInterpolationContours( id: any) {
    const layer = getLayer(id);
    if (!layer || !_supportsContourUI(layer))
        return;
    updateLayer(id, { showContours: !layer.showContours });
    _renderInterpolationModal();
}
/**
 * @param {string} id
 * @param {string} density
 */
function handleChangeInterpolationContourDensity( id: any, density: any) {
    const layer = getLayer(id);
    if (!layer || !_supportsContourUI(layer))
        return;
    updateLayer(id, { contourDensity: density });
    _renderInterpolationModal();
}
/** @param {string} id */
function handleToggleInterpolationContourLabels( id: any) {
    const layer = getLayer(id);
    if (!layer || !_supportsContourUI(layer))
        return;
    updateLayer(id, { showContourLabels: !layer.showContourLabels });
    _renderInterpolationModal();
}
// ----------------------------------------------------------------
// RENDER MODAL
// ----------------------------------------------------------------
function _renderInterpolationModal() {
    const container = document.getElementById('interpolation-layers-list');
    if (!container)
        return;
    _refreshContaminationParameterSelect();
    _refreshGeologySoilTypeSelect();
    const layers = getAllLayers();
    if (layers.length === 0) {
        container.innerHTML = `
            <div class="interpolation-empty">
                ${getIcon('layers', { size: '32px' })}
                <p>${t('interpolationNoLayers') || 'Nenhuma camada de interpolação. Use os botões acima para criar.'}</p>
            </div>`;
        return;
    }
    container.innerHTML = layers.map((l: any) => _renderLayerCard(l)).join('');
}
/** @param {InterpolationLayer} layer */
function _renderLayerCard( layer: any) {
    const typeLabels = {
        terrain: t('interpolation.typeTerrain'),
        water_table: t('interpolation.typeWaterTable'),
        contamination: t('interpolation.typeContamination'),
        geology: t('interpolation.typeGeology'),
        custom: t('interpolation.typeCustom'),
    };
    const typeColors = {
        terrain: '#4caf50',
        water_table: '#2196f3',
        contamination: '#f44336',
        geology: '#795548',
        custom: '#9e9e9e',
    };
    const methodOptions = Object.values(INTERPOLATION_METHODS)
        .map((m: any) => `<option value="${m.id}" ${layer.method === m.id ? 'selected' : ''}>${m.name}</option>`)
        .join('');
    const gridOptions = GRID_SIZES.map((g: any) => `<option value="${g.cols}" ${layer.gridSize.cols === g.cols ? 'selected' : ''}>${g.label}</option>`).join('');
    const rampOptions = getRampNames()
        .map((name: any) => `<option value="${name}" ${layer.colorRamp === name ? 'selected' : ''}>${name}</option>`)
        .join('');
    const stats = layer.stats
        ? `<span class="interpolation-stats">${t('interpolation.stats', { min: layer.stats.min.toFixed(1), max: layer.stats.max.toFixed(1), mean: layer.stats.mean.toFixed(1) })}</span>`
        : '';
    return `
    <div class="interpolation-card ${layer.visible ? '' : 'interpolation-card-hidden'}">
        <div class="interpolation-card-header">
            <span class="interpolation-type-badge" style="background:${(typeColors as any)[layer.type] || '#9e9e9e'}">
                ${escapeHtml((typeLabels as any)[layer.type] || layer.type)}
            </span>
            <span class="interpolation-card-name">${escapeHtml(layer.name)}</span>
            <div class="interpolation-card-actions">
                <button data-cc-call-click="handleToggleInterpolationLayer|s:${encodeURIComponent(`${layer.id}`)}" title="${layer.visible ? t('common.hide') : t('common.show')}">
                    ${getIcon(layer.visible ? 'eye' : 'eye-off', { size: '14px' })}
                </button>
                <button data-cc-call-click="handleToggleWireframe|s:${encodeURIComponent(`${layer.id}`)}" title="${t('interpolation.wireframeTooltip')}" class="${layer.wireframe ? 'active' : ''}">
                    ${getIcon('grid', { size: '14px' })}
                </button>
                <button data-cc-call-click="handleRefreshInterpolationLayer|s:${encodeURIComponent(`${layer.id}`)}" title="${t('interpolation.recalculateTooltip')}">
                    ${getIcon('refresh-cw', { size: '14px' })}
                </button>
                <button data-cc-call-click="handleRemoveInterpolationLayer|s:${encodeURIComponent(`${layer.id}`)}" title="${t('common.remove')}" class="btn-danger-subtle">
                    ${getIcon('trash-2', { size: '14px' })}
                </button>
            </div>
        </div>
        <div class="interpolation-card-body">
            <label>
                ${t('interpolation.methodLabel')}
                <select data-field-meta="true" data-field-meta-key="auto-pos:interpolation:select:L534" data-cc-call-change="handleChangeInterpolationMethod|s:${encodeURIComponent(`${layer.id}`)}|v">
                    ${methodOptions}
                </select>
            </label>
            <label>
                ${t('interpolation.resolutionLabel')}
                <select data-field-meta="true" data-field-meta-key="auto-pos:interpolation:select:L540" data-cc-call-change="handleChangeInterpolationGridSize|s:${encodeURIComponent(`${layer.id}`)}|v">
                    ${gridOptions}
                </select>
            </label>
            ${layer.fixedColor
        ? `<label style="display:flex;align-items:center;gap:8px;">
                    Cor
                    <span style="display:inline-block;width:24px;height:24px;border-radius:4px;background:${escapeHtml(layer.fixedColor)};border:1px solid rgba(255,255,255,0.3);vertical-align:middle;"></span>
                    <span style="font-size:11px;opacity:0.7;">${escapeHtml(layer.parameterId || '')}</span>
                   </label>`
        : `<label>
                    Paleta
                    <select data-field-meta="true" data-field-meta-key="auto-pos:interpolation:select:L553" data-cc-call-change="handleChangeInterpolationColorRamp|s:${encodeURIComponent(`${layer.id}`)}|v">
                        ${rampOptions}
                    </select>
                   </label>`}
            <label>
                Opacidade
                <input data-field-meta="true" data-field-meta-key="auto-pos:interpolation:input:L560" type="range" min="0" max="1" step="0.05"
                    value="${layer.opacity}"
                    data-cc-call-input="handleChangeInterpolationOpacity|s:${encodeURIComponent(`${layer.id}`)}|v">
            </label>
            ${_supportsContourUI(layer)
        ? `
            <label style="display:flex;align-items:center;gap:8px;">
                <input data-field-meta="true" data-field-meta-key="auto-pos:interpolation:input:L568" type="checkbox"
                    ${layer.showContours ? 'checked' : ''}
                    data-cc-call-change="handleToggleInterpolationContours|s:${encodeURIComponent(`${layer.id}`)}">
                ${layer.type === 'contamination' ? 'Isolinhas' : 'Curvas de nível'}
            </label>
            <label>
                Densidade das curvas
                <select data-field-meta="true" data-field-meta-key="auto-pos:interpolation:select:L575" data-cc-call-change="handleChangeInterpolationContourDensity|s:${encodeURIComponent(`${layer.id}`)}|v">
                    <option value="low" ${layer.contourDensity === 'low' ? 'selected' : ''}>Baixa</option>
                    <option value="medium" ${layer.contourDensity !== 'low' && layer.contourDensity !== 'high' ? 'selected' : ''}>Média</option>
                    <option value="high" ${layer.contourDensity === 'high' ? 'selected' : ''}>Alta</option>
                </select>
            </label>
            <label style="display:flex;align-items:center;gap:8px;">
                <input data-field-meta="true" data-field-meta-key="auto-pos:interpolation:input:L582" type="checkbox"
                    ${layer.showContourLabels ? 'checked' : ''}
                    data-cc-call-change="handleToggleInterpolationContourLabels|s:${encodeURIComponent(`${layer.id}`)}">
                ${layer.type === 'water_table' ? 'Labels de cota' : 'Labels das curvas'}
            </label>`
        : ''}
            ${layer.type === 'contamination'
        ? `
            <label title="${t('interpolation.isoThresholdTooltip')}">
                Threshold 3D
                <input data-field-meta="true" data-field-meta-key="auto-pos:interpolation:input:L594" type="number" min="0" step="any" style="width:80px;"
                    value="${layer.thresholdValue != null ? layer.thresholdValue : ''}"
                    placeholder="${t('interpolation.isoThresholdPlaceholder')}"
                    data-cc-call-change="handleSetLayerThreshold|s:${encodeURIComponent(`${layer.id}`)}|v">
                <span style="font-size:10px;opacity:0.6;">${layer.stats ? layer.stats.max.toFixed(2) + ' max' : ''}</span>
            </label>`
        : ''}
            ${layer.type === 'terrain'
        ? `
            <label>
                ${t('interpolationTexture') || 'Textura'}
                <select data-field-meta="true" data-field-meta-key="auto-pos:interpolation:select:L607" data-cc-call-change="handleChangeInterpolationTexture|s:${encodeURIComponent(`${layer.id}`)}|v">
                    ${layer.satelliteUrls ? `<option value="satellite" ${layer.textureMode === 'satellite' ? 'selected' : ''}>${t('interpolationSatellite') || 'Satelite'}</option>` : ''}
                    <option value="colorRamp" ${layer.textureMode === 'colorRamp' || (!layer.satelliteUrls && layer.textureMode !== 'custom') ? 'selected' : ''}>${t('interpolationColorRamp') || 'Rampa de Cores'}</option>
                    <option value="custom" ${layer.textureMode === 'custom' ? 'selected' : ''}>${t('interpolationCustomImage') || 'Imagem local'}</option>
                </select>
            </label>
            ${layer.textureMode === 'custom'
            ? `
            <label style="margin-top:4px;">
                <input type="file" accept="image/*" style="font-size:10px;"
                       data-cc-call-change="handleUploadTerrainOverlay|s:${encodeURIComponent(`${layer.id}`)}|f0">
            </label>`
            : ''}`
        : ''}
            ${stats}
        </div>
    </div>`;
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
function _getSelectedGridSize() {
    const sel = (document.getElementById('interpolation-grid-size'));
    if (sel) {
        const cols = parseInt(sel.value, 10);
        if (!isNaN(cols))
            return { cols, rows: cols };
    }
    return { cols: 64, rows: 64 };
}
function _getSelectedMethod() {
    const sel = (document.getElementById('interpolation-method'));
    return sel?.value || 'idw';
}
function _getSelectedMatrix() {
    const sel = (document.getElementById('interpolation-matrix-filter'));
    return sel?.value || null;
}
/** @param {InterpolationLayer|null|undefined} layer */
function _supportsContourUI( layer: any) {
    return CONTOUR_UI_TYPES.has(layer?.type || '');
}
function _refreshContaminationParameterSelect() {
    const select = (document.getElementById('interpolation-contamination-parameter'));
    const button = (document.getElementById('interpolation-add-contamination-btn'));
    if (!select || !button)
        return;
    const previousValue = select.value;
    const parameters = _getContaminationParametersFromObservations();
    const placeholder = '<option value="">Parâmetro contaminação...</option>';
    const options = parameters
        .map((p: any) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
        .join('');
    select.innerHTML = placeholder + options;
    if (parameters.length === 0) {
        select.value = '';
        button.disabled = true;
        button.title = t('interpolation.noValidObservationsTooltip');
        return;
    }
    if (previousValue && parameters.some((p: any) => p.id === previousValue)) {
        select.value = previousValue;
    }
    else {
        select.value = (parameters[0] as any).id;
    }
    button.disabled = false;
    button.title = t('interpolation.interpolateContaminationTooltip');
}
function _getContaminationParametersFromObservations() {
    const matrixFilter = _getSelectedMatrix();
    const observedParamIds = new Set();
    for (const element of getAllElements()) {
        const observations = Array.isArray(element?.data?.observations) ? element.data.observations : [];
        for (const obs of observations) {
            const value = Number.parseFloat(obs?.value);
            if (!Number.isFinite(value))
                continue;
            if (matrixFilter && obs.sample_matrix !== matrixFilter)
                continue;
            const parameterId = String(obs?.parameterId || '').trim();
            if (!parameterId)
                continue;
            observedParamIds.add(parameterId);
        }
    }
    const catalog = Array.isArray(CONFIG?.PARAMETERS) ? CONFIG.PARAMETERS : [];
    const byId = new Map(catalog.map((param: any) => [param.id, param]));
    const options = [];
    for (const id of observedParamIds) {
        const param = byId.get(id);
        if (param && param.category !== 'contaminant')
            continue;
        options.push({
            id,
            name: param?.name || id,
        });
    }
    return options.sort((a: any, b: any) => a.name.localeCompare(b.name, 'pt-BR'));
}
// ----------------------------------------------------------------
// LAYER SELECTION - Seleção de layer no painel de elementos
// ----------------------------------------------------------------
/**
 * Select an interpolation layer in the elements panel.
 * Seleciona uma layer de interpolação (mutuamente exclusivo com elementos).
 *
 * @param {string} layerId
 */
function handleSelectLayer( layerId: any) {
    // Limpa seleção de elemento e volume
    setSelectedElement(null);
    setSelectedVolume(null);
    clearHighlight();
    const prev = getSelectedLayer();
    if (prev === layerId) {
        // Deselecionar se clicou de novo
        setSelectedLayer(null);
        highlightSelectedLayer((null));
        requestInterpolationUIRefresh('interpolation.layer-deselected');
        return;
    }
    setSelectedLayer(layerId);
    // Highlight mesh 3D
    const mesh = getLayerMesh(layerId);
    if (mesh)
        highlightMesh(mesh);
    // Rebuild lista para mostrar inline controls do layer selecionado
    requestInterpolationUIRefresh('interpolation.layer-selected');
    requestRender();
}
/**
 * Toggle visibility of an interpolation layer from the elements panel.
 * @param {string} layerId
 */
function handleToggleLayerVisibility( layerId: any) {
    const layer = getLayer(layerId);
    if (!layer)
        return;
    updateLayer(layerId, { visible: !layer.visible });
    requestInterpolationUIRefresh('interpolation.layer-visibility-toggled');
}
// ----------------------------------------------------------------
// EXPORT
// ----------------------------------------------------------------
// --- GeoML Maps Phase 1 handlers ---
/**
 * Generate a potentiometric map from water_level observations.
 * Uses Kriging by default; falls back to IDW on CDN timeout.
 */
async function handleGeneratePotentiometricMap() {
    if (!CONFIG.FEATURES?.GEOML_MAPS)
        return;
    try {
        const layer = await createPotentiometricMap({ method: 'idw' });
        if (layer) {
            showToast(t('interpolation.potentiometric_created') || 'Mapa potenciometrico gerado', 'success');
            _renderInterpolationModal();
        }
    }
    catch (err: any) {
        log.error('Failed to generate potentiometric map', _errorMessage(err));
        showToast(_errorMessage(err), 'error');
    }
}
/**
 * Generate a contamination plume from campaign observations.
 * @param {string} [parameterId] - Parameter to interpolate (e.g., 'benzene')
 */
async function handleGeneratePlumeFromCampaign( parameterId: any) {
    if (!CONFIG.FEATURES?.GEOML_MAPS)
        return;
    if (!parameterId) {
        showToast('Selecione um parametro de contaminacao.', 'warning');
        return;
    }
    try {
        const result = await createPlumeFromCampaign({ parameterId, method: 'idw' });
        if (result?.layer) {
            showToast(t('interpolation.plume_created') || `Pluma de ${parameterId} gerada`, 'success');
            _renderInterpolationModal();
        }
    }
    catch (err: any) {
        log.error('Failed to generate plume from campaign', _errorMessage(err));
        showToast(_errorMessage(err), 'error');
    }
}
// ----------------------------------------------------------------
// GEOLOGY LAYER - Superfícies geológicas de perfis litológicos
// ----------------------------------------------------------------
const SOIL_LABELS_UI = {
    clay: 'Argila',
    sand: 'Areia',
    silt: 'Silte',
    gravel: 'Cascalho',
    rock: 'Rocha',
    sandy_clay: 'Argila arenosa',
    clayey_sand: 'Areia argilosa',
    silty_sand: 'Areia siltosa',
    fill: 'Aterro',
    topsoil: 'Solo organico',
    peat: 'Turfa',
};
async function handleAddGeologyLayer() {
    const soilTypeSelect = (document.getElementById('interpolation-geology-soiltype'));
    const contactSelect = (document.getElementById('interpolation-geology-contact'));
    const soilType = soilTypeSelect?.value;
    const contactType = contactSelect?.value || 'top';
    if (!soilType) {
        showToast('Selecione um tipo de solo.', 'warning');
        return;
    }
    try {
        const gridSize = _getSelectedGridSize();
        const method = _getSelectedMethod();
        await createGeologyLayer(soilType, { contactType, gridSize, method });
        _renderInterpolationModal();
    }
    catch (err: any) {
        log.error('Failed to create geology layer', _errorMessage(err));
    }
}
function _refreshGeologySoilTypeSelect() {
    const select = (document.getElementById('interpolation-geology-soiltype'));
    const button = (document.getElementById('interpolation-add-geology-btn'));
    if (!select || !button)
        return;
    const previousValue = select.value;
    const available = getAvailableSoilTypes();
    const placeholder = '<option value="">Tipo de solo...</option>';
    const options = available
        .map((s: any) => `<option value="${escapeHtml(s.soilType)}">${escapeHtml((SOIL_LABELS_UI as any)[s.soilType] || s.soilType)} (${s.count})</option>`)
        .join('');
    select.innerHTML = placeholder + options;
    if (available.length === 0) {
        select.value = '';
        button.disabled = true;
        button.title = 'Nenhum poco com perfil litologico';
        return;
    }
    if (previousValue && available.some((s: any) => s.soilType === previousValue)) {
        select.value = previousValue;
    }
    else {
        select.value = (available[0] as any).soilType;
    }
    button.disabled = false;
}
/**
 * @param {unknown} err
 * @returns {string}
 */
function _errorMessage( err: any) {
    return err instanceof Error ? err.message : String(err || '');
}
export const interpolationHandlers = {
    handleOpenInterpolationPanel,
    handleCloseInterpolationPanel,
    handleAddTerrainLayer,
    handleAddTerrainLayerManualFromPaste,
    handleAddTerrainLayerManualFromUpload,
    handleTerrainManualUploadChange,
    handleAddWaterTableLayer,
    handleAddContaminationLayer,
    handleAddGeologyLayer,
    handleMatrixFilterChange,
    handleRemoveInterpolationLayer,
    handleToggleInterpolationLayer,
    handleChangeInterpolationMethod,
    handleChangeInterpolationMethodAndRefresh,
    handleChangeInterpolationOpacity,
    handleChangeInterpolationColorRamp,
    handleChangeInterpolationGridSize,
    handleRefreshInterpolationLayer,
    handleToggleWireframe,
    handleChangeInterpolationTexture,
    handleUploadTerrainOverlay,
    handleToggleInterpolationContours,
    handleChangeInterpolationContourDensity,
    handleToggleInterpolationContourLabels,
    handleSelectLayer,
    handleToggleLayerVisibility,
    handleGeneratePotentiometricMap,
    handleGeneratePlumeFromCampaign,
    handleSetLayerThreshold,
};
