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
 * Mining Land Use Change Analysis (LULC)
 *
 * References:
 *   FAO (2020). Global Forest Resources Assessment 2020. FAO, Rome.
 *     doi:10.4060/ca9825en
 *   TEEB (2010). The Economics of Ecosystems and Biodiversity: Ecological and
 *     Economic Foundations. Earthscan, London. ISBN 978-1-84971-212-5
 *   Jaeger, J.A.G. (2000). Landscape division, splitting index, and effective
 *     mesh size: new measures of landscape fragmentation.
 *     Landscape Ecology, 15, 115–130. doi:10.1023/A:1008129329289
 *   IBAMA (2022). Manual de Licenciamento Ambiental - Mineração.
 *     IBAMA/MMA, Brasília.
 *
 * Zero DOM/IDB/fetch/Three.js dependencies - pure math module.
 * Módulo de análise de mudança de uso do solo em mineração - sem dependências de browser.
 */

// ─── Ecosystem services value table (USD/ha/yr, TEEB 2010 midpoint estimates) ─
// Tabela de valores de serviços ecossistêmicos (USD/ha/ano, estimativas TEEB 2010)
/** @type {Record<string, number>} */
const ECOSYSTEM_SERVICE_VALUES = {
    forest: 3800, // Floresta tropical/subtropical / Tropical-subtropical forest
    cerrado: 1200, // Cerrado / Brazilian savanna
    campo: 400, // Campo nativo / Native grassland
    wetland: 5800, // Área úmida / Wetland
    agricultural: 220, // Área agrícola / Agricultural land
    urban: 50, // Área urbana / Urban land
    mining: 0, // Área minerada (sem serviço) / Mined area (no ecosystem service)
};

const VALID_LULC_CATEGORIES = new Set(Object.keys(ECOSYSTEM_SERVICE_VALUES));

// ─── Area accounting ────────────────────────────────────────────────────────

/**
 * Calculate ecosystem service loss due to land use change in mining.
 * Calcula a perda de serviços ecossistêmicos por mudança de uso do solo na mineração.
 *
 * For each category, computes annual loss (USD/yr) = area × (original_value - mining_value).
 * Para cada categoria, calcula a perda anual (USD/ano) = área × (valor_original - valor_mineração).
 *
 * @param {Array<{category: string, areaHa: number}>} disturbedAreas
 *   Array of disturbed land areas by category / Array de áreas perturbadas por categoria
 * @returns {{
 *   byCategory: object,
 *   totalAreaHa: number,
 *   annualLossUSD: number,
 *   netPresentValueUSD: number
 * }}
 */
export function calcEcosystemServiceLoss(disturbedAreas: any, discountRate = 0.08, horizonYears = 30) {
    if (!Array.isArray(disturbedAreas) || disturbedAreas.length === 0) {
        throw new TypeError('disturbedAreas must be a non-empty array');
    }
    if (typeof discountRate !== 'number' || discountRate < 0 || discountRate >= 1) {
        throw new RangeError('discountRate must be between 0 and 1 (exclusive)');
    }
    if (typeof horizonYears !== 'number' || horizonYears <= 0) {
        throw new RangeError('horizonYears must be > 0');
    }

    // Capitalização anual: VPL = anuidade × [(1 - (1+r)^-n) / r]
    // Net Present Value annuity factor
    const annuityFactor = (1 - Math.pow(1 + discountRate, -horizonYears)) / discountRate;

    let totalAreaHa = 0;
    let annualLossUSD = 0;
    /** @type {Record<string, number>} */
    const byCategory = {};

    for (const entry of disturbedAreas) {
        const { category, areaHa } = entry;
        if (!VALID_LULC_CATEGORIES.has(category)) {
            throw new RangeError(`category '${category}' is not valid. Use: ${[...VALID_LULC_CATEGORIES].join(', ')}`);
        }
        if (typeof areaHa !== 'number' || areaHa < 0) {
            throw new RangeError(`areaHa must be >= 0 for category '${category}'`);
        }

const originalValue = (ECOSYSTEM_SERVICE_VALUES as any)[category];
        const lossPerHa = Math.max(0, originalValue - ECOSYSTEM_SERVICE_VALUES.mining);
        const annualLoss = areaHa * lossPerHa;

        (byCategory as any)[category] = (byCategory as any)[category] || 0 + annualLoss;
        totalAreaHa += areaHa;
        annualLossUSD += annualLoss;
    }

    const netPresentValueUSD = Math.round(annualLossUSD * annuityFactor);

    return {
        byCategory,
        totalAreaHa,
        annualLossUSD: Math.round(annualLossUSD),
        netPresentValueUSD,
    };
}

// ─── Landscape fragmentation index ─────────────────────────────────────────

/**
 * Calculate Effective Mesh Size (EMS) landscape fragmentation index (Jaeger 2000).
 * Calcula o Índice de Tamanho Efetivo de Malha (TEM) de fragmentação paisagística.
 *
 * EMS = (1 / A_total) × Σ(a_i²)
 * Where a_i are patch areas (ha) and A_total is total landscape area (ha).
 * Onde a_i são as áreas dos fragmentos (ha) e A_total é a área total da paisagem.
 *
 * Interpretation / Interpretação:
 *   High EMS = low fragmentation (large connected patches)
 *   Low EMS  = high fragmentation (many small isolated patches)
 *
 * @param {number[]} patchAreasHa - Array of individual habitat patch areas in ha
 * @param {number} totalLandscapeHa - Total landscape area in ha
 * @returns {{ ems: number, fragmentationClass: string }}
 */
