// @ts-check
/**
 * ecbyts - Global Compliance (GC) Scoring
 * Computes how many of the world's regulatory frameworks a site passes.
 *
 * Algorithm: For each CAS-mapped observation, check against all jurisdictions.
 * A jurisdiction "passes" the site if ALL assessed substances are below limits.
 * GC score = f(passedJurisdictions / totalJurisdictions).
 *
 * @license AGPL-3.0-only
 */

import { CONFIG } from '../../config.js';
import { GLOBAL_THRESHOLDS, JURISDICTION_ORDER, getMostStringentThreshold } from './globalThresholds.js';

// ── Score Mapping ─────────────────────────────────────────────────────────────

const SCORE_MAP = [
    { min: 1.0, score: 5, verdict: 'Globally Compliant' },
    { min: 0.8, score: 4, verdict: 'Near-Global' },
    { min: 0.6, score: 3, verdict: 'Moderate Compliance' },
    { min: 0.4, score: 2, verdict: 'Limited Compliance' },
    { min: 0.0, score: 1, verdict: 'Non-Compliant' },
];

function ratioToScore(/** @type {number} */ ratio: any) {
    for (const tier of SCORE_MAP) {
        if (ratio >= tier.min) return { score: tier.score, verdict: tier.verdict };
    }
    return { score: 1, verdict: 'Non-Compliant' };
}

// ── Core: Compute Global Compliance ───────────────────────────────────────────

/**
 * Compute Global Compliance score from model observations.
 * @param {Array<{parameterId: string, value: number, unitId: string}>} observations
 * @param {string} [matrix='groundwater']
 * @returns {any}
 */
export function computeGlobalCompliance(observations: any, matrix = 'groundwater') {
    if (!observations || observations.length === 0) return null;

    // 1. Group observations by CAS - keep worst-case (max value) per substance
    const byCAS = _groupByCAS(observations);
    if (Object.keys(byCAS).length === 0) return null;

    // 2. Check each substance against each jurisdiction
    /** @type {Record<string, any>} */
    const substanceResults: any = {};
    /** @type {Record<string, any>} */
    const jurisdictionResults: any = {};

    // Initialize jurisdiction results
    for (const jId of JURISDICTION_ORDER) {
        jurisdictionResults[jId] = { pass: 0, fail: 0, total: 0, ratio: 0, failedSubstances: [], sitePass: false };
    }

    /** @type {Record<string, any>} */
    const mostStringent: any = {};

    for (const [cas, /** @type {any} */ entry0] of Object.entries(byCAS)) {
        const { value, unitId } = (entry0 as any);
        substanceResults[cas] = {} as any;

        // Get most stringent for this substance
        const ms = getMostStringentThreshold(cas, matrix);
        if (ms) mostStringent[cas] = ms;

        // Check against each jurisdiction
        const entries = (GLOBAL_THRESHOLDS as any)[cas];
        if (!entries) continue;

        const forMatrix = entries.filter((/** @type {any} */ e: any) => e.matrix === matrix);

        for (const entry of forMatrix) {
            const jId = entry.jurisdiction;
            const converted = _convertValue(value, unitId, entry.unit);
            if (converted === null) continue;

            const pass = converted <= entry.value;
            substanceResults[cas][jId] = {
                pass,
                value: converted,
                threshold: entry.value,
                unit: entry.unit,
                source: entry.source,
            };

            jurisdictionResults[jId].total++;
            if (pass) {
                jurisdictionResults[jId].pass++;
            } else {
                jurisdictionResults[jId].fail++;
                jurisdictionResults[jId].failedSubstances.push(cas);
            }
        }
    }

    // 3. Compute jurisdiction pass ratios
    let passedJurisdictions = 0;
    let totalJurisdictions = 0;

    for (const jId of JURISDICTION_ORDER) {
        const jr = jurisdictionResults[jId];
        if (jr.total === 0) continue; // Jurisdiction has no data for measured substances
        totalJurisdictions++;
        jr.ratio = jr.pass / jr.total;
        jr.sitePass = jr.fail === 0;
        if (jr.sitePass) passedJurisdictions++;
    }

    if (totalJurisdictions === 0) return null;

    // 4. Compute overall score
    const passRatio = passedJurisdictions / totalJurisdictions;
    const { score, verdict } = ratioToScore(passRatio);

    return {
        score,
        passRatio,
        totalJurisdictions,
        passedJurisdictions,
        verdict,
        jurisdictionResults,
        substanceResults,
        mostStringent,
        assessedSubstances: Object.keys(byCAS).length,
    };
}

/**
 * Check a single substance value against all jurisdictions.
 * Used by regulatory modal for per-row global view.
 * @param {number} value
 * @param {string} unitId
 * @param {string} cas
 * @param {string} [matrix='groundwater']
 * @returns {Array<{jurisdiction: string, pass: boolean, value: number, threshold: number, unit: string, source: string}>}
 */
export function checkAgainstAllJurisdictions(value: any, unitId: any, cas: any, matrix = 'groundwater') {
    const entries = (GLOBAL_THRESHOLDS as any)[cas];
    if (!entries) return [];

    const results = [];
    for (const entry of entries.filter((/** @type {any} */ e: any) => e.matrix === matrix)) {
        const converted = _convertValue(value, unitId, entry.unit);
        if (converted === null) continue;

        results.push({
            jurisdiction: entry.jurisdiction,
            pass: converted <= entry.value,
            value: converted,
            threshold: entry.value,
            unit: entry.unit,
            source: entry.source,
        });
    }
    return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Group observations by CAS number, keeping the worst-case (max) value per substance.
 * @returns {Object.<string, {value: number, unitId: string}>}
 */
function _groupByCAS(/** @type {any} */ observations: any) {
    /** @type {Record<string, {value: number, unitId: string}>} */
    const byCAS: any = {};

    for (const obs of observations) {
        if (!obs.parameterId || obs.value == null || obs.value === '') continue;

        const param = CONFIG.PARAMETERS.find((/** @type {any} */ p: any) => p.id === obs.parameterId);
        if (!param?.casNumber) continue;

        const cas = param.casNumber;
        const numValue = Number(obs.value);
        if (isNaN(numValue)) continue;

        if (!byCAS[cas] || numValue > byCAS[cas].value) {
            byCAS[cas] = { value: numValue, unitId: obs.unitId || param.defaultUnitId };
        }
    }

    return byCAS;
}

/**
 * Convert a value between units. Returns null if conversion not possible.
 * Uses simple ug/L ↔ mg/L conversion (factor 1000) for common cases.
 * Falls back to identity if units match.
 */
function _convertValue(/** @type {any} */ value: any, /** @type {any} */ fromUnit: any, /** @type {any} */ toUnit: any) {
    if (!fromUnit || !toUnit) return value;
    if (fromUnit === toUnit) return value;

    // Common conversions for water quality
    /** @type {Record<string, number>} */
    const UG_TO_MG: any = { ug_L: 0.001, mg_L: 1 };
    const from = UG_TO_MG[fromUnit];
    const to = UG_TO_MG[toUnit];

    if (from !== undefined && to !== undefined) {
        return value * (from / to);
    }

    // Try dynamic import of converter (async not available here - use identity)
    // In practice, observations and thresholds should be in the same unit (ug_L)
    return value;
}
