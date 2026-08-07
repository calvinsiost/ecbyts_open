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

/**
 * Constellation Z3 Layer Filter - SPEC_CONSTELLATION_HUD_9_75 Phase 2
 * (closes "Z3 layer toggles" gap from §11 DoD).
 *
 * Pure-logic state machine for the 4 Z3 relation layers:
 *   - z3a SPATIAL      (proximity / containment)
 *   - z3b HIERARCHICAL (campaign -> family -> element)
 *   - z3c TEMPORAL     (before / depends on)
 *   - z3d SEMANTIC     (monitora / alimenta / drena)
 *
 * Provides immutable toggle state, preset application, edge filtering by
 * active layer set, and coverage summary. No browser, DOM, Three.js or
 * Supabase dependencies. Consumed by utils/ui/constellationControls.js
 * which owns the impure DOM/event wiring.
 *
 * Reuse note: The constant `Z3_LAYER_IDS` mirrors `RELATION_LAYERS` from
 * `core/constellation/graph.js` to avoid a cyclic import. Keep in sync.
 */

export type Z3LayerId = 'z3a' | 'z3b' | 'z3c' | 'z3d';

export type Z3Preset = 'all' | 'none' | 'structural' | 'temporal-semantic' | 'spatial-only';

export interface Z3LayerState {
    readonly z3a: boolean;
    readonly z3b: boolean;
    readonly z3c: boolean;
    readonly z3d: boolean;
}

export interface Z3CoverageSummary {
    readonly total: number;
    readonly visible: number;
    readonly hidden: number;
    readonly perLayer: Readonly<Record<Z3LayerId, number>>;
    readonly activeLayerIds: readonly Z3LayerId[];
}

interface EdgeLike {
    readonly layer?: unknown;
    readonly [k: string]: unknown;
}

export const Z3_LAYER_IDS: readonly Z3LayerId[] = Object.freeze(['z3a', 'z3b', 'z3c', 'z3d'] as const);

export const Z3_LAYER_FILTER_META = Object.freeze({
    spec: 'CONSTELLATION_HUD_9_75',
    phase: '2.0',
    deliveredAt: '2026-05-14',
} as const);

const PRESETS: Readonly<Record<Z3Preset, Z3LayerState>> = Object.freeze({
    all: Object.freeze({ z3a: true, z3b: true, z3c: true, z3d: true }),
    none: Object.freeze({ z3a: false, z3b: false, z3c: false, z3d: false }),
    structural: Object.freeze({ z3a: false, z3b: true, z3c: false, z3d: true }),
    'temporal-semantic': Object.freeze({ z3a: false, z3b: false, z3c: true, z3d: true }),
    'spatial-only': Object.freeze({ z3a: true, z3b: false, z3c: false, z3d: false }),
});

/** Type guard for Z3 layer id. */
export function isZ3LayerId(value: unknown): value is Z3LayerId {
    return typeof value === 'string' && (Z3_LAYER_IDS as readonly string[]).includes(value);
}

/** Creates default state (all layers on). */
export function createLayerState(initial?: Partial<Z3LayerState> | null): Z3LayerState {
    const src = initial && typeof initial === 'object' ? initial : {};
    return Object.freeze({
        z3a: src.z3a !== false,
        z3b: src.z3b !== false,
        z3c: src.z3c !== false,
        z3d: src.z3d !== false,
    });
}

/** Returns a new state with one layer flipped. Invalid id returns input unchanged. */
export function toggleLayer(state: Z3LayerState, id: unknown): Z3LayerState {
    if (!isZ3LayerId(id)) return state;
    return Object.freeze({ ...state, [id]: !state[id] });
}

/** Returns a new state with one layer set explicitly. Invalid id returns input unchanged. */
export function setLayerActive(state: Z3LayerState, id: unknown, active: unknown): Z3LayerState {
    if (!isZ3LayerId(id)) return state;
    const next = active === true;
    if (state[id] === next) return state;
    return Object.freeze({ ...state, [id]: next });
}

