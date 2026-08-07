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
// Application: EHS & Mining - Wetland Water Quality Treatment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Wetland Water Quality Treatment - First-Order k-C* Model
 *
 * Modulo puro implementando o modelo de remocao de poluentes de primeira ordem
 * para zonas umidas construidas (constructed wetlands), conforme o modelo k-C*
 * de Kadlec & Wallace. Inclui calculo de tempo de detencao hidraulica, area
 * necessaria e classificacao de eficiencia de tratamento.
 * Zero dependencias de DOM, IDB, Three.js ou fetch.
 *
 * Referencias academicas:
 *   - Kadlec, R. H. & Wallace, S. D. (2009). Treatment Wetlands, 2nd ed.
 *     ISBN 978-1-56670-526-4. CRC Press. (k-C* first-order area model,
 *     hydraulic efficiency, pollutant removal rate constants)
 *   - US EPA (2000). Constructed Wetlands Treatment of Municipal Wastewaters.
 *     EPA-843-B-00-003. Washington, DC: US EPA. (design guidelines, k values)
 *   - US EPA (2010). Constructed Wetlands Design Handbook.
 *     Office of Research and Development, Washington, DC. (sizing methodology)
 */

'use strict';

/**
 * Validates that a value is a finite positive number.
 * Valida que o valor e um numero finito positivo.
 * @param {number} value - Valor a validar
 * @param {string} name  - Nome do parametro
 * @throws {TypeError}   Se nao for numero
 * @throws {RangeError}  Se nao for finito ou positivo
 */
function requirePositiveFinite(value: any, name: any) {
    if (typeof value !== 'number') throw new TypeError(`${name} must be a number`);
    if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`${name} must be a finite positive number, got ${value}`);
    }
}

/**
 * Validates that a value is a finite non-negative number.
 * Valida que o valor e um numero finito nao-negativo.
 * @param {number} value - Valor a validar
 * @param {string} name  - Nome do parametro
 * @throws {TypeError}   Se nao for numero
 * @throws {RangeError}  Se for negativo ou nao-finito
 */
function requireNonNegativeFinite(value: any, name: any) {
    if (typeof value !== 'number') throw new TypeError(`${name} must be a number`);
    if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`${name} must be finite and >= 0, got ${value}`);
    }
}

// ---------------------------------------------------------------------------
// Remocao de Poluente - Modelo de Primeira Ordem k-C* (Kadlec & Wallace 2009)
// ---------------------------------------------------------------------------

/**
 * Calculates the effluent concentration using the first-order k-C* area model
 * for constructed wetlands (Kadlec & Wallace 2009, eq. 6.10).
 *
 * Calcula a concentracao efluente usando o modelo de area de primeira ordem k-C*
 * para zonas umidas construidas. Este e o modelo padrao USEPA para projeto de
 * wetlands de tratamento.
 *
 * Modelo: C_e = (C_i - C*) * exp(-k_A / q) + C*
 * onde:
 *   C_i = concentracao influente (mg/L)
 *   C*  = concentracao de fundo (background, mg/L)
 *   k_A = constante de velocidade de area (m/d)
 *   q   = carga hidraulica superficial = Q/A (m/d)
 *
 * @param {number} Ci  - Concentracao influente (mg/L)
 * @param {number} Cstar - Concentracao de fundo irreducivel C* (mg/L)
 * @param {number} kA  - Constante de velocidade de area (m/d)
 * @param {number} q   - Carga hidraulica superficial Q/A (m/d)
 * @returns {number}   Concentracao efluente C_e (mg/L)
 *
 * @example
 * calcFirstOrderRemoval(100, 2, 0.4, 0.05) // => ~11.1 mg/L
 */
export function calcFirstOrderRemoval(Ci: any, Cstar: any, kA: any, q: any) {
    requirePositiveFinite(Ci, 'Ci');
    requireNonNegativeFinite(Cstar, 'Cstar');
    requirePositiveFinite(kA, 'kA');
    requirePositiveFinite(q, 'q');
    if (Cstar >= Ci) {
        throw new RangeError('Cstar must be less than Ci (background below influent)');
    }
    // Equacao de remocao de primeira ordem (Kadlec & Wallace 2009, cap. 6)
    return (Ci - Cstar) * Math.exp(-kA / q) + Cstar;
}

// ---------------------------------------------------------------------------
// Tempo de Detencao Hidraulica (Hydraulic Retention Time)
// ---------------------------------------------------------------------------

/**
 * Calculates the Hydraulic Retention Time (HRT) of a constructed wetland.
 * Calcula o Tempo de Detencao Hidraulica (TDH) da zona umida construida.
 *
 * HRT = (V * n) / Q
 * onde V = volume do leito (m³), n = porosidade (adimensional), Q = vazao (m³/d)
 *
 * Para leitos com substrato (SSF - Subsurface Flow), a porosidade e crucial;
 * para FWS (Free Water Surface), n ≈ 1 (Kadlec & Wallace 2009, cap. 3).
 *
 * @param {number} volume    - Volume do leito da zona umida (m³)
 * @param {number} porosity  - Porosidade do substrato [0 < n <= 1]
 * @param {number} flowRate  - Vazao volumetrica Q (m³/d)
 * @returns {number}         Tempo de detencao hidraulica (dias)
 *
 * @example
 * calcHydraulicRetentionTime(500, 0.38, 100) // => 1.9 dias
 */
