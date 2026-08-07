// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   ORDINARY KRIGING — Implementacao propria para publicacao academica
   ================================================================

   Interpolacao geoestatistica com estimacao de semi-variograma.
   Substitui dependencia CDN (@sakitam-gis/kriging@0.1.0) por
   implementacao independente, citavel e auditavel.

   MODELOS DE SEMI-VARIOGRAMA:
   - Esferico  (Matheron, 1963)
   - Exponencial (Journel & Huijbregts, 1978)
   - Gaussiano (Cressie, 1993)

   ESTIMACAO DE PARAMETROS:
   - Experimental variogram via lag binning
   - Weighted Least Squares (WLS) fitting
   - Parametros: nugget (C0), sill (C0+C1), range (a)

   SISTEMA LINEAR:
   - Ordinary Kriging com restricao de Lagrange (soma pesos = 1)
   - Resolve via eliminacao Gaussiana com pivotamento parcial

   REFERENCIAS ACADEMICAS:
   - Krige, D.G. (1951). J. Chem. Metal. Mining Soc. South Africa.
   - Matheron, G. (1963). Economic Geology, 58(8), 1246-1266.
   - Journel, A.G. & Huijbregts, C.J. (1978). Mining Geostatistics.
     Academic Press. ISBN 0-12-391050-1.
   - Cressie, N.A.C. (1993). Statistics for Spatial Data. Wiley.
     ISBN 0-471-00255-7.
   - Webster, R. & Oliver, M.A. (2007). Geostatistics for Environmental
     Scientists. 2nd ed. Wiley. ISBN 978-0-470-02858-2.

   ================================================================ */

// ----------------------------------------------------------------
// SEMI-VARIOGRAM MODELS
// Cada modelo recebe distancia h e parametros {nugget, sill, range}.
// Retorna gamma(h) - semi-variancia teorica.
// ----------------------------------------------------------------

/**
 * Modelo esferico (Matheron, 1963).
 * gamma(h) = C0 + C1 * [1.5*(h/a) - 0.5*(h/a)^3] para h <= a
 * gamma(h) = C0 + C1                                para h > a
 *
 * @param h - distancia entre pares
 * @param nugget - C0 (variancia a distancia zero)
 * @param sill - C0 + C1 (patamar)
 * @param range - a (alcance)
 * @returns semi-variancia
 */
function spherical(h: number, nugget: number, sill: number, range: number): number {
    if (h <= 0) return 0;
    if (h >= range) return sill;
    const hr = h / range;
    return nugget + (sill - nugget) * (1.5 * hr - 0.5 * hr * hr * hr);
}

/**
 * Modelo exponencial (Journel & Huijbregts, 1978).
 * gamma(h) = C0 + C1 * [1 - exp(-3h/a)]
 * Alcance pratico = a (95% do sill atingido em h = a).
 *
 * @param h
 * @param nugget
 * @param sill
 * @param range
 */
function exponential(h: number, nugget: number, sill: number, range: number): number {
    if (h <= 0) return 0;
    return nugget + (sill - nugget) * (1 - Math.exp((-3 * h) / range));
}

/**
 * Modelo gaussiano (Cressie, 1993).
 * gamma(h) = C0 + C1 * [1 - exp(-3*(h/a)^2)]
 * Superficies mais suaves que esferico/exponencial.
 *
 * @param h
 * @param nugget
 * @param sill
 * @param range
 */
function gaussian(h: number, nugget: number, sill: number, range: number): number {
    if (h <= 0) return 0;
    const hr = h / range;
    return nugget + (sill - nugget) * (1 - Math.exp(-3 * hr * hr));
}

const VARIOGRAM_MODELS = { spherical, exponential, gaussian };

// ----------------------------------------------------------------
// EXPERIMENTAL VARIOGRAM
// ----------------------------------------------------------------

/**
 * Calcula semi-variograma experimental por lag binning.
 * gamma(h) = (1/2N) * sum[(z(xi) - z(xj))^2] para pares com dist ~ h.
 *
 * @param x - coordenadas X
 * @param y - coordenadas Y
 * @param z - valores observados
 * @param nLags - numero de bins de distancia
 */
