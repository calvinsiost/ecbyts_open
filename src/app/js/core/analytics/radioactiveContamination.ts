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
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: Radioactive Contamination Assessment

/* ================================================================
   RADIOACTIVE CONTAMINATION — Pure mathematical functions
   Avaliacao de contaminacao radioativa baseada em metodos
   internacionais padrao (USEPA, IAEA, WHO, ICRP)
   ================================================================

   METODOS:
   - Bateman (1910) simple radioactive decay
   - Bateman equations for decay chains
   - Rogers & Nielson (1991) radon emanation
   - USEPA (1999) HEAST dose conversion factors
   - ICRP 60 / IAEA BSS annual effective dose
   - USEPA RAGS soil screening levels (EPA 402-R-99-001)
   - USEPA (1985) Hazard Ranking System radiological scoring
   - USEPA TENORM Study (1999) NUREG-1501 external gamma
   - WHO (2011) drinking water radiological guidelines
   - IAEA (2009) SSG-1 radioactive waste classification

   Referencias academicas em cada funcao.
   ================================================================ */

'use strict';

console.debug('[radioactive:load]', 'app/js/core/analytics/radioactiveContamination.js');

// ================================================================
// CONSTANTES
// ================================================================

/** ln(2) — constante de decaimento */
const LN2 = Math.LN2;

/** Radon-222 meia-vida em segundos (3.82 dias) */
const RN222_HALF_LIFE_S = 3.82 * 86400;

/** lambda de Rn-222 [s^-1] */
const LAMBDA_RN222 = LN2 / RN222_HALF_LIFE_S;

/** Coeficiente de difusao efetivo de Rn no solo [m^2/s] — NCRP 97 / IAEA 51 */
const D_EFF_RN_M2S = 1e-6;

/** Taxa de ventilacao simplificada para estimativa indoor [m/s] */
const VENTILATION_RATE_MS = 1e-4;

/**
 * Fatores de conversao de dose (DCF) - USEPA HEAST (1999) e ICRP 72.
 * Unidades: Sv/Bq (ingestion e inhalation); externo para solo Bq/m^2 -> Sv/s.
 * Estrutura: DOSE_CONVERSION_FACTORS[radionuclide][pathway] = dcf
 */
/** @type {Readonly<Record<string, Readonly<Record<string, number>>>>} */
export const DOSE_CONVERSION_FACTORS = Object.freeze({
    'Cs-137': Object.freeze({ ingestion: 1.36e-8, inhalation: 8.63e-9, external_gamma: 1.2e-16 }),
    'Sr-90': Object.freeze({ ingestion: 2.8e-8, inhalation: 3.01e-8, external_gamma: 1.0e-17 }),
    'Ra-226': Object.freeze({ ingestion: 2.8e-7, inhalation: 9.28e-6, external_gamma: 1.5e-16 }),
    'U-238': Object.freeze({ ingestion: 4.49e-8, inhalation: 6.49e-6, external_gamma: 8.0e-18 }),
    'Pu-239': Object.freeze({ ingestion: 2.56e-7, inhalation: 1.23e-4, external_gamma: 1.0e-18 }),
    'Rn-222': Object.freeze({ ingestion: 0, inhalation: 9.0e-9, external_gamma: 0 }),
    'Co-60': Object.freeze({ ingestion: 3.4e-9, inhalation: 1.01e-8, external_gamma: 3.6e-16 }),
    'I-131': Object.freeze({ ingestion: 2.16e-8, inhalation: 7.49e-9, external_gamma: 5.0e-17 }),
});

/**
 * Niveis de triagem conservadores para solo [Bq/kg].
 * Usados no metodo hrsRiskScreening.
 */
/** @type {Readonly<Record<string, number>>} */
export const HRS_SOIL_SCREENING_LEVELS = Object.freeze({
    'Cs-137': 3700,
    'Ra-226': 185,
    'U-238': 370,
    'Sr-90': 185,
    'Pu-239': 18.5,
    'Co-60': 370,
    'I-131': 370,
    'Rn-222': 3700,
});

