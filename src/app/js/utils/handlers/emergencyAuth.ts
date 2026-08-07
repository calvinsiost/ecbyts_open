// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   EMERGENCY AUTH HANDLERS — Phase 3 wiring
   Permitem que o modal de login emergencial seja acionado tanto
   automaticamente (via watcher de supabaseHealth) quanto manualmente
   via window.handleOpenEmergencyLogin().
   ================================================================ */
import { createLogger } from '../helpers/logger.js';
const log = createLogger('EmergencyAuth');
function _errorMessage(err: any) {
    return err && typeof err === 'object' && 'message' in err
        ? String(/** @type {{ message?: unknown }} */ (err).message)
        : String(err);
}
/**
 * Open the Emergency Login modal manually.
 * Abre o modal de login emergencial sob demanda (UI ou debug).
 */
async function handleOpenEmergencyLogin() {
    try {
        const { openEmergencyLoginModal } = await import('../ui/emergencyLoginModal.js' as string);
        openEmergencyLoginModal();
    } catch (err: any) {
        log.error('Failed to open emergency login modal', _errorMessage(err));
    }
}
/**
 * Close (dismiss) the Emergency Login modal.
 * Fecha o modal de login emergencial.
 */
async function handleDismissEmergencyLogin() {
    try {
        const { closeEmergencyLoginModal } = await import('../ui/emergencyLoginModal.js' as string);
        closeEmergencyLoginModal();
    } catch (err: any) {
        log.error('Failed to dismiss emergency login modal', _errorMessage(err));
    }
}
export const emergencyAuthHandlers = {
    handleOpenEmergencyLogin,
    handleDismissEmergencyLogin,
};
