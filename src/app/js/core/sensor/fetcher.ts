// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   SENSOR DATA FETCHER — Three-stage API pipeline
   Pipeline de busca de dados de sensor em 3 estágios

   Estágio 1: JSONPlaceholder → identidade do proprietário/localização
   Estágio 2: FakerAPI → metadados extendidos (UUID, serial, coordenadas)
   Estágio 3: Conector externo (opcional) → telemetria complementar

   Cada estágio é independente e resiliente — falha em um
   não corrompe a estrutura global.
   ================================================================ */

type TsFetchStatus = 'ok' | 'error' | 'skipped';
type TsParameterRange = { min: number; max: number; unit: string; decimals: number };
type TsGeoCoordinates = { latitude: number; longitude: number };
type TsIdentityResult = {
    _status: 'ok' | 'error';
    _error?: string;
    ownerName: string;
    ownerUsername: string;
    ownerEmail: string;
    city: string;
    geo: { lat: string; lng: string };
};
type TsMetadataResult = {
    _status: 'ok' | 'error';
    _error?: string;
    uuid: string;
    serial: string;
    fakeCoord: { lat: number; lng: number };
};
type TsSensorReading = {
    parameterId: string;
    value: number;
    unit: string;
    raw: number | null;
    timestamp: string;
    source?: string;
};
type TsReadingsResult = {
    _status: TsFetchStatus;
    _error?: string;
    readings: TsSensorReading[];
};
type TsWeatherResult = {
    _status: TsFetchStatus;
    _error?: string;
    temperature: string | null;
    temperatureRaw?: number | null;
    humidity: number | null;
    pressure: number | null;
    windSpeed?: number | null;
    precipitation?: number | null;
    description: string;
    operationalStatus: boolean;
    source?: string;
    fetchedAt?: string;
    _rawCurrent?: Record<string, number | string | null | undefined>;
};
type TsSensorEndpoints = {
    identity: string;
    metadata: string;
    readings: string;
};
type TsSensorFetchOptions = {
    userId?: number;
    apiKey?: string;
    monitoredParameters?: string[];
    previousReadings?: TsSensorReading[];
    geoCoordinates?: TsGeoCoordinates | null;
    endpoints?: Partial<TsSensorEndpoints>;
};
type TsSensorFetchResult = {
    identity: TsIdentityResult;
    metadata: TsMetadataResult;
    readings: TsSensorReading[];
    weather: TsWeatherResult;
    errors: string[];
    userId: number;
};

/**
 * @typedef {'ok' | 'error' | 'skipped'} SensorFetchStatus
 * @typedef {{ min: number, max: number, unit: string, decimals: number }} SensorParameterRange
 * @typedef {{ latitude: number, longitude: number }} SensorGeoCoordinates
 * @typedef {{ lat: string, lng: string }} IdentityGeo
 * @typedef {{ _status: 'ok' | 'error', _error?: string, ownerName: string, ownerUsername: string, ownerEmail: string, city: string, geo: IdentityGeo }} IdentityResult
 * @typedef {{ _status: 'ok' | 'error', _error?: string, uuid: string, serial: string, fakeCoord: { lat: number, lng: number } }} MetadataResult
 * @typedef {{ parameterId: string, value: number, unit: string, raw: number | null, timestamp: string, source?: string }} SensorReading
 * @typedef {{ _status: SensorFetchStatus, _error?: string, readings: SensorReading[] }} ReadingsResult
 * @typedef {{ _status: SensorFetchStatus, _error?: string, temperature: string | null, temperatureRaw?: number | null, humidity: number | null, pressure: number | null, windSpeed?: number | null, precipitation?: number | null, description: string, operationalStatus: boolean, source?: string, fetchedAt?: string, _rawCurrent?: Record<string, number | string | null | undefined> }} WeatherResult
 * @typedef {{ identity: string, metadata: string, readings: string }} SensorEndpoints
 * @typedef {{ userId?: number, apiKey?: string, monitoredParameters?: string[], previousReadings?: SensorReading[], geoCoordinates?: SensorGeoCoordinates | null, endpoints?: Partial<SensorEndpoints> }} SensorFetchOptions
 * @typedef {{ identity: IdentityResult, metadata: MetadataResult, readings: SensorReading[], weather: WeatherResult, errors: string[], userId: number }} SensorFetchResult
 */

