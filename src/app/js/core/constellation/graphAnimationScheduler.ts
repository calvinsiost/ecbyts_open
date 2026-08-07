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

/**
 * Constellation Graph Animation Scheduler — Phase 1.63
 * Pure scheduling: timeline, keyframes, interpolation, sequencing.
 * Zero browser/RAF/setTimeout/DOM deps.
 */

export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'step';

export type AnimValue = Readonly<Record<string, unknown>>;

export interface Keyframe {
    readonly t: number;
    readonly value: AnimValue;
}

export interface AnimationSpec {
    readonly id: string;
    readonly target: string;
    readonly keyframes: ReadonlyArray<Keyframe>;
    readonly easing?: Easing;
    readonly loop?: boolean;
}

export interface Animation {
    readonly id: string;
    readonly target: string;
    readonly keyframes: ReadonlyArray<Keyframe>;
    readonly easing: Easing;
    readonly loop: boolean;
    readonly duration: number;
    readonly startTime: number;
    readonly endTime: number;
}

export interface Scheduler {
    readonly animations: Readonly<Record<string, Animation>>;
    readonly time: number;
}

export interface TickResult {
    readonly scheduler: Scheduler;
    readonly states: Readonly<Record<string, AnimValue>>;
}

export interface SchedulerSummary {
    readonly total: number;
    readonly looping: number;
    readonly active: number;
}

export const ANIMATION_SCHEDULER_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.63',
    deliveredAt: '2026-05-02',
} as const);

export const EASING_TYPES = Object.freeze(['linear', 'easeIn', 'easeOut', 'easeInOut', 'step'] as const);

/** Funções de easing puras. */
export function applyEasing(type: string, t: number): number {
    const tc = Math.max(0, Math.min(1, t));
    switch (type) {
        case 'easeIn':
            return tc * tc;
        case 'easeOut':
            return 1 - (1 - tc) * (1 - tc);
        case 'easeInOut':
            return tc < 0.5 ? 2 * tc * tc : 1 - 2 * (1 - tc) * (1 - tc);
        case 'step':
            return tc >= 1 ? 1 : 0;
        default:
            return tc;
    }
}

/** Cria keyframe frozen. */
export function createKeyframe(t: number, value: Record<string, unknown>): Keyframe {
    if (typeof t !== 'number') throw new TypeError('keyframe t (time ms) required');
    if (!value || typeof value !== 'object') throw new TypeError('keyframe value object required');
    return Object.freeze({ t, value: Object.freeze({ ...value }) });
}

/** Cria animação frozen com lista de keyframes. */
export function createAnimation(spec: AnimationSpec): Animation {
    if (!spec || typeof spec.id !== 'string') throw new TypeError('animation id required');
    if (typeof spec.target !== 'string') throw new TypeError('animation target required');
    if (!Array.isArray(spec.keyframes) || spec.keyframes.length < 2) {
        throw new TypeError('at least 2 keyframes required');
    }
    const sorted = spec.keyframes.slice().sort((a, b) => a.t - b.t);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last) throw new TypeError('keyframes empty after sort');
    const duration = last.t - first.t;
    const easing: Easing = (EASING_TYPES as ReadonlyArray<string>).includes(spec.easing as string)
        ? (spec.easing as Easing)
        : 'linear';
    return Object.freeze({
        id: spec.id,
        target: spec.target,
        keyframes: Object.freeze(sorted.map((kf) => Object.freeze({ ...kf }))),
        easing,
        loop: spec.loop === true,
        duration,
        startTime: first.t,
        endTime: last.t,
    });
}

