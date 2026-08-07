// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * HUD Visibility Bridge - Item 9.61 final wire
 *
 * Maps HUD ids (from core/hud/hudContextMenuState.js inventory) to
 * actual DOM selectors and listens for `ecbyts:hud-visibility-changed`
 * events emitted by canvasContextMenu's HUD submenu.
 *
 * On boot, also reads persisted state from localStorage and applies it
 * so the user's previous toggle choices survive page reload.
 *
 * Why a separate module: each HUD has its own mount/unmount semantics
 * (some are canvas elements, some are DOM containers, some animate).
 * A central listener with a per-id selector map keeps the wiring
 * declarative and easy to extend without touching component code.
 */

import { createInitialState, deserializeState, HUD_IDS } from '../../core/hud/hudContextMenuState.js';

// Map HUD id → CSS selector (or function that resolves the element)
const HUD_SELECTORS = Object.freeze({
    gridXYZ: '#coord-display', // coord display panel doubles as XYZ readout
    compass: '#geo-hud', // compass lives inside geo-hud container
    coordinateReadout: '#coord-display', // same DOM as gridXYZ
    // IDs reais verificados em runtime 2026-06-02 (fix Toggle HUDs no-op):
    elementLabels: '#label-renderer-overlay', // overlay CSS2D das labels
    smartLabels: '#label-leader-canvas', // linhas-guia inteligentes (label↔ponto)
    selectionInfo: '#selection-info, #element-details',
    // minimap: sem componente dedicado no momento → no-op gracioso (default off)
    timeSlider: '#time-slider-panel', // id real do painel temporal (timeSlider.ts)
    performanceHUD: '#perf-hud, #performance-hud',
    // environmentBadge is locked → never toggled, never selected here
});

const STORAGE_KEY = 'ecbyts.hud.state';

/**
 * Apply visibility for a single HUD by id.
 *
 * @param id - HUD identifier from HUD_IDS
 * @param visible
 */
function applyHudVisibility(id: string, visible: boolean): void {
    const selector = (HUD_SELECTORS as Record<string, string>)[id];
    if (!selector) return;
    const elements = document.querySelectorAll(selector) as NodeListOf<HTMLElement>;
    if (elements.length === 0) return;
    elements.forEach((el) => {
        if (visible) {
            // Restore from inline display:none if present
            if (el.style.display === 'none') {
                el.style.display = '';
            }
            el.removeAttribute('data-hud-hidden');
        } else {
            el.style.display = 'none';
            el.setAttribute('data-hud-hidden', 'true');
        }
    });
}

/**
 * Apply visibility for all HUDs from a state object.
 *
 * Multiple HUD ids may share the same selector (e.g. gridXYZ +
 * coordinateReadout both target #coord-display). To avoid the
 * "default-visible id silently overrides a hidden sibling" bug,
 * we aggregate by selector: an element is hidden iff EVERY id
 * mapping to it is hidden, otherwise visible.
 */
function applyAllHudVisibility(state: any): void {
    /** selector → AND of visibility flags */
    const bySelector: Map<string, boolean> = new Map();
    for (const id of HUD_IDS) {
        const selector = (HUD_SELECTORS as Record<string, string>)[id];
        if (!selector) continue;
        const visible = id in state ? !!state[id] : true;
        if (bySelector.has(selector)) {
            bySelector.set(selector, !!bySelector.get(selector) && visible);
        } else {
            bySelector.set(selector, visible);
        }
    }
    for (const [selector, visible] of bySelector) {
        const elements = document.querySelectorAll(selector) as NodeListOf<HTMLElement>;
        elements.forEach((el) => {
            if (visible) {
                if (el.style.display === 'none') el.style.display = '';
                el.removeAttribute('data-hud-hidden');
            } else {
                el.style.display = 'none';
                el.setAttribute('data-hud-hidden', 'true');
            }
        });
    }
}

/**
 * Initialize the HUD visibility bridge. Idempotent.
 * Called once during main.js boot after the HUDs are mounted.
 */
export function initHudVisibilityBridge(): void {
    // 1. Restore persisted state (if any)
    let state = createInitialState();
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || '';
        if (raw) {
            const serialized = JSON.parse(raw);
            state = deserializeState(serialized);
        }
    } catch (e) {
        console.debug('[hudVisibility] loadState:', (e as any)?.message || e);
        /* corrupt or unavailable */
    }
    applyAllHudVisibility(state);

    // 2. Listen for live toggles from the HUD context menu
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('ecbyts:hud-visibility-changed', (ev: any) => {
            const detail = ev?.detail;
            if (!detail || typeof detail.id !== 'string') return;
            applyHudVisibility(detail.id, !!detail.visible);
        });
    }
}

/**
 * Test export - apply a single hud visibility from outside the bridge.
 */
export function _applyHudVisibilityForTesting(id: any, visible: any): void {
    applyHudVisibility(id, visible);
}