/** Timeout in ms for each API call */
const FETCH_TIMEOUT: number = 5000;

/** @type {SensorParameterRange} */
const DEFAULT_RANGE: TsParameterRange = { min: 0, max: 100, unit: '-', decimals: 2 };

/**
 * @param {unknown} err
 * @returns {string}
 */
function getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

// ----------------------------------------------------------------
// STAGE 1: PRIMARY IDENTITY SEED
// Semente de identidade do proprietário via JSONPlaceholder
// ----------------------------------------------------------------

/**
 * Fetch identity data from JSONPlaceholder.
 * Busca dados de identidade do proprietário do sensor.
 *
 * @param {number} userId - User ID seed (1-10)
 * @param {string} [endpointTemplate?] - Optional endpoint template with {userId}
 * @returns {Promise<IdentityResult>} Identity object with name, city, geo
 */
async function fetchIdentity(userId: number, endpointTemplate?: string): Promise<TsIdentityResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
        const id = Math.min(Math.max(Math.round(userId), 1), 10);
        const url = (endpointTemplate || 'https://jsonplaceholder.typicode.com/users/{userId}').replace(
            '{userId}',
            String(id),
        );
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const user = await res.json();

        return {
            _status: 'ok',
            ownerName: user.name || 'Unknown',
            ownerUsername: user.username || '',
            ownerEmail: user.email || '',
            city: user.address?.city || 'London',
            geo: {
                lat: user.address?.geo?.lat || '0',
                lng: user.address?.geo?.lng || '0',
            },
        };
    } catch (err: unknown) {
        return {
            _status: 'error',
            _error: `Stage 1 (identity): ${getErrorMessage(err)}`,
            ownerName: 'Unknown Sensor',
            ownerUsername: '',
            ownerEmail: '',
            city: 'London',
            geo: { lat: '0', lng: '0' },
        };
    } finally {
        clearTimeout(timer);
    }
}

// ----------------------------------------------------------------
// STAGE 2: EXTENDED METADATA LAYER
// Camada de metadados extendidos via FakerAPI
// ----------------------------------------------------------------

/**
 * Fetch extended metadata from FakerAPI.
 * Busca UUID, serial e coordenadas fictícias.
 *
 * @param {string} [endpointUrl?] - Optional endpoint URL override
 * @returns {Promise<MetadataResult>} Metadata with uuid, serial, fakeCoord
 */
async function fetchMetadata(endpointUrl?: string): Promise<TsMetadataResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
        const url =
            endpointUrl ||
            'https://fakerapi.it/api/v1/custom?_quantity=1&uuid=uuid&serial=buildingNumber&coord_lat=latitude&coord_lon=longitude';
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const item = json.data?.[0] || {};

        return {
            _status: 'ok',
            uuid: item.uuid || crypto.randomUUID(),
            serial: item.serial ? `SN-${item.serial}` : 'SN-0000',
            fakeCoord: {
                lat: parseFloat(item.coord_lat) || 0,
                lng: parseFloat(item.coord_lon) || 0,
            },
        };
    } catch (err: unknown) {
        return {
            _status: 'error',
            _error: `Stage 2 (metadata): ${getErrorMessage(err)}`,
            uuid: crypto.randomUUID(),
            serial: 'SN-0000',
            fakeCoord: { lat: 0, lng: 0 },
        };
    } finally {
        clearTimeout(timer);
    }
}

// ----------------------------------------------------------------
// STAGE 2B: MULTIPARAMETER READINGS VIA FAKERAPI
// Leituras multiparâmetro geradas via FakerAPI + escalonamento
// ----------------------------------------------------------------

/**
 * Faixas realistas para escalonar valores do FakerAPI.
 * @type {Record<string, SensorParameterRange>}
 */
