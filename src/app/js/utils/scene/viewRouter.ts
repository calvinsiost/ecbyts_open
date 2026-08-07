// @ts-check
// Generated from src/app/js/utils/scene/viewRouter.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   VIEW ROUTER — Two-level state machine: groups + sub-modes
   Roteador de views — maquina de estado de dois niveis

   Level 1: Groups (actions | model | datastudio) — swipe navigation
   Level 2: Sub-modes within model (2d | 2d-depth | 3d)

   Fonte unica de verdade para o modo de visualizacao ativo.
   controls.js recebe modo do viewRouter, nunca gerencia estado proprio.
   ================================================================ */
import { scheduleResizeSync } from './setup.js';
import { t } from '../i18n/translations.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('viewRouter');
// --- Constants (exported for reuse across modules) ---
export const VIEW_GROUPS = Object.freeze({
    ACTIONS: 'actions',
    MODEL: 'model',
    DATASTUDIO: 'datastudio',
});
export const VIEW_MODES = Object.freeze({
    ACTIONS: 'actions',
    TWO_D: '2d',
    TWO_D_D: '2d-depth',
    THREE_D: '3d',
});
const VALID_GROUPS = Object.values(VIEW_GROUPS);
const VALID_MODES = Object.values(VIEW_MODES);
const GROUP_ORDER = [VIEW_GROUPS.ACTIONS, VIEW_GROUPS.MODEL, VIEW_GROUPS.DATASTUDIO];
const LS_KEY = 'ecbyts-default-view';
const LS_GROUP_KEY = 'ecbyts-active-group';
// --- State ---
let _currentGroup: any = VIEW_GROUPS.ACTIONS;
let _currentModelSubMode: any = VIEW_MODES.THREE_D; // remembered sub-mode within model
let _currentView: any = VIEW_MODES.ACTIONS; // backward-compat: derived from group + sub-mode
/** @type {any} */
let _sceneInitFn: any = null;
let _sceneReady = false;
let _initializing = false;
let _hasWebGL = true;
/** @type {any} */
let _dataStudioInitFn: any = null;
let _dataStudioReady = false;
let _dataStudioInitializing = false;
/** @type {any} */
let _swipeHandler: any = null;
let _renderLoopPaused = false;
// --- Public API ---
/**
 * Initialize the view router. Reads localStorage for last-used group/view.
 * Apenas le o estado salvo - NAO aplica. Aplicar via applySavedView() apos boot.
 */
export function initViewRouter() {
    // Read saved group
    const savedGroup = localStorage.getItem(LS_GROUP_KEY) || '';
    if (savedGroup && (VALID_GROUPS as any).includes(savedGroup)) {
        _currentGroup = savedGroup as any;
    } else {
        _currentGroup = VIEW_GROUPS.ACTIONS;
    }
    // Read saved sub-mode (backward compat)
    const savedMode = localStorage.getItem(LS_KEY) || '';
    if (savedMode && (VALID_MODES as any).includes(savedMode) && savedMode !== VIEW_MODES.ACTIONS) {
        _currentModelSubMode = savedMode as any;
    }
    _currentView = _currentGroup === VIEW_GROUPS.MODEL ? _currentModelSubMode : VIEW_MODES.ACTIONS;
    _checkWebGL();
    _updateViewModeBadge(_currentView);
}
/**
 * Initialize the swipe handler integration.
 * Chamado apos DOM estar pronto, configura o swipe handler.
 */
export async function initSwipeNavigation() {
    const track = document.getElementById('swipe-track');
    const container = document.getElementById('swipe-container');
    const nav = document.getElementById('swipe-nav');
    if (!track || !container) {
        console.warn('[ecbyts:viewRouter] Swipe elements not found');
        return;
    }
    const { initSwipeHandler, setActiveIndex } = await import('../ui/swipeHandler.js' as string);
    _swipeHandler = { setActiveIndex };
    initSwipeHandler({
        track,
        container: /** @type {any} */ (container),
        nav: /** @type {any} */ (nav),
        groups: GROUP_ORDER,
        switchGroup: (groupId: any) => switchGroup(groupId, { fromSwipe: true }),
    });
    // Set initial position without animation
    const idx = GROUP_ORDER.indexOf(_currentGroup);
    if (idx >= 0) setActiveIndex(idx, false);
}
/**
 * Apply the saved view (call after boot completes).
 * Restaura grupo e sub-mode salvos.
 */