export function calcEffectiveMeshSize(patchAreasHa: any, totalLandscapeHa: any) {
    if (!Array.isArray(patchAreasHa) || patchAreasHa.length === 0) {
        throw new TypeError('patchAreasHa must be a non-empty array');
    }
    if (typeof totalLandscapeHa !== 'number' || totalLandscapeHa <= 0) {
        throw new RangeError('totalLandscapeHa must be > 0');
    }
    for (const a of patchAreasHa) {
        if (typeof a !== 'number' || a < 0) throw new RangeError('All patch areas must be >= 0');
    }

    const sumOfSquares = patchAreasHa.reduce((s, a) => s + a * a, 0);
    const ems = sumOfSquares / totalLandscapeHa;

    return { ems, fragmentationClass: classifyFragmentation(ems, totalLandscapeHa) };
}

/**
 * Classify landscape fragmentation based on EMS relative to total area.
 * Classifica a fragmentação da paisagem com base no EMS relativo à área total.
 * @param {number} ems - Effective mesh size (ha)
 * @param {number} totalLandscapeHa - Total landscape area (ha)
 * @returns {string}
 */
export function classifyFragmentation(ems: any, totalLandscapeHa: any) {
    if (typeof ems !== 'number' || ems < 0) throw new RangeError('ems must be >= 0');
    if (typeof totalLandscapeHa !== 'number' || totalLandscapeHa <= 0)
        throw new RangeError('totalLandscapeHa must be > 0');
    const ratio = ems / totalLandscapeHa; // 0 (max fragmented) → 1 (unfragmented)
    if (ratio >= 0.7) return 'low_fragmentation';
    if (ratio >= 0.4) return 'moderate_fragmentation';
    if (ratio >= 0.1) return 'high_fragmentation';
    return 'extreme_fragmentation';
}

// ─── Environmental liability (passivo ambiental) score ──────────────────────

/**
 * Calculate composite environmental liability score for a mining site.
 * Calcula o score composto de passivo ambiental para uma área de mineração.
 *
 * Score = 0.4 × (normalised ecosystem loss) + 0.4 × (normalised fragmentation) + 0.2 × (area factor)
 * Normalised to 0–100 range. / Normalizado para escala 0–100.
 *
 * @param {object} p
 * @param {number} p.annualLossUSD - Annual ecosystem service loss (USD/yr)
 * @param {number} p.totalAreaHa - Total disturbed area (ha)
 * @param {number} p.fragmentationRatio - EMS / totalLandscape (0–1, lower = more fragmented)
 * @returns {{ liabilityScore: number, liabilityClass: string }}
 */
export function calcEnvironmentalLiabilityScore({
    annualLossUSD,
    totalAreaHa,
    fragmentationRatio
}: any) {
    if (typeof annualLossUSD !== 'number' || annualLossUSD < 0) {
        throw new RangeError('annualLossUSD must be >= 0');
    }
    if (typeof totalAreaHa !== 'number' || totalAreaHa <= 0) {
        throw new RangeError('totalAreaHa must be > 0');
    }
    if (typeof fragmentationRatio !== 'number' || fragmentationRatio < 0 || fragmentationRatio > 1) {
        throw new RangeError('fragmentationRatio must be between 0 and 1');
    }

    // Normalise ecosystem loss: reference = USD 10M/yr → score 100
    // Normaliza perda: referência = USD 10M/ano → score 100
    const lossNorm = Math.min(100, (annualLossUSD / 10_000_000) * 100);

    // Fragmentation component: inverted (low ratio = high score)
    // Componente de fragmentação: invertido (razão baixa = score alto)
    const fragScore = (1 - fragmentationRatio) * 100;

    // Area factor: reference = 10,000 ha → score 100
    // Fator de área: referência = 10.000 ha → score 100
    const areaFactor = Math.min(100, (totalAreaHa / 10_000) * 100);

    const liabilityScore = Math.round(0.4 * lossNorm + 0.4 * fragScore + 0.2 * areaFactor);
    return { liabilityScore, liabilityClass: classifyLiability(liabilityScore) };
}

/**
 * Classify liability score.
 * Classifica o score de passivo ambiental.
 * @param {number} score 0–100
 * @returns {string}
 */
export function classifyLiability(score: any) {
    if (typeof score !== 'number' || score < 0 || score > 100) {
        throw new RangeError('score must be between 0 and 100');
    }
    if (score < 20) return 'negligible';
    if (score < 40) return 'low';
    if (score < 60) return 'moderate';
    if (score < 80) return 'high';
    return 'critical';
}

export { ECOSYSTEM_SERVICE_VALUES, VALID_LULC_CATEGORIES };

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const miningLandUseChangeMeta = {
    name: 'miningLandUseChange',
    description: 'miningLandUseChange',
    category: 'analytics',
    familyTags: ['mining'],
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
