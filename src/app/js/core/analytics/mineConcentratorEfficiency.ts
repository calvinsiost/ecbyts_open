// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
'use strict';

/**
 * Mine Concentrator Efficiency Module
 *
 * Implements metallurgical performance metrics following:
 *   - Wills, B.A. & Finch, J.A. (2016). Wills' Mineral Processing Technology, 8th ed.
 *     Butterworth-Heinemann. ISBN 978-0-08-097053-0
 *   - SME Mineral Processing and Extractive Metallurgy Handbook (2019).
 *     Society for Mining, Metallurgy & Exploration. ISBN 978-0-87335-385-4
 *   - Schulz, N.F. (1970). Separation efficiency. Trans. AIME, 247, 81–87.
 *
 * Definitions:
 *   - Metallurgical recovery R (%) = (mass metal in concentrate / mass metal in feed) × 100
 *   - Concentration ratio CR = mass feed / mass concentrate
 *   - Schulz efficiency index = R% − (100 / CR)  [0–100 scale, 100 = perfect separation]
 *
 * Zero DOM / IDB / Three.js / fetch dependencies - pure math module.
 *
 * @module mineConcentratorEfficiency
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

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Efficiency classification bands (Wills & Finch Table 1.1 benchmarks + industry practice)
 * Faixas de eficiência padrão da indústria mineral.
 * @readonly
 */
const EFFICIENCY_CLASSES = [
    { label: 'world-class', minSchulz: 85 },
    { label: 'good', minSchulz: 65 },
    { label: 'average', minSchulz: 40 },
    { label: 'poor', minSchulz: -Infinity },
];

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Calculate metallurgical recovery (R%).
 * Calcula a recuperação metalúrgica percentual para sistema de 2 produtos.
 *
 * Formula (Wills & Finch eq. 1.1):
 *   R = (c · f̄c) / (f · f̄f) × 100
 * where c = concentrate mass, f = feed mass, f̄c = concentrate grade, f̄f = feed grade
 *
 * Alternative mass-balance form (when tails grade is known):
 *   R = c(f̄c − f̄t) / f̄f(c − t)  [two-product formula]
 *
 * This export uses the simple assay form for clarity.
 *
 * @param p
 * @param p.feedMass        - dry mass of feed (t)
 * @param p.feedGrade       - valuable mineral grade in feed (%, decimal or %)
 * @param p.concentrateMass - dry mass of concentrate (t)
 * @param p.concentrateGrade - valuable mineral grade in concentrate (same units as feedGrade)
 */
export function calcMetallurgicalRecovery({
    feedMass,
    feedGrade,
    concentrateMass,
    concentrateGrade,
}: {
    feedMass: number;
    feedGrade: number;
    concentrateMass: number;
    concentrateGrade: number;
}): { recovery: number; unit: string } {
    for (const [k, v] of Object.entries({ feedMass, feedGrade, concentrateMass, concentrateGrade })) {
        if (typeof v !== 'number' || !isFinite(v)) throw new TypeError(`${k} must be a finite number`);
        if (v < 0) throw new RangeError(`${k} cannot be negative`);
    }
    if (feedMass === 0) throw new RangeError('feedMass cannot be zero');
    if (feedGrade === 0) throw new RangeError('feedGrade cannot be zero (no valuable mineral in feed)');
    if (concentrateMass > feedMass) {
        throw new RangeError('concentrateMass cannot exceed feedMass');
    }
    if (concentrateGrade < feedGrade) {
        throw new RangeError('concentrateGrade must be >= feedGrade for a valid concentrate');
    }

    // Recuperação metalúrgica (fração mássica do metal recuperado no concentrado)
    const recovery = ((concentrateMass * concentrateGrade) / (feedMass * feedGrade)) * 100;

    if (recovery > 100 + 1e-9) {
        throw new RangeError(`Computed recovery ${recovery.toFixed(2)}% exceeds 100% — check input grades`);
    }

    return { recovery: +Math.min(recovery, 100).toFixed(4), unit: '%' };
}

/**
 * Calculate concentration ratio (CR).
 * Calcula a razão de concentração (toneladas de minério por tonelada de concentrado).
 *
 * Formula: CR = feedMass / concentrateMass   [Wills & Finch eq. 1.2]
 *
 * @param feedMass        - dry mass of feed (t)
 * @param concentrateMass - dry mass of concentrate (t)
 */
export function calcConcentrationRatio(
    feedMass: number,
    concentrateMass: number,
): { cr: number; unit: string } {
    if (typeof feedMass !== 'number' || !isFinite(feedMass) || feedMass <= 0) {
        throw new RangeError('feedMass must be a positive finite number');
    }
    if (typeof concentrateMass !== 'number' || !isFinite(concentrateMass) || concentrateMass <= 0) {
        throw new RangeError('concentrateMass must be a positive finite number');
    }
    if (concentrateMass > feedMass) {
        throw new RangeError('concentrateMass cannot exceed feedMass');
    }

    // Razão de concentração: toneladas de alimentação por tonelada de concentrado
    const cr = feedMass / concentrateMass;
    return { cr: +cr.toFixed(4), unit: 't feed / t concentrate' };
}

/**
 * Calculate Schulz separation efficiency index.
 * Calcula o índice de eficiência de separação de Schulz (1970).
 *
 * Formula (Schulz 1970):
 *   E = R − (100 / CR)
 * Range: theoretically −∞ to 100; values < 0 indicate worse than random separation.
 *
 * @param recovery          - metallurgical recovery R (%)
 * @param concentrationRatio - concentration ratio CR (dimensionless)
 */
