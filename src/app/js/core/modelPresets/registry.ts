// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   MODEL PRESETS — REGISTRY
   Registro de presets com operacoes CRUD e catalogo embutido.
   Modulo 100% puro: sem DOM, sem browser, sem rede.
   ================================================================ */

import { validatePreset } from './schema.js';

// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------

const _registry = new Map<string, Record<string, any>>();

// ----------------------------------------------------------------
// REGISTRY OPERATIONS
// ----------------------------------------------------------------

/**
 * Register a preset after validation.
 * O preset e congelado (Object.freeze) apos registro.
 *
 * @param preset
 * @returns the frozen preset
 * @throws {Error} se invalido ou duplicado
 */
export function registerPreset(preset: Record<string, any>): Record<string, any> {
    validatePreset(preset);
    if (_registry.has(preset.id)) {
        throw new Error(`Preset already registered: ${preset.id}`);
    }
    const frozen = Object.freeze({ ...preset });
    _registry.set(preset.id, frozen);
    return frozen;
}

/**
 * Get a preset by ID.
 * @param id
 */
export function getPreset(id: string): Record<string, any> | undefined {
    if (typeof id !== 'string') return undefined;
    return _registry.get(id);
}

/**
 * List all registered presets.
 */
export function listPresets(): Record<string, any>[] {
    return Array.from(_registry.values());
}

/**
 * List all preset IDs.
 */
export function listPresetIds(): string[] {
    return Array.from(_registry.keys());
}

/**
 * Get presets filtered by category.
 * @param category
 */
export function getPresetsByCategory(category: string): Record<string, any>[] {
    if (typeof category !== 'string') return [];
    return listPresets().filter((p) => p.category === category);
}

/**
 * Check if a preset ID is registered.
 * @param id
 */
export function hasPreset(id: string): boolean {
    return typeof id === 'string' && _registry.has(id);
}

/**
 * Remove a preset by ID.
 * @param id
 * @returns true if removed
 */
export function unregisterPreset(id: string): boolean {
    return _registry.delete(id);
}

/**
 * Clear all presets (primarily for testing).
 */
export function clearPresets() {
    _registry.clear();
}

/**
 * Reset registry to built-in presets.
 * Usado para re-hidratar o catalogo padrao apos clearPresets().
 */
export function resetPresets() {
    clearPresets();
    for (const preset of BUILT_IN_PRESETS) {
        registerPreset(preset);
    }
}

// ----------------------------------------------------------------
// BUILT-IN PRESETS
// ----------------------------------------------------------------

/** Preset: GAC — Posto de Combustivel (BTEX + MTBE) */
const PRESET_GAC_GAS_STATION = {
    id: 'gac_gas_station',
    nameKey: 'preset.gac_gas_station',
    descriptionKey: 'preset.gac_gas_station_desc',
    icon: '&#9679;',
    category: 'gac',
    families: ['well', 'plume', 'boundary', 'tank', 'remediation', 'building'],
    generationOptions: {
        campaigns: 8,
        wells: 12,
        plumes: 2,
        buildings: 2,
        siteSize: 'small',
        contaminationLevel: 'medium',
        includeCosts: true,
    },
    parameters: [
        'benzene',
        'toluene',
        'ethylbenzene',
        'xylenes',
        'naphthalene',
        'tph',
        'mtbe',
        'pH',
        'conductivity',
        'redox',
        'lead',
        'iron',
        'manganese',
    ],
    thresholds: {
        reference: 'CONAMA 420/2009 + CETESB DD-256/2016',
        matrix: 'groundwater',
    },
    defaultOrigin: {
        system: 'UTM',
        zone: 23,
        hemisphere: 'S',
        easting: 333500,
        northing: 7394200,
        elevation: 750,
    },
    reportSkeleton: [
        { title: 'Introducao', type: 'text' },
        { title: 'Historico da Area', type: 'text' },
        { title: 'Modelo Conceitual', type: 'text+image' },
        { title: 'Metodologia', type: 'text' },
        { title: 'Resultados Analiticos', type: 'table' },
        { title: 'Mapa Potenciometrico', type: 'image' },
        { title: 'Mapa de Isoconcentracoes', type: 'image' },
        { title: 'Secao Geologica', type: 'image' },
        { title: 'Avaliacao de Risco', type: 'text+table' },
        { title: 'Conclusoes e Recomendacoes', type: 'text' },
    ],
    tags: ['gac', 'posto', 'btex', 'conama420', 'cetesb'],
};

