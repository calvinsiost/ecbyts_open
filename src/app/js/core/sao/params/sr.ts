// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/core/sao/params/sr.ts
// SAO PARAMS — Remote Sensing & Geospatial Matrix
// Parâmetros SAO — Matriz de Sensoriamento Remoto e Geoespacial
//
// Variáveis de sensoriamento remoto, drones, LiDAR, radar e
// índices espectrais para monitoramento ambiental transversal.

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
        readonly regulatoryRefs: readonly string[];
        readonly scenarios: readonly string[];
    };
}

/**
 * Remote Sensing matrix parameters.
 */
export const SR_PARAMETERS: readonly SaoParameter[] = [
    // ─── 🔴 ESSENTIAL ───────────────────────────────────────────
    {
        id: 'sr_ndvi',
        name: 'NDVI (Índice de Vegetação)',
        names: { en: 'NDVI (Vegetation Index)', es: 'NDVI (Índice de Vegetación)' },
        defaultUnitId: 'ndvi',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'essential',
            subcategory: 'spectral_indices',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations', 'tailings_dam', 'routine_monitoring'],
        },
    },
    {
        id: 'sr_ndwi',
        name: 'NDWI (Índice de Água)',
        names: { en: 'NDWI (Water Index)', es: 'NDWI (Índice de Agua)' },
        defaultUnitId: 'ndvi',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'essential',
            subcategory: 'spectral_indices',
            regulatoryRefs: [],
            scenarios: ['tailings_dam', 'oil_spill', 'deforestation'],
        },
    },
    {
        id: 'sr_nbr',
        name: 'NBR (Índice de Queimada)',
        names: { en: 'NBR (Burn Ratio Index)', es: 'NBR (Índice de Quema)' },
        defaultUnitId: 'ndvi',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'essential',
            subcategory: 'spectral_indices',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations'],
        },
    },
    {
        id: 'sr_mdt',
        name: 'MDT (Modelo Digital de Terreno)',
        names: { en: 'DTM (Digital Terrain Model)', es: 'MDT (Modelo Digital de Terreno)' },
        defaultUnitId: 'm',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'essential',
            subcategory: 'optical',
            regulatoryRefs: [],
            scenarios: ['tailings_dam', 'mining_operations', 'deforestation', 'routine_monitoring'],
        },
    },
    {
        id: 'sr_land_cover',
        name: 'Classificação Uso e Cobertura do Solo',
        names: { en: 'Land Use and Land Cover Classification', es: 'Clasificación de Uso y Cobertura del Suelo' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'essential',
            subcategory: 'optical',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations', 'tailings_dam', 'routine_monitoring'],
        },
    },
    {
        id: 'sr_slope',
        name: 'Declividade',
        names: { en: 'Slope', es: 'Pendiente' },
        defaultUnitId: 'degrees',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'essential',
            subcategory: 'optical',
            regulatoryRefs: [],
            scenarios: ['tailings_dam', 'mining_operations', 'deforestation'],
        },
    },

    // ─── 🟡 RECOMMENDED ─────────────────────────────────────────
    {
        id: 'sr_evi',
        name: 'EVI (Índice de Vegetação Aprimorado)',
        names: { en: 'EVI (Enhanced Vegetation Index)', es: 'EVI (Índice de Vegetación Mejorado)' },
        defaultUnitId: 'ndvi',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'recommended',
            subcategory: 'spectral_indices',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations'],
        },
    },
    {
        id: 'sr_savi',
        name: 'SAVI (Índice de Vegetação Ajustado ao Solo)',
        names: { en: 'SAVI (Soil Adjusted Vegetation Index)', es: 'SAVI (Índice de Vegetación Ajustado al Suelo)' },
        defaultUnitId: 'ndvi',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'recommended',
            subcategory: 'spectral_indices',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations'],
        },
    },
    {
        id: 'sr_lai',
        name: 'LAI (Índice de Área Foliar)',
        names: { en: 'LAI (Leaf Area Index)', es: 'LAI (Índice de Área Foliar)' },
        defaultUnitId: 'ndvi',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'recommended',
            subcategory: 'spectral_indices',
            regulatoryRefs: [],
            scenarios: ['deforestation'],
        },
    },
    {
        id: 'sr_dnbr',
        name: 'dNBR (Delta NBR — Severidade)',
        names: { en: 'dNBR (Delta NBR — Severity)', es: 'dNBR (Delta NBR — Severidad)' },
        defaultUnitId: 'ndvi',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'recommended',
            subcategory: 'spectral_indices',
            regulatoryRefs: [],
            scenarios: ['deforestation'],
        },
    },
    {
        id: 'sr_ndmi',
        name: 'NDMI (Índice de Umidade)',
        names: { en: 'NDMI (Moisture Index)', es: 'NDMI (Índice de Humedad)' },
        defaultUnitId: 'ndvi',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'recommended',
            subcategory: 'spectral_indices',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations'],
        },
    },
    {
        id: 'sr_insar',
        name: 'InSAR (Deslocamento Diferencial)',
        names: { en: 'InSAR (Differential Displacement)', es: 'InSAR (Desplazamiento Diferencial)' },
        defaultUnitId: 'mm',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'recommended',
            subcategory: 'radar',
            regulatoryRefs: [],
            scenarios: ['tailings_dam', 'mining_operations'],
        },
    },
    {
        id: 'sr_sar_oil',
        name: 'SAR (Detecção de Manchas de Óleo)',
        names: { en: 'SAR (Oil Slick Detection)', es: 'SAR (Detección de Manchas de Aceite)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: { matrix: 'sr', tier: 'recommended', subcategory: 'radar', regulatoryRefs: [], scenarios: ['oil_spill'] },
    },
    {
        id: 'sr_drone_rgb',
        name: 'Drone RGB (GSD < 5cm)',
        names: { en: 'Drone RGB (GSD < 5cm)', es: 'Dron RGB (GSD < 5cm)' },
        defaultUnitId: 'cm',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'recommended',
            subcategory: 'drones',
            regulatoryRefs: [],
            scenarios: ['tailings_dam', 'mining_operations', 'deforestation'],
        },
    },
    {
        id: 'sr_drone_thermal',
        name: 'Drone Termal (Anomalias)',
        names: { en: 'Thermal Drone (Anomalies)', es: 'Dron Térmico (Anomalías)' },
        defaultUnitId: 'celsius',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'recommended',
            subcategory: 'drones',
            regulatoryRefs: [],
            scenarios: ['chemical_accident', 'mining_operations'],
        },
    },
    {
        id: 'sr_lidar_chm',
        name: 'LiDAR CHM (Modelo de Altura do Dossel)',
        names: { en: 'LiDAR CHM (Canopy Height Model)', es: 'LiDAR CHM (Modelo de Altura del Dosel)' },
        defaultUnitId: 'm',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'recommended',
            subcategory: 'lidar',
            regulatoryRefs: [],
            scenarios: ['deforestation'],
        },
    },
    {
        id: 'sr_change_detection',
        name: 'Detecção de Mudança (Bitemp.)',
        names: { en: 'Change Detection (Bitemp.)', es: 'Detección de Cambio (Bitemp.)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'recommended',
            subcategory: 'change_detection',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations', 'tailings_dam'],
        },
    },

    // ─── 🟢 SPECIALIZED ─────────────────────────────────────────
    {
        id: 'sr_drone_hyperspectral',
        name: 'Drone Hiperespectral',
        names: { en: 'Hyperspectral Drone', es: 'Dron Hiperespectral' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'specialized',
            subcategory: 'drones',
            regulatoryRefs: [],
            scenarios: ['mining_operations', 'deforestation'],
        },
    },
    {
        id: 'sr_drone_gas',
        name: 'Drone Sensor Gasoso (CH₄, CO₂, H₂S)',
        names: { en: 'Drone Gas Sensor (CH₄, CO₂, H₂S)', es: 'Dron Sensor de Gas (CH₄, CO₂, H₂S)' },
        defaultUnitId: 'ppb',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'specialized',
            subcategory: 'drones',
            regulatoryRefs: [],
            scenarios: ['chemical_accident', 'mining_operations'],
        },
    },
    {
        id: 'sr_sif',
        name: 'SIF (Fluorescência Solar Induzida)',
        names: { en: 'SIF (Solar Induced Fluorescence)', es: 'SIF (Fluorescencia Solar Inducida)' },
        defaultUnitId: 'W_m2',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'specialized',
            subcategory: 'spectral_indices',
            regulatoryRefs: [],
            scenarios: ['deforestation'],
        },
    },
    {
        id: 'sr_afai',
        name: 'AFAI (Algas Flutuantes)',
        names: { en: 'AFAI (Floating Algae)', es: 'AFAI (Algas Flotantes)' },
        defaultUnitId: 'ndvi',
        type: 'SI',
        category: 'biodiversity',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'specialized',
            subcategory: 'spectral_indices',
            regulatoryRefs: [],
            scenarios: ['oil_spill', 'tailings_dam'],
        },
    },
    {
        id: 'sr_deep_learning',
        name: 'Deep Learning (Segmentação Semântica)',
        names: { en: 'Deep Learning (Semantic Segmentation)', es: 'Deep Learning (Segmentación Semántica)' },
        defaultUnitId: 'score',
        type: 'SI',
        category: 'physical',
        allowedCustomFields: [],
        sao: {
            matrix: 'sr',
            tier: 'specialized',
            subcategory: 'change_detection',
            regulatoryRefs: [],
            scenarios: ['deforestation', 'mining_operations'],
        },
    },
];
