// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Home Zoning Adapter (F2-wiring helper) for SPEC_HOME_REDESIGN_3COL_V3.
// Hand-authored R1-safe consumindo homeZoningModel (Wave D1 pure-logic).
// Aplica grid-template-columns inline em #main-area (padrão CLAUDE.md
// §Panel System — write via mainArea.style.setProperty, NÃO classe CSS).
//
// Spec NOT respeitados (§2.3):
// - NÃO aplicar layout por classe CSS sobreposta a rebuildGridRows
// - NÃO criar nova chave localStorage (reusa ecbyts-customize)
// - NÃO editar homeGrid.js gerado em app/js (codemod-governed)
// - NÃO emojis em UI
// - NÃO framework/bundler

import { computeHomeZones, sanitizeHomePrefs, formatGridTemplateColumns } from './homeZoningModel.js';

const HOME_PREFS_KEY = 'ecbyts-customize';
const HOME_PREFS_FIELD = 'homeZones';
const MAIN_AREA_ID = 'main-area';

/**
 * Lê prefs persistidas de localStorage[ecbyts-customize].homeZones.
 * Defensive: retorna {} se falhar.
 * @returns {object}
 */
export function readPersistedHomePrefs() {
    try {
        const raw = localStorage.getItem(HOME_PREFS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        const homeZones = parsed && parsed[HOME_PREFS_FIELD];
        return sanitizeHomePrefs(homeZones);
    } catch (e: any) {
        console.debug('[homeZoningAdapter:read]', e?.message || e);
        return {};
    }
}

/**
 * Escreve prefs em localStorage[ecbyts-customize].homeZones.
 * Defensive: silencia falhas (quota, JSON parse).
 * @param {object} prefs
 */
export function writeHomePrefs(prefs: any) {
    try {
        const raw = localStorage.getItem(HOME_PREFS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed[HOME_PREFS_FIELD] = sanitizeHomePrefs(prefs);
        localStorage.setItem(HOME_PREFS_KEY, JSON.stringify(parsed));
    } catch (e: any) {
        console.debug('[homeZoningAdapter:write]', e?.message || e);
    }
}

/**
 * Resolve viewport atual via window.innerWidth.
 * @returns {{widthPx:number, heightPx:number}}
 */
function _resolveViewport() {
    return {
        widthPx: typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280,
        heightPx: typeof window !== 'undefined' ? window.innerHeight || 800 : 800,
    };
}

/**
 * Aplica grid-template-columns no #main-area baseado em viewport+prefs.
 * Caller (rebuildGridRows ou home-view boot) deve chamar.
 *
 * @param {object} [opts]
 * @param {object} [opts.viewport]  Override viewport (default: window.innerWidth/Height)
 * @param {object} [opts.prefs]     Override prefs (default: readPersistedHomePrefs())
 * @returns {{applied:boolean, css:string, layout:object}}
 */
export function applyHomeZoningToMainArea(opts: any = {}) {
    const viewport = opts.viewport || _resolveViewport();
    const prefs = opts.prefs || readPersistedHomePrefs();
    const layout = computeHomeZones(viewport, prefs);
    const css = formatGridTemplateColumns(layout);
    if (typeof document === 'undefined') {
        return { applied: false, css, layout };
    }
    const mainArea = document.getElementById(MAIN_AREA_ID);
    if (!mainArea) {
        return { applied: false, css, layout };
    }
    try {
        if (layout.stacked) {
            mainArea.style.removeProperty('grid-template-columns');
            mainArea.style.setProperty('grid-template-columns', '1fr');
        } else {
            mainArea.style.setProperty('grid-template-columns', css);
        }
        mainArea.dataset.homeZoningMode = layout.mode;
        mainArea.dataset.homeZoningCols = String(layout.cols.length);
        return { applied: true, css, layout };
    } catch (e: any) {
        console.debug('[homeZoningAdapter:apply]', e?.message || e);
        return { applied: false, css, layout };
    }
}

/**
 * Reseta grid-template-columns (remove inline) — para sair de home view.
 * @returns {boolean}
 */
export function clearHomeZoningFromMainArea() {
    if (typeof document === 'undefined') return false;
    const mainArea = document.getElementById(MAIN_AREA_ID);
    if (!mainArea) return false;
    try {
        mainArea.style.removeProperty('grid-template-columns');
        delete mainArea.dataset.homeZoningMode;
        delete mainArea.dataset.homeZoningCols;
        return true;
    } catch (e: any) {
        console.debug('[homeZoningAdapter:clear]', e?.message || e);
        return false;
    }
}

/**
 * Toggle collapsed para left ou right.
 * Persiste imediatamente + re-aplica layout.
 *
 * @param {'left'|'right'} side
 * @returns {{applied:boolean, css:string, layout:object}}
 */
export function toggleHomeZoneCollapse(side: any) {
    if (side !== 'left' && side !== 'right') {
        return { applied: false, css: '', layout: null };
    }
    const prefs = readPersistedHomePrefs();
    const collapsed = { ...(prefs.collapsed || {}) };
    collapsed[side] = !collapsed[side];
    const updated = { ...prefs, collapsed };
    writeHomePrefs(updated);
    return applyHomeZoningToMainArea({ prefs: updated });
}

/**
 * Listener para window resize — re-aplica zoning automaticamente.
 * Caller deve chamar uma vez em boot. Retorna função de cleanup.
 *
 * @returns {()=>void} cleanup
 */
export function installHomeZoningResizeListener() {
    if (typeof window === 'undefined') return () => {};
    let raf = 0;
    const onResize = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
            applyHomeZoningToMainArea();
        });
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
        window.removeEventListener('resize', onResize);
        if (raf) cancelAnimationFrame(raf);
    };
}
