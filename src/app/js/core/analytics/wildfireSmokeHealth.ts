// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Wildfire Smoke Health Impact Module
// Módulo de impactos de saúde da fumaça de incêndios florestais - PM2.5, exposição cumulativa e risco cardiovascular.
//
// References / Referências:
// - EPA AQI Technical Assistance Document (2024)
// - WHO (2021) Global Air Quality Guidelines
// - Dockery et al. (1993) NEJM DOI:10.1056/NEJM199312093292401
// - Liu et al. (2015) Environ Health Perspect wildfire PM2.5

'use strict';

/**
 * Compute PM2.5 concentration at a downwind distance using simplified Gaussian dispersion.
 * Calcula a concentração de PM2.5 a uma distância sotavento usando dispersão gaussiana simplificada.
 *
 * @param {number} fire_area_ha - Fire area in hectares / Área do incêndio em hectares
 * @param {number} fuel_load_t_ha - Fuel load in tonnes per hectare / Carga de combustível em t/ha
 * @param {number} emission_factor_g_kg - Emission factor in g PM2.5 per kg fuel / Fator de emissão em g PM2.5 por kg de combustível
 * @param {number} mixing_height_m - Atmospheric mixing height in metres / Altura de mistura atmosférica em metros
 * @param {number} wind_speed_m_s - Wind speed in m/s / Velocidade do vento em m/s
 * @param {number} distance_km - Downwind distance in km / Distância sotavento em km
 * @returns {{ pm25_ug_m3: number }} Estimated PM2.5 concentration / Concentração estimada de PM2.5
 */
export function computeSmokeConcentration(
    fire_area_ha: any,
    fuel_load_t_ha: any,
    emission_factor_g_kg: any,
    mixing_height_m: any,
    wind_speed_m_s: any,
    distance_km: any,
) {
    if (typeof fire_area_ha !== 'number' || fire_area_ha <= 0)
        throw new RangeError('fire_area_ha must be a positive number');
    if (typeof fuel_load_t_ha !== 'number' || fuel_load_t_ha <= 0)
        throw new RangeError('fuel_load_t_ha must be a positive number');
    if (typeof emission_factor_g_kg !== 'number' || emission_factor_g_kg <= 0)
        throw new RangeError('emission_factor_g_kg must be a positive number');
    if (typeof mixing_height_m !== 'number' || mixing_height_m <= 0)
        throw new RangeError('mixing_height_m must be a positive number');
    if (typeof wind_speed_m_s !== 'number' || wind_speed_m_s <= 0)
        throw new RangeError('wind_speed_m_s must be a positive number');
    if (typeof distance_km !== 'number' || distance_km <= 0)
        throw new RangeError('distance_km must be a positive number (> 0)');

    // Emissão total: área × carga × fator / 1000 (converte g→kg, t→kg já incluso)
    // Total emission: area(ha) × fuel_load(t/ha) × 1000(kg/t) × EF(g/kg) → g; then /1e6 → t; × 1e6 → g/s approx
    // Simplificação: emissão em g/s assumindo duração de 1 hora (3600 s)
    const fuel_total_kg = fire_area_ha * fuel_load_t_ha * 1000; // kg
    const emission_g = fuel_total_kg * emission_factor_g_kg; // g total
    const emission_g_s = emission_g / 3600; // g/s assumindo 1h de queima

    // Desvios padrão gaussianos simplificados: σy = σz = 0.1 × distância (m)
    const distance_m = distance_km * 1000;
    const sigma = 0.1 * distance_m;

    // C (µg/m³) = E(g/s) / (π × σy × σz × u) × 1e6 µg/g
    // Fórmula de Pasquill-Gifford ponto-fonte simplificada
    const concentration_g_m3 = emission_g_s / (Math.PI * sigma * sigma * wind_speed_m_s);
    const pm25_ug_m3 = concentration_g_m3 * 1e6;

    return { pm25_ug_m3 };
}

/**
 * Compute cumulative PM2.5 exposure over multiple days and cigarette equivalent.
 * Calcula a exposição cumulativa a PM2.5 ao longo de vários dias e equivalente em cigarros.
 *
 * @param {number[]} daily_pm25_ug_m3 - Daily PM2.5 concentrations array / Array de concentrações diárias de PM2.5
 * @param {number} exposure_days - Number of exposure days / Número de dias de exposição
 * @returns {{ cumulative_ug_m3_days: number, equivalent_cigarettes: number }}
 */
export function computeCumulativeExposure(daily_pm25_ug_m3: any, exposure_days: any) {
    if (!Array.isArray(daily_pm25_ug_m3)) throw new TypeError('daily_pm25_ug_m3 must be an array');
    if (typeof exposure_days !== 'number' || exposure_days < 1)
        throw new RangeError('exposure_days must be a positive integer');
    if (daily_pm25_ug_m3.length !== exposure_days)
        throw new RangeError('daily_pm25_ug_m3 length must equal exposure_days');
    for (const v of daily_pm25_ug_m3) {
        if (typeof v !== 'number' || v < 0)
            throw new RangeError('all daily_pm25_ug_m3 values must be non-negative numbers');
    }

    // Exposição cumulativa = soma de todas as concentrações diárias (µg/m³·dia)
    const cumulative_ug_m3_days = daily_pm25_ug_m3.reduce((a, b) => a + b, 0);
    // Equivalente em cigarros: 1 cigarro ≈ 17 µg/m³·dia (Liu et al. 2015)
    const equivalent_cigarettes = cumulative_ug_m3_days / 17;

    return { cumulative_ug_m3_days, equivalent_cigarettes };
}

