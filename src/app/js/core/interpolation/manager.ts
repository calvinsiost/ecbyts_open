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
   INTERPOLATION MANAGER — Estado, CRUD e orquestração
   ================================================================

   Gerencia layers de interpolação: terreno, nível d'água, geologia,
   contaminação. Orquestra fetcher → engine/worker → surfaceBuilder.

   PADRÃO:
   - Estado em closure (Map de layers)
   - Persistência via localStorage + model export/import
   - CustomEvent 'interpolationChanged' para UI reativa
   - setInterpolationUpdateAllUI() para injeção de dependência

   ================================================================ */
import { generateId } from '../../utils/helpers/id.js';
import { t } from '../../utils/i18n/translations.js';
import { createTHREEProxy } from '../three-lazy.js';
const THREE: any = createTHREEProxy();
import { computeTerrainGridStats, enhanceTerrainGridRelief } from '../elements/randomModelTerrain.js';
import { fetchTerrainGrid, toRelativeElevation, resampleGrid, buildSatelliteUrls } from './fetcher.js';
import { interpolateGrid } from './engine.js';
import { buildContoursFromGrid } from './contours.js';
import {
    dedupTerrainConfigs,
    resolveImportTerrainCoords,
    extractVisualChanges,
    buildLayerExportPayload,
} from './_interpolationPure.js';
import { buildSurfaceMesh, disposeSurface, setSurfaceWireframe, setSurfaceOpacity, applySatelliteTexture, toggleSurfaceTexture, } from './surfaceBuilder.js';
import { DEFAULT_RAMPS, GEOLOGY_SOIL_COLORS, sampleRamp } from './colorRamps.js';
import { extractIsosurface } from './isosurface.js';
import { TOPOGRAPHY_INPUT_LIMITS, normalizeTopographyPoints, resolveManualTerrainMethod, serializeManualTerrainPayload, sampleElevationGridLHS, } from './topographyInput.js';
// Adopt own pure helpers (Module C extraction commit 8a4759bc) — dedup bilinear x2 + mesh offset.
import { sampleGridAt, getSurfaceMeshOffset as _getSurfaceMeshOffsetPure } from './_interpolationGridPure.js';
import { requestRender, getElementsGroup } from '../../utils/scene/setup.js';
import { getAllElements, getMeshByElementId } from '../elements/manager.js';
import { rebuildRiverGeometry } from '../elements/meshFactory.js';
import { hasOrigin, getOrigin, setOrigin } from '../io/geo/coordinates.js';
import { showToast } from '../../utils/ui/toast.js';
import { isEphemeral } from '../../utils/storage/storageMonitor.js';
import { idbSet, idbGetWithLegacy } from '../../utils/storage/idbStore.js';
import { createLogger } from '../../utils/helpers/logger.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
const log = createLogger('Interpolation');

// ── Quiet mode anti-flood (Calvin 2026-06-11 "toasts pulando sem parar") ──
// Chamadas PROGRAMÁTICAS (random build, auto-terrain background) silenciam
// os toasts deste módulo — medido: 8× "Interpolating..." + 8× "complete!" +
// 6× "Fetching elevation data..." metralhando o usuário no boot. Uso manual
// (botões/painéis) continua barulhento. TTL de segurança via performance.now
// (monotônico, NÃO mockado pelo deterministic runtime — Date.now() congela
// dentro do random build): se o caller esquecer/crashar antes do reset, o
// quiet expira sozinho e não silencia a UI manual para sempre.
let _toastsQuietUntil = 0;
/**
 * Liga/desliga modo silencioso dos toasts de interpolação.
 * @param {boolean} quiet
 * @param {number} [ttlMs=90000] - validade máxima do silêncio (fail-safe)
 */
export function setInterpolationToastsQuiet(quiet: any, ttlMs = 90000) {
    _toastsQuietUntil = quiet ? performance.now() + ttlMs : 0;
}
/**
 * showToast respeitando quiet mode — toda notificação do módulo passa aqui.
 * @param {string} message @param {string} [type] @param {number} [duration?]
 */
function _toast(message: any, type: any = 'info', duration?: any) {
    if (performance.now() < _toastsQuietUntil) {
        console.debug('[interpolation:quiet-toast]', type, String(message).slice(0, 80));
        return;
    }
    showToast(message, type, duration);
}
/**
 * @typedef {Record<string, any>} AnyRecord
 * @typedef {{ label?: string, cols: number, rows: number }} GridSize
 * @typedef {{ minX: number, maxX: number, minZ: number, maxZ: number }} InterpolationBounds
 * @typedef {{ x: number, y?: number, z: number, value?: number, [key: string]: any }} SpatialPoint
 * @typedef {{ opacity: number, showContours: boolean, showContourLabels: boolean, wireframe: boolean, zOffset: number, renderOrder: number, verticalScale: number }} LayerVisualDefaults
 * @typedef {{ id: string, type: string, name: string, method: string, methodParams: AnyRecord, dataSource: string, coordinateMode: string|null, parameterId: string|null, matrix: string|null, campaignId: string|null, geologyContact: string|null, points: SpatialPoint[], sourcePoints: any[]|null, grid: any, gridSize: GridSize, bounds: InterpolationBounds|null, colorRamp: string, opacity: number, visible: boolean, wireframe: boolean, showContours: boolean, showContourLabels: boolean, contourDensity: string, contourObjectIds: string[], contourLabelObjectIds: string[], fixedColor: string|null, thresholdValue: number|null, isosurfaceMeshId: string|null, meshId: string|null, stats: AnyRecord|null, renderOrder: number, zOffset: number, verticalScale: number, textureMode?: string|null, satelliteUrls?: string[]|null, visualReliefBlend?: number, _points3D?: SpatialPoint[], [key: string]: any }} InterpolationLayer
 * @typedef {Partial<InterpolationLayer> & AnyRecord} LayerConfig
 * @typedef {{ dataSource?: 'manual'|'auto', coordinateMode?: 'utm'|'scene', dataPoints?: any[], sourcePoints?: any[]|null, method?: 'idw'|'rbf'|'kriging'|string, gridSize?: GridSize, zOffset?: number }} TerrainLayerOptions
 * @typedef {{ gridSize?: GridSize, method?: string, showContours?: boolean, showContourLabels?: boolean, contourDensity?: string, matrix?: string|null, campaignId?: string|null, dataPoints?: any[], contactType?: 'top'|'bottom'|string, zOffset?: number, parameterId?: string, thresholdValue?: number|null, include3D?: boolean, tolerance?: number|null }} LayerOptions
 */
/** @type {any} */
const Three = THREE;
/**
 * @param {unknown} error
 * @returns {string}
 */
function _errorMessage(error: any) {
    return error instanceof Error ? error.message : String(error);
}
// ARCH-MONO-001 Phase 3: extracted helpers → ./helpers.js
import { build3DGrid as _build3DGrid, computeBoundsFromPoints as _computeBoundsFromPoints, getBoundaryBounds as _getBoundaryBounds, collectObservationPointsImpl as _collectObservationPoints, GEOLOGY_SOIL_LABELS, collectGeologyContactPointsImpl as _collectGeologyContactPoints, normalizeGridSize as _normalizeGridSize, normalizeManualPoints as _normalizeManualPoints, } from './helpers.js';
/** Alias local — objeto genérico (mesma semântica do JSDoc `@typedef AnyRecord`). */
type AnyRecord = Record<string, any>;
// ----------------------------------------------------------------
// ESTADO
// ----------------------------------------------------------------
/** @type {Map<string, InterpolationLayer>} */
const _layers = new Map();
/** @type {any|null} grupo na cena para superfícies */
let _interpolationGroup: any = null;
/** @type {Worker|null} */
const _worker = null;
/** @type {((...args: any[]) => any)|null} */
let requestUIRefresh: any = null;
/** @type {Map<string, {resolve: Function, reject: Function}>} */
const _pendingWorker = new Map();
const STORAGE_KEY = 'ecbyts-interpolation';
const INTERPOLATION_PERSIST_AFTER_BOOT_DELAY_MS = 30000;
const INTERPOLATION_PERSIST_IDLE_TIMEOUT_MS = 3000;
/** @type {string|null} layer atualmente selecionada */
let _selectedLayerId: any = null;
/** @type {any|null} */
let _persistTimer: any = null;
/** @type {any|null} */
let _persistIdleHandle: any = null;
/** @type {AnyRecord[]|null} */
let _pendingPersistPayload: AnyRecord[] | null = null;
let _suppressPersistence = false;
let _persistLifecycleBound = false;
// Memoization cache for _collectObservationPoints.
// Key: serialized (parameterId, matrix, campaignId, include3D, tolerance).
// Invalidated on element/observation/campaign CRUD and model clear (P1-A fix).
/** @type {Map<string, {points: SpatialPoint[], ts: number}>} */
const _collectionCache = new Map();
const _COLLECTION_CACHE_TTL_MS = 30_000; // 30s safety TTL against stale sensor data
// ----------------------------------------------------------------
// GRID SIZES disponíveis para o usuário
// ----------------------------------------------------------------
export const GRID_SIZES = [
    { label: '32×32', cols: 32, rows: 32 },
    { label: '64×64', cols: 64, rows: 64 },
    { label: '128×128', cols: 128, rows: 128 },
    { label: '256×256', cols: 256, rows: 256 },
];
const DEFAULT_GRID = { cols: 64, rows: 64 };
const CONTOUR_Z_OFFSET = 0.06;
const CONTOUR_LABEL_Z_OFFSET = 0.18;
/** @type {Record<string, number>} */
const CONTOUR_DENSITY_LEVELS = { low: 6, medium: 10, high: 14 };
const MAX_CONTOUR_LABELS = 80;
const CONTOUR_FEATURE_FLAGS = /** @type {Readonly<Record<string, boolean>>} */ (Object.freeze({
    water_table: true,
    terrain: true,
    contamination: true,
    geology: false,
    custom: false,
}));
// ----------------------------------------------------------------
// DEFAULTS VISUAIS POR TIPO DE CAMADA
// ----------------------------------------------------------------
/**
 * Defaults visuais por tipo de camada para melhor diferenciação.
 * Aplicados automaticamente em addLayer() quando não especificados.
 */
// verticalScale = 1 para TODOS os tipos - VE uniforme via elementsGroup.scale.y (vizSettings).
// Regra: exageracao vertical NUNCA diferente por tipo de layer (feedback memoria).
const LAYER_VISUAL_DEFAULTS = /** @type {Readonly<Record<string, LayerVisualDefaults>>} */ (Object.freeze({
    terrain: {
        opacity: 0.36,
        showContours: false,
        showContourLabels: false,
        wireframe: false,
        zOffset: 0,
        renderOrder: 1,
        verticalScale: 1,
    },
    water_table: {
        opacity: 0.24,
        showContours: true,
        showContourLabels: true,
        wireframe: false,
        zOffset: 0.05,
        renderOrder: 2,
        verticalScale: 1,
    },
    potentiometric: {
        opacity: 0.32,
        showContours: true,
        showContourLabels: true,
        wireframe: false,
        zOffset: 0.08,
        renderOrder: 3,
        verticalScale: 1,
    },
    contamination: {
        opacity: 0.46,
        showContours: false,
        showContourLabels: false,
        wireframe: false,
        zOffset: 0.1,
        renderOrder: 4,
        verticalScale: 1,
    },
    geology: {
        opacity: 0.34,
        showContours: true,
        showContourLabels: false,
        wireframe: false,
        zOffset: 0.3,
        renderOrder: 5,
        verticalScale: 1,
    },
    custom: {
        opacity: 0.5,
        showContours: false,
        showContourLabels: false,
        wireframe: false,
        zOffset: 0.12,
        renderOrder: 4,
        verticalScale: 1,
    },
}));
// ----------------------------------------------------------------
// INICIALIZAÇÃO
// ----------------------------------------------------------------
/**
 * Inicializa o módulo de interpolação.
 * Cria o grupo na cena e restaura layers do localStorage.
 */
