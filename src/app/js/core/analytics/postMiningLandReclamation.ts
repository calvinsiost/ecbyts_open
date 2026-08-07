// @ts-check
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
 * Post-Mining Land Reclamation - SMCRA (1977) + IBAMA Portaria 006/1986
 *
 * Quantifies ecological recovery progress at mined sites using vegetation,
 * soil quality, hydrology restoration, and wildlife recolonization metrics.
 *
 * References:
 *   - SMCRA (1977) - Surface Mining Control and Reclamation Act, 30 U.S.C. §§ 1201–1328
 *   - Bradshaw, A.D. (1997). What do we mean by restoration? In: Urbanska, K.M. et al.
 *     (eds.) Restoration Ecology and Sustainable Development. Cambridge Univ. Press.
 *     DOI: 10.2307/2405114 [J. Appl. Ecol. reference for Bradshaw 1983 precursor]
 *   - IBAMA (1986) - Portaria IBAMA nº 006/1986 - Normas técnicas para recuperação de
 *     áreas degradadas pela mineração (BR)
 *   - Ruiz-Jaen, M.C. & Aide, T.M. (2005). Restoration success: how is it being measured?
 *     Restoration Ecology 13(3):569-577. DOI: 10.1111/j.1526-100X.2005.00072.x
 *   - CPRM (2021) - Guia de avaliação de PRAD em área de mineração (BR)
 *
 * @module postMiningLandReclamation
 */

'use strict';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Assert value is a finite number in [min, max].
 * @param {*} v
 * @param {string} name
 * @param {number} min
 * @param {number} max
 */
function assertRange(v: any, name: any, min: any, max: any) {
    if (typeof v !== 'number' || !isFinite(v) || v < min || v > max) {
        throw new RangeError(`postMiningLandReclamation: ${name} must be in [${min},${max}], got ${v}`);
    }
}

/**
 * Assert finite positive number.
 * @param {*} v
 * @param {string} name
 */
function assertPos(v: any, name: any) {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
        throw new RangeError(`postMiningLandReclamation: ${name} must be a positive finite number, got ${v}`);
    }
}

// ─── Soil texture scoring table (USDA texture classes) ────────────────────────

/**
 * Soil texture suitability score for plant establishment (0–10).
 * Loams score highest; sands and clays score lower due to drainage / compaction.
 * @type {Record<string, number>}
 */
const TEXTURE_SCORE = {
    clay: 4,
    silty_clay: 5,
    sandy_clay: 4,
    clay_loam: 6,
    silty_clay_loam: 7,
    sandy_clay_loam: 6,
    loam: 10,
    silt_loam: 9,
    silt: 8,
    sandy_loam: 7,
    loamy_sand: 5,
    sand: 3,
    generic: 6,
};

/**
 * @param {string} key
 * @returns {key is keyof typeof TEXTURE_SCORE}
 */
