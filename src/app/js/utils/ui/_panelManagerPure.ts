// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave HHHH1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P1).
//
// Strategy: extract DOM-free tab layout + floating clamp math from utils/ui/panelManager.js
// (#8 monolito 2111 LOC). Pure: zero document/window/state refs.

import { toFiniteNumber } from '../helpers/toFiniteNumber.js';

/**
 * Default tab → panel side assignments (canonical product policy).
 * Frozen for immutability + invariance enforcement.
 *
 * Policy: 'files' and 'automation' tabs MUST live on right panel (enforced
 * in normalizeTabPositions).
 */
export const DEFAULT_TAB_POSITIONS = Object.freeze({
    families: 'left',
    elements: 'left',
    campaigns: 'left',
    scenes: 'left',
    stamps: 'left',
    'cost-analysis': 'left',
    bounty: 'left',
    areas: 'right',
    project: 'right',
    sensors: 'right',
    files: 'right',
    analytics: 'right',
    governance: 'right',
    automation: 'right',
});

const VALID_SIDES = new Set(['left', 'right']);

/**
 * Detect legacy right-heavy saved layouts and opt-in to new balanced defaults.
 * Rebalance only when no explicit custom-left tabs are present.
 *
 * Pure: input → boolean sem side-effects (zero document/window/localStorage).
 *
 * @param {Record<string, unknown>|null|undefined} raw
 * @returns {boolean}
 */
export function isLegacyRightHeavyLayout( raw: any) {
    if (!raw || typeof raw !== 'object') return false;
    const validSide = (value: any) => value === 'left' || value === 'right';
    const entries = Object.entries(raw).filter(([, side]) => validSide(side));
    if (entries.length === 0) return false;
    // If user already customized any additional tab to the left, preserve it.
    const leftTabs = entries.filter(([, side]) => side === 'left').map(([tabId]) => tabId);
    if (leftTabs.some((tabId: any) => tabId !== 'families' && tabId !== 'elements')) {
        return false;
    }
    // Keep strict right-only expectations from previous defaults.
    const legacyRightTabs = [
        'areas',
        'project',
        'sensors',
        'files',
        'campaigns',
        'scenes',
        'analytics',
        'governance',
        'automation',
    ];
    for (const tabId of legacyRightTabs) {
        const side = raw[tabId];
        if (validSide(side) && side !== 'right') return false;
    }
    // Tabs moved by the new default were previously right or unset.
    const rebalancedTabs = ['campaigns', 'scenes', 'stamps', 'cost-analysis', 'bounty'];
    return rebalancedTabs.every((tabId: any) => raw[tabId] !== 'left');
}

/**
 * Normalize tab positions: enforce defaults + product invariants.
 * Pure: input → {positions, changed} sem side-effects.
 *
 * Invariants enforced:
 * - All default tabs present with valid side
 * - 'files' and 'automation' MUST be 'right'
 * - Returns changed=true if any normalization happened
 *
 * @param {Record<string, any>|null|undefined} raw
 * @returns {{positions:Record<string, 'left'|'right'>, changed:boolean}}
 */
export function normalizeTabPositions( raw: any) {
    const incoming = raw && typeof raw === 'object' ? raw : {};
    const positions: any = { ...DEFAULT_TAB_POSITIONS };
    let changed = false;

    // Preserve valid saved positions (including future/extra tabs)
    for (const [tabId, side] of Object.entries(incoming)) {
        if (VALID_SIDES.has(String(side))) {
            positions[tabId] = side;
        } else {
            changed = true;
        }
    }

    // Ensure all default keys exist with valid values
    for (const [tabId, side] of Object.entries(DEFAULT_TAB_POSITIONS)) {
        if (!VALID_SIDES.has(positions[tabId])) {
            positions[tabId] = side;
            changed = true;
        }
    }

    // Product policy: these tabs must always live on right panel
    if (positions.files !== 'right') {
        positions.files = 'right';
        changed = true;
    }
    if (positions.automation !== 'right') {
        positions.automation = 'right';
        changed = true;
    }

    // Detect any drift vs raw payload (for persistence decision)
    const normalizedFromRaw: any = {};
    for (const [tabId, side] of Object.entries(incoming)) {
        if (VALID_SIDES.has(String(side))) normalizedFromRaw[tabId] = String(side);
    }
    if (JSON.stringify(positions) !== JSON.stringify({ ...DEFAULT_TAB_POSITIONS, ...normalizedFromRaw })) {
        changed = true;
    }

    return { positions, changed };
}

