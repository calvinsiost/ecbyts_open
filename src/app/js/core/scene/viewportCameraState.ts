// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Viewport Camera State — pure-logic, zero DOM/three.js
 *
 * UX-32 Phase 5 (final) of SPEC_3D_MODEL_EXPLORATION_JOURNEY.
 *
 * Frozen immutable state representing a camera viewport. Vetores são objetos
 * planos {x,y,z}. Sem dependências externas. Tolerância: 1e-9.
 */

const EPS = 1e-9;

export const VALID_MODES = Object.freeze([
    'perspective',
    'orthographic',
    'top',
    'side_x',
    'side_y',
    'isometric',
] as const);

export type CameraMode = (typeof VALID_MODES)[number];

export interface Vec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface BBox {
    readonly min: Vec3;
    readonly max: Vec3;
}

export interface CameraState {
    readonly position: Vec3;
    readonly target: Vec3;
    readonly up: Vec3;
    readonly fov: number;
    readonly mode: CameraMode;
}

export interface CameraSummary {
    readonly mode: CameraMode;
    readonly distance: number;
    readonly description: string;
}

export interface PresetCamera {
    readonly position: Vec3;
    readonly target: Vec3;
    readonly up: Vec3;
}

const DEFAULT_POSITION: Vec3 = Object.freeze({ x: 10, y: 10, z: 10 });
const DEFAULT_TARGET: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });
const DEFAULT_UP: Vec3 = Object.freeze({ x: 0, y: 1, z: 0 });
const DEFAULT_FOV = 50;
const DEFAULT_MODE: CameraMode = 'perspective';

// ─── Helpers ──────────────────────────────────────────────────────────────

function isFiniteNumber(n: unknown): n is number {
    return typeof n === 'number' && Number.isFinite(n);
}

function validateVec3(v: unknown, name: string): asserts v is Vec3 {
    if (!v || typeof v !== 'object') {
        throw new TypeError(`${name} must be an object {x,y,z}`);
    }
    const obj = v as { x?: unknown; y?: unknown; z?: unknown };
    if (!isFiniteNumber(obj.x) || !isFiniteNumber(obj.y) || !isFiniteNumber(obj.z)) {
        throw new TypeError(`${name} must have finite numeric x,y,z`);
    }
}

function freezeVec3(v: Vec3): Vec3 {
    return Object.freeze({ x: v.x, y: v.y, z: v.z });
}

