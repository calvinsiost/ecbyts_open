// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Home Layout Controller — orquestra zoning + density + column resize
// para SPEC_HOME_REDESIGN_3COL_V3. Hand-authored R1-safe.
// Single API que caller chama de home-view boot.
//
// Spec NOT:
// - NÃO reimplementar zoning/density/resize math (delega aos 4 modules)
// - NÃO bind DOM events globais (caller responsável)
// - NÃO emoji em strings

import {
    readPersistedHomePrefs,
    writeHomePrefs,
    applyHomeZoningToMainArea,
    clearHomeZoningFromMainArea,
    installHomeZoningResizeListener,
} from './homeZoningAdapter.js';
import { resolveDensityMode, buildDensityCSSVars, toggleDensity } from './homeDensityModel.js';
import { calcDragWidth, buildResizeHandleVM, resetColumnWidth } from './homeColumnResize.js';

const MAIN_AREA_ID = 'main-area';

/**
 * Resolve density mode atual de localStorage prefs.
 * @returns {string}
 */
function _currentDensity() {
    const prefs = readPersistedHomePrefs();
    return resolveDensityMode(prefs?.density);
}

/**
 * Aplica CSS custom properties de density inline em #main-area.
 * @param {string} mode
 * @returns {boolean}
 */
export function applyHomeDensity(mode: any) {
    if (typeof document === 'undefined') return false;
    const mainArea = document.getElementById(MAIN_AREA_ID);
    if (!mainArea) return false;
    const vars = buildDensityCSSVars(mode);
    try {
        for (const [k, v] of Object.entries(vars)) {
            mainArea.style.setProperty(k, v);
        }
        mainArea.dataset.homeDensity = resolveDensityMode(mode);
        return true;
    } catch (e: any) {
        console.debug('[homeLayoutController:density]', e?.message || e);
        return false;
    }
}

/**
 * Posiciona um handle absolutamente no boundary entre cols do #main-area.
 * Lê widths persistidos para calcular x position.
 * @param {HTMLDivElement} handle
 * @param {'left'|'right'} column
 * @param {HTMLElement} mainArea
 */
function _positionResizeHandle(handle: any, column: any, mainArea: any) {
    try {
        const prefs = readPersistedHomePrefs();
        const leftWidth = prefs?.widths?.left ?? resetColumnWidth('left');
        const rightWidth = prefs?.widths?.right ?? resetColumnWidth('right');
        const totalWidth = mainArea.offsetWidth || 0;
        // Handle 4px largura, centrado no boundary (offset -2)
        const leftPx = column === 'left' ? leftWidth - 2 : totalWidth - rightWidth - 2;
        handle.style.left = String(leftPx) + 'px';
    } catch (e: any) {
        console.debug('[homeLayoutController:positionHandle]', e?.message || e);
    }
}

/**
 * Instala 2 elementos divisor (left|right) em #main-area com drag handlers.
 * Reposiciona em window resize. Retorna cleanup que remove handles + listeners.
 * Skip se main-area não existe ou está em modo stacked.
 * @returns {Function} cleanup
 */
export function installColumnResizers() {
    if (typeof document === 'undefined') return () => {};
    const mainArea = document.getElementById(MAIN_AREA_ID);
    if (!mainArea) return () => {};
    // Garante position:relative para os handles absolutos funcionarem
    const prevPosition = mainArea.style.position;
    if (!prevPosition || prevPosition === 'static') {
        mainArea.style.position = 'relative';
    }
    const handles: any[] = [];
    const cleanups: any[] = [];
    const columns: any[] = ['left', 'right'];
    for (const column of columns) {
        const handle = document.createElement('div');
        handle.className = 'home-col-resize-handle';
        handle.dataset.column = column;
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'vertical');
        handle.setAttribute('aria-label', 'Redimensionar coluna ' + column);
        handle.tabIndex = 0;
        mainArea.appendChild(handle);
        handles.push(handle);
        _positionResizeHandle(handle, column, mainArea);
        const onMouseDown = (event: any) => {
            try {
                event.preventDefault();
                const drag = createColumnResizeDrag(column);
                const onMove = (e: any) => {
                    drag.onMove(e);
                    _positionResizeHandle(handle, column, mainArea);
                };
                const onUp = (e: any) => {
                    drag.onEnd(e);
                    _positionResizeHandle(handle, column, mainArea);
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            } catch (e: any) {
                console.debug('[homeLayoutController:resizeDrag]', e?.message || e);
            }
        };
        handle.addEventListener('mousedown', onMouseDown);
        cleanups.push(() => handle.removeEventListener('mousedown', onMouseDown));
    }
    const onWindowResize = () => {
        for (const handle of handles) {
            _positionResizeHandle(handle, handle.dataset.column, mainArea);
        }
    };
    window.addEventListener('resize', onWindowResize);
    cleanups.push(() => window.removeEventListener('resize', onWindowResize));
    return () => {
        for (const fn of cleanups) {
            try {
                fn();
            } catch (e: any) {
                console.debug('[homeLayoutController:cleanupHandle]', e?.message || e);
            }
        }
        for (const handle of handles) {
            try {
                handle.remove();
            } catch (e: any) {
                console.debug('[homeLayoutController:removeHandle]', e?.message || e);
            }
        }
        if (!prevPosition || prevPosition === 'static') {
            mainArea.style.removeProperty('position');
        }
    };
}

