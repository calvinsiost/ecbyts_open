// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Radiation Protection Model - effective dose, shielding, external dose rate, risk classification
// Proteção radiológica ambiental - dose efetiva, fator de ocupação, proteção por blindagem.
//
// References / Referências:
//   ICRP Publication 103 (2007) - The 2007 Recommendations of ICRP. Ann. ICRP 37(2-4).
//   ICRP Publication 72 (1996) - Age-dependent Doses to Members of the Public from Intake of
//     Radionuclides: Part 5 - Compilation of Ingestion and Inhalation Dose Coefficients.
//   CNEN NE 3.01 - Diretrizes Básicas de Proteção Radiológica (Brazil).
//   IAEA Safety Series No. 115 (1996) - International Basic Safety Standards for Protection
//     Against Ionizing Radiation and for the Safety of Radiation Sources.

'use strict';

interface EffectiveDoseResult { dose_Sv: number; dose_mSv: number; }
interface ShieldingResult { transmission: number; attenuation_dB: number; }
interface DoseRateResult { dose_rate_Sv_s: number; dose_rate_uSv_h: number; }
interface RiskCategory { category: 'negligible' | 'acceptable' | 'intervention' | 'emergency'; limit_mSv: number; action: string; }
interface DoseLimitInfo { limit: number; action: string; }

/**
 * Linear attenuation coefficients (cm⁻¹) for common shielding materials at ~0.66 MeV (Cs-137 gamma).
 * Coeficientes de atenuação linear (cm⁻¹) para blindagens comuns em ~0.66 MeV (Cs-137).
 * Source: NIST XCOM database; IAEA Safety Series No. 115.
 * @private
 */
const ATTENUATION_COEFFICIENTS_PER_CM: Record<'lead' | 'concrete' | 'water' | 'iron', number> = {
    lead: 1.26, // Pb — alta densidade: excelente blindagem gama
    concrete: 0.15, // concreto comum (ρ ≈ 2.3 g/cm³)
    water: 0.096, // água — boa para blindagem de nêutrons
    iron: 0.47, // aço/ferro (ρ ≈ 7.87 g/cm³)
};

/**
 * ICRP 103 dose classification thresholds (mSv/year) and recommended actions.
 * Limites de dose da ICRP 103 (mSv/ano) e ações recomendadas.
 * @private
 */
const ICRP103_DOSE_LIMITS_MSV: Record<'negligible' | 'acceptable' | 'intervention' | 'emergency', DoseLimitInfo> = {
    negligible: { limit: 1, action: 'No action required — below negligible individual dose (NID)' },
    acceptable: { limit: 20, action: 'Continue monitoring — within occupational/public planned exposure limit' },
    intervention: { limit: 100, action: 'Protective actions required — exceeds planned situation limit' },
    emergency: { limit: Infinity, action: 'Emergency response required — exceeds intervention level' },
};

/**
 * Compute effective dose from radionuclide intake using ICRP dose coefficients.
 * Calcula a dose efetiva comprometida por ingestão/inalação de radionuclídeo com coeficiente de dose ICRP 72.
 * E = A × DC × T  where A = activity (Bq), DC = dose coefficient (Sv/Bq), T = occupancy factor [0,1].
 *
 * @param {number} activity_Bq - Activity intake or source strength A (Bq).
 *   Atividade ingerida/inalada ou intensidade da fonte (Bq).
 * @param {number} dose_coefficient_Sv_Bq - ICRP dose coefficient DC (Sv/Bq).
 *   Coeficiente de dose ICRP 72 (Sv/Bq). Ex.: I-131 ingestion adult: 2.2e-8 Sv/Bq.
 * @param {number} occupancy_factor - Occupancy or usage factor T ∈ [0, 1].
 *   Fator de ocupação ou utilização T ∈ [0, 1]. Ex.: 1.0 = tempo integral.
 * @returns {{ dose_Sv: number, dose_mSv: number }}
 *   Effective dose in Sv and mSv.
 * @throws {TypeError} If inputs are not finite numbers.
 * @throws {RangeError} If activity_Bq or dose_coefficient_Sv_Bq < 0, or occupancy_factor not in [0,1].
 */
export function computeEffectiveDose(activity_Bq: number, dose_coefficient_Sv_Bq: number, occupancy_factor: number): EffectiveDoseResult {
    if (
        !Number.isFinite(activity_Bq) ||
        !Number.isFinite(dose_coefficient_Sv_Bq) ||
        !Number.isFinite(occupancy_factor)
    ) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (activity_Bq < 0) {
        throw new RangeError('activity_Bq must be >= 0');
    }
    if (dose_coefficient_Sv_Bq < 0) {
        throw new RangeError('dose_coefficient_Sv_Bq must be >= 0');
    }
    if (occupancy_factor < 0 || occupancy_factor > 1) {
        throw new RangeError('occupancy_factor must be in [0, 1]');
    }

    const dose_Sv = activity_Bq * dose_coefficient_Sv_Bq * occupancy_factor;
    const dose_mSv = dose_Sv * 1000;

    return { dose_Sv, dose_mSv };
}

/**
 * Compute gamma radiation transmission and attenuation through a shielding material.
 * Calcula a transmissão e atenuação de radiação gama através de blindagem (Lei de Beer-Lambert).
 * transmission = exp(-μ × d)
 * attenuation_dB = -10 × log10(transmission)
 *
 * @param {'lead'|'concrete'|'water'|'iron'} material - Shielding material.
 *   Material de blindagem.
 * @param {number} thickness_cm - Shield thickness d (cm). Must be >= 0.
 *   Espessura da blindagem d (cm). Deve ser >= 0.
 * @returns {{ transmission: number, attenuation_dB: number }}
 *   Fractional transmission [0,1] and attenuation in dB.
 * @throws {TypeError} If thickness_cm is not a finite number.
 * @throws {RangeError} If material is unsupported or thickness_cm < 0.
 */
