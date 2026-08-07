// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/**
 * Handlers for the EIS Drift Alerts admin panel.
 *
 * Gating: feature flag `FLAG_EIS_DRIFT_ALERTS_ADMIN` + admin role. A
 * verificação de role usa roleGuard.requireAdmin (toast se negado).
 */
import { requireAdmin } from '../auth/roleGuard.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
import { CONFIG } from '../../config.js';
const log = createLogger('eisDriftAdminHandler');
/** Read the feature flag from CONFIG.FEATURES (no bundler — no import.meta.env). */
function isFlagOn() {
    try {
        return Boolean(CONFIG?.FEATURES?.FLAG_EIS_DRIFT_ALERTS_ADMIN);
    }
    catch (e: any) {
        log.debug('flag read:', e?.message || e);
        return false;
    }
}
/** Open the EIS drift admin modal (admin-only, flag-gated). */
async function handleOpenEisDriftAdmin() {
    if (!isFlagOn()) {
        showToast('EIS Drift Alerts is disabled', 'info');
        return;
    }
    if (!requireAdmin('open-eis-drift-admin'))
        return;
    try {
        const mod = await import('../../core/eis/adminInterface.js' as string);
        await mod.openAdminInterface();
    }
    catch (e: any) {
        log.warn('open failed:', e?.message || e);
        showToast('Failed to open drift alerts', 'error');
    }
}
/** Close the modal. */
async function handleCloseEisDriftAdmin() {
    try {
        const mod = await import('../../core/eis/adminInterface.js' as string);
        mod.closeAdminInterface();
    }
    catch (e: any) {
        log.debug('close:', e?.message || e);
    }
}
/**
 * Resolve a drift alert (RECONCILE / IGNORE / INVESTIGATE).
 *
 * @param {string} alertId
 * @param {'RECONCILE'|'IGNORE'|'INVESTIGATE'} action
 */
async function handleResolveDriftAlert(alertId: any, action: any) {
    if (!requireAdmin('resolve-eis-drift-alert'))
        return;
    try {
        const mod = await import('../../core/eis/adminInterface.js' as string);
        const res = await mod.resolveDriftAlert(alertId, action);
        if (res.ok) {
            showToast(action === 'IGNORE' ? 'Alert ignored' : 'Reconcile requested', 'success');
        }
        else if (res.offline) {
            showToast('Failed to reconcile: backend unavailable. Try again.', 'error');
        }
        else {
            showToast(`Failed to reconcile: ${res.error || 'unknown'}`, 'error');
        }
    }
    catch (e: any) {
        log.warn('resolve failed:', e?.message || e);
        showToast('Resolution failed', 'error');
    }
}
export const eisDriftAdminHandlers = {
    handleOpenEisDriftAdmin,
    handleCloseEisDriftAdmin,
    handleResolveDriftAlert,
};
