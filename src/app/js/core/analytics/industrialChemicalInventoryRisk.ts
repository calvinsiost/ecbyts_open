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
 * Industrial Chemical Inventory Risk
 * Risco por inventário de produtos químicos industriais
 *
 * References / Referências:
 *   US EPA (2009). Risk Management Program (RMP) - 40 CFR Part 68.
 *     https://www.epa.gov/rmp
 *   European Commission (2012). SEVESO III Directive 2012/18/EU.
 *     Official Journal of the EU, L 197, 1–37.
 *   CCPS (1999). Guidelines for Chemical Process Quantitative Risk Analysis, 2nd ed.
 *     AIChE, New York. ISBN 978-0-8169-0402-1
 *   TNO (1997). Methods for the Calculation of Physical Effects (Yellow Book), 3rd ed.
 *     The Hague: Committee for the Prevention of Disasters.
 *
 * @module industrialChemicalInventoryRisk
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

// ─── Threshold Quantity (TQ) Assessment ──────────────────────────────────────

/**
 * Determine if an inventory exceeds the threshold quantity for regulatory
 * classification under RMP (40 CFR §68.130) or SEVESO III.
 * Determina se o inventário supera a quantidade limiar para classificação
 * regulatória (RMP ou SEVESO III).
 *
 * @param {number} inventoryKg        Inventory mass on-site (kg)
 *                                    Massa do produto em estoque (kg)
 * @param {number} thresholdQuantityKg Regulatory threshold quantity (kg)
 *                                     Quantidade limiar regulatória (kg)
 * @returns {{ ratio: number, exceedsTQ: boolean, tier: string }}
 *   ratio: inventory / TQ (dimensionless)
 *   exceedsTQ: true if ratio >= 1
 *   tier: 'lower' (ratio in [0.5, 1)), 'upper' (ratio >= 1), or 'below'
 * @throws {RangeError} If any argument is not a positive finite number
 */
export function thresholdQuantityAssessment(
    inventoryKg: number,
    thresholdQuantityKg: number,
): { ratio: number; exceedsTQ: boolean; tier: string } {
    if (!Number.isFinite(inventoryKg) || inventoryKg < 0) {
        throw new RangeError('inventoryKg must be a non-negative finite number');
    }
    if (!Number.isFinite(thresholdQuantityKg) || thresholdQuantityKg <= 0) {
        throw new RangeError('thresholdQuantityKg must be a positive finite number');
    }

    const ratio = inventoryKg / thresholdQuantityKg;
    const exceedsTQ = ratio >= 1;
    let tier: string;
    if (ratio >= 1) {
        tier = 'upper';
    } else if (ratio >= 0.5) {
        // SEVESO III lower-tier applies when ≥ 0.5 × TQ (aggregation rule)
        // SEVESO III: tier inferior aplica quando ≥ 0.5 × TQ (regra de agregação)
        tier = 'lower';
    } else {
        tier = 'below';
    }

    return { ratio, exceedsTQ, tier };
}

/**
 * Compute the Hazard Density Index (HDI) for a facility inventory.
 * Calcula o Índice de Densidade de Perigo (IDH) para o inventário de uma instalação.
 *
 * HDI = Σ (Wi / TQi) × Hi
 * where:
 *   Wi  = on-site mass of substance i (kg)
 *   TQi = threshold quantity for substance i (kg)
 *   Hi  = hazard weighting factor for substance i (dimensionless)
 *         Typical H factors: toxic=3, flammable=2, explosive=2, environmental=1
 *
 * Based on CCPS (1999) relative risk ranking methodology.
 * Baseado na metodologia de ranking de risco relativo da CCPS (1999).
 *
 * @param {Array<{ mass_kg: number, tq_kg: number, hazardWeight: number }>} substances
 *   Array of substance descriptors
 * @returns {number} HDI value (dimensionless) - higher = greater hazard density
 *                   Valor do IDH - maior = maior densidade de perigo
 * @throws {TypeError}  If substances is not an array
 * @throws {RangeError} If any substance has invalid fields
 */
export function hazardDensityIndex(
    substances: Array<{ mass_kg: number; tq_kg: number; hazardWeight: number }>,
): number {
    if (!Array.isArray(substances) || substances.length === 0) {
        throw new TypeError('substances must be a non-empty array');
    }

    let hdi = 0;
    for (let i = 0; i < substances.length; i++) {
        const s = substances[i]!;
        if (!Number.isFinite(s.mass_kg) || s.mass_kg < 0) {
            throw new RangeError(`substances[${i}].mass_kg must be a non-negative finite number`);
        }
        if (!Number.isFinite(s.tq_kg) || s.tq_kg <= 0) {
            throw new RangeError(`substances[${i}].tq_kg must be a positive finite number`);
        }
        if (!Number.isFinite(s.hazardWeight) || s.hazardWeight <= 0) {
            throw new RangeError(`substances[${i}].hazardWeight must be a positive finite number`);
        }
        hdi += (s.mass_kg / s.tq_kg) * s.hazardWeight;
    }

    return hdi;
}

