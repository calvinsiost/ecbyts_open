// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// SPEC: docs/specs/features/SPEC_FORUM_KNOWLEDGE_GROUPS.md
// Phase 3 — karma engine (pure logic, privacy-respecting).

/* ================================================================
   FORUM KARMA ENGINE — honest, PRIVATE reputation.

   Karma NUNCA é exibido publicamente (anti-farming, Discourse
   Meta #89566). Apenas o próprio usuário e admin/owner veem o
   total exato; outros veem somente o tier badge. Karma é usado
   como gate para ações de moderação (especialista+ ou owner).

   Todas as funções são puras e testáveis em Node sem browser.
   ================================================================ */

export type KarmaEventType =
    | 'reply_upvoted'
    | 'thread_accepted'
    | 'library_linked'
    | 'moderation_action'
    | 'thread_upvoted';

export interface KarmaEvent {
    type: KarmaEventType;
    /** Override opcional (default = KARMA_WEIGHTS[type]) */
    weight?: number;
}

export type KarmaTier = 'novato' | 'contribuidor' | 'especialista' | 'autoridade' | 'lenda';

/**
 * Pesos canônicos por tipo de evento. Frozen — não mutável em runtime.
 */
export const KARMA_WEIGHTS: Readonly<Record<KarmaEventType, number>> = Object.freeze({
    reply_upvoted: 2,
    thread_accepted: 15,
    library_linked: 5,
    moderation_action: 3,
    thread_upvoted: 3,
});

/**
 * Thresholds de tier (inclusive lower bound). Frozen.
 */
export const KARMA_TIERS: ReadonlyArray<{ tier: KarmaTier; min: number }> = Object.freeze([
    { tier: 'lenda' as KarmaTier, min: 5000 },
    { tier: 'autoridade' as KarmaTier, min: 1000 },
    { tier: 'especialista' as KarmaTier, min: 250 },
    { tier: 'contribuidor' as KarmaTier, min: 50 },
    { tier: 'novato' as KarmaTier, min: 0 },
]);

/** Karma mínimo para moderar (especialista+). */
export const MODERATION_KARMA_THRESHOLD = 250;

/**
 * Soma o karma total a partir de uma lista de eventos.
 * Eventos inválidos ou tipo desconhecido são ignorados (não quebram).
 * @param events
 * @returns Total de karma (inteiro, nunca negativo abaixo de 0).
 */
export function computeKarma(events: KarmaEvent[]): number {
    if (!Array.isArray(events)) return 0;
    let total = 0;
    for (const ev of events) {
        if (!ev || typeof ev !== 'object') continue;
        const base = KARMA_WEIGHTS[ev.type as KarmaEventType];
        if (base === undefined) continue;
        const w = typeof ev.weight === 'number' && Number.isFinite(ev.weight) ? ev.weight : base;
        total += w;
    }
    return Math.max(0, Math.round(total));
}

/**
 * Resolve o tier a partir do total de pontos.
 * @param points
 */
export function karmaTier(points: number): KarmaTier {
    const p = typeof points === 'number' && Number.isFinite(points) ? points : 0;
    for (const { tier, min } of KARMA_TIERS) {
        if (p >= min) return tier;
    }
    return 'novato' as KarmaTier;
}

/**
 * Determina se um usuário pode executar ação de moderação no grupo.
 * Owner sempre pode; demais precisam de karma >= threshold (especialista+).
 * @param karma
 * @param isOwner
 */
export function canModerate(karma: number, isOwner: boolean): boolean {
    if (isOwner === true) return true;
    const k = typeof karma === 'number' && Number.isFinite(karma) ? karma : 0;
    return k >= MODERATION_KARMA_THRESHOLD;
}

/**
 * Visão de karma respeitando privacidade. Apenas self ou admin veem
 * o número exato; terceiros recebem somente o tier badge.
 * @param input
 */
export function karmaPublicView(input: { points: number; isSelf?: boolean; isAdmin?: boolean }): {
    tier: KarmaTier;
    points: number | null;
    visible: boolean;
} {
    const points =
        input && typeof input.points === 'number' && Number.isFinite(input.points) ? Math.max(0, input.points) : 0;
    const tier = karmaTier(points);
    const canSeeExact = !!(input && (input.isSelf || input.isAdmin));
    return { tier, points: canSeeExact ? points : null, visible: canSeeExact };
}
