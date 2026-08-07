// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Campaign Quality Scorer - HEALTH-MON-001 / P1-57
 * Composite quality index for environmental sampling campaigns.
 *
 * Computes 5 dimensions: Completeness, Consistency, Coverage,
 * Replication, and Uncertainty, then aggregates into a weighted
 * composite score with a letter grade and recommendations.
 *
 * Academic reference: ISO 5725-1:1994 (accuracy and precision of
 * measurement methods) and ABNT NBR ISO/IEC 17025:2017 (lab
 * competence) inform the dimension design.
 */
// --- scout: typedef -> TS declarations (runtime-noop) ---
interface CampaignObservation {
    elementId?: string;
    parameter?: string;
    value?: number|string|null;
    unit?: string;
    timestamp?: string|number;
    uncertainty?: number|string|null;
}
interface CampaignLike {
    id?: string;
    campaignId?: string;
    elements?: Array<{id?: string}>;
    observations?: Array<CampaignObservation>;
}
interface DimensionWeights {
    completeness: number;
    consistency: number;
    coverage: number;
    replication: number;
    uncertainty: number;
}
interface QualityResult {
    dimensions: {completeness:number, consistency:number, coverage:number, replication:number, uncertainty:number};
    compositeScore: number;
    grade: 'A'|'B'|'C'|'D'|'F';
    recommendations: string[];
}
// --- end scout declarations ---


// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CampaignObservation
 * @property {string} [elementId]
 * @property {string} [parameter]
 * @property {number|string|null} [value]
 * @property {string} [unit]
 * @property {string|number} [timestamp]
 * @property {number|string|null} [uncertainty]
 */

/**
 * @typedef {Object} CampaignLike
 * @property {string} [id]
 * @property {string} [campaignId]
 * @property {Array<{id?: string}>} [elements]
 * @property {Array<CampaignObservation>} [observations]
 */

/**
 * @typedef {Object} DimensionWeights
 * @property {number} completeness
 * @property {number} consistency
 * @property {number} coverage
 * @property {number} replication
 * @property {number} uncertainty
 */

/**
 * @typedef {Object} QualityResult
 * @property {{completeness:number, consistency:number, coverage:number, replication:number, uncertainty:number}} dimensions
 * @property {number} compositeScore
 * @property {'A'|'B'|'C'|'D'|'F'} grade
 * @property {string[]} recommendations
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Canonical dimension identifiers. */
export const QUALITY_DIMENSIONS = Object.freeze({
    COMPLETENESS: 'completeness',
    CONSISTENCY: 'consistency',
    COVERAGE: 'coverage',
    REPLICATION: 'replication',
    UNCERTAINTY: 'uncertainty',
});

/**
 * Default weights for the composite score.
 * Values must sum to 1.0 - enforced at runtime.
 */
export const DEFAULT_DIMENSION_WEIGHTS = Object.freeze({
    completeness: 0.3,
    consistency: 0.25,
    coverage: 0.2,
    replication: 0.15,
    uncertainty: 0.1,
});

/**
 * Expected SI / environmental unit per parameter (lower-cased key).
 * Parameters absent from this map are assumed correct (return 1.0).
 * @type {Readonly<Record<string, string>>}
 */
const EXPECTED_UNITS: Readonly<Record<string, string>> = Object.freeze({
    ph: 'pH',
    temperature: '°C',
    conductivity: 'μS/cm',
});

// ---------------------------------------------------------------------------
// Individual dimension scorers
// ---------------------------------------------------------------------------

/**
 * Scores completeness of a campaign (0-1).
 *
 * Two sub-scores:
 *   1. elementFraction  - fraction of elements that have >=1 observation.
 *   2. fieldFraction    - fraction of observations with all required fields
 *                         (parameter, value, unit, timestamp) present.
 *
 * Returns the mean of both fractions.
 *
 * @param {CampaignLike} campaign
 * @returns {number}
 */
export function scoreCompleteness(campaign: CampaignLike): number {
    const elements = Array.isArray(campaign?.elements) ? campaign.elements : [];
    const observations = Array.isArray(campaign?.observations) ? campaign.observations : [];

    let elementFraction = 1.0;
    if (elements.length > 0) {
        const observedIds = new Set(
            observations.map((o: CampaignObservation) => o?.elementId).filter(Boolean),
        );
        elementFraction = observedIds.size / elements.length;
    }

    let fieldFraction = 1.0;
    if (observations.length > 0) {
                const REQUIRED: Array<keyof CampaignObservation>= ['parameter', 'value', 'unit', 'timestamp'];
        let complete = 0;
        for (const obs of observations) {
            if (REQUIRED.every((f) => obs[f] != null && obs[f] !== '')) {
                complete++;
            }
        }
        fieldFraction = complete / observations.length;
    }

    return (elementFraction + fieldFraction) / 2;
}

/**
 * Scores consistency of a campaign (0-1).
 * @param {CampaignLike} campaign
 * @returns {number}
 */
export function scoreConsistency(campaign: CampaignLike): number {
    const observations = Array.isArray(campaign?.observations) ? campaign.observations : [];
    if (observations.length === 0) return 1.0;

    let unitMatches = 0;
    for (const obs of observations) {
        const paramKey = typeof obs.parameter === 'string' ? obs.parameter.toLowerCase() : '';
        const expected = EXPECTED_UNITS[paramKey];
        if (expected == null) {
            unitMatches++;
        } else if (obs.unit === expected) {
            unitMatches++;
        }
    }
    const unitConsistency = unitMatches / observations.length;

        const seen: Set<string>= new Set();
    let dupes = 0;
    for (const obs of observations) {
        const key = `${obs.elementId}|${obs.parameter}|${obs.timestamp}`;
        if (seen.has(key)) {
            dupes++;
        } else {
            seen.add(key);
        }
    }
    const duplicateRate = dupes / observations.length;

    return (1 - duplicateRate) * unitConsistency;
}

