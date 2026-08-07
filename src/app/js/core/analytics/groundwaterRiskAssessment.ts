// @ts-check
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
// Application: EHS & Mining - Groundwater Risk Assessment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Groundwater Risk Assessment - Drinking Water HQ, Leaching, Attenuation, DRASTIC
 *
 * Módulo puro para avaliação de risco em água subterrânea: cálculo de índice de
 * hazard (HQ) para ingestão de água potável, potencial de lixiviação do solo,
 * atenuação de contaminante e classificação de vulnerabilidade de aquífero (DRASTIC).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - US EPA (1996). Soil Screening Guidance: Technical Background Document.
 *     EPA/540/R-95/128. Washington, DC: US EPA.
 *     (equação HQ = (C × IR × ED) / (RfD × BW × AT))
 *   - Aller, L., Bennett, T., Lehr, J. H., Petty, R. J., & Hackett, G. (1987).
 *     DRASTIC: A Standardized System for Evaluating Groundwater Pollution Potential
 *     Using Hydrogeologic Settings. EPA/600/2-87/035. US EPA.
 *     (DRASTIC vulnerability classification)
 *   - US EPA (2004). User's Guide for Evaluating Subsurface Migration of Petroleum
 *     Hydrocarbons at Leaking Underground Storage Tank Sites. EPA/600/R-04/029.
 *     (modelo simplificado de lixiviação Koc)
 *
 * @module groundwaterRiskAssessment
 */

'use strict';

// --- Constantes físicas do modelo de lixiviação ---
// Volumetric water content (fração volumétrica de água no solo)
const THETA_V = 0.3;
// Bulk density do solo (g/cm³)
const RHO_BULK = 1.5;

/**
 * Compute Hazard Quotient (HQ) for drinking water ingestion pathway.
 * Calcula o Índice de Hazard para ingestão de água subterrânea contaminada.
 *
 * HQ = (C × IR × ED) / (RfD × BW × AT)
 *
 * @param {number} concentration_ug_L - Concentração do contaminante na água (µg/L)
 * @param {number} rfd_ug_kg_day - Dose de referência oral (µg/kg/dia)
 * @param {number} bodyWeight_kg - Peso corporal do receptor (kg)
 * @param {number} ingestionRate_L_day - Taxa de ingestão de água (L/dia)
 * @param {number} exposureDays - Dias de exposição total (dias)
 * @param {number} averagingDays - Período de média (dias, geralmente 365×30=10950 para crônico)
 * @returns {{ hq: number, riskLevel: 'acceptable'|'concern'|'unacceptable' }}
 * @throws {RangeError} Se qualquer parâmetro numérico for não-positivo
 *
 * Referência: USEPA (1996) Soil Screening Guidance, Eq. 1-1.
 */
export function computeDrinkingWaterRisk(
    concentration_ug_L: any,
    rfd_ug_kg_day: any,
    bodyWeight_kg: any,
    ingestionRate_L_day: any,
    exposureDays: any,
    averagingDays: any,
) {
    if (
        concentration_ug_L < 0 ||
        rfd_ug_kg_day <= 0 ||
        bodyWeight_kg <= 0 ||
        ingestionRate_L_day <= 0 ||
        exposureDays <= 0 ||
        averagingDays <= 0
    ) {
        throw new RangeError(
            'computeDrinkingWaterRisk: all parameters must be positive; ' + 'concentration must be non-negative',
        );
    }

    // HQ = (concentração × taxa de ingestão × dias de exposição) /
    //       (dose de referência × peso corporal × período de média)
    const hq =
        (concentration_ug_L * ingestionRate_L_day * exposureDays) / (rfd_ug_kg_day * bodyWeight_kg * averagingDays);

    /** @type {'acceptable'|'concern'|'unacceptable'} */
    let riskLevel;
    if (hq < 1) {
        riskLevel = 'acceptable';
    } else if (hq < 10) {
        riskLevel = 'concern';
    } else {
        riskLevel = 'unacceptable';
    }

    return { hq, riskLevel };
}

/**
 * Compute leaching potential from soil to groundwater.
 * Calcula a concentração estimada de contaminante lixiviado para o aquífero.
 *
 * C_gw = C_soil / (Koc × foc + θ_v / ρ_bulk)
 *
 * Converte C_soil de mg/kg para µg/L na água subterrânea.
 *
 * @param {number} soilConc_mg_kg - Concentração no solo (mg/kg peso seco)
 * @param {number} koc - Coeficiente de partição carbono orgânico-água (L/kg)
 * @param {number} foc - Fração de carbono orgânico do solo (adimensional, 0–1)
 * @param {number} rainfall_mm - Precipitação (mm/ano) - reservado para extensão futura
 * @param {number} depth_m - Profundidade até o aquífero (m) - reservado para extensão futura
 * @returns {{ leachedConc_ug_L: number, partitionCoeff: number }}
 * @throws {RangeError} Se soilConc, koc ou foc forem inválidos
 *
 * Referência: USEPA (2004) Leaking UST Guidance, modelo Koc simplificado.
 */
