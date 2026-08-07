// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CONSENSUS-MATRIX-001 F3 — Keyboard navigation state machine (pure-logic).
//
// Recebe estado atual + tecla pressionada → retorna próximo estado + ação.
// NÃO toca DOM — wire externo lê o resultado e move foco / dispara apply.
//
// Atalhos canônicos (RF-5):
//   Enter → aceita verdict atual (action: 'accept-current')
//   ↑     → navega para verdict anterior
//   ↓     → navega para próximo verdict
//   Tab   → pula para próximo verdict CRÍTICO (split/3way/low-conf)
//   Esc   → fecha modal (action: 'cancel')
//   Ctrl+Enter → aplica todos (se nenhum crítico pendente)
//
// Pure-logic 100%: sem DOM, sem rede, determinístico.

import type { ConsensusVerdict } from './_consensusMatrixBuilderPure';

export type NavAction =
    | 'noop'
    | 'navigate'
    | 'accept-current'
    | 'cancel'
    | 'apply-all';

export interface NavState {
    readonly currentIndex: number;
    readonly verdicts: ReadonlyArray<ConsensusVerdict>;
}

export interface NavKeyEvent {
    readonly key: string;
    readonly ctrlKey?: boolean;
    readonly shiftKey?: boolean;
    readonly altKey?: boolean;
    readonly metaKey?: boolean;
}

export interface NavResult {
    readonly nextIndex: number;
    readonly action: NavAction;
    readonly fieldId: string | null;
    readonly canApplyAll: boolean;
}

const CRITICAL: ReadonlySet<string> = new Set(['split', 'disagree-3way', 'low-confidence']);

/**
 * Defensive: input inválido → estado seguro (index 0, noop).
 */
function makeNoop(state: NavState): NavResult {
    const idx = clampIndex(state.currentIndex, state.verdicts.length);
    return Object.freeze({
        nextIndex: idx,
        action: 'noop' as NavAction,
        fieldId: state.verdicts[idx]?.fieldId ?? null,
        canApplyAll: !hasPendingCritical(state.verdicts),
    });
}

function clampIndex(idx: unknown, len: number): number {
    if (len <= 0) return 0;
    if (typeof idx !== 'number' || !Number.isFinite(idx)) return 0;
    const i = Math.floor(idx);
    if (i < 0) return 0;
    if (i >= len) return len - 1;
    return i;
}

/**
 * Verifica se ainda há verdicts críticos pendentes (não-aceitos).
 * Implementação canônica: any verdict com category critical.
 */
function hasPendingCritical(verdicts: ReadonlyArray<ConsensusVerdict>): boolean {
    for (const v of verdicts) {
        if (CRITICAL.has(v.category)) return true;
    }
    return false;
}

/**
 * Encontra próximo verdict crítico após o índice atual (Tab).
 * Retorna -1 se não houver mais críticos depois.
 */
function findNextCritical(verdicts: ReadonlyArray<ConsensusVerdict>, fromIdx: number): number {
    for (let i = fromIdx + 1; i < verdicts.length; i++) {
        if (CRITICAL.has(verdicts[i]!.category)) return i;
    }
    // wrap-around: procura do começo até fromIdx
    for (let i = 0; i <= fromIdx && i < verdicts.length; i++) {
        if (CRITICAL.has(verdicts[i]!.category)) return i;
    }
    return -1;
}

/**
 * Processa uma tecla pressionada sobre o estado de navegação atual.
 * Retorna o próximo estado + ação a executar.
 */
export function handleNavKey(state: unknown, event: unknown): NavResult {
    // Validação defensive
    if (!state || typeof state !== 'object') {
        return Object.freeze({ nextIndex: 0, action: 'noop' as NavAction, fieldId: null, canApplyAll: true });
    }
    const s = state as NavState;
    const verdicts = Array.isArray(s.verdicts) ? s.verdicts : [];
    const len = verdicts.length;
    if (len === 0) {
        return Object.freeze({ nextIndex: 0, action: 'noop' as NavAction, fieldId: null, canApplyAll: true });
    }

    if (!event || typeof event !== 'object') return makeNoop({ ...s, verdicts });
    const e = event as NavKeyEvent;
    const key = typeof e.key === 'string' ? e.key : '';
    const idx = clampIndex(s.currentIndex, len);
    const canApplyAll = !hasPendingCritical(verdicts);

    // Ctrl+Enter → apply all (se permitido)
    if (key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        if (canApplyAll) {
            return Object.freeze({
                nextIndex: idx,
                action: 'apply-all' as NavAction,
                fieldId: verdicts[idx]?.fieldId ?? null,
                canApplyAll: true,
            });
        }
        return makeNoop({ ...s, verdicts });
    }

    // Enter → accept current
    if (key === 'Enter') {
        return Object.freeze({
            nextIndex: idx,
            action: 'accept-current' as NavAction,
            fieldId: verdicts[idx]?.fieldId ?? null,
            canApplyAll,
        });
    }

    // Escape → cancel
    if (key === 'Escape') {
        return Object.freeze({
            nextIndex: idx,
            action: 'cancel' as NavAction,
            fieldId: verdicts[idx]?.fieldId ?? null,
            canApplyAll,
        });
    }

    // ArrowUp → previous
    if (key === 'ArrowUp') {
        const next = idx > 0 ? idx - 1 : len - 1; // wrap
        return Object.freeze({
            nextIndex: next,
            action: 'navigate' as NavAction,
            fieldId: verdicts[next]?.fieldId ?? null,
            canApplyAll,
        });
    }

    // ArrowDown → next
    if (key === 'ArrowDown') {
        const next = idx < len - 1 ? idx + 1 : 0; // wrap
        return Object.freeze({
            nextIndex: next,
            action: 'navigate' as NavAction,
            fieldId: verdicts[next]?.fieldId ?? null,
            canApplyAll,
        });
    }

    // Tab → next critical
    if (key === 'Tab' && !e.shiftKey) {
        const next = findNextCritical(verdicts, idx);
        if (next < 0) return makeNoop({ ...s, verdicts });
        return Object.freeze({
            nextIndex: next,
            action: 'navigate' as NavAction,
            fieldId: verdicts[next]?.fieldId ?? null,
            canApplyAll,
        });
    }

    return makeNoop({ ...s, verdicts });
}

/**
 * Calcula índice inicial do modal: primeiro verdict crítico, ou 0 se nenhum.
 */
export function initialFocusIndex(verdicts: unknown): number {
    if (!Array.isArray(verdicts) || verdicts.length === 0) return 0;
    for (let i = 0; i < verdicts.length; i++) {
        const v = verdicts[i] as ConsensusVerdict | undefined;
        if (v && CRITICAL.has(v.category)) return i;
    }
    return 0;
}

export const CONSENSUS_MODAL_NAV_META = Object.freeze({
    moduleId: 'consensus-matrix.modal-nav',
    version: 1,
    actions: Object.freeze(['noop', 'navigate', 'accept-current', 'cancel', 'apply-all'] as ReadonlyArray<NavAction>),
    criticalCategories: Object.freeze(['split', 'disagree-3way', 'low-confidence']),
});
