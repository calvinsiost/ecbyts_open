// @ts-check
// Generated from src/app/js/core/analytics/thermalRadiationExposure.ts by TS-MIGRATION-001. Do not edit manually.
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
// Application: EHS & Mining - Thermal Radiation Exposure Assessment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/**
 * Thermal Radiation Exposure - Occupational heat stress and burn risk analytics
 *
 * Módulo puro implementando cálculos de exposição à radiação térmica para
 * trabalhadores em ambientes industriais e de mineração com fontes de calor
 * intensas (fornalhas, incêndios, operações de fundição, flares de refino).
 * Baseia-se em ACGIH TLV-TLV BEI (2024), ISO 13731:2001 e Stoll & Chianta (1969).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - ACGIH (2024). "TLVs and BEIs: Threshold Limit Values for Chemical
 *     Substances and Physical Agents & Biological Exposure Indices."
 *     American Conference of Governmental Industrial Hygienists, Cincinnati, OH.
 *     (limites de radiação térmica para trabalhadores, TLV-Heat Stress)
 *   - ISO 13731:2001. "Ergonomics of the thermal environment - Vocabulary and
 *     symbols." International Organization for Standardization, Geneva.
 *     (WBGT, irradiância, fluxo de calor radiante)
 *   - Stoll, A. M. & Chianta, M. A. (1969). "Method and rating system for
 *     evaluation of thermal protection." Aerospace Medicine 40(11), 1232–1238.
 *     (critério de queimadura de 2º grau - curva de Stoll)
 *   - API RP 521:2014. "Guide for Pressure-Relieving and Depressuring Systems."
 *     American Petroleum Institute, Washington, DC. 6th ed.
 *     (fluxo de calor de flares e fogões industriais, raios de segurança)
 *
 * @module core/analytics/thermalRadiationExposure
 */
'use strict';
/**
 * Stefan-Boltzmann constant (W·m⁻²·K⁻⁴).
 * Constante de Stefan-Boltzmann para cálculo de radiação de corpo negro.
 */
const STEFAN_BOLTZMANN = 5.670374419e-8;
/**
 * ACGIH TLV irradiance limits (W/m²) by exposure duration and clothing.
 * Limites de irradiância ACGIH (2024) por duração de exposição e proteção.
 * Values for unprotected skin (no reflective clothing).
 */
const ACGIH_TLV_TABLE = [
    { durationS: 10, tlvWm2: 8200 },
    { durationS: 30, tlvWm2: 4200 },
    { durationS: 60, tlvWm2: 2500 },
    { durationS: 300, tlvWm2: 1200 },
    { durationS: 1800, tlvWm2: 500 },
    { durationS: 3600, tlvWm2: 300 },
];
/**
 * Calculates thermal irradiance (W/m²) at a given distance from a radiating surface.
 *
 * Calcula a irradiância térmica (fluxo de calor radiante) recebida por um
 * trabalhador a uma distância r de uma superfície emissora plana circular.
 * Usa a Lei de Stefan-Boltzmann para fontes de corpo cinzento com emissividade ε
 * e fator de visão geométrico F (configuração fonte plana → receptor pontual).
 *
 * Formula: E = ε × σ × T⁴ × F × (A_source / (π × r²))
 * Simplificado para fonte pontual: E = ε × σ × T⁴ × A_source / (4π × r²)
 * (equivalente à lei do inverso do quadrado para fonte esférica isótropa)
 *
 * @param {number} sourceTempK      - Surface temperature of heat source (K, > 0)
 * @param {number} sourceAreaM2     - Radiating area of source (m², > 0)
 * @param {number} distanceM        - Distance from source to receiver (m, > 0)
 * @param {number} [emissivity=0.9] - Emissivity of source surface (0 < ε ≤ 1)
 * @returns {number} Thermal irradiance in W/m²
 * @throws {TypeError}  if any input is not a finite number
 * @throws {RangeError} if any dimensional input is out of valid range
 *
 * @example
 * calcThermalIrradiance(1000, 2.0, 10); // ~387 W/m²
 */
