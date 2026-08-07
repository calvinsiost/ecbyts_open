// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   ELEMENTS TREE PURE (Module C extraction — algoritmos de hierarquia)
   ================================================================

   3 algoritmos de árvore extraídos de core/elements/manager.ts. Recebem
   lookups (getElementById, getElementsByParent) como dependências
   injetadas → testáveis sem state interno de elements/manager.

   Anti-ciclo via Set<string> em ancestors+descendants. buildTree é
   recursão DFS sobre children por parent.
   ================================================================ */

type AnyRecord = Record<string, any>;

/**
 * Retorna ancestrais (parent-imediato → raiz) de um elemento, seguindo
 * `hierarchy.parentId`. Anti-ciclo via Set. Para se: parent não existe,
 * já visitado, ou cadeia chega ao topo (parentId null/undefined).
 *
 * @param elementId — id do elemento inicial
 * @param getElementById — lookup injetado (state-dependent no caller)
 */
export function getAncestorsPure(
    elementId: string,
    getElementById: (id: string) => AnyRecord | null | undefined,
): AnyRecord[] {
    const out: AnyRecord[] = [];
    const seen = new Set<string>();
    let current = getElementById(elementId);
    while (current?.hierarchy?.parentId) {
        const pid = current.hierarchy.parentId;
        if (seen.has(pid)) break;
        seen.add(pid);
        const parent = getElementById(pid);
        if (!parent) break;
        out.push(parent);
        current = parent;
    }
    return out;
}

/**
 * Retorna descendentes (filhos recursivos) de um elemento. DFS via stack
 * implícito de recursão; anti-ciclo via Set para evitar loop em data
 * corrompida (parent que aponta para próprio descendente).
 *
 * @param elementId — id da raiz
 * @param getElementsByParent — lookup de children por parentId injetado
 */
export function getDescendantsPure(
    elementId: string,
    getElementsByParent: (parentId: string | null) => AnyRecord[],
): AnyRecord[] {
    const out: AnyRecord[] = [];
    const seen = new Set<string>();
    const visit = (id: string): void => {
        if (seen.has(id)) return;
        seen.add(id);
        const children = getElementsByParent(id) || [];
        for (const child of children) {
            out.push(child);
            visit(child.id);
        }
    };
    visit(elementId);
    return out;
}

/**
 * Constrói árvore completa { element, children: [...] } a partir de
 * `getElementsByParent(null)` (roots) + recursão DFS para children.
 * Pure dado o lookup.
 */
export function buildElementTreePure(
    getElementsByParent: (parentId: string | null) => AnyRecord[],
): Array<{ element: AnyRecord; children: any[] }> {
    const buildNode = (el: AnyRecord): { element: AnyRecord; children: any[] } => ({
        element: el,
        children: (getElementsByParent(el.id) || []).map(buildNode),
    });
    return (getElementsByParent(null) || []).map(buildNode);
}
