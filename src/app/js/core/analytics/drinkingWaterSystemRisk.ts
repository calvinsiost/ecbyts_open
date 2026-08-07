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
 * Drinking Water System Risk Assessment
 *
 * Avalia o risco em sistemas de abastecimento de água potável por etapa e barreira de controle.
 *
 * References:
 *   WHO (2009). Water Safety Plan Manual. Geneva: World Health Organization.
 *   ABNT NBR 12218:2017 - Projeto de rede de distribuição de água para abastecimento público.
 *   MS Portaria GM/MS 888/2021 - Parâmetros de potabilidade da água para consumo humano.
 *
 * @module drinkingWaterSystemRisk
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

// --- Constants ---

/**
 * Risk classification thresholds (WSP score, lower = better)
 * Limites de classificação de risco do WSP (menor pontuação = menor risco)
 */
const RISK_CLASSES = [
    { label: 'very_low', maxScore: 2 },
    { label: 'low', maxScore: 5 },
    { label: 'moderate', maxScore: 10 },
    { label: 'high', maxScore: 15 },
    { label: 'critical', maxScore: Infinity },
];

/**
 * Portaria 888/2021 potability limits for key parameters
 * Limites de potabilidade MS 888/2021 para parâmetros principais
 */
const POTABILITY_LIMITS = {
    turbidityNtu: { limit: 5, unit: 'NTU' },
    chlorineMgL: { min: 0.2, limit: 2.0, unit: 'mg/L' },
    ecoliPer100mL: { limit: 0, unit: 'UFC/100mL' },
    phMin: { min: 6.0, unit: '' },
    phMax: { max: 9.5, unit: '' },
};

// --- Helpers ---

/**
 * Validates a numeric value is finite and within optional bounds.
 * Valida se valor é finito e está dentro dos limites opcionais.
 */