// ================================================================
// 1. radioactiveDecay - Bateman (1910) decaimento simples
// ================================================================

/**
 * Calcula decaimento radioativo simples pela lei de Bateman (1910).
 * A(t) = A0 × 2^(-t / t_half)
 *
 * @param {number} activityBq     Atividade inicial [Bq]
 * @param {number} halfLifeSeconds Meia-vida [s]
 * @param {number} timeSeconds    Tempo decorrido [s]
 * @returns {{ activityBq:number, halfLifeSeconds:number, timeSeconds:number, remainingBq:number, decayFraction:number, halfLives:number }}
 *
 * @reference Bateman H. (1910). Solution of a system of differential equations
 *   occurring in the theory of radioactive transformations. Proc. Cambridge
 *   Phil. Soc. 15, 423-427.
 */
export function radioactiveDecay(activityBq: number, halfLifeSeconds: number, timeSeconds: number): { activityBq:number, halfLifeSeconds:number, timeSeconds:number, remainingBq:number, decayFraction:number, halfLives:number } {
    if (activityBq < 0) throw new RangeError('activityBq must be >= 0');
    if (halfLifeSeconds <= 0) throw new RangeError('halfLifeSeconds must be > 0');
    if (timeSeconds < 0) throw new RangeError('timeSeconds must be >= 0');

    const halfLives = timeSeconds / halfLifeSeconds;
    const remainingBq = activityBq * Math.pow(2, -halfLives);
    const decayFraction = 1 - remainingBq / activityBq;

    return ({
        activityBq,
        halfLifeSeconds,
        timeSeconds,
        remainingBq,
        decayFraction,
        halfLives,
    } as {activityBq:number, halfLifeSeconds:number, timeSeconds:number, remainingBq:number, decayFraction:number, halfLives:number});
}

// ================================================================
// 2. decayChain - equacoes de Bateman para cadeia de decaimento
// ================================================================

/**
 * Calcula atividade em uma cadeia de decaimento usando equacoes de Bateman.
 * Para 2 membros (pai + 1 filha): solucao exata de Bateman (1910).
 * Para cadeias maiores: equilibrio secular (valido quando t >> t_half_pai).
 *
 * Equacao Bateman para 2 membros:
 *   A2(t) = A1_0 × λ2/(λ2−λ1) × (e^(-λ1×t) − e^(-λ2×t))
 *
 * @param {{ activityBq: number, halfLifeSeconds: number, name: string }} parent  Nuclidio pai
 * @param {Array<{ halfLifeSeconds: number, name: string }>} daughters  Filhas em serie
 * @param {number} timeSeconds  Tempo decorrido [s]
 * @returns {Array<{ name: string, activityBq: number, halfLifeSeconds: number }>}
 *
 * @reference Bateman H. (1910). ibid.
 */
