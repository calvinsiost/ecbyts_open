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
 * Mine Rail Transport Safety Analytics
 *
 * Métricas de segurança no transporte ferroviário de minério.
 *
 * References:
 *   ANTT - Agência Nacional de Transportes Terrestres. Regulamento RFFSA.
 *   ABNT NBR 5564:2012 - Via férrea - Terminologia.
 *   FRA (Federal Railroad Administration). CFR Part 213 - Track Safety Standards. 49 C.F.R. § 213.
 *   AAR (2023). Manual of Standards and Recommended Practices, Section C - Brakes and Brake Equipment.
 *   UIC 544-1:2014 - Brakes - Braking power.
 *
 * @module mineRailTransportSafety
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

// --- Constants ---

/**
 * FRA track class maximum speeds (km/h) - 49 C.F.R. § 213.9
 * Velocidades máximas por classe de via (FRA CFR Part 213)
 */
const FRA_MAX_SPEED_KMH: Record<number, number> = {
    1: 25, // Excepted & Class 1 freight
    2: 40,
    3: 96,
    4: 128,
    5: 144,
};

/** Gravitational acceleration (m/s²) */
const G = 9.80665;

/** Safety factor for brake distance (dimensionless) — typical engineering margin */
const BRAKE_SAFETY_FACTOR = 1.2;

// --- Helpers ---

/**
 * Validates a numeric input.
 * Valida entrada numérica com limites opcionais.
 * @param {number} v
 * @param {string} name
 * @param {number} [min]
 * @param {number} [max]
 */
