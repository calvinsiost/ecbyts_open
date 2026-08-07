// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   BINDING REGISTRY — Registro em memoria de bindings por entidade
   (SPEC TIER3-FEATURES-001 / B7 Coordinate Bindings)

   Mantem um indice in-memory de bindings agrupados por entityId.
   Puro: sem DOM, sem rede, sem localStorage. Retornos congelados
   (Object.freeze) para impedir mutacao acidental pelo consumidor.

   Complementa core/bindings/resolver.js (resolucao lazy) provendo
   a camada de persistencia logica que rehydrationEngine.js e o
   summaryProvider.js consomem.
   ================================================================ */

/**
 * @typedef {Object} RegistryBinding
 * @property {string} [field] - Campo-alvo na entidade (ex: 'z', 'date')
 * @property {string} [targetType] - Tipo da entidade-alvo
 * @property {string} [targetId] - ID da entidade-alvo
 * @property {string} [targetPath] - Dot-path no alvo
 * @property {string} [transform] - ID do transform aplicado
 * @property {Object} [transformArgs] - Argumentos do transform
 * @property {string} [status] - Status de resolucao
 * @property {string} [updatedAt] - ISO timestamp da ultima atualizacao
 */

/**
 * Registro interno: entityId -> array de bindings.
 * @type {Map<string, RegistryBinding[]>}
 */
const _registry = new Map();

/**
 * Register (append) a binding for an entity.
 * Registra um binding para a entidade. Cria a lista se nao existir.
 *
 * @param {string} entityId - ID da entidade dona do binding
 * @param {RegistryBinding} binding - Definicao do binding
 * @returns {boolean} true se registrado; false se input invalido
 */
export function registerBinding(entityId: any, binding: any) {
    if (!entityId || typeof entityId !== 'string') return false;
    if (!binding || typeof binding !== 'object') return false;

    const list = _registry.get(entityId) || [];
    list.push({ ...binding, updatedAt: binding.updatedAt || new Date().toISOString() });
    _registry.set(entityId, list);
    return true;
}

/**
 * Get all bindings registered for an entity (frozen copy).
 * Retorna copia congelada da lista de bindings da entidade.
 *
 * @param {string} entityId - ID da entidade
 * @returns {ReadonlyArray<Readonly<RegistryBinding>>} Lista congelada (vazia se nenhum)
 */
export function getBindings(entityId: any) {
    if (!entityId || typeof entityId !== 'string') return Object.freeze([]);
    const list = _registry.get(entityId);
    if (!Array.isArray(list)) return Object.freeze([]);
    return Object.freeze(list.map((b) => Object.freeze({ ...b })));
}

/**
 * Clear bindings for one entity, or the entire registry if no id given.
 * Limpa os bindings de uma entidade, ou o registro inteiro se entityId
 * for omitido.
 *
 * @param {string} [entityId] - ID da entidade (opcional)
 * @returns {number} Numero de entidades afetadas
 */
export function clearBindings(entityId: any) {
    if (entityId == null) {
        const size = _registry.size;
        _registry.clear();
        return size;
    }
    if (typeof entityId !== 'string') return 0;
    return _registry.delete(entityId) ? 1 : 0;
}

/**
 * Serialize the full registry to a plain object (deep-cloned).
 * Serializa o registro inteiro para um objeto simples (clonado),
 * adequado para persistencia/export.
 *
 * @returns {{ version: number, entities: Record<string, RegistryBinding[]> }}
 */
export function serializeRegistry() {
    /** @type {Record<string, RegistryBinding[]>} */
    const entities: Record<string, any[]> = {};
    for (const [entityId, list] of _registry.entries()) {
        entities[entityId] = list.map((b: any) => ({
            ...b
        }));
    }
    return { version: 1, entities };
}

/**
 * Hydrate the registry from a serialized object (replaces current state).
 * Reconstroi o registro a partir de um objeto serializado. Defensivo:
 * entradas malformadas sao ignoradas em vez de lancar excecao.
 *
 * @param {{ entities?: Record<string, any> }|null|undefined} obj - Objeto serializado
 * @returns {{ entities: number, bindings: number }} Contagem aplicada
 */
export function hydrateRegistry(obj: any) {
    _registry.clear();
    const stats = { entities: 0, bindings: 0 };
    const entities = obj && typeof obj === 'object' ? obj.entities : null;
    if (!entities || typeof entities !== 'object') return stats;

    for (const [entityId, list] of Object.entries(entities)) {
        if (!entityId || !Array.isArray(list)) continue;
        const clean = list.filter((b) => b && typeof b === 'object').map((b) => ({ ...b }));
        if (clean.length === 0) continue;
        _registry.set(entityId, clean);
        stats.entities++;
        stats.bindings += clean.length;
    }
    return stats;
}
