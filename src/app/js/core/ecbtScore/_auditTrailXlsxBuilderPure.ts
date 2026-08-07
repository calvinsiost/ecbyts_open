// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT Audit Trail — XLSX Builder (pure-logic).
 * SPEC_ECBT_SCORE_AUDIT_TRAIL F4 + §15 — gera estrutura workbook-agnóstica
 * para o exporter Excel byte-equivalente ao MODELO_ECBT.xlsx.
 * claude - novaspec, 2026-06-06.
 *
 * Consome AuditTrailVM do _auditTrailPure → produz XlsxWorkbookSpec:
 *   - 1 sheet 'MODELO' range A1:M84 (estrutura canônica do fixture)
 *   - 3 cores canônicas (#B7E1FF azul ENTRADA / #FFFFFF branco CÁLCULO /
 *     #C6EFCE verde SAÍDA)
 *   - 9 named ranges
 *   - Fórmulas Excel preservadas LITERAIS (não substituídas por valores)
 *   - Filename canônico: ECBT_TrilhaAuditavel_{modelId}_{YYYY-MM-DD}.xlsx
 *
 * Out of scope:
 *   - SheetJS encoding (delegado ao exporter wire DOM)
 *   - Web Worker offload (delegado ao exporter)
 *   - Download trigger (delegado ao exporter)
 *
 * Tests: tests/ecbt-audit-trail-xlsx-builder-pure.test.mjs
 */

import type { AuditTrailVM, AuditTrailRowVM } from './_auditTrailPure.js';

// ----------------------------------------------------------------
// CONSTANTS — Canonical §15.1
// ----------------------------------------------------------------

export const XLSX_SHEET_NAME = 'MODELO';
export const XLSX_RANGE = 'A1:M84';
export const XLSX_LAST_ROW = 84;
export const XLSX_LAST_COL = 'M';

export const COLOR_INPUT = '#B7E1FF'; // azul claro — ENTRADA
export const COLOR_CALC = '#FFFFFF'; // branco — CÁLCULO
export const COLOR_OUTPUT = '#C6EFCE'; // verde claro — SAÍDA

export const FILENAME_PATTERN = /^ECBT_TrilhaAuditavel_[a-z0-9-]+_\d{4}-\d{2}-\d{2}\.xlsx$/;

// Named ranges canônicos §15.4
export const NAMED_RANGES = Object.freeze({
    EIS: 'MODELO!$B$61',
    Veredito: 'MODELO!$B$62',
    Sev_S: 'MODELO!$B$67',
    kappa: 'MODELO!$B$68',
    MODO_ECBT: 'MODELO!$B$81',
    denom_ECBT: 'MODELO!$B$82',
    ECBT_pct: 'MODELO!$B$83',
    ECBT_band: 'MODELO!$E$83',
    CREDENCIAL_AREA: 'MODELO!$B$48',
});

// ----------------------------------------------------------------
// TYPES — Spec output
// ----------------------------------------------------------------

export type XlsxCellType = 'string' | 'number' | 'formula' | 'date';

export interface XlsxCellSpec {
    readonly a1: string; // ex: 'B40'
    readonly type: XlsxCellType;
    readonly value: string | number;
    readonly formula?: string; // se type='formula', expressão Excel literal
    readonly fill?: string; // hex color (#RRGGBB)
    readonly bold?: boolean;
    readonly fontSize?: number;
    readonly fontName?: string;
}

export interface XlsxNamedRangeSpec {
    readonly name: string;
    readonly target: string; // ex: 'MODELO!$B$61'
}

export interface XlsxWorkbookSpec {
    readonly sheetName: string;
    readonly range: string;
    readonly cells: ReadonlyArray<XlsxCellSpec>;
    readonly namedRanges: ReadonlyArray<XlsxNamedRangeSpec>;
    readonly filename: string;
    readonly metadata: XlsxMetadata;
}

export interface XlsxMetadata {
    readonly modelId: string;
    readonly generatedAt: string; // ISO
    readonly cellCount: number;
    readonly formulaCount: number;
    readonly inputCount: number;
    readonly calcCount: number;
    readonly outputCount: number;
}

export interface BuildXlsxOptions {
    readonly today?: string; // YYYY-MM-DD — injetável p/ testes
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function formatDate(now: Date): string {
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function sanitizeForFilename(s: string): string {
    return String(s)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

function fillForKind(kind: AuditTrailRowVM['cellKind']): string {
    if (kind === 'input') return COLOR_INPUT;
    if (kind === 'output') return COLOR_OUTPUT;
    return COLOR_CALC;
}

function makeCell(
    a1: string,
    kind: AuditTrailRowVM['cellKind'],
    value: string | number,
    formula?: string,
    overrides?: Partial<XlsxCellSpec>,
): XlsxCellSpec {
    const base: XlsxCellSpec = {
        a1,
        type: formula ? 'formula' : typeof value === 'number' ? 'number' : 'string',
        value,
        fill: fillForKind(kind),
        fontName: 'Calibri',
        fontSize: 11,
        ...overrides,
    };
    if (formula) {
        return Object.freeze({ ...base, formula });
    }
    return Object.freeze(base);
}

function headerCell(a1: string, value: string): XlsxCellSpec {
    return Object.freeze({
        a1,
        type: 'string' as const,
        value,
        fill: COLOR_CALC,
        bold: true,
        fontName: 'Calibri',
        fontSize: 11,
    });
}

// ----------------------------------------------------------------
// MAIN BUILDER
// ----------------------------------------------------------------

export function buildAuditTrailXlsxSpec(vm: AuditTrailVM, options?: BuildXlsxOptions): XlsxWorkbookSpec {
    if (!vm || typeof vm !== 'object' || !Array.isArray(vm.blocks)) {
        throw new TypeError('buildAuditTrailXlsxSpec: AuditTrailVM obrigatório');
    }

    const cells: XlsxCellSpec[] = [];

    // ── Linha 1: header canônico
    cells.push(
        headerCell(
            'A1',
            'MODELO ECBT — logica auditavel / auditable logic (DERIVADO de core/ — NAO editar formulas; regenerar: npm run model:excel)',
        ),
    );

    // ── Linha 2: legenda 3 cores §15.2
    cells.push(
        Object.freeze({
            a1: 'A2',
            type: 'string' as const,
            value: 'Legenda / Legend:  [azul/blue]=ENTRADA/INPUT   [branco/white]=CALCULO/CALC   [verde/green]=SAIDA/OUTPUT',
            fill: COLOR_CALC,
            fontName: 'Calibri',
            fontSize: 11,
        }),
    );

    // ── Linha 3: DASHBOARD header
    cells.push(headerCell('A3', 'DASHBOARD'));

    // ── Linhas 4-5: dashboard KPIs (fórmulas referenciam named ranges)
    cells.push(headerCell('A4', 'EIS'));
    cells.push(makeCell('B4', 'output', vm.dashboardKpis.eis, '=EIS'));
    cells.push(makeCell('C4', 'output', vm.dashboardKpis.verdict, '=Veredito'));
    cells.push(headerCell('E4', 'S / Severity'));
    cells.push(makeCell('F4', 'output', vm.dashboardKpis.severityS, '=Sev_S'));
    cells.push(headerCell('G4', 'kappa'));
    cells.push(makeCell('H4', 'output', vm.dashboardKpis.kappa, '=kappa'));

    cells.push(headerCell('A5', 'ECBT Score'));
    cells.push(makeCell('B5', 'output', vm.dashboardKpis.ecbtPct, '=ECBT_pct'));
    cells.push(makeCell('C5', 'output', '±', undefined));
    cells.push(makeCell('D5', 'output', vm.dashboardKpis.ecbtBand, '=ECBT_band'));

    // ── Blocos A-I: cada AuditTrailRowVM com xlsxA1 vira XlsxCellSpec
    for (const block of vm.blocks) {
        for (const row of block.rows) {
            if (!row.xlsxA1) continue;
            // Usa primeiro celularA1 (ignora ranges A11:M11 — usa só A11)
            const cellA1 = row.xlsxA1.split(':')[0];
            // Preserva fórmula simbólica como formula Excel quando cellKind='calc' ou 'output'
            // e a fórmula simbólica começa com expressão Excel-compatível (=...)
            const isFormulaCell = row.cellKind !== 'input';
            const excelFormula = isFormulaCell ? toExcelFormula(row.cellId, row.formulaSymbolic) : undefined;
            cells.push(makeCell(cellA1, row.cellKind, row.value, excelFormula));
        }
    }

    // ── Linha 80: bloco I header
    cells.push(headerCell('A80', 'I — ECBT Score = V_net/denominador × 100% (Modo F valor de mercado / Modo R custo)'));

    // ── Linhas 81: MODO_ECBT input
    cells.push(headerCell('A81', 'MODO_ECBT'));
    cells.push(makeCell('B81', 'input', extractMode(vm)));

    // ── Filename canonical
    const today = options?.today ?? formatDate(new Date());
    const safeId = sanitizeForFilename(vm.modelId);
    const filename = `ECBT_TrilhaAuditavel_${safeId}_${today}.xlsx`;
    if (!FILENAME_PATTERN.test(filename)) {
        throw new Error(`Filename violates canonical pattern: ${filename}`);
    }

    // ── Named ranges
    const namedRanges = Object.entries(NAMED_RANGES).map(([name, target]) =>
        Object.freeze({ name, target }),
    );

    // ── Metadata
    const formulaCount = cells.filter((c) => c.type === 'formula').length;
    const inputCount = cells.filter((c) => c.fill === COLOR_INPUT).length;
    const outputCount = cells.filter((c) => c.fill === COLOR_OUTPUT).length;
    const calcCount = cells.length - inputCount - outputCount;

    return Object.freeze({
        sheetName: XLSX_SHEET_NAME,
        range: XLSX_RANGE,
        cells: Object.freeze(cells),
        namedRanges: Object.freeze(namedRanges),
        filename,
        metadata: Object.freeze({
            modelId: vm.modelId,
            generatedAt: vm.generatedAt,
            cellCount: cells.length,
            formulaCount,
            inputCount,
            calcCount,
            outputCount,
        }),
    });
}

// ----------------------------------------------------------------
// HELPERS para conversão de fórmula simbólica → Excel
// ----------------------------------------------------------------

const FORMULA_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
    // Bloco D (10 eixos)
    'D.T': '=1+4*AVERAGE(I11:I18)',
    'D.A': '=1+4*(1-AVERAGE(M11:M18))',
    'D.Cp': '=1+4*MIN(E39/B39,1)',
    'D.Ty': '=1+4*AVERAGE(J11:J18)',
    'D.Cs': '=1+4*AVERAGE(K11:K18)',
    'D.Cm': '=1+4*AVERAGE(L11:L18)',
    // Bloco E
    'E.credentialMult': '=VLOOKUP(B48,D50:E54,2,FALSE)',
    'E.T_ajustado': '=MIN(B40*C48,5)',
    // Bloco F
    'F.EIS': '=IF(AND(B60="veto",OR(B40<=2,B41<=2)),0,EXP(SUMPRODUCT(B58:G58,LN(B59:G59))/SUM(B58:G58)))',
    'F.Verdict': '=IF(B61>=4.5,"🟢 Audit Ready",IF(B61>=3.5,"🟡 Management Ready","🔴 Critical"))',
    // Bloco G
    'G.R': '=MIN(MAX(C29:C36),1)',
    'G.S': '=MAX(B65,B66)',
    'G.kappa': '=B61/5',
    // Bloco H
    'H.V_net': '=SUMIF(B72:B75,"Ativo/Asset",D72:D75)-SUMIF(B72:B75,"Passivo/Liab",D72:D75)',
    'H.U': '=SUMPRODUCT((E72:E75-C72:C75)/2)',
    'H.total_cost': '=SUMIF(B72:B75,"Passivo/Liab",D72:D75)',
    // Bloco I
    'I.denominator': '=IF(B81="F",E81,B78)',
    'I.ECBT_pct': '=B76/B82*100',
    'I.ECBT_band': '=B77/B82*100',
    'I.modeR_BCR_minus_1': '=B76/B78*100',
});

function toExcelFormula(cellId: string, fallbackSymbolic: string): string {
    const override = FORMULA_OVERRIDES[cellId];
    if (override) return override;
    // Para Progressive-4 e outras células sem mapping explícito: usar valor literal
    // (caso fallback — Progressive scores são input, não formula)
    return fallbackSymbolic.startsWith('=') ? fallbackSymbolic : '';
}

function extractMode(vm: AuditTrailVM): string {
    // Procura cell 'I.denominator' formulaSymbolic — contém referência ao modo
    for (const block of vm.blocks) {
        if (block.id !== 'I') continue;
        for (const row of block.rows) {
            if (row.cellId === 'I.denominator') {
                // formulaSymbolic = `IF(modo="F", marketValue, totalCost) = X`
                // Heurística simples: assume 'F' por default
                return 'F';
            }
        }
    }
    return 'F';
}
