// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * @fileoverview Industrial Hygiene Sampling - Sample Size, OEL Statistics and Exposure Classification
 *
 * Pure analytical module: no DOM, no IDB, no fetch, no Three.js dependencies.
 *
 * Academic references:
 *   - AIHA (2006) A Strategy for Assessing and Managing Occupational Exposures, 3rd ed.
 *   - Leidel N.A. et al. (1977) NIOSH Manual of Sampling Data Analysis. DHEW(NIOSH) 77-173.
 *   - Rappaport S.M. (1991) Assessment of long-term exposures to toxic substances in air.
 *     Ann. Occup. Hyg. 35(1):61-121.
 *   - MTE NR-9 (PPRA) - Programa de Prevenção de Riscos Ambientais (BR)
 */

'use strict';

// Tabela Z para níveis de confiança padrão
// Z values for standard confidence levels
/** @type {Record<number, number>} */
const Z_TABLE = { 90: 1.645, 95: 1.96, 99: 2.576 };

// ─── Sample Size (tamanho amostral) ──────────────────────────────────────────

/**
 * Compute minimum number of samples for industrial hygiene measurement campaign.
 * Cálculo do número mínimo de amostras para campanha de higiene industrial.
 *
 * n = (Z × CV / AE)²
 *   Z  = valor crítico normal para nível de confiança
 *   CV = coeficiente de variação [%]
 *   AE = erro aceitável [%]
 *
 * @param {number} confidence_level    - Confidence level: 90, 95 or 99 [%]
 * @param {number} acceptable_error_pct - Acceptable error [%]
 * @param {number} cv_pct              - Coefficient of variation [%]
 * @returns {{ n_samples: number }}
 * @throws {RangeError} if cv or ae are non-positive, or confidence level unsupported
 */
export function computeSampleSize(confidence_level: number, acceptable_error_pct: number, cv_pct: number): { n_samples: number } {
    if (!(Z_TABLE as Record<number, number>)[confidence_level])
        throw new RangeError(`confidence_level must be one of ${Object.keys(Z_TABLE).join(', ')}`);
    if (cv_pct <= 0) throw new RangeError('cv_pct must be > 0');
    if (acceptable_error_pct <= 0) throw new RangeError('acceptable_error_pct must be > 0');

    const Z = (Z_TABLE as Record<number, number>)[confidence_level]!;
    const n_samples = Math.ceil(Math.pow((Z * cv_pct) / acceptable_error_pct, 2));

    return Object.freeze({ n_samples });
}

// ─── Geometric Mean & GSD (média geométrica e desvio padrão geométrico) ──────

/**
 * Compute geometric mean and geometric standard deviation for lognormal exposure data.
 * Média geométrica e GSD para dados de exposição com distribuição lognormal (AIHA).
 *
 * GM  = exp(mean(ln(xi)))
 * GSD = exp(std(ln(xi)))   [std amostral, divisor n-1]
 *
 * @param {number[]} concentrations - Array of measured concentrations [any unit > 0]
 * @returns {{ gm: number, gsd: number }}
 * @throws {RangeError} if array is empty or any value is <= 0
 */
export function computeGeometricMean(concentrations: number[]): { gm: number, gsd: number } {
    if (!Array.isArray(concentrations) || concentrations.length === 0)
        throw new RangeError('concentrations must be a non-empty array');
    for (const c of concentrations) {
        if (c <= 0) throw new RangeError('all concentrations must be > 0');
    }

    const lnValues = concentrations.map((c) => Math.log(c));
    const meanLn = lnValues.reduce((s, v) => s + v, 0) / lnValues.length;

    const gm = Math.exp(meanLn);

    // Desvio padrão amostral dos logaritmos (n-1)
    let gsd = 1;
    if (lnValues.length > 1) {
        const variance = lnValues.reduce((s, v) => s + (v - meanLn) ** 2, 0) / (lnValues.length - 1);
        gsd = Math.exp(Math.sqrt(variance));
    }

    return Object.freeze({ gm, gsd });
}

// ─── Exceedance Fraction (fração de ultrapassagem do OEL) ────────────────────

/**
 * Compute exceedance fraction and 95th percentile for lognormal exposure distribution.
 * Fração de ultrapassagem do OEL e percentil 95 para distribuição lognormal.
 *
 * P95 = GM × GSD^1.645
 * exceedance = Φ((ln(GM/OEL) + 1.645×ln(GSD)) / ln(GSD)) × 100
 *   Φ = função de distribuição acumulada normal (aproximação por erfc)
 *
 * @param {number} gm  - Geometric mean
 * @param {number} gsd - Geometric standard deviation (>= 1)
 * @param {number} oel - Occupational exposure limit [same unit as gm]
 * @returns {{ exceedance_pct: number, percentile_95: number }}
 * @throws {RangeError} if gm or oel <= 0, or gsd < 1
 */
