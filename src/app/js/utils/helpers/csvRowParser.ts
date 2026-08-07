// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   CSV ROW PARSER (utils/helpers — Module C extraction)
   ================================================================

   RFC 4180-light parser para 1 linha de CSV. Trata aspas duplas para
   campos com separator/CR/LF internos. Aspas internas escapadas como "".

   Extraído de duplicações em:
     - core/health/biomarkerReading.ts::_parseCSVRow
     - core/health/csvExport.ts::_parseCSVLine
     - core/ingestion/parser.ts::parseCSVLine

   Adoção incremental — caller passa separator (default ',').
   ================================================================ */

/**
 * Parse uma linha CSV em array de campos.
 * RFC 4180-light: campos com separator/aspas/CR/LF DEVEM estar entre aspas;
 * aspas internas são duplicadas ("").
 *
 * @param line — string de uma linha CSV (sem newline final)
 * @param sep — separator de campos (default ',')
 * @returns array de strings (campos sem aspas externas)
 */
export function parseCsvRow(line: string, sep: string = ','): string[] {
    if (typeof line !== 'string') return [];
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            // Aspas duplas dentro de campo citado são escaped como ""
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === sep && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}
