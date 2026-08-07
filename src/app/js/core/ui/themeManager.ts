// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-56 - Theme/Appearance Manager (pure logic).
 *
 * Pure theme manager with dark/light/auto/high-contrast/custom switching.
 * No DOM and no CSS injection. State is immutable (frozen); every mutation
 * returns a new state. Tokens are CSS custom properties (frozen objects).
 */

export type ThemeMode = 'light' | 'dark' | 'auto' | 'high-contrast';
export type SystemPreference = 'light' | 'dark';
export type ThemeTokens = Record<string, string>;

export interface Theme {
    id: string;
    label: string;
    mode: ThemeMode;
    tokens: Readonly<ThemeTokens>;
    isCustom: boolean;
}

export interface ThemeState {
    themes: Map<string, Readonly<Theme>>;
    activeThemeId: string | null;
    systemPreference: SystemPreference;
    autoFollowsSystem: boolean;
}

export interface CreateThemeStateOptions {
    themes?: readonly unknown[];
    activeThemeId?: unknown;
    systemPreference?: unknown;
}

export interface ContrastValidationResult {
    valid: boolean;
    ratio: number | null;
    warnings: string[];
}

export interface ThemeSummary {
    themeCount: number;
    customCount: number;
    activeMode: ThemeMode | null;
    effectiveMode: ThemeMode;
}

interface ThemeCandidate {
    id?: unknown;
    label?: unknown;
    mode?: unknown;
    tokens?: unknown;
    isCustom?: unknown;
}

interface ValidThemeCandidate extends ThemeCandidate {
    id: string;
    mode: ThemeMode;
}

interface MutableThemeState {
    themes: Map<string, Readonly<Theme>>;
    activeThemeId: string | null;
    systemPreference: SystemPreference;
    autoFollowsSystem: boolean;
}

interface Rgb {
    r: number;
    g: number;
    b: number;
}

const VALID_MODES = new Set<ThemeMode>(['light', 'dark', 'auto', 'high-contrast']);
const VALID_SYSTEM_PREFS = new Set<SystemPreference>(['light', 'dark']);

function isThemeMode(mode: unknown): mode is ThemeMode {
    return typeof mode === 'string' && VALID_MODES.has(mode as ThemeMode);
}

function isSystemPreference(pref: unknown): pref is SystemPreference {
    return typeof pref === 'string' && VALID_SYSTEM_PREFS.has(pref as SystemPreference);
}

function freezeTheme(theme: ValidThemeCandidate): Readonly<Theme> {
    return Object.freeze({
        id: theme.id,
        label: theme.label as string,
        mode: theme.mode,
        tokens: Object.freeze({ ...(theme.tokens as ThemeTokens) }),
        isCustom: !!theme.isCustom,
    });
}

function freezeState(state: MutableThemeState): Readonly<ThemeState> {
    return Object.freeze({
        themes: state.themes,
        activeThemeId: state.activeThemeId,
        systemPreference: state.systemPreference,
        autoFollowsSystem: state.autoFollowsSystem,
    });
}

/**
 * Create a frozen theme state.
 */
export function createThemeState(opts: CreateThemeStateOptions = {}): Readonly<ThemeState> {
    const themesArr = Array.isArray(opts.themes) ? opts.themes : [];
    const map = new Map<string, Readonly<Theme>>();
    for (const theme of themesArr) {
        const t = theme as ThemeCandidate | null;
        if (!t || typeof t.id !== 'string') {
            throw new Error('createThemeState: theme requires string id');
        }
        if (!isThemeMode(t.mode)) {
            throw new Error(`createThemeState: invalid mode '${t.mode}' for theme '${t.id}'`);
        }
        if (map.has(t.id)) {
            throw new Error(`createThemeState: duplicate theme id '${t.id}'`);
        }
        map.set(t.id, freezeTheme(t as ValidThemeCandidate));
    }

    const firstTheme = themesArr[0] as ThemeCandidate | undefined;
    const activeThemeId = (opts.activeThemeId || (firstTheme && firstTheme.id) || null) as string | null;
    if (activeThemeId && !map.has(activeThemeId)) {
        throw new Error(`createThemeState: activeThemeId '${activeThemeId}' not registered`);
    }

    const systemPreference = opts.systemPreference || 'light';
    if (!isSystemPreference(systemPreference)) {
        throw new Error(`createThemeState: invalid systemPreference '${systemPreference}'`);
    }

    const frozenMap = Object.freeze(new Map(map)) as Map<string, Readonly<Theme>>;
    return freezeState({
        themes: frozenMap,
        activeThemeId,
        systemPreference,
        autoFollowsSystem: true,
    });
}

