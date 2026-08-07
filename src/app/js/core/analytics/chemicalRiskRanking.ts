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
// Application: EHS & Mining - Chemical Risk Ranking
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Chemical Risk Ranking - PBT Framework and Substance Prioritization
 *
 * Módulo puro para ranqueamento de risco de substâncias químicas baseado no
 * framework PBT (Persistência, Bioacumulação, Toxicidade) da ECHA e no
 * Regulamento REACH. Calcula scores de perigo e exposição, gera índice RRS e
 * ordena substâncias por prioridade de gestão de risco.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - ECHA (2008). Guidance on Information Requirements and Chemical Safety
 *     Assessment. Chapter R.11: PBT Assessment. European Chemicals Agency,
 *     Helsinki. ECHA-2008-GF-08-EN.
 *     (PBT scoring framework: persistence, bioaccumulation, toxicity)
 *   - European Commission (2006). Regulation (EC) No 1907/2006 (REACH).
 *     Official Journal of the European Union, L 396, 1–849.
 *     (Use category weights for exposure assessment)
 *   - US EPA (2019). TSCA Risk Evaluation - Systematic Review.
 *     EPA-740-D1-8001. Washington, DC: US EPA.
 *     (Exposure score normalization and risk ranking methodology)
 *
 * @module chemicalRiskRanking
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
 * Use category weights for exposure assessment (REACH Annex II)
 * Pesos por categoria de uso (maior = exposição humana/ambiental mais relevante)
 */
const USE_CATEGORY_WEIGHTS: Record<string, number> = {
    industrial: 0.3,
    professional: 0.6,
    consumer: 1.0,
};

/**
 * Compute Hazard Score - PBT Framework (ECHA 2008)
 * Calcula o score de perigo pelo produto normalizado de P × B × T.
 *
 * Formula: HS = P × B × T (product of normalized [0,1] scores)
 * Categories: PBT (HS>0.5), potential_PBT (HS>0.2), non_PBT (HS≤0.2)
 *
 * @param persistence_score      - Persistence score (P) [0, 1]
 * @param bioaccumulation_score  - Bioaccumulation score (B) [0, 1]
 * @param toxicity_score         - Toxicity score (T) [0, 1]
 */
export function computeHazardScore(
    persistence_score: number,
    bioaccumulation_score: number,
    toxicity_score: number,
): { hazardScore: number; pbtCategory: 'non_PBT' | 'potential_PBT' | 'PBT' } {
    const inputs = { persistence_score, bioaccumulation_score, toxicity_score };
    for (const [key, val] of Object.entries(inputs)) {
        if (typeof val !== 'number' || val < 0 || val > 1) {
            throw new RangeError(`${key} must be a number in range [0, 1]`);
        }
    }

    // Produto PBT: multiplica os três fatores normalizados
    const hazardScore = persistence_score * bioaccumulation_score * toxicity_score;

    let pbtCategory: 'non_PBT' | 'potential_PBT' | 'PBT';
    if (hazardScore > 0.5) pbtCategory = 'PBT';
    else if (hazardScore > 0.2) pbtCategory = 'potential_PBT';
    else pbtCategory = 'non_PBT';

    return { hazardScore, pbtCategory };
}

/**
 * Compute Exposure Score - REACH Use Category Framework
 * Calcula o score de exposição baseado em volume de produção, categoria de uso e taxa de liberação.
 *
 * Formula: ES_raw = log10(volume) × useCategoryWeight × releaseRate
 * Normalized to [0, 1] via theoretical max (log10(1e9) × 1.0 × 1.0 ≈ 9).
 *
 * @param productionVolume_t_yr - Annual production/import volume (t/yr); >0
 * @param useCategory - Intended use category
 * @param releaseRate           - Fraction released to environment [0, 1]
 */
