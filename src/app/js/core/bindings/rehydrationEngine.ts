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
   REHYDRATION ENGINE — Reconstrucao de bindings a partir de manifest
   (SPEC TIER3-FEATURES-001 / B7 Coordinate Bindings)

   Dado um manifest serializado (vindo de export/import ECBT ou de
   serializeRegistry()), reconstroi e re-registra os bindings via
   bindingRegistry. Puro: sem DOM, sem rede.

   Defensivo por contrato: manifest malformado NUNCA lanca excecao;
   entradas invalidas vao para `skipped` com o motivo.
   ================================================================ */

import { registerBinding } from './bindingRegistry.js';

/**
 * @typedef {import('./bindingRegistry.js').RegistryBinding} RegistryBinding
 */

/**
 * Validate a single binding-like entry. Returns a reason string if
 * invalid, or null if it is acceptable for registration.
 *
 * @param {any} entry - Candidate binding entry
 * @returns {string|null} Reason for skip, or null if valid
 */
function _validateEntry(entry: any) {
    if (!entry || typeof entry !== 'object') return 'not-an-object';
    if (entry.targetId != null && typeof entry.targetId !== 'string') return 'invalid-targetId';
    if (entry.targetPath != null && typeof entry.targetPath !== 'string') return 'invalid-targetPath';
    return null;
}

/**
 * Normalize a manifest into an iterable of `[entityId, bindings[]]`.
 * Aceita dois formatos: o objeto de serializeRegistry()
 * (`{ entities: {...} }`) ou um mapa direto entityId -> bindings[].
 *
 * @param {any} manifest - Manifest serializado
 * @returns {Array<[string, any[]]>} Pares normalizados (vazio se invalido)
 */
function _normalizeManifest(manifest: any) {
    if (!manifest || typeof manifest !== 'object') return [];
    const source = manifest.entities && typeof manifest.entities === 'object' ? manifest.entities : manifest;
    if (!source || typeof source !== 'object') return [];
    return Object.entries(source).filter(
        ([id, list]) => typeof id === 'string' && id.length > 0 && Array.isArray(list),
    );
}

/**
 * Rehydrate bindings for a specific entity from a serialized manifest.
 * Reconstroi e re-registra os bindings da entidade `entityId`
 * encontrados no manifest. Nunca lanca: erros viram itens em `skipped`.
 *
 * @param {string} entityId - ID da entidade-alvo
 * @param {any} manifest - Manifest serializado (objeto ou mapa)
 * @returns {{ rehydrated: number, skipped: Array<{ index: number, reason: string }> }}
 */
export function rehydrateBindings(entityId: any, manifest: any) {
    /** @type {{ rehydrated: number, skipped: Array<{ index: number, reason: string }> }} */
    const result: { rehydrated: number; skipped: Array<{ index: number; reason: string }> } = { rehydrated: 0, skipped: [] };

    if (!entityId || typeof entityId !== 'string') {
        result.skipped.push({ index: -1, reason: 'invalid-entityId' });
        return result;
    }

    const pairs = _normalizeManifest(manifest);
    if (pairs.length === 0) {
        result.skipped.push({ index: -1, reason: 'empty-or-malformed-manifest' });
        return result;
    }

    const match = pairs.find(([id]) => id === entityId);
    if (!match) {
        result.skipped.push({ index: -1, reason: 'entity-not-in-manifest' });
        return result;
    }

    const list = match[1] as any[];
    list.forEach((entry: any, index: any) => {
        const reason = _validateEntry(entry);
        if (reason) {
            result.skipped.push({ index, reason });
            return;
        }
        const ok = registerBinding(entityId, /** @type {RegistryBinding} */ (entry));
        if (ok) result.rehydrated++;
        else result.skipped.push({ index, reason: 'register-failed' });
    });

    return result;
}
