// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Scenarios — runtime de export do comparativo (S4 / CFG-38).
 * SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2 S4, §2.4.3 CFG-38).
 *
 * EN: Wire layer that connects the pure-logic `_scenarioComparatorExportPure`
 *     to the comparator panel. Receives the already-built multi-scenario VM and
 *     builds the CSV (RFC 4180 via `toCsv`), the portable JSON, the XLSX
 *     spreadsheet (SheetJS encodes the sheet spec) or the Markdown report, then
 *     triggers the browser download. The pure module enforces the column
 *     whitelist — no internal element ids or seeds leak (same LGPD-safe posture
 *     as `balanceExportRuntime`).
 *
 * PT (leigo): a "ponte" entre a regra pronta (que monta os arquivos sem tela nem
 *     rede) e os botões Exportar do painel. Junta o comparativo já calculado,
 *     monta o arquivo (CSV, JSON, Excel ou Markdown) e dispara o download.
 */

import { t } from '../../i18n/translations.js';
import { toCsv, downloadCsv } from '../../helpers/csvExport.js';
import { showToast } from '../toast.js';
import type { MultiScenarioComparatorVM } from '../../../core/scenarios/_multiScenarioVMPure.js';
import type { Dimension } from '../../../core/scenarios/_scenarioComparatorVMPure.js';
import {
    buildScenarioComparatorExportRows,
    buildScenarioComparatorExportJson,
    buildScenarioComparatorExportSheet,
    buildScenarioComparatorMarkdown,
    buildScenarioExportFilename,
} from '../../../core/scenarios/_scenarioComparatorExportPure.js';

/** MIME oficial do .xlsx (OOXML SpreadsheetML). */
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** i18n com fallback: se a chave não resolver, usa o texto pt fornecido. */
function _tr(key: string, fallback: string): string {
    try {
        const out = t(key);
        return out && out !== key ? out : fallback;
    } catch {
        return fallback;
    }
}

