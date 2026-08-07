// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * HUD Context Menu state manager - Item 9.61
 *
 * Pure state machine for HUD visibility toggles. UI (context menu
 * rendering + right-click wiring) is a thin view over this module.
 *
 * Features:
 *   - 10 HUD categories from spec Q2 inventory
 *   - 3 persistence levels (session / user preference / context-aware)
 *   - Screenshot mode (temporary hide all, restore on exit)
 *   - Environment watermark is NOT toggleable (enforced via locked flag)
 *
 * Reference: docs/IMPLEMENTATION_ROADMAP.md §9.61
 */

// ============================================================================
// HUD inventory (frozen - single source of truth)
// ============================================================================

export const HUD_CATEGORIES = Object.freeze({
    gridXYZ: Object.freeze({
        id: 'gridXYZ',
        label: 'Grid XYZ',
        defaultVisible: true,
        locked: false,
        priority: 'high',
    }),
    compass: Object.freeze({
        id: 'compass',
        label: 'Compass',
        defaultVisible: true,
        locked: false,
        priority: 'high',
    }),
    minimap: Object.freeze({
        id: 'minimap',
        label: 'Minimap',
        defaultVisible: false,
        locked: false,
        priority: 'medium',
    }),
    coordinateReadout: Object.freeze({
        id: 'coordinateReadout',
        label: 'Coordinate readout',
        defaultVisible: true,
        locked: false,
        priority: 'high',
    }),
    elementLabels: Object.freeze({
        id: 'elementLabels',
        label: 'Element labels',
        defaultVisible: true,
        locked: false,
        priority: 'medium',
    }),
    smartLabels: Object.freeze({
        id: 'smartLabels',
        label: 'Smart labels',
        defaultVisible: true,
        locked: false,
        priority: 'medium',
    }),
    selectionInfo: Object.freeze({
        id: 'selectionInfo',
        label: 'Selection info',
        defaultVisible: true,
        locked: false,
        priority: 'low',
    }),
    timeSlider: Object.freeze({
        id: 'timeSlider',
        label: 'Time slider',
        defaultVisible: true,
        locked: false,
        priority: 'medium',
    }),
    performanceHUD: Object.freeze({
        id: 'performanceHUD',
        label: 'Performance (FPS)',
        defaultVisible: false,
        locked: false,
        priority: 'low',
    }),
    environmentBadge: Object.freeze({
        id: 'environmentBadge',
        label: 'Environment badge',
        defaultVisible: true,
        locked: true, // Cannot be toggled — safety-critical
        priority: 'critical',
    }),
});

export const HUD_IDS = Object.freeze(Object.keys(HUD_CATEGORIES));

// ============================================================================
// State management
// ============================================================================

/**
 * Build initial visibility state from defaults.
 * @returns
 */
export function createInitialState(): Record<string, boolean> {
    const state: Record<string, boolean> = {};
    for (const id of HUD_IDS) {
        state[id] = (HUD_CATEGORIES as Record<string, any>)[id].defaultVisible;
    }
    return state;
}

/**
 * Toggle a HUD visibility. Returns new state object (immutable update).
 * Locked HUDs cannot be toggled - call is a no-op with warning in result.
 *
 * @param state - Current state
 * @param boolean> - HUD identifier
 * @returns
 */
export function toggleHud(
    state: Record<string, boolean>,
    hudId: string
): { state: Record<string, boolean>; changed: boolean; reason?: string } {
    const category = (HUD_CATEGORIES as Record<string, any>)[hudId];
    if (!category) {
        return { state, changed: false, reason: 'unknown_hud' };
    }
    if (category.locked) {
        return { state, changed: false, reason: 'hud_locked' };
    }
    const newState = { ...state, [hudId]: !state[hudId] };
    return { state: newState, changed: true };
}

/**
 * Set a HUD visibility explicitly.
 *
 * @param state
 * @param boolean>
 * @param hudId
 * @returns
 */
export function setHudVisibility(
    state: Record<string, boolean>,
    hudId: string,
    visible: boolean
): { state: Record<string, boolean>; changed: boolean; reason?: string } {
    const category = (HUD_CATEGORIES as Record<string, any>)[hudId];
    if (!category) return { state, changed: false, reason: 'unknown_hud' };
    if (category.locked && visible !== state[hudId]) {
        return { state, changed: false, reason: 'hud_locked' };
    }
    if (state[hudId] === visible) {
        return { state, changed: false };
    }
    return { state: { ...state, [hudId]: visible }, changed: true };
}

// ============================================================================
// Screenshot mode
// ============================================================================

/**
 * Enter screenshot mode: save current state, hide all non-locked HUDs.
 * Returns {state, backup} where backup is needed to restore later.
 *
 * @param state
 * @returns
 */
export function enterScreenshotMode(state: Record<string, boolean>): {
    state: Record<string, boolean>;
    backup: Record<string, boolean>;
} {
    const backup = { ...state };
    const newState: Record<string, boolean> = {};
    for (const id of HUD_IDS) {
        const category = (HUD_CATEGORIES as Record<string, any>)[id];
        // Locked HUDs (env badge) stay as-is; everything else hidden
        newState[id] = category.locked ? (state[id] as boolean) : false;
    }
    return { state: newState, backup };
}

/**
 * Exit screenshot mode: restore the backup state.
 *
 * @param backup - Backup returned from enterScreenshotMode
 * @returns Restored state
 */
export function exitScreenshotMode(backup: Record<string, boolean>): Record<string, boolean> {
    if (!backup || typeof backup !== 'object') {
        return createInitialState();
    }
    return { ...backup };
}

// ============================================================================
// Persistence serialization
// ============================================================================

/**
 * Serialize state for localStorage persistence. Only non-default values
 * are included - on load, missing fields fall back to defaults.
 */
export function serializeState(state: any): Record<string, boolean> {
    const diff: Record<string, boolean> = {};
    for (const id of HUD_IDS) {
        const category = (HUD_CATEGORIES as Record<string, any>)[id];
        if (category.locked) continue; // Don't persist locked state
        if (state[id] !== category.defaultVisible) {
            diff[id] = state[id];
        }
    }
    return diff;
}

/**
 * Deserialize state from localStorage. Unknown keys are ignored;
 * missing keys fall back to defaults. Locked HUDs always reset to default.
 */
export function deserializeState(serialized: any): Record<string, boolean> {
    const state = createInitialState();
    if (!serialized || typeof serialized !== 'object') return state;
    for (const id of HUD_IDS) {
        const category = (HUD_CATEGORIES as Record<string, any>)[id];
        if (category.locked) continue; // Always reset locked to default
        if (typeof serialized[id] === 'boolean') {
            state[id] = serialized[id];
        }
    }
    return state;
}

/**
 * Count visible (non-locked) HUDs - used by UI to show "X of Y visible".
 */
export function countVisible(state: any): { visible: number; total: number } {
    let visible = 0;
    let total = 0;
    for (const id of HUD_IDS) {
        const category = (HUD_CATEGORIES as Record<string, any>)[id];
        if (category.locked) continue;
        total++;
        if (state[id]) visible++;
    }
    return { visible, total };
}
