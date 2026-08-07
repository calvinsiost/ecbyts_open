// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB recomendação R7 — Suavização Savitzky-Golay. Pure-logic.

   Suaviza uma série ajustando um polinômio de grau p por mínimos quadrados a
   uma janela deslizante de tamanho ímpar (2m+1) e tomando o valor central.
   Diferente da média móvel, PRESERVA picos/extremos e a forma da curva (não
   achata), porque respeita a curvatura local. Reproduz EXATAMENTE polinômios
   de grau ≤ p (propriedade definidora).

   Uso no ecbyts: suavizar séries temporais de monitoramento (concentração,
   nível d'água, sinal de sensor) para evidenciar a tendência sem distorcer
   picos reais; também estima a derivada local. Complementa Mann-Kendall +
   Sen's slope + Pettitt já existentes em core/analytics.

   Bordas: padding por reflexão (espelho). Determinístico; sem DOM/rede.
   Ref: Savitzky & Golay 1964, "Smoothing and Differentiation of Data by
   Simplified Least Squares Procedures" (Analytical Chemistry 36(8)).
   ================================================================ */

/** Resolve A·x = b por eliminação de Gauss com pivoteamento parcial (n pequeno). */
function gaussSolve(A: number[][], b: number[]): number[] {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]!]); // matriz aumentada
    for (let col = 0; col < n; col++) {
        // pivô parcial
        let piv = col;
        for (let r = col + 1; r < n; r++) {
            if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
        }
        if (Math.abs(M[piv]![col]!) < 1e-12) throw new Error('gaussSolve: matriz singular');
        [M[col], M[piv]] = [M[piv]!, M[col]!];
        const pivVal = M[col]![col]!;
        for (let r = 0; r < n; r++) {
            if (r === col) continue;
            const factor = M[r]![col]! / pivVal;
            for (let c = col; c <= n; c++) M[r]![c]! -= factor * M[col]![c]!;
        }
    }
    return M.map((row, i) => row[n]! / row[i]!); // row já é M[i]; diagonal = row[i]
}

/**
 * Coeficientes de convolução SG para o ponto CENTRAL (derivada 0).
 * @param windowSize tamanho ímpar da janela (2m+1)
 * @param polyOrder grau do polinômio (< windowSize)
 */
export function savitzkyGolayWeights(windowSize: number, polyOrder: number): number[] {
    if (!Number.isInteger(windowSize) || windowSize < 3 || windowSize % 2 === 0) {
        throw new RangeError('savitzkyGolayWeights: windowSize deve ser ímpar ≥ 3');
    }
    if (!Number.isInteger(polyOrder) || polyOrder < 0 || polyOrder >= windowSize) {
        throw new RangeError('savitzkyGolayWeights: polyOrder deve ser 0..windowSize-1');
    }
    const m = (windowSize - 1) / 2;
    const offsets: number[] = [];
    for (let o = -m; o <= m; o++) offsets.push(o);
    const dim = polyOrder + 1;
    // A^T A onde A[k][j] = offset_k^j → (A^T A)[a][b] = sum_k offset^(a+b)
    const ATA: number[][] = Array.from({ length: dim }, () => new Array(dim).fill(0));
    for (let a = 0; a < dim; a++) {
        for (let b = 0; b < dim; b++) {
            let s = 0;
            for (const o of offsets) s += Math.pow(o, a + b);
            ATA[a]![b] = s;
        }
    }
    // resolve (A^T A) z = e0 (e0 seleciona o termo constante = valor central)
    const e0 = new Array(dim).fill(0);
    e0[0] = 1;
    const z = gaussSolve(ATA, e0);
    // peso_k = sum_j z[j] · offset_k^j
    return offsets.map((o) => z.reduce((acc, zj, j) => acc + zj * Math.pow(o, j), 0));
}

function reflectIndex(idx: number, n: number): number {
    if (n === 1) return 0;
    let i = idx;
    // espelha repetidamente até cair em [0, n-1]
    while (i < 0 || i >= n) {
        if (i < 0) i = -i;
        if (i >= n) i = 2 * (n - 1) - i;
    }
    return i;
}

/**
 * Suaviza `y` com filtro Savitzky-Golay. Bordas por reflexão.
 * @param y série de entrada
 * @param windowSize janela ímpar (2m+1)
 * @param polyOrder grau do polinômio (< windowSize), default 2
 */
export function savitzkyGolay(y: readonly number[], windowSize: number, polyOrder = 2): number[] {
    if (!Array.isArray(y)) throw new TypeError('savitzkyGolay: y deve ser array');
    if (y.length === 0) return [];
    if (windowSize > y.length) {
        throw new RangeError('savitzkyGolay: windowSize maior que a série');
    }
    const c = savitzkyGolayWeights(windowSize, polyOrder);
    const m = (windowSize - 1) / 2;
    const n = y.length;
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) {
        let acc = 0;
        for (let k = -m; k <= m; k++) {
            acc += c[k + m]! * (y[reflectIndex(i + k, n)] ?? 0);
        }
        out[i] = acc;
    }
    return out;
}
