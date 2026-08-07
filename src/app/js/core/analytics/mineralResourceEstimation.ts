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
 * @fileoverview Mineral Resource Estimation - Pure scientific analytics module.
 *
 * Implements JORC Code 2012 (Joint Ore Reserves Committee), NI 43-101 (National
 * Instrument 43-101, Canada), and SME Guide for Reporting Exploration Results,
 * Mineral Resources, and Mineral Reserves (2014).
 *
 * Academic references:
 * - JORC: australasian.jorc.org/docs/jorc_code2012.pdf
 * - NI 43-101: laws-lois.justice.gc.ca/eng/regulations/SOR-2011-213
 * - Isaaks, E.H. & Srivastava, R.M. (1989). Applied Geostatistics. Oxford Univ. Press. ISBN 978-0195050127
 * - Sinclair, A.J. & Blackwell, G.H. (2002). Applied Mineral Inventory Estimation. Cambridge Univ. Press.
 *   DOI:10.1017/CBO9780511529948
 * - SME (2014). Guide for Reporting Exploration Results, Mineral Resources, and Mineral Reserves.
 *
 * Zero DOM/IDB/Three.js/fetch dependencies.
 * @module mineralResourceEstimation
 */

// ---------------------------------------------------------------------------
// Resource Classification by Kriging Variance
// Classificacao por variancia de krigagem conforme JORC 2012 Tabela 1
// ---------------------------------------------------------------------------

/** @typedef {'inferred'|'indicated'|'measured'} ResourceCategory */

/**
 * Classify resource category by normalized kriging variance (kriging efficiency).
 * Classifica categoria de recurso pela variancia de krigagem normalizada.
 *
 * Kriging efficiency (KE) = 1 - (sigma_k^2 / C0)
 * where C0 = sill variance of the variogram.
 *
 * JORC 2012 guidance (Clause 20):
 *   Measured  : KE >= 0.80 (high confidence)
 *   Indicated : KE >= 0.50 (reasonable confidence)
 *   Inferred  : KE <  0.50 (low confidence)
 *
 * @param {number} krigingVariance - Kriging estimation variance (sigma_k^2), >= 0
 * @param {number} sillVariance - Variogram sill (C0 + nugget), > 0
 * @returns {{ category: ResourceCategory, krigingEfficiency: number }}
 * @throws {RangeError} if inputs are negative or sill is zero
 * @throws {TypeError} if inputs are not finite numbers
 */
export function classifyResourceCategory(krigingVariance: any, sillVariance: any) {
    if (
        typeof krigingVariance !== 'number' ||
        !isFinite(krigingVariance) ||
        typeof sillVariance !== 'number' ||
        !isFinite(sillVariance)
    ) {
        throw new TypeError('classifyResourceCategory: inputs must be finite numbers');
    }
    if (krigingVariance < 0) {
        throw new RangeError('classifyResourceCategory: krigingVariance must be >= 0');
    }
    if (sillVariance <= 0) {
        throw new RangeError('classifyResourceCategory: sillVariance must be > 0');
    }

    // Eficiencia de krigagem: mede fracao da variabilidade explicada pela estimativa
    const KE = 1 - krigingVariance / sillVariance;

    /** @type {ResourceCategory} */
    let category;
    if (KE >= 0.8) {
        category = 'measured';
    } else if (KE >= 0.5) {
        category = 'indicated';
    } else {
        category = 'inferred';
    }

    return { category, krigingEfficiency: KE };
}

// ---------------------------------------------------------------------------
// Cut-Off Grade (Break-Even) Calculation
// Lei de corte pelo metodo Break-Even (Sinclair & Blackwell 2002, Ch. 10)
// ---------------------------------------------------------------------------

/**
 * Calculate break-even cut-off grade for open-pit mining.
 * Calcula a lei de corte no ponto de equilibrio economico para mina a ceu aberto.
 *
 * COG = (C_mining + C_process + C_G&A + C_refine) / (P_metal * R_metallurgical)
 *
 * Reference: Lane, K.F. (1988). The Economic Definition of Ore. Mining Journal Books. ISBN 0-900117-19-8
 *
 * @param {number} miningCostPerTonne - Total mining cost ($/t of ore), > 0
 * @param {number} processingCostPerTonne - Processing + G&A cost ($/t of ore), >= 0
 * @param {number} metalPricePerUnit - Metal price ($/unit, e.g. $/oz, $/kg), > 0
 * @param {number} metallurgicalRecovery - Fraction of metal recovered [0,1], > 0
 * @param {number} [refiningCostPerUnit=0] - Refining/selling cost ($/unit of metal payable), >= 0
 * @returns {{ cutOffGrade: number, currency: string, unit: string }}
 * @throws {RangeError} if any cost is negative or recovery is out of (0,1]
 * @throws {TypeError} if inputs are not finite numbers
 */