export function decayChain(parent: { activityBq: number, halfLifeSeconds: number, name: string }, daughters: Array<{ halfLifeSeconds: number, name: string }>, timeSeconds: number): Array<{ name: string, activityBq: number, halfLifeSeconds: number }> {
    if (!parent || parent.halfLifeSeconds <= 0) throw new RangeError('parent.halfLifeSeconds must be > 0');
    if (timeSeconds < 0) throw new RangeError('timeSeconds must be >= 0');

    const lambdaParent = LN2 / parent.halfLifeSeconds;
    const parentActivity = parent.activityBq * Math.exp(-lambdaParent * timeSeconds);

    const result = [{ name: parent.name, activityBq: parentActivity, halfLifeSeconds: parent.halfLifeSeconds }];

    if (!daughters || daughters.length === 0) return result;

    if (daughters.length === 1) {
        // Solucao exata de Bateman para cadeia 2 membros
        const d = daughters[0];
        if (!d) return result;
        if (d.halfLifeSeconds <= 0) throw new RangeError('daughter halfLifeSeconds must be > 0');
        const lambda2 = LN2 / d.halfLifeSeconds;
        const lambda1 = lambdaParent;

        let daughterActivity;
        if (Math.abs(lambda2 - lambda1) < 1e-30) {
            // Caso especial: lambdas quase iguais - evitar divisao por zero
            daughterActivity = parent.activityBq * lambda2 * timeSeconds * Math.exp(-lambda1 * timeSeconds);
        } else {
            daughterActivity =
                parent.activityBq *
                (lambda2 / (lambda2 - lambda1)) *
                (Math.exp(-lambda1 * timeSeconds) - Math.exp(-lambda2 * timeSeconds));
        }

        result.push({ name: d.name, activityBq: Math.max(0, daughterActivity), halfLifeSeconds: d.halfLifeSeconds });
    } else {
        // Para cadeias mais longas: equilibrio secular quando t >> t_half_pai
        // A_i ≈ A_pai(t) em equilibrio secular (IAEA Safety Series 57)
        for (const d of daughters) {
            if (d.halfLifeSeconds <= 0) throw new RangeError('daughter halfLifeSeconds must be > 0');
            result.push({ name: d.name, activityBq: parentActivity, halfLifeSeconds: d.halfLifeSeconds });
        }
    }

    return result;
}

// ================================================================
// 3. radonEmanationRate - Rogers & Nielson (1991)
// ================================================================

/**
 * Calcula taxa de emanacao de Rn-222 e fluxo difusivo.
 * Modelo Rogers & Nielson (1991) para emanacao de radonio do solo.
 *
 * emanationRate [Bq/m^3/s] = Ra_conc × coef_em × rho_bulk × (1 − porosity)
 * diffusionLength [m] = sqrt(D_eff / lambda_Rn)
 * flux [Bq/m^2/s] = emanationRate × diffusionLength
 * indoorConcentration [Bq/m^3] = flux / ventilationRate
 *
 * @param {number} radiumConcentrationBqKg  Concentracao de Ra-226 no solo [Bq/kg]
 * @param {number} emanationCoefficient     Fracao de Rn que escapa do grao (0.1–0.3 tipico)
 * @param {number} bulkDensityKgM3          Densidade aparente do solo [kg/m^3] (tipico 1500–1800)
 * @param {number} porosity                 Porosidade do solo (0–1)
 * @returns {{ emanationRateBqM3s:number, diffusionLengthM:number, fluxBqM2s:number, indoorConcentrationBqM3:number }}
 *
 * @reference Rogers V.C. & Nielson K.K. (1991). Multiphase radon generation and
 *   transport in porous materials. Health Physics 60(6), 807-815.
 */
export function radonEmanationRate(radiumConcentrationBqKg: number, emanationCoefficient: number, bulkDensityKgM3: number, porosity: number): { emanationRateBqM3s:number, diffusionLengthM:number, fluxBqM2s:number, indoorConcentrationBqM3:number } {
    if (radiumConcentrationBqKg < 0) throw new RangeError('radiumConcentrationBqKg must be >= 0');
    if (emanationCoefficient < 0 || emanationCoefficient > 1) throw new RangeError('emanationCoefficient must be 0-1');
    if (bulkDensityKgM3 <= 0) throw new RangeError('bulkDensityKgM3 must be > 0');
    if (porosity < 0 || porosity >= 1) throw new RangeError('porosity must be 0-1 (exclusive upper)');

    const emanationRateBqM3s = radiumConcentrationBqKg * emanationCoefficient * bulkDensityKgM3 * (1 - porosity);
    const diffusionLengthM = Math.sqrt(D_EFF_RN_M2S / LAMBDA_RN222);
    const fluxBqM2s = emanationRateBqM3s * diffusionLengthM;
    const indoorConcentrationBqM3 = fluxBqM2s / VENTILATION_RATE_MS;

    return ({
        emanationRateBqM3s,
        diffusionLengthM,
        fluxBqM2s,
        indoorConcentrationBqM3,
    } as {emanationRateBqM3s:number, diffusionLengthM:number, fluxBqM2s:number, indoorConcentrationBqM3:number});
}