export async function applySavedView() {
    if (_currentGroup !== VIEW_GROUPS.ACTIONS) {
        const group = _currentGroup;
        _currentGroup = VIEW_GROUPS.ACTIONS; // reset so switchGroup doesn't no-op
        await switchGroup(group, { skipAuthGate: true });
    }
}
/**
 * Register the lazy scene initialization callback.
 * @param {Function} initFn - async function that initializes 3D scene
 */
export function onSceneReady( initFn: any) {
    _sceneInitFn = initFn;
}
/**
 * Register the lazy Data Studio initialization callback.
 * @param {Function} initFn - async function that initializes Data Studio
 */
export function onDataStudioReady( initFn: any) {
    _dataStudioInitFn = initFn;
}
/**
 * Switch between view groups (actions, model, datastudio).
 * Primary navigation API for the swipe carousel.
 * @param {string} group - target group ID
 * @param {Object} [opts]
 * @param {boolean} [opts.skipAuthGate] - bypass invite gate
 * @param {boolean} [opts.fromSwipe] - called from swipe handler (skip re-sync)
 */
export async function switchGroup(group: any, opts: any = {}) {
    if (!(/** @type {string[]} */ (VALID_GROUPS).includes(group))) return;
    if (group === _currentGroup) {
        if (group === VIEW_GROUPS.ACTIONS) {
            try {
                const { showHomeView } = await import('../ui/homeGrid.js' as string);
                showHomeView({ refreshTelemetry: true });
            } catch (err: any) {
                log.debug('homeGrid showHomeView refresh failed', /** @type {any} */ (err)?.message || err);
            }
        }
        return;
    }
    // Invite gate
    if (!opts.skipAuthGate) {
        try {
            const { requireAuth } = await import('../auth/inviteGate.js' as string);
            if (requireAuth()) return;
        } catch (e: any) {
            console.debug('[viewRouter] inviteGate:', /** @type {any} */ (e)?.message || e);
            /* inviteGate not available = no gate */
        }
    }
    const fromGroup = _currentGroup;
    _currentGroup = group;
    // Persist
    try {
        localStorage.setItem(LS_GROUP_KEY, group);
    } catch (e: any) {
        console.debug('[viewRouter] persistGroup:', /** @type {any} */ (e)?.message || e);
        /* */
    }
    // Track telemetry
    import('../telemetry/tracker.js' as string)
        .then(({ trackEvent }: any) => {
            trackEvent('group', 'switch', { from: fromGroup, to: group });
        })
        .catch((err: any) => log.debug('telemetry tracker import failed', err?.message || err));
    // Update swipe position (if not already triggered by swipe handler)
    if (!opts.fromSwipe && _swipeHandler) {
        const idx = GROUP_ORDER.indexOf(group);
        if (idx >= 0) _swipeHandler.setActiveIndex(idx, true);
    }
    // Apply chrome visibility
    _applyGroupChrome(group);
    // Group-specific logic
    if (group === VIEW_GROUPS.ACTIONS) {
        _currentView = VIEW_MODES.ACTIONS;
        _updateViewModeBadge(_currentView);
        _pauseRenderLoop();
        // Reset home scroll position
        try {
            const { showHomeView } = await import('../ui/homeGrid.js' as string);
            showHomeView();
        } catch (err: any) {
            log.debug('homeGrid showHomeView failed', /** @type {any} */ (err)?.message || err);
        }
        // Keep canvas hidden if scene not initialized
        const canvasEl = document.getElementById('canvas-container');
        if (canvasEl && !_sceneReady) canvasEl.style.display = 'none';
    } else if (group === VIEW_GROUPS.MODEL) {
        _currentView = _currentModelSubMode;
        _updateViewModeBadge(_currentView);
        _resumeRenderLoop();
        try {
            const { hideHomeView } = await import('../ui/homeGrid.js' as string);
            hideHomeView();
        } catch (err: any) {
            log.debug('homeGrid hideHomeView failed', /** @type {any} */ (err)?.message || err);
        }
        // Lazy init 3D scene
        if (!_sceneReady && _sceneInitFn && !_initializing) {
            _initializing = true;
            const canvasEl = document.getElementById('canvas-container');
            if (canvasEl) canvasEl.style.display = '';
            _showLoadingInCanvas();
            try {
                await _sceneInitFn();
                _sceneReady = true;
            } catch (e: any) {
                console.error(
                    '[ecbyts:viewRouter] Scene init failed:',
                    /** @type {any} */ (e)?.message,
                    /** @type {any} */ (e)?.stack,
                );
                _showSceneError();
            } finally {
                _initializing = false;
                _hideLoadingInCanvas();
            }
        } else {
            const canvasEl = document.getElementById('canvas-container');
            if (canvasEl) canvasEl.style.display = '';
        }
        // Refresh ribbon layout
        import('../ui/ribbon.js' as string)
            .then(({ refreshRibbonLayout }: any) => refreshRibbonLayout())
            .catch((err: any) => log.debug('ribbon refreshRibbonLayout failed', err?.message || err));
        // Apply sub-mode
        if (_sceneReady) {
            import('./controls.js' as string)
                .then(({ setViewMode }: any) => setViewMode(_currentModelSubMode))
                .catch((err: any) => log.debug('controls setViewMode failed', err?.message || err));
            const container = document.getElementById('canvas-container');
            if (container) {
                // BUG-DARK-SPACE-001 (Calvin 2026-06-08): rAF unico disparava
                // antes do layout estabilizar (grid template rows muda quando
                // ribbon/ticker/constellation-hud aparecem), causando canvas
                // renderizado com dimensoes erradas + faixa preta visivel.
                // scheduleResizeSync da 3-trigger fallback (rAF + setTimeout
                // + transitionend) garantindo sync apos transition completar.
                const mainArea = document.getElementById('main-area');
                scheduleResizeSync(container, undefined, mainArea);
            }
        }
    } else if (group === VIEW_GROUPS.DATASTUDIO) {
        _currentView = VIEW_MODES.ACTIONS; // no specific sub-mode
        _updateViewModeBadge(_currentView);
        _pauseRenderLoop();
        try {
            const { hideHomeView } = await import('../ui/homeGrid.js' as string);
            hideHomeView();
        } catch (err: any) {
            log.debug('homeGrid hideHomeView failed', /** @type {any} */ (err)?.message || err);
        }
        // Lazy init Data Studio
        if (!_dataStudioReady && _dataStudioInitFn && !_dataStudioInitializing) {
            _dataStudioInitializing = true;
            _showLoadingInDataStudio();
            try {
                await _dataStudioInitFn();
                _dataStudioReady = true;
            } catch (e: any) {
                console.error(
                    '[ecbyts:viewRouter] Data Studio init failed:',
                    /** @type {any} */ (e)?.message,
                    /** @type {any} */ (e)?.stack,
                );
                _showDataStudioError();
            } finally {
                _dataStudioInitializing = false;
                _hideLoadingInDataStudio();
            }
        }
    }
    // Persist sub-mode for backward compat
    try {
        localStorage.setItem(LS_KEY, _currentView);
    } catch (e: any) {
        console.debug('[viewRouter] persistSubModeBC:', /** @type {any} */ (e)?.message || e);
        /* */
    }
    window.dispatchEvent(new CustomEvent('groupChanged', { detail: { group, from: fromGroup } }));
    window.dispatchEvent(new CustomEvent('viewChanged', { detail: { mode: _currentView, from: fromGroup } }));
}
/**
 * Switch between sub-modes within the model group.
 * If not currently in model group, switches to model first.
 * @param {string} mode
 * @param {Object} [opts]
 */
