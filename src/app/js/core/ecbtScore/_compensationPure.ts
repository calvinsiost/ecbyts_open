// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT Score — compensation accounting (F8 addendum).
 *
 * Pure-logic vector for environmental/social offsets that REDUCE the monetary
 * deficit of V_net WITHOUT moving the physical EIS (anti-N9).
 *
 * Use-cases anchored in Brazilian regulation:
 *   - CONAMA 371/2006 — % of investment to Conservation Units
 *   - Lei 14.119/2021 — Pagamento por Serviços Ambientais (PSA)
 *   - CFEM — % of mineral revenue back to municipalities
 *   - TCRA — Termo de Compromisso de Recuperação Ambiental (CETESB SP)
 *   - Carbon credits (Verra/VCS regulated + voluntary)
 *   - ICMS Ecológico — state-level fiscal incentive
 *   - 'other' — explicit catch-all, surfaced by UI as "unclassified"
 *
 * SPEC anchor: `docs/specs/_archived/SPEC_ECBT_SCORE_COMPENSATION_ADDENDUM.md`.
 *
 * Anti-requirements (addendum §2):
 *   - N9: this module NEVER returns severity / R / I / κ — it only modifies
 *     the monetary VM (`amount`, `pct`, ...) and adds 4 new keys.
 *   - N10: paidAt is required and validated as ISO timestamp; future-dated
 *     entries are flagged but not silently dropped.
 *   - N11: currency divergence triggers `mixedCurrencyFallback=true`, never
 *     silent conversion (caller delegates to `core/currency`).
 *
 * Tests live in `tests/ecbt-compensation-pure.test.mjs`.
 */

import type { Currency, EcbtScoreVM } from './_ecbtScorePure.js';

export type LegalInstrument =
    | 'conama371'
    | 'psa'
    | 'cfem'
    | 'tcra'
    | 'carbon_credit'
    | 'icms_eco'
    | 'other';

const RECOGNISED_INSTRUMENTS: ReadonlyArray<LegalInstrument> = Object.freeze([
    'conama371',
    'psa',
    'cfem',
    'tcra',
    'carbon_credit',
    'icms_eco',
    'other',
]);

export interface CompensationEntry {
    readonly value: number;
    readonly currency: Currency;
    readonly legalInstrument: LegalInstrument | string;
    /** ISO-8601 timestamp when the payment was made. Required. */
    readonly paidAt: string;
    readonly beneficiary?: string;
    /** Fractional 1-sigma uncertainty (e.g. 0.1 = ±10 %). */
    readonly uncertaintyFraction?: number;
}

export interface AggregatedCompensations {
    readonly sum: number;
    readonly uAbs: number;
    readonly count: number;
    readonly currency: Currency;
    readonly byInstrument: Readonly<Record<string, number>>;
    readonly mixedCurrencyFallback: boolean;
    readonly futureDatedCount: number;
}

export interface ApplyOptions {
    /** Threshold for the `netZero` flag, as fraction of max(U, 1). Default 0.05. */
    readonly netZeroEpsilon?: number;
    /** Optional clock for `paidAt` validation. Defaults to current time. */
    readonly nowMs?: number;
}

