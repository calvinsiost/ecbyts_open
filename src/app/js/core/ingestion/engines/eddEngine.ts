// NEEDS-MANUAL: build-break (dep cross-tree não-resolvível) — promover quando deps .ts
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   EDD ENGINE — Electronic Data Deliverable import pipeline
   Motor dedicado para ingestao de planilhas no formato EPA EDD.

   Detecta formato EDD (Location + Sample + TestResults), mapeia
   colunas para o modelo PDPLU, valida integridade referencial
   entre sheets e produz elementos + observacoes + campanha.

   Formatos suportados:
   - EPA Region 2/3/5 (sys_loc_code, sys_sample_code, chemical_name)
   - EDD-BR (locais, amostras, resultados)
   - EQuIS-compatible (LOC_ID, SYS_SAMPLE_CODE)
   - Single-sheet CSV with EDD columns

   SELF-CONTAINED: Detection, mapping, and validation are pure
   functions with no browser dependencies. The full pipeline
   (importEDD) uses lazy imports for parseFile (browser-only).

   Ref: EPA Electronic Data Deliverable Specification (epa.gov/edd)
   ================================================================ */

import { normalizeDate } from '../dateNormalizer.js';

type ParsedSpreadsheet = Record<string, any>;
type EDDDetectionResult = Record<string, any>;
type EDDMappedModel = Record<string, any>;
type EDDValidationResult = Record<string, any>;
type EDDImportResult = Record<string, any>;
type EDDSheet = { name?: string; headers?: string[]; rows?: Array<any>; rowCount?: number };
type EDDSheetMap = Record<string, EDDSheet>;
type EDDValidationIssue = Record<string, any>;

// ----------------------------------------------------------------
// SHEET NAME ALIASES - Subset from parser.js for EDD categories.
// Derived from EPA public domain documentation.
// ----------------------------------------------------------------

const EDD_SHEET_ALIASES: Record<string, string[]> = {
    locations: [
        'location_v1',
        'location_v3',
        'location_v4',
        'location',
        'locais',
        'locations',
        'sites',
        'pontos',
        'loc',
    ],
    samples: ['sample_v4', 'labsample_v1', 'fieldsample_v1', 'sample', 'amostras', 'samples', 'coletas'],
    results: [
        'testresultsqc_v4',
        'testresults_v1',
        'fieldresults_v1',
        'testes e resultados',
        'results',
        'resultados',
        'analises',
        'test results',
        'testresults',
        'testresultsqc',
    ],
};

// ----------------------------------------------------------------
// COLUMN ALIASES - Subset from mapper.js for EDD fields.
// Derived from EPA public domain EDD manuals.
// ----------------------------------------------------------------

