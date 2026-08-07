// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

const SEVERITY_RANK = Object.freeze({
    hard_block: 4,
    block: 3,
    warn: 2,
    allow: 1,
});

// Internal helper used by the legacy evaluateUncertaintyDecisionRules engine
function _legacyEvalRule(rule: any, signal: any): any {
    const threshold = Number(rule?.threshold);
    const value = Number(signal?.[rule?.metric]);
    if (!Number.isFinite(threshold) || !Number.isFinite(value)) return 'allow';
    const op = String(rule?.operator || '>=');
    if (op === '>=') return value >= threshold ? rule.severity : 'allow';
    if (op === '>') return value > threshold ? rule.severity : 'allow';
    if (op === '<=') return value <= threshold ? rule.severity : 'allow';
    if (op === '<') return value < threshold ? rule.severity : 'allow';
    return value >= threshold ? rule.severity : 'allow';
}

export function evaluateUncertaintyDecisionRules(
    rules: any[] = [],
    signal: any = {},
    opts: any = {},
): { action: string; reason?: string; winnerRuleId: string | null; telemetryEvent: string } {
    const mode = String(opts?.runType || 'exploratory').toLowerCase();
    const missingRequired = (rules || []).some(
        (r: any) => r?.required === true && !Number.isFinite(Number(signal?.[r?.metric])),
    );
    if (mode === 'compliance' && missingRequired) {
        return {
            action: 'hard_block',
            reason: 'missing_required_input',
            winnerRuleId: null,
            telemetryEvent: 'decision_rule_hard_block_missing_input',
        };
    }

    const evaluated = (rules || []).map((r: any) => ({
        id: String(r?.id || ''),
        action: _legacyEvalRule(r, signal),
    }));

    const winner = evaluated.sort((a: any, b: any) => {
        const ranks = SEVERITY_RANK as unknown as Record<string, number>;
        const rankDiff = (ranks[b.action] || 0) - (ranks[a.action] || 0);
        if (rankDiff !== 0) return rankDiff;
        return String(a.id).localeCompare(String(b.id));
    })[0] || { id: null, action: 'allow' };

    return {
        action: winner.action || 'allow',
        winnerRuleId: winner.id || null,
        telemetryEvent: 'decision_rule_evaluated',
    };
}

// ---------------------------------------------------------------------------
// Probabilistic decision helpers (UNC-DECISION-001)
// Reference: EPA Unified Guidance 2009, ASME V&V risk-informed principles
// ---------------------------------------------------------------------------

/**
 * Approximate the probability that a normally-distributed measurement exceeds
 * a threshold, using the standard-normal CDF via a rational approximation
 * (Abramowitz & Stegun 26.2.17, max |error| < 7.5e-8).
 *
 * @param {number} value  - Point estimate
 * @param {number} uAbs   - Absolute expanded uncertainty (k=2, ~95% CI)
 * @param {number} threshold
 * @returns {number} Probability in [0, 1]
 */
function probExceedance(value: number, uAbs: number, threshold: number): number {
    // Standard deviation: u / k; default k=2
    const sigma = uAbs / 2;
    if (!Number.isFinite(sigma) || sigma <= 0) {
        return value > threshold ? 1 : value === threshold ? 0.5 : 0;
    }
    const z = (threshold - value) / sigma;
    return 1 - standardNormalCDF(z);
}

/**
 * Standard normal CDF using rational approximation.
 * P(Z <= z) where Z ~ N(0,1).
 *
 * @param {number} z
 * @returns {number}
 */
function standardNormalCDF(z: number): number {
    const absZ = Math.abs(z);
    // Constants for A&S 26.2.17
    const p = 0.2316419;
    const b1 = 0.31938153;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;
    const t = 1 / (1 + p * absZ);
    const poly = t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
    const phi = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * absZ * absZ);
    const cdf = 1 - phi * poly;
    return z >= 0 ? cdf : 1 - cdf;
}

/**
 * Make a compliance decision for a single measurement given its uncertainty.
 *
 * Decision logic (EPA Unified Guidance 2009 §2.4):
 * - If P(value > threshold) > confidence  => 'exceed'
 * - If P(value > threshold) < (1 - confidence) => 'comply'
 * - Otherwise => 'inconclusive'
 *
 * @param {number} value          - Measured value (point estimate)
 * @param {number} uncertainty    - Absolute expanded uncertainty (k=2 convention)
 * @param {number} threshold      - Regulatory or action threshold
 * @param {{ confidence?: number, k?: number }} [opts]
 *   - confidence: probability confidence level for decision (default 0.95)
 *   - k: coverage factor used for the supplied uncertainty (default 2)
 * @returns {{ decision: 'comply'|'exceed'|'inconclusive', probability: number, margin: number }}
 */
