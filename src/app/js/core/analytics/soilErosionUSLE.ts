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
 * soilErosionUSLE.js - Universal Soil Loss Equation (USLE/RUSLE2)
 *
 * Implements RUSLE2 (Revised Universal Soil Loss Equation, Renard et al. 1997)
 * for estimating annual average soil loss from sheet and rill erosion.
 *
 * Referências / References:
 *   - Renard, K.G. et al. (1997). Predicting Soil Erosion by Water: A Guide to Conservation
 *     Planning with the Revised Universal Soil Loss Equation (RUSLE). USDA AH-703.
 *   - Wischmeier, W.H. & Smith, D.D. (1978). Predicting Rainfall Erosion Losses.
 *     USDA AH-537.
 *   - FAO (1979). A Provisional Methodology for Soil Degradation Assessment.
 *     Rome: Food and Agriculture Organization.
 */

'use strict';

/**
 * Regionais simplificados para fator R (MJ·mm/ha·h·yr) por precipitação anual.
 * Baseado em médias publicadas para biomas brasileiros e referências FAO/USDA.
 *
 * @private
 * @type {Record<string, { a: number, b: number }>}
 */
const REGION_COEFFICIENTS = {
    /** Coeficiente linear simplificado para equação R ≈ a + b × P */
    tropical_humid: { a: 100, b: 1.5 }, // Amazônia, Mata Atlântica
    tropical_semi: { a: 50, b: 0.8 }, // Cerrado, Caatinga
    subtropical: { a: 80, b: 1.2 }, // Sul do Brasil
    temperate: { a: 40, b: 0.7 }, // zonas temperadas
    mediterranean: { a: 30, b: 0.6 }, // clima mediterrâneo
    default: { a: 60, b: 1.0 }, // genérico
};

/**
 * Calcula o fator R de erosividade da chuva.
 *
 * Equação simplificada regional: R = a + b × P
 * onde P é a precipitação anual (mm) e a, b são coeficientes regionais.
 *
 * Para estimativa rigorosa, utilizar séries de intensidade I30 conforme AH-703.
 *
 * @param {number} annualPrecip_mm - Precipitação anual total (mm). Deve ser > 0.
 * @param {string} [region='default'] - Região climática. Chaves válidas: ver REGION_COEFFICIENTS.
 * @returns {number} Fator R (MJ·mm/ha·h·yr).
 * @throws {RangeError} Se annualPrecip_mm <= 0.
 *
 * Ref: Renard et al. (1997) USDA AH-703, Chap. 2; Wischmeier & Smith (1978) AH-537.
 */
export function calcRainfallErosivity(annualPrecip_mm: any, region = 'default') {
    if (!Number.isFinite(annualPrecip_mm) || annualPrecip_mm <= 0) {
        throw new RangeError(`annualPrecip_mm deve ser > 0; recebido: ${annualPrecip_mm}`);
    }
const coef = (REGION_COEFFICIENTS as any)[region] ?? REGION_COEFFICIENTS.default;
    return coef.a + coef.b * annualPrecip_mm;
}

/**
 * Calcula o fator K de erodibilidade do solo.
 *
 * Equação de Wischmeier & Smith (1978), Eq. 3 simplificada:
 *   K ≈ 0.00021 × M^1.14 × (12 - OM) × fS × fP / 100
 *
 * onde M = (% silte + % areia muito fina) × (100 - % argila),
 * OM = matéria orgânica (%), fS = classe de estrutura (1-4), fP = permeabilidade (1-6).
 *
 * @param {number} sand_pct   - Areia total (%). [0, 100]
 * @param {number} silt_pct   - Silte (%). [0, 100]
 * @param {number} clay_pct   - Argila (%). [0, 100]
 * @param {number} organicMatter_pct - Matéria orgânica (%). [0, 100]
 * @param {number} structure  - Código de estrutura do solo (1=granular muito fina, 4=laminar). [1,4]
 * @param {number} permeability - Código de permeabilidade (1=muito rápido, 6=muito lento). [1,6]
 * @returns {number} Fator K (t·h/MJ·mm).
 * @throws {RangeError} Para inputs fora dos intervalos válidos.
 * @throws {TypeError} Se areia+silte+argila > 110 (tolerância de arredondamento).
 *
 * Ref: Wischmeier, W.H. & Smith, D.D. (1978) AH-537, Eq. 3, p. 8.
 */
export function calcSoilErodibility(sand_pct: any, silt_pct: any, clay_pct: any, organicMatter_pct: any, structure: any, permeability: any) {
    /** @type {Array<[string, number]>} */
    const sandSiltClayPairs = [
        ['sand_pct', sand_pct],
        ['silt_pct', silt_pct],
        ['clay_pct', clay_pct],
    ];
    for (const [name, val] of sandSiltClayPairs) {
        if (!Number.isFinite(val) || val < 0 || val > 100) {
            throw new RangeError(`${name} deve estar em [0, 100]; recebido: ${val}`);
        }
    }
    if (sand_pct + silt_pct + clay_pct > 110) {
        throw new TypeError(`soma areia+silte+argila (${sand_pct + silt_pct + clay_pct}) excede 110%`);
    }
    if (!Number.isFinite(organicMatter_pct) || organicMatter_pct < 0 || organicMatter_pct > 100) {
        throw new RangeError(`organicMatter_pct deve estar em [0, 100]; recebido: ${organicMatter_pct}`);
    }
    if (!Number.isInteger(structure) || structure < 1 || structure > 4) {
        throw new RangeError(`structure deve ser inteiro em [1, 4]; recebido: ${structure}`);
    }
    if (!Number.isInteger(permeability) || permeability < 1 || permeability > 6) {
        throw new RangeError(`permeability deve ser inteiro em [1, 6]; recebido: ${permeability}`);
    }

    // M = (silte + areia muito fina) × (100 - argila); aproxima areia muito fina como 10% da areia total
    const very_fine_sand = sand_pct * 0.1;
    const M = (silt_pct + very_fine_sand) * (100 - clay_pct);

    // OM limitado a 4% na equação original
    const om = Math.min(organicMatter_pct, 4.0);

    // Equação AH-537 Eq. 3 convertida para SI
    // K [t·h/MJ·mm] ≈ 0.00021 × M^1.14 × (12 - OM) × structure × permeability / 100
    const K = (0.00021 * Math.pow(M, 1.14) * (12 - om) * structure * permeability) / 100;

    return Math.max(0, K);
}

