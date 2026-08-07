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

/* ================================================================
   MARCHING SQUARES — Pure-JS contour extraction from binary masks
   ================================================================

   Alternativa pura JS ao cv.findContours para quando OpenCV nao
   esta carregado. Extrai contornos (polylines) de mascaras binarias
   usando o algoritmo Marching Squares com interpolacao sub-pixel.

   Lookup table com 16 casos baseada na configuracao dos 4 cantos
   de cada celula (2x2 pixels). Cada caso define quais arestas da
   celula sao cruzadas pelo contorno.

   Complexidade: O(W * H) para uma varredura completa.
   Performance: < 50ms para mascara 512x512 tipica.

   ================================================================ */

interface Point {
    x: number;
    y: number;
}

// ----------------------------------------------------------------
// LOOKUP TABLE - 16 cell configurations
// Cada entrada: array de pares [from_edge, to_edge]
// Edges: 0=top, 1=right, 2=bottom, 3=left
// ----------------------------------------------------------------

// Configuracao dos 4 cantos (TL, TR, BR, BL) → bits 0-3
// Case 0 (0000) e Case 15 (1111): sem contorno (todos iguais)
// Cases 5 e 10: ambiguos (saddle points) → resolvidos pela media central
const EDGE_TABLE: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
    [], // 0:  0000 — all outside
    [[3, 2]], // 1:  0001 — BL inside
    [[2, 1]], // 2:  0010 — BR inside
    [[3, 1]], // 3:  0011 — BL+BR inside
    [[1, 0]], // 4:  0100 — TR inside
    [
        [3, 0],
        [1, 2],
    ], // 5:  0101 — BL+TR inside (saddle, default)
    [[2, 0]], // 6:  0010+0100 — BR+TR inside
    [[3, 0]], // 7:  0111 — BL+BR+TR inside
    [[0, 3]], // 8:  1000 — TL inside
    [[0, 2]], // 9:  1001 — TL+BL inside
    [
        [0, 1],
        [2, 3],
    ], // 10: 1010 — TL+BR inside (saddle, default)
    [[0, 1]], // 11: 1011 — TL+BL+BR inside
    [[1, 3]], // 12: 1100 — TL+TR inside
    [[1, 2]], // 13: 1101 — TL+TR+BL inside
    [[2, 3]], // 14: 1110 — TL+TR+BR inside
    [], // 15: 1111 — all inside
];

// ----------------------------------------------------------------
// MAIN FUNCTION - Extract all contours from binary mask
// ----------------------------------------------------------------

function _cellValue(mask: Uint8Array, index: number): number {
    return mask[index] ?? 0;
}

function _cellConfig(mask: Uint8Array, width: number, cx: number, cy: number, threshold: number): number {
    const tl = _cellValue(mask, cy * width + cx) >= threshold ? 1 : 0;
    const tr = _cellValue(mask, cy * width + cx + 1) >= threshold ? 1 : 0;
    const br = _cellValue(mask, (cy + 1) * width + cx + 1) >= threshold ? 1 : 0;
    const bl = _cellValue(mask, (cy + 1) * width + cx) >= threshold ? 1 : 0;
    return (tl << 3) | (tr << 2) | (br << 1) | bl;
}

function _cellCenterMean(mask: Uint8Array, width: number, cx: number, cy: number): number {
    return (
        (_cellValue(mask, cy * width + cx) +
            _cellValue(mask, cy * width + cx + 1) +
            _cellValue(mask, (cy + 1) * width + cx + 1) +
            _cellValue(mask, (cy + 1) * width + cx)) /
        4
    );
}

function _resolveCellEdges(
    config: number,
    centerMean: number,
    threshold: number,
): ReadonlyArray<readonly [number, number]> {
    let edges = EDGE_TABLE[config] as ReadonlyArray<readonly [number, number]>;
    if (config === 5 && centerMean >= threshold) {
        edges = [
            [3, 2],
            [1, 0],
        ];
    } else if (config === 10 && centerMean >= threshold) {
        edges = [
            [0, 3],
            [2, 1],
        ];
    }
    return edges;
}