/** Enables every layer. */
export function enableAll(): Z3LayerState {
    return PRESETS.all;
}

/** Disables every layer. */
export function disableAll(): Z3LayerState {
    return PRESETS.none;
}

/** Applies a named preset. Unknown preset returns input unchanged. */
export function applyPreset(state: Z3LayerState, preset: unknown): Z3LayerState {
    if (typeof preset !== 'string') return state;
    const entry = (PRESETS as Record<string, Z3LayerState | undefined>)[preset];
    return entry ? entry : state;
}

/** Returns the ordered list of currently active layer ids. */
export function getActiveLayerIds(state: Z3LayerState): readonly Z3LayerId[] {
    const out: Z3LayerId[] = [];
    for (const id of Z3_LAYER_IDS) {
        if (state[id]) out.push(id);
    }
    return Object.freeze(out);
}

/** True when no layer is active (graph is effectively hidden). */
export function isEmpty(state: Z3LayerState): boolean {
    return !state.z3a && !state.z3b && !state.z3c && !state.z3d;
}

/** True when every layer is active. */
export function isFull(state: Z3LayerState): boolean {
    return state.z3a && state.z3b && state.z3c && state.z3d;
}

/** Filters edges keeping only those whose `layer` field is active. */
export function applyLayerFilter<E extends EdgeLike>(
    edges: readonly E[] | null | undefined,
    state: Z3LayerState,
): readonly E[] {
    if (!Array.isArray(edges)) return Object.freeze([]) as readonly E[];
    if (isEmpty(state)) return Object.freeze([]) as readonly E[];
    const filtered = edges.filter((e) => {
        if (!e || typeof e !== 'object') return false;
        const layer = (e as EdgeLike).layer;
        return isZ3LayerId(layer) && state[layer];
    });
    return Object.freeze(filtered) as readonly E[];
}

/** Counts edges by layer + active visibility. */
export function summarizeLayerCoverage<E extends EdgeLike>(
    edges: readonly E[] | null | undefined,
    state: Z3LayerState,
): Z3CoverageSummary {
    const perLayer: Record<Z3LayerId, number> = { z3a: 0, z3b: 0, z3c: 0, z3d: 0 };
    let total = 0;
    let visible = 0;
    if (Array.isArray(edges)) {
        for (const e of edges) {
            if (!e || typeof e !== 'object') continue;
            total++;
            const layer = (e as EdgeLike).layer;
            if (isZ3LayerId(layer)) {
                perLayer[layer]++;
                if (state[layer]) visible++;
            }
        }
    }
    return Object.freeze({
        total,
        visible,
        hidden: total - visible,
        perLayer: Object.freeze(perLayer),
        activeLayerIds: getActiveLayerIds(state),
    });
}

/** Serializes state to a plain JSON-friendly object for persistence. */
export function serializeState(state: Z3LayerState): Z3LayerState {
    return Object.freeze({ ...state });
}

/** Deserializes a possibly-malformed value into a valid state (defensive). */
export function deserializeState(raw: unknown): Z3LayerState {
    if (!raw || typeof raw !== 'object') return createLayerState();
    const r = raw as Record<string, unknown>;
    return Object.freeze({
        z3a: r.z3a !== false,
        z3b: r.z3b !== false,
        z3c: r.z3c !== false,
        z3d: r.z3d !== false,
    });
}

export const z3LayerFilterMeta = Object.freeze({
    spec: 'CONSTELLATION_HUD_9_75',
    phase: '2.0',
    deliveredAt: '2026-05-14',
    exports: [
        'Z3_LAYER_IDS',
        'Z3_LAYER_FILTER_META',
        'isZ3LayerId',
        'createLayerState',
        'toggleLayer',
        'setLayerActive',
        'enableAll',
        'disableAll',
        'applyPreset',
        'getActiveLayerIds',
        'isEmpty',
        'isFull',
        'applyLayerFilter',
        'summarizeLayerCoverage',
        'serializeState',
        'deserializeState',
    ],
    provenance: Object.freeze({ generatedBy: 'AI', disclaimerAcknowledged: true }),
} as const);
