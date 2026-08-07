// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost

/* ================================================================
   CONSTELLATION LAYOUT — Force-directed layout (Fruchterman-Reingold)
   SPEC_CONSTELLATION_HUD_9_75 — Feature B (missing implementation)

   Algoritmo simplificado Fruchterman-Reingold 1991.
   Pure function — sem DOM, sem Three.js, testável em Node.js.

   Referência: Fruchterman, T.M.J. & Reingold, E.M. (1991).
   "Graph Drawing by Force-directed Placement."
   Software Practice & Experience, 21(11), 1129–1164.
   DOI: 10.1002/spe.4380211102
   ================================================================ */

interface ConstellationNode {
    id: string;
    x: number;
    y: number;
}

interface ConstellationEdge {
    sourceId?: string;
    targetId?: string;
    source?: string;
    target?: string;
}

interface ForceDirectedOpts {
    width?: number;
    height?: number;
    iterations?: number;
    k?: number;
}

/**
 * Aplica layout force-directed (Fruchterman-Reingold simplificado).
 * Pure function - não modifica o array de entrada, retorna novas posições.
 *
 * @param {Array<{id: string, x: number, y: number}>} nodes
 * @param {Array<{sourceId?: string, targetId?: string, source?: string, target?: string}>} edges
 * @param {{width?: number, height?: number, iterations?: number, k?: number}} [opts]
 * @returns {Array<{id: string, x: number, y: number}>} novas posições (mesmo comprimento que nodes)
 */
export function forceDirectedLayout(
    nodes: ConstellationNode[],
    edges: ConstellationEdge[],
    opts: ForceDirectedOpts = {},
): ConstellationNode[] {
    if (!Array.isArray(nodes) || nodes.length === 0) return [];

    const width = typeof opts.width === 'number' ? opts.width : 800;
    const height = typeof opts.height === 'number' ? opts.height : 600;
    const iterations = typeof opts.iterations === 'number' ? Math.max(1, opts.iterations) : 50;

    const n = nodes.length;
    // Ideal spring length: k = C * sqrt(area / N), C=1 (Fruchterman & Reingold 1991 eq.1)
    const k = typeof opts.k === 'number' ? opts.k : Math.sqrt((width * height) / Math.max(n, 1));
    const k2 = k * k;

    // Copy positions into mutable arrays
    const px = new Float64Array(n);
    const py = new Float64Array(n);
    const idToIdx = new Map<string, number>();

    for (let i = 0; i < n; i++) {
        const nd = nodes[i] as ConstellationNode;
        px[i] = typeof nd.x === 'number' && isFinite(nd.x) ? nd.x : (Math.random() - 0.5) * width * 0.8;
        py[i] = typeof nd.y === 'number' && isFinite(nd.y) ? nd.y : (Math.random() - 0.5) * height * 0.8;
        if (nd.id !== undefined) idToIdx.set(nd.id, i);
    }

    // Nudge coincident nodes to avoid zero-distance division
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (px[i] === px[j] && py[i] === py[j]) {
                px[j] = (px[j] as number) + 0.1 * (i + 1);
                py[j] = (py[j] as number) + 0.1 * (j + 1);
            }
        }
    }

    const safeEdges = Array.isArray(edges) ? edges : [];
    const halfW = width / 2;
    const halfH = height / 2;

    for (let iter = 0; iter < iterations; iter++) {
        // Temperature decreases linearly: t = width/10 * (1 - iter/iterations)
        // (Fruchterman & Reingold 1991 §4 - simulated annealing cooling schedule)
        const t = (width / 10) * (1 - iter / iterations);

        const dx = new Float64Array(n);
        const dy = new Float64Array(n);

        // Repulsive forces between every pair of nodes: f_r = k²/d
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const ddx = (px[i] as number) - (px[j] as number);
                const ddy = (py[i] as number) - (py[j] as number);
                const distSq = ddx * ddx + ddy * ddy;
                if (distSq < 1e-10) continue;
                const dist = Math.sqrt(distSq);
                const force = k2 / dist; // repulsive magnitude
                const fx = (ddx / dist) * force;
                const fy = (ddy / dist) * force;
                dx[i] = (dx[i] as number) + fx;
                dy[i] = (dy[i] as number) + fy;
                dx[j] = (dx[j] as number) - fx;
                dy[j] = (dy[j] as number) - fy;
            }
        }

        // Attractive forces along edges: f_a = d²/k
        for (let e = 0; e < safeEdges.length; e++) {
            const edge = safeEdges[e];
            if (!edge) continue;
            const srcId = edge.sourceId ?? edge.source;
            const tgtId = edge.targetId ?? edge.target;
            const i = idToIdx.get(srcId as string);
            const j = idToIdx.get(tgtId as string);
            if (i === undefined || j === undefined || i === j) continue;
            const ddx = (px[i] as number) - (px[j] as number);
            const ddy = (py[i] as number) - (py[j] as number);
            const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1e-6;
            const force = (dist * dist) / k; // attractive magnitude
            const fx = (ddx / dist) * force;
            const fy = (ddy / dist) * force;
            dx[i] = (dx[i] as number) - fx;
            dy[i] = (dy[i] as number) - fy;
            dx[j] = (dx[j] as number) + fx;
            dy[j] = (dy[j] as number) + fy;
        }

        // Apply displacement, clamped by temperature, then clamp to bounding box
        for (let i = 0; i < n; i++) {
            const dispLen = Math.sqrt((dx[i] as number) * (dx[i] as number) + (dy[i] as number) * (dy[i] as number)) || 1e-6;
            const scale = Math.min(dispLen, t) / dispLen;
            px[i] = (px[i] as number) + (dx[i] as number) * scale;
            py[i] = (py[i] as number) + (dy[i] as number) * scale;
            // Clamp to [0, width] × [0, height]
            px[i] = Math.max(0, Math.min(width, (px[i] as number) + halfW)) - halfW;
            py[i] = Math.max(0, Math.min(height, (py[i] as number) + halfH)) - halfH;
        }
    }

    // Return result with coordinates shifted to positive viewport space
    return nodes.map((nd, i) => ({
        ...nd,
        x: (px[i] as number) + halfW,
        y: (py[i] as number) + halfH,
    }));
}
