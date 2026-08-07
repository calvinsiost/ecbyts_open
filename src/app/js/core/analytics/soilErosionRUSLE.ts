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
// Application: EHS & Mining - Soil Erosion RUSLE
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Soil Erosion - RUSLE (Revised Universal Soil Loss Equation)
 *
 * Módulo puro implementando o modelo RUSLE para estimativa de erosão hídrica
 * do solo. Calcula os fatores R, K, LS e a equação completa A = R×K×LS×C×P.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Wischmeier, W. H. & Smith, D. D. (1978). Predicting rainfall erosion
 *     losses - a guide to conservation planning. USDA Agriculture Handbook
 *     No. 537. Washington, DC: US Government Printing Office.
 *     (equação USLE, fator K nomograph, fator LS)
 *   - Renard, K. G., Foster, G. R., Weesies, G. A., McCool, D. K. & Yoder,
 *     D. C. (1997). Predicting soil erosion by water: a guide to conservation
 *     planning with the Revised Universal Soil Loss Equation (RUSLE). USDA
 *     Agriculture Handbook No. 703. Washington, DC: USDA ARS.
 *     (fator R, refinamentos RUSLE)
 *
 * @module soilErosionRUSLE
 */

'use strict';

// ─── Rainfall Erosivity Factor (R) ───────────────────────────────────────────

/**
 * Compute the Rainfall Erosivity Factor (R).
 * Calcula o fator de erosividade da chuva R (MJ·mm/ha·h·yr).
 *
 * Aproximação de Renard et al. (1997): R = 0.548 × P^1.21
 * onde P é a precipitação anual em mm.
 *
 * @param {number} annualRainfall_mm - Precipitação anual (mm). Deve ser > 0.
 * @returns {number} Fator R em MJ·mm/(ha·h·yr).
 * @throws {RangeError} Se annualRainfall_mm <= 0.
 */
export function computeRainfallErosivity(annualRainfall_mm: number): number {
    if (typeof annualRainfall_mm !== 'number' || !Number.isFinite(annualRainfall_mm)) {
        throw new TypeError('annualRainfall_mm must be a finite number');
    }
    if (annualRainfall_mm <= 0) {
        throw new RangeError('annualRainfall_mm must be > 0');
    }
    // R = 0.548 × P^1.21  (Renard et al. 1997, eq. approximation for annual P)
    return 0.548 * Math.pow(annualRainfall_mm, 1.21);
}

// ─── Soil Erodibility Factor (K) ─────────────────────────────────────────────