export function computeLeachingPotential(soilConc_mg_kg: any, koc: any, foc: any, rainfall_mm: any, depth_m: any) {
    if (soilConc_mg_kg < 0 || koc <= 0 || foc < 0 || foc > 1) {
        throw new RangeError('computeLeachingPotential: soilConc≥0, koc>0, 0≤foc≤1 required');
    }
    if (rainfall_mm < 0 || depth_m < 0) {
        throw new RangeError('computeLeachingPotential: rainfall and depth must be non-negative');
    }

    // Coeficiente de partição total solo-água (L/kg)
    // Kd = Koc × foc + θ_v / ρ_bulk  (contribuição da fase aquosa)
    const partitionCoeff = koc * foc + THETA_V / RHO_BULK;

    // C_gw (mg/L) = C_soil (mg/kg) / partitionCoeff (L/kg)
    // Convertendo para µg/L × 1000
    const leachedConc_ug_L = (soilConc_mg_kg / partitionCoeff) * 1000;

    return { leachedConc_ug_L, partitionCoeff };
}

/**
 * Compute contaminant attenuation along a transport pathway.
 * Calcula a concentração após atenuação ao longo de uma distância no aquífero.
 *
 * C(x) = C0 × exp( −x / (dispersivity × retardation) )
 *
 * @param {number} sourceConc - Concentração na fonte (qualquer unidade consistente)
 * @param {number} distance_m - Distância de transporte (m)
 * @param {number} dispersivity - Dispersividade longitudinal (m)
 * @param {number} retardation - Fator de retardação (adimensional, ≥1)
 * @returns {{ attenuatedConc: number, reductionPct: number }}
 * @throws {RangeError} Se parâmetros forem inválidos
 *
 * Referência: Bear, J. (1972) Dynamics of Fluids in Porous Media. Eq. 7.4.34.
 */
export function computeAttenuation(sourceConc: any, distance_m: any, dispersivity: any, retardation: any) {
    if (sourceConc < 0 || distance_m < 0 || dispersivity <= 0 || retardation < 1) {
        throw new RangeError('computeAttenuation: sourceConc≥0, distance≥0, dispersivity>0, retardation≥1');
    }

    // Concentração atenuada pelo decaimento exponencial (advecção+retardação)
    const attenuatedConc = sourceConc * Math.exp(-distance_m / (dispersivity * retardation));
    const reductionPct = sourceConc > 0 ? ((sourceConc - attenuatedConc) / sourceConc) * 100 : 0;

    return { attenuatedConc, reductionPct };
}

/**
 * Classify aquifer vulnerability using simplified DRASTIC index.
 * Classifica a vulnerabilidade do aquífero à contaminação (DRASTIC simplificado).
 *
 * Considera apenas Depth-to-water (D) e Recharge (R) do DRASTIC completo,
 * ajustado pelo tipo de aquífero. Score total: D(1–10) + R(1–10) + AquiferType(0–5).
 *
 * @param {number} depth_m - Profundidade até o nível d'água (m)
 * @returns {{ vulnerability: 'low'|'moderate'|'high', drScore: number }}
 * @throws {TypeError} Se aquiferType for inválido
 * @throws {RangeError} Se depth ou rechargeRate forem negativos
 *
 * Referência: Aller et al. (1987) DRASTIC, EPA/600/2-87/035, Table 3-1.
 */
function _depthScore(depth_m: number): number {
    if (depth_m < 1.5) return 10;
    if (depth_m < 4.6) return 9;
    if (depth_m < 9.1) return 7;
    if (depth_m < 15.2) return 5;
    if (depth_m < 22.9) return 3;
    return 1;
}

function _rechargeScore(rechargeRate_mm_yr: number): number {
    if (rechargeRate_mm_yr < 50) return 1;
    if (rechargeRate_mm_yr < 100) return 3;
    if (rechargeRate_mm_yr < 178) return 6;
    if (rechargeRate_mm_yr < 254) return 8;
    return 9;
}

function _aquiferTypeBonus(aquiferType: string): number {
    if (aquiferType === 'karst') return 5;
    if (aquiferType === 'unconfined') return 3;
    return 0;
}

function _vulnerabilityFromDRScore(drScore: number): 'low' | 'moderate' | 'high' {
    if (drScore <= 10) return 'low';
    if (drScore <= 17) return 'moderate';
    return 'high';
}

export function classifyAquiferVulnerability(depth_m: any, rechargeRate_mm_yr: any, aquiferType: any) {
    if (depth_m < 0 || rechargeRate_mm_yr < 0) {
        throw new RangeError('classifyAquiferVulnerability: depth and rechargeRate must be non-negative');
    }
    const validTypes = ['confined', 'unconfined', 'karst'];
    if (!validTypes.includes(aquiferType)) {
        throw new TypeError(`classifyAquiferVulnerability: aquiferType must be one of ${validTypes.join('|')}`);
    }

    const drScore = _depthScore(depth_m) + _rechargeScore(rechargeRate_mm_yr) + _aquiferTypeBonus(aquiferType);
    return { vulnerability: _vulnerabilityFromDRScore(drScore), drScore };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const groundwaterRiskAssessmentMeta = {
    name: 'groundwaterRiskAssessment',
    description: 'Groundwater Risk Assessment',
    category: 'analytics',
    familyTags: ['groundwater', 'water', 'risk'],
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
