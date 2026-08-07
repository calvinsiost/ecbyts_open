// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-57 - View Router State (pure-logic)
 *
 * Pure manager for transitions between predefined views (top-3D, side-X,
 * side-Y, isometric, free). No DOM, no three.js. Immutable frozen state.
 * Every mutation returns a new state. Navigation history supports goBack().
 */

export type ViewMode = 'perspective' | 'orthographic';
export type CameraPreset = 'top' | 'side_x' | 'side_y' | 'isometric' | 'free';
export type ViewControls = 'orbit' | 'pan' | 'zoom-only';

export interface View {
    id: string;
    label: string;
    mode: ViewMode;
    cameraPreset: CameraPreset;
    controls: ViewControls;
    visibleLayers: readonly string[];
}

export interface ViewInput {
    id?: unknown;
    label?: unknown;
    mode?: unknown;
    cameraPreset?: unknown;
    controls?: unknown;
    visibleLayers?: unknown;
}

export interface ViewRouterState {
    views: Map<string, Readonly<View>>;
    currentViewId: string | null;
    history: readonly string[];
    maxHistory: number;
}

export interface CreateViewRouterOptions {
    maxHistory?: unknown;
    currentViewId?: unknown;
}

export interface GoBackResult {
    state: Readonly<ViewRouterState>;
    restored: boolean;
}

export interface RouterSummary {
    viewCount: number;
    currentLabel: string | null;
    historyDepth: number;
    byMode: Readonly<Partial<Record<ViewMode, number>>>;
}

const VALID_MODES = new Set<ViewMode>(['perspective', 'orthographic']);
const VALID_PRESETS = new Set<CameraPreset>(['top', 'side_x', 'side_y', 'isometric', 'free']);
const VALID_CONTROLS = new Set<ViewControls>(['orbit', 'pan', 'zoom-only']);

const DEFAULT_MAX_HISTORY = 20;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

function assertViewMode(mode: unknown): asserts mode is ViewMode {
    if (typeof mode !== 'string' || !VALID_MODES.has(mode as ViewMode)) {
        throw new Error(`view.mode must be one of: ${[...VALID_MODES].join(', ')}`);
    }
}

function assertCameraPreset(preset: unknown): asserts preset is CameraPreset {
    if (typeof preset !== 'string' || !VALID_PRESETS.has(preset as CameraPreset)) {
        throw new Error(`view.cameraPreset must be one of: ${[...VALID_PRESETS].join(', ')}`);
    }
}

function assertViewControls(controls: unknown): asserts controls is ViewControls {
    if (typeof controls !== 'string' || !VALID_CONTROLS.has(controls as ViewControls)) {
        throw new Error(`view.controls must be one of: ${[...VALID_CONTROLS].join(', ')}`);
    }
}

function validateView(view: unknown): asserts view is View {
    if (!isObjectRecord(view)) {
        throw new Error('view must be an object');
    }
    if (typeof view.id !== 'string' || !view.id) {
        throw new Error('view.id must be a non-empty string');
    }
    if (typeof view.label !== 'string' || !view.label) {
        throw new Error('view.label must be a non-empty string');
    }
    assertViewMode(view.mode);
    assertCameraPreset(view.cameraPreset);
    assertViewControls(view.controls);
    if (!Array.isArray(view.visibleLayers)) {
        throw new Error('view.visibleLayers must be an array');
    }
    for (const layer of view.visibleLayers) {
        if (typeof layer !== 'string' || !layer) {
            throw new Error('view.visibleLayers entries must be non-empty strings');
        }
    }
}

function freezeView(view: View): Readonly<View> {
    return Object.freeze({
        id: view.id,
        label: view.label,
        mode: view.mode,
        cameraPreset: view.cameraPreset,
        controls: view.controls,
        visibleLayers: Object.freeze([...view.visibleLayers]),
    });
}

function freezeState(state: {
    views: Map<string, Readonly<View>>;
    currentViewId: string | null;
    history: readonly string[];
    maxHistory: number;
}): Readonly<ViewRouterState> {
    return Object.freeze({
        views: state.views,
        currentViewId: state.currentViewId,
        history: Object.freeze([...state.history]),
        maxHistory: state.maxHistory,
    });
}

/**
 * Creates the initial frozen router with at least one view.
 */
export function createViewRouter(
    views: readonly ViewInput[],
    options: CreateViewRouterOptions = {},
): Readonly<ViewRouterState> {
    if (!Array.isArray(views) || views.length === 0) {
        throw new Error('createViewRouter requires at least one view');
    }
    const map = new Map<string, Readonly<View>>();
    for (const v of views) {
        validateView(v);
        if (map.has(v.id)) {
            throw new Error(`duplicate view id: ${v.id}`);
        }
        map.set(v.id, freezeView(v));
    }
    const maxHistory =
        Number.isInteger(options.maxHistory) && Number(options.maxHistory) >= 0
            ? Number(options.maxHistory)
            : DEFAULT_MAX_HISTORY;
    const firstView = views[0];
    validateView(firstView);
    const currentViewId = options.currentViewId ?? firstView.id;
    if (typeof currentViewId !== 'string' || !map.has(currentViewId)) {
        throw new Error(`currentViewId not found: ${String(currentViewId)}`);
    }
    return freezeState({
        views: map,
        currentViewId,
        history: [],
        maxHistory,
    });
}

