// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Chemical Risk Ranking Model - multi-criteria prioritization of substances for remediation
// Ranking de risco químico - priorização multicrério de substâncias para remediação

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
 * Compute the Intrinsic Hazard score of a chemical substance.
 * Calcula a Pontuação de Perigo Intrínseco de uma substância química.
 *
 * IH = (toxicity × 2 + persistence + bioaccumulation) / 4
 * Pesos: toxicidade tem peso 2 pois é o fator mais relevante para proteção da saúde humana.
 * Normalizado na escala 1–5 (mesmo range das entradas).
 *
 * @param {number} toxicity_score - Toxicity score [1, 5] (1=low, 5=very high)
 * @param {number} persistence_score - Environmental persistence score [1, 5]
 * @param {number} bioaccumulation_score - Bioaccumulation potential score [1, 5]
 * @returns {{ intrinsic_hazard: number }} IH in [1, 5]
 * @throws {TypeError} If inputs are not finite numbers
 * @throws {RangeError} If any score is outside [1, 5]
 *
 * Refs:
 *   Danish EPA (2013) Chemical Substances Priority List, Technical Report No. 66.
 *   ECHA (2012) Guidance on Information Requirements and Chemical Safety Assessment, Part E.
 *   USEPA HRS (1990) Hazard Ranking System, 40 CFR Part 300 Appendix A.
 */
export function computeIntrinsicHazard(
    toxicity_score: number,
    persistence_score: number,
    bioaccumulation_score: number,
): { intrinsic_hazard: number } {
    if (
        !Number.isFinite(toxicity_score) ||
        !Number.isFinite(persistence_score) ||
        !Number.isFinite(bioaccumulation_score)
    ) {
        throw new TypeError('computeIntrinsicHazard: all inputs must be finite numbers');
    }
    for (const [name, val] of [
        ['toxicity_score', toxicity_score],
        ['persistence_score', persistence_score],
        ['bioaccumulation_score', bioaccumulation_score],
    ] as [string, number][]) {
        if (val < 1 || val > 5) {
            throw new RangeError(`computeIntrinsicHazard: ${name} must be in [1, 5], got ${val}`);
        }
    }
    const intrinsic_hazard = (toxicity_score * 2 + persistence_score + bioaccumulation_score) / 4;
    return { intrinsic_hazard };
}

/**
 * Compute the Exposure Potential of a contaminated site for a given substance.
 * Calcula o Potencial de Exposição de um sítio contaminado para uma determinada substância.
 *
 * EP = (concentration × mobility_score) / (1 + receptor_distance_m / 100)
 * Normalizado por concentração de referência 1 mg/kg (adimensional relativo).
 * Atenuação com distância: fator de 100 m reduz exposição pela metade.
 *
 * @param {number} concentration_mg_kg - Contaminant concentration in soil/sediment (mg/kg)
 * @param {number} mobility_score - Mobility/leachability score [1, 5] (1=immobile, 5=highly mobile)
 * @param {number} receptor_distance_m - Distance to nearest sensitive receptor (m)
 * @returns {{ exposure_potential: number }} EP (dimensionless, larger = more exposure)
 * @throws {TypeError} If inputs are not finite numbers
 * @throws {RangeError} If concentration < 0, mobility_score not in [1,5], or receptor_distance_m < 0
 *
 * Refs:
 *   USEPA HRS (1990) - Migration pathways scoring.
 *   CETESB (2016) Manual de Gerenciamento de Áreas Contaminadas.
 */
export function computeExposurePotential(
    concentration_mg_kg: number,
    mobility_score: number,
    receptor_distance_m: number,
): { exposure_potential: number } {
    if (
        !Number.isFinite(concentration_mg_kg) ||
        !Number.isFinite(mobility_score) ||
        !Number.isFinite(receptor_distance_m)
    ) {
        throw new TypeError('computeExposurePotential: all inputs must be finite numbers');
    }
    if (concentration_mg_kg < 0) {
        throw new RangeError('computeExposurePotential: concentration_mg_kg must be >= 0');
    }
    if (mobility_score < 1 || mobility_score > 5) {
        throw new RangeError('computeExposurePotential: mobility_score must be in [1, 5]');
    }
    if (receptor_distance_m < 0) {
        throw new RangeError('computeExposurePotential: receptor_distance_m must be >= 0');
    }
    // Concentração relativa (sem unidade): concentração / referência_1mg_kg
    // Exposição reduzida pela metade a cada 100 m de distância do receptor
    const exposure_potential = (concentration_mg_kg * mobility_score) / (1 + receptor_distance_m / 100);
    return { exposure_potential };
}

