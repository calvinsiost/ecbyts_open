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
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Spatial Autocorrelation - Moran's I e Geary's C
 *
 * Detecta dependência espacial em dados de monitoramento ambiental:
 * clustering (autocorrelação positiva), dispersão (negativa) ou aleatoriedade.
 *
 * Referências acadêmicas:
 *   - Moran, P.A.P. (1950) "Notes on Continuous Stochastic Phenomena",
 *     Biometrika, 37(1/2), pp. 17–23. DOI: 10.2307/2332142
 *   - Geary, R.C. (1954) "The Contiguity Ratio and Statistical Mapping",
 *     The Incorporated Statistician, 5(3), pp. 115–145. DOI: 10.2307/2986645
 *   - Anselin, L. (1995) "Local Indicators of Spatial Association — LISA",
 *     Geographical Analysis, 27(2), pp. 93–115.
 *     DOI: 10.1111/j.1538-4632.1995.tb00338.x  (Moran local + Geary local)
 *   - Abramowitz, M. & Stegun, I.A. (1964) Handbook of Mathematical Functions,
 *     §26.2.17 - polynomial approximation for normal CDF.
 */

// ---------------------------------------------------------------------------
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

/**
 * Média aritmética de um array.
 * @param {number[]} arr
 * @returns {number}
 */
function meanArr(arr: number[]): number {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i] as number;
    return sum / arr.length;
}

/**
 * Desvio padrão (população) de um array.
 * @param {number[]} arr
 * @returns {number}
 */
function stdArr(arr: number[]): number {
    const mu = meanArr(arr);
    let sq = 0;
    for (let i = 0; i < arr.length; i++) sq += ((arr[i] as number) - mu) ** 2;
    return Math.sqrt(sq / arr.length);
}

/**
 * CDF da normal padrão - Abramowitz & Stegun §26.2.17.
 * Erro máximo: |ε(x)| ≤ 7.5 × 10⁻⁸
 * @param {number} z
 * @returns {number} P(Z ≤ z)
 */
function normalCDF(z: number): number {
    const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
    const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    const p = 1.0 - pdf * poly;
    return z >= 0 ? p : 1 - p;
}

/**
 * Distância euclidiana entre dois pontos {x, y}.
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
function euclidean(a: {x:number,y:number}, b: {x:number,y:number}): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Distância ao vizinho mais próximo para cada ponto.
 * @param {{x:number,y:number}[]} points
 * @returns {number[]}
 */
function nearestNeighborDistances(points: {x:number,y:number}[]): number[] {
    const n = points.length;
    const dists = new Array(n);
    for (let i = 0; i < n; i++) {
        let min = Infinity;
        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const d = euclidean(points[i] as {x:number,y:number}, points[j] as {x:number,y:number});
            if (d < min) min = d;
        }
        dists[i] = min;
    }
    return dists;
}

/**
 * Normaliza cada linha da matriz W para somar 1 (row-standardization).
 * Linhas com soma zero (ponto isolado) permanecem zero.
 * @param {number[][]} W
 * @returns {number[][]}
 */
function rowStandardize(W: number[][]): number[][] {
    const n = W.length;
    for (let i = 0; i < n; i++) {
        let rowSum = 0;
        for (let j = 0; j < n; j++) rowSum += (W[i] as number[])[j] as number;
        if (rowSum > 0) {
            for (let j = 0; j < n; j++) (W[i] as number[])[j] = ((W[i] as number[])[j] as number) / rowSum;
        }
    }
    return W;
}

