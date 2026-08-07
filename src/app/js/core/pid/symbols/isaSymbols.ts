// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// ISA-5.1 SVG Symbol Library - MVP estrutural
// Biblioteca de simbolos P&ID em SVG inline baseados na norma ISA-5.1.

export type IsaAnchorType = 'in' | 'out' | 'bidirectional';

export interface IsaAnchor {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly type: IsaAnchorType;
}

export interface IsaSymbol {
    readonly viewBox: string;
    readonly svg: string;
    readonly anchors: readonly IsaAnchor[];
    readonly category: string;
    readonly defaultWidth: number;
    readonly defaultHeight: number;
}

/* ================================================================
   SYMBOL DEFINITIONS
   ================================================================ */

/**
 * Recursively freezes an object and all nested objects/arrays.
 * `as const` only gives compile-time readonly — runtime immutability
 * (Object.isFrozen at all levels) requires this. Frozen-catalog pattern
 * per CLAUDE.md (IP-protected core/ catalogs are immutable at runtime).
 */
function _deepFreeze<T>(obj: T): T {
    if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
        Object.values(obj as Record<string, unknown>).forEach((v) => _deepFreeze(v));
        Object.freeze(obj);
    }
    return obj;
}

export const ISA_SYMBOLS = _deepFreeze({
    // Equipment
    pump_centrifugal: {
        viewBox: '0 0 64 64',
        svg: `<circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 32h24M32 20v24" fill="none" stroke="currentColor" stroke-width="2"/>`,
        anchors: [
            { id: 'inlet', x: 8, y: 32, type: 'in' as const },
            { id: 'outlet', x: 56, y: 32, type: 'out' as const },
        ],
        category: 'equipment',
        defaultWidth: 64,
        defaultHeight: 64,
    },

    vessel_vertical: {
        viewBox: '0 0 48 80',
        svg: `<ellipse cx="24" cy="8" rx="20" ry="8" fill="none" stroke="currentColor" stroke-width="2"/><ellipse cx="24" cy="72" rx="20" ry="8" fill="none" stroke="currentColor" stroke-width="2"/><line x1="4" y1="8" x2="4" y2="72" stroke="currentColor" stroke-width="2"/><line x1="44" y1="8" x2="44" y2="72" stroke="currentColor" stroke-width="2"/>`,
        anchors: [
            { id: 'top', x: 24, y: 0, type: 'bidirectional' as const },
            { id: 'bottom', x: 24, y: 80, type: 'bidirectional' as const },
            { id: 'left', x: 4, y: 40, type: 'bidirectional' as const },
            { id: 'right', x: 44, y: 40, type: 'bidirectional' as const },
        ],
        category: 'equipment',
        defaultWidth: 48,
        defaultHeight: 80,
    },

    heat_exchanger: {
        viewBox: '0 0 80 48',
        svg: `<rect x="4" y="4" width="72" height="40" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><line x1="20" y1="4" x2="20" y2="44" stroke="currentColor" stroke-width="1.5"/><line x1="36" y1="4" x2="36" y2="44" stroke="currentColor" stroke-width="1.5"/><line x1="52" y1="4" x2="52" y2="44" stroke="currentColor" stroke-width="1.5"/><line x1="68" y1="4" x2="68" y2="44" stroke="currentColor" stroke-width="1.5"/>`,
        anchors: [
            { id: 'inlet', x: 0, y: 24, type: 'in' as const },
            { id: 'outlet', x: 80, y: 24, type: 'out' as const },
            { id: 'top', x: 40, y: 0, type: 'bidirectional' as const },
            { id: 'bottom', x: 40, y: 48, type: 'bidirectional' as const },
        ],
        category: 'equipment',
        defaultWidth: 80,
        defaultHeight: 48,
    },

    // Valves
    valve_gate: {
        viewBox: '0 0 48 32',
        svg: `<polygon points="4,4 24,16 4,28" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="44,4 24,16 44,28" fill="none" stroke="currentColor" stroke-width="2"/><line x1="4" y1="16" x2="44" y2="16" stroke="currentColor" stroke-width="2"/>`,
        anchors: [
            { id: 'inlet', x: 0, y: 16, type: 'in' as const },
            { id: 'outlet', x: 48, y: 16, type: 'out' as const },
        ],
        category: 'valves',
        defaultWidth: 48,
        defaultHeight: 32,
    },

    valve_globe: {
        viewBox: '0 0 48 40',
        svg: `<polygon points="4,6 24,20 4,34" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="44,6 24,20 44,34" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="20" r="6" fill="none" stroke="currentColor" stroke-width="2"/><line x1="4" y1="20" x2="44" y2="20" stroke="currentColor" stroke-width="2"/>`,
        anchors: [
            { id: 'inlet', x: 0, y: 20, type: 'in' as const },
            { id: 'outlet', x: 48, y: 20, type: 'out' as const },
        ],
        category: 'valves',
        defaultWidth: 48,
        defaultHeight: 40,
    },

    valve_control: {
        viewBox: '0 0 48 48',
        svg: `<polygon points="4,10 24,24 4,38" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="44,10 24,24 44,38" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="24" r="6" fill="none" stroke="currentColor" stroke-width="2"/><line x1="24" y1="4" x2="24" y2="14" stroke="currentColor" stroke-width="2"/><line x1="24" y1="34" x2="24" y2="44" stroke="currentColor" stroke-width="2"/>`,
        anchors: [
            { id: 'inlet', x: 0, y: 24, type: 'in' as const },
            { id: 'outlet', x: 48, y: 24, type: 'out' as const },
            { id: 'top', x: 24, y: 0, type: 'bidirectional' as const },
            { id: 'bottom', x: 24, y: 48, type: 'bidirectional' as const },
        ],
        category: 'valves',
        defaultWidth: 48,
        defaultHeight: 48,
    },

    // Instruments
    flow_transmitter: {
        viewBox: '0 0 48 48',
        svg: `<circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="2"/><line x1="16" y1="24" x2="32" y2="24" stroke="currentColor" stroke-width="2"/><polyline points="16,30 20,24 24,30 28,24 32,30" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
        anchors: [
            { id: 'center', x: 24, y: 24, type: 'bidirectional' as const },
            { id: 'top', x: 24, y: 0, type: 'bidirectional' as const },
            { id: 'bottom', x: 24, y: 48, type: 'bidirectional' as const },
        ],
        category: 'instruments',
        defaultWidth: 48,
        defaultHeight: 48,
    },

    pressure_gauge: {
        viewBox: '0 0 40 48',
        svg: `<circle cx="20" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="2"/><line x1="20" y1="24" x2="20" y2="14" stroke="currentColor" stroke-width="2"/><line x1="20" y1="24" x2="28" y2="28" stroke="currentColor" stroke-width="2"/><line x1="20" y1="40" x2="20" y2="48" stroke="currentColor" stroke-width="2"/>`,
        anchors: [
            { id: 'center', x: 20, y: 24, type: 'bidirectional' as const },
            { id: 'bottom', x: 20, y: 48, type: 'bidirectional' as const },
        ],
        category: 'instruments',
        defaultWidth: 40,
        defaultHeight: 48,
    },

    temperature_controller: {
        viewBox: '0 0 48 48',
        svg: `<circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="2"/><line x1="24" y1="12" x2="24" y2="20" stroke="currentColor" stroke-width="2"/><line x1="18" y1="26" x2="30" y2="26" stroke="currentColor" stroke-width="2"/><line x1="20" y1="30" x2="28" y2="30" stroke="currentColor" stroke-width="2"/>`,
        anchors: [
            { id: 'center', x: 24, y: 24, type: 'bidirectional' as const },
            { id: 'top', x: 24, y: 0, type: 'bidirectional' as const },
            { id: 'bottom', x: 24, y: 48, type: 'bidirectional' as const },
        ],
        category: 'instruments',
        defaultWidth: 48,
        defaultHeight: 48,
    },

    // Lines
    process_line: {
        viewBox: '0 0 64 16',
        svg: `<line x1="0" y1="8" x2="64" y2="8" stroke="currentColor" stroke-width="2"/>`,
        anchors: [
            { id: 'start', x: 0, y: 8, type: 'out' as const },
            { id: 'end', x: 64, y: 8, type: 'in' as const },
        ],
        category: 'lines',
        defaultWidth: 64,
        defaultHeight: 16,
    },

    instrument_signal: {
        viewBox: '0 0 64 16',
        svg: `<line x1="0" y1="8" x2="64" y2="8" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/>`,
        anchors: [
            { id: 'start', x: 0, y: 8, type: 'out' as const },
            { id: 'end', x: 64, y: 8, type: 'in' as const },
        ],
        category: 'lines',
        defaultWidth: 64,
        defaultHeight: 16,
    },
} as const);

export type IsaSymbolsMap = typeof ISA_SYMBOLS;
export type IsaSymbolKey = keyof IsaSymbolsMap;

/* ================================================================
   API FUNCTIONS
   ================================================================ */

/**
 * Returns a symbol definition by ID.
 * @param {string} symbolId
 * @returns {Readonly<IsaSymbol>|undefined}
 */
export function getSymbol(symbolId: string): Readonly<IsaSymbol> | undefined {
    return (ISA_SYMBOLS as unknown as Record<string, Readonly<IsaSymbol>>)[symbolId];
}

/**
 * Returns all symbols in a given category.
 * @param {string} category
 * @returns {Array<Readonly<IsaSymbol> & {id:string}>}
 */
export function getSymbolsByCategory(category: string): Array<Readonly<IsaSymbol> & { id: string }> {
    return Object.entries(ISA_SYMBOLS)
        .filter(([, sym]) => sym.category === category)
        .map(([id, sym]) => ({ id, ...sym }));
}

/**
 * Renders an SVG symbol into a DOM container.
 * @param {string} symbolId
 * @param {HTMLElement} container
 * @param {{width?:number, height?:number, className?:string}} [options]
 * @returns {SVGSVGElement|undefined}
 */
export function renderSymbol(
    symbolId: string,
    container: HTMLElement,
    options: { width?: number; height?: number; className?: string } = {},
): SVGSVGElement | undefined {
    const sym = getSymbol(symbolId);
    if (!sym) {
        console.debug('[isaSymbols]', `Symbol not found: ${symbolId}`);
        return undefined;
    }
    const { width = sym.defaultWidth, height = sym.defaultHeight, className = '' } = options;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', sym.viewBox);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('class', `isa-symbol ${className}`.trim());
    svg.setAttribute('data-symbol-id', symbolId);
    svg.innerHTML = sym.svg;
    container.appendChild(svg);
    return svg;
}