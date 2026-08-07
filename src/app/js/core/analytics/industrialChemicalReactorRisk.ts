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
 * Industrial Chemical Reactor Risk Assessment
 *
 * References:
 * - Stoessel, F. (2008). Thermal Safety of Chemical Processes: Risk Assessment and Process Design.
 *   Wiley-VCH. ISBN 978-3527317127
 * - AIChE DIERS (1992). Emergency Relief System Design Using DIERS Technology.
 *   American Institute of Chemical Engineers. ISBN 978-0816904631
 * - IEC 61511-1:2016. Functional safety - Safety instrumented systems for the process
 *   industry sector. IEC, Geneva.
 * - Sempere, J. et al. (2003). Evaluation of chemical reactivity hazards. Org. Process Res. Dev.
 *   7(1):74-83. DOI: 10.1021/op0200413
 *
 * Zero dependências DOM/IDB/Three.js/fetch - avaliação de risco de reatores
 * baseada em parâmetros calorimetricos e termodinâmicos puros.
 *
 * @module industrialChemicalReactorRisk
 */

// Local interface (substitui import('../../../../types/app/analytics-library.js'))
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
        citation?: string;
    };
    inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    library?: { published: boolean; priceECBT?: number; licenseRef?: string };
}

/**
 * Severity classification thresholds for exothermic reactions (Stoessel 2008, Table 2.2).
 * Classificação de severidade para reações exotérmicas.
 */
export const SEVERITY_CLASSES: Array<{ minDeltaTad: number; class: string; label: string; action: string }> = [
    { minDeltaTad: 0, class: 'low', label: 'Low', action: 'Standard operating procedures apply.' },
    { minDeltaTad: 50, class: 'moderate', label: 'Moderate', action: 'Emergency cooling and venting design required.' },
    {
        minDeltaTad: 200,
        class: 'high',
        label: 'High',
        action: 'Full pressure relief system; inherently safer design review.',
    },
    {
        minDeltaTad: 400,
        class: 'very_high',
        label: 'Very High',
        action: 'Explosion-proof design; LOPA/SIL assessment mandatory (IEC 61511).',
    },
];

/**
 * Compute adiabatic temperature rise for an exothermic reaction.
 * Calcula o aumento de temperatura adiabático de uma reação exotérmica.
 *
 * ΔTad = ΔHr × C0 / (ρ × Cp)
 * where ΔHr = heat of reaction (J/mol), C0 = initial concentration (mol/kg),
 * ρ = density (kg/m³), Cp = heat capacity (J/(kg·K))
 *
 * @param params
 * @param params.deltaHr_J_mol - Heat of reaction (J/mol, positive = exothermic)
 * @param params.C0_mol_kg - Initial reactant concentration (mol/kg)
 * @param params.Cp_J_kgK - Heat capacity of reaction mixture (J/(kg·K)); default ~organic solvent
 * @returns Adiabatic temperature rise ΔTad (K)
 */
export function adiabaticTemperatureRise(params: {
    deltaHr_J_mol: number;
    C0_mol_kg: number;
    Cp_J_kgK?: number;
}): number {
    if (!params || typeof params !== 'object') throw new TypeError('params must be an object');
    const { deltaHr_J_mol, C0_mol_kg, Cp_J_kgK = 1800 } = params;
    if (typeof deltaHr_J_mol !== 'number' || deltaHr_J_mol <= 0) {
        throw new RangeError('deltaHr_J_mol must be > 0 (exothermic reaction)');
    }
    if (typeof C0_mol_kg !== 'number' || C0_mol_kg <= 0) throw new RangeError('C0_mol_kg must be > 0');
    if (typeof Cp_J_kgK !== 'number' || Cp_J_kgK <= 0) throw new RangeError('Cp_J_kgK must be > 0');

    return (deltaHr_J_mol * C0_mol_kg) / Cp_J_kgK;
}

/**
 * Compute thermal phi factor (Φ) for calorimetric data correction.
 * Calcula o fator Φ (phi) de correção calorimétrica (Stoessel 2008, eq. 3.3).
 *
 * Φ = 1 + (m_b × Cp_b) / (m_s × Cp_s)
 * where subscripts b = bomb/vessel, s = sample
 *
 * @param params
 * @param params.mass_bomb_g - Bomb (calorimeter vessel) mass (g)
 * @param params.Cp_bomb_J_gK - Heat capacity of bomb material (J/(g·K))
 * @param params.mass_sample_g - Sample mass (g)
 * @param params.Cp_sample_J_gK - Heat capacity of sample (J/(g·K))
 * @returns Phi factor Φ (dimensionless, >= 1)
 */
