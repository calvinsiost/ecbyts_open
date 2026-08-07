// @ts-check
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
   INTERPOLATION WORKER — Web Worker para cálculos pesados
   ================================================================

   Offload de interpolação para thread separada.
   Comunicação via postMessage com transferable Float32Array.

   PROTOCOLO:
   Main → Worker: { cmd: 'interpolate', points, bounds, gridSize, method, params }
   Worker → Main: { cmd: 'progress', pct: 0.45 }
   Worker → Main: { cmd: 'result', grid: Float32Array, stats: {...} }
   Worker → Main: { cmd: 'error', message: '...' }

   ================================================================ */

// Importa engine no contexto do worker
import { interpolateGrid } from './engine.js';

self.onmessage = async function (e) {
    const { cmd, points, bounds, gridSize, method, params } = e.data;

    if (cmd !== 'interpolate') return;

    try {
        const result = await interpolateGrid(points, bounds, gridSize, method, params, (/** @type {number} */ pct: any) => self.postMessage({ cmd: 'progress', pct }),
        );

        // Transfere Float32Array (zero-copy)
        (self as any).postMessage(
            { cmd: 'result', grid: result.grid, stats: result.stats },
            /** @type {any} */ ([result.grid.buffer]),
        );
    } catch (err) {
        self.postMessage({ cmd: 'error', message: /** @type {any} */ (err as any).message });
    }
};
