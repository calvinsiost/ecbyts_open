// @ts-check
// Generated from src/app/js/core/analytics/environmentalComplianceScore.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Environmental Compliance Score - audit, non-conformance severity, regulatory risk
// Score de Conformidade Ambiental - auditoria, severidade de não conformidades e risco regulatório
'use strict';
/**
 * Computes compliance rate from audit results with weighted critical score.
 * Calcula a taxa de conformidade de resultados de auditoria com score ponderado para itens críticos.
 *
 * compliance_pct = (compliant / checked) × 100
 * weighted_score = 0.6 × critical_compliance_pct + 0.4 × compliance_pct
 *
 * @param {number} requirements_checked - Total number of requirements audited (> 0, integer)
 * @param {number} requirements_compliant - Number of compliant requirements (≥ 0, ≤ checked)
 * @param {number} requirements_critical - Number of critical requirements in compliant subset (≥ 0)
 * @returns {{ compliance_pct: number, critical_compliance_pct: number, weighted_score: number }}
 * @throws {RangeError} If requirements_compliant > requirements_checked
 * @throws {TypeError} If any parameter is not a non-negative integer
 * @see ISO 14001:2015 - Environmental Management Systems, Clause 9.2 (Internal Audit)
 * @see GRI 307: Environmental Compliance (2016)
 */
export function computeComplianceRate( requirements_checked: any, requirements_compliant: any, requirements_critical: any) {
    for (const [name, val] of /** @type {[string, number][]} */ ([
        ['requirements_checked', requirements_checked],
        ['requirements_compliant', requirements_compliant],
        ['requirements_critical', requirements_critical],
    ])) {
        if (!Number.isInteger(val) || val < 0) {
            throw new TypeError(`${name} must be a non-negative integer`);
        }
    }
    if (requirements_checked === 0) throw new RangeError('requirements_checked must be > 0');
    if (requirements_compliant > requirements_checked) {
        throw new RangeError('requirements_compliant cannot exceed requirements_checked');
    }
    if (requirements_critical > requirements_compliant) {
        throw new RangeError('requirements_critical cannot exceed requirements_compliant');
    }
    const compliance_pct = (requirements_compliant / requirements_checked) * 100;
    // Porcentagem de conformidade crítica sobre total auditado
    const critical_compliance_pct = (requirements_critical / requirements_checked) * 100;
    // Score ponderado: critérios críticos têm peso maior (60%)
    const weighted_score = 0.6 * critical_compliance_pct + 0.4 * compliance_pct;
    return { compliance_pct, critical_compliance_pct, weighted_score };
}
/**
 * Computes weighted non-conformance severity score.
 * Calcula o score ponderado de severidade de não conformidades.
 *
 * weighted_nc_score = Σ(si × wi) / Σwi
 * critical > 7; major ∈ [4, 7]; minor < 4
 *
 * @param {number[]} severity_scores - Individual severity scores, each ∈ [1, 10]
 * @param {number[]} weights - Corresponding weights (must be same length, all > 0)
 * @returns {{ weighted_nc_score: number, severity_class: 'minor'|'major'|'critical' }}
 * @throws {RangeError} If arrays are empty, have different lengths, or scores out of [1,10]
 * @throws {TypeError} If inputs are not arrays of numbers
 * @see CONAMA 237/1997 - licenciamento ambiental, critérios de avaliação
 * @see EPA Environmental Compliance Monitoring (2021), Appendix B
 */
export function computeNonConformanceSeverity( severity_scores: any, weights: any) {
    if (!Array.isArray(severity_scores) || !Array.isArray(weights)) {
        throw new TypeError('severity_scores and weights must be arrays');
    }
    if (severity_scores.length === 0) throw new RangeError('severity_scores must not be empty');
    if (severity_scores.length !== weights.length) {
        throw new RangeError('severity_scores and weights must have the same length');
    }
    let sum_weighted = 0;
    let sum_weights = 0;
    for (let i = 0; i < severity_scores.length; i++) {
        const s = severity_scores[i];
        const w = weights[i];
        if (typeof s !== 'number' || !Number.isFinite(s)) {
            throw new TypeError(`severity_scores[${i}] must be a finite number`);
        }
        if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) {
            throw new RangeError(`weights[${i}] must be a positive finite number`);
        }
        if (s < 1 || s > 10) {
            throw new RangeError(`severity_scores[${i}] must be in [1, 10], got ${s}`);
        }
        sum_weighted += s * w;
        sum_weights += w;
    }
    const weighted_nc_score = sum_weighted / sum_weights;
    /** @type {'minor'|'major'|'critical'} */
    let severity_class;
    if (weighted_nc_score > 7) severity_class = 'critical';
    else if (weighted_nc_score >= 4) severity_class = 'major';
    else severity_class = 'minor';
    return { weighted_nc_score, severity_class };
}
/**
 * Computes estimated regulatory risk and penalty exposure from non-conformances.
 * Calcula o risco regulatório estimado e exposição a penalidades por não conformidades.
 *
 * Enforcement probabilities: minor=0.20, major=0.60, critical=0.95
 * risk_score = estimated_penalty_USD × enforcement_probability
 *
 * @param {{ severity: 'minor'|'major'|'critical', count: number }[]} non_conformances - NC list
 * @param {{ severity: 'minor'|'major'|'critical', penalty_USD: number }[]} penalty_table - Penalty lookup
 * @returns {{ estimated_penalty_USD: number, enforcement_probability: number, risk_score: number }}
 * @throws {TypeError} If inputs are not arrays or severity values are invalid
 * @throws {RangeError} If penalty_USD < 0 or count < 0
 * @see CONAMA 237/1997; Lei de Crimes Ambientais (Lei 9.605/1998) - penalidades
 * @see EPA Civil Penalty Policy (2003) - penalty calculation methodology
 */
