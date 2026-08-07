// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Tween Engine - Phase 1.28 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S28
 *
 * Phase 1.28 (2026-05-01) - pure-logic animation tween primitives
 * para transições visuais. Suporta chained sequences, parallel
 * groups, e múltiplas easing curves. Usado em camera, color, sizing.
 *
 * Estratégia:
 *   - Tween: from → to em durationMs
 *   - 7 easings: linear/easeInOut/easeIn/easeOut/cubic/elastic/bounce
 *   - TweenGroup: parallel (todos terminam juntos)
 *   - TweenChain: sequential (próximo começa quando anterior termina)
 *   - Engine: tick(now) → snapshot de active tweens
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Easing functions canônicas. */
export const EASINGS = Object.freeze({
    linear: (t: any) => t,
    easeIn: (t: any) => t * t,
    easeOut: (t: any) => t * (2 - t),
    easeInOut: (t: any) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    cubic: (t: any) => t * t * t,
    elastic: (t: any) => {
        if (t === 0 || t === 1) return t;
        const p = 0.3;
        return -Math.pow(2, 10 * (t - 1)) * Math.sin(((t - 1.1) * 2 * Math.PI) / p);
    },
    bounce: (t: any) => {
        if (t < 1 / 2.75) return 7.5625 * t * t;
        if (t < 2 / 2.75) {
            const t2 = t - 1.5 / 2.75;
            return 7.5625 * t2 * t2 + 0.75;
        }
        if (t < 2.5 / 2.75) {
            const t2 = t - 2.25 / 2.75;
            return 7.5625 * t2 * t2 + 0.9375;
        }
        const t2 = t - 2.625 / 2.75;
        return 7.5625 * t2 * t2 + 0.984375;
    },
});

/** Easing names canônicos. */
export const EASING_NAMES = Object.freeze(Object.keys(EASINGS));

/** Identidade do módulo. */
export const TWEEN_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.28',
    deliveredAt: '2026-05-01',
    easings: EASING_NAMES,
});

/**
 * Verifica se easing name é canônico.
 */
export function isValidEasing(name: any): boolean {
    return typeof name === 'string' && EASING_NAMES.includes(name);
}

/**
 * Resolve easing fn por name.
 */
export function getEasing(name: any): (t: any) => number {
    if (!isValidEasing(name)) return EASINGS.linear;
    return (EASINGS as Record<string, any>)[name];
}

/**
 * Lerp escalar.
 */
export function lerp(from: any, to: any, t: any): any {
    if (!Number.isFinite(from) || !Number.isFinite(to)) return from;
    if (!Number.isFinite(t)) return from;
    return from + (to - from) * t;
}

/**
 * Lerp objeto (interpolate número-a-número).
 */
export function lerpObject(from: any, to: any, t: any): any {
    if (!from || !to || typeof from !== 'object' || typeof to !== 'object') return from;
    const out: Record<string, any> = {};
    for (const key of Object.keys(from)) {
        if (Number.isFinite(from[key]) && Number.isFinite(to[key])) {
            out[key] = lerp(from[key], to[key], t);
        } else {
            out[key] = from[key];
        }
    }
    return Object.freeze(out);
}

/**
 * Cria tween descriptor frozen.
 *
 * @param spec
 */
export function createTween(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createTween: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createTween: id required');
    }
    if (!Number.isFinite(spec.durationMs) || spec.durationMs <= 0) {
        throw new TypeError('createTween: durationMs must be positive');
    }
    return Object.freeze({
        id: spec.id,
        from: spec.from !== undefined ? spec.from : null,
        to: spec.to !== undefined ? spec.to : null,
        durationMs: spec.durationMs,
        easing: isValidEasing(spec.easing) ? spec.easing : 'linear',
        startedAt: spec.startedAt || null,
    });
}

/**
 * Inicia tween (set startedAt).
 */
export function startTween(tween: any, now: any): any {
    if (!tween) return null;
    if (!Number.isFinite(now)) now = 0;
    return Object.freeze({ ...tween, startedAt: now });
}

/**
 * Computa progress (0..1) de tween em tempo now.
 */
export function getProgress(tween: any, now: any): number {
    if (!tween || !Number.isFinite(tween.startedAt) || !Number.isFinite(now)) return 0;
    if (!Number.isFinite(tween.durationMs) || tween.durationMs <= 0) return 1;
    const elapsed = now - tween.startedAt;
    if (elapsed <= 0) return 0;
    if (elapsed >= tween.durationMs) return 1;
    return elapsed / tween.durationMs;
}

