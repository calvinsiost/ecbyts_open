// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

interface Point2D {
    x: number;
    y: number;
}

interface ElementXY {
    id: string;
    x: number;
    y: number;
}

interface InertialState {
    vx: number;
    vy: number;
    frameCount: number;
}

interface Viewport {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface WorldBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

interface MinimapSize {
    width: number;
    height: number;
}

interface LayerEntry {
    id: string;
    name: string;
    visible: boolean;
    locked: boolean;
    order: number;
}

/* ================================================================
   PID PHASE 2 — SPEC_PID_DIAGRAM_IMPROVEMENTS (nice-to-haves)

   Complementa canvasEngine.js (Phase 1) com helpers pure:
   - Snap-to-grid §RF-2
   - Inertial pan state machine §RF-1
   - Mini-map viewport projection §RF-5
   - Layer registry com lock/visibility §RF-6
   - Drag-from-palette state

   UI (canvas rendering, mouse events) fica em handler/ui/.
   ================================================================ */


// ──────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────

export const SNAP_CONFIG_DEFAULT = Object.freeze({
    gridSize: 10, // px
    snapDistance: 5, // px — snap só se dentro dessa distância
    showGrid: true,
});

export const INERTIAL_CONFIG = Object.freeze({
    FRICTION: 0.9,
    VELOCITY_THRESHOLD: 0.1,
    MAX_FRAMES: 120, // 2s a 60fps
});

// ──────────────────────────────────────────────────────────────────────
// Snap-to-Grid §RF-2
// ──────────────────────────────────────────────────────────────────────

/**
 * Arredonda valor ao grid mais próximo.
 * @param {number} value
 * @param {number} [gridSize]
 * @returns {number}
 */
export function snapToGrid(value: number, gridSize: number = SNAP_CONFIG_DEFAULT.gridSize): number {
    const v = Number(value);
    const g = Number(gridSize) || SNAP_CONFIG_DEFAULT.gridSize;
    if (!Number.isFinite(v)) return 0;
    return Math.round(v / g) * g;
}

/**
 * Snap condicional: só arredonda se within snapDistance.
 * @param {number} value
 * @param {number} [gridSize]
 * @param {number} [snapDistance]
 * @returns {number}
 */
export function snapToGridIfClose(
    value: number,
    gridSize: number = SNAP_CONFIG_DEFAULT.gridSize,
    snapDistance: number = SNAP_CONFIG_DEFAULT.snapDistance,
): number {
    const v = Number(value);
    if (!Number.isFinite(v)) return 0;
    const snapped = snapToGrid(v, gridSize);
    if (Math.abs(snapped - v) <= Number(snapDistance)) return snapped;
    return v;
}

/**
 * Snap 2D point.
 * @param {Point2D|null|undefined} point
 * @param {number} [gridSize]
 * @returns {Point2D}
 */
export function snapPointToGrid(point: Point2D|null|undefined, gridSize: number = SNAP_CONFIG_DEFAULT.gridSize): Point2D {
    if (!point) return { x: 0, y: 0 };
    return {
        x: snapToGrid(point.x, gridSize),
        y: snapToGrid(point.y, gridSize),
    };
}

/**
 * Detecta elementos alignados dentro de tolerance (guide lines).
 * @param {Point2D|null|undefined} draggedPos
 * @param {ElementXY[]} others
 * @param {number} [tolerance]
 * @returns {{ hAlign: ElementXY[], vAlign: ElementXY[] }}
 */
export function findAlignedElements(draggedPos: Point2D|null|undefined, others: ElementXY[], tolerance: number = SNAP_CONFIG_DEFAULT.snapDistance): { hAlign: ElementXY[], vAlign: ElementXY[] } {
    const hAlign: ElementXY[] = [];
    const vAlign: ElementXY[] = [];
    if (!draggedPos || !Array.isArray(others)) return { hAlign, vAlign };
    for (const o of others) {
        if (!o) continue;
        if (Math.abs(o.y - draggedPos.y) <= tolerance) hAlign.push(o);
        if (Math.abs(o.x - draggedPos.x) <= tolerance) vAlign.push(o);
    }
    return { hAlign, vAlign };
}

// ──────────────────────────────────────────────────────────────────────
// Inertial Pan §RF-1
// ──────────────────────────────────────────────────────────────────────

/**
 * Tick de pan inercial. Retorna próximo estado.
 * @param {InertialState|null|undefined} state
 * @param {number} [friction]
 * @returns {{ vx: number, vy: number, frameCount: number, done: boolean }}
 */
export function inertialPanTick(state: InertialState|null|undefined, friction: number = INERTIAL_CONFIG.FRICTION): { vx: number, vy: number, frameCount: number, done: boolean } {
    const s = state || { vx: 0, vy: 0, frameCount: 0 };
    const vx = (Number(s.vx) || 0) * Number(friction);
    const vy = (Number(s.vy) || 0) * Number(friction);
    const frameCount = (Number(s.frameCount) || 0) + 1;
    const done =
        (Math.abs(vx) < INERTIAL_CONFIG.VELOCITY_THRESHOLD && Math.abs(vy) < INERTIAL_CONFIG.VELOCITY_THRESHOLD) ||
        frameCount >= INERTIAL_CONFIG.MAX_FRAMES;
    return { vx, vy, frameCount, done };
}

// ──────────────────────────────────────────────────────────────────────
// Mini-map projection §RF-5
// ──────────────────────────────────────────────────────────────────────

/**
 * Projeta bbox do mundo para coordenadas do mini-map.
 * @param {Viewport|null|undefined} worldViewport - viewport atual em coords do diagrama
 * @param {WorldBounds|null|undefined} worldBounds - limites do diagrama
 * @param {MinimapSize|null|undefined} minimapSize - em px
 * @returns {Viewport}
 */
export function projectViewportToMinimap(worldViewport: Viewport|null|undefined, worldBounds: WorldBounds|null|undefined, minimapSize: MinimapSize|null|undefined): Viewport {
    if (!worldViewport || !worldBounds || !minimapSize) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }
    const wWidth = worldBounds.maxX - worldBounds.minX;
    const wHeight = worldBounds.maxY - worldBounds.minY;
    if (wWidth <= 0 || wHeight <= 0) return { x: 0, y: 0, width: 0, height: 0 };

