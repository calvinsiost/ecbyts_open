// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Offline Mutation Queue - pure-logic FIFO queue for replaying mutations
// when connectivity returns. Phase 2 of SPEC_ERROR_RECOVERY_JOURNEY (UX-42).
//
// Puro: zero DOM, zero rede, zero side effects. Imutável: cada operação
// retorna um novo state frozen com queue array frozen e mutations frozen.

import { decideRetry } from './_retryPolicyPure.js';

const VALID_OPERATIONS = new Set(['create', 'update', 'delete'] as const);
const VALID_STATUSES = new Set(['pending', 'syncing', 'failed', 'completed'] as const);
const DEFAULT_MAX_RETRIES = 3;

export interface Mutation {
    id: string;
    timestamp: number;
    operation: 'create' | 'update' | 'delete';
    resourceType: string;
    resourceId: string;
    payload: unknown;
    retryCount: number;
    status: 'pending' | 'syncing' | 'failed' | 'completed';
    lastError?: string;
}

export interface QueueState {
    readonly queue: readonly Mutation[];
    readonly maxRetries: number;
    readonly isOnline: boolean;
}

function freezeMutation(m: unknown): Mutation {
    return Object.freeze({ ...m as Mutation });
}

function freezeState({ queue, maxRetries, isOnline }: { queue: readonly Mutation[], maxRetries: number, isOnline: boolean }): QueueState {
    return Object.freeze({
        queue: Object.freeze(queue.map(freezeMutation)),
        maxRetries,
        isOnline,
    });
}

/**
 * Cria estado inicial vazio.
 */
export function createQueueState(opts: { maxRetries?: number, isOnline?: boolean } = {}): QueueState {
    const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    const isOnline = opts.isOnline ?? true;
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
        throw new Error('maxRetries must be a non-negative integer');
    }
    if (typeof isOnline !== 'boolean') {
        throw new Error('isOnline must be a boolean');
    }
    return freezeState({ queue: [], maxRetries, isOnline });
}

function validateMutationInput(m: unknown): void {
    if (!m || typeof m !== 'object') throw new Error('mutation must be an object');
    const mutation = m as Mutation;
    if (typeof mutation.id !== 'string' || !mutation.id) throw new Error('mutation.id required');
    if (typeof mutation.timestamp !== 'number' || !Number.isFinite(mutation.timestamp)) {
        throw new Error('mutation.timestamp must be a finite number');
    }
    if (!(VALID_OPERATIONS as Set<string>).has(mutation.operation)) {
        throw new Error(`invalid operation: ${mutation.operation}`);
    }
    if (typeof mutation.resourceType !== 'string' || !mutation.resourceType) {
        throw new Error('mutation.resourceType required');
    }
    if (typeof mutation.resourceId !== 'string' || !mutation.resourceId) {
        throw new Error('mutation.resourceId required');
    }
}

/**
 * Enfileira uma nova mutation. Status forçado a 'pending', retryCount=0.
 */
export function enqueueMutation(state: QueueState, mutation: Mutation): QueueState {
    validateMutationInput(mutation);
    if (state.queue.some((m) => m.id === mutation.id)) {
        throw new Error(`mutation with id "${mutation.id}" already exists in queue`);
    }
    const next: Mutation = {
        id: mutation.id,
        timestamp: mutation.timestamp,
        operation: mutation.operation,
        resourceType: mutation.resourceType,
        resourceId: mutation.resourceId,
        payload: mutation.payload,
        retryCount: 0,
        status: 'pending',
    };
    return freezeState({
        queue: [...state.queue, next],
        maxRetries: state.maxRetries,
        isOnline: state.isOnline,
    });
}

function updateMutation(state: QueueState, mutationId: string, updater: (m: Mutation) => Mutation): QueueState {
    const idx = state.queue.findIndex((m) => m.id === mutationId);
    if (idx === -1) {
        throw new Error(`mutation with id "${mutationId}" not found in queue`);
    }
    const target = state.queue[idx];
    if (!target) {
        throw new Error(`mutation with id "${mutationId}" not found in queue`);
    }
    const updated = updater(target);
    if (!(VALID_STATUSES as Set<string>).has(updated.status)) {
        throw new Error(`invalid status: ${updated.status}`);
    }
    const newQueue = [...state.queue];
    newQueue[idx] = updated;
    return freezeState({
        queue: newQueue,
        maxRetries: state.maxRetries,
        isOnline: state.isOnline,
    });
}

/**
 * Marca mutation como 'syncing'.
 */
export function markSyncing(state: QueueState, mutationId: string): QueueState {
    return updateMutation(state, mutationId, (m) => ({ ...m, status: 'syncing' }));
}

/**
 * Marca mutation como 'completed'.
 */
export function markCompleted(state: QueueState, mutationId: string): QueueState {
    return updateMutation(state, mutationId, (m) => ({ ...m, status: 'completed' }));
}

/**
 * Marca mutation como falhada. Incrementa retryCount; se >= maxRetries
 * status='failed', senão volta a 'pending' para retry futuro.
 */
export function markFailed(state: QueueState, mutationId: string, error: string): QueueState {
    if (typeof error !== 'string' || !error) {
        throw new Error('error message required');
    }
    return updateMutation(state, mutationId, (m) => {
        const { retryCount, status } = decideRetry(m.retryCount, state.maxRetries);
        return { ...m, retryCount, status, lastError: error };
    });
}

/**
 * Atualiza flag de conectividade.
 */
export function setOnline(state: QueueState, isOnline: boolean): QueueState {
    if (typeof isOnline !== 'boolean') {
        throw new Error('isOnline must be a boolean');
    }
    return freezeState({
        queue: state.queue.slice(),
        maxRetries: state.maxRetries,
        isOnline,
    });
}

/**
 * Mutations prontas para sync: status='pending' E isOnline=true.
 */
export function getReadyToSync(state: QueueState): readonly Mutation[] {
    if (!state.isOnline) return Object.freeze([]);
    return Object.freeze(state.queue.filter((m) => m.status === 'pending').map(freezeMutation));
}

/**
 * Mutations com status='failed' (retries esgotados).
 */
export function getFailedMutations(state: QueueState): readonly Mutation[] {
    return Object.freeze(state.queue.filter((m) => m.status === 'failed').map(freezeMutation));
}

/**
 * Total de mutations com status='pending'.
 */
export function getPendingCount(state: QueueState): number {
    return state.queue.filter((m) => m.status === 'pending').length;
}

/**
 * Remove mutations 'completed' do queue.
 */
export function purgeCompleted(state: QueueState): QueueState {
    return freezeState({
        queue: state.queue.filter((m) => m.status !== 'completed'),
        maxRetries: state.maxRetries,
        isOnline: state.isOnline,
    });
}

/**
 * Sumário do queue por status.
 */
export function summarizeQueue(state: QueueState): Readonly<Record<string, unknown>> {
    const summary: Record<string, unknown> = {
        total: state.queue.length,
        pending: 0,
        syncing: 0,
        failed: 0,
        completed: 0,
        isOnline: state.isOnline,
    };
    for (const m of state.queue) {
        const status = m.status as keyof typeof summary;
        if (typeof summary[status] === 'number') {
            summary[status] = (summary[status] as number) + 1;
        }
    }
    return Object.freeze(summary);
}