function _appendCellSegments(
    segments: number[],
    cx: number,
    cy: number,
    edges: ReadonlyArray<readonly [number, number]>,
    mask: Uint8Array,
    width: number,
    threshold: number,
): void {
    for (const [fromEdge, toEdge] of edges) {
        const p1 = _edgePoint(cx, cy, fromEdge, mask, width, threshold);
        const p2 = _edgePoint(cx, cy, toEdge, mask, width, threshold);
        segments.push(p1.x, p1.y, p2.x, p2.y);
    }
}

/**
 * Extract contour polygons from binary mask using Marching Squares.
 * Varre a mascara celula por celula, extrai segmentos de contorno,
 * e encadeia em polylines fechadas.
 *
 * @param mask - Binary mask (0 or 255), row-major
 * @param width - Mask width in pixels
 * @param height - Mask height in pixels
 * @param threshold - Binary threshold
 * @returns Array of closed contour polylines
 */
export function marchingSquares(
    mask: Uint8Array,
    width: number,
    height: number,
    threshold: number = 128,
): Array<Array<Point>> {
    // Grid de celulas: (width-1) x (height-1)
    const cw = width - 1;
    const ch = height - 1;

    // Passo 1: Gerar todos os segmentos de contorno
    // Cada segmento: { x1, y1, x2, y2 } com coordenadas sub-pixel
    const segments: number[] = [];

    for (let cy = 0; cy < ch; cy++) {
        for (let cx = 0; cx < cw; cx++) {
            const config = _cellConfig(mask, width, cx, cy, threshold);
            if (config === 0 || config === 15) continue;

            const centerMean = config === 5 || config === 10 ? _cellCenterMean(mask, width, cx, cy) : 0;
            const edges = _resolveCellEdges(config, centerMean, threshold);
            _appendCellSegments(segments, cx, cy, edges, mask, width, threshold);
        }
    }

    // Passo 2: Encadear segmentos em polylines fechadas
    return _chainSegments(segments);
}

// ----------------------------------------------------------------
// SINGLE CONTOUR - Trace contour around a specific region
// ----------------------------------------------------------------

/**
 * Trace the outer contour starting from a specific seed point.
 * Util para SAM: dada mascara com um unico objeto, extrai contorno.
 *
 * @param mask - Binary mask
 * @param width
 * @param height
 * @param threshold
 * @returns Largest contour or null
 */
export function largestContour(
    mask: Uint8Array,
    width: number,
    height: number,
    threshold: number = 128,
): Array<Point> | null {
    const contours = marchingSquares(mask, width, height, threshold);
    if (contours.length === 0) return null;

    // Retorna o contorno com maior area
    let best = contours[0] as Array<Point>;
    let bestArea = _polyArea(best);

    for (let i = 1; i < contours.length; i++) {
        const ci = contours[i] as Array<Point>;
        const area = _polyArea(ci);
        if (area > bestArea) {
            bestArea = area;
            best = ci;
        }
    }

    return best;
}

// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------

/**
 * Compute sub-pixel point on a cell edge via linear interpolation.
 * Edges: 0=top, 1=right, 2=bottom, 3=left.
 *
 * @param cx - Cell X
 * @param cy - Cell Y
 * @param edge - Edge index (0-3)
 * @param mask - Full mask
 * @param w - Mask width
 * @param threshold
 * @returns
 */
function _edgePoint(
    cx: number,
    cy: number,
    edge: number,
    mask: Uint8Array,
    w: number,
    threshold: number,
): Point {
    switch (edge) {
        case 0: {
            // Top edge: TL → TR
            const vl = mask[cy * w + cx] as number;
            const vr = mask[cy * w + cx + 1] as number;
            const t = _lerp(vl, vr, threshold);
            return { x: cx + t, y: cy };
        }
        case 1: {
            // Right edge: TR → BR
            const vt = mask[cy * w + cx + 1] as number;
            const vb = mask[(cy + 1) * w + cx + 1] as number;
            const t = _lerp(vt, vb, threshold);
            return { x: cx + 1, y: cy + t };
        }
        case 2: {
            // Bottom edge: BL → BR
            const vl = mask[(cy + 1) * w + cx] as number;
            const vr = mask[(cy + 1) * w + cx + 1] as number;
            const t = _lerp(vl, vr, threshold);
            return { x: cx + t, y: cy + 1 };
        }
        case 3: {
            // Left edge: TL → BL
            const vt = mask[cy * w + cx] as number;
            const vb = mask[(cy + 1) * w + cx] as number;
            const t = _lerp(vt, vb, threshold);
            return { x: cx, y: cy + t };
        }
        default:
            return { x: cx + 0.5, y: cy + 0.5 };
    }
}

