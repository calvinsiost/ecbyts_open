// @ts-check
// Generated from src/app/js/core/sequencer/plumeAnimation.ts by TS-MIGRATION-001. Do not edit manually.
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
   PLUME ANIMATION — Animacao temporal de plumas de contaminacao
   ================================================================

   Gera animacoes 3D de evolucao temporal de plumas baseadas em
   observacoes agrupadas por campanha. Cada campanha vira um frame
   da animacao.

   FLUXO:
   1. Coleta observacoes do parametro selecionado em todos os pocos
   2. Agrupa por campanha (passo temporal)
   3. Para cada campanha: IDW/Kriging -> grid 2D -> mesh THREE.js
   4. Registra handler de tick no sequencer engine
   5. Na reproducao: alterna visibilidade entre frames

   EXPORTACAO ECO1:
   - Apenas metadados (sem grids brutos nem geometrias THREE.js)
   - Grids sao recalculados ao importar (sob demanda)

   ================================================================ */
import { createTHREEProxy } from '../three-lazy.js';
/** @type {*} */
const THREE: any = createTHREEProxy();
import { getAllElements } from '../elements/manager.js';
import { getAllCampaigns } from '../campaigns/manager.js';
import { interpolateGrid } from '../interpolation/engine.js';
import { extractIsosurface } from '../interpolation/isosurface.js';
import { onTick, play, pause } from './engine.js';
import { setPlaybackSpeed } from './manager.js';
import { getElementsGroup, requestRender } from '../../utils/scene/setup.js';
import { createLogger } from '../../utils/helpers/logger.js';
const log = createLogger('PlumeAnimation');
// ----------------------------------------------------------------
// ESTADO
// ----------------------------------------------------------------
/** @type {Map<string, PlumeAnimationState>} */
const _animations = new Map();
/** @type {Map<string, Function>} unsubscribers do onTick */
const _tickUnsubscribers = new Map();
/** @type {Map<string, *>} grupos de meshes por animacao (THREE.Group) */
const _meshGroups = new Map();
let _animCounter = 0;
// ----------------------------------------------------------------
// TIPOS
// ----------------------------------------------------------------
/**
 * @typedef {Object} PlumeAnimationFrame
 * @property {string} campaignId
 * @property {string} campaignName
 * @property {string} date - ISO date da campanha
 * @property {number} pointCount - Numero de pontos usados na interpolacao
 * @property {number} minValue
 * @property {number} maxValue
 * @property {*} [_mesh] - runtime-only mesh ref (THREE.Mesh)
 * @property {*} [_grid] - runtime-only grid (Float32Array)
 */
/**
 * @typedef {Object} PlumeAnimationState
 * @property {string} id
 * @property {string} elementId
 * @property {string} parameterId
 * @property {'idw'|'kriging'} method
 * @property {PlumeAnimationFrame[]} frames
 * @property {number} isoValue - Limiar para extracao da isosuperficie
 * @property {Object} bounds - { minX, maxX, minZ, maxZ }
 * @property {{cols: number, rows: number}} gridSize
 * @property {number} _currentFrameIndex - Estado de runtime (nao exportado)
 */
// ----------------------------------------------------------------
// API PUBLICA
// ----------------------------------------------------------------
/**
 * Gera uma animacao temporal de pluma para um elemento.
 * Coleta observacoes de todos os pocos, agrupa por campanha e interpola.
 *
 * @param {string} elementId - ID do elemento pluma
 * @param {Object} [options]
 * @param {string} [options.parameterId] - Parametro a animar (se omitido, usa o primeiro disponivel)
 * @param {'idw'|'kriging'} [options.method='idw'] - Metodo de interpolacao
 * @param {number} [options.gridCols=24] - Colunas do grid
 * @param {number} [options.gridRows=24] - Linhas do grid
 * @param {number} [options.isoValue] - Limiar para isosuperficie (default: 20% do max)
 * @param {Function} [options.onProgress] - Callback de progresso 0..1
 * @returns {Promise<PlumeAnimationState>} Animacao gerada
 */
