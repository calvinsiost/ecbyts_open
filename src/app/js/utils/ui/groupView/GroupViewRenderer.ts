// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// GroupViewRenderer - dispatcher para S3/S4/S5 SPEC_GROUP_VIEW_MODES.
// Monta o view correto no container com base no getGroupViewMode do grupo.
// Escuta groupViewModeChanged para re-renderizar sem full re-render da lista.
import { getGroupViewMode, getGroupElementIds } from '../../groups/manager.js';
import { getAllElements } from '../../../core/elements/manager.js';
import { renderGroupFormView } from './GroupFormView.js';
import { renderGroupDashboardView } from './GroupDashboardView.js';
import { renderGroupCollectionView } from './GroupCollectionView.js';
/** @type {Map<string, { container: HTMLElement, cleanup: () => void }>} */
const _mounted = new Map();
/**
 * Mount group view content into a container div.
 * Re-mounts automatically when groupViewModeChanged fires for this groupId.
 *
 * @param {HTMLElement} container
 * @param {string} groupId
 * @returns {{ destroy: () => void }}
 */
export function mountGroupViewContent(container: any, groupId: any) {
    if (!container || !groupId) return { destroy: () => {} };
    // Unmount any previous instance for this group
    _mounted.get(groupId)?.cleanup();
    function render() {
        const mode = getGroupViewMode(groupId);
        const elementIds = getGroupElementIds(groupId);
        const allEls = getAllElements();
        const elements = allEls.filter((/** @type {any} */ el) => elementIds.includes(el.id));
        container.className = 'group-view-content-host';
        if (mode === 'form') {
            renderGroupFormView(container, groupId, elements);
        } else if (mode === 'dashboard') {
            renderGroupDashboardView(container, groupId, elements);
        } else if (mode === 'collection') {
            renderGroupCollectionView(container, groupId, elements);
        } else {
            // visual - container stays empty; existing element cards handle display
            container.innerHTML = '';
        }
    }
    const onModeChange = (e: any) => {
        if (e?.detail?.id === groupId) render();
    };
    render();
    if (typeof window !== 'undefined') {
        window.addEventListener('groupViewModeChanged', onModeChange);
    }
    const cleanup = () => {
        if (typeof window !== 'undefined') {
            window.removeEventListener('groupViewModeChanged', onModeChange);
        }
        container.innerHTML = '';
        _mounted.delete(groupId);
    };
    _mounted.set(groupId, { container, cleanup });
    return { destroy: cleanup };
}
/**
 * Destroy all mounted group view renderers.
 * Call before full list re-render to avoid zombie listeners.
 */
export function destroyAllGroupViews() {
    for (const { cleanup } of _mounted.values()) cleanup();
    _mounted.clear();
}
