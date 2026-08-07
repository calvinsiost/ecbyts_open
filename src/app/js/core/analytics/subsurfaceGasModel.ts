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
 * Subsurface Gas Model - Modelo de gas subsuperficial em locais contaminados
 *
 * Models methane and CO2 generation, diffusion, and explosive risk at
 * contaminated subsurface sites (landfills, petroleum plumes, anaerobic zones).
 *
 * Academic references:
 * - US EPA (2004). User's Guide for Evaluating Subsurface Vapor Intrusion into
 *   Buildings. EPA/540/R-02/003. Office of Solid Waste and Emergency Response.
 *   https://www.epa.gov/sites/default/files/2015-09/documents/2003_user_guide.pdf
 * - Johnson, P.C. & Ettinger, R.A. (1991). Heuristic model for predicting the
 *   intrusion rate of contaminant vapors into buildings. Environmental Science
 *   & Technology, 25(8), 1445–1452. DOI: 10.1021/es00020a013
 * - Metcalfe, D.E. & Farquhar, G.J. (1987). Modeling gas migration through
 *   unsaturated soils from waste disposal sites. Water, Air, and Soil Pollution,
 *   32(1–2), 247–259. DOI: 10.1007/BF00227541
 *
 * @module core/analytics/subsurfaceGasModel
 */

/** CH4 explosive limits in air (volume fraction) / Limites de explosividade do CH4 no ar */
export const CH4_LEL = 0.05; // Lower Explosive Limit — 5% vol
export const CH4_UEL = 0.15; // Upper Explosive Limit — 15% vol

/**
 * Calculate first-order gas generation rate for anaerobic degradation.
 * Calcula a taxa de geracao de gas por degradacao anaerobia de primeira ordem.
 *
 * C(t) = C0 * exp(-k * t)
 * Generation rate G(t) = k * C0 * exp(-k * t)
 *
 * @param {object} params - Parameters / Parametros
 * @param {number} params.initialCarbonkg - Initial degradable carbon mass (kg) / Carbono degradavel inicial
 * @param {number} params.decayRatePerYear - First-order decay rate k (yr⁻¹) / Taxa de decaimento
 * @param {number} params.timeyear - Time elapsed (years) / Tempo decorrido (anos)
 * @param {number} [params.methaneYield=0.27] - CH4 yield (m³ CH4/kg C, default LandGEM value) / Rendimento de CH4
 * @returns {{ generationRateMm3yr: number, remainingCarbonkg: number }}
 *   Gas generation rate (m³/yr) and remaining carbon (kg)
 */
export function calculateGasGenerationRate({
    initialCarbonkg,
    decayRatePerYear,
    timeyear,
    methaneYield = 0.27
}: any) {
    if (typeof initialCarbonkg !== 'number' || initialCarbonkg <= 0) {
        throw new RangeError('initialCarbonkg must be positive');
    }
    if (typeof decayRatePerYear !== 'number' || decayRatePerYear <= 0) {
        throw new RangeError('decayRatePerYear must be positive');
    }
    if (typeof timeyear !== 'number' || timeyear < 0) {
        throw new RangeError('timeyear must be non-negative');
    }
    if (typeof methaneYield !== 'number' || methaneYield <= 0) {
        throw new RangeError('methaneYield must be positive');
    }

    const remainingCarbonkg = initialCarbonkg * Math.exp(-decayRatePerYear * timeyear);
    // Taxa de geracao instantanea de CH4
    const generationRateMm3yr = decayRatePerYear * remainingCarbonkg * methaneYield;

    return { generationRateMm3yr, remainingCarbonkg };
}

/**
 * Calculate steady-state gas concentration via Fickian diffusion (1D).
 * Calcula concentracao estacionaria de gas por difusao Fickiana (1D).
 *
 * Fick's 1st law: J = -Deff * dC/dz
 * Steady-state 1D: C(z) = C_source * (1 - z / L)  [source at z=0, C=0 at z=L]
 *
 * @param {object} params - Parameters / Parametros
 * @param {number} params.sourceConcentrationVolfrac - Source gas concentration (volume fraction, 0–1) / Concentracao na fonte
 * @param {number} params.distanceFromSourcem - Distance from source to point of interest (m) / Distancia da fonte
 * @param {number} params.totalPathLengthm - Total path length from source to surface (m) / Comprimento total do percurso
 * @returns {number} Gas concentration at distance z (volume fraction) / Concentracao no ponto
 */
