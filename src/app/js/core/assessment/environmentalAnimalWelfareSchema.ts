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
 * Environmental Animal Welfare Schema - Schema de bem-estar animal em
 * impacto ambiental e licenciamento.
 *
 * Avalia o bem-estar de fauna afetada por intervenções ambientais (obras
 * civis, mineração, remediação, manejo de áreas contaminadas) através do
 * framework das Cinco Liberdades de Brambell (1965) - depois operacionalizado
 * pela WOAH/OIE Terrestrial Animal Health Code, EU Directive 2010/63 e EFSA
 * Welfare Quality (2009).
 *
 * Referências regulatórias e científicas:
 *  - Brambell, F.W.R. (1965). Report of the Technical Committee to Enquire
 *    into the Welfare of Animals kept under Intensive Livestock Husbandry
 *    Systems. HMSO, London. (Five Freedoms framework)
 *  - World Organisation for Animal Health (WOAH/OIE). Terrestrial Animal
 *    Health Code, Section 7 - Animal Welfare. Latest edition.
 *  - European Union Directive 2010/63/EU on the protection of animals used
 *    for scientific purposes. Official Journal L 276/33.
 *  - Welfare Quality (2009). Welfare Quality assessment protocols. The
 *    Welfare Quality Consortium, Lelystad, Netherlands.
 *  - Brasil - Lei nº 9.605/1998 (Lei de Crimes Ambientais), art. 29-37
 *    (crimes contra a fauna).
 *  - Brasil - CONAMA Resolução 369/2006 (intervenção em APP, fauna).
 *  - IBAMA - IN nº 25/2009 (manejo de fauna em empreendimentos licenciados).
 *  - ABNT NBR ISO 14001:2015 (sistema de gestão ambiental, aspecto fauna).
 *  - Mellor, D.J. (2016). Updating Animal Welfare Thinking: Moving beyond
 *    the "Five Freedoms" towards "A Life Worth Living". Animals, 6(3), 21.
 *    DOI: 10.3390/ani6030021
 *
 * Zero dependências DOM/IDB/Three.js/fetch. Pure-logic.
 * @module environmentalAnimalWelfareSchema
 */

/** Cinco dimensões canônicas (Brambell 1965 + Mellor 2016 mental state). */
export const WELFARE_DIMENSION = Object.freeze({
    NUTRITION: 'NUTRITION',
    ENVIRONMENT: 'ENVIRONMENT',
    HEALTH: 'HEALTH',
    BEHAVIOR: 'BEHAVIOR',
    MENTAL_STATE: 'MENTAL_STATE',
});

/** Tipos de intervenção aplicáveis em fauna afetada. */
export const INTERVENTION_TYPE = Object.freeze({
    HABITAT_RESTORATION: 'HABITAT_RESTORATION',
    CAPTURE_RELEASE: 'CAPTURE_RELEASE',
    TRANSLOCATION: 'TRANSLOCATION',
    SANCTUARY_CARE: 'SANCTUARY_CARE',
    EUTHANASIA_HUMANE: 'EUTHANASIA_HUMANE',
    MONITORING_ONLY: 'MONITORING_ONLY',
});

/** Outcome categórico baseado em compositeScore. */
export const WELFARE_OUTCOME = Object.freeze({
    SEVERELY_COMPROMISED: 'SEVERELY_COMPROMISED',
    COMPROMISED: 'COMPROMISED',
    ADEQUATE: 'ADEQUATE',
    GOOD: 'GOOD',
    EXCELLENT: 'EXCELLENT',
});

/** Severidade do impacto ambiental sobre populações animais. */
export const IMPACT_SEVERITY = Object.freeze({
    NONE: 'NONE',
    MINOR: 'MINOR',
    MODERATE: 'MODERATE',
    MAJOR: 'MAJOR',
    CRITICAL: 'CRITICAL',
});

/** Códigos de erro emitidos pelo schema. */
export const WELFARE_ERROR = Object.freeze({
    INVALID_RECORD: 'INVALID_RECORD',
    INVALID_SCORE: 'INVALID_SCORE',
    INVALID_INTERVENTION: 'INVALID_INTERVENTION',
});

