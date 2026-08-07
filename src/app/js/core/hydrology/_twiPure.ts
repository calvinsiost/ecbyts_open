// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   WATERSHED-FAMILY / TWI — Topographic Wetness Index. Pure-logic.

   O Índice Topográfico de Umidade (TWI) prevê, a partir só da topografia,
   ONDE a água tende a se acumular e o solo a saturar (fundos de vale, zonas
   ripárias, áreas de afloramento de lençol). É o índice central do modelo
   hidrológico TOPMODEL e é amplamente usado em mapeamento de áreas úmidas,
   risco de alagamento, erosão e habitat.

       TWI = ln( a / tan β )

   onde:
     a     = área de contribuição específica (specific catchment area):
             área de montante que drena por unidade de largura de contorno
             [m²/m = m]; deriva-se da acumulação de fluxo D8.
     tan β = declividade local (gradiente do terreno) [adimensional].

   Valores ALTOS de TWI = muita área a montante + pouca declividade →
   tendência a saturar/encharcar. Valores BAIXOS = encostas íngremes e bem
   drenadas. Determinístico, sem DOM/rede; grade row-major. Compõe a
   acumulação de fluxo de `_d8FlowPure`.

   Refs:
     - Beven, K.J. & Kirkby, M.J. (1979). "A physically based, variable
       contributing area model of basin hydrology." Hydrological Sciences
       Bulletin 24(1): 43-69. DOI: 10.1080/02626667909491834. (definição
       original do índice topográfico ln(a/tanβ) no TOPMODEL).
     - Quinn, P., Beven, K., Chevallier, P. & Planchon, O. (1991). "The
       prediction of hillslope flow paths for distributed hydrological
       modelling using digital terrain models." Hydrological Processes 5(1):
       59-79. DOI: 10.1002/hyp.3360050106. (cálculo de a/tanβ em DEMs).
     - Sørensen, R., Zinko, U. & Seibert, J. (2006). "On the calculation of
       the topographic wetness index: evaluation of different methods based
       on field observations." Hydrology and Earth System Sciences 10:
       101-112. DOI: 10.5194/hess-10-101-2006. (convenções de SCA/declividade).
   ================================================================ */

// 8 vizinhos: E, SE, S, SW, W, NW, N, NE (mesma convenção de _d8FlowPure)
// eslint-disable-next-line
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
// eslint-disable-next-line
const DY = [0, 1, 1, 1, 0, -1, -1, -1];

export interface TwiGrid {
    readonly width: number;
    readonly height: number;
    readonly elevation: ReadonlyArray<number> | Float64Array; // row-major: idx = y*width + x
}

function idx(x: number, y: number, w: number): number {
    return y * w + x;
}

function validateDims(w: number, h: number): void {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 2 || h < 2) {
        throw new RangeError('TWI: width/height inteiros ≥ 2');
    }
}

/**
 * Declividade local (tan β) por célula, via diferenças finitas centradas de
 * Horn (1981) — o operador 3×3 usado em GIS (gdaldem/ArcGIS). Retorna o
 * gradiente como tangente do ângulo de inclinação (adimensional, ≥ 0).
 *
 * Nas bordas, usa diferenças unilaterais (forward/backward) no que existir.
 *
 * @param g tamanho da célula (m). Deve ser > 0.
 * @returns Float64Array de tan β (row-major), tamanho width*height.
 */
export function computeSlopeTangent(g: TwiGrid, cellSize: number): Float64Array {
    validateDims(g.width, g.height);
    if (g.elevation.length !== g.width * g.height) {
        throw new RangeError('TWI: elevation deve ter width*height valores');
    }
    if (!(cellSize > 0)) throw new RangeError('TWI: cellSize deve ser > 0');
    const { width: w, height: h } = g;
    const z = g.elevation;
    const slope = new Float64Array(w * h);
    // Amostra a elevação com clamping nas bordas (replica a borda → diferença unilateral)
    const at = (x: number, y: number): number => {
        const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
        const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
        return z[cy * w + cx]!;
    };
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            // Horn (1981): janela 3×3, vizinhos ponderados (peso 2 nos cardeais)
            //   a b c
            //   d e f
            //   g h i
            const a = at(x - 1, y - 1),
                b = at(x, y - 1),
                c = at(x + 1, y - 1);
            const d = at(x - 1, y),
                f = at(x + 1, y);
            const gg = at(x - 1, y + 1),
                hh = at(x, y + 1),
                ii = at(x + 1, y + 1);
            const dzdx = (c + 2 * f + ii - (a + 2 * d + gg)) / (8 * cellSize);
            const dzdy = (gg + 2 * hh + ii - (a + 2 * b + c)) / (8 * cellSize);
            slope[idx(x, y, w)] = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
        }
    }
    return slope;
}