/**
 * Correlação de Pearson entre dois arrays de mesmo comprimento.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function pearsonCorrelation(a: number[], b: number[]): number {
    const n = a.length;
    const ma = meanArr(a);
    const mb = meanArr(b);
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < n; i++) {
        const ai = (a[i] as number) - ma;
        const bi = (b[i] as number) - mb;
        num += ai * bi;
        da += ai * ai;
        db += bi * bi;
    }
    const denom = Math.sqrt(da * db);
    return denom === 0 ? 0 : num / denom;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Constrói a matriz de pesos espaciais W (n×n, row-standardized).
 *
 * Métodos suportados:
 *   'inverse_distance' - wij = 1/d^power (bandwidth como cutoff opcional)
 *   'binary_contiguity' - wij = 1 se d ≤ bandwidth, 0 caso contrário
 *   'knn'              - wij = 1 para os k vizinhos mais próximos
 *
 * @param {{x:number,y:number}[]} points - Coordenadas locais dos pontos.
 * @param {'inverse_distance'|'binary_contiguity'|'knn'} [method='inverse_distance']
 * @param {{bandwidth?:number, k?:number, power?:number}} [params={}]
 * @returns {Readonly<{W:number[][], n:number, method:string, params_used:object}>}
 * @throws {RangeError} se n < 3
 */
export function buildSpatialWeightMatrix(points: {x:number,y:number}[], method: 'inverse_distance'|'binary_contiguity'|'knn' = 'inverse_distance', params: {bandwidth?:number, k?:number, power?:number} = {}): Readonly<{W:number[][], n:number, method:string, params_used:object}> {
    const n = points.length;
    if (n < 3) {
        throw new RangeError(`buildSpatialWeightMatrix: requires at least 3 points, got ${n}`);
    }

    const power = params.power !== undefined ? params.power : 1;
    const k = params.k !== undefined ? params.k : 4;

    // Bandwidth automático = média dos vizinhos mais próximos × 1.5
    let bandwidth = params.bandwidth;
    if (bandwidth === undefined) {
        const nnDists = nearestNeighborDistances(points);
        const meanNN = meanArr(nnDists);
        bandwidth = meanNN * 1.5;
    }

    // Construir W raw (n×n zeros)
    const W = Array.from({ length: n }, () => new Array(n).fill(0));

    if (method === 'knn') {
        // Para cada ponto, encontrar os k vizinhos mais próximos
        for (let i = 0; i < n; i++) {
            // Calcular distâncias de i para todos os outros
            const distIdx = [];
            for (let j = 0; j < n; j++) {
                if (i === j) continue;
                distIdx.push({ j, d: euclidean(points[i] as {x:number,y:number}, points[j] as {x:number,y:number}) });
            }
            // Ordenar por distância crescente
            distIdx.sort((a, b) => a.d - b.d);
            // Atribuir peso 1 aos k mais próximos
            const kActual = Math.min(k, distIdx.length);
            for (let r = 0; r < kActual; r++) {
                (W[i] as number[])[(distIdx[r] as {j:number,d:number}).j] = 1;
            }
        }
    } else if (method === 'binary_contiguity') {
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (i === j) continue;
                const d = euclidean(points[i] as {x:number,y:number}, points[j] as {x:number,y:number});
                (W[i] as number[])[j] = d <= bandwidth ? 1 : 0;
            }
        }
    } else {
        // inverse_distance (padrão)
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (i === j) continue;
                const d = euclidean(points[i] as {x:number,y:number}, points[j] as {x:number,y:number});
                if (d === 0) {
                    // Pontos coincidentes: peso máximo relativo - será normalizado
                    (W[i] as number[])[j] = 1e10;
                } else if (bandwidth === undefined || d <= bandwidth) {
                    (W[i] as number[])[j] = 1 / Math.pow(d, power);
                } else {
                    // bandwidth definido e d > bandwidth: peso zero
                    (W[i] as number[])[j] = params.bandwidth !== undefined ? 0 : 1 / Math.pow(d, power);
                }
            }
        }
    }

    // Diagonal garantida = 0
    for (let i = 0; i < n; i++) (W[i] as number[])[i] = 0;

    // Row-standardization
    rowStandardize(W);

    const params_used = Object.freeze({ bandwidth, k, power, method });
    return Object.freeze({ W, n, method, params_used });
}