function experimentalVariogram(
    x: Float64Array,
    y: Float64Array,
    z: Float64Array,
    nLags: number = 15,
): { lags: Float64Array; gammas: Float64Array; counts: Uint32Array; maxDist: number } {
    const n = x.length;

    // Calcula distancia maxima entre pares
    // Regra de Journel: variograma confiavel ate metade da distancia maxima
    // Para n < 10, usa 75% para evitar bins vazios com poucos pares
    let maxDist = 0;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const d = Math.hypot(x[i]! - x[j]!, y[i]! - y[j]!);
            if (d > maxDist) maxDist = d;
        }
    }
    maxDist *= n < 10 ? 0.75 : 0.5;

    const lagWidth = maxDist / nLags;
    const lags = new Float64Array(nLags);
    const gammas = new Float64Array(nLags);
    const counts = new Uint32Array(nLags);

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const d = Math.hypot(x[i]! - x[j]!, y[i]! - y[j]!);
            const bin = Math.floor(d / lagWidth);
            if (bin >= 0 && bin < nLags) {
                const diff = z[i]! - z[j]!;
                gammas[bin]! += diff * diff;
                lags[bin]! += d;
                counts[bin]!++;
            }
        }
    }

    // Normaliza: gamma = (1/2N) * sum(diff^2), lag = media das distancias
    for (let k = 0; k < nLags; k++) {
        if (counts[k]! > 0) {
            gammas[k] = gammas[k]! / (2 * counts[k]!);
            lags[k] = lags[k]! / counts[k]!;
        }
    }

    return { lags, gammas, counts, maxDist };
}

// ----------------------------------------------------------------
// VARIOGRAM FITTING (Weighted Least Squares)
// ----------------------------------------------------------------

/**
 * Ajusta modelo de semi-variograma por WLS (Cressie, 1985).
 * Pesos = N(h) / gamma_exp(h)^2 - bins com mais pares e menor
 * variancia recebem peso maior.
 *
 * Busca por grid search (rapido, robusto) sobre nugget, sill, range.
 *
 * @param lags - distancias medias por bin
 * @param gammas - semi-variancias experimentais
 * @param counts - contagem de pares por bin
 * @param maxDist - distancia maxima considerada
 * @param modelName - 'spherical' | 'exponential' | 'gaussian'
 */
function fitVariogram(
    lags: Float64Array,
    gammas: Float64Array,
    counts: Uint32Array,
    maxDist: number,
    modelName: string = 'spherical',
): { nugget: number; sill: number; range: number; model: string } {
    const modelFn =
        (VARIOGRAM_MODELS as Record<string, any>)[modelName] || VARIOGRAM_MODELS.spherical;

    // Filtra bins vazios
    const validIdx: number[] = [];
    for (let k = 0; k < lags.length; k++) {
        if (counts[k]! > 0 && gammas[k]! > 0) validIdx.push(k);
    }
    if (validIdx.length < 2) {
        // Fallback: sem dados suficientes para ajuste
        const sillGuess = gammas.length > 0 ? gammas[validIdx[0] || 0] || 1 : 1;
        return { nugget: 0, sill: sillGuess, range: maxDist * 0.5, model: modelName };
    }

    // Estimativas iniciais
    const maxGamma = Math.max(...validIdx.map((i) => gammas[i]!));
    const minGamma = Math.min(...validIdx.map((i) => gammas[i]!));

    let bestCost = Infinity;
    let bestParams = { nugget: 0, sill: maxGamma, range: maxDist * 0.5 };

    // Grid search: 10 nuggets x 10 sills x 10 ranges = 1000 combinacoes
    const nSteps = 10;
    for (let ni = 0; ni <= nSteps; ni++) {
        const nugget = (minGamma * ni) / nSteps;
        for (let si = 1; si <= nSteps; si++) {
            const sill = nugget + ((maxGamma - nugget) * si) / nSteps;
            for (let ri = 1; ri <= nSteps; ri++) {
                const range = (maxDist * ri) / nSteps;

                // WLS cost: sum(N(h) * (gamma_exp - gamma_model)^2 / gamma_model^2)
                let cost = 0;
                for (const k of validIdx) {
                    const predicted = modelFn(lags[k], nugget, sill, range);
                    if (predicted <= 0) {
                        cost = Infinity;
                        break;
                    }
                    const residual = gammas[k]! - predicted;
                    cost += (counts[k]! * (residual * residual)) / (predicted * predicted);
                }

                if (cost < bestCost) {
                    bestCost = cost;
                    bestParams = { nugget, sill, range };
                }
            }
        }
    }

    // Refinamento local: Nelder-Mead simplificado (3 iteracoes de bisection)
    for (let refine = 0; refine < 3; refine++) {
        const { nugget: bn, sill: bs, range: br } = bestParams;
        const stepN = minGamma / (nSteps * Math.pow(2, refine + 1));
        const stepS = maxGamma / (nSteps * Math.pow(2, refine + 1));
        const stepR = maxDist / (nSteps * Math.pow(2, refine + 1));

        for (let dn = -2; dn <= 2; dn++) {
            const nugget = Math.max(0, bn + dn * stepN);
            for (let ds = -2; ds <= 2; ds++) {
                const sill = Math.max(nugget + 1e-10, bs + ds * stepS);
                for (let dr = -2; dr <= 2; dr++) {
                    const range = Math.max(1e-10, br + dr * stepR);

                    let cost = 0;
                    for (const k of validIdx) {
                        const predicted = modelFn(lags[k], nugget, sill, range);
                        if (predicted <= 0) {
                            cost = Infinity;
                            break;
                        }
                        const residual = gammas[k]! - predicted;
                        cost += (counts[k]! * (residual * residual)) / (predicted * predicted);
                    }

                    if (cost < bestCost) {
                        bestCost = cost;
                        bestParams = { nugget, sill, range };
                    }
                }
            }
        }
    }

    return { ...bestParams, model: modelName };
}

