// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   COUNTRIES — Helpers + lazy JSON loader (ISO 3166-1)

   Data extracted to app/assets/data/countries.json on 2026-04-11 as part
   of ARCH-MONO-001 Phase 0 (quick wins). Was 2331 lines of inline JS data;
   now ~110 lines of code + 44KB external JSON.

   Strategy: keep `COUNTRIES` as a mutable array reference. On module
   load, fire-and-forget fetch populates the array IN PLACE via `push`.
   Consumers that imported `COUNTRIES` (directly or via `SUPPORTED_COUNTRIES`
   alias in locationData.js) automatically see the populated data once
   the fetch resolves — JS array references are shared.

   Race condition guard: if a caller needs guaranteed-loaded data
   synchronously, use `awaitCountriesLoaded()` which returns the promise.

   Why lazy load instead of eager: 44KB JSON parsed at runtime is much
   cheaper than 2331 lines of JS that must be parsed by the engine
   on every cold start. Saves ~50ms boot time.
   ================================================================ */

interface Country {
    code: string;
    name_pt: string;
    name_en: string;
    region: string;
    has_subdivisions: boolean;
    default_timezone: string;
    timezones: string[];
}

/**
 * Mutable countries array. Starts empty; populated in-place by the
 * lazy loader below. NEVER replace this reference - only mutate it via
 * push/length=0/splice. Consumers (locationData.js SUPPORTED_COUNTRIES
 * alias, handlers/project.js modal) hold the same reference.
 */
export const COUNTRIES: Country[] = [];

let _loadPromise: Promise<void> | null = null;
let _loaded = false;

/**
 * Fetch countries.json and populate the COUNTRIES array in place.
 * Idempotent - subsequent calls return the same in-flight promise.
 */
function _loadCountries(): Promise<void> {
    if (_loadPromise) return _loadPromise;
    _loadPromise = (async () => {
        try {
            const resp = await fetch('/assets/data/countries.json');
            if (!resp.ok) throw new Error(`countries.json HTTP ${resp.status}`);
            const data = await resp.json();
            const list = Array.isArray(data?.countries) ? data.countries : [];
            // Mutate in place - preserves reference held by SUPPORTED_COUNTRIES alias
            COUNTRIES.length = 0;
            for (const c of list) COUNTRIES.push(c);
            _loaded = true;
        } catch (err) {
            console.warn('[countries] Failed to load countries.json:', (err as any)?.message);
            // Graceful degradation: array stays empty, helpers return empty results
        }
    })();
    return _loadPromise;
}

/**
 * Wait for countries data to finish loading. Use this in handlers that
 * need guaranteed-loaded data (e.g., project create modal that renders
 * country dropdown). Boot-time consumers that iterate later don't need
 * this - they'll see populated data after the first ~50-100ms.
 */
export function awaitCountriesLoaded(): Promise<void> {
    return _loadPromise || _loadCountries();
}

/**
 * @returns true if the countries data has been loaded
 */
export function areCountriesLoaded(): boolean {
    return _loaded;
}

// Kick off load on module init (non-blocking).
_loadCountries();

// ----------------------------------------------------------------
// Helper functions (operate on whatever is currently loaded in COUNTRIES)
// ----------------------------------------------------------------

/**
 * @param code - ISO 3166-1 alpha-2 country code
 */
export function getCountryByCode(code: string): Country | undefined {
    return COUNTRIES.find((c) => c.code === code);
}

/**
 * @param region - e.g. 'Americas', 'Europe', 'Africa', 'Asia', 'Oceania'
 */
export function getCountriesByRegion(region: string): Country[] {
    return COUNTRIES.filter((c) => c.region === region);
}

/**
 * @returns countries that have subdivisions (states/provinces) data
 */
export function getCountriesWithSubdivisions(): Country[] {
    return COUNTRIES.filter((c) => c.has_subdivisions);
}

/**
 * Case-insensitive substring search across name_pt, name_en, code.
 *
 * @param query
 */
export function searchCountries(query: string): Country[] {
    const q = query.toLowerCase();
    return COUNTRIES.filter(
        (c) =>
            c.name_pt.toLowerCase().includes(q) ||
            c.name_en.toLowerCase().includes(q) ||
            c.code.toLowerCase().includes(q),
    );
}
