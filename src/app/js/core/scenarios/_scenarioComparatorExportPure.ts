// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Scenarios — export do comparativo (S4 / CFG-38, pure).
 * SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2 S4, §2.4.3 CFG-38).
 *
 * EN: Builds — without DOM, network or clock — the FOUR export shapes of the
 *     multi-scenario comparator (Base + N scenarios × 4 dimensions + affected
 *     SDGs):
 *       - CSV  — long-format rows, consumed by utils/helpers/csvExport `toCsv`;
 *       - JSON — frozen portable object;
 *       - XLSX — a workbook-agnostic sheet spec (same matrix as the CSV) that
 *                the runtime feeds to SheetJS `aoa_to_sheet`, mirroring the
 *                `_auditTrailXlsxBuilderPure` → exporter split;
 *       - MD   — a human-readable GitHub-flavoured table (wide, mirrors the
 *                on-screen layout), following the convention of
 *                `_auditTrailMarkdownPure` / `_statementExportPure`.
 *     ALL FOUR derive from the same {@link collectExportCells} gate, so the
 *     column WHITELIST is guaranteed BY CONSTRUCTION — labels, dimension
 *     values, deltas and qualitative trend only; no internal element ids, no
 *     seeds, no bookkeeping fields can leak through any format (same LGPD-safe
 *     posture as `_balanceExportPure`). The runtime triggers the download.
 *
 * PT (leigo): monta, sem tela e sem rede, os quatro formatos do comparativo de
 *     cenários — planilha CSV, arquivo JSON, planilha Excel e relatório
 *     Markdown de leitura humana. Base, cada cenário alternativo, as diferenças
 *     e os ODS afetados. Todos saem da MESMA porta de dados: nenhum
 *     identificador interno do modelo vai para arquivo nenhum. Quem baixa o
 *     arquivo é a camada de tela.
 *
 * Pure: sem DOM, sem rede, sem relógio interno (timestamp de export injetado).
 * Retornos congelados. Cheap tests: tests/scenario-comparator-export-pure.test.mjs
 * (CSV/JSON) e tests/scenario-comparator-export-xlsx-md.test.mjs (XLSX/MD).
 */

import type { MultiScenarioComparatorVM, MultiScenarioColumn } from './_multiScenarioVMPure.js';
import type { Dimension, DeltaSinal } from './_scenarioComparatorVMPure.js';

/** Versão do schema de export — bump quando colunas/campos mudam (interop). */
export const SCENARIO_EXPORT_SCHEMA_VERSION = '1.0';

/**
 * Ordem canônica das colunas do CSV (formato LONGO, estável para N cenários:
 * uma linha por dimensão × coluna). Whitelist — nada além disto sai no arquivo.
 */
export const SCENARIO_EXPORT_HEADERS: readonly string[] = Object.freeze([
    'dimension',
    'unit',
    'column',
    'is_base',
    'value',
    'delta_vs_base',
    'trend',
]);

/** Ordem canônica das dimensões exportadas (igual à tabela). */
const DIMENSIONS: readonly Dimension[] = Object.freeze(['capex', 'opex', 'ecbt', 'ods']);

/** Número finito ou string vazia (não deixa NaN/Infinity/null vazar como 0). */
function safeNum(value: unknown): number | '' {
    const n = Number(value);
    return typeof value === 'number' && Number.isFinite(n) ? n : '';
}

/** Sinal qualitativo → token estável de interop (não traduzido). */
function trendToken(sinal: DeltaSinal): string {
    switch (sinal) {
        case 'melhora':
            return 'improves';
        case 'piora':
            return 'worsens';
        case 'neutro':
            return 'neutral';
        default:
            return 'no_data';
    }
}

/**
 * Uma célula já FILTRADA pela whitelist — a única porta de saída de dado deste
 * módulo. CSV, XLSX e Markdown derivam todos daqui, portanto é impossível um
 * formato vazar um campo que os outros não têm (a whitelist é estrutural, não
 * uma convenção repetida em 3 lugares). Interno: não é API pública.
 */
interface ExportCell {
    readonly dimension: Dimension;
    readonly unit: string;
    /** Índice estável da coluna na VM (0 = Base; 1..N = cenários). */
    readonly columnIndex: number;
    readonly columnLabel: string;
    readonly isBase: boolean;
    /** Valor da dimensão, ou '' quando ausente (N3 — nunca 0 forjado). */
    readonly value: number | '';
    /** Δ vs. base; sempre '' na coluna Base (ela É a referência). */
    readonly delta: number | '';
    /** Token de interop da tendência; sempre '' na coluna Base. */
    readonly trend: string;
}

