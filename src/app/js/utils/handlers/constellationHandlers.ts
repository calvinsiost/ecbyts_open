// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Constellation HUD window.* handler registrations (caller integration slice).
// Hand-authored R1-safe — conecta pure-logic Wave E1/L1/M1 + UI Wave N1/P1.
// SPEC_CONSTELLATION_HUD_9_75 §missing "caller integration".
//
// Spec NOT respeitados:
// - NÃO ler/escrever localStorage diretamente (delega adapter readPersisted*)
// - NÃO reimplementar logic (delega 100% aos modules específicos)
// - NÃO criar novo registry de handlers (apenas window.* registration)

import { openConstellationOnboardingPanel } from '../ui/constellationOnboardingPanel.js';
import {
    mountLayerToggleBar,
    readPersistedLayerState,
    writePersistedLayerState,
} from '../ui/constellationLayerToggleBar.js';
import { openConstellationSuggestionsPanel } from '../ui/constellationSuggestionsPanel.js';
import { evaluateNodeRendering, applyTieringToNodes } from '../../core/constellation/tieringPolicy.js';
import {
    createOnboardingState,
    serializeOnboarding,
    shouldAutoTriggerOnboarding,
} from '../../core/constellation/onboardingState.js';
import { safeSetItem } from '../storage/storageMonitor.js';

const ONBOARDING_PREFS_KEY = 'ecbyts-customize';
const ONBOARDING_FIELD = 'constellationOnboarding';
// COMMERCIAL-READINESS-DOD#T7.2: seen-key first-visit (padrão welcomeScreen).
// Marcado no PRIMEIRO auto-disparo → tutorial não reaparece se o usuário fechar
// o HUD sem avançar (step ainda not_started). Terminal (completed/skipped) já é
// coberto pelo próprio state persisted; esta key cobre o "abriu e ignorou".
const ONBOARDING_SEEN_KEY = 'ecbyts-constellation-onboarding-seen';

/**
 * Lê onboarding state persisted.
 * @returns {object}
 */
function _readOnboardingPrefs() {
    try {
        const raw = localStorage.getItem(ONBOARDING_PREFS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && parsed[ONBOARDING_FIELD]) || {};
    } catch (e: any) {
        console.debug('[constellationHandlers:read]', e?.message || e);
        return {};
    }
}

/**
 * Escreve onboarding state em prefs.
 * @param {object} state
 */