const COLUMN_ALIASES: Record<string, string[]> = {
    elementName: [
        'sys_loc_code',
        'location_code',
        'loc_code',
        'loc_name',
        'site_id',
        'point_id',
        'station_id',
        'monitoringlocationidentifier',
        'locid',
        'sta_id',
        'loc_id',
        'location_id',
    ],
    latitude: ['latitude', 'y_coordinate', 'lat', 'coord_y', 'lat_dd', 'latitudemeasure', 'lat_y'],
    longitude: ['longitude', 'x_coordinate', 'long', 'lng', 'coord_x', 'lon_dd', 'longitudemeasure', 'long_x'],
    locType: ['loc_type', 'location_type', 'loc_type_code', 'point_type', 'loc_purpose', 'monitoringlocationtypename'],
    locDescription: ['loc_desc', 'location_description', 'description', 'remark', 'monitoringlocationdescriptiontext'],
    elevation: ['alt_x_coord', 'elevation', 'z_coordinate', 'altitude', 'verticalmeasure_measurevalue'],
    datum: ['coord_sys_desc', 'horizontal_datum', 'horz_datum_code', 'datum', 'coord_system'],
    sampleCode: [
        'sys_sample_code',
        'sample_code',
        'sample_id',
        'sample_name',
        'activityidentifier',
        'sampid',
        'sam_id',
        'samplecode',
    ],
    sampleDate: [
        'sample_start_date',
        'sample_date',
        'collection_date',
        'date',
        'sample_datetime',
        'activitystartdate',
        'samdate',
    ],
    matrix: ['sample_matrix_code', 'matrix', 'matrix_code', 'sample_matrix', 'activitymedianname'],
    sampleType: ['sample_type_code', 'sample_type', 'test_type', 'activitytypecode'],
    taskCode: ['task_code', 'sampling_reason', 'event_code', 'campaign_code', 'projectidentifier'],
    chemicalName: [
        'chemical_name',
        'analyte_name',
        'analyte_code',
        'analyte',
        'param_name',
        'parameter_name',
        'characteristicname',
        'param',
        'ana_type',
        'chemname',
        'chemcode',
    ],
    casNumber: ['cas_rn', 'cas_number', 'cas_no', 'cas', 'param_code', 'casregistryid'],
    resultValue: [
        'result_value',
        'result',
        'concentration',
        'value',
        'measured_value',
        'final_result',
        'resultmeasurevalue',
        'conc',
        'res_value',
        'result_total',
    ],
    resultUnit: [
        'result_unit',
        'unit',
        'result_unit_code',
        'units',
        'detection_limit_unit',
        'resultmeasure_measureunitcode',
    ],
    detectFlag: [
        'detect_flag',
        'detected',
        'det_flag',
        'detection_flag',
        'reportable_result',
        'resultdetectionconditiontext',
        'detflag',
    ],
    detectionLimit: [
        'reporting_detection_limit',
        'detection_limit',
        'method_detection_limit',
        'rdl',
        'mdl',
        'quantitation_limit',
        'lor_num',
    ],
    qualifier: [
        'lab_qualifiers',
        'lab_qualifier',
        'qualifier',
        'interpreted_qualifiers',
        'data_qualifier',
        'validator_qualifiers',
        'qualf',
        'res_qual',
    ],
    labName: ['lab_name_code', 'lab_code', 'laboratory', 'lab_name', 'laboratoryname'],
    method: [
        'lab_anl_method_name',
        'analytical_method',
        'analysis_method',
        'test_method',
        'analytic_method',
        'resultanalyticalmethodidentifier',
    ],
};

// ----------------------------------------------------------------
// LOC_TYPE MAP - EDD location types to ecbyts family IDs.
// From EPA EDD manuals + ABNT environmental terms (public domain).
// ----------------------------------------------------------------

const LOC_TYPE_MAP: Record<string, string> = {
    'monitoring well': 'well',
    mw: 'well',
    'pumping well': 'well',
    pw: 'well',
    'extraction well': 'well',
    piezometer: 'well',
    'soil boring': 'well',
    borehole: 'well',
    well: 'well',
    boring: 'well',
    probe: 'well',
    spring: 'spring',
    lake: 'lake',
    pond: 'lake',
    reservoir: 'lake',
    river: 'river',
    stream: 'river',
    creek: 'river',
    tank: 'tank',
    ust: 'tank',
    ast: 'tank',
    'storage tank': 'tank',
    building: 'building',
    structure: 'building',
    waste: 'waste',
    landfill: 'waste',
    disposal: 'waste',
    boundary: 'boundary',
    property: 'boundary',
    perimeter: 'boundary',
    'surface water': 'lake',
    sediment: 'lake',
    // PT-BR
    'poco de monitoramento': 'well',
    'poço de monitoramento': 'well',
    piezometro: 'well',
    piezômetro: 'well',
    sondagem: 'well',
    nascente: 'spring',
    lago: 'lake',
    lagoa: 'lake',
    rio: 'river',
    tanque: 'tank',
    limite: 'boundary',
};

// ----------------------------------------------------------------
// CAS NUMBER MAP - Common environmental contaminant CAS to param ID.
// ----------------------------------------------------------------