export async function initInterpolation() {
    // O grupo Three.js é injetado externamente via setInterpolationGroup()
    // antes desta chamada (em main.js: setInterpolationGroup(getInterpolationGroup()))
    await _restoreFromStorage();
}
/**
 * Injeta o grupo Three.js (chamado por setup.js).
 * @param {any} group
 */
export function setInterpolationGroup(group: any) {
    _interpolationGroup = group;
    // Recomputa layers restauradas sem mesh (race condition: restore antes do grupo Three.js)
    _recomputePendingLayers();
}
/**
 * Recomputa layers restauradas sem mesh.
 * Chamada por setInterpolationGroup() quando o grupo Three.js fica disponível.
 */
async function _recomputePendingLayers() {
    if (!_interpolationGroup)
        return;
    let recomputed = 0;
    for (const [, layer] of _layers) {
        if (layer.meshId)
            continue;
        log.debug('[Interpolation] Recomputing pending layer:', layer.id, 'type:', layer.type);
        try {
            if (layer.type === 'terrain') {
                await _recomputeTerrainLayer(layer);
            }
            else {
                await recomputeLayer(layer.id);
            }
            recomputed++;
        } catch (err: any) {
            log.warn('Pending layer recompute failed:', layer.id, _errorMessage(err));
        }
    }
    if (recomputed > 0)
        _notify();
}
/**
 * Injeta callback de refresh de interface.
 * @param {(...args: any[]) => any} fn
 */
export function setInterpolationUpdateAllUI(fn: any) {
    requestUIRefresh = fn;
}
function requestInterpolationManagerUIRefresh(reason = 'interpolation.changed') {
    if (typeof requestUIRefresh !== 'function') return;
    const domains = [
        UI_INVALIDATION_DOMAINS.INTERPOLATION,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains) {
        requestUIRefresh(domain, reason);
    }
}
// ----------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------
/**
 * Resolve visual defaults and ramp for a layer type.
 * @param {string} type
 * @returns {{ defaults: LayerVisualDefaults, ramp: string }}
 */
function _resolveLayerDefaults(type: any) {
    const defaults = (LAYER_VISUAL_DEFAULTS as any)[type] || LAYER_VISUAL_DEFAULTS.custom;
    const rampMap = /** @type {Record<string, string>} */ (DEFAULT_RAMPS);
    const ramp = (rampMap as any)[type] || 'generic';
    return { defaults, ramp };
}

/**
 * Build the initial layer object from config and resolved defaults.
 * Preserves exact field order and semantics of the original addLayer().
 *
 * @param {any} value
 * @param {string} type
 * @param {{ defaults: LayerVisualDefaults, ramp: string }} defaultsAndRamp
 * @returns {InterpolationLayer}
 */
/**
 * Clone an array config value or return a fallback.
 * @param {any} value
 * @returns {any[]}
 */
function _cloneArrayOrEmpty(value: any): any[] {
    return Array.isArray(value) ? [...value] : [];
}

/**
 * Build the visual subset of a layer object from config and defaults.
 * @param {any} config
 * @param {any} defaults
 * @returns {AnyRecord}
 */
function _buildLayerVisualFields(config: any, defaults: any): AnyRecord {
    return {
        opacity: config.opacity ?? defaults.opacity,
        visible: config.visible ?? true,
        wireframe: config.wireframe ?? defaults.wireframe,
        showContours: config.showContours ?? defaults.showContours,
        showContourLabels: config.showContourLabels ?? defaults.showContourLabels,
        contourDensity: config.contourDensity || 'medium',
        contourObjectIds: _cloneArrayOrEmpty(config.contourObjectIds),
        contourLabelObjectIds: _cloneArrayOrEmpty(config.contourLabelObjectIds),
        fixedColor: config.fixedColor || null,
        thresholdValue: config.thresholdValue ?? null,
        renderOrder: config.renderOrder ?? defaults.renderOrder,
        zOffset: config.zOffset ?? defaults.zOffset,
        verticalScale: config.verticalScale ?? defaults.verticalScale ?? 1,
    };
}

/**
 * Build the identity fields of a layer object.
 * @param {any} config
 * @param {string} type
 * @returns {AnyRecord}
 */
function _buildLayerIdentityFields(config: any, type: string): AnyRecord {
    return {
        id: config.id || generateId(type || 'layer'),
        type: type,
        name: config.name || 'Nova Camada',
    };
}

/**
 * Build the source/data fields of a layer object.
 * @param {any} config
 * @param {string} ramp
 * @returns {AnyRecord}
 */
function _buildLayerSourceFields(config: any, ramp: string): AnyRecord {
    return {
        method: config.method || 'idw',
        methodParams: config.methodParams || { power: 2 },
        dataSource: config.dataSource || 'auto',
        coordinateMode: config.coordinateMode || null,
        parameterId: config.parameterId || null,
        matrix: config.matrix || null,
        campaignId: config.campaignId || null,
        geologyContact: config.geologyContact || null,
        points: config.points || [],
        sourcePoints: config.sourcePoints || null,
        grid: null,
        gridSize: config.gridSize || { ...DEFAULT_GRID },
        bounds: config.bounds || null,
        colorRamp: config.colorRamp || ramp,
        isosurfaceMeshId: null,
        meshId: null,
        stats: null,
    };
}

/**
 * Build the data/config subset of a layer object.
 * @param {any} config
 * @param {string} type
 * @param {string} ramp
 * @returns {AnyRecord}
 */
function _buildLayerDataFields(config: any, type: string, ramp: string): AnyRecord {
    return {
        ..._buildLayerIdentityFields(config, type),
        ..._buildLayerSourceFields(config, ramp),
    };
}

function _buildLayerObject(config: any, type: any, { defaults, ramp }: any) {
    return {
        ..._buildLayerDataFields(config, type, ramp),
        ..._buildLayerVisualFields(config, defaults),
    };
}

/**
 * Apply geology layer color migration for legacy models without fixedColor.
 * @param {InterpolationLayer} layer
 */
function _applyGeologyColorMigration(layer: any) {
    if (!layer.fixedColor && layer.type === 'geology' && layer.parameterId) {
        layer.fixedColor = (GEOLOGY_SOIL_COLORS as any)[layer.parameterId] || '#888888';
    }
}

/**
 * Adiciona uma layer de interpolação.
 * @param {LayerConfig} config - configuração parcial da layer
 * @returns {InterpolationLayer} layer criada
 */
export function addLayer(config: any) {
    const type = typeof config.type === 'string' ? config.type : 'custom';
    const defaultsAndRamp = _resolveLayerDefaults(type);
    const layer = _buildLayerObject(config, type, defaultsAndRamp);
    _applyGeologyColorMigration(layer);
    _layers.set(layer.id, layer);
    _persist();
    _notify();
    return layer;
}
/**
 * Remove uma layer.
 * @param {string} id
 */
export function removeLayer(id: any) {
    const layer = _layers.get(id);
    if (!layer)
        return;
    _clearLayerContours(layer);
    // Remove mesh da cena
    if (layer.meshId && _interpolationGroup) {
        const mesh = _interpolationGroup.getObjectByProperty('uuid', layer.meshId);
        if (mesh)
            disposeSurface(mesh);
    }
    // Restaura overlay da boundary se terreno com satélite foi removido
    if (layer.type === 'terrain' && layer.textureMode === 'satellite') {
        _setBoundaryOverlayVisible(true);
    }
    _layers.delete(id);
    _persist();
    _notify();
    requestRender();
}
/**
 * Remove all interpolation layers.
 * Limpa todas as superficies (terreno, water table, etc.).
 */
export function clearAllLayers() {
    const ids = [..._layers.keys()];
    ids.forEach((id: any) => removeLayer(id));
    _selectedLayerId = null;
}
/**
 * Atualiza propriedades de uma layer.
 * @param {string} id
 * @param {Partial<InterpolationLayer> & AnyRecord} changes
 */
export function updateLayer(id: any, changes: any) {
    const layer = _layers.get(id);
    if (!layer)
        return;
    Object.assign(layer, changes);
    // Aplica mudanças visuais imediatas
    const mesh = _getMesh(layer);
    if (mesh) {
        if ('opacity' in changes)
            setSurfaceOpacity(mesh, layer.opacity);
        if ('wireframe' in changes)
            setSurfaceWireframe(mesh, layer.wireframe);
        if ('visible' in changes)
            mesh.visible = layer.visible;
        if ('textureMode' in changes) {
            toggleSurfaceTexture(mesh, layer.textureMode === 'satellite');
            _setBoundaryOverlayVisible(layer.textureMode !== 'satellite');
        }
    }
    _applyContourVisibility(layer);
    if (('showContours' in changes || 'showContourLabels' in changes || 'contourDensity' in changes) && layer.grid) {
        _rebuildLayerContours(layer);
    }
    _persist();
    _notify();
    requestRender();
}
/**
 * Retorna layer por ID.
 * @param {string} id
 * @returns {InterpolationLayer|undefined}
 */
export function getLayer(id: any) {
    return _layers.get(id);
}
/**
 * Retorna todas as layers.
 * @returns {InterpolationLayer[]}
 */
export function getAllLayers() {
    return Array.from(_layers.values());
}
/**
 * Retorna a mesh 3D de uma layer.
 * @param {string} id
 * @returns {any|null}
 */
export function getLayerMesh(id: any) {
    const layer = _layers.get(id);
    return layer ? _getMesh(layer) : null;
}
/**
 * Retorna o grupo Three.js das superfícies de interpolação.
 * @returns {any|null}
 */
export function getInterpolationGroup() {
    return _interpolationGroup;
}
/**
 * Retorna o ID da layer selecionada.
 * @returns {string|null}
 */
export function getSelectedLayer() {
    return _selectedLayerId;
}
/**
 * Define a layer selecionada.
 * @param {string|null} id
 */
export function setSelectedLayer(id: any) {
    _selectedLayerId = id;
}
// ----------------------------------------------------------------
// ATALHOS - Criação de layers por tipo
// ----------------------------------------------------------------
/**
 * Cria camada de superfície topográfica.
 * Busca elevação do AWS Terrain Tiles e constrói mesh.
 *
 * @param {TerrainLayerOptions} [opts]
 * @returns {Promise<InterpolationLayer>} layer criada
 */
