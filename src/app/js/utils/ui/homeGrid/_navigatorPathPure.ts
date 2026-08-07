// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 — lógica PURA do caminho (breadcrumb) da árvore do
 * navegador da home. claude (refactor) 2026-06-20.
 *
 * EN: Pure leaf→root path resolver for the home navigator tree. No DOM, no
 *     globals, no module state. Mirrors the legacy inline
 *     `_getActiveNavigatorPathLabels()` in homeGrid.ts EXACTLY:
 *       - a falsy `targetId` → empty array (legacy: `if (!_activeObjectId) return []`);
 *       - build an id→node Map, start the cursor at the target node;
 *       - walk the `parentId` chain, `unshift`-ing each node's `label` so the
 *         result reads ROOT → LEAF (ancestors first, target last);
 *       - a missing target id or a broken `parentId` link simply stops the walk
 *         (no throw): unknown target → `[]`, dangling parent → path stops there.
 *     The barrel (`homeGrid.ts`) keeps the module state `_activeObjectId` and the
 *     tree source `_getTreeNodes()`; it now passes both in as explicit arguments
 *     and delegates the decision here — behaviour identical.
 *
 * PT (leigo): monta, sem mexer na tela, a "trilha de migalhas" (breadcrumb) do
 *     item selecionado na árvore do navegador da tela inicial — do item de mais
 *     alto nível (raiz) até o item escolhido. Sobe pela cadeia de pais. Se nada
 *     está selecionado, devolve uma lista vazia. É exatamente o mesmo cálculo que
 *     estava embutido no homeGrid — agora isolado e testável.
 *
 * Pure: entradas → saída determinística, sem efeitos colaterais. A lista
 * devolvida é congelada (frozen). Cheap tests: tests/ui/homeGrid/navigator-path.test.mjs.
 */

/** A navigator tree node, as consumed by the home tree breadcrumb. */
export interface NavigatorPathNode {
    readonly id: unknown;
    readonly parentId?: unknown;
    readonly label?: unknown;
    readonly [key: string]: unknown;
}

/**
 * Resolve the ordered label path (ROOT → LEAF) from a flat navigator node list
 * to the given target node, walking the `parentId` ancestor chain.
 *
 * Behaviour is identical to the legacy inline `_getActiveNavigatorPathLabels`:
 * a falsy `targetId` returns `[]`; an unknown id or a broken parent link simply
 * stops the walk without throwing.
 *
 * @param nodes    flat list of navigator nodes (each with `id`, optional `parentId`/`label`)
 * @param targetId the id of the selected (leaf) node to build the path to
 * @returns a frozen array of labels, ancestors first and the target last
 */
export function resolveNavigatorPathLabels<T extends NavigatorPathNode>(
    nodes: readonly T[],
    targetId: unknown,
): ReadonlyArray<unknown> {
    // Mirror: `if (!_activeObjectId) return [];`
    if (!targetId) return Object.freeze([]);

    const byId = new Map<unknown, T>(nodes.map((node) => [node.id, node]));
    const path: unknown[] = [];
    let cursor: T | null = byId.get(targetId) || null;
    while (cursor) {
        path.unshift(cursor.label);
        cursor = cursor.parentId ? byId.get(cursor.parentId) || null : null;
    }
    return Object.freeze(path);
}
