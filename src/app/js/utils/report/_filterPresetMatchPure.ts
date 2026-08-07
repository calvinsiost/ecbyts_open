// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   FILTER PRESET MATCH — Lógica PURA de casamento de filtros de preset

   Extraído de utils/report/filterPresets.ts (ARCH-MONOLITH-ATOMIZATION-001):
   são decisões de DADOS, não de render. Sem DOM, sem localStorage, sem window.
   Espelha o padrão do Calculator Engine sem dependência circular.

   Cada filtro é { dimension, operator, value }. O operador decide quem
   sobrevive ao filtro; a dimension decide qual campo do item é lido.

   Comportamento idêntico ao monolito original — o monolito agora importa e
   chama estas funções (passthrough mecânico).

   Tests: tests/report-filter-preset-match.test.mjs
   ================================================================ */

/**
 * Match items against an operator over an accessor-derived value.
 * Espelha o Calculator Engine: { is, is_not, in, not_in } + passthrough.
 *
 * - `is` / `in`     → mantém itens cujo valor está na lista
 * - `is_not` / `not_in` → mantém itens cujo valor NÃO está na lista
 * - default (operador desconhecido) → passthrough (devolve todos)
 *
 * @param items     Array de itens a filtrar
 * @param accessor  Função que extrai o valor comparável de um item
 * @param operator  Operador de casamento
 * @param value     Valor (ou array de valores) de comparação
 * @returns Subconjunto filtrado de `items`
 */
export function matchByOperator(items: any, accessor: any, operator: any, value: any) {
    const vals = Array.isArray(value) ? value : [value];
    switch (operator) {
        case 'is':
            return items.filter((item: any) => vals.includes(accessor(item)));
        case 'is_not':
            return items.filter((item: any) => !vals.includes(accessor(item)));
        case 'in':
            return items.filter((item: any) => vals.includes(accessor(item)));
        case 'not_in':
            return items.filter((item: any) => !vals.includes(accessor(item)));
        default:
            return items;
    }
}

/**
 * Apply a single filter to a list of elements.
 * Dimensions reconhecidas: 'family' (familyId || family), 'element' (id).
 * Valor vazio (null/undefined/array vazio) → passthrough.
 *
 * @param elements Array de elementos [{id, family, familyId, ...}]
 * @param filter   { dimension, operator, value }
 * @returns Elementos filtrados
 */
export function applyElementFilter(elements: any, filter: any) {
    const { dimension, operator, value } = filter;
    if (!value || (Array.isArray(value) && value.length === 0)) return elements;
    if (dimension === 'family') {
        return matchByOperator(elements, (el: any) => el.familyId || el.family, operator, value);
    }
    if (dimension === 'element') {
        return matchByOperator(elements, (el: any) => el.id, operator, value);
    }
    return elements;
}

/**
 * Apply a single filter to a list of observations.
 * Dimensions reconhecidas: 'parameter' (parameterId), 'campaign' (campaignId).
 * Valor vazio (null/undefined/array vazio) → passthrough.
 *
 * @param observations Array de observações
 * @param filter       { dimension, operator, value }
 * @returns Observações filtradas
 */
export function applyObservationFilter(observations: any, filter: any) {
    const { dimension, operator, value } = filter;
    if (!value || (Array.isArray(value) && value.length === 0)) return observations;
    if (dimension === 'parameter') {
        return matchByOperator(observations, (o: any) => o.parameterId, operator, value);
    }
    if (dimension === 'campaign') {
        return matchByOperator(observations, (o: any) => o.campaignId, operator, value);
    }
    return observations;
}

/**
 * Apply a chain of filters to elements (AND semantics — cada filtro estreita).
 * Pura: não muta `elements` (faz cópia inicial), devolve o resultado do funil.
 *
 * @param elements Array de elementos
 * @param filters  Array de filtros { dimension, operator, value }
 * @returns Elementos que sobrevivem a TODOS os filtros
 */
export function applyFiltersToElements(elements: any, filters: any) {
    let filtered = [...elements];
    for (const filter of filters) {
        filtered = applyElementFilter(filtered, filter);
    }
    return filtered;
}

/**
 * Apply a chain of filters to observations (AND semantics).
 * Pura: não muta `observations` (faz cópia inicial), devolve o resultado.
 *
 * @param observations Array de observações
 * @param filters      Array de filtros { dimension, operator, value }
 * @returns Observações que sobrevivem a TODOS os filtros
 */
export function applyFiltersToObservations(observations: any, filters: any) {
    let filtered = [...observations];
    for (const filter of filters) {
        filtered = applyObservationFilter(filtered, filter);
    }
    return filtered;
}