export function phiFactor(params: {
    mass_bomb_g: number;
    Cp_bomb_J_gK: number;
    mass_sample_g: number;
    Cp_sample_J_gK: number;
}): number {
    if (!params || typeof params !== 'object') throw new TypeError('params must be an object');
    const { mass_bomb_g, Cp_bomb_J_gK, mass_sample_g, Cp_sample_J_gK } = params;
    if ([mass_bomb_g, Cp_bomb_J_gK, mass_sample_g, Cp_sample_J_gK].some((v) => typeof v !== 'number' || v <= 0)) {
        throw new RangeError('All phi factor parameters must be > 0');
    }
    return 1 + (mass_bomb_g * Cp_bomb_J_gK) / (mass_sample_g * Cp_sample_J_gK);
}

/**
 * Compute time to maximum rate (TMR) under adiabatic conditions.
 * Calcula o tempo até a taxa máxima de reação (TMRad) em condições adiabáticas.
 *
 * Based on: Semenov (1928) / Frank-Kamenetskii (1969) approximation:
 * TMRad ≈ Cp × R × T0² / (Ea × dT/dt_0 × Φ)
 *
 * where R = 8.314 J/(mol·K), Ea = activation energy (J/mol), T0 = initial temp (K)
 *
 * @param params
 * @param params.T0_K - Initial temperature (K)
 * @param params.Ea_J_mol - Activation energy (J/mol)
 * @param params.dTdt0_K_s - Self-heating rate at T0 (K/s)
 * @param params.phi - Phi correction factor (dimensionless)
 * @returns { TMR_s, TMR_h }
 */
export function timeToMaxRate(params: {
    T0_K: number;
    Ea_J_mol: number;
    dTdt0_K_s: number;
    phi?: number;
}): { TMR_s: number; TMR_h: number } {
    if (!params || typeof params !== 'object') throw new TypeError('params must be an object');
    const { T0_K, Ea_J_mol, dTdt0_K_s, phi = 1.0 } = params;
    if (typeof T0_K !== 'number' || T0_K <= 0) throw new RangeError('T0_K must be > 0');
    if (typeof Ea_J_mol !== 'number' || Ea_J_mol <= 0) throw new RangeError('Ea_J_mol must be > 0');
    if (typeof dTdt0_K_s !== 'number' || dTdt0_K_s <= 0) throw new RangeError('dTdt0_K_s must be > 0');
    if (typeof phi !== 'number' || phi < 1) throw new RangeError('phi must be >= 1');

    const R = 8.314; // J/(mol·K)
    // TMRad ≈ R·T0² / (Ea·(dT/dt)_0·Φ)
    const TMR_s = (R * T0_K * T0_K) / (Ea_J_mol * dTdt0_K_s * phi);
    const TMR_h = TMR_s / 3600;

    return { TMR_s, TMR_h };
}

/**
 * Classify reactor risk severity based on ΔTad and TMRad (Stoessel 2008, Chapter 4).
 * Classifica o risco do reator com base em ΔTad e TMRad.
 *
 * Severity: based on ΔTad magnitude
 * Probability proxy: TMRad < 8h → imminent; 8–24h → urgent; > 24h → manageable
 *
 * @param deltaTad_K - Adiabatic temperature rise (K)
 * @param TMR_h - Time to maximum rate (hours)
 * @param T_onset_C - Exotherm onset temperature (°C)
 */
export function classifyReactorRisk(
    deltaTad_K: number,
    TMR_h: number,
    T_onset_C: number,
): {
    severity: string;
    severityLabel: string;
    urgency: string;
    action: string;
    description: string;
} {
    if (typeof deltaTad_K !== 'number' || deltaTad_K < 0) throw new RangeError('deltaTad_K must be >= 0');
    if (typeof TMR_h !== 'number' || TMR_h < 0) throw new RangeError('TMR_h must be >= 0');
    if (typeof T_onset_C !== 'number') throw new TypeError('T_onset_C must be a number');

    // Severidade por ΔTad
    const sevClass = [...SEVERITY_CLASSES].reverse().find((c) => deltaTad_K >= c.minDeltaTad) || SEVERITY_CLASSES[0]!;

    // Urgência por TMRad (proxy de probabilidade de incidente)
    const urgency = TMR_h < 8 ? 'imminent' : TMR_h < 24 ? 'urgent' : 'manageable';

    const description = [
        `Onset: ${T_onset_C}°C`,
        `ΔTad: ${deltaTad_K.toFixed(1)} K`,
        `TMRad: ${TMR_h.toFixed(1)} h`,
        `Severity: ${sevClass.label}`,
        `Urgency: ${urgency}`,
    ].join(' | ');

    return {
        severity: sevClass.class,
        severityLabel: sevClass.label,
        urgency,
        action: sevClass.action,
        description,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialChemicalReactorRiskMeta: AnalyticsModuleMeta = {
    name: 'industrialChemicalReactorRisk',
    description: 'industrialChemicalReactorRisk',
    category: 'analytics',
    familyTags: ['industrial', 'chemical', 'risk'],
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
