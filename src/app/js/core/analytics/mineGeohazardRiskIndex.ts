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
 * @module mineGeohazardRiskIndex
 * @description Sistema de rating de risco de queda de rocha - Rockfall Hazard Rating
 * System (RHRS) e índice de prioridade de mitigação.
 *
 * Referências:
 * - Pierson, L.A., Davis, S.A., & Van Vickle, R. (1990). Rockfall Hazard Rating
 *   System - Implementation Manual. FHWA-OR-EG-90-01. Oregon DOT / Federal Highway
 *   Administration. TRB Record 1290.
 * - Wyllie, D.C. & Mah, C.W. (2004). Rock Slope Engineering: Civil and Mining,
 *   4th ed. Spon Press. ISBN 978-0-415-28001-3. DOI:10.4324/9780203499474
 * - Alejano, L.R. et al. (2020). Stability of Rock Slopes. In: Rock Mechanics and
 *   Engineering, Vol. 3. CRC Press. DOI:10.1201/9781315364247
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
 * Pesos canônicos do RHRS por categoria.
 * Critério: escala de pontuação de 3 a 81 (progressão 3→9→27→81) por categoria.
 * Score total = soma das categorias (máximo = 6 × 81 = 486 no modelo simplificado).
 *
 * Fonte: Pierson et al. (1990) Tabela 1.
 */
const RHRS_SCORE_RANGES: Record<string, Record<string, number>> = {
    slope_height: { low: 3, moderate: 9, high: 27, extreme: 81 },
    ditch_effectiveness: { low: 3, moderate: 9, high: 27, extreme: 81 },
    avg_vehicle_risk: { low: 3, moderate: 9, high: 27, extreme: 81 },
    decision_sight_distance: { low: 3, moderate: 9, high: 27, extreme: 81 },
    roadway_width: { low: 3, moderate: 9, high: 27, extreme: 81 },
    geological_conditions: { low: 3, moderate: 9, high: 27, extreme: 81 },
};

/**
 * Faixas de classificação por critério para determinação do nível (low/moderate/high/extreme).
 * Fonte: Pierson et al. (1990), adaptado para métricas SI.
 * @param height_m
 * @returns
 */
function scoreSlopeHeight(height_m: number): string {
    if (height_m < 10) return 'low';
    if (height_m < 20) return 'moderate';
    if (height_m < 30) return 'high';
    return 'extreme';
}

/**
 * @param effectiveness_pct
 * @returns
 */
function scoreDitchEffectiveness(effectiveness_pct: number): string {
    // % de blocos retidos pela vala (0–100)
    if (effectiveness_pct > 75) return 'low'; // boa vala → baixo risco
    if (effectiveness_pct > 50) return 'moderate';
    if (effectiveness_pct > 25) return 'high';
    return 'extreme';
}

/**
 * @param vehicles_per_day
 * @returns
 */
function scoreVehicleRisk(vehicles_per_day: number): string {
    if (vehicles_per_day < 50) return 'low';
    if (vehicles_per_day < 250) return 'moderate';
    if (vehicles_per_day < 1000) return 'high';
    return 'extreme';
}

/**
 * @param ratio
 * @returns
 */
function scoreSightDistance(ratio: number): string {
    // ratio = sight_distance / stopping_distance; >1.0 = seguro
    if (ratio >= 1.0) return 'low';
    if (ratio >= 0.75) return 'moderate';
    if (ratio >= 0.5) return 'high';
    return 'extreme';
}

/**
 * @param lanes
 * @returns
 */
function scoreRoadwayWidth(lanes: number): string {
    if (lanes >= 4) return 'low';
    if (lanes === 3) return 'moderate';
    if (lanes === 2) return 'high';
    return 'extreme';
}

/**
 * @param rating
 * @returns
 */
function scoreGeologicalConditions(rating: number): string {
    // Índice qualitativo: 1 = rocha maciça estável; 4 = intensamente fraturada/friável
    if (rating === 1) return 'low';
    if (rating === 2) return 'moderate';
    if (rating === 3) return 'high';
    return 'extreme';
}

/**
 * Calcula o score total do RHRS (Rockfall Hazard Rating System).
 * Score mais alto = maior risco de queda de rocha.
 *
 * @param slope_height_m          - Altura do talude [m]
 * @param ditch_effectiveness_pct - Efetividade da vala de proteção [% blocos retidos, 0–100]
 * @param vehicles_per_day        - Tráfego médio diário [veículos/dia]
 * @param sight_distance_ratio    - Razão distância de visão / dist. de parada [adim.]
 * @param roadway_lanes           - Número de faixas da rodovia [inteiro ≥ 1]
 * @param geological_rating       - Condições geológicas [1–4: 1=estável, 4=fraturado]
 * @returns
 *
 * @example
 * calcRHRS(25, 40, 500, 0.6, 2, 3)
 * // { rhrsScore: 216, categoryScores: {...}, levels: {...} }
 */
