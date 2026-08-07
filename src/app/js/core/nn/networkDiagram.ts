// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

interface NodePoint {
    x: number;
    y: number;
}

interface NeuralNetwork {
    inputSize: number;
    hiddenLayerSizes?: number[];
    hiddenSize?: number;
    outputSize: number;
    trained: boolean;
    _weights?: number[][][];
}

interface VariableMapping {
    variableId: string;
}

interface NetworkMapping {
    inputs?: VariableMapping[];
    outputs?: VariableMapping[];
}

/* ================================================================
   NETWORK DIAGRAM — Canvas 2D visualization of MLP architecture
   Diagrama visual da arquitetura da rede neural (Multi-Layer Perceptron)

   Mostra nos de entrada, ocultos (N camadas) e saida com conexoes
   cuja espessura/opacidade reflete magnitude dos pesos treinados.
   Suporta 1 a 5 hidden layers com layout dinamico de colunas.
   ================================================================ */

// ----------------------------------------------------------------
// THEME-AWARE COLORS - resolved at draw time from CSS variables
// ----------------------------------------------------------------

const COLORS = {
    input: '#3b82f6', // accent-blue
    hidden: '#94a3b8', // neutral-400
    output: '#22c55e', // accent-green
    posWeight: '#3b82f6', // blue for positive weights
    negWeight: '#ef4444', // red for negative weights
    untrained: 'rgba(150, 150, 150, 0.12)',
    text: '#64748b', // neutral-500
    labelText: '#334155', // neutral-700
};

// Hidden layer column colors (cycle through for visual distinction)
const HIDDEN_COLORS = [
    '#94a3b8', // neutral-400
    '#a78bfa', // violet-400
    '#f472b6', // pink-400
    '#fb923c', // orange-400
    '#34d399', // emerald-400
];

const MAX_VISIBLE_NODES = 8; // Limita nos visiveis por camada
const NODE_RADIUS = 10;
const LABEL_FONT = '10px monospace';
const LAYER_FONT = '9px sans-serif';

// ----------------------------------------------------------------
// MAIN DRAW FUNCTION
// ----------------------------------------------------------------

/**
 * Draw the neural network diagram on a canvas element.
 * Desenha o diagrama MLP no canvas com nos, conexoes e labels.
 * Suporta N hidden layers com layout dinamico.
 *
 * @param count
 * @param top - SimpleNN instance (needs inputSize, hiddenLayerSizes, outputSize, _weights, trained)
 * @param mapping? - { inputs: [{variableId}], outputs: [{variableId}] }
 */
interface DiagramLayout {
    W: number;
    H: number;
    layerX: number[];
    allLayerNodes: NodePoint[][];
    numColumns: number;
    hiddenLayerSizes: number[];
}

function _prepareCanvasContext(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; W: number; H: number } | null {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    return { ctx, W: rect.width, H: rect.height };
}

function _buildLayerLayout(nn: NeuralNetwork, W: number, H: number): DiagramLayout {
    const hiddenLayerSizes: number[] = nn.hiddenLayerSizes || [nn.hiddenSize || 0];
    const numColumns = 2 + hiddenLayerSizes.length;

    const padding = {
        top: 20,
        bottom: 28,
        left: numColumns > 4 ? 50 : 80,
        right: numColumns > 4 ? 50 : 80,
    };

    const usableWidth = W - padding.left - padding.right;

    const layerX: number[] = [];
    for (let c = 0; c < numColumns; c++) {
        layerX.push(padding.left + (numColumns > 1 ? (usableWidth * c) / (numColumns - 1) : usableWidth / 2));
    }

    const allLayerNodes: NodePoint[][] = [];

    allLayerNodes.push(_layoutNodes(layerX[0] as number, padding.top, H - padding.bottom, nn.inputSize));

    for (let h = 0; h < hiddenLayerSizes.length; h++) {
        const size = hiddenLayerSizes[h] as number;
        const visibleCount = Math.min(size, MAX_VISIBLE_NODES);
        const truncated = size > MAX_VISIBLE_NODES;
        allLayerNodes.push(
            _layoutNodes(
                layerX[1 + h] as number,
                padding.top,
                H - padding.bottom,
                visibleCount + (truncated ? 1 : 0)
            )
        );
    }

    allLayerNodes.push(
        _layoutNodes(layerX[numColumns - 1] as number, padding.top, H - padding.bottom, nn.outputSize)
    );

    return { W, H, layerX, allLayerNodes, numColumns, hiddenLayerSizes };
}

function _renderHiddenNodes(
    ctx: CanvasRenderingContext2D,
    allLayerNodes: NodePoint[][],
    hiddenLayerSizes: number[]
): void {
    for (let h = 0; h < hiddenLayerSizes.length; h++) {
        const size = hiddenLayerSizes[h] as number;
        const visibleCount = Math.min(size, MAX_VISIBLE_NODES);
        const truncated = size > MAX_VISIBLE_NODES;
        const color = HIDDEN_COLORS[h % HIDDEN_COLORS.length] as string;
        _drawNodes(ctx, (allLayerNodes[1 + h] as NodePoint[]).slice(0, visibleCount), color);
        if (truncated) {
            _drawEllipsisNode(ctx, (allLayerNodes[1 + h] as NodePoint[])[visibleCount]);
        }
    }
}

