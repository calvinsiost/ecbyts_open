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
 * Soil Erosion Risk Classification
 *
 * Classifies soil erosion risk using the USLE K factor and tolerance (T).
 * Provides erodibility index, loss/tolerance ratio, erosion degree, and
 * remaining agricultural aptitude.
 *
 * References:
 * - FAO/GLASOD (1990). World Assessment of Soil Degradation (GLASOD).
 *   https://www.fao.org/soils-portal/data-hub/soil-maps-and-databases/glasod/en/
 * - Lepsch, I.F. et al. (2015). Manual para Levantamento Utilitario e Classificacao
 *   de Terras no Sistema de Capacidade de Uso. SBCS, Vicosa, MG.
 * - Wischmeier, W.H. & Smith, D.D. (1978). Predicting Rainfall Erosion Losses.
 *   USDA Agriculture Handbook No. 537.
 * - Renard, K.G. et al. (1997). RUSLE - Predicting Soil Erosion by Water.
 *   USDA Agriculture Handbook No. 703.
 *
 * @module soilErosionRiskClassification
 */

/**
 * USLE K factor lookup by soil texture class.
 * Values in Mg*h/(MJ*mm) (SI). Source: Wischmeier & Smith 1978, Table 2.
 *
 * Fator K de erodibilidade pelo tipo textural do solo (Mg*h/(MJ*mm)).
 */
const K_BY_TEXTURE: Record<string, number> = {
    sand: 0.05,
    loamy_sand: 0.09,
    sandy_loam: 0.13,
    loam: 0.26,
    silt_loam: 0.38,
    silt: 0.48,
    sandy_clay_loam: 0.22,
    clay_loam: 0.28,
    silty_clay_loam: 0.37,
    sandy_clay: 0.14,
    silty_clay: 0.25,
    clay: 0.13,
};

/**
 * Returns the USLE K erodibility factor for a given soil texture class.
 *
 * Retorna o fator K de erodibilidade para uma classe textural de solo.
 *
 * @param {string} textureClass - Texture class key (e.g. 'clay_loam')
 * @returns {number} K factor in Mg*h/(MJ*mm)
 * @throws {TypeError} If textureClass is not a string
 * @throws {RangeError} If textureClass is not a recognized class
 */
export function erodibilityFactor(textureClass: string): number {
    if (typeof textureClass !== 'string') {
        throw new TypeError('textureClass deve ser uma string');
    }
    const k = K_BY_TEXTURE[textureClass];
    if (k === undefined) {
        throw new RangeError(
            `textureClass '${textureClass}' nao reconhecida. Validos: ${Object.keys(K_BY_TEXTURE).join(', ')}`,
        );
    }
    return k;
}

/**
 * Soil loss tolerance T (Mg/ha/ano) - maximum acceptable annual soil loss.
 * Based on Lepsch et al. (2015) and USDA AH-537 Table 5.
 *
 * Tolerancia de perda de solo T (Mg/ha/ano) para diferentes profundidades efetivas.
 *
 * @param {number} effectiveDepth - Profundidade efetiva do solo (cm)
 * @returns {number} T value in Mg/ha/year
 * @throws {RangeError} If effectiveDepth <= 0
 */
export function soilLossTolerance(effectiveDepth: number): number {
    if (typeof effectiveDepth !== 'number' || effectiveDepth <= 0) {
        throw new RangeError('effectiveDepth deve ser > 0 (cm)');
    }
    // Escalonamento linear adaptado de Lepsch et al. 2015 (Tabela 4.2)
    if (effectiveDepth < 25) return 2.5;
    if (effectiveDepth < 50) return 5.0;
    if (effectiveDepth < 100) return 7.5;
    if (effectiveDepth < 150) return 10.0;
    return 12.5;
}

/**
 * Predicted annual soil loss using USLE equation A = R*K*LS*C*P.
 *
 * Perda de solo anual predita pela Equacao Universal de Perda de Solo (EUPS/USLE).
 *
 * @param {number} R - Rainfall erosivity factor (MJ*mm/(ha*h*year))
 * @param {number} K - Soil erodibility factor (Mg*h/(MJ*mm))
 * @param {number} LS - Slope length-steepness factor (dimensionless)
 * @param {number} C - Cover-management factor [0,1]
 * @param {number} P - Support practice factor [0,1]
 * @returns {number} Annual soil loss A (Mg/ha/year)
 * @throws {RangeError} If any factor is out of expected range
 */
