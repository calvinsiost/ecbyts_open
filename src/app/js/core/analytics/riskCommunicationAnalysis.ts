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
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Risk Communication Analysis - BCQ module
 *
 * Pure-logic scientific functions for risk perception, outrage, environmental
 * justice, stakeholder engagement, and regulatory compliance communication.
 * Zero DOM / IDB / Three.js / fetch dependencies - importable in Node.js.
 *
 * Referências acadêmicas:
 *   - Slovic, P. (1987). "Perception of Risk." Science, 236(4799), 280–285.
 *     DOI: 10.1126/science.3563507
 *   - Sandman, P.M. (1987). "Risk Communication: Facing Public Outrage."
 *     EPA Journal, 13(9), 21–22.
 *   - Starr, C. (1969). "Social benefit versus technological risk."
 *     Science, 165(3899), 1232–1238. DOI: 10.1126/science.165.3899.1232
 *   - Kasperson, R.E. et al. (1988). "The Social Amplification of Risk."
 *     Risk Analysis, 8(2), 177–187. DOI: 10.1111/j.1539-6924.1988.tb01168.x
 *   - Fischhoff, B. et al. (1978). "How safe is safe enough? A psychometric
 *     study of attitudes towards technological risks and benefits."
 *     Policy Sciences, 9(2), 127–152. DOI: 10.1007/BF00143739
 *   - Zio, E. (2009). "Computational Methods for Reliability and Risk Analysis."
 *     World Scientific. ISBN: 978-981-283-890-6
 *   - CDC/ATSDR (2020). CDC/ATSDR Social Vulnerability Index Documentation.
 *     https://www.atsdr.cdc.gov/placeandhealth/svi/documentation/pdf/SVI2018Documentation-H.pdf
 *   - USEPA (2023). EJScreen Technical Documentation.
 *     EPA-230-R-23-003. https://www.epa.gov/ejscreen
 *   - IAP2 (2018). IAP2 Spectrum of Public Participation. IAP2 International.
 *     https://www.iap2.org/
 *   - Earle, T.C. (2010). "Trust in risk management: A model-based review."
 *     Risk Analysis, 30(4), 541–574. DOI: 10.1111/j.1539-6924.2010.01398.x
 *   - USEPA (2011). Exposure Factors Handbook. EPA/600/R-09/052F.
 *   - USEPA (2010). Guidelines for the Economic Analysis of EPA Actions.
 *     EPA-810-R-10-008.
 *   - WHO (2000). Health Impact Assessment. WHO/SDE/PHE/00.05.
 *   - OEHHA (2017). CalEnviroScreen 3.0 Technical Document.
 *     https://oehha.ca.gov/calenviroscreen
 *   - ISO 31000:2018. Risk Management - Guidelines. ISO.
 *   - IEC 31010:2019. Risk Management - Risk Assessment Techniques. IEC.
 */

console.debug('[BCQ:load]', 'app/js/core/analytics/riskCommunicationAnalysis.js');

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/**
 * USEPA HQ thresholds for plain-language risk communication.
 */
const HQ_THRESHOLDS = Object.freeze({
    SAFE: 1.0, // HQ < 1: no significant risk
    MONITOR: 10.0, // 1 ≤ HQ < 10: monitor / precautionary
    // HQ >= 10: act / remediate
});

/**
 * Slovic dread-unknown risk perception scaling coefficients.
 */
const SLOVIC_COEFFICIENTS = Object.freeze({
    DREAD_WEIGHT: 0.6,
    UNKNOWN_WEIGHT: 0.4,
    SCALE: 100.0, // normalize to 0–100
});

/**
 * Sandman outrage factor weights (equal by default; calibrated to 1–5 Likert).
 */
const OUTRAGE_WEIGHTS = Object.freeze({
    involuntary: 1.0,
    uncontrollable: 1.0,
    unfamiliar: 0.8,
    unfair: 1.2,
    memorability: 0.7,
    catastrophic: 1.5,
});

/**
 * CDC SVI equal-weight fractions (simplified 4-theme model).
 */
const SVI_WEIGHTS = Object.freeze({
    age: 0.25,
    poverty: 0.25,
    minority: 0.25,
    disability: 0.25,
});

/**
 * Earle (2010) trust dimension weights.
 */
const TRUST_WEIGHTS = Object.freeze({
    competence: 0.25,
    objectivity: 0.2,
    fairness: 0.2,
    consistency: 0.2,
    goodwill: 0.15,
});

/**
 * ISO 31000 / IEC 31010 risk matrix band thresholds (1–25 scale).
 */
