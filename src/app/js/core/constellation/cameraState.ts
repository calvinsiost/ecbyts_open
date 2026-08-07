// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Camera State - Phase 1.13 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S13
 *
 * Phase 1.13 (2026-05-01) - pure-logic helpers para gerenciar estado
 * de câmera (position, target, zoom) em visualizações de constelação.
 * Inclui clamping, smoothing e cálculo de fit-to-bounds.
 *
 * Estratégia:
 *   - State imutável: { position: {x,y,z}, target: {x,y,z}, zoom }
 *   - Bounded transitions com easing
 *   - fitToBounds: enquadra bounding box no viewport
 *   - presets: top, front, side, perspective
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Limites canônicos de câmera. */
export const CAMERA_LIMITS = Object.freeze({
    minZoom: 0.1,
    maxZoom: 100,
    minDistance: 1,
    maxDistance: 10000,
});

/** Presets de câmera. */
export const CAMERA_PRESETS = Object.freeze({
    top: Object.freeze({
        position: Object.freeze({ x: 0, y: 0, z: 100 }),
        target: Object.freeze({ x: 0, y: 0, z: 0 }),
        zoom: 1,
    }),
    front: Object.freeze({
        position: Object.freeze({ x: 0, y: -100, z: 0 }),
        target: Object.freeze({ x: 0, y: 0, z: 0 }),
        zoom: 1,
    }),
    side: Object.freeze({
        position: Object.freeze({ x: 100, y: 0, z: 0 }),
        target: Object.freeze({ x: 0, y: 0, z: 0 }),
        zoom: 1,
    }),
    perspective: Object.freeze({
        position: Object.freeze({ x: 60, y: -60, z: 60 }),
        target: Object.freeze({ x: 0, y: 0, z: 0 }),
        zoom: 1,
    }),
    isometric: Object.freeze({
        position: Object.freeze({ x: 50, y: -50, z: 50 }),
        target: Object.freeze({ x: 0, y: 0, z: 0 }),
        zoom: 1,
    }),
});

/** Identidade do módulo. */
export const CAMERA_STATE_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.13',
    deliveredAt: '2026-05-01',
    presets: Object.keys(CAMERA_PRESETS),
});

/** State default canônico. */
export const DEFAULT_CAMERA_STATE = CAMERA_PRESETS.perspective;

/**
 * Verifica se um camera state é válido.
 *
 * @param {*} state
 * @returns {boolean}
 */
export function isValidCameraState(state: any): boolean {
    if (!state || typeof state !== 'object') return false;
    if (!state.position || !state.target) return false;
    const p = state.position;
    const t = state.target;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return false;
    if (!Number.isFinite(t.x) || !Number.isFinite(t.y) || !Number.isFinite(t.z)) return false;
    if (state.zoom !== undefined && !Number.isFinite(state.zoom)) return false;
    return true;
}

/**
 * Clampa um state para os limites canônicos.
 *
 * @param {Record<string, any>} state
 * @returns {Object} state clampado (frozen)
 */
export function clampCameraState(state: Record<string, any>): Object {
    if (!isValidCameraState(state)) return DEFAULT_CAMERA_STATE;
    return Object.freeze({
        position: Object.freeze({
            x: state.position.x,
            y: state.position.y,
            z: state.position.z,
        }),
        target: Object.freeze({
            x: state.target.x,
            y: state.target.y,
            z: state.target.z,
        }),
        zoom: clampZoom(state.zoom == null ? 1 : state.zoom),
    });
}

/**
 * Clampa apenas zoom para [minZoom, maxZoom].
 */
function clampZoom(zoom: any) {
    if (!Number.isFinite(zoom)) return 1;
    return Math.max(CAMERA_LIMITS.minZoom, Math.min(CAMERA_LIMITS.maxZoom, zoom));
}

/**
 * Distância euclideana entre position e target.
 *
 * @param {Record<string, any>} state
 * @returns {number}
 */
