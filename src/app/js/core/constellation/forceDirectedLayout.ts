// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost

/* ================================================================
   CONSTELLATION FORCE-DIRECTED LAYOUT (Fruchterman-Reingold)
   Spec: docs/specs/features/SPEC_CONSTELLATION_HUD_9_75.md §2.1 (Missing:
   "Force-directed / hierarchical / spatial / circular layouts")

   Algoritmo: Fruchterman-Reingold force-directed placement.
   Cada nó é tratado como uma partícula com força repulsiva entre todos
   os pares (f_r = k²/d) e força atrativa ao longo de arestas (f_a = d²/k).
   Um cronograma de resfriamento (simulated annealing) limita o
   deslocamento por iteração, garantindo convergência.

   Referência acadêmica (provenance per CLAUDE.md):
   Fruchterman, T.M.J. & Reingold, E.M. (1991).
   "Graph Drawing by Force-directed Placement."
   Software: Practice and Experience, 21(11), 1129-1164.
   DOI: 10.1002/spe.4380211102

   DETERMINÍSTICO: nunca usa Math.random — posições iniciais ausentes
   são geradas por um PRNG mulberry32 semeado via opts.seed. Mesma
   seed + mesma entrada => mesma saída (bit-a-bit).

   Pure function — sem DOM, sem Three.js, engine-agnostic. Retorna
   apenas coordenadas (Map). Testável em Node.js.
   ================================================================ */

import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';

/** Identidade do módulo. */
export const FORCE_DIRECTED_LAYOUT_META = Object.freeze({
    spec: 'CONSTELLATION_HUD_9_75',
    algorithm: 'fruchterman-reingold-1991',
    deliveredAt: '2026-05-15',
});

/** Defaults para computeForceDirectedLayout. */
export const DEFAULT_FORCE_DIRECTED_OPTIONS = Object.freeze({
    width: 800,
    height: 600,
    iterations: 120,
    seed: 1,
    /** Quando convergence delta total < tolerance, encerra cedo. */
    tolerance: 0.01,
});

/**
 * PRNG mulberry32 — gerador determinístico de 32 bits.
 * Fonte de domínio público (Tommy Ettinger / bryc), independente de
 * Math.random. Retorna função que produz floats em [0, 1).
 *
 * @param {number} seed inteiro de 32 bits
 * @returns {() => number}
 */
