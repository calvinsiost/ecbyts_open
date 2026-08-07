// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// Symbol Palette - Painel de paleta de simbolos P&ID ISA-5.1

import { getSymbolsByCategory } from '../../../core/pid/symbols/isaSymbols.js';

const CATEGORY_ORDER = ['equipment', 'valves', 'instruments', 'lines'];

const CATEGORY_LABEL_KEYS = {
    equipment: 'pidDiagram.category.equipment',
    valves: 'pidDiagram.category.valves',
    instruments: 'pidDiagram.category.instruments',
    lines: 'pidDiagram.category.lines',
};

let _paletteEl: HTMLElement | null = null;

/**
 * Build the palette HTML structure (lazy).
 * @param {Function} onSelect
 * @returns {HTMLElement}
 */
export function SymbolPalette({ onSelect }: any): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'pid-symbol-palette';

    const header = document.createElement('div');
    header.className = 'pid-palette-header';
    header.textContent = typeof window.__ === 'function' ? window.__('pidDiagram.symbolPalette') : 'Symbol Palette';
    wrap.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'pid-palette-grid';
    wrap.appendChild(grid);

    for (const cat of CATEGORY_ORDER) {
        const catHeader = document.createElement('div');
        catHeader.className = 'pid-palette-category';
        const labelKey = (CATEGORY_LABEL_KEYS as any)[cat];
        catHeader.textContent = typeof window.__ === 'function' && labelKey ? window.__(labelKey) : cat;
        grid.appendChild(catHeader);

        const items = getSymbolsByCategory(cat);
        for (const item of items) {
            const btn = document.createElement('button');
            btn.className = 'pid-palette-item';
            btn.setAttribute('data-symbol-id', item.id);
            btn.title = item.id;

            const svgWrap = document.createElement('div');
            svgWrap.className = 'pid-palette-icon';
            const ns = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(ns, 'svg');
            svg.setAttribute('viewBox', item.viewBox);
            svg.setAttribute('width', '40');
            svg.setAttribute('height', '40');
            svg.innerHTML = item.svg;
            svgWrap.appendChild(svg);
            btn.appendChild(svgWrap);

            btn.addEventListener('click', () => {
                if (typeof onSelect === 'function') onSelect(item.id);
            });
            grid.appendChild(btn);
        }
    }

    _paletteEl = wrap;
    return wrap;
}

/**
 * Render the symbol palette into a container.
 * @param {HTMLElement} container
 * @param {Function} onSelect
 * @returns {any}
 */
export function renderSymbolPalette(container: HTMLElement, onSelect: Function): any {
    if (!container) {
        console.debug('[symbolPalette]', 'Container is required');
        return null;
    }
    container.innerHTML = '';
    const palette = SymbolPalette({ onSelect });
    container.appendChild(palette);
    return palette;
}
