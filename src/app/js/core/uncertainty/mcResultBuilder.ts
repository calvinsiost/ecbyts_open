// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/// <reference types="node" />

/* ================================================================
   MC RESULT BUILDER — SPEC_UNCERTAINTY_HUB_002_TIER2_MC

   Pure helpers para consolidar resultados Monte Carlo em evidence payload:
   - Histogram bin builder (40 bins default)
   - Quantile IC 95% (ordered samples)
   - inputs_hash SHA-256 para reprodutibilidade §Critério 3
   - Action fraction aggregator (allow/warn/block)
   - Sobol S1/ST threshold analyzer (interação não-linear)
   - Evidence payload completo (JCGM 101:2008)

   LHS sampling + MC execution ficam em monteCarlo.js + sobol.js.
   ================================================================ */

import crypto from 'node:crypto';

// ──────────────────────────────────────────────────────────────────────
// Constants §Q1/Q3
// ──────────────────────────────────────────────────────────────────────

export const DEFAULT_HISTOGRAM_BINS = 40;

export const DEFAULT_MC_CONFIG = Object.freeze({
    N_ITER_DEFAULT: 1000, // §Q1
    N_ITER_MIN: 500,
    N_ITER_MAX: 5000,
    WORKER_THRESHOLD: 10000, // §Q5 n_iter × n_vars
    DEFAULT_BLOCK_PROB: 0.25, // §Q4
});

export const DISTRIBUTIONS_SUPPORTED = Object.freeze(['normal', 'lognormal', 'triangular', 'uniform', 'empirical']);

export const ACTION_CATEGORIES = Object.freeze(['allow', 'warn', 'block']);

// Threshold para flag de interação não-linear §Q3 (ST - S1 > 0.1)
export const SOBOL_INTERACTION_THRESHOLD = 0.1;

// ──────────────────────────────────────────────────────────────────────
// Variable validation
// ──────────────────────────────────────────────────────────────────────

export function validateMcVariable(v: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!v || typeof v !== 'object') return { valid: false, errors: ['not object'] };
    if (!v.id) errors.push('id required');
    if (!DISTRIBUTIONS_SUPPORTED.includes(v.distribution as string)) {
        errors.push(`distribution must be one of: ${DISTRIBUTIONS_SUPPORTED.join(', ')}`);
    }
    if (!v.params || typeof v.params !== 'object') errors.push('params object required');
    const params = v.params as Record<string, unknown> | undefined;
    // Params específicos
    if (v.distribution === 'normal' || v.distribution === 'lognormal') {
        if (!Number.isFinite(params?.mu) || !Number.isFinite(params?.sigma)) {
            errors.push('normal/lognormal requires mu, sigma');
        }
    }
    if (v.distribution === 'uniform') {
        if (
            !Number.isFinite(params?.min) ||
            !Number.isFinite(params?.max) ||
            (params?.max as number) <= (params?.min as number)
        ) {
            errors.push('uniform requires min < max');
        }
    }
    if (v.distribution === 'triangular') {
        const p = (v.params || {}) as { min: number; mode: number; max: number };
        if (!Number.isFinite(p.min) || !Number.isFinite(p.mode) || !Number.isFinite(p.max)) {
            errors.push('triangular requires min, mode, max');
        } else if (!(p.min <= p.mode && p.mode <= p.max && p.min < p.max)) {
            errors.push('triangular requires min ≤ mode ≤ max, min < max');
        }
    }
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// inputs_hash SHA-256 §Critério 3
// ──────────────────────────────────────────────────────────────────────

export function computeInputsHash(inputsSnapshot: Record<string, unknown>): string {
    if (!inputsSnapshot || typeof inputsSnapshot !== 'object') return '';
    // Serializa ordenado para determinismo
    const sorted = JSON.stringify(inputsSnapshot, Object.keys(inputsSnapshot).sort());
    const hash = crypto.createHash('sha256').update(sorted).digest('hex');
    return `sha256:${hash}`;
}

// ──────────────────────────────────────────────────────────────────────
// Quantile IC 95%
// ──────────────────────────────────────────────────────────────────────

export function computeStats(samples: Array<number>): {
    mean: number;
    sd: number;
    ic95: [number, number];
    p50: number;
    p95: number;
} {
    if (!Array.isArray(samples) || samples.length === 0) {
        return { mean: 0, sd: 0, ic95: [0, 0], p50: 0, p95: 0 };
    }
    const sorted = [...samples].filter(Number.isFinite).sort((a, b) => a - b);
    const n = sorted.length;
    if (n === 0) return { mean: 0, sd: 0, ic95: [0, 0], p50: 0, p95: 0 };
    const mean = sorted.reduce((s, v) => s + v, 0) / n;
    const variance = n > 1 ? sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
    const sd = Math.sqrt(variance);
    return {
        mean,
        sd,
        ic95: [_percentile(sorted, 2.5), _percentile(sorted, 97.5)],
        p50: _percentile(sorted, 50),
        p95: _percentile(sorted, 95),
    };
}