const PARAM_RANGES: Record<string, TsParameterRange> = {
    pH: { min: 5.5, max: 8.5, unit: 'pH', decimals: 2 },
    conductivity: { min: 100, max: 2000, unit: 'µS/cm', decimals: 0 },
    temperature: { min: 15, max: 32, unit: '°C', decimals: 1 },
    humidity: { min: 10, max: 100, unit: '%', decimals: 0 },
    pressure: { min: 950, max: 1050, unit: 'hPa', decimals: 1 },
    wind_speed: { min: 0, max: 30, unit: 'm/s', decimals: 1 },
    precipitation: { min: 0, max: 50, unit: 'mm', decimals: 1 },
    water_level: { min: -15, max: -0.5, unit: 'm', decimals: 2 },
    flow_rate: { min: 0.1, max: 10, unit: 'L/s', decimals: 2 },
    benzene: { min: 0.001, max: 5, unit: 'µg/L', decimals: 3 },
    tph: { min: 0.1, max: 100, unit: 'mg/L', decimals: 1 },
    btex: { min: 0.01, max: 50, unit: 'µg/L', decimals: 2 },
    voc: { min: 0.01, max: 20, unit: 'µg/L', decimals: 2 },
    bod: { min: 5, max: 300, unit: 'mg/L', decimals: 1 },
    cod: { min: 10, max: 600, unit: 'mg/L', decimals: 1 },
    tss: { min: 5, max: 200, unit: 'mg/L', decimals: 1 },
    pm25: { min: 5, max: 150, unit: 'µg/m³', decimals: 1 },
    pm10: { min: 10, max: 250, unit: 'µg/m³', decimals: 1 },
    nox: { min: 10, max: 500, unit: 'mg/Nm³', decimals: 0 },
    sox: { min: 5, max: 300, unit: 'mg/Nm³', decimals: 0 },
    noise_exposure: { min: 65, max: 95, unit: 'dBA', decimals: 1 },
    ghg_scope1: { min: 100, max: 50000, unit: 'tCO2e', decimals: 0 },
    species_count: { min: 5, max: 200, unit: 'count', decimals: 0 },
};

/** Passo máximo por parâmetro para random walk (variação realista entre leituras) */
/** @type {Record<string, number>} */
const MAX_STEP: Record<string, number> = {
    pH: 0.1,
    conductivity: 20,
    temperature: 0.5,
    water_level: 0.1,
    flow_rate: 0.2,
    benzene: 0.05,
    tph: 1,
    btex: 0.5,
    voc: 0.3,
    bod: 5,
    cod: 10,
    tss: 3,
    pm25: 5,
    pm10: 8,
    nox: 15,
    sox: 10,
    noise_exposure: 1,
    ghg_scope1: 50,
    species_count: 1,
    humidity: 2,
    pressure: 1,
    wind_speed: 0.5,
    precipitation: 0.5,
};

/** Mapeamento Open-Meteo → parameterId (dados reais substituem random walk) */
/** @type {Record<string, string>} */
const WEATHER_PARAM_MAP: Record<string, string> = {
    temperature_2m: 'temperature',
    relative_humidity_2m: 'humidity',
    pressure_msl: 'pressure',
    wind_speed_10m: 'wind_speed',
    precipitation: 'precipitation',
};

/**
 * Apply random walk from previous value (variação realista entre leituras).
 * Se não tem valor anterior, gera random dentro da faixa.
 *
 * @param {string} paramId - Parameter ID
 * @param {number | null} prevValue - Previous reading value (null for first reading)
 * @returns Novo valor com variação realista
 */
function randomWalkValue(paramId: string, prevValue: number | null): number {
    const range = PARAM_RANGES[paramId] ?? DEFAULT_RANGE;
    if (prevValue == null) {
        return range.min + Math.random() * (range.max - range.min);
    }
    const step = MAX_STEP[paramId] ?? (range.max - range.min) * 0.02;
    const delta = (Math.random() - 0.5) * 2 * step;
    return Math.max(range.min, Math.min(range.max, prevValue + delta));
}

/**
 * Fetch multiparameter readings with random walk continuity.
 * Usa FakerAPI como seed na primeira leitura; leituras subsequentes
 * aplicam random walk a partir do valor anterior (variação realista).
 *
 * @param parameterIds - IDs dos parâmetros monitorados
 * @param endpointUrl - URL override para FakerAPI
 * @param previousReadings - Leituras anteriores para random walk
 * @param {string[]} parameterIds
 * @param {string | null} [endpointUrl]
 * @param {SensorReading[]} [previousReadings]
 * @returns {Promise<ReadingsResult>} Status and readings
 */
