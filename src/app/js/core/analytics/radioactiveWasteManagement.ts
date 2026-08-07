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
// Application: EHS & Mining - Radioactive Waste Management
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

/**
 * Radioactive Waste Management - Decay, Classification & Shielding
 *
 * Módulo puro implementando cálculos de gestão de resíduos radioativos:
 * decaimento radioativo, estimativa de volume, classificação IAEA (2009)
 * e cálculo de espessura de blindagem por Beer-Lambert.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * @module radioactiveWasteManagement
 * @references
 *   IAEA Safety Standards GSG-1 (2009) - Classification of Radioactive Waste.
 *     IAEA, Vienna. ISBN 978-92-0-110509-8.
 *   ICRP Publication 107 (2008) - Nuclear Decay Data for Dosimetric Calculations.
 *     Ann. ICRP 38(3). DOI: 10.1016/j.icrp.2008.05.001
 *   NRC Regulations 10 CFR Part 61 - Licensing Requirements for Land Disposal of Radioactive Waste.
 *   Shultis, J.K. & Faw, R.E. (2000) Radiation Shielding. American Nuclear Society.
 */

const LN2 = Math.LN2; // ln(2) ≈ 0.6931

interface RadioactiveDecayResult { activity_Bq: number; decayedFraction: number; }
interface WasteVolumeResult { volume_m3: number; mass_kg: number; }
interface WasteClassificationResult { category: 'VLLW' | 'LLW' | 'ILW' | 'HLW'; disposal: string; }
interface ShieldingThicknessResult { thickness_cm: number; unshieldedDose_mSv_h: number; }

/**
 * Compute remaining radioactive activity after elapsed time.
 * Calcula a atividade radioativa remanescente após tempo decorrido.
 *
 * A(t) = A₀ × exp(-λ × t)  onde  λ = ln(2) / t½
 *
 * @param {number} activity_Bq - Initial activity (Bq), > 0
 * @param {number} halfLife_years - Radionuclide half-life (years), > 0
 * @param {number} time_years - Elapsed time (years), ≥ 0
 * @returns {{ activity_Bq: number, decayedFraction: number }}
 * @throws {RangeError} se inputs inválidos
 * @references Bateman (1910) Proc. Cambridge Phil. Soc. 15:423-427; ICRP 107 (2008).
 */
export function computeRadioactiveDecay(activity_Bq: number, halfLife_years: number, time_years: number): RadioactiveDecayResult {
    if (activity_Bq <= 0) throw new RangeError('activity_Bq must be > 0');
    if (halfLife_years <= 0) throw new RangeError('halfLife_years must be > 0');
    if (time_years < 0) throw new RangeError('time_years must be >= 0');

    // Constante de decaimento λ = ln(2) / t½
    const decayConstant = LN2 / halfLife_years;

    // Lei de decaimento exponencial
    const remainingFraction = Math.exp(-decayConstant * time_years);
    const remainingActivity_Bq = activity_Bq * remainingFraction;
    const decayedFraction = 1 - remainingFraction;

    return { activity_Bq: remainingActivity_Bq, decayedFraction };
}

/**
 * Compute radioactive waste volume and mass from activity and specific activity.
 * Calcula o volume e a massa do resíduo radioativo a partir da atividade e atividade específica.
 *
 * V = A / (A_sp × ρ)
 * m = A / A_sp
 *
 * @param {number} activity_Bq - Total activity of waste (Bq), > 0
 * @param {number} specificActivity_Bq_kg - Specific activity of material (Bq/kg), > 0
 * @param {number} density_kg_m3 - Material bulk density (kg/m³), > 0
 * @returns {{ volume_m3: number, mass_kg: number }}
 * @throws {RangeError} se inputs não positivos
 * @references IAEA GSG-1 (2009) §3.2; 10 CFR Part 61.55.
 */
export function computeWasteVolume(activity_Bq: number, specificActivity_Bq_kg: number, density_kg_m3: number): WasteVolumeResult {
    if (activity_Bq <= 0) throw new RangeError('activity_Bq must be > 0');
    if (specificActivity_Bq_kg <= 0) throw new RangeError('specificActivity_Bq_kg must be > 0');
    if (density_kg_m3 <= 0) throw new RangeError('density_kg_m3 must be > 0');

    // Massa total de material radioativo necessária para conter a atividade total
    const mass_kg = activity_Bq / specificActivity_Bq_kg;

    // Volume resultante a partir da densidade a granel
    const volume_m3 = mass_kg / density_kg_m3;

    return { volume_m3, mass_kg };
}

/**
 * Classify radioactive waste according to IAEA Safety Standards GSG-1 (2009).
 * Classifica o resíduo radioativo conforme IAEA GSG-1 (2009).
 *
 * Categories:
 *   HLW  (High Level Waste):   heat output > 2 kW/m³
 *   ILW  (Intermediate Level): activity > 1e12 Bq/m³ AND half-life > 30 yr
 *   LLW  (Low Level Waste):    activity ≤ 1e12 Bq/m³ (short or long-lived)
 *   VLLW (Very Low Level):     activity < 1e6 Bq/m³ (near-surface disposal)
 *
 * @param {number} activity_Bq_m3 - Activity concentration (Bq/m³), > 0
 * @param {number} halfLife_years - Dominant radionuclide half-life (years), > 0
 * @param {number} heatOutput_W_m3 - Decay heat output (W/m³), ≥ 0
 * @returns {{ category: 'VLLW'|'LLW'|'ILW'|'HLW', disposal: string }}
 * @throws {RangeError} se inputs inválidos
 * @references IAEA GSG-1 (2009) Table 1; 10 CFR Part 61.55 Class A/B/C.
 */
