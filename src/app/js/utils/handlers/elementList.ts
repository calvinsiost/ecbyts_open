// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
import { getElementById } from '../../core/elements/manager.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { createLogger } from '../helpers/logger.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
const log = createLogger('ElementList');
let _requestUIRefresh: any = null;
export function setUpdateAllUI(fn: any): void {
    _requestUIRefresh = fn;
}
function requestElementListUIRefresh(reason = 'element-list.changed') {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.ELEMENT_LIST,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
    ];
    for (const domain of domains)
        _requestUIRefresh(domain, reason);
}
/**
 * Filtra a lista de elementos pelo texto digitado e/ou familia selecionada.
 * Opera no DOM (show/hide) sem re-renderizar a lista.
 * Suporta modo arvore hierarquica e modo lista plana.
 */
function applyElementListFilter() {
    const searchEl = document.getElementById("elements-search") as any;
    const familyEl = document.getElementById("elements-filter-family") as any;
    const query = (searchEl?.value || '').toLowerCase().trim();
    const familyId = familyEl?.value || '';
    const container = document.getElementById('elements-list');
    if (!container)
        return;
    const matchCard = (el: any): boolean => {
        const name = (el.querySelector('.element-card-name')?.textContent || '').toLowerCase();
        const fam = el.dataset.elementFamily || '';
        return (!query || name.includes(query)) && (!familyId || fam === familyId);
    };
    // Modo arvore hierarquica
    const leaves = container.querySelectorAll('[data-hierarchy-leaf]');
    if (leaves.length > 0) {
        leaves.forEach((leaf: any) => {
            const card = leaf.querySelector('[data-element-id]');
            (leaf).style.display = card && matchCard(card) ? '' : 'none';
        });
        container.querySelectorAll('.hierarchy-container-node').forEach((node: any) => {
            const hasVisible = Array.from(node.querySelectorAll('[data-hierarchy-leaf]')).some((leaf: any) => (leaf).style.display !== 'none');
            (node).style.display = !query && !familyId ? '' : hasVisible ? '' : 'none';
        });
        return;
    }
    // Modo lista plana / grupos
    container.querySelectorAll('.element-card[data-element-id]').forEach((card: any) => {
        (card).style.display = matchCard(card) ? '' : 'none';
    });
    container.querySelectorAll('.element-group').forEach((group: any) => {
        const hasVisible = Array.from(group.querySelectorAll('.element-card[data-element-id]')).some((card: any) => (card).style.display !== 'none');
        (group).style.display = !query && !familyId ? '' : hasVisible ? '' : 'none';
    });
}
/**
 * Handler para input de pesquisa de elementos.
 * @param {string} _value
 */
export function handleElementSearch(_value: string): void {
    applyElementListFilter();
}
/**
 * Handler para filtro de familia de elementos.
 * @param {string} _familyId
 */
export function handleElementFilterFamily(_familyId: string): void {
    applyElementListFilter();
}
/**
 * Toggle element details position mode.
 * Alterna entre detalhes ao lado da lista (padrao) e fixo no fundo do painel (docked).
 */
export function handleToggleDetailsDock() {
    const current = (localStorage.getItem('ecbyts-details-docked') || '') === 'true';
    safeSetItem('ecbyts-details-docked', (!current).toString());
    requestElementListUIRefresh('element-list.details-dock-toggled');
}
/**
 * Open family module picker for an element.
 * Abre picker de sub-modulos (ex: perfil geologico, inspecao fotografica).
 *
 * @param {string} elementId
 * @param {HTMLElement} anchorEl
 */
export function handleOpenFamilyModulePicker(elementId: string, anchorEl: HTMLElement): void {
    const element = getElementById(elementId);
    if (!element)
        return;
    import('../../core/elements/familyModuleRegistry.js' as string)
        .then(({ openModulePicker }) => {
        openModulePicker(elementId, element.family, anchorEl);
    })
        .catch((err) => log.error('Failed to open family module picker', err.message));
}
export const elementListHandlers = {
    handleElementSearch,
    handleElementFilterFamily,
    handleToggleDetailsDock,
    handleOpenFamilyModulePicker,
};
