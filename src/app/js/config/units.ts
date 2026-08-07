// This file is part of ecbyts/ECBT. AGPL-3.0-only.
// Extracted from app/js/config.js in ARCH-MONO-001 Phase 2 (monolith split).

/** Catálogo de unidades de medida (base SI). */
export const UNITS = [
    // Concentração (base: mg/L)
    {
        id: 'mg_L',
        symbol: 'mg/L',
        name: 'Miligramas por litro',
        type: 'SI',
        dimension: 'concentration',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'ug_L',
        symbol: 'µg/L',
        name: 'Microgramas por litro',
        type: 'SI',
        dimension: 'concentration',
        toBase: 0.001,
    },
    { id: 'g_L', symbol: 'g/L', name: 'Gramas por litro', type: 'SI', dimension: 'concentration', toBase: 1000 },
    {
        id: 'mg_kg',
        symbol: 'mg/kg',
        name: 'Miligramas por quilograma',
        type: 'SI',
        dimension: 'mass_concentration',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'ug_kg',
        symbol: 'µg/kg',
        name: 'Microgramas por quilograma',
        type: 'SI',
        dimension: 'mass_concentration',
        toBase: 0.001,
    },
    {
        id: 'ppm',
        symbol: 'ppm',
        name: 'Partes por milhão',
        type: 'SI',
        dimension: 'ratio_ppm',
        toBase: 1,
        isBase: true,
    },
    { id: 'ppb', symbol: 'ppb', name: 'Partes por bilhão', type: 'SI', dimension: 'ratio_ppm', toBase: 0.001 },
    // Comprimento (base: m)
    { id: 'm', symbol: 'm', name: 'Metros', type: 'SI', dimension: 'length', toBase: 1, isBase: true },
    { id: 'cm', symbol: 'cm', name: 'Centímetros', type: 'SI', dimension: 'length', toBase: 0.01 },
    { id: 'mm', symbol: 'mm', name: 'Milímetros', type: 'SI', dimension: 'length', toBase: 0.001 },
    { id: 'km', symbol: 'km', name: 'Quilômetros', type: 'SI', dimension: 'length', toBase: 1000 },
    // Temperatura (base: celsius, usa offset para kelvin)
    {
        id: 'celsius',
        symbol: '°C',
        name: 'Celsius',
        type: 'SI',
        dimension: 'temperature',
        toBase: 1,
        offset: 0,
        isBase: true,
    },
    { id: 'kelvin', symbol: 'K', name: 'Kelvin', type: 'SI', dimension: 'temperature', toBase: 1, offset: -273.15 },
    {
        id: 'fahrenheit',
        symbol: '°F',
        name: 'Fahrenheit',
        type: 'custom',
        dimension: 'temperature',
        toBase: 5 / 9,
        offset: -32,
        formula: '(value - 32) * 5/9',
    },
    // Percentual
    { id: 'percent', symbol: '%', name: 'Percentual', type: 'SI', dimension: 'ratio', toBase: 1, isBase: true },
    { id: 'decimal', symbol: 'dec', name: 'Decimal (0-1)', type: 'SI', dimension: 'ratio', toBase: 100 },
    // Adimensional (sem conversão)
    {
        id: 'pH',
        symbol: 'pH',
        name: 'Potencial Hidrogeniônico',
        type: 'SI',
        dimension: 'pH',
        toBase: 1,
        isBase: true,
    },
    // Condutividade (base: µS/cm)
    {
        id: 'uS_cm',
        symbol: 'µS/cm',
        name: 'Microsiemens por centímetro',
        type: 'SI',
        dimension: 'conductivity',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'mS_cm',
        symbol: 'mS/cm',
        name: 'Milisiemens por centímetro',
        type: 'SI',
        dimension: 'conductivity',
        toBase: 1000,
    },
    // Potencial (base: mV)
    { id: 'mV', symbol: 'mV', name: 'Milivolts', type: 'SI', dimension: 'potential', toBase: 1, isBase: true },
    { id: 'V', symbol: 'V', name: 'Volts', type: 'SI', dimension: 'potential', toBase: 1000 },
    // Vazão (base: L/s)
    {
        id: 'L_s',
        symbol: 'L/s',
        name: 'Litros por segundo',
        type: 'SI',
        dimension: 'flow',
        toBase: 1,
        isBase: true,
    },
    { id: 'm3_h', symbol: 'm³/h', name: 'Metros cúbicos por hora', type: 'SI', dimension: 'flow', toBase: 0.27778 },
    { id: 'm3_s', symbol: 'm³/s', name: 'Metros cúbicos por segundo', type: 'SI', dimension: 'flow', toBase: 1000 },
    { id: 'L_min', symbol: 'L/min', name: 'Litros por minuto', type: 'SI', dimension: 'flow', toBase: 1 / 60 },
    // Sem unidade
    { id: 'none', symbol: '-', name: 'Sem unidade', type: 'SI', dimension: 'none', toBase: 1, isBase: true },

    // ================================================================
    // UNIDADES ESTENDIDAS ESG & H&S
    // ================================================================

    // Massa
    { id: 't', symbol: 't', name: 'Toneladas', type: 'SI', dimension: 'mass', toBase: 1000 },
    { id: 'kg', symbol: 'kg', name: 'Quilogramas', type: 'SI', dimension: 'mass', toBase: 1, isBase: true },
    { id: 'g', symbol: 'g', name: 'Gramas', type: 'SI', dimension: 'mass', toBase: 0.001 },

    // Volume estendido
    { id: 'm3', symbol: 'm³', name: 'Metros cúbicos', type: 'SI', dimension: 'volume', toBase: 1000 },

    // Concentração atmosférica
    {
        id: 'mg_m3',
        symbol: 'mg/m³',
        name: 'Miligramas por metro cúbico',
        type: 'SI',
        dimension: 'air_concentration',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'ug_m3',
        symbol: 'µg/m³',
        name: 'Microgramas por metro cúbico',
        type: 'SI',
        dimension: 'air_concentration',
        toBase: 0.001,
    },
    {
        id: 'mg_Nm3',
        symbol: 'mg/Nm³',
        name: 'Miligramas por Nm³ (CNTP)',
        type: 'SI',
        dimension: 'air_concentration_norm',
        toBase: 1,
        isBase: true,
    },

    // Emissões GEE
    {
        id: 'tCO2e',
        symbol: 'tCO2e',
        name: 'Toneladas de CO2 equivalente',
        type: 'SI',
        dimension: 'emission',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'kgCO2e',
        symbol: 'kgCO2e',
        name: 'Quilogramas de CO2 equivalente',
        type: 'SI',
        dimension: 'emission',
        toBase: 0.001,
    },

    // Intensidade
    {
        id: 'tCO2e_unit',
        symbol: 'tCO2e/un',
        name: 'tCO2e por unidade',
        type: 'SI',
        dimension: 'intensity_emission',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'm3_unit',
        symbol: 'm³/un',
        name: 'm³ por unidade produzida',
        type: 'SI',
        dimension: 'intensity_water',
        toBase: 1,
        isBase: true,
    },

    // Área
    { id: 'ha', symbol: 'ha', name: 'Hectares', type: 'SI', dimension: 'area', toBase: 10000 },
    { id: 'm2', symbol: 'm²', name: 'Metros quadrados', type: 'SI', dimension: 'area', toBase: 1, isBase: true },

    // Taxas H&S
    {
        id: 'per_1M_hh',
        symbol: '/1M hh',
        name: 'Por milhão de horas-homem',
        type: 'SI',
        dimension: 'rate_hs',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'per_200k_hh',
        symbol: '/200k hh',
        name: 'Por 200 mil horas (OSHA)',
        type: 'SI',
        dimension: 'rate_hs',
        toBase: 0.2,
    },
    {
        id: 'days_per_1M',
        symbol: 'dias/1M hh',
        name: 'Dias perdidos por milhão hh',
        type: 'SI',
        dimension: 'severity',
        toBase: 1,
        isBase: true,
    },

    // Energia
    { id: 'MWh', symbol: 'MWh', name: 'Megawatt-hora', type: 'SI', dimension: 'energy', toBase: 1000 },
    { id: 'kWh', symbol: 'kWh', name: 'Quilowatt-hora', type: 'SI', dimension: 'energy', toBase: 1, isBase: true },
    { id: 'GJ', symbol: 'GJ', name: 'Gigajoules', type: 'SI', dimension: 'energy', toBase: 277.78 },

    // Ruído
    {
        id: 'dBA',
        symbol: 'dB(A)',
        name: 'Decibéis ponderados A',
        type: 'SI',
        dimension: 'noise',
        toBase: 1,
        isBase: true,
    },

    // Contagem
    { id: 'count', symbol: 'un', name: 'Unidades', type: 'SI', dimension: 'count', toBase: 1, isBase: true },

    // Score/Índice
    { id: 'score', symbol: 'pts', name: 'Pontuação', type: 'SI', dimension: 'score', toBase: 1, isBase: true },

    // Trace concentration (PFAS)
    {
        id: 'ng_L',
        symbol: 'ng/L',
        name: 'Nanogramas por litro',
        type: 'SI',
        dimension: 'concentration',
        toBase: 0.000001,
        isBase: false,
    },
    {
        id: 'ng_g',
        symbol: 'ng/g',
        name: 'Nanogramas por grama',
        type: 'SI',
        dimension: 'concentration',
        toBase: 0.001,
        isBase: false,
    },

    // Radioactivity
    {
        id: 'Bq_kg',
        symbol: 'Bq/kg',
        name: 'Becquerel por quilograma',
        type: 'SI',
        dimension: 'radioactivity',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'Bq_L',
        symbol: 'Bq/L',
        name: 'Becquerel por litro',
        type: 'SI',
        dimension: 'radioactivity',
        toBase: 1,
        isBase: false,
    },
];
