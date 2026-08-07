// @ts-check
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
 * Nuclear Radiation Dose Assessment Module
 *
 * Cálculo de dose de radiação ionizante para avaliação de exposição ocupacional
 * e ambiental, conforme recomendações da ICRP (International Commission on
 * Radiological Protection).
 *
 * Referências acadêmicas:
 *   - ICRP (2007). The 2007 Recommendations of the International Commission
 *     on Radiological Protection. Publication 103. Ann. ICRP 37(2-4).
 *     DOI: 10.1016/j.icrp.2007.10.003
 *   - ICRP (2010). Conversion Coefficients for Radiological Protection
 *     Quantities for External Radiation Exposures. Publication 116.
 *     Ann. ICRP 40(2-5).
 *     DOI: 10.1016/j.icrp.2011.10.001
 *   - ICRP (2012). Compendium of Dose Coefficients based on ICRP Publication 60.
 *     Publication 119. Ann. ICRP 41(Suppl).
 *     DOI: 10.1016/j.icrp.2012.06.038
 *
 * @module nuclearRadiationDose
 */

/**
 * Computes external gamma dose from volumetric activity in air.
 *
 * Calcula a dose de radiação gama externa a partir da atividade volumétrica
 * no ar, usando um fator geométrico que representa a configuração espacial
 * da fonte (plano infinito, cilindro, esfera, etc.).
 *
 * Fórmula: H = A × G × t × DCF_gamma
 * DCF_gamma padrão para Cs-137: ≈ 7.0×10⁻⁷ Sv/(Bq·s/m³) (ICRP 116)
 *
 * @param {number} activity_Bq_m3 - Atividade volumétrica [Bq/m³]; deve ser ≥ 0
 * @param {number} geometry_factor - Fator geométrico adimensional (0–1); 1 = fonte infinita
 * @param {number} exposure_h - Tempo de exposição [h]; deve ser ≥ 0
 * @returns {{ dose_mSv: number }} Dose efetiva de radiação gama [mSv]
 * @throws {TypeError} Se os parâmetros não forem números
 * @throws {RangeError} Se os valores estiverem fora dos limites físicos
 */
export function computeExternalGammaDose(activity_Bq_m3: any, geometry_factor: any, exposure_h: any) {
    if (typeof activity_Bq_m3 !== 'number' || typeof geometry_factor !== 'number' || typeof exposure_h !== 'number') {
        throw new TypeError('computeExternalGammaDose: activity_Bq_m3, geometry_factor e exposure_h devem ser números');
    }
    if (activity_Bq_m3 < 0) {
        throw new RangeError(`computeExternalGammaDose: activity_Bq_m3 deve ser ≥ 0, recebido ${activity_Bq_m3}`);
    }
    if (geometry_factor < 0 || geometry_factor > 1) {
        throw new RangeError(
            `computeExternalGammaDose: geometry_factor deve estar em [0, 1], recebido ${geometry_factor}`,
        );
    }
    if (exposure_h < 0) {
        throw new RangeError(`computeExternalGammaDose: exposure_h deve ser ≥ 0, recebido ${exposure_h}`);
    }
    // DCF gama para radionuclídeo genérico (referência Cs-137 ICRP 116) [Sv per Bq·s/m³]
    const DCF_gamma_Sv_per_Bq_s_m3 = 7.0e-7;
    // Conversão de horas para segundos
    const exposure_s = exposure_h * 3600;
    // Dose [Sv] = atividade [Bq/m³] × fator geométrico × tempo [s] × DCF
    const dose_Sv = activity_Bq_m3 * geometry_factor * exposure_s * DCF_gamma_Sv_per_Bq_s_m3;
    return { dose_mSv: dose_Sv * 1000 };
}

/**
 * Computes committed effective dose from inhalation of radioactive aerosols.
 *
 * Calcula a dose comprometida por inalação de material radioativo,
 * integrada por 50 anos conforme ICRP 119.
 *
 * Fórmula: E_committed = A [Bq/m³] × BR [m³/h] × DCF [Sv/Bq] × t [h]
 *
 * @param {number} activity_Bq_m3 - Atividade volumétrica no ar [Bq/m³]; deve ser ≥ 0
 * @param {number} breathing_rate_m3_h - Taxa de respiração [m³/h]; deve ser > 0
 * @param {number} DCF_Sv_Bq - Coeficiente de dose por inalação [Sv/Bq] (ICRP 119); deve ser > 0
 * @param {number} exposure_h - Duração da exposição [h]; deve ser ≥ 0
 * @returns {{ committed_dose_mSv: number }} Dose efetiva comprometida [mSv]
 * @throws {TypeError} Se os parâmetros não forem números
 * @throws {RangeError} Se os valores estiverem fora dos limites físicos
 */
export function computeInternalInhalationDose(activity_Bq_m3: any, breathing_rate_m3_h: any, DCF_Sv_Bq: any, exposure_h: any) {
    if (
        typeof activity_Bq_m3 !== 'number' ||
        typeof breathing_rate_m3_h !== 'number' ||
        typeof DCF_Sv_Bq !== 'number' ||
        typeof exposure_h !== 'number'
    ) {
        throw new TypeError('computeInternalInhalationDose: todos os parâmetros devem ser números');
    }
    if (activity_Bq_m3 < 0) {
        throw new RangeError(`computeInternalInhalationDose: activity_Bq_m3 deve ser ≥ 0, recebido ${activity_Bq_m3}`);
    }
    if (breathing_rate_m3_h <= 0) {
        throw new RangeError(
            `computeInternalInhalationDose: breathing_rate_m3_h deve ser > 0, recebido ${breathing_rate_m3_h}`,
        );
    }
    if (DCF_Sv_Bq <= 0) {
        throw new RangeError(`computeInternalInhalationDose: DCF_Sv_Bq deve ser > 0, recebido ${DCF_Sv_Bq}`);
    }
    if (exposure_h < 0) {
        throw new RangeError(`computeInternalInhalationDose: exposure_h deve ser ≥ 0, recebido ${exposure_h}`);
    }
    // Atividade inalada [Bq] = C [Bq/m³] × BR [m³/h] × t [h]
    const inhaled_Bq = activity_Bq_m3 * breathing_rate_m3_h * exposure_h;
    // Dose comprometida [Sv] = atividade inalada [Bq] × DCF [Sv/Bq]
    const committed_dose_Sv = inhaled_Bq * DCF_Sv_Bq;
    return { committed_dose_mSv: committed_dose_Sv * 1000 };
}

