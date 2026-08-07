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
 * Wetland Ecosystem Services - Serviços ecossistêmicos de zonas úmidas
 *
 * Quantifies key provisioning, regulating, and supporting ecosystem services
 * provided by wetlands based on established ecological frameworks.
 *
 * Academic references:
 * - Costanza, R. et al. (1997). The value of the world's ecosystem services and
 *   natural capital. Nature 387:253-260. DOI: 10.1038/387253a0
 * - Zedler, J.B. & Kercher, S. (2005). Wetland resources: status, trends, ecosystem
 *   services, and restorability. Annual Review of Environment and Resources 30:39-74.
 *   DOI: 10.1146/annurev.energy.30.050504.144248
 * - Mitsch, W.J. & Gosselink, J.G. (2015). Wetlands (5th ed.). Wiley. ISBN 978-1-118-67682-0
 * - Shannon, C.E. (1948). A mathematical theory of communication. Bell System Technical
 *   Journal 27:379-423. DOI: 10.1002/j.1538-7305.1948.tb01338.x
 * - Kayranli, B. et al. (2010). Carbon storage and fluxes within freshwater wetlands:
 *   a critical review. Wetlands 30(1):111-124. DOI: 10.1007/s13157-009-0003-4
 *
 * Zero DOM/IDB/Three.js/fetch dependencies. Pure math functions only.
 *
 * @module wetlandEcosystemServices
 */

/**
 * Carbon sequestration value - Valor de sequestro de carbono.
 * Baseado na taxa de acumulação de carbono de Mitsch & Gosselink (2015)
 * e no preço de mercado de carbono (USD/tCO2).
 *
 * Taxas típicas de sequestro (gC/m²/ano):
 *  Pantanal/várzeas tropicais: 100–300 gC/m²/ano
 *  Turfeiras temperadas: 20–80 gC/m²/ano
 *
 * @param {number} areaHa           - Área da zona úmida (ha), > 0
 * @param {number} sequestRateGCm2yr - Taxa de sequestro (gC/m²/ano), > 0
 * @param {number} carbonPriceUSD   - Preço do carbono (USD/tCO2), > 0
 * @returns {{ tCO2perYear: number, valueUSDperYear: number }}
 */
