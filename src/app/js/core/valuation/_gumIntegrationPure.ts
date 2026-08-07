// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// SPEC_COST_VALUATION_PROVENANCE_CONSOLIDATION — Fase 3 GUM integration (claude - executor)
// Wrapper que conecta core/valuation a core/uncertainty (JCGM 100:2008 GUM Tier-1).
//
// Substitui eisRangeFromValue (heurística EIS-based) por propagação rigorosa
// quando caller fornece incertezas por record. Mantém eisRange como fallback
// quando incertezas indisponíveis.
//
// Pure-logic — depende apenas de propagateAdditive + expandedUncertainty.

import { propagateAdditive, expandedUncertainty } from '../uncertainty/propagation.js';
import type { ValuationResult, TuplaRef } from './_types.js';
import { eisRangeFromValue } from './_eisBindingPure.js';

/**
 * Incerteza por record TUPLAx (caller resolve via core/uncertainty/primitive).
 *   uAbs: incerteza padrão absoluta (1σ)
 *   c:    coeficiente de sensibilidade (∂y/∂x_i) — default 1.0
 */
export interface RecordUncertainty {
    recordId: string;
    uAbs: number;
    c?: number;
}

/**
 * Computa faixa GUM expandida (k=2, 95% confiança) para um ValuationResult
 * baseado em incertezas dos records de proveniência.
 *
 * Algoritmo (JCGM 100:2008 §5.1.2):
 *   1. Filtra lookups com match nos refs de provenance
 *   2. propagateAdditive → u_c (incerteza combinada padrão)
 *   3. expandedUncertainty(u_c, k=2) → U (intervalo 95%)
 *   4. Retorna { min: value - U, expected: value, max: value + U }
 *
 * Fallback: se nenhum lookup tem match OU value não-finito → eisRangeFromValue
 * (heurística EIS-based, retorna faixa simplificada).
 */
export function computeGumRange(
    value: number,
    provenance: ReadonlyArray<TuplaRef>,
    uncertainties: ReadonlyArray<RecordUncertainty>,
    fallbackEis: number | null | undefined = null,
): { min: number; expected: number; max: number; method: 'gum' | 'eis-fallback' | 'zero' } {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { min: 0, expected: 0, max: 0, method: 'zero' };
    }
    if (!Array.isArray(provenance) || !Array.isArray(uncertainties)) {
        const range = eisRangeFromValue(value, fallbackEis);
        return { ...range, method: 'eis-fallback' };
    }

    const lookupMap = new Map<string, RecordUncertainty>();
    for (const u of uncertainties) {
        if (!u || typeof u.recordId !== 'string') continue;
        if (typeof u.uAbs !== 'number' || !Number.isFinite(u.uAbs) || u.uAbs < 0) continue;
        lookupMap.set(u.recordId, u);
    }

    const terms: { uAbs: number; c: number }[] = [];
    for (const ref of provenance) {
        if (!ref || typeof ref.recordId !== 'string') continue;
        const u = lookupMap.get(ref.recordId);
        if (u) {
            const c = typeof u.c === 'number' && Number.isFinite(u.c) ? u.c : 1.0;
            terms.push({ uAbs: u.uAbs, c });
        }
    }

    if (terms.length === 0) {
        const range = eisRangeFromValue(value, fallbackEis);
        return { ...range, method: 'eis-fallback' };
    }

    const uc = propagateAdditive(terms);
    if (uc === null || !Number.isFinite(uc)) {
        const range = eisRangeFromValue(value, fallbackEis);
        return { ...range, method: 'eis-fallback' };
    }

    const U = expandedUncertainty(uc, 2);
    if (U === null || !Number.isFinite(U)) {
        const range = eisRangeFromValue(value, fallbackEis);
        return { ...range, method: 'eis-fallback' };
    }

    return {
        min: Math.max(0, value - U),
        expected: value,
        max: value + U,
        method: 'gum',
    };
}

/**
 * Anexa uncertainty range computada via GUM a um ValuationResult.
 * Non-destrutivo (preserva todos campos originais + atualiza uncertainty).
 */
export function attachGumUncertainty(
    result: ValuationResult<number>,
    uncertainties: ReadonlyArray<RecordUncertainty>,
    opts: { fallbackEis?: number | null } = {},
): ValuationResult<number> {
    const range = computeGumRange(
        result.value,
        result.provenance,
        uncertainties,
        opts.fallbackEis ?? result.integrity?.eis ?? null,
    );
    return {
        ...result,
        uncertainty: { min: range.min, expected: range.expected, max: range.max },
    };
}

/**
 * Metadata p/ introspecção.
 */
export const GUM_INTEGRATION_META = Object.freeze({
    spec: 'COST_VALUATION_PROVENANCE_CONSOLIDATION',
    phase: 'F3-gum-integration',
    delivered_at: '2026-06-02',
    coverage_factor_k: 2,
    confidence_pct: 95,
    standard: 'JCGM 100:2008 (GUM)',
});
