// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * notificationSchema.ts - Phase 2 TS source for notifications schema and factory.
 *
 * Promotes @typedef NotificationInput / Notification to exported interfaces.
 * No behavior change — drop-in replacement when build:app:ts copies to app/js/.
 */

export const NOTIFICATION_TYPES = Object.freeze({
    PURCHASE: 'purchase',
    COMMENT: 'comment',
    MENTION: 'mention',
    REVIEW_PENDING: 'review_pending',
    LIKE: 'like',
    FOLLOW: 'follow',
    SYSTEM: 'system',
    SHARE: 'share',
    DEADLINE: 'deadline',
} as const);

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const NOTIFICATION_PRIORITY = Object.freeze({
    P0: 'critical',
    P1: 'high',
    P2: 'normal',
    P3: 'low',
} as const);

export type NotificationPriority = (typeof NOTIFICATION_PRIORITY)[keyof typeof NOTIFICATION_PRIORITY];

const VALID_TYPES: Set<string> = new Set(Object.values(NOTIFICATION_TYPES));
const VALID_PRIORITIES: Set<string> = new Set(Object.values(NOTIFICATION_PRIORITY));

export interface NotificationInput {
    type: string;
    priority: string;
    title: string;
    body?: string;
    actorId?: string | null;
    targetId?: string | null;
    targetType?: string | null;
    expiresAt?: string;
}

export interface Notification {
    id: string;
    type: string;
    priority: string;
    title: string;
    body: string;
    actorId: string | null;
    targetId: string | null;
    targetType: string | null;
    read: boolean;
    createdAt: string;
    expiresAt?: string;
    readAt?: string;
}

function generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function createNotification(opts: NotificationInput = {} as NotificationInput): Readonly<Notification> {
    const {
        type,
        priority,
        title,
        body = '',
        actorId = null,
        targetId = null,
        targetType = null,
        expiresAt = undefined,
    } = opts;

    if (!VALID_TYPES.has(type)) {
        throw new RangeError(`Invalid notification type: "${type}". Must be one of: ${[...VALID_TYPES].join(', ')}`);
    }
    if (!VALID_PRIORITIES.has(priority)) {
        throw new RangeError(
            `Invalid notification priority: "${priority}". Must be one of: ${[...VALID_PRIORITIES].join(', ')}`,
        );
    }

    const notification: Notification = {
        id: generateId(),
        type,
        priority,
        title: String(title || ''),
        body: String(body),
        actorId,
        targetId,
        targetType,
        read: false,
        createdAt: new Date().toISOString(),
    };

    if (expiresAt !== undefined) {
        notification.expiresAt = expiresAt;
    }

    return Object.freeze(notification);
}

export function markAsRead(notification: Readonly<Notification>, _legacyUserId?: unknown): Readonly<Notification> {
    return Object.freeze({
        ...notification,
        read: true,
        readAt: new Date().toISOString(),
    });
}
