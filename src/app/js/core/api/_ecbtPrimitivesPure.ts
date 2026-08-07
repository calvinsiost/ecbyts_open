// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_ECBT_UNIVERSAL_API — FASE 1 pure-logic: PRIMITIVAS TABULARES + SANITIZER.
//
// RF3 (primitivas): ecbtTable / ecbtSum / ecbtValue expõem a leitura de um
// dataset {rows, columns} como artefatos estáveis (matriz 2D, agregação escalar,
// célula única). Toda a lógica é PURA — zero state, zero DOM, zero LLM,
// determinística e auto-contida (Phase 1 não toca runtime/UI).
//
// Secção 6 (cell-injection): sanitizeForSpreadsheet neutraliza CSV/Formula
// Injection (OWASP). Qualquer string retornada por table/value que comece com um
// caractere de fórmula (= + - @ TAB CR) é prefixada com apóstrofo (') de modo
// que Excel/Google Sheets/LibreOffice tratem o conteúdo como TEXTO literal, não
// como fórmula executável. Números nunca são tocados.
//
// Hand-authored R1-safe. Sem `any`. Sem emoji.
//
// Spec NOT:
// - NÃO faz I/O (caller injeta o dataset).
// - NÃO formata para apresentação além do guard de injeção (sem locale/moeda).
// - NÃO depende de window/document/jStat/CDN.
// - NÃO silencia coluna inexistente — retorna erro estruturado bad_args.

// ============================================================================
// TYPES
// ============================================================================

/** Valor primitivo aceito numa célula do dataset. */
export type CellValue = string | number | boolean | null | undefined;

/**
 * Dataset tabular canônico.
 * `columns` define a ordem e os nomes das colunas; cada `row` é um mapa
 * coluna → valor. Linhas podem omitir colunas (tratadas como vazias).
 */
export interface EcbtDataset {
    columns: string[];
    rows: Array<Record<string, CellValue>>;
}

/** Operação de agregação escalar suportada por ecbtSum. */
export type AggOp = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'p50' | 'p75';

/** Erro estruturado (nunca lançado — sempre retornado). */
export interface EcbtError {
    ok: false;
    code: 'bad_args';
    message: string;
}

/** Matriz tabular estável: header + linhas, ambos sanitizados contra injeção. */
export interface EcbtTableResult {
    ok: true;
    header: string[];
    rows: string[][];
    /** Conveniência: [header, ...rows] como única matriz 2D. */
    matrix: string[][];
}

/** Resultado escalar de uma agregação. */
export interface EcbtSumResult {
    ok: true;
    op: AggOp;
    column: string;
    /** Resultado numérico da agregação. */
    value: number;
    /** Nº de células consideradas pela operação (numéricas, exceto `count`). */
    count: number;
}

/** Resultado de leitura de uma única célula/medida, sanitizado. */
export interface EcbtValueResult {
    ok: true;
    field: string;
    /** Valor sanitizado (string neutralizada ou número cru). */
    value: string | number;
    /** `true` se o campo existia na linha; `false` se ausente/vazio. */
    found: boolean;
}

// ============================================================================
// CELL-INJECTION GUARD (OWASP CSV/Formula Injection) — Secção 6
// ============================================================================

/**
 * Caracteres iniciais que disparam interpretação de fórmula em planilhas.
 * `=` `+` `-` `@` além de TAB (\t) e CR (\r), que alguns parsers tratam como
 * início de fórmula (OWASP CSV Injection cheat-sheet).
 */
