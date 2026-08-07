// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Notifications - Phase 9 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S12
 *
 * Phase 9 (2026-05-01) - pure-logic engine de triggers de notificação
 * baseados em eventos do compliance lifecycle. Detecta deadlines,
 * mudanças de status, violações e gera notification objects para
 * downstream (Supabase create-notification edge function ou local toast).
 *
 * Estratégia:
 *   - Trigger registry: catálogo de regras frozen
 *   - Evaluator puro: estado(s) → notifications[]
 *   - Cooldown: evita re-fire da mesma notification em janela X
 *   - Deduplication: chave canonical (ruleId + targetId + day)
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Severities canônicas. */
export const NOTIFICATION_SEVERITIES = Object.freeze(['info', 'warning', 'critical']);

/** Channels canônicos (downstream determina renderização). */
export const NOTIFICATION_CHANNELS = Object.freeze(['toast', 'email', 'slack', 'in_app', 'webhook']);

/** Categorias de trigger. */
export const TRIGGER_CATEGORIES = Object.freeze([
    'deadline',
    'status_change',
    'compliance_violation',
    'review_assigned',
    'document_published',
    'audit_event',
]);

/** Identidade do módulo. */
export const NOTIFICATIONS_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 9,
    deliveredAt: '2026-05-01',
    severities: NOTIFICATION_SEVERITIES,
    channels: NOTIFICATION_CHANNELS,
    categories: TRIGGER_CATEGORIES,
});

/**
 * Cria objeto frozen de notificação.
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createNotification(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createNotification: spec required');
    }
    if (typeof spec.ruleId !== 'string' || !spec.ruleId.trim()) {
        throw new TypeError('createNotification: ruleId required');
    }
    if (typeof spec.targetId !== 'string' || !spec.targetId.trim()) {
        throw new TypeError('createNotification: targetId required');
    }
    if (!NOTIFICATION_SEVERITIES.includes(spec.severity)) {
        throw new TypeError(`createNotification: severity must be one of ${NOTIFICATION_SEVERITIES.join(',')}`);
    }
    if (!TRIGGER_CATEGORIES.includes(spec.category)) {
        throw new TypeError(`createNotification: category must be one of ${TRIGGER_CATEGORIES.join(',')}`);
    }
    const channels = Array.isArray(spec.channels)
        ? spec.channels.filter(( c: any) => NOTIFICATION_CHANNELS.includes( (c as any)))
        : ['in_app'];

    return Object.freeze({
        id: spec.id || `${spec.ruleId}:${spec.targetId}:${spec.timestamp || Date.now()}`,
        ruleId: spec.ruleId,
        targetId: spec.targetId,
        category: spec.category,
        severity: spec.severity,
        title: spec.title || '',
        message: spec.message || '',
        timestamp: spec.timestamp || new Date().toISOString(),
        channels: Object.freeze(channels),
        metadata: spec.metadata || null,
    });
}

/**
 * Cria objeto frozen de trigger rule.
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createTriggerRule(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createTriggerRule: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createTriggerRule: id required');
    }
    if (!TRIGGER_CATEGORIES.includes(spec.category)) {
        throw new TypeError('createTriggerRule: invalid category');
    }
    if (!NOTIFICATION_SEVERITIES.includes(spec.severity)) {
        throw new TypeError('createTriggerRule: invalid severity');
    }
    if (typeof spec.predicate !== 'function') {
        throw new TypeError('createTriggerRule: predicate must be function');
    }
    if (typeof spec.buildMessage !== 'function') {
        throw new TypeError('createTriggerRule: buildMessage must be function');
    }
    return Object.freeze({
        id: spec.id,
        category: spec.category,
        severity: spec.severity,
        cooldownMs: Number.isFinite(spec.cooldownMs) ? spec.cooldownMs : 86400000, // 24h default
        channels: Array.isArray(spec.channels) ? Object.freeze([...spec.channels]) : Object.freeze(['in_app']),
        predicate: spec.predicate,
        buildMessage: spec.buildMessage,
        description: spec.description || '',
    });
}

/**
 * Trigger rules canônicas built-in.
 */