/**
 * Calcula o I de Moran (autocorrelação espacial global).
 *
 * Fórmula (Moran 1950):
 *   I = (n / S0) × (Σi Σj wij × zi × zj) / Σi zi²
 * onde zi = yi − ȳ e S0 = Σi Σj wij.
 *
 * @param {number[]} values - Valores observados (mesmo ordem que pontos em W).
 * @param {number[][]} W    - Matriz de pesos (row-standardized), quadrada n×n.
 * @returns {Readonly<{I:number, expectedI:number, varianceI:number, zScore:number, pValueApprox:number, interpretation:string, n:number}>}
 * @throws {RangeError} se values.length !== W.length
 */
export function computeMoranI(values: number[], W: number[][]): Readonly<{I:number, expectedI:number, varianceI:number, zScore:number, pValueApprox:number, interpretation:string, n:number}> {
    const n = values.length;
    if (n !== W.length) {
        throw new RangeError(`computeMoranI: values.length (${n}) must equal W.length (${W.length})`);
    }

    const mu = meanArr(values);
    const z = values.map((v) => v - mu);

    // Σi zi²
    let sumZ2 = 0;
    for (let i = 0; i < n; i++) sumZ2 += (z[i] as number) * (z[i] as number);

    // Caso valores uniformes: zi todos zero - I indefinido, retornar 0
    if (sumZ2 === 0) {
        const expectedI = -1 / (n - 1);
        return Object.freeze({
            I: 0,
            expectedI,
            varianceI: 0,
            zScore: 0,
            pValueApprox: 1,
            interpretation: 'random',
            n,
        });
    }

    // S0 = Σi Σj wij
    let S0 = 0;
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) S0 += (W[i] as number[])[j] as number;
    }

    // Numerador: Σi Σj wij × zi × zj
    let num = 0;
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            num += ((W[i] as number[])[j] as number) * (z[i] as number) * (z[j] as number);
        }
    }

    const I = (n / S0) * (num / sumZ2);
    const expectedI = -1 / (n - 1);

    // Variância via fórmula de Moran (normalidade assumida)
    // S1 = 0.5 × Σi Σj (wij + wji)²
    let S1 = 0;
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            S1 += (((W[i] as number[])[j] as number) + ((W[j] as number[])[i] as number)) ** 2;
        }
    }
    S1 *= 0.5;

    // S2 = Σi (Σj wij + Σj wji)²
    let S2 = 0;
    for (let i = 0; i < n; i++) {
        let rowSum = 0;
        let colSum = 0;
        for (let j = 0; j < n; j++) {
            rowSum += (W[i] as number[])[j] as number;
            colSum += (W[j] as number[])[i] as number;
        }
        S2 += (rowSum + colSum) ** 2;
    }

    // varI = (n² × S1 - n × S2 + 3 × S0²) / ((n² - 1) × S0²)
    const n2 = n * n;
    const varI = (n2 * S1 - n * S2 + 3 * S0 * S0) / ((n2 - 1) * S0 * S0);
    const stdI = Math.sqrt(Math.max(varI, 0));

    const zScore = stdI === 0 ? 0 : (I - expectedI) / stdI;
    const pValueApprox = 2 * (1 - normalCDF(Math.abs(zScore)));

    let interpretation;
    if (I > expectedI + 2 * stdI) {
        interpretation = 'positive_clustering';
    } else if (I < expectedI - 2 * stdI) {
        interpretation = 'negative_dispersion';
    } else {
        interpretation = 'random';
    }

    return Object.freeze({
        I,
        expectedI,
        varianceI: varI,
        zScore,
        pValueApprox,
        interpretation,
        n,
    });
}

