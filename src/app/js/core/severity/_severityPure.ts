// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Severity composition — pure logic.
 *
 * Composes physical severity S ∈ [0,1] from R (risk) and I (impact) without
 * compensation. Default S = max(R, I) — conservative; preserves the worst axis.
 * Alternative S = sqrt(R·I) (weak geometric) available via `method`.
 *
 * Refs:
 *  - Cox 2008 (risk-matrix-as-rule is wrong) → preserve continuum
 *  - RBCA ASTM E2081 (Hazard Quotient HQ)
 *  - CETESB GAC AP/AS/ACI (ordinal classification)
 *  - ODS magnitude × scope × reversibility (max-based aggregation)
 *  - Munda / SMCE (weak comparability, non-compensatory composition)
 *
 * Anti-requirements honored (SPEC_ECBT_SCORE §2 N4/N5):
 *  - No discrete matrix-as-rule; continuous values preserved
 *  - No equivalence between R and I (different ontologies); composed by max
 */

export type RiskInput =
    | { kind: 'hq'; value: number }
    | { kind: 'ratio'; concentration: number; vi: number }
    | { kind: 'gac'; classification: 'AP' | 'AS' | 'ACI' }
    | { kind: 'normalized'; value: number };

export type ImpactInput =
    | {
          kind: 'ods';
          magnitude: number;
          scope: number;
          reversibility: number;
      }
    | { kind: 'normalized'; value: number };

export type CompositionMethod = 'max' | 'geometric_weak';

export type SeverityLabel =
    | 'baixa'
    | 'moderada'
    | 'alta'
    | 'severa'
    | 'critica';

export interface SeverityVM {
    readonly R: number;
    readonly I: number;
    readonly S: number;
    readonly method: CompositionMethod;
    readonly label: SeverityLabel;
}

const GAC_MAP: Record<'AP' | 'AS' | 'ACI', number> = {
    AP: 0.85,
    AS: 0.5,
    ACI: 0.2,
};

const RATIO_CAP = 10;

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

/**
 * Normalize risk R ∈ [0,1].
 *
 * - hq (RBCA E2081): R = HQ / (HQ + 1) — asymptotic to 1; HQ=1 → R=0.5; HQ=10 → R≈0.91
 * - ratio (conc/VI): R = min(c/vi, 10) / 10 — cap at 10× VI = full risk
 * - gac (CETESB ordinal): AP=0.85, AS=0.5, ACI=0.2
 * - normalized: clamp(value, 0, 1)
 */
export function normalizeRisk(input: RiskInput): number {
    if (!input || typeof input !== 'object') return 0;
    switch (input.kind) {
        case 'hq': {
            const hq = Number(input.value);
            if (!Number.isFinite(hq) || hq <= 0) return 0;
            return hq / (hq + 1);
        }
        case 'ratio': {
            const c = Number(input.concentration);
            const vi = Number(input.vi);
            if (!Number.isFinite(c) || !Number.isFinite(vi) || vi <= 0 || c <= 0)
                return 0;
            return Math.min(c / vi, RATIO_CAP) / RATIO_CAP;
        }
        case 'gac':
            return GAC_MAP[input.classification] ?? 0;
        case 'normalized':
            return clamp01(Number(input.value));
        default:
            return 0;
    }
}

/**
 * Normalize impact I ∈ [0,1].
 *
 * - ods: I = max(magnitude, scope, reversibility) — non-compensatory aggregation
 *   (worst dimension dominates; SDG framework + Munda weak comparability)
 * - normalized: clamp(value, 0, 1)
 *
 * Inputs expected already in [0,1]; clamped defensively.
 */
export function normalizeImpact(input: ImpactInput): number {
    if (!input || typeof input !== 'object') return 0;
    switch (input.kind) {
        case 'ods': {
            const m = clamp01(Number(input.magnitude));
            const s = clamp01(Number(input.scope));
            const r = clamp01(Number(input.reversibility));
            return Math.max(m, s, r);
        }
        case 'normalized':
            return clamp01(Number(input.value));
        default:
            return 0;
    }
}

/**
 * Compose severity S from R and I without compensation.
 *
 * default 'max'   — S = max(R, I), conservative, S ≥ max axis (anti-N4)
 * 'geometric_weak' — S = sqrt(R·I), allows partial offset of one axis by the other
 *                    (only useful when R and I are commensurable; rare in practice)
 *
 * Preserves R and I on the output VM (SPEC §2 M1: "R e I preservados").
 */
export function composeSeverity(
    riskInput: RiskInput,
    impactInput: ImpactInput,
    options: { method?: CompositionMethod } = {},
): SeverityVM {
    const R = normalizeRisk(riskInput);
    const I = normalizeImpact(impactInput);
    const method: CompositionMethod = options.method === 'geometric_weak'
        ? 'geometric_weak'
        : 'max';
    const S = method === 'geometric_weak' ? Math.sqrt(R * I) : Math.max(R, I);
    const vm: SeverityVM = {
        R,
        I,
        S,
        method,
        label: labelForSeverity(S),
    };
    return Object.freeze(vm);
}

/**
 * Map S ∈ [0,1] to ordinal label for UI. Thresholds chosen to match the
 * CETESB-like 5-tier scale; ranges align with 0.2-step quantiles.
 */
export function labelForSeverity(S: number): SeverityLabel {
    const s = clamp01(S);
    if (s < 0.2) return 'baixa';
    if (s < 0.4) return 'moderada';
    if (s < 0.6) return 'alta';
    if (s < 0.8) return 'severa';
    return 'critica';
}
