// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Layout Transition - Phase 1.31 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S31
 *
 * Phase 1.31 (2026-05-02) - pure-logic interpolação entre 2 layouts
 * (grid → force, circular → grid, etc) com animação suave per-node.
 * Combina com tweenEngine (1.28) para timing/easing.
 *
 * Estratégia:
 *   - planTransition: par (fromLayout, toLayout) → list de moves
 *   - interpolatePosition: lerp 2D com easing
 *   - computeFrameAt: snapshot de positions em tempo t
 *   - detectMaxDistance / averageDistance para budget de duração
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Easing names suportados (compatível com tweenEngine). */
export const TRANSITION_EASINGS = Object.freeze(['linear', 'easeInOut', 'easeOut', 'easeIn']);

/** Identidade do módulo. */
export const TRANSITION_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.31',
    deliveredAt: '2026-05-02',
    easings: TRANSITION_EASINGS,
});

/** Default config. */
export const DEFAULT_CONFIG = Object.freeze({
    durationMs: 800,
    easing: 'easeInOut',
    minDuration: 200,
    maxDuration: 2000,
});

/**
 * Verifica se easing é canônica.
 */
export function isValidEasing(e: any) {
    return typeof e === 'string' && TRANSITION_EASINGS.includes(e);
}

/**
 * Easing functions inline (sem dep de tweenEngine).
 */
function easeFn(name: any) {
        const map: Record<string, (t: number) => number>= {
        linear: (t) => t,
        easeIn: (t) => t * t,
        easeOut: (t) => t * (2 - t),
        easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    };
    return map[name] || map.linear!;
}

/**
 * Distância euclidiana 2D.
 */
import { distance2D as _distance2D } from '../../utils/helpers/geometry.js';
import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';
export function distance(a: any, b: any) {
    return _distance2D(a, b);
}

/**
 * Lerp 2D ponto.
 */
export function lerp2D(from: any, to: any, t: any) {
    if (!from || !to) return from || to;
    if (!Number.isFinite(t)) t = 0;
    return Object.freeze({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
    });
}

/**
 * Interpola position com easing.
 */
export function interpolatePosition(
    from: any,
    to: any,
    progress: any,
    easing = 'easeInOut',
) {
    const fn = easeFn(isValidEasing(easing) ? easing : 'easeInOut');
    const eased = fn(Math.max(0, Math.min(1, progress)));
    return lerp2D(from, to, eased);
}

/**
 * Plano de transição: list de {nodeId, from, to, distance}.
 *
 * @param {Record<string, {x: number, y: number}>} fromLayout
 * @param {Record<string, {x: number, y: number}>} toLayout
 * @returns {ReadonlyArray<any>}
 */
export function planTransition(fromLayout: Record<string, {x: number, y: number}>, toLayout: Record<string, {x: number, y: number}>): ReadonlyArray<any> {
    if (!fromLayout || !toLayout) return [];
        const out: Array<any>= [];
    for (const id of Object.keys(fromLayout)) {
        if (toLayout[id]) {
            out.push(
                Object.freeze({
                    nodeId: id,
                    from: Object.freeze({ ...fromLayout[id] }),
                    to: Object.freeze({ ...toLayout[id] }),
                    distance: distance(fromLayout[id], toLayout[id]),
                }),
            );
        }
    }
    return Object.freeze(out);
}

/**
 * Computa max distance entre layouts.
 */
export function maxDistance(plan: any) {
    if (!Array.isArray(plan) || plan.length === 0) return 0;
    let max = 0;
    for (const m of plan) {
        if (Number.isFinite(m.distance) && m.distance > max) max = m.distance;
    }
    return max;
}

/**
 * Computa average distance entre layouts.
 */
export function averageDistance(plan: any) {
    if (!Array.isArray(plan) || plan.length === 0) return 0;
    const sum = plan.reduce(
        (acc: number, m: any) => acc + toFiniteNumber(m.distance, 0),
        0,
    );
    return sum / plan.length;
}

/**
 * Calcula duração ideal baseado em max distance + budget.
 *
 * @param {Array<any>} plan
 * @param {Object} [options]
 * @returns {number}
 */
export function computeDuration(plan: Array<any>, options: Object = {}): number {
    const cfg = { ...DEFAULT_CONFIG, ...options };
    const max = maxDistance(plan);
    if (max === 0) return cfg.minDuration;
    // Heuristic: 1ms per unit distance, clamped
    const computed = Math.round(max);
    return Math.max(cfg.minDuration, Math.min(cfg.maxDuration, computed));
}

