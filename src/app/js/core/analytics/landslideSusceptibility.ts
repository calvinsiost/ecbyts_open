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
// Application: EHS & Mining - Landslide Susceptibility
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Landslide Susceptibility - Slope Stability Assessment
 *
 * Módulo puro implementando métodos clássicos de avaliação de susceptibilidade
 * a deslizamentos: Fator de Segurança de Fellenius (plano infinito), chuva
 * deflagradora por Caine (1980), Índice de Estabilidade SINMAP (Pack et al. 1998)
 * e classificação de risco com critério de evacuação.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * @module landslideSusceptibility
 * @references
 *   Varnes (1984) IAEG Commission Report - Landslide Hazard Zonation
 *   Caine (1980) Geografiska Annaler 62A:23-27 - Rainfall intensity-duration thresholds
 *   Pack et al. (1998) SINMAP User's Manual - Stability Index Mapping
 *   Fellenius (1936) - Infinite slope stability method
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

// Unit weight of water (kN/m³) / Peso específico da água
const GAMMA_W = 9.8;

// Degrees to radians conversion / Conversão graus para radianos
const DEG2RAD = Math.PI / 180;

// Caine (1980) empirical constants for rainfall threshold: IL = a × D^b
// Constantes empíricas de Caine (1980) para limiar de chuva deflagradora
const CAINE_A = 14.82;
const CAINE_B = -0.39;

// SINMAP typical parameter values (Pack et al. 1998)
// Valores típicos dos parâmetros SINMAP
const SINMAP_T = 10; // Transmissivity (m²/day) / Transmissividade
const SINMAP_R = 0.001; // Recharge rate (m/hr) / Taxa de recarga

/**
 * Compute safety factor using Fellenius infinite slope method.
 * Calcula o fator de segurança pelo método de Fellenius para talude infinito plano.
 *
 * FS = (c + (γ×z - γw×zw)×cos²θ×tan(φ)) / (γ×z×sinθ×cosθ)
 *
 * onde:
 *   c = coesão efetiva (kPa)
 *   γ = peso específico do solo (kN/m³)
 *   z = profundidade da superfície de ruptura (m)
 *   zw = profundidade da lâmina d'água (m)
 *   θ = ângulo de inclinação do talude (graus)
 *   φ = ângulo de atrito interno (graus)
 *
 * @param cohesion_kPa       - Effective cohesion (kPa) / Coesão efetiva
 * @param frictionAngle_deg  - Friction angle (degrees) / Ângulo de atrito
 * @param slope_deg          - Slope angle (degrees) / Inclinação do talude
 * @param depth_m            - Failure surface depth (m) / Profundidade da ruptura
 * @param waterTableDepth_m  - Water table depth from surface (m) / Profundidade do NA
 * @param soilDensity_kN_m3  - Soil unit weight (kN/m³) / Peso específico do solo
 * @throws {RangeError} If slope >= 90° or depth <= 0
 */
export function computeSafetyFactor(
    cohesion_kPa: number,
    frictionAngle_deg: number,
    slope_deg: number,
    depth_m: number,
    waterTableDepth_m: number,
    soilDensity_kN_m3: number,
): { fs: number; stable: boolean } {
    if (slope_deg < 0 || slope_deg >= 90) {
        throw new RangeError('slope_deg must be in [0, 90)');
    }
    if (depth_m <= 0) throw new RangeError('depth_m must be positive');
    if (waterTableDepth_m < 0) throw new RangeError('waterTableDepth_m must be non-negative');
    if (soilDensity_kN_m3 <= 0) throw new RangeError('soilDensity_kN_m3 must be positive');

    const theta = slope_deg * DEG2RAD;
    const phi = frictionAngle_deg * DEG2RAD;

    // Profundidade da lâmina d'água acima da superfície de ruptura
    // zw = depth_m - waterTableDepth_m, limitado a [0, depth_m]
    const zw = Math.max(0, depth_m - waterTableDepth_m);

    // Pressão de poros nas condições de lençol freático
    const normalStress = soilDensity_kN_m3 * depth_m - GAMMA_W * zw;

    // Numerador: resistência ao cisalhamento (coesão + atrito efetivo)
    const resistance = cohesion_kPa + normalStress * Math.cos(theta) ** 2 * Math.tan(phi);

    // Denominador: tensão de cisalhamento cisalhante (força motriz)
    const driving = soilDensity_kN_m3 * depth_m * Math.sin(theta) * Math.cos(theta);

    // FS mínimo teórico: evitar divisão por zero em θ = 0
    const fs = driving === 0 ? Infinity : resistance / driving;

    return { fs, stable: fs >= 1.5 };
}

/**
 * Compute triggering rainfall threshold using Caine (1980) empirical model.
 * Calcula limiar de chuva deflagradora pelo modelo empírico de Caine (1980).
 *
 * IL = 14.82 × D^(-0.39)  (I em mm/h, D em horas)
 * Limiar de precipitação acumulada: P_thresh = IL × D (mm)
 *
 * @param soilSaturation_pct - Soil saturation (%) / Saturação do solo
 * @param intensity_mm_h     - Rainfall intensity (mm/h) / Intensidade de chuva
 * @param duration_h         - Storm duration (hours) / Duração da chuva
 * @throws {RangeError} If intensity or duration is negative
 */