function _percentile(sortedArr: Array<number>, pct: number): number {
    if (sortedArr.length === 0) return 0;
    if (sortedArr.length === 1) return sortedArr[0] as number;
    const idx = (pct / 100) * (sortedArr.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sortedArr[lo] as number;
    return (sortedArr[lo] as number) + ((sortedArr[hi] as number) - (sortedArr[lo] as number)) * (idx - lo);
}

// ──────────────────────────────────────────────────────────────────────
// Histogram
// ──────────────────────────────────────────────────────────────────────

export function buildHistogram(
    samples: Array<number>,
    bins: number = DEFAULT_HISTOGRAM_BINS,
): { bins: Array<{ min: number; max: number; count: number; density: number }>; total: number } {
    if (!Array.isArray(samples) || samples.length === 0) return { bins: [], total: 0 };
    const valid = samples.filter(Number.isFinite);
    if (valid.length === 0) return { bins: [], total: 0 };
    const n = Math.max(1, Math.floor(Number(bins) || DEFAULT_HISTOGRAM_BINS));
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    if (max === min) {
        return {
            bins: [{ min, max, count: valid.length, density: 1 }],
            total: valid.length,
        };
    }
    const width = (max - min) / n;
    const counts = new Array(n).fill(0);
    for (const v of valid) {
        const idx = Math.min(n - 1, Math.floor((v - min) / width));
        counts[idx]++;
    }
    const total = valid.length;
    const bins_out = counts.map((count, i) => ({
        min: min + i * width,
        max: min + (i + 1) * width,
        count,
        density: count / total,
    }));
    return { bins: bins_out, total };
}

// ──────────────────────────────────────────────────────────────────────
// Action fraction aggregator §Q4
// ──────────────────────────────────────────────────────────────────────

export function computeActionFractions(actionPerIteration: Array<string>): {
    allow: number;
    warn: number;
    block: number;
    total: number;
} {
    const counts: Record<string, number> = { allow: 0, warn: 0, block: 0 };
    if (!Array.isArray(actionPerIteration)) return { ...counts, allow: 0, warn: 0, block: 0, total: 0 };
    for (const a of actionPerIteration) {
        if (ACTION_CATEGORIES.includes(a)) counts[a]!++;
    }
    const total = actionPerIteration.length;
    return {
        allow: total > 0 ? (counts.allow as number) / total : 0,
        warn: total > 0 ? (counts.warn as number) / total : 0,
        block: total > 0 ? (counts.block as number) / total : 0,
        total,
    };
}

/**
 * Decide se policy deve bloquear baseado em fração de blocks.
 */
export function shouldBlockByProbability(
    actionFractions: { block?: number } | null | undefined,
    threshold: number = DEFAULT_MC_CONFIG.DEFAULT_BLOCK_PROB,
): boolean {
    if (!actionFractions) return false;
    return Number(actionFractions.block) > Number(threshold);
}

// ──────────────────────────────────────────────────────────────────────
// Sobol interaction analysis §Q3
// ──────────────────────────────────────────────────────────────────────

/**
 * Detecta variáveis com ST - S1 > threshold → interação não-linear.
 */
export function analyzeSobolInteractions(
    sobol: { s1: Record<string, unknown>; st: Record<string, unknown> },
    threshold: number = SOBOL_INTERACTION_THRESHOLD,
): Array<{ variableId: string; s1: number; st: number; diff: number; interactsNonlinear: boolean }> {
    const out: Array<{ variableId: string; s1: number; st: number; diff: number; interactsNonlinear: boolean }> = [];
    if (!sobol || !sobol.s1 || !sobol.st) return out;
    for (const key of Object.keys(sobol.s1)) {
        const s1 = Number(sobol.s1[key]) || 0;
        const st = Number(sobol.st[key]) || 0;
        const diff = st - s1;
        out.push({
            variableId: key,
            s1,
            st,
            diff,
            interactsNonlinear: diff > Number(threshold),
        });
    }
    return out.sort((a, b) => b.st - a.st); // maior ST primeiro
}

// ──────────────────────────────────────────────────────────────────────
// Evidence payload (JCGM 101:2008 compat)
// ──────────────────────────────────────────────────────────────────────

export function buildEvidencePayload(
    input: {
        seed: number;
        nIter: number;
        method?: string;
        outputs?: unknown;
        sobol?: unknown;
        inputsSnapshot?: unknown;
        elapsedMs?: number;
    },
    nowMs?: Date | number,
): Record<string, unknown> | null {
    if (!input || !Number.isFinite(input.seed) || !Number.isFinite(input.nIter)) return null;
    const ts = nowMs ? new Date(nowMs).toISOString() : new Date().toISOString();
    const evidenceId = `unc-ev-002-${input.seed}-${input.nIter}-${Date.now()}`;
    return {
        evidence_id: evidenceId,
        tier: 2,
        monte_carlo: {
            seed: input.seed,
            n_iter: input.nIter,
            method: input.method || 'LHS',
            outputs: input.outputs || {},
            sobol: input.sobol || { s1: {}, st: {} },
            executed_at: ts,
            elapsed_ms: Number(input.elapsedMs) || 0,
        },
        inputs_snapshot: input.inputsSnapshot || {},
        inputs_hash: computeInputsHash((input.inputsSnapshot || {}) as Record<string, unknown>),
        references: ['JCGM 101:2008', 'NIST TN 1297', 'Saltelli 2010'],
    };
}
