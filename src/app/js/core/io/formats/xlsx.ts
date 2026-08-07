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
   XLSX FORMAT EXPORTER
   ================================================================ */

import { registerFormat } from './registry.js';
import { XLSX_TEMPLATES, isGhgSource, resolveGhgSource } from './xlsxTemplates.js';
import { getTaxonomyHeaders, getTaxonomyFieldValue } from '../../taxonomy/fieldResolver.js';

registerFormat({
    id: 'xlsx',
    name: 'XLSX',
    extensions: ['.xlsx'],
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    canExport: true,
    canImport: false,
    exportScopes: ['full'],
});

/**
 * Export model to XLSX based on template.
 * @param {Object} model
 * @param {Object} [options]
 * @param {string} [options.template='ecbyts'] - 'edd-br' | 'edd-r2' | 'ohs-aiha' | 'ecbyts'
 * @returns {Promise<Blob>}
 */
export async function exportXLSX(model: any, options: any = {}) {
    const { template = 'ecbyts' } = options;
    const m = /** @type {any} */ (model);

    const tpl = XLSX_TEMPLATES[template];
    if (!tpl) throw new Error(`Invalid template: ${template}`);

    if (!(window as any).XLSX) {
        // Load SheetJS if missing (cdnLoader.js pattern)
        const { loadScriptCDN } = await import('../../../utils/helpers/cdnLoader.js');
        await loadScriptCDN('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', {
            name: 'SheetJS',
            globalVar: 'XLSX',
        });
    }

    const XL = /** @type {any} */ ((window as any).XLSX) as any;
    const wb = XL.utils.book_new();

    for (const sheet of tpl.sheets) {
        const rows = _buildRows(m, sheet);
        addSheet(wb, sheet.name, rows);
    }

    const wbout = XL.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Build row objects for a sheet definition.
 * Constroi array de objetos com cabecalhos como chaves.
 * @param {Object} model
 * @param {import('./xlsxTemplates.js').TemplateSheet} sheet
 * @returns {Object[]}
 */
function _buildRows(model: any, sheet: any) {
    if (!sheet.columns || sheet.columns.length === 0) return [];

    const m = /** @type {any} */ (model);
    /** @type {any[]} */
    const elements = m.elements || [];
    /** @type {any[]} */
    const campaigns = m.campaigns || [];

    // GHG sources (`meta`, `ghgT1`..`ghgT8`) - SPEC_GHG_PROTOCOL_INVENTARIO_RESUMO F3.
    // Le rows de model.ghg (output de core/reports/ghgInventory.buildGhgInventory).
    if (isGhgSource(sheet.source)) {
        const rows = resolveGhgSource(m, sheet.source);
        return rows.map((/** @type {any} */ r: any) => _rowFromColumns(sheet.columns, r, null));
    }

    if (sheet.source === 'elements') {
        // Augment with taxonomy columns from active data dictionaries
        const taxCols = _buildTaxonomyCols(elements);
        const allCols = [...sheet.columns, ...taxCols];
        return elements.map((/** @type {any} */ el: any) => _rowFromColumns(allCols, el, null));
    }

    if (sheet.source === 'campaigns') {
        return campaigns.map((/** @type {any} */ c: any) => _rowFromColumns(sheet.columns, c, null));
    }

    if (sheet.source === 'observations') {
        // Flat join: each observation paired with its parent element
        return elements.flatMap((/** @type {any} */ el: any) => (el.data?.observations || []).map((/** @type {any} */ obs: any) => _rowFromColumns(sheet.columns, obs, el)),
        );
    }

    return [];
}

/**
 * Map column definitions to a single row object.
 * @param {import('./xlsxTemplates.js').TemplateColumn[]} columns
 * @param {Object} primary - Primary data object (observation or element)
 * @param {Object|null} secondary - Secondary context (element when primary is observation)
 * @returns {Object}
 */
function _rowFromColumns(columns: any, primary: any, secondary: any) {
    /** @type {Record<string, any>} */
    const row: Record<string, any> = {};
    for (const col of columns) {
        row[col.header] = col.value(primary, secondary);
    }
    return row;
}

/**
 * Build dynamic taxonomy column definitions for XLSX elements sheet.
 * Gera colunas extras baseadas nas taxonomias ativas para as familias presentes.
 *
 * @param {Object[]} elements - Model elements
 * @returns {Array<{ header: string, value: Function }>}
 */
function _buildTaxonomyCols(elements: any) {
    const familiesInModel = new Set(elements.map((/** @type {any} */ el: any) => el.family));
    const seen = new Set();
    const cols = [];
    for (const fam of familiesInModel) {
        for (const th of getTaxonomyHeaders(fam)) {
            const key = `${th.taxonomyId}:${th.fieldId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const exportMapping = /** @type {{ xlsx?: string, csv?: string }} */ (th.exportMapping || {});
            const header = exportMapping.xlsx || exportMapping.csv || `${th.taxonomyId}.${th.fieldId}`;
            cols.push({
                header,
                value: (/** @type {any} */ el: any) => getTaxonomyFieldValue(el, th.taxonomyId, th.fieldId) ?? '',
            });
        }
    }
    return cols;
}

/**
 * Append a JSON data array as a named sheet to the workbook.
 * @param {Object} wb - SheetJS workbook
 * @param {string} name - Sheet name
 * @param {Object[]} data - Array of row objects
 */
export function addSheet(wb: any, name: any, data: any) {
    const XL = /** @type {any} */ ((window as any).XLSX) as any;
    const ws = XL.utils.json_to_sheet(data);
    XL.utils.book_append_sheet(wb, ws, name);
}