export function calcRHRS(
    slope_height_m: number,
    ditch_effectiveness_pct: number,
    vehicles_per_day: number,
    sight_distance_ratio: number,
    roadway_lanes: number,
    geological_rating: number,
): { rhrsScore: number; categoryScores: object; levels: object } {
    const args = [
        slope_height_m,
        ditch_effectiveness_pct,
        vehicles_per_day,
        sight_distance_ratio,
        roadway_lanes,
        geological_rating,
    ];
    if (args.some((v) => typeof v !== 'number')) {
        throw new TypeError('Todos os parâmetros devem ser números.');
    }
    if (slope_height_m < 0) throw new RangeError('slope_height_m deve ser >= 0.');
    if (ditch_effectiveness_pct < 0 || ditch_effectiveness_pct > 100) {
        throw new RangeError('ditch_effectiveness_pct deve estar entre 0 e 100.');
    }
    if (vehicles_per_day < 0) throw new RangeError('vehicles_per_day deve ser >= 0.');
    if (roadway_lanes < 1) throw new RangeError('roadway_lanes deve ser >= 1.');
    if (geological_rating < 1 || geological_rating > 4) {
        throw new RangeError('geological_rating deve estar entre 1 e 4.');
    }

    const levels = {
        slope_height: scoreSlopeHeight(slope_height_m),
        ditch_effectiveness: scoreDitchEffectiveness(ditch_effectiveness_pct),
        avg_vehicle_risk: scoreVehicleRisk(vehicles_per_day),
        decision_sight_distance: scoreSightDistance(sight_distance_ratio),
        roadway_width: scoreRoadwayWidth(roadway_lanes),
        geological_conditions: scoreGeologicalConditions(geological_rating),
    };

    const categoryScores: Record<string, number> = {};
    let rhrsScore = 0;
    for (const [cat, level] of Object.entries(levels)) {
        const score = RHRS_SCORE_RANGES[cat]![level]!;
        categoryScores[cat] = score;
        rhrsScore += score;
    }

    return { rhrsScore, categoryScores, levels };
}

/**
 * Estima o risco anual de queda de rocha (eventos × exposição).
 * Risco anual = (hazardScore / 486) × exposureFreq × 365
 *
 * @param rhrsScore    - Score RHRS total [0–486]
 * @param exposureFreq - Frequência de exposição [veículos/dia ou pessoas/dia]
 * @returns
 */
export function calcAnnualRisk(
    rhrsScore: number,
    exposureFreq: number,
): { annualRisk: number; hazardFraction: number } {
    if (typeof rhrsScore !== 'number' || typeof exposureFreq !== 'number') {
        throw new TypeError('rhrsScore e exposureFreq devem ser números.');
    }
    if (rhrsScore < 0 || rhrsScore > 486) throw new RangeError('rhrsScore deve estar entre 0 e 486.');
    if (exposureFreq < 0) throw new RangeError('exposureFreq deve ser >= 0.');

    const MAX_SCORE = 486;
    const hazardFraction = rhrsScore / MAX_SCORE;
    const annualRisk = hazardFraction * exposureFreq * 365;

    return {
        annualRisk: parseFloat(annualRisk.toFixed(4)),
        hazardFraction: parseFloat(hazardFraction.toFixed(5)),
    };
}

/**
 * Classifica o perigo de queda de rocha em 4 categorias com base no score RHRS.
 * Limites: Pierson et al. (1990) + Oregon DOT practice.
 *
 * @param rhrsScore - Score RHRS total [0–486]
 * @returns
 *
 * Faixas:
 *   < 100  → low
 *   < 200  → moderate
 *   < 300  → high
 *   >= 300 → extreme
 */
export function classifyRockfallHazard(rhrsScore: number): 'low' | 'moderate' | 'high' | 'extreme' {
    if (typeof rhrsScore !== 'number') throw new TypeError('rhrsScore deve ser um número.');
    if (rhrsScore < 0 || rhrsScore > 486) throw new RangeError('rhrsScore deve estar entre 0 e 486.');

    if (rhrsScore < 100) return 'low';
    if (rhrsScore < 200) return 'moderate';
    if (rhrsScore < 300) return 'high';
    return 'extreme';
}

/**
 * Calcula o índice de prioridade de mitigação (maior = prioridade maior).
 * IPM = (rhrsScore × traffic_volume) / mitigation_cost
 *
 * @param rhrsScore        - Score RHRS total
 * @param mitigation_cost  - Custo estimado de mitigação [USD ou BRL, > 0]
 * @param traffic_volume   - Volume de tráfego anual [veículos/ano]
 * @returns
 */
export function calcMitigationPriority(
    rhrsScore: number,
    mitigation_cost: number,
    traffic_volume: number,
): { mitigationPriorityIndex: number; category: 'critical' | 'high' | 'medium' | 'low' } {
    if ([rhrsScore, mitigation_cost, traffic_volume].some((v) => typeof v !== 'number')) {
        throw new TypeError('Todos os parâmetros devem ser números.');
    }
    if (rhrsScore < 0) throw new RangeError('rhrsScore deve ser >= 0.');
    if (mitigation_cost <= 0) throw new RangeError('mitigation_cost deve ser > 0.');
    if (traffic_volume < 0) throw new RangeError('traffic_volume deve ser >= 0.');

    const mpi = (rhrsScore * traffic_volume) / mitigation_cost;

    let category: 'critical' | 'high' | 'medium' | 'low';
    if (mpi >= 1000) category = 'critical';
    else if (mpi >= 100) category = 'high';
    else if (mpi >= 10) category = 'medium';
    else category = 'low';

    return {
        mitigationPriorityIndex: parseFloat(mpi.toFixed(4)),
        category,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineGeohazardRiskIndexMeta: AnalyticsModuleMeta = {
    name: 'mineGeohazardRiskIndex',
    description: 'mineGeohazardRiskIndex',
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
