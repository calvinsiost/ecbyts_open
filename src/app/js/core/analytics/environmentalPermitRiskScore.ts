// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
'use strict';

import type { Action } from '../actionPlan/_actionPlanPure';

/**
 * Environmental Permit Risk Score (Score de Risco de Licença Ambiental)
 *
 * References / Referências:
 *   - CONAMA 237/1997 - Regulamenta o licenciamento ambiental no Brasil
 *   - Lei 6.938/1981 - Política Nacional do Meio Ambiente
 *   - SEMA 2022 - Instrução Normativa sobre porte e potencial poluidor
 *
 * Pure math module - zero DOM/IDB/Three.js/fetch dependencies.
 * Módulo matemático puro - sem dependências de DOM/IDB/Three.js/fetch.
 *
 * @module environmentalPermitRiskScore
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

interface PxPPCategory {
    product: number;
    category: string;
    licenseLevel: string;
}

interface ConditionantsResult {
    complianceRatio: number;
    pendingScore: number;
    riskContribution: number;
    excludedNA: number;
}

/** Aggregated inputs for {@link scoreConditionants}, pre-filtered by applicability. */
interface AggregatedConditionants {
    total: number;
    complied: number;
    partial: number;
    excludedNA: number;
}

interface MonitoringResult {
    submissionRate: number;
    approvalRate: number;
    monitoringIndex: number;
    riskContribution: number;
}

interface SuspensionResult {
    infractionScore: number;
    tacScore: number;
    recencyFactor: number;
    suspensionRisk: number;
}

/**
 * Porte do empreendimento (enterprise size) per CONAMA 237/1997 Annex.
 * Escala numérica para cálculo de P×PP.
 */
export const ENTERPRISE_SIZE = Object.freeze({
    micro: 1, // Microempreendimento
    small: 2, // Pequeno porte
    medium: 3, // Médio porte
    large: 4, // Grande porte
    exceptional: 5, // Excepcional porte
});

/**
 * Potencial poluidor/degradador (polluting potential) per CONAMA 237/1997.
 * Escala numérica para cálculo de P×PP.
 */
export const POLLUTING_POTENTIAL = Object.freeze({
    low: 1, // Baixo potencial poluidor
    medium: 2, // Médio potencial poluidor
    high: 3, // Alto potencial poluidor
});

/**
 * Thresholds for P×PP product categorization.
 * Limites de categorização do produto porte × potencial poluidor.
 */
const PPP_THRESHOLDS = Object.freeze({
    localImpact: 4, // P×PP ≤ 4 → impacto local (licença municipal)
    regionalImpact: 9, // 4 < P×PP ≤ 9 → impacto regional (licença estadual)
    // P×PP > 9 → impacto regional/nacional significativo
});

/**
 * Categorize enterprise by size × polluting potential (P×PP).
 * Categoriza empreendimento pelo produto porte × potencial poluidor.
 *
 * @param size - Enterprise size score (1–5, use ENTERPRISE_SIZE enum)
 * @param pollutingPotential - Polluting potential score (1–3, use POLLUTING_POTENTIAL enum)
 * @returns Product, category and license level.
 * @throws {RangeError} If size or pollutingPotential are out of valid range
 */
export function categorizePxPP(size: number, pollutingPotential: number): PxPPCategory {
    if (!Number.isFinite(size) || size < 1 || size > 5) {
        throw new RangeError(`size must be 1–5, got: ${size}`);
    }
    if (!Number.isFinite(pollutingPotential) || pollutingPotential < 1 || pollutingPotential > 3) {
        throw new RangeError(`pollutingPotential must be 1–3, got: ${pollutingPotential}`);
    }

    const product = size * pollutingPotential;

    // Classificação por produto P×PP conforme CONAMA 237/1997
    let category: string, licenseLevel: string;
    if (product <= PPP_THRESHOLDS.localImpact) {
        category = 'local_impact';
        licenseLevel = 'municipal';
    } else if (product <= PPP_THRESHOLDS.regionalImpact) {
        category = 'regional_impact';
        licenseLevel = 'state';
    } else {
        category = 'significant_regional_national_impact';
        licenseLevel = 'state_federal';
    }

    return { product, category, licenseLevel };
}

