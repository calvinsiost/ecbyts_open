// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Environmental Circular Bioeconomy Schema - ECBT
 *
 * Pure-logic factories and validators for circular bioeconomy and bio-based
 * product assessment. Esquema canônico para fluxos de biomassa, produtos
 * bio-baseados e cadeia de valor da bioeconomia circular.
 *
 * Domain references (used as factual/normative basis only - no code copied):
 * - EU Bioeconomy Strategy 2018 (COM/2018/673)
 * - Lei 12.187/2009 - Política Nacional sobre Mudança do Clima (PNMC)
 * - FAO - Sustainable bioeconomy frameworks
 * - OECD - The Bioeconomy to 2030
 * - Embrapa - Bioeconomia para o Brasil (2022)
 * - ABNT NBR ISO 14021 - Environmental claims (self-declared)
 *
 * Constraints:
 * - Zero DOM, zero browser APIs, zero external imports
 * - All enums frozen via Object.freeze
 * - All record factories return Object.freeze
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const BIOMASS_SOURCE = Object.freeze({
    AGRICULTURE: 'AGRICULTURE',
    FORESTRY: 'FORESTRY',
    AQUACULTURE: 'AQUACULTURE',
    ANIMAL_PRODUCTION: 'ANIMAL_PRODUCTION',
    MUNICIPAL_ORGANIC: 'MUNICIPAL_ORGANIC',
    INDUSTRIAL_BIOWASTE: 'INDUSTRIAL_BIOWASTE',
    ALGAE: 'ALGAE',
});

export const BIO_PRODUCT_CATEGORY = Object.freeze({
    BIOFUEL: 'BIOFUEL',
    BIOMATERIAL: 'BIOMATERIAL',
    BIOCHEMICAL: 'BIOCHEMICAL',
    BIOPHARMA: 'BIOPHARMA',
    FOOD_FEED: 'FOOD_FEED',
    ENERGY_HEAT_POWER: 'ENERGY_HEAT_POWER',
    COMPOST_FERTILIZER: 'COMPOST_FERTILIZER',
});

export const VALUE_CHAIN_STAGE = Object.freeze({
    FEEDSTOCK_PRODUCTION: 'FEEDSTOCK_PRODUCTION',
    COLLECTION: 'COLLECTION',
    PROCESSING: 'PROCESSING',
    MANUFACTURING: 'MANUFACTURING',
    DISTRIBUTION: 'DISTRIBUTION',
    USE: 'USE',
    END_OF_LIFE: 'END_OF_LIFE',
});

export const SUSTAINABILITY_CERTIFICATION = Object.freeze({
    ISCC: 'ISCC',
    RSB: 'RSB',
    RTRS: 'RTRS',
    BONSUCRO: 'BONSUCRO',
    FSC: 'FSC',
    RAINFOREST_ALLIANCE: 'RAINFOREST_ALLIANCE',
    NONE: 'NONE',
});

export const BIOECONOMY_ERROR = Object.freeze({
    INVALID_FEEDSTOCK: 'INVALID_FEEDSTOCK',
    INVALID_PRODUCT: 'INVALID_PRODUCT',
    INVALID_STAGE: 'INVALID_STAGE',
});

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Carbon intensity factor by biomass source (kg CO2-eq per kg of biomass).
 * Fator de intensidade de carbono por fonte de biomassa.
 * Values are illustrative defaults derived from FAO/IPCC ranges; specific
 * projects should override with site-measured factors.
 */
export const CARBON_INTENSITY_KG_PER_KG = Object.freeze({
    AGRICULTURE: 0.5,
    FORESTRY: 0.3,
    AQUACULTURE: 1.2,
    ANIMAL_PRODUCTION: 5.0,
    MUNICIPAL_ORGANIC: 0.1,
    INDUSTRIAL_BIOWASTE: 0.2,
    ALGAE: 0.4,
});

/**
 * Circularity bonus multiplier per certification. NONE = 1.0 (no bonus).
 * Multiplicador de bônus de circularidade por certificação.
 */
