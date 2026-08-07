// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   DECISION LOG PURE (Module C extraction — refactor-opportunities pick)
   ================================================================

   Helpers pure-logic extraídos de core/governance/decisionLog.ts.
   Decoupled de IDB/state — recebem entries como input. Pattern Module C.
   ================================================================ */

type AnyRecord = Record<string, any>;

/**
 * Valida shape de uma decision entry contra constraints injetadas.
 * Throws Error com mensagem específica em cada falha.
 *
 * Constraints recebidos via opts → testável sem depender dos constants
 * privados do decisionLog.ts.
 */
export function validateDecision(
    decision: any,
    opts: {
        maxTitleLength: number;
        minRationaleLength: number;
        validCategories: ReadonlyArray<string>;
    },
): void {
    if (!decision || typeof decision !== 'object') {
        throw new Error('logDecision: decision object required');
    }
    if (!decision.title || typeof decision.title !== 'string') {
        throw new Error('logDecision: title is required');
    }
    if (decision.title.length > opts.maxTitleLength) {
        throw new Error(`logDecision: title exceeds ${opts.maxTitleLength} chars`);
    }
    if (!decision.rationale || typeof decision.rationale !== 'string') {
        throw new Error('logDecision: rationale is required');
    }
    if (decision.rationale.trim().length < opts.minRationaleLength) {
        throw new Error(`logDecision: rationale must be at least ${opts.minRationaleLength} chars`);
    }
    if (!decision.category || !opts.validCategories.includes(decision.category)) {
        throw new Error(
            `logDecision: category must be one of ${opts.validCategories.join(', ')}, got "${decision.category}"`,
        );
    }
    if (decision.refContext) {
        if (
            typeof decision.refContext !== 'object' ||
            !decision.refContext.type ||
            !decision.refContext.id
        ) {
            throw new Error('logDecision: refContext must be { type, id, label? }');
        }
    }
}

/**
 * Aplica chain de filtros a entries; respeita ordem do código original
 * (actor → category → fromDate → toDate → tag → limit). Pure — não muta
 * input array.
 *
 * `limit > 0` retorna os ÚLTIMOS N entries (slice(-limit)).
 */
export function applyDecisionFilters(
    entries: AnyRecord[],
    filters: {
        actor?: string;
        category?: string;
        fromDate?: string;
        toDate?: string;
        tag?: string;
        limit?: number;
    } = {},
): AnyRecord[] {
    if (!Array.isArray(entries)) return [];
    let result = entries;
    if (filters.actor) result = result.filter((e) => e.actor === filters.actor);
    if (filters.category) result = result.filter((e) => e.category === filters.category);
    if (filters.fromDate) {
        const from = filters.fromDate;
        result = result.filter((e) => e.timestamp >= from);
    }
    if (filters.toDate) {
        const to = filters.toDate;
        result = result.filter((e) => e.timestamp <= to);
    }
    if (filters.tag) {
        const tag = filters.tag;
        result = result.filter((e) => e.tags && e.tags.includes(tag));
    }
    if (filters.limit && filters.limit > 0) {
        result = result.slice(-filters.limit);
    }
    return result;
}

/**
 * Calcula stats agregadas sobre entries: total, byCategory (preenchido para
 * TODAS as categorias válidas com 0 se ausente, padrão do dashboard),
 * firstEntry/lastEntry timestamps.
 */
export function computeDecisionStats(
    entries: AnyRecord[],
    validCategories: ReadonlyArray<string>,
): { total: number; byCategory: Record<string, number>; firstEntry: string | null; lastEntry: string | null } {
    const byCategory: Record<string, number> = {};
    for (const cat of validCategories) byCategory[cat] = 0;
    const arr = Array.isArray(entries) ? entries : [];
    for (const e of arr) {
        if (e?.category != null && byCategory[e.category] !== undefined) {
            byCategory[e.category]!++;
        }
    }
    return {
        total: arr.length,
        byCategory,
        firstEntry: arr.length > 0 ? arr[0]!.timestamp : null,
        lastEntry: arr.length > 0 ? arr[arr.length - 1]!.timestamp : null,
    };
}
