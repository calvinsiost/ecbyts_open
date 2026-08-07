// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/core/sao/params/climatologia.ts
// SAO PARAMS - Climatology Matrix
// Parametros SAO - Matriz de Climatologia
//
// Variaveis climaticas, extremos, classificacao climatica e tendencias
// para avaliacao ambiental transversal.
/**
 * Regulatory reference: either a free-form string (e.g. "ABNT NBR 6484")
 * or a structured tuple { agency, standard } used in some SAO datasets.
 */
export type SaoRegulatoryRef = string | { readonly agency: string; readonly standard: string };

/**
 * SAO parameter shape shared across all matrix param files.
 * Local interface to keep this file a self-contained leaf
 * (TS-MIGRATION-001: no cross-leaf re-exports).
 */
export interface SaoParameter {
    readonly id: string;
    readonly name: string;
    readonly names: { readonly en: string; readonly es: string };
    readonly defaultUnitId: string;
    readonly type: string;
    readonly category: string;
    readonly allowedCustomFields: readonly string[];
    readonly sao: {
        readonly matrix: string;
        readonly tier: 'essential' | 'recommended' | 'specialized';
        readonly subcategory: string;
        readonly regulatoryRefs: readonly SaoRegulatoryRef[];
        readonly scenarios: readonly string[];
    };
}

/**
 * Climatology matrix parameters.
 */
