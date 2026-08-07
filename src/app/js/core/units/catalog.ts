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
   CATALOGO DE UNIDADES (UNIT CATALOG)
   ================================================================

   Catalogo completo de unidades de medida para ESG & H&S.
   Organizado por dimensao fisica para facilitar conversoes.

   DIMENSOES:
   - mass: Massa (kg, g, t)
   - volume: Volume (L, m3)
   - concentration: Concentracao em agua (mg/L, ug/L)
   - air_concentration: Concentracao em ar (mg/m3)
   - emission: Emissoes GEE (tCO2e)
   - area: Area (m2, ha)
   - energy: Energia (kWh, GJ)
   - rate_hs: Taxas H&S (por milhao hh)
   - noise: Ruido (dBA)
   - score: Pontuacao/Indice

   ================================================================ */

// ----------------------------------------------------------------
// CATALOGO COMPLETO DE UNIDADES
// ----------------------------------------------------------------

export interface Unit {
    id: string;
    symbol: string;
    name: string;
    dimension: string;
    toBase: number;
    isBase: boolean;
    offset?: number;
}

/**
 * Todas as unidades disponiveis no sistema.
 * Estrutura:
 * - id: Identificador unico
 * - symbol: Simbolo de exibicao
 * - name: Nome completo
 * - dimension: Dimensao fisica (para conversao)
 * - toBase: Fator de conversao para unidade base
 * - isBase: Se e a unidade base da dimensao
 * - offset: Deslocamento (para temperaturas)
 */
