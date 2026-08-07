// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   DECISION RULES COMPLIANCE — SPEC UNC-DECISION-001 (v2)

   Extende decisionRules.js (v1) com:
   - Interval overlap checking (EPA Unified Guidance 2009)
   - uncertainty_class gating (grey/red block em compliance)
   - Decision record traceability (audit log entry)
   - hard_block para missing required input em compliance flow

   Evaluation order:
     hard_block > block > warn > allow

   Tie-break: severity numérica desc → rule_id lexical asc.

   Pure, node-testable. Sem IDB, sem side-effects.
   ================================================================ */

// Action hierarchy
export const ACTION_RANK = Object.freeze({
    allow: 0,
    warn: 1,
    block: 2,
    hard_block: 3,
});

// Uncertainty classes (§Rule Contract)
export const UNCERTAINTY_CLASSES = Object.freeze(['green', 'yellow', 'grey', 'red']);

interface ApplyRulesResult {
    action: string;
    winner: Record<string, any> | null;
    matched: Array<Record<string, unknown>>;
    reason: string;
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

/**
 * Verifica se intervalo [low, high] sobrepõe um threshold simples.
 */
export function intervalOverlapsThreshold(interval: { low: number; high: number }, threshold: number): boolean {
    if (!interval || !Number.isFinite(threshold)) return false;
    const lo = Number(interval.low);
    const hi = Number(interval.high);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return false;
    return lo <= threshold && hi >= threshold;
}

/**
 * Verifica se dois intervalos sobrepõem.
 */
export function intervalsOverlap(a: { low: number; high: number }, b: { low: number; high: number }): boolean {
    if (!a || !b) return false;
    const aLo = Number(a.low);
    const aHi = Number(a.high);
    const bLo = Number(b.low);
    const bHi = Number(b.high);
    if (![aLo, aHi, bLo, bHi].every(Number.isFinite)) return false;
    return aLo <= bHi && bLo <= aHi;
}

/**
 * Compara ações por severidade. Retorna action mais severa.
 */
export function maxAction(a: string, b: string): string {
    const ra = (ACTION_RANK as Record<string, number>)[a] ?? -1;
    const rb = (ACTION_RANK as Record<string, number>)[b] ?? -1;
    if (ra >= rb) return a;
    return b;
}

// ──────────────────────────────────────────────────────────────────────
// Rule evaluation
// ──────────────────────────────────────────────────────────────────────

function _valueMatchesWhen(context: Record<string, any>, when: { metric?: string; threshold?: number; operator?: string; interval_mode?: string } | null | undefined): boolean {
    if (!when || typeof when !== 'object') return false;
    const metric = when.metric;
    if (!metric) return false;
    const value = context[metric];
    const interval = context[`${metric}_interval`];
    const threshold = Number(when.threshold);
    if (!Number.isFinite(threshold)) return false;

    // Prioriza interval_mode se disponível
    if (when.interval_mode === 'overlap' && interval) {
        return intervalOverlapsThreshold(interval, threshold);
    }

    if (!Number.isFinite(Number(value))) return false;
    const op = when.operator || '>=';
    const v = Number(value);
    if (op === '>=') return v >= threshold;
    if (op === '>') return v > threshold;
    if (op === '<=') return v <= threshold;
    if (op === '<') return v < threshold;
    if (op === '==') return v === threshold;
    return v >= threshold;
}

function _andConditionMatches(context: Record<string, any>, and: { uncertainty_class_in?: string[]; scope_in?: string[] } | null | undefined): boolean {
    if (!and || typeof and !== 'object') return true; // ausente = passa
    if (Array.isArray(and.uncertainty_class_in)) {
        const cls = context.uncertainty_class;
        if (!and.uncertainty_class_in.includes(cls)) return false;
    }
    if (Array.isArray(and.scope_in)) {
        if (!and.scope_in.includes(context.scope)) return false;
    }
    return true;
}

/**
 * Avalia uma regra individual contra um context.
 * Retorna action (allow se não match).
 *
 * @param rule - { rule_id, severity, scope, when, and?, action, message? }
 * @param any> - { metric values, uncertainty_class, scope, *_interval }
 */
export function evaluateComplianceRule(rule: Record<string, any>, context: Record<string, any>): { action: string; matched: boolean; message: string | null } {
    if (!rule || typeof rule !== 'object') return { action: 'allow', matched: false, message: null };
    if (!context || typeof context !== 'object') return { action: 'allow', matched: false, message: null };

    // Scope filtering - regra pertence ao flow?
    if (rule.scope && context.flow && rule.scope !== context.flow) {
        return { action: 'allow', matched: false, message: null };
    }

    const whenMatches = _valueMatchesWhen(context, rule.when);
    if (!whenMatches) return { action: 'allow', matched: false, message: null };

    const andMatches = _andConditionMatches(context, rule.and);
    if (!andMatches) return { action: 'allow', matched: false, message: null };

    return {
        action: rule.action || 'warn',
        matched: true,
        message: rule.message || null,
    };
}

/**
 * Aplica múltiplas regras a um context. Retorna winner + audit trail.
 */
export function applyRules(rules: Array<Record<string, any>>, context: Record<string, any>, _opts: Record<string, any> = {}): ApplyRulesResult {
    const flow = context?.flow || 'exploratory';
    const rank = ACTION_RANK as Record<string, number>;

    // Check required inputs em compliance flow
    const missingRequired = Array.isArray(rules)
        ? rules.find((r) => r?.required === true && context?.[r?.when?.metric] == null)
        : null;
    if (flow === 'compliance' && missingRequired) {
        return {
            action: 'hard_block',
            winner: missingRequired,
            matched: [{ rule_id: missingRequired.rule_id, action: 'hard_block' }],
            reason: 'missing_required_input',
        };
    }

    if (!Array.isArray(rules) || rules.length === 0) {
        return { action: 'allow', winner: null, matched: [], reason: 'no_rules' };
    }

    const results: Array<{ rule: Record<string, any>; action: string; message: string | null }> = (
        rules
            .map((r) => {
                const e = evaluateComplianceRule(r, context);
                return e.matched ? { rule: r, action: e.action, message: e.message } : null;
            })
            .filter(Boolean)
    ) as any;

    if (results.length === 0) {
        return { action: 'allow', winner: null, matched: [], reason: 'no_match' };
    }

    const sorted = results.slice().sort((a, b) => {
        const rankDiff = (rank[b.action] || 0) - (rank[a.action] || 0);
        if (rankDiff !== 0) return rankDiff;
        const sevDiff = (Number(b.rule.severity) || 0) - (Number(a.rule.severity) || 0);
        if (sevDiff !== 0) return sevDiff;
        return String(a.rule.rule_id || '').localeCompare(String(b.rule.rule_id || ''));
    });

    const winner = sorted[0] as { rule: Record<string, any>; action: string; message: string | null };
    return {
        action: winner.action,
        winner: winner.rule,
        matched: results.map((r) => ({
            rule_id: r.rule.rule_id,
            action: r.action,
            message: r.message,
        })),
        reason: 'rule_matched',
    };
}

// ──────────────────────────────────────────────────────────────────────
// Decision record (traceability §Traceability)
// ──────────────────────────────────────────────────────────────────────

function pickPolicyVersion(params: { policyVersion?: string } | null | undefined): string {
    return params?.policyVersion || 'unversioned';
}

function pickAction(result: ApplyRulesResult | null | undefined): string {
    return result?.action || 'allow';
}

function pickWinnerRuleId(result: ApplyRulesResult | null | undefined): unknown {
    return result?.winner?.rule_id ?? null;
}

function pickMatched(result: ApplyRulesResult | null | undefined): Array<Record<string, unknown>> {
    return result?.matched || [];
}

function pickReason(result: ApplyRulesResult | null | undefined): string {
    return result?.reason || 'unknown';
}

/**
 * Cria decision record auditável. Imutável (Object.freeze).
 */
export function createDecisionRecord(params: { context: Record<string, any>; result: ApplyRulesResult; policyVersion?: string }): Readonly<Record<string, unknown>> {
    const now = new Date().toISOString();
    const rec = {
        timestamp: now,
        policyVersion: pickPolicyVersion(params),
        context: params?.context || {},
        action: pickAction(params?.result),
        winnerRuleId: pickWinnerRuleId(params?.result),
        matched: pickMatched(params?.result),
        reason: pickReason(params?.result),
    };
    return Object.freeze(rec);
}
