// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// SPEC_COST_VALUATION_PROVENANCE_CONSOLIDATION — Fase 3 RF5 (claude - executor)
// Binding EIS — anexa contexto de integridade aos resultados de valoração.
//
// Plano §4.1: "todo número econômico é auditável até o registro granular".
// EIS context permite quantificar: valor de baixa integridade = maior
// incerteza econômica (incerteza ↑ → faixa de provisão IAS 37 ↑).
//
// Pure-logic — caller fornece eisScore por record (lookup feito fora).

import type { ValuationResult, TuplaRef } from './_types.js';

/**
 * Registro EIS por TUPLAx — caller resolve via core/eis/eisCalculator.
 */
export interface RecordEisLookup {
    recordId: string;
    eisScore: number; // 0..5
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isValidLookup(l: unknown): l is RecordEisLookup {
    if (!l || typeof (l as RecordEisLookup).recordId !== 'string') return false;
    const score = (l as RecordEisLookup).eisScore;
    return isFiniteNumber(score) && score >= 0 && score <= 5;
}

function buildEisLookupMap(lookups: ReadonlyArray<RecordEisLookup>): Map<string, number> {
    const map = new Map<string, number>();
    for (const l of lookups) {
        if (isValidLookup(l)) {
            map.set(l.recordId, l.eisScore);
        }
    }
    return map;
}

function collectMatchedScores(
    provenance: ReadonlyArray<TuplaRef>,
    lookupMap: ReadonlyMap<string, number>,
): number[] {
    const scores: number[] = [];
    for (const ref of provenance) {
        if (!ref || typeof ref.recordId !== 'string') continue;
        const score = lookupMap.get(ref.recordId);
        if (typeof score === 'number') scores.push(score);
    }
    return scores;
}

function geometricMean(values: ReadonlyArray<number>): number {
    const epsilon = 1e-6;
    let sumLog = 0;
    for (const s of values) {
        sumLog += Math.log(Math.max(s, epsilon));
    }
    return Math.exp(sumLog / values.length);
}

/**
 * Computa EIS agregado de uma valoração baseado em seus records de proveniência.
 *
 * Estratégia: média geométrica (compatível com EIS motor TCCCA+T não-compensatório).
 * Records sem lookup correspondente são ignorados (resilient — caller pode
 * fornecer subset).
 *
 * Retorna `null` quando nenhum record tem EIS lookup válido.
 */
export function computeAggregateEis(
    provenance: ReadonlyArray<TuplaRef>,
    lookups: ReadonlyArray<RecordEisLookup>,
): number | null {
    if (!Array.isArray(provenance) || provenance.length === 0) return null;
    if (!Array.isArray(lookups) || lookups.length === 0) return null;

    const lookupMap = buildEisLookupMap(lookups);
    const matchedScores = collectMatchedScores(provenance, lookupMap);
    if (matchedScores.length === 0) return null;

    const geomMean = geometricMean(matchedScores);
    // Clamp [0, 5] por segurança (epsilon perturbation)
    return Math.max(0, Math.min(5, geomMean));
}

/**
 * Anexa contexto EIS a um ValuationResult existente (não-destrutivo).
 * Caller fornece lookups (mapeamento recordId → eisScore).
 *
 * Se lookups ausentes ou nenhum match → retorna result inalterado.
 */
export function attachIntegrityContext<T>(
    result: ValuationResult<T>,
    lookups: ReadonlyArray<RecordEisLookup>,
): ValuationResult<T> {
    const eis = computeAggregateEis(result.provenance, lookups);
    if (eis === null) return result;
    return {
        ...result,
        integrity: { eis },
    };
}

/**
 * Veredito qualitativo do EIS aggregate (alinha com eisCalculator).
 *   >= 4.50 → 'green'  (alta integridade — valor defensável)
 *   >= 3.50 → 'yellow' (média integridade — flag em relatório)
 *   <  3.50 → 'red'    (baixa — exige revisão de records ou maior provisão)
 */
export function classifyEisVerdict(eis: number | null | undefined): 'green' | 'yellow' | 'red' | 'unknown' {
    if (typeof eis !== 'number' || !Number.isFinite(eis)) return 'unknown';
    if (eis >= 4.5) return 'green';
    if (eis >= 3.5) return 'yellow';
    return 'red';
}

/**
 * Aplica multiplicador de incerteza ao value baseado no EIS verdict.
 * EIS verde → 1.0 (sem amplificação)
 * EIS amarelo → 1.10 (10% mais conservador)
 * EIS vermelho → 1.25 (25% mais conservador — boa prática IAS 37 §39)
 *
 * Útil para faixa min-max em ValuationResult.uncertainty.
 */
export function eisUncertaintyMultiplier(eis: number | null | undefined): number {
    const verdict = classifyEisVerdict(eis);
    switch (verdict) {
        case 'green':
            return 1.0;
        case 'yellow':
            return 1.1;
        case 'red':
            return 1.25;
        default:
            return 1.0;
    }
}

/**
 * Computa faixa GUM Tier-1 simplificada baseada em EIS verdict.
 * Retorna { min, expected, max } com expected = value e min/max derivados
 * do multiplier.
 *
 * Esta é a Fase 3 mínima de GUM — propagação completa fica para integração
 * com core/uncertainty quando consumidores legacy migrarem.
 */
export function eisRangeFromValue(
    value: number,
    eis: number | null | undefined,
): { min: number; expected: number; max: number } {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { min: 0, expected: 0, max: 0 };
    }
    const mult = eisUncertaintyMultiplier(eis);
    const halfSpread = value * (mult - 1) * 0.5;
    return {
        min: Math.max(0, value - halfSpread),
        expected: value,
        max: value + halfSpread,
    };
}
