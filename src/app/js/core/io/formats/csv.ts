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

/* ================================================================
   CSV FORMAT — Exportação e importação de dados tabulares
   ================================================================

   Gera arquivos CSV para análise em Excel, R, Python.
   Caso de uso principal: exportar observações de campo para
   relatórios CONAMA/CETESB e análise estatística.

   MODOS DE EXPORTAÇÃO:
   - observations: todas as observações (por elemento/campanha)
   - elements: lista de elementos com posição e metadados
   - campaigns: lista de campanhas

   IMPORTAÇÃO:
   - CSV de observações: vincula a elementos existentes

   ================================================================ */

import { registerFormat } from './registry.js';
import { getElementPosition, relativeToUTM } from '../geo/coordinates.js';
import { getTaxonomyHeaders, getTaxonomyFieldValue } from '../../taxonomy/fieldResolver.js';
import { parseCsvRow as _parseCsvRow } from '../../../utils/helpers/csvRowParser.js';

// ----------------------------------------------------------------
// REGISTRO
// ----------------------------------------------------------------

registerFormat({
    id: 'csv',
    name: 'CSV',
    extensions: ['.csv'],
    mimeType: 'text/csv',
    canExport: true,
    canImport: true,
    needsOrigin: false,
    exportScopes: ['observations', 'elements', 'campaigns'],
});

// ----------------------------------------------------------------
// EXPORTAÇÃO
// ----------------------------------------------------------------

/**
 * Exporta modelo como CSV.
 *
 * @param {Object} model - Modelo completo (de buildModel())
 * @param {Object} [options]
 * @param {string} [options.scope='observations'] - 'observations' | 'elements' | 'campaigns'
 * @param {string} [options.separator=','] - Separador de campo
 * @returns {Blob}
 */
export function exportCSV(model: any, options: any = {}) {
    const { scope = 'observations', separator = ',' } = options;

    let csv;
    switch (scope) {
        case 'elements':
            csv = exportElementsCSV(model, separator);
            break;
        case 'campaigns':
            csv = exportCampaignsCSV(model, separator);
            break;
        case 'observations':
        default:
            csv = exportObservationsCSV(model, separator);
            break;
    }

    // BOM para Excel reconhecer UTF-8
    const bom = '\uFEFF';
    return new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
}

/**
 * Exporta observações como tabela plana.
 * Uma linha por observação, com dados do elemento pai.
 */
function exportObservationsCSV(/** @type {any} */ model: any, /** @type {any} */ sep: any) {
    const headers = [
        'element_id',
        'element_name',
        'family',
        'parameter_id',
        'value',
        'unit_id',
        'date',
        'campaign_id',
        'x',
        'y',
        'z',
        'utm_easting',
        'utm_northing',
        'utm_elevation',
        'detect_flag',
        'qualifier',
        'detection_limit',
        'cas_number',
        'lab_name',
        'sample_code',
        'analytical_method',
        'dilution_factor',
        'sample_matrix',
    ];

    const rows = [headers.join(sep)];

    for (const el of model.elements || []) {
        const obs = el.data?.observations || [];
        for (const o of obs) {
            const pos = { x: o.x || 0, y: o.y || 0, z: o.z || 0 };
            const utm = /** @type {any} */ (relativeToUTM(pos));

            rows.push(
                [
                    csvEscape(el.id, sep),
                    csvEscape(el.name, sep),
                    csvEscape(el.family, sep),
                    csvEscape(o.parameterId || o.parameter || '', sep),
                    o.value ?? o.reading ?? '',
                    csvEscape(o.unitId || o.unit || '', sep),
                    csvEscape(o.date || '', sep),
                    csvEscape(o.campaignId || '', sep),
                    round6(pos.x),
                    round6(pos.y),
                    round6(pos.z),
                    round2(utm.easting),
                    round2(utm.northing),
                    round2(utm.elevation),
                    csvEscape(o.detect_flag ?? '', sep),
                    csvEscape(o.qualifier ?? '', sep),
                    o.detection_limit ?? '',
                    csvEscape(o.cas_number ?? '', sep),
                    csvEscape(o.lab_name ?? '', sep),
                    csvEscape(o.sample_code ?? '', sep),
                    csvEscape(o.analytical_method ?? '', sep),
                    o.dilution_factor ?? '',
                    csvEscape(o.sample_matrix ?? '', sep),
                ].join(sep),
            );
        }
    }

    return rows.join('\n');
}

