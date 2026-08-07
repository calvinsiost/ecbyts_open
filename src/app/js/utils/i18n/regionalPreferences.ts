// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/*
   REGIONAL PREFERENCES

   User-facing regional formatting must separate interface language from
   locale, time zone, clock, number, currency and unit preferences. Defaults
   come from the browser; manual choices persist only when the user asks.
*/

export type RegionalMode = 'browser' | 'manual';
export type RegionalDateStyle = 'short' | 'medium' | 'long' | 'full';
export type RegionalTimeStyle = 'short' | 'medium' | 'long';
export type RegionalHourCycle = 'auto' | 'h12' | 'h23';
export type RegionalFirstDayOfWeek = 'auto' | 'monday' | 'sunday';
export type RegionalMeasurementSystem = 'auto' | 'metric' | 'imperial';

export interface RegionalPreferences {
    mode: RegionalMode;
    locale: string;
    timeZone: string;
    dateStyle: RegionalDateStyle;
    timeStyle: RegionalTimeStyle;
    hourCycle: RegionalHourCycle;
    firstDayOfWeek: RegionalFirstDayOfWeek;
    measurementSystem: RegionalMeasurementSystem;
    currency: string;
    showTimeZoneName: boolean;
}

export interface BrowserRegionalSettings {
    locale: string;
    timeZone: string;
    hourCycle: RegionalHourCycle;
    currency: string;
    measurementSystem: RegionalMeasurementSystem;
    firstDayOfWeek: RegionalFirstDayOfWeek;
}

export const REGIONAL_PREFERENCES_STORAGE_KEY = 'ecbyts-regional-preferences-v1';

export const REGION_LOCALE_OPTIONS = Object.freeze([
    'pt-BR',
    'en-US',
    'es-LA',
    'en-GB',
    'fr-FR',
    'de-DE',
    'ja-JP',
    'zh-CN',
]);

export const TIME_ZONE_OPTIONS = Object.freeze([
    'America/Sao_Paulo',
    'America/New_York',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'UTC',
]);

export const CURRENCY_OPTIONS = Object.freeze(['BRL', 'USD', 'EUR', 'GBP', 'JPY']);

const DATE_STYLES = new Set<RegionalDateStyle>(['short', 'medium', 'long', 'full']);
const TIME_STYLES = new Set<RegionalTimeStyle>(['short', 'medium', 'long']);
const HOUR_CYCLES = new Set<RegionalHourCycle>(['auto', 'h12', 'h23']);
const FIRST_DAYS = new Set<RegionalFirstDayOfWeek>(['auto', 'monday', 'sunday']);
const MEASUREMENT_SYSTEMS = new Set<RegionalMeasurementSystem>(['auto', 'metric', 'imperial']);

function canUseLocalStorage(): boolean {
    try {
        return typeof localStorage !== 'undefined';
    } catch (err: any) {
        console.debug('[regional-preferences] localStorage unavailable', err?.message || err);
        return false;
    }
}

function safeJsonParse(value: string | null): Record<string, unknown> | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (err: any) {
        console.debug('[regional-preferences] ignored invalid stored preferences', err?.message || err);
        return null;
    }
}

function firstSupportedLocale(candidates: readonly string[]): string {
    for (const candidate of candidates) {
        if (!candidate) continue;
        try {
            const supported = Intl.DateTimeFormat.supportedLocalesOf([candidate]);
            if (supported.length) return supported[0] || candidate;
        } catch (err: any) {
            console.debug('[regional-preferences] unsupported locale candidate', candidate, err?.message || err);
        }
    }
    return 'pt-BR';
}

function currencyForLocale(locale: string): string {
    const lower = locale.toLowerCase();
    if (lower.includes('pt-br')) return 'BRL';
    if (lower.includes('en-gb')) return 'GBP';
    if (lower.includes('ja-jp')) return 'JPY';
    if (lower.includes('de-') || lower.includes('fr-') || lower.includes('es-')) return 'EUR';
    return 'USD';
}

