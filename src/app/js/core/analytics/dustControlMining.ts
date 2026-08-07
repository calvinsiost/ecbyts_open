// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Dust Control in Mining Operations
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Dust Control in Mining Operations (DustControlMining)
 *
 * Módulo puro implementando cálculos de controle de poeira em mineração:
 * fator de emissão AP-42, eficiência de supressão por água, exposição pessoal
 * NR-15 e classificação de medidas de controle. Zero dependências de DOM,
 * IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - US EPA (2006). AP-42 Compilation of Air Pollutant Emission Factors,
 *     Volume I, Section 13.2.2: Unpaved Roads. US Environmental Protection
 *     Agency, Research Triangle Park, NC. (PM10 emission factor formula)
 *   - NIOSH Method 0600 (2003). Particulates Not Otherwise Regulated, Respirable.
 *     NIOSH Manual of Analytical Methods (NMAM), 4th ed. Cincinnati, OH: NIOSH.
 *     (occupational dust sampling methodology)
 *   - Brasil MTE (2014). NR-15 - Atividades e Operações Insalubres. Ministério
 *     do Trabalho e Emprego, Brasília. Anexo XII: Poeiras Minerais.
 *     (TWA limite: 8 mg/m³ para poeira inerte)
 *
 * @module dustControlMining
 */

'use strict';

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

// AP-42 Section 13.2.2 constants for unpaved roads - PM10
// Constantes AP-42 para estradas não pavimentadas - PM10
const AP42_K = 0.423; // emission factor constant
const AP42_A = 0.9; // vehicle speed exponent
const AP42_B = 0.45; // silt content exponent

// NR-15 Limit - Inert dust TWA (mg/m³)
// Limite NR-15 - Poeira inerte média ponderada (mg/m³)
const NR15_TWA_LIMIT_MG_M3 = 8;

/**
 * Computes dust emission factor for unpaved mining roads (EPA AP-42 §13.2.2).
 * Calcula o fator de emissão de poeira para estradas não pavimentadas em mineração.
 *
 *   EF = k × (s/12)^a × (S/48)^b × ((365 − p) / 365)
 *
 * Where: k=0.423 (PM10), a=0.9, b=0.45, p=precipitation days (default 60),
 *        s=silt content (%), S=vehicle speed (km/h).
 *
 * @param vehicleSpeed_km_h - Vehicle speed (km/h). Velocidade do veículo (km/h).
 * @param numberOfAxles - Number of axles (integer ≥ 2). Número de eixos.
 * @param moistureContent_pct - Road surface moisture (%). Umidade da superfície (%).
 * @param siltContent_pct - Silt content of road surface (%). Teor de silte (%).
 * @returns Emission factor (kg/VKT) and PM10 (g/km).
 * @throws {RangeError} If any input is out of valid range.
 */
export function computeDustEmissionFactor(
    vehicleSpeed_km_h: number,
    numberOfAxles: number,
    moistureContent_pct: number,
    siltContent_pct: number,
): { ef_kg_VKT: number; pm10_g_km: number } {
    if (vehicleSpeed_km_h <= 0) throw new RangeError('vehicleSpeed_km_h must be > 0');
    if (!Number.isInteger(numberOfAxles) || numberOfAxles < 2)
        throw new RangeError('numberOfAxles must be an integer >= 2');
    if (moistureContent_pct < 0 || moistureContent_pct > 100)
        throw new RangeError('moistureContent_pct must be in [0, 100]');
    if (siltContent_pct <= 0 || siltContent_pct > 100) throw new RangeError('siltContent_pct must be in (0, 100]');

    // Dias de precipitação default = 60 (reduz emissão proporcional aos dias secos)
    const p = 60;

    // Fórmula AP-42: EF em kg por veículo-quilômetro (VKT)
    const ef_kg_VKT =
        AP42_K * Math.pow(siltContent_pct / 12, AP42_A) * Math.pow(vehicleSpeed_km_h / 48, AP42_B) * ((365 - p) / 365);

    // Conversão para g/km (× 1000)
    const pm10_g_km = ef_kg_VKT * 1000;

    return { ef_kg_VKT, pm10_g_km };
}

/**
 * Computes water suppression efficiency for dust control.
 * Calcula a eficiência da supressão de poeira por aplicação de água.
 *
 *   η = 100 × (1 − exp(−k × AR))
 *   where k = 0.15 L⁻¹·m² (empirical constant)
 *
 * @param applicationRate_L_m2 - Water application rate (L/m²). Taxa de aplicação de água (L/m²).
 * @param dustConcentration_mg_m3 - Ambient dust concentration (mg/m³). Concentração de poeira (mg/m³).
 * @param moistureContent_pct - Surface moisture after application (%). Umidade após aplicação (%).
 * @returns Efficiency (%) and residual dust (mg/m³).
 * @throws {RangeError} If applicationRate_L_m2 or dustConcentration_mg_m3 are non-positive.
 */
