// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// @ts-check
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
   SMART IMPORT — AI-powered data normalization
   ================================================================

   Usa LLM para mapear colunas de arquivos desconhecidos para o
   schema ecbyts (elements, observations, campaigns).

   FLUXO:
   1. Usuario faz upload de CSV/JSON
   2. Sistema detecta colunas e mostra preview (5 linhas)
   3. LLM analisa colunas e sugere mapeamentos
   4. Usuario revisa/ajusta mapeamentos
   5. Sistema normaliza e importa

   ================================================================ */
import { sendMessage } from '../llm/client.js';
import { CONFIG } from '../../config.js';
import { getEnabledFamilies, getFamilyName } from '../elements/families.js';
import { ensureSAO, getActiveParameters, isSAOActive } from '../sao/index.js';
import { parseCSVLine } from './formats/csv.js';
/**
 * @typedef {{columns: string[], sampleRows: Array<Record<string, string>>, separator: string|null, rowCount: number, fileType: string}} SmartImportStructure
 * @typedef {{target: string, confidence?: number, notes?: string}} SmartImportColumnMapping
 * @typedef {{fileType: string, columnMappings: Record<string, string|SmartImportColumnMapping>, normalizations?: Array<{column: string, type?: string, from?: string, to?: string}>, warnings?: string[], overallConfidence?: number}} SmartImportMapping
 * @typedef {{elements: Array<Record<string, any>>, observations: Array<Record<string, any>>, campaigns: Array<Record<string, any>>, warnings: string[]}} SmartImportMappedData
 * @typedef {{id: string, name: string, required: boolean}} TargetField
 */
// ================================================================
// FILE ANALYSIS - Parse CSV/JSON and detect structure
// Analisa a estrutura do arquivo (colunas, separador, etc.)
// ================================================================
/**
 * Analyze file structure and extract column info.
 * Analisa o arquivo e extrai informacoes sobre colunas e dados.
 *
 * @param {string} content - File content as string
 * @param {string} filename - Original filename
 * @returns {SmartImportStructure} { columns, sampleRows, separator, rowCount, fileType }
 */
export function analyzeFileStructure(content: any, filename: any) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (ext === 'json') {
        return analyzeJSON(content);
    }
    // Default: CSV/TSV
    return analyzeCSV(content);
}
/**
 * Analyze CSV file structure.
 * Detecta separador, extrai colunas e primeiras 5 linhas.
 * @param {string} content
 * @returns {SmartImportStructure}
 */
function analyzeCSV(content: any) {
    // Auto-detect separator
    const firstLine = content.split('\n')[0] || '';
    let separator = ',';
    if (firstLine.split('\t').length > firstLine.split(',').length) {
        separator = '\t';
    }
    else if (firstLine.split(';').length > firstLine.split(',').length) {
        separator = ';';
    }
    const lines = content.split('\n').filter((l: any) => l.trim());
    if (lines.length < 2) {
        throw new Error('File must have at least a header and one data row');
    }
    const columns = parseCSVLine(lines[0], separator);
    /** @type {Array<Record<string, string>>} */
    const sampleRows = [];
    for (let i = 1; i < Math.min(lines.length, 6); i++) {
        const values = parseCSVLine(lines[i], separator);
        /** @type {Record<string, string>} */
        const row: any = {};
        columns.forEach((col: any, idx: any) => {
            row[col] = values[idx] || '';
        });
        sampleRows.push(row);
    }
    return {
        columns,
        sampleRows,
        separator,
        rowCount: lines.length - 1,
        fileType: 'csv',
    };
}
/**
 * Analyze JSON file structure.
 * Detecta campos de objetos JSON (array de objetos).
 * @param {string} content
 * @returns {SmartImportStructure}
 */
