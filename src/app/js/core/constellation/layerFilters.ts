// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic Z3 layer filters for SPEC_CONSTELLATION_HUD_9_75.
// 4 layers: spatial, hierarchical, temporal, semantic.
// Hand-authored R1-safe (claude-otimizacao Wave M1). Sem DOM, sem rede.
//
// Spec NOT (anti-requisitos):
// - NÃO ler DOM (pure-logic)
// - NÃO emoji em strings (R1-violation)
// - NÃO depende Three.js/canvas

/**
 * @typedef {'spatial'|'hierarchical'|'temporal'|'semantic'} LayerId
 */

/**
 * @typedef {Object} LayerFilterState
 * @property {boolean} spatial         True = spatial layer ATIVO (default on)
 * @property {boolean} hierarchical    True = hierarchy edges ATIVO
 * @property {boolean} temporal        True = temporal trail ATIVO
 * @property {boolean} semantic        True = semantic clusters ATIVO
 */

export const LAYER_IDS = Object.freeze(['spatial', 'hierarchical', 'temporal', 'semantic']);

const DEFAULT_STATE = Object.freeze({
    spatial: true,
    hierarchical: true,
    temporal: false,
    semantic: false,
});

const LAYER_META = Object.freeze({
    spatial: { labelKey: 'constellation.layer.spatial', iconKey: 'globe' },
    hierarchical: { labelKey: 'constellation.layer.hierarchical', iconKey: 'sitemap' },
    temporal: { labelKey: 'constellation.layer.temporal', iconKey: 'clock' },
    semantic: { labelKey: 'constellation.layer.semantic', iconKey: 'tag' },
});

/**
 * Cria state default ou normaliza persisted.
 * @param {Partial<LayerFilterState>} [persisted]
 * @returns {LayerFilterState}
 */
export function createLayerFilterState(persisted: any) {
    const safe = persisted && typeof persisted === 'object' ? persisted : {};
    return Object.freeze({
        spatial: typeof safe.spatial === 'boolean' ? safe.spatial : DEFAULT_STATE.spatial,
        hierarchical: typeof safe.hierarchical === 'boolean' ? safe.hierarchical : DEFAULT_STATE.hierarchical,
        temporal: typeof safe.temporal === 'boolean' ? safe.temporal : DEFAULT_STATE.temporal,
        semantic: typeof safe.semantic === 'boolean' ? safe.semantic : DEFAULT_STATE.semantic,
    });
}

/**
 * Toggle layer ATIVO/INATIVO. Retorna novo state frozen.
 * Layer desconhecida retorna state inalterado.
 * @param {LayerFilterState} state
 * @param {LayerId} layerId
 * @returns {LayerFilterState}
 */
export function toggleLayer(state: any, layerId: any) {
    if (!LAYER_IDS.includes(layerId)) return state;
    return Object.freeze({ ...state, [layerId]: !state[layerId] });
}

/**
 * Set layer state explicitamente (true/false).
 * @param {LayerFilterState} state
 * @param {LayerId} layerId
 * @param {boolean} value
 * @returns {LayerFilterState}
 */
export function setLayer(state: any, layerId: any, value: any) {
    if (!LAYER_IDS.includes(layerId)) return state;
    return Object.freeze({ ...state, [layerId]: !!value });
}

/**
 * Filtra edges por layers ativas. Cada edge deve ter campo `layer` ∈ LAYER_IDS.
 * Edges sem `layer` recebem default 'spatial'.
 * @param {Array<*>} edges
 * @param {LayerFilterState} state
 * @returns {Array<*>}
 */
export function filterEdgesByLayers(edges: any, state: any) {
    if (!Array.isArray(edges)) return [];
    if (!state) return edges.slice();
    return edges.filter((e: any) => {
        const layer = (e && e.layer) || 'spatial';
        return state[layer] !== false;
    });
}

/**
 * Lista layers ativas (ordenadas conforme LAYER_IDS).
 * @param {LayerFilterState} state
 * @returns {Array<LayerId>}
 */
export function listActiveLayers(state: any) {
    if (!state) return [];
    return LAYER_IDS.filter((id: any) => state[id] === true);
}

/**
 * Conta layers ativas. Útil para badge "N layers".
 * @param {LayerFilterState} state
 * @returns {number}
 */
export function countActiveLayers(state: any) {
    return listActiveLayers(state).length;
}

/**
 * Builds view-model para UI toggle group.
 * @param {LayerFilterState} state
 * @returns {Array<{id:LayerId, active:boolean, labelKey:string, iconKey:string}>}
 */
export function buildLayerToggleVM(state: any) {
    return LAYER_IDS.map((id: any) => ({
        id,
        active: state ? !!state[id] : false,
        labelKey: (LAYER_META as Record<string, any>)[id].labelKey,
        iconKey: (LAYER_META as Record<string, any>)[id].iconKey,
    }));
}

/**
 * Reset para defaults (spatial+hierarchical on, temporal+semantic off).
 * @returns {LayerFilterState}
 */
export function resetLayerFilters() {
    return DEFAULT_STATE;
}

/**
 * Serializa state para localStorage.
 * @param {LayerFilterState} state
 * @returns {Partial<LayerFilterState>}
 */
export function serializeLayerFilters(state: any) {
    if (!state) return {};
    return {
        spatial: state.spatial,
        hierarchical: state.hierarchical,
        temporal: state.temporal,
        semantic: state.semantic,
    };
}
