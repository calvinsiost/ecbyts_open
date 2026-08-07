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
// Application: EHS & Mining - Soil Permeability Kozeny-Carman
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Soil Permeability - Kozeny-Carman Equation
 *
 * Modulo puro implementando o calculo de permeabilidade intriseca de solos
 * e meios porosos pela equacao de Kozeny-Carman, condutividade hidraulica
 * de Darcy, velocidade de percolacao e classificacao de permeabilidade.
 * Aplicado a avaliacao de contaminacao de solo e agua subterranea,
 * projeto de barreiras e analise de fluxo em areas de remediacao.
 * Zero dependencias de DOM, IDB, Three.js ou fetch.
 *
 * Referencias academicas:
 *   - Kozeny, J. (1927). Uber kapillare Leitung des Wassers im Boden.
 *     Sitzungsberichte der Akademie der Wissenschaften Wien,
 *     Abteilung IIa, 136:271-306. (equacao original de permeabilidade capilar)
 *   - Carman, P. C. (1937). Fluid flow through granular beds.
 *     Transactions of the Institution of Chemical Engineers, 15:150-166.
 *     (generalizacao da equacao de Kozeny para leitos granulares)
 *   - Bear, J. (1972). Dynamics of Fluids in Porous Media.
 *     ISBN 978-0-486-65675-5. Dover Publications. (teoria de fluxo em
 *     meios porosos, lei de Darcy, permeabilidade intriseca)
 */

'use strict';

// Constantes fisicas (SI)
const GRAVITY = 9.81; // Aceleracao gravitacional (m/s²)
const WATER_DENSITY = 1000; // Densidade da agua a 20°C (kg/m³)
const WATER_VISCOSITY = 1e-3; // Viscosidade dinamica da agua a 20°C (Pa·s)

/**
 * Validates that a value is a finite positive number.
 * Valida que o valor e um numero finito positivo.
 * @param {number} value - Valor a validar
 * @param {string} name  - Nome do parametro
 * @throws {TypeError}   Se nao for numero
 * @throws {RangeError}  Se nao for finito ou positivo
 */
function requirePositiveFinite(value: number, name: string): void {
    if (typeof value !== 'number') throw new TypeError(`${name} must be a number`);
    if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`${name} must be a finite positive number, got ${value}`);
    }
}

/**
 * Validates porosity n in (0, 1).
 * Valida a porosidade n no intervalo aberto (0, 1).
 * @param {number} n - Porosidade
 * @throws {TypeError}  Se nao for numero
 * @throws {RangeError} Se fora do intervalo (0, 1)
 */
function requireValidPorosity(n: number): void {
    if (typeof n !== 'number') throw new TypeError('porosity must be a number');
    if (!Number.isFinite(n) || n <= 0 || n >= 1) {
        throw new RangeError(`porosity must be in (0, 1), got ${n}`);
    }
}

// ---------------------------------------------------------------------------
// Permeabilidade Intriseca - Equacao de Kozeny-Carman
// ---------------------------------------------------------------------------

/**
 * Calculates the intrinsic permeability (k) of a granular porous medium
 * using the Kozeny-Carman equation.
 *
 * Calcula a permeabilidade intriseca (k) de um meio poroso granular pela
 * equacao de Kozeny-Carman. Esta equacao relaciona a microestrutura do
 * meio (porosidade, diametro de grao, tortuosidade) com a permeabilidade.
 *
 * Equacao de Kozeny-Carman (Kozeny 1927; Carman 1937):
 *   k = (d² * n³) / (180 * (1 - n)²)
 * onde:
 *   d  = diametro medio das particulas (m)
 *   n  = porosidade (adimensional, 0 < n < 1)
 *   180 = constante de Kozeny-Carman (Bear 1972, eq. 4.8.2)
 *
 * @param {number} d         - Diametro medio das particulas (m)
 * @param {number} porosity  - Porosidade do solo n (adimensional, 0 < n < 1)
 * @returns {number}         Permeabilidade intriseca k (m²)
 *
 * @example
 * // Areia media: d = 0.5e-3 m, n = 0.38
 * calcKozenyCarmanPermeability(0.5e-3, 0.38) // => ~5.56e-11 m²
 */
