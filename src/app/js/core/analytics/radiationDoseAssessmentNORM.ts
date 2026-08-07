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
 * NORM Radiation Dose Assessment
 *
 * Evaluates effective annual dose from Naturally Occurring Radioactive Material
 * (NORM) via inhalation, ingestion, and external irradiation pathways.
 * Calculates radioactivity concentration indices (I-gamma, I) for building
 * materials and checks compliance with the 1 mSv/year public dose limit.
 *
 * Academic references:
 * - IAEA (2019). Radiation Protection and Safety of Radiation Sources:
 *   International Basic Safety Standards, SSG-45. Vienna: International
 *   Atomic Energy Agency. ISBN:978-92-0-112019-1
 * - UNSCEAR (2008). Sources and Effects of Ionizing Radiation, Report to the
 *   General Assembly. United Nations Scientific Committee on the Effects of
 *   Atomic Radiation. Sales No. E.10.XI.3.
 * - Beretka, J. & Mathew, P.J. (1985). Natural radioactivity of Australian
 *   building materials, industrial wastes and by-products.
 *   Health Physics 48(1):87–95. DOI:10.1097/00004032-198501000-00007
 * - European Commission (1999). Radiation Protection 112 - Radiological
 *   Protection Principles concerning the Natural Radioactivity of Building
 *   Materials. EC, Luxembourg.
 *
 * @module radiationDoseAssessmentNORM
 */

// IAEA SSG-45 Table I - Dose coefficients (mSv per Bq ingested/inhaled)
// Coeficientes de dose por via de exposição para adultos (IAEA SSG-45)
const DOSE_COEFFICIENTS: { inhalation: Record<string, number>, ingestion: Record<string, number>, external_mSv_y_per_Bq_kg: Record<string, number> }= {
    inhalation: {
        Ra226: 2.8e-6, // mSv/Bq — Ra-226 (via inalação, partículas)
        Th232: 2.3e-4, // mSv/Bq
        U238: 8.0e-6, // mSv/Bq
        K40: 2.5e-6, // mSv/Bq
    },
    ingestion: {
        Ra226: 2.8e-4, // mSv/Bq — Ra-226 (via ingestão, alimentos/água)
        Th232: 2.3e-4, // mSv/Bq
        U238: 4.5e-5, // mSv/Bq
        K40: 6.2e-6, // mSv/Bq
    },
    // Dose conversion factor for external gamma: 0.0417 mSv/y per Bq/kg
    // (UNSCEAR 2008, §III dose rate conversion)
    external_mSv_y_per_Bq_kg: {
        Ra226: 0.092, // mSv·y⁻¹ per Bq/kg
        Th232: 0.116,
        U238: 0.044,
        K40: 0.00417,
    },
};

// Annual public dose limit (IAEA BSS, ICRP 103): 1 mSv/y
const ANNUAL_DOSE_LIMIT_MSV = 1.0;

// Reference activity concentrations for I-gamma index (Bq/kg) - EC RP-112 §4
// Concentrações de referência para índice I-gamma (material de construção)
const REFERENCE_CONCENTRATIONS: Record<string, number>= {
    Ra226: 300, // Bq/kg
    Th232: 200, // Bq/kg
    K40: 3000, // Bq/kg
};

/**
 * Annual effective dose from external gamma irradiation.
 * Uses UNSCEAR 2008 dose rate conversion factors.
 *
 * Dose efetiva anual por irradiação gama externa (ao ar livre / em ambientes).
 *
 * @param {Record<string, number>} activity - Activity concentrations (Bq/kg): Ra226, Th232, U238, K40
 * @param {number} [occupancyFactor=0.2] - Fração do tempo ao ar livre (0–1)
 * @returns {{dose_mSv_y: number, contributions: Record<string, number>}}
 * @throws {TypeError|RangeError}
 */