/**
 * Boot completo: ler prefs + aplicar zoning + density + install resize listener + install column resizers.
 * Caller chama em home-view boot.
 * @returns {{cleanup:Function}}
 */
export function bootHomeLayout() {
    const prefs = readPersistedHomePrefs();
    applyHomeZoningToMainArea({ prefs });
    applyHomeDensity(prefs?.density);
    const cleanupResize = installHomeZoningResizeListener();
    const cleanupColumnResizers = installColumnResizers();
    return {
        cleanup: () => {
            try {
                cleanupColumnResizers?.();
                cleanupResize?.();
                clearHomeZoningFromMainArea();
            } catch (e: any) {
                console.debug('[homeLayoutController:cleanup]', e?.message || e);
            }
        },
    };
}

/**
 * Toggle density mode + persist + re-apply CSS vars.
 * @returns {string} novo mode
 */
export function toggleHomeDensity() {
    const current = _currentDensity();
    const next = toggleDensity(current);
    const prefs = readPersistedHomePrefs();
    writeHomePrefs({ ...prefs, density: next });
    applyHomeDensity(next);
    return next;
}

/**
 * Drag handler factory para column resize.
 * Caller chama no mousedown do resize handle; recebe handlers move+end.
 * @param {'left'|'right'} column
 * @returns {{onMove:Function, onEnd:Function}}
 */
export function createColumnResizeDrag(column: any) {
    const prefs = readPersistedHomePrefs();
    const startWidth = prefs?.widths?.[column] ?? resetColumnWidth(column);
    let startX: any = null;
    return {
        onMove: (event: any) => {
            if (startX === null) startX = event?.clientX ?? 0;
            const deltaX = (event?.clientX ?? 0) - startX;
            const width = calcDragWidth({ startWidth, deltaX, column });
            const widths = { ...(prefs?.widths || {}), [column]: width };
            applyHomeZoningToMainArea({ prefs: { ...prefs, widths } });
        },
        onEnd: (event: any) => {
            const deltaX = (event?.clientX ?? 0) - (startX ?? 0);
            const width = calcDragWidth({ startWidth, deltaX, column });
            const widths = { ...(prefs?.widths || {}), [column]: width };
            writeHomePrefs({ ...prefs, widths });
            applyHomeZoningToMainArea({ prefs: { ...prefs, widths } });
        },
    };
}

/**
 * Reset full layout para defaults.
 */
export function resetHomeLayout() {
    const prefs = readPersistedHomePrefs();
    const reset = {
        ...prefs,
        density: 'comfortable',
        widths: { left: resetColumnWidth('left'), right: resetColumnWidth('right') },
        collapsed: { left: false, right: false },
    };
    writeHomePrefs(reset);
    applyHomeZoningToMainArea({ prefs: reset });
    applyHomeDensity('comfortable');
}

/**
 * Builds aggregated layout snapshot VM para debugging/UI.
 * @returns {{density:string, widths:object, collapsed:object, resizeHandles:Array}}
 */
export function buildLayoutSnapshotVM() {
    const prefs = readPersistedHomePrefs();
    const density = resolveDensityMode(prefs?.density);
    const widths = prefs?.widths || {};
    const collapsed = prefs?.collapsed || {};
    const resizeHandles = ['left', 'right'].map((c: any) =>
        buildResizeHandleVM(/** @type {any} */ (c), widths[c] ?? resetColumnWidth(/** @type {any} */ (c))),
    );
    return Object.freeze({ density, widths, collapsed, resizeHandles });
}
