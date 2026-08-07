// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S5-runtime — render da sidebar agrupada por domínio.
 * claude - ui 2026-06-16.
 *
 * EN: Renders the grouped domain sidebar (essential/advanced/community groups
 *     with expand/collapse persisted in localStorage, plus the tree + workspace
 *     footer). homeGrid state (shell-left el, tree el, workspace refs) and the
 *     domain/group catalogs are injected via `deps`. Group toggles + domain
 *     clicks re-render / dispatch via injected callbacks. Behavior byte-identical
 *     to the legacy inline function.
 *
 * PT (leigo): desenha a barra lateral esquerda agrupada por tema (essencial,
 *     avançado, comunidade), lembrando o que está aberto/fechado, mais a árvore
 *     e o rodapé do workspace. Estado e cliques vêm do homeGrid.
 *
 * DOM-coupled — validado pelo smoke E2E home-stats-s4.
 */
import { t } from '../../i18n/translations.js';
import { safeJsonParse } from '../../helpers/safeJsonParse.js';
import { safeSetItem } from '../../storage/storageMonitor.js';
import { registerPreserveKey } from '../../startup/versionGate.js';

/** Dependências injetadas (estado via getters/setters, catálogos, callbacks). */
export interface GroupedSidebarDeps {
    readonly getShellLeftEl: () => any;
    readonly setWorkspaceSectionEl: (el: any) => void;
    readonly setWorkspaceFooterEl: (el: any) => void;
    readonly getTreeEl: () => any;
    readonly sidebarGroups: Readonly<Record<string, any>>;
    readonly domainDefs: readonly any[];
    readonly setActiveDomain: (domainId: string, origin: string) => void;
    /** Re-render na troca de grupo (recursão) — mantém o ciclo no homeGrid. */
    readonly renderGroupedSidebar: (footer: any) => void;
    readonly renderWorkspaceSection: () => void;
}

/**
 * Renderiza a sidebar agrupada. Comportamento idêntico ao inline legado.
 */
export function renderGroupedSidebar(footer: any, deps: GroupedSidebarDeps): void {
    const shellLeftEl = deps.getShellLeftEl();
    if (!shellLeftEl) return;
    shellLeftEl.innerHTML = '';
    deps.setWorkspaceSectionEl(null);
    deps.setWorkspaceFooterEl(footer);
    let expanded: any = { essential: true, advanced: false, community: false };
    registerPreserveKey('ecbyts-sidebar-groups', {
        reason: 'Persists sidebar group expand/collapse state across versions',
        owner: 'homeGrid',
    });
    const sidebarParsed = safeJsonParse<Record<string, any>>(
        localStorage.getItem('ecbyts-sidebar-groups'),
        {},
        'homeGrid-sidebarGroups',
    );
    expanded = { ...expanded, ...sidebarParsed };
    for (const [key, group] of Object.entries(deps.sidebarGroups)) {
        const section = document.createElement('div');
        section.className = 'sidebar-group';
        const isExpanded = !!expanded[key];
        const translatedLabel = t(group.i18n);
        const groupLabel =
            translatedLabel && translatedLabel !== group.i18n ? translatedLabel : group.fallbackLabel || key;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sidebar-group-toggle';
        btn.setAttribute('aria-expanded', String(isExpanded));
        btn.innerHTML = `<span>${groupLabel}</span><span data-icon="${isExpanded ? 'chevron-down' : 'chevron-right'}" data-icon-size="14px"></span>`;
        btn.addEventListener('click', () => {
            const next = !expanded[key];
            expanded[key] = next;
            safeSetItem('ecbyts-sidebar-groups', JSON.stringify(expanded));
            deps.renderGroupedSidebar(footer);
        });
        section.appendChild(btn);
        const list = document.createElement('ul');
        list.className = 'sidebar-group-list';
        list.style.display = isExpanded ? '' : 'none';
        list.setAttribute('role', 'group');
        for (const domainId of group.ids) {
            const domain = deps.domainDefs.find((d: any) => d.id === domainId);
            if (!domain) continue;
            const li = document.createElement('li');
            li.innerHTML = `
                <button type="button"
                        class="actions-shell-rail-btn"
                        data-domain-id="${domain.id}"
                        data-testid="actions-rail-${domain.id}">
                    <span data-icon="${domain.icon}" data-icon-size="14px"></span>
                    <span>${domain.label}</span>
                </button>
            `;
            li.querySelector('button')?.addEventListener('click', () => deps.setActiveDomain(domain.id, 'grouped-sidebar'));
            list.appendChild(li);
        }
        if (key === 'community') {
            // Spec V2 B2: handlers reais com fallback para toast + telemetry
            // se a feature ainda não estiver wired. Nunca noop silencioso.
            const openCommandPalette = () => {
                if (typeof window.openCommandPalette === 'function') {
                    window.openCommandPalette();
                } else if (typeof window.showToast === 'function') {
                    window.showToast(t('explorer.unavailable') || 'Explorer indisponível', 'info');
                }
            };
            const openBookmarks = () => {
                if (typeof window.handleOpenBookmarks === 'function') {
                    window.handleOpenBookmarks();
                } else if (typeof window.showToast === 'function') {
                    window.showToast(t('bookmarks.comingSoon') || 'Bookmarks em breve', 'info');
                }
            };
            const extras = [
                { label: t('explorer') || 'Explorer', icon: 'search', action: openCommandPalette },
                { label: t('bookmarks') || 'Bookmarks', icon: 'bookmark', action: openBookmarks },
            ];
            for (const ex of extras) {
                const li = document.createElement('li');
                li.innerHTML = `
                    <button type="button" class="actions-shell-rail-btn">
                        <span data-icon="${ex.icon}" data-icon-size="14px"></span>
                        <span>${ex.label}</span>
                    </button>
                `;
                li.querySelector('button')?.addEventListener('click', ex.action);
                list.appendChild(li);
            }
        }
        section.appendChild(list);
        shellLeftEl.appendChild(section);
    }
    shellLeftEl.appendChild(deps.getTreeEl());
    shellLeftEl.appendChild(footer);
    deps.renderWorkspaceSection();
    if (typeof window.hydrateIcons === 'function') window.hydrateIcons(shellLeftEl);
}
