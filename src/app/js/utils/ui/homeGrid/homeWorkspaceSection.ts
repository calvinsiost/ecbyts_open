// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S5-runtime — render da seção de workspace (sidebar).
 * claude - ui 2026-06-16.
 *
 * EN: Renders the workspace loader section in the left sidebar (scope/source
 *     switchers, model list, snapshots, layout reset). Delegates the footer
 *     render + the source-loaded kick to injected callbacks. All homeGrid state
 *     and helpers via `deps`. Behavior byte-identical to the legacy inline
 *     `_renderWorkspaceSection`.
 *
 * PT (leigo): desenha a seção de "trocar workspace" do painel esquerdo — onde
 *     se escolhe escopo/fonte e a lista de modelos/snapshots. Estado e cliques
 *     vêm do homeGrid.
 *
 * DOM-coupled — validado pelo smoke E2E home-stats-s4.
 */
import { escapeHtml } from '../../helpers/html.js';
import { t } from '../../i18n/translations.js';

/** Dependências injetadas (estado via getters, helpers via callbacks). */
export interface WorkspaceSectionDeps {
    readonly renderSidebarFooter: () => void;
    readonly getSectionEl: () => any;
    readonly ensureWorkspaceSourceLoaded: (source: string) => Promise<any>;
    readonly getActiveModelSource: () => string;
    readonly ensureWorkspaceDefaults: () => void;
    readonly getCurrentUser: () => any;
    readonly getScopeOptions: () => readonly any[];
    readonly getWorkspaceItemsForActiveSource: () => readonly any[];
    readonly getActiveLaneSnapshots: () => readonly any[];
    readonly getWorkspaceCache: () => any;
    readonly getWorkspaceSourceLabel: () => string;
    readonly getWorkspaceScopeLabel: () => string;
    readonly getWorkspaceLoaderExpanded: () => boolean;
    readonly getWorkspaceSourceExpanded: () => boolean;
    readonly getActiveScopeKind: () => string;
    readonly workspaceSourceDefs: readonly any[];
    readonly buildWorkspaceModelListHtml: (items: any) => string;
    readonly buildWorkspaceSnapshotListHtml: (snapshots: any) => string;
    readonly wireWorkspacePickerEvents: (sectionEl: any) => void;
}

/**
 * Renderiza a seção de workspace. Comportamento idêntico ao inline legado
 * (incluindo o render do rodapé no topo e o kick de carregamento de fonte).
 */
export function renderWorkspaceSection(deps: WorkspaceSectionDeps): void {
    deps.renderSidebarFooter();
    const sectionEl = deps.getSectionEl();
    const activeModelSource = deps.getActiveModelSource();
    if (!sectionEl) {
        deps.ensureWorkspaceSourceLoaded(activeModelSource).catch((err: any) =>
            console.debug('[homeGrid:workspace-loader]', (err as any)?.message || err),
        );
        return;
    }
    deps.ensureWorkspaceDefaults();

    const user = deps.getCurrentUser() as any;
    const scopeOptions = deps.getScopeOptions();
    const modelItems = deps.getWorkspaceItemsForActiveSource();
    const snapshots = activeModelSource === 'autosave' ? deps.getActiveLaneSnapshots() : [];
    const workspaceCache = deps.getWorkspaceCache();
    const isLoading = !!workspaceCache.loading[activeModelSource];
    const showSnapshots = activeModelSource === 'autosave';
    const activeSourceLabel = deps.getWorkspaceSourceLabel();
    const activeScopeLabel = deps.getWorkspaceScopeLabel();
    const activeScopeKind = deps.getActiveScopeKind();
    const workspaceLoaderExpanded = deps.getWorkspaceLoaderExpanded();
    const workspaceSourceExpanded = deps.getWorkspaceSourceExpanded();

    sectionEl.innerHTML = `
        <div class="actions-shell-workspace-head">
            <div class="actions-shell-workspace-head-copy">
                <div class="actions-shell-workspace-title">Workspace</div>
                <div class="actions-shell-workspace-status">${escapeHtml(activeScopeLabel)} · ${escapeHtml(activeSourceLabel)}</div>
            </div>
            <button type="button"
                    class="actions-shell-chip actions-shell-loader-toggle"
                    data-workspace-loader-toggle="true"
                    aria-expanded="${workspaceLoaderExpanded ? 'true' : 'false'}"
                    data-testid="actions-workspace-loader-toggle">
                ${workspaceLoaderExpanded ? `${escapeHtml(t('workspaceLoader.collapse'))} &#9652;` : `${escapeHtml(t('workspaceLoader.switch'))} &#9662;`}
            </button>
        </div>
        <div class="actions-shell-workspace-body" data-testid="actions-workspace-body"${workspaceLoaderExpanded ? '' : ' hidden'}>
            <button type="button"
                    class="actions-shell-chip actions-shell-source-toggle"
                    data-workspace-source-toggle="true"
                    aria-expanded="${workspaceSourceExpanded ? 'true' : 'false'}"
                    data-testid="actions-workspace-source-toggle">
                ${workspaceSourceExpanded ? `${escapeHtml(t('workspaceLoader.hideSource'))} &#9652;` : `${escapeHtml(t('workspaceLoader.switchSource'))} &#9662;`}
            </button>
        <div class="actions-shell-workspace-sources" data-testid="actions-workspace-sources"${workspaceSourceExpanded ? '' : ' hidden'}>
            <div class="actions-shell-workspace-group">
                <div class="actions-shell-workspace-label">Scope</div>
                <div class="actions-shell-scope-switcher" data-testid="actions-scope-switcher">
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
            <div class="actions-shell-workspace-group">
                <div class="actions-shell-workspace-label">Source</div>
                <div class="actions-shell-source-rail" data-testid="actions-model-source-rail">
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
            <div class="actions-shell-workspace-group">
                <button type="button"
                        class="actions-shell-layout-btn"
                        data-actions-layout-reset="true"
                        data-testid="actions-layout-reset">
                    ${escapeHtml(t('workspaceLoader.resetLayout'))}
                </button>
            </div>
        </div>
        <div class="actions-shell-workspace-group">
            <div class="actions-shell-workspace-label">Models</div>
            <div class="actions-shell-model-list" data-testid="actions-model-list">
                ${isLoading ? '<div class="actions-shell-workspace-empty">Carregando...</div>' : deps.buildWorkspaceModelListHtml(modelItems)}
            </div>
        </div>
        ${
            showSnapshots
                ? `
            <div class="actions-shell-workspace-group">
                <div class="actions-shell-workspace-label">Snapshots</div>
                <div class="actions-shell-snapshot-list" data-testid="actions-snapshot-list">
                    ${isLoading ? '<div class="actions-shell-workspace-empty">Carregando snapshots...</div>' : deps.buildWorkspaceSnapshotListHtml(snapshots)}
                </div>
            </div>
        `
                : `
            <div class="actions-shell-snapshot-list is-hidden" data-testid="actions-snapshot-list" hidden></div>
        `
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
    `;

    deps.wireWorkspacePickerEvents(sectionEl);
    deps.ensureWorkspaceSourceLoaded(activeModelSource).catch((err: any) =>
        console.debug('[homeGrid:workspace-loader]', (err as any)?.message || err),
    );
}
