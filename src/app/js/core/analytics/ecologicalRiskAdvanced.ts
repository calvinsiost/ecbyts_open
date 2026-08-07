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
// Application: Advanced Ecological Risk Assessment

/* ================================================================
   ADVANCED ECOLOGICAL RISK ASSESSMENT — Pure mathematical functions
   Avaliacao avancada de risco ecologico baseada em metodos internacionais
   ================================================================

   METODOS:
   - Risco em nivel populacional — stage matrix (Barnthouse 1992, USEPA 1998)
   - Analise de equivalencia de habitat HEA (NOAA 1997, Bishop-Boyle 2002)
   - Toxicocinetica de um compartimento PBPK (Clewell-Andersen 1985)
   - Avaliacao bentica mERM-Q (USEPA 2000 BERA, Hilsenhoff 1988)
   - Avaliacao PBT/vPvB — EU REACH 2006 (ECHA)
   - Exposicao de fauna silvestre (USEPA 1993 Wildlife Exposure Factors)
   - Avaliacao de funcoes de areas umidas HGM (Adamus 1992, Brinson 1993)
   - Risco de ecossistema marinho — IPCC AR6 (Hoegh-Guldberg 2007)
   - Conectividade de paisagem IIC (Urban-Keitt 2001, McRae 2008)
   - Valoracao de servicos ecossistemicos TEEB (de Groot 2012, TEEB 2010)

   Referencias academicas documentadas em cada funcao.
   ================================================================ */

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

interface LifeStages {
    juvenile: { exposure: number; sensitivity: number };
    adult: { exposure: number; sensitivity: number };
}

interface SedimentEntry {
    chemical: string;
    concentration_mg_kg: number;
    tel: number;
    pel: number;
}

interface DietComposition {
    invertebrates_pct?: number;
    fish_pct?: number;
    vegetation_pct?: number;
    small_mammals_pct?: number;
}

interface HabitatPatch {
    id: string;
    area_ha: number;
    x_m: number;
    y_m: number;
    quality: number;
}

interface ResistanceSurface {
    mean_resistance: number;
    max_distance_km: number;
}

// ================================================================
// CONSTANTES - sem numeros magicos
// ================================================================

/** Taxa de desconto padrao NOAA para HEA (3% ao ano) */
const HEA_DEFAULT_DISCOUNT_RATE = 0.03;

/** Valores de habitat USD/ha para HEA — valores de referencia de mercado */
const HABITAT_VALUES_USD_HA = {
    wetland: 50000,
    reef: 100000,
    grassland: 10000,
    forest: 25000,
};

/** BCF limites para classificacao bioconcentracao (EU REACH 2006 ECHA) */
const BCF_B_THRESHOLD = 2000;
const BCF_VB_THRESHOLD = 5000;

/** Meias-vidas para classificacao de persistencia EU REACH (dias) */
const HALF_LIFE_P_SOIL = 120;
const HALF_LIFE_P_WATER = 40;
const HALF_LIFE_VP_SOIL = 180;
const HALF_LIFE_VP_WATER = 60;

/** LC50 limiar de toxicidade EU REACH (mg/L) */
const LC50_T_THRESHOLD = 0.1;
/** BMC limiar de mamiferos EU REACH (mg/kg/dia) */
const BMC_T_THRESHOLD = 10;

/** Expoentes alometricos de ingestao por especie (USEPA 1993) */
const INGESTION_ALLOMETRIC = {
    songbird: { coeff: 0.0582, exp: 0.651 },
    raptor: { coeff: 0.0582, exp: 0.651 },
    shorebird: { coeff: 0.0582, exp: 0.651 },
    mammal_small: { coeff: 0.054, exp: 0.75 },
    mammal_large: { coeff: 0.054, exp: 0.75 },
};

/** Razoes de dieta por especie — fracao diaria de cada componente (USEPA 1993) */
const DIET_FRACTIONS_DEFAULT = {
    songbird: { invertebrates_pct: 50, fish_pct: 0, vegetation_pct: 50, small_mammals_pct: 0 },
    raptor: { invertebrates_pct: 10, fish_pct: 30, vegetation_pct: 0, small_mammals_pct: 60 },
    shorebird: { invertebrates_pct: 70, fish_pct: 20, vegetation_pct: 10, small_mammals_pct: 0 },
    mammal_small: { invertebrates_pct: 40, fish_pct: 0, vegetation_pct: 55, small_mammals_pct: 5 },
    mammal_large: { invertebrates_pct: 10, fish_pct: 5, vegetation_pct: 80, small_mammals_pct: 5 },
};

/** Valores TEEB 2010 em USD/ha/ano por cobertura do solo (de Groot 2012 Tabela 3) */
const TEEB_VALUES = {
    tropical_forest: {
        provisioning: 1109,
        regulating: 2726,
        cultural: 982,
        supporting: 565,
    },
    temperate_forest: {
        provisioning: 448,
        regulating: 1965,
        cultural: 516,
        supporting: 208,
    },
    wetland: {
        provisioning: 6018,
        regulating: 78481,
        cultural: 42393,
        supporting: 13282,
    },
    grassland: {
        provisioning: 388,
        regulating: 699,
        cultural: 197,
        supporting: 111,
    },
    coral_reef: {
        provisioning: 1100,
        regulating: 12513,
        cultural: 318046,
        supporting: 20590,
    },
    mangrove: {
        provisioning: 23672,
        regulating: 121528,
        cultural: 41714,
        supporting: 7086,
    },
    seagrass: {
        provisioning: 2567,
        regulating: 19238,
        cultural: 5567,
        supporting: 1544,
    },
};

/** Taxa de crescimento logistico padrao para recuperacao populacional */
const LOGISTIC_GROWTH_RATE = 0.3;

// ================================================================
// FUNCOES AUXILIARES
// ================================================================