/**
 * @param {string[]} parameterIds
 * @param {string | null} [endpointUrl]
 * @param {SensorReading[]} [previousReadings]
 * @returns {Promise<ReadingsResult>}
 */
async function fetchReadings(
    parameterIds: string[],
    endpointUrl?: string | null,
    previousReadings?: TsSensorReading[],
): Promise<TsReadingsResult> {
    if (!parameterIds || parameterIds.length === 0) {
        return { _status: 'skipped', readings: [] };
    }

    // Mapa de valores anteriores para random walk
    /** @type {Record<string, number>} */
    const prevMap: Record<string, number> = {};
    if (Array.isArray(previousReadings)) {
        previousReadings.forEach((r) => {
            prevMap[r.parameterId] = r.value;
        });
    }

    const hasPrevious = Object.keys(prevMap).length > 0;

    // Se já temos valores anteriores, usar random walk local (sem API call)
    if (hasPrevious) {
        const readings = parameterIds.map((paramId) => {
            const range = PARAM_RANGES[paramId] ?? DEFAULT_RANGE;
            const value = randomWalkValue(paramId, prevMap[paramId] ?? null);
            return {
                parameterId: paramId,
                value: parseFloat(value.toFixed(range.decimals)),
                unit: range.unit,
                raw: null,
                timestamp: new Date().toISOString(),
            };
        });
        return { _status: 'ok', readings };
    }

    // Primeira leitura: busca seed do FakerAPI
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
        const fields = parameterIds
            .slice(0, 10)
            .map((id) => `${id}=number`)
            .join('&');
        const url = endpointUrl || `https://fakerapi.it/api/v1/custom?_quantity=1&${fields}`;

        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const item = json.data?.[0] || {};

        const readings = parameterIds.map((paramId) => {
            const raw = parseFloat(item[paramId]) || Math.random() * 100;
            const range = PARAM_RANGES[paramId] ?? DEFAULT_RANGE;
            const seed = (Math.abs(raw) % 10000) / 10000;
            const value = range.min + seed * (range.max - range.min);
            return {
                parameterId: paramId,
                value: parseFloat(value.toFixed(range.decimals)),
                unit: range.unit,
                raw: raw,
                timestamp: new Date().toISOString(),
            };
        });

        return { _status: 'ok', readings };
    } catch (err: unknown) {
        // Fallback: gera localmente se FakerAPI falhar
        const readings = parameterIds.map((paramId) => {
            const range = PARAM_RANGES[paramId] ?? DEFAULT_RANGE;
            const value = range.min + Math.random() * (range.max - range.min);
            return {
                parameterId: paramId,
                value: parseFloat(value.toFixed(range.decimals)),
                unit: range.unit,
                raw: null,
                timestamp: new Date().toISOString(),
            };
        });
        return {
            _status: 'error',
            _error: `Stage 2B (readings): ${getErrorMessage(err)}`,
            readings,
        };
    } finally {
        clearTimeout(timer);
    }
}

// ----------------------------------------------------------------
// STAGE 3A: OPEN-METEO (default, no API key required)
// Dados meteorológicos reais via Open-Meteo - gratuito e open-source
// ----------------------------------------------------------------

/**
 * Fetch real-time weather from Open-Meteo (no API key required).
 * Busca dados meteorológicos reais que variam continuamente.
 *
 * @param {number} latitude - WGS84 latitude
 * @param {number} longitude - WGS84 longitude
 * @returns {Promise<WeatherResult>} Weather data compatible with fetchWeather shape
 */