export function computeWaterSuppressionEfficiency(
    applicationRate_L_m2: number,
    dustConcentration_mg_m3: number,
    moistureContent_pct: number,
): { efficiency_pct: number; residualDust_mg_m3: number } {
    if (applicationRate_L_m2 <= 0) throw new RangeError('applicationRate_L_m2 must be > 0');
    if (dustConcentration_mg_m3 <= 0) throw new RangeError('dustConcentration_mg_m3 must be > 0');
    if (moistureContent_pct < 0 || moistureContent_pct > 100)
        throw new RangeError('moistureContent_pct must be in [0, 100]');

    // Constante empírica de supressão por água
    const k = 0.15;

    // Eficiência de remoção de poeira (%)
    const efficiency_pct = 100 * (1 - Math.exp(-k * applicationRate_L_m2));

    // Poeira residual após supressão
    const residualDust_mg_m3 = dustConcentration_mg_m3 * (1 - efficiency_pct / 100);

    return { efficiency_pct, residualDust_mg_m3 };
}

/**
 * Computes personal dust exposure and checks against NR-15 TWA limit.
 * Calcula a exposição pessoal à poeira e verifica limite NR-15.
 *
 *   E = ambientConc × duration / protectionFactor
 *   TWA = E / duration
 *
 * @param ambientConc_mg_m3 - Ambient concentration (mg/m³). Concentração ambiente (mg/m³).
 * @param workduration_h - Work duration (h). Duração do trabalho (h).
 * @param protectionFactor - PPE protection factor (dimensionless, ≥ 1). Fator de proteção do EPI.
 * @returns Exposure (mg/m³·h), TWA (mg/m³) and NR-15 exceedance flag.
 * @throws {RangeError} If ambientConc, workduration, or protectionFactor are out of range.
 */
export function computePersonalExposure(
    ambientConc_mg_m3: number,
    workduration_h: number,
    protectionFactor: number,
): { exposure_mg_m3_h: number; twa_mg_m3: number; exceedsNR15: boolean } {
    if (ambientConc_mg_m3 <= 0) throw new RangeError('ambientConc_mg_m3 must be > 0');
    if (workduration_h <= 0) throw new RangeError('workduration_h must be > 0');
    if (protectionFactor < 1) throw new RangeError('protectionFactor must be >= 1 (no protection = 1)');

    // Exposição total ponderada pelo EPI
    const exposure_mg_m3_h = (ambientConc_mg_m3 * workduration_h) / protectionFactor;

    // Média ponderada no tempo (TWA = Time-Weighted Average)
    const twa_mg_m3 = exposure_mg_m3_h / workduration_h;

    // Verifica ultrapassagem do limite NR-15 Anexo XII (poeira inerte: 8 mg/m³)
    const exceedsNR15 = twa_mg_m3 > NR15_TWA_LIMIT_MG_M3;

    return { exposure_mg_m3_h, twa_mg_m3, exceedsNR15 };
}

/**
 * Classifies dust control measures required for a given emission scenario.
 * Classifica as medidas de controle de poeira recomendadas para o cenário.
 *
 * @param emissionRate_kg_h - Emission rate (kg/h). Taxa de emissão (kg/h).
 * @param receptorDistance_m - Distance to nearest receptor (m). Distância ao receptor (m).
 * @param windSpeed_m_s - Wind speed (m/s). Velocidade do vento (m/s).
 * @returns Required measures and priority level.
 * @throws {RangeError} If any input is non-positive.
 */
export function classifyDustControlMeasure(
    emissionRate_kg_h: number,
    receptorDistance_m: number,
    windSpeed_m_s: number,
): { required: string[]; priority: string } {
    if (emissionRate_kg_h <= 0) throw new RangeError('emissionRate_kg_h must be > 0');
    if (receptorDistance_m <= 0) throw new RangeError('receptorDistance_m must be > 0');
    if (windSpeed_m_s <= 0) throw new RangeError('windSpeed_m_s must be > 0');

    const required = ['watering']; // sempre recomendado / always recommended
    let priorityScore = 0;

    // Barreiras quebra-vento para ventos moderados/fortes
    if (windSpeed_m_s > 5) {
        required.push('windbreaks');
        priorityScore += 1;
    }

    // Enclausuramento para alta emissão
    if (emissionRate_kg_h > 10) {
        required.push('enclosure');
        priorityScore += 2;
    }

    // EPI obrigatório se receptor próximo (< 50 m)
    if (receptorDistance_m < 50) {
        required.push('PPE');
        priorityScore += 2;
    }

    let priority: string;
    if (priorityScore === 0) priority = 'low';
    else if (priorityScore <= 1) priority = 'medium';
    else if (priorityScore <= 3) priority = 'high';
    else priority = 'critical';

    return { required, priority };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const dustControlMiningMeta: AnalyticsModuleMeta = {
    name: 'dustControlMining',
    description: 'Dust Control in Mining Operations',
    category: 'analytics',
    familyTags: ['mining'],
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
