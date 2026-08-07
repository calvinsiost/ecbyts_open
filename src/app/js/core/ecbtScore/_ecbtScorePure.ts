// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import type { EcbtFinancialScopeTag } from './_financialScopePure.js';
import { computeFineImpact as computeFineImpactLocal } from './_fineImpactPure.js';

/**
 * ECBT Score — pure logic.
 *
 * Computes the monetary net liability/asset balance with a confidence band,
 * and (optionally) the mode-selected normalised percentage:
 *
 *   V_net   = Σ assets − Σ liabilities                          (currency)
 *   band    = U_total × (1 + 2·(1 − κ))                         (GUM tier 1 × κ widener)
 *   pct     = V_net / denominator × 100                         (no clamp)
 *
 * Refs (SPEC_ECBT_SCORE_MONETARY_EIS §2 M3, M5, M6, M8):
 *  - GUM JCGM 100:2008 — root-sum-square uncertainty propagation
 *  - SEEA EA 2021 (UN) — dual reporting (physical EIS + monetary balance)
 *  - ASTM E2137 — monetary estimate of environmental liabilities (range)
 *  - Trucost / PwC — natural capital intensity (Mode F)
 *  - OECD CBA 2018 + SROI (Nicholls 2012) — return on cost (Mode R, BCR−1)
 *
 * Anti-requirements honoured:
 *  - N2: integrity is NOT a parcel in the monetary sum → it widens the band via κ
 *  - N3: V_net (absolute, currency) is always preserved; pct is only one *view*
 *  - N7: caller declares mode + denominator; we never fabricate a market value
 *  - No clamp on pct: an order-of-magnitude passivo (e.g. ±250%) is critical info
 */

export type Currency = 'USD' | 'BRL' | 'BTC' | string;

export type Mode =
    | 'marketIntensity'   // F: denom = market cap/EV/equity (natural capital intensity)
    | 'returnOnCost'      // R: denom = remediation/restoration cost → BCR−1 / SROI
    | 'extension'         // I: denom = area (ha) or population (per-capita)
    | 'absolute';         // no normalisation; V_net only

export interface FinancialEntry {
    readonly value: number;
    readonly currency: Currency;
    /** Fractional 1-sigma uncertainty (e.g. 0.1 → ±10 %); defaults to 0 if absent. */
    readonly uncertaintyFraction?: number;
    /** Free-form label for provenance / UI (e.g. 'remediation_capex'). */
    readonly label?: string;
    /** Sustainability scope used to keep generic operations out of the ECBT Score. */
    readonly ecbtScope?: EcbtFinancialScopeTag;
}

export interface Denominator {
    readonly kind: string;
    readonly value: number;
    /** ISO timestamp when the denominator was sampled (recommended for market cap). */
    readonly timestamp?: string;
}

export interface EcbtScoreInput {
    readonly assets: ReadonlyArray<FinancialEntry>;
    readonly liabilities: ReadonlyArray<FinancialEntry>;
    /** Confidence from EIS (3CTA+ → integrity/5). Clamped to [0,1]. */
    readonly kappa: number;
    readonly mode: Mode;
    /** Required for mode != 'absolute'. */
    readonly denominator?: Denominator;
    /** Output currency; mixed inputs trigger 'mixed' fallback (see options). */
    readonly currency?: Currency;
    // FIS-001 Calvin 2026-06-08 Fase 2 — multas e infrações administrativas
    /** Multas/infrações administrativas (FIS). Opcional. */
    readonly fines?: ReadonlyArray<import('./_fineImpactPure.js').FineRecord>;
    /** EBITDA em BRL para cálculo de capacidade econômica (FIS). */
    readonly ebitdaBrl?: number;
    /** Receita anual em BRL — fallback se EBITDA ausente. */
    readonly revenueBrl?: number;
    /** Janela de recorrência em anos (FIS). Default 5. */
    readonly windowYears?: number;
    /** Saliency setorial [1.0, 1.5] (FIS). Default 1.0. */
    readonly sectorWeight?: number;
    /** Data de referência ISO p/ janela de recorrência (FIS). Injectável. */
    readonly nowIso?: string;
}