export const UNITS = {
    // ================================================================
    // MASSA
    // ================================================================
    t: {
        id: 't',
        symbol: 't',
        name: 'Toneladas',
        dimension: 'mass',
        toBase: 1000,
        isBase: false,
    },
    kg: {
        id: 'kg',
        symbol: 'kg',
        name: 'Quilogramas',
        dimension: 'mass',
        toBase: 1,
        isBase: true,
    },
    g: {
        id: 'g',
        symbol: 'g',
        name: 'Gramas',
        dimension: 'mass',
        toBase: 0.001,
        isBase: false,
    },
    mg: {
        id: 'mg',
        symbol: 'mg',
        name: 'Miligramas',
        dimension: 'mass',
        toBase: 0.000001,
        isBase: false,
    },

    // ================================================================
    // VOLUME
    // ================================================================
    m3: {
        id: 'm3',
        symbol: 'm\u00b3',
        name: 'Metros cubicos',
        dimension: 'volume',
        toBase: 1000,
        isBase: false,
    },
    L: {
        id: 'L',
        symbol: 'L',
        name: 'Litros',
        dimension: 'volume',
        toBase: 1,
        isBase: true,
    },
    kL: {
        id: 'kL',
        symbol: 'kL',
        name: 'Quilolitros',
        dimension: 'volume',
        toBase: 1000,
        isBase: false,
    },
    mL: {
        id: 'mL',
        symbol: 'mL',
        name: 'Mililitros',
        dimension: 'volume',
        toBase: 0.001,
        isBase: false,
    },

    // ================================================================
    // CONCENTRACAO EM AGUA
    // ================================================================
    mg_L: {
        id: 'mg_L',
        symbol: 'mg/L',
        name: 'Miligramas por litro',
        dimension: 'concentration',
        toBase: 1,
        isBase: true,
    },
    ug_L: {
        id: 'ug_L',
        symbol: '\u00b5g/L',
        name: 'Microgramas por litro',
        dimension: 'concentration',
        toBase: 0.001,
        isBase: false,
    },
    g_L: {
        id: 'g_L',
        symbol: 'g/L',
        name: 'Gramas por litro',
        dimension: 'concentration',
        toBase: 1000,
        isBase: false,
    },
    mg_kg: {
        id: 'mg_kg',
        symbol: 'mg/kg',
        name: 'Miligramas por quilograma',
        dimension: 'concentration_solid',
        toBase: 1,
        isBase: true,
    },

    // ================================================================
    // CONCENTRACAO EM AR
    // ================================================================
    mg_m3: {
        id: 'mg_m3',
        symbol: 'mg/m\u00b3',
        name: 'Miligramas por metro cubico',
        dimension: 'air_concentration',
        toBase: 1,
        isBase: true,
    },
    ug_m3: {
        id: 'ug_m3',
        symbol: '\u00b5g/m\u00b3',
        name: 'Microgramas por metro cubico',
        dimension: 'air_concentration',
        toBase: 0.001,
        isBase: false,
    },
    mg_Nm3: {
        id: 'mg_Nm3',
        symbol: 'mg/Nm\u00b3',
        name: 'Miligramas por Nm\u00b3 (CNTP)',
        dimension: 'air_concentration_norm',
        toBase: 1,
        isBase: true,
    },
    ppm: {
        id: 'ppm',
        symbol: 'ppm',
        name: 'Partes por milhao',
        dimension: 'dimensionless',
        toBase: 1,
        isBase: true,
    },
    ppb: {
        id: 'ppb',
        symbol: 'ppb',
        name: 'Partes por bilhao',
        dimension: 'dimensionless',
        toBase: 0.001,
        isBase: false,
    },

    // ================================================================
    // EMISSOES GEE
    // ================================================================
    tCO2e: {
        id: 'tCO2e',
        symbol: 'tCO2e',
        name: 'Toneladas de CO2 equivalente',
        dimension: 'emission',
        toBase: 1,
        isBase: true,
    },
    kgCO2e: {
        id: 'kgCO2e',
        symbol: 'kgCO2e',
        name: 'Quilogramas de CO2 equivalente',
        dimension: 'emission',
        toBase: 0.001,
        isBase: false,
    },
    tCO2: {
        id: 'tCO2',
        symbol: 'tCO2',
        name: 'Toneladas de CO2',
        dimension: 'emission',
        toBase: 1,
        isBase: false,
    },

    // ================================================================
    // INTENSIDADE
    // ================================================================
    tCO2e_unit: {
        id: 'tCO2e_unit',
        symbol: 'tCO2e/un',
        name: 'tCO2e por unidade',
        dimension: 'intensity_emission',
        toBase: 1,
        isBase: true,
    },
    tCO2e_revenue: {
        id: 'tCO2e_revenue',
        symbol: 'tCO2e/M$',
        name: 'tCO2e por milhao de receita',
        dimension: 'intensity_emission',
        toBase: 1,
        isBase: false,
    },
    m3_unit: {
        id: 'm3_unit',
        symbol: 'm\u00b3/un',
        name: 'm\u00b3 por unidade produzida',
        dimension: 'intensity_water',
        toBase: 1,
        isBase: true,
    },
    kWh_unit: {
        id: 'kWh_unit',
        symbol: 'kWh/un',
        name: 'kWh por unidade',
        dimension: 'intensity_energy',
        toBase: 1,
        isBase: true,
    },

    // ================================================================
    // AREA
    // ================================================================
    ha: {
        id: 'ha',
        symbol: 'ha',
        name: 'Hectares',
        dimension: 'area',
        toBase: 10000,
        isBase: false,
    },
    m2: {
        id: 'm2',
        symbol: 'm\u00b2',
        name: 'Metros quadrados',
        dimension: 'area',
        toBase: 1,
        isBase: true,
    },
    km2: {
        id: 'km2',
        symbol: 'km\u00b2',
        name: 'Quilometros quadrados',
        dimension: 'area',
        toBase: 1000000,
        isBase: false,
    },
    // TRUST-010 W10 \u2014 imperial area units (US/UK markets). Convers\u00f5es exatas
    // (NIST SP 811 international foot = 0.3048 m exato).
    acre: {
        id: 'acre',
        symbol: 'ac',
        name: 'Acres',
        dimension: 'area',
        toBase: 4046.8564224, // 1 acre = 43560 sqft = 4046.8564224 m\u00b2 (international)
        isBase: false,
    },
    sqft: {
        id: 'sqft',
        symbol: 'ft\u00b2',
        name: 'Square feet',
        dimension: 'area',
        toBase: 0.09290304, // 0.3048\u00b2 exato
        isBase: false,
    },
    sqmi: {
        id: 'sqmi',
        symbol: 'mi\u00b2',
        name: 'Square miles',
        dimension: 'area',
        toBase: 2589988.110336, // 1 mile = 1609.344 m; 1609.344\u00b2 exato
        isBase: false,
    },

    // ================================================================
    // COMPRIMENTO (TRUST-010 W10)
    // ================================================================
    m: {
        id: 'm',
        symbol: 'm',
        name: 'Metros',
        dimension: 'length',
        toBase: 1,
        isBase: true,
    },
    km: {
        id: 'km',
        symbol: 'km',
        name: 'Quilometros',
        dimension: 'length',
        toBase: 1000,
        isBase: false,
    },
    cm: {
        id: 'cm',
        symbol: 'cm',
        name: 'Centimetros',
        dimension: 'length',
        toBase: 0.01,
        isBase: false,
    },
    ft: {
        id: 'ft',
        symbol: 'ft',
        name: 'Feet (p\u00e9s)',
        dimension: 'length',
        toBase: 0.3048, // exato \u2014 international foot (NIST SP 811)
        isBase: false,
    },
    inch: {
        id: 'inch',
        symbol: 'in',
        name: 'Inches (polegadas)',
        dimension: 'length',
        toBase: 0.0254, // exato \u2014 international inch
        isBase: false,
    },
    yard: {
        id: 'yard',
        symbol: 'yd',
        name: 'Yards',
        dimension: 'length',
        toBase: 0.9144, // exato \u2014 3 international feet
        isBase: false,
    },
    mile: {
        id: 'mile',
        symbol: 'mi',
        name: 'Miles',
        dimension: 'length',
        toBase: 1609.344, // exato \u2014 international statute mile
        isBase: false,
    },

    // ================================================================
    // TAXAS H&S
    // ================================================================
    per_1M_hh: {
        id: 'per_1M_hh',
        symbol: '/1M hh',
        name: 'Por milhao de horas-homem',
        dimension: 'rate_hs',
        toBase: 1,
        isBase: true,
    },
    per_200k_hh: {
        id: 'per_200k_hh',
        symbol: '/200k hh',
        name: 'Por 200 mil horas (OSHA)',
        dimension: 'rate_hs',
        toBase: 0.2,
        isBase: false,
    },
    days_per_1M: {
        id: 'days_per_1M',
        symbol: 'dias/1M hh',
        name: 'Dias perdidos por milhao hh',
        dimension: 'severity',
        toBase: 1,
        isBase: true,
    },

    // ================================================================
    // ENERGIA
    // ================================================================
    MWh: {
        id: 'MWh',
        symbol: 'MWh',
        name: 'Megawatt-hora',
        dimension: 'energy',
        toBase: 1000,
        isBase: false,
    },
    kWh: {
        id: 'kWh',
        symbol: 'kWh',
        name: 'Quilowatt-hora',
        dimension: 'energy',
        toBase: 1,
        isBase: true,
    },
    GJ: {
        id: 'GJ',
        symbol: 'GJ',
        name: 'Gigajoules',
        dimension: 'energy',
        toBase: 277.78,
        isBase: false,
    },
    tep: {
        id: 'tep',
        symbol: 'tep',
        name: 'Tonelada equivalente de petroleo',
        dimension: 'energy',
        toBase: 11630,
        isBase: false,
    },

    // ================================================================
    // TEMPERATURA
    // ================================================================
    celsius: {
        id: 'celsius',
        symbol: '\u00b0C',
        name: 'Graus Celsius',
        dimension: 'temperature',
        toBase: 1,
        offset: 0,
        isBase: true,
    },
    fahrenheit: {
        id: 'fahrenheit',
        symbol: '\u00b0F',
        name: 'Graus Fahrenheit',
        dimension: 'temperature',
        toBase: 5 / 9,
        offset: -32,
        isBase: false,
    },
    kelvin: {
        id: 'kelvin',
        symbol: 'K',
        name: 'Kelvin',
        dimension: 'temperature',
        toBase: 1,
        offset: -273.15,
        isBase: false,
    },

    // ================================================================
    // RUIDO
    // ================================================================
    dBA: {
        id: 'dBA',
        symbol: 'dB(A)',
        name: 'Decibeis ponderados A',
        dimension: 'noise',
        toBase: 1,
        isBase: true,
    },
    dB: {
        id: 'dB',
        symbol: 'dB',
        name: 'Decibeis',
        dimension: 'noise',
        toBase: 1,
        isBase: false,
    },

    // ================================================================
    // CONTAGEM E INDICE
    // ================================================================
    count: {
        id: 'count',
        symbol: 'un',
        name: 'Unidades',
        dimension: 'count',
        toBase: 1,
        isBase: true,
    },
    score: {
        id: 'score',
        symbol: 'pts',
        name: 'Pontuacao',
        dimension: 'score',
        toBase: 1,
        isBase: true,
    },
    score_100: {
        id: 'score_100',
        symbol: '/100',
        name: 'Escala 0-100',
        dimension: 'score',
        toBase: 1,
        isBase: false,
    },
    percent: {
        id: 'percent',
        symbol: '%',
        name: 'Porcentagem',
        dimension: 'percent',
        toBase: 1,
        isBase: true,
    },

    // ================================================================
    // VAZAO
    // ================================================================
    L_s: {
        id: 'L_s',
        symbol: 'L/s',
        name: 'Litros por segundo',
        dimension: 'flow',
        toBase: 1,
        isBase: true,
    },
    m3_h: {
        id: 'm3_h',
        symbol: 'm\u00b3/h',
        name: 'Metros cubicos por hora',
        dimension: 'flow',
        toBase: 0.27778,
        isBase: false,
    },
    m3_s: {
        id: 'm3_s',
        symbol: 'm\u00b3/s',
        name: 'Metros cubicos por segundo',
        dimension: 'flow',
        toBase: 1000,
        isBase: false,
    },
    L_min: {
        id: 'L_min',
        symbol: 'L/min',
        name: 'Litros por minuto',
        dimension: 'flow',
        toBase: 1 / 60,
        isBase: false,
    },

    // ================================================================
    // CONDUTIVIDADE E pH
    // ================================================================
    uS_cm: {
        id: 'uS_cm',
        symbol: '\u00b5S/cm',
        name: 'Microsiemens por centimetro',
        dimension: 'conductivity',
        toBase: 1,
        isBase: true,
    },
    mS_cm: {
        id: 'mS_cm',
        symbol: 'mS/cm',
        name: 'Milisiemens por centimetro',
        dimension: 'conductivity',
        toBase: 1000,
        isBase: false,
    },
    pH: {
        id: 'pH',
        symbol: 'pH',
        name: 'Unidade de pH',
        dimension: 'pH',
        toBase: 1,
        isBase: true,
    },

    // ================================================================
    // POTENCIAL
    // ================================================================
    mV: {
        id: 'mV',
        symbol: 'mV',
        name: 'Milivolts',
        dimension: 'potential',
        toBase: 1,
        isBase: true,
    },
    V: {
        id: 'V',
        symbol: 'V',
        name: 'Volts',
        dimension: 'potential',
        toBase: 1000,
        isBase: false,
    },

    // ================================================================
    // SEM UNIDADE
    // ================================================================
    none: {
        id: 'none',
        symbol: '-',
        name: 'Sem unidade',
        dimension: 'none',
        toBase: 1,
        isBase: true,
    },
} as const satisfies Record<string, Unit>;

