// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   QUALITY METRICS PURE — Leave-One-Out cross-validation quality.

   Avalia a qualidade preditiva de um campo escalar (canal de
   concentração) via validação cruzada LOO: para cada observação,
   prediz seu valor usando todas as demais e compara com o observado.

   Métricas: MAE, RMSE, R² (coeficiente de determinação).
   R² = 1 → predição perfeita; R² ≤ 0 → pior que a média.

   PUREZA: sem DOM, sem I/O, determinístico.
   ================================================================ */

export interface QualityMetrics {
    readonly mae: number;
    readonly rmse: number;
    readonly r2: number;
    readonly n: number;
    readonly method: string;
}

export interface Observation {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly value: number;
}

export type PredictFn = (x: number, y: number, z: number) => number;

export function computeLOOQuality(
    observations: readonly Observation[],
    predictFn: PredictFn,
): QualityMetrics | null {
    const n = observations.length;
    if (n < 3) return null;

    let sumAbsErr = 0;
    let sumSqErr = 0;
    let sumObs = 0;
    let sumSqObs = 0;

    for (let i = 0; i < n; i++) {
        const obs = observations[i];
        if (!obs) continue;
        const predicted = predictFn(obs.x, obs.y, obs.z);
        const err = predicted - obs.value;
        sumAbsErr += Math.abs(err);
        sumSqErr += err * err;
        sumObs += obs.value;
        sumSqObs += obs.value * obs.value;
    }

    const mae = sumAbsErr / n;
    const rmse = Math.sqrt(sumSqErr / n);

    const mean = sumObs / n;
    const ssTot = sumSqObs - n * mean * mean;
    const r2 = ssTot === 0 ? (sumSqErr === 0 ? 1 : 0) : 1 - sumSqErr / ssTot;

    return { mae, rmse, r2, n, method: 'LOO' };
}

export function qualityBadge(r2: number): string {
    if (r2 >= 0.7) return 'green';
    if (r2 >= 0.4) return 'yellow';
    return 'red';
}

export function formatQualitySummary(m: QualityMetrics): string {
    return `R²=${m.r2.toFixed(2)} | RMSE=${m.rmse.toFixed(1)} | n=${m.n} (${m.method})`;
}