/**
 * Soma de trapezios para integracao numerica (regra trapezoidal).
 * @param {number[]} y - Valores da funcao
 * @param {number[]} x - Pontos de abscissa
 * @returns {number} Area sob a curva
 */
function trapezoidalIntegration(y: number[], x: number[]): number {
    let auc = 0;
    for (let i = 1; i < x.length; i++) {
        auc += 0.5 * ((y[i] as number) + (y[i - 1] as number)) * ((x[i] as number) - (x[i - 1] as number));
    }
    return auc;
}

/**
 * Calcula BCF estimado a partir do logKow (Mackay 1982 simplificado).
 * @param {number} logKow - Log do coeficiente de particao octanol-agua
 * @returns {number} BCF estimado (L/kg)
 */
function estimateBCF(logKow: number): number {
    // Relacao empirica: log BCF = 0.85 * logKow - 0.70 (Mackay 1982)
    return Math.pow(10, 0.85 * logKow - 0.7);
}

/**
 * Media geometrica de um array de numeros positivos.
 * @param {number[]} values
 * @returns {number}
 */
function geometricMean(values: number[]): number {
    if (!values || values.length === 0) return 0;
    const logSum = values.reduce((acc, v) => acc + Math.log(Math.max(v, 1e-12)), 0);
    return Math.exp(logSum / values.length);
}

// ================================================================
// 1. RISCO EM NIVEL POPULACIONAL
// ================================================================

/**
 * Avaliacao de risco ecologico em nivel populacional via analise de sensibilidade
 * de matriz de estagios (Barnthouse 1992, USEPA 1998 ERA Guidelines).
 *
 * Reducao de lambda (taxa de crescimento populacional) estimada pela razao
 * entre exposicao e sensibilidade nos estagios juvenil e adulto.
 * Recuperacao via crescimento logistico com r = 0.3/ano.
 *
 * @param {number[]} exposureConcentrations - Concentracoes de exposicao (mg/L ou mg/kg)
 * @param {number} ld50 - LD50 da especie (mg/kg)
 * @param {number} noec - NOEC (mg/L ou mg/kg)
 * @param {string} species - Nome da especie
 * @param {{juvenile: {exposure: number, sensitivity: number}, adult: {exposure: number, sensitivity: number}}} lifeStages
 *   Exposicao e sensibilidade por estagio de vida
 * @returns {{lambdaImpact: number, populationGrowthReduction_pct: number, extinctionProbability: number, recoveryTime_yrs: number}}
 */
export function populationLevelRisk(
    exposureConcentrations: number[],
    ld50: number,
    noec: number,
    species: string,
    lifeStages: LifeStages,
): {
    lambdaImpact: number;
    populationGrowthReduction_pct: number;
    extinctionProbability: number;
    recoveryTime_yrs: number;
} {
    if (!exposureConcentrations || exposureConcentrations.length === 0) {
        return { lambdaImpact: 0, populationGrowthReduction_pct: 0, extinctionProbability: 0, recoveryTime_yrs: 0 };
    }
    if (!lifeStages || !lifeStages.juvenile || !lifeStages.adult) {
        return { lambdaImpact: 0, populationGrowthReduction_pct: 0, extinctionProbability: 0, recoveryTime_yrs: 0 };
    }

    // Concentracao media de exposicao
    const meanExposure = exposureConcentrations.reduce((a, b) => a + b, 0) / exposureConcentrations.length;

    // Quociente de hazard geral baseado no NOEC
    const hqGeneral = noec > 0 ? meanExposure / noec : 0;

    // Sensibilidade por estagio de vida - razao exposicao/sensibilidade
    const { juvenile, adult } = lifeStages;
    const juvenileSR = juvenile.sensitivity > 0 ? juvenile.exposure / juvenile.sensitivity : 0;
    const adultSR = adult.sensitivity > 0 ? adult.exposure / adult.sensitivity : 0;

    // Lambda impact: media ponderada das razoes de estagio
    // Juvenis recebem peso maior (0.6) por maior contribuicao para lambda em demografias tipicas
    const lambdaImpact = Math.min(1, 0.6 * juvenileSR + 0.4 * adultSR);

    // Reducao de crescimento populacional (%)
    const populationGrowthReduction_pct = lambdaImpact * 100;

    // Probabilidade de extincao: funcao logistica baseada em HQ (Barnthouse 1992)
    // P(ext) = 1 / (1 + exp(-2 * (HQ - 2)))
    const extinctionProbability = Math.min(0.99, 1 / (1 + Math.exp(-2 * (hqGeneral - 2))));

    // Tempo de recuperacao via crescimento logistico: N(t) = K / (1 + ((K-N0)/N0) * exp(-r*t))
    // Para populacao reduzida a (1 - lambdaImpact) * K, recuperar a 0.95*K
    const n0Fraction = Math.max(0.01, 1 - lambdaImpact);
    // Resolver t de: 0.95 = 1 / (1 + ((1-n0)/n0) * exp(-r*t))
    // => exp(-r*t) = (1/0.95 - 1) * n0 / (1 - n0)
    // => t = -ln(...) / r
    const ratio = ((1 / 0.95 - 1) * n0Fraction) / (1 - n0Fraction);
    const recoveryTime_yrs = ratio > 0 ? Math.max(0, -Math.log(ratio) / LOGISTIC_GROWTH_RATE) : 0;

    return {
        lambdaImpact: parseFloat(lambdaImpact.toFixed(4)),
        populationGrowthReduction_pct: parseFloat(populationGrowthReduction_pct.toFixed(2)),
        extinctionProbability: parseFloat(extinctionProbability.toFixed(4)),
        recoveryTime_yrs: parseFloat(recoveryTime_yrs.toFixed(2)),
    };
}

// ================================================================
// 2. ANALISE DE EQUIVALENCIA DE HABITAT (HEA)
// ================================================================

