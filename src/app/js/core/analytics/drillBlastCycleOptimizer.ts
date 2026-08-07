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
 * @module drillBlastCycleOptimizer
 * @description Otimização do ciclo de perfuração e detonação em lavra a céu aberto.
 * Implementa modelos de Langefors & Kihlström (1978), Kuz-Ram (Cunningham 1987) e
 * SME Mining Engineering Handbook (2011) para dimensionamento de malha e
 * fragmentação de rocha.
 *
 * References:
 *   - Langefors U, Kihlström B (1978) The Modern Technique of Rock Blasting, 3rd ed.
 *     Almqvist & Wiksell, Stockholm. ISBN 0-470-99282-9.
 *   - Cunningham CVB (1987) The Kuz-Ram model for prediction of fragmentation from blasting.
 *     Proc. 2nd Intl Symp. on Rock Fragmentation by Blasting, Keystone, CO, pp 439–453.
 *   - Darling P ed. (2011) SME Mining Engineering Handbook, 3rd ed.
 *     Society for Mining, Metallurgy & Exploration, Englewood CO. ISBN 978-0-87335-264-2.
 */

'use strict';

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

/**
 * Calcula o diâmetro ideal de furo de desmonte baseado na burden de projeto e
 * características do explosivo e da rocha (Langefors & Kihlström 1978, §4.3).
 *
 * Regra empírica: d_opt (mm) ≈ burden (m) × 1000 / k
 * onde k depende da relação de densidades e da resistência relativa do explosivo (RWS).
 *
 * @param {number} burden_m           - Burden de projeto (m), [1, 30]
 * @param {number} explosiveDensity   - Densidade do explosivo (g/cm³), [0.5, 2.0]
 * @param {number} rockDensity        - Densidade da rocha (g/cm³), [1.5, 4.0]
 * @param {number} RWS                - Relative Weight Strength vs ANFO (%), [50, 150]
 * @returns {{ optimalDiameter_mm: number, loadingFactor: number }}
 * @throws {RangeError} Se parâmetros forem inválidos
 *
 * @see Langefors & Kihlström (1978) §4.3, Tabela 4.1.
 */
