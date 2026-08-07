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
   SYSTEM HANDLERS — tema, metering e permissões
   Consolidação de handlers periféricos sem dependências cruzadas.
   Anteriormente em: theme.js, metering.js, permissions.js
   ================================================================ */
import { setThemePreference } from '../theme/manager.js';
import { openUsageDashboard, closeUsageDashboard } from '../ui/usageDashboard.js';
import { markConstellationThemeDirty } from '../scene/constellation.js';
/**
 * Set theme preference from ribbon button.
 * @param {'light'|'dark'|'system'} pref
 */
function handleSetTheme( pref: any) {
    setThemePreference(pref);
    markConstellationThemeDirty(); // PERF-G4: invalidate cached CSS vars
}
/**
 * Open the permissions management modal.
 * Abre o modal de gerenciamento de regras de acesso (RBAC).
 */
async function handleOpenPermissions() {
    const { openPermissionsModal } = await import('../ui/permissionsModal.js' as string);
    openPermissionsModal();
}
export const systemHandlers = {
    handleSetTheme,
    handleOpenUsageDashboard: openUsageDashboard,
    closeUsageDashboard,
    handleOpenPermissions,
};