const CAS_TO_PARAM: Record<string, string> = {
    '71-43-2': 'benzene',
    '108-88-3': 'toluene',
    '100-41-4': 'ethylbenzene',
    '1330-20-7': 'xylenes',
    '7440-38-2': 'arsenic',
    '7440-43-9': 'cadmium',
    '7440-47-3': 'chromium',
    '7439-92-1': 'lead',
    '7439-97-6': 'mercury',
    '7440-50-8': 'copper',
    '7440-66-6': 'zinc',
    '7440-02-0': 'nickel',
    '91-20-3': 'naphthalene',
    '127-18-4': 'pce',
    '79-01-6': 'tce',
    '75-01-4': 'vinyl_chloride',
};

// ----------------------------------------------------------------
// UNIT MAP - EDD unit strings to ecbyts unit IDs.
// ----------------------------------------------------------------

const UNIT_MAP: Record<string, string> = {
    'ug/l': 'ug_L',
    'µg/l': 'ug_L',
    'ug/L': 'ug_L',
    'mg/l': 'mg_L',
    'mg/L': 'mg_L',
    'mg/kg': 'mg_kg',
    'ug/kg': 'ug_kg',
    ppm: 'ppm',
    ppb: 'ppb',
    ph: 'pH',
    'us/cm': 'uS_cm',
    'µs/cm': 'uS_cm',
    m: 'm',
    cm: 'cm',
    ft: 'ft',
    '%': 'percent',
    ntu: 'NTU',
};

// ----------------------------------------------------------------
// FIELD GROUPS
// ----------------------------------------------------------------

const LOCATION_FIELDS = ['elementName', 'latitude', 'longitude', 'locType', 'locDescription', 'elevation', 'datum'];
const SAMPLE_FIELDS = ['sampleCode', 'sampleDate', 'matrix', 'sampleType', 'taskCode', 'elementName'];
const RESULT_FIELDS = [
    'sampleCode',
    'chemicalName',
    'casNumber',
    'resultValue',
    'resultUnit',
    'detectFlag',
    'detectionLimit',
    'qualifier',
    'labName',
    'method',
];

/** Minimum confidence threshold for auto-detection */
const MIN_CONFIDENCE = 0.6;

// ----------------------------------------------------------------
// DETECTION
// ----------------------------------------------------------------

/**
 * Detects whether a parsed spreadsheet is in EDD format.
 * Checks for the presence of Location + Sample/Results sheets
 * and verifies key column names match known EDD aliases.
 *
 * @param parsed - Output from parseFile()
 * @returns Detection result with confidence
 */
function _buildSheetMap(sheets: Array<any>, evidence: string[]): EDDSheetMap {
    const sheetMap: EDDSheetMap = {};
    for (const sheet of sheets) {
        const category = _classifySheetName(sheet.name);
        if (category) {
            sheetMap[category] = {
                name: sheet.name,
                headers: sheet.headers,
                rows: sheet.rows || [],
                rowCount: sheet.rows?.length || 0,
            };
            evidence.push(`Sheet "${sheet.name}" classified as ${category}`);
        }
    }
    return sheetMap;
}

function _calculateDetectionConfidence(sheetMap: EDDSheetMap, keyColumnsFound: number): number {
    let confidence = 0.4;
    if (sheetMap.locations) confidence += 0.2;
    if (sheetMap.results) confidence += 0.2;
    if (sheetMap.samples) confidence += 0.15;
    confidence += keyColumnsFound * 0.05;
    return Math.min(confidence, 1.0);
}

export function detectEDD(parsed: ParsedSpreadsheet): EDDDetectionResult {
    if (!parsed || !parsed.sheets || !parsed.sheets.length) {
        return _noMatch('No sheets found in parsed data');
    }

    const evidence: string[] = [];
    const sheetMap = _buildSheetMap(parsed.sheets, evidence);

    const hasLocations = !!sheetMap.locations;
    const hasResults = !!sheetMap.results;

    // Single-sheet CSV fallback: check headers
    if (!hasLocations && !hasResults && parsed.sheets.length === 1) {
        return _detectSingleSheet(parsed.sheets[0]);
    }

    if (!hasLocations && !hasResults) {
        return _noMatch('Missing required sheets: locations and results');
    }

    const keyColumnsFound = _checkKeyColumns(sheetMap);
    const confidence = _calculateDetectionConfidence(sheetMap, keyColumnsFound);
    const version = _detectVersion(parsed);

    return {
        isEDD: confidence >= MIN_CONFIDENCE,
        confidence,
        version,
        evidence,
        sheets: sheetMap,
    };
}