export function calcKozenyCarmanPermeability(d: number, porosity: number): number {
    requirePositiveFinite(d, 'd');
    requireValidPorosity(porosity);
    const n = porosity;
    // Equacao de Kozeny-Carman (Bear 1972, eq. 4.8.2; Carman 1937)
    return (d * d * Math.pow(n, 3)) / (180 * Math.pow(1 - n, 2));
}

// ---------------------------------------------------------------------------
// Condutividade Hidraulica (Hydraulic Conductivity)
// ---------------------------------------------------------------------------

/**
 * Calculates the saturated hydraulic conductivity (K) from intrinsic
 * permeability using Darcy's law with fluid properties.
 *
 * Calcula a condutividade hidraulica saturada (K) a partir da permeabilidade
 * intriseca, usando propriedades do fluido (agua) pela lei de Darcy.
 * Aplicavel a avaliacao de fluxo de agua subterranea e transporte de
 * contaminantes (CONAMA 420/2009, metodos de investigacao).
 *
 * K = (k * rho * g) / mu
 * onde:
 *   k   = permeabilidade intriseca (m²)
 *   rho = densidade do fluido (kg/m³), padrao: 1000 kg/m³ (agua a 20°C)
 *   g   = aceleracao gravitacional (m/s²) = 9.81 m/s²
 *   mu  = viscosidade dinamica (Pa·s), padrao: 1e-3 Pa·s (agua a 20°C)
 *
 * @param {number} k               - Permeabilidade intriseca (m²)
 * @param {number} [density]       - Densidade do fluido (kg/m³), padrao 1000
 * @param {number} [viscosity]     - Viscosidade dinamica (Pa·s), padrao 1e-3
 * @returns {number}               Condutividade hidraulica K (m/s)
 *
 * @example
 * calcHydraulicConductivity(5.56e-11) // => ~5.45e-4 m/s
 */
export function calcHydraulicConductivity(k: number, density: number = WATER_DENSITY, viscosity: number = WATER_VISCOSITY): number {
    requirePositiveFinite(k, 'k');
    requirePositiveFinite(density, 'density');
    requirePositiveFinite(viscosity, 'viscosity');
    // Lei de Darcy + propriedades do fluido (Bear 1972, eq. 4.2.8)
    return (k * density * GRAVITY) / viscosity;
}

// ---------------------------------------------------------------------------
// Velocidade de Percolacao de Darcy (Seepage Velocity)
// ---------------------------------------------------------------------------

interface SeepageVelocityResult {
    darcyVelocity: number;
    poreVelocity: number;
}

/**
 * Calculates the seepage (Darcy) velocity of groundwater flow through
 * a porous medium given hydraulic conductivity and hydraulic gradient.
 *
 * Calcula a velocidade de percolacao (velocidade de Darcy) do fluxo de
 * agua subterranea, considerando condutividade hidraulica e gradiente
 * hidraulico. Fundamental para estimativa de chegada de contaminantes.
 *
 * Lei de Darcy: v = K * i
 * Velocidade de poro (linear): v_pore = v / n
 *
 * @param {number} K         - Condutividade hidraulica saturada (m/s)
 * @param {number} gradient  - Gradiente hidraulico i = dh/dL (adimensional)
 * @param {number} porosity  - Porosidade efetiva n (adimensional, 0 < n < 1)
 * @returns {{ darcyVelocity: number, poreVelocity: number }}
 *   darcyVelocity: velocidade de Darcy (m/s)
 *   poreVelocity:  velocidade linear media nos poros (m/s)
 *
 * @example
 * calcSeepageVelocity(5.45e-4, 0.01, 0.38)
 * // => { darcyVelocity: 5.45e-6, poreVelocity: ~1.43e-5 }
 */
