// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Random model catalog extracted for RANDOM-REBUILD-V2 Phase C.7.1.
 *
 * Keeps parameter ranges and family mappings stable while randomModel.js
 * shrinks to a thin public barrel/wrapper.
 */

export interface ParameterRangeEntry {
    readonly min: number;
    readonly max: number;
    readonly unitId: string;
    readonly physicalMin?: number;
    readonly physicalMax?: number;
    readonly category?: string;
    readonly casNumber?: string;
}

export interface FamilyVariableEntry {
    readonly value: string;
    readonly unit: string;
}

export type FamilyVariableMap = Readonly<Record<string, FamilyVariableEntry>>;

export const PARAMETER_RANGES: Readonly<Record<string, ParameterRangeEntry>> = {
    // === PARÂMETROS HIDROGEOLÓGICOS EXISTENTES ===
    pH: { min: 5.5, max: 8.5, unitId: 'pH', physicalMin: 0, physicalMax: 14 },
    conductivity: { min: 100, max: 2000, unitId: 'uS_cm', physicalMin: 0, physicalMax: 100000 },
    temperature: { min: 15, max: 25, unitId: 'celsius', physicalMin: -40, physicalMax: 100 },
    redox: { min: -400, max: 400, unitId: 'mV', category: 'chemical' },
    // === BTEX (agua ug/L) — calibrado para cenarios contaminados (RANDOM-001 F6) ===
    // VI CONAMA 420 (benzeno=5, tolueno=700) sao thresholds REGULATORIOS, nao
    // limites de geracao. Cenarios contaminados podem exceder o VI em ordens de
    // grandeza. Range = [detection_limit, ~1000x VI] para suportar contaminacao.
    benzene: { min: 0.001, max: 10000, unitId: 'ug_L', casNumber: '71-43-2' }, // VI=5
    toluene: { min: 0.1, max: 5000, unitId: 'ug_L', casNumber: '108-88-3' }, // VI=700
    ethylbenzene: { min: 0.05, max: 2000, unitId: 'ug_L', casNumber: '100-41-4' }, // VI=300
    xylenes: { min: 0.1, max: 3000, unitId: 'ug_L', casNumber: '1330-20-7' }, // VI=500
    naphthalene: { min: 0.01, max: 300, unitId: 'ug_L', casNumber: '91-20-3' }, // VI=60
    tph: { min: 0.1, max: 100, unitId: 'mg_L' },
    btex: { min: 0.01, max: 50, unitId: 'ug_L' },
    voc: { min: 0.01, max: 20, unitId: 'ug_L' },
    water_level: { min: -15, max: -1, unitId: 'm' },
    flow_rate: { min: 0.1, max: 10, unitId: 'L_s' },

    // === NOVOS: EMISSÕES ATMOSFÉRICAS ===
    ghg_scope1: { min: 100, max: 50000, unitId: 'tCO2e', category: 'emission' },
    ghg_scope2: { min: 50, max: 20000, unitId: 'tCO2e', category: 'emission' },

    // === DADOS DE ATIVIDADE — INVENTÁRIO GEE ===
    // Consumo bruto como leitura primária; postProcessing converte para tCO2e
    consumo_diesel_b14_L: { min: 2000, max: 20000, unitId: '', category: 'activity' },
    consumo_gas_natural_m3: { min: 500, max: 15000, unitId: '', category: 'activity' },
    consumo_eletricidade_kWh: { min: 5000, max: 150000, unitId: '', category: 'activity' },
    consumo_gasolina_c27_L: { min: 300, max: 8000, unitId: '', category: 'activity' },
    pm25: { min: 5, max: 150, unitId: 'ug_m3', category: 'air_quality' },
    pm10: { min: 10, max: 250, unitId: 'ug_m3', category: 'air_quality' },
    nox: { min: 10, max: 500, unitId: 'mg_Nm3', category: 'air_quality' },
    sox: { min: 5, max: 300, unitId: 'mg_Nm3', category: 'air_quality' },

    // === NOVOS: RESÍDUOS ===
    waste_total: { min: 10, max: 5000, unitId: 't', category: 'waste' },
    waste_hazardous: { min: 1, max: 500, unitId: 't', category: 'waste' },
    waste_recycled_pct: { min: 10, max: 95, unitId: 'percent', category: 'waste' },

    // === NOVOS: EFLUENTES ===
    effluent_flow: { min: 10, max: 5000, unitId: 'm3', category: 'effluent' },
    bod: { min: 5, max: 300, unitId: 'mg_L', category: 'effluent' },
    cod: { min: 10, max: 600, unitId: 'mg_L', category: 'effluent' },
    tss: { min: 5, max: 200, unitId: 'mg_L', category: 'effluent' },

    // === NOVOS: H&S ===
    frequency_rate: { min: 0, max: 15, unitId: 'per_1M_hh', category: 'safety' },
    severity_rate: { min: 0, max: 500, unitId: 'days_per_1M', category: 'safety' },
    ltir: { min: 0, max: 5, unitId: 'per_200k_hh', category: 'safety' },
    near_miss: { min: 0, max: 50, unitId: 'count', category: 'safety' },
    noise_exposure: { min: 65, max: 95, unitId: 'dBA', category: 'occupational' },

    // === NOVOS: BIODIVERSIDADE ===
    species_count: { min: 5, max: 200, unitId: 'count', category: 'biodiversity' },
    protected_area: { min: 1, max: 500, unitId: 'ha', category: 'biodiversity' },
    biodiversity_index: { min: 0.1, max: 1.0, unitId: 'score', category: 'biodiversity' },

    // === PAHs — EPA 16 Priority (agua ug/L) ===
    // Ref: EPA Method 8270, CONAMA 420/2009 Anexo II
    acenaphthene: { min: 0.0001, max: 1.0, unitId: 'ug_L', casNumber: '83-32-9', category: 'contaminant' },
    acenaphthylene: { min: 0.0001, max: 0.5, unitId: 'ug_L', casNumber: '208-96-8', category: 'contaminant' },
    anthracene: { min: 0.0001, max: 0.5, unitId: 'ug_L', casNumber: '120-12-7', category: 'contaminant' },
    benz_a_anthracene: { min: 0.00001, max: 0.1, unitId: 'ug_L', casNumber: '56-55-3', category: 'contaminant' },
    benzo_a_pyrene: { min: 0.00001, max: 0.05, unitId: 'ug_L', casNumber: '50-32-8', category: 'contaminant' },
    benzo_b_fluoranthene: { min: 0.00001, max: 0.1, unitId: 'ug_L', casNumber: '205-99-2', category: 'contaminant' },
    benzo_k_fluoranthene: { min: 0.00001, max: 0.05, unitId: 'ug_L', casNumber: '207-08-9', category: 'contaminant' },
    benzo_ghi_perylene: { min: 0.00001, max: 0.05, unitId: 'ug_L', casNumber: '191-24-2', category: 'contaminant' },
    chrysene: { min: 0.00001, max: 0.1, unitId: 'ug_L', casNumber: '218-01-9', category: 'contaminant' },
    dibenz_ah_anthracene: { min: 0.000001, max: 0.01, unitId: 'ug_L', casNumber: '53-70-3', category: 'contaminant' },
    fluoranthene: { min: 0.0001, max: 1.0, unitId: 'ug_L', casNumber: '206-44-0', category: 'contaminant' },
    fluorene: { min: 0.0001, max: 1.0, unitId: 'ug_L', casNumber: '86-73-7', category: 'contaminant' },
    indeno_123cd_pyrene: { min: 0.00001, max: 0.05, unitId: 'ug_L', casNumber: '193-39-5', category: 'contaminant' },
    phenanthrene: { min: 0.0001, max: 2.0, unitId: 'ug_L', casNumber: '85-01-8', category: 'contaminant' },
    pyrene: { min: 0.0001, max: 1.0, unitId: 'ug_L', casNumber: '129-00-0', category: 'contaminant' },
    pah_total: { min: 0.001, max: 10.0, unitId: 'ug_L', category: 'contaminant' },

    // === PFAS (agua ng/L) ===
    // Ref: Stockholm Convention, EPA PFAS Action Plan, CETESB 2021
    pfos: { min: 0.1, max: 200, unitId: 'ng_L', casNumber: '1763-23-1', category: 'contaminant' },
    pfoa: { min: 0.1, max: 100, unitId: 'ng_L', casNumber: '335-67-1', category: 'contaminant' },
    pfhxs: { min: 0.05, max: 50, unitId: 'ng_L', category: 'contaminant' },
    pfna: { min: 0.01, max: 30, unitId: 'ng_L', category: 'contaminant' },
    pfda: { min: 0.01, max: 20, unitId: 'ng_L', category: 'contaminant' },
    pfas_total: { min: 1, max: 500, unitId: 'ng_L', category: 'contaminant' },

    // === Radionuclideos (sedimento Bq/kg) ===
    // Ref: IAEA TRS-295, IAEA Safety Standards
    lead_210: { min: 10, max: 500, unitId: 'Bq_kg', category: 'radiological' },
    radium_226: { min: 5, max: 200, unitId: 'Bq_kg', category: 'radiological' },
    radium_228: { min: 5, max: 150, unitId: 'Bq_kg', category: 'radiological' },
    thorium_228: { min: 5, max: 100, unitId: 'Bq_kg', category: 'radiological' },
    potassium_40: { min: 100, max: 1000, unitId: 'Bq_kg', category: 'radiological' },
    cesium_137: { min: 0.1, max: 50, unitId: 'Bq_kg', category: 'radiological' },

    // === Granulometria (%) ===
    // Ref: ISO 14688, Wentworth scale, ABNT NBR 6502
    clay_fraction: { min: 5, max: 60, unitId: 'percent', category: 'geotechnical', physicalMin: 0, physicalMax: 100 },
    silt_fraction: { min: 5, max: 70, unitId: 'percent', category: 'geotechnical', physicalMin: 0, physicalMax: 100 },
    sand_fine: { min: 0, max: 50, unitId: 'percent', category: 'geotechnical', physicalMin: 0, physicalMax: 100 },
    sand_medium: { min: 0, max: 40, unitId: 'percent', category: 'geotechnical', physicalMin: 0, physicalMax: 100 },
    sand_coarse: { min: 0, max: 30, unitId: 'percent', category: 'geotechnical', physicalMin: 0, physicalMax: 100 },
    sand_very_fine: { min: 0, max: 40, unitId: 'percent', category: 'geotechnical', physicalMin: 0, physicalMax: 100 },
    sand_very_coarse: {
        min: 0,
        max: 20,
        unitId: 'percent',
        category: 'geotechnical',
        physicalMin: 0,
        physicalMax: 100,
    },
    gravel: { min: 0, max: 20, unitId: 'percent', category: 'geotechnical', physicalMin: 0, physicalMax: 100 },
    // Pelite expandido para 100% — dados publicos mostram que sedimentos quase puros existem (RANDOM-001 F6)
    pelite: { min: 0, max: 100, unitId: 'percent', category: 'geotechnical', physicalMin: 0, physicalMax: 100 },
    sorting: { min: 0.3, max: 4.0, unitId: 'none', category: 'geotechnical', physicalMin: 0, physicalMax: 10 },
    skewness: { min: -1.0, max: 1.0, unitId: 'none', category: 'geotechnical', physicalMin: -3, physicalMax: 3 },
    kurtosis: { min: 0.5, max: 3.0, unitId: 'none', category: 'geotechnical', physicalMin: 0, physicalMax: 10 },
    grain_size: { min: 0.001, max: 64, unitId: 'mm', category: 'geotechnical', physicalMin: 0, physicalMax: 256 },

    // === Sedimento organico (%) ===
    // Ref: ISO 10694, OSPAR CEMP
    toc: { min: 0.1, max: 10, unitId: 'percent', category: 'chemical', physicalMin: 0, physicalMax: 50 },
    tom: { min: 0.5, max: 20, unitId: 'percent', category: 'chemical', physicalMin: 0, physicalMax: 100 },
    total_sulfur: { min: 0.01, max: 5, unitId: 'percent', category: 'chemical', physicalMin: 0, physicalMax: 50 },

    // === Alkylated PAHs (OSPAR groups, agua ug/L) ===
    c1_naphthalenes: { min: 0.001, max: 5, unitId: 'ug_L', category: 'contaminant' },
    c2_naphthalenes: { min: 0.001, max: 3, unitId: 'ug_L', category: 'contaminant' },
    c3_naphthalenes: { min: 0.0005, max: 2, unitId: 'ug_L', category: 'contaminant' },
    c1_phenanthrenes: { min: 0.0005, max: 1, unitId: 'ug_L', category: 'contaminant' },
    c2_phenanthrenes: { min: 0.0002, max: 0.5, unitId: 'ug_L', category: 'contaminant' },
    c3_phenanthrenes: { min: 0.0001, max: 0.3, unitId: 'ug_L', category: 'contaminant' },
};

