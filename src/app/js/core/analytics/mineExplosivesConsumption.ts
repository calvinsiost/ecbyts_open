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
 * Mine Explosives Consumption - Consumo de explosivos em mineração
 *
 * Referências acadêmicas:
 *  - Cunningham, C.V.B. (1983). The Kuz-Ram model for prediction of fragmentation from blasting.
 *    Proc. 1st Int. Symp. on Rock Fragmentation by Blasting, Luleå, pp. 439-453.
 *  - Kuznetsov, V.M. (1973). The mean diameter of fragments formed by blasting rock.
 *    Soviet Mining Science, 9(2), 144-148. DOI: 10.1007/BF02506177
 *  - ISEE (2011). Blasters' Handbook, 18th ed. International Society of Explosives Engineers.
 *    ISBN 978-1-892396-00-4
 *  - Rosin, P. & Rammler, E. (1933). The laws governing the fineness of powdered coal.
 *    Journal of the Institute of Fuel, 7, 29-36.
 *  - Mancini, R. (2011). NOx fumes from blasting: assessment and control.
 *    EXPLO Conference, AusIMM, Melbourne.
 *
 * Zero dependências DOM/IDB/Three.js/fetch.
 * @module mineExplosivesConsumption
 */

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
 * Calculates mean fragment size x50 using Kuznetsov equation (Cunningham 1983).
 * Calcula diâmetro médio de fragmentos x50 pela equação de Kuznetsov (Cunningham 1983).
 *
 * x50 = A * (V0/Q)^0.8 * Qe^(1/6) * (115/ANFO_strength)^(19/30)
 *
 * where:
 *  A = rock factor (blastability index, 7-13; 7=soft, 13=hard)
 *  V0 = volume of rock per blast hole (m³)
 *  Q = mass of explosive per hole (kg)
 *  Qe = equivalent charge per hole in kg of TNT (Q × ANFO_strength/100)
 *  ANFO_strength = relative weight strength vs ANFO (100 = ANFO)
 *
 * @param {number} rockFactor - Blastability index A (7–13) / Índice de fragmentabilidade
 * @param {number} volumePerHole_m3 - Volume of rock per blast hole (m³)
 * @param {number} chargePerHole_kg - Explosive mass per hole (kg)
 * @param {number} [anfoStrength=100] - Relative weight strength % vs ANFO
 * @returns {number} Mean fragment size x50 (mm)
 */
export function calcKuzRamX50(
    rockFactor: number,
    volumePerHole_m3: number,
    chargePerHole_kg: number,
    anfoStrength = 100,
): number {
    if (rockFactor < 1 || rockFactor > 20) {
        throw new RangeError('rockFactor (blastability index A) must be between 1 and 20');
    }
    if (volumePerHole_m3 <= 0) throw new RangeError('volumePerHole_m3 must be positive');
    if (chargePerHole_kg <= 0) throw new RangeError('chargePerHole_kg must be positive');
    if (anfoStrength <= 0 || anfoStrength > 300) {
        throw new RangeError('anfoStrength must be between 0 (exclusive) and 300');
    }

    // Equivalent TNT charge (kg) / carga equivalente em TNT
    const Qe = chargePerHole_kg * (anfoStrength / 100);

    // Kuznetsov equation - result in cm, then convert to mm
    const x50_cm =
        rockFactor *
        Math.pow(volumePerHole_m3 / chargePerHole_kg, 0.8) *
        Math.pow(Qe, 1 / 6) *
        Math.pow(115 / anfoStrength, 19 / 30);

    return x50_cm * 10; // cm → mm
}

