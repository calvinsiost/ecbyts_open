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
// Application: EHS & Mining - Groundwater Contaminant Transport
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Groundwater Contaminant Transport - Advection-Dispersion Module
 *
 * Módulo puro implementando equações clássicas de transporte de contaminantes
 * em aquíferos porosos saturados: advecção de Darcy, dispersão longitudinal,
 * tempo de breakthrough 1D (solução analítica de Ogata-Banks) e classificação
 * de mobilidade por fator de retardamento.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Bear, J. (1972). "Dynamics of Fluids in Porous Media."
 *     Elsevier/Dover. ISBN 978-0-486-65675-5.
 *     (velocidade de advecção linear, porosidade efetiva, dispersão mecânica)
 *   - Ogata, A. & Banks, R. B. (1961). "A solution of the differential equation
 *     of longitudinal dispersion in porous media." USGS Professional Paper 411-A.
 *     (solução analítica ADE 1D com condição de entrada tipo-pulso ou contínua)
 *   - Freeze, R. A. & Cherry, J. A. (1979). "Groundwater."
 *     Prentice-Hall. ISBN 978-0-13-365312-0.
 *     (retardamento, fator R, classificação de mobilidade de contaminantes)
 *
 * @module groundwaterContaminantTransport
 */

'use strict';

/**
 * Calcula a velocidade de advecção linear (velocidade de poros) a partir da
 * velocidade de Darcy e da porosidade efetiva.
 *
 * A velocidade real de transporte advectivo de contaminantes dissolvidos é
 * maior que a velocidade de Darcy porque o fluxo se concentra nos poros.
 * Equação: v = q / n_e  (Bear, 1972, eq. 5.1.1)
 *
 * @param {number} darcyFlux_m_s  Fluxo de Darcy [m/s] (positivo)
 * @param {number} effectivePorosity  Porosidade efetiva [-] (0 < n_e < 1)
 * @returns {{ advectionVelocity_m_s: number, darcyFlux_m_s: number, effectivePorosity: number }}
 * @throws {RangeError} Se inputs forem não-positivos ou porosidade fora de (0,1)
 */
export function calcAdvectionVelocity(darcyFlux_m_s: any, effectivePorosity: any) {
    if (typeof darcyFlux_m_s !== 'number' || typeof effectivePorosity !== 'number') {
        throw new TypeError('darcyFlux_m_s and effectivePorosity must be numbers');
    }
    if (darcyFlux_m_s <= 0) {
        throw new RangeError('darcyFlux_m_s must be > 0');
    }
    if (effectivePorosity <= 0 || effectivePorosity >= 1) {
        throw new RangeError('effectivePorosity must be in (0, 1)');
    }

    // Velocidade linear média nos poros (Freeze & Cherry, 1979, eq. 3.40)
    const advectionVelocity_m_s = darcyFlux_m_s / effectivePorosity;

    return {
        advectionVelocity_m_s,
        darcyFlux_m_s,
        effectivePorosity,
    };
}

/**
 * Calcula o coeficiente de dispersão longitudinal hidrodinâmica.
 *
 * O coeficiente de dispersão hidrodinámica combina dispersão mecânica
 * (proporcional à dispersividade longitudinal e velocidade) com difusão
 * molecular efetiva.
 * Equação: D_L = alpha_L * v + D* (Bear, 1972, eq. 10.3.2)
 * D* = tau * D_m  (coeficiente de difusão molecular efetivo, tau ≈ 0.67)
 *
 * @param {number} dispersivity_m  Dispersividade longitudinal alpha_L [m]
 * @param {number} advectionVelocity_m_s  Velocidade de poros [m/s]
 * @param {number} [molecularDiffusion_m2_s=0]  Difusão molecular D_m [m²/s] (padrão: 0)
 * @param {number} [tortuosityFactor=0.67]  Fator de tortuosidade tau [-]
 * @returns {{ dispersionCoeff_m2_s: number, mechanicalDispersion_m2_s: number, effectiveDiffusion_m2_s: number }}
 * @throws {RangeError} Se dispersividade ou velocidade forem não-positivos
 */
export function calcDispersionCoefficient(
    dispersivity_m: any,
    advectionVelocity_m_s: any,
    molecularDiffusion_m2_s = 0,
    tortuosityFactor = 0.67,
) {
    if (typeof dispersivity_m !== 'number' || typeof advectionVelocity_m_s !== 'number') {
        throw new TypeError('dispersivity_m and advectionVelocity_m_s must be numbers');
    }
    if (dispersivity_m <= 0) {
        throw new RangeError('dispersivity_m must be > 0');
    }
    if (advectionVelocity_m_s <= 0) {
        throw new RangeError('advectionVelocity_m_s must be > 0');
    }
    if (molecularDiffusion_m2_s < 0) {
        throw new RangeError('molecularDiffusion_m2_s must be >= 0');
    }

    // Dispersão mecânica (domina a longas distâncias)
    const mechanicalDispersion_m2_s = dispersivity_m * advectionVelocity_m_s;
    // Difusão efetiva corrigida pela tortuosidade dos poros
    const effectiveDiffusion_m2_s = tortuosityFactor * molecularDiffusion_m2_s;
    const dispersionCoeff_m2_s = mechanicalDispersion_m2_s + effectiveDiffusion_m2_s;

    return {
        dispersionCoeff_m2_s,
        mechanicalDispersion_m2_s,
        effectiveDiffusion_m2_s,
    };
}

