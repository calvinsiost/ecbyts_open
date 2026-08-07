// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Module/Handler Provenance — thin wrapper over report provenance engine (F1)
//
// Wrapper fino de proveniência para MÓDULOS/HANDLERS de código.
// NÃO reimplementa cadeia, autoria ou materialidade: TODA a lógica de
// proveniência é DELEGADA a `../report/provenanceModel.js` (motor único).
//
// Princípios herdados do motor (não duplicados aqui):
// - Sem DOM, rede, THREE ou efeitos colaterais. Determinístico.
// - APPEND-ONLY: nenhuma entrada é removida/sobrescrita.
// - Backward-safe: módulo sem proveniência → autoria 'human'.
// - Privacy-aware: SBOM nunca expõe texto de prompt (stripPrompt).
//
// Convenção de regiões: um módulo mapeia para DUAS regiões independentes
// no motor — `module:<id>:developed` e `module:<id>:validated` — para que
// quem desenvolveu e quem validou sejam rastreados separadamente
// (BP3 accountability: contribuição de IA nunca fica órfã).

import { tagRegionProvenance, getRegionAuthorship, toDisclosureMetadata } from '../report/provenanceModel.js';

/** Papéis de proveniência de módulo suportados. */
const ROLES = ['developed', 'validated'];

/**
 * Constrói o `regionId` canônico para um módulo + papel.
 *
 * Fonte ÚNICA da convenção `module:<id>:<role>` — exportada para que os
 * testes validem a convenção sem duplicar a string.
 *
 * @param {string} moduleId Identificador do módulo/handler.
 * @param {'developed'|'validated'} role Papel de proveniência.
 * @returns {string} O `regionId` no motor de proveniência.
 */
export function moduleRegionId(moduleId: any, role: any) {
    return `module:${moduleId}:${role}`;
}

/**
 * Codifica de forma determinística o ator humano responsável dentro do
 * campo `action` (o motor não persiste campos arbitrários como `byUser`).
 * Mantém a delegação total: nenhuma estrutura própria é criada.
 *
 * @param {string|null} action Ação livre original.
 * @param {string|null} by Usuário humano responsável.
 * @returns {string|null} Ação com sufixo `[by:<user>]` quando houver `by`.
 */
function encodeBy(action: any, by: any) {
    const base = action != null ? String(action) : '';
    if (by == null || by === '') return base === '' ? null : base;
    return `${base}${base ? ' ' : ''}[by:${String(by)}]`;
}

/**
 * Extrai o usuário humano responsável a partir do `action` codificado.
 *
 * @param {string|null} action Ação possivelmente codificada.
 * @returns {string|null} Usuário responsável ou `null`.
 */
function decodeBy(action: any) {
    if (typeof action !== 'string') return null;
    const m = action.match(/\[by:([^\]]*)\]/);
    return m ? m[1] : null;
}

/**
 * Registra proveniência de um módulo (DELEGA a `tagRegionProvenance`).
 *
 * Não cria cadeia própria: apenas calcula o `regionId` e chama o motor.
 * ENFORCE (BP3): se `actor === 'ai'` é obrigatório informar quem operou
 * a IA (`aiOperatedByUser`) — contribuição de IA nunca fica órfã.
 *
 * @param {{ regions: Object }} store Store de proveniência (do motor).
 * @param {string} store Identificador do módulo/handler.
 * @param {Object} moduleId Dados do registro.
 * @param {'developed'|'validated'} input.role Papel de proveniência.
 * @param {'human'|'ai'} input.actor Quem realizou a ação.
 * @param {string} [input.byUser] Usuário humano (se actor='human').
 * @param {string} [input.aiSystem] Sistema de IA (se actor='ai').
 * @param {string} [input.aiVersion] Versão do sistema de IA.
 * @param {string} [input.aiOperatedByUser] Humano que operou a IA.
 * @param {string} [input.action] Ação realizada (texto livre).
 * @param {number} [input.charsInserted] Caracteres inseridos.
 * @returns {{ regions: Object }} O mesmo store, mutado pelo motor.
 */
