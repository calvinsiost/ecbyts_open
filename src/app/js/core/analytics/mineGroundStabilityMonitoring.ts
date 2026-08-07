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
 * Mine Ground Stability Monitoring Analytics
 *
 * Implements geomechanical monitoring algorithms for open-pit and underground mines:
 *   - Displacement rate and cumulative deformation from extensometers/piezometers
 *   - Alert classification (traffic-light: green/yellow/red)
 *   - Subsidence surface index
 *   - Residual factor of safety based on the Hoek-Brown failure criterion
 *
 * Academic references:
 *   ISRM (2007). The Complete ISRM Suggested Methods for Rock Characterization,
 *     Testing and Monitoring: 1974-2006. R. Ulusay & J.A. Hudson (eds.), ISRM.
 *   Villaescusa, E. (2014). Geotechnical Design for Sublevel Open Stoping.
 *     CRC Press/Taylor & Francis. ISBN 978-0-415-47708-5.
 *   Hoek, E., Carranza-Torres, C. & Corkum, B. (2002). Hoek-Brown failure
 *     criterion - 2002 edition. Proc. NARMS-TAC Conference, Toronto.
 *
 * Zero external dependencies. All math is pure JS.
 *
 * @module mineGroundStabilityMonitoring
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

interface DisplacementReading {
    t: number;
    d: number;
}

interface HoekBrownParams {
    sigma_ci: number;
    GSI: number;
    mi: number;
    D: number;
    sigma3: number;
    sigma1_app: number;
}

// ---------------------------------------------------------------------------
// Displacement Rate (Taxa de Deformação)
// v = (d2 - d1) / dt  (mm/dia)
// ---------------------------------------------------------------------------

/**
 * Compute displacement rate from two sequential displacement readings.
 * Taxa de deformação linear: v = Delta_d / Delta_t (mm/dia).
 *
 * @param d1         - Earlier displacement reading (mm)
 * @param d2         - Later displacement reading (mm)
 * @param deltaDays  - Time interval between readings (days, > 0)
 * @returns Displacement rate in mm/day (positive = expansion/movement)
 * @throws {TypeError} If arguments are not numbers
 * @throws {RangeError} If deltaDays <= 0
 */
export function displacementRate(d1: number, d2: number, deltaDays: number): number {
    if (typeof d1 !== 'number' || typeof d2 !== 'number' || typeof deltaDays !== 'number') {
        throw new TypeError('displacementRate: d1, d2, deltaDays must be numbers');
    }
    if (deltaDays <= 0) {
        throw new RangeError('displacementRate: deltaDays must be > 0');
    }
    return (d2 - d1) / deltaDays;
}

// ---------------------------------------------------------------------------
// Cumulative Displacement from Time Series
// Deslocamento acumulado a partir de série temporal de leituras
// ---------------------------------------------------------------------------

/**
 * Compute cumulative displacement and rates from a time series of sensor readings.
 * Deslocamento acumulado e taxa por intervalo de leitura.
 *
 * @param readings - Array of {t: timestamp_days, d: displacement_mm}
 *   sorted ascending by t
 * @throws {TypeError} If readings is not an array of objects with t and d
 * @throws {RangeError} If fewer than 2 readings provided or timestamps not increasing
 */
export function cumulativeDisplacement(readings: DisplacementReading[]): {
    totalDisplacement: number;
    avgRate: number;
    maxRate: number;
    rateByInterval: number[];
} {
    if (!Array.isArray(readings) || readings.length < 2) {
        throw new RangeError('cumulativeDisplacement: at least 2 readings required');
    }
    for (const r of readings) {
        if (!r || typeof r.t !== 'number' || typeof r.d !== 'number') {
            throw new TypeError('cumulativeDisplacement: each reading must have numeric t and d');
        }
    }

    const rateByInterval = [];
    for (let i = 1; i < readings.length; i++) {
        const dt = readings[i]!.t - readings[i - 1]!.t;
        if (dt <= 0) {
            throw new RangeError('cumulativeDisplacement: timestamps must be strictly increasing');
        }
        rateByInterval.push((readings[i]!.d - readings[i - 1]!.d) / dt);
    }

    const totalDisplacement = readings[readings.length - 1]!.d - readings[0]!.d;
    const totalTime = readings[readings.length - 1]!.t - readings[0]!.t;
    const avgRate = totalDisplacement / totalTime;
    const maxRate = Math.max(...rateByInterval.map(Math.abs));

    return { totalDisplacement, avgRate, maxRate, rateByInterval };
}

