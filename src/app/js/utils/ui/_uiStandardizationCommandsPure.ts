// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// UI-STD-PALETTE-001 :: pure-logic do catálogo canônico de comandos de
// padronização de UI para a Command Palette (Ctrl+K). Sem DOM/timer/io.

/** Categorias canônicas da palette para UI standardization. */
export const UI_STD_CATEGORY = 'Padronização UI';

/** Densidades válidas conforme `customize/manager.ts:VALID_DENSITIES`. */
export const VALID_DENSITIES = Object.freeze(['compact', 'comfortable', 'spacious'] as const);
export type Density = (typeof VALID_DENSITIES)[number];

/** Paletas válidas conforme `customize/manager.ts:VALID_PALETTES`. */
export const VALID_PALETTES = Object.freeze(['teal', 'ocean', 'forest', 'amber', 'slate'] as const);
export type PaletteId = (typeof VALID_PALETTES)[number];

/** Limites de font size (do customize manager). */
export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 16;
export const FONT_SIZE_DEFAULT = 12;

/** Temas válidos. */
export const VALID_THEMES = Object.freeze(['light', 'dark', 'system'] as const);
export type ThemePref = (typeof VALID_THEMES)[number];

/** Descritor de comando exportável para a palette. */
export interface UiStdCommandDescriptor {
    /** ID estável `ui-std.<sub>` */
    id: string;
    /** Label en-US */
    label: string;
    /** Label pt-BR */
    label_pt: string;
    /** Categoria fixa = UI_STD_CATEGORY */
    category: string;
    /** Palavras-chave para fuzzy search (lowercase, sem acentos quando possível) */
    keywords: string[];
    /** Tipo de ação que o handler runtime deve executar */
    action:
        | { type: 'setDensity'; value: Density }
        | { type: 'setPalette'; value: PaletteId }
        | { type: 'setTheme'; value: ThemePref }
        | { type: 'setFontSize'; delta: number }
        | { type: 'resetCustomize' }
        | { type: 'openCustomize' };
}

/** Clampa fontSize ao intervalo válido. */
export function clampFontSize(n: number): number {
    if (!Number.isFinite(n)) return FONT_SIZE_DEFAULT;
    return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)));
}

/** True se valor é density canônica. */
export function isValidDensity(v: string): v is Density {
    return (VALID_DENSITIES as readonly string[]).includes(v);
}

/** True se valor é paleta canônica. */
export function isValidPalette(v: string): v is PaletteId {
    return (VALID_PALETTES as readonly string[]).includes(v);
}

/** True se valor é tema canônico. */
export function isValidTheme(v: string): v is ThemePref {
    return (VALID_THEMES as readonly string[]).includes(v);
}

/**
 * Catálogo canônico de comandos de UI standardization para a palette.
 * Frozen — não modificar em runtime; estender via novo arquivo.
 */
