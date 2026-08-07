// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   HOME GRID — Actions Shell Layout Controller (homeShell subdomain)

   ARCH-SPLIT-HOMEGRID-001 (SPEC_SPLIT_HOMEGRID S6 shellRoot slice).
   DOM/wire layer extracted from the homeGrid.ts barrel WITHOUT behaviour
   change. It owns the three-pane Actions Shell splitter/resize/layout
   runtime: pointer drag, keyboard nudge, breakpoint refresh, persistence,
   ARIA wiring, and the actions-group telemetry session.

   Pure math lives in `_homeActionsShellLayoutPure.ts` (already extracted);
   this controller is the imperative shell around it. State that previously
   lived as module-level `let` in the barrel (layout state, drag state, rAF
   frame handle, bound flags, telemetry session) now lives inside the
   controller closure. The barrel keeps the public API identical by
   delegating to the controller instance.

   Spec NOT:
   - NÃO mover a matemática pura (já em _homeActionsShellLayoutPure.ts)
   - NÃO conhecer marketplace/identity/eis/cards — só o shell de Actions
   - NÃO emoji em strings de UI
   ================================================================ */

import { safeJsonParse } from '../../helpers/safeJsonParse.js';
import {
    computeActionsShellConstraints as _pureComputeActionsShellConstraints,
    clampActionsShellLayout as _pureClampActionsShellLayout,
    computeActionsShellKeyboardStep as _pureComputeActionsShellKeyboardStep,
    isActionsLayoutResizable as _pureIsActionsLayoutResizable,
    getActionsLayoutBreakpoint as _pureGetActionsLayoutBreakpoint,
} from '../_homeActionsShellLayoutPure.js';

const LS_ACTIONS_LAYOUT = 'ecbyts-actions-layout-v1';

/**
 * Context handed in by the barrel. Accessors keep the controller decoupled
 * from the barrel's module-level DOM refs (which are reassigned on rebuild).
 */
export interface ActionsShellLayoutContext {
    getShellRoot: () => any;
    getLeftSplitter: () => any;
    getRightSplitter: () => any;
    getRightShell: () => any;
    isActive: () => boolean;
    scheduleConstellationLayoutSync: (forceRebuild?: boolean) => void;
    restoreHostedConstellation: () => void;
    resetConstellationHostTelemetry: () => void;
    renderActionsRelationsPanel: (container: any) => void;
}

export interface ActionsShellLayoutController {
    bindGroupSync: () => void;
    isActionsGroupActive: () => boolean;
    dispatchTelemetry: (eventName: any, detail?: any) => void;
    dispatchOpenedTelemetry: () => void;
    resetSessionTelemetry: () => void;
    getOpenedAt: () => number;
    refreshLayout: (opts?: { forceDefault?: boolean }) => void;
    resetLayout: () => void;
    applyLayout: (layout: any, opts?: { persist?: boolean; syncGraph?: boolean }) => void;
    getLayoutState: () => any;
}

/**
 * Creates the Actions Shell layout controller. Behaviour is identical to the
 * inline implementation previously hosted in homeGrid.ts — only the home of
 * the closure state changed.
 *
 * @param {ActionsShellLayoutContext} ctx
 * @returns {ActionsShellLayoutController}
 */
