// Generated from src/app/js/core/forum/reputationManager.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// SPEC: docs/specs/features/SPEC_REPUTATION_ROYALTY_CASCADE_BUILD.md
// Phase 1 — reputation cascade logic (pure, layered OVER forumKarma.js).
/* ================================================================
   REPUTATION MANAGER — Reputation & Royalty Cascade (RRC).

   NÃO reimplementa karma: reusa computeKarma/karmaTier de
   forumKarma.js (engine canônico). Esta camada ADICIONA os
   eventos de Library (upload validado, curadoria, uso de dataset)
   ao stream de eventos de karma e mapeia o tier de karma para a
   "reputation tier" de marketplace (Junior/Specialist/Expert)
   que destrava taxas de royalty maiores (spec §2.2 Should — o
   Must-Have aqui é só o cálculo, não a UI de tiers premium).

   Todas as funções são puras e testáveis em Node sem browser.
   ================================================================ */
import { computeKarma, karmaTier } from './forumKarma.js';
import { calculateCascade, fromLineage } from '../../utils/libraries/royaltyEngine.js';
import { createLogger } from '../../utils/helpers/logger.js';
const log = createLogger('reputation');
/**
 * @typedef {'UPLOAD' | 'CURATION' | 'VALIDATION' | 'DATASET_USED'} RrcActionType
 */
/**
 * Pesos de karma para ações de Library (estendem KARMA_WEIGHTS do
 * forum sem mutá-lo). Mapeados para eventos forum reconhecidos por
 * computeKarma via { type, weight } override.
 * @type {Readonly<Record<RrcActionType, { type: string, weight: number }>>}
 */
export const RRC_KARMA_EVENTS = Object.freeze({
    UPLOAD: { type: 'library_linked', weight: 10 },
    CURATION: { type: 'library_linked', weight: 6 },
    VALIDATION: { type: 'moderation_action', weight: 4 },
    DATASET_USED: { type: 'thread_upvoted', weight: 2 },
});
/**
 * Mapeia o tier de karma do forum para o reputation tier de
 * marketplace exposto ao usuário (spec §4.3 reputation_tier).
 * @type {ReadonlyArray<{ tier: 'expert'|'specialist'|'junior', minKarma: number }>}
 */
export const REPUTATION_TIERS = Object.freeze([
    { tier: /** @type {'expert'} */ ('expert'), minKarma: 1000 },
    { tier: /** @type {'specialist'} */ ('specialist'), minKarma: 250 },
    { tier: /** @type {'junior'} */ ('junior'), minKarma: 0 },
]);
/**
 * Constrói um KarmaEvent forum a partir de uma ação RRC de Library.
 * @param {RrcActionType} actionType
 * @returns {{ type: string, weight: number } | null}
 */
export function rrcEventFor( actionType: any) {
    const ev = (RRC_KARMA_EVENTS as any)[actionType];
    return ev ? { type: ev.type, weight: ev.weight } : null;
}
/**
 * Calcula o karma total de um usuário a partir do seu stream de
 * eventos forum + eventos RRC de Library. Pura: o caller injeta
 * os eventos (persistência fica no ledger Supabase, fora do escopo
 * pure-logic — ver spec §3 Performance/Edge Function).
 * @param {Array<{ type: string, weight?: number }>} forumEvents
 * @param {RrcActionType[]} [forumEvents]
 * @returns {number} novo score de karma
 */
export function computeReputation( forumEvents: any, rrcActions: any) {
    const base = Array.isArray(forumEvents) ? forumEvents : [];
    const extra = (Array.isArray(rrcActions) ? rrcActions : [])
        .map(rrcEventFor)
        .filter(/** @returns {e is {type:string,weight:number}} */ (e: any) => e !== null);
    return computeKarma(/** @type {any} */ ([...base, ...extra]));
}
/**
 * Resolve o reputation tier de marketplace a partir do karma.
 * Reusa karmaTier do forum como fonte de verdade subjacente.
 * @param {number} karma
 * @returns {{ reputationTier: 'expert'|'specialist'|'junior', karmaTier: string }}
 */
export function reputationTier( karma: any) {
    const k = typeof karma === 'number' && Number.isFinite(karma) ? Math.max(0, karma) : 0;
    let reputationTier = /** @type {'expert'|'specialist'|'junior'} */ ('junior');
    for (const { tier, minKarma } of REPUTATION_TIERS) {
        if (k >= minKarma) {
            reputationTier = tier;
            break;
        }
    }
    return { reputationTier, karmaTier: karmaTier(k) };
}
/**
 * Caso de uso end-to-end (pure): dado a linhagem de um asset e o
 * valor de uma transação de marketplace, devolve a cascata de
 * royalties + o tier de quem recebe. NÃO move dinheiro (spec §2.3).
 * @param {{ creatorId: string, curatorId?: string|null }} lineage
 * @param {number} lineage
 * @param {Record<string, number>} [transactionAmount]  karma conhecido por userId
 * @returns {{ lines: Array<{userId:string,amount:number,role:string,tier?:string}>, total: number }}
 */
export function resolveAssetRoyalties( lineage: any, transactionAmount: any, karmaByUser: any) {
    const contributors = fromLineage(lineage);
    const lines = calculateCascade(contributors, transactionAmount);
    const km = karmaByUser && typeof karmaByUser === 'object' ? karmaByUser : {};
    const enriched = lines.map((l: any) => ({
        ...l,
        tier: reputationTier(km[l.userId] || 0).reputationTier,
    }));
    log.debug('[reputation:resolveAssetRoyalties]', { count: enriched.length, total: transactionAmount });
    return { lines: enriched, total: transactionAmount };
}
