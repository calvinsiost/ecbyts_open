// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Subsidence Risk - surface subsidence from underground mining and fluid extraction
// Risco de subsidência - recalques em mineração subterrânea e extração de fluidos
'use strict';

interface MaxSubsidenceResult { max_subsidence_m: number; surface_strain_mm_m: number; }
interface TroughResult { subsidence_m: number; tilt_mm_m: number; }
interface SettlementResult { settlement_m: number; settlement_pct: number; }
interface RiskResult { risk: 'very_low' | 'low' | 'moderate' | 'high' | 'critical'; action: string; }

type NumericTuple3 = readonly [number, number, number];
type NumericTuple4 = readonly [number, number, number, number];

function assertAllNumbers(args: NumericTuple3 | NumericTuple4, label = 'All arguments'): void {
    for (const value of args) {
        if (typeof value !== 'number') {
            throw new TypeError(`${label} must be numbers`);
        }
    }
}

function assertPositive(value: number, name: string): void {
    if (value <= 0) throw new RangeError(`${name} must be > 0`);
}

function assertNonNegative(value: number, name: string): void {
    if (value < 0) throw new RangeError(`${name} must be >= 0`);
}

function assertRangeInclusive(value: number, name: string, min: number, max: number): void {
    if (value < min || value > max) {
        throw new RangeError(`${name} must be in [${min}, ${max}]`);
    }
}

/**
 * Computes maximum surface subsidence from underground mining.
 * Calcula a subsidência máxima superficial em mineração subterrânea.
 *
 * Smax = a × m × e
 * surface_strain = Smax / depth × 1000 (mm/m)
 *
 * @param {number} seam_thickness_m - Thickness of mined seam in meters
 * @param {number} extraction_ratio - Fraction of material extracted [0, 1]
 * @param {number} subsidence_factor - Lithology-dependent factor (0.45–0.90)
 * @param {number} [depth_m=100] - Depth of mining in meters (used for strain calc)
 * @returns {{ max_subsidence_m: number, surface_strain_mm_m: number }}
 *
 * @references
 *   NCB (1975). Subsidence Engineers' Handbook. National Coal Board, UK.
 *   Peng, S.S. (1992). Surface Subsidence Engineering. SME, Littleton, CO.
 *   DNPM Portaria 237/2001 - Normas reguladoras de mineração (BR).
 */
export function computeMaxSubsidence(seam_thickness_m: number, extraction_ratio: number, subsidence_factor: number, depth_m: number = 100): MaxSubsidenceResult {
    assertAllNumbers([seam_thickness_m, extraction_ratio, subsidence_factor, depth_m]);
    assertPositive(seam_thickness_m, 'seam_thickness_m');
    assertRangeInclusive(extraction_ratio, 'extraction_ratio', 0, 1);
    assertRangeInclusive(subsidence_factor, 'subsidence_factor', 0, 1);
    assertPositive(depth_m, 'depth_m');

    // Subsidência máxima: Smax = a × m × e
    const max_subsidence_m = subsidence_factor * seam_thickness_m * extraction_ratio;

    // Deformação superficial em mm/m (aproximação linear NCB 1975)
    const surface_strain_mm_m = (max_subsidence_m / depth_m) * 1000;

    return { max_subsidence_m, surface_strain_mm_m };
}

/**
 * Computes subsidence trough profile using Gaussian model (NCB 1975).
 * Calcula o perfil da bacia de subsidência pelo modelo Gaussiano (NCB 1975).
 *
 * S(x) = Smax × exp(−π × x² / W²)
 * tilt = |dS/dx| × 1000 (mm/m)
 *
 * @param {number} distance_from_edge_m - Horizontal distance from panel edge (m)
 * @param {number} half_width_m - Half-width of influence zone W (m)
 * @param {number} max_subsidence_m - Maximum subsidence at centre (m)
 * @returns {{ subsidence_m: number, tilt_mm_m: number }}
 *
 * @references
 *   NCB (1975). Subsidence Engineers' Handbook. National Coal Board, UK.
 */
export function computeSubsidenceTrough(distance_from_edge_m: number, half_width_m: number, max_subsidence_m: number): TroughResult {
    assertAllNumbers([distance_from_edge_m, half_width_m, max_subsidence_m]);
    assertPositive(half_width_m, 'half_width_m');
    assertNonNegative(max_subsidence_m, 'max_subsidence_m');

    const x = distance_from_edge_m;
    const W = half_width_m;

    // Perfil Gaussiano: S(x) = Smax × exp(−π × x² / W²)
    const exponent = -(Math.PI * x * x) / (W * W);
    const subsidence_m = max_subsidence_m * Math.exp(exponent);

    // Inclinação: dS/dx = Smax × (−2πx/W²) × exp(−πx²/W²)
    const tilt_m_per_m = max_subsidence_m * ((-2 * Math.PI * x) / (W * W)) * Math.exp(exponent);
    const tilt_mm_m = Math.abs(tilt_m_per_m) * 1000;

    return { subsidence_m, tilt_mm_m };
}

