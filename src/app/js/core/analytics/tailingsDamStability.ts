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
// Application: EHS & Mining - Tailings Dam Stability
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Tailings Dam Stability - Geotechnical Safety Assessment
 *
 * Módulo puro implementando cálculo de fator de segurança, linha freática,
 * classificação de risco e fluxo de percolação para barragens de rejeitos.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Morgenstern, N. R. & Price, V. E. (1965). "The analysis of the stability
 *     of general slip surfaces." Géotechnique 15(1), 79–93.
 *     DOI: 10.1680/geot.1965.15.1.79
 *     (Método de equilíbrio limite para talude geral)
 *   - DNPM / ANM (2017). Portaria 70.389/2017 - Critérios para elaboração de
 *     Plano de Ação de Emergência de Barragem de Mineração. Brasília: DNPM.
 *     (Classificação de risco por volume e população a jusante)
 *   - ICOLD (2011). Bulletin 139 - Improving Tailings Dam Safety. Paris:
 *     International Commission on Large Dams.
 *     (Boas práticas internacionais para barragens de rejeitos)
 *   - Darcy, H. (1856). Les fontaines publiques de la ville de Dijon. Paris:
 *     Dalmont. (Lei de Darcy para fluxo em meios porosos)
 */

'use strict';

// ─── Factor of Safety ────────────────────────────────────────────────────────

interface FactorOfSafetyResult { fs: number; stable: boolean; }

/**
 * Compute Factor of Safety (FS) for a slip surface using the Mohr-Coulomb
 * criterion (simplified Morgenstern-Price for planar failure).
 * Calcula o Fator de Segurança pelo critério de Mohr-Coulomb.
 *
 * FS = (c + σ·tan(φ)) / τ
 *
 * @param {number} cohesion_kPa        - Coesão do material (kPa), c ≥ 0
 * @param {number} frictionAngle_deg   - Ângulo de atrito interno (graus), 0–90
 * @param {number} normalStress_kPa    - Tensão normal na superfície de ruptura (kPa), σ > 0
 * @param {number} shearStress_kPa     - Tensão cisalhante atuante (kPa), τ > 0
 * @returns {{ fs: number, stable: boolean }} Fator de segurança e condição de estabilidade (FS ≥ 1.5)
 * @throws {RangeError} Se cohesion < 0 ou frictionAngle fora de [0, 90) ou stresses ≤ 0
 */
export function computeFactorOfSafety(cohesion_kPa: number, frictionAngle_deg: number, normalStress_kPa: number, shearStress_kPa: number): FactorOfSafetyResult {
    if (cohesion_kPa < 0) throw new RangeError('cohesion_kPa must be ≥ 0');
    if (frictionAngle_deg < 0 || frictionAngle_deg >= 90) {
        throw new RangeError('frictionAngle_deg must be in [0, 90)');
    }
    if (normalStress_kPa <= 0) throw new RangeError('normalStress_kPa must be > 0');
    if (shearStress_kPa <= 0) throw new RangeError('shearStress_kPa must be > 0');

    const phi_rad = frictionAngle_deg * (Math.PI / 180);
    // Resistência cisalhante disponível (Mohr-Coulomb)
    const shearStrength = cohesion_kPa + normalStress_kPa * Math.tan(phi_rad);
    const fs = shearStrength / shearStress_kPa;

    return { fs, stable: fs >= 1.5 };
}

// ─── Phreatic Line ────────────────────────────────────────────────────────────

interface PhreaticLineResult { head_m: number; }

/**
 * Compute phreatic line elevation at a given position along the dam axis.
 * Calcula a cota do lençol freático por interpolação linear entre montante e jusante.
 *
 * h(x) = h_up - (h_up - h_down) × (x / L)
 *
 * @param {number} upstreamHead_m    - Cota piezométrica a montante (m)
 * @param {number} downstreamHead_m  - Cota piezométrica a jusante (m)
 * @param {number} length_m          - Comprimento total da barragem (m), > 0
 * @param {number} position_m        - Posição ao longo do eixo (m), 0 ≤ x ≤ L
 * @returns {{ head_m: number }} Cota do lençol freático na posição dada
 * @throws {RangeError} Se length_m ≤ 0 ou position_m fora de [0, length_m]
 */
