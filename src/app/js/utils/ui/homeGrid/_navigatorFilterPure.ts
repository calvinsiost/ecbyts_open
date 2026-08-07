// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 — lógica PURA do filtro da árvore do navegador da home.
 * claude (refactor) 2026-06-19.
 *
 * EN: Pure tree-filter (ancestor-inclusion) decision for the home navigator tree.
 *     No DOM, no globals, no module state. Mirrors the legacy inline
 *     `_filterNavigatorNodes(nodes)` in homeGrid.ts EXACTLY:
 *       - empty/whitespace filter → return the input list unchanged (same ref);
 *       - a node matches when its `label` + ' ' + `searchText` (lower-cased)
 *         INCLUDES the (lower-cased, caller-supplied) filter substring;
 *       - every matched node pulls in its full ancestor chain (walking
 *         `parentId` via an id→node Map), so the tree stays connected;
 *       - the result preserves the ORIGINAL node order (a `nodes.filter` over
 *         the included id set), not match order.
 *     The barrel (`homeGrid.ts`) keeps the module state `_treeFilter` and the DOM
 *     wiring; it now passes that value in as the explicit `filter` argument and
 *     delegates the decision here — behaviour identical.
 *
 * PT (leigo): decide, sem mexer na tela, QUAIS itens da árvore do navegador da
 *     tela inicial ficam visíveis quando o usuário digita um filtro. Um item
 *     aparece se o texto dele contém o que foi digitado; e, para a árvore não
 *     ficar "quebrada", os itens-pai de cada item encontrado também aparecem. Se
 *     o filtro está vazio, devolve a lista inteira sem mudar nada. É exatamente o
 *     mesmo cálculo que estava embutido no homeGrid — agora isolado e testável.
 *
 * Pure: entradas → saída determinística, sem efeitos colaterais. Cheap tests:
 * tests/ui/homeGrid/navigator-filter.test.mjs.
 */

/** A navigator tree node, as consumed by the home tree renderer. */
export interface NavigatorFilterNode {
    readonly id: unknown;
    readonly parentId?: unknown;
    readonly label?: unknown;
    readonly searchText?: unknown;
    readonly [key: string]: unknown;
}

/**
 * Filter navigator tree nodes by a substring, keeping matched nodes AND their
 * ancestor chains so the tree remains connected.
 *
 * Behaviour is byte-identical to the legacy inline `_filterNavigatorNodes`:
 * a falsy/empty filter returns the input list unchanged (same reference).
 *
 * @param nodes  flat list of navigator nodes (each with `id`, optional `parentId`)
 * @param filter the (already lower-cased, by the legacy caller) filter string
 * @returns the filtered node list in original order
 */
export function filterNavigatorNodes<T extends NavigatorFilterNode>(nodes: T[], filter: string): T[] {
    // Empty/whitespace filter → no filtering (mirror: `if (!_treeFilter) return nodes;`).
    if (!filter) return nodes;

    const byId = new Map<unknown, T>(nodes.map((node) => [node.id, node]));
    const include = new Set<unknown>();

    for (const node of nodes) {
        const haystack = `${node.label} ${node.searchText || ''}`.toLowerCase();
        if (!haystack.includes(filter)) continue;
        let cursor: T | null = node;
        while (cursor) {
            include.add(cursor.id);
            cursor = cursor.parentId ? byId.get(cursor.parentId) || null : null;
        }
    }

    return nodes.filter((node) => include.has(node.id));
}