/**
 * Compute zOffset for a new terrain layer based on existing terrain layers.
 * @param {any} opts
 * @returns {number}
 */
function _computeTerrainZOffset(opts: any): number {
    const terrainDefaults = LAYER_VISUAL_DEFAULTS.terrain;
    const terrainLayerIndex = Array.from(_layers.values()).filter((l: any) => l?.type === 'terrain').length;
    return typeof opts.zOffset === 'number' && Number.isFinite(opts.zOffset)
        ? opts.zOffset
        : terrainDefaults.zOffset + terrainLayerIndex * 0.4;
}

/**
 * Prepare manual terrain points and resolve the interpolation method.
 * @param {any} opts
 * @param {string} coordinateMode
 * @returns {{ scenePoints: any[], rawPoints: any[], method: string }}
 */
function _prepareManualTerrainData(opts: any, coordinateMode: string): { scenePoints: any[]; rawPoints: any[]; method: string } {
    if (coordinateMode === 'utm' && !hasOrigin()) {
        _toast('Origem UTM obrigatoria para terreno manual em modo UTM.', 'warning');
        throw new Error('UTM origin required for manual terrain');
    }
    const normalized = normalizeTopographyPoints(opts.dataPoints, {
        coordinateMode,
        origin: coordinateMode === 'utm' ? getOrigin() : null,
        maxPoints: TOPOGRAPHY_INPUT_LIMITS.maxPoints,
        tolerance: TOPOGRAPHY_INPUT_LIMITS.dedupeTolerance,
    });
    const scenePoints = normalized.points;
    if (scenePoints.length < 2) {
        _toast('Topografia manual precisa de pelo menos 2 pontos validos.', 'warning');
        throw new Error('Insufficient manual topography points');
    }
    if (normalized.truncatedCount > 0) {
        _toast(`Topografia manual limitada a ${TOPOGRAPHY_INPUT_LIMITS.maxPoints} pontos para manter responsividade.`, 'warning');
    }
    const resolvedMethod = resolveManualTerrainMethod(opts.method || 'idw', scenePoints.length, {
        complexMethodPointLimit: TOPOGRAPHY_INPUT_LIMITS.complexMethodPointLimit,
    });
    if (resolvedMethod.downgraded) {
        _toast(`Muitos pontos para ${resolvedMethod.requestedMethod.toUpperCase()}. Usando IDW para manter desempenho.`, 'warning');
    }
    return { scenePoints, rawPoints: normalized.rawPoints, method: resolvedMethod.method };
}

/**
 * Build the configuration object for a new terrain layer.
 * @param {any} opts
 * @param {string} dataSource
 * @param {string} coordinateMode
 * @param {any} gridSize
 * @param {any} bounds
 * @returns {AnyRecord}
 */
function _buildTerrainLayerConfig(opts: any, dataSource: string, coordinateMode: string, gridSize: any, bounds: any): AnyRecord {
    const isManual = dataSource === 'manual';
    const manual = isManual ? _prepareManualTerrainData(opts, coordinateMode) : null;
    return {
        type: 'terrain',
        name: t('interpolation.topoSurfaceName'),
        method: manual?.method || 'idw',
        dataSource,
        coordinateMode: isManual ? coordinateMode : null,
        gridSize,
        bounds,
        points: manual?.scenePoints || [],
        sourcePoints: isManual ? manual?.rawPoints : opts.sourcePoints || null,
        colorRamp: 'terrain',
        zOffset: _computeTerrainZOffset(opts),
    };
}

export async function createTerrainLayer(opts: any = {}) {
    if (!_interpolationGroup) {
        _toast('Interpolation system not ready. Please try again.', 'warning');
        throw new Error('Interpolation group not available');
    }
    const dataSource = opts.dataSource === 'manual' ? 'manual' : 'auto';
    const coordinateMode = opts.coordinateMode === 'utm' ? 'utm' : 'scene';
    const gridSize = _normalizeGridSize(opts.gridSize);
    const bounds = _getBoundaryBounds();
    if (!bounds) {
        _toast(t('interpolation.noBoundaryFound'), 'warning');
        throw new Error('No boundary found');
    }
    if (dataSource === 'auto' && !hasOrigin()) {
        _toast(t('interpolation.geoOriginNotConfigured'), 'warning');
        throw new Error('No origin set');
    }
    const layer = addLayer(_buildTerrainLayerConfig(opts, dataSource, coordinateMode, gridSize, bounds));
    try {
        await _recomputeTerrainLayer(layer);
        _toast(t('interpolation.topoSurfaceCreated'), 'success');
        return layer;
    }
    catch (err: any) {
        const message = _errorMessage(err);
        removeLayer(layer.id);
        log.error('Terrain fetch failed', message);
        _toast(t('interpolation.terrainError', { message }), 'error');
        throw err;
    }
}
/**
 * Resolve bounds and grid size for terrain recomputation.
 * @param {InterpolationLayer} layer
 * @returns {{ bounds: any, gridSize: any, isManual: boolean, hasCapture: boolean }}
 */
function _prepareTerrainRecompute(layer: any) {
    const bounds = layer.bounds || _getBoundaryBounds();
    if (!bounds)
        throw new Error('No boundary found');
    layer.bounds = bounds;
    const gridSize = _normalizeGridSize(layer.gridSize || DEFAULT_GRID);
    layer.gridSize = gridSize;
    const isManual = layer.dataSource === 'manual';
    const hasCapture = !isManual && Array.isArray(layer.sourcePoints) && layer.sourcePoints.length >= 3;
    return { bounds, gridSize, isManual, hasCapture };
}

/**
 * Compute terrain grid from manual or captured (LHS) source points.
 * @param {InterpolationLayer} layer
 * @param {any} isManual
 * @param {any} gridSize
 * @param {boolean} isManual
 * @param {boolean} hasCapture
 * @returns {{ grid: any, stats: any }}
 */
/**
 * Normalize terrain source points and update the layer in place.
 * @param {AnyRecord} layer
 * @param {boolean} isManual
 * @returns {{ points: any[], rawPoints: any[] }}
 */
function _normalizeTerrainSourcePoints(layer: any, isManual: boolean): { points: any[]; rawPoints: any[] } {
    if (isManual && layer.coordinateMode === 'utm' && !hasOrigin()) {
        throw new Error('UTM origin required for manual terrain');
    }
    const pts = isManual ? layer.sourcePoints || layer.points || [] : layer.sourcePoints;
    const coordMode = layer.coordinateMode || 'scene';
    log.debug('[Terrain] Recompute layer %s: isManual=%s, coordMode=%s, points=%d', layer.id, isManual, coordMode, pts?.length || 0);
    const normalized = normalizeTopographyPoints(pts, {
        coordinateMode: coordMode,
        origin: coordMode === 'utm' ? getOrigin() : null,
        maxPoints: TOPOGRAPHY_INPUT_LIMITS.maxPoints,
        tolerance: TOPOGRAPHY_INPUT_LIMITS.dedupeTolerance,
    });
    if (normalized.points.length < 2) {
        throw new Error('Insufficient manual topography points');
    }
    return normalized;
}

/**
 * Resolve and apply the interpolation method for manual terrain points.
 * @param {AnyRecord} layer
 * @param {number} pointCount
 */
function _resolveTerrainMethod(layer: any, pointCount: number) {
    const methodResolved = resolveManualTerrainMethod(layer.method || 'idw', pointCount, {
        complexMethodPointLimit: TOPOGRAPHY_INPUT_LIMITS.complexMethodPointLimit,
    });
    layer.method = methodResolved.method;
    if (methodResolved.downgraded) {
        _toast(`Muitos pontos para ${methodResolved.requestedMethod.toUpperCase()}. Usando IDW para manter desempenho.`, 'warning');
    }
}

async function _computeTerrainGridFromPoints(layer: any, bounds: any, gridSize: any, isManual: boolean) {
    const normalized = _normalizeTerrainSourcePoints(layer, isManual);
    _resolveTerrainMethod(layer, normalized.points.length);
    layer.points = normalized.points;
    if (isManual) layer.sourcePoints = normalized.rawPoints;
    const result = await interpolateGrid(normalized.points, bounds, gridSize, layer.method || 'idw', layer.methodParams || { power: 2 });
    return { grid: result.grid, stats: result.stats };
}

/**
 * Fetch online elevation tiles and resample to the requested grid.
 * Also auto-calibrates origin elevation from the fetched terrain center.
 *
 * @param {InterpolationLayer} layer
 * @param {any} bounds
 * @param {any} gridSize
 * @returns {{ grid: any, stats: any, satUrls: string[]|null }}
 */
async function _fetchAndResampleTerrainGrid(layer: any, bounds: any, gridSize: any) {
    if (!hasOrigin())
        throw new Error('No origin set');
    _toast(t('interpolation.fetchingElevation'), 'info');
    const tileData = await fetchTerrainGrid(bounds);
    const rawGrid = resampleGrid(tileData.heights, 
    /** @type {{ north: number, south: number, east: number, west: number }} */ (tileData.tileBounds), bounds, gridSize);
    const centerIdx = Math.floor(rawGrid.length / 2);
    const centerElev = rawGrid[centerIdx] as number;
    if (Number.isFinite(centerElev) && Math.abs(centerElev) > 1) {
        setOrigin({ elevation: centerElev });
        const elevEl = document.getElementById('utm-origin-elevation');
        if (elevEl instanceof HTMLInputElement)
            elevEl.value = centerElev.toFixed(1);
        log.debug('[Terrain] Auto-calibrated origin elevation:', centerElev.toFixed(1), 'm');
    }
    const grid = toRelativeElevation(rawGrid);
    const stats = computeTerrainGridStats(grid);
    let satUrls = await buildSatelliteUrls(Number(tileData.zoom ?? 0), Number(tileData.tileX ?? 0), Number(tileData.tileY ?? 0), bounds);
    if (!satUrls || satUrls.length === 0) {
        const boundary = getAllElements().find((el: any) => el.family === 'boundary' && el.data?.overlayUrl);
        if (boundary) {
            satUrls = [boundary.data.overlayUrl, ...(boundary.data.overlayFallbackUrls || [])].filter(Boolean);
            if (satUrls.length > 0) {
                log.debug('[Terrain] Falling back to boundary aerial overlay for terrain texture');
            }
        }
    }
    return { grid, stats, satUrls: satUrls || null };
}

/**
 * Enhance non-manual terrain grids with hero relief and capture LHS sample points.
 * Mutates layer.sourcePoints when capturing.
 *
 * @param {InterpolationLayer} layer
 * @param {any} grid
 * @param {any} stats
 * @param {any} bounds
 * @param {any} gridSize
 * @param {boolean} isManual
 * @param {boolean} hasCapture
 * @returns {{ grid: any, stats: any }}
 */
