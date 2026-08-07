// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SLIDER-FORMAT — pure-logic.

   Formata o texto do <output> de cada slider da aba "Quantidades":
     - density: valor com 1 casa + sufixo "x", com rótulo
       (Sparse / Dense) nas pontas da faixa;
     - demais sliders: inteiro arredondado.

   Extraído de utils/ui/familySelectModal.ts (_formatSliderOutput). A
   resolução i18n (t('randomSparse') / t('randomDense')) permanece no
   caller, que injeta os rótulos já traduzidos; ESTA função é só o
   parse/threshold/format determinístico — sem DOM/rede/IO.

   Comportamento legado preservado byte-a-byte:
     const v = parseFloat(value);
     if (key === 'density') {
         if (v <= 0.6) return `${v.toFixed(1)}x (${sparseLabel})`;
         if (v >= 1.8) return `${v.toFixed(1)}x (${denseLabel})`;
         return `${v.toFixed(1)}x`;
     }
     return String(Math.round(v));
   Os limiares 0.6 (≤, sparse) e 1.8 (≥, dense) são inclusivos como no
   original. `value` pode chegar como string (slider.value) ou number.
   ================================================================ */

/** Chave especial cujo formato usa "x" + rótulos de densidade. */
export const SLIDER_DENSITY_KEY = 'density';

/** Limiar inferior (inclusivo) abaixo do qual a densidade é "sparse". */
export const SLIDER_DENSITY_SPARSE_MAX = 0.6;

/** Limiar superior (inclusivo) acima do qual a densidade é "dense". */
export const SLIDER_DENSITY_DENSE_MIN = 1.8;

/** Rótulos (já traduzidos pelo caller) para as pontas da faixa de densidade. */
export interface SliderDensityLabels {
    /** Rótulo para v ≤ 0.6 (ex.: t('randomSparse') || 'Sparse'). */
    sparse: string;
    /** Rótulo para v ≥ 1.8 (ex.: t('randomDense') || 'Dense'). */
    dense: string;
}

/**
 * Formata o texto do <output> de um slider.
 *
 * Equivalente byte-a-byte a `_formatSliderOutput`: density vira
 * `"<v.1f>x"` (com sufixo de rótulo nas pontas), os demais viram o
 * inteiro arredondado.
 *
 * @param key    chave do slider (apenas 'density' tem tratamento especial).
 * @param value  valor cru do slider (string ou number; parseFloat como no legado).
 * @param labels rótulos já traduzidos para as pontas da densidade.
 * @returns texto pronto para o <output> (mesma string do inline original).
 */
export function formatSliderOutput(
    key: string,
    value: string | number,
    labels: SliderDensityLabels,
): string {
    const v = parseFloat(String(value));
    if (key === SLIDER_DENSITY_KEY) {
        if (v <= SLIDER_DENSITY_SPARSE_MAX) return `${v.toFixed(1)}x (${labels.sparse})`;
        if (v >= SLIDER_DENSITY_DENSE_MIN) return `${v.toFixed(1)}x (${labels.dense})`;
        return `${v.toFixed(1)}x`;
    }
    return String(Math.round(v));
}
