// Generated from src/app/js/utils/helpers/logger.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   LOGGER — Logging padronizado com niveis e filtro por modulo
   ================================================================

   Wrapper leve sobre console.* que adiciona prefixo padronizado,
   niveis de log (DEBUG/INFO/WARN/ERROR/SILENT) e filtro por modulo.

   USO:
     import { createLogger } from '../helpers/logger.js';
     const log = createLogger('Interpolation');
     log.debug('Grid computed', { cols: 50 });
     log.info('Layer created', layerName);
     log.warn('CDN timeout, fallback IDW');
     log.error('Kriging failed', err.message);

   FORMATO DE SAIDA:
     [ecbyts:Interpolation] WARN: CDN timeout, fallback IDW

   CONTROLE DE NIVEL (prioridade):
     1. localStorage['ecbyts-log-level:ModuleName'] — override por modulo
     2. localStorage['ecbyts-log-level'] — override global
     3. CONFIG.LOG_LEVELS[moduleName] — config per-module
     4. CONFIG.LOG_LEVEL — config global (default: 'DEBUG')
     5. Default: 'DEBUG' (development-verbose)

   TOGGLE EM RUNTIME (console do browser, sem F5):
     localStorage.setItem('ecbyts-log-level', 'DEBUG');
     localStorage.setItem('ecbyts-log-level:Interpolation', 'DEBUG');
     localStorage.removeItem('ecbyts-log-level');

   CONVENCAO DE NOMES:
     PascalCase matching o nome do diretorio.
     Ex: 'Interpolation' para core/interpolation/,
         'Cloud' para handlers/cloud.js,
         'Auth' para handlers/auth.js.

   IMPORTANTE:
     - Logger COMPLEMENTA, NAO SUBSTITUI showToast/handleAppError
     - Nunca logar objetos de dominio com dados sensiveis
     - bridge.js captura TODOS os niveis (log/warn/error/info/debug) via /api/console
     - WARN e ERROR sao enviados ao Supabase via captureError (fire-and-forget)
     - Nivel resolvido per-call: localStorage.setItem toma efeito imediato

   ================================================================ */
import { CONFIG } from '../../config.js';
/** Niveis numericos — maior = mais severo */
export const LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    SILENT: 4,
};
// ----------------------------------------------------------------
// RESOLUCAO DE NIVEL
// ----------------------------------------------------------------
function isLevelName(s: any) {
    return s === 'DEBUG' || s === 'INFO' || s === 'WARN' || s === 'ERROR' || s === 'SILENT';
}
/**
 * Resolve o nivel minimo efetivo para um modulo.
 * Avaliado per-call para permitir toggle via DevTools sem F5.
 */
function _resolveLevel(moduleName: any, deps?: any) {
    const config = deps?.config ?? CONFIG;
    // 1-2. localStorage overrides (per-module, depois global)
    try {
        const ambientStorage =
            typeof globalThis !== 'undefined' && globalThis.localStorage ? globalThis.localStorage : null;
        const s = deps?.storage ?? ambientStorage;
        if (s) {
            const perMod = s.getItem(`ecbyts-log-level:${moduleName}`);
            if (perMod) {
                const up = perMod.toUpperCase();
                if (isLevelName(up)) return (LEVELS as any)[up];
            }
            const global = s.getItem('ecbyts-log-level');
            if (global) {
                const up = global.toUpperCase();
                if (isLevelName(up)) return (LEVELS as any)[up];
            }
        }
    } catch (e: any) {
        console.debug('[logger] resolve-level-storage-unavailable:', e?.message ?? e);
        /* localStorage indisponivel (private browsing, SSR) */
    }
    // 3. CONFIG per-module
    const cfgMod = config?.LOG_LEVELS?.[moduleName];
    if (cfgMod && isLevelName(cfgMod)) return (LEVELS as any)[cfgMod];
    // 4. CONFIG global
    const cfgGlobal = config?.LOG_LEVEL;
    if (cfgGlobal && isLevelName(cfgGlobal)) return (LEVELS as any)[cfgGlobal];
    // 5. Default development-verbose
    return LEVELS.DEBUG;
}
// ----------------------------------------------------------------
// CAPTURA SUPABASE (ERROR-level only)
// ----------------------------------------------------------------
let _captureErrorFn: any = null;
/**
 * Captura direta ao Supabase para erros logados via logger.
 * Fire-and-forget, nunca bloqueia, nunca lanca excecao.
 */
