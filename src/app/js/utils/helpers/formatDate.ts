// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   FORMAT DATE — Canonical date-format helper (consolidação dedup)

   Substitui 3 implementações divergentes:
   - utils/handlers/_librariesPure.formatShortDate (pt-BR fixed, '-' fallback)
   - utils/ui/stampPanel.formatDate (pt-BR fixed, returns original on error)
   - utils/ui/modelDiscoveryPanel.formatDate (browser default locale, dateStyle medium)

   NÃO substitui utils/i18n/translations.formatDate (depende de currentLanguage
   state interno do módulo i18n — fica out-of-scope desta consolidação).

   Pure: sem state, sem DOM.
   ================================================================ */

export interface FormatDateOptions {
    /** Locale for Intl. Default `'pt-BR'`. Use `undefined` for browser default. */
    locale?: string | undefined;
    /** When set, uses Intl.DateTimeFormat with this style instead of toLocaleDateString. */
    dateStyle?: 'full' | 'long' | 'medium' | 'short';
    /** Label returned for null/undefined/empty/invalid date. Default `'-'`. */
    unknownLabel?: string;
    /** On parse error: `'unknown'` returns unknownLabel; `'original'` returns String(value). Default `'unknown'`. */
    errorFallback?: 'unknown' | 'original';
}

/**
 * Format a Date / ISO string / timestamp as a locale-formatted date.
 *
 * Examples:
 *   formatDate('2026-05-30')                                  → "30/05/2026"     (pt-BR default)
 *   formatDate(new Date(), { dateStyle: 'medium' })           → "30 de mai. de 2026"
 *   formatDate('invalid')                                     → "-"
 *   formatDate('invalid', { errorFallback: 'original' })      → "invalid"
 *   formatDate(null, { unknownLabel: '—' })                   → "—"
 */
export function formatDate(value: unknown, opts: FormatDateOptions = {}): string {
    const unknownLabel = opts.unknownLabel ?? '-';
    const errorFallback = opts.errorFallback ?? 'unknown';
    const locale = 'locale' in opts ? opts.locale : 'pt-BR';

    if (value === null || value === undefined || value === '') return unknownLabel;

    let d: Date;
    try {
        d = value instanceof Date ? value : new Date(value as any);
    } catch {
        return errorFallback === 'original' ? String(value) : unknownLabel;
    }

    if (Number.isNaN(d.getTime())) {
        return errorFallback === 'original' ? String(value) : unknownLabel;
    }

    try {
        if (opts.dateStyle) {
            return new Intl.DateTimeFormat(locale, { dateStyle: opts.dateStyle }).format(d);
        }
        return d.toLocaleDateString(locale);
    } catch {
        return errorFallback === 'original' ? String(value) : unknownLabel;
    }
}
