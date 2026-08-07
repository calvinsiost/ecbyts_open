// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT Audit Trail — Exporter wire DOM (SheetJS adapter + download).
 * SPEC_ECBT_SCORE_AUDIT_TRAIL F4b — adapter thin que consome
 * XlsxWorkbookSpec do _auditTrailXlsxBuilderPure e gera XLSX real
 * via SheetJS, dispara download no browser.
 * claude - novaspec, 2026-06-06.
 *
 * Responsabilidades thin:
 *   1. exportAuditTrailToXlsx(vm, options?) — builder + SheetJS encode + download
 *   2. Listener auto-instalado para 'ecbt:audit-trail-export-xlsx'
 *      do ecbtAuditTrailPanel → invoca exportAuditTrailToXlsx
 *   3. Markdown export listener → clipboard API + dispatch sucesso
 *
 * Anti-pattern pixels-over-dom: NÃO faz nada em mount; só responde
 * a CustomEvents dispatchados pelo panel.
 */

import type { AuditTrailVM } from '../../core/ecbtScore/_auditTrailPure.js';
import {
    buildAuditTrailXlsxSpec,
    type XlsxWorkbookSpec,
    type XlsxCellSpec,
} from '../../core/ecbtScore/_auditTrailXlsxBuilderPure.js';
import { yieldToMain } from '../performance/yielding.js';

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export interface ExportOptions {
    readonly today?: string; // YYYY-MM-DD injetável p/ testes
    readonly download?: boolean; // default true; false = retorna Uint8Array sem download
}

