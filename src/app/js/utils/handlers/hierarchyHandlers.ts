// @ts-check
// Generated from src/app/js/utils/handlers/hierarchyHandlers.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   HIERARCHY HANDLERS — Acoes de hierarquia espacial PDPL-U / PDPLU
   ================================================================

   Handlers para Project → Area → Zone → Element.
   Containers nao possuem mesh 3D — apenas organizam elementos.

   Padrao: chama manager + refresh por dominio.
   ================================================================ */
import { addNewElement, setParent } from '../../core/elements/manager.js';
import { CONFIG } from '../../config.js';
import { createLogger } from '../helpers/logger.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
const log = createLogger('Hierarchy');
/** Funcao de atualizacao de UI — injetada por registerAllHandlers */
let _requestUIRefresh: any = null;
/**
 * Injeta a funcao de atualizacao de UI.
 * @param {() => void} fn
 */
export function setHierarchyUpdateAllUI(fn: () => void) {
    _requestUIRefresh = fn;
}
function requestHierarchyUIRefresh(reason = 'hierarchy.changed') {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.HIERARCHY,
        UI_INVALIDATION_DOMAINS.ELEMENT_LIST,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
    ];
    for (const domain of domains)
        _requestUIRefresh(domain, reason);
}
// ----------------------------------------------------------------
// HANDLERS
// ----------------------------------------------------------------
/**
 * Move um elemento para um novo pai na hierarquia.
 * Chamado pelo drag-and-drop na lista de elementos.
 *
 * @param {string} elementId - ID do elemento a mover
 * @param {string|null} parentId - ID do novo pai, ou null para raiz
 */
function handleSetParent(elementId: string, parentId: string | null) {
    if (!CONFIG.FEATURES?.SPATIAL_HIERARCHY) return;
    const ok = setParent(elementId, parentId ?? null);
    if (ok) requestHierarchyUIRefresh('hierarchy.parent-set');
}
/**
 * Adiciona um elemento container (site_project, site_area, site_zone).
 * Containers nao possuem mesh 3D e servem apenas para agrupar.
 *
 * @param {string} familyId - 'site_project' | 'site_area' | 'site_zone'
 */
function handleAddContainer(familyId: string) {
    if (!CONFIG.FEATURES?.SPATIAL_HIERARCHY) return;
    const allowed = ['site_project', 'site_area', 'site_zone'];
    if (!allowed.includes(familyId)) {
        log.warn(`Invalid container familyId: ${familyId}`);
        return;
    }
    addNewElement(familyId);
    requestHierarchyUIRefresh('hierarchy.container-added');
}
/**
 * Alterna colapso visual de um container na lista de elementos.
 * Persiste estado em localStorage por ID do container.
 *
 * @param {string} containerId - ID do elemento container
 */
function handleToggleContainerCollapse(containerId: string) {
    const key = `ecbyts-container-expanded-${containerId}`;
    const isExpanded = localStorage.getItem(key) === '1';
    if (isExpanded) {
        localStorage.removeItem(key);
    } else {
        safeSetItem(key, '1');
    }
    requestHierarchyUIRefresh('hierarchy.container-collapse-toggled');
}
export const hierarchyHandlers = {
    handleSetParent,
    handleAddContainer,
    handleToggleContainerCollapse,
};
