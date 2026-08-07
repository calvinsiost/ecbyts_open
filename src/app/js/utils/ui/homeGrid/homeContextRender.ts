// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 — render do "contexto ativo" da home (Actions shell):
 * painel de contexto (breadcrumb + painel de relações), superfície contextual
 * principal (toolbar + grid de contexto + ações rápidas) e a trilha de navegação
 * (breadcrumb). claude - ui 2026-06-15.
 *
 * EN: Renders the Actions-shell "active context" surfaces.
 *     `renderContextPanel` re-draws the breadcrumb and the relations panel into
 *     the right shell element. `renderContextualMain` writes the contextual
 *     toolbar and the surface card (active-context grid + quick actions) and
 *     wires their per-button click listeners, which dispatch `actions:context-action`
 *     window CustomEvents (no homeGrid callback needed). `renderBreadcrumb` writes
 *     the domain + navigator-path text into the breadcrumb element. All homeGrid
 *     state (active domain/object ids, target elements, catalogs, helpers, i18n)
 *     is injected via `deps`; the mutable target elements (`shellRight`,
 *     `contextToolbar`, `contextSurface`, `breadcrumb`) are read LIVE through
 *     getters at call time so reassignment in homeGrid stays observable — byte-for-byte
 *     identical to the legacy inline `_renderContextPanel` / `_renderContextualMain`
 *     / `_renderBreadcrumb` trio.
 *
 * PT (leigo): desenha as caixas de "contexto ativo" da tela inicial (parte das
 *     Ações). `renderContextPanel` redesenha a trilha de navegação (o caminho
 *     "Domínio > Site > ...") e o painel de relações na coluna da direita.
 *     `renderContextualMain` escreve a barra de ferramentas do contexto e o cartão
 *     de superfície (tipo/objeto/domínio + botões de ação rápida) e liga o clique
 *     de cada botão, que dispara um evento de janela para o resto do app reagir.
 *     `renderBreadcrumb` escreve o texto da trilha de navegação. Tudo que pertence
 *     ao homeGrid (qual domínio/objeto está ativo, os elementos da tela, as listas
 *     fixas, os ajudantes e a tradução) chega por `deps`. Os elementos-alvo que o
 *     homeGrid troca em tempo de execução são lidos AO VIVO por funções getter na
 *     hora da chamada, igualzinho ao código antigo que ficava embutido no homeGrid.
 *
 * DOM-coupled (escreve innerHTML + listeners) — mantém classes/IDs/atributos/
 * innerHTML/listeners/early-returns idênticos ao legado.
 */

import { escapeHtml } from '../../helpers/html.js';

/** Dependências base compartilhadas pelos três renders. */
export interface ContextRenderDeps {
    /** Tradutor i18n (chave → texto); cai no fallback literal se ausente. */
    readonly t: (key: string) => string;
    /** Catálogo congelado de domínios (homeGrid `DOMAIN_DEFS`). */
    readonly DOMAIN_DEFS: readonly any[];
    /** ID do domínio ativo (homeGrid `_activeDomain`). */
    readonly getActiveDomain: () => any;
    /** Tipo do objeto ativo (homeGrid `_activeObjectType`). */
    readonly getActiveObjectType: () => any;
    /** ID do objeto ativo (homeGrid `_activeObjectId`). */
    readonly getActiveObjectId: () => any;
}

/** Deps do painel de contexto — breadcrumb + painel de relações na coluna direita. */
export interface ContextPanelDeps extends ContextRenderDeps {
    /** Re-lê o elemento da coluna direita VIVO (homeGrid `_shellRightEl`). */
    readonly getShellRightEl: () => any;
    /** Redesenha a trilha de navegação (homeGrid `_renderBreadcrumb`). */
    readonly renderBreadcrumb: () => void;
    /** Renderiza o painel de relações (homeGrid `_renderActionsRelationsPanel`). */
    readonly renderActionsRelationsPanel: (shellRightEl: any) => void;
}

/** Deps da superfície contextual principal — toolbar + cartão de contexto. */
export interface ContextualMainDeps extends ContextRenderDeps {
    /** Re-lê o elemento da toolbar contextual VIVO (homeGrid `_contextToolbarEl`). */
    readonly getContextToolbarEl: () => any;
    /** Re-lê o elemento da superfície de contexto VIVO (homeGrid `_contextSurfaceEl`). */
    readonly getContextSurfaceEl: () => any;
    /** Rótulo legível do objeto ativo (homeGrid `_getActiveObjectLabel`). */
    readonly getActiveObjectLabel: () => any;
    /** Rótulo legível do tipo de objeto (homeGrid `_getObjectTypeLabel`). */
    readonly getObjectTypeLabel: (type: any) => any;
    /** Lista de ações para um tipo de objeto (homeGrid `_getActionsForType`). */
    readonly getActionsForType: (objectType: any) => readonly any[];
    /** Converte a origem técnica em rótulo legível (homeGrid `_originToLabel`). */
    readonly originToLabel: (origin: any) => any;
}

/** Deps da trilha de navegação (breadcrumb). */
export interface BreadcrumbDeps extends ContextRenderDeps {
    /** Re-lê o elemento da trilha de navegação VIVO (homeGrid `_breadcrumbEl`). */
    readonly getBreadcrumbEl: () => any;
    /** Rótulos do caminho do navegador (homeGrid `_getActiveNavigatorPathLabels`). */
    readonly getActiveNavigatorPathLabels: () => readonly any[];
    /** Rótulo do site no navegador (homeGrid `_getNavigatorSiteLabel`). */
    readonly getNavigatorSiteLabel: () => any;
}