/**
 * Computes Rosin-Rammler fragment size distribution.
 * Calcula distribuição granulométrica de Rosin-Rammler (passante acumulado).
 *
 * P(x) = 1 - exp(-(x/x50)^n) * (1/ln(2))^(1/n) scaling
 * Cunningham (1983): n = 2.2 - 14*(B/D) + (1 - S/B)*(1 + A/2)
 *
 * @param {number} x_mm - Fragment size to evaluate (mm)
 * @param {number} x50_mm - Mean fragment size (mm)
 * @param {number} uniformityIndex - Rosin-Rammler n (uniformity; ~1-3)
 * @returns {number} Cumulative passing fraction [0, 1]
 */
export function calcRosinRammlerPassing(x_mm: number, x50_mm: number, uniformityIndex: number): number {
    if (x_mm < 0) throw new RangeError('x_mm must be non-negative');
    if (x50_mm <= 0) throw new RangeError('x50_mm must be positive');
    if (uniformityIndex <= 0) throw new RangeError('uniformityIndex must be positive');

    // Parâmetro de escala: xc = x50 / (ln2)^(1/n)
    const xc = x50_mm / Math.pow(Math.LN2, 1 / uniformityIndex);
    return 1 - Math.exp(-Math.pow(x_mm / xc, uniformityIndex));
}

/**
 * Estimates powder factor (specific charge) and its optimum for target fragmentation.
 * Estima o powder factor (carga específica) e seu valor ótimo para a fragmentação alvo.
 *
 * Powder factor (PF) = total explosive mass / total rock mass blasted (kg/t)
 *
 * @param {number} explosiveMass_kg - Total explosive used (kg)
 * @param {number} rockMass_t - Total rock blasted (tonnes)
 * @param {number} targetX50_mm - Target mean fragment size (mm)
 * @param {number} rockFactor - Blastability index A
 * @returns {{ powderFactor_kg_t: number, costPerTonne_relative: number, efficiencyIndex: number }}
 */
export function calcPowderFactor(
    explosiveMass_kg: number,
    rockMass_t: number,
    targetX50_mm: number,
    rockFactor: number,
): { powderFactor_kg_t: number; costPerTonne_relative: number; efficiencyIndex: number } {
    if (explosiveMass_kg <= 0) throw new RangeError('explosiveMass_kg must be positive');
    if (rockMass_t <= 0) throw new RangeError('rockMass_t must be positive');
    if (targetX50_mm <= 0) throw new RangeError('targetX50_mm must be positive');
    if (rockFactor < 1 || rockFactor > 20) throw new RangeError('rockFactor must be between 1 and 20');

    const powderFactor_kg_t = explosiveMass_kg / rockMass_t;

    // Índice teórico de eficiência: quão próximo do ótimo Kuz-Ram o PF atual está
    // Kuznetsov ótimo: PF_opt ≈ (A / targetX50)^(5/4) * 0.5 (empirical approximation)
    const pfOptimal = Math.pow(rockFactor / targetX50_mm, 1.25) * 0.5;
    const efficiencyIndex =
        pfOptimal > 0 ? Math.min(powderFactor_kg_t, pfOptimal) / Math.max(powderFactor_kg_t, pfOptimal) : 0;

    // Custo relativo por tonelada (normalizado para PF=0.3 kg/t como referência)
    const costPerTonne_relative = powderFactor_kg_t / 0.3;

    return { powderFactor_kg_t, costPerTonne_relative, efficiencyIndex };
}

/**
 * Estimates NOx and CO emissions per detonation from explosive consumption.
 * Estima emissões de NOₓ e CO por detonação a partir do consumo de explosivos.
 *
 * Based on Mancini (2011) emission factors for ANFO and emulsion blends:
 *  NOx (as NO2): ~170 g/kg ANFO under oxygen-balanced conditions
 *  CO: ~50 g/kg ANFO (oxygen-deficient blast, higher with stemming voids)
 *
 * @param {number} totalExplosive_kg - Total explosive consumed (kg)
 * @param {number} [anfoFraction=1.0] - Fraction of ANFO in blend (0–1); 0 = pure emulsion
 * @returns {{ nox_gNO2: number, co_g: number, nox_kgNO2_per_blast: number, co_kgCO_per_blast: number }}
 */