/**
 * Compute the Risk Priority Score (RPS) for a chemical substance at a contaminated site.
 * Calcula o Índice de Prioridade de Risco (RPS) para uma substância química em área contaminada.
 *
 * RPS = intrinsic_hazard × exposure_potential × uncertainty_factor
 * priority: critical if RPS > 15, high if > 8, medium if > 3, low otherwise.
 * O fator de incerteza amplifica o score - maior incerteza = maior prioridade conservadora.
 *
 * @param {number} intrinsic_hazard - Intrinsic Hazard score (from computeIntrinsicHazard)
 * @param {number} exposure_potential - Exposure Potential (from computeExposurePotential)
 * @param {number} uncertainty_factor - Uncertainty multiplier (>= 1; higher = less data confidence)
 * @returns {{ rps: number, priority: 'low'|'medium'|'high'|'critical' }}
 * @throws {TypeError} If inputs are not finite numbers
 * @throws {RangeError} If intrinsic_hazard < 0, exposure_potential < 0, or uncertainty_factor < 1
 *
 * Refs:
 *   USEPA HRS (1990); Danish EPA (2013); ECHA (2012).
 */
export function computeRiskPriorityScore(
    intrinsic_hazard: number,
    exposure_potential: number,
    uncertainty_factor: number,
): { rps: number; priority: 'low' | 'medium' | 'high' | 'critical' } {
    if (
        !Number.isFinite(intrinsic_hazard) ||
        !Number.isFinite(exposure_potential) ||
        !Number.isFinite(uncertainty_factor)
    ) {
        throw new TypeError('computeRiskPriorityScore: all inputs must be finite numbers');
    }
    if (intrinsic_hazard < 0) {
        throw new RangeError('computeRiskPriorityScore: intrinsic_hazard must be >= 0');
    }
    if (exposure_potential < 0) {
        throw new RangeError('computeRiskPriorityScore: exposure_potential must be >= 0');
    }
    if (uncertainty_factor < 1) {
        throw new RangeError('computeRiskPriorityScore: uncertainty_factor must be >= 1');
    }

    const rps = intrinsic_hazard * exposure_potential * uncertainty_factor;

    let priority: 'low' | 'medium' | 'high' | 'critical';
    if (rps > 15) {
        priority = 'critical';
    } else if (rps > 8) {
        priority = 'high';
    } else if (rps > 3) {
        priority = 'medium';
    } else {
        priority = 'low';
    }

    return { rps, priority };
}

/**
 * Rank a list of chemical substances by their Risk Priority Score in descending order.
 * Ordena uma lista de substâncias químicas pelo Índice de Prioridade de Risco em ordem decrescente.
 *
 * Each substance must have: name (string), intrinsic_hazard (number),
 * exposure_potential (number), uncertainty_factor (number >= 1).
 *
 * @param {Array<{name: string, intrinsic_hazard: number, exposure_potential: number, uncertainty_factor: number}>} substances
 * @returns {{ ranked: Array<{name: string, rps: number, priority: string, rank: number}> }}
 * @throws {TypeError} If substances is not an array or entries have wrong types
 * @throws {RangeError} If substances array is empty
 *
 * Refs:
 *   USEPA HRS (1990); CETESB (2016) Manual de Gerenciamento de Áreas Contaminadas.
 */
export function rankSubstances(
    substances: Array<{
        name: string;
        intrinsic_hazard: number;
        exposure_potential: number;
        uncertainty_factor: number;
    }>,
): { ranked: Array<{ name: string; rps: number; priority: string; rank: number }> } {
    if (!Array.isArray(substances)) {
        throw new TypeError('rankSubstances: substances must be an array');
    }
    if (substances.length === 0) {
        throw new RangeError('rankSubstances: substances array must not be empty');
    }

    const scored = substances.map((s, idx) => {
        if (!s || typeof s !== 'object') {
            throw new TypeError(`rankSubstances: entry ${idx} must be an object`);
        }
        if (typeof s.name !== 'string' || s.name.trim() === '') {
            throw new TypeError(`rankSubstances: entry ${idx} must have a non-empty name string`);
        }
        // Delega validação ao computeRiskPriorityScore - rethrows RangeError/TypeError com contexto
        const { rps, priority } = computeRiskPriorityScore(
            s.intrinsic_hazard,
            s.exposure_potential,
            s.uncertainty_factor,
        );
        return { name: s.name, rps, priority };
    });

    // Ordenação decrescente por RPS; empate mantém ordem original (estável)
    scored.sort((a, b) => b.rps - a.rps);

    const ranked = scored.map((item, i) => ({ ...item, rank: i + 1 }));
    return { ranked };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const chemicalRiskRankingModelMeta: AnalyticsModuleMeta = {
    name: 'chemicalRiskRankingModel',
    description: 'chemicalRiskRankingModel',
    category: 'analytics',
    familyTags: ['chemical', 'risk'],
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
