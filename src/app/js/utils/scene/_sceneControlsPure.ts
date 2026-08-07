// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (scene/controls.ts).
//
// Aplicação direta da recomendação #1 do scripts/refactor-opportunities.mjs:
// scene/controls.ts aparece em 4 das top 5 cuts do maior SCC (back-edges).
// Extrair pure-logic (math + presets + interpolation) reduz fan-in interno
// ao ciclo de 29 e libera carve-out de Module C.
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. Primeira extração para utils/scene/controls.ts (933L).
//
// Spec NOT:
// - NÃO ler THREE.js / camera/controls instances (caller passa state como objeto)
// - NÃO ler module state (getCamera/getControls são side-effect)
// - NÃO requestRender (caller decide quando rerender)
// - NÃO emoji
//
// Extracted helpers:
//   - VIEW_PRESETS                  (3 presets frozen: isometric/top/front)
//   - ZOOM_LIMITS                   (min/max/step frozen)
//   - DEFAULT_ANIMATION_DURATION_MS (500)
//   - computeCameraPlanes           (near/far from camDist + extent, pure math)
//   - easeOutCubic                  (interpolation function, pure)
//   - lerpCameraState               (camera state interpolation @t∈[0,1])
//   - isValidCameraState            (type guard)
//   - resolveZoomDelta              (in/out → factor clamped to limits)

import { toFiniteNumber } from '../helpers/toFiniteNumber.js';

export interface Vector3Like {
    x: number;
    y: number;
    z: number;
}

export interface CameraStateLike {
    camera: {
        x: number;
        y: number;
        z: number;
        zoom: number;
    };
    target: Vector3Like;
}

export interface ViewPreset {
    camera: Vector3Like;
    target: Vector3Like;
}

/**
 * Frozen camera presets per view mode. Coordinates em world-space ecbyts (Y-up).
 *   isometric: 3D diagonal — vista padrão, mostra 3 faces
 *   top:       planta baixa — distribuição horizontal
 *   front:     corte frontal — profundidade/estratigrafia
 */
export const VIEW_PRESETS: Readonly<Record<'isometric' | 'top' | 'front', ViewPreset>> = Object.freeze({
    isometric: {
        camera: { x: 80, y: 80, z: 80 },
        target: { x: 0, y: -20, z: 0 },
    },
    top: {
        camera: { x: 0, y: 150, z: 0 },
        target: { x: 0, y: -20, z: 0 },
    },
    front: {
        camera: { x: 0, y: -20, z: 150 },
        target: { x: 0, y: -20, z: 0 },
    },
});

/**
 * Frozen zoom configuration.
 *   min:  máximo afastado (0.05 = ver mais área)
 *   max:  máximo aproximado (4 = ver detalhes)
 *   step: incremento por clique (1.2 = 20%)
 */
export const ZOOM_LIMITS: Readonly<{ min: number; max: number; step: number }> = Object.freeze({
    min: 0.05,
    max: 4,
    step: 1.2,
});

/** Default duration (ms) para animações de câmera. */
export const DEFAULT_ANIMATION_DURATION_MS = 500;

/**
 * Compute camera near/far planes from camera distance + model extent.
 * Margem de segurança = extent * 1.5 ao redor do camDist.
 *
 * Matches _updateCameraPlanes @ scene/controls.ts:66.
 *   near = max(0.1,  camDist - radius)
 *   far  = max(1000, camDist + radius)
 */
export function computeCameraPlanes(
    camDist: number,
    extent: number,
): { near: number; far: number; radius: number } {
    const safeExtent = Number.isFinite(extent) && extent > 0 ? extent : 1;
    const radius = safeExtent * 1.5;
    const dist = toFiniteNumber(camDist, 0);
    return {
        near: Math.max(0.1, dist - radius),
        far: Math.max(1000, dist + radius),
        radius,
    };
}

/**
 * Ease-out cubic interpolation: 1 - (1-t)^3.
 * Desacelera no final para transição suave de câmera.
 * Input t ∈ [0, 1] (não clamped — caller garante range).
 */
export function easeOutCubic(t: number): number {
    if (!Number.isFinite(t)) return 0;
    const clamped = Math.max(0, Math.min(1, t));
    return 1 - Math.pow(1 - clamped, 3);
}

/**
 * Linear interpolate uma posição vector3 a partir de start + delta * t.
 */
function lerpV3(start: Vector3Like, end: Vector3Like, t: number): Vector3Like {
    return {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
        z: start.z + (end.z - start.z) * t,
    };
}

/**
 * Lerp entre dois CameraStates @ parâmetro t (0=start, 1=end).
 * Aplica easeOutCubic à t internamente.
 *
 * Matches animateCameraState @ scene/controls.ts:484 (linha por linha mas pura).
 */
export function lerpCameraState(
    start: CameraStateLike,
    end: CameraStateLike,
    t: number,
): CameraStateLike {
    const ease = easeOutCubic(t);
    return {
        camera: {
            ...lerpV3(start.camera, end.camera, ease),
            zoom: start.camera.zoom + (end.camera.zoom - start.camera.zoom) * ease,
        },
        target: lerpV3(start.target, end.target, ease),
    };
}

/**
 * Type-guard for CameraStateLike shape.
 * Valida que camera + target existam com x/y/z numéricos.
 */
export function isValidCameraState(state: unknown): state is CameraStateLike {
    if (!state || typeof state !== 'object') return false;
    const s = state as CameraStateLike;
    if (!s.camera || typeof s.camera !== 'object') return false;
    if (!s.target || typeof s.target !== 'object') return false;
    const c = s.camera;
    if (
        typeof c.x !== 'number' ||
        typeof c.y !== 'number' ||
        typeof c.z !== 'number' ||
        typeof c.zoom !== 'number'
    ) {
        return false;
    }
    const tg = s.target;
    if (typeof tg.x !== 'number' || typeof tg.y !== 'number' || typeof tg.z !== 'number') {
        return false;
    }
    return true;
}

/**
 * Resolve zoom factor with clamping per ZOOM_LIMITS.
 *   direction: 'in'  → currentZoom × step (clamped to max)
 *              'out' → currentZoom / step (clamped to min)
 * Non-finite currentZoom → fallback 1.
 */
export function resolveZoomDelta(
    currentZoom: number,
    direction: 'in' | 'out',
    limits: { min: number; max: number; step: number } = ZOOM_LIMITS,
): number {
    const safe = Number.isFinite(currentZoom) && currentZoom > 0 ? currentZoom : 1;
    if (direction === 'in') {
        return Math.min(limits.max, safe * limits.step);
    }
    if (direction === 'out') {
        return Math.max(limits.min, safe / limits.step);
    }
    return safe;
}

/**
 * Compute relative camera direction vector (camera_pos - target_pos).
 * Usado em zoomToElement para preservar ângulo de visão ao recentralizar.
 */
export function computeRelativeCameraDirection(state: CameraStateLike): Vector3Like {
    return {
        x: state.camera.x - state.target.x,
        y: state.camera.y - state.target.y,
        z: state.camera.z - state.target.z,
    };
}