// ---------------------------------------------------------------------------
// Alert Level Classification - Semáforo Verde/Amarelo/Vermelho
// Classificação de alerta baseada em taxa de deformação (ISRM 2007)
// ---------------------------------------------------------------------------

/**
 * Classify stability alert level from displacement rate (traffic-light system).
 * Sistema semáforo conforme prática ISRM e recomendações de engenharia de minas.
 *
 * Thresholds (adjustable via params):
 *   Green  (stable):  rate < alertThresholds.yellow
 *   Yellow (warning): alertThresholds.yellow <= rate < alertThresholds.red
 *   Red    (action):  rate >= alertThresholds.red
 *
 * @param rate - Current displacement rate (mm/day)
 * @param alertThresholds - Custom thresholds (mm/day)
 * @throws {TypeError} If rate is not a number
 * @throws {RangeError} If thresholds are invalid
 */
export function alertLevelClassification(
    rate: number,
    alertThresholds: { yellow: number; red: number } = { yellow: 5, red: 25 },
): { level: 'green' | 'yellow' | 'red'; rateMMperDay: number; action: string } {
    if (typeof rate !== 'number') {
        throw new TypeError('alertLevelClassification: rate must be a number');
    }
    if (!alertThresholds || typeof alertThresholds.yellow !== 'number' || typeof alertThresholds.red !== 'number') {
        throw new TypeError('alertLevelClassification: alertThresholds must have numeric yellow and red');
    }
    if (alertThresholds.yellow <= 0 || alertThresholds.red <= alertThresholds.yellow) {
        throw new RangeError('alertLevelClassification: thresholds must satisfy 0 < yellow < red');
    }

    const absRate = Math.abs(rate);
    let level: 'green' | 'yellow' | 'red';
    let action;

    if (absRate < alertThresholds.yellow) {
        level = 'green';
        action = 'continue_monitoring';
    } else if (absRate < alertThresholds.red) {
        level = 'yellow';
        action = 'increase_monitoring_frequency';
    } else {
        level = 'red';
        action = 'immediate_evacuation_and_geotechnical_review';
    }

    return { level, rateMMperDay: rate, action };
}

// ---------------------------------------------------------------------------
// Subsidence Surface Index
// Índice de subsidência superficial = d_max / H_extracao (adimensional)
// ---------------------------------------------------------------------------

/**
 * Compute the surface subsidence index for a mining excavation.
 * Índice de subsidência: relação entre subsidência máxima e altura de extração.
 * Referência: Villaescusa 2014, cap. 15 (empirical subsidence trough analysis).
 *
 * @param maxSubsidenceMm  - Maximum measured surface subsidence (mm)
 * @param miningHeightM    - Height of the excavation / mining panel (m)
 * @param depthM    - Depth of excavation below surface (m), optional
 * @throws {RangeError} If maxSubsidenceMm < 0 or miningHeightM <= 0
 */
export function subsidenceSurfaceIndex(
    maxSubsidenceMm: number,
    miningHeightM: number,
    depthM: number | null = null,
): { subsidenceIndex: number; severity: string; influenceAngleDeg: number | null } {
    if (typeof maxSubsidenceMm !== 'number' || maxSubsidenceMm < 0) {
        throw new RangeError('subsidenceSurfaceIndex: maxSubsidenceMm must be >= 0');
    }
    if (typeof miningHeightM !== 'number' || miningHeightM <= 0) {
        throw new RangeError('subsidenceSurfaceIndex: miningHeightM must be > 0');
    }

    // Índice adimensional (unidades mistas: mm / m*1000 para normalizar)
    const subsidenceIndex = maxSubsidenceMm / (miningHeightM * 1000);

    let severity;
    if (subsidenceIndex < 0.01) severity = 'negligible';
    else if (subsidenceIndex < 0.05) severity = 'minor';
    else if (subsidenceIndex < 0.15) severity = 'moderate';
    else if (subsidenceIndex < 0.3) severity = 'significant';
    else severity = 'severe';

    // Ângulo de influência empírico (quando profundidade fornecida)
    // θ ≈ atan(H / d) em graus - razão simplificada de Bafghi & Verdel
    let influenceAngleDeg: number | null = null;
    if (depthM !== null) {
        if (typeof depthM !== 'number' || depthM <= 0) {
            throw new RangeError('subsidenceSurfaceIndex: depthM must be > 0 when provided');
        }
        influenceAngleDeg = (Math.atan(miningHeightM / depthM) * 180) / Math.PI;
    }

    return { subsidenceIndex, severity, influenceAngleDeg };
}

