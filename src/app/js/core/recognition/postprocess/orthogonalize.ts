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
   ORTHOGONALIZE — Global axis-aligned building regularization
   ================================================================

   Algoritmo de ortogonalizacao global para edificios detectados por
   IA. Diferente do regularizePolygon (simplify.js) que opera
   localmente vertice-a-vertice, este modulo detecta a orientacao
   dominante do poligono e forca TODAS as arestas a se alinharem
   ao eixo dominante ou sua perpendicular.

   Pipeline:
   1. Detecta orientacao dominante (histograma ponderado por comprimento)
   2. Classifica arestas (dominant / perpendicular / oblique)
   3. Snap arestas para angulos exatos
   4. Reconstroi vertices distribuindo erro de fechamento
   5. Valida: area preservada ±15%, sem auto-intersecoes

   Suporta formas L, T, U: se contourRectFillRatio < 0.85, mantém
   poligono multi-aresta ortogonal em vez de colapsar para retangulo.

   ================================================================ */

// TRUST-009 G3: consolidação — usa segmentsIntersect canônico em vez de fork local.
import { segmentsIntersect as _canonicalSegmentsIntersect } from '../../boundary/polygonGeometry.js';

interface Pt {
    x: number;
    y: number;
}

const TWO_PI = 2 * Math.PI;
const HALF_PI = Math.PI / 2;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// ----------------------------------------------------------------
// DOMINANT ORIENTATION - Weighted edge angle histogram
// Histograma de angulos ponderado por comprimento de aresta
// ----------------------------------------------------------------

/**
 * Compute dominant edge orientation of a polygon.
 * Calcula orientacao dominante ponderada por comprimento de aresta.
 * Angulos sao mapeados para [0, PI/2) pois direcoes opostas sao
 * equivalentes para edificios (norte=sul, leste=oeste).
 *
 * @param vertices - Polygon vertices
 * @returns - Dominant angle in radians [0, PI/2)
 */
export function dominantOrientation(vertices: Array<Pt>): number {
    if (vertices.length < 3) return 0;

    const n = vertices.length;
    // Histograma com bins de 1 grau (90 bins para [0, 90))
    const BINS = 90;
    const hist = new Float64Array(BINS);

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const dx = (vertices[j] as Pt).x - (vertices[i] as Pt).x;
        const dy = (vertices[j] as Pt).y - (vertices[i] as Pt).y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-6) continue;

        // Map angle to [0, PI/2) - direcoes opostas sao equivalentes
        let angle = Math.atan2(dy, dx);
        angle = ((angle % Math.PI) + Math.PI) % Math.PI; // [0, PI)
        if (angle >= HALF_PI) angle -= HALF_PI; // [0, PI/2)

        const bin = Math.min(Math.floor(angle * RAD_TO_DEG), BINS - 1);
        hist[bin] = (hist[bin] ?? 0) + len; // Peso = comprimento da aresta
    }

    // Encontra o bin com maior peso (peak)
    let peakBin = 0;
    let peakVal = 0;
    for (let b = 0; b < BINS; b++) {
        if ((hist[b] as number) > peakVal) {
            peakVal = hist[b] as number;
            peakBin = b;
        }
    }

    // Media ponderada circular ao redor do peak (±5 bins)
    const WINDOW = 5;
    let sumAngle = 0;
    let sumWeight = 0;
    for (let d = -WINDOW; d <= WINDOW; d++) {
        const b = (((peakBin + d) % BINS) + BINS) % BINS;
        const w = hist[b] as number;
        if (w > 0) {
            // Usar offset do peak para evitar descontinuidade circular
            sumAngle += d * w;
            sumWeight += w;
        }
    }

    const refinedBin = peakBin + (sumWeight > 0 ? sumAngle / sumWeight : 0);
    return (((refinedBin % BINS) + BINS) % BINS) * DEG_TO_RAD;
}

// ----------------------------------------------------------------
// MINIMUM BOUNDING RECTANGLE - Rotating calipers
// Retangulo minimo orientado que contem todos os vertices
// ----------------------------------------------------------------