export function computeShieldingFactor(material: 'lead' | 'concrete' | 'water' | 'iron', thickness_cm: number): ShieldingResult {
    const VALID_MATERIALS = Object.keys(ATTENUATION_COEFFICIENTS_PER_CM) as Array<'lead' | 'concrete' | 'water' | 'iron'>;
    if (!VALID_MATERIALS.includes(material)) {
        throw new RangeError(`material must be one of: ${VALID_MATERIALS.join(', ')}`);
    }
    if (!Number.isFinite(thickness_cm)) {
        throw new TypeError('thickness_cm must be a finite number');
    }
    if (thickness_cm < 0) {
        throw new RangeError('thickness_cm must be >= 0');
    }

    const mu = ATTENUATION_COEFFICIENTS_PER_CM[material]!;
    const transmission = Math.exp(-mu * thickness_cm);

    // Atenuação em decibéis: medida logarítmica da redução da intensidade
    // Attenuation in dB: logarithmic measure of intensity reduction
    const attenuation_dB = transmission > 0 ? -10 * Math.log10(transmission) : Infinity;

    return { transmission, attenuation_dB };
}

/**
 * Compute external gamma dose rate from a volumetric source using inverse-square law.
 * Calcula a taxa de dose gama externa de uma fonte volumétrica pela lei do inverso do quadrado.
 * dose_rate = Γ × A / r²   where Γ = gamma ray constant (Sv·m²/(Bq·s)), A = activity (Bq/m³), r = distance (m).
 *
 * @param {number} activity_Bq_m3 - Source activity concentration A (Bq/m³).
 *   Concentração de atividade da fonte A (Bq/m³).
 * @param {number} gamma_constant_Sv_m2_Bq_s - Gamma-ray constant Γ (Sv·m²/(Bq·s)).
 *   Constante de emissão gama Γ (Sv·m²/(Bq·s)). Ex.: Cs-137: 8.8e-14, Co-60: 3.3e-13.
 * @param {number} distance_m - Distance from source to receptor r (m). Must be > 0.
 *   Distância da fonte ao receptor r (m). Deve ser > 0.
 * @returns {{ dose_rate_Sv_s: number, dose_rate_uSv_h: number }}
 *   Dose rate in Sv/s and µSv/h.
 * @throws {TypeError} If inputs are not finite numbers.
 * @throws {RangeError} If activity_Bq_m3 or gamma_constant < 0, or distance_m <= 0.
 */
export function computeExternalDoseRate(activity_Bq_m3: number, gamma_constant_Sv_m2_Bq_s: number, distance_m: number): DoseRateResult {
    if (
        !Number.isFinite(activity_Bq_m3) ||
        !Number.isFinite(gamma_constant_Sv_m2_Bq_s) ||
        !Number.isFinite(distance_m)
    ) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (activity_Bq_m3 < 0) {
        throw new RangeError('activity_Bq_m3 must be >= 0');
    }
    if (gamma_constant_Sv_m2_Bq_s < 0) {
        throw new RangeError('gamma_constant_Sv_m2_Bq_s must be >= 0');
    }
    if (distance_m <= 0) {
        throw new RangeError('distance_m must be > 0');
    }

    const dose_rate_Sv_s = (gamma_constant_Sv_m2_Bq_s * activity_Bq_m3) / (distance_m * distance_m);
    // Conversão: 1 Sv/s = 1e6 µSv/s; 1 h = 3600 s
    const dose_rate_uSv_h = dose_rate_Sv_s * 1e6 * 3600;

    return { dose_rate_Sv_s, dose_rate_uSv_h };
}

/**
 * Classify radiation risk level based on annual effective dose (ICRP Publication 103, 2007).
 * Classifica o nível de risco radiológico com base na dose efetiva anual (ICRP Pub. 103, 2007).
 *
 * Thresholds (mSv/year):
 *   negligible:    < 1 (below NID - Negligible Individual Dose)
 *   acceptable:    1–20 (planned exposure situations)
 *   intervention:  20–100 (protective actions required)
 *   emergency:     ≥ 100 (emergency response)
 *
 * @param {number} annual_dose_mSv - Annual effective dose (mSv/year). Must be >= 0.
 *   Dose efetiva anual (mSv/ano). Deve ser >= 0.
 * @returns {{ category: 'negligible'|'acceptable'|'intervention'|'emergency', limit_mSv: number, action: string }}
 *   Risk category, applicable dose limit (mSv), and recommended action.
 * @throws {TypeError} If annual_dose_mSv is not a finite number.
 * @throws {RangeError} If annual_dose_mSv < 0.
 */
export function classifyRadiationRisk(annual_dose_mSv: number): RiskCategory {
    if (!Number.isFinite(annual_dose_mSv)) {
        throw new TypeError('annual_dose_mSv must be a finite number');
    }
    if (annual_dose_mSv < 0) {
        throw new RangeError('annual_dose_mSv must be >= 0');
    }

    let category: 'negligible' | 'acceptable' | 'intervention' | 'emergency';
    if (annual_dose_mSv < 1) {
        category = 'negligible';
    } else if (annual_dose_mSv < 20) {
        category = 'acceptable';
    } else if (annual_dose_mSv < 100) {
        category = 'intervention';
    } else {
        category = 'emergency';
    }

    const { limit, action } = ICRP103_DOSE_LIMITS_MSV[category]!;

    return { category, limit_mSv: limit === Infinity ? 100 : limit, action };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const radiationProtectionModelMeta = {
    name: 'radiationProtectionModel',
    description: 'radiationProtectionModel',
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
