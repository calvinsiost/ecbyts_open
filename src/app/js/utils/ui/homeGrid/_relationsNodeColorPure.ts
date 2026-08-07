// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RELATIONS NODE COLOR — desambiguação de cor (vermelho = só severidade)
   RELATIONS-UX-001 F7. Calvin 2026-06-14 ("avaliar padronização de cores").

   Achado da avaliação do app real: a cor de família vem de assignDatasetColor
   (hash FNV-1a sobre a Tableau-10), que INCLUI o vermelho #e15759. Um nó cuja
   família calha de mapear para vermelho E que tem severidade crítica fica com
   FILL vermelho (#e15759) + ANEL vermelho (#ef4444) — dois vermelhos quase
   idênticos → o anel de severidade some no fill e o grafo vira uma massa
   vermelha ambígua. Viola a regra de padronização "vermelho RESERVADO à
   severidade crítica" (pesquisa Sigma/Carbon + R4/R7 desta spec).

   Este módulo reserva o vermelho à severidade: se a cor de família é o vermelho
   Tableau, troca por um substituto não-vermelho e distinto (cyan). Assim, no
   grafo, vermelho SEMPRE significa "crítico".

   Pure: sem DOM. Determinístico, case-insensitive.
   ================================================================ */

/** Vermelho da severidade crítica (intervention) — reservado. */
export const SEVERITY_RED = '#ef4444';
/** Vermelho da paleta Tableau-10 de famílias (posição 04 — "red"). */
export const FAMILY_RED = '#e15759';
/** Substituto não-vermelho e distinto (cyan Tableau-20) para a família que
 *  calharia em vermelho — libera o vermelho para a severidade. */
export const FAMILY_RED_SUBSTITUTE = '#17becf';

/**
 * Reserva o vermelho à severidade: se `familyColor` é o vermelho Tableau de
 * família (#e15759, qualquer caixa), retorna o substituto cyan; caso contrário
 * devolve a cor original. Qualquer outra cor passa intacta.
 */
export function reserveSeverityRed(familyColor: unknown): string {
    if (typeof familyColor !== 'string') return String(familyColor ?? '');
    return familyColor.trim().toLowerCase() === FAMILY_RED.toLowerCase()
        ? FAMILY_RED_SUBSTITUTE
        : familyColor;
}