/**
 * Compute convex hull of 2D points using Andrew's monotone chain.
 * Retorna vertices em ordem CCW.
 *
 * @param points
 * @returns
 */
function convexHull(points: Array<Pt>): Array<Pt> {
    const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const n = pts.length;
    if (n <= 2) return pts.slice();

    const lower: Pt[] = [];
    for (let i = 0; i < n; i++) {
        while (
            lower.length >= 2 &&
            _cross(lower[lower.length - 2] as Pt, lower[lower.length - 1] as Pt, pts[i] as Pt) <= 0
        ) {
            lower.pop();
        }
        lower.push(pts[i] as Pt);
    }

    const upper: Pt[] = [];
    for (let i = n - 1; i >= 0; i--) {
        while (
            upper.length >= 2 &&
            _cross(upper[upper.length - 2] as Pt, upper[upper.length - 1] as Pt, pts[i] as Pt) <= 0
        ) {
            upper.pop();
        }
        upper.push(pts[i] as Pt);
    }

    // Remove last point of each half (duplicated at junction)
    lower.pop();
    upper.pop();
    return lower.concat(upper);
}

/**
 * Minimum Bounding Rectangle (MBR) via rotating calipers.
 * Retangulo minimo orientado que contem todos os vertices.
 * Testa cada aresta do convex hull como base do retangulo.
 *
 * @param vertices
 * @returns
 */
export function minimumBoundingRectangle(vertices: Array<Pt>): {
    corners: Array<Pt>;
    angle: number;
    width: number;
    height: number;
} {
    if (vertices.length < 3) {
        return { corners: vertices.slice(), angle: 0, width: 0, height: 0 };
    }

    const hull = convexHull(vertices);
    const n = hull.length;
    if (n < 3) {
        return { corners: hull.slice(), angle: 0, width: 0, height: 0 };
    }

    let bestArea = Infinity;
    let bestCorners: Pt[] | null = null;
    let bestAngle = 0;
    let bestW = 0;
    let bestH = 0;

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const edgeDx = (hull[j] as Pt).x - (hull[i] as Pt).x;
        const edgeDy = (hull[j] as Pt).y - (hull[i] as Pt).y;
        const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
        if (edgeLen < 1e-10) continue;

        // Eixo da aresta (unitario)
        const ux = edgeDx / edgeLen;
        const uy = edgeDy / edgeLen;
        // Perpendicular
        const vx = -uy;
        const vy = ux;

        // Projetar todos os pontos do hull nos dois eixos
        let minU = Infinity,
            maxU = -Infinity;
        let minV = Infinity,
            maxV = -Infinity;

        for (let k = 0; k < n; k++) {
            const px = (hull[k] as Pt).x - (hull[i] as Pt).x;
            const py = (hull[k] as Pt).y - (hull[i] as Pt).y;
            const projU = px * ux + py * uy;
            const projV = px * vx + py * vy;
            if (projU < minU) minU = projU;
            if (projU > maxU) maxU = projU;
            if (projV < minV) minV = projV;
            if (projV > maxV) maxV = projV;
        }

        const w = maxU - minU;
        const h = maxV - minV;
        const area = w * h;

        if (area < bestArea) {
            bestArea = area;
            bestW = w;
            bestH = h;
            bestAngle = Math.atan2(uy, ux);

            // 4 cantos do retangulo no espaco original
            const ox = (hull[i] as Pt).x;
            const oy = (hull[i] as Pt).y;
            bestCorners = [
                { x: ox + minU * ux + minV * vx, y: oy + minU * uy + minV * vy },
                { x: ox + maxU * ux + minV * vx, y: oy + maxU * uy + minV * vy },
                { x: ox + maxU * ux + maxV * vx, y: oy + maxU * uy + maxV * vy },
                { x: ox + minU * ux + maxV * vx, y: oy + minU * uy + maxV * vy },
            ];
        }
    }

    return {
        corners: bestCorners || vertices.slice(0, 4),
        angle: bestAngle,
        width: bestW,
        height: bestH,
    };
}

// ----------------------------------------------------------------
// ORTHOGONALIZE - Main algorithm
// Forca todas as arestas para dominant axis ou perpendicular
// ----------------------------------------------------------------