/**
 * Percorre a VM na ordem canônica (dimensão × coluna) e devolve só os campos
 * whitelisted. Célula ausente é PULADA (não vira linha fantasma). VM
 * inválido/ausente → lista vazia (fail-safe).
 */
function collectExportCells(vm: MultiScenarioComparatorVM | null | undefined): readonly ExportCell[] {
    const columns: readonly MultiScenarioColumn[] = vm && Array.isArray(vm.columns) ? vm.columns : [];
    const cells: ExportCell[] = [];
    for (const dim of DIMENSIONS) {
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i]!;
            const cell = col?.dims?.[dim];
            if (!cell) continue;
            const isBase = !!col.isBase;
            cells.push({
                dimension: dim,
                unit: String(cell.unidade ?? ''),
                columnIndex: typeof col.index === 'number' ? col.index : i,
                columnLabel: String(col.label ?? ''),
                isBase,
                value: safeNum(cell.value),
                delta: isBase ? '' : safeNum(cell.delta),
                trend: isBase ? '' : trendToken(cell.sinal),
            });
        }
    }
    return cells;
}

/**
 * Monta headers + linhas do CSV do comparativo em formato LONGO: uma linha por
 * (dimensão × coluna), estável para qualquer N de cenários. Consumir com
 * `toCsv` do helper. VM inválido/ausente → zero linhas (fail-safe).
 */
export function buildScenarioComparatorExportRows(
    vm: MultiScenarioComparatorVM | null | undefined,
): { readonly headers: readonly string[]; readonly rows: (string | number)[][] } {
    const rows: (string | number)[][] = collectExportCells(vm).map((c) => [
        c.dimension,
        c.unit,
        c.columnLabel,
        c.isBase ? 1 : 0,
        c.value,
        c.delta,
        c.trend,
    ]);
    return Object.freeze({ headers: SCENARIO_EXPORT_HEADERS, rows });
}

/** JSON portável do comparativo (whitelist — sem ids internos). */
export interface ScenarioComparatorExportJson {
    readonly schemaVersion: string;
    readonly exportedAtIso: string;
    /** Procedência honesta dos números (CFG-01): modelo real vs. exemplo. */
    readonly dataSource: 'real' | 'example';
    readonly columns: ReadonlyArray<{
        readonly label: string;
        readonly isBase: boolean;
        readonly dims: Record<
            Dimension,
            { readonly value: number | null; readonly deltaVsBase: number | null; readonly trend: string }
        >;
    }>;
    readonly odsAfetados: ReadonlyArray<{
        readonly goal: number;
        readonly indicator: string;
        readonly source: string;
        readonly trend: string;
    }>;
}

/** Converte epoch ms → ISO 8601 UTC; valor inválido vira string vazia (fail-safe). */
function toIso(ms: unknown): string {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return '';
    try {
        return new Date(n).toISOString();
    } catch {
        return '';
    }
}

/**
 * Monta o objeto JSON portável do comparativo (clock injetado, congelado,
 * seguro para JSON.stringify direto). Só campos da WHITELIST: rótulo, valores
 * por dimensão, Δ vs. base, tendência e ODS citáveis — nenhum id interno de
 * elemento, seed ou campo de bookkeeping.
 *
 * SCENARIOS-IMPACT-001#json-fora-da-porta-unica (fix 2026-07-20): antes esta
 * função iterava vm.columns diretamente com uma whitelist PARALELA à de
 * collectExportCells — drift silencioso entre JSON e CSV/XLSX/MD. Agora deriva
 * da MESMA porta (collectExportCells), garantindo que os 4 formatos emitem
 * exatamente os mesmos campos. A diferença é só de shape (JSON é wide, CSV é
 * long), mas os VALORES e a WHITELIST são idênticos por construção.
 *
 * @param vm VM multi-cenário (Base + N colunas).
 * @param dataSource Procedência dos números ('real' | 'example') — honestidade CFG-01.
 * @param exportedAtMs Epoch ms do momento do export (injetado).
 */