function _renderLayerLabels(
    ctx: CanvasRenderingContext2D,
    layerX: number[],
    hiddenLayerSizes: number[],
    numColumns: number,
    H: number,
    nn: NeuralNetwork
): void {
    _drawLayerLabel(ctx, layerX[0] as number, H - 6, `Input (${nn.inputSize})`);
    for (let h = 0; h < hiddenLayerSizes.length; h++) {
        const label =
            hiddenLayerSizes.length === 1 ? `Hidden (${hiddenLayerSizes[h]})` : `H${h + 1} (${hiddenLayerSizes[h]})`;
        _drawLayerLabel(ctx, layerX[1 + h] as number, H - 6, label);
    }
    _drawLayerLabel(ctx, layerX[numColumns - 1] as number, H - 6, `Output (${nn.outputSize})`);
}

function _renderNetworkDiagram(
    ctx: CanvasRenderingContext2D,
    nn: NeuralNetwork,
    layout: DiagramLayout,
    mapping?: NetworkMapping
): void {
    const { W, H, layerX, allLayerNodes, numColumns, hiddenLayerSizes } = layout;

    _drawAllConnections(ctx, nn, allLayerNodes, hiddenLayerSizes);

    _drawNodes(ctx, allLayerNodes[0] as NodePoint[], COLORS.input);
    _renderHiddenNodes(ctx, allLayerNodes, hiddenLayerSizes);
    _drawNodes(ctx, allLayerNodes[numColumns - 1] as NodePoint[], COLORS.output);

    _drawLabels(ctx, allLayerNodes[0] as NodePoint[], mapping?.inputs, 'left', W);
    _drawLabels(ctx, allLayerNodes[numColumns - 1] as NodePoint[], mapping?.outputs, 'right', W);

    _renderLayerLabels(ctx, layerX, hiddenLayerSizes, numColumns, H, nn);
}

export function drawNetworkDiagram(
    canvas: HTMLCanvasElement,
    nn: NeuralNetwork,
    mapping?: NetworkMapping
): void {
    if (!canvas || !nn) return;

    const prepared = _prepareCanvasContext(canvas);
    if (!prepared) return;

    const { ctx, W, H } = prepared;
    ctx.clearRect(0, 0, W, H);

    _resolveThemeColors(canvas);

    const layout = _buildLayerLayout(nn, W, H);
    _renderNetworkDiagram(ctx, nn, layout, mapping);
}

// ----------------------------------------------------------------
// NODE LAYOUT - Calculate vertical positions per layer
// ----------------------------------------------------------------

/**
 * @param count
 * @param top
 * @param bottom
 * @param count
 * @returns
 */
function _layoutNodes(x: number, top: number, bottom: number, count: number): NodePoint[] {
    const nodes: NodePoint[] = [];
    if (count <= 0) return nodes;
    if (count === 1) {
        nodes.push({ x, y: (top + bottom) / 2 });
        return nodes;
    }
    const spacing = (bottom - top) / (count - 1);
    for (let i = 0; i < count; i++) {
        nodes.push({ x, y: top + i * spacing });
    }
    return nodes;
}

// ----------------------------------------------------------------
// CONNECTION DRAWING - Lines between adjacent layers
// Desenha conexoes entre camadas adjacentes com peso codificado
// ----------------------------------------------------------------

/**
 * @param ctx
 * @param nn
 * @param allLayerNodes
 * @param hiddenLayerSizes
 */
function _drawAllConnections(
    ctx: CanvasRenderingContext2D,
    nn: NeuralNetwork,
    allLayerNodes: NodePoint[][],
    hiddenLayerSizes: number[]
): void {
    const trained = nn.trained;
    const numConnections = allLayerNodes.length - 1;

    for (let l = 0; l < numConnections; l++) {
        const fromNodes = allLayerNodes[l] as NodePoint[];
        const toNodes = allLayerNodes[l + 1] as NodePoint[];

        // Determine visible count for target layer
        let toVisibleCount;
        if (l < hiddenLayerSizes.length) {
            // Target is a hidden layer
            toVisibleCount = Math.min(hiddenLayerSizes[l] as number, MAX_VISIBLE_NODES);
        } else {
            // Target is output layer
            toVisibleCount = toNodes.length;
        }

        // Determine visible count for source layer
        let fromVisibleCount;
        if (l === 0) {
            // Source is input layer
            fromVisibleCount = fromNodes.length;
        } else {
            // Source is a hidden layer
            fromVisibleCount = Math.min(hiddenLayerSizes[l - 1] as number, MAX_VISIBLE_NODES);
        }

        // Get weight matrix for this connection
        const W_l = trained && nn._weights ? nn._weights[l] : null;

        for (let t = 0; t < toVisibleCount; t++) {
            for (let f = 0; f < fromVisibleCount; f++) {
                const weight = W_l ? (W_l[t]?.[f] ?? 0) : 0;
                _drawWeightLine(ctx, fromNodes[f] as NodePoint, toNodes[t] as NodePoint, weight, trained);
            }
        }
    }
}