export function makeDecisionWithUncertainty(
    value: number,
    uncertainty: number,
    threshold: number,
    opts: { confidence?: number; k?: number } = {},
): { decision: 'comply' | 'exceed' | 'inconclusive'; probability: number; margin: number } {
    const v = Number(value);
    const u = Number(uncertainty);
    const thr = Number(threshold);
    const confidence = Number.isFinite(Number(opts.confidence)) ? Number(opts.confidence) : 0.95;
    const k = Number.isFinite(Number(opts.k)) && Number(opts.k) > 0 ? Number(opts.k) : 2;

    if (!Number.isFinite(v) || !Number.isFinite(thr)) {
        return { decision: 'inconclusive', probability: NaN, margin: NaN };
    }

    const uAbs = Number.isFinite(u) && u >= 0 ? u * (2 / k) : 0;
    const pExceed = probExceedance(v, uAbs, thr);
    const margin = thr - v;

    let decision: 'comply' | 'exceed' | 'inconclusive';
    if (pExceed > confidence) {
        decision = 'exceed';
    } else if (pExceed < 1 - confidence) {
        decision = 'comply';
    } else {
        decision = 'inconclusive';
    }

    return { decision, probability: pExceed, margin };
}

/**
 * Classify a measurement against a set of thresholds using confidence intervals.
 *
 * Returns the label of the first threshold whose lower bound is exceeded by
 * the measurement's upper confidence bound, or 'below_all' if none are exceeded.
 *
 * @param {number} value       - Point estimate
 * @param {number} lowerBound  - Lower bound of confidence interval (e.g. value - k*u)
 * @param {number} upperBound  - Upper bound of confidence interval (e.g. value + k*u)
 * @param {Array<{ label: string, value: number }>} thresholds
 *   Sorted ascending by threshold value.
 * @returns {{ label: string, overlaps: string[], clearlyBelow: string[], clearlyAbove: string[] }}
 */
export function classifyWithInterval(
    value: number,
    lowerBound: number,
    upperBound: number,
    thresholds: Array<{ label: string; value: number }>,
): { label: string; overlaps: string[]; clearlyBelow: string[]; clearlyAbove: string[] } {
    const lb = Number(lowerBound);
    const ub = Number(upperBound);
    const rows = Array.isArray(thresholds) ? thresholds.filter((t) => Number.isFinite(Number(t?.value))) : [];
    rows.sort((a, b) => Number(a.value) - Number(b.value));

    const overlaps: string[] = [];
    const clearlyBelow: string[] = [];
    const clearlyAbove: string[] = [];

    for (const t of rows) {
        const tv = Number(t.value);
        if (ub < tv) {
            // entire CI is below threshold
            clearlyBelow.push(t.label);
        } else if (lb > tv) {
            // entire CI is above threshold
            clearlyAbove.push(t.label);
        } else {
            // CI straddles threshold
            overlaps.push(t.label);
        }
    }

    // Primary label: highest threshold clearly below the lower CI bound
    let label = 'below_all';
    for (let i = rows.length - 1; i >= 0; i--) {
        if (lb > Number(rows[i]!.value)) {
            label = rows[i]!.label;
            break;
        }
    }
    if (label === 'below_all' && overlaps.length > 0) label = 'overlap_' + overlaps[0];

    return { label, overlaps, clearlyBelow, clearlyAbove };
}

/**
 * Run makeDecisionWithUncertainty on an array of measurements against a
 * single threshold, returning per-measurement decisions plus summary stats.
 *
 * @param {Array<{ value: number, uncertainty: number, id?: string }>} measurements
 * @param {number} threshold
 * @param {{ confidence?: number, k?: number }} [options]
 * @returns {Array<{ id: any, value: number, uncertainty: number, decision: string, probability: number, margin: number }>}
 */
export function batchDecisions(
    measurements: any,
    threshold: any,
    options: any = {},
): Array<{ id: any; value: number; uncertainty: number; decision: string; probability: number; margin: number }> {
    if (!Array.isArray(measurements)) return [];
    return measurements.map((m, idx) => {
        const result = makeDecisionWithUncertainty(m?.value, m?.uncertainty, threshold, options);
        return {
            id: m?.id !== undefined ? m.id : idx,
            value: Number(m?.value),
            uncertainty: Number(m?.uncertainty),
            ...result,
        };
    });
}

/**
 * Summarise an array of decision results (from batchDecisions or manual calls).
 *
 * @param {Array<{ decision: string, probability?: number }>} decisions
 * @returns {{ complying: number, exceeding: number, inconclusive: number, total: number, riskScore: number }}
 *   riskScore: weighted probability score in [0, 1] - higher means higher collective
 *   exceedance risk. Computed as mean(probability) over all decisions.
 */
