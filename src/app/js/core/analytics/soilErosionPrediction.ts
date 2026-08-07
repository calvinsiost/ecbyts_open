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
//

interface RainfallErosivityResult { R_MJ_mm_ha_h_yr: number; }
interface SoilErodibilityResult { K_t_ha_h_ha_MJ_mm: number; }
interface TopographicFactorResult { LS: number; }
interface ErosionRiskResult { risk: 'slight' | 'moderate' | 'high' | 'very_high' | 'severe'; }

/**
 * Soil Erosion Prediction - USLE/RUSLE Factors
 *
 * Implements the Universal Soil Loss Equation (USLE) factor computation for
 * environmental monitoring and remediation project planning.
 *
 * Academic references:
 *  - Renard, K.G. et al. (1997). Predicting Soil Erosion by Water: A Guide
 *    to Conservation Planning with the Revised Universal Soil Loss Equation.
 *    USDA Agricultural Handbook No. 703. ISBN:9780160489389
 *  - Wischmeier, W.H. & Smith, D.D. (1978). Predicting Rainfall Erosion
 *    Losses. USDA Agricultural Handbook No. 537. ISBN:9780160497599
 *  - McCool, D.K. et al. (1987). Revised slope steepness factor for the
 *    Universal Soil Loss Equation. Transactions of the ASAE, 30(5), 1387–1396.
 */

// Regiões válidas para o fator R de pluviosidade
const VALID_REGIONS = ['tropical_brazil', 'subtropical_brazil', 'semiarid', 'temperate'];

function _assertAllNumbers(entries: [string, number][]): void {
    for (const [name, val] of entries) {
        if (typeof val !== 'number') {
            throw new TypeError(`${name} must be a number`);
        }
    }
}

function _assertErodibilityRanges(
    sand_pct: number,
    silt_pct: number,
    clay_pct: number,
    organic_matter_pct: number,
    structure_code: number,
    permeability_code: number,
): void {
    if (sand_pct < 0 || sand_pct > 100) throw new RangeError('sand_pct must be 0–100');
    if (silt_pct < 0 || silt_pct > 100) throw new RangeError('silt_pct must be 0–100');
    if (clay_pct < 0 || clay_pct > 100) throw new RangeError('clay_pct must be 0–100');
    if (organic_matter_pct < 0 || organic_matter_pct > 100) throw new RangeError('organic_matter_pct must be 0–100');
    if (structure_code < 1 || structure_code > 4 || !Number.isInteger(structure_code)) {
        throw new RangeError('structure_code must be an integer 1–4');
    }
    if (permeability_code < 1 || permeability_code > 6 || !Number.isInteger(permeability_code)) {
        throw new RangeError('permeability_code must be an integer 1–6');
    }
}

/**
 * Calcula o Fator R de Erosividade da Chuva (USLE/RUSLE).
 * Multiplica a erosividade base por coeficiente regional (Renard 1997).
 *
 * @param {number} annual_rainfall_mm - Precipitação anual em mm (> 0)
 * @param {string} region             - Região climática (ver VALID_REGIONS)
 * @returns {{ R_MJ_mm_ha_h_yr: number }}
 */
export function computeRainfallErosivityFactor(annual_rainfall_mm: number, region: string): RainfallErosivityResult {
    if (typeof annual_rainfall_mm !== 'number') {
        throw new TypeError('annual_rainfall_mm must be a number');
    }
    if (typeof region !== 'string') {
        throw new TypeError('region must be a string');
    }
    if (annual_rainfall_mm <= 0) {
        throw new RangeError('annual_rainfall_mm must be > 0');
    }
    if (!VALID_REGIONS.includes(region)) {
        throw new RangeError(`region must be one of: ${VALID_REGIONS.join(', ')}`);
    }

    // Erosividade base: equação linear (Renard 1997, adaptação tropical)
    const R_base = 0.017 * annual_rainfall_mm + 0.45;

    // Coeficientes regionais de ajuste para condicoes brasileiras e temperadas
    const regionMultipliers: Record<string, number> = {
        tropical_brazil: 6.0,
        subtropical_brazil: 3.5,
        semiarid: 1.8,
        temperate: 1.0,
    };

    const R_MJ_mm_ha_h_yr = R_base * regionMultipliers[region]!;

    return { R_MJ_mm_ha_h_yr };
}

/**
 * Calcula o Fator K de Erodibilidade do Solo pelo nomograma de Wischmeier & Smith (1978).
 * Integra textura, matéria orgânica, estrutura e permeabilidade do solo.
 *
 * @param {number} sand_pct             - Teor de areia em % (0–100)
 * @param {number} silt_pct             - Teor de silte em % (0–100)
 * @param {number} clay_pct             - Teor de argila em % (0–100)
 * @param {number} organic_matter_pct   - Teor de matéria orgânica em % (0–100)
 * @param {number} structure_code       - Código de estrutura do solo (1–4)
 * @param {number} permeability_code    - Código de permeabilidade (1–6)
 * @returns {{ K_t_ha_h_ha_MJ_mm: number }}
 */
