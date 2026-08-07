// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: core/operations/reservationManager
// Description: Resource booking with conflict detection for vehicles,
//   equipment, and laboratory slots used in environmental field operations.

// ================================================================
// CONSTANTS
// ================================================================

/** Valid resource types */
export const RESOURCE_TYPES: string[] = ['vehicle', 'equipment', 'laboratory_slot'];

/** Valid reservation states */
export const RESERVATION_STATES: string[] = ['active', 'cancelled'];

// ================================================================
// IN-MEMORY STORES (caller is responsible for persistence)
// ================================================================

/** resource store */
const _resources: Map<string, any> = new Map();

/** reservation store */
const _reservations: Map<string, any> = new Map();

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

/**
 * Checks whether two intervals [s1, e1) and [s2, e2) overlap.
 * Overlap: start < other.end && end > other.start
 * @param s1 - Start of interval 1 (ms timestamp)
 * @param e1 - End of interval 1 (ms timestamp)
 * @param s2 - Start of interval 2 (ms timestamp)
 * @param e2 - End of interval 2 (ms timestamp)
 */
function _overlaps(s1: number, e1: number, s2: number, e2: number): boolean {
    return s1 < e2 && e1 > s2;
}

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Creates a new resource that can be reserved.
 */
export function createResource({
    name,
    type,
    description = '',
    meta = {},
}: {
    name: string;
    type: string;
    description?: string;
    meta?: object;
}): { ok: boolean; resource?: object; error?: string } {
    if (!name || typeof name !== 'string' || !name.trim()) {
        return { ok: false, error: 'resource name is required' };
    }
    if (!RESOURCE_TYPES.includes(type)) {
        return { ok: false, error: `invalid resource type '${type}'. Must be one of: ${RESOURCE_TYPES.join(', ')}` };
    }

    const id = _genId();
    const ts = _now();
    const resource = {
        id,
        name: name.trim(),
        type,
        description,
        meta,
        createdAt: ts,
        updatedAt: ts,
    };
    _resources.set(id, resource);
    return { ok: true, resource: { ...resource } };
}

/**
 * Creates a reservation for a resource, checking for conflicts first.
 */
export function createReservation({
    resourceId,
    startTs,
    endTs,
    requestedBy,
    notes = '',
}: {
    resourceId: string;
    startTs: number;
    endTs: number;
    requestedBy: string;
    notes?: string;
}): { ok: boolean; reservation?: object; conflicts?: object[]; error?: string } {
    if (!_resources.has(resourceId)) {
        return { ok: false, error: `resource '${resourceId}' not found` };
    }
    if (typeof startTs !== 'number' || typeof endTs !== 'number') {
        return { ok: false, error: 'startTs and endTs must be numeric timestamps (ms)' };
    }
    if (endTs <= startTs) {
        return { ok: false, error: 'endTs must be after startTs' };
    }
    if (!requestedBy) {
        return { ok: false, error: 'requestedBy is required' };
    }

    const conflicts = getConflicts(resourceId, startTs, endTs);
    if (conflicts.length > 0) {
        return { ok: false, conflicts, error: `${conflicts.length} conflict(s) found for this time slot` };
    }

    const id = _genId();
    const ts = _now();
    const reservation = {
        id,
        resourceId,
        startTs,
        endTs,
        requestedBy,
        notes,
        state: 'active',
        cancelledBy: null,
        cancellationTs: null,
        createdAt: ts,
        updatedAt: ts,
    };
    _reservations.set(id, reservation);
    return { ok: true, reservation: { ...reservation }, conflicts: [] };
}

/**
 * Cancels an existing reservation.
 * @param id - Reservation ID
 * @param cancelledBy - Who is cancelling
 */