/**
 * Pesos das dimensões (soma 1.0). Calibrados a partir de Welfare Quality
 * (2009) e adaptados para fauna afetada por impacto ambiental, com peso
 * maior em ENVIRONMENT (impacto direto do empreendimento) e HEALTH.
 */
export const DIMENSION_WEIGHTS = Object.freeze({
    NUTRITION: 0.2,
    ENVIRONMENT: 0.25,
    HEALTH: 0.25,
    BEHAVIOR: 0.15,
    MENTAL_STATE: 0.15,
});

/** Limiares de classificação outcome (limite SUPERIOR exclusivo de cada faixa). */
export const OUTCOME_THRESHOLDS = Object.freeze({
    SEVERELY_COMPROMISED: 20,
    COMPROMISED: 40,
    ADEQUATE: 60,
    GOOD: 80,
});

/**
 * Custos médios estimados em BRL por intervenção (referências: relatórios
 * IBAMA de manejo de fauna em empreendimentos licenciados, 2018-2024).
 * Valores ilustrativos - usar contratos específicos em produção.
 */
export const INTERVENTION_COST_BRL = Object.freeze({
    HABITAT_RESTORATION: 50000,
    CAPTURE_RELEASE: 8000,
    TRANSLOCATION: 25000,
    SANCTUARY_CARE: 80000,
    EUTHANASIA_HUMANE: 1500,
    MONITORING_ONLY: 3000,
});

/** Score mínimo considerado aprovação ambiental (CONAMA prática). */
export const MIN_PASSING_SCORE = 60;

/** Identidade do módulo. */
export const ANIMAL_WELFARE_META = Object.freeze({
    spec: 'ANIMAL_WELFARE_SCHEMA_001',
    deliveredAt: '2026-05-01',
    framework: 'Brambell-Mellor-WelfareQuality',
    dimensions: Object.values(WELFARE_DIMENSION),
});

/** Erro tipado lançado pelo schema. */
export class WelfareError extends Error {
    code: string;
    /**
     * @param {string} code
     * @param {string} [message?]
     */
    constructor(code: string, message?: string) {
        super(message || code);
        this.name = 'WelfareError';
        this.code = code;
    }
}

interface WelfareAssessment {
    recordId: string;
    speciesName: string;
    populationCount: number;
    dimensionScores: Readonly<Record<string, number>>;
    intervention: string;
    compositeScore: number;
    outcome: string;
    interventionCostBRL: number;
    passing: boolean;
}

interface WelfareReport {
    totalRecords: number;
    totalPopulation: number;
    weightedScore: number;
    outcomeBreakdown: Readonly<Record<string, number>>;
    interventionCostTotalBRL: number;
    atRiskCount: number;
    dimensionAverages: Readonly<Record<string, number>>;
}

/** Verifica se valor é um inteiro/float finito não-negativo.
 * @param {unknown} v @returns {v is number}
 */
