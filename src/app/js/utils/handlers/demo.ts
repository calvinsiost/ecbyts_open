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
   DEMO HANDLERS — Window functions for demo mode UI
   Funcoes globais para o modo de demonstracao interativa

   Expoe funcoes no window.* para onclick do HTML.
   Conecta a UI com o demo engine.
   ================================================================ */
import { initDemo, startDemo, nextStep, prevStep, exitDemo, getDemoState, getAllCases, getRandomCase, isActive, setDemoUpdateAllUI, } from '../demo/engine.js';
import { renderDemoController, showDemoPanel, hideDemoPanel, showNavigationOverlay, hideNavigationOverlay, } from '../ui/demoController.js';
import { showToast } from '../ui/toast.js';
import { requireAuth } from '../auth/inviteGate.js';
// ----------------------------------------------------------------
// UPDATE INJECTION
// ----------------------------------------------------------------
// eslint-disable-next-line
let requestUIRefresh = null;
/**
 * Inject UI refresh callback.
 * @param {Function} fn
 */
export function setDemoHandlerUpdateAllUI(fn: any) {
    requestUIRefresh = fn;
    setDemoUpdateAllUI(fn);
}
// ----------------------------------------------------------------
// SELECTED STATE
// ----------------------------------------------------------------
/** @type {string | null} */
let selectedVertical: any = null;
/** @type {string | null} */
let selectedModule: any = null;
/** @type {string | null} */
let selectedCaseId: any = null;
let demoInitialized = false;
// ----------------------------------------------------------------
// HANDLERS
// ----------------------------------------------------------------
/**
 * Open demo panel (FAB click).
 * Abre o painel de selecao de vertical/modulo.
 *
 * Estratégia (BUG 2026-05-14 "UI demo está lento para carregar"):
 * 1. Mostra o painel IMEDIATAMENTE com o skeleton renderizado a partir
 *    do estado atual (verticals/modules são estáticos, não dependem do
 *    fetch de Supabase).
 * 2. Dispara initDemo() em background — quando a query Supabase retorna,
 *    re-renderiza o painel com os 50 cases completos.
 *
 * Antes da fix: await initDemo() bloqueava a UI por até 3s (Promise.race
 * timeout) antes do painel aparecer. Agora aparece <50ms (skeleton local).
 */
async function handleOpenDemo() {
    if (isActive()) {
        // Se demo ja esta ativa, mostra overlay
        const state = getDemoState();
        if (state.currentCase) {
            showNavigationOverlay(state);
        }
        return;
    }
    selectedVertical = null;
    selectedModule = null;
    // 1. Render imediato — skeleton (verticals + modules estáticos)
    showDemoPanel();
    renderDemoController(getDemoState(), selectedVertical, selectedModule, selectedCaseId);
    // 2. Background fetch (apenas na primeira abertura). Se demorar, o
    // usuário já vê o painel e pode escolher vertical; quando a fetch
    // resolve, re-renderiza com a lista completa de cases.
    if (!demoInitialized) {
        demoInitialized = true;
        const timeout = new Promise((resolve: any) => setTimeout(resolve, 3000));
        // Fire-and-forget — não bloqueia handleOpenDemo
        Promise.race([initDemo(), timeout])
            .then(() => {
            // Re-render apenas se o painel ainda estiver aberto
            const panel = document.getElementById('demo-panel');
            if (panel && panel.classList.contains('active')) {
                const cases = getFilteredCases();
                renderDemoController(getDemoState(), selectedVertical, selectedModule, selectedCaseId, cases);
            }
        })
            .catch((/** @type {any} */ e) => {
            console.warn('[Demo] initDemo background fetch falhou — fallback:', e?.message || e);
        });
    }
}
/**
 * Close demo panel.
 * Fecha o painel sem iniciar demo.
 */
function handleCloseDemo() {
    hideDemoPanel();
}
/**
 * Select a vertical.
 * @param {string} vertical - 'mining'|'forestry'|'contamination'|'occupational_health'
 */
function handleSelectVertical(vertical: any) {
    selectedVertical = vertical;
    selectedModule = null;
    selectedCaseId = null;
    const cases = getFilteredCases();
    renderDemoController(getDemoState(), selectedVertical, selectedModule, selectedCaseId, cases);
}
/**
 * Select a module.
 * @param {string} module - 'neural_net'|'ai_bot'|'satellite'
 */
