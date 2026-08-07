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
 * Wind Energy Potential - Weibull statistics & IEC 61400-12-1 power assessment
 *
 * Academic references:
 * - Weibull, W. (1951). A statistical distribution function of wide applicability.
 *   Journal of Applied Mechanics, 18(3), 293-297.
 * - IEC 61400-12-1:2017 - Wind energy generation systems: Power performance
 *   measurements of electricity producing wind turbines.
 * - Rocha, P.A.C. et al. (2012). Comparison of seven numerical methods for
 *   determining Weibull parameters for wind energy generation in the northeast
 *   of Brazil. Applied Energy, 89(1), 395-400. DOI:10.1016/j.apenergy.2011.08.003
 * - IEA Wind (2021). Wind Technology State of the Art. Task 37.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const AIR_DENSITY_STD = 1.225; // kg/m³ at 15°C, sea level (IEC 61400-1)
const PI = Math.PI;

/**
 * IEC 61400-1:2019 wind turbine site classification.
 * Classificação de sítio eólico por velocidade média e turbulência.
 */
const WIND_CLASSES = [
    { cls: 'I', vref: 50, vave: 10.0 }, // Alta velocidade
    { cls: 'II', vref: 42.5, vave: 8.5 }, // Média velocidade
    { cls: 'III', vref: 37.5, vave: 7.5 }, // Baixa velocidade
    { cls: 'S', vref: null, vave: null }, // Especial — site-specific
];

// ─── Math helpers ─────────────────────────────────────────────────────────────

/**
 * Gamma function approximation (Lanczos, coefficients from Numerical Recipes).
 * Função Gamma - usada na distribuição de Weibull.
 * @param {number} z
 * @returns {number}
 */
function gamma(z: any): number {
    // Stirling approximation for large z; Lanczos for general case
    if (z < 0.5) return PI / (Math.sin(PI * z) * gamma(1 - z));
    z -= 1;
    const g = 7;
    const c = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
        12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];
    let x = c[0]!;
    for (let i = 1; i < g + 2; i++) x += c[i]! / (z + i);
    const t = z + g + 0.5;
    return Math.sqrt(2 * PI) * t ** (z + 0.5) * Math.exp(-t) * x;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Fits Weibull parameters (k, c) to wind speed data using the Method of Moments.
 * Ajuste dos parâmetros de Weibull pelo Método dos Momentos (rápido, sem iteração).
 *
 * @param {number[]} windSpeedsMps - Array of wind speed observations (m/s), all >= 0
 * @returns {{ k: number, c: number, meanSpeed: number, stdDev: number }}
 */
export function fitWeibullParameters(windSpeedsMps: any) {
    if (!Array.isArray(windSpeedsMps) || windSpeedsMps.length < 2)
        throw new TypeError('windSpeedsMps must be an array with at least 2 values');
    if (windSpeedsMps.some((v) => typeof v !== 'number' || v < 0))
        throw new RangeError('All wind speeds must be non-negative numbers');

    const n = windSpeedsMps.length;
    const mean = windSpeedsMps.reduce((s, v) => s + v, 0) / n;
    if (mean < 1e-10) throw new RangeError('Mean wind speed too low for Weibull fitting (< 1e-10)');

    const variance = windSpeedsMps.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
    const stdDev = Math.sqrt(variance);

    // Method of Moments: CV = sigma/mu = sqrt(Gamma(1+2/k)/Gamma^2(1+1/k) - 1)
    // Solve for k numerically (bisection on CV)
    const cv = stdDev / mean;
    let kLow = 0.5,
        kHigh = 20.0;
    for (let i = 0; i < 60; i++) {
        const kMid = (kLow + kHigh) / 2;
        const cvMid = Math.sqrt(gamma(1 + 2 / kMid) / gamma(1 + 1 / kMid) ** 2 - 1);
        if (cvMid > cv) kLow = kMid;
        else kHigh = kMid;
    }
    const k = (kLow + kHigh) / 2;

    // Scale parameter c = mean / Gamma(1 + 1/k)
    const c = mean / gamma(1 + 1 / k);

    return { k, c, meanSpeed: mean, stdDev };
}

/**
 * Computes wind power density from Weibull parameters.
 * Densidade de potência do vento (W/m²) - indicador de recurso eólico.
 *
 * Formula: P/A = 0.5 * rho * c^3 * Gamma(1 + 3/k)
 *
 * @param {object} params
 * @param {number} params.k           - Weibull shape parameter (dimensionless)
 * @param {number} params.c           - Weibull scale parameter (m/s)
 * @param {number} [params.airDensity=1.225] - Air density (kg/m³)
 * @returns {{ powerDensityWm2: number, windClass: string, meanSpeedMps: number }}
 */
export function calcWindPowerDensity({
    k,
    c,
    airDensity = AIR_DENSITY_STD
}: any) {
    if (typeof k !== 'number' || k <= 0) throw new RangeError('k must be > 0');
    if (typeof c !== 'number' || c <= 0) throw new RangeError('c must be > 0 (m/s)');
    if (typeof airDensity !== 'number' || airDensity <= 0) throw new RangeError('airDensity must be > 0 (kg/m³)');

    // Potência por unidade de área da seção transversal do rotor
    const powerDensityWm2 = 0.5 * airDensity * c ** 3 * gamma(1 + 3 / k);

    // Classificação IEC 61400-1 por velocidade média (c/Gamma(1+1/k))
    const meanSpeed = c * gamma(1 + 1 / k);
    let windClass = 'S';
    for (const wc of WIND_CLASSES) {
        if (wc.vave !== null && meanSpeed >= wc.vave) {
            windClass = wc.cls;
            break;
        }
    }

    return { powerDensityWm2, windClass, meanSpeedMps: meanSpeed };
}

