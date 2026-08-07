// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Multi-Tab Session State - pure-logic (UX-37, Phase 1 SPEC_COLLABORATION_JOURNEY)
 *
 * Modelo de sessões compartilhadas entre múltiplas abas do navegador.
 * Zero dependência de DOM/BroadcastChannel/storage - apenas estado imutável
 * e transições puras. As camadas de transporte (BroadcastChannel, IDB) serão
 * adicionadas em fases posteriores.
 *
 * Estado:
 *   { sessionId, currentTabId, lockHolder, tabs: Map<tabId, TabInfo> }
 * TabInfo:
 *   { tabId, openedAt, lastSeenAt, role: 'owner'|'collaborator'|'viewer', userId }
 */

export type TabRole = 'owner' | 'collaborator' | 'viewer';

export interface TabInfo {
    tabId: string;
    openedAt: number;
    lastSeenAt: number;
    role: TabRole;
    userId: string;
}

export interface SessionState {
    sessionId: string;
    currentTabId: string;
    lockHolder: string | null;
    tabs: Map<string, TabInfo>;
}

const VALID_ROLES = new Set<string>(['owner', 'collaborator', 'viewer']);

function freezeTab(tab: TabInfo): TabInfo {
    return Object.freeze({ ...tab });
}

function freezeState(state: SessionState): SessionState {
    // Freeze inner Map entries; Map itself sealed via wrapping in frozen object.
    const frozenTabs = new Map<string, TabInfo>();
    for (const [k, v] of state.tabs) frozenTabs.set(k, freezeTab(v));
    return Object.freeze({
        sessionId: state.sessionId,
        currentTabId: state.currentTabId,
        lockHolder: state.lockHolder ?? null,
        tabs: frozenTabs,
    });
}

function cloneTabs(tabs: Map<string, TabInfo>): Map<string, TabInfo> {
    return new Map(tabs);
}

/**
 * Cria uma nova sessão com a aba atual como owner.
 */
export function createSession({
    sessionId,
    currentTabId,
    userId,
    openedAt = 0,
}: {
    sessionId: string;
    currentTabId: string;
    userId: string;
    openedAt?: number;
}): SessionState {
    if (!sessionId || typeof sessionId !== 'string') throw new Error('sessionId required');
    if (!currentTabId || typeof currentTabId !== 'string') throw new Error('currentTabId required');
    if (!userId || typeof userId !== 'string') throw new Error('userId required');
    const tabs = new Map<string, TabInfo>();
    tabs.set(currentTabId, {
        tabId: currentTabId,
        openedAt,
        lastSeenAt: openedAt,
        role: 'owner',
        userId,
    });
    return freezeState({ sessionId, currentTabId, lockHolder: null, tabs });
}

/**
 * Registra nova aba na sessão.
 * @throws se tabId duplicado.
 */
export function registerTab(
    state: SessionState,
    tab: {
        tabId: string;
        openedAt?: number;
        lastSeenAt?: number;
        role?: TabRole;
        userId: string;
    },
): SessionState {
    if (!tab || typeof tab !== 'object') throw new Error('tab required');
    const { tabId, openedAt, role = 'collaborator', userId } = tab;
    if (!tabId) throw new Error('tab.tabId required');
    if (!userId) throw new Error('tab.userId required');
    if (!VALID_ROLES.has(role)) throw new Error(`invalid role: ${role}`);
    if (state.tabs.has(tabId)) throw new Error(`tab already registered: ${tabId}`);
    const tabs = cloneTabs(state.tabs);
    tabs.set(tabId, {
        tabId,
        openedAt: openedAt ?? 0,
        lastSeenAt: tab.lastSeenAt ?? openedAt ?? 0,
        role: role as TabRole,
        userId,
    });
    return freezeState({ ...state, tabs });
}

/**
 * Remove aba da sessão. Se holder do lock, libera. Idempotente.
 */
export function unregisterTab(state: SessionState, tabId: string): SessionState {
    if (!state.tabs.has(tabId)) return state;
    const tabs = cloneTabs(state.tabs);
    tabs.delete(tabId);
    const lockHolder = state.lockHolder === tabId ? null : state.lockHolder;
    return freezeState({ ...state, tabs, lockHolder });
}