export async function switchView(mode: any, opts: any = {}) {
    if (!(/** @type {string[]} */ (VALID_MODES).includes(mode))) return;
    // If switching to 'actions', go to actions group
    if (mode === VIEW_MODES.ACTIONS) {
        await switchGroup(VIEW_GROUPS.ACTIONS, opts);
        return;
    }
    // For spatial modes (2d, 2d-depth, 3d), ensure we're in model group
    _currentModelSubMode = mode;
    if (_currentGroup !== VIEW_GROUPS.MODEL) {
        await switchGroup(VIEW_GROUPS.MODEL, opts);
        return; // switchGroup already applies the sub-mode
    }
    // Already in model group - just switch sub-mode
    if (mode === _currentView) return;
    _currentView = mode;
    // Persist
    try {
        localStorage.setItem(LS_KEY, mode);
    } catch (e: any) {
        console.debug('[viewRouter] persistSubMode:', /** @type {any} */ (e)?.message || e);
        /* */
    }
    // Track telemetry
    import('../telemetry/tracker.js' as string)
        .then(({ trackEvent }: any) => {
            trackEvent('toggle', 'view-mode', { from: _currentView, to: mode });
        })
        .catch((err: any) => log.debug('telemetry tracker (view-mode) failed', err?.message || err));
    _updateViewModeBadge(mode);
    // Handle specific spatial modes
    if (mode === VIEW_MODES.TWO_D_D && !_has2DDepthComponent()) {
        _showEmptyState2DD();
    } else {
        _hideEmptyState2DD();
        if (_sceneReady) {
            import('./controls.js' as string)
                .then(({ setViewMode }: any) => setViewMode(mode))
                .catch((err: any) =>
                    log.debug('controls setViewMode (submode) failed', err?.message || err),
                );
            const container = document.getElementById('canvas-container');
            if (container) {
                // BUG-DARK-SPACE-001: ver comentario equivalente em switchGroup.
                const mainArea = document.getElementById('main-area');
                scheduleResizeSync(container, undefined, mainArea);
            }
        }
    }
    window.dispatchEvent(new CustomEvent('viewChanged', { detail: { mode, from: _currentView } }));
}
/** @returns {string} Current group ID */
export function getCurrentGroup() {
    return _currentGroup;
}
/** @returns {string} Current view mode (backward compat) */
export function getCurrentView() {
    return _currentView;
}
/** @returns {boolean} */
export function isSceneReady() {
    return _sceneReady;
}
export function markSceneReady() {
    if (_sceneReady) return; // idempotent
    _sceneReady = true;
    // Fix #2 follow-up (2026-04-11): dispatch explicit ecbyts:sceneReady event
    // so modules (e.g. buildFullRandomModel step 31) can defer camera fit until
    // Three.js camera + controls actually exist. `groupChanged` is NOT enough
    // because switchGroup early-returns when the user already starts on the
    // target group (typical boot-random case). Scene readiness needs its own
    // dedicated signal.
    try {
        if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('ecbyts:sceneReady'));
        }
    } catch (e: any) {
        console.debug('[viewRouter] sceneReadyDispatch:', /** @type {any} */ (e)?.message || e);
        /* no DOM or CustomEvent — non-critical */
    }
}
/** @returns {boolean} */
export function isDataStudioReady() {
    return _dataStudioReady;
}
/** @returns {string[]} Ordered list of group IDs */
export function getGroupOrder() {
    return GROUP_ORDER;
}
// --- Internal: Chrome visibility ---
function _applyGroupChrome(group: any) {
    const app = document.getElementById('app');
    if (!app) return;
    // Remove all group classes
    app.classList.remove('view-group-actions', 'view-group-model', 'view-group-datastudio');
    app.classList.add(`view-group-${group}`);
}
// --- Internal: Render loop pause/resume ---
function _pauseRenderLoop() {
    if (_renderLoopPaused) return;
    _renderLoopPaused = true;
    window.dispatchEvent(new CustomEvent('renderLoopPause'));
}
function _resumeRenderLoop() {
    if (!_renderLoopPaused) return;
    _renderLoopPaused = false;
    window.dispatchEvent(new CustomEvent('renderLoopResume'));
}
// --- Internal: View mode badge ---
function _updateViewModeBadge(mode: any) {
    const labels: any = {
        [VIEW_MODES.ACTIONS]: t('viewActions') || 'Actions',
        [VIEW_MODES.TWO_D]: t('view2d') || '2D',
        [VIEW_MODES.TWO_D_D]: t('view2dDepth') || '2D+D',
        [VIEW_MODES.THREE_D]: t('view3d') || '3D',
    };
    const badge = document.getElementById('view-mode-badge');
    if (!badge) return;
    const modeLabel = labels[mode] || '3D';
    badge.textContent = modeLabel;
    badge.classList.toggle('active', mode !== VIEW_MODES.THREE_D);
    badge.setAttribute('aria-current', 'true');
    badge.setAttribute('aria-label', `Toggle view mode (current: ${modeLabel})`);
    badge.setAttribute('title', _hasWebGL ? modeLabel : 'WebGL unavailable');
    // Sync scene-hud view button
    const hudLabel = document.getElementById('scene-hud-view-label');
    if (hudLabel) hudLabel.textContent = modeLabel;
    const hudBtn = document.getElementById('scene-hud-view-btn');
    if (hudBtn) hudBtn.classList.toggle('active', mode !== VIEW_MODES.THREE_D);
}
function _checkWebGL() {
    try {
        const canvas = document.createElement('canvas');
        _hasWebGL = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch (e: any) {
        console.debug('[viewRouter] checkWebGL:', /** @type {any} */ (e)?.message || e);
        /* */
    }
}
function _has2DDepthComponent() {
    return false; // v1: cross-section component does not exist yet
}
// --- Internal: Loading / Error states ---
function _showEmptyState2DD() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    _hideEmptyState2DD();
    const el = document.createElement('div');
    el.id = 'empty-state-2dd';
    el.className = 'home-empty-state';
    el.setAttribute('data-testid', 'empty-state-2dd');
    const icon = document.createElement('span');
    icon.setAttribute('data-icon', 'layers');
    icon.setAttribute('data-icon-size', '48px');
    el.appendChild(icon);
    const h3 = document.createElement('h3');
    h3.textContent = t('emptyState2dd') || '2D+D Visualization';
    el.appendChild(h3);
    const p = document.createElement('p');
    p.textContent = t('emptyState2ddDesc') || 'This view requires depth data (wells, cross-sections).';
    el.appendChild(p);
    const btn = document.createElement('button');
    btn.textContent = t('backToActions') || 'Back to Actions';
    btn.addEventListener('click', () => switchGroup(VIEW_GROUPS.ACTIONS));
    el.appendChild(btn);
    container.appendChild(el);
    if (typeof window.hydrateIcons === 'function') window.hydrateIcons();
}
function _hideEmptyState2DD() {
    const el = document.getElementById('empty-state-2dd');
    if (el) el.remove();
}
function _showLoadingInCanvas() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    const el = document.createElement('div');
    el.id = 'home-3d-loading';
    el.className = 'home-3d-loading';
    el.setAttribute('data-testid', 'loading-3d');
    const spinner = document.createElement('div');
    spinner.className = 'home-3d-loading-spinner';
    el.appendChild(spinner);
    const span = document.createElement('span');
    span.textContent = t('loading3dScene') || 'Loading 3D scene...';
    el.appendChild(span);
    container.appendChild(el);
}
function _hideLoadingInCanvas() {
    const el = document.getElementById('home-3d-loading');
    if (el) el.remove();
}
function _showSceneError() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'home-empty-state';
    el.id = 'scene-error-state';
    const h3 = document.createElement('h3');
    h3.textContent = t('sceneError') || '3D scene failed to load';
    el.appendChild(h3);
    const p = document.createElement('p');
    p.textContent = t('sceneErrorDesc') || 'Try refreshing the page.';
    el.appendChild(p);
    const btn = document.createElement('button');
    btn.textContent = t('backToActions') || 'Back to Actions';
    btn.addEventListener('click', () => switchGroup(VIEW_GROUPS.ACTIONS));
    el.appendChild(btn);
    container.appendChild(el);
}
function _showLoadingInDataStudio() {
    const container = document.getElementById('datastudio-container');
    if (!container) return;
    const el = document.createElement('div');
    el.id = 'datastudio-loading';
    el.className = 'home-3d-loading';
    el.setAttribute('data-testid', 'loading-datastudio');
    const spinner = document.createElement('div');
    spinner.className = 'home-3d-loading-spinner';
    el.appendChild(spinner);
    const span = document.createElement('span');
    span.textContent = t('loadingDataStudio') || 'Loading Data Studio...';
    el.appendChild(span);
    container.appendChild(el);
}
function _hideLoadingInDataStudio() {
    const el = document.getElementById('datastudio-loading');
    if (el) el.remove();
}
function _showDataStudioError() {
    const container = document.getElementById('datastudio-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'home-empty-state';
    el.id = 'datastudio-error-state';
    const h3 = document.createElement('h3');
    h3.textContent = t('dataStudioError') || 'Data Studio failed to load';
    el.appendChild(h3);
    const p = document.createElement('p');
    p.textContent = t('dataStudioErrorDesc') || 'Check your connection and try again.';
    el.appendChild(p);
    const btn = document.createElement('button');
    btn.textContent = t('backToActions') || 'Back to Actions';
    btn.addEventListener('click', () => switchGroup(VIEW_GROUPS.ACTIONS));
    el.appendChild(btn);
    container.appendChild(el);
}
