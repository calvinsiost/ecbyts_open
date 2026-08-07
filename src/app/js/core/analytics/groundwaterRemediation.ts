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
// Application: EHS & Mining - Groundwater Remediation Engineering
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Groundwater Remediation Engineering
 *
 * Módulo puro implementando cálculos de remediação de águas subterrâneas:
 * taxa de bombeamento Cooper-Jacob (1946), zona de captura de pluma,
 * concentração residual após N volumes de poros lavados e seleção de
 * tecnologia de remediação por tipo de contaminante.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * References:
 *   Theis, C.V. (1935) The relation between the lowering of the piezometric surface and the
 *     rate and duration of discharge of a well using ground-water storage.
 *     Eos, Transactions AGU 16(2): 519–524.
 *   Cooper, H.H. & Jacob, C.E. (1946) A generalized graphical method for evaluating formation
 *     constants and summarizing well-field history. Eos, Transactions AGU 27(4): 526–534.
 *   USEPA (1999) Pump-and-Treat Technology. EPA/542/N-99/001, Office of Solid Waste.
 *
 * @module groundwaterRemediation
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

/** Storativity for confined aquifer (dimensionless, typical value) */
const S_CONFINED = 0.0002;
/** Reference pumping time (s) for Cooper-Jacob approximation: 1 day */
const T_PUMPING_S = 86400;
/** Seconds per day */
const SEC_PER_DAY = 86400;

/**
 * Compute pumping rate using the Cooper-Jacob straight-line approximation.
 * Q = 4π × T × s / (2.303 × log10(2.25 × T × t / (r² × S)))
 * onde T = K × b (transmissividade), S = 0.0002 (aquífero confinado), t = 86400 s (1 dia).
 *
 * @param hydraulicConductivity_m_s - K (m/s)
 * @param drawdown_m - drawdown s (m)
 * @param aquiferThickness_m - saturated thickness b (m)
 * @param radius_m - radial distance to observation point r (m)
 * @returns pumpingRate_m3_day and transmissivity_m2_s
 *
 * @throws {RangeError} if any input is non-positive
 */
export function computePumpingRate(
    hydraulicConductivity_m_s: number,
    drawdown_m: number,
    aquiferThickness_m: number,
    radius_m: number,
): { pumpingRate_m3_day: number; transmissivity_m2_s: number } {
    for (const [name, val] of [
        ['hydraulicConductivity_m_s', hydraulicConductivity_m_s],
        ['drawdown_m', drawdown_m],
        ['aquiferThickness_m', aquiferThickness_m],
        ['radius_m', radius_m],
    ] as Array<[string, unknown]>) {
        if (typeof val !== 'number' || val <= 0) {
            throw new RangeError(`${name} must be a positive number`);
        }
    }

    const T = hydraulicConductivity_m_s * aquiferThickness_m; // transmissividade (m²/s)
    const s = drawdown_m;
    const t = T_PUMPING_S;
    const r = radius_m;

    // Argumento do log: 2.25 × T × t / (r² × S)
    const logArg = (2.25 * T * t) / (r * r * S_CONFINED);
    if (logArg <= 0) throw new RangeError('Cooper-Jacob log argument must be positive');

    // Q em m³/s; Cooper-Jacob válido quando u = r²S/(4Tt) < 0.05
    const Q_m3_s = (4 * Math.PI * T * s) / (2.303 * Math.log10(logArg));
    const pumpingRate_m3_day = Math.abs(Q_m3_s) * SEC_PER_DAY;

    return { pumpingRate_m3_day, transmissivity_m2_s: T };
}

/**
 * Compute plume capture zone maximum width and stagnation point distance.
 * Largura máxima: ymax = Q / (2π × U × b)
 * Ponto de estagnação: xs = −Q / (2π × U × b × i)  (distância a montante do poço)
 *
 * U = K × i (velocidade de Darcy do fluxo regional)
 *
 * @param pumpingRate_m3_day - pumping rate Q (m³/day)
 * @param hydraulicGradient - regional hydraulic gradient i (dimensionless)
 * @param conductivity_m_s - hydraulic conductivity K (m/s)
 * @param aquiferThickness_m - saturated thickness b (m)
 * @returns captureWidth_m and stagnationPoint_m
 *
 * @throws {RangeError} if any input is non-positive
 */
export function computePlumeCaptureZone(
    pumpingRate_m3_day: number,
    hydraulicGradient: number,
    conductivity_m_s: number,
    aquiferThickness_m: number,
): { captureWidth_m: number; stagnationPoint_m: number } {
    for (const [name, val] of [
        ['pumpingRate_m3_day', pumpingRate_m3_day],
        ['hydraulicGradient', hydraulicGradient],
        ['conductivity_m_s', conductivity_m_s],
        ['aquiferThickness_m', aquiferThickness_m],
    ] as Array<[string, unknown]>) {
        if (typeof val !== 'number' || val <= 0) {
            throw new RangeError(`${name} must be a positive number`);
        }
    }

    // Converter Q para m³/s
    const Q_m3_s = pumpingRate_m3_day / SEC_PER_DAY;
    // Velocidade de Darcy (m/s)
    const U = conductivity_m_s * hydraulicGradient;
    const b = aquiferThickness_m;

    // Largura máxima da zona de captura (m)
    const captureWidth_m = Q_m3_s / (Math.PI * U * b);
    // Ponto de estagnação a montante (m) - distância positiva do poço
    const stagnationPoint_m = Q_m3_s / (2 * Math.PI * U * b);

    return { captureWidth_m, stagnationPoint_m };
}

