// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic home zoning model for SPEC_HOME_REDESIGN_3COL_V3 (P1-8).
// Calcula colunas (L=nav, C=hero, R=descoberta) responsivas + persistência.
// Hand-authored R1-safe (claude-otimizacao). Sem DOM, sem side-effects.
// Consumido por homeGrid.js/src/.ts (claude-executor) que chama rebuildGridRows().
//
// Spec NOT (anti-requisitos):
// - NÃO ler DOM (pure-logic)
// - NÃO criar nova chave localStorage (reusa ecbyts-customize)
// - NÃO emoji em strings (R1-violation)

/**
 * @typedef {Object} HomeViewport
 * @property {number} widthPx  Largura do viewport em pixels
 * @property {number} [heightPx] Altura (opcional, futura uso)
 */

/**
 * @typedef {Object} HomeZonePrefs
 * @property {Object} [collapsed]      State {left?:bool, right?:bool}
 * @property {'compact'|'comfortable'} [density]
 * @property {Object} [widths]         Override pixels {left?, hero?, right?}
 */

/**
 * @typedef {Object} HomeZoneCol
 * @property {'left'|'hero'|'right'} id
 * @property {number} widthPx
 * @property {number} order            Ordem visual (mobile reorder C→L→R)
 * @property {boolean} collapsed
 */

/**
 * @typedef {Object} HomeZoneLayout
 * @property {HomeZoneCol[]} cols
 * @property {'desktop'|'tablet'|'mobile'} mode
 * @property {boolean} stacked         True = mobile single-col stack
 */

const BREAKPOINTS = Object.freeze({
    MOBILE_MAX: 640,
    TABLET_MAX: 1024,
});

const DEFAULT_WIDTHS = Object.freeze({
    desktop: { left: 240, hero: 0, right: 280 },
    tablet: { left: 200, hero: 0, right: 240 },
    mobile: { left: 0, hero: 0, right: 0 },
});

const COMPACT_REDUCTION = 0.85;
const MIN_HERO_WIDTH = 320;

/**
 * Resolve modo de layout pela largura do viewport.
 * @param {number} widthPx
 * @returns {'desktop'|'tablet'|'mobile'}
 */
export function resolveLayoutMode(widthPx: any) {
    if (!Number.isFinite(widthPx) || widthPx <= 0) return 'desktop';
    if (widthPx <= BREAKPOINTS.MOBILE_MAX) return 'mobile';
    if (widthPx <= BREAKPOINTS.TABLET_MAX) return 'tablet';
    return 'desktop';
}

/**
 * Calcula larguras finais respeitando density + collapsed + viewport.
 * @param {'desktop'|'tablet'|'mobile'} mode
 * @param {HomeZonePrefs} prefs
 * @param {number} viewportWidthPx
 * @returns {{left:number,hero:number,right:number}}
 */
function computeWidths(mode: any,prefs: any,viewportWidthPx: any) {
    const defaults = (DEFAULT_WIDTHS as Record<string,any>)[mode];
    const w = {
        left: prefs?.widths?.left ?? defaults.left,
        right: prefs?.widths?.right ?? defaults.right,
        hero: 0,
    };
    if (prefs?.density === 'compact') {
        w.left = Math.round(w.left * COMPACT_REDUCTION);
        w.right = Math.round(w.right * COMPACT_REDUCTION);
    }
    if (prefs?.collapsed?.left) w.left = 0;
    if (prefs?.collapsed?.right) w.right = 0;
    if (mode === 'mobile') {
        w.left = 0;
        w.right = 0;
    }
    const heroAvailable = Math.max(0, viewportWidthPx - w.left - w.right);
    w.hero = Math.max(MIN_HERO_WIDTH, heroAvailable);
    if (w.hero === MIN_HERO_WIDTH && heroAvailable < MIN_HERO_WIDTH && (w.left > 0 || w.right > 0)) {
        const overflow = MIN_HERO_WIDTH - heroAvailable;
        if (w.left >= overflow) w.left -= overflow;
        else if (w.right >= overflow) w.right -= overflow;
    }
    return w;
}

/**
 * computeHomeZones — função PURA principal da spec HOME-REDESIGN-3COL-V3.
 * Sem leitura de DOM, sem localStorage, sem side-effects.
 * Determinístico: mesmo input → mesmo output.
 *
 * @param {HomeViewport} viewport
 * @param {HomeZonePrefs} [prefs]
 * @returns {HomeZoneLayout}
 */
export function computeHomeZones(viewport: any,prefs: any = {}) {
    const widthPx = viewport?.widthPx;
    const mode = resolveLayoutMode(widthPx);
    const stacked = mode === 'mobile';
    const widths = computeWidths(mode, prefs, widthPx);
    const collapsedLeft = !!prefs?.collapsed?.left || stacked;
    const collapsedRight = !!prefs?.collapsed?.right || stacked;
    const cols = stacked
        ? [
              { id: 'hero', widthPx: widths.hero, order: 0, collapsed: false },
              { id: 'left', widthPx: widths.left, order: 1, collapsed: collapsedLeft },
              { id: 'right', widthPx: widths.right, order: 2, collapsed: collapsedRight },
          ]
        : [
              { id: 'left', widthPx: widths.left, order: 0, collapsed: collapsedLeft },
              { id: 'hero', widthPx: widths.hero, order: 1, collapsed: false },
              { id: 'right', widthPx: widths.right, order: 2, collapsed: collapsedRight },
          ];
    return Object.freeze({ cols: Object.freeze(cols), mode, stacked });
}

/**
 * Valida + normaliza prefs lidas de localStorage['ecbyts-customize'].
 * Não-throwing — retorna {} em input inválido.
 *
 * @param {unknown} raw
 * @returns {HomeZonePrefs}
 */
export function sanitizeHomePrefs(raw: any) {
    if (!raw || typeof raw !== 'object') return {};
    const r = (raw) as any;
    const out: any = {};
    if (r.collapsed && typeof r.collapsed === 'object') {
        out.collapsed = {
            left: !!r.collapsed.left,
            right: !!r.collapsed.right,
        };
    }
    if (r.density === 'compact' || r.density === 'comfortable') {
        out.density = r.density;
    }
    if (r.widths && typeof r.widths === 'object') {
        const w: any = {};
        if (Number.isFinite(r.widths.left) && r.widths.left >= 0) w.left = r.widths.left;
        if (Number.isFinite(r.widths.right) && r.widths.right >= 0) w.right = r.widths.right;
        if (Object.keys(w).length > 0) out.widths = w;
    }
    return out;
}

/**
 * Constrói grid-template-columns string para inline style application.
 * Padrão CLAUDE.md §Panel System: write via mainArea.style.setProperty.
 *
 * @param {HomeZoneLayout} layout
 * @returns {string}
 */
export function formatGridTemplateColumns(layout: any) {
    if (!layout || !Array.isArray(layout.cols)) return '';
    if (layout.stacked) return '1fr';
    const ordered = [...layout.cols].sort((a: any, b: any) => a.order - b.order);
    return ordered.map((c: any) => (c.collapsed || c.widthPx === 0 ? '0px' : `${c.widthPx}px`)).join(' ');
}
