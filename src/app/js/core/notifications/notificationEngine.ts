// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   NOTIFICATION ENGINE — lógica de negócio (pure, node-testable)
   SPEC_NOTIFICATIONS_SYSTEM_9_72 §Q2/Q3

   - shouldBatch: decide se um tipo deve ser agrupado
   - batchGroup: agrupa N notificações batcháveis em 1 representativa
   - prioritize: ordena p0→p1→p2, depois por createdAt desc
   - buildDigestSummary: gera texto de resumo para digest email
   ================================================================ */

export interface NotificationMeta {
    actorId?: string;
    actorIds?: string[];
    targetId?: string;
}

export interface Notification {
    type?: string;
    priority?: string;
    createdAt?: string;
    updatedAt?: string;
    targetId?: string;
    meta?: NotificationMeta;
    count?: number;
}

console.debug('[mod:load]', 'app/js/core/notifications/notificationEngine.js');

/**
 * Tipos que devem ser batched (agregados em grupo).
 * Comment/mention não são batched - são ações diretas que precisam de atenção.
 */
const BATCH_TYPES = new Set(['like', 'follow', 'library.liked', 'library.starred', 'user.followed', 'model.viewed']);

/**
 * Ordem de prioridade para sorting.
 */
const PRIORITY_ORDER: Readonly<Record<string, number>> = Object.freeze({
    p0: 0,
    P0: 0,
    p1: 1,
    P1: 1,
    p2: 2,
    P2: 2,
});

/**
 * Decide se um tipo de notificação deve ser batched (agrupado).
 * comment, mention, purchase, review → não batchear (false).
 * like, follow → batchear (true).
 */
export function shouldBatch(type: string | undefined): boolean {
    if (!type || typeof type !== 'string') return false;
    return BATCH_TYPES.has(type);
}

/**
 * Agrupa notificações batcháveis por (type + targetId).
 * Tipos não-batcháveis passam direto.
 *
 * @returns array reduzido com grupos
 */
export function batchGroup(notifications: Array<Notification | null | undefined> | unknown): Notification[] {
    if (!Array.isArray(notifications)) return [];
    const result: Notification[] = [];
    const batchMap = new Map<string, number>(); // key: `type:targetId` -> index no result

    for (const n of notifications) {
        if (!n) continue;
        if (!shouldBatch(n.type)) {
            result.push(n);
            continue;
        }

        const key = `${n.type}:${n.meta?.targetId || n.targetId || ''}`;
        const existingIndex = batchMap.get(key);
        if (existingIndex !== undefined) {
            const existing = result[existingIndex];
            if (!existing) continue;
            const prevActors = Array.isArray(existing.meta?.actorIds)
                ? existing.meta.actorIds
                : existing.meta?.actorId
                  ? [existing.meta.actorId]
                  : [];
            const newActor = n.meta?.actorId || null;
            const allActors = newActor && !prevActors.includes(newActor) ? [...prevActors, newActor] : prevActors;
            result[existingIndex] = {
                ...existing,
                count: (existing.count || 1) + 1,
                meta: { ...(existing.meta || {}), actorIds: allActors },
                updatedAt: n.createdAt || new Date().toISOString(),
            };
        } else {
            const meta = n.meta || {};
            const entry: Notification = {
                ...n,
                count: 1,
                meta: {
                    ...meta,
                    actorIds: meta.actorId ? [meta.actorId] : [],
                },
            };
            batchMap.set(key, result.length);
            result.push(entry);
        }
    }
    return result;
}

/**
 * Ordena notificações por prioridade (p0 primeiro) e depois por createdAt desc.
 *
 * @returns novo array ordenado
 */
export function prioritize(notifications: Notification[] | unknown): Notification[] {
    if (!Array.isArray(notifications)) return [];
    return notifications.slice().sort((a: Notification, b: Notification) => {
        const priorityA = typeof a.priority === 'string' ? a.priority : 'p2';
        const priorityB = typeof b.priority === 'string' ? b.priority : 'p2';
        const pa = PRIORITY_ORDER[priorityA] ?? 2;
        const pb = PRIORITY_ORDER[priorityB] ?? 2;
        if (pa !== pb) return pa - pb;
        // desempate por createdAt desc (mais recente primeiro)
        const ta = new Date(a.createdAt || 0).getTime();
        const tb = new Date(b.createdAt || 0).getTime();
        return tb - ta;
    });
}

/**
 * Gera texto de resumo para digest de email.
 * Agrupa por tipo e conta; descreve o mais relevante.
 *
 * @param notifications - data/hora de início do período
 * @returns texto legível, não-vazio
 */
export function buildDigestSummary(
    notifications: Array<Notification | null | undefined> | unknown,
    since: string | Date,
): string {
    if (!Array.isArray(notifications) || notifications.length === 0) {
        return 'No new notifications.';
    }

    const sinceMs = since ? new Date(since).getTime() : 0;
    const inPeriod = notifications.filter((n: Notification | null | undefined) => {
        if (!n) return false;
        if (!sinceMs) return true;
        return new Date(n.createdAt || 0).getTime() >= sinceMs;
    });

    if (inPeriod.length === 0) {
        return 'No new notifications since last digest.';
    }

    const byType = new Map<string, number>();
    for (const n of inPeriod) {
        const t = n.type || 'system';
        byType.set(t, (byType.get(t) || 0) + 1);
    }

    const parts: string[] = [];
    for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
        parts.push(`${count} ${type.replace('.', ' ')}`);
    }

    const total = inPeriod.length;
    return `You have ${total} new notification${total !== 1 ? 's' : ''}: ${parts.join(', ')}.`;
}

console.debug('[mod:end]', 'app/js/core/notifications/notificationEngine.js');