// ================================================================
// 4. doseConversionFactor - USEPA HEAST (1999)
// ================================================================

/**
 * Retorna fator de conversao de dose (DCF) para radionuclidio e via de exposicao.
 * Fatores de USEPA HEAST (1999) e ICRP Publication 72.
 *
 * @param {string} radionuclide  Nome do radionuclidio (ex: 'Cs-137')
 * @param {'ingestion'|'inhalation'|'external_gamma'} pathway  Via de exposicao
 * @returns {{ radionuclide:string, pathway:string, dcfSvBq:number, unit:string }}
 *
 * @reference USEPA (1999). Cancer Risk Coefficients for Environmental Exposure
 *   to Radionuclides. Federal Guidance Report No. 13. EPA 402-R-99-001.
 */
export function doseConversionFactor(radionuclide: string, pathway: 'ingestion'|'inhalation'|'external_gamma'): { radionuclide:string, pathway:string, dcfSvBq:number, unit:string } {
    const validPathways = ['ingestion', 'inhalation', 'external_gamma'];
    if (!validPathways.includes(pathway)) {
        throw new RangeError(`pathway must be one of: ${validPathways.join(', ')}`);
    }

    const factors = (DOSE_CONVERSION_FACTORS as Record<string, Record<string, number>>)[radionuclide];
    if (!factors) {
        throw new RangeError(
            `Unknown radionuclide: ${radionuclide}. Supported: ${Object.keys(DOSE_CONVERSION_FACTORS).join(', ')}`,
        );
    }

    const dcfSvBq = factors[pathway];
    const unit = pathway === 'external_gamma' ? 'Sv/(Bq/m2)/s' : 'Sv/Bq';

    return ({
        radionuclide,
        pathway,
        dcfSvBq,
        unit,
    } as {radionuclide:string, pathway:string, dcfSvBq:number, unit:string});
}

// ================================================================
// 5. annualEffectiveDose - ICRP 60 / IAEA BSS
// ================================================================

/**
 * Calcula dose efetiva anual e risco de cancer por excesso de vida.
 * Baseado em ICRP Publication 60 e IAEA Basic Safety Standards (BSS).
 *
 * Para inalacao: annualDoseSv = concentration × intakeRate [m^3/h] × occupancy × dcf × 8760 h/ano
 * Para ingestao: annualDoseSv = concentration × intakeRate [L/d ou kg/d] × occupancy × dcf × 365 d/ano
 *
 * excessLifetimeRisk = annualDoseSv × 70 [anos] × 0.05 [Sv^-1] (ICRP)
 *
 * @param {number} activityConcentration  Concentracao de atividade [Bq/L, Bq/kg, ou Bq/m^3]
 * @param {number} intakeRate             Taxa de ingestao/inalacao [L/d, kg/d, ou m^3/h]
 * @param {number} occupancyFactor        Fracao do tempo de exposicao (0–1)
 * @param {number} dcf                    Fator de conversao de dose [Sv/Bq]
 * @param {'inhalation'|'ingestion'} [pathway='ingestion']  Via (afeta multiplicador temporal)
 * @returns {{ annualDoseSv:number, annualDoseMsv:number, excessLifetimeRisk:number, exceedsPublicLimit:boolean }}
 *
 * @reference ICRP (1991). Publication 60: 1990 Recommendations of the ICRP.
 *   Ann. ICRP 21(1-3).
 * @reference IAEA (1996). International Basic Safety Standards. Safety Series No. 115.
 */