/**
 * Analise de equivalencia de habitat para danos a recursos naturais
 * (NOAA 1997 HEA Guidelines, Bishop & Boyle 2002).
 *
 * Perda de servicos = area_danificada * (1 - recuperacao(t)) descontada a 3%/ano.
 * Valor do habitat por tipo: wetland=$50k, reef=$100k, grassland=$10k, forest=$25k.
 *
 * @param {number} damagedArea_ha - Area danificada em hectares
 * @param {number} recoveryTime_yrs - Tempo de recuperacao em anos
 * @param {string} habitatType - Tipo de habitat: 'wetland'|'reef'|'grassland'|'forest'
 * @param {number} [discountRate=0.03] - Taxa de desconto anual (padrao NOAA 3%)
 * @returns {{serviceLossDiscounted_ha_yr: number, requiredHabitatGain_ha: number, compensatoryProjectSize_ha: number, presentValueLoss_USD: number}}
 */
export function habitatEquivalencyAnalysis(
    damagedArea_ha: number,
    recoveryTime_yrs: number,
    habitatType: string,
    discountRate: number = HEA_DEFAULT_DISCOUNT_RATE,
): {
    serviceLossDiscounted_ha_yr: number;
    requiredHabitatGain_ha: number;
    compensatoryProjectSize_ha: number;
    presentValueLoss_USD: number;
} {
    if (damagedArea_ha <= 0 || recoveryTime_yrs <= 0) {
        return {
            serviceLossDiscounted_ha_yr: 0,
            requiredHabitatGain_ha: 0,
            compensatoryProjectSize_ha: 0,
            presentValueLoss_USD: 0,
        };
    }

    const rate = discountRate > 0 ? discountRate : HEA_DEFAULT_DISCOUNT_RATE;

    // Perda de servico anual descontada - integracao numerica do periodo de recuperacao
    // Progressao de recuperacao linear de 0 a 1 ao longo de recoveryTime_yrs
    let serviceLossDiscounted_ha_yr = 0;
    const steps = Math.max(Math.ceil(recoveryTime_yrs * 12), 12); // resolucao mensal
    const dt = recoveryTime_yrs / steps;
    for (let i = 0; i <= steps; i++) {
        const t = i * dt;
        const recoveryProgress = t / recoveryTime_yrs; // 0 a 1
        const annualLoss = damagedArea_ha * (1 - recoveryProgress);
        const discountFactor = Math.pow(1 + rate, -t);
        serviceLossDiscounted_ha_yr += annualLoss * discountFactor * dt;
    }

    // Projeto compensatorio: ganho de 0 a 1 durante tempo do projeto (10 anos padrao)
    // Tamanho requerido: serviceLoss / (fator de ganho descontado)
    const projectDuration_yrs = 10;
    let gainFactorDiscounted = 0;
    const gSteps = projectDuration_yrs * 12;
    const gDt = projectDuration_yrs / gSteps;
    for (let i = 0; i <= gSteps; i++) {
        const t = i * gDt;
        const gainProgress = t / projectDuration_yrs;
        gainFactorDiscounted += gainProgress * Math.pow(1 + rate, -t) * gDt;
    }
    const requiredHabitatGain_ha = gainFactorDiscounted > 0 ? serviceLossDiscounted_ha_yr / gainFactorDiscounted : 0;
    const compensatoryProjectSize_ha = requiredHabitatGain_ha;

    // Valor presente das perdas em USD
    const habitatValue =
        (HABITAT_VALUES_USD_HA as Record<string, number>)[habitatType] || HABITAT_VALUES_USD_HA.forest;
    const presentValueLoss_USD = serviceLossDiscounted_ha_yr * habitatValue;

    return {
        serviceLossDiscounted_ha_yr: parseFloat(serviceLossDiscounted_ha_yr.toFixed(4)),
        requiredHabitatGain_ha: parseFloat(requiredHabitatGain_ha.toFixed(4)),
        compensatoryProjectSize_ha: parseFloat(compensatoryProjectSize_ha.toFixed(4)),
        presentValueLoss_USD: parseFloat(presentValueLoss_USD.toFixed(2)),
    };
}

// ================================================================
// 3. TOXICOCINETICA DE UM COMPARTIMENTO
// ================================================================

/**
 * Modelo toxicocinetico de um compartimento (Clewell & Andersen 1985, USEPA PBPK).
 *
 * C(t) = (F * D * ka) / (Vd * (ka - ke)) * (exp(-ke*t) - exp(-ka*t))
 * AUC via regra trapezoidal. Meia-vida = ln(2) / ke.
 *
 * @param {number} dose_mg_kg - Dose oral (mg/kg de peso corporal)
 * @param {number} absorptionRate - Taxa de absorcao ka (h^-1)
 * @param {number} eliminationRate - Taxa de eliminacao ke (h^-1)
 * @param {number} volume_L_kg - Volume de distribuicao (L/kg)
 * @param {number[]} timePoints_hrs - Pontos de tempo em horas para calculo de C(t)
 * @returns {{concentrations_mg_L: number[], cmax_mg_L: number, tmax_hr: number, auc_mg_L_hr: number, halfLife_hr: number, bioavailability: number}}
 */
