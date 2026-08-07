// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only

import { applyProfile } from './storyProfiles.js';
import { getSuggestedExportPreset } from './videoRecorder.js';

const STORAGE_KEY = 'ecbyts-presentations';
const ACTIVE_KEY = 'ecbyts-presentation-active';

const VALID_STATES = ['idle', 'recording', 'editing', 'playing', 'paused'];

/**
 * @typedef {(evt: { type: string, payload: any, state: string, activeId: string | null }) => void} PresentationListener
 */

/** @type {{ machine: string, activeId: string | null, listeners: PresentationListener[] }} */
const _state: any = {
    machine: 'idle',
    activeId: null,
    listeners: [],
};

/**
 * @param {string} event
 * @param {any} payload
 */
function _emit(event: any, payload: any) {
    for (const cb of _state.listeners) {
        try {
            cb({ type: event, payload, state: _state.machine, activeId: _state.activeId });
        } catch (e) {
            console.warn('[presentation] listener error', e);
        }
    }
}

/**
 * Subscribe to presentation events (state changes, step add, etc).
 * @param {PresentationListener} callback
 * @returns {Function} unsubscribe
 */
export function subscribe(callback: any) {
    _state.listeners.push(callback);
    return () => {
        _state.listeners = _state.listeners.filter((cb: any) => cb !== callback);
    };
}

export function getMachineState() {
    return _state.machine;
}

/** @param {string} newState */
export function setMachineState(newState: any) {
    if (!VALID_STATES.includes(newState)) {
        throw new Error(`Invalid presentation state: ${newState}. Valid: ${VALID_STATES.join(', ')}`);
    }
    const prev = _state.machine;
    _state.machine = newState;
    _emit('state-change', { prev, current: newState });
}

/** @returns {Array<any>} */
function _load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || '';
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.debug('[presentation] load:', /** @type {any} */ (e as any)?.message || e);
        return [];
    }
}

/** @param {Array<any>} presentations */
function _save(presentations: any) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(presentations));
    } catch (e) {
        console.warn('[presentation] save failed', /** @type {any} */ (e as any)?.message || e);
    }
}

function _generateId() {
    return `pres-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new empty presentation.
 * @param {string} title
 * @param {string} [description]
 * @param {object} [options]
 * @param {string} [options.profileId]
 * @param {string} [options.videoPresetId]
 * @returns {object} presentation
 */
export function createPresentation(title: any, description = '', options: any = {}) {
    const list = _load();
    const nowIso = new Date().toISOString();
    /** @type {{ id: string, title: string, description: string, version: string, createdAt: string, updatedAt: string, steps: any[], audioTrack: any, videoPresetId?: string, profileId?: string, [key: string]: any }} */
    let presentation: any = {
        id: _generateId(),
        title: String(title || 'Untitled').slice(0, 200),
        description: String(description || '').slice(0, 1000),
        version: '1.0',
        createdAt: nowIso,
        updatedAt: nowIso,
        steps: [],
        audioTrack: null,
    };
    const profileId = typeof options?.profileId === 'string' ? options.profileId.trim() : '';
    if (profileId) {
        presentation = applyProfile(presentation, profileId);
        presentation.videoPresetId =
            typeof options?.videoPresetId === 'string' && options.videoPresetId.trim()
                ? options.videoPresetId.trim()
                : getSuggestedExportPreset(profileId);
    } else if (typeof options?.videoPresetId === 'string' && options.videoPresetId.trim()) {
        presentation.videoPresetId = options.videoPresetId.trim();
    }
    list.unshift(presentation);
    _save(list);
    _emit('created', { id: presentation.id });
    return presentation;
}

/**
 * List all saved presentations (newest first).
 */
export function listPresentations() {
    return _load();
}

/**
 * Get presentation by ID.
 * @param {string} id
 */
export function getPresentation(id: any) {
    return _load().find((p) => p.id === id) || null;
}

/**
 * Update fields on existing presentation.
 * @param {string} id
 * @param {Record<string, any>} patch
 */
export function updatePresentation(id: any, patch: any) {
    const list = _load();
    const idx = list.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    _save(list);
    _emit('updated', { id });
    return list[idx];
}

/**
 * Delete presentation by ID.
 * @param {string} id
 */
export function deletePresentation(id: any) {
    const list = _load();
    const filtered = list.filter((p) => p.id !== id);
    if (filtered.length === list.length) return false;
    _save(filtered);
    if (_state.activeId === id) {
        _state.activeId = null;
        try {
            localStorage.removeItem(ACTIVE_KEY);
        } catch (e) {
            console.debug('[presentation] active-clear-on-delete:', /** @type {any} */ (e as any)?.message || e);
            /* ignore */
        }
    }
    _emit('deleted', { id });
    return true;
}

/**
 * Mark presentation as active (for player/editor).
 * @param {string | null} id
 */
export function setActivePresentation(id: any) {
    if (id == null) {
        _state.activeId = null;
        try {
            localStorage.removeItem(ACTIVE_KEY);
        } catch (e) {
            console.debug('[presentation] active-clear:', /** @type {any} */ (e as any)?.message || e);
            /* ignore */
        }
        _emit('active-changed', { id: null });
        return;
    }
    const p = getPresentation(id);
    if (!p) throw new Error(`Presentation not found: ${id}`);
    _state.activeId = id;
    try {
        localStorage.setItem(ACTIVE_KEY, id);
    } catch (e) {
        console.debug('[presentation] active-write:', /** @type {any} */ (e as any)?.message || e);
        /* ignore */
    }
    _emit('active-changed', { id });
}

export function getActivePresentation() {
    if (!_state.activeId) {
        try {
            _state.activeId = localStorage.getItem(ACTIVE_KEY) || null;
        } catch (e) {
            console.debug('[presentation] active-read:', /** @type {any} */ (e as any)?.message || e);
            _state.activeId = null;
        }
    }
    return _state.activeId ? getPresentation(_state.activeId) : null;
}

/**
 * Internal - for tests + recorder/player to mutate active presentation.
 * Returns updated copy.
 * @param {(active: any) => void} mutator
 */
export function _mutateActive(mutator: any) {
    const active = getActivePresentation();
    if (!active) return null;
    mutator(active);
    return updatePresentation(active.id, active);
}

/**
 * Reset all state - used in tests.
 */
export function _reset() {
    _state.machine = 'idle';
    _state.activeId = null;
    _state.listeners = [];
    try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(ACTIVE_KEY);
    } catch (e) {
        console.debug('[presentation] reset-clear:', /** @type {any} */ (e as any)?.message || e);
        /* ignore */
    }
}

// Public aliases without underscore prefix (ecbyts-local/no-underscore-prefixed-imports)
export { _mutateActive as mutateActive };
