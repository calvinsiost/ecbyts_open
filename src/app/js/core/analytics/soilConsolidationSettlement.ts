// @ts-check
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
// Application: EHS & Mining - Soil Consolidation Settlement
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Soil Consolidation Settlement
 *
 * Módulo puro implementando análise de recalque por adensamento primário de solos
 * argilosos (teoria de Terzaghi), cálculo de tempo de consolidação e classificação
 * de risco de recalque diferencial em estruturas ambientais.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Terzaghi, K. (1943). Theoretical Soil Mechanics. Wiley, New York.
 *     (teoria de adensamento unidimensional, equação de difusão)
 *   - Das, B. M. (2015). Principles of Foundation Engineering (8th ed.).
 *     Cengage Learning. ISBN: 978-1-305-08129-1. (recalque primário e secundário,
 *     grau de consolidação, coeficiente de adensamento Cv)
 *   - Skempton, A. W. & Bjerrum, L. (1957). "A contribution to the settlement
 *     analysis of foundations on clay." Géotechnique 7(4):168–178.
 *     DOI: 10.1680/geot.1957.7.4.168 (coeficiente de recalque μ)
 *   - ABNT NBR 6122:2010 - Projeto e execução de fundações (critérios de
 *     recalque admissível: diferencial < L/600, absoluto < 25 mm para estruturas)
 */

'use strict';

// Constantes regulatórias e critérios de projeto (ABNT NBR 6122:2010)
// Regulatory constants and design criteria
const ABNT_MAX_DIFFERENTIAL_RATIO = 1 / 600; // recalque diferencial máximo (Δδ/L)
const ABNT_MAX_ABSOLUTE_SETTLEMENT_MM = 25; // recalque absoluto máximo (mm)

// Fatores de tempo Tv para graus de consolidação U (Das 2015, Tabela 11.7)
// Time factors Tv for consolidation degrees U
const TIME_FACTOR_TABLE = [
    { U: 0.1, Tv: 0.008 },
    { U: 0.2, Tv: 0.031 },
    { U: 0.3, Tv: 0.071 },
    { U: 0.4, Tv: 0.126 },
    { U: 0.5, Tv: 0.197 },
    { U: 0.6, Tv: 0.287 },
    { U: 0.7, Tv: 0.403 },
    { U: 0.8, Tv: 0.567 },
    { U: 0.9, Tv: 0.848 },
    { U: 0.95, Tv: 1.129 },
];

/**
 * Interpola o fator de tempo Tv a partir da tabela para o grau de consolidação U.
 * Fallback para o primeiro valor da tabela se nenhum intervalo for encontrado.
 */
function interpolateTv(U: number): number {
    for (let i = 0; i < TIME_FACTOR_TABLE.length - 1; i++) {
        const lo = TIME_FACTOR_TABLE[i];
        const hi = TIME_FACTOR_TABLE[i + 1];
        if (U >= lo!.U && U <= hi!.U) {
            const frac = (U - lo!.U) / (hi!.U - lo!.U);
            return lo!.Tv + frac * (hi!.Tv - lo!.Tv);
        }
    }
    return TIME_FACTOR_TABLE[0]!.Tv;
}

/**
 * Calcula o recalque primário por adensamento de uma camada argilosa
 * normalmente adensada (NC) ou pré-adensada (OC).
 *
 * Calculate primary consolidation settlement for normally consolidated (NC)
 * or overconsolidated (OC) clay using Terzaghi (1943) / Das (2015) equations.
 * S = (Cc * H / (1 + e0)) * log10((σ'0 + Δσ) / σ'0)   [NC]
 * S = (Cs * H / (1 + e0)) * log10((σ'0 + Δσ) / σ'0)   [OC, Δσ ≤ σ'p - σ'0]
 *
 * @param {number} Cc          - índice de compressão (adimensional), > 0
 * @param {number} H_m         - espessura da camada (m), > 0
 * @param {number} e0          - índice de vazios inicial (adimensional), > 0
 * @param {number} sigma0_kPa  - tensão efetiva inicial (kPa), > 0
 * @param {number} deltaSigma_kPa - acréscimo de tensão (kPa), > 0
 * @returns {number} recalque primário (mm)
 * @throws {TypeError} se parâmetros não forem números
 * @throws {RangeError} se parâmetros forem ≤ 0
 */