function _enhanceAndCaptureTerrainGrid(layer: any, grid: any, stats: any, bounds: any, gridSize: any, isManual: boolean, hasCapture: boolean) {
    let currentGrid = grid;
    let currentStats = stats;
    if (!isManual) {
        const enhanced = enhanceTerrainGridRelief(currentGrid, bounds, gridSize, { baseStats: currentStats });
        if (enhanced) {
            currentGrid = enhanced.grid;
            currentStats = enhanced.stats;
            layer.visualReliefBlend = enhanced.reliefBlend;
            log.debug('[Terrain] Hero relief blend applied:', enhanced.reliefBlend.toFixed(2), 'range:', (currentStats.max - currentStats.min).toFixed(2));
        }
    }
    if (!isManual && !hasCapture) {
        const _lhsBounds = { min: { x: bounds.minX, z: bounds.minZ }, max: { x: bounds.maxX, z: bounds.maxZ } };
        layer.sourcePoints = sampleElevationGridLHS(currentGrid, gridSize.cols, gridSize.rows, TOPOGRAPHY_INPUT_LIMITS.lhsOnlineSamples, _lhsBounds);
        log.debug('[Terrain] LHS sample captured:', layer.sourcePoints.length, 'points for offline restore');
    }
    return { grid: currentGrid, stats: currentStats };
}

/**
 * Build terrain mesh and replace any previous mesh in the scene.
 * @param {InterpolationLayer} layer
 * @param {any} grid
 * @param {any} bounds
 * @param {any} gridSize
 * @param {any} stats
 * @returns {any} mesh
 */
function _buildTerrainMesh(layer: any, grid: any, bounds: any, gridSize: any, stats: any) {
    const oldMesh = _getMesh(layer);
    if (oldMesh)
        disposeSurface(oldMesh);
    const mesh = buildSurfaceMesh(grid, bounds, gridSize, layer.colorRamp || 'terrain', stats, {
        opacity: layer.opacity,
        wireframe: layer.wireframe,
        zOffset: layer.zOffset || 0,
        renderOrder: layer.renderOrder || 1,
        verticalScale: layer.verticalScale ?? 1,
    });
    log.debug('[Terrain] Mesh created:', mesh.uuid, 'at', mesh.position, 'visible:', layer.visible);
    if (_interpolationGroup) {
        _interpolationGroup.add(mesh);
        log.debug('[Terrain] Mesh added to scene, group children:', _interpolationGroup.children.length);
    }
    else {
        log.warn('No interpolation group available for terrain mesh');
    }
    return mesh;
}

/**
 * Apply satellite texture to terrain mesh and update layer textureMode/satelliteUrls.
 * @param {InterpolationLayer} layer
 * @param {any} mesh
 * @param {string[]|null} satUrls
 * @param {boolean} hasCapture
 */
async function _applyTerrainTexture(layer: any, mesh: any, satUrls: string[] | null, hasCapture: boolean) {
    if (satUrls) {
        const textureApplied = await applySatelliteTexture(mesh, satUrls);
        if (textureApplied) {
            layer.satelliteUrls = satUrls;
            layer.textureMode = 'satellite';
        }
        else {
            layer.satelliteUrls = null;
            layer.textureMode = 'colorRamp';
        }
    }
    else if (hasCapture && layer.satelliteUrls) {
        const textureApplied = await applySatelliteTexture(mesh, layer.satelliteUrls);
        if (!textureApplied) {
            layer.satelliteUrls = null;
            layer.textureMode = 'colorRamp';
        }
    }
    else {
        layer.satelliteUrls = null;
        if (!layer.textureMode || layer.textureMode === 'satellite') {
            layer.textureMode = 'colorRamp';
        }
    }
}

/**
 * Persist terrain layer state after mesh creation and request render.
 * @param {InterpolationLayer} layer
 * @param {any} mesh
 * @param {any} grid
 * @param {any} stats
 */
function _finalizeTerrainLayer(layer: any, mesh: any, grid: any, stats: any) {
    layer.grid = grid;
    layer.stats = stats;
    layer.meshId = mesh.uuid;
    mesh.userData.layerId = layer.id;
    _setBoundaryOverlayVisible(layer.textureMode !== 'satellite');
    log.debug('[Terrain] Layer updated:', layer.id, 'stats:', stats, 'meshId:', mesh.uuid);
    _persist();
    _notify();
    requestRender();
    log.debug('[Terrain] Render requested');
}

/**
 * Busca tiles, decodifica elevação, constrói mesh e textura para uma layer de terreno.
 * Reutilizado tanto na criação quanto na restauração de layers persistidas.
 * @param {InterpolationLayer} layer - layer já adicionada via addLayer()
 */
async function _recomputeTerrainLayer(layer: any) {
    log.debug('[Terrain] Recomputing layer:', layer.id, 'type:', layer.type, 'hasGrid:', !!layer.grid);
    if (!_interpolationGroup) {
        throw new Error('Interpolation group not available — scene not initialized');
    }
    const { bounds, gridSize, isManual, hasCapture } = _prepareTerrainRecompute(layer);
    let grid;
    let stats;
    let satUrls = null;
    if (isManual || hasCapture) {
        const result = await _computeTerrainGridFromPoints(layer, bounds, gridSize, isManual);
        grid = result.grid;
        stats = result.stats;
    }
    else {
        const result = await _fetchAndResampleTerrainGrid(layer, bounds, gridSize);
        grid = result.grid;
        stats = result.stats;
        satUrls = result.satUrls;
    }
    const enhanced = _enhanceAndCaptureTerrainGrid(layer, grid, stats, bounds, gridSize, isManual, hasCapture);
    grid = enhanced.grid;
    stats = enhanced.stats;
    const mesh = _buildTerrainMesh(layer, grid, bounds, gridSize, stats);
    await _applyTerrainTexture(layer, mesh, satUrls, hasCapture);
    _finalizeTerrainLayer(layer, mesh, grid, stats);
}
/**
 * Cria camada de nível d'água a partir de observações dos poços.
 * @param {LayerOptions} [opts]
 * @returns {Promise<InterpolationLayer>}
 */
export async function createWaterTableLayer(opts: any = {}) {
    const bounds = _getBoundaryBounds();
    if (!bounds) {
        _toast(t('interpolation.noBoundary'), 'warning');
        throw new Error('No boundary found');
    }
    // Coleta poços com water_level observations
    const points = collectObservationPoints('water_level');
    if (points.length < 2) {
        _toast(t('interpolation.minWellsRequired'), 'warning');
        throw new Error('Insufficient water level data');
    }
    const gridSize = opts.gridSize || { ...DEFAULT_GRID };
    const method = opts.method || 'idw';
    const layer = addLayer({
        type: 'water_table',
        name: t('interpolation.waterLevelName'),
        method,
        dataSource: 'observations',
        parameterId: 'water_level',
        gridSize,
        bounds,
        points,
        colorRamp: 'water_table',
        showContours: opts.showContours ?? true,
        showContourLabels: opts.showContourLabels ?? true,
        contourDensity: opts.contourDensity || 'medium',
    });
    await recomputeLayer(layer.id);
    return layer;
}
/**
 * Cria camada de contaminação para um parâmetro específico.
 * @param {string|LayerOptions} parameterIdOrOpts - ex: 'benzene', 'toluene'
 * @param {LayerOptions} [opts]
 * @returns {Promise<InterpolationLayer>}
 */
/**
 * Resolve parameterId and options from legacy/overloaded createContaminationLayer arguments.
 * @param {any} parameterIdOrOpts
 * @param {any} opts
 * @returns {{ parameterId: string, resolvedOpts: any }}
 */
function _resolveContaminationArgs(parameterIdOrOpts: any, opts: any): { parameterId: string; resolvedOpts: any } {
    let parameterId = typeof parameterIdOrOpts === 'string' ? parameterIdOrOpts : parameterIdOrOpts?.parameterId;
    let resolvedOpts = opts;
    if (parameterIdOrOpts && typeof parameterIdOrOpts === 'object' && !Array.isArray(parameterIdOrOpts)) {
        parameterId = parameterIdOrOpts.parameterId;
        resolvedOpts = { ...parameterIdOrOpts, ...opts };
        log.warn('createContaminationLayer({ ... }) is deprecated; use createContaminationLayer(parameterId, opts)');
    }
    if (!parameterId || typeof parameterId !== 'string') {
        throw new Error('Missing parameterId for contamination layer');
    }
    return { parameterId, resolvedOpts };
}

/**
 * Collect points for a contamination layer from manual input or observations.
 * @param {string} parameterId
 * @param {any} resolvedOpts
 * @returns {{ points: any[], dataSource: string }}
 */
function _collectContaminationPoints(parameterId: string, resolvedOpts: any): { points: any[]; dataSource: string } {
    const matrixFilter = resolvedOpts?.matrix || null;
    const manualPoints = _normalizeManualPoints(resolvedOpts?.dataPoints);
    if (manualPoints.length >= 2) {
        return { points: manualPoints, dataSource: 'manual' };
    }
    const points = collectObservationPoints(parameterId, {
        campaignId: resolvedOpts?.campaignId || null,
        matrix: matrixFilter,
    });
    return { points, dataSource: 'observations' };
}

export async function createContaminationLayer(parameterIdOrOpts: any, opts: any = {}) {
    const { parameterId, resolvedOpts } = _resolveContaminationArgs(parameterIdOrOpts, opts);
    const bounds = _getBoundaryBounds();
    if (!bounds) {
        _toast(t('interpolation.noBoundary'), 'warning');
        throw new Error('No boundary found');
    }
    const { points, dataSource } = _collectContaminationPoints(parameterId, resolvedOpts);
    if (points.length < 2) {
        _toast(t('interpolation.minPointsRequired', { parameterId }), 'warning');
        throw new Error('Insufficient observation data');
    }
    const gridSize = _normalizeGridSize(resolvedOpts?.gridSize);
    const method = resolvedOpts?.method || 'idw';
    const layer = addLayer({
        type: 'contamination',
        name: t('interpolation.interpolationName', { parameterId }),
        method,
        dataSource,
        parameterId,
        matrix: resolvedOpts?.matrix || null,
        gridSize,
        bounds,
        points,
        colorRamp: 'contamination',
    });
    await recomputeLayer(layer.id);
    return layer;
}
// ----------------------------------------------------------------
// GEOLOGY LAYERS - Superfícies geológicas de perfis litológicos
// ----------------------------------------------------------------
/**
 * Cria camada de superfície geológica a partir de contatos litológicos.
 * Interpola o topo ou base de uma camada de solo específica entre poços.
 *
 * @param {string} opts - tipo de solo (clay, sand, rock, etc.)
 * @param {LayerOptions} [opts]
 * @returns {Promise<InterpolationLayer>}
 */
/**
 * Compute progressive zOffset for geology layers.
 * @param {any} opts
 * @returns {number}
 */
function _computeGeologyZOffset(opts: any): number {
    const existingGeoLayers = Array.from(_layers.values()).filter((l: any) => l.type === 'geology');
    const layerIndex = existingGeoLayers.length;
    const geoDefaults = LAYER_VISUAL_DEFAULTS.geology;
    return typeof opts.zOffset === 'number' && Number.isFinite(opts.zOffset)
        ? Number(opts.zOffset)
        : geoDefaults.zOffset + layerIndex * 0.4;
}