async function fetchOpenMeteo(latitude: number, longitude: number): Promise<TsWeatherResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
        const url =
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${latitude}&longitude=${longitude}` +
            `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,pressure_msl,precipitation` +
            `&timezone=auto`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const c = data.current || {};

        return {
            _status: 'ok',
            temperature: `${c.temperature_2m ?? 0} °C`,
            temperatureRaw: c.temperature_2m ?? 0,
            humidity: c.relative_humidity_2m ?? null,
            pressure: c.pressure_msl ?? null,
            windSpeed: c.wind_speed_10m ?? null,
            precipitation: c.precipitation ?? null,
            description: 'Open-Meteo live',
            operationalStatus: true,
            source: 'open-meteo',
            fetchedAt: c.time || new Date().toISOString(),
            _rawCurrent: c,
        };
    } catch (err: unknown) {
        return {
            _status: 'error',
            _error: `Stage 3 (Open-Meteo): ${getErrorMessage(err)}`,
            temperature: null,
            temperatureRaw: null,
            humidity: null,
            pressure: null,
            description: 'unavailable',
            operationalStatus: false,
            source: 'open-meteo',
        };
    } finally {
        clearTimeout(timer);
    }
}

// ----------------------------------------------------------------
// STAGE 3B: OPENWEATHERMAP (optional, requires API key)
// Conector externo legado - mantido para backward compatibility
// ----------------------------------------------------------------

/**
 * Fetch environmental context from OpenWeatherMap.
 * Busca telemetria complementar via OWM (requer API key).
 *
 * @param {string} city - City name from Stage 1
 * @param {string} apiKey - OpenWeatherMap API key
 * @returns {Promise<WeatherResult>} Weather data with temperature, humidity, etc.
 */
async function fetchWeather(city: string, apiKey: string): Promise<TsWeatherResult> {
    if (!apiKey) {
        return {
            _status: 'skipped',
            temperature: null,
            humidity: null,
            pressure: null,
            description: 'unavailable',
            operationalStatus: false,
        };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
        const q = encodeURIComponent(city);
        const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${q}&appid=${apiKey}&units=metric`, {
            signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        return {
            _status: 'ok',
            temperature: `${data.main?.temp ?? 0} °C`,
            temperatureRaw: data.main?.temp ?? 0,
            humidity: data.main?.humidity ?? null,
            pressure: data.main?.pressure ?? null,
            description: data.weather?.[0]?.description || 'unknown',
            operationalStatus: true,
            source: 'openweathermap',
        };
    } catch (err: unknown) {
        return {
            _status: 'error',
            _error: `Stage 3 (weather): ${getErrorMessage(err)}`,
            temperature: null,
            temperatureRaw: null,
            humidity: null,
            pressure: null,
            description: 'unavailable',
            operationalStatus: false,
        };
    } finally {
        clearTimeout(timer);
    }
}

// ----------------------------------------------------------------
// ORCHESTRATOR
// Orquestrador do pipeline: Estágio 1 → (Estágio 2 + 3 paralelos)
// ----------------------------------------------------------------

/**
 * Execute the 3-stage sensor data pipeline.
 * Estágio 1 roda primeiro (fornece city para Estágio 3).
 * Estágios 2, 2B e 3 rodam em paralelo via Promise.allSettled.
 * Stage 3 usa Open-Meteo (default, sem key) ou OWM (com apiKey).
 *
 * @param {SensorFetchOptions} [options]
 * @returns {Promise<SensorFetchResult>} Pipeline result
 */
/** Default endpoint templates */
const DEFAULT_ENDPOINTS: TsSensorEndpoints = {
    identity: 'https://jsonplaceholder.typicode.com/users/{userId}',
    metadata:
        'https://fakerapi.it/api/v1/custom?_quantity=1&uuid=uuid&serial=buildingNumber&coord_lat=latitude&coord_lon=longitude',
    readings: 'https://fakerapi.it/api/v1/custom?_quantity=1&{fields}',
};

/**
 * @param {SensorFetchOptions} [options]
 * @returns {Promise<SensorFetchResult>}
 */
