// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// ModeSwitcher - 4 chips (Visual/Form/Dashboard/Collection) for SPEC_GROUP_VIEW_MODES §S2.
// Renderiza chip do modo atual destacado; click troca viewMode do grupo via setGroupViewMode.
import { GROUP_VIEW_MODES, getGroupViewMode, setGroupViewMode } from '../../groups/manager.js';
import { t } from '../../i18n/translations.js';
const I18N_KEYS = {
    visual: 'groupView.mode.visual',
    form: 'groupView.mode.form',
    dashboard: 'groupView.mode.dashboard',
    collection: 'groupView.mode.collection',
};
/**
 * Render 4 mode chips into a container. Highlights active mode. Click switches.
 * Escuta `groupViewModeChanged` para re-render automático.
 *
 * @param {HTMLElement} container
 * @param {string} groupId
 * @returns {{ destroy: () => void }}
 */
export function renderModeSwitcher(container: any, groupId: any) {
    if (!container || !groupId) return { destroy: () => {} };
    const handleEvent = (e: any) => {
        if (e?.detail?.id === groupId) render();
    };
    function render() {
        container.innerHTML = '';
        container.classList.add('group-mode-switcher');
        container.setAttribute('role', 'tablist');
        container.setAttribute('aria-label', 'Group view mode');
        const activeMode = getGroupViewMode(groupId);
        for (const mode of GROUP_VIEW_MODES) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'group-mode-chip' + (mode === activeMode ? ' group-mode-chip--active' : '');
            btn.dataset.mode = mode;
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', mode === activeMode ? 'true' : 'false');
            btn.textContent = t((I18N_KEYS as Record<string,any>)[mode]) || mode;
            btn.addEventListener('click', () => {
                if (mode !== getGroupViewMode(groupId)) setGroupViewMode(groupId, mode);
            });
            container.appendChild(btn);
        }
    }
    render();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('groupViewModeChanged', handleEvent);
    }
    return {
        destroy() {
            if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
                window.removeEventListener('groupViewModeChanged', handleEvent);
            }
            container.innerHTML = '';
        },
    };
}