export function calcPrimarySettlement(Cc: any, H_m: any, e0: any, sigma0_kPa: any, deltaSigma_kPa: any) {
    if (
        typeof Cc !== 'number' ||
        typeof H_m !== 'number' ||
        typeof e0 !== 'number' ||
        typeof sigma0_kPa !== 'number' ||
        typeof deltaSigma_kPa !== 'number'
    ) {
        throw new TypeError('calcPrimarySettlement: todos os parâmetros devem ser números');
    }
    if (Cc <= 0 || H_m <= 0 || e0 <= 0 || sigma0_kPa <= 0 || deltaSigma_kPa <= 0) {
        throw new RangeError('calcPrimarySettlement: todos os parâmetros devem ser > 0');
    }

    // Recalque primário por adensamento: S = (Cc * H / (1+e0)) * log10((σ'0+Δσ)/σ'0)
    // Resultado em metros → convertido para mm
    const S_m = ((Cc * H_m) / (1 + e0)) * Math.log10((sigma0_kPa + deltaSigma_kPa) / sigma0_kPa);
    return S_m * 1000; // mm
}

/**
 * Calcula o tempo necessário para atingir um determinado grau de consolidação.
 *
 * Calculate time required to reach a specified degree of consolidation.
 * t = Tv * Hdr² / Cv   (Das 2015, equação 11.35)
 * Hdr = H/2 para drenagem dupla, H para drenagem simples.
 *
 * @param {number} U           - grau de consolidação desejado (0 < U < 1)
 * @param {number} Cv_m2_year  - coeficiente de adensamento (m²/ano), > 0
 * @param {number} H_m         - espessura da camada (m), > 0
 * @param {boolean} doubleDrainage - true = drenagem dupla (H_dr = H/2)
 * @returns {number} tempo para atingir U (anos)
 * @throws {TypeError} se parâmetros tiverem tipo inválido
 * @throws {RangeError} se U estiver fora de (0, 1) ou outros valores ≤ 0
 */
export function calcConsolidationTime(U: any, Cv_m2_year: any, H_m: any, doubleDrainage = true) {
    if (typeof U !== 'number' || typeof Cv_m2_year !== 'number' || typeof H_m !== 'number') {
        throw new TypeError('calcConsolidationTime: U, Cv_m2_year e H_m devem ser números');
    }
    if (U <= 0 || U >= 1) {
        throw new RangeError('calcConsolidationTime: U deve estar em (0, 1)');
    }
    if (Cv_m2_year <= 0 || H_m <= 0) {
        throw new RangeError('calcConsolidationTime: Cv_m2_year e H_m devem ser > 0');
    }

    // Interpola Tv a partir da tabela para o grau U desejado
    // Interpolate time factor Tv from lookup table
    /** @type {number} */
    let Tv: number;
    if (U <= TIME_FACTOR_TABLE[0]!.U) {
        // Aproximação parabólica para U ≤ 0.10: Tv = π/4 * U²
        Tv = (Math.PI / 4) * U * U;
    } else if (U >= TIME_FACTOR_TABLE[TIME_FACTOR_TABLE.length - 1]!.U) {
        // Extrapolação logarítmica para U próximo de 1
        Tv = 1.781 - 0.933 * Math.log10(1 - U); // fórmula clássica Das eq 11.33
    } else {
        // Interpolação linear entre entradas da tabela
        Tv = interpolateTv(U);
    }

    // Altura de drenagem: H/2 (dupla) ou H (simples)
    const Hdr = doubleDrainage ? H_m / 2 : H_m;
    const time_years = (Tv * Hdr * Hdr) / Cv_m2_year;
    return time_years;
}

/**
 * Calcula o recalque diferencial entre dois pontos de uma estrutura e verifica
 * conformidade com ABNT NBR 6122:2010.
 *
 * Calculate differential settlement between two structure points and verify
 * compliance with ABNT NBR 6122:2010 angular distortion limit.
 *
 * @param {number} settlement1_mm  - recalque no ponto 1 (mm), ≥ 0
 * @param {number} settlement2_mm  - recalque no ponto 2 (mm), ≥ 0
 * @param {number} distance_m      - distância horizontal entre os pontos (m), > 0
 * @returns {{
 *   differentialSettlement_mm: number,
 *   angularDistortion: number,
 *   compliantDifferential: boolean,
 *   compliantAbsolute: boolean,
 *   maxSettlement_mm: number
 * }}
 * @throws {TypeError} se parâmetros não forem números
 * @throws {RangeError} se valores estiverem fora dos limites
 */