export interface EcbtScoreVM {
    readonly amount: number;
    readonly currency: Currency;
    readonly sign: 'deficit' | 'surplus' | 'zero';
    readonly low: number;
    readonly high: number;
    readonly kappa: number;
    readonly mode: Mode;
    readonly pct: number | null;
    readonly pctLow: number | null;
    readonly pctHigh: number | null;
    readonly denominatorKind: string | null;
    readonly denominator: number | null;
    /** True iff any input had mixed currencies and we fell back. */
    readonly mixedCurrencyFallback: boolean;
    // FIS-001 Fase 2 — opcional, presente apenas quando input.fines fornecido
    /** FineImpactScore (FIS-001) — ∈ [0, 5]. 5 = sem multas relevantes. null se ausente. */
    readonly fineImpactScore?: number | null;
    /** Audit completo do FIS — null se ausente. */
    readonly fineImpactAudit?: import('./_fineImpactPure.js').FineImpactOutput | null;
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

function safeNum(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Sum of values + root-sum-square uncertainty (GUM tier 1).
 * Returns absolute uncertainty in same units as values.
 */
function sumWithUncertainty(
    entries: ReadonlyArray<FinancialEntry>,
): { sum: number; uAbs: number } {
    let sum = 0;
    let varianceSum = 0;
    for (const e of entries) {
        const v = safeNum(e?.value);
        const uFrac = clamp01(safeNum(e?.uncertaintyFraction));
        sum += v;
        const uAbs = Math.abs(v) * uFrac;
        varianceSum += uAbs * uAbs;
    }
    return { sum, uAbs: Math.sqrt(varianceSum) };
}

function pickCurrency(
    input: EcbtScoreInput,
): { currency: Currency; mixedFallback: boolean } {
    if (input.currency) return { currency: input.currency, mixedFallback: false };
    const set = new Set<string>();
    for (const e of [...input.assets, ...input.liabilities]) {
        if (e?.currency) set.add(e.currency);
    }
    if (set.size === 0) {
        return { currency: 'USD', mixedFallback: false };
    }
    if (set.size === 1) {
        return { currency: [...set][0] as Currency, mixedFallback: false };
    }
    return { currency: 'mixed', mixedFallback: true };
}

function signOf(amount: number): 'deficit' | 'surplus' | 'zero' {
    if (amount > 0) return 'surplus';
    if (amount < 0) return 'deficit';
    return 'zero';
}

/**
 * κ → band-widening factor.
 *
 * The user-facing band reported (`low`, `high`) is the GUM root-sum-square
 * uncertainty multiplied by this factor:
 *
 *   factor = 1 + 2·(1 − κ)        ⇒  κ=1 ⇒ ×1,  κ=0.5 ⇒ ×2,  κ=0 ⇒ ×3
 *
 * This is intentionally a *band widener*, not a parcel inside the sum
 * (anti-N2). κ never moves `amount`; it only widens what surrounds it.
 */
export function bandWidenerFromKappa(kappa: number): number {
    return 1 + 2 * (1 - clamp01(kappa));
}

/**
 * Build `{ pct, pctLow, pctHigh }` from `V_net` and a denominator.
 *
 *   pct     = (V_net / denominator) × 100             (no clamp)
 *   pctLow  = (low  / denominator) × 100
 *   pctHigh = (high / denominator) × 100
 *
 * Returns nulls if mode is 'absolute' or denominator is missing/zero —
 * we never fabricate a value (anti-N8).
 */
export function computePercentages(
    amount: number,
    low: number,
    high: number,
    mode: Mode,
    denominator?: Denominator,
): { pct: number | null; pctLow: number | null; pctHigh: number | null } {
    if (mode === 'absolute') {
        return { pct: null, pctLow: null, pctHigh: null };
    }
    if (!denominator || !Number.isFinite(denominator.value) || denominator.value === 0) {
        return { pct: null, pctLow: null, pctHigh: null };
    }
    const d = denominator.value;
    return {
        pct: (amount / d) * 100,
        pctLow: (low / d) * 100,
        pctHigh: (high / d) * 100,
    };
}

/**
 * Compute the ECBT Score VM from EIS confidence κ and granular financial entries.
 *
 * Idempotent and side-effect-free; returns a frozen object.
 */
export function computeEcbtScore(input: EcbtScoreInput): EcbtScoreVM {
    if (!input || typeof input !== 'object') {
        throw new TypeError('computeEcbtScore: input is required');
    }
    const assets = Array.isArray(input.assets) ? input.assets : [];
    const liabilities = Array.isArray(input.liabilities) ? input.liabilities : [];
    const kappa = clamp01(safeNum(input.kappa));
    const mode: Mode = (
        ['marketIntensity', 'returnOnCost', 'extension', 'absolute'] as Mode[]
    ).includes(input.mode)
        ? input.mode
        : 'absolute';

    const { sum: sumA, uAbs: uA } = sumWithUncertainty(assets);
    const { sum: sumL, uAbs: uL } = sumWithUncertainty(liabilities);
    const amount = sumA - sumL;
    // Independent uncertainties → RSS for the difference, same as for a sum.
    const uTotalGum = Math.sqrt(uA * uA + uL * uL);
    const widener = bandWidenerFromKappa(kappa);
    const halfBand = uTotalGum * widener;
    const low = amount - halfBand;
    const high = amount + halfBand;

    const { currency, mixedFallback } = pickCurrency(input);

    const { pct, pctLow, pctHigh } = computePercentages(
        amount,
        low,
        high,
        mode,
        input.denominator,
    );

    // FIS-001 Fase 2 — wire opcional. Calvin 2026-06-08 "seguir" → wire em
    // computeEcbtScore como CAMPO ADICIONAL (não modifica amount/sign/low/high).
    // UI/painel pode usar fineImpactScore para penalizar visualmente o veredito.
    let fineImpactScore: number | null = null;
    let fineImpactAudit: import('./_fineImpactPure.js').FineImpactOutput | null = null;
    if (Array.isArray(input.fines) && input.fines.length > 0) {
        try {
            const fis = computeFineImpactLocal({
                fines: input.fines,
                ebitdaBrl: input.ebitdaBrl,
                revenueBrl: input.revenueBrl,
                windowYears: input.windowYears,
                sectorWeight: input.sectorWeight,
                nowIso: input.nowIso,
            });
            fineImpactScore = fis.FIS;
            fineImpactAudit = fis;
        } catch (e: any) {
            // Fail-soft: erro no FIS não trava ECBT Score
            (console as any).debug?.('[ecbtScore:fis]', e?.message || e);
        }
    }

    const vm: EcbtScoreVM = {
        amount,
        currency,
        sign: signOf(amount),
        low,
        high,
        kappa,
        mode,
        pct,
        pctLow,
        pctHigh,
        denominatorKind: input.denominator?.kind ?? null,
        denominator: input.denominator?.value ?? null,
        mixedCurrencyFallback: mixedFallback,
        fineImpactScore,
        fineImpactAudit,
    };
    return Object.freeze(vm);
}
