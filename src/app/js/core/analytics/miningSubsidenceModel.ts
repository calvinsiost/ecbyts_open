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
 * Mining Subsidence Model - Surface Deformation Prediction
 *
 * Módulo puro para modelagem de subsidência mineira em superfície.
 * Implementa o modelo empírico do National Coal Board (NCB) com perfil gaussiano
 * e classificação de dano por deformação horizontal.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - National Coal Board (1975). Subsidence Engineer's Handbook. 2nd ed.
 *     London: National Coal Board Production Dept. ISBN:9780900117862
 *   - Peng, S. S. (1992). Surface Subsidence Engineering. Littleton, CO:
 *     Society for Mining, Metallurgy & Exploration. ISBN:9780873350556
 *   - Kratzsch, H. (1983). Mining Subsidence Engineering. Berlin: Springer.
 *     DOI: 10.1007/978-3-642-81923-0
 */

/**
 * Compute maximum subsidence from longwall mining extraction parameters.
 * Calcula subsidência máxima em superfície pela extração em painel de longwall.
 *
 * Smax = a × M × (W / H)²   para W/H ≤ 1.4 (subcritical)
 * Smax = a × M              para W/H > 1.4 (supercritical) - bounded above by a×M
 *
 * Onde a ≈ 0.9 para carvão betuminoso (NCB 1975, Table 3.1)
 *
 * @param {number} extraction_height_m - Seam extraction height in metres / Altura de extração em metros
 * @param {number} width_m - Panel width in metres / Largura do painel em metros
 * @param {number} depth_m - Mining depth (cover depth) in metres / Profundidade de mineração em metros
 * @returns {{ Smax_m: number }} Maximum surface subsidence in metres
 * @throws {TypeError} If any parameter is not a positive number
 * @throws {RangeError} If any parameter is <= 0
 */
export function computeMaxSubsidence(extraction_height_m: any, width_m: any, depth_m: any) {
    if (typeof extraction_height_m !== 'number') throw new TypeError('extraction_height_m must be a number');
    if (typeof width_m !== 'number') throw new TypeError('width_m must be a number');
    if (typeof depth_m !== 'number') throw new TypeError('depth_m must be a number');
    if (extraction_height_m <= 0) throw new RangeError('extraction_height_m must be > 0');
    if (width_m <= 0) throw new RangeError('width_m must be > 0');
    if (depth_m <= 0) throw new RangeError('depth_m must be > 0');

    // Fator de subsidência para carvão betuminoso / Subsidence factor for bituminous coal
    const a = 0.9;

    // Razão painel/profundidade / Panel-to-depth ratio
    const ratio = width_m / depth_m;

    let Smax_m;
    if (ratio >= 1.4) {
        // Painel supercrítico: subsidência plena / Supercritical panel: full subsidence
        Smax_m = a * extraction_height_m;
    } else {
        // Painel subcrítico: subsidência reduzida / Subcritical panel: reduced subsidence
        Smax_m = a * extraction_height_m * ratio * ratio;
    }

    return { Smax_m };
}

/**
 * Compute surface subsidence profile at horizontal distance x from panel centre.
 * Calcula o perfil de subsidência na superfície à distância horizontal x do centro do painel.
 *
 * S(x) = Smax × exp(-π × (x / R)²)   onde R = 0.35 × H (raio de influência, NCB 1975)
 *
 * @param {number} x_m - Horizontal distance from panel centre in metres / Distância horizontal do centro em metros
 * @param {number} R_m - Radius of influence in metres; use depth × 0.35 / Raio de influência em metros
 * @param {number} Smax_m - Maximum subsidence in metres / Subsidência máxima em metros
 * @returns {{ S_m: number }} Subsidence at distance x in metres
 * @throws {TypeError} If any parameter is not a number
 * @throws {RangeError} If R_m or Smax_m <= 0
 */