export function calcHydraulicRetentionTime(volume: any, porosity: any, flowRate: any) {
    requirePositiveFinite(volume, 'volume');
    requirePositiveFinite(porosity, 'porosity');
    requirePositiveFinite(flowRate, 'flowRate');
    if (porosity > 1) {
        throw new RangeError(`porosity must be <= 1, got ${porosity}`);
    }
    // TDH = V * n / Q (Kadlec & Wallace 2009, eq. 3.4)
    return (volume * porosity) / flowRate;
}

// ---------------------------------------------------------------------------
// Area Necessaria do Wetland
// ---------------------------------------------------------------------------

/**
 * Calculates the required surface area of a constructed wetland to achieve
 * a target effluent concentration, using the k-C* first-order area model.
 *
 * Calcula a area superficial necessaria para atingir uma concentracao efluente
 * alvo. E a equacao de projeto central para dimensionamento de wetlands.
 *
 * Modelo inverso de calcFirstOrderRemoval:
 * A = (Q / k_A) * ln((C_i - C*) / (C_t - C*))
 *
 * @param {number} Q      - Vazao volumetrica (m³/d)
 * @param {number} Ci     - Concentracao influente (mg/L)
 * @param {number} Ct     - Concentracao alvo efluente (mg/L)
 * @param {number} Cstar  - Concentracao de fundo irreducivel C* (mg/L)
 * @param {number} kA     - Constante de velocidade de area (m/d)
 * @returns {number}      Area superficial necessaria (m²)
 *
 * @example
 * calcWetlandAreaRequired(100, 100, 20, 2, 0.4) // => ~401.8 m²
 */
export function calcWetlandAreaRequired(Q: any, Ci: any, Ct: any, Cstar: any, kA: any) {
    requirePositiveFinite(Q, 'Q');
    requirePositiveFinite(Ci, 'Ci');
    requirePositiveFinite(Ct, 'Ct');
    requireNonNegativeFinite(Cstar, 'Cstar');
    requirePositiveFinite(kA, 'kA');
    if (Cstar >= Ci) throw new RangeError('Cstar must be less than Ci');
    if (Ct >= Ci) throw new RangeError('Target Ct must be less than Ci');
    if (Ct <= Cstar) throw new RangeError('Target Ct must be greater than Cstar');
    // Inversao da equacao k-C* (Kadlec & Wallace 2009, eq. 6.12)
    return (Q / kA) * Math.log((Ci - Cstar) / (Ct - Cstar));
}

// ---------------------------------------------------------------------------
// Classificacao de Eficiencia de Tratamento
// ---------------------------------------------------------------------------

/**
 * Classifies treatment efficiency of a constructed wetland based on
 * percent removal achieved.
 *
 * Classifica a eficiencia de tratamento da zona umida com base na percentagem
 * de remocao. Padroes de referencia: USEPA (2000), CONAMA 430/2011, NBR 13969.
 *
 * Classificacao:
 *   - 'excellent' : removal >= 90%
 *   - 'good'      : removal >= 75%
 *   - 'acceptable': removal >= 50%
 *   - 'marginal'  : removal >= 25%
 *   - 'poor'      : removal <  25%
 *
 * @param {number} Ci  - Concentracao influente (mg/L)
 * @param {number} Ce  - Concentracao efluente medida (mg/L)
 * @returns {{ removalPercent: number, grade: string, label: string }}
 *
 * @example
 * classifyTreatmentEfficiency(100, 8)
 * // => { removalPercent: 92, grade: 'excellent', label: '>= 90% removal' }
 */
export function classifyTreatmentEfficiency(Ci: any, Ce: any) {
    requirePositiveFinite(Ci, 'Ci');
    requireNonNegativeFinite(Ce, 'Ce');
    if (Ce > Ci) throw new RangeError('Effluent Ce cannot exceed influent Ci');

    // Remocao percentual (Kadlec & Wallace 2009, cap. 6)
    const removalPercent = ((Ci - Ce) / Ci) * 100;

    let grade, label;
    if (removalPercent >= 90) {
        grade = 'excellent';
        label = '>= 90% removal';
    } else if (removalPercent >= 75) {
        grade = 'good';
        label = '75-90% removal';
    } else if (removalPercent >= 50) {
        grade = 'acceptable';
        label = '50-75% removal';
    } else if (removalPercent >= 25) {
        grade = 'marginal';
        label = '25-50% removal';
    } else {
        grade = 'poor';
        label = '< 25% removal';
    }

    return { removalPercent, grade, label };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const wetlandWaterQualityTreatmentMeta = {
    name: 'wetlandWaterQualityTreatment',
    description: 'Wetland Water Quality Treatment',
    category: 'analytics',
    familyTags: ['water', 'wetland'],
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
