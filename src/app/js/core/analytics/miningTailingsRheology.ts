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
 * Mining Tailings Rheology - Yield Stress, Viscosity, Flow Resistance, Pumpability
 *
 * Módulo puro para caracterização reológica de rejeitos de mineração:
 * tensão de escoamento (modelo Bingham), viscosidade aparente, resistência
 * ao escoamento em tubulações (Darcy-Weisbach) e classificação de bombeabilidade.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Nguyen, Q. D., & Boger, D. V. (1992). Measuring the flow properties of
 *     yield stress fluids. Annual Review of Fluid Mechanics, 24(1), 47–88.
 *     DOI:10.1146/annurev.fl.24.010192.000255
 *   - Darcy, H. (1857). Recherches expérimentales relatives au mouvement de
 *     l'eau dans les tuyaux. Paris: Mallet-Bachelier.
 *     (lei de Darcy-Weisbach para escoamento laminar em tubos)
 *   - Slatter, P. T. (1999). The role of the yield stress in the pipeline
 *     transport of slurries. Powder Technology, 104(2), 168–173.
 *     DOI:10.1016/S0032-5910(99)00043-7
 *
 * @module miningTailingsRheology
 */

'use strict';

/**
 * Compute Bingham yield stress of tailings slurry.
 * Calcula a tensão de escoamento de rejeitos pelo modelo de Bingham simplificado.
 *
 * tau_y = k × C^3
 *
 * onde C é a concentração de sólidos em % e k é a constante reológica
 * do material (dependente de granulometria e mineralologia).
 *
 * @param {number} solids_concentration_pct - Concentração de sólidos (%, 0–100)
 * @param {number} rheology_constant_k - Constante reológica do material (Pa/(%^3))
 * @returns {{ yield_stress_Pa: number }}
 * @throws {RangeError} Se concentração estiver fora de [0, 100] ou k for negativo
 *
 * Referência: Nguyen & Boger (1992) DOI:10.1146/annurev.fl.24.010192.000255
 */
export function computeYieldStress(solids_concentration_pct: any, rheology_constant_k: any) {
    if (solids_concentration_pct < 0 || solids_concentration_pct > 100) {
        throw new RangeError('computeYieldStress: solids_concentration_pct deve ser 0–100%');
    }
    if (rheology_constant_k < 0) {
        throw new RangeError('computeYieldStress: rheology_constant_k deve ser ≥ 0');
    }

    // Tensão de escoamento Bingham: tau_y = k × C^3
    const yield_stress_Pa = rheology_constant_k * Math.pow(solids_concentration_pct, 3);

    return { yield_stress_Pa };
}

/**
 * Compute apparent viscosity of Bingham plastic (tailings slurry).
 * Calcula a viscosidade aparente de fluido de Bingham (rejeito em polpa).
 *
 * mu_aparente = (tau_y / gamma_dot) + mu_plastica
 *
 * A viscosidade aparente se aproxima da plástica quando shear_rate → ∞.
 *
 * @param {number} yield_stress_Pa - Tensão de escoamento (Pa)
 * @param {number} shear_rate_per_s - Taxa de cisalhamento (1/s)
 * @param {number} plastic_viscosity_Pa_s - Viscosidade plástica (Pa·s)
 * @returns {{ apparent_viscosity_Pa_s: number }}
 * @throws {RangeError} Se yield_stress ou plastic_viscosity forem negativos
 * @throws {TypeError} Se shear_rate for zero (singularidade matemática)
 *
 * Referência: Nguyen & Boger (1992) DOI:10.1146/annurev.fl.24.010192.000255
 */
export function computeViscosity(yield_stress_Pa: any, shear_rate_per_s: any, plastic_viscosity_Pa_s: any) {
    if (yield_stress_Pa < 0 || plastic_viscosity_Pa_s < 0) {
        throw new RangeError('computeViscosity: yield_stress e plastic_viscosity devem ser ≥ 0');
    }
    if (shear_rate_per_s === 0) {
        throw new TypeError('computeViscosity: shear_rate_per_s deve ser > 0 (evitar singularidade)');
    }
    if (shear_rate_per_s < 0) {
        throw new RangeError('computeViscosity: shear_rate_per_s deve ser > 0');
    }

    // Viscosidade aparente de Bingham: mu_app = tau_y/gamma + mu_plastic
    const apparent_viscosity_Pa_s = yield_stress_Pa / shear_rate_per_s + plastic_viscosity_Pa_s;

    return { apparent_viscosity_Pa_s };
}