export function usleAnnualSoilLoss(R: number, K: number, LS: number, C: number, P: number): number {
    if (typeof R !== 'number' || R <= 0) throw new RangeError('R deve ser > 0');
    if (typeof K !== 'number' || K <= 0) throw new RangeError('K deve ser > 0');
    if (typeof LS !== 'number' || LS <= 0) throw new RangeError('LS deve ser > 0');
    if (typeof C !== 'number' || C < 0 || C > 1) throw new RangeError('C deve estar em [0,1]');
    if (typeof P !== 'number' || P < 0 || P > 1) throw new RangeError('P deve estar em [0,1]');
    return R * K * LS * C * P;
}

interface ErosionDegreeResult {
    ratio: number;
    degree: string;
    label: string;
}

/**
 * Erosion degree classification based on loss/tolerance ratio (A/T).
 *
 * Grau de erosao baseado na razao perda/tolerancia (A/T).
 * Adaptado de FAO/GLASOD 1990 e Lepsch et al. 2015.
 *
 * | Razao A/T | Grau                   |
 * |-----------|------------------------|
 * | <= 1      | Ligeiro                |
 * | 1–2       | Moderado               |
 * | 2–5       | Forte                  |
 * | 5–10      | Muito forte            |
 * | > 10      | Extremamente forte     |
 *
 * @param {number} annualLoss - Perda de solo A (Mg/ha/ano)
 * @param {number} tolerance - Tolerancia de perda T (Mg/ha/ano)
 * @returns {{ ratio: number, degree: string, label: string }}
 * @throws {RangeError} Se annualLoss < 0 ou tolerance <= 0
 */
export function erosionDegreeClassification(annualLoss: number, tolerance: number): ErosionDegreeResult {
    if (typeof annualLoss !== 'number' || annualLoss < 0) {
        throw new RangeError('annualLoss deve ser >= 0');
    }
    if (typeof tolerance !== 'number' || tolerance <= 0) {
        throw new RangeError('tolerance deve ser > 0');
    }
    const ratio = annualLoss / tolerance;
    if (ratio <= 1) return { ratio, degree: 'slight', label: 'Ligeiro' };
    if (ratio <= 2) return { ratio, degree: 'moderate', label: 'Moderado' };
    if (ratio <= 5) return { ratio, degree: 'strong', label: 'Forte' };
    if (ratio <= 10) return { ratio, degree: 'very_strong', label: 'Muito forte' };
    return { ratio, degree: 'extreme', label: 'Extremamente forte' };
}

interface AptitudeResult {
    aptitude: string;
    description: string;
}

/**
 * Remaining agricultural aptitude class based on erosion degree.
 *
 * Aptidao agricola remanescente conforme grau de erosao (Lepsch 2015 adaptado).
 *
 * @param {string} degree - Output from erosionDegreeClassification().degree
 * @returns {{ aptitude: string, description: string }}
 * @throws {TypeError} Se degree nao for string reconhecida
 */
export function remainingAgriculturalAptitude(degree: string): AptitudeResult {
    const map: Record<string, AptitudeResult> = {
        slight: { aptitude: 'I-II', description: 'Boa: uso agricola intensivo permitido' },
        moderate: { aptitude: 'III', description: 'Regular: uso agricola com praticas conservacionistas' },
        strong: { aptitude: 'IV-V', description: 'Restrita: pastagem ou reflorestamento recomendados' },
        very_strong: { aptitude: 'VI', description: 'Muito restrita: recomposicao de cobertura vegetal' },
        extreme: { aptitude: 'VII-VIII', description: 'Impropria: preservacao permanente necessaria' },
    };
    const result = map[degree];
    if (!result) throw new TypeError(`degree '${degree}' nao reconhecido`);
    return result;
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilErosionRiskClassificationMeta = {
    name: 'soilErosionRiskClassification',
    description: 'soilErosionRiskClassification',
    category: 'analytics',
    familyTags: ['soil', 'risk', 'hydrocarbon', 'erosion'],
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
