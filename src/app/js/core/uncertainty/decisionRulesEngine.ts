// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   DECISION RULES ENGINE — SPEC_DECISION_RULES_WITH_UNCERTAINTY

   Pure helpers para avaliação determinística de regras:
   - Suporta actions: allow / warn / block / hard_block
   - Interval overlap contra threshold (intervalo com incerteza vs linha)
   - Gate por uncertainty_class (grey/red)
   - Compliance vs exploratory runType (missing required → hard_block)
   - Decision record com inputs, policyVersion, rationale (auditoria)

   Determinístico: ordem hard_block > block > warn > allow,
   ties por severity DESC, ties restantes por rule_id ASC lexical.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §Deterministic Evaluation Semantics
// ──────────────────────────────────────────────────────────────────────

export const DECISION_ACTIONS = Object.freeze(['allow', 'warn', 'block', 'hard_block']);

export const ACTION_RANK = Object.freeze({
    hard_block: 4,
    block: 3,
    warn: 2,
    allow: 1,
});

export const RUN_TYPES = Object.freeze(['exploratory', 'compliance']);

export const UNCERTAINTY_CLASSES = Object.freeze(['green', 'yellow', 'orange', 'grey', 'red']);

export const INTERVAL_MODES = Object.freeze(['overlap', 'above', 'below', 'point']);

export const DEFAULT_POLICY_VERSION = '1.0.0';

// ──────────────────────────────────────────────────────────────────────
// Helpers internos
// ──────────────────────────────────────────────────────────────────────

/**
 * Extrai intervalo [lo, hi] de um signal+metric.
 * Aceita: { metric: N, metric_lo: L, metric_hi: H } ou { metric_ci: [L,H] }.
 * Fallback: ponto (lo=hi=value).
 *
 * @param {any} signal
 * @param {string} metric
 * @returns {{ lo: number, hi: number, point: number }|null}
 */
export function extractInterval(
    signal: any,
    metric: string,
): { lo: number; hi: number; point: number } | null {
    if (!signal || typeof signal !== 'object' || !metric) return null;
    const point = Number(signal[metric]);
    const lo = Number(signal[`${metric}_lo`]);
    const hi = Number(signal[`${metric}_hi`]);
    const ci = Array.isArray(signal[`${metric}_ci`]) ? signal[`${metric}_ci`] : null;

    if (ci && ci.length === 2 && Number.isFinite(Number(ci[0])) && Number.isFinite(Number(ci[1]))) {
        return { lo: Math.min(Number(ci[0]), Number(ci[1])), hi: Math.max(Number(ci[0]), Number(ci[1])), point };
    }
    if (Number.isFinite(lo) && Number.isFinite(hi)) {
        return { lo: Math.min(lo, hi), hi: Math.max(lo, hi), point };
    }
    if (Number.isFinite(point)) return { lo: point, hi: point, point };
    return null;
}

/**
 * @param {any} interval
 * @param {number} threshold
 * @param {string} mode
 * @returns {boolean}
 */
export function intervalMatches(interval: any, threshold: number, mode = 'overlap'): boolean {
    if (!interval || !Number.isFinite(threshold)) return false;
    const m = String(mode || 'overlap').toLowerCase();
    if (m === 'overlap') return interval.lo <= threshold && interval.hi >= threshold;
    if (m === 'above') return interval.lo > threshold;
    if (m === 'below') return interval.hi < threshold;
    if (m === 'point') return interval.point >= threshold;
    return false;
}

/**
 * @param {any} rule
 * @returns {boolean}
 */
export function isValidRule(rule: any): boolean {
    if (!rule || typeof rule !== 'object') return false;
    if (!rule.rule_id || typeof rule.rule_id !== 'string') return false;
    if (!DECISION_ACTIONS.includes(rule.action)) return false;
    const sev = Number(rule.severity);
    if (!Number.isFinite(sev)) return false;
    if (!rule.when || typeof rule.when !== 'object') return false;
    if (!rule.when.metric) return false;
    return true;
}

// ──────────────────────────────────────────────────────────────────────
// Avaliação de regra individual
// ──────────────────────────────────────────────────────────────────────

/**
 * Avalia uma regra contra um signal. Retorna a ação resultante
 * (rule.action se match, 'allow' caso contrário).
 *
 * @param {any} rule
 * @param {any} signal
 * @returns {{ matched: boolean, action: string, reason: string|null }}
 */