/**
 * Exporta elementos como tabela.
 * Uma linha por elemento, com posição e dimensões principais.
 */
function exportElementsCSV(/** @type {any} */ model: any, /** @type {any} */ sep: any) {
    const baseHeaders = [
        'id',
        'family',
        'name',
        'visible',
        'x',
        'y',
        'z',
        'utm_easting',
        'utm_northing',
        'utm_elevation',
        'observations_count',
        'latitude',
        'longitude',
        'coordinate_datum',
        'loc_type_detail',
    ];

    // Collect taxonomy headers from all families present in the model
    const familiesInModel = new Set((model.elements || []).map((/** @type {any} */ el: any) => el.family));
    /** @type {any[]} */
    const taxHeaders: any = [];
    for (const fam of familiesInModel) {
        for (const th of getTaxonomyHeaders(fam)) {
            // Deduplicate by taxonomyId:fieldId (cross-family taxonomies)
            const key = `${th.taxonomyId}:${th.fieldId}`;
            if (!taxHeaders.some((h: any) => `${h.taxonomyId}:${h.fieldId}` === key)) {
                taxHeaders.push(th);
            }
        }
    }

    const headers = [
        ...baseHeaders,
        ...taxHeaders.map((th: any) => {
            // Use exportMapping.csv if available, else taxonomyId.fieldId
            return th.exportMapping?.csv || `${th.taxonomyId}.${th.fieldId}`;
        }),
    ];

    const rows = [headers.join(sep)];

    for (const el of model.elements || []) {
        const pos = getElementPosition(el);
        const utm = /** @type {any} */ (relativeToUTM(pos));
        const obsCount = (el.data?.observations || []).length;

        const baseRow = [
            csvEscape(el.id, sep),
            csvEscape(el.family, sep),
            csvEscape(el.name, sep),
            el.visible !== false ? 'true' : 'false',
            round6(pos.x),
            round6(pos.y),
            round6(pos.z),
            round2(utm.easting),
            round2(utm.northing),
            round2(utm.elevation),
            obsCount,
            el.data?.latitude ?? '',
            el.data?.longitude ?? '',
            csvEscape(el.data?.coordinate_datum ?? '', sep),
            csvEscape(el.data?.loc_type_detail ?? '', sep),
        ];

        // Append taxonomy field values
        for (const th of taxHeaders) {
            const val = getTaxonomyFieldValue(el, th.taxonomyId, th.fieldId);
            baseRow.push(csvEscape(val ?? '', sep));
        }

        rows.push(baseRow.join(sep));
    }

    return rows.join('\n');
}

/**
 * Exporta campanhas como tabela.
 */
function exportCampaignsCSV(/** @type {any} */ model: any, /** @type {any} */ sep: any) {
    const headers = ['id', 'name', 'start_date', 'end_date', 'color'];
    const rows = [headers.join(sep)];

    for (const c of model.campaigns || []) {
        rows.push(
            [
                csvEscape(c.id, sep),
                csvEscape(c.name, sep),
                csvEscape(c.startDate || c.date || '', sep),
                csvEscape(c.endDate || '', sep),
                csvEscape(c.color || '', sep),
            ].join(sep),
        );
    }

    return rows.join('\n');
}

// ----------------------------------------------------------------
// IMPORTAÇÃO
// ----------------------------------------------------------------

