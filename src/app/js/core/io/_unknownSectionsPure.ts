// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   UNKNOWN SECTIONS — pure logic (CONSIST-OBS-001 B5b)

   Forward-compat de seções de LIBRARY na chave ECBT, padrão protobuf
   unknown-fields / Confluent schema evolution:

   Uma library instalada (S4) pode gravar seção própria no modelo sob
   o namespace `lib:<libId>:<section>`. Um cliente SEM essa library
   (ou versão antiga do app) que importa→edita→exporta a chave NÃO
   pode DROPAR a seção — perderia dado de terceiro silenciosamente.

   B5 nível-chave (DONE 2026-05-28): encode→decode preserva.
   B5b nível-restore (este módulo): applyModel captura as seções
   desconhecidas num bag e buildModel re-emite no export.

   Escopo DELIBERADO: apenas namespace `lib:` — re-emitir qualquer
   chave desconhecida ressuscitaria campos internos removidos por
   migração de schema (anti-feature). Libraries são o contrato
   forward-compat; o resto é governado por runModelMigrations.

   Pure: sem DOM, sem estado — testável via node:test.
   ================================================================ */

/** Prefixo canônico de seção de library na chave ECBT (S4/B5). */
export const LIB_SECTION_PREFIX = 'lib:';

/** Shape: `lib:<libId>:<section>` — libId e section não-vazios. */
const LIB_SECTION_RE = /^lib:[^:\s]+:[^:\s][^\s]*$/;

/** Type-guard de nome de seção de library válido. */
export function isLibSectionKey(key: unknown): key is string {
    return typeof key === 'string' && LIB_SECTION_RE.test(key);
}

/**
 * Extract unknown library sections from an imported model.
 * Retorna bag frozen apenas com chaves `lib:<id>:<section>` válidas.
 * Valores são mantidos por referência (payload opaco — não tocamos).
 */
export function extractUnknownSections(model: unknown): Readonly<Record<string, unknown>> {
    const bag: Record<string, unknown> = {};
    if (model && typeof model === 'object' && !Array.isArray(model)) {
        for (const [k, v] of Object.entries(model as Record<string, unknown>)) {
            if (isLibSectionKey(k) && v !== undefined) bag[k] = v;
        }
    }
    return Object.freeze(bag);
}

/**
 * Merge preserved sections back into an export model WITHOUT mutating it.
 * Chave já presente no export VENCE (library re-instalada regravou a
 * seção — o dado vivo é mais novo que o preservado no import).
 */
export function mergeUnknownSections(
    exportModel: Record<string, unknown>,
    bag: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, unknown> {
    if (!exportModel || typeof exportModel !== 'object') return exportModel;
    if (!bag || typeof bag !== 'object') return exportModel;
    const out = { ...exportModel };
    for (const [k, v] of Object.entries(bag)) {
        if (!isLibSectionKey(k)) continue;
        if (k in out && out[k] !== undefined) continue; // dado vivo vence
        out[k] = v;
    }
    return out;
}

/** Contagem de seções no bag (telemetria/toast de import). */
export function countUnknownSections(bag: Readonly<Record<string, unknown>> | null | undefined): number {
    if (!bag || typeof bag !== 'object') return 0;
    return Object.keys(bag).filter(isLibSectionKey).length;
}
