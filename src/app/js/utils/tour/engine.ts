// @ts-check
// Generated from src/app/js/utils/tour/engine.ts by TS-MIGRATION-001. Do not edit manually.
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
   TOUR ENGINE — Onboarding tour state machine
   Motor do tour de onboarding com steps interativos

   Gerencia o ciclo de vida do tour:
   - 4 capitulos com steps sequenciais (onboarding)
   - 50 guided tours com steps por workflow
   - Steps informativos (Next avanca) e interativos (espera acao)
   - Persistencia de progresso via localStorage
   - Coachmark spotlight + tooltip persistente
   ================================================================ */
import { TOUR_CHAPTERS } from './steps.js';
import { getGuidedTour } from './categories.js';
import { initSpotlight, showSpotlight, hideSpotlight, isSpotlightReady } from './spotlight.js';
import {
    initTooltip,
    showTooltip,
    hideTooltip,
    enableNextButton,
    setTooltipCallbacks,
    isTooltipReady,
} from './tooltip.js';
import { t } from '../i18n/translations.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { createLogger } from '../helpers/logger.js';
import { Z_INDEX } from '../ui/zIndex.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
const log = createLogger('TourEngine');
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const TOUR_PORTAL_ID = 'tour-portal';
const TOUR_PORTAL_ZINDEX = 9500;
const STORAGE_KEY = 'ecbyts-tour-state';
const GUIDED_STORAGE_KEY = 'ecbyts-guided-tour-state';
const INTERACTION_TIMEOUT = 30000; // 30s fallback for interactive steps
const TARGET_RETRY_INTERVAL = 120; // ms between retries to find target
const TARGET_MAX_RETRIES = 60; // max retries (~7.2s total)
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
let requestUIRefresh: any = null;
type TourEngineState = {
    active: boolean;
    currentChapter: string | null;
    currentStepIndex: number;
    isAnimating: boolean;
    waitingForInteraction: boolean;
    currentWaitFor: string | null;
    guidedTourId: string | null;
};
let state: TourEngineState = {
    active: false,
    currentChapter: null,
    currentStepIndex: -1,
    isAnimating: false,
    waitingForInteraction: false,
    currentWaitFor: null, // event name the interactive step is waiting for
    guidedTourId: null, // non-null = guided tour mode (vs onboarding chapter)
};
let interactionTimer: ReturnType<typeof setTimeout> | null = null;
let interactionCleanup: (() => void) | null = null;
let _portalEl: HTMLElement | null = null;
// ----------------------------------------------------------------
// TOUR PORTAL
// ----------------------------------------------------------------
/**
 * IDs of elements that should be moved into the tour portal.
 * Ordem importa: backdrop (fundo) < spotlight (recorte) < tooltip (frente).
 */
const TOUR_ELEMENT_IDS = ['tour-backdrop', 'tour-spotlight', 'tour-tooltip'];
/**
 * Create or return the tour portal container.
 * The portal is a fixed overlay at z-index 9500, above async dialogs (9000)
 * and below max overlays. pointer-events: none on the container avoids
 * blocking clicks; individual children opt in with pointer-events: auto.
 * @returns {HTMLElement}
 */
function _ensureTourPortal() {
    if (_portalEl && document.body.contains(_portalEl)) return _portalEl;
    _portalEl = document.getElementById(TOUR_PORTAL_ID);
    if (_portalEl) return _portalEl;
    _portalEl = document.createElement('div');
    _portalEl.id = TOUR_PORTAL_ID;
    _portalEl.style.cssText = `position:fixed;inset:0;z-index:${TOUR_PORTAL_ZINDEX};pointer-events:none;`;
    document.body.appendChild(_portalEl);
    log.debug('Tour portal created');
    return _portalEl;
}
/**
 * Move tour overlay elements into the portal.
 * Called lazily when a tour starts, not at app boot.
 */
function _reparentTourElements() {
    const portal = _ensureTourPortal();
    for (const id of TOUR_ELEMENT_IDS) {
        const el = document.getElementById(id);
        if (el && el.parentElement !== portal) {
            portal.appendChild(el);
            // Children need pointer-events so user can interact with tooltip buttons
            // and backdrop can catch clicks
            el.style.pointerEvents = 'auto';
        }
    }
}
/**
 * Destroy the tour portal and return elements to document.body.
 * Called when tour ends to avoid a permanent stacking context.
 */
