// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   CHEMISTRY HANDLERS — Window event handlers for CAS Registry
   Handlers para consulta de substancias quimicas por numero CAS

   Funcoes registradas no window.* para serem chamadas por onclick/oninput
   em elementos HTML gerados dinamicamente.
   ================================================================ */
import { lookupCAS } from '../../core/chemistry/casRegistry.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('ChemistryHandlers');
// ----------------------------------------------------------------
// CAS LOOKUP
// Consulta de substancia pelo numero CAS com feedback via toast
// ----------------------------------------------------------------
/**
 * Look up a CAS number and show result as toast notification.
 * Consulta numero CAS e exibe resultado via toast.
 *
 * @param {string} casNumber - CAS number (e.g. '71-43-2')
 * @returns {{ found: boolean, entry?: Object, valid: boolean }}
 */
function handleLookupCAS(casNumber: any) {
    if (!casNumber || typeof casNumber !== 'string') {
        showToast(t('casRegistry.invalid'), 'error');
        return { found: false, valid: false };
    }
    const result = lookupCAS(casNumber.trim());
    if (!result.valid) {
        showToast(t('casRegistry.invalid'), 'error');
        log.warn('Invalid CAS lookup attempt', casNumber);
    } else if (result.found && result.entry) {
        const entry = result.entry;
        const msg = `${t('casRegistry.found')}: ${entry.name} (${entry.formula})`;
        showToast(msg, 'success');
        log.info('CAS found', casNumber, entry.name);
    } else {
        showToast(t('casRegistry.unknown'), 'warning');
        log.info('CAS not in database', casNumber);
    }
    return result;
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export const chemistryHandlers = {
    handleLookupCAS,
};