export function computeRegulatoryRisk( non_conformances: any, penalty_table: any) {
    if (!Array.isArray(non_conformances)) throw new TypeError('non_conformances must be an array');
    if (!Array.isArray(penalty_table)) throw new TypeError('penalty_table must be an array');
    const VALID_SEVERITIES = ['minor', 'major', 'critical'];
    const ENFORCEMENT_PROBS = { minor: 0.2, major: 0.6, critical: 0.95 };
    // Construir lookup de penalidades por severidade
    const penaltyLookup = ({}) as Record<string, number>;
    for (const entry of penalty_table) {
        if (!VALID_SEVERITIES.includes(entry.severity)) {
            throw new TypeError(`penalty_table entry severity must be one of: ${VALID_SEVERITIES.join(', ')}`);
        }
        if (typeof entry.penalty_USD !== 'number' || entry.penalty_USD < 0) {
            throw new RangeError('penalty_USD must be a non-negative number');
        }
        penaltyLookup[entry.severity] = entry.penalty_USD;
    }
    let estimated_penalty_USD = 0;
    let weighted_prob_sum = 0;
    let total_count = 0;
    for (const nc of non_conformances) {
        if (!VALID_SEVERITIES.includes(nc.severity)) {
            throw new TypeError(`NC severity must be one of: ${VALID_SEVERITIES.join(', ')}`);
        }
        if (!Number.isInteger(nc.count) || nc.count < 0) {
            throw new RangeError('NC count must be a non-negative integer');
        }
        const penalty = penaltyLookup[nc.severity] || 0;
        const prob = (ENFORCEMENT_PROBS as any)[nc.severity];
        estimated_penalty_USD += nc.count * penalty;
        weighted_prob_sum += nc.count * prob;
        total_count += nc.count;
    }
    const enforcement_probability = total_count > 0 ? weighted_prob_sum / total_count : 0;
    const risk_score = estimated_penalty_USD * enforcement_probability;
    return { estimated_penalty_USD, enforcement_probability, risk_score };
}
/**
 * Classifies environmental license status based on compliance metrics.
 * Classifica o status de licença ambiental com base em métricas de conformidade.
 *
 * cancelled: nc_critical > 3 OR compliance_score < 50
 * suspended: nc_critical > 0 OR compliance_score < 70
 * regular_with_conditions: compliance_score < 85
 * regular: compliance_score >= 85 AND nc_critical == 0
 *
 * @param {number} compliance_score - Overall compliance score 0-100
 * @param {number} nc_critical_count - Number of critical non-conformances (≥ 0, integer)
 * @param {number} permit_conditions_met_pct - Percentage of permit conditions met (0-100)
 * @returns {{ license_status: string, renewal_risk: string, action_required: string }}
 * @throws {RangeError} If compliance_score or permit_conditions_met_pct ∉ [0,100]
 * @see CONAMA 237/1997 - renovação e suspensão de licença ambiental
 * @see CETESB (2020) Processo de Licenciamento Ambiental SP, Instrução Técnica 05
 */
export function classifyEnvironmentalLicense( compliance_score: any, nc_critical_count: any, permit_conditions_met_pct: any) {
    for (const [name, val] of [
        ['compliance_score', compliance_score],
        ['permit_conditions_met_pct', permit_conditions_met_pct],
    ]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} must be a finite number`);
        }
        if (val < 0 || val > 100) {
            throw new RangeError(`${name} must be in [0, 100]`);
        }
    }
    if (!Number.isInteger(nc_critical_count) || nc_critical_count < 0) {
        throw new TypeError('nc_critical_count must be a non-negative integer');
    }
    let license_status;
    let renewal_risk;
    let action_required;
    if (nc_critical_count > 3 || compliance_score < 50) {
        license_status = 'cancelled';
        renewal_risk = 'high';
        action_required =
            'Immediate cessation of non-compliant activities; emergency corrective action plan within 30 days; regulatory notification mandatory';
    } else if (nc_critical_count > 0 || compliance_score < 70) {
        license_status = 'suspended';
        renewal_risk = 'high';
        action_required =
            'Submit corrective action plan within 60 days; resolve all critical non-conformances before reinstatement application';
    } else if (compliance_score < 85 || permit_conditions_met_pct < 80) {
        license_status = 'regular_with_conditions';
        renewal_risk = 'moderate';
        action_required =
            'Address identified gaps before renewal; enhanced monitoring program required for next 12 months';
    } else {
        license_status = 'regular';
        renewal_risk = 'low';
        action_required = 'Maintain current compliance program; standard renewal process applies';
    }
    return { license_status, renewal_risk, action_required };
}
/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js' as string).AnalyticsModuleMeta}
 */
export const environmentalComplianceScoreMeta = {
    name: 'environmentalComplianceScore',
    description: 'environmentalComplianceScore',
    category: 'analytics',
    familyTags: ['environmental'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
