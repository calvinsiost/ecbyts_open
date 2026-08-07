// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic Constellation HUD tiering policy for SPEC_CONSTELLATION_HUD_9_75.
// Enforce node count limits per freemium tier (free=50, pro=5000, enterprise=unlimited).
// Hand-authored R1-safe (claude-otimizacao). Sem DOM, sem rede, sem side-effects.
//
// Spec NOT (anti-requisitos):
// - NÃO duplicar TIER_LIMITS (este arquivo agrega "constellation_nodes" como overlay)
// - NÃO ler localStorage/Supabase (callers passam tier resolved)
// - NÃO emoji em strings (R1-violation)

/**
 * Limites de nós no grafo Constellation HUD por tier freemium.
 * Não modifica core/metering/tierLimits.js (codemod-governed) — sobrepõe-se via wrapper.
 *
 * Justificativa SPEC §Q3: visualização de grafo é avançada, lei de Pareto.
 * Free preserva valor inicial (50 nós permite explorar feature); Premium ilimitado.
 */
export const CONSTELLATION_NODE_LIMITS = Object.freeze({
    free: 50,
    pro: 5000,
    enterprise: -1,
});

/**
 * @typedef {Object} TieringDecision
 * @property {boolean} allowed       True se nodeCount <= limit (ou tier=enterprise)
 * @property {number} nodeCount      Quantos nós o caller tentou renderizar
 * @property {number} limit          Limite efetivo (-1 = unlimited)
 * @property {string} tier           Tier resolvido
 * @property {number} truncatedCount Quantos seriam mostrados (nodeCount ou limit)
 * @property {string} reason         Código machine-readable ('ok'|'over-limit'|'unknown-tier')
 */

/**
 * Retorna o limite de nós para o tier dado.
 * Tier desconhecido → trata como 'free' (mais restritivo).
 *
 * @param {string} tier
 * @returns {number}
 */
export function getConstellationNodeLimit(tier: any) {
    const limit = (CONSTELLATION_NODE_LIMITS as Record<string, any>)[tier];
    if (typeof limit !== 'number') return CONSTELLATION_NODE_LIMITS.free;
    return limit;
}

/**
 * Decide se renderização do grafo é permitida + retorna count truncado.
 * Função PURA: não tem side-effects, não muta input.
 *
 * @param {string} tier
 * @param {number} nodeCount
 * @returns {TieringDecision}
 */
export function evaluateNodeRendering(tier: any, nodeCount: any) {
    const safeCount = Math.max(0, Number(nodeCount) || 0);
    const limit = getConstellationNodeLimit(tier);
    const knownTier = Object.prototype.hasOwnProperty.call(CONSTELLATION_NODE_LIMITS, tier);
    if (limit === -1) {
        return Object.freeze({
            allowed: true,
            nodeCount: safeCount,
            limit: -1,
            tier,
            truncatedCount: safeCount,
            reason: 'ok',
        });
    }
    const allowed = safeCount <= limit;
    return Object.freeze({
        allowed,
        nodeCount: safeCount,
        limit,
        tier,
        truncatedCount: Math.min(safeCount, limit),
        reason: allowed ? 'ok' : knownTier ? 'over-limit' : 'unknown-tier',
    });
}

/**
 * Constrói mensagem i18n key para paywall quando over-limit.
 * Caller decide se mostra paywall modal ou silencia.
 *
 * @param {TieringDecision} decision
 * @returns {string|null} i18n key ou null se allowed
 */
export function resolvePaywallKey(decision: any) {
    if (!decision || decision.allowed) return null;
    if (decision.tier === 'free') return 'constellation.tier.free.upgradeForMoreNodes';
    if (decision.tier === 'pro') return 'constellation.tier.pro.enterpriseRequired';
    return 'constellation.tier.unknown.fallback';
}

/**
 * Lista nós a renderizar respeitando o limite do tier.
 * Preserva ordem original (não reordena). Para priorizar nós críticos,
 * caller deve pre-sort antes de chamar.
 *
 * @param {Array<*>} nodes
 * @param {string} tier
 * @returns {{ visible: Array<*>, hidden: number, decision: TieringDecision }}
 */
export function applyTieringToNodes(nodes: any, tier: any) {
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    const decision = evaluateNodeRendering(tier, safeNodes.length);
    if (decision.allowed || decision.limit === -1) {
        return { visible: safeNodes.slice(), hidden: 0, decision };
    }
    return {
        visible: safeNodes.slice(0, decision.limit),
        hidden: safeNodes.length - decision.limit,
        decision,
    };
}