export function annualEffectiveDose(activityConcentration: number, intakeRate: number, occupancyFactor: number, dcf: number, pathway: 'inhalation'|'ingestion' = 'ingestion'): { annualDoseSv:number, annualDoseMsv:number, excessLifetimeRisk:number, exceedsPublicLimit:boolean } {
    if (activityConcentration < 0) throw new RangeError('activityConcentration must be >= 0');
    if (intakeRate < 0) throw new RangeError('intakeRate must be >= 0');
    if (occupancyFactor < 0 || occupancyFactor > 1) throw new RangeError('occupancyFactor must be 0-1');
    if (dcf < 0) throw new RangeError('dcf must be >= 0');

    let annualDoseSv;
    if (pathway === 'inhalation') {
        // intakeRate em m^3/h; 8760 horas/ano
        annualDoseSv = activityConcentration * intakeRate * occupancyFactor * dcf * 8760;
    } else {
        // ingestao: intakeRate em L/d ou kg/d; 365 dias/ano
        annualDoseSv = activityConcentration * intakeRate * occupancyFactor * dcf * 365;
    }

    const annualDoseMsv = annualDoseSv * 1e3;
    // ICRP: risco de cancer = dose × 0.05 Sv^-1 ao longo de 70 anos
    const excessLifetimeRisk = annualDoseSv * 70 * 0.05;
    // Limite publico ICRP: 1 mSv/ano = 0.001 Sv/ano
    const exceedsPublicLimit = annualDoseSv > 0.001;

    return ({
        annualDoseSv,
        annualDoseMsv,
        excessLifetimeRisk,
        exceedsPublicLimit,
    } as {annualDoseSv:number, annualDoseMsv:number, excessLifetimeRisk:number, exceedsPublicLimit:boolean});
}

// ================================================================
// 6. soilScreeningLevel - USEPA RAGS (EPA 402-R-99-001)
// ================================================================

/**
 * Calcula nivel de triagem de solo (SSL) por calculo inverso de risco.
 * Metodo USEPA RAGS Radioactive Supplement (EPA 402-R-99-001).
 *
 * SSL [Bq/kg] = targetRisk / (dcf × ingestionRate / 365 / bodyWeight)
 * onde: ingestionRate = 1e-4 kg/dia (USEPA padrao), bodyWeight = 70 kg
 *
 * @param {string} radionuclide  Radionuclidio
 * @param {'ingestion'|'inhalation'|'external_gamma'} pathway  Via de exposicao
 * @param {number} targetRisk    Risco alvo (ex: 1e-6 USEPA padrao)
 * @returns {{ radionuclide:string, pathway:string, targetRisk:number, ssl_BqKg:number, ssl_pCiG:number }}
 *
 * @reference USEPA (1999). EPA 402-R-99-001. Screening Levels for Radionuclides
 *   in Soil. Supplemental Guidance for Superfund Risk Assessments.
 */
export function soilScreeningLevel(radionuclide: string, pathway: 'ingestion'|'inhalation'|'external_gamma', targetRisk: number): { radionuclide:string, pathway:string, targetRisk:number, ssl_BqKg:number, ssl_pCiG:number } {
    if (targetRisk <= 0) throw new RangeError('targetRisk must be > 0');

    const { dcfSvBq } = doseConversionFactor(radionuclide, pathway);

    if (dcfSvBq === 0) {
        return ({
            radionuclide,
            pathway,
            targetRisk,
            ssl_BqKg: Infinity,
            ssl_pCiG: Infinity,
        } as {radionuclide:string, pathway:string, targetRisk:number, ssl_BqKg:number, ssl_pCiG:number});
    }

    // USEPA SSL formula simplificada para ingestao de solo:
    // SSL = targetRisk / (DCF × soilIntakeRate / bodyWeight / 365)
    // soilIntakeRate = 1e-4 kg/d, bodyWeight = 70 kg
    const soilIntakeKgD = 1e-4;
    const bodyWeightKg = 70;
    const ssl_BqKg = targetRisk / ((dcfSvBq * soilIntakeKgD) / bodyWeightKg / 365);
    // 1 pCi/g = 37 Bq/kg
    const ssl_pCiG = ssl_BqKg / 37;

    return ({
        radionuclide,
        pathway,
        targetRisk,
        ssl_BqKg,
        ssl_pCiG,
    } as {radionuclide:string, pathway:string, targetRisk:number, ssl_BqKg:number, ssl_pCiG:number});
}