function _destroyTourPortal() {
    if (!_portalEl) return;
    // Move children back to document.body before removing portal
    for (const id of TOUR_ELEMENT_IDS) {
        const el = document.getElementById(id);
        if (el && el.parentElement === _portalEl) {
            document.body.appendChild(el);
            // Restore default pointer-events (each element manages its own)
            el.style.pointerEvents = '';
        }
    }
    if (_portalEl.parentElement) {
        _portalEl.parentElement.removeChild(_portalEl);
    }
    _portalEl = null;
    log.debug('Tour portal destroyed');
}
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Initialize tour engine.
 * Prepara spotlight e tooltip no DOM.
 * Portal is NOT created here - it is created lazily when a tour starts.
 */
export function initTour() {
    initSpotlight();
    initTooltip();
    setTooltipCallbacks({
        onNext: nextStep,
        onPrev: prevStep,
        onSkip: exitTour,
    });
}
/**
 * Garante que a UI do tour (tooltip/spotlight/backdrop) esteja inicializada.
 * RF-6 (TRAINING-LEARNER-MIN-001): em boot parcial, post-shell-activation nunca
 * roda initTour() — sem este lazy re-init o tour ficava "ativo" porém invisível
 * (showTooltip/showSpotlight no-op silencioso), parecendo um reload da página.
 * Idempotente e barato: só re-executa quando os refs não estão prontos.
 * @returns {boolean} true se a UI do tour está pronta para renderizar steps.
 */
function _ensureTourUiReady(): boolean {
    if (!isTooltipReady() || !isSpotlightReady()) {
        initTour();
    }
    return isTooltipReady() && isSpotlightReady();
}
/**
 * Inject UI refresh callback.
 * @param {Function} fn
 */
export function setTourUpdateAllUI(fn: any) {
    requestUIRefresh = fn;
}
function requestTourUIRefresh(reason = 'tour.changed') {
    if (typeof requestUIRefresh !== 'function')
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.TOUR,
        UI_INVALIDATION_DOMAINS.HOME,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains) {
        requestUIRefresh(domain, reason);
    }
}
// ----------------------------------------------------------------
// STATE ACCESS
// ----------------------------------------------------------------
/** @returns {boolean} Whether tour is active */
export function isActive() {
    return state.active;
}
/** @returns {Object} Copy of current state */
export function getTourState() {
    return { ...state };
}
/**
 * Get chapter metadata with completion status.
 * @returns {Array<Object>}
 */
export function getChapters() {
    const persisted = _loadState();
    return Object.values(TOUR_CHAPTERS).map((ch: any) => ({
        id: ch.id,
        titleKey: ch.titleKey,
        descKey: ch.descKey,
        icon: ch.icon,
        color: ch.color,
        stepCount: ch.steps.length,
        status: persisted.chaptersCompleted?.[ch.id]
            ? 'completed'
            : persisted.lastChapter === ch.id && persisted.lastStep >= 0
              ? 'in-progress'
              : 'pending',
    }));
}
// ----------------------------------------------------------------
// TOUR LIFECYCLE
// ----------------------------------------------------------------
/**
 * Start tour from a specific chapter.
 * @param {string} [chapterId?] - Chapter to start. Defaults to first incomplete.
 */
export async function startTour(chapterId?: string) {
    const chapters = Object.keys(TOUR_CHAPTERS);
    if (!chapterId) {
        // Find first incomplete chapter
        const persisted = _loadState();
        chapterId = chapters.find((id: any) => !persisted.chaptersCompleted?.[id]) || chapters[0];
    }
    if (!chapterId) return;
    const chapter = (TOUR_CHAPTERS as Record<string, any>)[chapterId];
    if (!chapter || chapter.steps.length === 0) return;
    // RF-6: lazy init da UI (boot parcial).
    if (!_ensureTourUiReady()) return;
    // Move tour elements into portal for correct stacking context
    _reparentTourElements();
    state.active = true;
    state.currentChapter = chapterId;
    state.currentStepIndex = -1;
    state.isAnimating = false;
    state.waitingForInteraction = false;
    window.dispatchEvent(new CustomEvent('tourChanged'));
    // Advance to first step
    await nextStep();
}
/**
 * Advance to the next step.
 * Funciona para onboarding chapters e guided tours.
 * @returns {Promise<boolean>}
 */
async function _runPostAction(step: any) {
    if (!step?.postAction) return;
    try {
        await step.postAction();
    } catch (e: any) {
        console.warn('[Tour] postAction error:', /** @type {any} */ (e)?.message);
    }
}

