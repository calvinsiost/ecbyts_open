// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Notification Center - pure-logic, zero DOM
// Cross-cutting toast + persistent notification state container.
// All operations return new frozen state (immutable).

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export interface NotificationAction {
    readonly label: string;
    readonly actionId: string;
}

export interface NotificationEntry {
    readonly id: string;
    readonly severity: NotificationSeverity;
    readonly title: string;
    readonly message: string;
    readonly timestamp: number;
    readonly durationMs: number | null;
    readonly dismissed: boolean;
    readonly persistent: boolean;
    readonly actions: readonly NotificationAction[] | null;
}

export interface NotificationInput {
    readonly id?: unknown;
    readonly severity?: unknown;
    readonly title?: unknown;
    readonly message?: unknown;
    readonly timestamp?: unknown;
    readonly durationMs?: unknown;
    readonly dismissed?: unknown;
    readonly persistent?: unknown;
    readonly actions?: unknown;
}

export interface NotificationCenterOptions {
    readonly maxNotifications?: number;
}

export interface NotificationCenterState {
    readonly notifications: readonly NotificationEntry[];
    readonly maxNotifications: number;
}

export interface NotificationSummary {
    readonly total: number;
    readonly active: number;
    readonly dismissed: number;
    readonly bySeverity: Readonly<Record<NotificationSeverity, number>>;
}

const VALID_SEVERITIES = Object.freeze(['info', 'success', 'warning', 'error'] as const);

function isRecord(input: unknown): input is Record<string, unknown> {
    return input !== null && typeof input === 'object';
}

function isNotificationSeverity(input: unknown): input is NotificationSeverity {
    return typeof input === 'string' && (VALID_SEVERITIES as readonly string[]).includes(input);
}

function freezeState(
    notifications: readonly NotificationEntry[],
    maxNotifications: number,
): Readonly<NotificationCenterState> {
    return Object.freeze({
        notifications: Object.freeze(notifications.slice()),
        maxNotifications,
    });
}

/**
 * Create empty notification center state.
 */
export function createNotificationCenter({
    maxNotifications = 50,
}: NotificationCenterOptions = {}): Readonly<NotificationCenterState> {
    if (!Number.isInteger(maxNotifications) || maxNotifications <= 0) {
        throw new Error('maxNotifications must be a positive integer');
    }
    return freezeState([], maxNotifications);
}

function validateNotification(n: unknown): asserts n is NotificationInput {
    if (!isRecord(n)) throw new Error('notification must be an object');
    if (typeof n.id !== 'string' || n.id.length === 0) throw new Error('notification.id required');
    if (!isNotificationSeverity(n.severity)) throw new Error(`invalid severity: ${String(n.severity)}`);
    if (typeof n.title !== 'string') throw new Error('notification.title required');
    if (typeof n.message !== 'string') throw new Error('notification.message required');
    if (typeof n.timestamp !== 'number' || !Number.isFinite(n.timestamp)) {
        throw new Error('notification.timestamp must be finite number');
    }
    if (n.durationMs !== undefined && n.durationMs !== null) {
        if (typeof n.durationMs !== 'number' || n.durationMs <= 0) {
            throw new Error('durationMs must be > 0 when provided');
        }
    }
}

function normalizeActions(actions: unknown): readonly NotificationAction[] | null {
    if (!actions) return null;
    const list = actions as readonly { readonly label: unknown; readonly actionId: unknown }[];
    return Object.freeze(
        list.map((action) => Object.freeze({ label: String(action.label), actionId: String(action.actionId) })),
    );
}

function normalize(n: NotificationInput): Readonly<NotificationEntry> {
    return Object.freeze({
        id: String(n.id),
        severity: n.severity as NotificationSeverity,
        title: String(n.title),
        message: String(n.message),
        timestamp: Number(n.timestamp),
        durationMs: n.durationMs == null ? null : Number(n.durationMs),
        dismissed: Boolean(n.dismissed),
        persistent: Boolean(n.persistent),
        actions: normalizeActions(n.actions),
    });
}

/**
 * Append a notification. Throws on duplicate id or invalid input.
 * If exceeding cap, removes oldest non-persistent entries.
 */
export function pushNotification(
    state: NotificationCenterState,
    notification: unknown,
): Readonly<NotificationCenterState> {
    validateNotification(notification);
    if (state.notifications.some((n) => n.id === notification.id)) {
        throw new Error(`duplicate notification id: ${notification.id}`);
    }
    const next = state.notifications.slice();
    next.push(normalize(notification));
    while (next.length > state.maxNotifications) {
        const idx = next.findIndex((n) => !n.persistent);
        if (idx === -1) break; // all persistent - keep all
        next.splice(idx, 1);
    }
    return freezeState(next, state.maxNotifications);
}

export function dismissNotification(state: NotificationCenterState, id: string): Readonly<NotificationCenterState> {
    const idx = state.notifications.findIndex((n) => n.id === id);
    if (idx === -1) throw new Error(`notification not found: ${id}`);
    const next = state.notifications.slice();
    const current = next[idx];
    if (!current) throw new Error(`notification not found: ${id}`);
    next[idx] = Object.freeze({ ...current, dismissed: true });
    return freezeState(next, state.maxNotifications);
}

export function dismissAll(state: NotificationCenterState): Readonly<NotificationCenterState> {
    const next = state.notifications.map((n) =>
        n.persistent || n.dismissed ? n : Object.freeze({ ...n, dismissed: true }),
    );
    return freezeState(next, state.maxNotifications);
}

export function clearDismissed(state: NotificationCenterState): Readonly<NotificationCenterState> {
    const next = state.notifications.filter((n) => !n.dismissed);
    return freezeState(next, state.maxNotifications);
}

export function getActive(state: NotificationCenterState, now: number): readonly NotificationEntry[] {
    if (typeof now !== 'number' || !Number.isFinite(now)) {
        throw new Error('now must be finite number');
    }
    return state.notifications.filter((n) => {
        if (n.dismissed) return false;
        if (n.durationMs == null) return true;
        return now - n.timestamp < n.durationMs;
    });
}

export function getBySeverity(
    state: NotificationCenterState,
    severity: NotificationSeverity,
): readonly NotificationEntry[] {
    if (!VALID_SEVERITIES.includes(severity)) {
        throw new Error(`invalid severity: ${severity}`);
    }
    return state.notifications.filter((n) => n.severity === severity);
}

export function getPersistent(state: NotificationCenterState): readonly NotificationEntry[] {
    return state.notifications.filter((n) => n.persistent);
}

export function markAsRead(state: NotificationCenterState, id: string): Readonly<NotificationCenterState> {
    return dismissNotification(state, id);
}

export function summarizeNotifications(state: NotificationCenterState, now: number): Readonly<NotificationSummary> {
    if (typeof now !== 'number' || !Number.isFinite(now)) {
        throw new Error('now must be finite number');
    }
    const bySeverity: Record<NotificationSeverity, number> = { info: 0, success: 0, warning: 0, error: 0 };
    let active = 0;
    let dismissed = 0;
    for (const n of state.notifications) {
        bySeverity[n.severity]++;
        if (n.dismissed) {
            dismissed++;
        } else if (n.durationMs == null || now - n.timestamp < n.durationMs) {
            active++;
        } else {
            dismissed++; // expired counts as dismissed in summary
        }
    }
    return Object.freeze({
        total: state.notifications.length,
        active,
        dismissed,
        bySeverity: Object.freeze(bySeverity),
    });
}

export const __VALID_SEVERITIES = VALID_SEVERITIES;
