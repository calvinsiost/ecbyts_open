// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Soil Compaction Proctor Analysis
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Soil Compaction Proctor Analysis - ASTM D698 / ASTM D1557
 *
 * Módulo puro para análise de compactação de solos pelo método Proctor.
 * Implementa ajuste parabólico para determinação da densidade seca máxima
 * e umidade ótima de compactação, grau de compactação relativo e classificação
 * de qualidade. Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Proctor, R. R. (1933). "Fundamental principles of soil compaction."
 *     Engineering News-Record, 111(9), 245–248; 111(10), 286–289;
 *     111(12), 348–351; 111(13), 372–376. (Original Proctor test method)
 *     ASCE Transactions 98:1245 (1933).
 *   - ASTM D698-12e2:2012. "Standard Test Methods for Laboratory Compaction
 *     Characteristics of Soil Using Standard Effort (12,400 ft-lbf/ft³)."
 *     ASTM International, West Conshohocken, PA.
 *   - ASTM D1557-12e1:2012. "Standard Test Methods for Laboratory Compaction
 *     Characteristics of Soil Using Modified Effort (56,000 ft-lbf/ft³)."
 *     ASTM International, West Conshohocken, PA.
 *   - Head, K. H. & Epps, R. J. (2011). "Manual of Soil Laboratory Testing,
 *     Vol. 1: Soil Classification and Compaction Tests." 3rd ed.
 *     Whittles Publishing. ISBN 978-1-84971-951-3.
 *     (Parabolic fit to Proctor curve, §11.4.3)
 */

'use strict';

interface ProctorPoint {
    moisture: number;
    dryDensity: number;
}

interface QuadraticSums {
    sx: number;
    sx2: number;
    sx3: number;
    sx4: number;
    sy: number;
    sxy: number;
    sx2y: number;
}

interface ParabolaCoefficients {
    a: number;
    b: number;
    c: number;
}

/**
 * Valida um único ponto do ensaio Proctor.
 */
function validateProctorPoint(pt: unknown): asserts pt is ProctorPoint {
    if (
        typeof pt !== 'object' ||
        pt === null ||
        !isFinite((pt as ProctorPoint).moisture) ||
        (pt as ProctorPoint).moisture < 0 ||
        !isFinite((pt as ProctorPoint).dryDensity) ||
        (pt as ProctorPoint).dryDensity <= 0
    ) {
        throw new TypeError('Cada ponto deve ter { moisture: number≥0, dryDensity: number>0 }.');
    }
}

/**
 * Acumula as somas de potências necessárias para o ajuste quadrático.
 */
function computeQuadraticSums(dataPoints: ProctorPoint[]): QuadraticSums {
    const sums: QuadraticSums = { sx: 0, sx2: 0, sx3: 0, sx4: 0, sy: 0, sxy: 0, sx2y: 0 };

    for (const { moisture: x, dryDensity: y } of dataPoints) {
        const x2 = x * x;
        sums.sx += x;
        sums.sx2 += x2;
        sums.sx3 += x2 * x;
        sums.sx4 += x2 * x2;
        sums.sy += y;
        sums.sxy += x * y;
        sums.sx2y += x2 * y;
    }

    return sums;
}

/**
 * Resolve sistema linear 3x3 por eliminação de Gauss com pivô parcial.
 * A matriz aumentada representa [[n,sx,sx2],[sx,sx2,sx3],[sx2,sx3,sx4]] * [c,b,a]^T = [sy,sxy,sx2y].
 */
function _cloneAugmentedMatrix(augmented: number[][]): number[][] {
    return augmented.map((row) => row.slice());
}

function _findPivotRow(A: number[][], col: number): number {
    let maxRow = col;
    for (let row = col + 1; row < 3; row++) {
        const rowValue = A[row]?.[col];
        const maxValue = A[maxRow]?.[col];
        if (rowValue !== undefined && maxValue !== undefined && Math.abs(rowValue) > Math.abs(maxValue)) {
            maxRow = row;
        }
    }
    return maxRow;
}

function _swapRows(A: number[][], i: number, j: number): void {
    const rowI = A[i];
    const rowJ = A[j];
    if (!rowI || !rowJ) return;
    A[i] = rowJ;
    A[j] = rowI;
}

function _assertNonZeroDiagonal(diag: number | undefined): asserts diag is number {
    if (diag === undefined || Math.abs(diag) < 1e-12) {
        throw new RangeError('Pontos colineares ou insuficientes para ajuste quadrático.');
    }
}

