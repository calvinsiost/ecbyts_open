// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CETESB-RISK-001 UI-B — Clipboard interop pure-logic (Excel ↔ ecbyts).
//
// Padrão Excel/Google Sheets clipboard: TSV (tab-separated values) com `\r\n`
// (CRLF) row separator. Quando usuário Ctrl+C de range Excel, ecbyts recebe
// `text/plain` em formato TSV — este módulo parseia + serializa em ambos
// sentidos sem DOM/clipboard API real (caller faz o wire).
//
// Bidirecional:
//   parseTsv(text) → cells[][] (matriz)
//   serializeTsv(cells[][]) → text (Excel-compatible)
//   gridSectionToTsv(model) → TSV pronto para colar em planilha
//   tsvToGridSection(tsv, section, scenario, rows) → GridSectionModel parcial
//
// PRIOR ART:
//   - src/app/js/utils/handlers/labReconciliation.ts (TSV lab batch paste)
//   - src/app/js/utils/report/editor.ts (clipboardData getData text/plain)
//   - src/app/js/core/risk/cetesb/_riskGridModelPure.ts (modelo destino)
//
// SPEC: docs/specs/features/SPEC_CETESB_RISK_ASSESSMENT.md UI-B (Ctrl+C/Ctrl+V parity)

import type { GridSection, GridSectionModel, GridRow } from './_riskGridModelPure.js';
import { buildSectionModel, getColumnsForSection } from './_riskGridModelPure.js';
import type { ScenarioId } from './_riskCatalogPure.js';

// ===========================================================================
// Tipos
// ===========================================================================

export interface TsvParseResult {
    readonly ok: boolean;
    readonly rows: ReadonlyArray<ReadonlyArray<string>>;
    readonly width: number;
    readonly height: number;
    readonly errors: ReadonlyArray<string>;
}

export interface TsvToGridResult {
    readonly ok: boolean;
    readonly model: GridSectionModel | null;
    readonly accepted: number;
    readonly rejected: number;
    readonly warnings: ReadonlyArray<string>;
}

// ===========================================================================
// PARSE — TSV → matrix
// ===========================================================================

/**
 * Parseia TSV (clipboard Excel) em matriz de células.
 *
 * Comportamento Excel-compatible:
 *   - row separator: \r\n (CRLF) primário; \n (LF) fallback
 *   - col separator: \t (TAB)
 *   - trailing CRLF é ignorado (Excel sempre adiciona)
 *   - células com aspas duplas: "abc" → abc; "a""b" → a"b
 *   - células com tab/CRLF internos: precisam vir entre aspas
 *
 * Defensivo: nunca throws — retorna ok=false com errors.
 */
export function parseTsv(text: unknown): TsvParseResult {
    if (typeof text !== 'string' || text.length === 0) {
        return Object.freeze({
            ok: false,
            rows: Object.freeze([]),
            width: 0,
            height: 0,
            errors: Object.freeze(['input vazio ou tipo inválido']),
        });
    }

    // Normaliza CRLF/CR/LF → LF para parser simples
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Remove trailing newline (Excel sempre adiciona)
    const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;

    if (trimmed.length === 0) {
        return Object.freeze({
            ok: false,
            rows: Object.freeze([]),
            width: 0,
            height: 0,
            errors: Object.freeze(['após trim ficou vazio']),
        });
    }

    const errors: string[] = [];
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < trimmed.length; i++) {
        const c = trimmed[i];

        if (inQuotes) {
            if (c === '"') {
                if (trimmed[i + 1] === '"') {
                    // Aspas escapadas
                    currentCell += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                currentCell += c;
            }
        } else {
            if (c === '"' && currentCell === '') {
                inQuotes = true;
            } else if (c === '\t') {
                currentRow.push(currentCell);
                currentCell = '';
            } else if (c === '\n') {
                currentRow.push(currentCell);
                rows.push(currentRow);
                currentRow = [];
                currentCell = '';
            } else {
                currentCell += c;
            }
        }
    }
    // Última célula/linha
    currentRow.push(currentCell);
    rows.push(currentRow);

    // Verifica consistência de largura
    const width = rows[0]?.length || 0;
    const heightInconsistent = rows.some((r) => r.length !== width);
    if (heightInconsistent) {
        errors.push(`larguras inconsistentes (primeira linha: ${width})`);
    }

    return Object.freeze({
        ok: errors.length === 0,
        rows: Object.freeze(rows.map((r) => Object.freeze([...r]))),
        width,
        height: rows.length,
        errors: Object.freeze(errors),
    });
}

