// @ts-check
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
/* ================================================================
   HUD CARDS MANAGER — State, filtering, persistence
   ================================================================

   Gerencia cards de elementos intangiveis/genericos no viewport 3D.
   Cards exibem resumo de cada elemento como HUD fixo no canto
   inferior esquerdo, com expansao/recolhimento individual.

   Padrao: manager (estado) + renderer (DOM) + handler (window.*)
   ================================================================ */
import { getAllElements } from '../../core/elements/manager.js';
import { safeSetItem } from '../storage/storageMonitor.js';
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const STORAGE_KEY = 'ecbyts-hud-cards';
const HUD_FAMILIES = new Set(['intangible', 'generic']);
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
/** @type {{ visible: boolean, expanded: Record<string, boolean> }} */
const state: any = {
    visible: false,
    expanded: {}, // { elementId: true }
};
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Initialize HUD cards from localStorage.
 * Restaura estado salvo do navegador.
 */
export function initHudCards() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY) || '';
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') {
                state.visible = parsed.visible !== false;
                state.expanded = parsed.expanded || {};
            }
        }
    }
    catch (e: any) {
        console.warn('[HUD Cards] Failed to restore state:', /** @type {any} */ (e)?.message);
    }
}
// ----------------------------------------------------------------
// PERSISTENCE
// ----------------------------------------------------------------
function persist() {
    try {
        safeSetItem(STORAGE_KEY, JSON.stringify(state));
    }
    catch (e: any) {
        console.debug('[hud/cardManager] persist:', /** @type {any} */ (e)?.message || e);
        // Ignore quota errors
    }
}
// ----------------------------------------------------------------
// GETTERS
// ----------------------------------------------------------------
/**
 * Get current HUD cards configuration.
 * @returns {{ visible: boolean, expanded: Object }}
 */
export function getHudCardsConfig() {
    return { ...state };
}
/**
 * Get intangible and generic elements from the model.
 * Filtra elementos das familias intangible/generic.
 * @returns {Object[]}
 */
export function getIntangibleGenericElements() {
    return getAllElements().filter((e: any) => HUD_FAMILIES.has(e.family));
}
/**
 * Check if a card is expanded.
 * @param {string} elementId
 * @returns {boolean}
 */
export function isCardExpanded(elementId: any) {
    return !!state.expanded[elementId];
}
// ----------------------------------------------------------------
// MUTATIONS
// ----------------------------------------------------------------
/**
 * Show or hide the entire HUD cards panel.
 * @param {boolean} visible
 */
export function setHudCardsVisible(visible: any) {
    state.visible = !!visible;
    persist();
}
/**
 * Toggle expand/collapse of a single card.
 * @param {string} elementId
 */
export function toggleCardExpanded(elementId: any) {
    state.expanded[elementId] = !state.expanded[elementId];
    persist();
}
/**
 * Expand all cards.
 */
export function expandAllCards() {
    getIntangibleGenericElements().forEach((e: any) => {
        state.expanded[e.id] = true;
    });
    persist();
}
/**
 * Collapse all cards.
 */
export function collapseAllCards() {
    state.expanded = {};
    persist();
}
// ----------------------------------------------------------------
// EXPORT/IMPORT (model persistence)
// ----------------------------------------------------------------
/**
 * Export HUD cards state for model save.
 * @returns {Object}
 */
export function exportHudCards() {
    return { ...state };
}
/**
 * Import HUD cards state from model load.
 * @param {Object} data
 */
export function importHudCards(data: any) {
    const d = (data) as any;
    if (d && typeof d === 'object') {
        state.visible = d.visible !== false;
        state.expanded = d.expanded || {};
        persist();
    }
}