export function recordModuleProvenance(store: any, moduleId: any, input: any) {
    const i = input || {};
    const role = i.role;
    if (!ROLES.includes(role)) {
        throw new Error(`role must be one of: ${ROLES.join(', ')}`);
    }
    const actor = i.actor === 'ai' ? 'ai' : 'human';
    if (actor === 'ai' && (i.aiOperatedByUser == null || i.aiOperatedByUser === '')) {
        throw new Error('aiOperatedByUser required when actor is ai');
    }
    const by = actor === 'ai' ? i.aiOperatedByUser : i.byUser;
    const entry = {
        actor,
        aiSystem: i.aiSystem !== undefined ? i.aiSystem : null,
        aiVersion: i.aiVersion !== undefined ? i.aiVersion : null,
        action: encodeBy(i.action != null ? i.action : null, by),
    };
    if (i.aiPromptInformation !== undefined) (entry as any).aiPromptInformation = i.aiPromptInformation;
    if (i.promptInformation !== undefined) (entry as any).promptInformation = i.promptInformation;
    return tagRegionProvenance(store, moduleRegionId(moduleId, role), entry);
}

/**
 * Resolve o usuário responsável de um papel a partir da cadeia do motor.
 * Usa a última entrada que carrega um `[by:...]` codificado.
 *
 * @param {{ regions: Object }} store Store de proveniência.
 * @param {string} store Identificador do módulo.
 * @param {'developed'|'validated'} moduleId Papel.
 * @returns {{ by: string|null, ai: { aiSystem: string|null, aiVersion: string|null } }}
 */
function resolveRole(store: any, moduleId: any, role: any) {
    const region = store.regions[moduleRegionId(moduleId, role)];
    const chain = region && Array.isArray(region.chain) ? region.chain : [];
    let by = null;
    let aiSystem = null;
    let aiVersion = null;
    for (const entry of chain) {
        const dec = decodeBy(entry.action);
        if (dec != null) by = dec;
        if (entry.actor === 'ai') {
            if (entry.aiSystem != null) aiSystem = entry.aiSystem;
            if (entry.aiVersion != null) aiVersion = entry.aiVersion;
        }
    }
    return { by, ai: { aiSystem, aiVersion } };
}

/**
 * Lê a proveniência consolidada de um módulo (autoria DELEGADA ao motor).
 *
 * `authorship` de cada papel vem de `getRegionAuthorship` (não recalcula).
 * Backward-safe: módulo sem proveniência → autoria 'human' nos dois papéis
 * (comportamento herdado do motor — não há caso especial aqui).
 *
 * @param {{ regions: Object }} store Store de proveniência.
 * @param {string} store Identificador do módulo.
 * @returns {{ moduleId: string, developed: Object, validated: Object,
 *   summary: Object, chain: Object }}
 */
export function getModuleProvenance(store: any, moduleId: any) {
    const out = { moduleId };
    const chain = {};
    for (const role of ROLES) {
        const regionId = moduleRegionId(moduleId, role);
        const authorship = getRegionAuthorship(store, regionId);
        const resolved = resolveRole(store, moduleId, role);
        (out as any)[role] = { authorship, by: resolved.by, ai: resolved.ai };
        const region = store.regions[regionId];
        (chain as any)[role] = region && Array.isArray(region.chain) ? region.chain.slice() : [];
    }
    (out as any).chain = chain;
    (out as any).summary = {
        developed: (out as any).developed.authorship,
        validated: (out as any).validated.authorship,
    };
    return out;
}

/**
 * Exporta um SBOM mínimo do módulo reutilizando `toDisclosureMetadata`
 * (privacy-aware: `stripPrompt` padrão `true` — NUNCA expõe prompt).
 *
 * O SBOM é restringido às DUAS regiões do módulo (developed/validated).
 *
 * @param {{ regions: Object }} store Store de proveniência.
 * @param {string} store Identificador do módulo.
 * @param {Object} [moduleId] Opções.
 * @param {boolean} [opts.stripPrompt=true] Remove texto de prompt.
 * @returns {{ moduleId: string, components: Array }} SBOM mínimo.
 */
export function exportModuleSbom(store: any, moduleId: any, opts: any) {
    const stripPrompt = !opts || opts.stripPrompt === undefined ? true : Boolean(opts.stripPrompt);
    const disclosure = toDisclosureMetadata(store, { stripPrompt });
    const byId = {};
    for (const r of disclosure.regions) (byId as any)[r.id] = r;
    const components = ROLES.map((role) => {
        const r = (byId as any)[moduleRegionId(moduleId, role)] || {};
        return {
            role,
            authorship: r.authorship !== undefined ? r.authorship : 'human',
            aiSystem: r.aiSystem !== undefined ? r.aiSystem : null,
            aiVersion: r.aiVersion !== undefined ? r.aiVersion : null,
        };
    });
    return { moduleId, components };
}
