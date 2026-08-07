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
   AERIAL RECOGNITION HANDLERS â€” UI for image-based element detection
   ================================================================

   Handlers para o modal de reconhecimento de imagem aerea.
   Permite ao usuario carregar imagem aerea (do limite existente ou
   upload) e detectar feicoes ambientais via IA, algoritmo de cores,
   ou ML (OWL-ViT zero-shot detection via Transformers.js).

   FLUXO:
   1. Selecionar fonte da imagem (overlay do limite ou upload)
   2. Escolher metodo (IA Vision ou Analise de Cores)
   3. Analisar â†’ preview das feicoes detectadas
   4. Confirmar â†’ cria elementos no modelo 3D + grupo automatico

   ================================================================ */
import * as recognitionAnalyzer from '../../core/recognition/analyzer.js';
import {
    analyzeWithAI,
    analyzeWithAlgorithm,
    loadImageAsDataUrl,
    readFileAsDataUrl,
    vectorize,
} from '../../core/recognition/analyzer.js';
import {
    analyzeWithSLIC,
    analyzeWithYOLOS,
    loadSAM,
    segmentAtPoint,
    getSAMStatus,
    selectSAMModel,
} from '../../core/recognition/analyzer.js';
import { generateAutoMasks, autoMasksToFeatures } from '../../core/recognition/analyzer.js';
import { segmentByText } from '../../core/recognition/analyzer.js';
import { segmentFromTiles } from '../../core/recognition/analyzer.js';
import { detectInstances, detectInstancesNative } from '../../core/recognition/analyzer.js';
import { detectChanges } from '../../core/recognition/analyzer.js';
import { classifyScene } from '../../core/recognition/analyzer.js';
import { enhanceImage } from '../../core/recognition/analyzer.js';
import { computeVNDVI, computeSAVI, computeWaterIndex, renderIndexOverlay } from '../../core/recognition/analyzer.js';
import {
    computeHandcraftedEmbedding,
    storeTileEmbedding,
    searchSimilarTiles,
    getEmbeddingStats,
} from '../../core/recognition/analyzer.js';
import { DEFAULT_CALIBRATION, autoCalibrate } from '../../core/recognition/calibration.js';
import {
    resetNetwork,
    isNetworkTrained,
    trainNetwork,
    classifyWithUserNN,
    extractTrainingData,
    getClassifierFamilies,
    getFamilyIndex,
    persistClassifier,
    loadClassifier,
    setClassifierStrokes,
} from '../../core/recognition/userClassifier.js';
import { getElementsByFamily, addElement } from '../../core/elements/manager.js';
import { generateId } from '../helpers/id.js';
import { getIcon, hydrateIcons } from '../ui/icons.js';
import { openModal, closeModal } from '../ui/modals.js';
import { showToast } from '../ui/toast.js';
import { Z_INDEX } from '../ui/zIndex.js';
import { t } from '../i18n/translations.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
import { hasApiKey } from '../../core/llm/client.js';
import { addElementGroup, setElementGroup } from '../groups/manager.js';
import { drawFeatureOutline, drawAnnotationMarker } from '../../core/recognition/featureRenderer.js';
import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { createLogger } from '../helpers/logger.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
import { buildAerialElementData } from './aerialFeatureUtils.js';
import {
    computePreviewCanvasSize,
    getNormalizedCanvasPoint,
    constrainFloatingMenuPosition,
} from './aerialPreviewCanvasUtils.js';
import { loadPreviewImage, paintImageOnCanvas, paintPreviewImage } from './aerialPreviewLifecycle.js';
import { drawAerialAnnotationOverlays, drawAerialDetectedFeatureOverlays } from './aerialPreviewRenderer.js';
import {
    addAnnotation,
    buildAnnotationFamilyMenuHtml,
    buildAnnotationListHtml,
    clearAnnotations,
    removeAnnotationAtIndex,
} from './aerialAnnotationUi.js';
import {
    applyCalibrationChange,
    assignSequentialFeatureNames,
    buildCenteredExtent,
    buildFeatureSummaryHtml,
    buildResultsTableHtml,
    computeBoundaryExtent,
    filterDuplicateFeatures,
    initSlicControlListeners,
    isExtentValid,
    setMethodSubcontrolsVisibility,
    shouldAbortAutoMaskForMethod,
    shouldEnablePaintMode,
    syncCalibrationSlidersDom,
    toggleAdvancedCalibration,
    updateCalibrationDisplay,
} from './aerialMethodControlsUi.js';
import { handleAerialGeoreference as _handleAerialGeoreference } from './aerialGeorefWorkflow.js';
const log = createLogger('Aerial');
const _recognitionAnalyzer = recognitionAnalyzer;
const _recognitionAnalyzerAny: any = _recognitionAnalyzer;
const analyzeWithML = _recognitionAnalyzerAny.analyzeWithML;
const isMLModelLoaded = _recognitionAnalyzerAny.isMLModelLoaded || _recognitionAnalyzerAny.isSegFormerLoaded || _recognitionAnalyzerAny.isMaskFormerLoaded;
const setSAMImage = _recognitionAnalyzerAny.setSAMImage || _recognitionAnalyzerAny.setImage;
type AnyRecord = Record<string, any>;
type AerialPaintStroke = { family: string; points: Array<[number, number]>; brushSize?: number };
type AerialExtent = { minX: number; maxX: number; minZ: number; maxZ: number };
type DetectedFeature = { family?: string; label?: string; center?: AnyRecord; bounds?: AnyRecord; polygon?: any[]; [key: string]: any };
/** @param {unknown} err @returns {string} */
function _errorMessage(err: any) {
    return err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
}
/** @param {string} id @returns {any} */
function _el(id: string): any {
    return document.getElementById(id);
}
/** @param {string} selectors @returns {any} */
function _qs(selectors: string): any {
    return document.querySelector(selectors);
}
/** @param {string} selectors @returns {any} */
function _qsa(selectors: string): any {
    return document.querySelectorAll(selectors);
}
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
let requestUIRefresh: any = null;
let _currentImage: any = null; // Base64 data URL
let _currentExtent: AerialExtent | null = null; // { minX, maxX, minZ, maxZ }
let _detectedFeatures: DetectedFeature[] = []; // DetectedFeature[]
let _selectedFeatures: boolean[] = []; // Boolean[] (same length as _detectedFeatures)
let _calibration: any = null; // CalibrationParams or null for defaults
let _userAnnotations: any[] = []; // Array<{ nx, ny, family }> â€” normalized coords (0-1)
let _annotationMenuEl: any = null; // Context menu DOM element (created once)
let _pendingAnnotation: any = null; // { nx, ny } â€” awaiting family selection
// Concurrency guard â€” prevents double-click race conditions
let _isAnalyzing = false;
// Vectorization Engine state
let _lastCategoryGrid: any = null; // Uint8Array(262144) cached from last ML/color analysis
let _lastGeoJSON: any = null; // GeoJSON FeatureCollection from vectorize()
let _vectorizeOverride: any = null; // Override for testing â€” replaces vectorize()
// SAM Auto-Mask / Text Prompt state (segment-geospatial)
let _textPrompt = ''; // Text prompt for CLIP segmentation
let _autoMaskAbort: any = null; // AbortController for auto-mask cancellation
// Paint mode state (User NN method)
let _paintMode = false; // Whether paint mode is active
let _paintFamily = 'building'; // Currently selected paint family
let _paintBrushSize = 12; // Brush radius in grid pixels (on 512x512 grid)
let _paintStrokes: AerialPaintStroke[] = []; // [{ family, points: [[nx, ny], ...], brushSize }]
let _labelGrid: any = null; // Uint8Array(512*512) â€” family index per pixel (0=unlabeled)
let _isPainting = false; // Mouse is currently down and painting
let _currentStroke: AerialPaintStroke | null = null; // Current in-progress stroke
// Change Detection state
let _changeComparisonImage: any = null; // Base64 data URL of comparison image
/**
 * Inject UI refresh dependency.
 * @param {Function} fn
 */
