// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export const EPI_CRITICALITIES = Object.freeze(['low', 'medium', 'high', 'critical']);
export const CRITICAL_TRACKING_LEVELS = Object.freeze(['high', 'critical']);
export const LOAN_STATUSES = Object.freeze(['active', 'returned', 'lost', 'damaged']);
export const LOW_STOCK_THRESHOLD_PCT = 0.2;

/**
 * @param item
 * @returns
 */
export function requiresSerialTracking(item: Record<string, unknown> | null | undefined): boolean {
    if (!item || typeof item !== 'object') return false;
    return typeof item.criticality === 'string' && CRITICAL_TRACKING_LEVELS.includes(item.criticality);
}

/**
 * @param item
 * @returns
 */
export function validateEpiItem(item: Record<string, unknown> | null | undefined): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];
    if (!item || typeof item !== 'object') return { valid: false, errors: ['not object'] };
    if (!item.id) errors.push('id required');
    if (!item.sku) errors.push('sku required');
    if (!item.name) errors.push('name required');
    if (typeof item.criticality !== 'string' || !EPI_CRITICALITIES.includes(item.criticality)) {
        errors.push(`criticality must be one of: ${EPI_CRITICALITIES.join(', ')}`);
    }
    if (typeof item.stockQty !== 'number' || !Number.isFinite(item.stockQty) || item.stockQty < 0) {
        errors.push('stockQty required, >=0');
    }
    if (typeof item.capacityQty !== 'number' || !Number.isFinite(item.capacityQty) || item.capacityQty <= 0) {
        errors.push('capacityQty required, >0');
    }
    if (requiresSerialTracking(item) && !Array.isArray(item.serials)) {
        errors.push('critical item requires serials array');
    }
    return { valid: errors.length === 0, errors };
}

/**
 * @param loan
 * @param unknown>
 * @returns
 */
export function validateLoan(
    loan: Record<string, unknown> | null | undefined,
    item?: Record<string, unknown> | null | undefined,
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!loan || typeof loan !== 'object') return { valid: false, errors: ['not object'] };
    if (!loan.id) errors.push('id required');
    if (!loan.itemId) errors.push('itemId required');
    if (!loan.userId) errors.push('userId required');
    if (typeof loan.status !== 'string' || !LOAN_STATUSES.includes(loan.status)) {
        errors.push(`status must be one of: ${LOAN_STATUSES.join(', ')}`);
    }
    if (typeof loan.qty !== 'number' || !Number.isFinite(loan.qty) || loan.qty <= 0) {
        errors.push('qty required, >0');
    }
    if (item && requiresSerialTracking(item) && typeof loan.serialNumber !== 'string') {
        errors.push('critical item requires serialNumber in loan');
    }
    return { valid: errors.length === 0, errors };
}

/**
 * @param item
 * @param unknown>
 * @returns
 */
export function withdrawStock(
    item: Record<string, unknown> | null | undefined,
    qty = 1,
): { ok: boolean; item?: Record<string, unknown>; reason?: string } {
    const n = Number(qty) || 0;
    if (n <= 0) return { ok: false, reason: 'invalid_qty' };
    if (!item || typeof item.stockQty !== 'number' || !Number.isFinite(item.stockQty)) {
        return { ok: false, reason: 'invalid_item' };
    }
    if (item.stockQty < n) return { ok: false, reason: 'insufficient_stock' };
    return { ok: true, item: { ...item, stockQty: item.stockQty - n } };
}

/**
 * @param item
 * @param unknown>
 * @returns
 */
export function returnStock(
    item: Record<string, unknown> | null | undefined,
    qty = 1,
): { ok: boolean; item?: Record<string, unknown>; reason?: string } {
    const n = Number(qty) || 0;
    if (n <= 0) return { ok: false, reason: 'invalid_qty' };
    if (
        !item ||
        typeof item.stockQty !== 'number' ||
        typeof item.capacityQty !== 'number' ||
        !Number.isFinite(item.stockQty) ||
        !Number.isFinite(item.capacityQty)
    ) {
        return { ok: false, reason: 'invalid_item' };
    }
    return { ok: true, item: { ...item, stockQty: Math.min(item.stockQty + n, item.capacityQty) } };
}

/**
 * @param item
 * @returns
 */
export function isLowStock(item: Record<string, unknown> | null | undefined): boolean {
    if (
        !item ||
        typeof item.stockQty !== 'number' ||
        typeof item.capacityQty !== 'number' ||
        !Number.isFinite(item.stockQty) ||
        !Number.isFinite(item.capacityQty) ||
        item.capacityQty === 0
    ) {
        return false;
    }
    return item.stockQty / item.capacityQty <= LOW_STOCK_THRESHOLD_PCT;
}

/**
 * @param item
 * @param unknown>
 * @returns
 */
export function isInspectionExpired(
    item: Record<string, unknown> | null | undefined,
    nowRef?: Date | string | number,
): boolean {
    if (!item || !item.nextInspectionAt) return false;
    const nextMs = new Date(item.nextInspectionAt as Date | string | number).getTime();
    if (!Number.isFinite(nextMs)) return false;
    const nowMs = nowRef ? new Date(nowRef).getTime() : Date.now();
    return nextMs < nowMs;
}

/**
 * @param item
 * @param unknown>
 * @returns
 */
export function daysUntilInspection(
    item: Record<string, unknown> | null | undefined,
    nowRef?: Date | string | number,
): number {
    if (!item || !item.nextInspectionAt) return Infinity;
    const nextMs = new Date(item.nextInspectionAt as Date | string | number).getTime();
    if (!Number.isFinite(nextMs)) return Infinity;
    const nowMs = nowRef ? new Date(nowRef).getTime() : Date.now();
    return (nextMs - nowMs) / 86_400_000;
}