    const sx = minimapSize.width / wWidth;
    const sy = minimapSize.height / wHeight;
    return {
        x: (worldViewport.x - worldBounds.minX) * sx,
        y: (worldViewport.y - worldBounds.minY) * sy,
        width: worldViewport.width * sx,
        height: worldViewport.height * sy,
    };
}

/**
 * Inverso: click no minimap → coord mundo.
 * @param {Point2D|null|undefined} minimapPoint
 * @param {WorldBounds|null|undefined} worldBounds
 * @param {MinimapSize|null|undefined} minimapSize
 * @returns {Point2D}
 */
export function minimapPointToWorld(minimapPoint: Point2D|null|undefined, worldBounds: WorldBounds|null|undefined, minimapSize: MinimapSize|null|undefined): Point2D {
    if (!minimapPoint || !worldBounds || !minimapSize) return { x: 0, y: 0 };
    const wWidth = worldBounds.maxX - worldBounds.minX;
    const wHeight = worldBounds.maxY - worldBounds.minY;
    return {
        x: worldBounds.minX + (minimapPoint.x / minimapSize.width) * wWidth,
        y: worldBounds.minY + (minimapPoint.y / minimapSize.height) * wHeight,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Layer Registry §RF-6
// ──────────────────────────────────────────────────────────────────────

/**
 * @returns {Map<string, LayerEntry>}
 */
export function createLayerRegistry(): Map<string, LayerEntry> {
    const map: Map<string, LayerEntry> = new Map();
    // Defaults
    const defaults = [
        { id: 'piping', name: 'Tubulações', order: 0 },
        { id: 'equipment', name: 'Equipamentos', order: 1 },
        { id: 'annotations', name: 'Anotações', order: 2 },
    ];
    for (const d of defaults) {
        map.set(d.id, { ...d, visible: true, locked: false });
    }
    return map;
}

/**
 * @param {Map<string, LayerEntry>} registry
 * @param {{id: string, name: string}} layer
 * @returns {{ ok: boolean, reason?: string }}
 */
export function addLayer(registry: Map<string, LayerEntry>, layer: {id: string, name: string}): { ok: boolean, reason?: string } {
    if (!(registry instanceof Map)) return { ok: false, reason: 'invalid_registry' };
    if (!layer || !layer.id || !layer.name) return { ok: false, reason: 'invalid_layer' };
    if (registry.has(layer.id)) return { ok: false, reason: 'id_exists' };
    const order = Math.max(0, ...[...registry.values()].map( (l: LayerEntry) => l.order || 0)) + 1;
    registry.set(layer.id, { id: layer.id, name: layer.name, visible: true, locked: false, order });
    return { ok: true };
}

/**
 * @param {Map<string, LayerEntry>} registry
 * @param {string} LayerEntry>
 * @returns {boolean} novo estado de visibilidade
 */
export function toggleLayerVisibility(registry: Map<string, LayerEntry>, layerId: string): boolean {
    if (!(registry instanceof Map)) return false;
    const l = registry.get(layerId);
    if (!l) return false;
    l.visible = !l.visible;
    return l.visible;
}

/**
 * @param {Map<string, LayerEntry>} registry
 * @param {string} LayerEntry>
 * @returns {boolean} novo estado de lock
 */
export function toggleLayerLock(registry: Map<string, LayerEntry>, layerId: string): boolean {
    if (!(registry instanceof Map)) return false;
    const l = registry.get(layerId);
    if (!l) return false;
    l.locked = !l.locked;
    return l.locked;
}

/**
 * Retorna layers ordenadas por order ascendente.
 * @param {Map<string, LayerEntry>} registry
 * @returns {LayerEntry[]}
 */
export function listLayersSorted(registry: Map<string, LayerEntry>): LayerEntry[] {
    if (!(registry instanceof Map)) return [];
    return [...registry.values()].sort(
         (a: LayerEntry, b: LayerEntry) => a.order - b.order,
    );
}

/**
 * @param {Map<string, LayerEntry>} registry
 * @param {string} LayerEntry>
 * @returns {boolean} - pode editar elementos desta layer?
 */
export function isLayerEditable(registry: Map<string, LayerEntry>, layerId: string): boolean {
    if (!(registry instanceof Map)) return false;
    const l = registry.get(layerId);
    return !!l && l.visible && !l.locked;
}
