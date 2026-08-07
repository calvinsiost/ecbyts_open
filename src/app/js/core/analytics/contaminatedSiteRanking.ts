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
 * Contaminated Site Ranking - Priorização de Áreas Contaminadas
 *
 * Implements a simplified Hazard Ranking System (HRS) for prioritizing
 * contaminated sites for remediation, adapted to Brazilian regulatory context.
 *
 * Academic references:
 * - EPA (1992). Hazard Ranking System: Guidance Manual. Publication 9345.1-07FS.
 *   U.S. Environmental Protection Agency, Office of Emergency and Remedial Response.
 * - CETESB (2021). Manual de Gerenciamento de Áreas Contaminadas. 3ª ed.
 *   Companhia Ambiental do Estado de São Paulo.
 * - CONAMA Resolução 420/2009 - Critérios e valores orientadores de qualidade
 *   do solo quanto à presença de substâncias químicas.
 * - Milon, J.W. et al. (1999). Ranking contaminated sites for cleanup priority:
 *   The EPA Superfund approach. Land Economics 75(3):343-357.
 *   DOI: 10.2307/3146913
 *
 * Zero DOM/IDB/Three.js/fetch dependencies. Pure math functions only.
 *
 * @module contaminatedSiteRanking
 */

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
 * Exposure pathway score - Score de via de exposição.
 * Quantifica o potencial de exposição humana para uma via específica.
 * Baseado na estrutura HRS (EPA 1992): score = likelihood × waste × targets
 *
 * @param {object} params
 * @param {number} params.likelihoodScore  - Probabilidade de exposição (0–100)
 * @param {number} params.wasteCharScore   - Score de características do resíduo (0–100)
 * @param {number} params.targetsScore     - Score de receptores/alvos humanos (0–100)
 * @returns {number} pathwayScore - pontuação da via (0–100)
 */
function exposurePathwayScore({
    likelihoodScore,
    wasteCharScore,
    targetsScore,
}: {
    likelihoodScore: number;
    wasteCharScore: number;
    targetsScore: number;
}): number {
    const params = [likelihoodScore, wasteCharScore, targetsScore];
    if (params.some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('All scores must be finite numbers');
    }
    /** @type {Array<[string, number]>} */
    const checks: Array<[string, number]> = [
        ['likelihoodScore', likelihoodScore],
        ['wasteCharScore', wasteCharScore],
        ['targetsScore', targetsScore],
    ];
    for (const [name, val] of checks) {
        if (val < 0 || val > 100) {
            throw new RangeError(`${name} must be between 0 and 100`);
        }
    }

    // HRS: S = (likelihood * waste * targets)^(1/2) normalizado
    // Simplificação: média ponderada harmônica-geométrica dos três fatores
    const product = likelihoodScore * wasteCharScore * targetsScore;
    const score = Math.pow(product, 1 / 3); // raiz cúbica = média geométrica dos três
    return Math.min(100, score);
}

/**
 * Surface soil pathway score - Score de solo superficial.
 * Via de contato direto com solo contaminado (ingestão, contato dérmico, inalação de poeira).
 *
 * @param {number} contaminantConc  - Concentração do contaminante (mg/kg), >= 0
 * @param {number} guideline        - Valor de referência regulatório (mg/kg, VP ou VI CONAMA 420), > 0
 * @param {number} populationDensity - Densidade populacional no buffer 500m (hab/km²), >= 0
 * @returns {{ rawScore: number, normalizedScore: number }}
 */