async function _completeCurrentTour(): Promise<boolean> {
    if (state.guidedTourId) {
        _completeGuidedTour();
    } else {
        await _completeChapter();
    }
    return false;
}

async function _executeStepAction(step: any) {
    if (step.action) {
        await step.action();
    }
    if (step.delay && step.delay > 0) {
        await new Promise((r: any) => setTimeout(r, step.delay));
    }
}

async function _showStepUI(step: any, index: number, totalSteps: number): Promise<boolean> {
    const targetFound = await _waitForTarget(step.target);
    if (!targetFound) {
        console.warn(`[Tour] Target not found: ${step.target} — skipping step`);
        return false;
    }
    showSpotlight(step.target);
    const tourName = _getCurrentName();
    showTooltip(step, index, totalSteps, tourName);
    if (step.interactive && step.waitFor) {
        _enableClickThrough(step.target);
        _setupInteractionListener(step.waitFor);
    } else {
        _disableClickThrough();
    }
    return true;
}

function _persistTourProgress() {
    if (state.guidedTourId) {
        _saveGuidedProgress();
    } else {
        _saveProgress();
    }
}

export async function nextStep() {
    if (!state.active) return false;
    if (!state.currentChapter && !state.guidedTourId) return false;
    if (state.isAnimating) return false;
    // Cleanup previous interaction listener
    _cleanupInteraction();
    const steps = _getCurrentSteps();
    const prevIdx = state.currentStepIndex;
    const nextIdx = prevIdx + 1;
    // Execute postAction of current step (if any)
    if (prevIdx >= 0 && prevIdx < steps.length) {
        await _runPostAction(steps[prevIdx]);
    }
    // Check if tour/chapter is complete
    if (nextIdx >= steps.length) {
        return _completeCurrentTour();
    }
    state.currentStepIndex = nextIdx;
    state.isAnimating = true;
    const step = steps[nextIdx];
    try {
        await _executeStepAction(step);
        const shown = await _showStepUI(step, nextIdx, steps.length);
        if (!shown) {
            state.isAnimating = false;
            await nextStep();
            return true;
        }
        _persistTourProgress();
    } catch (e: any) {
        console.error('[Tour] Step execution error:', e);
    } finally {
        state.isAnimating = false;
    }
    window.dispatchEvent(new CustomEvent('tourChanged'));
    return true;
}
/**
 * Go back to previous step.
 * @returns {Promise<boolean>}
 */
export async function prevStep() {
    if (!state.active) return false;
    if (!state.currentChapter && !state.guidedTourId) return false;
    if (state.isAnimating) return false;
    if (state.currentStepIndex <= 0) return false;
    _cleanupInteraction();
    const steps = _getCurrentSteps();
    const currentStep = steps[state.currentStepIndex];
    await _runPostAction(currentStep);
    state.currentStepIndex--;
    state.isAnimating = true;
    const step = steps[state.currentStepIndex];
    try {
        await _executeStepAction(step);
        await _waitForTarget(step.target);
        showSpotlight(step.target);
        const tourName = _getCurrentName();
        showTooltip(step, state.currentStepIndex, steps.length, tourName);
        if (step.interactive && step.waitFor) {
            _enableClickThrough(step.target);
            _setupInteractionListener(step.waitFor);
        } else {
            _disableClickThrough();
        }
    } catch (e: any) {
        console.error('[Tour] Prev step error:', e);
    } finally {
        state.isAnimating = false;
    }
    window.dispatchEvent(new CustomEvent('tourChanged'));
    return true;
}
/**
 * Exit tour, cleanup and save progress.
 */