export const BUILTIN_TRIGGERS = Object.freeze([
    createTriggerRule({
        id: 'deadline-7d',
        category: 'deadline',
        severity: 'warning',
        cooldownMs: 86400000, // 1 day
        description: 'Documento com deadline em até 7 dias',
        predicate: ( doc: any,  ctx: any) => {
            if (!doc || !doc.deadline) return false;
            const now = (ctx && ctx.now) || Date.now();
            const deadline = Date.parse(doc.deadline);
            if (!Number.isFinite(deadline)) return false;
            const diff = deadline - now;
            return diff > 0 && diff <= 7 * 86400000;
        },
        buildMessage: ( doc: any) => ({
            title: 'Deadline aproximando',
            message: `Documento "${doc.title || doc.id}" vence em breve`,
        }),
    }),
    createTriggerRule({
        id: 'deadline-overdue',
        category: 'deadline',
        severity: 'critical',
        cooldownMs: 86400000,
        description: 'Documento com deadline vencido',
        predicate: ( doc: any,  ctx: any) => {
            if (!doc || !doc.deadline) return false;
            const now = (ctx && ctx.now) || Date.now();
            const deadline = Date.parse(doc.deadline);
            if (!Number.isFinite(deadline)) return false;
            return deadline < now;
        },
        buildMessage: ( doc: any) => ({
            title: 'Deadline VENCIDO',
            message: `Documento "${doc.title || doc.id}" está vencido`,
        }),
    }),
    createTriggerRule({
        id: 'compliance-failed',
        category: 'compliance_violation',
        severity: 'critical',
        description: 'Documento com violações críticas',
        predicate: ( doc: any) => Boolean( (doc as any) && doc.complianceStatus && doc.complianceStatus.criticalCount > 0),
        buildMessage: ( doc: any) => ({
            title: 'Conformidade falhou',
            message: `Documento "${doc.title || doc.id}" tem ${
                doc.complianceStatus?.criticalCount || 0
            } violação(ões) crítica(s)`,
        }),
    }),
    createTriggerRule({
        id: 'status-published',
        category: 'document_published',
        severity: 'info',
        description: 'Documento publicado',
        predicate: ( doc: any) => Boolean( (doc as any) && doc.lastTransition && doc.lastTransition.to === 'published'),
        buildMessage: ( doc: any) => ({
            title: 'Documento publicado',
            message: `"${doc.title || doc.id}" foi publicado`,
        }),
    }),
    createTriggerRule({
        id: 'review-assigned',
        category: 'review_assigned',
        severity: 'info',
        description: 'Revisor designado para o documento',
        predicate: ( doc: any) =>
            Boolean(doc && doc.lastTransition && doc.lastTransition.to === 'under_review' && doc.reviewerId),
        buildMessage: ( doc: any) => ({
            title: 'Revisão atribuída',
            message: `Você foi designado revisor de "${doc.title || doc.id}"`,
        }),
    }),
]);

/**
 * Cria chave canônica para deduplicação.
 *
 * @param {string} ruleId
 * @param {string} targetId
 * @param {number} timestamp - usa ISO date day precision
 * @returns {string}
 */
export function makeDedupKey(ruleId: string, targetId: string, timestamp: number): string {
    const ts = Number.isFinite(timestamp) ? timestamp : Date.now();
    const day = new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
    return `${ruleId}:${targetId}:${day}`;
}

/**
 * Verifica se notificação está em cooldown (deduplicada).
 *
 * @param {string} dedupKey
 * @param {Map<string, number>} sentMap - key → lastSentTimestamp
 * @param {number} number>
 * @param {number} cooldownMs
 * @returns {boolean}
 */
export function isInCooldown(dedupKey: string, sentMap: Map<string, number>, cooldownMs: number, now: number): boolean {
    if (!dedupKey || !(sentMap instanceof Map)) return false;
    const lastSent = (sentMap.get(dedupKey) as number);
    if (!Number.isFinite(lastSent)) return false;
    if (!Number.isFinite(cooldownMs) || cooldownMs <= 0) return false;
    const _now = Number.isFinite(now) ? now : Date.now();
    return _now - lastSent < cooldownMs;
}

