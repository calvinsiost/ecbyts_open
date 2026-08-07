// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CANVAS ENGINE — P&ID Diagram Editor Core
   Motor Canvas 2D para edicao de diagramas tecnicos P&ID.

   Responsabilidades:
   - Criar e gerenciar canvas 2D com pan/zoom
   - Adicionar/remover simbolos e conexoes
   - Selecao e exclusao de elementos
   - Exportacao PNG/SVG
   - Serializacao/desserializacao do estado do diagrama

   Referencia: ADR-004, ISA S5.1
   ================================================================ */

import { PID_SYMBOLS, drawSymbol } from './pidSymbols.js';
import { escapeHtml } from '../../utils/helpers/html.js';
import { createLogger } from '../../utils/helpers/logger.js';
import { applyMenuA11y } from '../../utils/ui/contextMenuHelpers.js';

const log = createLogger('DiagramEngine');

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;
const ZOOM_STEP = 0.1;
const GRID_SIZE = 20;
const GRID_COLOR = '#e0e0e0';
const BG_COLOR = '#fafafa';
const CONN_COLOR = '#555555';
const CONN_SIGNAL_COLOR = '#888888';
const SELECT_BOX_FILL = 'rgba(68, 136, 255, 0.15)';
const SELECT_BOX_STROKE = '#4488ff';
const MAX_HISTORY = 50;
const CONTEXT_MENU_CLASS = 'pid-context-menu';

// ----------------------------------------------------------------
// ID GENERATOR
// ----------------------------------------------------------------

let _idCounter = 0;

/**
 * Generates a unique element ID.
 * Gera um ID unico para elemento do diagrama.
 *
 * @param {string} prefix
 * @returns {string}
 */
function genId(prefix: string = 'el'): string {
    return `${prefix}-${Date.now().toString(36)}-${(++_idCounter).toString(36)}`;
}

// ----------------------------------------------------------------
// CANVAS ENGINE FACTORY
// ----------------------------------------------------------------

/**
 * Creates a diagram canvas engine with pan/zoom and P&ID symbol support.
 * Cria um motor canvas de diagrama com pan/zoom e suporte a simbolos P&ID.
 *
 * @param {HTMLElement} container - DOM element to mount the canvas in
 * @param {object} [options]
 * @param {number} [options.width] - Canvas width (default: container width)
 * @param {number} [options.height] - Canvas height (default: container height)
 * @returns {object} Engine API
 */
