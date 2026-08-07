// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// PidCanvas - SVG canvas shell para diagramas P&ID

import { getSymbol } from '../symbols/isaSymbols.js';

let _nodeCounter = 0;

/**
 * P&ID Canvas manager.
 */
export function PidCanvas(container: HTMLElement) {
    if (!container) {
        throw new Error('PidCanvas requires a container element');
    }

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'pid-canvas');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');

    const gridPattern = document.createElementNS(ns, 'pattern');
    gridPattern.setAttribute('id', 'pid-grid');
    gridPattern.setAttribute('width', '20');
    gridPattern.setAttribute('height', '20');
    gridPattern.setAttribute('patternUnits', 'userSpaceOnUse');
    const gridDot = document.createElementNS(ns, 'circle');
    gridDot.setAttribute('cx', '1');
    gridDot.setAttribute('cy', '1');
    gridDot.setAttribute('r', '0.5');
    gridDot.setAttribute('fill', 'var(--pid-grid-color, #2b3c56)');
    gridPattern.appendChild(gridDot);
    const defs = document.createElementNS(ns, 'defs');
    defs.appendChild(gridPattern);
    svg.appendChild(defs);

    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', 'url(#pid-grid)');
    svg.appendChild(bg);

    const nodeLayer = document.createElementNS(ns, 'g');
    nodeLayer.setAttribute('class', 'pid-node-layer');
    svg.appendChild(nodeLayer);

    container.innerHTML = '';
    container.appendChild(svg);

    const nodes = new Map();

    return {
        svg,
        nodeLayer,

        /**
         * Add a symbol node to the canvas.
         * @returns nodeId or null if symbol unknown
         */
        addNode(symbolId: string, x: number, y: number): string | null {
            const sym = getSymbol(symbolId);
            if (!sym) {
                console.debug('[pidCanvas]', `Unknown symbol: ${symbolId}`);
                return null;
            }
            const nodeId = `pid-node-${++_nodeCounter}`;
            const g = document.createElementNS(ns, 'g');
            g.setAttribute('class', 'pid-node');
            g.setAttribute('data-node-id', nodeId);
            g.setAttribute('transform', `translate(${x}, ${y})`);

            const foreign = document.createElementNS(ns, 'foreignObject');
            foreign.setAttribute('width', String(sym.defaultWidth));
            foreign.setAttribute('height', String(sym.defaultHeight));
            const div = document.createElement('div');
            div.style.width = `${sym.defaultWidth}px`;
            div.style.height = `${sym.defaultHeight}px`;
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'center';

            const innerSvg = document.createElementNS(ns, 'svg');
            innerSvg.setAttribute('viewBox', sym.viewBox);
            innerSvg.setAttribute('width', '100%');
            innerSvg.setAttribute('height', '100%');
            innerSvg.innerHTML = sym.svg;
            div.appendChild(innerSvg);
            foreign.appendChild(div);
            g.appendChild(foreign);

            nodeLayer.appendChild(g);
            nodes.set(nodeId, { id: nodeId, symbolId, x, y, element: g });
            return nodeId;
        },

        /**
         * Remove a node by ID.
         */
        removeNode(nodeId: string) {
            const node = nodes.get(nodeId);
            if (node && node.element) {
                node.element.remove();
                nodes.delete(nodeId);
            }
        },

        /**
         * Clear all nodes.
         */
        clear() {
            nodeLayer.innerHTML = '';
            nodes.clear();
        },

        /**
         * Get all nodes.
         */
        getNodes(): Array<object> {
            return Array.from(nodes.values());
        },
    };
}

/**
 * Factory: create a PidCanvas instance.
 */
export function createPidCanvas(container: HTMLElement): object {
    return PidCanvas(container);
}
