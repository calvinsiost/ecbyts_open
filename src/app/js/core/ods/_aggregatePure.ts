// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ODS-EIS Profile aggregator — pure logic (F6 of SPEC_ODS_IMPACT_RISK).
 *
 * Takes the dict of per-ODS measurer results (`GenericOdsResult` keyed by
 * ODS id 1-17) and produces a single non-compensatory profile:
 *
 *   { odsEisImpact, odsEisRisk, impactByOds, riskByOds, tierMatrix,
 *     weakest, strongest, coverageCount }
 *
 * The aggregate impact uses the same non-compensatory shape as the EIS
 * canonical engine: `1 - prod((1-impact_i)^w_i)`. Weights default to uniform
 * but the caller can pass a `weights` dict to emphasise certain ODS (e.g.
 * for a hydroelectric project, water-related ODS may carry more weight).
 *
 * Anti-requirements honoured (SPEC §2):
 *   - N1 no fabricated: null per-ODS impact is excluded from the aggregate,
 *     not coerced to 0; `coverageCount` exposes how many ODS contributed.
 *   - N4 non-compensatory: explicit nonCompensatoryAggregate from `_normalizePure`.
 *   - N6: builds on existing aggregator instead of duplicating.
 *
 * Tests live in `tests/ods-aggregate-pure.test.mjs`.
 */

import { nonCompensatoryAggregate } from './_normalizePure.js';
import type { OdsTier } from './_registryPure.js';

export interface PerOdsResult {
    readonly impact: number | null;
    readonly risk: number | null;
    readonly tier: OdsTier;
}

export interface OdsAggregateInput {
    /** Dict keyed by ODS id (1..17). Missing ids ignored. */
    readonly results: Readonly<Record<number, PerOdsResult>>;
    /** Optional per-ODS weight dict; default uniform. */
    readonly weights?: Readonly<Record<number, number>>;
}

export interface OdsAggregateVM {
    readonly odsEisImpact: number | null;
    readonly odsEisRisk: number | null;
    readonly impactByOds: Readonly<Record<number, number>>;
    readonly riskByOds: Readonly<Record<number, number>>;
    readonly tierMatrix: Readonly<Record<number, OdsTier>>;
    readonly weakest: { id: number; impact: number } | null;
    readonly strongest: { id: number; impact: number } | null;
    readonly coverageCount: number;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

/**
 * Aggregate per-ODS results into a single profile. Pure, deterministic,
 * returns a frozen VM.
 *
 * Empty inputs OR no usable per-ODS results → `odsEisImpact = null`,
 * `weakest/strongest = null`, `coverageCount = 0`.
 */
export function aggregateOdsProfile(input: OdsAggregateInput): OdsAggregateVM {
    const results = input?.results || {};
    const weights = input?.weights || {};

    const impactByOds: Record<number, number> = {};
    const riskByOds: Record<number, number> = {};
    const tierMatrix: Record<number, OdsTier> = {};
    const orderedScores: number[] = [];
    const orderedWeights: number[] = [];
    let weakest: { id: number; impact: number } | null = null;
    let strongest: { id: number; impact: number } | null = null;
    let coverageCount = 0;

    for (const key of Object.keys(results)) {
        const id = Number(key);
        if (!Number.isFinite(id) || id < 1 || id > 17) continue;
        const r = results[id];
        if (!r || typeof r !== 'object') continue;
        tierMatrix[id] = r.tier;
        if (isFiniteNumber(r.impact)) {
            const i = clamp01(r.impact);
            impactByOds[id] = i;
            orderedScores.push(i);
            const w = isFiniteNumber(weights[id]) && weights[id] > 0 ? weights[id] : 1;
            orderedWeights.push(w);
            coverageCount++;
            if (weakest === null || i < weakest.impact) weakest = { id, impact: i };
            if (strongest === null || i > strongest.impact) strongest = { id, impact: i };
        }
        if (isFiniteNumber(r.risk)) {
            riskByOds[id] = clamp01(r.risk);
        }
    }

    const odsEisImpact = orderedScores.length > 0
        ? nonCompensatoryAggregate(orderedScores, orderedWeights)
        : null;
    const odsEisRisk = odsEisImpact === null ? null : clamp01(1 - (odsEisImpact as number));

    return Object.freeze({
        odsEisImpact,
        odsEisRisk,
        impactByOds: Object.freeze(impactByOds),
        riskByOds: Object.freeze(riskByOds),
        tierMatrix: Object.freeze(tierMatrix),
        weakest: weakest ? Object.freeze(weakest) : null,
        strongest: strongest ? Object.freeze(strongest) : null,
        coverageCount,
    });
}
