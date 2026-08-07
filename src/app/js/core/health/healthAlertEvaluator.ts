// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   HEALTH-MON-001 Phase 1+ — Specialized Alert Evaluators

   Sibling module to healthAlertEngine.js. While the engine handles
   ACGIH BEI biomarker thresholds (warningValue/criticalValue/actionValue),
   this module covers four health-aware categories that need
   categorical or polarity-aware logic instead of simple refMin/refMax:

     1. NR training expiry — countdown buckets in days
     2. Cumulative exposure — agent-specific years thresholds
     3. Vaccination status — days_since (booster) and doses_completed
     4. Psychosocial NIOSH-GJSQ — polarity per axis (high vs low = bad)

   Lógica pura — sem DOM, sem IDB, sem rede.
   Coberto por tests/health-alert-evaluator.test.mjs (~40 testes).
   ================================================================ */
// ----------------------------------------------------------------
// Public severity enumeration
// ----------------------------------------------------------------
/**
 * Severity levels ordered from least to most severe.
 * - ok: green / no action required
 * - warning: yellow / monitor
 * - critical: orange / schedule action
 * - emergency: red / act now
 * - expired: black / already past deadline (NR-only)
 *
 * @type {Readonly<Array<'ok'|'warning'|'critical'|'emergency'|'expired'>>}
 */
export const SEVERITY_LEVELS = Object.freeze(['ok', 'warning', 'critical', 'emergency', 'expired']);
// ----------------------------------------------------------------
// 1) NR training expiry
// ----------------------------------------------------------------
/**
 * NR training countdown thresholds (in days, inclusive bounds).
 * @type {Readonly<{ ok: number, warning: number, critical: number, emergency: number }>}
 */
export const NR_THRESHOLD_DAYS = Object.freeze({
    ok: 90, // > 90 days → ok
    warning: 30, // 31–90 → warning
    critical: 7, // 8–30 → critical
    emergency: 0, // 1–7 → emergency, ≤0 → expired
});
const NR_BIOMARKER_PATTERN = /^nr\d+_.*_days_left$/;
/**
 * Evaluate an NR-training reading (biomarkerType matches `nr\d+_.*_days_left`).
 *
 * @param {{ biomarkerType?: string, value?: number }} reading
 * @returns {Readonly<{ severity: 'ok'|'warning'|'critical'|'emergency'|'expired', daysLeft: number, label: string }>|null}
 */
export function evaluateNrExpiry(reading: any) {
    if (!reading || typeof reading !== 'object') return null;
    const bt = reading.biomarkerType;
    if (typeof bt !== 'string' || !NR_BIOMARKER_PATTERN.test(bt)) return null;
    const daysLeft = Number(reading.value);
    if (!Number.isFinite(daysLeft)) return null;
    /** @type {'ok'|'warning'|'critical'|'emergency'|'expired'} */
    let severity;
    if (daysLeft <= 0) severity = 'expired';
    else if (daysLeft <= 7) severity = 'emergency';
    else if (daysLeft <= 30) severity = 'critical';
    else if (daysLeft <= 90) severity = 'warning';
    else severity = 'ok';
    // Extract NR code (NR-06, NR-15…) from prefix nr06, nr15…
    const match = bt.match(/^nr(\d+)_/);
    const nrCode = match ? `NR-${match[1]}` : 'NR';
    return Object.freeze({
        severity,
        daysLeft,
        label: `${nrCode} expira em ${daysLeft} dias`,
    });
}
// ----------------------------------------------------------------
// 2) Cumulative exposure (years per agent)
// ----------------------------------------------------------------
/**
 * Agent-specific cumulative exposure thresholds (in years).
 * Each agent maps to bucket boundaries [zero, light, moderate, heavy].
 * The interpretation depends on the agent's latency / dose-response.
 *
 * References:
 *   - silica: ACGIH TLV-TWA 0.025 mg/m³ — silicotic risk ≥15y
 *   - asbestos: IARC Group 1, mesothelioma latency 20–40y
 *   - benzene (BTEX): ACGIH TLV 0.5 ppm — leukemia ≥10y
 *   - noise ≥85 dB: NIOSH NIHL irreversible ≥10y
 *   - lead: ACGIH BEI 200 µg/L — chronic ≥15y
 *
 * @type {Readonly<Record<string, Readonly<{ light: number, moderate: number, heavy: number }>>>}
 */