export function calculateCutOffGrade(
    miningCostPerTonne: any,
    processingCostPerTonne: any,
    metalPricePerUnit: any,
    metallurgicalRecovery: any,
    refiningCostPerUnit = 0,
) {
    const args = {
        miningCostPerTonne,
        processingCostPerTonne,
        metalPricePerUnit,
        metallurgicalRecovery,
        refiningCostPerUnit,
    };
    for (const [k, v] of Object.entries(args)) {
        if (typeof v !== 'number' || !isFinite(v)) {
            throw new TypeError(`calculateCutOffGrade: '${k}' must be a finite number`);
        }
    }
    if (miningCostPerTonne <= 0) throw new RangeError('miningCostPerTonne must be > 0');
    if (processingCostPerTonne < 0) throw new RangeError('processingCostPerTonne must be >= 0');
    if (metalPricePerUnit <= 0) throw new RangeError('metalPricePerUnit must be > 0');
    if (metallurgicalRecovery <= 0 || metallurgicalRecovery > 1) {
        throw new RangeError('metallurgicalRecovery must be in (0, 1]');
    }
    if (refiningCostPerUnit < 0) throw new RangeError('refiningCostPerUnit must be >= 0');

    // Custo total por tonelada de minerio
    const totalCostPerTonne = miningCostPerTonne + processingCostPerTonne;
    // Net metal price after refining
    const netPricePerUnit = metalPricePerUnit - refiningCostPerUnit;
    if (netPricePerUnit <= 0) {
        throw new RangeError('Net metal price (price - refining) must be > 0');
    }

    // Lei de corte Break-Even (unidade de metal por tonelada de minerio, ex: g/t, %, kg/t)
    const cutOffGrade = totalCostPerTonne / (netPricePerUnit * metallurgicalRecovery);

    return { cutOffGrade, currency: 'USD', unit: 'metal_units_per_tonne' };
}

// ---------------------------------------------------------------------------
// Weighted Average Grade (Block Model)
// Teor medio ponderado pelo volume/tonelagem (block model, SME Guide 2014 §3.4)
// ---------------------------------------------------------------------------

/**
 * Calculate tonnage-weighted average grade from block model data.
 * Calcula o teor medio ponderado pela tonelagem de blocos do modelo de blocos.
 *
 * grade_mean = SUM(grade_i * tonnage_i) / SUM(tonnage_i)
 *
 * Only blocks above or equal to cut-off grade are included.
 *
 * @param {Array<{grade: number, tonnage: number}>} blocks - Array of blocks with grade and tonnage
 * @param {number} blocks - Minimum grade to include in resource, >= 0
 * @returns {{ weightedAverageGrade: number, totalTonnage: number, blockCount: number,
 *             aboveCutOff: number }}
 * @throws {TypeError} if blocks is not a non-empty array or contains invalid entries
 * @throws {RangeError} if cutOffGrade is negative
 */
export function weightedAverageGrade(blocks: any, cutOffGrade: any) {
    if (!Array.isArray(blocks) || blocks.length === 0) {
        throw new TypeError('weightedAverageGrade: blocks must be a non-empty array');
    }
    if (typeof cutOffGrade !== 'number' || !isFinite(cutOffGrade) || cutOffGrade < 0) {
        throw new RangeError('weightedAverageGrade: cutOffGrade must be a finite number >= 0');
    }

    // Filtrar blocos acima da lei de corte
    const qualifying = blocks.filter((b) => {
        if (
            typeof b.grade !== 'number' ||
            !isFinite(b.grade) ||
            typeof b.tonnage !== 'number' ||
            !isFinite(b.tonnage) ||
            b.tonnage <= 0
        ) {
            throw new TypeError('Each block must have finite numeric grade and positive tonnage');
        }
        return b.grade >= cutOffGrade;
    });

    if (qualifying.length === 0) {
        return { weightedAverageGrade: 0, totalTonnage: 0, blockCount: blocks.length, aboveCutOff: 0 };
    }

    // Soma ponderada: SUM(grade_i * t_i)
    const sumGradeTonnage = qualifying.reduce((acc, b) => acc + b.grade * b.tonnage, 0);
    const totalTonnage = qualifying.reduce((acc, b) => acc + b.tonnage, 0);

    return {
        weightedAverageGrade: sumGradeTonnage / totalTonnage,
        totalTonnage,
        blockCount: blocks.length,
        aboveCutOff: qualifying.length,
    };
}

// ---------------------------------------------------------------------------
// Strip Ratio
// Razao de esteril (strip ratio) para mina a ceu aberto (SME Guide §5.1)
// ---------------------------------------------------------------------------

