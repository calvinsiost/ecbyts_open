// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   OBJECT ACTIONS — par de ações contextuais por tipo-de-objeto do navegador
   ARCH-SPLIT-HOMEGRID-001. claude (refactor) 2026-06-19.

   Fatia PURA extraída do legado `_getActionsForType(objectType)` do homeGrid.ts.
   Mapa fixo tipo-de-objeto (organization/site/campaign/point/parameter/result)
   → par de ações contextuais {id,label}, com fallback genérico para tipos
   desconhecidos/ausentes. A toolbar contextual (homeContextRender) consome isto
   para montar os botões de ação do objeto ativo.

   Pure: sem DOM, sem i18n (rótulos são os literais do legado byte-a-byte),
   determinístico. Catálogo e cada entrada congelados (Object.freeze) — o legado
   devolvia o array do mapa por referência, mas como ninguém mutava o resultado
   o freeze é seguro e impede regressão acidental.
   ================================================================ */

/** Uma ação contextual: id de comando + rótulo exibido. */
export interface ObjectAction {
    readonly id: string;
    readonly label: string;
}

/** Tipos de objeto do navegador com par de ações dedicado. */
export type ObjectActionsType =
    | 'organization'
    | 'site'
    | 'campaign'
    | 'point'
    | 'parameter'
    | 'result';

/**
 * Catálogo canônico tipo → par de ações. Espelha o `map` do legado
 * `_getActionsForType` byte-a-byte (mesmos ids e rótulos, mesma ordem).
 */
export const OBJECT_ACTIONS: Readonly<Record<ObjectActionsType, ReadonlyArray<ObjectAction>>> =
    Object.freeze({
        organization: Object.freeze([
            Object.freeze({ id: 'open-governance', label: 'Governanca' }),
            Object.freeze({ id: 'open-export', label: 'Exportar' }),
        ]),
        site: Object.freeze([
            Object.freeze({ id: 'open-spatial', label: 'Spatial' }),
            Object.freeze({ id: 'open-compliance', label: 'Compliance' }),
        ]),
        campaign: Object.freeze([
            Object.freeze({ id: 'open-data-studio', label: 'Data Studio' }),
            Object.freeze({ id: 'open-timeseries', label: 'Series' }),
        ]),
        point: Object.freeze([
            Object.freeze({ id: 'open-observation', label: 'Observacoes' }),
            Object.freeze({ id: 'open-history', label: 'Historico' }),
        ]),
        parameter: Object.freeze([
            Object.freeze({ id: 'open-validator', label: 'Validar' }),
            Object.freeze({ id: 'open-thresholds', label: 'Limites' }),
        ]),
        result: Object.freeze([
            Object.freeze({ id: 'open-report', label: 'Laudo' }),
            Object.freeze({ id: 'open-sign', label: 'Assinar' }),
        ]),
    });

/**
 * Par de ações genérico para tipos desconhecidos/ausentes (fallback do legado:
 * `map[objectType] || [...]`).
 */
export const OBJECT_ACTIONS_FALLBACK: ReadonlyArray<ObjectAction> = Object.freeze([
    Object.freeze({ id: 'open-actions', label: 'Acoes' }),
    Object.freeze({ id: 'open-explorer', label: 'Explorador' }),
]);

/**
 * Resolve o par de ações contextuais para `objectType`. Tipo conhecido → par
 * dedicado; qualquer outra coisa (null/undefined/string desconhecida) → fallback
 * genérico. Paridade exata com o legado `_getActionsForType`.
 */
export function getActionsForType(objectType: unknown): ReadonlyArray<ObjectAction> {
    if (typeof objectType === 'string' && objectType in OBJECT_ACTIONS) {
        return OBJECT_ACTIONS[objectType as ObjectActionsType];
    }
    return OBJECT_ACTIONS_FALLBACK;
}