function validateNum(v: number, name: string, min: number = -Infinity, max: number = Infinity): void {
    if (typeof v !== 'number' || !isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, got ${v}`);
    }
    if (v < min || v > max) {
        throw new RangeError(`${name} must be in [${min}, ${max}], got ${v}`);
    }
}

// --- Core exports ---

/**
 * Scores risk for a single water system stage (captação/tratamento/distribuição).
 * Pontua o risco de uma etapa do sistema hídrico.
 *
 * @param stage - stage descriptor
 * @returns stageScore, residualScore, riskClass
 */
export function scoreStageRisk({
    name,
    likelihood,
    severity,
    controlIndex,
}: {
    name: string;
    likelihood: number;
    severity: number;
    controlIndex: number;
}): { stageScore: number; residualScore: number; riskClass: string } {
    if (typeof name !== 'string' || !name) throw new TypeError('name must be a non-empty string');
    validateNum(likelihood, 'likelihood', 0, 5);
    validateNum(severity, 'severity', 0, 5);
    validateNum(controlIndex, 'controlIndex', 0, 1);

    // Gross risk = likelihood × severity (WHOApp 2009, cap. 4)
    // Risco bruto = probabilidade × severidade
    const stageScore = likelihood * severity;

    // Residual risk after control barriers applied
    // Risco residual após aplicação das barreiras de controle
    const residualScore = stageScore * (1 - controlIndex);

    const riskClass = RISK_CLASSES.find((rc) => residualScore <= rc.maxScore)?.label ?? 'critical';
    return { stageScore: +stageScore.toFixed(4), residualScore: +residualScore.toFixed(4), riskClass };
}

/**
 * Checks key water quality parameters against MS 888/2021 potability limits.
 * Verifica conformidade dos parâmetros-chave com os limites de potabilidade da Portaria 888/2021.
 *
 * @param params - potability parameters
 * @returns conformant and violations
 */
export function checkPotabilityCompliance({
    turbidityNtu,
    chlorineMgL,
    ecoliPer100mL,
    ph,
}: {
    turbidityNtu: number;
    chlorineMgL: number;
    ecoliPer100mL: number;
    ph: number;
}): { conformant: boolean; violations: string[] } {
    validateNum(turbidityNtu, 'turbidityNtu', 0);
    validateNum(chlorineMgL, 'chlorineMgL', 0);
    validateNum(ecoliPer100mL, 'ecoliPer100mL', 0);
    validateNum(ph, 'ph', 0, 14);

    const violations: string[] = [];
    if (turbidityNtu > POTABILITY_LIMITS.turbidityNtu.limit) {
        violations.push(`turbidity ${turbidityNtu} NTU exceeds limit ${POTABILITY_LIMITS.turbidityNtu.limit} NTU`);
    }
    if (chlorineMgL < POTABILITY_LIMITS.chlorineMgL.min || chlorineMgL > POTABILITY_LIMITS.chlorineMgL.limit) {
        violations.push(
            `chlorine ${chlorineMgL} mg/L outside [${POTABILITY_LIMITS.chlorineMgL.min}, ${POTABILITY_LIMITS.chlorineMgL.limit}] mg/L`,
        );
    }
    if (ecoliPer100mL > POTABILITY_LIMITS.ecoliPer100mL.limit) {
        violations.push(`E.coli ${ecoliPer100mL} UFC/100mL exceeds limit 0`);
    }
    if (ph < POTABILITY_LIMITS.phMin.min || ph > POTABILITY_LIMITS.phMax.max) {
        violations.push(`pH ${ph} outside [${POTABILITY_LIMITS.phMin.min}, ${POTABILITY_LIMITS.phMax.max}]`);
    }
    return { conformant: violations.length === 0, violations };
}

/**
 * Computes the composite Water Safety Plan (WSP) score for the whole system.
 * Calcula o índice composto de segurança hídrica (WSP score) para todo o sistema.
 *
 * The composite score is the weighted mean of residual stage scores.
 * A pontuação composta é a média ponderada dos riscos residuais por etapa.
 *
 * @param stages - array of scored stages with weights
 * @returns wspScore and riskClass
 */
export function computeWspScore(
    stages: Array<{ weight: number; residualScore: number }>,
): { wspScore: number; riskClass: string } {
    if (!Array.isArray(stages) || stages.length === 0) {
        throw new TypeError('stages must be a non-empty array');
    }
    let weightedSum = 0;
    let totalWeight = 0;
    for (const s of stages) {
        validateNum(s.weight, 'stage.weight', 0);
        validateNum(s.residualScore, 'stage.residualScore', 0);
        weightedSum += s.weight * s.residualScore;
        totalWeight += s.weight;
    }
    if (totalWeight === 0) throw new RangeError('total weight must be > 0');

    const wspScore = weightedSum / totalWeight;
    const riskClass = RISK_CLASSES.find((rc) => wspScore <= rc.maxScore)?.label ?? 'critical';
    return { wspScore: +wspScore.toFixed(4), riskClass };
}

/**
 * Runs a full WSP assessment combining stage risks and potability compliance.
 * Executa avaliação completa WSP combinando riscos por etapa e conformidade de potabilidade.
 *
 * @param opts - stages and waterQuality
 * @returns stageResults, potability, wspScore, riskClass
 */
export function runWspAssessment({
    stages,
    waterQuality,
}: {
    stages: Array<{ name: string; likelihood: number; severity: number; controlIndex: number; weight?: number }>;
    waterQuality: { turbidityNtu: number; chlorineMgL: number; ecoliPer100mL: number; ph: number };
}): { stageResults: object[]; potability: object; wspScore: number; riskClass: string } {
    if (!Array.isArray(stages) || stages.length === 0) {
        throw new TypeError('stages must be a non-empty array');
    }
    if (!waterQuality || typeof waterQuality !== 'object') {
        throw new TypeError('waterQuality must be an object');
    }

    const stageResults = stages.map((s) => ({
        name: s.name,
        ...scoreStageRisk(s),
        weight: s.weight ?? 1,
    }));

    const potability = checkPotabilityCompliance(waterQuality);

    // If potability violations exist, boost WSP score by penalty
    // Se há violações de potabilidade, penaliza o índice WSP
    const qualityPenalty = potability.violations.length * 2;

    // eslint-disable-next-line
    const { wspScore: baseScore, riskClass } = computeWspScore(
        stageResults.map((s) => ({ weight: s.weight, residualScore: s.residualScore })),
    );
    const wspScore = +(baseScore + qualityPenalty).toFixed(4);
    const finalRiskClass = RISK_CLASSES.find((rc) => wspScore <= rc.maxScore)?.label ?? 'critical';

    return { stageResults, potability, wspScore, riskClass: finalRiskClass };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const drinkingWaterSystemRiskMeta: AnalyticsModuleMeta = {
    name: 'drinkingWaterSystemRisk',
    description: 'drinkingWaterSystemRisk',
    category: 'analytics',
    familyTags: ['water', 'risk'],
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
