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
// Application: EHS & Mining - Fluvial Geomorphology
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Fluvial Geomorphology - Geomorfologia Fluvial
 *
 * Módulo puro implementando métricas de geomorfologia fluvial para monitoramento
 * ambiental de cursos d'água: potência do canal, balanço de Lane, sinuosidade e
 * erosão de margens.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * References / Referências:
 * - Lane, E.W. (1955) The importance of fluvial morphology in hydraulic engineering.
 *   Proceedings of the ASCE 81(745):1–17.
 * - Bagnold, R.A. (1966) An approach to the sediment transport problem from general physics.
 *   USGS Professional Paper 422-I.
 * - Rosgen, D.L. (1994) A classification of natural rivers.
 *   Catena 22(3):169–199. DOI:10.1016/0341-8162(94)90001-9
 *
 * @module fluvialGeomorphology
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

// ---------------------------------------------------------------------------
// Physical constants / Constantes físicas
// ---------------------------------------------------------------------------
/** Densidade da água (kg/m³) — water density */
const RHO_WATER = 1000;
/** Aceleração gravitacional (m/s²) — gravitational acceleration */
const G = 9.81;

// ---------------------------------------------------------------------------
// Stream power classification thresholds (W/m²)
// Limites de classificação da potência específica do canal (W/m²)
// ---------------------------------------------------------------------------
const STREAM_POWER_THRESHOLDS = {
    LOW: 35, // < 35 W/m² — baixo (planícies de inundação)
    MODERATE: 300, // < 300 W/m² — moderado (rios de planície)
    HIGH: 1000, // < 1000 W/m² — alto (rios de montanha)
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute specific stream power (unit stream power) per Bagnold (1966).
 * Calcula potência específica do canal conforme Bagnold (1966).
 *
 * ω = ρ × g × Q × S / W  (W/m²)
 *
 * @param discharge_m3_s   - Bankfull discharge Q (m³/s) - vazão plena
 * @param slope             - Channel slope S (m/m, dimensionless) - declividade
 * @param channelWidth_m    - Bankfull width W (m) - largura do canal
 * @throws {RangeError} If any parameter is non-positive
 */
export function computeStreamPower(
    discharge_m3_s: number,
    slope: number,
    channelWidth_m: number,
): { streamPower_W_m2: number; classification: 'low' | 'moderate' | 'high' | 'extreme' } {
    if ([discharge_m3_s, slope, channelWidth_m].some((v) => typeof v !== 'number')) {
        throw new TypeError('All arguments must be numbers');
    }
    if (discharge_m3_s <= 0) throw new RangeError('discharge_m3_s must be > 0');
    if (slope <= 0) throw new RangeError('slope must be > 0');
    if (channelWidth_m <= 0) throw new RangeError('channelWidth_m must be > 0');

    const streamPower_W_m2 = (RHO_WATER * G * discharge_m3_s * slope) / channelWidth_m;

    let classification: 'low' | 'moderate' | 'high' | 'extreme';
    if (streamPower_W_m2 < STREAM_POWER_THRESHOLDS.LOW) classification = 'low';
    else if (streamPower_W_m2 < STREAM_POWER_THRESHOLDS.MODERATE) classification = 'moderate';
    else if (streamPower_W_m2 < STREAM_POWER_THRESHOLDS.HIGH) classification = 'high';
    else classification = 'extreme';

    return { streamPower_W_m2, classification };
}

/**
 * Compute Lane (1955) channel stability balance index.
 * Calcula o índice de estabilidade do canal de Lane (1955).
 *
 * Balanço de Lane: Q×S ∝ qs×d50
 * LS = (Q × S) / (d50^0.25)
 * Tendência: >1.1 = deposição (aggradation), <0.9 = erosão (degradation)
 *
 * @param d50_mm         - Median grain size d50 (mm) - granulometria d50
 * @param discharge_m3_s - Reference discharge Q (m³/s) - vazão de referência
 * @param slope           - Channel slope S (m/m) - declividade
 * @param width_m         - Channel width W (m) - largura do canal
 * @throws {RangeError} If any parameter is non-positive
 */
export function computeChannelStability(
    d50_mm: number,
    discharge_m3_s: number,
    slope: number,
    width_m: number,
): { laneBalance: number; trend: 'aggradation' | 'stable' | 'degradation' } {
    if ([d50_mm, discharge_m3_s, slope, width_m].some((v) => typeof v !== 'number')) {
        throw new TypeError('All arguments must be numbers');
    }
    if (d50_mm <= 0) throw new RangeError('d50_mm must be > 0');
    if (discharge_m3_s <= 0) throw new RangeError('discharge_m3_s must be > 0');
    if (slope <= 0) throw new RangeError('slope must be > 0');
    if (width_m <= 0) throw new RangeError('width_m must be > 0');

    // Índice de Lane: normalizado pela largura para comparabilidade de seções
    const laneBalance = (discharge_m3_s * slope) / (Math.pow(d50_mm, 0.25) * width_m);

    let trend: 'aggradation' | 'stable' | 'degradation';
    if (laneBalance > 1.1) trend = 'aggradation';
    else if (laneBalance < 0.9) trend = 'degradation';
    else trend = 'stable';

    return { laneBalance, trend };
}

/**
 * Compute channel sinuosity and classify planform type (Rosgen 1994).
 * Calcula sinuosidade do canal e classifica o tipo de planforma (Rosgen 1994).
 *
 * SI = channel length / valley length
 * <1.05 = straight, <1.25 = sinuous, <1.5 = meandering, ≥1.5 = tortuous
 *
 * @param channelLength_m - Actual channel length along thalweg (m) - comprimento do talvegue
 * @param valleyLength_m  - Straight-line valley length (m) - comprimento do vale
 * @throws {RangeError} If lengths are not positive or channel < valley
 */
export function computeSinuosity(
    channelLength_m: number,
    valleyLength_m: number,
): { sinuosity: number; type: 'straight' | 'sinuous' | 'meandering' | 'tortuous' } {
    if (typeof channelLength_m !== 'number' || typeof valleyLength_m !== 'number') {
        throw new TypeError('channelLength_m and valleyLength_m must be numbers');
    }
    if (valleyLength_m <= 0) throw new RangeError('valleyLength_m must be > 0');
    if (channelLength_m < valleyLength_m) {
        throw new RangeError('channelLength_m must be >= valleyLength_m');
    }

    const sinuosity = channelLength_m / valleyLength_m;

    let type: 'straight' | 'sinuous' | 'meandering' | 'tortuous';
    if (sinuosity < 1.05) type = 'straight';
    else if (sinuosity < 1.25) type = 'sinuous';
    else if (sinuosity < 1.5) type = 'meandering';
    else type = 'tortuous';

    return { sinuosity, type };
}

/**
 * Compute bank erosion rate using excess shear stress model.
 * Calcula taxa de erosão de margens pelo modelo de excesso de tensão cisalhante.
 *
 * E = kd × (τ - τc)  se τ > τc, senão E = 0  (m/yr)
 * kd = erodibility coefficient (m³/N/s) - coeficiente de erodibilidade
 *
 * @param cohesion_kPa      - Bank cohesion (kPa) - coesão da margem (não usado na fórmula E,
 *                            mas usado para validar contexto geotécnico)
 * @param shearStress_Pa    - Applied shear stress τ (Pa) - tensão cisalhante aplicada
 * @param criticalShear_Pa  - Critical shear stress τc (Pa) - tensão cisalhante crítica
 * @param erodibility       - Erodibility coefficient kd (m³/(N·s)) - coeficiente de erodibilidade
 * @throws {RangeError} If shear stresses or erodibility are non-positive
 */
export function computeBankErosionRate(
    cohesion_kPa: number,
    shearStress_Pa: number,
    criticalShear_Pa: number,
    erodibility: number,
): { erosionRate_m_yr: number; risk: 'none' | 'low' | 'moderate' | 'high' } {
    if ([cohesion_kPa, shearStress_Pa, criticalShear_Pa, erodibility].some((v) => typeof v !== 'number')) {
        throw new TypeError('All arguments must be numbers');
    }
    if (cohesion_kPa < 0) throw new RangeError('cohesion_kPa must be >= 0');
    if (shearStress_Pa < 0) throw new RangeError('shearStress_Pa must be >= 0');
    if (criticalShear_Pa <= 0) throw new RangeError('criticalShear_Pa must be > 0');
    if (erodibility < 0) throw new RangeError('erodibility must be >= 0');

    // Excesso de tensão: positivo somente quando τ > τc
    const excessShear = Math.max(0, shearStress_Pa - criticalShear_Pa);

    // Conversão de m/s para m/ano: × 3.156e7 segundos/ano
    const SECONDS_PER_YEAR = 3.156e7;
    const erosionRate_m_yr = erodibility * excessShear * SECONDS_PER_YEAR;

    let risk: 'none' | 'low' | 'moderate' | 'high';
    if (erosionRate_m_yr === 0) risk = 'none';
    else if (erosionRate_m_yr < 0.1) risk = 'low';
    else if (erosionRate_m_yr < 0.5) risk = 'moderate';
    else risk = 'high';

    return { erosionRate_m_yr, risk };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const fluvialGeomorphologyMeta: AnalyticsModuleMeta = {
    name: 'fluvialGeomorphology',
    description: 'Fluvial Geomorphology',
    category: 'analytics',
    familyTags: ['river'],
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
