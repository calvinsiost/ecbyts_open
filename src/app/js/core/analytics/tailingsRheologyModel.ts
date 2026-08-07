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
 * Tailings Rheology Model - Bingham, Herschel-Bulkley, solids concentration, flow classification
 *
 * Academic references:
 * - Nguyen, Q.D. & Boger, D.V. (1992). Measuring the flow properties of yield stress fluids.
 *   Annual Review of Fluid Mechanics, 24, 47–88.
 *   DOI: 10.1146/annurev.fl.24.010192.000403
 * - Bingham, E.C. (1916). An investigation of the laws of plastic flow.
 *   U.S. Bureau of Standards Bulletin, 13, 309–353.
 *   DOI: 10.6028/bulletin.304
 * - Herschel, W.H. & Bulkley, R. (1926). Konsistenzmessungen von Gummi-Benzollösungen.
 *   Kolloid-Zeitschrift, 39, 291–300. DOI: 10.1007/BF01432034
 * - Jewell, R.J. & Fourie, A.B. (eds.) (2006). Paste and Thickened Tailings: A Guide.
 *   ACG, Australia. ISBN: 978-0-9581918-2-4
 *
 * @module tailingsRheologyModel
 */

interface BinghamOpts {
    yieldStress: number;
    plasticViscosity: number;
    shearRate: number;
}

interface BinghamFitResult {
    yieldStress: number;
    plasticViscosity: number;
    r2: number;
}

interface BinghamDataPoint {
    shearRate: number;
    stress: number;
}

interface HBOpts {
    yieldStress: number;
    consistency: number;
    flowIndex: number;
    shearRate: number;
}

interface SolidsContentOpts {
    slurryDensity: number;
    solidsDensity: number;
    waterDensity?: number;
}

interface SolidsContentResult {
    cw: number;
    cv: number;
}

interface TailingsFlowOpts {
    yieldStress: number;
    cv: number;
}

interface TailingsFlowResult {
    classification: string;
    description: string;
    transportable: boolean;
}

// ---- Bingham Plastic Model ----
// Modelo Plástico de Bingham: τ = τ₀ + μp * γ̇ (para γ̇ > 0)
// onde τ₀ = tensão de escoamento, μp = viscosidade plástica, γ̇ = taxa de cisalhamento

/**
 * Calculate Bingham shear stress at a given shear rate.
 * Calcula a tensão de cisalhamento pelo modelo de Bingham para uma dada taxa de cisalhamento.
 *
 * @param {BinghamOpts} opts
 * @returns {number} shear stress τ (Pa)
 */
export function binghamShearStress({ yieldStress, plasticViscosity, shearRate }: BinghamOpts): number {
    for (const [n, v] of [
        ['yieldStress', yieldStress],
        ['plasticViscosity', plasticViscosity],
        ['shearRate', shearRate],
    ] as [string, number][]) {
        if (typeof v !== 'number' || !isFinite(v)) {
            throw new TypeError(`"${n}" must be a finite number, got: ${v}`);
        }
    }
    if (yieldStress < 0) throw new RangeError(`yieldStress must be >= 0, got: ${yieldStress}`);
    if (plasticViscosity <= 0) throw new RangeError(`plasticViscosity must be > 0, got: ${plasticViscosity}`);
    if (shearRate < 0) throw new RangeError(`shearRate must be >= 0, got: ${shearRate}`);

    // Para γ̇ = 0 o material não flui (τ < τ₀) - retorna τ₀ como tensão estática
    if (shearRate === 0) return yieldStress;
    return yieldStress + plasticViscosity * shearRate;
}

/**
 * Fit Bingham parameters from two shear rate–stress data points using linear regression.
 * Ajusta parâmetros Bingham a partir de dois pares (γ̇, τ) por regressão linear.
 *
 * Note: for production use, supply ≥5 data points. Two-point fit is the minimum case.
 *
 * @param {BinghamDataPoint[]} dataPoints - min 2 points
 * @returns {BinghamFitResult}
 */
export function fitBinghamModel(dataPoints: BinghamDataPoint[]): BinghamFitResult {
    if (!Array.isArray(dataPoints) || dataPoints.length < 2) {
        throw new RangeError('fitBinghamModel requires at least 2 data points');
    }
    const n = dataPoints.length;
    let sumX = 0,
        sumY = 0,
        sumXX = 0,
        sumXY = 0;
    for (const { shearRate, stress } of dataPoints) {
        if (typeof shearRate !== 'number' || typeof stress !== 'number' || !isFinite(shearRate) || !isFinite(stress)) {
            throw new TypeError('Each data point must have finite numeric shearRate and stress');
        }
        if (shearRate < 0 || stress < 0) {
            throw new RangeError('shearRate and stress must be non-negative');
        }
        sumX += shearRate;
        sumY += stress;
        sumXX += shearRate * shearRate;
        sumXY += shearRate * stress;
    }
    // μp = slope, τ₀ = intercept (linear regression y = τ₀ + μp*x)
    const denom = n * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-15) throw new RangeError('Degenerate data: all shear rates are identical');

    const plasticViscosity = (n * sumXY - sumX * sumY) / denom;
    const yieldStress = (sumY - plasticViscosity * sumX) / n;

    // R² para qualidade do ajuste
    const yMean = sumY / n;
    let ssTot = 0,
        ssRes = 0;
    for (const { shearRate, stress } of dataPoints) {
        const predicted = yieldStress + plasticViscosity * shearRate;
        ssTot += (stress - yMean) ** 2;
        ssRes += (stress - predicted) ** 2;
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;

    return {
        yieldStress: Math.max(0, yieldStress), // τ₀ não pode ser negativo fisicamente
        plasticViscosity: Math.max(0, plasticViscosity),
        r2: Math.round(r2 * 10000) / 10000,
    };
}