/**
 * Computes effective dose rate considering occupancy factor.
 *
 * Calcula a dose efetiva recebida considerando o fator de ocupação,
 * que representa a fração do tempo que o trabalhador permanece em área irradiada.
 * Método ICRP 103 (2007), §B.9.
 *
 * @param {number} H_ambient_uSv_h - Taxa de dose ambiente H*(10) [µSv/h]; deve ser ≥ 0
 * @param {number} occupancy_factor - Fator de ocupação (0–1); 1 = tempo integral
 * @param {number} exposure_h - Tempo total no local [h]; deve ser ≥ 0
 * @returns {{ effective_dose_mSv: number }} Dose efetiva recebida [mSv]
 * @throws {TypeError} Se os parâmetros não forem números
 * @throws {RangeError} Se os valores estiverem fora dos limites físicos
 */
export function computeEffectiveDoseRate(H_ambient_uSv_h: any, occupancy_factor: any, exposure_h: any) {
    if (typeof H_ambient_uSv_h !== 'number' || typeof occupancy_factor !== 'number' || typeof exposure_h !== 'number') {
        throw new TypeError(
            'computeEffectiveDoseRate: H_ambient_uSv_h, occupancy_factor e exposure_h devem ser números',
        );
    }
    if (H_ambient_uSv_h < 0) {
        throw new RangeError(`computeEffectiveDoseRate: H_ambient_uSv_h deve ser ≥ 0, recebido ${H_ambient_uSv_h}`);
    }
    if (occupancy_factor < 0 || occupancy_factor > 1) {
        throw new RangeError(
            `computeEffectiveDoseRate: occupancy_factor deve estar em [0, 1], recebido ${occupancy_factor}`,
        );
    }
    if (exposure_h < 0) {
        throw new RangeError(`computeEffectiveDoseRate: exposure_h deve ser ≥ 0, recebido ${exposure_h}`);
    }
    // Dose [µSv] = taxa [µSv/h] × fator de ocupação × tempo [h]
    // Conversão µSv → mSv: ÷ 1000
    const effective_dose_mSv = (H_ambient_uSv_h * occupancy_factor * exposure_h) / 1000;
    return { effective_dose_mSv };
}

/**
 * Classifies radiation dose according to ICRP 103 dose ranges.
 *
 * Classifica a dose de radiação e indica a ação regulatória adequada conforme
 * os princípios de proteção radiológica da ICRP 103 (2007) e CNEN NE-3.01.
 *
 * Faixas de dose efetiva (ICRP 103, Table B2):
 *   negligible : < 0.01 mSv  - sem ação necessária
 *   low        : < 1 mSv     - monitoramento
 *   moderate   : < 20 mSv    - limite anual ocupacional (CNEN)
 *   high       : < 100 mSv   - intervenção recomendada
 *   extreme    : ≥ 100 mSv   - intervenção imediata obrigatória
 *
 * @param {number} dose_mSv - Dose efetiva [mSv]; deve ser ≥ 0
 * @param {string} period - Período da dose (ex: 'annual', 'event', 'lifetime')
 * @returns {{ classification: string, regulatory_action: string, dose_mSv: number, period: string }}
 * @throws {TypeError} Se dose_mSv não for número ou period não for string
 * @throws {RangeError} Se dose_mSv for negativo
 */
export function classifyRadiationDose(dose_mSv: any, period: any) {
    if (typeof dose_mSv !== 'number') {
        throw new TypeError('classifyRadiationDose: dose_mSv deve ser um número');
    }
    if (typeof period !== 'string' || period.trim() === '') {
        throw new TypeError('classifyRadiationDose: period deve ser uma string não vazia');
    }
    if (dose_mSv < 0) {
        throw new RangeError(`classifyRadiationDose: dose_mSv deve ser ≥ 0, recebido ${dose_mSv}`);
    }
    let classification;
    let regulatory_action;
    if (dose_mSv < 0.01) {
        classification = 'negligible';
        regulatory_action = 'No action required — dose below detection significance level';
    } else if (dose_mSv < 1) {
        classification = 'low';
        regulatory_action = 'Routine monitoring — below public dose limit (1 mSv/yr, ICRP 103)';
    } else if (dose_mSv < 20) {
        classification = 'moderate';
        regulatory_action =
            'Occupational monitoring required — within annual occupational limit (20 mSv/yr, CNEN NE-3.01)';
    } else if (dose_mSv < 100) {
        classification = 'high';
        regulatory_action = 'Dose reduction intervention recommended — exceeds occupational limit';
    } else {
        classification = 'extreme';
        regulatory_action = 'Immediate mandatory intervention — deterministic effects threshold exceeded (ICRP 103)';
    }
    return { classification, regulatory_action, dose_mSv, period };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const nuclearRadiationDoseMeta = {
    name: 'nuclearRadiationDose',
    description: 'nuclearRadiationDose',
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
