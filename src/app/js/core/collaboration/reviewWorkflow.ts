// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Critical-change review workflow for the collaboration journey.
 *
 * Pure state machine for M11: critical fields enter pending_review and only
 * owner/admin roles can approve or reject. Persistence and UI are adapters.
 */

export const REVIEW_STATUS = Object.freeze({
    APPLIED: 'applied',
    PENDING: 'pending_review',
    APPROVED: 'approved',
    REJECTED: 'rejected',
});

const ROLE_RANK = Object.freeze({
    public: 0,
    viewer: 1,
    editor: 2,
    admin: 3,
    owner: 4,
});

function assertRole(role: any) {
    if (!Object.prototype.hasOwnProperty.call(ROLE_RANK, role)) {
        throw new Error(`invalid role: ${role}`);
    }
}

function canEdit(role: any) {
    assertRole(role);
    const rank = (ROLE_RANK) as Record<string, number>;
    return (rank[role] ?? 0) >= (rank.editor ?? 0);
}

function canReview(role: any) {
    assertRole(role);
    const rank = (ROLE_RANK) as Record<string, number>;
    return (rank[role] ?? 0) >= (rank.admin ?? 0);
}

function freezeChange(change: any) {
    return Object.freeze({
        id: change.id,
        modelId: change.modelId,
        elementId: change.elementId,
        field: change.field,
        previousValue: change.previousValue,
        nextValue: change.nextValue,
        requestedBy: change.requestedBy,
        requesterRole: change.requesterRole,
        requestedAt: change.requestedAt,
        status: change.status,
        reviewedBy: change.reviewedBy ?? null,
        reviewerRole: change.reviewerRole ?? null,
        reviewedAt: change.reviewedAt ?? null,
        reviewReason: change.reviewReason ?? null,
    });
}

function freezeState(state: any) {
    const changes = new Map();
    for (const [id, change] of state.changes) changes.set(id, freezeChange(change));
    return Object.freeze({
        criticalFields: new Set(state.criticalFields),
        changes,
    });
}

function cloneChanges(changes: any) {
    const out = new Map();
    for (const [id, change] of changes) out.set(id, { ...change });
    return out;
}

/**
 * Create a review state with exact-match critical field paths.
 *
 * @param {{criticalFields?:Iterable<string>}} [opts]
 * @returns {object}
 */
export function createReviewState(opts: {criticalFields?:Iterable<string>} = {}): object {
    return freezeState({
        criticalFields: new Set(opts.criticalFields || []),
        changes: new Map(),
    });
}

/**
 * Add critical field paths to the state.
 *
 * @param {Record<string, any>} state
 * @param {Iterable<string>} any>
 * @returns {Record<string, any>}
 */
export function registerCriticalFields(state: Record<string, any>, fields: Iterable<string>): Record<string, any> {
    if (!fields || typeof fields[Symbol.iterator] !== 'function') {
        throw new Error('registerCriticalFields: iterable fields required');
    }
    const criticalFields = new Set(state.criticalFields);
    for (const field of fields) {
        if (typeof field !== 'string' || field.trim().length === 0) {
            throw new Error('registerCriticalFields: field must be non-empty string');
        }
        criticalFields.add(field);
    }
    return freezeState({ criticalFields, changes: cloneChanges(state.changes) });
}

/**
 * Whether an exact field path requires admin review.
 *
 * @param {Record<string, any>} state
 * @param {string} any>
 * @returns {boolean}
 */
export function isCriticalField(state: Record<string, any>, field: string): boolean {
    return state.criticalFields.has(field);
}

/**
 * Submit a model change. Critical fields become pending_review; non-critical
 * editor changes are applied immediately.
 *
 * @param {Record<string, any>} state
 * @param {Record<string, any>} any>
 * @returns {{state: Record<string, any>, change: Record<string, any>}}
 */