/**
 * Calculate strip ratio and break-even strip ratio for open-pit mining.
 * Calcula a razao de esteril e a razao de esteril no ponto de equilibrio.
 *
 * Strip Ratio (SR) = waste_tonnes / ore_tonnes
 * Break-Even SR = (metal_revenue_per_tonne_ore - ore_cost) / waste_mining_cost
 *
 * @param {number} wasteTonnes - Tonnes of waste to be mined, >= 0
 * @param {number} oreTonnes - Tonnes of ore, > 0
 * @param {number} [metalRevenue=0] - Net metal revenue per tonne of ore ($/t), >= 0
 * @param {number} [oreMiningCost=0] - Cost to mine + process one tonne of ore ($/t), >= 0
 * @param {number} [wasteMiningCost=0] - Cost to mine one tonne of waste ($/t), >= 0
 * @returns {{ stripRatio: number, breakEvenStripRatio: number | null, economic: boolean }}
 * @throws {RangeError} if tonnages are negative or oreTonnes is zero
 * @throws {TypeError} if inputs are not finite numbers
 */
export function calculateStripRatio(wasteTonnes: any, oreTonnes: any, metalRevenue = 0, oreMiningCost = 0, wasteMiningCost = 0) {
    const args = { wasteTonnes, oreTonnes, metalRevenue, oreMiningCost, wasteMiningCost };
    for (const [k, v] of Object.entries(args)) {
        if (typeof v !== 'number' || !isFinite(v)) {
            throw new TypeError(`calculateStripRatio: '${k}' must be a finite number`);
        }
    }
    if (wasteTonnes < 0) throw new RangeError('wasteTonnes must be >= 0');
    if (oreTonnes <= 0) throw new RangeError('oreTonnes must be > 0');
    if (metalRevenue < 0) throw new RangeError('metalRevenue must be >= 0');
    if (oreMiningCost < 0) throw new RangeError('oreMiningCost must be >= 0');
    if (wasteMiningCost < 0) throw new RangeError('wasteMiningCost must be >= 0');

    // Razao de esteril = tonelagem de esteril / tonelagem de minerio
    const stripRatio = wasteTonnes / oreTonnes;

    // Razao de esteril no Break-Even (disponivel apenas quando custo de esteril > 0)
    let breakEvenStripRatio = null;
    if (wasteMiningCost > 0) {
        const margin = metalRevenue - oreMiningCost;
        breakEvenStripRatio = margin / wasteMiningCost;
    }

    const economic = breakEvenStripRatio === null ? true : stripRatio <= breakEvenStripRatio;

    return { stripRatio, breakEvenStripRatio, economic };
}

// ---------------------------------------------------------------------------
// Total Contained Metal
// Metal contido total no recurso (JORC 2012, Clausula 23)
// ---------------------------------------------------------------------------

/**
 * Calculate total contained metal in the resource.
 * Calcula o metal contido total no recurso mineral.
 *
 * contained_metal = total_tonnage * weighted_grade * unit_conversion
 *
 * @param {number} totalTonnage - Resource tonnage (tonnes), > 0
 * @param {number} weightedGrade - Average grade of the resource
 *   - For % grades: already in fraction after /100 if needed
 *   - For g/t: result will be in grams total
 * @param {number} [gradeUnitFactor=1] - Conversion factor (e.g. 1 for g/t→g, 10 for g/t→kg per 1000t)
 * @param {number} [metallurgicalRecovery=1] - Fraction recoverable [0,1], default 1 (gross resource)
 * @returns {{ containedMetal: number, recoverableMetal: number }}
 * @throws {RangeError} if tonnage or grade is non-positive, or recovery out of [0,1]
 * @throws {TypeError} if inputs are not finite numbers
 */
export function calculateContainedMetal(totalTonnage: any, weightedGrade: any, gradeUnitFactor = 1, metallurgicalRecovery = 1) {
    const args = { totalTonnage, weightedGrade, gradeUnitFactor, metallurgicalRecovery };
    for (const [k, v] of Object.entries(args)) {
        if (typeof v !== 'number' || !isFinite(v)) {
            throw new TypeError(`calculateContainedMetal: '${k}' must be a finite number`);
        }
    }
    if (totalTonnage <= 0) throw new RangeError('totalTonnage must be > 0');
    if (weightedGrade < 0) throw new RangeError('weightedGrade must be >= 0');
    if (gradeUnitFactor <= 0) throw new RangeError('gradeUnitFactor must be > 0');
    if (metallurgicalRecovery < 0 || metallurgicalRecovery > 1) {
        throw new RangeError('metallurgicalRecovery must be in [0, 1]');
    }

    // Metal contido bruto
    const containedMetal = totalTonnage * weightedGrade * gradeUnitFactor;
    // Metal recuperavel (liquido de perdas metalurgicas)
    const recoverableMetal = containedMetal * metallurgicalRecovery;

    return { containedMetal, recoverableMetal };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const mineralResourceEstimationMeta = {
    name: 'mineralResourceEstimation',
    description: 'mineralResourceEstimation',
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
