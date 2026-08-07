// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   EXTENDED NOTIFICATIONS — SPEC_EXTENDED_NOTIFICATIONS_9_74

   Estende priority.js (9.72) com 19 novos tipos agrupados em 9
   categorias: Compartilhamento, Documentos, Prazos, Convites,
   Processamento, Watch, Governança, Equipe, Sistema.

   §Q1: Defaults conservadores (maioria DESATIVADA por default).
   P1-31: factories createShareNotification, createMentionNotification,
          createDeadlineNotification com metadados ricos.
   ================================================================ */

import { createNotification, NOTIFICATION_TYPES, NOTIFICATION_PRIORITY } from './notificationSchema.js';

// ──────────────────────────────────────────────────────────────────────
// Categories §2.2
// ──────────────────────────────────────────────────────────────────────

export const NOTIFICATION_CATEGORIES = Object.freeze([
    'sharing',
    'documents',
    'deadlines',
    'invitations',
    'processing',
    'watch',
    'governance',
    'team',
    'system',
]);

export const DELIVERY_CHANNELS = Object.freeze(['in_app', 'email', 'sms', 'push']);

// Mapa tipo → { category, defaultPriority, defaultChannels, defaultEnabled, batchingWindowMs }
// §Q1: defaultEnabled=false para maioria (opt-in)
export const EXTENDED_TYPE_MAP = Object.freeze({
    // Sharing (§P1 P1 - importantes)
    'sharing.model_shared_with_me': {
        category: 'sharing',
        defaultPriority: 'P1',
        defaultChannels: ['in_app', 'email'],
        defaultEnabled: true,
        batchingWindowMs: 0,
    },
    'sharing.catalog_access_granted': {
        category: 'sharing',
        defaultPriority: 'P1',
        defaultChannels: ['in_app'],
        defaultEnabled: true,
        batchingWindowMs: 0,
    },

    // Documents
    'documents.mention_in_report': {
        category: 'documents',
        defaultPriority: 'P1',
        defaultChannels: ['in_app', 'email'],
        defaultEnabled: true,
        batchingWindowMs: 0,
    },
    'documents.report_export_ready': {
        category: 'documents',
        defaultPriority: 'P2',
        defaultChannels: ['in_app'],
        defaultEnabled: true,
        batchingWindowMs: 0,
    },

    // Deadlines (P0 críticos)
    'deadlines.task_due_24h': {
        category: 'deadlines',
        defaultPriority: 'P0',
        defaultChannels: ['in_app', 'email'],
        defaultEnabled: true,
        batchingWindowMs: 0,
    },
    'deadlines.task_due_1h': {
        category: 'deadlines',
        defaultPriority: 'P0',
        defaultChannels: ['in_app', 'email', 'sms'],
        defaultEnabled: true,
        batchingWindowMs: 0,
    },
    'deadlines.daily_reminders': {
        category: 'deadlines',
        defaultPriority: 'P2',
        defaultChannels: ['email'],
        defaultEnabled: false,
        batchingWindowMs: 24 * 60 * 60 * 1000,
    },

    // Invitations
    'invitations.organization': {
        category: 'invitations',
        defaultPriority: 'P1',
        defaultChannels: ['in_app', 'email'],
        defaultEnabled: true,
        batchingWindowMs: 0,
    },
    'invitations.project': {
        category: 'invitations',
        defaultPriority: 'P1',
        defaultChannels: ['in_app', 'email'],
        defaultEnabled: true,
        batchingWindowMs: 0,
    },
    'invitations.access_group': {
        category: 'invitations',
        defaultPriority: 'P1',
        defaultChannels: ['in_app'],
        defaultEnabled: true,
        batchingWindowMs: 0,
    },

    // Processing
    'processing.import_completed': {
        category: 'processing',
        defaultPriority: 'P2',
        defaultChannels: ['in_app'],
        defaultEnabled: true,
        batchingWindowMs: 0,
    },
    'processing.import_failed': {
        category: 'processing',
        defaultPriority: 'P0',
        defaultChannels: ['in_app', 'email'],
        defaultEnabled: true,
        batchingWindowMs: 0,
    },
    'processing.etl_failed': {
        category: 'processing',
        defaultPriority: 'P0',
        defaultChannels: ['in_app', 'email'],
        defaultEnabled: true,
        batchingWindowMs: 0,
    },

    // Watch (§Q4 batched 15min)
    'watch.element_changed': {
        category: 'watch',
        defaultPriority: 'P2',
        defaultChannels: ['in_app'],
        defaultEnabled: false,
        batchingWindowMs: 15 * 60 * 1000,
    },
    'watch.model_updated': {
        category: 'watch',
        defaultPriority: 'P2',
        defaultChannels: ['in_app'],
        defaultEnabled: false,
        batchingWindowMs: 15 * 60 * 1000,
    },

    // Governance (P0 críticos)
    'governance.approval_requested': {
        category: 'governance',
        defaultPriority: 'P0',
        defaultChannels: ['in_app', 'email'],
        defaultEnabled: true,
        batchingWindowMs: 0,
    },
    'governance.approval_resolved': {
        category: 'governance',
        defaultPriority: 'P1',
        defaultChannels: ['in_app'],
        defaultEnabled: true,
        batchingWindowMs: 0,
    },

    // Team
    'team.daily_digest': {
        category: 'team',
        defaultPriority: 'P2',
        defaultChannels: ['email'],
        defaultEnabled: false,
        batchingWindowMs: 24 * 60 * 60 * 1000,
    },

    // System (§Q6)
    'system.backup_failed': {
        category: 'system',
        defaultPriority: 'P0',
        defaultChannels: ['in_app', 'email'],
        defaultEnabled: true,
        batchingWindowMs: 0,
    },
    'system.maintenance_scheduled': {
        category: 'system',
        defaultPriority: 'P1',
        defaultChannels: ['in_app', 'email'],
        defaultEnabled: true,
        batchingWindowMs: 0,
    },
});