export function calcThermalIrradiance( sourceTempK: any, sourceAreaM2: any, distanceM: any, emissivity: any = 0.9) {
    if (
        !Number.isFinite(sourceTempK) ||
        !Number.isFinite(sourceAreaM2) ||
        !Number.isFinite(distanceM) ||
        !Number.isFinite(emissivity)
    ) {
        throw new TypeError('calcThermalIrradiance: all inputs must be finite numbers');
    }
    if (sourceTempK <= 0) throw new RangeError('calcThermalIrradiance: sourceTempK must be > 0');
    if (sourceAreaM2 <= 0) throw new RangeError('calcThermalIrradiance: sourceAreaM2 must be > 0');
    if (distanceM <= 0) throw new RangeError('calcThermalIrradiance: distanceM must be > 0');
    if (emissivity <= 0 || emissivity > 1) throw new RangeError('calcThermalIrradiance: emissivity must be in (0, 1]');
    // Irradiância pela lei de Stefan-Boltzmann + lei do inverso do quadrado
    const radiantPower = emissivity * STEFAN_BOLTZMANN * Math.pow(sourceTempK, 4) * sourceAreaM2;
    return radiantPower / (4 * Math.PI * distanceM * distanceM);
}
/**
 * Calculates the safe distance (m) to maintain a given thermal irradiance limit.
 *
 * Calcula a distância de segurança mínima de uma fonte de calor para que a
 * irradiância recebida pelo trabalhador não exceda um limite prescrito (ex: TLV
 * ACGIH ou limite de projeto de flare da API RP 521). Derivado da inversão da
 * fórmula de irradiância de fonte pontual (lei do inverso do quadrado).
 *
 * Formula: r_safe = sqrt(ε × σ × T⁴ × A / (4π × E_limit))
 *
 * @param {number} sourceTempK   - Surface temperature of heat source (K, > 0)
 * @param {number} sourceAreaM2  - Radiating area (m², > 0)
 * @param {number} irradianceLimitWm2 - Maximum allowable irradiance (W/m², > 0)
 * @param {number} [emissivity=0.9]   - Emissivity (0 < ε ≤ 1)
 * @returns {number} Safe distance in metres
 * @throws {TypeError}  if any input is not a finite number
 * @throws {RangeError} if any input is out of valid range
 *
 * @example
 * calcSafeDistance(1200, 5, 2500); // ~1.5 m (consistent with TLV 60s limit)
 */
export function calcSafeDistance( sourceTempK: any, sourceAreaM2: any, irradianceLimitWm2: any, emissivity: any = 0.9) {
    if (
        !Number.isFinite(sourceTempK) ||
        !Number.isFinite(sourceAreaM2) ||
        !Number.isFinite(irradianceLimitWm2) ||
        !Number.isFinite(emissivity)
    ) {
        throw new TypeError('calcSafeDistance: all inputs must be finite numbers');
    }
    if (sourceTempK <= 0) throw new RangeError('calcSafeDistance: sourceTempK must be > 0');
    if (sourceAreaM2 <= 0) throw new RangeError('calcSafeDistance: sourceAreaM2 must be > 0');
    if (irradianceLimitWm2 <= 0) throw new RangeError('calcSafeDistance: irradianceLimitWm2 must be > 0');
    if (emissivity <= 0 || emissivity > 1) throw new RangeError('calcSafeDistance: emissivity must be in (0, 1]');
    // Inversão da lei do inverso do quadrado: r = sqrt(P / (4π × E_limit))
    const radiantPower = emissivity * STEFAN_BOLTZMANN * Math.pow(sourceTempK, 4) * sourceAreaM2;
    return Math.sqrt(radiantPower / (4 * Math.PI * irradianceLimitWm2));
}
/**
 * Calculates time to 2nd-degree burn using the Stoll & Chianta (1969) criterion.
 *
 * Calcula o tempo de exposição até queimadura de 2º grau para uma dada
 * irradiância, usando a equação de Stoll-Chianta que correlaciona o fluxo de
 * calor recebido com o tempo de onset de queimadura em pele humana desprotegida.
 * É a base dos critérios de risco de incêndio e explosão (API RP 521, SFPE).
 *
 * Formula: t_burn = (Q_Stoll / E)^(1/1.33)
 * onde Q_Stoll ≈ 80000 J^1.33/m² (constante de Stoll-Chianta para pele humana)
 *
 * @param {number} irradianceWm2 - Thermal irradiance received (W/m², > 0)
 * @returns {number} Time to 2nd-degree burn onset in seconds
 * @throws {TypeError}  if irradianceWm2 is not a finite number
 * @throws {RangeError} if irradianceWm2 ≤ 0
 *
 * @example
 * calcBurnOnsetTime(4200); // ~30 s (consistent with ACGIH TLV table)
 */