/**
 * Compute pressure drop in pipeline transporting tailings slurry (Darcy-Weisbach).
 * Calcula a perda de carga em tubulação transportando rejeito em polpa.
 *
 * ΔP = 128 × μ × L × Q / (π × D^4)
 *
 * Equação de Darcy-Weisbach para escoamento laminar de fluido viscoso em tubo circular.
 *
 * @param {number} viscosity_Pa_s - Viscosidade dinâmica efetiva (Pa·s)
 * @param {number} pipe_length_m - Comprimento da tubulação (m)
 * @param {number} pipe_diameter_m - Diâmetro interno da tubulação (m)
 * @param {number} flow_m3_s - Vazão volumétrica (m³/s)
 * @returns {{ pressure_drop_Pa: number }}
 * @throws {RangeError} Se viscosidade, comprimento ou vazão forem negativos
 * @throws {RangeError} Se diâmetro for ≤ 0
 *
 * Referência: Darcy (1857); Slatter (1999) DOI:10.1016/S0032-5910(99)00043-7
 */
export function computeFlowResistance(viscosity_Pa_s: any, pipe_length_m: any, pipe_diameter_m: any, flow_m3_s: any) {
    if (viscosity_Pa_s < 0 || pipe_length_m < 0 || flow_m3_s < 0) {
        throw new RangeError('computeFlowResistance: viscosidade, comprimento e vazão devem ser ≥ 0');
    }
    if (pipe_diameter_m <= 0) {
        throw new RangeError('computeFlowResistance: pipe_diameter_m deve ser > 0');
    }

    // Darcy-Weisbach laminar: ΔP = 128 μ L Q / (π D^4)
    const pressure_drop_Pa =
        (128 * viscosity_Pa_s * pipe_length_m * flow_m3_s) / (Math.PI * Math.pow(pipe_diameter_m, 4));

    return { pressure_drop_Pa };
}

/**
 * Classify tailings slurry pumpability based on yield stress and solids content.
 * Classifica a bombeabilidade de rejeito em polpa.
 *
 * Limiares de tensão de escoamento (Pa):
 *   freely_flowing - < 10 Pa
 *   pumpable       - 10–100 Pa
 *   difficult      - 100–500 Pa
 *   not_pumpable   - ≥ 500 Pa
 *
 * @param {number} yield_stress_Pa - Tensão de escoamento (Pa)
 * @param {number} solids_pct - Concentração de sólidos (%, informativo)
 * @returns {{ pumpability: 'freely_flowing'|'pumpable'|'difficult'|'not_pumpable' }}
 * @throws {RangeError} Se yield_stress for negativo ou solids_pct fora de [0, 100]
 *
 * Referência: Slatter (1999) DOI:10.1016/S0032-5910(99)00043-7 - pumpability classification.
 */
export function classifyTailingsPumpability(yield_stress_Pa: any, solids_pct: any) {
    if (yield_stress_Pa < 0) {
        throw new RangeError('classifyTailingsPumpability: yield_stress_Pa deve ser ≥ 0');
    }
    if (solids_pct < 0 || solids_pct > 100) {
        throw new RangeError('classifyTailingsPumpability: solids_pct deve ser 0–100%');
    }

    // Classificação por limiar de tensão de escoamento
    if (yield_stress_Pa < 10) {
        return { pumpability: 'freely_flowing' };
    }
    if (yield_stress_Pa < 100) {
        return { pumpability: 'pumpable' };
    }
    if (yield_stress_Pa < 500) {
        return { pumpability: 'difficult' };
    }
    return { pumpability: 'not_pumpable' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const miningTailingsRheologyMeta = {
    name: 'miningTailingsRheology',
    description: 'miningTailingsRheology',
    category: 'analytics',
    familyTags: ['mining'],
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