// Parametros por familia
export const FAMILY_PARAMETERS: Readonly<Record<string, ReadonlyArray<string>>> = {
    // === FAMÍLIAS EXISTENTES ===
    well: [
        'pH',
        'conductivity',
        'temperature',
        'redox',
        'water_level',
        'benzene',
        'toluene',
        'ethylbenzene',
        'xylenes',
        'naphthalene',
        'tph',
        'btex',
        'voc',
        'benzo_a_pyrene',
        'phenanthrene',
        'pyrene',
        'fluoranthene',
        'pah_total',
        'pfos',
        'pfoa',
        'pfas_total',
        'clay_fraction',
        'silt_fraction',
        'toc',
    ],
    plume: [
        'benzene',
        'toluene',
        'ethylbenzene',
        'xylenes',
        'naphthalene',
        'tph',
        'btex',
        'voc',
        'benzo_a_pyrene',
        'pah_total',
        'pfos',
        'pfas_total',
    ],
    spring: ['temperature', 'flow_rate', 'pH', 'conductivity', 'redox'],
    sample: [
        'pH',
        'conductivity',
        'temperature',
        'redox',
        'benzene',
        'toluene',
        'xylenes',
        'tph',
        'voc',
        'benzo_a_pyrene',
        'chrysene',
        'phenanthrene',
        'pah_total',
        'pfos',
        'pfoa',
        'clay_fraction',
        'silt_fraction',
        'grain_size',
        'toc',
        'tom',
    ],
    lake: ['pH', 'temperature', 'conductivity'],
    river: ['pH', 'temperature', 'flow_rate'],
    tank: ['tph', 'benzene'],

    // === NOVAS FAMÍLIAS ESG ===
    emission_source: ['ghg_scope1', 'ghg_scope2', 'pm25', 'pm10', 'nox', 'sox'],
    waste_stream: ['waste_total', 'waste_hazardous', 'waste_recycled_pct'],
    effluent_point: ['effluent_flow', 'bod', 'cod', 'tss', 'pH', 'temperature'],
    area: ['frequency_rate', 'severity_rate', 'ltir', 'near_miss'],
    habitat: ['species_count', 'biodiversity_index', 'protected_area'],
    individual: ['noise_exposure'],
    sensor: ['temperature', 'pH', 'conductivity', 'water_level', 'lead_210', 'cesium_137'],

    // === FAMILIAS ESPACIAIS / GIS ===
    blueprint: ['pH', 'conductivity', 'temperature', 'benzene', 'tph'],

    // === NOVAS FAMILIAS 2026-04-20 ===
    // Frota e equipamento: combustivel/emissao veicular (CO2 scope 1 movel)
    vehicle: ['ghg_scope1', 'nox', 'pm25'],
    // Equipamento industrial: emissoes pontuais (compressor, gerador, furadeira)
    equipment: ['ghg_scope1', 'nox', 'sox', 'noise_exposure'],
    // Infraestrutura linear (dutos/cabos/rodovias): fluxo + contaminacao acidental
    infra_linear: ['tph', 'benzene', 'flow_rate'],
    // Sistema de tratamento (ETE, separador oil/water): parametros de efluente tratado
    treatment_system: ['effluent_flow', 'bod', 'cod', 'tss', 'pH', 'temperature'],
    // Atmosfera (qualidade do ar ambiente): compartimento aereo
    atmosphere: ['pm25', 'pm10', 'nox', 'sox', 'temperature'],

    // === FAMILIAS INTANGIVEIS ===
    intangible: [],
    generic: [],
};