// ──────────────────────────────────────────────────────────────────────
// Invite expiration §Q5 (7 dias default)
// ──────────────────────────────────────────────────────────────────────

export const INVITE_DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// ──────────────────────────────────────────────────────────────────────
// Lookup
// ──────────────────────────────────────────────────────────────────────

export function getExtendedTypeConfig(type: string): any {
    return (EXTENDED_TYPE_MAP as Record<string, any>)[type] || null;
}

/**
 * Lista todos os tipos de uma categoria.
 * @param category
 */
export function getTypesByCategory(category: string): Array<string> {
    return Object.entries(EXTENDED_TYPE_MAP)
        .filter(([, config]) => config.category === category)
        .map(([type]) => type);
}

/**
 * Lista tipos com defaultEnabled=true.
 */
export function getDefaultEnabledTypes(): Array<string> {
    return Object.entries(EXTENDED_TYPE_MAP)
        .filter(([, config]) => config.defaultEnabled === true)
        .map(([type]) => type);
}

// ──────────────────────────────────────────────────────────────────────
// User preferences resolution
// ──────────────────────────────────────────────────────────────────────

/**
 * Resolve preferência efetiva para um tipo.
 * Merge: userPrefs override → defaultEnabled.
 *
 * @param type
 * @param userPrefs - { [type]: { enabled, channels, priority } }
 */