function _assertAllFinite(entries: [string, number][]): void {
    for (const [name, val] of entries) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} must be a finite number`);
        }
    }
}

function _assertErodibilityRanges(
    siltFraction: number,
    sandFraction: number,
    organicMatter: number,
    structureCode: number,
    permeabilityCode: number,
): void {
    if (siltFraction < 0 || siltFraction > 1) throw new RangeError('siltFraction must be between 0 and 1');
    if (sandFraction < 0 || sandFraction > 1) throw new RangeError('sandFraction must be between 0 and 1');
    if (siltFraction + sandFraction > 1) throw new RangeError('siltFraction + sandFraction must not exceed 1');
    if (organicMatter < 0 || organicMatter > 100) throw new RangeError('organicMatter must be between 0 and 100');
    if (structureCode < 1 || structureCode > 4 || !Number.isInteger(structureCode)) {
        throw new RangeError('structureCode must be integer 1–4');
    }
    if (permeabilityCode < 1 || permeabilityCode > 6 || !Number.isInteger(permeabilityCode)) {
        throw new RangeError('permeabilityCode must be integer 1–6');
    }
}

/**
 * Compute the Soil Erodibility Factor (K) via the Wischmeier & Smith (1978)
 * nomograph equation.
 * Calcula o fator K de erodibilidade do solo (t·h/MJ·mm).
 *
 * Equação nomograph:
 *   100K = 2.1×10⁻⁴×M^1.14×(12-a) + 3.25×(b-2) + 2.5×(c-3)
 * onde M = (silt+vfSand) × (100-clay) - mas simplificado para fração silte
 * conforme entrada fornecida.
 *
 * @param {number} siltFraction    - Fração silte (0–1).
 * @param {number} sandFraction    - Fração areia (0–1); argila = 1 - silte - areia.
 * @param {number} organicMatter   - Matéria orgânica (%; 0–100).
 * @param {number} structureCode   - Código de estrutura (1=granular muito fina,
 *                                   2=granular fina, 3=granular média/grossa,
 *                                   4=blocos/laminar/maciço).
 * @param {number} permeabilityCode - Código de permeabilidade (1=rápida a 6=lenta).
 * @returns {number} Fator K em t·h/(MJ·mm).
 * @throws {RangeError} Se frações fora do intervalo válido.
 * @throws {TypeError} Se parâmetros não forem números.
 */
export function computeErodibility(siltFraction: number, sandFraction: number, organicMatter: number, structureCode: number, permeabilityCode: number): number {
    _assertAllFinite([
        ['siltFraction', siltFraction],
        ['sandFraction', sandFraction],
        ['organicMatter', organicMatter],
        ['structureCode', structureCode],
        ['permeabilityCode', permeabilityCode],
    ]);
    _assertErodibilityRanges(siltFraction, sandFraction, organicMatter, structureCode, permeabilityCode);

    const clayFraction = 1 - siltFraction - sandFraction;
    // M = (% silt + % very fine sand) × (100 - % clay)
    // Simplificação: usamos siltFraction × 100 como proxy para (silt + vfSand)%
    const siltPct = siltFraction * 100;
    const clayPct = clayFraction * 100;
    const M = siltPct * (100 - clayPct);

    // Equação nomograph Wischmeier & Smith (1978):
    // 100K = 2.1×10^-4 × M^1.14 × (12-OM) + 3.25×(b-2) + 2.5×(c-3)
    const term1 = 2.1e-4 * Math.pow(M, 1.14) * (12 - organicMatter);
    const term2 = 3.25 * (structureCode - 2);
    const term3 = 2.5 * (permeabilityCode - 3);
    const hundredK = term1 + term2 + term3;
    return Math.max(0, hundredK / 100);
}

// ─── Topographic Factor (LS) ─────────────────────────────────────────────────

/**
 * Compute the combined Topographic Factor (LS).
 * Calcula o fator topográfico LS combinado (adimensional).
 *
 * L = (λ / 22.13)^m  onde m depende da inclinação:
 *   slope ≥ 5%  → m = 0.5
 *   3% ≤ s < 5% → m = 0.4
 *   1% ≤ s < 3% → m = 0.3
 *   s < 1%      → m = 0.2
 *
 * S = 10.8×sin(θ)+0.03  se slope < 9%
 * S = 16.8×sin(θ)-0.50  se slope ≥ 9%
 *
 * @param {number} slopeLength_m      - Comprimento do declive λ (m). Deve ser > 0.
 * @param {number} slopeSteepness_pct - Inclinação s (%). Deve ser >= 0.
 * @returns {number} Fator LS (adimensional).
 * @throws {RangeError} Se parâmetros fora do intervalo válido.
 */
export function computeTopographicFactor(slopeLength_m: number, slopeSteepness_pct: number): number {
    if (typeof slopeLength_m !== 'number' || !Number.isFinite(slopeLength_m)) {
        throw new TypeError('slopeLength_m must be a finite number');
    }
    if (typeof slopeSteepness_pct !== 'number' || !Number.isFinite(slopeSteepness_pct)) {
        throw new TypeError('slopeSteepness_pct must be a finite number');
    }
    if (slopeLength_m <= 0) {
        throw new RangeError('slopeLength_m must be > 0');
    }
    if (slopeSteepness_pct < 0) {
        throw new RangeError('slopeSteepness_pct must be >= 0');
    }

    // Exponent m based on slope steepness
    let m: number;
    if (slopeSteepness_pct >= 5) {
        m = 0.5;
    } else if (slopeSteepness_pct >= 3) {
        m = 0.4;
    } else if (slopeSteepness_pct >= 1) {
        m = 0.3;
    } else {
        m = 0.2;
    }

    // L factor - fator comprimento do declive
    const L = Math.pow(slopeLength_m / 22.13, m);

    // Convert slope percent to angle in radians
    const theta = Math.atan(slopeSteepness_pct / 100);

    // S factor - fator inclinação
    let S: number;
    if (slopeSteepness_pct < 9) {
        S = 10.8 * Math.sin(theta) + 0.03;
    } else {
        S = 16.8 * Math.sin(theta) - 0.5;
    }

    return L * S;
}

// ─── RUSLE Soil Loss (A) ──────────────────────────────────────────────────────

/**
 * Compute annual soil loss via the RUSLE equation: A = R × K × LS × C × P.
 * Calcula a perda de solo anual A (t/ha/yr) pela equação RUSLE completa.
 *
 * @param {number} R  - Fator de erosividade da chuva (MJ·mm/ha·h·yr).
 * @param {number} K  - Fator de erodibilidade do solo (t·h/MJ·mm).
 * @param {number} LS - Fator topográfico (adimensional).
 * @param {number} C  - Fator de cobertura e manejo (0–1; 1 = solo nu).
 * @param {number} P  - Fator de práticas conservacionistas (0–1; 1 = sem prática).
 * @returns {number} Perda de solo A em t/ha/yr.
 * @throws {RangeError} Se qualquer fator for negativo.
 */
export function computeSoilLoss(R: number, K: number, LS: number, C: number, P: number): number {
    for (const [name, val] of [
        ['R', R],
        ['K', K],
        ['LS', LS],
        ['C', C],
        ['P', P],
    ] as [string, number][]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} must be a finite number`);
        }
        if (val < 0) {
            throw new RangeError(`${name} must be >= 0`);
        }
    }
    return R * K * LS * C * P;
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilErosionRUSLEMeta = {
    name: 'soilErosionRUSLE',
    description: 'Soil Erosion RUSLE',
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