/** Interpola valor entre dois keyframes em tempo t. */
export function interpolateKeyframes(
    kfA: Keyframe | null | undefined,
    kfB: Keyframe | null | undefined,
    t: number,
    easing: string = 'linear',
): AnimValue {
    if (!kfA || !kfB) return Object.freeze({});
    const span = kfB.t - kfA.t;
    if (span <= 0) return Object.freeze({ ...kfB.value });
    const raw = (t - kfA.t) / span;
    const progress = applyEasing(easing, raw);
    const result: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(kfA.value), ...Object.keys(kfB.value)]);
    for (const k of keys) {
        const va = kfA.value[k];
        const vb = kfB.value[k];
        if (typeof va === 'number' && typeof vb === 'number') {
            result[k] = va + (vb - va) * progress;
        } else {
            result[k] = progress >= 1 ? vb : va;
        }
    }
    return Object.freeze(result);
}

/** Avalia animação em tempo t → estado interpolado. */
export function evaluateAnimation(anim: Animation | null | undefined, t: number): AnimValue | null {
    if (!anim || !Array.isArray(anim.keyframes)) return null;
    let time = t;
    if (anim.loop && anim.duration > 0) {
        time = anim.startTime + ((t - anim.startTime) % anim.duration);
    }
    if (time < anim.startTime || time > anim.endTime) return null;
    const kfs = anim.keyframes;
    const first = kfs[0];
    const last = kfs[kfs.length - 1];
    if (!first || !last) return null;
    if (time <= first.t) return Object.freeze({ ...first.value });
    if (time >= last.t) return Object.freeze({ ...last.value });
    for (let i = 0; i < kfs.length - 1; i++) {
        const a = kfs[i];
        const b = kfs[i + 1];
        if (a && b && time >= a.t && time <= b.t) {
            return interpolateKeyframes(a, b, time, anim.easing);
        }
    }
    return null;
}

/** Cria scheduler frozen: coleção de animações ativas. */
export function createScheduler(): Scheduler {
    return Object.freeze({ animations: Object.freeze({}), time: 0 });
}

/** Adiciona animação ao scheduler. */
export function addAnimation(scheduler: Scheduler | null | undefined, anim: Animation | null | undefined): Scheduler | null | undefined {
    if (!scheduler || !anim) return scheduler;
    return Object.freeze({
        ...scheduler,
        animations: Object.freeze({ ...scheduler.animations, [anim.id]: anim }),
    });
}

/** Remove animação do scheduler. */
export function removeAnimation(scheduler: Scheduler | null | undefined, animId: string): Scheduler | null | undefined {
    if (!scheduler || typeof animId !== 'string') return scheduler;
    const next: Record<string, Animation> = { ...scheduler.animations };
    delete next[animId];
    return Object.freeze({ ...scheduler, animations: Object.freeze(next) });
}

/** Avança scheduler para tempo t → estados de todos os targets. */
export function tick(scheduler: Scheduler | null | undefined, t: number): TickResult {
    if (!scheduler) {
        return Object.freeze({
            scheduler: createScheduler(),
            states: Object.freeze({}),
        });
    }
    const states: Record<string, AnimValue> = {};
    for (const anim of Object.values(scheduler.animations)) {
        const state = evaluateAnimation(anim, t);
        if (state) states[anim.target] = state;
    }
    const newScheduler: Scheduler = Object.freeze({ ...scheduler, time: t });
    return Object.freeze({ scheduler: newScheduler, states: Object.freeze(states) });
}

/** Sumariza scheduler. */
export function summarizeScheduler(scheduler: Scheduler | null | undefined): SchedulerSummary {
    if (!scheduler) return Object.freeze({ total: 0, looping: 0, active: 0 });
    const anims = Object.values(scheduler.animations || {});
    return Object.freeze({
        total: anims.length,
        looping: anims.filter((a) => a.loop).length,
        active: anims.filter((a) => scheduler.time >= a.startTime && scheduler.time <= a.endTime).length,
    });
}

export const graphAnimationSchedulerMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.63',
    deliveredAt: '2026-05-02',
    exports: [
        'ANIMATION_SCHEDULER_META',
        'EASING_TYPES',
        'applyEasing',
        'createKeyframe',
        'createAnimation',
        'interpolateKeyframes',
        'evaluateAnimation',
        'createScheduler',
        'addAnimation',
        'removeAnimation',
        'tick',
        'summarizeScheduler',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
} as const);