// ----------------------------------------------------------------
// MAPPING
// ----------------------------------------------------------------

/**
 * Maps EDD columns to ecbyts PDPLU model structure.
 * Produces arrays of elements, samples, and observations
 * ready for ingestion.
 *
 * @param parsed - Output from parseFile()
 * @param options - Mapping options
 * @param options.campaignName - Override campaign name
 * @param options.dateLocale - Date parsing locale
 * @param options.defaultFamily - Default element family
 * @returns Mapped model with elements, observations, campaign
 */
export function mapEDDToModel(
    parsed: ParsedSpreadsheet,
    options: { campaignName?: string; dateLocale?: string; defaultFamily?: string } = {},
): EDDMappedModel {
    const { campaignName, dateLocale = 'dd/mm', defaultFamily = 'well' } = options;

    // Classify sheets using own detection
    const detection = detectEDD(parsed);
    const classified = detection.sheets || {};

    const elements = _mapLocations(classified.locations, defaultFamily);
    const samples = _mapSamples(classified.samples, dateLocale);
    const observations = _mapResults(classified.results, samples);
    const campaign = _buildCampaign(samples, campaignName);

    return {
        elements,
        observations,
        campaign,
        samples,
        stats: {
            elementCount: elements.length,
            observationCount: observations.length,
            sampleCount: samples.length,
            unmappedChemicals: observations.filter((o) => !o.parameterId).length,
            unmappedUnits: observations.filter((o) => !o.unitId).length,
        },
    };
}

// ----------------------------------------------------------------
// VALIDATION
// ----------------------------------------------------------------

/**
 * Validates referential integrity across EDD sheets.
 * Checks that samples reference valid locations and
 * results reference valid samples.
 *
 * @param mapped - Output from mapEDDToModel()
 * @returns Validation result with errors/warnings
 */
export function validateEDDIntegrity(mapped: EDDMappedModel): EDDValidationResult {
    const errors: EDDValidationIssue[] = [];
    const warnings: EDDValidationIssue[] = [];

    if (!mapped) {
        errors.push({ code: 'INVALID_INPUT', message: 'Mapped model is null or undefined' });
        return { valid: false, errors, warnings };
    }

    const elementIds = new Set((mapped.elements || []).map((e: any) => e.id) as Array<any>);
    const sampleCodes = new Set((mapped.samples || []).map((s: any) => s.code) as Array<any>);

    _validateSampleLocations(mapped.samples, elementIds, errors, warnings);
    _validateObservationSamples(mapped.observations, sampleCodes, errors, warnings);
    _validateDuplicateElements(mapped.elements, warnings);
    _validateResultValues(mapped.observations, warnings);
    _validateCampaign(mapped.campaign, errors);

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        summary: {
            errorCount: errors.length,
            warningCount: warnings.length,
            orphanSamples: errors.filter((e) => e.code === 'ORPHAN_SAMPLE').length,
            orphanResults: errors.filter((e) => e.code === 'ORPHAN_RESULT').length,
        },
    };
}

// ----------------------------------------------------------------
// FULL PIPELINE (browser-only - uses lazy imports)
// ----------------------------------------------------------------

/**
 * Full EDD import pipeline: parse -> detect -> map -> validate -> return.
 * Does NOT call ingest() - returns the mapped and validated model
 * for the wizard to review before committing.
 *
 * BROWSER ONLY: Uses lazy import of parseFile which requires SheetJS.
 *
 * @param file - File from input[type=file]
 * @param options - Import options
 * @param options.campaignName - Override campaign name
 * @param options.dateLocale - Date locale
 * @param options.defaultFamily - Default family
 * @param options.onProgress - Progress callback(phase, pct)
 * @returns Full import result
 */