export const CIRCULARITY_MULTIPLIER = Object.freeze({
    ISCC: 1.2,
    RSB: 1.2,
    RTRS: 1.15,
    BONSUCRO: 1.15,
    FSC: 1.1,
    RAINFOREST_ALLIANCE: 1.1,
    NONE: 1.0,
});

/**
 * Approximate value-add ratio per stage of the value chain. Sum ≈ 1.0.
 * Razão aproximada de agregação de valor por estágio da cadeia.
 */
export const STAGE_VALUE_ADD_RATIO = Object.freeze({
    FEEDSTOCK_PRODUCTION: 0.05,
    COLLECTION: 0.1,
    PROCESSING: 0.2,
    MANUFACTURING: 0.35,
    DISTRIBUTION: 0.15,
    USE: 0.1,
    END_OF_LIFE: 0.05,
});

/**
 * Minimum bio-content fraction (kg bio / kg total) for a product to qualify
 * as "bio-based" under ABNT NBR ISO 14021 self-declared claims (heuristic).
 * Fração mínima de conteúdo bio para classificação bio-based.
 */
export const MIN_BIO_CONTENT_FRACTION = 0.25;

// ─────────────────────────────────────────────────────────────────────────────
// Error class
// ─────────────────────────────────────────────────────────────────────────────

