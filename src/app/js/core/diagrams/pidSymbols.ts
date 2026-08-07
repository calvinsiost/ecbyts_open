// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   P&ID SYMBOL REGISTRY — ISA S5.1 Basic Symbols
   Registro de simbolos P&ID baseados na norma ISA S5.1.

   Cada simbolo e uma funcao pura de desenho em Canvas 2D.
   Nenhum estado interno — recebe contexto, posicao e propriedades.

   Referencia: ANSI/ISA-5.1-2009, Instrumentation Symbols and Identification
   ================================================================ */

// ----------------------------------------------------------------
// SELECTION STYLE CONSTANTS
// ----------------------------------------------------------------

const SEL_COLOR = '#4488ff';
const SEL_WIDTH = 2;
const DEFAULT_STROKE = '#333333';
const DEFAULT_FILL = '#ffffff';

// ----------------------------------------------------------------
// HELPER - draw selection highlight around bounds
// ----------------------------------------------------------------

/**
 * Draws a selection rectangle around the element bounds.
 * Desenha retangulo de selecao ao redor do elemento.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - Left edge
 * @param {number} y - Top edge
 * @param {number} w - Width
 * @param {number} h - Height
 */
function drawSelectionRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.save();
    ctx.strokeStyle = SEL_COLOR;
    ctx.lineWidth = SEL_WIDTH;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
    ctx.setLineDash([]);
    ctx.restore();
}

/**
 * Draws a label (tag) below the symbol if provided in props.
 * Desenha etiqueta (tag) abaixo do simbolo se fornecida nas props.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - Center X
 * @param {number} bottom - Bottom Y of symbol
 * @param {any} props
 */
function drawLabel(ctx: CanvasRenderingContext2D, cx: number, bottom: number, props: any): void {
    if (!props?.label) return;
    ctx.save();
    ctx.fillStyle = '#333';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(String(props.label), cx, bottom + 4);
    ctx.restore();
}

// ----------------------------------------------------------------
// SYMBOL DRAW FUNCTIONS
// ----------------------------------------------------------------

/**
 * Valve - ISA: two opposing triangles (bowtie shape).
 * Valvula - dois triangulos opostos formando uma gravata-borboleta.
 */
function drawValve(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    selected: boolean,
    props: any,
): void {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.save();
    ctx.strokeStyle = props?.stroke || DEFAULT_STROKE;
    ctx.fillStyle = props?.fill || DEFAULT_FILL;
    ctx.lineWidth = 1.5;
    // Left triangle
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(cx, cy);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Right triangle
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(cx, cy);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (selected) drawSelectionRect(ctx, x, y, w, h);
    drawLabel(ctx, cx, y + h, props);
}

/**
 * Pump - ISA: circle with inscribed triangle pointing right.
 * Bomba - circulo com triangulo inscrito apontando para a direita.
 */
function drawPump(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    selected: boolean,
    props: any,
): void {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2;
    ctx.save();
    ctx.strokeStyle = props?.stroke || DEFAULT_STROKE;
    ctx.fillStyle = props?.fill || DEFAULT_FILL;
    ctx.lineWidth = 1.5;
    // Circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Triangle inside
    const tri = r * 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - tri * 0.6, cy - tri);
    ctx.lineTo(cx + tri, cy);
    ctx.lineTo(cx - tri * 0.6, cy + tri);
    ctx.closePath();
    ctx.fillStyle = props?.stroke || DEFAULT_STROKE;
    ctx.fill();
    ctx.restore();
    if (selected) drawSelectionRect(ctx, x, y, w, h);
    drawLabel(ctx, cx, y + h, props);
}

/**
 * Tank - ISA: rectangle with top/bottom lines.
 * Tanque - retangulo representando vaso ou reservatorio.
 */
function drawTank(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    selected: boolean,
    props: any,
): void {
    ctx.save();
    ctx.strokeStyle = props?.stroke || DEFAULT_STROKE;
    ctx.fillStyle = props?.fill || '#e8e8e8';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    // Top and bottom reinforcement lines
    ctx.beginPath();
    ctx.moveTo(x, y + 3);
    ctx.lineTo(x + w, y + 3);
    ctx.moveTo(x, y + h - 3);
    ctx.lineTo(x + w, y + h - 3);
    ctx.stroke();
    ctx.restore();
    if (selected) drawSelectionRect(ctx, x, y, w, h);
    drawLabel(ctx, x + w / 2, y + h, props);
}