export const UI_STANDARDIZATION_CATALOG: ReadonlyArray<UiStdCommandDescriptor> = Object.freeze([
    // Densidade
    {
        id: 'ui-std.density.compact',
        label: 'Density: Compact',
        label_pt: 'Densidade: Compacta',
        category: UI_STD_CATEGORY,
        keywords: ['densidade', 'compact', 'compacta', 'apertado', 'denso'],
        action: { type: 'setDensity', value: 'compact' },
    },
    {
        id: 'ui-std.density.comfortable',
        label: 'Density: Comfortable (default)',
        label_pt: 'Densidade: Confortável (padrão)',
        category: UI_STD_CATEGORY,
        keywords: ['densidade', 'comfortable', 'confortavel', 'padrao', 'default'],
        action: { type: 'setDensity', value: 'comfortable' },
    },
    {
        id: 'ui-std.density.spacious',
        label: 'Density: Spacious',
        label_pt: 'Densidade: Espaçosa',
        category: UI_STD_CATEGORY,
        keywords: ['densidade', 'spacious', 'espacoso', 'espacosa', 'amplo'],
        action: { type: 'setDensity', value: 'spacious' },
    },

    // Tamanho da fonte
    {
        id: 'ui-std.font.increase',
        label: 'Font size: increase',
        label_pt: 'Fonte: aumentar',
        category: UI_STD_CATEGORY,
        keywords: ['fonte', 'font', 'maior', 'aumentar', 'zoom'],
        action: { type: 'setFontSize', delta: +1 },
    },
    {
        id: 'ui-std.font.decrease',
        label: 'Font size: decrease',
        label_pt: 'Fonte: diminuir',
        category: UI_STD_CATEGORY,
        keywords: ['fonte', 'font', 'menor', 'diminuir', 'zoom'],
        action: { type: 'setFontSize', delta: -1 },
    },

    // Paleta de cores
    {
        id: 'ui-std.palette.teal',
        label: 'Palette: Teal Petroleum',
        label_pt: 'Paleta: Petróleo Teal',
        category: UI_STD_CATEGORY,
        keywords: ['paleta', 'cor', 'teal', 'petroleo', 'azul'],
        action: { type: 'setPalette', value: 'teal' },
    },
    {
        id: 'ui-std.palette.ocean',
        label: 'Palette: Ocean Blue',
        label_pt: 'Paleta: Azul Oceano',
        category: UI_STD_CATEGORY,
        keywords: ['paleta', 'cor', 'ocean', 'azul', 'blue'],
        action: { type: 'setPalette', value: 'ocean' },
    },
    {
        id: 'ui-std.palette.forest',
        label: 'Palette: Forest Green',
        label_pt: 'Paleta: Verde Floresta',
        category: UI_STD_CATEGORY,
        keywords: ['paleta', 'cor', 'forest', 'verde', 'green'],
        action: { type: 'setPalette', value: 'forest' },
    },
    {
        id: 'ui-std.palette.amber',
        label: 'Palette: Warm Amber',
        label_pt: 'Paleta: Âmbar Quente',
        category: UI_STD_CATEGORY,
        keywords: ['paleta', 'cor', 'amber', 'ambar', 'laranja', 'amarelo'],
        action: { type: 'setPalette', value: 'amber' },
    },
    {
        id: 'ui-std.palette.slate',
        label: 'Palette: Slate Gray',
        label_pt: 'Paleta: Cinza Ardósia',
        category: UI_STD_CATEGORY,
        keywords: ['paleta', 'cor', 'slate', 'cinza', 'gray', 'neutro'],
        action: { type: 'setPalette', value: 'slate' },
    },

    // Tema
    {
        id: 'ui-std.theme.dark',
        label: 'Theme: Dark',
        label_pt: 'Tema: Escuro',
        category: UI_STD_CATEGORY,
        keywords: ['tema', 'dark', 'escuro', 'noite'],
        action: { type: 'setTheme', value: 'dark' },
    },
    {
        id: 'ui-std.theme.light',
        label: 'Theme: Light',
        label_pt: 'Tema: Claro',
        category: UI_STD_CATEGORY,
        keywords: ['tema', 'light', 'claro', 'dia'],
        action: { type: 'setTheme', value: 'light' },
    },
    {
        id: 'ui-std.theme.system',
        label: 'Theme: Follow system',
        label_pt: 'Tema: Seguir sistema',
        category: UI_STD_CATEGORY,
        keywords: ['tema', 'system', 'sistema', 'auto'],
        action: { type: 'setTheme', value: 'system' },
    },

    // Reset / open modal
    {
        id: 'ui-std.open-customize',
        label: 'Open UI customization modal',
        label_pt: 'Abrir modal de personalização da UI',
        category: UI_STD_CATEGORY,
        keywords: ['customizar', 'personalizar', 'config', 'modal', 'ui'],
        action: { type: 'openCustomize' },
    },
    {
        id: 'ui-std.reset',
        label: 'Reset UI to defaults',
        label_pt: 'Restaurar UI ao padrão',
        category: UI_STD_CATEGORY,
        keywords: ['reset', 'restaurar', 'padrao', 'default', 'limpar'],
        action: { type: 'resetCustomize' },
    },
]);

/** Total de comandos do catálogo (estável p/ asserts em tests). */
export const UI_STANDARDIZATION_CATALOG_SIZE = UI_STANDARDIZATION_CATALOG.length;

/** Resolve o catálogo por categoria (utility p/ filtros). */
export function getCommandsByCategory(category: string): readonly UiStdCommandDescriptor[] {
    return UI_STANDARDIZATION_CATALOG.filter((c) => c.category === category);
}

/** Resolve por ID (null se desconhecido). */
export function getCommandById(id: string): UiStdCommandDescriptor | null {
    return UI_STANDARDIZATION_CATALOG.find((c) => c.id === id) || null;
}