export function classifyRadioactiveWaste(activity_Bq_m3: number, halfLife_years: number, heatOutput_W_m3: number): WasteClassificationResult {
    if (activity_Bq_m3 <= 0) throw new RangeError('activity_Bq_m3 must be > 0');
    if (halfLife_years <= 0) throw new RangeError('halfLife_years must be > 0');
    if (heatOutput_W_m3 < 0) throw new RangeError('heatOutput_W_m3 must be >= 0');

    let category: 'VLLW' | 'LLW' | 'ILW' | 'HLW';
    let disposal: string;

    if (heatOutput_W_m3 > 2000) {
        // Rejeito de alta atividade: gerador de calor (combustível irradiado, subprodutos de reprocessamento)
        // High-level waste: heat-generating (spent nuclear fuel, reprocessing streams)
        category = 'HLW';
        disposal = 'Deep geological repository (>300m depth), engineered barriers, retrievability';
    } else if (activity_Bq_m3 > 1e12 && halfLife_years > 30) {
        // Rejeito de média atividade de longa meia-vida: blindagem requerida
        // Intermediate-level long-lived: shielding required, geological disposal
        category = 'ILW';
        disposal = 'Intermediate depth disposal (tens of meters), concrete or engineered vaults';
    } else if (activity_Bq_m3 > 1e6) {
        // Rejeito de baixa atividade: disposição superficial engenheirada
        // Low-level waste: engineered near-surface disposal facility
        category = 'LLW';
        disposal = 'Near-surface engineered disposal facility, institutional control ≥100 yr';
    } else {
        // Rejeito de muito baixa atividade: descarte convencional monitorado
        // Very low-level waste: conventional landfill with monitoring
        category = 'VLLW';
        disposal = 'Conventional landfill with monitoring, dilute-and-disperse or clearance';
    }

    return { category, disposal };
}

/**
 * Compute radiation shielding thickness using Beer-Lambert attenuation law.
 * Calcula a espessura de blindagem por atenuação de Beer-Lambert.
 *
 * Dose não blindada (μSv/h): H₀ = A × E × 1.6e-13 × 0.877 × 1e6 / (4π × r² × ρ_tissue)
 * Aproximação prática: H₀ = A [Bq] × E [MeV] × 1.274e-10  [μSv/h a 1m, geometria esférica]
 * Espessura: x = ln(H₀ / H_target) / μ  [cm]
 *
 * @param {number} activity_Bq - Source activity (Bq), > 0
 * @param {number} energyMeV - Dominant gamma energy (MeV), > 0
 * @param {number} attenuationCoeff_per_cm - Linear attenuation coefficient μ (cm⁻¹), > 0
 * @param {number} targetDose_mSv_h - Target dose rate limit (mSv/h), > 0
 * @returns {{ thickness_cm: number, unshieldedDose_mSv_h: number }}
 * @throws {RangeError} se inputs não positivos
 * @references Shultis & Faw (2000) ch. 10; IAEA Safety Reports Series 47 (2006).
 *   Conversion factor: 1 MeV photon → dose in tissue ≈ 1.6e-13 J × 0.877 Gy/J per kg.
 */
export function computeShieldingThickness(activity_Bq: number, energyMeV: number, attenuationCoeff_per_cm: number, targetDose_mSv_h: number): ShieldingThicknessResult {
    if (activity_Bq <= 0) throw new RangeError('activity_Bq must be > 0');
    if (energyMeV <= 0) throw new RangeError('energyMeV must be > 0');
    if (attenuationCoeff_per_cm <= 0) throw new RangeError('attenuationCoeff_per_cm must be > 0');
    if (targetDose_mSv_h <= 0) throw new RangeError('targetDose_mSv_h must be > 0');

    // Fator de conversão: atividade × energia → taxa de dose não blindada a 1 m (ponto)
    // Conversion factor: activity × energy → unshielded dose rate at 1 m (point source, sphere)
    // H₀ [mSv/h] ≈ A [Bq] × E [MeV] × 1.274e-13  (derivado de fluência → kerma → dose efetiva)
    const CONVERSION_FACTOR = 1.274e-13; // mSv/h per (Bq × MeV) at 1 m
    const unshieldedDose_mSv_h = activity_Bq * energyMeV * CONVERSION_FACTOR;

    // Espessura de blindagem pela lei de Beer-Lambert
    // Shielding thickness from Beer-Lambert: I = I₀ × exp(-μ × x) → x = ln(I₀/I) / μ
    let thickness_cm: number;
    if (unshieldedDose_mSv_h <= targetDose_mSv_h) {
        // Sem necessidade de blindagem - dose já está abaixo do limite
        thickness_cm = 0;
    } else {
        thickness_cm = Math.log(unshieldedDose_mSv_h / targetDose_mSv_h) / attenuationCoeff_per_cm;
    }

    return { thickness_cm, unshieldedDose_mSv_h };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const radioactiveWasteManagementMeta = {
    name: 'radioactiveWasteManagement',
    description: 'Radioactive Waste Management',
    category: 'analytics',
    familyTags: ['waste'],
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
