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
 * Nuclear Facility Risk Assessment Module
 *
 * Avaliação de risco de instalações nucleares e radiológicas com base em:
 * - IAEA SSR-1:2012 - Safety of Nuclear Power Plants: Design
 * - NUREG-1150 - Severe Accident Risks: An Assessment for Five US Nuclear Power Plants
 * - ABNT NBR ISO 11929:2012 - Determination of characteristic limits
 * - IAEA TECDOC-727 - Probabilistic Safety Assessment for Seismic Events
 *
 * References:
 * - IAEA SSR-1 (2012): https://www.iaea.org/publications/8671
 * - NUREG-1150 (1990): https://www.nrc.gov/reading-rm/doc-collections/nuregs/staff/sr1150/
 * - ISO 11929:2012: https://www.iso.org/standard/56901.html
 * - Falkenmark & Widstrand (1992): doi:10.1080/02508069208686229
 *
 * @module nuclearFacilityRiskAssessment
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Dose limits (mSv/year) from ICRP Publication 103 (2007) and Brazilian CNEN NE 3.01
 * Limites de dose em mSv/ano conforme ICRP 103 e CNEN NE 3.01
 */
const DOSE_LIMITS_MSV = {
    occupational: 20, // trabalhadores ocupacionalmente expostos
    public: 1, // público em geral
    emergency_actionLevel: 100, // nível de ação em emergência
};

/**
 * Emergency Planning Zone radii (km) for PWR/BWR, IAEA EPR-2003
 * Raios de zona de planejamento de emergência em km
 */
const EPZ_RADII_KM = {
    IPZ: 0.3, // Inner Planning Zone — zona de ação imediata
    PAZ: 3, // Precautionary Action Zone
    UPZ: 15, // Urgent Protective Action Zone
    LPZ: 50, // Long-term Protective Action Zone (iodine thyroid blocking)
};

/**
 * Risk classification thresholds (probability per reactor-year)
 * Limites de classificação de risco (probabilidade por ano-reator)
 */
const RISK_THRESHOLDS = {
    negligible: 1e-7, // risco negligível (abaixo de 1 em 10 milhões por ano)
    acceptable: 1e-6, // risco aceitável (IAEA SSG-3)
    tolerable: 1e-5, // risco tolerável (necessita medidas de controle)
    intolerable: 1e-4, // risco intolerável (necessita ação imediata)
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validates that a value is a finite positive number.
 * Valida que o valor é um número finito positivo.
 * @param {*} v
 * @param {string} name
 */
function requirePositive(v: any, name: any) {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
        throw new RangeError(`${name} must be a finite positive number, got: ${v}`);
    }
}

/**
 * Validates that a value is between 0 and 1 inclusive.
 * Valida que o valor está entre 0 e 1.
 * @param {*} v
 * @param {string} name
 */
function requireProbability(v: any, name: any) {
    if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1) {
        throw new RangeError(`${name} must be a probability [0, 1], got: ${v}`);
    }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Calculates collective effective dose (person-Sv) for a population around a nuclear facility.
 * Calcula a dose efetiva coletiva (person-Sv) para população ao redor de instalação nuclear.
 *
 * Dose coletiva = soma(dose_individual × número_de_pessoas) por setor/anel de distância.
 * Método conforme IAEA Safety Reports Series No. 19 (1999).
 *
 * @param {Array<{distanceKm: number, population: number, doseRateMsvPerH: number, exposureHours: number}>} sectors
 * @returns {{ collectiveDosePSv: number, maxIndividualMsv: number, populationTotal: number }}
 */
export function calculateCollectiveDose(sectors: any) {
    if (!Array.isArray(sectors) || sectors.length === 0) {
        throw new TypeError('sectors must be a non-empty array');
    }

    let collectiveDoseMsv = 0;
    let maxIndividualMsv = 0;
    let populationTotal = 0;

    for (const s of sectors) {
        requirePositive(s.distanceKm, 'distanceKm');
        if (typeof s.population !== 'number' || !isFinite(s.population) || s.population < 0) {
            throw new RangeError('population must be a non-negative finite number');
        }
        requirePositive(s.doseRateMsvPerH, 'doseRateMsvPerH');
        requirePositive(s.exposureHours, 'exposureHours');

        // dose individual recebida por uma pessoa no setor (mSv)
        const individualMsv = s.doseRateMsvPerH * s.exposureHours;
        collectiveDoseMsv += individualMsv * s.population;
        if (individualMsv > maxIndividualMsv) maxIndividualMsv = individualMsv;
        populationTotal += s.population;
    }

    // converter mSv·pessoa → Sv·pessoa (person-Sv)
    const collectiveDosePSv = collectiveDoseMsv / 1000;

    return {
        collectiveDosePSv,
        maxIndividualMsv,
        populationTotal,
    };
}

