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
   HUD CARDS HANDLERS — Window.* functions for HTML onclick
   ================================================================

   Handlers para controles dos HUD cards no viewport 3D.
   Cada funcao e registrada em window.* via handlers/index.js.

   ================================================================ */
import { getHudCardsConfig, setHudCardsVisible, toggleCardExpanded, expandAllCards, collapseAllCards, } from '../hud/cardManager.js';
import { renderHudCards, setHudCardsPanelVisible } from '../hud/cardRenderer.js';
/**
 * @param {(() => void) | null} _fn
 */
export function setHudCardsUpdateAllUI(_fn: any) {
    // Compatibility hook: HUD cards trigger targeted card renders directly.
}
// ----------------------------------------------------------------
// HANDLERS
// ----------------------------------------------------------------
/**
 * Toggle HUD cards panel visibility.
 * Alterna visibilidade do painel inteiro.
 */
function handleToggleHudCards() {
    const config = getHudCardsConfig();
    const newVisible = !config.visible;
    setHudCardsVisible(newVisible);
    setHudCardsPanelVisible(newVisible);
    if (newVisible)
        renderHudCards();
    // Sync scene-hud button state
    const btn = document.getElementById('intangibles-toggle-btn');
    if (btn)
        btn.classList.toggle('active', newVisible);
}
/**
 * Toggle expand/collapse of a single card.
 * @param {string} elementId
 */
function handleToggleHudCard(elementId: any) {
    toggleCardExpanded(elementId);
    renderHudCards();
}
/**
 * Expand all HUD cards.
 */
function handleExpandAllHudCards() {
    expandAllCards();
    renderHudCards();
}
/**
 * Collapse all HUD cards.
 */
function handleCollapseAllHudCards() {
    collapseAllCards();
    renderHudCards();
}
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// STATUS BAR - Performance metrics zone toggle (UI-BOTTOM-001)
// ----------------------------------------------------------------
/**
 * Alterna a visibilidade da zona de telemetria/diagnóstico no statusbar.
 * Toggle the performance metrics zone in the status bar.
 * @returns {void}
 */
export function handleTogglePerformanceMetrics() {
    const zone = document.getElementById('status-perf-zone');
    if (!zone)
        return;
    const hidden = zone.style.display === 'none';
    zone.style.display = hidden ? 'flex' : 'none';
    zone.setAttribute('aria-hidden', hidden ? 'false' : 'true');
}
window.handleTogglePerformanceMetrics = handleTogglePerformanceMetrics;
// EXPORT
// ----------------------------------------------------------------
export const hudCardsHandlers = {
    handleToggleHudCards,
    handleToggleHudCard,
    handleExpandAllHudCards,
    handleCollapseAllHudCards,
    handleTogglePerformanceMetrics,
};
