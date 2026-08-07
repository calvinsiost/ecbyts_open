// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   AUDIT TRAIL PURE (Module C extraction — refactor-opportunities pick)
   ================================================================

   Helpers pure-logic extraídos de core/governance/auditTrail.ts (G1).
   Decoupled de IDB/state — pattern análogo a _decisionLogPure.

   IMPORTANTE: action filter usa PREFIX matching com '.' como separador
   (ex: filter 'eis' bate em 'eis', 'eis.batch_correction', 'eis.recalculate'
   mas NÃO em 'eisAlternative'). Comportamento preservado fielmente.
   ================================================================ */

type AnyRecord = Record<string, any>;

/**
 * Aplica chain de filtros a entries de audit; respeita ordem original
 * (userId → action → resourceId → fromDate → toDate → limit). Pure (sem
 * mutação de input). entries não-array → [].
 *
 * `action` filter: bate exact OR prefix com `.` (hierárquico).
 * `limit > 0` retorna os ÚLTIMOS N entries (slice(-limit)).
 */
export function applyAuditFilters(
    entries: AnyRecord[],
    filters: {
        userId?: string;
        action?: string;
        resourceId?: string;
        fromDate?: string;
        toDate?: string;
        limit?: number;
    } = {},
): AnyRecord[] {
    if (!Array.isArray(entries)) return [];
    let result = entries;
    if (filters.userId) result = result.filter((e) => e.userId === filters.userId);
    if (filters.action) {
        const action = filters.action;
        result = result.filter((e) => e.action === action || (typeof e.action === 'string' && e.action.startsWith(action + '.')));
    }
    if (filters.resourceId) result = result.filter((e) => e.resourceId === filters.resourceId);
    if (filters.fromDate) {
        const from = filters.fromDate;
        result = result.filter((e) => e.timestamp >= from);
    }
    if (filters.toDate) {
        const to = filters.toDate;
        result = result.filter((e) => e.timestamp <= to);
    }
    if (filters.limit && filters.limit > 0) result = result.slice(-filters.limit);
    return result;
}

/**
 * Stats agregadas: total + byAction (cada action contada) + firstEntry/
 * lastEntry timestamps. Diferentemente do decisionLog, NÃO preenche
 * categorias unknown com 0 (auditTrail aceita actions arbitrárias).
 */
export function computeAuditStats(entries: AnyRecord[]): {
    total: number;
    byAction: Record<string, number>;
    firstEntry: string | null;
    lastEntry: string | null;
} {
    const byAction: Record<string, number> = {};
    const arr = Array.isArray(entries) ? entries : [];
    for (const e of arr) {
        if (typeof e?.action === 'string') {
            byAction[e.action] = (byAction[e.action] || 0) + 1;
        }
    }
    return {
        total: arr.length,
        byAction,
        firstEntry: arr.length > 0 ? arr[0]!.timestamp : null,
        lastEntry: arr.length > 0 ? arr[arr.length - 1]!.timestamp : null,
    };
}
