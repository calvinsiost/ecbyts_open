// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Cost-rollup → ECBT Score HUD adapter (pure logic).
 *
 * Bridges the existing `core/analytics/economics/costRollup` data (which feeds
 * the cost-hud-canvas widget) into the ECBT Score HUD snapshot shape, so the
 * widget renders **real data** even before F5 (full dashboard) lands.
 *
 * Strategy: we treat the rollup's `grandTotal` as the liability and
 * `kpis.elementsWithCost * benchmarks.costPerElement` as a coarse asset proxy
 * (same heuristic `costHud.ts` uses). Without an EIS confidence yet, κ defaults
 * to a passed-in value (caller may forward an EIS-derived κ); without a
 * declared denominator we stay in `mode='absolute'` (anti-N7: never fabricate).
 *
 * Pure — no DOM, no IDB, no rollup engine import. Tests live in
 * `tests/cost-rollup-adapter-pure.test.mjs`.
 */

import type { EcbtHudSnapshotInput } from '../../utils/ui/_ecbtScoreHudPure.js';

export interface CostRollupLike {
    readonly grandTotal?: number;
    readonly currency?: string;
    readonly kpis?: {
        readonly elementsWithCost?: number;
    };
    readonly benchmarks?: {
        readonly costPerElement?: number;
    };
    readonly uncertainty?: {
        readonly metrics?: {
            readonly u?: number;
        };
    };
}

export interface AdapterOptions {
    /** EIS-derived confidence (0-1). Falls back to 1 (fully confident). */
    readonly kappa?: number;
    /**
     * Optional explicit denominator. When supplied, the adapter switches to a
     * non-absolute mode (marketIntensity by default) and reports pct.
     */
    readonly denominator?: { readonly kind: string; readonly value: number };
    readonly mode?: 'marketIntensity' | 'returnOnCost' | 'extension';
    /**
     * F3 (Calvin 2026-06-10): override do total de ativos. Quando supplied, o
     * adapter ignora o cálculo padrão (costPerElement × N — que basicamente
     * espelha o passivo) e usa este valor — vindo do extractNaturalAssets do
     * cost-analysis board.
     */
    readonly assetOverride?: number;
}

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0;
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
}

function signOf(amount: number): 'surplus' | 'deficit' | 'zero' {
    if (amount > 0) return 'surplus';
    if (amount < 0) return 'deficit';
    return 'zero';
}

/**
 * Convert a cost-rollup-shaped object into an ECBT Score HUD snapshot input.
 * Returns `null` when the rollup has no usable data (total=0 and assets=0) —
 * the HUD renders its empty state in that case.
 *
 * For the pct path: if `denominator` is supplied we compute pct = V_net/denom*100
 * (no clamp); otherwise mode='absolute' and pct stays null. The (1-κ) widener
 * spreads the band; an uncertainty fraction from the rollup is treated as the
 * absolute 1-sigma on V_net.
 */
export function adaptCostRollupToHudSnapshot(
    rollup: CostRollupLike | null | undefined,
    options: AdapterOptions = {},
): EcbtHudSnapshotInput | null {
    if (!rollup || typeof rollup !== 'object') return null;
    const liability = Number(rollup.grandTotal);
    const elementsWithCost = Math.max(
        1,
        Number(rollup.kpis?.elementsWithCost) || 0,
    );
    // F3 (Calvin 2026-06-10): prefere assetOverride (extractNaturalAssets real)
    // ao cálculo legado costPerElement × N (que essencialmente espelhava o
    // passivo → ECBT HUD ficava com amount=0 e sign=zero).
    const hasOverride = typeof options.assetOverride === 'number'
        && Number.isFinite(options.assetOverride);
    const costPerElement = Number(rollup.benchmarks?.costPerElement) || 0;
    const asset = hasOverride
        ? (options.assetOverride as number)
        : costPerElement * elementsWithCost;
    const liabilityNum = Number.isFinite(liability) ? liability : 0;
    const assetNum = Number.isFinite(asset) ? asset : 0;
    if (liabilityNum === 0 && assetNum === 0) return null;

    const amount = assetNum - liabilityNum;
    const currency = (rollup.currency || 'BRL') as string;
    const kappa = clamp01(
        typeof options.kappa === 'number' ? options.kappa : 1,
    );
    const uAbs = Number(rollup.uncertainty?.metrics?.u);
    const baseSigma = Number.isFinite(uAbs) && uAbs > 0 ? uAbs : 0;
    const widener = 1 + 2 * (1 - kappa);
    const halfBand = baseSigma * widener;

    const useDenominator =
        options.denominator &&
        Number.isFinite(options.denominator.value) &&
        options.denominator.value !== 0;
    const mode: EcbtHudSnapshotInput['mode'] = useDenominator
        ? options.mode ?? 'marketIntensity'
        : 'absolute';
    const denomValue = useDenominator ? (options.denominator as any).value : null;
    const pct = useDenominator ? (amount / denomValue) * 100 : null;
    const pctLow = useDenominator ? ((amount - halfBand) / denomValue) * 100 : null;
    const pctHigh = useDenominator ? ((amount + halfBand) / denomValue) * 100 : null;

    return {
        amount,
        currency,
        sign: signOf(amount),
        pct,
        pctLow,
        pctHigh,
        mode,
        denominatorKind: useDenominator ? options.denominator!.kind : null,
        kappa,
    };
}