function carbonSequestrationValue(areaHa: any, sequestRateGCm2yr: any, carbonPriceUSD: any) {
    if ([areaHa, sequestRateGCm2yr, carbonPriceUSD].some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (areaHa <= 0) throw new RangeError('areaHa must be > 0');
    if (sequestRateGCm2yr <= 0) throw new RangeError('sequestRateGCm2yr must be > 0');
    if (carbonPriceUSD <= 0) throw new RangeError('carbonPriceUSD must be > 0');

    // Converte: gC/m²/ano → tCO2/ha/ano
    // 1 gC = 3.664 gCO2; 1 m² = 0.0001 ha → gC/m²/ano * 10000 m²/ha / 1e6 * 3.664 = tCO2/ha/ano
    const tCO2perHaPerYear = ((sequestRateGCm2yr * 10000) / 1e6) * 3.664;
    const tCO2perYear = tCO2perHaPerYear * areaHa;
    const valueUSDperYear = tCO2perYear * carbonPriceUSD;

    return { tCO2perYear, valueUSDperYear };
}

/**
 * Nutrient filtration capacity - Capacidade de filtragem de nutrientes (N e P).
 * Baseado em taxas de remoção reportadas em Mitsch & Gosselink (2015) cap. 18.
 * Taxa típica: N 10–80 g/m²/ano; P 1–10 g/m²/ano em wetlands construídas.
 *
 * @param {number} areaHa         - Área (ha), > 0
 * @param {number} inflowNMgL     - Concentração de N na entrada (mg/L), >= 0
 * @param {number} outflowNMgL    - Concentração de N na saída (mg/L), >= 0
 * @param {number} inflowPMgL     - Concentração de P na entrada (mg/L), >= 0
 * @param {number} outflowPMgL    - Concentração de P na saída (mg/L), >= 0
 * @param {number} flowRateM3day  - Vazão volumétrica (m³/dia), > 0
 * @returns {{ removalN_kgPerDay: number, removalP_kgPerDay: number,
 *             efficiencyN_pct: number, efficiencyP_pct: number }}
 */
function nutrientFiltrationCapacity(areaHa: any, inflowNMgL: any, outflowNMgL: any, inflowPMgL: any, outflowPMgL: any, flowRateM3day: any) {
    const params = [areaHa, inflowNMgL, outflowNMgL, inflowPMgL, outflowPMgL, flowRateM3day];
    if (params.some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (areaHa <= 0) throw new RangeError('areaHa must be > 0');
    if (flowRateM3day <= 0) throw new RangeError('flowRateM3day must be > 0');
    if (inflowNMgL < 0 || outflowNMgL < 0 || inflowPMgL < 0 || outflowPMgL < 0) {
        throw new RangeError('Concentration values must be >= 0');
    }

    // Remoção: (Cin - Cout) * Q - mg/L * m³/dia = g/dia; /1000 = kg/dia
    const removalN_kgPerDay = (Math.max(0, inflowNMgL - outflowNMgL) * flowRateM3day) / 1000;
    const removalP_kgPerDay = (Math.max(0, inflowPMgL - outflowPMgL) * flowRateM3day) / 1000;

    // Eficiência de remoção (%)
    const efficiencyN_pct = inflowNMgL > 0 ? Math.min(100, Math.max(0, (1 - outflowNMgL / inflowNMgL) * 100)) : 0;
    const efficiencyP_pct = inflowPMgL > 0 ? Math.min(100, Math.max(0, (1 - outflowPMgL / inflowPMgL) * 100)) : 0;

    return { removalN_kgPerDay, removalP_kgPerDay, efficiencyN_pct, efficiencyP_pct };
}

/**
 * Shannon-Wiener biodiversity index (H') - Índice de Shannon para biodiversidade.
 * Shannon (1948): H' = -sum(pi * ln(pi))
 * Mede a diversidade de espécies em uma comunidade de wetland.
 *
 * @param {number[]} speciesCounts - Contagem de indivíduos por espécie (inteiros >= 0)
 * @returns {{ H: number, richness: number, evenness: number }}
 *   H        - índice de Shannon (nat)
 *   richness - riqueza (número de espécies presentes)
 *   evenness - equitabilidade de Pielou (J' = H / ln(S))
 */
function shannonBiodiversityIndex(speciesCounts: any) {
    if (!Array.isArray(speciesCounts) || speciesCounts.length === 0) {
        throw new TypeError('speciesCounts must be a non-empty array');
    }

    for (const c of speciesCounts) {
        if (typeof c !== 'number' || !isFinite(c) || c < 0) {
            throw new TypeError('Each species count must be a non-negative finite number');
        }
    }

    const total = speciesCounts.reduce((sum, c) => sum + c, 0);
    if (total === 0) {
        throw new RangeError('Total species count must be > 0');
    }

    const richness = speciesCounts.filter((c) => c > 0).length;

    let H = 0;
    for (const c of speciesCounts) {
        if (c === 0) continue;
        const pi = c / total;
        H -= pi * Math.log(pi); // log natural (nats)
    }

    // Equitabilidade de Pielou: J' = H / ln(S)
    const evenness = richness > 1 ? H / Math.log(richness) : richness === 1 ? 1 : 0;

    return { H, richness, evenness };
}

/**
 * Flood buffering service - Serviço hídrico de amortecimento de cheias.
 * Estimativa simplificada da capacidade de retenção de volume de cheia
 * por zona úmida baseada em Zedler & Kercher (2005).
 *
 * @param {number} areaHa          - Área da zona úmida (ha), > 0
 * @param {number} storageDepthM   - Profundidade média de armazenamento (m), > 0
 * @param {number} fillRatioFrac   - Fração atual de preenchimento (0–1), 0 = vazia
 * @returns {{ maxStorageM3: number, availableStorageM3: number,
 *             floodReductionPct: number }}
 */
function floodBufferingService(areaHa: any, storageDepthM: any, fillRatioFrac: any) {
    if ([areaHa, storageDepthM, fillRatioFrac].some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (areaHa <= 0) throw new RangeError('areaHa must be > 0');
    if (storageDepthM <= 0) throw new RangeError('storageDepthM must be > 0');
    if (fillRatioFrac < 0 || fillRatioFrac > 1) {
        throw new RangeError('fillRatioFrac must be between 0 and 1');
    }

    // Capacidade máxima: área (m²) × profundidade (m)
    const areaM2 = areaHa * 10000;
    const maxStorageM3 = areaM2 * storageDepthM;
    const availableStorageM3 = maxStorageM3 * (1 - fillRatioFrac);

    // Redução de cheia estimada proporcional à capacidade disponível (serviço hídrico %)
    // Simplificação: serviço proporcional à fração disponível vs capacidade total
    const floodReductionPct = (availableStorageM3 / maxStorageM3) * 100;

    return { maxStorageM3, availableStorageM3, floodReductionPct };
}

/**
 * Aggregate wetland ecosystem service score (0–100).
 * Pondera os 4 serviços em um índice composto (Costanza 1997 framework).
 * Pesos padrão: carbono 25%, nutrientes 25%, biodiversidade 25%, hidrologia 25%.
 *
 * @param {object} params
 * @param {number} params.carbonNormalized      - Valor de carbono normalizado (0–1)
 * @param {number} params.nutrientNormalized    - Eficiência de nutrientes normalizada (0–1)
 * @param {number} params.biodiversityNormalized- Índice de Shannon normalizado (0–1)
 * @param {number} params.floodNormalized       - Serviço hídrico normalizado (0–1)
 * @param {number[]} [params.weights]           - Pesos [carbono, nutrientes, bio, hidrologia] (soma = 1)
 * @returns {{ score: number, grade: string }}
 */
function aggregateEcosystemServiceScore({
    carbonNormalized,
    nutrientNormalized,
    biodiversityNormalized,
    floodNormalized,
    weights = [0.25, 0.25, 0.25, 0.25]
}: any) {
    const values = [carbonNormalized, nutrientNormalized, biodiversityNormalized, floodNormalized];

    if (values.some((v) => typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1)) {
        throw new RangeError('All normalized values must be finite numbers between 0 and 1');
    }
    if (!Array.isArray(weights) || weights.length !== 4) {
        throw new TypeError('weights must be an array of 4 numbers');
    }
    const weightSum = weights.reduce((s, w) => s + w, 0);
    if (Math.abs(weightSum - 1.0) > 1e-6) {
        throw new RangeError('weights must sum to 1.0');
    }

    const score = values.reduce((s, v, i) => s + v * weights[i], 0) * 100;

    let grade;
    if (score >= 75) grade = 'excellent';
    else if (score >= 50) grade = 'good';
    else if (score >= 25) grade = 'fair';
    else grade = 'poor';

    return { score, grade };
}

export {
    carbonSequestrationValue,
    nutrientFiltrationCapacity,
    shannonBiodiversityIndex,
    floodBufferingService,
    aggregateEcosystemServiceScore,
};

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const wetlandEcosystemServicesMeta = {
    name: 'wetlandEcosystemServices',
    description: 'wetlandEcosystemServices',
    category: 'analytics',
    familyTags: ['ecosystem', 'wetland'],
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
