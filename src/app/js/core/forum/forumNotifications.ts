// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// SPEC: docs/specs/features/SPEC_FORUM_KNOWLEDGE_GROUPS.md
// Phase 3 — forum notifications (pure payload builder + subscription match).

/* ================================================================
   FORUM NOTIFICATIONS — payload builder para o sistema de
   notificações existente. Subscriptions são opt-in por
   thread / group / tag (SPEC §2 MUST).

   Pure logic, sem IO. shouldNotify decide se um evento deve
   gerar notificação dado o registro de subscription do usuário.
   ================================================================ */

type ForumNotificationType = 'reply' | 'mention' | 'thread_created' | 'thread_pinned' | 'moderation';

interface ForumSubscription {
    userId: string;
    targetType: 'group' | 'thread' | 'tag';
    targetIdOrTag: string;
}

interface ForumNotification {
    type: ForumNotificationType;
    threadId: string;
    groupId: string;
    actorAlias: string;
    message: string;
    createdAt: string;
}

const TYPE_TEMPLATES: Readonly<Record<ForumNotificationType, (actor: string) => string>> = Object.freeze({
    reply: (actor) => `${actor} respondeu em um tópico que você acompanha`,
    mention: (actor) => `${actor} mencionou você`,
    thread_created: (actor) => `${actor} criou um novo tópico em um grupo que você acompanha`,
    thread_pinned: (actor) => `${actor} fixou um tópico`,
    moderation: (actor) => `${actor} executou uma ação de moderação`,
});

/**
 * Constrói um payload de notificação puro (sem IO).
 * @param input
 * @returns
 */
export function buildNotification(input: {
    type: ForumNotificationType;
    threadId: string;
    groupId: string;
    actorAlias: string;
}): ForumNotification {
    if (!input || typeof input !== 'object') {
        throw new Error('forum.notification.invalid_input');
    }
    const type = input.type as ForumNotificationType;
    if (!TYPE_TEMPLATES[type]) {
        throw new Error('forum.notification.invalid_type');
    }
    const actor = typeof input.actorAlias === 'string' && input.actorAlias.trim() ? input.actorAlias.trim() : 'Alguém';
    return {
        type,
        threadId: String(input.threadId || ''),
        groupId: String(input.groupId || ''),
        actorAlias: actor,
        message: TYPE_TEMPLATES[type](actor),
        createdAt: new Date().toISOString(),
    };
}

/**
 * Decide se uma subscription deve disparar notificação para o evento.
 * Match exato por target. Tag match é case-insensitive.
 * @param subscription
 * @param event
 * @returns
 */
export function shouldNotify(
    subscription: ForumSubscription,
    event: { groupId?: string; threadId?: string; tags?: string[] },
): boolean {
    if (!subscription || typeof subscription !== 'object') return false;
    if (!event || typeof event !== 'object') return false;
    const { targetType, targetIdOrTag } = subscription;
    if (!targetIdOrTag) return false;
    if (targetType === 'thread') {
        return event.threadId != null && String(event.threadId) === String(targetIdOrTag);
    }
    if (targetType === 'group') {
        return event.groupId != null && String(event.groupId) === String(targetIdOrTag);
    }
    if (targetType === 'tag') {
        if (!Array.isArray(event.tags)) return false;
        const want = String(targetIdOrTag).toLowerCase();
        return event.tags.some((tg) => typeof tg === 'string' && tg.toLowerCase() === want);
    }
    return false;
}

/**
 * Filtra uma lista de subscriptions, retornando apenas as que devem
 * ser notificadas para o evento. Útil no fan-out de um novo reply.
 * @param subscriptions
 * @param event
 * @returns
 */
export function matchSubscriptions(
    subscriptions: ForumSubscription[],
    event: { groupId?: string; threadId?: string; tags?: string[] },
): ForumSubscription[] {
    if (!Array.isArray(subscriptions)) return [];
    return subscriptions.filter((s) => shouldNotify(s, event));
}