const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Neutraliza CSV/Formula Injection.
 *
 * Se `value` for string e seu PRIMEIRO caractere for um gatilho de fórmula
 * (= + - @ TAB CR), prefixa com apóstrofo (') — convenção universal de planilhas
 * para forçar tratamento como texto. Strings normais e números passam intactos.
 *
 * Determinística e idempotente do ponto de vista de segurança: aplicar de novo
 * sobre uma saída já prefixada não reintroduz risco (o novo primeiro char é `'`).
 *
 * @param value - qualquer valor de célula
 * @returns string sanitizada se entrada string; número/boolean inalterado;
 *          null/undefined → '' (célula vazia estável)
 */
export function sanitizeForSpreadsheet(value: CellValue): string | number | boolean {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    // typeof value === 'string'
    if (value.length > 0 && FORMULA_TRIGGERS.has(value.charAt(0))) {
        return `'${value}`;
    }
    return value;
}

/** Variante string-only para preencher matrizes (header/rows sempre string). */
function sanitizeCellToString(value: CellValue): string {
    const sanitized = sanitizeForSpreadsheet(value);
    return typeof sanitized === 'string' ? sanitized : String(sanitized);
}

// ============================================================================
// HELPERS (pure)
// ============================================================================

function isError(x: unknown): x is EcbtError {
    return typeof x === 'object' && x !== null && (x as { ok?: unknown }).ok === false;
}

function badArgs(message: string): EcbtError {
    return { ok: false, code: 'bad_args', message };
}

/**
 * Coerce a cell to a finite number, or `null` if non-numeric.
 * Aceita number e strings numéricas ("3.14", " 12 "). Boolean/null/empty → null
 * (não contam como medida numérica para sum/avg/min/max/percentile).
 */
function toNumericOrNull(value: CellValue): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return null;
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/**
 * Percentile via interpolação linear (método R-7 / Excel PERCENTILE.INC).
 * `sorted` DEVE estar ordenado ascendente. `p` em [0, 1].
 */
function percentileSorted(sorted: number[], p: number): number {
    const n = sorted.length;
    if (n === 0) return 0;
    if (n === 1) return sorted[0] as number;
    const rank = p * (n - 1);
    const lo = Math.floor(rank);
    const hi = Math.ceil(rank);
    const frac = rank - lo;
    const vLo = sorted[lo] as number;
    const vHi = sorted[hi] as number;
    return vLo + (vHi - vLo) * frac;
}

function assertDataset(dataset: unknown): EcbtDataset | EcbtError {
    if (typeof dataset !== 'object' || dataset === null) {
        return badArgs('dataset must be an object {columns, rows}');
    }
    const ds = dataset as Partial<EcbtDataset>;
    if (!Array.isArray(ds.columns)) return badArgs('dataset.columns must be an array of strings');
    if (!Array.isArray(ds.rows)) return badArgs('dataset.rows must be an array of objects');
    return { columns: ds.columns as string[], rows: ds.rows as Array<Record<string, CellValue>> };
}

function isNonEmptyCell(cell: CellValue): boolean {
    return cell !== null && cell !== undefined && !(typeof cell === 'string' && cell.trim() === '');
}

function validateAggOp(op: unknown): AggOp | EcbtError {
    const validOps: AggOp[] = ['sum', 'avg', 'min', 'max', 'count', 'p50', 'p75'];
    if (typeof op === 'string' && validOps.includes(op as AggOp)) return op as AggOp;
    return badArgs(`unsupported op: ${String(op)}`);
}

function computeNumericAgg(op: Exclude<AggOp, 'count'>, nums: number[]): number {
    const count = nums.length;
    switch (op) {
        case 'sum':
            return nums.reduce((a, b) => a + b, 0);
        case 'avg':
            return nums.reduce((a, b) => a + b, 0) / count;
        case 'min':
            return Math.min(...nums);
        case 'max':
            return Math.max(...nums);
        case 'p50':
            return percentileSorted([...nums].sort((a, b) => a - b), 0.5);
        case 'p75':
            return percentileSorted([...nums].sort((a, b) => a - b), 0.75);
        default:
            return 0;
    }
}

// ============================================================================
// PRIMITIVE 1 — ecbtTable: dataset → matriz 2D estável (header + rows)
// ============================================================================

/**
 * Build a stable 2D matrix (header + rows) from a dataset.
 *
 * A ordem das colunas segue `dataset.columns`. Cada célula é sanitizada contra
 * cell-injection. Linhas que omitem uma coluna recebem célula vazia (''), de
 * modo que a matriz é sempre retangular (todas as linhas com o mesmo nº de
 * colunas do header).
 *
 * @param dataset - {columns, rows}
 * @returns EcbtTableResult (ok) ou EcbtError (bad_args)
 */
export function ecbtTable(dataset: EcbtDataset): EcbtTableResult | EcbtError {
    const ds = assertDataset(dataset);
    if (isError(ds)) return ds;

    const header = ds.columns.map((c) => sanitizeCellToString(c));
    const rows: string[][] = ds.rows.map((row) =>
        ds.columns.map((col) => sanitizeCellToString(row ? row[col] : undefined)),
    );

    return { ok: true, header, rows, matrix: [header, ...rows] };
}

// ============================================================================
// PRIMITIVE 2 — ecbtSum: agregação escalar sobre uma coluna
// ============================================================================

/**
 * Scalar aggregation over a single column.
 *
 * Ops:
 *  - count: nº de células NÃO vazias (null/undefined/'' não contam). Não exige
 *           valor numérico (conta categóricos também).
 *  - sum/avg/min/max/p50/p75: operam APENAS sobre células numéricas; não-numéricas
 *           são IGNORADAS. Se não houver nenhuma célula numérica, value = 0.
 *
 * Coluna inexistente em `dataset.columns` → EcbtError bad_args (não silencia).
 *
 * @param dataset - {columns, rows}
 * @param column - nome da coluna a agregar
 * @param op - operação de agregação
 * @returns EcbtSumResult (ok) ou EcbtError (bad_args)
 */
export function ecbtSum(dataset: EcbtDataset, column: string, op: AggOp): EcbtSumResult | EcbtError {
    const ds = assertDataset(dataset);
    if (isError(ds)) return ds;

    if (typeof column !== 'string' || column.length === 0) {
        return badArgs('column must be a non-empty string');
    }
    if (!ds.columns.includes(column)) {
        return badArgs(`column not found: ${column}`);
    }
    const validatedOp = validateAggOp(op);
    if (isError(validatedOp)) return validatedOp;

    // count: conta células não-vazias (categóricas incluídas).
    if (validatedOp === 'count') {
        let nonEmpty = 0;
        for (const row of ds.rows) {
            if (isNonEmptyCell(row ? row[column] : undefined)) nonEmpty++;
        }
        return { ok: true, op: validatedOp, column, value: nonEmpty, count: nonEmpty };
    }

    // Demais ops: coleta apenas valores numéricos.
    const nums: number[] = [];
    for (const row of ds.rows) {
        const n = toNumericOrNull(row ? row[column] : undefined);
        if (n !== null) nums.push(n);
    }

    const count = nums.length;
    if (count === 0) {
        return { ok: true, op: validatedOp, column, value: 0, count: 0 };
    }

    const value = computeNumericAgg(validatedOp, nums);
    return { ok: true, op: validatedOp, column, value, count };
}

// ============================================================================
// PRIMITIVE 3 — ecbtValue: leitura de uma única célula/medida
// ============================================================================

/**
 * Read a single cell/measure from the first row that contains the field.
 *
 * `field` pode ser "column" (lê da primeira linha) ou "rowIndex:column"
 * (lê de uma linha específica, 0-based). O valor é sanitizado contra injeção
 * (string) ou retornado cru (número). Campo ausente/vazio → value '' + found:false.
 *
 * @param dataset - {columns, rows}
 * @param field - "column" ou "índiceDaLinha:column"
 * @returns EcbtValueResult (ok) ou EcbtError (bad_args)
 */
export function ecbtValue(dataset: EcbtDataset, field: string): EcbtValueResult | EcbtError {
    const ds = assertDataset(dataset);
    if (isError(ds)) return ds;

    if (typeof field !== 'string' || field.length === 0) {
        return badArgs('field must be a non-empty string');
    }

    // Parse "rowIndex:column" ou "column".
    let rowIndex = 0;
    let column = field;
    const sep = field.indexOf(':');
    if (sep > 0) {
        const idxPart = field.slice(0, sep);
        const colPart = field.slice(sep + 1);
        const parsedIdx = Number(idxPart);
        if (Number.isInteger(parsedIdx) && parsedIdx >= 0) {
            rowIndex = parsedIdx;
            column = colPart;
        }
        // Se o prefixo não for um índice válido, trata o field inteiro como nome
        // de coluna (ex.: coluna que contém ':' no nome).
    }

    if (!ds.columns.includes(column)) {
        return badArgs(`column not found: ${column}`);
    }
    if (rowIndex >= ds.rows.length) {
        return badArgs(`row index out of range: ${rowIndex}`);
    }

    const row = ds.rows[rowIndex];
    const raw: CellValue = row ? row[column] : undefined;
    const found = raw !== null && raw !== undefined && !(typeof raw === 'string' && raw.trim() === '');

    const sanitized = sanitizeForSpreadsheet(raw);
    // boolean → string para um shape de retorno estável (string | number).
    const value: string | number = typeof sanitized === 'boolean' ? String(sanitized) : sanitized;

    return { ok: true, field, value, found };
}
