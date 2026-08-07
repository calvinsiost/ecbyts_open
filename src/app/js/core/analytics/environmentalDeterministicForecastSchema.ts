// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Environmental Deterministic Forecast Schema - ECBT
 *
 * Pure-logic factories and validators for deterministic time-series forecast
 * metadata. Esquema canônico para método, horizonte, sazonalidade, número de
 * observações e métricas de acurácia (MAE, RMSE, MAPE, sMAPE, MASE, R²).
 *
 * Domain references (used as factual/normative basis only - no code copied):
 * - Box & Jenkins 1976 - Time Series Analysis: Forecasting and Control (ARIMA)
 * - Holt 1957 / Winters 1960 - Exponential smoothing with trend/seasonality
 * - Cleveland et al. 1990 - STL: Seasonal-Trend decomposition (Loess)
 * - Taylor & Letham 2018 - Forecasting at scale (Prophet)
 * - Hyndman & Koehler 2006 - Another look at measures of forecast accuracy (MASE)
 * - ABNT NBR ISO 19115 - Geographic information / metadata
 *
 * Constraints:
 * - Zero DOM, zero browser APIs, zero external imports
 * - All enums frozen via Object.freeze
 * - All record factories return Object.freeze
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const FORECAST_METHOD = Object.freeze({
    ARIMA: 'ARIMA',
    SARIMA: 'SARIMA',
    EXPONENTIAL_SMOOTHING: 'EXPONENTIAL_SMOOTHING',
    HOLT_WINTERS: 'HOLT_WINTERS',
    PROPHET: 'PROPHET',
    STL_DECOMPOSITION: 'STL_DECOMPOSITION',
    MOVING_AVERAGE: 'MOVING_AVERAGE',
    EXPONENTIAL_REGRESSION: 'EXPONENTIAL_REGRESSION',
});

export const FORECAST_HORIZON = Object.freeze({
    SHORT_HOUR: 'SHORT_HOUR',
    SHORT_DAILY: 'SHORT_DAILY',
    MEDIUM_WEEKLY: 'MEDIUM_WEEKLY',
    MEDIUM_MONTHLY: 'MEDIUM_MONTHLY',
    LONG_QUARTERLY: 'LONG_QUARTERLY',
    LONG_ANNUAL: 'LONG_ANNUAL',
});

export const SEASONALITY = Object.freeze({
    NONE: 'NONE',
    DAILY: 'DAILY',
    WEEKLY: 'WEEKLY',
    MONTHLY: 'MONTHLY',
    QUARTERLY: 'QUARTERLY',
    ANNUAL: 'ANNUAL',
    MULTIPLE: 'MULTIPLE',
});

export const ACCURACY_METRIC = Object.freeze({
    MAE: 'MAE',
    RMSE: 'RMSE',
    MAPE: 'MAPE',
    SMAPE: 'SMAPE',
    MASE: 'MASE',
    R_SQUARED: 'R_SQUARED',
});

export const FORECAST_ERROR = Object.freeze({
    INVALID_METHOD: 'INVALID_METHOD',
    INVALID_HORIZON: 'INVALID_HORIZON',
    INVALID_SERIES: 'INVALID_SERIES',
});

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Mínimo de observações por método (Box-Jenkins, Hyndman, etc.). */
export const MIN_OBSERVATIONS_PER_METHOD = Object.freeze({
    ARIMA: 50,
    SARIMA: 100,
    EXPONENTIAL_SMOOTHING: 20,
    HOLT_WINTERS: 24,
    PROPHET: 60,
    STL_DECOMPOSITION: 24,
    MOVING_AVERAGE: 5,
    EXPONENTIAL_REGRESSION: 10,
});

/** Horizonte máximo recomendado como fração do histórico (Hyndman 2018). */
export const MAX_HORIZON_PCT_OF_HISTORY = 0.3;

/**
 * Limiar "publishable" por métrica.
 * Para MAE/RMSE assume-se valores normalizados (0-1) ou relativos à média.
 * MAPE/SMAPE em fração (0.10 = 10%). MASE: <1 indica modelo melhor que naïve.
 */
export const ACCURACY_THRESHOLDS_GOOD = Object.freeze({
    MAE: 0.1,
    RMSE: 0.15,
    MAPE: 0.1,
    SMAPE: 0.1,
    MASE: 1.0,
    R_SQUARED: 0.8,
});

