// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   EXCHANGE RATES — $ECBT <-> fiat/crypto conversion engine
   Motor de conversao entre $ECBT (microtokens) e moedas fiat.

   ARQUITETURA:
   - Taxas armazenadas em Supabase (ecbt_exchange_rates)
   - Cache em memoria com TTL configuravel
   - convert() aceita microtokens e retorna valor fiat (ou vice-versa)
   - formatECBT() formata microtokens para exibicao humana
   ================================================================ */

import { CONFIG } from '../../config.js';

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

const MICRO = CONFIG.CURRENCY?.MICRO_UNIT || 1_000_000;
const CACHE_TTL = CONFIG.CURRENCY?.RATES_CACHE_TTL || 5 * 60 * 1000;

// ----------------------------------------------------------------
// STATE - cache de taxas
// ----------------------------------------------------------------

/** @type {{ rates: Object|null, fetchedAt: number }} */
let _cache: { rates: any; fetchedAt: number } = { rates: null, fetchedAt: 0 };

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Fetch latest exchange rates from Supabase.
 * Busca taxas mais recentes do banco. Usa cache se dentro do TTL.
 *
 * @param {Object} [supabase?] - Supabase client (optional, uses global if omitted)
 * @returns {Promise<Object>} - { ecbt_to_usd, ecbt_to_brl, ecbt_to_eur, ecbt_to_btc }
 */
export async function fetchRates(supabase?: any) {
    const now = Date.now();
    if (_cache.rates && now - _cache.fetchedAt < CACHE_TTL) {
        return _cache.rates;
    }

    const client = supabase || _getSupabase();
    if (!client) {
        // Fallback: peg fixo sem cross-rates
        return _fallbackRates();
    }

    try {
        const { data, error } = await client
            .from(CONFIG.CURRENCY?.RATES_TABLE || 'ecbt_exchange_rates')
            .select('ecbt_to_usd, ecbt_to_brl, ecbt_to_eur, ecbt_to_btc')
            .order('effective_at', { ascending: false })
            .limit(1)
            .maybeSingle(); // 406-safe: rates table may be empty (fallback below)

        if (error || !data) {
            console.warn('[ecbt-rates] Failed to fetch rates, using fallback:', error?.message);
            return _fallbackRates();
        }

        _cache = {
            rates: {
                ecbt_to_usd: Number(data.ecbt_to_usd),
                ecbt_to_brl: Number(data.ecbt_to_brl),
                ecbt_to_eur: Number(data.ecbt_to_eur),
                ecbt_to_btc: Number(data.ecbt_to_btc),
            },
            fetchedAt: now,
        };
        return /** @type {Object} */ (_cache.rates);
    } catch (err) {
        console.warn('[ecbt-rates] Fetch error, using fallback:', (err as any)?.message);
        return _fallbackRates();
    }
}

/**
 * Convert between $ECBT (microtokens) and fiat currencies.
 * Converte entre $ECBT e moedas fiat usando taxas em cache.
 *
 * @param {number} amount - Valor na moeda de origem
 * @param {'ECBT'|'USD'|'BRL'|'EUR'|'BTC'} from - Moeda de origem
 * @param {'ECBT'|'USD'|'BRL'|'EUR'|'BTC'} to - Moeda de destino
 * @param {Object} [rates] - Taxas (opcional, usa cache se omitido)
 * @returns {number} - Valor convertido. Se from=ECBT, amount em microtokens, retorna fiat.
 *                      Se to=ECBT, amount em fiat, retorna microtokens.
 */
export function convert(amount: any, from: any, to: any, rates: any) {
    if (amount === 0) return 0;
    if (from === to) return amount;

    const r = rates || _cache.rates || _fallbackRates();

    if (from === 'ECBT') {
        // microtokens → fiat
        const ecbtUnits = amount / MICRO;
        const rateKey = `ecbt_to_${to.toLowerCase()}`;
        const rate = /** @type {Record<string, number>} */ (r)[rateKey];
        if (rate == null) throw new Error(`Unknown currency: ${to}`);
        return _round(ecbtUnits * rate, to === 'BTC' ? 10 : 2);
    }

    if (to === 'ECBT') {
        // fiat → microtokens
        const rateKey = `ecbt_to_${from.toLowerCase()}`;
        const rate = /** @type {Record<string, number>} */ (r)[rateKey];
        if (rate == null) throw new Error(`Unknown currency: ${from}`);
        const ecbtUnits = amount / rate;
        return Math.round(ecbtUnits * MICRO);
    }

    // fiat → fiat: via ECBT pivot
    const microTokens = convert(amount, from, 'ECBT', r);
    return convert(microTokens, 'ECBT', to, r);
}

