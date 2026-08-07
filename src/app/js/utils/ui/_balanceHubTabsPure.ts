// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * CBMD-001 F4.9 — state machine PURA das tabs do BalanceHub (sem DOM).
 *
 * O modal BalanceHub (F4, 🔒 D1) terá 3 abas: Saldos / Histórico /
 * Alertas. Esta máquina antecipa a lógica testável: seleção, navegação
 * por teclado (WAI-ARIA tabs — setas com wrap), serialização p/
 * `ecbyts-balance-prefs` (F4.8) e restauração defensiva.
 *
 * Consumida pelo wire DOM quando D1 destravar; cheap tests em
 * `tests/balance-hub-tabs-pure.test.mjs`.
 */

export type BalanceHubTabId = 'saldos' | 'historico' | 'alertas';

export const BALANCE_HUB_TABS: ReadonlyArray<BalanceHubTabId> = Object.freeze([
    'saldos',
    'historico',
    'alertas',
]);

export interface BalanceHubTabsState {
    readonly active: BalanceHubTabId;
    /** Tabs visitadas na sessão (lazy-render: só monta painel já visitado). */
    readonly visited: ReadonlyArray<BalanceHubTabId>;
}

export function isBalanceHubTabId(value: unknown): value is BalanceHubTabId {
    return typeof value === 'string' && (BALANCE_HUB_TABS as ReadonlyArray<string>).includes(value);
}

/** Estado inicial — aba "saldos" ativa (caso de uso nº 1: ver o saldo). */
export function createTabsState(initial?: unknown): BalanceHubTabsState {
    const active: BalanceHubTabId = isBalanceHubTabId(initial) ? initial : 'saldos';
    return Object.freeze({ active, visited: Object.freeze([active]) });
}

/** Seleciona aba. Id inválido → estado intocado (defensivo, nunca throw). */
export function selectTab(state: BalanceHubTabsState, tabId: unknown): BalanceHubTabsState {
    if (!state || !isBalanceHubTabId(tabId) || tabId === state.active) return state;
    const visited = state.visited.includes(tabId)
        ? state.visited
        : Object.freeze([...state.visited, tabId]);
    return Object.freeze({ active: tabId, visited });
}

/**
 * Navegação por teclado WAI-ARIA tabs: ArrowRight/ArrowLeft com wrap,
 * Home/End para extremos. Outras teclas → estado intocado.
 */
export function handleTabKey(state: BalanceHubTabsState, key: string): BalanceHubTabsState {
    if (!state) return state;
    const idx = BALANCE_HUB_TABS.indexOf(state.active);
    if (idx < 0) return state;
    const n = BALANCE_HUB_TABS.length;
    let next: BalanceHubTabId | undefined;
    switch (key) {
        case 'ArrowRight':
            next = BALANCE_HUB_TABS[(idx + 1) % n];
            break;
        case 'ArrowLeft':
            next = BALANCE_HUB_TABS[(idx - 1 + n) % n];
            break;
        case 'Home':
            next = BALANCE_HUB_TABS[0];
            break;
        case 'End':
            next = BALANCE_HUB_TABS[n - 1];
            break;
        default:
            return state;
    }
    return selectTab(state, next);
}

/** Serializa p/ persistência em `ecbyts-balance-prefs` (F4.8). */
export function serializeTabsState(state: BalanceHubTabsState): string {
    return JSON.stringify({ active: state?.active ?? 'saldos' });
}

/** Restaura de JSON persistido — qualquer corrupção → estado inicial. */
export function restoreTabsState(raw: string | null | undefined): BalanceHubTabsState {
    if (typeof raw !== 'string' || !raw) return createTabsState();
    try {
        const parsed = JSON.parse(raw);
        return createTabsState(parsed?.active);
    } catch {
        return createTabsState();
    }
}

/** ViewModel de uma aba p/ render (aria-selected, tabindex roving). */
export interface BalanceHubTabVm {
    readonly id: BalanceHubTabId;
    readonly labelKey: string;
    readonly selected: boolean;
    readonly tabIndex: 0 | -1;
    /** Painel deve estar montado? (lazy-render: ativo OU já visitado) */
    readonly mounted: boolean;
}

export function buildTabsVm(state: BalanceHubTabsState): ReadonlyArray<BalanceHubTabVm> {
    const s = state || createTabsState();
    return Object.freeze(
        BALANCE_HUB_TABS.map((id) =>
            Object.freeze({
                id,
                labelKey: `balance.hub.tab.${id}`,
                selected: id === s.active,
                tabIndex: (id === s.active ? 0 : -1) as 0 | -1,
                mounted: id === s.active || s.visited.includes(id),
            }),
        ),
    );
}