function _writeOnboardingPrefs(state: any) {
    try {
        const raw = localStorage.getItem(ONBOARDING_PREFS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed[ONBOARDING_FIELD] = state;
        localStorage.setItem(ONBOARDING_PREFS_KEY, JSON.stringify(parsed));
    } catch (e: any) {
        console.debug('[constellationHandlers:write]', e?.message || e);
    }
}

/**
 * Abre painel onboarding com state persisted.
 * Registrável como window.handleOpenConstellationOnboarding.
 * @returns {{close:Function}|null}
 */
export function handleOpenConstellationOnboarding() {
    try {
        const persisted = _readOnboardingPrefs();
        return openConstellationOnboardingPanel({
            persistedState: persisted,
            onChange: (state: any) => _writeOnboardingPrefs(state),
            onComplete: () => {
                console.debug('[constellation:onboarding] completed');
            },
        });
    } catch (e: any) {
        console.debug('[constellationHandlers:openOnboarding]', e?.message || e);
        return null;
    }
}

/**
 * Auto-dispara o painel de onboarding na PRIMEIRA visita ao Constellation.
 * Idempotente: só abre uma vez (seen-key via safeSetItem) e só quando o
 * onboarding nunca foi iniciado (shouldAutoTriggerOnboarding). Chamável pelo
 * caller ao EXPANDIR o HUD (toggleConstellationCollapse → branch expand).
 * Registrável como window.maybeAutoOpenConstellationOnboarding.
 * @returns {{close:Function}|null} handle se abriu, null se pulou
 */
export function maybeAutoOpenConstellationOnboarding() {
    try {
        if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
        // Já visto nesta origem → nunca reabrir automaticamente.
        if (localStorage.getItem(ONBOARDING_SEEN_KEY)) return null;
        const persisted = _readOnboardingPrefs();
        if (!shouldAutoTriggerOnboarding(persisted)) {
            // Onboarding já iniciado/terminal por outra via → marcar visto e sair.
            safeSetItem(ONBOARDING_SEEN_KEY, new Date().toISOString());
            return null;
        }
        // Marca ANTES de abrir → fechar sem avançar não re-dispara no próximo expand.
        safeSetItem(ONBOARDING_SEEN_KEY, new Date().toISOString());
        return handleOpenConstellationOnboarding();
    } catch (e: any) {
        console.debug('[constellationHandlers:maybeAutoOpen]', e?.message || e);
        return null;
    }
}

/**
 * Monta toggle bar dentro de container existente (caller passa elemento).
 * Registrável como window.handleMountConstellationLayerBar.
 * @param {string|HTMLElement} containerOrId
 * @returns {{getState:Function, refresh:Function, destroy:Function}|null}
 */
export function handleMountConstellationLayerBar(containerOrId: any) {
    try {
        const container = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
        if (!container) {
            console.debug('[constellationHandlers:mountLayerBar] container not found');
            return null;
        }
        return mountLayerToggleBar(container, {
            persistedState: readPersistedLayerState(),
            onChange: (state: any) => writePersistedLayerState(state),
        });
    } catch (e: any) {
        console.debug('[constellationHandlers:mountLayerBar]', e?.message || e);
        return null;
    }
}

/**
 * Reset onboarding (Calvin "reset tutorial" feature).
 * Registrável como window.handleResetConstellationOnboarding.
 */
export function handleResetConstellationOnboarding() {
    const state = createOnboardingState(undefined);
    _writeOnboardingPrefs(serializeOnboarding(state));
    // Reabilita o auto-disparo na próxima visita ao Constellation.
    try {
        localStorage.removeItem(ONBOARDING_SEEN_KEY);
    } catch (e: any) {
        console.debug('[constellationHandlers:reset:seenKey]', e?.message || e);
    }
}

/**
 * Get tiering decision para uso pelo renderer (caller passa tier + count).
 * Registrável como window.handleEvaluateConstellationTiering.
 * @param {string} tier
 * @param {number} nodeCount
 * @returns {object}
 */
export function handleEvaluateConstellationTiering(tier: any, nodeCount: any) {
    return evaluateNodeRendering(tier, nodeCount);
}

/**
 * Apply tiering to nodes array (caller passa nodes + tier).
 * Registrável como window.handleApplyConstellationTiering.
 * @param {Array} nodes
 * @param {string} tier
 * @returns {object}
 */
export function handleApplyConstellationTiering(nodes: any, tier: any) {
    return applyTieringToNodes(nodes, tier);
}

/**
 * Abre painel IA Suggestions (cluster detection) — caller passa nodes+edges.
 * Registrável como window.handleOpenConstellationSuggestions.
 * @param {Array<*>} nodes
 * @param {Array<*>} edges
 * @returns {{close:Function}|null}
 */
export function handleOpenConstellationSuggestions(nodes: any, edges: any) {
    try {
        return openConstellationSuggestionsPanel({
            nodes: Array.isArray(nodes) ? nodes : [],
            edges: Array.isArray(edges) ? edges : [],
            onClose: () => {
                console.debug('[constellation:suggestions] closed');
            },
        });
    } catch (e: any) {
        console.debug('[constellationHandlers:openSuggestions]', e?.message || e);
        return null;
    }
}

/**
 * Registration helper — caller chama uma vez em main.js boot.
 * Idempotente: re-chamar não duplica.
 */
export function registerConstellationHandlers() {
    if (typeof window === 'undefined') return;
    const w = (window) as any;
    if (w.__ecbtConstellationHandlersRegistered) return;
    w.handleOpenConstellationOnboarding = handleOpenConstellationOnboarding;
    w.maybeAutoOpenConstellationOnboarding = maybeAutoOpenConstellationOnboarding;
    w.handleMountConstellationLayerBar = handleMountConstellationLayerBar;
    w.handleResetConstellationOnboarding = handleResetConstellationOnboarding;
    w.handleEvaluateConstellationTiering = handleEvaluateConstellationTiering;
    w.handleApplyConstellationTiering = handleApplyConstellationTiering;
    w.handleOpenConstellationSuggestions = handleOpenConstellationSuggestions;
    w.__ecbtConstellationHandlersRegistered = true;
}