/**
 * Scores spatial coverage of a campaign (0-1).
 * @param {CampaignLike} campaign
 * @param {number} totalElements
 * @returns {number}
 */
export function scoreCoverage(campaign: CampaignLike, totalElements: number): number {
    if (!totalElements || totalElements <= 0) return 1.0;
    const observations = Array.isArray(campaign?.observations) ? campaign.observations : [];
    const observedIds = new Set(
        observations.map((o: CampaignObservation) => o?.elementId).filter(Boolean),
    );
    return Math.min(observedIds.size / totalElements, 1.0);
}

/**
 * Scores replication sufficiency of a campaign (0-1).
 * @param {CampaignLike} campaign
 * @returns {number}
 */
export function scoreReplication(campaign: CampaignLike): number {
    const observations = Array.isArray(campaign?.observations) ? campaign.observations : [];
    if (observations.length === 0) return 0.0;

        const counts: Map<string, number>= new Map();
    for (const obs of observations) {
        const id = obs?.elementId;
        if (id == null) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    if (counts.size === 0) return 0.0;

    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const mean = total / counts.size;

    return Math.min(mean / 3, 1.0);
}

/**
 * Scores uncertainty documentation of a campaign (0-1).
 * @param {CampaignLike} campaign
 * @returns {number}
 */
export function scoreUncertainty(campaign: CampaignLike): number {
    const observations = Array.isArray(campaign?.observations) ? campaign.observations : [];
    if (observations.length === 0) return 0.5;

    let withUncertainty = 0;
    for (const obs of observations) {
        if (obs.uncertainty != null && Number(obs.uncertainty) > 0) {
            withUncertainty++;
        }
    }

    if (withUncertainty === 0) return 0.5;
    return withUncertainty / observations.length;
}

// ---------------------------------------------------------------------------
// Composite scorer
// ---------------------------------------------------------------------------

/**
 * Maps composite score to a letter grade.
 * @param {number} score
 * @returns {'A'|'B'|'C'|'D'|'F'}
 */
export function gradeScore(score: number): 'A'|'B'|'C'|'D'|'F' {
    if (score >= 0.85) return 'A';
    if (score >= 0.7) return 'B';
    if (score >= 0.55) return 'C';
    if (score >= 0.4) return 'D';
    return 'F';
}

/**
 * Computes a composite campaign quality index.
 * @param {CampaignLike} campaign
 * @param {number} totalElements
 * @param {DimensionWeights} [weights]
 * @returns {QualityResult}
 * @throws {Error}
 */
export function computeCampaignQuality(campaign: CampaignLike, totalElements: number = 0, weights: DimensionWeights = DEFAULT_DIMENSION_WEIGHTS): QualityResult {
    const wSum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(wSum - 1.0) > 0.001) {
        throw new Error(`Dimension weights must sum to 1.0 — got ${wSum.toFixed(4)}`);
    }

    const dimensions = {
        completeness: scoreCompleteness(campaign),
        consistency: scoreConsistency(campaign),
        coverage: scoreCoverage(campaign, totalElements),
        replication: scoreReplication(campaign),
        uncertainty: scoreUncertainty(campaign),
    };

    const compositeScore =
        dimensions.completeness * weights.completeness +
        dimensions.consistency * weights.consistency +
        dimensions.coverage * weights.coverage +
        dimensions.replication * weights.replication +
        dimensions.uncertainty * weights.uncertainty;

    const grade = gradeScore(compositeScore);

    const THRESHOLD = 0.5;
        const recommendations: string[]= [];
    if (dimensions.completeness < THRESHOLD) {
        recommendations.push(
            'Improve field completeness: ensure all observations include parameter, value, unit, and timestamp.',
        );
    }
    if (dimensions.consistency < THRESHOLD) {
        recommendations.push(
            'Improve consistency: check for duplicate records and verify units match expected standards.',
        );
    }
    if (dimensions.coverage < THRESHOLD) {
        recommendations.push('Improve coverage: sample more elements — many site elements have no observations.');
    }
    if (dimensions.replication < THRESHOLD) {
        recommendations.push('Improve replication: aim for at least 3 observations per element (ISO 5725 guideline).');
    }
    if (dimensions.uncertainty < THRESHOLD) {
        recommendations.push('Improve uncertainty documentation: record measurement uncertainty for each observation.');
    }

    return { dimensions, compositeScore, grade, recommendations };
}

/**
 * Compares multiple campaigns by composite quality score.
 * @param {CampaignLike[]} campaigns
 * @param {number} totalElements
 * @returns {Array<{campaignId: string|null, compositeScore: number, grade: string}>}
 */
export function compareCampaigns(campaigns: CampaignLike[], totalElements: number = 0): Array<{campaignId: string|null, compositeScore: number, grade: string}> {
    if (!Array.isArray(campaigns)) return [];

    return campaigns
        .map((c: CampaignLike) => {
            const { compositeScore, grade } = computeCampaignQuality(c, totalElements);
            return { campaignId: c?.id ?? c?.campaignId ?? null, compositeScore, grade };
        })
        .sort((a, b) => b.compositeScore - a.compositeScore);
}