export function computeSoilErodibilityFactor(
    sand_pct: number,
    silt_pct: number,
    clay_pct: number,
    organic_matter_pct: number,
    structure_code: number,
    permeability_code: number,
): SoilErodibilityResult {
    _assertAllNumbers([
        ['sand_pct', sand_pct],
        ['silt_pct', silt_pct],
        ['clay_pct', clay_pct],
        ['organic_matter_pct', organic_matter_pct],
        ['structure_code', structure_code],
        ['permeability_code', permeability_code],
    ]);
    _assertErodibilityRanges(sand_pct, silt_pct, clay_pct, organic_matter_pct, structure_code, permeability_code);

    // M = (silte + areia muito fina estimada) × (100 - argila)
    // Areia muito fina estimada ≈ 10% da areia total (aproximação de campo)
    const very_fine_sand_approx = sand_pct * 0.1;
    const M = (silt_pct + very_fine_sand_approx) * (100 - clay_pct);

    // Nomograma de Wischmeier & Smith (1978): equação linearizada
    const OM = organic_matter_pct;
    const S = structure_code;
    const P = permeability_code;
    const K_t_ha_h_ha_MJ_mm = (2.1e-4 * Math.pow(M, 1.14) * (12 - OM) + 3.25 * (S - 2) + 2.5 * (P - 3)) / 100;

    return { K_t_ha_h_ha_MJ_mm };
}

/**
 * Calcula o Fator LS Topográfico da USLE (comprimento e declividade da encosta).
 * Combina fator L (comprimento) e S (declividade) conforme McCool et al. (1987).
 *
 * @param {number} slope_pct       - Declividade da encosta em % (≥ 0)
 * @param {number} slope_length_m  - Comprimento da encosta em metros (> 0)
 * @returns {{ LS: number }}
 */
export function computeTopographicFactor(slope_pct: number, slope_length_m: number): TopographicFactorResult {
    if (typeof slope_pct !== 'number' || typeof slope_length_m !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (slope_pct < 0) {
        throw new RangeError('slope_pct must be >= 0');
    }
    if (slope_length_m <= 0) {
        throw new RangeError('slope_length_m must be > 0');
    }

    // Expoente m depende da declividade (McCool 1987)
    let m: number;
    if (slope_pct > 5) {
        m = 0.5;
    } else if (slope_pct >= 3.5) {
        m = 0.4;
    } else if (slope_pct >= 1) {
        m = 0.3;
    } else {
        m = 0.2;
    }

    // Fator L: relação normalizada para comprimento padrão de 22,13 m
    const L = Math.pow(slope_length_m / 22.13, m);

    // Ângulo de inclinação em radianos
    const theta = Math.atan(slope_pct / 100);

    // Fator S: equação diferenciada por limiar de declividade (McCool 1987)
    const S = slope_pct < 9 ? 10.8 * Math.sin(theta) + 0.03 : 16.8 * Math.sin(theta) - 0.5;

    const LS = L * S;

    return { LS };
}

/**
 * Classifica o risco de erosão do solo com base na perda anual estimada.
 * Escala FAO para gestão de solos em projetos ambientais.
 *
 * @param {number} annual_loss_t_ha_yr - Perda anual de solo em t/ha/ano (≥ 0)
 * @returns {{ risk: 'slight'|'moderate'|'high'|'very_high'|'severe' }}
 */
export function classifySoilErosionRisk(annual_loss_t_ha_yr: number): ErosionRiskResult {
    if (typeof annual_loss_t_ha_yr !== 'number') {
        throw new TypeError('annual_loss_t_ha_yr must be a number');
    }
    if (annual_loss_t_ha_yr < 0) {
        throw new RangeError('annual_loss_t_ha_yr must be >= 0');
    }

    let risk: 'slight' | 'moderate' | 'high' | 'very_high' | 'severe';
    if (annual_loss_t_ha_yr < 5) {
        risk = 'slight';
    } else if (annual_loss_t_ha_yr < 15) {
        risk = 'moderate';
    } else if (annual_loss_t_ha_yr < 30) {
        risk = 'high';
    } else if (annual_loss_t_ha_yr < 60) {
        risk = 'very_high';
    } else {
        risk = 'severe';
    }

    return { risk };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilErosionPredictionMeta = {
    name: 'soilErosionPrediction',
    description: 'soilErosionPrediction',
    category: 'analytics',
    familyTags: ['soil', 'hydrocarbon', 'erosion'],
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
