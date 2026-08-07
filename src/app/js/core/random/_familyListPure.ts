// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   FAMILY-LIST — pure-logic.

   Deriva, sem DOM, as listas de IDs de família que o family-select
   modal renderiza:
     - modo "random": as RANDOM_FAMILIES que existem no catálogo
       (filtra ids cujo registro não está presente);
     - modo "clear":  as famílias do catálogo que têm pelo menos uma
       instância (count > 0), preservando a ordem de Object.keys.

   Extraído de utils/ui/familySelectModal.ts (_buildFamilyCheckboxes
   e _renderFlat). A montagem do HTML, ícones, nomes traduzidos e o
   estado "checked" (que dependem de DOM / i18n / seleção salva)
   permanecem no caller; ESTAS funções são só o filtro determinístico
   da lista de ids — sem DOM/rede/IO.

   Comportamento legado preservado byte-a-byte:
     - random: `RANDOM_FAMILIES.filter((id) => allFamilies[id])`
       (truthy-guard no registro da família);
     - clear:  `Object.keys(familyMap).filter((id) => (counts[id] || 0) > 0)`
       (count ausente → 0 → excluído; ordem de Object.keys preservada).
   ================================================================ */

/**
 * IDs de família para o modo "random": ordem fixa de `order`, mantendo
 * apenas as que existem no catálogo (registro truthy).
 *
 * Equivalente a `RANDOM_FAMILIES.filter((id) => allFamilies[id])`.
 *
 * @param order    ordem canônica das famílias random (RANDOM_FAMILIES).
 * @param catalog  catálogo de famílias indexado por id (getAllFamilies()).
 * @returns ids presentes no catálogo, na ordem de `order`.
 */
export function randomFamilyIds(
    order: ReadonlyArray<string>,
    catalog: Readonly<Record<string, unknown>>,
): string[] {
    return order.filter((id) => Boolean(catalog[id]));
}

/**
 * IDs de família para o modo "clear": todas as chaves do catálogo que
 * têm contagem > 0, preservando a ordem de iteração de Object.keys.
 *
 * Equivalente a `Object.keys(familyMap).filter((id) => (counts[id] || 0) > 0)`.
 * Contagem ausente/não-finita degrada para 0 (excluída), igual ao legado
 * `counts[id] || 0`.
 *
 * @param catalog  catálogo de famílias indexado por id.
 * @param unknown>>   contagem por família (countByFamily()).
 * @returns ids com pelo menos uma instância, na ordem de Object.keys(catalog).
 */
export function clearableFamilyIds(
    catalog: Readonly<Record<string, unknown>>,
    counts: Readonly<Record<string, number>>,
): string[] {
    return Object.keys(catalog).filter((id) => (counts[id] || 0) > 0);
}

/** Estado puro de uma linha de checkbox de família (sem DOM/i18n/ícone). */
export type FamilyRowState = Readonly<{
    /** id da família (chave do catálogo). */
    id: string;
    /** marcado por padrão? `saved ? saved.has(id) : true` (legado). */
    checked: boolean;
    /** contagem de instâncias da família (`counts[id] || 0`); 0 se sem counts. */
    count: number;
}>;

/**
 * Deriva, para cada id de família, o estado PURO da sua linha de checkbox:
 * `checked` (a partir da seleção salva) e `count` (a partir das contagens).
 *
 * Extraído de utils/ui/familySelectModal.ts (_renderFlat e _buildFamilyCheckboxes),
 * onde a MESMA decisão ternária `saved ? saved.has(id) : true` (e, no clear,
 * `counts[id] || 0`) vivia duplicada dentro de closures de `.map` aninhadas.
 * O nome/ícone traduzido e a montagem do HTML permanecem no caller (DOM/i18n);
 * ESTA função é só o estado determinístico por linha — sem DOM/rede/IO.
 *
 * Semântica legada preservada byte-a-byte:
 *   - `checked`: se `saved` for um Set, `saved.has(id)`; senão (null/ausente) `true`;
 *   - `count`:  `counts[id] || 0` (ausente/não-finito/0 → 0). Sem `counts` → 0.
 *
 * @param ids     ids de família já filtrados (random/clear), na ordem de render.
 * @param saved   seleção salva (Set de ids) ou null/undefined (default: tudo marcado).
 * @param counts?  contagem por família (opcional; ausente → count 0 em todas).
 * @returns linhas congeladas { id, checked, count }, na ordem de `ids`.
 */
export function familyRowStates(
    ids: ReadonlyArray<string>,
    saved: ReadonlySet<string> | null | undefined,
    counts?: Readonly<Record<string, number>>,
): ReadonlyArray<FamilyRowState> {
    return ids.map((id) =>
        Object.freeze({
            id,
            checked: saved ? saved.has(id) : true,
            count: counts ? counts[id] || 0 : 0,
        }),
    );
}
