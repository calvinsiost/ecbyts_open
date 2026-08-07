// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   DIAGRAM EDITOR — P&ID Technical Diagram Editor Modal
   Editor de diagramas tecnicos P&ID com paleta de simbolos,
   canvas interativo e exportacao PNG/SVG.

   Abre como modal fullscreen sobre o viewport.
   Paleta lateral permite arrastar simbolos para o canvas.
   ================================================================ */
import { createDiagramCanvas } from '../../core/diagrams/canvasEngine.js';
import { PID_SYMBOLS, getSymbolTypes, drawSymbol } from '../../core/diagrams/pidSymbols.js';
import { showToast } from './toast.js';
import { t } from '../i18n/translations.js';
import { createLogger } from '../helpers/logger.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
const log = createLogger('DiagramEditor');
/**
 * @typedef {Object} DiagramSymbolMeta
 * @property {number} defaultW
 * @property {number} defaultH
 * @property {string} label
 */
/** @type {any} */
let _engine: any = null;
/** @type {any} */
let _modal: any = null;
// ----------------------------------------------------------------
// PALETTE THUMBNAIL RENDERING
// ----------------------------------------------------------------
/**
 * Creates a small canvas thumbnail for a symbol type.
 * Cria uma miniatura canvas para um tipo de simbolo.
 *
 * @param {string} type
 * @param {number} size
 * @returns {HTMLCanvasElement}
 */
function createThumbnail(type: any, size: any = 48) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const meta = PID_SYMBOLS.get(type);
    if (!meta || !ctx) return c;
    const scale = Math.min((size - 8) / meta.defaultW, (size - 8) / meta.defaultH);
    const w = meta.defaultW * scale;
    const h = meta.defaultH * scale;
    const x = (size - w) / 2;
    const y = (size - h) / 2;
    drawSymbol(ctx, type, x, y, w, h, false, {});
    return c;
}
// ----------------------------------------------------------------
// MODAL CREATION
// ----------------------------------------------------------------
/**
 * Opens the P&ID diagram editor modal.
 * Abre o modal do editor de diagramas P&ID.
 *
 * @param {object} [opts]
 * @param {object} [opts.initialData] - Serialized diagram data to restore
 */