/**
 * Computes simplified Probabilistic Safety Assessment (PSA) risk index.
 * Calcula índice de risco radiológico baseado em PSA simplificado (NUREG-1150 Tier 1).
 *
 * CDF (Core Damage Frequency) = initiating event frequency × product of barrier failure probabilities.
 * Índice de risco = CDF × consequência normalizada.
 *
 * @param {number} initiatingEventFreqPerYear - Frequência do evento iniciante (eventos/ano)
 * @param {number[]} barrierFailureProbabilities - Probabilidades de falha das barreiras [0,1]
 * @param {number} releaseConsequenceSv - Dose representativa em caso de liberação (Sv)
 * @returns {{ cdf: number, riskIndex: number, riskClass: string }}
 */
export function computePsaRiskIndex(initiatingEventFreqPerYear: any, barrierFailureProbabilities: any, releaseConsequenceSv: any) {
    requirePositive(initiatingEventFreqPerYear, 'initiatingEventFreqPerYear');
    if (!Array.isArray(barrierFailureProbabilities) || barrierFailureProbabilities.length === 0) {
        throw new TypeError('barrierFailureProbabilities must be a non-empty array');
    }
    barrierFailureProbabilities.forEach((p, i) => requireProbability(p, `barrierFailureProbabilities[${i}]`));
    requirePositive(releaseConsequenceSv, 'releaseConsequenceSv');

    // CDF = frequência do evento iniciante × produto das probabilidades de falha das barreiras
    const barrierProduct = barrierFailureProbabilities.reduce((acc, p) => acc * p, 1);
    const cdf = initiatingEventFreqPerYear * barrierProduct;

    // Índice de risco = CDF × dose de consequência normalizada (Sv → escala adimensional)
    const riskIndex = cdf * releaseConsequenceSv;

    // Classificação baseada no CDF (IAEA SSG-3 / NUREG-1150 thresholds)
    let riskClass;
    if (cdf < RISK_THRESHOLDS.negligible) riskClass = 'negligible';
    else if (cdf < RISK_THRESHOLDS.acceptable) riskClass = 'acceptable';
    else if (cdf < RISK_THRESHOLDS.tolerable) riskClass = 'tolerable';
    else if (cdf < RISK_THRESHOLDS.intolerable) riskClass = 'intolerable';
    else riskClass = 'unacceptable';

    return { cdf, riskIndex, riskClass };
}

/**
 * Determines Emergency Planning Zone (EPZ) for a nuclear facility.
 * Determina as Zonas de Planejamento de Emergência (EPZ/IPZ) conforme IAEA EPR-2003.
 *
 * A zona de ação imediata (PAZ) é ajustada pela potência térmica e pelo fator de contenção.
 *
 * @param {number} thermalPowerMWth - Potência térmica da instalação (MWth)
 * @param {number} containmentFactor - Fator de contenção [0,1] (0=sem contenção, 1=contenção perfeita)
 * @param {'NPP'|'research'|'radiological'} facilityType - Tipo de instalação
 * @returns {{ IPZ_km: number, PAZ_km: number, UPZ_km: number, LPZ_km: number }}
 */
export function determineEmergencyPlanningZones(thermalPowerMWth: any, containmentFactor: any, facilityType: any) {
    requirePositive(thermalPowerMWth, 'thermalPowerMWth');
    requireProbability(containmentFactor, 'containmentFactor');
    const validTypes = ['NPP', 'research', 'radiological'];
    if (!validTypes.includes(facilityType)) {
        throw new TypeError(`facilityType must be one of: ${validTypes.join(', ')}`);
    }

    // Fator de escala baseado na potência térmica relativa a uma usina de referência (3000 MWth)
    // Scale factor based on thermal power relative to a reference plant (3000 MWth)
    const referencePower = facilityType === 'NPP' ? 3000 : facilityType === 'research' ? 100 : 10;
    const powerScaleFactor = Math.pow(thermalPowerMWth / referencePower, 1 / 3);

    // Fator de contenção reduz a zona necessária (melhor contenção → zona menor)
    const containmentReduction = 1 - 0.5 * containmentFactor;

    const scale = powerScaleFactor * containmentReduction;

    return {
        IPZ_km: Math.max(EPZ_RADII_KM.IPZ * scale, EPZ_RADII_KM.IPZ),
        PAZ_km: Math.max(EPZ_RADII_KM.PAZ * scale, EPZ_RADII_KM.IPZ),
        UPZ_km: Math.max(EPZ_RADII_KM.UPZ * scale, EPZ_RADII_KM.PAZ),
        LPZ_km: Math.max(EPZ_RADII_KM.LPZ * scale, EPZ_RADII_KM.UPZ),
    };
}