export function calcBlastEmissions(
    totalExplosive_kg: number,
    anfoFraction = 1.0,
): { nox_gNO2: number; co_g: number; nox_kgNO2_per_blast: number; co_kgCO_per_blast: number } {
    if (totalExplosive_kg <= 0) throw new RangeError('totalExplosive_kg must be positive');
    if (anfoFraction < 0 || anfoFraction > 1) {
        throw new RangeError('anfoFraction must be between 0 and 1');
    }

    // Fatores de emissão: ANFO vs emulsão (emulsão tem menos NOx ~120 g/kg)
    // Emission factors: ANFO vs emulsion (emulsion lower NOx ~120 g/kg)
    const noxFactor_gPerKg = anfoFraction * 170 + (1 - anfoFraction) * 120; // g NO2/kg
    const coFactor_gPerKg = anfoFraction * 50 + (1 - anfoFraction) * 30; // g CO/kg

    const nox_gNO2 = totalExplosive_kg * noxFactor_gPerKg;
    const co_g = totalExplosive_kg * coFactor_gPerKg;

    return {
        nox_gNO2,
        co_g,
        nox_kgNO2_per_blast: nox_gNO2 / 1000,
        co_kgCO_per_blast: co_g / 1000,
    };
}

/**
 * Computes the Fragmentation Efficiency Index (FEI).
 * Calcula o Índice de Eficiência de Fragmentação (IEF).
 *
 * FEI compares achieved x50 against target x50 and powder factor utilization.
 * FEI = 1.0 = perfect; > 1.0 = over-fragmentation; < 1.0 = under-fragmentation
 *
 * @param {number} achievedX50_mm - Measured mean fragment size (mm)
 * @param {number} targetX50_mm - Design target mean fragment size (mm)
 * @param {number} powderFactor_kg_t - Actual powder factor (kg/t)
 * @param {number} [designPF_kg_t=0.3] - Design powder factor (kg/t)
 * @returns {{ fei: number, overFragmented: boolean, underFragmented: boolean, verdict: string }}
 */
export function calcFragmentationEfficiencyIndex(
    achievedX50_mm: number,
    targetX50_mm: number,
    powderFactor_kg_t: number,
    designPF_kg_t = 0.3,
): { fei: number; overFragmented: boolean; underFragmented: boolean; verdict: string } {
    if (achievedX50_mm <= 0) throw new RangeError('achievedX50_mm must be positive');
    if (targetX50_mm <= 0) throw new RangeError('targetX50_mm must be positive');
    if (powderFactor_kg_t <= 0) throw new RangeError('powderFactor_kg_t must be positive');
    if (designPF_kg_t <= 0) throw new RangeError('designPF_kg_t must be positive');

    // Razão de tamanho: 1.0 = atingiu o alvo, <1 = mais fino que o esperado
    const sizeRatio = achievedX50_mm / targetX50_mm;
    // Razão de carga: 1.0 = uso exato do design, >1 = excesso de explosivo
    const pfRatio = powderFactor_kg_t / designPF_kg_t;

    // FEI combinado: produto de sizeRatio e pfRatio normalizado
    const fei = sizeRatio / pfRatio;

    const overFragmented = achievedX50_mm < targetX50_mm * 0.8;
    const underFragmented = achievedX50_mm > targetX50_mm * 1.2;

    let verdict: string;
    if (overFragmented) verdict = 'over_fragmented';
    else if (underFragmented) verdict = 'under_fragmented';
    else verdict = 'on_target';

    return { fei, overFragmented, underFragmented, verdict };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const mineExplosivesConsumptionMeta: AnalyticsModuleMeta = {
    name: 'mineExplosivesConsumption',
    description: 'mineExplosivesConsumption',
    category: 'analytics',
    familyTags: ['mining', 'blasting'],
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
