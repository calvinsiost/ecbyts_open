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
// Particulate Matter Deposition - gravitational settling, dry/wet deposition fluxes
// Deposição de material particulado - velocidade de sedimentação, fluxos seco e úmido
'use strict';

// Gravitational acceleration constant (m/s²)
// Constante de aceleração gravitacional
const G = 9.81;

/**
 * Computes gravitational settling velocity using Stokes' Law.
 * Calcula a velocidade de sedimentação gravitacional pela Lei de Stokes.
 *
 * vg = (dp² × (ρp - ρf) × g) / (18 × μ)
 * Valid for particle Reynolds number Re < 1 (Stokes regime).
 *
 * @param {number} particle_diameter_um - Particle diameter in micrometers (μm)
 * @param {number} particle_density_kg_m3 - Particle density in kg/m³
 * @param {number} fluid_density_kg_m3 - Fluid (air) density in kg/m³
 * @param {number} viscosity_Pa_s - Dynamic viscosity of fluid in Pa·s
 * @returns {{ settling_velocity_m_s: number, stokes_valid: boolean }}
 *
 * @references
 *   Stokes, G.G. (1851). On the effect of the internal friction of fluids on pendulums.
 *   Seinfeld, J.H. & Pandis, S.N. (2016). Atmospheric Chemistry and Physics, 3rd ed. Wiley.
 *   CONAMA 491/2018 - Padrões de qualidade do ar PM2.5 e PM10.
 */