// ---------------------------------------------------------------------------
// Residual Factor of Safety - Hoek-Brown Criterion
// FS = sigma_c * (mb*sigma3/sigma_c + s)^a / sigma1 (com parâmetros GSI)
// ---------------------------------------------------------------------------

/**
 * Estimate the residual factor of safety (FS) for a rock mass using the
 * Hoek-Brown failure criterion (2002 edition).
 *
 * sigma1 = sigma3 + sigma_ci * (mb * sigma3/sigma_ci + s)^a
 *
 * FS = sigma1_failure / sigma1_applied
 *
 * @param params - Rock mass properties
 * @param params.sigma_ci   - Uniaxial compressive strength of intact rock (MPa)
 * @param params.GSI        - Geological Strength Index (0-100)
 * @param params.mi         - Hoek-Brown intact rock parameter (dimensionless)
 * @param params.D          - Disturbance factor (0 = undisturbed, 1 = blasted)
 * @param params.sigma3     - Minor principal stress (MPa, confining pressure)
 * @param params.sigma1_app - Applied major principal stress (MPa)
 * @throws {RangeError} If GSI, D, or other params are out of allowed range
 */
export function residualFactorOfSafety(params: HoekBrownParams): {
    FS: number;
    mb: number;
    s: number;
    a: number;
    sigma1_failure: number;
} {
    if (!params || typeof params !== 'object') {
        throw new TypeError('residualFactorOfSafety: params must be an object');
    }
    const { sigma_ci, GSI, mi, D, sigma3, sigma1_app } = params;

    if ([sigma_ci, GSI, mi, D, sigma3, sigma1_app].some((v) => typeof v !== 'number')) {
        throw new TypeError('residualFactorOfSafety: all params must be numbers');
    }
    if (sigma_ci <= 0) throw new RangeError('residualFactorOfSafety: sigma_ci must be > 0');
    if (GSI < 0 || GSI > 100) throw new RangeError('residualFactorOfSafety: GSI must be in [0, 100]');
    if (D < 0 || D > 1) throw new RangeError('residualFactorOfSafety: D must be in [0, 1]');
    if (mi <= 0) throw new RangeError('residualFactorOfSafety: mi must be > 0');
    if (sigma1_app <= 0) throw new RangeError('residualFactorOfSafety: sigma1_app must be > 0');

    // Parâmetros Hoek-Brown 2002 (Hoek et al. 2002, eqs. 11-13)
    const mb = mi * Math.exp((GSI - 100) / (28 - 14 * D));
    const s = Math.exp((GSI - 100) / (9 - 3 * D));
    const a = 0.5 + (1 / 6) * (Math.exp(-GSI / 15) - Math.exp(-20 / 3));

    // Tensão principal maior na ruptura dado sigma3
    const inner = (mb * sigma3) / sigma_ci + s;
    if (inner < 0) {
        // Sob tração - tratamento de degenericidade
        throw new RangeError('residualFactorOfSafety: tensile conditions (inner term < 0); check sigma3 and s');
    }
    const sigma1_failure = sigma3 + sigma_ci * Math.pow(inner, a);

    const FS = sigma1_failure / sigma1_app;

    return { FS, mb, s, a, sigma1_failure };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineGroundStabilityMonitoringMeta: AnalyticsModuleMeta = {
    name: 'mineGroundStabilityMonitoring',
    description: 'mineGroundStabilityMonitoring',
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
