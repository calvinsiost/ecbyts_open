// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RANDOM-COV-V2 FLAG — pure-logic.

   RANDOM-COV-001 (SPEC_RANDOM_MODEL_COVERAGE §8 Rollback): feature flag
   `CONFIG.FEATURES.RANDOM_COV_V2` (default OFF no rollout; on após
   validação). Cada RF da F1 fica atrás do flag:

     - RF-1/RF-2: famílias `dam`, `pit` e `route_flow` só são geradas
       com o flag ON; OFF elas são removidas do conjunto `include`
       (mesmo se selecionadas no modal — rollback = comportamento
       pré-F1, em que essas famílias não existiam no gerador);
     - RF-3: `cas` das observações só é preenchido com o flag ON
       (OFF → null, como antes da F1);
     - RF-4: a concentração-base de contaminante em groundwater só é
       ancorada nas bandas VR/VP/VI com o flag ON (OFF → range plano
       min..max, como antes da F1).

   Estas funções são a decisão determinística, sem DOM/rede/IO:
     - resolveRandomCovV2Enabled: lê o flag do CONFIG (true estrito;
       ausente/qualquer outro valor → OFF defensivo, mesmo precedente
       do BALANCE_HUB_ENABLED);
     - applyRandomCovV2ToInclude: filtra as famílias F1 do conjunto
       `include` quando o flag está OFF (não muta o conjunto de
       entrada).
   ================================================================ */

/**
 * Famílias introduzidas pela F1 da RANDOM-COV-001 (RF-1 dam+pit,
 * RF-2 route_flow) — ficam atrás do flag RANDOM_COV_V2.
 */
export const RANDOM_COV_V2_FAMILIES: ReadonlyArray<string> = ['dam', 'pit', 'route_flow'];

/**
 * Resolve se a cobertura v2 do modelo random está ativa.
 *
 * Equivalente a `config?.FEATURES?.RANDOM_COV_V2 === true` — true
 * estrito: ausência, undefined, null ou valor não-boolean caem no
 * default OFF defensivo (rollback seguro).
 *
 * @param config  objeto CONFIG (ou subconjunto com FEATURES).
 * @returns true somente quando FEATURES.RANDOM_COV_V2 === true.
 */
export function resolveRandomCovV2Enabled(config: any): boolean {
    return config?.FEATURES?.RANDOM_COV_V2 === true;
}

/**
 * Aplica o flag ao conjunto de famílias a gerar.
 *
 * - enabled=true  → cópia do conjunto, sem alteração;
 * - enabled=false → cópia do conjunto SEM as famílias F1
 *   (dam/pit/route_flow) — rollback ao comportamento pré-F1.
 *
 * Nunca muta o conjunto de entrada.
 *
 * @param include  famílias selecionadas (Set de ids).
 * @param enabled  resultado de resolveRandomCovV2Enabled.
 * @returns novo Set com o flag aplicado.
 */
export function applyRandomCovV2ToInclude(include: ReadonlySet<string>, enabled: boolean): Set<string> {
    const result = new Set(include || []);
    if (!enabled) {
        for (const familyId of RANDOM_COV_V2_FAMILIES) {
            result.delete(familyId);
        }
    }
    return result;
}