export async function createGeologyLayer(soilType: any, opts: any = {}) {
    if (!soilType || typeof soilType !== 'string') {
        log.warn('[Geology] createGeologyLayer: missing or invalid soilType:', soilType);
        throw new Error('Missing soilType for geology layer');
    }
    const contactType = opts.contactType === 'bottom' ? 'bottom' : 'top';
    const points = _collectGeologyContactPoints(soilType, contactType);
    log.debug('[Geology] Collected %d contact points for %s (contactType=%s)', points.length, soilType, contactType);
    if (points.length < 3) {
        const label = (GEOLOGY_SOIL_LABELS as any)[soilType] || soilType;
        log.warn('[Geology] Insufficient points: %d < 3 required for %s (contactType=%s)', points.length, soilType, contactType);
        _toast(t('interpolation.minWellsGeology', { soilType: label }) || `Minimo 3 pocos com "${label}" necessarios.`, 'warning');
        throw new Error(`Insufficient geology data: ${points.length} wells with ${soilType}`);
    }
    const bounds = _getBoundaryBounds() || _computeBoundsFromPoints(points, 0.1);
    const gridSize = _normalizeGridSize(opts.gridSize);
    const method = opts.method || 'idw';
    const contactLabel = contactType === 'top' ? 'Topo' : 'Base';
    const soilLabel = (GEOLOGY_SOIL_LABELS as any)[soilType] || soilType;
    const geoDefaults = LAYER_VISUAL_DEFAULTS.geology;
    const layer = addLayer({
        type: 'geology',
        name: `Geologia: ${contactLabel} de ${soilLabel}`,
        method,
        dataSource: 'geology_profile',
        parameterId: soilType,
        geologyContact: contactType,
        gridSize,
        bounds,
        points,
        colorRamp: 'geology',
        fixedColor: (GEOLOGY_SOIL_COLORS as any)[soilType] || '#888888',
        showContours: geoDefaults.showContours,
        opacity: geoDefaults.opacity,
        wireframe: geoDefaults.wireframe,
        zOffset: _computeGeologyZOffset(opts),
    });
    try {
        await recomputeLayer(layer.id);
    }
    catch (err: any) {
        removeLayer(layer.id);
        log.error('Geology layer recompute failed:', _errorMessage(err));
        throw err;
    }
    return layer;
}
// ----------------------------------------------------------------
// GeoML MAPS - Potentiometric + Plume from Campaign (Phase 1)
// ----------------------------------------------------------------
/**
 * Create a potentiometric map from water_level observations.
 * Uses Kriging by default (CONAMA/CETESB mandate).
 * Gap #5: water_level values are absolute MSL - no terrain subtraction.
 *
 * @param {LayerOptions} [opts]
 * @returns {Promise<InterpolationLayer|null>} Layer or null if insufficient data
 */
export async function createPotentiometricMap(opts: any = {}) {
    const { method = 'kriging', gridSize = { cols: 64, rows: 64 }, campaignId, parameterId = 'water_level' } = opts;
    const points = collectObservationPoints(parameterId, { campaignId });
    if (points.length < 3) {
        _toast('Minimo 3 pontos de observacao necessarios para mapa potenciometrico.', 'warning');
        return null;
    }
    const bounds = _computeBoundsFromPoints(points, 0.1);
    // CDN loading toast for RBF (kriging is now local, no CDN needed)
    let effectiveMethod = method;
    if (method === 'rbf') {
        _toast(`Carregando modulo de ${method}...`, 'info');
        try {
            const { importCDN } = await import('../../utils/helpers/cdnLoader.js');
            await importCDN('https://esm.sh/rbf@1.1.5', { name: 'RBF' });
        } catch (err: any) {
            log.warn('CDN timeout for method, falling back to IDW', method, _errorMessage(err));
            _toast(`${method} indisponivel — usando IDW como fallback`, 'warning');
            effectiveMethod = 'idw';
        }
    }
    const layer = addLayer({
        type: 'potentiometric',
        name: 'Mapa Potenciometrico',
        method: effectiveMethod,
        dataSource: 'observations',
        parameterId,
        gridSize,
        bounds,
        points,
        colorRamp: 'potentiometric',
        showContours: true,
        showContourLabels: true,
        contourDensity: 'medium',
    });
    await recomputeLayer(layer.id);
    return layer;
}
/**
 * Create a contamination plume from campaign observations.
 * Generates 2D surface; 3D isosurface optional (if depth data + threshold).
 *
 * @param {LayerOptions} opts
 * @returns {Promise<{ layer: InterpolationLayer, plumeMesh: any|null }|null>}
 */
export async function createPlumeFromCampaign(opts: any = {}) {
    const { parameterId, campaignId, thresholdValue, method = 'kriging', gridSize = { cols: 64, rows: 64 } } = opts;
    if (!parameterId) {
        _toast('Parametro de contaminacao nao especificado.', 'warning');
        return null;
    }
    const points = collectObservationPoints(parameterId, { campaignId, include3D: true });
    if (points.length < 3) {
        _toast('Minimo 3 pontos com dados necessarios para pluma.', 'warning');
        return null;
    }
    const bounds = _computeBoundsFromPoints(points, 0.1);
    // CDN loading for RBF only (kriging is now local, no CDN needed)
    let effectiveMethod = method;
    if (method === 'rbf') {
        try {
            const { importCDN } = await import('../../utils/helpers/cdnLoader.js');
            await importCDN('https://esm.sh/rbf@1.1.5', { name: 'RBF' });
        } catch (err: any) {
            log.debug('CDN load failed for RBF, falling back to IDW', _errorMessage(err));
            effectiveMethod = 'idw';
            _toast(`${method} indisponivel — usando IDW`, 'warning');
        }
    }
    const layer = addLayer({
        type: 'contamination',
        name: `Pluma: ${parameterId}`,
        method: effectiveMethod,
        dataSource: 'observations',
        parameterId,
        gridSize,
        bounds,
        points,
        colorRamp: 'contamination',
        showContours: true,
        contourDensity: 'medium',
        thresholdValue: thresholdValue ?? null,
    });
    // Preserva pontos com elevação para grid 3D (não exportados - runtime only)
    (layer as any)._points3D = points;
    await recomputeLayer(layer.id);
    // Fase 1: 3D isosurface via extrusão de grid 2D com decaimento vertical
    let plumeMesh = null;
    if (thresholdValue != null && Number.isFinite(thresholdValue) && layer.grid) {
        _rebuildIsosurface(layer);
        plumeMesh = layer.isosurfaceMeshId
            ? (_interpolationGroup?.getObjectByProperty('uuid', layer.isosurfaceMeshId) ?? null)
            : null;
    }
    return { layer, plumeMesh };
}
/**
 * (Re)constrói mesh de isosurface para uma layer de contaminação.
 * Remove mesh anterior da cena antes de criar novo.
 *
 * @param {InterpolationLayer} layer - Layer com grid, gridSize, bounds, thresholdValue, isosurfaceMeshId
 */
function _rebuildIsosurface(layer: any) {
    // Remove mesh anterior se existir
    if (layer.isosurfaceMeshId && _interpolationGroup) {
        const old = _interpolationGroup.getObjectByProperty('uuid', layer.isosurfaceMeshId);
        if (old) {
            old.geometry?.dispose();
            old.material?.dispose();
            _interpolationGroup.remove(old);
        }
        layer.isosurfaceMeshId = null;
    }
    if (layer.thresholdValue == null || !Number.isFinite(layer.thresholdValue))
        return;
    if (!layer.grid || !layer.bounds || !layer.gridSize || !_interpolationGroup)
        return;
    const { grid3D, bounds3D, dims } = 
    /** @type {{ grid3D: Float32Array, bounds3D: { minX: number, maxX: number, minZ: number, maxZ: number, minY: number, maxY: number }, dims: { cols: number, rows: number, layers: number } }} */ (_build3DGrid(layer.grid, layer.gridSize, layer.bounds, 
    /** @type {{ y: number }[]} */ ( /** @type {unknown} */(layer._points3D || []))));
    const geometry = extractIsosurface(grid3D, dims, bounds3D, layer.thresholdValue);
    const position = geometry.attributes.position;
    if (!position || position.count === 0)
        return;
    const mat = new Three.MeshPhongMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.45,
        side: Three.DoubleSide,
        depthWrite: false,
    });
    const mesh = new Three.Mesh(geometry, mat);
    mesh.userData.layerId = layer.id;
    mesh.userData.isIsosurface = true;
    _interpolationGroup.add(mesh);
    layer.isosurfaceMeshId = mesh.uuid;
    requestRender();
}
// ----------------------------------------------------------------
// RECOMPUTE - Recalcula interpolação de uma layer
// ----------------------------------------------------------------
/**
 * Recalcula interpolação e reconstrói mesh.
 * @param {string} layer - layer ID
 * @returns {Promise<void>}
 */
/**
 * Refresh layer source points based on its dataSource.
 * @param {AnyRecord} layer
 */
function _refreshLayerPoints(layer: AnyRecord) {
    if (layer.dataSource === 'observations' && layer.parameterId) {
        layer.points = collectObservationPoints(layer.parameterId, {
            campaignId: layer.campaignId || null,
            matrix: layer.matrix || null,
        });
    }
    else if (layer.dataSource === 'geology_profile' && layer.parameterId) {
        const contactType = layer.geologyContact === 'bottom' ? 'bottom' : 'top';
        layer.points = _collectGeologyContactPoints(layer.parameterId, contactType);
    }
}

/**
 * Build and attach the surface mesh for a layer from interpolation results.
 * @param {AnyRecord} layer
 * @param {AnyRecord} result
 * @returns {any}
 */
function _buildAndAttachLayerMesh(layer: AnyRecord, result: AnyRecord): any {
    _clearLayerContours(layer);
    const mesh = buildSurfaceMesh(result.grid, layer.bounds, layer.gridSize, layer.colorRamp, result.stats, {
        opacity: layer.opacity,
        wireframe: layer.wireframe,
        zOffset: layer.zOffset || 0,
        renderOrder: layer.renderOrder || 1,
        fixedColor: layer.fixedColor || null,
        verticalScale: layer.verticalScale ?? 1,
    });
    mesh.visible = layer.visible;
    if (_interpolationGroup) {
        _interpolationGroup.add(mesh);
    }
    layer.meshId = mesh.uuid;
    mesh.userData.layerId = layer.id;
    _rebuildLayerContours(layer);
    if (layer.type === 'contamination' && layer.thresholdValue != null) {
        _rebuildIsosurface(layer);
    }
    return mesh;
}

/**
 * Recompute interpolation grid and rebuild mesh for a non-terrain layer.
 * @param {AnyRecord} layer
 */
async function _recomputeLayerGrid(layer: AnyRecord) {
    _toast(t('interpolation.interpolating'), 'info');
    const result = await interpolateGrid(layer.points, layer.bounds, layer.gridSize, layer.method, layer.methodParams);
    layer.grid = result.grid;
    layer.stats = result.stats;
    _buildAndAttachLayerMesh(layer, result);
    _persist();
    _notify();
    requestRender();
    _toast(t('interpolation.completed'), 'success');
}

