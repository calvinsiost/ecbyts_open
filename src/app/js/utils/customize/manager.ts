// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   CUSTOMIZE MANAGER — UI Customization Engine
   ================================================================
   Gerencia personalizacao da interface: fontes, paleta de cores,
   densidade, cards visiveis na Home, layout defaults.
   Persiste em localStorage (Category A — preservado sempre).
   Aplica CSS vars ao DOM para mudancas visuais em tempo real.
   ================================================================ */
import { safeSetItem, isEphemeral } from '../storage/storageMonitor.js';
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const STORAGE_KEY = 'ecbyts-customize';
/** @type {Record<string, string>} Font family stacks indexed by ID */
const FONT_STACKS = {
    system: "'Segoe UI', 'Inter', -apple-system, sans-serif",
    inter: "'Inter', -apple-system, sans-serif",
    roboto: "'Roboto', -apple-system, sans-serif",
    'source-sans': "'Source Sans 3', -apple-system, sans-serif",
    'ibm-plex': "'IBM Plex Sans', -apple-system, sans-serif",
    jetbrains: "'JetBrains Mono', monospace",
};
/** @type {Record<string, string>} Google Fonts CDN family parameter */
const FONT_CDN_FAMILIES = {
    inter: 'Inter:wght@400;500;600;700',
    roboto: 'Roboto:wght@400;500;700',
    'source-sans': 'Source+Sans+3:wght@400;500;600;700',
    'ibm-plex': 'IBM+Plex+Sans:wght@400;500;600;700',
    jetbrains: 'JetBrains+Mono:wght@400;500;700',
};
const VALID_FONT_IDS = Object.keys(FONT_STACKS);
const VALID_DENSITIES = ['compact', 'comfortable', 'spacious'];
const VALID_PALETTES = ['teal', 'ocean', 'forest', 'amber', 'slate'];
const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 16;
const FONT_SIZE_DEFAULT = 12;
/** Base typography scale (px) at default 12px */
const TYPE_SCALE = {
    '--text-xs': 10,
    '--text-sm': 11,
    '--text-base': 12,
    '--text-md': 13,
    '--text-lg': 14,
    '--text-xl': 16,
    '--text-2xl': 18,
    '--text-3xl': 24,
};
/** Base spacing scale (px) at default comfortable */
const SPACE_SCALE = {
    '--space-1': 4,
    '--space-2': 8,
    '--space-3': 12,
    '--space-4': 16,
    '--space-5': 20,
    '--space-6': 24,
};
/** Density multipliers for spacing */
const DENSITY_FACTORS = {
    compact: 0.75,
    comfortable: 1.0,
    spacious: 1.25,
};
/**
 * Palette definitions: hue (0-360) and saturation (0-100).
 * Shades 50-900 generated via generatePalette().
 */
const PALETTE_DEFS = {
    teal: { h: 193, s: 33, name: 'Teal Petroleum', base: '#3d6b7a' },
    ocean: { h: 221, s: 83, name: 'Ocean Blue', base: '#2563eb' },
    forest: { h: 142, s: 72, name: 'Forest Green', base: '#16a34a' },
    amber: { h: 38, s: 92, name: 'Warm Amber', base: '#d97706' },
    slate: { h: 215, s: 16, name: 'Slate Gray', base: '#64748b' },
};
const MAX_USER_PRESETS = 10;
// ----------------------------------------------------------------
// DEFAULT STATE
// ----------------------------------------------------------------
/** @type {any} */
const DEFAULTS = Object.freeze({
    fontFamily: 'system',
    fontSize: FONT_SIZE_DEFAULT,
    density: 'comfortable',
    palette: 'teal',
    accentColor: null,
    highContrast: false,
    homeCards: null, // null = all visible, original order
    layout: {
        leftPanel: true,
        rightPanel: true,
        bottomHud: true,
        statusBar: true,
        menuBar: true,
    },
    userPresets: [],
});
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
/** @type {any} */
let _state: any = { ...DEFAULTS, layout: { ...DEFAULTS.layout }, userPresets: [] };
let _initialized = false;
/** @type {any} */
let _fontLinkEl: any = null;
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Initialize customization from localStorage and apply to DOM.
 * Deve ser chamado ANTES de initHomeGrid() no boot.
 */