function analyzeJSON(content: any) {
    const data = (JSON.parse(content)) as any;
    /** @type {Array<Record<string, any>>} */
    let rows;
    if (Array.isArray(data)) {
        rows = data;
    }
    else if (data.data && Array.isArray(data.data)) {
        rows = data.data;
    }
    else if (data.observations && Array.isArray(data.observations)) {
        rows = data.observations;
    }
    else if (data.elements && Array.isArray(data.elements)) {
        rows = data.elements;
    }
    else {
        throw new Error('JSON must contain an array of objects');
    }
    if (rows.length === 0) {
        throw new Error('JSON array is empty');
    }
    // Extract all unique keys
    /** @type {Set<string>} */
    const columnSet = new Set();
    rows.forEach((row: any) => {
        if (typeof row === 'object' && row !== null) {
            Object.keys(row).forEach((k: any) => columnSet.add(k));
        }
    });
    const columns = Array.from(columnSet);
    const sampleRows = rows.slice(0, 5).map((row: any) => {
        /** @type {Record<string, string>} */
        const obj: any = {};
        columns.forEach((col: any) => {
            obj[col] = row[col] !== undefined ? String(row[col]) : '';
        });
        return obj;
    });
    return {
        columns,
        sampleRows,
        separator: null,
        rowCount: rows.length,
        fileType: 'json',
    };
}
// ================================================================
// AI MAPPING - Use LLM to suggest column mappings
// Usa IA para sugerir mapeamentos de colunas
// ================================================================
/**
 * Build the LLM prompt for column mapping.
 * Constroi o prompt para o LLM mapear colunas ao schema ecbyts.
 *
 * @param {string[]} columns - Column names from file
 * @param {Array<Record<string, string>>} sampleRows - First 5 data rows
 * @returns {string} System prompt
 */
function generateMappingPrompt(columns: any, sampleRows: any) {
    // Build parameter list
    // Use SAO-filtered parameters when active, otherwise first 30
    const paramSource = isSAOActive() ? getActiveParameters() : CONFIG.PARAMETERS;
    const params = paramSource
        .slice(0, 60)
        .map((/** @type {any} */ p) => `${p.id} (${p.name})`)
        .join(', ');
    // Build unit list
    const units = CONFIG.UNITS.slice(0, 30)
        .map((u: any) => `${u.id} (${u.symbol})`)
        .join(', ');
    // Build family list
    const families = getEnabledFamilies()
        .map((f: any) => `${f} (${getFamilyName(f)})`)
        .join(', ');
    return `You are a data mapping expert for environmental monitoring systems.

ECBYTS SCHEMA:
- Elements: id, family (${families}), name, coordinates (easting, northing, elevation)
- Observations: elementId, parameterId, value, unitId, date, campaignId
  Parameters: ${params}
  Units: ${units}
- Campaigns: id, name, startDate, endDate

FILE COLUMNS: ${JSON.stringify(columns)}

SAMPLE DATA (first rows):
${JSON.stringify(sampleRows, null, 2)}

TASK: Analyze the columns and sample data. Map each column to the most appropriate ecbyts field.

Return ONLY valid JSON:
{
    "fileType": "observations" | "elements" | "campaigns",
    "columnMappings": {
        "source_column_name": {
            "target": "ecbyts_field_path",
            "confidence": 0.0-1.0,
            "notes": "explanation"
        }
    },
    "normalizations": [
        { "column": "name", "type": "unit_conversion|date_format|value_transform", "from": "ppb", "to": "ug_L" }
    ],
    "warnings": ["any issues or unmapped columns"],
    "overallConfidence": 0.0-1.0
}

Rules:
- Map column names by semantic meaning, not exact match
- Detect units embedded in column names (e.g. "Benzene (ppb)")
- Detect date formats and suggest normalization
- "elementId" / "well" / "point" / "station" columns map to element reference
- Coordinate columns (lat/lon/UTM) map to position fields
- Set confidence 0.0-1.0 based on mapping certainty
- List unmapped columns in warnings`;
}
/**
 * Request AI mapping for file columns.
 * Chama o LLM para sugerir mapeamentos de colunas.
 *
 * @param {string[]} columns - Column names
 * @param {Array<Record<string, string>>} sampleRows - Sample data rows
 * @returns {Promise<SmartImportMapping>} Mapping result
 */
