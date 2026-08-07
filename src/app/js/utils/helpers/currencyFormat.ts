// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CURRENCY FORMAT — Shared utilities for displaying monetary values
   Utilitarios compartilhados para exibicao de valores monetarios.

   Substitui formatacao hardcoded (e.g., "R$ X,XX") por funcoes
   centralizadas que respeitam locale do usuario.
   ================================================================ */

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Format a fiat amount for display using Intl.NumberFormat.
 * Formata valor fiat para exibicao respeitando locale.
 *
 * @param {number} cents - Amount in cents (integer)
 * @param {string} currency - ISO 4217 currency code (BRL, USD, EUR)
 * @param {string} [locale?] - BCP 47 locale (default: navigator.language)
 * @returns {string} - Formatted string (e.g., "R$ 29,00", "$5.00")
 */
export function formatCurrency(cents: number, currency: string, locale?: string): string {
    const value = (cents || 0) / 100;
    const loc = locale || _detectLocale();
    const cur = (currency || 'USD').toUpperCase();

    // BTC usa formatacao manual (muitas casas decimais)
    if (cur === 'BTC') {
        return `BTC ${value.toFixed(8)}`;
    }

    try {
        return new Intl.NumberFormat(loc, {
            style: 'currency',
            currency: cur,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value);
    } catch {
        // Fallback se Intl nao suporta a moeda
        return `${cur} ${value.toFixed(2)}`;
    }
}

/**
 * Format a fiat decimal value (not cents) for display.
 * Formata valor fiat decimal (nao centavos).
 *
 * @param {number} value - Amount as decimal (e.g., 29.00)
 * @param {string} currency - ISO 4217 currency code
 * @param {string} [locale?] - BCP 47 locale
 * @returns {string}
 */
export function formatFiatValue(value: number, currency: string, locale?: string): string {
    return formatCurrency(Math.round((value || 0) * 100), currency, locale);
}

/**
 * Format $ECBT microtokens for display.
 * Formata microtokens para exibicao: "$ECBT 500.00"
 *
 * @param {number} microTokens - Value in microtokens
 * @returns {string} - e.g., "$ECBT 500.00"
 */
export function formatECBT(microTokens: number): string {
    const units = (microTokens || 0) / 1_000_000;
    return `$ECBT ${units.toFixed(2)}`;
}

/**
 * Abbreviate $ECBT for compact display (badges, chips).
 * Formata abreviado: "$0", "$500", "$1.2K"
 *
 * @param {number} microTokens - Value in microtokens
 * @returns {string}
 */
export function abbreviateECBT(microTokens: number): string {
    const units = (microTokens || 0) / 1_000_000;
    if (units < 1) return '$0';
    if (units < 1000) return `$${Math.floor(units)}`;
    if (units < 10000) return `$${(units / 1000).toFixed(1)}K`;
    return `$${Math.floor(units / 1000)}K`;
}

/**
 * Format $ECBT for header badge (branded, no decimals, compact for large values).
 * Formata para badge no header: "$ECBT 0", "$ECBT 500", "$ECBT 1.2K"
 *
 * @param {number} microTokens - Value in microtokens
 * @returns {string}
 */
export function badgeECBT(microTokens: number): string {
    const units = (microTokens || 0) / 1_000_000;
    if (units < 1) return '$ECBT 0';
    if (units < 1000) return `$ECBT ${Math.floor(units)}`;
    if (units < 10000) return `$ECBT ${(units / 1000).toFixed(1)}K`;
    return `$ECBT ${Math.floor(units / 1000)}K`;
}

/**
 * Format exchange rate for display in checkout.
 * Formata taxa de cambio: "1 $ECBT = R$ 0,058"
 *
 * @param {number} ratePerEcbt - Fiat value per 1 $ECBT
 * @param {string} currency - Target currency
 * @param {string} [locale?] - BCP 47 locale
 * @returns {string}
 */
export function formatRate(ratePerEcbt: number, currency: string, locale?: string): string {
    const loc = locale || _detectLocale();
    const cur = (currency || 'USD').toUpperCase();

    if (cur === 'BTC') {
        return `1 $ECBT = BTC ${ratePerEcbt.toFixed(10)}`;
    }

    try {
        const formatted = new Intl.NumberFormat(loc, {
            style: 'currency',
            currency: cur,
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
        }).format(ratePerEcbt);
        return `1 $ECBT = ${formatted}`;
    } catch (e) {
        console.debug('[currencyFormat] intlFormat:', (e as any)?.message || e);
        return `1 $ECBT = ${cur} ${ratePerEcbt.toFixed(4)}`;
    }
}

// ----------------------------------------------------------------
// PRIVATE
// ----------------------------------------------------------------

function _detectLocale(): string {
    // Tenta pegar do i18n se disponivel
    try {
        if ((window as any).__ecbyts_current_locale) return (window as any).__ecbyts_current_locale;
    } catch (e) {
        console.debug('[currencyFormat] detectLocale:', (e as any)?.message || e);
        /* noop */
    }
    return (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
}
