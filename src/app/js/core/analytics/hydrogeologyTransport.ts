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
// Application: EHS & Mining - Hydrogeology Contaminant Transport
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Hydrogeology Contaminant Transport - Aquifer Transport Model
 *
 * Módulo puro implementando equações clássicas de transporte de contaminantes
 * em meios porosos saturados (aquíferos). Cobre retardação, advecção, dispersão
 * e tempo de breakthrough para solutos conservativos e reativos.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Bear, J. (1972). Dynamics of Fluids in Porous Media.
 *     American Elsevier, New York. ISBN 0-486-65675-6.
 *     (fundamental equations for advection-dispersion transport)
 *   - Ogata, A. & Banks, R. B. (1961). A solution of the differential equation
 *     of longitudinal dispersion in porous media. USGS Professional Paper 411-A.
 *     (analytical solution for 1D ADE)
 *   - Fetter, C. W. (1999). Contaminant Hydrogeology (2nd ed.).
 *     Prentice Hall. ISBN 0-13-751215-5.
 *   - Domenico, P. A. & Schwartz, F. W. (1998). Physical and Chemical
 *     Hydrogeology (2nd ed.). Wiley. ISBN 0-471-59762-7.
 */

'use strict';

// ─── Retardation Factor ────────────────────────────────────────────────────

/**
 * Compute Retardation Factor (R) for a sorbing solute.
 * Calcula o fator de retardação de um soluto em solo saturado.
 *
 * R = 1 + (ρ_b / n) × K_d
 * where ρ_b = bulk density (g/cm³), n = effective porosity (dimensionless),
 * K_d = linear distribution coefficient (cm³/g).
 *
 * R = 1 → conservative tracer (no sorption)
 * R > 1 → retarded contaminant (sorption slows transport)
 *
 * @param porosity - Effective porosity n (0–1, dimensionless)
 * @param bulkDensity - Dry bulk density ρ_b (g/cm³, typically 1.4–1.9)
 * @param kd - Linear distribution coefficient K_d (cm³/g ≥ 0)
 * @returns R ≥ 1
 * @throws {RangeError} if porosity not in (0, 1] or bulkDensity ≤ 0 or kd < 0
 */
export function computeRetardationFactor(
    porosity: number,
    bulkDensity: number,
    kd: number,
): { retardationFactor: number } {
    if (typeof porosity !== 'number' || porosity <= 0 || porosity > 1) {
        throw new RangeError('porosity must be in (0, 1]');
    }
    if (typeof bulkDensity !== 'number' || bulkDensity <= 0) {
        throw new RangeError('bulkDensity must be > 0 g/cm³');
    }
    if (typeof kd !== 'number' || kd < 0) {
        throw new RangeError('kd must be ≥ 0 cm³/g');
    }

    // R = 1 + (ρ_b / n) × K_d  - Bear (1972) eq. 10.6.4
    const retardationFactor = 1 + (bulkDensity / porosity) * kd;
    return { retardationFactor };
}

// ─── Advection Velocity ────────────────────────────────────────────────────

/**
 * Compute pore-water (seepage) advection velocity v (m/day).
 * Calcula a velocidade real de fluxo (velocidade de poros) pela Lei de Darcy.
 *
 * v = K × i / n
 * where K = hydraulic conductivity (m/day), i = hydraulic gradient (m/m),
 * n = effective porosity (dimensionless).
 *
 * @param hydraulicConductivity - K (m/day, > 0)
 * @param gradient - Hydraulic gradient i (m/m, > 0)
 * @param porosity - Effective porosity n (0–1, dimensionless)
 * @returns pore velocity in m/day
 * @throws {RangeError} if any parameter is non-positive or porosity > 1
 */
export function computeAdvectionVelocity(
    hydraulicConductivity: number,
    gradient: number,
    porosity: number,
): { velocity: number } {
    if (typeof hydraulicConductivity !== 'number' || hydraulicConductivity <= 0) {
        throw new RangeError('hydraulicConductivity must be > 0 m/day');
    }
    if (typeof gradient !== 'number' || gradient <= 0) {
        throw new RangeError('gradient must be > 0 m/m');
    }
    if (typeof porosity !== 'number' || porosity <= 0 || porosity > 1) {
        throw new RangeError('porosity must be in (0, 1]');
    }

    // v = K×i / n  - Darcy's law divided by porosity (Bear 1972, eq. 4.1.3)
    const velocity = (hydraulicConductivity * gradient) / porosity;
    return { velocity };
}

// ─── Dispersion Coefficient ────────────────────────────────────────────────

/**
 * Compute hydrodynamic dispersion coefficient D (m²/day).
 * Calcula o coeficiente de dispersão hidrodinâmica longitudinal.
 *
 * D = α_L × v + D*
 * where α_L = longitudinal dispersivity (m), v = pore velocity (m/day),
 * D* = effective molecular diffusion coefficient (m²/day).
 *
 * @param dispersivity - Longitudinal dispersivity α_L (m, ≥ 0)
 * @param velocity - Pore velocity v (m/day, ≥ 0)
 * @param diffusion - Effective molecular diffusion D* (m²/day, ≥ 0)
 * @returns D in m²/day
 * @throws {RangeError} if any parameter is negative
 */
export function computeDispersionCoefficient(
    dispersivity: number,
    velocity: number,
    diffusion: number,
): { dispersionCoefficient: number } {
    if (typeof dispersivity !== 'number' || dispersivity < 0) {
        throw new RangeError('dispersivity must be ≥ 0 m');
    }
    if (typeof velocity !== 'number' || velocity < 0) {
        throw new RangeError('velocity must be ≥ 0 m/day');
    }
    if (typeof diffusion !== 'number' || diffusion < 0) {
        throw new RangeError('diffusion must be ≥ 0 m²/day');
    }

    // D = α_L × v + D*  - Ogata & Banks (1961), Fetter (1999) eq. 3.28
    const dispersionCoefficient = dispersivity * velocity + diffusion;
    return { dispersionCoefficient };
}

// ─── Breakthrough Time ─────────────────────────────────────────────────────

/**
 * Compute solute breakthrough time t (days) at a downstream receptor.
 * Calcula o tempo de chegada do fronte de contaminação (50 % C/C₀).
 *
 * t = R × L / v
 * where R = retardation factor (dimensionless), L = transport distance (m),
 * v = pore velocity (m/day).
 *
 * @param distance - Transport distance L (m, > 0)
 * @param velocity - Pore velocity v (m/day, > 0)
 * @param retardation - Retardation factor R (≥ 1)
 * @returns time in days
 * @throws {RangeError} if distance or velocity ≤ 0, or retardation < 1
 */
export function computeBreakthroughTime(
    distance: number,
    velocity: number,
    retardation: number,
): { breakthroughTime: number } {
    if (typeof distance !== 'number' || distance <= 0) {
        throw new RangeError('distance must be > 0 m');
    }
    if (typeof velocity !== 'number' || velocity <= 0) {
        throw new RangeError('velocity must be > 0 m/day');
    }
    if (typeof retardation !== 'number' || retardation < 1) {
        throw new RangeError('retardation must be ≥ 1');
    }

    // t = R × L / v  - standard 1D ADE front arrival (Ogata & Banks 1961)
    const breakthroughTime = (retardation * distance) / velocity;
    return { breakthroughTime };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const hydrogeologyTransportMeta = {
    name: 'hydrogeologyTransport',
    description: 'Hydrogeology Contaminant Transport',
    category: 'analytics',
    familyTags: ['hydrogeology', 'transport', 'fate_transport'],
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
