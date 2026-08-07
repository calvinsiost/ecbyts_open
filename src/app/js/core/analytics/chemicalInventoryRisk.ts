// @ts-check
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
 * Chemical Inventory Risk - Fire & Explosion Index and process risk assessment (simplified HAZOP)
 * Inventário de Risco Químico - Índice de Incêndio e Explosão e avaliação de risco de processo
 *
 * References / Referências:
 * - Dow Chemical (1994) Fire & Explosion Index Hazard Classification Guide, 7th ed.
 * - CCPS (1999) Guidelines for Chemical Process Quantitative Risk Analysis, 2nd ed.
 * - MTE NR-20 (BR) - Norma Regulamentadora de Segurança e Saúde no Trabalho com Inflamáveis e Combustíveis
 * - ABNT NBR 14064:2022 - Gerenciamento de emergências com produtos perigosos
 *
 * @module chemicalInventoryRisk
 */

'use strict';

// F&EI category thresholds - Dow (1994) Table 1
const FEI_THRESHOLDS = [
    { max: 60, category: 'light' },
    { max: 96, category: 'moderate' },
    { max: 127, category: 'heavy' },
    { max: 159, category: 'severe' },
];

// Consequence thresholds for toxic load
const TOXIC_LOAD_THRESHOLDS = [
    { max: 0.1, consequence: 'negligible' },
    { max: 10, consequence: 'marginal' },
    { max: 1000, consequence: 'critical' },
];

// Risk matrix levels - score = probability × consequence (both 1-5)
const RISK_MATRIX = [
    { max: 4, level: 'low', action: 'Monitor and review annually' },
    { max: 9, level: 'medium', action: 'Implement controls within 90 days' },
    { max: 14, level: 'high', action: 'Immediate corrective action required' },
];
const RISK_VERY_HIGH = { level: 'very_high', action: 'Stop operation and remediate immediately' };

// NR-20/ABNT storage quantity limits by chemical class (kg) - limites simplificados
const STORAGE_LIMITS = {
    flammable: 10000,
    toxic: 5000,
    oxidizer: 2000,
    corrosive: 8000,
};

/**
 * Compute Dow Fire & Explosion Index (F&EI).
 * Calcula o Índice de Incêndio e Explosão de Dow.
 *
 * F&EI = material_factor × process_hazard × special_hazard × (1 + quantity_penalty)
 * quantity_penalty = log10(quantity_kg / 1000)  (penalidade por grandes estoques)
 *
 * @param {number} flash_point_c - Flash point (°C)
 * @param {number} boiling_point_c - Boiling point (°C)
 * @param {number} quantity_kg - Inventory quantity (kg)
 * @param {number} reactivity_factor - Reactivity factor (1–4, NFPA style)
 * @returns {{ f_ei: number, hazard_category: 'light'|'moderate'|'heavy'|'severe'|'extreme' }}
 */
export function computeFireExplosionIndex(flash_point_c: any, boiling_point_c: any, quantity_kg: any, reactivity_factor: any) {
    if ([flash_point_c, boiling_point_c, quantity_kg, reactivity_factor].some((v) => typeof v !== 'number')) {
        throw new TypeError('All arguments must be numbers');
    }
    if (quantity_kg <= 0) throw new RangeError('quantity_kg must be > 0');
    if (reactivity_factor < 1 || reactivity_factor > 4) {
        throw new RangeError('reactivity_factor must be in [1, 4]');
    }

    // Fator de material baseado no ponto de fulgor (lower flash = maior risco)
    let material_factor;
    if (flash_point_c < 23) material_factor = 24;
    else if (flash_point_c < 60) material_factor = 16;
    else material_factor = 10;

    // Penalidade de processo baseada na diferença entre ebulição e fulgor
    const temp_delta = boiling_point_c - flash_point_c;
    const process_hazard = temp_delta < 50 ? 1.5 : temp_delta < 150 ? 1.2 : 1.0;

    // Hazard especial baseado na reatividade
    const special_hazard = 1 + (reactivity_factor - 1) * 0.15;

    // Penalidade de quantidade logarítmica (Dow 7th ed. Table 5)
    const quantity_penalty = Math.max(0, Math.log10(quantity_kg / 1000));

    const f_ei = material_factor * process_hazard * special_hazard * (1 + quantity_penalty);

    // Classifica segundo tabela Dow (1994)
    const threshold = FEI_THRESHOLDS.find((t) => f_ei <= t.max);
    /** @type {'light'|'moderate'|'heavy'|'severe'|'extreme'} */
    const hazard_category = threshold
        ? /** @type {'light'|'moderate'|'heavy'|'severe'} */ (threshold.category)
        : 'extreme';

    return { f_ei, hazard_category };
}

/**
 * Compute toxic release consequence from a chemical inventory.
 * Calcula a consequência de liberação tóxica de um inventário químico.
 *
 * toxic_load = (quantity × vapor_pressure / molecular_weight) / lc50
 *
 * @param {number} quantity_kg - Quantity of chemical (kg)
 * @param {number} vapor_pressure_kPa - Vapor pressure at storage temperature (kPa)
 * @param {number} molecular_weight - Molecular weight (g/mol)
 * @param {number} toxicity_lc50_ppm - Inhalation LC50 for 1h (ppm)
 * @returns {{ toxic_load: number, consequence: 'negligible'|'marginal'|'critical'|'catastrophic' }}
 */