export function submitChange(state: Record<string, any>, input: Record<string, any>): {state: Record<string, any>, change: Record<string, any>} {
    if (!input || typeof input !== 'object') throw new Error('submitChange: input required');
    const {
        id,
        modelId,
        elementId,
        field,
        previousValue = null,
        nextValue = null,
        requestedBy,
        requesterRole,
        requestedAt,
    } = input;
    if (!id || !modelId || !elementId || !field || !requestedBy) {
        throw new Error('submitChange: id, modelId, elementId, field, requestedBy required');
    }
    if (!canEdit(requesterRole)) throw new Error('submitChange: editor role required');
    if (typeof requestedAt !== 'number' || !Number.isFinite(requestedAt)) {
        throw new Error('submitChange: requestedAt must be finite number');
    }
    if (state.changes.has(id)) throw new Error(`submitChange: change ${id} already exists`);

    const changes = cloneChanges(state.changes);
    const status = isCriticalField(state, field) ? REVIEW_STATUS.PENDING : REVIEW_STATUS.APPLIED;
    const change = {
        id,
        modelId,
        elementId,
        field,
        previousValue,
        nextValue,
        requestedBy,
        requesterRole,
        requestedAt,
        status,
    };
    changes.set(id, change);
    const nextState = freezeState({ criticalFields: state.criticalFields, changes });
    return Object.freeze({ state: nextState, change: nextState.changes.get(id) });
}

function decideChange(
    state: any,
    id: any,
    input: any,
    status: any,
) {
    const change = state.changes.get(id);
    if (!change) throw new Error(`reviewChange: change ${id} not found`);
    if (change.status !== REVIEW_STATUS.PENDING) {
        throw new Error(`reviewChange: change ${id} is not pending_review`);
    }
    if (!input || !input.reviewedBy) throw new Error('reviewChange: reviewedBy required');
    if (!canReview(input.reviewerRole)) throw new Error('reviewChange: admin role required');
    if (typeof input.reviewedAt !== 'number' || !Number.isFinite(input.reviewedAt)) {
        throw new Error('reviewChange: reviewedAt must be finite number');
    }

    const changes = cloneChanges(state.changes);
    changes.set(id, {
        ...change,
        status,
        reviewedBy: input.reviewedBy,
        reviewerRole: input.reviewerRole,
        reviewedAt: input.reviewedAt,
        reviewReason: input.reason || null,
    });
    const nextState = freezeState({ criticalFields: state.criticalFields, changes });
    return Object.freeze({ state: nextState, change: nextState.changes.get(id) });
}

export function approveChange(state: any, id: any, input: any) {
    return decideChange(state, id, input, REVIEW_STATUS.APPROVED);
}

export function rejectChange(state: any, id: any, input: any) {
    return decideChange(state, id, input, REVIEW_STATUS.REJECTED);
}

/**
 * Return pending review items, optionally scoped by model/element.
 *
 * @param {Record<string, any>} state
 * @param {{modelId?:string,elementId?:string}} [filter]
 * @returns {ReadonlyArray<Record<string, any>>}
 */
export function getPendingReviews(state: Record<string, any>, filter: {modelId?:string,elementId?:string} = {}): ReadonlyArray<Record<string, any>> {
    const out = [];
    for (const change of state.changes.values()) {
        if (change.status !== REVIEW_STATUS.PENDING) continue;
        if (filter.modelId && change.modelId !== filter.modelId) continue;
        if (filter.elementId && change.elementId !== filter.elementId) continue;
        out.push(change);
    }
    out.sort((a, b) => a.requestedAt - b.requestedAt);
    return Object.freeze(out);
}

/**
 * Count review statuses for UI badges.
 *
 * @param {Record<string, any>} state
 * @returns {Record<string, any>}
 */
export function summarizeReviewState(state: Record<string, any>): Record<string, any> {
    
    const byStatus: Record<string, number>= {
        [REVIEW_STATUS.APPLIED]: 0,
        [REVIEW_STATUS.PENDING]: 0,
        [REVIEW_STATUS.APPROVED]: 0,
        [REVIEW_STATUS.REJECTED]: 0,
    };
    for (const change of state.changes.values()) {
        byStatus[change.status] = (byStatus[change.status] || 0) + 1;
    }
    return Object.freeze({
        changeCount: state.changes.size,
        criticalFieldCount: state.criticalFields.size,
        byStatus: Object.freeze(byStatus),
    });
}