function handleSelectModule(module: any) {
    selectedModule = module;
    selectedCaseId = null;
    const cases = getFilteredCases();
    renderDemoController(getDemoState(), selectedVertical, selectedModule, selectedCaseId, cases);
}
/**
 * Select a specific case.
 * @param {string} caseId
 */
function handleSelectCase(caseId: any) {
    selectedCaseId = caseId;
    const cases = getFilteredCases();
    renderDemoController(getDemoState(), selectedVertical, selectedModule, selectedCaseId, cases);
}
/**
 * Start demo with selected case or random if none selected.
 */
async function handleStartDemo() {
    if (requireAuth())
        return;
    if (!selectedVertical) {
        showToast('Select a vertical first', 'warning');
        return;
    }
    let caseToStart = null;
    // If a case is selected, use it
    if (selectedCaseId) {
        const allCases = (getAllCases()) as Array<any>;
        caseToStart = allCases.find((c: any) => c.id === selectedCaseId);
    }
    // Otherwise, get a random case
    if (!caseToStart) {
        caseToStart = getRandomCase(
        /** @type {any} */ (selectedVertical), 
        /** @type {any} */ (selectedModule || undefined));
    }
    if (!caseToStart) {
        showToast('No cases available for this combination', 'error');
        return;
    }
    hideDemoPanel();
    const started = await startDemo(/** @type {any} */ (caseToStart).id);
    if (started) {
        const state = getDemoState();
        showNavigationOverlay(state);
    }
}
/**
 * Start demo with a specific case ID.
 * @param {string} caseId
 */
async function handleStartDemoCase(caseId: any) {
    hideDemoPanel();
    const started = await startDemo(caseId);
    if (started) {
        const state = getDemoState();
        showNavigationOverlay(state);
    }
}
/**
 * One-click start: combines select + start for single-case verticals.
 * Triggered when the user clicks a demo-case-card in a vertical that has
 * exactly 1 available case. Avoids the legacy two-click pattern
 * (click card → click Start button).
 *
 * FEAT-DEMO-ONE-CLICK-001 (UX_GIS_AUDIT_2026_05_14, Achado HIGH #5).
 *
 * @param {string} caseId
 */
async function handleStartCaseDirect(caseId: any) {
    if (!caseId) {
        showToast('No case id provided', 'warning');
        return;
    }
    selectedCaseId = caseId;
    await handleStartDemo();
}
/**
 * Navigate to next step.
 */
async function handleDemoNext() {
    const advanced = await nextStep();
    if (advanced) {
        const state = getDemoState();
        showNavigationOverlay(state);
    }
}
/**
 * Navigate to previous step.
 */
async function handleDemoPrev() {
    const went = await prevStep();
    if (went) {
        const state = getDemoState();
        showNavigationOverlay(state);
    }
}
/**
 * Exit demo mode - cleanup and restore.
 */
async function handleExitDemo() {
    await exitDemo();
    hideNavigationOverlay();
    hideDemoPanel();
}
/**
 * Get a random case for the selected vertical.
 */
function handleDemoRandomCase() {
    if (!selectedVertical)
        return;
    const demoCase = (getRandomCase(/** @type {any} */ (selectedVertical), /** @type {any} */ (selectedModule || undefined))) as any;
    if (demoCase) {
        selectedCaseId = demoCase.id;
        const cases = getFilteredCases();
        renderDemoController(getDemoState(), selectedVertical, selectedModule, selectedCaseId, cases);
    }
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/**
 * Get filtered cases based on selected vertical and module.
 * @returns {Array<Object>} Filtered demo cases
 */
function getFilteredCases() {
    if (!selectedVertical)
        return [];
    const allCases = (getAllCases()) as Array<any>;
    return allCases.filter((c: any) => {
        if (c.vertical !== selectedVertical)
            return false;
        if (selectedModule && c.module !== selectedModule)
            return false;
        return true;
    });
}
// ----------------------------------------------------------------
// HANDLER EXPORT
// ----------------------------------------------------------------
export const demoHandlers = {
    handleOpenDemo,
    handleCloseDemo,
    handleSelectVertical,
    handleSelectModule,
    handleSelectCase,
    handleStartDemo,
    handleStartDemoCase,
    handleStartCaseDirect,
    handleDemoNext,
    handleDemoPrev,
    handleExitDemo,
    handleDemoRandomCase,
};