/**
 * Importa observações de um CSV.
 * Retorna array de observações agrupadas por element_id.
 *
 * @param {string} csvText - Conteúdo do CSV
 * @param {Object} [options]
 * @param {string} [options.separator] - Autodetect se omitido
 * @returns {{ observations: Object[], elementIds: string[] }}
 */
export function importCSV(csvText: any, options: any = {}) {
    const lines = csvText.split(/\r?\n/).filter((l: any) => l.trim());
    if (lines.length < 2) {
        throw new Error('CSV deve ter pelo menos cabeçalho e uma linha de dados');
    }

    const sep = options.separator || detectSeparator(lines[0]);
    const headers = parseCSVLine(lines[0], sep).map((h) => h.trim().toLowerCase());

    /** @type {any[]} */
    const observations = [];
    /** @type {Set<any>} */
    const elementIds = new Set();

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i], sep);
        if (values.length < headers.length) continue;

        /** @type {Record<string, any>} */
        const row: Record<string, any> = {};
        headers.forEach((h: any, idx: any) => {
            row[h] = values[idx];
        });

        const elementId = row.element_id || row.elementid || row.id || '';
        if (elementId) elementIds.add(elementId);

        /** @type {any} */
        const obs: any = {
            elementId,
            parameterId: row.parameter_id || row.parameter || row.parameterid || '',
            value: parseFloat(row.value) || 0,
            unitId: row.unit_id || row.unit || row.unitid || '',
            date: row.date || new Date().toISOString().slice(0, 10),
            campaignId: row.campaign_id || row.campaignid || '',
            x: parseFloat(row.x) || 0,
            y: parseFloat(row.y) || 0,
            z: parseFloat(row.z) || 0,
        };

        // EDD fields - preservar se presentes no CSV
        const df = row.detect_flag || row.detectflag;
        if (df) obs.detect_flag = df;
        if (row.qualifier) obs.qualifier = row.qualifier;
        const dl = parseFloat(row.detection_limit || row.detectionlimit);
        if (!isNaN(dl)) obs.detection_limit = dl;
        if (row.cas_number || row.casnumber) obs.cas_number = row.cas_number || row.casnumber;
        if (row.lab_name || row.labname) obs.lab_name = row.lab_name || row.labname;
        if (row.sample_code || row.samplecode) obs.sample_code = row.sample_code || row.samplecode;
        if (row.analytical_method || row.analyticalmethod)
            obs.analytical_method = row.analytical_method || row.analyticalmethod;
        const dil = parseFloat(row.dilution_factor || row.dilutionfactor);
        if (!isNaN(dil)) obs.dilution_factor = dil;
        if (row.sample_matrix || row.samplematrix) obs.sample_matrix = row.sample_matrix || row.samplematrix;

        observations.push(obs);
    }

    return { observations, elementIds: Array.from(elementIds) };
}

// ----------------------------------------------------------------
// UTILIDADES CSV
// ----------------------------------------------------------------

/**
 * Escapa valor para CSV (adiciona aspas se contém separador, aspas ou quebra de linha).
 */
export function csvEscape(/** @type {any} */ value: any, /** @type {any} */ sep: any) {
    const str = String(value ?? '');
    if (str.includes(sep) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

/**
 * Detecta separador do CSV (vírgula, ponto-e-vírgula, tab).
 */
function detectSeparator(/** @type {any} */ headerLine: any) {
    const counts = {
        ',': (headerLine.match(/,/g) || []).length,
        ';': (headerLine.match(/;/g) || []).length,
        '\t': (headerLine.match(/\t/g) || []).length,
    };
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0];
}

/**
 * Parseia uma linha CSV respeitando campos entre aspas.
 */
export function parseCSVLine(/** @type {any} */ line: any, /** @type {any} */ sep: any) {
    return _parseCsvRow(line, sep);
}

function round6(/** @type {any} */ n: any) {
    return Math.round((n || 0) * 1e6) / 1e6;
}
function round2(/** @type {any} */ n: any) {
    return Math.round((n || 0) * 100) / 100;
}