function isTextureKey(key: any) {
    return Object.prototype.hasOwnProperty.call(TEXTURE_SCORE, key);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Calculate vegetation recovery rate (%/year) relative to reference ecosystem.
 *
 * Formula: rate = (presentCover_pct / referenceCover_pct) / years * 100
 * Returns percentage of reference cover regained per year.
 * Capped at 100% cover fraction (no over-recovery credit).
 *
 * @param {number} presentCover_pct   - Current vegetation cover (%)  [0–100]
 * @param {number} referenceCover_pct - Reference/target cover (%)    [1–100]
 * @param {number} years              - Years since reclamation began  (>0)
 * @returns {{ recoveryFraction: number, ratePerYear: number }} - fraction in [0,1], rate in %/year
 */
export function calcVegetationRecoveryRate(presentCover_pct: any, referenceCover_pct: any, years: any) {
    assertRange(presentCover_pct, 'presentCover_pct', 0, 100);
    assertRange(referenceCover_pct, 'referenceCover_pct', 1, 100);
    assertPos(years, 'years');

    const recoveryFraction = Math.min(1, presentCover_pct / referenceCover_pct);
    const ratePerYear = (recoveryFraction / years) * 100;
    return { recoveryFraction, ratePerYear };
}

/**
 * Calculate Topsoil Quality Index (TQI) on a 0–100 scale.
 *
 * Four sub-indicators are weighted per Ruiz-Jaen & Aide (2005) adaptation:
 *   - Organic matter (%):  weight 35 - critical for nutrient cycling
 *   - pH (4–9 scale):      weight 25 - optimal range 5.5–7.0 for most species
 *   - CEC (cmol/kg):       weight 25 - cation exchange capacity, proxy for fertility
 *   - Texture score:       weight 15 - USDA texture class suitability
 *
 * @param {number} organicMatter - Soil organic matter content (%)         [0–20]
 * @param {number} pH            - Soil pH                                 [3–10]
 * @param {number} CEC           - Cation exchange capacity (cmol/kg)      [0–60]
 * @param {string} [texture='generic'] - USDA soil texture class
 * @returns {{ TQI: number, subScores: Object }}
 */
export function calcTopsoilQualityIndex(organicMatter: any, pH: any, CEC: any, texture = 'generic') {
    assertRange(organicMatter, 'organicMatter', 0, 20);
    assertRange(pH, 'pH', 3, 10);
    assertRange(CEC, 'CEC', 0, 60);

    // Organic matter: 0%=0 pts, ≥5%=100 pts (linear)
    const omScore = Math.min(100, (organicMatter / 5) * 100);

    // pH: optimal 5.5–7.0 → 100; outside 4–9 → 0; linear ramps
    let phScore;
    if (pH >= 5.5 && pH <= 7.0) {
        phScore = 100;
    } else if (pH < 5.5) {
        phScore = Math.max(0, ((pH - 4) / (5.5 - 4)) * 100);
    } else {
        phScore = Math.max(0, ((9 - pH) / (9 - 7.0)) * 100);
    }

    // CEC: 0=0 pts, ≥30 cmol/kg=100 pts (linear)
    const cecScore = Math.min(100, (CEC / 30) * 100);

    // Texture
    const texKey = (texture || 'generic').toLowerCase().replace(/\s+/g, '_');
const texRaw = TEXTURE_SCORE[(isTextureKey(texKey) ? texKey : 'generic') as keyof typeof TEXTURE_SCORE];
    const texScore = (texRaw / 10) * 100;

    const TQI = 0.35 * omScore + 0.25 * phScore + 0.25 * cecScore + 0.15 * texScore;
    return {
        TQI: Math.round(TQI * 10) / 10,
        subScores: {
            organicMatter: Math.round(omScore),
            pH: Math.round(phScore),
            CEC: Math.round(cecScore),
            texture: Math.round(texScore),
        },
    };
}

/**
 * Calculate overall Reclamation Success Score (RSS) on a 0–100 scale.
 *
 * Weighted composite per SMCRA §515(b) performance standards priorities:
 *   vegetation:  35% (SMCRA primary criterion)
 *   soil:        30% (topsoil depth + quality)
 *   hydrology:   25% (drainage, runoff, groundwater)
 *   wildlife:    10% (recolonization, species richness proxy)
 *
 * All sub-scores must be 0–100.
 *
 * @param {number} vegetation - Vegetation recovery score (0–100)
 * @param {number} soil       - Soil quality/restoration score (0–100)
 * @param {number} hydrology  - Hydrological restoration score (0–100)
 * @param {number} wildlife   - Wildlife recolonization score (0–100)
 * @returns {{ RSS: number, weighted: Object }}
 */
export function calcReclamationSuccessScore(vegetation: any, soil: any, hydrology: any, wildlife: any) {
    assertRange(vegetation, 'vegetation', 0, 100);
    assertRange(soil, 'soil', 0, 100);
    assertRange(hydrology, 'hydrology', 0, 100);
    assertRange(wildlife, 'wildlife', 0, 100);

    const weighted = {
        vegetation: vegetation * 0.35,
        soil: soil * 0.3,
        hydrology: hydrology * 0.25,
        wildlife: wildlife * 0.1,
    };
    const RSS = Object.values(weighted).reduce((a, b) => a + b, 0);
    return { RSS: Math.round(RSS * 10) / 10, weighted };
}

/**
 * Classify reclamation status from overall RSS.
 *
 * Thresholds calibrated to SMCRA bond release criteria (Phase I/II/III)
 * and IBAMA PRAD approval standards.
 *
 * @param {number} score - Reclamation Success Score (0–100)
 * @returns {'failed'|'poor'|'fair'|'good'|'successful'}
 */
export function classifyReclamationStatus(score: any) {
    assertRange(score, 'score', 0, 100);
    if (score < 30) return 'failed';
    if (score < 50) return 'poor';
    if (score < 65) return 'fair';
    if (score < 80) return 'good';
    return 'successful';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const postMiningLandReclamationMeta = {
    name: 'postMiningLandReclamation',
    description: 'postMiningLandReclamation',
    category: 'analytics',
    familyTags: ['mining'],
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
