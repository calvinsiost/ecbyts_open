// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * sensorDataSchema.js - IoT Sensor Reading Schema, Validation, and Drift Detection
 * HEALTH-MON-001 / P1-56
 *
 * Provides typed sensor readings, range-based quality validation, linear-regression
 * drift detection, unit normalization, and time-bucketed aggregation.
 *
 * Academic reference: ISO 21501-1:2009 (particle counters), IEC 62443 (industrial
 * sensor data quality), ASTM E2696 (sensor drift evaluation).
 *
 * @module core/sensor/sensorDataSchema
 */

// ─── Enumerations ────────────────────────────────────────────────────────────

/**
 * Canonical sensor type codes.
 * Congelado - não adicionar variantes sem atualizar ADR.
 * @readonly
 */
export const SENSOR_TYPES = Object.freeze({
    TEMPERATURE: 'temperature',
    PRESSURE: 'pressure',
    FLOW: 'flow',
    PH: 'ph',
    CONDUCTIVITY: 'conductivity',
    TURBIDITY: 'turbidity',
    DO: 'dissolved_oxygen',
    REDOX: 'redox',
});

/**
 * Reading quality flags.
 * Ordered by ascending severity: GOOD < SUSPECT < BAD < MISSING.
 * @readonly
 */
export const READING_QUALITY = Object.freeze({
    GOOD: 'good',
    SUSPECT: 'suspect',
    BAD: 'bad',
    MISSING: 'missing',
});