export function initCustomize() {
    if (_initialized)
        return;
    const raw = localStorage.getItem(STORAGE_KEY) || '';
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            _state = _validateAndMerge(parsed);
        }
        catch {
            console.warn('[ecbyts:customize] Invalid stored state, using defaults');
        }
    }
    applyCustomize();
    // Re-apply palette when theme changes (light<->dark)
    window.addEventListener('themeChanged', () => {
        _applyPalette();
        _applyAccentColor();
    });
    _initialized = true;
}
// ----------------------------------------------------------------
// GETTERS
// ----------------------------------------------------------------
/** @returns {Readonly<typeof DEFAULTS>} */
export function getCustomizeState() {
    return _state;
}
/** @returns {typeof DEFAULTS} Deep clone of defaults */
export function getDefaults() {
    return JSON.parse(JSON.stringify(DEFAULTS));
}
/** @returns {typeof PALETTE_DEFS} */
export function getPaletteDefs() {
    return PALETTE_DEFS;
}
/** @returns {typeof FONT_STACKS} */
export function getFontOptions() {
    return FONT_STACKS;
}
/** @returns {string[]} */
export function getValidDensities() {
    return [...VALID_DENSITIES];
}
/** @returns {string[]} */
export function getValidPalettes() {
    return [...VALID_PALETTES];
}
/**
 * Get visible and ordered card IDs for homeGrid.
 * Returns null if no customization (use default ACTION_CARDS).
 * @returns {Array<{id: string, visible: boolean, order: number}>|null}
 */
export function getHomeCardsConfig() {
    return _state.homeCards;
}
/**
 * Get layout defaults.
 * @returns {typeof DEFAULTS.layout}
 */
export function getLayoutDefaults() {
    return { ..._state.layout };
}
// ----------------------------------------------------------------
// MUTATIONS
// ----------------------------------------------------------------
/**
 * Set a single customization value and apply.
 * @param {string} key
 * @param {*} value
 */
export function setCustomizeSetting(key: any, value: any) {
    if (!(key in DEFAULTS))
        return;
    if (key === 'fontFamily' && !VALID_FONT_IDS.includes(value))
        return;
    if (key === 'fontSize')
        value = _clamp(Number(value) || FONT_SIZE_DEFAULT, FONT_SIZE_MIN, FONT_SIZE_MAX);
    if (key === 'density' && !VALID_DENSITIES.includes(value))
        return;
    if (key === 'palette' && !VALID_PALETTES.includes(value))
        return;
    if (key === 'accentColor' && value !== null && !_isValidHex(value))
        return;
    if (key === 'highContrast' && typeof value !== 'boolean')
        return;
    if (key === 'layout') {
        _state.layout = { ...DEFAULTS.layout, ...value };
    }
    else {
        _state[key] = value;
    }
    applyCustomize();
    _persist();
}
/**
 * Set home cards configuration.
 * @param {Array<{id: string, visible: boolean, order: number}>|null} config
 */
export function setHomeCards(config: any) {
    _state.homeCards = config;
    _persist();
}
/**
 * Reset all customization to defaults.
 */
export function resetCustomize() {
    _state = { ...DEFAULTS, layout: { ...DEFAULTS.layout }, userPresets: [] };
    localStorage.removeItem(STORAGE_KEY);
    _removeFontLink();
    applyCustomize();
}
// ----------------------------------------------------------------
// PRESETS
// ----------------------------------------------------------------
/**
 * Save current settings as a named preset.
 * @param {string} name
 * @returns {boolean}
 */