/**
 * Clamp floating element position into viewport bounds with padding.
 * Pure: rect dimensions + viewport → new {left, top} in px.
 *
 * Returns null if no clamping needed (rect fully inside viewport).
 *
 * @param {{left:number, top:number, right:number, bottom:number, width:number, height:number}} rect
 * @param {{vw:number, vh:number, padding?:number}} viewport
 * @returns {{left:number, top:number}|null}
 */
export function clampFloatingPosition( rect: any, viewport: any) {
    if (!rect || !viewport) return null;
    const padding = toFiniteNumber(viewport.padding, 8);
    const vw = Number(viewport.vw);
    const vh = Number(viewport.vh);
    if (!Number.isFinite(vw) || !Number.isFinite(vh)) return null;

    let left = Number(rect.left);
    let top = Number(rect.top);
    let changed = false;

    if (rect.right > vw) {
        left = Math.max(0, vw - rect.width - padding);
        changed = true;
    }
    if (rect.bottom > vh) {
        top = Math.max(0, vh - rect.height - padding);
        changed = true;
    }
    if (rect.left < 0) {
        left = 0;
        changed = true;
    }
    if (rect.top < 0) {
        top = 0;
        changed = true;
    }

    return changed ? { left, top } : null;
}

/**
 * Check if tab side string is valid ('left' or 'right').
 *
 * @param {any} side
 * @returns {boolean}
 */
export function isValidTabSide( side: any) {
    return VALID_SIDES.has(String(side));
}

// ----------------------------------------------------------------
// ARCH-MONOLITH-ATOMIZATION-001 — grid-template-rows resolution
// ----------------------------------------------------------------
// Pure slice extracted from panelManager.ts rebuildGridRows(). The DOM
// reads (class probing + getComputedStyle of #ticker-bar) and the write
// (app.style.setProperty('--app-grid-rows', ...)) stay in the wire layer;
// only the row-string math lives here. Same six-track string is produced.

/** Default title row when the V2 home-redesign header is NOT active. */
export const GRID_TITLE_ROW_DEFAULT = '40px';
/** Title row when #app has the `home-redesign-v2` class (taller header). */
export const GRID_TITLE_ROW_V2 = '48px';
/** Toolbar (ribbon) track height when visible and docked. */
export const GRID_TOOLBAR_ROW = '56px';
/** Ticker bar track height when #ticker-bar is displayed. */
export const GRID_TICKER_ROW = '28px';
/** Statusbar track height when visible. */
export const GRID_STATUSBAR_ROW = '26px';

/**
 * Resolve the `grid-template-rows` value for the #app grid.
 *
 * Pure: DOM-derived flags → six-track CSS string. Mirrors exactly the
 * branches of rebuildGridRows() (group-actions / group-datastudio / normal)
 * so the wire layer produces byte-identical output.
 *
 * Track order: title / 0px(menubar reserved) / toolbar / ticker / 1fr(main) / statusbar.
 *
 * @param {{
 *   viewMode?: 'group-actions'|'group-datastudio'|'normal'|string,
 *   homeRedesignV2?: boolean,
 *   toolbarVisible?: boolean,
 *   toolbarFloating?: boolean,
 *   tickerVisible?: boolean,
 *   statusbarVisible?: boolean,
 * }} input
 * @returns {string}
 */
export function resolveGridTemplateRows(input: any) {
    const opts = input && typeof input === 'object' ? input : {};
    const titleRow = opts.homeRedesignV2 ? GRID_TITLE_ROW_V2 : GRID_TITLE_ROW_DEFAULT;

    // view-group-actions: statusbar honored, all middle tracks collapsed.
    if (opts.viewMode === 'group-actions') {
        return `${titleRow} 0px 0px 0px 1fr ${opts.statusbarVisible ? GRID_STATUSBAR_ROW : '0px'}`;
    }
    // view-group-datastudio: middle tracks collapsed, statusbar always present.
    if (opts.viewMode === 'group-datastudio') {
        return `${titleRow} 0px 0px 0px 1fr ${GRID_STATUSBAR_ROW}`;
    }
    // Normal view: toolbar / ticker / statusbar each gated by visibility.
    const toolbarRow = opts.toolbarVisible && !opts.toolbarFloating ? GRID_TOOLBAR_ROW : '0px';
    const tickerRow = opts.tickerVisible ? GRID_TICKER_ROW : '0px';
    const statusRow = opts.statusbarVisible ? GRID_STATUSBAR_ROW : '0px';
    return `${titleRow} 0px ${toolbarRow} ${tickerRow} 1fr ${statusRow}`;
}

