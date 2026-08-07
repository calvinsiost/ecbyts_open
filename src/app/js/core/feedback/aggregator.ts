// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   FEEDBACK AGGREGATOR — SPEC_UNIVERSAL_FEEDBACK_WIDGET

   Pure helpers (sem localStorage/Supabase) para processar votes:
   - Weight computation §A4 (anon=0.3, authed=1.0, p2p=1.5)
   - Aggregate math (likes/dislikes/ratio) §[MH5] [MH6]
   - Rate limit check
   - Regression detection §[SH4] (score < -0.3 por 3 runs)
   - Payload builder/validator

   Estado + sincronização ficam em manager.js (já existente).
   Este módulo é puro e testável em node.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §A4 (ADR)
// ──────────────────────────────────────────────────────────────────────

export type Vote = -1 | 1;

export const VOTE_VALUES: readonly Vote[] = Object.freeze([-1, 1]) as readonly Vote[];

export type FeedbackRole = 'anon' | 'authed' | 'p2p_early';

export const WEIGHT_BY_ROLE: Readonly<Record<FeedbackRole, number>> = Object.freeze({
    anon: 0.3,
    authed: 1.0,
    p2p_early: 1.5,
});

export const RATE_LIMIT_MS = 60_000;

export const REGRESSION_THRESHOLD = -0.3; // §SH4
export const REGRESSION_MIN_RUNS = 3; // §SH4

export interface FeedbackEntry {
    readonly vote: Vote | number;
    readonly weight?: number;
}

export interface AggregateResult {
    readonly likes: number;
    readonly dislikes: number;
    readonly weightedScore: number;
    readonly count: number;
}

export interface FeedbackPayload {
    readonly ts: string;
    readonly sessionId: string | null;
    readonly screenId: string;
    readonly vote: Vote | number;
    readonly ecbtKey: string | null;
    readonly eisScore: number | null;
    readonly totalCapex: number | null;
    readonly totalOpex: number | null;
    readonly context: Record<string, unknown>;
    readonly weight: number;
}

export interface RegressionRun {
    readonly score: number;
    readonly runId?: string;
}

export interface ValidationResult {
    readonly valid: boolean;
    readonly errors: string[];
}

// ──────────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────────

export function isValidVote(vote: unknown): boolean {
    return (VOTE_VALUES as readonly number[]).includes(vote as number);
}

interface FeedbackPayloadInput {
    readonly ts?: unknown;
    readonly sessionId?: unknown;
    readonly screenId?: unknown;
    readonly vote?: unknown;
    readonly eisScore?: number | null;
}

/**
 * Valida payload completo de vote antes de sync para Supabase.
 */