export function calcDifferentialSettlement(settlement1_mm: any, settlement2_mm: any, distance_m: any) {
    if (typeof settlement1_mm !== 'number' || typeof settlement2_mm !== 'number' || typeof distance_m !== 'number') {
        throw new TypeError('calcDifferentialSettlement: todos os parâmetros devem ser números');
    }
    if (settlement1_mm < 0 || settlement2_mm < 0) {
        throw new RangeError('calcDifferentialSettlement: recalques devem ser ≥ 0');
    }
    if (distance_m <= 0) {
        throw new RangeError('calcDifferentialSettlement: distância deve ser > 0');
    }

    const diff_mm = Math.abs(settlement1_mm - settlement2_mm);
    // Distorção angular: razão entre recalque diferencial e distância (adimensional)
    const angularDistortion = diff_mm / (distance_m * 1000); // mm/mm = adimensional
    const maxSettlement_mm = Math.max(settlement1_mm, settlement2_mm);

    return {
        differentialSettlement_mm: diff_mm,
        angularDistortion,
        compliantDifferential: angularDistortion <= ABNT_MAX_DIFFERENTIAL_RATIO,
        compliantAbsolute: maxSettlement_mm <= ABNT_MAX_ABSOLUTE_SETTLEMENT_MM,
        maxSettlement_mm,
    };
}

/**
 * Classifica o risco de recalque por adensamento com base no recalque primário
 * calculado e nos critérios da ABNT NBR 6122:2010.
 *
 * Classify consolidation settlement risk based on calculated primary settlement
 * magnitude and ABNT NBR 6122:2010 thresholds.
 *
 * @param {number} primarySettlement_mm  - recalque primário total (mm), ≥ 0
 * @param {number} consolidationTime_years - tempo estimado para 90% de consolidação (anos), > 0
 * @returns {{
 *   riskLevel: 'NEGLIGIBLE'|'LOW'|'MODERATE'|'HIGH'|'CRITICAL',
 *   settlementCategory: string,
 *   requiresMonitoring: boolean,
 *   requiresRemediation: boolean,
 *   notes: string
 * }}
 * @throws {TypeError} se parâmetros não forem números
 * @throws {RangeError} se valores forem negativos
 */
export function classifySettlementRisk(primarySettlement_mm: any, consolidationTime_years: any) {
    if (typeof primarySettlement_mm !== 'number' || typeof consolidationTime_years !== 'number') {
        throw new TypeError('classifySettlementRisk: parâmetros devem ser números');
    }
    if (primarySettlement_mm < 0) {
        throw new RangeError('classifySettlementRisk: recalque não pode ser negativo');
    }
    if (consolidationTime_years <= 0) {
        throw new RangeError('classifySettlementRisk: tempo de consolidação deve ser > 0');
    }

    // Classificação baseada em magnitude de recalque e velocidade de consolidação
    // Classification based on settlement magnitude and consolidation rate
    /** @type {'NEGLIGIBLE'|'LOW'|'MODERATE'|'HIGH'|'CRITICAL'} */
    let riskLevel;
    /** @type {string} */
    let settlementCategory;
    /** @type {boolean} */
    let requiresMonitoring;
    /** @type {boolean} */
    let requiresRemediation;
    /** @type {string} */
    let notes;

    if (primarySettlement_mm < 10) {
        riskLevel = 'NEGLIGIBLE';
        settlementCategory = 'Recalque insignificante (<10 mm)';
        requiresMonitoring = false;
        requiresRemediation = false;
        notes = 'Abaixo do limiar de percepção estrutural. Sem ação necessária.';
    } else if (primarySettlement_mm < 25) {
        riskLevel = 'LOW';
        settlementCategory = 'Recalque tolerável (10–25 mm)';
        requiresMonitoring = consolidationTime_years > 5;
        requiresRemediation = false;
        notes = 'Dentro dos limites ABNT NBR 6122. Monitorar se consolidação lenta.';
    } else if (primarySettlement_mm < 50) {
        riskLevel = 'MODERATE';
        settlementCategory = 'Recalque moderado (25–50 mm)';
        requiresMonitoring = true;
        requiresRemediation = false;
        notes = 'Excede limite absoluto ABNT. Avaliar impacto estrutural e ambiental.';
    } else if (primarySettlement_mm < 100) {
        riskLevel = 'HIGH';
        settlementCategory = 'Recalque elevado (50–100 mm)';
        requiresMonitoring = true;
        requiresRemediation = true;
        notes = 'Risco estrutural significativo. Reforço de fundação ou pré-adensamento recomendado.';
    } else {
        riskLevel = 'CRITICAL';
        settlementCategory = 'Recalque crítico (>100 mm)';
        requiresMonitoring = true;
        requiresRemediation = true;
        notes = 'Risco crítico de colapso estrutural. Intervenção imediata e estudo geotécnico detalhado.';
    }

    return { riskLevel, settlementCategory, requiresMonitoring, requiresRemediation, notes };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilConsolidationSettlementMeta = {
    name: 'soilConsolidationSettlement',
    description: 'Soil Consolidation Settlement',
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