function surfaceSoilPathwayScore(
    contaminantConc: number,
    guideline: number,
    populationDensity: number,
): { rawScore: number; normalizedScore: number } {
    const params = [contaminantConc, guideline, populationDensity];
    if (params.some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (contaminantConc < 0) throw new RangeError('contaminantConc must be >= 0');
    if (guideline <= 0) throw new RangeError('guideline must be > 0');
    if (populationDensity < 0) throw new RangeError('populationDensity must be >= 0');

    // Razão de excedência em relação ao padrão regulatório
    const exceedanceRatio = contaminantConc / guideline;

    // Score de targets: escala logarítmica da densidade populacional (0-100)
    const targetScore = populationDensity > 0 ? Math.min(100, 20 * Math.log10(1 + populationDensity)) : 0;

    // Score de concentração: proporção de excedência (saturado em 10×)
    const concScore = Math.min(100, exceedanceRatio * 10);

    // Likelihood = 100 se concentração excede guideline; 50 caso contrário
    const likelihoodScore = exceedanceRatio >= 1 ? 100 : 50;

    const rawScore = (likelihoodScore + concScore + targetScore) / 3;
    const normalizedScore = Math.min(100, rawScore);

    return { rawScore, normalizedScore };
}

/**
 * Groundwater pathway score - Score de água subterrânea.
 * Via de contaminação de aquífero e possível consumo humano.
 *
 * @param {number} plumeLengthM     - Comprimento estimado da pluma (m), >= 0
 * @param {number} depthToWaterM    - Profundidade ao nível d'água (m), > 0
 * @param {number} populationServed - População servida por poços no raio de influência, >= 0
 * @param {number} wellsCount       - Número de poços de abastecimento no raio de influência, >= 0
 * @returns {{ rawScore: number, normalizedScore: number }}
 */
function groundwaterPathwayScore(
    plumeLengthM: number,
    depthToWaterM: number,
    populationServed: number,
    wellsCount: number,
): { rawScore: number; normalizedScore: number } {
    const params = [plumeLengthM, depthToWaterM, populationServed, wellsCount];
    if (params.some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (plumeLengthM < 0) throw new RangeError('plumeLengthM must be >= 0');
    if (depthToWaterM <= 0) throw new RangeError('depthToWaterM must be > 0');
    if (populationServed < 0) throw new RangeError('populationServed must be >= 0');
    if (wellsCount < 0) throw new RangeError('wellsCount must be >= 0');

    // Likelihood: inversamente proporcional à profundidade (rasa = mais provável)
    // Normalizado: 100 para 1 m de profundidade, ~50 para 20 m
    const likelihoodScore = Math.min(100, 100 / (1 + depthToWaterM * 0.05));

    // Pluma: 100 para plumas > 500 m
    const plumeScore = Math.min(100, (plumeLengthM / 500) * 100);

    // Targets: população afetada + poços
    const targetScore = Math.min(
        100,
        (populationServed > 0 ? 20 * Math.log10(1 + populationServed) : 0) + Math.min(30, wellsCount * 5),
    );

    const rawScore = (likelihoodScore + plumeScore + targetScore) / 3;
    const normalizedScore = Math.min(100, rawScore);

    return { rawScore, normalizedScore };
}

/**
 * Vapor intrusion pathway score - Score de intrusão de vapores.
 * Via de migração de contaminantes voláteis do subsolo para ambientes fechados.
 *
 * @param {number} concMgKg          - Concentração de VOC no solo (mg/kg), >= 0
 * @param {number} depthSourceM      - Profundidade da fonte (m), > 0
 * @param {number} buildingsInRadius - Número de edifícios no raio de influência, >= 0
 * @returns {{ rawScore: number, normalizedScore: number }}
 */
function vaporIntrusionPathwayScore(
    concMgKg: number,
    depthSourceM: number,
    buildingsInRadius: number,
): { rawScore: number; normalizedScore: number } {
    const params = [concMgKg, depthSourceM, buildingsInRadius];
    if (params.some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (concMgKg < 0) throw new RangeError('concMgKg must be >= 0');
    if (depthSourceM <= 0) throw new RangeError('depthSourceM must be > 0');
    if (buildingsInRadius < 0) throw new RangeError('buildingsInRadius must be >= 0');

    // Probabilidade de vapor: maior concentração + fonte rasa = maior score
    const likelihoodScore = Math.min(
        100,
        (concMgKg > 0 ? 20 * Math.log10(1 + concMgKg) : 0) * (10 / (10 + depthSourceM)),
    );

    // Targets: edifícios com potencial de exposição indoor
    const targetScore = Math.min(100, buildingsInRadius * 10);

    // Waste: score baseado na concentração absoluta
    const wasteScore = Math.min(100, concMgKg > 0 ? 10 * Math.log10(1 + concMgKg) : 0);

    const rawScore = (likelihoodScore + wasteScore + targetScore) / 3;
    const normalizedScore = Math.min(100, rawScore);

    return { rawScore, normalizedScore };
}

/**
 * Aggregate site priority score (HRS simplified).
 * Score final agregado das três vias: solo superficial, água subterrânea, vapores.
 * HRS EPA 1992: S_site = sqrt((S1² + S2² + S3²) / 3)
 *
 * @param {number} soilScore        - Score solo superficial (0–100)
 * @param {number} groundwaterScore - Score água subterrânea (0–100)
 * @param {number} vaporScore       - Score intrusão de vapores (0–100)
 * @returns {{ siteScore: number, priority: string, pathways: object }}
 *   priority - 'high' (>= 28.5), 'medium' (>= 15), 'low' (>= 5), 'negligible' (< 5)
 *   Threshold 28.5 = NPL cutoff histórico do Superfund (EPA 1992)
 */
function aggregateSitePriorityScore(
    soilScore: number,
    groundwaterScore: number,
    vaporScore: number,
): { siteScore: number; priority: string; pathways: object } {
    const params = [soilScore, groundwaterScore, vaporScore];
    if (params.some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('All scores must be finite numbers');
    }
    /** @type {Array<[string, number]>} */
    const checks: Array<[string, number]> = [
        ['soilScore', soilScore],
        ['groundwaterScore', groundwaterScore],
        ['vaporScore', vaporScore],
    ];
    for (const [name, val] of checks) {
        if (val < 0 || val > 100) {
            throw new RangeError(`${name} must be between 0 and 100`);
        }
    }

    // HRS: raiz quadrada da média dos quadrados das vias
    const siteScore = Math.sqrt((soilScore ** 2 + groundwaterScore ** 2 + vaporScore ** 2) / 3);

    // Classificação de prioridade (CETESB 2021 adaptado)
    let priority;
    if (siteScore >= 28.5) {
        priority = 'high';
    } else if (siteScore >= 15) {
        priority = 'medium';
    } else if (siteScore >= 5) {
        priority = 'low';
    } else {
        priority = 'negligible';
    }

    return {
        siteScore,
        priority,
        pathways: { soilScore, groundwaterScore, vaporScore },
    };
}

/**
 * Rank multiple contaminated sites by priority score.
 * Ordena lista de áreas contaminadas da maior para a menor prioridade.
 *
 * @param {Array<{id: string, soilScore: number, groundwaterScore: number, vaporScore: number}>} sites
 * @returns {Array<{id: string, siteScore: number, priority: string, rank: number}>}
 */
function rankContaminatedSites(
    sites: Array<{ id: string; soilScore: number; groundwaterScore: number; vaporScore: number }>,
): Array<{ id: string; siteScore: number; priority: string; rank: number }> {
    if (!Array.isArray(sites) || sites.length === 0) {
        throw new TypeError('sites must be a non-empty array');
    }

    const scored = sites.map((site) => {
        if (!site.id || typeof site.id !== 'string') {
            throw new TypeError('Each site must have a string id');
        }
        const result = aggregateSitePriorityScore(
            site.soilScore ?? 0,
            site.groundwaterScore ?? 0,
            site.vaporScore ?? 0,
        );
        return { id: site.id, ...result };
    });

    // Ordenar por siteScore decrescente
    scored.sort((a, b) => b.siteScore - a.siteScore);

    // Adicionar ranking
    return scored.map((s, i) => ({ ...s, rank: i + 1 }));
}

export {
    exposurePathwayScore,
    surfaceSoilPathwayScore,
    groundwaterPathwayScore,
    vaporIntrusionPathwayScore,
    aggregateSitePriorityScore,
    rankContaminatedSites,
};

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const contaminatedSiteRankingMeta: AnalyticsModuleMeta = {
    name: 'contaminatedSiteRanking',
    description: 'contaminatedSiteRanking',
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
