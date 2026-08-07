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
   COLOR RAMPS — Paletas de cor para superfícies interpoladas
   ================================================================

   Define gradientes de cor por tipo de dado ambiental.
   Cada ramp é um array de stops { t, r, g, b } com t em [0,1].

   Uso: sampleRamp('terrain', 0.5) → { r, g, b }

   ================================================================ */

interface RampStop {
    t: number;
    r: number;
    g: number;
    b: number;
}

// ----------------------------------------------------------------
// DEFINIÇÕES DE PALETAS
// ----------------------------------------------------------------

/**
 * Paletas predefinidas para diferentes tipos de superfície.
 * Cada stop tem { t: posição [0..1], r, g, b: componentes [0..1] }.
 */
export const COLOR_RAMPS: Record<string, RampStop[]> = {
    /** Terreno — verde escuro → verde → amarelo → marrom → branco (neve) */
    terrain: [
        { t: 0.0, r: 0.13, g: 0.37, b: 0.13 }, // verde escuro (vales)
        { t: 0.25, r: 0.3, g: 0.6, b: 0.2 }, // verde (planícies)
        { t: 0.5, r: 0.76, g: 0.7, b: 0.3 }, // amarelo (colinas)
        { t: 0.75, r: 0.55, g: 0.35, b: 0.2 }, // marrom (montanhas)
        { t: 1.0, r: 0.95, g: 0.95, b: 0.95 }, // branco (picos/neve)
    ],

    /** Nível d'água — azul escuro → azul → ciano */
    water_table: [
        { t: 0.0, r: 0.05, g: 0.1, b: 0.5 }, // azul escuro (profundo)
        { t: 0.35, r: 0.1, g: 0.3, b: 0.7 }, // azul médio
        { t: 0.65, r: 0.2, g: 0.55, b: 0.85 }, // azul claro
        { t: 1.0, r: 0.4, g: 0.8, b: 0.95 }, // ciano (raso)
    ],

    /** Contaminação — verde → amarelo → laranja → vermelho */
    contamination: [
        { t: 0.0, r: 0.2, g: 0.7, b: 0.2 }, // verde (limpo)
        { t: 0.33, r: 0.85, g: 0.85, b: 0.15 }, // amarelo (alerta)
        { t: 0.66, r: 0.9, g: 0.5, b: 0.1 }, // laranja (atenção)
        { t: 1.0, r: 0.85, g: 0.1, b: 0.1 }, // vermelho (crítico)
    ],

    /** Geologia — cores vibrantes: ciano → verde → amarelo → laranja → vermelho */
    geology: [
        { t: 0.0, r: 0.1, g: 0.6, b: 0.9 }, // ciano (superficial/clay)
        { t: 0.25, r: 0.2, g: 0.75, b: 0.4 }, // verde (silt)
        { t: 0.5, r: 0.95, g: 0.85, b: 0.15 }, // amarelo (sand)
        { t: 0.75, r: 0.9, g: 0.45, b: 0.1 }, // laranja (gravel)
        { t: 1.0, r: 0.75, g: 0.15, b: 0.15 }, // vermelho (rock/profundo)
    ],

    /** Temperatura — azul → branco → vermelho (divergente) */
    temperature: [
        { t: 0.0, r: 0.1, g: 0.2, b: 0.8 }, // azul (frio)
        { t: 0.5, r: 0.95, g: 0.95, b: 0.95 }, // branco (neutro)
        { t: 1.0, r: 0.85, g: 0.1, b: 0.1 }, // vermelho (quente)
    ],

    /** Genérico — espectro completo: violeta → azul → verde → amarelo → vermelho */
    generic: [
        { t: 0.0, r: 0.4, g: 0.1, b: 0.7 }, // violeta
        { t: 0.25, r: 0.15, g: 0.3, b: 0.85 }, // azul
        { t: 0.5, r: 0.2, g: 0.75, b: 0.3 }, // verde
        { t: 0.75, r: 0.9, g: 0.85, b: 0.15 }, // amarelo
        { t: 1.0, r: 0.85, g: 0.1, b: 0.1 }, // vermelho
    ],

    /** Potenciométrico — azul-violeta/índigo → azul → ciano (distinto de water_table) */
    potentiometric: [
        { t: 0.0, r: 0.3, g: 0.1, b: 0.7 }, // azul-violeta profundo (cota baixa)
        { t: 0.33, r: 0.4, g: 0.2, b: 0.8 }, // azul-violeta médio
        { t: 0.66, r: 0.5, g: 0.3, b: 0.9 }, // índigo
        { t: 1.0, r: 0.6, g: 0.4, b: 1.0 }, // azul-violeta claro (cota alta)
    ],
};