export function toxicokineticsOneCompartment(
    dose_mg_kg: number,
    absorptionRate: number,
    eliminationRate: number,
    volume_L_kg: number,
    timePoints_hrs: number[],
): {
    concentrations_mg_L: number[];
    cmax_mg_L: number;
    tmax_hr: number;
    auc_mg_L_hr: number;
    halfLife_hr: number;
    bioavailability: number;
} {
    if (!timePoints_hrs || timePoints_hrs.length === 0) {
        return {
            concentrations_mg_L: [],
            cmax_mg_L: 0,
            tmax_hr: 0,
            auc_mg_L_hr: 0,
            halfLife_hr: 0,
            bioavailability: 1,
        };
    }

    const ka = absorptionRate;
    const ke = eliminationRate;
    const Vd = volume_L_kg;
    // Biodisponibilidade assumida = 1 por ausencia de dados (modelo simplificado)
    const F = 1;

    // Verificar ka != ke (evitar divisao por zero)
    const kaDiffKe = ka - ke;

    const concentrations_mg_L = timePoints_hrs.map((t) => {
        if (Math.abs(kaDiffKe) < 1e-10) {
            // Caso especial: ka ≈ ke - equacao alternativa de Bateman
            return ((F * dose_mg_kg * ka) / Vd) * t * Math.exp(-ke * t);
        }
        return ((F * dose_mg_kg * ka) / (Vd * kaDiffKe)) * (Math.exp(-ke * t) - Math.exp(-ka * t));
    });

    // Cmax e Tmax
    let cmax_mg_L = 0;
    let tmax_hr = 0;
    for (let i = 0; i < concentrations_mg_L.length; i++) {
        if ((concentrations_mg_L[i] as number) > cmax_mg_L) {
            cmax_mg_L = concentrations_mg_L[i] as number;
            tmax_hr = timePoints_hrs[i] as number;
        }
    }

    // AUC via regra trapezoidal
    const auc_mg_L_hr = trapezoidalIntegration(concentrations_mg_L, timePoints_hrs);

    // Meia-vida de eliminacao
    const halfLife_hr = Math.LN2 / ke;

    return {
        concentrations_mg_L: concentrations_mg_L.map((c) => parseFloat(c.toFixed(6))),
        cmax_mg_L: parseFloat(cmax_mg_L.toFixed(6)),
        tmax_hr: parseFloat(tmax_hr.toFixed(2)),
        auc_mg_L_hr: parseFloat(auc_mg_L_hr.toFixed(4)),
        halfLife_hr: parseFloat(halfLife_hr.toFixed(2)),
        bioavailability: F,
    };
}

// ================================================================
// 4. AVALIACAO BENTICA
// ================================================================

/**
 * Avaliacao de risco ecologico da comunidade bentica com mERM-Q e Indice Biotico
 * (USEPA 2000 BERA, Hilsenhoff 1988).
 *
 * mERM-Q > 0.5 indica efeitos provaveis. FBI (Hilsenhoff):
 * 0-2.5=Excelente, 2.5-5=Bom, 5-7.5=Regular, 7.5-10=Ruim.
 *
 * @param {{chemical: string, concentration_mg_kg: number, tel: number, pel: number}[]} sedimentConcentrations
 *   TEL=Threshold Effect Level, PEL=Probable Effect Level (mg/kg)
 * @param {number} speciesRichness - Riqueza de especies benticas (numero de especies)
 * @param {number} biotic_index - Indice Biotico de Hilsenhoff (FBI) 0-10
 * @returns {{meanSQG_quotient: number, mERM_quotient: number, ecologicalStatus: string, bioticStatus: string, integralRisk: number}}
 */
export function benthicAssessment(
    sedimentConcentrations: SedimentEntry[],
    speciesRichness: number,
    biotic_index: number,
): {
    meanSQG_quotient: number;
    mERM_quotient: number;
    ecologicalStatus: string;
    bioticStatus: string;
    integralRisk: number;
} {
    if (!sedimentConcentrations || sedimentConcentrations.length === 0) {
        return {
            meanSQG_quotient: 0,
            mERM_quotient: 0,
            ecologicalStatus: 'Unknown',
            bioticStatus: 'Unknown',
            integralRisk: 0,
        };
    }

    // SQG-Q medio (TEL baseado) para cada contaminante
    const sqgQuotients = sedimentConcentrations.map((entry) => {
        if (!entry.tel || entry.tel <= 0) return 0;
        return entry.concentration_mg_kg / entry.tel;
    });
    const meanSQG_quotient = sqgQuotients.reduce((a, b) => a + b, 0) / sqgQuotients.length;

    // mERM-Q: media dos quocientes concentration/PEL (USEPA 2000)
    const ermQuotients = sedimentConcentrations.map((entry) => {
        if (!entry.pel || entry.pel <= 0) return 0;
        return entry.concentration_mg_kg / entry.pel;
    });
    const mERM_quotient = ermQuotients.reduce((a, b) => a + b, 0) / ermQuotients.length;

    // Status ecologico baseado em mERM-Q
    let ecologicalStatus;
    if (mERM_quotient < 0.1) {
        ecologicalStatus = 'Minimal Effect';
    } else if (mERM_quotient < 0.5) {
        ecologicalStatus = 'Possible Effect';
    } else if (mERM_quotient < 1.5) {
        ecologicalStatus = 'Probable Effect';
    } else {
        ecologicalStatus = 'Severe Effect';
    }

    // Status biotico via FBI de Hilsenhoff (1988)
    let bioticStatus;
    if (biotic_index < 2.5) {
        bioticStatus = 'Excellent';
    } else if (biotic_index < 5.0) {
        bioticStatus = 'Good';
    } else if (biotic_index < 7.5) {
        bioticStatus = 'Fair';
    } else {
        bioticStatus = 'Poor';
    }

    // Risco integral: combinacao de mERM-Q e FBI normalizado
    const fbiFraction = biotic_index / 10;
    const ermFraction = Math.min(1, mERM_quotient / 2);
    const integralRisk = parseFloat((0.5 * ermFraction + 0.5 * fbiFraction).toFixed(4));

    return {
        meanSQG_quotient: parseFloat(meanSQG_quotient.toFixed(4)),
        mERM_quotient: parseFloat(mERM_quotient.toFixed(4)),
        ecologicalStatus,
        bioticStatus,
        integralRisk,
    };
}

// ================================================================
// 5. AVALIACAO PBT / vPvB
// ================================================================

