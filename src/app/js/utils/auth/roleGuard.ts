// @ts-check
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
   ROLE GUARD — Admin / SuperAdmin access restriction
   Restricao de acesso por papel (admin/superadmin)

   Verifica se o usuario logado possui nivel de acesso suficiente
   para executar acoes administrativas. Utiliza a sessao existente
   do Supabase (session.js) e o campo 'tier' do perfil.

   NIVEIS:
   - superadmin:  Acesso total, gerenciamento de plataforma
   - admin:       Funcoes administrativas (convites, moderacao)
   - professional: Conta profissional (CREA/CRC validado)
   - free:        Conta gratuita (padrao)

   USO:
   - isAdmin() / isSuperAdmin() — verificacao booleana
   - requireAdmin(action) — verifica + toast se negado
   - hideIfNotAdmin(selector) — oculta elementos DOM
   ================================================================ */
import { getCurrentUser } from './session.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('RoleGuard');
// ----------------------------------------------------------------
// TIER HIERARCHY
// Hierarquia de niveis de acesso da plataforma
// ----------------------------------------------------------------
/** @type {string[]} Tiers com privilegio de admin (ordem nao importa) */
const ADMIN_TIERS = ['admin', 'superadmin'];
/** @type {string} Tier com privilegio maximo */
const SUPERADMIN_TIER = 'superadmin';
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Check if current user has admin-level access.
 * Verifica se o usuario logado possui nivel admin ou superior.
 *
 * @returns {boolean} true if user tier is admin or superadmin
 */
export function isAdmin() {
    const user = getCurrentUser();
    if (!user)
        return false;
    const tier = (user.tier || '').toLowerCase();
    return ADMIN_TIERS.includes(tier);
}
/**
 * Check if current user has superadmin-level access.
 * Verifica se o usuario logado possui nivel superadmin.
 *
 * @returns {boolean} true if user tier is superadmin
 */
export function isSuperAdmin() {
    const user = getCurrentUser();
    if (!user)
        return false;
    const tier = (user.tier || '').toLowerCase();
    return tier === SUPERADMIN_TIER;
}
/**
 * Verify admin access for an action; show toast if denied.
 * Verifica acesso admin e exibe toast de erro se negado.
 *
 * @param {string} action - Name of the action being attempted (for logging)
 * @returns {boolean} true if access is allowed, false if denied
 */
export function requireAdmin(action: any) {
    if (isAdmin()) {
        log.debug(`Admin access granted for: ${action}`);
        return true;
    }
    log.warn(`Admin access denied for: ${action}`);
    // Lazy-load toast + i18n to avoid circular dependencies
    // Toast e traducao carregados sob demanda para evitar dependencias circulares
    _showAccessDeniedToast('auth.adminRequired');
    return false;
}
/**
 * Verify superadmin access for an action; show toast if denied.
 * Verifica acesso superadmin e exibe toast de erro se negado.
 *
 * @param {string} action - Name of the action being attempted
 * @returns {boolean} true if access is allowed, false if denied
 */
export function requireSuperAdmin(action: any) {
    if (isSuperAdmin()) {
        log.debug(`SuperAdmin access granted for: ${action}`);
        return true;
    }
    log.warn(`SuperAdmin access denied for: ${action}`);
    _showAccessDeniedToast('auth.superadminOnly');
    return false;
}
/**
 * Hide DOM elements matching selector when user is not admin.
 * Oculta elementos DOM quando o usuario nao possui nivel admin.
 *
 * Safe to call before DOM is ready - uses querySelectorAll with guard.
 *
 * @param {string} selector - CSS selector for elements to hide
 * @returns {number} Number of elements hidden
 */
export function hideIfNotAdmin(selector: any) {
    if (!selector || typeof document === 'undefined')
        return 0;
    const shouldHide = !isAdmin();
    const elements = document.querySelectorAll(selector);
    let count = 0;
    elements.forEach((el: any) => {
        if (shouldHide) {
            el.style.display = 'none';
            el.setAttribute('aria-hidden', 'true');
            count++;
        }
        else {
            // Restore visibility for admin users
            // Restaura visibilidade para usuarios admin
            el.style.display = '';
            el.removeAttribute('aria-hidden');
        }
    });
    if (count > 0) {
        log.debug(`hideIfNotAdmin: hid ${count} element(s) matching '${selector}'`);
    }
    return count;
}
/**
 * Handler: check admin access for an action.
 * Usado como window.handleCheckAdminAccess(action) pela UI.
 *
 * @param {string} action - Action name to check
 * @returns {boolean} true if allowed
 */
export function handleCheckAdminAccess(action: any) {
    return requireAdmin(action || 'unknown');
}
// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------
/**
 * Show access denied toast with i18n key fallback.
 * @param {string} i18nKey - Translation key
 * @private
 */
async function _showAccessDeniedToast(i18nKey: any) {
    try {
        const [{ showToast }, { t }] = await Promise.all([import('../ui/toast.js' as string), import('../i18n/translations.js' as string)]);
        const message = t(i18nKey) || t('auth.accessDenied') || 'Access denied. Admin privileges required.';
        showToast(message, 'error');
    }
    catch (err: any) {
        log.error('Failed to show access denied toast', err?.message);
    }
}
