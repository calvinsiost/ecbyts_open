// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// SPEC: docs/specs/features/SPEC_FORUM_KNOWLEDGE_GROUPS.md
// Phase 5 — AI moderation: pure heuristic pre-filter + optional LLM escalation.

/* ================================================================
   FORUM MODERATION — toxicity / spam detection.
   Layered: cheap pure heuristic ALWAYS runs first. LLM escalation is
   strictly opt-in and only on borderline content. Heuristic alone
   never blocks unless overwhelmingly confident (score > 0.85).
   ================================================================ */

interface HeuristicResult {
    toxic: boolean;
    spam: boolean;
    score: number;
    reasons: string[];
}

interface ModerationVerdict {
    action: 'allow' | 'flag' | 'block';
    confidence: number;
    source: 'heuristic' | 'llm';
}

/** Frozen thresholds — single source of truth for the moderation gate. */
export const MODERATION_THRESHOLDS = Object.freeze({
    /** Below this the content is allowed without escalation. */
    FLAG: 0.4,
    /** Heuristic-only block requires overwhelming confidence. */
    HEURISTIC_BLOCK: 0.85,
    /** LLM escalation triggers when heuristic score exceeds this. */
    LLM_ESCALATE: 0.4,
});

// Minimal, environmental-forum-appropriate markers. Intentionally NOT
// a slur list — only generic spam / abuse tokens that have no place in
// a professional EHS discussion. Keep this list small and reviewable.
const BAD_WORDS = Object.freeze([
    'idiot',
    'idiota',
    'scam',
    'golpe',
    'viagra',
    'casino',
    'crypto pump',
    'free money',
    'dinheiro grátis',
    'clique aqui agora',
    'porn',
]);

/**
 * PURE heuristic content classifier — no network, no LLM.
 * @param {string} text
 * @returns {HeuristicResult}
 */
export function classifyContent(text: string): HeuristicResult {
    const reasons: string[] = [];
    if (typeof text !== 'string' || !text.trim()) {
        return { toxic: false, spam: false, score: 0, reasons: [] };
    }
    const t = text.trim();
    const lower = t.toLowerCase();
    let score = 0;
    let toxic = false;
    let spam = false;

    // 1. Excessive caps (len > 20, > 70% uppercase among letters).
    const letters = t.replace(/[^a-zA-ZÀ-ÿ]/g, '');
    if (letters.length > 20) {
        const upper = (letters.match(/[A-ZÀ-Þ]/g) || []).length;
        if (upper / letters.length > 0.7) {
            reasons.push('excessive_caps');
            score += 0.4;
            toxic = true;
        }
    }

    // 2. Repeated chars (> 5 same in a row).
    if (/(.)\1{5,}/.test(t)) {
        reasons.push('repeated_chars');
        score += 0.3;
        spam = true;
    }

    // 3. URL spam (> 3 links).
    const urls = lower.match(/https?:\/\/|www\.|\b\w+\.(com|net|org|io|ru|xyz)\b/g) || [];
    if (urls.length > 3) {
        reasons.push('url_spam');
        score += 0.5;
        spam = true;
    }

    // 4. Bad-word markers.
    let badHits = 0;
    for (const w of BAD_WORDS) {
        if (lower.includes(w)) badHits += 1;
    }
    if (badHits > 0) {
        reasons.push(`bad_words:${badHits}`);
        score += Math.min(0.6, badHits * 0.3);
        toxic = true;
    }

    // 5. All-emoji / no meaningful text.
    const stripped = t.replace(/\s/g, '');
    if (stripped.length > 0) {
        const nonAlnum = stripped.replace(/[\p{L}\p{N}.,!?;:'"()-]/gu, '');
        if (nonAlnum.length / stripped.length > 0.8 && stripped.length > 3) {
            reasons.push('all_emoji');
            score += 0.3;
            spam = true;
        }
    }

    return { toxic, spam, score: Math.min(1, Number(score.toFixed(3))), reasons };
}

/**
 * Map a heuristic result to a verdict (pure, no escalation).
 * @param {HeuristicResult} h
 * @returns {ModerationVerdict}
 */
function heuristicVerdict(h: HeuristicResult): ModerationVerdict {
    if (h.score > MODERATION_THRESHOLDS.HEURISTIC_BLOCK) {
        return { action: 'block', confidence: h.score, source: 'heuristic' };
    }
    if (h.score >= MODERATION_THRESHOLDS.FLAG) {
        return { action: 'flag', confidence: h.score, source: 'heuristic' };
    }
    return { action: 'allow', confidence: 1 - h.score, source: 'heuristic' };
}

/**
 * Moderate content. Runs the pure heuristic first; optionally escalates
 * to the existing LLM client when `opts.useLLM` is set and the heuristic
 * score is borderline. Any LLM failure gracefully degrades to the
 * heuristic verdict — moderation never throws on a network error.
 * @param {string} text
 * @param {{ useLLM?: boolean }} [opts]
 * @returns {Promise<ModerationVerdict>}
 */
export async function moderateWithLLM(text: string, opts: { useLLM?: boolean } = {}): Promise<ModerationVerdict> {
    const h = classifyContent(text);
    const base = heuristicVerdict(h);

    if (!opts.useLLM || h.score <= MODERATION_THRESHOLDS.LLM_ESCALATE) {
        return base;
    }

    try {
        const mod = await import('../llm/client.js');
        if (typeof mod.hasApiKey === 'function' && !mod.hasApiKey()) {
            return base; // no key → heuristic fallback
        }
        if (typeof mod.sendMessage !== 'function') return base;
        const sys =
            'You are a content moderator for a professional environmental engineering forum. ' +
            'Reply with EXACTLY one word: ALLOW, FLAG, or BLOCK. Consider toxicity and spam only.';
        const resp = await mod.sendMessage(sys, String(text).slice(0, 4000), { maxTokens: 8 });
        const verdict = String(resp || '').toUpperCase();
        if (verdict.includes('BLOCK')) {
            return { action: 'block', confidence: Math.max(0.85, h.score), source: 'llm' };
        }
        if (verdict.includes('FLAG')) {
            return { action: 'flag', confidence: Math.max(0.5, h.score), source: 'llm' };
        }
        if (verdict.includes('ALLOW')) {
            return { action: 'allow', confidence: 0.9, source: 'llm' };
        }
        return base; // unparseable → heuristic fallback
    } catch (e) {
        console.debug('[forum:moderateWithLLM:fallback]', (e as any)?.message || e);
        return base;
    }
}

/**
 * Build an append-only moderation audit log entry (pure).
 * @param {{ threadId: string, action: string, source: string, score: number, replyId?: string }} input
 * @returns {{ threadId: string, replyId: string|null, action: string, source: string, score: number, ts: string }}
 */
export function buildModerationLog(input: { threadId: string, action: string, source: string, score: number, replyId?: string }): { threadId: string, replyId: string|null, action: string, source: string, score: number, ts: string } {
    return {
        threadId: input && input.threadId ? String(input.threadId) : '',
        replyId: input && input.replyId ? String(input.replyId) : null,
        action: input && input.action ? String(input.action) : 'allow',
        source: input && input.source ? String(input.source) : 'heuristic',
        score: input && typeof input.score === 'number' ? Number(input.score.toFixed(3)) : 0,
        ts: new Date().toISOString(),
    };
}