export function decisionSummary(decisions: Array<{ decision: string; probability?: number }>): {
    complying: number;
    exceeding: number;
    inconclusive: number;
    total: number;
    riskScore: number;
} {
    if (!Array.isArray(decisions) || decisions.length === 0) {
        return { complying: 0, exceeding: 0, inconclusive: 0, total: 0, riskScore: 0 };
    }
    let complying = 0;
    let exceeding = 0;
    let inconclusive = 0;
    let probSum = 0;
    let probCount = 0;

    for (const d of decisions) {
        const dec = String(d?.decision || '');
        if (dec === 'comply') complying++;
        else if (dec === 'exceed') exceeding++;
        else inconclusive++;

        const p = Number(d?.probability);
        if (Number.isFinite(p)) {
            probSum += p;
            probCount++;
        }
    }

    const riskScore = probCount > 0 ? probSum / probCount : 0;
    return { complying, exceeding, inconclusive, total: decisions.length, riskScore };
}

// ---------------------------------------------------------------------------
// UNC-DECISION-001 - Deterministic rule evaluation engine
// Reference: EPA Unified Guidance 2009; ASME V&V 20-2009 risk-informed principles
// ---------------------------------------------------------------------------

/**
 * Action priority map - higher number wins conflict resolution.
 * @type {Readonly<{hard_block: number, block: number, warn: number, allow: number}>}
 */
export const ACTION_PRIORITY: Readonly<{ hard_block: number; block: number; warn: number; allow: number }> =
    Object.freeze({ hard_block: 3, block: 2, warn: 1, allow: 0 });

const VALID_ACTIONS = new Set(['allow', 'warn', 'block', 'hard_block']);
const VALID_INTERVAL_MODES = new Set(['overlap', 'point_only']);
const VALID_SCOPES = new Set(['compliance', 'exploratory']);

/**
 * Validate a rule object against the frozen rule contract.
 *
 * @param {any} rule
 * @returns {{ valid: boolean, errors: readonly string[] }}
 */
export function validateRule(rule: any): { valid: boolean; errors: readonly string[] } {
    const errors: string[] = [];
    if (!rule || typeof rule !== 'object') {
        return Object.freeze({ valid: false, errors: Object.freeze(['rule must be a non-null object']) });
    }
    if (typeof rule.rule_id !== 'string' || rule.rule_id.trim() === '') {
        errors.push('missing or empty field: rule_id');
    }
    const sev = Number(rule.severity);
    if (!Number.isFinite(sev) || sev < 0 || sev > 100) {
        errors.push('severity must be a number in [0, 100]');
    }
    if (!VALID_SCOPES.has(rule.scope)) {
        errors.push('scope must be "compliance" or "exploratory"');
    }
    const when = rule.when;
    if (!when || typeof when !== 'object') {
        errors.push('missing field: when');
    } else {
        if (typeof when.metric !== 'string' || when.metric.trim() === '') {
            errors.push('missing or empty field: when.metric');
        }
        if (!Number.isFinite(Number(when.threshold))) {
            errors.push('when.threshold must be a finite number');
        }
        if (!VALID_INTERVAL_MODES.has(when.interval_mode)) {
            errors.push('when.interval_mode must be "overlap" or "point_only"');
        }
    }
    if (!VALID_ACTIONS.has(rule.action)) {
        errors.push('action must be one of: allow, warn, block, hard_block');
    }
    if (typeof rule.message !== 'string' || rule.message.trim() === '') {
        errors.push('missing or empty field: message');
    }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

/**
 * Evaluate a single rule against a context object.
 *
 * @param {any} rule
 * @param {any} context - { metric, value, ci95Lower, ci95Upper, uncertaintyClass, scope }
 * @returns {{ matched: boolean, action: string, rationale: string }}
 */
export function evaluateRule(rule: any, context: any): { matched: boolean; action: string; rationale: string } {
    // Context metric mismatch
    if (!context || context.metric !== (rule && rule.when && rule.when.metric)) {
        return Object.freeze({ matched: false, action: 'allow', rationale: 'context metric mismatch' });
    }

    const threshold = Number(rule.when.threshold);
    const intervalMode = rule.when.interval_mode;

    let thresholdInRange;
    if (intervalMode === 'point_only') {
        thresholdInRange = Number(context.value) <= threshold;
    } else {
        // overlap: threshold is within [ci95Lower, ci95Upper]
        const lo = Number(context.ci95Lower);
        const hi = Number(context.ci95Upper);
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
            // fall back to point comparison when CI is not available
            thresholdInRange = Number(context.value) <= threshold;
        } else {
            thresholdInRange = lo <= threshold && threshold <= hi;
        }
    }

    if (!thresholdInRange) {
        return Object.freeze({ matched: false, action: 'allow', rationale: 'threshold not in range' });
    }

    // Apply optional `and` conditions
    const andCond = rule.and;
    if (andCond) {
        if (Array.isArray(andCond.uncertainty_class_in) && andCond.uncertainty_class_in.length > 0) {
            if (!andCond.uncertainty_class_in.includes(context.uncertaintyClass)) {
                return Object.freeze({
                    matched: false,
                    action: 'allow',
                    rationale: `uncertainty_class_in filter not satisfied: got "${context.uncertaintyClass}"`,
                });
            }
        }
        if (typeof andCond.scope_is === 'string') {
            if (context.scope !== andCond.scope_is) {
                return Object.freeze({
                    matched: false,
                    action: 'allow',
                    rationale: `scope_is filter not satisfied: got "${context.scope}"`,
                });
            }
        }
    }

    return Object.freeze({
        matched: true,
        action: rule.action,
        rationale: `rule ${rule.rule_id} matched (threshold ${threshold}, mode ${intervalMode})`,
    });
}