/**
 * Convert $ECBT microtokens to fiat cents (integer).
 * Util para enviar ao Stripe/MP que espera centavos.
 *
 * @param {number} microTokens - Valor em microtokens
 * @param {'USD'|'BRL'|'EUR'} currency - Moeda fiat
 * @param {Object} [rates] - Taxas (opcional)
 * @returns {number} - Valor em centavos (inteiro)
 */
export function toFiatCents(microTokens: any, currency: any, rates: any) {
    const fiatValue = convert(microTokens, 'ECBT', currency, rates);
    return Math.round(fiatValue * 100);
}

/**
 * Format $ECBT microtokens for human display.
 * Formata microtokens para exibicao: "$ECBT 500.00"
 *
 * @param {number} microTokens - Valor em microtokens
 * @returns {string} - Ex: "$ECBT 500.00"
 */
export function formatECBT(microTokens: any) {
    const units = (microTokens || 0) / MICRO;
    return `$ECBT ${units.toFixed(2)}`;
}

/**
 * Abbreviate $ECBT for badges/compact display.
 * Formata abreviado para badges: "$500", "$1.2K"
 *
 * @param {number} microTokens - Valor em microtokens
 * @returns {string} - Ex: "$0", "$500", "$1.2K", "$15K"
 */
export function abbreviateECBT(microTokens: any) {
    const units = (microTokens || 0) / MICRO;
    if (units < 1) return '$0';
    if (units < 1000) return `$${Math.floor(units)}`;
    if (units < 10000) return `$${(units / 1000).toFixed(1)}K`;
    return `$${Math.floor(units / 1000)}K`;
}

/**
 * Create a rate snapshot for checkout sessions.
 * Congela taxas atuais para travar preco no checkout.
 *
 * @returns {{ rates: Object, lockedAt: number, expiresAt: number }}
 */
export function createRateSnapshot() {
    const rates = _cache.rates || _fallbackRates();
    const now = Date.now();
    return {
        rates: { ...rates },
        lockedAt: now,
        expiresAt: now + (CONFIG.CURRENCY?.RATE_LOCK_TTL || 600_000),
    };
}

/**
 * Check if a rate snapshot is still valid.
 * @param {{ expiresAt: number }} snapshot
 * @returns {boolean}
 */
export function isSnapshotValid(snapshot: any) {
    return snapshot && Date.now() < snapshot.expiresAt;
}

/**
 * Inject rates into cache (for testing or manual override).
 * @param {Object} rates - { ecbt_to_usd, ecbt_to_brl, ecbt_to_eur, ecbt_to_btc }
 */
export function setRatesCache(rates: any) {
    _cache = { rates: { ...rates }, fetchedAt: Date.now() };
}

/**
 * Clear rates cache.
 */
export function clearRatesCache() {
    _cache = { rates: null, fetchedAt: 0 };
}

// ----------------------------------------------------------------
// PRIVATE
// ----------------------------------------------------------------

/** Fallback rates based on CONFIG peg + approximate cross-rates. */
function _fallbackRates() {
    return {
        ecbt_to_usd: CONFIG.CURRENCY?.PEG_USD || 0.01,
        ecbt_to_brl: 0.058,
        ecbt_to_eur: 0.0092,
        ecbt_to_btc: 0.000000119,
    };
}

/**
 * Round to N decimals.
 * @param {number} value
 * @param {number} decimals
 */
function _round(value: any, decimals: any) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/** Try to get Supabase client from session module. */
function _getSupabase() {
    try {
        // Lazy import para evitar dependencia circular
        const mod = (window as any).__ecbyts_supabase_client;
        return mod || null;
    } catch {
        return null;
    }
}
