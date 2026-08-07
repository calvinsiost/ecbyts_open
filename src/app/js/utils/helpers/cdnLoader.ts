// @ts-check
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
   CDN LOADER — Resilience layer for external library loading
   Camada de resiliencia para carregamento de bibliotecas externas.

   Todo import dinamico de CDN (esm.sh, jsdelivr, cdnjs) DEVE usar
   estas funcoes em vez de import() ou createElement('script') direto.

   Garante timeout (evita hang infinito se CDN cair), logging
   padronizado, e cache de modulos ja carregados.
   ================================================================ */

/** @type {number} Timeout padrao para imports ESM (ms) */
const DEFAULT_IMPORT_TIMEOUT = 10000;

/** @type {number} Timeout padrao para script tags (ms) */
const DEFAULT_SCRIPT_TIMEOUT = 15000;

/** @type {Map<string, any>} Cache de modulos ja carregados */
const _moduleCache = new Map();

/**
 * Dynamic import with timeout protection.
 * Carrega modulo ESM de CDN com protecao contra hang.
 *
 * @param {string} url - CDN URL to import
 * @param {Object} [options]
 * @param {number} [options.timeout] - Timeout in ms (default: 10000)
 * @param {string} [options.name] - Human-readable name for error messages
 * @returns {Promise<any>} The imported module
 * @throws {Error} If import fails or times out
 */
export async function importCDN(url: any, options: { timeout?: number; name?: string } = {}) {
    const { timeout = DEFAULT_IMPORT_TIMEOUT, name = url } = options;

    const cached = _moduleCache.get(url);
    if (cached) return cached;

    try {
        const mod = await Promise.race([
            import(url),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`CDN timeout (${timeout}ms): ${name}`)), timeout),
            ),
        ]);

        const resolved = mod.default || mod;
        _moduleCache.set(url, resolved);
        return resolved;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[CDN] Falha ao carregar ${name}:`, msg);
        // Notifica usuario que feature dependente de CDN esta indisponivel
        _notifyCdnFailure(name);
        throw new Error(`Nao foi possivel carregar ${name}. Verifique a conexao. (${msg})`, { cause: err });
    }
}

/**
 * Load a UMD/global script tag with timeout protection.
 * Injeta script no DOM com protecao contra hang e dedup.
 *
 * @param {string} url - Script URL to load
 * @param {Object} [options]
 * @param {number} [options.timeout] - Timeout in ms (default: 15000)
 * @param {string} [options.name] - Human-readable name for error messages
 * @param {string} [options.globalVar] - Window property to check/return (e.g. 'jspdf')
 * @param {string} [options.id] - Optional script element id
 * @returns {Promise<void>} Resolves when script is loaded
 * @throws {Error} If load fails or times out
 */
export function loadScriptCDN(
    url: any,
    options: { timeout?: number; name?: string; globalVar?: string; id?: string } = {},
) {
    const { timeout = DEFAULT_SCRIPT_TIMEOUT, name = url, globalVar, id } = options;

    return new Promise<void>((resolve, reject) => {
        // Ja carregado via globalVar
        if (globalVar && (window as any)[globalVar]) {
            resolve();
            return;
        }

        // Script tag ja existe - aguardar com timeout
        const existing = document.querySelector(`script[src="${url}"]`);
        if (existing) {
            if (globalVar && (window as any)[globalVar]) {
                resolve();
                return;
            }
            const check = setInterval(() => {
                if (globalVar && (window as any)[globalVar]) {
                    clearInterval(check);
                    resolve();
                }
            }, 100);
            setTimeout(() => {
                clearInterval(check);
                reject(new Error(`CDN timeout (${timeout}ms): ${name}`));
            }, timeout);
            return;
        }

        const script = document.createElement('script');
        script.src = url;
        if (id) script.id = id;

        const timer = setTimeout(() => {
            script.remove();
            reject(new Error(`CDN timeout (${timeout}ms): ${name}`));
        }, timeout);

        script.onload = () => {
            clearTimeout(timer);
            resolve();
        };
        script.onerror = () => {
            clearTimeout(timer);
            script.remove();
            reject(new Error(`CDN load failed: ${name}`));
        };

        document.head.appendChild(script);
    });
}

// ----------------------------------------------------------------
// CDN FAILURE NOTIFICATION
// Toast contextual quando CDN falha (campo remoto sem internet)
// ----------------------------------------------------------------

/** @type {Set<string>} Nomes ja notificados nesta sessao (evita spam) */
const _notifiedFailures = new Set();

/**
 * Notify user of CDN failure via toast (once per library per session).
 * Evita spam se multiplas features tentam o mesmo CDN.
 * @param {string} name - Library name
 */
function _notifyCdnFailure(name: any) {
    if (_notifiedFailures.has(name)) return;
    _notifiedFailures.add(name);

    // Lazy import para evitar dependencia circular no boot
    import('../ui/toast.js')
        .then(({ showToast }) => {
            (showToast as any)(`${name} unavailable offline. Feature disabled.`, 'warning');
        })
        .catch((_e) => console.debug('[utils/helpers/cdnLoader:silent-catch]', _e?.message || _e));
}
