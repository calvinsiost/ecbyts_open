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
 * Mine Closure Risk - índices de risco para fechamento de minas e áreas degradadas.
 *
 * Referências acadêmicas:
 * - ICMM (2019). Integrated Mine Closure: Good Practice Guide (2nd ed.).
 *   International Council on Mining & Metals. ISBN:978-0-9576795-3-3
 * - Moran, C.J., & Kunz, N.C. (2014). Mine closure and ecosystem services.
 *   Resources Policy, 43, 78-85. DOI:10.1016/j.resourpol.2014.11.001
 * - Acid Rock Drainage: INAP Global Acid Rock Drainage Guide (2014).
 *   www.gardguide.com
 */

/**
 * Computes the Physical Stability Index (PSI) for a mine closure site.
 * Índice de estabilidade física baseado em fator de segurança, erosão e recalque.
 *
 * @param {number} factor_of_safety   - Fator de segurança geotécnico (FS ≥ 0)
 * @param {number} erosion_rate_mm_yr - Taxa de erosão em mm/ano (≥ 0)
 * @param {number} settlement_mm      - Recalque total em mm (≥ 0)
 * @returns {{ PSI: number }} PSI ∈ [0,1]; 1 = máxima estabilidade física
 * @throws {TypeError} Se argumentos não forem números
 * @throws {RangeError} Se qualquer argumento for negativo
 */
export function computePhysicalStabilityIndex(factor_of_safety: number, erosion_rate_mm_yr: number, settlement_mm: number): { PSI: number } {
    if (
        typeof factor_of_safety !== 'number' ||
        typeof erosion_rate_mm_yr !== 'number' ||
        typeof settlement_mm !== 'number'
    ) {
        throw new TypeError('computePhysicalStabilityIndex: all arguments must be numbers');
    }
    if (factor_of_safety < 0) throw new RangeError('computePhysicalStabilityIndex: factor_of_safety must be >= 0');
    if (erosion_rate_mm_yr < 0) throw new RangeError('computePhysicalStabilityIndex: erosion_rate_mm_yr must be >= 0');
    if (settlement_mm < 0) throw new RangeError('computePhysicalStabilityIndex: settlement_mm must be >= 0');
    // FS contribui até FS=2 (FS≥2 = máximo score)
    const fs_score = Math.min(1, factor_of_safety / 2);
    // Erosão: 0mm/ano = score 1; 10mm/ano = score 0 (linear)
    const erosion_score = Math.max(0, 1 - erosion_rate_mm_yr / 10);
    // Recalque: 0mm = score 1; 100mm = score 0 (linear)
    const settlement_score = Math.max(0, 1 - settlement_mm / 100);
    const PSI = fs_score * erosion_score * settlement_score;
    return { PSI };
}

/**
 * Computes the Chemical Stability Index (CSI) for a mine closure site.
 * Índice de estabilidade química - considera pH do lixiviado, metais e potencial de DAM.
 *
 * @param {number} leachate_pH           - pH do lixiviado (0–14)
 * @param {number} metals_exceedance_pct - Percentual de metais acima do padrão [0,100]
 * @param {number} ARD_potential         - Potencial de drenagem ácida de rocha [0,1]
 * @returns {{ CSI: number }} CSI ∈ [0,1]; 1 = máxima estabilidade química
 * @throws {TypeError} Se argumentos não forem números
 * @throws {RangeError} Se valores estiverem fora dos intervalos definidos
 */