export async function importEDD(
    file: File,
    options: {
        campaignName?: string;
        dateLocale?: string;
        defaultFamily?: string;
        onProgress?: Function;
    } = {},
): Promise<EDDImportResult> {
    const { onProgress } = options;

    // Lazy import - parseFile requires browser (SheetJS CDN)
    // @ts-ignore
    const { parseFile } = await import('../parser.js');

    // Phase 1: Parse
    if (onProgress) onProgress('parsing', 0);
    const parsed = await parseFile(file);
    if (onProgress) onProgress('parsing', 100);

    // Phase 2: Detect
    if (onProgress) onProgress('detecting', 0);
    const detection = detectEDD(parsed);
    if (!detection.isEDD) {
        return {
            success: false,
            phase: 'detection',
            error: 'File is not a recognized EDD format',
            detection,
            mapped: null,
            validation: null,
        };
    }
    if (onProgress) onProgress('detecting', 100);

    // Phase 3: Map
    if (onProgress) onProgress('mapping', 0);
    const mapped = mapEDDToModel(parsed, options);
    if (onProgress) onProgress('mapping', 100);

    // Phase 4: Validate
    if (onProgress) onProgress('validating', 0);
    const validation = validateEDDIntegrity(mapped);
    if (onProgress) onProgress('validating', 100);

    return {
        success: validation.valid,
        phase: 'complete',
        error: validation.valid ? null : 'Referential integrity errors found',
        detection,
        mapped,
        validation,
    };
}

// ================================================================
// INLINE RESOLVERS - Self-contained, no browser dependencies
// ================================================================

/**
 * Resolves EDD location type to ecbyts family ID.
 * @param eddType
 */
function _resolveLocType(eddType: string): string | null {
    if (!eddType) return null;
    return LOC_TYPE_MAP[eddType.toLowerCase().trim()] || null;
}

/**
 * Resolves chemical name or CAS number to ecbyts parameter ID.
 * @param name
 * @param cas
 */
function _resolveChemical(name: string, cas: string): string | null {
    if (cas && CAS_TO_PARAM[cas]) return CAS_TO_PARAM[cas];
    if (name) {
        const normalized = name.toLowerCase().trim();
        // Check if name matches a known CAS value (parameter ID)
        for (const paramId of Object.values(CAS_TO_PARAM)) {
            if (paramId === normalized) return paramId;
        }
    }
    return null;
}

/**
 * Resolves EDD unit string to ecbyts unit ID.
 * @param eddUnit
 */
function _resolveUnit(eddUnit: string): string | null {
    if (!eddUnit) return null;
    const normalized = eddUnit.toLowerCase().trim();
    return UNIT_MAP[normalized] || UNIT_MAP[eddUnit.trim()] || null;
}

// ================================================================
// PRIVATE HELPERS
// ================================================================

/**
 * Returns a negative detection result.
 * @param reason
 */
function _noMatch(reason: string): EDDDetectionResult {
    return { isEDD: false, confidence: 0, version: null, evidence: [reason], sheets: {} };
}

/**
 * Classifies a sheet name into an EDD category.
 * @param name
 */
function _classifySheetName(name: string): string | null {
    const normalized = name
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    for (const [category, aliases] of Object.entries(EDD_SHEET_ALIASES)) {
        if (aliases.some((alias) => normalized === alias || normalized.includes(alias))) {
            return category;
        }
    }
    return null;
}

/**
 * Detects EDD from a single-sheet CSV by checking key columns.
 * @param sheet
 */
function _detectSingleSheet(sheet: EDDSheet): EDDDetectionResult {
    const headers = (sheet.headers || []).map((h) => h.toLowerCase().trim());
    const eddKeys = ['sys_loc_code', 'sys_sample_code', 'chemical_name', 'result_value'];
    const found = eddKeys.filter((k) => headers.includes(k));

    if (found.length >= 2) {
        return {
            isEDD: true,
            confidence: 0.5 + found.length * 0.1,
            version: null,
            evidence: [`Single-sheet CSV with EDD columns: ${found.join(', ')}`],
            sheets: {
                results: {
                    name: sheet.name,
                    headers: sheet.headers,
                    rows: sheet.rows || [],
                    rowCount: sheet.rows?.length || 0,
                },
            },
        };
    }
    return _noMatch('Single sheet does not contain EDD key columns');
}

