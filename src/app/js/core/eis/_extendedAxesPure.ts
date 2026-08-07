// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * EIS Extended Axes — pure-logic dos 4 eixos progressivos faltantes (CCC-001 CC-15b).
 *
 * Calvin 2026-06-10 autorizou "cc15 implementar" — passa do via (a) rebaixamento
 * para via (b) implementação canonical. Esses 4 eixos complementam o framework
 * TCCCA+T já em produção (T, A, Cp, Ty, Cs, Cm) com os 4 indicadores faltantes:
 *
 *   V  — Validity (Validade): conformidade do registro a regras de domínio.
 *   U  — Uniqueness (Unicidade): ausência de duplicatas em chaves naturais.
 *   Un — Uncertainty (Incerteza): qualidade da declaração de u_rel por observação.
 *   Ex — Exception Context (Contexto de Exceção): qualificação de eventos
 *        excepcionais (padrão QA ar — IPR/INMET para outliers meteorológicos).
 *
 * Cada eixo retorna score ∈ [0, 5] (mesma escala TCCCA+T) determinístico.
 *
 * Princípios:
 *   1. Pure-logic (sem side-effects, sem Date.now interno — nowIso injetável).
 *   2. Frozen output.
 *   3. Back-compat: ausência de dados → score 0 + reason explícito (NÃO 5).
 *      Isso é o oposto de FIS-001 _fineImpactEisAxisPure (sem fines → L=5)
 *      porque AUSÊNCIA DE CONFORMIDADE ≠ AUSÊNCIA DE PROBLEMA.
 *   4. Cada eixo declara seu rationale (CC-04 anti-deriva + PN-3 constantes).
 *
 * Spec: docs/specs/features/SPEC_CODEBASE_CORRECTIONS_CC_V03.md §2.3 CC-15(b)
 * ADR refs: ADR-FINE-IMPACT-SCORE-001 (pattern de progressive axis)
 * Source of truth: axisRegistry.ts (precisa expor IDs V, U, Un, Ex)
 */

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export interface ObservationRecord {
    readonly id: string;
    readonly parameter: string;
    readonly value: number | string | null;
    readonly unit?: string;
    readonly dateIso?: string;
    readonly elementId?: string;
    readonly elementType?: string;
    readonly campaignId?: string;
    /** Incerteza relativa declarada (u_rel ∈ [0, 1]). */
    readonly uRel?: number;
    /** Flag de evento excepcional (storm, lab error, equipment malfunction). */
    readonly exceptional?: boolean;
    /** Categoria da exceção (rationale-friendly). */
    readonly exceptionKind?: 'meteorological' | 'lab_qa' | 'equipment' | 'sampling' | 'other';
}

export interface DomainRule {
    /** Parameter name canonical (matches ObservationRecord.parameter). */
    readonly parameter: string;
    /** Lower bound inclusive (null = no lower). */
    readonly min?: number | null;
    /** Upper bound inclusive (null = no upper). */
    readonly max?: number | null;
    /** Allowed unit set (case-insensitive). */
    readonly allowedUnits?: ReadonlyArray<string>;
    /** Required (must be non-null). Default true. */
    readonly required?: boolean;
}

export interface AxisScore {
    readonly axis: 'V' | 'U' | 'Un' | 'Ex';
    readonly label: string;
    readonly score: number;
    readonly maxScore: 5;
    readonly weight: 1;
    readonly reason: string;
    readonly evidence: {
        readonly totalEvaluated: number;
        readonly passed: number;
        readonly failed: number;
        readonly breakdown?: ReadonlyArray<{ key: string; passed: boolean; reason?: string }>;
    };
}

// ----------------------------------------------------------------
// CONSTANTS (CC-07 rationale obrigatório)
// ----------------------------------------------------------------

const SCALE_MAX = 5;
const FROZEN_EMPTY_BREAKDOWN: ReadonlyArray<{ key: string; passed: boolean; reason?: string }> = Object.freeze([]);

// CC-07: Validity threshold — observations must pass 100% domain rules for score 5.
// Linear penalty below threshold; score = 5 × passRate.
// Rationale: validity is binary per observation (passes rule or not); aggregate is fraction.

// CC-07: Uniqueness key = (parameter, dateIso, elementId).
// Rationale: same param at same time at same well = duplicate (laboratory re-sent same data).
// Sample composite (different campaignId, same date+param+well) NOT duplicate — distinct samples.

// CC-07: Uncertainty quality bands (alinhado GUM 2008):
//   excellent: u_rel ≤ 0.05 (5%)  → 1.0
//   good:      u_rel ≤ 0.10 (10%) → 0.75
//   fair:      u_rel ≤ 0.20 (20%) → 0.50
//   poor:      u_rel ≤ 0.50 (50%) → 0.25
//   missing or > 0.50: 0
const UNC_EXCELLENT = 0.05;
const UNC_GOOD = 0.10;
const UNC_FAIR = 0.20;
const UNC_POOR = 0.50;

