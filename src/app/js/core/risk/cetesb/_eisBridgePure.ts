// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * CETESB Risk Assessment ↔ EIS T-axis Bridge — pure logic (RF-3.2 of
 * SPEC_CETESB_RISK_ASSESSMENT).
 *
 * Maps the COMPLETENESS of a CETESB Risk Assessment to a bonus on the
 * EIS T-axis (Transparency). When the technician fills out CMA per
 * receptor with the official planilhas attached as evidence, the
 * model's regulatory transparency is materially higher — the EIS T
 * score should reflect that.
 *
 * Pure: caller passes the assessment-completion summary; module returns
 * a frozen VM with the recommended T-axis additive bonus + the evidence
 * that justifies it (auditor-friendly).
 *
 * Why ADDITIVE bonus (not a replacement of T): the existing T axis already
 * captures other transparency signals (audit trail, blockchain-backed
 * hashes, etc.). RA completeness is one signal among several — bonus
 * keeps the composition explicit and bounded.
 *
 * Bonus schedule (T is 0..5 scale, EIS weights then aggregate):
 *   - 0.0   → no CMA computed for any scenario / no evidence
 *   - +0.5  → partial CMA (≥1 scenario covered, but < required set)
 *   - +1.0  → all applicable receptors have CMA + official xlsm attached
 *   - +0.25 added on top if `hasOfficialAnnexes` is true (extra strict)
 *
 * Capped at +1.5 so the bonus cannot dominate the axis (T can only reach
 * 5.0 anyway — caller adds the bonus and clamps).
 *
 * Tests live in `tests/cetesb-eis-bridge-pure.test.mjs`.
 */

export interface CetesbAssessmentCompletion {
    /** Number of receptor×pathway scenarios that have a finite CMA computed. */
    readonly scenariosWithCma: number;
    /** Total scenarios applicable to the model (denominator). */
    readonly totalApplicableScenarios: number;
    /** True when all 4 official .xlsm files were attached as evidence (RF-2.2). */
    readonly hasOfficialAnnexes: boolean;
    /** True when at least one CMA value is below the observed concentration (i.e., a real exceedance was detected — material transparency). */
    readonly hasMaterialFinding?: boolean;
}

export interface CetesbTBoostVM {
    /** Additive boost to the EIS T-axis score (caller clamps T to ≤5). */
    readonly boost: number;
    /** 0..1 fraction of completion (scenariosWithCma / totalApplicable, defensive). */
    readonly completionFraction: number;
    /** Discrete level reached. */
    readonly level: 'none' | 'partial' | 'complete' | 'complete_with_annexes';
    /** i18n key for a tooltip explaining the bonus. */
    readonly reasonKey: string;
    /** Auditor-friendly evidence object — safe to serialise into audit log. */
    readonly evidence: Readonly<{
        readonly scenariosWithCma: number;
        readonly totalApplicableScenarios: number;
        readonly hasOfficialAnnexes: boolean;
        readonly hasMaterialFinding: boolean;
    }>;
}

const BONUS_PARTIAL = 0.5;
const BONUS_COMPLETE = 1.0;
const BONUS_ANNEXES_EXTRA = 0.25;
const BONUS_MAX = 1.5;

const REASON_NONE = 'cetesb.eis.tboost.none';
const REASON_PARTIAL = 'cetesb.eis.tboost.partial';
const REASON_COMPLETE = 'cetesb.eis.tboost.complete';
const REASON_COMPLETE_ANNEXES = 'cetesb.eis.tboost.completeWithAnnexes';

function isFiniteNonNeg(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/**
 * Decide the additive T-axis bonus from the CETESB RA completion summary.
 * Pure: caller passes summary; module returns frozen VM.
 *
 * @example
 *   const vm = computeCetesbTBoost({
 *     scenariosWithCma: 12,
 *     totalApplicableScenarios: 12,
 *     hasOfficialAnnexes: true,
 *   });
 *   // → boost: 1.25, level: 'complete_with_annexes'
 */
export function computeCetesbTBoost(input: CetesbAssessmentCompletion | null | undefined): CetesbTBoostVM {
    const evidence = Object.freeze({
        scenariosWithCma: input && isFiniteNonNeg(input.scenariosWithCma) ? Math.trunc(input.scenariosWithCma) : 0,
        totalApplicableScenarios:
            input && isFiniteNonNeg(input.totalApplicableScenarios) ? Math.trunc(input.totalApplicableScenarios) : 0,
        hasOfficialAnnexes: !!(input && input.hasOfficialAnnexes === true),
        hasMaterialFinding: !!(input && input.hasMaterialFinding === true),
    });

    if (!input || !isFiniteNonNeg(input.totalApplicableScenarios) || input.totalApplicableScenarios === 0) {
        return Object.freeze({
            boost: 0,
            completionFraction: 0,
            level: 'none' as const,
            reasonKey: REASON_NONE,
            evidence,
        });
    }

    const total = Math.trunc(input.totalApplicableScenarios);
    const covered = Math.min(total, Math.trunc(isFiniteNonNeg(input.scenariosWithCma) ? input.scenariosWithCma : 0));
    const fraction = covered / total;

    if (covered === 0) {
        return Object.freeze({
            boost: 0,
            completionFraction: 0,
            level: 'none' as const,
            reasonKey: REASON_NONE,
            evidence,
        });
    }

    if (covered < total) {
        return Object.freeze({
            boost: BONUS_PARTIAL,
            completionFraction: fraction,
            level: 'partial' as const,
            reasonKey: REASON_PARTIAL,
            evidence,
        });
    }

    // covered === total → complete
    let boost = BONUS_COMPLETE;
    let level: CetesbTBoostVM['level'] = 'complete';
    let reasonKey = REASON_COMPLETE;

    if (input.hasOfficialAnnexes === true) {
        boost = Math.min(BONUS_MAX, BONUS_COMPLETE + BONUS_ANNEXES_EXTRA);
        level = 'complete_with_annexes';
        reasonKey = REASON_COMPLETE_ANNEXES;
    }

    return Object.freeze({
        boost,
        completionFraction: 1,
        level,
        reasonKey,
        evidence,
    });
}

/**
 * Convenience — apply the bonus to a current T score with clamp [0, 5].
 * Caller can use this directly inside the EIS pipeline.
 */
export function applyTBoost(currentT: number, vm: CetesbTBoostVM | null | undefined): number {
    const t = isFiniteNonNeg(currentT) ? currentT : 0;
    const b = vm && isFiniteNonNeg(vm.boost) ? vm.boost : 0;
    return Math.max(0, Math.min(5, t + b));
}