export function buildScenarioComparatorExportJson(
    vm: MultiScenarioComparatorVM | null | undefined,
    dataSource: 'real' | 'example',
    exportedAtMs: number,
): ScenarioComparatorExportJson {
    // PORTA ÚNICA: mesmo collectExportCells do CSV/XLSX/MD — garante que nenhum
    // campo fora da whitelist vaze pelo JSON (drift entre formatos eliminado).
    const cells = collectExportCells(vm);
    const ods = vm && Array.isArray(vm.odsAfetados) ? vm.odsAfetados : [];

    // Reagrupa cells (formato longo) → colunas (formato wide do JSON).
    // columnIndex é a chave estável (rótulos podem repetir).
    const columnsByIndex = new Map<number, { label: string; isBase: boolean; cells: Map<Dimension, ExportCell> }>();
    for (const cell of cells) {
        let col = columnsByIndex.get(cell.columnIndex);
        if (!col) {
            col = { label: cell.columnLabel, isBase: cell.isBase, cells: new Map() };
            columnsByIndex.set(cell.columnIndex, col);
        }
        col.cells.set(cell.dimension, cell);
    }

    return Object.freeze({
        schemaVersion: SCENARIO_EXPORT_SCHEMA_VERSION,
        exportedAtIso: toIso(exportedAtMs) || toIso(Date.now()),
        dataSource: dataSource === 'real' ? 'real' : 'example',
        columns: Object.freeze(
            [...columnsByIndex.values()].map((col) => {
                const dims = {} as Record<
                    Dimension,
                    { readonly value: number | null; readonly deltaVsBase: number | null; readonly trend: string }
                >;
                for (const dim of DIMENSIONS) {
                    const cell = col.cells.get(dim);
                    dims[dim] = Object.freeze({
                        value: cell && cell.value !== '' ? cell.value : null,
                        deltaVsBase: !col.isBase && cell && cell.delta !== '' ? cell.delta : null,
                        trend: col.isBase ? 'base' : (cell?.trend ?? 'no_data'),
                    });
                }
                return Object.freeze({
                    label: col.label,
                    isBase: col.isBase,
                    dims: Object.freeze(dims),
                });
            }),
        ),
        odsAfetados: Object.freeze(
            ods.map((o) =>
                Object.freeze({
                    goal: Number(o?.goal ?? 0),
                    indicator: String(o?.indicator ?? ''),
                    source: String(o?.source ?? ''),
                    trend: trendToken(o?.sinal ?? 'semDado'),
                }),
            ),
        ),
    });
}

// ────────────────────────────── XLSX (planilha) ──────────────────────────────

/** Nome da aba (sheet) da planilha exportada. */
export const SCENARIO_EXPORT_SHEET_NAME = 'Comparativo';

/** Largura mínima/máxima de coluna, em caracteres — só apresentação. */
const SHEET_MIN_COL_WIDTH = 10;
const SHEET_MAX_COL_WIDTH = 42;

/**
 * Planilha WORKBOOK-AGNÓSTICA do comparativo: a matriz pronta para o
 * `aoa_to_sheet` do SheetJS. Este módulo NÃO conhece SheetJS — o encoding do
 * .xlsx é da camada de runtime, mesma divisão de responsabilidade de
 * `_auditTrailXlsxBuilderPure` (spec pura) → exporter (wire DOM).
 */
export interface ScenarioComparatorSheetSpec {
    readonly sheetName: string;
    readonly headers: readonly string[];
    /** Linha 0 = headers; 1..N = as MESMAS linhas do CSV (whitelist idêntica). */
    readonly aoa: ReadonlyArray<ReadonlyArray<string | number>>;
    /** Largura sugerida por coluna, em caracteres (`!cols`/`wch` do SheetJS). */
    readonly columnWidths: readonly number[];
    /** Linhas de DADO (não conta o header). */
    readonly rowCount: number;
}

/**
 * Monta a planilha do comparativo: a MESMA matriz do CSV (mesma whitelist, mesma
 * ordem — derivada da mesma função), acrescida das larguras de coluna para a
 * planilha abrir legível. VM inválido/ausente → só a linha de header (fail-safe).
 *
 * @param vm VM multi-cenário (Base + N colunas).
 */
export function buildScenarioComparatorExportSheet(
    vm: MultiScenarioComparatorVM | null | undefined,
): ScenarioComparatorSheetSpec {
    const { headers, rows } = buildScenarioComparatorExportRows(vm);
    const aoa: ReadonlyArray<ReadonlyArray<string | number>> = [
        Object.freeze([...headers]),
        ...rows.map((r) => Object.freeze([...r])),
    ];
    const columnWidths = headers.map((header, i) => {
        let widest = String(header).length;
        for (const row of rows) {
            const len = String(row[i] ?? '').length;
            if (len > widest) widest = len;
        }
        return Math.min(SHEET_MAX_COL_WIDTH, Math.max(SHEET_MIN_COL_WIDTH, widest + 2));
    });
    return Object.freeze({
        sheetName: SCENARIO_EXPORT_SHEET_NAME,
        headers,
        aoa: Object.freeze(aoa),
        columnWidths: Object.freeze(columnWidths),
        rowCount: rows.length,
    });
}

