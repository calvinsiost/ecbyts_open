// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Highlight Effects - Phase 1.12 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S12
 *
 * Phase 1.12 (2026-05-01) - pure-logic helpers para estado visual de
 * destaque (hover/select/focus/dim) sobre nós. Permite computação
 * determinística do estilo final aplicado sem tocar em DOM/Three.js.
 *
 * Estratégia:
 *   - States: idle / hover / select / focus / dim / pinned
 *   - Cada state tem deltas: opacity, glow, scale, strokeWidth, zOffset
 *   - Combinador: aplicar múltiplos states (select + focus)
 *   - Manager singleton: HighlightStateMap com diff API
 *   - Helpers: resolveStyle(state, baseStyle) → final
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

interface StyleShape {
    opacity: number;
    scale: number;
    glow: number;
    strokeWidth: number;
    zOffset: number;
}

interface HighlightStateMapDiff {
    added: string[];
    removed: string[];
    changed: string[];
}

interface HighlightStateMap {
    set(nodeId: any, state: any, on?: boolean): boolean;
    get(nodeId: any): string[];
    has(nodeId: any, state: any): boolean;
    clear(state?: any): void;
    getAll(): Readonly<Record<string, string[]>>;
    size(): number;
    diff(otherMap: any): HighlightStateMapDiff;
    snapshot(): string;
    restore(snapshotStr: any): boolean;
}

/** States canônicos. */
export const HIGHLIGHT_STATES = Object.freeze(['idle', 'hover', 'select', 'focus', 'dim', 'pinned']);

/** Deltas por state — frozen catalog. */
export const STATE_DELTAS = Object.freeze({
    idle: Object.freeze({
        opacity: 0,
        scale: 0,
        glow: 0,
        strokeWidth: 0,
        zOffset: 0,
    }),
    hover: Object.freeze({
        opacity: 0,
        scale: 0.1,
        glow: 0.5,
        strokeWidth: 1,
        zOffset: 1,
    }),
    select: Object.freeze({
        opacity: 0,
        scale: 0.15,
        glow: 0.8,
        strokeWidth: 2,
        zOffset: 2,
    }),
    focus: Object.freeze({
        opacity: 0,
        scale: 0.2,
        glow: 1.0,
        strokeWidth: 3,
        zOffset: 3,
    }),
    dim: Object.freeze({
        opacity: -0.6,
        scale: 0,
        glow: 0,
        strokeWidth: 0,
        zOffset: -1,
    }),
    pinned: Object.freeze({
        opacity: 0,
        scale: 0.05,
        glow: 0.3,
        strokeWidth: 1,
        zOffset: 0,
    }),
});

/** Identidade do módulo. */
export const HIGHLIGHT_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.12',
    deliveredAt: '2026-05-01',
    states: HIGHLIGHT_STATES,
});

/** Base style canônica (defaults antes de aplicar deltas). */
export const BASE_STYLE = Object.freeze({
    opacity: 1.0,
    scale: 1.0,
    glow: 0,
    strokeWidth: 0,
    zOffset: 0,
} as StyleShape);

/**
 * Verifica se state é canônico.
 *
 * @param state
 */
export function isValidState(state: string): boolean {
    return HIGHLIGHT_STATES.includes(state);
}

/**
 * Aplica delta de UM state sobre baseStyle.
 *
 * @param baseStyle
 * @param any>
 */
export function applyState(baseStyle: Record<string, any>, state: string): object {
    const base = baseStyle && typeof baseStyle === 'object' ? baseStyle : BASE_STYLE;
    if (!isValidState(state)) {
        return Object.freeze({ ...BASE_STYLE, ...base });
    }
    const delta = (STATE_DELTAS as Record<string, any>)[state];
    return Object.freeze({
        opacity: clamp01((Number.isFinite(base.opacity) ? base.opacity : 1) + delta.opacity),
        scale: Math.max(0, (Number.isFinite(base.scale) ? base.scale : 1) + delta.scale),
        glow: Math.max(0, (Number.isFinite(base.glow) ? base.glow : 0) + delta.glow),
        strokeWidth: Math.max(0, (Number.isFinite(base.strokeWidth) ? base.strokeWidth : 0) + delta.strokeWidth),
        zOffset: (Number.isFinite(base.zOffset) ? base.zOffset : 0) + delta.zOffset,
    });
}

/**
 * Aplica MÚLTIPLOS states (acúmulo). Order matters: states later override scale/glow if higher.
 *
 * @param baseStyle
 * @param states
 */