async function _captureToSupabase(moduleName: any, args: any) {
    try {
        if (!_captureErrorFn) {
            const mod = await import('../errorReporting/reporter.js' as string);
            _captureErrorFn = mod.captureError;
        }
        const captureError = _captureErrorFn;
        if (!captureError) return;
        const msg = args.map((a: any) => (a instanceof Error ? a.message : String(a))).join(' ');
        captureError('warning', `[${moduleName}] ${msg}`.slice(0, 2000), {
            metadata: { source: 'logger', module: moduleName },
        });
    } catch (e: any) {
        /* swallowed: reporter unavailable; cannot use logger.warn here (recursion) — direct console.debug bypass safe (does not trigger _captureToSupabase) */
        console.debug('[logger] supabase-capture-failed:', e?.message ?? e);
    }
}
/**
 * Cria um logger com escopo de modulo.
 *
 * @example
 *   const log = createLogger('Interpolation');
 *   log.debug('Grid computed', { cols: 50, rows: 50 });
 *   log.error('Kriging failed', err.message);
 */
export function createLogger(moduleName: any, deps?: any) {
    const name = String(moduleName ?? '').trim() || 'Unknown';
    const prefix = `[ecbyts:${name}]`;
    function _log(level: any, consoleFn: any, args: any) {
        if ((LEVELS as any)[level] < _resolveLevel(name, deps)) return;
        consoleFn(prefix, `${level}:`, ...args);
    }
    const debugFn = console.debug ?? console.log;
    return Object.freeze({
        debug: (...args: any[]) => _log('DEBUG', debugFn, args),
        info: (...args: any[]) => _log('INFO', console.info, args),
        warn: (...args: any[]) => {
            _log('WARN', console.warn, args);
            void _captureToSupabase(name, args);
        },
        error: (...args: any[]) => {
            _log('ERROR', console.error, args);
            void _captureToSupabase(name, args);
        },
    });
}
// ----------------------------------------------------------------
// PERF-MASTER S3.2 — [mod:load] / [mod:end] opt-in
// ----------------------------------------------------------------
/**
 * Marca carregamento de módulo. Default off (custo zero em produção).
 *
 * Por que opt-in? `console.debug('[mod:load]', X)` direto avalia string +
 * push para devtools internal buffer mesmo quando ninguém escuta.
 * Em mobile, custo cumulativo de N módulos é mensurável (~3-8ms boot frio).
 *
 * Habilitar via:
 *   localStorage.setItem('ecbyts-debug-mod-load', '1');  // toggle runtime
 *   // OU CONFIG.DEBUG_MODULE_LOAD = true em config.js (sticky)
 */
export function modLoad(modulePath: any) {
    if (!_isModLoadEnabled()) return;
    try {
        const fn = console.debug ?? console.log;
        fn('[mod:load]', String(modulePath || ''));
    } catch (e: any) {
        /* swallowed: console unavailable (extremely rare — sandboxed worker) — silent to avoid infinite catch loop */
        void e;
    }
}
/**
 * Marca fim de carregamento de módulo. Mesmas regras de modLoad.
 */
export function modEnd(modulePath: any) {
    if (!_isModLoadEnabled()) return;
    try {
        const fn = console.debug ?? console.log;
        fn('[mod:end]', String(modulePath || ''));
    } catch (e: any) {
        /* swallowed: console unavailable (extremely rare — sandboxed worker) — silent to avoid infinite catch loop */
        void e;
    }
}
/**
 * Resolve flag DEBUG_MODULE_LOAD com precedência: localStorage > CONFIG.
 * Pure-ish: sem side effects, lê apenas storage + CONFIG.
 */
function _isModLoadEnabled() {
    try {
        const ls = typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined;
        if (ls) {
            const v = ls.getItem('ecbyts-debug-mod-load');
            if (v === '1' || v === 'true') return true;
            if (v === '0' || v === 'false') return false;
        }
    } catch (e: any) {
        /* swallowed: localStorage unavailable (private browsing, SSR) — fall through to CONFIG */
        void e;
    }
    try {
        const cfg = CONFIG;
        if (cfg && (cfg as any).DEBUG_MODULE_LOAD === true) return true;
    } catch (e: any) {
        /* swallowed: CONFIG access threw (extremely rare — getter side-effect) — fall through to false */
        void e;
    }
    return false;
}