// ─────────────────────────── Markdown (leitura humana) ───────────────────────

/**
 * Rótulos de apresentação do relatório Markdown. Os defaults são pt-BR (mesma
 * postura de `_auditTrailMarkdownPure`, que hardcoda o esqueleto e deixa os
 * rótulos de domínio injetáveis); o runtime passa os traduzidos do i18n.
 */
export interface ScenarioMarkdownOptions {
    /** Título H1 do relatório. */
    readonly title?: string;
    /** Rótulo humano por dimensão (o painel já os tem no i18n). */
    readonly dimensionLabels?: Partial<Record<Dimension, string>>;
    /** Palavra por tendência, chaveada pelo TOKEN de interop ('improves'…). */
    readonly trendLabels?: Readonly<Record<string, string>>;
    /** Texto quando falta dado (N3 — nunca 0 forjado). */
    readonly noDataLabel?: string;
}

const MD_DEFAULT_TITLE = 'Comparativo de cenários — ECBT';
const MD_DEFAULT_NO_DATA = 'sem dado';
/** Título da seção que LISTA os ODS (a tabela acima traz só a contagem). */
const MD_ODS_SECTION_TITLE = 'ODS afetados — indicadores citáveis';

const MD_DEFAULT_DIMENSION_LABELS: Readonly<Record<Dimension, string>> = Object.freeze({
    capex: 'Investimento (CAPEX)',
    opex: 'Custo operacional (OPEX)',
    ecbt: 'ECBT Score (líquido)',
    ods: 'ODS afetados',
});

const MD_DEFAULT_TREND_LABELS: Readonly<Record<string, string>> = Object.freeze({
    improves: 'melhora',
    worsens: 'piora',
    neutral: 'neutro',
    no_data: 'sem dado',
});

/** Glyph direcional por tendência (não-só-cor, A11y) — igual ao painel. */
const MD_TREND_GLYPH: Readonly<Record<string, string>> = Object.freeze({
    improves: '▲',
    worsens: '▼',
    neutral: '▬',
    no_data: '–',
});

/** Escapa uma célula de tabela Markdown (pipe e quebra de linha quebram a tabela). */
function mdCell(value: unknown): string {
    return String(value ?? '')
        .replace(/\|/g, '\\|')
        .replace(/\r?\n/g, ' ');
}

/** Renderiza um Δ legível: glyph + sinal + valor + palavra da tendência. */
function mdDelta(cell: ExportCell, trendLabels: Readonly<Record<string, string>>, noData: string): string {
    if (cell.delta === '') return `_${mdCell(noData)}_`;
    const glyph = MD_TREND_GLYPH[cell.trend] ?? '–';
    const word = trendLabels[cell.trend] ?? cell.trend;
    const sign = cell.delta > 0 ? '+' : '';
    return `${glyph} ${sign}${mdCell(cell.delta)} (${mdCell(word)})`;
}

/**
 * Monta o relatório Markdown do comparativo — tabela LARGA que espelha a tela
 * (uma linha por dimensão; colunas Base + par valor/Δ por cenário), pensada para
 * colar em relatório, e-mail ou PR. Formato humano, mas os NÚMEROS são os mesmos
 * do CSV/JSON (derivam da mesma whitelist) — "o export bate com a tela".
 *
 * Números saem crus (sem `Intl`) de propósito: o arquivo é byte-estável e não
 * depende de locale, igual à postura de `_statementExportPure`.
 *
 * @param vm VM multi-cenário (Base + N colunas).
 * @param dataSource Procedência dos números ('real' | 'example') — honestidade CFG-01.
 * @param exportedAtMs Epoch ms do momento do export (injetado).
 * @param options Rótulos de apresentação (i18n injetado pelo runtime).
 */
