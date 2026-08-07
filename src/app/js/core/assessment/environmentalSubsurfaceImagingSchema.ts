// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Environmental Subsurface Imaging Schema - ECBT
 *
 * Pure-logic factories and validators for subsurface imaging and geophysical
 * surveys. Esquema canônico para métodos geofísicos, objetivos de levantamento,
 * faixas de profundidade, classes de resolução e métricas de qualidade de dados.
 *
 * Domain references (used as factual/normative basis only - no code copied):
 * - ASTM D6429-21 - Standard Guide for Selecting Surface Geophysical Methods
 * - SEG / EAGE - Society of Exploration Geophysicists best practices
 * - ABNT NBR 13133 - Execução de levantamento topográfico
 * - ABNT NBR 9603 - Sondagem a trado (soil exploration support)
 * - INPE - Reference frames for remote sensing integration
 *
 * Constraints:
 * - Zero DOM, zero browser APIs, zero external imports
 * - All enums frozen via Object.freeze
 * - All record factories return Object.freeze
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const GEOPHYSICAL_METHOD = Object.freeze({
    ELECTRICAL_RESISTIVITY_2D: 'ELECTRICAL_RESISTIVITY_2D',
    ELECTRICAL_RESISTIVITY_3D: 'ELECTRICAL_RESISTIVITY_3D',
    INDUCED_POLARIZATION: 'INDUCED_POLARIZATION',
    GROUND_PENETRATING_RADAR: 'GROUND_PENETRATING_RADAR',
    SEISMIC_REFRACTION: 'SEISMIC_REFRACTION',
    SEISMIC_REFLECTION: 'SEISMIC_REFLECTION',
    MAGNETIC_GRADIOMETRY: 'MAGNETIC_GRADIOMETRY',
    GRAVITY: 'GRAVITY',
    EM_INDUCTION: 'EM_INDUCTION',
    MICROGRAVITY: 'MICROGRAVITY',
});

export const SURVEY_OBJECTIVE = Object.freeze({
    AQUIFER_MAPPING: 'AQUIFER_MAPPING',
    CONTAMINANT_PLUME_DETECTION: 'CONTAMINANT_PLUME_DETECTION',
    BEDROCK_DEPTH: 'BEDROCK_DEPTH',
    KARST_DETECTION: 'KARST_DETECTION',
    BURIED_TANKS_LOCATION: 'BURIED_TANKS_LOCATION',
    FAULT_DETECTION: 'FAULT_DETECTION',
    ARCHAEOLOGICAL_FEATURES: 'ARCHAEOLOGICAL_FEATURES',
    MINERAL_EXPLORATION: 'MINERAL_EXPLORATION',
});

export const RESOLUTION_CLASS = Object.freeze({
    HIGH_DECIMETRIC: 'HIGH_DECIMETRIC',
    MEDIUM_METRIC: 'MEDIUM_METRIC',
    LOW_DECAMETRIC: 'LOW_DECAMETRIC',
    REGIONAL: 'REGIONAL',
});

export const DATA_QUALITY_FLAG = Object.freeze({
    EXCELLENT: 'EXCELLENT',
    GOOD: 'GOOD',
    ACCEPTABLE_NOISE: 'ACCEPTABLE_NOISE',
    POOR_RECONSIDER: 'POOR_RECONSIDER',
});

export const SUBSURFACE_ERROR = Object.freeze({
    INVALID_METHOD: 'INVALID_METHOD',
    INVALID_OBJECTIVE: 'INVALID_OBJECTIVE',
    INVALID_DEPTH: 'INVALID_DEPTH',
});

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Faixa de profundidade prática (metros) por método geofísico.
 * Baseado em ASTM D6429-21 Tabela 1 e SEG best practice.
 */