export async function recomputeLayer(id: any) {
    const layer = _layers.get(id);
    if (!layer) return;
    if (layer.type === 'terrain') {
        try {
            await _recomputeTerrainLayer(layer);
            _toast(t('interpolation.completed'), 'success');
        }
        catch (err: any) {
            const message = _errorMessage(err);
            log.error('Terrain recompute failed', message);
            _toast(t('interpolation.error', { message }), 'error');
        }
        return;
    }
    _refreshLayerPoints(layer);
    if (!layer.points || layer.points.length < 2) {
        _toast(t('interpolation.insufficientData'), 'warning');
        throw new Error(`Insufficient points for layer ${layer.id}: ${layer.points?.length || 0} < 2`);
    }
    if (!layer.bounds) {
        layer.bounds = _getBoundaryBounds();
        if (!layer.bounds) return;
    }
    try {
        await _recomputeLayerGrid(layer);
    }
    catch (err: any) {
        const message = _errorMessage(err);
        log.error('Recompute layer failed', message);
        _toast(t('interpolation.error', { message }), 'error');
    }
}
/**
 * Atualiza o threshold de isosurface de uma layer de contaminação.
 * Reconstrói o mesh sem reinterpolação (grid preservado).
 *
 * @param {string} id - Layer ID
 * @param {number|null} thresholdValue - Novo limiar (null = remover isosurface)
 */
export function setLayerThreshold(id: any, thresholdValue: any) {
    const layer = _layers.get(id);
    if (!layer || layer.type !== 'contamination')
        return;
    layer.thresholdValue = thresholdValue != null && Number.isFinite(thresholdValue) ? thresholdValue : null;
    _rebuildIsosurface(layer);
    _persist();
    _notify();
}
// ----------------------------------------------------------------
// EXPORT / IMPORT
// ----------------------------------------------------------------
/**
 * Exporta layers para JSON (sem grid data - será recalculado).
 * @returns {AnyRecord[]}
 */
export function exportLayers() {
    return getAllLayers().map((l: any) => {
        const manualTerrain = serializeManualTerrainPayload(l);
        const normalizedManualPoints =
            l.dataSource === 'manual' && l.type !== 'terrain' ? _normalizeManualPoints(l.points) : null;
        return buildLayerExportPayload(l, { manualTerrain, normalizedManualPoints });
    });
}
/**
 * Importa layers de JSON. Preserva terreno existente com mesh (evita re-fetch de tiles).
 * IMPORTANTE: createTerrainLayer chama addLayer internamente - nunca chamar addLayer antes dele.
 * @param {LayerConfig[]} layerConfigs
 */
/**
 * Clear existing layers before import, preserving an online terrain layer with mesh if applicable.
 * @param {any[]} dedupConfigs
 * @param {boolean} importTerrainIsManual
 */
function _clearLayersForImport(dedupConfigs: any[], importTerrainIsManual: boolean) {
    const importHasTerrain = dedupConfigs.some((c: any) => c.type === 'terrain');
    for (const [id, layer] of _layers) {
        if (importHasTerrain && !importTerrainIsManual && layer.type === 'terrain' && layer.meshId) continue;
        removeLayer(id);
    }
}

/**
 * Apply visual property changes from an imported config onto an existing terrain layer.
 * @param {AnyRecord} existingTerrainWithMesh
 * @param {AnyRecord} config
 */
function _applyImportedTerrainVisuals(existingTerrainWithMesh: AnyRecord, config: AnyRecord) {
    if (config.opacity != null) existingTerrainWithMesh.opacity = config.opacity;
    if (config.visible != null) existingTerrainWithMesh.visible = config.visible;
    if (config.wireframe != null) existingTerrainWithMesh.wireframe = config.wireframe;
    if (config.colorRamp) existingTerrainWithMesh.colorRamp = config.colorRamp;
}

/**
 * Import a terrain layer config, either updating existing mesh or creating a new layer.
 * @param {AnyRecord} config
 * @param {AnyRecord|null} existingTerrainWithMesh
 * @param {boolean} importTerrainIsManual
 */
async function _importTerrainLayer(config: AnyRecord, existingTerrainWithMesh: AnyRecord | null, importTerrainIsManual: boolean) {
    if (existingTerrainWithMesh && !importTerrainIsManual) {
        _applyImportedTerrainVisuals(existingTerrainWithMesh, config);
        return;
    }
    try {
        const coords = resolveImportTerrainCoords(config);
        const created = await createTerrainLayer({
            dataSource: coords.dataSource,
            coordinateMode: coords.coordinateMode,
            dataPoints: config.points || [],
            sourcePoints: config.sourcePoints || null,
            method: config.method || 'idw',
            gridSize: config.gridSize,
        });
        if (created) {
            const visualChanges = extractVisualChanges(config);
            if (Object.keys(visualChanges).length > 0) {
                updateLayer(created.id, visualChanges);
            }
        }
    }
    catch (err: any) {
        log.debug('Terrain import skipped — boundary/origin may not be available', _errorMessage(err));
    }
}

/**
 * Import a non-terrain layer config by adding and recomputing it.
 * @param {AnyRecord} config
 */
async function _importNonTerrainLayer(config: AnyRecord) {
    addLayer(config);
    try {
        const recomputeId = config.id || [..._layers.keys()].pop();
        if (recomputeId) await recomputeLayer(recomputeId);
    }
    catch (err: any) {
        log.debug('Layer recompute skipped during import', _errorMessage(err));
    }
}

export async function importLayers(layerConfigs: any) {
    if (!layerConfigs || !Array.isArray(layerConfigs)) return;
    const previousSuppressPersistence = _suppressPersistence;
    _suppressPersistence = true;
    try {
        const dedupConfigs = dedupTerrainConfigs(layerConfigs);
        const existingTerrainWithMesh = _findLayerByType('terrain', true);
        const importTerrainConfig = dedupConfigs.find((c: any) => c.type === 'terrain') || null;
        const importTerrainIsManual = importTerrainConfig?.dataSource === 'manual';
        _clearLayersForImport(dedupConfigs, importTerrainIsManual);
        for (const config of dedupConfigs) {
            if (config.type === 'terrain') {
                await _importTerrainLayer(config, existingTerrainWithMesh, importTerrainIsManual);
            }
            else {
                await _importNonTerrainLayer(config);
            }
        }
    }
    finally {
        _suppressPersistence = previousSuppressPersistence;
        _persist();
    }
}
/**
 * Busca primeira layer de um tipo especifico.
 * @param {string} type
 * @param {boolean} [requireMesh=false] - se true, exige que tenha meshId
 * @returns {InterpolationLayer|null}
 */
/**
 * Re-fetcha e reconstrói a terrain layer automática (AWS tiles) para a origem atual.
 * Chamado quando a origem UTM muda (ex: map picker).
 * É um no-op se não houver terrain layer automática.
 *
 * @returns {Promise<void>}
 */
export async function refreshAutoTerrainLayer() {
    const layer = _findLayerByType('terrain');
    if (!layer || layer.dataSource === 'manual')
        return; // nada a fazer
    if (!hasOrigin())
        return;
    try {
        layer.bounds = _getBoundaryBounds(); // recalcula bounds com nova origem
        await _recomputeTerrainLayer(layer);
    } catch (err: any) {
        log.error('Auto terrain layer refresh failed', _errorMessage(err));
    }
}
/**
 * @param {string} type
 * @param {boolean} [requireMesh=false]
 * @returns {InterpolationLayer|null}
 */
function _findLayerByType(type: any, requireMesh = false) {
    for (const [, layer] of _layers) {
        if (layer.type === type && (!requireMesh || layer.meshId))
            return layer;
    }
    return null;
}
// ----------------------------------------------------------------
// CONSULTA PONTUAL DE ELEVAÇÃO
// ----------------------------------------------------------------
/**
 * Amostra a elevação do terreno em uma posição (x, z) do cenário.
 * Interpola bilinearmente a partir do grid da terrain layer.
 * Retorna 0 se não houver terrain layer ou se o ponto estiver fora dos bounds.
 *
 * @param {number} x - posição X no cenário (Three.js)
 * @param {number} z - posição Z no cenário (Three.js)
 * @returns {number} elevação relativa em metros
 */
export function sampleTerrainElevation(x: any, z: any) {
    const terrain = Array.from(_layers.values()).find((l: any) => l.type === 'terrain' && l.grid);
    return sampleGridAt(terrain as any, x, z);
}
/**
 * Verifica se existe uma terrain layer com grid carregado.
 * @returns {boolean}
 */
export function hasTerrainGrid() {
    return Array.from(_layers.values()).some((l: any) => l.type === 'terrain' && l.grid);
}
/**
 * Sample any layer grid by type using bilinear interpolation.
 * Amostra qualquer layer pelo tipo - reutiliza mesma logica bilinear.
 *
 * @param {string} layerType - 'terrain' | 'water_table' | 'contamination'
 * @param {number} x - scene X position
 * @param {number} z - scene Z position
 * @returns {number} interpolated value (0 if unavailable)
 */
export function sampleLayerGrid(layerType: any, x: any, z: any) {
    const layer = Array.from(_layers.values()).find((l: any) => l.type === layerType && l.grid);
    return sampleGridAt(layer as any, x, z);
}
/**
 * @param {AnyRecord|null|undefined} mesh
 * @returns {number}
 */
// _getSurfaceMeshOffset delega para getSurfaceMeshOffset de _interpolationGridPure
// (frozen catalog SURFACE_MESH_STATIC_OFFSETS + building/emission_source/individual).
function _getSurfaceMeshOffset(el: any) {
    return _getSurfaceMeshOffsetPure(el);
}
/**
 * @param {any} mesh
 */
function _commitMeshTransform(mesh: any) {
    if (!mesh)
        return;
    mesh.updateMatrix();
    mesh.updateMatrixWorld(true);
}
/**
 * @param {AnyRecord} el
 * @param {any} mesh
 * @param {number} ground
 */
function _setSurfaceAnchoredPosition(el: any, mesh: any, ground: any) {
    const data = el?.data;
    if (!data?.position)
        return;
    data.position.y = ground;
    if (mesh) {
        mesh.position.y = ground + _getSurfaceMeshOffset(el);
        _commitMeshTransform(mesh);
    }
}
/**
 * Aplica elevação topográfica a todos os elementos do modelo.
 * Atualiza dados E meshes 3D para seguir o relevo do terreno.
 * Elementos subterrâneos (plume, well) mantêm offset relativo ao terreno.
 *
 * Deve ser chamado APÓS createTerrainLayer() quando terrainElevation=true.
 */
const SURFACE_FAMILIES = new Set([
    'building', 'spring', 'marker', 'sample', 'waste_stream', 'effluent_point',
    'generic', 'intangible', 'individual', 'habitat', 'area', 'incident', 'sensor', 'lake',
]);

/**
 * Apply terrain elevation to surface-anchored elements.
 * @param {AnyRecord} el
 * @param {AnyRecord} d
 * @param {any} mesh
 */
function _applySurfaceElementElevation(el: AnyRecord, d: AnyRecord, mesh: any) {
    if (!d.position) return;
    const elev = sampleTerrainElevation(d.position.x, d.position.z);
    _setSurfaceAnchoredPosition(el, mesh, elev);
}