export interface ExportResult {
    readonly success: boolean;
    readonly filename: string;
    readonly bytes: number;
    readonly cellCount: number;
    readonly error?: string;
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function isBrowser(): boolean {
    return typeof document !== 'undefined' && document !== null;
}

function colToA1Idx(col: string): number {
    let n = 0;
    for (let i = 0; i < col.length; i++) {
        n = n * 26 + (col.charCodeAt(i) - 64);
    }
    return n - 1; // 0-based
}

function parseA1(a1: string): { col: number; row: number } {
    const m = /^([A-Z]+)(\d+)$/.exec(a1);
    if (!m) return { col: 0, row: 0 };
    return { col: colToA1Idx(m[1]!), row: parseInt(m[2]!, 10) - 1 };
}

/**
 * Converte hex #RRGGBB → RGB sem # (formato SheetJS).
 */
function hexNoPrefix(hex: string): string {
    return hex.replace(/^#/, '').toUpperCase();
}

// ----------------------------------------------------------------
// SHEETJS ENCODER
// ----------------------------------------------------------------

interface SheetJsModule {
    utils: {
        book_new: () => unknown;
        aoa_to_sheet: (rows: unknown[][]) => unknown;
        book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
    };
    write: (wb: unknown, opts: { type: 'array'; bookType: 'xlsx' }) => ArrayBuffer | Uint8Array;
}

/**
 * Encoda XlsxWorkbookSpec → Uint8Array via SheetJS.
 *
 * F17 fix Calvin 2026-06-08 — antes `import('xlsx')` (bare specifier, falha
 * no browser sem bundler com "Failed to resolve module specifier 'xlsx'").
 * Padrão da casa (parser.ts, reportBuilder.ts): `loadScriptCDN` + `window.XLSX`.
 */
async function encodeWithSheetJs(spec: XlsxWorkbookSpec): Promise<Uint8Array> {
    if (!isBrowser()) {
        throw new Error('encodeWithSheetJs requer browser (window.XLSX).');
    }
    const w = window as any;
    if (!w.XLSX) {
        const { loadScriptCDN } = await import('../helpers/cdnLoader.js');
        await loadScriptCDN('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', {
            name: 'SheetJS',
            globalVar: 'XLSX',
        });
    }
    if (!w.XLSX) {
        throw new Error('SheetJS carregou mas window.XLSX não está disponível.');
    }
    const xlsxMod = w.XLSX as SheetJsModule;
    const { utils, write } = xlsxMod;

    const wb = utils.book_new();

    // Encontrar max row/col para dimensionar o array
    let maxRow = 0;
    let maxCol = 0;
    for (const cell of spec.cells) {
        const { col, row } = parseA1(cell.a1);
        if (row > maxRow) maxRow = row;
        if (col > maxCol) maxCol = col;
    }

    // Construir array bidimensional
    const aoa: (string | number | null)[][] = [];
    for (let r = 0; r <= maxRow; r++) {
        aoa.push(new Array(maxCol + 1).fill(null));
    }

    // Para cells com fórmula, SheetJS aoa não suporta diretamente — vamos popular
    // o valor e depois enriquecer o sheet com fórmulas + styles após aoa_to_sheet.
    const cellMap = new Map<string, XlsxCellSpec>();
    for (const cell of spec.cells) {
        const { col, row } = parseA1(cell.a1);
        if (row < 0 || col < 0) continue;
        const aoaRow = aoa[row];
        if (!aoaRow) continue; // row ≤ maxRow por construção; guard defensivo
        aoaRow[col] = typeof cell.value === 'number' || typeof cell.value === 'string' ? cell.value : null;
        cellMap.set(cell.a1, cell);
    }

    const ws = utils.aoa_to_sheet(aoa) as Record<string, unknown>;

    // Enriquecer com fórmulas + estilos (SheetJS edition compatibility)
    for (const [a1, cell] of cellMap.entries()) {
        const wsCell = ws[a1] as Record<string, unknown> | undefined;
        if (!wsCell) continue;
        if (cell.formula) {
            (wsCell as Record<string, unknown>).f = cell.formula.replace(/^=/, '');
        }
        // Styles via 's' (limited support em SheetJS community edition; preservado p/ Pro)
        if (cell.fill || cell.bold || cell.fontName || cell.fontSize) {
            (wsCell as Record<string, unknown>).s = {
                fill: cell.fill ? { fgColor: { rgb: hexNoPrefix(cell.fill) } } : undefined,
                font: {
                    name: cell.fontName ?? 'Calibri',
                    sz: cell.fontSize ?? 11,
                    bold: cell.bold ?? false,
                },
            };
        }
    }

    utils.book_append_sheet(wb, ws, spec.sheetName);

    const buf = write(wb, { type: 'array', bookType: 'xlsx' });
    return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

// ----------------------------------------------------------------
// DOWNLOAD TRIGGER
// ----------------------------------------------------------------

function triggerDownload(bytes: Uint8Array, filename: string): void {
    if (!isBrowser()) return;
    const blob = new Blob([new Uint8Array(bytes)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    void yieldToMain({ priority: 'background', timeoutMs: 0 }).then(() => {
        if (a.parentNode) a.parentNode.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

// ----------------------------------------------------------------
// MAIN EXPORT API
// ----------------------------------------------------------------

export async function exportAuditTrailToXlsx(vm: AuditTrailVM, options?: ExportOptions): Promise<ExportResult> {
    try {
        const spec = buildAuditTrailXlsxSpec(vm, { ...(options?.today ? { today: options.today } : {}) });
        const bytes = await encodeWithSheetJs(spec);
        if (options?.download !== false && isBrowser()) {
            triggerDownload(bytes, spec.filename);
        }
        return Object.freeze({
            success: true,
            filename: spec.filename,
            bytes: bytes.length,
            cellCount: spec.metadata.cellCount,
        });
    } catch (err) {
        const message = (err as Error)?.message ?? String(err);
        return Object.freeze({
            success: false,
            filename: '',
            bytes: 0,
            cellCount: 0,
            error: message,
        });
    }
}

// ----------------------------------------------------------------
// MARKDOWN EXPORT (clipboard)
// ----------------------------------------------------------------

export async function copyAuditTrailMarkdownToClipboard(vm: AuditTrailVM): Promise<boolean> {
    if (!isBrowser()) return false;
    try {
        const mdMod = await import('../../core/ecbtScore/_auditTrailMarkdownPure.js');
        const result = mdMod.buildAuditTrailMarkdown(vm);
        const nav = navigator as Navigator & { clipboard?: { writeText: (s: string) => Promise<void> } };
        if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
            await nav.clipboard.writeText(result.markdown);
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

// ----------------------------------------------------------------
// AUTO-INSTALL LISTENERS (fecha o circuito)
// ----------------------------------------------------------------

let listenersInstalled = false;

export function installEcbtAuditTrailExportListeners(): void {
    if (!isBrowser() || listenersInstalled) return;
    listenersInstalled = true;

    document.addEventListener('ecbt:audit-trail-export-xlsx', async (e) => {
        const detail = (e as CustomEvent).detail as { vm?: AuditTrailVM } | undefined;
        if (!detail || !detail.vm) return;
        const result = await exportAuditTrailToXlsx(detail.vm);
        document.dispatchEvent(new CustomEvent('ecbt:audit-trail-export-xlsx-result', { detail: result }));
    });

    document.addEventListener('ecbt:audit-trail-export-markdown', async (e) => {
        const detail = (e as CustomEvent).detail as { vm?: AuditTrailVM } | undefined;
        if (!detail || !detail.vm) return;
        const success = await copyAuditTrailMarkdownToClipboard(detail.vm);
        document.dispatchEvent(
            new CustomEvent('ecbt:audit-trail-export-markdown-result', { detail: { success } }),
        );
    });
}

// Test-only
export function _resetListenersForTest(): void {
    listenersInstalled = false;
}
