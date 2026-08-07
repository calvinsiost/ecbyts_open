// @ts-check
// Generated from src/app/js/core/analytics/radiationDoseAssessment.ts by TS-MIGRATION-001. Do not edit manually.
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
// Application: EHS & Mining - Radiation Dose Assessment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/**
 * Radiation Dose Assessment - Ionizing Radiation Exposure
 *
 * Módulo puro para avaliação de dose de radiação ionizante em trabalhadores
 * e população. Implementa cálculo de dose absorvida, dose efetiva, classificação
 * IAEA BSS 2014 e atenuação por distância (lei do inverso do quadrado).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - IAEA (2014). Radiation Protection and Safety of Radiation Sources:
 *     International Basic Safety Standards. IAEA Safety Standards Series
 *     No. GSR Part 3. Vienna: IAEA.
 *     (limites de dose, classificação de exposição)
 *   - ICRP (2007). The 2007 Recommendations of the International Commission
 *     on Radiological Protection. ICRP Publication 103. Ann. ICRP 37(2-4).
 *     (fatores de ponderação wR e wT)
 *
 * @module radiationDoseAssessment
 */
'use strict';
// ─── Radiation Weighting Factors (wR) ────────────────────────────────────────
// Fatores de ponderação por tipo de radiação (ICRP 103, Table A.1)
const RADIATION_WEIGHT: any = {
    gamma: 1,
    x_ray: 1,
    beta: 1,
    alpha: 20,
    neutron: 10,
};
// ─── Absorbed Dose ────────────────────────────────────────────────────────────
/**
 * Compute absorbed dose for 1 hour of exposure.
 * Calcula a dose absorvida D para 1 hora de exposição (mGy).
 *
 * D = A × E × Y × t / m
 * onde t = 3600 s (1 hora), resultado em mGy.
 *
 * @param {number} activity_Bq      - Atividade da fonte (Bq). Deve ser > 0.
 * @param {number} massKg           - Massa do alvo (kg). Deve ser > 0.
 * @param {number} energyMeV        - Energia por desintegração (MeV). Deve ser > 0.
 * @param {number} yieldFraction    - Fração de rendimento (0–1). Emissões por desintegração.
 * @returns {number} Dose absorvida em mGy (para 1 hora de exposição).
 * @throws {RangeError} Se parâmetros fora do intervalo válido.
 * @throws {TypeError} Se parâmetros não forem números.
 */