export function computePhreaticLine(upstreamHead_m: number, downstreamHead_m: number, length_m: number, position_m: number): PhreaticLineResult {
    if (length_m <= 0) throw new RangeError('length_m must be > 0');
    if (position_m < 0 || position_m > length_m) {
        throw new RangeError('position_m must be in [0, length_m]');
    }

    // Interpolação linear da linha de saturação
    const head_m = upstreamHead_m - (upstreamHead_m - downstreamHead_m) * (position_m / length_m);
    return { head_m };
}

// ─── Dam Risk Classification ──────────────────────────────────────────────────

interface DamRiskResult { riskLevel: string; requiredFS: number; }

/**
 * Classify tailings dam risk per DNPM/ANM Portaria 70.389/2017 criteria.
 * Classifica o risco da barragem conforme critérios do regulador brasileiro.
 *
 * @param {number} fs                     - Fator de segurança calculado
 * @param {number} volume_m3              - Volume de rejeitos armazenados (m³)
 * @param {number} downstreamPopulation   - Número de pessoas na zona de autossalvamento (ZAS)
 * @returns {{ riskLevel: string, requiredFS: number }} Nível de risco e FS mínimo exigido
 * @throws {RangeError} Se fs ≤ 0 ou volume_m3 < 0 ou downstreamPopulation < 0
 */
export function classifyDamRisk(fs: number, volume_m3: number, downstreamPopulation: number): DamRiskResult {
    if (fs <= 0) throw new RangeError('fs must be > 0');
    if (volume_m3 < 0) throw new RangeError('volume_m3 must be ≥ 0');
    if (downstreamPopulation < 0) throw new RangeError('downstreamPopulation must be ≥ 0');

    // Critério crítico: FS abaixo do mínimo absoluto
    if (fs < 1.3) {
        return { riskLevel: 'critico', requiredFS: 1.5 };
    }

    // Critério alto: grande volume OU população significativa a jusante
    const highVolume = volume_m3 > 3_000_000;
    const highPopulation = downstreamPopulation > 100;
    if (highVolume || highPopulation) {
        return { riskLevel: 'alto', requiredFS: 1.5 };
    }

    // Critério médio: volume ou população moderados
    if (volume_m3 > 100_000 || downstreamPopulation > 10) {
        return { riskLevel: 'medio', requiredFS: 1.3 };
    }

    return { riskLevel: 'baixo', requiredFS: 1.2 };
}

// ─── Seepage Flow (Darcy's Law) ───────────────────────────────────────────────

interface SeepageFlowResult { flow_m3_s: number; }

/**
 * Compute seepage flow through a dam section using Darcy's Law.
 * Calcula a vazão de percolação pelo aterro usando a Lei de Darcy.
 *
 * Q = k × (Δh / L) × A   [m³/s]
 *
 * @param {number} permeability_m_s - Condutividade hidráulica (m/s), k > 0
 * @param {number} head_m           - Diferença de carga hidráulica (m), Δh ≥ 0
 * @param {number} area_m2          - Área da seção transversal (m²), A > 0
 * @param {number} length_m         - Comprimento do caminho de percolação (m), L > 0
 * @returns {{ flow_m3_s: number }} Vazão de percolação (m³/s)
 * @throws {RangeError} Se permeability ≤ 0, area ≤ 0, length ≤ 0 ou head < 0
 */
export function computeSeepageFlow(permeability_m_s: number, head_m: number, area_m2: number, length_m: number): SeepageFlowResult {
    if (permeability_m_s <= 0) throw new RangeError('permeability_m_s must be > 0');
    if (head_m < 0) throw new RangeError('head_m must be ≥ 0');
    if (area_m2 <= 0) throw new RangeError('area_m2 must be > 0');
    if (length_m <= 0) throw new RangeError('length_m must be > 0');

    const flow_m3_s = permeability_m_s * (head_m / length_m) * area_m2;
    return { flow_m3_s };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const tailingsDamStabilityMeta = {
    name: 'tailingsDamStability',
    description: 'Tailings Dam Stability',
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
