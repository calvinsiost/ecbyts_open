// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * core/notifications/channelRouter.js - Roteamento multi-canal de notificações
 * Channel Router: resolve canais destino por tipo e despacha (stubs em Fase 1).
 *
 * Fase 1: IN_APP funcional; EMAIL e PUSH são stubs sem envio real.
 * Fase 2 (futura): integrar Supabase Edge Function para email transacional
 * e Web Push API para push nativo.
 */

// ─── Canais disponíveis ───────────────────────────────────────────────────────

export const NOTIFICATION_CHANNELS = {
    IN_APP: 'in_app',
    EMAIL: 'email',
    PUSH: 'push',
} as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];

// ─── Regras de roteamento padrão ─────────────────────────────────────────────

/**
 * Mapeamento padrão: tipo de notificação → canais destino.
 * Email e push são stubs (Fase 1 - sem envio real).
 *
 * @type {Record<string, string[]>}
 */
export const DEFAULT_CHANNEL_RULES: Record<string, string[]> = {
    purchase: [NOTIFICATION_CHANNELS.IN_APP, NOTIFICATION_CHANNELS.EMAIL],
    comment: [NOTIFICATION_CHANNELS.IN_APP],
    like: [NOTIFICATION_CHANNELS.IN_APP],
    follow: [NOTIFICATION_CHANNELS.IN_APP, NOTIFICATION_CHANNELS.EMAIL],
    system: [NOTIFICATION_CHANNELS.IN_APP, NOTIFICATION_CHANNELS.EMAIL, NOTIFICATION_CHANNELS.PUSH],
    mention: [NOTIFICATION_CHANNELS.IN_APP, NOTIFICATION_CHANNELS.EMAIL],
    deadline: [NOTIFICATION_CHANNELS.IN_APP, NOTIFICATION_CHANNELS.PUSH],
};

// ─── Funções públicas ─────────────────────────────────────────────────────────

/**
 * Resolve os canais destino para um tipo de notificação.
 * Regras customizadas sobrepõem DEFAULT_CHANNEL_RULES.
 * Tipos desconhecidos fazem fallback para [IN_APP].
 *
 * @param {string} type - tipo da notificação (ex: 'purchase', 'comment')
 * @param {Record<string, string[]>} [customRules={}] - sobrepõe DEFAULT_CHANNEL_RULES
 * @returns {string[]} canais destino
 */
export function resolveChannels(
    type: string,
    customRules: Record<string, string[]> = {},
): string[] {
    const rules = { ...DEFAULT_CHANNEL_RULES, ...customRules };
    return rules[type] ?? [NOTIFICATION_CHANNELS.IN_APP];
}

/**
 * Despacha uma notificação para os canais especificados.
 * Fase 1: IN_APP marcado como dispatched=true; EMAIL e PUSH são stubs.
 *
 * @param {Object} notification - objeto de notificação (ver notificationSchema.js)
 * @param {string[]} channels - canais retornados por resolveChannels()
 * @returns {{ channel: string, dispatched: boolean, stub: boolean }[]}
 */
export function dispatchNotification(
    notification: unknown,
    channels: string[],
): { channel: string; dispatched: boolean; stub: boolean }[] {
    return channels.map((channel) => ({
        channel,
        dispatched: channel === NOTIFICATION_CHANNELS.IN_APP,
        stub: channel !== NOTIFICATION_CHANNELS.IN_APP,
    }));
}