/**
 * Calcula o tempo de breakthrough em um ponto receptor distante L metros
 * da fonte, usando a solução analítica de Ogata-Banks (1961) para a
 * equação de advecção-dispersão (ADE) 1D em condições de fluxo permanente.
 *
 * O tempo de breakthrough (C/C0 = 0.5) corresponde ao tempo em que a
 * concentração no ponto receptor atinge 50% da concentração da fonte.
 * t_bt = L / v_r  onde v_r = v / R  (velocidade retardada)
 * R = 1 + (rho_b / n_e) * Kd   (fator de retardamento, Freeze & Cherry, 1979)
 *
 * @param {number} distance_m  Distância da fonte ao receptor [m]
 * @param {number} advectionVelocity_m_s  Velocidade de poros [m/s]
 * @param {number} retardationFactor  Fator de retardamento R [-] (>= 1)
 * @returns {{ breakthroughTime_s: number, breakthroughTime_days: number, retardedVelocity_m_s: number }}
 * @throws {RangeError} Se inputs forem inválidos
 */
export function calcBreakthroughTime(distance_m: any, advectionVelocity_m_s: any, retardationFactor: any) {
    if (
        typeof distance_m !== 'number' ||
        typeof advectionVelocity_m_s !== 'number' ||
        typeof retardationFactor !== 'number'
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (distance_m <= 0) {
        throw new RangeError('distance_m must be > 0');
    }
    if (advectionVelocity_m_s <= 0) {
        throw new RangeError('advectionVelocity_m_s must be > 0');
    }
    if (retardationFactor < 1) {
        throw new RangeError('retardationFactor must be >= 1 (non-reactive minimum is 1)');
    }

    // Velocidade efetiva do contaminante retardado pelo solo
    const retardedVelocity_m_s = advectionVelocity_m_s / retardationFactor;
    // Tempo para C/C0 = 0.5 no ponto receptor (solução Ogata-Banks, 1961)
    const breakthroughTime_s = distance_m / retardedVelocity_m_s;
    const breakthroughTime_days = breakthroughTime_s / 86400;

    return {
        breakthroughTime_s,
        breakthroughTime_days,
        retardedVelocity_m_s,
    };
}

/**
 * Classifica a mobilidade de um contaminante em aquífero com base no
 * fator de retardamento calculado a partir de Kd e propriedades do solo.
 *
 * Classes de mobilidade (Freeze & Cherry, 1979, Tabela 9.4):
 *   - R < 1.5  : muito alta (praticamente conservativo)
 *   - R < 5    : alta
 *   - R < 20   : moderada
 *   - R < 100  : baixa
 *   - R >= 100 : muito baixa (praticamente imóvel)
 *
 * @param {number} bulkDensity_kg_m3  Densidade aparente do solo [kg/m³]
 * @param {number} effectivePorosity  Porosidade efetiva [-] (0 < n_e < 1)
 * @param {number} Kd_m3_kg  Coeficiente de partição linear [m³/kg]
 * @returns {{ retardationFactor: number, mobilityClass: string, mobilityDescription: string }}
 * @throws {RangeError} Se inputs forem inválidos
 */
export function classifyContaminantMobility(bulkDensity_kg_m3: any, effectivePorosity: any, Kd_m3_kg: any) {
    if (
        typeof bulkDensity_kg_m3 !== 'number' ||
        typeof effectivePorosity !== 'number' ||
        typeof Kd_m3_kg !== 'number'
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (bulkDensity_kg_m3 <= 0) {
        throw new RangeError('bulkDensity_kg_m3 must be > 0');
    }
    if (effectivePorosity <= 0 || effectivePorosity >= 1) {
        throw new RangeError('effectivePorosity must be in (0, 1)');
    }
    if (Kd_m3_kg < 0) {
        throw new RangeError('Kd_m3_kg must be >= 0');
    }

    // Fator de retardamento (Freeze & Cherry, 1979, eq. 9.11)
    const retardationFactor = 1 + (bulkDensity_kg_m3 / effectivePorosity) * Kd_m3_kg;

    let mobilityClass;
    let mobilityDescription;

    if (retardationFactor < 1.5) {
        mobilityClass = 'VERY_HIGH';
        mobilityDescription = 'Very high mobility — contaminant behaves nearly conservatively';
    } else if (retardationFactor < 5) {
        mobilityClass = 'HIGH';
        mobilityDescription = 'High mobility — slight retardation, rapid plume migration';
    } else if (retardationFactor < 20) {
        mobilityClass = 'MODERATE';
        mobilityDescription = 'Moderate mobility — significant sorption, slower migration';
    } else if (retardationFactor < 100) {
        mobilityClass = 'LOW';
        mobilityDescription = 'Low mobility — strong sorption, limited plume extent';
    } else {
        mobilityClass = 'VERY_LOW';
        mobilityDescription = 'Very low mobility — strongly sorbed, practically immobile';
    }

    return { retardationFactor, mobilityClass, mobilityDescription };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const groundwaterContaminantTransportMeta = {
    name: 'groundwaterContaminantTransport',
    description: 'Groundwater Contaminant Transport',
    category: 'analytics',
    familyTags: ['groundwater', 'water', 'contamination', 'transport', 'fate_transport'],
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
