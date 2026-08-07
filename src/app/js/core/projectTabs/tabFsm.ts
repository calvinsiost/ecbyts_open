// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * tabFsm.js - Project Tabs Lifecycle Finite State Machine
 *
 * Puro (sem DOM, sem IDB, sem BroadcastChannel). Estados do ciclo de vida
 * de uma aba de projeto em memória.
 *
 * Estados:
 *   UNINITIALIZED → OPEN → (PINNED ↔ OPEN) → ARCHIVED → CLOSED
 *
 * Transições válidas (explicit matrix):
 *   UNINITIALIZED → OPEN
 *   OPEN          → PINNED, ARCHIVED, CLOSED
 *   PINNED        → OPEN, ARCHIVED, CLOSED
 *   ARCHIVED      → OPEN, CLOSED
 *   CLOSED        → (terminal)
 *
 * Invariante: CLOSED é terminal. Tentativas de transitar a partir de CLOSED
 * devolvem ProjectTabFsmError('terminal_state').
 */

export const TAB_STATE = {
    UNINITIALIZED: 'UNINITIALIZED',
    OPEN: 'OPEN',
    PINNED: 'PINNED',
    ARCHIVED: 'ARCHIVED',
    CLOSED: 'CLOSED',
} as const;

export type TabState = (typeof TAB_STATE)[keyof typeof TAB_STATE];

const VALID_TRANSITIONS = {
    UNINITIALIZED: Object.freeze(['OPEN']),
    OPEN: Object.freeze(['PINNED', 'ARCHIVED', 'CLOSED']),
    PINNED: Object.freeze(['OPEN', 'ARCHIVED', 'CLOSED']),
    ARCHIVED: Object.freeze(['OPEN', 'CLOSED']),
    CLOSED: Object.freeze([]),
} as const;

export class ProjectTabFsmError extends Error {
    public readonly code: string;
    public readonly details: Record<string, unknown>;

    constructor(code: string, details: Record<string, unknown> = {}) {
        super(`[ProjectTabFsm] ${code} ${JSON.stringify(details)}`);
        this.name = 'ProjectTabFsmError';
        this.code = code;
        this.details = details;
    }
}

/**
 * Verifica se transição é permitida por matriz. Pura.
 */
export function canTransition(from: string, to: string): boolean {
    if (typeof from !== 'string' || typeof to !== 'string') return false;
    const allowed = VALID_TRANSITIONS[from as keyof typeof VALID_TRANSITIONS];
    if (!allowed) return false;
    return (allowed as readonly string[]).includes(to);
}

/**
 * Lista estados alcançáveis a partir de `from`. Pura.
 */
export function nextStates(from: string): string[] {
    const allowed = VALID_TRANSITIONS[from as keyof typeof VALID_TRANSITIONS];
    return allowed ? Array.from(allowed) : [];
}

/**
 * Valida que `state` é um estado conhecido.
 */
export function isValidState(state: string): boolean {
    return typeof state === 'string' && Object.prototype.hasOwnProperty.call(TAB_STATE, state);
}

/**
 * Aplica transição; retorna novo estado ou lança ProjectTabFsmError.
 * Nunca muta input. Determinística.
 */
export function transition(from: string, to: string): string {
    if (!isValidState(from)) {
        throw new ProjectTabFsmError('unknown_from_state', { from });
    }
    if (!isValidState(to)) {
        throw new ProjectTabFsmError('unknown_to_state', { to });
    }
    if (from === 'CLOSED') {
        throw new ProjectTabFsmError('terminal_state', { from, to });
    }
    if (!canTransition(from, to)) {
        throw new ProjectTabFsmError('invalid_transition', { from, to });
    }
    return to;
}

export interface FsmDescription {
    readonly states: string[];
    readonly transitions: Readonly<Record<string, string[]>>;
    readonly terminal: string[];
}

/**
 * Snapshot frozen das regras (para inspeção/debug).
 */
export function describeFsm(): FsmDescription {
    const matrix: Record<string, string[]> = {};
    for (const k of Object.keys(VALID_TRANSITIONS)) {
        const allowed = VALID_TRANSITIONS[k as keyof typeof VALID_TRANSITIONS];
        matrix[k] = allowed ? Array.from(allowed) : [];
    }
    return Object.freeze({
        states: Object.values(TAB_STATE),
        transitions: Object.freeze(matrix),
        terminal: ['CLOSED'],
    });
}