/**
 * Linear interpolation parameter for threshold crossing.
 * Retorna t em [0,1] onde o threshold e cruzado entre v1 e v2.
 *
 * @param v1 - Value at start
 * @param v2 - Value at end
 * @param threshold
 * @returns Interpolation parameter [0, 1]
 */
function _lerp(v1: number, v2: number, threshold: number): number {
    const denom = v1 - v2;
    if (Math.abs(denom) < 1e-6) return 0.5;
    return Math.max(0, Math.min(1, (v1 - threshold) / denom));
}

/**
 * Chain loose segments into closed polylines.
 * Segmentos sao armazenados como flat array [x1,y1,x2,y2,...].
 * Usa hash espacial para encontrar segmentos vizinhos rapidamente.
 *
 * @param segments - Flat array of segment coords
 * @returns
 */
function _chainSegments(segments: Array<number>): Array<Array<Point>> {
    const numSegs = segments.length / 4;
    if (numSegs === 0) return [];

    // Hash espacial: arredonda coordenadas para chave
    // Precisao de 0.01 para agrupar pontos proximos
    const PRECISION = 100; // 1/100 = 0.01 pixel precision
    const key = (x: any, y: any) =>
        `${Math.round((x as any) * PRECISION)},${Math.round((y as any) * PRECISION)}`;

    // Construir adjacency: endpoint → list of segment indices
    const adj = new Map<string, Array<{ segIdx: number; isEnd2: boolean }>>();

    const addAdj = (k: any, segIdx: any, isEnd2: any) => {
        if (!adj.has(k)) adj.set(k, []);
        const list = adj.get(k);
        if (list) list.push({ segIdx, isEnd2 });
    };

    for (let i = 0; i < numSegs; i++) {
        const base = i * 4;
        const k1 = key(segments[base], segments[base + 1]);
        const k2 = key(segments[base + 2], segments[base + 3]);
        addAdj(k1, i, false);
        addAdj(k2, i, true);
    }

    // Encadear segmentos
    const used = new Uint8Array(numSegs);
    const contours: Array<Array<Point>> = [];

    for (let start = 0; start < numSegs; start++) {
        if (used[start]) continue;

        const chain: Array<Point> = [];
        const current = start;
        used[current] = 1;

        // Adicionar primeiro segmento
        let base = current * 4;
        chain.push(
            { x: segments[base] as number, y: segments[base + 1] as number },
            { x: segments[base + 2] as number, y: segments[base + 3] as number },
        );

        // Seguir encadeamento do endpoint
        let searching = true;
        while (searching) {
            searching = false;
            const lastPt = chain[chain.length - 1] as Point;
            const k = key(lastPt.x, lastPt.y);
            const neighbors = adj.get(k);
            if (!neighbors) break;

            for (const { segIdx, isEnd2 } of neighbors) {
                if (used[segIdx]) continue;
                used[segIdx] = 1;
                searching = true;

                base = segIdx * 4;
                if (isEnd2) {
                    // Endpoint2 coincide → adicionar endpoint1 (reverso)
                    chain.push({ x: segments[base] as number, y: segments[base + 1] as number });
                } else {
                    // Endpoint1 coincide → adicionar endpoint2
                    chain.push({ x: segments[base + 2] as number, y: segments[base + 3] as number });
                }
                break;
            }
        }

        // Aceitar apenas contornos com area significativa (> 4 pixels)
        if (chain.length >= 4 && _polyArea(chain) > 4) {
            contours.push(chain);
        }
    }

    return contours;
}

/**
 * Polygon area via Shoelace (absolute value).
 * @param pts
 * @returns
 */
function _polyArea(pts: Array<Point>): number {
    let area = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const pi = pts[i] as Point;
        const pj = pts[j] as Point;
        area += pi.x * pj.y;
        area -= pj.x * pi.y;
    }
    return Math.abs(area) / 2;
}
