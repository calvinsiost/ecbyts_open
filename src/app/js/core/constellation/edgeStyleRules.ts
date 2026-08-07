// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Edge Style Rules - Phase 1.35 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S35
 *
 * Phase 1.35 (2026-05-02) - pure-logic rules engine para estilizar
 * edges baseado em condition matching. Suporta múltiplas regras com
 * priority + style merging.
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

interface StyleCondition {
    field: string;
    operator: string;
    value: unknown;
}

interface StyleRule {
    id: string;
    conditions: ReadonlyArray<StyleCondition>;
    style: Readonly<Record<string, unknown>>;
    priority: number;
    matchAll: boolean;
}

type StyleEdge = Record<string, unknown>;

/** Match operators canônicos. */
export const MATCH_OPERATORS = Object.freeze(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains']);

/** Identidade do módulo. */
export const STYLE_RULES_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.35',
    deliveredAt: '2026-05-02',
    operators: MATCH_OPERATORS,
});

/**
 * Verifica se operator é canônico.
 * @param op
 */
export function isValidOperator(op: unknown): boolean {
    return typeof op === 'string' && MATCH_OPERATORS.includes(op);
}

function evaluateEquality(fieldValue: unknown, target: unknown, op: 'eq' | 'neq'): boolean {
    return op === 'eq' ? fieldValue === target : fieldValue !== target;
}

function evaluateNumericComparison(
    fieldValue: unknown,
    target: unknown,
    op: 'gt' | 'gte' | 'lt' | 'lte',
): boolean {
    if (!Number.isFinite(fieldValue) || !Number.isFinite(target)) return false;
    const a = fieldValue as number;
    const b = target as number;
    switch (op) {
        case 'gt':
            return a > b;
        case 'gte':
            return a >= b;
        case 'lt':
            return a < b;
        case 'lte':
            return a <= b;
        default:
            return false;
    }
}

function evaluateInclusion(fieldValue: unknown, target: unknown): boolean {
    return Array.isArray(target) && target.includes(fieldValue);
}

function evaluateContains(fieldValue: unknown, target: unknown): boolean {
    return typeof fieldValue === 'string' && typeof target === 'string' && fieldValue.includes(target);
}

/**
 * Avalia uma condition individual contra edge.
 *
 * @param condition {field, operator, value}
 * @param edge
 */
export function evaluateCondition(condition: unknown, edge: unknown): boolean {
    if (!condition || typeof condition !== 'object') return false;
    if (!edge || typeof edge !== 'object') return false;
    const c = condition as StyleCondition;
    if (!isValidOperator(c.operator)) return false;
    const e = edge as Record<string, unknown>;
    const fieldValue = e[c.field];
    const target = c.value;
    switch (c.operator) {
        case 'eq':
        case 'neq':
            return evaluateEquality(fieldValue, target, c.operator);
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte':
            return evaluateNumericComparison(fieldValue, target, c.operator);
        case 'in':
            return evaluateInclusion(fieldValue, target);
        case 'contains':
            return evaluateContains(fieldValue, target);
        default:
            return false;
    }
}

/**
 * Cria rule frozen.
 *
 * @param spec {id, conditions[], style, priority?}
 */
export function createRule(spec: unknown): StyleRule {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createRule: spec required');
    }
    const s = spec as {
        id?: unknown;
        conditions?: unknown;
        style?: unknown;
        priority?: unknown;
        matchAll?: unknown;
    };
    if (typeof s.id !== 'string' || !s.id.trim()) {
        throw new TypeError('createRule: id required');
    }
    if (!Array.isArray(s.conditions)) {
        throw new TypeError('createRule: conditions array required');
    }
    return Object.freeze({
        id: s.id,
        conditions: Object.freeze(s.conditions.map((c: any) => Object.freeze({ ...c }))),
        style:
            s.style && typeof s.style === 'object'
                ? Object.freeze({ ...(s.style as Record<string, unknown>) })
                : Object.freeze({}),
        priority: Number.isFinite(s.priority) ? (s.priority as number) : 0,
        matchAll: s.matchAll !== false, // default AND
    }) as StyleRule;
}