export async function exitTour() {
    if (!state.active) return;
    _cleanupInteraction();
    _disableClickThrough();
    // Execute postAction of current step
    const steps = _getCurrentSteps();
    if (state.currentStepIndex >= 0 && state.currentStepIndex < steps.length) {
        const step = steps[state.currentStepIndex];
        if (step?.postAction) {
            try {
                await step.postAction();
            } catch (e: any) {
                console.warn('[Tour] Exit postAction error:', /** @type {any} */ (e)?.message);
            }
        }
    }
    hideSpotlight();
    hideTooltip();
    if (state.guidedTourId) {
        _saveGuidedProgress();
    } else {
        _saveProgress();
    }
    // Destroy portal and return elements to document.body
    _destroyTourPortal();
    const exitedGuidedTourId = state.guidedTourId;
    state = {
        active: false,
        currentChapter: null,
        currentStepIndex: -1,
        isAnimating: false,
        waitingForInteraction: false,
        currentWaitFor: null,
        guidedTourId: null,
    };
    window.dispatchEvent(new CustomEvent('tourChanged'));
    // RF-6: saída explícita de um guided tour (ex.: "Sair da prática") — permite
    // ao LMS voltar ao ponto da trilha sem marcar a lição como concluída.
    if (exitedGuidedTourId) {
        window.dispatchEvent(new CustomEvent('guidedTourExited', { detail: { tourId: exitedGuidedTourId } }));
    }
    requestTourUIRefresh('tour.exited');
}
/**
 * Reset all tour progress.
 */
export function resetTour() {
    localStorage.removeItem(STORAGE_KEY);
    exitTour();
}
// ----------------------------------------------------------------
// CHAPTER COMPLETION
// ----------------------------------------------------------------
async function _completeChapter() {
    hideSpotlight();
    hideTooltip();
    _destroyTourPortal();
    // Mark chapter as completed in localStorage
    const persisted = _loadState();
    if (!persisted.chaptersCompleted) persisted.chaptersCompleted = {};
    if (state.currentChapter) persisted.chaptersCompleted[state.currentChapter] = true;
    persisted.lastChapter = null;
    persisted.lastStep = -1;
    _saveState(persisted);
    state.active = false;
    state.currentChapter = null;
    state.currentStepIndex = -1;
    window.dispatchEvent(new CustomEvent('tourChanged'));
    window.dispatchEvent(new CustomEvent('tourChapterComplete'));
    requestTourUIRefresh('tour.chapter-complete');
}
// ----------------------------------------------------------------
// CLICK-THROUGH FOR INTERACTIVE STEPS
// ----------------------------------------------------------------
let _elevatedTarget: HTMLElement | null = null;
let _originalZIndex = '';
let _originalPosition = '';
/**
 * Allow user to click the target element during interactive steps.
 * Disables pointer-events on backdrop, elevates target above overlay.
 */
function _enableClickThrough(selector: string) {
    _disableClickThrough(); // cleanup previous
    const backdrop = document.getElementById('tour-backdrop');
    if (backdrop) backdrop.style.pointerEvents = 'none';
    // Elevate target above the spotlight (z-index 10000)
    const target = document.querySelector(selector) as HTMLElement | null;
    if (target) {
        _elevatedTarget = target;
        _originalZIndex = target.style.zIndex;
        _originalPosition = target.style.position;
        const computed = getComputedStyle(target).position;
        if (computed === 'static') target.style.position = 'relative';
        target.style.zIndex = String(Z_INDEX.EXCEPTION_TOUR_ELEVATED_TARGET);
    }
}
/**
 * Restore backdrop pointer-events and target z-index.
 */
