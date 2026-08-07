// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Environmental DNA (eDNA) Monitoring Analytics
// Analítica de monitoramento por DNA ambiental - detecção de espécies, concentração e distância de fonte.
// Refs: Jerde et al. (2011) Conservation Letters DOI:10.1111/j.1755-263X.2010.00158.x;
//       Thomsen & Willerslev (2015) Mol Ecol DOI:10.1111/mec.13048;
//       Klymus et al. (2020) Environ DNA DOI:10.1002/edn3.29;
//       IUCN eDNA Standards (2021)

'use strict';

/**
 * Computes eDNA detection probability using a Poisson capture model.
 * Calcula a probabilidade de detecção de eDNA usando modelo de captura de Poisson.
 *
 * @param copies_per_L - eDNA copies per liter in the water body (cópias de eDNA por litro no corpo hídrico), ≥ 0
 * @param detection_threshold_copies_L - Minimum copies/L required for detection (limiar mínimo de cópias/L para detecção), > 0
 * @param sample_volume_L - Volume of water sample collected in liters (volume de amostra coletada em litros), > 0
 */
export function computeDetectionProbability(
    copies_per_L: number,
    detection_threshold_copies_L: number,
    sample_volume_L: number,
): { probability: number; detected: boolean } {
    if (
        typeof copies_per_L !== 'number' ||
        typeof detection_threshold_copies_L !== 'number' ||
        typeof sample_volume_L !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (copies_per_L < 0) throw new RangeError('copies_per_L must be >= 0');
    if (detection_threshold_copies_L <= 0) throw new RangeError('detection_threshold_copies_L must be > 0');
    if (sample_volume_L <= 0) throw new RangeError('sample_volume_L must be > 0');

    // Modelo de Poisson: P = 1 - exp(-lambda), onde lambda = cópias × volume / limiar
    // Representa a probabilidade de capturar ao menos 1 cópia detectável
    const lambda = (copies_per_L * sample_volume_L) / detection_threshold_copies_L;
    const probability = 1 - Math.exp(-lambda);

    // Detecção confirmada quando probabilidade > 0.95 (IUCN eDNA Standards 2021)
    const detected = probability > 0.95;

    return { probability, detected };
}

/**
 * Estimates eDNA source distance using exponential dilution model.
 * Estima a distância da fonte de eDNA usando modelo de diluição exponencial em fluxo.
 *
 * @param concentration_copies_L - Measured eDNA concentration in copies/L (concentração medida em cópias/L), > 0
 * @param emission_rate_copies_s - Source emission rate in copies/s (taxa de emissão da fonte em cópias/s), > 0
 * @param flow_rate_m3_s - River/stream flow rate in m³/s (vazão do rio/córrego em m³/s), > 0
 * @param degradation_rate_h - eDNA first-order degradation rate in /h (taxa de degradação de primeira ordem em /h), > 0
 */
export function computeSourceDistance(
    concentration_copies_L: number,
    emission_rate_copies_s: number,
    flow_rate_m3_s: number,
    degradation_rate_h: number,
): { distance_m: number; travel_time_h: number } {
    if (
        typeof concentration_copies_L !== 'number' ||
        typeof emission_rate_copies_s !== 'number' ||
        typeof flow_rate_m3_s !== 'number' ||
        typeof degradation_rate_h !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (concentration_copies_L <= 0) throw new RangeError('concentration_copies_L must be > 0');
    if (emission_rate_copies_s <= 0) throw new RangeError('emission_rate_copies_s must be > 0');
    if (flow_rate_m3_s <= 0) throw new RangeError('flow_rate_m3_s must be > 0');
    if (degradation_rate_h <= 0) throw new RangeError('degradation_rate_h must be > 0');

    // Concentração máxima na fonte (emissão diluída pela vazão)
    // E (cópias/s) / Q (m³/s) × 0.001 (m³→L) = cópias/L
    const C_source = (emission_rate_copies_s / flow_rate_m3_s) * 0.001;
    if (concentration_copies_L >= C_source) {
        throw new RangeError(
            'concentration_copies_L must be < emission_rate / flow_rate (C >= C_source at source is physically impossible downstream)',
        );
    }

    // Velocidade estimada do fluxo: seção transversal típica simplificada (v = Q/A, A estimado = 10 m²)
    const cross_section_m2 = 10;
    const velocity_m_s = flow_rate_m3_s / cross_section_m2;
    const velocity_m_h = velocity_m_s * 3600;

    // Inversão do modelo exponencial: C = C_source × exp(-k × d / v)
    // d = -ln(C / C_source) × v / k
    const k_h = degradation_rate_h;
    const distance_m = (-Math.log(concentration_copies_L / C_source) * velocity_m_h) / k_h;
    const travel_time_h = distance_m / velocity_m_h;

    return { distance_m, travel_time_h };
}

/**
 * Computes eDNA degradation half-life in environmental conditions.
 * Calcula a meia-vida de degradação do eDNA em condições ambientais (temperatura, UV, turbidez).
 *
 * @param temperature_c - Water temperature in °C (temperatura da água em °C)
 * @param uv_index - UV index (índice UV), ≥ 0
 * @param turbidity_NTU - Turbidity in NTU (turbidez em NTU), ≥ 0
 */
export function computeDegradationHalfLife(
    temperature_c: number,
    uv_index: number,
    turbidity_NTU: number,
): { half_life_h: number; k_degradation_h: number } {
    if (typeof temperature_c !== 'number' || typeof uv_index !== 'number' || typeof turbidity_NTU !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (uv_index < 0) throw new RangeError('uv_index must be >= 0');
    if (turbidity_NTU < 0) throw new RangeError('turbidity_NTU must be >= 0');

    // Meia-vida de referência a 20°C, sem UV e sem turbidez: t½_ref = 24h (Thomsen & Willerslev 2015)
    const t_half_ref = 24; // horas

    // Coeficientes empíricos de sensibilidade ambiental
    const alpha = 0.07; // /°C — sensibilidade térmica (Q10 simplificado)
    const beta = 0.1; // /UV — fotodegradação
    const gamma = 0.02; // /NTU — efeito da turbidez (proteção vs. adsorção)

    // Meia-vida ajustada: maior temperatura e UV reduzem a meia-vida
    const half_life_h =
        (t_half_ref * Math.exp(-alpha * (temperature_c - 20))) / (1 + beta * uv_index + gamma * turbidity_NTU);

    // Taxa de degradação de primeira ordem: k = ln(2) / t½
    const k_degradation_h = Math.LN2 / half_life_h;

    return { half_life_h, k_degradation_h };
}

function validateConfidenceInputs(
    replicates_positive: number,
    total_replicates: number,
    copies_per_L: number,
    blank_contamination: number,
): void {
    if (
        typeof replicates_positive !== 'number' ||
        typeof total_replicates !== 'number' ||
        typeof copies_per_L !== 'number' ||
        typeof blank_contamination !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (replicates_positive < 0) throw new RangeError('replicates_positive must be >= 0');
    if (total_replicates < 1) throw new RangeError('total_replicates must be >= 1');
    if (replicates_positive > total_replicates)
        throw new RangeError('replicates_positive cannot exceed total_replicates');
    if (copies_per_L < 0) throw new RangeError('copies_per_L must be >= 0');
    if (blank_contamination < 0) throw new RangeError('blank_contamination must be >= 0');
}

function isConfirmedDetection(
    occupancy_ratio: number,
    copies_per_L: number,
    blank_contamination: number,
): boolean {
    if (occupancy_ratio < 0.7) return false;
    if (copies_per_L <= 0) return false;
    if (blank_contamination > 0) {
        return copies_per_L > blank_contamination * 10;
    }
    return true;
}

function determineConfidenceLevel(
    is_confirmed: boolean,
    occupancy_ratio: number,
    copies_per_L: number,
    blank_contamination: number,
): string {
    if (is_confirmed) return 'confirmed';
    if (occupancy_ratio >= 0.5 && copies_per_L > blank_contamination * 5) return 'high';
    if (occupancy_ratio >= 0.3 && copies_per_L > blank_contamination) return 'moderate';
    return 'low';
}

/**
 * Classifies eDNA detection confidence based on replication and contamination control.
 * Classifica a confiança na detecção de eDNA com base em replicação e controle de contaminação (IUCN 2021).
 *
 * @param replicates_positive - Number of positive replicates (número de replicatas positivas), ≥ 0
 * @param total_replicates - Total number of replicates (total de replicatas), ≥ 1
 * @param copies_per_L - eDNA concentration in copies/L (concentração de eDNA em cópias/L), ≥ 0
 * @param blank_contamination - Copies/L detected in field blank (cópias/L no branco de campo), ≥ 0
 */
export function classifyDetectionConfidence(
    replicates_positive: number,
    total_replicates: number,
    copies_per_L: number,
    blank_contamination: number,
): { confidence: string; occupancy_estimate: number } {
    validateConfidenceInputs(replicates_positive, total_replicates, copies_per_L, blank_contamination);

    const occupancy_estimate = replicates_positive / total_replicates;
    const is_confirmed = isConfirmedDetection(occupancy_estimate, copies_per_L, blank_contamination);
    const confidence = determineConfidenceLevel(is_confirmed, occupancy_estimate, copies_per_L, blank_contamination);

    return { confidence, occupancy_estimate };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const environmentalDNAMonitoringMeta = {
    name: 'environmentalDNAMonitoring',
    description: 'environmentalDNAMonitoring',
    category: 'analytics',
    familyTags: ['environmental'],
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
