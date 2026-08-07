// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: core/operations/epiManager
// Description: EPI (Personal Protective Equipment) inventory and loan management.
//   Dual-track: SKU-based for low-risk categories, serial-tracked for critical
//   categories (respiratory, chemical, fall_protection) per NR-6 (MTE Brazil).

// ================================================================
// CONSTANTS
// ================================================================

/** Valid EPI categories */
export const EPI_CATEGORIES: string[] = [
    'respiratory',
    'hearing',
    'vision',
    'chemical',
    'fall_protection',
    'general',
];

/**
 * Categories that require serial number tracking (critical EPIs).
 * Per NR-6/MTE: these must be individually identified and inspected.
 */
export const SERIAL_TRACKED_CATEGORIES: Set<string> = new Set(['respiratory', 'chemical', 'fall_protection']);

/** Valid EPI item states */
export const EPI_STATES: string[] = ['available', 'loaned', 'maintenance', 'retired'];

/** Valid return conditions */
export const RETURN_CONDITIONS: string[] = ['good', 'damaged', 'needs_maintenance'];

// ================================================================
// IN-MEMORY STORE (caller is responsible for persistence)
// ================================================================

/** EPI item store */
const _items: Map<string, any> = new Map();

/** Loan record store */
const _loans: Map<string, any> = new Map();

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
 * Returns an immutable snapshot of an EPI item.
 */
function _itemSnap(item: any): object {
    return {
        ...item,
        damageReports: item.damageReports.map((d: any) => ({ ...d })),
    };
}

// ================================================================
// PUBLIC API
// ================================================================

/**
 * Creates a new EPI item in the inventory.
 * For critical categories (respiratory, chemical, fall_protection),
 * a serialNumber is required (serial-tracked dual track).
 * @param params.name - Human-readable name (e.g. "Half-face respirator 3M 6200")
 * @param params.sku - Stock-keeping unit code
 * @param params.serialNumber - Required for critical categories
 * @param params.category - One of EPI_CATEGORIES
 * @param params.certExpiry - ISO date string for CA (Certificado de Aprovacao) expiry
 * @param params.meta - Extra fields (manufacturer, model, etc.)
 */
export function createEpiItem({
    name,
    sku,
    serialNumber,
    category,
    certExpiry,
    meta = {},
}: {
    name: string;
    sku: string;
    serialNumber?: string;
    category: string;
    certExpiry?: string;
    meta?: object;
}): { ok: boolean; item?: object; error?: string } {
    if (!name || typeof name !== 'string' || !name.trim()) {
        return { ok: false, error: 'name is required' };
    }
    if (!sku || typeof sku !== 'string' || !sku.trim()) {
        return { ok: false, error: 'sku is required' };
    }
    if (!EPI_CATEGORIES.includes(category)) {
        return { ok: false, error: `invalid category '${category}'. Must be one of: ${EPI_CATEGORIES.join(', ')}` };
    }
    if (SERIAL_TRACKED_CATEGORIES.has(category) && (!serialNumber || !serialNumber.trim())) {
        return {
            ok: false,
            error: `serialNumber is required for critical category '${category}' (NR-6 serial tracking)`,
        };
    }

    const id = _genId();
    const ts = _now();
    const item = {
        id,
        name: name.trim(),
        sku: sku.trim(),
        serialNumber: serialNumber ? serialNumber.trim() : null,
        category,
        certExpiry: certExpiry || null,
        state: 'available',
        currentLoanId: null,
        meta,
        createdAt: ts,
        updatedAt: ts,
        damageReports: [],
    };
    _items.set(id, item);
    return { ok: true, item: _itemSnap(item) };
}

/**
 * Creates a loan record for an EPI item.
 * Item must be in 'available' state.
 * @param itemId - EPI item ID
 * @param employeeId - Employee receiving the EPI
 * @param returnByDate? - ISO date string for expected return
 */
export function loanEpi(
    itemId: string,
    employeeId: string,
    returnByDate?: string,
): { ok: boolean; item?: object; loanId?: string; error?: string } {
    const item = _items.get(itemId);
    if (!item) return { ok: false, error: `EPI item '${itemId}' not found` };
    if (item.state !== 'available') {
        return { ok: false, error: `EPI item is not available (current state: '${item.state}')` };
    }
    if (!employeeId) return { ok: false, error: 'employeeId is required' };

    const loanId = _genId();
    const ts = _now();
    const loan = {
        id: loanId,
        itemId,
        employeeId,
        loanedAt: ts,
        returnByDate: returnByDate || null,
        returnedAt: null,
        returnedBy: null,
        returnCondition: null,
    };
    _loans.set(loanId, loan);

    item.state = 'loaned';
    item.currentLoanId = loanId;
    item.updatedAt = ts;
    return { ok: true, item: _itemSnap(item), loanId };
}

