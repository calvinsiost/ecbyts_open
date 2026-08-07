// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   OHS HANDLERS — window-level entry points for the SST panel

   Expoe:
     window.handleOpenOhsPanel()
     window.handleCloseOhsPanel()

   Dynamic import do painel para não carregar core/ohs no bootstrap.
   ================================================================ */
import { createLogger } from '../helpers/logger.js';
const log = createLogger('OhsHandlers');
/**
 * Abre o painel SST (matriz de risco 5×5 + resumo TWA, read-only).
 * window.handleOpenOhsPanel()
 * @returns {Promise<void>}
 */
async function handleOpenOhsPanel() {
    try {
        const mod = await import('../ui/ohsPanel.js' as string);
        if (typeof mod.openOhsPanel === 'function') mod.openOhsPanel();
        else log.warn('openOhsPanel export missing');
    } catch (err: any) {
        log.error('handleOpenOhsPanel failed', err);
    }
}
/**
 * Fecha o painel SST se aberto. Idempotente.
 * window.handleCloseOhsPanel()
 * @returns {Promise<void>}
 */
async function handleCloseOhsPanel() {
    try {
        const mod = await import('../ui/ohsPanel.js' as string);
        if (typeof mod.closeOhsPanel === 'function') mod.closeOhsPanel();
    } catch (err: any) {
        log.error('handleCloseOhsPanel failed', err);
    }
}
export const ohsHandlers = {
    handleOpenOhsPanel,
    handleCloseOhsPanel,
};