function _eliminateColumn(A: number[][], col: number): void {
    const pivotRow = A[col];
    if (!pivotRow) return;
    const diag = pivotRow[col];
    _assertNonZeroDiagonal(diag);
    for (let row = col + 1; row < 3; row++) {
        const currentRow = A[row];
        if (!currentRow) continue;
        const factor = (currentRow[col] ?? 0) / diag;
        for (let k = col; k <= 3; k++) {
            currentRow[k] = (currentRow[k] ?? 0) - factor * (pivotRow[k] ?? 0);
        }
    }
}

function _backSubstitute(A: number[][]): [number, number, number] {
    const solution = [0, 0, 0];
    for (let row = 2; row >= 0; row--) {
        const currentRow = A[row];
        if (!currentRow) continue;
        const diag = currentRow[row];
        _assertNonZeroDiagonal(diag);
        let value = currentRow[3] ?? 0;
        for (let k = row + 1; k < 3; k++) {
            value -= (currentRow[k] ?? 0) * solution[k]!;
        }
        solution[row] = value / diag;
    }
    return solution as [number, number, number];
}

function solveGauss3x3(augmented: number[][]): [number, number, number] {
    const A = _cloneAugmentedMatrix(augmented);

    for (let col = 0; col < 3; col++) {
        const maxRow = _findPivotRow(A, col);
        _swapRows(A, col, maxRow);
        _eliminateColumn(A, col);
    }

    return _backSubstitute(A);
}

/**
 * Calcula OMC e ddmax a partir dos coeficientes parabólicos [c, b, a].
 */
function computeParabolaMaximum(
    solution: [number, number, number],
): { omc: number; ddMax: number; coefficients: ParabolaCoefficients } {
    const [c, b, a] = solution;

    if (a >= 0) {
        throw new RangeError('Ajuste parabólico não resulta em máximo (a ≥ 0). Verifique os dados de ensaio.');
    }

    const omc = -b / (2 * a);
    const ddMax = c - (b * b) / (4 * a);

    return { omc, ddMax, coefficients: { a, b, c } };
}

/**
 * Ajusta uma parábola ao conjunto de pontos (umidade, densidade seca) do ensaio Proctor
 * e retorna a umidade ótima de compactação (OMC) e a densidade seca máxima (ddmax).
 * Fits a parabola to Proctor test data points and returns OMC and maximum dry density.
 *
 * A parábola y = a·x² + b·x + c é ajustada por mínimos quadrados.
 * O máximo (OMC) ocorre em x* = -b / (2a), com ddmax = c - b²/(4a).
 * (Head & Epps 2011, §11.4.3 - quadratic regression on Proctor curve)
 *
 * @param {Array<{moisture: number, dryDensity: number}>} dataPoints
 *   Array de pontos do ensaio: moisture (%) e dryDensity (g/cm³ ou kN/m³).
 *   Mínimo de 3 pontos não colineares.
 * @returns {{ omc: number, ddMax: number, coefficients: {a: number, b: number, c: number} }}
 *   omc = umidade ótima (%), ddMax = densidade seca máxima (mesma unidade da entrada)
 * @throws {TypeError} se dataPoints não for array com estrutura correta
 * @throws {RangeError} se n < 3 ou parábola não tiver máximo (a ≥ 0)
 */
export function calcOptimumMoistureContent(dataPoints: unknown[]) {
    if (!Array.isArray(dataPoints) || dataPoints.length < 3) {
        throw new RangeError('São necessários pelo menos 3 pontos de ensaio Proctor.');
    }

    for (const pt of dataPoints) {
        validateProctorPoint(pt);
    }

    const points = dataPoints as ProctorPoint[];
    const n = points.length;
    const sums = computeQuadraticSums(points);

    const augmented = [
        [n, sums.sx, sums.sx2, sums.sy],
        [sums.sx, sums.sx2, sums.sx3, sums.sxy],
        [sums.sx2, sums.sx3, sums.sx4, sums.sx2y],
    ];

    const solution = solveGauss3x3(augmented);
    return computeParabolaMaximum(solution);
}

/**
 * Calcula a densidade seca máxima teórica interpolada da parábola para uma dada umidade.
 * Calculates the theoretical dry density from the fitted Proctor parabola at a given moisture.
 *
 * Usado internamente e como utilitário para plotagem da curva de compactação.
 * Used internally and as utility for plotting the compaction curve.
 *
 * @param {number} moisturePercent - Teor de umidade (%)
 * @param {{ a: number, b: number, c: number }} coefficients - Coeficientes parabólicos
 * @returns {number} Densidade seca teórica (mesma unidade do ajuste)
 * @throws {TypeError} se os coeficientes não forem finitos
 */
