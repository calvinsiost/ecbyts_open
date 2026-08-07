// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   UNC-001 Phase-3 — Matrix-Aware Monte-Carlo Promotion

   EN: Pure decision function. Implements ADR A3's deferred "P3"
   auto-promote triggers, made matrix-aware via matrix.js (ADR A5).
   It does NOT run Monte Carlo and does NOT alter propagate().
   It only answers: "is Tier 1 GUM trustworthy here, or should the
   user be promoted to Tier 2 Monte Carlo?".

   PT (leigos): decide se a conta linear simples (GUM Tier 1) é
   confiável para este caso, ou se o resultado precisa de uma
   simulação Monte Carlo. Não roda a simulação — só recomenda.

   Provenance: JCGM 100:2008 (GUM) §5.1.2 — linearisation validity;
   JCGM 101:2008 (GUM Supplement 1) §5.10/§8 — validate the linear
   approximation, esp. near a decision boundary; IPCC 2006 Vol1 Ch3
   §3.2.2.4 — Tier 2 only when chain non-linear / inputs non-normal.
   ================================================================ */

import { isUValue, toRelative } from './primitive.js';
import { getMatrixPolicy } from './matrix.js';

/**
 * Non-linear post-processing operations. Presence of any of these in the
 * propagation chain breaks the first-order Taylor assumption of GUM Tier 1
 * (JCGM 100:2008 §5.1.2), so Tier 2 Monte Carlo is warranted.
 */
export const MC_NONLINEAR_OPS: ReadonlyArray<string> = Object.freeze([
    'power',
    'pow',
    'log',
    'ln',
    'sqrt',
    'exp',
]);

interface McPromotionResult {
    /** true if Tier 2 MC is recommended */
    promote: boolean;
    trigger: 'none' | 'nonlinear_chain' | 'high_u_rel' | 'near_threshold';
    /** short machine reason key */
    reason: string;
    thresholds: { mcURelPromote: number; mcNearThresholdBandU: number };
}

/**
 * EN: Returns true if the chain contains a non-linear step.
 * PT: detecta se a cadeia tem passo não-linear (raiz, log, potência...).
 * @param chain - array of step names/objects, or single name
 */
function hasNonLinearStep(chain: unknown): boolean {
    const steps: unknown[] = Array.isArray(chain) ? chain : chain == null ? [] : [chain];
    for (const step of steps) {
        const name = String(
            (step && typeof step === 'object' && 'op' in step ? (step as any).op : step) || '',
        )
            .trim()
            .toLowerCase();
        if (MC_NONLINEAR_OPS.includes(name)) return true;
    }
    return false;
}

/**
 * EN: Largest relative uncertainty (%) across declared inputs.
 * PT: maior incerteza relativa (%) entre as entradas com incerteza.
 * @param inputs
 * @returns max u_rel in %, or 0 when none declared
 */
function maxInputURel(inputs: unknown): number {
    const rows = (Array.isArray(inputs) ? inputs : []).filter(isUValue);
    let max = 0;
    for (const r of rows) {
        const rel = toRelative(r);
        if (typeof rel === 'number' && Number.isFinite(rel) && rel > max) max = rel;
    }
    return max;
}

/**
 * EN: Distance to the regulatory threshold expressed in combined std
 * uncertainties. When the verdict (value vs threshold) is within the
 * matrix band of `u`, the linear approximation must be validated by MC
 * (JCGM 101:2008 §5.10). Returns Infinity when not applicable.
 * PT: a que distância (em "u") o resultado está do limite legal. Perto
 * do limite, a conta linear pode dar o veredito errado.
 * @param ctx
 * @returns distance in units of u, or Infinity
 */
function distanceToThresholdInU(ctx: { value?: number; u?: number | null; threshold?: number | null }): number {
    if (!ctx || typeof ctx !== 'object') return Infinity;
    const value = Number(ctx.value);
    const u = Number(ctx.u);
    const threshold = ctx.threshold == null ? NaN : Number(ctx.threshold);
    if (!Number.isFinite(value) || !Number.isFinite(threshold)) return Infinity;
    if (!Number.isFinite(u) || u <= 0) return Infinity;
    return Math.abs(value - threshold) / u;
}

/**
 * EN: Matrix-aware Monte-Carlo promotion decision (ADR A3 + A8).
 * Pure, synchronous, never throws on malformed input.
 *
 * @param chain - propagation post-processing chain (ops)
 * @param inputs - UValue[] feeding the propagation
 * @param matrix - environmental matrix (groundwater/soil/...)
 * @param complianceCtx
 */
export function evaluateMcPromotion(
    chain: unknown,
    inputs: unknown,
    matrix?: unknown,
    complianceCtx?: { value?: number; u?: number | null; threshold?: number | null },
): McPromotionResult {
    const policy = getMatrixPolicy(matrix) as any;
    const thresholds = {
        mcURelPromote: policy.mcURelPromote,
        mcNearThresholdBandU: policy.mcNearThresholdBandU,
    };

    // Trigger (a) — non-linear chain breaks GUM linearisation.
    if (hasNonLinearStep(chain)) {
        return { promote: true, trigger: 'nonlinear_chain', reason: 'nonlinear_chain', thresholds };
    }

    // Trigger (b) — an input's relative uncertainty exceeds the matrix cap.
    const maxURel = maxInputURel(inputs);
    if (maxURel > policy.mcURelPromote) {
        return { promote: true, trigger: 'high_u_rel', reason: 'high_u_rel', thresholds };
    }

    // Trigger (c) — compliance verdict sits near the regulatory threshold.
    const dist = distanceToThresholdInU((complianceCtx as any) || {});
    if (dist < policy.mcNearThresholdBandU) {
        return { promote: true, trigger: 'near_threshold', reason: 'near_threshold', thresholds };
    }

    return { promote: false, trigger: 'none', reason: 'tier1_adequate', thresholds };
}