export function mulberry32(seed: any) {
    let a = seed >>> 0 || 1;
    return function next() {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function toArray(/** @type {any} */ x: any) {
    if (!x) return [];
    if (Array.isArray(x)) return x;
    if (x instanceof Set) return Array.from(x);
    throw new TypeError('expected Array or Set');
}

/**
 * Calcula um layout force-directed determinístico.
 *
 * @param {any} nodes Array de `{ id: string, x?: number, y?: number }`
 * @param {any} edges Array de `{ source, target }` ou `{ sourceId, targetId }`
 * @param {any} [opts] `{ width, height, iterations, seed, tolerance, k }`
 * @returns {{ positions: Map<string, {x: number, y: number}>, iterations: number }}
 */
export function computeForceDirectedLayout(nodes: any, edges: any, opts: any = {}) {
    const cfg = { ...DEFAULT_FORCE_DIRECTED_OPTIONS, ...opts };
    const nList = toArray(nodes);
    const eList = toArray(edges);

    /** @type {Map<string, {x: number, y: number}>} */
    const positions = new Map();
    if (nList.length === 0) return { positions, iterations: 0 };

    const width = Number.isFinite(cfg.width) && cfg.width > 0 ? cfg.width : 800;
    const height = Number.isFinite(cfg.height) && cfg.height > 0 ? cfg.height : 600;
    const maxIter = Math.floor(toFiniteNumber(cfg.iterations, 120, { min: 1 }));
    const tolerance = toFiniteNumber(cfg.tolerance, 0.01, { min: 0 });

    const n = nList.length;
    // k = C * sqrt(area / N), C = 1 (Fruchterman & Reingold 1991, eq. 1)
    const k = Number.isFinite(cfg.k) && cfg.k > 0 ? cfg.k : Math.sqrt((width * height) / Math.max(n, 1));
    const k2 = k * k;

    const rand = mulberry32(Number.isFinite(cfg.seed) ? cfg.seed | 0 : 1);

    const px: any = new Float64Array(n);
    const py: any = new Float64Array(n);
    const idToIdx = new Map();
    const ids: any = new Array(n);

    for (let i = 0; i < n; i++) {
        const nd = nList[i];
        if (!nd || typeof nd.id !== 'string') throw new TypeError('node.id (string) required');
        ids[i] = nd.id;
        idToIdx.set(nd.id, i);
        // Posição inicial: usa coordenada fornecida se finita, senão
        // gera deterministicamente via PRNG semeado (NUNCA Math.random).
        px[i] = typeof nd.x === 'number' && isFinite(nd.x) ? nd.x : (rand() - 0.5) * width * 0.8;
        py[i] = typeof nd.y === 'number' && isFinite(nd.y) ? nd.y : (rand() - 0.5) * height * 0.8;
    }

    // Desloca nós coincidentes deterministicamente para evitar divisão por zero.
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (px[i] === px[j] && py[i] === py[j]) {
                px[j] += 0.13 * (i + 1);
                py[j] += 0.17 * (j + 1);
            }
        }
    }

    /** @type {Array<[number, number]>} */
    const edgePairs: any[] = [];
    for (const e of eList) {
        if (!e) continue;
        const s = e.sourceId ?? e.source;
        const t = e.targetId ?? e.target;
        const i = idToIdx.get(s);
        const j = idToIdx.get(t);
        if (i === undefined || j === undefined || i === j) continue;
        edgePairs.push([i, j]);
    }

    const halfW = width / 2;
    const halfH = height / 2;
    let usedIterations = 0;

    for (let iter = 0; iter < maxIter; iter++) {
        usedIterations = iter + 1;
        // Cronograma de resfriamento linear (Fruchterman & Reingold §4).
        const temp = (width / 10) * (1 - iter / maxIter);

        const dx: any = new Float64Array(n);
        const dy: any = new Float64Array(n);

        // Repulsão entre todos os pares: f_r = k² / d
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const ddx = px[i] - px[j];
                const ddy = py[i] - py[j];
                const distSq = ddx * ddx + ddy * ddy;
                if (distSq < 1e-12) continue;
                const dist = Math.sqrt(distSq);
                const force = k2 / dist;
                const fx = (ddx / dist) * force;
                const fy = (ddy / dist) * force;
                dx[i] += fx;
                dy[i] += fy;
                dx[j] -= fx;
                dy[j] -= fy;
            }
        }

        // Atração ao longo de arestas: f_a = d² / k
        for (let e = 0; e < edgePairs.length; e++) {
            const i = edgePairs[e][0];
            const j = edgePairs[e][1];
            const ddx = px[i] - px[j];
            const ddy = py[i] - py[j];
            const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1e-6;
            const force = (dist * dist) / k;
            const fx = (ddx / dist) * force;
            const fy = (ddy / dist) * force;
            dx[i] -= fx;
            dy[i] -= fy;
            dx[j] += fx;
            dy[j] += fy;
        }

        // Aplica deslocamento limitado pela temperatura e clampa no viewport.
        let totalMove = 0;
        for (let i = 0; i < n; i++) {
            const dispLen = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1e-6;
            const scale = Math.min(dispLen, temp) / dispLen;
            const mvx = dx[i] * scale;
            const mvy = dy[i] * scale;
            px[i] = Math.max(0, Math.min(width, px[i] + mvx + halfW)) - halfW;
            py[i] = Math.max(0, Math.min(height, py[i] + mvy + halfH)) - halfH;
            totalMove += Math.abs(mvx) + Math.abs(mvy);
        }

        // Limite de convergência: movimento médio por nó abaixo da tolerância.
        if (totalMove / n < tolerance) break;
    }

    for (let i = 0; i < n; i++) {
        positions.set(ids[i], { x: px[i] + halfW, y: py[i] + halfH });
    }

    return { positions, iterations: usedIterations };
}
