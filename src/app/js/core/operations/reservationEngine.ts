// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export const RESERVATION_STATUSES = ['pending', 'confirmed', 'in_use', 'returned', 'cancelled'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];
export const MAX_RECURRENCES = 12;

export interface ReservationValidationResult {
    valid: boolean;
    errors: string[];
}

export interface DateRange {
    startAt: string | number | Date;
    endAt: string | number | Date;
}

export interface RecurrenceConfig {
    type: 'daily' | 'weekly';
    count: number;
}

export interface NextFreeSlot {
    startAt: string;
    endAt: string;
}

export function validateReservation(reservation: Record<string, unknown> | null | undefined): ReservationValidationResult {
    const errors: string[] = [];
    if (!reservation || typeof reservation !== 'object') return { valid: false, errors: ['not object'] };
    if (!('id' in reservation) || !reservation.id) errors.push('id required');
    if (!('resourceId' in reservation) || !reservation.resourceId) errors.push('resourceId required');
    if (!('userId' in reservation) || !reservation.userId) errors.push('userId required');
    if (typeof (reservation as any).status !== 'string' || !RESERVATION_STATUSES.includes((reservation as any).status)) {
        errors.push(`status must be one of: ${RESERVATION_STATUSES.join(', ')}`);
    }

    const start = new Date((reservation as any).startAt).getTime();
    const end = new Date((reservation as any).endAt).getTime();
    if (!Number.isFinite(start)) errors.push('startAt invalid');
    if (!Number.isFinite(end)) errors.push('endAt invalid');
    if (Number.isFinite(start) && Number.isFinite(end) && end <= start) {
        errors.push('endAt must be after startAt');
    }
    return { valid: errors.length === 0, errors };
}

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
    const startA = new Date(a.startAt).getTime();
    const endA = new Date(a.endAt).getTime();
    const startB = new Date(b.startAt).getTime();
    const endB = new Date(b.endAt).getTime();
    if (![startA, endA, startB, endB].every(Number.isFinite)) return false;
    return startA < endB && startB < endA;
}

export function findConflicts(existing: Array<Record<string, unknown>>, newReservation: Record<string, unknown>): Array<Record<string, unknown>> {
    if (!Array.isArray(existing)) return [];
    return existing.filter((reservation) => {
        if (!reservation || reservation.id === newReservation.id) return false;
        if (reservation.resourceId !== newReservation.resourceId) return false;
        if (reservation.status === 'cancelled' || reservation.status === 'returned') return false;
        return rangesOverlap(
            reservation as unknown as DateRange,
            newReservation as unknown as DateRange,
        );
    });
}

export function suggestNextFreeSlot(existing: Array<Record<string, unknown>>, newReservation: Record<string, unknown>): NextFreeSlot | null {
    const conflicts = findConflicts(existing, newReservation);
    if (conflicts.length === 0) return null;

    const latestEndMs = conflicts.reduce((max, reservation) => {
        const end = new Date((reservation as any).endAt).getTime();
        return Number.isFinite(end) && end > max ? end : max;
    }, 0);
    if (!Number.isFinite(latestEndMs)) return null;

    const start = new Date((newReservation as any).startAt).getTime();
    const end = new Date((newReservation as any).endAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    const durationMs = end - start;
    return {
        startAt: new Date(latestEndMs).toISOString(),
        endAt: new Date(latestEndMs + durationMs).toISOString(),
    };
}

export function expandRecurrence(baseReservation: Record<string, unknown>, recurrence: RecurrenceConfig): Array<Record<string, unknown>> {
    if (!baseReservation || !recurrence) return [baseReservation];
    const count = Math.min(Math.max(1, Number(recurrence.count) || 1), MAX_RECURRENCES);
    const type = recurrence.type;
    if (type !== 'daily' && type !== 'weekly') return [baseReservation];

    const stepMs = type === 'daily' ? 86_400_000 : 7 * 86_400_000;
    const startMs = new Date((baseReservation as any).startAt).getTime();
    const endMs = new Date((baseReservation as any).endAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [baseReservation];

    const out: Array<Record<string, unknown>> = [];
    for (let i = 0; i < count; i++) {
        out.push({
            ...baseReservation,
            id: `${String((baseReservation as any).id)}-rec-${i}`,
            startAt: new Date(startMs + i * stepMs).toISOString(),
            endAt: new Date(endMs + i * stepMs).toISOString(),
            recurrenceIndex: i,
        });
    }
    return out;
}