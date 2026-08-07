// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CONSENSUS-MATRIX-001 F4 / RF-8 — Tier accuracy calculator (pure-logic).
//
// Calcula accuracy[tier][field_type] offline a partir do correction log:
//   accuracy = (vezes que tier acertou) / (vezes que tier opinou)
// "Acertou" = valor do tier coincide com humanCorrection (canonical compare).
//
// Pure-logic 100%: sem rede, determinístico. Consome CorrectionLogEntry[].

import type { CorrectionLogEntry } from './_humanCorrectionLogPure';
import type { ConsensusTier } from './_tierWeightsPure';

export interface TierAccuracyStat {
    readonly tier: string;
    readonly fieldType: string;
    readonly hits: number;
    readonly total: number;
    readonly accuracy: number; // 0..1
    readonly confidenceInterval: { readonly low: number; readonly high: number };
}

export interface TierAccuracyTable {
    readonly byTier: Readonly<Record<string, Readonly<Record<string, TierAccuracyStat>>>>;
    readonly totalEntries: number;
    readonly distinctFieldTypes: ReadonlyArray<string>;
    readonly distinctTiers: ReadonlyArray<string>;
}

/**
 * Normaliza valor para comparação canônica (espelha builder/entropy).
 */
function canonKey(v: unknown): string {
    if (v === null || v === undefined) return '__null__';
    if (typeof v === 'string') return v.trim().toLowerCase();
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '__nan__';
    if (typeof v === 'boolean') return v ? '__true__' : '__false__';
    try {
        return JSON.stringify(v);
    } catch {
        return '__opaque__';
    }
}

/**
 * Calcula intervalo de confiança 95% para uma proporção (Wilson score).
 * Mais robusto que Wald approximation para n pequeno.
 */
function wilsonInterval(hits: number, total: number): { low: number; high: number } {
    if (total <= 0) return { low: 0, high: 0 };
    const p = hits / total;
    const z = 1.96; // 95% confidence
    const z2 = z * z;
    const denom = 1 + z2 / total;
    const center = (p + z2 / (2 * total)) / denom;
    const half = (z / denom) * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
    return {
        low: Math.max(0, center - half),
        high: Math.min(1, center + half),
    };
}

interface TierAccuracyAccumulator {
    hits: number;
    total: number;
    tier: string;
    fieldType: string;
}

interface AccuracyAccumulation {
    acc: Map<string, TierAccuracyAccumulator>;
    fieldTypeSet: Set<string>;
    tierSet: Set<string>;
    totalEntries: number;
}

function _isTierOutput(out: unknown): out is Record<string, unknown> {
    return out !== null && typeof out === 'object';
}

function _accumulateAccuracy(entries: unknown[]): AccuracyAccumulation {
    const acc = new Map<string, TierAccuracyAccumulator>();
    const fieldTypeSet = new Set<string>();
    const tierSet = new Set<string>();
    let totalEntries = 0;

    for (const e of entries) {
        if (!e || typeof e !== 'object') continue;
        const en = e as CorrectionLogEntry;
        if (!Array.isArray(en.tierOutputs) || en.tierOutputs.length === 0) continue;
        if (typeof en.fieldType !== 'string') continue;

        totalEntries += 1;
        const humanKey = canonKey(en.humanCorrection);
        const ft = en.fieldType;
        fieldTypeSet.add(ft);

        for (const out of en.tierOutputs) {
            if (!_isTierOutput(out)) continue;
            const tier = String(out.tier || 'unknown');
            tierSet.add(tier);
            const key = `${tier}::${ft}`;
            const entry = acc.get(key) || { hits: 0, total: 0, tier, fieldType: ft };
            entry.total += 1;
            if (canonKey(out.value) === humanKey) entry.hits += 1;
            acc.set(key, entry);
        }
    }

    return { acc, fieldTypeSet, tierSet, totalEntries };
}

