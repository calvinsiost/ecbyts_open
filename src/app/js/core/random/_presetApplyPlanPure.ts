// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PRESET-APPLY-PLAN — pure-logic.

   Deriva, a partir de um preset, o "plano" do que aplicar ao
   family-select modal: quais famílias marcar, quais sliders ajustar,
   quais segmented-buttons (siteSize/contaminationLevel) ativar e
   quais toggles booleanos setar.

   Extraído de utils/ui/familySelectModal.ts (_applyPresetToModal). A
   mutação do DOM (checkboxes, sliders, segmented, toggles), o
   _formatSliderOutput, a persistência do preset ativo, a troca de aba
   e o toast permanecem no caller (impuros); ESTA função é só a
   transformação determinística (preset → plano) — sem DOM/rede/IO.

   Comportamento legado preservado:
     - famílias: `new Set(preset.families)` (marca essas, desmarca o resto);
     - sliders: itera TODAS as chaves de generationOptions (o caller só
       aplica nas que existem como slider no DOM) — preservamos a lista
       completa de pares [key, value];
     - segmented: siteSize / contaminationLevel só entram se truthy
       (legado: `if (opts.siteSize)` / `if (opts.contaminationLevel)`);
     - booleanos: para cada chave de `booleanKeys`, só entra se
       `typeof opts[key] === 'boolean'`.
   ================================================================ */

/** Plano declarativo do que aplicar ao modal a partir de um preset. */
export interface PresetApplyPlan {
    /** Famílias a marcar (resto desmarcado pelo caller). */
    families: ReadonlySet<string>;
    /**
     * Pares [chave, valor] de generationOptions, na ordem de iteração.
     * O caller aplica em sliders existentes (`fsel-<key>`); chaves sem
     * slider são naturalmente ignoradas no DOM (igual ao legado).
     */
    sliderEntries: ReadonlyArray<readonly [string, unknown]>;
    /** Valor de siteSize a ativar, ou null se ausente/falsy (legado `if`). */
    siteSize: string | null;
    /** Valor de contaminationLevel a ativar, ou null se ausente/falsy. */
    contaminationLevel: string | null;
    /** Toggles booleanos a setar (só chaves cujo valor é boolean). */
    booleans: ReadonlyArray<readonly [string, boolean]>;
}

/** Preset (subset consumido pelo plano). */
export interface PresetApplyInput {
    families?: ReadonlyArray<string>;
    generationOptions?: Record<string, unknown>;
}

/**
 * Deriva o plano de aplicação de um preset.
 *
 * Equivalente byte-a-byte às etapas 2/3/4 de `_applyPresetToModal`:
 *   - `families` → Set;
 *   - `Object.entries(generationOptions)` → sliderEntries (ordem preservada);
 *   - `siteSize`/`contaminationLevel` repassados só se truthy;
 *   - `booleanKeys` filtradas por `typeof === 'boolean'`.
 *
 * Não lê DOM nem aplica nada — apenas descreve o que aplicar.
 *
 * @param preset      preset selecionado (já resolvido pelo caller).
 * @param booleanKeys chaves booleanas permitidas (RANDOM_BOOLEAN_OPTIONS).
 * @returns plano declarativo.
 */
export function buildPresetApplyPlan(
    preset: PresetApplyInput | null | undefined,
    booleanKeys: ReadonlyArray<string>,
): PresetApplyPlan {
    const families = new Set<string>(preset?.families ? [...preset.families] : []);
    const opts: Record<string, unknown> = preset?.generationOptions || {};
    const sliderEntries: Array<readonly [string, unknown]> = Object.entries(opts);
    // Legado: `if (opts.siteSize)` — só ativa se truthy (string não-vazia).
    const siteSize = opts.siteSize ? String(opts.siteSize) : null;
    const contaminationLevel = opts.contaminationLevel ? String(opts.contaminationLevel) : null;
    const booleans: Array<readonly [string, boolean]> = [];
    for (const key of booleanKeys) {
        if (typeof opts[key] === 'boolean') booleans.push([key, opts[key] as boolean]);
    }
    return { families, sliderEntries, siteSize, contaminationLevel, booleans };
}