/**
 * Heat Exchanger - ISA: circle with internal parallel lines.
 * Trocador de calor - circulo com linhas internas paralelas.
 */
function drawHeatExchanger(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    selected: boolean,
    props: any,
): void {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2;
    ctx.save();
    ctx.strokeStyle = props?.stroke || DEFAULT_STROKE;
    ctx.fillStyle = props?.fill || DEFAULT_FILL;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Internal parallel lines
    const lineOff = r * 0.4;
    ctx.beginPath();
    ctx.moveTo(cx - lineOff, cy - r * 0.6);
    ctx.lineTo(cx - lineOff, cy + r * 0.6);
    ctx.moveTo(cx + lineOff, cy - r * 0.6);
    ctx.lineTo(cx + lineOff, cy + r * 0.6);
    ctx.stroke();
    ctx.restore();
    if (selected) drawSelectionRect(ctx, x, y, w, h);
    drawLabel(ctx, cx, y + h, props);
}

/**
 * Compressor - ISA: circle with arrow pointing right.
 * Compressor - circulo com seta apontando para a direita.
 */
function drawCompressor(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    selected: boolean,
    props: any,
): void {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2;
    ctx.save();
    ctx.strokeStyle = props?.stroke || DEFAULT_STROKE;
    ctx.fillStyle = props?.fill || DEFAULT_FILL;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Arrow inside pointing right
    const aw = r * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - aw, cy);
    ctx.lineTo(cx + aw, cy);
    ctx.lineTo(cx + aw * 0.4, cy - aw * 0.5);
    ctx.moveTo(cx + aw, cy);
    ctx.lineTo(cx + aw * 0.4, cy + aw * 0.5);
    ctx.strokeStyle = props?.stroke || DEFAULT_STROKE;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    if (selected) drawSelectionRect(ctx, x, y, w, h);
    drawLabel(ctx, cx, y + h, props);
}

/**
 * Instrument - ISA: circle with tag text inside.
 * Instrumento - circulo com identificacao (tag) interna.
 */
function drawInstrument(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    selected: boolean,
    props: any,
): void {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2;
    ctx.save();
    ctx.strokeStyle = props?.stroke || DEFAULT_STROKE;
    ctx.fillStyle = props?.fill || DEFAULT_FILL;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Horizontal divider line
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();
    // Tag text (top half)
    if (props?.tag) {
        ctx.fillStyle = '#333';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(props.tag), cx, cy - r * 0.35);
    }
    ctx.restore();
    if (selected) drawSelectionRect(ctx, x, y, w, h);
    drawLabel(ctx, cx, y + h, props);
}

/**
 * Controller - ISA: dashed circle (shared control).
 * Controlador - circulo tracejado indicando controle compartilhado.
 */
function drawController(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    selected: boolean,
    props: any,
): void {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2;
    ctx.save();
    ctx.strokeStyle = props?.stroke || DEFAULT_STROKE;
    ctx.fillStyle = props?.fill || DEFAULT_FILL;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    // Tag text inside
    if (props?.tag) {
        ctx.fillStyle = '#333';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(props.tag), cx, cy);
    }
    ctx.restore();
    if (selected) drawSelectionRect(ctx, x, y, w, h);
    drawLabel(ctx, cx, y + h, props);
}

/**
 * Pipe - ISA: solid line between two points.
 * Tubulacao - linha solida entre dois pontos.
 */
function drawPipe(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    selected: boolean,
    props: any,
): void {
    ctx.save();
    ctx.strokeStyle = props?.stroke || DEFAULT_STROKE;
    ctx.lineWidth = props?.lineWidth || 2;
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
    ctx.restore();
    if (selected) drawSelectionRect(ctx, x, y, w, h);
}

/**
 * Signal - ISA: dashed line (instrument signal).
 * Sinal - linha tracejada indicando sinal de instrumento.
 */
