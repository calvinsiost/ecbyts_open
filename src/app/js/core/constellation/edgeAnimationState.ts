// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Edge Animation State - Phase 1.53 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S53
 *
 * Phase 1.53 (2026-05-02) - pure-logic state machine para animações de
 * edges (flow, pulse, dash). Calcula offsets / phases sem rAF -
 * caller drena state com tick(now).
 *
 * NÃO depende de browser. Sem requestAnimationFrame/Date.now interno.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Estilos canônicos. */
export const ANIMATION_STYLES = Object.freeze(['flow', 'pulse', 'dash', 'static']);

/** Identidade do módulo. */
export const ANIMATION_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.53',
    deliveredAt: '2026-05-02',
});

/**
 * Verifica se style é canônico.
 */
export function isValidStyle( s: any) {
    return typeof s === 'string' && ANIMATION_STYLES.includes(s);
}

/**
 * Cria animation spec frozen.
 */
export function createAnimation( spec: any) {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createAnimation: spec required');
    }
    if (typeof spec.edgeId !== 'string' || !spec.edgeId.trim()) {
        throw new TypeError('createAnimation: edgeId required');
    }
    const style = isValidStyle(spec.style) ? spec.style : 'static';
    return Object.freeze({
        edgeId: spec.edgeId,
        style,
        speed: Number.isFinite(spec.speed) && spec.speed > 0 ? spec.speed : 1.0,
        amplitude: Number.isFinite(spec.amplitude) && spec.amplitude >= 0 ? spec.amplitude : 1.0,
        phase: Number.isFinite(spec.phase) ? spec.phase : 0,
        startedAt: Number.isFinite(spec.startedAt) ? spec.startedAt : 0,
        active: spec.active !== false,
    });
}

/**
 * Calcula valor da animação no tempo `now` (em [0,1] cíclico).
 */
export function computeOffset( anim: any, now: any) {
    if (!anim || !anim.active) return 0;
    if (!Number.isFinite(now)) return 0;
    const elapsed = (now - anim.startedAt) / 1000;
    const cycle = elapsed * anim.speed + anim.phase;
    switch (anim.style) {
        case 'flow':
            return ((cycle % 1) + 1) % 1; // 0..1 looping
        case 'pulse': {
            const t = ((cycle % 1) + 1) % 1;
            return Math.sin(t * Math.PI) * anim.amplitude; // 0→1→0
        }
        case 'dash': {
            const t = ((cycle % 1) + 1) % 1;
            return t < 0.5 ? 1 : 0; // square wave
        }
        case 'static':
        default:
            return 0;
    }
}

/**
 * Cria registry de animations (Map por edgeId).
 */
export function createRegistry() {
    return Object.freeze({ animations: Object.freeze({}) });
}

/**
 * Adiciona animation ao registry.
 */
export function addAnimation( registry: any, anim: any) {
    if (!registry || !anim || typeof anim.edgeId !== 'string') return registry;
    return Object.freeze({
        animations: Object.freeze({ ...registry.animations, [anim.edgeId]: anim }),
    });
}

/**
 * Remove animation por edgeId.
 */
export function removeAnimation( registry: any, edgeId: any) {
    if (!registry || typeof edgeId !== 'string') return registry;
    if (!(edgeId in registry.animations)) return registry;
    const next = { ...registry.animations };
    delete next[edgeId];
    return Object.freeze({ animations: Object.freeze(next) });
}

/**
 * Pause animation (active=false).
 */
export function pauseAnimation( registry: any, edgeId: any) {
    if (!registry || typeof edgeId !== 'string') return registry;
    const a = registry.animations[edgeId];
    if (!a || !a.active) return registry;
    return Object.freeze({
        animations: Object.freeze({
            ...registry.animations,
            [edgeId]: Object.freeze({ ...a, active: false }),
        }),
    });
}

/**
 * Resume animation (active=true).
 */
export function resumeAnimation( registry: any, edgeId: any) {
    if (!registry || typeof edgeId !== 'string') return registry;
    const a = registry.animations[edgeId];
    if (!a || a.active) return registry;
    return Object.freeze({
        animations: Object.freeze({
            ...registry.animations,
            [edgeId]: Object.freeze({ ...a, active: true }),
        }),
    });
}

/**
 * Tick: computa offsets de todas animations ativas.
 * @returns {Object} {[edgeId]: offset}
 */
export function tick( registry: any, now: any) {
    if (!registry) return Object.freeze({});
    
    const out: Record<string, number>= {};
    for (const [id, anim] of Object.entries(registry.animations)) {
        if (anim && (anim as any).active) out[id] = computeOffset(anim, now);
    }
    return Object.freeze(out);
}

/**
 * Sumariza registry.
 */
export function summarizeRegistry( registry: any) {
    const empty = { total: 0, active: 0, paused: 0, byStyle: {} };
    if (!registry) return empty;
    const list = Object.values(registry.animations);
    
    const byStyle: Record<string, number>= {};
    let active = 0;
    for (const a of list) {
        if (!a) continue;
        const aa = (a) as any;
        if (aa.active) active++;
        byStyle[aa.style] = (byStyle[aa.style] || 0) + 1;
    }
    return Object.freeze({
        total: list.length,
        active,
        paused: list.length - active,
        byStyle: Object.freeze(byStyle),
    });
}

/**
 * Module identity export.
 */
export const edgeAnimationStateMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.53',
    deliveredAt: '2026-05-02',
    exports: [
        'ANIMATION_STYLES',
        'ANIMATION_META',
        'isValidStyle',
        'createAnimation',
        'computeOffset',
        'createRegistry',
        'addAnimation',
        'removeAnimation',
        'pauseAnimation',
        'resumeAnimation',
        'tick',
        'summarizeRegistry',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