export function calcMaxDryDensity(moisturePercent: unknown, coefficients: unknown) {
    if (typeof coefficients !== 'object' || coefficients === null) {
        throw new TypeError('Coeficientes devem ser um objeto { a, b, c }.');
    }
    const { a, b, c } = coefficients as ParabolaCoefficients;
    if (!isFinite(a) || !isFinite(b) || !isFinite(c)) {
        throw new TypeError('Coeficientes a, b, c devem ser números finitos.');
    }
    if (!isFinite(moisturePercent as number)) {
        throw new TypeError('Teor de umidade deve ser um número finito.');
    }
    // y = a*x^2 + b*x + c
    const x = moisturePercent as number;
    return a * x * x + b * x + c;
}

/**
 * Calcula o grau de compactação relativo (GC) em relação à densidade seca máxima Proctor.
 * Calculates relative compaction degree (GC) with respect to Proctor maximum dry density.
 *
 * GC (%) = (dd_field / dd_max_proctor) × 100
 * (ASTM D698/D1557 - field versus laboratory reference)
 *
 * @param {number} fieldDryDensity - Densidade seca de campo (mesma unidade de ddMaxProctor)
 * @param {number} ddMaxProctor - Densidade seca máxima Proctor de referência, > 0
 * @returns {number} Grau de compactação (%), pode ser > 100 se campo > Proctor
 * @throws {RangeError} se qualquer valor for não finito ou ddMaxProctor ≤ 0
 */
export function calcCompactionDegree(fieldDryDensity: unknown, ddMaxProctor: unknown) {
    const field = fieldDryDensity as number;
    const lab = ddMaxProctor as number;
    if (!isFinite(field) || field <= 0) {
        throw new RangeError('Densidade seca de campo deve ser positiva e finita.');
    }
    if (!isFinite(lab) || lab <= 0) {
        throw new RangeError('Densidade seca máxima Proctor deve ser positiva e finita.');
    }
    return (field / lab) * 100;
}

/**
 * Classifica a qualidade da compactação com base no grau de compactação (GC).
 * Classifies compaction quality based on compaction degree (GC).
 *
 * Critérios de aceitação típicos para infraestrutura e remediação ambiental:
 *   - Inadequado:  GC < 90%  - solo insuficientemente compactado
 *   - Mínimo:      90% ≤ GC < 95% - aceitável apenas para aterros temporários
 *   - Bom:         95% ≤ GC < 100% - padrão para sub-base e base de pavimento
 *   - Excelente:   GC ≥ 100% - superior ao Proctor; ideal para uso crítico
 *
 * Referência adicional: DNIT 108/2009-ES (norma brasileira de compactação).
 *
 * @param {number} compactionDegree - Grau de compactação GC (%), > 0
 * @returns {{ quality: string, gcPercent: number, meetsMinimum: boolean, description: string }}
 * @throws {RangeError} se compactionDegree ≤ 0
 */
export function classifyCompactionQuality(compactionDegree: unknown) {
    const gc = compactionDegree as number;
    if (!isFinite(gc) || gc <= 0) {
        throw new RangeError('Grau de compactação deve ser positivo e finito (%).');
    }

    if (gc < 90) {
        return {
            quality: 'INADEQUADO',
            gcPercent: gc,
            meetsMinimum: false,
            description: 'GC < 90%: compactação insuficiente. Reprocessar o aterro.',
        };
    }
    if (gc < 95) {
        return {
            quality: 'MÍNIMO',
            gcPercent: gc,
            meetsMinimum: true,
            description: 'GC 90–95%: aceitável apenas para aterros temporários ou de baixo tráfego.',
        };
    }
    if (gc < 100) {
        return {
            quality: 'BOM',
            gcPercent: gc,
            meetsMinimum: true,
            description: 'GC 95–100%: padrão para sub-base, base de pavimento e cobertura de remediação.',
        };
    }
    return {
        quality: 'EXCELENTE',
        gcPercent: gc,
        meetsMinimum: true,
        description: 'GC ≥ 100%: densidade superior ao ensaio Proctor; ideal para uso estrutural crítico.',
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilCompactionProctorMeta = {
    name: 'soilCompactionProctor',
    description: 'Soil Compaction Proctor Analysis',
    category: 'analytics',
    familyTags: ['soil', 'hydrocarbon'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