/**
 * Calcula o fator LS combinado de comprimento e declividade da encosta.
 *
 * Equações:
 *   L = (λ / 22.13)^m   onde m = 0.5 se θ > 5%, 0.4 se 3-5%, 0.3 se 1-3%, 0.2 se < 1%
 *   S = 10.8 × sin(θ) + 0.03       (θ < 9%)
 *   S = 16.8 × sin(θ) - 0.50       (θ ≥ 9%)
 *
 * @param {number} length_m   - Comprimento da encosta (m). Deve ser > 0.
 * @param {number} slope_pct  - Declividade em % (%). Deve ser >= 0.
 * @returns {number} Fator LS (adimensional).
 * @throws {RangeError} Para inputs inválidos.
 *
 * Ref: Wischmeier & Smith (1978) AH-537, p. 12-14; Renard et al. (1997) AH-703, Chap. 4.
 */
export function calcSlopeLengthFactor(length_m: any, slope_pct: any) {
    if (!Number.isFinite(length_m) || length_m <= 0) {
        throw new RangeError(`length_m deve ser > 0; recebido: ${length_m}`);
    }
    if (!Number.isFinite(slope_pct) || slope_pct < 0) {
        throw new RangeError(`slope_pct deve ser >= 0; recebido: ${slope_pct}`);
    }

    // Expoente m em função da declividade
    let m;
    if (slope_pct > 5) m = 0.5;
    else if (slope_pct >= 3) m = 0.4;
    else if (slope_pct >= 1) m = 0.3;
    else m = 0.2;

    const L = Math.pow(length_m / 22.13, m);

    const theta = Math.atan(slope_pct / 100); // radianos
    const sinTheta = Math.sin(theta);

    const S = slope_pct < 9 ? 10.8 * sinTheta + 0.03 : 16.8 * sinTheta - 0.5;

    return L * S;
}

/**
 * Calcula a perda anual de solo pela equação USLE/RUSLE2.
 *
 * A = R × K × LS × C × P
 *
 * @param {number} R  - Erosividade da chuva (MJ·mm/ha·h·yr).
 * @param {number} K  - Erodibilidade do solo (t·h/MJ·mm).
 * @param {number} LS - Fator comprimento-declividade (adimensional).
 * @param {number} C  - Fator cobertura e manejo (0–1).
 * @param {number} P  - Fator prática conservacionista (0–1).
 * @returns {number} Perda anual de solo A (t/ha/yr).
 * @throws {RangeError} Para inputs negativos ou C/P fora de [0,1].
 *
 * Ref: Renard et al. (1997) USDA AH-703, Eq. 2.1; Wischmeier & Smith (1978) AH-537.
 */
export function calcAnnualSoilLoss(R: any, K: any, LS: any, C: any, P: any) {
    /** @type {Array<[string, number]>} */
    const rkLsPairs = [
        ['R', R],
        ['K', K],
        ['LS', LS],
    ];
    for (const [n, v] of rkLsPairs) {
        if (!Number.isFinite(v) || v < 0) throw new RangeError(`${n} deve ser >= 0; recebido: ${v}`);
    }
    /** @type {Array<[string, number]>} */
    const cpPairs = [
        ['C', C],
        ['P', P],
    ];
    for (const [n, v] of cpPairs) {
        if (!Number.isFinite(v) || v < 0 || v > 1) throw new RangeError(`${n} deve estar em [0, 1]; recebido: ${v}`);
    }
    return R * K * LS * C * P;
}

/**
 * Classifica a severidade de erosão hídrica com base na perda anual de solo.
 *
 * Classes FAO (1979):
 *   slight      < 10 t/ha/yr
 *   moderate    10–50 t/ha/yr
 *   high        50–200 t/ha/yr
 *   very_high   200–400 t/ha/yr
 *   severe      > 400 t/ha/yr
 *
 * @param {number} A_t_ha_yr - Perda anual de solo (t/ha/yr). Deve ser >= 0.
 * @returns {'slight'|'moderate'|'high'|'very_high'|'severe'} Classe de severidade.
 * @throws {RangeError} Se A_t_ha_yr < 0 ou não for finito.
 *
 * Ref: FAO (1979). A Provisional Methodology for Soil Degradation Assessment. Rome.
 */
export function classifyErosionSeverity(A_t_ha_yr: any) {
    if (!Number.isFinite(A_t_ha_yr) || A_t_ha_yr < 0) {
        throw new RangeError(`A_t_ha_yr deve ser >= 0; recebido: ${A_t_ha_yr}`);
    }
    if (A_t_ha_yr < 10) return 'slight';
    if (A_t_ha_yr < 50) return 'moderate';
    if (A_t_ha_yr < 200) return 'high';
    if (A_t_ha_yr < 400) return 'very_high';
    return 'severe';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilErosionUSLEMeta = {
    name: 'soilErosionUSLE',
    description: 'soilErosionUSLE',
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