/**
 * Apply terrain elevation to an emission_source element.
 * @param {AnyRecord} el
 * @param {AnyRecord} d
 * @param {any} mesh
 */
function _applyEmissionSourceElevation(el: AnyRecord, d: AnyRecord, mesh: any) {
    if (!d.position) return;
    const ground = sampleTerrainElevation(d.position.x, d.position.z);
    const baseOffset = Number.isFinite(d.baseOffset)
        ? d.baseOffset
        : Number.isFinite(d.position.y)
            ? d.position.y
            : 0;
    d.baseOffset = baseOffset;
    d.position.y = ground + baseOffset;
    if (mesh) {
        mesh.position.y = d.position.y + _getSurfaceMeshOffset(el);
        _commitMeshTransform(mesh);
    }
}

/**
 * Apply terrain elevation to a tank element.
 * @param {AnyRecord} d
 * @param {any} mesh
 */
function _applyTankElevation(d: AnyRecord, mesh: any) {
    if (!d.position) return;
    const ground = sampleTerrainElevation(d.position.x, d.position.z);
    const offset = d.type === 'underground' ? (d.depthOffset ?? d.position.y ?? 0) : 0;
    d.position.y = ground + offset;
    if (mesh) {
        mesh.position.y = ground + offset;
        _commitMeshTransform(mesh);
    }
}

/**
 * Apply terrain elevation to a well element.
 * @param {AnyRecord} d
 * @param {any} mesh
 */
function _applyWellElevation(d: AnyRecord, mesh: any) {
    if (!d.coordinates) return;
    const ground = sampleTerrainElevation(d.coordinates.easting, d.coordinates.northing);
    if (d.coordinates.elevation == null || !Number.isFinite(d.coordinates.elevation)) {
        d.coordinates.elevation = ground + (getOrigin().elevation || 0);
    }
    if (mesh) {
        const depth = d.construction?.totalDepth || 50;
        mesh.position.y = ground - depth / 2;
        _commitMeshTransform(mesh);
    }
}

/**
 * Apply terrain elevation to a river element.
 * @param {AnyRecord} d
 * @param {any} mesh
 */
function _applyRiverElevation(d: AnyRecord, mesh: any) {
    if (!d.path || !Array.isArray(d.path)) return;
    for (const pt of d.path) {
        pt.y = sampleTerrainElevation(pt.x, pt.z);
    }
    if (mesh) {
        mesh.position.y = 0;
        _commitMeshTransform(mesh);
        rebuildRiverGeometry(mesh, d.path, d.width || 3);
    }
}

/**
 * Apply terrain elevation to a boundary element.
 * @param {AnyRecord} d
 * @param {any} mesh
 */
function _applyBoundaryElevation(d: AnyRecord, mesh: any) {
    if (!d.vertices || !Array.isArray(d.vertices)) return;
    let sum = 0;
    for (const v of d.vertices) {
        v.y = sampleTerrainElevation(v.x, v.z);
        sum += v.y;
    }
    if (mesh && d.vertices.length > 0) {
        mesh.position.y = sum / d.vertices.length;
        _commitMeshTransform(mesh);
    }
}

/**
 * Apply terrain elevation to a plume element.
 * @param {AnyRecord} d
 * @param {any} mesh
 */
function _applyPlumeElevation(d: AnyRecord, mesh: any) {
    if (!d.center) return;
    const ground = sampleTerrainElevation(d.center.x, d.center.z);
    const relCenter = d.depth ? (d.depth.top + d.depth.bottom) / 2 : d.center.y || 0;
    d.center.y = ground + relCenter;
    if (mesh) {
        mesh.position.y = d.center.y;
        _commitMeshTransform(mesh);
    }
}

/**
 * Dispatch terrain elevation application by element family.
 * @param {AnyRecord} el
 */
function _applyElevationToElement(el: AnyRecord) {
    const d = el.data;
    if (!d) return;
    const mesh = getMeshByElementId(el.id);
    if (SURFACE_FAMILIES.has(el.family)) {
        _applySurfaceElementElevation(el, d, mesh);
        return;
    }
    switch (el.family) {
        case 'emission_source':
            _applyEmissionSourceElevation(el, d, mesh);
            break;
        case 'tank':
            _applyTankElevation(d, mesh);
            break;
        case 'well':
            _applyWellElevation(d, mesh);
            break;
        case 'river':
            _applyRiverElevation(d, mesh);
            break;
        case 'boundary':
            _applyBoundaryElevation(d, mesh);
            break;
        case 'plume':
            _applyPlumeElevation(d, mesh);
            break;
        default:
            break;
    }
}

export function applyTerrainElevationToElements() {
    if (!hasTerrainGrid()) return;
    for (const el of getAllElements()) {
        _applyElevationToElement(el);
    }
    requestRender();
}
// ----------------------------------------------------------------
// UTILITÁRIOS INTERNOS
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// GEOLOGY CONTACT POINTS - Coleta contatos litológicos dos poços
// ----------------------------------------------------------------
/**
 * Descobre tipos de solo disponíveis nos perfis litológicos de todos os poços.
 * @returns {{ soilType: string, count: number }[]}
 */
/**
 * Public wrapper for observation point extraction.
 * Used by simulation executor to build spatial context from element observations.
 * @param {string} parameterId
 * @param {Object} [opts]
 * @returns {Array<{x:number, z:number, value:number}>}
 */
/**
 * Collect observation points for interpolation, with session-scoped memoization.
 * Cache is invalidated on any element/observation/campaign CRUD or model clear.
 *
 * @param {string} parameterId
 * @param {LayerOptions} [opts]
 * @returns {SpatialPoint[]}
 */
export function collectObservationPoints(parameterId: any, opts: any = {}) {
    const key = JSON.stringify([
        parameterId,
        opts.matrix ?? 'all',
        opts.campaignId ?? 'all',
        opts.include3D ?? false,
        opts.tolerance ?? null,
    ]);
    const cached = _collectionCache.get(key);
    if (cached && Date.now() - cached.ts < _COLLECTION_CACHE_TTL_MS) {
        return cached.points;
    }
    const points = _collectObservationPoints(parameterId, /** @type {any} */ (opts));
    _collectionCache.set(key, { points, ts: Date.now() });
    return points;
}
/**
 * Invalidate the observation-point collection cache.
 * Call on element/observation/campaign CRUD and model clear.
 * / Invalida o cache de coleta de pontos de observação.
 */
export function invalidateInterpolationCache() {
    _collectionCache.clear();
}
export function getAvailableSoilTypes() {
    const counts = new Map();
    for (const el of getAllElements()) {
        if (el.family !== 'well')
            continue;
        const lithologic = el.data?.profile?.lithologic;
        if (!Array.isArray(lithologic))
            continue;
        const seen = new Set();
        for (const layer of lithologic) {
            if (layer.soilType && !seen.has(layer.soilType)) {
                seen.add(layer.soilType);
                counts.set(layer.soilType, (counts.get(layer.soilType) || 0) + 1);
            }
        }
    }
    return Array.from(counts.entries())
        .map(([soilType, count]) => ({ soilType, count }))
        .sort((a: any, b: any) => b.count - a.count);
}
/**
 * Busca mesh da layer no grupo da cena.
 * @param {InterpolationLayer} layer
 * @returns {any|null}
 */
function _getMesh(layer: any) {
    if (!layer.meshId || !_interpolationGroup)
        return null;
    return _interpolationGroup.getObjectByProperty('uuid', layer.meshId) || null;
}
/**
 * @param {InterpolationLayer|null|undefined} layer
 * @returns {boolean}
 */
function _layerSupportsContours(layer: any) {
    if (!layer?.type)
        return false;
    return (CONTOUR_FEATURE_FLAGS as any)[layer.type] === true;
}
/**
 * @param {string} type
 * @returns {boolean}
 */
function _defaultShowContoursForType(type: any) {
    if (type === 'water_table' || type === 'potentiometric')
        return true;
    if (type === 'terrain' || type === 'contamination')
        return false;
    return false;
}
/**
 * @param {string} type
 * @returns {boolean}
 */
function _defaultShowContourLabelsForType(type: any) {
    return type === 'water_table' || type === 'potentiometric';
}
/**
 * @param {string|undefined} density
 * @param {string|null} [layerType]
 * @returns {number}
 */
function _contourLevelCount(density: any, layerType = null) {
    const base = (CONTOUR_DENSITY_LEVELS as any)[density || 'medium'] || CONTOUR_DENSITY_LEVELS.medium;
    // Ajusta densidade baseada no tipo de camada para melhor diferenciação
    if (layerType === 'water_table') {
        return base; // densidade padrão para water_table
    }
    else if (layerType === 'potentiometric') {
        return Math.min(base + 2, CONTOUR_DENSITY_LEVELS.high); // mais denso para potenciométrico
    }
    else if (layerType === 'contamination') {
        return Math.max(base - 2, CONTOUR_DENSITY_LEVELS.low); // menos denso para contaminação
    }
    return base;
}
/**
 * @param {InterpolationLayer} layer
 */
function _applyContourVisibility(layer: any) {
    if (!Array.isArray(layer.contourObjectIds) || !_interpolationGroup)
        return;
    for (const id of layer.contourObjectIds) {
        const obj = _interpolationGroup.getObjectByProperty('uuid', id);
        if (obj)
            obj.visible = !!layer.visible;
    }
    if (!Array.isArray(layer.contourLabelObjectIds))
        return;
    for (const id of layer.contourLabelObjectIds) {
        const obj = _interpolationGroup.getObjectByProperty('uuid', id);
        if (obj)
            obj.visible = !!layer.visible && !!layer.showContourLabels;
    }
}
/**
 * @param {InterpolationLayer} layer
 */
function _clearLayerContours(layer: any) {
    const contourIds = Array.isArray(layer.contourObjectIds) ? layer.contourObjectIds : [];
    const labelIds = Array.isArray(layer.contourLabelObjectIds) ? layer.contourLabelObjectIds : [];
    if (contourIds.length === 0 && labelIds.length === 0) {
        layer.contourObjectIds = [];
        layer.contourLabelObjectIds = [];
        return;
    }
    if (_interpolationGroup) {
        for (const id of [...contourIds, ...labelIds]) {
            const obj = _interpolationGroup.getObjectByProperty('uuid', id);
            if (!obj)
                continue;
            if (obj.geometry?.dispose)
                obj.geometry.dispose();
            if (obj.material?.map?.dispose)
                obj.material.map.dispose();
            if (obj.material?.dispose)
                obj.material.dispose();
            _interpolationGroup.remove(obj);
        }
    }
    layer.contourObjectIds = [];
    layer.contourLabelObjectIds = [];
}
/**
 * @param {InterpolationLayer} layer
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
function _sampleLayerGridAt(layer: any, x: any, z: any) {
    if (!layer?.grid || !layer.bounds || !layer.gridSize)
        return 0;
    const { minX, maxX, minZ, maxZ } = layer.bounds;
    const { cols, rows } = layer.gridSize;
    const grid = layer.grid;
    if (x < minX || x > maxX || z < minZ || z > maxZ)
        return 0;
    const colF = ((x - minX) / (maxX - minX)) * (cols - 1);
    const rowF = ((z - minZ) / (maxZ - minZ)) * (rows - 1);
    const c0 = Math.floor(colF);
    const r0 = Math.floor(rowF);
    const c1 = Math.min(c0 + 1, cols - 1);
    const r1 = Math.min(r0 + 1, rows - 1);
    const fc = colF - c0;
    const fr = rowF - r0;
    const v00 = grid[r0 * cols + c0];
    const v10 = grid[r0 * cols + c1];
    const v01 = grid[r1 * cols + c0];
    const v11 = grid[r1 * cols + c1];
    return (1 - fc) * (1 - fr) * v00 + fc * (1 - fr) * v10 + (1 - fc) * fr * v01 + fc * fr * v11;
}
/**
 * @param {InterpolationLayer} color
 */
