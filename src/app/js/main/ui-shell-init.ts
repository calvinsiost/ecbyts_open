// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Run the canonical UI shell init sequence using injected dependencies.
 * @param {{
 *   initRibbon: () => void,
 *   initPanelManager: () => void,
 *   initMobileMenu: () => void,
 *   initTabs: () => void,
 *   initSections: () => void,
 *   initStampPanel: () => void,
 *   initEdgeEditor: () => void,
 *   initElementContextMenu: () => void,
 *   initGlobalContextMenu: () => void,
 *   injectStampStyles: () => void,
 *   injectEdgeStyles: () => void,
 * }} deps
 */
export function runUiShellInitSequence(/** @type {any} */ {
    initRibbon,
    initPanelManager,
    initMobileMenu,
    initTabs,
    initSections,
    initStampPanel,
    initEdgeEditor,
    initElementContextMenu,
    initGlobalContextMenu,
    injectStampStyles,
    injectEdgeStyles
}: any) {
    initRibbon();
    initPanelManager();
    initMobileMenu();
    initTabs();
    initSections();
    initStampPanel();
    initEdgeEditor();
    initElementContextMenu();
    initGlobalContextMenu();
    injectStampStyles();
    injectEdgeStyles();
}
