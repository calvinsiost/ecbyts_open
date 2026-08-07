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
 * Soil Microbial Biomass Index
 * Índice de biomassa microbiana do solo - fumigação-extração de Vance (1987) +
 * quociente metabólico de Anderson & Domsch (1990)
 *
 * Referências / References:
 * - Vance, E.D., Brookes, P.C., Jenkinson, D.S. (1987) An extraction method for
 *   measuring soil microbial biomass C. Soil Biol. Biochem. 19(6):703–707.
 *   DOI:10.1016/0038-0717(87)90052-6
 * - Joergensen, R.G. (1996) The fumigation-extraction method to estimate soil
 *   microbial biomass: calibration of the kEC value. Soil Biol. Biochem. 28(1):25–31.
 *   DOI:10.1016/0038-0717(95)00102-6
 * - Anderson, T.H., Domsch, K.H. (1990) Application of eco-physiological quotients
 *   (qCO2 and qD) on microbial biomass from soils of different cropping histories.
 *   Soil Biol. Biochem. 22(2):251–255. DOI:10.1016/0038-0717(90)90094-G
 */

'use strict';

/**
 * Calcula o Carbono da Biomassa Microbiana (Cmic) pelo método de fumigação-extração.
 * Calculates Microbial Biomass Carbon (Cmic) by fumigation-extraction method.
 *
 * Cmic = flushC / kEC
 * onde flushC = C_fumigado − C_não_fumigado (flush de C extraível em K2SO4 0,5 M)
 * kEC = 0,45 (Joergensen 1996) - fator de calibração/extração
 *
 * @param {number} flushC_mg_kg - Diferença de C extraível entre solo fumigado e não fumigado (mg C/kg solo). / Flush of extractable C (mg C/kg soil).
 * @param {number} [kEC=0.45]   - Fator de extração (adimensional). Padrão: 0,45 (Joergensen 1996). / Extraction factor. Default 0.45.
 * @returns {{ Cmic_mg_kg: number }} Carbono da biomassa microbiana (mg C/kg solo). / Microbial biomass carbon (mg C/kg soil).
 */
export function calcMicrobialBiomassCarbon(flushC_mg_kg: any, kEC = 0.45) {
    if (typeof flushC_mg_kg !== 'number' || flushC_mg_kg < 0) {
        throw new RangeError('flushC_mg_kg must be a non-negative number');
    }
    if (typeof kEC !== 'number' || kEC <= 0 || kEC > 1) {
        throw new RangeError('kEC must be in range (0, 1]');
    }

    const Cmic_mg_kg = flushC_mg_kg / kEC;
    return { Cmic_mg_kg };
}

/**
 * Calcula o quociente metabólico (qCO2) - respiração basal por unidade de biomassa.
 * Calculates the metabolic quotient (qCO2) - basal respiration per unit biomass.
 *
 * qCO2 = basalRespiration / Cmic
 * Unidade: mg CO2-C / (mg Cmic · h)
 * Solos com estresse têm qCO2 elevado (mais energia gasta em manutenção).
 *
 * @param {number} basal_respiration_mg_CO2_kg_h - Respiração basal do solo (mg CO2-C/kg/h). / Soil basal respiration (mg CO2-C/kg/h).
 * @param {number} Cmic_mg_kg                    - Carbono da biomassa microbiana (mg C/kg). / Microbial biomass carbon (mg C/kg).
 * @returns {{ qCO2: number }} Quociente metabólico (mg CO2-C/mg Cmic/h). / Metabolic quotient.
 */
export function calcMetabolicQuotient(basal_respiration_mg_CO2_kg_h: any, Cmic_mg_kg: any) {
    if (typeof basal_respiration_mg_CO2_kg_h !== 'number' || basal_respiration_mg_CO2_kg_h < 0) {
        throw new RangeError('basal_respiration_mg_CO2_kg_h must be a non-negative number');
    }
    if (typeof Cmic_mg_kg !== 'number' || Cmic_mg_kg <= 0) {
        throw new RangeError('Cmic_mg_kg must be a positive number');
    }

    const qCO2 = basal_respiration_mg_CO2_kg_h / Cmic_mg_kg;
    return { qCO2 };
}

