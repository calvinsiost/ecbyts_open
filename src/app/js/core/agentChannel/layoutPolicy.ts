// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   AGENT CHANNEL LAYOUT POLICY — SPEC_AGENT_CHANNEL_LAYOUT_POLICY

   Pure helpers para score + layout plan do admin Agent Channel:
   - scoreThread (§3.1 score derivation)
   - buildChannelLayoutPlan (§3.2 hero/queue/watchlist)
   - buildThreadPresentation (§3.3 centerOrder + sideMode)
   - resolveViewportBucket + truncateHistory (§3.4 viewport)

   Markdown é source of truth; policy só decide como exibir (§Q1).
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Scoring weights (§3.1)
// ──────────────────────────────────────────────────────────────────────

export const ROADMAP_PRIORITY_WEIGHTS = Object.freeze({
    P0: 100,
    P1: 60,
    P2: 30,
    P3: 10,
});

export const STATUS_WEIGHTS = Object.freeze({
    blocked: 50,
    open: 30,
    todo: 30,
    in_progress: 15,
    resolved: 0,
});

export const VIEWPORT_BUCKETS = Object.freeze({
    WIDE: 'wide',
    MEDIUM: 'medium',
    NARROW: 'narrow',
});

export const HISTORY_LIMITS = Object.freeze({
    wide: 6,
    medium: 5,
    narrow: 4,
});

export const SIDE_MODES = Object.freeze(['quick', 'context', 'composer']);

// ──────────────────────────────────────────────────────────────────────
// Score derivation (§3.1)
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa score para priorização.
 *
 * @param thread - { needsCalvin, roadmap_priority, status, hasRecommended, changedSinceVisit, timestamp }
 * @param opts - { now: number }
 */
export function scoreThread(thread: Record<string, any>, opts: Record<string, any> = {}): number {
    if (!thread || typeof thread !== 'object') return 0;
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();

    let score = 0;
    // 1. Needs Calvin - peso máximo para ação humana pendente
    if (thread.needsCalvin === true) score += 200;
    // 2. Roadmap priority
    score += (ROADMAP_PRIORITY_WEIGHTS as Record<string, number>)[thread.roadmap_priority] || 0;
    // 3. Status
    score += (STATUS_WEIGHTS as Record<string, number>)[thread.status] || 0;
    // 4. Recommended / Done when
    if (thread.hasRecommended === true) score += 25;
    if (thread.hasDoneWhen === true) score += 15;
    // 5. Changed since visit
    if (thread.changedSinceVisit === true) score += 30;
    // 6. Recency (diminui com idade; max 40 pts, queda por dia)
    const ts = Number(thread.timestamp);
    if (Number.isFinite(ts)) {
        const ageDays = Math.max(0, (now - ts) / (24 * 60 * 60 * 1000));
        const recencyPts = Math.max(0, 40 - ageDays * 5); // -5 pts/dia
        score += recencyPts;
    }
    return score;
}

// ──────────────────────────────────────────────────────────────────────
// Layout plan (§3.2 slots canônicos)
// ──────────────────────────────────────────────────────────────────────

/**
 * Constrói layout plan do canal.
 *
 * Slots canônicos:
 * - hero: maior score
 * - immediate_queue: needsCalvin=yes OR status=blocked, cap por viewport
 * - watchlist: restante ordenado por score desc
 */