export function setAerialUpdateAllUI(fn: any) {
    requestUIRefresh = fn;
}
function requestAerialUIRefresh(reason = 'aerial.changed') {
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
// ----------------------------------------------------------------
// FAMILY ICON MAP & LABELS
// Nomes em portugues para as familias detectadas
// ----------------------------------------------------------------
const FAMILY_ICONS: any = {
    building: 'building',
    tank: 'tank',
    lake: 'lake',
    river: 'river',
    habitat: 'tree',
    well: 'well',
    marker: 'map-pin',
    plume: 'plume',
};
const FAMILY_LABELS_PT: any = {
    building: 'Edificacao',
    tank: 'Tanque',
    lake: 'Corpo Hidrico',
    river: 'Curso de Agua',
    habitat: 'Vegetacao',
    marker: 'Solo Exposto',
    well: 'Poco',
};
// ----------------------------------------------------------------
// OPEN MODAL
// ----------------------------------------------------------------
/**
 * Open aerial recognition modal.
 * Verifica se existe boundary com overlay e habilita/desabilita botao.
 */
export function handleOpenAerialModal() {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('recognition')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    // Reset state
    _currentImage = null;
    _currentExtent = null;
    _detectedFeatures = [];
    _selectedFeatures = [];
    _calibration = null;
    _userAnnotations = [];
    _paintMode = false;
    _isPainting = false;
    _currentStroke = null;
    // Preserve paint strokes and label grid if returning to modal
    // (user may want to continue training)
    // Reset UI
    _resetModalUI();
    // Check if boundary with overlay exists
    const boundaries = getElementsByFamily('boundary');
    const boundaryWithOverlay = boundaries.find((b: any) => b.data?.overlayUrl);
    const boundaryBtn = _el('aerial-use-boundary-btn');
    if (boundaryBtn) {
        boundaryBtn.disabled = !boundaryWithOverlay;
        if (!boundaryWithOverlay) {
            boundaryBtn.title = t('noBoundaryForAerial');
        } else {
            boundaryBtn.title = '';
        }
    }
    openModal('aerial-recognition-modal');
}
/**
 * Reset all modal UI sections to initial state.
 */
function _resetModalUI() {
    const preview = _el('aerial-image-preview');
    if (preview) preview.style.display = 'none';
    const methodStep = _el('aerial-step-method');
    if (methodStep) methodStep.style.display = 'none';
    const extentStep = _el('aerial-step-extent');
    if (extentStep) extentStep.style.display = 'none';
    const processing = _el('aerial-processing');
    if (processing) processing.style.display = 'none';
    const results = _el('aerial-step-results');
    if (results) results.style.display = 'none';
    const confirmBtn = _el('aerial-confirm-btn');
    if (confirmBtn) confirmBtn.disabled = true;
    // Hide vectorize/export buttons (shown after analysis/vectorization)
    const vecBtn = _el('aerial-vectorize-btn');
    if (vecBtn) {
        vecBtn.style.display = 'none';
        vecBtn.disabled = true;
    }
    const exportBtn = _el('aerial-export-geojson-btn');
    if (exportBtn) {
        exportBtn.style.display = 'none';
        exportBtn.disabled = true;
    }
    const fileInput = _el('aerial-image-file');
    if (fileInput) fileInput.value = '';
    // Reset annotations UI
    const annotSect = _el('aerial-annotations-section');
    if (annotSect) annotSect.style.display = 'none';
    const annotList = _el('aerial-annotations-list');
    if (annotList) annotList.innerHTML = '';
    // Reset paint controls
    const paintControls = _el('aerial-paint-controls');
    if (paintControls) paintControls.style.display = 'none';
    const trainStatus = _el('aerial-train-status');
    if (trainStatus) trainStatus.style.display = 'none';
    // Reset calibration UI
    const calStep = _el('aerial-calibration-step');
    if (calStep) calStep.style.display = 'none';
    const calAdv = _el('aerial-cal-advanced');
    if (calAdv) calAdv.style.display = 'none';
    _syncCalibrationSliders();
    // Cleanup SAM click mode listeners and paint canvas to prevent leaks
    _disableSAMClickMode();
    _paintMode = false;
    _isPainting = false;
}
// ----------------------------------------------------------------
// IMAGE SOURCE â€” Boundary overlay
// ----------------------------------------------------------------
/**
 * Use existing boundary overlay image.
 * Busca imagem do overlay do limite via fetch, converte para dataURL.
 */
export async function handleAerialUseBoundary() {
    const boundaries = getElementsByFamily('boundary');
    const boundary = boundaries.find((b: any) => b.data?.overlayUrl);
    if (!boundary) {
        showToast(t('noBoundaryForAerial'), 'error');
        return;
    }
    // Compute extent from boundary vertices
    const vertices = boundary.data.vertices || [];
    if (vertices.length < 3) {
        showToast(t('aerial.insufficientVertices'), 'error');
        return;
    }
    _currentExtent = _computeExtent(vertices);
    // Show processing
    const processing = _el('aerial-processing');
    if (processing) processing.style.display = '';
    try {
        _currentImage = await loadImageAsDataUrl(boundary.data.overlayUrl);
        _showImagePreview(_currentImage || '');
        _showMethodStep();
    } catch (err: any) {
        log.error('Failed to load boundary overlay image', _errorMessage(err));
        showToast(_errorMessage(err) || 'Failed to load boundary image', 'error');
    } finally {
        if (processing) processing.style.display = 'none';
    }
}
// ----------------------------------------------------------------
// IMAGE SOURCE â€” File upload
// ----------------------------------------------------------------
/**
 * Handle aerial image file upload.
 * Le o arquivo selecionado e mostra preview.
 */
export async function handleAerialImageUpload() {
    const input = _el('aerial-image-file');
    const file = input?.files?.[0];
    if (!file) return;
    try {
        _currentImage = await readFileAsDataUrl(file);
        _showImagePreview(_currentImage || '');
        // Check if boundary exists for extent
        const boundaries = getElementsByFamily('boundary');
        const boundary = boundaries.find((b: any) => b.data?.vertices?.length >= 3);
        if (boundary) {
            _currentExtent = _computeExtent(boundary.data.vertices);
            _showMethodStep();
        } else {
            // No boundary â€” show extent input fields with default 200x200m
            _currentExtent = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
            _showExtentStep();
            _showMethodStep();
            showToast(t('aerial.defaultExtentFallback'), 'warning');
        }
    } catch (err: any) {
        log.error('Failed to read uploaded image', _errorMessage(err));
        showToast(_errorMessage(err) || t('aerial.failedToReadImage'), 'error');
    }
}
// ----------------------------------------------------------------
// EXTENT INPUT (when no boundary exists)
// ----------------------------------------------------------------
/**
 * Update extent from manual input fields.
 */
export function handleAerialSetExtent() {
    const wInput = _el('aerial-extent-width');
    const hInput = _el('aerial-extent-height');
    _currentExtent = buildCenteredExtent(parseFloat(wInput?.value), parseFloat(hInput?.value));
}
// ----------------------------------------------------------------
// ANALYZE
// ----------------------------------------------------------------
/**
 * Run analysis with selected method (AI or algorithm).
 */
export async function handleAerialAnalyze() {
    if (_isAnalyzing) return; // Guard contra double-click
    if (!_currentImage || !_currentExtent) {
        showToast(t('aerial.selectImageFirst'), 'error');
        return;
    }
    // Update extent from manual fields if visible
    const extentStep = _el('aerial-step-extent');
    if (extentStep && extentStep.style.display !== 'none') {
        handleAerialSetExtent();
    }
    // Validate extent bounds â€” prevent NaN in georeference pipeline
    if (!isExtentValid(_currentExtent)) {
        showToast(t('aerial.invalidExtentFallback'), 'error');
        return;
    }
    // Get selected method
    const methodRadio = _qs('input[name="aerial-method"]:checked');
    const method = methodRadio?.value || 'algorithm';
    // Check prerequisites
    if (method === 'ai' && !hasApiKey()) {
        showToast(t('aerialApiKeyRequired'), 'error');
        if (typeof window.openLLMConfig === 'function') window.openLLMConfig();
        return;
    }
    if (method === 'usernn' && !isNetworkTrained()) {
        showToast(t('aerial.trainNetworkFirstFallback'), 'error');
        return;
    }
    // Show processing with reset state
    const processing = _el('aerial-processing');
    if (processing) processing.style.display = '';
    _updateProgress(t('analyzingImage') || 'Analyzing image...', -1);
    const analyzeBtn = _el('aerial-analyze-btn');
    if (analyzeBtn) analyzeBtn.disabled = true;
    _isAnalyzing = true;
    try {
        let newFeatures: any[] = [];
        if (method === 'ai') {
            newFeatures = await analyzeWithAI(_currentImage, _currentExtent, _userAnnotations);
        } else if (method === 'ml') {
            // Pede grid para caching (Vectorization Engine)
            const result: any = await analyzeWithML(
                _currentImage,
                _currentExtent,
                /** @param {any} index */
                (info: any) => {
                    _updateProgress(info.message, info.progress);
                },
                _userAnnotations,
                { returnGrid: true },
            );
            // Backward-compat: resultado pode ser array ou { features, grid }
            if (result && result.grid) {
                newFeatures = result.features;
                _lastCategoryGrid = result.grid;
            } else {
                newFeatures = result;
            }
        } else if (method === 'usernn') {
            newFeatures = (await classifyWithUserNN(
                _currentImage,
                _currentExtent,
                /** @param {any} index */ (info: any) => {
                    _updateProgress(info.message, info.progress);
                },
            )) as any[];
        } else if (method === 'slic') {
            const slicNum = parseInt(_el('aerial-slic-num')?.value) || 200;
            const slicCompact = parseInt(_el('aerial-slic-compact')?.value) || 10;
            const result: any = await analyzeWithSLIC(
                _currentImage,
                _currentExtent,
                {
                    numSuperpixels: slicNum,
                    compactness: slicCompact,
                    returnGrid: true,
                },
                /** @param {any} index */
                (info: any) => {
                    _updateProgress(info.message, info.progress);
                },
                _userAnnotations as any,
            );
            if (result && result.grid) {
                newFeatures = result.features;
                _lastCategoryGrid = result.grid;
            } else {
                newFeatures = result;
            }
        } else if (method === 'yolos') {
            const yThreshold = (parseInt(_el('aerial-yolos-threshold')?.value) || 30) / 100;
            const yMaxDet = parseInt(_el('aerial-yolos-maxdet')?.value) || 50;
            newFeatures = await analyzeWithYOLOS(
                _currentImage,
                _currentExtent,
                /** @param {any} index */
                (info: any) => {
                    _updateProgress(info.message, info.progress);
                },
                { threshold: yThreshold, maxDetections: yMaxDet },
            );
        } else if (method === 'sam') {
            // SAM usa modo interativo â€” nao roda analise batch aqui
            // Carrega modelo e encoda imagem, usuario clica depois
            await loadSAM(/** @param {any} index */ (info: any) => _updateProgress(info.message, info.progress));
            await setSAMImage(
                _currentImage,
                /** @param {any} index */ (info: any) => _updateProgress(info.message, info.progress),
            );
            _updateProgress(t('clickToSegment') || 'Click on image to segment objects', 100);
            _enableSAMClickMode();
            return; // Nao segue para dedup/results â€” features vem por clique
        } else if (method === 'samAuto') {
            // SAM Auto-Mask â€” grid-point automatic segmentation (segment-geospatial)
            const gridVal = parseInt(_el('aerial-auto-grid')?.value) || 16;
            const minAreaVal = parseInt(_el('aerial-auto-minarea')?.value) || 100;
            _autoMaskAbort = new AbortController();
            try {
                const masks = await generateAutoMasks(_currentImage, _currentExtent, {
                    pointsPerSide: gridVal,
                    minMaskArea: minAreaVal,
                    signal: _autoMaskAbort.signal,
                    onProgress: /** @param {any} index */ (info: any) => _updateProgress(info.message, info.progress),
                });
                newFeatures = autoMasksToFeatures(masks, _currentExtent, _currentImage);
            } finally {
                _autoMaskAbort = null;
            }
        } else if (method === 'textPrompt') {
            // CLIP + SAM text-prompted segmentation (segment-geospatial LangSAM)
            const prompt = _textPrompt?.trim();
            if (!prompt) {
                showToast(t('aerial.textPromptEmptyFallback'), 'error');
                return;
            }
            _autoMaskAbort = new AbortController();
            try {
                newFeatures = await segmentByText(_currentImage, prompt, _currentExtent, {
                    signal: _autoMaskAbort.signal,
                    onProgress: /** @param {any} index */ (info: any) => _updateProgress(info.message, info.progress),
                });
            } finally {
                _autoMaskAbort = null;
            }
        } else if (method === 'tileMap') {
            // Tile map segmentation â€” open map picker, fetch tiles, auto-segment
            await handleAerialTileMapSegment();
            return; // Results handled by the tile map handler
        } else if (method === 'instance') {
            // Instance segmentation â€” per-object masks
            const subMethod = _qs('input[name="aerial-instance-sub"]:checked')?.value || 'hybrid';
            if (subMethod === 'native') {
                newFeatures = await detectInstancesNative(
                    _currentImage,
                    _currentExtent,
                    /** @param {any} index */ (info: any) => {
                        _updateProgress(info.message, info.progress);
                    },
                );
            } else {
                newFeatures = await detectInstances(
                    _currentImage,
                    _currentExtent,
                    /** @param {any} index */ (info: any) => {
                        _updateProgress(info.message, info.progress);
                    },
                );
            }
        } else if (method === 'changeDetect') {
            // Change Detection â€” temporal comparison of two images
            if (!_changeComparisonImage) {
                showToast(t('aerial.uploadComparisonFirst'), 'error');
                return;
            }
            const result = await detectChanges(_currentImage, _changeComparisonImage, _currentExtent, {
                onProgress: /** @param {any} index */ (info: any) => _updateProgress(info.message, info.progress),
            });
            // Show overlay on canvas
            _showChangeOverlay(result.overlay);
            showToast(
                `${result.stats.changeCount} changes detected (${result.stats.changePercent}% area)`,
                result.stats.changeCount > 0 ? 'success' : 'info',
            );
            newFeatures = []; // Change detection doesn't produce DetectedFeature[]
        } else if (method === 'classify') {
            // Scene Classification â€” image-level land cover type
            const tier = _qs('input[name="aerial-classify-tier"]:checked')?.value || 'rule';
            const result = await classifyScene(_currentImage, {
                tier,
                onProgress: /** @param {any} index */ (info: any) => _updateProgress(info.message, info.progress),
            });
            // Show classification result
            const resultEl = _el('aerial-classify-result');
            if (resultEl) {
                resultEl.style.display = '';
                resultEl.innerHTML =
                    `<div style="font-size:13px; font-weight:600;">${escapeHtml(result.class.toUpperCase())}</div>` +
                    `<div style="font-size:11px; color:var(--window-muted);">${t('aerial.confidenceLabel', { percent: Math.round(result.confidence * 100) })}</div>`;
            }
            showToast(
                t('aerial.sceneResult', { class: result.class, percent: Math.round(result.confidence * 100) }),
                'success',
            );
            newFeatures = []; // Classification is image-level, not per-object
        } else if (method === 'spectral') {
            // Spectral Analysis â€” vNDVI, SAVI, Water Index
            const indexType = _el('aerial-spectral-index')?.value || 'vndvi';
            const colormap = _el('aerial-spectral-colormap')?.value || 'RdYlGn';
            let result;
            if (indexType === 'savi') result = await computeSAVI(_currentImage);
            else if (indexType === 'water') result = await computeWaterIndex(_currentImage);
            else result = await computeVNDVI(_currentImage);
            const overlay = renderIndexOverlay(result.grid, result.w, result.h, colormap, undefined, undefined);
            _showChangeOverlay(overlay);
            showToast(
                `${indexType.toUpperCase()}: mean=${result.stats.mean.toFixed(3)}, range=[${result.stats.min.toFixed(3)}, ${result.stats.max.toFixed(3)}]`,
                'success',
            );
            newFeatures = []; // Spectral is per-pixel overlay, not features
        } else if (method === 'embeddings') {
            // Tile Embeddings â€” index current image
            const embedding = await computeHandcraftedEmbedding(_currentImage);
            const tileId = `tile-${Date.now()}`;
            await storeTileEmbedding(tileId, embedding, { timestamp: Date.now() });
            const stats = await getEmbeddingStats();
            const resultEl = _el('aerial-embeddings-result');
            if (resultEl) {
                resultEl.style.display = '';
                resultEl.textContent = t('aerial.indexedTiles', { count: stats.count, method: stats.method });
            }
            showToast(t('aerial.imageIndexed', { count: stats.count }), 'success');
            newFeatures = []; // Embeddings don't produce features
        } else {
            // Pede grid para caching (Vectorization Engine)
            const result: any = await analyzeWithAlgorithm(_currentImage, _currentExtent, _calibration, _userAnnotations, {
                returnGrid: true,
            });
            if (result && result.grid) {
                newFeatures = result.features;
                _lastCategoryGrid = result.grid;
            } else {
                newFeatures = result;
            }
        }
        // Deduplicate: skip features too close to existing ones (5m threshold)
        // Evita duplicatas quando usuario roda varios metodos em sequencia
        const unique = filterDuplicateFeatures(newFeatures, _detectedFeatures, 5);
        // Accumulate: append new results to existing
        _detectedFeatures = _detectedFeatures.concat(unique);
        // Re-assign sequential names across all accumulated features
        _assignSequentialNames(_detectedFeatures);
        // Select all by default (preserve existing selections + select new)
        const prevLen = _selectedFeatures.length;
        _selectedFeatures = _detectedFeatures.map((_: any, i: any) => (i < prevLen ? (_selectedFeatures[i] ?? true) : true));
        _showResults();
        _redrawCanvas();
        // Show Vectorize button when category grid is available
        const vecBtn = _el('aerial-vectorize-btn');
        if (vecBtn && _lastCategoryGrid) {
            vecBtn.style.display = '';
            vecBtn.disabled = false;
        }
        const newCount = unique.length;
        const totalCount = _detectedFeatures.length;
        showToast(
            t('aerial.featuresAdded', { newCount, features: t('detectedFeatures').toLowerCase(), totalCount }),
            'success',
        );
    } catch (err: any) {
        log.error('Aerial analysis failed', _errorMessage(err));
        showToast(_errorMessage(err) || t('aerial.analysisFailed'), 'error');
    } finally {
        if (processing) processing.style.display = 'none';
        if (analyzeBtn) analyzeBtn.disabled = false;
        _isAnalyzing = false;
    }
}
// ----------------------------------------------------------------
// FEATURE SELECTION
// ----------------------------------------------------------------
/**
 * Toggle selection of a single detected feature.
 * @param {number} index
 */
export function handleAerialToggleFeature(index: any) {
    if (index >= 0 && index < _selectedFeatures.length) {
        _selectedFeatures[index] = !_selectedFeatures[index];
        // Update row styling
        const rows = _qsa('.aerial-feature-row');
        if (rows[index]) {
            const family = _detectedFeatures[index]?.family || '';
            const color = FAMILY_COLORS[family] || '#888';
            rows[index].classList.toggle('selected', _selectedFeatures[index]);
            rows[index].style.borderLeftColor = _selectedFeatures[index] ? color : 'transparent';
        }
        _updateConfirmButton();
        _redrawCanvas();
    }
}
/**
 * Select or deselect all features.
 * @param {boolean} checked
 */
export function handleAerialSelectAll(checked: any) {
    _selectedFeatures = _selectedFeatures.map(() => checked);
    // Update all checkboxes and row styling
    const rows = _qsa('.aerial-feature-row');
    _detectedFeatures.forEach((f: any, i: any) => {
        const cb = _el(`aerial-feature-${i}`);
        if (cb) cb.checked = checked;
        if (rows[i]) {
            const color = FAMILY_COLORS[f.family || ''] || '#888';
            rows[i].classList.toggle('selected', checked);
            rows[i].style.borderLeftColor = checked ? color : 'transparent';
        }
    });
    _updateConfirmButton();
    _redrawCanvas();
}
// ----------------------------------------------------------------
// CONFIRM IMPORT â€” Create elements + auto-group
// ----------------------------------------------------------------
/**
 * Create elements from selected detected features.
 * Cria elementos no modelo 3D, agrupa-os e atualiza a UI.
 */
export function handleAerialConfirmImport() {
    const selected = _detectedFeatures.filter((_: any, i: any) => _selectedFeatures[i]);
    if (selected.length === 0) {
        showToast(t('noFeaturesDetected'), 'error');
        return;
    }
    // Close modal first to avoid interference with UI update
    closeModal('aerial-recognition-modal');
    // Create a group for the imported elements
    const group = addElementGroup({
        name: t('aerialRecognition') || 'Aerial Recognition',
        color: '#4dabf7',
    });
    let created = 0;
    const createdIds: any = [];
    for (const feature of selected) {
        try {
            const family = feature.family || 'marker';
            const id = generateId(family);
            const name = feature.label || `${FAMILY_LABELS_PT[family] || family} ${created + 1}`;
            const data = _buildElementData(feature);
            addElement(family, id, name, data);
            createdIds.push(id);
            created++;
        } catch (err: any) {
            log.warn(`Failed to create element for family ${feature.family}`, _errorMessage(err));
        }
    }
    // Assign all created elements to the group
    for (const id of createdIds) {
        setElementGroup(id, group.id);
    }
    if (created > 0) {
        showToast(`${created} ${t('featuresAdded')}`, 'success');
    }
    // Force scoped refresh after a microtask to ensure DOM is ready
    // (closeModal may trigger CSS transitions)
    setTimeout(() => {
        requestAerialUIRefresh('aerial.features-confirmed');
    }, 50);
}
// ----------------------------------------------------------------
// DATA BUILDERS â€” Convert feature to element data
// Converte DetectedFeature para o formato de dados de cada familia
// ----------------------------------------------------------------
/**
 * Build element data object from detected feature.
 * Inclui rotacao Y quando disponivel no feature.
 * @param {DetectedFeature} feature - DetectedFeature
 * @returns {AnyRecord} - Element data
 */
function _buildElementData(feature: any) {
    return buildAerialElementData(feature);
}
// ----------------------------------------------------------------
// NAMING â€” Sequential names per family
// Numera feicoes sequencialmente por familia (ex: Edificacao 1, 2...)
// ----------------------------------------------------------------
/**
 * Assign sequential names grouped by family.
 * @param {DetectedFeature[]} features - DetectedFeature[]
 */
function _assignSequentialNames(features: any) {
    assignSequentialFeatureNames(features, FAMILY_LABELS_PT);
}
// ----------------------------------------------------------------
// UI HELPERS â€” Internal functions for modal rendering
// ----------------------------------------------------------------
/**
 * Compute bounding extent from boundary vertices.
 * @param {Array<AnyRecord>} vertices - [{x, y, z}, ...]
 * @returns {AerialExtent} - { minX, maxX, minZ, maxZ }
 */
function _computeExtent(vertices: any) {
    return computeBoundaryExtent(vertices) || { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
}
/**
 * Show image preview on modal canvas.
 * Canvas preenche a largura do modal para melhor visualizacao.
 * @param {string} dataUrl - Base64 image
 */
function _showImagePreview(dataUrl: any) {
    const container = _el('aerial-image-preview');
    if (!container) return;
    container.style.display = '';
    const canvas = _el('aerial-preview-canvas');
    if (!canvas) return;
    loadPreviewImage(dataUrl)
        .then((image: any) => {
            paintPreviewImage({
                containerWidth: container.clientWidth,
                canvas,
                image,
                computePreviewCanvasSize,
            });
            canvas.onclick = null;
            canvas.onclick = /** @param {MouseEvent} e */ (e: any) => _handleCanvasClick(e, canvas);
            canvas.style.cursor = _paintMode ? 'crosshair' : 'pointer';
        })
        .catch((error: any) => {
            log.error('Preview image load failed', _errorMessage(error));
            showToast(t('georefImageLoadFailed') || 'Failed to load image', 'error');
        });
}
/**
 * Show method selection step.
 * Habilita/desabilita opcoes conforme disponibilidade.
 */
function _showMethodStep() {
    const methodStep = _el('aerial-step-method');
    if (methodStep) methodStep.style.display = '';
    // Enable/disable AI radio based on API key availability
    const aiRadio = _el('aerial-method-ai');
    const algRadio = _el('aerial-method-algorithm');
    if (aiRadio && !hasApiKey()) {
        aiRadio.disabled = true;
        if (algRadio) algRadio.checked = true;
    } else if (aiRadio) {
        aiRadio.disabled = false;
    }
    // Update ML model status indicator
    const mlStatus = _el('aerial-ml-status');
    if (mlStatus) {
        mlStatus.textContent = isMLModelLoaded() ? t('common.cached') : t('common.sizeMB', { size: '~5' });
    }
    // Show/hide calibration based on selected method
    const selected = _qs('input[name="aerial-method"]:checked');
    _updateCalibrationVisibility(selected?.value || 'ai');
}
/**
 * Update progress indicator text and bar during ML model download.
 * @param {string} message - Status message
 * @param {number} progress - 0-100 or -1 for indeterminate
 */
function _updateProgress(message: any, progress: any) {
    const textEl = _el('aerial-progress-text');
    if (textEl) textEl.textContent = message;
    const barEl = _el('aerial-progress-bar');
    if (barEl) {
        if (progress >= 0) {
            barEl.style.width = `${Math.min(100, progress)}%`;
            barEl.style.animation = 'none';
        } else {
            // Indeterminate â€” use CSS animation
            barEl.style.width = '30%';
            barEl.style.animation = '';
        }
    }
}
/**
 * Show extent input step (when no boundary exists).
 */
function _showExtentStep() {
    const step = _el('aerial-step-extent');
    if (step) step.style.display = '';
}
/**
 * Render detected features table with summary pills.
 * Mostra resumo agrupado por familia + lista de feicoes detectadas.
 */
function _showResults() {
    const container = _el('aerial-step-results');
    if (!container) return;
    container.style.display = '';
    const countEl = _el('aerial-feature-count');
    if (countEl) countEl.textContent = `(${_detectedFeatures.length})`;
    // Render family summary pills
    _renderFeatureSummary();
    const table = _el('aerial-results-table');
    if (!table) return;
    table.innerHTML = buildResultsTableHtml({
        features: _detectedFeatures,
        selected: _selectedFeatures,
        familyIcons: FAMILY_ICONS,
        familyLabels: FAMILY_LABELS_PT,
        familyColors: FAMILY_COLORS,
        getIcon,
        escapeHtml,
        escapeAttr,
        translate: t,
    });
    _updateConfirmButton();
}
/**
 * Render summary pills grouped by family.
 * Pastilhas coloridas mostrando contagem por familia (ex: 15 Edificacoes, 5 Vegetacao).
 */
function _renderFeatureSummary() {
    const summaryEl = _el('aerial-results-summary');
    if (!summaryEl) return;
    summaryEl.innerHTML = buildFeatureSummaryHtml({
        features: _detectedFeatures,
        familyIcons: FAMILY_ICONS,
        familyLabels: FAMILY_LABELS_PT,
        familyColors: FAMILY_COLORS,
        getIcon,
    });
}
/**
 * Update confirm button enabled state.
 */
function _updateConfirmButton() {
    const btn = _el('aerial-confirm-btn');
    if (btn) {
        const anySelected = _selectedFeatures.some((s: any) => s);
        btn.disabled = !anySelected;
    }
}
// ----------------------------------------------------------------
// CALIBRATION HANDLERS
// Gerenciam sliders de calibracao e auto-calibracao por histograma
// ----------------------------------------------------------------
/**
 * Show/hide calibration panel based on method selection.
 * Calibracao so aparece para o metodo "Algorithm" (cor).
 * @param {string} method - 'ai' | 'algorithm' | 'ml'
 */
function _updateCalibrationVisibility(method: any) {
    // Toggle every known method sub-control container in one pass
    setMethodSubcontrolsVisibility(method, /** @param {string} method */ (id: any) => _el(id));
    // Lazy initialization side effects (kept here â€” depend on closure state)
    if (method === 'usernn') _initPaintControls();
    if (method === 'slic') _initSlicControls();
    // Toggle paint mode for canvas interaction
    _paintMode = shouldEnablePaintMode(method);
    // Disable SAM click mode if switching away
    if (method !== 'sam') _disableSAMClickMode();
    // Cancel any in-flight auto-mask if switching away
    if (shouldAbortAutoMaskForMethod(method) && _autoMaskAbort) {
        _autoMaskAbort.abort();
        _autoMaskAbort = null;
    }
}
/**
 * Handle method radio button change.
 * Mostra/esconde calibracao e reseta estado quando muda metodo.
 * @param {string} method
 */
export function handleAerialMethodChange(method: any) {
    _updateCalibrationVisibility(method);
}
/**
 * Handle SAM model selection change (SlimSAM vs SAM 2.1).
 * Atualiza o modelo ativo para segmentacao interativa.
 * @param {string} modelKey - 'slim' | 'sam2'
 */
export function handleAerialSAMModelChange(modelKey: any) {
    const infoEl = _el('aerial-sam-model-info');
    if (infoEl) {
        if (modelKey === 'slim') {
            infoEl.textContent = t('aerial.slimSamDescription');
        } else if (modelKey === 'sam2') {
            infoEl.textContent = t('aerial.sam21Description');
        }
    }
    // Atualiza o modelo no modulo SAM (forca reload se necessario)
    selectSAMModel(modelKey);
    showToast(
        t('aerial.samModelChanged', { model: modelKey === 'slim' ? t('aerial.samModelSlim') : t('aerial.samModel21') }),
        'info',
    );
}
// ----------------------------------------------------------------
// SLIC CONTROLS â€” Slider initialization and value display
// ----------------------------------------------------------------
function _initSlicControls() {
    initSlicControlListeners(/** @param {string} id */ (id: any) => _el(id));
}
// ----------------------------------------------------------------
// SAM INTERACTIVE â€” Click-to-segment mode on aerial canvas
// ----------------------------------------------------------------
let _samClickHandler: any = null;
function _enableSAMClickMode() {
    const canvas = _el('aerial-preview-canvas');
    if (!canvas) return;
    const statusEl = _el('aerial-sam-status');
    if (statusEl) statusEl.textContent = t('clickToSegment') || 'Click on the image to segment objects';
    // Remove previous handler if any
    _disableSAMClickMode();
    _samClickHandler = async (e: any) => {
        const rect = canvas.getBoundingClientRect();
        // Canvas pixel coordinates (may be scaled from original image)
        const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);
        // Convert canvas coords â†’ original image coords (SAM expects image pixel space)
        const samStatus = getSAMStatus();
        const imgW = samStatus.imageWidth || canvas.width;
        const imgH = samStatus.imageHeight || canvas.height;
        const px = canvasX * (imgW / canvas.width);
        const py = canvasY * (imgH / canvas.height);
        if (statusEl) statusEl.textContent = 'Segmenting...';
        try {
            const result = await segmentAtPoint(px, py, _currentExtent, {
                family: 'building', // Default; user can reclassify later
            });
            if (!result || !result.processed) {
                showToast('No object found at click point', 'info');
                if (statusEl) statusEl.textContent = t('clickToSegment') || 'Click to segment';
                return;
            }
            // Build DetectedFeature from Anti-Ameba result
            const proc = result.processed;
            const cx =
                proc.worldContour.reduce(
                    /** @param {number} s @param {any} v */
                    (s: any, v: any) => s + v.x,
                    0,
                ) / proc.worldContour.length;
            const cz =
                proc.worldContour.reduce(
                    /** @param {number} s @param {any} v */
                    (s: any, v: any) => s + v.z,
                    0,
                ) / proc.worldContour.length;
            const feature = {
                family: proc.family === 'building' ? 'building' : proc.family,
                confidence: 0.85,
                label: `SAM ${proc.family}`,
                position: { x: Math.round(cx * 10) / 10, z: Math.round(cz * 10) / 10 },
                dimensions: { width: Math.sqrt(proc.area_m2), length: Math.sqrt(proc.area_m2), height: proc.height },
                rotation: 0,
                contours: [proc.worldContour],
                sourceMethod: 'sam',
            };
            _detectedFeatures.push(feature);
            _selectedFeatures.push(true);
            _assignSequentialNames(_detectedFeatures);
            _showResults();
            _redrawCanvas();
            showToast(`+1 ${proc.family} (${proc.area_m2.toFixed(1)} mÂ²)`, 'success');
            if (statusEl) statusEl.textContent = `${_detectedFeatures.length} features â€” click for more`;
        } catch (err: any) {
            log.error('SAM segmentation failed', _errorMessage(err));
            showToast(_errorMessage(err) || 'SAM failed', 'error');
            if (statusEl) statusEl.textContent = t('clickToSegment') || 'Click to segment';
        }
    };
    canvas.style.cursor = 'crosshair';
    canvas.addEventListener('click', _samClickHandler);
}
function _disableSAMClickMode() {
    const canvas = _el('aerial-preview-canvas');
    if (canvas && _samClickHandler) {
        canvas.removeEventListener('click', _samClickHandler);
        canvas.style.cursor = '';
    }
    _samClickHandler = null;
}
/**
 * Auto-calibrate sliders from the current loaded image.
 * Carrega imagem no canvas, analisa histogramas, ajusta sliders.
 */
export async function handleAerialAutoCalibrate() {
    if (!_currentImage) {
        showToast('Load an image first', 'error');
        return;
    }
    const btn = _el('aerial-auto-cal-btn');
    if (btn) btn.disabled = true;
    try {
        // Load image into canvas to get pixel data
        const img: any = await new Promise((resolve: any, reject: any) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error('Failed to load image'));
            i.src = _currentImage || '';
        });
        const SIZE = 512;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
        // Run auto-calibration
        _calibration = autoCalibrate(imageData.data, SIZE, SIZE);
        // Update slider UI
        _syncCalibrationSliders();
        showToast(t('autoCalibrationDone') || 'Auto-calibration applied', 'success');
    } catch (err: any) {
        log.error('Auto-calibration failed', _errorMessage(err));
        showToast(_errorMessage(err) || 'Auto-calibration failed', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}
/**
 * Handle individual calibration slider change.
 * Atualiza o valor do parametro no estado _calibration.
 * @param {string} param - CalibrationParams key
 * @param {string|number} value - Slider value
 */
export function handleAerialCalibrationChange(param: any, value: any) {
    const next = applyCalibrationChange(_calibration, DEFAULT_CALIBRATION, param, value);
    if (!next) return;
    _calibration = next;
    updateCalibrationDisplay(param, next[param], /** @param {string} id */ (id: any) => _el(id));
}
/**
 * Reset calibration to null (use defaults).
 * Remove calibracao customizada â€” volta aos limiares hardcoded.
 */
export function handleAerialResetCalibration() {
    _calibration = null;
    _syncCalibrationSliders();
    showToast(t('calibrationReset') || 'Calibration reset to defaults', 'info');
}
/**
 * Toggle advanced calibration section visibility.
 */
export function handleAerialToggleAdvanced() {
    toggleAdvancedCalibration(/** @param {string} id */ (id: any) => _el(id));
}
/**
 * Sync all slider DOM elements with current _calibration state.
 * Usado apos auto-calibracao ou reset.
 */
function _syncCalibrationSliders() {
    syncCalibrationSlidersDom(_calibration, DEFAULT_CALIBRATION, /** @param {string} canvas */ (id: any) => _el(id));
}
// ----------------------------------------------------------------
// ANNOTATION SYSTEM â€” Click on canvas to label features
// Sistema de anotacoes: clique na imagem para rotular feicoes
// que guiam os tres motores de analise.
// ----------------------------------------------------------------
/** Color map for annotation markers on canvas */
/** @type {Record<string, string>} */
const FAMILY_COLORS: AnyRecord = {
    building: '#e74c3c',
    tank: '#e67e22',
    lake: '#3498db',
    river: '#2980b9',
    habitat: '#27ae60',
    well: '#8e44ad',
    marker: '#95a5a6',
};
/** Families available for annotation (excludes plume â€” not visible aerially) */
const ANNOTATION_FAMILIES = ['building', 'tank', 'lake', 'river', 'habitat', 'well', 'marker'];
/**
 * Handle click on aerial preview canvas.
 * Calcula posicao normalizada do clique e abre menu de familias.
 * @param {MouseEvent} canvas
 * @param {HTMLCanvasElement} canvas
 */
function _handleCanvasClick(e: any, canvas: any) {
    // In paint mode, canvas interaction is handled by mousedown/move/up listeners
    if (_paintMode) return;
    // Stop propagation so the document close-handler doesn't
    // immediately hide the menu we are about to show
    e.stopPropagation();
    const point = getNormalizedCanvasPoint(canvas.getBoundingClientRect(), e.clientX, e.clientY);
    if (!point) return;
    _pendingAnnotation = point;
    _showAnnotationFamilyMenu(e.clientX, e.clientY);
}
/**
 * Show family selection context menu for annotation.
 * Mostra menu de familias para que o usuario escolha o tipo da anotacao.
 * @param {number} x - clientX
 * @param {number} y - clientY
 */
function _showAnnotationFamilyMenu(x: any, y: any) {
    if (!_annotationMenuEl) {
        _annotationMenuEl = document.createElement('div');
        _annotationMenuEl.className = 'panel-context-menu';
        _annotationMenuEl.id = 'aerial-annotation-menu';
        _annotationMenuEl.style.zIndex = String(Z_INDEX.EXCEPTION_AERIAL_ANNOTATION_MENU);
        document.body.appendChild(_annotationMenuEl);
        // Close on click outside (bubble phase â€” canvas stopPropagation prevents race)
        document.addEventListener('click', (e: any) => {
            if (_annotationMenuEl && !_annotationMenuEl.contains(e.target)) {
                _annotationMenuEl.classList.remove('visible');
            }
        });
        document.addEventListener('keydown', (e: any) => {
            if (e.key === 'Escape') _annotationMenuEl.classList.remove('visible');
        });
    }
    _annotationMenuEl.innerHTML = buildAnnotationFamilyMenuHtml({
        families: ANNOTATION_FAMILIES,
        familyIcons: FAMILY_ICONS,
        familyLabels: FAMILY_LABELS_PT,
        getIcon,
        translate: t,
    });
    // Click handler for menu items
    _annotationMenuEl.onclick = /** @param {any} nx */ (e: any) => {
        const item = e.target.closest('.panel-context-menu-item');
        if (!item) return;
        const family = item.dataset.family || '';
        if (family && _pendingAnnotation) {
            _addAnnotation(family, _pendingAnnotation.nx, _pendingAnnotation.ny);
            _pendingAnnotation = null;
        }
        _annotationMenuEl.classList.remove('visible');
    };
    // Position and show
    _annotationMenuEl.style.left = `${x}px`;
    _annotationMenuEl.style.top = `${y}px`;
    _annotationMenuEl.classList.add('visible');
    // Reposition if off-screen
    requestAnimationFrame(() => {
        const menuRect = _annotationMenuEl.getBoundingClientRect();
        const position = constrainFloatingMenuPosition(x, y, menuRect, window.innerWidth, window.innerHeight);
        _annotationMenuEl.style.left = `${position.left}px`;
        _annotationMenuEl.style.top = `${position.top}px`;
    });
}
/**
 * Add user annotation and update canvas + list.
 * Salva anotacao, redesenha canvas com icones, atualiza lista.
 * @param {string} nx
 * @param {number} nx - Normalized x (0-1)
 * @param {number} nx - Normalized y (0-1)
 */
function _addAnnotation(family: any, nx: any, ny: any) {
    _userAnnotations = addAnnotation(_userAnnotations, family, nx, ny);
    _redrawCanvas();
    _renderAnnotationList();
}
/**
 * Redraw canvas with base image + detected features + annotation markers.
 * Redesenha imagem base, sobrepoe retangulos das feicoes detectadas,
 * e marcadores de anotacao do usuario. Chamada apos analise e anotacoes.
 */
function _redrawCanvas() {
    const canvas = _el('aerial-preview-canvas');
    if (!canvas || !_currentImage) return;
    loadPreviewImage(_currentImage)
        .then((image: any) => {
            const ctx = paintImageOnCanvas({ canvas, image });
            const cw = canvas.width;
            const ch = canvas.height;
            if (_paintMode || _paintStrokes.length > 0) {
                _drawPaintOverlay(ctx, cw, ch);
            }
            drawAerialDetectedFeatureOverlays({
                ctx,
                detectedFeatures: _detectedFeatures,
                selectedFeatures: _selectedFeatures,
                extent: _currentExtent,
                canvasWidth: cw,
                canvasHeight: ch,
                familyColors: FAMILY_COLORS,
                familyLabels: FAMILY_LABELS_PT,
                drawFeatureOutline,
            });
            drawAerialAnnotationOverlays({
                ctx,
                annotations: _userAnnotations,
                canvasWidth: cw,
                canvasHeight: ch,
                familyColors: FAMILY_COLORS,
                drawAnnotationMarker,
            });
            canvas.style.cursor = _paintMode ? 'crosshair' : 'pointer';
        })
        .catch((error: any) => {
            log.error('Preview redraw failed', _errorMessage(error));
        });
}
// Feature rendering functions moved to recognition/featureRenderer.js
// drawFeatureOutline, roundRect, drawAnnotationMarker imported at top
/**
 * Render annotation list below the canvas.
 * Lista com marcadores coloridos e botao de remover ao hover.
 */
function _renderAnnotationList() {
    const section = _el('aerial-annotations-section');
    const list = _el('aerial-annotations-list');
    const countEl = _el('aerial-annotation-count');
    if (!section || !list) return;
    section.style.display = _userAnnotations.length > 0 ? '' : 'none';
    if (countEl) countEl.textContent = `(${_userAnnotations.length})`;
    list.innerHTML = buildAnnotationListHtml({
        annotations: _userAnnotations,
        familyIcons: FAMILY_ICONS,
        familyLabels: FAMILY_LABELS_PT,
        familyColors: FAMILY_COLORS,
        getIcon,
    });
}
/**
 * Remove a user annotation by index.
 * @param {number} index
 */
export function handleAerialRemoveAnnotation(index: any) {
    const nextAnnotations = removeAnnotationAtIndex(_userAnnotations, index);
    if (nextAnnotations.length !== _userAnnotations.length) {
        _userAnnotations = nextAnnotations;
        _redrawCanvas();
        _renderAnnotationList();
    }
}
/**
 * Clear all user annotations.
 * Limpa todas as anotacoes do usuario.
 */
export function handleAerialClearAnnotations() {
    _userAnnotations = clearAnnotations();
    _redrawCanvas();
    _renderAnnotationList();
}
/**
 * Clear all detected features (keep annotations).
 * Limpa resultados de analise mas mantem anotacoes do usuario.
 * Permite ao usuario recomecar a analise com diferentes parametros.
 */
export function handleAerialClearResults() {
    _detectedFeatures = [];
    _selectedFeatures = [];
    const container = _el('aerial-step-results');
    if (container) container.style.display = 'none';
    const confirmBtn = _el('aerial-confirm-btn');
    if (confirmBtn) confirmBtn.disabled = true;
    // Hide vectorize/export buttons on clear
    const vecBtn = _el('aerial-vectorize-btn');
    if (vecBtn) {
        vecBtn.style.display = 'none';
        vecBtn.disabled = true;
    }
    const exportBtn = _el('aerial-export-geojson-btn');
    if (exportBtn) {
        exportBtn.style.display = 'none';
        exportBtn.disabled = true;
    }
    _redrawCanvas();
    showToast(t('resultsCleared') || 'Results cleared', 'info');
}
// ----------------------------------------------------------------
// PAINT MODE â€” Interactive labeling for User NN method
// Modo de pintura: usuario clica e arrasta no canvas para rotular
// regioes por familia, usado para treinar a rede neural.
// ----------------------------------------------------------------
/** Paint family color map (same as FAMILY_COLORS) */
const PAINT_COLORS: AnyRecord = { ...FAMILY_COLORS };
/**
 * Initialize paint controls â€” build family selector buttons.
 * Cria botoes coloridos para selecionar a familia a ser pintada.
 */
async function _initPaintControls() {
    const container = _el('aerial-paint-families');
    if (!container || container.children.length > 0) return; // Already initialized
    const families = getClassifierFamilies();
    container.innerHTML = families
        .map(
            /** @param {string} fam */ (fam: any) => {
                const iconName = FAMILY_ICONS[fam] || 'map-pin';
                const label = FAMILY_LABELS_PT[fam] || fam;
                const color = PAINT_COLORS[fam] || '#888';
                const selected = fam === _paintFamily ? ' paint-family-selected' : '';
                return `<button class="btn btn-secondary paint-family-btn${selected}" data-family="${fam}"
                    style="font-size:10px; padding:2px 6px; border-color:${color}; ${selected ? `background:${color};color:#fff;` : ''}"
                    data-cc-call-click="handleAerialSelectPaintFamily|s:${encodeURIComponent(`${fam}`)}">
            <span data-icon="${iconName}" data-icon-size="12px"></span>
            ${label}
        </button>`;
            },
        )
        .join('');
    hydrateIcons(container);
    // Attach canvas mouse events for painting
    _attachPaintListeners();
    // Enable classify button if network is already trained
    const classifyBtn = _el('aerial-classify-btn');
    if (classifyBtn) classifyBtn.disabled = !isNetworkTrained();
    // Load persisted classifier state
    if (_paintStrokes.length === 0) {
        const stored = await loadClassifier();
        if (stored.length > 0) {
            _paintStrokes = stored;
            setClassifierStrokes(_paintStrokes);
            _rebuildLabelGrid();
            _redrawCanvas();
        }
    }
}
/**
 * Attach mousedown/mousemove/mouseup listeners to the preview canvas.
 * Listeners are capture-phase to prevent annotation click handler.
 */
function _attachPaintListeners() {
    const canvas = _el('aerial-preview-canvas');
    if (!canvas || canvas._paintListenersAttached) return;
    canvas.addEventListener(
        'mousedown',
        /** @param {MouseEvent} canvas */
        (e: any) => {
            if (!_paintMode || !_currentImage) return;
            e.preventDefault();
            e.stopPropagation();
            _isPainting = true;
            _currentStroke = { family: _paintFamily, points: [], brushSize: _paintBrushSize };
            _paintAt(e, canvas);
        },
        true,
    );
    canvas.addEventListener(
        'mousemove',
        /** @param {MouseEvent} canvas */
        (e: any) => {
            if (!_isPainting || !_paintMode) return;
            e.preventDefault();
            e.stopPropagation();
            _paintAt(e, canvas);
        },
        true,
    );
    /** @param {MouseEvent} canvas */
    const endPaint = (e: any) => {
        if (!_isPainting) return;
        if (_paintMode) {
            e.preventDefault();
            e.stopPropagation();
        }
        _isPainting = false;
        if (_currentStroke && _currentStroke.points.length > 0) {
            _paintStrokes.push(_currentStroke);
            setClassifierStrokes(_paintStrokes);
        }
        _currentStroke = null;
    };
    canvas.addEventListener('mouseup', endPaint, true);
    canvas.addEventListener('mouseleave', endPaint, true);
    canvas._paintListenersAttached = true;
}
/**
 * Paint at mouse position â€” stamp brush onto label grid + draw on canvas.
 * @param {MouseEvent} canvas
 * @param {HTMLCanvasElement} canvas
 */
function _paintAt(e: any, canvas: any) {
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    // Record normalized point
    if (_currentStroke) _currentStroke.points.push([nx, ny]);
    // Stamp onto label grid (512x512)
    const SIZE = 512;
    if (!_labelGrid) _labelGrid = new Uint8Array(SIZE * SIZE);
    const familyIdx = getFamilyIndex(_paintFamily) + 1; // 1-indexed (0=unlabeled)
    const gx = Math.floor(nx * SIZE);
    const gy = Math.floor(ny * SIZE);
    const r = _paintBrushSize;
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r2) continue;
            const px = gx + dx;
            const py = gy + dy;
            if (px < 0 || px >= SIZE || py < 0 || py >= SIZE) continue;
            _labelGrid[py * SIZE + px] = familyIdx;
        }
    }
    // Draw brush stroke on canvas directly (fast visual feedback)
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const canvasX = nx * canvas.width;
    const canvasY = ny * canvas.height;
    const canvasR = (r / SIZE) * canvas.width;
    const color = PAINT_COLORS[_paintFamily] || '#888';
    ctx.save();
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, canvasR, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.45;
    ctx.fill();
    ctx.restore();
}
/**
 * Rebuild label grid from paint strokes (after undo or import).
 * Reconstroi o grid de labels reexecutando todos os strokes.
 */
function _rebuildLabelGrid() {
    const SIZE = 512;
    _labelGrid = new Uint8Array(SIZE * SIZE);
    for (const stroke of _paintStrokes) {
        const familyIdx = getFamilyIndex(stroke.family) + 1;
        const r = stroke.brushSize || 12;
        const r2 = r * r;
        for (const [nx, ny] of stroke.points) {
            const gx = Math.floor(nx * SIZE);
            const gy = Math.floor(ny * SIZE);
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (dx * dx + dy * dy > r2) continue;
                    const px = gx + dx;
                    const py = gy + dy;
                    if (px < 0 || px >= SIZE || py < 0 || py >= SIZE) continue;
                    _labelGrid[py * SIZE + px] = familyIdx;
                }
            }
        }
    }
}
/**
 * Draw paint overlay on canvas â€” replays all strokes as colored circles.
 * Chamada dentro de _redrawCanvas() apos imagem base.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cw - Canvas width
 * @param {number} ch - Canvas height
 */
function _drawPaintOverlay(ctx: any, cw: any, ch: any) {
    if (_paintStrokes.length === 0) return;
    ctx.save();
    ctx.globalAlpha = 0.4;
    for (const stroke of _paintStrokes) {
        const color = PAINT_COLORS[stroke.family] || '#888';
        const r = ((stroke.brushSize || 12) / 512) * cw;
        ctx.fillStyle = color;
        for (const [nx, ny] of stroke.points) {
            ctx.beginPath();
            ctx.arc(nx * cw, ny * ch, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}
// ----------------------------------------------------------------
// PAINT MODE HANDLERS â€” Exported for window.* registration
// ----------------------------------------------------------------
/**
 * Select paint family (which type to paint on the canvas).
 * @param {string} family
 */
export function handleAerialSelectPaintFamily(family: any) {
    _paintFamily = family;
    // Update button highlighting
    const btns = _qsa('.paint-family-btn');
    btns.forEach(
        /** @param {any} value */ (btn: any) => {
            const fam = btn.dataset.family || '';
            const color = PAINT_COLORS[fam] || '#888';
            const isSelected = fam === family;
            btn.classList.toggle('paint-family-selected', isSelected);
            btn.style.background = isSelected ? color : '';
            btn.style.color = isSelected ? '#fff' : '';
        },
    );
}
/**
 * Change paint brush size.
 * @param {string|number} value
 */
export function handleAerialBrushChange(value: any) {
    _paintBrushSize = parseInt(String(value), 10) || 12;
    const valEl = _el('aerial-paint-brush-val');
    if (valEl) valEl.textContent = String(_paintBrushSize);
}
/**
 * Train the neural network from painted labels.
 * Extrai dados de treino do grid pintado e treina a rede.
 */
export async function handleAerialTrainNN() {
    if (!_currentImage || !_labelGrid) {
        showToast(t('paintLabelsFirst') || 'Paint some labels on the image first', 'error');
        return;
    }
    // Count labeled pixels
    let labelCount = 0;
    for (let i = 0; i < _labelGrid.length; i++) {
        if (_labelGrid[i] > 0) labelCount++;
    }
    if (labelCount < 50) {
        showToast(t('paintLabelsFirst') || 'Paint more labels (minimum ~50 pixels)', 'error');
        return;
    }
    const trainBtn = _el('aerial-train-btn') as HTMLButtonElement | null;
    const statusEl = _el('aerial-train-status');
    if (trainBtn) trainBtn.disabled = true;
    if (statusEl) {
        statusEl.style.display = '';
        statusEl.textContent = 'Extracting training data...';
    }
    try {
        // Reset network for fresh training
        resetNetwork();
        // Extract training data from image + label grid
        const data: any = await extractTrainingData(_currentImage, _labelGrid);
        if (statusEl) statusEl.textContent = `Training on ${data.length} samples...`;
        // Train with progress feedback
        const result = trainNetwork(data, {
            epochs: 100,
            lr: 0.025,
            batchSize: 64,
            onProgress: /** @param {any} progressInfo */ (progressInfo: any) => {
                const { epoch, loss, accuracy, total } = progressInfo;
                if (statusEl) {
                    statusEl.textContent = `Epoch ${epoch + 1}/${total} â€” loss: ${loss.toFixed(3)}, acc: ${(accuracy * 100).toFixed(1)}%`;
                }
            },
        });
        // Persist classifier
        persistClassifier(_paintStrokes);
        // Update UI
        const classifyBtn = _el('aerial-classify-btn') as HTMLButtonElement | null;
        if (classifyBtn) classifyBtn.disabled = false;
        if (statusEl)
            statusEl.textContent = `Done â€” loss: ${result.finalLoss.toFixed(3)}, accuracy: ${(result.accuracy * 100).toFixed(1)}%`;
        showToast(`Network trained: ${(result.accuracy * 100).toFixed(0)}% accuracy`, 'success');
    } catch (err: any) {
        log.error('Neural network training failed', _errorMessage(err));
        showToast(_errorMessage(err) || 'Training failed', 'error');
        if (statusEl) statusEl.textContent = 'Training failed.';
    } finally {
        if (trainBtn) trainBtn.disabled = false;
    }
}
/**
 * Classify image using the trained neural network.
 * Redireciona para handleAerialAnalyze com metodo 'usernn' selecionado.
 */
export function handleAerialClassifyNN() {
    if (!isNetworkTrained()) {
        showToast(t('trainNetworkFirst') || 'Train the network first', 'error');
        return;
    }
    // Ensure usernn radio is selected
    const radio = _el('aerial-method-usernn') as HTMLInputElement | null;
    if (radio) radio.checked = true;
    handleAerialAnalyze();
}
/**
 * Clear all painted labels and reset.
 */
export function handleAerialClearPaint() {
    _paintStrokes = [];
    setClassifierStrokes(_paintStrokes);
    _labelGrid = new Uint8Array(512 * 512);
    _currentStroke = null;
    _isPainting = false;
    const statusEl = _el('aerial-train-status');
    if (statusEl) {
        statusEl.style.display = 'none';
        statusEl.textContent = '';
    }
    _redrawCanvas();
    persistClassifier([]);
    showToast(t('labelsCleared') || 'Labels cleared', 'info');
}
/**
 * Undo the last paint stroke.
 */
export function handleAerialUndoPaint() {
    if (_paintStrokes.length === 0) return;
    _paintStrokes.pop();
    setClassifierStrokes(_paintStrokes);
    _rebuildLabelGrid();
    _redrawCanvas();
}
// ----------------------------------------------------------------
// VECTORIZATION ENGINE â€” Handlers
// Converte mascara semantica em GeoJSON georreferenciado via OpenCV.js
// ----------------------------------------------------------------
/**
 * Run Universal Vectorization Engine on cached category grid.
 * Requer que uma analise ML ou Color tenha sido executada antes
 * para cachear o _lastCategoryGrid.
 */
export async function handleAerialVectorize() {
    if (!_lastCategoryGrid) {
        showToast('Run ML or Color analysis first to generate a category grid', 'error');
        return;
    }
    if (!_currentImage || !_currentExtent) {
        showToast('No image or extent available', 'error');
        return;
    }
    const processing = _el('aerial-processing');
    if (processing) processing.style.display = '';
    _updateProgress('Loading vectorization engine...', 0);
    try {
        const _vecFn = _vectorizeOverride || vectorize;
        _lastGeoJSON = await _vecFn({
            imageDataUrl: _currentImage,
            categoryGrid: _lastCategoryGrid,
            extent: _currentExtent,
            onProgress: /** @param {any} info */ (info: any) => _updateProgress(info.message, info.progress),
        });
        const count = _lastGeoJSON.features?.length ?? 0;
        showToast(`Vectorization complete: ${count} GeoJSON features`, 'success');
        // Show Export GeoJSON button after successful vectorization
        const exportBtn = _el('aerial-export-geojson-btn');
        if (exportBtn && _lastGeoJSON) {
            exportBtn.style.display = '';
            exportBtn.disabled = false;
        }
    } catch (err: any) {
        log.error('Vectorization failed', _errorMessage(err));
        showToast(_errorMessage(err) || 'Vectorization failed', 'error');
    } finally {
        if (processing) processing.style.display = 'none';
    }
}
/**
 * Export last vectorized GeoJSON as downloadable .geojson file.
 * Padrao anchor-click download (mesmo de io/encoder.js).
 */
export function handleAerialExportGeoJSON() {
    if (!_lastGeoJSON) {
        showToast('Run vectorization first', 'error');
        return;
    }
    const json = JSON.stringify(_lastGeoJSON, null, 2);
    const blob = new Blob([json], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vectorized-features.geojson';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const count = _lastGeoJSON.features?.length ?? 0;
    showToast(`Exported ${count} features as GeoJSON`, 'success');
}
// ----------------------------------------------------------------
// SEGMENT-GEOSPATIAL HANDLERS â€” samAuto, textPrompt, tileMap
// ----------------------------------------------------------------
/**
 * Handle text prompt input change for CLIP segmentation.
 * Armazena texto para uso quando usuario clicar Analyze.
 * @param {string} text
 */
export function handleAerialTextPromptChange(text: any) {
    _textPrompt = text || '';
}
/**
 * Handle tile map segmentation â€” opens map picker, fetches tiles, segments.
 * Pipeline: mapPicker(bounds) â†’ stitchTiles â†’ SAM autoMask â†’ features.
 */
export async function handleAerialTileMapSegment() {
    const processing = _el('aerial-processing');
    if (processing) processing.style.display = '';
    _updateProgress(t('selectMapRegion') || 'Select a region on the map...', 5);
    try {
        const { openMapPickerModal } = await import('../ui/mapPicker.js');
        const result = await openMapPickerModal({ mode: 'bounds' });
        if (!result || !result.sw) {
            // User cancelled
            if (processing) processing.style.display = 'none';
            return;
        }
        _updateProgress(t('tileMapStitching') || 'Fetching satellite tiles...', 15);
        _autoMaskAbort = new AbortController();
        const tileResult = await segmentFromTiles(result.sw, result.ne, {
            outputSize: 512,
            signal: _autoMaskAbort.signal,
            onProgress: /** @param {any} info */ (info: any) => _updateProgress(info.message, info.progress),
        });
        _autoMaskAbort = null;
        // Set handler state with stitched image
        _currentImage = tileResult.imageDataUrl;
        _currentExtent = tileResult.extent;
        // Load stitched image into preview canvas
        _showImagePreview(tileResult.imageDataUrl);
        // Process features through standard dedup/display pipeline (5m threshold)
        const newFeatures = tileResult.features;
        const unique = filterDuplicateFeatures(newFeatures, _detectedFeatures, 5);
        _detectedFeatures = _detectedFeatures.concat(unique);
        _assignSequentialNames(_detectedFeatures);
        const prevLen = _selectedFeatures.length;
        _selectedFeatures = _detectedFeatures.map((_: any, i: any) => (i < prevLen ? (_selectedFeatures[i] ?? true) : true));
        _showResults();
        _redrawCanvas();
        showToast(
            t('tileMapComplete', { count: unique.length }) ||
                `${unique.length} features detected from satellite imagery`,
            'success',
        );
    } catch (err: any) {
        if (err.name === 'AbortError') {
            showToast(t('analysisAborted') || 'Analysis cancelled', 'info');
        } else {
            log.error('Tile map segmentation failed', _errorMessage(err));
            showToast(_errorMessage(err) || 'Tile map segmentation failed', 'error');
        }
    } finally {
        if (processing) processing.style.display = 'none';
        const analyzeBtn = _el('aerial-analyze-btn') as HTMLButtonElement | null;
        if (analyzeBtn) analyzeBtn.disabled = false;
    }
}
/**
 * Cancel in-flight auto-mask / text-prompt analysis.
 */
export function handleAerialAbortAutoMask() {
    if (_autoMaskAbort) {
        _autoMaskAbort.abort();
        _autoMaskAbort = null;
    }
}
/**
 * Set internal closure state for E2E testing.
 * Permite que testes populem estado sem passar pelo fluxo real.
 * @private â€” Somente para testes
 */
/** @param {any} state */
export function _setTestState(state: any) {
    if (state.image !== undefined) _currentImage = state.image;
    if (state.extent !== undefined) _currentExtent = state.extent;
    if (state.grid !== undefined) _lastCategoryGrid = state.grid;
    if (state.geojson !== undefined) _lastGeoJSON = state.geojson;
    if (state.vectorizeOverride !== undefined) _vectorizeOverride = state.vectorizeOverride;
    if (state.changeComparisonImage !== undefined) _changeComparisonImage = state.changeComparisonImage;
}
// ----------------------------------------------------------------
// GEOAI HANDLERS â€” Change Detection, Classification, Enhance, Spectral, Embeddings
// ----------------------------------------------------------------
/**
 * Handle comparison image upload for Change Detection.
 */
export async function handleAerialChangeImageUpload() {
    const input = _el('aerial-change-file') as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        showToast(t('unsupportedImageFormat') || 'Unsupported image format. Use JPEG, PNG, WebP, or TIFF.', 'error');
        return;
    }
    try {
        _changeComparisonImage = await readFileAsDataUrl(file);
        showToast(t('comparisonImageLoaded') || 'Comparison image loaded', 'success');
    } catch (err: any) {
        log.error('Failed to read comparison image', _errorMessage(err));
        showToast(_errorMessage(err) || 'Failed to read comparison image', 'error');
    }
}
/**
 * Show change overlay on the preview canvas.
 * @param {string} overlayDataUrl - PNG overlay with transparency
 */
function _showChangeOverlay(overlayDataUrl: any) {
    const canvas = _el('aerial-preview-canvas');
    if (!canvas) return;
    loadPreviewImage(overlayDataUrl)
        .then((image: any) => {
            paintImageOnCanvas({ canvas, image });
        })
        .catch((error: any) => {
            log.error('Change overlay load failed', _errorMessage(error));
        });
}
/**
 * Enhance current image using super-resolution.
 */
export async function handleAerialEnhanceImage() {
    if (!_currentImage) {
        showToast('Load an image first', 'error');
        return;
    }
    const btn = _el('aerial-enhance-btn') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    try {
        showToast(t('enhancing') || 'Enhancing image...', 'info');
        const enhanced = await enhanceImage(_currentImage, { tier: 'canvas' });
        _currentImage = enhanced;
        _showImagePreview(enhanced);
        showToast(t('enhanceComplete') || 'Image enhanced (2x sharpened)', 'success');
    } catch (err: any) {
        log.error('Image enhancement failed', _errorMessage(err));
        showToast(_errorMessage(err) || 'Enhancement failed', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}
/**
 * Index current tile embedding.
 */
export async function handleAerialIndexTile() {
    if (!_currentImage) {
        showToast('Load an image first', 'error');
        return;
    }
    try {
        const embedding = await computeHandcraftedEmbedding(_currentImage);
        const tileId = `tile-${Date.now()}`;
        await storeTileEmbedding(tileId, embedding, { timestamp: Date.now() });
        const stats = await getEmbeddingStats();
        const resultEl = _el('aerial-embeddings-result');
        if (resultEl) {
            resultEl.style.display = '';
            resultEl.textContent = `Indexed (${stats.count} tiles, ${stats.method})`;
        }
        showToast(`Image indexed (${stats.count} tiles total)`, 'success');
    } catch (err: any) {
        log.error('Image embedding indexing failed', _errorMessage(err));
        showToast(_errorMessage(err) || 'Indexing failed', 'error');
    }
}
/**
 * Search for similar tiles in the embedding index.
 */
export async function handleAerialSearchSimilar() {
    if (!_currentImage) {
        showToast('Load an image first', 'error');
        return;
    }
    try {
        const embedding = await computeHandcraftedEmbedding(_currentImage);
        const results = await searchSimilarTiles(embedding, { topK: 5 });
        const resultEl = _el('aerial-embeddings-result');
        if (resultEl) {
            resultEl.style.display = '';
            if (results.length === 0) {
                resultEl.textContent = 'No indexed tiles found. Index images first.';
            } else {
                resultEl.innerHTML = results
                    .map(
                        /** @param {any} r @param {number} i */
                        (r: any, i: any) =>
                            `<div>${i + 1}. ${escapeHtml(r.tileId)} â€” similarity: ${(r.similarity * 100).toFixed(1)}%</div>`,
                    )
                    .join('');
            }
        }
        showToast(`Found ${results.length} similar tiles`, 'info');
    } catch (err: any) {
        log.error('Similar tile search failed', _errorMessage(err));
        showToast(_errorMessage(err) || 'Search failed', 'error');
    }
}
// ----------------------------------------------------------------
// GEOREFERENCE WRAPPER
// ----------------------------------------------------------------
export async function handleAerialGeoreference() {
    return _handleAerialGeoreference({ currentImage: _currentImage, requestUIRefresh });
}
// ----------------------------------------------------------------
// EXPORT HANDLER OBJECT
// ----------------------------------------------------------------
export const aerialHandlers = {
    handleOpenAerialModal,
    handleAerialImageUpload,
    handleAerialUseBoundary,
    handleAerialAnalyze,
    handleAerialToggleFeature,
    handleAerialSelectAll,
    handleAerialConfirmImport,
    handleAerialSetExtent,
    handleAerialMethodChange,
    handleAerialAutoCalibrate,
    handleAerialCalibrationChange,
    handleAerialResetCalibration,
    handleAerialToggleAdvanced,
    handleAerialRemoveAnnotation,
    handleAerialClearAnnotations,
    handleAerialClearResults,
    handleAerialSelectPaintFamily,
    handleAerialBrushChange,
    handleAerialTrainNN,
    handleAerialClassifyNN,
    handleAerialClearPaint,
    handleAerialUndoPaint,
    handleAerialVectorize,
    handleAerialExportGeoJSON,
    handleAerialTextPromptChange,
    handleAerialTileMapSegment,
    handleAerialAbortAutoMask,
    handleAerialGeoreference,
    handleAerialChangeImageUpload,
    handleAerialEnhanceImage,
    handleAerialIndexTile,
    handleAerialSearchSimilar,
    _setTestState,
};
//# sourceMappingURL=aerial.js.map