export const EXPOSURE_AGENT_THRESHOLDS = Object.freeze({
    silica: Object.freeze({ light: 5, moderate: 15, heavy: 15 }),
    asbestos: Object.freeze({ light: 0.5, moderate: 2, heavy: 2 }),
    btex: Object.freeze({ light: 3, moderate: 10, heavy: 10 }),
    noise: Object.freeze({ light: 5, moderate: 10, heavy: 10 }),
    lead: Object.freeze({ light: 5, moderate: 15, heavy: 15 }),
});
/**
 * Map level → severity for cumulative exposure.
 * @type {Readonly<Record<string, 'ok'|'warning'|'critical'|'emergency'>>}
 */
const EXPOSURE_LEVEL_TO_SEVERITY = Object.freeze({
    zero: 'ok',
    light: 'warning',
    moderate: 'critical',
    light_exposure: 'warning',
    low_exposure: 'warning',
    high: 'emergency',
    heavy: 'emergency',
});
/**
 * Extract agent slug from cumulative exposure biomarkerType.
 * Examples:
 *   'cumulative_exposure_silica_years'           → 'silica'
 *   'cumulative_exposure_asbestos_years'         → 'asbestos'
 *   'cumulative_exposure_btex_years'             → 'btex'
 *   'cumulative_exposure_noise_years_above_85db' → 'noise'
 *   'cumulative_exposure_lead_years'             → 'lead'
 *
 * @param {string} biomarkerType
 * @returns {string|null}
 */
function extractExposureAgent(biomarkerType: any) {
    if (typeof biomarkerType !== 'string') return null;
    const m = biomarkerType.match(/^cumulative_exposure_([a-z]+)_/);
    return m ? m[1] : null;
}
/**
 * Determine exposure level from agent-specific bands.
 * For asbestos uses 'low_exposure' (instead of 'light') and 'high'
 * (instead of 'heavy') to reflect the mesothelioma "any exposure"
 * principle in oncology literature.
 *
 * @param {string} agent
 * @param {number} years
 * @param {{ light: number, moderate: number }} thresholds
 * @returns {string}
 */
function cumulativeExposureLevel(agent: string, years: number, thresholds: { light: number; moderate: number }): string {
    if (agent === 'asbestos') {
        if (years <= 0) return 'zero';
        if (years <= thresholds.light) return 'low_exposure';
        if (years <= thresholds.moderate) return 'moderate';
        return 'high';
    }
    if (years <= 0) return 'zero';
    if (years < thresholds.light) return 'light';
    if (years < thresholds.moderate) return 'moderate';
    return 'heavy';
}

/**
 * Validate cumulative exposure input and return normalized components.
 *
 * @param {unknown} reading
 * @returns {{ agent: string, years: number }|null}
 */
function parseCumulativeExposure(
    reading: unknown,
): { agent: string; years: number; thresholds: { light: number; moderate: number } } | null {
    if (!reading || typeof reading !== 'object') return null;
    const r = reading as Record<string, unknown>;
    if (!r.confounders || (r.confounders as Record<string, unknown>).kind !== 'cumulative_exposure') return null;
    const bt = r.biomarkerType;
    if (typeof bt !== 'string') return null;
    const agent = extractExposureAgent(bt);
    if (!agent) return null;
    const thresholds = (EXPOSURE_AGENT_THRESHOLDS as Record<string, { light: number; moderate: number }>)[agent];
    if (!thresholds) return null;
    const years = Number(r.value);
    if (!Number.isFinite(years)) return null;
    return { agent, years, thresholds };
}

/**
 * Evaluate a cumulative exposure reading. Returns categorical level
 * (zero / light / moderate / heavy) based on agent-specific bands.
 *
 * @param {{ biomarkerType?: string, value?: number, confounders?: { kind?: string } }} reading
 * @returns {Readonly<{ agent: string, level: string, years: number, label: string, severity: 'ok'|'warning'|'critical'|'emergency' }>|null}
 */
