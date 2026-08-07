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
 * Soil Salinity Model - conversões e classificações de salinidade do solo.
 *
 * Referências acadêmicas:
 *   - van Genuchten, M.Th. (1983). Analyzing crop salt tolerance data:
 *     model description and user's manual. DOI:10.2136/sssaj1983.03615995004700030040x
 *   - USDA NRCS (2011). Soil Quality Indicators - Electrical Conductivity.
 *     https://www.nrcs.usda.gov/Internet/FSE_DOCUMENTS/nrcs142p2_051276.pdf
 *   - Maas, E.V. & Hoffman, G.J. (1977). Crop salt tolerance - Current assessment.
 *     Journal of the Irrigation and Drainage Division, 103(2), 115–134.
 */

interface ECResult { EC_dS_m: number }
interface OsmoticResult { osmotic_potential_MPa: number }
interface YieldReductionResult { yield_reduction_pct: number }
interface SalinityClassResult { class: string }

/**
 * Converte TDS (Total Dissolved Solids) em Condutividade Elétrica (EC).
 * Relação empírica padrão amplamente usada em monitoramento hídrico e de solo.
 * EC (dS/m) = TDS (mg/L) / 640
 *
 * @param {number} TDS_mg_L - Sólidos dissolvidos totais em mg/L. Deve ser ≥ 0.
 * @returns {ECResult} Condutividade elétrica em dS/m.
 * @throws {TypeError} Se TDS_mg_L não for número.
 * @throws {RangeError} Se TDS_mg_L for negativo.
 */
export function computeElectricalConductivity(TDS_mg_L: number): ECResult {
    if (typeof TDS_mg_L !== 'number' || !isFinite(TDS_mg_L)) {
        throw new TypeError('TDS_mg_L deve ser um número finito');
    }
    if (TDS_mg_L < 0) {
        throw new RangeError('TDS_mg_L não pode ser negativo');
    }
    // Fator de conversão empírico padrão: 1 dS/m ≈ 640 mg/L TDS
    const EC_dS_m = TDS_mg_L / 640;
    return { EC_dS_m };
}

/**
 * Calcula o potencial osmótico do solo a partir da condutividade elétrica.
 * Ψs (MPa) = -0.036 × EC (dS/m)
 * Baseado em: van Genuchten (1983), DOI:10.2136/sssaj1983.03615995004700030040x
 *
 * @param {number} EC_dS_m - Condutividade elétrica em dS/m. Deve ser ≥ 0.
 * @returns {OsmoticResult} Potencial osmótico em MPa (sempre negativo ou zero).
 * @throws {TypeError} Se EC_dS_m não for número.
 * @throws {RangeError} Se EC_dS_m for negativo.
 */
export function computeOsmoticPotential(EC_dS_m: number): OsmoticResult {
    if (typeof EC_dS_m !== 'number' || !isFinite(EC_dS_m)) {
        throw new TypeError('EC_dS_m deve ser um número finito');
    }
    if (EC_dS_m < 0) {
        throw new RangeError('EC_dS_m não pode ser negativo');
    }
    // Coeficiente empírico de van Genuchten para potencial osmótico
    const osmotic_potential_MPa = -0.036 * EC_dS_m;
    return { osmotic_potential_MPa };
}

/**
 * Calcula a redução de produtividade agrícola causada por estresse salino.
 * YR (%) = slope × max(0, EC - EC_threshold), capeado em 100%.
 * Modelo linear de Maas & Hoffman (1977).
 *
 * @param {number} EC_dS_m - Condutividade elétrica atual em dS/m.
 * @param {number} EC_threshold - Limiar de tolerância da cultura em dS/m.
 * @param {number} slope_pct_per_dS - Declive de redução em % por dS/m (> 0).
 * @returns {YieldReductionResult} Redução de produtividade em % (0–100).
 * @throws {TypeError} Se qualquer argumento não for número finito.
 * @throws {RangeError} Se EC_dS_m ou EC_threshold forem negativos, ou slope ≤ 0.
 */
export function computeSaltStressReduction(EC_dS_m: number, EC_threshold: number, slope_pct_per_dS: number): YieldReductionResult {
    if (
        typeof EC_dS_m !== 'number' ||
        !isFinite(EC_dS_m) ||
        typeof EC_threshold !== 'number' ||
        !isFinite(EC_threshold) ||
        typeof slope_pct_per_dS !== 'number' ||
        !isFinite(slope_pct_per_dS)
    ) {
        throw new TypeError('Todos os parâmetros devem ser números finitos');
    }
    if (EC_dS_m < 0) throw new RangeError('EC_dS_m não pode ser negativo');
    if (EC_threshold < 0) throw new RangeError('EC_threshold não pode ser negativo');
    if (slope_pct_per_dS <= 0) throw new RangeError('slope_pct_per_dS deve ser positivo');

    const excess = Math.max(0, EC_dS_m - EC_threshold);
    const yield_reduction_pct = Math.min(100, slope_pct_per_dS * excess);
    return { yield_reduction_pct };
}

/**
 * Classifica a salinidade do solo com base na condutividade elétrica (EC).
 * Escala USDA NRCS:
 *   < 2 dS/m  → non-saline
 *   < 4 dS/m  → slightly saline
 *   < 8 dS/m  → moderately saline
 *   < 16 dS/m → strongly saline
 *   ≥ 16 dS/m → extremely saline
 *
 * @param {number} EC_dS_m - Condutividade elétrica em dS/m. Deve ser ≥ 0.
 * @returns {SalinityClassResult} Classe de salinidade do solo.
 * @throws {TypeError} Se EC_dS_m não for número finito.
 * @throws {RangeError} Se EC_dS_m for negativo.
 */
export function classifySoilSalinity(EC_dS_m: number): SalinityClassResult {
    if (typeof EC_dS_m !== 'number' || !isFinite(EC_dS_m)) {
        throw new TypeError('EC_dS_m deve ser um número finito');
    }
    if (EC_dS_m < 0) {
        throw new RangeError('EC_dS_m não pode ser negativo');
    }
    // Limites USDA NRCS para classificação de salinidade
    if (EC_dS_m < 2) return { class: 'non-saline' };
    if (EC_dS_m < 4) return { class: 'slightly' };
    if (EC_dS_m < 8) return { class: 'moderately' };
    if (EC_dS_m < 16) return { class: 'strongly' };
    return { class: 'extremely' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilSalinityModelMeta = {
    name: 'soilSalinityModel',
    description: 'soilSalinityModel',
    category: 'analytics',
    familyTags: ['soil', 'hydrocarbon'],
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