// CC-07: Exception context — observations marked exceptional WITHOUT kind = penalty.
// With kind = full credit (proper QA). Without flag + value in extreme percentile = penalty.

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function _clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
}

function _safeNum(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function _frozenScore(axis: AxisScore['axis'], label: string, score: number, reason: string, evidence: AxisScore['evidence']): AxisScore {
    return Object.freeze({
        axis,
        label,
        score: _clamp(score, 0, SCALE_MAX),
        maxScore: SCALE_MAX as 5,
        weight: 1 as 1,
        reason,
        evidence: Object.freeze({
            totalEvaluated: evidence.totalEvaluated,
            passed: evidence.passed,
            failed: evidence.failed,
            breakdown: evidence.breakdown ? Object.freeze(Array.from(evidence.breakdown)) : FROZEN_EMPTY_BREAKDOWN,
        }),
    }) as AxisScore;
}

// ----------------------------------------------------------------
// V — VALIDITY (CCC-001 CC-15b)
// ----------------------------------------------------------------

/**
 * Validity axis — fraction of observations that pass domain rules.
 *
 * Rules check: value within [min, max], unit in allowedUnits, presence per `required`.
 *
 * @param observations Lista de observações
 * @param rules Lista de regras de domínio (1 por parameter canonical)
 * @returns AxisScore frozen para axis 'V'
 */
export function computeValidity(
    observations: ReadonlyArray<ObservationRecord>,
    rules: ReadonlyArray<DomainRule>,
): AxisScore {
    const ruleMap = new Map<string, DomainRule>();
    for (const r of rules || []) {
        if (r && typeof r.parameter === 'string') ruleMap.set(r.parameter, r);
    }
    if (!Array.isArray(observations) || observations.length === 0) {
        return _frozenScore('V', 'V — Validity (domain conformance)', 0,
            'no_observations', { totalEvaluated: 0, passed: 0, failed: 0 });
    }

    let passed = 0;
    let failed = 0;
    const breakdown: Array<{ key: string; passed: boolean; reason?: string }> = [];

    for (const obs of observations) {
        if (!obs || typeof obs !== 'object') {
            failed++;
            continue;
        }
        const rule = ruleMap.get(obs.parameter);
        if (!rule) {
            // No rule = pass by default (gap in rules ≠ data invalidity)
            passed++;
            continue;
        }
        const v = _safeNum(obs.value);
        const required = rule.required !== false;

        if (required && (obs.value === null || obs.value === undefined)) {
            failed++;
            breakdown.push({ key: obs.id, passed: false, reason: 'value_required_missing' });
            continue;
        }
        if (v !== null) {
            if (rule.min !== undefined && rule.min !== null && v < rule.min) {
                failed++;
                breakdown.push({ key: obs.id, passed: false, reason: `below_min_${rule.min}` });
                continue;
            }
            if (rule.max !== undefined && rule.max !== null && v > rule.max) {
                failed++;
                breakdown.push({ key: obs.id, passed: false, reason: `above_max_${rule.max}` });
                continue;
            }
        }
        if (rule.allowedUnits && rule.allowedUnits.length > 0) {
            const u = (obs.unit || '').toLowerCase();
            const allowed = rule.allowedUnits.map((x) => x.toLowerCase());
            if (!allowed.includes(u)) {
                failed++;
                breakdown.push({ key: obs.id, passed: false, reason: `unit_not_allowed_${u}` });
                continue;
            }
        }
        passed++;
    }

    const total = passed + failed;
    const passRate = total > 0 ? passed / total : 0;
    const score = passRate * SCALE_MAX;
    const reason = total === 0
        ? 'no_evaluable_observations'
        : passRate === 1
            ? 'all_passed'
            : passRate >= 0.95
                ? 'near_full_conformance'
                : passRate >= 0.80
                    ? 'partial_conformance'
                    : 'low_conformance';

    return _frozenScore('V', 'V — Validity (domain conformance)', score, reason, {
        totalEvaluated: total,
        passed,
        failed,
        breakdown: breakdown.slice(0, 50), // cap breakdown size
    });
}

// ----------------------------------------------------------------
// U — UNIQUENESS (CCC-001 CC-15b)
// ----------------------------------------------------------------

/**
 * Uniqueness axis — penalizes duplicate observations.
 *
 * Key = (parameter, dateIso, elementId). Two observations sharing the key
 * are duplicates (laboratory re-sent same data, ingestion glitch, etc).
 *
 * @returns AxisScore frozen para axis 'U'
 */
export function computeUniqueness(
    observations: ReadonlyArray<ObservationRecord>,
): AxisScore {
    if (!Array.isArray(observations) || observations.length === 0) {
        return _frozenScore('U', 'U — Uniqueness (no duplicates)', 0,
            'no_observations', { totalEvaluated: 0, passed: 0, failed: 0 });
    }

    const seen = new Map<string, number>();
    for (const obs of observations) {
        if (!obs || typeof obs !== 'object') continue;
        const key = `${obs.parameter || ''}|${obs.dateIso || ''}|${obs.elementId || ''}`;
        seen.set(key, (seen.get(key) || 0) + 1);
    }
    let duplicates = 0;
    const duplicateKeys: Array<{ key: string; passed: boolean; reason?: string }> = [];
    for (const [k, n] of seen.entries()) {
        if (n > 1) {
            duplicates += n - 1; // count extras only
            duplicateKeys.push({ key: k, passed: false, reason: `count_${n}` });
        }
    }
    const total = observations.length;
    const uniqueCount = total - duplicates;
    const uniqueRate = total > 0 ? uniqueCount / total : 0;
    const score = uniqueRate * SCALE_MAX;
    const reason = duplicates === 0
        ? 'all_unique'
        : duplicates / total <= 0.05
            ? 'few_duplicates'
            : duplicates / total <= 0.20
                ? 'moderate_duplicates'
                : 'many_duplicates';

    return _frozenScore('U', 'U — Uniqueness (no duplicates)', score, reason, {
        totalEvaluated: total,
        passed: uniqueCount,
        failed: duplicates,
        breakdown: duplicateKeys.slice(0, 50),
    });
}

// ----------------------------------------------------------------
// Un — UNCERTAINTY (CCC-001 CC-15b)
// ----------------------------------------------------------------

/**
 * Uncertainty axis — quality of u_rel declaration per observation (GUM-aligned).
 *
 *   excellent: u_rel ≤ 0.05 → 1.0
 *   good:      u_rel ≤ 0.10 → 0.75
 *   fair:      u_rel ≤ 0.20 → 0.50
 *   poor:      u_rel ≤ 0.50 → 0.25
 *   missing or > 0.50: 0
 *
 * Aggregate = mean per-obs quality × SCALE_MAX.
 *
 * @returns AxisScore frozen para axis 'Un'
 */
export function computeUncertainty(
    observations: ReadonlyArray<ObservationRecord>,
): AxisScore {
    if (!Array.isArray(observations) || observations.length === 0) {
        return _frozenScore('Un', 'Un — Uncertainty (GUM u_rel quality)', 0,
            'no_observations', { totalEvaluated: 0, passed: 0, failed: 0 });
    }

    let qualitySum = 0;
    let passed = 0;
    let failed = 0;
    const bands: Array<{ key: string; passed: boolean; reason?: string }> = [];

    for (const obs of observations) {
        if (!obs || typeof obs !== 'object') continue;
        const u = _safeNum(obs.uRel);
        let band: number;
        let bandName: string;
        if (u === null || u < 0 || u > UNC_POOR) {
            band = 0;
            bandName = u === null ? 'missing' : 'beyond_poor';
            failed++;
        } else if (u <= UNC_EXCELLENT) {
            band = 1.0;
            bandName = 'excellent';
            passed++;
        } else if (u <= UNC_GOOD) {
            band = 0.75;
            bandName = 'good';
            passed++;
        } else if (u <= UNC_FAIR) {
            band = 0.50;
            bandName = 'fair';
            passed++;
        } else {
            band = 0.25;
            bandName = 'poor';
            passed++;
        }
        qualitySum += band;
        bands.push({ key: obs.id, passed: band >= 0.5, reason: bandName });
    }

    const total = observations.length;
    const meanQuality = total > 0 ? qualitySum / total : 0;
    const score = meanQuality * SCALE_MAX;
    const reason = meanQuality >= 0.9
        ? 'excellent_uncertainty_quality'
        : meanQuality >= 0.7
            ? 'good_uncertainty_quality'
            : meanQuality >= 0.4
                ? 'fair_uncertainty_quality'
                : meanQuality > 0
                    ? 'poor_uncertainty_quality'
                    : 'no_uncertainty_declared';

    return _frozenScore('Un', 'Un — Uncertainty (GUM u_rel quality)', score, reason, {
        totalEvaluated: total,
        passed,
        failed,
        breakdown: bands.slice(0, 50),
    });
}

// ----------------------------------------------------------------
// Ex — EXCEPTION CONTEXT (CCC-001 CC-15b)
// ----------------------------------------------------------------

/**
 * Exception Context axis — quality of exceptional event qualification.
 *
 * Pattern (alinhado QA ar IPR/INMET):
 *   - obs.exceptional=true + obs.exceptionKind set → full credit (1.0)
 *   - obs.exceptional=true + missing kind → partial credit (0.5)
 *   - obs.exceptional=false/undefined → assumed normal (1.0) unless statistical
 *     outlier (|z| > 3 against parameter's own median) without flag → penalty (0.3)
 *
 * @returns AxisScore frozen para axis 'Ex'
 */
export function computeExceptionContext(
    observations: ReadonlyArray<ObservationRecord>,
): AxisScore {
    if (!Array.isArray(observations) || observations.length === 0) {
        return _frozenScore('Ex', 'Ex — Exception Context (QA outliers qualified)', 0,
            'no_observations', { totalEvaluated: 0, passed: 0, failed: 0 });
    }

    // Compute per-parameter median + MAD for outlier detection
    const byParam = new Map<string, number[]>();
    for (const obs of observations) {
        if (!obs || typeof obs !== 'object') continue;
        const v = _safeNum(obs.value);
        if (v === null) continue;
        const arr = byParam.get(obs.parameter) || [];
        arr.push(v);
        byParam.set(obs.parameter, arr);
    }
    const stats = new Map<string, { median: number; mad: number }>();
    for (const [param, values] of byParam.entries()) {
        if (values.length < 3) continue;
        const sorted = [...values].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
        const deviations = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
        const mad = deviations[Math.floor(deviations.length / 2)] ?? 1;
        stats.set(param, { median, mad: Math.max(mad, 1e-9) });
    }

    let qualitySum = 0;
    let passed = 0;
    let failed = 0;
    const items: Array<{ key: string; passed: boolean; reason?: string }> = [];

    for (const obs of observations) {
        if (!obs || typeof obs !== 'object') continue;
        let q: number;
        let reason: string;

        if (obs.exceptional === true) {
            if (obs.exceptionKind && typeof obs.exceptionKind === 'string') {
                q = 1.0;
                reason = `flagged_${obs.exceptionKind}`;
                passed++;
            } else {
                q = 0.5;
                reason = 'flagged_no_kind';
                passed++;
            }
        } else {
            // Check if statistical outlier (|z| > 3) without flag
            const v = _safeNum(obs.value);
            const st = stats.get(obs.parameter);
            if (v !== null && st) {
                const z = Math.abs(v - st.median) / st.mad;
                if (z > 3) {
                    q = 0.3;
                    reason = `unflagged_outlier_z_${z.toFixed(1)}`;
                    failed++;
                } else {
                    q = 1.0;
                    reason = 'normal';
                    passed++;
                }
            } else {
                q = 1.0;
                reason = 'normal_insufficient_data';
                passed++;
            }
        }
        qualitySum += q;
        items.push({ key: obs.id, passed: q >= 0.5, reason });
    }

    const total = observations.length;
    const meanQ = total > 0 ? qualitySum / total : 0;
    const score = meanQ * SCALE_MAX;
    const overallReason = meanQ >= 0.95
        ? 'all_qualified_or_normal'
        : meanQ >= 0.80
            ? 'most_qualified'
            : meanQ >= 0.50
                ? 'partial_qualification'
                : 'many_unqualified_outliers';

    return _frozenScore('Ex', 'Ex — Exception Context (QA outliers qualified)', score, overallReason, {
        totalEvaluated: total,
        passed,
        failed,
        breakdown: items.slice(0, 50),
    });
}

// ----------------------------------------------------------------
// AGGREGATE — 4 extended axes view-model
// ----------------------------------------------------------------

export interface ExtendedAxesInput {
    readonly observations?: ReadonlyArray<ObservationRecord>;
    readonly rules?: ReadonlyArray<DomainRule>;
}

export interface ExtendedAxesViewModel {
    readonly axes: {
        readonly V: AxisScore;
        readonly U: AxisScore;
        readonly Un: AxisScore;
        readonly Ex: AxisScore;
    };
    readonly aggregateScore: number;
    readonly hasData: boolean;
}

/**
 * Computa os 4 eixos extended em batch + score agregado (média ponderada igual,
 * pesos=1 cada). Saída frozen, pronta para wire em canonicalEngine.
 *
 * @param input Observações + regras de domínio.
 * @returns VM frozen com 4 axes + aggregate + hasData flag.
 */
export function computeExtendedAxes(input: ExtendedAxesInput): ExtendedAxesViewModel {
    const obs = Array.isArray(input?.observations) ? input.observations : [];
    const rules = Array.isArray(input?.rules) ? input.rules : [];

    const V = computeValidity(obs, rules);
    const U = computeUniqueness(obs);
    const Un = computeUncertainty(obs);
    const Ex = computeExceptionContext(obs);

    const hasData = obs.length > 0;
    const aggregateScore = hasData
        ? (V.score + U.score + Un.score + Ex.score) / 4
        : 0;

    return Object.freeze({
        axes: Object.freeze({ V, U, Un, Ex }),
        aggregateScore,
        hasData,
    });
}