/**
 * Records the return of a loaned EPI item.
 * @param itemId - EPI item ID
 * @param returnedBy - Who returned the item (employee or inspector)
 * @param condition - One of RETURN_CONDITIONS
 */
export function returnEpi(
    itemId: string,
    returnedBy: string,
    condition: string,
): { ok: boolean; item?: object; error?: string } {
    const item = _items.get(itemId);
    if (!item) return { ok: false, error: `EPI item '${itemId}' not found` };
    if (item.state !== 'loaned') {
        return { ok: false, error: `EPI item is not currently loaned (state: '${item.state}')` };
    }
    if (!RETURN_CONDITIONS.includes(condition)) {
        return {
            ok: false,
            error: `invalid condition '${condition}'. Must be one of: ${RETURN_CONDITIONS.join(', ')}`,
        };
    }
    if (!returnedBy) return { ok: false, error: 'returnedBy is required' };

    const ts = _now();

    // Update loan record
    const loan = _loans.get(item.currentLoanId);
    if (loan) {
        loan.returnedAt = ts;
        loan.returnedBy = returnedBy;
        loan.returnCondition = condition;
    }

    // Set new state based on condition
    const newState = condition === 'needs_maintenance' ? 'maintenance' : 'available';
    item.state = newState;
    item.currentLoanId = null;
    item.updatedAt = ts;
    return { ok: true, item: _itemSnap(item) };
}

/**
 * Lists all EPI items currently in 'available' state.
 */
export function listAvailable(): { ok: boolean; items: object[] } {
    const result = Array.from(_items.values())
        .filter((i) => i.state === 'available')
        .map(_itemSnap);
    return { ok: true, items: result };
}

/**
 * Lists all EPI items currently in 'loaned' state.
 */
export function listLoaned(): { ok: boolean; items: object[] } {
    const result = Array.from(_items.values())
        .filter((i) => i.state === 'loaned')
        .map(_itemSnap);
    return { ok: true, items: result };
}

/**
 * Returns a single EPI item by ID.
 * @param id - EPI item ID
 */
export function getEpiItem(id: string): { ok: boolean; item?: object; error?: string } {
    const item = _items.get(id);
    if (!item) return { ok: false, error: `EPI item '${id}' not found` };
    return { ok: true, item: _itemSnap(item) };
}

/**
 * Checks whether an EPI item's CA (Certificado de Aprovacao) is expired.
 * @param itemId - EPI item ID
 */
export function checkCertExpiry(
    itemId: string,
): { ok: boolean; expired?: boolean; certExpiry?: string | null; error?: string } {
    const item = _items.get(itemId);
    if (!item) return { ok: false, error: `EPI item '${itemId}' not found` };
    if (!item.certExpiry) {
        return { ok: true, expired: false, certExpiry: null };
    }
    const expDate = new Date(item.certExpiry);
    const expired = expDate < new Date();
    return { ok: true, expired, certExpiry: item.certExpiry };
}

/**
 * Records a damage report for an EPI item.
 * If item is available, transitions it to 'maintenance' state.
 * @param itemId - EPI item ID
 * @param description - Damage description
 * @param reportedBy - Who is reporting
 */
export function reportDamage(
    itemId: string,
    description: string,
    reportedBy: string,
): { ok: boolean; item?: object; error?: string } {
    const item = _items.get(itemId);
    if (!item) return { ok: false, error: `EPI item '${itemId}' not found` };
    if (item.state === 'retired') {
        return { ok: false, error: 'cannot report damage on a retired EPI item' };
    }
    if (!description || typeof description !== 'string' || !description.trim()) {
        return { ok: false, error: 'damage description is required' };
    }
    if (!reportedBy) return { ok: false, error: 'reportedBy is required' };

    const ts = _now();
    item.damageReports.push({
        id: _genId(),
        description: description.trim(),
        reportedBy,
        timestamp: ts,
    });

    // If available, move to maintenance
    if (item.state === 'available') {
        item.state = 'maintenance';
    }
    item.updatedAt = ts;
    return { ok: true, item: _itemSnap(item) };
}

/**
 * Clears all EPI items and loans (for test isolation).
 */
export function _clearAll(): void {
    _items.clear();
    _loans.clear();
}
