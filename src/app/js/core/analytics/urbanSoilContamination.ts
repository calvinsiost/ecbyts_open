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
 * Urban Soil Contamination - avaliação de risco de exposição humana a solos urbanos
 * contaminados em áreas residenciais e industriais.
 *
 * Referências:
 *   USEPA (1989). Exposure Factors Handbook. EPA/600/8-89/043.
 *   USEPA (2011). Exposure Factors Handbook, 2011 Edition. EPA/600/R-09/052F.
 *   USEPA (1989). Risk Assessment Guidance for Superfund, Vol. I.
 *     EPA/540/1-89/002.
 */

/**
 * Calcula a dose diária média por ingestão de solo para crianças.
 * ADD = C × IR × EF × ED / (BW × AT × 365) × 1e-6
 * (USEPA 1989 Exposure Factors Handbook)
 *
 * @param {number} soil_concentration_mg_kg - Concentração no solo em mg/kg
 * @param {number} ingestion_rate_mg_day    - Taxa de ingestão de solo em mg/dia (crianças: 200 mg/dia)
 * @param {number} body_weight_kg           - Peso corporal em kg
 * @param {number} exposure_freq_days       - Frequência de exposição em dias/ano
 * @param {number} ED_years                 - Duração da exposição em anos
 * @param {number} AT_years                 - Período de média temporal (averaging time) em anos
 * @returns {{ dose_mg_kg_day: number }}
 * @throws {TypeError}  se argumentos não forem números
 * @throws {RangeError} se valores estiverem fora dos limites físicos
 */
export function computeChildSoilIngestionDose(
    soil_concentration_mg_kg: any,
    ingestion_rate_mg_day: any,
    body_weight_kg: any,
    exposure_freq_days: any,
    ED_years: any,
    AT_years: any,
) {
    const args = {
        soil_concentration_mg_kg,
        ingestion_rate_mg_day,
        body_weight_kg,
        exposure_freq_days,
        ED_years,
        AT_years,
    };
    for (const [name, val] of Object.entries(args)) {
        if (typeof val !== 'number') {
            throw new TypeError(`${name} deve ser um número`);
        }
        if (val <= 0) {
            throw new RangeError(`${name} deve ser positivo`);
        }
    }
    if (exposure_freq_days > 365) {
        throw new RangeError('exposure_freq_days não pode exceder 365 dias/ano');
    }

    // ADD [mg/kg/dia] = C [mg/kg] × IR [mg/dia] × EF [dias/ano] × ED [anos] /
    //                   (BW [kg] × AT [anos] × 365 [dias/ano]) × 1e-6 [kg→mg]
    const dose_mg_kg_day =
        ((soil_concentration_mg_kg * ingestion_rate_mg_day * exposure_freq_days * ED_years) /
            (body_weight_kg * AT_years * 365)) *
        1e-6;
    return { dose_mg_kg_day };
}

/**
 * Calcula a dose diária média por absorção dérmica de solo contaminado.
 * ADD = C × SA × AF × ABS × EF × ED / (BW × AT × 365) × 1e-6
 * (USEPA 1989 Exposure Factors Handbook)
 *
 * @param {number} soil_concentration_mg_kg - Concentração no solo em mg/kg
 * @param {number} skin_area_cm2            - Área de pele exposta em cm²
 * @param {number} AF_mg_cm2                - Fator de adesão solo-pele em mg/cm²
 * @param {number} ABS_fraction             - Fração absorvida dermicamente [0, 1]
 * @param {number} body_weight_kg           - Peso corporal em kg
 * @param {number} EF_days                  - Frequência de exposição em dias/ano
 * @param {number} ED_years                 - Duração da exposição em anos
 * @param {number} AT_years                 - Período de média temporal em anos
 * @returns {{ dose_mg_kg_day: number }}
 * @throws {TypeError}  se argumentos não forem números
 * @throws {RangeError} se valores estiverem fora dos limites físicos
 */
export function computeDermalAbsorptionDose(
    soil_concentration_mg_kg: any,
    skin_area_cm2: any,
    AF_mg_cm2: any,
    ABS_fraction: any,
    body_weight_kg: any,
    EF_days: any,
    ED_years: any,
    AT_years: any,
) {
    const positiveArgs = {
        soil_concentration_mg_kg,
        skin_area_cm2,
        AF_mg_cm2,
        body_weight_kg,
        EF_days,
        ED_years,
        AT_years,
    };
    for (const [name, val] of Object.entries(positiveArgs)) {
        if (typeof val !== 'number') {
            throw new TypeError(`${name} deve ser um número`);
        }
        if (val <= 0) {
            throw new RangeError(`${name} deve ser positivo`);
        }
    }
    if (typeof ABS_fraction !== 'number') {
        throw new TypeError('ABS_fraction deve ser um número');
    }
    if (ABS_fraction < 0 || ABS_fraction > 1) {
        throw new RangeError('ABS_fraction deve estar em [0, 1]');
    }
    if (EF_days > 365) {
        throw new RangeError('EF_days não pode exceder 365 dias/ano');
    }

    // ADD [mg/kg/dia] = C × SA [cm²] × AF [mg/cm²] × ABS × EF [d/ano] × ED [anos] /
    //                   (BW [kg] × AT [anos] × 365 [d/ano]) × 1e-6
    const dose_mg_kg_day =
        ((soil_concentration_mg_kg * skin_area_cm2 * AF_mg_cm2 * ABS_fraction * EF_days * ED_years) /
            (body_weight_kg * AT_years * 365)) *
        1e-6;
    return { dose_mg_kg_day };
}