// ================================================================
// 7. hrsRiskScreening - USEPA HRS (1985)
// ================================================================

/**
 * Avaliacao de risco radiologico pelo sistema HRS (Hazard Ranking System).
 * Calcula pontuacao de cada radionuclidio em relacao a niveis de triagem
 * conservadores.
 *
 * score = concentracao / nivel_triagem
 * hazardCategory: 'high' se score > 10, 'moderate' se > 1, 'low' caso contrario
 *
 * @param {Array<{ radionuclide: string, concentrationBqKg: number, mediaType: string }>} measurements
 * @returns {{ maxScore:number, hazardCategory:string, exceedances:Array<{radionuclide:string, concentrationBqKg:number, screeningLevelBqKg:number, score:number, mediaType:string}> }}
 *
 * @reference USEPA (1985). Hazard Ranking System (HRS). 40 CFR Part 300, Appendix A.
 */
export function hrsRiskScreening(measurements: Array<{ radionuclide: string, concentrationBqKg: number, mediaType: string }>): { maxScore:number, hazardCategory:string, exceedances:Array<{radionuclide:string, concentrationBqKg:number, screeningLevelBqKg:number, score:number, mediaType:string}> } {
    if (!Array.isArray(measurements) || measurements.length === 0) {
        throw new RangeError('measurements must be a non-empty array');
    }

        const exceedances: Array<{radionuclide:string, concentrationBqKg:number, screeningLevelBqKg:number, score:number, mediaType:string}>= [];
    let maxScore = 0;

    for (const m of measurements) {
        const screenLevel = (HRS_SOIL_SCREENING_LEVELS as Record<string, number>)[m.radionuclide];
        if (screenLevel === undefined) continue; // radionuclidio nao mapeado, ignorar

        const score = m.concentrationBqKg / screenLevel;
        if (score > maxScore) maxScore = score;

        if (score > 1) {
            exceedances.push({
                radionuclide: m.radionuclide,
                concentrationBqKg: m.concentrationBqKg,
                screeningLevelBqKg: screenLevel,
                score,
                mediaType: m.mediaType,
            });
        }
    }

    let hazardCategory;
    if (maxScore > 10) {
        hazardCategory = 'high';
    } else if (maxScore > 1) {
        hazardCategory = 'moderate';
    } else {
        hazardCategory = 'low';
    }

    return ({
        maxScore,
        hazardCategory,
        exceedances,
    } as {maxScore:number, hazardCategory:string, exceedances:Array<{radionuclide:string, concentrationBqKg:number, screeningLevelBqKg:number, score:number, mediaType:string}>});
}

// ================================================================
// 8. tenormExposureAssessment - USEPA TENORM Study (1999)
// ================================================================

/**
 * Avalia exposicao a TENORM (Technologically Enhanced NORM) em instalacoes
 * de petroleo e gas. Modelo de dose de gama externo simplificado.
 *
 * doseRateUsvHr = oilGasScaleBqKg × 2e-6  (a 0.3 m; NUREG-1501)
 * correcao de distancia: (0.3 / distanceM)^2 (fonte pontual)
 * annualDoseUSv = doseRateAtDistance × processingTimeHr
 *
 * @param {number} oilGasScaleBqKg   Atividade de Ra-226/228 na escala da tubulacao [Bq/kg]
 * @param {number} processingTimeHr  Horas de exposicao anual [h]
 * @param {number} distanceM         Distancia do trabalhador a fonte [m]
 * @returns {{ doseRateUsvHr:number, annualDoseUSv:number, annualDoseMsv:number, exceedsOEL:boolean }}
 *
 * @reference USEPA (1999). Technologically Enhanced Naturally Occurring Radioactive
 *   Materials (TENORM) in the Oil and Gas Industry. EPA 402-R-99-022.
 * @reference NUREG-1501 (1994). Background as a Residual Radioactivity Criterion
 *   for Decommissioning. US NRC.
 */