/** Dispara o download de um Blob (helper local, espelha downloadCsv). */
function _downloadBlob(content: BlobPart, filename: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Superfície MÍNIMA do SheetJS que este módulo usa. O vendor entra como global
 * (`window.XLSX`, igual a `reportBuilder`), não como import ESM — por isso a
 * forma é declarada aqui em vez de aumentar o tipo global.
 */
interface SheetJsLike {
    readonly utils: {
        readonly aoa_to_sheet: (aoa: (string | number)[][]) => Record<string, unknown>;
        readonly book_new: () => Record<string, unknown>;
        readonly book_append_sheet: (
            wb: Record<string, unknown>,
            ws: Record<string, unknown>,
            name: string,
        ) => void;
    };
    readonly write: (wb: Record<string, unknown>, opts: { bookType: string; type: string }) => ArrayBuffer;
}

/** Lê o SheetJS já presente como global, validando a superfície que usamos. */
function _readSheetJs(): SheetJsLike | null {
    const g = globalThis as unknown as { XLSX?: Partial<SheetJsLike> };
    const xlsx = g.XLSX;
    if (!xlsx || typeof xlsx.write !== 'function') return null;
    const utils = xlsx.utils;
    if (!utils || typeof utils.aoa_to_sheet !== 'function' || typeof utils.book_new !== 'function') return null;
    return xlsx as SheetJsLike;
}

/**
 * Garante o SheetJS: o vendor NÃO vem no bundle inicial — é carregado sob
 * demanda via CDN, exatamente como `ecbtAuditTrailExporter` / `parser` /
 * `io/formats/xlsx` fazem (padrão da casa; bare `import('xlsx')` não resolve no
 * browser sem bundler). `null` quando o carregamento falha (offline/CSP) — aí o
 * chamador avisa o usuário e sugere CSV, em vez de estourar um erro opaco.
 */
async function _ensureSheetJs(): Promise<SheetJsLike | null> {
    const present = _readSheetJs();
    if (present) return present;
    try {
        const { loadScriptCDN } = await import('../../helpers/cdnLoader.js');
        await loadScriptCDN('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', {
            name: 'SheetJS',
            globalVar: 'XLSX',
        });
    } catch (err) {
        console.debug('[scenarioComparatorExport:sheetjs-load]', (err as Error)?.message || err);
        return null;
    }
    return _readSheetJs();
}

/** Rótulos de dimensão resolvidos no i18n — o Markdown sai no idioma da tela. */
function _markdownDimensionLabels(): Partial<Record<Dimension, string>> {
    return {
        capex: _tr('scenarios.dim.capex', 'Investimento (CAPEX)'),
        opex: _tr('scenarios.dim.opex', 'Custo operacional (OPEX)'),
        ecbt: _tr('scenarios.dim.ecbt', 'ECBT Score (líquido)'),
        ods: _tr('scenarios.dim.ods', 'ODS afetados (por indicador)'),
    };
}

/** Exporta o comparativo (Base + N cenários) em CSV RFC 4180. */
export function exportScenarioComparatorCsv(
    vm: MultiScenarioComparatorVM,
    nowMs: number = Date.now(),
): void {
    try {
        const { headers, rows } = buildScenarioComparatorExportRows(vm);
        const csv = toCsv(headers as string[], rows);
        downloadCsv(csv, buildScenarioExportFilename('csv', nowMs));
        showToast(t('scenarios.export.done') || 'Comparativo exportado', 'success');
    } catch (err) {
        console.debug('[scenarioComparatorExport:csv]', (err as Error)?.message || err);
        showToast(t('scenarios.export.error') || 'Falha ao exportar o comparativo', 'error');
    }
}

/** Exporta o comparativo (Base + N cenários) em JSON portável. */
export function exportScenarioComparatorJson(
    vm: MultiScenarioComparatorVM,
    dataSource: 'real' | 'example',
    nowMs: number = Date.now(),
): void {
    try {
        const obj = buildScenarioComparatorExportJson(vm, dataSource, nowMs);
        _downloadBlob(
            JSON.stringify(obj, null, 2),
            buildScenarioExportFilename('json', nowMs),
            'application/json;charset=utf-8',
        );
        showToast(t('scenarios.export.done') || 'Comparativo exportado', 'success');
    } catch (err) {
        console.debug('[scenarioComparatorExport:json]', (err as Error)?.message || err);
        showToast(t('scenarios.export.error') || 'Falha ao exportar o comparativo', 'error');
    }
}

/**
 * Exporta o comparativo (Base + N cenários) em XLSX — a MESMA matriz do CSV numa
 * planilha, com as larguras de coluna aplicadas. O SheetJS é carregado sob
 * demanda (por isso `async`); se o carregamento falhar, avisa e sugere o CSV em
 * vez de falhar mudo.
 */
export async function exportScenarioComparatorXlsx(
    vm: MultiScenarioComparatorVM,
    nowMs: number = Date.now(),
): Promise<void> {
    const sheetJs = await _ensureSheetJs();
    if (!sheetJs) {
        showToast(
            _tr('scenarios.export.sheetJsMissing', 'Planilha indisponível (SheetJS não carregado) — exporte em CSV'),
            'error',
        );
        return;
    }
    try {
        const spec = buildScenarioComparatorExportSheet(vm);
        const ws = sheetJs.utils.aoa_to_sheet(spec.aoa.map((row) => [...row]));
        // `!cols` é a convenção do SheetJS para largura de coluna (em caracteres).
        ws['!cols'] = spec.columnWidths.map((wch) => ({ wch }));
        const wb = sheetJs.utils.book_new();
        sheetJs.utils.book_append_sheet(wb, ws, spec.sheetName);
        const out = sheetJs.write(wb, { bookType: 'xlsx', type: 'array' });
        _downloadBlob(out, buildScenarioExportFilename('xlsx', nowMs), XLSX_MIME);
        showToast(_tr('scenarios.export.done', 'Comparativo exportado'), 'success');
    } catch (err) {
        console.debug('[scenarioComparatorExport:xlsx]', (err as Error)?.message || err);
        showToast(_tr('scenarios.export.error', 'Falha ao exportar o comparativo'), 'error');
    }
}

/**
 * Exporta o comparativo (Base + N cenários) em Markdown legível — tabela larga
 * que espelha a tela, para colar em relatório/e-mail/PR. Os rótulos saem no
 * idioma da interface; os números são os mesmos do CSV/JSON.
 */
export function exportScenarioComparatorMarkdown(
    vm: MultiScenarioComparatorVM,
    dataSource: 'real' | 'example',
    nowMs: number = Date.now(),
): void {
    try {
        const md = buildScenarioComparatorMarkdown(vm, dataSource, nowMs, {
            title: _tr('scenarios.export.mdTitle', 'Comparativo de cenários — ECBT'),
            dimensionLabels: _markdownDimensionLabels(),
            trendLabels: {
                improves: _tr('scenarios.improve', 'melhora'),
                worsens: _tr('scenarios.worsen', 'piora'),
                neutral: _tr('scenarios.flat', 'neutro'),
                no_data: _tr('scenarios.noData', 'sem dado'),
            },
            noDataLabel: _tr('scenarios.noData', 'sem dado'),
        });
        _downloadBlob(md, buildScenarioExportFilename('md', nowMs), 'text/markdown;charset=utf-8');
        showToast(_tr('scenarios.export.done', 'Comparativo exportado'), 'success');
    } catch (err) {
        console.debug('[scenarioComparatorExport:md]', (err as Error)?.message || err);
        showToast(_tr('scenarios.export.error', 'Falha ao exportar o comparativo'), 'error');
    }
}