/**
 * Classifies radiological dose against regulatory limits.
 * Classifica dose radiológica em relação aos limites regulatórios (CNEN NE 3.01 / ICRP 103).
 *
 * @param {number} doseMsv - Dose recebida (mSv)
 * @param {'occupational'|'public'|'emergency'} exposureType - Tipo de exposição
 * @returns {{ doseMsv: number, limitMsv: number, ratio: number, compliance: string }}
 */
export function classifyDoseCompliance(doseMsv: any, exposureType: any) {
    if (typeof doseMsv !== 'number' || !isFinite(doseMsv) || doseMsv < 0) {
        throw new RangeError('doseMsv must be a non-negative finite number');
    }
    const limitMap = {
        occupational: DOSE_LIMITS_MSV.occupational,
        public: DOSE_LIMITS_MSV.public,
        emergency: DOSE_LIMITS_MSV.emergency_actionLevel,
    };
    if (!limitMap[exposureType as keyof typeof limitMap]) {
        throw new TypeError(`exposureType must be one of: ${Object.keys(limitMap).join(', ')}`);
    }

    const limitMsv = limitMap[exposureType as keyof typeof limitMap];
    const ratio = doseMsv / limitMsv;

    let compliance;
    if (ratio <= 0.1)
        compliance = 'ALARA_optimal'; // As Low As Reasonably Achievable
    else if (ratio <= 0.5) compliance = 'ALARA_good';
    else if (ratio <= 1.0) compliance = 'within_limit';
    else if (ratio <= 2.0) compliance = 'exceeded_investigate';
    else compliance = 'exceeded_action_required';

    return { doseMsv, limitMsv, ratio, compliance };
}

/**
 * Computes initiating event frequency using fault tree minimal cut sets.
 * Calcula a frequência de evento iniciante usando conjuntos mínimos de corte (árvore de falhas).
 *
 * Método: para cada cut set, o produto das taxas de falha dos componentes é somado.
 * Resultado em eventos por ano (Upper Bound Approximation - NUREG-1150 Appendix C).
 *
 * @param {Array<Array<{componentId: string, failureRatePerYear: number}>>} cutSets - Array de cut sets
 * @returns {{ frequencyPerYear: number, dominantCutSet: string[], cutSetContributions: Array<{componentIds: string[], frequencyContribution: number}> }}
 */
export function computeInitiatingEventFrequency(cutSets: any) {
    if (!Array.isArray(cutSets) || cutSets.length === 0) {
        throw new TypeError('cutSets must be a non-empty array of arrays');
    }

    const contributions = cutSets.map((cutSet, idx) => {
        if (!Array.isArray(cutSet) || cutSet.length === 0) {
            throw new TypeError(`cutSets[${idx}] must be a non-empty array`);
        }
        // produto das taxas de falha no cut set
        const freq = cutSet.reduce((acc, comp) => {
            requirePositive(comp.failureRatePerYear, `component.failureRatePerYear in cutSets[${idx}]`);
            return acc * comp.failureRatePerYear;
        }, 1);
        return { idx, freq, componentIds: cutSet.map((c) => c.componentId) };
    });

    // Upper Bound: soma das frequências de todos os cut sets (conservative)
    const frequencyPerYear = contributions.reduce((acc, c) => acc + c.freq, 0);

    // Cut set dominante: o de maior contribuição
    const dominant = contributions.reduce((a, b) => (a.freq > b.freq ? a : b));

    return {
        frequencyPerYear,
        dominantCutSet: dominant.componentIds,
        cutSetContributions: contributions.map((c) => ({
            componentIds: c.componentIds,
            frequencyContribution: c.freq,
        })),
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const nuclearFacilityRiskAssessmentMeta = {
    name: 'nuclearFacilityRiskAssessment',
    description: 'nuclearFacilityRiskAssessment',
    category: 'analytics',
    familyTags: ['radiation', 'risk'],
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