export function evaluateSingleRule(
    rule: any,
    signal: any,
): { matched: boolean; action: string; reason: string | null } {
    if (!isValidRule(rule)) return { matched: false, action: 'allow', reason: 'invalid_rule' };
    const when = rule.when;
    const interval = extractInterval(signal, when.metric);
    if (!interval) return { matched: false, action: 'allow', reason: 'no_signal' };

    const threshold = Number(when.threshold);
    if (!Number.isFinite(threshold)) return { matched: false, action: 'allow', reason: 'no_threshold' };

    const thresholdMatch = intervalMatches(interval, threshold, when.interval_mode);
    if (!thresholdMatch) return { matched: false, action: 'allow', reason: 'no_threshold_match' };

    // Gate adicional: uncertainty_class_in
    const and = rule.and;
    if (and && Array.isArray(and.uncertainty_class_in)) {
        const cls = String(signal?.uncertainty_class || '').toLowerCase();
        if (!and.uncertainty_class_in.includes(cls)) {
            return { matched: false, action: 'allow', reason: 'uncertainty_class_mismatch' };
        }
    }

    // Gate adicional: scope compliance-only
    if (rule.scope === 'compliance' && String(signal?.run_type || '').toLowerCase() !== 'compliance') {
        return { matched: false, action: 'allow', reason: 'scope_not_compliance' };
    }

    return { matched: true, action: rule.action, reason: 'matched' };
}

// ──────────────────────────────────────────────────────────────────────
// Ordenação determinística §Tie resolution
// ──────────────────────────────────────────────────────────────────────

/**
 * Compara dois resultados evaluated para winner determinístico:
 * 1. action rank DESC (hard_block > block > warn > allow)
 * 2. severity DESC
 * 3. rule_id ASC (lexical)
 *
 * @param {any} a
 * @param {any} b
 * @returns {number}
 */
export function compareResults(a: any, b: any): number {
    const rankDiff = ((ACTION_RANK as any)[b.action] || 0) - ((ACTION_RANK as any)[a.action] || 0);
    if (rankDiff !== 0) return rankDiff;
    const sevDiff = (Number(b.severity) || 0) - (Number(a.severity) || 0);
    if (sevDiff !== 0) return sevDiff;
    return String(a.rule_id || '').localeCompare(String(b.rule_id || ''));
}

// ──────────────────────────────────────────────────────────────────────
// Detecção de missing required em compliance
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {Array<any>} rules
 * @param {any} signal
 * @returns {{ missing: string[], hardBlocked: boolean }}
 */
export function detectMissingRequired(
    rules: any[],
    signal: any,
): { missing: string[]; hardBlocked: boolean } {
    const missing: string[] = [];
    if (!Array.isArray(rules) || !signal) return { missing, hardBlocked: false };
    for (const r of rules) {
        if (r?.required !== true) continue;
        const metric = r?.when?.metric;
        if (!metric) continue;
        const interval = extractInterval(signal, metric);
        if (!interval) missing.push(metric);
    }
    return { missing, hardBlocked: missing.length > 0 };
}

// ──────────────────────────────────────────────────────────────────────
// Engine principal
// ──────────────────────────────────────────────────────────────────────

/**
 * Avalia conjunto de regras contra signal em modo compliance ou exploratory.
 * Retorna decisão determinística + rationale para auditoria.
 *
 * @param {Array<any>} rules
 * @param {any} signal
 * @param {any} [opts]
 * @returns {any} decisionRecord
 */