export function createDiagramCanvas(
    container: HTMLElement,
    options: { width?: number; height?: number } = {},
): object {
    if (!container) {
        throw new Error('DiagramEngine: container is required');
    }

    // --- State ---
    const elements: any[] = []; // {id, type, x, y, w, h, props}
    const connections: any[] = []; // {id, fromId, toId, type}
    const selectedIds: Set<any> = new Set();
    let zoom = 1.0;
    let panX = 0;
    let panY = 0;
    let _isPanning = false;
    let _panStartX = 0;
    let _panStartY = 0;

    // Drag state
    let _isDragging = false;
    let _dragStartWX = 0;
    let _dragStartWY = 0;
    const _dragOrigins: Map<string, { x: number; y: number }> = new Map();

    // Selection box state (shift+drag on empty space)
    let _isSelectBox = false;
    let _selectBoxStart = { x: 0, y: 0 };
    let _selectBoxEnd = { x: 0, y: 0 };

    // History stacks
    const _undoStack: any[] = [];
    const _redoStack: any[] = [];

    // Context menu DOM ref
    let _ctxMenu: any = null;

    // --- Canvas setup ---
    const canvas = document.createElement('canvas');
    const w = options.width || container.clientWidth || 800;
    const h = options.height || container.clientHeight || 600;
    canvas.width = w;
    canvas.height = h;
    canvas.style.display = 'block';
    canvas.style.cursor = 'default';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

    log.info(`Canvas created: ${w}x${h}`);

    // ----------------------------------------------------------------
    // COORDINATE TRANSFORMS
    // ----------------------------------------------------------------

    /**
     * Converts screen (mouse) coordinates to diagram (world) coordinates.
     * Converte coordenadas de tela para coordenadas do diagrama.
     * @param {number} sx
     * @param {number} sy
     */
    function screenToWorld(sx: number, sy: number) {
        return {
            x: (sx - panX) / zoom,
            y: (sy - panY) / zoom,
        };
    }

    // ----------------------------------------------------------------
    // RENDERING
    // ----------------------------------------------------------------

    /**
     * Renders the entire diagram: background, grid, elements, connections.
     * Renderiza o diagrama completo: fundo, grade, elementos, conexoes.
     */
    function render() {
        ctx.save();
        // Clear
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Apply transform
        ctx.translate(panX, panY);
        ctx.scale(zoom, zoom);

        // Grid
        _drawGrid();

        // Connections (behind elements)
        for (const conn of connections) {
            _drawConnection(conn);
        }

        // Elements
        for (const el of elements) {
            drawSymbol(ctx, el.type, el.x, el.y, el.w, el.h, selectedIds.has(el.id), el.props);
        }

        // Selection box overlay
        if (_isSelectBox) {
            _drawSelectBox();
        }

        ctx.restore();
    }

    /**
     * Draws the rectangular selection box overlay.
     * Desenha o retangulo de selecao multipla.
     */
    function _drawSelectBox() {
        const x = Math.min(_selectBoxStart.x, _selectBoxEnd.x);
        const y = Math.min(_selectBoxStart.y, _selectBoxEnd.y);
        const w = Math.abs(_selectBoxEnd.x - _selectBoxStart.x);
        const h = Math.abs(_selectBoxEnd.y - _selectBoxStart.y);
        ctx.save();
        ctx.fillStyle = SELECT_BOX_FILL;
        ctx.strokeStyle = SELECT_BOX_STROKE;
        ctx.lineWidth = 1 / zoom;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
    }

    /**
     * Draws the background grid.
     * Desenha a grade de fundo para alinhamento visual.
     */
    function _drawGrid() {
        ctx.save();
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 0.5 / zoom;
        const visW = canvas.width / zoom;
        const visH = canvas.height / zoom;
        const startX = Math.floor(-panX / zoom / GRID_SIZE) * GRID_SIZE;
        const startY = Math.floor(-panY / zoom / GRID_SIZE) * GRID_SIZE;
        for (let gx = startX; gx < startX + visW + GRID_SIZE; gx += GRID_SIZE) {
            ctx.beginPath();
            ctx.moveTo(gx, startY);
            ctx.lineTo(gx, startY + visH + GRID_SIZE);
            ctx.stroke();
        }
        for (let gy = startY; gy < startY + visH + GRID_SIZE; gy += GRID_SIZE) {
            ctx.beginPath();
            ctx.moveTo(startX, gy);
            ctx.lineTo(startX + visW + GRID_SIZE, gy);
            ctx.stroke();
        }
        ctx.restore();
    }

    /**
     * Draws a connection line between two elements.
     * Desenha uma linha de conexao entre dois elementos.
     */
    /** @param {any} conn */
    function _drawConnection(conn: any) {
        const from = elements.find((e) => e.id === conn.fromId);
        const to = elements.find((e) => e.id === conn.toId);
        if (!from || !to) return;

        const x1 = from.x + from.w / 2;
        const y1 = from.y + from.h / 2;
        const x2 = to.x + to.w / 2;
        const y2 = to.y + to.h / 2;

        ctx.save();
        ctx.lineWidth = conn.type === 'signal' ? 1.5 : 2;
        ctx.strokeStyle = conn.type === 'signal' ? CONN_SIGNAL_COLOR : CONN_COLOR;
        if (conn.type === 'signal') {
            ctx.setLineDash([6, 4]);
        }
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    // ----------------------------------------------------------------
    // ELEMENT MANAGEMENT
    // ----------------------------------------------------------------

    /**
     * Adds a P&ID symbol to the diagram.
     * Adiciona um simbolo P&ID ao diagrama.
     *
     * @param {string} type - Symbol type (e.g. 'valve', 'pump')
     * @param {number} x - X position in world coordinates
     * @param {number} y - Y position in world coordinates
     * @param {object} [props] - Additional properties (label, tag, fill, stroke)
     * @returns {{id: string, type: string, bounds: {x: number, y: number, w: number, h: number}}|null}
     */
    function addSymbol(
        type: string,
        x: number,
        y: number,
        props: object = {},
    ): { id: string; type: string; bounds: { x: number; y: number; w: number; h: number } } | null {
        const sym = PID_SYMBOLS.get(type);
        if (!sym) {
            log.warn(`Unknown symbol type: ${type}`);
            return null;
        }
        _pushHistory();
        const _props = props as any;
        const el = {
            id: genId('sym'),
            type,
            x,
            y,
            w: _props.w || sym.defaultW,
            h: _props.h || sym.defaultH,
            props: { ...props },
        };
        elements.push(el);
        render();
        log.info(`Symbol added: ${type} at (${x}, ${y})`);
        return { id: el.id, type: el.type, bounds: { x: el.x, y: el.y, w: el.w, h: el.h } };
    }

    /**
     * Adds a connection (pipe or signal) between two elements.
     * Adiciona uma conexao (tubulacao ou sinal) entre dois elementos.
     *
     * @param {string} fromId - Source element ID
     * @param {string} toId - Target element ID
     * @param {string} [type='pipe'] - Connection type: 'pipe' or 'signal'
     * @returns {{id: string, fromId: string, toId: string, type: string}|null}
     */
    function addConnection(
        fromId: string,
        toId: string,
        type: string = 'pipe',
    ): { id: string; fromId: string; toId: string; type: string } | null {
        if (!elements.find((e) => e.id === fromId)) {
            log.warn(`Connection source not found: ${fromId}`);
            return null;
        }
        if (!elements.find((e) => e.id === toId)) {
            log.warn(`Connection target not found: ${toId}`);
            return null;
        }
        if (fromId === toId) {
            log.warn('Cannot connect element to itself');
            return null;
        }
        _pushHistory();
        const conn = { id: genId('conn'), fromId, toId, type };
        connections.push(conn);
        render();
        log.info(`Connection added: ${fromId} -> ${toId} (${type})`);
        return { ...conn };
    }

    // ----------------------------------------------------------------
    // SELECTION
    // ----------------------------------------------------------------

    /**
     * Selects an element by ID (replaces current selection).
     * Seleciona um elemento pelo ID (substitui selecao atual).
     *
     * @param {string} id
     * @returns {boolean} True if element was found and selected
     */
    function selectElement(id: string): boolean {
        const found = elements.find((e) => e.id === id);
        if (!found) return false;
        selectedIds.clear();
        selectedIds.add(id);
        render();
        return true;
    }

    /**
     * Toggles selection of an element (for Ctrl+click multi-select).
     * Alterna selecao de um elemento (para multi-selecao com Ctrl+click).
     *
     * @param {string} id
     * @returns {boolean} True if element exists
     */
    function toggleSelection(id: string): boolean {
        const found = elements.find((e) => e.id === id);
        if (!found) return false;
        if (selectedIds.has(id)) {
            selectedIds.delete(id);
        } else {
            selectedIds.add(id);
        }
        render();
        return true;
    }

    /**
     * Selects all elements in the diagram.
     * Seleciona todos os elementos do diagrama.
     */
    function selectAll() {
        for (const el of elements) {
            selectedIds.add(el.id);
        }
        render();
    }

    /**
     * Clears the current selection.
     * Limpa a selecao atual.
     */
    function deselectAll() {
        selectedIds.clear();
        render();
    }

    /**
     * Returns array of currently selected element IDs.
     * Retorna array de IDs dos elementos selecionados.
     *
     * @returns {string[]}
     */
    function getSelectedIds(): string[] {
        return [...selectedIds];
    }

    /**
     * Deletes all selected elements and their connections.
     * Exclui todos os elementos selecionados e suas conexoes.
     *
     * @returns {string[]} Array of deleted element IDs
     */
    function deleteSelected(): string[] {
        if (selectedIds.size === 0) return [];
        _pushHistory();
        const deleted = [];
        for (const delId of selectedIds) {
            const idx = elements.findIndex((e) => e.id === delId);
            if (idx === -1) continue;
            elements.splice(idx, 1);
            _removeConnectionsFor(delId);
            deleted.push(delId);
            log.info(`Element deleted: ${delId}`);
        }
        selectedIds.clear();
        render();
        return deleted;
    }

    /**
     * Removes all connections referencing a given element ID.
     * Remove todas as conexoes que referenciam um elemento.
     *
     * @param {string} elId
     */
    function _removeConnectionsFor(elId: string) {
        for (let i = connections.length - 1; i >= 0; i--) {
            if (connections[i].fromId === elId || connections[i].toId === elId) {
                connections.splice(i, 1);
            }
        }
    }

    /**
     * Duplicates all selected elements with new IDs and offsets them.
     * Duplica os elementos selecionados com novos IDs e os desloca.
     *
     * @returns {object[]} Array of new elements {id, type, bounds}
     */
    function duplicateSelected(): object[] {
        if (selectedIds.size === 0) return [];
        _pushHistory();
        const newEls = [];
        const offset = 20;
        for (const id of selectedIds) {
            const src = elements.find((e) => e.id === id);
            if (!src) continue;
            const dup = {
                id: genId('sym'),
                type: src.type,
                x: src.x + offset,
                y: src.y + offset,
                w: src.w,
                h: src.h,
                props: { ...src.props },
            };
            elements.push(dup);
            newEls.push({ id: dup.id, type: dup.type, bounds: { x: dup.x, y: dup.y, w: dup.w, h: dup.h } });
        }
        // Select duplicated elements
        selectedIds.clear();
        for (const el of newEls) selectedIds.add(el.id);
        render();
        return newEls;
    }

    // ----------------------------------------------------------------
    // HISTORY (Undo/Redo)
    // ----------------------------------------------------------------

    /**
     * Saves current state to the undo stack.
     * Salva o estado atual na pilha de undo.
     */
    function _pushHistory() {
        const snap = JSON.stringify(serialize());
        _undoStack.push(snap);
        if (_undoStack.length > MAX_HISTORY) _undoStack.shift();
        _redoStack.length = 0;
    }

    /**
     * Restores state from a serialized snapshot string.
     * Restaura estado a partir de um snapshot serializado.
     *
     * @param {string} snapStr
     */
    function _restoreFromSnap(snapStr: string) {
        const data = JSON.parse(snapStr);
        elements.length = 0;
        connections.length = 0;
        selectedIds.clear();
        for (const e of data.elements) {
            elements.push({ ...e, props: { ...(e.props || {}) } });
        }
        if (Array.isArray(data.connections)) {
            for (const c of data.connections) {
                connections.push({ ...c });
            }
        }
        render();
    }

    /**
     * Undo last action. Returns true if undo was performed.
     * Desfaz a ultima acao.
     *
     * @returns {boolean}
     */
    function undoAction(): boolean {
        if (_undoStack.length === 0) return false;
        const current = JSON.stringify(serialize());
        _redoStack.push(current);
        const prev = _undoStack.pop();
        _restoreFromSnap(prev);
        return true;
    }

    /**
     * Redo last undone action. Returns true if redo was performed.
     * Refaz a ultima acao desfeita.
     *
     * @returns {boolean}
     */
    function redoAction(): boolean {
        if (_redoStack.length === 0) return false;
        const current = JSON.stringify(serialize());
        _undoStack.push(current);
        const next = _redoStack.pop();
        _restoreFromSnap(next);
        return true;
    }

    // ----------------------------------------------------------------
    // CONTEXT MENU
    // ----------------------------------------------------------------

    /**
     * Shows a context menu at screen coordinates.
     * Exibe um menu de contexto nas coordenadas de tela.
     *
     * @param {number} screenX
     * @param {number} screenY
     * @param {object|null} hitEl - Element under cursor or null
     */
    function _showContextMenu(screenX: number, screenY: number, hitEl: object | null) {
        _hideContextMenu();
        const menu = document.createElement('div');
        menu.className = CONTEXT_MENU_CLASS;
        menu.style.cssText = `position:fixed;left:${screenX}px;top:${screenY}px;z-index:1000;
            background:#fff;border:1px solid #ccc;border-radius:4px;padding:4px 0;
            box-shadow:0 2px 8px rgba(0,0,0,0.18);min-width:120px;font-size:13px;`;

        const _hit = hitEl as any;
        if (_hit) {
            _addMenuItem(menu, 'Delete', () => {
                deleteSelected();
            });
            _addMenuItem(menu, 'Duplicate', () => {
                duplicateSelected();
            });
            _addMenuItem(menu, 'Properties', () => {
                log.info(`Properties: ${_hit.id}`);
            });
        } else {
            _addMenuItem(menu, 'Select All', () => {
                selectAll();
            });
        }

        document.body.appendChild(menu);
        _ctxMenu = menu;
        // WAI-ARIA 1.3 menu pattern (D2 residual): adopts role=menu + aria-label
        // on the container. Items already received role=menuitem + tabindex=-1
        // in _addMenuItem. autoFocus=false because the helper's first-button
        // selector won't match our <div> menuitems; we focus the first item
        // manually below.
        applyMenuA11y(menu, { label: 'Diagram actions', autoFocus: false });
        const firstItem = menu.querySelector<HTMLElement>('[role="menuitem"]');
        firstItem?.focus();
        const closer = (ev: any) => {
            if (!menu.contains(ev.target)) _hideContextMenu();
        };
        setTimeout(() => document.addEventListener('mousedown', closer, { once: true }), 0);
    }

    /**
     * Adds a menu item to a context menu element.
     * Adiciona um item ao menu de contexto.
     *
     * @param {HTMLElement} menu
     * @param {string} label
     * @param {Function} action
     */
    function _addMenuItem(menu: HTMLElement, label: string, action: Function) {
        const item = document.createElement('div');
        item.textContent = escapeHtml(label);
        item.style.cssText = 'padding:4px 16px;cursor:pointer;';
        // WAI-ARIA 1.3 menu pattern: each item is a menuitem with tabindex=-1
        // so a roving focus model can be applied (complements applyMenuA11y on
        // the container). Items here are <div> (not <button>), so we annotate
        // them inline since applyMenuA11y only sweeps buttons.
        item.setAttribute('role', 'menuitem');
        item.setAttribute('tabindex', '-1');
        item.addEventListener('mouseenter', () => {
            item.style.background = '#e8f0fe';
        });
        item.addEventListener('mouseleave', () => {
            item.style.background = '';
        });
        item.addEventListener('click', () => {
            _hideContextMenu();
            action();
        });
        menu.appendChild(item);
    }

    /**
     * Hides and removes the context menu.
     * Oculta e remove o menu de contexto.
     */
    function _hideContextMenu() {
        if (_ctxMenu && _ctxMenu.parentNode) {
            _ctxMenu.parentNode.removeChild(_ctxMenu);
        }
        _ctxMenu = null;
    }

    // ----------------------------------------------------------------
    // HIT TESTING
    // ----------------------------------------------------------------

    /**
     * Finds the element at the given world coordinates (AABB hit test).
     * Encontra o elemento nas coordenadas do diagrama (teste de colisao AABB).
     *
     * @param {number} wx - World X
     * @param {number} wy - World Y
     * @returns {object|null} Element or null
     */
    function hitTest(wx: number, wy: number): object | null {
        // Iterate in reverse so topmost (last drawn) is picked first
        for (let i = elements.length - 1; i >= 0; i--) {
            const el = elements[i];
            if (wx >= el.x && wx <= el.x + el.w && wy >= el.y && wy <= el.y + el.h) {
                return el;
            }
        }
        return null;
    }

    // ----------------------------------------------------------------
    // EXPORT
    // ----------------------------------------------------------------

    /**
     * Exports the diagram as a PNG Blob.
     * Exporta o diagrama como Blob PNG.
     *
     * @returns {Promise<Blob>}
     */
    function exportPNG(): Promise<Blob> {
        return new Promise((resolve) => {
            // Render at 1:1 for export (no pan/zoom)
            const expCanvas = document.createElement('canvas');
            const bounds = _computeBounds();
            const pad = 20;
            expCanvas.width = bounds.w + pad * 2;
            expCanvas.height = bounds.h + pad * 2;
            const expCtx = expCanvas.getContext('2d') as CanvasRenderingContext2D;

            expCtx.fillStyle = BG_COLOR;
            expCtx.fillRect(0, 0, expCanvas.width, expCanvas.height);
            expCtx.translate(pad - bounds.x, pad - bounds.y);

            for (const conn of connections) {
                _drawConnectionOn(expCtx, conn);
            }
            for (const el of elements) {
                drawSymbol(expCtx, el.type, el.x, el.y, el.w, el.h, false, el.props);
            }

            expCanvas.toBlob((blob) => resolve(blob as any), 'image/png');
        });
    }

    /**
     * Draws a connection on a specific context (for export).
     */
    /** @param {any} tgtCtx @param {any} conn */
    function _drawConnectionOn(tgtCtx: any, conn: any) {
        const from = elements.find((e) => e.id === conn.fromId);
        const to = elements.find((e) => e.id === conn.toId);
        if (!from || !to) return;
        tgtCtx.save();
        tgtCtx.lineWidth = conn.type === 'signal' ? 1.5 : 2;
        tgtCtx.strokeStyle = conn.type === 'signal' ? CONN_SIGNAL_COLOR : CONN_COLOR;
        if (conn.type === 'signal') tgtCtx.setLineDash([6, 4]);
        tgtCtx.beginPath();
        tgtCtx.moveTo(from.x + from.w / 2, from.y + from.h / 2);
        tgtCtx.lineTo(to.x + to.w / 2, to.y + to.h / 2);
        tgtCtx.stroke();
        tgtCtx.setLineDash([]);
        tgtCtx.restore();
    }

    /**
     * Computes the bounding box of all elements.
     */
    function _computeBounds() {
        if (elements.length === 0) return { x: 0, y: 0, w: 200, h: 200 };
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        for (const el of elements) {
            if (el.x < minX) minX = el.x;
            if (el.y < minY) minY = el.y;
            if (el.x + el.w > maxX) maxX = el.x + el.w;
            if (el.y + el.h > maxY) maxY = el.y + el.h;
        }
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    /**
     * Exports the diagram as an SVG string.
     * Exporta o diagrama como string SVG.
     *
     * @returns {string} SVG markup
     */
    function exportSVG(): string {
        const bounds = _computeBounds();
        const pad = 20;
        const svgW = bounds.w + pad * 2;
        const svgH = bounds.h + pad * 2;
        const offX = pad - bounds.x;
        const offY = pad - bounds.y;

        const parts = [];
        parts.push(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`,
        );
        parts.push(`<rect width="${svgW}" height="${svgH}" fill="${BG_COLOR}" />`);
        parts.push(`<g transform="translate(${offX},${offY})">`);

        // Connections
        for (const conn of connections) {
            const from = elements.find((e) => e.id === conn.fromId);
            const to = elements.find((e) => e.id === conn.toId);
            if (!from || !to) continue;
            const x1 = from.x + from.w / 2;
            const y1 = from.y + from.h / 2;
            const x2 = to.x + to.w / 2;
            const y2 = to.y + to.h / 2;
            const dash = conn.type === 'signal' ? ' stroke-dasharray="6,4"' : '';
            const color = conn.type === 'signal' ? CONN_SIGNAL_COLOR : CONN_COLOR;
            parts.push(
                `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2"${dash} />`,
            );
        }

        // Elements - simplified SVG representations
        for (const el of elements) {
            parts.push(_elementToSVG(el));
        }

        parts.push('</g>');
        parts.push('</svg>');
        return parts.join('\n');
    }

    function _svgCircle(cx: number, cy: number, r: number, stroke: string, fill: string, dashed = false): string {
        const dash = dashed ? ' stroke-dasharray="5,3"' : '';
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${dash} />`;
    }

    function _svgValve(x: number, y: number, w: number, h: number, cx: number, cy: number, stroke: string, fill: string): string {
        const left = `<polygon points="${x},${y} ${cx},${cy} ${x},${y + h}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />`;
        const right = `<polygon points="${x + w},${y} ${cx},${cy} ${x + w},${y + h}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />`;
        return left + right;
    }

    function _svgInstrument(cx: number, cy: number, r: number, stroke: string, fill: string, tagText: string): string {
        let svg = _svgCircle(cx, cy, r, stroke, fill);
        svg += `<line x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}" stroke="${stroke}" stroke-width="1.5" />`;
        if (tagText) {
            svg += `<text x="${cx}" y="${cy - 5}" text-anchor="middle" font-size="10">${tagText}</text>`;
        }
        return svg;
    }

    function _svgController(cx: number, cy: number, r: number, stroke: string, fill: string, tagText: string): string {
        let svg = _svgCircle(cx, cy, r, stroke, fill, true);
        if (tagText) {
            svg += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="10">${tagText}</text>`;
        }
        return svg;
    }

    function _svgShapeForType(el: any, cx: number, cy: number, stroke: string, fill: string, tagText: string): string {
        const { x, y, w, h, type } = el;
        const r = Math.min(w, h) / 2;
        switch (type) {
            case 'valve':
                return _svgValve(x, y, w, h, cx, cy, stroke, fill);
            case 'pump':
                return _svgCircle(cx, cy, r, stroke, fill);
            case 'tank':
                return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e8e8e8" stroke="${stroke}" stroke-width="1.5" />`;
            case 'heat_exchanger':
            case 'compressor':
                return _svgCircle(cx, cy, r, stroke, fill);
            case 'instrument':
                return _svgInstrument(cx, cy, r, stroke, fill, tagText);
            case 'controller':
                return _svgController(cx, cy, r, stroke, fill, tagText);
            case 'pipe':
                return `<line x1="${x}" y1="${cy}" x2="${x + w}" y2="${cy}" stroke="${stroke}" stroke-width="2" />`;
            case 'signal':
                return `<line x1="${x}" y1="${cy}" x2="${x + w}" y2="${cy}" stroke="#666" stroke-width="1.5" stroke-dasharray="6,4" />`;
            case 'mixer':
                return `<polygon points="${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />`;
            default:
                return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" />`;
        }
    }

    /**
     * Converts an element to its SVG representation.
     * Converte um elemento para sua representacao SVG.
     */
    /** @param {any} el */
    function _elementToSVG(el: any) {
        const { x, y, w, h, type, props } = el;
        const cx = x + w / 2;
        const cy = y + h / 2;
        const stroke = props?.stroke || '#333333';
        const fill = props?.fill || '#ffffff';
        const labelText = props?.label ? escapeHtml(String(props.label)) : '';
        const tagText = props?.tag ? escapeHtml(String(props.tag)) : '';

        let svg = `<g data-type="${escapeHtml(type)}" data-id="${escapeHtml(el.id)}">`;
        svg += _svgShapeForType(el, cx, cy, stroke, fill, tagText);

        if (labelText) {
            svg += `<text x="${cx}" y="${y + h + 14}" text-anchor="middle" font-size="11">${labelText}</text>`;
        }

        svg += '</g>';
        return svg;
    }

    // ----------------------------------------------------------------
    // SERIALIZATION
    // ----------------------------------------------------------------

    /**
     * Serializes the diagram state to a plain JSON object.
     * Serializa o estado do diagrama para um objeto JSON.
     *
     * @returns {object}
     */
    function serialize(): object {
        return {
            version: 1,
            elements: elements.map((e) => ({ ...e, props: { ...e.props } })),
            connections: connections.map((c) => ({ ...c })),
            view: { zoom, panX, panY },
        };
    }

    /**
     * Parses raw element candidates into validated element objects.
     */
    function _parseElements(rawElements: unknown[]): any[] {
        const out: any[] = [];
        for (const e of rawElements) {
            if (e && typeof e === 'object' && (e as any).id && (e as any).type && typeof (e as any).x === 'number') {
                out.push({ ...e, props: { ...((e as any).props || {}) } });
            }
        }
        return out;
    }

    /**
     * Parses raw connection candidates into validated connection objects.
     */
    function _parseConnections(rawConnections: unknown[]): any[] {
        const out: any[] = [];
        for (const c of rawConnections) {
            if (c && typeof c === 'object' && (c as any).fromId && (c as any).toId) {
                out.push({ ...c });
            }
        }
        return out;
    }

    /**
     * Parses view state with safe defaults.
     */
    function _parseView(rawView: unknown): { zoom: number; panX: number; panY: number } {
        const v = rawView as any;
        return {
            zoom: typeof v?.zoom === 'number' ? v.zoom : 1,
            panX: typeof v?.panX === 'number' ? v.panX : 0,
            panY: typeof v?.panY === 'number' ? v.panY : 0,
        };
    }

    /**
     * Restores diagram state from a serialized JSON object.
     * Restaura o estado do diagrama a partir de um objeto JSON serializado.
     *
     * @param {object} data
     */
    function deserialize(data: object) {
        const _data = data as any;
        if (!_data || !Array.isArray(_data.elements)) {
            log.warn('Invalid diagram data for deserialization');
            return;
        }

        const newElements = _parseElements(_data.elements);
        const newConnections = Array.isArray(_data.connections) ? _parseConnections(_data.connections) : [];
        const view = _parseView(_data.view);

        elements.length = 0;
        connections.length = 0;
        selectedIds.clear();
        for (const e of newElements) elements.push(e);
        for (const c of newConnections) connections.push(c);
        zoom = view.zoom;
        panX = view.panX;
        panY = view.panY;
        render();
        log.info(`Deserialized: ${elements.length} elements, ${connections.length} connections`);
    }

    /**
     * Clears all elements, connections, and resets the view.
     * Limpa todos os elementos, conexoes e reseta a visualizacao.
     */
    function clear() {
        elements.length = 0;
        connections.length = 0;
        selectedIds.clear();
        zoom = 1.0;
        panX = 0;
        panY = 0;
        _undoStack.length = 0;
        _redoStack.length = 0;
        render();
    }

    // ----------------------------------------------------------------
    // EVENT HANDLERS
    // ----------------------------------------------------------------

    /** @param {MouseEvent} e */
    function _onMouseDown(e: MouseEvent) {
        _hideContextMenu();
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        // Right-click = context menu
        if (e.button === 2) {
            const { x: wx, y: wy } = screenToWorld(sx, sy);
            const hit = hitTest(wx, wy) as any;
            if (hit && !selectedIds.has(hit.id)) {
                selectedIds.clear();
                selectedIds.add(hit.id);
                render();
            }
            _showContextMenu(e.clientX, e.clientY, hit);
            e.preventDefault();
            return;
        }

        // Middle button = pan start
        if (e.button === 1) {
            _isPanning = true;
            _panStartX = sx - panX;
            _panStartY = sy - panY;
            canvas.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }

        // Left click
        if (e.button === 0) {
            const { x: wx, y: wy } = screenToWorld(sx, sy);
            const hit = hitTest(wx, wy);

            if (hit) {
                _onElementMouseDown(hit, wx, wy, e.ctrlKey || e.metaKey);
            } else if (e.shiftKey) {
                _startSelectBox(wx, wy);
            } else if (!e.ctrlKey) {
                selectedIds.clear();
                render();
            }
        }
    }

    /**
     * Handles mousedown on an element: selection + drag start.
     * Trata mousedown em elemento: selecao + inicio de arrasto.
     */
    /** @param {any} hit @param {any} wx @param {any} wy @param {any} ctrlKey */
    function _onElementMouseDown(hit: any, wx: any, wy: any, ctrlKey: any) {
        if (ctrlKey) {
            toggleSelection(hit.id);
            return;
        }
        if (!selectedIds.has(hit.id)) {
            selectedIds.clear();
            selectedIds.add(hit.id);
            render();
        }
        // Start drag for all selected elements
        _isDragging = true;
        _dragStartWX = wx;
        _dragStartWY = wy;
        _dragOrigins.clear();
        for (const id of selectedIds) {
            const el = elements.find((e) => e.id === id);
            if (el) _dragOrigins.set(id, { x: el.x, y: el.y });
        }
        canvas.style.cursor = 'move';
    }

    /**
     * Starts a selection box from world coordinates.
     * Inicia caixa de selecao a partir de coordenadas do diagrama.
     */
    /** @param {any} wx @param {any} wy */
    function _startSelectBox(wx: any, wy: any) {
        _isSelectBox = true;
        _selectBoxStart = { x: wx, y: wy };
        _selectBoxEnd = { x: wx, y: wy };
    }

    /** @param {MouseEvent} e */
    function _onMouseMove(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        if (_isPanning) {
            panX = sx - _panStartX;
            panY = sy - _panStartY;
            render();
            return;
        }

        if (_isDragging) {
            const { x: wx, y: wy } = screenToWorld(sx, sy);
            const dx = wx - _dragStartWX;
            const dy = wy - _dragStartWY;
            for (const [id, origin] of _dragOrigins) {
                const el = elements.find((e) => e.id === id);
                if (el) {
                    el.x = origin.x + dx;
                    el.y = origin.y + dy;
                }
            }
            render();
            return;
        }

        if (_isSelectBox) {
            const { x: wx, y: wy } = screenToWorld(sx, sy);
            _selectBoxEnd = { x: wx, y: wy };
            render();
            return;
        }
    }

    /** @param {MouseEvent} _e */
    function _onMouseUp(_e: MouseEvent) {
        if (_isPanning) {
            _isPanning = false;
            canvas.style.cursor = 'default';
        }
        if (_isDragging) {
            _isDragging = false;
            canvas.style.cursor = 'default';
            _pushHistory();
        }
        if (_isSelectBox) {
            _finishSelectBox();
        }
    }

    /**
     * Finalizes selection box: selects all elements inside.
     * Finaliza caixa de selecao: seleciona elementos dentro.
     */
    function _finishSelectBox() {
        _isSelectBox = false;
        const x1 = Math.min(_selectBoxStart.x, _selectBoxEnd.x);
        const y1 = Math.min(_selectBoxStart.y, _selectBoxEnd.y);
        const x2 = Math.max(_selectBoxStart.x, _selectBoxEnd.x);
        const y2 = Math.max(_selectBoxStart.y, _selectBoxEnd.y);
        for (const el of elements) {
            if (el.x >= x1 && el.y >= y1 && el.x + el.w <= x2 && el.y + el.h <= y2) {
                selectedIds.add(el.id);
            }
        }
        render();
    }

    /** @param {WheelEvent} e */
    function _onWheel(e: WheelEvent) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const oldZoom = zoom;
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));

        // Zoom towards mouse position
        const zoomRatio = zoom / oldZoom;
        panX = mx - (mx - panX) * zoomRatio;
        panY = my - (my - panY) * zoomRatio;

        render();
    }

    /**
     * Handles undo/redo shortcuts.
     * @param {KeyboardEvent} e
     * @returns {boolean} true if handled
     */
    function _handleUndoRedo(e: KeyboardEvent): boolean {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            undoAction();
            return true;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'Z' && e.shiftKey))) {
            redoAction();
            return true;
        }
        return false;
    }

    /**
     * Handles selection shortcuts (Ctrl+A / Ctrl+D).
     * @param {KeyboardEvent} e
     * @returns {boolean} true if handled
     */
    function _handleSelectionShortcuts(e: KeyboardEvent): boolean {
        if (!(e.ctrlKey || e.metaKey)) return false;
        if (e.key === 'a') {
            selectAll();
            return true;
        }
        if (e.key === 'd') {
            duplicateSelected();
            return true;
        }
        return false;
    }

    /**
     * Handles delete/backspace and escape keys.
     * @param {KeyboardEvent} e
     * @returns {boolean} true if handled
     */
    function _handleDeleteOrEscape(e: KeyboardEvent): boolean {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedIds.size > 0) {
                deleteSelected();
                return true;
            }
        }
        if (e.key === 'Escape') {
            deselectAll();
            return true;
        }
        return false;
    }

    /** @param {KeyboardEvent} e */
    function _onKeyDown(e: KeyboardEvent) {
        if (_handleUndoRedo(e)) {
            e.preventDefault();
            return;
        }
        if (_handleSelectionShortcuts(e)) {
            e.preventDefault();
            return;
        }
        if (_handleDeleteOrEscape(e)) {
            e.preventDefault();
            return;
        }
    }

    /** @param {Event} e - Prevent default browser context menu on canvas */
    function _onContextMenu(e: Event) {
        e.preventDefault();
    }

    // --- Attach listeners ---
    canvas.addEventListener('mousedown', _onMouseDown);
    canvas.addEventListener('mousemove', _onMouseMove);
    canvas.addEventListener('mouseup', _onMouseUp);
    canvas.addEventListener('wheel', _onWheel, { passive: false });
    canvas.addEventListener('keydown', _onKeyDown);
    canvas.addEventListener('contextmenu', _onContextMenu);
    canvas.tabIndex = 0; // Make focusable for keyboard events

    // Initial render
    render();

    // ----------------------------------------------------------------
    // PUBLIC API
    // ----------------------------------------------------------------

    /**
     * Destroys the engine and removes event listeners.
     * Destroi o motor e remove event listeners.
     */
    function destroy() {
        canvas.removeEventListener('mousedown', _onMouseDown);
        canvas.removeEventListener('mousemove', _onMouseMove);
        canvas.removeEventListener('mouseup', _onMouseUp);
        canvas.removeEventListener('wheel', _onWheel);
        canvas.removeEventListener('keydown', _onKeyDown);
        canvas.removeEventListener('contextmenu', _onContextMenu);
        _hideContextMenu();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        log.info('Engine destroyed');
    }

    return {
        addSymbol,
        addConnection,
        selectElement,
        toggleSelection,
        selectAll,
        deselectAll,
        getSelectedIds,
        deleteSelected,
        duplicateSelected,
        undoAction,
        redoAction,
        exportPNG,
        exportSVG,
        serialize,
        deserialize,
        clear,
        render,
        destroy,
        hitTest,
        getCanvas: () => canvas,
        getElements: () => [...elements],
        getConnections: () => [...connections],
        getSelectedId: () => [...selectedIds][0] || null,
    };
}