export const METHOD_DEPTH_RANGE_M = Object.freeze({
    ELECTRICAL_RESISTIVITY_2D: Object.freeze({ min: 0, max: 100 }),
    ELECTRICAL_RESISTIVITY_3D: Object.freeze({ min: 0, max: 50 }),
    INDUCED_POLARIZATION: Object.freeze({ min: 0, max: 80 }),
    GROUND_PENETRATING_RADAR: Object.freeze({ min: 0, max: 30 }),
    SEISMIC_REFRACTION: Object.freeze({ min: 0, max: 200 }),
    SEISMIC_REFLECTION: Object.freeze({ min: 50, max: 5000 }),
    MAGNETIC_GRADIOMETRY: Object.freeze({ min: 0, max: 50 }),
    GRAVITY: Object.freeze({ min: 100, max: 10000 }),
    EM_INDUCTION: Object.freeze({ min: 0, max: 30 }),
    MICROGRAVITY: Object.freeze({ min: 0, max: 100 }),
});

/**
 * Classe de resolução típica por método.
 */
export const METHOD_RESOLUTION = Object.freeze({
    ELECTRICAL_RESISTIVITY_2D: 'MEDIUM_METRIC',
    ELECTRICAL_RESISTIVITY_3D: 'HIGH_DECIMETRIC',
    INDUCED_POLARIZATION: 'MEDIUM_METRIC',
    GROUND_PENETRATING_RADAR: 'HIGH_DECIMETRIC',
    SEISMIC_REFRACTION: 'MEDIUM_METRIC',
    SEISMIC_REFLECTION: 'LOW_DECAMETRIC',
    MAGNETIC_GRADIOMETRY: 'MEDIUM_METRIC',
    GRAVITY: 'REGIONAL',
    EM_INDUCTION: 'MEDIUM_METRIC',
    MICROGRAVITY: 'HIGH_DECIMETRIC',
});

/**
 * Métodos recomendados por objetivo de levantamento (ASTM D6429-21).
 */
export const OBJECTIVE_RECOMMENDED_METHODS = Object.freeze({
    AQUIFER_MAPPING: Object.freeze(['ELECTRICAL_RESISTIVITY_2D', 'SEISMIC_REFRACTION']),
    CONTAMINANT_PLUME_DETECTION: Object.freeze(['ELECTRICAL_RESISTIVITY_2D', 'EM_INDUCTION', 'INDUCED_POLARIZATION']),
    BEDROCK_DEPTH: Object.freeze(['SEISMIC_REFRACTION', 'GRAVITY']),
    BURIED_TANKS_LOCATION: Object.freeze(['MAGNETIC_GRADIOMETRY', 'GROUND_PENETRATING_RADAR']),
    KARST_DETECTION: Object.freeze(['MICROGRAVITY', 'GROUND_PENETRATING_RADAR']),
    FAULT_DETECTION: Object.freeze(['SEISMIC_REFLECTION', 'GRAVITY']),
    ARCHAEOLOGICAL_FEATURES: Object.freeze(['GROUND_PENETRATING_RADAR', 'MAGNETIC_GRADIOMETRY']),
    MINERAL_EXPLORATION: Object.freeze(['GRAVITY', 'SEISMIC_REFLECTION', 'MAGNETIC_GRADIOMETRY']),
});

/** Espaçamento mínimo entre linhas de levantamento (m). */
export const MIN_LINE_SPACING_M = 5;

/** Piso típico de ruído (mV) em aquisição EM/resistividade. */
export const NOISE_THRESHOLD_MV = 2.0;

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export class SubsurfaceError extends Error {
    code: string;
    /**
     * @param {string} code
     * @param {string} [message?]
     */
    constructor(code: string, message?: string) {
        super(message ? `${code}: ${message}` : code);
        this.name = 'SubsurfaceError';
        this.code = code;
    }
}

/**
 * @typedef {Object} GeophysicalSurvey
 * @property {string} surveyId
 * @property {string} method
 * @property {string} objective
 * @property {number} targetDepthM
 * @property {number} lineKm
 * @property {number} lineSpacingM
 * @property {string|null} station
 * @property {string|null} conductedAt
 * @property {string} methodResolution
 * @property {boolean} methodSuitability
 * @property {boolean} depthFeasible
 * @property {number} coverageHa
 * @property {string} [qualityFlag]
 */