// ---- Herschel-Bulkley Model ----
// Modelo de Herschel-Bulkley: τ = τ₀ + K * γ̇^n (para γ̇ > 0)
// Generaliza Bingham (n=1) e lei de potência (τ₀=0)

/**
 * Calculate Herschel-Bulkley shear stress.
 * Calcula a tensão de cisalhamento pelo modelo de Herschel-Bulkley.
 *
 * @param {HBOpts} opts
 * @returns {number} shear stress τ (Pa)
 */
export function herschelBulkleyShearStress({ yieldStress, consistency, flowIndex, shearRate }: HBOpts): number {
    for (const [n, v] of [
        ['yieldStress', yieldStress],
        ['consistency', consistency],
        ['flowIndex', flowIndex],
        ['shearRate', shearRate],
    ] as [string, number][]) {
        if (typeof v !== 'number' || !isFinite(v)) {
            throw new TypeError(`"${n}" must be a finite number, got: ${v}`);
        }
    }
    if (yieldStress < 0) throw new RangeError(`yieldStress must be >= 0, got: ${yieldStress}`);
    if (consistency <= 0) throw new RangeError(`consistency K must be > 0, got: ${consistency}`);
    if (flowIndex <= 0 || flowIndex > 3) throw new RangeError(`flowIndex n must be in (0, 3], got: ${flowIndex}`);
    if (shearRate < 0) throw new RangeError(`shearRate must be >= 0, got: ${shearRate}`);

    if (shearRate === 0) return yieldStress;
    return yieldStress + consistency * Math.pow(shearRate, flowIndex);
}

/**
 * Calculate solids content (Cw and Cv) from slurry density.
 * Calcula teor de sólidos em peso (Cw) e volume (Cv) a partir da densidade da polpa.
 *
 * Based on standard mass-balance equations (Jewell & Fourie 2006, Ch. 3).
 *
 * @param {SolidsContentOpts} opts
 * @returns {SolidsContentResult} - Cw (% by mass), Cv (% by volume)
 */
export function calculateSolidsContent({ slurryDensity, solidsDensity, waterDensity = 1.0 }: SolidsContentOpts): SolidsContentResult {
    for (const [n, v] of [
        ['slurryDensity', slurryDensity],
        ['solidsDensity', solidsDensity],
        ['waterDensity', waterDensity],
    ] as [string, number][]) {
        if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
            throw new RangeError(`"${n}" must be a finite positive number, got: ${v}`);
        }
    }
    if (slurryDensity >= solidsDensity) {
        throw new RangeError(`slurryDensity (${slurryDensity}) must be less than solidsDensity (${solidsDensity})`);
    }
    if (slurryDensity <= waterDensity) {
        throw new RangeError(`slurryDensity (${slurryDensity}) must be greater than waterDensity (${waterDensity})`);
    }

    // Cw = [(ρ_sl - ρ_w) / (ρ_s - ρ_w)] * (ρ_s / ρ_sl) (Jewell & Fourie eq. 3.4)
    const cw =
        ((slurryDensity - waterDensity) / (solidsDensity - waterDensity)) * (solidsDensity / slurryDensity) * 100;

    // Cv = (ρ_sl - ρ_w) / (ρ_s - ρ_w) * 100 (Jewell & Fourie eq. 3.6)
    const cv = ((slurryDensity - waterDensity) / (solidsDensity - waterDensity)) * 100;

    return {
        cw: Math.round(cw * 100) / 100,
        cv: Math.round(cv * 100) / 100,
    };
}

/**
 * Classify tailings flow regime from yield stress and solids content.
 * Classifica o regime de fluxo de rejeitos a partir da tensão de escoamento e teor de sólidos.
 *
 * Based on Jewell & Fourie (2006) classification and industry practice.
 *
 * @param {TailingsFlowOpts} opts
 * @returns {TailingsFlowResult}
 */
export function classifyTailingsFlow({ yieldStress, cv }: TailingsFlowOpts): TailingsFlowResult {
    if (typeof yieldStress !== 'number' || !isFinite(yieldStress) || yieldStress < 0) {
        throw new RangeError(`yieldStress must be a finite non-negative number, got: ${yieldStress}`);
    }
    if (typeof cv !== 'number' || !isFinite(cv) || cv < 0 || cv > 100) {
        throw new RangeError(`cv must be in [0, 100], got: ${cv}`);
    }

    // Classificação por τ₀ e Cv (Jewell & Fourie 2006, Fig. 1.1 adaptado)
    if (yieldStress < 2 && cv < 30) {
        return {
            classification: 'fluid',
            description: 'Free-flowing slurry — conventional hydraulic transport',
            transportable: true,
        };
    }
    if (yieldStress < 50 && cv < 55) {
        return {
            classification: 'non_newtonian',
            description: 'Non-Newtonian thickened tailings — requires positive displacement pump',
            transportable: true,
        };
    }
    if (yieldStress < 200 && cv < 70) {
        return {
            classification: 'paste',
            description: 'Paste tailings — self-supporting, gravity or positive displacement',
            transportable: true,
        };
    }
    return {
        classification: 'dry_stack',
        description: 'High-density / dry stack — no free water, filter pressed',
        transportable: false,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const tailingsRheologyModelMeta = {
    name: 'tailingsRheologyModel',
    description: 'tailingsRheologyModel',
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