export function evaluateRules(rules: any[], signal: any, opts: any = {}): any {
    const runType = String(opts?.runType || signal?.run_type || 'exploratory').toLowerCase();
    const policyVersion = String(opts?.policyVersion || DEFAULT_POLICY_VERSION);
    const ts = opts?.nowMs ? new Date(opts.nowMs).toISOString() : new Date().toISOString();

    if (!Array.isArray(rules) || rules.length === 0) {
        return {
            action: 'allow',
            winner: null,
            matchedRules: [],
            runType,
            policyVersion,
            rationale: 'no_rules',
            evaluatedAt: ts,
        };
    }

    // Missing required em compliance → hard_block imediato
    if (runType === 'compliance') {
        const { missing, hardBlocked } = detectMissingRequired(rules, signal);
        if (hardBlocked) {
            return {
                action: 'hard_block',
                winner: null,
                matchedRules: [],
                runType,
                policyVersion,
                rationale: 'missing_required_input',
                missingInputs: missing,
                evaluatedAt: ts,
            };
        }
    }

    // Avaliar todas as regras válidas
    const evaluated = rules.filter(isValidRule).map((rule) => {
        const result = evaluateSingleRule(rule, signal);
        return {
            rule_id: rule.rule_id,
            severity: Number(rule.severity),
            action: result.matched ? rule.action : 'allow',
            matched: result.matched,
            reason: result.reason,
            message: rule.message || null,
        };
    });

    const matched = evaluated.filter((e) => e.matched);
    if (matched.length === 0) {
        return {
            action: 'allow',
            winner: null,
            matchedRules: [],
            runType,
            policyVersion,
            rationale: 'no_match',
            evaluatedAt: ts,
        };
    }

    const sorted = matched.slice().sort(compareResults);
    const winner = sorted[0] as (typeof matched)[number];

    return {
        action: winner.action,
        winner: { rule_id: winner.rule_id, severity: winner.severity, message: winner.message },
        matchedRules: sorted.map((m) => ({ rule_id: m.rule_id, action: m.action, severity: m.severity })),
        runType,
        policyVersion,
        rationale: winner.message || `rule:${winner.rule_id}`,
        evaluatedAt: ts,
    };
}

// ──────────────────────────────────────────────────────────────────────
// ALARP / Precautionary / Cost-Benefit frameworks - P1-53
// Academic references:
// - HSE R2P2 (2001) - ALARP doctrine
// - UNESCO (2005) "The precautionary principle"
// - HM Treasury Green Book (2003) - NPV/BCR
// - ISO 31010:2019 - Risk assessment techniques
// ──────────────────────────────────────────────────────────────────────

/**
 * Supported decision frameworks.
 * @type {Readonly<{ALARP:string, PRECAUTIONARY:string, COST_BENEFIT:string}>}
 */
export const DECISION_FRAMEWORKS = Object.freeze({
    ALARP: 'alarp',
    PRECAUTIONARY: 'precautionary',
    COST_BENEFIT: 'cost_benefit',
});

/**
 * ALARP risk region classifications.
 * @type {Readonly<{BROADLY_ACCEPTABLE:string, ALARP_REGION:string, INTOLERABLE:string}>}
 */
export const RISK_REGIONS = Object.freeze({
    BROADLY_ACCEPTABLE: 'broadly_acceptable',
    ALARP_REGION: 'alarp_region',
    INTOLERABLE: 'intolerable',
});

/**
 * Default ALARP thresholds on a normalised [0, 1] risk scale.
 * lowerBound: below this → broadly acceptable.
 * upperBound: above this → intolerable.
 * Source: HSE R2P2 §130 - typical factor-of-10 bands translated to 0–1.
 * @type {Readonly<{lowerBound:number, upperBound:number}>}
 */
export const ALARP_THRESHOLDS = Object.freeze({
    lowerBound: 0.1,
    upperBound: 0.7,
});

/**
 * Classify a normalised risk score into an ALARP risk region.
 *
 * @param {number} riskScore - Normalised risk value in [0, 1].
 * @returns {string} One of RISK_REGIONS values.
 */
export function classifyAlarpRegion(riskScore: number): string {
    if (!Number.isFinite(riskScore)) return RISK_REGIONS.ALARP_REGION;
    if (riskScore < ALARP_THRESHOLDS.lowerBound) return RISK_REGIONS.BROADLY_ACCEPTABLE;
    if (riskScore > ALARP_THRESHOLDS.upperBound) return RISK_REGIONS.INTOLERABLE;
    return RISK_REGIONS.ALARP_REGION;
}

/**
 * Apply the precautionary principle to an array of uncertainty samples.
 *
 * exceedanceProbability = fraction of samples exceeding threshold.
 * Decision: act if exceedanceProbability > 0.05 (UNESCO 2005 §3).
 *
 * @param {number[]} uncertaintySamples
 * @param {number}   threshold
 * @returns {{decision:'act'|'defer', exceedanceProbability:number, threshold:number, rationale:string}}
 */