/**
 * Counts key EDD columns across classified sheets.
 * @param sheetMap
 */
function _checkKeyColumns(sheetMap: EDDSheetMap): number {
    let count = 0;
    const keys = ['elementName', 'sampleCode', 'chemicalName', 'resultValue', 'sampleDate'];
    for (const category of Object.values(sheetMap)) {
        if (!category.headers) continue;
        const headers = category.headers.map((h) => h.toLowerCase().trim());
        for (const field of keys) {
            const aliases = COLUMN_ALIASES[field] || [];
            if (headers.some((h) => aliases.includes(h))) count++;
        }
    }
    return Math.min(count, 10);
}

/**
 * Detects EDD version from sheet naming patterns.
 * @param parsed
 */
function _detectVersion(parsed: ParsedSpreadsheet): string | null {
    for (const sheet of parsed.sheets) {
        const match = sheet.name.toLowerCase().match(/_v(\d+)/);
        if (match) return match[1];
    }
    return null;
}

/**
 * Resolves a header to a target PDPLU field.
 * @param header
 * @param allowedFields
 */
function _resolveHeader(header: string, allowedFields: string[]): string | null {
    const normalized = header.toLowerCase().trim();
    for (const field of allowedFields) {
        const aliases = COLUMN_ALIASES[field] || [];
        if (aliases.includes(normalized)) return field;
    }
    return null;
}

/**
 * Builds column index: { targetField -> columnIndex }.
 * @param headers
 * @param allowedFields
 */
function _buildColumnIndex(headers: string[], allowedFields: string[]): Record<string, number> {
    const index: Record<string, number> = {};
    for (let i = 0; i < headers.length; i++) {
        const field = _resolveHeader(headers[i] as string, allowedFields);
        if (field && !(field in index)) index[field] = i;
    }
    return index;
}

/**
 * Extracts value from row by field using column index.
 * @param row
 * @param colIndex
 * @param number>
 */
function _getField(row: Array<any>, colIndex: Record<string, number>, field: string): any {
    const idx = colIndex[field];
    if (idx == null) return null;
    const val = row[idx];
    return val != null ? val : null;
}

// ----------------------------------------------------------------
// MAPPING HELPERS
// ----------------------------------------------------------------

/**
 * Maps Location sheet rows to element objects.
 * @param locationSheet
 * @param defaultFamily
 */
function _mapLocations(locationSheet: EDDSheet, defaultFamily: string): Array<any> {
    if (!locationSheet || !locationSheet.rows) return [];

    const headers = locationSheet.headers || [];
    const colIndex = _buildColumnIndex(headers, LOCATION_FIELDS);
    const elements = [];
    const seen = new Set();

    for (const row of locationSheet.rows) {
        const rowArr = _rowToArray(row, headers);
        const id = _cleanString(_getField(rowArr, colIndex, 'elementName'));
        if (!id || seen.has(id)) continue;
        seen.add(id);

        const lat = _parseNumber(_getField(rowArr, colIndex, 'latitude'));
        const lon = _parseNumber(_getField(rowArr, colIndex, 'longitude'));
        const elev = _parseNumber(_getField(rowArr, colIndex, 'elevation'));
        const locType = _cleanString(_getField(rowArr, colIndex, 'locType'));
        const desc = _cleanString(_getField(rowArr, colIndex, 'locDescription'));
        const family = _resolveLocType(locType || '') || defaultFamily;

        elements.push({
            id,
            name: id,
            familyId: family,
            description: desc || '',
            position: { x: lon || 0, y: elev || 0, z: lat || 0 },
            source: 'edd-import',
        });
    }
    return elements;
}

/**
 * Maps Sample sheet rows to sample objects.
 * @param sampleSheet
 * @param dateLocale
 */
