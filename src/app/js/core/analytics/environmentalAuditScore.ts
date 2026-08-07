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
 * Environmental Audit Score - cálculo de indicadores de desempenho
 * para auditorias ambientais corporativas e de conformidade regulatória.
 *
 * Referências:
 * ISO 14001:2015 - Sistemas de Gestão Ambiental - Requisitos
 * ISO 19011:2018 - Diretrizes para auditoria de sistemas de gestão
 * ABNT NBR ISO 14031:2015 - Avaliação de desempenho ambiental
 *
 * DOI de apoio metodológico:
 * Mazzi, A. et al. (2016). Environ. Sci. Policy 56:71–79.
 * DOI: 10.1016/j.envsci.2015.11.005
 */

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

/**
 * Calcula o Score de Conformidade da auditoria.
 * Pondera não-conformidades pelo fator de criticidade.
 *
 * score = max(0, min(100, (total - non_conf × critical_weight) / total × 100))
 *
 * @param total_requirements  - Total de requisitos auditados (inteiro > 0)
 * @param non_conformities    - Número de não-conformidades encontradas (≥ 0)
 * @param critical_weight     - Peso multiplicador para não-conformidades críticas (≥ 1)
 * @returns Score de conformidade em %
 * @throws {TypeError} se argumentos não forem números finitos
 * @throws {RangeError} se total ≤ 0, non_conf < 0 ou critical_weight < 1
 */
export function computeConformityScore(
    total_requirements: number,
    non_conformities: number,
    critical_weight: number,
): { score_pct: number } {
    if (
        typeof total_requirements !== 'number' ||
        !isFinite(total_requirements) ||
        typeof non_conformities !== 'number' ||
        !isFinite(non_conformities) ||
        typeof critical_weight !== 'number' ||
        !isFinite(critical_weight)
    ) {
        throw new TypeError('total_requirements, non_conformities e critical_weight devem ser números finitos');
    }
    if (total_requirements <= 0) throw new RangeError('total_requirements deve ser positivo');
    if (non_conformities < 0) throw new RangeError('non_conformities não pode ser negativo');
    if (critical_weight < 1) throw new RangeError('critical_weight deve ser ≥ 1');

    const raw = ((total_requirements - non_conformities * critical_weight) / total_requirements) * 100;
    return { score_pct: Math.max(0, Math.min(100, raw)) };
}

/**
 * Calcula o Índice de Conformidade Regulatória (Regulatory Compliance Index).
 *
 * RCI = compliant / (applicable - pending) × 100
 *
 * Exclui legislações pendentes do denominador porque ainda não são exigíveis.
 *
 * @param applicable_laws  - Total de leis/normas aplicáveis (> 0)
 * @param compliant_laws   - Leis em conformidade (≥ 0)
 * @param pending_laws     - Leis em fase de implementação (≥ 0)
 * @returns Índice de conformidade em %
 * @throws {TypeError} se argumentos não forem números finitos
 * @throws {RangeError} se denominador resultar em zero ou negativo
 */
function _validateRegulatoryComplianceIndex(
    applicable_laws: number,
    compliant_laws: number,
    pending_laws: number,
): void {
    if (
        typeof applicable_laws !== 'number' ||
        !isFinite(applicable_laws) ||
        typeof compliant_laws !== 'number' ||
        !isFinite(compliant_laws) ||
        typeof pending_laws !== 'number' ||
        !isFinite(pending_laws)
    ) {
        throw new TypeError('applicable_laws, compliant_laws e pending_laws devem ser números finitos');
    }
    if (applicable_laws <= 0) throw new RangeError('applicable_laws deve ser positivo');
    if (compliant_laws < 0) throw new RangeError('compliant_laws não pode ser negativo');
    if (pending_laws < 0) throw new RangeError('pending_laws não pode ser negativo');
}

export function computeRegulatoryComplianceIndex(
    applicable_laws: number,
    compliant_laws: number,
    pending_laws: number,
): { RCI: number } {
    _validateRegulatoryComplianceIndex(applicable_laws, compliant_laws, pending_laws);

    const denominator = applicable_laws - pending_laws;
    if (denominator <= 0) {
        throw new RangeError(
            'applicable_laws - pending_laws deve ser positivo (não é possível calcular RCI quando todas as leis estão pendentes)',
        );
    }

    const RCI = (compliant_laws / denominator) * 100;
    return { RCI: Math.min(100, RCI) };
}