export function evaluateCumulativeExposure(reading: any) {
    const parsed = parseCumulativeExposure(reading);
    if (!parsed) return null;
    const { agent, years, thresholds } = parsed;
    const level = cumulativeExposureLevel(agent, years, thresholds);
    const severity = (EXPOSURE_LEVEL_TO_SEVERITY as Record<string, 'ok' | 'warning' | 'critical' | 'emergency'>)[level] || 'ok';
    return Object.freeze({
        agent,
        level,
        years,
        label: `Exposição acumulada ${agent}: ${years} anos (${level})`,
        severity,
    });
}
// ----------------------------------------------------------------
// 3) Vaccination status
// ----------------------------------------------------------------
/**
 * Vaccination thresholds.
 *  - days_since:   tetanus/yellow_fever booster = 10y (3650d); influenza annual = 365d
 *  - doses_completed: hep_b target=3 doses; covid target>=2, boosted>=3
 *
 * @type {Readonly<{
 *   days_since: Readonly<Record<string, number>>,
 *   doses_completed: Readonly<Record<string, Readonly<{ minComplete: number, boosted?: number }>>>
 * }>}
 */
export const VACCINE_THRESHOLDS = Object.freeze({
    days_since: Object.freeze({
        tetanus_diphtheria: 3650,
        yellow_fever: 3650,
        influenza: 365,
    }),
    doses_completed: Object.freeze({
        hep_b: Object.freeze({ minComplete: 3 }),
        hepatitis_b: Object.freeze({ minComplete: 3 }),
        covid: Object.freeze({ minComplete: 2, boosted: 3 }),
    }),
});
/**
 * Status → severity map for vaccination outputs.
 * @type {Readonly<Record<string, 'ok'|'warning'|'critical'>>}
 */
const VACCINE_STATUS_TO_SEVERITY = Object.freeze({
    up_to_date: 'ok',
    complete: 'ok',
    boosted: 'ok',
    overdue: 'warning',
    incomplete: 'critical',
});
/**
 * Extract vaccine slug + pattern from biomarkerType.
 *  vaccine_tetanus_diphtheria_days_since → ('tetanus_diphtheria', 'days_since')
 *  vaccine_hepatitis_b_doses_completed   → ('hepatitis_b', 'doses_completed')
 *
 * @param {string} biomarkerType
 * @returns {{ vaccine: string, pattern: 'days_since'|'doses_completed' }|null}
 */
function extractVaccine(biomarkerType: any): { vaccine: string; pattern: VaccinePattern } | null {
    if (typeof biomarkerType !== 'string') return null;
    const dSince = biomarkerType.match(/^vaccine_(.+)_days_since$/);
    if (dSince && dSince[1]) return { vaccine: dSince[1], pattern: 'days_since' };
    const doses = biomarkerType.match(/^vaccine_(.+)_doses_completed$/);
    if (doses && doses[1]) return { vaccine: doses[1], pattern: 'doses_completed' };
    return null;
}
type VaccinePattern = 'days_since' | 'doses_completed';

/**
 * Compute vaccination status from value + pattern.
 *
 * @param {string} vaccine
 * @param {'days_since'|'doses_completed'} pattern
 * @param {number} value
 * @returns {string|null}
 */
function vaccinationStatus(vaccine: string, pattern: VaccinePattern, value: number): string | null {
    if (pattern === 'days_since') {
        const threshold = (VACCINE_THRESHOLDS.days_since as Record<string, number>)[vaccine];
        if (typeof threshold !== 'number') return null;
        return value >= threshold ? 'overdue' : 'up_to_date';
    }
    const cfg = (VACCINE_THRESHOLDS.doses_completed as Record<string, { minComplete: number; boosted?: number }>)[vaccine];
    if (!cfg) return null;
    if (typeof cfg.boosted === 'number' && value >= cfg.boosted) return 'boosted';
    if (value >= cfg.minComplete) {
        // covid minComplete=2 → up_to_date (since it has a 'boosted' tier)
        // hep_b minComplete=3 → complete (terminal target)
        return typeof cfg.boosted === 'number' ? 'up_to_date' : 'complete';
    }
    return 'incomplete';
}

