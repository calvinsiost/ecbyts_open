// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RANDOM-OPTIONS-NORMALIZE — pure-logic.

   Normaliza um objeto de opções "cru" (tipicamente lido do localStorage,
   logo NÃO confiável) contra os defaults + limites do motor random,
   produzindo um objeto de opções saneado:

     - sliders numéricos: clamp em [min,max] e arredondamento ao step;
     - enums (siteSize, contaminationLevel): só aceita valores da whitelist;
     - booleanos: só copia se o valor cru for de fato boolean.

   Extraído de utils/ui/familySelectModal.ts (_loadRandomOptions). A leitura
   do localStorage e o parse JSON permanecem no caller (impuros); ESTA função
   é só a transformação determinística (saved → opts) — sem DOM/rede/IO.
   ADR A2/A4: não duplica catálogos; recebe defaults/limites por parâmetro.
   ================================================================ */

/** Limite de um slider numérico. */
export interface SliderLimit {
    min: number;
    max: number;
    step: number;
}

/**
 * Valores de siteSize aceitos. Espelha a validação inline do modal.
 */
export const VALID_SITE_SIZES: ReadonlyArray<string> = Object.freeze(['small', 'medium', 'large']);

/**
 * Valores de contaminationLevel aceitos. Espelha a validação inline do modal.
 */
export const VALID_CONTAMINATION_LEVELS: ReadonlyArray<string> = Object.freeze(['low', 'medium', 'high']);

/**
 * Normaliza opções random cruas contra defaults + limites.
 *
 * Equivalente byte-a-byte ao corpo de `_loadRandomOptions` do modal:
 *  - `saved` ausente/não-objeto → cópia rasa de `defaults`;
 *  - cada chave numérica de `sliderLimits`: clamp + round-to-step;
 *  - `siteSize`/`contaminationLevel`: só sobrescreve se na whitelist;
 *  - cada chave de `booleanKeys`: só sobrescreve se `saved[key]` for boolean.
 *
 * @param saved        objeto cru (ou null) já parseado pelo caller.
 * @param unknown>     base de defaults (será copiada, não mutada).
 * @param defaults mapa chave→{min,max,step} dos sliders numéricos.
 * @param unknown>  chaves booleanas permitidas.
 * @returns objeto saneado (novo, mesclado sobre defaults).
 */
export function normalizeRandomOptions(
    saved: Record<string, unknown> | null | undefined,
    defaults: Record<string, unknown>,
    sliderLimits: Record<string, SliderLimit>,
    booleanKeys: ReadonlyArray<string>,
): Record<string, unknown> {
    if (!saved || typeof saved !== 'object') return { ...defaults };
    const opts: Record<string, unknown> = { ...defaults };
    for (const [key, limits] of Object.entries(sliderLimits)) {
        const lim = limits;
        if (typeof saved[key] === 'number') {
            opts[key] = Math.max(lim.min, Math.min(lim.max, saved[key] as number));
            // Round to step precision
            opts[key] = Math.round((opts[key] as number) / lim.step) * lim.step;
        }
    }
    // Non-slider options
    if (VALID_SITE_SIZES.includes(saved.siteSize as string)) opts.siteSize = saved.siteSize;
    if (VALID_CONTAMINATION_LEVELS.includes(saved.contaminationLevel as string))
        opts.contaminationLevel = saved.contaminationLevel;
    for (const key of booleanKeys) {
        if (typeof saved[key] === 'boolean') opts[key] = saved[key];
    }
    return opts;
}