/**
 * Orthogonalize a building polygon to dominant axis + perpendicular.
 * Transforma poligono irregular em geometria com angulos estritamente 90/180.
 *
 * Algoritmo global (diferente do regularizePolygon local):
 * 1. Detecta orientacao dominante do poligono inteiro
 * 2. Classifica cada aresta como dominant/perpendicular/oblique
 * 3. Snap arestas para angulos exatos
 * 4. Reconstroi vertices distribuindo erro de fechamento
 * 5. Valida resultado; fallback para MBR se necessario
 *
 * @param angle - Input polygon
 * @param dominant
 * @param options.angleTolerance - Degrees within which to snap
 * @param options.minEdgeLength - Min edge length to preserve (pixels)
 * @param options.forceRect - If true, always output 4-vertex MBR
 * @returns - Orthogonalized polygon
 */
interface Edge {
    dx: number;
    dy: number;
    len: number;
    angle: number;
    from: number;
    to: number;
}

interface SnappedEdge {
    len: number;
    angle: number;
    originalAngle: number;
}

function _shouldCollapseToMBR(
    vertices: Array<Pt>,
    mbr: { width: number; height: number; corners: Array<Pt> },
    originalArea: number,
): boolean {
    const mbrArea = mbr.width * mbr.height;
    const fillRatio = mbrArea > 0 ? originalArea / mbrArea : 0;
    return fillRatio > 0.85 && vertices.length <= 6;
}

function _buildEdges(vertices: Array<Pt>): Array<Edge> {
    const n = vertices.length;
    const edges: Array<Edge> = [];
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const dx = vertices[j]!.x - vertices[i]!.x;
        const dy = vertices[j]!.y - vertices[i]!.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        edges.push({ dx, dy, len, angle, from: i, to: j });
    }
    return edges;
}

function _snapEdges(edges: Array<Edge>, dominant: number, tolRad: number, minEdgeLength: number): Array<SnappedEdge> | null {
    const filtered = edges.filter((e) => e.len >= minEdgeLength);
    if (filtered.length < 3) return null;

    return filtered.map((e) => ({
        len: e.len,
        angle: _snapToAxis(e.angle, dominant, tolRad),
        originalAngle: e.angle,
    }));
}

function _reconstructVertices(snappedEdges: Array<SnappedEdge>, start: Pt): Array<Pt> {
    const reconstructed: Array<Pt> = [{ x: start.x, y: start.y }];
    for (let i = 0; i < snappedEdges.length - 1; i++) {
        const e = snappedEdges[i]!;
        const prev = reconstructed[reconstructed.length - 1]!;
        reconstructed.push({
            x: prev.x + Math.cos(e.angle) * e.len,
            y: prev.y + Math.sin(e.angle) * e.len,
        });
    }
    return reconstructed;
}

function _distributeClosureError(reconstructed: Array<Pt>, snappedEdges: Array<SnappedEdge>): void {
    const last = reconstructed[reconstructed.length - 1]!;
    const lastEdge = snappedEdges[snappedEdges.length - 1]!;
    const expectedEnd = {
        x: last.x + Math.cos(lastEdge.angle) * lastEdge.len,
        y: last.y + Math.sin(lastEdge.angle) * lastEdge.len,
    };

    const gapX = reconstructed[0]!.x - expectedEnd.x;
    const gapY = reconstructed[0]!.y - expectedEnd.y;

    const totalVerts = reconstructed.length;
    for (let i = 1; i < totalVerts; i++) {
        const t = i / totalVerts;
        reconstructed[i]!.x += gapX * t;
        reconstructed[i]!.y += gapY * t;
    }
}

function _validateOrthogonalized(
    reconstructed: Array<Pt>,
    originalArea: number,
    mbr: { corners: Array<Pt> },
): Array<Pt> {
    const newArea = _polygonArea(reconstructed);
    const areaRatio = originalArea > 0 ? newArea / originalArea : 0;

    if (areaRatio < 0.85 || areaRatio > 1.15) {
        return mbr.corners;
    }

    if (_hasSelfIntersection(reconstructed)) {
        return mbr.corners;
    }

    return reconstructed;
}

