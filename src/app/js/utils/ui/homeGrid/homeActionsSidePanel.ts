// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S5-runtime — render do painel lateral de Ações.
 * claude - ui 2026-06-16.
 *
 * EN: Renders the actions side panel (Inspector / Navigator tabs + tree filter).
 *     It both READS and WRITES homeGrid module state (active side view, the
 *     inspector/tree element refs captured from the freshly built DOM, the tree
 *     filter), so those are injected as getter+setter pairs. Tab clicks re-render
 *     via the injected `renderActionsSidePanel` callback (keeps the recursion in
 *     homeGrid). Behavior byte-identical to the legacy inline function.
 *
 * PT (leigo): desenha o painel lateral direito da tela inicial — as abas
 *     Inspector/Navigator e o campo de busca da árvore. Lê e grava estado do
 *     homeGrid (qual aba está ativa, os elementos recém-criados, o filtro).
 *
 * DOM-coupled — validado pelo smoke E2E home-stats-s4.
 */
import { escapeHtml } from '../../helpers/html.js';
import { t } from '../../i18n/translations.js';

/** Dependências injetadas (estado via getters/setters, helpers via callbacks). */
export interface ActionsSidePanelDeps {
    readonly getSidePanelEl: () => any;
    readonly getActionsSideView: () => string;
    readonly setActionsSideView: (v: string) => void;
    readonly setInspectorPanelEl: (el: any) => void;
    readonly getTreeEl: () => any;
    readonly setTreeEl: (el: any) => void;
    readonly getTreeFilter: () => string;
    readonly setTreeFilter: (v: string) => void;
    /** Re-render (recursão na troca de aba) — mantém o ciclo no homeGrid. */
    readonly renderActionsSidePanel: () => void;
    readonly renderEmbeddedInspector: () => void;
    readonly renderTree: () => void;
}

/**
 * Renderiza o painel lateral de ações. Comportamento idêntico ao inline legado.
 */
export function renderActionsSidePanel(deps: ActionsSidePanelDeps): void {
    const sidePanelEl = deps.getSidePanelEl();
    if (!sidePanelEl) return;

    const inspectorActive = deps.getActionsSideView() !== 'navigator';
    deps.setActionsSideView(inspectorActive ? 'inspector' : 'navigator');
    const inspectorLabel = t('inspector') || 'Inspector';
    const navigatorLabel = t('navigator') || 'Navigator';
    const searchLabel = t('searchInspector') || 'Search...';

    sidePanelEl.innerHTML = `
        <div class="actions-shell-side-tabs" data-testid="actions-side-tabs">
            <button type="button"
                    class="actions-shell-side-tab${inspectorActive ? ' active' : ''}"
                    data-actions-side-view="inspector"
                    data-testid="actions-side-tab-inspector">
                ${escapeHtml(inspectorLabel)}
            </button>
            <button type="button"
                    class="actions-shell-side-tab${inspectorActive ? '' : ' active'}"
                    data-actions-side-view="navigator"
                    data-testid="actions-side-tab-navigator">
                ${escapeHtml(navigatorLabel)}
            </button>
        </div>
        <div class="actions-shell-side-body">
            <section class="actions-shell-side-pane${inspectorActive ? '' : ' is-hidden'}"
                     data-testid="actions-side-pane-inspector"
                     ${inspectorActive ? '' : 'hidden'}>
                <div class="actions-shell-inspector" data-testid="actions-embedded-inspector"></div>
            </section>
            <section class="actions-shell-side-pane${inspectorActive ? ' is-hidden' : ''}"
                     data-testid="actions-side-pane-navigator"
                     ${inspectorActive ? 'hidden' : ''}>
                <div class="actions-shell-tree" data-testid="actions-tree">
                    <label class="actions-shell-tree-filter-wrap" for="actions-tree-filter-input">
                        <span class="actions-shell-tree-filter-label">${escapeHtml(searchLabel)}</span>
                        <input id="actions-tree-filter-input"
                               class="actions-shell-tree-filter"
                               data-testid="actions-tree-filter"
                               type="search"
                               aria-label="${escapeHtml(searchLabel)}"
                               placeholder="${escapeHtml(t('tree.filter.placeholder') || 'Digite para filtrar...')}" />
                    </label>
                    <div data-testid="actions-tree-content"></div>
                </div>
            </section>
        </div>
    `;

    deps.setInspectorPanelEl(sidePanelEl.querySelector('.actions-shell-inspector'));
    deps.setTreeEl(sidePanelEl.querySelector('.actions-shell-tree'));

    for (const btn of sidePanelEl.querySelectorAll('[data-actions-side-view]')) {
        btn.addEventListener('click', () => {
            const next = btn.getAttribute('data-actions-side-view') || 'inspector';
            if (deps.getActionsSideView() === next) return;
            deps.setActionsSideView(next);
            deps.renderActionsSidePanel();
        });
    }

    const filterInput = deps.getTreeEl()?.querySelector('#actions-tree-filter-input');
    if (filterInput) {
        filterInput.value = deps.getTreeFilter();
        filterInput.addEventListener('input', (ev: any) => {
            deps.setTreeFilter(
                String(ev?.target?.value || '')
                    .trim()
                    .toLowerCase(),
            );
            deps.renderTree();
        });
    }

    deps.renderEmbeddedInspector();
    deps.renderTree();
}