export class BioeconomyError extends Error {
    code: string;
    /**
     * @param {string} code
     * @param {string} [message?]
     */
    constructor(code: string, message?: string) {
        super(message || code);
        this.name = 'BioeconomyError';
        this.code = code;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {any} s
 * @returns {boolean}
 */
function isNonEmptyString(s: any): boolean {
    return typeof s === 'string' && s.length > 0;
}

/**
 * @param {any} n
 * @returns {boolean}
 */
function isFiniteNumber(n: any): boolean {
    return typeof n === 'number' && Number.isFinite(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a frozen biomass flow record.
 * Cria um registro imutável de fluxo de biomassa.
 *
 * @param {{flowId: string, source: string, tonnesYear: number, certification?: string}} params
 * @returns {Readonly<{
 *   flowId: string,
 *   source: string,
 *   tonnesYear: number,
 *   certification: string,
 *   carbonImpactKgYr: number,
 *   certificationBonus: number,
 * }>}
 */
export function createBiomassFlow({ flowId, source, tonnesYear, certification = SUSTAINABILITY_CERTIFICATION.NONE }: { flowId: string; source: string; tonnesYear: number; certification?: string }) {
    if (!isNonEmptyString(flowId)) {
        throw new BioeconomyError(BIOECONOMY_ERROR.INVALID_FEEDSTOCK, 'flowId required');
    }
    if (!(Object.values(BIOMASS_SOURCE) as string[]).includes(source)) {
        throw new BioeconomyError(BIOECONOMY_ERROR.INVALID_FEEDSTOCK, 'invalid source: ' + source);
    }
    if (!isFiniteNumber(tonnesYear) || tonnesYear < 0) {
        throw new BioeconomyError(BIOECONOMY_ERROR.INVALID_FEEDSTOCK, 'tonnesYear must be >= 0');
    }
    if (!(Object.values(SUSTAINABILITY_CERTIFICATION) as string[]).includes(certification)) {
        throw new BioeconomyError(BIOECONOMY_ERROR.INVALID_FEEDSTOCK, 'invalid certification: ' + certification);
    }

    const intensity = (CARBON_INTENSITY_KG_PER_KG as Record<string, number>)[source] ?? 0;
    const carbonImpactKgYr = tonnesYear * 1000 * intensity;
    const certificationBonus = (CIRCULARITY_MULTIPLIER as Record<string, number>)[certification];

    return Object.freeze({
        flowId,
        source,
        tonnesYear,
        certification,
        carbonImpactKgYr,
        certificationBonus,
    });
}

/**
 * Creates a frozen bio-based product record.
 * Cria um registro imutável de produto bio-baseado.
 *
 * @param {{productId: string, category: string, biomassFlowIds: string[], bioContentFraction: number, expectedYieldRatio: number}} params
 * @returns {Readonly<{
 *   productId: string,
 *   category: string,
 *   biomassFlowIds: readonly string[],
 *   bioContentFraction: number,
 *   expectedYieldRatio: number,
 *   qualifiesBioBased: boolean,
 * }>}
 */
export function createBioProduct({ productId, category, biomassFlowIds, bioContentFraction, expectedYieldRatio }: { productId: string; category: string; biomassFlowIds: string[]; bioContentFraction: number; expectedYieldRatio: number }) {
    if (!isNonEmptyString(productId)) {
        throw new BioeconomyError(BIOECONOMY_ERROR.INVALID_PRODUCT, 'productId required');
    }
    if (!(Object.values(BIO_PRODUCT_CATEGORY) as string[]).includes(category)) {
        throw new BioeconomyError(BIOECONOMY_ERROR.INVALID_PRODUCT, 'invalid category: ' + category);
    }
    if (!Array.isArray(biomassFlowIds)) {
        throw new BioeconomyError(BIOECONOMY_ERROR.INVALID_PRODUCT, 'biomassFlowIds must be array');
    }
    if (!isFiniteNumber(bioContentFraction) || bioContentFraction < 0 || bioContentFraction > 1) {
        throw new BioeconomyError(BIOECONOMY_ERROR.INVALID_PRODUCT, 'bioContentFraction must be in [0,1]');
    }
    if (!isFiniteNumber(expectedYieldRatio) || expectedYieldRatio <= 0) {
        throw new BioeconomyError(BIOECONOMY_ERROR.INVALID_PRODUCT, 'expectedYieldRatio must be > 0');
    }

    const qualifiesBioBased = bioContentFraction >= MIN_BIO_CONTENT_FRACTION;

    return Object.freeze({
        productId,
        category,
        biomassFlowIds: Object.freeze([...biomassFlowIds]),
        bioContentFraction,
        expectedYieldRatio,
        qualifiesBioBased,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assesses sustainability of a product against its referenced flows.
 * Avalia sustentabilidade do produto considerando fluxos referenciados.
 *
 * @param {any} product - output of createBioProduct
 * @param {any[]} flows - outputs of createBiomassFlow
 * @returns {Readonly<{
 *   weightedCarbonImpactKgYr: number,
 *   dominantSource: string|null,
 *   certificationCoverage: number,
 *   qualifiesBioBased: boolean,
 * }>}
 */
export function assessSustainability(product: any, flows: any[]): Readonly<{ weightedCarbonImpactKgYr: number, dominantSource: string|null, certificationCoverage: number, qualifiesBioBased: boolean, }> {
    if (!product || typeof product !== 'object') {
        throw new BioeconomyError(BIOECONOMY_ERROR.INVALID_PRODUCT, 'product required');
    }
    if (!Array.isArray(flows)) {
        throw new BioeconomyError(BIOECONOMY_ERROR.INVALID_FEEDSTOCK, 'flows must be array');
    }

    const referenced = flows.filter((f) => product.biomassFlowIds.includes(f.flowId));

    let weightedCarbonImpactKgYr = 0;
        const sourceTotals: Record<string, number>= {};
    let certifiedCount = 0;

    for (const f of referenced) {
        weightedCarbonImpactKgYr += f.carbonImpactKgYr * f.certificationBonus;
        sourceTotals[f.source] = (sourceTotals[f.source] || 0) + f.tonnesYear;
        if (f.certification !== SUSTAINABILITY_CERTIFICATION.NONE) certifiedCount += 1;
    }

        let dominantSource: string|null= null;
    let max = -Infinity;
    for (const [src, t] of Object.entries(sourceTotals)) {
        if (t > max) {
            max = t;
            dominantSource = src;
        }
    }

    const certificationCoverage = referenced.length === 0 ? 0 : certifiedCount / referenced.length;

    return Object.freeze({
        weightedCarbonImpactKgYr,
        dominantSource,
        certificationCoverage,
        qualifiesBioBased: !!product.qualifiesBioBased,
    });
}

/**
 * Computes a value-chain score from stage-tagged values.
 * Calcula score da cadeia de valor a partir de valores marcados por estágio.
 *
 * @param {Array<{stage: string, valueBRL: number}>} stages
 * @returns {number}
 */
export function computeValueChainScore(stages: Array<{stage: string, valueBRL: number}>): number {
    if (!Array.isArray(stages) || stages.length === 0) return 0;

    let weighted = 0;
    let total = 0;
    for (const s of stages) {
        if (!s || !(Object.values(VALUE_CHAIN_STAGE) as string[]).includes(s.stage)) {
            throw new BioeconomyError(BIOECONOMY_ERROR.INVALID_STAGE, 'invalid stage: ' + (s && s.stage));
        }
        if (!isFiniteNumber(s.valueBRL) || s.valueBRL < 0) {
            throw new BioeconomyError(BIOECONOMY_ERROR.INVALID_STAGE, 'valueBRL must be >= 0');
        }
        weighted += s.valueBRL * ((STAGE_VALUE_ADD_RATIO as Record<string, number>)[s.stage] ?? 0);
        total += s.valueBRL;
    }

    if (total === 0) return 0;
    return weighted / total;
}

/**
 * Builds an aggregated bioeconomy report across products and flows.
 * Constrói relatório agregado de bioeconomia.
 *
 * @param {any[]} products - outputs of createBioProduct
 * @param {any[]} flows - outputs of createBiomassFlow
 * @returns {Readonly<{
 *   totalProducts: number,
 *   totalFlows: number,
 *   totalTonnesYear: number,
 *   totalCarbonImpactKgYr: number,
 *   qualifyingBioBasedCount: number,
 *   sourceBreakdown: object,
 *   certifiedFraction: number,
 *   topProducts: readonly object[],
 * }>}
 */
export function buildBioeconomyReport(products: any[], flows: any[]): Readonly<{ totalProducts: number, totalFlows: number, totalTonnesYear: number, totalCarbonImpactKgYr: number, qualifyingBioBasedCount: number, sourceBreakdown: object, certifiedFraction: number, topProducts: readonly object[], }> {
    if (!Array.isArray(products)) {
        throw new BioeconomyError(BIOECONOMY_ERROR.INVALID_PRODUCT, 'products must be array');
    }
    if (!Array.isArray(flows)) {
        throw new BioeconomyError(BIOECONOMY_ERROR.INVALID_FEEDSTOCK, 'flows must be array');
    }

    const totalTonnesYear = flows.reduce((acc, f) => acc + f.tonnesYear, 0);
    const totalCarbonImpactKgYr = flows.reduce((acc, f) => acc + f.carbonImpactKgYr, 0);

        const sourceBreakdown: Record<string, number>= {};
    for (const f of flows) {
        sourceBreakdown[f.source] = (sourceBreakdown[f.source] || 0) + f.tonnesYear;
    }

    const certifiedCount = flows.filter((f) => f.certification !== SUSTAINABILITY_CERTIFICATION.NONE).length;
    const certifiedFraction = flows.length === 0 ? 0 : certifiedCount / flows.length;

    const qualifyingBioBasedCount = products.filter((p) => p.qualifiesBioBased).length;

    // Rank products by carbon impact (descending) using assessSustainability
    const ranked = products
        .map((p) => {
            const a = assessSustainability(p, flows);
            return { product: p, weightedCarbonImpactKgYr: a.weightedCarbonImpactKgYr };
        })
        .sort((a, b) => b.weightedCarbonImpactKgYr - a.weightedCarbonImpactKgYr);

    const topProducts = ranked.slice(0, 3).map((r) =>
        Object.freeze({
            productId: r.product.productId,
            category: r.product.category,
            weightedCarbonImpactKgYr: r.weightedCarbonImpactKgYr,
        }),
    );

    return Object.freeze({
        totalProducts: products.length,
        totalFlows: flows.length,
        totalTonnesYear,
        totalCarbonImpactKgYr,
        qualifyingBioBasedCount,
        sourceBreakdown: Object.freeze({ ...sourceBreakdown }),
        certifiedFraction,
        topProducts: Object.freeze(topProducts),
    });
}