/**
 * Avaliacao de Persistencia, Bioacumulacao e Toxicidade (PBT/vPvB)
 * conforme EU REACH 2006 (ECHA Guidance on Information Requirements).
 *
 * Criterios:
 * - P: t1/2 solo>120d ou agua>40d; vP: t1/2 solo>180d ou agua>60d
 * - B: BCF>2000; vB: BCF>5000 (logKow proxy)
 * - T: LC50 peixe<0.1 mg/L ou CMR (BMC<10 mg/kg/dia)
 *

 * @param {number} halfLifeSoil_days - Meia-vida em solo (dias)
 * @param {number} halfLifeWater_days - Meia-vida em agua (dias)
 * @returns {{persistenceScore: number, bioaccumulationScore: number, toxicityScore: number, pbtClassification: string, vpvbClassification: string}}
 */
function classifyPersistence(halfLifeSoil_days: number, halfLifeWater_days: number) {
    const isP = halfLifeSoil_days > HALF_LIFE_P_SOIL || halfLifeWater_days > HALF_LIFE_P_WATER;
    const isVP = halfLifeSoil_days > HALF_LIFE_VP_SOIL || halfLifeWater_days > HALF_LIFE_VP_WATER;
    return { isP, isVP, persistenceScore: isVP ? 2 : isP ? 1 : 0 };
}

function classifyBioaccumulation(logKow: number) {
    const bcf = estimateBCF(logKow);
    const isB = bcf >= BCF_B_THRESHOLD;
    const isVB = bcf >= BCF_VB_THRESHOLD;
    return { bcf, isB, isVB, bioaccumulationScore: isVB ? 2 : isB ? 1 : 0 };
}

function classifyToxicity(lc50Fish_mg_L: number, bmc_mammals_mg_kg_day: number) {
    const isToxicFish = lc50Fish_mg_L < LC50_T_THRESHOLD;
    const isToxicMammal = bmc_mammals_mg_kg_day < BMC_T_THRESHOLD;
    const isT = isToxicFish || isToxicMammal;
    return { isT, toxicityScore: isT ? 1 : 0 };
}

function buildPBTClassification(
    isP: boolean,
    isVP: boolean,
    isB: boolean,
    isVB: boolean,
    isT: boolean,
) {
    const isPBT = (isP || isVP) && (isB || isVB) && isT;
    const isVPVB = isVP && isVB;
    return {
        pbtClassification: isPBT ? (isVP && isVB ? 'vPvBT' : 'PBT') : 'Not PBT',
        vpvbClassification: isVPVB ? 'vPvB' : 'Not vPvB',
    };
}

export function persistenceBioaccumulationToxicity(
    logKow: number,
    halfLifeSoil_days: number,
    halfLifeWater_days: number,
    lc50Fish_mg_L: number,
    bmc_mammals_mg_kg_day: number,
): {
    persistenceScore: number;
    bioaccumulationScore: number;
    toxicityScore: number;
    pbtClassification: string;
    vpvbClassification: string;
} {
    const { isP, isVP, persistenceScore } = classifyPersistence(halfLifeSoil_days, halfLifeWater_days);
    const { isB, isVB, bioaccumulationScore } = classifyBioaccumulation(logKow);
    const { isT, toxicityScore } = classifyToxicity(lc50Fish_mg_L, bmc_mammals_mg_kg_day);
    const { pbtClassification, vpvbClassification } = buildPBTClassification(isP, isVP, isB, isVB, isT);

    return {
        persistenceScore,
        bioaccumulationScore,
        toxicityScore,
        pbtClassification,
        vpvbClassification,
    };
}

// ================================================================
// 6. MODELO DE EXPOSICAO DE FAUNA SILVESTRE
// ================================================================

/**
 * Estimativa de exposicao dietetica e quociente de hazard para fauna silvestre
 * (USEPA 1993 Wildlife Exposure Factors Handbook, Sample 1997).
 *
 * Taxa de ingestao de alimento por peso corporal:
 * - Aves: FIR = 0.0582 * BW^0.651 kg/dia (Nagy 1987 em USEPA 1993)
 * - Mamiferos: FIR = 0.054 * BW^0.75 kg/dia
 *
 * @param {number} species - Concentracao do contaminante na dieta (mg/kg peso seco)
 * @param {string} species - Classe da especie: 'songbird'|'raptor'|'shorebird'|'mammal_small'|'mammal_large'
 * @param {string} species - Codigo da especie para lookup de parametros alometricos
 * @param {{invertebrates_pct?: number, fish_pct?: number, vegetation_pct?: number, small_mammals_pct?: number}} dietComposition
 *   Composicao dietetica em percentual (soma deve ser 100%)
 * @returns {{dailyDietaryIntake_mg_kg_day: number, hazardQuotient: number, riskLevel: string, sensitiveSpecies: boolean}}
 */
function resolveAllometric(species: string) {
    const table = INGESTION_ALLOMETRIC as Record<string, { coeff: number; exp: number }>;
    return table[species] || INGESTION_ALLOMETRIC.mammal_small;
}

function resolveDiet(species: string, dietComposition: DietComposition) {
    const diet =
        dietComposition ||
        (DIET_FRACTIONS_DEFAULT as Record<string, DietComposition>)[species] ||
        DIET_FRACTIONS_DEFAULT.mammal_small;
    const totalPct =
        (diet.invertebrates_pct || 0) +
        (diet.fish_pct || 0) +
        (diet.vegetation_pct || 0) +
        (diet.small_mammals_pct || 0);
    return { diet, dietWeight: totalPct > 0 ? totalPct / 100 : 1 };
}

function resolveNoecBenchmark(species: string) {
    const noecBenchmarks = {
        songbird: 1.0,
        raptor: 0.5,
        shorebird: 0.8,
        mammal_small: 1.5,
        mammal_large: 2.0,
    };
    return (noecBenchmarks as Record<string, number>)[species] || 1.0;
}

function riskLevelFromHQ(hazardQuotient: number) {
    if (hazardQuotient < 0.1) return 'Negligible';
    if (hazardQuotient < 1) return 'Low';
    if (hazardQuotient < 10) return 'Moderate';
    return 'High';
}

