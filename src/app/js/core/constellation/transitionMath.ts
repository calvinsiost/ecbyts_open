// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Transition Math - Phase 1.10 pure logic helpers
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md (extension)
 *
 * Phase 1.10 (2026-05-01) - pure-logic helpers para interpolação de
 * estados visuais (positions, radii, colors). Complementa toda Phase 1.x
 * sem depender de browser/Three.js/requestAnimationFrame.
 *
 * Provê:
 *   - Easing functions (8 canônicas + sample utils)
 *   - lerp/clamp/normalize numéricos
 *   - interpolatePosition (Map<id, pos> → Map<id, pos>)
 *   - interpolateRadii / interpolateColors
 *   - tween descritor (target + duration + easing)
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Easing functions canônicas (t ∈ [0, 1]). */
export const EASING_FUNCTIONS = Object.freeze({
    linear: (t: any) => t,
    easeInQuad: (t: any) => t * t,
    easeOutQuad: (t: any) => 1 - (1 - t) * (1 - t),
    easeInOutQuad: (t: any) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    easeInCubic: (t: any) => t * t * t,
    easeOutCubic: (t: any) => 1 - Math.pow(1 - t, 3),
    easeInOutCubic: (t: any) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    easeInOutQuint: (t: any) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2),
});

/** Identidade do módulo. */
export const TRANSITION_MATH_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.10',
    deliveredAt: '2026-05-01',
    easings: Object.keys(EASING_FUNCTIONS),
});

/**
 * Linear interpolation entre dois números.
 */
export function lerp(a: number, b: number, t: number): number {
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(t)) {
        return a;
    }
    return a + (b - a) * t;
}

/**
 * Clamp valor em range.
 */
export function clamp(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min;
    if (min > max) [min, max] = [max, min];
    return Math.max(min, Math.min(max, v));
}

/**
 * Normaliza valor entre [min, max] para [0, 1]; clampa fora-de-range.
 */
export function normalize(v: number, min: number, max: number): number {
    if (!Number.isFinite(v) || !Number.isFinite(min) || !Number.isFinite(max)) return 0;
    if (min === max) return 0;
    return clamp((v - min) / (max - min), 0, 1);
}

/**
 * Aplica função de easing.
 */
export function applyEasing(t: number, easing: string | Function = 'linear'): number {
    const tt = clamp(t, 0, 1);
    const easingMap = EASING_FUNCTIONS as Record<string, (t: any) => number>;
    const fn = typeof easing === 'function' ? easing : easingMap[easing] || easingMap.linear;
    return (fn as (t: any) => number)(tt);
}

/**
 * Interpola positions (Map<id, {x, y}>) entre estados a → b com progress t.
 * IDs presentes em apenas um lado mantêm sua posição estática.
 */
export function interpolatePositions(
    a: Map<string, { x: number; y: number }>,
    b: Map<string, { x: number; y: number }>,
    t: number,
    easing: string | Function = 'linear',
): Map<string, { x: number; y: number }> {
    const out = new Map<string, { x: number; y: number }>();
    if (!(a instanceof Map) && !(b instanceof Map)) return out;
    const eased = applyEasing(t, easing);

    if (!(b instanceof Map)) {
        for (const [id, pos] of a) {
            if (pos) out.set(id, { x: pos.x, y: pos.y });
        }
        return out;
    }
    if (!(a instanceof Map)) {
        for (const [id, pos] of b) {
            if (pos) out.set(id, { x: pos.x, y: pos.y });
        }
        return out;
    }

    const allIds = new Set([...a.keys(), ...b.keys()]);
    for (const id of allIds) {
        const pa = a.get(id);
        const pb = b.get(id);
        if (pa && pb) {
            out.set(id, { x: lerp(pa.x, pb.x, eased), y: lerp(pa.y, pb.y, eased) });
        } else if (pa) {
            out.set(id, { x: pa.x, y: pa.y });
        } else if (pb) {
            out.set(id, { x: pb.x, y: pb.y });
        }
    }
    return out;
}

/**
 * Interpola radii numéricos.
 */
export function interpolateRadii(
    a: Map<string, number>,
    b: Map<string, number>,
    t: number,
    easing: string | Function = 'linear',
): Map<string, number> {
    const out = new Map<string, number>();
    if (!(a instanceof Map) && !(b instanceof Map)) return out;
    const eased = applyEasing(t, easing);

    if (!(a instanceof Map)) {
        for (const [id, v] of b) out.set(id, v);
        return out;
    }
    if (!(b instanceof Map)) {
        for (const [id, v] of a) out.set(id, v);
        return out;
    }

    const allIds = new Set([...a.keys(), ...b.keys()]);
    for (const id of allIds) {
        const va = a.get(id);
        const vb = b.get(id);
        if (Number.isFinite(va) && Number.isFinite(vb)) {
            out.set(id, lerp(va as number, vb as number, eased));
        } else if (Number.isFinite(va)) {
            out.set(id, va as number);
        } else if (Number.isFinite(vb)) {
            out.set(id, vb as number);
        }
    }
    return out;
}