// ===========================================================================
// SERIALIZE — matrix → TSV (Excel-compatible)
// ===========================================================================

/** Escapa célula para TSV: se contém tab/newline/aspas, envolve em aspas. */
function escapeCell(value: string): string {
    if (value.includes('\t') || value.includes('\n') || value.includes('\r') || value.includes('"')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

/**
 * Serializa matriz para TSV Excel-compatible.
 * Usa CRLF (Excel default) como row separator.
 */
export function serializeTsv(matrix: ReadonlyArray<ReadonlyArray<string>>): string {
    if (!Array.isArray(matrix) || matrix.length === 0) return '';
    const lines: string[] = [];
    for (const row of matrix) {
        if (!Array.isArray(row)) continue;
        lines.push(row.map((cell) => escapeCell(String(cell))).join('\t'));
    }
    return lines.join('\r\n');
}

// ===========================================================================
// GRID MODEL ↔ TSV (bidirecional)
// ===========================================================================

/**
 * Formata valor numérico para clipboard.
 * - null → string vazia (Excel mostra célula em branco)
 * - número → toString sem notação científica para |val| ∈ [1e-4, 1e15]
 * - número fora dessa faixa → toExponential(6)
 */
function formatNumberForClipboard(v: number | null): string {
    if (v === null || !Number.isFinite(v)) return '';
    if (v === 0) return '0';
    const abs = Math.abs(v);
    if (abs >= 1e-4 && abs < 1e15) {
        // Reduz precisão para evitar lixo float
        const fixed = v.toFixed(6).replace(/\.?0+$/, '');
        return fixed;
    }
    return v.toExponential(6);
}

/**
 * Parseia string numérica do clipboard.
 * Aceita vírgula decimal (PT/ES Excel) e notação científica.
 * Retorna null se não conversível.
 */
export function parseNumberFromClipboard(text: string): number | null {
    if (typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (trimmed === '') return null;
    // Detecção heurística de locale por presença de . e ,
    const hasDot = trimmed.includes('.');
    const hasComma = trimmed.includes(',');
    let normalized: string;
    if (hasDot && hasComma) {
        // PT/ES estilo "1.234,5" — ponto é milhar, vírgula decimal
        normalized = trimmed.replace(/\./g, '').replace(',', '.');
    } else if (hasComma) {
        // Só vírgula → assume decimal PT/ES
        normalized = trimmed.replace(',', '.');
    } else {
        // Só ponto OU só dígitos → EN/sem-separador
        normalized = trimmed;
    }
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
}

/**
 * Converte GridSectionModel em TSV pronto para colar em planilha.
 * Layout:
 *   Linha 1: header (CAS, Substância, [cols labels])
 *   Linhas 2+: rows (cas, name, [cells values])
 */
export function gridSectionToTsv(model: GridSectionModel): string {
    if (!model || !model.columns || !model.rows) return '';

    // Header
    const headerCells = ['CAS', 'Substância', ...model.columns.map((c) => `${c.label} (${c.unit})`)];
    const matrix: string[][] = [headerCells];

    // Index cells by `${cas}|${columnId}` for O(1) lookup
    const cellMap = new Map<string, number | null>();
    for (const cell of model.cells) {
        cellMap.set(`${cell.rowCas}|${cell.columnId}`, cell.value);
    }

    // Rows
    for (const row of model.rows) {
        const cells: string[] = [row.cas, row.name];
        for (const col of model.columns) {
            const v = cellMap.get(`${row.cas}|${col.id}`) ?? null;
            cells.push(formatNumberForClipboard(v));
        }
        matrix.push(cells);
    }

    return serializeTsv(matrix);
}

/**
 * Parseia TSV colado pelo usuário em GridSectionModel parcial.
 *
 * Espera shape:
 *   - Coluna 0 = CAS (ou número índice se sem header)
 *   - Coluna 1 = Substância (opcional)
 *   - Colunas 2+ = valores numéricos por coluna do section
 *
 * Tenta detectar header automaticamente (1ª linha não-numérica = header).
 */
export function tsvToGridSection(
    tsv: string,
    section: GridSection,
    scenario: ScenarioId | null,
    knownRows: ReadonlyArray<GridRow>,
): TsvToGridResult {
    const parsed = parseTsv(tsv);
    if (!parsed.ok || parsed.height === 0) {
        return Object.freeze({
            ok: false,
            model: null,
            accepted: 0,
            rejected: 0,
            warnings: Object.freeze(['TSV parse falhou: ' + parsed.errors.join('; ')]),
        });
    }

    const warnings: string[] = [];
    const columns = getColumnsForSection(section, scenario);
    if (columns.length === 0) {
        return Object.freeze({
            ok: false,
            model: null,
            accepted: 0,
            rejected: 0,
            warnings: Object.freeze([`section "${section}" desconhecida`]),
        });
    }

    // Detecta header: 1ª linha com 1ª célula não-numérica E não-CAS-format
    const CAS_REGEX = /^[1-9]\d{0,6}-\d{2}-\d$/;
    const firstCell = String(parsed.rows[0]?.[0] || '').trim();
    const hasHeader = firstCell !== '' && !CAS_REGEX.test(firstCell) && parseNumberFromClipboard(firstCell) === null;
    const dataStart = hasHeader ? 1 : 0;

    const knownRowsMap = new Map<string, GridRow>();
    for (const r of knownRows) knownRowsMap.set(r.cas, r);

    const cellsByKey = new Map<string, number | null>();
    const acceptedRows: GridRow[] = [];
    let accepted = 0;
    let rejected = 0;

    for (let r = dataStart; r < parsed.height; r++) {
        const row = parsed.rows[r];
        if (!row) continue;
        const cas = String(row[0] || '').trim();
        if (!CAS_REGEX.test(cas)) {
            rejected++;
            warnings.push(`linha ${r + 1}: CAS inválido "${cas.slice(0, 30)}"`);
            continue;
        }
        const known = knownRowsMap.get(cas);
        const name = String(row[1] || known?.name || '').trim();
        const group = known?.group || 'unknown';
        acceptedRows.push(Object.freeze({ cas, name, group }));

        // Valores: coluna 2+ corresponde a columns[0]+
        for (let c = 0; c < columns.length; c++) {
            const sourceColIdx = 2 + c;
            const raw = row[sourceColIdx];
            if (raw === undefined || raw === null) continue;
            const num = parseNumberFromClipboard(raw);
            cellsByKey.set(`${cas}|${columns[c]!.id}`, num);
            if (num !== null) accepted++;
        }
    }

    const model = buildSectionModel(section, scenario, acceptedRows, cellsByKey);
    return Object.freeze({
        ok: accepted > 0,
        model,
        accepted,
        rejected,
        warnings: Object.freeze(warnings),
    });
}

/** Constantes públicas. */
export const CLIPBOARD_INTEROP_META = Object.freeze({
    excelRowSep: '\r\n',
    excelColSep: '\t',
    supportedLocales: Object.freeze(['en-US (ponto decimal)', 'pt-BR (vírgula decimal)', 'es-LA (vírgula decimal)']),
});
