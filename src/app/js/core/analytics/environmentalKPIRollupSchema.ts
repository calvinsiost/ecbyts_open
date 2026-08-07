// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Environmental KPI Rollup Schema - ECBT
 *
 * Pure-logic factories for multi-site KPI rollup and corporate consolidation.
 * Esquema canônico para agregação de KPIs ambientais em múltiplos níveis
 * hierárquicos (site → BU → região → país → global) e consolidação corporativa
 * conforme bases de controle (operacional, financeiro, equity-share).
 *
 * Domain references (factual/normative basis only - no code copied):
 * - GRI 2021 - Global Reporting Initiative Universal Standards
 * - ISO 14064-3 - Verification & validation of GHG statements
 * - CDP - Climate Disclosure Project corporate questionnaires
 * - SBTi - Science Based Targets initiative methodology
 * - B3 ISE - Índice de Sustentabilidade Empresarial
 * - ABNT NBR ISO 14001 - Environmental management systems (corporate-level)
 *
 * Constraints:
 * - Zero DOM, zero browser APIs, zero external imports
 * - All enums frozen via Object.freeze
 * - All record factories return Object.freeze
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const ROLLUP_LEVEL = Object.freeze({
    SITE: 'SITE',
    BUSINESS_UNIT: 'BUSINESS_UNIT',
    REGION: 'REGION',
    COUNTRY: 'COUNTRY',
    GLOBAL: 'GLOBAL',
});

export const AGGREGATION_RULE = Object.freeze({
    SUM: 'SUM',
    MEAN: 'MEAN',
    WEIGHTED_MEAN: 'WEIGHTED_MEAN',
    MAX: 'MAX',
    MIN: 'MIN',
    MEDIAN: 'MEDIAN',
});

export const CONSOLIDATION_BASIS = Object.freeze({
    OPERATIONAL_CONTROL: 'OPERATIONAL_CONTROL',
    FINANCIAL_CONTROL: 'FINANCIAL_CONTROL',
    EQUITY_SHARE: 'EQUITY_SHARE',
});

export const KPI_DOMAIN = Object.freeze({
    GHG_EMISSIONS: 'GHG_EMISSIONS',
    ENERGY: 'ENERGY',
    WATER: 'WATER',
    WASTE: 'WASTE',
    BIODIVERSITY: 'BIODIVERSITY',
    SAFETY: 'SAFETY',
    COMPLIANCE: 'COMPLIANCE',
});

export const ROLLUP_ERROR = Object.freeze({
    INVALID_LEVEL: 'INVALID_LEVEL',
    INVALID_RULE: 'INVALID_RULE',
    INVALID_NODE: 'INVALID_NODE',
});

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const LEVEL_HIERARCHY = Object.freeze({
    SITE: 0,
    BUSINESS_UNIT: 1,
    REGION: 2,
    COUNTRY: 3,
    GLOBAL: 4,
});

export const DEFAULT_AGGREGATION = Object.freeze({
    GHG_EMISSIONS: 'SUM',
    ENERGY: 'SUM',
    WATER: 'SUM',
    WASTE: 'SUM',
    BIODIVERSITY: 'WEIGHTED_MEAN',
    SAFETY: 'WEIGHTED_MEAN',
    COMPLIANCE: 'MEAN',
});

export const EQUITY_DEFAULT_OWNERSHIP = 1.0;

// ─────────────────────────────────────────────────────────────────────────────
// Error class
// ─────────────────────────────────────────────────────────────────────────────

export class RollupError extends Error {
    code: string;

