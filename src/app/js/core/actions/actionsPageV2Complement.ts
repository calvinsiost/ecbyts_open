// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ACTIONS PAGE V2 COMPLEMENT — SPEC_ACTIONS_PAGE_V2_COMPLEMENT §16

   Minimal state contract and feature gates for the Actions page v2.
   Provides the InteractionShellState contract, event bus, and
   freemium gating without modifying core dispatch logic.
   ================================================================ */

import { createLogger } from '../../utils/helpers/logger.js';

const log = createLogger('ActionsV2');

// ──────────────────────────────────────────────────────────────────────
// Feature flags (kill switches)
// ──────────────────────────────────────────────────────────────────────
export const FEATURE_FLAGS = Object.freeze({
    shell: true, // FEATURE_ACTIONS_V2_SHELL
    z4Context: true, // FEATURE_ACTIONS_V2_Z4_CONTEXT
    graph: false, // FEATURE_ACTIONS_V2_GRAPH (premium)
    aiPanel: false, // FEATURE_ACTIONS_V2_AI_PANEL (premium)
});

// ──────────────────────────────────────────────────────────────────────
// Capability gating matrix
// ──────────────────────────────────────────────────────────────────────
export const CAPABILITY_GATES = Object.freeze({
    cap_graph_relations: 'premium',
    cap_ai_context_panel: 'premium',
    cap_advanced_bpmn: 'premium',
    cap_marketplace_publish: 'premium',
});

// ──────────────────────────────────────────────────────────────────────
// State contract (single source of truth)
// ──────────────────────────────────────────────────────────────────────
export function createShellState(initial: any = {}) {
    return {
        activeDomain: initial.activeDomain || null,
        activeObjectId: initial.activeObjectId || null,
        activeObjectType: initial.activeObjectType || null,
        activeTabId: initial.activeTabId || 'actions',
        viewMode: initial.viewMode || 'actions',
        leftCollapsed: initial.leftCollapsed || false,
        rightCollapsed: initial.rightCollapsed || false,
        premiumEnabled: initial.premiumEnabled || false,
    };
}

const STORAGE_KEY = 'ecbyts-actions-last-object-context';

let _state = createShellState();
const _listeners = new Set<any>();

// ──────────────────────────────────────────────────────────────────────
// Event bus (canonical events only)
// ──────────────────────────────────────────────────────────────────────
export function emit(eventName: any, payload: any) {
    log.debug('emit', eventName, payload);
    for (const listener of _listeners) {
        try {
            listener(eventName, payload);
        } catch (err) {
            log.warn('Listener error for', eventName, err);
        }
    }
}

export function subscribe(listener: any) {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
}

// ──────────────────────────────────────────────────────────────────────
// State mutations
// ──────────────────────────────────────────────────────────────────────
export function setDomain(domainId: any) {
    _state = { ..._state, activeDomain: domainId, activeObjectId: null, activeObjectType: null };
    emit('domain:selected', { domainId });
    emit('context:changed', { ..._state });
    _persist();
}

export function selectObject(objectId: any, objectType: any, origin = 'tree') {
    _state = { ..._state, activeObjectId: objectId, activeObjectType: objectType };
    emit('object:selected', { objectId, objectType, origin });
    emit('context:changed', { ..._state });
    _persist();
}

export function setTab(tabId: any) {
    _state = { ..._state, activeTabId: tabId };
    emit('tab:changed', { tabId });
    emit('context:changed', { ..._state });
    _persist();
}

export function setViewMode(mode: any) {
    _state = { ..._state, viewMode: mode };
    emit('viewmode:changed', { mode });
    _persist();
}

export function togglePanel(side: any) {
    if (side === 'left') {
        _state = { ..._state, leftCollapsed: !_state.leftCollapsed };
    } else if (side === 'right') {
        _state = { ..._state, rightCollapsed: !_state.rightCollapsed };
    }
    emit('panel:toggle', { side, collapsed: side === 'left' ? _state.leftCollapsed : _state.rightCollapsed });
    _persist();
}

export function setPremium(enabled: any) {
    _state = { ..._state, premiumEnabled: enabled };
    emit('premium:changed', { enabled });
    _persist();
}

export function getState() {
    return { ..._state };
}

// ──────────────────────────────────────────────────────────────────────
// Capability checks
// ──────────────────────────────────────────────────────────────────────
export function hasCapability(capability: any, userTier = 'free') {
    const gate = (CAPABILITY_GATES as Record<string, string>)[capability];
    if (!gate) return true; // unknown capabilities default to allowed
    if (gate === 'premium') return userTier === 'premium' || userTier === 'enterprise' || _state.premiumEnabled;
    return true;
}

export function isFeatureEnabled(flagName: any) {
    return (FEATURE_FLAGS as Record<string, boolean>)[flagName] === true;
}

// ──────────────────────────────────────────────────────────────────────
// Persistence
// ──────────────────────────────────────────────────────────────────────
function _persist() {
    try {
        const minimal = {
            activeDomain: _state.activeDomain,
            activeObjectId: _state.activeObjectId,
            activeObjectType: _state.activeObjectType,
            activeTabId: _state.activeTabId,
            viewMode: _state.viewMode,
            leftCollapsed: _state.leftCollapsed,
            rightCollapsed: _state.rightCollapsed,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
    } catch (e) {
        console.debug('[actionsV2] persistState:', (e as any)?.message || e);
        // ignore
    }
}

export function restoreState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || '';
        if (raw) {
            const parsed = JSON.parse(raw);
            _state = createShellState({ ...parsed, premiumEnabled: _state.premiumEnabled });
        }
    } catch (e) {
        console.debug('[actionsV2] restoreState:', (e as any)?.message || e);
        // ignore
    }
    return getState();
}

// ──────────────────────────────────────────────────────────────────────
// Domain mapping (Action Card -> domain)
// ──────────────────────────────────────────────────────────────────────
export const CARD_DOMAIN_MAP = Object.freeze({
    elements: 'elements',
    observations: 'observations',
    campaigns: 'campaigns',
    scenes: 'scenes',
    report: 'report',
    analytics: 'analytics',
    interpolation: 'interpolation',
    calculator: 'calculator',
    governance: 'governance',
    libraries: 'libraries',
});

// ──────────────────────────────────────────────────────────────────────
// UI Contract - stable selectors for tests
// ──────────────────────────────────────────────────────────────────────
export const SELECTORS = Object.freeze({
    shellRoot: '#actions-shell-root',
    rail: '[data-testid="actions-rail"]',
    tree: '[data-testid="actions-tree"]',
    mainTabs: '[data-testid="actions-main-tabs"]',
    breadcrumb: '[data-testid="actions-breadcrumb"]',
    contextPanel: '[data-testid="actions-context-panel"]',
    viewToggle: '[data-testid="actions-view-toggle"]',
    contextSurface: '[data-testid="actions-context-surface"]',
    contextToolbar: '[data-testid="actions-context-toolbar"]',
    treeFilter: '[data-testid="actions-tree-filter"]',
    treeNode: '[data-testid="actions-tree-node"]',
});
