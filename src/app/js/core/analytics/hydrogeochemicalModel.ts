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
 * Hydrogeochemical equilibrium models for groundwater chemistry.
 *
 * Academic references:
 *   - Davies CW (1962). Ion Association. Butterworths, London. ISBN:9780408700023
 *   - Langmuir D (1997). Aqueous Environmental Geochemistry.
 *     Prentice Hall. DOI:10.1007/978-1-4615-5929-7
 *   - Stumm W, Morgan JJ (1996). Aquatic Chemistry, 3rd ed.
 *     Wiley-Interscience. ISBN:9780471511854
 */

/**
 * Calcula a força iônica de uma solução aquosa.
 * I = 0.5 × Σ(ci × zi²)
 * Onde ci é a concentração molar do íon i e zi é a carga do íon i.
 *
 * @param {Array<{concentration_mol_L: number, charge: number}>} ions
 *   Lista de íons com concentração (mol/L) e carga iônica.
 * @returns {{ I_mol_L: number }} Força iônica em mol/L.
 */
export function computeIonicStrength(ions: any) {
    if (!Array.isArray(ions)) throw new TypeError('ions must be an array');
    if (ions.length === 0) throw new RangeError('ions array must not be empty');
    let sum = 0;
    for (let i = 0; i < ions.length; i++) {
        const ion = ions[i];
        if (typeof ion.concentration_mol_L !== 'number' || typeof ion.charge !== 'number') {
            throw new TypeError(`ions[${i}] must have numeric concentration_mol_L and charge`);
        }
        if (ion.concentration_mol_L < 0) {
            throw new RangeError(`ions[${i}].concentration_mol_L must be >= 0`);
        }
        sum += ion.concentration_mol_L * ion.charge * ion.charge;
    }
    return { I_mol_L: 0.5 * sum };
}

/**
 * Calcula o coeficiente de atividade pelo modelo de Davies (1962).
 * log(γ) = -A × z² × (√I/(1+√I) - 0.3×I)
 * A = 0.5115 a 25°C; aproximação de temperatura: A ≈ 0.5115 × (298/(273+T))^1.5
 *
 * @param {number} ionic_strength Força iônica I (mol/L).
 * @param {number} charge Carga do íon (sem sinal).
 * @param {number} temperature_C Temperatura em graus Celsius.
 * @returns {{ gamma: number }} Coeficiente de atividade adimensional.
 */
export function computeActivityCoefficient(ionic_strength: any, charge: any, temperature_C: any) {
    if (typeof ionic_strength !== 'number') throw new TypeError('ionic_strength must be a number');
    if (typeof charge !== 'number') throw new TypeError('charge must be a number');
    if (typeof temperature_C !== 'number') throw new TypeError('temperature_C must be a number');
    if (ionic_strength < 0) throw new RangeError('ionic_strength must be >= 0');
    if (temperature_C < -10 || temperature_C > 100) {
        throw new RangeError('temperature_C must be between -10 and 100');
    }
    // Fator de Debye-Hückel A corrigido pela temperatura (aproximação)
    const A = 0.5115 * Math.pow(298 / (273 + temperature_C), 1.5);
    const sqrtI = Math.sqrt(ionic_strength);
    const z2 = charge * charge;
    const logGamma = -A * z2 * (sqrtI / (1 + sqrtI) - 0.3 * ionic_strength);
    return { gamma: Math.pow(10, logGamma) };
}

/**
 * Calcula o Índice de Saturação (SI) de um mineral.
 * SI = log10(IAP/Ksp)
 * SI > 0 → mineral supersaturado (precipitação favorável)
 * SI < 0 → mineral subsaturado (dissolução favorável)
 * SI ≈ 0 → equilíbrio
 *
 * @param {number} ion_activity_product Produto de atividade iônica (IAP) adimensional.
 * @param {number} Ksp Produto de solubilidade do mineral a temperatura de interesse.
 * @returns {{ SI: number }} Índice de saturação (adimensional).
 */
export function computeSaturationIndex(ion_activity_product: any, Ksp: any) {
    if (typeof ion_activity_product !== 'number') throw new TypeError('ion_activity_product must be a number');
    if (typeof Ksp !== 'number') throw new TypeError('Ksp must be a number');
    if (ion_activity_product <= 0) throw new RangeError('ion_activity_product must be > 0');
    if (Ksp <= 0) throw new RangeError('Ksp must be > 0');
    return { SI: Math.log10(ion_activity_product / Ksp) };
}

/**
 * Classifica o estado de saturação de um mineral com base no SI.
 * SI < -0.5 → subsaturado | -0.5 ≤ SI ≤ 0.5 → equilíbrio | SI > 0.5 → supersaturado
 *
 * @param {number} SI Índice de saturação calculado por computeSaturationIndex.
 * @returns {{ status: 'undersaturated'|'near_equilibrium'|'supersaturated' }}
 */
export function classifyMineralSaturation(SI: any) {
    if (typeof SI !== 'number') throw new TypeError('SI must be a number');
    if (!isFinite(SI)) throw new RangeError('SI must be a finite number');
    /** @type {'undersaturated'|'near_equilibrium'|'supersaturated'} */
    let status;
    if (SI < -0.5) {
        status = 'undersaturated';
    } else if (SI <= 0.5) {
        status = 'near_equilibrium';
    } else {
        status = 'supersaturated';
    }
    return { status };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const hydrogeochemicalModelMeta = {
    name: 'hydrogeochemicalModel',
    description: 'hydrogeochemicalModel',
    category: 'analytics',
    familyTags: ['chemical', 'geochemistry'],
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