export interface CompensationApplyResult extends EcbtScoreVM {
    readonly vNetBruto: number;
    readonly vCompensation: number;
    readonly compensationCount: number;
    readonly netZero: boolean;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value: number): number {
    if (!isFiniteNumber(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

function isValidIsoTimestamp(value: unknown): value is string {
    if (typeof value !== 'string' || value.length === 0) return false;
    const t = Date.parse(value);
    return Number.isFinite(t);
}

function resolveInstrumentTag(legalInstrument: unknown): string {
    if (typeof legalInstrument === 'string' && legalInstrument.length > 0) {
        return legalInstrument;
    }
    return 'other';
}

function resolveCurrency(currencies: ReadonlySet<string>): { currency: Currency; mixedCurrencyFallback: boolean } {
    if (currencies.size === 1) {
        const first = [...currencies][0];
        if (typeof first === 'string') {
            return { currency: first as Currency, mixedCurrencyFallback: false };
        }
    } else if (currencies.size > 1) {
        return { currency: 'mixed' as Currency, mixedCurrencyFallback: true };
    }
    return { currency: 'BRL', mixedCurrencyFallback: false };
}

interface RunningCompensationTotals {
    sum: number;
    variance: number;
    futureDated: number;
    count: number;
}

function processCompensationEntry(
    e: CompensationEntry,
    nowMs: number,
    byInstrument: Record<string, number>,
    currencies: Set<string>,
    totals: RunningCompensationTotals,
): void {
    if (!isFiniteNumber(e.value)) return;
    if (!isValidIsoTimestamp(e.paidAt)) return;
    const t = Date.parse(e.paidAt);
    if (t > nowMs) totals.futureDated++;
    const uFrac = clamp01(isFiniteNumber(e.uncertaintyFraction) ? (e.uncertaintyFraction as number) : 0);
    totals.sum += e.value;
    const uAbs = Math.abs(e.value) * uFrac;
    totals.variance += uAbs * uAbs;
    const tag = resolveInstrumentTag(e.legalInstrument);
    byInstrument[tag] = (byInstrument[tag] ?? 0) + e.value;
    if (typeof e.currency === 'string') currencies.add(e.currency);
    totals.count++;
}

/**
 * Whether the legal instrument tag is one of the 6 recognised + 'other'.
 * Anti-N11 helper: UI uses this to surface unclassified instruments.
 */
export function isRecognisedInstrument(tag: string): boolean {
    return RECOGNISED_INSTRUMENTS.includes(tag as LegalInstrument);
}

/**
 * Aggregate a list of compensation entries into a single VM. Pure, frozen.
 *
 *   sum    = Σ entry.value
 *   uAbs   = √(Σ (entry.value · entry.uncertaintyFraction)²)   (GUM tier 1)
 *   byInstrument = sum per legalInstrument (free-text tags survive but flagged)
 */
export function aggregateCompensations(
    entries: ReadonlyArray<CompensationEntry> | null | undefined,
    options: ApplyOptions = {},
): AggregatedCompensations {
    const list = Array.isArray(entries) ? entries : [];
    const byInstrument: Record<string, number> = {};
    const currencies = new Set<string>();
    const totals: RunningCompensationTotals = { sum: 0, variance: 0, futureDated: 0, count: 0 };
    const nowMs = isFiniteNumber(options.nowMs) ? (options.nowMs as number) : Date.now();
    for (const raw of list) {
        if (!raw || typeof raw !== 'object') continue;
        processCompensationEntry(raw as CompensationEntry, nowMs, byInstrument, currencies, totals);
    }
    const { currency, mixedCurrencyFallback } = resolveCurrency(currencies);
    return Object.freeze({
        sum: totals.sum,
        uAbs: Math.sqrt(totals.variance),
        count: totals.count,
        currency,
        byInstrument: Object.freeze(byInstrument),
        mixedCurrencyFallback,
        futureDatedCount: totals.futureDated,
    });
}

function computeSign(amount: number): 'surplus' | 'deficit' | 'zero' {
    if (amount > 0) return 'surplus';
    if (amount < 0) return 'deficit';
    return 'zero';
}

function computePct(amount: number, denominator: number | null): number | null {
    if (denominator !== null && Number.isFinite(denominator) && denominator !== 0) {
        return (amount / denominator) * 100;
    }
    return null;
}

function computeNetZero(amount: number, halfBand: number, epsilon: number): boolean {
    const denomMag = Math.max(halfBand, 1);
    return Math.abs(amount) / denomMag < epsilon;
}

function resolveCompensationCurrency(
    scoreCurrency: Currency,
    scoreMixed: boolean,
    agg: AggregatedCompensations,
): { currency: Currency; mixedCurrencyFallback: boolean } {
    if (agg.count === 0) {
        return { currency: scoreCurrency, mixedCurrencyFallback: scoreMixed };
    }
    if (agg.mixedCurrencyFallback || (agg.currency !== scoreCurrency && scoreCurrency !== 'mixed')) {
        return { currency: 'mixed' as Currency, mixedCurrencyFallback: true };
    }
    return { currency: scoreCurrency, mixedCurrencyFallback: scoreMixed };
}

/**
 * Apply aggregated compensations to a previously-computed EcbtScoreVM and
 * return a new frozen VM extended with `vNetBruto`, `vCompensation`,
 * `compensationCount` and `netZero`.
 *
 * Behaviour:
 *   - `compensations=null` → returns the original score plus the four new
 *     keys (vCompensation=0, netZero derived from amount alone). Backward
 *     compatible: F4/F5/HUD consumers don't break.
 *   - `compensations` non-empty → amount becomes `vNetBruto + sum`, band
 *     widens by RSS of (original U, comp U), pct recomputed if denominator
 *     present.
 *
 * NEVER returns severity / R / I / κ keys (anti-N9 — physical EIS untouched).
 */
export function applyCompensationsToScore(
    score: EcbtScoreVM,
    compensations: ReadonlyArray<CompensationEntry> | null | undefined,
    options: ApplyOptions = {},
): CompensationApplyResult {
    if (!score || typeof score !== 'object') {
        throw new TypeError('applyCompensationsToScore: score required');
    }
    const agg = aggregateCompensations(compensations, options);
    const vNetBruto = score.amount;
    const vCompensation = agg.sum;
    const newAmount = vNetBruto + vCompensation;

    // Re-aggregate band uncertainty (RSS).
    const halfBandOriginal = Math.max(0, score.high - score.amount);
    const halfBandNew = Math.sqrt(halfBandOriginal * halfBandOriginal + agg.uAbs * agg.uAbs);
    const newLow = newAmount - halfBandNew;
    const newHigh = newAmount + halfBandNew;
    const newSign = computeSign(newAmount);

    // Re-compute pct if denominator present.
    const pct = computePct(newAmount, score.denominator);
    const pctLow = computePct(newLow, score.denominator);
    const pctHigh = computePct(newHigh, score.denominator);

    // netZero heuristic: |amount| / max(halfBand, 1) < epsilon
    const epsilon = isFiniteNumber(options.netZeroEpsilon)
        ? Math.max(0, options.netZeroEpsilon as number)
        : 0.05;
    const netZero = computeNetZero(newAmount, halfBandNew, epsilon);

    // Currency: if comp currency differs from score currency → mixed flag.
    const { currency, mixedCurrencyFallback } = resolveCompensationCurrency(score.currency, score.mixedCurrencyFallback, agg);

    const result: CompensationApplyResult = {
        amount: newAmount,
        currency,
        sign: newSign,
        low: newLow,
        high: newHigh,
        kappa: score.kappa,
        mode: score.mode,
        pct,
        pctLow,
        pctHigh,
        denominatorKind: score.denominatorKind,
        denominator: score.denominator,
        mixedCurrencyFallback,
        // NOVO — F8
        vNetBruto,
        vCompensation,
        compensationCount: agg.count,
        netZero,
    };
    return Object.freeze(result);
}