export function computeAbsorbedDose( activity_Bq: any, massKg: any, energyMeV: any, yieldFraction: any) {
    for (const [name, val] of [
        ['activity_Bq', activity_Bq],
        ['massKg', massKg],
        ['energyMeV', energyMeV],
        ['yieldFraction', yieldFraction],
    ]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} must be a finite number`);
        }
    }
    if (activity_Bq <= 0) throw new RangeError('activity_Bq must be > 0');
    if (massKg <= 0) throw new RangeError('massKg must be > 0');
    if (energyMeV <= 0) throw new RangeError('energyMeV must be > 0');
    if (yieldFraction <= 0 || yieldFraction > 1) {
        throw new RangeError('yieldFraction must be in (0, 1]');
    }
    // Conversão MeV → J: 1 MeV = 1.602176634e-13 J
    const joulePerMeV = 1.602176634e-13;
    const exposureTime_s = 3600; // 1 hora em segundos
    // D (Gy) = A (Bq) × E (J) × Y × t (s) / m (kg)
    const dose_Gy = (activity_Bq * energyMeV * joulePerMeV * yieldFraction * exposureTime_s) / massKg;
    // Converter para mGy
    return dose_Gy * 1000;
}
// ─── Effective Dose ───────────────────────────────────────────────────────────
/**
 * Compute effective dose from absorbed dose.
 * Calcula a dose efetiva E (mSv) a partir da dose absorvida.
 *
 * E = D × wR × wT
 *
 * @param {number} absorbedDose_mGy  - Dose absorvida (mGy).
 * @param {string} radiationType     - Tipo de radiação: 'gamma'|'x_ray'|'beta'|'alpha'|'neutron'.
 * @param {number} tissueWeightFactor - Fator de ponderação de tecido wT (0–1).
 *                                      Use 1 para corpo inteiro (whole_body).
 * @returns {number} Dose efetiva em mSv.
 * @throws {TypeError} Se radiationType não for reconhecido.
 * @throws {RangeError} Se absorbedDose_mGy < 0 ou tissueWeightFactor fora de (0,1].
 */
export function computeEffectiveDose( absorbedDose_mGy: any, radiationType: any, tissueWeightFactor: any) {
    if (typeof absorbedDose_mGy !== 'number' || !Number.isFinite(absorbedDose_mGy)) {
        throw new TypeError('absorbedDose_mGy must be a finite number');
    }
    if (absorbedDose_mGy < 0) throw new RangeError('absorbedDose_mGy must be >= 0');
    if (typeof radiationType !== 'string' || !(radiationType in RADIATION_WEIGHT)) {
        throw new TypeError(`radiationType must be one of: ${Object.keys(RADIATION_WEIGHT).join(', ')}`);
    }
    if (typeof tissueWeightFactor !== 'number' || !Number.isFinite(tissueWeightFactor)) {
        throw new TypeError('tissueWeightFactor must be a finite number');
    }
    if (tissueWeightFactor <= 0 || tissueWeightFactor > 1) {
        throw new RangeError('tissueWeightFactor must be in (0, 1]');
    }
    const wR = RADIATION_WEIGHT[radiationType];
    // E (mSv) = D (mGy) × wR × wT  (1 mGy × wR = 1 mSv para wT=1)
    return absorbedDose_mGy * wR * tissueWeightFactor;
}
// ─── Exposure Classification ──────────────────────────────────────────────────
/**
 * Classify radiation exposure level by annual effective dose.
 * Classifica o nível de exposição à radiação pela dose efetiva anual.
 *
 * Baseado em IAEA GSR Part 3 (2014) e ICRP 103 (2007):
 *   negligible: < 0.01 mSv/yr
 *   low:        0.01–1 mSv/yr
 *   moderate:   1–20 mSv/yr  (limite ocupacional anual médio)
 *   high:       20–100 mSv/yr
 *   extreme:    >= 100 mSv/yr
 *
 * @param {number} effectiveDose_mSv - Dose efetiva anual (mSv/yr).
 * @returns {{ level: string, limit: number }} Nível e limite em mSv/yr.
 * @throws {RangeError} Se effectiveDose_mSv < 0.
 */
export function classifyRadiationExposure( effectiveDose_mSv: any) {
    if (typeof effectiveDose_mSv !== 'number' || !Number.isFinite(effectiveDose_mSv)) {
        throw new TypeError('effectiveDose_mSv must be a finite number');
    }
    if (effectiveDose_mSv < 0) throw new RangeError('effectiveDose_mSv must be >= 0');
    if (effectiveDose_mSv < 0.01) {
        return { level: 'negligible', limit: 0.01 };
    } else if (effectiveDose_mSv < 1) {
        return { level: 'low', limit: 1 };
    } else if (effectiveDose_mSv < 20) {
        return { level: 'moderate', limit: 20 };
    } else if (effectiveDose_mSv < 100) {
        return { level: 'high', limit: 100 };
    } else {
        return { level: 'extreme', limit: Infinity };
    }
}
// ─── Inverse-Square Distance Shielding ───────────────────────────────────────
/**
 * Compute dose at target distance using the inverse-square law.
 * Calcula a dose em distância alvo pela lei do inverso do quadrado.
 *
 * D_target = D_source × (r_source / r_target)²
 *
 * @param {number} sourceDose_mSv    - Dose na distância de referência (mSv).
 * @param {number} sourceDistance_m  - Distância de referência r1 (m). Deve ser > 0.
 * @param {number} targetDistance_m  - Distância alvo r2 (m). Deve ser > 0.
 * @returns {number} Dose na distância alvo (mSv).
 * @throws {RangeError} Se distâncias <= 0 ou dose < 0.
 */
export function computeDistanceShielding( sourceDose_mSv: any, sourceDistance_m: any, targetDistance_m: any) {
    for (const [name, val] of [
        ['sourceDose_mSv', sourceDose_mSv],
        ['sourceDistance_m', sourceDistance_m],
        ['targetDistance_m', targetDistance_m],
    ]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} must be a finite number`);
        }
    }
    if (sourceDose_mSv < 0) throw new RangeError('sourceDose_mSv must be >= 0');
    if (sourceDistance_m <= 0) throw new RangeError('sourceDistance_m must be > 0');
    if (targetDistance_m <= 0) throw new RangeError('targetDistance_m must be > 0');
    return sourceDose_mSv * Math.pow(sourceDistance_m / targetDistance_m, 2);
}
/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js' as string).AnalyticsModuleMeta}
 */
export const radiationDoseAssessmentMeta = {
    name: 'radiationDoseAssessment',
    description: 'Radiation Dose Assessment',
    category: 'analytics',
    familyTags: ['radiation'],
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
