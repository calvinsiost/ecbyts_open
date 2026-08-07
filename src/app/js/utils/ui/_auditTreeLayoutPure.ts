// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT Audit Trail — tree layout pure logic.
 *
 * Transforma AuditTrailVM.blocks (lista 9 blocos A-I flat) em estrutura
 * hierárquica TreeNode[] indent-based para visualização tipo "árvore".
 *
 * Padrão "Plain Tree" vanilla JS (sem D3): depth + parent links permite
 * render via padding-left + CSS connectors. Compatível com WAI-ARIA tree
 * pattern (role=tree, role=treeitem, aria-expanded, aria-level).
 *
 * Research: .runtime/research/hierarchical-tree-visualization-2026-06-07.md
 * (Calvin 2026-06-07, claude - novaspec)
 */

export interface TreeNode {
    readonly id: string;
    readonly label: string;
    readonly labelKey?: string;  // i18n fallback key
    readonly depth: number;
    readonly parentId: string | null;
    readonly kind: 'root' | 'block' | 'group' | 'leaf';
    readonly meta?: {
        readonly value?: string;
        readonly xlsxRef?: string;
        readonly formula?: string;
    };
}

interface BlockVMShape {
    readonly id: string;
    readonly titleKey: string;
    readonly rows: ReadonlyArray<{
        readonly cellId: string;
        readonly labelKey: string;
        readonly value: string;
        readonly xlsxA1?: string;
        readonly formulaSymbolic?: string;
    }>;
}

interface AuditTrailVMShape {
    readonly modelId: string;
    readonly blocks: ReadonlyArray<BlockVMShape>;
}

/**
 * Constrói árvore hierárquica do Audit Trail.
 *
 * Estrutura:
 * - root (ECBT Score)
 *   - block_A (Entradas)
 *     - leaf rows
 *   - block_B (Limites legais)
 *   - ...
 *   - block_D (10 eixos EIS) ← decomposto em 2 grupos
 *     - group D_core6 (Core-6 3CTA+)
 *       - leaf D.T, D.A, D.Cp, D.Ty, D.Cs, D.Cm
 *     - group D_progressive4 (Progressive-4 ESG/EHS)
 *       - leaf D.Gc, D.Bi, D.Se, D.Tr
 *   - block_E, F, G, H, I (folhas/leaves quando rows<3)
 */
export function buildAuditTree(vm: AuditTrailVMShape): TreeNode[] {
    if (!vm || !Array.isArray(vm.blocks)) return [];
    const nodes: TreeNode[] = [];
    const rootId = 'tree-root';
    nodes.push(Object.freeze({
        id: rootId,
        label: 'ECBT Score',
        labelKey: 'ecbt.audit_trail.tree.root',
        depth: 0,
        parentId: null,
        kind: 'root' as const,
    }));

    for (const block of vm.blocks) {
        const blockNodeId = `tree-block-${block.id}`;
        nodes.push(Object.freeze({
            id: blockNodeId,
            label: block.id,
            labelKey: block.titleKey,
            depth: 1,
            parentId: rootId,
            kind: 'block' as const,
        }));

        // Bloco D especial: 10 eixos decompostos em 2 grupos (Core-6 + Progressive-4)
        if (block.id === 'D' && block.rows.length >= 10) {
            const coreGroupId = `tree-group-${block.id}-core6`;
            const progGroupId = `tree-group-${block.id}-progressive4`;
            nodes.push(Object.freeze({
                id: coreGroupId,
                label: 'Core-6 (3CTA+)',
                labelKey: 'ecbt.audit_trail.tree.d_core6',
                depth: 2,
                parentId: blockNodeId,
                kind: 'group' as const,
            }));
            nodes.push(Object.freeze({
                id: progGroupId,
                label: 'Progressive-4 (ESG/EHS)',
                labelKey: 'ecbt.audit_trail.tree.d_progressive4',
                depth: 2,
                parentId: blockNodeId,
                kind: 'group' as const,
            }));
            const coreSet = new Set(['T', 'A', 'Cp', 'Ty', 'Cs', 'Cm']);
            for (const row of block.rows) {
                // cellId tipo "D.T", "D.A", "D.Gc" — extrair axis
                const parts = row.cellId.split('.');
                const axis = parts[parts.length - 1];
                const inCore = coreSet.has(axis);
                nodes.push(Object.freeze({
                    id: `tree-leaf-${row.cellId}`,
                    label: row.cellId,
                    labelKey: row.labelKey,
                    depth: 3,
                    parentId: inCore ? coreGroupId : progGroupId,
                    kind: 'leaf' as const,
                    meta: Object.freeze({
                        value: row.value,
                        xlsxRef: row.xlsxA1,
                        formula: row.formulaSymbolic,
                    }),
                }));
            }
            continue;
        }

        // Demais blocos: rows como folhas diretas (depth 2)
        for (const row of block.rows) {
            nodes.push(Object.freeze({
                id: `tree-leaf-${row.cellId}`,
                label: row.cellId,
                labelKey: row.labelKey,
                depth: 2,
                parentId: blockNodeId,
                kind: 'leaf' as const,
                meta: Object.freeze({
                    value: row.value,
                    xlsxRef: row.xlsxA1,
                    formula: row.formulaSymbolic,
                }),
            }));
        }
    }

    return nodes;
}

/**
 * Retorna filhos diretos de um node (single-pass O(N)).
 */
export function getChildren(nodes: ReadonlyArray<TreeNode>, parentId: string | null): TreeNode[] {
    return nodes.filter((n) => n.parentId === parentId);
}

/**
 * Calcula contagem de descendentes (recursivo, cacheado por id).
 * Útil para badge "(N items)" no node colapsado.
 */
export function countDescendants(nodes: ReadonlyArray<TreeNode>, nodeId: string): number {
    const cache = new Map<string, number>();
    function recurse(id: string): number {
        if (cache.has(id)) return cache.get(id)!;
        const children = nodes.filter((n) => n.parentId === id);
        let count = children.length;
        for (const c of children) count += recurse(c.id);
        cache.set(id, count);
        return count;
    }
    return recurse(nodeId);
}

/**
 * Máxima profundidade da árvore.
 */
export function maxDepth(nodes: ReadonlyArray<TreeNode>): number {
    if (!nodes.length) return 0;
    return Math.max(...nodes.map((n) => n.depth));
}

/**
 * Filtra árvore por kind (útil para "mostrar só folhas" ou "só blocos").
 */
export function filterByKind(nodes: ReadonlyArray<TreeNode>, kinds: ReadonlyArray<TreeNode['kind']>): TreeNode[] {
    const set = new Set(kinds);
    return nodes.filter((n) => set.has(n.kind));
}
