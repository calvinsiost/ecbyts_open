// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   CUSTOMIZE HANDLERS — Window.* handlers for UI customization
   ================================================================
   Ponto de entrada para abrir/fechar o modal de customizacao.
   Registrado em handlers/index.js.
   ================================================================ */
import { createLogger } from '../helpers/logger.js';
const log = createLogger('Customize');
/**
 * Open the customize modal.
 */
function handleOpenCustomize() {
    import('../ui/customizeModal.js' as string)
        .then(({ openCustomizeModal }) => openCustomizeModal())
        .catch((err) => log.error('Failed to open customize modal', err?.message));
}
/**
 * Close the customize modal.
 */
function handleCloseCustomize() {
    import('../ui/customizeModal.js' as string)
        .then(({ closeCustomizeModal }) => closeCustomizeModal())
        .catch((_e) => console.debug('[utils/handlers/customize:silent-catch]', _e?.message || _e));
}
export const customizeHandlers = {
    handleOpenCustomize,
    handleCloseCustomize,
};