/**
 * Build the Three.js line object for a single contour line.
 * @param {AnyRecord} color
 * @param {AnyRecord} color
 * @param {Three.Color} color
 * @returns {any}
 */
function _buildContourLineObject(layer: AnyRecord, line: AnyRecord, color: any): any {
    const points3d = line.points.map((p: any) => new Three.Vector3(p.x, _sampleLayerGridAt(layer, p.x, p.z) + CONTOUR_Z_OFFSET, p.z));
    const geometry = new Three.BufferGeometry().setFromPoints(points3d);
    const material = new Three.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
    });
    const obj = new Three.Line(geometry, material);
    obj.name = 'interpolationContour';
    obj.visible = !!layer.visible;
    obj.userData.layerId = layer.id;
    return obj;
}

/**
 * Build a label sprite for a contour line, if enabled and within limits.
 * @param {AnyRecord} layer
 * @param {AnyRecord} line
 * @param {number} labelCount
 * @returns {{ labelObj: any, labelCount: number } | null}
 */
function _buildContourLabelIfEnabled(layer: AnyRecord, line: AnyRecord, labelCount: number): { labelObj: any; labelCount: number } | null {
    if (!layer.showContourLabels || labelCount >= MAX_CONTOUR_LABELS) return null;
    const anchor = _pickContourLabelAnchor(line.points);
    if (!anchor) return null;
    const text = `${Number(line.level).toFixed(2)} m`;
    const labelObj = _buildContourLabelSprite(text);
    labelObj.position.set(anchor.x, _sampleLayerGridAt(layer, anchor.x, anchor.z) + CONTOUR_LABEL_Z_OFFSET, anchor.z);
    labelObj.visible = !!layer.visible && !!layer.showContourLabels;
    labelObj.userData.layerId = layer.id;
    labelObj.name = 'interpolationContourLabel';
    return { labelObj, labelCount: labelCount + 1 };
}

function _rebuildLayerContours(layer: any) {
    _clearLayerContours(layer);
    if (!layer || !layer.grid || !layer.bounds || !layer.gridSize) return;
    if (!_layerSupportsContours(layer) || !layer.showContours) return;
    if (!_interpolationGroup) return;
    const contours = buildContoursFromGrid({
        grid: layer.grid,
        bounds: layer.bounds,
        gridSize: layer.gridSize,
        levelCount: _contourLevelCount(layer.contourDensity, layer.type),
    });
    if (!Array.isArray(contours) || contours.length === 0) return;
    const ids: any = [];
    const labelIds: any = [];
    let labelCount = 0;
    const _cr = sampleRamp(layer.colorRamp || 'water_table', 0.75);
    const _contourColor = new Three.Color(_cr.r, _cr.g, _cr.b);
    for (const line of contours) {
        if (!Array.isArray(line.points) || line.points.length < 2) continue;
        const obj = _buildContourLineObject(layer, line, _contourColor);
        _interpolationGroup.add(obj);
        ids.push(obj.uuid);
        const labelResult = _buildContourLabelIfEnabled(layer, line, labelCount);
        if (labelResult) {
            _interpolationGroup.add(labelResult.labelObj);
            labelIds.push(labelResult.labelObj.uuid);
            labelCount = labelResult.labelCount;
        }
    }
    layer.contourObjectIds = ids;
    layer.contourLabelObjectIds = labelIds;
}
/**
 * @param {{ x: number, z: number }[]} points
 * @returns {{ x: number, z: number }|null}
 */
function _pickContourLabelAnchor(points: any) {
    if (!Array.isArray(points) || points.length < 2)
        return null;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dz = points[i].z - points[i - 1].z;
        total += Math.hypot(dx, dz);
    }
    if (total <= 0)
        return points[Math.floor(points.length / 2)] || null;
    const target = total * 0.5;
    let acc = 0;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const seg = Math.hypot(b.x - a.x, b.z - a.z);
        if (acc + seg >= target && seg > 0) {
            const t = (target - acc) / seg;
            return {
                x: a.x + (b.x - a.x) * t,
                z: a.z + (b.z - a.z) * t,
            };
        }
        acc += seg;
    }
    return points[points.length - 1] || null;
}
/**
 * @param {string} text
 * @returns {any}
 */
function _buildContourLabelSprite(text: any) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(5, 16, 32, 0.75)';
        ctx.strokeStyle = 'rgba(0, 188, 212, 0.95)';
        ctx.lineWidth = 2;
        _roundRect(ctx, 2, 2, canvas.width - 4, canvas.height - 4, 12);
        ctx.fill();
        ctx.stroke();
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#e9fcff';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }
    const texture = new Three.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new Three.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: true,
    });
    const sprite = new Three.Sprite(material);
    sprite.scale.set(5.5, 1.5, 1);
    return sprite;
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
function _roundRect(ctx: any, x: any, y: any, w: any, h: any, r: any) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}
/**
 * Persiste layers no IndexedDB (fire-and-forget - não bloqueia o caller).
 */
function _clearScheduledPersist() {
    if (_persistTimer) {
        clearTimeout(_persistTimer);
        _persistTimer = null;
    }
    const cancelIdle = (globalThis as any).cancelIdleCallback;
    if (_persistIdleHandle != null && typeof cancelIdle === 'function') {
        cancelIdle(_persistIdleHandle);
    }
    _persistIdleHandle = null;
}

function _flushPersistSafely() {
    return _flushPersist().catch((err: any) => log.warn('Interpolation persist failed:', _errorMessage(err)));
}

function _bindPersistLifecycleFlush() {
    if (_persistLifecycleBound || typeof window === 'undefined')
        return;
    const flushPending = () => {
        if (!_pendingPersistPayload)
            return;
        _clearScheduledPersist();
        void _flushPersistSafely();
    };
    window.addEventListener('pagehide', flushPending);
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden')
                flushPending();
        });
    }
    _persistLifecycleBound = true;
}

function _scheduleIdlePersistFlush() {
    const requestIdle = (globalThis as any).requestIdleCallback;
    if (typeof requestIdle === 'function') {
        _persistIdleHandle = requestIdle(() => {
            _persistIdleHandle = null;
            void _flushPersistSafely();
        }, { timeout: INTERPOLATION_PERSIST_IDLE_TIMEOUT_MS });
        return;
    }
    void _flushPersistSafely();
}

function _persist() {
    if (_suppressPersistence || isEphemeral())
        return;
    _pendingPersistPayload = exportLayers();
    _bindPersistLifecycleFlush();
    _clearScheduledPersist();
    _persistTimer = setTimeout(() => {
        _persistTimer = null;
        _scheduleIdlePersistFlush();
    }, INTERPOLATION_PERSIST_AFTER_BOOT_DELAY_MS);
}

async function _flushPersist() {
    if (isEphemeral())
        return;
    _clearScheduledPersist();
    const data = _pendingPersistPayload || exportLayers();
    _pendingPersistPayload = null;
    const ok = await idbSet(STORAGE_KEY, data);
    if (!ok)
        _toast('Storage full. Interpolation data may not persist.', 'warning');
}
/**
 * Restaura layers do IndexedDB. Migra automaticamente do localStorage na primeira execução.
 */
async function _restoreFromStorage() {
    try {
        const configs = await idbGetWithLegacy(STORAGE_KEY);
        log.debug('[Interpolation] Restoring', configs?.length || 0, 'layers from IDB');
        if (!Array.isArray(configs))
            return;
        const previousSuppressPersistence = _suppressPersistence;
        _suppressPersistence = true;
        try {
        for (const c of configs) {
            log.debug('[Interpolation] Restoring layer:', c.id, 'type:', c.type);
            const layer = addLayer(c);
            // Tenta recomputar - se grupo Three.js não disponível, catch silencia.
            // _recomputePendingLayers() (chamada por setInterpolationGroup) retenta depois.
            if (layer.type === 'terrain') {
                _recomputeTerrainLayer(layer).catch((err: any) => log.debug('Terrain restore deferred:', _errorMessage(err)));
            }
            else {
                recomputeLayer(layer.id).catch((err: any) => log.debug('Layer restore deferred:', _errorMessage(err)));
            }
        }
        } finally {
            _suppressPersistence = previousSuppressPersistence;
        }
    } catch (err: any) {
        log.warn('Failed to restore interpolation data from storage', _errorMessage(err));
    }
}
/**
 * Mostra/oculta o overlay plano da boundary (imagem aérea ShapeGeometry).
 * Evita duplicação visual quando terreno texturizado está ativo.
 * @param {boolean} visible
 */
function _setBoundaryOverlayVisible(visible: any) {
    const group = getElementsGroup();
    if (!group)
        return;
    group.traverse(
    /** @param {any} obj */ (obj: any) => {
        const sceneObject = /** @type {AnyRecord} */ (obj);
        if (sceneObject.name === 'overlay' && sceneObject.isMesh) {
            sceneObject.visible = visible;
        }
    });
    requestRender();
}
/**
 * Dispara evento de mudança.
 */
function _notify() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('interpolationChanged'));
    }
    requestInterpolationManagerUIRefresh('interpolation.manager-changed');
}
// ----------------------------------------------------------------
// TAB-MODEL-SWITCH-001 — Manager Signature (snapshot/restore per tab)
// ----------------------------------------------------------------
/**
 * Exporta estado completo para snapshot de tab.
 * Wraps exportLayers() existente + selectedLayerId.
 * NÃO inclui _interpolationGroup (Three.js — re-criado via setInterpolationGroup).
 */
export function exportState(): { layers: any; selectedLayerId: any } {
    return {
        layers: exportLayers(),
        selectedLayerId: _selectedLayerId,
    };
}
/**
 * Restaura estado a partir de snapshot (async — importLayers reconstrói malhas).
 * Tolerante a state null/malformed.
 * Caller deve chamar setInterpolationGroup() ANTES.
 */
export async function importState(state: { layers?: any; selectedLayerId?: any } | null | undefined): Promise<void> {
    clearAllLayers();
    if (!state || typeof state !== 'object') return;
    if (state.layers) {
        await importLayers(state.layers);
    }
    if (state.selectedLayerId !== undefined) {
        _selectedLayerId = state.selectedLayerId;
    }
}
/** Alias canônico para Manager Registry. */
export function resetState(): void {
    clearAllLayers();
    _selectedLayerId = null;
}
//# sourceMappingURL=manager.js.map