// ----------------------------------------------------------------
// LINEAR SYSTEM SOLVER (Gaussian elimination with partial pivoting)
// ----------------------------------------------------------------

/**
 * Resolve sistema linear Ax = b por eliminacao Gaussiana com pivotamento.
 * Modifica A e b in-place. Retorna x.
 *
 * @param A - matriz NxN (array de arrays)
 * @param b - vetor N
 * @returns vetor solucao x
 */
function solveLinearSystem(A: Float64Array[], b: Float64Array): Float64Array {
    const n = b.length;

    // Forward elimination
    for (let k = 0; k < n; k++) {
        // Partial pivoting
        let maxVal = Math.abs(A[k]![k]!);
        let maxRow = k;
        for (let i = k + 1; i < n; i++) {
            if (Math.abs(A[i]![k]!) > maxVal) {
                maxVal = Math.abs(A[i]![k]!);
                maxRow = i;
            }
        }
        if (maxRow !== k) {
            [A[k], A[maxRow]] = [A[maxRow]!, A[k]!];
            [b[k], b[maxRow]] = [b[maxRow]!, b[k]!];
        }

        const pivot = A[k]![k]!;
        if (Math.abs(pivot) < 1e-12) continue; // singular — skip

        for (let i = k + 1; i < n; i++) {
            const factor = A[i]![k]! / pivot;
            for (let j = k; j < n; j++) {
                A[i]![j]! -= factor * A[k]![j]!;
            }
            b[i]! -= factor * b[k]!;
        }
    }

    // Back substitution
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
        let sum = b[i]!;
        for (let j = i + 1; j < n; j++) {
            sum -= A[i]![j]! * x[j]!;
        }
        x[i] = Math.abs(A[i]![i]!) > 1e-12 ? sum / A[i]![i]! : 0;
    }

    return x;
}

// ----------------------------------------------------------------
// ORDINARY KRIGING - Train & Predict
// ----------------------------------------------------------------

/**
 * Treina modelo de kriging: estima variograma experimental e ajusta modelo.
 *
 * @param values - valores observados (z)
 * @param xCoords - coordenadas X
 * @param yCoords - coordenadas Y
 * @param model - modelo: 'spherical' | 'exponential' | 'gaussian'
 * @param sigma2 - nugget forçado (0 = estimar automaticamente)
 * @param _alpha - não usado (compatibilidade com API anterior)
 * @returns variograma treinado (opaco - passar para predict())
 */
export function train(
    values: number[],
    xCoords: number[],
    yCoords: number[],
    model: string = 'spherical',
    sigma2: number = 0,
    _alpha: number = 100,
): object {
    const n = values.length;
    if (n < 2) throw new Error('Kriging requer pelo menos 2 pontos');

    const x = Float64Array.from(xCoords);
    const y = Float64Array.from(yCoords);
    const z = Float64Array.from(values);

    // Numero de lags adaptativo: max(5, min(15, n/2))
    const nLags = Math.max(5, Math.min(15, Math.floor(n / 2)));

    const { lags, gammas, counts, maxDist } = experimentalVariogram(x, y, z, nLags);

    const modelName = (VARIOGRAM_MODELS as Record<string, any>)[model] ? model : 'spherical';
    const fitted = fitVariogram(lags, gammas, counts, maxDist, modelName);

    // Se nugget forcado (sigma2 > 0), usa o valor do usuario
    if (sigma2 > 0) {
        fitted.nugget = sigma2;
    }

    // Pre-computa matriz de distancias e variograma entre pontos conhecidos
    // para evitar recomputacao a cada predict()
    const modelFn = (VARIOGRAM_MODELS as Record<string, any>)[fitted.model];
    const m = n + 1; // +1 para multiplicador de Lagrange
    const K = new Array<Float64Array>(m);
    for (let i = 0; i < m; i++) K[i] = new Float64Array(m);

    for (let i = 0; i < n; i++) {
        for (let j = i; j < n; j++) {
            const d = Math.hypot(x[i]! - x[j]!, y[i]! - y[j]!);
            const g = modelFn(d, fitted.nugget, fitted.sill, fitted.range);
            K[i]![j] = g;
            K[j]![i] = g;
        }
        K[i]![n] = 1; // restricao de Lagrange
        K[n]![i] = 1;
    }
    K[n]![n] = 0;

    return {
        x,
        y,
        z,
        n,
        params: fitted,
        modelFn,
        K,
        // Metadados para diagnostico / publicacao
        experimental: { lags, gammas, counts, maxDist, nLags },
    };
}

