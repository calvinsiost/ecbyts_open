// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — atomização painéis laterais
// (Calvin diretiva 2026-05-27: "atomização e otimização dos módulos de painéis").
//
// Pure-logic extraction from src/app/js/utils/ui/sensorCenterPanel.ts (525L).
// Read from canonical TS per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. Primeira extração para esse painel.
//
// Spec NOT:
// - NÃO ler DOM (caller monta <tr>/<table>)
// - NÃO ler module state (caller passa via parameters)
// - NÃO ler i18n direto (caller resolve via t() para labels)
// - NÃO emoji
//
// Extracted helpers:
//   - SENSOR_STATUS_VALUES               (frozen 'live'|'stale'|'error'|'idle')
//   - DEFAULT_STALE_THRESHOLD_MS         (frozen 5 * 60 * 1000 = 5 min)
//   - parseSensorTimestamp               (string|null → ms epoch | NaN)
//   - formatSensorLastFetch              (timestamp → locale str | '—')
//   - formatSensorCoords                 ({lat,lng} → 'A.AAAAA, B.BBBBB' | '—')
//   - resolveSensorTemperature           (data → number | null)
//   - resolveSensorSource                (data → string | '—')
//   - deriveSensorStatus                 (sensor + nowMs + staleMs → status)

export type SensorStatus = 'live' | 'stale' | 'error' | 'idle';

export interface SensorGeoCoordinates {
    latitude?: number;
    longitude?: number;
}

export interface SensorReading {
    parameterId?: string;
    value?: number;
    source?: string;
}

export interface SensorWeather {
    temperatureRaw?: number;
    source?: string;
    _status?: string;
}

export interface SensorData {
    latestReadings?: ReadonlyArray<SensorReading>;
    weather?: SensorWeather;
    errors?: ReadonlyArray<unknown>;
    _autoRefreshActive?: boolean;
    lastFetch?: string;
    geoCoordinates?: SensorGeoCoordinates;
}

export interface SensorLike {
    id?: string;
    name?: string;
    label?: string;
    data?: SensorData;
}

/** Frozen list of canonical sensor status values. */
export const SENSOR_STATUS_VALUES: ReadonlyArray<SensorStatus> = Object.freeze(['live', 'stale', 'error', 'idle'] as const);

/** Default threshold for considering a sensor reading "stale" (5 minutes). */
export const DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Parse a timestamp value (string or undefined) to ms epoch.
 * Returns NaN for null/undefined/invalid inputs.
 */
export function parseSensorTimestamp(value: unknown): number {
    if (value == null || value === '') return NaN;
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const ts = Date.parse(String(value));
    return Number.isFinite(ts) ? ts : NaN;
}

/**
 * Format the last-fetch timestamp as a locale string.
 *   Invalid timestamp → '—'
 */
export function formatSensorLastFetch(value: unknown): string {
    const ts = parseSensorTimestamp(value);
    return Number.isFinite(ts) ? new Date(ts).toLocaleString() : '—';
}

/**
 * Format geo coordinates as "lat, lng" with 5-decimal precision.
 *   Missing/invalid → '—'
 */
export function formatSensorCoords(geo: SensorGeoCoordinates | null | undefined): string {
    if (!geo || typeof geo.latitude !== 'number' || typeof geo.longitude !== 'number') return '—';
    if (!Number.isFinite(geo.latitude) || !Number.isFinite(geo.longitude)) return '—';
    return `${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)}`;
}

/**
 * Resolve current sensor temperature from latestReadings or weather fallback.
 *   Preference: latestReadings[parameterId='temperature'].value > data.weather.temperatureRaw
 *   Missing → null
 */
export function resolveSensorTemperature(data: SensorData | null | undefined): number | null {
    if (!data || typeof data !== 'object') return null;
    const readings = Array.isArray(data.latestReadings) ? data.latestReadings : [];
    const tempReading = readings.find((r) => r?.parameterId === 'temperature');
    if (typeof tempReading?.value === 'number' && Number.isFinite(tempReading.value)) {
        return tempReading.value;
    }
    const raw = data.weather?.temperatureRaw;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    return null;
}

/**
 * Resolve current sensor data source label.
 *   Preference: latestReadings[temperature].source > data.weather.source > '—'
 */
export function resolveSensorSource(data: SensorData | null | undefined): string {
    if (!data || typeof data !== 'object') return '—';
    const readings = Array.isArray(data.latestReadings) ? data.latestReadings : [];
    const tempReading = readings.find((r) => r?.parameterId === 'temperature');
    return tempReading?.source || data.weather?.source || '—';
}

/**
 * Derive sensor status from its data and current time.
 *
 * Rules (preserved from getSensorStatus @ sensorCenterPanel.ts:94):
 *   - hasError (errors[] non-empty OR weather._status==='error')  → 'error'
 *   - data._autoRefreshActive === true                            → 'live'
 *   - parseTimestamp(lastFetch) invalid                           → 'stale'
 *   - now - lastFetch > staleThresholdMs                          → 'stale'
 *   - otherwise                                                   → 'idle'
 *
 * `nowMs` and `staleThresholdMs` are injectable for testability.
 */
export function deriveSensorStatus(
    sensor: SensorLike | null | undefined,
    nowMs: number = Date.now(),
    staleThresholdMs: number = DEFAULT_STALE_THRESHOLD_MS,
): SensorStatus {
    if (!sensor || typeof sensor !== 'object') return 'idle';
    const data: SensorData = sensor.data || {};
    const hasError =
        (Array.isArray(data.errors) && data.errors.length > 0) || data.weather?._status === 'error';
    if (hasError) return 'error';
    if (data._autoRefreshActive === true) return 'live';
    const lastFetchTs = parseSensorTimestamp(data.lastFetch);
    if (!Number.isFinite(lastFetchTs)) return 'stale';
    return nowMs - lastFetchTs > staleThresholdMs ? 'stale' : 'idle';
}
