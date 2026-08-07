// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PANEL COLLAPSE STATE — UX-58

   Pure-logic, zero DOM. State machine for panel collapse/expand
   animations with persistent state. Immutable; every mutator returns
   a new frozen state. Map<id, Panel> preserved via new Map().

   States: 'collapsed' | 'collapsing' | 'expanded' | 'expanding'
   ================================================================ */

const VALID_SIDES = Object.freeze(['left', 'right', 'top', 'bottom']);
const TERMINAL_STATES = Object.freeze(['collapsed', 'expanded']);
const ANIMATING_STATES = Object.freeze(['collapsing', 'expanding']);
const ALL_STATES = Object.freeze([...TERMINAL_STATES, ...ANIMATING_STATES]);

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function freezePanel(panel: any) {
    return Object.freeze({ ...panel });
}

function freezeState(panels: any) {
    return Object.freeze({ panels });
}

function clonePanels(panels: any) {
    return new Map(panels);
}

function ensurePanel(state: any, id: any) {
    const p = state.panels.get(id);
    if (!p) throw new Error(`panelCollapseState: panel "${id}" not registered`);
    return p;
}

function validatePanelInput(panel: any) {
    if (!panel || typeof panel !== 'object') {
        throw new Error('panelCollapseState: panel must be an object');
    }
    if (!panel.id || typeof panel.id !== 'string') {
        throw new Error('panelCollapseState: panel.id required (string)');
    }
    if (!VALID_SIDES.includes(panel.side)) {
        throw new Error(`panelCollapseState: invalid side "${panel.side}"`);
    }
    if (!Number.isFinite(panel.expandedSize) || panel.expandedSize <= 0) {
        throw new Error('panelCollapseState: expandedSize must be > 0');
    }
    if (!Number.isFinite(panel.collapsedSize) || panel.collapsedSize < 0) {
        throw new Error('panelCollapseState: collapsedSize must be >= 0');
    }
    if (panel.collapsedSize >= panel.expandedSize) {
        throw new Error('panelCollapseState: collapsedSize must be < expandedSize');
    }
    if (!Number.isFinite(panel.animationDurationMs) || panel.animationDurationMs <= 0) {
        throw new Error('panelCollapseState: animationDurationMs must be > 0');
    }
    if (panel.state !== undefined && !ALL_STATES.includes(panel.state)) {
        throw new Error(`panelCollapseState: invalid state "${panel.state}"`);
    }
}

function lerp(from: any, to: any, t: any) {
    return from + (to - from) * t;
}

function progressFor(panel: any, now: any) {
    if (!ANIMATING_STATES.includes(panel.state)) return 1;
    if (panel.animationStartedAt == null) return 1;
    const elapsed = now - panel.animationStartedAt;
    if (elapsed <= 0) return 0;
    if (elapsed >= panel.animationDurationMs) return 1;
    return elapsed / panel.animationDurationMs;
}

function interpolatedSize(panel: any, now: any) {
    if (panel.state === 'collapsed') return panel.collapsedSize;
    if (panel.state === 'expanded') return panel.expandedSize;
    const t = progressFor(panel, now);
    if (panel.state === 'collapsing') {
        return lerp(panel.expandedSize, panel.collapsedSize, t);
    }
    // expanding
    return lerp(panel.collapsedSize, panel.expandedSize, t);
}

// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────

export function createCollapseState() {
    return freezeState(new Map());
}

export function registerPanel(state: any, panel: any) {
    validatePanelInput(panel);
    if (state.panels.has(panel.id)) {
        throw new Error(`panelCollapseState: panel "${panel.id}" already registered`);
    }
    const initialState = panel.state || 'expanded';
    const currentSize =
        initialState === 'collapsed'
            ? panel.collapsedSize
            : initialState === 'expanded'
              ? panel.expandedSize
              : (panel.currentSize ?? panel.expandedSize);
    const next = freezePanel({
        id: panel.id,
        side: panel.side,
        state: initialState,
        expandedSize: panel.expandedSize,
        collapsedSize: panel.collapsedSize,
        currentSize,
        animationStartedAt: panel.animationStartedAt ?? null,
        animationDurationMs: panel.animationDurationMs,
        prevState: null,
        prevSize: null,
    });
    const panels = clonePanels(state.panels);
    panels.set(panel.id, next);
    return freezeState(panels);
}

export function unregisterPanel(state: any, id: any) {
    if (!state.panels.has(id)) return state;
    const panels = clonePanels(state.panels);
    panels.delete(id);
    return freezeState(panels);
}

export function startCollapse(state: any, panelId: any, now: any) {
    const p = ensurePanel(state, panelId);
    if (p.state !== 'expanded') {
        throw new Error(`panelCollapseState: cannot start collapse on "${panelId}" in state "${p.state}"`);
    }
    if (!Number.isFinite(now)) {
        throw new Error('panelCollapseState: now must be a finite number');
    }
    const panels = clonePanels(state.panels);
    panels.set(
        panelId,
        freezePanel({
            ...p,
            state: 'collapsing',
            animationStartedAt: now,
            prevState: p.state,
            prevSize: p.currentSize,
        }),
    );
    return freezeState(panels);
}