/** Período de sazonalidade em horas. */
export const SEASONALITY_PERIOD_HOURS = Object.freeze({
    DAILY: 24,
    WEEKLY: 168,
    MONTHLY: 720,
    QUARTERLY: 2160,
    ANNUAL: 8760,
});

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export class ForecastError extends Error {
    code: string;

    /**
     * @param {string} code
     * @param {string} [message?]
     */
    constructor(code: string, message?: string) {
        super(message ? `${code}: ${message}` : code);
        this.name = 'ForecastError';
        this.code = code;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** @param {unknown} v */
function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}
/** @param {unknown} v */
function isFinitePositive(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
}
/**
 * @param {unknown} v
 * @param {number} lo
 * @param {number} hi
 */
function isFiniteInRangeExclusive(v: unknown, lo: number, hi: number): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v > lo && v < hi;
}

// Para R² maior é melhor; para as demais menor é melhor.
const METRIC_HIGHER_IS_BETTER = Object.freeze({
    MAE: false,
    RMSE: false,
    MAPE: false,
    SMAPE: false,
    MASE: false,
    R_SQUARED: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

interface CreateForecastMetadataInput {
    forecastId?: string;
    method?: string;
    horizon?: string;
    seasonality?: string;
    observationsCount?: number;
    forecastSteps?: number;
    trainTestSplit?: number;
}

interface ForecastMetadataRecord {
    forecastId: string;
    method: string;
    horizon: string;
    seasonality: string;
    observationsCount: number;
    forecastSteps: number;
    trainTestSplit: number;
    meetsMinObservations: boolean;
    horizonValid: boolean;
    trainSize: number;
    testSize: number;
    isPublishable?: boolean;
}

/**
 * Cria registro de metadata de forecast determinístico.
 *
 * @param {CreateForecastMetadataInput} input
 * @returns {Readonly<ForecastMetadataRecord>}
 */
export function createForecastMetadata({
    forecastId,
    method,
    horizon,
    seasonality = SEASONALITY.NONE,
    observationsCount,
    forecastSteps,
    trainTestSplit = 0.8,
}: CreateForecastMetadataInput): Readonly<ForecastMetadataRecord> {
    if (!isNonEmptyString(forecastId)) {
        throw new ForecastError(FORECAST_ERROR.INVALID_METHOD, 'forecastId obrigatório');
    }
    if (!(FORECAST_METHOD as Record<string, string>)[method as string]) {
        throw new ForecastError(FORECAST_ERROR.INVALID_METHOD, `method desconhecido: ${method}`);
    }
    if (!(FORECAST_HORIZON as Record<string, string>)[horizon as string]) {
        throw new ForecastError(FORECAST_ERROR.INVALID_HORIZON, `horizon desconhecido: ${horizon}`);
    }
    if (!(SEASONALITY as Record<string, string>)[seasonality]) {
        throw new ForecastError(FORECAST_ERROR.INVALID_SERIES, `seasonality desconhecido: ${seasonality}`);
    }
    if (
        typeof observationsCount !== 'number' ||
        !Number.isFinite(observationsCount) ||
        observationsCount <= 0 ||
        !Number.isInteger(observationsCount)
    ) {
        throw new ForecastError(FORECAST_ERROR.INVALID_SERIES, 'observationsCount deve ser inteiro positivo');
    }
    if (
        typeof forecastSteps !== 'number' ||
        !Number.isFinite(forecastSteps) ||
        forecastSteps <= 0 ||
        !Number.isInteger(forecastSteps)
    ) {
        throw new ForecastError(FORECAST_ERROR.INVALID_SERIES, 'forecastSteps deve ser inteiro positivo');
    }
    if (!isFiniteInRangeExclusive(trainTestSplit, 0, 1)) {
        throw new ForecastError(FORECAST_ERROR.INVALID_SERIES, 'trainTestSplit deve estar em (0,1)');
    }

    const minObs = (MIN_OBSERVATIONS_PER_METHOD as Record<string, number>)[method as string] as number;
    const meetsMinObservations = (observationsCount as number) >= minObs;
    const horizonValid =
        (forecastSteps as number) <= (observationsCount as number) * MAX_HORIZON_PCT_OF_HISTORY;
    const trainSize = Math.floor((observationsCount as number) * trainTestSplit);
    const testSize = (observationsCount as number) - trainSize;

    return Object.freeze({
        forecastId,
        method,
        horizon,
        seasonality,
        observationsCount,
        forecastSteps,
        trainTestSplit,
        meetsMinObservations,
        horizonValid,
        trainSize,
        testSize,
    } as ForecastMetadataRecord);
}

/**
 * Avalia se métricas de acurácia atendem thresholds canônicos.
 *
 * @param {ForecastMetadataRecord} forecastMetadata
 * @param {Record<string, number>} accuracyMetrics mapa de ACCURACY_METRIC para number
 * @returns {Readonly<{ metricsPassing: number, total: number, isPublishable: boolean }>}
 */
export function assessForecastQuality(
    forecastMetadata: ForecastMetadataRecord,
    accuracyMetrics: Record<string, number>,
): Readonly<{ metricsPassing: number; total: number; isPublishable: boolean }> {
    if (!forecastMetadata || !forecastMetadata.method) {
        throw new ForecastError(FORECAST_ERROR.INVALID_METHOD, 'forecastMetadata inválido');
    }
    if (!accuracyMetrics || typeof accuracyMetrics !== 'object') {
        throw new ForecastError(FORECAST_ERROR.INVALID_SERIES, 'accuracyMetrics inválido');
    }

    let total = 0;
    let metricsPassing = 0;
    for (const [key, value] of Object.entries(accuracyMetrics)) {
        if (!(ACCURACY_METRIC as Record<string, string>)[key]) continue;
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        total += 1;
        const threshold = (ACCURACY_THRESHOLDS_GOOD as Record<string, number>)[key] as number;
        const higherBetter = (METRIC_HIGHER_IS_BETTER as Record<string, boolean>)[key];
        const pass = higherBetter ? value >= threshold : value <= threshold;
        if (pass) metricsPassing += 1;
    }

    const isPublishable =
        total > 0 &&
        metricsPassing === total &&
        forecastMetadata.meetsMinObservations === true &&
        forecastMetadata.horizonValid === true;

    return Object.freeze({ metricsPassing, total, isPublishable });
}

/**
 * Recomenda método de forecast baseado em heurística decisória.
 *
 * Árvore:
 * - observationsCount < 20                                  → MOVING_AVERAGE
 * - seasonality === NONE && obs < 50                        → EXPONENTIAL_SMOOTHING
 * - seasonality === NONE && obs >= 50                       → ARIMA
 * - seasonality !== NONE && obs >= 100                      → SARIMA (ou PROPHET se MULTIPLE)
 * - seasonality !== NONE && obs >= 24                       → HOLT_WINTERS
 * - else                                                    → STL_DECOMPOSITION
 */
/**
 * @param {number} observationsCount
 * @param {string} seasonality
 * @param {string} [horizon?]
 */
export function recommendMethod(
    observationsCount: number,
    seasonality: string,
    horizon?: string,
): string {
    if (typeof observationsCount !== 'number' || !Number.isFinite(observationsCount) || observationsCount <= 0) {
        throw new ForecastError(FORECAST_ERROR.INVALID_SERIES, 'observationsCount deve ser inteiro positivo');
    }
    if (!(SEASONALITY as Record<string, string>)[seasonality]) {
        throw new ForecastError(FORECAST_ERROR.INVALID_SERIES, `seasonality desconhecido: ${seasonality}`);
    }
    if (horizon !== undefined && !(FORECAST_HORIZON as Record<string, string>)[horizon]) {
        throw new ForecastError(FORECAST_ERROR.INVALID_HORIZON, `horizon desconhecido: ${horizon}`);
    }

    if (observationsCount < 20) return FORECAST_METHOD.MOVING_AVERAGE;
    if (seasonality === SEASONALITY.NONE) {
        if (observationsCount < 50) return FORECAST_METHOD.EXPONENTIAL_SMOOTHING;
        return FORECAST_METHOD.ARIMA;
    }
    if (seasonality === SEASONALITY.MULTIPLE && observationsCount >= 60) {
        return FORECAST_METHOD.PROPHET;
    }
    if (observationsCount >= 100) return FORECAST_METHOD.SARIMA;
    if (observationsCount >= 24) return FORECAST_METHOD.HOLT_WINTERS;
    return FORECAST_METHOD.STL_DECOMPOSITION;
}

/**
 * Computa orçamento computacional total estimado.
 * Usa multiplicador de complexidade implícito por método.
 * @param {number} observationsCount
 * @param {number} methodCost
 */
export function computeForecastBudget(
    observationsCount: number,
    methodCost: number,
): Readonly<{ trainSize: number; testSize: number; complexity: number; totalUSD: number }> {
    if (typeof observationsCount !== 'number' || !Number.isFinite(observationsCount) || observationsCount <= 0) {
        throw new ForecastError(FORECAST_ERROR.INVALID_SERIES, 'observationsCount deve ser inteiro positivo');
    }
    if (!isFinitePositive(methodCost)) {
        throw new ForecastError(FORECAST_ERROR.INVALID_SERIES, 'methodCost inválido');
    }
    const trainSize = Math.floor(observationsCount * 0.8);
    const testSize = observationsCount - trainSize;
    // Complexidade simples: O(n) na fase train + O(n) na fase test
    const complexity = trainSize + testSize;
    const totalUSD = observationsCount * methodCost;
    return Object.freeze({ trainSize, testSize, complexity, totalUSD });
}

/**
 * Verifica se a sazonalidade declarada bate com o padrão observado.
 *
 * @param {ForecastMetadataRecord} forecast registro retornado por createForecastMetadata
 * @param {string} observedPattern chave de SEASONALITY
 * @returns {'STRONG'|'MODERATE'|'WEAK'|'INCONSISTENT'}
 */
export function assessSeasonalityFit(
    forecast: ForecastMetadataRecord,
    observedPattern: string,
): 'STRONG' | 'MODERATE' | 'WEAK' | 'INCONSISTENT' {
    if (!forecast || !forecast.seasonality) {
        throw new ForecastError(FORECAST_ERROR.INVALID_SERIES, 'forecast inválido');
    }
    if (!(SEASONALITY as Record<string, string>)[observedPattern]) {
        throw new ForecastError(FORECAST_ERROR.INVALID_SERIES, `observedPattern desconhecido: ${observedPattern}`);
    }

    const declared = forecast.seasonality;
    if (declared === observedPattern) return 'STRONG';
    if (declared === SEASONALITY.MULTIPLE && observedPattern !== SEASONALITY.NONE) {
        return 'MODERATE';
    }
    if (declared === SEASONALITY.NONE && observedPattern === SEASONALITY.NONE) return 'STRONG';
    if (declared === SEASONALITY.NONE && observedPattern !== SEASONALITY.NONE) {
        return 'INCONSISTENT';
    }
    if (declared !== SEASONALITY.NONE && observedPattern === SEASONALITY.NONE) {
        return 'INCONSISTENT';
    }
    // declared/observed both non-NONE mas diferentes (ex.: WEEKLY vs DAILY)
    return 'WEAK';
}

/**
 * Constrói registro agregado de uma carteira de forecasts.
 * @param {Array<ForecastMetadataRecord>} forecasts
 */
export function buildForecastRegistry(
    forecasts: Array<ForecastMetadataRecord>,
): Readonly<{
    totalForecasts: number;
    methodBreakdown: Readonly<Record<string, number>>;
    horizonBreakdown: Readonly<Record<string, number>>;
    seasonalityBreakdown: Readonly<Record<string, number>>;
    validHorizonRate: number;
    weightedAvgObservations: number;
    publishableCount: number;
}> {
    if (!Array.isArray(forecasts)) {
        throw new ForecastError(FORECAST_ERROR.INVALID_SERIES, 'forecasts deve ser array');
    }
    const totalForecasts = forecasts.length;
    const methodBreakdown: Record<string, number> = {};
    const horizonBreakdown: Record<string, number> = {};
    const seasonalityBreakdown: Record<string, number> = {};
    let validHorizonCount = 0;
    let publishableCount = 0;
    let weightAccum = 0;
    let weightedObs = 0;

    for (const f of forecasts) {
        if (!f || typeof f !== 'object') continue;
        if (f.method) methodBreakdown[f.method] = (methodBreakdown[f.method] || 0) + 1;
        if (f.horizon) horizonBreakdown[f.horizon] = (horizonBreakdown[f.horizon] || 0) + 1;
        if (f.seasonality) {
            seasonalityBreakdown[f.seasonality] = (seasonalityBreakdown[f.seasonality] || 0) + 1;
        }
        if (f.horizonValid === true) validHorizonCount += 1;
        if (f.isPublishable === true) publishableCount += 1;
        if (typeof f.observationsCount === 'number' && f.observationsCount > 0) {
            const w = f.forecastSteps || 1;
            weightedObs += f.observationsCount * w;
            weightAccum += w;
        }
    }

    const validHorizonRate = totalForecasts > 0 ? (validHorizonCount / totalForecasts) * 100 : 0;
    const weightedAvgObservations = weightAccum > 0 ? weightedObs / weightAccum : 0;

    return Object.freeze({
        totalForecasts,
        methodBreakdown: Object.freeze({ ...methodBreakdown }),
        horizonBreakdown: Object.freeze({ ...horizonBreakdown }),
        seasonalityBreakdown: Object.freeze({ ...seasonalityBreakdown }),
        validHorizonRate,
        weightedAvgObservations,
        publishableCount,
    });
}