export function cancelReservation(
    id: string,
    cancelledBy: string,
): { ok: boolean; reservation?: object; error?: string } {
    const reservation = _reservations.get(id);
    if (!reservation) return { ok: false, error: `reservation '${id}' not found` };
    if (reservation.state === 'cancelled') {
        return { ok: false, error: 'reservation is already cancelled' };
    }
    if (!cancelledBy) return { ok: false, error: 'cancelledBy is required' };

    const ts = _now();
    reservation.state = 'cancelled';
    reservation.cancelledBy = cancelledBy;
    reservation.cancellationTs = ts;
    reservation.updatedAt = ts;
    return { ok: true, reservation: { ...reservation } };
}

/**
 * Returns active reservations that conflict with the given time window.
 * Two reservations overlap if: start < other.end && end > other.start
 * @param resourceId - Resource ID
 * @param startTs - Start timestamp (ms epoch)
 * @param endTs - End timestamp (ms epoch)
 * @returns Array of conflicting reservation objects
 */
export function getConflicts(resourceId: string, startTs: number, endTs: number): object[] {
    const result: object[] = [];
    for (const r of _reservations.values()) {
        if (r.resourceId !== resourceId) continue;
        if (r.state === 'cancelled') continue;
        if (_overlaps(startTs, endTs, r.startTs, r.endTs)) {
            result.push({ ...r });
        }
    }
    return result;
}

/**
 * Lists reservations for a resource, optionally filtered by date range.
 * @param resourceId - Resource ID
 */
export function listResourceReservations(
    resourceId: string,
    dateRange: { fromTs?: number; toTs?: number } = {},
): { ok: boolean; reservations?: object[]; error?: string } {
    if (!_resources.has(resourceId)) {
        return { ok: false, error: `resource '${resourceId}' not found` };
    }
    let result = Array.from(_reservations.values()).filter((r) => r.resourceId === resourceId);
    const fromTs = dateRange.fromTs;
    if (typeof fromTs === 'number') {
        result = result.filter((r) => r.endTs >= fromTs);
    }
    const toTs = dateRange.toTs;
    if (typeof toTs === 'number') {
        result = result.filter((r) => r.startTs <= toTs);
    }
    return { ok: true, reservations: result.map((r) => ({ ...r })) };
}

/**
 * Suggests the next available time slot for a resource.
 * Searches through existing active reservations and finds a gap >= durationMs.
 * @param resourceId - Resource ID
 * @param durationMs - Desired duration in milliseconds
 * @param afterTs - Search start (ms epoch); defaults to now
 */
export function suggestNextAvailable(
    resourceId: string,
    durationMs: number,
    afterTs: number,
): { ok: boolean; suggestion?: { startTs: number; endTs: number }; error?: string } {
    if (!_resources.has(resourceId)) {
        return { ok: false, error: `resource '${resourceId}' not found` };
    }
    if (typeof durationMs !== 'number' || durationMs <= 0) {
        return { ok: false, error: 'durationMs must be a positive number' };
    }

    const searchFrom = typeof afterTs === 'number' ? afterTs : Date.now();

    // Collect active reservations for this resource, sorted by startTs
    const active = Array.from(_reservations.values())
        .filter((r) => r.resourceId === resourceId && r.state === 'active' && r.endTs > searchFrom)
        .sort((a, b) => a.startTs - b.startTs);

    // Try gap before first reservation
    let cursor = searchFrom;
    for (const res of active) {
        if (res.startTs >= cursor + durationMs) {
            // Gap between cursor and this reservation's start
            return { ok: true, suggestion: { startTs: cursor, endTs: cursor + durationMs } };
        }
        // Move cursor to end of this reservation if it extends past current cursor
        if (res.endTs > cursor) {
            cursor = res.endTs;
        }
    }

    // No conflicts or gap found after last reservation
    return { ok: true, suggestion: { startTs: cursor, endTs: cursor + durationMs } };
}

/**
 * Clears all resources and reservations (for test isolation).
 */
export function _clearAll(): void {
    _resources.clear();
    _reservations.clear();
}
