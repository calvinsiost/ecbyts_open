// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: core/operations/ticketManager
// Description: Ticket lifecycle state machine for field operations
//   (non-conformities, maintenance, inspections, emergencies, external reports)

// ================================================================
// CONSTANTS
// ================================================================

/** Valid ticket types */
export const TICKET_TYPES: string[] = ['non_conformity', 'maintenance', 'inspection', 'emergency', 'external_report'];

/** Valid ticket priorities */
export const TICKET_PRIORITIES: string[] = ['low', 'medium', 'high', 'critical'];

/** Valid ticket states */
export const TICKET_STATES: string[] = ['open', 'in_progress', 'resolved', 'closed', 'cancelled'];

/**
 * Valid state transitions: key = current state, value = allowed next states.
 * Cancelled and closed are terminal states (no further transitions allowed).
 */
export const VALID_TRANSITIONS = {
    open: ['in_progress', 'cancelled'],
    in_progress: ['resolved', 'open', 'cancelled'],
    resolved: ['closed', 'in_progress'],
    closed: [],
    cancelled: [],
};

// ================================================================
// IN-MEMORY STORE (caller is responsible for persistence)
// ================================================================

/** ticket store */
const _tickets = new Map<string, any>();

// ================================================================
// HELPERS
// ================================================================

/**
 * Generates a unique ID using crypto.randomUUID when available.
 */
function _genId(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Returns the current ISO timestamp string.
 */
function _now(): string {
    return new Date().toISOString();
}

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Creates a new ticket in state 'open'.
 * @param params
 */
export function createTicket({
    title,
    description = '',
    type,
    priority,
    reportedBy,
}: {
    title: string;
    description?: string;
    type: string;
    priority: string;
    reportedBy: string;
}): { ok: boolean; ticket?: object; error?: string } {
    if (!title || typeof title !== 'string' || !title.trim()) {
        return { ok: false, error: 'title is required' };
    }
    if (!TICKET_TYPES.includes(type)) {
        return { ok: false, error: `invalid type '${type}'. Must be one of: ${TICKET_TYPES.join(', ')}` };
    }
    if (!TICKET_PRIORITIES.includes(priority)) {
        return { ok: false, error: `invalid priority '${priority}'. Must be one of: ${TICKET_PRIORITIES.join(', ')}` };
    }
    if (!reportedBy || typeof reportedBy !== 'string') {
        return { ok: false, error: 'reportedBy is required' };
    }

    const id = _genId();
    const ts = _now();
    const ticket = {
        id,
        title: title.trim(),
        description,
        type,
        priority,
        state: 'open',
        reportedBy,
        assignedTo: null,
        resolution: null,
        cancellationReason: null,
        createdAt: ts,
        updatedAt: ts,
        comments: [],
        history: [{ state: 'open', actorId: reportedBy, timestamp: ts, note: 'Ticket created' }],
    };
    _tickets.set(id, ticket);
    return { ok: true, ticket: _snapshot(ticket) };
}

/**
 * Transitions a ticket to a new state.
 * @param id - Ticket ID
 * @param newState - Target state
 * @param actorId - Who is performing the transition
 */
export function transitionTicket(
    id: string,
    newState: string,
    actorId: string,
): { ok: boolean; ticket?: object; error?: string } {
    const ticket = _tickets.get(id);
    if (!ticket) return { ok: false, error: `ticket '${id}' not found` };
    if (!TICKET_STATES.includes(newState)) {
        return { ok: false, error: `invalid state '${newState}'` };
    }
    const allowed = (VALID_TRANSITIONS as Record<string, string[]>)[ticket.state] || [];
    if (!allowed.includes(newState)) {
        return {
            ok: false,
            error: `transition from '${ticket.state}' to '${newState}' is not allowed`,
        };
    }

    const ts = _now();
    ticket.state = newState;
    ticket.updatedAt = ts;
    ticket.history.push({ state: newState, actorId, timestamp: ts, note: null });
    return { ok: true, ticket: _snapshot(ticket) };
}

/**
 * Returns a ticket by ID.
 * @param id
 */
export function getTicket(id: string): { ok: boolean; ticket?: object; error?: string } {
    const ticket = _tickets.get(id);
    if (!ticket) return { ok: false, error: `ticket '${id}' not found` };
    return { ok: true, ticket: _snapshot(ticket) };
}

/**
 * Lists tickets with optional filter.
 * @param filter
 */
export function listTickets(
    filter: {
        state?: string;
        type?: string;
        priority?: string;
        reportedBy?: string;
        assignedTo?: string;
    } = {},
): { ok: boolean; tickets: object[] } {
    let result = Array.from(_tickets.values());
    if (filter.state) result = result.filter((t) => t.state === filter.state);
    if (filter.type) result = result.filter((t) => t.type === filter.type);
    if (filter.priority) result = result.filter((t) => t.priority === filter.priority);
    if (filter.reportedBy) result = result.filter((t) => t.reportedBy === filter.reportedBy);
    if (filter.assignedTo) result = result.filter((t) => t.assignedTo === filter.assignedTo);
    return { ok: true, tickets: result.map(_snapshot) };
}

/**
 * Resolves a ticket (moves to 'resolved' state) with a resolution note.
 * @param id - Ticket ID
 * @param resolution - Resolution description
 * @param actorId - Who is resolving
 */
export function resolveTicket(
    id: string,
    resolution: string,
    actorId: string,
): { ok: boolean; ticket?: object; error?: string } {
    const ticket = _tickets.get(id);
    if (!ticket) return { ok: false, error: `ticket '${id}' not found` };
    if (!resolution || typeof resolution !== 'string' || !resolution.trim()) {
        return { ok: false, error: 'resolution description is required' };
    }
    const allowed = (VALID_TRANSITIONS as Record<string, string[]>)[ticket.state] || [];
    if (!allowed.includes('resolved')) {
        return {
            ok: false,
            error: `cannot resolve ticket in state '${ticket.state}'`,
        };
    }

    const ts = _now();
    ticket.state = 'resolved';
    ticket.resolution = resolution.trim();
    ticket.updatedAt = ts;
    ticket.history.push({ state: 'resolved', actorId: actorId || 'system', timestamp: ts, note: resolution.trim() });
    return { ok: true, ticket: _snapshot(ticket) };
}

/**
 * Closes a resolved ticket.
 * @param id - Ticket ID
 * @param actorId? - Who is closing
 */
export function closeTicket(id: string, actorId?: string): { ok: boolean; ticket?: object; error?: string } {
    const ticket = _tickets.get(id);
    if (!ticket) return { ok: false, error: `ticket '${id}' not found` };
    if (ticket.state !== 'resolved') {
        return { ok: false, error: `ticket must be in 'resolved' state to close (current: '${ticket.state}')` };
    }

    const ts = _now();
    ticket.state = 'closed';
    ticket.updatedAt = ts;
    ticket.history.push({ state: 'closed', actorId: actorId || 'system', timestamp: ts, note: null });
    return { ok: true, ticket: _snapshot(ticket) };
}

/**
 * Cancels a ticket with a reason.
 * @param id - Ticket ID
 * @param reason - Cancellation reason
 * @param actorId? - Who is cancelling
 */
export function cancelTicket(
    id: string,
    reason: string,
    actorId?: string,
): { ok: boolean; ticket?: object; error?: string } {
    const ticket = _tickets.get(id);
    if (!ticket) return { ok: false, error: `ticket '${id}' not found` };
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
        return { ok: false, error: 'cancellation reason is required' };
    }
    const allowed = (VALID_TRANSITIONS as Record<string, string[]>)[ticket.state] || [];
    if (!allowed.includes('cancelled')) {
        return {
            ok: false,
            error: `ticket in state '${ticket.state}' cannot be cancelled`,
        };
    }

    const ts = _now();
    ticket.state = 'cancelled';
    ticket.cancellationReason = reason.trim();
    ticket.updatedAt = ts;
    ticket.history.push({ state: 'cancelled', actorId: actorId || 'system', timestamp: ts, note: reason.trim() });
    return { ok: true, ticket: _snapshot(ticket) };
}