export async function fetchSensorData(
    options: TsSensorFetchOptions = {},
): Promise<TsSensorFetchResult> {
    const userId = options.userId || Math.ceil(Math.random() * 10);
    const apiKey = options.apiKey || '';
    const monitoredParameters = options.monitoredParameters || [];
    const previousReadings = options.previousReadings || [];
    const geoCoordinates = options.geoCoordinates || null;
    const endpoints: TsSensorEndpoints = { ...DEFAULT_ENDPOINTS, ...(options.endpoints || {}) };
    const errors: string[] = [];

    // Stage 1 first - need city for Stage 3 OWM fallback
    const identity = await fetchIdentity(userId, endpoints.identity);
    if (identity._status === 'error' && identity._error) errors.push(identity._error);

    // Build readings URL from template + monitored params
    const readingsFields = monitoredParameters
        .slice(0, 10)
        .map((id) => `${id}=number`)
        .join('&');
    const readingsUrl = endpoints.readings ? endpoints.readings.replace('{fields}', readingsFields) : null;

    // Stage 3: Open-Meteo (default, sem key) ou OWM (com apiKey)
    const weatherPromise = geoCoordinates
        ? fetchOpenMeteo(geoCoordinates.latitude, geoCoordinates.longitude)
        : fetchWeather(identity.city, apiKey);

    // Stages 2 + 2B + 3 in parallel
    const [metaResult, readingsResult, weatherResult] = await Promise.allSettled([
        fetchMetadata(endpoints.metadata),
        fetchReadings(monitoredParameters, readingsUrl, previousReadings),
        weatherPromise,
    ]);

    /** @type {MetadataResult} */
    const metadata: TsMetadataResult =
        metaResult.status === 'fulfilled'
            ? metaResult.value
            : {
                  _status: 'error',
                  _error: 'Stage 2: Promise rejected',
                  uuid: crypto.randomUUID(),
                  serial: 'SN-0000',
                  fakeCoord: { lat: 0, lng: 0 },
              };

    /** @type {ReadingsResult} */
    const readings: TsReadingsResult =
        readingsResult.status === 'fulfilled'
            ? readingsResult.value
            : { _status: 'error', _error: 'Stage 2B: Promise rejected', readings: [] };

    /** @type {WeatherResult} */
    const weather: TsWeatherResult =
        weatherResult.status === 'fulfilled'
            ? weatherResult.value
            : {
                  _status: 'error',
                  _error: 'Stage 3: Promise rejected',
                  temperature: null,
                  humidity: null,
                  pressure: null,
                  description: 'unavailable',
                  operationalStatus: false,
              };

    if (metadata._status === 'error' && metadata._error) errors.push(metadata._error);
    if (readings._status === 'error' && readings._error) errors.push(readings._error);
    if (weather._status === 'error' && weather._error) errors.push(weather._error);

    // Injetar dados reais do weather nos readings correspondentes
    // Evita contradição (weather=22°C, reading=15°C)
    const finalReadings = injectWeatherIntoReadings(readings.readings || [], weather);

    return { identity, metadata, readings: finalReadings, weather, errors, userId };
}

/**
 * Inject real weather values into matching readings.
 * Substitui valores sintéticos por dados reais do Open-Meteo/OWM
 * para parâmetros que têm equivalente meteorológico.
 *
 * @param readings - Leituras do Stage 2B
 * @param weather - Resultado do Stage 3
 * @returns Readings com valores reais onde disponível
 */
/**
 * @param {SensorReading[]} readings
 * @param {WeatherResult} weather
 * @returns {SensorReading[]}
 */
function injectWeatherIntoReadings(readings: TsSensorReading[], weather: TsWeatherResult): TsSensorReading[] {
    if (!weather || weather._status !== 'ok' || !weather._rawCurrent) {
        return readings;
    }

    const raw = weather._rawCurrent;
    const now = new Date().toISOString();

    // Mapa de valores reais disponíveis
    /** @type {Record<string, number>} */
    const realValues: Record<string, number> = {};
    for (const [meteoKey, paramId] of Object.entries(WEATHER_PARAM_MAP)) {
        const rawValue = raw[meteoKey];
        if (typeof rawValue === 'number') {
            realValues[paramId] = rawValue;
        }
    }

    // Substituir nos readings existentes
    const updated = readings.map((r) => {
        const realValue = realValues[r.parameterId];
        if (realValue != null) {
            const range = PARAM_RANGES[r.parameterId];
            return {
                ...r,
                value: parseFloat(realValue.toFixed(range?.decimals ?? 1)),
                source: 'open-meteo',
                timestamp: now,
            };
        }
        return r;
    });

    // Adicionar readings para params weather que estão monitorados mas não tinham reading
    const existingIds = new Set(updated.map((r) => r.parameterId));
    for (const [paramId, _value] of Object.entries(realValues)) {
        if (!existingIds.has(paramId)) continue; // Só injeta se param está monitorado
        // Já foi atualizado acima
    }

    return updated;
}