export function computeReleaseConsequence(quantity_kg: any, vapor_pressure_kPa: any, molecular_weight: any, toxicity_lc50_ppm: any) {
    if ([quantity_kg, vapor_pressure_kPa, molecular_weight, toxicity_lc50_ppm].some((v) => typeof v !== 'number')) {
        throw new TypeError('All arguments must be numbers');
    }
    if (quantity_kg <= 0) throw new RangeError('quantity_kg must be > 0');
    if (vapor_pressure_kPa < 0) throw new RangeError('vapor_pressure_kPa must be >= 0');
    if (molecular_weight <= 0) throw new RangeError('molecular_weight must be > 0');
    if (toxicity_lc50_ppm <= 0) throw new RangeError('toxicity_lc50_ppm must be > 0');

    // Carga tóxica: quantidade evaporável × pressão de vapor / peso molecular, normalizada pela LC50
    const toxic_load = (quantity_kg * vapor_pressure_kPa) / molecular_weight / toxicity_lc50_ppm;

    const threshold = TOXIC_LOAD_THRESHOLDS.find((t) => toxic_load <= t.max);
    /** @type {'negligible'|'marginal'|'critical'|'catastrophic'} */
    const consequence = threshold
        ? /** @type {'negligible'|'marginal'|'critical'} */ (threshold.consequence)
        : 'catastrophic';

    return { toxic_load, consequence };
}

/**
 * Compute risk score from a 5×5 risk matrix (probability × consequence).
 * Calcula pontuação de risco a partir de matriz 5×5 (probabilidade × consequência).
 *
 * @param {number} probability_score - Probability score (integer 1–5)
 * @param {number} consequence_score - Consequence score (integer 1–5)
 * @returns {{ risk_score: number, risk_level: 'low'|'medium'|'high'|'very_high', action: string }}
 */
export function computeRiskMatrix(probability_score: any, consequence_score: any) {
    if (typeof probability_score !== 'number' || typeof consequence_score !== 'number') {
        throw new TypeError('Scores must be numbers');
    }
    if (!Number.isInteger(probability_score) || probability_score < 1 || probability_score > 5) {
        throw new RangeError('probability_score must be integer in [1, 5]');
    }
    if (!Number.isInteger(consequence_score) || consequence_score < 1 || consequence_score > 5) {
        throw new RangeError('consequence_score must be integer in [1, 5]');
    }

    const risk_score = probability_score * consequence_score;

    const entry = RISK_MATRIX.find((r) => risk_score <= r.max);
    const resolved = entry || RISK_VERY_HIGH;
    /** @type {'low'|'medium'|'high'|'very_high'} */
    const risk_level = /** @type {'low'|'medium'|'high'|'very_high'} */ (resolved.level);
    const action = resolved.action;

    return { risk_score, risk_level, action };
}

/**
 * Classify storage compliance for a chemical.
 * Classifica a conformidade do armazenamento de um produto químico.
 *
 * Verifica temperatura vs ponto de fulgor (margem ≥ 30°C) e quantidade vs limites NR-20/ABNT 14064.
 *
 * @param {number} quantity_kg - Stored quantity (kg)
 * @param {'flammable'|'toxic'|'oxidizer'|'corrosive'} chemical_class - Chemical hazard class
 * @param {number} storage_temperature_c - Storage temperature (°C)
 * @param {number} [flash_point_c] - Flash point (°C); required for 'flammable' class
 * @returns {{ compliant: boolean, issues: string[] }}
 */
export function classifyStorageCompliance(quantity_kg: any, chemical_class: any, storage_temperature_c: any, flash_point_c: any) {
    if (typeof quantity_kg !== 'number' || typeof storage_temperature_c !== 'number') {
        throw new TypeError('quantity_kg and storage_temperature_c must be numbers');
    }
    if (quantity_kg <= 0) throw new RangeError('quantity_kg must be > 0');

    const valid_classes = Object.keys(STORAGE_LIMITS);
    if (!valid_classes.includes(chemical_class)) {
        throw new TypeError(`chemical_class must be one of: ${valid_classes.join(', ')}`);
    }

    const issues = [];

    // Verifica limite de quantidade conforme NR-20 / ABNT NBR 14064
const limit = STORAGE_LIMITS[chemical_class as keyof typeof STORAGE_LIMITS];
    if (quantity_kg > limit) {
        issues.push(
            `Quantity ${quantity_kg} kg exceeds ${chemical_class} storage limit of ${limit} kg (NR-20/ABNT 14064)`,
        );
    }

    // Verifica margem de temperatura de armazenamento vs ponto de fulgor (≥ 30°C)
    if (chemical_class === 'flammable') {
        if (typeof flash_point_c !== 'number') {
            issues.push('flash_point_c is required for flammable chemicals');
        } else {
            const margin = flash_point_c - storage_temperature_c;
            if (margin < 30) {
                issues.push(
                    `Storage temperature margin to flash point is ${margin.toFixed(1)}°C (minimum 30°C required)`,
                );
            }
        }
    }

    return { compliant: issues.length === 0, issues };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const chemicalInventoryRiskMeta = {
    name: 'chemicalInventoryRisk',
    description: 'chemicalInventoryRisk',
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