export function computeTriggeringRainfall(
    soilSaturation_pct: number,
    intensity_mm_h: number,
    duration_h: number,
): { threshold_mm: number; exceeded: boolean; intensity_threshold: number } {
    if (intensity_mm_h < 0) throw new RangeError('intensity_mm_h must be non-negative');
    if (duration_h <= 0) throw new RangeError('duration_h must be positive');
    if (soilSaturation_pct < 0 || soilSaturation_pct > 100) {
        throw new RangeError('soilSaturation_pct must be in [0, 100]');
    }

    // Intensidade limiar de Caine (1980): I_lim = a × D^b
    // Ajuste por saturação: solos saturados reduzem o limiar em até 30%
    const saturationFactor = 1 - (soilSaturation_pct / 100) * 0.3;
    const intensity_threshold = CAINE_A * Math.pow(duration_h, CAINE_B) * saturationFactor;

    // Precipitação acumulada (limiar e observada)
    const threshold_mm = intensity_threshold * duration_h;
    const observed_mm = intensity_mm_h * duration_h;

    return {
        threshold_mm,
        exceeded: observed_mm > threshold_mm,
        intensity_threshold,
    };
}

/**
 * Compute Slope Stability Index (SI) based on SINMAP methodology.
 * Calcula o Índice de Estabilidade (SI) baseado no método SINMAP (Pack et al. 1998).
 *
 * SI = log(T / (R × a/b))  onde a/b é razão de recarga/transmissividade × topografia
 * Simplificação: SI = log(T × cosθ × tanφ / (R × cosθ)) com valores típicos T=10, R=0.001
 *
 * @param slope_deg   - Slope angle (degrees) / Inclinação do talude
 * @param curvature   - Topographic curvature (positive = convex) / Curvatura
 * @param landUse     - Land use class / Classe de uso do solo
 * @param soilType    - Soil type / Tipo de solo
 * @throws {RangeError} If slope_deg is out of valid range
 */
export function computeSlopeStabilityIndex(
    slope_deg: number,
    curvature: number,
    landUse: string,
    soilType: string,
): { si: number; stability: 'stable' | 'unstable' } {
    if (slope_deg < 0 || slope_deg >= 90) {
        throw new RangeError('slope_deg must be in [0, 90)');
    }

    const theta = slope_deg * DEG2RAD;

    // Modificadores por uso do solo e tipo de solo
    // Fator de cobertura: floresta aumenta coesão radicular, pastagem reduz
    const landUseFactor = landUse === 'forest' ? 1.3 : landUse === 'pasture' ? 0.7 : landUse === 'urban' ? 0.9 : 1.0;

    // Fator de solo: argilas expansivas reduzem estabilidade
    const soilFactor = soilType === 'clay' ? 0.6 : soilType === 'sand' ? 1.1 : soilType === 'loam' ? 0.9 : 1.0;

    // Modificador de curvatura: concavidade concentra fluxo (reduz estabilidade)
    const curvatureMod = curvature >= 0 ? 1.0 : 1.0 - Math.abs(curvature) * 0.1;

    // Cálculo do SI por SINMAP simplificado
    // SI = log(T × cosθ × tanφ_eff / (R × sec²θ)) - aproximação analítica
    // Usando ângulo de atrito interno típico de 30° (tan30 ≈ 0.577)
    const tanPhi = 0.577 * soilFactor * landUseFactor * curvatureMod;
    const sinTheta = Math.sin(theta);

    // Evitar singularidade em θ = 0
    if (sinTheta < 1e-10) {
        return { si: Infinity, stability: 'stable' };
    }

    const ratio = (SINMAP_T * Math.cos(theta) * tanPhi) / (SINMAP_R * sinTheta);
    const si = ratio > 0 ? Math.log10(ratio) : -Infinity;

    return { si, stability: si > 0 ? 'stable' : 'unstable' };
}

/**
 * Classify landslide risk level and determine evacuation need.
 * Classifica o nível de risco de deslizamento e determina necessidade de evacuação.
 *
 * Critérios de classificação:
 *   - very_high: FS < 1.0 (ruptura iminente)
 *   - high: FS < 1.3 ou chuva deflagradora excedida com inclinação > 30°
 *   - moderate: FS < 1.5
 *   - low: FS >= 1.5
 *   Evacuação: FS < 1.1 E população em risco > 0
 *
 * @param safetyFactor        - FS from computeSafetyFactor / Fator de segurança
 * @param triggeringExceeded  - Whether rainfall threshold was exceeded / Limiar excedido
 * @param slopeAngle_deg      - Slope angle (degrees) / Inclinação
 * @param populationAtRisk    - Number of people at risk / Pessoas em risco
 */
export function classifyLandslideRisk(
    safetyFactor: number,
    triggeringExceeded: boolean,
    slopeAngle_deg: number,
    populationAtRisk: number,
): { riskLevel: 'low' | 'moderate' | 'high' | 'very_high'; evacuate: boolean } {
    if (typeof safetyFactor !== 'number' || safetyFactor < 0) {
        throw new TypeError('safetyFactor must be a non-negative number');
    }
    if (typeof populationAtRisk !== 'number' || populationAtRisk < 0) {
        throw new RangeError('populationAtRisk must be non-negative');
    }

    let riskLevel: 'low' | 'moderate' | 'high' | 'very_high';

    if (safetyFactor < 1.0) {
        riskLevel = 'very_high';
    } else if (safetyFactor < 1.3 || (triggeringExceeded && slopeAngle_deg > 30)) {
        riskLevel = 'high';
    } else if (safetyFactor < 1.5) {
        riskLevel = 'moderate';
    } else {
        riskLevel = 'low';
    }

    // Evacuação obrigatória: ruptura iminente COM população em risco
    const evacuate = safetyFactor < 1.1 && populationAtRisk > 0;

    return { riskLevel, evacuate };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const landslideSusceptibilityMeta: AnalyticsModuleMeta = {
    name: 'landslideSusceptibility',
    description: 'Landslide Susceptibility',
    category: 'analytics',
    familyTags: ['landslide'],
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
