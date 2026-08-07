// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CONSENSUS-MATRIX-001 F1 / RF-1+RF-2 — Consensus matrix builder (pure-logic).
//
// Toma outputs por tier para cada campo e produz um ConsensusVerdict canônico
// em uma das 7 categorias: unanimous, majority, split, low-confidence,
// single-source, disagree-3way, empty.
//
// Pure-logic 100%: sem DOM, sem rede, sem random, sem clock. Determinístico.

import { disagreementEntropy } from './_disagreementEntropyPure.js';
import { getTierWeight } from './_tierWeightsPure.js';
import type { ConsensusTier } from './_tierWeightsPure';

export interface TierOutput {
    readonly tier: ConsensusTier;
    readonly value: unknown;
    readonly confidence: number;
    readonly sourceToken: string;
}

export type ConsensusCategory =
    | 'unanimous'
    | 'majority'
    | 'split'
    | 'low-confidence'
    | 'single-source'
    | 'disagree-3way'
    | 'empty';

export interface ConsensusVerdict {
    readonly fieldId: string;
    readonly chosenValue: unknown;
    readonly category: ConsensusCategory;
    readonly weightedConfidence: number;
    readonly disagreementEntropy: number;
    readonly requiresHumanReview: boolean;
    readonly evidenceTrail: ReadonlyArray<TierOutput>;
}

export interface ConsensusSummary {
    readonly unanimousCount: number;
    readonly majorityCount: number;
    readonly criticalCount: number;
    readonly assertiveness: number;
}

export interface ConsensusMatrixResult {
    readonly verdicts: ReadonlyArray<ConsensusVerdict>;
    readonly summary: ConsensusSummary;
}

const LOW_CONF_THRESHOLD = 0.5;
const UNANIMOUS_CONF_THRESHOLD = 0.8;
const HUMAN_REVIEW_CATEGORIES: ReadonlySet<ConsensusCategory> = new Set([
    'split',
    'low-confidence',
    'disagree-3way',
]);

/**
 * Normaliza valor para comparação. Strings: trim + lowercase.
 * Numbers: representação canônica. null/undefined: sentinel.
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
 * Valida que um item é TierOutput-shape válido. Defensive.
 */
function isValidOutput(o: unknown): o is TierOutput {
    if (!o || typeof o !== 'object') return false;
    const r = o as Partial<TierOutput>;
    if (typeof r.tier !== 'string') return false;
    if (typeof r.confidence !== 'number' || !Number.isFinite(r.confidence)) return false;
    if (typeof r.sourceToken !== 'string') return false;
    return true;
}

/**
 * Filtra outputs inválidos e clamp confidence em [0,1].
 */
function sanitize(outputs: ReadonlyArray<unknown>): ReadonlyArray<TierOutput> {
    const out: TierOutput[] = [];
    for (const o of outputs) {
        if (!isValidOutput(o)) continue;
        out.push(
            Object.freeze({
                tier: o.tier,
                value: o.value,
                confidence: Math.min(1, Math.max(0, o.confidence)),
                sourceToken: o.sourceToken,
            }),
        );
    }
    return Object.freeze(out);
}

/**
 * Classifica os outputs sanitizados em uma das 7 categorias.
 * Retorna a categoria + chosenValue + weightedConfidence.
 */