export function calcSeepageVelocity(K: number, gradient: number, porosity: number): SeepageVelocityResult {
    requirePositiveFinite(K, 'K');
    requirePositiveFinite(gradient, 'gradient');
    requireValidPorosity(porosity);
    // Velocidade de Darcy (Bear 1972, eq. 4.2.1)
    const darcyVelocity = K * gradient;
    // Velocidade de poro = velocidade real media nas passagens de fluxo
    const poreVelocity = darcyVelocity / porosity;
    return { darcyVelocity, poreVelocity };
}

// ---------------------------------------------------------------------------
// Classificacao de Permeabilidade
// ---------------------------------------------------------------------------

interface PermeabilityClassResult {
    class: string;
    description: string;
    typicalMaterial: string;
}

/**
 * Classifies soil/rock permeability class based on hydraulic conductivity K.
 * Uses the standard geotechnical classification (Freeze & Cherry 1979;
 * Bear 1972; ASTM D5084).
 *
 * Classifica a classe de permeabilidade do solo/rocha com base na
 * condutividade hidraulica K. Referencia para avaliacao de contaminacao,
 * projeto de barreiras e analise de remediacao (CETESB, CONAMA 420/2009).
 *
 * Classificacao (Bear 1972; Freeze & Cherry 1979):
 *   'highly_permeable'      : K >= 1e-2 m/s (cascalho, fratura aberta)
 *   'permeable'             : K >= 1e-4 m/s (areia grossa, areia media)
 *   'moderately_permeable'  : K >= 1e-6 m/s (areia fina, silte arenoso)
 *   'low_permeability'      : K >= 1e-9 m/s (silte, argila siltosa)
 *   'very_low_permeability' : K >= 1e-12 m/s (argila, xisto intemperizado)
 *   'practically_impermeable': K < 1e-12 m/s (rocha intacta, argila compacta)
 *
 * @param {number} K - Condutividade hidraulica saturada (m/s)
 * @returns {{ class: string, description: string, typicalMaterial: string }}
 *
 * @example
 * classifyPermeabilityClass(5.45e-4)
 * // => { class: 'permeable', description: '1e-4 to 1e-2 m/s', typicalMaterial: 'Coarse to medium sand' }
 */
export function classifyPermeabilityClass(K: number): PermeabilityClassResult {
    requirePositiveFinite(K, 'K');

    // Limites de condutividade hidraulica (Bear 1972, Table 4.2;
    // Freeze & Cherry 1979, Fig. 2.2; ASTM D5084 interpretation)
    if (K >= 1e-2) {
        return {
            class: 'highly_permeable',
            description: '>= 1e-2 m/s',
            typicalMaterial: 'Gravel, open fractures, karst',
        };
    }
    if (K >= 1e-4) {
        return {
            class: 'permeable',
            description: '1e-4 to 1e-2 m/s',
            typicalMaterial: 'Coarse to medium sand',
        };
    }
    if (K >= 1e-6) {
        return {
            class: 'moderately_permeable',
            description: '1e-6 to 1e-4 m/s',
            typicalMaterial: 'Fine sand, silty sand',
        };
    }
    if (K >= 1e-9) {
        return {
            class: 'low_permeability',
            description: '1e-9 to 1e-6 m/s',
            typicalMaterial: 'Silt, silty clay',
        };
    }
    if (K >= 1e-12) {
        return {
            class: 'very_low_permeability',
            description: '1e-12 to 1e-9 m/s',
            typicalMaterial: 'Clay, weathered shale',
        };
    }
    return {
        class: 'practically_impermeable',
        description: '< 1e-12 m/s',
        typicalMaterial: 'Intact rock, compacted clay, dense concrete',
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilPermeabilityKozenyCarmanMeta = {
    name: 'soilPermeabilityKozenyCarman',
    description: 'Soil Permeability Kozeny-Carman',
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