/**
 * Atualiza heartbeat (lastSeenAt) da aba.
 * @throws se tabId desconhecido.
 */
export function updateHeartbeat(state: SessionState, tabId: string, timestamp: number): SessionState {
    if (!state.tabs.has(tabId)) throw new Error(`unknown tab: ${tabId}`);
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
        throw new Error('timestamp must be finite number');
    }
    const tabs = cloneTabs(state.tabs);
    const prev = tabs.get(tabId) as TabInfo;
    tabs.set(tabId, { ...prev, lastSeenAt: timestamp });
    return freezeState({ ...state, tabs });
}

/**
 * Retorna lista de abas com lastSeenAt > now - timeoutMs.
 */
export function getActiveTabs(state: SessionState, now: number, timeoutMs = 10000): TabInfo[] {
    const cutoff = now - timeoutMs;
    const out: TabInfo[] = [];
    for (const tab of state.tabs.values()) {
        if (tab.lastSeenAt > cutoff) out.push(tab);
    }
    return out;
}

/**
 * Solicita o lock de escrita. Granted apenas se livre ou já é o holder.
 */
export function requestLock(
    state: SessionState,
    tabId: string,
): { granted: boolean; state: SessionState } {
    if (!state.tabs.has(tabId)) throw new Error(`unknown tab: ${tabId}`);
    if (state.lockHolder !== null && state.lockHolder !== tabId) {
        return { granted: false, state };
    }
    if (state.lockHolder === tabId) {
        return { granted: true, state };
    }
    return { granted: true, state: freezeState({ ...state, lockHolder: tabId, tabs: cloneTabs(state.tabs) }) };
}

/**
 * Libera o lock. Apenas o holder pode liberar.
 * @throws se chamador não é holder.
 */
export function releaseLock(state: SessionState, tabId: string): SessionState {
    if (state.lockHolder !== tabId) {
        throw new Error(`tab ${tabId} is not lock holder (holder=${state.lockHolder})`);
    }
    return freezeState({ ...state, lockHolder: null, tabs: cloneTabs(state.tabs) });
}

/**
 * Transfere ownership de fromTabId para toTabId. Apenas owner atual pode transferir.
 * fromTabId vira 'collaborator', toTabId vira 'owner'.
 * @throws se fromTabId não é owner ou toTabId desconhecido.
 */
export function transferOwnership(state: SessionState, fromTabId: string, toTabId: string): SessionState {
    if (!state.tabs.has(fromTabId)) throw new Error(`unknown tab: ${fromTabId}`);
    if (!state.tabs.has(toTabId)) throw new Error(`unknown tab: ${toTabId}`);
    const from = state.tabs.get(fromTabId) as TabInfo;
    if (from.role !== 'owner') {
        throw new Error(`tab ${fromTabId} is not owner (role=${from.role})`);
    }
    if (fromTabId === toTabId) return state;
    const tabs = cloneTabs(state.tabs);
    tabs.set(fromTabId, { ...from, role: 'collaborator' });
    const to = tabs.get(toTabId) as TabInfo;
    tabs.set(toTabId, { ...to, role: 'owner' });
    return freezeState({ ...state, tabs });
}

/**
 * Sumário da sessão sob a ótica da aba atual.
 */
export function summarizeSession(
    state: SessionState,
    now: number,
    timeoutMs = 10000,
): {
    sessionId: string;
    tabCount: number;
    activeTabs: number;
    hasLock: boolean;
    lockHolder: string | null;
    role: TabRole | null;
} {
    const active = getActiveTabs(state, now, timeoutMs);
    const self = state.tabs.get(state.currentTabId) || null;
    return {
        sessionId: state.sessionId,
        tabCount: state.tabs.size,
        activeTabs: active.length,
        hasLock: state.lockHolder === state.currentTabId,
        lockHolder: state.lockHolder,
        role: self ? self.role : null,
    };
}