/**
 * Computes consolidation settlement using Terzaghi's 1D consolidation theory.
 * Calcula o recalque de adensamento pela teoria de consolidação de Terzaghi.
 *
 * δ = (Cc / (1 + e0)) × H × log10(σ'f / σ'0)
 *
 * @param {number} void_ratio_initial - Initial void ratio e0 (dimensionless, > 0)
 * @param {number} void_ratio_final - Final void ratio ef (dimensionless, > 0)
 * @param {number} layer_thickness_m - Soil layer thickness H (m)
 * @param {number} compression_index - Compression index Cc (dimensionless, > 0)
 * @returns {{ settlement_m: number, settlement_pct: number }}
 *
 * @references
 *   Terzaghi, K. (1943). Theoretical Soil Mechanics. Wiley, New York.
 */
export function computeConsolidationSettlement(
    void_ratio_initial: number,
    void_ratio_final: number,
    layer_thickness_m: number,
    compression_index: number,
): SettlementResult {
    assertAllNumbers([void_ratio_initial, void_ratio_final, layer_thickness_m, compression_index]);
    assertPositive(void_ratio_initial, 'void_ratio_initial');
    assertPositive(void_ratio_final, 'void_ratio_final');
    assertPositive(layer_thickness_m, 'layer_thickness_m');
    assertPositive(compression_index, 'compression_index');

    // A relação de vazios é proporcional à tensão efetiva via Cc
    // Usando a forma índice de vazios: δ = (Cc/(1+e0)) × H × log10(ef_ratio)
    // Aproximação: razão de tensões estimada por e0/ef
    const stress_ratio = void_ratio_initial / void_ratio_final;
    if (stress_ratio <= 0) throw new RangeError('void_ratio_initial / void_ratio_final must be > 0');

    const settlement_m = (compression_index / (1 + void_ratio_initial)) * layer_thickness_m * Math.log10(stress_ratio);

    // Recalque como percentual da espessura da camada
    const settlement_pct = (Math.abs(settlement_m) / layer_thickness_m) * 100;

    return { settlement_m: Math.abs(settlement_m), settlement_pct };
}

function resolveRiskLevel(max_subsidence_m: number, slope_pct: number, infrastructure_proximity_m: number): RiskResult['risk'] {
    // Critério crítico: subsidência > 2m OU inclinação > 5% sobre infraestrutura próxima
    if (max_subsidence_m > 2.0 || (slope_pct > 5.0 && infrastructure_proximity_m < 50)) return 'critical';
    if (max_subsidence_m > 1.0 || (slope_pct > 3.0 && infrastructure_proximity_m < 100)) return 'high';
    if (max_subsidence_m > 0.5 || (slope_pct > 1.5 && infrastructure_proximity_m < 200)) return 'moderate';
    if (max_subsidence_m > 0.1 || slope_pct > 0.5) return 'low';
    return 'very_low';
}

function riskAction(risk: RiskResult['risk']): string {
    switch (risk) {
        case 'critical':
            return 'Immediate engineering assessment required; halt operations near infrastructure';
        case 'high':
            return 'Detailed monitoring program and protective measures for infrastructure';
        case 'moderate':
            return 'Install monitoring benchmarks; inspect structures periodically';
        case 'low':
            return 'Routine monitoring; document baseline measurements';
        case 'very_low':
        default:
            return 'Standard precautionary monitoring';
    }
}

/**
 * Classifies subsidence risk based on magnitude, slope and infrastructure proximity.
 * Classifica o risco de subsidência por magnitude, inclinação e proximidade de infraestrutura.
 *
 * @param {number} max_subsidence_m - Maximum predicted subsidence (m)
 * @param {number} slope_pct - Ground slope in percent (%)
 * @param {number} infrastructure_proximity_m - Distance to nearest infrastructure (m)
 * @returns {{ risk: 'very_low'|'low'|'moderate'|'high'|'critical', action: string }}
 *
 * @references
 *   DNPM Portaria 237/2001 - Normas reguladoras de mineração, Brasil.
 *   Peng, S.S. (1992). Surface Subsidence Engineering. SME.
 */
export function classifySubsidenceRisk(max_subsidence_m: number, slope_pct: number, infrastructure_proximity_m: number): RiskResult {
    assertAllNumbers([max_subsidence_m, slope_pct, infrastructure_proximity_m]);
    assertNonNegative(max_subsidence_m, 'max_subsidence_m');
    assertNonNegative(slope_pct, 'slope_pct');
    assertNonNegative(infrastructure_proximity_m, 'infrastructure_proximity_m');

    const risk = resolveRiskLevel(max_subsidence_m, slope_pct, infrastructure_proximity_m);
    return { risk, action: riskAction(risk) };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const subsidenceRiskMeta = {
    name: 'subsidenceRisk',
    description: 'subsidenceRisk',
    category: 'analytics',
    familyTags: ['risk', 'landslide'],
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
