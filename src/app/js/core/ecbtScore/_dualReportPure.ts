// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Dual report — pure logic.
 *
 * Combines the physical view (severity ⟨R, I, S, label⟩ + integrity confidence κ
 * + optional veto) and the monetary view (ECBT Score VM) into a single frozen
 * structure that the API (F4) and UI (F5) consume together — never one without
 * the other.
 *
 * SPEC anchors:
 *  - §2 M7 — "Reporte dual: API e UI expõem EIS (físico) e ECBT Score (monetário)
 *            juntos; nunca um substitui o outro."
 *  - §10 A3 — dual SEEA reporting resolves incommensurability (Munda 2008).
 *  - §10 A8 — double materiality: EIS = impact materiality (inside-out);
 *             ECBT Score = financial materiality (outside-in).
 *
 * Anti-requirements honoured:
 *  - N3: this combinator REFUSES to return a report without both halves.
 *  - N1/N2: physical and monetary stay separated structurally — the combinator
 *           never folds one into the other.
 *  - veto (T≤2 ∨ A≤2): label is set to 'não confirmado' and a `veto` flag is
 *    surfaced, but severity stays intact (it's the *confidence* that drops).
 */

import type { SeverityVM } from '../severity/_severityPure.js';
import type { EcbtScoreVM } from './_ecbtScorePure.js';

export type VetoReason =
    | 'integrity_T_low'   // T ≤ 2 in 3CTA+
    | 'integrity_A_low'   // A ≤ 2 in 3CTA+
    | 'data_insufficient' // no records or below threshold
    | null;

export interface PhysicalView {
    readonly severity: SeverityVM;
    readonly kappa: number;
    /** Optional, when the caller has the original 3CTA+ integrity score 0–5. */
    readonly integrity3CTA?: number | undefined;
    readonly veto: boolean;
    readonly vetoReason: VetoReason;
    /** UI-ready label honouring veto: 'não confirmado' when vetoed. */
    readonly label: string;
}

export interface DualReportVM {
    readonly physical: PhysicalView;
    readonly monetary: EcbtScoreVM;
    readonly gates: {
        readonly dualGate: true;
        readonly present: ReadonlyArray<'physical' | 'monetary'>;
        readonly mode: EcbtScoreVM['mode'];
        readonly currency: EcbtScoreVM['currency'];
        /** True iff monetary VM carries F8 compensation flag `netZero=true`. */
        readonly netZero: boolean;
        /** Surfaced for UI badge: gross V_net BEFORE compensations (anti-blanqueamento). */
        readonly vNetBruto: number | null;
        /** Sum of compensations applied (0 when no F8 layer present). */
        readonly vCompensation: number;
        /** Count of compensation entries aggregated (0 when no F8 layer present). */
        readonly compensationCount: number;
    };
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

/**
 * Build the physical half of a dual report from severity + κ + optional
 * integrity / veto reason.
 *
 * When `vetoReason` is non-null, `veto=true` and `label='não confirmado'`. The
 * severity S itself is NOT zeroed — only the verdict is suppressed (anti-N1).
 */
export function buildPhysicalView(input: {
    severity: SeverityVM;
    kappa: number;
    integrity3CTA?: number | undefined;
    vetoReason?: VetoReason | undefined;
}): PhysicalView {
    if (!input || !input.severity) {
        throw new TypeError('buildPhysicalView: severity is required');
    }
    const kappa = clamp01(Number(input.kappa));
    const reason: VetoReason = input.vetoReason ?? null;
    const veto = reason !== null;
    const label = veto ? 'nao_confirmado' : input.severity.label;
    const view: PhysicalView = {
        severity: input.severity,
        kappa,
        integrity3CTA:
            typeof input.integrity3CTA === 'number' && Number.isFinite(input.integrity3CTA)
                ? input.integrity3CTA
                : undefined,
        veto,
        vetoReason: reason,
        label,
    };
    return Object.freeze(view);
}

/**
 * Compose physical + monetary into a single immutable dual report.
 *
 * Throws if either half is missing — anti-N3 ("nunca um substitui o outro").
 */
export function buildDualReport(input: {
    physical: PhysicalView;
    monetary: EcbtScoreVM;
}): DualReportVM {
    if (!input || typeof input !== 'object') {
        throw new TypeError('buildDualReport: input is required');
    }
    if (!input.physical) {
        throw new TypeError(
            'buildDualReport: physical view missing (anti-N3 — dual reporting required)',
        );
    }
    if (!input.monetary) {
        throw new TypeError(
            'buildDualReport: monetary view missing (anti-N3 — dual reporting required)',
        );
    }
    // F8 (compensation addendum): surface netZero + vNetBruto + vCompensation
    // when the monetary VM has been augmented by `applyCompensationsToScore`.
    // When not present, defaults are safe (netZero from amount, comp=0).
    const monetaryExt = input.monetary as EcbtScoreVM & {
        netZero?: boolean;
        vNetBruto?: number;
        vCompensation?: number;
        compensationCount?: number;
    };
    const netZero = monetaryExt.netZero ?? (monetaryExt.amount === 0);
    const vNetBruto =
        typeof monetaryExt.vNetBruto === 'number' ? monetaryExt.vNetBruto : monetaryExt.amount;
    const vCompensation =
        typeof monetaryExt.vCompensation === 'number' ? monetaryExt.vCompensation : 0;
    const compensationCount =
        typeof monetaryExt.compensationCount === 'number' ? monetaryExt.compensationCount : 0;

    const vm: DualReportVM = {
        physical: input.physical,
        monetary: input.monetary,
        gates: Object.freeze({
            dualGate: true as const,
            present: Object.freeze(['physical', 'monetary'] as const),
            mode: input.monetary.mode,
            currency: input.monetary.currency,
            netZero,
            vNetBruto,
            vCompensation,
            compensationCount,
        }),
    };
    return Object.freeze(vm);
}

/**
 * Structural invariant — confirms the report has both halves and a frozen
 * structure. Used as defensive gate in UI / API boundaries and as a test
 * anchor in `tests/dual-report-pure.test.mjs`.
 */
export function isDualReportValid(report: unknown): report is DualReportVM {
    if (!report || typeof report !== 'object') return false;
    const r = report as Partial<DualReportVM>;
    if (!r.physical || !r.monetary || !r.gates) return false;
    if (r.gates.dualGate !== true) return false;
    if (!Object.isFrozen(r)) return false;
    if (!Array.isArray(r.gates.present)) return false;
    if (
        !r.gates.present.includes('physical') ||
        !r.gates.present.includes('monetary')
    ) {
        return false;
    }
    return true;
}