function classify(
    outputs: ReadonlyArray<TierOutput>,
    fieldType: string,
): {
    category: ConsensusCategory;
    chosenValue: unknown;
    weightedConfidence: number;
} {
    if (outputs.length === 0) {
        return { category: 'empty', chosenValue: null, weightedConfidence: 0 };
    }
    if (outputs.length === 1) {
        const only = outputs[0]!; // length === 1 garante presença
        return {
            category: 'single-source',
            chosenValue: only.value,
            weightedConfidence: only.confidence,
        };
    }

    // Agrupa por valor canônico, somando confidence × tierWeight como peso.
    const buckets = new Map<string, { value: unknown; weight: number; conf: number; count: number }>();
    let totalWeight = 0;

    for (const o of outputs) {
        const key = canonKey(o.value);
        const tw = getTierWeight(o.tier, fieldType);
        const w = o.confidence * tw;
        const b = buckets.get(key);
        if (b) {
            b.weight += w;
            b.conf += o.confidence;
            b.count += 1;
        } else {
            buckets.set(key, { value: o.value, weight: w, conf: o.confidence, count: 1 });
        }
        totalWeight += w;
    }

    // Sorted desc por peso (estável por insertion order quando empate).
    const sorted = Array.from(buckets.values()).sort((a, b) => b.weight - a.weight);
    const top = sorted[0]!; // outputs.length >= 2 → buckets tem >=1 entry
    const meanConf =
        outputs.reduce((s, o) => s + o.confidence, 0) / Math.max(1, outputs.length);

    // Caso unanimous: 1 só bucket distinto.
    if (sorted.length === 1) {
        if (meanConf < LOW_CONF_THRESHOLD) {
            return { category: 'low-confidence', chosenValue: top.value, weightedConfidence: meanConf };
        }
        if (meanConf < UNANIMOUS_CONF_THRESHOLD) {
            return { category: 'majority', chosenValue: top.value, weightedConfidence: meanConf };
        }
        return { category: 'unanimous', chosenValue: top.value, weightedConfidence: meanConf };
    }

    // Multi-valor: split (2 valores, ~empate) vs 3way vs majority.
    if (sorted.length >= 3) {
        return { category: 'disagree-3way', chosenValue: top.value, weightedConfidence: meanConf };
    }

    // 2 buckets distintos (sorted.length === 2 após o early-return de >=3).
    // eslint-disable-next-line
    const secondWeight = sorted[1]!.weight;
    const ratio = totalWeight > 0 ? top.weight / totalWeight : 1;

    // Split: empate técnico (top ≤ 60%) OU exatamente 1×1 com pesos similares.
    if (ratio <= 0.6) {
        return { category: 'split', chosenValue: top.value, weightedConfidence: meanConf };
    }

    // Majority com baixa confiança média → degrade.
    if (meanConf < LOW_CONF_THRESHOLD) {
        return { category: 'low-confidence', chosenValue: top.value, weightedConfidence: meanConf };
    }

    return { category: 'majority', chosenValue: top.value, weightedConfidence: meanConf };
}

/**
 * Constrói matriz de consenso a partir do mapa de outputs por campo.
 * Defensive: input inválido → resultado vazio bem formado.
 */
export function buildConsensusMatrix(
    fieldOutputs: unknown,
    fieldTypes?: Readonly<Record<string, string>>,
): ConsensusMatrixResult {
    const emptyResult: ConsensusMatrixResult = Object.freeze({
        verdicts: Object.freeze([] as ReadonlyArray<ConsensusVerdict>),
        summary: Object.freeze({
            unanimousCount: 0,
            majorityCount: 0,
            criticalCount: 0,
            assertiveness: 1,
        }),
    });

    if (!fieldOutputs || typeof fieldOutputs !== 'object' || Array.isArray(fieldOutputs)) {
        return emptyResult;
    }

    const verdicts: ConsensusVerdict[] = [];
    let unanimousCount = 0;
    let majorityCount = 0;
    let criticalCount = 0;

    for (const fieldId of Object.keys(fieldOutputs as Record<string, unknown>)) {
        const raw = (fieldOutputs as Record<string, unknown>)[fieldId];
        if (!Array.isArray(raw)) continue;
        const ftype = fieldTypes?.[fieldId] || 'unknown';
        const outputs = sanitize(raw);
        const { category, chosenValue, weightedConfidence } = classify(outputs, ftype);
        const entropy = disagreementEntropy(outputs as unknown);
        const requiresHumanReview = HUMAN_REVIEW_CATEGORIES.has(category);

        verdicts.push(
            Object.freeze({
                fieldId,
                chosenValue,
                category,
                weightedConfidence,
                disagreementEntropy: entropy,
                requiresHumanReview,
                evidenceTrail: outputs,
            }),
        );

        if (category === 'unanimous') unanimousCount += 1;
        else if (category === 'majority') majorityCount += 1;
        if (requiresHumanReview) criticalCount += 1;
    }

    const total = verdicts.length;
    const assertiveness =
        total > 0 ? Math.min(1, Math.max(0, (unanimousCount + majorityCount * 0.5) / total)) : 1;

    return Object.freeze({
        verdicts: Object.freeze(verdicts),
        summary: Object.freeze({
            unanimousCount,
            majorityCount,
            criticalCount,
            assertiveness,
        }),
    });
}

export const CONSENSUS_MATRIX_BUILDER_META = Object.freeze({
    moduleId: 'consensus-matrix.builder',
    version: 1,
    categoriesCount: 7,
    lowConfThreshold: LOW_CONF_THRESHOLD,
    unanimousConfThreshold: UNANIMOUS_CONF_THRESHOLD,
});
