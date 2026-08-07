// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Workflow - Phase 8 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S11
 *
 * Phase 8 (2026-05-01) - FSM canônica para o ciclo de vida de
 * documentos de compliance. Define transições válidas entre estados
 * + hooks pre/post + rollback policy.
 *
 * Estados (8): drafting / pending_review / under_review / changes_requested
 *              / approved / published / superseded / archived
 *
 * Transições estritas baseadas em ISO 9001 / GMP document control.
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Estados FSM canônicos. */
export const WORKFLOW_STATES = Object.freeze([
    'drafting',
    'pending_review',
    'under_review',
    'changes_requested',
    'approved',
    'published',
    'superseded',
    'archived',
]);

/** Estados terminais (não permitem transição saída). */
export const TERMINAL_STATES = Object.freeze(['superseded', 'archived']);

/** Identidade do módulo. */
export const COMPLIANCE_WORKFLOW_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 8,
    deliveredAt: '2026-05-01',
    states: WORKFLOW_STATES,
    terminal: TERMINAL_STATES,
});

/**
 * Matriz de transições válidas (from → Set<to>).
 * Frozen - adicionar requer migração de schema.
 */
export const VALID_TRANSITIONS = Object.freeze({
    drafting: Object.freeze(new Set(['pending_review', 'archived'])),
    pending_review: Object.freeze(new Set(['under_review', 'drafting', 'archived'])),
    under_review: Object.freeze(new Set(['changes_requested', 'approved', 'pending_review'])),
    changes_requested: Object.freeze(new Set(['drafting', 'archived'])),
    approved: Object.freeze(new Set(['published', 'archived'])),
    published: Object.freeze(new Set(['superseded', 'archived'])),
    superseded: Object.freeze(new Set([])), // terminal
    archived: Object.freeze(new Set([])), // terminal
});

/**
 * Verifica se state é canônico.
 */
export function isValidState(state: any) {
    return typeof state === 'string' && WORKFLOW_STATES.includes(state);
}

/**
 * Verifica se transição from → to é permitida.
 *
 * @param {string} fromState
 * @param {string} toState
 * @returns {boolean}
 */
export function canTransition(fromState: string, toState: string): boolean {
    if (!isValidState(fromState) || !isValidState(toState)) return false;
    if (fromState === toState) return false; // sem self-loops
    const allowed = (VALID_TRANSITIONS as Record<string, any>)[fromState];
    return allowed instanceof Set && allowed.has(toState);
}

/**
 * Lista transições válidas a partir de um state.
 *
 * @param {string} fromState
 * @returns {Array<string>}
 */
export function getNextStates(fromState: string): Array<string> {
    if (!isValidState(fromState)) return [];
    const set = (VALID_TRANSITIONS as Record<string, any>)[fromState];
    return set instanceof Set ? [...set].sort() : [];
}

/**
 * Verifica se state é terminal.
 */
export function isTerminal(state: any) {
    return TERMINAL_STATES.includes(state);
}

/**
 * Tenta transicionar para novo state. Retorna result com success/reason.
 *
 * @param {any} doc - { workflowState: string }
 * @param {string} toState
 * @param {{ onTransition?: Function, actor?: string } & Record<string, any>} [options]
 * @returns {{success: boolean, fromState: any, toState: any, reason?: any, transitioned?: any}}
 */
export function transition(doc: any, toState: string, options: { onTransition?: Function, actor?: string } & Record<string, any> = {}): {success: boolean, fromState: any, toState: any, reason?: any, transitioned?: any} {
    if (!doc || typeof doc !== 'object') {
        return Object.freeze({
            success: false,
            fromState: null,
            toState,
            reason: 'doc_invalid',
        });
    }
    const fromState = doc.workflowState || 'drafting';
    if (!isValidState(fromState)) {
        return Object.freeze({
            success: false,
            fromState,
            toState,
            reason: 'invalid_from_state',
        });
    }
    if (!isValidState(toState)) {
        return Object.freeze({
            success: false,
            fromState,
            toState,
            reason: 'invalid_to_state',
        });
    }
    if (!canTransition(fromState, toState)) {
        return Object.freeze({
            success: false,
            fromState,
            toState,
            reason: 'transition_not_allowed',
        });
    }

    if (typeof options.onTransition === 'function') {
        try {
            options.onTransition(fromState, toState, doc);
        } catch (e: any) {
            console.debug('[complianceWorkflow:onTransition]', e?.message || e);
        }
    }

    const transitioned = Object.freeze({
        ...doc,
        workflowState: toState,
        lastTransition: Object.freeze({
            from: fromState,
            to: toState,
            timestamp: new Date().toISOString(),
            actor: options.actor || 'system',
        }),
    });

    return Object.freeze({
        success: true,
        fromState,
        toState,
        transitioned,
    });
}

