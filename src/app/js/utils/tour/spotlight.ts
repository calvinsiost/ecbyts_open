// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   TOUR SPOTLIGHT — Coachmark overlay for onboarding tour
   Overlay de destaque (coachmark) para o tour de onboarding

   Usa box-shadow gigante para escurecer tudo exceto o elemento alvo.
   O spotlight se reposiciona com transicao suave entre steps.
   ================================================================ */

// ----------------------------------------------------------------
// CONFIG
// ----------------------------------------------------------------

const SPOTLIGHT_PADDING = 8; // px around target element
const REPOSITION_DEBOUNCE = 100; // ms

// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------

let spotlightEl: HTMLElement | null = null;

let backdropEl: HTMLElement | null = null;

let currentSelector: string | null = null;

let resizeTimer: ReturnType<typeof setTimeout> | null = null;

// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------

/**
 * Initialize spotlight elements.
 * Busca ou cria os divs de spotlight e backdrop no DOM.
 */
export function initSpotlight(): void {
    spotlightEl = document.getElementById('tour-spotlight');
    backdropEl = document.getElementById('tour-backdrop');

    // Idempotente: remove antes de adicionar para que o lazy re-init do engine
    // (RF-6 TRAINING-LEARNER-MIN-001) nunca acumule listeners duplicados.
    window.removeEventListener('resize', _onResize);
    window.addEventListener('resize', _onResize);
}

/**
 * Whether the spotlight/backdrop refs are initialized and attached to the DOM.
 * Usado pelo tour engine p/ detectar boot parcial (initTour nunca rodou) e
 * falhar com sinal claro em vez de no-op silencioso em showSpotlight.
 */
export function isSpotlightReady(): boolean {
    return !!(spotlightEl && backdropEl && document.body.contains(spotlightEl) && document.body.contains(backdropEl));
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Show spotlight over a target element.
 * @param {string} selector - CSS selector for the target element
 */
export function showSpotlight(selector: string): void {
    if (!spotlightEl || !backdropEl) return;

    currentSelector = selector;
    const el = document.querySelector(selector);

    if (!el) {
        hideSpotlight();
        return;
    }

    const rect = el.getBoundingClientRect();

    spotlightEl.style.top = `${rect.top - SPOTLIGHT_PADDING}px`;
    spotlightEl.style.left = `${rect.left - SPOTLIGHT_PADDING}px`;
    spotlightEl.style.width = `${rect.width + SPOTLIGHT_PADDING * 2}px`;
    spotlightEl.style.height = `${rect.height + SPOTLIGHT_PADDING * 2}px`;
    spotlightEl.style.display = 'block';

    backdropEl.style.display = 'block';
}

/**
 * Hide spotlight and backdrop.
 */
export function hideSpotlight(): void {
    currentSelector = null;

    if (spotlightEl) {
        spotlightEl.style.display = 'none';
    }
    if (backdropEl) {
        backdropEl.style.display = 'none';
    }
}

/**
 * Recalculate spotlight position for the current target.
 * Chamado no resize e quando paineis abrem/fecham.
 */
export function updateSpotlightPosition(): void {
    if (!currentSelector) return;
    showSpotlight(currentSelector);
}

/**
 * Cleanup - remove event listeners.
 */
export function destroySpotlight(): void {
    window.removeEventListener('resize', _onResize);
    hideSpotlight();
}

// ----------------------------------------------------------------
// INTERNAL
// ----------------------------------------------------------------

function _onResize(): void {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updateSpotlightPosition, REPOSITION_DEBOUNCE);
}