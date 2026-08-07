// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CHAT CONTEXT REF PURE — RF-10 (V2): sala ancorada a contexto
   SPEC_USER_CHAT_WITH_LLM_AGENTS (USER-CHAT-LLM-001) §2.2 RF-10.

   Camada de DECISÃO pura, testável sem browser. Valida o shape do
   jsonb `chat_rooms.context_ref` (coluna já prevista no schema da
   migration 20260621120001, fora do V1). A UI de CRIAR sala com
   contexto é V2 (não existe ainda) — por isto este módulo é
   build-free (sem consumer no browser; sem mirror em app/js/**).

   context_ref descreve a ANCORA da conversa:
     - kind='model'      → sala sobre um modelo específico
     - kind='family'     → sala sobre uma família de elemento
                            (qualquer família habilitada em
                            config/families.ts DEFAULT_FAMILIES;
                            ex.: emission_source/waste_stream/well)
     - kind='ecbt_score' → sala sobre um número de ECBT Score

   PURE-LOGIC: o catálogo de famílias é INJETADO pelo caller
   (test/UI V2 lê config/families.ts e passa como Set). Isto mantém
   este módulo livre de imports do projeto (compatível com Node
   --experimental-strip-types sem espelhar .js) e testável em
   isolamento. O banco armazena o jsonb; a validação contra o
   catálogo de famílias (que evolui no tempo) vive aqui em
   pure-logic — não hardcoded em SQL (frágil). Quando a UI V2
   chegar, ela injeta DEFAULT_FAMILIES antes de chamar o RPC.

   Tests: tests/chat-context-ref-pure.test.mjs
   ================================================================ */

// ----------------------------------------------------------------
// TIPOS DE DOMÍNIO
// ----------------------------------------------------------------

/** Natureza da âncora de contexto de uma sala (V2). */
export type ContextRefKind = 'model' | 'family' | 'ecbt_score';

/**
 * View canônica de context_ref (V2). Espelha o jsonb de
 * `chat_rooms.context_ref`. Todos os campos além de `kind` são
 * opcionais e interpretados conforme o kind (ver validateContextRef).
 */
export interface ContextRef {
    readonly kind: ContextRefKind;
    /** kind='model': id do modelo. */
    readonly modelId?: string;
    /** kind='family': id da família (no catálogo injetado). */
    readonly family?: string;
    /** kind='ecbt_score': número do score. */
    readonly ecbtScore?: number;
    /** Opcional: id de elemento específico dentro do modelo/família. */
    readonly elementId?: string;
}

/** Resultado de validação de context_ref (espelha MessageValidation). */
export interface ContextRefValidation {
    readonly ok: boolean;
    readonly errors: ReadonlyArray<string>;
}

/**
 * Catálogo de famílias aceitas. Praticamente sempre
 * `new Set(Object.keys(DEFAULT_FAMILIES))` vindas de
 * config/families.ts; o caller injeta. Default = vazio (defensivo:
 * sem catálogo, nenhuma família é aceita).
 */
export type FamilyCatalog = ReadonlySet<string>;

// ----------------------------------------------------------------
// CONSTANTES
// ----------------------------------------------------------------

/** Kinds aceitos pelo context_ref (V2). */
export const CONTEXT_REF_KINDS: ReadonlyArray<ContextRefKind> = [
    'model',
    'family',
    'ecbt_score',
];

const CONTEXT_REF_KIND_SET: ReadonlySet<string> = new Set(CONTEXT_REF_KINDS);

// ----------------------------------------------------------------
// VALIDAÇÃO (RF-10)
// ----------------------------------------------------------------

/**
 * Valida o jsonb context_ref de chat_rooms (RF-10 V2).
 *
 * Regras:
 *   - null/undefined → OK (context_ref é opcional; sala sem âncora).
 *   - não-objeto (array/primitivo) → ERR_CONTEXT_REF_NOT_OBJECT.
 *   - kind ausente/inválido → ERR_CONTEXT_REF_INVALID_KIND.
 *   - kind='model'      → modelId é string não-vazia.
 *   - kind='family'     → family é string presente no catálogo injetado.
 *   - kind='ecbt_score' → ecbtScore é número finito.
 *
 * Não valida permissões (isso é cross-table, fica no RPC V2). Não
 * valida que o modelo/elemento existe (isso é lookup no banco, não
 * pure-logic). Apenas o SHAPE é validado aqui.
 *
 * @param ref            jsonb vindo do banco ou montado pela UI V2.
 * @param familyCatalog  Set de ids de família habilitadas; default
 *                       = Set vazio (nenhuma família aceita).
 */
export function validateContextRef(
    ref: unknown,
    familyCatalog: FamilyCatalog = new Set<string>(),
): ContextRefValidation {
    if (ref === null || ref === undefined) {
        return { ok: true, errors: [] };
    }
    if (typeof ref !== 'object' || Array.isArray(ref)) {
        return { ok: false, errors: ['ERR_CONTEXT_REF_NOT_OBJECT'] };
    }
    const obj = ref as Record<string, unknown>;
    const errors: string[] = [];

    const kind = obj.kind;
    if (typeof kind !== 'string' || !CONTEXT_REF_KIND_SET.has(kind)) {
        errors.push('ERR_CONTEXT_REF_INVALID_KIND');
        return { ok: false, errors };
    }

    switch (kind as ContextRefKind) {
        case 'model': {
            const modelId = obj.modelId;
            if (typeof modelId !== 'string' || modelId.trim().length === 0) {
                errors.push('ERR_CONTEXT_REF_NO_MODEL_ID');
            }
            break;
        }
        case 'family': {
            const family = obj.family;
            if (typeof family !== 'string' || !familyCatalog.has(family)) {
                errors.push('ERR_CONTEXT_REF_INVALID_FAMILY');
            }
            break;
        }
        case 'ecbt_score': {
            const score = obj.ecbtScore;
            if (typeof score !== 'number' || !Number.isFinite(score)) {
                errors.push('ERR_CONTEXT_REF_INVALID_SCORE');
            }
            break;
        }
    }

    // elementId é opcional, mas se presente deve ser string não-vazia.
    const elementId = obj.elementId;
    if (
        elementId !== undefined &&
        (typeof elementId !== 'string' || elementId.trim().length === 0)
    ) {
        errors.push('ERR_CONTEXT_REF_INVALID_ELEMENT_ID');
    }

    return { ok: errors.length === 0, errors };
}

/**
 * Convenience booleano sobre validateContextRef.
 * Aceita os mesmos parâmetros (ref + familyCatalog opcional).
 */
export function isValidContextRef(
    ref: unknown,
    familyCatalog?: FamilyCatalog,
): boolean {
    return validateContextRef(ref, familyCatalog).ok;
}

/**
 * Helper para o caller (UI V2 / teste) montar o catálogo a partir do
 * registro DEFAULT_FAMILIES de config/families.ts. Mantém o módulo
 * pure mas documentado: o caller injeta o resultado desta função.
 *
 * Exemplo: `const catalog = familyCatalogFrom(DEFAULT_FAMILIES);`
 */
export function familyCatalogFrom(
    families: Record<string, { enabled?: boolean }>,
): Set<string> {
    const out = new Set<string>();
    for (const id of Object.keys(families)) {
        if (families[id]?.enabled !== false) out.add(id);
    }
    return out;
}
