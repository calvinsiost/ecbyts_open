// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * Occupational Dermal Exposure - Percutaneous absorption, systemic dose,
 * hazard quotient, and risk classification for dermal chemical exposure.
 *
 * Exposição dérmica ocupacional - absorção percutânea, dose sistêmica,
 * quociente de perigo e classificação de risco.
 *
 * References / Referências:
 * - USEPA (1991) Dermal Exposure Assessment: Principles and Applications.
 *   EPA/600/8-91/011B. RAGS Part B.
 * - Schneider, T. et al. (1999) Conceptual model for assessment of dermal
 *   exposure. Occup. Environ. Med. 56(12):765-773. doi:10.1136/oem.56.12.765
 * - ACGIH (2024) TLVs and BEIs - Threshold Limit Values. Cincinnati, OH.
 * - OSHA 29 CFR 1910.1000 - Air Contaminants PEL Table Z-1
 * - MTE NR-6 (2022) - Equipamentos de Proteção Individual (EPI), Brasil
 */
'use strict';

/**
 * Compute dermal absorption dose from skin contact parameters.
 * Calcula a dose absorvida pela pele por contato com substância química.
 *
 * Dose = C × SA × AF × freq_events_per_day  (mg absorvidos por dia)
 *
 * @param {number} concentration_mg_cm2   - Surface concentration (mg/cm²) / Concentração superficial
 * @param {number} skin_area_cm2          - Exposed skin area (cm²) / Área de pele exposta
 * @param {number} absorption_fraction    - Dermal absorption fraction [0,1] / Fração de absorção dérmica
 * @param {number} contact_duration_h     - Duration of each contact event (h) / Duração do contato
 * @param {number} events_per_day         - Contact events per day / Eventos de contato por dia
 * @returns {{ absorbed_mg: number, absorbed_mg_day: number }}
 */
