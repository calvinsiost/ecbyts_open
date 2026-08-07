// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

export interface TierConfig {
    readonly id: string;
    readonly label: string;
    readonly channels: ReadonlyArray<string>;
    readonly allowBatching: boolean;
}

export interface NotifLike {
    type?: string;
    targetId?: string | null;
    createdAt?: string | number;
    updatedAt?: string | number;
    read?: boolean;
    actorId?: string | null;
    actorIds?: string[];
    count?: number;
}

export const PRIORITY_TIERS = {
    P0: {
        id: 'P0',
        label: 'critical',
        channels: ['in_app', 'email', 'push'],
        allowBatching: false,
    },
    P1: {
        id: 'P1',
        label: 'important',
        channels: ['in_app', 'email'],
        allowBatching: false,
    },
    P2: {
        id: 'P2',
        label: 'social',
        channels: ['in_app'],
        allowBatching: true,
    },
} as const;

export type PriorityTierKey = keyof typeof PRIORITY_TIERS;

export type TierConfigType = (typeof PRIORITY_TIERS)[PriorityTierKey];

export const TYPE_TIER_MAP = {
    'purchase.completed': 'P0',
    'purchase.failed': 'P0',
    'security.alert': 'P0',
    'model.shared_critical': 'P0',
    'comment.mention': 'P1',
    'comment.reply': 'P1',
    'quote.received': 'P1',
    'quote.responded': 'P1',
    'review.pending': 'P1',
    'org.invitation': 'P1',
    'library.liked': 'P2',
    'library.starred': 'P2',
    'user.followed': 'P2',
    'model.viewed': 'P2',
    'library.commented': 'P2',
} as const;

export type TypeTierMapKey = keyof typeof TYPE_TIER_MAP;
export type TypeTierMapValue = (typeof TYPE_TIER_MAP)[TypeTierMapKey];

export const BATCH_WINDOW_SECONDS = {
    P0: 0,
    P1: 0,
    P2: 900,
} as const;

export type BatchWindowKey = keyof typeof BATCH_WINDOW_SECONDS;

export function getTierForType(type: string): string {
    return (TYPE_TIER_MAP as Record<string, string>)[type] || 'P2';
}

export function getTierConfig(tierId: string): TierConfig {
    return (PRIORITY_TIERS as Record<string, TierConfig>)[tierId] || PRIORITY_TIERS.P2;
}

export function getBatchWindow(tierId: string): number {
    return (BATCH_WINDOW_SECONDS as Record<string, number>)[tierId] ?? 900;
}

function isValidNotif(value: NotifLike | null | undefined): value is NotifLike {
    return !!value && typeof value === 'object';
}

function toTimestampMs(value: string | number | undefined, fallback: number): number | null {
    const resolved = value || fallback;
    const ms = new Date(resolved).getTime();
    return Number.isFinite(ms) ? ms : null;
}

function isBatchableMatch(
    newNotif: NotifLike,
    notification: NotifLike,
    cutoffMs: number,
): boolean {
    if (!isValidNotif(notification)) return false;
    if (notification.type !== newNotif.type) return false;
    if (notification.targetId !== newNotif.targetId) return false;
    if (notification.read === true) return false;

    const notificationMs = toTimestampMs(notification.createdAt, 0);
    if (notificationMs === null) return false;
    return notificationMs >= cutoffMs;
}

export function findBatchTarget(
    newNotif: NotifLike | null | undefined,
    existing: NotifLike[] = [],
): NotifLike | null {
    if (!isValidNotif(newNotif)) return null;

    const tier = getTierForType(newNotif.type || '');
    const config = getTierConfig(tier);
    if (!config.allowBatching) return null;

    const windowSec = getBatchWindow(tier);
    if (windowSec <= 0) return null;

    const nowMs = toTimestampMs(newNotif.createdAt, Date.now());
    if (nowMs === null) return null;

    const cutoffMs = nowMs - windowSec * 1000;
    for (const notification of existing) {
        if (isBatchableMatch(newNotif, notification, cutoffMs)) return notification;
    }
    return null;
}

export function mergeNotifications(
    target: NotifLike | null | undefined,
    newNotif: NotifLike,
): NotifLike {
    if (!target) return newNotif;

    const actorIds = new Set(target.actorIds || []);
    if (newNotif.actorId) actorIds.add(newNotif.actorId);

    return {
        ...target,
        count: (target.count || 1) + 1,
        actorIds: Array.from(actorIds),
        updatedAt: newNotif.createdAt || new Date().toISOString(),
    };
}