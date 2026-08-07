// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * core/notifications/index.js - Barrel para o módulo de notificações
 * Fase 1: schema in-memory, sem persistência IDB, sem email/push.
 */

export { NOTIFICATION_TYPES, NOTIFICATION_PRIORITY, createNotification, markAsRead } from './notificationSchema.js';

export { createNotificationStore } from './notificationStore.js';

export { shouldBatch, batchGroup, prioritize, buildDigestSummary } from './notificationEngine.js';

export {
    NOTIFICATION_CHANNELS,
    DEFAULT_CHANNEL_RULES,
    resolveChannels,
    dispatchNotification,
} from './channelRouter.js';

// P1-31 - Extended types + factories
export {
    EXTENDED_NOTIFICATION_TYPES,
    createShareNotification,
    createMentionNotification,
    createDeadlineNotification,
} from './extendedTypes.js';
