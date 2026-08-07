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
// Application: EHS & Mining - Air Quality Dispersion Modeling
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Air Quality Modeling - AERMOD-like Gaussian Dispersion
 *
 * Módulo puro implementando modelagem Gaussiana de dispersão atmosférica,
 * incluindo vazão de chaminé, altura efetiva de pluma (Briggs 1975),
 * concentração máxima ao solo e estimativa de excedência de padrão CONAMA.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Briggs, G. A. (1975). "Plume rise predictions." Lectures on Air Pollution
 *     and Environmental Impact Analyses. American Meteorological Society, 59–111.
 *     (effective stack height, plume rise formulas)
 *   - US EPA (2022). AERMOD Model Formulation Document.
 *     EPA-454/B-03-001r. Research Triangle Park, NC: EPA/OAQPS.
 *     (Gaussian dispersion, sigma parameterizations)
 *   - CONAMA (2018). Resolução CONAMA n° 491, de 19 de novembro de 2018.
 *     Padrões nacionais de qualidade do ar. Diário Oficial da União. Brasília.
 *     (MP2.5 exceedance criterion: 35 days/year)
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

// Aceleração gravitacional (m/s²)
const G = 9.81;

// Pasquill-Gifford sigma parameters (Briggs rural approximation)
// Parâmetros σ_y e σ_z conforme Briggs (1975) para modelagem rural simplificada
const PG_SIGMA_BRIGGS: Record<string, { ay: number; by: number; az: number; bz: number }> = {
    A: { ay: 0.22, by: 0.0001, az: 0.2, bz: -0.0 },
    B: { ay: 0.16, by: 0.0001, az: 0.12, bz: 0.0 },
    C: { ay: 0.11, by: 0.0001, az: 0.08, bz: 0.0002 },
    D: { ay: 0.08, by: 0.0001, az: 0.06, bz: 0.0015 },
    E: { ay: 0.06, by: 0.0001, az: 0.03, bz: 0.0003 },
    F: { ay: 0.04, by: 0.0001, az: 0.016, bz: 0.0003 },
};

/**
 * Computes volumetric flow rate from a stack.
 * Calcula a vazão volumétrica de saída da chaminé.
 *
 * Q_v = π × (d/2)² × v
 *
 * @param {number} stackDiameter_m    - Stack internal diameter (m)
 * @param {number} exitVelocity_m_s   - Exit gas velocity (m/s)
 * @returns {{ flow_m3_s: number, velocity_m_s: number }}
 */
export function computeStackFlowRate(
    stackDiameter_m: number,
    exitVelocity_m_s: number,
): { flow_m3_s: number; velocity_m_s: number } {
    if (typeof stackDiameter_m !== 'number' || stackDiameter_m <= 0) {
        throw new RangeError('stackDiameter_m must be > 0');
    }
    if (typeof exitVelocity_m_s !== 'number' || exitVelocity_m_s <= 0) {
        throw new RangeError('exitVelocity_m_s must be > 0');
    }

    // Área transversal e vazão volumétrica
    const radius = stackDiameter_m / 2;
    const flow_m3_s = Math.PI * radius * radius * exitVelocity_m_s;

    return { flow_m3_s, velocity_m_s: exitVelocity_m_s };
}

/**
 * Computes effective stack height using Briggs (1975) plume rise formulas.
 * Calcula a altura efetiva da chaminé usando as fórmulas de Briggs (1975).
 *
 * Momentum flux: F_m = v_s × (d/2)² × π
 * Buoyancy flux: F_h = g × Q_v × ΔT / (π × T_s)
 * For v_s > 10 m/s: uses momentum plume rise
 *   ΔH = 1.6 × F_m^(1/3) × x_f^(2/3) / u  [simplified at final rise x_f=10H]
 * Otherwise: buoyancy plume rise
 *   ΔH = 2.6 × (F_h / (u × s))^(1/3),  s = stratification (neutral→0.02)
 *
 * @param {number} stackHeight_m      - Physical stack height (m)
 * @param {number} exitVelocity_m_s   - Exit gas velocity (m/s)
 * @param {number} stackDiameter_m    - Stack internal diameter (m)
 * @param {number} windSpeed_m_s      - Wind speed at stack top (m/s)
 * @param {number} heatFlux_W         - Sensible heat flux from stack (W)
 * @returns {{ effectiveHeight_m: number, plumRise_m: number }}
 */
