// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Environmental Permit Compliance Module
 *
 * Métricas de conformidade de licenças ambientais com base em verificações
 * de campo, ponderação de não-conformidades e estimativa de passivo ambiental.
 *
 * References:
 *  - CONAMA Resolução 237/1997 - Licenciamento ambiental
 *  - ISO 14001:2015 - Environmental Management Systems
 *  - CETESB (2021) Manual de Avaliação de Áreas Contaminadas
 */

/** Pesos de severidade das não-conformidades (adimensional) */
const SEVERITY_WEIGHTS = { minor: 1, major: 3, critical: 10 };

/**
 * Computa a taxa percentual de conformidade de uma licença ambiental.
 * compliance_pct = (total_checks - violations) / total_checks × 100
 *
 * @param {number} violations    - Número de não-conformidades detectadas (inteiro ≥ 0)
 * @param {number} total_checks  - Total de verificações realizadas (inteiro > 0)
 * @returns {{ compliance_pct: number }}
 * @throws {TypeError}   se os argumentos não forem inteiros finitos
 * @throws {RangeError}  se violations < 0, total_checks ≤ 0, ou violations > total_checks
 */
export function computeComplianceRate(violations: any, total_checks: any) {
    if (typeof violations !== 'number' || !isFinite(violations)) {
        throw new TypeError('violations deve ser um número finito');
    }
    if (typeof total_checks !== 'number' || !isFinite(total_checks)) {
        throw new TypeError('total_checks deve ser um número finito');
    }
    if (violations < 0) {
        throw new RangeError('violations não pode ser negativo');
    }
    if (total_checks <= 0) {
        throw new RangeError('total_checks deve ser maior que zero');
    }
    if (violations > total_checks) {
        throw new RangeError('violations não pode exceder total_checks');
    }

    const compliance_pct = ((total_checks - violations) / total_checks) * 100;
    return { compliance_pct };
}

/**
 * Computa o Índice Ponderado de Não-Conformidade (WNC).
 * WNC = Σ (severity_weight × frequency)
 *
 * @param {Array<{severity: 'minor'|'major'|'critical', frequency: number}>} violations
 *   Lista de não-conformidades com severidade e frequência (≥ 0)
 * @returns {{ WNC: number }}
 * @throws {TypeError}   se violations não for array ou tiver entradas inválidas
 * @throws {RangeError}  se frequency for negativo
 */
export function computeWeightedNonCompliance(violations: any) {
    if (!Array.isArray(violations)) {
        throw new TypeError('violations deve ser um array');
    }

    let WNC = 0;
    for (const v of violations) {
        if (typeof v !== 'object' || v === null) {
            throw new TypeError('Cada violação deve ser um objeto {severity, frequency}');
        }
        if (!(v.severity in SEVERITY_WEIGHTS)) {
            throw new TypeError(`severity inválido: "${v.severity}". Use: minor, major, critical`);
        }
        if (typeof v.frequency !== 'number' || !isFinite(v.frequency)) {
            throw new TypeError('frequency deve ser um número finito');
        }
        if (v.frequency < 0) {
            throw new RangeError('frequency não pode ser negativo');
        }
WNC += SEVERITY_WEIGHTS[v.severity as keyof typeof SEVERITY_WEIGHTS] * v.frequency;
    }

    return { WNC };
}

/**
 * Estima o passivo ambiental monetário com base no WNC.
 * liability_BRL = WNC × remediation_cost_per_unit (BRL)
 *
 * @param {number} WNC                      - Índice ponderado de não-conformidade (≥ 0)
 * @param {number} remediation_cost_per_unit - Custo unitário de remediação (BRL, > 0)
 * @returns {{ liability_BRL: number }}
 * @throws {TypeError}   se os argumentos não forem números finitos
 * @throws {RangeError}  se WNC < 0 ou cost ≤ 0
 */
export function computeEnvironmentalLiabilityEstimate(WNC: any, remediation_cost_per_unit: any) {
    if (typeof WNC !== 'number' || !isFinite(WNC)) {
        throw new TypeError('WNC deve ser um número finito');
    }
    if (typeof remediation_cost_per_unit !== 'number' || !isFinite(remediation_cost_per_unit)) {
        throw new TypeError('remediation_cost_per_unit deve ser um número finito');
    }
    if (WNC < 0) {
        throw new RangeError('WNC não pode ser negativo');
    }
    if (remediation_cost_per_unit <= 0) {
        throw new RangeError('remediation_cost_per_unit deve ser maior que zero');
    }

    const liability_BRL = WNC * remediation_cost_per_unit;
    return { liability_BRL };
}

/**
 * Classifica o status de conformidade ambiental com base em compliance_pct e WNC.
 *   compliance ≥ 95% AND WNC < 5           → compliant
 *   compliance ≥ 80% AND WNC < 20          → minor_issues
 *   compliance ≥ 60%                        → significant_violations
 *   else                                    → non_compliant
 *
 * @param {number} compliance_pct - Taxa de conformidade [0, 100]
 * @param {number} WNC            - Índice ponderado de não-conformidade (≥ 0)
 * @returns {{ status: 'compliant'|'minor_issues'|'significant_violations'|'non_compliant' }}
 * @throws {TypeError}   se os argumentos não forem números finitos
 * @throws {RangeError}  se compliance_pct estiver fora de [0, 100] ou WNC < 0
 */
export function classifyComplianceStatus(compliance_pct: any, WNC: any) {
    if (typeof compliance_pct !== 'number' || !isFinite(compliance_pct)) {
        throw new TypeError('compliance_pct deve ser um número finito');
    }
    if (typeof WNC !== 'number' || !isFinite(WNC)) {
        throw new TypeError('WNC deve ser um número finito');
    }
    if (compliance_pct < 0 || compliance_pct > 100) {
        throw new RangeError('compliance_pct deve estar no intervalo [0, 100]');
    }
    if (WNC < 0) {
        throw new RangeError('WNC não pode ser negativo');
    }

    /** @type {'compliant'|'minor_issues'|'significant_violations'|'non_compliant'} */
    let status;
    if (compliance_pct >= 95 && WNC < 5) status = 'compliant';
    else if (compliance_pct >= 80 && WNC < 20) status = 'minor_issues';
    else if (compliance_pct >= 60) status = 'significant_violations';
    else status = 'non_compliant';

    return { status };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const environmentalPermitComplianceMeta = {
    name: 'environmentalPermitCompliance',
    description: 'environmentalPermitCompliance',
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
