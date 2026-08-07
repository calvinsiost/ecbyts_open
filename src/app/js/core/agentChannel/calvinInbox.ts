// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CALVIN INBOX CORE — SPEC_AGENT_CHANNEL_CALVIN_INBOX

   Pure helpers para view "Inbox" Calvin-first do Agent Channel:
   - classifyThreadForInbox: decide_now/watchlist/fyi/resolved_recently
   - countInboxStats (4 blocos topo §5.2)
   - filters (owner, roadmap, priority)
   - shouldShowDiagnostic (§3.2 diagnostico recolhido)
   - markdown continua source of truth (§Q1)
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────

export const INBOX_SECTIONS = Object.freeze(['decide_now', 'watchlist', 'fyi', 'resolved_recently']);

export const RESOLVED_RECENTLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export const INBOX_VIEWS = Object.freeze(['inbox', 'threads', 'dashboard', 'raw']);
export const DEFAULT_VIEW = 'inbox';

// ──────────────────────────────────────────────────────────────────────
// Classification - decide which inbox section a thread belongs to
// ──────────────────────────────────────────────────────────────────────

/**
 * Classifica thread em uma das 4 seções do Inbox.
 *
 * Regra:
 * - decide_now: needsCalvin=true OR status=blocked
 * - watchlist: roadmap_priority in P0/P1 e não resolved
 * - fyi: open/in_progress sem roadmap crítico
 * - resolved_recently: resolved dentro da janela de 7 dias
 *
 * @returns section name
 */
export function classifyThreadForInbox(thread: Record<string, any>, now: number = Date.now()): string {
    if (!thread || typeof thread !== 'object') return 'fyi';

    // 1. decide_now - precisa ação humana OU blocked
    if (thread.needsCalvin === true) return 'decide_now';
    if (thread.status === 'blocked') return 'decide_now';

    // 2. resolved_recently - resolved dentro da janela
    if (thread.status === 'resolved') {
        const ts = Number(thread.resolvedAt) || Number(thread.timestamp) || 0;
        if (Number.isFinite(ts) && ts > 0 && now - ts <= RESOLVED_RECENTLY_WINDOW_MS) {
            return 'resolved_recently';
        }
        // resolvido há muito → não entra no inbox (archived effectively)
        return 'fyi';
    }

    // 3. watchlist - P0/P1 priorities
    if (thread.roadmap_priority === 'P0' || thread.roadmap_priority === 'P1') {
        return 'watchlist';
    }

    // 4. fyi - resto
    return 'fyi';
}

/**
 * Agrupa threads por section do Inbox.
 */
export function groupThreadsByInboxSection(
    threads: Array<any>,
    now: number = Date.now(),
): Record<string, Array<any>> {
    const out: Record<string, Array<any>> = {
        decide_now: [],
        watchlist: [],
        fyi: [],
        resolved_recently: [],
    };
    if (!Array.isArray(threads)) return out;
    for (const t of threads) {
        const section = classifyThreadForInbox(t, now);
        const bucket = out[section];
        if (bucket) bucket.push(t);
    }
    return out;
}

// ──────────────────────────────────────────────────────────────────────
// Top stats (§5.2 blocos no topo)
// ──────────────────────────────────────────────────────────────────────

/**
 * Conta stats dos 4 blocos do topo do Inbox.
 *
 * @param threads - timestamp da última visita
 */
export function countInboxStats(
    threads: Array<any>,
    sinceTs?: number,
    _now: number = Date.now(),
): {
    needsCalvin: number;
    criticalPath: number;
    blockers: number;
    changedSinceVisit: number;
} {
    const stats = { needsCalvin: 0, criticalPath: 0, blockers: 0, changedSinceVisit: 0 };
    if (!Array.isArray(threads)) return stats;

    for (const t of threads) {
        if (!t || typeof t !== 'object') continue;
        if (t.needsCalvin === true) stats.needsCalvin++;
        // Critical path = P0 + status open/in_progress/blocked
        if (t.roadmap_priority === 'P0' && t.status !== 'resolved') stats.criticalPath++;
        if (t.status === 'blocked') stats.blockers++;
        if (sinceTs !== undefined && Number.isFinite(sinceTs) && Number(t.updatedAt) > sinceTs)
            stats.changedSinceVisit++;
    }
    return stats;
}

// ──────────────────────────────────────────────────────────────────────
// Filters (§Jornada 2 - owner, roadmap)
// ──────────────────────────────────────────────────────────────────────

/**
 * Filtra threads por owner.
 */
export function filterByOwner(threads: Array<any>, ownerId: string): Array<any> {
    if (!Array.isArray(threads) || !ownerId) return [];
    return threads.filter((t) => t?.owner === ownerId);
}

/**
 * Filtra threads por roadmap item (ex: "P0-2", "ENV-VAL-001").
 */
export function filterByRoadmapItem(threads: Array<any>, roadmapItem: string): Array<any> {
    if (!Array.isArray(threads) || !roadmapItem) return [];
    return threads.filter((t) => t?.roadmap_item === roadmapItem);
}

/**
 * Filtra threads por priority.
 *
 * @param threads - 'P0' ou ['P0','P1']
 */
export function filterByPriority(threads: Array<any>, priority: string | Array<string>): Array<any> {
    if (!Array.isArray(threads) || !priority) return [];
    const priorities = Array.isArray(priority) ? priority : [priority];
    return threads.filter((t) => priorities.includes(t?.roadmap_priority));
}

// ──────────────────────────────────────────────────────────────────────
// Diagnostic collapse (§3.2 "diagnostico recolhido por padrão")
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide se diagnóstico deve estar collapsed por default.
 * Regra: se não há blockers reais, diagnostico collapsed.
 *
 * @param stats - retorno de countInboxStats
 * @returns collapsed
 */
export function shouldCollapseDiagnostic(stats: Record<string, any>): boolean {
    if (!stats || typeof stats !== 'object') return true;
    return stats.blockers === 0;
}

// ──────────────────────────────────────────────────────────────────────
// Last visit tracking
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa delta "desde última visita" para uma thread.
 */
export function computeSinceLastVisit(
    thread: Record<string, any>,
    sinceTs: number,
): {
    changed: boolean;
    newArtifacts: boolean;
    newMessages: boolean;
} {
    const out = { changed: false, newArtifacts: false, newMessages: false };
    if (!thread || !Number.isFinite(sinceTs)) return out;
    const updatedAt = Number(thread.updatedAt) || 0;
    out.changed = updatedAt > sinceTs;
    if (Number.isFinite(thread.lastArtifactAt)) {
        out.newArtifacts = thread.lastArtifactAt > sinceTs;
    }
    if (Number.isFinite(thread.lastMessageAt)) {
        out.newMessages = thread.lastMessageAt > sinceTs;
    }
    return out;
}

// ──────────────────────────────────────────────────────────────────────
// View validation
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida view name.
 */
export function isValidView(view: string): boolean {
    return typeof view === 'string' && INBOX_VIEWS.includes(view);
}

/**
 * Resolve view default se inválida.
 */
export function resolveView(view: string): string {
    return isValidView(view) ? view : DEFAULT_VIEW;
}