export function calculateDiffusionConcentration({
    sourceConcentrationVolfrac,
    distanceFromSourcem,
    totalPathLengthm
}: any) {
    if (
        typeof sourceConcentrationVolfrac !== 'number' ||
        sourceConcentrationVolfrac < 0 ||
        sourceConcentrationVolfrac > 1
    ) {
        throw new RangeError('sourceConcentrationVolfrac must be between 0 and 1');
    }
    if (typeof distanceFromSourcem !== 'number' || distanceFromSourcem < 0) {
        throw new RangeError('distanceFromSourcem must be non-negative');
    }
    if (typeof totalPathLengthm !== 'number' || totalPathLengthm <= 0) {
        throw new RangeError('totalPathLengthm must be positive');
    }
    if (distanceFromSourcem > totalPathLengthm) {
        throw new RangeError('distanceFromSourcem cannot exceed totalPathLengthm');
    }

    // Perfil linear em regime estacionario para difusao 1D pura
    return sourceConcentrationVolfrac * (1 - distanceFromSourcem / totalPathLengthm);
}

/**
 * Assess explosive risk for a given CH4 concentration in air.
 * Avalia o risco de explosividade para uma dada concentracao de CH4 no ar.
 *
 * Based on LEL/UEL thresholds for methane (US EPA 2004; OSHA 29 CFR 1910.94).
 * CH4: LEL = 5% vol, UEL = 15% vol
 *
 * @param {number} ch4Volfrac - CH4 concentration in air (volume fraction, 0–1) / Concentracao de CH4 no ar
 * @returns {{ riskLevel: string, pctLEL: number, explosive: boolean, description: string }}
 */
export function assessExplosiveRisk(ch4Volfrac: any) {
    if (typeof ch4Volfrac !== 'number' || ch4Volfrac < 0 || ch4Volfrac > 1) {
        throw new RangeError('ch4Volfrac must be between 0 and 1');
    }

    const pctLEL = (ch4Volfrac / CH4_LEL) * 100;
    const explosive = ch4Volfrac >= CH4_LEL && ch4Volfrac <= CH4_UEL;

    let riskLevel, description;
    if (ch4Volfrac < 0.01 * CH4_LEL) {
        // Abaixo de 1% do LEL - risco negligivel
        riskLevel = 'negligible';
        description = 'Below 1% LEL — no action required';
    } else if (ch4Volfrac < 0.1 * CH4_LEL) {
        // Entre 1% e 10% do LEL
        riskLevel = 'low';
        description = 'Below 10% LEL — routine monitoring';
    } else if (ch4Volfrac < CH4_LEL) {
        // Entre 10% e 100% do LEL - zona de alarme
        riskLevel = 'alarm';
        description = 'Approaching LEL — increased monitoring and ventilation required';
    } else if (ch4Volfrac <= CH4_UEL) {
        // Dentro da faixa explosiva
        riskLevel = 'explosive';
        description = 'Within explosive range (LEL–UEL) — evacuate and ventilate immediately';
    } else {
        // Acima do UEL - rico demais para ignitar, mas toxico
        riskLevel = 'above_uel';
        description = 'Above UEL — too rich to ignite but toxic; dilution hazard';
    }

    return { riskLevel, pctLEL, explosive, description };
}

/**
 * Calculate effective diffusion coefficient in unsaturated soil (Millington-Quirk model).
 * Calcula o coeficiente de difusao efetivo no solo nao saturado (modelo Millington-Quirk).
 *
 * Deff = D0 * (theta_a^(10/3) / n^2)
 * where theta_a = air-filled porosity, n = total porosity
 *
 * Reference: Millington, R.J. & Quirk, J.M. (1961). Permeability of porous solids.
 * Trans. Faraday Soc., 57, 1200–1207. DOI: 10.1039/tf9615701200
 *
 * @param {number} D0m2s - Free-air diffusion coefficient (m²/s) / Coeficiente de difusao livre no ar
 * @param {number} thetaA - Air-filled porosity (m³/m³) / Porosidade preenchida com ar
 * @param {number} totalPorosityN - Total porosity (m³/m³) / Porosidade total
 * @returns {number} Effective diffusion coefficient (m²/s) / Coeficiente de difusao efetivo
 */
export function calculateEffectiveDiffusivity(D0m2s: any, thetaA: any, totalPorosityN: any) {
    if (typeof D0m2s !== 'number' || D0m2s <= 0) {
        throw new RangeError('D0m2s must be positive');
    }
    if (typeof thetaA !== 'number' || thetaA < 0 || thetaA > 1) {
        throw new RangeError('thetaA must be between 0 and 1');
    }
    if (typeof totalPorosityN !== 'number' || totalPorosityN <= 0 || totalPorosityN > 1) {
        throw new RangeError('totalPorosityN must be between 0 (exclusive) and 1');
    }
    if (thetaA > totalPorosityN) {
        throw new RangeError('thetaA cannot exceed totalPorosityN');
    }

    // Modelo Millington-Quirk (1961): Deff = D0 * (theta_a^(10/3) / n^2)
    return D0m2s * (Math.pow(thetaA, 10 / 3) / Math.pow(totalPorosityN, 2));
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const subsurfaceGasModelMeta = {
    name: 'subsurfaceGasModel',
    description: 'subsurfaceGasModel',
    category: 'analytics',
    familyTags: ['surface'],
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