export async function generatePlumeAnimation(elementId: any, options: any = {}) {
    const element = _getElementById(elementId);
    if (!element) throw new Error(`Elemento nao encontrado: ${elementId}`);
    const { method = 'idw', gridCols = 24, gridRows = 24, onProgress } = options;
    // 1. Determinar parametro
    /** @type {string|undefined} */
    let parameterId = options.parameterId;
    if (!parameterId) {
        parameterId = _getFirstParameterId(element) || undefined;
        if (!parameterId) throw new Error('Elemento nao possui observacoes com parametros definidos.');
    }
    // 2. Coletar todas as campanhas com dados
    const campaigns = getAllCampaigns();
    const campaignDataMap = _collectObservationsByCampaign(parameterId, campaigns);
    // Ordenar por data de inicio da campanha
    const sortedCampaigns = [...campaignDataMap.entries()]
        .map(([cid, pts]) => {
            const camp = campaigns.find((/** @type {*} */ c) => c.id === cid);
            return { cid, pts, date: camp?.startDate || '', name: camp?.name || cid };
        })
        .filter((e: any) => e.pts.length >= 1)
        .sort((a: any, b: any) => a.date.localeCompare(b.date));
    if (sortedCampaigns.length < 2) {
        throw new Error('Sao necessarias pelo menos 2 campanhas com dados para gerar animacao.');
    }
    // 3. Calcular bounds do grid (bounding box de todos os pontos + margem)
    const allPoints = sortedCampaigns.flatMap((e: any) => e.pts);
    const bounds = _computeBounds(allPoints, 0.15);
    const gridSize = { cols: gridCols, rows: gridRows };
    // 4. Gerar frames
    /** @type {*[]} */
    const frames = [];
    const animId = `panim-${++_animCounter}-${Date.now().toString(36)}`;
    for (let i = 0; i < sortedCampaigns.length; i++) {
        const { cid, pts, date, name } = sortedCampaigns[i] as any;
        if (onProgress) onProgress((i / sortedCampaigns.length) * 0.8);
        let result;
        try {
            // Pontos com coordenadas x,z e valor de concentracao
            const interpPoints =
                pts.length === 1 ? [...pts, { x: pts[0].x + 0.001, z: pts[0].z + 0.001, value: pts[0].value }] : pts;
            result = await interpolateGrid(interpPoints, bounds, gridSize, method, {});
        } catch (err: any) {
            console.warn(`[ecbyts] plumeAnimation: campanha ${cid} ignorada —`, /** @type {*} */ (err).message);
            continue;
        }
        frames.push({
            campaignId: cid,
            campaignName: name,
            date,
            pointCount: pts.length,
            minValue: result.stats.min,
            maxValue: result.stats.max,
            _grid: result.grid, // runtime only — nao exportado
        });
    }
    if (onProgress) onProgress(0.9);
    if (frames.length < 2) {
        throw new Error('Dados insuficientes para gerar animacao com multiplos frames.');
    }
    // 5. Calcular isoValue padrao (20% do maximo global)
    const globalMax = Math.max(...frames.map((f: any) => f.maxValue));
    const isoValue = options.isoValue ?? globalMax * 0.2;
    // 6. Construir meshes THREE.js
    const group = new THREE.Group();
    group.name = `plume-anim-${animId}`;
    for (const frame of frames) {
        if (!frame._grid) continue;
        // Grid 3D minimo: 2 camadas para isosurface funcionar
        const layers = 2;
        const grid3D = new Float32Array(layers * gridRows * gridCols);
        // Camada 0: valores interpolados; Camada 1: zeros (abaixo da superficie)
        for (let r = 0; r < gridRows; r++) {
            for (let c = 0; c < gridCols; c++) {
                const v = frame._grid[r * gridCols + c] ?? 0;
                grid3D[0 * gridRows * gridCols + r * gridCols + c] = v;
                grid3D[1 * gridRows * gridCols + r * gridCols + c] = 0;
            }
        }
        const dims = { cols: gridCols, rows: gridRows, layers };
        // Bounds 3D: Y de -1 a 0 (superficie e no nivel Y=0)
        const bounds3D = { ...bounds, minY: -1, maxY: 0 };
        let geometry;
        try {
            geometry = extractIsosurface(grid3D, dims, bounds3D, isoValue);
        } catch {
            geometry = new THREE.PlaneGeometry(1, 1);
        }
        const material = new THREE.MeshPhongMaterial({
            color: 0xff6600,
            opacity: 0.55,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.visible = false;
        mesh.userData.frameIndex = frames.indexOf(frame);
        mesh.userData.campaignId = frame.campaignId;
        group.add(mesh);
        (frame as any)._mesh = mesh; // runtime — nao exportado
        delete (frame as any)._grid; // libera memoria do grid
    }
    // Mostrar primeiro frame
    if ((frames[0] as any)?._mesh) (frames[0] as any)._mesh.visible = true;
    // Adicionar grupo a cena
    const sceneGroup = getElementsGroup?.();
    if (sceneGroup) sceneGroup.add(group);
    _meshGroups.set(animId, group);
    if (onProgress) onProgress(1);
    // 7. Criar objeto de animacao
    /** @type {PlumeAnimationState} */
    const animation = {
        id: animId,
        elementId,
        parameterId,
        method,
        isoValue,
        bounds,
        gridSize,
        frames,
        _currentFrameIndex: 0,
    };
    _animations.set(animId, animation);
    requestRender?.();
    return animation;
}
/**
 * Registra handler de tick do sequencer para uma animacao.
 * Muda o frame visivel conforme a posicao de playback.
 *
 * @param {string} animationId
 */
export function addPlumeAnimationToSequencer(animationId: any) {
    const anim = _animations.get(animationId);
    if (!anim) return;
    // Remove listener anterior se existir
    const prev = _tickUnsubscribers.get(animationId);
    if (prev) prev();
    const unsubscribe = onTick((tickEvt: any) => {
        _onAnimationTick(animationId, tickEvt.position);
    });
    _tickUnsubscribers.set(animationId, unsubscribe);
}
/**
 * Inicia o playback de uma animacao pluma (integrado ao sequencer engine).
 *
 * @param {string} animationId
 */
export function playPlumeAnimation(animationId: any) {
    addPlumeAnimationToSequencer(animationId);
    play();
}
/**
 * Remove uma animacao e seus recursos 3D.
 *
 * @param {string} animationId
 */
export function removePlumeAnimation(animationId: any) {
    const anim = _animations.get(animationId);
    if (!anim) return;
    // Remove tick listener
    const unsub = _tickUnsubscribers.get(animationId);
    if (unsub) {
        unsub();
        _tickUnsubscribers.delete(animationId);
    }
    // Remove meshes da cena
    const group = _meshGroups.get(animationId);
    if (group) {
        group.parent?.remove(group);
        group.traverse((obj: any) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
        _meshGroups.delete(animationId);
    }
    _animations.delete(animationId);
    requestRender?.();
}
/**
 * Retorna todas as animacoes registradas.
 * @returns {PlumeAnimationState[]}
 */
export function getAllPlumeAnimations() {
    return [..._animations.values()];
}
/**
 * Retorna animacao por ID.
 * @param {string} id
 * @returns {PlumeAnimationState|null}
 */
export function getPlumeAnimationById(id: any) {
    return _animations.get(id) || null;
}
/**
 * Exporta animacoes para ECO1 (sem grids brutos nem geometrias THREE.js).
 * @returns {Object[]}
 */
export function exportPlumeAnimations() {
    return [..._animations.values()].map((anim: any) => ({
        id: anim.id,
        elementId: anim.elementId,
        parameterId: anim.parameterId,
        method: anim.method,
        isoValue: anim.isoValue,
        bounds: anim.bounds,
        gridSize: anim.gridSize,
        frames: anim.frames.map((f: any) => ({
            campaignId: f.campaignId,
            campaignName: f.campaignName,
            date: f.date,
            pointCount: f.pointCount,
            minValue: f.minValue,
            // _grid e _mesh omitidos intencionalmente
            maxValue: f.maxValue,
        })),
    }));
}
/**
 * Restaura animacoes a partir de dados ECO1 importados.
 * Meshes e grids sao recriados sob demanda.
 *
 * @param {Object[]} data
 */
export function importPlumeAnimations(data: any) {
    if (!Array.isArray(data)) return;
    for (const _anim of data) {
        const anim = _anim;
        if (!anim.id || !anim.elementId) continue;
        // Restaura metadados sem reconstruir meshes
        _animations.set(
            anim.id,
            /** @type {*} */ ({
                ...anim,
                _currentFrameIndex: 0,
            }),
        );
    }
}
/**
 * Remove todas as animacoes de pluma e seus recursos 3D da cena.
 * Limpa o estado interno (animations Map, tick listeners, mesh groups).
 * Chamavel por handleClearModel ou similar para limpeza completa.
 */
export function disposePlumeAnimations() {
    // Unsubscribe all tick listeners
    for (const [, unsub] of _tickUnsubscribers) {
        if (typeof unsub === 'function') unsub();
    }
    _tickUnsubscribers.clear();
    // Remove all mesh groups from scene and dispose GPU resources
    for (const [, group] of _meshGroups) {
        group.parent?.remove(group);
        group.traverse((obj: any) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
    }
    _meshGroups.clear();
    // Clear animation state
    _animations.clear();
    _animCounter = 0;
    requestRender?.();
}
// ----------------------------------------------------------------
// TEMPORAL INTERPOLATION API
// ----------------------------------------------------------------
/**
 * @typedef {Object} PlumeTimelineFrame
 * @property {string} campaignId
 * @property {string} campaignName
 * @property {string} date - ISO date
 * @property {number} pointCount
 * @property {Array<{x: number, z: number, value: number}>} points - Observation data
 * @property {number} minValue
 * @property {number} maxValue
 */
/**
 * @typedef {Object} PlumeTimeline
 * @property {string[]} elementIds - Plume element IDs used
 * @property {string[]} campaignIds - Campaign IDs used
 * @property {string} parameterId - Parameter being animated
 * @property {PlumeTimelineFrame[]} frames - Ordered frames by campaign date
 * @property {number} frameCount
 */
/**
 * Builds a timeline of plume observation snapshots grouped by campaign.
 * Each campaign becomes a frame containing all well observations for the
 * selected parameter. Pure data extraction - no Three.js or interpolation.
 *
 * @param {string[]} elementIds - Element IDs to include (wells are auto-discovered)
 * @param {string[]} campaignIds - Campaign IDs to include (empty = all)
 * @param {Object} [options]
 * @param {string} [options.parameterId] - Parameter to extract (auto-detected if omitted)
 * @returns {PlumeTimeline}
 */
export function buildPlumeTimeline(elementIds: any, campaignIds: any, options: any = {}) {
    const allElements = getAllElements();
    const allCampaigns = getAllCampaigns();
    // Resolve parameter ID
    /** @type {string|undefined} */
    let parameterId = options.parameterId;
    if (!parameterId) {
        // Auto-detect from first plume or well element that has observations
        const candidates = elementIds?.length
            ? allElements.filter((/** @type {*} */ e) => elementIds.includes(e.id))
            : allElements.filter((/** @type {*} */ e) => e.family === 'plume' || e.family === 'well');
        for (const el of candidates) {
            parameterId = _getFirstParameterId(el) || undefined;
            if (parameterId) break;
        }
    }
    if (!parameterId) {
        log.warn('buildPlumeTimeline: no parameter found in elements');
        return {
            elementIds: elementIds || [],
            campaignIds: campaignIds || [],
            parameterId: '',
            frames: [],
            frameCount: 0,
        };
    }
    // Filter campaigns
    const targetCampaigns = campaignIds?.length
        ? allCampaigns.filter((/** @type {*} */ c) => campaignIds.includes(c.id))
        : allCampaigns;
    // Collect observations grouped by campaign
    const campaignDataMap = _collectObservationsByCampaign(parameterId, targetCampaigns);
    // Build sorted frames
    const frames = [];
    for (const [cid, pts] of campaignDataMap.entries()) {
        if (pts.length === 0) continue;
        const camp = targetCampaigns.find((/** @type {*} */ c) => c.id === cid);
        const values = pts.map((p: any) => p.value).filter(Number.isFinite);
        frames.push({
            campaignId: cid,
            campaignName: camp?.name || cid,
            date: camp?.startDate || '',
            pointCount: pts.length,
            points: pts.map((p: any) => ({
                x: p.x,
                z: p.z,
                value: p.value,
            })),
            minValue: values.length ? Math.min(...values) : 0,
            maxValue: values.length ? Math.max(...values) : 0,
        });
    }
    // Sort by campaign date
    frames.sort((a: any, b: any) => a.date.localeCompare(b.date));
    log.info(`buildPlumeTimeline: ${frames.length} frames for parameter ${parameterId}`);
    return {
        elementIds: elementIds || [],
        campaignIds: campaignIds || [],
        parameterId,
        frames,
        frameCount: frames.length,
    };
}
/**
 * Linearly interpolates between two timeline frames.
 * For points present in both frames, values are blended by t.
 * For points only in one frame, the value is used as-is.
 *
 * @param {PlumeTimelineFrame} frameA - Start frame (t=0)
 * @param {PlumeTimelineFrame} frameB - End frame (t=1)
 * @param {number} t - Interpolation factor 0..1 (clamped)
 * @returns {PlumeTimelineFrame} Interpolated frame
 */
export function interpolateFrame(frameA: any, frameB: any, t: any) {
    // Clamp t to [0, 1]
    const ct = Math.max(0, Math.min(1, t));
    if (!frameA || !frameB) return frameA || frameB || _emptyFrame();
    if (ct === 0) return _cloneFrame(frameA);
    if (ct === 1) return _cloneFrame(frameB);
    // Build spatial index for frameB points
    const bIndex = new Map();
    for (const p of frameB.points || []) {
        bIndex.set(_pointKey(p), p);
    }
    const interpolatedPoints = [];
    // Interpolate points from frameA
    const usedB = new Set();
    for (const pa of frameA.points || []) {
        const key = _pointKey(pa);
        const pb = bIndex.get(key);
        if (pb) {
            // Both frames have this point - blend
            const val =
                _isFinite(pa.value) && _isFinite(pb.value)
                    ? pa.value * (1 - ct) + pb.value * ct
                    : _isFinite(pa.value)
                      ? pa.value
                      : _isFinite(pb.value)
                        ? pb.value
                        : 0;
            interpolatedPoints.push({ x: pa.x, z: pa.z, value: val });
            usedB.add(key);
        } else {
            // Only in frameA
            interpolatedPoints.push({ x: pa.x, z: pa.z, value: _isFinite(pa.value) ? pa.value : 0 });
        }
    }
    // Add points only in frameB
    for (const pb of frameB.points || []) {
        const key = _pointKey(pb);
        if (!usedB.has(key)) {
            interpolatedPoints.push({ x: pb.x, z: pb.z, value: _isFinite(pb.value) ? pb.value : 0 });
        }
    }
    const values = interpolatedPoints.map((p: any) => p.value).filter(Number.isFinite);
    return {
        campaignId: `interp-${frameA.campaignId}-${frameB.campaignId}`,
        campaignName: `${frameA.campaignName} -> ${frameB.campaignName} (${Math.round(ct * 100)}%)`,
        date: frameA.date, // Use start date
        pointCount: interpolatedPoints.length,
        points: interpolatedPoints,
        minValue: values.length ? Math.min(...values) : 0,
        maxValue: values.length ? Math.max(...values) : 0,
    };
}
/**
 * Updates plume mesh geometry/color for a given interpolated frame.
 * Creates or updates a temporary visualization mesh in the scene.
 *
 * @param {PlumeTimelineFrame} frame - Frame data with points
 * @param {Object} [options]
 * @param {string} [options.animationId] - Animation ID to associate with
 * @param {{cols: number, rows: number}} [options.gridSize] - Grid resolution
 * @param {'idw'|'kriging'} [options.method='idw'] - Interpolation method
 * @returns {Promise<boolean>} true if render succeeded
 */
export async function renderFrame(frame: any, options: any = {}) {
    if (!frame || !frame.points || frame.points.length === 0) {
        log.warn('renderFrame: empty frame, nothing to render');
        return false;
    }
    const { animationId, gridSize = { cols: 24, rows: 24 }, method = 'idw' } = options;
    try {
        const bounds = _computeBounds(frame.points, 0.15);
        const interpPoints =
            frame.points.length === 1
                ? [
                      ...frame.points,
                      { x: frame.points[0].x + 0.001, z: frame.points[0].z + 0.001, value: frame.points[0].value },
                  ]
                : frame.points;
        const result = await interpolateGrid(interpPoints, bounds, gridSize, method, {});
        // Build a 3D grid for isosurface (2 layers: data + zeros)
        const layers = 2;
        const grid3D = new Float32Array(layers * gridSize.rows * gridSize.cols);
        for (let r = 0; r < gridSize.rows; r++) {
            for (let c = 0; c < gridSize.cols; c++) {
                grid3D[r * gridSize.cols + c] = result.grid[r * gridSize.cols + c] ?? 0;
            }
        }
        const globalMax = frame.maxValue || 1;
        const isoValue = globalMax * 0.2;
        const dims = { cols: gridSize.cols, rows: gridSize.rows, layers };
        const bounds3D = { ...bounds, minY: -1, maxY: 0 };
        let geometry;
        try {
            geometry = extractIsosurface(grid3D, dims, bounds3D, isoValue);
        } catch {
            geometry = new THREE.PlaneGeometry(1, 1);
        }
        // Update or create the render frame mesh
        const groupName = animationId ? `plume-render-${animationId}` : 'plume-render-temp';
        let group = _renderGroups.get(groupName);
        if (!group) {
            group = new THREE.Group();
            group.name = groupName;
            const sceneGroup = getElementsGroup?.();
            if (sceneGroup) sceneGroup.add(group);
            _renderGroups.set(groupName, group);
        }
        // Clear previous children
        while (group.children.length > 0) {
            const child = group.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            group.remove(child);
        }
        // Color based on concentration (blue=low, red=high)
        const ratio = globalMax > 0 ? frame.maxValue / globalMax : 0.5;
        const hue = (1 - ratio) * 0.6; // 0.6=blue, 0=red
        const color = new THREE.Color().setHSL(hue, 0.8, 0.5);
        const material = new THREE.MeshPhongMaterial({
            color,
            opacity: 0.55,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);
        requestRender?.();
        return true;
    } catch (err: any) {
        log.error('renderFrame failed:', /** @type {*} */ (err).message);
        return false;
    }
}
/**
 * Returns the current animation frame state as a serializable object.
 * Useful for snapshots, export, or data analysis.
 *
 * @param {string} [animationId] - Specific animation ID (uses first if omitted)
 * @returns {Object|null} Serializable frame state
 */
export function exportCurrentFrame(animationId: any) {
    let anim;
    if (animationId) {
        anim = _animations.get(animationId);
    } else {
        // Use first animation
        const first = _animations.values().next();
        anim = first.done ? null : first.value;
    }
    if (!anim) return null;
    const frameIndex = anim._currentFrameIndex || 0;
    const frame = anim.frames[frameIndex];
    if (!frame) return null;
    return {
        animationId: anim.id,
        elementId: anim.elementId,
        parameterId: anim.parameterId,
        method: anim.method,
        isoValue: anim.isoValue,
        frameIndex,
        totalFrames: anim.frames.length,
        frame: {
            campaignId: frame.campaignId,
            campaignName: frame.campaignName,
            date: frame.date,
            pointCount: frame.pointCount,
            minValue: frame.minValue,
            maxValue: frame.maxValue,
        },
        bounds: anim.bounds,
        gridSize: anim.gridSize,
        timestamp: new Date().toISOString(),
    };
}
/**
 * Starts playback with optional speed control.
 * Convenience wrapper that sets speed and plays.
 *
 * @param {string} [animationId] - Animation to play
 * @param {number} [speed=1.0] - Playback speed multiplier
 */
export function startPlumePlayback(animationId: any, speed = 1.0) {
    if (typeof speed === 'number' && speed > 0) {
        setPlaybackSpeed(speed);
    }
    if (animationId) {
        playPlumeAnimation(animationId);
    } else {
        const first = _animations.values().next();
        if (!first.done) playPlumeAnimation(first.value.id);
    }
}
/**
 * Stops (pauses) plume animation playback.
 */
export function stopPlumePlayback() {
    pause();
}
/**
 * Sets the playback speed for plume animations.
 *
 * @param {number} speed - Speed multiplier (0.25 to 4.0)
 */
export function setPlumeAnimationSpeed(speed: any) {
    const clamped = Math.max(0.25, Math.min(4.0, speed));
    setPlaybackSpeed(clamped);
    log.info(`Plume animation speed set to ${clamped}x`);
}
/** @type {Map<string, *>} render frame groups (for renderFrame) (THREE.Group) */
const _renderGroups = new Map();
// ----------------------------------------------------------------
// INTERNAL - HELPERS
// ----------------------------------------------------------------
/**
 * Creates a spatial key for point deduplication in interpolation.
 * @param {{x: number, z: number}} p
 * @returns {string}
 */
function _pointKey(p: any) {
    return `${Math.round((p.x || 0) * 100)}_${Math.round((p.z || 0) * 100)}`;
}
/**
 * Checks if a value is finite (handles NaN, Infinity, non-numbers).
 * @param {*} v
 * @returns {boolean}
 */
function _isFinite(v: any) {
    return typeof v === 'number' && Number.isFinite(v);
}
/**
 * Creates an empty frame structure.
 * @returns {PlumeTimelineFrame}
 */
function _emptyFrame() {
    return {
        campaignId: '',
        campaignName: '',
        date: '',
        pointCount: 0,
        points: [],
        minValue: 0,
        maxValue: 0,
    };
}
/**
 * Deep-clones a frame (without Three.js references).
 * @param {PlumeTimelineFrame} frame
 * @returns {PlumeTimelineFrame}
 */
function _cloneFrame(frame: any) {
    return {
        campaignId: frame.campaignId,
        campaignName: frame.campaignName,
        date: frame.date,
        pointCount: frame.pointCount,
        points: (frame.points || []).map((p: any) => ({
            x: p.x,
            z: p.z,
            value: p.value,
        })),
        minValue: frame.minValue,
        maxValue: frame.maxValue,
    };
}
// ----------------------------------------------------------------
// INTERNAL - TICK HANDLER
// ----------------------------------------------------------------
/**
 * Atualiza o frame visivel com base na posicao de playback (0-1).
 *
 * @param {string} animationId
 * @param {number} position - 0.0 a 1.0
 */
function _onAnimationTick(animationId: any, position: any) {
    const anim = _animations.get(animationId);
    if (!anim || anim.frames.length === 0) return;
    const frameCount = anim.frames.length;
    const frameIndex = Math.min(Math.floor(position * frameCount), frameCount - 1);
    if (frameIndex === anim._currentFrameIndex) return;
    anim._currentFrameIndex = frameIndex;
    // Alterna visibilidade
    for (let i = 0; i < anim.frames.length; i++) {
        const mesh = anim.frames[i]._mesh;
        if (mesh) mesh.visible = i === frameIndex;
    }
    requestRender?.();
}
// ----------------------------------------------------------------
// INTERNAL - COLETA DE DADOS
// ----------------------------------------------------------------
/**
 * Coleta observacoes de um parametro, agrupadas por campaignId.
 * Usa todos os pocos do modelo para gerar interpolacoes espacialmente significativas.
 *
 * @param {string} parameterId
 * @param {Object[]} campaigns
 * @returns {Map<string, Array<{x: number, z: number, value: number}>>}
 */
function _collectObservationsByCampaign(parameterId: any, campaigns: any) {
    const result = new Map();
    const elements = getAllElements();
    const campaignIds = new Set(campaigns.map((c: any) => c.id));
    for (const el of elements) {
        if (el.family !== 'well') continue;
        const observations = el.data?.observations;
        if (!Array.isArray(observations) || observations.length === 0) continue;
        const x = el.data?.coordinates?.easting ?? el.data?.position?.x ?? 0;
        const z = el.data?.coordinates?.northing ?? el.data?.position?.z ?? 0;
        for (const obs of observations) {
            if (!obs.parameterId || obs.parameterId !== parameterId) continue;
            const val = parseFloat(obs.value);
            if (!Number.isFinite(val)) continue;
            const cid = obs.campaignId;
            if (!cid || !campaignIds.has(cid)) continue;
            if (!result.has(cid)) result.set(cid, []);
            result.get(cid).push({ x, z, value: val });
        }
    }
    // Deduplica pontos co-localizados por campanha
    for (const [cid, pts] of result.entries()) {
        result.set(cid, _deduplicatePoints(pts));
    }
    return result;
}
/**
 * Remove pontos com coordenadas duplicadas (tolerancia 0.01m).
 * @param {Array<{x: number, z: number, value: number}>} pts
 * @returns {Array<{x: number, z: number, value: number}>}
 */
function _deduplicatePoints(pts: any) {
    const seen = new Map();
    const tol = 0.01;
    for (const pt of pts) {
        const key = `${Math.round(pt.x / tol) * tol}_${Math.round(pt.z / tol) * tol}`;
        if (!seen.has(key)) seen.set(key, pt);
    }
    return [...seen.values()];
}
/**
 * Calcula bounds a partir de uma lista de pontos, com margem percentual.
 * @param {Array<{x: number, z: number}>} points
 * @param {number} points - Ex: 0.15 = 15% de margem
 * @returns {{minX: number, maxX: number, minZ: number, maxZ: number}}
 */
function _computeBounds(points: any, margin = 0.15) {
    if (points.length === 0) return { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
    let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    // Fallback para ponto unico
    if (minX === maxX) {
        minX -= 10;
        maxX += 10;
    }
    if (minZ === maxZ) {
        minZ -= 10;
        maxZ += 10;
    }
    const dx = (maxX - minX) * margin;
    const dz = (maxZ - minZ) * margin;
    return { minX: minX - dx, maxX: maxX + dx, minZ: minZ - dz, maxZ: maxZ + dz };
}
/**
 * Retorna o primeiro parametro disponivel nas observacoes do elemento.
 * @param {*} element
 * @returns {string|null}
 */
function _getFirstParameterId(element: any) {
    const obs = element.data?.observations;
    if (!Array.isArray(obs)) return null;
    for (const o of obs) {
        if (o.parameterId && Number.isFinite(parseFloat(o.value))) return o.parameterId;
    }
    return null;
}
/**
 * Recupera elemento por ID.
 * @param {string} id
 * @returns {Object|null}
 */
function _getElementById(id: any) {
    return getAllElements().find((/** @type {*} */ e) => e.id === id) || null;
}
//# sourceMappingURL=plumeAnimation.js.map
//# sourceMappingURL=plumeAnimation.js.map