export function wildlifeExposureModel(
    contaminantConc_mg_kg_dw: number,
    species: string,
    bodyWeight_kg: number,
    dietComposition: DietComposition,
): {
    dailyDietaryIntake_mg_kg_day: number;
    hazardQuotient: number;
    riskLevel: string;
    sensitiveSpecies: boolean;
} {
    const allometric = resolveAllometric(species);

    // Taxa de ingestao de alimento (kg alimento / dia)
    const foodIngestionRate_kg_day = allometric.coeff * Math.pow(bodyWeight_kg, allometric.exp);

    // Dieta efetiva - media ponderada pela composicao
    const { dietWeight } = resolveDiet(species, dietComposition);

    // Ingestao diaria de contaminante (mg/dia) = FIR * concentracao * fracao dietetica
    const dailyIntake_mg_day = foodIngestionRate_kg_day * contaminantConc_mg_kg_dw * dietWeight;

    // Dose dietetica normalizada por peso corporal (mg/kg/dia)
    const dailyDietaryIntake_mg_kg_day = bodyWeight_kg > 0 ? dailyIntake_mg_day / bodyWeight_kg : 0;

    const noecRef = resolveNoecBenchmark(species);
    const hazardQuotient = noecRef > 0 ? dailyDietaryIntake_mg_kg_day / noecRef : 0;
    const riskLevel = riskLevelFromHQ(hazardQuotient);
    const sensitiveSpecies = species === 'raptor' || species === 'mammal_large';

    return {
        dailyDietaryIntake_mg_kg_day: parseFloat(dailyDietaryIntake_mg_kg_day.toFixed(6)),
        hazardQuotient: parseFloat(hazardQuotient.toFixed(4)),
        riskLevel,
        sensitiveSpecies,
    };
}

// ================================================================
// 7. AVALIACAO DE FUNCOES DE AREAS UMIDAS (HGM)
// ================================================================

/**
 * Avaliacao de funcoes e valores de areas umidas via metodo HGM
 * (Adamus 1992 HGM, Brinson 1993 Hydrogeomorphic Classification).
 *
 * FCI (Functional Capacity Index) = media geometrica dos escores.
 * Valor de servicos: FCI × area × 20.000 USD/ha/ano.
 * Razao de mitigacao: FCI<0.5→3:1, FCI<0.75→2:1, FCI≥0.75→1.5:1.
 *
 * @param {number} hydrological_score - Escore hidrologico 0-1
 * @param {number} vegetative_score - Escore vegetativo 0-1
 * @param {number} waterQuality_score - Escore de qualidade da agua 0-1
 * @param {number} wildlifeScore - Escore de fauna 0-1
 * @param {number} area_ha - Area da area umida (ha)
 * @returns {{fci: number, wetlandValue: string, annualEcosystemServices_USD: number, carbonStorage_tCO2: number, mitigation_ratio: number}}
 */
export function wetlandFunctionAssessment(
    hydrological_score: number,
    vegetative_score: number,
    waterQuality_score: number,
    wildlifeScore: number,
    area_ha: number,
): {
    fci: number;
    wetlandValue: string;
    annualEcosystemServices_USD: number;
    carbonStorage_tCO2: number;
    mitigation_ratio: number;
} {
    // FCI via media geometrica dos quatro escores
    const scores = [hydrological_score, vegetative_score, waterQuality_score, wildlifeScore].map((s) =>
        Math.max(0, Math.min(1, s)),
    );
    const fci = geometricMean(scores);

    // Classificacao de valor
    let wetlandValue;
    if (fci >= 0.75) {
        wetlandValue = 'High';
    } else if (fci >= 0.5) {
        wetlandValue = 'Moderate';
    } else if (fci >= 0.25) {
        wetlandValue = 'Low';
    } else {
        wetlandValue = 'Very Low';
    }

    // Servicos ecossistemicos anuais (USD/ano)
    const annualEcosystemServices_USD = fci * area_ha * 20000;

    // Armazenamento de carbono: areas umidas tipicas acumulam 1-3 tCO2/ha/ano
    // Media ponderada por FCI (Mitsch & Gosselink 2007)
    const carbonStorage_tCO2 = fci * area_ha * 2.0;

    // Razao de mitigacao (USACE 1999)
    let mitigation_ratio;
    if (fci < 0.5) {
        mitigation_ratio = 3.0;
    } else if (fci < 0.75) {
        mitigation_ratio = 2.0;
    } else {
        mitigation_ratio = 1.5;
    }

    return {
        fci: parseFloat(fci.toFixed(4)),
        wetlandValue,
        annualEcosystemServices_USD: parseFloat(annualEcosystemServices_USD.toFixed(2)),
        carbonStorage_tCO2: parseFloat(carbonStorage_tCO2.toFixed(2)),
        mitigation_ratio,
    };
}

// ================================================================
// 8. RISCO DE ECOSSISTEMA MARINHO
// ================================================================

/**
 * Avaliacao de risco para ecossistema marinho por multiplos estressores
 * (IPCC AR6 Ocean Chapter 2021, Hoegh-Guldberg 2007 Coral Bleaching).
 *
 * Branqueamento de coral: delta pH > 0.3 ou temp > +2°C → HIGH.
 * Impacto em pesca: 5% por °C + 2% por 100 km² de hipoxia.
 * CSI = media dos estressores normalizados.
 *
 * @param {number} oceanAcidification_pH_delta - Variacao de pH (valor negativo = acidificacao)
 * @param {number} temperatureAnomaly_C - Anomalia de temperatura (°C)
 * @param {number} hypoxiaArea_km2 - Area de hipoxia (km²)
 * @param {number} plasticLoad_tons_km2 - Carga de plastico (ton/km²)
 * @returns {{coralBleachingRisk: string, fisheryImpact_pct: number, marineHabitatLoss_pct: number, cumulativeStressIndex: number, recoveryProbability: number}}
 */