export function openDiagramEditor(opts: any = {}) {
    // null vindo de callers payload-less (ex: deep-link dispatcher) não ativa o default
    if (!opts) opts = {};
    if (_modal) {
        closeDiagramEditor();
    }
    syncDeepLinkUrl('diagram-editor');
    // --- Overlay ---
    _modal = document.createElement('div');
    _modal.id = 'diagram-editor-modal';
    _modal.style.cssText = `
        position: fixed; inset: 0; z-index: 9000;
        background: rgba(0,0,0,0.5); display: flex;
        align-items: center; justify-content: center;
    `;
    // --- Container ---
    const container = document.createElement('div');
    container.style.cssText = `
        background: #fff; border-radius: 8px; width: 90vw; height: 85vh;
        display: flex; flex-direction: column; overflow: hidden;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    `;
    // --- Header ---
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 16px; border-bottom: 1px solid #ddd; background: #f5f5f5;
        flex-shrink: 0;
    `;
    const titleEl = document.createElement('h3');
    titleEl.textContent = t('diagram.title') || 'P&ID Diagram Editor';
    titleEl.style.cssText = 'margin: 0; font-size: 16px;';
    header.appendChild(titleEl);
    // Header buttons
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; gap: 8px;';
    btnGroup.appendChild(_createBtn(t('diagram.exportPNG') || 'Export PNG', _handleExportPNG));
    btnGroup.appendChild(_createBtn(t('diagram.exportSVG') || 'Export SVG', _handleExportSVG));
    btnGroup.appendChild(_createBtn(t('diagram.clear') || 'Clear', _handleClear));
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'X';
    closeBtn.title = 'Close';
    closeBtn.style.cssText = `
        background: none; border: 1px solid #ccc; border-radius: 4px;
        cursor: pointer; font-size: 14px; padding: 4px 10px; margin-left: 8px;
    `;
    closeBtn.onclick = closeDiagramEditor;
    btnGroup.appendChild(closeBtn);
    header.appendChild(btnGroup);
    container.appendChild(header);
    // --- Body (palette + canvas) ---
    const body = document.createElement('div');
    body.style.cssText = 'display: flex; flex: 1; overflow: hidden;';
    // Palette sidebar
    const palette = _buildPalette();
    body.appendChild(palette);
    // Canvas area
    const canvasArea = document.createElement('div');
    canvasArea.id = 'diagram-canvas-area';
    canvasArea.style.cssText = 'flex: 1; position: relative; overflow: hidden;';
    body.appendChild(canvasArea);
    container.appendChild(body);
    // --- Status bar ---
    const status = document.createElement('div');
    status.id = 'diagram-status';
    status.style.cssText = `
        padding: 4px 16px; font-size: 12px; color: #666;
        border-top: 1px solid #ddd; background: #f9f9f9; flex-shrink: 0;
    `;
    status.textContent =
        t('diagram.hint') || 'Click palette to add symbol. Shift+drag to pan. Scroll to zoom. Delete to remove.';
    container.appendChild(status);
    _modal.appendChild(container);
    document.body.appendChild(_modal);
    // Close on overlay click
    _modal.addEventListener("click", (e: any) => {
        if (e.target === _modal) closeDiagramEditor();
    });
    // --- Initialize engine ---
    // Defer so container has layout dimensions
    requestAnimationFrame(() => {
        const w = canvasArea.clientWidth || 800;
        const h = canvasArea.clientHeight || 600;
        _engine = createDiagramCanvas(canvasArea, { width: w, height: h });
        if (opts.initialData) {
            _engine.deserialize(opts.initialData);
        }
        canvasArea.querySelector('canvas')?.focus();
    });
    log.info('Diagram editor opened');
}
/**
 * Closes the diagram editor modal.
 * Fecha o modal do editor de diagramas.
 */
export function closeDiagramEditor() {
    if (_engine) {
        _engine.destroy();
        _engine = null;
    }
    if (_modal) {
        _modal.remove();
        _modal = null;
        clearDeepLinkUrl();
    }
    log.info('Diagram editor closed');
}
/**
 * Returns the current engine instance (for programmatic access).
 * Retorna a instancia atual do motor (para acesso programatico).
 *
 * @returns {object|null}
 */
export function getDiagramEngine() {
    return _engine;
}
// ----------------------------------------------------------------
// PALETTE
// ----------------------------------------------------------------
/**
 * Builds the symbol palette sidebar.
 * Constroi a barra lateral com paleta de simbolos.
 */
function _buildPalette() {
    const palette = document.createElement('div');
    palette.style.cssText = `
        width: 140px; border-right: 1px solid #ddd; overflow-y: auto;
        padding: 8px; background: #fafafa; flex-shrink: 0;
    `;
    const title = document.createElement('div');
    title.textContent = t('diagram.addSymbol') || 'Add Symbol';
    title.style.cssText = 'font-weight: 600; font-size: 13px; margin-bottom: 8px; color: #555;';
    palette.appendChild(title);
    // One drop position counter to stagger symbols
    let dropCount = 0;
    for (const type of getSymbolTypes()) {
        const meta = PID_SYMBOLS.get(type);
        if (!meta) continue;
        const item = document.createElement('div');
        item.style.cssText = `
            display: flex; flex-direction: column; align-items: center;
            padding: 6px 4px; margin-bottom: 4px; border: 1px solid #e0e0e0;
            border-radius: 4px; cursor: pointer; background: #fff;
            transition: background 0.15s;
        `;
        item.title = meta.label;
        item.addEventListener('mouseenter', () => {
            item.style.background = '#e8f0fe';
        });
        item.addEventListener('mouseleave', () => {
            item.style.background = '#fff';
        });
        const thumb = createThumbnail(type, 44);
        thumb.style.cssText = 'pointer-events: none;';
        item.appendChild(thumb);
        const lbl = document.createElement('span');
        lbl.textContent = meta.label;
        lbl.style.cssText = 'font-size: 10px; color: #555; margin-top: 2px;';
        item.appendChild(lbl);
        // Click to add to canvas
        item.addEventListener('click', () => {
            if (!_engine) return;
            const offset = dropCount * 30;
            _engine.addSymbol(type, 100 + offset, 100 + offset);
            dropCount = (dropCount + 1) % 10;
            showToast(`${meta.label} ${t('diagram.added') || 'added'}`, 'info', 1500);
        });
        palette.appendChild(item);
    }
    return palette;
}
// ----------------------------------------------------------------
// BUTTON HELPER
// ----------------------------------------------------------------
function _createBtn(text: any, handler: any) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
        padding: 4px 12px; border: 1px solid #ccc; border-radius: 4px;
        background: #fff; cursor: pointer; font-size: 13px;
    `;
    btn.addEventListener('click', handler);
    return btn;
}
// ----------------------------------------------------------------
// EXPORT HANDLERS
// ----------------------------------------------------------------
async function _handleExportPNG() {
    if (!_engine) return;
    try {
        const blob = await _engine.exportPNG();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'diagram.png';
        a.click();
        URL.revokeObjectURL(url);
        showToast(t('diagram.exported') || 'Diagram exported as PNG', 'success');
    } catch (err: any) {
        log.error('PNG export failed', err);
        showToast(t('diagram.exportError') || 'Export failed', 'error');
    }
}
function _handleExportSVG() {
    if (!_engine) return;
    try {
        const svg = _engine.exportSVG();
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'diagram.svg';
        a.click();
        URL.revokeObjectURL(url);
        showToast(t('diagram.exported') || 'Diagram exported as SVG', 'success');
    } catch (err: any) {
        log.error('SVG export failed', err);
        showToast(t('diagram.exportError') || 'Export failed', 'error');
    }
}
function _handleClear() {
    if (!_engine) return;
    _engine.clear();
    showToast(t('diagram.cleared') || 'Diagram cleared', 'info');
}