interface SensorReading {
    id: string;
    sensorId: string;
    type: string;
    value: number;
    unit: string;
    timestamp: number;
    quality: string;
    flags: ReadonlyArray<string>;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates a new sensor reading record.
 *
 * @param sensorId   - Non-empty sensor identifier.
 * @param type       - One of SENSOR_TYPES values.
 * @param value      - Finite numeric measurement value.
 * @param unit       - Non-empty unit string (e.g. '°C', 'NTU').
 * @param timestamp - Reading timestamp (ms epoch).
 * @returns Frozen reading object.
 * @throws If required fields are missing or value is not finite.
 */
export function createSensorReading(
    sensorId: string,
    type: string,
    value: number,
    unit: string,
    timestamp: number | string | Date = Date.now(),
): Readonly<SensorReading> {
    // Validação de entrada - erros explícitos para facilitar debug
    if (!sensorId || typeof sensorId !== 'string' || sensorId.trim() === '') {
        throw new Error('[sensorDataSchema] sensorId must be a non-empty string');
    }
    if (!type || typeof type !== 'string' || type.trim() === '') {
        throw new Error('[sensorDataSchema] type must be a non-empty string');
    }
    if (!unit || typeof unit !== 'string' || unit.trim() === '') {
        throw new Error('[sensorDataSchema] unit must be a non-empty string');
    }
    if (!Number.isFinite(value)) {
        throw new Error(`[sensorDataSchema] value must be a finite number, got: ${value}`);
    }

    const ts = timestamp instanceof Date ? timestamp.getTime() : Number(timestamp);

    // ID determinístico-único por leitura: epoch + sufixo aleatório 16-bit
    const id = `sr_${Date.now()}_${Math.floor(Math.random() * 0xffff)
        .toString(16)
        .padStart(4, '0')}`;

    return Object.freeze({
        id,
        sensorId: sensorId.trim(),
        type: type.trim(),
        value,
        unit: unit.trim(),
        timestamp: ts,
        quality: READING_QUALITY.GOOD,
        flags: Object.freeze([]),
    });
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates a reading against a range configuration.
 * Mutates nothing - returns a new quality result object.
 *
 * @param reading - Sensor reading (createSensorReading output or compatible).
 * @param rangeConfig
 * @returns
 */
export function validateReading(
    reading: { value: number; [key: string]: any },
    rangeConfig: { min?: number; max?: number; rateOfChangeMax?: number } = {},
): { valid: boolean; quality: string; flags: string[] } {
    const flags: string[] = [];
    let quality: string = READING_QUALITY.GOOD;

    const { value } = reading;

    // Verificar ausência / NaN
    if (value === null || value === undefined || !Number.isFinite(value)) {
        flags.push('missing');
        quality = READING_QUALITY.MISSING;
        return { valid: false, quality, flags };
    }

    const { min, max } = rangeConfig;

    // Verificar limites de range
    if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
        flags.push('out_of_range');
        quality = READING_QUALITY.BAD;
    }

    const valid = flags.length === 0;
    return { valid, quality, flags };
}

// ─── Drift Detection ─────────────────────────────────────────────────────────

/**
 * Detects monotonic drift in a series of readings using linear regression.
 *
 * Drift is declared when |slope| > stdDev(values) * 0.1 over the analysis window.
 * This is a conservative threshold consistent with ISA-5.1 sensor stability criteria.
 *
 * @param readings - Array of reading objects with {value} field.
 * @param windowSize - Number of trailing readings to analyse.
 * @returns
 */
export function detectDrift(
    readings: Array<{ value: number }>,
    windowSize: number = 10,
): { hasDrift: boolean; driftRate: number; direction: 'increasing' | 'decreasing' | 'stable' } {
    if (!Array.isArray(readings) || readings.length < 2) {
        return { hasDrift: false, driftRate: 0, direction: 'stable' };
    }

    // Usar apenas a janela mais recente
    const window = readings.slice(-windowSize);
    const values = window.map((r) => r.value).filter((v) => Number.isFinite(v));

    if (values.length < 2) {
        return { hasDrift: false, driftRate: 0, direction: 'stable' };
    }

    // Regressão linear simples: y = a + b*x  (x = índice 0..n-1)
    let sumX = 0,
        sumY = 0,
        sumXY = 0,
        sumX2 = 0;
    const m = values.length;
    for (let i = 0; i < m; i++) {
        const vi = values[i] as number;
        sumX += i;
        sumY += vi;
        sumXY += i * vi;
        sumX2 += i * i;
    }
    const denom = m * sumX2 - sumX * sumX;
    const slope = denom === 0 ? 0 : (m * sumXY - sumX * sumY) / denom;

    // Desvio padrão dos valores
    const mean = sumY / m;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / m;
    const stdDev = Math.sqrt(variance);

    const threshold = stdDev * 0.1;
    const hasDrift = Math.abs(slope) > threshold;

    let direction: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (hasDrift) {
        direction = slope > 0 ? 'increasing' : 'decreasing';
    }

    return { hasDrift, driftRate: slope, direction };
}

// ─── Unit Normalization ───────────────────────────────────────────────────────

/**
 * Returns a new reading with value and unit converted.
 * Conversion is linear: newValue = value * conversionFactor.
 *
 * @param reading - Frozen reading object.
 * @param targetUnit - Target unit label.
 * @param conversionFactor - Multiplicative factor (e.g. 1.8 for °C→°F offset must be applied externally).
 * @returns New frozen reading with updated value and unit.
 */
export function normalizeReadingUnit(
    reading: { value: number; flags?: string[]; [key: string]: any },
    targetUnit: string,
    conversionFactor: number,
): Readonly<object> {
    if (!targetUnit || typeof targetUnit !== 'string' || targetUnit.trim() === '') {
        throw new Error('[sensorDataSchema] targetUnit must be a non-empty string');
    }
    if (!Number.isFinite(conversionFactor) || conversionFactor === 0) {
        throw new Error('[sensorDataSchema] conversionFactor must be a non-zero finite number');
    }

    return Object.freeze({
        ...reading,
        value: reading.value * conversionFactor,
        unit: targetUnit.trim(),
        flags: Object.freeze([...(reading.flags || [])]),
    });
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

/**
 * Aggregates readings into fixed-width time buckets.
 *
 * @param readings - Array of reading objects with {value, timestamp, quality}.
 * @param intervalMs - Bucket width in milliseconds (e.g. 60_000 for 1-min buckets).
 * @returns
 */
export function aggregateSensorReadings(
    readings: Array<{ value: number; timestamp: number; quality?: string }>,
    intervalMs: number,
): Array<{ intervalStart: number; mean: number; min: number; max: number; count: number; quality: string }> {
    if (!Array.isArray(readings) || readings.length === 0) return [];
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        throw new Error('[sensorDataSchema] intervalMs must be a positive finite number');
    }

    // Agrupar em buckets por chave epoch truncado ao intervalo
    const buckets = new Map<number, { values: number[]; qualities: string[] }>();

    for (const r of readings) {
        const ts = Number(r.timestamp);
        if (!Number.isFinite(ts)) continue;

        const bucketKey = Math.floor(ts / intervalMs) * intervalMs;
        if (!buckets.has(bucketKey)) {
            buckets.set(bucketKey, { values: [], qualities: [] });
        }
        const bucket = buckets.get(bucketKey);
        if (!bucket) continue;
        if (Number.isFinite(r.value)) {
            bucket.values.push(r.value);
        }
        bucket.qualities.push(r.quality || READING_QUALITY.GOOD);
    }

    // Converter buckets em summary objects
    const result: Array<{
        intervalStart: number;
        mean: number;
        min: number;
        max: number;
        count: number;
        quality: string;
    }> = [];
    for (const [intervalStart, { values, qualities }] of buckets) {
        if (values.length === 0) continue;

        const mean = values.reduce((s, v) => s + v, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);

        // Qualidade do bucket: pior qualidade presente
        const QUALITY_RANK: Record<string, number> = { good: 0, suspect: 1, bad: 2, missing: 3 };
        const worstQuality: string = qualities.reduce((worst: string, q: string) => {
            return (QUALITY_RANK[q] ?? 0) > (QUALITY_RANK[worst] ?? 0) ? q : worst;
        }, READING_QUALITY.GOOD);

        result.push({ intervalStart, mean, min, max, count: values.length, quality: worstQuality });
    }

    // Ordenar por intervalStart ascendente
    result.sort((a, b) => a.intervalStart - b.intervalStart);
    return result;
}
