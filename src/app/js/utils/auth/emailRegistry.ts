// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Centralized System Email Registry — SPEC_EMAIL_CENTRALIZATION_ADMIN_DECIDE (MVP)
//
// Resolve endereços de e-mail de sistema por slug, eliminando strings
// hardcoded espalhadas pelos módulos. Precedência: cache IDB (populado por
// sync do Supabase `system_configs.email_registry` quando a migração for
// aplicada) → DEFAULT_SYSTEM_EMAILS → CONFIG.PLATFORM_ADMIN_EMAIL_FALLBACK.
//
// Funciona HOJE via defaults (sem depender de DB/Edge Function); o backend
// é progressive enhancement (runtime-editável quando a migração + sync
// estiverem ativos). Admin UI + Edge Function `send-system-email` = follow-up.
import { CONFIG } from '../../config.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('emailRegistry');
/** Slugs de sistema conhecidos + fallback estático (Should-Have §2.2). */
export const DEFAULT_SYSTEM_EMAILS = Object.freeze({
    support: 'support@ecbyts.com',
    compliance: 'compliance@ecbyts.com',
    compliance_alerts: 'compliance@ecbyts.com',
    legal: 'legal@ecbyts.com',
    privacy: 'privacy@ecbyts.com',
    security: 'security@ecbyts.com',
    founder: 'founder@ecbyts.com',
    admin: 'founder@ecbyts.com',
});
const IDB_KEY = 'ecbyts-email-registry';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Validação de e-mail (Should-Have §2.2 — usada pela Admin UI futura). */
export function isValidEmail(value: any) {
    return typeof value === 'string' && EMAIL_RE.test(value.trim());
}
/** Fallback final garantido — nunca retorna vazio. */
function ultimateFallback() {
    return CONFIG?.PLATFORM_ADMIN_EMAIL_FALLBACK || 'founder@ecbyts.com';
}
/**
 * Resolve o e-mail puro a partir de um mapa de cache + slug. Pura/testável
 * (sem IDB/DOM) — o wrapper assíncrono injeta o cache.
 * @param {Record<string,string>|null} cacheMap
 * @param {string} slug
 * @returns {string}
 */
export function resolveEmail(cacheMap: any, slug: any) {
    const key = String(slug || '').trim();
    if (cacheMap && isValidEmail(cacheMap[key]))
        return cacheMap[key];
    if (isValidEmail((DEFAULT_SYSTEM_EMAILS as any)[key]))
        return (DEFAULT_SYSTEM_EMAILS as any)[key];
    return ultimateFallback();
}
/**
 * API pública: e-mail de sistema por slug, com cache IDB + fallbacks.
 * Lazy-import do idbStore para manter este módulo testável em Node.
 */
export async function getSystemEmail(slug: any) {
    let cacheMap = null;
    try {
        const { idbGet } = await import('../storage/idbStore.js' as string);
        cacheMap = await idbGet(IDB_KEY);
    }
    catch (e: any) {
        log.debug('[emailRegistry:getSystemEmail] idb miss', e?.message || e);
    }
    return resolveEmail(cacheMap, slug);
}
/**
 * Persiste o registry no cache IDB (chamado pela Admin UI / sync Supabase).
 * Valida cada entrada — entradas inválidas são descartadas, não persistidas.
 */
export async function setEmailRegistryCache(map: any) {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(map || {}) as [string, any][]) {
        if (isValidEmail(v))
            clean[String(k).trim()] = v.trim();
    }
    try {
        const { idbSet } = await import('../storage/idbStore.js' as string);
        await idbSet(IDB_KEY, clean);
        return { ok: true, count: Object.keys(clean).length };
    }
    catch (e: any) {
        log.debug('[emailRegistry:setCache]', e?.message || e);
        return { ok: false, reason: 'idb_unavailable' };
    }
}