function drawSignal(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    selected: boolean,
    props: any,
): void {
    ctx.save();
    ctx.strokeStyle = props?.stroke || '#666666';
    ctx.lineWidth = props?.lineWidth || 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    if (selected) drawSelectionRect(ctx, x, y, w, h);
}

/**
 * Mixer - ISA: diamond shape.
 * Misturador - losango representando juncao ou mistura.
 */
function drawMixer(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    selected: boolean,
    props: any,
): void {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.save();
    ctx.strokeStyle = props?.stroke || DEFAULT_STROKE;
    ctx.fillStyle = props?.fill || DEFAULT_FILL;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(x + w, cy);
    ctx.lineTo(cx, y + h);
    ctx.lineTo(x, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (selected) drawSelectionRect(ctx, x, y, w, h);
    drawLabel(ctx, cx, y + h, props);
}

// ----------------------------------------------------------------
// SYMBOL REGISTRY
// ----------------------------------------------------------------

/**
 * Registry of all P&ID symbols with draw functions and metadata.
 * Registro de todos os simbolos P&ID com funcoes de desenho e metadados.
 *
 * @type {Map<string, {draw: Function, label: string, defaultW: number, defaultH: number, category: string}>}
 */
export const PID_SYMBOLS: Map<
    string,
    { draw: Function; label: string; defaultW: number; defaultH: number; category: string }
> = new Map([
    ['valve', { draw: drawValve, label: 'Valve', defaultW: 50, defaultH: 40, category: 'equipment' }],
    ['pump', { draw: drawPump, label: 'Pump', defaultW: 50, defaultH: 50, category: 'equipment' }],
    ['tank', { draw: drawTank, label: 'Tank', defaultW: 60, defaultH: 80, category: 'equipment' }],
    [
        'heat_exchanger',
        { draw: drawHeatExchanger, label: 'Heat Exchanger', defaultW: 50, defaultH: 50, category: 'equipment' },
    ],
    ['compressor', { draw: drawCompressor, label: 'Compressor', defaultW: 50, defaultH: 50, category: 'equipment' }],
    [
        'instrument',
        { draw: drawInstrument, label: 'Instrument', defaultW: 44, defaultH: 44, category: 'instrumentation' },
    ],
    [
        'controller',
        { draw: drawController, label: 'Controller', defaultW: 44, defaultH: 44, category: 'instrumentation' },
    ],
    ['pipe', { draw: drawPipe, label: 'Pipe', defaultW: 100, defaultH: 8, category: 'connection' }],
    ['signal', { draw: drawSignal, label: 'Signal', defaultW: 100, defaultH: 8, category: 'connection' }],
    ['mixer', { draw: drawMixer, label: 'Mixer', defaultW: 50, defaultH: 50, category: 'equipment' }],
]);

/**
 * Returns the list of symbol type IDs.
 * Retorna a lista de IDs de tipos de simbolo.
 *
 * @returns {string[]}
 */
export function getSymbolTypes(): string[] {
    return [...PID_SYMBOLS.keys()];
}

/**
 * Returns symbol metadata (without draw function) for a given type.
 * Retorna metadados do simbolo (sem funcao de desenho) para um tipo.
 *
 * @param {string} type
 * @returns {{label: string, defaultW: number, defaultH: number, category: string}|null}
 */
export function getSymbolMeta(
    type: string,
): { label: string; defaultW: number; defaultH: number; category: string } | null {
    const sym = PID_SYMBOLS.get(type);
    if (!sym) return null;
    const { draw: _d, ...meta } = sym;
    return meta;
}

/**
 * Draws a symbol onto the given canvas context.
 * Desenha um simbolo no contexto canvas fornecido.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} type - Symbol type ID
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {boolean} selected
 * @param {object} [props?]
 * @returns {boolean} True if drawn successfully
 */
export function drawSymbol(
    ctx: CanvasRenderingContext2D,
    type: string,
    x: number,
    y: number,
    w: number,
    h: number,
    selected: boolean,
    props?: object,
): boolean {
    const sym = PID_SYMBOLS.get(type);
    if (!sym) return false;
    sym.draw(ctx, x, y, w, h, selected, props);
    return true;
}
