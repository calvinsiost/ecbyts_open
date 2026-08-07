// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Risk Heatmap Builder - pure-logic SAO ESH risk matrix utilities.
 *
 * Constrói matrizes de risco 5×5 (severidade × probabilidade), agrega entradas
 * por categoria E/S/H, identifica células críticas, exporta CSV e compara
 * matrizes. Sem dependência de DOM/IO - totalmente determinístico.
 *
 * Spec: P1-98
 */

export const HEATMAP_DIMENSIONS = Object.freeze({
    SEVERITY: 'severity',
    LIKELIHOOD: 'likelihood',
});

interface MatrixCell {
    count: number;
    totalScore: number;
    entries: Array<string | null>;
}
type RiskMatrix = Array<Array<MatrixCell>>;

/**
 * Compute risk score: severity × likelihood (1..25).
 * @param severity 1..5
 * @param likelihood 1..5
 */
export function computeRiskScore(severity: number, likelihood: number): number {
    return severity * likelihood;
}

/**
 * Map a risk score to a band label.
 */
export function classifyRiskBand(score: number): 'low' | 'medium' | 'high' | 'extreme' {
    if (score <= 4) return 'low';
    if (score <= 9) return 'medium';
    if (score <= 16) return 'high';
    return 'extreme';
}

const COLOR_LOW = '#4CAF50';
const COLOR_MEDIUM = '#FFC107';
const COLOR_HIGH = '#FF9800';
const COLOR_EXTREME = '#F44336';

/**
 * Frozen 5×5 grid of color hex codes for risk matrix.
 * HEATMAP_COLORS[severity-1][likelihood-1].
 */
function buildColorGrid(): ReadonlyArray<ReadonlyArray<string>> {
    const grid: string[][] = [];
    for (let s = 1; s <= 5; s++) {
        const row: string[] = [];
        for (let l = 1; l <= 5; l++) {
            const score = computeRiskScore(s, l);
            const band = classifyRiskBand(score);
            row.push(
                band === 'low'
                    ? COLOR_LOW
                    : band === 'medium'
                      ? COLOR_MEDIUM
                      : band === 'high'
                        ? COLOR_HIGH
                        : COLOR_EXTREME,
            );
        }
        Object.freeze(row);
        grid.push(row);
    }
    return Object.freeze(grid);
}

export const HEATMAP_COLORS = buildColorGrid();

function emptyMatrix(): RiskMatrix {
    const m: RiskMatrix = [];
    for (let s = 0; s < 5; s++) {
        const row: Array<MatrixCell> = [];
        for (let l = 0; l < 5; l++) {
            row.push({ count: 0, totalScore: 0, entries: [] });
        }
        m.push(row);
    }
    return m;
}

function inRange(n: number): boolean {
    return Number.isFinite(n) && n >= 1 && n <= 5;
}

/**
 * Build a 5×5 risk matrix from a list of entries.
 */
export function buildRiskMatrix(
    entries: Array<{ severity: number; likelihood: number; riskScore?: number; id?: string }>,
): RiskMatrix {
    const matrix = emptyMatrix();
    if (!Array.isArray(entries)) return matrix;
    for (const e of entries) {
        if (!e || !inRange(e.severity) || !inRange(e.likelihood)) continue;
        const s = Math.floor(e.severity) - 1;
        const l = Math.floor(e.likelihood) - 1;
        const score = Number.isFinite(e.riskScore)
            ? (e.riskScore as number)
            : computeRiskScore(e.severity, e.likelihood);
        const row = matrix[s];
        if (!row) continue;
        const cell = row[l];
        if (!cell) continue;
        cell.count += 1;
        cell.totalScore += score;
        cell.entries.push(e.id != null ? e.id : null);
    }
    return matrix;
}

/**
 * Get the canonical color for a (severity, likelihood) cell.
 * @param severity 1..5
 * @param likelihood 1..5
 * @returns hex color
 */
export function getCellColor(severity: number, likelihood: number): string {
    if (!inRange(severity) || !inRange(likelihood)) {
        throw new RangeError('severity and likelihood must be integers 1..5');
    }
    return (HEATMAP_COLORS[Math.floor(severity) - 1] as ReadonlyArray<string>)[
        Math.floor(likelihood) - 1
    ] as string;
}

/**
 * Aggregate entries by category (E/S/H) into per-category matrices.
 */
export function aggregateHeatmapByCategory(
    entries: Array<{ category: string; severity: number; likelihood: number }>,
): Record<string, RiskMatrix> {
    const buckets: Record<string, Array<{ category: string; severity: number; likelihood: number }>> = {};
    if (!Array.isArray(entries)) return {};
    for (const e of entries) {
        if (!e || !e.category) continue;
        const key = String(e.category);
        if (!buckets[key]) buckets[key] = [];
        (buckets[key] as Array<{ category: string; severity: number; likelihood: number }>).push(e);
    }
    const out: Record<string, RiskMatrix> = {};
    for (const [k, list] of Object.entries(buckets)) {
        out[k] = buildRiskMatrix(list);
    }
    return out;
}