function _buildFrozenByTier(
    acc: Map<string, TierAccuracyAccumulator>,
): Readonly<Record<string, Readonly<Record<string, TierAccuracyStat>>>> {
    const byTier: Record<string, Record<string, TierAccuracyStat>> = {};
    for (const { hits, total, tier, fieldType } of acc.values()) {
        const accuracy = total > 0 ? hits / total : 0;
        const ci = wilsonInterval(hits, total);
        const stat: TierAccuracyStat = Object.freeze({
            tier,
            fieldType,
            hits,
            total,
            accuracy,
            confidenceInterval: Object.freeze(ci),
        });
        if (!byTier[tier]) byTier[tier] = {};
        byTier[tier][fieldType] = stat;
    }

    const frozenByTier: Record<string, Readonly<Record<string, TierAccuracyStat>>> = {};
    for (const [tier, fields] of Object.entries(byTier)) {
        frozenByTier[tier] = Object.freeze(fields);
    }
    return Object.freeze(frozenByTier);
}

/**
 * Computa accuracy[tier][fieldType] a partir do log.
 * Defensive: input inválido → tabela vazia bem formada.
 */
export function computeTierAccuracy(entries: unknown): TierAccuracyTable {
    const emptyTable: TierAccuracyTable = Object.freeze({
        byTier: Object.freeze({}),
        totalEntries: 0,
        distinctFieldTypes: Object.freeze([]),
        distinctTiers: Object.freeze([]),
    });
    if (!Array.isArray(entries) || entries.length === 0) return emptyTable;

    const { acc, fieldTypeSet, tierSet, totalEntries } = _accumulateAccuracy(entries);
    const frozenByTier = _buildFrozenByTier(acc);

    return Object.freeze({
        byTier: frozenByTier,
        totalEntries,
        distinctFieldTypes: Object.freeze([...fieldTypeSet].sort()),
        distinctTiers: Object.freeze([...tierSet].sort()),
    });
}

/**
 * Atalho: pega accuracy específico para (tier, fieldType). Retorna null se
 * combinação não tem amostras.
 */
export function getAccuracy(
    table: unknown,
    tier: unknown,
    fieldType: unknown,
): TierAccuracyStat | null {
    if (!table || typeof table !== 'object') return null;
    const t = table as TierAccuracyTable;
    if (typeof tier !== 'string' || typeof fieldType !== 'string') return null;
    const byField = t.byTier?.[tier];
    if (!byField) return null;
    return byField[fieldType] || null;
}

/**
 * Sugere ajustes nos pesos canônicos: tiers com accuracy <0.5 em N amostras
 * deveriam ter peso reduzido; >0.9 com N>=10 → peso aumentado.
 * Retorna lista ordenada por confiança.
 */
export interface TierWeightSuggestion {
    readonly tier: ConsensusTier | string;
    readonly fieldType: string;
    readonly currentAccuracy: number;
    readonly sampleSize: number;
    readonly direction: 'increase' | 'decrease' | 'keep';
    readonly confidence: 'high' | 'medium' | 'low';
}

export function suggestWeightAdjustments(
    table: unknown,
    minSampleSize = 5,
): ReadonlyArray<TierWeightSuggestion> {
    if (!table || typeof table !== 'object') return Object.freeze([]);
    const t = table as TierAccuracyTable;
    const suggestions: TierWeightSuggestion[] = [];

    for (const [tier, byField] of Object.entries(t.byTier || {})) {
        for (const [fieldType, stat] of Object.entries(byField)) {
            if (stat.total < minSampleSize) continue;

            let direction: 'increase' | 'decrease' | 'keep';
            if (stat.accuracy < 0.5) direction = 'decrease';
            else if (stat.accuracy >= 0.9 && stat.total >= 10) direction = 'increase';
            else direction = 'keep';

            let confidence: 'high' | 'medium' | 'low';
            if (stat.total >= 30) confidence = 'high';
            else if (stat.total >= 10) confidence = 'medium';
            else confidence = 'low';

            suggestions.push(
                Object.freeze({
                    tier,
                    fieldType,
                    currentAccuracy: stat.accuracy,
                    sampleSize: stat.total,
                    direction,
                    confidence,
                }),
            );
        }
    }

    // Ordena por confidence + sample size desc
    suggestions.sort((a, b) => {
        const order = { high: 3, medium: 2, low: 1 } as const;
        const diff = order[b.confidence] - order[a.confidence];
        if (diff !== 0) return diff;
        return b.sampleSize - a.sampleSize;
    });

    return Object.freeze(suggestions);
}

export const TIER_ACCURACY_CALCULATOR_META = Object.freeze({
    moduleId: 'consensus-matrix.tier-accuracy-calculator',
    version: 1,
    confidenceLevel: 0.95,
    formula: 'Wilson score 95% CI',
});
