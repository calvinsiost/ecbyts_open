// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   VALIDATOR BINDINGS PURE (Module C extraction)
   ================================================================

   Validação de bindings extraída de core/io/validator.ts. Determinística
   dado input (muta obj.bindings + warnings array, mesmo padrão que
   validateModel adota internamente). Testável sem DOM/Three.

   Bindings vivem em observations + element.data e ligam um campo
   ("targetPath") a uma fonte externa (targetType + targetId). Validator
   limpa bindings malformados, normaliza defaults e marca status "stale"
   quando indefinido — NUNCA rejeita bindings quebrados (preserva com
   status 'broken' para diagnóstico downstream).
   ================================================================ */

type AnyRecord = Record<string, any>;

export const VALID_BINDING_TARGET_TYPES: ReadonlySet<string> = new Set([
    'element',
    'campaign',
    'calculator',
    'observation',
    'coordinate',
]);

export const VALID_BINDING_STATUSES: ReadonlySet<string> = new Set(['ok', 'broken', 'stale', 'circular']);

interface BindingValidation {
    keep: boolean;
    warning?: string;
}

/**
 * Inspeciona um único binding e decide se deve ser mantido ou removido.
 * Quando mantido, normaliza transform/transformArgs/status no próprio objeto.
 */
function _validateSingleBinding(field: string, binding: AnyRecord, parentId: string): BindingValidation {
    if (!binding || typeof binding !== 'object') {
        return { keep: false };
    }
    if (!binding.targetType || !binding.targetId || !binding.targetPath) {
        return {
            keep: false,
            warning: `Element "${parentId}": binding for "${field}" missing required fields, removing`,
        };
    }
    if (!VALID_BINDING_TARGET_TYPES.has(binding.targetType)) {
        return {
            keep: false,
            warning: `Element "${parentId}": binding for "${field}" has unknown targetType "${binding.targetType}", removing`,
        };
    }
    // Defaults normalizados
    if (!binding.transform) binding.transform = 'identity';
    if (!binding.transformArgs) binding.transformArgs = {};
    if (!VALID_BINDING_STATUSES.has(binding.status)) binding.status = 'stale';
    return { keep: true };
}

/**
 * Valida bindings em um objeto (observation ou element.data). Muta
 * obj.bindings (remove inválidos, normaliza defaults) e empurra
 * mensagens em warnings array.
 *
 * Comportamento preservado byte-a-byte do _validateBindings legado:
 *   - bindings não-objeto ou array → remove + warning.
 *   - binding sem targetType/targetId/targetPath → remove + warning.
 *   - targetType desconhecido → remove + warning.
 *   - transform/transformArgs ausentes → defaults 'identity'/{}.
 *   - status inválido → 'stale' (não rejeita; mantém binding).
 *   - bindings vazio após limpeza → delete obj.bindings.
 *
 * @param obj — observation ou element.data com optional .bindings
 * @param warnings — array push-only para acumulação de warnings
 * @param parentId — id do elemento pai (para warning prefix)
 */
export function validateBindings(obj: AnyRecord, warnings: string[], parentId: string): void {
    if (!obj?.bindings) return;
    // bindings deve ser objeto simples (não-array)
    if (typeof obj.bindings !== 'object' || Array.isArray(obj.bindings)) {
        warnings.push(`Element "${parentId}": bindings is not an object, removing`);
        delete obj.bindings;
        return;
    }
    const toRemove: string[] = [];
    for (const [field, binding] of Object.entries(obj.bindings) as [string, AnyRecord][]) {
        const { keep, warning } = _validateSingleBinding(field, binding, parentId);
        if (warning) warnings.push(warning);
        if (!keep) toRemove.push(field);
    }
    for (const field of toRemove) {
        delete obj.bindings[field];
    }
    if (Object.keys(obj.bindings).length === 0) {
        delete obj.bindings;
    }
}
