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
   HANDLER SUMMARY PROVIDER — Resumo de bindings por entidade
   (SPEC TIER3-FEATURES-001 / B7 Coordinate Bindings)

   Agregacao pura sobre o bindingRegistry para alimentar a UI
   read-only do inspetor. Sem DOM nesta camada de dados; o handler
   `handleEntityBindingsSummary` apenas expoe o resumo a window.*.
   ================================================================ */
import { getBindings } from '../../core/bindings/bindingRegistry.js';
/**
 * Build a read-only summary of the bindings registered for an entity.
 * Agrega contagem, tipos distintos e ultima atualizacao a partir do
 * bindingRegistry. Pura: nao muta estado nem toca o DOM.
 *
 * @param {string} entityId - ID da entidade
 * @returns {HandlerSummary} Resumo agregado (zerado se entidade invalida)
 */
export function getHandlerSummary(entityId: any) {
    const empty = { entityId: String(entityId || ''), bindingCount: 0, types: [], lastUpdated: null };
    if (!entityId || typeof entityId !== 'string')
        return empty;
    const bindings = getBindings(entityId);
    if (!bindings.length)
        return empty;
    const typeSet = new Set();
    let lastUpdated = null;
    for (const b of bindings) {
        if (b && typeof b.targetType === 'string' && b.targetType)
            typeSet.add(b.targetType);
        if (b && typeof b.updatedAt === 'string' && (lastUpdated == null || b.updatedAt > lastUpdated)) {
            lastUpdated = b.updatedAt;
        }
    }
    return {
        entityId,
        bindingCount: bindings.length,
        types: Array.from(typeSet).sort(),
        lastUpdated,
    };
}
/**
 * window.* handler: returns the binding summary for an entity.
 * Exposto a UI (inspetor) como ponto de entrada read-only.
 *
 * @param {string} entityId - ID da entidade selecionada
 * @returns {HandlerSummary}
 */
export function handleEntityBindingsSummary(entityId: any) {
    return getHandlerSummary(entityId);
}
export const summaryProviderHandlers = {
    handleEntityBindingsSummary,
};
//# sourceMappingURL=summaryProvider.js.map
