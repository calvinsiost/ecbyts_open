// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CONSENSUS-MATRIX-001 F1 / RF-3 — Shannon entropy of disagreement (pure-logic).
//
// Dado um array de TierOutput[], calcula H = -Σ p_i * log2(p_i),
// onde p_i = peso_relativo do valor i na distribuição.
//
// Saída ∈ [0, log2(N_valores_distintos)].
//   - 0  = consenso total (todos mesmo valor)
//   - alta = forte disagreement (cada tier um valor diferente)
//
// Pure-logic: sem rede, sem clock, determinístico.

export interface EntropyTierOutput {
    readonly tier: string;
    readonly value: unknown;
    readonly confidence?: number;
}

/**
 * Normaliza um valor para comparação (string trimada lowercase, ou
 * representação canônica para tipos primitivos).
 * `null`/`undefined` viram a string vazia sentinel '__null__'.
 */
function canonKey(v: unknown): string {
    if (v === null || v === undefined) return '__null__';
    if (typeof v === 'number') {
        if (!Number.isFinite(v)) return '__nan__';
        return String(v);
    }
    if (typeof v === 'boolean') return v ? '__true__' : '__false__';
    if (typeof v === 'string') return v.trim().toLowerCase();
    try {
        return JSON.stringify(v);
    } catch {
        return '__opaque__';
    }
}

/**
 * Calcula a entropia de Shannon da distribuição de valores.
 * Outputs vazios → 0 (sem disagreement quando ninguém respondeu).
 * Outputs com 1 valor único → 0.
 * Defensive: array inválido → 0.
 */
export function disagreementEntropy(outputs: unknown): number {
    if (!Array.isArray(outputs) || outputs.length === 0) return 0;

    // Conta frequência de cada valor canônico ponderada por confidence (default 1.0).
    const freq = new Map<string, number>();
    let totalWeight = 0;

    for (const o of outputs) {
        if (!o || typeof o !== 'object') continue;
        const rec = o as EntropyTierOutput;
        const key = canonKey(rec.value);
        const w =
            typeof rec.confidence === 'number' && Number.isFinite(rec.confidence) && rec.confidence > 0
                ? Math.min(1, Math.max(0, rec.confidence))
                : 1.0;
        freq.set(key, (freq.get(key) || 0) + w);
        totalWeight += w;
    }

    if (totalWeight === 0 || freq.size <= 1) return 0;

    let h = 0;
    for (const w of freq.values()) {
        const p = w / totalWeight;
        if (p > 0) h -= p * Math.log2(p);
    }
    return h;
}

/**
 * Entropia máxima possível para N outputs distintos (todos com peso igual).
 * Útil como teto teórico para normalização: H / Hmax ∈ [0, 1].
 */
export function maxEntropy(outputs: unknown): number {
    if (!Array.isArray(outputs) || outputs.length <= 1) return 0;
    return Math.log2(outputs.length);
}

/**
 * Entropia normalizada ∈ [0, 1].
 *   0  = consenso total
 *   1  = disagreement máximo (cada tier um valor distinto, mesmo peso)
 */
export function normalizedDisagreement(outputs: unknown): number {
    const h = disagreementEntropy(outputs);
    const hmax = maxEntropy(outputs);
    if (hmax <= 0) return 0;
    return Math.min(1, Math.max(0, h / hmax));
}

export const DISAGREEMENT_ENTROPY_META = Object.freeze({
    moduleId: 'consensus-matrix.disagreement-entropy',
    version: 1,
    formula: 'H = -Σ p_i * log2(p_i)',
});