/**
 * Compute excess cardiovascular deaths from long-term PM2.5 exposure.
 * Calcula mortes cardiovasculares em excesso por exposição de longo prazo ao PM2.5.
 *
 * @param {number} pm25_annual_ug_m3 - Annual mean PM2.5 in µg/m³ / Média anual de PM2.5
 * @param {number} baseline_rate_per_100k - Baseline cardiovascular mortality rate per 100k / Taxa basal de mortalidade cardiovascular por 100k
 * @param {number} population - Exposed population / População exposta
 * @returns {{ excess_deaths: number, rr: number }} Excess deaths and relative risk / Mortes em excesso e risco relativo
 */
export function computeCardiovascularRisk(pm25_annual_ug_m3: any, baseline_rate_per_100k: any, population: any) {
    if (typeof pm25_annual_ug_m3 !== 'number' || pm25_annual_ug_m3 < 0)
        throw new RangeError('pm25_annual_ug_m3 must be >= 0');
    if (typeof baseline_rate_per_100k !== 'number' || baseline_rate_per_100k <= 0)
        throw new RangeError('baseline_rate_per_100k must be a positive number');
    if (typeof population !== 'number' || population <= 0) throw new RangeError('population must be a positive number');

    // RR = exp(0.006 × (PM2.5 - 5)) - WHO AQG 2021 coeficiente de risco cardiovascular
    // PM2.5 AQG = 5 µg/m³; coeficiente 0.006 por µg/m³ (Dockery et al. 1993)
    const rr = Math.exp(0.006 * (pm25_annual_ug_m3 - 5));
    // Mortes em excesso = população × taxa basal × (RR - 1)
    const excess_deaths = population * (baseline_rate_per_100k / 100000) * (rr - 1);

    return { excess_deaths, rr };
}

// AQI EPA PM2.5 breakpoints (24-h average µg/m³)
// Pontos de corte AQI da EPA para PM2.5 (média 24h em µg/m³)
const AQI_BREAKPOINTS = [
    { max: 12.0, category: 'good', actions: [] },
    {
        max: 35.4,
        category: 'moderate',
        actions: ['Unusually sensitive people should consider limiting prolonged outdoor exertion'],
    },
    {
        max: 55.4,
        category: 'unhealthy_sensitive',
        actions: ['Sensitive groups: limit prolonged outdoor exertion', 'Keep windows closed', 'Use air purifier'],
    },
    {
        max: 150.4,
        category: 'unhealthy',
        actions: [
            'Reduce prolonged or heavy outdoor exertion',
            'Take more breaks',
            'Wear N95 mask outdoors',
            'Keep windows closed',
        ],
    },
    {
        max: 250.4,
        category: 'very_unhealthy',
        actions: [
            'Avoid prolonged outdoor exertion',
            'Stay indoors',
            'Use air purifier with HEPA filter',
            'Wear N95/P100 mask if outdoors',
        ],
    },
    {
        max: Infinity,
        category: 'hazardous',
        actions: [
            'Remain indoors',
            'Keep all activity levels low',
            'Use air purifier',
            'Evacuate if instructed',
            'Seek medical attention if symptomatic',
        ],
    },
];

/**
 * Classify wildfire smoke exposure level and recommend protective actions.
 * Classifica o nível de exposição à fumaça de incêndio e recomenda ações de proteção.
 *
 * @param {number} pm25_ug_m3 - Current PM2.5 concentration / Concentração atual de PM2.5
 * @param {number} duration_h - Exposure duration in hours / Duração da exposição em horas
 * @param {boolean} sensitive_population - Whether population is sensitive / Se a população é sensível
 * @returns {{ category: string, protective_actions: string[] }}
 */
export function classifyWildfireSmokeExposure(pm25_ug_m3: any, duration_h: any, sensitive_population: any) {
    if (typeof pm25_ug_m3 !== 'number' || pm25_ug_m3 < 0) throw new RangeError('pm25_ug_m3 must be >= 0');
    if (typeof duration_h !== 'number' || duration_h <= 0) throw new RangeError('duration_h must be a positive number');
    if (typeof sensitive_population !== 'boolean') throw new TypeError('sensitive_population must be a boolean');

    // Para exposição longa (>8h), considera concentração efetiva ajustada
    // For long exposure (>8h), adjust effective concentration
    const effective_pm25 = duration_h > 8 ? pm25_ug_m3 * 1.2 : pm25_ug_m3;

    let idx = AQI_BREAKPOINTS.findIndex((bp) => effective_pm25 <= bp.max);
    if (idx < 0) idx = AQI_BREAKPOINTS.length - 1;

    // Populações sensíveis sobem uma categoria (exceto se já estiver em hazardous)
    if (sensitive_population && idx < AQI_BREAKPOINTS.length - 1) {
        idx = Math.min(idx + 1, AQI_BREAKPOINTS.length - 1);
    }

    const bp = AQI_BREAKPOINTS[idx];
const protective_actions = [...(bp as any).actions];
    if (sensitive_population && !protective_actions.includes('Sensitive groups: limit prolonged outdoor exertion')) {
        protective_actions.push('Consult physician if experiencing respiratory symptoms');
    }

return { category: bp!.category, protective_actions };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const wildfireSmokeHealthMeta = {
    name: 'wildfireSmokeHealth',
    description: 'wildfireSmokeHealth',
    category: 'analytics',
    familyTags: ['fire', 'wildfire'],
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
