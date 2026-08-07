// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// PRIORITY NAVIGATION — H2 PatternFly-style overflow handler.
// Pure-logic: dado um array de larguras de itens + largura disponível +
// largura do kebab/more button, retorna quais índices ficam visíveis e
// quais vão para overflow.

export interface PriorityNavInput {
    /** Larguras (px) dos items na ordem do DOM. */
    itemWidths: number[];
    /** Largura disponível para o toolbar (px). */
    available: number;
    /** Largura do botão "more"/kebab que aparece se houver overflow (px). */
    kebabWidth: number;
    /** Gap (px) entre itens. Default 4. */
    gap?: number;
    /** Mínimo de itens visíveis (anti-só-kebab). Default 0. */
    minVisible?: number;
}

export interface PriorityNavResult {
    visible: number[];
    overflow: number[];
    /** True se há overflow (precisa renderizar kebab). */
    hasOverflow: boolean;
}

/**
 * Calcula quais itens cabem no espaço disponível.
 * Algoritmo greedy: adiciona itens até estourar; resto vai p/ overflow.
 * Se há overflow, reserva kebabWidth + gap no orçamento.
 */
export function computeOverflow(input: PriorityNavInput): PriorityNavResult {
    const gap = input.gap ?? 4;
    const minVisible = input.minVisible ?? 0;
    const n = input.itemWidths.length;

    // Tentativa 1: cabe tudo sem overflow?
    let totalNoOverflow = 0;
    for (let i = 0; i < n; i++) {
        totalNoOverflow += input.itemWidths[i] ?? 0;
        if (i > 0) totalNoOverflow += gap;
    }
    if (totalNoOverflow <= input.available) {
        return {
            visible: Array.from({ length: n }, (_, i) => i),
            overflow: [],
            hasOverflow: false,
        };
    }

    // Tentativa 2: com kebab reservado
    const budget = input.available - input.kebabWidth - gap;
    let used = 0;
    const visible: number[] = [];
    for (let i = 0; i < n; i++) {
        const itemCost = (input.itemWidths[i] ?? 0) + (visible.length > 0 ? gap : 0);
        if (used + itemCost > budget && visible.length >= minVisible) break;
        used += itemCost;
        visible.push(i);
    }
    const overflow: number[] = [];
    for (let i = visible.length; i < n; i++) overflow.push(i);

    return { visible, overflow, hasOverflow: overflow.length > 0 };
}