export function buildScenarioComparatorMarkdown(
    vm: MultiScenarioComparatorVM | null | undefined,
    dataSource: 'real' | 'example',
    exportedAtMs: number,
    options?: ScenarioMarkdownOptions,
): string {
    const cells = collectExportCells(vm);
    const noData = options?.noDataLabel || MD_DEFAULT_NO_DATA;
    const dimLabels: Record<Dimension, string> = { ...MD_DEFAULT_DIMENSION_LABELS, ...(options?.dimensionLabels ?? {}) };
    const trendLabels: Readonly<Record<string, string>> = { ...MD_DEFAULT_TREND_LABELS, ...(options?.trendLabels ?? {}) };
    const iso = toIso(exportedAtMs) || toIso(Date.now());
    // Procedência SEMPRE explícita: o leitor do arquivo nunca confunde exemplo
    // com modelo real (guard-rail CFG-01, igual ao banner do painel).
    const sourceTxt =
        dataSource === 'real'
            ? 'dados REAIS do modelo'
            : 'dados de EXEMPLO (não são do modelo real)';

    const lines: string[] = [];
    lines.push(`# ${mdCell(options?.title || MD_DEFAULT_TITLE)}`);
    lines.push('');
    lines.push(
        `> **Fonte dos dados**: ${sourceTxt} · **Gerado em**: ${iso} · **Schema**: ${SCENARIO_EXPORT_SCHEMA_VERSION}`,
    );
    lines.push('');

    // Colunas na ordem de aparição, chaveadas pelo ÍNDICE estável da VM (rótulos
    // são sobrescrevíveis pelo usuário e podem repetir — índice nunca repete).
    const columns: { readonly index: number; readonly label: string; readonly isBase: boolean }[] = [];
    const seen = new Set<number>();
    for (const c of cells) {
        if (seen.has(c.columnIndex)) continue;
        seen.add(c.columnIndex);
        columns.push({ index: c.columnIndex, label: c.columnLabel, isBase: c.isBase });
    }

    if (columns.length === 0) {
        lines.push(`_${mdCell(noData)}_`);
        lines.push('');
        return lines.join('\n');
    }

    const byKey = new Map<string, ExportCell>();
    for (const c of cells) byKey.set(`${c.dimension} ${c.columnIndex}`, c);

    const head: string[] = ['Dimensão', 'Unidade'];
    const align: string[] = ['---', '---'];
    for (const col of columns) {
        head.push(mdCell(col.label));
        align.push('---:');
        if (col.isBase) continue;
        head.push('Δ vs. base');
        align.push('---:');
    }
    lines.push(`| ${head.join(' | ')} |`);
    lines.push(`| ${align.join(' | ')} |`);

    for (const dim of DIMENSIONS) {
        const dimCells = columns.map((col) => byKey.get(`${dim} ${col.index}`));
        if (dimCells.every((c) => !c)) continue; // dimensão inteira ausente → sem linha
        const unit = dimCells.find((c) => c && c.unit)?.unit ?? '';
        const row: string[] = [mdCell(dimLabels[dim]), unit ? mdCell(unit) : '—'];
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i]!;
            const cell = dimCells[i];
            row.push(cell && cell.value !== '' ? mdCell(cell.value) : `_${mdCell(noData)}_`);
            if (col.isBase) continue;
            row.push(cell ? mdDelta(cell, trendLabels, noData) : `_${mdCell(noData)}_`);
        }
        lines.push(`| ${row.join(' | ')} |`);
    }

    // A LINHA da tabela acima traz a CONTAGEM de ODS afetados; esta seção traz a
    // LISTA citável. Título próprio para os dois não se confundirem no relatório.
    const ods = vm && Array.isArray(vm.odsAfetados) ? vm.odsAfetados : [];
    lines.push('');
    lines.push(`## ${MD_ODS_SECTION_TITLE}`);
    lines.push('');
    if (ods.length === 0) {
        lines.push(`_${mdCell(noData)}_`);
    } else {
        lines.push('| ODS | Indicador | Tendência | Fonte |');
        lines.push('| ---: | --- | --- | --- |');
        for (const o of ods) {
            const token = trendToken(o?.sinal ?? 'semDado');
            const glyph = MD_TREND_GLYPH[token] ?? '–';
            const word = trendLabels[token] ?? token;
            lines.push(
                `| ${mdCell(Number(o?.goal ?? 0))} | ${mdCell(o?.indicator ?? '')} | ` +
                    `${glyph} ${mdCell(word)} | ${mdCell(o?.source ?? '')} |`,
            );
        }
    }

    lines.push('');
    lines.push('---');
    lines.push(`_ecbyts · SCENARIOS-IMPACT-001 (S4/CFG-38) · ${columns.length} coluna(s) comparada(s)_`);
    lines.push('');
    return lines.join('\n');
}

// ───────────────────────────────── Filename ──────────────────────────────────

/** Formatos de arquivo suportados pelo export do comparativo. */
export type ScenarioExportKind = 'csv' | 'json' | 'xlsx' | 'md';

/** Nome de arquivo sugerido (sem barra/dois-pontos) p/ o download do export. */
export function buildScenarioExportFilename(kind: ScenarioExportKind, exportedAtMs: number): string {
    const iso = toIso(exportedAtMs) || toIso(Date.now());
    const datePart = iso.slice(0, 10) || 'export';
    return `ecbt-cenarios-comparativo-${datePart}.${kind}`;
}
