// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   ACCESSIBILITY HANDLERS — Window.* handlers for a11y panel
   SPEC_CONTRAST_TESTING_9_77 §9.77
   ================================================================ */

/**
 * Open the accessibility panel.
 */
function handleOpenAccessibilityPanel() {
    import('../ui/accessibilityPanel.js')
        .then(({ openAccessibilityPanel }) => openAccessibilityPanel())
        .catch((err) => console.error('[a11y:handler] Failed to open panel', err?.message));
}

/**
 * Close the accessibility panel.
 */
function handleCloseAccessibilityPanel() {
    import('../ui/accessibilityPanel.js')
        .then(({ closeAccessibilityPanel }) => closeAccessibilityPanel())
        .catch((_e) => console.debug('[a11y:handler:silent-catch]', _e?.message || _e));
}

export const accessibilityHandlers = {
    handleOpenAccessibilityPanel,
    handleCloseAccessibilityPanel,
};