/** Preset: GAC — Planta Industrial (Solventes Clorados) */
const PRESET_GAC_INDUSTRIAL = {
    id: 'gac_industrial',
    nameKey: 'preset.gac_industrial',
    descriptionKey: 'preset.gac_industrial_desc',
    icon: '&#9650;',
    category: 'gac',
    families: ['well', 'plume', 'boundary', 'building', 'remediation', 'waste'],
    generationOptions: {
        campaigns: 12,
        wells: 20,
        plumes: 3,
        buildings: 4,
        siteSize: 'medium',
        contaminationLevel: 'high',
        includeCosts: true,
    },
    parameters: [
        'tce',
        'pce',
        'dce_11',
        'dce_12',
        'vinyl_chloride',
        'benzene',
        'toluene',
        'xylenes',
        'pH',
        'conductivity',
        'redox',
        'dissolved_oxygen',
        'chromium',
        'lead',
        'cadmium',
        'nickel',
    ],
    thresholds: {
        reference: 'CONAMA 420/2009 + CETESB DD-256/2016',
        matrix: 'groundwater',
    },
    defaultOrigin: {
        system: 'UTM',
        zone: 23,
        hemisphere: 'S',
        easting: 340000,
        northing: 7400000,
        elevation: 720,
    },
    reportSkeleton: [
        { title: 'Introducao', type: 'text' },
        { title: 'Historico Industrial', type: 'text' },
        { title: 'Modelo Conceitual', type: 'text+image' },
        { title: 'Investigacao Detalhada', type: 'text' },
        { title: 'Resultados Analiticos', type: 'table' },
        { title: 'Mapa Potenciometrico', type: 'image' },
        { title: 'Delineacao de Pluma DNAPL', type: 'image' },
        { title: 'Cross-Section Hidrogeologica', type: 'image' },
        { title: 'Analise de Risco ACBR', type: 'text+table' },
        { title: 'Plano de Intervencao', type: 'text' },
        { title: 'Conclusoes', type: 'text' },
    ],
    tags: ['gac', 'industria', 'solventes', 'clorados', 'dnapl', 'conama420'],
};

/** Preset: Inventario de Emissoes GEE (GHG Protocol) */
const PRESET_GHG_INVENTORY = {
    id: 'ghg_inventory',
    nameKey: 'preset.ghg_inventory',
    descriptionKey: 'preset.ghg_inventory_desc',
    icon: '&#9670;',
    category: 'inventory',
    families: ['boundary', 'building', 'tank'],
    generationOptions: {
        campaigns: 3,
        wells: 0,
        plumes: 0,
        buildings: 5,
        siteSize: 'large',
        contaminationLevel: 'low',
        includeCosts: false,
    },
    parameters: [
        'co2',
        'ch4',
        'n2o',
        'hfc',
        'pfc',
        'sf6',
        'fuel_diesel',
        'fuel_gasoline',
        'fuel_lpg',
        'fuel_natural_gas',
        'electricity_kwh',
    ],
    thresholds: {
        reference: 'GHG Protocol Corporate Standard + PBGHGP',
        matrix: 'atmospheric',
    },
    defaultOrigin: {
        system: 'UTM',
        zone: 23,
        hemisphere: 'S',
        easting: 350000,
        northing: 7390000,
        elevation: 800,
    },
    reportSkeleton: [
        { title: 'Sumario Executivo', type: 'text' },
        { title: 'Limites Organizacionais', type: 'text' },
        { title: 'Limites Operacionais', type: 'text' },
        { title: 'Escopo 1', type: 'table' },
        { title: 'Escopo 2', type: 'table' },
        { title: 'Escopo 3', type: 'table' },
        { title: 'Fatores de Emissao', type: 'table' },
        { title: 'Comparativo Ano-Base', type: 'text+table' },
        { title: 'Metas e Compromissos', type: 'text' },
    ],
    tags: ['ghg', 'gee', 'emissoes', 'carbono', 'esg', 'ghgprotocol'],
};

/** Preset: Cadastro Ambiental Rural (CAR) */
const PRESET_CAR_RURAL = {
    id: 'car_rural',
    nameKey: 'preset.car_rural',
    descriptionKey: 'preset.car_rural_desc',
    icon: '&#9632;',
    category: 'inventory',
    families: ['boundary', 'river', 'lake', 'spring'],
    generationOptions: {
        campaigns: 0,
        wells: 0,
        plumes: 0,
        buildings: 1,
        siteSize: 'large',
        contaminationLevel: 'low',
        includeCosts: false,
    },
    parameters: ['vegetation_cover_pct', 'slope_degrees', 'riparian_width_m', 'soil_type', 'land_use'],
    thresholds: {
        reference: 'Lei 12.651/2012 (Codigo Florestal) + SICAR',
        matrix: 'land',
    },
    defaultOrigin: {
        system: 'UTM',
        zone: 22,
        hemisphere: 'S',
        easting: 600000,
        northing: 7500000,
        elevation: 500,
    },
    reportSkeleton: [
        { title: 'Identificacao do Imovel', type: 'text' },
        { title: 'Perimetro Georreferenciado', type: 'image' },
        { title: 'APP', type: 'text+image' },
        { title: 'Reserva Legal', type: 'text+image' },
        { title: 'Areas Consolidadas', type: 'text+image' },
        { title: 'Uso e Cobertura do Solo', type: 'image' },
        { title: 'Hidrografia', type: 'image' },
        { title: 'Memorial Descritivo', type: 'text' },
    ],
    tags: ['car', 'rural', 'app', 'reserva_legal', 'codigo_florestal', 'sicar'],
};