function validateNum(v: number, name: string, min = -Infinity, max = Infinity): void {
    if (typeof v !== 'number' || !isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, got ${v}`);
    }
    if (v < min || v > max) {
        throw new RangeError(`${name} must be in [${min}, ${max}], got ${v}`);
    }
}

// --- Core exports ---

/**
 * Returns the maximum allowed speed for a given FRA track class and axle load.
 * Retorna a velocidade máxima permitida para a classe de via FRA e carga por eixo.
 *
 * @param {object} opts
 * @param {number} opts.trackClass   - FRA track class [1–5]
 * @param {number} opts.axleLoadTf  - axle load (toneladas-força, tf)
 * @param {number} [opts.axleLoadLimitTf=32.5] - maximum allowed axle load (tf) per ANTT/AAR
 * @returns {{ maxSpeedKmh: number, axleLoadOk: boolean, trackClass: number }}
 */
export function getMaxSpeed({
    trackClass,
    axleLoadTf,
    axleLoadLimitTf = 32.5,
}: {
    trackClass: number;
    axleLoadTf: number;
    axleLoadLimitTf?: number;
}): { maxSpeedKmh: number; axleLoadOk: boolean; trackClass: number } {
    validateNum(trackClass, 'trackClass', 1, 5);
    if (!Number.isInteger(trackClass)) throw new RangeError('trackClass must be an integer 1–5');
    validateNum(axleLoadTf, 'axleLoadTf', 0);
    validateNum(axleLoadLimitTf, 'axleLoadLimitTf', 0);

    const maxSpeedKmh = (FRA_MAX_SPEED_KMH as Record<number, number>)[trackClass]!;
    const axleLoadOk = axleLoadTf <= axleLoadLimitTf;
    return { maxSpeedKmh, axleLoadOk, trackClass };
}

/**
 * Computes the brake factor and required braking distance.
 * Calcula o fator de segurança de freio e a distância de frenagem requerida.
 *
 * Brake factor (BF) = total_braking_force / train_weight
 * Stopping distance (m) = v² / (2 × BF × g) × safety_factor
 * based on UIC 544-1 simplified formula.
 *
 * @param {object} opts
 * @param {number} opts.speedKmh        - train speed at brake application (km/h)
 * @param {number} opts.trainMassTon    - total train mass (toneladas)
 * @param {number} opts.brakingForcekN  - total available braking force (kN)
 * @param {number} [opts.gradePct=0]    - track grade (%, positive = downhill)
 * @returns {{ brakeFactor: number, stoppingDistanceM: number, safetyMarginOk: boolean }}
 */
export function computeBrakeDistance({
    speedKmh,
    trainMassTon,
    brakingForcekN,
    gradePct = 0,
}: {
    speedKmh: number;
    trainMassTon: number;
    brakingForcekN: number;
    gradePct?: number;
}): { brakeFactor: number; stoppingDistanceM: number; safetyMarginOk: boolean } {
    validateNum(speedKmh, 'speedKmh', 0, 300);
    validateNum(trainMassTon, 'trainMassTon', 0.001);
    validateNum(brakingForcekN, 'brakingForcekN', 0);
    validateNum(gradePct, 'gradePct', -10, 10);

    const speedMs = speedKmh / 3.6;
    const weightKN = trainMassTon * G; // kN (1 ton × 9.80665 m/s² = 9.80665 kN)
    const gradeForceKN = (gradePct / 100) * weightKN; // downhill adds to required force

    // Net effective braking force (kN)
    // Força de frenagem líquida efetiva
    const netBrakeKN = brakingForcekN - gradeForceKN;
    if (netBrakeKN <= 0) {
        return { brakeFactor: 0, stoppingDistanceM: Infinity, safetyMarginOk: false };
    }

    const brakeFactor = netBrakeKN / weightKN;
    // d = v² / (2 × a), where a = BF × g
    // Distância de frenagem: d = v² / (2 × desaceleração)
    const stoppingDistanceM = ((speedMs * speedMs) / (2 * brakeFactor * G)) * BRAKE_SAFETY_FACTOR;
    // AAR: BF ≥ 0.12 for safe operation at normal speeds
    const safetyMarginOk = brakeFactor >= 0.12;

    return {
        brakeFactor: +brakeFactor.toFixed(5),
        stoppingDistanceM: +stoppingDistanceM.toFixed(2),
        safetyMarginOk,
    };
}

/**
 * Calculates accident rate per million train-km (FRA performance metric).
 * Calcula o índice de acidentes por milhão de trem-km (métrica FRA).
 *
 * @param {object} opts
 * @param {number} opts.accidentCount  - number of reportable accidents in period
 * @param {number} opts.trainKm        - total train-kilometers operated in period
 * @returns {{ accidentRatePer1M: number, riskClass: string }}
 */
export function computeAccidentRate({
    accidentCount,
    trainKm,
}: {
    accidentCount: number;
    trainKm: number;
}): { accidentRatePer1M: number; riskClass: string } {
    validateNum(accidentCount, 'accidentCount', 0);
    validateNum(trainKm, 'trainKm', 0.001);

    const accidentRatePer1M = (accidentCount / trainKm) * 1e6;

    // Operational risk classification based on industry benchmarks
    // Classificação de risco operacional por benchmarks da indústria
    let riskClass: 'very_low' | 'low' | 'moderate' | 'high' | 'critical';
    if (accidentRatePer1M < 1) riskClass = 'very_low';
    else if (accidentRatePer1M < 3) riskClass = 'low';
    else if (accidentRatePer1M < 8) riskClass = 'moderate';
    else if (accidentRatePer1M < 20) riskClass = 'high';
    else riskClass = 'critical';

    return { accidentRatePer1M: +accidentRatePer1M.toFixed(4), riskClass };
}

/**
 * Runs a full mine rail safety assessment combining speed limits, braking, and accident rate.
 * Executa avaliação completa de segurança ferroviária combinando velocidade, frenagem e acidentes.
 *
 * @param {object} opts
 * @param {number} opts.trackClass
 * @param {number} opts.axleLoadTf
 * @param {number} opts.operatingSpeedKmh
 * @param {number} opts.trainMassTon
 * @param {number} opts.brakingForcekN
 * @param {number} opts.accidentCount
 * @param {number} opts.trainKm
 * @param {number} [opts.gradePct]
 * @returns {{ speedCompliant: boolean, braking: object, accidentRate: object, overallRisk: string }}
 */
export function runRailSafetyAssessment({
    trackClass,
    axleLoadTf,
    operatingSpeedKmh,
    trainMassTon,
    brakingForcekN,
    accidentCount,
    trainKm,
    gradePct = 0,
}: {
    trackClass: number;
    axleLoadTf: number;
    operatingSpeedKmh: number;
    trainMassTon: number;
    brakingForcekN: number;
    accidentCount: number;
    trainKm: number;
    gradePct?: number;
}): { speedCompliant: boolean; braking: object; accidentRate: object; overallRisk: string } {
    const speedInfo = getMaxSpeed({ trackClass, axleLoadTf });
    const speedCompliant = operatingSpeedKmh <= speedInfo.maxSpeedKmh && speedInfo.axleLoadOk;
    const braking = computeBrakeDistance({ speedKmh: operatingSpeedKmh, trainMassTon, brakingForcekN, gradePct });
    const accidentRate = computeAccidentRate({ accidentCount, trainKm });

    // Determine overall risk - highest from individual assessments
    // Risco geral: o mais alto entre os componentes individuais
    const rankMap: Record<string, number> = { very_low: 0, low: 1, moderate: 2, high: 3, critical: 4 };
    const ranks = [rankMap[accidentRate.riskClass]!];
    if (!speedCompliant) ranks.push(3); // speed non-compliance → high
    if (!braking.safetyMarginOk) ranks.push(3);
    const maxRank = Math.max(...ranks);
    const overallRisk = Object.keys(rankMap).find((k) => rankMap[k] === maxRank) ?? 'critical';

    return { speedCompliant, braking, accidentRate, overallRisk };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const mineRailTransportSafetyMeta: AnalyticsModuleMeta = {
    name: 'mineRailTransportSafety',
    description: 'mineRailTransportSafety',
    category: 'analytics',
    familyTags: ['mining', 'risk', 'transport', 'fate_transport'],
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
