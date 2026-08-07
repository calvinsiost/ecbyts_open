// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// UI-STD-PALETTE-001 :: wire runtime — converte catálogo pure-logic em
// entries da Command Palette. Cada entry chama lazy `customize/manager.ts`
// (ou system theme handler) para aplicar a mudança.

import {
    UI_STANDARDIZATION_CATALOG,
    clampFontSize,
    isValidDensity,
    isValidPalette,
    isValidTheme,
    type UiStdCommandDescriptor,
} from './_uiStandardizationCommandsPure.js';

interface PaletteCommand {
    id: string;
    label: string;
    label_pt: string;
    category: string;
    handler: () => void;
    keywords?: string[];
}

let _initialized = false;

/** Lazy: customize manager getter (singleton import). */
async function _customizeMod(): Promise<any> {
    return import('../customize/manager.js');
}

/** Lazy: theme handler — tenta window.handleSetTheme primeiro. */
function _setTheme(value: string): void {
    if (!isValidTheme(value)) return;
    const win = (globalThis as any).window as any;
    if (typeof win?.handleSetTheme === 'function') {
        try { win.handleSetTheme(value); return; }
        catch (e: any) { console.debug('[ui-std:theme-win]', e?.message || e); }
    }
    // Fallback: tema via customize manager (se expuser)
    void _customizeMod()
        .then((m) => {
            if (typeof m.setCustomizeSetting === 'function') m.setCustomizeSetting('theme', value);
        })
        .catch((e: any) => console.debug('[ui-std:theme-mod]', e?.message || e));
}

/** Aplica densidade via setCustomizeSetting. */
async function _setDensity(value: string): Promise<void> {
    if (!isValidDensity(value)) return;
    try {
        const m = await _customizeMod();
        if (typeof m.setCustomizeSetting === 'function') m.setCustomizeSetting('density', value);
    } catch (e: any) {
        console.debug('[ui-std:density]', e?.message || e);
    }
}

/** Aplica paleta. */
async function _setPalette(value: string): Promise<void> {
    if (!isValidPalette(value)) return;
    try {
        const m = await _customizeMod();
        if (typeof m.setCustomizeSetting === 'function') m.setCustomizeSetting('palette', value);
    } catch (e: any) {
        console.debug('[ui-std:palette]', e?.message || e);
    }
}

/** Aumenta/diminui fontSize via delta clampado ao intervalo válido. */
async function _setFontSize(delta: number): Promise<void> {
    try {
        const m = await _customizeMod();
        if (typeof m.getCustomizeState !== 'function' || typeof m.setCustomizeSetting !== 'function') return;
        const cur = m.getCustomizeState();
        const currentSize = Number(cur?.fontSize) || 12;
        const next = clampFontSize(currentSize + delta);
        if (next !== currentSize) m.setCustomizeSetting('fontSize', next);
    } catch (e: any) {
        console.debug('[ui-std:fontSize]', e?.message || e);
    }
}

/** Abre modal de customização (delegando ao window.handleOpenCustomize). */
function _openCustomize(): void {
    const win = (globalThis as any).window as any;
    if (typeof win?.handleOpenCustomize === 'function') {
        try { win.handleOpenCustomize(); return; }
        catch (e: any) { console.debug('[ui-std:open-customize]', e?.message || e); }
    }
}

/** Reset completo dos customizes. */
async function _reset(): Promise<void> {
    try {
        const m = await _customizeMod();
        if (typeof m.resetCustomize === 'function') m.resetCustomize();
    } catch (e: any) {
        console.debug('[ui-std:reset]', e?.message || e);
    }
}

/** Resolve handler runtime para um descriptor do catálogo. */
function _handlerForDescriptor(desc: UiStdCommandDescriptor): () => void {
    const { action } = desc;
    switch (action.type) {
        case 'setDensity':
            return () => { void _setDensity(action.value); };
        case 'setPalette':
            return () => { void _setPalette(action.value); };
        case 'setTheme':
            return () => { _setTheme(action.value); };
        case 'setFontSize':
            return () => { void _setFontSize(action.delta); };
        case 'openCustomize':
            return () => { _openCustomize(); };
        case 'resetCustomize':
            return () => { void _reset(); };
        default:
            return () => {};
    }
}

/** Converte catálogo pure-logic em PaletteCommand[] runtime-ready. */
export function buildUiStandardizationCommands(): PaletteCommand[] {
    return UI_STANDARDIZATION_CATALOG.map((desc) => ({
        id: desc.id,
        label: desc.label,
        label_pt: desc.label_pt,
        category: desc.category,
        handler: _handlerForDescriptor(desc),
        keywords: [...desc.keywords],
    }));
}

/**
 * Registra todos os comandos UI standardization na Command Palette.
 * Idempotente — chamadas múltiplas reusam o registro existente do palette
 * (já dedupa por ID).
 */
export async function registerUiStandardizationCommands(): Promise<number> {
    if (_initialized) return UI_STANDARDIZATION_CATALOG.length;
    const cmds = buildUiStandardizationCommands();
    try {
        const win = (globalThis as any).window as any;
        if (typeof win?.registerPaletteCommands === 'function') {
            win.registerPaletteCommands(cmds);
            _initialized = true;
            return cmds.length;
        }
        const mod: any = await import('./commandPalette.js' as string);
        if (typeof mod.registerCommands === 'function') {
            mod.registerCommands(cmds);
            _initialized = true;
            return cmds.length;
        }
    } catch (e: any) {
        console.debug('[ui-std:register]', e?.message || e);
    }
    return 0;
}

/** Read-only export para tests. */
export { UI_STANDARDIZATION_CATALOG };