/**
 * @param ctx
 * @param from
 * @param to
 * @param weight
 * @param trained
 */
function _drawWeightLine(
    ctx: CanvasRenderingContext2D,
    from: NodePoint,
    to: NodePoint,
    weight: number,
    trained: boolean
): void {
    ctx.beginPath();
    ctx.moveTo(from.x + NODE_RADIUS, from.y);
    ctx.lineTo(to.x - NODE_RADIUS, to.y);

    if (!trained) {
        ctx.strokeStyle = COLORS.untrained;
        ctx.lineWidth = 0.5;
    } else {
        const absW = Math.min(Math.abs(weight), 2); // clamp for vis
        const opacity = 0.08 + absW * 0.25;
        const thickness = 0.5 + absW * 1.2;
        const color = weight >= 0 ? COLORS.posWeight : COLORS.negWeight;

        ctx.strokeStyle = _withOpacity(color, Math.min(opacity, 0.6));
        ctx.lineWidth = Math.min(thickness, 3);
    }

    ctx.stroke();
}

// ----------------------------------------------------------------
// NODE DRAWING - Circles with fill and subtle border
// ----------------------------------------------------------------

/**
 * @param ctx
 * @param nodes
 * @param color
 */
function _drawNodes(ctx: CanvasRenderingContext2D, nodes: NodePoint[], color: string): void {
    for (const node of nodes) {
        // Glow effect (subtle)
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, NODE_RADIUS * 1.8);
        gradient.addColorStop(0, _withOpacity(color, 0.15));
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(node.x - NODE_RADIUS * 2, node.y - NODE_RADIUS * 2, NODE_RADIUS * 4, NODE_RADIUS * 4);

        // Node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = _withOpacity(color, 0.2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

/**
 * @param ctx
 * @param node
 */
function _drawEllipsisNode(ctx: CanvasRenderingContext2D, node: NodePoint | undefined): void {
    if (!node) return;
    ctx.font = '14px sans-serif';
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('···', node.x, node.y);
}

// ----------------------------------------------------------------
// LABEL DRAWING - Variable names next to nodes
// ----------------------------------------------------------------

/**
 * @param ctx
 * @param nodes
 * @param mappedVars
 * @param side
 * @param _canvasWidth
 */
function _drawLabels(
    ctx: CanvasRenderingContext2D,
    nodes: NodePoint[],
    mappedVars: VariableMapping[] | undefined,
    side: 'left' | 'right',
    _canvasWidth: number
): void {
    if (!mappedVars) return;

    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'middle';

    for (let i = 0; i < nodes.length && i < mappedVars.length; i++) {
        const label = _truncate((mappedVars[i] as VariableMapping).variableId, 12);
        ctx.fillStyle = COLORS.labelText;

        if (side === 'left') {
            ctx.textAlign = 'right';
            ctx.fillText(label, (nodes[i] as NodePoint).x - NODE_RADIUS - 6, (nodes[i] as NodePoint).y);
        } else {
            ctx.textAlign = 'left';
            ctx.fillText(label, (nodes[i] as NodePoint).x + NODE_RADIUS + 6, (nodes[i] as NodePoint).y);
        }
    }
}

/**
 * @param ctx
 * @param x
 * @param y
 * @param text
 */
function _drawLayerLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
    ctx.font = LAYER_FONT;
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, x, y);
}

// ----------------------------------------------------------------
// UTILITIES
// ----------------------------------------------------------------

/**
 * @param str
 * @param max
 * @returns
 */
function _truncate(str: string | null | undefined, max: number): string {
    if (!str) return '';
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/**
 * @param hexColor
 * @param opacity
 * @returns
 */
function _withOpacity(hexColor: string, opacity: number): string {
    // Convert hex to rgba
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Resolve theme colors from CSS custom properties.
 * Falls back to hardcoded defaults if not available.
 * @param canvas
 */
function _resolveThemeColors(canvas: HTMLCanvasElement): void {
    try {
        const style = getComputedStyle(canvas);
        const resolve = (varName: string, fallback: string): string => {
            const val = style.getPropertyValue(varName).trim();
            return val || fallback;
        };

        COLORS.input = resolve('--accent-blue', '#3b82f6');
        COLORS.output = resolve('--accent-green', '#22c55e');
        COLORS.posWeight = resolve('--accent-blue', '#3b82f6');
        COLORS.negWeight = resolve('--accent-red', '#ef4444');
        COLORS.labelText = resolve('--window-text', '#334155');
        COLORS.text = resolve('--neutral-500', '#64748b');
    } catch (e) {
        console.debug('[networkDiagram] resolveColors:', (e as any)?.message || e);
        /* ignore — use defaults */
    }
}
