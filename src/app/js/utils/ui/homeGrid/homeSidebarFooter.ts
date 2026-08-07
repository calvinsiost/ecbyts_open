// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S5-runtime — render do rodapé do workspace (sidebar).
 * claude - ui 2026-06-16.
 *
 * EN: Renders the workspace footer card in the left sidebar — scope/source
 *     switchers, model/lane list, snapshots, status. All homeGrid state and
 *     helpers are injected via `deps` (getters for mutable state, callbacks for
 *     helpers). Click wiring stays in homeGrid (deps.wireWorkspaceFooterEvents).
 *     Behavior byte-identical to the legacy inline `_renderSidebarFooter`.
 *
 * PT (leigo): desenha o "rodapé" do painel esquerdo da tela inicial — onde se
 *     escolhe o escopo, a fonte do modelo, a lista de modelos/lanes e os
 *     snapshots. Quem desenha é este módulo; o estado e os cliques vêm do
 *     homeGrid.
 *
 * DOM-coupled — validado pelo smoke E2E home-stats-s4.
 */
import { escapeHtml } from '../../helpers/html.js';

/** Dependências injetadas (estado via getters, helpers via callbacks). */
export interface SidebarFooterDeps {
    readonly getFooterEl: () => any;
    readonly ensureWorkspaceDefaults: () => void;
    readonly getCurrentUser: () => any;
    readonly getScopeOptions: () => readonly any[];
    readonly getWorkspaceItemsForActiveSource: () => readonly any[];
    readonly getActiveModelSource: () => string;
    readonly getActiveLaneSnapshots: () => readonly any[];
    readonly getWorkspaceCache: () => any;
    readonly getActiveLaneId: () => string | null;
    readonly getActiveSnapshotId: () => string | null;
    readonly getWorkspaceSelectionLabel: () => string;
    readonly getWorkspaceScopeLabel: () => string;
    readonly getWorkspaceSourceLabel: () => string;
    readonly getWorkspaceFooterExpanded: () => boolean;
    readonly getActiveScopeKind: () => string;
    readonly workspaceSourceDefs: readonly any[];
    readonly buildWorkspaceModelListHtml: (items: any) => string;
    readonly buildWorkspaceSnapshotListHtml: (snapshots: any) => string;
    readonly getWorkspaceEmptyMessage: () => string;
    readonly wireWorkspaceFooterEvents: () => void;
}

/**
 * Renderiza o rodapé do workspace. Comportamento idêntico ao inline legado.
 */
