// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   HOME HANDLERS — Global handlers for the home page
   Registrados no window.* via handlers/index.js.
   ================================================================ */
import { createLogger } from '../helpers/logger.js';
const log = createLogger('Home');
/**
 * Switch the application view mode.
 * @param {string} mode - 'actions'|'2d'|'2d-depth'|'3d'
 */
export function handleSwitchView(mode: any) {
    import('../scene/viewRouter.js' as string)
        .then(({ switchView }) => {
        switchView(mode);
    })
        .catch((err) => {
        log.error('Failed to switch view', err?.message);
    });
}
/**
 * Refresh the home grid data.
 */
export function handleRefreshHome() {
    import('../ui/homeGrid.js' as string)
        .then(({ renderHomeGrid }) => {
        renderHomeGrid();
    })
        .catch((_e) => console.debug('[utils/handlers/home:silent-catch]', _e?.message || _e));
}
/**
 * Open governance entrypoint from Home card.
 * V1: abre modal WBS (deterministico e ja suportado no app).
 */
export function handleOpenGovernancePanel() {
    if (typeof window.handleOpenWbsDataModal === 'function') {
        window.handleOpenWbsDataModal();
        return;
    }
    // Fallback: apenas loga, sem quebrar a Home.
    log.warn('Governance entrypoint not available');
}
export const homeHandlers = {
    handleSwitchView,
    handleRefreshHome,
    handleOpenGovernancePanel,
};