export function computeEffectiveStackHeight(
    stackHeight_m: number,
    exitVelocity_m_s: number,
    stackDiameter_m: number,
    windSpeed_m_s: number,
    heatFlux_W: number,
): { effectiveHeight_m: number; plumRise_m: number } {
    if (typeof stackHeight_m !== 'number' || stackHeight_m <= 0) {
        throw new RangeError('stackHeight_m must be > 0');
    }
    if (typeof exitVelocity_m_s !== 'number' || exitVelocity_m_s <= 0) {
        throw new RangeError('exitVelocity_m_s must be > 0');
    }
    if (typeof stackDiameter_m !== 'number' || stackDiameter_m <= 0) {
        throw new RangeError('stackDiameter_m must be > 0');
    }
    if (typeof windSpeed_m_s !== 'number' || windSpeed_m_s <= 0) {
        throw new RangeError('windSpeed_m_s must be > 0');
    }
    if (typeof heatFlux_W !== 'number' || !isFinite(heatFlux_W)) {
        throw new TypeError('heatFlux_W must be a finite number');
    }

    const u = windSpeed_m_s;
    const radius = stackDiameter_m / 2;

    let plumeRise_m: number;

    if (exitVelocity_m_s > 10) {
        // Predominância de empuxo por momentum (velocidade alta de saída)
        // F_m = fluxo de momentum (m⁴/s²)
        const F_m = exitVelocity_m_s * Math.PI * radius * radius;
        // Distância de ascensão final simplificada: 10 × H_stack
        const x_f = 10 * stackHeight_m;
        plumeRise_m = (1.6 * Math.pow(F_m, 1 / 3) * Math.pow(x_f, 2 / 3)) / u;
    } else {
        // Predominância de empuxo térmico (buoyancy)
        // Temperatura de saída estimada para F_h (assume 400 K se heatFlux fornecido)
        const T_s = 400; // K (temperatura típica de gases industriais)
        const Q_v = Math.PI * radius * radius * exitVelocity_m_s;
        const F_h = (G * Q_v * Math.max(0, heatFlux_W)) / (Math.PI * T_s);
        // s = estabilidade neutra (aproximação: 0.02 s⁻²)
        const s = 0.02;
        plumeRise_m = F_h > 0 ? 2.6 * Math.pow(F_h / (u * s), 1 / 3) : 0;
    }

    const effectiveHeight_m = stackHeight_m + Math.max(0, plumeRise_m);

    return { effectiveHeight_m, plumRise_m: Math.max(0, plumeRise_m) };
}

/**
 * Computes maximum ground-level concentration using Gaussian plume model.
 * Calcula a concentração máxima ao nível do solo pelo modelo Gaussiano.
 *
 * C_max = Q / (π × e × σ_y × σ_z × u) × exp(−H² / (2 σ_z²))
 * σ_y, σ_z from Pasquill-Gifford Briggs parameterization at x_max
 * x_max estimated as 2H²/σ_z² (distance of maximum impact)
 *
 * @param {number} emissionRate_g_s    - Emission rate (g/s)
 * @param {number} effectiveHeight_m   - Effective plume height (m)
 * @param {number} windSpeed_m_s       - Mean wind speed (m/s)
 * @param {string} stabilityClass      - Pasquill stability class: A–F
 * @returns {{ maxConc_ug_m3: number, distanceToMax_m: number }}
 */
