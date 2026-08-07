// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ODS 6 Water — pure measurer (F2 of SPEC_ODS_IMPACT_RISK).
 *
 * Targets UN indicator 6.3.2 — "Proportion of bodies of water with good
 * ambient water quality". In ecbyts terms:
 *
 *   IMPACT = 1 − non-compensatory aggregate of (relativised observation
 *            values) for parameters with CONAMA/IBAMA thresholds. The
 *            higher the impact, the better the water quality.
 *   RISK   = ratio-cap aggregate of exceedances over each parameter's VI
 *            (intervention value). Higher = more risk.
 *   TIER   = T1 if all observations have a matched threshold and ≥ 1
 *           parameter is present; T2 if observations exist but only some
 *           thresholds matched; T3 if only proxy / no thresholds; T0 if
 *           no usable data.
 *
 * Anti-requirements honoured (SPEC_ODS_IMPACT_RISK §2):
 *   - N1 no fabricated data: missing inputs return `tier='T0'` with
 *     `impact=null` and `risk=null`. We never invent a default value.
 *   - N4 non-compensatory: aggregated subscores use the geometric form
 *     from `_normalizePure.nonCompensatoryAggregate` (compatible).
 *   - N5 reuse only: this module imports ONLY from `_normalizePure` —
 *     no new dependencies. The caller passes already-parsed observations
 *     and thresholds.
 *
 * Tests live in `tests/ods6-pure.test.mjs`.
 */

import {
    invertedLinearNormalize,
    nonCompensatoryAggregate,
    ratioCapNormalize,
    type NormalizationProvenance,
} from '../_normalizePure.js';
import type { OdsTier } from '../_registryPure.js';

export interface WaterObservation {
    readonly parameter: string;
    readonly value: number;
    readonly unit?: string;
}

export interface WaterThreshold {
    readonly parameter: string;
    /** Reference value (VR) — natural background. Below = best. */
    readonly vr?: number;
    /** Prevention value (VP) — monitoring required above. */
    readonly vp?: number;
    /** Intervention value (VI) — remediation required above. */
    readonly vi: number;
    readonly unit?: string;
    /**
     * `lower` means BETTER outcome with lower value (default — concentration).
     * `higher` means BETTER outcome with higher value (eg. DO dissolved oxygen).
     */
    readonly direction?: 'lower' | 'higher';
}

export interface Ods6Result {
    /** [0, 1] — higher means better water quality. `null` if not measurable. */
    readonly impact: number | null;
    /** [0, 1] — higher means more risk. `null` if not measurable. */
    readonly risk: number | null;
    readonly tier: OdsTier;
    readonly matchedCount: number;
    readonly observationCount: number;
    readonly provenance: ReadonlyArray<Readonly<{
        readonly parameter: string;
        readonly impactKind: NormalizationProvenance | null;
        readonly riskKind: NormalizationProvenance | null;
    }>>;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/** Indexes thresholds by parameter (case-insensitive trimmed key). */
function indexThresholds(
    thresholds: ReadonlyArray<WaterThreshold>,
): Map<string, WaterThreshold> {
    const idx = new Map<string, WaterThreshold>();
    for (const t of thresholds || []) {
        if (!t || typeof t.parameter !== 'string') continue;
        if (!isFiniteNumber(t.vi)) continue;
        idx.set(t.parameter.toLowerCase().trim(), t);
    }
    return idx;
}

/**
 * Compute impact + risk + tier for ODS 6 from a list of observations and a
 * list of thresholds. Returns deterministic frozen result.
 */
export function measureOds6Water(input: {
    observations: ReadonlyArray<WaterObservation>;
    thresholds: ReadonlyArray<WaterThreshold>;
}): Ods6Result {
    const observations = Array.isArray(input?.observations) ? input.observations : [];
    const thresholds = Array.isArray(input?.thresholds) ? input.thresholds : [];

    if (observations.length === 0) {
        return Object.freeze({
            impact: null,
            risk: null,
            tier: 'T0' as OdsTier,
            matchedCount: 0,
            observationCount: 0,
            provenance: Object.freeze([]),
        });
    }

    const tIndex = indexThresholds(thresholds);
    const impactScores: number[] = [];
    const riskScores: number[] = [];
    const provenance: Array<{
        parameter: string;
        impactKind: NormalizationProvenance | null;
        riskKind: NormalizationProvenance | null;
    }> = [];
    let matched = 0;

    for (const obs of observations) {
        if (!obs || typeof obs.parameter !== 'string' || !isFiniteNumber(obs.value)) {
            continue;
        }
        const key = obs.parameter.toLowerCase().trim();
        const t = tIndex.get(key);
        if (!t) {
            provenance.push({ parameter: obs.parameter, impactKind: null, riskKind: null });
            continue;
        }
        matched++;
        const dir = t.direction ?? 'lower';
        // Impact path: invertedLinear with [vr (best) ; vi (worst)] when dir=lower.
        // Fallback to [0 ; vi] when vr is missing.
        const vrSafe = isFiniteNumber(t.vr) ? (t.vr as number) : 0;
        let impactRes;
        if (dir === 'lower') {
            impactRes = invertedLinearNormalize(obs.value, vrSafe, t.vi);
        } else {
            // higher=better — direct linear normalisation, no inversion.
            impactRes = invertedLinearNormalize(
                t.vi - (obs.value - vrSafe),
                vrSafe,
                t.vi,
            );
        }
        // Risk path: ratio cap relative to VI.
        const riskRes = ratioCapNormalize(Math.max(0, obs.value), t.vi, 10);
        if (impactRes.value !== null) impactScores.push(impactRes.value);
        if (riskRes.value !== null) riskScores.push(riskRes.value);
        provenance.push({
            parameter: obs.parameter,
            impactKind: impactRes.provenance,
            riskKind: riskRes.provenance,
        });
    }

    const impactAgg =
        impactScores.length > 0 ? nonCompensatoryAggregate(impactScores) : null;
    // For risk we use the geometric aggregate of the same form on the *risk*
    // side (also non-compensatory): higher subscores dominate.
    const riskAgg = riskScores.length > 0 ? nonCompensatoryAggregate(riskScores) : null;

    let tier: OdsTier;
    if (matched === 0) tier = 'T3';
    else if (matched === observations.length) tier = 'T1';
    else tier = 'T2';

    return Object.freeze({
        impact: impactAgg,
        risk: riskAgg,
        tier,
        matchedCount: matched,
        observationCount: observations.length,
        provenance: Object.freeze(provenance.map((p) => Object.freeze(p))),
    });
}