/**
 * Calcula o C de Geary (autocorrelação espacial global, sensível a variação local).
 *
 * Fórmula (Geary 1954):
 *   C = (n−1)/(2 × S0) × Σi Σj wij × (yi − yj)² / Σi (yi − ȳ)²
 *
 * C < 1 → clustering; C > 1 → dispersão; C ≈ 1 → aleatoriedade.
 *
 * @param {number[]} values
 * @param {number[][]} W
 * @returns {Readonly<{C:number, expectedC:number, zScore:number, pValueApprox:number, interpretation:string, n:number}>}
 * @throws {RangeError} se values.length !== W.length
 */
export function computeGearyC(values: number[], W: number[][]): Readonly<{C:number, expectedC:number, zScore:number, pValueApprox:number, interpretation:string, n:number}> {
    const n = values.length;
    if (n !== W.length) {
        throw new RangeError(`computeGearyC: values.length (${n}) must equal W.length (${W.length})`);
    }

    const mu = meanArr(values);

    // Σi (yi − ȳ)²
    let sumDev2 = 0;
    for (let i = 0; i < n; i++) sumDev2 += ((values[i] as number) - mu) ** 2;

    // S0 = Σi Σj wij
    let S0 = 0;
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) S0 += (W[i] as number[])[j] as number;
    }

    // Numerador: Σi Σj wij × (yi − yj)²
    let num = 0;
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            num += ((W[i] as number[])[j] as number) * ((values[i] as number) - (values[j] as number)) ** 2;
        }
    }

    let C;
    if (sumDev2 === 0) {
        // Valores uniformes - C indefinido, tratar como aleatório
        C = 1;
    } else {
        C = ((n - 1) / (2 * S0)) * (num / sumDev2);
    }

    const expectedC = 1;
    // Variância simplificada: varC ≈ 1/(2n)
    const varC = 1 / (2 * n);
    const stdC = Math.sqrt(varC);

    const zScore = (C - expectedC) / stdC;
    const pValueApprox = 2 * (1 - normalCDF(Math.abs(zScore)));

    let interpretation;
    if (C < 1 - 0.1) {
        interpretation = 'positive_clustering';
    } else if (C > 1 + 0.1) {
        interpretation = 'negative_dispersion';
    } else {
        interpretation = 'random';
    }

    return Object.freeze({ C, expectedC, zScore, pValueApprox, interpretation, n });
}

/**
 * Calcula o lag espacial e a correlação com os valores originais.
 *
 * lag[i] = Σj w_ij × y_j  (média ponderada dos vizinhos de i)
 * correlation = Pearson(values, lag)  ≡ slope do Moran scatter plot
 *
 * @param {number[]} values
 * @param {number[][]} W
 * @returns {Readonly<{lag:number[], correlation:number}>}
 */
export function computeSpatialLag(values: number[], W: number[][]): Readonly<{lag:number[], correlation:number}> {
    const n = values.length;
        const lag: number[]= new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            lag[i] = (lag[i] as number) + ((W[i] as number[])[j] as number) * (values[j] as number);
        }
    }
    const correlation = pearsonCorrelation(values, lag);
    return Object.freeze({ lag, correlation });
}

/**
 * Calcula o I de Moran local (LISA - Local Indicator of Spatial Association).
 *
 * Ii = zi × Σj wij × zj  para cada localização i.
 *
 * Classificação dos quadrantes do Moran scatter plot:
 *   HH - valor alto cercado de vizinhos altos (zi > 0 e lag > 0)
 *   LL - valor baixo cercado de vizinhos baixos
 *   HL - valor alto cercado de vizinhos baixos (outlier)
 *   LH - valor baixo cercado de vizinhos altos (outlier)
 *   ns - não significativo (|Ii| < média dos |Ii|)
 *
 * @param {number[]} values
 * @param {number[][]} W
 * @returns {Readonly<{local:Readonly<{i:number,Ii:number,classification:string}>[],globalI:number,n:number}>}
 */
