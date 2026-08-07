// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/core/sao/params/ar.ts
// SAO PARAMS - Air Quality Matrix
// Parametros SAO - Matriz de Qualidade do Ar
//
// Variaveis de material particulado, gases, compostos organicos,
// odor, meteorologia e dispersao para avaliacao ambiental transversal.
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
 * Air quality matrix parameters for the SAO taxonomy.
 * Parametros da matriz de qualidade do ar para a taxonomia SAO.
 *
 * Each entry follows the SAO parameter schema with matrix, tier,
 * subcategory, regulatory references, and applicable scenarios.
 */
export const AR_PARAMETERS: readonly SaoParameter[] = [
    // =============================================================
    //  PARTICULATE — Material Particulado
    //  Particulas em suspensao no ar que afetam a saude respiratoria
    // =============================================================
    {
        id: 'pm25',
        name: 'Material Particulado PM2.5',
        names: { en: 'Particulate Matter PM2.5', es: 'Material Particulado PM2.5' },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'essential',
            subcategory: 'particulate',
            regulatoryRefs: ['CONAMA 491/2018', 'WHO AQG 2021', 'EPA NAAQS'],
            scenarios: ['routine_monitoring', 'mining_operations', 'chemical_accident'],
        },
    },
    {
        id: 'pm10',
        name: 'Material Particulado PM10',
        names: { en: 'Particulate Matter PM10', es: 'Material Particulado PM10' },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'essential',
            subcategory: 'particulate',
            regulatoryRefs: ['CONAMA 491/2018', 'WHO AQG 2021', 'EPA NAAQS'],
            scenarios: ['routine_monitoring', 'mining_operations'],
        },
    },
    {
        id: 'pts',
        name: 'Partículas Totais em Suspensão (PTS)',
        names: { en: 'Total Suspended Particles (TSP)', es: 'Partículas Totales en Suspensión (PTS)' },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'essential',
            subcategory: 'particulate',
            regulatoryRefs: ['CONAMA 491/2018'],
            scenarios: ['routine_monitoring', 'mining_operations'],
        },
    },
    {
        id: 'pm1',
        name: 'Material Particulado PM1',
        names: { en: 'Particulate Matter PM1', es: 'Material Particulado PM1' },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'particulate',
            regulatoryRefs: ['WHO AQG 2021'],
            scenarios: ['routine_monitoring', 'mining_operations'],
        },
    },
    {
        id: 'black_carbon',
        name: 'Carbono Negro (Black Carbon)',
        names: { en: 'Black Carbon', es: 'Carbono Negro (Black Carbon)' },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'particulate',
            regulatoryRefs: ['WHO AQG 2021'],
            scenarios: ['routine_monitoring', 'mining_operations'],
        },
    },
    {
        id: 'oc_ec_ratio',
        name: 'Razão Carbono Orgânico/Elementar (OC/EC)',
        names: { en: 'Organic/Elemental Carbon Ratio (OC/EC)', es: 'Relación Carbono Orgánico/Elemental (OC/EC)' },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'particulate',
            regulatoryRefs: [],
            scenarios: ['routine_monitoring'],
        },
    },
    // =============================================================
    //  CRITERIA GASES — Gases Critério
    //  Poluentes atmosfericos regulamentados por normas nacionais
    // =============================================================
    {
        id: 'so2',
        name: 'Dióxido de Enxofre (SO2)',
        names: { en: 'Sulfur Dioxide (SO2)', es: 'Dióxido de Azufre (SO2)' },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'essential',
            subcategory: 'criteria_gases',
            regulatoryRefs: ['CONAMA 491/2018', 'WHO AQG 2021', 'EPA NAAQS'],
            scenarios: ['routine_monitoring', 'chemical_accident', 'mining_operations'],
        },
    },
    {
        id: 'nox_air',
        name: 'Óxidos de Nitrogênio (NOx)',
        names: { en: 'Nitrogen Oxides (NOx)', es: 'Óxidos de Nitrógeno (NOx)' },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'essential',
            subcategory: 'criteria_gases',
            regulatoryRefs: ['CONAMA 491/2018', 'WHO AQG 2021', 'EPA NAAQS'],
            scenarios: ['routine_monitoring', 'chemical_accident'],
        },
    },
    {
        id: 'co_air',
        name: 'Monóxido de Carbono (CO)',
        names: { en: 'Carbon Monoxide (CO)', es: 'Monóxido de Carbono (CO)' },
        defaultUnitId: 'mg_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'essential',
            subcategory: 'criteria_gases',
            regulatoryRefs: ['CONAMA 491/2018', 'WHO AQG 2021', 'EPA NAAQS'],
            scenarios: ['routine_monitoring', 'chemical_accident'],
        },
    },
    {
        id: 'o3_air',
        name: 'Ozônio (O3)',
        names: { en: 'Ozone (O3)', es: 'Ozono (O3)' },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'essential',
            subcategory: 'criteria_gases',
            regulatoryRefs: ['CONAMA 491/2018', 'WHO AQG 2021', 'EPA NAAQS'],
            scenarios: ['routine_monitoring'],
        },
    },
    // =============================================================
    //  METEOROLOGY — Meteorologia
    //  Variaveis meteorologicas que condicionam dispersao e exposicao
    // =============================================================
    {
        id: 'air_temperature',
        name: 'Temperatura do Ar',
        names: { en: 'Air Temperature', es: 'Temperatura del Aire' },
        defaultUnitId: 'celsius',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'essential',
            subcategory: 'meteorology',
            regulatoryRefs: ['INMET', 'WMO'],
            scenarios: ['routine_monitoring', 'chemical_accident', 'mining_operations'],
        },
    },
    {
        id: 'relative_humidity',
        name: 'Umidade Relativa do Ar',
        names: { en: 'Relative Humidity', es: 'Humedad Relativa del Aire' },
        defaultUnitId: 'pct',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'essential',
            subcategory: 'meteorology',
            regulatoryRefs: ['INMET', 'WMO'],
            scenarios: ['routine_monitoring', 'chemical_accident', 'mining_operations'],
        },
    },
    {
        id: 'wind_speed',
        name: 'Velocidade do Vento',
        names: { en: 'Wind Speed', es: 'Velocidad del Viento' },
        defaultUnitId: 'm_s',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'essential',
            subcategory: 'meteorology',
            regulatoryRefs: ['INMET', 'WMO'],
            scenarios: ['routine_monitoring', 'chemical_accident', 'mining_operations', 'tailings_dam'],
        },
    },
    {
        id: 'wind_direction',
        name: 'Direção do Vento',
        names: { en: 'Wind Direction', es: 'Dirección del Viento' },
        defaultUnitId: 'degrees',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'essential',
            subcategory: 'meteorology',
            regulatoryRefs: ['INMET', 'WMO'],
            scenarios: ['routine_monitoring', 'chemical_accident', 'mining_operations', 'tailings_dam'],
        },
    },
    {
        id: 'precipitation_air',
        name: 'Precipitação',
        names: { en: 'Precipitation', es: 'Precipitación' },
        defaultUnitId: 'mm_day',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'essential',
            subcategory: 'meteorology',
            regulatoryRefs: ['INMET', 'WMO'],
            scenarios: ['routine_monitoring', 'mining_operations', 'tailings_dam'],
        },
    },
    {
        id: 'pasquill_class',
        name: 'Classe de Estabilidade de Pasquill-Gifford',
        names: { en: 'Pasquill-Gifford Stability Class', es: 'Clase de Estabilidad de Pasquill-Gifford' },
        defaultUnitId: 'dimensionless',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'essential',
            subcategory: 'meteorology',
            regulatoryRefs: ['EPA AP-42', 'AERMOD'],
            scenarios: ['chemical_accident', 'routine_monitoring'],
        },
    },
    {
        id: 'solar_radiation',
        name: 'Radiação Solar Global',
        names: { en: 'Global Solar Radiation', es: 'Radiación Solar Global' },
        defaultUnitId: 'W_m2',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'meteorology',
            regulatoryRefs: ['INMET', 'WMO'],
            scenarios: ['routine_monitoring'],
        },
    },
    {
        id: 'uv_index',
        name: 'Índice Ultravioleta (UV)',
        names: { en: 'Ultraviolet Index (UV)', es: 'Índice Ultravioleta (UV)' },
        defaultUnitId: 'dimensionless',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'meteorology',
            regulatoryRefs: ['WHO', 'INMET'],
            scenarios: ['routine_monitoring'],
        },
    },
    {
        id: 'dew_point',
        name: 'Ponto de Orvalho',
        names: { en: 'Dew Point', es: 'Punto de Rocío' },
        defaultUnitId: 'celsius',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'meteorology',
            regulatoryRefs: ['INMET', 'WMO'],
            scenarios: ['routine_monitoring'],
        },
    },
    {
        id: 'wbgt',
        name: 'IBUTG — Índice de Bulbo Úmido e Termômetro de Globo',
        names: {
            en: 'WBGT — Wet Bulb Globe Temperature Index',
            es: 'TGBH — Índice de Temperatura de Globo y Bulbo Húmedo',
        },
        defaultUnitId: 'celsius',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'meteorology',
            regulatoryRefs: ['NR-15 Anexo 3', 'ISO 7243'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'atmospheric_pressure',
        name: 'Pressão Atmosférica',
        names: { en: 'Atmospheric Pressure', es: 'Presión Atmosférica' },
        defaultUnitId: 'hPa',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'meteorology',
            regulatoryRefs: ['INMET', 'WMO'],
            scenarios: ['routine_monitoring', 'chemical_accident'],
        },
    },
    {
        id: 'pbl_height',
        name: 'Altura da Camada Limite Planetária (PBL)',
        names: { en: 'Planetary Boundary Layer Height (PBL)', es: 'Altura de la Capa Límite Planetaria (PBL)' },
        defaultUnitId: 'm',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'meteorology',
            regulatoryRefs: ['AERMOD', 'CALPUFF'],
            scenarios: ['chemical_accident', 'routine_monitoring'],
        },
    },
    {
        id: 'evapotranspiration',
        name: 'Evapotranspiração',
        names: { en: 'Evapotranspiration', es: 'Evapotranspiración' },
        defaultUnitId: 'mm_day',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'meteorology',
            regulatoryRefs: ['FAO Penman-Monteith'],
            scenarios: ['routine_monitoring'],
        },
    },
    // =============================================================
    //  VOCs AIR — Compostos Organicos Volateis no Ar
    //  Substancias organicas volateis com potencial carcinogenico
    // =============================================================
    {
        id: 'btex_air',
        name: 'BTEX no Ar (Benzeno, Tolueno, Etilbenzeno, Xilenos)',
        names: {
            en: 'BTEX in Air (Benzene, Toluene, Ethylbenzene, Xylenes)',
            es: 'BTEX en Aire (Benceno, Tolueno, Etilbenceno, Xilenos)',
        },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'vocs_air',
            regulatoryRefs: ['CONAMA 491/2018', 'EPA TO-15'],
            scenarios: ['chemical_accident', 'routine_monitoring'],
        },
    },
    {
        id: 'formaldehyde_air',
        name: 'Formaldeído no Ar',
        names: { en: 'Formaldehyde in Air', es: 'Formaldehído en Aire' },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'vocs_air',
            regulatoryRefs: ['WHO AQG 2021', 'IARC Grupo 1'],
            scenarios: ['chemical_accident', 'routine_monitoring'],
        },
    },
    {
        id: 'acetaldehyde_air',
        name: 'Acetaldeído no Ar',
        names: { en: 'Acetaldehyde in Air', es: 'Acetaldehído en Aire' },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'vocs_air',
            regulatoryRefs: ['IARC Grupo 2B'],
            scenarios: ['chemical_accident', 'routine_monitoring'],
        },
    },
    {
        id: 'h2s_air',
        name: 'Sulfeto de Hidrogênio (H2S)',
        names: { en: 'Hydrogen Sulfide (H2S)', es: 'Sulfuro de Hidrógeno (H2S)' },
        defaultUnitId: 'ppb',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'vocs_air',
            regulatoryRefs: ['WHO AQG 2000', 'NIOSH REL'],
            scenarios: ['chemical_accident', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'nh3_air',
        name: 'Amônia (NH3)',
        names: { en: 'Ammonia (NH3)', es: 'Amoníaco (NH3)' },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'vocs_air',
            regulatoryRefs: ['NIOSH REL', 'OSHA PEL'],
            scenarios: ['chemical_accident', 'routine_monitoring'],
        },
    },
    {
        id: 'hcl_air',
        name: 'Ácido Clorídrico (HCl)',
        names: { en: 'Hydrochloric Acid (HCl)', es: 'Ácido Clorhídrico (HCl)' },
        defaultUnitId: 'mg_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'vocs_air',
            regulatoryRefs: ['NIOSH REL', 'OSHA PEL'],
            scenarios: ['chemical_accident'],
        },
    },
    {
        id: 'hf_air',
        name: 'Ácido Fluorídrico (HF)',
        names: { en: 'Hydrofluoric Acid (HF)', es: 'Ácido Fluorhídrico (HF)' },
        defaultUnitId: 'mg_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'vocs_air',
            regulatoryRefs: ['NIOSH REL', 'OSHA PEL'],
            scenarios: ['chemical_accident'],
        },
    },
    {
        id: 'hcn_air',
        name: 'Cianeto de Hidrogênio (HCN)',
        names: { en: 'Hydrogen Cyanide (HCN)', es: 'Cianuro de Hidrógeno (HCN)' },
        defaultUnitId: 'mg_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'vocs_air',
            regulatoryRefs: ['NIOSH IDLH', 'OSHA PEL'],
            scenarios: ['chemical_accident', 'mining_operations'],
        },
    },
    {
        id: 'vinyl_chloride_air',
        name: 'Cloreto de Vinila no Ar',
        names: { en: 'Vinyl Chloride in Air', es: 'Cloruro de Vinilo en Aire' },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'specialized',
            subcategory: 'vocs_air',
            regulatoryRefs: ['IARC Grupo 1', 'EPA HAP'],
            scenarios: ['chemical_accident'],
        },
    },
    {
        id: 'tce_air',
        name: 'Tricloroetileno (TCE) no Ar',
        names: { en: 'Trichloroethylene (TCE) in Air', es: 'Tricloroetileno (TCE) en Aire' },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'specialized',
            subcategory: 'vocs_air',
            regulatoryRefs: ['IARC Grupo 1', 'EPA HAP'],
            scenarios: ['chemical_accident'],
        },
    },
    {
        id: 'pce_air',
        name: 'Percloroetileno (PCE) no Ar',
        names: { en: 'Perchloroethylene (PCE) in Air', es: 'Percloroetileno (PCE) en Aire' },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'specialized',
            subcategory: 'vocs_air',
            regulatoryRefs: ['IARC Grupo 2A', 'EPA HAP'],
            scenarios: ['chemical_accident'],
        },
    },
    {
        id: 'mic_air',
        name: 'Isocianato de Metila (MIC)',
        names: { en: 'Methyl Isocyanate (MIC)', es: 'Isocianato de Metilo (MIC)' },
        defaultUnitId: 'ppb',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'specialized',
            subcategory: 'vocs_air',
            regulatoryRefs: ['NIOSH IDLH', 'Bhopal Reference'],
            scenarios: ['chemical_accident'],
        },
    },
    {
        id: 'phosgene_air',
        name: 'Fosgênio (COCl2)',
        names: { en: 'Phosgene (COCl2)', es: 'Fosgeno (COCl2)' },
        defaultUnitId: 'mg_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'specialized',
            subcategory: 'vocs_air',
            regulatoryRefs: ['NIOSH IDLH', 'OSHA PEL'],
            scenarios: ['chemical_accident'],
        },
    },
    {
        id: 'cl2_air',
        name: 'Cloro Gasoso (Cl2)',
        names: { en: 'Chlorine Gas (Cl2)', es: 'Cloro Gaseoso (Cl2)' },
        defaultUnitId: 'mg_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'specialized',
            subcategory: 'vocs_air',
            regulatoryRefs: ['NIOSH IDLH', 'OSHA PEL'],
            scenarios: ['chemical_accident'],
        },
    },
    {
        id: 'i131_gas',
        name: 'Iodo-131 Gasoso (I-131)',
        names: { en: 'Gaseous Iodine-131 (I-131)', es: 'Yodo-131 Gaseoso (I-131)' },
        defaultUnitId: 'Bq_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'specialized',
            subcategory: 'vocs_air',
            regulatoryRefs: ['CNEN NN-3.01', 'IAEA GSR Part 3'],
            scenarios: ['nuclear_radiological'],
        },
    },
    // =============================================================
    //  DEPOSITION — Deposição Atmosférica
    //  Deposicao seca e umida de poluentes na superficie
    // =============================================================
    {
        id: 'dry_deposition',
        name: 'Deposição Seca',
        names: { en: 'Dry Deposition', es: 'Deposición Seca' },
        defaultUnitId: 'mg_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'deposition',
            regulatoryRefs: ['CONAMA 491/2018'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'wet_deposition',
        name: 'Deposição Úmida',
        names: { en: 'Wet Deposition', es: 'Deposición Húmeda' },
        defaultUnitId: 'mg_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'recommended',
            subcategory: 'deposition',
            regulatoryRefs: ['CONAMA 491/2018'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    // =============================================================
    //  INDICES AIR — Índices de Qualidade do Ar
    //  Indices compostos que traduzem dados em comunicacao ao publico
    // =============================================================
    {
        id: 'iqar',
        name: 'Índice de Qualidade do Ar (IQAr — CONAMA)',
        names: { en: 'Air Quality Index (IQAr — CONAMA)', es: 'Índice de Calidad del Aire (IQAr — CONAMA)' },
        defaultUnitId: 'dimensionless',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'essential',
            subcategory: 'indices_air',
            regulatoryRefs: ['CONAMA 491/2018', 'CETESB'],
            scenarios: ['routine_monitoring'],
        },
    },
    {
        id: 'aqi_epa',
        name: 'Air Quality Index (AQI — EPA)',
        names: { en: 'Air Quality Index (AQI — EPA)', es: 'Índice de Calidad del Aire (AQI — EPA)' },
        defaultUnitId: 'dimensionless',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'essential',
            subcategory: 'indices_air',
            regulatoryRefs: ['EPA AQI', 'CFR 40 Part 58'],
            scenarios: ['routine_monitoring'],
        },
    },
    // =============================================================
    //  DISPERSION — Modelagem de Dispersão
    //  Parametros de entrada/saida para modelos AERMOD e CALPUFF
    // =============================================================
    {
        id: 'aod',
        name: 'Profundidade Óptica de Aerossol (AOD)',
        names: { en: 'Aerosol Optical Depth (AOD)', es: 'Profundidad Óptica de Aerosol (AOD)' },
        defaultUnitId: 'dimensionless',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'specialized',
            subcategory: 'dispersion',
            regulatoryRefs: ['AERONET', 'MODIS'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'angstrom_exponent',
        name: 'Expoente de Ångström',
        names: { en: 'Ångström Exponent', es: 'Exponente de Ångström' },
        defaultUnitId: 'dimensionless',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'specialized',
            subcategory: 'dispersion',
            regulatoryRefs: ['AERONET'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'ssa',
        name: 'Albedo de Espalhamento Simples (SSA)',
        names: { en: 'Single Scattering Albedo (SSA)', es: 'Albedo de Dispersión Simple (SSA)' },
        defaultUnitId: 'dimensionless',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'specialized',
            subcategory: 'dispersion',
            regulatoryRefs: ['AERONET'],
            scenarios: ['mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'aermod_concentration',
        name: 'Concentração AERMOD/CALPUFF (saída)',
        names: { en: 'AERMOD/CALPUFF Concentration (output)', es: 'Concentración AERMOD/CALPUFF (salida)' },
        defaultUnitId: 'ug_m3',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'specialized',
            subcategory: 'dispersion',
            regulatoryRefs: ['EPA AERMOD', 'EPA CALPUFF'],
            scenarios: ['chemical_accident', 'mining_operations', 'routine_monitoring'],
        },
    },
    {
        id: 'idlh_distance',
        name: 'Distância IDLH (Immediately Dangerous to Life or Health)',
        names: {
            en: 'IDLH Distance (Immediately Dangerous to Life or Health)',
            es: 'Distancia IDLH (Inmediatamente Peligrosa para la Vida o la Salud)',
        },
        defaultUnitId: 'm',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'specialized',
            subcategory: 'dispersion',
            regulatoryRefs: ['NIOSH IDLH', 'ALOHA/CAMEO'],
            scenarios: ['chemical_accident', 'nuclear_radiological'],
        },
    },
    {
        id: 'monin_obukhov_length',
        name: 'Comprimento de Monin-Obukhov (L)',
        names: { en: 'Monin-Obukhov Length (L)', es: 'Longitud de Monin-Obukhov (L)' },
        defaultUnitId: 'm',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'specialized',
            subcategory: 'dispersion',
            regulatoryRefs: ['AERMOD', 'Boundary Layer Meteorology'],
            scenarios: ['chemical_accident', 'routine_monitoring'],
        },
    },
    {
        id: 'friction_velocity',
        name: 'Velocidade de Fricção (u*)',
        names: { en: 'Friction Velocity (u*)', es: 'Velocidad de Fricción (u*)' },
        defaultUnitId: 'm_s',
        type: 'SI',
        category: 'air_quality',
        allowedCustomFields: [],
        sao: {
            matrix: 'ar',
            tier: 'specialized',
            subcategory: 'dispersion',
            regulatoryRefs: ['AERMOD', 'Boundary Layer Meteorology'],
            scenarios: ['chemical_accident', 'routine_monitoring'],
        },
    },
];
