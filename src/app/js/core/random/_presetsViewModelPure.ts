// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PRESETS-VIEW-MODEL — pure-logic.

   Agrupa os presets ambientais por categoria para a aba "Presets"
   do family-select modal, descartando categorias vazias e
   pré-derivando a string "famílias" exibida em cada card.

   Extraído de utils/ui/familySelectModal.ts (_populatePresetsPanel).
   O lazy import do registry, a tradução (t()), o escape de HTML e o
   innerHTML permanecem no caller (impuros); ESTA função é só a
   transformação determinística (categorias + presets → view-model)
   — sem DOM/rede/IO/i18n.

   Comportamento legado preservado byte-a-byte:
     - itera PRESET_CATEGORIES na ordem dada;
     - resolve cada id via PRESETS.find(p => p.id === id), descartando
       não-encontrados (filter(Boolean));
     - pula categorias cujo conjunto resolvido ficou vazio;
     - cada card carrega `families = p.families.join(', ')`.
   As chaves de tradução (cat.nameKey, p.nameKey, p.descriptionKey) e
   os campos crus (id, icon) são repassados intactos para o caller
   traduzir/escapar — esta camada NÃO traduz nem escapa.
   ================================================================ */

/** Categoria de presets (subset usado pela view-model). */
export interface PresetCategoryInput {
    /** Id estável da categoria. */
    id: string;
    /** Chave de tradução do rótulo da categoria. */
    nameKey: string;
    /** Ids dos presets pertencentes à categoria (ordem de exibição). */
    presets: ReadonlyArray<string>;
}

/** Preset (subset de campos consumidos pelo card). */
export interface PresetInput {
    /** Id estável do preset. */
    id: string;
    /** Chave de tradução do nome. */
    nameKey?: string;
    /** Chave de tradução da descrição. */
    descriptionKey?: string;
    /** Glifo/ícone (HTML entity já pronta). */
    icon?: string;
    /** Famílias geradas pelo preset. */
    families?: ReadonlyArray<string>;
}

/** Card de preset pronto para render (campos crus, sem tradução/escape). */
export interface PresetCardViewModel {
    id: string;
    nameKey?: string;
    descriptionKey?: string;
    icon?: string;
    /** `preset.families.join(', ')` (legado). String vazia se sem famílias. */
    families: string;
}

/** Categoria não-vazia com seus cards resolvidos. */
export interface PresetCategoryViewModel {
    id: string;
    nameKey: string;
    cards: PresetCardViewModel[];
}

/**
 * Constrói a view-model agrupada da aba Presets.
 *
 * Equivalente byte-a-byte ao laço de `_populatePresetsPanel`:
 *   para cada categoria, resolve ids → presets (descartando ausentes),
 *   pula categorias vazias, e deriva `families` por card.
 *
 * @param categories PRESET_CATEGORIES (ordem preservada).
 * @param presets    PRESETS (catálogo completo p/ lookup por id).
 * @returns lista ordenada de categorias não-vazias com seus cards.
 */
export function buildPresetsViewModel(
    categories: ReadonlyArray<PresetCategoryInput>,
    presets: ReadonlyArray<PresetInput>,
): PresetCategoryViewModel[] {
    const out: PresetCategoryViewModel[] = [];
    for (const cat of categories) {
        const resolved = cat.presets
            .map((id) => presets.find((p) => p.id === id))
            .filter((p): p is PresetInput => Boolean(p));
        if (resolved.length === 0) continue;
        out.push({
            id: cat.id,
            nameKey: cat.nameKey,
            cards: resolved.map((p) => {
                const card: PresetCardViewModel = {
                    id: p.id,
                    families: (p.families || []).join(', '),
                };
                if (p.nameKey !== undefined) card.nameKey = p.nameKey;
                if (p.descriptionKey !== undefined) card.descriptionKey = p.descriptionKey;
                if (p.icon !== undefined) card.icon = p.icon;
                return card;
            }),
        });
    }
    return out;
}