/**
 * Renderiza o painel de contexto (breadcrumb + painel de relações).
 * Comportamento idêntico ao `_renderContextPanel` legado.
 *
 * @param origin Origem da mudança de contexto (preservado por assinatura — não usado no corpo).
 * @param deps Dependências injetadas.
 */
export function renderContextPanel(origin: any, deps: ContextPanelDeps) {
    deps.renderBreadcrumb();
    deps.renderActionsRelationsPanel(deps.getShellRightEl());
}

/**
 * Renderiza a superfície contextual principal (toolbar + cartão de contexto).
 * Comportamento idêntico ao `_renderContextualMain` legado.
 *
 * @param origin Origem da última mudança de contexto.
 * @param deps Dependências injetadas.
 */
export function renderContextualMain(origin: any, deps: ContextualMainDeps) {
    const { t, DOMAIN_DEFS } = deps;
    const _activeDomain = deps.getActiveDomain();
    const _activeObjectType = deps.getActiveObjectType();
    const _activeObjectId = deps.getActiveObjectId();
    const _contextToolbarEl = deps.getContextToolbarEl();
    const _contextSurfaceEl = deps.getContextSurfaceEl();

    const domain: any = DOMAIN_DEFS.find((item: any) => item.id === _activeDomain) || DOMAIN_DEFS[0];
    const type = _activeObjectType || 'launchpad';
    const label = deps.getActiveObjectLabel();
    const typeLabel = deps.getObjectTypeLabel(type);

    const actions = deps.getActionsForType(_activeObjectType);

    if (_contextToolbarEl) {
        _contextToolbarEl.innerHTML = `
            <span class="actions-shell-toolbar-title">Toolbar contextual</span>
            ${actions
                .map(
                    /** @param {any} deps */ (action: any) => `
                <button type="button"
                        class="actions-shell-toolbar-btn"
                        data-testid="actions-context-action"
                        data-action-id="${escapeHtml(action.id)}">
                    ${escapeHtml(action.label)}
                </button>`,
                )
                .join('')}
        `;
        const toolbarButtons = _contextToolbarEl.querySelectorAll('[data-action-id]');
        for (const btn of toolbarButtons) {
            btn.addEventListener('click', () => {
                const actionId = btn.getAttribute('data-action-id');
                window.dispatchEvent(
                    new CustomEvent('actions:context-action', {
                        detail: {
                            actionId,
                            objectId: _activeObjectId,
                            objectType: _activeObjectType,
                            origin: 'toolbar',
                        },
                    }),
                );
            });
        }
    }

    if (_contextSurfaceEl) {
        // V2 F7: origin vira label legível + tooltip com código técnico
        const originLabel = deps.originToLabel(origin);
        _contextSurfaceEl.innerHTML = `
            <div class="actions-shell-surface-head">
                <strong>Contexto ativo</strong>
                <span class="actions-shell-surface-origin"
                      title="${t('context.origin.tooltip') || 'Origem da última mudança de contexto'}: ${escapeHtml(origin)}"
                      aria-label="${t('context.origin.aria') || 'Origem'}: ${escapeHtml(originLabel)}">${escapeHtml(originLabel)}</span>
            </div>
            <div class="actions-shell-surface-grid">
                <div><span>Tipo</span> <strong>${escapeHtml(typeLabel)}</strong></div>
                <div><span>Objeto</span> <strong>${escapeHtml(label)}</strong></div>
                <div><span>Dominio</span> <strong>${escapeHtml(domain.label)}</strong></div>
            </div>
            <div class="actions-shell-surface-actions">
                <span class="actions-shell-surface-actions-label">Acoes rapidas</span>
                <div class="actions-shell-surface-actions-list">
                    ${actions
                        .map(
                            /** @param {any} deps */ (action: any) => `
                        <button type="button"
                                class="actions-shell-surface-action-btn"
                                data-testid="actions-context-action"
                                data-action-id="${escapeHtml(action.id)}">
                            ${escapeHtml(action.label)}
                        </button>`,
                        )
                        .join('')}
                </div>
            </div>
        `;
        const buttons = _contextSurfaceEl.querySelectorAll('[data-action-id]');
        for (const btn of buttons) {
            btn.addEventListener('click', () => {
                const actionId = btn.getAttribute('data-action-id');
                window.dispatchEvent(
                    new CustomEvent('actions:context-action', {
                        detail: {
                            actionId,
                            objectId: _activeObjectId,
                            objectType: _activeObjectType,
                            origin: 'surface',
                        },
                    }),
                );
            });
        }
    }
}

/**
 * Renderiza a trilha de navegação (breadcrumb).
 * Comportamento idêntico ao `_renderBreadcrumb` legado.
 *
 * @param deps Dependências injetadas.
 */
export function renderBreadcrumb(deps: BreadcrumbDeps) {
    const { DOMAIN_DEFS } = deps;
    const _breadcrumbEl = deps.getBreadcrumbEl();
    if (!_breadcrumbEl) return;
    const domain: any = DOMAIN_DEFS.find((item: any) => item.id === deps.getActiveDomain()) || DOMAIN_DEFS[0];
    const segments = [domain.label];
    const activePath = deps.getActiveNavigatorPathLabels();
    if (activePath.length > 0) {
        segments.push(...activePath);
    } else {
        segments.push(deps.getNavigatorSiteLabel());
    }
    _breadcrumbEl.textContent = segments.filter(Boolean).join(' > ');
}