export function registerTheme(state: Readonly<ThemeState>, theme: unknown): Readonly<ThemeState> {
    const candidate = theme as ThemeCandidate | null;
    if (!candidate || typeof candidate.id !== 'string') {
        throw new Error('registerTheme: theme requires string id');
    }
    if (!isThemeMode(candidate.mode)) {
        throw new Error(`registerTheme: invalid mode '${candidate.mode}'`);
    }
    if (state.themes.has(candidate.id)) {
        throw new Error(`registerTheme: duplicate theme id '${candidate.id}'`);
    }
    const newMap = new Map(state.themes);
    newMap.set(candidate.id, freezeTheme(candidate as ValidThemeCandidate));
    return freezeState({
        themes: Object.freeze(newMap) as Map<string, Readonly<Theme>>,
        activeThemeId: state.activeThemeId,
        systemPreference: state.systemPreference,
        autoFollowsSystem: state.autoFollowsSystem,
    });
}

export function removeTheme(state: Readonly<ThemeState>, themeId: string): Readonly<ThemeState> {
    const t = state.themes.get(themeId);
    if (!t) throw new Error(`removeTheme: theme '${themeId}' not found`);
    if (themeId === state.activeThemeId) {
        throw new Error(`removeTheme: cannot remove active theme '${themeId}'`);
    }
    if (!t.isCustom) {
        throw new Error(`removeTheme: cannot remove built-in theme '${themeId}'`);
    }
    const newMap = new Map(state.themes);
    newMap.delete(themeId);
    return freezeState({
        themes: Object.freeze(newMap) as Map<string, Readonly<Theme>>,
        activeThemeId: state.activeThemeId,
        systemPreference: state.systemPreference,
        autoFollowsSystem: state.autoFollowsSystem,
    });
}

export function setActiveTheme(state: Readonly<ThemeState>, themeId: string): Readonly<ThemeState> {
    if (!state.themes.has(themeId)) {
        throw new Error(`setActiveTheme: theme '${themeId}' not registered`);
    }
    return freezeState({
        themes: state.themes,
        activeThemeId: themeId,
        systemPreference: state.systemPreference,
        autoFollowsSystem: state.autoFollowsSystem,
    });
}

export function setSystemPreference(state: Readonly<ThemeState>, pref: unknown): Readonly<ThemeState> {
    if (!isSystemPreference(pref)) {
        throw new Error(`setSystemPreference: invalid pref '${pref}'`);
    }
    return freezeState({
        themes: state.themes,
        activeThemeId: state.activeThemeId,
        systemPreference: pref,
        autoFollowsSystem: state.autoFollowsSystem,
    });
}

export function getActiveTheme(state: Readonly<ThemeState>): Readonly<Theme> | null {
    if (!state.activeThemeId) return null;
    return state.themes.get(state.activeThemeId) || null;
}

export function getEffectiveMode(state: Readonly<ThemeState>): ThemeMode {
    const t = getActiveTheme(state);
    if (!t) return state.systemPreference;
    if (t.mode === 'auto') return state.systemPreference;
    return t.mode;
}

export function getEffectiveTokens(state: Readonly<ThemeState>): Readonly<ThemeTokens> {
    const t = getActiveTheme(state);
    if (!t) return Object.freeze({});
    if (t.mode !== 'auto') return t.tokens;

    const target = state.systemPreference;
    for (const candidate of state.themes.values()) {
        if (candidate.mode === target && !candidate.isCustom) {
            return candidate.tokens;
        }
    }

    for (const candidate of state.themes.values()) {
        if (candidate.mode === target) return candidate.tokens;
    }
    return t.tokens;
}

export function cloneAsCustom(
    state: Readonly<ThemeState>,
    baseThemeId: string,
    newId: unknown,
    label?: unknown,
): Readonly<ThemeState> {
    const base = state.themes.get(baseThemeId);
    if (!base) throw new Error(`cloneAsCustom: base '${baseThemeId}' not found`);
    if (typeof newId !== 'string' || !newId) {
        throw new Error('cloneAsCustom: newId must be non-empty string');
    }
    if (state.themes.has(newId)) {
        throw new Error(`cloneAsCustom: id '${newId}' already exists`);
    }
    const cloned = freezeTheme({
        id: newId,
        label: label || `${base.label} (custom)`,
        mode: base.mode === 'auto' ? 'light' : base.mode,
        tokens: { ...base.tokens },
        isCustom: true,
    });
    const newMap = new Map(state.themes);
    newMap.set(newId, cloned);
    return freezeState({
        themes: Object.freeze(newMap) as Map<string, Readonly<Theme>>,
        activeThemeId: state.activeThemeId,
        systemPreference: state.systemPreference,
        autoFollowsSystem: state.autoFollowsSystem,
    });
}