/**
 * Find cells with riskScore >= threshold and count > 0, sorted by score desc.
 */
export function findHotCells(
    matrix: Array<Array<{ count: number; totalScore: number }>>,
    threshold: number = 10,
): Array<{ severity: number; likelihood: number; count: number; score: number }> {
    const out: Array<{ severity: number; likelihood: number; count: number; score: number }> = [];
    if (!Array.isArray(matrix)) return out;
    for (let s = 0; s < matrix.length; s++) {
        const row = matrix[s];
        if (!Array.isArray(row)) continue;
        for (let l = 0; l < row.length; l++) {
            const cell = row[l];
            if (!cell || cell.count <= 0) continue;
            const score = computeRiskScore(s + 1, l + 1);
            if (score >= threshold) {
                out.push({
                    severity: s + 1,
                    likelihood: l + 1,
                    count: cell.count,
                    score,
                });
            }
        }
    }
    out.sort((a, b) => b.score - a.score || b.count - a.count);
    return out;
}

/**
 * Summarize a matrix: totals + band distribution.
 */
export function summarizeHeatmap(matrix: Array<Array<{ count: number; totalScore: number }>>): {
    totalCells: number;
    populatedCells: number;
    totalEntries: number;
    maxScore: number;
    distribution: { low: number; medium: number; high: number; extreme: number };
} {
    const distribution = { low: 0, medium: 0, high: 0, extreme: 0 };
    let populatedCells = 0;
    let totalEntries = 0;
    let maxScore = 0;
    let totalCells = 0;
    if (Array.isArray(matrix)) {
        for (let s = 0; s < matrix.length; s++) {
            const row = matrix[s];
            if (!Array.isArray(row)) continue;
            for (let l = 0; l < row.length; l++) {
                totalCells += 1;
                const cell = row[l];
                if (!cell || cell.count <= 0) continue;
                populatedCells += 1;
                totalEntries += cell.count;
                const score = computeRiskScore(s + 1, l + 1);
                if (score > maxScore) maxScore = score;
                distribution[classifyRiskBand(score)] += cell.count;
            }
        }
    }
    return { totalCells, populatedCells, totalEntries, maxScore, distribution };
}

/**
 * Export matrix as CSV (rows=severity, cols=likelihood). First row is header.
 */
export function exportMatrixToCSV(matrix: Array<Array<{ count: number }>>): string {
    const lines: string[] = [];
    lines.push('severity\\likelihood,L1,L2,L3,L4,L5');
    if (Array.isArray(matrix)) {
        for (let s = 0; s < matrix.length; s++) {
            const row = matrix[s];
            const parts = [`S${s + 1}`];
            for (let l = 0; l < 5; l++) {
                const cell = Array.isArray(row) ? row[l] : null;
                parts.push(String(cell && cell.count ? cell.count : 0));
            }
            lines.push(parts.join(','));
        }
    }
    return lines.join('\n');
}

/**
 * Compare two matrices cell-by-cell.
 */
export function compareMatrices(
    matrixA: Array<Array<{ count: number; totalScore: number }>>,
    matrixB: Array<Array<{ count: number; totalScore: number }>>,
): Record<string, { countDelta: number; scoreDelta: number }> {
    const out: Record<string, { countDelta: number; scoreDelta: number }> = {};
    for (let s = 1; s <= 5; s++) {
        for (let l = 1; l <= 5; l++) {
            const a = (matrixA && matrixA[s - 1] && (matrixA[s - 1] as Array<{ count: number; totalScore: number }>)[l - 1]) || {
                count: 0,
                totalScore: 0,
            };
            const b = (matrixB && matrixB[s - 1] && (matrixB[s - 1] as Array<{ count: number; totalScore: number }>)[l - 1]) || {
                count: 0,
                totalScore: 0,
            };
            out[`${s}-${l}`] = {
                countDelta: (b.count || 0) - (a.count || 0),
                scoreDelta: (b.totalScore || 0) - (a.totalScore || 0),
            };
        }
    }
    return out;
}

export default {
    HEATMAP_DIMENSIONS,
    HEATMAP_COLORS,
    computeRiskScore,
    classifyRiskBand,
    buildRiskMatrix,
    getCellColor,
    aggregateHeatmapByCategory,
    findHotCells,
    summarizeHeatmap,
    exportMatrixToCSV,
    compareMatrices,
};