/**
 * Prediz valor em um ponto usando modelo de kriging treinado.
 *
 * @param px - coordenada X do ponto de consulta
 * @param py - coordenada Y do ponto de consulta
 * @param variogram - resultado de train()
 * @returns valor interpolado
 */
export function predict(px: number, py: number, variogram: object): number {
    const { x, y, z, n, params, modelFn, K } = variogram as any;
    const m = n + 1;

    // Monta vetor k (variograma entre ponto de consulta e pontos conhecidos)
    const k = new Float64Array(m);
    for (let i = 0; i < n; i++) {
        const d = Math.hypot(x[i] - px, y[i] - py);
        k[i] = modelFn(d, params.nugget, params.sill, params.range);
    }
    k[n] = 1; // restricao de Lagrange

    // Copia K para resolver sem destruir (resolve modifica in-place)
    const Kcopy = new Array<Float64Array>(m);
    for (let i = 0; i < m; i++) {
        Kcopy[i] = new Float64Array(K[i]);
    }
    const kcopy = new Float64Array(k);

    // Resolve K * w = k
    const w = solveLinearSystem(Kcopy, kcopy);

    // Predição = soma ponderada dos valores conhecidos
    let result = 0;
    for (let i = 0; i < n; i++) {
        result += w[i]! * z[i];
    }

    return result;
}

/**
 * Prediz valor e retorna variancia de kriging (incerteza).
 *
 * @param px
 * @param py
 * @param variogram
 */
export function predictWithVariance(
    px: number,
    py: number,
    variogram: object,
): { value: number; variance: number } {
    const { x, y, z, n, params, modelFn, K } = variogram as any;
    const m = n + 1;

    const k = new Float64Array(m);
    for (let i = 0; i < n; i++) {
        const d = Math.hypot(x[i] - px, y[i] - py);
        k[i] = modelFn(d, params.nugget, params.sill, params.range);
    }
    k[n] = 1;

    const Kcopy = new Array<Float64Array>(m);
    for (let i = 0; i < m; i++) {
        Kcopy[i] = new Float64Array(K[i]);
    }
    const kcopy = new Float64Array(k);

    const w = solveLinearSystem(Kcopy, kcopy);

    let value = 0;
    let variance = 0;
    for (let i = 0; i < n; i++) {
        value += w[i]! * z[i];
        variance += w[i]! * k[i]!;
    }
    variance += w[n]!; // contribuicao do multiplicador de Lagrange

    return { value, variance: Math.max(0, params.sill - variance) };
}

/**
 * Cross-validation leave-one-out (LOO).
 * Remove cada ponto, re-treina com os demais, prediz o removido.
 * Retorna metricas de erro para avaliacao da qualidade do modelo.
 *
 * @param values
 * @param xCoords
 * @param yCoords
 * @param model
 */
export function crossValidate(
    values: number[],
    xCoords: number[],
    yCoords: number[],
    model: string = 'spherical',
): { rmse: number; mae: number; r2: number; residuals: number[] } {
    const n = values.length;
    if (n < 4) throw new Error('Cross-validation requer pelo menos 4 pontos');

    const residuals = new Array<number>(n);
    let ssRes = 0,
        ssTotal = 0,
        sumAbs = 0;
    const mean = values.reduce((a, b) => a + b, 0) / n;

    for (let i = 0; i < n; i++) {
        const xSub: number[] = [],
            ySub: number[] = [],
            zSub: number[] = [];
        for (let j = 0; j < n; j++) {
            if (j !== i) {
                xSub.push(xCoords[j]!);
                ySub.push(yCoords[j]!);
                zSub.push(values[j]!);
            }
        }

        const vario = train(zSub, xSub, ySub, model);
        const predicted = predict(xCoords[i]!, yCoords[i]!, vario);
        const error = values[i]! - predicted;

        residuals[i] = error;
        ssRes += error * error;
        ssTotal += (values[i]! - mean) * (values[i]! - mean);
        sumAbs += Math.abs(error);
    }

    return {
        rmse: Math.sqrt(ssRes / n),
        mae: sumAbs / n,
        r2: ssTotal > 0 ? 1 - ssRes / ssTotal : 0,
        residuals,
    };
}

/**
 * Modelos disponiveis para selecao na UI.
 */
export const KRIGING_MODELS = {
    spherical: { id: 'spherical', name: 'Esferico', ref: 'Matheron (1963)' },
    exponential: { id: 'exponential', name: 'Exponencial', ref: 'Journel & Huijbregts (1978)' },
    gaussian: { id: 'gaussian', name: 'Gaussiano', ref: 'Cressie (1993)' },
};