// Variaveis de contexto por familia — preenchidas automaticamente no modelo aleatorio
// Cada variavel armazena { value, unit }. Indica matriz ambiental e tipo de fracao.
const AD = 'adimensional'; // unidade padrao para flags booleanos e categorias
export const FAMILY_VARIABLES: Readonly<Record<string, FamilyVariableMap>> = {
    well: { is_matrix_water: { value: '1', unit: AD }, fraction: { value: 'dissolved', unit: AD } },
    spring: { is_matrix_water: { value: '1', unit: AD }, fraction: { value: 'total', unit: AD } },
    lake: { is_matrix_water: { value: '1', unit: AD }, fraction: { value: 'total', unit: AD } },
    river: { is_matrix_water: { value: '1', unit: AD }, fraction: { value: 'total', unit: AD } },
    plume: {
        is_matrix_water: { value: '1', unit: AD },
        is_matrix_soil: { value: '1', unit: AD },
        fraction: { value: 'total', unit: AD },
    },
    sample: {
        is_matrix_water: { value: '1', unit: AD },
        is_matrix_soil: { value: '1', unit: AD },
        fraction: { value: 'dissolved', unit: AD },
    },
    emission_source: { is_matrix_air: { value: '1', unit: AD } },
    effluent_point: { is_matrix_water: { value: '1', unit: AD }, fraction: { value: 'total', unit: AD } },
    habitat: { is_matrix_biota: { value: '1', unit: AD } },
    area: { is_matrix_human: { value: '1', unit: AD } },
    individual: { is_matrix_human: { value: '1', unit: AD } },
    tank: { is_matrix_soil: { value: '1', unit: AD }, fraction: { value: 'total', unit: AD } },
    waste_stream: { is_matrix_soil: { value: '1', unit: AD } },
    sensor: { is_matrix_water: { value: '1', unit: AD } },
    stratum: { is_matrix_geotechnical: { value: '1', unit: AD } },

    // === NOVAS FAMILIAS 2026-04-20 ===
    vehicle: { is_matrix_air: { value: '1', unit: AD } },
    equipment: { is_matrix_air: { value: '1', unit: AD } },
    infra_linear: { is_matrix_soil: { value: '1', unit: AD }, fraction: { value: 'total', unit: AD } },
    treatment_system: { is_matrix_water: { value: '1', unit: AD }, fraction: { value: 'total', unit: AD } },
    atmosphere: { is_matrix_air: { value: '1', unit: AD } },

    intangible: {},
    generic: {},
};