export function startExpand(state: any, panelId: any, now: any) {
    const p = ensurePanel(state, panelId);
    if (p.state !== 'collapsed') {
        throw new Error(`panelCollapseState: cannot start expand on "${panelId}" in state "${p.state}"`);
    }
    if (!Number.isFinite(now)) {
        throw new Error('panelCollapseState: now must be a finite number');
    }
    const panels = clonePanels(state.panels);
    panels.set(
        panelId,
        freezePanel({
            ...p,
            state: 'expanding',
            animationStartedAt: now,
            prevState: p.state,
            prevSize: p.currentSize,
        }),
    );
    return freezeState(panels);
}

export function tickAnimation(state: any, now: any) {
    if (!Number.isFinite(now)) {
        throw new Error('panelCollapseState: now must be a finite number');
    }
    let mutated = false;
    const panels = clonePanels(state.panels);
    for (const [id, p] of state.panels.entries()) {
        if (!ANIMATING_STATES.includes(p.state)) continue;
        const t = progressFor(p, now);
        if (t >= 1) {
            const terminal = p.state === 'collapsing' ? 'collapsed' : 'expanded';
            const targetSize = terminal === 'collapsed' ? p.collapsedSize : p.expandedSize;
            panels.set(
                id,
                freezePanel({
                    ...p,
                    state: terminal,
                    currentSize: targetSize,
                    animationStartedAt: null,
                    prevState: null,
                    prevSize: null,
                }),
            );
            mutated = true;
        } else {
            const newSize = interpolatedSize(p, now);
            if (newSize !== p.currentSize) {
                panels.set(id, freezePanel({ ...p, currentSize: newSize }));
                mutated = true;
            }
        }
    }
    return mutated ? freezeState(panels) : state;
}

export function completeAnimation(state: any, panelId: any) {
    const p = ensurePanel(state, panelId);
    if (!ANIMATING_STATES.includes(p.state)) {
        throw new Error(`panelCollapseState: panel "${panelId}" not animating (state=${p.state})`);
    }
    const terminal = p.state === 'collapsing' ? 'collapsed' : 'expanded';
    const targetSize = terminal === 'collapsed' ? p.collapsedSize : p.expandedSize;
    const panels = clonePanels(state.panels);
    panels.set(
        panelId,
        freezePanel({
            ...p,
            state: terminal,
            currentSize: targetSize,
            animationStartedAt: null,
            prevState: null,
            prevSize: null,
        }),
    );
    return freezeState(panels);
}

export function cancelAnimation(state: any, panelId: any, restore = false) {
    const p = ensurePanel(state, panelId);
    if (!ANIMATING_STATES.includes(p.state)) {
        throw new Error(`panelCollapseState: panel "${panelId}" not animating (state=${p.state})`);
    }
    const panels = clonePanels(state.panels);
    if (restore) {
        const restoreState = p.prevState || (p.state === 'collapsing' ? 'expanded' : 'collapsed');
        const restoreSize =
            p.prevSize != null ? p.prevSize : restoreState === 'collapsed' ? p.collapsedSize : p.expandedSize;
        panels.set(
            panelId,
            freezePanel({
                ...p,
                state: restoreState,
                currentSize: restoreSize,
                animationStartedAt: null,
                prevState: null,
                prevSize: null,
            }),
        );
    } else {
        // Settle into target terminal state at current interpolated size
        const terminal = p.state === 'collapsing' ? 'collapsed' : 'expanded';
        const targetSize = terminal === 'collapsed' ? p.collapsedSize : p.expandedSize;
        panels.set(
            panelId,
            freezePanel({
                ...p,
                state: terminal,
                currentSize: targetSize,
                animationStartedAt: null,
                prevState: null,
                prevSize: null,
            }),
        );
    }
    return freezeState(panels);
}

export function toggle(state: any, panelId: any, now: any) {
    const p = ensurePanel(state, panelId);
    if (ANIMATING_STATES.includes(p.state)) {
        throw new Error(`panelCollapseState: cannot toggle "${panelId}" during animation (state=${p.state})`);
    }
    if (p.state === 'expanded') return startCollapse(state, panelId, now);
    return startExpand(state, panelId, now);
}

export function getProgress(state: any, panelId: any, now: any) {
    const p = ensurePanel(state, panelId);
    return progressFor(p, now);
}

export function getCurrentSize(state: any, panelId: any, now: any) {
    const p = ensurePanel(state, panelId);
    return interpolatedSize(p, now);
}

export function isAnimating(state: any) {
    for (const p of state.panels.values()) {
        if (ANIMATING_STATES.includes(p.state)) return true;
    }
    return false;
}

export function getCollapsedPanels(state: any) {
    const ids = [];
    for (const p of state.panels.values()) {
        if (p.state === 'collapsed') ids.push(p.id);
    }
    return ids;
}

export function summarizeCollapse(state: any) {
    const bySide = { left: 0, right: 0, top: 0, bottom: 0 };
    let collapsedCount = 0;
    let animatingCount = 0;
    for (const p of state.panels.values()) {
        if (p.state === 'collapsed') {
            collapsedCount++;
            bySide[p.side as keyof typeof bySide]++;
        } else if (ANIMATING_STATES.includes(p.state)) {
            animatingCount++;
        }
    }
    return {
        totalPanels: state.panels.size,
        collapsedCount,
        animatingCount,
        bySide,
    };
}

export const __test__ = Object.freeze({
    VALID_SIDES,
    TERMINAL_STATES,
    ANIMATING_STATES,
});