export function applyPrecautionaryPrinciple(
    uncertaintySamples: number[],
    threshold: number,
): { decision: 'act' | 'defer'; exceedanceProbability: number; threshold: number; rationale: string } {
    const samples = Array.isArray(uncertaintySamples) ? uncertaintySamples : [];
    const n = samples.length;

    if (n === 0 || !Number.isFinite(threshold)) {
        return {
            decision: 'act',
            exceedanceProbability: Number.isFinite(threshold) ? 1 : NaN,
            threshold,
            rationale:
                n === 0
                    ? 'No uncertainty samples provided; acting precautionarily.'
                    : 'Invalid threshold; acting precautionarily.',
        };
    }

    const exceeding = samples.filter((s) => Number.isFinite(s) && s > threshold).length;
    const exceedanceProbability = exceeding / n;
    const decision: 'act' | 'defer' = exceedanceProbability > 0.05 ? 'act' : 'defer';
    const pct = (exceedanceProbability * 100).toFixed(1);
    const rationale =
        decision === 'act'
            ? `Exceedance probability ${pct}% > 5% — precautionary action warranted.`
            : `Exceedance probability ${pct}% ≤ 5% — threshold exceedance unlikely, deferral acceptable.`;

    return { decision, exceedanceProbability, threshold, rationale };
}

/**
 * Compute Net Present Value and Benefit-Cost Ratio over a multi-year stream.
 *
 * NPV = Σ_{t=1}^{years} (benefit_t − cost_t) / (1+r)^t
 * BCR = PV(benefits) / PV(costs)
 * proceed if BCR > 1.2, reject if BCR < 0.8, else review.
 *
 * Reference: HM Treasury Green Book (2003) §5 eq. 5.1.
 *
 * @param {number[]} costs
 * @param {number[]} benefits
 * @param {number}   discountRate
 * @param {number}   years
 * @returns {{npv:number, bcr:number, recommendation:'proceed'|'reject'|'review'}}
 */
export function computeCostBenefit(
    costs: number[],
    benefits: number[],
    discountRate: number,
    years: number,
): { npv: number; bcr: number; recommendation: 'proceed' | 'reject' | 'review' } {
    const r = Number.isFinite(discountRate) && discountRate >= 0 ? discountRate : 0.07;
    const n = Number.isInteger(years) && years > 0 ? years : Array.isArray(costs) ? costs.length : 0;

    let pvBenefits = 0;
    let pvCosts = 0;
    for (let t = 1; t <= n; t++) {
        const discount = Math.pow(1 + r, t);
        const b = Number.isFinite(benefits?.[t - 1]) ? (benefits[t - 1] as number) : 0;
        const c = Number.isFinite(costs?.[t - 1]) ? (costs[t - 1] as number) : 0;
        pvBenefits += b / discount;
        pvCosts += c / discount;
    }

    const npv = pvBenefits - pvCosts;
    const bcr = pvCosts === 0 ? (pvBenefits > 0 ? Infinity : 0) : pvBenefits / pvCosts;
    const recommendation: 'proceed' | 'reject' | 'review' = bcr > 1.2 ? 'proceed' : bcr < 0.8 ? 'reject' : 'review';

    return { npv, bcr, recommendation };
}

/**
 * Unified decision dispatcher - wraps framework-specific logic in a standard envelope.
 *
 * @param {number}   riskScore
 * @param {number[]} uncertaintySamples
 * @param {{costs?:number[], benefits?:number[], discountRate?:number, years?:number, threshold?:number}} costBenefitParams
 * @param {string}   framework - One of DECISION_FRAMEWORKS values.
 * @returns {{framework:string, decision:'act'|'defer', confidence:number, reasoning:string[]}}
 */