/**
 * Compute residual contaminant concentration after N pore volumes flushed.
 * C = C0 × (1 − η)^N
 * Modelo de eficiência constante por lavagem de poros (pump-and-treat).
 *
 * @param initialConc - initial concentration C0 (any consistent units)
 * @param poreVolumes - number of pore volumes flushed N
 * @param removalEfficiency - fraction removed per pore volume η (0–1)
 * @returns residualConc and achievesTarget predicate
 *
 * @throws {RangeError} if inputs are out of valid range
 */
export function computeResidualConcentration(
    initialConc: number,
    poreVolumes: number,
    removalEfficiency: number,
): { residualConc: number; achievesTarget: (target: number) => boolean } {
    if (typeof initialConc !== 'number' || initialConc < 0) {
        throw new RangeError('initialConc must be a non-negative number');
    }
    if (typeof poreVolumes !== 'number' || poreVolumes < 0) {
        throw new RangeError('poreVolumes must be a non-negative number');
    }
    if (typeof removalEfficiency !== 'number' || removalEfficiency < 0 || removalEfficiency > 1) {
        throw new RangeError('removalEfficiency must be between 0 and 1');
    }

    // Concentração residual após N volumes de poros: C = C0 × (1 − η)^N
    const residualConc = initialConc * Math.pow(1 - removalEfficiency, poreVolumes);

    return {
        residualConc,
        achievesTarget: (target: number) => residualConc <= target,
    };
}

/**
 * Classify recommended remediation technologies by contaminant type, depth and concentration.
 * Baseado em critérios de seleção USEPA (1999):
 * - pump_and_treat: sempre recomendado (controle hidráulico)
 * - in_situ_chemical_oxidation (ISCO): solventes clorados com concentração > 1 mg/L
 * - permeable_reactive_barrier (PRB): metais (sorção, precipitação)
 * - monitored_natural_attenuation (MNA): petróleo em aqüífero profundo (> 10 m)
 *
 * @param contaminantType - contaminant type
 * @param aquiferDepth_m - depth to water table (m)
 * @param concentration_mg_L - peak concentration (mg/L)
 * @returns recommended and rationale
 *
 * @throws {TypeError} if contaminantType is invalid
 * @throws {RangeError} if depth or concentration are non-positive
 */
export function classifyRemediationTechnology(
    contaminantType: 'chlorinated_solvents' | 'petroleum' | 'metals' | 'nitrate',
    aquiferDepth_m: number,
    concentration_mg_L: number,
): { recommended: string[]; rationale: string[] } {
    const VALID_TYPES = ['chlorinated_solvents', 'petroleum', 'metals', 'nitrate'];
    if (!VALID_TYPES.includes(contaminantType)) {
        throw new TypeError(`contaminantType must be one of: ${VALID_TYPES.join(', ')}`);
    }
    if (typeof aquiferDepth_m !== 'number' || aquiferDepth_m <= 0) {
        throw new RangeError('aquiferDepth_m must be a positive number');
    }
    if (typeof concentration_mg_L !== 'number' || concentration_mg_L <= 0) {
        throw new RangeError('concentration_mg_L must be a positive number');
    }

    const recommended = ['pump_and_treat'];
    const rationale = ['Hydraulic containment — always applicable for plume control'];

    if (contaminantType === 'chlorinated_solvents' && concentration_mg_L > 1) {
        recommended.push('in_situ_chemical_oxidation');
        rationale.push('ISCO effective for high-concentration chlorinated solvents (>1 mg/L) source zones');
    }
    if (contaminantType === 'metals') {
        recommended.push('permeable_reactive_barrier');
        rationale.push('PRB with zero-valent iron or sorption media effective for metals immobilization');
    }
    if (contaminantType === 'petroleum' && aquiferDepth_m > 10) {
        recommended.push('monitored_natural_attenuation');
        rationale.push('MNA viable for petroleum hydrocarbons at depth >10 m with documented biodegradation');
    }
    if (contaminantType === 'nitrate') {
        recommended.push('in_situ_bioremediation');
        rationale.push('Denitrification via carbon injection effective for nitrate-contaminated aquifers');
    }

    return { recommended, rationale };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const groundwaterRemediationMeta: AnalyticsModuleMeta = {
    name: 'groundwaterRemediation',
    description: 'Groundwater Remediation Engineering',
    category: 'analytics',
    familyTags: ['groundwater', 'water', 'remediation'],
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
