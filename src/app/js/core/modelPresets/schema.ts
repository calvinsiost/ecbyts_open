// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   MODEL PRESETS — SCHEMA
   Definicoes de schema, enums congelados e validacao de presets.
   Modulo 100% puro: sem DOM, sem browser, sem rede.
   ================================================================ */

// ----------------------------------------------------------------
// ENUMS - Familias validas (subset de DEFAULT_FAMILIES)
// ----------------------------------------------------------------

export const VALID_FAMILIES: Readonly<string[]> = Object.freeze([
    'well',
    'plume',
    'boundary',
    'tank',
    'remediation',
    'building',
    'waste',
    'lake',
    'river',
    'spring',
    'dam',
    'sensor',
    'emitter',
]);

export const PRESET_CATEGORIES: Readonly<Record<string, string>> = Object.freeze({
    gac: 'gac',
    inventory: 'inventory',
    remediation: 'remediation',
    safety: 'safety',
    studies: 'studies',
    permit: 'permit',
    generic: 'generic',
});

export const VALID_SITE_SIZES: Readonly<string[]> = Object.freeze(['small', 'medium', 'large']);

export const VALID_CONTAMINATION_LEVELS: Readonly<string[]> = Object.freeze(['low', 'medium', 'high']);

export const VALID_REPORT_SECTION_TYPES: Readonly<string[]> = Object.freeze([
    'text',
    'image',
    'table',
    'text+image',
    'text+table',
]);

export const VALID_ORIGIN_SYSTEMS: Readonly<string[]> = Object.freeze(['UTM', 'SAD69', 'SIRGAS2000', 'WGS84']);

// ----------------------------------------------------------------
// ENUMS - Parametros conhecidos (subset de PARAMETER_RANGES)
// ----------------------------------------------------------------

export const KNOWN_PARAMETERS: Readonly<string[]> = Object.freeze([
    // BTEX / Hidrocarbonetos
    'benzene',
    'toluene',
    'ethylbenzene',
    'xylenes',
    'naphthalene',
    'tph',
    'mtbe',
    'btex',
    'voc',
    // Solventes clorados
    'tce',
    'pce',
    'dce_11',
    'dce_12',
    'vinyl_chloride',
    // Metais
    'lead',
    'iron',
    'manganese',
    'chromium',
    'cadmium',
    'nickel',
    'arsenic',
    'mercury',
    'copper',
    'zinc',
    // Hidrogeoquimica
    'pH',
    'conductivity',
    'redox',
    'dissolved_oxygen',
    'sulfate',
    'temperature',
    'water_level',
    'flow_rate',
    // GEE / Inventario
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
    'ghg_scope1',
    'ghg_scope2',
    // CAR / Rural
    'vegetation_cover_pct',
    'slope_degrees',
    'riparian_width_m',
    'soil_type',
    'land_use',
    // Saude ocupacional
    'noise_dba',
    'heat_ibutg',
    'vibration',
    'benzene_ppm',
    'toluene_ppm',
    'dust_mg_m3',
    'illuminance_lux',
    'ionizing_radiation',
    'noise_exposure',
    // Efluentes / Agua
    'effluent_flow',
    'bod',
    'cod',
    'tss',
    'turbidity',
    // Qualidade do ar
    'pm25',
    'pm10',
    'nox',
    'sox',
    // Residuos
    'waste_total',
    'waste_hazardous',
    'waste_recycled_pct',
    // Seguranca
    'frequency_rate',
    'severity_rate',
    'ltir',
    'near_miss',
    // Biodiversidade
    'species_count',
    'protected_area',
    'biodiversity_index',
    // Genericos
    'consumo_diesel_b14_L',
    'consumo_gas_natural_m3',
    'consumo_eletricidade_kWh',
    'consumo_gasolina_c27_L',
]);

// ----------------------------------------------------------------
// VALIDATION - Preset structure
// ----------------------------------------------------------------

/**
 * Validate a preset object.
 * Lanca Error se a estrutura for invalida.
 *
 * @param preset
 * @param opts
 * @param opts.strictParameters - rejeita parametros desconhecidos (default true)
 * @returns { valid: true } se valido
 * @throws {Error} se invalido
 */
