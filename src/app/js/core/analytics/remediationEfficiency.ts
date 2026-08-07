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
// Application: EHS & Mining - Remediation Efficiency
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

/**
 * Remediation Efficiency - Contaminated Site Cleanup Assessment
 *
 * Módulo puro para avaliação de eficiência de remediação de áreas contaminadas.
 * Modelos: remoção percentual, meta remedial, pump-and-treat, custo-efetividade.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * References:
 *   - USEPA (1999). Pump-and-Treat Technology Summary.
 *     EPA/625/R-99/000. Washington DC.
 *   - ASTM E2137-06 (2011). Standard Guide for Estimating Monetary Costs and
 *     Liabilities for Environmental Matters. ASTM International.
 *   - USEPA RAGS (1989). Risk Assessment Guidance for Superfund Volume I.
 *     EPA/540/1-89/002.
 */

interface RemedialGoalResult {
    remedialGoal: number;
    achievable: boolean;
}

interface CostEffectivenessResult {
    costPerKg: number;
    efficiencyTier: 'excellent' | 'acceptable' | 'poor';
}

/**
 * Compute contaminant removal efficiency.
 * Calcula a eficiência de remoção de contaminante.
 *
 * RE = (C0 - Cf) / C0 × 100  (%)
 *
 * @param {number} initialConc - Initial concentration C0 (mg/kg or µg/L)
 * @param {number} finalConc   - Final concentration Cf (mg/kg or µg/L), must be >= 0
 * @returns {number} Removal efficiency (%)
 * @throws {RangeError} If initialConc <= 0 or finalConc < 0 or finalConc > initialConc
 */
export function computeRemovalEfficiency(initialConc: number, finalConc: number): number {
    if (initialConc <= 0) throw new RangeError('initialConc must be > 0');
    if (finalConc < 0) throw new RangeError('finalConc must be >= 0');
    if (finalConc > initialConc) throw new RangeError('finalConc must be <= initialConc');

    return ((initialConc - finalConc) / initialConc) * 100;
}

/**
 * Compute Remedial Goal (RG) concentration.
 * Calcula a concentração alvo para remediação baseada em nível de risco aceitável.
 *
 * RG = C0 × (1 - attenuation) × riskFactor
 * Onde riskFactor é derivado do nível de risco aceitável (USEPA RAGS).
 *
 * riskFactor mapping:
 *   'acceptable' → 0.01  (risco incremental de câncer 10⁻⁶ a 10⁻⁴, fator conservador)
 *   'concern'    → 0.05  (limiar de preocupação regulatória)
 *   'screening' → 0.10  (valores de triagem - ação mínima necessária)
 *
 * @param {number} initialConc   - Initial concentration C0 (mg/kg)
 * @param {'acceptable'|'concern'|'screening'} targetRiskLevel - Risk level target
 * @param {number} attenuation   - Natural attenuation factor (0–1), fraction of C0 naturally removed
 * @returns {{ remedialGoal: number, achievable: boolean }}
 * @throws {RangeError} If initialConc <= 0 or attenuation out of [0,1)
 * @throws {TypeError} If targetRiskLevel is unknown
 * @see USEPA RAGS (1989) EPA/540/1-89/002
 */
export function computeRemedialGoal(initialConc: number, targetRiskLevel: 'acceptable' | 'concern' | 'screening', attenuation: number): RemedialGoalResult {
    if (initialConc <= 0) throw new RangeError('initialConc must be > 0');
    if (attenuation < 0 || attenuation >= 1) {
        throw new RangeError('attenuation must be in [0, 1)');
    }

    // Fatores de risco por nível de risco alvo (USEPA RAGS 1989)
    const riskFactors: Record<'acceptable' | 'concern' | 'screening', number> = {
        acceptable: 0.01,
        concern: 0.05,
        screening: 0.1,
    };

    if (!Object.prototype.hasOwnProperty.call(riskFactors, targetRiskLevel)) {
        throw new TypeError(`Unknown targetRiskLevel: "${targetRiskLevel}". Valid: acceptable, concern, screening`);
    }

    const riskFactor = riskFactors[targetRiskLevel];

    // Concentração alvo = C0 × (1 - atenuação natural) × fator de risco
    const remedialGoal = initialConc * (1 - attenuation) * riskFactor;

    return {
        remedialGoal,
        achievable: remedialGoal > 0,
    };
}

/**
 * Estimate remediation duration for pump-and-treat (first-order kinetics).
 * Estima a duração da remediação por pump-and-treat (cinética de primeira ordem).
 *
 * Modelo de extração de aquífero confinado (primeira ordem):
 * t = (V × ln(C0/Cf)) / Q
 *
 * @param {number} volume_m3         - Aquifer pore volume to treat V (m³)
 * @param {number} pumpRate_m3_day   - Pump extraction rate Q (m³/day)
 * @param {number} concentrationRatio - Ratio C0/Cf (initial to final concentration, must be > 1)
 * @returns {number} Estimated remediation duration (days)
 * @throws {RangeError} On invalid inputs
 * @see USEPA (1999) Pump-and-Treat Technology Summary EPA/625/R-99/000
 */
export function estimateRemedialDuration(volume_m3: number, pumpRate_m3_day: number, concentrationRatio: number): number {
    if (volume_m3 <= 0) throw new RangeError('volume_m3 must be > 0');
    if (pumpRate_m3_day <= 0) throw new RangeError('pumpRate_m3_day must be > 0');
    if (concentrationRatio <= 1) throw new RangeError('concentrationRatio C0/Cf must be > 1');

    // t = V × ln(C0/Cf) / Q
    return (volume_m3 * Math.log(concentrationRatio)) / pumpRate_m3_day;
}

/**
 * Compute cost-effectiveness of remediation.
 * Calcula a relação custo-efetividade da remediação.
 *
 * @param {number} totalCost      - Total remediation cost (USD or BRL)
 * @param {number} massRemoved_kg - Total contaminant mass removed (kg)
 * @returns {{ costPerKg: number, efficiencyTier: 'excellent'|'acceptable'|'poor' }}
 * @throws {RangeError} If totalCost < 0 or massRemoved_kg <= 0
 * @see ASTM E2137-06 (2011) Standard Guide for Estimating Environmental Costs
 */
export function computeCostEffectiveness(totalCost: number, massRemoved_kg: number): CostEffectivenessResult {
    if (totalCost < 0) throw new RangeError('totalCost must be >= 0');
    if (massRemoved_kg <= 0) throw new RangeError('massRemoved_kg must be > 0');

    const costPerKg = totalCost / massRemoved_kg;

    // Classificação de eficiência por custo unitário
    // <100 $/kg → excelente; <1000 $/kg → aceitável; ≥1000 $/kg → ineficiente
    let efficiencyTier: 'excellent' | 'acceptable' | 'poor';
    if (costPerKg < 100) efficiencyTier = 'excellent';
    else if (costPerKg < 1000) efficiencyTier = 'acceptable';
    else efficiencyTier = 'poor';

    return { costPerKg, efficiencyTier };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const remediationEfficiencyMeta = {
    name: 'remediationEfficiency',
    description: 'Remediation Efficiency',
    category: 'analytics',
    familyTags: ['remediation'],
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