const RISK_MATRIX_BANDS = Object.freeze({
    LOW: 5,
    MEDIUM: 10,
    HIGH: 20,
    // > 20: CRITICAL
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Clamp a value to [min, max].
 * @param {number} fields
 * @param {number} fnName
 * @param {number} max
 * @returns {number}
 */
import { clamp } from '../../utils/helpers/math.js';

/**
 * Assert that all members of an object are finite numbers.
 * @param {object} fields - { label: value }
 * @param {string} fnName - function name for error message
 */
function assertFinite(fields: object, fnName: string) {
    for (const [label, value] of Object.entries(fields)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new TypeError(`[${fnName}] "${label}" must be a finite number, got ${value}`);
        }
    }
}

/**
 * Assert that a value is in range [lo, hi].
 * @param {string} label
 * @param {number} value
 * @param {number} lo
 * @param {number} hi
 * @param {string} fnName
 */
function assertRange(label: string, value: number, lo: number, hi: number, fnName: string) {
    if (value < lo || value > hi) {
        throw new RangeError(`[${fnName}] "${label}" must be in [${lo}, ${hi}], got ${value}`);
    }
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Compute the Slovic (1987) psychometric risk perception index.
 *
 * Maps a 2D dread × unknown factor space to a single risk perception index
 * (0–100). Higher values indicate greater perceived risk.
 *
 * @param {number} dreadScore   - Dread dimension score [0, 10]
 * @param {number} unknownScore - Unknown dimension score [0, 10]
 * @returns {{ riskPerceptionIndex: number, dreadComponent: number,
 *             unknownComponent: number, band: string }}
 * @reference DOI:10.1126/science.3563507
 */
export function computeRiskPerception(dreadScore: number, unknownScore: number): { riskPerceptionIndex: number, dreadComponent: number, unknownComponent: number, band: string } {
    assertFinite({ dreadScore, unknownScore }, 'computeRiskPerception');
    assertRange('dreadScore', dreadScore, 0, 10, 'computeRiskPerception');
    assertRange('unknownScore', unknownScore, 0, 10, 'computeRiskPerception');

    // Normalise each axis to [0, 1] then weight
    const dreadNorm = dreadScore / 10;
    const unknownNorm = unknownScore / 10;

    const dreadComponent = SLOVIC_COEFFICIENTS.DREAD_WEIGHT * dreadNorm * SLOVIC_COEFFICIENTS.SCALE;
    const unknownComponent = SLOVIC_COEFFICIENTS.UNKNOWN_WEIGHT * unknownNorm * SLOVIC_COEFFICIENTS.SCALE;
    const riskPerceptionIndex = dreadComponent + unknownComponent;

    let band;
    if (riskPerceptionIndex < 25) band = 'LOW';
    else if (riskPerceptionIndex < 50) band = 'MEDIUM';
    else if (riskPerceptionIndex < 75) band = 'HIGH';
    else band = 'VERY_HIGH';

    return { riskPerceptionIndex, dreadComponent, unknownComponent, band };
}

/**
 * Compute the Sandman (1987) outrage score for risk communication.
 *
 * Outrage captures public reaction to risk beyond technical hazard.
 * Each factor is rated 1–5 (Likert) and multiplied by its weight.
 *
 * @param {number} involuntary   - Involuntariness of exposure [1, 5]
 * @param {number} uncontrollable - Lack of personal control [1, 5]
 * @param {number} unfamiliar    - Novelty/unfamiliarity [1, 5]
 * @param {number} unfair        - Perceived unfairness [1, 5]
 * @param {number} memorability  - Memorable/dramatic quality [1, 5]
 * @param {number} catastrophic  - Catastrophic potential [1, 5]
 * @returns {{ outrageScore: number, normalizedOutrage: number, band: string }}
 * @reference Sandman, P.M. (1987). EPA Journal, 13(9), 21–22.
 */
export function computeOutrageScore(involuntary: number, uncontrollable: number, unfamiliar: number, unfair: number, memorability: number, catastrophic: number): { outrageScore: number, normalizedOutrage: number, band: string } {
    const fields = { involuntary, uncontrollable, unfamiliar, unfair, memorability, catastrophic };
    assertFinite(fields, 'computeOutrageScore');
    for (const [label, value] of Object.entries(fields)) {
        assertRange(label, value, 1, 5, 'computeOutrageScore');
    }

    const outrageScore =
        OUTRAGE_WEIGHTS.involuntary * involuntary +
        OUTRAGE_WEIGHTS.uncontrollable * uncontrollable +
        OUTRAGE_WEIGHTS.unfamiliar * unfamiliar +
        OUTRAGE_WEIGHTS.unfair * unfair +
        OUTRAGE_WEIGHTS.memorability * memorability +
        OUTRAGE_WEIGHTS.catastrophic * catastrophic;

    const maxScore =
        OUTRAGE_WEIGHTS.involuntary * 5 +
        OUTRAGE_WEIGHTS.uncontrollable * 5 +
        OUTRAGE_WEIGHTS.unfamiliar * 5 +
        OUTRAGE_WEIGHTS.unfair * 5 +
        OUTRAGE_WEIGHTS.memorability * 5 +
        OUTRAGE_WEIGHTS.catastrophic * 5;

    const normalizedOutrage = outrageScore / maxScore; // 0–1

    let band;
    if (normalizedOutrage < 0.33) band = 'LOW';
    else if (normalizedOutrage < 0.66) band = 'MODERATE';
    else band = 'HIGH';

    return { outrageScore, normalizedOutrage, band };
}

/**
 * Classify plain-language risk level from a Hazard Quotient (HQ) per USEPA.
 *
 * USEPA defines HQ = exposure / reference dose. HQ < 1 = acceptable;
 * HQ 1–10 = monitor; HQ ≥ 10 = action required.
 *
 * @param {number} HQ           - Hazard Quotient (non-cancer chronic risk)
 * @param {string} matrix       - Exposure matrix: 'soil' | 'groundwater' | 'air' | 'surface_water'
 * @param {string} contaminant  - Contaminant name for message context
 * @returns {{ HQ: number, riskLevel: string, action: string, exceedanceFactor: number }}
 * @reference USEPA (2011). EPA/600/R-09/052F. https://www.epa.gov/risk
 */
export function computeHazardQuotientCommunication(HQ: number, matrix: string, contaminant: string): { HQ: number, riskLevel: string, action: string, exceedanceFactor: number } {
    if (typeof HQ !== 'number' || !Number.isFinite(HQ) || HQ < 0) {
        throw new TypeError(
            `[computeHazardQuotientCommunication] "HQ" must be a non-negative finite number, got ${HQ}`,
        );
    }
    if (typeof matrix !== 'string' || matrix.trim() === '') {
        throw new TypeError(`[computeHazardQuotientCommunication] "matrix" must be a non-empty string`);
    }
    if (typeof contaminant !== 'string' || contaminant.trim() === '') {
        throw new TypeError(`[computeHazardQuotientCommunication] "contaminant" must be a non-empty string`);
    }

    const VALID_MATRICES = ['soil', 'groundwater', 'air', 'surface_water'];
    if (!VALID_MATRICES.includes(matrix)) {
        throw new RangeError(
            `[computeHazardQuotientCommunication] "matrix" must be one of: ${VALID_MATRICES.join(', ')}`,
        );
    }

    const exceedanceFactor = HQ / HQ_THRESHOLDS.SAFE; // ratio above limit-of-concern

    let riskLevel;
    let action;
    if (HQ < HQ_THRESHOLDS.SAFE) {
        riskLevel = 'SAFE';
        action = `No action required. ${contaminant} in ${matrix} is within acceptable limits (HQ=${HQ.toFixed(2)}).`;
    } else if (HQ < HQ_THRESHOLDS.MONITOR) {
        riskLevel = 'MONITOR';
        action = `Precautionary monitoring recommended. ${contaminant} in ${matrix} exceeds acceptable threshold (HQ=${HQ.toFixed(2)}). Implement exposure reduction measures.`;
    } else {
        riskLevel = 'ACT';
        action = `Immediate action required. ${contaminant} in ${matrix} significantly exceeds safe levels (HQ=${HQ.toFixed(2)}). Initiate remediation and exposure controls.`;
    }

    return { HQ, riskLevel, action, exceedanceFactor };
}

/**
 * Multi-criteria risk ranking via weighted sum normalization (Zio 2009).
 *
 * Each risk is scored across multiple criteria; scores are normalized [0,1]
 * per criterion then combined with weights. Returns items sorted descending.
 *
 * @param {Array<{id: string, scores: number[]}>} risks   - Array of risk items with per-criteria scores
 * @param {number[]} weights - Criteria weights (will be normalized to sum = 1)
 * @returns {{ ranked: Array<{id: string, compositeScore: number, rank: number}>, weights: number[] }}
 * @reference Zio, E. (2009). Computational Methods for Reliability and Risk Analysis. ISBN:978-981-283-890-6
 */
export function computeRiskRanking(risks: Array<{id: string, scores: number[]}>, weights: number[]): { ranked: Array<{id: string, compositeScore: number, rank: number}>, weights: number[] } {
    if (!Array.isArray(risks) || risks.length === 0) {
        throw new TypeError('[computeRiskRanking] "risks" must be a non-empty array');
    }
    if (!Array.isArray(weights) || weights.length === 0) {
        throw new TypeError('[computeRiskRanking] "weights" must be a non-empty array');
    }

    const nCriteria = weights.length;
    for (const w of weights) {
        if (typeof w !== 'number' || !Number.isFinite(w) || w < 0) {
            throw new TypeError('[computeRiskRanking] all weights must be non-negative finite numbers');
        }
    }

    for (const risk of risks) {
        if (!risk.id || !Array.isArray(risk.scores) || risk.scores.length !== nCriteria) {
            throw new TypeError(`[computeRiskRanking] each risk must have id and scores array of length ${nCriteria}`);
        }
        for (const s of risk.scores) {
            if (typeof s !== 'number' || !Number.isFinite(s)) {
                throw new TypeError('[computeRiskRanking] all scores must be finite numbers');
            }
        }
    }

    // Normalize weights to sum = 1
    const weightSum = weights.reduce((a, b) => a + b, 0);
    if (weightSum === 0) {
        throw new RangeError('[computeRiskRanking] weights must not all be zero');
    }
    const normWeights = weights.map((w) => w / weightSum);

    // Find min/max per criterion for normalization
    const mins = new Array(nCriteria).fill(Infinity);
    const maxs = new Array(nCriteria).fill(-Infinity);
    for (const risk of risks) {
        for (let c = 0; c < nCriteria; c++) {
            if ((risk.scores[c] as number) < mins[c]) mins[c] = risk.scores[c] as number;
            if ((risk.scores[c] as number) > maxs[c]) maxs[c] = risk.scores[c] as number;
        }
    }

    // Compute weighted composite score for each risk
    const scored = risks.map((risk) => {
        let composite = 0;
        for (let c = 0; c < nCriteria; c++) {
            const range = maxs[c] - mins[c];
            const normScore = range === 0 ? 0 : ((risk.scores[c] as number) - mins[c]) / range;
            composite += (normWeights[c] as number) * normScore;
        }
        return { id: risk.id, compositeScore: composite };
    });

    // Sort descending and assign rank
    scored.sort((a, b) => b.compositeScore - a.compositeScore);
    const ranked = scored.map((item, idx) => ({ ...item, rank: idx + 1 }));

    return { ranked, weights: normWeights };
}

/**
 * Compute the CDC Social Vulnerability Index (SVI) simplified 4-theme model.
 *
 * SVI helps emergency responders identify communities in need of support
 * before, during, and after disasters.
 *
 * @param {number} age_fraction        - Fraction of population aged < 17 or > 65 [0, 1]
 * @param {number} poverty_fraction    - Fraction below poverty line [0, 1]
 * @param {number} minority_fraction   - Fraction of racial/ethnic minorities [0, 1]
 * @param {number} disability_fraction - Fraction with disability [0, 1]
 * @returns {{ sviScore: number, band: string, components: object }}
 * @reference CDC/ATSDR (2020). SVI Documentation. https://www.atsdr.cdc.gov/placeandhealth/svi/
 */
export function computeVulnerabilityIndex(age_fraction: number, poverty_fraction: number, minority_fraction: number, disability_fraction: number): { sviScore: number, band: string, components: object } {
    const fields = { age_fraction, poverty_fraction, minority_fraction, disability_fraction };
    assertFinite(fields, 'computeVulnerabilityIndex');
    for (const [label, value] of Object.entries(fields)) {
        assertRange(label, value, 0, 1, 'computeVulnerabilityIndex');
    }

    const ageComponent = SVI_WEIGHTS.age * age_fraction;
    const povertyComponent = SVI_WEIGHTS.poverty * poverty_fraction;
    const minorityComponent = SVI_WEIGHTS.minority * minority_fraction;
    const disabilityComponent = SVI_WEIGHTS.disability * disability_fraction;

    const sviScore = ageComponent + povertyComponent + minorityComponent + disabilityComponent; // 0–1

    let band;
    if (sviScore < 0.25) band = 'LOW';
    else if (sviScore < 0.5) band = 'MODERATE';
    else if (sviScore < 0.75) band = 'HIGH';
    else band = 'VERY_HIGH';

    return {
        sviScore,
        band,
        components: { ageComponent, povertyComponent, minorityComponent, disabilityComponent },
    };
}

/**
 * Compute an EJScreen-style Environmental Justice Index score (USEPA EJScreen 2023).
 *
 * EJ Index = toxicExposure × demographicScore. Both inputs must be normalized
 * to [0,1] before calling. Output is the EJ percentile-equivalent score [0,1].
 *
 * @param {number} toxicExposure    - Normalized toxic/hazard exposure score [0, 1]
 * @param {number} demographicScore - Normalized demographic vulnerability score [0, 1]
 * @returns {{ ejIndexScore: number, band: string, percentileApprox: number }}
 * @reference USEPA (2023). EJScreen Technical Documentation. EPA-230-R-23-003.
 */
export function computeEJIndexScore(toxicExposure: number, demographicScore: number): { ejIndexScore: number, band: string, percentileApprox: number } {
    assertFinite({ toxicExposure, demographicScore }, 'computeEJIndexScore');
    assertRange('toxicExposure', toxicExposure, 0, 1, 'computeEJIndexScore');
    assertRange('demographicScore', demographicScore, 0, 1, 'computeEJIndexScore');

    // EJScreen formula: EJ Index = Environmental Indicator × Demographic Index
    const ejIndexScore = toxicExposure * demographicScore;

    // Approximate percentile using square-root scaling for communication
    const percentileApprox = Math.sqrt(ejIndexScore) * 100;

    let band;
    if (ejIndexScore < 0.1) band = 'LOW';
    else if (ejIndexScore < 0.3) band = 'MODERATE';
    else if (ejIndexScore < 0.6) band = 'HIGH';
    else band = 'VERY_HIGH';

    return { ejIndexScore, band, percentileApprox };
}

/**
 * Compute stakeholder engagement quality index per IAP2 framework.
 *
 * Combines participation rate, response rate, satisfaction, and diversity
 * into a single engagement effectiveness score [0,1].
 *
 * @param {number} participation_rate - Fraction of invited stakeholders who participated [0, 1]
 * @param {number} response_rate      - Fraction of stakeholders who responded to surveys [0, 1]
 * @param {number} satisfaction       - Average satisfaction score normalised to [0, 1]
 * @param {number} diversity          - Diversity index of participant backgrounds [0, 1]
 * @returns {{ engagementScore: number, band: string, components: object }}
 * @reference IAP2 (2018). Spectrum of Public Participation. https://www.iap2.org/
 */
export function computeStakeholderEngagementScore(participation_rate: number, response_rate: number, satisfaction: number, diversity: number): { engagementScore: number, band: string, components: object } {
    const fields = { participation_rate, response_rate, satisfaction, diversity };
    assertFinite(fields, 'computeStakeholderEngagementScore');
    for (const [label, value] of Object.entries(fields)) {
        assertRange(label, value, 0, 1, 'computeStakeholderEngagementScore');
    }

    // Equal-weight composite (IAP2 does not specify weights; equal weighting is defensible)
    const engagementScore = (participation_rate + response_rate + satisfaction + diversity) / 4;

    let band;
    if (engagementScore < 0.25) band = 'INFORM';
    else if (engagementScore < 0.5) band = 'CONSULT';
    else if (engagementScore < 0.75) band = 'INVOLVE';
    else band = 'COLLABORATE';

    return {
        engagementScore,
        band,
        components: { participation_rate, response_rate, satisfaction, diversity },
    };
}

/**
 * Estimate acceptable community risk tolerance using the Starr (1969)
 * voluntariness–benefit–trust–dread model with Fischhoff modifications.
 *
 * Acceptable risk increases with voluntary exposure and benefit,
 * and decreases with dread; trust modulates tolerance linearly.
 *
 * @param {number} voluntariness - Degree to which exposure is voluntary [0, 1]
 * @param {number} benefit       - Perceived societal or personal benefit [0, 1]
 * @param {number} trust         - Trust in managing institution [0, 1]
 * @param {number} dread         - Dread factor (as in Slovic) [0, 1]
 * @returns {{ toleranceScore: number, band: string }}
 * @reference DOI:10.1126/science.165.3899.1232; DOI:10.1007/BF00143739
 */
export function computeCommunityRiskTolerance(voluntariness: number, benefit: number, trust: number, dread: number): { toleranceScore: number, band: string } {
    const fields = { voluntariness, benefit, trust, dread };
    assertFinite(fields, 'computeCommunityRiskTolerance');
    for (const [label, value] of Object.entries(fields)) {
        assertRange(label, value, 0, 1, 'computeCommunityRiskTolerance');
    }

    // Starr's formulation: tolerance ∝ voluntariness^3 × benefit
    // Fischhoff: modulate by trust; Slovic: reduce by dread
    // Simplified: toleranceScore = (voluntariness^1.5 × benefit × (0.5 + 0.5×trust)) / (0.1 + dread)
    const numerator = Math.pow(voluntariness, 1.5) * benefit * (0.5 + 0.5 * trust);
    const denominator = 0.1 + dread;
    const raw = numerator / denominator;
    const toleranceScore = clamp(raw / (raw + 1), 0, 1); // logistic squash to [0,1]

    let band;
    if (toleranceScore < 0.25) band = 'VERY_LOW';
    else if (toleranceScore < 0.5) band = 'LOW';
    else if (toleranceScore < 0.75) band = 'MODERATE';
    else band = 'HIGH';

    return { toleranceScore, band };
}

/**
 * Compute the Social Amplification of Risk Framework (SARF) score.
 *
 * SARF describes how risk signals are transformed (amplified or attenuated)
 * through social processes including media coverage and social networks.
 *
 * @param {number} mediaIntensity     - Media coverage intensity [0, 1]
 * @param {number} socialNetworkReach - Fraction of population reached by social media [0, 1]
 * @param {number} priorOutrage       - Prior community outrage level [0, 1]
 * @returns {{ sarfScore: number, amplificationFactor: number, band: string }}
 * @reference DOI:10.1111/j.1539-6924.1988.tb01168.x
 */
export function computeRiskAmplification(mediaIntensity: number, socialNetworkReach: number, priorOutrage: number): { sarfScore: number, amplificationFactor: number, band: string } {
    const fields = { mediaIntensity, socialNetworkReach, priorOutrage };
    assertFinite(fields, 'computeRiskAmplification');
    for (const [label, value] of Object.entries(fields)) {
        assertRange(label, value, 0, 1, 'computeRiskAmplification');
    }

    // SARF amplification: signal × (1 + media × reach) × (1 + outrage)
    // Base signal = (mediaIntensity + socialNetworkReach) / 2
    const baseSignal = (mediaIntensity + socialNetworkReach) / 2;
    const amplificationFactor = (1 + mediaIntensity * socialNetworkReach) * (1 + priorOutrage);
    const sarfScore = clamp(baseSignal * amplificationFactor, 0, 1);

    let band;
    if (sarfScore < 0.25) band = 'ATTENUATED';
    else if (sarfScore < 0.5) band = 'NEUTRAL';
    else if (sarfScore < 0.75) band = 'AMPLIFIED';
    else band = 'HIGHLY_AMPLIFIED';

    return { sarfScore, amplificationFactor, band };
}

/**
 * Compute organizational trust index using Earle (2010) five-dimension model.
 *
 * Weighted mean of competence, objectivity, fairness, consistency, and
 * goodwill dimensions on a 0–1 scale.
 *
 * @param {number} competence   - Perceived competence of the organization [0, 1]
 * @param {number} objectivity  - Perceived objectivity / absence of bias [0, 1]
 * @param {number} fairness     - Perceived procedural fairness [0, 1]
 * @param {number} consistency  - Track record of consistent behavior [0, 1]
 * @param {number} goodwill     - Perceived good intentions toward community [0, 1]
 * @returns {{ trustIndex: number, band: string, dimensions: object }}
 * @reference DOI:10.1111/j.1539-6924.2010.01398.x
 */
export function computeTrustIndex(competence: number, objectivity: number, fairness: number, consistency: number, goodwill: number): { trustIndex: number, band: string, dimensions: object } {
    const fields = { competence, objectivity, fairness, consistency, goodwill };
    assertFinite(fields, 'computeTrustIndex');
    for (const [label, value] of Object.entries(fields)) {
        assertRange(label, value, 0, 1, 'computeTrustIndex');
    }

    const trustIndex =
        TRUST_WEIGHTS.competence * competence +
        TRUST_WEIGHTS.objectivity * objectivity +
        TRUST_WEIGHTS.fairness * fairness +
        TRUST_WEIGHTS.consistency * consistency +
        TRUST_WEIGHTS.goodwill * goodwill;

    let band;
    if (trustIndex < 0.3) band = 'DISTRUST';
    else if (trustIndex < 0.55) band = 'LOW_TRUST';
    else if (trustIndex < 0.75) band = 'MODERATE_TRUST';
    else band = 'HIGH_TRUST';

    const dimensions = { competence, objectivity, fairness, consistency, goodwill };

    return { trustIndex, band, dimensions };
}

/**
 * Assess regulatory compliance gap for a given risk scenario.
 *
 * Computes exceedance ratio and affected population estimate based on the
 * actual risk compared to the regulatory limit.
 *
 * @param {number} actualRisk         - Measured or estimated risk value (same units as limit)
 * @param {number} regulatoryLimit    - Applicable regulatory limit (must be > 0)
 * @param {string} matrix             - Exposure matrix: 'soil' | 'groundwater' | 'air' | 'surface_water'
 * @param {number} population         - Number of potentially affected people (≥ 0)
 * @returns {{ exceedanceRatio: number, compliant: boolean, affectedPopulation: number,
 *             gapMessage: string }}
 * @reference USEPA (2011). Exposure Factors Handbook. EPA/600/R-09/052F.
 */
export function assessRegulatoryCompliance(actualRisk: number, regulatoryLimit: number, matrix: string, population: number): { exceedanceRatio: number, compliant: boolean, affectedPopulation: number, gapMessage: string } {
    assertFinite({ actualRisk, regulatoryLimit, population }, 'assessRegulatoryCompliance');
    if (regulatoryLimit <= 0) {
        throw new RangeError('[assessRegulatoryCompliance] "regulatoryLimit" must be > 0');
    }
    if (actualRisk < 0) {
        throw new RangeError('[assessRegulatoryCompliance] "actualRisk" must be ≥ 0');
    }
    if (population < 0 || !Number.isInteger(population)) {
        throw new RangeError('[assessRegulatoryCompliance] "population" must be a non-negative integer');
    }
    const VALID_MATRICES = ['soil', 'groundwater', 'air', 'surface_water'];
    if (!VALID_MATRICES.includes(matrix)) {
        throw new RangeError(`[assessRegulatoryCompliance] "matrix" must be one of: ${VALID_MATRICES.join(', ')}`);
    }

    const exceedanceRatio = actualRisk / regulatoryLimit;
    const compliant = exceedanceRatio <= 1.0;
    const affectedPopulation = compliant ? 0 : population;

    const gapMessage = compliant
        ? `${matrix} is compliant (ratio=${exceedanceRatio.toFixed(3)}). No population impact.`
        : `${matrix} EXCEEDS regulatory limit by ${((exceedanceRatio - 1) * 100).toFixed(1)}%. Up to ${affectedPopulation.toLocaleString()} people potentially affected.`;

    return { exceedanceRatio, compliant, affectedPopulation, gapMessage };
}

/**
 * Compute a Health Impact Assessment composite score per WHO (2000) framework.
 *
 * HIA score integrates exposure, vulnerability, sensitivity, and adaptive
 * capacity to estimate net health impact potential.
 *
 * @param {number} exposure         - Normalized exposure level [0, 1]
 * @param {number} vulnerability    - Population vulnerability [0, 1]
 * @param {number} sensitivity      - Health system sensitivity to the stressor [0, 1]
 * @param {number} adaptiveCapacity - Community adaptive capacity [0, 1]
 * @returns {{ hiaScore: number, netImpact: number, band: string }}
 * @reference WHO (2000). Health Impact Assessment. WHO/SDE/PHE/00.05.
 */
export function computeHealthImpactAssessmentScore(exposure: number, vulnerability: number, sensitivity: number, adaptiveCapacity: number): { hiaScore: number, netImpact: number, band: string } {
    const fields = { exposure, vulnerability, sensitivity, adaptiveCapacity };
    assertFinite(fields, 'computeHealthImpactAssessmentScore');
    for (const [label, value] of Object.entries(fields)) {
        assertRange(label, value, 0, 1, 'computeHealthImpactAssessmentScore');
    }

    // Gross impact = exposure × vulnerability × sensitivity
    // Net impact = gross − (0.5 × adaptiveCapacity × gross)
    const grossImpact = exposure * vulnerability * sensitivity;
    const netImpact = grossImpact * (1 - 0.5 * adaptiveCapacity);
    const hiaScore = clamp(netImpact, 0, 1);

    let band;
    if (hiaScore < 0.1) band = 'NEGLIGIBLE';
    else if (hiaScore < 0.3) band = 'LOW';
    else if (hiaScore < 0.6) band = 'MODERATE';
    else band = 'HIGH';

    return { hiaScore, netImpact, band };
}

/**
 * Compute risk communication effectiveness from KAP (Knowledge–Attitude–Practice) surveys.
 *
 * Measures the proportional change in awareness and behaviour attributable to
 * a risk communication intervention.
 *
 * @param {number} awareness_before - Pre-intervention awareness fraction [0, 1]
 * @param {number} awareness_after  - Post-intervention awareness fraction [0, 1]
 * @param {number} behavior_change  - Fraction reporting behaviour change [0, 1]
 * @returns {{ awarenessGain: number, effectivenessScore: number, band: string }}
 * @reference WHO (2012). Knowledge, Attitudes and Practices (KAP) Surveys. ISBN:978-92-4-150429-7
 */
export function computeRiskCommunicationEffectiveness(awareness_before: number, awareness_after: number, behavior_change: number): { awarenessGain: number, effectivenessScore: number, band: string } {
    const fields = { awareness_before, awareness_after, behavior_change };
    assertFinite(fields, 'computeRiskCommunicationEffectiveness');
    for (const [label, value] of Object.entries(fields)) {
        assertRange(label, value, 0, 1, 'computeRiskCommunicationEffectiveness');
    }

    // Awareness gain = absolute improvement
    const awarenessGain = awareness_after - awareness_before;

    // Effectiveness: weight awareness gain (0.6) + behavior change (0.4)
    // Normalize awareness gain from [-1,1] to [0,1] for combination
    const normalizedGain = (awarenessGain + 1) / 2;
    const effectivenessScore = clamp(0.6 * normalizedGain + 0.4 * behavior_change, 0, 1);

    let band;
    if (effectivenessScore < 0.35) band = 'INEFFECTIVE';
    else if (effectivenessScore < 0.55) band = 'PARTIALLY_EFFECTIVE';
    else if (effectivenessScore < 0.75) band = 'EFFECTIVE';
    else band = 'HIGHLY_EFFECTIVE';

    return { awarenessGain, effectivenessScore, band };
}

/**
 * Compute the Environmental Justice disparity gap between income groups.
 *
 * Measures the ratio of toxic exposure experienced by low-income vs high-income
 * communities as a proxy for environmental injustice.
 *
 * @param {number} expHighIncome - Mean toxic exposure index for high-income group [0, 1]
 * @param {number} expLowIncome  - Mean toxic exposure index for low-income group [0, 1]
 * @param {number} incomeRatio   - Ratio of low/high income (median income ratio) [0, ∞)
 * @returns {{ ejGap: number, disparityRatio: number, band: string }}
 * @reference USEPA (2023). EJScreen Technical Documentation. EPA-230-R-23-003.
 */
export function computeEnvironmentalJusticeGap(expHighIncome: number, expLowIncome: number, incomeRatio: number): { ejGap: number, disparityRatio: number, band: string } {
    assertFinite({ expHighIncome, expLowIncome, incomeRatio }, 'computeEnvironmentalJusticeGap');
    assertRange('expHighIncome', expHighIncome, 0, 1, 'computeEnvironmentalJusticeGap');
    assertRange('expLowIncome', expLowIncome, 0, 1, 'computeEnvironmentalJusticeGap');
    if (incomeRatio < 0) {
        throw new RangeError('[computeEnvironmentalJusticeGap] "incomeRatio" must be ≥ 0');
    }

    // Disparity ratio: if high-income has zero exposure, cap at 10 to avoid Inf
    const disparityRatio = expHighIncome === 0 ? (expLowIncome === 0 ? 1 : 10) : expLowIncome / expHighIncome;

    // EJ gap = (exposure difference) × income inequality factor
    const incomeInequalityFactor = incomeRatio === 0 ? 1 : 1 / incomeRatio;
    const ejGap = clamp((expLowIncome - expHighIncome) * incomeInequalityFactor, 0, 1);

    let band;
    if (disparityRatio < 1.2) band = 'EQUITABLE';
    else if (disparityRatio < 2.0) band = 'MODERATE_DISPARITY';
    else if (disparityRatio < 4.0) band = 'HIGH_DISPARITY';
    else band = 'EXTREME_DISPARITY';

    return { ejGap, disparityRatio, band };
}

/**
 * Compute a 5×5 risk matrix score per ISO 31000 / IEC 31010.
 *
 * Risk = Likelihood × Severity on integer scales 1–5.
 * Returns score 1–25 with four risk bands.
 *
 * @param {number} likelihood - Likelihood rating: integer 1–5
 * @param {number} severity   - Severity (consequence) rating: integer 1–5
 * @returns {{ score: number, band: string, action: string }}
 * @reference ISO 31000:2018; IEC 31010:2019.
 */
export function computeRiskMatrixScore(likelihood: number, severity: number): { score: number, band: string, action: string } {
    assertFinite({ likelihood, severity }, 'computeRiskMatrixScore');
    if (!Number.isInteger(likelihood) || likelihood < 1 || likelihood > 5) {
        throw new RangeError('[computeRiskMatrixScore] "likelihood" must be an integer in [1, 5]');
    }
    if (!Number.isInteger(severity) || severity < 1 || severity > 5) {
        throw new RangeError('[computeRiskMatrixScore] "severity" must be an integer in [1, 5]');
    }

    const score = likelihood * severity;

    let band;
    let action;
    if (score <= RISK_MATRIX_BANDS.LOW) {
        band = 'LOW';
        action = 'Accept. Monitor periodically.';
    } else if (score <= RISK_MATRIX_BANDS.MEDIUM) {
        band = 'MEDIUM';
        action = 'Reduce risk. Implement controls within 90 days.';
    } else if (score <= RISK_MATRIX_BANDS.HIGH) {
        band = 'HIGH';
        action = 'Reduce risk urgently. Implement controls within 30 days.';
    } else {
        band = 'CRITICAL';
        action = 'Stop activity / emergency controls. Immediate action required.';
    }

    return { score, band, action };
}

/**
 * Compute cancer risk distribution from Monte Carlo stochastic exposure × CSF.
 *
 * Individual lifetime cancer risk = Exposure × Cancer Slope Factor.
 * Provides distributional statistics from paired samples.
 *
 * @param {number[]} exposure_samples - Stochastic exposure samples (mg/kg-day), length ≥ 10
 * @param {number[]} CSF_samples      - Cancer slope factor samples ((mg/kg-day)^-1), same length
 * @returns {{ mean: number, p50: number, p95: number, max: number,
 *             exceedance_1e4: number, exceedance_1e6: number, n: number }}
 * @reference USEPA (2011). Exposure Factors Handbook. EPA/600/R-09/052F.
 */
export function computeMonteCarloRiskDistribution(exposure_samples: number[], CSF_samples: number[]): { mean: number, p50: number, p95: number, max: number, exceedance_1e4: number, exceedance_1e6: number, n: number } {
    if (!Array.isArray(exposure_samples) || !Array.isArray(CSF_samples)) {
        throw new TypeError('[computeMonteCarloRiskDistribution] both arguments must be arrays');
    }
    if (exposure_samples.length !== CSF_samples.length) {
        throw new RangeError('[computeMonteCarloRiskDistribution] arrays must have equal length');
    }
    if (exposure_samples.length < 10) {
        throw new RangeError('[computeMonteCarloRiskDistribution] at least 10 samples required');
    }

    const n = exposure_samples.length;
    const risks = new Array(n);
    for (let i = 0; i < n; i++) {
        const e = exposure_samples[i];
        const c = CSF_samples[i];
        if (typeof e !== 'number' || !Number.isFinite(e) || e < 0) {
            throw new TypeError(
                `[computeMonteCarloRiskDistribution] exposure_samples[${i}] must be a non-negative finite number`,
            );
        }
        if (typeof c !== 'number' || !Number.isFinite(c) || c < 0) {
            throw new TypeError(
                `[computeMonteCarloRiskDistribution] CSF_samples[${i}] must be a non-negative finite number`,
            );
        }
        risks[i] = e * c;
    }

    risks.sort((a, b) => a - b);
    const mean = risks.reduce((s, v) => s + v, 0) / n;
    const p50 = risks[Math.floor(n * 0.5)];
    const p95 = risks[Math.floor(n * 0.95)];
    const max = risks[n - 1];

    const exceedance_1e4 = risks.filter((r) => r > 1e-4).length / n; // fraction exceeding 1×10⁻⁴
    const exceedance_1e6 = risks.filter((r) => r > 1e-6).length / n; // fraction exceeding 1×10⁻⁶

    return { mean, p50, p95, max, exceedance_1e4, exceedance_1e6, n };
}

/**
 * Compute the USEPA composite uncertainty factor for human health risk assessment.
 *
 * Each adequacy dimension contributes up to one decade of uncertainty (×10)
 * on a 3-point scale: 'adequate' (1×), 'limited' (3×), 'inadequate' (10×).
 *
 * @param {'adequate'|'limited'|'inadequate'} database_adequacy      - Toxicological database quality
 * @param {'adequate'|'limited'|'inadequate'} dose_response_adequacy - Dose–response data quality
 * @param {'adequate'|'limited'|'inadequate'} exposure_adequacy      - Exposure characterisation quality
 * @returns {{ uncertaintyFactor: number, components: object, recommendation: string }}
 * @reference USEPA (2011). EPA/600/R-09/052F; USEPA (2002). EPA/100/B-02/001.
 */
export function computeUncertaintyFactor(database_adequacy: 'adequate'|'limited'|'inadequate', dose_response_adequacy: 'adequate'|'limited'|'inadequate', exposure_adequacy: 'adequate'|'limited'|'inadequate'): { uncertaintyFactor: number, components: object, recommendation: string } {
    const VALID = ['adequate', 'limited', 'inadequate'];
    const adqMap = { adequate: 1, limited: 3, inadequate: 10 };

    for (const [label, value] of Object.entries({ database_adequacy, dose_response_adequacy, exposure_adequacy })) {
        if (!VALID.includes(value)) {
            throw new RangeError(`[computeUncertaintyFactor] "${label}" must be one of: ${VALID.join(', ')}`);
        }
    }

    const UFdb = adqMap[database_adequacy];
    const UFdr = adqMap[dose_response_adequacy];
    const UFexp = adqMap[exposure_adequacy];

    // Composite UF = product of individual factors (USEPA UF convention)
    const uncertaintyFactor = UFdb * UFdr * UFexp;

    let recommendation;
    if (uncertaintyFactor <= 3) {
        recommendation = 'Uncertainty is low. Risk characterisation is well-supported.';
    } else if (uncertaintyFactor <= 30) {
        recommendation = 'Moderate uncertainty. Consider additional data collection to refine estimates.';
    } else {
        recommendation = 'High uncertainty. Apply conservative exposure assumptions and flag to decision-makers.';
    }

    return {
        uncertaintyFactor,
        components: { database: UFdb, dose_response: UFdr, exposure: UFexp },
        recommendation,
    };
}

/**
 * Estimate the willingness-to-pay (WTP) benefit of preventing cancer cases
 * using the Value of Statistical Life (VSL) approach per USEPA guidance.
 *
 * @param {number} preventedCases    - Number of cancer cases prevented (may be fractional)
 * @param {number} VSL               - Value of a Statistical Life (USD, typically ~$7.4–11M)
 * @param {number} morbidityFraction - Fraction of total benefit attributed to morbidity (0–1)
 * @returns {{ totalBenefit_USD: number, mortalityBenefit_USD: number,
 *             morbidityBenefit_USD: number }}
 * @reference USEPA (2010). EPA-810-R-10-008. Guidelines for Economic Analysis of EPA Actions.
 */
export function computeWTPBenefitEstimate(preventedCases: number, VSL: number, morbidityFraction: number): { totalBenefit_USD: number, mortalityBenefit_USD: number, morbidityBenefit_USD: number } {
    assertFinite({ preventedCases, VSL, morbidityFraction }, 'computeWTPBenefitEstimate');
    if (preventedCases < 0) {
        throw new RangeError('[computeWTPBenefitEstimate] "preventedCases" must be ≥ 0');
    }
    if (VSL <= 0) {
        throw new RangeError('[computeWTPBenefitEstimate] "VSL" must be > 0');
    }
    assertRange('morbidityFraction', morbidityFraction, 0, 1, 'computeWTPBenefitEstimate');

    const mortalityBenefit_USD = preventedCases * VSL * (1 - morbidityFraction);
    const morbidityBenefit_USD = preventedCases * VSL * morbidityFraction;
    const totalBenefit_USD = mortalityBenefit_USD + morbidityBenefit_USD;

    return { totalBenefit_USD, mortalityBenefit_USD, morbidityBenefit_USD };
}

/**
 * Multi-objective risk tradeoff analysis using weighted sum and Pareto check.
 *
 * For each option, computes a weighted composite score across multiple risk
 * criteria. Options dominating all others on every criterion are Pareto-efficient.
 *
 * @param {string[]} options          - Option labels
 * @param {number[]} criteriaWeights  - Per-criteria weights (length = nCriteria), non-negative
 * @param {number[][]} impacts        - Matrix [nOptions × nCriteria] - lower = better
 * @returns {{ ranked: Array<{option:string, score:number, paretoEfficient:boolean}>,
 *             dominance: object }}
 * @reference Zio, E. (2009). Computational Methods for Reliability and Risk Analysis. ISBN:978-981-283-890-6
 */
export function computeRiskTradeoffAnalysis(options: string[], criteriaWeights: number[], impacts: number[][]): { ranked: Array<{option:string, score:number, paretoEfficient:boolean}>, dominance: object } {
    if (!Array.isArray(options) || options.length === 0) {
        throw new TypeError('[computeRiskTradeoffAnalysis] "options" must be a non-empty array');
    }
    if (!Array.isArray(criteriaWeights) || criteriaWeights.length === 0) {
        throw new TypeError('[computeRiskTradeoffAnalysis] "criteriaWeights" must be a non-empty array');
    }
    if (!Array.isArray(impacts) || impacts.length !== options.length) {
        throw new TypeError('[computeRiskTradeoffAnalysis] "impacts" must be a 2D array with one row per option');
    }

    const nCriteria = criteriaWeights.length;
    for (const w of criteriaWeights) {
        if (typeof w !== 'number' || !Number.isFinite(w) || w < 0) {
            throw new TypeError(
                '[computeRiskTradeoffAnalysis] all criteriaWeights must be non-negative finite numbers',
            );
        }
    }
    for (let i = 0; i < options.length; i++) {
        if (!Array.isArray(impacts[i]) || (impacts[i] as number[]).length !== nCriteria) {
            throw new TypeError(`[computeRiskTradeoffAnalysis] impacts[${i}] must have length ${nCriteria}`);
        }
        for (const v of (impacts[i] as number[])) {
            if (typeof v !== 'number' || !Number.isFinite(v)) {
                throw new TypeError('[computeRiskTradeoffAnalysis] all impact values must be finite numbers');
            }
        }
    }

    const weightSum = criteriaWeights.reduce((a, b) => a + b, 0);
    if (weightSum === 0) {
        throw new RangeError('[computeRiskTradeoffAnalysis] criteriaWeights must not all be zero');
    }
    const normW = criteriaWeights.map((w) => w / weightSum);

    // Min-max normalise impacts per criterion (lower impact = better → invert to score)
    const mins = new Array(nCriteria).fill(Infinity);
    const maxs = new Array(nCriteria).fill(-Infinity);
    for (let i = 0; i < options.length; i++) {
        for (let c = 0; c < nCriteria; c++) {
            if (((impacts[i] as number[])[c] as number) < mins[c]) mins[c] = (impacts[i] as number[])[c] as number;
            if (((impacts[i] as number[])[c] as number) > maxs[c]) maxs[c] = (impacts[i] as number[])[c] as number;
        }
    }

    const scores = options.map((option, i) => {
        let score = 0;
        for (let c = 0; c < nCriteria; c++) {
            const range = maxs[c] - mins[c];
            const normImp = range === 0 ? 0 : (((impacts[i] as number[])[c] as number) - mins[c]) / range;
            const inverted = 1 - normImp; // lower impact = higher score
            score += (normW[c] as number) * inverted;
        }
        return { option, score };
    });

    // Pareto dominance check: option A dominates B if A ≤ B on ALL criteria with at least one strict
    const paretoEfficient = options.map((_, a) => {
        for (let b = 0; b < options.length; b++) {
            if (b === a) continue;
            let bDominatesA = true;
            let strictlyBetter = false;
            for (let c = 0; c < nCriteria; c++) {
                if (((impacts[b] as number[])[c] as number) > ((impacts[a] as number[])[c] as number)) {
                    bDominatesA = false;
                    break;
                }
                if (((impacts[b] as number[])[c] as number) < ((impacts[a] as number[])[c] as number)) strictlyBetter = true;
            }
            if (bDominatesA && strictlyBetter) return false; // A is dominated
        }
        return true;
    });

    scores.sort((a, b) => b.score - a.score);
    const ranked = scores.map((item) => ({
        option: item.option,
        score: item.score,
        paretoEfficient: paretoEfficient[options.indexOf(item.option)] as boolean,
    }));

        const dominance: Record<string, string>= {};
    for (let a = 0; a < options.length; a++) {
        dominance[options[a] as string] = paretoEfficient[a] ? 'Pareto-efficient' : 'Dominated';
    }

    return { ranked, dominance };
}

/**
 * Compute cumulative environmental impact score per OEHHA CalEnviroScreen framework.
 *
 * Combines chemical hazard, noise nuisance, and socioeconomic burden into
 * a composite cumulative impact score [0, 100].
 *
 * @param {number} chemical_HQ       - Non-cancer hazard quotient (sum of HQs) ≥ 0
 * @param {number} noise_dB          - Ambient noise level (dB(A)), e.g., 40–90
 * @param {number} socioeconomic_index - Socioeconomic burden index [0, 1]
 * @returns {{ cumulativeScore: number, components: object, band: string }}
 * @reference OEHHA (2017). CalEnviroScreen 3.0. https://oehha.ca.gov/calenviroscreen
 */
export function computeCumulativeImpactScore(chemical_HQ: number, noise_dB: number, socioeconomic_index: number): { cumulativeScore: number, components: object, band: string } {
    assertFinite({ chemical_HQ, noise_dB, socioeconomic_index }, 'computeCumulativeImpactScore');
    if (chemical_HQ < 0) {
        throw new RangeError('[computeCumulativeImpactScore] "chemical_HQ" must be ≥ 0');
    }
    if (noise_dB < 20 || noise_dB > 130) {
        throw new RangeError('[computeCumulativeImpactScore] "noise_dB" must be in [20, 130]');
    }
    assertRange('socioeconomic_index', socioeconomic_index, 0, 1, 'computeCumulativeImpactScore');

    // Normalise chemical HQ: cap at 20 (beyond this, exposure is severely excessive)
    const chemNorm = clamp(chemical_HQ / 20, 0, 1);

    // Normalise noise: map [40, 90] dB(A) → [0, 1] (WHO community noise reference range)
    const noiseNorm = clamp((noise_dB - 40) / 50, 0, 1);

    // Weights: chemical 40%, noise 30%, socioeconomic 30%
    const chemComponent = 0.4 * chemNorm;
    const noiseComponent = 0.3 * noiseNorm;
    const seComponent = 0.3 * socioeconomic_index;

    const cumulativeScore = (chemComponent + noiseComponent + seComponent) * 100; // 0–100

    let band;
    if (cumulativeScore < 25) band = 'LOW';
    else if (cumulativeScore < 50) band = 'MODERATE';
    else if (cumulativeScore < 75) band = 'HIGH';
    else band = 'VERY_HIGH';

    return {
        cumulativeScore,
        components: {
            chemComponent: chemComponent * 100,
            noiseComponent: noiseComponent * 100,
            seComponent: seComponent * 100,
        },
        band,
    };
}

console.debug('[BCQ:end]', 'app/js/core/analytics/riskCommunicationAnalysis.js');

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const riskCommunicationAnalysisMeta = {
    name: 'riskCommunicationAnalysis',
    description: 'riskCommunicationAnalysis',
    category: 'analytics',
    familyTags: ['risk'],
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