export function buildChannelLayoutPlan(
    threads: Array<any>,
    opts: { viewport?: 'wide' | 'medium' | 'narrow'; now?: number } = {},
): {
    hero: any;
    immediateQueue: Array<any>;
    watchlist: Array<any>;
    viewport: string;
    scores: Map<string, number>;
} {
    const viewport = opts.viewport || VIEWPORT_BUCKETS.WIDE;
    const now = opts.now || Date.now();
    const scores = new Map<string, number>();

    if (!Array.isArray(threads) || threads.length === 0) {
        return { hero: null, immediateQueue: [], watchlist: [], viewport, scores };
    }

    const scored = threads
        .filter((t) => t && typeof t === 'object' && t.id)
        .map((t) => {
            const s = scoreThread(t, { now });
            scores.set(t.id, s);
            return { thread: t, score: s };
        })
        .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
        return { hero: null, immediateQueue: [], watchlist: [], viewport, scores };
    }

    // Hero = top
    const hero = scored[0]!.thread;

    // Immediate queue = needsCalvin ou blocked (excluindo hero)
    const immediateCap = viewport === VIEWPORT_BUCKETS.WIDE ? 3 : 2;
    const immediateQueue = scored
        .slice(1)
        .filter((s) => s.thread.needsCalvin === true || s.thread.status === 'blocked')
        .slice(0, immediateCap)
        .map((s) => s.thread);

    const immediateIds = new Set(immediateQueue.map((t) => t.id));
    const watchlistCap = viewport === VIEWPORT_BUCKETS.NARROW ? 5 : 10;
    const watchlist = scored
        .slice(1)
        .filter((s) => !immediateIds.has(s.thread.id))
        .slice(0, watchlistCap)
        .map((s) => s.thread);

    return { hero, immediateQueue, watchlist, viewport, scores };
}

// ──────────────────────────────────────────────────────────────────────
// Thread presentation (§3.3 intra-posicionamento)
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide como apresentar thread selecionada no centro + lateral direita.
 */
export function buildThreadPresentation(
    thread: Record<string, any>,
    opts: { draftOpen?: boolean; viewport?: 'wide' | 'medium' | 'narrow' } = {},
): {
    centerOrder: Array<string>;
    sideMode: string;
    historyLimit: number;
} {
    const draftOpen = !!opts.draftOpen;
    const viewport = opts.viewport || VIEWPORT_BUCKETS.WIDE;
    const historyLimit = (HISTORY_LIMITS as Record<string, number>)[viewport] ?? HISTORY_LIMITS.wide;

    if (!thread || typeof thread !== 'object') {
        return {
            centerOrder: ['executive_summary', 'history'],
            sideMode: 'context',
            historyLimit,
        };
    }

    // Center order §3.3 items 1-2
    const hasDecision = thread.needsCalvin === true || thread.hasRecommended === true;
    const centerOrder = hasDecision
        ? ['suggested_decision', 'executive_summary', 'history']
        : ['executive_summary', 'history'];

    // Side mode §3.3 item 3 + item 5 do layout
    let sideMode;
    if (draftOpen) sideMode = 'composer';
    else if (hasDecision)
        sideMode = 'quick'; // ação rápida
    else sideMode = 'context'; // só contexto

    // Narrow viewport nunca deve ter composer dominante por default
    if (viewport === VIEWPORT_BUCKETS.NARROW && sideMode === 'composer' && !draftOpen) {
        sideMode = 'quick';
    }

    return { centerOrder, sideMode, historyLimit };
}

// ──────────────────────────────────────────────────────────────────────
// Viewport helpers (§3.4)
// ──────────────────────────────────────────────────────────────────────

/**
 * Resolve bucket viewport por largura.
 */
export function resolveViewportBucket(widthPx: number): 'wide' | 'medium' | 'narrow' {
    if (!Number.isFinite(widthPx)) return VIEWPORT_BUCKETS.WIDE as 'wide';
    if (widthPx >= 1800) return VIEWPORT_BUCKETS.WIDE as 'wide';
    if (widthPx >= 1400) return VIEWPORT_BUCKETS.MEDIUM as 'medium';
    return VIEWPORT_BUCKETS.NARROW as 'narrow';
}

/**
 * Trunca histórico por viewport.
 */
export function truncateHistory(
    messages: Array<any>,
    viewport: string = VIEWPORT_BUCKETS.WIDE,
): Array<any> {
    if (!Array.isArray(messages)) return [];
    const limit = (HISTORY_LIMITS as Record<string, number>)[viewport] ?? HISTORY_LIMITS.wide;
    return messages.slice(-limit); // últimas N
}