export function computeGravitationalSettling(
    particle_diameter_um: any,
    particle_density_kg_m3: any,
    fluid_density_kg_m3: any,
    viscosity_Pa_s: any,
) {
    // Validação de entrada - todos devem ser positivos
    if (
        typeof particle_diameter_um !== 'number' ||
        typeof particle_density_kg_m3 !== 'number' ||
        typeof fluid_density_kg_m3 !== 'number' ||
        typeof viscosity_Pa_s !== 'number'
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (particle_diameter_um <= 0) throw new RangeError('particle_diameter_um must be > 0');
    if (particle_density_kg_m3 <= 0) throw new RangeError('particle_density_kg_m3 must be > 0');
    if (fluid_density_kg_m3 < 0) throw new RangeError('fluid_density_kg_m3 must be >= 0');
    if (viscosity_Pa_s <= 0) throw new RangeError('viscosity_Pa_s must be > 0');

    // Converter diâmetro de μm para m
    const dp = particle_diameter_um * 1e-6;
    const delta_rho = particle_density_kg_m3 - fluid_density_kg_m3;

    // Lei de Stokes: vg = dp² × Δρ × g / (18 × μ)
    const settling_velocity_m_s = (dp * dp * delta_rho * G) / (18 * viscosity_Pa_s);

    // Verificar regime de Stokes: Re = ρf × vg × dp / μ < 1
    const Re = (fluid_density_kg_m3 * Math.abs(settling_velocity_m_s) * dp) / viscosity_Pa_s;
    const stokes_valid = Re < 1;

    return { settling_velocity_m_s, stokes_valid };
}

/**
 * Computes dry deposition flux of particulate matter.
 * Calcula o fluxo de deposição seca de material particulado.
 *
 * Fd = Vd × C
 *
 * @param {number} concentration_ug_m3 - Atmospheric concentration in μg/m³
 * @param {number} deposition_velocity_cm_s - Dry deposition velocity in cm/s
 * @returns {{ flux_ug_m2_s: number, flux_mg_m2_day: number }}
 *
 * @references
 *   Seinfeld, J.H. & Pandis, S.N. (2016). Atmospheric Chemistry and Physics, 3rd ed.
 *   CETESB MA-026/2013 - Método de determinação da deposição atmosférica total.
 */
export function computeDryDepositionFlux(concentration_ug_m3: any, deposition_velocity_cm_s: any) {
    if (typeof concentration_ug_m3 !== 'number' || typeof deposition_velocity_cm_s !== 'number') {
        throw new TypeError('All arguments must be numbers');
    }
    if (concentration_ug_m3 < 0) throw new RangeError('concentration_ug_m3 must be >= 0');
    if (deposition_velocity_cm_s < 0) throw new RangeError('deposition_velocity_cm_s must be >= 0');

    // Converter velocidade de cm/s para m/s
    const Vd_m_s = deposition_velocity_cm_s / 100;

    // Fd (μg/m²/s) = Vd (m/s) × C (μg/m³)
    const flux_ug_m2_s = Vd_m_s * concentration_ug_m3;

    // Converter para mg/m²/dia: (μg/m²/s × 86400 s/dia) / 1000
    const flux_mg_m2_day = (flux_ug_m2_s * 86400) / 1000;

    return { flux_ug_m2_s, flux_mg_m2_day };
}

/**
 * Computes wet deposition flux via washout.
 * Calcula o fluxo de deposição úmida por lavagem atmosférica (washout).
 *
 * Fw = Wr × C × P / 1000
 *
 * @param {number} concentration_ug_m3 - Atmospheric concentration in μg/m³
 * @param {number} precipitation_mm_day - Precipitation in mm/day
 * @param {number} washout_ratio - Dimensionless washout ratio (typical: 200–2000)
 * @returns {{ flux_ug_m2_day: number }}
 *
 * @references
 *   Seinfeld, J.H. & Pandis, S.N. (2016). Atmospheric Chemistry and Physics, 3rd ed.
 *   CONAMA 491/2018 - Padrões nacionais de qualidade do ar.
 */
export function computeWetDepositionFlux(concentration_ug_m3: any, precipitation_mm_day: any, washout_ratio: any) {
    if (
        typeof concentration_ug_m3 !== 'number' ||
        typeof precipitation_mm_day !== 'number' ||
        typeof washout_ratio !== 'number'
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (concentration_ug_m3 < 0) throw new RangeError('concentration_ug_m3 must be >= 0');
    if (precipitation_mm_day < 0) throw new RangeError('precipitation_mm_day must be >= 0');
    if (washout_ratio <= 0) throw new RangeError('washout_ratio must be > 0');

    // Fw (μg/m²/dia) = Wr × C (μg/m³) × P (mm/dia) / 1000 (mm→m)
    const flux_ug_m2_day = washout_ratio * concentration_ug_m3 * (precipitation_mm_day / 1000);

    return { flux_ug_m2_day };
}

/**
 * Classifies deposition impact against CETESB MA-026/2013 reference limits.
 * Classifica o impacto de deposição segundo limites CETESB MA-026/2013.
 *
 * Limits (mg/m²/day): solo=1200, vegetação=600, água=300, edificações=150
 *
 * @param {number} total_deposition_mg_m2_day - Total deposition in mg/m²/day
 * @param {'soil'|'vegetation'|'water'|'building'} receptor - Receptor type
 * @returns {{ impact: string, limit_mg_m2_day: number }}
 *
 * @references
 *   CETESB MA-026/2013 - Determinação da deposição atmosférica total (particulado sedimentável).
 */
export function classifyDepositionImpact(total_deposition_mg_m2_day: any, receptor: any) {
    if (typeof total_deposition_mg_m2_day !== 'number') {
        throw new TypeError('total_deposition_mg_m2_day must be a number');
    }
    if (total_deposition_mg_m2_day < 0) throw new RangeError('total_deposition_mg_m2_day must be >= 0');

    // Limites por tipo de receptor (CETESB MA-026/2013)
    const LIMITS = { soil: 1200, vegetation: 600, water: 300, building: 150 };
    const validReceptors = Object.keys(LIMITS);
    if (!validReceptors.includes(receptor)) {
        throw new RangeError(`receptor must be one of: ${validReceptors.join(', ')}`);
    }

const limit = (LIMITS as any)[receptor];
    const ratio = total_deposition_mg_m2_day / limit;

    // Classificação proporcional ao limite do receptor
    let impact;
    if (ratio < 0.25) impact = 'negligible';
    else if (ratio < 0.5) impact = 'low';
    else if (ratio < 0.75) impact = 'moderate';
    else if (ratio <= 1.0) impact = 'high';
    else impact = 'critical';

    return { impact, limit_mg_m2_day: limit };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const particulateMatterDepositionMeta = {
    name: 'particulateMatterDeposition',
    description: 'particulateMatterDeposition',
    category: 'analytics',
    familyTags: ['environmental'],
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