function _disableClickThrough() {
    const backdrop = document.getElementById('tour-backdrop');
    if (backdrop) backdrop.style.pointerEvents = '';
    if (_elevatedTarget) {
        _elevatedTarget.style.zIndex = _originalZIndex;
        _elevatedTarget.style.position = _originalPosition;
        _elevatedTarget = null;
        _originalZIndex = '';
        _originalPosition = '';
    }
}
// ----------------------------------------------------------------
// INTERACTION LISTENER
// ----------------------------------------------------------------
function _setupInteractionListener(eventName: string) {
    state.waitingForInteraction = true;
    state.currentWaitFor = eventName;
    const handler = () => {
        _cleanupInteraction();
        enableNextButton();
        // Auto-advance after a short pause
        setTimeout(() => nextStep(), 500);
    };
    window.addEventListener(eventName, handler, { once: true });
    interactionCleanup = () => window.removeEventListener(eventName, handler);
    // Timeout fallback: enable Next after 30s
    interactionTimer = setTimeout(() => {
        state.waitingForInteraction = false;
        enableNextButton();
    }, INTERACTION_TIMEOUT);
}
function _cleanupInteraction() {
    state.waitingForInteraction = false;
    state.currentWaitFor = null;
    if (interactionTimer) {
        clearTimeout(interactionTimer);
        interactionTimer = null;
    }
    if (interactionCleanup) {
        interactionCleanup();
        interactionCleanup = null;
    }
}
// ----------------------------------------------------------------
// TARGET WAITING
// ----------------------------------------------------------------
function _waitForTarget(selector: string) {
    if (!selector) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
        let retries = 0;
        const check = () => {
            const target = document.querySelector(selector);
            if (target) {
                resolve(true);
                return;
            }
            if (retries >= TARGET_MAX_RETRIES) {
                resolve(false);
                return;
            }
            retries++;
            setTimeout(check, TARGET_RETRY_INTERVAL);
        };
        check();
    });
}
// ----------------------------------------------------------------
// PERSISTENCE
// ----------------------------------------------------------------
function _loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || '';
        return raw ? JSON.parse(raw) : {};
    } catch (e: any) {
        console.debug('[tour-engine] loadState:', /** @type {any} */ (e)?.message || e);
        return {};
    }
}
function _saveState(data: any) {
    try {
        safeSetItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e: any) {
        console.debug('[tour-engine] saveState:', /** @type {any} */ (e)?.message || e);
        // localStorage may be full or disabled
    }
}
function _saveProgress() {
    const persisted = _loadState();
    persisted.lastChapter = state.currentChapter;
    persisted.lastStep = state.currentStepIndex;
    persisted.version = 1;
    _saveState(persisted);
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
function _t(key: string, fallback = '') {
    try {
        const val = t(key);
        return val && val !== key ? val : fallback || key;
    } catch (e: any) {
        console.debug('[tour-engine] translate:', /** @type {any} */ (e)?.message || e);
        return fallback || key;
    }
}
/**
 * Get current steps array - works for both onboarding chapters and guided tours.
 * Retorna os steps do capitulo atual ou do guided tour ativo.
 * @returns {Array<any>}
 */
function _getCurrentSteps() {
    if (state.guidedTourId) {
        const tour = getGuidedTour(state.guidedTourId) as any;
        return tour ? tour.steps : [];
    }
    if (state.currentChapter && (TOUR_CHAPTERS as Record<string, any>)[state.currentChapter]) {
        return (TOUR_CHAPTERS as Record<string, any>)[state.currentChapter].steps;
    }
    return [];
}
/**
 * Get display name for current tour/chapter.
 * @returns {string}
 */
function _getCurrentName() {
    if (state.guidedTourId) {
        const tour = getGuidedTour(state.guidedTourId) as any;
        return tour ? _t(tour.nameKey, tour.id) : '';
    }
    if (state.currentChapter) {
        const ch = (TOUR_CHAPTERS as Record<string, any>)[state.currentChapter];
        return ch ? _t(ch.titleKey, ch.id) : '';
    }
    return '';
}
// ----------------------------------------------------------------
// GUIDED TOUR LIFECYCLE
// ----------------------------------------------------------------
/**
 * Start a guided workflow tour by ID.
 * Verifica pre-requisitos e auto-scaffold se necessario.
 * @param {string} prereqs
 * @param {{ elementCount?: number, campaignCount?: number, observationCount?: number }} [appState] - Current app state for prerequisite check
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
function _collectMissingPrerequisites(prereqs: any, appState: any): string[] {
    const elemCount = appState.elementCount ?? 0;
    const campCount = appState.campaignCount ?? 0;
    const obsCount = appState.observationCount ?? 0;
    const missing = [];
    if ((prereqs.minElements || 0) > elemCount) missing.push(`${prereqs.minElements} elements`);
    if ((prereqs.minCampaigns || 0) > campCount) missing.push(`${prereqs.minCampaigns} campaigns`);
    if ((prereqs.minObservations || 0) > obsCount) missing.push(`${prereqs.minObservations} observations`);
    return missing;
}

async function _tryAutoScaffold(): Promise<void> {
    try {
        (window as any).generateRandomModel?.();
        await new Promise((r: any) => setTimeout(r, 500));
    } catch (e: any) {
        console.warn('[GuidedTour] Auto-scaffold failed:', /** @type {any} */ (e).message);
    }
}

function _enterGuidedTourState(tourId: string) {
    state.active = true;
    state.guidedTourId = tourId;
    state.currentChapter = null;
    state.currentStepIndex = -1;
    state.isAnimating = false;
    state.waitingForInteraction = false;
}