/**
 * Estimate the Emergency Planning Zone (EPZ) radius for a worst-case scenario
 * (full instantaneous release of toxic gas) using the TNO Gaussian plume approach.
 * Estima o raio da Zona de Planejamento de Emergência (ZPE) para cenário de
 * pior caso (liberação instantânea de gás tóxico) pelo modelo Gaussiano (TNO).
 *
 * Worst-case toxic endpoint distance (US EPA RMP Off-Site Consequence Analysis):
 *   D = [Q / (π · σy · σz · u · ERPG)] ^ 0.5
 * Simplified to a power-law fit for regulatory purposes (EPA OCA guidance):
 *   D = α · Q ^ β
 * where α and β are substance-specific lookup constants. Here a generic
 * conservative approximation is used:
 *   D(m) = 1000 · (Q_kg / IDLH_mgm3) ^ 0.4 · (1 / u_ms) ^ 0.3
 *
 * For accurate results, use EPA's RMP*Comp or CAMEO Chemicals.
 * Para resultados precisos, utilizar RMP*Comp ou CAMEO da EPA.
 *
 * @param {number} massReleased_kg   Total mass released in worst case (kg)
 *                                   Massa total liberada no pior caso (kg)
 * @param {number} IDLH_mg_m3        Immediately Dangerous to Life or Health conc. (mg/m³)
 *                                   Concentração IDLH da substância (mg/m³)
 * @param {number} windSpeed_ms      Reference wind speed (m/s), typically 1.5 for worst case
 *                                   Velocidade do vento de referência (m/s)
 * @returns {number} EPZ radius (m)
 *                   Raio da ZPE (m)
 * @throws {RangeError} On invalid inputs
 */
export function emergencyPlanningZoneRadius(
    massReleased_kg: number,
    IDLH_mg_m3: number,
    windSpeed_ms: number,
): number {
    if (!Number.isFinite(massReleased_kg) || massReleased_kg <= 0) {
        throw new RangeError('massReleased_kg must be a positive finite number');
    }
    if (!Number.isFinite(IDLH_mg_m3) || IDLH_mg_m3 <= 0) {
        throw new RangeError('IDLH_mg_m3 must be a positive finite number');
    }
    if (!Number.isFinite(windSpeed_ms) || windSpeed_ms <= 0) {
        throw new RangeError('windSpeed_ms must be a positive finite number');
    }

    // Conservative simplified model (ordem de magnitude para fins de planejamento)
    const radius_m = 1000 * Math.pow(massReleased_kg / IDLH_mg_m3, 0.4) * Math.pow(1 / windSpeed_ms, 0.3);

    return Math.max(50, radius_m); // Minimum 50 m EPZ per RMP guidance
}

/**
 * Aggregate multi-substance inventory using the SEVESO III Annex I addition rule.
 * Agrega inventário multi-substância usando a regra de adição do Anexo I da SEVESO III.
 *
 * If no single substance exceeds its TQ, the aggregation rule triggers upper-tier
 * when: Σ (qi / TQi_upper) >= 1
 * or lower-tier when: Σ (qi / TQi_lower) >= 1
 * Regra de adição: se nenhuma substância isolada supera seu TQ, mas a soma das
 * frações >= 1, a instalação enquadra-se no tier correspondente.
 *
 * Reference: SEVESO III Directive 2012/18/EU, Annex I, Note 4.
 *
 * @param {Array<{ mass_kg: number, tqLower_kg: number, tqUpper_kg: number }>} substances
 *   Each substance with its lower and upper tier threshold quantities
 * @returns {{ sumLower: number, sumUpper: number, qualifiesLower: boolean, qualifiesUpper: boolean }}
 * @throws {TypeError}  If substances is not an array
 * @throws {RangeError} If any element has invalid fields
 */
export function sevesoCumulativeAssessment(
    substances: Array<{ mass_kg: number; tqLower_kg: number; tqUpper_kg: number }>,
): { sumLower: number; sumUpper: number; qualifiesLower: boolean; qualifiesUpper: boolean } {
    if (!Array.isArray(substances) || substances.length === 0) {
        throw new TypeError('substances must be a non-empty array');
    }

    let sumLower = 0;
    let sumUpper = 0;

    for (let i = 0; i < substances.length; i++) {
        const s = substances[i]!;
        if (!Number.isFinite(s.mass_kg) || s.mass_kg < 0) {
            throw new RangeError(`substances[${i}].mass_kg must be a non-negative finite number`);
        }
        if (!Number.isFinite(s.tqLower_kg) || s.tqLower_kg <= 0) {
            throw new RangeError(`substances[${i}].tqLower_kg must be a positive finite number`);
        }
        if (!Number.isFinite(s.tqUpper_kg) || s.tqUpper_kg <= 0) {
            throw new RangeError(`substances[${i}].tqUpper_kg must be a positive finite number`);
        }
        sumLower += s.mass_kg / s.tqLower_kg;
        sumUpper += s.mass_kg / s.tqUpper_kg;
    }

    return {
        sumLower,
        sumUpper,
        qualifiesLower: sumLower >= 1,
        qualifiesUpper: sumUpper >= 1,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialChemicalInventoryRiskMeta: AnalyticsModuleMeta = {
    name: 'industrialChemicalInventoryRisk',
    description: 'industrialChemicalInventoryRisk',
    category: 'analytics',
    familyTags: ['industrial', 'chemical', 'risk'],
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