export function marineEcosystemRisk(
    oceanAcidification_pH_delta: number,
    temperatureAnomaly_C: number,
    hypoxiaArea_km2: number,
    plasticLoad_tons_km2: number,
): {
    coralBleachingRisk: string;
    fisheryImpact_pct: number;
    marineHabitatLoss_pct: number;
    cumulativeStressIndex: number;
    recoveryProbability: number;
} {
    // Risco de branqueamento de coral (Hoegh-Guldberg 2007)
    const pHDrop = Math.abs(Math.min(0, oceanAcidification_pH_delta));
    const isCriticalAcid = pHDrop > 0.3;
    const isCriticalTemp = temperatureAnomaly_C > 2;
    const isMediumTemp = temperatureAnomaly_C > 1;
    let coralBleachingRisk;
    if (isCriticalAcid || isCriticalTemp) {
        coralBleachingRisk = 'High';
    } else if (pHDrop > 0.1 || isMediumTemp) {
        coralBleachingRisk = 'Moderate';
    } else {
        coralBleachingRisk = 'Low';
    }

    // Impacto em pesca (%) - IPCC AR6 Cap. 3
    const fisheryImpact_pct = Math.min(100, temperatureAnomaly_C * 5 + (hypoxiaArea_km2 / 100) * 2);

    // Perda de habitat marinho (%)
    // Acidificacao: 0.1 pH = ~10% perda; temperatura: 1°C = ~8% perda
    const habitatLossAcid = pHDrop * 100;
    const habitatLossTemp = temperatureAnomaly_C * 8;
    const habitatLossPlastic = Math.min(10, plasticLoad_tons_km2 * 2);
    const marineHabitatLoss_pct = Math.min(100, habitatLossAcid + habitatLossTemp + habitatLossPlastic);

    // Indice de estresse cumulativo (CSI) - media dos 4 estressores normalizados
    const normAcid = Math.min(1, pHDrop / 0.5);
    const normTemp = Math.min(1, temperatureAnomaly_C / 4);
    const normHypoxia = Math.min(1, hypoxiaArea_km2 / 10000);
    const normPlastic = Math.min(1, plasticLoad_tons_km2 / 10);
    const cumulativeStressIndex = parseFloat(((normAcid + normTemp + normHypoxia + normPlastic) / 4).toFixed(4));

    // Probabilidade de recuperacao - inverso do CSI com fator de amortecimento
    const recoveryProbability = parseFloat(Math.max(0, 1 - cumulativeStressIndex * 1.2).toFixed(4));

    return {
        coralBleachingRisk,
        fisheryImpact_pct: parseFloat(fisheryImpact_pct.toFixed(2)),
        marineHabitatLoss_pct: parseFloat(marineHabitatLoss_pct.toFixed(2)),
        cumulativeStressIndex,
        recoveryProbability,
    };
}

// ================================================================
// 9. INDICE DE CONECTIVIDADE DE PAISAGEM
// ================================================================

/**
 * Indice de conectividade de paisagem IIC para fauna silvestre
 * (Urban & Keitt 2001, McRae 2008 Circuit Theory).
 *
 * IIC = Σ(ai × aj) / (1 + nlij) / A²
 * onde nlij = numero de ligacoes no menor caminho entre fragmentos i e j.
 * Prioridade de corredor baseada em par com maior potencial de melhoria.
 *
 * @param {{id: string, area_ha: number, x_m: number, y_m: number, quality: number}[]} habitatPatches
 *   Fragmentos de habitat (qualidade 0-1)
 * @param {{mean_resistance: number, max_distance_km: number}} resistanceSurface
 *   Superficie de resistencia da matriz
 * @returns {{connectance_index: number, iff_index: number, patchProbabilities: {id: string, probability: number}[], isolatedPatches: string[], corridorPriority: string}}
 */
function computeDistanceMatrix(patches: HabitatPatch[]): number[][] {
    const n = patches.length;
    const distances: number[][] = [];
    for (let i = 0; i < n; i++) {
        const pi = patches[i];
        if (!pi) continue;
        const row: number[] = [];
        for (let j = 0; j < n; j++) {
            const pj = patches[j];
            if (!pj) continue;
            const dx = pi.x_m - pj.x_m;
            const dy = pi.y_m - pj.y_m;
            row[j] = Math.sqrt(dx * dx + dy * dy);
        }
        distances[i] = row;
    }
    return distances;
}

function computeConnectedMatrix(distances: number[][], maxDist_m: number): boolean[][] {
    return distances.map((row) => row.map((d) => d < maxDist_m));
}

function computeIICAndCorridor(
    patches: HabitatPatch[],
    distances: number[][],
    maxDist_m: number,
    resistance: number,
) {
    let iicSum = 0;
    let bestPairValue = 0;
    const firstPatch = patches[0];
    let corridorPriority = firstPatch ? firstPatch.id : 'None';
    for (let i = 0; i < patches.length; i++) {
        const pi = patches[i];
        if (!pi) continue;
        for (let j = i; j < patches.length; j++) {
            const pj = patches[j];
            if (!pj) continue;
            const ai = pi.area_ha;
            const aj = pj.area_ha;
            const dist = distances[i]?.[j];
            if (dist === undefined) continue;
            const nlij = i === j ? 0 : Math.max(1, Math.ceil((dist / maxDist_m) * resistance));
            const contrib = (ai * aj) / (1 + nlij);
            iicSum += i === j ? 0 : 2 * contrib;
            if (i !== j && contrib > bestPairValue) {
                bestPairValue = contrib;
                corridorPriority = `${pi.id}-${pj.id}`;
            }
        }
        iicSum += pi.area_ha * pi.area_ha;
    }
    return { iicSum, corridorPriority };
}