export const CLIMATOLOGIA_PARAMETERS: readonly SaoParameter[] = [
    // ─── 🔴 ESSENTIAL ───────────────────────────────────────────
    {
        id: 'clim_temp_mean',
        name: 'Temperatura Média (mensal/anual)',
        names: { en: 'Mean Temperature (monthly/annual)', es: 'Temperatura Media (mensual/anual)' },
        defaultUnitId: 'celsius',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'essential',
            subcategory: 'basic_climate',
            regulatoryRefs: [],
            scenarios: ['mining_operations', 'deforestation', 'routine_monitoring'],
        },
    },
    {
        id: 'clim_temp_max',
        name: 'Temperatura Máxima',
        names: { en: 'Maximum Temperature', es: 'Temperatura Máxima' },
        defaultUnitId: 'celsius',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'essential',
            subcategory: 'basic_climate',
            regulatoryRefs: [],
            scenarios: ['mining_operations', 'deforestation', 'routine_monitoring'],
        },
    },
    {
        id: 'clim_temp_min',
        name: 'Temperatura Mínima',
        names: { en: 'Minimum Temperature', es: 'Temperatura Mínima' },
        defaultUnitId: 'celsius',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'essential',
            subcategory: 'basic_climate',
            regulatoryRefs: [],
            scenarios: ['mining_operations', 'deforestation', 'routine_monitoring'],
        },
    },
    {
        id: 'clim_precip_total',
        name: 'Precipitação Total (mensal/anual)',
        names: { en: 'Total Precipitation (monthly/annual)', es: 'Precipitación Total (mensual/anual)' },
        defaultUnitId: 'mm_year',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'essential',
            subcategory: 'basic_climate',
            regulatoryRefs: [],
            scenarios: ['tailings_dam', 'mining_operations', 'deforestation', 'routine_monitoring'],
        },
    },
    {
        id: 'clim_precip_intensity',
        name: 'Intensidade Máxima de Precipitação',
        names: { en: 'Maximum Precipitation Intensity', es: 'Intensidad Máxima de Precipitación' },
        defaultUnitId: 'mm_h',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'essential',
            subcategory: 'extremes',
            regulatoryRefs: [],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'clim_koppen',
        name: 'Classificação Climática (Köppen-Geiger)',
        names: { en: 'Climate Classification (Köppen-Geiger)', es: 'Clasificación Climática (Köppen-Geiger)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'essential',
            subcategory: 'basic_climate',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'clim_idf',
        name: 'IDF (Intensidade-Duração-Frequência)',
        names: { en: 'IDF (Intensity-Duration-Frequency)', es: 'IDF (Intensidad-Duración-Frecuencia)' },
        defaultUnitId: 'mm_h',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'essential',
            subcategory: 'extremes',
            regulatoryRefs: [],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    // ─── 🟡 RECOMMENDED ─────────────────────────────────────────
    {
        id: 'clim_etp',
        name: 'Evapotranspiração Potencial (ETP)',
        names: { en: 'Potential Evapotranspiration (ETP)', es: 'Evapotranspiración Potencial (ETP)' },
        defaultUnitId: 'mm_year',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'recommended',
            subcategory: 'water_balance',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations'],
        },
    },
    {
        id: 'clim_etr',
        name: 'Evapotranspiração Real (ETR)',
        names: { en: 'Actual Evapotranspiration (ETR)', es: 'Evapotranspiración Real (ETR)' },
        defaultUnitId: 'mm_year',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'recommended',
            subcategory: 'water_balance',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations'],
        },
    },
    {
        id: 'clim_water_deficit',
        name: 'Deficiência/Excedente Hídrico',
        names: { en: 'Water Deficit/Surplus', es: 'Déficit/Excedente Hídrico' },
        defaultUnitId: 'mm_year',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'recommended',
            subcategory: 'water_balance',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations'],
        },
    },
    {
        id: 'clim_spi',
        name: 'SPI (Índice Padronizado de Precipitação)',
        names: { en: 'SPI (Standardized Precipitation Index)', es: 'SPI (Índice Estandarizado de Precipitación)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'recommended',
            subcategory: 'extremes',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations'],
        },
    },
    {
        id: 'clim_spei',
        name: 'SPEI (SPI + Evapotranspiração)',
        names: { en: 'SPEI (SPI + Evapotranspiration)', es: 'SPEI (SPI + Evapotranspiración)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'recommended',
            subcategory: 'extremes',
            regulatoryRefs: [],
            scenarios: ['deforestation'],
        },
    },
    {
        id: 'clim_temp_trend',
        name: 'Tendência de Temperatura (°C/década)',
        names: { en: 'Temperature Trend (°C/decade)', es: 'Tendencia de Temperatura (°C/década)' },
        defaultUnitId: 'degC_decade',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'recommended',
            subcategory: 'climate_change',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations'],
        },
    },
    {
        id: 'clim_precip_trend',
        name: 'Tendência de Precipitação (%/década)',
        names: { en: 'Precipitation Trend (%/decade)', es: 'Tendencia de Precipitación (%/década)' },
        defaultUnitId: 'pct_decade',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'recommended',
            subcategory: 'climate_change',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations'],
        },
    },
    // ─── 🟢 SPECIALIZED ─────────────────────────────────────────
    {
        id: 'clim_pdsi',
        name: 'PDSI (Índice Palmer de Severidade de Seca)',
        names: { en: 'PDSI (Palmer Drought Severity Index)', es: 'PDSI (Índice Palmer de Severidad de Sequía)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'specialized',
            subcategory: 'extremes',
            regulatoryRefs: [],
            scenarios: ['deforestation'],
        },
    },
    {
        id: 'clim_sea_level',
        name: 'Variação do Nível do Mar (mm/ano)',
        names: { en: 'Sea Level Variation (mm/year)', es: 'Variación del Nivel del Mar (mm/año)' },
        defaultUnitId: 'mm_year_rate',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'specialized',
            subcategory: 'climate_change',
            regulatoryRefs: [],
            scenarios: ['oil_spill'],
        },
    },
    {
        id: 'clim_vulnerability',
        name: 'Vulnerabilidade Climática (Exposição × Sensibilidade)',
        names: {
            en: 'Climate Vulnerability (Exposure × Sensitivity)',
            es: 'Vulnerabilidad Climática (Exposición × Sensibilidad)',
        },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'climatologia',
            tier: 'specialized',
            subcategory: 'climate_change',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations'],
        },
    },
];