/**
 * Validate vaccination input and return normalized components.
 *
 * @param {unknown} reading
 * @returns {{ vaccine: string, pattern: 'days_since'|'doses_completed', value: number }|null}
 */
function parseVaccination(reading: unknown): { vaccine: string; pattern: VaccinePattern; value: number } | null {
    if (!reading || typeof reading !== 'object') return null;
    const r = reading as Record<string, unknown>;
    if (!r.confounders || (r.confounders as Record<string, unknown>).kind !== 'vaccination') return null;
    const bt = r.biomarkerType;
    if (typeof bt !== 'string') return null;
    const parsed = extractVaccine(bt);
    if (!parsed) return null;
    const value = Number(r.value);
    if (!Number.isFinite(value)) return null;
    return { vaccine: parsed.vaccine, pattern: parsed.pattern as VaccinePattern, value };
}

/**
 * Evaluate vaccination status.
 *
 * @param {{ biomarkerType?: string, value?: number, confounders?: { kind?: string } }} reading
 * @returns {Readonly<{ vaccine: string, status: string, label: string, severity: 'ok'|'warning'|'critical' }>|null}
 */
export function evaluateVaccinationStatus(reading: any) {
    const parsed = parseVaccination(reading);
    if (!parsed) return null;
    const status = vaccinationStatus(parsed.vaccine, parsed.pattern, parsed.value);
    if (!status) return null;
    const severity = (VACCINE_STATUS_TO_SEVERITY as Record<string, 'ok' | 'warning' | 'critical'>)[status] || 'ok';
    return Object.freeze({
        vaccine: parsed.vaccine,
        status,
        label: `Vacina ${parsed.vaccine}: ${status}`,
        severity,
    });
}
// ----------------------------------------------------------------
// 4) Psychosocial NIOSH-GJSQ axes
// ----------------------------------------------------------------
/**
 * Psychosocial axis polarity + thresholds (NIOSH GJSQ 0–100 scores).
 * polarity='high' → high score is bad.
 * polarity='low'  → low score is bad.
 * problematicThreshold is the value at which the axis is fully problematic.
 *
 * @type {Readonly<Record<string, Readonly<{ polarity: 'high'|'low', problematicThreshold: number }>>>}
 */
export const PSYCHOSOCIAL_AXES = Object.freeze({
    workload: Object.freeze({ polarity: 'high', problematicThreshold: 60 }),
    control: Object.freeze({ polarity: 'low', problematicThreshold: 50 }),
    social_support: Object.freeze({ polarity: 'low', problematicThreshold: 60 }),
    role_conflict: Object.freeze({ polarity: 'high', problematicThreshold: 40 }),
    overall_stress: Object.freeze({ polarity: 'high', problematicThreshold: 50 }),
});
/** Borderline band size (points) around the threshold. */
export const PSYCHOSOCIAL_BORDERLINE_BAND = 10;
/**
 * Extract psychosocial axis from biomarkerType (niosh_gjsq_<axis>).
 *
 * @param {string} biomarkerType
 * @returns {string|null}
 */
function extractPsychosocialAxis(biomarkerType: any) {
    if (typeof biomarkerType !== 'string') return null;
    const m = biomarkerType.match(/^niosh_gjsq_(.+)$/);
    return m ? m[1] : null;
}
interface PsychosocialAxisConfig {
    polarity: 'high' | 'low';
    problematicThreshold: number;
}

/**
 * Classify a psychosocial score according to axis polarity and threshold.
 *
 * @param {'high'|'low'} polarity
 * @param {number} threshold
 * @param {number} score
 * @returns {'healthy'|'borderline'|'problematic'}
 */
function psychosocialClassification(polarity: 'high' | 'low', threshold: number, score: number): 'healthy' | 'borderline' | 'problematic' {
    const band = PSYCHOSOCIAL_BORDERLINE_BAND;
    if (polarity === 'high') {
        // High score = bad. Threshold = problematic onset.
        if (score >= threshold) return 'problematic';
        if (score >= threshold - band) return 'borderline';
        return 'healthy';
    }
    // Low score = bad. Threshold = problematic onset (below).
    if (score <= threshold) return 'problematic';
    if (score <= threshold + band) return 'borderline';
    return 'healthy';
}