export function computeMaxGroundConcentration(
    emissionRate_g_s: number,
    effectiveHeight_m: number,
    windSpeed_m_s: number,
    stabilityClass: string,
): { maxConc_ug_m3: number; distanceToMax_m: number } {
    if (typeof emissionRate_g_s !== 'number' || emissionRate_g_s < 0) {
        throw new RangeError('emissionRate_g_s must be >= 0');
    }
    if (typeof effectiveHeight_m !== 'number' || effectiveHeight_m < 0) {
        throw new RangeError('effectiveHeight_m must be >= 0');
    }
    if (typeof windSpeed_m_s !== 'number' || windSpeed_m_s <= 0) {
        throw new RangeError('windSpeed_m_s must be > 0');
    }
    const sc = stabilityClass ? stabilityClass.toUpperCase() : '';
    if (!PG_SIGMA_BRIGGS[sc]) {
        throw new RangeError(`stabilityClass must be one of: ${Object.keys(PG_SIGMA_BRIGGS).join(', ')}`);
    }

    const H = effectiveHeight_m;
    const u = windSpeed_m_s;
    const Q_ug_s = emissionRate_g_s * 1e6; // converter g/s → µg/s

    // Distância de impacto máximo (estimativa pela altura efetiva)
    // Para pluma Gaussiana: C_max ocorre onde ∂C/∂x = 0, aprox. em x = 2H²/σ_z²
    // Usar x_max = 500 m como referência se H < 50 m, senão proporcional
    const x_max = Math.max(200, (2 * H * H) / 0.5);

    const { ay, by, az, bz } = PG_SIGMA_BRIGGS[sc]!;
    const sigma_y = (ay * x_max) / Math.sqrt(1 + by * x_max);
    const sigma_z = Math.max(1, (az * x_max) / (1 + bz * x_max));

    // Concentração Gaussiana ao solo (z=0)
    const C_max = (Q_ug_s / (Math.PI * Math.E * sigma_y * sigma_z * u)) * Math.exp((-H * H) / (2 * sigma_z * sigma_z));

    return { maxConc_ug_m3: C_max, distanceToMax_m: x_max };
}

/**
 * Estimates annual exceedance days for an air quality standard.
 * Estima os dias anuais de excedência de padrão de qualidade do ar.
 *
 * exceedance_days = 365 × (C_max / standard)^(−2) × variabilityFactor
 * CONAMA 491/2018: MP2.5 limit = 35 days/year above daily standard
 *
 * @param {number} maxConc_ug_m3       - Maximum ground-level concentration (µg/m³)
 * @param {number} standard_ug_m3      - Air quality standard (µg/m³)
 * @param {number} [variabilityFactor] - Meteorological variability factor (default 0.3)
 * @returns {{ exceedanceDays: number, compliant: boolean }}
 */
export function computeAnnualExceedance(
    maxConc_ug_m3: number,
    standard_ug_m3: number,
    variabilityFactor: number = 0.3,
): { exceedanceDays: number; compliant: boolean } {
    if (typeof maxConc_ug_m3 !== 'number' || maxConc_ug_m3 < 0) {
        throw new RangeError('maxConc_ug_m3 must be >= 0');
    }
    if (typeof standard_ug_m3 !== 'number' || standard_ug_m3 <= 0) {
        throw new RangeError('standard_ug_m3 must be > 0');
    }
    if (typeof variabilityFactor !== 'number' || variabilityFactor <= 0) {
        throw new RangeError('variabilityFactor must be > 0');
    }

    // Se concentração ≤ padrão: conformidade automática
    if (maxConc_ug_m3 <= standard_ug_m3) {
        return { exceedanceDays: 0, compliant: true };
    }

    // Dias de excedência: função inversa quadrática da razão concentração/padrão
    const ratio = maxConc_ug_m3 / standard_ug_m3;
    const exceedanceDays = 365 * Math.pow(ratio, -2) * variabilityFactor;

    // Critério CONAMA 491/2018: não conformidade se >35 dias/ano
    const compliant = exceedanceDays < 35;

    return { exceedanceDays, compliant };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const airQualityModelingMeta: AnalyticsModuleMeta = {
    name: 'airQualityModeling',
    description: 'Air Quality Dispersion Modeling',
    category: 'analytics',
    familyTags: ['air'],
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
