// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost

/**
 * communityLayers.js - Community Data Enrichment 3D Layer Registry (SPEC 9.68)
 *
 * Lógica pura: registro em memória de camadas 3D de contribuições da
 * comunidade e estado on/off por camada. Não importa THREE nem toca a cena.
 * O caller (handler/main.js) lê este estado e faz scene.add/remove.
 *
 * Pure-logic registry of community 3D layers and their active state.
 * Engine-agnostic: never imports THREE; returns state, caller wires scene.
 *
 * @module communityLayers
 * @license AGPL-3.0-only
 */

/**
 * @typedef {object} CommunityLayer
 * @property {string} id - Identificador único da camada
 * @property {string} [label] - Rótulo de exibição
 * @property {boolean} active - Estado de visibilidade atual
 * @property {object} [meta] - Metadados livres (contagem, fonte, etc.)
 */

/** @type {Map<string, CommunityLayer>} */
const _layers = new Map();

/**
 * Registra (ou substitui) uma camada da comunidade no registro.
 * Registers or replaces a community layer. Idempotent on the same id —
 * re-registering keeps the existing `active` state unless explicitly set.
 *
 * @param {{ id: string, label?: string, active?: boolean, meta?: object }} layer
 * @returns {Readonly<CommunityLayer>} A camada registrada (congelada)
 * @throws {TypeError} Se `id` não for string não-vazia
 */
export function registerCommunityLayer(layer: any) {
    if (!layer || typeof layer !== 'object' || typeof layer.id !== 'string' || layer.id.length === 0) {
        throw new TypeError('registerCommunityLayer: layer.id must be a non-empty string');
    }
    const existing = _layers.get(layer.id);
    const active = typeof layer.active === 'boolean' ? layer.active : existing ? existing.active : false;
    /** @type {CommunityLayer} */
    const next = {
        id: layer.id,
        label: layer.label ?? existing?.label ?? layer.id,
        active,
        meta: layer.meta ?? existing?.meta ?? {},
    };
    _layers.set(layer.id, next);
    return Object.freeze({ ...next });
}

/**
 * Alterna (ou define) a visibilidade de uma camada registrada.
 * Toggles or sets a registered layer's visibility. When `active` is omitted,
 * flips the current value. Returns null if the layer is not registered.
 *
 * @param {string} layerId - ID da camada
 * @param {boolean} [active] - Estado explícito; se omitido, inverte o atual
 * @returns {Readonly<CommunityLayer>|null}
 */
export function toggleCommunityLayer(layerId: any, active: any) {
    const layer = _layers.get(layerId);
    if (!layer) return null;
    layer.active = typeof active === 'boolean' ? active : !layer.active;
    _layers.set(layerId, layer);
    return Object.freeze({ ...layer });
}

/**
 * Retorna todas as camadas atualmente ativas.
 * Returns all currently active community layers (frozen copies).
 *
 * @returns {ReadonlyArray<Readonly<CommunityLayer>>}
 */
export function getActiveCommunityLayers() {
    const result = [];
    for (const layer of _layers.values()) {
        if (layer.active) result.push(Object.freeze({ ...layer }));
    }
    return Object.freeze(result);
}

/**
 * Retorna o registro completo de camadas (ativas e inativas).
 * Returns the full layer registry as frozen copies.
 *
 * @returns {ReadonlyArray<Readonly<CommunityLayer>>}
 */
export function getAllCommunityLayers() {
    return Object.freeze([..._layers.values()].map((l) => Object.freeze({ ...l })));
}

/**
 * Limpa o registro. Usado por testes e ao trocar de modelo.
 * Clears the registry. Used by tests and on model switch.
 *
 * @returns {void}
 */
export function clearCommunityLayers() {
    _layers.clear();
}