export function saveUserPreset(name: any) {
    if (!name || typeof name !== 'string')
        return false;
    if (_state.userPresets.length >= MAX_USER_PRESETS)
        return false;
    const snapshot = JSON.parse(JSON.stringify(_state));
    delete snapshot.userPresets; // dont nest presets
    _state.userPresets.push({ name: name.trim().slice(0, 50), settings: snapshot });
    _persist();
    return true;
}
/**
 * Load a user preset by index.
 * @param {number} index
 * @returns {boolean}
 */
export function loadUserPreset(index: any) {
    const preset = _state.userPresets[index];
    if (!preset)
        return false;
    const presets = _state.userPresets;
    const merged = _validateAndMerge(preset.settings);
    merged.userPresets = presets;
    _state = merged;
    applyCustomize();
    _persist();
    return true;
}
/**
 * Delete a user preset by index.
 * @param {number} index
 * @returns {boolean}
 */
export function deleteUserPreset(index: any) {
    if (index < 0 || index >= _state.userPresets.length)
        return false;
    _state.userPresets.splice(index, 1);
    _persist();
    return true;
}
// ----------------------------------------------------------------
// EXPORT / IMPORT
// ----------------------------------------------------------------
/**
 * Export current state as JSON string.
 * @returns {string}
 */
export function exportCustomize() {
    return JSON.stringify(_state, null, 2);
}
/**
 * Import settings from JSON string. Validates all values.
 * @param {string} json
 * @returns {{ ok: boolean, error?: string }}
 */
export function importCustomize(json: any) {
    try {
        const parsed = JSON.parse(json);
        if (!parsed || typeof parsed !== 'object') {
            return { ok: false, error: 'Invalid JSON structure' };
        }
        const validated = _validateAndMerge(parsed);
        // Clamp user presets
        if (validated.userPresets.length > MAX_USER_PRESETS) {
            validated.userPresets = validated.userPresets.slice(0, MAX_USER_PRESETS);
        }
        _state = validated;
        applyCustomize();
        _persist();
        return { ok: true };
    }
    catch (e: any) {
        return { ok: false, error: e?.message || 'Parse error' };
    }
}
// ----------------------------------------------------------------
// APPLICATION - Apply all CSS vars to DOM
// ----------------------------------------------------------------
/**
 * Apply all customization CSS vars to document root.
 * Chamado no boot e apos cada mudanca.
 */
export function applyCustomize() {
    _applyFont();
    _applyFontSize();
    _applyDensity();
    _applyPalette();
    _applyAccentColor();
    _applyHighContrast();
}
function _applyFont() {
    const root = document.documentElement;
    const id = _state.fontFamily;
    const stack = (FONT_STACKS as Record<string,any>)[id] || FONT_STACKS.system;
    root.style.setProperty('--font-ui', stack);
    // Load CDN font if needed
    if (id !== 'system' && (FONT_CDN_FAMILIES as Record<string,any>)[id]) {
        _loadFont(id);
    }
    else {
        _removeFontLink();
    }
}
function _applyFontSize() {
    const root = document.documentElement;
    const factor = _state.fontSize / FONT_SIZE_DEFAULT;
    for (const [varName, baseSize] of Object.entries(TYPE_SCALE)) {
        root.style.setProperty(varName, `${Math.round(baseSize * factor)}px`);
    }
}
function _applyDensity() {
    const root = document.documentElement;
    const factor = (DENSITY_FACTORS as Record<string,any>)[_state.density] || 1.0;
    for (const [varName, baseSize] of Object.entries(SPACE_SCALE)) {
        root.style.setProperty(varName, `${Math.round(baseSize * factor)}px`);
    }
}
function _applyPalette() {
    const root = document.documentElement;
    const def = (PALETTE_DEFS as Record<string,any>)[_state.palette];
    if (!def)
        return;
    // Only apply if not default teal (avoid overriding stylesheet values unnecessarily)
    if (_state.palette === 'teal') {
        // Remove inline overrides so stylesheet :root / [data-theme="dark"] take effect
        _removePaletteVars(root);
        return;
    }
    const isDark = _getEffectiveTheme() === 'dark';
    const shades = generatePalette(def.h, def.s, isDark);
    for (const [varName, value] of Object.entries(shades)) {
        root.style.setProperty(varName, value as string);
    }
}
function _applyAccentColor() {
    const root = document.documentElement;
    if (!_state.accentColor) {
        root.style.removeProperty('--accent-500');
        root.style.removeProperty('--accent-600');
        root.style.removeProperty('--accent-700');
        return;
    }
    root.style.setProperty('--accent-500', _state.accentColor);
    root.style.setProperty('--accent-600', _darkenHex(_state.accentColor, 12));
    root.style.setProperty('--accent-700', _darkenHex(_state.accentColor, 24));
}
function _removePaletteVars(root: any) {
    const vars = [
        '--primary-50',
        '--primary-100',
        '--primary-200',
        '--primary-300',
        '--primary-400',
        '--primary-500',
        '--primary-600',
        '--primary-700',
        '--primary-800',
        '--primary-900',
    ];
    for (const v of vars)
        root.style.removeProperty(v);
}
// ----------------------------------------------------------------
// PALETTE GENERATION
// ----------------------------------------------------------------
/**
 * Generate 10 shades (50-900) from hue and saturation.
 * @param {number} h Hue 0-360
 * @param {number} s Saturation 0-100
 * @param {boolean} isDark
 * @returns {Record<string, string>}
 */