export function validateFeedbackPayload(payload: unknown): ValidationResult {
    const errors: string[] = [];
    if (!payload || typeof payload !== 'object') {
        return { valid: false, errors: ['not object'] };
    }
    const p = payload as FeedbackPayloadInput;
    if (!p.ts) errors.push('ts required');
    if (!p.sessionId) errors.push('sessionId required');
    if (!p.screenId || typeof p.screenId !== 'string') {
        errors.push('screenId required');
    }
    if (!isValidVote(p.vote)) {
        errors.push('vote must be -1 or 1');
    }
    if (p.eisScore != null && (p.eisScore < 0 || p.eisScore > 5)) {
        errors.push('eisScore must be 0..5');
    }
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Weight computation §A4
// ──────────────────────────────────────────────────────────────────────

export function weightForRole(role: string | undefined | null): number {
    if (typeof role !== 'string') return WEIGHT_BY_ROLE.anon;
    const w = (WEIGHT_BY_ROLE as Record<string, number>)[role];
    return typeof w === 'number' ? w : WEIGHT_BY_ROLE.anon;
}

// ──────────────────────────────────────────────────────────────────────
// Aggregate math §[MH5/MH6]
// ──────────────────────────────────────────────────────────────────────

/**
 * Soma votes ponderados de uma lista de feedback entries.
 * Ignora entries inválidas.
 */
export function aggregateVotes(entries: readonly FeedbackEntry[] | unknown): AggregateResult {
    if (!Array.isArray(entries)) return { likes: 0, dislikes: 0, weightedScore: 0, count: 0 };
    let likes = 0;
    let dislikes = 0;
    let weightedScore = 0;
    let count = 0;
    for (const e of entries) {
        if (!e || !isValidVote(e.vote)) continue;
        const w: number = Number.isFinite(e.weight) ? (e.weight as number) : 1;
        if (e.vote === 1) likes++;
        else dislikes++;
        weightedScore += (e.vote as number) * w;
        count++;
    }
    return { likes, dislikes, weightedScore, count };
}

/**
 * Ratio de likes sobre total. Retorna null se count=0.
 */
export function likeRatio(agg: { likes?: number; dislikes?: number } | null | undefined): number | null {
    if (!agg) return null;
    const total = (agg.likes || 0) + (agg.dislikes || 0);
    if (total === 0) return null;
    return (agg.likes || 0) / total;
}

/**
 * Normalized score [-1, 1] baseado em weightedScore sobre soma abs dos weights.
 */
export function normalizedDesirability(entries: readonly FeedbackEntry[] | unknown): number {
    if (!Array.isArray(entries) || entries.length === 0) return 0;
    let num = 0;
    let den = 0;
    for (const e of entries) {
        if (!e || !isValidVote(e.vote)) continue;
        const w: number = Number.isFinite(e.weight) ? (e.weight as number) : 1;
        num += (e.vote as number) * w;
        den += Math.abs(w);
    }
    if (den === 0) return 0;
    return num / den;
}

// ──────────────────────────────────────────────────────────────────────
// Rate limit
// ──────────────────────────────────────────────────────────────────────

/**
 * Retorna se um screenId pode receber vote agora.
 */
export function canVoteNow(
    tracker: Map<string, number> | unknown,
    screenId: string,
    nowMs: number,
    windowMs: number = RATE_LIMIT_MS,
): boolean {
    if (!(tracker instanceof Map) || typeof screenId !== 'string') return false;
    if (!tracker.has(screenId)) return true; // primeira vez no screen
    const last = tracker.get(screenId);
    return Number(nowMs) - Number(last) >= Number(windowMs);
}

// ──────────────────────────────────────────────────────────────────────
// Regression detection §[SH4]
// ──────────────────────────────────────────────────────────────────────

/**
 * Detecta se houve regressão de desirability: score < threshold por
 * REGRESSION_MIN_RUNS execuções consecutivas.
 *
 * @param runs - ordenadas cronologicamente
 */
export function detectRegression(
    runs: readonly RegressionRun[] | unknown,
    threshold: number = REGRESSION_THRESHOLD,
    minRuns: number = REGRESSION_MIN_RUNS,
): { regression: boolean; consecutiveFailures: number } {
    if (!Array.isArray(runs) || runs.length === 0) {
        return { regression: false, consecutiveFailures: 0 };
    }
    // Conta runs consecutivas a partir do mais recente onde score < threshold
    let consecutive = 0;
    for (let i = runs.length - 1; i >= 0; i--) {
        const r = runs[i] as RegressionRun | undefined;
        if (!r || !Number.isFinite(r.score)) break;
        if (r.score < threshold) consecutive++;
        else break;
    }
    return {
        regression: consecutive >= Number(minRuns),
        consecutiveFailures: consecutive,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Payload builder (pure — sem side effects)
// ──────────────────────────────────────────────────────────────────────

export interface BuildFeedbackInput {
    readonly vote: Vote | number;
    readonly sessionId?: string | null;
    readonly screenId?: string;
    readonly role?: string;
    readonly ecbtKey?: string | null;
    readonly eisScore?: number | null;
    readonly totalCapex?: number | null;
    readonly totalOpex?: number | null;
    readonly context?: Record<string, unknown>;
}

/**
 * Constrói payload canônico para sync.
 */
export function buildFeedbackPayload(
    input: BuildFeedbackInput | unknown,
    nowMs?: number,
): FeedbackPayload | null {
    if (!input || typeof input !== 'object') return null;
    const i = input as BuildFeedbackInput;
    const now = Number(nowMs) || Date.now();
    return {
        ts: new Date(now).toISOString(),
        sessionId: i.sessionId ?? null,
        screenId: i.screenId || 'unknown',
        vote: i.vote,
        ecbtKey: i.ecbtKey ?? null,
        eisScore: i.eisScore ?? null,
        totalCapex: i.totalCapex ?? null,
        totalOpex: i.totalOpex ?? null,
        context: i.context || {},
        weight: weightForRole(i.role || 'anon'),
    };
}