/**
 * Verifica se rule matches edge (AND ou OR conditions).
 * @param rule
 * @param edge
 */
export function ruleMatches(rule: unknown, edge: unknown): boolean {
    if (!rule || !edge || typeof rule !== 'object') return false;
    const r = rule as StyleRule;
    if (!Array.isArray(r.conditions) || r.conditions.length === 0) return false;
    if (r.matchAll) {
        return r.conditions.every((c: StyleCondition) => evaluateCondition(c, edge));
    }
    return r.conditions.some((c: StyleCondition) => evaluateCondition(c, edge));
}

/**
 * Encontra regras matching por edge, sorted por priority desc.
 * @param rules
 * @param edge
 */
export function matchRules(rules: unknown, edge: unknown): ReadonlyArray<StyleRule> {
    if (!Array.isArray(rules) || !edge) return Object.freeze([]);
    return Object.freeze(
        rules
            .filter((r: unknown) => r && ruleMatches(r, edge))
            .sort((a: StyleRule, b: StyleRule) => (b.priority || 0) - (a.priority || 0)),
    );
}

/**
 * Merge styles em ordem (last wins).
 * @param styles
 */
export function mergeStyles(styles: unknown): Readonly<Record<string, unknown>> {
    if (!Array.isArray(styles)) return Object.freeze({});
    const out: Record<string, unknown> = {};
    for (const s of styles) {
        if (s && typeof s === 'object') {
            for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
                if (v !== undefined) out[k] = v;
            }
        }
    }
    return Object.freeze(out);
}

/**
 * Aplica regras a edge: matches + merge em priority order (highest priority last).
 * @param rules
 * @param edge
 */
export function applyRules(rules: unknown, edge: unknown): Readonly<Record<string, unknown>> {
    const matched = matchRules(rules, edge);
    if (matched.length === 0) return Object.freeze({});
    // Reverse para low priority first → high overrides
    const stylesAsc = matched
        .slice()
        .reverse()
        .map((r: StyleRule) => r.style);
    return mergeStyles(stylesAsc);
}

/**
 * Aplica rules a array de edges.
 * @param rules
 * @param edges
 */
export function applyRulesToEdges(
    rules: unknown,
    edges: unknown,
): ReadonlyArray<Readonly<StyleEdge & { appliedStyle: Readonly<Record<string, unknown>> }>> {
    if (!Array.isArray(edges)) return Object.freeze([]);
    return Object.freeze(
        edges.map((e: StyleEdge) =>
            Object.freeze({
                ...e,
                appliedStyle: applyRules(rules, e),
            }),
        ),
    );
}

/**
 * Sumariza rule application result.
 * @param rules
 * @param edges
 */
export function summarizeRules(
    rules: unknown,
    edges: unknown,
): Readonly<{ ruleCount: number; edgeCount: number; edgesWithStyle: number; avgRulesPerEdge: number }> {
    const empty = Object.freeze({ ruleCount: 0, edgeCount: 0, edgesWithStyle: 0, avgRulesPerEdge: 0 });
    if (!Array.isArray(rules) || !Array.isArray(edges)) return empty;
    let totalMatches = 0;
    let edgesWithStyle = 0;
    for (const e of edges) {
        const matched = matchRules(rules, e);
        if (matched.length > 0) {
            edgesWithStyle++;
            totalMatches += matched.length;
        }
    }
    return Object.freeze({
        ruleCount: rules.length,
        edgeCount: edges.length,
        edgesWithStyle,
        avgRulesPerEdge: edges.length > 0 ? totalMatches / edges.length : 0,
    });
}

/**
 * Module identity export.
 */
export const edgeStyleRulesMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.35',
    deliveredAt: '2026-05-02',
    operators: MATCH_OPERATORS,
    exports: [
        'MATCH_OPERATORS',
        'STYLE_RULES_META',
        'isValidOperator',
        'evaluateCondition',
        'createRule',
        'ruleMatches',
        'matchRules',
        'mergeStyles',
        'applyRules',
        'applyRulesToEdges',
        'summarizeRules',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