/**
 * Evaluate a set of rules against a context, returning the winning action.
 *
 * Action priority: hard_block > block > warn > allow
 * Tie-breaking by highest severity; ties by lexical order of rule_id (lower = wins).
 *
 * @param {any[]} rules
 * @param {any} context
 * @returns {{ action: string, rule_id: string|null, message: string, rationale: string, trace: any }}
 */
export function evaluateRuleSet(
    rules: any[],
    context: any,
): { action: string; rule_id: string | null; message: string; rationale: string; trace: any } {
    const empty = Object.freeze({
        action: 'allow',
        rule_id: null,
        message: 'no rules',
        rationale: 'empty ruleset',
        trace: Object.freeze([]),
    });

    if (!Array.isArray(rules) || rules.length === 0) return empty;

    // Hard-block for missing required fields in compliance scope
    if (context && context.scope === 'compliance') {
        if (
            !Number.isFinite(Number(context.value)) ||
            (!Number.isFinite(Number(context.ci95Lower)) && context.ci95Lower !== undefined)
        ) {
            // value is required; if ci95 fields are present they must be finite
        }
        if (!Number.isFinite(Number(context.value))) {
            return Object.freeze({
                action: 'hard_block',
                rule_id: null,
                message: 'missing required compliance fields',
                rationale: 'compliance scope requires valid value',
                trace: Object.freeze([]),
            });
        }
    }

    // Filter rules to those matching this context's metric
    const metricRules = rules.filter((r) => r && r.when && r.when.metric === (context && context.metric));

    if (metricRules.length === 0) {
        return empty;
    }

    // Evaluate each rule, collect trace
    const trace = metricRules.map((r) => {
        const result = evaluateRule(r, context);
        return Object.freeze({
            rule_id: r.rule_id,
            severity: r.severity,
            ...result,
        });
    });

    // Keep only matched rules
    const matched = trace.filter((t) => t.matched);

    if (matched.length === 0) {
        return Object.freeze({
            action: 'allow',
            rule_id: null,
            message: 'no rules matched',
            rationale: 'all rules evaluated, none matched',
            trace: Object.freeze(trace),
        });
    }

    // Sort: highest action priority first, then highest severity, then lexical rule_id
    const sorted = [...matched].sort((a, b) => {
        const aPrio = (ACTION_PRIORITY as Record<string, number>)[a.action] ?? 0;
        const bPrio = (ACTION_PRIORITY as Record<string, number>)[b.action] ?? 0;
        if (bPrio !== aPrio) return bPrio - aPrio;
        const aSev = Number(a.severity) || 0;
        const bSev = Number(b.severity) || 0;
        if (bSev !== aSev) return bSev - aSev;
        return String(a.rule_id).localeCompare(String(b.rule_id));
    });

    const winner = sorted[0]!;
    // Retrieve original rule for message
    const winnerRule = metricRules.find((r) => r.rule_id === winner.rule_id);

    return Object.freeze({
        action: winner.action,
        rule_id: winner.rule_id,
        message: (winnerRule && winnerRule.message) || winner.rationale,
        rationale: winner.rationale,
        trace: Object.freeze(trace),
    });
}

/**
 * Wrap evaluateRuleSet with a timestamp for audit trail.
 *
 * @param {any[]} rules
 * @param {any} context
 * @returns {{ timestamp: number, context: any, trace: any, winner: any }}
 */
export function traceDecision(
    rules: any[],
    context: any,
): { timestamp: number; context: any; trace: any; winner: any } {
    const result = evaluateRuleSet(rules, context);
    return Object.freeze({
        timestamp: Date.now(),
        context: Object.freeze({ ...context }),
        trace: result,
        winner: Object.freeze({
            action: result.action,
            rule_id: result.rule_id,
            message: result.message,
        }),
    });
}