function isNonNegativeFinite(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/** Verifica score de dimensão em [0,100].
 * @param {unknown} v @returns {v is number}
 */
function isValidDimensionScore(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
}

/**
 * Classifica score numérico [0,100] em outcome categórico.
 * Limites estritos: <20 SEVERELY, <40 COMPROMISED, <60 ADEQUATE,
 * <80 GOOD, >=80 EXCELLENT.
 *
 * @param {number} score
 * @returns {string} valor de WELFARE_OUTCOME
 */
export function classifyOutcome(score: number): string {
    if (typeof score !== 'number' || !Number.isFinite(score)) {
        throw new WelfareError(WELFARE_ERROR.INVALID_SCORE, 'score must be finite number');
    }
    if (score < OUTCOME_THRESHOLDS.SEVERELY_COMPROMISED) return WELFARE_OUTCOME.SEVERELY_COMPROMISED;
    if (score < OUTCOME_THRESHOLDS.COMPROMISED) return WELFARE_OUTCOME.COMPROMISED;
    if (score < OUTCOME_THRESHOLDS.ADEQUATE) return WELFARE_OUTCOME.ADEQUATE;
    if (score < OUTCOME_THRESHOLDS.GOOD) return WELFARE_OUTCOME.GOOD;
    return WELFARE_OUTCOME.EXCELLENT;
}

/**
 * Cria um registro frozen de avaliação de bem-estar animal.
 *
 * Cada dimensão ausente em dimensionScores recebe default neutro 50.
 * Composite score = sum(weight[dim] * score[dim]) clamp [0,100].
 *
 * @param {Object} [input]
 * @param {string} [input.recordId] identificador único
 * @param {string} [input.speciesName] nome científico ou comum
 * @param {number} [input.populationCount] indivíduos avaliados (>=0)
 * @param {Record<string, number>} [input.dimensionScores] map WELFARE_DIMENSION para [0,100]
 * @param {string} [input.intervention] tipo aplicado (default MONITORING_ONLY)
 * @returns {Readonly<WelfareAssessment>} frozen welfare assessment
 */
export function createWelfareAssessment({
    recordId,
    speciesName,
    populationCount,
    dimensionScores,
    intervention = INTERVENTION_TYPE.MONITORING_ONLY,
}: {
    recordId?: string;
    speciesName?: string;
    populationCount?: number;
    dimensionScores?: Record<string, number>;
    intervention?: string;
} = {}) {
    if (typeof recordId !== 'string' || recordId.trim().length === 0) {
        throw new WelfareError(WELFARE_ERROR.INVALID_RECORD, 'recordId must be non-empty string');
    }
    if (typeof speciesName !== 'string' || speciesName.trim().length === 0) {
        throw new WelfareError(WELFARE_ERROR.INVALID_RECORD, 'speciesName must be non-empty string');
    }
    if (!isNonNegativeFinite(populationCount)) {
        throw new WelfareError(WELFARE_ERROR.INVALID_RECORD, 'populationCount must be >= 0');
    }
    if (!dimensionScores || typeof dimensionScores !== 'object') {
        throw new WelfareError(WELFARE_ERROR.INVALID_SCORE, 'dimensionScores must be object');
    }
    if (!((Object.values(INTERVENTION_TYPE) as string[]).includes(intervention))) {
        throw new WelfareError(WELFARE_ERROR.INVALID_INTERVENTION, `unknown intervention: ${intervention}`);
    }

    // Resolve scores: missing dimensions default to 50; reject explicit invalid values.
        const resolvedScores: Record<string, number>= {};
        const scoresInput: Record<string, number>= (dimensionScores as Record<string, number>);
    for (const dim of Object.values(WELFARE_DIMENSION)) {
        if (Object.prototype.hasOwnProperty.call(scoresInput, dim)) {
            const raw = scoresInput[dim];
            if (!isValidDimensionScore(raw)) {
                throw new WelfareError(WELFARE_ERROR.INVALID_SCORE, `dimensionScores.${dim} must be number in [0,100]`);
            }
            resolvedScores[dim] = raw;
        } else {
            resolvedScores[dim] = 50; // neutral default
        }
    }

    // Weighted composite. Sum of weights = 1.0 → result already in [0,100].
        const dimWeights: Record<string, number>= (DIMENSION_WEIGHTS as Record<string, number>);
    let composite = 0;
    for (const dim of Object.values(WELFARE_DIMENSION)) {
        composite += (dimWeights[dim] || 0) * (resolvedScores[dim] || 0);
    }
    const compositeScore = Math.max(0, Math.min(100, composite));
    const outcome = classifyOutcome(compositeScore);
        const costMap: Record<string, number>= (INTERVENTION_COST_BRL as Record<string, number>);
    const interventionCostBRL = costMap[intervention];

    return Object.freeze({
        recordId,
        speciesName,
        populationCount,
        dimensionScores: Object.freeze({ ...resolvedScores }),
        intervention,
        compositeScore,
        outcome,
        interventionCostBRL,
        passing: compositeScore >= MIN_PASSING_SCORE,
    });
}

/**
 * Calcula score médio ponderado pela população (compositeScore × populationCount).
 * Retorna 0 quando lista vazia ou população total = 0.
 *
 * @param {Array<Partial<WelfareAssessment>>} records saídas de createWelfareAssessment
 * @returns {number} weighted mean in [0,100]
 */
export function computePopulationWeightedScore(records: Array<Partial<WelfareAssessment>>): number {
    if (!Array.isArray(records) || records.length === 0) return 0;
    let totalPop = 0;
    let weightedSum = 0;
    for (const r of records) {
        if (!r || typeof r !== 'object') continue;
        const pop = r.populationCount;
        const score = r.compositeScore;
        if (!isNonNegativeFinite(pop) || !isValidDimensionScore(score)) continue;
        totalPop += pop;
        weightedSum += pop * score;
    }
    if (totalPop === 0) return 0;
    return weightedSum / totalPop;
}

/**
 * Filtra registros em risco (SEVERELY_COMPROMISED ou COMPROMISED) e ordena
 * ascendentemente por compositeScore (pior → melhor).
 *
 * @param {Array<Partial<WelfareAssessment>>} records
 * @returns {Array<Partial<WelfareAssessment>>} subset ordenado
 */
export function identifyAtRiskRecords(records: Array<Partial<WelfareAssessment>>): Array<Partial<WelfareAssessment>> {
    if (!Array.isArray(records)) return [];
    const atRisk = records.filter(
        (r) =>
            r &&
            typeof r === 'object' &&
            (r.outcome === WELFARE_OUTCOME.SEVERELY_COMPROMISED || r.outcome === WELFARE_OUTCOME.COMPROMISED),
    );
    return atRisk.slice().sort((a, b) => (a.compositeScore || 0) - (b.compositeScore || 0));
}

/**
 * Constrói relatório agregado frozen sobre um conjunto de avaliações.
 *
 * @param {Array<Partial<WelfareAssessment>>} records
 * @returns {Readonly<WelfareReport>} frozen report
 */
export function buildWelfareReport(records: Array<Partial<WelfareAssessment>>): Readonly<WelfareReport> {
        const safe: Array<Partial<WelfareAssessment>>= Array.isArray(records) ? records.filter((r) => r && typeof r === 'object') : [];
    const totalRecords = safe.length;
    let totalPopulation = 0;
    let totalInterventionCost = 0;
        const outcomeBreakdown: Record<string, number>= {
        [WELFARE_OUTCOME.SEVERELY_COMPROMISED]: 0,
        [WELFARE_OUTCOME.COMPROMISED]: 0,
        [WELFARE_OUTCOME.ADEQUATE]: 0,
        [WELFARE_OUTCOME.GOOD]: 0,
        [WELFARE_OUTCOME.EXCELLENT]: 0,
    };
        const dimSums: Record<string, number>= {};
        const dimCounts: Record<string, number>= {};
    for (const dim of Object.values(WELFARE_DIMENSION)) {
        dimSums[dim] = 0;
        dimCounts[dim] = 0;
    }

    for (const r of safe) {
        if (isNonNegativeFinite(r.populationCount)) totalPopulation += r.populationCount;
        if (isNonNegativeFinite(r.interventionCostBRL)) totalInterventionCost += r.interventionCostBRL;
        if (r.outcome && outcomeBreakdown[r.outcome] !== undefined) {
            outcomeBreakdown[r.outcome] = (outcomeBreakdown[r.outcome] || 0) + 1;
        }
        if (r.dimensionScores && typeof r.dimensionScores === 'object') {
                        const scoresMap: Record<string, number>= (r.dimensionScores as Record<string, number>);
            for (const dim of Object.values(WELFARE_DIMENSION)) {
                const v = scoresMap[dim];
                if (isValidDimensionScore(v)) {
                    dimSums[dim] = (dimSums[dim] || 0) + v;
                    dimCounts[dim] = (dimCounts[dim] || 0) + 1;
                }
            }
        }
    }

        const dimensionAverages: Record<string, number>= {};
    for (const dim of Object.values(WELFARE_DIMENSION)) {
        const count = dimCounts[dim] || 0;
        const sum = dimSums[dim] || 0;
        dimensionAverages[dim] = count > 0 ? sum / count : 0;
    }
    const atRiskCount = identifyAtRiskRecords(safe).length;
    const weightedScore = computePopulationWeightedScore(safe);

    return Object.freeze({
        totalRecords,
        totalPopulation,
        weightedScore,
        outcomeBreakdown: Object.freeze({ ...outcomeBreakdown }),
        interventionCostTotalBRL: totalInterventionCost,
        atRiskCount,
        dimensionAverages: Object.freeze({ ...dimensionAverages }),
    });
}