function computeConnectance(connected: boolean[][], n: number) {
    let connectedPairs = 0;
    const totalPairs = (n * (n - 1)) / 2;
    for (let i = 0; i < n; i++) {
        const row = connected[i];
        if (!row) continue;
        for (let j = i + 1; j < n; j++) {
            if (row[j]) connectedPairs++;
        }
    }
    return totalPairs > 0 ? parseFloat((connectedPairs / totalPairs).toFixed(4)) : 1;
}

function computePatchProbabilities(patches: HabitatPatch[], totalArea: number) {
    return patches.map((p) => ({
        id: p.id,
        probability: parseFloat(((p.area_ha / totalArea) * (p.quality || 1)).toFixed(4)),
    }));
}

function computeIsolatedPatches(patches: HabitatPatch[], connected: boolean[][]): string[] {
    return patches
        .filter((_, i) => {
            const row = connected[i];
            if (!row) return true;
            return !patches.some((__, j) => {
                if (i === j) return false;
                return row[j] === true;
            });
        })
        .map((p) => p.id);
}

export function landscapeConnectivityIndex(
    habitatPatches: HabitatPatch[],
    resistanceSurface: ResistanceSurface,
): {
    connectance_index: number;
    iff_index: number;
    patchProbabilities: { id: string; probability: number }[];
    isolatedPatches: string[];
    corridorPriority: string;
} {
    if (!habitatPatches || habitatPatches.length === 0) {
        return {
            connectance_index: 0,
            iff_index: 0,
            patchProbabilities: [],
            isolatedPatches: [],
            corridorPriority: 'None',
        };
    }
    if (habitatPatches.length === 1) {
        const p0 = habitatPatches[0];
        if (!p0) {
            return {
                connectance_index: 0,
                iff_index: 0,
                patchProbabilities: [],
                isolatedPatches: [],
                corridorPriority: 'None',
            };
        }
        return {
            connectance_index: 1,
            iff_index: p0.area_ha,
            patchProbabilities: [{ id: p0.id, probability: 1 }],
            isolatedPatches: [p0.id],
            corridorPriority: p0.id,
        };
    }

    const maxDist_m = (resistanceSurface.max_distance_km || 5) * 1000;
    const resistance = resistanceSurface.mean_resistance || 1;
    const n = habitatPatches.length;
    const totalArea = habitatPatches.reduce((s, p) => s + p.area_ha, 0);

    const distances = computeDistanceMatrix(habitatPatches);
    const connected = computeConnectedMatrix(distances, maxDist_m);
    const { iicSum, corridorPriority } = computeIICAndCorridor(habitatPatches, distances, maxDist_m, resistance);

    const A2 = totalArea * totalArea;
    const iff_index = A2 > 0 ? parseFloat((iicSum / A2).toFixed(6)) : 0;
    const connectance_index = computeConnectance(connected, n);
    const patchProbabilities = computePatchProbabilities(habitatPatches, totalArea);
    const isolatedPatches = computeIsolatedPatches(habitatPatches, connected);

    return {
        connectance_index,
        iff_index,
        patchProbabilities,
        isolatedPatches,
        corridorPriority,
    };
}

// ================================================================
// 10. VALORACAO DE SERVICOS ECOSSISTEMICOS
// ================================================================

/**
 * Valoracao economica de servicos ecossistemicos por bioma
 * (de Groot 2012 Tabela 3, TEEB 2010).
 *
 * Valores TEEB em USD/ha/ano:
 * tropical_forest=5382, temperate_forest=3137, wetland=140174,
 * grassland=1395, coral_reef=352249, mangrove=194000, seagrass=28916.
 *
 * @param {string} landCover - Cobertura do solo (ver lista acima)
 * @param {number} area_ha - Area em hectares
 * @param {string} [ecosystem?] - Alias opcional para landCover
 * @returns {{provisioning_USD_ha_yr: number, regulating_USD_ha_yr: number, cultural_USD_ha_yr: number, supporting_USD_ha_yr: number, totalValue_USD_ha_yr: number, totalAnnualValue_USD: number}}
 */
export function ecosystemServicesValuation(
    landCover: string,
    area_ha: number,
    ecosystem?: string,
): {
    provisioning_USD_ha_yr: number;
    regulating_USD_ha_yr: number;
    cultural_USD_ha_yr: number;
    supporting_USD_ha_yr: number;
    totalValue_USD_ha_yr: number;
    totalAnnualValue_USD: number;
} {
    const cover = ecosystem || landCover;
    const values = (
        TEEB_VALUES as Record<
            string,
            { provisioning: number; regulating: number; cultural: number; supporting: number }
        >
    )[cover];

    if (!values) {
        // Cobertura desconhecida - retornar zeros com aviso via console
        console.warn('[ecorisk:warn] Cobertura de solo nao reconhecida:', cover);
        return {
            provisioning_USD_ha_yr: 0,
            regulating_USD_ha_yr: 0,
            cultural_USD_ha_yr: 0,
            supporting_USD_ha_yr: 0,
            totalValue_USD_ha_yr: 0,
            totalAnnualValue_USD: 0,
        };
    }

    const totalValue_USD_ha_yr = values.provisioning + values.regulating + values.cultural + values.supporting;
    const totalAnnualValue_USD = totalValue_USD_ha_yr * area_ha;

    return {
        provisioning_USD_ha_yr: values.provisioning,
        regulating_USD_ha_yr: values.regulating,
        cultural_USD_ha_yr: values.cultural,
        supporting_USD_ha_yr: values.supporting,
        totalValue_USD_ha_yr,
        totalAnnualValue_USD: parseFloat(totalAnnualValue_USD.toFixed(2)),
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const ecologicalRiskAdvancedMeta: AnalyticsModuleMeta = {
    name: 'ecologicalRiskAdvanced',
    description: 'ecologicalRiskAdvanced',
    category: 'analytics',
    familyTags: ['ecosystem', 'risk'],
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