export function registerView(state: Readonly<ViewRouterState>, view: ViewInput): Readonly<ViewRouterState> {
    validateView(view);
    if (state.views.has(view.id)) {
        throw new Error(`view id already exists: ${view.id}`);
    }
    const next = new Map(state.views);
    next.set(view.id, freezeView(view));
    return freezeState({ ...state, views: next, history: [...state.history] });
}

export function unregisterView(state: Readonly<ViewRouterState>, viewId: string): Readonly<ViewRouterState> {
    if (!state.views.has(viewId)) {
        throw new Error(`view not found: ${viewId}`);
    }
    if (state.currentViewId === viewId) {
        throw new Error(`cannot unregister active view: ${viewId}`);
    }
    const next = new Map(state.views);
    next.delete(viewId);
    const history = state.history.filter((id) => id !== viewId);
    return freezeState({ ...state, views: next, history });
}

export function switchView(state: Readonly<ViewRouterState>, viewId: string): Readonly<ViewRouterState> {
    if (!state.views.has(viewId)) {
        throw new Error(`view not found: ${viewId}`);
    }
    if (state.currentViewId === viewId) {
        return state;
    }
    const history = state.currentViewId ? [...state.history, state.currentViewId] : [...state.history];
    while (history.length > state.maxHistory) {
        history.shift();
    }
    return freezeState({ ...state, currentViewId: viewId, history });
}

export function goBack(state: Readonly<ViewRouterState>): GoBackResult {
    if (state.history.length === 0) {
        return { state, restored: false };
    }
    const history = [...state.history];
    const prev = history.pop();
    if (typeof prev !== 'string' || !state.views.has(prev)) {
        const cleaned = freezeState({ ...state, history });
        return goBack(cleaned);
    }
    const next = freezeState({ ...state, currentViewId: prev, history });
    return { state: next, restored: true };
}

export function getCurrentView(state: Readonly<ViewRouterState>): Readonly<View> | null {
    if (!state.currentViewId) return null;
    return state.views.get(state.currentViewId) ?? null;
}

export function getViewById(state: Readonly<ViewRouterState>, viewId: string): Readonly<View> | null {
    return state.views.get(viewId) ?? null;
}

export function getViewsByMode(state: Readonly<ViewRouterState>, mode: ViewMode): Readonly<View>[] {
    if (!VALID_MODES.has(mode)) {
        throw new Error(`invalid mode: ${mode}`);
    }
    return [...state.views.values()].filter((v) => v.mode === mode);
}

export function getViewsByPreset(state: Readonly<ViewRouterState>, preset: CameraPreset): Readonly<View>[] {
    if (!VALID_PRESETS.has(preset)) {
        throw new Error(`invalid preset: ${preset}`);
    }
    return [...state.views.values()].filter((v) => v.cameraPreset === preset);
}

function replaceView(
    state: Readonly<ViewRouterState>,
    viewId: string,
    mutator: (view: Readonly<View>) => View,
): Readonly<ViewRouterState> {
    const current = state.views.get(viewId);
    if (!current) {
        throw new Error(`view not found: ${viewId}`);
    }
    const updated = mutator(current);
    validateView(updated);
    const next = new Map(state.views);
    next.set(viewId, freezeView(updated));
    return freezeState({ ...state, views: next, history: [...state.history] });
}

export function setVisibleLayers(
    state: Readonly<ViewRouterState>,
    viewId: string,
    layers: unknown,
): Readonly<ViewRouterState> {
    if (!Array.isArray(layers)) {
        throw new Error('layers must be an array');
    }
    return replaceView(state, viewId, (v) => ({ ...v, visibleLayers: [...layers] }));
}

export function addLayerToView(
    state: Readonly<ViewRouterState>,
    viewId: string,
    layer: unknown,
): Readonly<ViewRouterState> {
    if (typeof layer !== 'string' || !layer) {
        throw new Error('layer must be a non-empty string');
    }
    const current = state.views.get(viewId);
    if (!current) {
        throw new Error(`view not found: ${viewId}`);
    }
    if (current.visibleLayers.includes(layer)) {
        throw new Error(`layer already present in view: ${layer}`);
    }
    return replaceView(state, viewId, (v) => ({
        ...v,
        visibleLayers: [...v.visibleLayers, layer],
    }));
}

export function removeLayerFromView(
    state: Readonly<ViewRouterState>,
    viewId: string,
    layer: string,
): Readonly<ViewRouterState> {
    const current = state.views.get(viewId);
    if (!current) {
        throw new Error(`view not found: ${viewId}`);
    }
    if (!current.visibleLayers.includes(layer)) {
        return state;
    }
    return replaceView(state, viewId, (v) => ({
        ...v,
        visibleLayers: v.visibleLayers.filter((l) => l !== layer),
    }));
}

export function summarizeRouter(state: Readonly<ViewRouterState>): Readonly<RouterSummary> {
    const byMode: Partial<Record<ViewMode, number>> = {};
    for (const v of state.views.values()) {
        byMode[v.mode] = (byMode[v.mode] || 0) + 1;
    }
    const current = getCurrentView(state);
    return Object.freeze({
        viewCount: state.views.size,
        currentLabel: current ? current.label : null,
        historyDepth: state.history.length,
        byMode: Object.freeze(byMode),
    });
}