/**
 * Parse hex color para RGB.
 */
function _parseHex(hex: any): [number, number, number] {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
    if (!m) return [128, 128, 128];
    const v = parseInt(m[1] as string, 16);
    return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

/** RGB to hex. */
function _rgbToHex(r: any, g: any, b: any): string {
    const c = (n: any) =>
        Math.max(0, Math.min(255, Math.round(n)))
            .toString(16)
            .padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * Interpola entre dois hex colors via lerp em RGB.
 */
export function interpolateColor(
    colorA: string,
    colorB: string,
    t: number,
    easing: string | Function = 'linear',
): string {
    const eased = applyEasing(t, easing);
    const [r1, g1, b1] = _parseHex(colorA);
    const [r2, g2, b2] = _parseHex(colorB);
    return _rgbToHex(lerp(r1, r2, eased), lerp(g1, g2, eased), lerp(b1, b2, eased));
}

/**
 * Interpola color maps.
 */
export function interpolateColors(
    a: Map<string, string>,
    b: Map<string, string>,
    t: number,
    easing: string | Function = 'linear',
): Map<string, string> {
    const out = new Map<string, string>();
    if (!(a instanceof Map) && !(b instanceof Map)) return out;

    if (!(a instanceof Map)) {
        for (const [id, v] of b) out.set(id, v);
        return out;
    }
    if (!(b instanceof Map)) {
        for (const [id, v] of a) out.set(id, v);
        return out;
    }

    const allIds = new Set([...a.keys(), ...b.keys()]);
    for (const id of allIds) {
        const ca = a.get(id);
        const cb = b.get(id);
        if (typeof ca === 'string' && typeof cb === 'string') {
            out.set(id, interpolateColor(ca, cb, t, easing));
        } else if (typeof ca === 'string') {
            out.set(id, ca);
        } else if (typeof cb === 'string') {
            out.set(id, cb);
        }
    }
    return out;
}

/**
 * Cria descritor de tween (intent objeto, não animação executável).
 */
export function createTween(
    input: { duration?: number; easing?: string; delay?: number } = {},
): object {
    const inp = input as any;
    const duration = Number.isFinite(inp.duration) && inp.duration > 0 ? inp.duration : 300;
    const delay = Number.isFinite(inp.delay) && inp.delay >= 0 ? inp.delay : 0;
    const easing = inp.easing || 'easeInOutQuad';
    const easingMap = EASING_FUNCTIONS as Record<string, any>;
    if (!easingMap[easing] && typeof inp.easing !== 'function') {
        throw new Error(`Unknown easing "${inp.easing}"`);
    }
    return Object.freeze({
        duration,
        delay,
        easing,
        totalTime: duration + delay,
    });
}

/**
 * Computa progress (0..1) dado tempo decorrido + tween descritor.
 */
export function computeTweenProgress(
    elapsed: number,
    tween: Record<string, any>,
): { progress: number; eased: number; finished: boolean } {
    if (!tween || typeof tween !== 'object') {
        return { progress: 0, eased: 0, finished: false };
    }
    if (!Number.isFinite(elapsed) || elapsed < 0) {
        return { progress: 0, eased: 0, finished: false };
    }
    const { delay = 0, duration = 300, easing = 'linear' } = tween;
    if (elapsed < delay) {
        return { progress: 0, eased: 0, finished: false };
    }
    if (duration === 0) {
        return { progress: 1, eased: 1, finished: true };
    }
    const progress = clamp((elapsed - delay) / duration, 0, 1);
    const eased = applyEasing(progress, easing);
    const finished = progress >= 1;
    return { progress, eased, finished };
}

/**
 * Module identity export.
 */
export const transitionMathMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.10',
    deliveredAt: '2026-05-01',
    easings: Object.keys(EASING_FUNCTIONS),
    exports: [
        'EASING_FUNCTIONS',
        'TRANSITION_MATH_META',
        'lerp',
        'clamp',
        'normalize',
        'applyEasing',
        'interpolatePositions',
        'interpolateRadii',
        'interpolateColor',
        'interpolateColors',
        'createTween',
        'computeTweenProgress',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
