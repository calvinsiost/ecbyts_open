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
   TOUR HANDLERS — Window functions for onboarding tour
   Funcoes globais para o tour de onboarding

   Expoe funcoes no window.* para onclick do HTML.
   Conecta a UI com o tour engine e controller.
   ================================================================ */
import {
    setTourUpdateAllUI,
    startTour,
    nextStep,
    prevStep,
    exitTour,
    resetTour,
    isActive,
    startGuidedTour,
    resetGuidedTours,
    getTourState,
} from '../tour/engine.js';
import { showChapterPicker, hideChapterPicker } from '../ui/tourController.js';
import { shouldShowWelcomeTour, markWelcomeTourSeen } from '../tour/firstVisitTour.js';
import {
    showGuidedTourPicker,
    hideGuidedTourPicker,
    selectCategory,
    backToCategories,
    filterTours,
} from '../ui/tourPicker.js';
import { detectActiveModule, showContextualTourMenu } from '../tour/contextualTour.js';
import { createLogger } from '../helpers/logger.js';
import { requireAuth } from '../auth/inviteGate.js';
const log = createLogger('Tour');
// Loose-typed alias for window.* helpers registered elsewhere (showToast,
// getElements, getCampaigns) — they are provided at runtime via the handler
// registry but not declared on the global Window interface.
const W = window;
let guidedToursLoadPromise: Promise<unknown> | null = null;

function ensureGuidedToursLoaded(): Promise<unknown> {
    if (!guidedToursLoadPromise) {
        guidedToursLoadPromise = Promise.all([
            import('../tour/tours/elementManagement.js' as string),
            import('../tour/tours/fieldData.js' as string),
            import('../tour/tours/campaignManagement.js' as string),
            import('../tour/tours/sceneCamera.js' as string),
            import('../tour/tours/importExport.js' as string),
            import('../tour/tours/spatialInterpolation.js' as string),
            import('../tour/tours/analysisModeling.js' as string),
            import('../tour/tours/environmentalWorkflows.js' as string),
            import('../tour/tours/aiNeural.js' as string),
            import('../tour/tours/advancedFeatures.js' as string),
            import('../tour/tours/hydrometOhsRisks.js' as string),
        ]).catch((error: any) => {
            guidedToursLoadPromise = null;
            log.warn('Guided tour modules failed to load', error?.message || error);
            throw error;
        });
    }
    return guidedToursLoadPromise;
}

// ----------------------------------------------------------------
// UPDATE INJECTION
// ----------------------------------------------------------------
// eslint-disable-next-line
let requestUIRefresh = null;
/**
 * Inject UI refresh callback.
 * @param {((...args: unknown[]) => unknown) | null} fn
 */
export function setTourHandlerUpdateAllUI(fn: any) {
    requestUIRefresh = fn;
    setTourUpdateAllUI(fn);
}
// ----------------------------------------------------------------
// HANDLERS
// ----------------------------------------------------------------
/**
 * Open tour panel (FAB click).
 * Se tour ativo, nao faz nada. Senao abre chapter picker.
 */
function handleOpenTour() {
    if (isActive()) return;
    if (typeof showChapterPicker !== 'function') {
        log.warn('Tour system not initialized yet');
        W.showToast?.('Aguarde o sistema carregar...', 'warning');
        return;
    }
    showChapterPicker();
}
/**
 * Close tour panel.
 */
function handleCloseTour() {
    hideChapterPicker();
}
/**
 * Start tour from a specific chapter.
 * @param {string} chapterId
 */
async function handleStartTourChapter(chapterId: any) {
    if (requireAuth()) return;
    if (typeof startTour !== 'function') {
        log.warn('Tour engine not initialized yet');
        W.showToast?.('Aguarde o sistema carregar...', 'warning');
        return;
    }
    hideChapterPicker();
    await startTour(chapterId);
}
/**
 * Start tour from first incomplete chapter.
 */
async function handleStartTour() {
    if (requireAuth()) return;
    hideChapterPicker();
    await startTour();
}
/**
 * Navigate to next step.
 */
async function handleTourNext() {
    if (typeof nextStep !== 'function') {
        log.warn('Tour engine not initialized yet');
        return;
    }
    await nextStep();
}
/**
 * Navigate to previous step.
 */
async function handleTourPrev() {
    if (typeof prevStep !== 'function') {
        log.warn('Tour engine not initialized yet');
        return;
    }
    await prevStep();
}
/**
 * Exit tour - cleanup and save progress.
 */
async function handleExitTour() {
    if (typeof exitTour !== 'function') {
        log.warn('Tour engine not initialized yet');
        return;
    }
    await exitTour();
}
/**
 * Skip/exit tour from tooltip skip button.
 */
async function handleSkipTour() {
    await exitTour();
}
/**
 * Reset all tour progress.
 */
function handleResetTour() {
    resetTour();
}
// ----------------------------------------------------------------
// GUIDED TOUR HANDLERS
// ----------------------------------------------------------------
/**
 * Open guided tour picker (50 workflow tours).
 */