export async function startGuidedTour(tourId: string, appState: any = {}) {
    const tour = getGuidedTour(tourId) as any;
    if (!tour || !tour.steps.length) {
        return { ok: false, reason: 'Tour not found' };
    }
    // RF-6: sem UI de tour pronta, falha com sinal claro (nunca tour invisível).
    if (!_ensureTourUiReady()) {
        return { ok: false, reason: 'ui-not-ready' };
    }
    const prereqs = tour.prerequisites || {};
    const missing = _collectMissingPrerequisites(prereqs, appState);
    if (missing.length > 0) {
        if (prereqs.autoScaffold) {
            await _tryAutoScaffold();
        } else {
            return { ok: false, reason: `Missing: ${missing.join(', ')}` };
        }
    }
    // Move tour elements into portal for correct stacking context
    _reparentTourElements();
    _enterGuidedTourState(tourId);
    window.dispatchEvent(new CustomEvent('tourChanged'));
    try {
        await nextStep();
    } catch (e: any) {
        console.error('[GuidedTour] Failed to start:', e);
        state.active = false;
        state.guidedTourId = null;
        return { ok: false, reason: 'Failed to start tour' };
    }
    // Se todos os steps foram pulados (targets ausentes) o tour já terminou —
    // sinaliza falha em vez de fingir que a prática está rodando.
    if (!state.active || state.guidedTourId !== tourId) {
        return { ok: false, reason: 'ui-not-ready' };
    }
    return { ok: true };
}
/**
 * Get guided tour persistence state.
 * @returns {Object}
 */
export function getGuidedTourState() {
    return _loadGuidedState();
}
/**
 * Reset all guided tour progress.
 */
export function resetGuidedTours() {
    localStorage.removeItem(GUIDED_STORAGE_KEY);
}
// ----------------------------------------------------------------
// GUIDED TOUR PERSISTENCE
// ----------------------------------------------------------------
function _loadGuidedState() {
    try {
        const raw = localStorage.getItem(GUIDED_STORAGE_KEY) || '';
        return raw ? JSON.parse(raw) : { version: 1, toursCompleted: {}, totalCompleted: 0 };
    } catch (e: any) {
        console.debug('[tour/engine] loadGuided:', /** @type {any} */ (e)?.message || e);
        return { version: 1, toursCompleted: {}, totalCompleted: 0 };
    }
}
function _saveGuidedState(data: any) {
    try {
        safeSetItem(GUIDED_STORAGE_KEY, JSON.stringify(data));
    } catch (e: any) {
        console.debug('[tour/engine] saveGuided:', /** @type {any} */ (e)?.message || e);
        // localStorage may be full
    }
}
function _completeGuidedTour() {
    hideSpotlight();
    hideTooltip();
    _destroyTourPortal();
    const guided = _loadGuidedState();
    if (!guided.toursCompleted) guided.toursCompleted = {};
    if (state.guidedTourId) guided.toursCompleted[state.guidedTourId] = true;
    guided.totalCompleted = Object.keys(guided.toursCompleted).length;
    guided.lastTourId = null;
    guided.lastStepIndex = -1;
    _saveGuidedState(guided);
    const completedTourId = state.guidedTourId;
    state.active = false;
    state.guidedTourId = null;
    state.currentChapter = null;
    state.currentStepIndex = -1;
    window.dispatchEvent(new CustomEvent('tourChanged'));
    window.dispatchEvent(new CustomEvent('guidedTourComplete', { detail: { tourId: completedTourId } }));
    requestTourUIRefresh('tour.guided-complete');
}
function _saveGuidedProgress() {
    if (!state.guidedTourId) return;
    const guided = _loadGuidedState();
    guided.lastTourId = state.guidedTourId;
    guided.lastStepIndex = state.currentStepIndex;
    _saveGuidedState(guided);
}
// ----------------------------------------------------------------
// TEST HELPERS - Exported for unit tests only
// ----------------------------------------------------------------
/** @returns {{ TOUR_PORTAL_ID: string, TOUR_PORTAL_ZINDEX: number, TOUR_ELEMENT_IDS: string[] }} */
export function _testGetPortalConstants() {
    return { TOUR_PORTAL_ID, TOUR_PORTAL_ZINDEX, TOUR_ELEMENT_IDS: [...TOUR_ELEMENT_IDS] };
}
/** @returns {HTMLElement|null} Current portal element (null if not created) */
export function _testGetPortalElement() {
    return _portalEl;
}
/** Expose _ensureTourPortal for tests */
export { _ensureTourPortal as _testEnsureTourPortal };
/** Expose _destroyTourPortal for tests */
export { _destroyTourPortal as _testDestroyTourPortal };
//# sourceMappingURL=engine.js.map