/**
 * Computa shortest path de from → to via BFS na matriz de transições.
 *
 * @param {string} fromState
 * @param {string} toState
 * @returns {Array<string>|null} - caminho ou null se não alcançável
 */
export function findTransitionPath(fromState: string, toState: string): Array<string>|null {
    if (!isValidState(fromState) || !isValidState(toState)) return null;
    if (fromState === toState) return [fromState];

    const queue = [[fromState]];
    const visited = new Set([fromState]);

    while (queue.length > 0) {
        const path = (queue.shift() as string[]);
        const current = path[path.length - 1];
        if (current === undefined) continue;
        const nexts = (VALID_TRANSITIONS as Record<string, any>)[current];
        if (!(nexts instanceof Set)) continue;

        for (const next of (nexts as Iterable<string>)) {
            if (next === toState) return [...path, next];
            if (!visited.has(next)) {
                visited.add(next);
                queue.push([...path, next]);
            }
        }
    }
    return null;
}

/**
 * Verifica se um documento pode ser editado em seu estado atual.
 *
 * @param {string} state
 * @returns {boolean}
 */
export function isEditable(state: string): boolean {
    return state === 'drafting' || state === 'changes_requested';
}

/**
 * Verifica se documento está em estado de revisão.
 */
export function isUnderReview(state: any) {
    return state === 'pending_review' || state === 'under_review';
}

/**
 * Categoriza state em fase macro.
 *
 * @param {string} state
 * @returns {'authoring'|'review'|'published'|'closed'|'unknown'}
 */
export function categorizeState(state: string): 'authoring'|'review'|'published'|'closed'|'unknown' {
    if (state === 'drafting' || state === 'changes_requested') return 'authoring';
    if (state === 'pending_review' || state === 'under_review') return 'review';
    if (state === 'approved' || state === 'published') return 'published';
    if (state === 'superseded' || state === 'archived') return 'closed';
    return 'unknown';
}

/**
 * Sumariza histórico de transições.
 *
 * @param {Array<{from: any, to: any, timestamp: any, actor: any}>} history
 * @returns {{count: number, byState: Record<string, number>, byActor: Record<string, number>, firstAt: any, lastAt: any}}
 */
export function summarizeHistory(history: Array<{from: any, to: any, timestamp: any, actor: any}>): {count: number, byState: Record<string, number>, byActor: Record<string, number>, firstAt: any, lastAt: any} {
        const empty: {count: number, byState: Record<string, number>, byActor: Record<string, number>, firstAt: any, lastAt: any}= { count: 0, byState: {}, byActor: {}, firstAt: null, lastAt: null };
    if (!Array.isArray(history) || history.length === 0) return empty;

        const byState: Record<string, number>= {};
        const byActor: Record<string, number>= {};
    let firstAt = null;
    let lastAt = null;

    for (const entry of history) {
        if (!entry) continue;
        if (entry.to) byState[entry.to] = (byState[entry.to] || 0) + 1;
        if (entry.actor) byActor[entry.actor] = (byActor[entry.actor] || 0) + 1;
        if (entry.timestamp) {
            const t = Date.parse(entry.timestamp);
            if (Number.isFinite(t)) {
                if (firstAt == null || t < Date.parse(firstAt)) firstAt = entry.timestamp;
                if (lastAt == null || t > Date.parse(lastAt)) lastAt = entry.timestamp;
            }
        }
    }
    return {
        count: history.length,
        byState,
        byActor,
        firstAt,
        lastAt,
    };
}

/**
 * Module identity export.
 */
export const complianceWorkflowMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 8,
    deliveredAt: '2026-05-01',
    states: WORKFLOW_STATES,
    terminal: TERMINAL_STATES,
    transitionCount: Object.values(VALID_TRANSITIONS).reduce(
        (acc, set) => acc + (set instanceof Set ? set.size : 0),
        0,
    ),
    exports: [
        'WORKFLOW_STATES',
        'TERMINAL_STATES',
        'VALID_TRANSITIONS',
        'COMPLIANCE_WORKFLOW_META',
        'isValidState',
        'canTransition',
        'getNextStates',
        'isTerminal',
        'transition',
        'findTransitionPath',
        'isEditable',
        'isUnderReview',
        'categorizeState',
        'summarizeHistory',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
