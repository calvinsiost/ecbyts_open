// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CETESB-RISK-001 Sub-5.2.1 — Bridge EIS T-axis ← Avaliação de Risco CETESB.
//
// Função pure-logic que retorna bônus 0..2 pontos para o eixo T (Transparency)
// do TCCCA+T quando o modelo demonstra cobertura de avaliação de risco CETESB.
//
// Justificativa: relatório com CMA computada para alta cobertura de SQIs
// demonstra rigor metodológico (CETESB DD 103/2007 + USEPA RAGS) — eleva
// integridade da decisão de remediação. T-axis recompensa essa transparência.
//
// Escala:
//   - ≥80% SQIs com CMA computada → +2,0 (cobertura completa)
//   - ≥50% SQIs com CMA computada →  +1,0 (cobertura parcial)
//   - <50% → 0 (insuficiente)
//
// Spec: docs/specs/features/SPEC_CETESB_RISK_ASSESSMENT.md ADR-A6
// ADR: docs/adrs/ADR-CETESB-RISK-001-eis-bonus.md (futuro)
//
// API pure: sem DOM, sem IO, sem Date.now (caller fornece dados).

export interface RiskCoverageInput {
    /** Total de SQIs (substâncias) declaradas no modelo. */
    totalSqis: number;
    /** Quantidade de SQIs com CMA computada com sucesso (ILCR + HQ + CMA finitos). */
    sqisWithCma: number;
    /** Opcional: cenário avaliado (apenas tracing). */
    scenarioId?: string;
}

export interface RiskAssessmentBonus {
    /** Bônus 0..2 a somar ao score do eixo T. */
    readonly bonus: number;
    /** Razão de cobertura 0..1 (sqisWithCma/totalSqis). */
    readonly coverage: number;
    /** Tier categórico para auditoria. */
    readonly tier: 'complete' | 'partial' | 'insufficient' | 'undefined';
    /** Justificativa human-readable para audit trail. */
    readonly rationale: string;
}

const TIER_COMPLETE_THRESHOLD = 0.8; // ≥80% → tier "complete"
const TIER_PARTIAL_THRESHOLD = 0.5; // ≥50% → tier "partial"
const BONUS_COMPLETE = 2.0;
const BONUS_PARTIAL = 1.0;
const BONUS_INSUFFICIENT = 0.0;

/**
 * Calcula bônus EIS T-axis com base na cobertura de avaliação de risco CETESB.
 *
 * Comportamento defensivo:
 *   - input null/undefined ou totalSqis<=0 → tier "undefined", bonus=0
 *   - sqisWithCma > totalSqis → clamp em 1.0 (defensivo contra dado inconsistente)
 *   - valores não-finitos → tier "undefined", bonus=0
 */
export function eisRiskAssessmentBonus(input: RiskCoverageInput | null | undefined): RiskAssessmentBonus {
    if (!input || typeof input !== 'object') {
        return Object.freeze({
            bonus: 0,
            coverage: 0,
            tier: 'undefined',
            rationale: 'Input ausente ou tipo inválido — bônus não aplicável.',
        });
    }
    const total = Number(input.totalSqis);
    const withCma = Number(input.sqisWithCma);

    if (!Number.isFinite(total) || total <= 0) {
        return Object.freeze({
            bonus: 0,
            coverage: 0,
            tier: 'undefined',
            rationale: 'Modelo sem SQIs declaradas — bônus não computável.',
        });
    }
    if (!Number.isFinite(withCma) || withCma < 0) {
        return Object.freeze({
            bonus: 0,
            coverage: 0,
            tier: 'undefined',
            rationale: 'Quantidade de SQIs com CMA inválida.',
        });
    }

    const coverage = Math.min(1.0, withCma / total);
    const pct = (coverage * 100).toFixed(1);

    if (coverage >= TIER_COMPLETE_THRESHOLD) {
        return Object.freeze({
            bonus: BONUS_COMPLETE,
            coverage,
            tier: 'complete',
            rationale: `Cobertura CMA ${pct}% (≥80%) — rigor metodológico CETESB DD 103/2007 + RAGS Part A. Bônus T-axis: +${BONUS_COMPLETE}.`,
        });
    }
    if (coverage >= TIER_PARTIAL_THRESHOLD) {
        return Object.freeze({
            bonus: BONUS_PARTIAL,
            coverage,
            tier: 'partial',
            rationale: `Cobertura CMA ${pct}% (50%–80%) — avaliação de risco parcial. Bônus T-axis: +${BONUS_PARTIAL}.`,
        });
    }
    return Object.freeze({
        bonus: BONUS_INSUFFICIENT,
        coverage,
        tier: 'insufficient',
        rationale: `Cobertura CMA ${pct}% (<50%) — avaliação de risco insuficiente para bônus T-axis.`,
    });
}

/** Constantes exportadas para reuso em testes e auditoria. */
export const RISK_BONUS_CONSTANTS = Object.freeze({
    TIER_COMPLETE_THRESHOLD,
    TIER_PARTIAL_THRESHOLD,
    BONUS_COMPLETE,
    BONUS_PARTIAL,
    BONUS_INSUFFICIENT,
});
