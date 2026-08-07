// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_SPLIT_HOMEGRID — pure-logic extraction of cards filter/order
// Hand-authored R1-safe (not codemod-governed).
//
// Spec NOT:
// - NÃO ler DOM
// - NÃO ler localStorage diretamente (recebe config como input)
// - NÃO emoji
//
// Used by homeGrid._getVisibleOrderedCards via thin wrapper.

/**
 * Filter visible cards and order them by config.order.
 * Pure function — no DOM, no IO, deterministic.
 *
 * @param {Array<{id: string, visible?: boolean, order?: number}>|null|undefined} config
 *   User config from getHomeCardsConfig() (null = no overrides).
 * @param {Array<{id: string}>} cards - Full card list (ACTION_CARDS).
 * @returns {Array<{id: string}>} - Visible cards sorted by order.
 */
export function filterOrderCards(config: any, cards: any[]): any[] {
    if (!Array.isArray(cards)) return [];
    const validCards = cards.filter((c: any) => c && typeof c.id === 'string');
    if (!config || !Array.isArray(config)) return [...validCards];

    // Build O(1) lookup
    const lookup: Record<string, any> = {};
    for (const c of config) {
        if (c && typeof c.id === 'string') lookup[c.id] = c;
    }

    // Filter by visibility (undefined config = visible)
    const visible = validCards.filter((card: any) => {
        const cfg = lookup[card.id];
        return !cfg || cfg.visible !== false;
    });

    // Stable sort by config.order (default 999)
    return visible.sort((a: any, b: any) => {
        const oa = lookup[a.id]?.order ?? 999;
        const ob = lookup[b.id]?.order ?? 999;
        return oa - ob;
    });
}

/**
 * Compute hash of card list for re-render detection.
 * @param {Array<{id: string}>} cards
 * @returns {string}
 */
export function computeCardListHash(cards: any[]): string {
    if (!Array.isArray(cards)) return '';
    return cards.map((c) => c?.id || '').join(',');
}

/** Ordem canônica das seções de categoria da home (S5 split). */
export const HOME_CARD_CATEGORY_ORDER: readonly string[] = Object.freeze([
    'primary',
    'data',
    'management',
    'settings',
]);

/** Uma seção de categoria pronta para o renderer (título + contagem + cards). */
export interface CardCategorySection {
    readonly key: string;
    readonly title: string;
    readonly count: number;
    readonly cards: readonly any[];
}

/**
 * Agrupa os cards por categoria na ordem canônica, devolvendo só as seções
 * NÃO-vazias com título e contagem já resolvidos. Categoria desconhecida cai
 * em 'data' (mesmo fallback do renderer legado). Pure: sem DOM/i18n — os
 * títulos já-traduzidos entram como `titles`.
 *
 * @param cards Lista já filtrada/ordenada (de filterOrderCards).
 * @param titles Títulos traduzidos por chave de categoria.
 */
export function groupCardsByCategory(
    cards: any[],
    titles: Record<string, string>,
): readonly CardCategorySection[] {
    const list = Array.isArray(cards) ? cards : [];
    const buckets: Record<string, any[]> = { primary: [], data: [], management: [], settings: [] };
    for (const card of list) {
        if (!card) continue;
        const cat = typeof card.category === 'string' && buckets[card.category] ? card.category : 'data';
        const bucket = buckets[cat];
        if (bucket) bucket.push(card);
    }
    const out: CardCategorySection[] = [];
    for (const key of HOME_CARD_CATEGORY_ORDER) {
        const bucket = buckets[key];
        if (!bucket || bucket.length === 0) continue;
        out.push(
            Object.freeze({
                key,
                title: String((titles && titles[key]) || key),
                count: bucket.length,
                cards: Object.freeze([...bucket]),
            }),
        );
    }
    return Object.freeze(out);
}