export function createActionsShellLayoutController(ctx: ActionsShellLayoutContext): ActionsShellLayoutController {
    // --- Controller-owned state (previously barrel module-level `let`) ---
    let _actionsShellGroupSyncBound = false;
    let _actionsShellLayoutBound = false;
    let _actionsShellLayoutState: any = null;
    let _actionsShellLayoutDrag: any = null;
    let _actionsShellLayoutFrame = 0;
    let _actionsOpenedTelemetryActive = false;
    let _actionsOpenedAt = 0;

    function _bindActionsShellGroupSync() {
        if (_actionsShellGroupSyncBound || typeof window === 'undefined') return;
        _actionsShellGroupSyncBound = true;
        window.addEventListener(
            'groupChanged',
            /** @param {any} event */ (event: any) => {
                const group = event?.detail?.group;
                if (group === 'actions') {
                    _dispatchActionsOpenedTelemetry();
                    ctx.renderActionsRelationsPanel(ctx.getRightShell());
                    return;
                }
                _resetActionsSessionTelemetry();
                ctx.restoreHostedConstellation();
            },
        );
    }

    function _isActionsGroupActive() {
        return document.getElementById('app')?.classList.contains('view-group-actions') === true;
    }

    /**
     * @param {any} eventName
     */
    function _dispatchActionsTelemetry(eventName: any, detail: any = {}) {
        const now = Date.now();
        window.dispatchEvent(
            new CustomEvent(eventName, {
                detail: {
                    source: 'actions-shell',
                    tabId: 'actions',
                    timestamp: now,
                    performanceNow: typeof performance !== 'undefined' ? Math.round(performance.now()) : null,
                    ...detail,
                },
            }),
        );
    }

    function _dispatchActionsOpenedTelemetry() {
        if (_actionsOpenedTelemetryActive) return;
        _actionsOpenedTelemetryActive = true;
        ctx.resetConstellationHostTelemetry();
        _actionsOpenedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        _dispatchActionsTelemetry('actions:opened', {
            breakpoint: _getActionsLayoutBreakpoint(),
            resizable: _isActionsLayoutResizable(),
        });
    }

    function _resetActionsSessionTelemetry() {
        _actionsOpenedTelemetryActive = false;
        ctx.resetConstellationHostTelemetry();
        _actionsOpenedAt = 0;
    }

    function _getActionsLayoutBreakpoint() {
        if (typeof window === 'undefined') return 'desktop';
        return _pureGetActionsLayoutBreakpoint(window.innerWidth || 0);
    }

    function _isActionsLayoutResizable() {
        if (typeof window === 'undefined') return false;
        return _pureIsActionsLayoutResizable(window.innerWidth || 0);
    }

    function _readActionsLayoutStore() {
        const parsed = safeJsonParse<any>(localStorage.getItem(LS_ACTIONS_LAYOUT), null, 'homeGrid-readActionsLayout');
        return parsed && typeof parsed === 'object' ? parsed : {};
    }

    /**
     * @param {any} store
     */
    function _writeActionsLayoutStore(store: any) {
        try {
            localStorage.setItem(LS_ACTIONS_LAYOUT, JSON.stringify(store));
        } catch (e: any) {
            console.debug('[homeGrid] writeActionsLayout:', /** @type {any} */ (e)?.message || e);
            /* no-op */
        }
    }

    function _getActionsShellWidth() {
        const root = ctx.getShellRoot();
        if (!root) return 0;
        return Math.round(root.getBoundingClientRect().width || root.clientWidth || 0);
    }

    function _getActionsShellGapWidth() {
        const root = ctx.getShellRoot();
        if (!root || typeof window === 'undefined') return 0;
        const styles = window.getComputedStyle(root);
        const rawGap = styles.columnGap || styles.gap || '0';
        const gap = Number.parseFloat(rawGap);
        return Number.isFinite(gap) ? gap : 0;
    }

    /**
     * @param {any} rootWidth
     */
    function _getActionsShellConstraints(rootWidth: any, { resizable = _isActionsLayoutResizable() } = {}) {
        return _pureComputeActionsShellConstraints(rootWidth, _getActionsShellGapWidth(), { resizable });
    }

    function _getActionsShellKeyboardStep({ boost = false }: any = {}) {
        return _pureComputeActionsShellKeyboardStep(_getActionsShellWidth(), { boost });
    }

    /**
     * @param {any} rootWidth
     */
    function _computeDefaultActionsShellLayout(rootWidth: any, { resizable = _isActionsLayoutResizable() } = {}) {
        const constraints = _getActionsShellConstraints(rootWidth, { resizable });
        return _clampActionsShellLayout({ left: constraints.targetLeft, right: constraints.targetRight }, rootWidth, {
            resizable,
        });
    }

    /**
     * @param {any} layout
     * @param {any} rootWidth
     */
    function _clampActionsShellLayout(layout: any, rootWidth: any, { resizable = _isActionsLayoutResizable() } = {}) {
        return _pureClampActionsShellLayout(layout, rootWidth, _getActionsShellGapWidth(), { resizable });
    }

    /**
     * @param {any} layout
     */
    function _updateActionsShellSplitterA11y(layout: any) {
        const rootWidth = _getActionsShellWidth();
        const constraints = _getActionsShellConstraints(rootWidth, { resizable: true });
        const leftSplitter = ctx.getLeftSplitter();
        const rightSplitter = ctx.getRightSplitter();
        if (leftSplitter) {
            leftSplitter.setAttribute('aria-label', 'Resize left panel');
            leftSplitter.setAttribute('aria-valuemin', String(constraints.leftMin));
            leftSplitter.setAttribute('aria-valuemax', String(constraints.leftMax));
            leftSplitter.setAttribute('aria-valuenow', String(layout.left));
        }
        if (rightSplitter) {
            rightSplitter.setAttribute('aria-label', 'Resize right panel');
            rightSplitter.setAttribute('aria-valuemin', String(constraints.rightMin));
            rightSplitter.setAttribute('aria-valuemax', String(constraints.rightMax));
            rightSplitter.setAttribute('aria-valuenow', String(layout.right));
        }
    }

    /**
     * @param {any} layout
     */
    function _persistActionsShellLayout(layout: any) {
        if (!_isActionsLayoutResizable()) return;
        const store = _readActionsLayoutStore();
        store[_getActionsLayoutBreakpoint()] = layout;
        _writeActionsLayoutStore(store);
    }

    /**
     * @param {any} layout
     */
    function _applyActionsShellLayout(layout: any, { persist = false, syncGraph = true }: any = {}) {
        const root = ctx.getShellRoot();
        if (!root) return;
        const rootWidth = _getActionsShellWidth();
        if (rootWidth <= 0) return;

        const shouldResize = _isActionsLayoutResizable();
        const nextLayout = _clampActionsShellLayout(
            shouldResize ? layout : _computeDefaultActionsShellLayout(rootWidth),
            rootWidth,
            { resizable: shouldResize },
        );
        const constraints = _getActionsShellConstraints(rootWidth, { resizable: shouldResize });

        _actionsShellLayoutState = nextLayout;
        root.dataset.actionsLayoutBreakpoint = _getActionsLayoutBreakpoint();
        root.classList.toggle('actions-shell--resize-disabled', !shouldResize);
        root.classList.toggle('actions-shell--resize-enabled', shouldResize);
        root.style.setProperty('--actions-left-width', `${nextLayout.left}px`);
        root.style.setProperty('--actions-right-width', `${nextLayout.right}px`);
        root.style.setProperty('--actions-main-min', `${constraints.mainMin}px`);
        root.style.setProperty('--actions-splitter-track-size', `${constraints.splitterTrackSize}px`);
        _updateActionsShellSplitterA11y(nextLayout);

        if (persist) {
            _persistActionsShellLayout(nextLayout);
        }

        if (syncGraph && ctx.isActive() && _isActionsGroupActive()) {
            ctx.scheduleConstellationLayoutSync(true);
        }
    }

    function _refreshActionsShellLayout({ forceDefault = false }: any = {}) {
        const root = ctx.getShellRoot();
        if (!root) return;
        const rootWidth = _getActionsShellWidth();
        if (rootWidth <= 0) return;
        const resizable = _isActionsLayoutResizable();
        const breakpoint = _getActionsLayoutBreakpoint();
        const store = _readActionsLayoutStore();
        const breakpointChanged = root.dataset.actionsLayoutBreakpoint !== breakpoint;
        const saved = !forceDefault && resizable ? store[breakpoint] : null;
        const baseLayout = breakpointChanged
            ? saved || _computeDefaultActionsShellLayout(rootWidth)
            : saved || _actionsShellLayoutState || _computeDefaultActionsShellLayout(rootWidth);
        _applyActionsShellLayout(baseLayout, {
            persist: false,
        });
    }

    function _scheduleActionsShellLayoutRefresh() {
        if (_actionsShellLayoutFrame) {
            cancelAnimationFrame(_actionsShellLayoutFrame);
        }
        _actionsShellLayoutFrame = requestAnimationFrame(() => {
            _actionsShellLayoutFrame = 0;
            _refreshActionsShellLayout();
        });
    }

    /**
     * @param {any} isDragging
     */
    function _setActionsShellSplitterDragging(isDragging: any) {
        ctx.getLeftSplitter()?.classList.toggle('is-dragging', isDragging);
        ctx.getRightSplitter()?.classList.toggle('is-dragging', isDragging);
        document.body.classList.toggle('actions-shell-resizing', isDragging);
    }

    /**
     * @param {any} clientX
     */
    function _handleActionsShellDragMove(clientX: any) {
        if (!_actionsShellLayoutDrag || !ctx.getShellRoot()) return;
        const dx = clientX - _actionsShellLayoutDrag.startX;
        if (_actionsShellLayoutDrag.side === 'left') {
            _applyActionsShellLayout(
                { left: _actionsShellLayoutDrag.startLeft + dx, right: _actionsShellLayoutDrag.startRight },
                { persist: false, syncGraph: false },
            );
            return;
        }
        _applyActionsShellLayout(
            { left: _actionsShellLayoutDrag.startLeft, right: _actionsShellLayoutDrag.startRight - dx },
            { persist: false, syncGraph: false },
        );
    }

    /**
     * @param {any} side
     * @param {any} clientX
     */
    function _startActionsShellResize(side: any, clientX: any) {
        if (!_isActionsLayoutResizable() || !_actionsShellLayoutState) return;
        _actionsShellLayoutDrag = {
            side,
            startX: clientX,
            startLeft: _actionsShellLayoutState.left,
            startRight: _actionsShellLayoutState.right,
        };
        _setActionsShellSplitterDragging(true);

        const onMove = /** @param {any} delta */ (event: any) => _handleActionsShellDragMove(event.clientX);
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            _setActionsShellSplitterDragging(false);
            if (_actionsShellLayoutState) {
                _persistActionsShellLayout(_actionsShellLayoutState);
                window.dispatchEvent(
                    new CustomEvent('actions:layout:resized', {
                        detail: { left: _actionsShellLayoutState.left, right: _actionsShellLayoutState.right },
                    }),
                );
            }
            _actionsShellLayoutDrag = null;
            ctx.scheduleConstellationLayoutSync(true);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }

    /**
     * @param {any} delta
     * @param {any} delta
     */
    function _adjustActionsShellLayout(side: any, delta: any) {
        if (!_isActionsLayoutResizable() || !_actionsShellLayoutState) return;
        const next =
            side === 'left'
                ? { left: _actionsShellLayoutState.left + delta, right: _actionsShellLayoutState.right }
                : { left: _actionsShellLayoutState.left, right: _actionsShellLayoutState.right + delta };
        _applyActionsShellLayout(next, { persist: true, syncGraph: false });
        window.dispatchEvent(
            new CustomEvent('actions:layout:resized', {
                detail: { left: _actionsShellLayoutState.left, right: _actionsShellLayoutState.right, via: 'keyboard' },
            }),
        );
        ctx.scheduleConstellationLayoutSync(true);
    }

    function _resetActionsShellLayout() {
        const rootWidth = _getActionsShellWidth();
        if (rootWidth <= 0) return;
        const defaults = _computeDefaultActionsShellLayout(rootWidth);
        _applyActionsShellLayout(defaults, { persist: true });
        window.dispatchEvent(
            new CustomEvent('actions:layout:reset', {
                detail: { left: defaults.left, right: defaults.right },
            }),
        );
    }

    function _bindActionsShellLayout() {
        if (_actionsShellLayoutBound || typeof window === 'undefined') return;
        _actionsShellLayoutBound = true;
        window.addEventListener('resize', _scheduleActionsShellLayoutRefresh);

        for (const entry of [
            { el: ctx.getLeftSplitter(), side: 'left' },
            { el: ctx.getRightSplitter(), side: 'right' },
        ]) {
            entry.el?.addEventListener(
                'pointerdown',
                /** @param {any} event */ (event: any) => {
                    event.preventDefault();
                    _startActionsShellResize(entry.side, event.clientX);
                },
            );
            entry.el?.addEventListener('dblclick', () => _resetActionsShellLayout());
            entry.el?.addEventListener(
                'keydown',
                /** @param {any} event */ (event: any) => {
                    const step = _getActionsShellKeyboardStep({ boost: event.shiftKey });
                    if (entry.side === 'left') {
                        if (event.key === 'ArrowLeft') {
                            event.preventDefault();
                            _adjustActionsShellLayout('left', -step);
                        } else if (event.key === 'ArrowRight') {
                            event.preventDefault();
                            _adjustActionsShellLayout('left', step);
                        }
                        return;
                    }
                    if (event.key === 'ArrowLeft') {
                        event.preventDefault();
                        _adjustActionsShellLayout('right', step);
                    } else if (event.key === 'ArrowRight') {
                        event.preventDefault();
                        _adjustActionsShellLayout('right', -step);
                    }
                },
            );
        }
    }

    return {
        bindGroupSync: _bindActionsShellGroupSync,
        isActionsGroupActive: _isActionsGroupActive,
        dispatchTelemetry: _dispatchActionsTelemetry,
        dispatchOpenedTelemetry: _dispatchActionsOpenedTelemetry,
        resetSessionTelemetry: _resetActionsSessionTelemetry,
        getOpenedAt: () => _actionsOpenedAt,
        refreshLayout: _refreshActionsShellLayout,
        resetLayout: _resetActionsShellLayout,
        applyLayout: _applyActionsShellLayout,
        getLayoutState: () => _actionsShellLayoutState,
        // Internal binder exposed for the barrel's _buildInteractionShell wiring.
        bindLayout: _bindActionsShellLayout,
    } as ActionsShellLayoutController & { bindLayout: () => void };
}
