// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * HomeGrid Constellation HUD hosting for the Actions Shell.
 * Extracted from app/js/utils/ui/homeGrid.js per SPLIT-HOMEGRID-001 S5.
 */

import { getSelectedElement } from '../../../core/elements/manager.js';
import { safeSetItem } from '../../storage/storageMonitor.js';
import { getActiveConstellationTab } from '../../scene/constellationTable.js';
import {
    initConstellation,
    syncConstellationLayout,
    switchToCanvasMode,
    updateConstellationImmediate,
} from '../../scene/constellation.js';
import {
    buildFirstGraphPaintDetail,
    buildRedockTelemetryDetail,
    computeDockedConstellationHeightPx,
} from './homeConstellationHostHelpers.js';

let _options: any = {
    getShellRight: () => null,
    isActive: () => true,
    getOpenedAt: () => 0,
    dispatchTelemetry: (..._args: any[]) => {},
};

/** @type {any} */
let _hostedConstellationRefreshTimer: any = null;
/** @type {AbortController | null} */
let _abortController: any = null;
let _firstGraphPaintDispatched = false;

/** @type {any} */
const _constellationHostState: any = {
    originalParent: null,
    originalNextSibling: null,
    originalDisplay: '',
    wasCollapsed: false,
    previousTab: 'graph',
};

/**
 * @param {Partial<typeof _options>} [options]
 */
export function initConstellationHost(options: any = {}) {
    destroyConstellationHost();
    _options = {
        getShellRight: typeof options.getShellRight === 'function' ? options.getShellRight : () => null,
        isActive: typeof options.isActive === 'function' ? options.isActive : () => true,
        getOpenedAt: typeof options.getOpenedAt === 'function' ? options.getOpenedAt : () => 0,
        dispatchTelemetry: typeof options.dispatchTelemetry === 'function' ? options.dispatchTelemetry : () => {},
    };
    _abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const listenerOptions = _abortController ? { signal: _abortController.signal } : undefined;
    for (const eventName of [
        'ecbt:elementAdded',
        'ecbt:elementUpdated',
        'ecbt:elementsCleared',
        'elementAdded',
        'edgesChanged',
    ]) {
        window.addEventListener(eventName, () => scheduleHostedConstellationGraphRefresh(true), listenerOptions);
    }
}

export function destroyConstellationHost() {
    if (_hostedConstellationRefreshTimer) {
        window.clearTimeout(_hostedConstellationRefreshTimer);
        _hostedConstellationRefreshTimer = null;
    }
    _abortController?.abort();
    _abortController = null;
}

export function resetConstellationHostTelemetry() {
    _firstGraphPaintDispatched = false;
}

function _getConstellationHud() {
    return document.getElementById('constellation-hud');
}

function _getWindowBridge() {
    return /** @type {any} */ window;
}

/**
 * @param {any} hud
 */
function _normalizeConstellationDockedState(hud: any) {
    if (!hud) return;
    const win = _getWindowBridge();

    if (typeof win.dockConstellation === 'function') {
        win.dockConstellation();
    } else {
        hud.classList.remove('panel-floating');
        hud.style.removeProperty('position');
        hud.style.removeProperty('left');
        hud.style.removeProperty('right');
        hud.style.removeProperty('bottom');
        hud.style.removeProperty('top');
        hud.style.removeProperty('width');
        hud.style.removeProperty('height');
        hud.style.removeProperty('z-index');
        hud.style.display = '';
        document.getElementById('min-tab-constellation')?.remove();
    }
}

/**
 * @param {boolean} [forceRebuild]
 */
function _dispatchActionsFirstGraphPaintTelemetry(forceRebuild: any = false) {
    if (_firstGraphPaintDispatched) return;
    _firstGraphPaintDispatched = true;
    const hud = _getConstellationHud();
    const canvas = document.getElementById('constellation-canvas');
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const openedAt = _options.getOpenedAt();
    _options.dispatchTelemetry(
        'actions:integration:first-graph-paint',
        buildFirstGraphPaintDetail({
            forceRebuild,
            hosted: hud?.classList.contains('actions-shell-constellation-hosted') === true,
            elapsedMs: openedAt ? now - openedAt : null,
            canvasWidth: canvas instanceof HTMLCanvasElement ? canvas.width : 0,
            canvasHeight: canvas instanceof HTMLCanvasElement ? canvas.height : 0,
        } as any),
    );
}

/**
 * @param {any} hud
 */
function _dispatchModelConstellationRedockedTelemetry(hud: any) {
    _options.dispatchTelemetry(
        'model:constellation:redocked',
        buildRedockTelemetryDetail({
            parentId: hud?.parentElement?.id || '',
            previousTab: _constellationHostState.previousTab || 'graph',
        }),
    );
}

export function scheduleConstellationLayoutSync(forceRebuild: any = false) {
    const win = _getWindowBridge();
    if (typeof win.syncConstellationLayout !== 'function') return;
    const syncHostedLayout = () => {
        const painted = win.syncConstellationLayout(forceRebuild);
        if (painted && isConstellationHostedInActionsShell()) {
            _dispatchActionsFirstGraphPaintTelemetry(forceRebuild);
        }
    };
    requestAnimationFrame(syncHostedLayout);
    requestAnimationFrame(() => requestAnimationFrame(syncHostedLayout));
}

export function isConstellationHostedInActionsShell() {
    return _getConstellationHud()?.classList.contains('actions-shell-constellation-hosted') === true;
}

