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
 * Landfill Leachate Risk - Risco de Lixiviado de Aterro Sanitario
 *
 * References / Referencias:
 *   - ABNT NBR 8419:1992. Apresentacao de projetos de aterros sanitarios de residuos
 *     solidos urbanos. ABNT, Rio de Janeiro.
 *   - US EPA (1986). SW-846: Test Methods for Evaluating Solid Waste (Method 9080).
 *     EPA/530-SW-86-054. https://www.epa.gov/hw-sw846
 *   - Tchobanoglous, G., Theisen, H. & Vigil, S. (1993). Integrated Solid Waste Management.
 *     McGraw-Hill. ISBN 0-07-063237-5
 *   - Thornthwaite, C.W. & Mather, J.R. (1957). Instructions and tables for computing
 *     potential evapotranspiration and the water balance. Publications in Climatology,
 *     10(3):1-311. (Thornthwaite-Mather water balance method)
 *   - Ramke, H.-G. et al. (2000). Landfill leachate generation and management.
 *     Waste Management & Research 18(4). DOI: 10.1177/0734242X0001800406
 *
 * Zero DOM/IDB/Three.js/fetch dependencies - pure math module.
 * Sem dependencias de DOM/IDB/Three.js/fetch - modulo de matematica pura.
 *
 * @module landfillLeachateRisk
 */

'use strict';

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

/**
 * Leachate generation coefficient k by cover/liner type
 * Coeficiente de geracao de lixiviado k por tipo de cobertura/liner
 * (fraction of precipitation converted to leachate, Tchobanoglous 1993, Table 11-11)
 */
const K_BY_COVER: Record<string, number> = {
    compacted_clay: 0.15,
    geomembrane: 0.05,
    mixed: 0.25,
    natural_soil: 0.4,
    no_cover: 0.6,
};

/**
 * Soil permeability class for aquifer contamination risk
 * Classe de permeabilidade do solo para risco de contaminacao de aquifero
 */
const SOIL_PERMEABILITY: Record<string, number> = {
    clay: 1e-9, // m/s - very low, protective
    silty_clay: 1e-8,
    silt: 1e-6,
    sandy_silt: 1e-5,
    fine_sand: 1e-4,
    medium_sand: 1e-3,
    gravel: 1e-2, // very high, non-protective
};

/** Risk classification thresholds */
const RISK_CLASSES = [
    { label: 'low', labelPT: 'Baixo', min: 0, max: 25 },
    { label: 'medium', labelPT: 'Medio', min: 25, max: 50 },
    { label: 'high', labelPT: 'Alto', min: 50, max: 75 },
    { label: 'critical', labelPT: 'Critico', min: 75, max: Infinity },
];

/**
 * Estimate annual leachate generation using simplified Thornthwaite-Mather water balance
 * Estimativa de geracao anual de lixiviado pelo balanco hidrico de Thornthwaite-Mather
 *
 * L = k * (P - PET) * A   [when P > PET]
 * L = 0                    [when PET >= P - dry climates]
 * where P = precipitation (mm/yr), PET = potential evapotranspiration (mm/yr),
 * A = area (ha), k = leachate coefficient (dimensionless fraction)
 *
 * @param precipitationMmYr  - Annual precipitation (mm/year)
 * @param petMmYr            - Annual potential evapotranspiration (mm/year)
 * @param areaHa             - Landfill area (hectares)
 * @param coverType - Cover material type (see K_BY_COVER)
 * @returns
 * @throws {RangeError} on invalid inputs
 * @throws {TypeError} on unknown cover type
 */
export function leachateGeneration(
    precipitationMmYr: number,
    petMmYr: number,
    areaHa: number,
    coverType: string = 'compacted_clay',
): { leachateM3Yr: number; surplusMmYr: number; kCoefficient: number } {
    if (precipitationMmYr < 0) throw new RangeError('precipitationMmYr deve ser >= 0');
    if (petMmYr < 0) throw new RangeError('petMmYr deve ser >= 0');
    if (areaHa <= 0) throw new RangeError('areaHa deve ser > 0');
    if (!(coverType in K_BY_COVER)) {
        throw new TypeError(`coverType desconhecido: "${coverType}". Validos: ${Object.keys(K_BY_COVER).join(', ')}`);
    }
    const k = K_BY_COVER[coverType]!;
    // Surplus hidrico (mm/yr) - excesso de chuva sobre evapotranspiracao potencial
    const surplusMmYr = Math.max(0, precipitationMmYr - petMmYr);
    // Conversao: mm/yr * ha = m3/yr (1 mm * 1 ha = 10 m3)
    const leachateM3Yr = k * surplusMmYr * areaHa * 10;
    return { leachateM3Yr, surplusMmYr, kCoefficient: k };
}

/**
 * Compute organic pollution index from BOD/COD ratio
 * Indice de poluicao organica pela relacao DBO/DQO
 *
 * DBO/DQO ratio indicates leachate treatability:
 *   > 0.5 → easily biodegradable (young, fresh leachate)
 *   0.1–0.5 → partially stabilized
 *   < 0.1  → stabilized, refractory (old leachate)
 *
 * @param bod - Biochemical Oxygen Demand / DBO (mg/L)
 * @param cod - Chemical Oxygen Demand / DQO (mg/L)
 * @returns
 * @throws {RangeError} if inputs are non-positive
 */