export function calcSchulzEfficiency(
    recovery: number,
    concentrationRatio: number,
): { schulzIndex: number; classification: string } {
    if (typeof recovery !== 'number' || !isFinite(recovery)) {
        throw new TypeError('recovery must be a finite number');
    }
    if (recovery < 0 || recovery > 100) {
        throw new RangeError('recovery must be between 0 and 100 (%)');
    }
    if (typeof concentrationRatio !== 'number' || !isFinite(concentrationRatio) || concentrationRatio < 1) {
        throw new RangeError('concentrationRatio must be >= 1');
    }

    // Índice de eficiência: recuperação menos a fração mínima esperada por diluição
    const schulzIndex = recovery - 100 / concentrationRatio;
    const cls = EFFICIENCY_CLASSES.find((c) => schulzIndex >= c.minSchulz);
    const classification = cls ? cls.label : 'poor';

    return { schulzIndex: +schulzIndex.toFixed(4), classification };
}

/**
 * Perform two-product metallurgical balance.
 * Realiza o balanço metalúrgico de 2 produtos (alimentação → concentrado + rejeito).
 *
 * Mass balance: F = C + T  (feed = concentrate + tails)
 * Metal balance: F·gF = C·gC + T·gT
 *
 * @param p
 * @param p.feedMass         - feed mass F (t)
 * @param p.feedGrade        - feed grade gF (%)
 * @param p.concentrateMass  - concentrate mass C (t)
 * @param p.concentrateGrade - concentrate grade gC (%)
 */
export function twoProductBalance({
    feedMass,
    feedGrade,
    concentrateMass,
    concentrateGrade,
}: {
    feedMass: number;
    feedGrade: number;
    concentrateMass: number;
    concentrateGrade: number;
}): {
    tailsMass: number;
    tailsGrade: number;
    metalInFeed: number;
    metalInConcentrate: number;
    metalInTails: number;
    massBalance: number;
    metalBalance: number;
    unit: string;
} {
    for (const [k, v] of Object.entries({ feedMass, feedGrade, concentrateMass, concentrateGrade })) {
        if (typeof v !== 'number' || !isFinite(v)) throw new TypeError(`${k} must be a finite number`);
        if (v < 0) throw new RangeError(`${k} cannot be negative`);
    }
    if (feedMass === 0) throw new RangeError('feedMass cannot be zero');
    if (concentrateMass > feedMass) throw new RangeError('concentrateMass cannot exceed feedMass');

    const tailsMass = feedMass - concentrateMass;

    // Balanço metálico: metal no rejeito = metal na alimentação - metal no concentrado
    const metalInFeed = feedMass * (feedGrade / 100);
    const metalInConcentrate = concentrateMass * (concentrateGrade / 100);
    const metalInTails = metalInFeed - metalInConcentrate;

    // Teor no rejeito (evitar divisão por zero quando tailsMass = 0)
    const tailsGrade = tailsMass > 0 ? (metalInTails / tailsMass) * 100 : 0;

    const massBalance = feedMass - (concentrateMass + tailsMass); // deve ser 0
    const metalBalance = metalInFeed - (metalInConcentrate + metalInTails); // deve ser 0

    return {
        tailsMass: +tailsMass.toFixed(4),
        tailsGrade: +tailsGrade.toFixed(4),
        metalInFeed: +metalInFeed.toFixed(4),
        metalInConcentrate: +metalInConcentrate.toFixed(4),
        metalInTails: +metalInTails.toFixed(4),
        massBalance: +massBalance.toFixed(6),
        metalBalance: +metalBalance.toFixed(6),
        unit: 't',
    };
}

/**
 * Calculate processing cost per tonne of concentrate.
 * Calcula o custo de processamento por tonelada de concentrado.
 *
 * @param totalProcessingCost - total plant operating cost (USD or BRL)
 * @param concentrateMass     - concentrate produced (t)
 * @param feedMass            - feed processed (t)
 */
export function calcProcessingCostPerTonne(
    totalProcessingCost: number,
    concentrateMass: number,
    feedMass: number,
): { costPerTonneConcentrate: number; costPerTonneFeed: number; concentrateMass: number; unit: string } {
    if (typeof totalProcessingCost !== 'number' || !isFinite(totalProcessingCost) || totalProcessingCost < 0) {
        throw new RangeError('totalProcessingCost must be a non-negative finite number');
    }
    if (typeof concentrateMass !== 'number' || !isFinite(concentrateMass) || concentrateMass <= 0) {
        throw new RangeError('concentrateMass must be a positive finite number');
    }
    if (typeof feedMass !== 'number' || !isFinite(feedMass) || feedMass <= 0) {
        throw new RangeError('feedMass must be a positive finite number');
    }

    // Custo por tonelada de concentrado e por tonelada de alimentação
    const costPerTonneConcentrate = totalProcessingCost / concentrateMass;
    const costPerTonneFeed = totalProcessingCost / feedMass;

    return {
        costPerTonneConcentrate: +costPerTonneConcentrate.toFixed(4),
        costPerTonneFeed: +costPerTonneFeed.toFixed(4),
        concentrateMass: +concentrateMass.toFixed(4),
        unit: 'currency/t',
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineConcentratorEfficiencyMeta: AnalyticsModuleMeta = {
    name: 'mineConcentratorEfficiency',
    description: 'mineConcentratorEfficiency',
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
