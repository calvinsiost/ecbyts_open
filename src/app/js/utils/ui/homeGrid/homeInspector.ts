// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 — render do "inspetor embutido" da home (Actions shell):
 * o cartão de inspeção da coluna direita que mostra ou o resumo do modelo inteiro
 * (quando nada está selecionado) ou os detalhes do elemento selecionado (relações,
 * observações, campanhas + ações rápidas). claude - ui 2026-06-15.
 *
 * EN: Renders the Actions-shell embedded inspector card. `renderEmbeddedInspector`
 *     writes the inspector head + body into the right shell element. When an element
 *     is selected it draws the selection summary (hero, stats, context, action row);
 *     otherwise it draws the model overview (site label, scope/source, element/campaign
 *     /family counts, dominant-family chips, action row). It then hydrates icons and
 *     re-wires the inspector events. All homeGrid state (the live `_inspectorPanelEl`
 *     target element), helpers (selection getter, object-type/site/scope/source/selection
 *     labels, family-chips renderer, event wiring) and i18n (`t`) are injected via
 *     `deps`; the mutable target element is read LIVE through a getter at call time so
 *     reassignment in homeGrid stays observable — byte-for-byte identical to the legacy
 *     inline `_renderEmbeddedInspector`.
 *
 * PT (leigo): desenha o cartão de "inspetor" embutido na tela inicial (parte das
 *     Ações). Se nada estiver selecionado, mostra o resumo do modelo (nome do site,
 *     escopo/origem e as contagens de elementos, campanhas e famílias) com os
 *     "chips" das famílias dominantes. Se houver um elemento selecionado, mostra os
 *     detalhes dele (relações, observações, campanhas) e os botões de ação rápida.
 *     No fim, troca os ícones e religa os cliques dos botões. Tudo que pertence ao
 *     homeGrid (o elemento-alvo do painel, os ajudantes de seleção e de rótulos, o
 *     desenhador de chips, a religação de eventos e a tradução) chega por `deps`. O
 *     elemento-alvo que o homeGrid troca em tempo de execução é lido AO VIVO por uma
 *     função getter na hora da chamada, igualzinho ao código antigo que ficava
 *     embutido no homeGrid.
 *
 * DOM-coupled (escreve innerHTML + hidrata ícones + religa listeners) — mantém
 * classes/IDs/atributos/innerHTML/listeners/early-returns idênticos ao legado.
 */

import { escapeHtml } from '../../helpers/html.js';
import { t } from '../../i18n/translations.js';
import { resolveStatViewModel, type StatViewModel } from '../../../core/minimalism/_emptyStateCtaPure.js';

/**
 * Renderiza um stat do inspetor (UI-MINIMALISM-001 F3.5 / WL-7). Quando a
 * contagem é zero e há CTA, vira um empty-state PEDAGÓGICO (botão "+ Adicionar…")
 * em vez de um "0" morto; com contagem > 0, mostra o número. A DECISÃO é pura
 * (`resolveStatViewModel`), aqui só traduzimos o view-model para markup.
 */
function _renderInspectorStat(vm: StatViewModel): string {
    if (vm.showCta && vm.ctaAction && vm.ctaLabel) {
        return `
            <div class="actions-shell-inspector-stat actions-shell-inspector-stat--empty">
                <button type="button" class="actions-shell-inspector-stat-cta" data-inspector-action="${escapeHtml(
                    vm.ctaAction,
                )}">${escapeHtml(vm.ctaLabel)}</button>
                <span>${escapeHtml(vm.label)}</span>
            </div>
        `;
    }
    return `
            <div class="actions-shell-inspector-stat">
                <strong>${vm.count}</strong>
                <span>${escapeHtml(vm.label)}</span>
            </div>
        `;
}

/** Dependências do inspetor embutido (Actions shell). */
export interface EmbeddedInspectorDeps {
    /** Re-lê o elemento do painel do inspetor VIVO (homeGrid `_inspectorPanelEl`). */
    readonly getInspectorPanelEl: () => any;
    /** Resolve a seleção atual do inspetor (homeGrid `_getEmbeddedInspectorSelection`). */
    readonly getEmbeddedInspectorSelection: () => any;
    /** Rótulo legível do tipo de objeto (homeGrid `_getObjectTypeLabel`). */
    readonly getObjectTypeLabel: (objectType: any) => any;
    /** Rótulo do site no navegador (homeGrid `_getNavigatorSiteLabel`). */
    readonly getNavigatorSiteLabel: () => any;
    /** Rótulo do escopo do workspace (homeGrid `_getWorkspaceScopeLabel`). */
    readonly getWorkspaceScopeLabel: () => any;
    /** Rótulo da origem do workspace (homeGrid `_getWorkspaceSourceLabel`). */
    readonly getWorkspaceSourceLabel: () => any;
    /** Rótulo da seleção do workspace (homeGrid `_getWorkspaceSelectionLabel`). */
    readonly getWorkspaceSelectionLabel: () => any;
    /** Desenha os chips de famílias dominantes (homeGrid `_renderInspectorFamilyChips`). */
    readonly renderInspectorFamilyChips: (familyCounts: any) => any;
    /** Religa os eventos dos botões do inspetor (homeGrid `_wireEmbeddedInspectorEvents`). */
    readonly wireEmbeddedInspectorEvents: () => void;
}