export function computeDermalAbsorption(
    concentration_mg_cm2: any,
    skin_area_cm2: any,
    absorption_fraction: any,
    contact_duration_h: any,
    events_per_day: any,
) {
    if (
        [concentration_mg_cm2, skin_area_cm2, absorption_fraction, contact_duration_h, events_per_day].some(
            (v) => typeof v !== 'number',
        )
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (concentration_mg_cm2 < 0) throw new RangeError('concentration_mg_cm2 must be >= 0');
    if (skin_area_cm2 <= 0) throw new RangeError('skin_area_cm2 must be > 0');
    if (absorption_fraction < 0 || absorption_fraction > 1) {
        throw new RangeError('absorption_fraction must be in [0, 1]');
    }
    if (contact_duration_h < 0) throw new RangeError('contact_duration_h must be >= 0');
    if (events_per_day <= 0) throw new RangeError('events_per_day must be > 0');

    // Dose absorvida por evento de contato / Dose absorbed per contact event
    // Nota: contact_duration_h não altera a dose quando a fração é já a fração de equilíbrio
    // assumindo que a fração de absorção já incorpora o período de contato.
    // RAGS Part B usa: Derm = C × SA × AF × EV / BW (normalizado por peso corporal)
    // aqui retornamos a dose bruta não normalizada.
    const absorbed_mg = concentration_mg_cm2 * skin_area_cm2 * absorption_fraction;
    const absorbed_mg_day = absorbed_mg * events_per_day;

    return { absorbed_mg, absorbed_mg_day };
}

/**
 * Compute body-weight-normalized systemic dermal dose.
 * Calcula a dose sistêmica normalizada por peso corporal.
 *
 * Dose sistêmica (mg/kg/dia) = Dose absorvida (mg/dia) / Peso corporal (kg)
 *
 * @param {number} absorbed_mg_day  - Daily absorbed dose (mg/day) / Dose absorvida por dia
 * @param {number} body_weight_kg   - Body weight (kg) / Peso corporal
 * @returns {{ dose_mg_kg_day: number }}
 */
export function computeSystemicDose(absorbed_mg_day: any, body_weight_kg: any) {
    if (typeof absorbed_mg_day !== 'number' || typeof body_weight_kg !== 'number') {
        throw new TypeError('absorbed_mg_day and body_weight_kg must be numbers');
    }
    if (absorbed_mg_day < 0) throw new RangeError('absorbed_mg_day must be >= 0');
    if (body_weight_kg <= 0) throw new RangeError('body_weight_kg must be > 0');

    const dose_mg_kg_day = absorbed_mg_day / body_weight_kg;
    return { dose_mg_kg_day };
}

/**
 * Compute dermal hazard quotient (HQ) for non-carcinogenic risk.
 * Calcula o quociente de perigo (HQ) dérmico para risco não cancerígeno.
 *
 * HQ = Dose sistêmica / RfD dérmica
 * HQ > 1 indica potencial preocupação com saúde.
 *
 * @param {number} systemic_dose_mg_kg_day - Systemic dose (mg/kg/day) / Dose sistêmica
 * @param {number} dermal_rfd_mg_kg_day    - Dermal reference dose (mg/kg/day) / Dose de referência dérmica
 * @returns {{ hq: number, concern: boolean }}
 */
export function computeDermalHazardQuotient(systemic_dose_mg_kg_day: any, dermal_rfd_mg_kg_day: any) {
    if (typeof systemic_dose_mg_kg_day !== 'number' || typeof dermal_rfd_mg_kg_day !== 'number') {
        throw new TypeError('systemic_dose_mg_kg_day and dermal_rfd_mg_kg_day must be numbers');
    }
    if (systemic_dose_mg_kg_day < 0) throw new RangeError('systemic_dose_mg_kg_day must be >= 0');
    if (dermal_rfd_mg_kg_day <= 0) throw new RangeError('dermal_rfd_mg_kg_day must be > 0');

    const hq = systemic_dose_mg_kg_day / dermal_rfd_mg_kg_day;
    const concern = hq > 1;

    return { hq, concern };
}

/**
 * Classify dermal risk level and recommend PPE.
 * Classifica o nível de risco dérmico e recomenda EPI.
 *
 * Critérios (adaptado de USEPA RAGS + MTE NR-6):
 * - critical: HQ ≥ 10 ou (carcinogênico && HQ ≥ 1)
 * - high: HQ ≥ 5 ou sensibilizante cutâneo com HQ ≥ 2
 * - moderate: HQ ≥ 1
 * - low: 0.1 ≤ HQ < 1
 * - negligible: HQ < 0.1
 *
 * @param {number}  hq             - Hazard quotient / Quociente de perigo
 * @param {boolean} skin_sensitizer - Is the substance a skin sensitizer? / É sensibilizante cutâneo?
 * @param {boolean} carcinogen      - Is the substance a carcinogen? / É carcinogênico?
 * @returns {{ risk: string, ppe_recommendation: string }}
 */
export function classifyDermalRisk(hq: any, skin_sensitizer: any, carcinogen: any) {
    if (typeof hq !== 'number') throw new TypeError('hq must be a number');
    if (hq < 0) throw new RangeError('hq must be >= 0');
    if (typeof skin_sensitizer !== 'boolean') throw new TypeError('skin_sensitizer must be a boolean');
    if (typeof carcinogen !== 'boolean') throw new TypeError('carcinogen must be a boolean');

    let risk, ppe_recommendation;

    // Avaliação integrada: carcinogenicidade ou HQ elevado = risco crítico
    // Integrated assessment: carcinogenicity or high HQ = critical risk
    if (hq >= 10 || (carcinogen && hq >= 1)) {
        risk = 'critical';
        ppe_recommendation =
            'Traje de proteção química completo (nível B/C); luvas de neoprene dupla; respirador de face completa; NR-6 Art. 6.3 — consultar FISPQ';
    } else if (hq >= 5 || (skin_sensitizer && hq >= 2)) {
        risk = 'high';
        ppe_recommendation =
            'Macacão descartável; luvas de neoprene 15 mil; óculos de segurança vedados; avental impermeável';
    } else if (hq >= 1) {
        risk = 'moderate';
        ppe_recommendation =
            'Luvas nitrílicas 8 mil; avental de PVC; óculos de segurança; lavar mãos imediatamente após contato';
    } else if (hq >= 0.1) {
        risk = 'low';
        ppe_recommendation = 'Luvas nitrílicas descartáveis; boa higiene pessoal pós-contato';
    } else {
        risk = 'negligible';
        ppe_recommendation = 'EPI básico conforme NR-6; monitoramento periódico recomendado';
    }

    return { risk, ppe_recommendation };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const occupationalDermalExposureMeta = {
    name: 'occupationalDermalExposure',
    description: 'occupationalDermalExposure',
    category: 'analytics',
    familyTags: ['occupational'],
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