/**
 * Score pending conditionants (score de condicionantes pendentes).
 * Pontuação baseada em percentual de condicionantes cumpridas vs. total.
 *
 * `totalConditions`/`compliedConditions`/`partialConditions` já devem vir
 * PRÉ-FILTRADOS por applicability (ver {@link aggregateConditionantsForScore}):
 * esta função permanece agnóstica de `Action`/`applicability` para não quebrar
 * consumidores existentes que já agregam os números por conta própria.
 *
 * @param totalConditions - Total number of license conditions (> 0), já excluindo NA
 * @param compliedConditions - Number of conditions fully complied
 * @param partialConditions - Number of conditions partially complied
 * @param excludedNA - Count of conditions excluded for transparency (ENV-CONDITIONS-001 A6, default 0)
 * @returns Compliance ratio, pending score, risk contribution and excludedNA passthrough.
 * @throws {RangeError} If inputs are invalid
 * @throws {TypeError} If inputs are not finite numbers
 */
export function scoreConditionants(
    totalConditions: number,
    compliedConditions: number,
    partialConditions: number,
    excludedNA = 0,
): ConditionantsResult {
    if (
        !Number.isFinite(totalConditions) ||
        !Number.isFinite(compliedConditions) ||
        !Number.isFinite(partialConditions) ||
        !Number.isFinite(excludedNA)
    ) {
        throw new TypeError('All inputs must be finite numbers');
    }
    if (totalConditions <= 0) {
        throw new RangeError(`totalConditions must be > 0, got: ${totalConditions}`);
    }
    if (compliedConditions < 0 || partialConditions < 0 || excludedNA < 0) {
        throw new RangeError('compliedConditions, partialConditions and excludedNA must be >= 0');
    }
    if (compliedConditions + partialConditions > totalConditions) {
        throw new RangeError('Sum of complied + partial cannot exceed totalConditions');
    }

    // Razão de conformidade: cumpridas vale 1.0, parciais valem 0.5
    // Compliance ratio: full compliance = 1.0, partial = 0.5 weight
    const complianceRatio = (compliedConditions + 0.5 * partialConditions) / totalConditions;

    // Score de pendência: 0 = sem pendências, 1 = tudo pendente
    const pendingScore = 1 - complianceRatio;

    // Contribuição ao risco (0–30 pontos): pendências elevam o risco
    const riskContribution = pendingScore * 30;

    return { complianceRatio, pendingScore, riskContribution, excludedNA };
}

/**
 * Aggregate Actions (condicionantes) into scoreConditionants inputs, excluding
 * non-applicable/suspended ones from total/complied/partial (ENV-CONDITIONS-001
 * A6, spec §5 item 3): NA/suspensa não conta no denominador do score, mas
 * permanece visível via `excludedNA` — nunca é descartada silenciosamente.
 *
 * @param actions - Condicionantes (Action com originType='permitCondition')
 * @returns Aggregated total/complied/partial (only applicable) plus excludedNA count.
 */
export function aggregateConditionantsForScore(
    actions: readonly Pick<Action, 'applicability' | 'status'>[],
): AggregatedConditionants {
    let total = 0;
    let complied = 0;
    let partial = 0;
    let excludedNA = 0;

    for (const action of actions) {
        // Default 'aplicavel' quando ausente (mesma regra de _actionPlanPure.ts normalizeApplicability)
        const applicability = action.applicability ?? 'aplicavel';
        if (applicability !== 'aplicavel') {
            excludedNA += 1;
            continue;
        }
        total += 1;
        if (action.status === 'verificada' || action.status === 'concluida') {
            complied += 1;
        } else if (action.status === 'pendente_verificacao' || action.status === 'em_andamento') {
            partial += 1;
        }
    }

    return { total, complied, partial, excludedNA };
}