/**
 * Snapshot de positions em tempo t (0..1) durante transição.
 *
 * @param {Array<any>} plan
 * @param {number} progress (0..1)
 * @param {string} [easing='easeInOut']
 * @returns {Record<string, any>}
 */
export function computeFrameAt(plan: Array<any>, progress: number, easing: string = 'easeInOut'): Record<string, any> {
    if (!Array.isArray(plan)) return {};
        const out: Record<string, any>= {};
    for (const m of plan) {
        if (!m || !m.nodeId) continue;
        out[m.nodeId] = interpolatePosition(m.from, m.to, progress, easing);
    }
    return Object.freeze(out);
}

/**
 * Detecta nodes que são adicionados/removidos entre layouts (não interpoláveis).
 *
 * @param {Object<string, *>} fromLayout
 * @param {Object<string, *>} any>
 * @returns {any}
 */
export function detectLayoutChanges(fromLayout: Record<string, any>, toLayout: Record<string, any>): any {
    const fromKeys = new Set(Object.keys(fromLayout || {}));
    const toKeys = new Set(Object.keys(toLayout || {}));
        const added: string[]= [];
        const removed: string[]= [];
        const common: string[]= [];
    for (const k of toKeys) {
        if (fromKeys.has(k)) common.push(k);
        else added.push(k);
    }
    for (const k of fromKeys) {
        if (!toKeys.has(k)) removed.push(k);
    }
    return Object.freeze({
        added: Object.freeze(added),
        removed: Object.freeze(removed),
        common: Object.freeze(common),
    });
}

/**
 * Constrói transition state completo (pronto para tween engine).
 *
 * @param {Record<string, {x: number, y: number}>} fromLayout
 * @param {Record<string, {x: number, y: number}>} toLayout
 * @param {Record<string, any>} [config]
 * @returns {any}
 */
export function buildTransition(fromLayout: Record<string, {x: number, y: number}>, toLayout: Record<string, {x: number, y: number}>, config: Record<string, any> = {}): any {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const plan = planTransition(fromLayout, toLayout);
    const changes = detectLayoutChanges(fromLayout, toLayout);
    const durationMs = config.durationMs || computeDuration((plan as any[]), cfg);
    return Object.freeze({
        plan,
        durationMs,
        easing: isValidEasing(cfg.easing) ? cfg.easing : 'easeInOut',
        changes,
        startedAt: null,
    });
}

/**
 * Inicia transition (set startedAt).
 */
export function startTransition(transition: any, now: any) {
    if (!transition) return null;
    if (!Number.isFinite(now)) now = 0;
    return Object.freeze({ ...transition, startedAt: now });
}

/**
 * Computa progress (0..1) baseado em now + startedAt + durationMs.
 */
export function getProgress(transition: any, now: any) {
    if (!transition || !Number.isFinite(transition.startedAt) || !Number.isFinite(now)) return 0;
    const dur = transition.durationMs || 1;
    const elapsed = now - transition.startedAt;
    if (elapsed <= 0) return 0;
    if (elapsed >= dur) return 1;
    return elapsed / dur;
}

/**
 * Sumariza transition.
 */
export function summarizeTransition(transition: any) {
    const empty = {
        nodeCount: 0,
        durationMs: 0,
        addedCount: 0,
        removedCount: 0,
        maxDistance: 0,
        avgDistance: 0,
    };
    if (!transition || !Array.isArray(transition.plan)) return empty;
    return Object.freeze({
        nodeCount: transition.plan.length,
        durationMs: transition.durationMs || 0,
        addedCount: transition.changes?.added?.length || 0,
        removedCount: transition.changes?.removed?.length || 0,
        maxDistance: maxDistance(transition.plan),
        avgDistance: averageDistance(transition.plan),
    });
}

/**
 * Module identity export.
 */
export const layoutTransitionMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.31',
    deliveredAt: '2026-05-02',
    easings: TRANSITION_EASINGS,
    exports: [
        'TRANSITION_EASINGS',
        'TRANSITION_META',
        'DEFAULT_CONFIG',
        'isValidEasing',
        'distance',
        'lerp2D',
        'interpolatePosition',
        'planTransition',
        'maxDistance',
        'averageDistance',
        'computeDuration',
        'computeFrameAt',
        'detectLayoutChanges',
        'buildTransition',
        'startTransition',
        'getProgress',
        'summarizeTransition',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
