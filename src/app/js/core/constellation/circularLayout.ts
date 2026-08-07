// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost

/* ================================================================
   CONSTELLATION CIRCULAR LAYOUT
   Spec: docs/specs/features/SPEC_CONSTELLATION_HUD_9_75.md §2.1 (Missing:
   "Force-directed / hierarchical / spatial / circular layouts")

   Distribui os nós sobre uma circunferência (single ring) ou em anéis
   concêntricos quando opts.groupBy é fornecido. Cada grupo distinto
   ocupa um anel; os raios crescem linearmente do centro para fora.

   O posicionamento angular é determinístico: theta_i = startAngle +
   2*pi*i/m (Battista et al., "Graph Drawing: Algorithms for the
   Visualization of Graphs", Prentice Hall, 1999, cap. 6 — circular
   drawing). Sem PRNG necessário; ordem de entrada é preservada de
   forma estável.

   Pure function — sem DOM, sem Three.js, engine-agnostic. Retorna
   apenas coordenadas (Map). Testável em Node.js.
   ================================================================ */

import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';

/** Identidade do módulo. */
export const CIRCULAR_LAYOUT_META = Object.freeze({
    spec: 'CONSTELLATION_HUD_9_75',
    algorithm: 'concentric-ring-circular',
    deliveredAt: '2026-05-15',
});

/** Defaults para computeCircularLayout. */
export const DEFAULT_CIRCULAR_OPTIONS = Object.freeze({
    centerX: 0,
    centerY: 0,
    radius: 300,
    /** Raio do anel mais interno quando há agrupamento. */
    innerRadius: 80,
    /** Espaçamento radial entre anéis concêntricos. */
    ringSpacing: 90,
    /** Ângulo inicial (radianos) do primeiro nó de cada anel. */
    startAngle: 0,
    /** Campo de agrupamento (string) ou função (node) => groupKey. */
    groupBy: null,
});

function toArray(/** @type {any} */ x: any) {
    if (!x) return [];
    if (Array.isArray(x)) return x;
    if (x instanceof Set) return Array.from(x);
    throw new TypeError('expected Array or Set');
}

function resolveGroupKey(/** @type {any} */ node: any, /** @type {any} */ groupBy: any) {
    if (typeof groupBy === 'function') return String(groupBy(node));
    if (typeof groupBy === 'string' && groupBy) {
        const v = node[groupBy];
        return v === undefined || v === null ? '__ungrouped__' : String(v);
    }
    return '__all__';
}

/**
 * Calcula posições circulares (anel único) ou concêntricas (por grupo).
 *
 * @param {any} nodes Array de `{ id: string, ... }`
 * @param {any} [opts] ver DEFAULT_CIRCULAR_OPTIONS
 * @returns {{ positions: Map<string, {x: number, y: number, ring: number, angle: number}>, iterations: number }}
 */
export function computeCircularLayout(nodes: any, opts = {}) {
    const cfg = { ...DEFAULT_CIRCULAR_OPTIONS, ...opts };
    const nList = toArray(nodes);

    /** @type {Map<string, {x: number, y: number, ring: number, angle: number}>} */
    const positions = new Map();
    if (nList.length === 0) return { positions, iterations: 0 };

    const cx = toFiniteNumber(cfg.centerX, 0);
    const cy = toFiniteNumber(cfg.centerY, 0);
    const startAngle = toFiniteNumber(cfg.startAngle, 0);

    // Agrupamento preservando ordem de primeira ocorrência (determinístico).
    /** @type {Map<string, any[]>} */
    const groups = new Map();
    for (const nd of nList) {
        if (!nd || typeof nd.id !== 'string') throw new TypeError('node.id (string) required');
        const key = resolveGroupKey(nd, cfg.groupBy);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(nd);
    }

    const groupKeys = Array.from(groups.keys());
    const singleRing = groupKeys.length <= 1;

    if (singleRing) {
        const members = groups.get(groupKeys[0]);
        const m = members.length;
        const radius = Number.isFinite(cfg.radius) && cfg.radius > 0 ? cfg.radius : 300;
        for (let i = 0; i < m; i++) {
            // Um único nó fica no centro; demais distribuídos uniformemente.
            const angle = m === 1 ? 0 : startAngle + (2 * Math.PI * i) / m;
            const r = m === 1 ? 0 : radius;
            positions.set(members[i].id, {
                x: cx + r * Math.cos(angle),
                y: cy + r * Math.sin(angle),
                ring: 0,
                angle,
            });
        }
        return { positions, iterations: 1 };
    }

    // Anéis concêntricos: um anel por grupo, raio crescente.
    const innerRadius = Number.isFinite(cfg.innerRadius) && cfg.innerRadius > 0 ? cfg.innerRadius : 80;
    const ringSpacing = Number.isFinite(cfg.ringSpacing) && cfg.ringSpacing > 0 ? cfg.ringSpacing : 90;

    for (let ring = 0; ring < groupKeys.length; ring++) {
        const members = groups.get(groupKeys[ring]);
        const m = members.length;
        const r = innerRadius + ring * ringSpacing;
        for (let i = 0; i < m; i++) {
            const angle = startAngle + (2 * Math.PI * i) / m;
            positions.set(members[i].id, {
                x: cx + r * Math.cos(angle),
                y: cy + r * Math.sin(angle),
                ring,
                angle,
            });
        }
    }

    return { positions, iterations: 1 };
}