export function generatePalette(h: any, s: any, isDark: any = false) {
    // Lightness stops for light mode (50=very light, 900=very dark)
    const lightStops = [95, 90, 80, 68, 56, 45, 38, 30, 22, 15];
    // For dark mode: adjust saturation and lightness for visibility
    const darkStops = [8, 12, 40, 40, 50, 55, 60, 68, 78, 90];
    const stops = isDark ? darkStops : lightStops;
    const satMults = isDark
        ? [0.3, 0.3, 0.6, 0.6, 0.7, 0.8, 0.8, 0.7, 0.5, 0.3]
        : [0.3, 0.4, 0.55, 0.65, 0.8, 1.0, 1.0, 0.95, 0.9, 0.8];
    const shadeKeys = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
    /** @type {Record<string, string>} */
    const result: any = {};
    for (let i = 0; i < shadeKeys.length; i++) {
        const sat = Math.round(s * satMults[i]!);
        const lig = stops[i];
        result[`--primary-${shadeKeys[i]}`] = `hsl(${h}, ${sat}%, ${lig}%)`;
    }
    return result;
}
// ----------------------------------------------------------------
// FONT CDN LOADING
// ----------------------------------------------------------------
function _loadFont(fontId: any) {
    const family = (FONT_CDN_FAMILIES as Record<string,any>)[fontId];
    if (!family)
        return;
    const href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
    // Already loaded this exact font?
    if (_fontLinkEl && _fontLinkEl.getAttribute('href') === href)
        return;
    _removeFontLink();
    const link = document.createElement('link');
    link.id = 'ecbyts-custom-font';
    link.rel = 'stylesheet';
    link.href = href;
    // Timeout: if CDN fails in 5s, remove and fallback to system
    const timer = setTimeout(() => {
        if (link.parentNode) {
            console.warn('[ecbyts:customize] Font CDN timeout, falling back to system');
            _removeFontLink();
        }
    }, 5000);
    link.onload = () => clearTimeout(timer);
    link.onerror = () => {
        clearTimeout(timer);
        console.warn('[ecbyts:customize] Font CDN error, falling back to system');
        _removeFontLink();
    };
    document.head.appendChild(link);
    _fontLinkEl = link;
}
function _removeFontLink() {
    if (_fontLinkEl) {
        _fontLinkEl.remove();
        _fontLinkEl = null;
    }
    const existing = document.getElementById('ecbyts-custom-font');
    if (existing)
        existing.remove();
}
// ----------------------------------------------------------------
// CONTRAST CHECK
// ----------------------------------------------------------------
/**
 * Calculate WCAG contrast ratio between two hex colors.
 * @param {string} hex1
 * @param {string} hex2
 * @returns {number} Ratio (1-21)
 */