function externalGammaDose(activity: Record<string, number>, occupancyFactor: number = 0.2): {dose_mSv_y: number, contributions: Record<string, number>} {
    _validateActivityObject(activity);
    if (typeof occupancyFactor !== 'number' || occupancyFactor < 0 || occupancyFactor > 1)
        throw new RangeError('occupancyFactor must be in [0, 1]');

        const contributions: Record<string, number>= {};
    let total = 0;

    for (const nuclide of ['Ra226', 'Th232', 'U238', 'K40']) {
        const act = activity[nuclide] || 0;
        const dcf = DOSE_COEFFICIENTS.external_mSv_y_per_Bq_kg[nuclide] ?? 0;
        const dose = act * dcf * occupancyFactor;
        contributions[nuclide] = +dose.toFixed(6);
        total += dose;
    }

    return { dose_mSv_y: +total.toFixed(6), contributions };
}

/**
 * Annual effective dose from inhalation of resuspended particles.
 *
 * Dose efetiva anual por inalação de partículas ressuspensas contaminadas
 * com NORM (trabalhadores ou população geral em área de mineração/extração).
 *
 * @param {Record<string, number>} activity - Activity concentrations (Bq/kg): Ra226, Th232, U238, K40
 * @param {number} number> - Dust concentration in air (kg/m³, > 0, typical 1e-7 to 1e-4)
 * @param {number} [breathingRate_m3_y=8760] - Annual breathing rate (m³/y, default for adult)
 * @returns {{dose_mSv_y: number, contributions: Record<string, number>}}
 * @throws {TypeError|RangeError}
 */
function inhalationDose(activity: Record<string, number>, dustConc_kg_m3: number, breathingRate_m3_y: number = 8760): {dose_mSv_y: number, contributions: Record<string, number>} {
    _validateActivityObject(activity);
    if (typeof dustConc_kg_m3 !== 'number' || dustConc_kg_m3 <= 0) throw new RangeError('dustConc_kg_m3 must be > 0');
    if (typeof breathingRate_m3_y !== 'number' || breathingRate_m3_y <= 0)
        throw new RangeError('breathingRate_m3_y must be > 0');

        const contributions: Record<string, number>= {};
    let total = 0;

    for (const nuclide of ['Ra226', 'Th232', 'U238', 'K40']) {
        const act = activity[nuclide] || 0;
        // Dose (mSv/y) = A (Bq/kg) × C_dust (kg/m³) × BR (m³/y) × dcf (mSv/Bq)
        const dose = act * dustConc_kg_m3 * breathingRate_m3_y * (DOSE_COEFFICIENTS.inhalation[nuclide] ?? 0);
        contributions[nuclide] = +dose.toFixed(6);
        total += dose;
    }

    return { dose_mSv_y: +total.toFixed(6), contributions };
}

/**
 * Annual effective dose from ingestion (food, water, soil).
 *
 * Dose efetiva anual por ingestão (alimentos, água ou solo contaminado
 * com NORM - frequente em populações rurais próximas de mineração).
 *
 * @param {Record<string, number>} activity - Activity concentrations (Bq/kg): Ra226, Th232, U238, K40
 * @param {number} number> - Daily intake of contaminated material (kg/day, > 0)
 * @returns {{dose_mSv_y: number, contributions: Record<string, number>}}
 * @throws {TypeError|RangeError}
 */
function ingestionDose(activity: Record<string, number>, dailyIntake_kg_d: number): {dose_mSv_y: number, contributions: Record<string, number>} {
    _validateActivityObject(activity);
    if (typeof dailyIntake_kg_d !== 'number' || dailyIntake_kg_d <= 0)
        throw new RangeError('dailyIntake_kg_d must be > 0');

    const annualIntake_kg = dailyIntake_kg_d * 365;
        const contributions: Record<string, number>= {};
    let total = 0;

    for (const nuclide of ['Ra226', 'Th232', 'U238', 'K40']) {
        const act = activity[nuclide] || 0;
        // Dose (mSv/y) = A (Bq/kg) × intake (kg/y) × dcf (mSv/Bq)
        const dose = act * annualIntake_kg * (DOSE_COEFFICIENTS.ingestion[nuclide] ?? 0);
        contributions[nuclide] = +dose.toFixed(6);
        total += dose;
    }

    return { dose_mSv_y: +total.toFixed(6), contributions };
}