export function tenormExposureAssessment(oilGasScaleBqKg: number, processingTimeHr: number, distanceM: number): { doseRateUsvHr:number, annualDoseUSv:number, annualDoseMsv:number, exceedsOEL:boolean } {
    if (oilGasScaleBqKg < 0) throw new RangeError('oilGasScaleBqKg must be >= 0');
    if (processingTimeHr < 0) throw new RangeError('processingTimeHr must be >= 0');
    if (distanceM <= 0) throw new RangeError('distanceM must be > 0');

    // Taxa de dose a 0.3 m (referencia NUREG-1501)
    const doseRateUsvHr = oilGasScaleBqKg * 2e-6;
    // Correcao de distancia pela lei do inverso do quadrado
    const doseRateAtDistance = doseRateUsvHr * Math.pow(0.3 / distanceM, 2);
    const annualDoseUSv = doseRateAtDistance * processingTimeHr;
    const annualDoseMsv = annualDoseUSv / 1000;
    // Limite ocupacional: 20 mSv/ano = 20000 uSv/ano (ICRP 60 / IAEA BSS)
    const exceedsOEL = annualDoseUSv > 20000;

    return ({
        doseRateUsvHr,
        annualDoseUSv,
        annualDoseMsv,
        exceedsOEL,
    } as {doseRateUsvHr:number, annualDoseUSv:number, annualDoseMsv:number, exceedsOEL:boolean});
}

// ================================================================
// 9. waterborneUptake - WHO (2011)
// ================================================================

/**
 * Calcula dose comprometida anual por ingestao de agua contaminada
 * com radionuclidios. Referencia WHO (2011) Guidelines for Drinking-water Quality.
 *
 * doseSv = activityBqL × dailyIntakeLd × waterUseFraction × 365 × dcf_ingestion
 * guidanceValueBqL = 0.1 mSv/yr / (dailyIntakeLd × 365 × dcf_ingestion)
 *
 * Usa DCF de Cs-137 por padrao se nao especificado.
 *
 * @param {number} activityConcentrationBqL  Concentracao na agua [Bq/L]
 * @param {number} dailyIntakeLd             Consumo diario de agua [L/d] (tipico 2 L/d)
 * @param {number} waterUseFraction          Fracao da dose oriunda desta fonte (0–1)
 * @param {number} [dcfIngestion=1.36e-8]    DCF de ingestao [Sv/Bq] (padrao Cs-137)
 * @returns {{ annualDoseSv:number, annualDoseMsv:number, guidanceValueBqL:number, exceedsWHO:boolean, activityConcentrationBqL:number }}
 *
 * @reference WHO (2011). Guidelines for Drinking-water Quality, 4th edition.
 *   World Health Organization, Geneva. ISBN 978-92-4-154815-1.
 */
export function waterborneUptake(activityConcentrationBqL: number, dailyIntakeLd: number, waterUseFraction: number, dcfIngestion: number = 1.36e-8): { annualDoseSv:number, annualDoseMsv:number, guidanceValueBqL:number, exceedsWHO:boolean, activityConcentrationBqL:number } {
    if (activityConcentrationBqL < 0) throw new RangeError('activityConcentrationBqL must be >= 0');
    if (dailyIntakeLd <= 0) throw new RangeError('dailyIntakeLd must be > 0');
    if (waterUseFraction < 0 || waterUseFraction > 1) throw new RangeError('waterUseFraction must be 0-1');
    if (dcfIngestion < 0) throw new RangeError('dcfIngestion must be >= 0');

    const annualDoseSv = activityConcentrationBqL * dailyIntakeLd * waterUseFraction * 365 * dcfIngestion;
    const annualDoseMsv = annualDoseSv * 1e3;
    // Nivel de orientacao WHO: 0.1 mSv/ano para dose radiologica total de agua potavel
    const guidanceValueBqL = 0.0001 / (dailyIntakeLd * 365 * dcfIngestion);
    const exceedsWHO = annualDoseSv > 0.0001;

    return ({
        annualDoseSv,
        annualDoseMsv,
        guidanceValueBqL,
        exceedsWHO,
        activityConcentrationBqL,
    } as {annualDoseSv:number, annualDoseMsv:number, guidanceValueBqL:number, exceedsWHO:boolean, activityConcentrationBqL:number});
}

