// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   EDIT NAVIGATION HANDLERS — Quick-switch between elements
   ================================================================

   Handlers para navegacao rapida entre elementos durante o modo
   de edicao. Expoe funcoes no window.* para uso pela ribbon e
   atalhos de teclado.

   ================================================================ */
import { switchToNext, switchToPrev, setOpacityPreset } from '../editing/editNavigation.js';
import { isEditing } from '../editing/editManager.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
/**
 * Navigate to the next editable element.
 * Vai para o proximo elemento editavel na lista.
 */
export function handleEditNext() {
    if (!isEditing()) {
        showToast(t('editNav.notEditing') || 'Enter edit mode first', 'warning');
        return;
    }
    const ok = switchToNext();
    if (!ok) {
        showToast(t('editNav.noElements') || 'No editable elements', 'info');
    }
}
/**
 * Navigate to the previous editable element.
 * Vai para o elemento editavel anterior na lista.
 */
export function handleEditPrev() {
    if (!isEditing()) {
        showToast(t('editNav.notEditing') || 'Enter edit mode first', 'warning');
        return;
    }
    const ok = switchToPrev();
    if (!ok) {
        showToast(t('editNav.noElements') || 'No editable elements', 'info');
    }
}
/**
 * Set opacity preset for edit mode.
 * Define preset de opacidade: focus, dim ou full.
 *
 * @param {'focus'|'dim'|'full'} preset
 */
export function handleEditOpacity(preset: 'focus' | 'dim' | 'full') {
    const ok = setOpacityPreset(preset);
    if (ok) {
        const label = t(`editNav.${preset}`) || preset;
        showToast(label, 'info');
    }
}
/**
 * All edit navigation handler functions exposed to the HTML via window.
 */
export const editNavigationHandlers = {
    handleEditNext,
    handleEditPrev,
    handleEditOpacity,
};
//# sourceMappingURL=editNavigation.js.map
//# sourceMappingURL=editNavigation.js.map