export function contrastRatio(hex1: any, hex2: any) {
    const l1 = _relativeLuminance(hex1);
    const l2 = _relativeLuminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}
function _relativeLuminance(hex: any) {
    const rgb = _hexToRgb(hex);
    if (!rgb)
        return 0;
    const [r, g, b] = rgb.map((c: any) => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
function _persist() {
    if (isEphemeral())
        return;
    safeSetItem(STORAGE_KEY, JSON.stringify(_state));
}
function _validateAndMerge(parsed: any) {
    const result: any = { ...DEFAULTS, layout: { ...DEFAULTS.layout }, userPresets: [] };
    if (VALID_FONT_IDS.includes(parsed.fontFamily)) {
        result.fontFamily = parsed.fontFamily;
    }
    if (typeof parsed.fontSize === 'number') {
        result.fontSize = _clamp(Math.round(parsed.fontSize), FONT_SIZE_MIN, FONT_SIZE_MAX);
    }
    if (VALID_DENSITIES.includes(parsed.density)) {
        result.density = parsed.density;
    }
    if (VALID_PALETTES.includes(parsed.palette)) {
        result.palette = parsed.palette;
    }
    if (parsed.accentColor === null || _isValidHex(parsed.accentColor)) {
        result.accentColor = parsed.accentColor;
    }
    if (typeof parsed.highContrast === 'boolean') {
        result.highContrast = parsed.highContrast;
    }
    if (Array.isArray(parsed.homeCards)) {
        result.homeCards = parsed.homeCards
            .filter((c: any) => c && typeof c.id === 'string' && typeof c.visible === 'boolean' && typeof c.order === 'number')
            .map((c: any) => ({
            id: c.id,
            visible: !!c.visible,
            order: Number(c.order)
        }));
        if (result.homeCards.length === 0)
            result.homeCards = null;
    }
    if (parsed.layout && typeof parsed.layout === 'object') {
        for (const key of Object.keys(DEFAULTS.layout)) {
            if (typeof parsed.layout[key] === 'boolean') {
                result.layout[key] = parsed.layout[key];
            }
        }
    }
    if (Array.isArray(parsed.userPresets)) {
        result.userPresets = parsed.userPresets
            .filter((p: any) => p && typeof p.name === 'string' && p.settings && typeof p.settings === 'object')
            .slice(0, MAX_USER_PRESETS);
    }
    return result;
}
function _clamp(v: any, min: any, max: any) {
    return Math.max(min, Math.min(max, v));
}
function _isValidHex(val: any) {
    return typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val);
}
function _hexToRgb(hex: any) {
    if (!_isValidHex(hex))
        return null;
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
/**
 * Darken a hex color by a percentage.
 * @param {string} hex
 * @param {number} percent 0-100
 * @returns {string}
 */
function _darkenHex(hex: any, percent: any) {
    const rgb = _hexToRgb(hex);
    if (!rgb)
        return hex;
    const factor = 1 - percent / 100;
    const r = Math.round(rgb[0]! * factor);
    const g = Math.round(rgb[1]! * factor);
    const b = Math.round(rgb[2]! * factor);
    return `#${_toHex(r)}${_toHex(g)}${_toHex(b)}`;
}
function _toHex(n: any) {
    return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
}
function _applyHighContrast() {
    const root = document.documentElement;
    if (_state.highContrast) {
        root.setAttribute('data-high-contrast', 'true');
    }
    else {
        root.removeAttribute('data-high-contrast');
    }
}
function _getEffectiveTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark')
        return 'dark';
    if (attr === 'light')
        return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