/**
 * Adds a comment to a ticket.
 * @param id - Ticket ID
 * @param comment - Comment text
 * @param authorId - Comment author
 */
export function addTicketComment(
    id: string,
    comment: string,
    authorId: string,
): { ok: boolean; ticket?: object; error?: string } {
    const ticket = _tickets.get(id);
    if (!ticket) return { ok: false, error: `ticket '${id}' not found` };
    if (!comment || typeof comment !== 'string' || !comment.trim()) {
        return { ok: false, error: 'comment text is required' };
    }
    if (!authorId) return { ok: false, error: 'authorId is required' };
    if (ticket.state === 'closed' || ticket.state === 'cancelled') {
        return { ok: false, error: `cannot add comments to a '${ticket.state}' ticket` };
    }

    const ts = _now();
    ticket.comments.push({ id: _genId(), text: comment.trim(), authorId, timestamp: ts });
    ticket.updatedAt = ts;
    return { ok: true, ticket: _snapshot(ticket) };
}

/**
 * Returns the state transition history of a ticket.
 * @param id - Ticket ID
 */
export function getTicketHistory(id: string): { ok: boolean; history?: object[]; error?: string } {
    const ticket = _tickets.get(id);
    if (!ticket) return { ok: false, error: `ticket '${id}' not found` };
    return { ok: true, history: ticket.history.map((h: any) => ({ ...h })) };
}

/**
 * Clears all tickets (for test isolation).
 */
export function _clearAll(): void {
    _tickets.clear();
}

// ================================================================
// INTERNAL HELPERS
// ================================================================

/**
 * Returns a shallow snapshot of a ticket (immutable copy for callers).
 * @param t
 */
function _snapshot(t: any): any {
    return {
        ...t,
        comments: t.comments.map((c: any) => ({ ...c })),
        history: t.history.map((h: any) => ({ ...h })),
    };
}