export function renderSidebarFooter(deps: SidebarFooterDeps): void {
    const footerEl = deps.getFooterEl();
    if (!footerEl) return;
    deps.ensureWorkspaceDefaults();

    const user = deps.getCurrentUser() as any;
    const activeModelSource = deps.getActiveModelSource();
    const scopeOptions = deps.getScopeOptions();
    const modelItems = deps.getWorkspaceItemsForActiveSource();
    const snapshots = activeModelSource === 'autosave' ? deps.getActiveLaneSnapshots() : [];
    const workspaceCache = deps.getWorkspaceCache();
    const isLoading = !!workspaceCache.loading[activeModelSource];
    const hasSnapshots = activeModelSource === 'autosave';
    const activeLaneId = deps.getActiveLaneId();
    const activeSnapshotId = deps.getActiveSnapshotId();
    const laneLabel = activeLaneId ? `Lane ${activeLaneId.slice(0, 8)}` : null;
    const snapshotLabel = activeSnapshotId ? `Snapshot ${activeSnapshotId.slice(0, 8)}` : null;
    const selectionLabel = deps.getWorkspaceSelectionLabel();
    const activeScopeKind = deps.getActiveScopeKind();
    const workspaceFooterExpanded = deps.getWorkspaceFooterExpanded();
    const sourceStatus =
        workspaceCache.errors[activeModelSource] ||
        (isLoading
            ? 'Carregando workspace...'
            : activeModelSource === 'local'
              ? modelItems[0]?.status || 'Workspace local ativo'
              : modelItems.length > 0
                ? `${modelItems.length} item(ns) disponiveis`
                : deps.getWorkspaceEmptyMessage());

    footerEl.innerHTML = `
        <div class="actions-shell-footer-card">
            <button type="button"
                    class="actions-shell-footer-toggle"
                    data-workspace-footer-toggle="true"
                    aria-expanded="${workspaceFooterExpanded ? 'true' : 'false'}">
                <span class="actions-shell-footer-title-wrap">
                    <span class="actions-shell-footer-title">Workspace</span>
                    <span class="actions-shell-footer-selection">${escapeHtml(selectionLabel)}</span>
                </span>
                <span data-icon="${workspaceFooterExpanded ? 'chevron-up' : 'chevron-down'}" data-icon-size="14px"></span>
            </button>
            <div class="actions-shell-footer-meta">
                <span>${escapeHtml(deps.getWorkspaceScopeLabel())}</span>
                <span>${escapeHtml(deps.getWorkspaceSourceLabel())}</span>
                ${laneLabel ? `<span>${escapeHtml(laneLabel)}</span>` : ''}
                ${snapshotLabel ? `<span>${escapeHtml(snapshotLabel)}</span>` : ''}
            </div>
            <div class="actions-shell-footer-status">${escapeHtml(sourceStatus)}</div>
            <div class="actions-shell-footer-controls${workspaceFooterExpanded ? '' : ' is-hidden'}" ${
                workspaceFooterExpanded ? '' : 'hidden'
            }>
                <div class="actions-shell-footer-group">
                    <div class="actions-shell-footer-label">Scope</div>
                    <div class="actions-shell-footer-chip-row" data-testid="actions-scope-switcher">
                        ${scopeOptions
                            .map((option: any) => `
                            <button type="button"
                                    class="actions-shell-chip${activeScopeKind === option.kind ? ' active' : ''}"
                                    data-scope-kind="${escapeHtml(option.kind)}"
                                    data-org-id="${escapeHtml(option.orgId || '')}"
                                    data-testid="actions-scope-${escapeHtml(option.kind)}"
                                    ${option.disabled ? 'disabled' : ''}>
                                ${escapeHtml(option.label)}
                            </button>
                        `,
                            )
                            .join('')}
                    </div>
                </div>
                <div class="actions-shell-footer-group">
                    <div class="actions-shell-footer-label">Source</div>
                    <div class="actions-shell-footer-chip-row" data-testid="actions-model-source-rail">
                        ${deps.workspaceSourceDefs.map((source: any) => `
                            <button type="button"
                                    class="actions-shell-chip${activeModelSource === source.id ? ' active' : ''}"
                                    data-model-source="${escapeHtml(source.id)}"
                                    data-testid="actions-model-source-${escapeHtml(source.id)}">
                                ${escapeHtml(source.label)}
                            </button>
                        `,
                        ).join('')}
                    </div>
                </div>
                <div class="actions-shell-footer-group">
                    <div class="actions-shell-footer-label">${activeModelSource === 'autosave' ? 'Lanes' : 'Models'}</div>
                    <div class="actions-shell-footer-list" data-testid="actions-model-list">
                        ${isLoading ? '<div class="actions-shell-workspace-empty">Carregando...</div>' : deps.buildWorkspaceModelListHtml(modelItems)}
                    </div>
                </div>
                ${
                    hasSnapshots
                        ? `
                    <div class="actions-shell-footer-group">
                        <div class="actions-shell-footer-label">Snapshots</div>
                        <div class="actions-shell-footer-list" data-testid="actions-snapshot-list">
                            ${isLoading ? '<div class="actions-shell-workspace-empty">Carregando snapshots...</div>' : deps.buildWorkspaceSnapshotListHtml(snapshots)}
                        </div>
                    </div>
                `
                        : ''
                }
                ${
                    !user && activeModelSource !== 'local'
                        ? `
                    <div class="actions-shell-workspace-actions">
                        <button type="button" class="actions-shell-chip" data-workspace-action="login">Entrar</button>
                    </div>
                `
                        : ''
                }
            </div>
        </div>
    `;
    deps.wireWorkspaceFooterEvents();
    if (typeof window.hydrateIcons === 'function') window.hydrateIcons(footerEl);
}
