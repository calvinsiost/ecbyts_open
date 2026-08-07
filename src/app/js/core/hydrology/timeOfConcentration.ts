// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * Time of Concentration - Kirpich (1940) empirical method.
 *
 * Tempo de concentração de uma bacia pelo método empírico de Kirpich (1940).
 * O tempo de concentração (tc) é o tempo que uma gota de chuva leva para escoar
 * do ponto hidraulicamente mais distante até o exutório. É a entrada que faltava
 * para fechar o Método Racional (computePeakFlow em core/analytics/riverBasinHydrology),
 * que CONSOME tc mas não o calculava.
 *
 * Equação original (unidades imperiais, Kirpich 1940):
 *   tc = 0.0078 · L^0.77 · S^(-0.385)   [tc em min, L em pés, S adimensional]
 *
 * Forma SI equivalente (L em metros):
 *   tc = 0.0195 · L^0.77 · S^(-0.385)   [tc em min, L em metros, S adimensional]
 *   (0.0195 = 0.0078 · 3.28084^0.77, conversão pé→metro do comprimento)
 *
 * onde S = H / L é a declividade média do talvegue (queda H sobre comprimento L).
 *
 * Faixa de validade (Kirpich 1940; SCS/NEH-4): pequenas bacias rurais
 * (A < ~80 ha), canais bem definidos, S entre 0.3% e 10%, derivada de seis
 * bacias do Tennessee. Fatores de ajuste empíricos para outras coberturas:
 *   - canal/talvegue natural com vegetação rala: ×1.0 (default)
 *   - escoamento sobre concreto/asfalto ou canal revestido: ×0.4
 *   - escoamento em superfície de grama/pasto (overland): ×2.0
 * (SCS, National Engineering Handbook, Section 4, nota ao método de Kirpich.)
 *
 * Puro: zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * References / Referências:
 * - Kirpich, Z.P. (1940). "Time of concentration of small agricultural
 *   watersheds." Civil Engineering, 10(6):362. (American Society of Civil
 *   Engineers / ASCE).
 * - USDA SCS (1972). National Engineering Handbook, Section 4: Hydrology
 *   (NEH-4), Kirpich method note. U.S. Soil Conservation Service.
 * - Chow, V.T., Maidment, D.R. & Mays, L.W. (1988). Applied Hydrology.
 *   McGraw-Hill. ISBN 978-0070108110 (Table 15.1.1, Kirpich formula).
 *
 * @module timeOfConcentration
 */
'use strict';

const FT_PER_M = 3.28084;
// Constante SI: 0.0078 (imperial) reescalada para L em metros.
// 0.0078 · (ft/m)^0.77 = 0.0078 · 3.28084^0.77 ≈ 0.019497
const KIRPICH_SI = 0.0078 * Math.pow(FT_PER_M, 0.77);
const MIN_PER_HOUR = 60;

/** Surface/cover adjustment factors per SCS NEH-4 note to the Kirpich method. */
export const KIRPICH_SURFACE_FACTORS = Object.freeze({
    natural: 1.0, // canal/talvegue natural (calibração original)
    paved: 0.4, // canal revestido, concreto ou asfalto
    overland: 2.0, // escoamento difuso sobre grama/pasto
});

export type KirpichSurface = keyof typeof KIRPICH_SURFACE_FACTORS;

export interface KirpichResult {
    tc_min: number;
    tc_h: number;
    slope: number;
    surfaceFactor: number;
}

/**
 * Compute time of concentration via the Kirpich (1940) method (SI form).
 * Calcula o tempo de concentração pelo método de Kirpich (1940), forma SI.
 *
 * @param length_m - Comprimento do talvegue / fluxo principal (metros), > 0.
 * @param slope    - Declividade média S = H/L (adimensional, m/m), em (0, 1].
 * @param surface  - Cobertura: 'natural' (default), 'paved' ou 'overland'.
 * @returns tc em minutos e horas, mais a declividade e o fator aplicado.
 * @throws {TypeError}  se length_m ou slope não forem números finitos.
 * @throws {RangeError} se length_m <= 0, slope fora de (0, 1], ou cobertura inválida.
 */
export function computeKirpichTc(length_m: number, slope: number, surface: KirpichSurface = 'natural'): KirpichResult {
    if (typeof length_m !== 'number' || !Number.isFinite(length_m)) {
        throw new TypeError('length_m must be a finite number');
    }
    if (typeof slope !== 'number' || !Number.isFinite(slope)) {
        throw new TypeError('slope must be a finite number');
    }
    if (length_m <= 0) {
        throw new RangeError('length_m must be a positive number (metres)');
    }
    if (slope <= 0 || slope > 1) {
        throw new RangeError('slope must be in (0, 1] as a dimensionless ratio H/L');
    }
    const surfaceFactor = KIRPICH_SURFACE_FACTORS[surface];
    if (surfaceFactor === undefined) {
        throw new RangeError(`surface must be one of: ${Object.keys(KIRPICH_SURFACE_FACTORS).join(', ')}`);
    }

    const tc_min = KIRPICH_SI * Math.pow(length_m, 0.77) * Math.pow(slope, -0.385) * surfaceFactor;
    return {
        tc_min,
        tc_h: tc_min / MIN_PER_HOUR,
        slope,
        surfaceFactor,
    };
}

/**
 * Convenience overload that derives the slope from an elevation drop H over the
 * flow length L (S = H/L), then applies the Kirpich method.
 *
 * Variante que deriva a declividade da queda de cota H sobre o comprimento L.
 *
 * @param length_m - Comprimento do talvegue (metros), > 0.
 * @param drop_m   - Queda de cota H ao longo do talvegue (metros), > 0.
 * @param surface  - Cobertura (ver computeKirpichTc).
 */
export function computeKirpichTcFromDrop(
    length_m: number,
    drop_m: number,
    surface: KirpichSurface = 'natural',
): KirpichResult {
    if (typeof drop_m !== 'number' || !Number.isFinite(drop_m)) {
        throw new TypeError('drop_m must be a finite number');
    }
    if (drop_m <= 0) {
        throw new RangeError('drop_m must be a positive number (metres)');
    }
    if (typeof length_m !== 'number' || !Number.isFinite(length_m) || length_m <= 0) {
        throw new RangeError('length_m must be a positive number (metres)');
    }
    return computeKirpichTc(length_m, drop_m / length_m, surface);
}
