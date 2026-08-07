// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Node Visibility Resolver - Phase 1.50 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S50
 *
 * Phase 1.50 (2026-05-02) - pure-logic resolver que combina múltiplas
 * fontes de visibilidade (rules) sobre nodes do grafo. Suporta composição
 * AND / OR / weighted, override manual via hide/show, e annotação em batch.
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

type ResolverMode = 'and' | 'or' | 'weighted';

interface Resolver {
    rules: ReadonlyArray<{ source: string; weight: number | undefined; fn: Function }>;
    mode: ResolverMode;
    threshold: number;
    _hidden: Set<string>;
    _shown: Set<string>;
}

interface ResolverConfig {
    rules?: Array<{ source: string; weight?: number; fn: Function }>;
    mode?: ResolverMode;
    threshold?: number;
}

interface VisibilitySummary {
    total: number;
    visible: number;
    hidden: number;
    ratio: number;
}

/** Identidade do módulo. */
export const VISIBILITY_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.50',
    deliveredAt: '2026-05-02',
});

const VALID_MODES = new Set(['and', 'or', 'weighted']);

/**
 * Cria um resolver com regras pluggáveis.
 * @param cfg
 */
export function createResolver(cfg: ResolverConfig = {}): Resolver {
    const rawRules = Array.isArray(cfg.rules) ? cfg.rules : [];
    const rules = rawRules
        .filter((r) => r && typeof r.fn === 'function' && typeof r.source === 'string')
        .map((r) =>
            Object.freeze({
                source: r.source,
                weight: Number.isFinite(r.weight) ? r.weight : 1,
                fn: r.fn,
            }),
        );
    const mode = (VALID_MODES.has(cfg.mode || '') ? cfg.mode : 'and') as ResolverMode;
    const threshold = Number.isFinite(cfg.threshold) ? (cfg.threshold as number) : 0.5;
    return {
        rules: Object.freeze(rules),
        mode,
        threshold,
        _hidden: new Set<string>(),
        _shown: new Set<string>(),
    };
}

/**
 * Resolve visibilidade efetiva para um node, combinando regras + overrides.
 */
export function resolveVisibility(resolver: any, node: any): boolean {
    if (!resolver || !node) return false;
    const id = node.id;
    if (typeof id === 'string') {
        if (resolver._hidden && resolver._hidden.has(id)) return false;
        if (resolver._shown && resolver._shown.has(id)) return true;
    }
    const rules = resolver.rules || [];
    if (rules.length === 0) return true;
    if (resolver.mode === 'and') {
        return rules.every((r: any) => Boolean(safeRule(r.fn, node)));
    }
    if (resolver.mode === 'or') {
        return rules.some((r: any) => Boolean(safeRule(r.fn, node)));
    }
    // weighted
    let totalWeight = 0;
    let acc = 0;
    for (const r of rules) {
        const w = Number.isFinite(r.weight) ? r.weight : 1;
        totalWeight += w;
        if (safeRule(r.fn, node)) acc += w;
    }
    if (totalWeight <= 0) return true;
    return acc / totalWeight >= resolver.threshold;
}

function safeRule(fn: any, node: any): any {
    try {
        return fn(node);
    } catch {
        return false;
    }
}

/**
 * Override manual: esconde node por id.
 */
export function hideNode(resolver: any, nodeId: any): boolean {
    if (!resolver || typeof nodeId !== 'string') return false;
    resolver._hidden.add(nodeId);
    resolver._shown.delete(nodeId);
    return true;
}

/**
 * Override manual: força visibilidade.
 */
export function showNode(resolver: any, nodeId: any): boolean {
    if (!resolver || typeof nodeId !== 'string') return false;
    resolver._shown.add(nodeId);
    resolver._hidden.delete(nodeId);
    return true;
}

/**
 * Limpa override manual para um node.
 */
export function clearOverride(resolver: any, nodeId: any): boolean {
    if (!resolver || typeof nodeId !== 'string') return false;
    const a = resolver._hidden.delete(nodeId);
    const b = resolver._shown.delete(nodeId);
    return a || b;
}

/**
 * Verifica se node está hidden por override.
 */
export function isHidden(resolver: any, nodeId: any): boolean {
    if (!resolver || typeof nodeId !== 'string') return false;
    return resolver._hidden.has(nodeId);
}

/**
 * Aplica resolver a uma lista de nodes, retornando nodes anotados.
 */
export function applyToGraph(resolver: any, nodes: any): ReadonlyArray<any> {
    if (!resolver || !Array.isArray(nodes)) return Object.freeze([]);
    return Object.freeze(
        nodes.map((n) => {
            if (!n) return n;
            const visible = resolveVisibility(resolver, n);
            return Object.freeze({ ...n, visible });
        }),
    );
}

/**
 * Sumariza visibilidade de um conjunto de nodes anotados ou crus.
 */
export function summarize(resolver: any, nodes: any): Readonly<VisibilitySummary> {
    const empty: VisibilitySummary = { total: 0, visible: 0, hidden: 0, ratio: 0 };
    if (!Array.isArray(nodes) || nodes.length === 0) return Object.freeze(empty);
    let visible = 0;
    for (const n of nodes) {
        if (!n) continue;
        const v = typeof n.visible === 'boolean' ? n.visible : resolver ? resolveVisibility(resolver, n) : true;
        if (v) visible += 1;
    }
    const total = nodes.length;
    return Object.freeze({
        total,
        visible,
        hidden: total - visible,
        ratio: total > 0 ? visible / total : 0,
    });
}

/**
 * Module identity export.
 */
export const nodeVisibilityResolverMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.50',
    deliveredAt: '2026-05-02',
    exports: [
        'VISIBILITY_META',
        'createResolver',
        'resolveVisibility',
        'hideNode',
        'showNode',
        'clearOverride',
        'isHidden',
        'applyToGraph',
        'summarize',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
