// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   COLLECT-OPTIONS — pure-logic.

   Monta o objeto de opções de geração random a partir dos valores
   crus já lidos do DOM (sliders, segmented-buttons, toggles). Aplica
   as MESMAS regras do legado:
     - parte de RANDOM_DEFAULTS;
     - cada slider sobrescreve a chave; sliders ≠ density são
       arredondados a inteiro (Math.round);
     - siteSize / contaminationLevel só sobrescrevem se houver botão
       ativo (segmented); senão mantém o default;
     - cada boolean só sobrescreve se o checkbox existir no DOM.

   Extraído de utils/ui/familySelectModal.ts (_collectOptions). A
   leitura do DOM (slider.value, querySelector do botão ativo,
   checkbox.checked) permanece no caller, que passa os valores crus
   AQUI; ESTA função é só a transformação determinística — sem
   DOM/rede/IO.

   Comportamento legado preservado byte-a-byte:
     const opts = { ...RANDOM_DEFAULTS };
     for (key of sliderKeys) {
         opts[key] = getSliderValue(key);
         if (key !== 'density') opts[key] = Math.round(opts[key]);
     }
     if (sizeActive) opts.siteSize = sizeActive || opts.siteSize;
     if (contamActive) opts.contaminationLevel = contamActive || opts.contaminationLevel;
     for (key of booleanKeys) { if (checkboxPresent) opts[key] = checked; }
   Observação: `getSliderValue` no caller já degrada slider ausente para
   RANDOM_DEFAULTS[key]; aqui recebemos esse valor cru e só aplicamos o
   Math.round (≠ density), igual ao legado.
   ================================================================ */

/** Opção bruta de slider lida do DOM (já com fallback ao default no caller). */
export type RawSliderValues = Readonly<Record<string, number>>;

/** Mapa de booleans presentes no DOM → estado do checkbox. */
export type RawBooleanValues = Readonly<Record<string, boolean>>;

/** Seleções de segmented-buttons (null quando nenhum botão ativo). */
export interface RawSegmentedValues {
    /** dataset.value do botão ativo de siteSize, ou null. */
    siteSize: string | null;
    /** dataset.value do botão ativo de contaminationLevel, ou null. */
    contaminationLevel: string | null;
}

/**
 * Monta o objeto de opções final aplicando as regras do `_collectOptions`.
 *
 * @param defaults     RANDOM_DEFAULTS (base imutável; copiada, não mutada).
 * @param sliderKeys   chaves de slider na ordem de iteração (Object.keys(SLIDER_LIMITS)).
 * @param sliderValues valores crus por chave de slider (já com fallback ao default).
 * @param segmented    seleções de segmented-buttons (null = sem botão ativo).
 * @param booleanKeys  chaves booleanas candidatas (RANDOM_BOOLEAN_OPTIONS).
 * @param booleanValues estado dos checkboxes PRESENTES no DOM (chaves ausentes = checkbox inexistente).
 * @returns objeto de opções (cópia nova; defaults preservados onde não há override).
 */
export function collectRandomOptions<T extends Record<string, unknown>>(
    defaults: T,
    sliderKeys: ReadonlyArray<string>,
    sliderValues: RawSliderValues,
    segmented: RawSegmentedValues,
    booleanKeys: ReadonlyArray<string>,
    booleanValues: RawBooleanValues,
): T {
    const opts: Record<string, unknown> = { ...defaults };
    for (const key of sliderKeys) {
        const raw = sliderValues[key] as number;
        opts[key] = key !== 'density' ? Math.round(raw) : raw;
    }
    // Segmented: legado `if (group) opts.x = group.dataset.value || opts.x`.
    // group.dataset.value vazio cairia no default; aqui null = sem botão ativo.
    if (segmented.siteSize) opts.siteSize = segmented.siteSize;
    if (segmented.contaminationLevel) opts.contaminationLevel = segmented.contaminationLevel;
    // Booleans: só sobrescreve as chaves cujo checkbox existe (presentes em booleanValues).
    for (const key of booleanKeys) {
        if (Object.prototype.hasOwnProperty.call(booleanValues, key)) {
            opts[key] = booleanValues[key];
        }
    }
    return opts as T;
}
