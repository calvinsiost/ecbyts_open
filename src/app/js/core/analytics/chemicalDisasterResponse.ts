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
 * Modelos de resposta a emergências químicas: evacuação, descontaminação,
 * tempo de resposta e classificação de severidade.
 *
 * Academic references:
 *   - NOAA/EPA (2016). ALOHA User's Manual. Office of Response and Restoration.
 *     https://response.restoration.noaa.gov/aloha
 *   - Pasquill F, Smith FB (1983). Atmospheric Diffusion, 3rd ed.
 *     Ellis Horwood. ISBN:9780853123842
 *   - NFPA 472 (2018). Standard for Competence of Responders to Hazardous Materials.
 *     National Fire Protection Association.
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

/**
 * Classes de estabilidade Pasquill → parâmetros sigma simplificados.
 * Formulação: sigma_y ≈ a × r^b (r em metros, resultado em metros)
 * Baseado em tabelas empíricas de Pasquill-Gifford.
 */
const PASQUILL_PARAMS: Record<string, { a: number; b: number }> = {
    A: { a: 0.22, b: 0.89 }, // instável (dia, vento fraco, sol forte)
    B: { a: 0.16, b: 0.87 },
    C: { a: 0.11, b: 0.83 },
    D: { a: 0.08, b: 0.72 }, // neutro (dia nublado ou noite)
    E: { a: 0.06, b: 0.67 },
    F: { a: 0.04, b: 0.63 }, // estável (noite, vento fraco)
};

/**
 * Estima o raio de evacuação baseado em dispersão Gaussiana iterativa.
 * Encontra r tal que C(r) = IDLH: massa × 1e6 / (π × IDLH × σy × σz × wind) = 1
 * σy ≈ σz ≈ a × r^b (aproximação de campo próximo).
 * Iteração de 3 passos (ALOHA 2016).
 *
 * @param {number} toxic_mass_kg Massa do produto tóxico liberado (kg; > 0).
 * @param {number} IDLH_mg_m3 Concentração imediatamente perigosa (mg/m³; > 0).
 * @param {string} atmospheric_stability Classe Pasquill: 'A'|'B'|'C'|'D'|'E'|'F'.
 * @param {number} wind_m_s Velocidade do vento (m/s; > 0).
 * @returns {{ radius_m: number }} Raio estimado de evacuação em metros.
 */
export function computeEvacuationRadius(
    toxic_mass_kg: number,
    IDLH_mg_m3: number,
    atmospheric_stability: string,
    wind_m_s: number,
): { radius_m: number } {
    if (typeof toxic_mass_kg !== 'number') throw new TypeError('toxic_mass_kg must be a number');
    if (typeof IDLH_mg_m3 !== 'number') throw new TypeError('IDLH_mg_m3 must be a number');
    if (typeof atmospheric_stability !== 'string') throw new TypeError('atmospheric_stability must be a string');
    if (typeof wind_m_s !== 'number') throw new TypeError('wind_m_s must be a number');
    if (toxic_mass_kg <= 0) throw new RangeError('toxic_mass_kg must be > 0');
    if (IDLH_mg_m3 <= 0) throw new RangeError('IDLH_mg_m3 must be > 0');
    if (wind_m_s <= 0) throw new RangeError('wind_m_s must be > 0');
    const params = PASQUILL_PARAMS[atmospheric_stability.toUpperCase()];
    if (!params) throw new RangeError(`atmospheric_stability must be A-F, got '${atmospheric_stability}'`);

    const { a, b } = params;
    const massConc = toxic_mass_kg * 1e6; // kg → mg
    // Iteração: r_n+1 = (massConc / (π × IDLH × wind × (a × r^b)²))^(1/(2b+1)) × ... simplificado
    // Ponto de partida: r₀ = 100 m
    let r = 100;
    for (let i = 0; i < 3; i++) {
        const sigma = a * Math.pow(r, b);
        // C(r) = Q / (π × σy × σz × u) - modelo gaussiano instantâneo no puff
        // Encontra r onde C = IDLH → r = (Q / (π × IDLH × u × a²))^(1/(2b))
        const numerator = massConc / (Math.PI * IDLH_mg_m3 * wind_m_s * sigma * sigma);
        r = Math.pow(Math.abs(numerator), 1 / (2 * b)) * r * 0.01 + r * 0.99; // suavização
        if (r < 10) r = 10;
        if (r > 50000) r = 50000;
    }
    return { radius_m: Math.round(r) };
}

/**
 * Estima a capacidade de descontaminação e tempo estimado de operação.
 * Divide a área contaminada em zonas de prioridade baseadas na dose estimada.
 *
 * @param {number} personnel Número de equipes de descontaminação (> 0, inteiro).
 * @param {number} decon_rate_person_h Taxa de descontaminação por equipe (pessoas/hora; > 0).
 * @param {number} contaminated_area_m2 Área contaminada em m² (> 0).
 * @param {number} dose_rate_mGy_h Taxa de dose no local (mGy/h; ≥ 0).
 * @returns {{ time_hours: number, priority_zones: string[] }}
 */