export type UnitId = keyof typeof UNITS;

// ----------------------------------------------------------------
// FUNCOES DE ACESSO
// ----------------------------------------------------------------

/**
 * Obtem unidade por ID.
 * @param {string} unitId - ID da unidade
 * @returns {Object|null}
 */
export function getUnitById(unitId: string): Unit | null {
    return UNITS[unitId as UnitId] || null;
}

/**
 * Obtem todas as unidades.
 * @returns {Object[]}
 */
export function getAllUnits(): Unit[] {
    return Object.values(UNITS);
}

/**
 * Obtem unidades por dimensao.
 * @param {string} dimension - Dimensao fisica
 * @returns {Object[]}
 */
export function getUnitsByDimension(dimension: string): Unit[] {
    return Object.values(UNITS).filter((u) => u.dimension === dimension);
}

/**
 * Obtem unidade base de uma dimensao.
 * @param {string} dimension - Dimensao fisica
 * @returns {Object|null}
 */
export function getBaseUnit(dimension: string): Unit | null {
    return Object.values(UNITS).find((u) => u.dimension === dimension && u.isBase) || null;
}

/**
 * Obtem unidades compativeis com uma unidade.
 * @param {string} unitId - ID da unidade
 * @returns {Object[]}
 */
export function getCompatibleUnits(unitId: string): Unit[] {
    const unit = getUnitById(unitId);
    if (!unit) return [];
    return getUnitsByDimension(unit.dimension);
}

/**
 * Verifica se duas unidades sao compativeis.
 * @param {string} unitId1 - ID da primeira unidade
 * @param {string} unitId2 - ID da segunda unidade
 * @returns {boolean}
 */
export function areUnitsCompatible(unitId1: string, unitId2: string): boolean {
    const unit1 = getUnitById(unitId1);
    const unit2 = getUnitById(unitId2);
    if (!unit1 || !unit2) return false;
    return unit1.dimension === unit2.dimension;
}

/**
 * Lista todas as dimensoes disponiveis.
 * @returns {string[]}
 */
export function getAllDimensions(): string[] {
    const dimensions = new Set<string>();
    Object.values(UNITS).forEach((u) => dimensions.add(u.dimension));
    return Array.from(dimensions).sort();
}

/**
 * Formata valor com simbolo da unidade.
 * @param {number} value - Valor numerico
 * @param {string} unitId - ID da unidade
 * @param {number} precision - Casas decimais
 * @returns {string}
 */
export function formatWithUnit(value: unknown, unitId: string, precision = 2): string {
    const unit = getUnitById(unitId);
    if (!unit) return `${value}`;

    const formatted = typeof value === 'number' ? value.toFixed(precision) : value;
    return `${formatted} ${unit.symbol}`;
}
