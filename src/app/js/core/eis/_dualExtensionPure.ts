// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * EIS dual-report extension — pure logic (F2 SPEC_ECBT_SCORE).
 *
 * Wraps the existing 3CTA+ integrity score (from `core/eis/eisCalculator`) and
 * the severity composition (from `core/severity/_severityPure`) into a single
 * dual-report VM consumed by:
 *   - `core/ecbtScore/_dualReportPure` (F4 combinator)
 *   - `utils/ui/_ecbtScorePanelPure` (F5 panel builder)
 *
 * STRATEGY (safe extension, anti-regression):
 *   F2 of SPEC_ECBT_SCORE asks for ⟨S, κ, veto, label⟩ from EIS. Instead of
 *   modifying `canonicalEngine.ts` (19+ consumers across the codebase), we
 *   provide an EXTENSION shaper that takes already-computed inputs and
 *   produces the dual-report VM. Existing consumers stay untouched; new
 *   consumers (panel, HUD, future API) call this shaper.
 *
 * Anti-requirements honoured:
 *   - N1: integrity does NOT compensate severity (κ is the qualifier, not a
 *     parcel in S). S = max(R, I) preserved from F1.
 *   - N2: integrity NOT a parcel in the monetary sum either (κ widens band in F3).
 *   - Veto = (T ≤ 2 ∨ A ≤ 2) suppresses the verdict label only; severity stays
 *     intact in the output so the caller can still read raw S/R/I.
 */

import type { SeverityVM } from '../severity/_severityPure.js';

export type AxisScores = {
    /** Total (3CTA+) — the trustworthiness summary axis. 0..5 scale. */
    readonly T?: number;
    /** Accuracy. 0..5 scale. */
    readonly A?: number;
    /** Coverage. 0..5 scale. */
    readonly C?: number;
    /** Provenance. 0..5 scale. */
    readonly P?: number;
    /** Stewardship. 0..5 scale. */
    readonly S?: number;
};

/** Detail block returned when the dual extension is built. */
export interface DualEisExtensionVM {
    /** 3CTA+ integrity raw score, 0..5. */
    readonly integrity3CTA: number;
    /** Confidence κ = integrity3CTA / 5, clamped [0,1]. */
    readonly kappa: number;
    /** Severity continuum [0,1] from composeSeverity in F1. */
    readonly S: number;
    /** Risk normalised [0,1]. */
    readonly R: number;
    /** Impact normalised [0,1]. */
    readonly I: number;
    /** Veto flag = (T ≤ 2 ∨ A ≤ 2). */
    readonly veto: boolean;
    /** Veto reason or null. */
    readonly vetoReason: 'integrity_T_low' | 'integrity_A_low' | null;
    /** Severity label from F1 (e.g. 'baixa', 'moderada', 'alta', 'severa', 'critica'). */
    readonly severityLabel: SeverityVM['label'];
    /** UI label honouring veto: 'nao_confirmado' when veto=true, else severityLabel. */
    readonly displayLabel: string;
}

export interface BuildDualExtensionInput {
    readonly integrity3CTA: number;
    readonly axisScores?: AxisScores;
    readonly severity: SeverityVM;
}

function clamp(value: number, lo: number, hi: number): number {
    if (!Number.isFinite(value)) return lo;
    if (value < lo) return lo;
    if (value > hi) return hi;
    return value;
}

function clamp01(value: number): number {
    return clamp(value, 0, 1);
}

/**
 * Determine veto reason from axis scores. Returns:
 *   - 'integrity_T_low'  if T ≤ 2
 *   - 'integrity_A_low'  if A ≤ 2 (and T > 2)
 *   - null               otherwise
 *
 * If `axisScores` is undefined, no veto is applied (caller responsibility).
 */
export function determineVetoReason(
    axisScores: AxisScores | undefined,
): 'integrity_T_low' | 'integrity_A_low' | null {
    if (!axisScores) return null;
    const T = Number(axisScores.T);
    const A = Number(axisScores.A);
    if (Number.isFinite(T) && T <= 2) return 'integrity_T_low';
    if (Number.isFinite(A) && A <= 2) return 'integrity_A_low';
    return null;
}

/**
 * Build a dual EIS extension VM combining 3CTA+ integrity (raw + κ) with the
 * F1 severity composition. Pure, deterministic, returns a frozen object.
 *
 * Veto rule (SPEC §2 M2):
 *   - When T ≤ 2 OR A ≤ 2 → veto = true, displayLabel = 'nao_confirmado'.
 *   - Severity itself (S/R/I) is NOT zeroed (anti-N1) — only the verdict is
 *     suppressed; the caller can still read raw values for diagnostics.
 *
 * κ floor: by default κ = integrity3CTA / 5. We do NOT push κ to zero on veto
 * because the band-widener in F3 already responds to low κ; double-zeroing
 * would conflate two signals.
 */
export function buildEisDualExtension(input: BuildDualExtensionInput): DualEisExtensionVM {
    if (!input || typeof input !== 'object') {
        throw new TypeError('buildEisDualExtension: input is required');
    }
    if (!input.severity || typeof input.severity !== 'object') {
        throw new TypeError('buildEisDualExtension: severity VM required');
    }
    const integrity3CTA = clamp(Number(input.integrity3CTA), 0, 5);
    const kappa = clamp01(integrity3CTA / 5);
    const vetoReason = determineVetoReason(input.axisScores);
    const veto = vetoReason !== null;

    const sev = input.severity;
    const displayLabel: string = veto ? 'nao_confirmado' : (sev.label as string);

    const vm: DualEisExtensionVM = {
        integrity3CTA,
        kappa,
        S: clamp01(Number(sev.S)),
        R: clamp01(Number(sev.R)),
        I: clamp01(Number(sev.I)),
        veto,
        vetoReason,
        severityLabel: sev.label,
        displayLabel,
    };
    return Object.freeze(vm);
}

/**
 * Convenience adapter: extract axis scores from the shape returned by the
 * existing EIS canonical engine. Accepts the legacy shape `{ axes: { T:..., A:... } }`
 * or a flat `{ T, A, C, P, S }`. Returns AxisScores or undefined when the
 * input is not recognisable.
 */
export function extractAxisScores(payload: unknown): AxisScores | undefined {
    if (!payload || typeof payload !== 'object') return undefined;
    const p = payload as any;
    if (p.axes && typeof p.axes === 'object') {
        return {
            T: Number(p.axes.T),
            A: Number(p.axes.A),
            C: Number(p.axes.C),
            P: Number(p.axes.P),
            S: Number(p.axes.S),
        };
    }
    if (typeof p.T === 'number' || typeof p.A === 'number') {
        return {
            T: Number(p.T),
            A: Number(p.A),
            C: Number(p.C),
            P: Number(p.P),
            S: Number(p.S),
        };
    }
    return undefined;
}
