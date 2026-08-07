// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   VOXEL UNCERTAINTY CHANNEL — RF-4 da SPEC_VOXEL_PIPELINE.

   Canal paralelo de variância quando o método de interpolação é
   kriging ou GP (Gaussian Process). Células com variância acima
   do corte recebem o carimbo INTERP_LOW (3), rebaixando o carimbo
   RF-1 de superfície para indicar confiança insuficiente.

   Convenção dos carimbos (canal paralelo Uint8Array, mesmo layout do
   grid `idx = iz·(ny·nx) + iy·nx + ix`):
     0 = INSIDE / IN_MODEL — célula válida sem ressalvas
     1 = ABOVE_SURFACE     — acima do terreno (RF-5)
     2 = BELOW_MODEL       — abaixo da base do modelo (RF-5)
     3 = INTERP_LOW        — variância acima do corte (este módulo)

   PUREZA: recebe TypedArrays/escalares; sem DOM, Three.js ou I/O.
   Determinístico: mesma entrada → mesma saída.

   PROVENANCE / referência canônica:
     - Kriging variance: Cressie, N.A.C. (1993) "Statistics for
       Spatial Data", Wiley, §3.4 — variância de krigagem σ²_K(x₀)
       mede a incerteza da estimativa no ponto não-amostrado x₀.
     - GP predictive variance: Rasmussen & Williams (2006) "Gaussian
       Processes for Machine Learning", MIT Press, §2.2 — variância
       preditiva f* ~ N(μ*, σ²*).
     - Intervalo de confiança: μ ± z·σ com z=1.96 para 95% (normal).
   ================================================================ */

export const INTERP_LOW_STAMP = 3;
export const DEFAULT_VARIANCE_CUTOFF = 1.0;

export interface UncertaintyChannel {
    readonly variance: Float32Array;
    readonly method: 'kriging' | 'gp' | 'idw';
    readonly cutoff: number;
}

export function classifyUncertainty(
    variance: ArrayLike<number>,
    cutoff: number = DEFAULT_VARIANCE_CUTOFF,
): Uint8Array {
    const n = variance.length;
    const stamps = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        stamps[i] = Number(variance[i]) > cutoff ? INTERP_LOW_STAMP : 0;
    }
    return stamps;
}

export function mergeUncertaintyStamps(
    surfaceStamps: Uint8Array,
    uncertaintyStamps: Uint8Array,
): Uint8Array {
    const n = surfaceStamps.length;
    const merged = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        const s = surfaceStamps[i] ?? 0;
        // ABOVE_SURFACE(1) > BELOW_MODEL(2) > INTERP_LOW(3) > INSIDE(0)
        if (s === 1 || s === 2) {
            merged[i] = s;
        } else if ((uncertaintyStamps[i] ?? 0) === INTERP_LOW_STAMP) {
            merged[i] = INTERP_LOW_STAMP;
        } else {
            merged[i] = s;
        }
    }
    return merged;
}

export interface UncertaintyStats {
    readonly mean: number;
    readonly max: number;
    readonly p95: number;
    readonly countAboveCutoff: number;
}

export function uncertaintyStats(
    variance: ArrayLike<number>,
    cutoff: number = DEFAULT_VARIANCE_CUTOFF,
): UncertaintyStats {
    const n = variance.length;
    if (n === 0) {
        return { mean: 0, max: 0, p95: 0, countAboveCutoff: 0 };
    }
    let sum = 0;
    let max = -Infinity;
    let countAboveCutoff = 0;
    const sorted = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const v = Number(variance[i]);
        sum += v;
        if (v > max) max = v;
        if (v > cutoff) countAboveCutoff++;
        sorted[i] = v;
    }
    sorted.sort();
    const p95Index = Math.min(Math.ceil(0.95 * n) - 1, n - 1);
    return {
        mean: sum / n,
        max,
        p95: sorted[p95Index] ?? 0,
        countAboveCutoff,
    };
}

export interface ConfidenceInterval {
    readonly lower: number;
    readonly upper: number;
}

export function confidenceInterval(
    variance: number,
    z: number = 1.96,
): ConfidenceInterval {
    const half = z * Math.sqrt(Math.max(0, variance));
    return { lower: half === 0 ? 0 : -half, upper: half };
}