export function updateThemeTokens(
    state: Readonly<ThemeState>,
    themeId: string,
    partialTokens: unknown,
): Readonly<ThemeState> {
    const t = state.themes.get(themeId);
    if (!t) throw new Error(`updateThemeTokens: theme '${themeId}' not found`);
    if (!t.isCustom) {
        throw new Error(`updateThemeTokens: cannot mutate built-in theme '${themeId}'`);
    }
    if (!partialTokens || typeof partialTokens !== 'object') {
        throw new Error('updateThemeTokens: partialTokens must be object');
    }
    const merged = freezeTheme({
        id: t.id,
        label: t.label,
        mode: t.mode,
        tokens: { ...t.tokens, ...(partialTokens as ThemeTokens) },
        isCustom: true,
    });
    const newMap = new Map(state.themes);
    newMap.set(themeId, merged);
    return freezeState({
        themes: Object.freeze(newMap) as Map<string, Readonly<Theme>>,
        activeThemeId: state.activeThemeId,
        systemPreference: state.systemPreference,
        autoFollowsSystem: state.autoFollowsSystem,
    });
}

function parseHex(hex: unknown): Rgb | null {
    if (typeof hex !== 'string') return null;
    let s = hex.trim();
    if (s.startsWith('#')) s = s.slice(1);
    if (s.length === 3) {
        s = s
            .split('')
            .map((c) => c + c)
            .join('');
    }
    if (s.length !== 6 || /[^0-9a-fA-F]/.test(s)) return null;
    return {
        r: parseInt(s.slice(0, 2), 16),
        g: parseInt(s.slice(2, 4), 16),
        b: parseInt(s.slice(4, 6), 16),
    };
}

function relLuminance({ r, g, b }: Rgb): number {
    const conv = (v: number): number => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * conv(r) + 0.7152 * conv(g) + 0.0722 * conv(b);
}

function contrastRatio(fg: unknown, bg: unknown): number | null {
    const a = parseHex(fg);
    const b = parseHex(bg);
    if (!a || !b) return null;
    const la = relLuminance(a);
    const lb = relLuminance(b);
    const lighter = Math.max(la, lb);
    const darker = Math.min(la, lb);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Validate WCAG AA contrast. Looks for --color-text + --color-bg tokens
 * with legacy fallbacks. Returns { valid, ratio, warnings }.
 */
export function validateContrast(tokens: unknown): ContrastValidationResult {
    const warnings: string[] = [];
    if (!tokens || typeof tokens !== 'object') {
        return { valid: false, ratio: null, warnings: ['tokens must be object'] };
    }
    const tokenMap = tokens as Record<string, unknown>;
    const fg = tokenMap['--color-text'] || tokenMap['--text-color'] || tokenMap['--fg'];
    const bg = tokenMap['--color-bg'] || tokenMap['--bg-color'] || tokenMap['--background'] || tokenMap['--bg'];
    if (!fg || !bg) {
        warnings.push('missing --color-text and/or --color-bg tokens');
        return { valid: false, ratio: null, warnings };
    }
    const ratio = contrastRatio(fg, bg);
    if (ratio == null) {
        warnings.push('invalid hex color in tokens');
        return { valid: false, ratio: null, warnings };
    }
    const roundedRatio = Math.round(ratio * 100) / 100;
    if (ratio < 3) {
        warnings.push(`contrast ratio ${roundedRatio}:1 fails WCAG AA large text (3:1)`);
    } else if (ratio < 4.5) {
        warnings.push(`contrast ratio ${roundedRatio}:1 fails WCAG AA normal text (4.5:1)`);
    }
    return {
        valid: ratio >= 4.5,
        ratio: roundedRatio,
        warnings,
    };
}

export function summarizeThemes(state: Readonly<ThemeState>): ThemeSummary {
    let customCount = 0;
    for (const t of state.themes.values()) {
        if (t.isCustom) customCount++;
    }
    const active = getActiveTheme(state);
    return {
        themeCount: state.themes.size,
        customCount,
        activeMode: active ? active.mode : null,
        effectiveMode: getEffectiveMode(state),
    };
}