// ================================================================
// 10. radioactiveWasteClassification - IAEA SSG-1 (2009)
// ================================================================

/**
 * Classifica residuo radioativo de acordo com IAEA Safety Standards SSG-1 (2009).
 *
 * Classes e limites:
 *   EW  (Exempt Waste):         < 0.1 Bq/g (longa meia-vida) ou < 1 Bq/g (curta <30 anos)
 *   VSLW (Very Short Lived):    meia-vida < 100 dias
 *   VLLW (Very Low Level):      < 100 Bq/g
 *   LLW  (Low Level):           < 400000 Bq/g
 *   ILW  (Intermediate Level):  >= 400000 Bq/g (sem calor significativo)
 *   HLW  (High Level):          saida termica significativa (indicada por threshold de atividade muito elevada)
 *
 * @param {number} activityBqKg  Atividade especifica [Bq/kg]
 * @param {string} radionuclide  Radionuclidio (para contexto)
 * @param {number} halfLifeYrs   Meia-vida [anos]
 * @returns {{ activityBqKg:number, activityBqG:number, halfLifeYrs:number, classification:string, disposalRoute:string }}
 *
 * @reference IAEA (2009). Classification of Radioactive Waste. IAEA Safety Standards
 *   Series No. GSG-1. International Atomic Energy Agency, Vienna.
 *   (Note: published as GSG-1 in 2009, revised SSG-1 framework used here.)
 */
export function radioactiveWasteClassification(activityBqKg: number, radionuclide: string, halfLifeYrs: number): { activityBqKg:number, activityBqG:number, halfLifeYrs:number, classification:string, disposalRoute:string } {
    if (activityBqKg < 0) throw new RangeError('activityBqKg must be >= 0');
    if (halfLifeYrs <= 0) throw new RangeError('halfLifeYrs must be > 0');

    const activityBqG = activityBqKg / 1000;
    const halfLifeDays = halfLifeYrs * 365.25;

    let classification;
    let disposalRoute;

    // Very Short Lived: meia-vida < 100 dias
    if (halfLifeDays < 100) {
        if (activityBqG < 100) {
            classification = 'VSLW';
            disposalRoute = 'near_surface';
        } else {
            classification = 'LLW';
            disposalRoute = 'near_surface';
        }
    }
    // Alta atividade (HLW): acima de 4e9 Bq/g (significativa saida termica)
    else if (activityBqG > 4e9) {
        classification = 'HLW';
        disposalRoute = 'deep_geological';
    }
    // ILW: >= 400000 Bq/g = 4e5 Bq/g
    else if (activityBqG >= 4e5) {
        classification = 'ILW';
        disposalRoute = 'intermediate_depth';
    }
    // LLW: >= 100 Bq/g ate 4e5 Bq/g
    else if (activityBqG >= 100) {
        classification = 'LLW';
        disposalRoute = 'near_surface';
    }
    // VLLW: >= limite EW ate < 100 Bq/g
    else {
        // EW threshold: 0.1 Bq/g para longa meia-vida (>30 anos), 1 Bq/g para curta
        const ewThreshold = halfLifeYrs > 30 ? 0.1 : 1.0;
        if (activityBqG < ewThreshold) {
            classification = 'EW';
            disposalRoute = 'exempt';
        } else {
            classification = 'VLLW';
            disposalRoute = 'near_surface';
        }
    }

    return ({
        activityBqKg,
        activityBqG,
        halfLifeYrs,
        classification,
        disposalRoute,
    } as {activityBqKg:number, activityBqG:number, halfLifeYrs:number, classification:string, disposalRoute:string});
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const radioactiveContaminationMeta = {
    name: 'radioactiveContamination',
    description: 'radioactiveContamination',
    category: 'analytics',
    familyTags: ['environmental'],
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
