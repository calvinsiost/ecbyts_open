// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface CameraState {
    position: Vec3;
    target: Vec3;
    zoom?: number;
}

export type EaseFn = (t: number) => number;

/**
 * Cubic ease in/out - symmetric S-curve.
 */
export function cubicEase(t: number): number {
    if (t < 0) return 0;
    if (t > 1) return 1;
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Linear ease (identity).
 */
export function linearEase(t: number): number {
    if (t < 0) return 0;
    if (t > 1) return 1;
    return t;
}

/**
 * Ease in/out (smoothstep).
 */
export function easeInOut(t: number): number {
    if (t < 0) return 0;
    if (t > 1) return 1;
    return t * t * (3 - 2 * t);
}

const EASE_MAP = {
    linear: linearEase,
    cubic: cubicEase,
    easeInOut: easeInOut,
} as const;

type EaseName = keyof typeof EASE_MAP;

/**
 * Get ease function by name. Defaults to cubic.
 */
export function getEase(name: string): EaseFn {
    return (EASE_MAP[name as EaseName] || cubicEase);
}

/**
 * Linear interpolate two 3D vectors (object form { x, y, z }).
 */
export function lerpVector3(a: Vec3, b: Vec3, t: number): Vec3 {
    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
    };
}

/**
 * Linear interpolate scalar.
 */
export function lerpScalar(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/**
 * Tween Three.js camera between 2 states.
 */
export function tweenCamera(
    camera: unknown,
    from: CameraState,
    to: CameraState,
    duration: number,
    easeName: string = 'cubic',
    onUpdate?: (state: { position: Vec3, target: Vec3, zoom: number, t: number }) => void,
): Promise<void> {
    return new Promise((resolve) => {
        const cam = camera as { 
            position: { set: (x: number, y: number, z: number) => void, x: number, y: number, z: number },
            zoom: number,
            updateProjectionMatrix?: () => void 
        };

        if (!cam || duration <= 0) {
            // Immediate snap
            if (cam && to.position) {
                cam.position.set(to.position.x, to.position.y, to.position.z);
            }
            if (cam && to.zoom != null) {
                cam.zoom = to.zoom;
                cam.updateProjectionMatrix?.();
            }
            resolve();
            return;
        }

        const ease = getEase(easeName);
        const start = performance.now();
        const durationMs = duration * 1000;
        let rafId: number | null = null;

        function step() {
            const elapsed = performance.now() - start;
            const t = Math.min(1, elapsed / durationMs);
            const k = ease(t);

            const pos = lerpVector3(from.position, to.position, k);
            cam.position.set(pos.x, pos.y, pos.z);

            if (from.zoom != null && to.zoom != null) {
                cam.zoom = lerpScalar(from.zoom, to.zoom, k);
                cam.updateProjectionMatrix?.();
            }

            // Target is for OrbitControls - caller passes controls.target
            const target = lerpVector3(from.target, to.target, k);

            if (onUpdate) {
                onUpdate({ position: pos, target, zoom: cam.zoom, t: k });
            }

            if (t < 1) {
                rafId = requestAnimationFrame(step);
            } else {
                resolve();
            }
        }

        rafId = requestAnimationFrame(step);

        // Allow caller to abort by returning the rafId on a side channel - for now Promise-only
        return () => {
            if (rafId) cancelAnimationFrame(rafId);
        };
    }) as Promise<void>;
}

/**
 * Snapshot camera state into plain object (serializable for ECBT).
 */
export function snapshotCamera(
    camera: unknown, 
    controls?: { target?: Vec3 } | null
): CameraState | null {
    const cam = camera as { 
        position: { x: number, y: number, z: number }, 
        zoom: number 
    };

    if (!cam) return null;
    const target = controls?.target || { x: 0, y: 0, z: 0 };
    return {
        position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
        target: { x: target.x, y: target.y, z: target.z },
        zoom: cam.zoom ?? 1.0,
    };
}