// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   PROJECT TABS HANDLERS — window.* bridge
   (SPEC_PROJECT_TABS_IMPLEMENTATION Phase 1 + Phase 2)

   Handlers:
   - handleOpenProjectTab(opts?)
   - handleCloseProjectTab(id)
   - handleSwitchProjectTab(id)
   - handlePinProjectTab(id)
   - handleRenameProjectTab(id, name)
   - handleArchiveProjectTab(id)
   - handleRestoreArchivedTab(id)
   - handleGetProjectTabsSnapshot()
   ================================================================ */
import {
    openProjectTab,
    closeProjectTab,
    switchProjectTab,
    pinProjectTab,
    renameProjectTab,
    archiveProjectTab,
    restoreArchivedTab,
    collapseProjectTabBar,
    expandProjectTabBar,
    toggleProjectTabBarCompact,
    isProjectTabBarCompact,
    getProjectTabsSnapshot,
} from '../ui/projectTabBar.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
function handleOpenProjectTab(opts = {}) {
    try {
        const tab = openProjectTab(opts);
        window.dispatchEvent(new CustomEvent('projectTab:opened', { detail: { id: tab.id } }));
        // BUG-018 (claude - bug 2026-06-15): RETORNAR a aba criada. O handler
        // legacy capturava `tab` mas devolvia undefined → o caminho WIRED
        // (bridgeWire.wired_handleOpenProjectTab) recebia undefined, caía no
        // fallback frágil getActiveProjectTabId() e, quando ele também falhava,
        // newId=null pulava _setCurrentTabIdForWire(). Resultado: o bridge
        // ficava preso na aba ANTERIOR e o switch de volta virava no-op
        // (targetTabId === _currentTabId) → o elemento da nova aba vazava p/ a
        // aba 1 (sintoma "84→84" do TAB-SWITCH-ISO-001). Devolver a aba elimina
        // a dependência do fallback e torna o switch de volta um switch real.
        return tab;
    } catch (err: any) {
        const msg =
            err?.code === 'open_limit_reached'
                ? t
                    ? t('projectTabs.limitReached')
                    : 'Limite de abas atingido'
                : t
                  ? t('projectTabs.openError')
                  : 'Erro ao abrir aba';
        showToast(msg, 'warning') as any;
        console.warn('[projectTabs] open failed:', /** @type {any} */ err?.message || err);
    }
}
function handleCloseProjectTab(id: any) {
    if (!id) return;
    try {
        closeProjectTab(id);
        window.dispatchEvent(new CustomEvent('projectTab:closed', { detail: { id } }));
    } catch (err: any) {
        console.warn('[projectTabs] close failed:', /** @type {any} */ err?.message || err);
    }
}
function handleSwitchProjectTab(id: any) {
    if (!id) return;
    try {
        const tab = switchProjectTab(id);
        if (!tab) {
            console.warn('[projectTabs] switch: tab not found', id);
            return;
        }
        // Se a aba tem modelId e MULTI_MODEL está ativo, sincroniza model
        const w = window as any;
        if (tab.modelId && typeof w.handleSwitchModel === 'function') {
            w.handleSwitchModel(tab.modelId);
        }
    } catch (err: any) {
        console.warn('[projectTabs] switch failed:', /** @type {any} */ err?.message || err);
    }
}
function handlePinProjectTab(id: any) {
    if (!id) return;
    try {
        pinProjectTab(id);
    } catch (err: any) {
        console.warn('[projectTabs] pin failed:', /** @type {any} */ err?.message || err);
    }
}
function handleRenameProjectTab(id: any, name: any) {
    if (!id || !name) return;
    try {
        renameProjectTab(id, String(name));
    } catch (err: any) {
        console.warn('[projectTabs] rename failed:', /** @type {any} */ err?.message || err);
    }
}
function handleArchiveProjectTab(id: any) {
    if (!id) return;
    try {
        archiveProjectTab(id);
        window.dispatchEvent(new CustomEvent('projectTab:archived', { detail: { id } }));
    } catch (err: any) {
        const msg = t ? t('projectTabs.archiveError') : 'Erro ao arquivar aba';
        showToast(msg, 'warning');
        console.warn('[projectTabs] archive failed:', /** @type {any} */ err?.message || err);
    }
}
function handleRestoreArchivedTab(id: any) {
    if (!id) return;
    try {
        restoreArchivedTab(id);
        window.dispatchEvent(new CustomEvent('projectTab:restored', { detail: { id } }));
    } catch (err: any) {
        const msg =
            err?.code === 'open_limit_reached'
                ? t
                    ? t('projectTabs.limitReached')
                    : 'Limite de abas atingido'
                : t
                  ? t('projectTabs.restoreError')
                  : 'Erro ao restaurar aba';
        showToast(msg, 'warning') as any;
        console.warn('[projectTabs] restore failed:', /** @type {any} */ err?.message || err);
    }
}
function handleCollapseProjectTabBar() {
    try {
        collapseProjectTabBar();
    } catch (err: any) {
        console.warn('[projectTabs] collapse bar failed:', /** @type {any} */ err?.message || err);
    }
}
function handleExpandProjectTabBar() {
    try {
        expandProjectTabBar();
    } catch (err: any) {
        console.warn('[projectTabs] expand bar failed:', /** @type {any} */ err?.message || err);
    }
}
function handleToggleProjectTabBarCompact() {
    try {
        toggleProjectTabBarCompact();
    } catch (err: any) {
        console.warn('[projectTabs] toggle compact bar failed:', /** @type {any} */ err?.message || err);
    }
}
function handleIsProjectTabBarCompact() {
    return isProjectTabBarCompact();
}
function handleGetProjectTabsSnapshot() {
    return getProjectTabsSnapshot();
}
export const projectTabsHandlers = {
    handleOpenProjectTab,
    handleCloseProjectTab,
    handleSwitchProjectTab,
    handlePinProjectTab,
    handleRenameProjectTab,
    handleArchiveProjectTab,
    handleRestoreArchivedTab,
    handleCollapseProjectTabBar,
    handleExpandProjectTabBar,
    handleToggleProjectTabBarCompact,
    handleIsProjectTabBarCompact,
    handleGetProjectTabsSnapshot,
};
