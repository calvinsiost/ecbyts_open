// @ts-check
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

// @ts-check

/* ================================================================
   SAO UNITS — Additional Units for SAO Taxonomy
   Unidades SAO — Unidades Adicionais para Taxonomia SAO

   Unidades de medida especificas para o protocolo SAO que
   nao existem no catalogo base (units/catalog.js).
   Inclui: turbidez, radiacao, microbiologia, geotecnia, etc.
   ================================================================ */

import { CONFIG } from '../../config.js';

/**
 * Additional units required by SAO parameters.
 * Follows the same schema as CONFIG.UNITS.
 * @type {Array<{id: string, symbol: string, name: string, type: string, dimension: string, toBase: number, isBase: boolean, offset?: number}>}
 */
export const SAO_UNITS = [
    // --- Turbidity ---
    {
        id: 'NTU',
        symbol: 'NTU',
        name: 'Unidades Nefelométricas de Turbidez',
        type: 'SI',
        dimension: 'turbidity',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'FTU',
        symbol: 'FTU',
        name: 'Unidades Formazínicas de Turbidez',
        type: 'SI',
        dimension: 'turbidity',
        toBase: 1,
        isBase: false,
    },

    // --- Color ---
    { id: 'uH', symbol: 'uH', name: 'Unidades Hazen (Pt-Co)', type: 'SI', dimension: 'color', toBase: 1, isBase: true },

    // --- Radioactivity ---
    { id: 'Bq', symbol: 'Bq', name: 'Becquerel', type: 'SI', dimension: 'radioactivity', toBase: 1, isBase: true },
    {
        id: 'Bq_L',
        symbol: 'Bq/L',
        name: 'Becquerel por litro',
        type: 'SI',
        dimension: 'radioactivity_conc',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'Bq_kg',
        symbol: 'Bq/kg',
        name: 'Becquerel por quilograma',
        type: 'SI',
        dimension: 'radioactivity_mass',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'Bq_m3',
        symbol: 'Bq/m³',
        name: 'Becquerel por metro cúbico',
        type: 'SI',
        dimension: 'radioactivity_air',
        toBase: 1,
        isBase: true,
    },

    // --- Radiation dose ---
    { id: 'mSv', symbol: 'mSv', name: 'Milisievert', type: 'SI', dimension: 'dose', toBase: 1, isBase: true },
    { id: 'uSv', symbol: 'µSv', name: 'Microsievert', type: 'SI', dimension: 'dose', toBase: 0.001, isBase: false },
    {
        id: 'Sv_h',
        symbol: 'Sv/h',
        name: 'Sievert por hora',
        type: 'SI',
        dimension: 'dose_rate',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'uSv_h',
        symbol: 'µSv/h',
        name: 'Microsievert por hora',
        type: 'SI',
        dimension: 'dose_rate',
        toBase: 1e-6,
        isBase: false,
    },

    // --- Microbiology ---
    {
        id: 'NMP_100mL',
        symbol: 'NMP/100mL',
        name: 'Número Mais Provável por 100mL',
        type: 'SI',
        dimension: 'microbial_count',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'UFC_100mL',
        symbol: 'UFC/100mL',
        name: 'Unidades Formadoras de Colônia por 100mL',
        type: 'SI',
        dimension: 'microbial_count',
        toBase: 1,
        isBase: false,
    },
    {
        id: 'cells_mL',
        symbol: 'cél/mL',
        name: 'Células por mililitro',
        type: 'SI',
        dimension: 'cell_count',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'cells_L',
        symbol: 'cél/L',
        name: 'Células por litro',
        type: 'SI',
        dimension: 'cell_count',
        toBase: 0.001,
        isBase: false,
    },

    // --- Pressure ---
    { id: 'hPa', symbol: 'hPa', name: 'Hectopascal', type: 'SI', dimension: 'pressure', toBase: 1, isBase: true },
    { id: 'kPa', symbol: 'kPa', name: 'Quilopascal', type: 'SI', dimension: 'pressure', toBase: 10, isBase: false },
    { id: 'MPa', symbol: 'MPa', name: 'Megapascal', type: 'SI', dimension: 'pressure', toBase: 10000, isBase: false },
    { id: 'atm', symbol: 'atm', name: 'Atmosfera', type: 'SI', dimension: 'pressure', toBase: 1013.25, isBase: false },

    // --- Velocity ---
    {
        id: 'm_s',
        symbol: 'm/s',
        name: 'Metros por segundo',
        type: 'SI',
        dimension: 'velocity',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'km_h',
        symbol: 'km/h',
        name: 'Quilômetros por hora',
        type: 'SI',
        dimension: 'velocity',
        toBase: 0.27778,
        isBase: false,
    },

    // --- Precipitation rate ---
    {
        id: 'mm_day',
        symbol: 'mm/dia',
        name: 'Milímetros por dia',
        type: 'SI',
        dimension: 'precipitation_rate',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'mm_h',
        symbol: 'mm/h',
        name: 'Milímetros por hora',
        type: 'SI',
        dimension: 'precipitation_rate',
        toBase: 24,
        isBase: false,
    },
    {
        id: 'mm_year',
        symbol: 'mm/ano',
        name: 'Milímetros por ano',
        type: 'SI',
        dimension: 'precipitation_total',
        toBase: 1,
        isBase: true,
    },

    // --- Irradiance ---
    {
        id: 'W_m2',
        symbol: 'W/m²',
        name: 'Watts por metro quadrado',
        type: 'SI',
        dimension: 'irradiance',
        toBase: 1,
        isBase: true,
    },

    // --- Concentration (air) ---
    {
        id: 'ppb',
        symbol: 'ppb',
        name: 'Partes por bilhão',
        type: 'SI',
        dimension: 'ratio_ppb',
        toBase: 1,
        isBase: true,
    },

    // --- Density ---
    {
        id: 'kg_m3',
        symbol: 'kg/m³',
        name: 'Quilogramas por metro cúbico',
        type: 'SI',
        dimension: 'density',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'g_cm3',
        symbol: 'g/cm³',
        name: 'Gramas por centímetro cúbico',
        type: 'SI',
        dimension: 'density',
        toBase: 1000,
        isBase: false,
    },
    {
        id: 't_m3',
        symbol: 't/m³',
        name: 'Toneladas por metro cúbico',
        type: 'SI',
        dimension: 'density',
        toBase: 1000,
        isBase: false,
    },

    // --- Geotechnical ---
    {
        id: 'mm_day_rate',
        symbol: 'mm/dia',
        name: 'Milímetros por dia (deslocamento)',
        type: 'SI',
        dimension: 'displacement_rate',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'mm_year_rate',
        symbol: 'mm/ano',
        name: 'Milímetros por ano (deformação)',
        type: 'SI',
        dimension: 'displacement_rate',
        toBase: 0.00274,
        isBase: false,
    },
    {
        id: 'blows_30cm',
        symbol: 'golpes/30cm',
        name: 'Golpes por 30cm (SPT)',
        type: 'SI',
        dimension: 'penetration_resistance',
        toBase: 1,
        isBase: true,
    },

    // --- Angle ---
    { id: 'degrees', symbol: '°', name: 'Graus', type: 'SI', dimension: 'angle', toBase: 1, isBase: true },
    { id: 'radians', symbol: 'rad', name: 'Radianos', type: 'SI', dimension: 'angle', toBase: 57.2958, isBase: false },

    // --- Hydraulic ---
    {
        id: 'cm_s',
        symbol: 'cm/s',
        name: 'Centímetros por segundo',
        type: 'SI',
        dimension: 'hydraulic_conductivity',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'm_day',
        symbol: 'm/dia',
        name: 'Metros por dia',
        type: 'SI',
        dimension: 'hydraulic_conductivity',
        toBase: 0.001157,
        isBase: false,
    },
    {
        id: 'm2_s',
        symbol: 'm²/s',
        name: 'Metros quadrados por segundo',
        type: 'SI',
        dimension: 'transmissivity',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'm2_day',
        symbol: 'm²/dia',
        name: 'Metros quadrados por dia',
        type: 'SI',
        dimension: 'transmissivity',
        toBase: 1.1574e-5,
        isBase: false,
    },

    // --- Erosion ---
    {
        id: 't_ha_yr',
        symbol: 't/ha·ano',
        name: 'Toneladas por hectare por ano',
        type: 'SI',
        dimension: 'erosion_rate',
        toBase: 1,
        isBase: true,
    },

    // --- Biological indices ---
    {
        id: 'ind_ha',
        symbol: 'ind/ha',
        name: 'Indivíduos por hectare',
        type: 'SI',
        dimension: 'biological_density',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'ind_m2',
        symbol: 'ind/m²',
        name: 'Indivíduos por metro quadrado',
        type: 'SI',
        dimension: 'biological_density',
        toBase: 10000,
        isBase: false,
    },
    {
        id: 'm2_ha',
        symbol: 'm²/ha',
        name: 'Metros quadrados por hectare',
        type: 'SI',
        dimension: 'basal_area',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'tC_ha',
        symbol: 'tC/ha',
        name: 'Toneladas de carbono por hectare',
        type: 'SI',
        dimension: 'carbon_stock',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'tC_ha_yr',
        symbol: 'tC/ha·ano',
        name: 'Toneladas de carbono por hectare por ano',
        type: 'SI',
        dimension: 'carbon_flux',
        toBase: 1,
        isBase: true,
    },

    // --- Ecotoxicology ---
    {
        id: 'mg_L_lethal',
        symbol: 'mg/L',
        name: 'Miligramas por litro (CL50)',
        type: 'SI',
        dimension: 'lethal_concentration',
        toBase: 1,
        isBase: true,
    },

    // --- Occupational ---
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
        id: 'fibras_cm3',
        symbol: 'f/cm³',
        name: 'Fibras por centímetro cúbico',
        type: 'SI',
        dimension: 'fiber_count',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'ug_g_crea',
        symbol: 'µg/g creat.',
        name: 'Microgramas por grama de creatinina',
        type: 'SI',
        dimension: 'biomarker_conc',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'ug_dL',
        symbol: 'µg/dL',
        name: 'Microgramas por decilitro',
        type: 'SI',
        dimension: 'blood_conc',
        toBase: 1,
        isBase: true,
    },

    // --- Spectral indices ---
    {
        id: 'ndvi',
        symbol: 'NDVI',
        name: 'Índice de Vegetação (−1 a 1)',
        type: 'SI',
        dimension: 'spectral_index',
        toBase: 1,
        isBase: true,
    },

    // --- Climate ---
    {
        id: 'degC_decade',
        symbol: '°C/déc',
        name: 'Graus Celsius por década',
        type: 'SI',
        dimension: 'temperature_trend',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'pct_decade',
        symbol: '%/déc',
        name: 'Percentual por década',
        type: 'SI',
        dimension: 'trend_pct',
        toBase: 1,
        isBase: true,
    },

    // --- Acceleration ---
    {
        id: 'mm_s2',
        symbol: 'mm/s²',
        name: 'Milímetros por segundo ao quadrado',
        type: 'SI',
        dimension: 'acceleration',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'g_accel',
        symbol: 'g',
        name: 'Aceleração da gravidade',
        type: 'SI',
        dimension: 'acceleration',
        toBase: 9806.65,
        isBase: false,
    },

    // --- Porosity / Soil water ---
    {
        id: 'cm3_cm3',
        symbol: 'cm³/cm³',
        name: 'Centímetros cúbicos por centímetro cúbico',
        type: 'SI',
        dimension: 'volumetric_content',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'meq_100g',
        symbol: 'meq/100g',
        name: 'Miliequivalentes por 100 gramas',
        type: 'SI',
        dimension: 'exchange_capacity',
        toBase: 1,
        isBase: true,
    },
    {
        id: 'cmolc_dm3',
        symbol: 'cmolc/dm³',
        name: 'Centimol de carga por decímetro cúbico',
        type: 'SI',
        dimension: 'exchange_capacity',
        toBase: 1,
        isBase: false,
    },

    // --- Soil respiration ---
    {
        id: 'mg_CO2_kg_h',
        symbol: 'mg CO₂/kg·h',
        name: 'Miligramas de CO₂ por kg por hora',
        type: 'SI',
        dimension: 'soil_respiration',
        toBase: 1,
        isBase: true,
    },

    // --- Particles (microplastics) ---
    {
        id: 'particles_L',
        symbol: 'part/L',
        name: 'Partículas por litro',
        type: 'SI',
        dimension: 'particle_count',
        toBase: 1,
        isBase: true,
    },

    // --- Secchi depth (uses existing m) ---
    // (uses 'm' from existing catalog)

    // --- ng/L for PFAS/trace ---
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
        dimension: 'mass_concentration',
        toBase: 0.001,
        isBase: false,
    },
    {
        id: 'pg_g',
        symbol: 'pg/g',
        name: 'Picogramas por grama',
        type: 'SI',
        dimension: 'mass_concentration',
        toBase: 0.000001,
        isBase: false,
    },

    // --- Occupational rates ---
    {
        id: 'dose_pct',
        symbol: '%',
        name: 'Dose percentual de ruído',
        type: 'SI',
        dimension: 'noise_dose',
        toBase: 1,
        isBase: true,
    },
];

/**
 * Merge SAO units into CONFIG.UNITS, avoiding duplicates.
 * Mescla as unidades SAO no catalogo principal sem duplicar.
 */
export function mergeSAOUnits() {
    const units = /** @type {any[]} */ (CONFIG.UNITS);
    SAO_UNITS.forEach((unit) => {
        if (!units.find((/** @type {any} */ u: any) => u.id === unit.id)) {
            units.push(unit);
        }
    });
}