export function orthogonalize(
    vertices: Array<Pt>,
    options: { angleTolerance?: number; minEdgeLength?: number; forceRect?: boolean } = {}
): Array<Pt> {
    const { angleTolerance = 20, minEdgeLength = 3, forceRect = false } = options;

    if (vertices.length < 3) return vertices.slice();

    const originalArea = _polygonArea(vertices);
    if (originalArea < 1) return vertices.slice();

    if (forceRect) {
        return minimumBoundingRectangle(vertices).corners;
    }

    const mbr = minimumBoundingRectangle(vertices);
    if (_shouldCollapseToMBR(vertices, mbr, originalArea)) {
        return mbr.corners;
    }

    const dominant = dominantOrientation(vertices);
    const tolRad = angleTolerance * DEG_TO_RAD;

    const edges = _buildEdges(vertices);
    const snappedEdges = _snapEdges(edges, dominant, tolRad, minEdgeLength);
    if (!snappedEdges) {
        return mbr.corners;
    }

    const reconstructed = _reconstructVertices(snappedEdges, vertices[0]!);
    _distributeClosureError(reconstructed, snappedEdges);

    return _validateOrthogonalized(reconstructed, originalArea, mbr);
}

// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------

/**
 * Snap an angle to the nearest dominant axis direction.
 * Eixos candidatos: dominant, dominant+90, dominant+180, dominant+270.
 *
 * @param angle - Edge angle in radians
 * @param dominant - Dominant axis in radians [0, PI/2)
 * @param tolerance - Snap tolerance in radians
 * @returns - Snapped angle or original if outside tolerance
 */
function _snapToAxis(angle: number, dominant: number, tolerance: number): number {
    // 4 direcoes candidatas (cada 90 graus a partir do dominante)
    const candidates = [dominant, dominant + HALF_PI, dominant + Math.PI, dominant + HALF_PI * 3];

    let bestDiff = Infinity;
    let bestCandidate = angle;

    for (const c of candidates) {
        // Diferenca angular normalizada para [-PI, PI]
        let diff = angle - c;
        diff = ((((diff + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
        const absDiff = Math.abs(diff);

        if (absDiff < bestDiff) {
            bestDiff = absDiff;
            bestCandidate = c;
        }
    }

    // Snap somente se dentro da tolerancia
    return bestDiff <= tolerance ? bestCandidate : angle;
}

/**
 * Calculate signed area of polygon (Shoelace formula).
 * Area positiva = CCW, negativa = CW. Retorna valor absoluto.
 *
 * @param verts
 * @returns - Absolute area
 */
function _polygonArea(verts: Array<Pt>): number {
    let area = 0;
    const n = verts.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += (verts[i] as Pt).x * (verts[j] as Pt).y;
        area -= (verts[j] as Pt).x * (verts[i] as Pt).y;
    }
    return Math.abs(area) / 2;
}

/**
 * Check if polygon has self-intersections.
 * Testa todos os pares de arestas nao-adjacentes por intersecao.
 * O(n^2) mas n e pequeno (< 20 vertices tipicamente).
 *
 * @param verts
 * @returns
 */
function _hasSelfIntersection(verts: Array<Pt>): boolean {
    const n = verts.length;
    if (n < 4) return false;

    for (let i = 0; i < n; i++) {
        const i2 = (i + 1) % n;
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue; // Arestas adjacentes (wrap)
            const j2 = (j + 1) % n;
            if (
                _canonicalSegmentsIntersect(
                    verts[i] as Pt,
                    verts[i2] as Pt,
                    verts[j] as Pt,
                    verts[j2] as Pt,
                )
            ) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Cross product of vectors (O→A) and (O→B).
 * Positivo = B esta a esquerda de OA (CCW).
 * NOTE: _segmentsIntersect local removido 2026-05-30 (TRUST-009 G3 consolidação)
 * — usa segmentsIntersect canônico de core/boundary/polygonGeometry.
 *
 * @param o
 * @param a
 * @param b
 * @returns
 */
function _cross(o: Pt, a: Pt, b: Pt): number {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}
