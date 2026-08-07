// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S5-runtime — render da árvore do navigator (sidebar).
 * claude - ui 2026-06-16.
 *
 * EN: Renders the navigator tree (filtered nodes, active-node highlight, empty
 *     state). Reads+writes the active object id/type (selection) via injected
 *     getter/setter pairs; node clicks re-render + dispatch the selection event
 *     via injected callbacks. Behavior byte-identical to the legacy inline
 *     `_renderTree`.
 *
 * PT (leigo): desenha a "árvore" de navegação do painel lateral — a lista de
 *     objetos do modelo, com o selecionado destacado. Estado e cliques vêm do
 *     homeGrid.
 *
 * DOM-coupled — validado pelo smoke E2E home-stats-s4.
 */
import { escapeHtml } from '../../helpers/html.js';

/** Dependências injetadas (estado via getters/setters, helpers via callbacks). */
export interface TreeRenderDeps {
    readonly getTreeEl: () => any;
    readonly updateTreeFilterPlaceholder: () => void;
    readonly getTreeNodes: () => any[];
    readonly getActiveObjectId: () => string | null;
    readonly setActiveObjectId: (v: string | null) => void;
    readonly getActiveObjectType: () => string | null;
    readonly setActiveObjectType: (v: string | null) => void;
    readonly filterNavigatorNodes: (nodes: any[]) => any[];
    readonly hasLoadedWorkspaceModel: () => boolean;
    readonly getNavigatorSiteLabel: () => string;
    readonly getObjectTypeLabel: (type: any) => string;
    /** Re-render (recursão na seleção) — mantém o ciclo no homeGrid. */
    readonly renderTree: () => void;
    readonly renderContextPanel: (origin: string) => void;
    readonly dispatchContextChanged: (origin: string) => void;
}

/**
 * Renderiza a árvore do navigator. Comportamento idêntico ao inline legado.
 */
export function renderTree(deps: TreeRenderDeps): void {
    const treeEl = deps.getTreeEl();
    if (!treeEl) return;
    const contentEl = treeEl.querySelector('[data-testid="actions-tree-content"]');
    if (!contentEl) return;
    deps.updateTreeFilterPlaceholder();
    const allNodes = deps.getTreeNodes();
    const activeObjectId = deps.getActiveObjectId();
    if (activeObjectId && !allNodes.some((node: any) => node.id === activeObjectId)) {
        deps.setActiveObjectId(null);
        deps.setActiveObjectType(null);
    }
    const nodes = deps.filterNavigatorNodes(allNodes);
    const treeTitle = deps.hasLoadedWorkspaceModel() ? deps.getNavigatorSiteLabel() : 'Navigator tree';
    const emptyMessage = deps.hasLoadedWorkspaceModel()
        ? 'Nenhum objeto encontrado.'
        : 'Selecione um modelo ou snapshot para navegar no workspace.';

    contentEl.innerHTML = `
        <div class="actions-shell-tree-title">${escapeHtml(treeTitle)}</div>
        <ul class="actions-shell-tree-list">
            ${nodes
                .map(
                    (node: any) => `
                <li>
                    <button type="button"
                            class="actions-shell-tree-node${deps.getActiveObjectId() === node.id ? ' active' : ''}"
                            data-node-id="${escapeHtml(node.id)}"
                            data-node-type="${escapeHtml(node.type)}"
                            data-node-depth="${String(node.depth || 0)}"
                            title="${escapeHtml(node.searchText || node.label)}"
                            style="padding-left:${6 + (node.depth || 0) * 14}px"
                            data-testid="actions-tree-node">
                        ${escapeHtml(`${deps.getObjectTypeLabel(node.type)} · ${node.label}`)}
                    </button>
                </li>`,
                )
                .join('')}
        </ul>
        ${nodes.length === 0 ? `<div class="actions-shell-tree-empty">${escapeHtml(emptyMessage)}</div>` : ''}
    `;

    const nodeButtons = contentEl.querySelectorAll('[data-node-id]');
    for (const btn of nodeButtons) {
        btn.addEventListener('click', () => {
            deps.setActiveObjectId(btn.getAttribute('data-node-id'));
            deps.setActiveObjectType(btn.getAttribute('data-node-type'));
            deps.renderTree();
            deps.renderContextPanel('tree');
            window.dispatchEvent(
                new CustomEvent('object:selected', {
                    detail: {
                        objectId: deps.getActiveObjectId(),
                        objectType: deps.getActiveObjectType(),
                        origin: 'tree',
                    },
                }),
            );
            deps.dispatchContextChanged('tree');
        });
    }
}
