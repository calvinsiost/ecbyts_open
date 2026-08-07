// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SENTINEL Calvin 2026-06-07: 3ª vista do painel Relations.
//
// Tree Diagram clássico (boxes conectados, top-down) — alternativa ao Sunburst
// (radial) e à Árvore vertical (indented list).
//
// Pesquisa: WebSearch 2026-06-07 (UX Patterns Dev tree view + IxDF tree diagrams
// + Justinmind tree alternatives + Retool tree UI). Best practices 2026:
//  - Nodes alinhados por nível hierárquico
//  - Linhas conectoras pai→filho
//  - Layout top-down para hierarquia organizacional
//  - Boxes com nome + meta (família/severity)
//  - Auto-spacing para evitar overlap
//
// Pure-logic: zero DOM/Canvas. Recebe árvore → posições xy dos boxes + linhas.
// Caller (renderer) desenha boxes (rect) + linhas (line/path).
//
// Algoritmo: Reingold-Tilford 1981 simplificado — first/second pass para
// computar x relativo por subtree width (sem overlap). Variação custom para
// canvas vanilla (mais simples que full R-T por brevidade).

console.debug('[mod:load]', 'app/js/utils/ui/homeGrid/_relationsBoxTreeLayout.ts');

export type BoxTreeSeverity = 'intervention' | 'prevention' | 'reference' | null;

export interface BoxTreeNode {
    readonly id: string;
    readonly name: string;
    readonly family: string;
    readonly severity?: BoxTreeSeverity;
    readonly children?: ReadonlyArray<BoxTreeNode>;
}

export interface BoxTreeConfig {
    readonly width: number;
    readonly height: number;
    /** Largura do box em px. Default 80. */
    readonly boxWidth?: number;
    /** Altura do box em px. Default 36. */
    readonly boxHeight?: number;
    /** Espaço horizontal entre boxes irmãos. Default 12. */
    readonly hGap?: number;
    /** Espaço vertical entre níveis. Default 36. */
    readonly vGap?: number;
    /** Profundidade máxima a renderizar. Default 3. */
    readonly maxDepth?: number;
    /** Margem do viewport. Default 12. */
    readonly margin?: number;
}

export interface BoxTreeBox {
    readonly nodeId: string;
    readonly name: string;
    readonly family: string;
    readonly severity: BoxTreeSeverity;
    readonly depth: number;
    /** Top-left x do box (px). */
    readonly x: number;
    /** Top-left y do box (px). */
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly hasChildren: boolean;
}

export interface BoxTreeEdge {
    /** Pai box center bottom. */
    readonly x1: number;
    readonly y1: number;
    /** Filho box center top. */
    readonly x2: number;
    readonly y2: number;
    readonly parentId: string;
    readonly childId: string;
}

export interface BoxTreeLayout {
    readonly width: number;
    readonly height: number;
    readonly boxes: ReadonlyArray<BoxTreeBox>;
    readonly edges: ReadonlyArray<BoxTreeEdge>;
    readonly maxDepthReached: number;
    /** Total boxes (inclui root). */
    readonly totalBoxes: number;
    /** Largura real ocupada (pode exceder cfg.width — scroll horizontal aceito). */
    readonly contentWidth: number;
    /** Altura real ocupada. */
    readonly contentHeight: number;
}

// ============================================================================
// API
// ============================================================================

/**
 * Computa layout em árvore top-down.
 *
 * Algoritmo simplificado:
 *  1. First pass DFS: computa subtree width recursivo (Σ children width + gaps)
 *  2. Second pass DFS: atribui x absoluto a cada box (centrado pelo subtree)
 *  3. y derivado de depth × (boxHeight + vGap)
 *  4. Edges: do center-bottom do pai ao center-top do filho
 */