export function computeChemicalStabilityIndex(leachate_pH: number, metals_exceedance_pct: number, ARD_potential: number): { CSI: number } {
    if (
        typeof leachate_pH !== 'number' ||
        typeof metals_exceedance_pct !== 'number' ||
        typeof ARD_potential !== 'number'
    ) {
        throw new TypeError('computeChemicalStabilityIndex: all arguments must be numbers');
    }
    if (leachate_pH < 0 || leachate_pH > 14)
        throw new RangeError('computeChemicalStabilityIndex: leachate_pH must be in [0,14]');
    if (metals_exceedance_pct < 0 || metals_exceedance_pct > 100)
        throw new RangeError('computeChemicalStabilityIndex: metals_exceedance_pct must be in [0,100]');
    if (ARD_potential < 0 || ARD_potential > 1)
        throw new RangeError('computeChemicalStabilityIndex: ARD_potential must be in [0,1]');
    // Score de pH: pH 6-8 = máximo (neutro); afasta-se para 0 nas extremidades
    const ph_score = Math.max(0, 1 - Math.abs(leachate_pH - 7) / 7);
    const metals_score = 1 - metals_exceedance_pct / 100;
    const ard_score = 1 - ARD_potential;
    const CSI = ph_score * metals_score * ard_score;
    return { CSI };
}

/**
 * Computes the Closure Risk Score (CRS) combining physical and chemical stability.
 * Score composto de risco de fechamento - melhora com o tempo desde o encerramento.
 *
 * @param {number} PSI                - Physical Stability Index [0,1]
 * @param {number} CSI                - Chemical Stability Index [0,1]
 * @param {number} years_since_closure - Anos desde o fechamento (≥ 0)
 * @returns {{ CRS: number }} CRS ∈ [0,1]; valores maiores = menor risco
 * @throws {TypeError} Se argumentos não forem números
 * @throws {RangeError} Se PSI ou CSI estiverem fora de [0,1] ou years_since_closure < 0
 */
export function computeClosureRiskScore(PSI: number, CSI: number, years_since_closure: number): { CRS: number } {
    if (typeof PSI !== 'number' || typeof CSI !== 'number' || typeof years_since_closure !== 'number') {
        throw new TypeError('computeClosureRiskScore: all arguments must be numbers');
    }
    if (PSI < 0 || PSI > 1) throw new RangeError('computeClosureRiskScore: PSI must be in [0,1]');
    if (CSI < 0 || CSI > 1) throw new RangeError('computeClosureRiskScore: CSI must be in [0,1]');
    if (years_since_closure < 0) throw new RangeError('computeClosureRiskScore: years_since_closure must be >= 0');
    const base = PSI * 0.5 + CSI * 0.5;
    // Fator de decaimento: melhora 2% ao ano, capeado em 30 anos (mínimo decay=0.4)
    const decay = 1 - 0.02 * Math.min(years_since_closure, 30);
    const CRS = base * decay;
    return { CRS: Math.max(0, Math.min(1, CRS)) };
}

/**
 * Classifies the mine closure risk level based on CRS.
 * Classifica o nível de risco de fechamento em 4 categorias de gestão.
 *
 * @param {number} CRS - Closure Risk Score [0,1]
 * @returns {{ risk: 'low'|'moderate'|'high'|'critical' }}
 * @throws {TypeError} Se CRS não for número
 * @throws {RangeError} Se CRS estiver fora de [0,1]
 */
export function classifyClosureRisk(CRS: number): { risk: 'low'|'moderate'|'high'|'critical' } {
    if (typeof CRS !== 'number') {
        throw new TypeError('classifyClosureRisk: CRS must be a number');
    }
    if (CRS < 0 || CRS > 1) {
        throw new RangeError('classifyClosureRisk: CRS must be in [0,1]');
    }
    if (CRS >= 0.7) return { risk: 'low' };
    if (CRS >= 0.4) return { risk: 'moderate' };
    if (CRS >= 0.2) return { risk: 'high' };
    return { risk: 'critical' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
interface AnalyticsJsonSchema {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
    description?: string;
}
interface AnalyticsModuleProvenance {
    generatedBy: string;
    version: string;
    validatedByHuman: boolean;
    disclaimerAcknowledged: boolean;
    specRef: string;
    citation?: string;
}
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: AnalyticsModuleProvenance;
    inputSchema: AnalyticsJsonSchema;
    outputSchema: AnalyticsJsonSchema;
}

export const mineClosureRiskMeta: AnalyticsModuleMeta = {
    name: 'mineClosureRisk',
    description: 'mineClosureRisk',
    category: 'analytics',
    familyTags: ['mining', 'risk'],
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