// ----------------------------------------------------------------
// ARCH-MONOLITH-ATOMIZATION-001 — bottom panel (constellation) height clamp
// ----------------------------------------------------------------
// Pure slice extracted from panelManager.ts (3 inline sites: saved-height
// restore, vertical-resize drag, window-resize re-clamp). DOM reads
// (offsetHeight) and writes (--bottom-panel-height) stay in the wire layer.

/** Floor for the docked constellation height in px. */
export const CONSTELLATION_MIN_HEIGHT = 80;
/** Absolute ceiling for the docked constellation height in px. */
export const CONSTELLATION_MAX_HEIGHT_PX = 500;
/** Viewport-relative ceiling factor (45% of window height). */
export const CONSTELLATION_MAX_HEIGHT_VH = 0.45;

/**
 * Resolve the dynamic maximum docked-constellation height for a viewport.
 * Mirrors inline `Math.min(500, Math.round(innerHeight * 0.45))`.
 *
 * @param {number} innerHeight viewport height in px
 * @returns {number}
 */
export function resolveConstellationMaxHeight(innerHeight: any) {
    const vh = Number(innerHeight);
    if (!Number.isFinite(vh)) return CONSTELLATION_MAX_HEIGHT_PX;
    return Math.min(CONSTELLATION_MAX_HEIGHT_PX, Math.round(vh * CONSTELLATION_MAX_HEIGHT_VH));
}

/**
 * Clamp a requested docked-constellation height into [80, maxH] where
 * maxH = min(500, round(innerHeight * 0.45)).
 *
 * Mirrors inline `Math.max(80, Math.min(parsed, maxH))` exactly. Returns
 * null when the requested value is not a finite number (caller should skip
 * the write — same as the inline `isNaN` guard).
 *
 * @param {number} requested desired height in px
 * @param {number} innerHeight viewport height in px
 * @returns {number|null}
 */
export function clampConstellationHeight(requested: any, innerHeight: any) {
    const value = Number(requested);
    if (!Number.isFinite(value)) return null;
    const maxH = resolveConstellationMaxHeight(innerHeight);
    return Math.max(CONSTELLATION_MIN_HEIGHT, Math.min(value, maxH));
}

// ----------------------------------------------------------------
// ARCH-MONOLITH-ATOMIZATION-001 — docked left/right panel width clamp
// ----------------------------------------------------------------
// Pure slice extracted from panelManager.ts setupResizeHandles(). The two
// drag handlers (#resize-handle-left / #resize-handle-right) read the mouse
// clientX and viewport innerWidth, clamp the resulting panel width, then
// write the result to `panel.size` + the `--left/right-panel-width` CSS var.
// The DOM reads (clientX/innerWidth) and the writes (style.setProperty,
// handleResize) stay in the wire layer; only the clamp math lives here so the
// two formerly-duplicated inline expressions produce byte-identical widths.

/**
 * Reserved viewport width (px) that is always kept free of the resizable
 * docked panel so the 3D canvas never collapses to zero. Mirrors the inline
 * literal `_window.innerWidth - 120` in both resize handlers.
 */
export const PANEL_RESERVED_VIEWPORT_PX = 120;

/**
 * Resolve the dynamic maximum docked-panel width for a viewport.
 *
 * Mirrors inline `Math.max(panel.minSize, _window.innerWidth - 120)`: never
 * smaller than the panel's own floor, so on very narrow viewports the floor
 * wins (the panel can exceed the reserved gap rather than vanish).
 *
 * @param {number} innerWidth viewport width in px
 * @param {number} minSize panel minimum width in px
 * @returns {number}
 */
export function resolvePanelMaxWidth(innerWidth: any, minSize: any) {
    const vw = Number(innerWidth);
    const floor = Number(minSize);
    const safeFloor = Number.isFinite(floor) ? floor : 0;
    if (!Number.isFinite(vw)) return safeFloor;
    return Math.max(safeFloor, vw - PANEL_RESERVED_VIEWPORT_PX);
}