/**
 * Calcula o Quociente de Perigo (HQ) por via e o Índice de Perigo (HI) total.
 * HI = Σ(ADD_via / RfD) - soma dos quocientes de perigo por todas as vias.
 * (USEPA RAGS 1989, Eq. 4-12)
 *
 * @param {number} ingestion_dose    - Dose por ingestão em mg/kg/dia
 * @param {number} dermal_dose       - Dose por absorção dérmica em mg/kg/dia
 * @param {number} inhalation_dose   - Dose por inalação de partículas em mg/kg/dia
 * @param {number} RfD_mg_kg_day     - Dose de referência (RfD) em mg/kg/dia
 * @returns {{ HQ: { ingestion: number, dermal: number, inhalation: number }, HI: number }}
 * @throws {TypeError}  se argumentos não forem números
 * @throws {RangeError} se doses forem negativas ou RfD não for positiva
 */
export function computeUrbanSoilRiskIndex(ingestion_dose: any, dermal_dose: any, inhalation_dose: any, RfD_mg_kg_day: any) {
    const doses = { ingestion_dose, dermal_dose, inhalation_dose };
    for (const [name, val] of Object.entries(doses)) {
        if (typeof val !== 'number') {
            throw new TypeError(`${name} deve ser um número`);
        }
        if (val < 0) {
            throw new RangeError(`${name} deve ser não-negativo`);
        }
    }
    if (typeof RfD_mg_kg_day !== 'number') {
        throw new TypeError('RfD_mg_kg_day deve ser um número');
    }
    if (RfD_mg_kg_day <= 0) {
        throw new RangeError('RfD_mg_kg_day deve ser positivo');
    }

    // Quociente de perigo por via (adimensional)
    const HQ = {
        ingestion: ingestion_dose / RfD_mg_kg_day,
        dermal: dermal_dose / RfD_mg_kg_day,
        inhalation: inhalation_dose / RfD_mg_kg_day,
    };

    // Índice de perigo = soma dos quocientes por via (não-compensatório)
    const HI = HQ.ingestion + HQ.dermal + HQ.inhalation;
    return { HQ, HI };
}

/**
 * Classifica a prioridade de remediação de solo urbano com base no HI e uso do solo.
 * Uso residencial eleva a sensibilidade (limiar 2× maior para mesma prioridade).
 *
 * @param {number} HI        - Índice de perigo total (adimensional)
 * @param {string} land_use  - Uso do solo: 'residential'|'commercial'|'industrial'
 * @returns {{ priority: 'no_action'|'monitoring'|'remediation'|'urgent' }}
 * @throws {TypeError}  se argumentos tiverem tipos inválidos
 * @throws {RangeError} se HI for negativo ou land_use inválido
 */
export function classifyUrbanSoilRemediationPriority(HI: any, land_use: any) {
    if (typeof HI !== 'number') {
        throw new TypeError('HI deve ser um número');
    }
    if (HI < 0) {
        throw new RangeError('HI deve ser não-negativo');
    }
    if (typeof land_use !== 'string') {
        throw new TypeError('land_use deve ser string');
    }

    const VALID_LAND_USE = ['residential', 'commercial', 'industrial'];
    if (!VALID_LAND_USE.includes(land_use)) {
        throw new RangeError(`land_use inválido — use: ${VALID_LAND_USE.join(', ')}`);
    }

    // Uso residencial: limiar reduzido à metade (mais protetivo para crianças)
    const factor = land_use === 'residential' ? 0.5 : 1.0;

    /** @type {'no_action'|'monitoring'|'remediation'|'urgent'} */
    let priority;
    if (HI < 0.1 * factor) {
        priority = 'no_action';
    } else if (HI < 1.0 * factor) {
        priority = 'monitoring';
    } else if (HI < 10.0 * factor) {
        priority = 'remediation';
    } else {
        priority = 'urgent';
    }

    return { priority };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const urbanSoilContaminationMeta = {
    name: 'urbanSoilContamination',
    description: 'urbanSoilContamination',
    category: 'analytics',
    familyTags: ['soil', 'hydrocarbon'],
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