function _refreshHostedConstellationGraph(forceRebuild: any = true) {
    const hud = _getConstellationHud();
    if (!hud || !hud.classList.contains('actions-shell-constellation-hosted')) return;
    const win = _getWindowBridge();
    if (typeof win.syncConstellationLayout !== 'function') {
        initConstellation({
            onSelect: /** @param {any} hud */ (elementId: any) => win.handleSelectElement?.(elementId),
        });
    }
    hud.classList.remove('constellation-collapsed');
    win.switchConstellationTab?.('graph', { persist: false });
    switchToCanvasMode();
    updateConstellationImmediate(getSelectedElement() || null);
    const painted = syncConstellationLayout(forceRebuild) as any;
    if (painted) {
        _dispatchActionsFirstGraphPaintTelemetry(forceRebuild);
    }
    scheduleConstellationLayoutSync(forceRebuild);
}

export function scheduleHostedConstellationGraphRefresh(forceRebuild: any = true) {
    if (!_options.isActive() || !isConstellationHostedInActionsShell()) return;
    window.clearTimeout(_hostedConstellationRefreshTimer);
    _hostedConstellationRefreshTimer = window.setTimeout(() => {
        _hostedConstellationRefreshTimer = null;
        _refreshHostedConstellationGraph(forceRebuild);
    }, 80);
}

/**
 * @param {any} hud
 */
function _scheduleHostedConstellationExpand(hud: any) {
    if (!hud) return;
    requestAnimationFrame(() => hud.classList.remove('constellation-collapsed'));
    requestAnimationFrame(() => requestAnimationFrame(() => hud.classList.remove('constellation-collapsed')));
}

function _getDockedConstellationHeightPx() {
    let savedHeight: any = null;
    try {
        savedHeight = localStorage.getItem('ecbyts-constellation-height') || null;
    } catch (e: any) {
        console.debug('[homeConstellationHost] sidebarHeight-restore:', /** @type {any} */ e?.message || e);
    }
    return computeDockedConstellationHeightPx({
        innerHeight: window.innerHeight || 0,
        clientHeight: document.documentElement?.clientHeight || 0,
        savedHeight,
    });
}

/**
 * @param {any} hud
 */
function _expandDockedConstellationHud(hud: any) {
    if (!hud) return;
    hud.classList.remove('constellation-collapsed');
    document
        .getElementById('main-area')
        ?.style.setProperty('--bottom-panel-height', `${_getDockedConstellationHeightPx()}px`);
    safeSetItem('ecbyts-constellation-collapsed', '');
}

export function hostConstellationInActionsShell() {
    const shellRightEl = _options.getShellRight();
    if (!shellRightEl) return;
    const hud = _getConstellationHud();
    if (!hud) return;
    const wasHosted = hud.classList.contains('actions-shell-constellation-hosted');

    if (!_constellationHostState.originalParent) {
        _constellationHostState.originalParent = hud.parentElement;
        _constellationHostState.originalNextSibling = hud.nextSibling;
        _constellationHostState.originalDisplay = hud.style.display || '';
        _constellationHostState.wasCollapsed = hud.classList.contains('constellation-collapsed');
    }
    if (!wasHosted) {
        _constellationHostState.previousTab = getActiveConstellationTab?.() || 'graph';
    }

    _normalizeConstellationDockedState(hud);
    shellRightEl.classList.add('actions-shell-right--constellation');
    hud.classList.add('actions-shell-constellation-hosted');
    hud.classList.remove('constellation-collapsed');
    hud.style.display = '';
    if (shellRightEl.firstChild !== hud || shellRightEl.childNodes.length !== 1) {
        shellRightEl.replaceChildren(hud);
    }
    _scheduleHostedConstellationExpand(hud);
    _refreshHostedConstellationGraph(true);
    requestAnimationFrame(() => _refreshHostedConstellationGraph(true));
    requestAnimationFrame(() => requestAnimationFrame(() => _refreshHostedConstellationGraph(true)));
}

export function restoreHostedConstellation() {
    const hud = _getConstellationHud();
    if (!hud) return;
    const win = _getWindowBridge();
    const shellRightEl = _options.getShellRight();
    const wasHosted =
        hud.classList.contains('actions-shell-constellation-hosted') === true || hud.parentElement === shellRightEl;

    hud.classList.remove('actions-shell-constellation-hosted');
    shellRightEl?.classList.remove('actions-shell-right--constellation');

    const originalParent = _constellationHostState.originalParent || document.getElementById('main-area');
    const originalNextSibling = _constellationHostState.originalNextSibling;
    if (!originalParent) return;

    if (hud.parentElement === originalParent) {
        _normalizeConstellationDockedState(hud);
        _expandDockedConstellationHud(hud);
        win.switchConstellationTab?.(_constellationHostState.previousTab || 'graph', { persist: false });
        scheduleConstellationLayoutSync(true);
        if (wasHosted) _dispatchModelConstellationRedockedTelemetry(hud);
        return;
    }

    if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
        originalParent.insertBefore(hud, originalNextSibling);
    } else {
        originalParent.appendChild(hud);
    }
    _normalizeConstellationDockedState(hud);
    _expandDockedConstellationHud(hud);
    win.switchConstellationTab?.(_constellationHostState.previousTab || 'graph', { persist: false });
    scheduleConstellationLayoutSync(true);
    if (wasHosted) _dispatchModelConstellationRedockedTelemetry(hud);
}