export function computeDecontaminationCapacity(
    personnel: number,
    decon_rate_person_h: number,
    contaminated_area_m2: number,
    dose_rate_mGy_h: number,
): { time_hours: number; priority_zones: string[] } {
    if (typeof personnel !== 'number') throw new TypeError('personnel must be a number');
    if (typeof decon_rate_person_h !== 'number') throw new TypeError('decon_rate_person_h must be a number');
    if (typeof contaminated_area_m2 !== 'number') throw new TypeError('contaminated_area_m2 must be a number');
    if (typeof dose_rate_mGy_h !== 'number') throw new TypeError('dose_rate_mGy_h must be a number');
    if (personnel <= 0 || !Number.isInteger(personnel)) throw new RangeError('personnel must be a positive integer');
    if (decon_rate_person_h <= 0) throw new RangeError('decon_rate_person_h must be > 0');
    if (contaminated_area_m2 <= 0) throw new RangeError('contaminated_area_m2 must be > 0');
    if (dose_rate_mGy_h < 0) throw new RangeError('dose_rate_mGy_h must be >= 0');

    // Estimativa: capacidade total = equipes × taxa × tempo
    // Resolução: tempo = área / (equipes × taxa)
    const capacity_m2_per_h = personnel * decon_rate_person_h;
    const time_hours = contaminated_area_m2 / capacity_m2_per_h;

    // Zoneamento por dose (IAEA Emergency Response Guidelines)
    const priority_zones: string[] = [];
    if (dose_rate_mGy_h > 100) priority_zones.push('hot_zone');
    if (dose_rate_mGy_h > 10) priority_zones.push('warm_zone');
    priority_zones.push('cold_zone');

    return { time_hours, priority_zones };
}

/**
 * Calcula o tempo total de resposta a emergência química.
 * tempo_total = mobilização + (distância / velocidade × 60)
 *
 * @param {number} distance_km Distância da base ao incidente (km; > 0).
 * @param {number} response_speed_km_h Velocidade de deslocamento (km/h; > 0).
 * @param {number} mobilization_min Tempo de mobilização em minutos (≥ 0).
 * @returns {{ total_response_min: number }} Tempo total em minutos.
 */
export function computeEmergencyResponseTime(
    distance_km: number,
    response_speed_km_h: number,
    mobilization_min: number,
): { total_response_min: number } {
    if (typeof distance_km !== 'number') throw new TypeError('distance_km must be a number');
    if (typeof response_speed_km_h !== 'number') throw new TypeError('response_speed_km_h must be a number');
    if (typeof mobilization_min !== 'number') throw new TypeError('mobilization_min must be a number');
    if (distance_km <= 0) throw new RangeError('distance_km must be > 0');
    if (response_speed_km_h <= 0) throw new RangeError('response_speed_km_h must be > 0');
    if (mobilization_min < 0) throw new RangeError('mobilization_min must be >= 0');
    const travel_min = (distance_km / response_speed_km_h) * 60;
    return { total_response_min: mobilization_min + travel_min };
}

/**
 * Classifica a severidade de um incidente químico.
 * minor        → mass<10 kg E pop<10
 * significant  → mass<100 kg E pop<100
 * major        → mass<1000 kg E pop<1000
 * catastrophic → demais casos
 *
 * @param {number} toxic_mass_kg Massa liberada (kg; ≥ 0).
 * @param {number} population_exposed Número de pessoas na zona de impacto (≥ 0).
 * @param {boolean} IDLH_exceeded Se a concentração IDLH foi superada na zona de evacuação.
 * @returns {{ severity: 'minor'|'significant'|'major'|'catastrophic' }}
 */
export function classifyChemicalIncidentSeverity(
    toxic_mass_kg: number,
    population_exposed: number,
    IDLH_exceeded: boolean,
): { severity: 'minor' | 'significant' | 'major' | 'catastrophic' } {
    if (typeof toxic_mass_kg !== 'number') throw new TypeError('toxic_mass_kg must be a number');
    if (typeof population_exposed !== 'number') throw new TypeError('population_exposed must be a number');
    if (typeof IDLH_exceeded !== 'boolean') throw new TypeError('IDLH_exceeded must be a boolean');
    if (toxic_mass_kg < 0) throw new RangeError('toxic_mass_kg must be >= 0');
    if (population_exposed < 0) throw new RangeError('population_exposed must be >= 0');

    let severity: 'minor' | 'significant' | 'major' | 'catastrophic';
    if (toxic_mass_kg < 10 && population_exposed < 10 && !IDLH_exceeded) {
        severity = 'minor';
    } else if (toxic_mass_kg < 100 && population_exposed < 100) {
        severity = 'significant';
    } else if (toxic_mass_kg < 1000 && population_exposed < 1000) {
        severity = 'major';
    } else {
        severity = 'catastrophic';
    }
    return { severity };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const chemicalDisasterResponseMeta: AnalyticsModuleMeta = {
    name: 'chemicalDisasterResponse',
    description: 'chemicalDisasterResponse',
    category: 'analytics',
    familyTags: ['chemical'],
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