export function organicPollutionIndex(
    bod: number,
    cod: number,
): { ratio: number; classification: string; classificationPT: string } {
    if (bod < 0) throw new RangeError('DBO deve ser >= 0 mg/L');
    if (cod <= 0) throw new RangeError('DQO deve ser > 0 mg/L');
    if (bod > cod) throw new RangeError('DBO nao pode exceder DQO');
    const ratio = bod / cod;
    let classification: string, classificationPT: string;
    if (ratio > 0.5) {
        classification = 'easily_biodegradable';
        classificationPT = 'Facilmente Biodegradavel';
    } else if (ratio >= 0.1) {
        classification = 'partially_stabilized';
        classificationPT = 'Parcialmente Estabilizado';
    } else {
        classification = 'stabilized_refractory';
        classificationPT = 'Estabilizado / Refratario';
    }
    return { ratio, classification, classificationPT };
}

/**
 * Estimate aquifer contamination risk score from distance and soil type
 * Estimativa do score de risco de contaminacao de aquifero por distancia e solo
 *
 * Risk score [0–100] based on:
 *   - Distance to nearest water body/aquifer recharge zone (m)
 *   - Soil hydraulic conductivity (K, m/s)
 *   - Leachate volume (m3/yr)
 *
 * @param distanceM       - Distance to nearest water resource (m)
 * @param soilType        - Soil type key (see SOIL_PERMEABILITY)
 * @param leachateM3Yr    - Annual leachate generation (m3/year)
 * @returns
 * @throws {RangeError} on invalid inputs
 * @throws {TypeError} on unknown soil type
 */
export function aquiferContaminationScore(
    distanceM: number,
    soilType: string,
    leachateM3Yr: number,
): { score: number; permeabilityMs: number } {
    if (distanceM < 0) throw new RangeError('distanceM deve ser >= 0');
    if (leachateM3Yr < 0) throw new RangeError('leachateM3Yr deve ser >= 0');
    if (!(soilType in SOIL_PERMEABILITY)) {
        throw new TypeError(
            `soilType desconhecido: "${soilType}". Validos: ${Object.keys(SOIL_PERMEABILITY).join(', ')}`,
        );
    }
    const K = SOIL_PERMEABILITY[soilType]!;
    // Normalize hydraulic conductivity to 0-1 scale (log space)
    // Normaliza condutividade hidraulica em escala 0-1 (espaco logaritmico)
    const logKMin = Math.log10(1e-9);
    const logKMax = Math.log10(1e-2);
    const permScore = (Math.log10(K) - logKMin) / (logKMax - logKMin); // 0 = protective, 1 = permeable

    // Distance factor: 0 = far (>1000m), 1 = adjacent (<10m)
    // Fator distancia: 0 = distante (>1000m), 1 = adjacente (<10m)
    const distFactor = Math.max(0, 1 - distanceM / 1000);

    // Volume factor: normalized against 10000 m3/yr reference
    // Fator volume: normalizado em relacao a referencia de 10000 m3/ano
    const volFactor = Math.min(1, leachateM3Yr / 10_000);

    // Composite score: weighted geometric mean (permeability dominates)
    // Score composto: media ponderada - permeabilidade tem peso maior
    const score = Math.min(100, (0.5 * permScore + 0.3 * distFactor + 0.2 * volFactor) * 100);
    return { score, permeabilityMs: K };
}

/**
 * Classify leachate risk level - Classificar nivel de risco do lixiviado
 *
 * @param score - Risk score [0–100]
 * @returns
 * @throws {RangeError} if score is outside [0, 100]
 */
export function classifyLeachateRisk(score: number): { label: string; labelPT: string } {
    if (score < 0 || score > 100) throw new RangeError('score deve estar entre 0 e 100');
    const cls = RISK_CLASSES.find((c) => score >= c.min && score < c.max) || RISK_CLASSES[RISK_CLASSES.length - 1]!;
    return { label: cls.label, labelPT: cls.labelPT };
}

/**
 * Full landfill leachate risk assessment - Avaliacao completa de risco de lixiviado
 *
 * @param params
 * @returns
 */
export function landfillRiskAssessment({
    precipitationMmYr,
    petMmYr,
    areaHa,
    coverType = 'compacted_clay',
    bod,
    cod,
    distanceM,
    soilType,
}: {
    precipitationMmYr: number;
    petMmYr: number;
    areaHa: number;
    coverType?: string;
    bod: number;
    cod: number;
    distanceM: number;
    soilType: string;
}): { generation: object; organicIndex: object; aquiferScore: object; riskClass: object } {
    const generation = leachateGeneration(precipitationMmYr, petMmYr, areaHa, coverType);
    const organicIndex = organicPollutionIndex(bod, cod);
    const aquiferScore = aquiferContaminationScore(distanceM, soilType, generation.leachateM3Yr);
    const riskClass = classifyLeachateRisk(aquiferScore.score);
    return { generation, organicIndex, aquiferScore, riskClass };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const landfillLeachateRiskMeta: AnalyticsModuleMeta = {
    name: 'landfillLeachateRisk',
    description: 'landfillLeachateRisk',
    category: 'analytics',
    familyTags: ['risk', 'landfill'],
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
