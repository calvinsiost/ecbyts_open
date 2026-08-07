// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   COMPLIANCE DASHBOARD — G3: Governance compliance overview
   Painel de conformidade regulatoria agregado

   Computa taxas de conformidade por elemento, familia e parametro
   usando o motor de validacao existente (core/validation/).
   Semaforo: verde (conforme), amarelo (atencao), vermelho (nao conforme).

   Spec: docs/specs/features/SPEC_ESG_GOVERNANCE.md (G3)
   ================================================================ */

// ── Types ────────────────────────────────────────────────────────────────────

interface ComplianceStatus {
    totalElements: number;
    compliant: number;
    nonCompliant: number;
    unknown: number;
    complianceRate: number;
    verdict: string;
}

interface FamilyCompliance {
    family: string;
    total: number;
    compliant: number;
    nonCompliant: number;
    unknown: number;
    complianceRate: number;
}

interface ParameterCompliance {
    parameterId: string;
    totalObservations: number;
    compliant: number;
    nonCompliant: number;
    complianceRate: number;
}

type ValidateFn = (el: any) => { compliant: boolean } | null | undefined;

// ── Verdict thresholds ───────────────────────────────────────────────────────

const VERDICT_THRESHOLDS = {
    compliant: 1.0,
    attention: 0.8,
};

/**
 * Determine verdict string from compliance rate.
 * @param rate - 0.0-1.0
 */
function _getVerdict(rate: number): string {
    if (rate >= VERDICT_THRESHOLDS.compliant) return 'compliant';
    if (rate >= VERDICT_THRESHOLDS.attention) return 'attention';
    return 'non-compliant';
}

// ── Core API ─────────────────────────────────────────────────────────────────

/**
 * Compute overall compliance status across all elements in the model.
 * Uses the element manager and validation engine to assess each element.
 *
 * @param elements - Array of elements from getAllElements()
 */
export function getComplianceStatus(
    elements: Array<any>,
    options: { validateFn?: ValidateFn } = {},
): ComplianceStatus {
    if (!Array.isArray(elements) || elements.length === 0) {
        return {
            totalElements: 0,
            compliant: 0,
            nonCompliant: 0,
            unknown: 0,
            complianceRate: 0,
            verdict: 'no-data',
        };
    }

    const validateFn = options.validateFn || _defaultValidate;
    let compliant = 0;
    let nonCompliant = 0;
    let unknown = 0;

    for (const el of elements) {
        const result = validateFn(el);
        if (result === null || result === undefined) {
            unknown++;
        } else if (result.compliant) {
            compliant++;
        } else {
            nonCompliant++;
        }
    }

    const assessed = compliant + nonCompliant;
    const rate = assessed > 0 ? compliant / assessed : 0;

    return {
        totalElements: elements.length,
        compliant,
        nonCompliant,
        unknown,
        complianceRate: Math.round(rate * 1000) / 1000,
        verdict: assessed === 0 ? 'no-data' : _getVerdict(rate),
    };
}

/**
 * Compute compliance grouped by element family.
 */
export function getComplianceByFamily(
    elements: Array<any>,
    options: { validateFn?: ValidateFn } = {},
): FamilyCompliance[] {
    if (!Array.isArray(elements) || elements.length === 0) return [];

    const validateFn = options.validateFn || _defaultValidate;
    const groups: Record<
        string,
        { family: string; total: number; compliant: number; nonCompliant: number; unknown: number }
    > = {};

    for (const el of elements) {
        const fam = el.familyId || el.family || 'unknown';
        if (!groups[fam]) {
            groups[fam] = { family: fam, total: 0, compliant: 0, nonCompliant: 0, unknown: 0 };
        }
        groups[fam].total++;

        const result = validateFn(el);
        if (result === null || result === undefined) {
            groups[fam].unknown++;
        } else if (result.compliant) {
            groups[fam].compliant++;
        } else {
            groups[fam].nonCompliant++;
        }
    }

    return Object.values(groups).map((g) => {
        const assessed = g.compliant + g.nonCompliant;
        return {
            ...g,
            complianceRate: assessed > 0 ? Math.round((g.compliant / assessed) * 1000) / 1000 : 0,
        };
    });
}

/**
 * Compute compliance grouped by parameter across all observations.
 * Cada observacao e comparada contra thresholds fornecidos.
 *
 * @param observations - Flat array of observations with {parameterId, value}
 * @param thresholds - Map of parameterId -> {max: number} or {min, max}
 */
export function getComplianceByParameter(
    observations: Array<any>,
    thresholds: Record<string, { min?: number; max?: number }> = {},
): ParameterCompliance[] {
    if (!Array.isArray(observations) || observations.length === 0) return [];

    const groups: Record<
        string,
        { parameterId: string; totalObservations: number; compliant: number; nonCompliant: number }
    > = {};

    for (const obs of observations) {
        const pid = obs.parameterId || obs.parameter || '';
        if (!pid) continue;

        if (!groups[pid]) {
            groups[pid] = { parameterId: pid, totalObservations: 0, compliant: 0, nonCompliant: 0 };
        }
        groups[pid].totalObservations++;

        const th = thresholds[pid];
        if (!th) {
            // No threshold defined - count as compliant (no violation detectable)
            groups[pid].compliant++;
            continue;
        }

        const val = typeof obs.value === 'number' ? obs.value : parseFloat(obs.value);
        if (isNaN(val)) continue;

        const exceeds = (th.max !== undefined && val > th.max) || (th.min !== undefined && val < th.min);
        if (exceeds) {
            groups[pid].nonCompliant++;
        } else {
            groups[pid].compliant++;
        }
    }

    return Object.values(groups).map((g) => {
        const assessed = g.compliant + g.nonCompliant;
        return {
            ...g,
            complianceRate: assessed > 0 ? Math.round((g.compliant / assessed) * 1000) / 1000 : 0,
        };
    });
}

/**
 * Get a summary verdict for the whole model - single traffic-light indicator.
 * Verde (>=100%), amarelo (>=80%), vermelho (<80%), cinza (sem dados).
 *
 * @param status - Output from getComplianceStatus()
 */
export function getTrafficLight(status: ComplianceStatus): { color: string; label: string; rate: number } {
    if (!status || status.verdict === 'no-data') {
        return { color: 'gray', label: 'no-data', rate: 0 };
    }
    if (status.verdict === 'compliant') {
        return { color: 'green', label: 'compliant', rate: status.complianceRate };
    }
    if (status.verdict === 'attention') {
        return { color: 'yellow', label: 'attention', rate: status.complianceRate };
    }
    return { color: 'red', label: 'non-compliant', rate: status.complianceRate };
}

// ── Default validation ───────────────────────────────────────────────────────

/**
 * Default validation: checks if element has observations and at least one
 * is not flagged. Returns null if no observations (unknown).
 * Em producao, o caller passa validateFn integrado com core/validation/.
 */
function _defaultValidate(el: any): { compliant: boolean } | null {
    const obs = el.observations || el.data || [];
    if (!Array.isArray(obs) || obs.length === 0) return null;

    const hasViolation = obs.some((o) => o.violation === true || o.exceedance === true || o.status === 'non-compliant');
    return { compliant: !hasViolation };
}