function distance(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function validateBBox(bbox: unknown): asserts bbox is BBox {
    if (!bbox || typeof bbox !== 'object') {
        throw new TypeError('bbox must be {min,max}');
    }
    const b = bbox as { min?: unknown; max?: unknown };
    validateVec3(b.min, 'bbox.min');
    validateVec3(b.max, 'bbox.max');
    if (b.min.x > b.max.x + EPS || b.min.y > b.max.y + EPS || b.min.z > b.max.z + EPS) {
        throw new RangeError('bbox invalid: min > max on some axis');
    }
}

function bboxCenter(bbox: BBox): Vec3 {
    return {
        x: (bbox.min.x + bbox.max.x) / 2,
        y: (bbox.min.y + bbox.max.y) / 2,
        z: (bbox.min.z + bbox.max.z) / 2,
    };
}

function bboxSize(bbox: BBox): Vec3 {
    return {
        x: bbox.max.x - bbox.min.x,
        y: bbox.max.y - bbox.min.y,
        z: bbox.max.z - bbox.min.z,
    };
}

function maxExtent(bbox: BBox): number {
    const s = bboxSize(bbox);
    return Math.max(s.x, s.y, s.z, EPS);
}

function clamp01(t: number): number {
    if (!isFiniteNumber(t)) throw new TypeError('t must be finite number');
    if (t < 0) return 0;
    if (t > 1) return 1;
    return t;
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
    return {
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        z: lerp(a.z, b.z, t),
    };
}

// ─── Public API ───────────────────────────────────────────────────────────

export interface CreateCameraStateOptions {
    position?: Vec3;
    target?: Vec3;
    up?: Vec3;
    fov?: number;
    mode?: CameraMode;
}

/**
 * Creates an immutable frozen camera state.
 */
export function createCameraState(options: CreateCameraStateOptions = {}): CameraState {
    const {
        position = DEFAULT_POSITION,
        target = DEFAULT_TARGET,
        up = DEFAULT_UP,
        fov = DEFAULT_FOV,
        mode = DEFAULT_MODE,
    } = options;
    validateVec3(position, 'position');
    validateVec3(target, 'target');
    validateVec3(up, 'up');
    if (!isFiniteNumber(fov) || fov <= 0 || fov >= 180) {
        throw new RangeError('fov must be in (0, 180)');
    }
    if (!(VALID_MODES as readonly string[]).includes(mode)) {
        throw new RangeError(`mode must be one of: ${VALID_MODES.join(', ')}`);
    }
    return Object.freeze({
        position: freezeVec3(position),
        target: freezeVec3(target),
        up: freezeVec3(up),
        fov,
        mode,
    });
}

export function setPosition(state: CameraState, position: Vec3): CameraState {
    return createCameraState({ ...state, position });
}

export function setTarget(state: CameraState, target: Vec3): CameraState {
    return createCameraState({ ...state, target });
}

export function setMode(state: CameraState, mode: CameraMode): CameraState {
    return createCameraState({ ...state, mode });
}

/**
 * Returns {position, target, up} for a preset mode given a bounding box.
 */
export function getPresetCamera(mode: CameraMode, bbox: BBox): PresetCamera {
    if (!(VALID_MODES as readonly string[]).includes(mode)) {
        throw new RangeError(`mode must be one of: ${VALID_MODES.join(', ')}`);
    }
    validateBBox(bbox);
    const c = bboxCenter(bbox);
    const ext = maxExtent(bbox);
    const d = ext * 1.5;

    switch (mode) {
        case 'top':
            return {
                position: { x: c.x, y: c.y + d, z: c.z },
                target: { ...c },
                up: { x: 0, y: 0, z: -1 },
            };
        case 'side_x':
            return {
                position: { x: c.x + d, y: c.y, z: c.z },
                target: { ...c },
                up: { x: 0, y: 1, z: 0 },
            };
        case 'side_y':
            return {
                position: { x: c.x, y: c.y, z: c.z + d },
                target: { ...c },
                up: { x: 0, y: 1, z: 0 },
            };
        case 'isometric':
        case 'perspective':
        case 'orthographic':
        default: {
            const k = d / Math.sqrt(3);
            return {
                position: { x: c.x + k, y: c.y + k, z: c.z + k },
                target: { ...c },
                up: { x: 0, y: 1, z: 0 },
            };
        }
    }
}

/**
 * Returns a new state framing the bbox while preserving the current mode.
 */
export function frameBoundingBox(state: CameraState, bbox: BBox, padding = 1.2): CameraState {
    if (!isFiniteNumber(padding) || padding <= 0) {
        throw new RangeError('padding must be > 0');
    }
    validateBBox(bbox);
    const preset = getPresetCamera(state.mode, bbox);
    const c = preset.target;
    const dir: Vec3 = {
        x: preset.position.x - c.x,
        y: preset.position.y - c.y,
        z: preset.position.z - c.z,
    };
    const dirLen = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z) || 1;
    const ext = maxExtent(bbox);
    const fovRad = (state.fov * Math.PI) / 180;
    const desiredDist = (ext / 2 / Math.tan(fovRad / 2)) * padding;
    const scaleFactor = desiredDist / dirLen;
    return createCameraState({
        position: {
            x: c.x + dir.x * scaleFactor,
            y: c.y + dir.y * scaleFactor,
            z: c.z + dir.z * scaleFactor,
        },
        target: c,
        up: preset.up,
        fov: state.fov,
        mode: state.mode,
    });
}

/**
 * Linear interpolation of position/target/fov for t∈[0,1] (clamped).
 * Mode and up are taken from stateA (mode is non-interpolable).
 */
export function interpolateStates(stateA: CameraState, stateB: CameraState, t: number): CameraState {
    const clamped = clamp01(t);
    return createCameraState({
        position: lerpVec3(stateA.position, stateB.position, clamped),
        target: lerpVec3(stateA.target, stateB.target, clamped),
        up: stateA.up,
        fov: lerp(stateA.fov, stateB.fov, clamped),
        mode: stateA.mode,
    });
}

/**
 * Human-readable summary.
 */
export function summarizeCamera(state: CameraState): CameraSummary {
    const dist = distance(state.position, state.target);
    const description = `${state.mode} camera at distance ${dist.toFixed(2)} (fov ${state.fov}°)`;
    return { mode: state.mode, distance: dist, description };
}