async function handleOpenGuidedTours() {
    if (typeof showGuidedTourPicker !== 'function') {
        log.warn('Tour picker not initialized yet');
        W.showToast?.('Aguarde o sistema carregar...', 'warning');
        return;
    }
    hideChapterPicker();
    try {
        await ensureGuidedToursLoaded();
    } catch (_error: any) {
        W.showToast?.('Nao foi possivel carregar os tours guiados agora.', 'warning');
        return;
    }
    showGuidedTourPicker();
}
/**
 * Close guided tour picker.
 */
function handleCloseGuidedTours() {
    hideGuidedTourPicker();
}
/**
 * Start a specific guided tour by ID.
 * Verifica pre-requisitos e inicia o tour. Propaga o resultado ao chamador
 * (RF-6 TRAINING-LEARNER-MIN-001: o LMS precisa saber quando a prática NÃO
 * iniciou para reabrir o painel com um erro legível em vez de silêncio).
 * @param {string} tourId
 * @param {{ silent?: boolean }} [opts] - silent: chamador cuida do feedback.
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
async function handleStartGuidedTour(tourId: any, opts: { silent?: boolean } = {}) {
    hideGuidedTourPicker();
    try {
        await ensureGuidedToursLoaded();
    } catch (_error: any) {
        if (!opts.silent) W.showToast?.('Nao foi possivel carregar o tour guiado agora.', 'warning');
        return { ok: false, reason: 'load-failed' };
    }
    // Get current app state for prerequisite check
    const appState = {
        elementCount: W.getElements?.()?.length ?? 0,
        campaignCount: W.getCampaigns?.()?.length ?? 0,
        observationCount: _countObservations(),
    };
    const result = await startGuidedTour(tourId, appState);
    if (!result.ok && !opts.silent) {
        // Show toast with missing prerequisites
        W.showToast?.(`Cannot start tour: ${result.reason}`, 'warning');
    }
    return result;
}
/**
 * Select a tour category in the picker.
 * @param {string} categoryId
 */
function handleSelectTourCategory(categoryId: any) {
    selectCategory(categoryId);
}
/**
 * Go back from tour list to categories.
 */
function handleGuidedTourBack() {
    backToCategories();
}
/**
 * Search guided tours.
 * @param {string} query
 */
function handleSearchGuidedTours(query: any) {
    filterTours(query);
}
/**
 * Reset all guided tour progress.
 */
function handleResetGuidedTours() {
    resetGuidedTours();
    W.showToast?.('Guided tour progress reset', 'info');
}
/**
 * Show contextual tours for the currently active module.
 * Detecta o modulo ativo e exibe popup de tours na posicao do mouse.
 * @param {MouseEvent} [event] - Mouse event for positioning
 */
async function handleShowContextualTours(event: any) {
    try {
        await ensureGuidedToursLoaded();
    } catch (_error: any) {
        W.showToast?.('Nao foi possivel carregar os tours contextuais agora.', 'warning');
        return;
    }
    const moduleKey = detectActiveModule();
    const x = event?.clientX ?? window.innerWidth / 2;
    const y = event?.clientY ?? window.innerHeight / 2;
    log.info(`Contextual tours for module: ${moduleKey}`);
    showContextualTourMenu(x, y, moduleKey);
}
/**
 * Count total observations across all elements.
 * @returns {number}
 */
function _countObservations() {
    try {
        const elements = W.getElements?.() ?? [];
        let count = 0;
        for (const el of elements) {
            count += el.observations?.length ?? 0;
        }
        return count;
    } catch {
        return 0;
    }
}
// ----------------------------------------------------------------
// WELCOME TOUR HANDLER
// ----------------------------------------------------------------
/**
 * Inicia o tour de boas-vindas para novos usuarios.
 * Marca o tour como visto apos iniciar.
 */
async function handleStartWelcomeTour() {
    if (typeof startTour !== 'function') {
        log.warn('Tour engine not initialized yet');
        W.showToast?.('Aguarde o sistema carregar...', 'warning');
        return;
    }
    markWelcomeTourSeen();
    await startTour('welcome');
}
/**
 * Verifica se deve exibir o tour de boas-vindas (primeira visita).
 * @returns {boolean}
 */
function getShouldShowWelcomeTour() {
    return shouldShowWelcomeTour();
}
// ----------------------------------------------------------------
// HANDLER EXPORT
// ----------------------------------------------------------------
export const tourHandlers = {
    handleOpenTour,
    handleCloseTour,
    handleStartTour,
    handleStartTourChapter,
    handleTourNext,
    handleTourPrev,
    handleExitTour,
    handleSkipTour,
    handleResetTour,
    handleOpenGuidedTours,
    handleCloseGuidedTours,
    handleStartGuidedTour,
    handleSelectTourCategory,
    handleGuidedTourBack,
    handleSearchGuidedTours,
    handleResetGuidedTours,
    handleShowContextualTours,
    handleStartWelcomeTour,
    getShouldShowWelcomeTour,
    getTourState,
};