/** Preset: Remediacao — Projeto Executivo */
const PRESET_REMEDIATION = {
    id: 'remediation',
    nameKey: 'preset.remediation',
    descriptionKey: 'preset.remediation_desc',
    icon: '&#9733;',
    category: 'remediation',
    families: ['well', 'plume', 'boundary', 'remediation', 'tank', 'building'],
    generationOptions: {
        campaigns: 16,
        wells: 15,
        plumes: 2,
        buildings: 2,
        siteSize: 'medium',
        contaminationLevel: 'high',
        includeCosts: true,
    },
    parameters: [
        'benzene',
        'toluene',
        'xylenes',
        'tph',
        'tce',
        'pce',
        'vinyl_chloride',
        'pH',
        'conductivity',
        'redox',
        'dissolved_oxygen',
        'iron',
        'manganese',
        'sulfate',
    ],
    thresholds: {
        reference: 'CONAMA 420/2009 + CMA especificas do site',
        matrix: 'groundwater',
    },
    defaultOrigin: {
        system: 'UTM',
        zone: 23,
        hemisphere: 'S',
        easting: 335000,
        northing: 7395000,
        elevation: 740,
    },
    reportSkeleton: [
        { title: 'Introducao', type: 'text' },
        { title: 'Modelo Conceitual Atualizado', type: 'text+image' },
        { title: 'Tecnologia de Remediacao', type: 'text' },
        { title: 'Projeto Executivo', type: 'text+image' },
        { title: 'Monitoramento de Performance', type: 'table' },
        { title: 'Evolucao da Pluma', type: 'image' },
        { title: 'Mapa Potenciometrico', type: 'image' },
        { title: 'Indicadores de Encerramento', type: 'text+table' },
        { title: 'Cronograma e Custos', type: 'table' },
        { title: 'Conclusoes', type: 'text' },
    ],
    tags: ['remediacao', 'pump_treat', 'sve', 'isco', 'prb', 'monitoramento'],
};

/** Preset: Ambiental Generico — Outorga de Agua */
const PRESET_WATER_PERMIT = {
    id: 'water_permit',
    nameKey: 'preset.water_permit',
    descriptionKey: 'preset.water_permit_desc',
    icon: '&#9680;',
    category: 'permit',
    families: ['well', 'river', 'lake', 'spring', 'boundary'],
    generationOptions: {
        campaigns: 6,
        wells: 8,
        plumes: 0,
        buildings: 1,
        siteSize: 'medium',
        contaminationLevel: 'low',
        includeCosts: false,
    },
    parameters: [
        'flow_rate',
        'water_level',
        'pH',
        'conductivity',
        'temperature',
        'dissolved_oxygen',
        'turbidity',
        'cod',
        'bod',
    ],
    thresholds: {
        reference: 'Lei 9.433/1997 + ANA/DAEE',
        matrix: 'surface_water',
    },
    defaultOrigin: {
        system: 'UTM',
        zone: 23,
        hemisphere: 'S',
        easting: 338000,
        northing: 7393000,
        elevation: 710,
    },
    reportSkeleton: [
        { title: 'Identificacao do Requerente', type: 'text' },
        { title: 'Caracterizacao da Area', type: 'text+image' },
        { title: 'Hidrogeologia', type: 'text' },
        { title: 'Monitoramento de Vazao', type: 'table' },
        { title: 'Mapa de Pocos', type: 'image' },
        { title: 'Qualidade da Agua', type: 'table' },
        { title: 'Conclusoes', type: 'text' },
    ],
    tags: ['outorga', 'agua', 'ana', 'daee', 'vazao'],
};

// Expose built-ins for testing / introspection
export const BUILT_IN_PRESETS = Object.freeze([
    PRESET_GAC_GAS_STATION,
    PRESET_GAC_INDUSTRIAL,
    PRESET_GHG_INVENTORY,
    PRESET_CAR_RURAL,
    PRESET_REMEDIATION,
    PRESET_WATER_PERMIT,
]);

// ----------------------------------------------------------------
// AUTO-REGISTER BUILT-INS
// ----------------------------------------------------------------

for (const preset of BUILT_IN_PRESETS) {
    registerPreset(preset);
}