export async function requestAIMapping(columns: any, sampleRows: any) {
    // LOADING-PERF GAP-2: SAO é lazy. Garante init para que o prompt liste os
    // parâmetros SAO-filtrados quando houver cenário ativo. Idempotente.
    await ensureSAO().catch((e) => console.debug('[smartImport] ensureSAO best-effort:', e?.message || e));
    const systemPrompt = generateMappingPrompt(columns, sampleRows);
    const userMessage = 'Analyze these columns and return the mapping JSON.';
    const response = await sendMessage(systemPrompt, userMessage, {
        maxTokens: 2000,
        temperature: 0.1,
    });
    // Parse JSON from response
    const content = response.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('AI did not return valid JSON mapping');
    }
    return /** @type {SmartImportMapping} */ (JSON.parse(jsonMatch[0]));
}
// ================================================================
// DATA TRANSFORMATION - Apply mapping to raw data
// Aplica o mapeamento aos dados brutos
// ================================================================
/**
 * Apply mapping to transform raw data into ecbyts format.
 * Transforma dados brutos usando o mapeamento da IA.
 *
 * @param {string} content - Raw file content
 * @param {SmartImportStructure} structure - Result from analyzeFileStructure
 * @param {SmartImportMapping} mapping - Result from requestAIMapping
 * @returns {SmartImportMappedData} { elements: [], observations: [], campaigns: [], warnings: [] }
 */
export function applyMapping(content: any, structure: any, mapping: any) {
    /** @type {SmartImportMappedData} */
    const result: any = {
        elements: [] as any[],
        observations: [] as any[],
        campaigns: [] as any[],
        warnings: [...(mapping.warnings || [])],
    };
    // Parse all rows
    /** @type {Array<Record<string, any>>} */
    let allRows;
    if (structure.fileType === 'json') {
        const data = (JSON.parse(content)) as any;
        allRows = Array.isArray(data) ? data : data.data || data.observations || data.elements || [];
    }
    else {
        const lines = content.split('\n').filter((l: any) => l.trim());
        const headers = parseCSVLine(lines[0], structure.separator || ',');
        allRows = [];
        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i], structure.separator || ',');
            /** @type {Record<string, string>} */
            const row: any = {};
            headers.forEach((h: any, idx: any) => {
                row[h] = values[idx] || '';
            });
            allRows.push(row);
        }
    }
    // Transform each row using mapping
    for (const row of allRows) {
        try {
            const transformed = transformRow(row, mapping);
            if (mapping.fileType === 'observations') {
                result.observations.push(transformed);
            }
            else if (mapping.fileType === 'elements') {
                result.elements.push(transformed);
            }
            else if (mapping.fileType === 'campaigns') {
                result.campaigns.push(transformed);
            }
        }
        catch (e: any) {
            result.warnings.push(`Row skipped: ${ /** @type {any} */(e).message}`);
        }
    }
    return result;
}
/**
 * Transform a single row using the column mapping.
 * Transforma uma linha usando o mapeamento de colunas.
 * @param {Record<string, any>} row
 * @param {SmartImportMapping} mapping
 * @returns {Record<string, any>}
 */
function transformRow(row: any, mapping: any) {
    /** @type {Record<string, any>} */
    const result: any = {};
    for (const [sourceCol, mapInfo] of Object.entries(mapping.columnMappings)) {
        const value = row[sourceCol];
        if (value === undefined || value === '')
            continue;
        const target = typeof mapInfo === "string" ? mapInfo : (mapInfo as any).target;
        if (!target || target === 'ignore' || target === 'unmapped')
            continue;
        // Handle compound targets like "parameterId=benzene"
        if (target.includes('=')) {
            const [field, fixedValue] = target.split('=');
            result[field] = fixedValue;
            // Also set the value if it's a parameter mapping
            if (field === 'parameterId') {
                result.value = parseFloat(value) || value;
            }
        }
        else {
            // Apply normalizations
            const normalization = (mapping.normalizations || []).find((n: any) => n.column === sourceCol);
            result[target] = normalizeValue(value, target, normalization);
        }
    }
    return result;
}
/**
 * Normalize a single value based on target field type.
 * Normaliza um valor com base no tipo do campo de destino.
 * @param {any} value
 * @param {string} targetField
 * @param {any} _normalization
 * @returns {string|number}
 */
function normalizeValue(value: any, targetField: any, _normalization: any) {
    // Date fields
    if (targetField === 'date' || targetField === 'startDate' || targetField === 'endDate') {
        return parseDate(value);
    }
    // Numeric fields
    if (targetField === 'value' ||
        targetField === 'easting' ||
        targetField === 'northing' ||
        targetField === 'elevation' ||
        targetField === 'x' ||
        targetField === 'y' ||
        targetField === 'z') {
        const num = parseFloat(String(value).replace(',', '.'));
        return isNaN(num) ? 0 : num;
    }
    // String fields
    return String(value).trim();
}
/**
 * Parse various date formats to ISO.
 * Converte varios formatos de data para ISO.
 * @param {any} value
 * @returns {string}
 */