export function computeExceedanceFraction(gm: number, gsd: number, oel: number): { exceedance_pct: number, percentile_95: number } {
    if (gm <= 0) throw new RangeError('gm must be > 0');
    if (gsd < 1) throw new RangeError('gsd must be >= 1');
    if (oel <= 0) throw new RangeError('oel must be > 0');

    const percentile_95 = gm * Math.pow(gsd, 1.645);

    // Fração de ultrapassagem usando transformação normal da distribuição lognormal
    const lnGSD = Math.log(gsd);
    const exceedance_pct =
        lnGSD > 0
            ? normalCDF((Math.log(gm / oel) + 1.645 * lnGSD) / lnGSD) * 100
            : gm > oel
              ? 100
              : 0;

    return Object.freeze({ exceedance_pct, percentile_95 });
}

/**
 * Approximation of the standard normal CDF using erfc.
 * Aproximação da CDF normal padrão via função erfc.
 * @param {number} z
 * @returns {number} Φ(z) ∈ [0, 1]
 */
function normalCDF(z: number): number {
    return 0.5 * erfc(-z / Math.SQRT2);
}

/**
 * Complementary error function approximation (Abramowitz & Stegun 7.1.26).
 * Função de erro complementar - aproximação racional de A&S.
 * @param {number} x
 * @returns {number}
 */
function erfc(x: number): number {
    const t = 1 / (1 + 0.3275911 * Math.abs(x));
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    const e = 1 - poly * Math.exp(-(x * x));
    return x >= 0 ? 1 - e : 1 + e;
}

// ─── Exposure Profile Classification (classificação do perfil de exposição) ──

/**
 * Classify occupational exposure profile per AIHA Exposure Assessment Strategy.
 * Classificação do perfil de exposição por categoria AIHA (Cat 0-4).
 *
 * Cat 0: < 1% exceedance AND P95 < 0.1 OEL → acceptable without measurement
 * Cat 1: < 1% exceedance, P95 < 0.5 OEL    → acceptable, occasional confirmation
 * Cat 2: 1-5% exceedance                   → action level, sampling required
 * Cat 3: 5-50% exceedance                  → control measures required
 * Cat 4: > 50% exceedance                  → immediate hazard, urgent controls
 *
 * @param {number} exceedance_pct          - Exceedance fraction [%]
 * @param {number} percentile_95_vs_oel    - Ratio P95 / OEL
 * @returns {{ category: '0'|'1'|'2'|'3'|'4', interpretation: string, action: string }}
 * @throws {RangeError} if exceedance_pct is not in [0, 100] or ratio is negative
 */
export function classifyExposureProfile(exceedance_pct: number, percentile_95_vs_oel: number): { category: '0'|'1'|'2'|'3'|'4', interpretation: string, action: string } {
    if (exceedance_pct < 0 || exceedance_pct > 100) throw new RangeError('exceedance_pct must be in [0, 100]');
    if (percentile_95_vs_oel < 0) throw new RangeError('percentile_95_vs_oel must be >= 0');

    /** @type {'0'|'1'|'2'|'3'|'4'} */
    let category: '0' | '1' | '2' | '3' | '4';
    /** @type {string} */
    let interpretation: string;
    /** @type {string} */
    let action: string;

    if (exceedance_pct < 1 && percentile_95_vs_oel < 0.1) {
        category = '0';
        interpretation = 'Exposure well below OEL — highly controlled';
        action = 'No immediate sampling required; annual review recommended';
    } else if (exceedance_pct < 1 && percentile_95_vs_oel < 0.5) {
        category = '1';
        interpretation = 'Exposure below OEL — acceptable with controls';
        action = 'Confirm with periodic sampling (annual); document controls';
    } else if (exceedance_pct <= 5) {
        category = '2';
        interpretation = 'Exposure approaching OEL — action level';
        action = 'Increase sampling frequency; evaluate engineering controls';
    } else if (exceedance_pct <= 50) {
        category = '3';
        interpretation = 'Exposure frequently exceeds OEL — controls required';
        action = 'Implement engineering controls; provide PPE; resample quarterly';
    } else {
        category = '4';
        interpretation = 'Exposure severely exceeds OEL — immediate hazard';
        action = 'Immediate exposure reduction; medical surveillance; daily monitoring';
    }

    return Object.freeze({ category, interpretation, action });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
interface AnalyticsJsonSchema {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
    description?: string;
}
interface AnalyticsModuleProvenance {
    generatedBy: string;
    version: string;
    validatedByHuman: boolean;
    disclaimerAcknowledged: boolean;
    specRef: string;
    citation?: string;
}
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: AnalyticsModuleProvenance;
    inputSchema: AnalyticsJsonSchema;
    outputSchema: AnalyticsJsonSchema;
}

export const industrialHygieneSamplingMeta: AnalyticsModuleMeta = {
    name: 'industrialHygieneSampling',
    description: 'industrialHygieneSampling',
    category: 'analytics',
    familyTags: ['industrial', 'occupational'],
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