/**
 * Calcula o Environmental Performance Rating (EPR) e atribui grau (A–E).
 *
 * EPR = conformity_pct × 0.4 + RCI × 0.4 + penalty_pct × 0.2
 * penalty_pct = max(0, 100 - corrective_actions_open × 5)
 *
 * Cada ação corretiva em aberto desconta 5 pontos da componente de ações corretivas.
 *
 * Graus: A ≥ 90 / B ≥ 75 / C ≥ 60 / D ≥ 45 / E < 45
 *
 * @param conformity_pct           - Score de conformidade (%)
 * @param RCI                      - Índice de conformidade regulatória (%)
 * @param corrective_actions_open  - Número de ações corretivas em aberto (≥ 0)
 * @returns Rating e grau
 * @throws {TypeError} se argumentos não forem números finitos
 * @throws {RangeError} se conformity_pct ou RCI fora de [0, 100]
 */
function _validateEnvironmentalPerformanceRating(
    conformity_pct: number,
    RCI: number,
    corrective_actions_open: number,
): void {
    if (
        typeof conformity_pct !== 'number' ||
        !isFinite(conformity_pct) ||
        typeof RCI !== 'number' ||
        !isFinite(RCI) ||
        typeof corrective_actions_open !== 'number' ||
        !isFinite(corrective_actions_open)
    ) {
        throw new TypeError('conformity_pct, RCI e corrective_actions_open devem ser números finitos');
    }
    if (conformity_pct < 0 || conformity_pct > 100) throw new RangeError('conformity_pct deve estar em [0, 100]');
    if (RCI < 0 || RCI > 100) throw new RangeError('RCI deve estar em [0, 100]');
    if (corrective_actions_open < 0) throw new RangeError('corrective_actions_open não pode ser negativo');
}

function _gradeFromEPR(EPR: number): string {
    if (EPR >= 90) return 'A';
    if (EPR >= 75) return 'B';
    if (EPR >= 60) return 'C';
    if (EPR >= 45) return 'D';
    return 'E';
}

export function computeEnvironmentalPerformanceRating(
    conformity_pct: number,
    RCI: number,
    corrective_actions_open: number,
): { EPR: number; grade: string } {
    _validateEnvironmentalPerformanceRating(conformity_pct, RCI, corrective_actions_open);

    const penalty_pct = Math.max(0, 100 - corrective_actions_open * 5);
    const EPR = conformity_pct * 0.4 + RCI * 0.4 + penalty_pct * 0.2;

    return { EPR, grade: _gradeFromEPR(EPR) };
}

/**
 * Classifica o resultado final da auditoria ambiental.
 *
 * Regras (em ordem de prioridade):
 *   certified   : EPR ≥ 75 AND critical_findings = 0
 *   conditional : EPR ≥ 60 AND critical_findings ≤ 2
 *   suspended   : EPR ≥ 40
 *   failed      : EPR < 40
 *
 * @param EPR              - Environmental Performance Rating (0–100)
 * @param critical_findings - Número de achados críticos (≥ 0)
 * @returns Resultado da auditoria
 * @throws {TypeError} se argumentos não forem números finitos
 * @throws {RangeError} se EPR fora de [0, 100] ou critical_findings < 0
 */
export function classifyAuditOutcome(EPR: number, critical_findings: number): { outcome: string } {
    if (typeof EPR !== 'number' || !isFinite(EPR)) throw new TypeError('EPR deve ser número finito');
    if (typeof critical_findings !== 'number' || !isFinite(critical_findings))
        throw new TypeError('critical_findings deve ser número finito');
    if (EPR < 0 || EPR > 100) throw new RangeError('EPR deve estar em [0, 100]');
    if (critical_findings < 0) throw new RangeError('critical_findings não pode ser negativo');

    let outcome: string;
    if (EPR >= 75 && critical_findings === 0) outcome = 'certified';
    else if (EPR >= 60 && critical_findings <= 2) outcome = 'conditional';
    else if (EPR >= 40) outcome = 'suspended';
    else outcome = 'failed';

    return { outcome };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const environmentalAuditScoreMeta: AnalyticsModuleMeta = {
    name: 'environmentalAuditScore',
    description: 'environmentalAuditScore',
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