export function computeBoxTreeLayout(root: BoxTreeNode, cfg: BoxTreeConfig): BoxTreeLayout {
    const W = Math.max(120, cfg.width | 0);
    const H = Math.max(120, cfg.height | 0);
    const MARGIN = cfg.margin ?? 12;
    const BOX_W = cfg.boxWidth ?? 80;
    const BOX_H = cfg.boxHeight ?? 36;
    const H_GAP = cfg.hGap ?? 12;
    const V_GAP = cfg.vGap ?? 36;
    const MAX_DEPTH = Math.max(1, Math.min(6, cfg.maxDepth ?? 3));

    // Truncate tree to maxDepth
    interface Walk {
        node: BoxTreeNode;
        depth: number;
        children: Walk[];
        subtreeWidth: number;
    }

    function walk(n: BoxTreeNode, depth: number): Walk {
        const kids = depth < MAX_DEPTH ? (n.children || []) : [];
        const wkids = kids.map((c) => walk(c, depth + 1));
        // Subtree width = max(box_w, sum_of_children_subtree_widths + (n-1)*H_GAP)
        const childrenW =
            wkids.length === 0
                ? 0
                : wkids.reduce((s, k) => s + k.subtreeWidth, 0) + (wkids.length - 1) * H_GAP;
        const subtreeWidth = Math.max(BOX_W, childrenW);
        return { node: n, depth, children: wkids, subtreeWidth };
    }

    const rootWalk = walk(root, 0);

    const boxes: BoxTreeBox[] = [];
    const edges: BoxTreeEdge[] = [];
    let totalBoxes = 0;
    let maxDepthReached = 0;

    /**
     * Second pass: x atribuído baseado em subtree width, centralizado.
     * O parâmetro cursorX é o left-edge x dado para esta subtree.
     */
    function place(w: Walk, cursorX: number): void {
        const myX = cursorX + (w.subtreeWidth - BOX_W) / 2;
        const myY = MARGIN + w.depth * (BOX_H + V_GAP);
        const box: BoxTreeBox = Object.freeze({
            nodeId: String(w.node.id),
            name: String(w.node.name),
            family: String(w.node.family || ''),
            severity: (w.node.severity ?? null) as BoxTreeSeverity,
            depth: w.depth,
            x: myX,
            y: myY,
            w: BOX_W,
            h: BOX_H,
            hasChildren: w.children.length > 0,
        });
        boxes.push(box);
        totalBoxes++;
        if (w.depth > maxDepthReached) maxDepthReached = w.depth;
        // Place children left-to-right
        let childCursor = cursorX;
        for (const c of w.children) {
            const childCenterX_will = childCursor + c.subtreeWidth / 2;
            const childBoxX = childCursor + (c.subtreeWidth - BOX_W) / 2;
            const childBoxY = MARGIN + c.depth * (BOX_H + V_GAP);
            edges.push(
                Object.freeze({
                    x1: myX + BOX_W / 2,
                    y1: myY + BOX_H,
                    x2: childBoxX + BOX_W / 2,
                    y2: childBoxY,
                    parentId: box.nodeId,
                    childId: String(c.node.id),
                }),
            );
            void childCenterX_will;
            place(c, childCursor);
            childCursor += c.subtreeWidth + H_GAP;
        }
    }

    place(rootWalk, MARGIN);

    const contentWidth = rootWalk.subtreeWidth + MARGIN * 2;
    const contentHeight = MARGIN * 2 + (maxDepthReached + 1) * BOX_H + maxDepthReached * V_GAP;

    return Object.freeze({
        width: W,
        height: H,
        boxes: Object.freeze(boxes),
        edges: Object.freeze(edges),
        maxDepthReached,
        totalBoxes,
        contentWidth,
        contentHeight,
    });
}

/**
 * Hit-test: dado clique (px, py), retorna o box atingido (ou null).
 * Iteração linear (N usualmente baixo, < 50).
 */
export function hitTestBox(layout: BoxTreeLayout, px: number, py: number): BoxTreeBox | null {
    for (const b of layout.boxes) {
        if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    }
    return null;
}

/**
 * Cor de outline por severity (mirror de severityStrokeColor sunburst).
 */
export function boxSeverityColor(sev: BoxTreeSeverity): string | null {
    if (sev === 'intervention') return '#ef4444';
    if (sev === 'prevention') return '#fbbf24';
    if (sev === 'reference') return '#60a5fa';
    return null;
}
