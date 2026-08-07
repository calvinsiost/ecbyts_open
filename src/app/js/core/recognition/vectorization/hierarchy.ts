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
   HIERARCHY — RETR_TREE contour hierarchy parser
   ================================================================

   Converte a hierarquia flat retornada por cv.findContours(RETR_TREE)
   em arvore com parent_id e hierarchy_level para GeoJSON.

   OpenCV RETR_TREE retorna para cada contorno i:
     hierarchy[i] = [next, previous, first_child, parent]
   onde -1 significa "nao tem".

   TOPOLOGIA (REGRA CRITICA):
   - Contorno filho que e um VOID na mascara binaria → HOLE (anel interno
     do poligono pai, winding CW). Deve ser adicionado ao array de
     coordenadas do pai, NAO como feature separada.
   - Contorno filho que vem de detalhe RGB (objeto no telhado) →
     MICRO-FEATURE separada com parent_id apontando para o pai.

   Para a mascara binaria, a convencao do OpenCV e:
   - depth 0 (raiz): outer boundary → Polygon exterior ring
   - depth 1 (filho direto): hole inside the polygon → Interior ring
   - depth 2 (neto): island inside hole → Nova feature micro
   - depth 3+: alternating hole/island

   ================================================================ */

// ----------------------------------------------------------------
// HIERARCHY TREE BUILDER
// ----------------------------------------------------------------

export interface HierarchyNode {
    /** Indice do contorno */
    index: number;
    next: number;
    prev: number;
    firstChild: number;
    /** Indice do pai (-1 = raiz) */
    parentIdx: number;
    /** Indices dos filhos diretos */
    childrenIdx: number[];
    /** Profundidade na arvore (0 = raiz) */
    depth: number;
    /** 'exterior' | 'hole' | 'island' */
    role: string;
}

export interface VectorFeature {
    _contourIdx?: number;
    _vectorId?: string | number;
    contour?: Array<Array<number>>;
    hierarchy_level?: string;
    parent_id?: string | number | null;
    _isHole?: boolean;
}

/**
 * Parse OpenCV flat hierarchy array into a tree structure.
 * Cada contorno recebe parentIdx, childrenIdx[], e depth.
 *
 * @param hierarchyData - Raw hierarchy mat data
 *   Layout: [next0, prev0, child0, parent0, next1, prev1, child1, parent1, ...]
 *   Cada contorno ocupa 4 posicoes consecutivas.
 * @param contourCount - Numero de contornos
 * @returns Map de indice → node
 */
export function buildHierarchyTree(
    hierarchyData: Int32Array | Array<number>,
    contourCount: number,
): Map<number, HierarchyNode> {
    const tree = new Map<number, HierarchyNode>();

    // Pass 1: Initialize nodes from flat array
    // Layout: 4 ints per contour → [next, prev, first_child, parent]
    for (let i = 0; i < contourCount; i++) {
        const offset = i * 4;
        tree.set(i, {
            index: i,
            next: hierarchyData[offset] as number,
            prev: hierarchyData[offset + 1] as number,
            firstChild: hierarchyData[offset + 2] as number,
            parentIdx: hierarchyData[offset + 3] as number,
            childrenIdx: [],
            depth: 0,
            role: 'exterior',
        });
    }

    // Pass 2: Build children lists
    for (const [idx, node] of tree) {
        if (node.parentIdx >= 0 && tree.has(node.parentIdx)) {
            const parent = tree.get(node.parentIdx);
            if (parent) parent.childrenIdx.push(idx);
        }
    }

    // Pass 3: Compute depths via BFS from roots
    const queue: number[] = [];
    for (const [idx, node] of tree) {
        if (node.parentIdx === -1) {
            node.depth = 0;
            node.role = 'exterior';
            queue.push(idx);
        }
    }

    while (queue.length > 0) {
        const current = queue.shift() as number;
        const cNode = tree.get(current);
        if (!cNode) continue;

        for (const childIdx of cNode.childrenIdx) {
            const child = tree.get(childIdx);
            if (!child) continue;
            child.depth = cNode.depth + 1;

            // OpenCV binary mask convention:
            // Even depth (0, 2, 4...) = exterior boundary (solid region)
            // Odd depth (1, 3, 5...)  = hole boundary (void region)
            child.role = child.depth % 2 === 0 ? 'island' : 'hole';

            queue.push(childIdx);
        }
    }

    return tree;
}