/**
 * Clamp a docked LEFT panel width from a drag.
 *
 * The left panel grows rightward from x=0, so the raw desired width equals the
 * pointer's clientX. Mirrors inline exactly:
 *   const viewportMax = Math.max(minSize, innerWidth - 120);
 *   Math.min(viewportMax, Math.max(minSize, clientX));
 *
 * @param {number} clientX pointer X in px (raw desired width)
 * @param {number} innerWidth viewport width in px
 * @param {number} minSize panel minimum width in px
 * @returns {number}
 */
export function clampLeftPanelWidth(clientX: any, innerWidth: any, minSize: any) {
    const floor = Number.isFinite(Number(minSize)) ? Number(minSize) : 0;
    const viewportMax = resolvePanelMaxWidth(innerWidth, floor);
    return Math.min(viewportMax, Math.max(floor, Number(clientX)));
}

/**
 * Clamp a docked RIGHT panel width from a drag.
 *
 * The right panel grows leftward from the viewport edge, so the raw desired
 * width equals `innerWidth - clientX`. Mirrors inline exactly:
 *   const viewportMax = Math.max(minSize, innerWidth - 120);
 *   Math.min(viewportMax, Math.max(minSize, innerWidth - clientX));
 *
 * @param {number} clientX pointer X in px
 * @param {number} innerWidth viewport width in px
 * @param {number} minSize panel minimum width in px
 * @returns {number}
 */
export function clampRightPanelWidth(clientX: any, innerWidth: any, minSize: any) {
    const floor = Number.isFinite(Number(minSize)) ? Number(minSize) : 0;
    const viewportMax = resolvePanelMaxWidth(innerWidth, floor);
    return Math.min(viewportMax, Math.max(floor, Number(innerWidth) - Number(clientX)));
}

// ----------------------------------------------------------------
// ARCH-MONOLITH-ATOMIZATION-001 — constellation double-click preset cycle
// ----------------------------------------------------------------
// Pure slice extracted from panelManager.ts setupConstellationVerticalResize().
// The double-click handler cycles the docked constellation through a fixed set
// of preset heights (smallest > current+20, wrapping to the first). The DOM
// reads (hud.offsetHeight, _window.innerHeight) and the writes (applyHeight,
// localStorage, saveBarsState) stay in the wire layer; only the preset-array
// build + next-preset selection live here so the cycle is byte-identical.

/** Fixed leading preset heights (px) for the docked constellation cycle. */
export const CONSTELLATION_PRESET_FIXED_HEIGHTS = Object.freeze([120, 250]);
/** Viewport-relative factor for the largest preset (40% of window height). */
export const CONSTELLATION_PRESET_VH = 0.4;
/**
 * Hysteresis margin (px): a preset must exceed `currentHeight + this` to be
 * selected as "next", so a double-click on an exact preset advances instead of
 * re-selecting the same height. Mirrors the inline `p > currentH + 20`.
 */
export const CONSTELLATION_PRESET_MARGIN = 20;

/**
 * Build the ordered list of docked-constellation preset heights for a viewport.
 * Mirrors inline `[120, 250, Math.round(_window.innerHeight * 0.4)]`.
 *
 * @param {number} innerHeight viewport height in px
 * @returns {number[]}
 */
export function resolveConstellationPresetHeights(innerHeight: any) {
    const vh = Number(innerHeight);
    const dynamic = Number.isFinite(vh) ? Math.round(vh * CONSTELLATION_PRESET_VH) : 0;
    return [...CONSTELLATION_PRESET_FIXED_HEIGHTS, dynamic];
}

/**
 * Resolve the next preset height when the constellation resize grip is
 * double-clicked. Picks the first preset strictly greater than
 * `currentHeight + 20`, wrapping to the first preset when none is larger.
 *
 * Mirrors inline exactly:
 *   const PRESET_HEIGHTS = [120, 250, Math.round(innerHeight * 0.4)];
 *   PRESET_HEIGHTS.find((p) => p > currentH + 20) || PRESET_HEIGHTS[0];
 *
 * @param {number} currentHeight current docked height in px (hud.offsetHeight)
 * @param {number} innerHeight viewport height in px
 * @returns {number}
 */
export function resolveNextConstellationPresetHeight(currentHeight: any, innerHeight: any) {
    const presets = resolveConstellationPresetHeights(innerHeight);
    const current = Number(currentHeight);
    const threshold = current + CONSTELLATION_PRESET_MARGIN;
    return presets.find((p) => p > threshold) || presets[0];
}
