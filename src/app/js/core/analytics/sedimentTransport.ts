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
// Application: EHS & Mining - Sediment Transport
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

/**
 * Sediment Transport - Fluvial Bedload & Suspended Load
 *
 * Módulo puro implementando modelos clássicos de transporte de sedimentos
 * fluviais: Shields (1936), Meyer-Peter & Müller (1948), van Rijn (1984).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * References:
 *   - Shields, A. (1936). Anwendung der Aehnlichkeitsmechanik.
 *   - Meyer-Peter, E. & Müller, R. (1948). Formulas for bed-load transport.
 *     Proc. 2nd IAHR Congress, Stockholm.
 *   - van Rijn, L.C. (1984). Sediment transport, Part I: Bed load transport.
 *     J. Hydraulic Engineering, 110(10), 1431-1456. DOI:10.1061/(ASCE)0733-9429(1984)110:10(1431)
 */

// Aceleração gravitacional padrão (m/s²)
const GRAVITY = 9.81;

/**
 * Compute the Shields parameter (dimensionless bed shear stress).
 * Calcula o parâmetro de Shields θ* adimensional.
 *
 * θ* = τ / [(ρs - ρw) × g × d]
 *
 * @param {number} shearStress      - Bed shear stress τ (Pa = N/m²)
 * @param {number} particleDensity  - Sediment density ρs (kg/m³), typically ~2650 for quartz
 * @param {number} waterDensity     - Water density ρw (kg/m³), typically ~1000
 * @param {number} diameter         - Median grain diameter d (m)
 * @returns {number} Dimensionless Shields parameter θ*
 * @throws {RangeError} If any input is non-positive
 * @see Shields (1936)
 */
export function computeShieldsParameter(shearStress: any, particleDensity: any, waterDensity: any, diameter: any) {
    if (shearStress <= 0) throw new RangeError('shearStress must be > 0');
    if (particleDensity <= 0) throw new RangeError('particleDensity must be > 0');
    if (waterDensity <= 0) throw new RangeError('waterDensity must be > 0');
    if (diameter <= 0) throw new RangeError('diameter must be > 0');
    if (particleDensity <= waterDensity) throw new RangeError('particleDensity must be > waterDensity');

    // θ* = τ / [(ρs - ρw) × g × d]
    return shearStress / ((particleDensity - waterDensity) * GRAVITY * diameter);
}

/**
 * Classify bed-load motion status based on Shields parameter.
 * Classifica o movimento de sedimentos de fundo com base em θ*.
 *
 * @param {number} shieldsParam    - Computed Shields parameter θ*
 * @param {number} [criticalShields=0.047] - Critical Shields parameter θ*_cr (Shields 1936 empirical)
 * @returns {'motion'|'no_motion'|'critical'} Motion classification
 * @throws {RangeError} If shieldsParam < 0
 * @see Shields (1936) - θ*_cr ≈ 0.047 for fully turbulent flow
 */
export function classifyBedloadMotion(shieldsParam: any, criticalShields = 0.047) {
    if (shieldsParam < 0) throw new RangeError('shieldsParam must be >= 0');
    if (criticalShields <= 0) throw new RangeError('criticalShields must be > 0');

    // Janela de 5% ao redor do crítico = regime "critical"
    const tolerance = 0.05 * criticalShields;
    if (Math.abs(shieldsParam - criticalShields) <= tolerance) return 'critical';
    if (shieldsParam > criticalShields) return 'motion';
    return 'no_motion';
}

/**
 * Compute bedload transport rate using Meyer-Peter & Müller (1948) formula.
 * Calcula transporte de carga de fundo pela fórmula de Meyer-Peter & Müller.
 *
 * q_b* = 8 × (θ* - θ*_cr)^1.5       [dimensionless]
 * q_b  = q_b* × [(s-1) × g × d³]^0.5  [m²/s]  → multiply by width for [m³/s]
 *
 * @param {number} shieldsParam     - Computed Shields parameter θ*
 * @param {number} criticalShields  - Critical Shields parameter θ*_cr
 * @param {number} particleDensity  - Sediment density ρs (kg/m³)
 * @param {number} waterDensity     - Water density ρw (kg/m³)
 * @param {number} diameter         - Median grain diameter d (m)
 * @returns {number} Unit bedload transport rate q_b (m²/s, volume per unit width)
 * @throws {RangeError} On invalid inputs
 * @see Meyer-Peter & Müller (1948); van Rijn (1984) DOI:10.1061/(ASCE)0733-9429(1984)110:10(1431)
 */
export function computeMeyerPeterMueller(shieldsParam: any, criticalShields: any, particleDensity: any, waterDensity: any, diameter: any) {
    if (shieldsParam < 0) throw new RangeError('shieldsParam must be >= 0');
    if (criticalShields <= 0) throw new RangeError('criticalShields must be > 0');
    if (particleDensity <= waterDensity) throw new RangeError('particleDensity must be > waterDensity');
    if (diameter <= 0) throw new RangeError('diameter must be > 0');

    const excess = shieldsParam - criticalShields;
    if (excess <= 0) return 0; // Sem transporte abaixo do limiar crítico

    // Submerged specific gravity s = ρs/ρw
    const s = particleDensity / waterDensity;

    // Transporte adimensional: φ = 8 × (θ* - θ*_cr)^1.5
    const phi = 8 * Math.pow(excess, 1.5);

    // Transporte dimensional: q_b = φ × sqrt[(s-1) × g × d³]
    const qb = phi * Math.sqrt((s - 1) * GRAVITY * Math.pow(diameter, 3));
    return qb; // m²/s
}

/**
 * Estimate suspended sediment load via volumetric flux.
 * Estima carga de sedimento em suspensão via fluxo volumétrico.
 *
 * q_s = v × h × C   [kg/m/s per unit width]
 *
 * @param {number} velocity          - Mean flow velocity (m/s)
 * @param {number} depth             - Water depth (m)
 * @param {number} concentration_mg_L - Suspended sediment concentration (mg/L)
 * @returns {number} Suspended load per unit width (kg/m/s)
 * @throws {RangeError} On negative inputs
 * @see van Rijn (1984) DOI:10.1061/(ASCE)0733-9429(1984)110:10(1431)
 */
export function estimateSuspendedLoad(velocity: any, depth: any, concentration_mg_L: any) {
    if (velocity < 0) throw new RangeError('velocity must be >= 0');
    if (depth <= 0) throw new RangeError('depth must be > 0');
    if (concentration_mg_L < 0) throw new RangeError('concentration_mg_L must be >= 0');

    // Converter mg/L → kg/m³: 1 mg/L = 1e-3 kg/m³
    const concentration_kg_m3 = concentration_mg_L * 1e-3;

    // q_s = v × h × C  (m/s × m × kg/m³ = kg/m/s)
    return velocity * depth * concentration_kg_m3;
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const sedimentTransportMeta = {
    name: 'sedimentTransport',
    description: 'Sediment Transport',
    category: 'analytics',
    familyTags: ['sediment', 'transport', 'fate_transport'],
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