export function calcBurnOnsetTime( irradianceWm2: any) {
    if (!Number.isFinite(irradianceWm2)) {
        throw new TypeError('calcBurnOnsetTime: irradianceWm2 must be a finite number');
    }
    if (irradianceWm2 <= 0) throw new RangeError('calcBurnOnsetTime: irradianceWm2 must be > 0');
    // Critério de Stoll & Chianta (1969) - limiar de queimadura de 2º grau
    // Q_critical ≈ 125000 J/m² para pele humana não protegida
    // Fórmula: t_burn = Q_critical / E (relação linear fluência-tempo para onset)
    const Q_CRITICAL = 125000; // fluência crítica de queimadura (J/m²)
    return Q_CRITICAL / irradianceWm2;
}
/**
 * Classifies thermal radiation exposure risk level per ACGIH TLV (2024).
 *
 * Classifica o nível de risco de exposição à radiação térmica comparando a
 * irradiância recebida com os TLVs da ACGIH (2024) para a duração de exposição
 * prevista. Retorna a classificação de risco e as ações de controle prescritas
 * para proteção de trabalhadores em mineração e indústria química/petroquímica.
 *
 * @param {number} irradianceWm2 - Measured or calculated irradiance (W/m², > 0)
 * @param {number} exposureDurationS - Planned exposure duration (s, > 0)
 * @returns {{ riskLevel: string, exceedsTLV: boolean, controlMeasures: string[], tlvWm2: number }}
 *   riskLevel: 'acceptable' | 'caution' | 'danger' | 'imminent_danger'
 *   exceedsTLV: true if irradiance exceeds ACGIH TLV for given duration
 *   controlMeasures: array of prescribed control actions
 *   tlvWm2: applicable ACGIH TLV for the given duration
 * @throws {TypeError}  if any input is not a finite number
 * @throws {RangeError} if any input ≤ 0
 *
 * @example
 * classifyThermalExposureRisk(1000, 60);
 * // { riskLevel: 'caution', exceedsTLV: false, controlMeasures: [...], tlvWm2: 2500 }
 */
export function classifyThermalExposureRisk( irradianceWm2: any, exposureDurationS: any) {
    if (!Number.isFinite(irradianceWm2) || !Number.isFinite(exposureDurationS)) {
        throw new TypeError('classifyThermalExposureRisk: inputs must be finite numbers');
    }
    if (irradianceWm2 <= 0) throw new RangeError('classifyThermalExposureRisk: irradianceWm2 must be > 0');
    if (exposureDurationS <= 0) throw new RangeError('classifyThermalExposureRisk: exposureDurationS must be > 0');
    // Encontrar o TLV ACGIH aplicável para a duração de exposição (interpolação conservadora)
    let applicableTLV = (ACGIH_TLV_TABLE[ACGIH_TLV_TABLE.length - 1] as any).tlvWm2;
    for (const entry of ACGIH_TLV_TABLE) {
        if (exposureDurationS <= entry.durationS) {
            applicableTLV = entry.tlvWm2;
            break;
        }
    }
    const ratio = irradianceWm2 / applicableTLV;
    const exceedsTLV = ratio > 1.0;
    let riskLevel, controlMeasures;
    if (ratio <= 0.5) {
        riskLevel = 'acceptable';
        controlMeasures = ['Maintain current distance', 'Periodic monitoring'];
    } else if (ratio <= 1.0) {
        riskLevel = 'caution';
        controlMeasures = ['Reflective PPE recommended', 'Limit exposure duration', 'Hydration protocol'];
    } else if (ratio <= 3.0) {
        riskLevel = 'danger';
        controlMeasures = [
            'Mandatory reflective PPE (reflectivity ≥ 0.85)',
            'Maximum exposure time enforcement',
            'Buddy system required',
            'Engineering controls (shields, barriers)',
        ];
    } else {
        riskLevel = 'imminent_danger';
        controlMeasures = [
            'STOP work — evacuate immediately',
            'Emergency engineering controls required',
            'Do not re-enter without SCBA and full reflective suit',
        ];
    }
    return { riskLevel, exceedsTLV, controlMeasures, tlvWm2: applicableTLV };
}
/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js' as string).AnalyticsModuleMeta}
 */
export const thermalRadiationExposureMeta = {
    name: 'thermalRadiationExposure',
    description: 'Thermal Radiation Exposure Assessment',
    category: 'analytics',
    familyTags: ['radiation', 'climate'],
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