/**
 * Map psychosocial classification to severity.
 *
 * @param {'healthy'|'borderline'|'problematic'} classification
 * @returns {'ok'|'warning'|'critical'}
 */
function psychosocialSeverity(classification: 'healthy' | 'borderline' | 'problematic'): 'ok' | 'warning' | 'critical' {
    if (classification === 'healthy') return 'ok';
    if (classification === 'borderline') return 'warning';
    return 'critical';
}

/**
 * Validate psychosocial input and return normalized components.
 *
 * @param {unknown} reading
 * @returns {{ axis: string, score: number, cfg: PsychosocialAxisConfig }|null}
 */
function parsePsychosocial(reading: unknown): { axis: string; score: number; cfg: PsychosocialAxisConfig } | null {
    if (!reading || typeof reading !== 'object') return null;
    const r = reading as Record<string, unknown>;
    if (!r.confounders || (r.confounders as Record<string, unknown>).kind !== 'psychosocial') return null;
    if ((r.confounders as Record<string, unknown>).instrument !== 'NIOSH-GJSQ') return null;
    const bt = r.biomarkerType;
    if (typeof bt !== 'string') return null;
    const axis = extractPsychosocialAxis(bt);
    if (!axis) return null;
    const cfg = (PSYCHOSOCIAL_AXES as Record<string, PsychosocialAxisConfig>)[axis];
    if (!cfg) return null;
    const score = Number(r.value);
    if (!Number.isFinite(score)) return null;
    return { axis, score, cfg };
}

/**
 * Evaluate a psychosocial NIOSH-GJSQ reading. Polarity-aware:
 *   - workload/role_conflict/overall_stress: HIGH score = bad
 *   - control/social_support:                LOW score  = bad
 *
 * @param {{ biomarkerType?: string, value?: number, confounders?: { kind?: string, instrument?: string } }} reading
 * @returns {Readonly<{ axis: string, score: number, classification: 'healthy'|'borderline'|'problematic', severity: 'ok'|'warning'|'critical', isProblematic: boolean }>|null}
 */
export function evaluatePsychosocialAxis(reading: any) {
    const parsed = parsePsychosocial(reading);
    if (!parsed) return null;
    const { axis, score, cfg } = parsed;
    const classification = psychosocialClassification(cfg.polarity, cfg.problematicThreshold, score);
    const severity = psychosocialSeverity(classification);
    return Object.freeze({
        axis,
        score,
        classification,
        severity,
        isProblematic: classification === 'problematic',
    });
}
// ----------------------------------------------------------------
// Dispatcher
// ----------------------------------------------------------------
/**
 * Dispatch a reading to the matching specialized evaluator.
 * Returns the first non-null result, or null if no evaluator applies.
 *
 * Dispatch precedence:
 *   1. NR expiry (biomarkerType regex)
 *   2. Cumulative exposure (confounders.kind === 'cumulative_exposure')
 *   3. Vaccination (confounders.kind === 'vaccination')
 *   4. Psychosocial (confounders.kind === 'psychosocial' && instrument === 'NIOSH-GJSQ')
 *
 * @param {{ biomarkerType?: string, value?: number, confounders?: { kind?: string, instrument?: string } }} reading
 * @returns {object|null}
 */
export function evaluateAll(reading: any) {
    if (!reading || typeof reading !== 'object') return null;
    const bt = reading.biomarkerType;
    if (typeof bt === 'string' && NR_BIOMARKER_PATTERN.test(bt)) {
        return evaluateNrExpiry(reading);
    }
    const kind = reading.confounders && reading.confounders.kind;
    if (kind === 'cumulative_exposure') return evaluateCumulativeExposure(reading);
    if (kind === 'vaccination') return evaluateVaccinationStatus(reading);
    if (kind === 'psychosocial' && reading.confounders && reading.confounders.instrument === 'NIOSH-GJSQ') {
        return evaluatePsychosocialAxis(reading);
    }
    return null;
}
//# sourceMappingURL=healthAlertEvaluator.js.map