/**
 * Computa eased value de tween em tempo now.
 */
export function evaluateTween(tween: any, now: any): any {
    if (!tween) return null;
    const t = getProgress(tween, now);
    const easingFn = getEasing(tween.easing) as (x: number) => number;
    const eased = easingFn(t);
    if (typeof tween.from === 'number') {
        return lerp(tween.from, tween.to, eased);
    }
    if (tween.from && typeof tween.from === 'object') {
        return lerpObject(tween.from, tween.to, eased);
    }
    return eased >= 1 ? tween.to : tween.from;
}

/**
 * Verifica se tween terminou.
 */
export function isComplete(tween: any, now: any): boolean {
    return getProgress(tween, now) >= 1;
}

/**
 * Cria tween group (parallel).
 */
export function createGroup(tweens: any, options: any = {}): any {
    if (!Array.isArray(tweens)) {
        throw new TypeError('createGroup: tweens must be array');
    }
    return Object.freeze({
        type: 'group',
        id: options.id || `group-${Date.now()}`,
        children: Object.freeze(tweens.map((t) => Object.freeze({ ...t }))),
    });
}

/**
 * Cria tween chain (sequential).
 */
export function createChain(tweens: any, options: any = {}): any {
    if (!Array.isArray(tweens)) {
        throw new TypeError('createChain: tweens must be array');
    }
    return Object.freeze({
        type: 'chain',
        id: options.id || `chain-${Date.now()}`,
        children: Object.freeze(tweens.map((t) => Object.freeze({ ...t }))),
    });
}

/**
 * Computa total duration de chain (soma) ou group (max).
 */
export function totalDuration(composite: any): number {
    if (!composite || !Array.isArray(composite.children)) return 0;
    if (composite.type === 'group') {
        let max = 0;
        for (const c of composite.children) {
            if (Number.isFinite(c.durationMs) && c.durationMs > max) max = c.durationMs;
        }
        return max;
    }
    if (composite.type === 'chain') {
        let total = 0;
        for (const c of composite.children) {
            if (Number.isFinite(c.durationMs)) total += c.durationMs;
        }
        return total;
    }
    return 0;
}

/**
 * Avalia composite em tempo relativo (offset desde start).
 */
export function evaluateComposite(composite: any, offset: any): any {
    if (!composite || !Array.isArray(composite.children)) return [];
    if (!Number.isFinite(offset)) offset = 0;
    const results = [];
    if (composite.type === 'group') {
        for (const c of composite.children) {
            const t = startTween(c, 0);
            results.push({ id: c.id, value: evaluateTween(t, offset) });
        }
    } else if (composite.type === 'chain') {
        let elapsed = 0;
        for (const c of composite.children) {
            const localOffset = offset - elapsed;
            const t = startTween(c, 0);
            if (localOffset <= 0) {
                results.push({ id: c.id, value: c.from });
            } else if (localOffset >= c.durationMs) {
                results.push({ id: c.id, value: c.to });
            } else {
                results.push({ id: c.id, value: evaluateTween(t, localOffset) });
            }
            elapsed += c.durationMs;
        }
    }
    return Object.freeze(results.map((r) => Object.freeze(r)));
}

/**
 * Sumariza tween/composite.
 */
export function summarizeTween(item: any): any {
    const empty = { type: 'unknown', durationMs: 0, childCount: 0 };
    if (!item) return empty;
    if (item.type === 'group' || item.type === 'chain') {
        return Object.freeze({
            type: item.type,
            durationMs: totalDuration(item),
            childCount: Array.isArray(item.children) ? item.children.length : 0,
        });
    }
    return Object.freeze({
        type: 'tween',
        durationMs: item.durationMs || 0,
        childCount: 0,
    });
}

/**
 * Module identity export.
 */
export const tweenEngineMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.28',
    deliveredAt: '2026-05-01',
    easings: EASING_NAMES,
    exports: [
        'EASINGS',
        'EASING_NAMES',
        'TWEEN_META',
        'isValidEasing',
        'getEasing',
        'lerp',
        'lerpObject',
        'createTween',
        'startTween',
        'getProgress',
        'evaluateTween',
        'isComplete',
        'createGroup',
        'createChain',
        'totalDuration',
        'evaluateComposite',
        'summarizeTween',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