/**
 * Avalia documentos contra triggers e emite notifications.
 *
 * @param {Array<Object>} documents
 * @param {Record<string, any>} [options]
 * @returns {Array<Object>}
 */
export function evaluateTriggers(documents: Array<object>, options: Record<string, any> = {}): Array<object> {
    if (!Array.isArray(documents)) return [];
    const triggers = Array.isArray(options.triggers) ? options.triggers : BUILTIN_TRIGGERS;
    const sentMap = options.sentMap instanceof Map ? options.sentMap : null;
    const now = Number.isFinite(options.now) ? options.now : Date.now();

    const notifications = [];
    for (const doc of (documents as any[])) {
        if (!doc || typeof doc !== 'object' || !doc.id) continue;
        for (const rule of (triggers as any[])) {
            if (!rule || typeof rule.predicate !== 'function') continue;
            let firing: boolean;
            try {
                firing = Boolean(rule.predicate(doc, { now }));
            } catch ( e: any) {
                console.debug('[notifications:predicate]', e?.message || e);
                continue;
            }
            if (!firing) continue;

            const dedupKey = makeDedupKey(rule.id, doc.id, now);
            if (sentMap && isInCooldown(dedupKey, sentMap, rule.cooldownMs, now)) continue;

            let body: any;
            try {
                body = rule.buildMessage(doc, { now });
            } catch ( e: any) {
                console.debug('[notifications:buildMessage]', e?.message || e);
                body = { title: '', message: '' };
            }

            notifications.push(
                createNotification({
                    ruleId: rule.id,
                    targetId: doc.id,
                    category: rule.category,
                    severity: rule.severity,
                    title: body.title,
                    message: body.message,
                    channels: rule.channels,
                    timestamp: new Date(now).toISOString(),
                    metadata: { dedupKey },
                }),
            );
        }
    }
    return notifications;
}

/**
 * Agrupa notificações por target.
 *
 * @param {Array<Object>} notifications
 * @returns {Object<string, Array<any>>}
 */
export function groupByTarget(notifications: Array<object>): Record<string, Array<any>> {
    if (!Array.isArray(notifications)) return {};
    const grouped: Record<string, any[]> = {};
    for (const n of (notifications as any[])) {
        if (!n || !n.targetId) continue;
        if (!grouped[n.targetId]) grouped[n.targetId] = [];
        grouped[n.targetId]!.push(n);
    }
    return grouped;
}

/**
 * Sumariza notificações por severity + category.
 */
export function summarizeNotifications( notifications: any) {
    const empty = {
        total: 0,
        bySeverity: { info: 0, warning: 0, critical: 0 },
        byCategory: {},
        byChannel: {},
    };
    if (!Array.isArray(notifications) || notifications.length === 0) return empty;

    const bySeverity: Record<string,number> = { info: 0, warning: 0, critical: 0 };
    const byCategory: Record<string,number> = {};
    const byChannel: Record<string,number> = {};

    for (const n of (notifications as any[])) {
        if (!n) continue;
        if (n.severity in bySeverity) bySeverity[n.severity]!++;
        if (n.category) byCategory[n.category] = (byCategory[n.category] || 0) + 1;
        if (Array.isArray(n.channels)) {
            for (const ch of n.channels) {
                byChannel[ch] = (byChannel[ch] || 0) + 1;
            }
        }
    }
    return {
        total: notifications.length,
        bySeverity,
        byCategory,
        byChannel,
    };
}

/**
 * Module identity export.
 */
export const complianceNotificationsMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 9,
    deliveredAt: '2026-05-01',
    severities: NOTIFICATION_SEVERITIES,
    channels: NOTIFICATION_CHANNELS,
    categories: TRIGGER_CATEGORIES,
    builtinTriggersCount: BUILTIN_TRIGGERS.length,
    exports: [
        'NOTIFICATION_SEVERITIES',
        'NOTIFICATION_CHANNELS',
        'TRIGGER_CATEGORIES',
        'NOTIFICATIONS_META',
        'BUILTIN_TRIGGERS',
        'createNotification',
        'createTriggerRule',
        'makeDedupKey',
        'isInCooldown',
        'evaluateTriggers',
        'groupByTarget',
        'summarizeNotifications',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
