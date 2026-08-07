// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * graphTiers.js - Constellation HUD graph tier configuration
 * Defines Free/Premium limits and complexity metrics for the Z3 graph.
 *
 * Módulo de configuração de tier para o grafo de constelações:
 * Free até 50 nós, Premium ilimitado. Calcula densidade e complexidade.
 *
 * @module core/constellation/graphTiers
 */

interface TierLimit {
    maxNodes: number;
    maxEdges: number;
    layoutIterations: number;
}

// Graph tier identifiers
export const GRAPH_TIERS = {
    FREE: 'free',
    PREMIUM: 'premium',
} as const;

/** Limits per tier */
export const TIER_LIMITS: Record<string, TierLimit> = {
    [GRAPH_TIERS.FREE]: {
        maxNodes: 50,
        maxEdges: 200,
        layoutIterations: 50,
    },
    [GRAPH_TIERS.PREMIUM]: {
        maxNodes: Infinity,
        maxEdges: Infinity,
        layoutIterations: 150,
    },
};

/**
 * Returns the active tier based on injected session/config.
 * @param {object} session - Session object (optional)
 * @returns {'free'|'premium'}
 */
export function getActiveTier(session: object = {}): 'free' | 'premium' {
    const s = session as any;
    return s?.subscriptionTier === 'premium' || s?.isPremium ? GRAPH_TIERS.PREMIUM : GRAPH_TIERS.FREE;
}

/**
 * Returns limits for a given tier.
 * @param {string} tier
 * @returns {{ maxNodes: number, maxEdges: number, layoutIterations: number }}
 */
export function getLimitsForTier(tier: string): TierLimit {
    const limits = TIER_LIMITS as Record<string, TierLimit>;
    return limits[tier] ?? (limits[GRAPH_TIERS.FREE] as TierLimit);
}

/**
 * Verifica se o grafo excede os limites do tier ativo.
 * @param {number} nodeCount
 * @param {number} edgeCount
 * @param {object} session
 * @returns {{ withinLimits: boolean, nodeCount: number, edgeCount: number,
 *             tier: string, maxNodes: number, maxEdges: number }}
 */
export function checkGraphLimits(
    nodeCount: number,
    edgeCount: number,
    session: object = {},
): {
    withinLimits: boolean;
    nodeCount: number;
    edgeCount: number;
    tier: string;
    maxNodes: number;
    maxEdges: number;
} {
    const tier = getActiveTier(session);
    const limits = getLimitsForTier(tier);
    return {
        withinLimits: nodeCount <= limits.maxNodes && edgeCount <= limits.maxEdges,
        nodeCount,
        edgeCount,
        tier,
        maxNodes: limits.maxNodes,
        maxEdges: limits.maxEdges,
    };
}

/**
 * Calcula métricas de complexidade do grafo.
 * Density = edges / max possible edges (undirected: n*(n-1)/2).
 * @param {number} nodeCount
 * @param {number} edgeCount
 * @returns {{ density: number, avgDegree: number, complexity: 'low'|'medium'|'high' }}
 */
export function computeGraphComplexity(
    nodeCount: number,
    edgeCount: number,
): { density: number; avgDegree: number; complexity: 'low' | 'medium' | 'high' } {
    if (nodeCount < 2) return { density: 0, avgDegree: 0, complexity: 'low' };
    const maxPossibleEdges = (nodeCount * (nodeCount - 1)) / 2;
    const density = edgeCount / maxPossibleEdges;
    const avgDegree = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0;
    const complexity = density > 0.5 ? 'high' : density > 0.2 ? 'medium' : 'low';
    return { density, avgDegree, complexity };
}