export function computeLocalMoranI(values: number[], W: number[][]): Readonly<{local:Readonly<{i:number,Ii:number,classification:string}>[],globalI:number,n:number}> {
    const n = values.length;
    const mu = meanArr(values);
    const z = values.map((v) => v - mu);

    // Σj wij × zj para cada i (spatial lag dos desvios)
        const wz: number[]= new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            wz[i] = (wz[i] as number) + ((W[i] as number[])[j] as number) * (z[j] as number);
        }
    }

    // Ii = zi × (Σj wij × zj)
        const Ii: number[]= new Array(n);
    for (let i = 0; i < n; i++) Ii[i] = (z[i] as number) * (wz[i] as number);

    // Média de |Ii| como limiar de significância
    let sumAbsIi = 0;
    for (let i = 0; i < n; i++) sumAbsIi += Math.abs(Ii[i] as number);
    const threshold = sumAbsIi / n;

    const VALID_CLASSES = new Set(['HH', 'LL', 'HL', 'LH', 'ns']);

    const local = Ii.map((val, i) => {
        let classification;
        if (Math.abs(val) < threshold) {
            classification = 'ns';
        } else if ((z[i] as number) > 0 && (wz[i] as number) > 0) {
            classification = 'HH';
        } else if ((z[i] as number) < 0 && (wz[i] as number) < 0) {
            classification = 'LL';
        } else if ((z[i] as number) > 0 && (wz[i] as number) <= 0) {
            classification = 'HL';
        } else {
            classification = 'LH';
        }
        // Invariante: classe sempre válida
        if (!VALID_CLASSES.has(classification)) classification = 'ns';
        return Object.freeze({ i, Ii: val, classification });
    });

    // Global I a partir dos locais: I = Σ Ii / Σ zi²
    let sumZ2 = 0;
    for (let i = 0; i < n; i++) sumZ2 += (z[i] as number) ** 2;
    const globalI = sumZ2 === 0 ? 0 : Ii.reduce((a, v) => a + v, 0) / sumZ2;

    return Object.freeze({
        local,
        globalI,
        n,
    });
}

/**
 * PRNG determinístico mulberry32 (32-bit). Reprodutível e puro — usado no teste
 * de permutação condicional do Local Geary's C para inferência sem dependência
 * de Math.random global (resultado determinístico dado o seed).
 *
 * @param {number} seed inteiro de 32 bits
 * @returns {() => number} gerador uniforme em [0, 1)
 */