export function computeSubsidenceProfile(x_m: any, R_m: any, Smax_m: any) {
    if (typeof x_m !== 'number') throw new TypeError('x_m must be a number');
    if (typeof R_m !== 'number') throw new TypeError('R_m must be a number');
    if (typeof Smax_m !== 'number') throw new TypeError('Smax_m must be a number');
    if (R_m <= 0) throw new RangeError('R_m must be > 0');
    if (Smax_m < 0) throw new RangeError('Smax_m must be >= 0');

    // Perfil gaussiano de subsidência / Gaussian subsidence profile
    const S_m = Smax_m * Math.exp(-Math.PI * (x_m / R_m) ** 2);

    return { S_m };
}

/**
 * Compute horizontal tensile/compressive strain at surface due to subsidence.
 * Calcula deformação horizontal (tração/compressão) na superfície por subsidência.
 *
 * ε(x) = Smax × (2π × x / R²) × exp(-π × (x/R)²) × 1000  [mm/m]
 *
 * Derivada do perfil gaussiano de subsidência (NCB 1975, eq. 3.7)
 *
 * @param {number} Smax_m - Maximum subsidence in metres / Subsidência máxima em metros
 * @param {number} R_m - Radius of influence in metres / Raio de influência em metros
 * @param {number} x_m - Horizontal distance from panel centre in metres / Distância do centro em metros
 * @returns {{ strain_mm_m: number }} Horizontal strain in mm/m (positive = tensile)
 * @throws {TypeError} If any parameter is not a number
 * @throws {RangeError} If R_m <= 0 or Smax_m < 0
 */
export function computeHorizontalStrain(Smax_m: any, R_m: any, x_m: any) {
    if (typeof Smax_m !== 'number') throw new TypeError('Smax_m must be a number');
    if (typeof R_m !== 'number') throw new TypeError('R_m must be a number');
    if (typeof x_m !== 'number') throw new TypeError('x_m must be a number');
    if (R_m <= 0) throw new RangeError('R_m must be > 0');
    if (Smax_m < 0) throw new RangeError('Smax_m must be >= 0');

    // Derivada da função gaussiana (deformação horizontal) convertida para mm/m
    const strain_mm_m = Smax_m * ((2 * Math.PI * x_m) / R_m ** 2) * Math.exp(-Math.PI * (x_m / R_m) ** 2) * 1000;

    return { strain_mm_m };
}

/**
 * Classify subsidence damage category based on horizontal ground strain.
 * Classifica a categoria de dano à superfície com base na deformação horizontal.
 *
 * Damage categories (NCB 1975, Table 5.1):
 *   negligible:   |ε| < 0.5 mm/m
 *   very_slight:  0.5 <= |ε| < 1.5 mm/m
 *   slight:       1.5 <= |ε| < 3.0 mm/m
 *   moderate:     3.0 <= |ε| < 6.0 mm/m
 *   severe:       |ε| >= 6.0 mm/m
 *
 * @param {number} strain_mm_m - Horizontal strain in mm/m / Deformação horizontal em mm/m
 * @returns {{ category: string }} Damage category
 * @throws {TypeError} If strain_mm_m is not a number
 */
export function classifySubsidenceDamage(strain_mm_m: any) {
    if (typeof strain_mm_m !== 'number') throw new TypeError('strain_mm_m must be a number');

    // Deformação é avaliada em valor absoluto / Strain evaluated as absolute magnitude
    const absStrain = Math.abs(strain_mm_m);

    let category;
    if (absStrain < 0.5) {
        category = 'negligible';
    } else if (absStrain < 1.5) {
        category = 'very_slight';
    } else if (absStrain < 3.0) {
        category = 'slight';
    } else if (absStrain < 6.0) {
        category = 'moderate';
    } else {
        category = 'severe';
    }

    return { category };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const miningSubsidenceModelMeta = {
    name: 'miningSubsidenceModel',
    description: 'miningSubsidenceModel',
    category: 'analytics',
    familyTags: ['mining', 'landslide'],
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
