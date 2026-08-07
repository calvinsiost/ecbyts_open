// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// state.js — Leaf module: element ID counter (zero imports = quebra o ciclo).
// Módulo-folha: dono único do contador de IDs de elementos. Não importa
// manager/randomModel — é a base que ambos consomem (pattern §4.1
// SPEC_ARCH_MONOLITH_ATOMIZATION, dissolve feedback-edge manager↔randomModel).
//
// Semântica byte-idêntica ao antigo `let elementCounter = 0; ++elementCounter`
// que vivia em manager.js — apenas extraído para folha sem dependências.

/**
 * Contador para gerar IDs unicos. Incrementa a cada novo elemento.
 * @type {number}
 */
let elementCounter = 0;

/**
 * Incrementa e retorna o proximo valor do contador.
 * Equivalente a `++elementCounter`.
 * @returns {number} Proximo valor do contador
 */
export function nextElementCounter() {
    return ++elementCounter;
}

/**
 * Alias semantico de nextElementCounter para call-sites que faziam
 * `elementCounter++` seguido de leitura do valor incrementado.
 * @returns {number} Valor do contador apos incremento
 */
export function bumpElementCounter() {
    return ++elementCounter;
}

/**
 * Le o valor atual do contador sem incrementar.
 * @returns {number}
 */
export function getElementCounter() {
    return elementCounter;
}

/**
 * Reseta o contador para zero (usado em clearAllElements).
 */
export function resetElementCounter() {
    elementCounter = 0;
}
