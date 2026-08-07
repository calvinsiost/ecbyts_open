// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PRICE RESOLVER — Canonical $ECBT price for any platform item
   Resolve o preco canonico em $ECBT para qualquer item da plataforma.

   ARQUITETURA:
   - Se item tem price_ecbt definido, usa direto
   - Se nao, calcula a partir de price_cents + currency via exchange rates
   - Suporta: libraries, market_listings, subscriptions, topup packs
   - Catalogo de precos fixos (subscription_pro, etc) via ecbt_price_catalog
   ================================================================ */

import { CONFIG } from '../../config.js';
import { convert } from './exchangeRates.js';

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

const MICRO = CONFIG.CURRENCY?.MICRO_UNIT || 1_000_000;

// ----------------------------------------------------------------
// CATALOG CACHE
// ----------------------------------------------------------------

/** @type {Map<string, number>|null} */
let _catalogCache: any = null;
let _catalogFetchedAt = 0;

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Resolve the canonical $ECBT price for a platform item.
 * Resolve o preco canonico em microtokens para qualquer item.
 *
 * @param {Object} rates - Item with pricing data
 * @param {number}  [item.price_ecbt] - Pre-set $ECBT price (microtokens)
 * @param {number}  [item.price_cents] - Fiat price in cents
 * @param {string}  [item.currency] - Fiat currency code (default: 'usd')
 * @param {boolean} [item.is_paid] - Whether item is paid (false = free)
 * @param {Object}  [rates] - Exchange rates override
 * @returns {number} - Price in microtokens (0 for free items)
 * @throws {Error} - If no pricing data available
 */
export function resolvePrice(item: any, rates: any) {
    if (!item) throw new Error('resolvePrice: item is required');

    // Item gratuito
    if (item.is_paid === false) return 0;
    if (item.price_cents === 0 || /** @type {any} */ (item.price_cents) === '0') return 0;

    // Preco $ECBT explicito
    if (item.price_ecbt != null && item.price_ecbt > 0) {
        return Number(item.price_ecbt);
    }

    // Calcular a partir de fiat
    if (item.price_cents != null && Number(item.price_cents) > 0) {
        const cents = Number(item.price_cents);
        const currency = /** @type {any} */ ((item.currency || 'usd').toUpperCase());
        const fiatValue = cents / 100;
        return convert(fiatValue, currency, 'ECBT', rates);
    }

    // Nenhum dado de preco disponivel
    throw new Error('resolvePrice: no pricing data available');
}

/**
 * Resolve price from the platform catalog (subscriptions, topup packs).
 * Busca preco do catalogo de itens fixos da plataforma.
 *
 * @param {string} itemType - Catalog item type (e.g., 'subscription_pro')
 * @param {Object} [supabase] - Supabase client
 * @returns {Promise<number>} - Price in microtokens (0 if not found)
 */
export async function resolveCatalogPrice(itemType: any, supabase: any) {
    const catalog = await _loadCatalog(supabase);
    return catalog.get(itemType) || 0;
}

/**
 * Resolve price and return display-friendly object.
 * Retorna objeto com preco $ECBT + equivalentes fiat para exibicao.
 *
 * @param {Object} item - Item with pricing data
 * @param {Object} [rates] - Exchange rates
 * @returns {{ ecbt: number, usd: number, brl: number, eur: number, btc: number }}
 */
export function resolvePriceWithConversions(item: any, rates: any) {
    const ecbt = resolvePrice(item, rates);
    return {
        ecbt,
        usd: convert(ecbt, 'ECBT', 'USD', rates),
        brl: convert(ecbt, 'ECBT', 'BRL', rates),
        eur: convert(ecbt, 'ECBT', 'EUR', rates),
        btc: convert(ecbt, 'ECBT', 'BTC', rates),
    };
}

/**
 * Batch resolve prices for a list of items.
 * Resolve precos em lote (ex: catalogo de bibliotecas).
 *
 * @param {Array<Object>} items - Items with pricing data
 * @param {Object} [rates] - Exchange rates
 * @returns {Array<{item: Object, ecbt: number}>}
 */
export function batchResolve(items: any, rates: any) {
    return items.map((item: any) => {
        try {
            return { item, ecbt: resolvePrice(item, rates) };
        } catch {
            return { item, ecbt: 0 };
        }
    });
}

/**
 * Clear catalog cache (on admin price change or logout).
 */
export function clearCatalogCache() {
    _catalogCache = null;
    _catalogFetchedAt = 0;
}

// ----------------------------------------------------------------
// PRIVATE
// ----------------------------------------------------------------

/**
 * Load price catalog from Supabase with caching.
 * @returns {Promise<Map<string, number>>}
 */
async function _loadCatalog(/** @type {any} */ supabase: any) {
    const now = Date.now();
    if (_catalogCache && now - _catalogFetchedAt < 5 * 60_000) {
        return _catalogCache;
    }

    const client = supabase || _getSupabase();
    if (!client) return _defaultCatalog();

    try {
        const { data, error } = await client
            .from('ecbt_price_catalog')
            .select('item_type, ecbt_price')
            .eq('active', true);

        if (error || !data) return _defaultCatalog();

        _catalogCache = new Map(data.map((/** @type {any} */ r: any) => [r.item_type, Number(r.ecbt_price)]));
        _catalogFetchedAt = now;
        return _catalogCache;
    } catch {
        return _defaultCatalog();
    }
}

/** Default catalog matching SQL seed values. */
function _defaultCatalog() {
    return new Map([
        ['subscription_pro', 500 * MICRO],
        ['subscription_scale', 13800 * MICRO],
        ['topup_100', 100 * MICRO],
        ['topup_500', 500 * MICRO],
        ['topup_1000', 1000 * MICRO],
        ['topup_5000', 5000 * MICRO],
    ]);
}

function _getSupabase() {
    try {
        return (window as any).__ecbyts_supabase_client || null;
    } catch {
        return null;
    }
}