export function calcOptimalHoleDiameter(
    burden_m: number,
    explosiveDensity: number,
    rockDensity: number,
    RWS: number,
): { optimalDiameter_mm: number; loadingFactor: number } {
    if ([burden_m, explosiveDensity, rockDensity, RWS].some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (burden_m < 1 || burden_m > 30) {
        throw new RangeError('burden_m must be between 1 and 30 m');
    }
    if (explosiveDensity < 0.5 || explosiveDensity > 2.0) {
        throw new RangeError('explosiveDensity must be between 0.5 and 2.0 g/cm³');
    }
    if (rockDensity < 1.5 || rockDensity > 4.0) {
        throw new RangeError('rockDensity must be between 1.5 and 4.0 g/cm³');
    }
    if (RWS < 50 || RWS > 150) {
        throw new RangeError('RWS must be between 50 and 150');
    }

    // Fator de carregamento ajustado pela relação de densidades e RWS normalizado
    // Langefors & Kihlström: k ≈ (55 × ρ_exp × RWS) / (ρ_rock × 100)
    const loadingFactor = (55 * explosiveDensity * (RWS / 100)) / rockDensity;

    // Diâmetro ideal: burden (m) × 1000 / k → mm
    const optimalDiameter_mm = (burden_m * 1000) / loadingFactor;

    return {
        optimalDiameter_mm: +optimalDiameter_mm.toFixed(1),
        loadingFactor: +loadingFactor.toFixed(3),
    };
}

/**
 * Calcula a densidade de carregamento do furo (kg de explosivo por m³ de volume de furo).
 *
 * Densidade de carregamento = massa_explosivo / volume_furo
 *
 * @param {number} massDynamite_kg - Massa de explosivo por furo (kg), > 0
 * @param {number} holeVolume_m3   - Volume do furo (m³), > 0
 * @returns {{ chargingDensity_kg_m3: number, chargingDensity_g_cm3: number }}
 * @throws {RangeError} Se valores forem não positivos
 *
 * @see Langefors & Kihlström (1978) §5.1.
 */
export function calcChargingDensity(
    massDynamite_kg: number,
    holeVolume_m3: number,
): { chargingDensity_kg_m3: number; chargingDensity_g_cm3: number } {
    if (typeof massDynamite_kg !== 'number' || typeof holeVolume_m3 !== 'number') {
        throw new TypeError('Parameters must be numbers');
    }
    if (massDynamite_kg <= 0) {
        throw new RangeError('massDynamite_kg must be positive');
    }
    if (holeVolume_m3 <= 0) {
        throw new RangeError('holeVolume_m3 must be positive');
    }

    const chargingDensity_kg_m3 = massDynamite_kg / holeVolume_m3;
    // Conversão: 1 kg/m³ = 0.001 g/cm³
    const chargingDensity_g_cm3 = chargingDensity_kg_m3 * 0.001;

    return {
        chargingDensity_kg_m3: +chargingDensity_kg_m3.toFixed(2),
        chargingDensity_g_cm3: +chargingDensity_g_cm3.toFixed(4),
    };
}

/**
 * Calcula o P80 de fragmentação (mm) pelo modelo Kuz-Ram (Cunningham 1987).
 *
 * Equação de Kuznetsov modificada:
 *   x̄ = A × (V/Q)^0.8 × Q^(1/6) × (115/RWS)^(19/30)
 *
 * Distribuição Rosin-Rammler → P80 = x̄ × (-ln(1 - 0.80))^(1/n)
 * onde n (índice de uniformidade) é calculado pela equação de Cunningham.
 *
 * @param {number} burden_m             - Burden (m), [1, 30]
 * @param {number} spacing_m            - Espaçamento (m), [1, 40]
 * @param {number} holeDiam_mm          - Diâmetro do furo (mm), [50, 400]
 * @param {number} powderFactor_kg_m3   - Fator de pó (kg/m³), [0.1, 2.0]
 * @param {number} RMR                  - Rock Mass Rating (0–100)
 * @returns {{ P80_mm: number, meanSize_mm: number, uniformityIndex: number }}
 * @throws {RangeError} Se parâmetros forem inválidos
 *
 * @see Cunningham CVB (1987) The Kuz-Ram model. Proc. 2nd Intl Symp. Rock Fragmentation.
 */
export function calcFragmentationP80(
    burden_m: number,
    spacing_m: number,
    holeDiam_mm: number,
    powderFactor_kg_m3: number,
    RMR: number,
): { P80_mm: number; meanSize_mm: number; uniformityIndex: number } {
    if (
        [burden_m, spacing_m, holeDiam_mm, powderFactor_kg_m3, RMR].some((v) => typeof v !== 'number' || !isFinite(v))
    ) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (burden_m < 1 || burden_m > 30) {
        throw new RangeError('burden_m must be between 1 and 30 m');
    }
    if (spacing_m < 1 || spacing_m > 40) {
        throw new RangeError('spacing_m must be between 1 and 40 m');
    }
    if (holeDiam_mm < 50 || holeDiam_mm > 400) {
        throw new RangeError('holeDiam_mm must be between 50 and 400 mm');
    }
    if (powderFactor_kg_m3 < 0.1 || powderFactor_kg_m3 > 2.0) {
        throw new RangeError('powderFactor_kg_m3 must be between 0.1 and 2.0');
    }
    if (RMR < 0 || RMR > 100) {
        throw new RangeError('RMR must be between 0 and 100');
    }

    // Fator geológico A (Cunningham 1987, Tabela 1) baseado em RMR
    // Faixa: A ≈ 0.8 (rocha muito boa) a 13 (rocha muito fraca)
    const A = RMR > 60 ? 1 : RMR > 40 ? 3 : RMR > 20 ? 7 : 13;

    // RWS padrão ANFO = 100 (base do Kuz-Ram)
    const RWS = 100;

    // Volume por furo (simplificado): V/Q ≈ 1/powderFactor
    const V_over_Q = 1 / powderFactor_kg_m3;

    // Massa de explosivo por furo (kg) - estimativa via fator de pó e volume unitário
    const Q = ((Math.pow(holeDiam_mm / 1000, 2) * Math.PI) / 4) * burden_m * spacing_m * 1000 * powderFactor_kg_m3;

    // Tamanho médio de fragmento (cm) - equação de Kuznetsov (Cunningham 1987, eq. 1)
    const meanSize_cm = A * Math.pow(V_over_Q, 0.8) * Math.pow(Q, 1 / 6) * Math.pow(115 / RWS, 19 / 30);
    const meanSize_mm = meanSize_cm * 10;

    // Índice de uniformidade de Cunningham (1987, eq. 4)
    const uniformityIndex =
        (2.2 - 14 * (burden_m / holeDiam_mm)) * Math.sqrt((1 + spacing_m / burden_m) / 2) * Math.pow(1 - 0.1, 0.1); // 0.1 = stemming correction padrão

    const n = Math.max(0.5, Math.min(uniformityIndex, 3.5));

    // Distribuição Rosin-Rammler: P80 = x̄ × (-ln(0.20))^(1/n)
    const P80_mm = meanSize_mm * Math.pow(-Math.log(0.2), 1 / n);

    return {
        P80_mm: +P80_mm.toFixed(1),
        meanSize_mm: +meanSize_mm.toFixed(1),
        uniformityIndex: +n.toFixed(3),
    };
}

/**
 * Calcula a produtividade horária do ciclo de perfuração e desmonte.
 *
 * Produção = blastVolume_m3 / (horasPerfuracao + loadTime_h)
 * onde horasPerfuracao = profundidadeFuro / drillingRate_m_h
 *
 * @param {number} drillingRate_m_h  - Taxa de perfuração (m/h), > 0
 * @param {number} loadTime_h        - Tempo de carregamento e acessório (h), >= 0
 * @param {number} blastVolume_m3    - Volume detonado por ciclo (m³), > 0
 * @returns {{ productivity_m3_h: number, cycleEfficiency: number }}
 * @throws {RangeError} Se parâmetros forem inválidos
 *
 * @see SME Mining Engineering Handbook 3rd ed. (2011) §10.4.
 */
export function calcCycleProductivity(
    drillingRate_m_h: number,
    loadTime_h: number,
    blastVolume_m3: number,
): { productivity_m3_h: number; cycleEfficiency: number } {
    if ([drillingRate_m_h, loadTime_h, blastVolume_m3].some((v) => typeof v !== 'number' || !isFinite(v))) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (drillingRate_m_h <= 0) {
        throw new RangeError('drillingRate_m_h must be positive');
    }
    if (loadTime_h < 0) {
        throw new RangeError('loadTime_h must be non-negative');
    }
    if (blastVolume_m3 <= 0) {
        throw new RangeError('blastVolume_m3 must be positive');
    }

    // Estimativa de horas de perfuração para blastVolume dado o drillingRate
    // Simplificação: 1 m de furo por 1 m/h equivale a um furo de profundidade referência
    // produtividade de ciclo em m³ por hora total do ciclo
    const drillingHours = blastVolume_m3 / (drillingRate_m_h * 10); // heurística: 10 m³/m perfurado
    const totalCycleHours = drillingHours + loadTime_h;
    const productivity_m3_h = blastVolume_m3 / totalCycleHours;

    // Eficiência: proporção do tempo gasto em perfuração vs carga
    const cycleEfficiency = +(drillingHours / totalCycleHours).toFixed(4);

    return {
        productivity_m3_h: +productivity_m3_h.toFixed(2),
        cycleEfficiency,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const drillBlastCycleOptimizerMeta: AnalyticsModuleMeta = {
    name: 'drillBlastCycleOptimizer',
    description: 'drillBlastCycleOptimizer',
    category: 'analytics',
    familyTags: ['blasting'],
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