    /**
     * @param {string} code
     * @param {string} [message?]
     */
    constructor(code: string, message?: string) {
        super(message || code);
        this.name = 'RollupError';
        this.code = code;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** @param {unknown} s */
function isNonEmptyString(s: unknown): s is string {
    return typeof s === 'string' && s.length > 0;
}

/** @param {unknown} n */
function isFiniteNumber(n: unknown): n is number {
    return typeof n === 'number' && Number.isFinite(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

interface KPINode {
    nodeId: string;
    level: string;
    parentId: string | null;
    equityShare: number;
    kpis: Readonly<Record<string, number>>;
}

interface CreateKPINodeInput {
    nodeId?: string;
    level?: string;
    parentId?: string | null;
    equityShare?: number;
    kpis?: Record<string, unknown>;
}

/**
 * Creates a frozen KPI hierarchy node.
 * Cria um nó imutável da hierarquia de KPIs.
 *
 * @param {CreateKPINodeInput} params
 * @returns {Readonly<KPINode>}
 */
export function createKPINode({
    nodeId,
    level,
    parentId = null,
    equityShare = 1.0,
    kpis,
}: CreateKPINodeInput): Readonly<KPINode> {
    if (!isNonEmptyString(nodeId)) {
        throw new RollupError(ROLLUP_ERROR.INVALID_NODE, 'nodeId required');
    }
    if (!(Object.values(ROLLUP_LEVEL) as string[]).includes(level as string)) {
        throw new RollupError(ROLLUP_ERROR.INVALID_LEVEL, 'invalid level: ' + level);
    }
    if (parentId !== null && !isNonEmptyString(parentId)) {
        throw new RollupError(ROLLUP_ERROR.INVALID_NODE, 'parentId must be string or null');
    }
    if (!isFiniteNumber(equityShare) || equityShare <= 0 || equityShare > 1) {
        throw new RollupError(ROLLUP_ERROR.INVALID_NODE, 'equityShare must be in (0,1]');
    }
    if (!kpis || typeof kpis !== 'object') {
        throw new RollupError(ROLLUP_ERROR.INVALID_NODE, 'kpis required');
    }

    const cleanKpis: Record<string, number> = {};
    for (const [domain, value] of Object.entries(kpis)) {
        if (!(Object.values(KPI_DOMAIN) as string[]).includes(domain)) {
            throw new RollupError(ROLLUP_ERROR.INVALID_NODE, 'invalid kpi domain: ' + domain);
        }
        if (!isFiniteNumber(value)) {
            throw new RollupError(ROLLUP_ERROR.INVALID_NODE, 'kpi value not finite: ' + domain);
        }
        cleanKpis[domain] = value as number;
    }

    return Object.freeze({
        nodeId,
        level,
        parentId,
        equityShare,
        kpis: Object.freeze(cleanKpis),
    } as KPINode);
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation primitives
// ─────────────────────────────────────────────────────────────────────────────

/** @param {number[]} arr */
function median(arr: number[]): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const n = sorted.length;
    if (n === 0) return 0;
    const mid = Math.floor(n / 2);
    return n % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

/**
 * Aggregates a list of values using the given rule.
 * Agrega lista de valores conforme regra.
 *
 * @param {number[]} values
 * @param {string} rule value of AGGREGATION_RULE
 * @param {number[]|null} [weights] required only for WEIGHTED_MEAN
 * @returns {number}
 */
export function aggregateKPIs(
    values: number[],
    rule: string,
    weights: number[] | null = null,
): number {
    if (!Array.isArray(values)) {
        throw new RollupError(ROLLUP_ERROR.INVALID_NODE, 'values must be array');
    }
    if (!(Object.values(AGGREGATION_RULE) as string[]).includes(rule)) {
        throw new RollupError(ROLLUP_ERROR.INVALID_RULE, 'invalid rule: ' + rule);
    }
    if (values.length === 0) return 0;

    switch (rule) {
        case AGGREGATION_RULE.SUM:
            return values.reduce((acc, v) => acc + v, 0);
        case AGGREGATION_RULE.MEAN:
            return values.reduce((acc, v) => acc + v, 0) / values.length;
        case AGGREGATION_RULE.WEIGHTED_MEAN: {
            if (!Array.isArray(weights) || weights.length !== values.length) {
                throw new RollupError(ROLLUP_ERROR.INVALID_RULE, 'WEIGHTED_MEAN requires matching weights');
            }
            let num = 0;
            let den = 0;
            for (let i = 0; i < values.length; i++) {
                num += (values[i] ?? 0) * (weights[i] ?? 0);
                den += weights[i] ?? 0;
            }
            return den === 0 ? 0 : num / den;
        }
        case AGGREGATION_RULE.MAX:
            return Math.max(...values);
        case AGGREGATION_RULE.MIN:
            return Math.min(...values);
        case AGGREGATION_RULE.MEDIAN:
            return median(values);
        default:
            throw new RollupError(ROLLUP_ERROR.INVALID_RULE, 'unhandled rule: ' + rule);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hierarchy rollup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively rolls up KPIs from leaves to the requested root.
 * For each parent node, aggregates children's KPIs via DEFAULT_AGGREGATION
 * and multiplies by the parent's equityShare.
 * Agregação recursiva da hierarquia.
 *
 * @param {KPINode[]} nodes outputs of createKPINode
 * @param {string} rootId
 * @returns {Map<string, Readonly<Record<string, number>>>}
 */
export function rollupHierarchy(
    nodes: KPINode[],
    rootId: string,
): Map<string, Readonly<Record<string, number>>> {
    if (!Array.isArray(nodes)) {
        throw new RollupError(ROLLUP_ERROR.INVALID_NODE, 'nodes must be array');
    }
    if (!isNonEmptyString(rootId)) {
        throw new RollupError(ROLLUP_ERROR.INVALID_NODE, 'rootId required');
    }

    const byId = new Map<string, KPINode>();
    const childrenOf = new Map<string, KPINode[]>();
    for (const n of nodes) {
        byId.set(n.nodeId, n);
        if (n.parentId) {
            if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, []);
            (childrenOf.get(n.parentId) as KPINode[]).push(n);
        }
    }

    if (!byId.has(rootId)) {
        throw new RollupError(ROLLUP_ERROR.INVALID_NODE, 'rootId not found: ' + rootId);
    }

    const result = new Map<string, Readonly<Record<string, number>>>();

    /**
     * @param {string} nodeId
     * @param {Set<string>} visited
     * @returns {Readonly<Record<string, number>>}
     */
    function compute(nodeId: string, visited: Set<string>): Readonly<Record<string, number>> {
        if (visited.has(nodeId)) {
            throw new RollupError(ROLLUP_ERROR.INVALID_NODE, 'cycle detected at ' + nodeId);
        }
        if (result.has(nodeId)) return result.get(nodeId) as Readonly<Record<string, number>>;

        const node = byId.get(nodeId);
        if (!node) throw new RollupError(ROLLUP_ERROR.INVALID_NODE, 'missing node: ' + nodeId);

        const kids = childrenOf.get(nodeId) || [];
        const nextVisited = new Set(visited);
        nextVisited.add(nodeId);

        let aggregated: Record<string, number>;

        if (kids.length === 0) {
            // Leaf - own kpis (apply own equity)
            aggregated = {};
            for (const [domain, value] of Object.entries(node.kpis)) {
                aggregated[domain] = value * node.equityShare;
            }
        } else {
            // Recurse children
            const childAggs = kids.map((k) => compute(k.nodeId, nextVisited));

            // Collect domains from all children's aggregations + own KPIs
            const domains = new Set<string>();
            for (const a of childAggs) for (const d of Object.keys(a)) domains.add(d);
            for (const d of Object.keys(node.kpis)) domains.add(d);

            aggregated = {};
            for (const domain of domains) {
                const rule =
                    (DEFAULT_AGGREGATION as Record<string, string>)[domain] || AGGREGATION_RULE.SUM;
                const values = childAggs.map((a) =>
                    Object.prototype.hasOwnProperty.call(a, domain) ? (a[domain] as number) : 0,
                );
                let agg = aggregateKPIs(values, rule);
                // If parent has its own kpi for this domain, include it via the same rule
                if (Object.prototype.hasOwnProperty.call(node.kpis, domain)) {
                    agg = aggregateKPIs([agg, node.kpis[domain] as number], rule);
                }
                aggregated[domain] = agg * node.equityShare;
            }
        }

        const frozen = Object.freeze(aggregated);
        result.set(nodeId, frozen);
        return frozen;
    }

    compute(rootId, new Set());
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Consolidation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Consolidates KPIs across nodes by GHG-Protocol-style basis.
 * - OPERATIONAL_CONTROL: full inclusion of all nodes
 * - FINANCIAL_CONTROL: full inclusion if equityShare > 0.5 (controlling)
 * - EQUITY_SHARE: prorated by equityShare for every node
 * Consolida KPIs por base de controle.
 *
 * @param {KPINode[]} nodes outputs of createKPINode
 * @param {string} basis value of CONSOLIDATION_BASIS
 * @returns {Readonly<Record<string, number>>}
 */
export function consolidateByBasis(
    nodes: KPINode[],
    basis: string,
): Readonly<Record<string, number>> {
    if (!Array.isArray(nodes)) {
        throw new RollupError(ROLLUP_ERROR.INVALID_NODE, 'nodes must be array');
    }
    if (!(Object.values(CONSOLIDATION_BASIS) as string[]).includes(basis)) {
        throw new RollupError(ROLLUP_ERROR.INVALID_RULE, 'invalid basis: ' + basis);
    }

    const totals: Record<string, number> = {};

    for (const n of nodes) {
        let factor;
        if (basis === CONSOLIDATION_BASIS.OPERATIONAL_CONTROL) {
            factor = 1.0;
        } else if (basis === CONSOLIDATION_BASIS.FINANCIAL_CONTROL) {
            factor = n.equityShare > 0.5 ? 1.0 : 0.0;
        } else {
            // EQUITY_SHARE
            factor = n.equityShare;
        }

        for (const [domain, value] of Object.entries(n.kpis)) {
            totals[domain] = (totals[domain] || 0) + value * factor;
        }
    }

    return Object.freeze(totals);
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds an aggregated rollup report.
 * Constrói relatório agregado de rollup.
 *
 * @param {KPINode[]} nodes outputs of createKPINode
 * @param {string} rootId
 * @returns {Readonly<{
 *   totalNodes: number,
 *   levels: Readonly<Record<string, number>>,
 *   aggregatedKPIs: Readonly<Record<string, number>>,
 *   dominantNode: Readonly<{nodeId: string, ghg: number}>|null,
 * }>}
 */
export function buildRollupReport(
    nodes: KPINode[],
    rootId: string,
): Readonly<{
    totalNodes: number;
    levels: Readonly<Record<string, number>>;
    aggregatedKPIs: Readonly<Record<string, number>>;
    dominantNode: Readonly<{ nodeId: string; ghg: number }> | null;
}> {
    if (!Array.isArray(nodes)) {
        throw new RollupError(ROLLUP_ERROR.INVALID_NODE, 'nodes must be array');
    }

    const levels: Record<string, number> = {};
    for (const n of nodes) {
        levels[n.level] = (levels[n.level] || 0) + 1;
    }

    const rollup = rollupHierarchy(nodes, rootId);
    const aggregatedKPIs =
        rollup.get(rootId) || (Object.freeze({}) as Readonly<Record<string, number>>);

    // Dominant node by GHG_EMISSIONS contribution among siblings of root or
    // any non-root node - pick highest GHG_EMISSIONS among individual nodes.
    let dominantNode: Readonly<{ nodeId: string; ghg: number }> | null = null;
    let maxGHG = -Infinity;
    for (const n of nodes) {
        const ghg = n.kpis[KPI_DOMAIN.GHG_EMISSIONS];
        if (isFiniteNumber(ghg) && ghg > maxGHG) {
            maxGHG = ghg;
            dominantNode = Object.freeze({ nodeId: n.nodeId, ghg });
        }
    }

    return Object.freeze({
        totalNodes: nodes.length,
        levels: Object.freeze({ ...levels }),
        aggregatedKPIs,
        dominantNode,
    });
}