function parseDate(value: any) {
    if (!value)
        return new Date().toISOString().split('T')[0];
    const text = String(value);
    // Already ISO format
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
        return text.split('T')[0];
    }
    // DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmyMatch) {
        return `${dmyMatch[3]!}-${dmyMatch[2]!.padStart(2, '0')}-${dmyMatch[1]!.padStart(2, '0')}`;
    }
    // MM/DD/YYYY
    const mdyMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (mdyMatch) {
        const m = parseInt(mdyMatch[1]!);
        const _d = parseInt(mdyMatch[2]!);
        if (m > 12) {
            // DD/MM/YYYY
            return `${mdyMatch[3]!}-${mdyMatch[2]!.padStart(2, '0')}-${mdyMatch[1]!.padStart(2, '0')}`;
        }
        return `${mdyMatch[3]!}-${mdyMatch[1]!.padStart(2, '0')}-${mdyMatch[2]!.padStart(2, '0')}`;
    }
    // Try native parsing
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
    }
    return value;
}
// ================================================================
// VALIDATION - Check transformed data integrity
// ================================================================
/**
 * Validate mapped data before import.
 * Valida os dados mapeados antes de importar.
 *
 * @param {SmartImportMappedData} data - Result from applyMapping
 * @returns {{valid: boolean, errors: string[], warnings: string[]}} { valid, errors, warnings }
 */
export function validateMappedData(data: any) {
    /** @type {string[]} */
    const errors: any[] = [];
    /** @type {string[]} */
    const warnings: any[] = [];
    if (data.observations.length > 0) {
        // Check observations have required fields
        data.observations.forEach((obs: any, i: any) => {
            if (!obs.value && obs.value !== 0) {
                warnings.push(`Row ${i + 1}: missing value`);
            }
        });
    }
    if (data.elements.length > 0) {
        data.elements.forEach((el: any, i: any) => {
            if (!el.family && !el.familyId) {
                warnings.push(`Element ${i + 1}: missing family`);
            }
        });
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings: [...warnings, ...data.warnings],
    };
}
// ================================================================
// ECBYTS TARGET FIELDS - For dropdown options in UI
// Campos alvo disponiveis para mapeamento manual
// ================================================================
/** @type {Record<string, TargetField[]>} */
export const TARGET_FIELDS = {
    observations: [
        { id: 'elementId', name: 'Element ID', required: false },
        { id: 'elementName', name: 'Element Name', required: false },
        { id: 'parameterId', name: 'Parameter', required: false },
        { id: 'value', name: 'Value', required: true },
        { id: 'unitId', name: 'Unit', required: false },
        { id: 'date', name: 'Date', required: false },
        { id: 'campaignId', name: 'Campaign ID', required: false },
        { id: 'x', name: 'Position X', required: false },
        { id: 'y', name: 'Position Y', required: false },
        { id: 'z', name: 'Position Z', required: false },
        { id: 'easting', name: 'UTM Easting', required: false },
        { id: 'northing', name: 'UTM Northing', required: false },
        { id: 'elevation', name: 'Elevation', required: false },
        { id: 'ignore', name: '— Ignore —', required: false },
    ],
    elements: [
        { id: 'family', name: 'Family', required: true },
        { id: 'id', name: 'ID', required: false },
        { id: 'name', name: 'Name', required: false },
        { id: 'easting', name: 'UTM Easting', required: false },
        { id: 'northing', name: 'UTM Northing', required: false },
        { id: 'elevation', name: 'Elevation', required: false },
        { id: 'x', name: 'Position X', required: false },
        { id: 'y', name: 'Position Y', required: false },
        { id: 'z', name: 'Position Z', required: false },
        { id: 'ignore', name: '— Ignore —', required: false },
    ],
    campaigns: [
        { id: 'id', name: 'ID', required: false },
        { id: 'name', name: 'Name', required: false },
        { id: 'startDate', name: 'Start Date', required: false },
        { id: 'endDate', name: 'End Date', required: false },
        { id: 'ignore', name: '— Ignore —', required: false },
    ],
};
