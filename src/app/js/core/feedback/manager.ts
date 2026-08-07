// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// Feedback Manager - localStorage-first vote persistence for the universal
// like/dislike widget. See docs/specs/_archived/SPEC_UNIVERSAL_FEEDBACK_WIDGET.md
// for the full spec and docs/specs/arch/SPEC_UI_EXPLORATION_HARNESS.md §A.4.6
// for the F4.6 RLHF integration.
//
// Phase 1 MVP: localStorage only. Phase 2 wires sync to Supabase
// `public.model_feedback` via the existing syncQueue.
//
// Data shape per vote:
//   {
//     ts: <ISO>,
//     sessionId: <uuid>,
//     screenId: 'eis-modal' | 'statusbar' | 'home' | ...
//     vote: 1 | -1,
//     ecbtKey: null | <ECBT.A...>,  -- best-effort, null if unavailable
//     eisScore: null | <0..5>,
//     totalCapex: null | number,
//     totalOpex: null | number,
//     context: { sectionTag, elementsCount, lastInteractionType },
//   }
import { safeSetItem } from '../../utils/storage/storageMonitor.js';
const STORAGE_PREFIX = 'ecbyts-feedback-';
const SESSION_KEY = 'ecbyts-feedback-session-id';
const RATE_LIMIT_MS = 60_000;
const _rateLimitTracker = new Map(); // screenId -> lastVoteTs
/**
 * Get or create a persistent session id for this browser (not the Supabase
 * auth session - this is a local analytics anchor that survives browser
 * restarts but resets on storage clear).
 * @returns {string}
 */
function _getSessionId() {
    try {
        let id = localStorage.getItem(SESSION_KEY);
        if (!id) {
            // Lightweight uuid v4 via crypto.randomUUID when available
            id =
                typeof crypto !== 'undefined' && crypto.randomUUID
                    ? crypto.randomUUID()
                    : 'fallback-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
            localStorage.setItem(SESSION_KEY, id);
        }
        return id;
    }
    catch ( /** @type {any} */e) {
        console.debug('[feedback] sessionId-storage:', (e as any)?.message || e);
        return 'anon-' + Date.now().toString(36);
    }
}
/**
 * Best-effort read of the current model's outcome (eis + capex + opex +
 * ecbtKey). Lazy imports so the feedback module does not pull unrelated
 * dependencies at boot.
 * @returns {Promise<{ecbtKey:string|null, eisScore:number|null, totalCapex:number|null, totalOpex:number|null, context:object}>}
 */
async function _collectCurrentOutcome() {
    /** @type {any} */
    const out: any = {
        ecbtKey: null,
        eisScore: null,
        totalCapex: null,
        totalOpex: null,
        context: {} as any,
    };
    try {
        const cost = await import('../analytics/economics/costRollup.js' as string);
        if (cost?.buildCostRollup) {
            const r = cost.buildCostRollup();
            out.totalCapex = r?.totalCapex ?? null;
            out.totalOpex = r?.totalOpex ?? null;
        }
    }
    catch ( /** @type {any} */e) {
        console.debug('[feedback] cost-module-unavailable:', (e as any)?.message || e);
        /* cost module unavailable */
    }
    try {
        // Try to read the CURRENT displayed EIS via the last rendered value
        // on the DOM - avoids re-calling the engine with possibly stale inputs
        const badge = document.getElementById('eis-verdict-badge');
        if (badge) {
            const m = badge.textContent?.match(/([0-9]\.[0-9]+)/);
            if (m)
                out.eisScore = Number(m[1]);
        }
    }
    catch ( /** @type {any} */e) {
        console.debug('[feedback] eis-badge-read:', (e as any)?.message || e);
        /* noop */
    }
    try {
        const elMod = await import('../elements/manager.js' as string);
        if (elMod?.getAllElements) {
            const els = elMod.getAllElements();
            out.context.elementsCount = Array.isArray(els) ? els.length : 0;
        }
    }
    catch ( /** @type {any} */e) {
        console.debug('[feedback] elements-manager-import:', (e as any)?.message || e);
        /* noop */
    }
    return out;
}
/**
 * Rate-limit check. Returns true if this screen can accept a vote now.
 * @param {string} screenId
 */