function measurementForLocale(locale: string): RegionalMeasurementSystem {
    return /^en-US$/i.test(locale) ? 'imperial' : 'metric';
}

function firstDayForLocale(locale: string): RegionalFirstDayOfWeek {
    return /^en-US$/i.test(locale) ? 'sunday' : 'monday';
}

function normalizeDateStyle(value: unknown): RegionalDateStyle {
    return DATE_STYLES.has(value as RegionalDateStyle) ? (value as RegionalDateStyle) : 'short';
}

function normalizeTimeStyle(value: unknown): RegionalTimeStyle {
    return TIME_STYLES.has(value as RegionalTimeStyle) ? (value as RegionalTimeStyle) : 'medium';
}

function normalizeHourCycle(value: unknown): RegionalHourCycle {
    return HOUR_CYCLES.has(value as RegionalHourCycle) ? (value as RegionalHourCycle) : 'auto';
}

function normalizeFirstDay(value: unknown): RegionalFirstDayOfWeek {
    return FIRST_DAYS.has(value as RegionalFirstDayOfWeek) ? (value as RegionalFirstDayOfWeek) : 'auto';
}

function normalizeMeasurement(value: unknown): RegionalMeasurementSystem {
    return MEASUREMENT_SYSTEMS.has(value as RegionalMeasurementSystem) ? (value as RegionalMeasurementSystem) : 'auto';
}

function normalizeCurrency(value: unknown, fallback: string): string {
    const v = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return /^[A-Z]{3}$/.test(v) ? v : fallback;
}

export function detectBrowserRegionalSettings(): BrowserRegionalSettings {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const candidates =
        nav && Array.isArray(nav.languages) && nav.languages.length
            ? nav.languages.map(String)
            : nav?.language
              ? [String(nav.language)]
              : [];
    const locale = firstSupportedLocale(candidates);
    const resolved = new Intl.DateTimeFormat(locale).resolvedOptions();
    const timeZone = resolved.timeZone || 'UTC';
    const hourCycle = (resolved.hourCycle === 'h12' ? 'h12' : resolved.hourCycle === 'h23' ? 'h23' : 'auto') as RegionalHourCycle;
    return {
        locale,
        timeZone,
        hourCycle,
        currency: currencyForLocale(locale),
        measurementSystem: measurementForLocale(locale),
        firstDayOfWeek: firstDayForLocale(locale),
    };
}

export function normalizeRegionalPreferences(input: unknown, browser = detectBrowserRegionalSettings()): RegionalPreferences {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const mode: RegionalMode = raw.mode === 'manual' ? 'manual' : 'browser';
    const locale = typeof raw.locale === 'string' && raw.locale.trim() ? raw.locale.trim() : browser.locale;
    const timeZone = typeof raw.timeZone === 'string' && raw.timeZone.trim() ? raw.timeZone.trim() : browser.timeZone;
    return {
        mode,
        locale,
        timeZone,
        dateStyle: normalizeDateStyle(raw.dateStyle),
        timeStyle: normalizeTimeStyle(raw.timeStyle),
        hourCycle: normalizeHourCycle(raw.hourCycle || browser.hourCycle),
        firstDayOfWeek: normalizeFirstDay(raw.firstDayOfWeek || browser.firstDayOfWeek),
        measurementSystem: normalizeMeasurement(raw.measurementSystem || browser.measurementSystem),
        currency: normalizeCurrency(raw.currency, browser.currency),
        showTimeZoneName: raw.showTimeZoneName !== false,
    };
}

export function loadRegionalPreferences(): RegionalPreferences {
    const browser = detectBrowserRegionalSettings();
    const stored = canUseLocalStorage()
        ? safeJsonParse(localStorage.getItem(REGIONAL_PREFERENCES_STORAGE_KEY))
        : null;
    return normalizeRegionalPreferences(stored || { mode: 'browser' }, browser);
}