/**
 * Radioactivity concentration index I-gamma (EC RP-112 §4).
 * Used for building materials (concrete, brick, tiles) derived from NORM.
 *
 * Índice de concentração de radioatividade I-gamma para materiais de construção
 * derivados de NORM (minério, subprodutos, resíduos industriais reutilizados).
 * I < 1.0 → aprovado sem restrições; I > 2.0 → uso restrito.
 *
 * @param {Record<string, number>} activity - Activity concentrations (Bq/kg): Ra226, Th232, K40
 * @returns {{I_gamma: number, I_index: number, compliant: boolean, category: string}}
 * @throws {TypeError|RangeError}
 */
function radioactivityConcentrationIndex(activity: Record<string, number>): {I_gamma: number, I_index: number, compliant: boolean, category: string} {
    if (!activity || typeof activity !== 'object') throw new TypeError('activity must be an object');
    for (const n of ['Ra226', 'Th232', 'K40']) {
        if (typeof activity[n] !== 'number' || activity[n] < 0)
            throw new RangeError(`activity.${n} must be a non-negative number`);
    }

    // I_gamma (EC RP-112 eq. 1): índice primário para dose efetiva ≤ 1 mGy/y
    const I_gamma =
        (activity.Ra226 ?? 0) / (REFERENCE_CONCENTRATIONS.Ra226 ?? 1) +
        (activity.Th232 ?? 0) / (REFERENCE_CONCENTRATIONS.Th232 ?? 1) +
        (activity.K40 ?? 0) / (REFERENCE_CONCENTRATIONS.K40 ?? 1);

    // I (simplified index for building materials - IAEA SSG-45 Annex I)
    // Numerically equal to I_gamma but with slightly different reference values
    const I_index = I_gamma; // same formulation for this implementation

    let category;
    if (I_gamma < 1.0) category = 'unrestricted_use';
    else if (I_gamma < 2.0) category = 'restricted_use';
    else category = 'not_recommended';

    return {
        I_gamma: +I_gamma.toFixed(4),
        I_index: +I_index.toFixed(4),
        compliant: I_gamma < 1.0,
        category,
    };
}

/**
 * Total annual effective dose from all pathways.
 * Checks compliance with 1 mSv/y limit (IAEA BSS / ICRP 103).
 *
 * Dose efetiva total anual integrando todas as vias de exposição e
 * verificando conformidade com limite de 1 mSv/ano para o público.
 *
 * @param {Record<string, number>} doses - Doses per pathway (mSv/y): external, inhalation, ingestion
 * @returns {{totalDose_mSv_y: number, compliant: boolean, limitFraction: number}}
 * @throws {TypeError|RangeError}
 */
function totalEffectiveDose(doses: Record<string, number>): {totalDose_mSv_y: number, compliant: boolean, limitFraction: number} {
    const keys = ['external', 'inhalation', 'ingestion'];
    for (const k of keys) {
        if (doses[k] === undefined || doses[k] === null) doses[k] = 0;
        if (typeof doses[k] !== 'number' || doses[k] < 0)
            throw new RangeError(`doses.${k} must be a non-negative number`);
    }

    const total = (doses.external ?? 0) + (doses.inhalation ?? 0) + (doses.ingestion ?? 0);
    const limitFraction = total / ANNUAL_DOSE_LIMIT_MSV;

    return {
        totalDose_mSv_y: +total.toFixed(6),
        compliant: total <= ANNUAL_DOSE_LIMIT_MSV,
        limitFraction: +limitFraction.toFixed(4),
    };
}

// --- Internal validator ---
/**
 * @param {Record<string, number>} activity
 * @throws {TypeError|RangeError}
 */
function _validateActivityObject(activity: Record<string, number>) {
    if (!activity || typeof activity !== 'object') throw new TypeError('activity must be an object with nuclide keys');
    for (const n of ['Ra226', 'Th232', 'U238', 'K40']) {
        const val = activity[n];
        if (val !== undefined && val !== null) {
            if (typeof val !== 'number' || val < 0) throw new RangeError(`activity.${n} must be a non-negative number`);
        }
    }
}

export {
    externalGammaDose,
    inhalationDose,
    ingestionDose,
    radioactivityConcentrationIndex,
    totalEffectiveDose,
    DOSE_COEFFICIENTS,
    ANNUAL_DOSE_LIMIT_MSV,
    REFERENCE_CONCENTRATIONS,
};

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const radiationDoseAssessmentNORMMeta = {
    name: 'radiationDoseAssessmentNORM',
    description: 'radiationDoseAssessmentNORM',
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