export function resolveNotificationPreference(
    type: string,
    userPrefs: Record<string, any> = {},
): {
    type: string;
    enabled: boolean;
    channels: Array<string>;
    priority: string;
    category: string;
    batchingWindowMs: number;
} | null {
    const config = getExtendedTypeConfig(type);
    if (!config) return null;
    const userPref = userPrefs[type] || {};

    // Canais: user override ou default
    const channels = Array.isArray(userPref.channels)
        ? userPref.channels.filter((c: string) => DELIVERY_CHANNELS.includes(c))
        : [...config.defaultChannels];

    return {
        type,
        enabled: typeof userPref.enabled === 'boolean' ? userPref.enabled : config.defaultEnabled,
        channels,
        priority: userPref.priority || config.defaultPriority,
        category: config.category,
        batchingWindowMs: config.batchingWindowMs,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Invite expiration
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa expiração de convite (§Q5).
 * @param issuedAtMs
 * @param customExpiryMs?
 * @returns timestamp ms
 */
export function computeInviteExpiry(issuedAtMs: number, customExpiryMs?: number): number {
    const issued = Number(issuedAtMs);
    if (!Number.isFinite(issued)) return 0;
    const expiry =
        Number.isFinite(customExpiryMs) && (customExpiryMs as number) > 0
            ? (customExpiryMs as number)
            : INVITE_DEFAULT_EXPIRY_MS;
    return issued + expiry;
}

/**
 * Verifica se convite expirou.
 * @param invite - { issued_at, expires_at? }
 * @param now
 */
export function isInviteExpired(invite: any, now: number = Date.now()): boolean {
    if (!invite) return true;
    const expires = Number(invite.expires_at) || computeInviteExpiry(Number(invite.issued_at));
    if (expires === 0) return true;
    return now >= expires;
}

// ──────────────────────────────────────────────────────────────────────
// Batching decision (per extended type §Q1)
// ──────────────────────────────────────────────────────────────────────

function _resolveBatchAnchorMs(value: unknown): number {
    if (!value) return Date.now();
    const ms = new Date(value as string | number | Date).getTime();
    return Number.isFinite(ms) ? ms : NaN;
}

function _isBatchableCandidate(n: any, newNotif: any, cutoff: number): boolean {
    if (!n || n.type !== newNotif.type) return false;
    if (n.targetId !== newNotif.targetId) return false;
    if (n.read === true) return false;
    const nMs = new Date(n.createdAt || 0).getTime();
    return Number.isFinite(nMs) && nMs >= cutoff;
}

/**
 * Decide se notif deve ser batched com existente baseado em window.
 *
 * @param newNotif - { type, targetId, createdAt }
 * @param existing
 * @returns target para merge, ou null
 */
export function findBatchTargetExtended(newNotif: any, existing: Array<any> = []): object | null {
    if (!newNotif || typeof newNotif !== 'object') return null;
    const config = getExtendedTypeConfig(newNotif.type);
    if (!config) return null;
    const windowMs = config.batchingWindowMs || 0;
    if (windowMs <= 0) return null;

    const nowMs = _resolveBatchAnchorMs(newNotif.createdAt);
    if (!Number.isFinite(nowMs)) return null;
    const cutoff = nowMs - windowMs;

    for (const n of existing) {
        if (_isBatchableCandidate(n, newNotif, cutoff)) return n;
    }
    return null;
}

// ──────────────────────────────────────────────────────────────────────
// P1-31 - Typed notification factories
// ──────────────────────────────────────────────────────────────────────

/** Tipos estendidos expostos para P1-31 */
export const EXTENDED_NOTIFICATION_TYPES = Object.freeze({
    SHARE: NOTIFICATION_TYPES.SHARE,
    MENTION: NOTIFICATION_TYPES.MENTION,
    DEADLINE: NOTIFICATION_TYPES.DEADLINE,
});

/**
 * Cria notificação de compartilhamento de recurso.
 *
 * @param opts
 */
export function createShareNotification({
    fromUserId,
    resourceId,
    resourceType,
    message = '',
}: {
    fromUserId: string;
    resourceId: string;
    resourceType: string;
    message?: string;
}): Readonly<object> {
    return createNotification({
        type: NOTIFICATION_TYPES.SHARE,
        priority: NOTIFICATION_PRIORITY.P1,
        title: 'notifications.type.share',
        body: String(message),
        actorId: fromUserId,
        targetId: resourceId,
        targetType: resourceType,
    });
}

/**
 * Cria notificação de menção em contexto (comentário, relatório, etc.).
 *
 * @param opts
 */
export function createMentionNotification({ fromUserId, context, resourceId }: any): Readonly<object> {
    return createNotification({
        type: NOTIFICATION_TYPES.MENTION,
        priority: NOTIFICATION_PRIORITY.P0,
        title: 'notifications.type.mention',
        body: String(context),
        actorId: fromUserId,
        targetId: resourceId,
    });
}

/**
 * Cria notificação de prazo se aproximando.
 * Prioridade P0 se daysRemaining <= 1, caso contrário P1.
 *
 * @param opts
 */
export function createDeadlineNotification({ resourceId, resourceType, dueAt, daysRemaining }: any): Readonly<object> {
    const days = Number(daysRemaining);
    const priority = days <= 1 ? NOTIFICATION_PRIORITY.P0 : NOTIFICATION_PRIORITY.P1;

    const base = createNotification({
        type: NOTIFICATION_TYPES.DEADLINE,
        priority,
        title: 'notifications.type.deadline',
        body: '',
        targetId: resourceId,
        targetType: resourceType,
    });

    // meta com dueAt e daysRemaining adicionado sobre objeto base frozen
    return Object.freeze({
        ...base,
        meta: Object.freeze({ dueAt: Number(dueAt), daysRemaining: days }),
    });
}