/**
 * Monitoring compliance index (índice de conformidade de monitoramento).
 * Avalia a regularidade do monitoramento ambiental exigido pela licença.
 *
 * @param requiredReports - Number of monitoring reports required per period
 * @param submittedReports - Number of reports actually submitted
 * @param approvedReports - Number of reports approved by the regulator
 * @returns Submission/approval rates, monitoring index and risk contribution.
 * @throws {RangeError} If inputs are invalid
 * @throws {TypeError} If inputs are not finite numbers
 */
export function monitoringComplianceIndex(
    requiredReports: number,
    submittedReports: number,
    approvedReports: number,
): MonitoringResult {
    if (!Number.isFinite(requiredReports) || !Number.isFinite(submittedReports) || !Number.isFinite(approvedReports)) {
        throw new TypeError('All inputs must be finite numbers');
    }
    if (requiredReports <= 0) {
        throw new RangeError(`requiredReports must be > 0, got: ${requiredReports}`);
    }
    if (submittedReports < 0 || approvedReports < 0) {
        throw new RangeError('submittedReports and approvedReports must be >= 0');
    }
    if (approvedReports > submittedReports) {
        throw new RangeError('approvedReports cannot exceed submittedReports');
    }
    if (submittedReports > requiredReports) {
        throw new RangeError('submittedReports cannot exceed requiredReports');
    }

    // Taxa de submissão: relatórios entregues vs. exigidos
    const submissionRate = submittedReports / requiredReports;

    // Taxa de aprovação: aprovados vs. submetidos (evitar divisão por zero)
    const approvalRate = submittedReports > 0 ? approvedReports / submittedReports : 0;

    // Índice composto de monitoramento (0 = nenhum, 1 = perfeito)
    const monitoringIndex = submissionRate * approvalRate;

    // Contribuição ao risco (0–25 pontos): baixo monitoramento eleva o risco
    const riskContribution = (1 - monitoringIndex) * 25;

    return { submissionRate, approvalRate, monitoringIndex, riskContribution };
}

/**
 * Suspension/cancellation risk score (risco de suspensão ou cancelamento da licença).
 * Baseado em infrações registradas, autos de infração e TACs vigentes.
 *
 * @param infractions - Number of registered infractions (autuações IBAMA/CETESB)
 * @param activeTACs - Number of active TACs (Termos de Ajustamento de Conduta)
 * @param daysSinceLastInfraction - Days since last registered infraction (0 if no infractions)
 * @returns Infraction/TAC scores, recency factor and suspension risk.
 * @throws {RangeError} If inputs are out of range
 * @throws {TypeError} If inputs are not finite numbers
 */
export function suspensionRisk(
    infractions: number,
    activeTACs: number,
    daysSinceLastInfraction: number,
): SuspensionResult {
    if (!Number.isFinite(infractions) || !Number.isFinite(activeTACs) || !Number.isFinite(daysSinceLastInfraction)) {
        throw new TypeError('All inputs must be finite numbers');
    }
    if (infractions < 0 || activeTACs < 0 || daysSinceLastInfraction < 0) {
        throw new RangeError('All inputs must be >= 0');
    }

    // Score de infrações: escala logarítmica para evitar dominância de casos extremos
    // Infraction score: logarithmic scale to prevent extreme case dominance
    const infractionScore = infractions > 0 ? Math.min(1, Math.log1p(infractions) / Math.log1p(10)) : 0;

    // Score de TACs ativos: cada TAC aumenta o risco (cap em 5 TACs)
    const tacScore = Math.min(1, activeTACs / 5);

    // Fator de recência: infrações recentes (<365 dias) amplificam o risco
    // Recency factor: recent infractions (<365 days) amplify risk
    const recencyFactor = infractions > 0 ? Math.max(0, 1 - daysSinceLastInfraction / 365) : 0;

    // Risco de suspensão composto (0–25 pontos)
    const suspensionRisk = (infractionScore * 0.5 + tacScore * 0.3 + recencyFactor * 0.2) * 25;

    return { infractionScore, tacScore, recencyFactor, suspensionRisk };
}