/**
 * Estimates capacity factor using Weibull CDF and turbine power curve.
 * Fator de capacidade estimado via curva de potência e distribuição de Weibull.
 *
 * @param {object} params
 * @param {number} params.k             - Weibull shape parameter
 * @param {number} params.c             - Weibull scale parameter (m/s)
 * @param {number} params.cutInMps      - Turbine cut-in wind speed (m/s)
 * @param {number} params.ratedMps      - Turbine rated wind speed (m/s)
 * @param {number} params.cutOutMps     - Turbine cut-out wind speed (m/s)
 * @returns {{ capacityFactor: number, availabilityFraction: number }}
 */
export function calcCapacityFactor({
    k,
    c,
    cutInMps,
    ratedMps,
    cutOutMps
}: any) {
    if (typeof k !== 'number' || k <= 0) throw new RangeError('k must be > 0');
    if (typeof c !== 'number' || c <= 0) throw new RangeError('c must be > 0');
    if (typeof cutInMps !== 'number' || cutInMps < 0) throw new RangeError('cutInMps must be >= 0');
    if (typeof ratedMps !== 'number' || ratedMps <= cutInMps) throw new RangeError('ratedMps must be > cutInMps');
    if (typeof cutOutMps !== 'number' || cutOutMps <= ratedMps) throw new RangeError('cutOutMps must be > ratedMps');

    // Weibull CDF: F(v) = 1 - exp(-(v/c)^k)
    /** @param {number} v */
    const weibullCDF = (v: any) => 1 - Math.exp(0 - (v / c) ** k);

    // Fração de horas com vento operacional
    const availabilityFraction = weibullCDF(cutOutMps) - weibullCDF(cutInMps);

    // Capacidade fator aproximada - integração numérica (trapezoidal, 200 pontos)
    // entre cut-in e rated (potência proporcional a v³ normalizada a 1 em rated)
    const steps = 200;
    const dv = (ratedMps - cutInMps) / steps;
    let energyFraction = 0;
    for (let i = 0; i <= steps; i++) {
        const v = cutInMps + i * dv;
        const pdf = (k / c) * (v / c) ** (k - 1) * Math.exp(0 - (v / c) ** k);
        const powerFrac = ((v - cutInMps) / (ratedMps - cutInMps)) ** 3;
        const w = i === 0 || i === steps ? 0.5 : 1;
        energyFraction += w * powerFrac * pdf * dv;
    }
    // Adicionar fração a potência plena (rated até cut-out)
    energyFraction += weibullCDF(cutOutMps) - weibullCDF(ratedMps);

    return { capacityFactor: Math.min(1, energyFraction), availabilityFraction };
}

/**
 * Estimates Annual Energy Production (AEP) for a wind turbine/farm.
 * Produção Anual de Energia estimada (AEP) - base de viabilidade de projeto eólico.
 *
 * @param {object} params
 * @param {number} params.ratedPowerKW      - Turbine rated power (kW)
 * @param {number} params.capacityFactor    - Capacity factor [0, 1]
 * @param {number} params.numberOfTurbines  - Number of turbines (integer >= 1)
 * @param {number} [params.availabilityPct=97] - Technical availability (%)
 * @param {number} [params.wakeEfficiencyPct=90] - Wake/array efficiency (%)
 * @returns {{ aepMWh: number, aepGWh: number, netAepMWh: number }}
 */
export function calcAnnualEnergyProduction({
    ratedPowerKW,
    capacityFactor,
    numberOfTurbines,
    availabilityPct = 97,
    wakeEfficiencyPct = 90
}: any) {
    if (typeof ratedPowerKW !== 'number' || ratedPowerKW <= 0) throw new RangeError('ratedPowerKW must be > 0');
    if (typeof capacityFactor !== 'number' || capacityFactor < 0 || capacityFactor > 1)
        throw new RangeError('capacityFactor must be in [0, 1]');
    if (!Number.isInteger(numberOfTurbines) || numberOfTurbines < 1)
        throw new RangeError('numberOfTurbines must be a positive integer');
    if (typeof availabilityPct !== 'number' || availabilityPct < 0 || availabilityPct > 100)
        throw new RangeError('availabilityPct must be in [0, 100]');
    if (typeof wakeEfficiencyPct !== 'number' || wakeEfficiencyPct < 0 || wakeEfficiencyPct > 100)
        throw new RangeError('wakeEfficiencyPct must be in [0, 100]');

    const hoursPerYear = 8760;
    // AEP bruto: potência × horas × CF × número de turbinas
    const aepMWh = (ratedPowerKW / 1000) * hoursPerYear * capacityFactor * numberOfTurbines;
    // AEP líquido: descontar disponibilidade técnica e perdas de esteira
    const netAepMWh = aepMWh * (availabilityPct / 100) * (wakeEfficiencyPct / 100);

    return { aepMWh, aepGWh: aepMWh / 1000, netAepMWh };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const windEnergyPotentialMeta = {
    name: 'windEnergyPotential',
    description: 'windEnergyPotential',
    category: 'analytics',
    familyTags: ['energy'],
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