function _mapSamples(sampleSheet: EDDSheet, dateLocale: string): Array<any> {
    if (!sampleSheet || !sampleSheet.rows) return [];

    const headers = sampleSheet.headers || [];
    const colIndex = _buildColumnIndex(headers, SAMPLE_FIELDS);
    const samples = [];

    for (const row of sampleSheet.rows) {
        const rowArr = _rowToArray(row, headers);
        const code = _cleanString(_getField(rowArr, colIndex, 'sampleCode'));
        if (!code) continue;

        const rawDate = _getField(rowArr, colIndex, 'sampleDate');
        const date = normalizeDate(rawDate, dateLocale as any);
        const locationId = _cleanString(_getField(rowArr, colIndex, 'elementName'));
        const matrix = _cleanString(_getField(rowArr, colIndex, 'matrix'));

        samples.push({ code, date, locationId: locationId || null, matrix: matrix || null });
    }
    return samples;
}

/**
 * Maps TestResults sheet rows to observation objects.
 * @param rowArr
 * @param colIndex
 */
function _buildObservation(
    rowArr: Array<any>,
    colIndex: Record<string, number>,
    sampleLookup: Map<string, any>,
): any | null {
    const sampleCode = _cleanString(_getField(rowArr, colIndex, 'sampleCode'));
    const chemName = _cleanString(_getField(rowArr, colIndex, 'chemicalName'));
    const casNumber = _cleanString(_getField(rowArr, colIndex, 'casNumber'));

    if (!chemName && !casNumber) return null;

    const rawValue = _getField(rowArr, colIndex, 'resultValue');
    const rawUnit = _cleanString(_getField(rowArr, colIndex, 'resultUnit'));
    const detectFlag = _cleanString(_getField(rowArr, colIndex, 'detectFlag'));
    const qualifier = _cleanString(_getField(rowArr, colIndex, 'qualifier'));
    const sample = sampleLookup.get(sampleCode || '');

    return {
        sampleCode: sampleCode || null,
        locationId: sample?.locationId || null,
        date: sample?.date || null,
        parameterId: _resolveChemical(chemName || '', casNumber || ''),
        parameterName: chemName || null,
        casNumber: casNumber || null,
        value: _parseNumber(rawValue),
        unitId: _resolveUnit(rawUnit || ''),
        rawUnit: rawUnit || null,
        qualifier: _buildQualifier(detectFlag, qualifier),
        source: 'edd-import',
    };
}

function _mapResults(resultsSheet: EDDSheet, samples: Array<any>): Array<any> {
    if (!resultsSheet || !resultsSheet.rows) return [];

    const headers = resultsSheet.headers || [];
    const colIndex = _buildColumnIndex(headers, RESULT_FIELDS);
    const sampleLookup = _buildSampleLookup(samples);
    const observations = [];

    for (const row of resultsSheet.rows) {
        const rowArr = _rowToArray(row, headers);
        const obs = _buildObservation(rowArr, colIndex, sampleLookup);
        if (obs) observations.push(obs);
    }
    return observations;
}

/**
 * Builds campaign from mapped samples.
 * @param samples
 * @param nameOverride?
 */
function _buildCampaign(samples: Array<any>, nameOverride?: string): object {
    const dates = samples
        .map((s) => s.date)
        .filter(Boolean)
        .sort();
    const earliest = dates[0] || null;
    const latest = dates[dates.length - 1] || null;

    return {
        name: nameOverride || `EDD Import ${earliest || new Date().toISOString().slice(0, 10)}`,
        date: earliest,
        dateEnd: latest !== earliest ? latest : null,
        sampleCount: samples.length,
        source: 'edd-import',
    };
}

/**
 * @param samples
 */
function _buildSampleLookup(samples: Array<any>): Map<string, any> {
    const map = new Map();
    for (const s of samples || []) {
        if (s.code) map.set(s.code, s);
    }
    return map;
}

/** @param detectFlag @param qualifier */
function _buildQualifier(detectFlag: string | null, qualifier: string | null): string | null {
    const parts = [];
    if (detectFlag) parts.push(detectFlag);
    if (qualifier) parts.push(qualifier);
    return parts.length ? parts.join('; ') : null;
}

