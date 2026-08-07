// Generated from src/app/js/utils/handlers/healthAlerts.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   HEALTH-ALERTS HANDLERS — window-level entry points for the widget

   Expoe:
     (window as any).handleOpenHealthAlertsWidget()
     (window as any).handleCloseHealthAlertsWidget()

   Dynamic import do widget para nao carregar healthAlertEvaluator
   e healthStore no bootstrap inicial.
   ================================================================ */
import { createLogger } from '../helpers/logger.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
const log = createLogger('HealthAlerts');
/**
 * Open the health alerts floating widget. Loads readings from healthStore
 * and renders aggregated alerts. Auto-refreshes every 30s while open.
 *
 * (window as any).handleOpenHealthAlertsWidget()
 */
async function handleOpenHealthAlertsWidget() {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('health')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    try {
        const mod = await import('../ui/healthAlertsWidget.js' as string);
        if (typeof mod.openHealthAlertsWidget === 'function') {
            await mod.openHealthAlertsWidget();
        }
        else {
            log.warn('openHealthAlertsWidget export missing');
        }
    }
    catch (err: any) {
        log.error('handleOpenHealthAlertsWidget failed', err);
    }
}
/**
 * Close the health alerts widget if open. Idempotent.
 *
 * (window as any).handleCloseHealthAlertsWidget()
 */
async function handleCloseHealthAlertsWidget() {
    try {
        const mod = await import('../ui/healthAlertsWidget.js' as string);
        if (typeof mod.closeHealthAlertsWidget === 'function') {
            mod.closeHealthAlertsWidget();
        }
    }
    catch (err: any) {
        log.error('handleCloseHealthAlertsWidget failed', err);
    }
}
export const healthAlertsHandlers = {
    handleOpenHealthAlertsWidget,
    handleCloseHealthAlertsWidget,
};