/**
 * Composite Environmental Regularity Score (Score de Regularidade Ambiental).
 * Agrega os quatro componentes em um score final de 0–100.
 * Score 100 = máxima conformidade; 0 = alto risco de suspensão/cancelamento.
 *
 * @param params.size - Enterprise size (1–5)
 * @param params.pollutingPotential - Polluting potential (1–3)
 * @param params.totalConditions - Total license conditions
 * @param params.compliedConditions - Complied conditions
 * @param params.partialConditions - Partially complied conditions
 * @param params.requiredReports - Required monitoring reports
 * @param params.submittedReports - Submitted monitoring reports
 * @param params.approvedReports - Approved monitoring reports
 * @param params.infractions - Registered infractions count
 * @param params.activeTACs - Active TACs count
 * @param params.daysSinceLastInfraction - Days since last infraction
 * @returns Aggregated regularity score with component breakdown.
 */
export function computeRegularityScore({
    size,
    pollutingPotential,
    totalConditions,
    compliedConditions,
    partialConditions,
    requiredReports,
    submittedReports,
    approvedReports,
    infractions,
    activeTACs,
    daysSinceLastInfraction,
}: {
    size: number;
    pollutingPotential: number;
    totalConditions: number;
    compliedConditions: number;
    partialConditions: number;
    requiredReports: number;
    submittedReports: number;
    approvedReports: number;
    infractions: number;
    activeTACs: number;
    daysSinceLastInfraction: number;
}): {
    pxppCategory: PxPPCategory;
    conditionantsResult: ConditionantsResult;
    monitoringResult: MonitoringResult;
    suspensionResult: SuspensionResult;
    rawRisk: number;
    regularityScore: number;
    riskLevel: string;
} {
    const pxppCategory = categorizePxPP(size, pollutingPotential);

    // Fator multiplicador baseado no produto P×PP: empreendimentos maiores têm risco base maior
    // Base risk multiplier from P×PP: larger/more polluting enterprises carry inherently higher risk
    const pxppMultiplier = 1 + (pxppCategory.product - 1) / 14; // normalizado para 1.0–2.07

    const conditionantsResult = scoreConditionants(totalConditions, compliedConditions, partialConditions);
    const monitoringResult = monitoringComplianceIndex(requiredReports, submittedReports, approvedReports);
    const suspensionResult = suspensionRisk(infractions, activeTACs, daysSinceLastInfraction);

    // Risco bruto ponderado (0–80 pontos base, ajustado por P×PP)
    const rawRisk =
        (conditionantsResult.riskContribution + monitoringResult.riskContribution + suspensionResult.suspensionRisk) *
        pxppMultiplier;

    // Score de regularidade: inverte e normaliza para 0–100
    const regularityScore = Math.max(0, Math.min(100, 100 - rawRisk));

    // Classificação de risco por score
    let riskLevel: string;
    if (regularityScore >= 80) riskLevel = 'low';
    else if (regularityScore >= 60) riskLevel = 'moderate';
    else if (regularityScore >= 40) riskLevel = 'high';
    else riskLevel = 'critical';

    return {
        pxppCategory,
        conditionantsResult,
        monitoringResult,
        suspensionResult,
        rawRisk,
        regularityScore,
        riskLevel,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const environmentalPermitRiskScoreMeta: AnalyticsModuleMeta = {
    name: 'environmentalPermitRiskScore',
    description: 'environmentalPermitRiskScore',
    category: 'analytics',
    familyTags: ['risk'],
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