function mulberry32(seed: number): () => number {
    let a = seed | 0;
    return function (): number {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Calcula o C de Geary local (LISA — Local Indicator of Spatial Association).
 *
 * Definição (Anselin 1995, eq. 18; Geary 1954):
 *
 *   c_i = Σ_j w_ij · (z_i − z_j)²
 *
 * onde z = (x − x̄)/σ são os valores padronizados (σ = desvio populacional, de
 * modo que Σ z² = n). Valores BAIXOS de c_i indicam vizinhança semelhante
 * (autocorrelação espacial POSITIVA); valores ALTOS indicam dissimilaridade
 * (outlier local / autocorrelação NEGATIVA). É o complemento local do Geary
 * global, assim como o I de Moran local é do Moran global.
 *
 * Inferência por permutação condicional (Anselin 1995, §4): para cada i fixa-se
 * z_i e permutam-se os demais (n−1) valores; o p pseudo-significância segue
 * p = (m + 1)/(P + 1), com m = nº de simulações tão ou mais extremas que o
 * observado (two-sided via mínimo das caudas). O z-score usa média/desvio das
 * simulações. PRNG determinístico (mulberry32) ⇒ resultado reprodutível.
 *
 * Esperança analítica (cross-check, condicional): sob aleatorização condicional
 *   E[c_i] = (n/(n−1)) · (z_i² + 1) · Σ_j w_ij
 * (derivada de E[z_j]=−z_i/(n−1) e E[z_j²]=(n−z_i²)/(n−1) com Σz²=n).
 *
 * Classificação (quadrante do Moran/LISA scatter, restrita aos significativos):
 *   HH — z_i alto e vizinhos altos (c_i baixo, positivo)         → hotspot
 *   LL — z_i baixo e vizinhos baixos (c_i baixo, positivo)       → coldspot
 *   HL — z_i alto cercado de baixos (c_i alto, dissimilar)       → outlier
 *   LH — z_i baixo cercado de altos (c_i alto, dissimilar)       → outlier
 *   ns — não significativo (pValue > alpha)
 *
 * Puro: sem DOM, sem mutação das entradas, retorno frozen e determinístico.
 *
 * Referências:
 *   - Anselin, L. (1995) "Local Indicators of Spatial Association — LISA",
 *     Geographical Analysis, 27(2), pp. 93–115.
 *     DOI: 10.1111/j.1538-4632.1995.tb00338.x
 *   - Geary, R.C. (1954) "The Contiguity Ratio and Statistical Mapping",
 *     The Incorporated Statistician, 5(3), pp. 115–145. DOI: 10.2307/2986645
 *
 * @param {number[]} values valores observados por localização
 * @param {number[][]} W matriz de pesos espaciais (n×n; diagonal zero)
 * @param {{permutations?:number, seed?:number, alpha?:number}} [opts]
 *        permutations (default 999), seed (default 1234567), alpha (default 0.05)
 * @returns {Readonly<{local:Readonly<{i:number,ci:number,expectedCi:number,zScore:number,pValue:number,classification:string}>[],alpha:number,permutations:number,n:number}>}
 */
export function computeLocalGearyC(
    values: number[],
    W: number[][],
    opts: { permutations?: number; seed?: number; alpha?: number } = {},
): Readonly<{
    local: readonly Readonly<{ i: number; ci: number; expectedCi: number; zScore: number; pValue: number; classification: string }>[];
    alpha: number;
    permutations: number;
    n: number;
}> {
    const n = values.length;
    if (n !== W.length) {
        throw new RangeError(`computeLocalGearyC: values.length (${n}) must equal W.length (${W.length})`);
    }

    const permutations = Math.max(0, Math.floor(opts.permutations ?? 999));
    const seed = Math.floor(opts.seed ?? 1234567);
    const alpha = opts.alpha ?? 0.05;

    const mu = meanArr(values);
    const sigma = stdArr(values);

    // Valores uniformes — sem variância: tudo c_i = 0, não significativo.
    if (sigma === 0) {
        const local = values.map((_, i) =>
            Object.freeze({ i, ci: 0, expectedCi: 0, zScore: 0, pValue: 1, classification: 'ns' as string }),
        );
        return Object.freeze({ local: Object.freeze(local), alpha, permutations, n });
    }

    // Padronização: Σ z² = n (desvio populacional).
    const z = values.map((v) => (v - mu) / sigma);

    // c_i observado para uma configuração z dada (z_i fixo no índice i).
    const localCAt = (i: number, zArr: number[]): number => {
        let c = 0;
        const wi = W[i] as number[];
        for (let j = 0; j < n; j++) {
            c += (wi[j] as number) * ((zArr[i] as number) - (zArr[j] as number)) ** 2;
        }
        return c;
    };

    const rnd = mulberry32(seed);

    const VALID_CLASSES = new Set(['HH', 'LL', 'HL', 'LH', 'ns']);

    const local = z.map((zi, i) => {
        const ci = localCAt(i, z);

        // Esperança analítica condicional (cross-check, não depende de permutação).
        let wiSum = 0;
        const wi = W[i] as number[];
        for (let j = 0; j < n; j++) wiSum += wi[j] as number;
        const expectedCi = ((n / (n - 1)) * ((zi as number) ** 2 + 1)) * wiSum;

        // Teste de permutação condicional: fixa z_i, embaralha os demais (n−1).
        const others: number[] = [];
        for (let k = 0; k < n; k++) if (k !== i) others.push(z[k] as number);

        let geCount = 0; // simulações ≥ observado (cauda alta)
        let leCount = 0; // simulações ≤ observado (cauda baixa)
        let sumSim = 0;
        let sumSim2 = 0;
        const zp = z.slice(); // buffer reaproveitado; zp[i] permanece z_i

        for (let p = 0; p < permutations; p++) {
            // Fisher–Yates determinístico sobre "others".
            for (let k = others.length - 1; k > 0; k--) {
                const r = Math.floor(rnd() * (k + 1));
                const tmp = others[k] as number;
                others[k] = others[r] as number;
                others[r] = tmp;
            }
            let m = 0;
            for (let k = 0; k < n; k++) {
                if (k !== i) zp[k] = others[m++] as number;
            }
            const cs = localCAt(i, zp);
            sumSim += cs;
            sumSim2 += cs * cs;
            if (cs >= ci) geCount++;
            if (cs <= ci) leCount++;
        }

        let zScore = 0;
        let pValue = 1;
        let lowerThanExpected = ci < expectedCi; // c_i baixo ⇒ associação positiva
        if (permutations > 0) {
            const meanSim = sumSim / permutations;
            const varSim = Math.max(0, sumSim2 / permutations - meanSim * meanSim);
            const sdSim = Math.sqrt(varSim);
            zScore = sdSim > 0 ? (ci - meanSim) / sdSim : 0;
            const pLow = (leCount + 1) / (permutations + 1);
            const pHigh = (geCount + 1) / (permutations + 1);
            pValue = Math.min(1, 2 * Math.min(pLow, pHigh));
            lowerThanExpected = ci < meanSim;
        }

        // Spatial lag dos desvios padronizados → sinal da vizinhança.
        let wz = 0;
        for (let j = 0; j < n; j++) wz += (wi[j] as number) * (z[j] as number);

        let classification: string;
        if (pValue > alpha) {
            classification = 'ns';
        } else if (lowerThanExpected) {
            // Associação positiva: hotspot (HH) ou coldspot (LL) conforme z_i.
            classification = (zi as number) >= 0 ? 'HH' : 'LL';
        } else {
            // Dissimilaridade local (outlier): HL ou LH conforme z_i vs vizinhos.
            classification = (zi as number) >= 0 ? 'HL' : 'LH';
            if ((zi as number) >= 0 && wz > 0) classification = 'HL';
            else if ((zi as number) < 0 && wz < 0) classification = 'LH';
        }
        if (!VALID_CLASSES.has(classification)) classification = 'ns';

        return Object.freeze({ i, ci, expectedCi, zScore, pValue, classification });
    });

    return Object.freeze({ local: Object.freeze(local), alpha, permutations, n });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const spatialAutocorrelationMeta = {
    name: 'spatialAutocorrelation',
    description: 'spatialAutocorrelation',
    category: 'analytics',
    familyTags: ['environmental'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // CONNECTOR populated 2026-06-02 — Autocorrelação espacial (Moran I + Geary C)
    // Reference: Anselin (1995) Local Indicators of Spatial Association — LISA
    inputSchema: {
        type: 'object',
        properties: {
            points: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] }, minItems: 3 },
            values: { type: 'array', items: { type: 'number' } },
            weightMethod: { type: 'string', enum: ['inverse_distance', 'binary_contiguity', 'knn'], default: 'inverse_distance' },
            bandwidth: { type: 'number', description: 'Bandwidth para inverse_distance (m)' },
            k: { type: 'number', description: 'k para knn' },
        },
        required: ['points', 'values'],
    },
    outputSchema: {
        type: 'object',
        properties: {
            moranI: { type: 'object', properties: { I: { type: 'number' }, zScore: { type: 'number' }, pValueApprox: { type: 'number' }, interpretation: { type: 'string' } } },
            gearyC: { type: 'object', properties: { C: { type: 'number' }, zScore: { type: 'number' } } },
            n: { type: 'number' },
        },
        required: ['moranI'],
    },
};