// ----------------------------------------------------------------
// VALIDATION HELPERS
// ----------------------------------------------------------------

/**
 * @param samples
 * @param elementIds
 * @param errors
 * @param warnings
 */
function _validateSampleLocations(
    samples: Array<any>,
    elementIds: Set<any>,
    errors: EDDValidationIssue[],
    warnings: EDDValidationIssue[],
) {
    if (!samples) return;
    for (const sample of samples) {
        if (sample.locationId && !elementIds.has(sample.locationId)) {
            errors.push({
                code: 'ORPHAN_SAMPLE',
                message: `Sample "${sample.code}" references unknown location "${sample.locationId}"`,
                sampleCode: sample.code,
                locationId: sample.locationId,
            });
        }
        if (!sample.locationId) {
            warnings.push({
                code: 'SAMPLE_NO_LOCATION',
                message: `Sample "${sample.code}" has no location reference`,
                sampleCode: sample.code,
            });
        }
    }
}

/**
 * @param observations
 * @param sampleCodes
 * @param errors
 * @param _warnings
 */
function _validateObservationSamples(
    observations: Array<any>,
    sampleCodes: Set<any>,
    errors: EDDValidationIssue[],
    _warnings: EDDValidationIssue[],
) {
    if (!observations) return;
    for (const obs of observations) {
        if (obs.sampleCode && !sampleCodes.has(obs.sampleCode)) {
            errors.push({
                code: 'ORPHAN_RESULT',
                message: `Result for "${obs.parameterName || obs.parameterId}" references unknown sample "${obs.sampleCode}"`,
                sampleCode: obs.sampleCode,
            });
        }
    }
}

/** @param elements @param warnings */
function _validateDuplicateElements(elements: Array<any>, warnings: EDDValidationIssue[]) {
    if (!elements) return;
    const seen = new Set();
    for (const el of elements) {
        if (seen.has(el.id)) {
            warnings.push({
                code: 'DUPLICATE_ELEMENT',
                message: `Duplicate location ID: "${el.id}"`,
                elementId: el.id,
            });
        }
        seen.add(el.id);
    }
}

/** @param observations @param warnings */
function _validateResultValues(observations: Array<any>, warnings: EDDValidationIssue[]) {
    if (!observations) return;
    for (const obs of observations) {
        if (obs.value === null && obs.parameterName) {
            warnings.push({
                code: 'NON_NUMERIC_VALUE',
                message: `Non-numeric or missing value for "${obs.parameterName}" in sample "${obs.sampleCode}"`,
                sampleCode: obs.sampleCode,
                parameterName: obs.parameterName,
            });
        }
    }
}

/** @param campaign @param errors */
function _validateCampaign(campaign: Record<string, any> | null | undefined, errors: EDDValidationIssue[]) {
    if (!campaign) {
        errors.push({ code: 'NO_CAMPAIGN', message: 'No campaign could be built from samples' });
        return;
    }
    if (!campaign.date) {
        errors.push({ code: 'CAMPAIGN_NO_DATE', message: 'Campaign has no valid date from samples' });
    }
}

// ----------------------------------------------------------------
// UTILITY HELPERS
// ----------------------------------------------------------------

/** @param row @param headers */
function _rowToArray(row: any, headers: string[]): Array<any> {
    if (Array.isArray(row)) return row;
    return headers.map((h) => row[h] ?? null);
}

/** @param val */
function _parseNumber(val: any): number | null {
    if (val == null) return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    const str = String(val).trim().replace(/^[<>]/, '').replace(',', '.');
    const num = parseFloat(str);
    return isNaN(num) ? null : num;
}

/** @param val */
function _cleanString(val: any): string | null {
    if (val == null) return null;
    const str = String(val).trim();
    return str.length > 0 ? str : null;
}

// Export constants for testing
export { COLUMN_ALIASES as EDD_COLUMN_ALIASES, LOC_TYPE_MAP, CAS_TO_PARAM, UNIT_MAP, EDD_SHEET_ALIASES };