/**
 * Área de contribuição específica (specific catchment area, SCA):
 *   a = (área de montante que drena pela célula) / (largura de contorno)
 *     = (acc_células × cellSize²) / cellSize
 *     = acc_células × cellSize        [m²/m = m]
 *
 * `acc` é a acumulação de fluxo de `computeFlowAccumulation` (nº de células
 * que drenam por cada célula, INCLUINDO ela própria — daí o piso ≥ 1).
 *
 * @param acc acumulação de fluxo (nº de células), row-major.
 * @param cellSize tamanho da célula (m). Deve ser > 0.
 */
export function computeSpecificCatchmentArea(
    acc: ReadonlyArray<number> | Float64Array,
    cellSize: number,
): Float64Array {
    if (!(cellSize > 0)) throw new RangeError('TWI: cellSize deve ser > 0');
    const n = acc.length;
    const sca = new Float64Array(n);
    for (let i = 0; i < n; i++) sca[i] = acc[i]! * cellSize;
    return sca;
}

export interface TwiResult {
    /** TWI = ln(a / tanβ) por célula (row-major). */
    readonly twi: Float64Array;
    /** Área de contribuição específica a [m] por célula. */
    readonly sca: Float64Array;
    /** Declividade local tan β por célula (adimensional). */
    readonly slopeTangent: Float64Array;
    /** Valor mínimo de TWI na grade. */
    readonly min: number;
    /** Valor máximo de TWI na grade. */
    readonly max: number;
}

/**
 * Índice Topográfico de Umidade (Beven & Kirkby 1979): TWI = ln(a / tan β).
 *
 * Combina a área de contribuição específica `a` (de uma acumulação de fluxo
 * já calculada) com a declividade local tan β derivada do próprio DEM.
 *
 * Para evitar singularidade onde tan β → 0 (áreas planas/depressões
 * preenchidas), a declividade é limitada por baixo a `minSlope`
 * (padrão 0.001, isto é, 0,1 % — convenção usual em GIS/TOPMODEL para
 * células planas; ver Sørensen et al. 2006).
 *
 * @param acc acumulação de fluxo (nº de células), row-major — de
 *            `computeFlowAccumulation`.
 * @param g grade de elevação (DEM) row-major.
 * @param cellSize tamanho da célula (m). Deve ser > 0.
 * @param minSlope piso da declividade tan β (padrão 0.001). Deve ser > 0.
 */
export function computeTWI(
    acc: ReadonlyArray<number> | Float64Array,
    g: TwiGrid,
    cellSize: number,
    minSlope = 0.001,
): TwiResult {
    validateDims(g.width, g.height);
    const n = g.width * g.height;
    if (acc.length !== n) throw new RangeError('computeTWI: acc.length != width*height');
    if (!(cellSize > 0)) throw new RangeError('computeTWI: cellSize deve ser > 0');
    if (!(minSlope > 0)) throw new RangeError('computeTWI: minSlope deve ser > 0');

    const sca = computeSpecificCatchmentArea(acc, cellSize);
    const slopeTangent = computeSlopeTangent(g, cellSize);
    const twi = new Float64Array(n);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < n; i++) {
        const tanB = Math.max(slopeTangent[i]!, minSlope);
        const a = Math.max(sca[i]!, cellSize); // a ≥ 1 célula de contribuição
        const v = Math.log(a / tanB);
        twi[i] = v;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    return Object.freeze({ twi, sca, slopeTangent, min, max });
}