export function validatePreset(
    preset: Record<string, any>,
    opts: { strictParameters?: boolean } = {},
): { valid: true } {
    const strictParameters = opts.strictParameters !== false;

    if (!preset || typeof preset !== 'object') {
        throw new Error('Preset must be a non-null object');
    }

    // id
    if (typeof preset.id !== 'string' || preset.id.trim().length === 0) {
        throw new Error('Preset id is required and must be a non-empty string');
    }
    if (!/^[a-z0-9_]+$/.test(preset.id)) {
        throw new Error(`Preset id must be snake_case alphanumeric: ${preset.id}`);
    }

    // nameKey
    if (typeof preset.nameKey !== 'string' || preset.nameKey.trim().length === 0) {
        throw new Error('Preset nameKey is required and must be a non-empty string');
    }

    // descriptionKey (optional but must be string if present)
    if (preset.descriptionKey !== undefined && typeof preset.descriptionKey !== 'string') {
        throw new Error('Preset descriptionKey must be a string when provided');
    }

    // category
    if (typeof preset.category !== 'string') {
        throw new Error('Preset category is required and must be a string');
    }
    if (!Object.values(PRESET_CATEGORIES).includes(preset.category)) {
        throw new Error(
            `Preset category must be one of ${Object.values(PRESET_CATEGORIES).join(', ')}: ${preset.category}`,
        );
    }

    // families
    if (!Array.isArray(preset.families) || preset.families.length === 0) {
        throw new Error('Preset families must be a non-empty array');
    }
    for (const family of preset.families) {
        if (!VALID_FAMILIES.includes(family)) {
            throw new Error(`Invalid family: ${family}. Valid families: ${VALID_FAMILIES.join(', ')}`);
        }
    }

    // parameters
    if (!Array.isArray(preset.parameters) || preset.parameters.length === 0) {
        throw new Error('Preset parameters must be a non-empty array');
    }
    if (strictParameters) {
        for (const param of preset.parameters) {
            if (!KNOWN_PARAMETERS.includes(param)) {
                throw new Error(`Unknown parameter: ${param}. Register in KNOWN_PARAMETERS or disable strict mode.`);
            }
        }
    }

    // generationOptions (optional, validate structure if present)
    if (preset.generationOptions !== undefined) {
        validateGenerationOptions(preset.generationOptions);
    }

    // thresholds (optional, validate structure if present)
    if (preset.thresholds !== undefined) {
        validateThresholds(preset.thresholds);
    }

    // defaultOrigin (optional)
    if (preset.defaultOrigin !== undefined) {
        validateDefaultOrigin(preset.defaultOrigin);
    }

    // reportSkeleton (optional)
    if (preset.reportSkeleton !== undefined) {
        validateReportSkeleton(preset.reportSkeleton);
    }

    // tags (optional)
    if (preset.tags !== undefined) {
        if (!Array.isArray(preset.tags)) {
            throw new Error('Preset tags must be an array');
        }
        for (const tag of preset.tags) {
            if (typeof tag !== 'string') {
                throw new Error('Each preset tag must be a string');
            }
        }
    }

    // icon (optional)
    if (preset.icon !== undefined && typeof preset.icon !== 'string') {
        throw new Error('Preset icon must be a string');
    }

    return { valid: true };
}

/**
 * Validate generationOptions sub-object.
 * @throws {Error}
 */
export function validateGenerationOptions(opts: Record<string, any>): void {
    if (!opts || typeof opts !== 'object') {
        throw new Error('generationOptions must be an object');
    }

    const numericFields = ['campaigns', 'wells', 'plumes', 'buildings'];
    for (const field of numericFields) {
        if (opts[field] !== undefined) {
            if (!Number.isInteger(opts[field]) || opts[field] < 0) {
                throw new Error(`generationOptions.${field} must be a non-negative integer`);
            }
        }
    }

    if (opts.siteSize !== undefined && !VALID_SITE_SIZES.includes(opts.siteSize)) {
        throw new Error(`generationOptions.siteSize must be one of ${VALID_SITE_SIZES.join(', ')}: ${opts.siteSize}`);
    }

    if (opts.contaminationLevel !== undefined && !VALID_CONTAMINATION_LEVELS.includes(opts.contaminationLevel)) {
        throw new Error(
            `generationOptions.contaminationLevel must be one of ${VALID_CONTAMINATION_LEVELS.join(', ')}: ${opts.contaminationLevel}`,
        );
    }

    if (opts.includeCosts !== undefined && typeof opts.includeCosts !== 'boolean') {
        throw new Error('generationOptions.includeCosts must be a boolean');
    }

    if (opts.density !== undefined && (typeof opts.density !== 'number' || opts.density < 0)) {
        throw new Error('generationOptions.density must be a non-negative number');
    }
}

/**
 * Validate thresholds sub-object.
 * @throws {Error}
 */
export function validateThresholds(thresholds: Record<string, any>): void {
    if (!thresholds || typeof thresholds !== 'object') {
        throw new Error('thresholds must be an object');
    }
    if (thresholds.reference !== undefined && typeof thresholds.reference !== 'string') {
        throw new Error('thresholds.reference must be a string');
    }
    if (thresholds.matrix !== undefined && typeof thresholds.matrix !== 'string') {
        throw new Error('thresholds.matrix must be a string');
    }
}

/**
 * Validate defaultOrigin sub-object.
 * @throws {Error}
 */
export function validateDefaultOrigin(origin: Record<string, any>): void {
    if (!origin || typeof origin !== 'object') {
        throw new Error('defaultOrigin must be an object');
    }
    if (origin.system !== undefined && !VALID_ORIGIN_SYSTEMS.includes(origin.system)) {
        throw new Error(`defaultOrigin.system must be one of ${VALID_ORIGIN_SYSTEMS.join(', ')}: ${origin.system}`);
    }
    const numericCoordFields = ['zone', 'easting', 'northing', 'elevation'];
    for (const field of numericCoordFields) {
        if (origin[field] !== undefined && typeof origin[field] !== 'number') {
            throw new Error(`defaultOrigin.${field} must be a number`);
        }
    }
    if (origin.hemisphere !== undefined && !['N', 'S'].includes(origin.hemisphere)) {
        throw new Error('defaultOrigin.hemisphere must be "N" or "S"');
    }
}

/**
 * Validate reportSkeleton sub-object.
 * @throws {Error}
 */
export function validateReportSkeleton(skeleton: Array<Record<string, any>>): void {
    if (!Array.isArray(skeleton)) {
        throw new Error('reportSkeleton must be an array');
    }
    for (const section of skeleton) {
        if (!section || typeof section !== 'object') {
            throw new Error('Each reportSkeleton section must be an object');
        }
        if (typeof section.title !== 'string' || section.title.trim().length === 0) {
            throw new Error('Each reportSkeleton section must have a non-empty title');
        }
        if (section.type !== undefined && !VALID_REPORT_SECTION_TYPES.includes(section.type)) {
            throw new Error(
                `reportSkeleton section type must be one of ${VALID_REPORT_SECTION_TYPES.join(', ')}: ${section.type}`,
            );
        }
    }
}
