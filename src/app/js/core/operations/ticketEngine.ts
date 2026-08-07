// AGPL-3.0

export interface TicketHistoryEntry {
    at: string;
    from: string;
    to: string;
    userId: string | null;
    note: string | null;
}

export interface Ticket {
    id?: string;
    type?: string;
    status?: string;
    priority?: string;
    createdBy?: string;
    elementId?: string | null;
    createdAt?: string;
    updatedAt?: string;
    slaHours?: number | string;
    history?: readonly TicketHistoryEntry[];
}

export interface TransitionContext {
    userId?: string;
    note?: string;
    now?: string;
}

export const TICKET_TYPES = ['non_conformity', 'work_order', 'epi_request'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const DEFAULT_SLA_HOURS = {
    non_conformity: 2,
    work_order: 24,
    epi_request: 72,
} as const;

const TICKET_TRANSITIONS: Readonly<Record<string, ReadonlyArray<string>>> = {
    open: ['in_progress', 'closed'],
    in_progress: ['resolved', 'closed', 'open'],
    resolved: ['closed', 'in_progress'],
    closed: [],
};

export function isValidTicketType(type: string): boolean {
    return typeof type === 'string' && (TICKET_TYPES as readonly string[]).includes(type);
}

export function isValidTicketStatus(status: string): boolean {
    return typeof status === 'string' && (TICKET_STATUSES as readonly string[]).includes(status);
}

export function validateTicket(ticket: Ticket | null | undefined): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!ticket || typeof ticket !== 'object') {
        return { valid: false, errors: ['not object'] };
    }
    if (!ticket.id) errors.push('id required');
    if (typeof ticket.type !== 'string' || !isValidTicketType(ticket.type)) {
        errors.push(`type must be one of: ${TICKET_TYPES.join(', ')}`);
    }
    if (typeof ticket.status !== 'string' || !isValidTicketStatus(ticket.status)) {
        errors.push(`status must be one of: ${TICKET_STATUSES.join(', ')}`);
    }
    if (ticket.priority && !(TICKET_PRIORITIES as readonly string[]).includes(ticket.priority)) {
        errors.push(`priority must be one of: ${TICKET_PRIORITIES.join(', ')}`);
    }
    if (!ticket.createdBy) errors.push('createdBy required');
    if (ticket.elementId != null && typeof ticket.elementId !== 'string') {
        errors.push('elementId must be string or null');
    }
    return { valid: errors.length === 0, errors };
}

export function canTransitionTicket(from: string, to: string): { allowed: boolean; reason: string } {
    if (!isValidTicketStatus(from)) return { allowed: false, reason: 'invalid_from' };
    if (!isValidTicketStatus(to)) return { allowed: false, reason: 'invalid_to' };
    if (from === to) return { allowed: false, reason: 'no_op' };

    const allowed = TICKET_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
        return { allowed: false, reason: `cannot transition ${from} -> ${to}` };
    }
    return { allowed: true, reason: 'ok' };
}

export function transitionTicket(
    ticket: Ticket,
    toStatus: string,
    ctx: TransitionContext = {},
): { ok: boolean; ticket?: Ticket; reason?: string } {
    const check = canTransitionTicket(ticket.status || '', toStatus);
    if (!check.allowed) return { ok: false, reason: check.reason };

    const now = ctx.now || new Date().toISOString();
    const historyEntry: TicketHistoryEntry = Object.freeze({
        at: now,
        from: ticket.status || '',
        to: toStatus,
        userId: ctx.userId || null,
        note: ctx.note || null,
    });
    return {
        ok: true,
        ticket: {
            ...ticket,
            status: toStatus,
            updatedAt: now,
            history: [...(ticket.history || []), historyEntry],
        },
    };
}

export function computeSlaRemainingHours(ticket: Ticket | null | undefined, nowRef?: Date | string): number {
    if (!ticket || !ticket.createdAt) return Infinity;
    const typeKey = (ticket.type || '') as keyof typeof DEFAULT_SLA_HOURS;
    const slaHours = Number(ticket.slaHours) || DEFAULT_SLA_HOURS[typeKey] || 24;
    const createdMs = new Date(ticket.createdAt).getTime();
    const nowMs = nowRef ? new Date(nowRef).getTime() : Date.now();
    const elapsedHours = (nowMs - createdMs) / (1000 * 60 * 60);
    return slaHours - elapsedHours;
}

export function classifySlaSeverity(hoursRemaining: number): 'urgent' | 'warning' | 'ok' | 'expired' {
    if (!Number.isFinite(hoursRemaining)) return 'ok';
    if (hoursRemaining < 0) return 'expired';
    if (hoursRemaining < 4) return 'urgent';
    if (hoursRemaining < 12) return 'warning';
    return 'ok';
}