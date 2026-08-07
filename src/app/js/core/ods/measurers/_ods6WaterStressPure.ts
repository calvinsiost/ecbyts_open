// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ODS 6 Water — pure measurer for UN SDG indicator 6.4.2
 * "Level of water stress: freshwater withdrawal as a proportion of available
 * freshwater resources" (companion to `_ods6Pure.ts`, which covers 6.3.2
 * ambient water quality).
 *
 * Why a dedicated measurer (not the generic template):
 *   - 6.4.2 has its OWN canonical formula from the UN-Water / FAO custodian
 *     methodology (E-2020 metadata), distinct from a "fraction of A in B"
 *     shape. The environmental flow requirement (EFR) is *subtracted from the
 *     denominator*, which the generic ratio template cannot express.
 *   - It maps to a different ecbyts base: `ana/outorgas` (water-use permits /
 *     withdrawals) and `ana/rios` (renewable availability), vs `ana/qualidade_agua`
 *     for 6.3.2. Keeping them separate preserves auditable provenance per
 *     official indicator (SPEC_ODS_IMPACT_RISK §F5 / A5).
 *
 * Official UN-Water 6.4.2 formula (per cent):
 *
 *   WaterStress (%) = TWW / (TRWR − EFR) × 100
 *
 *   where
 *     TWW  = Total freshwater Withdrawn (same volume unit / period)
 *     TRWR = Total Renewable freshwater Resources
 *     EFR  = Environmental Flow Requirements (volume reserved for ecosystems)
 *
 * Official UN-Water interpretation bands (custodian methodology):
 *     < 25 %  → No stress
 *    25–50 %  → Low stress
 *    50–75 %  → Medium stress
 *    75–100 % → High stress
 *    > 100 %  → Critical (withdrawal exceeds the available, EFR-discounted, pool)
 *
 * In ecbyts dual-report terms:
 *   IMPACT = 1 − clamp01(stressFraction)  — higher means a healthier balance
 *            between withdrawal and the EFR-discounted renewable resource.
 *            Saturates at 0 once withdrawal reaches the available pool
 *            (stress ≥ 100 %).
 *   RISK   = ratio-cap of the stress fraction relative to the 100 % critical
 *            ceiling. Higher = closer to (or beyond) over-abstraction.
 *   TIER   = T1 when TWW, TRWR and EFR are all present and physically valid;
 *            T2 when EFR is missing and a default EFR share is assumed
 *            (the methodology's documented fallback); T0 when the core
 *            volumes are missing — we never fabricate a withdrawal/resource.
 *
 * Anti-requirements honoured (SPEC_ODS_IMPACT_RISK §2):
 *   - N1 no fabricated data: missing TWW or TRWR → tier='T0', impact/risk=null.
 *     A missing EFR does NOT fabricate a resource; it only discounts the
 *     denominator by a *declared* default share and downgrades tier to T2.
 *   - N2: approximates the official indicator and references its code (6.4.2);
 *     does not replace the UN framework.
 *   - N5 reuse only: imports ONLY from `_normalizePure` + `_registryPure`.
 *
 * Tests live in `tests/ods6-water-stress-pure.test.mjs`.
 */

import {
    invertedLinearNormalize,
    ratioCapNormalize,
    type NormalizationProvenance,
} from '../_normalizePure.js';
import type { OdsTier } from '../_registryPure.js';

/**
 * Default Environmental Flow Requirement as a share of TRWR, used as the
 * methodology's documented fallback when a basin-specific EFR is not provided.
 * 0.30 (30 %) is the mid-point of the commonly cited 20–50 % range and the
 * value FAO/AQUASTAT applies in the absence of national EFR data.
 */
export const DEFAULT_EFR_SHARE_OF_TRWR = 0.3;

export interface WaterStressInput {
    /** Total Freshwater Withdrawn (TWW), any consistent volume unit / period. */
    readonly totalWithdrawal?: number | null;
    /** Total Renewable freshwater Resources (TRWR), same unit as TWW. */
    readonly renewableResources?: number | null;
    /**
     * Environmental Flow Requirements (EFR), same unit as TWW. When omitted,
     * a default share of TRWR is reserved (see DEFAULT_EFR_SHARE_OF_TRWR) and
     * the tier is downgraded to T2.
     */
    readonly environmentalFlow?: number | null;
}

export interface Ods6WaterStressResult {
    /** [0, 1] — higher means a healthier withdrawal/availability balance. `null` if not measurable. */
    readonly impact: number | null;
    /** [0, 1] — higher means more over-abstraction risk. `null` if not measurable. */
    readonly risk: number | null;
    /** Raw water-stress fraction TWW / (TRWR − EFR). `null` if not measurable. May exceed 1 (critical). */
    readonly stressFraction: number | null;
    /** Water-stress as a percentage (the official 6.4.2 figure). `null` if not measurable. */
    readonly stressPercent: number | null;
    /** Official UN-Water interpretation band. */
    readonly band: 'no-stress' | 'low' | 'medium' | 'high' | 'critical' | 'unknown';
    readonly tier: OdsTier;
    /** True when EFR was inferred from the default share (denominator approximated). */
    readonly efrAssumed: boolean;
    readonly provenance: Readonly<{
        readonly officialIndicator: '6.4.2';
        readonly formula: string;
        readonly impactKind: NormalizationProvenance | null;
        readonly riskKind: NormalizationProvenance | null;
        readonly efrShareOfTrwr: number | null;
    }>;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

const FORMULA = 'stress% = TWW / (TRWR − EFR) × 100';

function bandFor(stressFraction: number | null): Ods6WaterStressResult['band'] {
    if (stressFraction === null) return 'unknown';
    const pct = stressFraction * 100;
    if (pct < 25) return 'no-stress';
    if (pct < 50) return 'low';
    if (pct < 75) return 'medium';
    if (pct <= 100) return 'high';
    return 'critical';
}

function notMeasurable(): Ods6WaterStressResult {
    return Object.freeze({
        impact: null,
        risk: null,
        stressFraction: null,
        stressPercent: null,
        band: 'unknown' as const,
        tier: 'T0' as OdsTier,
        efrAssumed: false,
        provenance: Object.freeze({
            officialIndicator: '6.4.2' as const,
            formula: FORMULA,
            impactKind: null,
            riskKind: null,
            efrShareOfTrwr: null,
        }),
    });
}

/**
 * Compute ODS 6.4.2 level-of-water-stress impact + risk + tier.
 *
 * Returns a deterministic, deeply-frozen result. Inputs that are missing,
 * non-finite, negative, or physically impossible (TRWR ≤ 0, or EFR ≥ TRWR so
 * the denominator collapses) yield tier='T0' with null impact/risk — we never
 * invent a withdrawal or a resource (anti-N1).
 */
export function measureOds6WaterStress(input: WaterStressInput): Ods6WaterStressResult {
    const tww = input?.totalWithdrawal;
    const trwr = input?.renewableResources;

    // N1: the two core volumes are mandatory. No fabrication.
    if (!isFiniteNumber(tww) || tww < 0) return notMeasurable();
    if (!isFiniteNumber(trwr) || trwr <= 0) return notMeasurable();

    // Resolve EFR: explicit (T1) or default share of TRWR (T2 fallback).
    let efr: number;
    let efrAssumed: boolean;
    let efrShare: number;
    if (isFiniteNumber(input?.environmentalFlow) && (input.environmentalFlow as number) >= 0) {
        efr = input.environmentalFlow as number;
        efrAssumed = false;
        efrShare = efr / trwr;
    } else {
        efrShare = DEFAULT_EFR_SHARE_OF_TRWR;
        efr = trwr * efrShare;
        efrAssumed = true;
    }

    const availablePool = trwr - efr;
    // EFR cannot consume the entire (or more than the) renewable resource:
    // a non-positive available pool makes the indicator undefined.
    if (!(availablePool > 0)) return notMeasurable();

    const stressFraction = tww / availablePool;
    const stressPercent = stressFraction * 100;

    // IMPACT: invertedLinear over [0, 1] of the stress fraction → 1 when no
    // withdrawal, 0 once withdrawal reaches the available pool (stress ≥ 100 %).
    const impactRes = invertedLinearNormalize(clamp01(stressFraction), 0, 1);
    // RISK: ratio-cap of the stress fraction against the 100 % critical ceiling
    // (threshold = 1), cap ×2 so withdrawal at 2× the available pool saturates.
    const riskRes = ratioCapNormalize(stressFraction, 1, 2);

    const tier: OdsTier = efrAssumed ? 'T2' : 'T1';

    return Object.freeze({
        impact: impactRes.value,
        risk: riskRes.value,
        stressFraction,
        stressPercent,
        band: bandFor(stressFraction),
        tier,
        efrAssumed,
        provenance: Object.freeze({
            officialIndicator: '6.4.2' as const,
            formula: FORMULA,
            impactKind: impactRes.provenance,
            riskKind: riskRes.provenance,
            efrShareOfTrwr: efrShare,
        }),
    });
}