export function applyStates(baseStyle: object, states: Array<string>): object {
    if (!Array.isArray(states) || states.length === 0) {
        return Object.freeze({ ...BASE_STYLE, ...(baseStyle || {}) });
    }
    let current: StyleShape = {
        ...BASE_STYLE,
        ...(baseStyle || {}),
    };
    for (const s of states) {
        if (!isValidState(s)) continue;
        const delta = (STATE_DELTAS as Record<string, any>)[s];
        current = {
            opacity: clamp01(current.opacity + delta.opacity),
            scale: Math.max(0, current.scale + delta.scale),
            // glow + strokeWidth: usar o MAX dos deltas (não acumular)
            glow: Math.max(current.glow, BASE_STYLE.glow + delta.glow),
            strokeWidth: Math.max(current.strokeWidth, BASE_STYLE.strokeWidth + delta.strokeWidth),
            zOffset: current.zOffset + delta.zOffset,
        };
    }
    return Object.freeze(current);
}

function clamp01(v: any): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}

/**
 * HighlightStateMap - singleton-friendly state container.
 *
 * @param options
 * @param options.exclusiveSelect - apenas 1 nó selected
 */
export function createHighlightStateMap(
    options: { exclusiveSelect?: boolean } = {},
): Readonly<HighlightStateMap> {
    const exclusive = Boolean(options.exclusiveSelect);
    const map = new Map<string, Set<string>>(); // nodeId → Set<state>

    return Object.freeze({
        set(nodeId: any, state: any, on = true): boolean {
            if (typeof nodeId !== 'string' || !nodeId.trim()) return false;
            if (!isValidState(state)) return false;
            const set = map.get(nodeId) || new Set<string>();

            if (on) {
                if (exclusive && state === 'select') {
                    // Limpa select de outros nós
                    for (const [otherId, otherSet] of map.entries()) {
                        if (otherId !== nodeId) otherSet.delete('select');
                    }
                }
                set.add(state);
                map.set(nodeId, set);
            } else {
                set.delete(state);
                if (set.size === 0) map.delete(nodeId);
                else map.set(nodeId, set);
            }
            return true;
        },
        get(nodeId: any): string[] {
            const set = map.get(nodeId);
            return set ? [...set] : [];
        },
        has(nodeId: any, state: any): boolean {
            const set = map.get(nodeId);
            return set ? set.has(state) : false;
        },
        clear(state?: any): void {
            if (state === undefined) {
                map.clear();
                return;
            }
            if (!isValidState(state)) return;
            for (const [nodeId, set] of map.entries()) {
                set.delete(state);
                if (set.size === 0) map.delete(nodeId);
            }
        },
        getAll(): Readonly<Record<string, string[]>> {
            const out: Record<string, string[]> = {};
            for (const [nodeId, set] of map.entries()) {
                out[nodeId] = [...set];
            }
            return Object.freeze(out);
        },
        size(): number {
            return map.size;
        },
        diff(otherMap: any): HighlightStateMapDiff {
            const added: string[] = [];
            const removed: string[] = [];
            const changed: string[] = [];
            const otherSnapshot =
                otherMap && typeof otherMap.getAll === 'function' ? otherMap.getAll() : otherMap || {};
            const selfSnapshot = this.getAll();

            // added (em self, não em other)
            for (const id of Object.keys(selfSnapshot)) {
                if (!(id in otherSnapshot)) added.push(id);
                else {
                    const a = new Set((selfSnapshot as Record<string, any>)[id]);
                    const b = new Set((otherSnapshot as Record<string, any>)[id]);
                    const sameSize = a.size === b.size;
                    const sameAll = sameSize && [...a].every((s) => b.has(s));
                    if (!sameAll) changed.push(id);
                }
            }
            // removed (em other, não em self)
            for (const id of Object.keys(otherSnapshot)) {
                if (!(id in selfSnapshot)) removed.push(id);
            }
            return { added, removed, changed };
        },
        snapshot(): string {
            return JSON.stringify(this.getAll());
        },
        restore(snapshotStr: any): boolean {
            try {
                const data = JSON.parse(snapshotStr);
                map.clear();
                for (const [nodeId, states] of Object.entries(data || {})) {
                    if (Array.isArray(states)) {
                        const set = new Set<string>(states.filter(isValidState));
                        if (set.size > 0) map.set(nodeId, set);
                    }
                }
                return true;
            } catch (e: any) {
                console.debug('[highlightEffects:restore]', e?.message || e);
                return false;
            }
        },
    });
}

/**
 * Module identity export.
 */
export const highlightEffectsMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.12',
    deliveredAt: '2026-05-01',
    states: HIGHLIGHT_STATES,
    exports: [
        'HIGHLIGHT_STATES',
        'STATE_DELTAS',
        'BASE_STYLE',
        'HIGHLIGHT_META',
        'isValidState',
        'applyState',
        'applyStates',
        'createHighlightStateMap',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