// ----------------------------------------------------------------
// CORES CANÔNICAS POR TIPO DE SOLO (ABGE / Geológico)
// ----------------------------------------------------------------

/**
 * Mapa canônico de soilType → cor hex (padrão ABGE).
 * Fonte única de verdade para superfícies 3D, cortes e UI.
 * Consolida SOIL_COLORS (WellProfileModule) e ABGE_COLORS (wellProfile3D).
 */
export const GEOLOGY_SOIL_COLORS = {
    organic_soil: '#3D2B1F',
    topsoil: '#6B4E37',
    peat: '#3D2B1F',
    fill: '#8B7355',
    clay: '#B87333',
    silty_clay: '#CD853F',
    sandy_clay: '#D4A87A',
    silt: '#D2B48C',
    sandy_silt: '#DEB887',
    clayey_sand: '#E6D29E',
    silty_sand: '#E0D4B4',
    fine_sand: '#F4A460',
    sand: '#F5E6B8',
    medium_sand: '#F5DEB3',
    coarse_sand: '#FFE4B5',
    gravel: '#B0B0B0',
    boulder: '#D3D3D3',
    rock: '#696969',
    sandstone: '#E8C872',
    shale: '#7A7A6E',
    limestone: '#D0CFC4',
};

/**
 * Converte cor hexadecimal para componentes RGB normalizados [0..1].
 * @param hex - cor no formato '#RRGGBB' ou 'RRGGBB'
 * @returns
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const n = parseInt(hex.replace('#', ''), 16);
    return {
        r: ((n >> 16) & 0xff) / 255,
        g: ((n >> 8) & 0xff) / 255,
        b: (n & 0xff) / 255,
    };
}

// ----------------------------------------------------------------
// AMOSTRAGEM
// ----------------------------------------------------------------

/**
 * Amostra uma cor da paleta na posição t normalizada [0..1].
 * Interpola linearmente entre os stops mais próximos.
 *
 * @param rampName - nome da paleta (ex: 'terrain', 'contamination')
 * @param t - posição normalizada [0..1]
 * @returns componentes [0..1]
 */
export function sampleRamp(rampName: string, t: number): { r: number; g: number; b: number } {
    const stops: RampStop[] = COLOR_RAMPS[rampName] ||
        COLOR_RAMPS.generic || [{ t: 0, r: 0, g: 0, b: 0 }];
    const clamped = Math.max(0, Math.min(1, t));

    // Encontra stops adjacentes
    let lo = stops[0] as RampStop;
    let hi = stops[stops.length - 1] as RampStop;
    for (let i = 0; i < stops.length - 1; i++) {
        const si = stops[i] as RampStop;
        const sn = stops[i + 1] as RampStop;
        if (clamped >= si.t && clamped <= sn.t) {
            lo = si;
            hi = sn;
            break;
        }
    }

    // Interpola linear
    const range = hi.t - lo.t;
    const alpha = range < 1e-10 ? 0 : (clamped - lo.t) / range;

    return {
        r: lo.r + alpha * (hi.r - lo.r),
        g: lo.g + alpha * (hi.g - lo.g),
        b: lo.b + alpha * (hi.b - lo.b),
    };
}

/**
 * Amostra uma cor com canal alpha da paleta na posição t normalizada [0..1].
 * O alpha reflete a magnitude (útil para incerteza ou concentração).
 *
 * @param rampName
 * @param t - posição normalizada [0..1]
 * @param minAlpha - alpha mínimo em t=0
 * @param maxAlpha - alpha máximo em t=1
 * @returns componentes [0..1]
 */
export function sampleRampWithAlpha(
    rampName: string,
    t: number,
    minAlpha = 0.1,
    maxAlpha = 1.0
): { r: number; g: number; b: number; a: number } {
    const rgb = sampleRamp(rampName, t);
    const clamped = Math.max(0, Math.min(1, t));
    return { ...rgb, a: minAlpha + clamped * (maxAlpha - minAlpha) };
}

/**
 * Retorna nomes das paletas disponíveis.
 * @returns
 */
export function getRampNames(): string[] {
    return Object.keys(COLOR_RAMPS);
}

/**
 * Default ramp por tipo de layer.
 */
export const DEFAULT_RAMPS = {
    terrain: 'terrain',
    water_table: 'water_table',
    geology: 'geology',
    contamination: 'contamination',
    custom: 'generic',
};