/**
 * Renderiza o inspetor embutido (resumo do modelo ou detalhes da seleção).
 * Comportamento idêntico ao `_renderEmbeddedInspector` legado.
 *
 * @param deps Dependências injetadas.
 */
export function renderEmbeddedInspector(deps: EmbeddedInspectorDeps) {
    const _inspectorPanelEl = deps.getInspectorPanelEl();
    if (!_inspectorPanelEl) return;
    const { selected, elements, campaigns, familyCounts, selectedCampaigns, selectedObservations, selectedEdges } =
        deps.getEmbeddedInspectorSelection();
    const selectionHtml = selected
        ? `
            <div class="actions-shell-inspector-summary">
                <div class="actions-shell-inspector-section">
                    <div class="actions-shell-inspector-hero">&#9670; ${escapeHtml(selected.name || selected.id)} <span class="actions-shell-inspector-meta">(${escapeHtml(deps.getObjectTypeLabel(selected.family || selected.type || 'point'))})</span></div>
                </div>
                <div class="actions-shell-inspector-stats">
                    ${_renderInspectorStat(
                        resolveStatViewModel({
                            key: 'relations',
                            label: 'Relações',
                            count: selectedEdges.length,
                            ctaAction: 'add-relation',
                            ctaLabel: t('inspector.addRelation'),
                        }),
                    )}
                    ${_renderInspectorStat(
                        resolveStatViewModel({
                            key: 'observations',
                            label: 'Observações',
                            count: selectedObservations.length,
                            ctaAction: 'add-observation',
                            ctaLabel: t('inspector.addObservation'),
                        }),
                    )}
                    ${_renderInspectorStat(
                        resolveStatViewModel({
                            key: 'campaigns',
                            label: 'Campanhas',
                            count: selectedCampaigns.length || 1,
                        }),
                    )}
                </div>
                <div class="actions-shell-inspector-section">
                    <div class="actions-shell-inspector-kicker">Contexto</div>
                    <div class="actions-shell-inspector-meta">${escapeHtml(
                        selectedCampaigns.join(' · ') || '—',
                    )}</div>
                </div>
                <div class="actions-shell-inspector-action-row">
                    <button type="button" class="actions-shell-inspector-btn actions-shell-inspector-btn--primary" data-inspector-action="open-model">Abrir no Model</button>
                    <button type="button" class="actions-shell-inspector-btn" data-inspector-action="clear-selection">Limpar seleção</button>
                    <button type="button" class="actions-shell-inspector-btn" data-inspector-action="open-navigator">Navigator</button>
                </div>
            </div>
        `
        : `
            <div class="actions-shell-inspector-summary">
                <div class="actions-shell-inspector-section">
                    <div class="actions-shell-inspector-kicker">Resumo do modelo</div>
                    <div class="actions-shell-inspector-hero">${escapeHtml(deps.getNavigatorSiteLabel())}</div>
                    <div class="actions-shell-inspector-meta">${escapeHtml(deps.getWorkspaceScopeLabel())} · ${escapeHtml(
                        deps.getWorkspaceSourceLabel(),
                    )}</div>
                </div>
                <div class="actions-shell-inspector-stats">
                    <div class="actions-shell-inspector-stat">
                        <strong>${elements.length}</strong>
                        <span>Elementos</span>
                    </div>
                    <div class="actions-shell-inspector-stat">
                        <strong>${campaigns.length}</strong>
                        <span>Campanhas</span>
                    </div>
                    <div class="actions-shell-inspector-stat">
                        <strong>${familyCounts.length}</strong>
                        <span>Famílias-chave</span>
                    </div>
                </div>
                <div class="actions-shell-inspector-section">
                    <div class="actions-shell-inspector-kicker">Famílias dominantes</div>
                    <div class="actions-shell-inspector-chips">${deps.renderInspectorFamilyChips(familyCounts)}</div>
                </div>
                <div class="actions-shell-inspector-action-row">
                    <button type="button" class="actions-shell-inspector-btn" data-inspector-action="open-navigator">Abrir navigator</button>
                    <button type="button" class="actions-shell-inspector-btn" data-inspector-action="reset-layout">Reset layout</button>
                    <button type="button" class="actions-shell-inspector-btn" data-inspector-action="open-panel">Inspector completo</button>
                </div>
            </div>
        `;

    _inspectorPanelEl.innerHTML = `
        <div class="actions-shell-inspector-head">
            <div class="actions-shell-inspector-title-wrap">
                <div class="actions-shell-inspector-title">${escapeHtml(t('inspector') || 'Inspector')}</div>
                <div class="actions-shell-inspector-breadcrumb">${escapeHtml(
                    selected ? `Selecionado · ${selected.id}` : `Overview · ${deps.getWorkspaceSelectionLabel()}`,
                )}</div>
            </div>
            <div class="actions-shell-inspector-actions">
                <button type="button" class="actions-shell-inspector-btn" data-inspector-action="open-panel">Open</button>
            </div>
        </div>
        <div class="actions-shell-inspector-body" data-testid="actions-inspector-body">
            ${selectionHtml}
        </div>
    `;
    if (typeof window.hydrateIcons === 'function') window.hydrateIcons(_inspectorPanelEl);
    deps.wireEmbeddedInspectorEvents();
}