export function cameraDistance(state: Record<string, any>): number {
    if (!isValidCameraState(state)) return 0;
    const dx = state.position.x - state.target.x;
    const dy = state.position.y - state.target.y;
    const dz = state.position.z - state.target.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Aplica preset (top/front/side/perspective/isometric).
 *
 * @param {string} presetName
 * @returns {Object} state frozen ou DEFAULT_CAMERA_STATE
 */
export function applyPreset(presetName: string): Object {
    const preset = (CAMERA_PRESETS as Record<string, any>)[presetName];
    return preset || DEFAULT_CAMERA_STATE;
}

/**
 * Lerp linear entre duas posições.
 */
function lerpVec3(a: any, b: any, t: any) {
    return Object.freeze({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
    });
}

function clamp01(t: any) {
    if (!Number.isFinite(t)) return 0;
    return Math.max(0, Math.min(1, t));
}

/**
 * Interpola entre dois states.
 *
 * @param {Record<string, any>} from
 * @param {Record<string, any>} any>
 * @param {number} to - [0,1]
 * @returns {Object} state interpolado (frozen)
 */
export function interpolateCameraStates(from: Record<string, any>, to: Record<string, any>, t: number): Object {
    if (!isValidCameraState(from)) return clampCameraState(to || DEFAULT_CAMERA_STATE);
    if (!isValidCameraState(to)) return clampCameraState(from);
    const factor = clamp01(t);
    const fromZoom = from.zoom == null ? 1 : from.zoom;
    const toZoom = to.zoom == null ? 1 : to.zoom;
    return Object.freeze({
        position: lerpVec3(from.position, to.position, factor),
        target: lerpVec3(from.target, to.target, factor),
        zoom: clampZoom(fromZoom + (toZoom - fromZoom) * factor),
    });
}

/**
 * Computa state que enquadra um bounding box.
 *
 * @param {{minX:number, maxX:number, minY:number, maxY:number, minZ:number, maxZ:number}} bounds
 * @param {{padding?: number, preset?: string}} [options]
 * @returns {Object} camera state (frozen)
 */
export function fitToBounds(bounds: {minX:number, maxX:number, minY:number, maxY:number, minZ:number, maxZ:number}, options: {padding?: number, preset?: string} = {}): Object {
    if (!bounds || typeof bounds !== 'object') return DEFAULT_CAMERA_STATE;
    const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
    if (
        !Number.isFinite(minX) ||
        !Number.isFinite(maxX) ||
        !Number.isFinite(minY) ||
        !Number.isFinite(maxY) ||
        !Number.isFinite(minZ) ||
        !Number.isFinite(maxZ)
    ) {
        return DEFAULT_CAMERA_STATE;
    }

    const padding =
        Number.isFinite(options.padding) && (options.padding) as number > 0
            ? (options.padding) as number
            : 1.2;
    const center = Object.freeze({
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        z: (minZ + maxZ) / 2,
    });
    const sizeX = Math.max(0.1, maxX - minX);
    const sizeY = Math.max(0.1, maxY - minY);
    const sizeZ = Math.max(0.1, maxZ - minZ);
    const maxSize = Math.max(sizeX, sizeY, sizeZ);

    const presetName = options.preset || 'perspective';
    const preset = (CAMERA_PRESETS as Record<string, any>)[presetName] || CAMERA_PRESETS.perspective;
    // Vector from preset target → preset position, normalized
    const dx = preset.position.x - preset.target.x;
    const dy = preset.position.y - preset.target.y;
    const dz = preset.position.z - preset.target.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const distance = maxSize * padding;

    return Object.freeze({
        position: Object.freeze({
            x: center.x + (dx / len) * distance,
            y: center.y + (dy / len) * distance,
            z: center.z + (dz / len) * distance,
        }),
        target: center,
        zoom: 1,
    });
}

/**
 * Aplica delta a state (pan/dolly/zoom).
 *
 * @param {Record<string, any>} state
 * @param {Record<string, any>} any> - {pan: {x,y,z}, dolly: number, zoomBy: number}
 * @returns {Object} novo state (frozen)
 */
export function transformCameraState(state: Record<string, any>, delta: Record<string, any>): Object {
    const base = isValidCameraState(state) ? state : DEFAULT_CAMERA_STATE;
    const d = delta || {};
    let { x: px, y: py, z: pz } = base.position;
    let { x: tx, y: ty, z: tz } = base.target;
    let zoom = base.zoom == null ? 1 : base.zoom;

    if (d.pan && typeof d.pan === 'object') {
        const dx = Number.isFinite(d.pan.x) ? d.pan.x : 0;
        const dy = Number.isFinite(d.pan.y) ? d.pan.y : 0;
        const dz = Number.isFinite(d.pan.z) ? d.pan.z : 0;
        px += dx;
        py += dy;
        pz += dz;
        tx += dx;
        ty += dy;
        tz += dz;
    }
    if (Number.isFinite(d.dolly)) {
        const dirX = px - tx;
        const dirY = py - ty;
        const dirZ = pz - tz;
        const len = Math.sqrt(dirX ** 2 + dirY ** 2 + dirZ ** 2) || 1;
        const factor = d.dolly / len;
        px += dirX * factor;
        py += dirY * factor;
        pz += dirZ * factor;
    }
    if (Number.isFinite(d.zoomBy)) {
        zoom *= d.zoomBy;
    }

    return Object.freeze({
        position: Object.freeze({ x: px, y: py, z: pz }),
        target: Object.freeze({ x: tx, y: ty, z: tz }),
        zoom: clampZoom(zoom),
    });
}

/**
 * Module identity export.
 */
export const cameraStateMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.13',
    deliveredAt: '2026-05-01',
    limits: CAMERA_LIMITS,
    presetCount: Object.keys(CAMERA_PRESETS).length,
    exports: [
        'CAMERA_LIMITS',
        'CAMERA_PRESETS',
        'CAMERA_STATE_META',
        'DEFAULT_CAMERA_STATE',
        'isValidCameraState',
        'clampCameraState',
        'cameraDistance',
        'applyPreset',
        'interpolateCameraStates',
        'fitToBounds',
        'transformCameraState',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