function _checkRateLimit(screenId: any) {
    const last = _rateLimitTracker.get(screenId) || 0;
    return Date.now() - last >= RATE_LIMIT_MS;
}
/**
 * Record a user vote on the current model state.
 * @param {1|-1} vote
 * @param {{ screenId?: string, override?: object }} [opts]
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function recordFeedback(vote: any, opts: any = {}) {
    if (vote !== 1 && vote !== -1) {
        return { ok: false, reason: 'invalid_vote' };
    }
    const screenId = opts.screenId || 'unknown';
    if (!_checkRateLimit(screenId)) {
        return { ok: false, reason: 'rate_limited' };
    }
    _rateLimitTracker.set(screenId, Date.now());
    /** @type {any} */
    const outcome = opts.override || (await _collectCurrentOutcome());
    const payload = {
        ts: new Date().toISOString(),
        sessionId: _getSessionId(),
        screenId,
        vote,
        ecbtKey: outcome.ecbtKey ?? null,
        eisScore: outcome.eisScore ?? null,
        totalCapex: outcome.totalCapex ?? null,
        totalOpex: outcome.totalOpex ?? null,
        context: outcome.context || {},
    };
    const key = STORAGE_PREFIX + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const saved = safeSetItem(key, JSON.stringify(payload));
    if (!saved) {
        return { ok: false, reason: 'storage_full' };
    }
    // Increment the screen-local aggregate for instant UI update
    try {
        const aggKey = STORAGE_PREFIX + 'agg-' + screenId;
        const raw = localStorage.getItem(aggKey) || '';
        const agg = raw ? JSON.parse(raw) : { likes: 0, dislikes: 0 };
        if (vote === 1)
            agg.likes++;
        else
            agg.dislikes++;
        safeSetItem(aggKey, JSON.stringify(agg));
    }
    catch ( /** @type {any} */e) {
        console.debug('[feedback] aggregate-update:', (e as any)?.message || e);
        /* noop */
    }
    return { ok: true };
}
/**
 * Read the local aggregate counter for a screen. Used by the widget to
 * display "+12 / -2" counts without fetching each vote individually.
 * @param {string} screenId
 * @returns {{likes:number, dislikes:number, ratio:number}}
 */
export function getScreenAggregate(screenId: any) {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + 'agg-' + screenId) || '';
        if (!raw)
            return { likes: 0, dislikes: 0, ratio: 0 };
        const agg = JSON.parse(raw);
        const total = agg.likes + agg.dislikes;
        const ratio = total > 0 ? (agg.likes - agg.dislikes) / total : 0;
        return { likes: agg.likes || 0, dislikes: agg.dislikes || 0, ratio };
    }
    catch ( /** @type {any} */e) {
        console.debug('[feedback] aggregate-read:', (e as any)?.message || e);
        return { likes: 0, dislikes: 0, ratio: 0 };
    }
}
/**
 * Return ALL locally-stored feedback payloads (for debug or export to
 * syncQueue). Orders by timestamp asc.
 * @returns {Array<object>}
 */
export function getAllFeedback() {
    const out = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i) || '';
            if (!key || !key.startsWith(STORAGE_PREFIX))
                continue;
            if (key.startsWith(STORAGE_PREFIX + 'agg-'))
                continue; // skip aggregates
            if (key === SESSION_KEY)
                continue;
            try {
                const v = localStorage.getItem(key) || '';
                if (v)
                    out.push(JSON.parse(v));
            }
            catch ( /** @type {any} */e) {
                console.debug('[feedback] entry-parse:', (e as any)?.message || e);
                /* skip malformed */
            }
        }
    }
    catch ( /** @type {any} */e) {
        console.debug('[feedback] localStorage-iter:', (e as any)?.message || e);
        /* noop */
    }
    out.sort((a: any, b: any) => (a.ts || '').localeCompare(b.ts || ''));
    return out;
}
