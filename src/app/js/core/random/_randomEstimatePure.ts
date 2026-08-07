// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RANDOM-ESTIMATE — pure-logic.

   Estima quantas observações o gerador random produzirá a partir
   das opções da aba "Quantidades" (campanhas × poços × densidade),
   e decide se o número merece o aviso de "pode demorar".

   Extraído de utils/ui/familySelectModal.ts (_updateEstimate). A
   leitura dos sliders do DOM e a montagem do innerHTML permanecem no
   caller (impuros); ESTA função é só a aritmética determinística —
   sem DOM/rede/IO.

   Fórmula legada (preservada byte-a-byte):
     estimate  = Math.round((campaigns * wells * density * 3) / 100) * 100
     isWarning = estimate > 5000
   O fator 3 = média de parâmetros por poço; o arredondamento a 100
   é cosmético (número "redondo" na UI). O limiar 5000 é estritamente
   maior-que (5000 exato NÃO é warning).
   ================================================================ */

/** Limiar acima do qual a estimativa dispara o aviso "pode demorar". */
export const RANDOM_ESTIMATE_WARNING_THRESHOLD = 5000;

/** Média de parâmetros gerados por poço (fator da estimativa). */
export const RANDOM_ESTIMATE_PARAMS_PER_WELL = 3;

/** Granularidade do arredondamento cosmético da estimativa. */
export const RANDOM_ESTIMATE_ROUNDING = 100;

export interface RandomEstimate {
    /** Número estimado de observações, arredondado à centena mais próxima. */
    count: number;
    /** true quando `count` excede o limiar de aviso (estritamente maior-que). */
    isWarning: boolean;
}

/**
 * Estima as observações geradas e decide o aviso.
 *
 * Equivalente byte-a-byte ao corpo de `_updateEstimate` do modal:
 *   campaigns × wells × density × 3, dividido por 100, arredondado,
 *   multiplicado por 100; warning se o resultado passar de 5000.
 *
 * Entradas não-finitas (NaN/Infinity, ex.: slider ausente) são tratadas
 * como 0 — degrada para `{ count: 0, isWarning: false }` em vez de
 * propagar NaN para o innerHTML (que o caller legado renderizaria como
 * "~NaN observations").
 *
 * @param campaigns nº de campanhas (slider).
 * @param wells     nº de poços (slider).
 * @param density   intensidade de monitoramento (slider, ex.: 0.5–2.0).
 * @returns { count, isWarning }
 */
export function estimateRandomObservations(campaigns: number, wells: number, density: number): RandomEstimate {
    const c = Number.isFinite(campaigns) ? campaigns : 0;
    const w = Number.isFinite(wells) ? wells : 0;
    const d = Number.isFinite(density) ? density : 0;
    const count = Math.round((c * w * d * RANDOM_ESTIMATE_PARAMS_PER_WELL) / RANDOM_ESTIMATE_ROUNDING) * RANDOM_ESTIMATE_ROUNDING;
    return { count, isWarning: count > RANDOM_ESTIMATE_WARNING_THRESHOLD };
}