// ----------------------------------------------------------------
// HIERARCHY ASSIGNMENT - Set parent_id and hierarchy_level
// ----------------------------------------------------------------

/**
 * Assign hierarchy_level and parent_id to vectorized features.
 * Diferencia HOLES (aneis internos do poligono pai) de MICRO-FEATURES
 * (features separadas com parent_id).
 *
 * @param features - Features com campo _contourIdx
 *   Cada feature deve ter: { _contourIdx, _vectorId, contour, ... }
 * @param tree - Arvore do buildHierarchyTree
 * @returns features atualizadas com hierarchy_level e parent_id
 *   holes: Map<parentContourIdx, [holeContour1, holeContour2, ...]>
 *     para serem adicionadas como aneis internos no GeoJSON
 */
export function assignHierarchy(
    features: Array<VectorFeature>,
    tree: Map<number, HierarchyNode>,
): { features: Array<VectorFeature>; holes: Map<number, Array<Array<Array<number>>>> } {
    // Build lookup: contourIdx → feature _vectorId
    const contourToFeature = new Map<number, VectorFeature>();
    for (const f of features) {
        if (f._contourIdx != null) {
            contourToFeature.set(f._contourIdx, f);
        }
    }

    // Collect holes (odd-depth contours) separately
    // Estes NAO viram features - sao aneis internos do pai
    const holes = new Map<number, Array<Array<Array<number>>>>();

    for (const f of features) {
        const node = f._contourIdx != null ? tree.get(f._contourIdx) : undefined;
        if (!node) {
            // Fallback: no hierarchy info → treat as top-level macro
            f.hierarchy_level = 'macro';
            f.parent_id = null;
            continue;
        }

        if (node.depth === 0) {
            // Root contour - macro feature
            f.hierarchy_level = 'macro';
            f.parent_id = null;
        } else if (node.role === 'hole') {
            // Odd depth = hole in parent polygon
            // Mark for removal from features list - will be added as inner ring
            f._isHole = true;
            f.hierarchy_level = 'hole';

            // Find the exterior parent (go up until role === 'exterior' or depth 0)
            const parentNode = _findExteriorAncestor(node, tree);
            if (parentNode) {
                if (!holes.has(parentNode.index)) {
                    holes.set(parentNode.index, []);
                }
                const existing = holes.get(parentNode.index) || [];
                if (f.contour) holes.set(parentNode.index, [...existing, f.contour]);
            }
        } else {
            // Even depth > 0 = island inside hole → micro-feature
            f.hierarchy_level = 'micro';

            // Find nearest exterior ancestor as parent
            const parentNodeForAncestor = tree.get(node.parentIdx);
            const ancestor = parentNodeForAncestor ? _findExteriorAncestor(parentNodeForAncestor, tree) : null;
            const parentFeature = ancestor ? contourToFeature.get(ancestor.index) : null;
            f.parent_id = parentFeature?._vectorId ?? null;
        }
    }

    // Remove hole-marked features - they become inner rings, not features
    const filtered = features.filter((f) => !f._isHole);

    return { features: filtered, holes };
}

// ----------------------------------------------------------------
// INTERNAL - Find nearest exterior (even-depth) ancestor
// Sobe na arvore ate encontrar contorno exterior
// ----------------------------------------------------------------

/**
 * Walk up the hierarchy tree until finding an exterior (even-depth) node.
 */
function _findExteriorAncestor(
    node: HierarchyNode,
    tree: Map<number, HierarchyNode>,
): HierarchyNode | null {
    let current: HierarchyNode | undefined = node;
    let safety = 100; // Prevent infinite loops

    while (current && safety-- > 0) {
        if (current.role === 'exterior' || current.depth === 0) {
            return current;
        }
        if (current.parentIdx < 0) return null;
        current = tree.get(current.parentIdx);
    }

    return null;
}