/**
 * @typedef {Object} SurveyPlanReport
 * @property {number} totalSurveys
 * @property {number} totalLineKm
 * @property {number} totalCoverageHa
 * @property {Readonly<Record<string, number>>} methodMix
 * @property {Readonly<Record<string, number>>} objectiveCoverage
 * @property {Readonly<Record<string, number>>} qualityDistribution
 * @property {number} weightedAvgDepthM
 * @property {number} suitabilityRate
 */
interface SurveyPlanReport {
    totalSurveys: number;
    totalLineKm: number;
    totalCoverageHa: number;
    methodMix: Readonly<Record<string, number>>;
    objectiveCoverage: Readonly<Record<string, number>>;
    qualityDistribution: Readonly<Record<string, number>>;
    weightedAvgDepthM: number;
    suitabilityRate: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** @param {unknown} v @returns {v is string} */
function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

/** @param {unknown} v @returns {v is number} */
function isFinitePositive(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria registro de levantamento geofísico validado.
 *
 * @param {Object} input
 * @param {string} input.surveyId
 * @param {string} input.method - chave de GEOPHYSICAL_METHOD
 * @param {string} input.objective - chave de SURVEY_OBJECTIVE
 * @param {number} input.targetDepthM - profundidade alvo em metros
 * @param {number} input.lineKm - total de linhas em km
 * @param {number} [input.lineSpacingM=10] - espaçamento entre linhas (m)
 * @param {string} [input.station]
 * @param {string} [input.conductedAt]
 * @returns {Readonly<Object>}
 */
export function createSurvey({
    surveyId,
    method,
    objective,
    targetDepthM,
    lineKm,
    lineSpacingM = 10,
    station,
    conductedAt,
}: {
    surveyId?: string;
    method: string;
    objective: string;
    targetDepthM?: number;
    lineKm?: number;
    lineSpacingM?: number;
    station?: string;
    conductedAt?: string;
}) {
    if (!isNonEmptyString(surveyId)) {
        throw new SubsurfaceError(SUBSURFACE_ERROR.INVALID_METHOD, 'surveyId obrigatório');
    }
    if (!(GEOPHYSICAL_METHOD as Record<string, any>)[method]) {
        throw new SubsurfaceError(SUBSURFACE_ERROR.INVALID_METHOD, `method desconhecido: ${method}`);
    }
    if (!(SURVEY_OBJECTIVE as Record<string, any>)[objective]) {
        throw new SubsurfaceError(SUBSURFACE_ERROR.INVALID_OBJECTIVE, `objective desconhecido: ${objective}`);
    }
    if (!isFinitePositive(targetDepthM)) {
        throw new SubsurfaceError(SUBSURFACE_ERROR.INVALID_DEPTH, 'targetDepthM deve ser número positivo');
    }
    if (!isFinitePositive(lineKm)) {
        throw new SubsurfaceError(SUBSURFACE_ERROR.INVALID_DEPTH, 'lineKm deve ser número positivo');
    }
    if (!isFinitePositive(lineSpacingM) || lineSpacingM < MIN_LINE_SPACING_M) {
        throw new SubsurfaceError(SUBSURFACE_ERROR.INVALID_DEPTH, `lineSpacingM deve ser >= ${MIN_LINE_SPACING_M} m`);
    }

    const range = (METHOD_DEPTH_RANGE_M as Record<string, any>)[method];
    const depthFeasible = targetDepthM >= range.min && targetDepthM <= range.max;
    const methodResolution = (METHOD_RESOLUTION as Record<string, any>)[method];
    const recommended = (OBJECTIVE_RECOMMENDED_METHODS as Record<string, any>)[objective] || [];
    const methodSuitability = recommended.includes(method);
    // coverageHa: comprimento (km) * espaçamento (m) / 10  → área varrida em hectares
    // (km × m) / 10 = hectares (1 km × 10 m = 1 ha)
    const coverageHa = (lineKm * lineSpacingM) / 10;

    return Object.freeze({
        surveyId,
        method,
        objective,
        targetDepthM,
        lineKm,
        lineSpacingM,
        station: station || null,
        conductedAt: conductedAt || null,
        methodResolution,
        methodSuitability,
        depthFeasible,
        coverageHa,
    });
}

/**
 * Avalia qualidade dos dados de um levantamento.
 *
 * Heurística:
 * - signalToNoiseDb >= 20 && dataLossPct < 5  → EXCELLENT
 * - >= 12 && < 10  → GOOD
 * - >= 6 && < 20   → ACCEPTABLE_NOISE
 * - else           → POOR_RECONSIDER
 */
export function assessSurveyQuality(
    survey: any,
    signalToNoiseDb: any,
    dataLossPct: any,
) {
    if (!survey || !survey.method) {
        throw new SubsurfaceError(SUBSURFACE_ERROR.INVALID_METHOD, 'survey inválido');
    }
    if (typeof signalToNoiseDb !== 'number' || !Number.isFinite(signalToNoiseDb)) {
        throw new SubsurfaceError(SUBSURFACE_ERROR.INVALID_DEPTH, 'signalToNoiseDb inválido');
    }
    if (typeof dataLossPct !== 'number' || !Number.isFinite(dataLossPct) || dataLossPct < 0 || dataLossPct > 100) {
        throw new SubsurfaceError(SUBSURFACE_ERROR.INVALID_DEPTH, 'dataLossPct inválido');
    }

    if (signalToNoiseDb >= 20 && dataLossPct < 5) return DATA_QUALITY_FLAG.EXCELLENT;
    if (signalToNoiseDb >= 12 && dataLossPct < 10) return DATA_QUALITY_FLAG.GOOD;
    if (signalToNoiseDb >= 6 && dataLossPct < 20) return DATA_QUALITY_FLAG.ACCEPTABLE_NOISE;
    return DATA_QUALITY_FLAG.POOR_RECONSIDER;
}

/**
 * Recomenda métodos para um objetivo dado, intersectando com profundidade viável,
 * ordenando por melhor (mais alta) resolução.
 *
 * @returns {Array<string>} chaves de GEOPHYSICAL_METHOD
 */
export function recommendBestMethods(objective: any, targetDepthM: any) {
    if (!(SURVEY_OBJECTIVE as Record<string, any>)[objective]) {
        throw new SubsurfaceError(SUBSURFACE_ERROR.INVALID_OBJECTIVE, `objective desconhecido: ${objective}`);
    }
    if (!isFinitePositive(targetDepthM)) {
        throw new SubsurfaceError(SUBSURFACE_ERROR.INVALID_DEPTH, 'targetDepthM deve ser número positivo');
    }

    const recommended = (OBJECTIVE_RECOMMENDED_METHODS as Record<string, any>)[objective] || [];
    const feasible = recommended.filter((m: any) => {
        const r = (METHOD_DEPTH_RANGE_M as Record<string, any>)[m];
        return r && targetDepthM >= r.min && targetDepthM <= r.max;
    });

    const order = {
        HIGH_DECIMETRIC: 0,
        MEDIUM_METRIC: 1,
        LOW_DECAMETRIC: 2,
        REGIONAL: 3,
    };
    return feasible.slice().sort((a: any, b: any) => {
        const ra =
            (order as Record<string, any>)[(METHOD_RESOLUTION as Record<string, any>)[a]] ?? 99;
        const rb =
            (order as Record<string, any>)[(METHOD_RESOLUTION as Record<string, any>)[b]] ?? 99;
        return ra - rb;
    });
}

/**
 * Custo estimado de um levantamento em USD.
 * GPR aplica multiplicador 1.5 (mais lento, equipamento mais caro).
 */
export function computeSurveyCostUSD(survey: any, ratePerKmUSD = 1500) {
    if (!survey || !survey.method) {
        throw new SubsurfaceError(SUBSURFACE_ERROR.INVALID_METHOD, 'survey inválido');
    }
    if (!isFinitePositive(ratePerKmUSD)) {
        throw new SubsurfaceError(SUBSURFACE_ERROR.INVALID_DEPTH, 'ratePerKmUSD inválido');
    }
    const multiplier = survey.method === GEOPHYSICAL_METHOD.GROUND_PENETRATING_RADAR ? 1.5 : 1.0;
    return survey.lineKm * ratePerKmUSD * multiplier;
}

interface SurveyPlanTotals {
    totalLineKm: number;
    totalCoverageHa: number;
    methodMix: Record<string, number>;
    objectiveCoverage: Record<string, number>;
    qualityDistribution: Record<string, number>;
    depthAccum: number;
    suitableCount: number;
}

function initQualityDistribution(): Record<string, number> {
    return {
        EXCELLENT: 0,
        GOOD: 0,
        ACCEPTABLE_NOISE: 0,
        POOR_RECONSIDER: 0,
    };
}

function accumulateSurveyMetrics(totals: SurveyPlanTotals, survey: Record<string, unknown>): void {
    const lineKm = typeof survey.lineKm === 'number' ? survey.lineKm : 0;
    const coverageHa = typeof survey.coverageHa === 'number' ? survey.coverageHa : 0;

    totals.totalLineKm += lineKm;
    totals.totalCoverageHa += coverageHa;

    if (typeof survey.method === 'string') {
        totals.methodMix[survey.method] = (totals.methodMix[survey.method] ?? 0) + 1;
    }
    if (typeof survey.objective === 'string') {
        totals.objectiveCoverage[survey.objective] = (totals.objectiveCoverage[survey.objective] ?? 0) + 1;
    }
    if (typeof survey.qualityFlag === 'string' && Object.prototype.hasOwnProperty.call(totals.qualityDistribution, survey.qualityFlag)) {
        totals.qualityDistribution[survey.qualityFlag] = (totals.qualityDistribution[survey.qualityFlag] ?? 0) + 1;
    }
    if (typeof survey.targetDepthM === 'number') {
        totals.depthAccum += survey.targetDepthM * (lineKm || 1);
    }
    if (survey.methodSuitability === true) {
        totals.suitableCount += 1;
    }
}

function finalizeSurveyMetrics(
    totals: SurveyPlanTotals,
    totalSurveys: number,
): Readonly<Omit<SurveyPlanReport, 'totalSurveys'>> {
    const weightedAvgDepthM = totals.totalLineKm > 0 ? totals.depthAccum / totals.totalLineKm : 0;
    const suitabilityRate = totalSurveys > 0 ? (totals.suitableCount / totalSurveys) * 100 : 0;

    return Object.freeze({
        totalLineKm: totals.totalLineKm,
        totalCoverageHa: totals.totalCoverageHa,
        methodMix: Object.freeze({ ...totals.methodMix }),
        objectiveCoverage: Object.freeze({ ...totals.objectiveCoverage }),
        qualityDistribution: Object.freeze({ ...totals.qualityDistribution }),
        weightedAvgDepthM,
        suitabilityRate,
    });
}

/**
 * Constrói relatório agregado de um plano de levantamentos.
 */
export function buildSurveyPlan(surveys: unknown): Readonly<SurveyPlanReport> {
    if (!Array.isArray(surveys)) {
        throw new SubsurfaceError(SUBSURFACE_ERROR.INVALID_METHOD, 'surveys deve ser array');
    }

    const totals: SurveyPlanTotals = {
        totalLineKm: 0,
        totalCoverageHa: 0,
        methodMix: {},
        objectiveCoverage: {},
        qualityDistribution: initQualityDistribution(),
        depthAccum: 0,
        suitableCount: 0,
    };

    for (const s of surveys) {
        if (s && typeof s === 'object') {
            accumulateSurveyMetrics(totals, s as Record<string, unknown>);
        }
    }

    return Object.freeze({
        totalSurveys: surveys.length,
        ...finalizeSurveyMetrics(totals, surveys.length),
    });
}
