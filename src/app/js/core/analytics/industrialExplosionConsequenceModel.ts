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
 * Industrial Explosion Consequence Model
 * Modelo de explosão industrial - equivalência TNT + método Baker-Strehlow-Tang (BST)
 *
 * Referências / References:
 * - Clancey, V.J. (1972) Diagnostic features of explosion damage. 6th Int. Meeting on
 *   Forensic Sciences, Edinburgh.
 * - Baker, Q.A., Tang, M.J., Scheier, E.A., Silva, G.J. (1998) Vapor cloud explosion
 *   analysis. J. Hazard. Mater. 58(1–3):49–60. DOI:10.1016/S0304-3894(97)00058-0
 * - CCPS (2010) Guidelines for Chemical Process Quantitative Risk Analysis, 2nd ed.
 *   AIChE/Wiley. ISBN:978-0-8169-0720-5
 * - Hopkinson, B. (1915) British Ordnance Board Minutes, 13565.
 *   Cranz, C. (1926) Lehrbuch der Ballistik. Springer.
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

// Heat of detonation of TNT (MJ/kg) - referência para equivalência
const TNT_HEAT_MJ_KG = 4.52;

/**
 * Calcula a massa equivalente de TNT para uma nuvem de vapor inflamável.
 * Calculates TNT equivalent mass for a flammable vapour cloud.
 *
 * @param {number} fuelMass_kg       - Massa de combustível liberada (kg). / Released fuel mass (kg).
 * @param {number} heatOfCombustion_MJ_kg - Calor de combustão do combustível (MJ/kg). / Heat of combustion (MJ/kg).
 * @param {number} [efficiency=0.03] - Fator de rendimento de explosão (0–1). Padrão TNT 3% (CCPS 2010). / Explosion efficiency factor (0–1). Default 3% (CCPS 2010).
 * @returns {{ W_TNT_kg: number }} Massa equivalente de TNT em kg. / TNT equivalent mass in kg.
 */
export function calcTNTEquivalentMass(
    fuelMass_kg: number,
    heatOfCombustion_MJ_kg: number,
    efficiency = 0.03,
): { W_TNT_kg: number } {
    if (typeof fuelMass_kg !== 'number' || fuelMass_kg <= 0) {
        throw new RangeError('fuelMass_kg must be a positive number');
    }
    if (typeof heatOfCombustion_MJ_kg !== 'number' || heatOfCombustion_MJ_kg <= 0) {
        throw new RangeError('heatOfCombustion_MJ_kg must be a positive number');
    }
    if (typeof efficiency !== 'number' || efficiency <= 0 || efficiency > 1) {
        throw new RangeError('efficiency must be in range (0, 1]');
    }

    // W_TNT = (efficiency × fuelMass × HC_fuel) / HC_TNT  [Clancey 1972]
    const W_TNT_kg = (efficiency * fuelMass_kg * heatOfCombustion_MJ_kg) / TNT_HEAT_MJ_KG;
    return { W_TNT_kg };
}

/**
 * Calcula a sobrepressão de pico via curva Hopkinson-Cranz (escala de distância de Sachs).
 * Calculates peak overpressure using the Hopkinson-Cranz scaled-distance curve.
 *
 * Aproximação polinomial de Brode (1955) e Kingery-Bulmash (1984) para campo próximo/médio.
 * Polynomial approximation valid for Z = R/W^(1/3) in [0.5, 40] m/kg^(1/3).
 *
 * @param {number} W_TNT  - Massa equivalente de TNT (kg). / TNT equivalent mass (kg).
 * @param {number} distance_m - Distância ao centro da explosão (m). / Distance from blast centre (m).
 * @returns {{ overpressure_kPa: number, scaledDistance_m_kg13: number }}
 */
export function calcOverpressureTNT(
    W_TNT: number,
    distance_m: number,
): { overpressure_kPa: number; scaledDistance_m_kg13: number } {
    if (typeof W_TNT !== 'number' || W_TNT <= 0) {
        throw new RangeError('W_TNT must be a positive number');
    }
    if (typeof distance_m !== 'number' || distance_m <= 0) {
        throw new RangeError('distance_m must be a positive number');
    }

    // Distância de Hopkinson-Cranz (m/kg^(1/3))
    const Z = distance_m / Math.cbrt(W_TNT);

    // Polinômio de Kingery-Bulmash (1984) - log-log fit, onda de choque em ar livre
    // Válido para 0.5 ≤ Z ≤ 40 m/kg^(1/3)
    // P_s (kPa) = exp(A0 + A1*ln(Z) + A2*(ln(Z))^2 + A3*(ln(Z))^3)
    const lnZ = Math.log(Z);
    let overpressure_kPa: number;
    if (Z < 0.5) {
        // Campo muito próximo: capeado em ≈ 2e4 kPa (estimativa conservadora)
        overpressure_kPa = 20000;
    } else if (Z <= 2) {
        // Kingery-Bulmash região próxima (1984) coefficients - approximation
        overpressure_kPa = Math.exp(7.2 - 2.0 * lnZ - 0.19 * lnZ ** 2);
    } else if (Z <= 40) {
        // Kingery-Bulmash região intermediária
        overpressure_kPa = Math.exp(6.5 - 2.3 * lnZ + 0.01 * lnZ ** 2);
    } else {
        // Campo distante: onda acústica aproximada
        overpressure_kPa = Math.max(0, 0.84 / Z ** 2);
    }

    return { overpressure_kPa, scaledDistance_m_kg13: Z };
}