export function makeDecision(
    riskScore: number,
    uncertaintySamples: number[],
    costBenefitParams: {
        costs?: number[];
        benefits?: number[];
        discountRate?: number;
        years?: number;
        threshold?: number;
    },
    framework: string,
): { framework: string; decision: 'act' | 'defer'; confidence: number; reasoning: string[] } {
    const fw = (Object.values(DECISION_FRAMEWORKS) as string[]).includes(framework)
        ? framework
        : DECISION_FRAMEWORKS.ALARP;

    const reasoning: string[] = [];
    let decision: 'act' | 'defer' = 'defer';
    let confidence = 0.5;

    if (fw === DECISION_FRAMEWORKS.ALARP) {
        const region = classifyAlarpRegion(riskScore);
        reasoning.push(`ALARP region: ${region}`);
        reasoning.push(`Risk score: ${Number.isFinite(riskScore) ? riskScore.toFixed(4) : 'N/A'}`);
        if (region === RISK_REGIONS.INTOLERABLE) {
            decision = 'act';
            confidence = 0.95;
            reasoning.push('Risk is intolerable — immediate action mandatory.');
        } else if (region === RISK_REGIONS.BROADLY_ACCEPTABLE) {
            decision = 'defer';
            confidence = 0.9;
            reasoning.push('Risk is broadly acceptable — no additional action required.');
        } else {
            decision = 'act';
            confidence = 0.65;
            reasoning.push('Risk is in ALARP region — reduce risk so far as reasonably practicable.');
        }
    } else if (fw === DECISION_FRAMEWORKS.PRECAUTIONARY) {
        const threshold = costBenefitParams?.threshold ?? 0.5;
        const result = applyPrecautionaryPrinciple(uncertaintySamples, threshold as number);
        decision = result.decision as 'act' | 'defer';
        confidence =
            result.decision === 'act'
                ? Math.min(0.5 + result.exceedanceProbability * 2, 0.99)
                : Math.min(0.5 + (1 - result.exceedanceProbability) * 0.8, 0.99);
        reasoning.push(result.rationale);
        const ep = Number.isFinite(result.exceedanceProbability)
            ? (result.exceedanceProbability * 100).toFixed(2) + '%'
            : 'N/A';
        reasoning.push(`Exceedance probability: ${ep}`);
    } else if (fw === DECISION_FRAMEWORKS.COST_BENEFIT) {
        const { costs, benefits, discountRate, years } = costBenefitParams || {};
        const result = computeCostBenefit(costs || [], benefits || [], discountRate || 0.07, years || 0);
        decision = result.recommendation === 'proceed' ? 'act' : 'defer';
        confidence = result.recommendation === 'review' ? 0.5 : 0.8;
        const bcrStr = Number.isFinite(result.bcr) ? result.bcr.toFixed(3) : 'Infinity';
        reasoning.push(`BCR: ${bcrStr}`);
        reasoning.push(`NPV: ${Number.isFinite(result.npv) ? result.npv.toFixed(2) : 'N/A'}`);
        reasoning.push(`Recommendation: ${result.recommendation}`);
    }

    return { framework: fw, decision, confidence, reasoning };
}

/**
 * Aggregate multiple framework decisions into a consensus.
 *
 * Consensus = 'act' if majority > 50%, 'defer' if majority defer, 'split' if tied.
 *
 * @param {{framework:string, decision:string, confidence:number, reasoning:string[]}[]} decisions
 * @returns {{consensus:'act'|'defer'|'split', agreementRate:number, recommendations:string[]}}
 */
export function aggregateDecisions(
    decisions: { framework: string; decision: string; confidence: number; reasoning: string[] }[],
): { consensus: 'act' | 'defer' | 'split'; agreementRate: number; recommendations: string[] } {
    const valid = Array.isArray(decisions) ? decisions.filter((d) => d && typeof d.decision === 'string') : [];

    if (valid.length === 0) {
        return { consensus: 'defer', agreementRate: 0, recommendations: ['No decisions to aggregate.'] };
    }

    const actCount = valid.filter((d) => d.decision === 'act').length;
    const deferCount = valid.length - actCount;
    const agreementRate = Math.max(actCount, deferCount) / valid.length;
    const consensus: 'act' | 'defer' | 'split' =
        actCount > deferCount ? 'act' : deferCount > actCount ? 'defer' : 'split';
    const recommendations = valid.map(
        (d) => `[${d.framework}] ${d.decision} (confidence: ${(d.confidence * 100).toFixed(0)}%)`,
    );

    return { consensus, agreementRate, recommendations };
}

// ──────────────────────────────────────────────────────────────────────
// Decision record builder para log/export
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {any} decision
 * @param {any} signal
 * @returns {any}
 */
export function buildDecisionRecord(decision: any, signal: any): any {
    if (!decision || typeof decision !== 'object') return null;
    return {
        event: 'decision_rule_evaluated',
        action: decision.action,
        winner_rule_id: decision.winner?.rule_id || null,
        matched_count: Array.isArray(decision.matchedRules) ? decision.matchedRules.length : 0,
        run_type: decision.runType,
        policy_version: decision.policyVersion,
        rationale: decision.rationale,
        inputs: signal ? { ...signal } : {},
        timestamp: decision.evaluatedAt,
    };
}