export function computeExposureScore(
    productionVolume_t_yr: number,
    useCategory: 'industrial' | 'professional' | 'consumer',
    releaseRate: number,
): { exposureScore: number } {
    if (typeof productionVolume_t_yr !== 'number' || productionVolume_t_yr <= 0) {
        throw new RangeError('productionVolume_t_yr must be a positive number');
    }
    if (!Object.prototype.hasOwnProperty.call(USE_CATEGORY_WEIGHTS, useCategory)) {
        throw new TypeError(`useCategory must be one of: ${Object.keys(USE_CATEGORY_WEIGHTS).join(', ')}`);
    }
    if (typeof releaseRate !== 'number' || releaseRate < 0 || releaseRate > 1) {
        throw new RangeError('releaseRate must be in range [0, 1]');
    }

    const useCategoryWeight = USE_CATEGORY_WEIGHTS[useCategory]!;

    // Score bruto: log10(volume) × peso de categoria × taxa de liberação
    const raw = Math.log10(productionVolume_t_yr) * useCategoryWeight * releaseRate;

    // Máximo teórico: log10(1e9) × 1.0 × 1.0 = 9 → normaliza para [0,1]
    const MAX_THEORETICAL = Math.log10(1e9) * 1.0 * 1.0;
    const exposureScore = Math.min(1, Math.max(0, raw / MAX_THEORETICAL));

    return { exposureScore };
}

/**
 * Compute Risk Ranking Score - Geometric Mean of Hazard and Exposure
 * Calcula o score de ranqueamento de risco (RRS) pela média geométrica.
 *
 * Formula: RRS = sqrt(HS × ES)
 * Priority: very_high (≥0.6), high (≥0.3), medium (≥0.1), low (<0.1)
 *
 * @param hazardScore   - Hazard score from computeHazardScore [0, 1]
 * @param exposureScore - Exposure score from computeExposureScore [0, 1]
 */
export function computeRiskRankingScore(
    hazardScore: number,
    exposureScore: number,
): { rrs: number; priority: 'low' | 'medium' | 'high' | 'very_high' } {
    if (typeof hazardScore !== 'number' || hazardScore < 0 || hazardScore > 1) {
        throw new RangeError('hazardScore must be a number in range [0, 1]');
    }
    if (typeof exposureScore !== 'number' || exposureScore < 0 || exposureScore > 1) {
        throw new RangeError('exposureScore must be a number in range [0, 1]');
    }

    // Média geométrica: RRS = sqrt(HS × ES)
    const rrs = Math.sqrt(hazardScore * exposureScore);

    let priority: 'low' | 'medium' | 'high' | 'very_high';
    if (rrs >= 0.6) priority = 'very_high';
    else if (rrs >= 0.3) priority = 'high';
    else if (rrs >= 0.1) priority = 'medium';
    else priority = 'low';

    return { rrs, priority };
}

/**
 * Rank Chemicals by Risk Priority
 * Ordena uma lista de substâncias químicas pelo score de risco RRS (decrescente).
 *
 * @param chemicals
 *   - Array de substâncias com nome e scores de perigo e exposição
 * @returns
 *   - Array ordenado por RRS decrescente com classificação de prioridade
 */
export function rankChemicals(
    chemicals: Array<{ name: string; hazardScore: number; exposureScore: number }>,
): Array<{ name: string; rrs: number; priority: string }> {
    if (!Array.isArray(chemicals) || chemicals.length === 0) {
        throw new TypeError('chemicals must be a non-empty array');
    }

    return chemicals
        .map((chemical) => {
            if (typeof chemical.name !== 'string' || !chemical.name) {
                throw new TypeError('Each chemical must have a non-empty name string');
            }
            const { rrs, priority } = computeRiskRankingScore(chemical.hazardScore, chemical.exposureScore);
            return { name: chemical.name, rrs, priority };
        })
        .sort((a, b) => b.rrs - a.rrs);
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const chemicalRiskRankingMeta: AnalyticsModuleMeta = {
    name: 'chemicalRiskRanking',
    description: 'Chemical Risk Ranking',
    category: 'analytics',
    familyTags: ['chemical', 'risk'],
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