export function saveRegionalPreferences(preferences: unknown): RegionalPreferences {
    const normalized = normalizeRegionalPreferences(preferences);
    if (canUseLocalStorage()) {
        localStorage.setItem(REGIONAL_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('regionalPreferencesChanged', { detail: normalized }));
    }
    return normalized;
}

export function resetRegionalPreferences(): RegionalPreferences {
    if (canUseLocalStorage()) localStorage.removeItem(REGIONAL_PREFERENCES_STORAGE_KEY);
    return saveRegionalPreferences({ mode: 'browser' });
}

export function getEffectiveRegionalPreferences(): RegionalPreferences {
    const saved = loadRegionalPreferences();
    if (saved.mode === 'manual') return saved;
    const browser = detectBrowserRegionalSettings();
    return normalizeRegionalPreferences({ ...saved, ...browser, mode: 'browser' }, browser);
}

export function buildDateTimeFormatOptions(
    prefs = getEffectiveRegionalPreferences(),
    overrides: Intl.DateTimeFormatOptions = {},
): Intl.DateTimeFormatOptions {
    const hasExplicitShape = Object.keys(overrides).some((key) => key !== 'timeZone' && key !== 'hour12');
    const options: Intl.DateTimeFormatOptions = hasExplicitShape
        ? { timeZone: prefs.timeZone, ...overrides }
        : {
              dateStyle: prefs.dateStyle,
              timeStyle: prefs.timeStyle,
              timeZone: prefs.timeZone,
              ...overrides,
          };
    if (prefs.hourCycle !== 'auto' && !options.hour12) options.hourCycle = prefs.hourCycle;
    if (prefs.showTimeZoneName && !options.timeZoneName && !options.dateStyle && !options.timeStyle) {
        options.timeZoneName = 'short';
    }
    return options;
}

export function formatRegionalDate(value: unknown, overrides: Intl.DateTimeFormatOptions = {}): string {
    if (value === null || value === undefined || value === '') return '-';
    const date = value instanceof Date ? value : new Date(value as any);
    if (Number.isNaN(date.getTime())) return '-';
    const prefs = getEffectiveRegionalPreferences();
    try {
        const opts = buildDateTimeFormatOptions(prefs, overrides);
        return new Intl.DateTimeFormat(prefs.locale, opts).format(date);
    } catch (err: any) {
        console.debug('[regional-preferences] date formatting fallback', err?.message || err);
        return date.toISOString();
    }
}

export function formatRegionalNumber(value: number, overrides: Intl.NumberFormatOptions = {}): string {
    const prefs = getEffectiveRegionalPreferences();
    return new Intl.NumberFormat(prefs.locale, overrides).format(value);
}

export function formatRegionalCurrency(value: number, overrides: Intl.NumberFormatOptions = {}): string {
    const prefs = getEffectiveRegionalPreferences();
    return new Intl.NumberFormat(prefs.locale, {
        style: 'currency',
        currency: prefs.currency,
        ...overrides,
    }).format(value);
}

export function buildRegionalPreview(now: Date = new Date()): string {
    const prefs = getEffectiveRegionalPreferences();
    const date = formatRegionalDate(now);
    const number = formatRegionalNumber(1234567.89);
    const money = formatRegionalCurrency(1234.56);
    return `${date} · ${prefs.timeZone} · ${number} · ${money}`;
}

export function buildRegionalPreviewForPreferences(input: unknown, now: Date = new Date()): string {
    const prefs = normalizeRegionalPreferences(input);
    const date = new Intl.DateTimeFormat(prefs.locale, buildDateTimeFormatOptions(prefs)).format(now);
    const number = new Intl.NumberFormat(prefs.locale).format(1234567.89);
    const money = new Intl.NumberFormat(prefs.locale, { style: 'currency', currency: prefs.currency }).format(1234.56);
    return `${date} · ${prefs.timeZone} · ${number} · ${money}`;
}