/**
 * Calcula o quociente microbiano (qmic) - proporção de C orgânico incorporado em biomassa.
 * Calculates the microbial quotient (qmic) - proportion of organic C in microbial biomass.
 *
 * qmic = (Cmic / Corg) × 100 (%)
 * Valores típicos: solos saudáveis 2–5%, solos degradados < 1%.
 *
 * @param {number} Cmic_mg_kg  - Carbono da biomassa microbiana (mg C/kg). / Microbial biomass carbon (mg C/kg).
 * @param {number} totalOC_g_kg - Carbono orgânico total do solo (g C/kg = ‰). / Total organic carbon (g C/kg).
 * @returns {{ qmic_percent: number }} Quociente microbiano (%). / Microbial quotient (%).
 */
export function calcMicrobialQuotient(Cmic_mg_kg: any, totalOC_g_kg: any) {
    if (typeof Cmic_mg_kg !== 'number' || Cmic_mg_kg < 0) {
        throw new RangeError('Cmic_mg_kg must be a non-negative number');
    }
    if (typeof totalOC_g_kg !== 'number' || totalOC_g_kg <= 0) {
        throw new RangeError('totalOC_g_kg must be a positive number');
    }

    // Converter totalOC para mg/kg para mesma unidade: 1 g/kg = 1000 mg/kg
    const totalOC_mg_kg = totalOC_g_kg * 1000;
    const qmic_percent = (Cmic_mg_kg / totalOC_mg_kg) * 100;
    return { qmic_percent };
}

/**
 * Classifica a qualidade biológica do solo com base em qCO2 e qmic.
 * Classifies soil biological quality based on metabolic quotient and microbial quotient.
 *
 * Critérios baseados em Anderson & Domsch (1990) e Wardle & Ghani (1995).
 *
 * @param {number} qCO2        - Quociente metabólico (mg CO2-C/mg Cmic/h). / Metabolic quotient.
 * @param {number} qmic_percent - Quociente microbiano (%). / Microbial quotient (%).
 * @returns {{ quality: 'degraded'|'moderate'|'healthy'|'very_healthy', rationale: string }}
 */
export function classifySoilBiologicalQuality(qCO2: any, qmic_percent: any) {
    if (typeof qCO2 !== 'number' || qCO2 < 0) {
        throw new RangeError('qCO2 must be a non-negative number');
    }
    if (typeof qmic_percent !== 'number' || qmic_percent < 0) {
        throw new RangeError('qmic_percent must be a non-negative number');
    }

    // Lógica de classificação biológica do solo (Anderson & Domsch 1990; Wardle & Ghani 1995)
    // Solos degradados: qCO2 alto (alto custo metabólico) + qmic baixo (pouca biomassa)
    const highStress = qCO2 > 4.5e-3; // alto quociente metabólico = estresse
    const lowBiomass = qmic_percent < 1; // pouca incorporação de C em biomassa

    if (highStress && lowBiomass) {
        return { quality: 'degraded', rationale: 'High metabolic maintenance cost and low microbial biomass fraction' };
    } else if (highStress || lowBiomass) {
        return { quality: 'moderate', rationale: 'One indicator of stress detected; monitoring recommended' };
    } else if (qmic_percent >= 3 && qCO2 < 2.0e-3) {
        return { quality: 'very_healthy', rationale: 'High microbial biomass proportion and low metabolic stress' };
    } else {
        return { quality: 'healthy', rationale: 'Adequate microbial biomass and metabolic efficiency' };
    }
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilOrganicMatterDecompositionMeta = {
    name: 'soilOrganicMatterDecomposition',
    description: 'soilOrganicMatterDecomposition',
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