/**
 * Calcula a sobrepressão de pico pelo método Baker-Strehlow-Tang (BST).
 * Calculates peak overpressure using the Baker-Strehlow-Tang (BST) method.
 *
 * Tabela de Mach de frente de chama (Mf) - BST 1998 (simplificado):
 * reactivity: 'low'(Mf=0.074), 'medium'(Mf=0.5), 'high'(Mf=1.0)
 *
 * @param {number} fuelMass_kg  - Massa de combustível (kg). / Fuel mass (kg).
 * @param {string} reactivity   - Reatividade: 'low'|'medium'|'high'. / Reactivity level.
 * @param {number} distance_m   - Distância ao centro (m). / Distance from source (m).
 * @returns {{ overpressure_kPa: number, flameMach: number, scaledDistance: number }}
 */
export function calcBSTOverpressure(
    fuelMass_kg: number,
    reactivity: string,
    distance_m: number,
): { overpressure_kPa: number; flameMach: number; scaledDistance: number } {
    if (typeof fuelMass_kg !== 'number' || fuelMass_kg <= 0) {
        throw new RangeError('fuelMass_kg must be a positive number');
    }
    if (!['low', 'medium', 'high'].includes(reactivity)) {
        throw new TypeError("reactivity must be 'low', 'medium', or 'high'");
    }
    if (typeof distance_m !== 'number' || distance_m <= 0) {
        throw new RangeError('distance_m must be a positive number');
    }

    // Número de Mach de frente de chama por reatividade (BST 1998 Table 1)
    const MF_TABLE: Record<string, number> = { low: 0.074, medium: 0.5, high: 1.0 };
    const flameMach = MF_TABLE[reactivity]!;

    // Energia da explosão: E = fuelMass × HC / 2 (hemisfério, confinamento parcial)
    // HC propano ≈ 46.3 MJ/kg usado como proxy genérico; BST usa E em J
    const HC_MJ_KG = 46.3;
    const E_J = fuelMass_kg * HC_MJ_KG * 1e6 * 0.4; // fator α ≈ 0.4 (CCPS 2010)

    // Distância adimensional BST: R' = distance / (E / P0)^(1/3)
    const P0_Pa = 101325; // pressão atmosférica
    const scaledDistance = distance_m / Math.cbrt(E_J / P0_Pa);

    // Sobrepressão adimensional aproximada (BST 1998 curvas, polinômio log-log)
    // Ps/P0 = f(R', Mf) - aproximação piecewise para Mf=0.074/0.5/1.0
    const lnR = Math.log(Math.max(scaledDistance, 0.1));
    let Ps_ratio: number;
    if (reactivity === 'low') {
        Ps_ratio = Math.exp(-3.0 - 1.5 * lnR);
    } else if (reactivity === 'medium') {
        Ps_ratio = Math.exp(-0.9 - 1.8 * lnR);
    } else {
        // high: Mf=1.0 (detonação ou quasi-detonação)
        Ps_ratio = Math.exp(0.3 - 2.0 * lnR);
    }

    const overpressure_kPa = Math.max(0, (Ps_ratio * P0_Pa) / 1000);
    return { overpressure_kPa, flameMach, scaledDistance };
}

/**
 * Classifica o nível de dano por sobrepressão de explosão.
 * Classifies explosion damage level based on peak overpressure.
 *
 * Escala de Clancey (1972) adaptada por CCPS (2010).
 *
 * @param {number} overpressure_kPa - Sobrepressão de pico (kPa). / Peak overpressure (kPa).
 * @returns {{ level: 'negligible'|'minor'|'moderate'|'severe'|'catastrophic', description: string }}
 */
export function classifyExplosionDamage(overpressure_kPa: number): {
    level: 'negligible' | 'minor' | 'moderate' | 'severe' | 'catastrophic';
    description: string;
} {
    if (typeof overpressure_kPa !== 'number' || overpressure_kPa < 0) {
        throw new RangeError('overpressure_kPa must be a non-negative number');
    }

    // Limiares de dano - Clancey (1972) / CCPS (2010) Table 2-13
    if (overpressure_kPa < 0.5) {
        return { level: 'negligible', description: 'Barely perceptible; no structural damage' };
    } else if (overpressure_kPa < 3.5) {
        return { level: 'minor', description: 'Glass breakage; minor structural damage' };
    } else if (overpressure_kPa < 17) {
        return { level: 'moderate', description: 'Partial building collapse; serious injuries' };
    } else if (overpressure_kPa < 35) {
        return { level: 'severe', description: 'Most structures collapse; high fatality probability' };
    } else {
        return { level: 'catastrophic', description: 'Total destruction; near-certain fatalities' };
    }
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialExplosionConsequenceModelMeta: AnalyticsModuleMeta = {
    name: 'industrialExplosionConsequenceModel',
    description: 'industrialExplosionConsequenceModel',
    category: 'analytics',
    familyTags: ['industrial', 'fire'],
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
