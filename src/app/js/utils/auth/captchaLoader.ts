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
   CAPTCHA LOADER — Lazy hCaptcha integration for login protection
   Carregamento sob demanda do hCaptcha para protecao de login

   Carrega o script hCaptcha apenas quando necessario (>=3 tentativas
   falhas), usando loadScriptCDN para resiliencia. O widget e
   renderizado no container especificado e destruido apos login
   bem-sucedido.

   DEPENDENCIAS:
   - loginThrottle.js: needsCaptcha() para decidir quando carregar
   - cdnLoader.js: loadScriptCDN() para carregamento resiliente

   NOTA: hCaptcha site key deve ser configurada em CONFIG.HCAPTCHA_SITE_KEY.
   Enquanto nao configurada, o modulo opera em modo preparatorio
   (isCaptchaRequired retorna o estado, mas load/verify sao no-op).
   ================================================================ */
import { loadScriptCDN } from '../helpers/cdnLoader.js';
import { needsCaptcha } from './loginThrottle.js';
import { CONFIG } from '../../config.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('CaptchaLoader');
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
/** @type {string} Pinned hCaptcha script URL */
const HCAPTCHA_SCRIPT_URL = 'https://js.hcaptcha.com/1/api.js?render=explicit';
/** @type {string|null} hCaptcha widget ID after render */
let _widgetId: any = null;
/** @type {boolean} Whether hCaptcha script has been loaded */
let _scriptLoaded = false;
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Check if CAPTCHA is currently required based on throttle state.
 * Verifica se o CAPTCHA e necessario com base no estado de throttle.
 *
 * @returns {boolean}
 */
export function isCaptchaRequired() {
    return needsCaptcha();
}
/**
 * Lazy-load hCaptcha script and render widget in the specified container.
 * Carrega o script hCaptcha sob demanda e renderiza no container.
 *
 * @param {string} containerId - DOM element ID where widget will render
 * @returns {Promise<boolean>} true if widget rendered successfully
 */
export async function loadCaptcha(containerId: string) {
    const siteKey = (CONFIG as any)?.HCAPTCHA_SITE_KEY;
    if (!siteKey) {
        log.warn('hCaptcha site key not configured (CONFIG.HCAPTCHA_SITE_KEY). CAPTCHA is in preparation mode.');
        return false;
    }
    const container = document.getElementById(containerId);
    if (!container) {
        log.error(`CAPTCHA container #${containerId} not found in DOM`);
        return false;
    }
    try {
        // Load script only once
        // Carrega o script apenas uma vez
        if (!_scriptLoaded) {
            await loadScriptCDN(HCAPTCHA_SCRIPT_URL, {
                timeout: 15000,
                id: 'hcaptcha-script',
            });
            _scriptLoaded = true;
            log.debug('hCaptcha script loaded');
        }
        // Render widget
        // Renderiza o widget no container
        if (typeof window.hcaptcha !== 'undefined') {
            _widgetId = window.hcaptcha.render(containerId, {
                sitekey: siteKey,
                theme: document.body.classList.contains('dark-theme') ? 'dark' : 'light',
            });
            log.debug(`hCaptcha widget rendered, widgetId=${_widgetId}`);
            return true;
        }
        log.warn('hCaptcha global not available after script load');
        return false;
    }
    catch (err: any) {
        log.error('Failed to load/render hCaptcha', err?.message);
        return false;
    }
}
/**
 * Get the CAPTCHA verification token if solved.
 * Retorna o token de verificacao se o CAPTCHA foi resolvido.
 *
 * @returns {string|null} Token string if solved, null otherwise
 */
export function verifyCaptcha() {
    if (typeof window.hcaptcha === 'undefined' || _widgetId === null) {
        log.debug('verifyCaptcha: no widget active');
        return null;
    }
    try {
        const token = window.hcaptcha.getResponse(_widgetId);
        if (token && token.length > 0) {
            log.debug('CAPTCHA verified successfully');
            return token;
        }
        log.debug('CAPTCHA not yet solved');
        return null;
    }
    catch (err: any) {
        log.error('CAPTCHA verification failed', err?.message);
        return null;
    }
}
/**
 * Destroy CAPTCHA widget and clean up. Call on successful login.
 * Destroi o widget CAPTCHA e limpa recursos.
 */
export function destroyCaptcha() {
    try {
        if (typeof window.hcaptcha !== 'undefined' && _widgetId !== null) {
            window.hcaptcha.remove(_widgetId);
            log.debug('hCaptcha widget destroyed');
        }
    }
    catch (err: any) {
        log.debug('CAPTCHA destroy ignored', err?.message);
    }
    _widgetId = null;
}
